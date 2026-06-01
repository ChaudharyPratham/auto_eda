"""
Spark Structured Streaming Consumer
=====================================
Reads log messages from Kafka, aggregates them over 1-minute tumbling windows,
writes results to PostgreSQL (stream_metrics), and creates alert records when
anomaly thresholds are exceeded.

Anomaly rules
-------------
  error_rate       > 30 %    → HIGH_ERROR_RATE alert
  avg_response_time > 1000 ms → HIGH_RESPONSE_TIME alert
"""

import os
import time
from datetime import datetime

import psycopg2
from pyspark.sql import SparkSession
from pyspark.sql.functions import avg, col, count, expr, from_json, when, window
from pyspark.sql.types import IntegerType, StringType, StructField, StructType

# ── Config ────────────────────────────────────────────────────────────────────
KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP", "kafka:9092")
DATABASE_URL    = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@postgres:5432/autoeda")
TOPIC           = "logs"

# ── Windows fix: PySpark needs winutils.exe to access the local filesystem ───
# Download winutils from https://github.com/cdarlint/winutils and place in C:\hadoop\bin
_hadoop_home = os.getenv("HADOOP_HOME", r"C:\hadoop")
os.environ["HADOOP_HOME"] = _hadoop_home
os.environ["PATH"] = os.environ["PATH"] + os.pathsep + os.path.join(_hadoop_home, "bin")

# JSON schema that matches the messages produced by producer.py
LOG_SCHEMA = StructType([
    StructField("timestamp",     StringType(),  nullable=True),
    StructField("service",       StringType(),  nullable=True),
    StructField("level",         StringType(),  nullable=True),
    StructField("response_time", IntegerType(), nullable=True),
])


# ── Micro-batch writer ────────────────────────────────────────────────────────

def write_batch(df, epoch_id):
    """
    Spark foreachBatch callback — called once per micro-batch trigger (every 30 s).

    Parameters
    ----------
    df        : Spark DataFrame holding all aggregated windows computed so far.
                In 'complete' output mode Spark re-emits EVERY window each trigger,
                not just new ones — this is why we UPSERT (ON CONFLICT ... DO UPDATE)
                rather than plain INSERT.
    epoch_id  : Monotonically increasing integer Spark uses for exactly-once
                guarantees.  We log it but don't use it for deduplication because
                the ON CONFLICT clause handles that at the DB level.

    Flow
    ----
    1. Collect all rows from the Spark executor to the driver (list of Row objects).
    2. Open a psycopg2 connection to PostgreSQL.
    3. For each row: UPSERT into stream_metrics, then conditionally INSERT alert.
    4. Commit once after all rows — single transaction per batch.
    """
    rows = df.collect()
    if not rows:
        return

    conn = psycopg2.connect(DATABASE_URL)
    cur  = conn.cursor()

    for row in rows:
        # ── Upsert metric row ────────────────────────────────────────────────
        cur.execute(
            """
            INSERT INTO stream_metrics
                (window_start, window_end, total_requests,
                 error_count, avg_response_time, error_rate)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (window_start) DO UPDATE SET
                window_end        = EXCLUDED.window_end,
                total_requests    = EXCLUDED.total_requests,
                error_count       = EXCLUDED.error_count,
                avg_response_time = EXCLUDED.avg_response_time,
                error_rate        = EXCLUDED.error_rate
            """,
            (
                row.window_start,
                row.window_end,
                int(row.total_requests),
                int(row.error_count),
                round(float(row.avg_response_time), 2),
                round(float(row.error_rate), 2),
            ),
        )

        # ── Anomaly: error rate > 30 % ───────────────────────────────────────
        if row.error_rate > 30.0:
            cur.execute(
                """
                INSERT INTO stream_alerts (created_at, alert_type, message, value)
                VALUES (%s, 'HIGH_ERROR_RATE', %s, %s)
                """,
                (
                    datetime.utcnow(),
                    f"Error rate {row.error_rate:.1f}% exceeds 30% threshold "
                    f"(window {row.window_start} – {row.window_end})",
                    float(row.error_rate),
                ),
            )

        # ── Anomaly: avg response time > 1000 ms ─────────────────────────────
        if row.avg_response_time > 1000:
            cur.execute(
                """
                INSERT INTO stream_alerts (created_at, alert_type, message, value)
                VALUES (%s, 'HIGH_RESPONSE_TIME', %s, %s)
                """,
                (
                    datetime.utcnow(),
                    f"Avg response time {row.avg_response_time:.0f}ms exceeds "
                    f"1000ms threshold (window {row.window_start} – {row.window_end})",
                    float(row.avg_response_time),
                ),
            )

    conn.commit()
    cur.close()
    conn.close()
    print(f"[consumer] epoch={epoch_id}: persisted {len(rows)} window(s)")


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    # Give Kafka + Postgres a moment to fully start inside Docker
    print("[consumer] Waiting 20 s for Kafka and Postgres to be ready…")
    time.sleep(20)

    # Initialise the streaming tables (idempotent)
    from init_tables import init_streaming_tables
    init_streaming_tables()

    # Build a Spark session; the Kafka connector jar is downloaded automatically
    spark = (
        SparkSession.builder
        .appName("AutoEDA-StreamingConsumer")
        .config(
            "spark.jars.packages",
            "org.apache.spark:spark-sql-kafka-0-10_2.12:3.5.1",
        )
        # Use a Windows-safe checkpoint path (avoid /tmp which maps via Hadoop native IO)
        .config("spark.sql.streaming.checkpointLocation",
                os.path.join(os.environ.get("TEMP", r"C:\Temp"), "autoeda-checkpoint"))
        .getOrCreate()
    )
    spark.sparkContext.setLogLevel("WARN")

    # ── Read raw bytes from Kafka ─────────────────────────────────────────────
    raw = (
        spark.readStream
        .format("kafka")
        .option("kafka.bootstrap.servers", KAFKA_BOOTSTRAP)
        .option("subscribe", TOPIC)
        .option("startingOffsets", "latest")
        .load()
    )

    # ── Parse JSON payload ────────────────────────────────────────────────────
    logs = (
        raw
        .select(from_json(col("value").cast("string"), LOG_SCHEMA).alias("d"))
        .select("d.*")
        .withColumn("ts", col("timestamp").cast("timestamp"))
    )

    # ── 1-minute tumbling window aggregation ─────────────────────────────────
    # window(col("ts"), "1 minute") groups events into non-overlapping 1-minute
    # buckets aligned to clock minutes (e.g. 12:00–12:01, 12:01–12:02, …).
    # Using outputMode="complete" means each trigger re-computes ALL windows
    # seen so far — necessary because late-arriving Kafka messages can change
    # counts in already-emitted windows.
    agg = (
        logs
        .groupBy(window(col("ts"), "1 minute"))   # bucket events by minute
        .agg(
            count("*").alias("total_requests"),                            # total events in window
            count(when(col("level") == "ERROR", 1)).alias("error_count"),  # count only ERROR rows
            avg("response_time").alias("avg_response_time"),               # mean latency in ms
        )
        # Compute error_rate as a percentage: (errors / total) * 100
        .withColumn("error_rate", expr("(error_count / total_requests) * 100"))
        # Flatten the window struct {start, end} into plain timestamp columns
        .withColumn("window_start", col("window.start"))
        .withColumn("window_end",   col("window.end"))
        .drop("window")   # remove the original struct column
    )

    # ── Write each micro-batch to PostgreSQL ──────────────────────────────────
    # outputMode="complete" → every trigger sends ALL windows (not just new ones).
    # This is required when using window() aggregation so late data can update
    # previously emitted windows.  The write_batch function handles upserts.
    #
    # trigger(processingTime="30 seconds") → Spark waits 30 s between batches.
    # Lower values give more up-to-date results but increase DB write frequency.
    query = (
        agg.writeStream
        .outputMode("complete")           # re-emit all windows each trigger (see above)
        .foreachBatch(write_batch)         # call our custom PostgreSQL writer
        .trigger(processingTime="30 seconds")  # run aggregation every 30 s
        .start()
    )

    print("[consumer] Streaming query running. Ctrl-C to stop.")
    query.awaitTermination()


if __name__ == "__main__":
    main()
