"""
Analysis workflow service for plan-confirm-execute lifecycle.
Implements user-confirmed analytics execution with step-level control.
"""

import time
import uuid
from typing import Any, Dict, List, Optional

from analytics_service import run_analysis_job
from models import AnalyticsJobRunRequest
from skill_marketplace_service import HIGH_RISK_PERMISSIONS, skill_marketplace_service
from storage import storage


SECONDARY_CONFIRM_PERMISSIONS = {"data.write", "shell.exec", "secret.read"}


class AnalysisWorkflowService:
    """Service for user-confirmed analytics workflow orchestration."""

    @staticmethod
    def _normalize_trace_id(trace_id: Optional[str]) -> str:
        value = str(trace_id or "").strip()
        if value:
            return value
        return f"trc-{uuid.uuid4().hex[:24]}"

    def _risk_from_permissions(self, permissions: List[str]) -> str:
        if any(p in HIGH_RISK_PERMISSIONS for p in permissions):
            return "high"
        if permissions:
            return "medium"
        return "low"

    @staticmethod
    def _needs_secondary_confirmation(step: Dict[str, Any]) -> bool:
        permissions = {str(p) for p in step.get("required_permissions", [])}
        if str(step.get("risk_level") or "") == "high":
            return True
        return bool(permissions.intersection(SECONDARY_CONFIRM_PERMISSIONS))

    @staticmethod
    def _append_execution_log(
        execution_log: List[Dict[str, Any]],
        trace_id: str,
        event: str,
        message: str,
        extra: Optional[Dict[str, Any]] = None,
    ) -> None:
        payload: Dict[str, Any] = {
            "timestamp": int(time.time()),
            "event": event,
            "trace_id": trace_id,
            "message": message,
        }
        if extra:
            payload.update(extra)
        execution_log.append(payload)

    def _normalize_resume_from_step(
        self,
        steps: List[Dict[str, Any]],
        resume_from_step_id: Optional[str],
    ) -> None:
        if not resume_from_step_id:
            return

        found = False
        for step in steps:
            sid = str(step.get("id") or "")
            if sid == resume_from_step_id:
                found = True
                if step.get("status") in {
                    "failed",
                    "awaiting_secondary_confirmation",
                    "pending",
                    "skipped",
                }:
                    step["status"] = "approved"
                continue

            if found:
                continue

            if step.get("status") in {"approved", "pending", "awaiting_secondary_confirmation", "failed"}:
                step["status"] = "skipped"

        if not found:
            raise ValueError(f"resume_from_step_id not found in workflow steps: {resume_from_step_id}")

    def _build_steps(
        self,
        objective: str,
        preferred_depth: str,
        selected_skills: List[str],
    ) -> List[Dict[str, Any]]:
        steps: List[Dict[str, Any]] = [
            {
                "id": "scope-confirmation",
                "title": "Scope Confirmation",
                "description": "Confirm objective, scope, and output expectations.",
                "skill_id": None,
                "risk_level": "low",
                "required_permissions": [],
                "status": "pending",
            },
            {
                "id": "data-quality-check",
                "title": "Data Quality Check",
                "description": "Run baseline data quality checks before deep analysis.",
                "skill_id": "data-quality-check",
                "risk_level": "low",
                "required_permissions": ["data.read"],
                "status": "pending",
            },
            {
                "id": "core-analysis",
                "title": "Core Analysis",
                "description": f"Run {preferred_depth} analytics for objective: {objective}",
                "skill_id": "trend-analysis",
                "risk_level": "medium",
                "required_permissions": ["data.read", "model.call"],
                "status": "pending",
            },
            {
                "id": "cross-validation",
                "title": "Cross Validation",
                "description": "Validate findings from multiple dimensions and assumptions.",
                "skill_id": None,
                "risk_level": "medium",
                "required_permissions": ["data.read"],
                "status": "pending",
            },
            {
                "id": "report-output",
                "title": "Report Output",
                "description": "Generate structured summary report for user review.",
                "skill_id": "report-publisher",
                "risk_level": "high",
                "required_permissions": ["data.read", "data.write"],
                "status": "pending",
            },
        ]

        installed_map = {
            item.get("skill_id"): item
            for item in skill_marketplace_service.list_installed_skills(include_disabled=False)
        }

        for idx, skill_id in enumerate(selected_skills):
            skill = skill_marketplace_service.get_skill(skill_id)
            if not skill:
                steps.append(
                    {
                        "id": f"custom-skill-{idx + 1}-{skill_id}",
                        "title": f"Custom Skill: {skill_id}",
                        "description": "Skill not found in marketplace; requires user action.",
                        "skill_id": skill_id,
                        "risk_level": "medium",
                        "required_permissions": [],
                        "status": "rejected",
                    }
                )
                continue

            permissions = [str(p) for p in skill.get("permissions", [])]
            skill_status = installed_map.get(skill_id, {}).get("status", "pending_approval")
            step_status = "pending" if skill_status == "installed" else "pending"
            steps.append(
                {
                    "id": f"custom-skill-{idx + 1}-{skill_id}",
                    "title": f"Custom Skill: {skill.get('name', skill_id)}",
                    "description": f"Run marketplace skill {skill_id} in analysis workflow.",
                    "skill_id": skill_id,
                    "risk_level": self._risk_from_permissions(permissions),
                    "required_permissions": permissions,
                    "status": step_status,
                }
            )

        return steps

    def _estimate(self, preferred_depth: str, selected_skills: List[str]) -> Dict[str, Any]:
        base_duration = {"shallow": 120, "standard": 300, "deep": 600}.get(preferred_depth, 300)
        duration = base_duration + 90 * len(selected_skills)
        estimated_cost = round(duration * 0.00008, 4)
        return {
            "estimated_duration_sec": int(duration),
            "estimated_cost_usd": float(estimated_cost),
        }

    def create_workflow_plan(
        self,
        objective: str,
        dataset_id: Optional[str],
        preferred_depth: str,
        constraints: Dict[str, Any],
        selected_skills: List[str],
        trace_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        effective_trace_id = self._normalize_trace_id(trace_id)
        steps = self._build_steps(
            objective=objective,
            preferred_depth=preferred_depth,
            selected_skills=selected_skills,
        )
        estimate = self._estimate(preferred_depth=preferred_depth, selected_skills=selected_skills)

        workflow = storage.create_workflow(
            {
                "objective": objective,
                "dataset_id": dataset_id,
                "preferred_depth": preferred_depth,
                "status": "awaiting_confirmation",
                "steps": steps,
                "selected_skills": selected_skills,
                "constraints": constraints,
                "estimated_duration_sec": estimate["estimated_duration_sec"],
                "estimated_cost_usd": estimate["estimated_cost_usd"],
                "trace_id": effective_trace_id,
                "execution_log": [
                    {
                        "timestamp": int(time.time()),
                        "event": "plan_created",
                        "trace_id": effective_trace_id,
                        "message": "Workflow plan generated and awaiting confirmation.",
                    }
                ],
                "result": {},
            }
        )
        return workflow

    def list_workflows(self) -> List[Dict[str, Any]]:
        return storage.list_workflows()

    def get_workflow(self, workflow_id: str) -> Dict[str, Any]:
        workflow = storage.get_workflow(workflow_id)
        if not workflow:
            raise ValueError(f"Workflow not found: {workflow_id}")
        return workflow

    def confirm_workflow(
        self,
        workflow_id: str,
        approve_all: bool,
        approved_step_ids: List[str],
        rejected_step_ids: List[str],
        notes: str,
        trace_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        workflow = self.get_workflow(workflow_id)
        if workflow.get("status") not in {"awaiting_confirmation", "draft"}:
            raise ValueError(f"Workflow cannot be confirmed in status: {workflow.get('status')}")

        effective_trace_id = self._normalize_trace_id(workflow.get("trace_id") or trace_id)

        steps = workflow.get("steps", [])
        approved_set = set(approved_step_ids)
        rejected_set = set(rejected_step_ids)

        if approve_all:
            for step in steps:
                if step.get("status") == "pending":
                    step["status"] = "approved"
        else:
            for step in steps:
                sid = step.get("id")
                if sid in approved_set:
                    step["status"] = "approved"
                elif sid in rejected_set:
                    step["status"] = "rejected"
                elif step.get("status") == "pending":
                    step["status"] = "rejected"

        approved_count = len([s for s in steps if s.get("status") == "approved"])
        status = "confirmed" if approved_count > 0 else "cancelled"

        execution_log = list(workflow.get("execution_log", []))
        execution_log.append(
            {
                "timestamp": int(time.time()),
                "event": "workflow_confirmed",
                "trace_id": effective_trace_id,
                "message": "Workflow confirmation updated.",
                "approve_all": approve_all,
                "approved_steps": approved_count,
                "notes": notes,
            }
        )

        updated = storage.update_workflow(
            workflow_id,
            {
                "status": status,
                "steps": steps,
                "execution_log": execution_log,
                "trace_id": effective_trace_id,
            },
        )
        if not updated:
            raise ValueError(f"Failed to update workflow: {workflow_id}")
        return updated

    def execute_workflow(
        self,
        workflow_id: str,
        continue_on_step_error: bool,
        resume_from_step_id: Optional[str] = None,
        trace_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        workflow = self.get_workflow(workflow_id)
        if workflow.get("status") not in {"confirmed", "paused_for_confirmation", "running", "failed"}:
            raise ValueError("Workflow must be confirmed or paused-for-confirmation before execution")

        effective_trace_id = self._normalize_trace_id(workflow.get("trace_id") or trace_id)

        steps = workflow.get("steps", [])
        self._normalize_resume_from_step(steps, resume_from_step_id)
        execution_log = list(workflow.get("execution_log", []))
        result = dict(workflow.get("result", {}))
        secondary_confirmed = {
            str(step_id)
            for step_id in result.get("secondary_confirmed_steps", [])
            if str(step_id).strip()
        }

        self._append_execution_log(
            execution_log,
            trace_id=effective_trace_id,
            event="workflow_execute_started",
            message="Workflow execution started or resumed.",
            extra={
                "resume_from_step_id": resume_from_step_id,
            },
        )

        storage.update_workflow(
            workflow_id,
            {
                "status": "running",
                "trace_id": effective_trace_id,
            },
        )

        for step in steps:
            step_id = step.get("id")
            step_title = step.get("title")

            current_status = str(step.get("status") or "")
            if current_status in {"executed", "skipped"}:
                continue

            if current_status == "rejected":
                step["status"] = "skipped"
                self._append_execution_log(
                    execution_log,
                    trace_id=effective_trace_id,
                    event="step_skipped",
                    message=f"Step skipped: {step_title}",
                    extra={"step_id": step_id},
                )
                continue

            if current_status in {"failed", "awaiting_secondary_confirmation"} and str(step_id) in secondary_confirmed:
                step["status"] = "approved"

            if str(step.get("status") or "") != "approved":
                self._append_execution_log(
                    execution_log,
                    trace_id=effective_trace_id,
                    event="step_skipped",
                    message=f"Step skipped because it is not approved: {step_title}",
                    extra={"step_id": step_id, "status": step.get("status")},
                )
                continue

            if self._needs_secondary_confirmation(step) and str(step_id) not in secondary_confirmed:
                step["status"] = "awaiting_secondary_confirmation"
                self._append_execution_log(
                    execution_log,
                    trace_id=effective_trace_id,
                    event="step_secondary_confirmation_required",
                    message=f"Secondary confirmation required for high-risk step: {step_title}",
                    extra={
                        "step_id": step_id,
                        "risk_level": step.get("risk_level"),
                        "required_permissions": step.get("required_permissions", []),
                    },
                )
                updated = storage.update_workflow(
                    workflow_id,
                    {
                        "status": "paused_for_confirmation",
                        "steps": steps,
                        "execution_log": execution_log,
                        "result": result,
                        "trace_id": effective_trace_id,
                    },
                )
                if not updated:
                    raise ValueError(f"Failed to pause workflow for secondary confirmation: {workflow_id}")
                return updated

            try:
                if step_id == "data-quality-check":
                    dataset_id = workflow.get("dataset_id")
                    if dataset_id:
                        job = run_analysis_job(
                            AnalyticsJobRunRequest(dataset_id=dataset_id, depth="shallow")
                        )
                        result["data_quality"] = job.get("result", {}).get("quality", {})
                elif step_id == "core-analysis":
                    dataset_id = workflow.get("dataset_id")
                    if not dataset_id:
                        raise ValueError("dataset_id is required for core-analysis step")

                    constraints = workflow.get("constraints", {}) or {}
                    job = run_analysis_job(
                        AnalyticsJobRunRequest(
                            dataset_id=dataset_id,
                            depth=workflow.get("preferred_depth", "standard"),
                            group_by=constraints.get("group_by", []),
                            time_column=constraints.get("time_column"),
                            target_column=constraints.get("target_column"),
                            top_n_categories=int(constraints.get("top_n_categories", 10)),
                        )
                    )
                    result["core_analysis_job"] = {
                        "job_id": job.get("id"),
                        "status": job.get("status"),
                        "result": job.get("result", {}),
                    }
                elif step_id.startswith("custom-skill-"):
                    skill_id = step.get("skill_id")
                    skill = skill_marketplace_service.get_skill(skill_id)
                    if not skill:
                        raise ValueError(f"Custom skill manifest not found: {skill_id}")

                    dataset_context: Dict[str, Any] = {}
                    dataset_id = workflow.get("dataset_id")
                    if dataset_id:
                        dataset_obj = storage.get_dataset(dataset_id)
                        if dataset_obj:
                            dataset_context = {
                                "dataset": {
                                    "id": dataset_obj.get("id"),
                                    "path": dataset_obj.get("path"),
                                    "format": dataset_obj.get("format"),
                                }
                            }

                    run_context = {
                        "workflow_id": workflow.get("id"),
                        "trace_id": effective_trace_id,
                        "objective": workflow.get("objective"),
                        "dataset_id": workflow.get("dataset_id"),
                        "preferred_depth": workflow.get("preferred_depth", "standard"),
                        "constraints": workflow.get("constraints", {}),
                        "step": {
                            "id": step_id,
                            "title": step_title,
                        },
                        "previous_result": result,
                        **dataset_context,
                    }

                    skill_run = skill_marketplace_service.run_skill(
                        skill_id=skill_id,
                        workflow_id=workflow.get("id"),
                        step_id=step_id,
                        context=run_context,
                        trace_id=effective_trace_id,
                    )

                    result.setdefault("custom_skill_runs", []).append(
                        {
                            "run_id": skill_run.get("id"),
                            "skill_id": skill_id,
                            "status": "executed",
                            "trace_id": skill_run.get("trace_id", effective_trace_id),
                            "policy_decision_id": skill_run.get("policy_decision_id"),
                            "runtime": skill_run.get("runtime", skill.get("runtime")),
                            "entrypoint": skill.get("entrypoint"),
                            "output": skill_run.get("output", {}),
                            "meta": skill_run.get("meta", {}),
                        }
                    )

                step["status"] = "executed"
                self._append_execution_log(
                    execution_log,
                    trace_id=effective_trace_id,
                    event="step_executed",
                    message=f"Step executed: {step_title}",
                    extra={"step_id": step_id},
                )
            except Exception as exc:
                step["status"] = "failed"
                self._append_execution_log(
                    execution_log,
                    trace_id=effective_trace_id,
                    event="step_failed",
                    message=str(exc),
                    extra={"step_id": step_id},
                )
                if not continue_on_step_error:
                    updated = storage.update_workflow(
                        workflow_id,
                        {
                            "status": "failed",
                            "steps": steps,
                            "execution_log": execution_log,
                            "result": result,
                            "trace_id": effective_trace_id,
                        },
                    )
                    if not updated:
                        raise ValueError(f"Failed to update workflow after step failure: {workflow_id}")
                    return updated

        if "core_analysis_job" in result:
            report = (
                result.get("core_analysis_job", {})
                .get("result", {})
                .get("report_markdown", "")
            )
            if report:
                result["summary_report_markdown"] = report

        updated = storage.update_workflow(
            workflow_id,
            {
                "status": "completed",
                "steps": steps,
                "execution_log": execution_log,
                "result": result,
                "trace_id": effective_trace_id,
            },
        )
        if not updated:
            raise ValueError(f"Failed to finalize workflow: {workflow_id}")
        return updated

    def confirm_step_for_execution(
        self,
        workflow_id: str,
        step_id: str,
        notes: str,
        trace_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        workflow = self.get_workflow(workflow_id)
        if workflow.get("status") not in {
            "confirmed",
            "running",
            "paused_for_confirmation",
            "failed",
        }:
            raise ValueError(
                f"Workflow cannot confirm step in status: {workflow.get('status')}"
            )

        effective_trace_id = self._normalize_trace_id(workflow.get("trace_id") or trace_id)
        steps = workflow.get("steps", [])
        target_step: Optional[Dict[str, Any]] = None
        for step in steps:
            if str(step.get("id") or "") == str(step_id):
                target_step = step
                break

        if not target_step:
            raise ValueError(f"Step not found in workflow: {step_id}")

        if str(target_step.get("status") or "") in {"executed", "skipped", "rejected"}:
            raise ValueError(
                f"Step cannot be second-confirmed in status: {target_step.get('status')}"
            )

        result = dict(workflow.get("result", {}))
        secondary_confirmed_steps = [
            str(item)
            for item in result.get("secondary_confirmed_steps", [])
            if str(item).strip()
        ]
        if str(step_id) not in secondary_confirmed_steps:
            secondary_confirmed_steps.append(str(step_id))
        result["secondary_confirmed_steps"] = secondary_confirmed_steps

        if str(target_step.get("status") or "") == "awaiting_secondary_confirmation":
            target_step["status"] = "approved"

        execution_log = list(workflow.get("execution_log", []))
        self._append_execution_log(
            execution_log,
            trace_id=effective_trace_id,
            event="step_secondary_confirmation_approved",
            message="Secondary confirmation approved for workflow step.",
            extra={
                "step_id": step_id,
                "notes": notes,
            },
        )

        next_status = workflow.get("status")
        if str(next_status or "") == "paused_for_confirmation":
            next_status = "confirmed"

        updated = storage.update_workflow(
            workflow_id,
            {
                "status": next_status,
                "steps": steps,
                "result": result,
                "execution_log": execution_log,
                "trace_id": effective_trace_id,
            },
        )
        if not updated:
            raise ValueError(f"Failed to confirm workflow step: {workflow_id}/{step_id}")
        return updated

    def resume_workflow(
        self,
        workflow_id: str,
        continue_on_step_error: bool,
        resume_from_step_id: Optional[str] = None,
        trace_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        workflow = self.get_workflow(workflow_id)
        if workflow.get("status") not in {"paused_for_confirmation", "failed", "confirmed", "running"}:
            raise ValueError(f"Workflow cannot resume in status: {workflow.get('status')}")

        return self.execute_workflow(
            workflow_id=workflow_id,
            continue_on_step_error=continue_on_step_error,
            resume_from_step_id=resume_from_step_id,
            trace_id=trace_id,
        )


analysis_workflow_service = AnalysisWorkflowService()
