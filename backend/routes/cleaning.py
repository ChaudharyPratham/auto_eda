"""
Cleaning Route
--------------
Cleans the uploaded dataset and saves the result to `cleaned/`.
"""

from fastapi import APIRouter, HTTPException

from utils.file_utils import find_uploaded_file
from utils.response_utils import success_response
from services.cleaning_service import clean_dataset

router = APIRouter()


@router.post("/clean/{file_id}")
def clean_data(file_id: str):
    """
    Clean the uploaded dataset.

    Actions performed:
    - Remove duplicate rows
    - Fill missing values (median for numeric, mode for categorical)
    - Standardize column names (lowercase, snake_case)
    - Auto-convert numeric-looking string columns

    Returns a cleaning summary log and the cleaned file id.
    """
    file_path = find_uploaded_file(file_id)
    if not file_path:
        raise HTTPException(
            status_code=404,
            detail="File not found. Please upload a dataset first via POST /api/upload",
        )

    try:
        result = clean_dataset(file_path, file_id)
        return success_response(result, message="Dataset cleaned successfully")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Cleaning failed: {exc}") from exc
