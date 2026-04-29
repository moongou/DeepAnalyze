"""
Skill marketplace API for DeepAnalyze API Server.
Supports skill discovery, registration, installation, and permission governance.
"""

from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from models import (
    SkillManifestObject,
    SkillRegisterRequest,
    SkillsListResponse,
    SkillDirectoryObject,
    SkillDirectoriesListResponse,
    SkillInstallRequest,
    SkillQuickLoadRequest,
    SkillInstallPolicyCheckRequest,
    SkillRunPolicyCheckRequest,
    SkillPolicyDecisionObject,
    SkillPolicyDecisionsListResponse,
    SkillInstallObject,
    InstalledSkillsListResponse,
    SkillRunRequest,
    SkillRunObject,
    SkillRunsListResponse,
)
from skill_marketplace_service import skill_marketplace_service


router = APIRouter(prefix="/v1/marketplace", tags=["marketplace"])


@router.get("/skills", response_model=SkillsListResponse)
async def list_marketplace_skills(
    include_disabled: bool = Query(True),
    directory: str = Query(default=""),
    featured_only: bool = Query(default=False),
):
    """List available skills in marketplace."""
    items = [
        SkillManifestObject(**s)
        for s in skill_marketplace_service.list_skills(
            include_disabled=include_disabled,
            directory=directory or None,
            featured_only=featured_only,
        )
    ]
    return SkillsListResponse(object="list", data=items)


@router.get("/directories", response_model=SkillDirectoriesListResponse)
async def list_marketplace_directories(include_disabled: bool = Query(True)):
    """List marketplace skill directories for UI tab rendering."""
    items = [
        SkillDirectoryObject(**row)
        for row in skill_marketplace_service.list_directories(include_disabled=include_disabled)
    ]
    return SkillDirectoriesListResponse(object="list", data=items)


@router.get("/skills/{skill_id}", response_model=SkillManifestObject)
async def get_marketplace_skill(skill_id: str):
    """Get one skill manifest."""
    skill = skill_marketplace_service.get_skill(skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail=f"Skill not found: {skill_id}")
    return SkillManifestObject(**skill)


@router.post("/skills/register", response_model=SkillManifestObject)
async def register_marketplace_skill(req: SkillRegisterRequest):
    """Register a skill manifest from payload or URL."""
    try:
        skill = skill_marketplace_service.register_skill(
            manifest=req.manifest,
            manifest_url=req.manifest_url,
        )
        return SkillManifestObject(**skill)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/skills/{skill_id}")
async def delete_marketplace_skill(skill_id: str):
    """Delete one skill manifest and related install state."""
    deleted = skill_marketplace_service.delete_skill(skill_id)
    return {"id": skill_id, "deleted": deleted}


@router.get("/installed", response_model=InstalledSkillsListResponse)
async def list_installed_skills(include_disabled: bool = Query(True)):
    """List installed skills and their status."""
    items = [
        SkillInstallObject(**s)
        for s in skill_marketplace_service.list_installed_skills(include_disabled=include_disabled)
    ]
    return InstalledSkillsListResponse(object="list", data=items)


@router.post("/install", response_model=SkillInstallObject)
async def install_skill(req: SkillInstallRequest):
    """Install one skill from marketplace by skill_id."""
    try:
        installed = skill_marketplace_service.install_skill(
            skill_id=req.skill_id,
            version=req.version,
            config=req.config,
            permission_scopes=req.permission_scopes,
            trace_id=req.trace_id,
            approve_high_risk_permissions=req.approve_high_risk_permissions,
        )
        return SkillInstallObject(**installed)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/policies/check-install", response_model=SkillPolicyDecisionObject)
async def preflight_install_policy(req: SkillInstallPolicyCheckRequest):
    """Evaluate install policy and return one decision record."""
    try:
        decision = skill_marketplace_service.preflight_install_policy(
            skill_id=req.skill_id,
            config=req.config,
            permission_scopes=req.permission_scopes,
            trace_id=req.trace_id,
            approve_high_risk_permissions=req.approve_high_risk_permissions,
        )
        return SkillPolicyDecisionObject(**decision)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/policies/check-run", response_model=SkillPolicyDecisionObject)
async def preflight_run_policy(req: SkillRunPolicyCheckRequest):
    """Evaluate run policy and return one decision record."""
    try:
        decision = skill_marketplace_service.preflight_run_policy(
            skill_id=req.skill_id,
            context=req.context,
            trace_id=req.trace_id,
        )
        return SkillPolicyDecisionObject(**decision)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/policies/decisions", response_model=SkillPolicyDecisionsListResponse)
async def list_policy_decisions(
    skill_id: str = Query(default=""),
    action: str = Query(default=""),
    trace_id: str = Query(default=""),
):
    """List policy decisions for governance audit timeline."""
    items = [
        SkillPolicyDecisionObject(**row)
        for row in skill_marketplace_service.list_policy_decisions(
            skill_id=skill_id or None,
            action=action or None,
            trace_id=trace_id or None,
        )
    ]
    return SkillPolicyDecisionsListResponse(object="list", data=items)


@router.get("/policies/decisions/{decision_id}", response_model=SkillPolicyDecisionObject)
async def get_policy_decision(decision_id: str):
    """Get one policy decision by id."""
    item = skill_marketplace_service.get_policy_decision(decision_id)
    if not item:
        raise HTTPException(status_code=404, detail=f"Policy decision not found: {decision_id}")
    return SkillPolicyDecisionObject(**item)


@router.post("/skills/{skill_id}/load", response_model=SkillInstallObject)
async def quick_load_marketplace_skill(skill_id: str, req: Optional[SkillQuickLoadRequest] = None):
    """One-click load skill for marketplace pages."""
    payload = req or SkillQuickLoadRequest()
    try:
        installed = skill_marketplace_service.quick_load_skill(
            skill_id=skill_id,
            config=payload.config,
            permission_scopes=payload.permission_scopes,
            trace_id=payload.trace_id,
            approve_high_risk_permissions=payload.approve_high_risk_permissions,
        )
        return SkillInstallObject(**installed)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/run", response_model=SkillRunObject)
async def run_marketplace_skill(req: SkillRunRequest):
    """Run one installed skill directly for debugging or preflight."""
    try:
        run = skill_marketplace_service.run_skill(
            skill_id=req.skill_id,
            context=req.context,
            trace_id=req.trace_id,
        )
        return SkillRunObject(**run)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/runs", response_model=SkillRunsListResponse)
async def list_marketplace_skill_runs(
    skill_id: str = Query(default=""),
    status: str = Query(default=""),
    trace_id: str = Query(default=""),
):
    """List historical skill runs with optional filters."""
    items = [
        SkillRunObject(**r)
        for r in skill_marketplace_service.list_skill_runs(
            skill_id=skill_id or None,
            status=status or None,
            trace_id=trace_id or None,
        )
    ]
    return SkillRunsListResponse(object="list", data=items)


@router.get("/runs/{run_id}", response_model=SkillRunObject)
async def get_marketplace_skill_run(run_id: str):
    """Get one skill run by id."""
    run = skill_marketplace_service.get_skill_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"Skill run not found: {run_id}")
    return SkillRunObject(**run)


@router.post("/install/{skill_id}/approve", response_model=SkillInstallObject)
async def approve_skill_install(skill_id: str):
    """Approve pending install of a high-risk skill."""
    try:
        installed = skill_marketplace_service.approve_pending_install(skill_id)
        return SkillInstallObject(**installed)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/installed/{skill_id}/status", response_model=SkillInstallObject)
async def set_installed_skill_status(skill_id: str, status: str = Query(...)):
    """Update installed skill status (installed/disabled/pending_approval)."""
    try:
        installed = skill_marketplace_service.set_install_status(skill_id=skill_id, status=status)
        return SkillInstallObject(**installed)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/installed/{skill_id}")
async def uninstall_skill(skill_id: str):
    """Uninstall one skill by id."""
    deleted = skill_marketplace_service.uninstall_skill(skill_id)
    return {"skill_id": skill_id, "deleted": deleted}


@router.get("/permissions")
async def get_skill_permission_catalog():
    """List permission catalog and mapped skills for governance UI."""
    return {
        "object": "list",
        "data": skill_marketplace_service.get_permission_catalog(),
    }
