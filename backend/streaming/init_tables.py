"""
Streaming table initialiser.
Creates all streaming tables in PostgreSQL if they don't exist.
Called at the start of spark_consumer.py (idempotent — safe to run multiple times).

Tables
------
  stream_metrics   – 1-minute aggregation windows (written by Spark consumer)
  stream_alerts    – anomaly alerts (written by Spark consumer)
  stream_api_keys  – API keys for the /ingest endpoint
  stream_events    – raw events received via POST /api/stream/ingest
"""

import os
import time

import psycopg2

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@postgres:5432/autoeda",
)

# stream_metrics: one row per 1-minute aggregation window.
# UNIQUE (window_start) enables the ON CONFLICT upsert in spark_consumer.py
CREATE_STREAM_METRICS = """
CREATE TABLE IF NOT EXISTS stream_metrics (
    id                SERIAL    PRIMARY KEY,
    window_start      TIMESTAMP NOT NULL UNIQUE,
    window_end        TIMESTAMP NOT NULL,
    total_requests    INTEGER   NOT NULL,
    error_count       INTEGER   NOT NULL,
    avg_response_time FLOAT     NOT NULL,
    error_rate        FLOAT     NOT NULL
);
"""

# stream_alerts: one row per detected anomaly.
# resolved=FALSE means the alert is still active on the dashboard.
CREATE_STREAM_ALERTS = """
CREATE TABLE IF NOT EXISTS stream_alerts (
    id          SERIAL      PRIMARY KEY,
    created_at  TIMESTAMP   NOT NULL DEFAULT NOW(),
    alert_type  VARCHAR(50) NOT NULL,
    message     TEXT        NOT NULL,
    value       FLOAT,
    resolved    BOOLEAN     NOT NULL DEFAULT FALSE
);
"""

# stream_api_keys: API keys for external applications to send events via /ingest.
# Only the SHA-256 hash is stored; the plain key is shown once at creation.
CREATE_STREAM_API_KEYS = """
CREATE TABLE IF NOT EXISTS stream_api_keys (
    id         SERIAL       PRIMARY KEY,
    key_hash   CHAR(64)     NOT NULL UNIQUE,
    name       VARCHAR(100) NOT NULL,
    created_at TIMESTAMP    NOT NULL DEFAULT NOW(),
    is_active  BOOLEAN      NOT NULL DEFAULT TRUE
);
"""

# stream_events: raw log events received via POST /api/stream/ingest.
# Enables per-service filtering and the raw event viewer on the dashboard.
CREATE_STREAM_EVENTS = """
CREATE TABLE IF NOT EXISTS stream_events (
    id            SERIAL      PRIMARY KEY,
    received_at   TIMESTAMP   NOT NULL DEFAULT NOW(),
    service       VARCHAR(50),
    level         VARCHAR(20),
    response_time INTEGER
);
"""


def init_streaming_tables(url: str = DATABASE_URL, retries: int = 12) -> None:
    """Connect to PostgreSQL and create all streaming tables (idempotent)."""
    for attempt in range(retries):
        try:
            conn = psycopg2.connect(url)
            cur  = conn.cursor()
            cur.execute(CREATE_STREAM_METRICS)
            cur.execute(CREATE_STREAM_ALERTS)
            cur.execute(CREATE_STREAM_API_KEYS)
            cur.execute(CREATE_STREAM_EVENTS)
            conn.commit()
            cur.close()
            conn.close()
            print("[init_tables] stream_metrics, stream_alerts, stream_api_keys, stream_events are ready.")
            return
        except Exception as exc:
            print(f"[init_tables] DB not ready ({exc}), retry {attempt + 1}/{retries}…")
            time.sleep(5)

    print("[init_tables] WARNING: could not create streaming tables after retries.")


if __name__ == "__main__":
    init_streaming_tables()
