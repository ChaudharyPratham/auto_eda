"""
Streaming Analytics API Routes
================================
Exposes aggregated pipeline metrics, anomaly alerts, API key management,
an event ingest endpoint, and a raw event viewer.

Endpoints
---------
  GET    /stream/metrics              – last N 1-minute windows (optionally filtered by service)
  GET    /stream/latest               – most-recent snapshot + unresolved alerts
  GET    /stream/events               – latest 100 raw events from /ingest
  POST   /stream/ingest               – push an event to Kafka (requires X-API-Key header)
  POST   /stream/api-key              – create a new API key (returns plain key once)
  GET    /stream/api-keys             – list all API keys (hashes hidden)
  DELETE /stream/api-key/{id}         – deactivate an API key
"""

import hashlib
import json
import logging
import os
import secrets
from datetime import datetime, timezone
from typing import Optional

import psycopg2
import psycopg2.extras
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from utils.response_utils import success_response

logger = logging.getLogger(__name__)
router = APIRouter()

VALID_LEVELS = {"INFO", "WARNING", "ERROR"}


# ── DB helper ─────────────────────────────────────────────────────────────────

def _get_conn():
    """Open a PostgreSQL connection using DATABASE_URL, or return None."""
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        return None
    try:
        return psycopg2.connect(url)
    except Exception as exc:
        logger.warning("Streaming DB connection failed: %s", exc)
        return None


# ── API key helpers ───────────────────────────────────────────────────────────

def _hash_key(key: str) -> str:
    """
    Return the SHA-256 hex digest of the plain-text key.
    Only the hash is stored in the database — the plain key is never persisted,
    so a database leak cannot expose usable keys.
    """
    return hashlib.sha256(key.encode()).hexdigest()


def _validate_api_key(raw_key: str | None, conn) -> bool:
    """
    Check that `raw_key` (from the X-API-Key request header) matches an
    active row in stream_api_keys.

    How it works
    ------------
    1. Hash the provided key with SHA-256.
    2. Query the DB for a row where key_hash = <hash> AND is_active = TRUE.
    3. Return True only if exactly one such row exists.

    Timing-safe: string comparison happens inside PostgreSQL, not in Python,
    so there is no timing-attack surface from Python string equality.
    """
    if not raw_key:
        return False
    h = _hash_key(raw_key)
    cur = conn.cursor()
    cur.execute(
        "SELECT 1 FROM stream_api_keys WHERE key_hash = %s AND is_active = TRUE",
        (h,),
    )
    valid = cur.fetchone() is not None
    cur.close()
    return valid


# ── Lazy Kafka producer ───────────────────────────────────────────────────────

_kafka_producer = None


def _get_kafka_producer():
    """
    Return a module-level singleton KafkaProducer, creating it on first call.

    Why a singleton?
    ----------------
    Creating a KafkaProducer is expensive (TCP handshake, metadata fetch).
    Reusing one across requests saves ~100-200 ms per ingest call.

    Why return None instead of raising?
    ------------------------------------
    The ingest endpoint stores the event in PostgreSQL first (the source of
    truth), then publishes to Kafka as a best-effort step.  If Kafka is down
    the event is still persisted and visible in the dashboard; the Kafka
    publish failure is logged as a warning rather than a 5xx response.
    """
    global _kafka_producer
    if _kafka_producer is not None:
        return _kafka_producer
    try:
        from kafka import KafkaProducer  # noqa: PLC0415
        bootstrap = os.getenv("KAFKA_BOOTSTRAP", "localhost:9092")
        _kafka_producer = KafkaProducer(
            bootstrap_servers=[bootstrap],
            value_serializer=lambda v: json.dumps(v).encode(),
        )
        logger.info("Kafka producer connected to %s", bootstrap)
        return _kafka_producer
    except Exception as exc:
        logger.warning("Kafka producer unavailable: %s", exc)
        return None


# ── Pydantic models ───────────────────────────────────────────────────────────

class IngestEvent(BaseModel):
    service: str
    level: str
    response_time: int
    timestamp: Optional[str] = None


class NewApiKey(BaseModel):
    name: str


# ── Metrics ───────────────────────────────────────────────────────────────────

@router.get("/stream/metrics")
def get_stream_metrics(limit: int = 60, service: Optional[str] = None):
    """
    Return the last `limit` aggregation windows in ascending time order.

    If `service` is provided, windows are computed from stream_events
    (REST-ingested events only, grouped by minute).
    Without `service`, uses the full stream_metrics table (Spark consumer output).
    """
    conn = _get_conn()
    if conn is None:
        return success_response([], "Database not configured or unavailable")

    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    if service:
        cur.execute(
            """
            SELECT
                date_trunc('minute', received_at)                           AS window_start,
                date_trunc('minute', received_at) + INTERVAL '1 minute'    AS window_end,
                COUNT(*)                                                    AS total_requests,
                SUM(CASE WHEN level = 'ERROR' THEN 1 ELSE 0 END)           AS error_count,
                COALESCE(AVG(response_time), 0)                             AS avg_response_time,
                100.0 * SUM(CASE WHEN level = 'ERROR' THEN 1 ELSE 0 END)
                      / NULLIF(COUNT(*), 0)                                 AS error_rate
            FROM  stream_events
            WHERE service = %s
            GROUP BY date_trunc('minute', received_at)
            ORDER BY window_start DESC
            LIMIT %s
            """,
            (service, limit),
        )
    else:
        cur.execute(
            """
            SELECT id, window_start, window_end,
                   total_requests, error_count,
                   avg_response_time, error_rate
            FROM   stream_metrics
            ORDER  BY window_start DESC
            LIMIT  %s
            """,
            (limit,),
        )

    rows = [dict(r) for r in cur.fetchall()]
    cur.close()
    conn.close()

    return success_response(list(reversed(rows)), "ok")


# ── Latest snapshot ───────────────────────────────────────────────────────────

@router.get("/stream/latest")
def get_stream_latest():
    """Return the single most-recent metric window and all unresolved alerts."""
    conn = _get_conn()
    if conn is None:
        return success_response(
            {"latest": None, "alerts": []},
            "Database not configured or unavailable",
        )

    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute(
        """
        SELECT id, window_start, window_end,
               total_requests, error_count,
               avg_response_time, error_rate
        FROM   stream_metrics
        ORDER  BY window_start DESC
        LIMIT  1
        """
    )
    latest = cur.fetchone()

    cur.execute(
        """
        SELECT id, created_at, alert_type, message, value
        FROM   stream_alerts
        WHERE  resolved = FALSE
        ORDER  BY created_at DESC
        LIMIT  10
        """
    )
    alerts = [dict(r) for r in cur.fetchall()]

    cur.close()
    conn.close()

    return success_response(
        {"latest": dict(latest) if latest else None, "alerts": alerts},
        "ok",
    )


# ── Raw events viewer ─────────────────────────────────────────────────────────

@router.get("/stream/events")
def get_stream_events(limit: int = 100, service: Optional[str] = None):
    """Return the latest raw events received via /ingest, newest first."""
    conn = _get_conn()
    if conn is None:
        return success_response([], "Database not configured or unavailable")

    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    if service:
        cur.execute(
            """
            SELECT id, received_at, service, level, response_time
            FROM   stream_events
            WHERE  service = %s
            ORDER  BY received_at DESC
            LIMIT  %s
            """,
            (service, limit),
        )
    else:
        cur.execute(
            """
            SELECT id, received_at, service, level, response_time
            FROM   stream_events
            ORDER  BY received_at DESC
            LIMIT  %s
            """,
            (limit,),
        )

    rows = [dict(r) for r in cur.fetchall()]
    cur.close()
    conn.close()
    return success_response(rows, "ok")


# ── Event ingest ──────────────────────────────────────────────────────────────

@router.post("/stream/ingest")
def ingest_event(
    event: IngestEvent,
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
):
    """
    Accept a single log event from an external application.

    Flow
    ----
    1. Open a DB connection (fail-fast with 503 if unavailable).
    2. Validate the X-API-Key header against stream_api_keys.
    3. Normalise and validate the event fields (level uppercase, size checks).
    4. INSERT the event into stream_events (permanent record, visible in dashboard).
    5. Publish the same event to the Kafka 'logs' topic (best-effort).
       If Kafka is down the event is still stored in DB — the publish failure
       is only logged, not surfaced as an error to the caller.
    6. Return the normalised event back to the caller as confirmation.

    Security notes
    --------------
    - API key is validated against a SHA-256 hash — plain key never touches the DB.
    - service and level are validated/sanitised before insertion.
    - response_time must be non-negative (rejects nonsensical values).
    """
    conn = _get_conn()
    if conn is None:
        raise HTTPException(503, "Database not configured or unavailable")

    if not _validate_api_key(x_api_key, conn):
        conn.close()
        raise HTTPException(401, "Invalid or missing X-API-Key header")

    level = event.level.upper()
    if level not in VALID_LEVELS:
        conn.close()
        raise HTTPException(400, f"level must be one of {sorted(VALID_LEVELS)}")

    if len(event.service) > 50:
        conn.close()
        raise HTTPException(400, "service name too long (max 50 chars)")

    if event.response_time < 0:
        conn.close()
        raise HTTPException(400, "response_time must be non-negative")

    ts = event.timestamp or datetime.now(timezone.utc).isoformat()

    # Persist to stream_events
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO stream_events (received_at, service, level, response_time)
        VALUES (%s, %s, %s, %s)
        """,
        (ts, event.service, level, event.response_time),
    )
    conn.commit()
    cur.close()
    conn.close()

    # Publish to Kafka (best-effort — don't fail the request if Kafka is down)
    producer = _get_kafka_producer()
    if producer:
        try:
            producer.send(
                "logs",
                {
                    "timestamp": ts,
                    "service": event.service,
                    "level": level,
                    "response_time": event.response_time,
                },
            )
        except Exception as exc:
            logger.warning("Kafka publish failed (event still stored in DB): %s", exc)

    return success_response(
        {"service": event.service, "level": level, "timestamp": ts},
        "Event ingested successfully",
    )


# ── API key management ────────────────────────────────────────────────────────

@router.post("/stream/api-key")
def create_api_key(body: NewApiKey):
    """
    Generate a new secure API key.
    Returns the plain-text key exactly once — it is NOT stored and cannot be
    recovered. The SHA-256 hash is persisted in stream_api_keys.
    """
    if not body.name or not body.name.strip():
        raise HTTPException(400, "name is required")

    plain_key = secrets.token_urlsafe(32)
    key_hash  = _hash_key(plain_key)

    conn = _get_conn()
    if conn is None:
        raise HTTPException(503, "Database not configured or unavailable")

    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """
        INSERT INTO stream_api_keys (key_hash, name)
        VALUES (%s, %s)
        RETURNING id, name, created_at
        """,
        (key_hash, body.name.strip()),
    )
    row = dict(cur.fetchone())
    conn.commit()
    cur.close()
    conn.close()

    return success_response(
        {**row, "key": plain_key},
        "API key created. Copy it now — it will not be shown again.",
    )


@router.get("/stream/api-keys")
def list_api_keys():
    """Return all API keys (name, created_at, is_active). Hash is never returned."""
    conn = _get_conn()
    if conn is None:
        return success_response([], "Database not configured or unavailable")

    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """
        SELECT id, name, created_at, is_active
        FROM   stream_api_keys
        ORDER  BY created_at DESC
        """
    )
    rows = [dict(r) for r in cur.fetchall()]
    cur.close()
    conn.close()
    return success_response(rows, "ok")


@router.delete("/stream/api-key/{key_id}")
def delete_api_key(key_id: int):
    """Soft-delete an API key by setting is_active = FALSE."""
    conn = _get_conn()
    if conn is None:
        raise HTTPException(503, "Database not configured or unavailable")

    cur = conn.cursor()
    cur.execute(
        "UPDATE stream_api_keys SET is_active = FALSE WHERE id = %s",
        (key_id,),
    )
    updated = cur.rowcount
    conn.commit()
    cur.close()
    conn.close()

    if updated == 0:
        raise HTTPException(404, "API key not found")

    return success_response({"id": key_id}, "API key revoked")



def _get_conn():
    """Open a PostgreSQL connection using DATABASE_URL, or return None."""
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        return None
    try:
        return psycopg2.connect(url)
    except Exception as exc:
        logger.warning("Streaming DB connection failed: %s", exc)
        return None


@router.get("/stream/metrics")
def get_stream_metrics(limit: int = 60):
    """
    Return the last `limit` aggregation windows in ascending time order.
    Default limit=60 gives ~1 hour of 1-minute buckets.
    Used by the frontend line charts.
    """
    conn = _get_conn()
    if conn is None:
        return success_response([], "Database not configured or unavailable")

    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """
        SELECT id, window_start, window_end,
               total_requests, error_count,
               avg_response_time, error_rate
        FROM   stream_metrics
        ORDER  BY window_start DESC
        LIMIT  %s
        """,
        (limit,),
    )
    rows = [dict(r) for r in cur.fetchall()]
    cur.close()
    conn.close()

    # Reverse so the chart x-axis goes oldest → newest (left → right)
    return success_response(list(reversed(rows)), "ok")


@router.get("/stream/latest")
def get_stream_latest():
    """
    Return the single most-recent metric window and all unresolved alerts.
    Polled every 5 seconds by the frontend dashboard for live KPI cards.
    """
    conn = _get_conn()
    if conn is None:
        return success_response(
            {"latest": None, "alerts": []},
            "Database not configured or unavailable",
        )

    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Most recent metric window
    cur.execute(
        """
        SELECT id, window_start, window_end,
               total_requests, error_count,
               avg_response_time, error_rate
        FROM   stream_metrics
        ORDER  BY window_start DESC
        LIMIT  1
        """
    )
    latest = cur.fetchone()

    # Active (unresolved) alerts — newest first, max 10
    cur.execute(
        """
        SELECT id, created_at, alert_type, message, value
        FROM   stream_alerts
        WHERE  resolved = FALSE
        ORDER  BY created_at DESC
        LIMIT  10
        """
    )
    alerts = [dict(r) for r in cur.fetchall()]

    cur.close()
    conn.close()

    return success_response(
        {"latest": dict(latest) if latest else None, "alerts": alerts},
        "ok",
    )
