"""SQLAlchemy ORM models."""

import uuid
from datetime import datetime

try:
    from sqlalchemy import Column, String, Float, Integer, Boolean, DateTime, Text
    from sqlalchemy.dialects.postgresql import UUID as PG_UUID
    from sqlalchemy.orm import DeclarativeBase

    class Base(DeclarativeBase):
        pass

    class Dataset(Base):
        __tablename__ = "datasets"

        id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
        filename = Column(String(512), nullable=False)
        source = Column(String(64), default="upload")   # upload | cloud | folder
        cloud_provider = Column(String(32), nullable=True)  # azure | aws | gcp | databricks
        file_format = Column(String(32), nullable=True)
        size_mb = Column(Float, nullable=True)
        row_count = Column(Integer, nullable=True)
        col_count = Column(Integer, nullable=True)
        engine_used = Column(String(16), default="pandas")  # pandas | spark
        is_cleaned = Column(Boolean, default=False)
        uploaded_at = Column(DateTime, default=datetime.utcnow)
        cleaned_at = Column(DateTime, nullable=True)
        notes = Column(Text, nullable=True)

    class StreamMetric(Base):
        """Aggregated 1-minute window written by Spark Structured Streaming."""
        __tablename__ = "stream_metrics"

        id                = Column(Integer, primary_key=True, autoincrement=True)
        window_start      = Column(DateTime, nullable=False, unique=True)
        window_end        = Column(DateTime, nullable=False)
        total_requests    = Column(Integer, nullable=False)
        error_count       = Column(Integer, nullable=False)
        avg_response_time = Column(Float, nullable=False)
        error_rate        = Column(Float, nullable=False)

    class StreamAlert(Base):
        """Anomaly alert created when error_rate > 20% or avg_response_time > 1000ms."""
        __tablename__ = "stream_alerts"

        id         = Column(Integer, primary_key=True, autoincrement=True)
        created_at = Column(DateTime, default=datetime.utcnow)
        alert_type = Column(String(50), nullable=False)
        message    = Column(Text, nullable=False)
        value      = Column(Float, nullable=True)
        resolved   = Column(Boolean, default=False)

except ImportError:
    # SQLAlchemy not installed – define stubs so imports don't fail
    Base = object  # type: ignore
    Dataset = None  # type: ignore
    StreamMetric = None  # type: ignore
    StreamAlert = None   # type: ignore
