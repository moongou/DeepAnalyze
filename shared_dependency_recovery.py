import re
import subprocess
import sys
from typing import Any, Dict, List

PYTHON_PACKAGE_NAME_MAP = {
    "PIL": "Pillow",
    "bs4": "beautifulsoup4",
    "cv2": "opencv-python",
    "docx": "python-docx",
    "fitz": "pymupdf",
    "sklearn": "scikit-learn",
    "yaml": "pyyaml",
}


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



def install_missing_python_packages(packages: List[str], cwd: str, env: dict, timeout_sec: int = 240) -> Dict[str, Any]:
    if not packages:
        return {"attempted": False, "success": False, "output": "", "packages": []}

    command = [
        sys.executable,
        "-m",
        "pip",
        "install",
        "--disable-pip-version-check",
        *packages,
    ]
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
        return {
            "attempted": True,
            "success": completed.returncode == 0,
            "output": output,
            "packages": packages,
            "returncode": completed.returncode,
        }
    except subprocess.TimeoutExpired:
        return {
            "attempted": True,
            "success": False,
            "output": f"pip install timed out after {timeout_sec} seconds",
            "packages": packages,
            "returncode": None,
        }
    except Exception as exc:
        return {
            "attempted": True,
            "success": False,
            "output": str(exc),
            "packages": packages,
            "returncode": None,
        }



def build_dependency_install_block(missing_packages: List[str], install_result: Dict[str, Any]) -> str:
    install_lines = [
        "[DependencyInstaller] Missing Python packages detected.",
        f"[DependencyInstaller] Requested install: {', '.join(missing_packages)}",
        "[DependencyInstaller] pip install output:",
        install_result.get("output") or "(no pip output)",
    ]
    return "\n" + "\n".join(install_lines) + "\n"
