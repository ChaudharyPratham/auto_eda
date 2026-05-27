"""
Multi-File Folder Service
Loads each supported data file from a folder individually, saves each one as
its own Parquet with a unique file_id, and returns the list so the frontend
can show per-file analysis using the standard analysis/cleaning/viz pipeline.
"""

import os
import uuid
import logging
from pathlib import Path
from typing import Dict, Any, List

import pandas as pd

from utils.file_utils import ALLOWED_EXTENSIONS, load_dataframe

logger = logging.getLogger(__name__)

DATA_EXTENSIONS = ALLOWED_EXTENSIONS  # csv, json, xlsx, xls, txt, parquet, ipynb, avro


def _collect_data_files(folder_path: str) -> List[Path]:
    """Return all supported data files found recursively in the folder."""
    root = Path(folder_path)
    found = []
    for p in root.rglob("*"):
        if p.is_file() and p.suffix.lower() in DATA_EXTENSIONS:
            found.append(p)
    return sorted(found)


def process_folder(folder_path: str, upload_dir: str) -> Dict[str, Any]:
    """
    Save each data file in `folder_path` individually with its own UUID.
    Returns a list of file descriptors compatible with all existing API routes.
    """
    files = _collect_data_files(folder_path)
    if not files:
        raise ValueError(
            "No supported data files found in the uploaded folder. "
            f"Supported formats: {', '.join(sorted(DATA_EXTENSIONS))}"
        )

    results: List[Dict] = []
    errors: List[str] = []

    for fp in files:
        try:
            df = load_dataframe(str(fp))
            file_id = str(uuid.uuid4())
            dest = os.path.join(upload_dir, f"{file_id}.parquet")
            df.to_parquet(dest, index=False)
            results.append({
                "file_id": file_id,
                "filename": fp.name,
                "size_mb": round(os.path.getsize(dest) / (1024 * 1024), 3),
                "extension": fp.suffix.lower(),
                "engine": "pandas",
                "rows": len(df),
                "columns": len(df.columns),
            })
        except Exception as e:
            errors.append(f"{fp.name}: {e}")
            logger.warning("Could not load %s: %s", fp.name, e)

    if not results:
        raise ValueError(f"Could not load any file. Errors: {'; '.join(errors)}")

    return {
        "files": results,
        "total": len(results),
        "skipped": len(errors),
        "load_errors": errors,
    }
