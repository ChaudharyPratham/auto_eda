"""
Analysis Route
--------------
Triggers full dataset analysis and returns the results as JSON.
Delegates all processing to analysis_service.
"""

from fastapi import APIRouter, HTTPException

from utils.file_utils import find_uploaded_file
from utils.response_utils import success_response
from services.analysis_service import run_analysis

router = APIRouter()


@router.get("/analysis/{file_id}")
def analyze_dataset(file_id: str):
    """
    Analyze the uploaded dataset.

    Returns: shape, column types, missing values, duplicate count,
    descriptive statistics, outlier counts, and correlation matrix.
    """
    file_path = find_uploaded_file(file_id)
    if not file_path:
        raise HTTPException(
            status_code=404,
            detail="File not found. Please upload a dataset first via POST /api/upload",
        )

    try:
        result = run_analysis(file_path)
        return success_response(result, message="Analysis complete")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {exc}") from exc
