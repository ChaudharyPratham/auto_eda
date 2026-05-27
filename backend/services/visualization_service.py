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


# ══════════════════════════════════════════════════════════════════════════════
# Chart Builder — used by POST /visualize/{file_id}/custom
# ══════════════════════════════════════════════════════════════════════════════

MAX_FILTER_VALUES = 50   # unique values returned for filter dropdowns
MAX_BAR_GROUPS   = 50   # max X-axis categories in a bar chart

PALETTE = [
    "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
    "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16",
]


def get_column_info(file_path: str) -> dict:
    """
    Return column metadata for the chart builder UI.
    Each entry has: name, type (numeric|categorical|datetime),
    null_count, and sample_values (top 50 for categoricals).
    """
    df = load_dataframe(file_path)
    columns = []
    for col in df.columns:
        dtype = df[col].dtype
        if pd.api.types.is_numeric_dtype(dtype):
            col_type = "numeric"
            sample_values = []
        elif pd.api.types.is_datetime64_any_dtype(dtype):
            col_type = "datetime"
            sample_values = []
        else:
            col_type = "categorical"
            sample_values = (
                df[col].dropna().astype(str)
                .value_counts().head(MAX_FILTER_VALUES).index.tolist()
            )
        columns.append({
            "name": col,
            "type": col_type,
            "null_count": int(df[col].isna().sum()),
            "sample_values": sample_values,
        })
    return {"columns": columns, "row_count": len(df)}


def build_custom_chart(
    file_path: str,
    chart_type: str,
    x_col,
    y_cols: list,
    agg: str,
    filters: list,
) -> dict:
    """
    Build a single custom Plotly chart.
    Returns {"traces": [...], "layout": {...}} for Plotly.react().
    """
    df = load_dataframe(file_path)
    df = _apply_filters(df, filters)

    if df.empty:
        return {"traces": [], "layout": {"title": {"text": "No data matches the active filters"}}}

    # Sample for performance
    df_vis = df.sample(n=min(MAX_HIST_SAMPLES, len(df)), random_state=42) if len(df) > MAX_HIST_SAMPLES else df

    if chart_type == "bar":
        return _custom_bar(df, x_col, y_cols, agg)
    elif chart_type == "histogram":
        return _custom_histogram(df_vis, y_cols if y_cols else ([x_col] if x_col else []))
    elif chart_type == "scatter":
        return _custom_scatter(df_vis, x_col, y_cols)
    elif chart_type == "pie":
        return _custom_pie(df, x_col, y_cols, agg)
    else:
        return {"traces": [], "layout": {"title": {"text": f"Unknown chart type: {chart_type}"}}}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _apply_filters(df: pd.DataFrame, filters: list) -> pd.DataFrame:
    for f in filters:
        col = f.get("col", "")
        op  = f.get("op",  "eq")
        val = f.get("value", "")
        if not col or col not in df.columns or val == "":
            continue
        try:
            if op == "eq":
                try:
                    df = df[pd.to_numeric(df[col], errors="coerce") == float(val)]
                except (ValueError, TypeError):
                    df = df[df[col].astype(str) == val]
            elif op == "ne":
                try:
                    df = df[pd.to_numeric(df[col], errors="coerce") != float(val)]
                except (ValueError, TypeError):
                    df = df[df[col].astype(str) != val]
            elif op == "contains":
                df = df[df[col].astype(str).str.contains(val, case=False, na=False)]
            elif op == "gt":
                df = df[pd.to_numeric(df[col], errors="coerce") > float(val)]
            elif op == "lt":
                df = df[pd.to_numeric(df[col], errors="coerce") < float(val)]
            elif op == "gte":
                df = df[pd.to_numeric(df[col], errors="coerce") >= float(val)]
            elif op == "lte":
                df = df[pd.to_numeric(df[col], errors="coerce") <= float(val)]
        except Exception:
            pass
    return df


def _agg_series(df: pd.DataFrame, group_col: str, val_col: str, agg: str):
    g = df.groupby(group_col)[val_col]
    fns = {"sum": g.sum, "mean": g.mean, "count": g.count,
           "median": g.median, "min": g.min, "max": g.max}
    result = fns.get(agg, g.sum)()
    return result.round(4) if agg in ("mean", "median") else result


_BASE_LAYOUT = {
    "margin":       {"t": 36, "r": 20, "b": 60, "l": 60},
    "plot_bgcolor":  "#f9fafb",
    "paper_bgcolor": "transparent",
    "font":         {"family": "Inter, sans-serif", "size": 12},
    "legend":       {"orientation": "h", "y": -0.25},
}


def _custom_bar(df, x_col, y_cols, agg):
    if not x_col or not y_cols:
        return {"traces": [], "layout": {**_BASE_LAYOUT, "title": {"text": "Select X-Axis and at least one Y-Axis column"}}}
    traces = []
    for i, y_col in enumerate(y_cols):
        if y_col not in df.columns or x_col not in df.columns:
            continue
        agg_data = _agg_series(df, x_col, y_col, agg).head(MAX_BAR_GROUPS)
        traces.append({
            "type": "bar",
            "x": agg_data.index.astype(str).tolist(),
            "y": [round(v, 4) if isinstance(v, float) else v for v in agg_data.values.tolist()],
            "name": y_col,
            "marker": {"color": PALETTE[i % len(PALETTE)]},
        })
    layout = {
        **_BASE_LAYOUT,
        "barmode": "group",
        "xaxis": {"title": {"text": x_col}, "automargin": True, "tickangle": -30},
        "yaxis": {"title": {"text": f"{agg.capitalize()} of values"}},
    }
    return {"traces": traces, "layout": layout}


def _custom_histogram(df_vis, cols):
    if not cols:
        return {"traces": [], "layout": {**_BASE_LAYOUT, "title": {"text": "Select at least one column"}}}
    traces = []
    for i, col in enumerate(cols):
        if col not in df_vis.columns:
            continue
        traces.append({
            "type": "histogram",
            "x": df_vis[col].dropna().tolist(),
            "name": col,
            "opacity": 0.75,
            "marker": {"color": PALETTE[i % len(PALETTE)]},
        })
    layout = {
        **_BASE_LAYOUT,
        "barmode": "overlay",
        "xaxis": {"title": {"text": "Value"}, "automargin": True},
        "yaxis": {"title": {"text": "Count"}},
    }
    return {"traces": traces, "layout": layout}


def _custom_scatter(df_vis, x_col, y_cols):
    if not x_col or not y_cols:
        return {"traces": [], "layout": {**_BASE_LAYOUT, "title": {"text": "Select X-Axis and at least one Y-Axis column"}}}
    if x_col not in df_vis.columns:
        return {"traces": [], "layout": {**_BASE_LAYOUT, "title": {"text": f"Column '{x_col}' not found"}}}
    traces = []
    for i, y_col in enumerate(y_cols):
        if y_col not in df_vis.columns:
            continue
        valid = df_vis[[x_col, y_col]].dropna()
        traces.append({
            "type": "scatter",
            "mode": "markers",
            "x": valid[x_col].tolist(),
            "y": valid[y_col].tolist(),
            "name": y_col,
            "marker": {"color": PALETTE[i % len(PALETTE)], "size": 6, "opacity": 0.7},
        })
    layout = {
        **_BASE_LAYOUT,
        "xaxis": {"title": {"text": x_col}, "automargin": True},
        "yaxis": {"title": {"text": y_cols[0] if len(y_cols) == 1 else "Values"}},
    }
    return {"traces": traces, "layout": layout}


def _custom_pie(df, x_col, y_cols, agg):
    if not x_col or x_col not in df.columns:
        return {"traces": [], "layout": {**_BASE_LAYOUT, "title": {"text": "Select X-Axis for pie slices"}}}
    if y_cols and y_cols[0] in df.columns:
        agg_data = _agg_series(df, x_col, y_cols[0], agg).head(20)
        labels = agg_data.index.astype(str).tolist()
        values = agg_data.values.tolist()
    else:
        counts = df[x_col].value_counts().head(20)
        labels = counts.index.astype(str).tolist()
        values = counts.values.tolist()
    traces = [{
        "type": "pie",
        "labels": labels,
        "values": values,
        "hole": 0.35,
        "textinfo": "label+percent",
        "marker": {"colors": (PALETTE * ((len(labels) // len(PALETTE)) + 2))[:len(labels)]},
    }]
    layout = {
        **_BASE_LAYOUT,
        "margin": {"t": 20, "r": 20, "b": 20, "l": 20},
        "legend": {"orientation": "v"},
    }
    return {"traces": traces, "layout": layout}
