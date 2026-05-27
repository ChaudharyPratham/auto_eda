"""
API Key Utilities
-----------------
Each uploaded dataset gets its own unique API key returned at upload time.
The key is stored as a SHA-256 hash so the plain text is never persisted.

Usage
-----
  plain_key = generate_and_store_key(file_id)   # call once at upload
  is_valid  = verify_key(file_id, provided_key)  # call on every /api/data request
"""

import hashlib
import secrets
from pathlib import Path

KEYS_DIR = Path("uploads") / ".keys"


def _key_path(file_id: str) -> Path:
    return KEYS_DIR / f"{file_id}.key"


def _hash(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def generate_and_store_key(file_id: str) -> str:
    """
    Generate a cryptographically random API key, persist its hash, and
    return the plain-text key (shown to the user exactly once).
    """
    KEYS_DIR.mkdir(parents=True, exist_ok=True)
    plain = secrets.token_urlsafe(32)
    _key_path(file_id).write_text(_hash(plain))
    return plain


def verify_key(file_id: str, provided: str | None) -> bool:
    """
    Return True if `provided` matches the stored key for `file_id`.
    If no key file exists (legacy upload or DB-only flow), returns True
    so backward compatibility is maintained.
    """
    kp = _key_path(file_id)
    if not kp.exists():
        return True          # no key on file → open access (legacy)
    if not provided:
        return False
    return _hash(provided) == kp.read_text().strip()
