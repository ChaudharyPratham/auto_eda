"""
Combine Service – Staging Layer + Fuzzy Value Mapping + 3NF-Ready Output
=========================================================================
Pipeline (in order):
  1. Load each file independently (Pandas <100 MB, Spark ≥100 MB)
  2. Schema standardisation – snake_case column names, consistent types
  3. Value mapping  – fuzzy-match categorical values → canonical form
                     (e.g. "ind", "india", "bharat" → "india")
  4. Concat / union – outer join so no column is ever lost
  5. Fill defaults   – corrupted / missing cells get median/mode/empty
                      (no crashes, no dropped rows)
  6. 3NF extraction  – high-cardinality lookup columns are broken out
                      into dimension tables; fact table keeps FK integers
  7. Persist         – fact + dimension Parquets under a shared file_id
"""

import os
import re
import uuid
import logging
import math
from pathlib import Path
from typing import Any, Dict, List, Tuple

import numpy as np
import pandas as pd

from utils.file_utils import load_dataframe, get_file_size_mb

logger = logging.getLogger(__name__)

# ── tuneable thresholds ────────────────────────────────────────────────────────
SPARK_THRESHOLD_MB = 100          # files above this use PySpark
FUZZY_THRESHOLD    = 82           # rapidFuzz similarity score (0-100)
MAX_UNIQUE_FUZZY   = 120          # skip fuzzy mapping for very-high-cardinality cols
NF3_MAX_UNIQUE     = 50           # columns with ≤ this many unique vals → dim table
NF3_MIN_ROWS       = 500          # only decompose if dataset is large enough


# ══════════════════════════════════════════════════════════════════════════════
# 1 · Loading helpers (Pandas / Spark)
# ══════════════════════════════════════════════════════════════════════════════

def _load_pandas(path: str) -> pd.DataFrame:
    return load_dataframe(path)


def _load_spark(path: str) -> pd.DataFrame:
    """Load with PySpark and convert to Pandas for downstream steps."""
    try:
        from services.spark_service import get_spark
        spark = get_spark()
        ext = Path(path).suffix.lower()
        if ext == ".csv":
            sdf = spark.read.option("header", True).option("inferSchema", True).csv(path)
        elif ext == ".parquet":
            sdf = spark.read.parquet(path)
        elif ext == ".json":
            sdf = spark.read.json(path)
        else:
            # Fall back to pandas for less-common formats
            return _load_pandas(path)
        return sdf.toPandas()
    except Exception as exc:
        logger.warning("Spark load failed for %s (%s) – using Pandas", path, exc)
        return _load_pandas(path)


def _smart_load(path: str) -> pd.DataFrame:
    try:
        mb = get_file_size_mb(path)
    except Exception:
        mb = 0
    return _load_spark(path) if mb >= SPARK_THRESHOLD_MB else _load_pandas(path)


# ══════════════════════════════════════════════════════════════════════════════
# 2 · Schema standardisation
# ══════════════════════════════════════════════════════════════════════════════

_BAD_CHARS = re.compile(r"[^a-z0-9_]")


def _snake(name: str) -> str:
    s = name.strip().lower()
    s = re.sub(r"\s+", "_", s)
    s = _BAD_CHARS.sub("", s)
    return s or "col"


def _standardise_schema(df: pd.DataFrame) -> pd.DataFrame:
    """Normalise column names and cast object columns that look numeric."""
    df = df.rename(columns={c: _snake(c) for c in df.columns})

    for col in df.select_dtypes(include="object").columns:
        converted = pd.to_numeric(df[col], errors="coerce")
        if converted.notna().sum() / max(len(df), 1) > 0.85:
            df[col] = converted

    return df


# ══════════════════════════════════════════════════════════════════════════════
# 3 · Fuzzy value mapping
# ══════════════════════════════════════════════════════════════════════════════

def _fuzzy_map_column(series: pd.Series) -> pd.Series:
    """
    Group similar string values and replace each with the canonical form
    (the most frequent spelling in the group).
    """
    try:
        from rapidfuzz import fuzz, process as rfprocess
    except ImportError:
        return series  # graceful fallback

    vals = series.dropna().astype(str)
    unique_vals = vals.unique().tolist()
    if len(unique_vals) < 2 or len(unique_vals) > MAX_UNIQUE_FUZZY:
        return series

    freq = vals.value_counts().to_dict()
    mapping: Dict[str, str] = {}
    assigned: set = set()

    for val in sorted(unique_vals, key=lambda v: -freq.get(v, 0)):
        if val in assigned:
            continue
        assigned.add(val)
        matches = rfprocess.extract(
            val, unique_vals, scorer=fuzz.token_sort_ratio, limit=None
        )
        similar = [m[0] for m in matches if m[1] >= FUZZY_THRESHOLD and m[0] not in assigned]
        for s in similar:
            assigned.add(s)
            mapping[s] = val

    return series.map(lambda x: mapping.get(str(x), x) if pd.notna(x) else x)


def _apply_fuzzy_mapping(df: pd.DataFrame) -> pd.DataFrame:
    for col in df.select_dtypes(include="object").columns:
        n_unique = df[col].nunique(dropna=True)
        if 2 <= n_unique <= MAX_UNIQUE_FUZZY:
            df[col] = _fuzzy_map_column(df[col])
    return df


# ══════════════════════════════════════════════════════════════════════════════
# 4+5 · Concat + fill defaults
# ══════════════════════════════════════════════════════════════════════════════

def _fill_defaults(df: pd.DataFrame) -> pd.DataFrame:
    """
    Fill NaN / corrupt cells with safe defaults.
    No row is dropped; no column is dropped.
    """
    for col in df.columns:
        if df[col].dtype.kind in ("i", "u", "f"):          # numeric
            fill = df[col].median()
            if math.isnan(fill) if isinstance(fill, float) else False:
                fill = 0
            df[col] = df[col].fillna(fill)
        elif df[col].dtype.kind == "b":                    # boolean
            df[col] = df[col].fillna(False)
        elif pd.api.types.is_datetime64_any_dtype(df[col]):
            df[col] = df[col].fillna(pd.NaT)
        else:                                              # string / object
            mode = df[col].mode()
            df[col] = df[col].fillna(mode.iloc[0] if len(mode) else "")
    return df


# ══════════════════════════════════════════════════════════════════════════════
# 6 · 3NF extraction
# ══════════════════════════════════════════════════════════════════════════════

def _extract_3nf(
    df: pd.DataFrame,
) -> Tuple[pd.DataFrame, Dict[str, pd.DataFrame]]:
    """
    Split low-cardinality categorical columns into dimension tables.
    Returns (fact_df, {dim_name: dim_df}).
    """
    if len(df) < NF3_MIN_ROWS:
        return df, {}

    dims: Dict[str, pd.DataFrame] = {}

    for col in df.select_dtypes(include="object").columns:
        n_unique = df[col].nunique(dropna=True)
        if 2 <= n_unique <= NF3_MAX_UNIQUE:
            dim = (
                df[[col]]
                .drop_duplicates()
                .dropna()
                .reset_index(drop=True)
            )
            dim.insert(0, f"{col}_id", range(1, len(dim) + 1))
            dims[col] = dim

            id_map = dict(zip(dim[col], dim[f"{col}_id"]))
            df[col] = df[col].map(id_map).astype("Int64")
            df = df.rename(columns={col: f"{col}_id"})

    return df, dims


# ══════════════════════════════════════════════════════════════════════════════
# Public API
# ══════════════════════════════════════════════════════════════════════════════

def _collect_data_files(folder_path: str) -> List[Path]:
    from utils.file_utils import ALLOWED_EXTENSIONS
    root = Path(folder_path)
    return sorted(p for p in root.rglob("*") if p.is_file() and p.suffix.lower() in ALLOWED_EXTENSIONS)


def process_combined(folder_path: str, upload_dir: str) -> Dict[str, Any]:
    """
    Full staging pipeline → returns a single file_id pointing to the
    fact Parquet (plus dimension Parquets in the same directory).
    Compatible with all existing analysis / cleaning / visualization routes.
    """
    files = _collect_data_files(folder_path)
    if not files:
        raise ValueError("No supported data files found in the uploaded folder.")

    dfs: List[pd.DataFrame] = []
    errors: List[str] = []

    # ── Step 1+2: load & standardise each file ──────────────────────────────
    for fp in files:
        try:
            raw = _smart_load(str(fp))
            dfs.append(_standardise_schema(raw))
        except Exception as exc:
            errors.append(f"{fp.name}: {exc}")
            logger.warning("Skipping %s: %s", fp.name, exc)

    if not dfs:
        raise ValueError(f"Could not load any file. Errors: {'; '.join(errors)}")

    # ── Step 3: per-file fuzzy value mapping ────────────────────────────────
    dfs = [_apply_fuzzy_mapping(df) for df in dfs]

    # ── Step 4: outer concat (no columns lost) ──────────────────────────────
    combined = pd.concat(dfs, ignore_index=True, sort=False)

    # ── Step 5: fill defaults (no rows lost) ────────────────────────────────
    combined = _fill_defaults(combined)

    # ── Cross-dataset fuzzy mapping (after concat) ──────────────────────────
    combined = _apply_fuzzy_mapping(combined)

    # ── Step 6: 3NF decomposition ───────────────────────────────────────────
    fact_df, dims = _extract_3nf(combined)

    # ── Step 7: persist ─────────────────────────────────────────────────────
    file_id = str(uuid.uuid4())
    fact_path = os.path.join(upload_dir, f"{file_id}.parquet")
    fact_df.to_parquet(fact_path, index=False)

    dim_meta: List[Dict] = []
    for dim_name, dim_df in dims.items():
        dim_file_id = f"{file_id}_dim_{dim_name}"
        dim_path = os.path.join(upload_dir, f"{dim_file_id}.parquet")
        dim_df.to_parquet(dim_path, index=False)
        dim_meta.append({
            "name": dim_name,
            "file_id": dim_file_id,
            "rows": len(dim_df),
        })

    return {
        "file_id": file_id,
        "filename": f"combined_{len(dfs)}_files.parquet",
        "size_mb": round(os.path.getsize(fact_path) / (1024 * 1024), 3),
        "extension": ".parquet",
        "engine": "pandas",
        "total_rows": len(fact_df),
        "total_columns": len(fact_df.columns),
        "files_loaded": len(dfs),
        "files_skipped": len(errors),
        "load_errors": errors,
        "dimension_tables": dim_meta,
        "nf3_applied": len(dims) > 0,
    }
