"""
Release governance API for offline baselines, online metrics, and release gate decisions.
"""

from fastapi import APIRouter, HTTPException, Query

from models import (
    OfflineEvaluationObject,
    OfflineEvaluationsListResponse,
    OfflineEvaluationRunRequest,
    OnlineMetricsObject,
    ReleaseGateDecisionObject,
    ReleaseGateDecisionsListResponse,
    ReleaseGateEvaluateRequest,
)
from release_governance_service import release_governance_service


router = APIRouter(prefix="/v1/governance", tags=["governance"])


@router.post("/offline-evals/run", response_model=OfflineEvaluationObject)
async def run_offline_evaluation(req: OfflineEvaluationRunRequest):
    """Run one offline baseline evaluation."""
    try:
        record = release_governance_service.run_offline_evaluation(req.dict())
        return OfflineEvaluationObject(**record)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/offline-evals", response_model=OfflineEvaluationsListResponse)
async def list_offline_evaluations(
    candidate_id: str = Query(default=""),
    candidate_type: str = Query(default=""),
    status: str = Query(default=""),
):
    """List offline baseline evaluation records."""
    try:
        items = [
            OfflineEvaluationObject(**row)
            for row in release_governance_service.list_offline_evaluations(
                candidate_id=candidate_id or None,
                candidate_type=candidate_type or None,
                status=status or None,
            )
        ]
        return OfflineEvaluationsListResponse(object="list", data=items)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/offline-evals/{evaluation_id}", response_model=OfflineEvaluationObject)
async def get_offline_evaluation(evaluation_id: str):
    """Get one offline evaluation by id."""
    row = release_governance_service.get_offline_evaluation(evaluation_id)
    if not row:
        raise HTTPException(status_code=404, detail=f"Offline evaluation not found: {evaluation_id}")
    return OfflineEvaluationObject(**row)


@router.get("/online-metrics", response_model=OnlineMetricsObject)
async def get_online_metrics(
    candidate_id: str = Query(default=""),
    candidate_type: str = Query(default="skill"),
    window_hours: int = Query(default=24, ge=1, le=24 * 30),
):
    """Get online runtime metrics used for release governance."""
    try:
        metrics = release_governance_service.get_online_metrics(
            candidate_id=candidate_id,
            candidate_type=candidate_type,
            window_hours=window_hours,
        )
        return OnlineMetricsObject(**metrics)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/release-gates/evaluate", response_model=ReleaseGateDecisionObject)
async def evaluate_release_gate(req: ReleaseGateEvaluateRequest):
    """Evaluate release gate based on offline + online criteria."""
    try:
        record = release_governance_service.evaluate_release_gate(req.dict())
        return ReleaseGateDecisionObject(**record)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/release-gates", response_model=ReleaseGateDecisionsListResponse)
async def list_release_gates(
    candidate_id: str = Query(default=""),
    candidate_type: str = Query(default=""),
    decision: str = Query(default=""),
):
    """List release gate decisions."""
    try:
        items = [
            ReleaseGateDecisionObject(**row)
            for row in release_governance_service.list_release_gates(
                candidate_id=candidate_id or None,
                candidate_type=candidate_type or None,
                decision=decision or None,
            )
        ]
        return ReleaseGateDecisionsListResponse(object="list", data=items)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/release-gates/{gate_id}", response_model=ReleaseGateDecisionObject)
async def get_release_gate(gate_id: str):
    """Get one release gate decision by id."""
    row = release_governance_service.get_release_gate(gate_id)
    if not row:
        raise HTTPException(status_code=404, detail=f"Release gate not found: {gate_id}")
    return ReleaseGateDecisionObject(**row)
