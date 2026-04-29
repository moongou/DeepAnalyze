import json
import os
import re
import subprocess
import sys
from typing import Any, Dict, List, Optional

PYTHON_PACKAGE_NAME_MAP = {
    "PIL": "Pillow",
    "bs4": "beautifulsoup4",
    "cv2": "opencv-python",
    "docx": "python-docx",
    "fitz": "pymupdf",
    "sklearn": "scikit-learn",
    "yaml": "pyyaml",
}


DEFAULT_PIP_SOURCE_PROFILES: Dict[str, Dict[str, Any]] = {
    "pypi": {
        "index_url": "https://pypi.org/simple",
        "extra_index_urls": [],
        "trusted_hosts": [],
        "find_links": [],
        "no_index": False,
    },
    "tsinghua": {
        "index_url": "https://pypi.tuna.tsinghua.edu.cn/simple",
        "extra_index_urls": [],
        "trusted_hosts": ["pypi.tuna.tsinghua.edu.cn"],
        "find_links": [],
        "no_index": False,
    },
    "aliyun": {
        "index_url": "https://mirrors.aliyun.com/pypi/simple",
        "extra_index_urls": [],
        "trusted_hosts": ["mirrors.aliyun.com"],
        "find_links": [],
        "no_index": False,
    },
    "ustc": {
        "index_url": "https://pypi.mirrors.ustc.edu.cn/simple",
        "extra_index_urls": [],
        "trusted_hosts": ["pypi.mirrors.ustc.edu.cn"],
        "find_links": [],
        "no_index": False,
    },
}


def _split_csv(value: Optional[str]) -> List[str]:
    if not value:
        return []
    return [item.strip() for item in str(value).split(",") if item.strip()]


def _normalize_profile(name: str, profile: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not isinstance(profile, dict):
        return None

    index_url = str(profile.get("index_url") or "").strip()
    extra_index_urls = [str(item).strip() for item in (profile.get("extra_index_urls") or []) if str(item).strip()]
    trusted_hosts = [str(item).strip() for item in (profile.get("trusted_hosts") or []) if str(item).strip()]
    find_links = [str(item).strip() for item in (profile.get("find_links") or []) if str(item).strip()]
    no_index = bool(profile.get("no_index", False))

    if not index_url and not extra_index_urls and not find_links and not no_index:
        return None

    return {
        "name": str(name).strip() or "custom",
        "index_url": index_url,
        "extra_index_urls": extra_index_urls,
        "trusted_hosts": trusted_hosts,
        "find_links": find_links,
        "no_index": no_index,
    }


def _read_json_file(path: str) -> Dict[str, Any]:
    try:
        with open(path, "r", encoding="utf-8") as f:
            payload = json.load(f)
        if isinstance(payload, dict):
            return payload
    except Exception:
        pass
    return {}


def _find_project_root(start_dir: str) -> str:
    current = os.path.abspath(start_dir or os.getcwd())
    for _ in range(10):
        if os.path.exists(os.path.join(current, "requirements.txt")):
            return current
        parent = os.path.dirname(current)
        if parent == current:
            break
        current = parent
    return os.path.abspath(start_dir or os.getcwd())


def _resolve_dynamic_profiles(project_root: str, env: Dict[str, str]) -> Dict[str, Dict[str, Any]]:
    dynamic_profiles: Dict[str, Dict[str, Any]] = {}

    dif_profile = _normalize_profile(
        "dif",
        {
            "index_url": env.get("DIF_PYPI_INDEX_URL", ""),
            "extra_index_urls": _split_csv(env.get("DIF_EXTRA_INDEX_URLS", "")),
            "trusted_hosts": _split_csv(env.get("DIF_TRUSTED_HOSTS", "")),
            "find_links": _split_csv(env.get("DIF_FIND_LINKS", "")),
            "no_index": str(env.get("DIF_NO_INDEX", "")).strip().lower() in {"1", "true", "yes"},
        },
    )
    if dif_profile:
        dynamic_profiles["dif"] = dif_profile

    oyx_profile = _normalize_profile(
        "oyx",
        {
            "index_url": env.get("OYX_PYPI_INDEX_URL", ""),
            "extra_index_urls": _split_csv(env.get("OYX_EXTRA_INDEX_URLS", "")),
            "trusted_hosts": _split_csv(env.get("OYX_TRUSTED_HOSTS", "")),
            "find_links": _split_csv(env.get("OYX_FIND_LINKS", "")),
            "no_index": str(env.get("OYX_NO_INDEX", "")).strip().lower() in {"1", "true", "yes"},
        },
    )
    if oyx_profile:
        dynamic_profiles["oyx"] = oyx_profile

    config_file = str(env.get("DEEPANALYZE_DEPENDENCY_SOURCE_CONFIG_FILE") or "").strip()
    candidates = []
    if config_file:
        candidates.append(config_file)
    candidates.extend(
        [
            os.path.join(project_root, ".dependency_sources.json"),
            os.path.join(project_root, "workspace", "_dependency_sources.json"),
        ]
    )

    selected_payload: Dict[str, Any] = {}
    for candidate in candidates:
        if os.path.exists(candidate):
            selected_payload = _read_json_file(candidate)
            if selected_payload:
                break

    custom_profiles = selected_payload.get("profiles") if isinstance(selected_payload, dict) else {}
    if isinstance(custom_profiles, dict):
        for name, profile in custom_profiles.items():
            normalized = _normalize_profile(str(name), profile)
            if normalized:
                dynamic_profiles[str(name).strip()] = normalized

    inline_profiles_raw = str(env.get("DEEPANALYZE_DEPENDENCY_SOURCE_PROFILES_JSON") or "").strip()
    if inline_profiles_raw:
        try:
            inline_payload = json.loads(inline_profiles_raw)
            if isinstance(inline_payload, dict):
                for name, profile in inline_payload.items():
                    normalized = _normalize_profile(str(name), profile)
                    if normalized:
                        dynamic_profiles[str(name).strip()] = normalized
        except Exception:
            pass

    return dynamic_profiles


def _resolve_source_order(project_root: str, env: Dict[str, str]) -> List[str]:
    order_from_env = _split_csv(env.get("DEEPANALYZE_DEPENDENCY_SOURCES", ""))
    if order_from_env:
        return order_from_env

    candidates = [
        str(env.get("DEEPANALYZE_DEPENDENCY_SOURCE_CONFIG_FILE") or "").strip(),
        os.path.join(project_root, ".dependency_sources.json"),
        os.path.join(project_root, "workspace", "_dependency_sources.json"),
    ]
    for candidate in candidates:
        if candidate and os.path.exists(candidate):
            payload = _read_json_file(candidate)
            active_sources = payload.get("active_sources") if isinstance(payload, dict) else None
            if isinstance(active_sources, list) and active_sources:
                return [str(item).strip() for item in active_sources if str(item).strip()]

    # By default, try enterprise/local aliases first when configured, then common mirrors.
    return ["dif", "oyx", "tsinghua", "aliyun", "ustc", "pypi"]


def resolve_dependency_source_profiles(cwd: str, env: Dict[str, str]) -> List[Dict[str, Any]]:
    project_root = _find_project_root(cwd)
    profiles: Dict[str, Dict[str, Any]] = {
        name: dict(profile)
        for name, profile in DEFAULT_PIP_SOURCE_PROFILES.items()
    }

    dynamic_profiles = _resolve_dynamic_profiles(project_root, env)
    for name, profile in dynamic_profiles.items():
        profiles[name] = profile

    order = _resolve_source_order(project_root, env)
    result: List[Dict[str, Any]] = []
    seen = set()
    for name in order:
        key = str(name).strip()
        if not key or key in seen:
            continue
        seen.add(key)
        profile = profiles.get(key)
        if not profile:
            continue
        normalized = _normalize_profile(key, profile)
        if normalized:
            result.append(normalized)

    if not result:
        # Keep a final no-op profile so command behavior is deterministic.
        result.append(
            {
                "name": "default",
                "index_url": "",
                "extra_index_urls": [],
                "trusted_hosts": [],
                "find_links": [],
                "no_index": False,
            }
        )
    return result


def extract_missing_python_packages(exe_output: str) -> List[str]:
    if not exe_output:
        return []

    matches: List[str] = []
    patterns = [
        r"ModuleNotFoundError:\s*No module named ['\"]([^'\"]+)['\"]",
        r"ImportError:\s*No module named ['\"]([^'\"]+)['\"]",
        r"Missing optional dependency ['\"]([^'\"]+)['\"]",
    ]
    for pattern in patterns:
        matches.extend(re.findall(pattern, exe_output))

    if "to_markdown" in exe_output and "tabulate" in exe_output.lower():
        matches.append("tabulate")

    packages: List[str] = []
    seen = set()
    for raw_name in matches:
        module_name = str(raw_name or "").strip().split(".")[0]
        if not module_name:
            continue
        package_name = PYTHON_PACKAGE_NAME_MAP.get(module_name, module_name)
        if package_name not in seen:
            seen.add(package_name)
            packages.append(package_name)
    return packages



def _build_pip_command_for_source(packages: List[str], source_profile: Dict[str, Any]) -> List[str]:
    command = [
        sys.executable,
        "-m",
        "pip",
        "install",
        "--disable-pip-version-check",
        "--retries",
        "2",
        "--timeout",
        "20",
        "--prefer-binary",
    ]

    if source_profile.get("no_index"):
        command.append("--no-index")

    index_url = str(source_profile.get("index_url") or "").strip()
    if index_url:
        command.extend(["--index-url", index_url])

    for extra in source_profile.get("extra_index_urls") or []:
        command.extend(["--extra-index-url", str(extra)])

    for host in source_profile.get("trusted_hosts") or []:
        command.extend(["--trusted-host", str(host)])

    for link in source_profile.get("find_links") or []:
        command.extend(["--find-links", str(link)])

    command.extend(packages)
    return command


def install_missing_python_packages(packages: List[str], cwd: str, env: dict, timeout_sec: int = 240) -> Dict[str, Any]:
    if not packages:
        return {"attempted": False, "success": False, "output": "", "packages": []}

    source_profiles = resolve_dependency_source_profiles(cwd=cwd, env=env)
    attempt_logs: List[Dict[str, Any]] = []

    for source in source_profiles:
        command = _build_pip_command_for_source(packages, source)
        source_name = str(source.get("name") or "default")
        try:
            completed = subprocess.run(
                command,
                cwd=cwd,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=timeout_sec,
                env=env,
                check=False,
            )
            output = ((completed.stdout or "") + (completed.stderr or "")).strip()
            attempt_logs.append(
                {
                    "source": source_name,
                    "success": completed.returncode == 0,
                    "returncode": completed.returncode,
                    "output": output,
                }
            )
            if completed.returncode == 0:
                return {
                    "attempted": True,
                    "success": True,
                    "output": output,
                    "packages": packages,
                    "returncode": completed.returncode,
                    "source_used": source_name,
                    "attempts": attempt_logs,
                }
        except subprocess.TimeoutExpired:
            attempt_logs.append(
                {
                    "source": source_name,
                    "success": False,
                    "returncode": None,
                    "output": f"pip install timed out after {timeout_sec} seconds",
                }
            )
        except Exception as exc:
            attempt_logs.append(
                {
                    "source": source_name,
                    "success": False,
                    "returncode": None,
                    "output": str(exc),
                }
            )

    combined_output_lines: List[str] = []
    for attempt in attempt_logs:
        combined_output_lines.append(
            f"[source={attempt.get('source')}] returncode={attempt.get('returncode')}"
        )
        combined_output_lines.append(attempt.get("output") or "(no pip output)")

    return {
        "attempted": True,
        "success": False,
        "output": "\n".join(combined_output_lines),
        "packages": packages,
        "returncode": None,
        "attempts": attempt_logs,
    }



def build_dependency_install_block(missing_packages: List[str], install_result: Dict[str, Any]) -> str:
    attempts = install_result.get("attempts") or []
    attempt_summary = ", ".join(
        [
            f"{item.get('source')}={'ok' if item.get('success') else 'fail'}"
            for item in attempts
            if isinstance(item, dict)
        ]
    )

    install_lines = [
        "[DependencyInstaller] Missing Python packages detected.",
        f"[DependencyInstaller] Requested install: {', '.join(missing_packages)}",
        f"[DependencyInstaller] Source used: {install_result.get('source_used') or 'none'}",
        f"[DependencyInstaller] Source attempts: {attempt_summary or 'n/a'}",
        "[DependencyInstaller] pip install output:",
        install_result.get("output") or "(no pip output)",
    ]
    return "\n" + "\n".join(install_lines) + "\n"
