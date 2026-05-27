"""
Upload Route
------------
Accepts a dataset file from the user, validates it, saves it to disk,
and returns a unique file_id used for all subsequent API calls.
"""

import os
import uuid
import shutil
from fastapi import APIRouter, UploadFile, File, HTTPException

from utils.file_utils import validate_file_extension, get_file_size_mb
from utils.response_utils import success_response

router = APIRouter()

ALLOWED_EXTENSIONS = {".csv", ".json", ".xlsx", ".xls", ".txt", ".parquet", ".ipynb", ".avro"}
MAX_SIZE_MB = int(os.getenv("MAX_UPLOAD_SIZE_MB", "500"))


@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """
    Upload a dataset file.

    - Validates file extension
    - Saves file to `uploads/` with a UUID-based name
    - Returns `file_id` used for analysis, cleaning, and download
    """
    # Validate extension
    if not validate_file_extension(file.filename, ALLOWED_EXTENSIONS):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    # Build a unique save path (preserve extension)
    file_id = str(uuid.uuid4())
    ext = os.path.splitext(file.filename)[1].lower()
    save_path = os.path.join("uploads", f"{file_id}{ext}")

    # Stream file to disk
    try:
        with open(save_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {exc}") from exc

    # Check size AFTER saving (avoids loading entire file into memory first)
    size_mb = get_file_size_mb(save_path)
    if size_mb > MAX_SIZE_MB:
        os.remove(save_path)
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({size_mb:.1f} MB). Maximum allowed: {MAX_SIZE_MB} MB",
        )

    engine = "spark" if size_mb >= 100 else "pandas"

    return success_response(
        {
            "file_id": file_id,
            "filename": file.filename,
            "size_mb": round(size_mb, 2),
            "extension": ext,
            "engine": engine,
        },
        message="File uploaded successfully",
    )
