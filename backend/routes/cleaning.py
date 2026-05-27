"""
Cleaning Route
--------------
Cleans the uploaded dataset and saves the result to `cleaned/`.
"""

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from utils.file_utils import find_uploaded_file
from utils.response_utils import success_response
from services.cleaning_service import clean_dataset, get_cleaning_options

router = APIRouter()


@router.get("/clean/{file_id}/options")
def cleaning_options(file_id: str):
    """
    Inspect the dataset and return available cleaning operations
    (duplicates, missing-value columns, rename candidates, type
    conversions, outlier columns) so the frontend can present a
    pick-list before the user triggers cleaning.
    """
    file_path = find_uploaded_file(file_id)
    if not file_path:
        raise HTTPException(status_code=404, detail="File not found")
    try:
        options = get_cleaning_options(file_path)
        return success_response({"file_id": file_id, "options": options})
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Inspection failed: {exc}") from exc


class CleanRequest(BaseModel):
    selected: Optional[list[str]] = None   # None → apply all


@router.post("/clean/{file_id}")
def clean_data(file_id: str, body: CleanRequest = CleanRequest()):
    """
    Clean the uploaded dataset.

    Pass `selected` as a list of operation ids (from GET /clean/{id}/options)
    to apply only those operations.  Omit `selected` (or send null) to apply
    every detected operation (legacy behaviour).
    """
    file_path = find_uploaded_file(file_id)
    if not file_path:
        raise HTTPException(
            status_code=404,
            detail="File not found. Please upload a dataset first via POST /api/upload",
        )
    try:
        result = clean_dataset(file_path, file_id, selected=body.selected)
        return success_response(result, message="Dataset cleaned successfully")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Cleaning failed: {exc}") from exc
