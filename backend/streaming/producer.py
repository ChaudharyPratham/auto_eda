"""
Log Producer
============
Generates synthetic service logs and publishes them to the Kafka topic 'logs'.
Runs forever as a background Docker service.

Each message looks like:
  {"timestamp": "2026-06-01T12:00:00", "service": "api",
   "level": "INFO", "response_time": 120}
"""

import json
import os
import random
import time
from datetime import datetime

from kafka import KafkaProducer
from kafka.errors import NoBrokersAvailable

# ── Config (override via environment variables) ───────────────────────────────
KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP", "kafka:9092")
TOPIC           = "logs"

# Five mock microservices
SERVICES = ["api", "auth", "payment", "parking", "sensor"]

# Weighted log level distribution: ~70% INFO, 20% WARNING, 10% ERROR
LEVELS  = ["INFO",  "WARNING", "ERROR"]
WEIGHTS = [70,      20,        10]


def generate_log() -> dict:
    """
    Build a single mock log entry.

    Uses weighted random selection so the distribution matches a realistic
    production service: mostly INFO, some WARNING, occasional ERROR.
    ERROR entries are given a higher response_time (800–3000 ms) so they
    also trigger the HIGH_RESPONSE_TIME anomaly alert in the consumer.

    Returns a dict that is JSON-serialised by KafkaProducer's
    value_serializer before it hits the wire.
    """
    # Pick a level according to the configured probability weights
    level = random.choices(LEVELS, weights=WEIGHTS)[0]

    # Simulate realistic latency: errors take much longer than normal requests
    if level == "ERROR":
        response_time = random.randint(800, 3000)   # slow — likely to breach 1 s threshold
    else:
        response_time = random.randint(10, 500)     # fast — normal healthy request

    return {
        "timestamp":     datetime.utcnow().isoformat(),  # ISO-8601 UTC, parsed by Spark
        "service":       random.choice(SERVICES),         # which microservice emitted this log
        "level":         level,
        "response_time": response_time,                   # milliseconds
    }


def main():
    """
    Entry point.

    1. Connect to Kafka with retries (Kafka takes ~10-20 s to start in Docker).
    2. Loop forever, generating one mock log every 0.5 s (= 2 msg/s).

    How it connects
    ---------------
    KafkaProducer is synchronous — send() puts the message in an internal
    buffer and a background thread flushes it to the broker.  The
    value_serializer converts the Python dict to JSON bytes automatically.

    Why retries?
    ------------
    In docker-compose, this container starts at the same time as Kafka.
    Kafka needs ~10-20 seconds before it accepts connections, so we retry
    every 5 s up to 20 times (= 100 s total grace period).
    """
    # Retry loop — Kafka may not be ready immediately after docker-compose up
    producer = None
    for attempt in range(20):
        try:
            producer = KafkaProducer(
                bootstrap_servers=KAFKA_BOOTSTRAP,
                # Serialize each dict → UTF-8 JSON bytes before sending to Kafka
                value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            )
            print(f"[producer] Connected to Kafka at {KAFKA_BOOTSTRAP}")
            break
        except NoBrokersAvailable:
            # Kafka broker is not yet accepting connections — wait and retry
            print(f"[producer] Kafka not ready, retrying ({attempt + 1}/20)…")
            time.sleep(5)

    if producer is None:
        print("[producer] Could not connect to Kafka. Exiting.")
        return

    print(f"[producer] Publishing to topic '{TOPIC}' at ~2 msg/s")
    while True:
        log = generate_log()
        # producer.send() is non-blocking — the internal sender thread handles delivery
        producer.send(TOPIC, log)
        print(
            f"[producer] {log['timestamp']} | {log['service']:<8} "
            f"| {log['level']:<7} | {log['response_time']}ms"
        )
        time.sleep(0.5)  # 0.5 s pause → ~2 messages per second


if __name__ == "__main__":
    main()
