"""
Multi-File Folder Routes
Accepts a folder of data files, combines them into a single dataset,
and returns a file_id compatible with all existing analysis routes.
"""

import uuid
from pathlib import Path
from typing import List

from fastapi import APIRouter, File, HTTPException, UploadFile

from services import multi_service
from utils.response_utils import success_response

router = APIRouter()

UPLOAD_DIR = Path("uploads")
TEMP_DIR = UPLOAD_DIR / "_multi_temp"


@router.post("/multi/upload")
async def upload_data_folder(files: List[UploadFile] = File(...)):
    """
    Accept multiple data files (from a folder picker), save them temporarily,
    combine into one DataFrame, and return a single file_id for the normal
    analysis/cleaning/visualization pipeline.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files received.")

    # Write files to a temp staging folder
    temp_id = str(uuid.uuid4())
    staging = TEMP_DIR / temp_id
    staging.mkdir(parents=True, exist_ok=True)

    saved = 0
    for f in files:
        # Preserve relative path for schema-grouped subfolders
        rel = Path(f.filename.lstrip("/").lstrip("\\"))
        dest = (staging / rel).resolve()
        # Security: reject path-traversal attempts
        if not str(dest).startswith(str(staging.resolve())):
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        content = await f.read()
        dest.write_bytes(content)
        saved += 1

    if saved == 0:
        raise HTTPException(status_code=400, detail="No files could be saved.")

    try:
        result = multi_service.process_folder(str(staging), str(UPLOAD_DIR))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    finally:
        # Clean up the staging area
        import shutil
        shutil.rmtree(staging, ignore_errors=True)

    return success_response(
        message=f"Loaded {result['total']} files separately",
        data=result,
    )
