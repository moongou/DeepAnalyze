"""
Models API for DeepAnalyze API Server
Handles model listing endpoints (OpenAI compatible)
"""

import time

from fastapi import APIRouter, HTTPException

from model_gateway import model_gateway
from models import ModelObject, ModelsListResponse


# Create router for models endpoints
router = APIRouter(prefix="/v1/models", tags=["models"])


@router.get("", response_model=ModelsListResponse)
async def list_models():
    """
    List available models (OpenAI compatible)
    Returns a list of models that can be used with the API
    """
    available_models = []
    for item in model_gateway.list_models(include_disabled=False):
        available_models.append(
            {
                "id": item.get("id"),
                "created": int(time.time()),
                "owned_by": item.get("provider_id", "deepanalyze"),
            }
        )

    if not available_models:
        provider_defaults = model_gateway.list_providers(include_disabled=False)
        owner = provider_defaults[0].get("id", "deepanalyze") if provider_defaults else "deepanalyze"
        available_models.append(
            {
                "id": "default",
                "created": int(time.time()),
                "owned_by": owner,
            }
        )

    model_objects = [ModelObject(**model) for model in available_models]

    return ModelsListResponse(
        object="list",
        data=model_objects
    )


@router.get("/{model_id}", response_model=ModelObject)
async def retrieve_model(model_id: str):
    """
    Retrieve a specific model (OpenAI compatible)
    Returns information about a specific model
    """
    for item in model_gateway.list_models(include_disabled=False):
        if item.get("id") == model_id:
            return ModelObject(
                id=model_id,
                created=int(time.time()),
                owned_by=item.get("provider_id", "deepanalyze"),
            )

    raise HTTPException(status_code=404, detail=f"Model not found: {model_id}")