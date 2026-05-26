"""
File Utilities
--------------
Helpers for file validation, size checks, discovery, and loading
DataFrames from various formats.
"""

import os
import glob
import math

import pandas as pd


# ─── Supported extensions ─────────────────────────────────────────────────────
ALLOWED_EXTENSIONS = {".csv", ".json", ".xlsx", ".xls", ".txt", ".parquet", ".ipynb"}


def validate_file_extension(filename: str, allowed: set = None) -> bool:
    """Return True if the file extension is in the allowed set."""
    if allowed is None:
        allowed = ALLOWED_EXTENSIONS
    ext = os.path.splitext(filename)[1].lower()
    return ext in allowed


def get_file_size_mb(file_path: str) -> float:
    """Return the file size in megabytes."""
    return os.path.getsize(file_path) / (1024 * 1024)


def find_uploaded_file(file_id: str) -> str | None:
    """
    Locate an uploaded file by its file_id.
    Returns the full path or None if not found.
    """
    matches = glob.glob(os.path.join("uploads", f"{file_id}.*"))
    return matches[0] if matches else None


def find_cleaned_file(file_id: str) -> str | None:
    """
    Locate the cleaned CSV file for a given file_id.
    Returns the path or None if the file has not been cleaned yet.
    """
    path = os.path.join("cleaned", f"{file_id}_cleaned.csv")
    return path if os.path.exists(path) else None


def load_dataframe(file_path: str) -> pd.DataFrame:
    """
    Load a file into a Pandas DataFrame.
    Supports: CSV, JSON, Excel (.xlsx/.xls), TXT, Parquet.
    """
    ext = os.path.splitext(file_path)[1].lower()

    if ext == ".csv":
        return pd.read_csv(file_path, low_memory=False)

    if ext == ".json":
        return pd.read_json(file_path)

    if ext in (".xlsx", ".xls"):
        return pd.read_excel(file_path)

    if ext == ".txt":
        # Try tab-separated, fall back to comma-separated
        try:
            return pd.read_csv(file_path, sep="\t", low_memory=False)
        except Exception:
            return pd.read_csv(file_path, low_memory=False)

    if ext == ".parquet":
        return pd.read_parquet(file_path)

    if ext == ".ipynb":
        return _load_notebook(file_path)

    raise ValueError(f"Unsupported file format: {ext}")


def _load_notebook(file_path: str) -> pd.DataFrame:
    """
    Extract tabular data from a Jupyter Notebook (.ipynb).

    Strategy (in order):
    1. Cell outputs with 'text/html'  → parse as HTML table (pandas DataFrame repr)
    2. Cell outputs with 'text/plain' → parse as whitespace-delimited table
    Returns the DataFrame with the most rows found across all cell outputs.
    """
    import json
    from io import StringIO

    with open(file_path, "r", encoding="utf-8") as fh:
        notebook = json.load(fh)

    dataframes: list[pd.DataFrame] = []

    for cell in notebook.get("cells", []):
        if cell.get("cell_type") != "code":
            continue
        for output in cell.get("outputs", []):
            output_data = output.get("data", {})

            # ── HTML table (most common – pandas default repr) ──────────────
            if "text/html" in output_data:
                html = "".join(output_data["text/html"])
                try:
                    dfs = pd.read_html(StringIO(html))
                    if dfs:
                        dataframes.append(dfs[0])
                        continue
                except Exception:
                    pass

            # ── Plain-text fallback (space-aligned table) ────────────────────
            if "text/plain" in output_data:
                text = "".join(output_data["text/plain"])
                try:
                    # pandas text repr uses ≥2 spaces as column separator
                    df = pd.read_csv(StringIO(text), sep=r"\s{2,}", engine="python")
                    if df.shape[1] > 1 and df.shape[0] > 0:
                        dataframes.append(df)
                except Exception:
                    pass

    if not dataframes:
        raise ValueError(
            "No tabular data found in this notebook. "
            "Make sure at least one cell outputs a DataFrame "
            "(e.g. display(df) or df at the end of a cell)."
        )

    # Return the DataFrame with the most rows
    return max(dataframes, key=lambda d: len(d))


def safe_float(value) -> float | None:
    """
    Convert a value to a rounded float.
    Returns None for NaN, Inf, or unconvertible values (keeps JSON serializable).
    """
    try:
        f = float(value)
        return None if (math.isnan(f) or math.isinf(f)) else round(f, 4)
    except (TypeError, ValueError):
        return None
