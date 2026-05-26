"""
Visualization Route
-------------------
Returns Plotly-compatible chart data for the frontend dashboard.
"""

from fastapi import APIRouter, HTTPException

from utils.file_utils import find_uploaded_file
from utils.response_utils import success_response
from services.visualization_service import generate_visualizations

router = APIRouter()


@router.get("/visualize/{file_id}")
def get_visualizations(file_id: str):
    """
    Generate chart-ready data for the uploaded dataset.

    Returns data objects compatible with react-plotly.js:
    - Histograms for numerical columns
    - Box plots for numerical columns
    - Bar charts + pie charts for categorical columns
    - Correlation heatmap (if multiple numeric columns exist)
    - Scatter plots for pairs of numerical columns
    """
    file_path = find_uploaded_file(file_id)
    if not file_path:
        raise HTTPException(
            status_code=404,
            detail="File not found. Please upload a dataset first via POST /api/upload",
        )

    try:
        result = generate_visualizations(file_path)
        return success_response(result, message="Visualizations generated")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Visualization failed: {exc}") from exc
