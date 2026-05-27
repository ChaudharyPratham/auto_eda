"""
Image Folder Routes
Handles upload, analysis, cleaning, and download for image datasets.
"""

import uuid
from pathlib import Path
from typing import List

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse

from services import image_service
from utils.response_utils import success_response

router = APIRouter()

UPLOAD_DIR = Path("uploads")
CLEANED_DIR = Path("cleaned")
ZIPS_DIR = Path("reports")   # reuse reports dir for zip storage


@router.post("/image/upload")
async def upload_image_folder(files: List[UploadFile] = File(...)):
    """
    Accept a flat list of files (sent by a <input webkitdirectory> picker).
    The filename field carries the relative path (e.g. "cats/001.jpg") so the
    original subdirectory structure is preserved on disk.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files received.")

    folder_id = str(uuid.uuid4())
    folder_path = UPLOAD_DIR / folder_id
    folder_path.mkdir(parents=True, exist_ok=True)

    saved = 0
    for f in files:
        # Sanitise the path: strip leading slashes / traversal attempts
        rel = Path(f.filename.lstrip("/").lstrip("\\"))
        # Reject any path that would escape the upload folder
        dest = (folder_path / rel).resolve()
        if not str(dest).startswith(str(folder_path.resolve())):
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        content = await f.read()
        dest.write_bytes(content)
        saved += 1

    if saved == 0:
        raise HTTPException(status_code=400, detail="No valid image files were saved.")

    return success_response(
        message=f"Uploaded {saved} files",
        data={"folder_id": folder_id, "file_count": saved},
    )


@router.get("/image/analyze/{folder_id}")
async def analyze_image_folder(folder_id: str):
    folder_path = UPLOAD_DIR / folder_id
    if not folder_path.exists():
        raise HTTPException(status_code=404, detail="Folder not found.")
    try:
        result = image_service.analyze_images(str(folder_path))
        return success_response(data=result)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/image/samples/{folder_id}")
async def get_image_samples(folder_id: str, n: int = Query(default=16, ge=1, le=64)):
    folder_path = UPLOAD_DIR / folder_id
    if not folder_path.exists():
        raise HTTPException(status_code=404, detail="Folder not found.")
    samples = image_service.get_sample_images(str(folder_path), n=n)
    return success_response(data={"samples": samples})


@router.post("/image/clean/{folder_id}")
async def clean_image_folder(
    folder_id: str,
    remove_corrupted: bool = Query(default=True),
    remove_duplicates: bool = Query(default=True),
):
    folder_path = UPLOAD_DIR / folder_id
    if not folder_path.exists():
        raise HTTPException(status_code=404, detail="Folder not found.")
    cleaned_dir = str(CLEANED_DIR / folder_id)
    try:
        result = image_service.clean_images(
            str(folder_path), cleaned_dir, remove_corrupted, remove_duplicates
        )
        return success_response(data=result)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/image/download/{folder_id}")
async def download_cleaned_images(folder_id: str):
    cleaned_path = CLEANED_DIR / folder_id
    if not cleaned_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Cleaned folder not found. Run cleaning first.",
        )
    zip_path = str(ZIPS_DIR / f"{folder_id}_cleaned.zip")
    image_service.create_zip(str(cleaned_path), zip_path)
    return FileResponse(
        zip_path,
        media_type="application/zip",
        filename="cleaned_images.zip",
    )
