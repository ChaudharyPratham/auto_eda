"""
Visualization Service
---------------------
Generates Plotly-compatible chart data from a dataset.

Rules:
- Numerical columns  → histograms + box plots
- Categorical columns → bar charts + pie charts (top 20 categories)
- ≥ 2 numeric columns → correlation heatmap + scatter plots (first 3 pairs)

Large datasets are sampled to keep response sizes manageable.
"""

import numpy as np
import pandas as pd

from utils.file_utils import load_dataframe

# Maximum sample sizes for chart data (performance + response size)
MAX_HIST_SAMPLES = 5_000
MAX_SCATTER_SAMPLES = 1_000
MAX_CATEGORIES = 20
MAX_CATEGORICAL_COLS = 5   # limit pie/bar charts to first N categorical columns


def generate_visualizations(file_path: str) -> dict:
    """
    Build all chart data objects for the uploaded file.
    Returns a dict with keys:  histograms, boxplots, bar_charts,
    pie_charts, correlation_heatmap, scatter_plots.
    """
    df = load_dataframe(file_path)

    # Sample for visual charts to keep response fast
    df_vis = df.sample(n=min(MAX_HIST_SAMPLES, len(df)), random_state=42) if len(df) > MAX_HIST_SAMPLES else df

    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    categorical_cols = df.select_dtypes(include=["object", "category"]).columns.tolist()

    result = {
        "histograms": _build_histograms(df_vis, numeric_cols),
        "boxplots": _build_boxplots(df_vis, numeric_cols),
        "bar_charts": _build_bar_charts(df, categorical_cols),
        "pie_charts": _build_pie_charts(df, categorical_cols),
        "correlation_heatmap": _build_heatmap(df, numeric_cols),
        "scatter_plots": _build_scatter_plots(df_vis, numeric_cols),
    }
    return result


# ─── Chart builders ───────────────────────────────────────────────────────────

def _build_histograms(df: pd.DataFrame, cols: list) -> list:
    charts = []
    for col in cols:
        values = df[col].dropna().tolist()
        if values:
            charts.append({"column": col, "x": values, "type": "histogram"})
    return charts


def _build_boxplots(df: pd.DataFrame, cols: list) -> list:
    charts = []
    for col in cols:
        values = df[col].dropna().tolist()
        if values:
            charts.append({"column": col, "y": values, "name": col, "type": "box"})
    return charts


def _build_bar_charts(df: pd.DataFrame, cols: list) -> list:
    charts = []
    for col in cols[:MAX_CATEGORICAL_COLS]:
        counts = df[col].value_counts().head(MAX_CATEGORIES)
        if not counts.empty:
            charts.append({
                "column": col,
                "x": counts.index.tolist(),
                "y": counts.values.tolist(),
                "type": "bar",
            })
    return charts


def _build_pie_charts(df: pd.DataFrame, cols: list) -> list:
    charts = []
    for col in cols[:MAX_CATEGORICAL_COLS]:
        counts = df[col].value_counts().head(MAX_CATEGORIES)
        if not counts.empty:
            charts.append({
                "column": col,
                "labels": counts.index.tolist(),
                "values": counts.values.tolist(),
                "type": "pie",
            })
    return charts


def _build_heatmap(df: pd.DataFrame, cols: list) -> dict | None:
    if len(cols) < 2:
        return None
    corr = df[cols].corr().round(3).fillna(0)
    return {
        "z": corr.values.tolist(),
        "x": corr.columns.tolist(),
        "y": corr.index.tolist(),
        "type": "heatmap",
    }


def _build_scatter_plots(df: pd.DataFrame, cols: list) -> list:
    if len(cols) < 2:
        return []

    sample = df.sample(n=min(MAX_SCATTER_SAMPLES, len(df)), random_state=42)
    plots = []

    # Generate at most 3 scatter plots from the first few numeric column pairs
    for i in range(min(3, len(cols))):
        for j in range(i + 1, min(4, len(cols))):
            x_col, y_col = cols[i], cols[j]
            plots.append({
                "x_col": x_col,
                "y_col": y_col,
                "x": sample[x_col].dropna().tolist(),
                "y": sample[y_col].dropna().tolist(),
                "type": "scatter",
            })

    return plots
