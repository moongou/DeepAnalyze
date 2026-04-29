"""
Admin API for DeepAnalyze API Server
Handles administrative endpoints like thread cleanup and statistics
"""

import time
from fastapi import APIRouter, Query, HTTPException

from config import CLEANUP_TIMEOUT_HOURS
from model_gateway import model_gateway
from models import (
    ThreadCleanupRequest,
    ThreadCleanupResponse,
    ThreadStatsResponse,
    ModelProviderUpsertRequest,
    ModelProviderObject,
    ModelProvidersListResponse,
    ModelCatalogUpsertRequest,
    ModelCatalogObject,
    ModelCatalogListResponse,
)
from storage import storage


# Create router for admin endpoints
router = APIRouter(prefix="/v1/admin", tags=["admin"])


def _mask_provider_secret(provider: dict) -> dict:
    masked = dict(provider)
    if masked.get("api_key"):
        masked["api_key"] = "******"
    return masked


@router.post("/cleanup-threads", response_model=ThreadCleanupResponse)
async def manual_cleanup_threads(
    timeout_hours: int = Query(CLEANUP_TIMEOUT_HOURS, description="Timeout in hours for thread cleanup")
):
    """
    Manual trigger for thread cleanup (Admin API)
    Clean up threads that haven't been accessed for more than timeout_hours
    """
    try:
        cleaned_count = storage.cleanup_expired_threads(timeout_hours=timeout_hours)
        return ThreadCleanupResponse(
            status="success",
            cleaned_threads=cleaned_count,
            timeout_hours=timeout_hours,
            timestamp=int(time.time())
        )
    except Exception as e:
        return ThreadCleanupResponse(
            status="error",
            cleaned_threads=0,
            timeout_hours=timeout_hours,
            timestamp=int(time.time())
        )


@router.get("/threads-stats", response_model=ThreadStatsResponse)
async def get_threads_stats():
    """
    Get statistics about threads (Admin API)
    """
    with storage._lock:
        total_threads = len(storage.threads)
        now = int(time.time())

        # Count threads by age categories
        recent_threads = 0  # < 1 hour
        old_threads = 0     # 1-12 hours
        expired_threads = 0 # > 12 hours

        for thread_data in storage.threads.values():
            last_accessed = thread_data.get("last_accessed_at", thread_data.get("created_at", 0))
            age_hours = (now - last_accessed) / 3600

            if age_hours < 1:
                recent_threads += 1
            elif age_hours <= CLEANUP_TIMEOUT_HOURS:
                old_threads += 1
            else:
                expired_threads += 1

    return ThreadStatsResponse(
        total_threads=total_threads,
        recent_threads=recent_threads,  # < 1 hour
        old_threads=old_threads,        # 1-12 hours
        expired_threads=expired_threads, # > 12 hours
        timeout_hours=CLEANUP_TIMEOUT_HOURS,
        timestamp=int(time.time())
    )


@router.get("/model-providers", response_model=ModelProvidersListResponse)
async def list_model_providers(include_disabled: bool = Query(True)):
    """List model providers in model gateway."""
    providers = model_gateway.list_providers(include_disabled=include_disabled)
    items = [ModelProviderObject(**_mask_provider_secret(p)) for p in providers]
    return ModelProvidersListResponse(object="list", data=items)


@router.post("/model-providers", response_model=ModelProviderObject)
async def upsert_model_provider(req: ModelProviderUpsertRequest):
    """Create or update one model provider."""
    try:
        provider = model_gateway.upsert_provider(req.dict())
        return ModelProviderObject(**_mask_provider_secret(provider))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/model-providers/{provider_id}")
async def delete_model_provider(provider_id: str):
    """Delete one model provider and its mapped models."""
    deleted = model_gateway.remove_provider(provider_id)
    return {"id": provider_id, "deleted": deleted}


@router.get("/model-catalog", response_model=ModelCatalogListResponse)
async def list_model_catalog(include_disabled: bool = Query(True)):
    """List model catalog items exposed to agents."""
    models = model_gateway.list_models(include_disabled=include_disabled)
    items = [ModelCatalogObject(**m) for m in models]
    return ModelCatalogListResponse(object="list", data=items)


@router.post("/model-catalog", response_model=ModelCatalogObject)
async def upsert_model_catalog(req: ModelCatalogUpsertRequest):
    """Create or update one exposed model id."""
    try:
        model_item = model_gateway.upsert_model(req.dict())
        return ModelCatalogObject(**model_item)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/model-catalog/{model_id}")
async def delete_model_catalog(model_id: str):
    """Delete one exposed model id from catalog."""
    deleted = model_gateway.remove_model(model_id)
    return {"id": model_id, "deleted": deleted}