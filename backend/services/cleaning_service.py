"""
Cleaning Service
----------------
Cleans a dataset and saves the result to `cleaned/<file_id>_cleaned.csv`.
Uses Pandas for files < 100 MB, PySpark (local mode) for larger files.
"""

import os

import numpy as np
import pandas as pd

from utils.file_utils import get_file_size_mb, load_dataframe

SPARK_THRESHOLD_MB = 100


def clean_dataset(file_path: str, file_id: str) -> dict:
    """
    Entry point – choose the processing engine based on file size.
    """
    size_mb = get_file_size_mb(file_path)
    if size_mb >= SPARK_THRESHOLD_MB:
        from services.spark_service import clean_with_spark
        return clean_with_spark(file_path, file_id)
    return _clean_with_pandas(file_path, file_id)


# ─── Pandas implementation ────────────────────────────────────────────────────

def _clean_with_pandas(file_path: str, file_id: str) -> dict:
    """Clean dataset using Pandas."""
    df = load_dataframe(file_path)
    original_shape = df.shape
    log = []

    # 1. Remove duplicate rows
    dup_count = int(df.duplicated().sum())
    if dup_count > 0:
        df = df.drop_duplicates()
        log.append(f"Removed {dup_count} duplicate row(s)")

    # 2. Handle missing values
    for col in df.columns:
        missing_count = int(df[col].isnull().sum())
        if missing_count == 0:
            continue

        if pd.api.types.is_numeric_dtype(df[col]):
            fill_val = df[col].median()
            df[col] = df[col].fillna(fill_val)
            log.append(
                f"Column '{col}': filled {missing_count} missing value(s) "
                f"with median ({round(float(fill_val), 4)})"
            )
        else:
            mode_series = df[col].mode()
            fill_val = mode_series[0] if not mode_series.empty else "Unknown"
            df[col] = df[col].fillna(fill_val)
            log.append(
                f"Column '{col}': filled {missing_count} missing value(s) "
                f"with mode ('{fill_val}')"
            )

    # 3. Standardize column names → lowercase snake_case
    original_cols = df.columns.tolist()
    df.columns = [
        c.strip().lower().replace(" ", "_").replace("-", "_").replace(".", "_")
        for c in df.columns
    ]
    renamed = [(o, n) for o, n in zip(original_cols, df.columns.tolist()) if o != n]
    if renamed:
        log.append(
            f"Standardized {len(renamed)} column name(s) to snake_case "
            f"(e.g. {renamed[0][0]!r} → {renamed[0][1]!r})"
        )

    # 4. Convert numeric-looking string columns to numbers
    for col in df.select_dtypes(include=["object"]).columns:
        converted = pd.to_numeric(df[col], errors="coerce")
        non_null_ratio = converted.notna().sum() / max(len(df), 1)
        # Only convert if ≥ 90 % of values parse as numbers
        if non_null_ratio >= 0.9:
            df[col] = converted
            log.append(f"Column '{col}': converted from object to numeric")

    # Save cleaned file
    cleaned_path = os.path.join("cleaned", f"{file_id}_cleaned.csv")
    df.to_csv(cleaned_path, index=False)

    return {
        "engine": "pandas",
        "original_shape": {"rows": int(original_shape[0]), "columns": int(original_shape[1])},
        "cleaned_shape": {"rows": int(df.shape[0]), "columns": int(df.shape[1])},
        "rows_removed": int(original_shape[0] - df.shape[0]),
        "cleaning_log": log,
        "cleaned_file_id": file_id,
    }
