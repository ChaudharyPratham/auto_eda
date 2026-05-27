"""
Image Dataset Service
Handles analysis, cleaning, and sampling of image folders for deep learning datasets.
"""

import io
import os
import shutil
import hashlib
import base64
import zipfile
import logging
from pathlib import Path
from typing import Any, Dict, List

logger = logging.getLogger(__name__)

IMAGE_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".bmp", ".gif",
    ".tiff", ".tif", ".webp", ".PNG", ".JPG",
    ".JPEG", ".BMP", ".GIF", ".TIFF", ".TIF", ".WEBP",
}


def _get_image_files(folder_path: str) -> List[Path]:
    folder = Path(folder_path)
    images = []
    for p in folder.rglob("*"):
        if p.is_file() and p.suffix in IMAGE_EXTENSIONS:
            images.append(p)
    return sorted(images)


def _histogram(values: list, bins: int = 10) -> Dict:
    if not values:
        return {"bins": [], "counts": []}
    min_v, max_v = min(values), max(values)
    if min_v == max_v:
        return {"bins": [str(min_v)], "counts": [len(values)]}
    step = (max_v - min_v) / bins
    edges = [min_v + i * step for i in range(bins + 1)]
    counts = [0] * bins
    for v in values:
        idx = min(int((v - min_v) / step), bins - 1)
        counts[idx] += 1
    labels = [f"{int(edges[i])}-{int(edges[i+1])}" for i in range(bins)]
    return {"bins": labels, "counts": counts}


def analyze_images(folder_path: str) -> Dict[str, Any]:
    """Full statistical analysis of an image dataset folder."""
    try:
        from PIL import Image as PILImage
    except ImportError:
        raise RuntimeError("Pillow is required. Run: pip install Pillow")

    images = _get_image_files(folder_path)
    if not images:
        raise ValueError("No image files found in the uploaded folder.")

    folder = Path(folder_path)

    # Detect class structure (subdirectory = class label)
    classes: Dict[str, int] = {}
    for img_path in images:
        rel = img_path.relative_to(folder)
        parts = rel.parts
        cls = parts[0] if len(parts) > 1 else "_root"
        classes[cls] = classes.get(cls, 0) + 1

    widths, heights, file_sizes = [], [], []
    formats: Dict[str, int] = {}
    channel_counts: Dict[str, int] = {"Grayscale": 0, "RGB": 0, "RGBA": 0, "Other": 0}
    corrupted: List[str] = []
    hashes: Dict[str, List[str]] = {}

    for img_path in images:
        file_sizes.append(img_path.stat().st_size)
        try:
            with PILImage.open(img_path) as img:
                img.verify()          # catches truncated files
            with PILImage.open(img_path) as img:
                w, h = img.size
                widths.append(w)
                heights.append(h)
                fmt = (img.format or img_path.suffix.lstrip(".").upper()).upper()
                formats[fmt] = formats.get(fmt, 0) + 1
                mode = img.mode
                if mode == "L":
                    channel_counts["Grayscale"] += 1
                elif mode == "RGB":
                    channel_counts["RGB"] += 1
                elif mode == "RGBA":
                    channel_counts["RGBA"] += 1
                else:
                    channel_counts["Other"] += 1
                img_hash = hashlib.md5(img.tobytes()).hexdigest()
                hashes.setdefault(img_hash, []).append(str(img_path.relative_to(folder)))
        except Exception:
            corrupted.append(str(img_path.relative_to(folder)))

    duplicate_groups = [paths for paths in hashes.values() if len(paths) > 1]
    duplicate_count = sum(len(g) - 1 for g in duplicate_groups)
    duplicate_examples = [p for g in duplicate_groups for p in g[1:]][:20]

    total = len(images)
    valid = total - len(corrupted)

    return {
        "total_images": total,
        "valid_images": valid,
        "corrupted_count": len(corrupted),
        "corrupted_files": corrupted[:20],
        "duplicate_count": duplicate_count,
        "duplicate_files": duplicate_examples,
        "total_size_mb": round(sum(file_sizes) / (1024 * 1024), 2),
        "classes": classes,
        "class_count": len(classes),
        "is_structured": any(k != "_root" for k in classes),
        "formats": formats,
        "channels": {k: v for k, v in channel_counts.items() if v > 0},
        "dimensions": {
            "width_mean": round(sum(widths) / len(widths), 1) if widths else 0,
            "height_mean": round(sum(heights) / len(heights), 1) if heights else 0,
            "width_min": min(widths) if widths else 0,
            "width_max": max(widths) if widths else 0,
            "height_min": min(heights) if heights else 0,
            "height_max": max(heights) if heights else 0,
        },
        "width_histogram": _histogram(widths),
        "height_histogram": _histogram(heights),
    }


def get_sample_images(folder_path: str, n: int = 16) -> List[Dict]:
    """Return base64-encoded thumbnail previews of sample images."""
    try:
        from PIL import Image as PILImage
    except ImportError:
        return []

    images = _get_image_files(folder_path)
    folder = Path(folder_path)

    # Evenly spaced sampling across the full set
    if len(images) > n:
        step = max(1, len(images) // n)
        images = images[::step][:n]

    samples = []
    for img_path in images:
        try:
            with PILImage.open(img_path) as img:
                img = img.convert("RGB")
                img.thumbnail((224, 224))
                buf = io.BytesIO()
                img.save(buf, format="JPEG", quality=75)
                b64 = base64.b64encode(buf.getvalue()).decode()
            rel = img_path.relative_to(folder)
            parts = rel.parts
            samples.append({
                "path": str(rel).replace("\\", "/"),
                "label": parts[0] if len(parts) > 1 else "_root",
                "filename": img_path.name,
                "size_kb": round(img_path.stat().st_size / 1024, 1),
                "data": f"data:image/jpeg;base64,{b64}",
            })
        except Exception:
            pass

    return samples


def clean_images(
    folder_path: str,
    cleaned_dir: str,
    remove_corrupted: bool = True,
    remove_duplicates: bool = True,
) -> Dict[str, Any]:
    """
    Clean the image dataset: remove corrupted and/or duplicate images.
    Copies kept images to `cleaned_dir` preserving the subdirectory structure.
    """
    try:
        from PIL import Image as PILImage
    except ImportError:
        raise RuntimeError("Pillow is required. Run: pip install Pillow")

    images = _get_image_files(folder_path)
    folder = Path(folder_path)
    dest_root = Path(cleaned_dir)
    dest_root.mkdir(parents=True, exist_ok=True)

    removed_corrupted: List[str] = []
    removed_duplicates: List[str] = []
    hashes_seen: set = set()
    kept = 0

    for img_path in images:
        rel = img_path.relative_to(folder)
        try:
            with PILImage.open(img_path) as img:
                img.verify()
            with PILImage.open(img_path) as img:
                img_hash = hashlib.md5(img.tobytes()).hexdigest()

            if remove_duplicates and img_hash in hashes_seen:
                removed_duplicates.append(str(rel).replace("\\", "/"))
                continue

            hashes_seen.add(img_hash)
            dest = dest_root / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(img_path, dest)
            kept += 1

        except Exception:
            if remove_corrupted:
                removed_corrupted.append(str(rel).replace("\\", "/"))
            else:
                dest = dest_root / rel
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(img_path, dest)
                kept += 1

    return {
        "kept": kept,
        "removed_corrupted": len(removed_corrupted),
        "removed_duplicates": len(removed_duplicates),
        "corrupted_files": removed_corrupted[:50],
        "duplicate_files": removed_duplicates[:50],
    }


def create_zip(cleaned_dir: str, zip_path: str) -> str:
    """Zip all files in cleaned_dir and return the zip path."""
    root = Path(cleaned_dir)
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in root.rglob("*"):
            if f.is_file():
                zf.write(f, f.relative_to(root))
    return zip_path
