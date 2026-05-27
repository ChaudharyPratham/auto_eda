"""
Multi-File Folder Routes
Accepts a folder of data files and processes them either:
  - mode=separate  → each file gets its own file_id (MultiDashboard)
  - mode=combined  → staging layer + fuzzy mapping + 3NF → single file_id (Dashboard)
"""

import shutil
import uuid
from pathlib import Path
from typing import List

from fastapi import APIRouter, File, HTTPException, Query, UploadFile

from services import combine_service, multi_service
from utils.api_key_utils import generate_and_store_key
from utils.response_utils import success_response

router = APIRouter()

UPLOAD_DIR = Path("uploads")
TEMP_DIR = UPLOAD_DIR / "_multi_temp"


@router.post("/multi/upload")
async def upload_data_folder(
    files: List[UploadFile] = File(...),
    mode: str = Query(default="separate", description="separate | combined"),
):
    """
    Accept multiple data files from a folder picker.

    mode=separate  – saves each file individually; returns list of file_ids
                     (use with /multi-dashboard).
    mode=combined  – runs the full staging pipeline (schema normalisation,
                     fuzzy value mapping, outer concat, default fill, 3NF
                     decomposition) and returns a single file_id compatible
                     with the standard analysis / cleaning / viz pipeline.
    """
    if mode not in ("separate", "combined"):
        raise HTTPException(status_code=400, detail="mode must be 'separate' or 'combined'")
    if not files:
        raise HTTPException(status_code=400, detail="No files received.")

    # ── Save uploads to a temp staging directory ──────────────────────────
    temp_id = str(uuid.uuid4())
    staging = TEMP_DIR / temp_id
    staging.mkdir(parents=True, exist_ok=True)

    saved = 0
    for f in files:
        rel = Path(f.filename.lstrip("/").lstrip("\\"))
        dest = (staging / rel).resolve()
        if not str(dest).startswith(str(staging.resolve())):
            continue  # reject path traversal
        dest.parent.mkdir(parents=True, exist_ok=True)
        content = await f.read()
        dest.write_bytes(content)
        saved += 1

    if saved == 0:
        shutil.rmtree(staging, ignore_errors=True)
        raise HTTPException(status_code=400, detail="No files could be saved.")

    # ── Dispatch to the right service ─────────────────────────────────────
    try:
        if mode == "combined":
            result = combine_service.process_combined(str(staging), str(UPLOAD_DIR))
            msg = (
                f"Combined {result['files_loaded']} files → "
                f"{result['total_rows']} rows · "
                f"{'3NF applied' if result.get('nf3_applied') else 'flat table'}"
            )
        else:
            result = multi_service.process_folder(str(staging), str(UPLOAD_DIR))
            msg = f"Loaded {result['total']} files separately"
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    finally:
        shutil.rmtree(staging, ignore_errors=True)

    # Attach per-file API keys to the result
    if mode == "combined":
        result["api_key"] = generate_and_store_key(result["file_id"])
    else:
        for f in result.get("files", []):
            f["api_key"] = generate_and_store_key(f["file_id"])

    return success_response(
        message=msg,
        data={"mode": mode, **result},
    )
