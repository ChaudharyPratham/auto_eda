"""
Visualization Route
-------------------
Returns Plotly-compatible chart data for the frontend dashboard.

Routes:
  GET  /visualize/{file_id}          – auto-generated charts (existing)
  GET  /visualize/{file_id}/columns  – column metadata for the chart builder
  POST /visualize/{file_id}/custom   – build a single chart with filters
"""

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from utils.file_utils import find_uploaded_file
from utils.response_utils import success_response
from services.visualization_service import (
    generate_visualizations,
    get_column_info,
    build_custom_chart,
)

router = APIRouter()


# ── Pydantic models ────────────────────────────────────────────────────────────

class FilterSpec(BaseModel):
    col: str
    op: str = "eq"      # eq | ne | contains | gt | lt | gte | lte
    value: str = ""


class CustomChartRequest(BaseModel):
    chart_type: str = "bar"     # bar | histogram | scatter | pie
    x_col: Optional[str] = None
    y_cols: list[str] = []
    agg: str = "sum"            # sum | mean | count | median | min | max
    filters: list[FilterSpec] = []


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.get("/visualize/{file_id}")
def get_visualizations(file_id: str):
    """Auto-generated charts for all columns."""
    file_path = find_uploaded_file(file_id)
    if not file_path:
        raise HTTPException(status_code=404, detail="File not found.")
    try:
        result = generate_visualizations(file_path)
        return success_response(result, message="Visualizations generated")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Visualization failed: {exc}") from exc


@router.get("/visualize/{file_id}/columns")
def get_columns(file_id: str):
    """Return column names, types, and sample values for the chart builder UI."""
    file_path = find_uploaded_file(file_id)
    if not file_path:
        raise HTTPException(status_code=404, detail="File not found.")
    try:
        result = get_column_info(file_path)
        return success_response(result, message="Column info retrieved")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Column info failed: {exc}") from exc


@router.post("/visualize/{file_id}/custom")
def custom_chart(file_id: str, body: CustomChartRequest):
    """Build a single custom chart with optional filters — used by the Chart Builder."""
    file_path = find_uploaded_file(file_id)
    if not file_path:
        raise HTTPException(status_code=404, detail="File not found.")
    try:
        result = build_custom_chart(
            file_path=file_path,
            chart_type=body.chart_type,
            x_col=body.x_col,
            y_cols=body.y_cols,
            agg=body.agg,
            filters=[f.model_dump() for f in body.filters],
        )
        return success_response(result, message="Custom chart built")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Custom chart failed: {exc}") from exc
