"""
Spark Service
-------------
Handles analysis and cleaning for large datasets (≥ 100 MB) using local PySpark.

Key design decisions:
- Single-node / local Spark only (no cluster needed)
- Spark session is created once and reused (module-level singleton)
- Falls back to Pandas for formats Spark can't read natively
"""

import os

# Module-level Spark session (created lazily on first use)
_spark = None


def _get_spark():
    """
    Return a cached local SparkSession.
    Raises RuntimeError if PySpark is not installed.
    """
    global _spark
    if _spark is not None:
        return _spark

    try:
        from pyspark.sql import SparkSession
    except ImportError as exc:
        raise RuntimeError(
            "PySpark is not installed. "
            "Install it with:  pip install pyspark\n"
            "Note: PySpark requires Java (JDK 8 or 11) to be installed."
        ) from exc

    _spark = (
        SparkSession.builder
        .master("local[*]")
        .appName("AutoEDA")
        .config("spark.driver.memory", "2g")
        .config("spark.sql.shuffle.partitions", "8")
        .config("spark.ui.showConsoleProgress", "false")
        .getOrCreate()
    )
    _spark.sparkContext.setLogLevel("ERROR")
    return _spark


# ─── Analysis ─────────────────────────────────────────────────────────────────

def analyze_with_spark(file_path: str) -> dict:
    """Analyze a large file using local PySpark."""
    spark = _get_spark()
    ext = os.path.splitext(file_path)[1].lower()

    # Load into Spark DataFrame
    if ext == ".csv":
        sdf = spark.read.csv(file_path, header=True, inferSchema=True)
    elif ext == ".parquet":
        sdf = spark.read.parquet(file_path)
    elif ext == ".json":
        sdf = spark.read.json(file_path)
    else:
        # Fall back to Pandas for unsupported Spark formats
        from services.analysis_service import _analyze_with_pandas
        return _analyze_with_pandas(file_path)

    return _spark_analysis(sdf)


def _spark_analysis(sdf) -> dict:
    """Run analysis operations on a Spark DataFrame."""
    from pyspark.sql import functions as F
    from pyspark.sql.types import NumericType

    schema = sdf.schema
    row_count = sdf.count()
    col_count = len(sdf.columns)

    column_types = {field.name: str(field.dataType) for field in schema.fields}

    numeric_cols = [
        field.name for field in schema.fields
        if isinstance(field.dataType, NumericType)
    ]
    categorical_cols = [c for c in sdf.columns if c not in numeric_cols]

    # Missing values
    missing_exprs = [F.sum(F.col(c).isNull().cast("int")).alias(c) for c in sdf.columns]
    missing_row = sdf.agg(*missing_exprs).collect()[0].asDict()
    missing_info = {
        col: {
            "count": int(missing_row[col]),
            "percentage": round(float(missing_row[col] / max(row_count, 1) * 100), 2),
        }
        for col in sdf.columns
    }

    # Duplicate rows (approximate)
    duplicate_count = int(row_count - sdf.dropDuplicates().count())

    # Descriptive stats
    stats = {}
    if numeric_cols:
        desc_pd = sdf.select(numeric_cols).describe().toPandas().set_index("summary")
        for col in numeric_cols:
            stats[col] = {
                stat: _safe_spark_float(desc_pd.loc[stat, col])
                for stat in desc_pd.index
            }

    # Outliers via IQR approximation
    outliers = {}
    for col in numeric_cols:
        quantiles = sdf.approxQuantile(col, [0.25, 0.75], 0.05)
        if len(quantiles) == 2:
            q1, q3 = quantiles
            iqr = q3 - q1
            lower = q1 - 1.5 * iqr
            upper = q3 + 1.5 * iqr
            count = sdf.filter((F.col(col) < lower) | (F.col(col) > upper)).count()
            outliers[col] = {
                "count": int(count),
                "lower_bound": round(float(lower), 4),
                "upper_bound": round(float(upper), 4),
            }

    # Correlation matrix
    correlation = {}
    if len(numeric_cols) > 1:
        try:
            from pyspark.ml.stat import Correlation
            from pyspark.ml.feature import VectorAssembler

            assembler = VectorAssembler(
                inputCols=numeric_cols,
                outputCol="features",
                handleInvalid="skip",
            )
            assembled = assembler.transform(sdf.select(numeric_cols).dropna())
            corr_matrix = Correlation.corr(assembled, "features").collect()[0][0]
            arr = corr_matrix.toArray().tolist()
            correlation = {
                numeric_cols[i]: {
                    numeric_cols[j]: round(float(arr[i][j]), 4)
                    for j in range(len(numeric_cols))
                }
                for i in range(len(numeric_cols))
            }
        except Exception:
            pass  # Correlation is optional; skip on failure

    return {
        "engine": "spark",
        "shape": {"rows": int(row_count), "columns": int(col_count)},
        "column_types": column_types,
        "missing_values": missing_info,
        "duplicate_rows": int(duplicate_count),
        "statistics": stats,
        "outliers": outliers,
        "correlation": correlation,
        "numeric_columns": numeric_cols,
        "categorical_columns": categorical_cols,
    }


# ─── Cleaning ─────────────────────────────────────────────────────────────────

def clean_with_spark(file_path: str, file_id: str) -> dict:
    """Clean a large dataset using local PySpark."""
    spark = _get_spark()
    ext = os.path.splitext(file_path)[1].lower()

    if ext == ".csv":
        sdf = spark.read.csv(file_path, header=True, inferSchema=True)
    elif ext == ".parquet":
        sdf = spark.read.parquet(file_path)
    else:
        from services.cleaning_service import _clean_with_pandas
        return _clean_with_pandas(file_path, file_id)

    from pyspark.sql import functions as F
    from pyspark.sql.types import NumericType

    original_count = sdf.count()
    log = []

    # 1. Remove duplicates
    sdf_dedup = sdf.dropDuplicates()
    dup_count = original_count - sdf_dedup.count()
    if dup_count > 0:
        log.append(f"Removed {dup_count} duplicate row(s)")
    sdf = sdf_dedup

    # 2. Identify column types
    numeric_cols = [
        field.name for field in sdf.schema.fields
        if isinstance(field.dataType, NumericType)
    ]
    categorical_cols = [c for c in sdf.columns if c not in numeric_cols]

    # 3. Fill missing values
    fill_vals = {}
    for col in numeric_cols:
        median_val = sdf.approxQuantile(col, [0.5], 0.01)[0]
        fill_vals[col] = float(median_val)
        log.append(f"Column '{col}': filled missing with median ({round(float(median_val), 4)})")

    for col in categorical_cols:
        mode_row = sdf.groupBy(col).count().orderBy(F.desc("count")).first()
        fill_val = (mode_row[0] if mode_row and mode_row[0] else "Unknown")
        fill_vals[col] = fill_val
        log.append(f"Column '{col}': filled missing with mode ('{fill_val}')")

    sdf = sdf.fillna(fill_vals)

    # Save as CSV via Pandas (single-node: this is fine)
    cleaned_path = os.path.join("cleaned", f"{file_id}_cleaned.csv")
    sdf.toPandas().to_csv(cleaned_path, index=False)

    final_count = sdf.count()

    return {
        "engine": "spark",
        "original_shape": {"rows": int(original_count), "columns": len(sdf.columns)},
        "cleaned_shape": {"rows": int(final_count), "columns": len(sdf.columns)},
        "rows_removed": int(original_count - final_count),
        "cleaning_log": log,
        "cleaned_file_id": file_id,
    }


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _safe_spark_float(value) -> float | None:
    """Convert a Spark describe() value to a Python float (or None)."""
    import math
    try:
        f = float(value)
        return None if (math.isnan(f) or math.isinf(f)) else round(f, 4)
    except (TypeError, ValueError):
        return None
