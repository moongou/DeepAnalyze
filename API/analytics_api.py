"""
Analytics API for DeepAnalyze API Server.
Provides layered analytics capabilities: dataset registration, quality checks, and analysis jobs.
"""

from fastapi import APIRouter, HTTPException

from analytics_service import register_dataset, run_analysis_job
from models import (
    AnalyticsDatasetRegisterRequest,
    AnalyticsDatasetObject,
    AnalyticsDatasetsListResponse,
    AnalyticsJobObject,
    AnalyticsJobRunRequest,
    AnalyticsJobsListResponse,
)
from storage import storage


router = APIRouter(prefix="/v1/analytics", tags=["analytics"])


@router.post("/datasets/register", response_model=AnalyticsDatasetObject)
async def register_analytics_dataset(req: AnalyticsDatasetRegisterRequest):
    """Register a dataset for layered analytics processing."""
    try:
        dataset = register_dataset(req)
        return AnalyticsDatasetObject(**dataset)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to register dataset: {exc}")


@router.get("/datasets", response_model=AnalyticsDatasetsListResponse)
async def list_analytics_datasets():
    """List all registered datasets."""
    items = [AnalyticsDatasetObject(**d) for d in storage.list_datasets()]
    return AnalyticsDatasetsListResponse(object="list", data=items)


@router.get("/datasets/{dataset_id}", response_model=AnalyticsDatasetObject)
async def get_analytics_dataset(dataset_id: str):
    """Get one dataset metadata object."""
    dataset = storage.get_dataset(dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return AnalyticsDatasetObject(**dataset)


@router.post("/jobs/run", response_model=AnalyticsJobObject)
async def run_analytics_job(req: AnalyticsJobRunRequest):
    """Run an analysis job synchronously and return the job result."""
    try:
        job = run_analysis_job(req)
        return AnalyticsJobObject(**job)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to run analysis: {exc}")


@router.get("/jobs", response_model=AnalyticsJobsListResponse)
async def list_analytics_jobs():
    """List analytics jobs."""
    jobs = [AnalyticsJobObject(**j) for j in storage.list_analytics_jobs()]
    return AnalyticsJobsListResponse(object="list", data=jobs)


@router.get("/jobs/{job_id}", response_model=AnalyticsJobObject)
async def get_analytics_job(job_id: str):
    """Get one analytics job."""
    job = storage.get_analytics_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Analytics job not found")
    return AnalyticsJobObject(**job)
