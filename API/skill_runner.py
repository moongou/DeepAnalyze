"""
Skill runtime execution module.
Provides a lightweight sandboxed runner for marketplace skills.
"""

import json
import os
import subprocess
import sys
import time
import urllib.request
from typing import Any, Dict, Optional

from analytics_service import run_analysis_job
from config import SKILL_EXECUTION_TIMEOUT, WORKSPACE_BASE_DIR
from models import AnalyticsJobRunRequest


class SkillExecutionError(Exception):
    """Raised when one marketplace skill fails during execution."""


def _workspace_root() -> str:
    return os.path.abspath(WORKSPACE_BASE_DIR)


def _resolve_workspace_path(path_ref: str) -> str:
    path_ref = str(path_ref or "").strip()
    if not path_ref:
        raise SkillExecutionError("Skill entrypoint path is empty")

    if os.path.isabs(path_ref):
        target = os.path.abspath(path_ref)
    else:
        target = os.path.abspath(os.path.join(_workspace_root(), path_ref))

    root = _workspace_root()
    if target != root and not target.startswith(root + os.sep):
        raise SkillExecutionError("Skill path must stay inside workspace sandbox")
    return target


def _parse_http_endpoint(entrypoint: str) -> str:
    entry = str(entrypoint or "").strip()
    if entry.startswith("http:") and (entry.startswith("http://") or entry.startswith("https://")):
        return entry
    if entry.startswith("http:"):
        return entry.split(":", 1)[1].strip()
    if entry.startswith("https://") or entry.startswith("http://"):
        return entry
    raise SkillExecutionError("HTTP skill entrypoint must be an http(s) URL")


def _extract_json_stdout(stdout: str) -> Any:
    text = (stdout or "").strip()
    if not text:
        return {}

    lines = [line.strip() for line in text.splitlines() if line.strip()]
    candidates = [text]
    if lines:
        candidates.append(lines[-1])

    for candidate in candidates:
        try:
            return json.loads(candidate)
        except Exception:
            continue

    return {"stdout": text}


def _run_python_skill(skill: Dict[str, Any], install_state: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    entrypoint = str(skill.get("entrypoint") or "")
    if not entrypoint.startswith("python:"):
        raise SkillExecutionError("Python skill entrypoint must use python:<path/to/script.py>")

    script_ref = entrypoint.split(":", 1)[1].strip()
    script_path = _resolve_workspace_path(script_ref)
    if not script_path.endswith(".py"):
        raise SkillExecutionError("Python skill script must be a .py file")
    if not os.path.isfile(script_path):
        raise SkillExecutionError(f"Python skill script not found: {script_ref}")

    granted_permissions = set(str(p) for p in install_state.get("permissions_granted", []))
    if "shell.exec" not in granted_permissions:
        raise SkillExecutionError("Python runtime requires approved 'shell.exec' permission")

    payload = {
        "skill": {
            "id": skill.get("id"),
            "name": skill.get("name"),
            "version": skill.get("version"),
            "runtime": skill.get("runtime"),
            "entrypoint": skill.get("entrypoint"),
        },
        "config": install_state.get("config") or {},
        "context": context,
    }

    started_at = time.time()
    proc = subprocess.run(
        [sys.executable, script_path],
        input=json.dumps(payload, ensure_ascii=False),
        text=True,
        capture_output=True,
        timeout=int(SKILL_EXECUTION_TIMEOUT),
        cwd=_workspace_root(),
        env={
            **os.environ,
            "PYTHONUNBUFFERED": "1",
            "DEEPANALYZE_SKILL_ID": str(skill.get("id") or ""),
        },
        shell=False,
    )
    duration_ms = int((time.time() - started_at) * 1000)

    if proc.returncode != 0:
        stderr = (proc.stderr or "").strip()
        raise SkillExecutionError(f"Python skill failed (code={proc.returncode}): {stderr[:800]}")

    parsed = _extract_json_stdout(proc.stdout)
    return {
        "runtime": "python",
        "output": parsed,
        "meta": {
            "duration_ms": duration_ms,
            "script": script_ref,
        },
    }


def _run_http_skill(skill: Dict[str, Any], install_state: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    endpoint = _parse_http_endpoint(str(skill.get("entrypoint") or ""))
    payload = {
        "skill": {
            "id": skill.get("id"),
            "name": skill.get("name"),
            "version": skill.get("version"),
            "runtime": skill.get("runtime"),
        },
        "config": install_state.get("config") or {},
        "context": context,
    }

    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        endpoint,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json"},
    )

    started_at = time.time()
    try:
        with urllib.request.urlopen(req, timeout=int(SKILL_EXECUTION_TIMEOUT)) as resp:
            raw = resp.read().decode("utf-8")
    except Exception as exc:
        raise SkillExecutionError(f"HTTP skill request failed: {exc}")

    duration_ms = int((time.time() - started_at) * 1000)
    parsed = _extract_json_stdout(raw)
    return {
        "runtime": "http",
        "output": parsed,
        "meta": {
            "duration_ms": duration_ms,
            "endpoint": endpoint,
        },
    }


def _dataset_id_from_context(context: Dict[str, Any]) -> Optional[str]:
    dataset = context.get("dataset") or {}
    dataset_id = dataset.get("id") or context.get("dataset_id")
    if not dataset_id:
        return None
    return str(dataset_id)


def _run_workflow_builtin(skill: Dict[str, Any], install_state: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    _ = install_state
    entrypoint = str(skill.get("entrypoint") or "")
    if not entrypoint.startswith("builtin:"):
        raise SkillExecutionError("Workflow runtime currently supports builtin:<name> entrypoint")

    builtin_name = entrypoint.split(":", 1)[1].strip()
    dataset_id = _dataset_id_from_context(context)

    if builtin_name == "data_quality_check":
        if not dataset_id:
            raise SkillExecutionError("builtin:data_quality_check requires dataset_id")
        job = run_analysis_job(AnalyticsJobRunRequest(dataset_id=dataset_id, depth="shallow"))
        return {
            "runtime": "workflow",
            "output": {
                "quality": job.get("result", {}).get("quality", {}),
                "job_id": job.get("id"),
            },
            "meta": {
                "builtin": builtin_name,
            },
        }

    if builtin_name == "trend_analysis":
        if not dataset_id:
            raise SkillExecutionError("builtin:trend_analysis requires dataset_id")
        constraints = context.get("constraints") or {}
        job = run_analysis_job(
            AnalyticsJobRunRequest(
                dataset_id=dataset_id,
                depth=str(context.get("preferred_depth") or "standard"),
                group_by=constraints.get("group_by", []),
                time_column=constraints.get("time_column"),
                target_column=constraints.get("target_column"),
                top_n_categories=int(constraints.get("top_n_categories", 10)),
            )
        )
        return {
            "runtime": "workflow",
            "output": {
                "job_id": job.get("id"),
                "status": job.get("status"),
                "summary": {
                    "report_markdown": job.get("result", {}).get("report_markdown", ""),
                    "quality": job.get("result", {}).get("quality", {}),
                },
            },
            "meta": {
                "builtin": builtin_name,
            },
        }

    if builtin_name == "report_publisher":
        report_text = (
            context.get("previous_result", {})
            .get("summary_report_markdown")
            or context.get("previous_result", {})
            .get("core_analysis_job", {})
            .get("result", {})
            .get("report_markdown", "")
        )
        return {
            "runtime": "workflow",
            "output": {
                "published": bool(report_text),
                "report_length": len(report_text),
            },
            "meta": {
                "builtin": builtin_name,
            },
        }

    if builtin_name == "external_skill_reference":
        return {
            "runtime": "workflow",
            "output": {
                "external_reference": True,
                "skill_id": skill.get("id"),
                "name": skill.get("name"),
                "description": skill.get("description"),
                "compatibility": skill.get("compatibility", "通用"),
                "install_commands": skill.get("install_commands") or {},
                "requires": skill.get("requires") or [],
                "message": "This curated skill is registered and loaded. Execute it in the target agent ecosystem if runtime integration is external.",
            },
            "meta": {
                "builtin": builtin_name,
                "execution_mode": "metadata_only",
            },
        }

    raise SkillExecutionError(f"Unsupported workflow builtin: {builtin_name}")


def execute_installed_skill(skill: Dict[str, Any], install_state: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Execute one installed skill and return structured runtime output."""
    required_permissions = set(str(p) for p in skill.get("permissions", []))
    granted_permissions = set(str(p) for p in install_state.get("permissions_granted", []))
    missing_permissions = sorted(required_permissions - granted_permissions)
    if missing_permissions:
        raise SkillExecutionError(
            f"Missing granted permissions for skill {skill.get('id')}: {', '.join(missing_permissions)}"
        )

    runtime = str(skill.get("runtime") or "python").strip()
    if runtime == "python":
        return _run_python_skill(skill=skill, install_state=install_state, context=context)
    if runtime == "http":
        return _run_http_skill(skill=skill, install_state=install_state, context=context)
    if runtime == "workflow":
        return _run_workflow_builtin(skill=skill, install_state=install_state, context=context)

    raise SkillExecutionError(f"Unsupported skill runtime: {runtime}")
