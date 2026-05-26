"""
Download Route
--------------
Serves the cleaned dataset and the analysis report for download.
"""

import os
import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from utils.file_utils import find_uploaded_file, find_cleaned_file
from services.analysis_service import run_analysis

router = APIRouter()


@router.get("/download/{file_id}/cleaned")
def download_cleaned(file_id: str):
    """
    Download the cleaned dataset as a CSV file.
    Run POST /api/clean/{file_id} first.
    """
    file_path = find_cleaned_file(file_id)
    if not file_path:
        raise HTTPException(
            status_code=404,
            detail="Cleaned file not found. Run POST /api/clean/{file_id} first.",
        )
    return FileResponse(
        path=file_path,
        media_type="text/csv",
        filename=f"cleaned_{file_id}.csv",
    )


@router.get("/download/{file_id}/report")
def download_report(file_id: str):
    """
    Download the full analysis report as a JSON file.
    Generates (and caches) the report on first call.
    """
    report_path = os.path.join("reports", f"{file_id}_report.json")

    # Generate and cache the report if it doesn't exist yet
    if not os.path.exists(report_path):
        original_path = find_uploaded_file(file_id)
        if not original_path:
            raise HTTPException(
                status_code=404,
                detail="File not found. Please upload a dataset first.",
            )
        try:
            report_data = run_analysis(original_path)
            with open(report_path, "w", encoding="utf-8") as fh:
                json.dump(report_data, fh, indent=2, default=str)
        except Exception as exc:
            raise HTTPException(
                status_code=500, detail=f"Report generation failed: {exc}"
            ) from exc

    return FileResponse(
        path=report_path,
        media_type="application/json",
        filename=f"report_{file_id}.json",
    )
