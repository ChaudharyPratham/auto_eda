"""
Cloud Import Route
POST /api/cloud/import  – download a single file or a folder of files from
                          Azure / AWS / GCP / Databricks and register them
                          in the normal pipeline.

import_type="file"   → download one file → file_id → normal Dashboard
import_type="folder" → download all files under prefix:
                        if images → folder_id → Image Dashboard
                        if data   → folder_id / file_id → Data pipeline
"""

import os
import shutil
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from db.database import get_db
from services import cloud_service
from utils.api_key_utils import generate_and_store_key
from utils.file_utils import get_file_size_mb
from utils.response_utils import success_response

router = APIRouter()

UPLOAD_DIR = Path("uploads")

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".bmp", ".gif", ".tiff", ".tif", ".webp"}
DATA_EXTENSIONS  = {".csv", ".json", ".xlsx", ".xls", ".txt", ".parquet", ".ipynb", ".avro"}


def _classify_files(paths: list[str]) -> str:
    """Return 'images', 'data', or 'mixed' based on file extensions."""
    exts = {Path(p).suffix.lower() for p in paths}
    is_img  = bool(exts & IMAGE_EXTENSIONS)
    is_data = bool(exts & DATA_EXTENSIONS)
    if is_img and not is_data:
        return "images"
    if is_data and not is_img:
        return "data"
    return "mixed"


class CloudImportRequest(BaseModel):
    provider: str                           # azure | aws | gcp | databricks
    uri: str                                # full URI
    import_type: str = "file"              # file | folder
    container_or_bucket: Optional[str] = None
    blob_or_key: Optional[str] = None


@router.post("/cloud/import")
async def cloud_import(req: CloudImportRequest, db=Depends(get_db)):
    """
    Download from cloud and return a file_id (single file) or folder routing
    info (folder/prefix). Credentials are read from .env only.
    """
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    # ── Single-file import ────────────────────────────────────────────────
    if req.import_type == "file":
        try:
            local_path, file_id = cloud_service.download_from_cloud(
                provider=req.provider,
                uri=req.uri,
                container_or_bucket=req.container_or_bucket,
                blob_or_key=req.blob_or_key,
                download_dir=str(UPLOAD_DIR),
            )
        except (ValueError, RuntimeError) as exc:
            raise HTTPException(status_code=422, detail=str(exc))
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Cloud download failed: {exc}")

        size_mb  = get_file_size_mb(local_path)
        api_key  = generate_and_store_key(file_id)
        ext      = Path(local_path).suffix.lower()
        filename = Path(local_path).name

        _save_db_record(db, file_id, filename, req.provider, ext, size_mb)

        # Detect if it's an image → route to image dashboard
        import_mode = "image" if ext in IMAGE_EXTENSIONS else "data"

        return success_response(
            message=f"Downloaded from {req.provider}",
            data={
                "import_mode": import_mode,
                "file_id": file_id,
                "filename": filename,
                "size_mb": round(size_mb, 3),
                "extension": ext,
                "engine": "spark" if size_mb >= 100 else "pandas",
                "source": req.provider,
                "api_key": api_key,
            },
        )

    # ── Folder / prefix import ────────────────────────────────────────────
    folder_id   = str(uuid.uuid4())
    dest_folder = UPLOAD_DIR / folder_id

    try:
        local_paths = cloud_service.download_folder_from_cloud(
            provider=req.provider,
            uri=req.uri,
            container_or_bucket=req.container_or_bucket,
            prefix=req.blob_or_key,
            dest_dir=str(dest_folder),
        )
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Cloud folder download failed: {exc}")

    if not local_paths:
        shutil.rmtree(dest_folder, ignore_errors=True)
        raise HTTPException(status_code=404, detail="No files found at the specified cloud path.")

    kind    = _classify_files(local_paths)
    api_key = generate_and_store_key(folder_id)

    return success_response(
        message=f"Downloaded {len(local_paths)} files from {req.provider}",
        data={
            "import_mode": "image_folder" if kind == "images" else "data_folder",
            "folder_id": folder_id,
            "file_count": len(local_paths),
            "file_type": kind,
            "source": req.provider,
            "api_key": api_key,
        },
    )


def _save_db_record(db, file_id, filename, provider, ext, size_mb):
    if db is None:
        return
    try:
        import uuid as _uuid
        from datetime import datetime
        from db.models import Dataset
        db.add(Dataset(
            id=_uuid.UUID(file_id),
            filename=filename,
            source="cloud",
            cloud_provider=provider,
            file_format=ext,
            size_mb=size_mb,
        ))
        db.commit()
    except Exception:
        db.rollback()
