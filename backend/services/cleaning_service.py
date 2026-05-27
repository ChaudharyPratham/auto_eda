"""
Cleaning Service
----------------
Cleans a dataset and saves the result to `cleaned/<file_id>_cleaned.csv`.
Uses Pandas for files < 100 MB, PySpark (local mode) for larger files.
"""

import os
import re

import numpy as np
import pandas as pd

from utils.file_utils import get_file_size_mb, load_dataframe

SPARK_THRESHOLD_MB = 100


# ─── Options inspector ───────────────────────────────────────────────────────

def get_cleaning_options(file_path: str) -> list[dict]:
    """
    Inspect the dataset and return a list of cleaning operations that
    could be applied, each with a unique id, human-readable label,
    severity (info / warning / error) and the number of affected rows/cols.
    """
    df = load_dataframe(file_path)
    options = []

    # 1. Duplicate rows
    dup_count = int(df.duplicated().sum())
    if dup_count > 0:
        options.append({
            "id": "remove_duplicates",
            "group": "Duplicates",
            "label": f"Remove {dup_count:,} duplicate row(s)",
            "count": dup_count,
            "severity": "error",
        })

    # 2. Missing values – one option per column
    for col in df.columns:
        missing = int(df[col].isnull().sum())
        if missing == 0:
            continue
        pct = round(missing / max(len(df), 1) * 100, 1)
        if pd.api.types.is_numeric_dtype(df[col]):
            fill_val = round(float(df[col].median()), 4) if df[col].notna().any() else 0
            detail = f"fill with median ({fill_val})"
            dtype_tag = "numeric"
        else:
            mode_s = df[col].mode()
            fill_val = str(mode_s[0]) if not mode_s.empty else "Unknown"
            detail = f"fill with mode ('{fill_val}')"
            dtype_tag = "categorical"
        options.append({
            "id": f"fill_missing__{col}",
            "group": "Missing Values",
            "label": f"'{col}': {missing:,} missing ({pct}%) — {detail}",
            "col": col,
            "dtype": dtype_tag,
            "count": missing,
            "severity": "error" if pct > 10 else "warning",
        })

    # 3. Column name standardisation
    needs_rename = [
        c for c in df.columns
        if c != re.sub(r"[\s\-\.]", "_", c.strip().lower())
    ]
    if needs_rename:
        options.append({
            "id": "standardize_columns",
            "group": "Column Names",
            "label": f"Rename {len(needs_rename)} column(s) to snake_case "
                     f"(e.g. '{needs_rename[0]}')",
            "count": len(needs_rename),
            "severity": "warning",
        })

    # 4. Numeric-looking string columns
    for col in df.select_dtypes(include=["object"]).columns:
        converted = pd.to_numeric(df[col], errors="coerce")
        ratio = converted.notna().sum() / max(len(df), 1)
        if ratio >= 0.9:
            options.append({
                "id": f"convert_numeric__{col}",
                "group": "Type Conversion",
                "label": f"'{col}': convert text → number ({ratio*100:.0f}% numeric values)",
                "col": col,
                "count": int(converted.notna().sum()),
                "severity": "warning",
            })

    # 5. Outliers (IQR method) – numeric columns only
    for col in df.select_dtypes(include=[np.number]).columns:
        q1, q3 = df[col].quantile(0.25), df[col].quantile(0.75)
        iqr = q3 - q1
        if iqr == 0:
            continue
        mask = (df[col] < q1 - 1.5 * iqr) | (df[col] > q3 + 1.5 * iqr)
        n_out = int(mask.sum())
        if n_out > 0:
            options.append({
                "id": f"drop_outliers__{col}",
                "group": "Outliers",
                "label": f"'{col}': drop {n_out:,} outlier row(s) (IQR method)",
                "col": col,
                "count": n_out,
                "severity": "info",
            })

    return options


# ─── Entry point ─────────────────────────────────────────────────────────────

def clean_dataset(file_path: str, file_id: str, selected: list[str] | None = None) -> dict:
    """
    Clean dataset.  If `selected` is provided only those operation ids are run.
    Falls back to all operations when `selected` is None (legacy behaviour).
    """
    size_mb = get_file_size_mb(file_path)
    if size_mb >= SPARK_THRESHOLD_MB:
        from services.spark_service import clean_with_spark
        return clean_with_spark(file_path, file_id)
    return _clean_with_pandas(file_path, file_id, selected)


# ─── Pandas implementation ────────────────────────────────────────────────────

def _clean_with_pandas(file_path: str, file_id: str, selected: list[str] | None = None) -> dict:
    """Clean dataset using Pandas, applying only the operations in `selected`."""
    df = load_dataframe(file_path)
    original_shape = df.shape
    log = []

    # Helper: should we run this operation?
    def _run(op_id: str) -> bool:
        return selected is None or op_id in selected

    # 1. Remove duplicate rows
    if _run("remove_duplicates"):
        dup_count = int(df.duplicated().sum())
        if dup_count > 0:
            df = df.drop_duplicates()
            log.append(f"Removed {dup_count:,} duplicate row(s)")

    # 2. Handle missing values per column
    for col in df.columns:
        if not _run(f"fill_missing__{col}"):
            continue
        missing_count = int(df[col].isnull().sum())
        if missing_count == 0:
            continue
        if pd.api.types.is_numeric_dtype(df[col]):
            fill_val = df[col].median()
            df[col] = df[col].fillna(fill_val)
            log.append(
                f"Column '{col}': filled {missing_count:,} missing value(s) "
                f"with median ({round(float(fill_val), 4)})"
            )
        else:
            mode_s = df[col].mode()
            fill_val = mode_s[0] if not mode_s.empty else "Unknown"
            df[col] = df[col].fillna(fill_val)
            log.append(f"Column '{col}': filled {missing_count:,} missing value(s) with mode ('{fill_val}')")

    # 3. Standardize column names → snake_case
    if _run("standardize_columns"):
        original_cols = df.columns.tolist()
        df.columns = [
            re.sub(r"[\s\-\.]", "_", c.strip().lower())
            for c in df.columns
        ]
        renamed = [(o, n) for o, n in zip(original_cols, df.columns.tolist()) if o != n]
        if renamed:
            log.append(
                f"Standardized {len(renamed)} column name(s) to snake_case "
                f"(e.g. '{renamed[0][0]}' → '{renamed[0][1]}')"
            )

    # 4. Convert numeric-looking string columns
    for col in list(df.columns):
        if not _run(f"convert_numeric__{col}"):
            continue
        if df[col].dtype != object:
            continue
        converted = pd.to_numeric(df[col], errors="coerce")
        if converted.notna().sum() / max(len(df), 1) >= 0.9:
            df[col] = converted
            log.append(f"Column '{col}': converted from text to numeric")

    # 5. Drop outliers (IQR)
    for col in list(df.columns):
        if not _run(f"drop_outliers__{col}"):
            continue
        if not pd.api.types.is_numeric_dtype(df[col]):
            continue
        q1, q3 = df[col].quantile(0.25), df[col].quantile(0.75)
        iqr = q3 - q1
        if iqr == 0:
            continue
        before = len(df)
        df = df[(df[col] >= q1 - 1.5 * iqr) & (df[col] <= q3 + 1.5 * iqr)]
        removed = before - len(df)
        if removed:
            log.append(f"Column '{col}': dropped {removed:,} outlier row(s)")

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
