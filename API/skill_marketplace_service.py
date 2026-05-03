"""
Skill marketplace service for DeepAnalyze API Server.
Provides skill manifest registry, install lifecycle, and permission governance.
"""

import json
import os
import threading
import time
import uuid
import urllib.request
from typing import Any, Dict, List, Optional, Tuple

from config import WORKSPACE_BASE_DIR
from skill_runner import execute_installed_skill
from storage import storage

SKILL_MARKETPLACE_PATH = os.path.join(WORKSPACE_BASE_DIR, "_skill_marketplace.json")
SKILL_INSTALLS_PATH = os.path.join(WORKSPACE_BASE_DIR, "_skill_installs.json")

HIGH_RISK_PERMISSIONS = {"shell.exec", "secret.read", "data.write"}
ALLOWED_RUNTIMES = {"python", "http", "workflow"}
POLICY_VERSION = "2026-04-platform-v1"

PERMISSION_DEFAULT_ACTION_RESOURCE = {
    "data.read": ("read", "dataset"),
    "data.write": ("write", "dataset"),
    "shell.exec": ("exec", "shell"),
    "model.call": ("call", "model"),
    "secret.read": ("read", "secret"),
}


class SkillMarketplaceService:
    """Marketplace registry and installation service for platform skills."""

    def __init__(self):
        self._lock = threading.Lock()
        os.makedirs(WORKSPACE_BASE_DIR, exist_ok=True)
        self._skills = self._load_or_init(
            SKILL_MARKETPLACE_PATH,
            {"skills": self._default_skills()},
            root_key="skills",
        )
        self._installs = self._load_or_init(
            SKILL_INSTALLS_PATH,
            {"installed": []},
            root_key="installed",
        )
        self._seed_curated_skills()

    def _load_or_init(self, file_path: str, default_payload: Dict[str, Any], root_key: str) -> Dict[str, Any]:
        if not os.path.exists(file_path):
            self._save(file_path, default_payload)
            return default_payload

        try:
            with open(file_path, "r", encoding="utf-8") as f:
                loaded = json.load(f)
            if not isinstance(loaded, dict) or root_key not in loaded or not isinstance(loaded[root_key], list):
                raise ValueError("Invalid registry format")
            return loaded
        except Exception:
            self._save(file_path, default_payload)
            return default_payload

    def _save(self, file_path: str, payload: Dict[str, Any]) -> None:
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)

    def _default_skills(self) -> List[Dict[str, Any]]:
        now = int(time.time())
        return [
            {
                "id": "data-quality-check",
                "name": "Data Quality Check",
                "version": "1.0.0",
                "publisher": "deepanalyze",
                "description": "Validate missing values, duplicates, and schema consistency.",
                "runtime": "workflow",
                "entrypoint": "builtin:data_quality_check",
                "permissions": ["data.read"],
                "tags": ["quality", "validation"],
                "directory": "core",
                "compatibility": "通用",
                "install_commands": {},
                "requires": [],
                "benchmark": False,
                "security_scan": "",
                "homepage": "",
                "source": "builtin",
                "config_schema": {},
                "enabled": True,
                "created_at": now,
                "updated_at": now,
            },
            {
                "id": "trend-analysis",
                "name": "Trend Analysis",
                "version": "1.0.0",
                "publisher": "deepanalyze",
                "description": "Generate time-series trend insights with anomaly highlights.",
                "runtime": "workflow",
                "entrypoint": "builtin:trend_analysis",
                "permissions": ["data.read", "model.call"],
                "tags": ["timeseries", "analysis"],
                "directory": "core",
                "compatibility": "通用",
                "install_commands": {},
                "requires": [],
                "benchmark": False,
                "security_scan": "",
                "homepage": "",
                "source": "builtin",
                "config_schema": {},
                "enabled": True,
                "created_at": now,
                "updated_at": now,
            },
            {
                "id": "report-publisher",
                "name": "Report Publisher",
                "version": "1.0.0",
                "publisher": "deepanalyze",
                "description": "Publish markdown/html reports and generated artifacts.",
                "runtime": "workflow",
                "entrypoint": "builtin:report_publisher",
                "permissions": ["data.read", "data.write"],
                "tags": ["report", "delivery"],
                "directory": "core",
                "compatibility": "通用",
                "install_commands": {},
                "requires": [],
                "benchmark": False,
                "security_scan": "",
                "homepage": "",
                "source": "builtin",
                "config_schema": {},
                "enabled": True,
                "created_at": now,
                "updated_at": now,
            },
        ]

    def _curated_skills(self) -> List[Dict[str, Any]]:
        now = int(time.time())
        base = {
            "version": "1.0.0",
            "publisher": "community",
            "runtime": "workflow",
            "entrypoint": "builtin:external_skill_reference",
            "permissions": ["data.read"],
            "enabled": True,
            "source": "clawhub-community",
            "config_schema": {},
            "created_at": now,
            "updated_at": now,
            "security_scan": "",
        }

        curated = [
            {
                "id": "intsig-textin-xparse-parser",
                "name": "TextIn xParse",
                "publisher": "intsig-textin",
                "description": "支持 PDF/Word/Excel/PPT/长截图等 20+ 格式，适合复杂版式与跨页表格解析。",
                "tags": ["featured", "document-processing", "data-analysis", "xparse"],
                "directory": "featured",
                "compatibility": "通用",
                "benchmark": True,
                "install_commands": {
                    "agent_auto": "帮我从技能市场安装 intsig-textin/xparse-parser",
                    "manual": "npx skills add intsig-textin/xparse-skills --yes",
                },
                "requires": [],
                "config_schema": {
                    "external_skill_id": "intsig-textin/xparse-parser",
                    "external_package": "intsig-textin/xparse-skills",
                    "daily_free_quota_pages": 1000,
                },
            },
            {
                "id": "xlsx-excel-expert",
                "name": "xlsx (Excel 表格专家)",
                "description": "支持 Excel/CSV 的公式写入、分组、透视统计与报表分析。",
                "tags": ["data-analysis", "excel", "csv"],
                "directory": "data-analysis",
                "compatibility": "通用",
                "benchmark": False,
                "install_commands": {},
                "requires": [],
            },
            {
                "id": "data-analysis-partner",
                "name": "Data Analysis Partner",
                "description": "自动生成 BI 可视化仪表盘，支持 CSV/Excel。",
                "tags": ["data-analysis", "bi", "dashboard"],
                "directory": "data-analysis",
                "compatibility": "通用",
                "benchmark": False,
                "install_commands": {},
                "requires": [],
            },
            {
                "id": "mysql-postgresql-skills",
                "name": "MySQL / PostgreSQL Skills",
                "description": "用于 SQL 数据库查询与分析任务，适配 MySQL/PostgreSQL。",
                "tags": ["data-analysis", "sql", "database"],
                "directory": "data-analysis",
                "compatibility": "通用",
                "benchmark": False,
                "install_commands": {},
                "requires": [],
            },
            {
                "id": "sql-toolkit",
                "name": "SQL Toolkit",
                "description": "支持数据库查询、设计、迁移与优化。",
                "tags": ["data-analysis", "sql", "migration"],
                "directory": "data-analysis",
                "compatibility": "通用",
                "benchmark": False,
                "install_commands": {},
                "requires": [],
            },
            {
                "id": "python-data-automation",
                "name": "python (通用)",
                "description": "可用于 CSV/Excel 数据清洗、转换与自动化脚本执行。",
                "tags": ["data-analysis", "python", "automation"],
                "directory": "data-analysis",
                "compatibility": "通用",
                "benchmark": False,
                "install_commands": {},
                "requires": [],
            },
            {
                "id": "google-sheets-integration",
                "name": "Google Sheets Integration",
                "description": "在线表格协同分析能力，支持 Google Sheets。",
                "tags": ["data-analysis", "google-sheets"],
                "directory": "data-analysis",
                "compatibility": "需 Google 账号/api",
                "benchmark": False,
                "install_commands": {},
                "requires": ["google-account", "google-api"],
            },
            {
                "id": "pdf-core-extractor",
                "name": "pdf",
                "description": "针对 PDF 合同、报告等长文档提取关键条款与数据。",
                "tags": ["document-processing", "pdf"],
                "directory": "document-processing",
                "compatibility": "通用",
                "benchmark": False,
                "install_commands": {},
                "requires": [],
            },
            {
                "id": "compdf-suite",
                "name": "PDF 全能处理 (ComPDF)",
                "description": "支持 PDF/图片转换、版式分析与多语言 OCR。",
                "tags": ["document-processing", "pdf", "ocr"],
                "directory": "document-processing",
                "compatibility": "通用",
                "benchmark": False,
                "install_commands": {},
                "requires": [],
            },
            {
                "id": "easydoc-parser",
                "name": "易文档解析 (EasyDoc)",
                "description": "将非结构化文档转换为结构化 JSON，含快速/精准模式。",
                "tags": ["document-processing", "json"],
                "directory": "document-processing",
                "compatibility": "通用",
                "benchmark": False,
                "install_commands": {},
                "requires": [],
            },
            {
                "id": "markdown-mermaid-writing",
                "name": "markdown-mermaid-writing",
                "description": "专业级 Markdown 内容生成与 Mermaid 图表绘制。",
                "tags": ["document-generation", "markdown", "mermaid"],
                "directory": "document-generation",
                "compatibility": "通用",
                "benchmark": False,
                "install_commands": {},
                "requires": [],
            },
            {
                "id": "general-writing-markdown",
                "name": "General Writing",
                "description": "聚焦权威 Markdown 文档生成。",
                "tags": ["document-generation", "markdown"],
                "directory": "document-generation",
                "compatibility": "通用",
                "benchmark": False,
                "install_commands": {},
                "requires": [],
            },
            {
                "id": "ppt-pro-generator",
                "name": "PPT 专业生成",
                "description": "按大纲自动布局并插入图表，输出 PowerPoint。",
                "tags": ["document-generation", "ppt"],
                "directory": "document-generation",
                "compatibility": "通用",
                "benchmark": False,
                "install_commands": {},
                "requires": [],
            },
            {
                "id": "latex-posters",
                "name": "LaTeX Posters",
                "description": "用于创建专业学术海报的 LaTeX 方案。",
                "tags": ["document-generation", "latex"],
                "directory": "document-generation",
                "compatibility": "通用 (需 LaTeX 环境)",
                "benchmark": False,
                "install_commands": {},
                "requires": ["latex"],
            },
            {
                "id": "markitdown-converter",
                "name": "MarkItDown 文档转换器",
                "description": "微软方案，支持 PDF/Word/Excel/图片/音频/YouTube -> Markdown。",
                "tags": ["format-conversion", "markdown", "markitdown"],
                "directory": "format-conversion",
                "compatibility": "需安装 MarkItDown 引擎",
                "benchmark": False,
                "install_commands": {},
                "requires": ["markitdown"],
            },
            {
                "id": "markitdown-cli-converter",
                "name": "文档转换器 (markitdown 引擎)",
                "description": "专攻专有格式到 Markdown，支持 PDF/DOCX/XLSX/PPTX。",
                "tags": ["format-conversion", "markdown", "markitdown"],
                "directory": "format-conversion",
                "compatibility": "需安装 markitdown CLI",
                "benchmark": False,
                "install_commands": {},
                "requires": ["markitdown-cli"],
            },
            {
                "id": "pandoc-convert",
                "name": "Pandoc Convert",
                "description": "支持广泛文档格式互转，例如 DOC -> PDF、HTML -> MD。",
                "tags": ["format-conversion", "pandoc"],
                "directory": "format-conversion",
                "compatibility": "需本地安装 Pandoc",
                "benchmark": False,
                "install_commands": {},
                "requires": ["pandoc"],
            },
        ]

        return [{**base, **item} for item in curated]

    def _seed_curated_skills(self) -> None:
        with self._lock:
            existing_ids = {str(s.get("id")) for s in self._skills.get("skills", [])}
            changed = False
            for skill in self._curated_skills():
                normalized = self._validate_manifest(skill)
                if normalized["id"] in existing_ids:
                    continue
                self._skills["skills"].append(normalized)
                existing_ids.add(normalized["id"])
                changed = True

            if changed:
                self._save(SKILL_MARKETPLACE_PATH, self._skills)

    def _validate_manifest(self, manifest: Dict[str, Any]) -> Dict[str, Any]:
        required_fields = ["id", "name", "version", "entrypoint"]
        for field in required_fields:
            if not str(manifest.get(field, "")).strip():
                raise ValueError(f"Skill manifest missing required field: {field}")

        runtime = str(manifest.get("runtime") or "python").strip()
        if runtime not in ALLOWED_RUNTIMES:
            raise ValueError(f"Unsupported skill runtime: {runtime}")

        normalized_permissions = manifest.get("permissions") or []
        if not isinstance(normalized_permissions, list):
            raise ValueError("permissions must be a list")

        normalized_tags = manifest.get("tags") or []
        if not isinstance(normalized_tags, list):
            raise ValueError("tags must be a list")

        install_commands = manifest.get("install_commands") or {}
        if not isinstance(install_commands, dict):
            raise ValueError("install_commands must be a dict")

        requires = manifest.get("requires") or []
        if not isinstance(requires, list):
            raise ValueError("requires must be a list")

        now = int(time.time())
        normalized = {
            "id": str(manifest.get("id")).strip(),
            "name": str(manifest.get("name")).strip(),
            "version": str(manifest.get("version")).strip(),
            "publisher": str(manifest.get("publisher") or "community").strip(),
            "description": str(manifest.get("description") or "").strip(),
            "runtime": runtime,
            "entrypoint": str(manifest.get("entrypoint")).strip(),
            "permissions": [str(p).strip() for p in normalized_permissions if str(p).strip()],
            "tags": [str(t).strip() for t in normalized_tags if str(t).strip()],
            "directory": str(manifest.get("directory") or "general").strip(),
            "compatibility": str(manifest.get("compatibility") or "通用").strip(),
            "install_commands": {
                str(k).strip(): str(v).strip()
                for k, v in install_commands.items()
                if str(k).strip() and str(v).strip()
            },
            "requires": [str(item).strip() for item in requires if str(item).strip()],
            "benchmark": bool(manifest.get("benchmark", False)),
            "security_scan": str(manifest.get("security_scan") or "").strip(),
            "homepage": str(manifest.get("homepage") or "").strip(),
            "source": str(manifest.get("source") or "local").strip(),
            "config_schema": manifest.get("config_schema") or {},
            "enabled": bool(manifest.get("enabled", True)),
            "created_at": int(manifest.get("created_at") or now),
            "updated_at": int(manifest.get("updated_at") or now),
        }
        return normalized

    def _fetch_manifest_from_url(self, manifest_url: str) -> Dict[str, Any]:
        try:
            with urllib.request.urlopen(manifest_url, timeout=15) as resp:
                raw = resp.read().decode("utf-8")
            payload = json.loads(raw)
            if isinstance(payload, dict) and isinstance(payload.get("manifest"), dict):
                payload = payload["manifest"]
            if not isinstance(payload, dict):
                raise ValueError("manifest_url must return a JSON object")
            payload["source"] = manifest_url
            return payload
        except Exception as exc:
            raise ValueError(f"Failed to fetch skill manifest from URL: {exc}")

    def _risk_from_permissions(self, permissions: List[str]) -> str:
        if any(p in HIGH_RISK_PERMISSIONS for p in permissions):
            return "high"
        if permissions:
            return "medium"
        return "low"

    @staticmethod
    def _normalize_trace_id(trace_id: Optional[str]) -> str:
        value = str(trace_id or "").strip()
        if value:
            return value
        return f"trc-{uuid.uuid4().hex[:24]}"

    def _default_action_resource(self, permission: str) -> Tuple[str, str]:
        key = str(permission or "").strip().lower()
        if key in PERMISSION_DEFAULT_ACTION_RESOURCE:
            return PERMISSION_DEFAULT_ACTION_RESOURCE[key]

        parts = key.split(".", 1)
        if len(parts) == 2 and parts[0] and parts[1]:
            return parts[1], parts[0]
        return "use", key or "unknown"

    @staticmethod
    def _normalize_scope_value_list(values: Any) -> List[str]:
        if not isinstance(values, list):
            return []
        return [str(item).strip() for item in values if str(item).strip()]

    @staticmethod
    def _matches_allowed_values(value: Optional[str], allowed_values: List[str]) -> bool:
        if not allowed_values:
            return True
        if not value:
            return False

        value = str(value)
        for allowed in allowed_values:
            if allowed == "*":
                return True
            if allowed.endswith("*") and value.startswith(allowed[:-1]):
                return True
            if value == allowed:
                return True
        return False

    @staticmethod
    def _context_dataset_id(runtime_context: Dict[str, Any]) -> str:
        dataset_id = runtime_context.get("dataset_id")
        if dataset_id:
            return str(dataset_id)
        dataset_obj = runtime_context.get("dataset")
        if isinstance(dataset_obj, dict) and dataset_obj.get("id"):
            return str(dataset_obj.get("id"))
        return ""

    @staticmethod
    def _context_value(runtime_context: Dict[str, Any], keys: List[str]) -> str:
        for key in keys:
            value = runtime_context.get(key)
            if value not in (None, ""):
                return str(value)
        return ""

    def _normalize_permission_scopes(
        self,
        permission_scopes: Optional[Dict[str, Any]],
        declared_permissions: List[str],
    ) -> Tuple[Dict[str, Dict[str, Any]], List[str]]:
        if permission_scopes is None:
            return {}, []
        if not isinstance(permission_scopes, dict):
            return {}, ["permission_scopes must be a dict"]

        normalized: Dict[str, Dict[str, Any]] = {}
        errors: List[str] = []
        declared = {str(item).strip() for item in declared_permissions if str(item).strip()}
        known_meta_fields = {"action", "resource", "scope", "constraints", "ttl_sec"}

        for permission_key, scope_raw in permission_scopes.items():
            permission = str(permission_key).strip()
            if not permission:
                continue
            if permission not in declared:
                errors.append(f"Unknown permission scope key: {permission}")
                continue

            if scope_raw is None:
                scope_raw = {}
            if not isinstance(scope_raw, dict):
                errors.append(f"Scope for permission '{permission}' must be a dict")
                continue

            default_action, default_resource = self._default_action_resource(permission)
            action = str(scope_raw.get("action") or default_action).strip().lower() or default_action
            resource = str(scope_raw.get("resource") or default_resource).strip().lower() or default_resource

            ttl_raw = scope_raw.get("ttl_sec", 0)
            try:
                ttl_sec = 0 if ttl_raw in (None, "") else int(ttl_raw)
                if ttl_sec < 0:
                    raise ValueError()
            except Exception:
                errors.append(f"ttl_sec for permission '{permission}' must be a non-negative integer")
                ttl_sec = 0

            scope_obj = scope_raw.get("scope") if isinstance(scope_raw.get("scope"), dict) else None
            if scope_obj is None:
                # Backward compatibility: treat unknown top-level fields as scope payload.
                scope_obj = {
                    str(k): v
                    for k, v in scope_raw.items()
                    if str(k) not in known_meta_fields
                }

            constraints_obj = scope_raw.get("constraints")
            if not isinstance(constraints_obj, dict):
                constraints_obj = {}

            normalized[permission] = {
                "action": action,
                "resource": resource,
                "scope": scope_obj,
                "constraints": constraints_obj,
                "ttl_sec": ttl_sec,
            }

        return normalized, errors

    def _build_permission_rules(
        self,
        permissions: List[str],
        normalized_scopes: Dict[str, Dict[str, Any]],
        issued_at: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        created_at = int(issued_at or int(time.time()))
        rules: List[Dict[str, Any]] = []

        for permission in permissions:
            action_default, resource_default = self._default_action_resource(permission)
            payload = normalized_scopes.get(permission) or {}
            ttl_sec = int(payload.get("ttl_sec") or 0)
            expires_at = (created_at + ttl_sec) if ttl_sec > 0 else None

            rules.append(
                {
                    "permission": permission,
                    "action": str(payload.get("action") or action_default),
                    "resource": str(payload.get("resource") or resource_default),
                    "scope": payload.get("scope") if isinstance(payload.get("scope"), dict) else {},
                    "constraints": payload.get("constraints") if isinstance(payload.get("constraints"), dict) else {},
                    "ttl_sec": ttl_sec,
                    "issued_at": created_at,
                    "expires_at": expires_at,
                }
            )

        return rules

    def _validate_rule_scope(self, rule: Dict[str, Any], runtime_context: Dict[str, Any]) -> Optional[str]:
        resource = str(rule.get("resource") or "").strip().lower()
        scope = rule.get("scope") if isinstance(rule.get("scope"), dict) else {}

        if resource in {"dataset", "data"}:
            allowed_dataset_ids = self._normalize_scope_value_list(
                scope.get("allowed_dataset_ids") or scope.get("dataset_ids")
            )
            if allowed_dataset_ids:
                dataset_id = self._context_dataset_id(runtime_context)
                if not dataset_id:
                    return "dataset_id is required by scoped dataset permission"
                if not self._matches_allowed_values(dataset_id, allowed_dataset_ids):
                    return "dataset_id is outside granted dataset scope"

            allowed_paths = self._normalize_scope_value_list(scope.get("allowed_paths"))
            if allowed_paths:
                path_value = self._context_value(runtime_context, ["path", "file_path", "output_path"])
                if not path_value:
                    return "path is required by scoped data.write permission"
                if not self._matches_allowed_values(path_value, allowed_paths):
                    return "path is outside granted data.write scope"

        if resource == "shell":
            allowed_commands = self._normalize_scope_value_list(scope.get("allowed_commands"))
            if allowed_commands:
                run_command = self._context_value(runtime_context, ["command", "shell_command"])
                if not run_command:
                    return "command is required by scoped shell permission"
                if not self._matches_allowed_values(run_command, allowed_commands):
                    return "command is outside granted shell scope"

        if resource == "model":
            allowed_models = self._normalize_scope_value_list(scope.get("allowed_models"))
            if allowed_models:
                model_name = self._context_value(runtime_context, ["model", "provider_model"])
                if not model_name:
                    return "model is required by scoped model permission"
                if not self._matches_allowed_values(model_name, allowed_models):
                    return "model is outside granted model scope"

        if resource == "secret":
            allowed_secret_keys = self._normalize_scope_value_list(
                scope.get("allowed_secret_keys") or scope.get("secret_keys")
            )
            if allowed_secret_keys:
                secret_key = self._context_value(runtime_context, ["secret_key", "secret_name"])
                if not secret_key:
                    return "secret_key is required by scoped secret permission"
                if not self._matches_allowed_values(secret_key, allowed_secret_keys):
                    return "secret_key is outside granted secret scope"

        return None

    def _validate_permission_rules(
        self,
        required_permissions: List[str],
        permission_rules: List[Dict[str, Any]],
        runtime_context: Dict[str, Any],
    ) -> List[str]:
        now_ts = int(time.time())
        errors: List[str] = []

        for permission in required_permissions:
            candidates = [
                item
                for item in permission_rules
                if str(item.get("permission") or "") == permission
            ]
            if not candidates:
                errors.append(f"Permission {permission} has no grant rule")
                continue

            active_candidates = []
            for rule in candidates:
                expires_at_raw = rule.get("expires_at")
                if expires_at_raw in (None, ""):
                    active_candidates.append(rule)
                    continue
                try:
                    expires_at = int(expires_at_raw)
                except Exception:
                    continue
                if expires_at > now_ts:
                    active_candidates.append(rule)

            if not active_candidates:
                errors.append(f"Permission {permission} grant expired")
                continue

            scope_errors: List[str] = []
            matched = False
            for rule in active_candidates:
                scope_error = self._validate_rule_scope(rule, runtime_context)
                if not scope_error:
                    matched = True
                    break
                scope_errors.append(scope_error)

            if not matched:
                first_error = scope_errors[0] if scope_errors else "no matching scoped rule"
                errors.append(f"Permission {permission} scope denied: {first_error}")

        return errors

    def _record_policy_decision(
        self,
        action: str,
        skill_id: str,
        effect: str,
        risk_level: str,
        reasons: List[str],
        required_permissions: List[str],
        missing_requirements: List[str],
        trace_id: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        return storage.create_skill_policy_decision(
            {
                "action": action,
                "skill_id": skill_id,
                "effect": effect,
                "risk_level": risk_level,
                "reasons": reasons,
                "required_permissions": required_permissions,
                "missing_requirements": missing_requirements,
                "policy_version": POLICY_VERSION,
                "trace_id": trace_id,
                "context": context or {},
            }
        )

    def preflight_install_policy(
        self,
        skill_id: str,
        config: Optional[Dict[str, Any]] = None,
        permission_scopes: Optional[Dict[str, Any]] = None,
        trace_id: Optional[str] = None,
        approve_high_risk_permissions: bool = False,
    ) -> Dict[str, Any]:
        """Evaluate policy before install and persist one decision record."""
        effective_trace_id = self._normalize_trace_id(trace_id)
        skill = self.get_skill(skill_id)
        if not skill:
            raise ValueError(f"Skill not found: {skill_id}")

        permissions = [str(p) for p in skill.get("permissions", [])]
        risk_level = self._risk_from_permissions(permissions)
        reasons: List[str] = []
        missing_requirements: List[str] = []
        effect = "allow"

        if not skill.get("enabled", True):
            effect = "deny"
            reasons.append("Skill is disabled")

        requirements = [str(item) for item in skill.get("requires", [])]
        available_caps = [
            str(item)
            for item in ((config or {}).get("available_capabilities") or [])
        ]
        if requirements:
            missing_requirements = [item for item in requirements if item not in available_caps]
            if missing_requirements:
                effect = "deny"
                reasons.append("Missing required capabilities")

        has_high_risk = any(p in HIGH_RISK_PERMISSIONS for p in permissions)
        if effect != "deny" and has_high_risk and not approve_high_risk_permissions:
            effect = "approval_required"
            reasons.append("High-risk permissions require explicit approval")

        normalized_scopes, scope_validation_errors = self._normalize_permission_scopes(
            permission_scopes=permission_scopes,
            declared_permissions=permissions,
        )
        if scope_validation_errors:
            effect = "deny"
            reasons.extend(scope_validation_errors)

        if not reasons:
            reasons.append("Policy checks passed")

        return self._record_policy_decision(
            action="install",
            skill_id=skill_id,
            effect=effect,
            risk_level=risk_level,
            reasons=reasons,
            required_permissions=permissions,
            missing_requirements=missing_requirements,
            trace_id=effective_trace_id,
            context={
                "approve_high_risk_permissions": approve_high_risk_permissions,
                "config_keys": sorted(list((config or {}).keys())),
                "scope_keys": sorted(list(normalized_scopes.keys())),
                "compatibility": skill.get("compatibility", ""),
            },
        )

    def preflight_run_policy(
        self,
        skill_id: str,
        context: Optional[Dict[str, Any]] = None,
        install_state: Optional[Dict[str, Any]] = None,
        trace_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Evaluate policy before run and persist one decision record."""
        effective_trace_id = self._normalize_trace_id(trace_id)
        skill = self.get_skill(skill_id)
        if not skill:
            raise ValueError(f"Skill not found: {skill_id}")

        permissions = [str(p) for p in skill.get("permissions", [])]
        risk_level = self._risk_from_permissions(permissions)
        reasons: List[str] = []
        missing_requirements: List[str] = []
        effect = "allow"

        if not skill.get("enabled", True):
            effect = "deny"
            reasons.append("Skill is disabled")

        state = install_state
        if not state:
            for item in self.list_installed_skills(include_disabled=True):
                if item.get("skill_id") == skill_id:
                    state = item
                    break

        if not state:
            effect = "deny"
            reasons.append("Skill is not installed")
        else:
            current_status = str(state.get("status") or "")
            if current_status != "installed":
                effect = "deny"
                reasons.append(f"Skill status does not allow execution: {current_status}")

            granted = set(str(p) for p in state.get("permissions_granted", []))
            required = set(permissions)
            missing_permissions = sorted(list(required - granted))
            if missing_permissions:
                effect = "deny"
                reasons.append("Granted permissions are insufficient for execution")

            normalized_scopes, scope_validation_errors = self._normalize_permission_scopes(
                permission_scopes=state.get("permission_scopes") or {},
                declared_permissions=list(granted),
            )
            if scope_validation_errors:
                effect = "deny"
                reasons.extend(scope_validation_errors)

            raw_permission_rules = state.get("permission_rules")
            permission_rules: List[Dict[str, Any]] = []
            if isinstance(raw_permission_rules, list):
                permission_rules = [
                    dict(item)
                    for item in raw_permission_rules
                    if isinstance(item, dict)
                ]

            if not permission_rules:
                permission_rules = self._build_permission_rules(
                    permissions=sorted(list(granted)),
                    normalized_scopes=normalized_scopes,
                    issued_at=int(state.get("updated_at") or int(time.time())),
                )

            scope_match_errors = self._validate_permission_rules(
                required_permissions=sorted(list(required)),
                permission_rules=permission_rules,
                runtime_context=context or {},
            )
            if scope_match_errors:
                effect = "deny"
                reasons.extend(scope_match_errors)

        if not reasons:
            reasons.append("Policy checks passed")

        runtime_context = context or {}
        return self._record_policy_decision(
            action="run",
            skill_id=skill_id,
            effect=effect,
            risk_level=risk_level,
            reasons=reasons,
            required_permissions=permissions,
            missing_requirements=missing_requirements,
            trace_id=effective_trace_id,
            context={
                "workflow_id": runtime_context.get("workflow_id"),
                "dataset_id": runtime_context.get("dataset_id"),
                "step_id": (runtime_context.get("step") or {}).get("id") if isinstance(runtime_context.get("step"), dict) else None,
            },
        )

    def list_skills(
        self,
        include_disabled: bool = True,
        directory: Optional[str] = None,
        featured_only: bool = False,
    ) -> List[Dict[str, Any]]:
        with self._lock:
            skills = self._skills.get("skills", [])
            if include_disabled:
                result = [dict(s) for s in skills]
            else:
                result = [dict(s) for s in skills if s.get("enabled", True)]

        if directory:
            key = directory.strip().lower()
            result = [
                item
                for item in result
                if str(item.get("directory") or "").strip().lower() == key
            ]

        if featured_only:
            result = [item for item in result if bool(item.get("benchmark", False))]

        return result

    def list_directories(self, include_disabled: bool = True) -> List[Dict[str, Any]]:
        directory_desc = {
            "core": "平台内置技能",
            "featured": "社区标杆与优选技能",
            "data-analysis": "数据分析与处理",
            "document-processing": "文档解析与处理",
            "document-generation": "文档与内容生成",
            "format-conversion": "文档格式转换",
            "general": "通用技能目录",
        }

        stats: Dict[str, Dict[str, Any]] = {}
        skills = self.list_skills(include_disabled=include_disabled)
        for skill in skills:
            directory = str(skill.get("directory") or "general").strip() or "general"
            if directory not in stats:
                stats[directory] = {
                    "directory": directory,
                    "count": 0,
                    "featured_count": 0,
                    "description": directory_desc.get(directory, "技能目录"),
                }
            stats[directory]["count"] += 1
            if bool(skill.get("benchmark", False)):
                stats[directory]["featured_count"] += 1

        return sorted(stats.values(), key=lambda x: x["directory"])

    def get_skill(self, skill_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            for skill in self._skills.get("skills", []):
                if skill.get("id") == skill_id:
                    return dict(skill)
            return None

    def register_skill(self, manifest: Optional[Dict[str, Any]] = None, manifest_url: Optional[str] = None) -> Dict[str, Any]:
        if not manifest and not manifest_url:
            raise ValueError("Either manifest or manifest_url must be provided")

        payload = manifest or {}
        if manifest_url:
            payload = self._fetch_manifest_from_url(manifest_url)

        normalized = self._validate_manifest(payload)

        with self._lock:
            existing_idx = None
            for idx, skill in enumerate(self._skills.get("skills", [])):
                if skill.get("id") == normalized["id"]:
                    existing_idx = idx
                    break

            if existing_idx is None:
                self._skills["skills"].append(normalized)
            else:
                original = self._skills["skills"][existing_idx]
                normalized["created_at"] = int(original.get("created_at", normalized["created_at"]))
                normalized["updated_at"] = int(time.time())
                self._skills["skills"][existing_idx] = normalized

            self._save(SKILL_MARKETPLACE_PATH, self._skills)
            return dict(normalized)

    def delete_skill(self, skill_id: str) -> bool:
        with self._lock:
            before = len(self._skills.get("skills", []))
            self._skills["skills"] = [s for s in self._skills.get("skills", []) if s.get("id") != skill_id]
            deleted = len(self._skills["skills"]) < before
            if deleted:
                self._save(SKILL_MARKETPLACE_PATH, self._skills)
                self._installs["installed"] = [
                    i for i in self._installs.get("installed", []) if i.get("skill_id") != skill_id
                ]
                self._save(SKILL_INSTALLS_PATH, self._installs)
            return deleted

    def install_skill(
        self,
        skill_id: str,
        version: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None,
        permission_scopes: Optional[Dict[str, Any]] = None,
        trace_id: Optional[str] = None,
        approve_high_risk_permissions: bool = False,
    ) -> Dict[str, Any]:
        config = config or {}
        permission_scopes = permission_scopes or {}
        effective_trace_id = self._normalize_trace_id(trace_id)
        skill = self.get_skill(skill_id)
        if not skill:
            raise ValueError(f"Skill not found: {skill_id}")
        if not skill.get("enabled", True):
            raise ValueError(f"Skill is disabled: {skill_id}")

        policy_decision = self.preflight_install_policy(
            skill_id=skill_id,
            config=config,
            permission_scopes=permission_scopes,
            trace_id=effective_trace_id,
            approve_high_risk_permissions=approve_high_risk_permissions,
        )
        policy_effect = str(policy_decision.get("effect") or "deny")
        if policy_effect == "deny":
            reasons = "; ".join(policy_decision.get("reasons", []))
            raise ValueError(f"Install blocked by policy: {reasons}")

        install_version = version or str(skill.get("version", "1.0.0"))
        permissions = [str(p) for p in skill.get("permissions", [])]
        has_high_risk = any(p in HIGH_RISK_PERMISSIONS for p in permissions)
        normalized_scopes, scope_validation_errors = self._normalize_permission_scopes(
            permission_scopes=permission_scopes,
            declared_permissions=permissions,
        )
        if scope_validation_errors:
            raise ValueError("Install blocked by invalid permission_scopes: " + "; ".join(scope_validation_errors))

        status = "installed"
        permissions_granted = permissions
        if policy_effect == "approval_required" or (has_high_risk and not approve_high_risk_permissions):
            status = "pending_approval"
            permissions_granted = [p for p in permissions if p not in HIGH_RISK_PERMISSIONS]

        now = int(time.time())
        permission_rules = self._build_permission_rules(
            permissions=permissions_granted,
            normalized_scopes=normalized_scopes,
            issued_at=now,
        )

        with self._lock:
            existing_idx = None
            for idx, item in enumerate(self._installs.get("installed", [])):
                if item.get("skill_id") == skill_id:
                    existing_idx = idx
                    break

            record = {
                "skill_id": skill_id,
                "version": install_version,
                "status": status,
                "config": config,
                "permissions_granted": permissions_granted,
                "permission_scopes": normalized_scopes,
                "permission_rules": permission_rules,
                "policy_decision_id": policy_decision.get("id"),
                "policy_effect": policy_effect,
                "trace_id": effective_trace_id,
                "installed_at": now,
                "updated_at": now,
            }

            if existing_idx is not None:
                previous = self._installs["installed"][existing_idx]
                record["installed_at"] = int(previous.get("installed_at", now))
                self._installs["installed"][existing_idx] = record
            else:
                self._installs["installed"].append(record)

            self._save(SKILL_INSTALLS_PATH, self._installs)
            return dict(record)

    def quick_load_skill(
        self,
        skill_id: str,
        config: Optional[Dict[str, Any]] = None,
        permission_scopes: Optional[Dict[str, Any]] = None,
        trace_id: Optional[str] = None,
        approve_high_risk_permissions: bool = False,
    ) -> Dict[str, Any]:
        """One-click load skill for UI: install with default config."""
        payload = config or {}
        if not payload:
            skill = self.get_skill(skill_id)
            if not skill:
                raise ValueError(f"Skill not found: {skill_id}")
            schema = skill.get("config_schema") or {}
            default_cfg = schema.get("default_config") if isinstance(schema, dict) else {}
            if isinstance(default_cfg, dict):
                payload = dict(default_cfg)

        return self.install_skill(
            skill_id=skill_id,
            version=None,
            config=payload,
            permission_scopes=permission_scopes,
            trace_id=trace_id,
            approve_high_risk_permissions=approve_high_risk_permissions,
        )

    def approve_pending_install(self, skill_id: str) -> Dict[str, Any]:
        skill = self.get_skill(skill_id)
        if not skill:
            raise ValueError(f"Skill not found: {skill_id}")

        with self._lock:
            for idx, item in enumerate(self._installs.get("installed", [])):
                if item.get("skill_id") != skill_id:
                    continue
                if item.get("status") != "pending_approval":
                    return dict(item)

                updated = dict(item)
                updated["status"] = "installed"
                updated["permissions_granted"] = [str(p) for p in skill.get("permissions", [])]
                updated["updated_at"] = int(time.time())

                normalized_scopes, _ = self._normalize_permission_scopes(
                    permission_scopes=updated.get("permission_scopes") or {},
                    declared_permissions=updated.get("permissions_granted") or [],
                )
                updated["permission_scopes"] = normalized_scopes
                updated["permission_rules"] = self._build_permission_rules(
                    permissions=updated.get("permissions_granted") or [],
                    normalized_scopes=normalized_scopes,
                    issued_at=updated["updated_at"],
                )

                self._installs["installed"][idx] = updated
                self._save(SKILL_INSTALLS_PATH, self._installs)
                return dict(updated)

        raise ValueError(f"Pending install not found for skill: {skill_id}")

    def uninstall_skill(self, skill_id: str) -> bool:
        with self._lock:
            before = len(self._installs.get("installed", []))
            self._installs["installed"] = [
                item for item in self._installs.get("installed", []) if item.get("skill_id") != skill_id
            ]
            removed = len(self._installs["installed"]) < before
            if removed:
                self._save(SKILL_INSTALLS_PATH, self._installs)
            return removed

    def set_install_status(self, skill_id: str, status: str) -> Dict[str, Any]:
        if status not in {"installed", "disabled", "pending_approval"}:
            raise ValueError(f"Unsupported status: {status}")

        skill = self.get_skill(skill_id)

        with self._lock:
            for idx, item in enumerate(self._installs.get("installed", [])):
                if item.get("skill_id") == skill_id:
                    updated = dict(item)
                    updated["status"] = status
                    updated["updated_at"] = int(time.time())

                    if status == "installed":
                        if not updated.get("permissions_granted") and skill:
                            updated["permissions_granted"] = [str(p) for p in skill.get("permissions", [])]

                        normalized_scopes, _ = self._normalize_permission_scopes(
                            permission_scopes=updated.get("permission_scopes") or {},
                            declared_permissions=updated.get("permissions_granted") or [],
                        )
                        updated["permission_scopes"] = normalized_scopes
                        updated["permission_rules"] = self._build_permission_rules(
                            permissions=updated.get("permissions_granted") or [],
                            normalized_scopes=normalized_scopes,
                            issued_at=updated["updated_at"],
                        )

                    self._installs["installed"][idx] = updated
                    self._save(SKILL_INSTALLS_PATH, self._installs)
                    return dict(updated)

        raise ValueError(f"Installed skill not found: {skill_id}")

    def list_installed_skills(self, include_disabled: bool = True) -> List[Dict[str, Any]]:
        with self._lock:
            installed = self._installs.get("installed", [])
            if include_disabled:
                return [dict(i) for i in installed]
            return [dict(i) for i in installed if i.get("status") == "installed"]

    def run_skill(
        self,
        skill_id: str,
        context: Optional[Dict[str, Any]] = None,
        workflow_id: Optional[str] = None,
        step_id: Optional[str] = None,
        trace_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Run one installed skill and persist execution history."""
        skill = self.get_skill(skill_id)
        if not skill:
            raise ValueError(f"Skill not found: {skill_id}")
        if not skill.get("enabled", True):
            raise ValueError(f"Skill is disabled: {skill_id}")

        install_state = None
        for item in self.list_installed_skills(include_disabled=True):
            if item.get("skill_id") == skill_id:
                install_state = item
                break
        if not install_state:
            raise ValueError(f"Skill is not installed: {skill_id}")

        status = str(install_state.get("status") or "")
        if status != "installed":
            raise ValueError(f"Skill is not runnable in current status: {skill_id} ({status})")

        run_context = context or {}
        effective_trace_id = self._normalize_trace_id(
            trace_id or run_context.get("trace_id")
        )
        run_context.setdefault("trace_id", effective_trace_id)
        policy_decision = self.preflight_run_policy(
            skill_id=skill_id,
            context=run_context,
            install_state=install_state,
            trace_id=effective_trace_id,
        )
        if str(policy_decision.get("effect") or "deny") == "deny":
            reasons = "; ".join(policy_decision.get("reasons", []))
            raise ValueError(f"Run blocked by policy: {reasons}")

        now = int(time.time())
        run_record = storage.create_skill_run(
            {
                "skill_id": skill_id,
                "runtime": str(skill.get("runtime") or "python"),
                "status": "running",
                "context": run_context,
                "output": {},
                "error": None,
                "meta": {},
                "workflow_id": workflow_id,
                "step_id": step_id,
                "policy_decision_id": policy_decision.get("id"),
                "trace_id": effective_trace_id,
                "started_at": now,
                "finished_at": None,
            }
        )
        run_id = str(run_record.get("id"))

        try:
            execution = execute_installed_skill(
                skill=skill,
                install_state=install_state,
                context=run_context,
            )
            updated = storage.update_skill_run(
                run_id,
                {
                    "status": "completed",
                    "runtime": execution.get("runtime", str(skill.get("runtime") or "python")),
                    "output": execution.get("output", {}),
                    "meta": {
                        **execution.get("meta", {}),
                        "policy_effect": policy_decision.get("effect"),
                    },
                    "error": None,
                    "finished_at": int(time.time()),
                },
            )
            if not updated:
                raise ValueError(f"Skill run lost after completion: {run_id}")
            return updated
        except Exception as exc:
            failed = storage.update_skill_run(
                run_id,
                {
                    "status": "failed",
                    "error": str(exc),
                    "finished_at": int(time.time()),
                },
            )
            if not failed:
                raise ValueError(f"Skill run failed and record is missing: {run_id}")
            raise ValueError(f"Skill run failed: {skill_id}, run_id={run_id}, error={exc}")

    def list_skill_runs(
        self,
        skill_id: Optional[str] = None,
        status: Optional[str] = None,
        trace_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """List persisted skill runs."""
        return storage.list_skill_runs(skill_id=skill_id, status=status, trace_id=trace_id)

    def get_skill_run(self, run_id: str) -> Optional[Dict[str, Any]]:
        """Get one skill run by id."""
        return storage.get_skill_run(run_id)

    def list_policy_decisions(
        self,
        skill_id: Optional[str] = None,
        action: Optional[str] = None,
        trace_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """List policy decisions for governance auditing."""
        return storage.list_skill_policy_decisions(skill_id=skill_id, action=action, trace_id=trace_id)

    def get_policy_decision(self, decision_id: str) -> Optional[Dict[str, Any]]:
        """Get one policy decision by id."""
        return storage.get_skill_policy_decision(decision_id)

    def get_permission_catalog(self) -> List[Dict[str, Any]]:
        with self._lock:
            skills = self._skills.get("skills", [])

        permission_map: Dict[str, Dict[str, Any]] = {}
        for skill in skills:
            sid = skill.get("id")
            for permission in skill.get("permissions", []):
                key = str(permission)
                if key not in permission_map:
                    permission_map[key] = {
                        "permission": key,
                        "risk_level": "high" if key in HIGH_RISK_PERMISSIONS else "medium",
                        "skills": [],
                    }
                permission_map[key]["skills"].append(sid)

        return sorted(permission_map.values(), key=lambda x: x["permission"])


skill_marketplace_service = SkillMarketplaceService()
