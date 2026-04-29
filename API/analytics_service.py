"""
Analytics service layer for DeepAnalyze API Server.
Implements dataset registration, quality checks, and multi-depth analysis jobs.
"""

import os
import math
import time
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from models import AnalyticsDatasetRegisterRequest, AnalyticsJobRunRequest
from storage import storage

SUPPORTED_FORMATS = {"csv", "excel", "json", "parquet"}


def _to_native(value: Any) -> Any:
    """Convert numpy/pandas values into JSON-safe native values."""
    if isinstance(value, (np.floating, np.float32, np.float64)):
        if math.isnan(float(value)) or math.isinf(float(value)):
            return None
        return float(value)
    if isinstance(value, (np.integer, np.int32, np.int64)):
        return int(value)
    if isinstance(value, (np.bool_,)):
        return bool(value)
    if pd.isna(value):
        return None
    return value


def _normalize_record(record: Dict[str, Any]) -> Dict[str, Any]:
    return {k: _to_native(v) for k, v in record.items()}


def infer_dataset_format(path: str, explicit_format: Optional[str]) -> str:
    if explicit_format:
        fmt = explicit_format.lower()
        if fmt not in SUPPORTED_FORMATS:
            raise ValueError(f"Unsupported dataset format: {explicit_format}")
        return fmt

    ext = os.path.splitext(path)[1].lower()
    mapping = {
        ".csv": "csv",
        ".xlsx": "excel",
        ".xls": "excel",
        ".json": "json",
        ".parquet": "parquet",
    }
    fmt = mapping.get(ext)
    if not fmt:
        raise ValueError("Cannot infer file format. Please provide format explicitly.")
    return fmt


def load_dataframe(path: str, dataset_format: str) -> pd.DataFrame:
    if dataset_format == "csv":
        return pd.read_csv(path)
    if dataset_format == "excel":
        return pd.read_excel(path)
    if dataset_format == "json":
        return pd.read_json(path)
    if dataset_format == "parquet":
        return pd.read_parquet(path)
    raise ValueError(f"Unsupported dataset format: {dataset_format}")


def _resolve_dataset_source(req: AnalyticsDatasetRegisterRequest) -> Tuple[str, Optional[str]]:
    if req.source_type == "uploaded_file":
        if not req.file_id:
            raise ValueError("file_id is required when source_type=uploaded_file")
        file_obj = storage.get_file(req.file_id)
        if not file_obj:
            raise ValueError(f"Uploaded file not found: {req.file_id}")
        source_path = storage.files[req.file_id].get("filepath")
        if not source_path or not os.path.exists(source_path):
            raise ValueError(f"Uploaded file content not found: {req.file_id}")
        return source_path, req.file_id

    if req.source_type == "local_path":
        if not req.path:
            raise ValueError("path is required when source_type=local_path")
        source_path = os.path.abspath(req.path)
        if not os.path.exists(source_path):
            raise ValueError(f"Local path does not exist: {req.path}")
        return source_path, None

    raise ValueError(f"Unsupported source_type: {req.source_type}")


def _dataset_overview(df: pd.DataFrame) -> Dict[str, Any]:
    row_count = int(df.shape[0])
    column_count = int(df.shape[1])
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    category_cols = [c for c in df.columns if c not in numeric_cols]

    return {
        "row_count": row_count,
        "column_count": column_count,
        "columns": [str(c) for c in df.columns.tolist()],
        "numeric_columns": [str(c) for c in numeric_cols],
        "category_columns": [str(c) for c in category_cols],
    }


def quality_checks(df: pd.DataFrame) -> Dict[str, Any]:
    row_count = max(int(df.shape[0]), 1)
    col_count = max(int(df.shape[1]), 1)
    total_cells = row_count * col_count

    missing_cells = int(df.isna().sum().sum())
    completeness = float(max(0.0, 1.0 - (missing_cells / total_cells)))

    duplicate_rows = int(df.duplicated().sum())
    duplicate_ratio = float(duplicate_rows / row_count)

    missing_by_col = (
        df.isna()
        .mean()
        .sort_values(ascending=False)
        .head(20)
        .to_dict()
    )
    missing_by_col = {str(k): round(float(v), 6) for k, v in missing_by_col.items()}

    bad_column_names = [
        str(c) for c in df.columns
        if str(c).strip() == "" or str(c).lower().startswith("unnamed")
    ]

    status = "pass"
    if completeness < 0.9 or duplicate_ratio > 0.2:
        status = "warn"
    if completeness < 0.75:
        status = "fail"

    return {
        "status": status,
        "completeness": round(completeness, 6),
        "duplicate_ratio": round(duplicate_ratio, 6),
        "missing_by_column_top20": missing_by_col,
        "bad_column_names": bad_column_names,
    }


def _numeric_summary(df: pd.DataFrame) -> Dict[str, Any]:
    numeric_df = df.select_dtypes(include=[np.number])
    if numeric_df.empty:
        return {"available": False, "message": "No numeric columns"}

    summary = numeric_df.describe(percentiles=[0.25, 0.5, 0.75]).transpose()
    summary = summary.reset_index().rename(columns={"index": "column"})
    rows = summary.to_dict(orient="records")
    return {
        "available": True,
        "rows": [_normalize_record(r) for r in rows],
    }


def _category_summary(df: pd.DataFrame, top_n: int) -> Dict[str, Any]:
    categorical_cols = [
        c for c in df.columns
        if not pd.api.types.is_numeric_dtype(df[c])
    ]
    if not categorical_cols:
        return {"available": False, "message": "No categorical columns"}

    result: Dict[str, Any] = {}
    for col in categorical_cols[:20]:
        value_counts = df[col].astype("string").fillna("<NA>").value_counts().head(top_n)
        result[str(col)] = [
            {"value": str(idx), "count": int(cnt)} for idx, cnt in value_counts.items()
        ]

    return {"available": True, "top_values": result}


def _correlation_pairs(df: pd.DataFrame) -> Dict[str, Any]:
    numeric_df = df.select_dtypes(include=[np.number])
    if numeric_df.shape[1] < 2:
        return {"available": False, "message": "Need at least two numeric columns"}

    corr = numeric_df.corr(numeric_only=True)
    pairs: List[Dict[str, Any]] = []
    cols = list(corr.columns)
    for i in range(len(cols)):
        for j in range(i + 1, len(cols)):
            val = corr.iloc[i, j]
            if pd.isna(val):
                continue
            pairs.append(
                {
                    "left": str(cols[i]),
                    "right": str(cols[j]),
                    "correlation": float(val),
                    "abs_correlation": abs(float(val)),
                }
            )

    pairs.sort(key=lambda x: x["abs_correlation"], reverse=True)
    for pair in pairs:
        pair.pop("abs_correlation", None)

    return {"available": True, "top_pairs": pairs[:20]}


def _group_by_metrics(df: pd.DataFrame, group_by: List[str]) -> Dict[str, Any]:
    if not group_by:
        return {"available": False, "message": "No group_by columns provided"}

    valid_group = [g for g in group_by if g in df.columns]
    if not valid_group:
        return {"available": False, "message": "None of group_by columns exist in dataset"}

    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    if not numeric_cols:
        return {"available": False, "message": "No numeric columns for aggregation"}

    agg = df.groupby(valid_group)[numeric_cols].agg(["count", "mean", "sum"]).reset_index()
    agg.columns = [
        "_".join([str(x) for x in col if str(x) != ""]).strip("_")
        for col in agg.columns.to_flat_index()
    ]
    rows = agg.head(200).to_dict(orient="records")
    return {
        "available": True,
        "group_columns": valid_group,
        "rows": [_normalize_record(r) for r in rows],
    }


def _time_trend(df: pd.DataFrame, time_column: Optional[str], target_column: Optional[str]) -> Dict[str, Any]:
    if not time_column or time_column not in df.columns:
        return {"available": False, "message": "time_column is missing or invalid"}

    local_df = df.copy()
    local_df[time_column] = pd.to_datetime(local_df[time_column], errors="coerce")
    local_df = local_df.dropna(subset=[time_column])
    if local_df.empty:
        return {"available": False, "message": "No valid datetime rows"}

    metric = target_column
    if not metric or metric not in local_df.columns or not pd.api.types.is_numeric_dtype(local_df[metric]):
        numeric_cols = local_df.select_dtypes(include=[np.number]).columns.tolist()
        if not numeric_cols:
            return {"available": False, "message": "No numeric target for trend"}
        metric = numeric_cols[0]

    trend = (
        local_df
        .set_index(time_column)[metric]
        .resample("D")
        .mean()
        .dropna()
        .reset_index()
    )
    if trend.empty:
        return {"available": False, "message": "Trend result is empty"}

    rows = trend.tail(200).to_dict(orient="records")
    rows = [_normalize_record(r) for r in rows]
    return {
        "available": True,
        "time_column": time_column,
        "metric": metric,
        "points": rows,
    }


def _anomaly_scan(df: pd.DataFrame) -> Dict[str, Any]:
    numeric_df = df.select_dtypes(include=[np.number])
    if numeric_df.empty:
        return {"available": False, "message": "No numeric columns"}

    findings: List[Dict[str, Any]] = []
    for col in numeric_df.columns[:30]:
        series = numeric_df[col].dropna()
        if series.shape[0] < 5:
            continue
        std = float(series.std())
        if std == 0:
            continue
        zscore = ((series - float(series.mean())) / std).abs()
        count = int((zscore > 3).sum())
        ratio = count / max(int(series.shape[0]), 1)
        if count > 0:
            findings.append(
                {
                    "column": str(col),
                    "anomaly_count": count,
                    "anomaly_ratio": round(float(ratio), 6),
                }
            )

    findings.sort(key=lambda x: x["anomaly_ratio"], reverse=True)
    return {
        "available": True,
        "findings": findings[:20],
    }


def _render_report(job_result: Dict[str, Any]) -> str:
    overview = job_result.get("overview", {})
    quality = job_result.get("quality", {})
    depth = job_result.get("depth")

    lines = [
        "# Analytics Report",
        "",
        "## Overview",
        f"- Rows: {overview.get('row_count', 'N/A')}",
        f"- Columns: {overview.get('column_count', 'N/A')}",
        f"- Analysis depth: {depth}",
        "",
        "## Data Quality",
        f"- Status: {quality.get('status', 'N/A')}",
        f"- Completeness: {quality.get('completeness', 'N/A')}",
        f"- Duplicate ratio: {quality.get('duplicate_ratio', 'N/A')}",
        "",
    ]

    numeric_summary = job_result.get("numeric_summary", {})
    if numeric_summary.get("available"):
        lines.extend([
            "## Numeric Summary",
            f"- Numeric columns analyzed: {len(numeric_summary.get('rows', []))}",
            "",
        ])

    category_summary = job_result.get("category_summary", {})
    if category_summary.get("available"):
        lines.extend([
            "## Category Summary",
            f"- Category columns analyzed: {len(category_summary.get('top_values', {}))}",
            "",
        ])

    correlation = job_result.get("correlation", {})
    if correlation.get("available"):
        lines.extend([
            "## Correlation",
            f"- Top correlation pairs: {len(correlation.get('top_pairs', []))}",
            "",
        ])

    trend = job_result.get("time_trend", {})
    if trend.get("available"):
        lines.extend([
            "## Time Trend",
            f"- Time column: {trend.get('time_column')}",
            f"- Metric: {trend.get('metric')}",
            f"- Points: {len(trend.get('points', []))}",
            "",
        ])

    anomaly = job_result.get("anomaly_scan", {})
    if anomaly.get("available"):
        lines.extend([
            "## Anomaly Scan",
            f"- Findings: {len(anomaly.get('findings', []))}",
            "",
        ])

    return "\n".join(lines).strip() + "\n"


def register_dataset(req: AnalyticsDatasetRegisterRequest) -> Dict[str, Any]:
    source_path, file_id = _resolve_dataset_source(req)
    dataset_format = infer_dataset_format(source_path, req.format)

    df = load_dataframe(source_path, dataset_format)
    overview = _dataset_overview(df)

    dataset = storage.create_dataset(
        {
            "name": req.name,
            "source_type": req.source_type,
            "path": source_path,
            "file_id": file_id,
            "format": dataset_format,
            "status": "ready",
            "row_count": overview["row_count"],
            "column_count": overview["column_count"],
            "description": req.description,
            "metadata": req.metadata,
        }
    )
    return dataset


def run_analysis_job(req: AnalyticsJobRunRequest) -> Dict[str, Any]:
    dataset = storage.get_dataset(req.dataset_id)
    if not dataset:
        raise ValueError(f"Dataset not found: {req.dataset_id}")

    source_path = dataset.get("path")
    if not source_path or not os.path.exists(source_path):
        raise ValueError(f"Dataset file is unavailable: {req.dataset_id}")

    job = storage.create_analytics_job(
        {
            "dataset_id": req.dataset_id,
            "depth": req.depth,
            "status": "running",
        }
    )
    job_id = job["id"]

    started_at = int(time.time())
    try:
        df = load_dataframe(source_path, dataset["format"])
        result: Dict[str, Any] = {
            "depth": req.depth,
            "overview": _dataset_overview(df),
            "quality": quality_checks(df),
        }

        if req.depth in {"standard", "deep"}:
            result["numeric_summary"] = _numeric_summary(df)
            result["category_summary"] = _category_summary(df, req.top_n_categories)
            result["correlation"] = _correlation_pairs(df)
            result["group_by"] = _group_by_metrics(df, req.group_by)

        if req.depth == "deep":
            result["time_trend"] = _time_trend(df, req.time_column, req.target_column)
            result["anomaly_scan"] = _anomaly_scan(df)

        result["report_markdown"] = _render_report(result)

        storage.update_analytics_job(
            job_id,
            {
                "status": "completed",
                "finished_at": int(time.time()),
                "duration_seconds": int(time.time()) - started_at,
                "result": result,
            },
        )
    except Exception as exc:
        storage.update_analytics_job(
            job_id,
            {
                "status": "failed",
                "finished_at": int(time.time()),
                "duration_seconds": int(time.time()) - started_at,
                "error": str(exc),
                "result": {},
            },
        )

    updated = storage.get_analytics_job(job_id)
    if not updated:
        raise ValueError("Job state lost")
    return updated
