"""Database engine and session management. Gracefully no-ops when DATABASE_URL is not set."""

import os
import logging

logger = logging.getLogger(__name__)

engine = None
SessionLocal = None


def init_db():
    """Initialize the database engine and create all tables. Call once at startup."""
    global engine, SessionLocal
    db_url = os.getenv("DATABASE_URL", "").strip()
    if not db_url:
        logger.info("DATABASE_URL not set – skipping database initialisation.")
        return

    try:
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        from db.models import Base

        engine = create_engine(db_url, pool_pre_ping=True, echo=False)
        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
        Base.metadata.create_all(bind=engine)
        logger.info("Database connected and tables created.")
    except Exception as exc:
        logger.warning("Database init failed (continuing without DB): %s", exc)
        engine = None
        SessionLocal = None


def get_db():
    """FastAPI dependency – yields a DB session or None if DB not configured."""
    if SessionLocal is None:
        yield None
        return
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
