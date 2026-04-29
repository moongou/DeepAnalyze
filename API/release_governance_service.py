"""
Release governance service for offline baselines, online metrics, and release gate decisions.
"""

import json
import os
import threading
import time
import uuid
from typing import Any, Dict, List, Optional

from config import WORKSPACE_BASE_DIR
from storage import storage


OFFLINE_DEFAULT_THRESHOLDS = {
    "accuracy_min": 0.75,
    "p95_latency_ms_max": 5000.0,
    "cost_per_request_usd_max": 0.05,
    "stability_min": 0.90,
}

ONLINE_DEFAULT_THRESHOLDS = {
    "success_rate_min": 0.95,
    "p95_latency_ms_max": 5000.0,
    "deny_rate_max": 0.20,
    "retry_rate_max": 0.10,
}


class ReleaseGovernanceService:
    """Service for evaluation governance and release gate lifecycle."""

    def __init__(self):
        os.makedirs(WORKSPACE_BASE_DIR, exist_ok=True)
        self._state_path = os.path.join(WORKSPACE_BASE_DIR, "_release_governance.json")
        self._lock = threading.Lock()
        self._state = self._load_state()

    @staticmethod
    def _normalize_candidate_type(candidate_type: Optional[str]) -> str:
        value = str(candidate_type or "skill").strip().lower()
        if value not in {"skill", "model", "workflow", "system"}:
            raise ValueError(f"Unsupported candidate_type: {candidate_type}")
        return value

    @staticmethod
    def _to_float(value: Any, default: Optional[float] = None) -> Optional[float]:
        if value is None:
            return default
        try:
            return float(value)
        except Exception:
            return default

    @staticmethod
    def _percentile(values: List[float], ratio: float) -> float:
        if not values:
            return 0.0
        sorted_values = sorted(values)
        if len(sorted_values) == 1:
            return float(sorted_values[0])

        ratio = min(max(ratio, 0.0), 1.0)
        index = ratio * (len(sorted_values) - 1)
        lower = int(index)
        upper = min(lower + 1, len(sorted_values) - 1)
        fraction = index - lower
        return float(sorted_values[lower] + (sorted_values[upper] - sorted_values[lower]) * fraction)

    def _load_state(self) -> Dict[str, Any]:
        if os.path.exists(self._state_path):
            try:
                with open(self._state_path, "r", encoding="utf-8") as f:
                    state = json.load(f)
                if isinstance(state, dict):
                    state.setdefault("offline_evaluations", [])
                    state.setdefault("release_gates", [])
                    return state
            except Exception:
                pass
        state = {
            "offline_evaluations": [],
            "release_gates": [],
        }
        self._persist_state(state)
        return state

    def _persist_state(self, state: Optional[Dict[str, Any]] = None) -> None:
        payload = state if state is not None else self._state
        with open(self._state_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)

    @staticmethod
    def _extract_duration_ms(run: Dict[str, Any]) -> Optional[float]:
        meta = run.get("meta") if isinstance(run.get("meta"), dict) else {}
        duration_from_meta = meta.get("duration_ms")
        if duration_from_meta is not None:
            try:
                return float(duration_from_meta)
            except Exception:
                pass

        started_at = run.get("started_at")
        finished_at = run.get("finished_at")
        if isinstance(started_at, int) and isinstance(finished_at, int) and finished_at >= started_at:
            return float((finished_at - started_at) * 1000)
        return None

    @staticmethod
    def _extract_cost_usd(run: Dict[str, Any]) -> Optional[float]:
        meta = run.get("meta") if isinstance(run.get("meta"), dict) else {}
        for key in ("cost_usd", "request_cost_usd", "estimated_cost_usd"):
            if key in meta:
                try:
                    return float(meta.get(key))
                except Exception:
                    continue
        return None

    @staticmethod
    def _extract_retry_flag(run: Dict[str, Any]) -> bool:
        context = run.get("context") if isinstance(run.get("context"), dict) else {}
        meta = run.get("meta") if isinstance(run.get("meta"), dict) else {}
        if context.get("retry_of"):
            return True
        if int(meta.get("retry_count", 0) or 0) > 0:
            return True
        return False

    @staticmethod
    def _match_candidate_run(run: Dict[str, Any], candidate_id: str, candidate_type: str) -> bool:
        if candidate_type == "system":
            return True
        if candidate_type == "skill":
            return str(run.get("skill_id") or "") == candidate_id
        if candidate_type == "workflow":
            return str(run.get("workflow_id") or "") == candidate_id
        if candidate_type == "model":
            context = run.get("context") if isinstance(run.get("context"), dict) else {}
            meta = run.get("meta") if isinstance(run.get("meta"), dict) else {}
            model_id = str(context.get("model") or meta.get("model") or "")
            return model_id == candidate_id
        return False

    @staticmethod
    def _match_candidate_policy(
        decision: Dict[str, Any],
        candidate_id: str,
        candidate_type: str,
    ) -> bool:
        if candidate_type == "system":
            return True
        if candidate_type == "skill":
            return str(decision.get("skill_id") or "") == candidate_id

        context = decision.get("context") if isinstance(decision.get("context"), dict) else {}
        if candidate_type == "workflow":
            return str(context.get("workflow_id") or "") == candidate_id
        if candidate_type == "model":
            return str(context.get("model") or "") == candidate_id
        return False

    def _collect_runs(self, candidate_id: str, candidate_type: str, window_hours: int) -> List[Dict[str, Any]]:
        now = int(time.time())
        cutoff = now - int(window_hours) * 3600
        all_runs = storage.list_skill_runs()
        return [
            run
            for run in all_runs
            if int(run.get("created_at") or 0) >= cutoff
            and self._match_candidate_run(run, candidate_id, candidate_type)
        ]

    def _collect_run_policy_decisions(
        self,
        candidate_id: str,
        candidate_type: str,
        window_hours: int,
    ) -> List[Dict[str, Any]]:
        now = int(time.time())
        cutoff = now - int(window_hours) * 3600
        all_decisions = storage.list_skill_policy_decisions(action="run")
        return [
            row
            for row in all_decisions
            if int(row.get("created_at") or 0) >= cutoff
            and self._match_candidate_policy(row, candidate_id, candidate_type)
        ]

    def _compute_online_metrics(self, candidate_id: str, candidate_type: str, window_hours: int) -> Dict[str, Any]:
        runs = self._collect_runs(candidate_id=candidate_id, candidate_type=candidate_type, window_hours=window_hours)
        policy_decisions = self._collect_run_policy_decisions(
            candidate_id=candidate_id,
            candidate_type=candidate_type,
            window_hours=window_hours,
        )

        request_count = len(runs)
        completed_count = sum(1 for r in runs if str(r.get("status") or "") == "completed")
        failed_count = sum(1 for r in runs if str(r.get("status") or "") == "failed")
        durations = [d for d in (self._extract_duration_ms(r) for r in runs) if d is not None]
        costs = [c for c in (self._extract_cost_usd(r) for r in runs) if c is not None]
        retry_count = sum(1 for r in runs if self._extract_retry_flag(r))

        deny_count = sum(1 for d in policy_decisions if str(d.get("effect") or "") == "deny")
        policy_count = len(policy_decisions)

        success_rate = (completed_count / request_count) if request_count else 0.0
        failure_rate = (failed_count / request_count) if request_count else 0.0
        deny_rate = (deny_count / policy_count) if policy_count else 0.0
        retry_rate = (retry_count / request_count) if request_count else 0.0

        return {
            "candidate_id": candidate_id,
            "candidate_type": candidate_type,
            "window_hours": int(window_hours),
            "sample_count": request_count,
            "request_count": request_count,
            "success_rate": round(success_rate, 6),
            "failure_rate": round(failure_rate, 6),
            "p95_latency_ms": round(self._percentile(durations, 0.95), 3),
            "deny_rate": round(deny_rate, 6),
            "retry_rate": round(retry_rate, 6),
            "avg_cost_per_request_usd": round((sum(costs) / len(costs)) if costs else 0.0, 8),
            "generated_at": int(time.time()),
            "data_source": "skill_runs+policy_decisions",
        }

    @staticmethod
    def _normalize_offline_thresholds(value: Optional[Dict[str, Any]]) -> Dict[str, float]:
        payload = value if isinstance(value, dict) else {}
        return {
            "accuracy_min": float(payload.get("accuracy_min", OFFLINE_DEFAULT_THRESHOLDS["accuracy_min"])),
            "p95_latency_ms_max": float(
                payload.get("p95_latency_ms_max", OFFLINE_DEFAULT_THRESHOLDS["p95_latency_ms_max"])
            ),
            "cost_per_request_usd_max": float(
                payload.get("cost_per_request_usd_max", OFFLINE_DEFAULT_THRESHOLDS["cost_per_request_usd_max"])
            ),
            "stability_min": float(payload.get("stability_min", OFFLINE_DEFAULT_THRESHOLDS["stability_min"])),
        }

    @staticmethod
    def _normalize_online_thresholds(value: Optional[Dict[str, Any]]) -> Dict[str, float]:
        payload = value if isinstance(value, dict) else {}
        return {
            "success_rate_min": float(payload.get("success_rate_min", ONLINE_DEFAULT_THRESHOLDS["success_rate_min"])),
            "p95_latency_ms_max": float(
                payload.get("p95_latency_ms_max", ONLINE_DEFAULT_THRESHOLDS["p95_latency_ms_max"])
            ),
            "deny_rate_max": float(payload.get("deny_rate_max", ONLINE_DEFAULT_THRESHOLDS["deny_rate_max"])),
            "retry_rate_max": float(payload.get("retry_rate_max", ONLINE_DEFAULT_THRESHOLDS["retry_rate_max"])),
        }

    def _resolve_offline_metrics(
        self,
        candidate_id: str,
        candidate_type: str,
        window_hours: int,
        sample_size: int,
        observed_metrics: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        derived = self._compute_online_metrics(
            candidate_id=candidate_id,
            candidate_type=candidate_type,
            window_hours=window_hours,
        )

        observed = observed_metrics if isinstance(observed_metrics, dict) else {}
        derived_sample_count = int(derived.get("sample_count") or 0)
        effective_sample_count = min(derived_sample_count, sample_size)

        metrics = {
            "accuracy": self._to_float(observed.get("accuracy"), derived.get("success_rate")),
            "p95_latency_ms": self._to_float(observed.get("p95_latency_ms"), derived.get("p95_latency_ms")),
            "cost_per_request_usd": self._to_float(
                observed.get("cost_per_request_usd"),
                derived.get("avg_cost_per_request_usd"),
            ),
            "stability": self._to_float(observed.get("stability"), derived.get("success_rate")),
            "sample_count": int(observed.get("sample_count") or effective_sample_count),
        }
        return metrics

    def run_offline_evaluation(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        candidate_type = self._normalize_candidate_type(payload.get("candidate_type"))
        candidate_id = str(payload.get("candidate_id") or "").strip()
        if candidate_type != "system" and not candidate_id:
            raise ValueError("candidate_id is required for skill/model/workflow offline evaluation")
        if candidate_type == "system" and not candidate_id:
            candidate_id = "global"

        baseline_reference = str(payload.get("baseline_reference") or "")
        window_hours = int(payload.get("window_hours") or 24)
        sample_size = int(payload.get("sample_size") or 200)
        notes = str(payload.get("notes") or "")
        trace_id = str(payload.get("trace_id") or "")

        thresholds = self._normalize_offline_thresholds(payload.get("thresholds"))
        observed_metrics = self._resolve_offline_metrics(
            candidate_id=candidate_id,
            candidate_type=candidate_type,
            window_hours=window_hours,
            sample_size=sample_size,
            observed_metrics=payload.get("observed_metrics"),
        )

        checks = [
            {
                "metric": "accuracy",
                "comparator": ">=",
                "expected": thresholds["accuracy_min"],
                "actual": observed_metrics.get("accuracy"),
                "passed": (observed_metrics.get("accuracy") is not None)
                and float(observed_metrics.get("accuracy")) >= thresholds["accuracy_min"],
                "note": "",
            },
            {
                "metric": "p95_latency_ms",
                "comparator": "<=",
                "expected": thresholds["p95_latency_ms_max"],
                "actual": observed_metrics.get("p95_latency_ms"),
                "passed": (observed_metrics.get("p95_latency_ms") is not None)
                and float(observed_metrics.get("p95_latency_ms")) <= thresholds["p95_latency_ms_max"],
                "note": "",
            },
            {
                "metric": "cost_per_request_usd",
                "comparator": "<=",
                "expected": thresholds["cost_per_request_usd_max"],
                "actual": observed_metrics.get("cost_per_request_usd"),
                "passed": (observed_metrics.get("cost_per_request_usd") is not None)
                and float(observed_metrics.get("cost_per_request_usd")) <= thresholds["cost_per_request_usd_max"],
                "note": "",
            },
            {
                "metric": "stability",
                "comparator": ">=",
                "expected": thresholds["stability_min"],
                "actual": observed_metrics.get("stability"),
                "passed": (observed_metrics.get("stability") is not None)
                and float(observed_metrics.get("stability")) >= thresholds["stability_min"],
                "note": "",
            },
        ]

        has_missing_metric = any(item.get("actual") is None for item in checks)
        sample_count = int(observed_metrics.get("sample_count") or 0)
        if has_missing_metric or sample_count <= 0:
            status = "insufficient_data"
            summary = "Offline baseline has insufficient metrics/sample data."
        elif all(bool(item.get("passed")) for item in checks):
            status = "passed"
            summary = "Offline baseline passed all threshold checks."
        else:
            status = "failed"
            summary = "Offline baseline failed one or more threshold checks."

        now = int(time.time())
        record = {
            "id": f"oev-{uuid.uuid4().hex[:24]}",
            "candidate_id": candidate_id,
            "candidate_type": candidate_type,
            "status": status,
            "thresholds": thresholds,
            "observed_metrics": observed_metrics,
            "checks": checks,
            "summary": summary,
            "baseline_reference": baseline_reference,
            "notes": notes,
            "trace_id": trace_id,
            "created_at": now,
        }

        with self._lock:
            self._state["offline_evaluations"].append(record)
            self._persist_state()

        return record

    def list_offline_evaluations(
        self,
        candidate_id: Optional[str] = None,
        candidate_type: Optional[str] = None,
        status: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        with self._lock:
            rows = list(self._state.get("offline_evaluations", []))

        items = rows
        if candidate_type:
            normalized = self._normalize_candidate_type(candidate_type)
            items = [row for row in items if str(row.get("candidate_type") or "") == normalized]
        if candidate_id:
            items = [row for row in items if str(row.get("candidate_id") or "") == str(candidate_id)]
        if status:
            items = [row for row in items if str(row.get("status") or "") == str(status)]

        return sorted(items, key=lambda row: int(row.get("created_at") or 0), reverse=True)

    def get_offline_evaluation(self, evaluation_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            for row in self._state.get("offline_evaluations", []):
                if str(row.get("id") or "") == evaluation_id:
                    return dict(row)
        return None

    def get_online_metrics(
        self,
        candidate_id: str,
        candidate_type: str,
        window_hours: int,
    ) -> Dict[str, Any]:
        normalized_type = self._normalize_candidate_type(candidate_type)
        if normalized_type != "system" and not str(candidate_id or "").strip():
            raise ValueError("candidate_id is required for skill/model/workflow online metrics")

        effective_id = str(candidate_id or "").strip() or "global"
        return self._compute_online_metrics(
            candidate_id=effective_id,
            candidate_type=normalized_type,
            window_hours=int(window_hours),
        )

    def _latest_offline_evaluation(self, candidate_id: str, candidate_type: str) -> Optional[Dict[str, Any]]:
        rows = self.list_offline_evaluations(candidate_id=candidate_id, candidate_type=candidate_type)
        return rows[0] if rows else None

    def evaluate_release_gate(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        candidate_type = self._normalize_candidate_type(payload.get("candidate_type"))
        candidate_id = str(payload.get("candidate_id") or "").strip()
        if candidate_type != "system" and not candidate_id:
            raise ValueError("candidate_id is required for skill/model/workflow release gate")
        if candidate_type == "system" and not candidate_id:
            candidate_id = "global"

        offline_eval_id = str(payload.get("offline_eval_id") or "").strip() or None
        window_hours = int(payload.get("window_hours") or 24)
        notes = str(payload.get("notes") or "")
        trace_id = str(payload.get("trace_id") or "")
        release_strategy = str(payload.get("release_strategy") or "canary").strip().lower()

        if offline_eval_id:
            offline_eval = self.get_offline_evaluation(offline_eval_id)
        else:
            offline_eval = self._latest_offline_evaluation(candidate_id=candidate_id, candidate_type=candidate_type)

        offline_status = str((offline_eval or {}).get("status") or "missing")
        effective_offline_eval_id = (offline_eval or {}).get("id")

        online_metrics = self._compute_online_metrics(
            candidate_id=candidate_id,
            candidate_type=candidate_type,
            window_hours=window_hours,
        )
        thresholds = self._normalize_online_thresholds(payload.get("online_thresholds"))

        checks = [
            {
                "metric": "offline_status_passed",
                "comparator": "==",
                "expected": 1.0,
                "actual": 1.0 if offline_status == "passed" else 0.0,
                "passed": offline_status == "passed",
                "note": f"offline_status={offline_status}",
            },
            {
                "metric": "success_rate",
                "comparator": ">=",
                "expected": thresholds["success_rate_min"],
                "actual": float(online_metrics.get("success_rate") or 0.0),
                "passed": float(online_metrics.get("success_rate") or 0.0) >= thresholds["success_rate_min"],
                "note": "",
            },
            {
                "metric": "p95_latency_ms",
                "comparator": "<=",
                "expected": thresholds["p95_latency_ms_max"],
                "actual": float(online_metrics.get("p95_latency_ms") or 0.0),
                "passed": float(online_metrics.get("p95_latency_ms") or 0.0) <= thresholds["p95_latency_ms_max"],
                "note": "",
            },
            {
                "metric": "deny_rate",
                "comparator": "<=",
                "expected": thresholds["deny_rate_max"],
                "actual": float(online_metrics.get("deny_rate") or 0.0),
                "passed": float(online_metrics.get("deny_rate") or 0.0) <= thresholds["deny_rate_max"],
                "note": "",
            },
            {
                "metric": "retry_rate",
                "comparator": "<=",
                "expected": thresholds["retry_rate_max"],
                "actual": float(online_metrics.get("retry_rate") or 0.0),
                "passed": float(online_metrics.get("retry_rate") or 0.0) <= thresholds["retry_rate_max"],
                "note": "",
            },
        ]

        all_passed = all(bool(item.get("passed")) for item in checks)
        success_rate = float(online_metrics.get("success_rate") or 0.0)
        p95_latency_ms = float(online_metrics.get("p95_latency_ms") or 0.0)

        canary_eligible = (
            offline_status == "passed"
            and success_rate >= thresholds["success_rate_min"] * 0.9
            and p95_latency_ms <= thresholds["p95_latency_ms_max"] * 1.2
        )

        if all_passed:
            decision = "approved"
            if release_strategy == "canary":
                recommended_action = "canary_release"
                reason = "All gate checks passed; canary strategy requested."
            else:
                recommended_action = "full_release"
                reason = "All gate checks passed; eligible for full release."
            rollback_recommended = False
        elif canary_eligible:
            decision = "canary"
            recommended_action = "canary_release"
            reason = "Primary checks near threshold; limited canary release is allowed."
            rollback_recommended = False
        else:
            decision = "blocked"
            rollback_recommended = success_rate < thresholds["success_rate_min"] * 0.8
            recommended_action = "rollback" if rollback_recommended else "hold"
            reason = "Release gate blocked due to offline/online threshold violations."

        record = {
            "id": f"rg-{uuid.uuid4().hex[:24]}",
            "candidate_id": candidate_id,
            "candidate_type": candidate_type,
            "offline_eval_id": effective_offline_eval_id,
            "offline_status": offline_status,
            "online_metrics": online_metrics,
            "thresholds": thresholds,
            "checks": checks,
            "decision": decision,
            "recommended_action": recommended_action,
            "rollback_recommended": rollback_recommended,
            "reason": reason,
            "notes": notes,
            "trace_id": trace_id,
            "created_at": int(time.time()),
        }

        with self._lock:
            self._state["release_gates"].append(record)
            self._persist_state()

        return record

    def list_release_gates(
        self,
        candidate_id: Optional[str] = None,
        candidate_type: Optional[str] = None,
        decision: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        with self._lock:
            rows = list(self._state.get("release_gates", []))

        items = rows
        if candidate_type:
            normalized = self._normalize_candidate_type(candidate_type)
            items = [row for row in items if str(row.get("candidate_type") or "") == normalized]
        if candidate_id:
            items = [row for row in items if str(row.get("candidate_id") or "") == str(candidate_id)]
        if decision:
            items = [row for row in items if str(row.get("decision") or "") == str(decision)]

        return sorted(items, key=lambda row: int(row.get("created_at") or 0), reverse=True)

    def get_release_gate(self, gate_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            for row in self._state.get("release_gates", []):
                if str(row.get("id") or "") == gate_id:
                    return dict(row)
        return None


release_governance_service = ReleaseGovernanceService()
