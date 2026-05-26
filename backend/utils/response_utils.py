"""
Response Utilities
------------------
Standardized JSON response envelopes for all API endpoints.
"""

from typing import Any


def success_response(data: Any, message: str = "Success") -> dict:
    """Wrap data in a standard success envelope."""
    return {
        "status": "success",
        "message": message,
        "data": data,
    }


def error_response(message: str) -> dict:
    """Wrap an error message in a standard error envelope."""
    return {
        "status": "error",
        "message": message,
        "data": None,
    }
