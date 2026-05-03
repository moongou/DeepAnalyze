"""
Analysis workflow API for plan-confirm-execute lifecycle.
Allows users to review and approve analysis steps before execution.
"""

from fastapi import APIRouter, HTTPException

from analysis_workflow_service import analysis_workflow_service
from models import (
    AnalysisWorkflowObject,
    AnalysisWorkflowsListResponse,
    AnalysisWorkflowPlanRequest,
    AnalysisWorkflowConfirmRequest,
    AnalysisWorkflowStepConfirmRequest,
    AnalysisWorkflowExecuteRequest,
)


router = APIRouter(prefix="/v1/analysis-workflows", tags=["analysis-workflow"])


@router.post("/plan", response_model=AnalysisWorkflowObject)
async def create_analysis_workflow_plan(req: AnalysisWorkflowPlanRequest):
    """Create workflow plan for user confirmation before execution."""
    try:
        workflow = analysis_workflow_service.create_workflow_plan(
            objective=req.objective,
            dataset_id=req.dataset_id,
            preferred_depth=req.preferred_depth,
            constraints=req.constraints,
            selected_skills=req.selected_skills,
            trace_id=req.trace_id,
        )
        return AnalysisWorkflowObject(**workflow)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("", response_model=AnalysisWorkflowsListResponse)
async def list_analysis_workflows():
    """List all workflow plans and executions."""
    items = [AnalysisWorkflowObject(**w) for w in analysis_workflow_service.list_workflows()]
    return AnalysisWorkflowsListResponse(object="list", data=items)


@router.get("/{workflow_id}", response_model=AnalysisWorkflowObject)
async def get_analysis_workflow(workflow_id: str):
    """Get one workflow by id."""
    try:
        workflow = analysis_workflow_service.get_workflow(workflow_id)
        return AnalysisWorkflowObject(**workflow)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/{workflow_id}/confirm", response_model=AnalysisWorkflowObject)
async def confirm_analysis_workflow(workflow_id: str, req: AnalysisWorkflowConfirmRequest):
    """Confirm or reject workflow steps before execution."""
    try:
        workflow = analysis_workflow_service.confirm_workflow(
            workflow_id=workflow_id,
            approve_all=req.approve_all,
            approved_step_ids=req.approved_step_ids,
            rejected_step_ids=req.rejected_step_ids,
            notes=req.notes,
            trace_id=req.trace_id,
        )
        return AnalysisWorkflowObject(**workflow)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/{workflow_id}/execute", response_model=AnalysisWorkflowObject)
async def execute_analysis_workflow(workflow_id: str, req: AnalysisWorkflowExecuteRequest):
    """Execute confirmed workflow and return step-level results."""
    try:
        workflow = analysis_workflow_service.execute_workflow(
            workflow_id=workflow_id,
            continue_on_step_error=req.continue_on_step_error,
            resume_from_step_id=req.resume_from_step_id,
            trace_id=req.trace_id,
        )
        return AnalysisWorkflowObject(**workflow)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/{workflow_id}/confirm-step", response_model=AnalysisWorkflowObject)
async def confirm_analysis_workflow_step(workflow_id: str, req: AnalysisWorkflowStepConfirmRequest):
    """Approve one high-risk paused step before resume."""
    try:
        workflow = analysis_workflow_service.confirm_step_for_execution(
            workflow_id=workflow_id,
            step_id=req.step_id,
            notes=req.notes,
            trace_id=req.trace_id,
        )
        return AnalysisWorkflowObject(**workflow)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/{workflow_id}/resume", response_model=AnalysisWorkflowObject)
async def resume_analysis_workflow(workflow_id: str, req: AnalysisWorkflowExecuteRequest):
    """Resume one paused/failed workflow from checkpoint."""
    try:
        workflow = analysis_workflow_service.resume_workflow(
            workflow_id=workflow_id,
            continue_on_step_error=req.continue_on_step_error,
            resume_from_step_id=req.resume_from_step_id,
            trace_id=req.trace_id,
        )
        return AnalysisWorkflowObject(**workflow)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
