"""
Data API Route  –  exposes cleaned (or raw) data externally via API key.

GET /api/data/{file_id}
  Headers:  X-API-Key: <value from API_KEY env var>
  Params:   page (int, default 1), page_size (int, default 100, max 1000)
            columns (comma-separated filter, optional)

Returns paginated JSON so any downstream tool / BI platform can consume it.
Works for both Pandas (small) and Spark (large) datasets.
"""

import os
import math
from pathlib import Path

import pandas as pd
from fastapi import APIRouter, Header, HTTPException, Query

from utils.api_key_utils import verify_key, generate_and_store_key
from utils.file_utils import find_cleaned_file, find_uploaded_file
from utils.response_utils import success_response

router = APIRouter()

SPARK_THRESHOLD_MB = 100


def _check_key(file_id: str, api_key: str | None):
    if not verify_key(file_id, api_key):
        raise HTTPException(status_code=401, detail="Invalid or missing API key for this dataset.")


def _load_df(file_id: str) -> pd.DataFrame:
    # Prefer cleaned file
    path = find_cleaned_file(file_id) or find_uploaded_file(file_id)
    if not path:
        raise HTTPException(status_code=404, detail="Dataset not found.")

    size_mb = os.path.getsize(path) / (1024 * 1024)

    if size_mb >= SPARK_THRESHOLD_MB:
        try:
            from services.spark_service import get_spark
            spark = get_spark()
            ext = Path(path).suffix.lower()
            if ext == ".parquet":
                return spark.read.parquet(path).toPandas()
            elif ext == ".csv":
                return spark.read.option("header", True).option("inferSchema", True).csv(path).toPandas()
        except Exception:
            pass  # fall through to pandas

    return pd.read_parquet(path) if path.endswith(".parquet") else pd.read_csv(path, low_memory=False)


@router.get("/data/{file_id}")
def get_data(
    file_id: str,
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=1000),
    columns: str | None = Query(default=None, description="Comma-separated column filter"),
):
    """
    Return paginated cleaned data as JSON.
    Requires X-API-Key header matching the key issued at upload time.
    """
    _check_key(file_id, x_api_key)

    df = _load_df(file_id)

    # Column filter
    if columns:
        wanted = [c.strip() for c in columns.split(",") if c.strip() in df.columns]
        if wanted:
            df = df[wanted]

    total = len(df)
    total_pages = math.ceil(total / page_size) if total else 1
    start = (page - 1) * page_size
    end   = start + page_size
    page_df = df.iloc[start:end]

    # NaN → None for clean JSON
    records = page_df.where(pd.notna(page_df), None).to_dict("records")

    return {
        "file_id": file_id,
        "total_rows": total,
        "total_pages": total_pages,
        "page": page,
        "page_size": page_size,
        "columns": df.columns.tolist(),
        "data": records,
    }


@router.get("/data/{file_id}/schema")
def get_schema(
    file_id: str,
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
):
    """Return column names and dtypes only (lightweight schema endpoint)."""
    _check_key(file_id, x_api_key)
    df = _load_df(file_id)
    schema = [{"column": c, "dtype": str(df[c].dtype)} for c in df.columns]
    return success_response(data={"file_id": file_id, "columns": schema})


@router.post("/key/{file_id}/regenerate")
def regenerate_api_key(file_id: str):
    """
    Generate (or regenerate) a per-file API key.
    Overwrites any existing key for this file_id.
    Returns the new plain-text key — store it immediately, it is not kept.
    """
    from utils.file_utils import find_cleaned_file, find_uploaded_file
    # Ensure the file actually exists before issuing a key
    if not find_uploaded_file(file_id) and not find_cleaned_file(file_id):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="File not found")
    new_key = generate_and_store_key(file_id)
    return success_response(data={"file_id": file_id, "api_key": new_key})
