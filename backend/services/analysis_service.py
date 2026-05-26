"""
Analysis Service
----------------
Analyzes a dataset and returns structured insights.
Uses Pandas for files < 100 MB, PySpark (local mode) for larger files.
"""

import numpy as np
import pandas as pd

from utils.file_utils import get_file_size_mb, load_dataframe, safe_float

# Threshold (MB) at which we switch from Pandas to Spark
SPARK_THRESHOLD_MB = 100


def run_analysis(file_path: str) -> dict:
    """
    Entry point – choose the processing engine based on file size.
    """
    size_mb = get_file_size_mb(file_path)
    if size_mb >= SPARK_THRESHOLD_MB:
        from services.spark_service import analyze_with_spark
        return analyze_with_spark(file_path)
    return _analyze_with_pandas(file_path)


# ─── Pandas implementation ────────────────────────────────────────────────────

def _analyze_with_pandas(file_path: str) -> dict:
    """Full dataset analysis using Pandas."""
    df = load_dataframe(file_path)

    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    categorical_cols = df.select_dtypes(include=["object", "category"]).columns.tolist()

    return {
        "engine": "pandas",
        "shape": {"rows": int(df.shape[0]), "columns": int(df.shape[1])},
        "column_types": {col: str(dtype) for col, dtype in df.dtypes.items()},
        "missing_values": _missing_info(df),
        "duplicate_rows": int(df.duplicated().sum()),
        "statistics": _descriptive_stats(df, numeric_cols),
        "outliers": _outlier_info(df, numeric_cols),
        "correlation": _correlation(df, numeric_cols),
        "numeric_columns": numeric_cols,
        "categorical_columns": categorical_cols,
    }


def _missing_info(df: pd.DataFrame) -> dict:
    missing = df.isnull().sum()
    n = max(len(df), 1)
    return {
        col: {
            "count": int(missing[col]),
            "percentage": round(float(missing[col] / n * 100), 2),
        }
        for col in df.columns
    }


def _descriptive_stats(df: pd.DataFrame, numeric_cols: list) -> dict:
    if not numeric_cols:
        return {}
    desc = df[numeric_cols].describe().to_dict()
    return {
        col: {stat: safe_float(val) for stat, val in vals.items()}
        for col, vals in desc.items()
    }


def _outlier_info(df: pd.DataFrame, numeric_cols: list) -> dict:
    result = {}
    for col in numeric_cols:
        series = df[col].dropna()
        if series.empty:
            continue
        q1 = series.quantile(0.25)
        q3 = series.quantile(0.75)
        iqr = q3 - q1
        lower = q1 - 1.5 * iqr
        upper = q3 + 1.5 * iqr
        count = int(((series < lower) | (series > upper)).sum())
        result[col] = {
            "count": count,
            "lower_bound": safe_float(lower),
            "upper_bound": safe_float(upper),
        }
    return result


def _correlation(df: pd.DataFrame, numeric_cols: list) -> dict:
    if len(numeric_cols) < 2:
        return {}
    # fillna(0) keeps the matrix JSON-serializable
    corr = df[numeric_cols].corr().round(4).fillna(0)
    return {
        col: {k: safe_float(v) for k, v in vals.items()}
        for col, vals in corr.to_dict().items()
    }
