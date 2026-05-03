"""
Utility functions for DeepAnalyze API Server
Contains helper functions for file operations, workspace management, and more
"""

import hashlib
import importlib
import os
import json
import re
import shutil
import sys
import traceback
import subprocess
import tempfile
import http.server
import socketserver
import asyncio
from pathlib import Path
from urllib.parse import quote
from datetime import datetime
from typing import List, Optional, Dict, Any, Tuple
from functools import partial

from config import (
    WORKSPACE_BASE_DIR,
    HTTP_SERVER_PORT,
    ANALYST_SYSTEM_PROMPT,
    ANALYST_METHODOLOGY_ENFORCEMENT_PROMPT,
)
from shared_dependency_recovery import (
    build_dependency_install_block,
    extract_missing_python_packages,
    install_missing_python_packages,
)

add_error_solution = None
search_errors = None
add_env_todo = None
_YUTU_HELPERS_LOADED = False


def _ensure_yutu_helpers() -> None:
    """Lazily load yutu helpers to avoid startup side effects."""
    global add_error_solution, search_errors, add_env_todo, _YUTU_HELPERS_LOADED
    if _YUTU_HELPERS_LOADED:
        return
    _YUTU_HELPERS_LOADED = True
    try:
        module = importlib.import_module("demo.chat.yutu_zhanyilu")
        add_error_solution = getattr(module, "add_error_solution", None)
        search_errors = getattr(module, "search_errors", None)
        add_env_todo = getattr(module, "add_env_todo", None)
    except Exception:
        add_error_solution = None
        search_errors = None
        add_env_todo = None


SESSION_YUTU_FAILURES: Dict[str, Dict[str, Any]] = {}
KNOWN_ANALYSIS_PITFALL_HINTS = [
    "- pandas DataFrame.pivot 必须使用关键字参数：pivot(index=..., columns=..., values=...)；不要写成位置参数。",
    "- seaborn heatmap 在 annot=True 时，fmt='d' 只能用于整数计数矩阵；如果数据是 float、比例、均值或聚合结果，请改用 fmt='.2f' 或其他浮点格式。",
    "- pandas DataFrame.to_markdown() 依赖 tabulate；如果需要 markdown 表格输出，先确认环境里可导入 tabulate。",
]


def _hash_text(content: str) -> str:
    return hashlib.sha256((content or "").encode("utf-8", errors="replace")).hexdigest()


def _build_python_syntax_error_output(code_str: str, exc: SyntaxError) -> str:
    line_no = getattr(exc, "lineno", None)
    offset = getattr(exc, "offset", None)
    text = getattr(exc, "text", "") or ""
    msg = getattr(exc, "msg", str(exc)) or "SyntaxError"
    lowered = msg.lower()

    if "unterminated triple-quoted" in lowered:
        issue = "检测到未闭合的三引号字符串"
    elif "f-string" in lowered and "unterminated" in lowered:
        issue = "检测到未闭合的 f-string"
    elif "unterminated string literal" in lowered:
        issue = "检测到未闭合的字符串字面量"
    elif "invalid syntax" in lowered and ('\"\"\"' in code_str or "'''" in code_str):
        issue = "检测到可能由三引号或引号嵌套导致的语法错误"
    else:
        issue = "检测到 Python 语法错误"

    pointer = ""
    if offset and text:
        pointer = " " * max(offset - 1, 0) + "^"

    detail_lines = [
        "[SyntaxError]: generated Python failed validation before execution.",
        issue,
        f"Message: {msg}",
    ]
    if line_no is not None:
        detail_lines.append(f"Line: {line_no}")
    if offset is not None:
        detail_lines.append(f"Column: {offset}")
    if text:
        detail_lines.append("Code:")
        detail_lines.append(text.rstrip("\n"))
    if pointer:
        detail_lines.append(pointer)
    detail_lines.append("Execution did not start. Fix the Python code before retrying.")
    return "\n".join(detail_lines)


def preflight_python_code(code_str: str) -> Optional[str]:
    try:
        compile(code_str, "<generated-python>", "exec")
        return None
    except SyntaxError as exc:
        return _build_python_syntax_error_output(code_str, exc)


def prepare_python_execution(code_str: str) -> Tuple[str, Optional[str]]:
    validation_error = preflight_python_code(code_str)
    if validation_error:
        return code_str, validation_error
    return code_str, None


def prepare_r_execution_environment(child_env: Dict[str, str], workspace_dir: str) -> Dict[str, Any]:
    runtime = {
        "r_home": None,
        "rscript_available": False,
        "rpy2_available": False,
        "mode": "python_only",
        "notes": [],
    }

    try:
        r_home = subprocess.check_output(["R", "RHOME"], text=True).strip()
        if r_home and os.path.exists(r_home):
            runtime["r_home"] = r_home
            child_env.setdefault("R_HOME", r_home)
            r_lib = os.path.join(r_home, "lib")
            brew_lib = "/opt/homebrew/lib"
            lib_paths = [r_lib]
            if os.path.exists(brew_lib):
                lib_paths.append(brew_lib)

            fake_lib_dir = os.path.abspath(os.path.join(workspace_dir, ".lib"))
            os.makedirs(fake_lib_dir, exist_ok=True)
            fake_blas = os.path.join(fake_lib_dir, "libRblas.dylib")
            target_r_lib = os.path.join(r_lib, "libR.dylib")
            if not os.path.exists(fake_blas) and os.path.exists(target_r_lib):
                try:
                    os.symlink(target_r_lib, fake_blas)
                except Exception:
                    pass
            if os.path.exists(fake_lib_dir):
                lib_paths.insert(0, fake_lib_dir)

            path_str = ":".join([p for p in lib_paths if p])
            if path_str:
                if child_env.get("DYLD_LIBRARY_PATH"):
                    child_env["DYLD_LIBRARY_PATH"] = f"{path_str}:{child_env['DYLD_LIBRARY_PATH']}"
                else:
                    child_env["DYLD_LIBRARY_PATH"] = path_str
                child_env["LD_LIBRARY_PATH"] = child_env["DYLD_LIBRARY_PATH"]
                child_env["DYLD_FALLBACK_LIBRARY_PATH"] = child_env["DYLD_LIBRARY_PATH"]
    except Exception as exc:
        runtime["notes"].append(f"R_HOME unavailable: {exc}")
        fallback_home = "/opt/homebrew/opt/r/lib/R"
        if os.path.exists(fallback_home):
            runtime["r_home"] = fallback_home
            child_env.setdefault("R_HOME", fallback_home)
            r_lib = os.path.join(fallback_home, "lib")
            child_env["DYLD_LIBRARY_PATH"] = f"{r_lib}:/opt/homebrew/lib"
            child_env["LD_LIBRARY_PATH"] = child_env["DYLD_LIBRARY_PATH"]
            child_env["DYLD_FALLBACK_LIBRARY_PATH"] = child_env["DYLD_LIBRARY_PATH"]

    try:
        subprocess.run(
            ["Rscript", "--version"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
            env=child_env,
        )
        runtime["rscript_available"] = True
    except Exception as exc:
        runtime["notes"].append(f"Rscript unavailable: {exc}")

    try:
        probe = subprocess.run(
            [sys.executable, "-c", "import rpy2.robjects"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
            env=child_env,
        )
        runtime["rpy2_available"] = probe.returncode == 0
        if probe.returncode != 0 and probe.stderr:
            runtime["notes"].append(f"rpy2 unavailable: {probe.stderr.strip()}")
    except Exception as exc:
        runtime["notes"].append(f"rpy2 probe failed: {exc}")

    if runtime["rpy2_available"]:
        runtime["mode"] = "python_rpy2"
    elif runtime["rscript_available"]:
        runtime["mode"] = "python_rscript"

    return runtime


def build_analysis_artifact_feedback(workspace_dir: str) -> str:
    workspace_path = Path(workspace_dir)
    manifest_path = workspace_path / ".analysis_manifest.json"
    generated_dir = workspace_path / "generated"
    summary_lines: List[str] = []

    manifest = None
    if manifest_path.exists():
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except Exception:
            manifest = None
    if isinstance(manifest, dict):
        summary_lines.append("[Analysis Manifest]")
        plan = manifest.get("plan") or []
        if isinstance(plan, list) and plan:
            summary_lines.append("Planned subtasks: " + ", ".join(str(item) for item in plan[:8]))
        completed = manifest.get("completed") or []
        if isinstance(completed, list) and completed:
            summary_lines.append("Completed subtasks: " + ", ".join(str(item) for item in completed[:8]))
        artifacts = manifest.get("artifacts") or {}
        if isinstance(artifacts, dict) and artifacts:
            artifact_pairs = [f"{key}: {value}" for key, value in list(artifacts.items())[:8]]
            summary_lines.append("Recorded artifacts: " + "; ".join(artifact_pairs))

    if generated_dir.exists():
        generated_files = sorted(
            [p.name for p in generated_dir.iterdir() if p.is_file()],
            key=str.lower,
        )
        if generated_files:
            summary_lines.append("[Generated Files]")
            summary_lines.extend(f"- {name}" for name in generated_files[:12])

    if not summary_lines:
        return ""
    return "\n" + "\n".join(summary_lines)


def normalize_analysis_error(error_type: str, error_message: str) -> Tuple[str, str, Optional[str], Optional[str]]:
    normalized_type = error_type or "Unknown"
    normalized_message = (error_message or "").strip()
    solution = None
    solution_code = None
    lowered = normalized_message.lower()

    if "dataframe.pivot() takes 1 positional argument but 4 were given" in lowered:
        normalized_type = "PandasPivotUsageError"
        normalized_message = "DataFrame.pivot() must use keyword arguments: pivot(index=..., columns=..., values=...)."
        solution = (
            "调用 pandas DataFrame.pivot 时不要使用位置参数。"
            "请改为显式关键字参数写法：pivot(index=..., columns=..., values=...)。"
        )
        solution_code = "heatmap_data = dist_df.pivot(index='区域', columns='hour', values='车辆数')"
    elif "unknown format code 'd' for object of type 'float'" in lowered:
        normalized_type = "SeabornHeatmapFormatError"
        normalized_message = "sns.heatmap with annot=True cannot use fmt='d' on float-valued data."
        solution = (
            "当热力图数据是 float、比例、均值或其他非整数聚合结果时，不要使用 fmt='d'。"
            "仅在整数计数矩阵上使用 fmt='d'；否则改用 fmt='.2f' 等浮点格式，或先确认数据确实应转换为整数。"
        )
        solution_code = "sns.heatmap(heatmap_data, annot=True, fmt='.2f', cmap='YlOrRd')"

    return normalized_type, normalized_message, solution, solution_code


def detect_execution_error(exe_output: str) -> dict:
    """
    检测代码执行输出中的错误，但不直接写入雨途斩棘录。
    """
    result = {
        "has_error": False,
        "error_type": "Unknown",
        "error_message": "",
        "similar_found": False,
        "solution": None,
        "solution_code": None,
        "record_category": "runtime_code_generation",
    }

    if not exe_output or not exe_output.strip():
        return result

    error_patterns = [
        (r"ModuleNotFoundError|ImportError:\s*(.+?)(?:\n|$)", "ImportError"),
        (r"ValueError:\s*(.+?)(?:\n|$)", "ValueError"),
        (r"TypeError:\s*(.+?)(?:\n|$)", "TypeError"),
        (r"RuntimeError:\s*(.+?)(?:\n|$)", "RuntimeError"),
        (r"KeyError:\s*['\"](.+?)['\"]", "KeyError"),
        (r"FileNotFoundError:\s*(.+?)(?:\n|$)", "FileNotFoundError"),
        (r"TimeoutError:\s*(.+?)(?:\n|$)", "TimeoutError"),
        (r"SyntaxError:\s*(.+?)(?:\n|$)", "SyntaxError"),
        (r"AttributeError:\s*(.+?)(?:\n|$)", "AttributeError"),
        (r"IndexError:\s*(.+?)(?:\n|$)", "IndexError"),
        (r"MemoryError:\s*(.+?)(?:\n|$)", "MemoryError"),
        (r"ZeroDivisionError:\s*(.+?)(?:\n|$)", "ZeroDivisionError"),
        (r"(?:Error|Exception|Error:)\s*(.+?)(?:\n|$)", "RuntimeError"),
        (r"Traceback \(most recent call last\):(.+?)(?:\n\n|\Z)", "PythonError"),
    ]

    error_type = "Unknown"
    error_message = ""
    for pattern, err_type in error_patterns:
        match = re.search(pattern, exe_output, re.IGNORECASE | re.DOTALL)
        if match:
            error_type = err_type
            error_msg = match.group(1) if match.lastindex else match.group(0)
            error_message = (error_msg.strip()[:500] if error_msg else exe_output[:500])
            break

    has_error = (
        error_type != "Unknown"
        or ("Error" in exe_output and "Success" not in exe_output)
        or ("error" in exe_output.lower() and "0 error" not in exe_output.lower())
    ) and not (
        exe_output.strip().endswith("OK")
        or "Successfully" in exe_output
        or "successfully" in exe_output
    )

    if "Error" in exe_output and "[Error]:" in exe_output:
        has_error = True
    elif error_type == "Unknown" and "error" in exe_output.lower():
        error_type = "RuntimeError"
        error_message = exe_output[:500]

    if not has_error:
        return result

    error_type, error_message, solution, solution_code = normalize_analysis_error(error_type, error_message)

    result["has_error"] = True
    result["error_type"] = error_type
    result["error_message"] = error_message
    result["solution"] = solution
    result["solution_code"] = solution_code
    if error_type in {"ImportError", "FontNotFoundError", "UnicodeError", "FileNotFoundError"} or "tabulate" in error_message.lower():
        result["record_category"] = "base_environment_fixable"

    _ensure_yutu_helpers()
    if search_errors is None:
        return result

    try:
        keywords = [error_type]
        if normalized_keywords := re.findall(r"[A-Za-z_]+", error_message):
            keywords.extend(normalized_keywords[:4])
        similar_errors = search_errors(keywords=keywords, page_size=3)
        if similar_errors and similar_errors.get("items"):
            result["similar_found"] = True
    except Exception:
        pass

    return result


def remember_failed_execution(session_id: str, error_info: dict, code_str: str, workspace_dir: str, exe_output: str) -> None:
    if not session_id or not error_info.get("has_error"):
        return
    SESSION_YUTU_FAILURES[session_id] = {
        "error_type": error_info.get("error_type") or "Unknown",
        "error_message": error_info.get("error_message") or "",
        "error_context": f"工作区: {workspace_dir}\n代码长度: {len(code_str)} 字符",
        "code_str": code_str,
        "code_hash": _hash_text(code_str),
        "exe_output": (exe_output or "")[:4000],
        "solution": error_info.get("solution"),
        "solution_code": error_info.get("solution_code"),
        "record_category": error_info.get("record_category") or "runtime_code_generation",
    }


def record_verified_yutu_solution(session_id: str, code_str: str, workspace_dir: str, exe_output: str) -> dict:
    _ensure_yutu_helpers()
    pending = SESSION_YUTU_FAILURES.get(session_id)
    if not pending:
        return {"recorded": False}
    if add_error_solution is None:
        return {"recorded": False}

    error_type = pending.get("error_type") or "Unknown"
    error_message = pending.get("error_message") or ""
    error_context = pending.get("error_context") or f"工作区: {workspace_dir}"
    record_category = pending.get("record_category") or "runtime_code_generation"
    success_summary = (exe_output or "").strip()
    success_summary = success_summary[:1500] if success_summary else "执行成功，未返回额外输出。"
    if record_category == "base_environment_fixable":
        if add_env_todo is None:
            return {"recorded": False}
        recorded = add_env_todo(
            title=f"补齐基础环境能力：{error_type}",
            description=(
                f"检测到可通过基础环境完善解决的问题。\n错误消息：{error_message}\n"
                f"建议系统管理员确认是否应将相关依赖/字体/工具预装到基础环境中。"
            ),
            source_error_hash=None,
            related_error_type=error_type,
            priority="medium",
            created_by="system_verified",
        )
        if recorded:
            SESSION_YUTU_FAILURES.pop(session_id, None)
        return {
            "recorded": recorded,
            "error_type": error_type,
            "error_message": error_message,
            "record_category": record_category,
        }
    solution = pending.get("solution") or (
        "同一会话中再次执行后已真实跑通。后续成功代码已验证可以解决该问题。"
        f"\n\n成功输出摘要：\n{success_summary}"
    )
    resolution_evidence = (
        f"失败代码哈希: {pending.get('code_hash', '')}\n"
        f"成功代码哈希: {_hash_text(code_str)}\n\n"
        f"最近一次失败输出：\n{pending.get('exe_output', '')[:1500]}\n\n"
        f"成功输出：\n{success_summary}"
    )

    recorded = add_error_solution(
        error_type=error_type,
        error_message=error_message,
        error_context=error_context,
        solution=solution,
        solution_code=code_str,
        confidence=0.9,
        created_by="system_verified",
        verification_status="verified",
        verified_count=1,
        failure_count=1,
        resolution_evidence=resolution_evidence,
        record_category=record_category,
    )
    if recorded:
        SESSION_YUTU_FAILURES.pop(session_id, None)
    return {
        "recorded": recorded,
        "error_type": error_type,
        "error_message": error_message,
    }


def build_execution_guidance(error_info: Dict[str, Any]) -> str:
    if not error_info.get("has_error"):
        return ""
    solution = (error_info.get("solution") or "").strip()
    solution_code = (error_info.get("solution_code") or "").strip()
    if not solution and not solution_code:
        return ""

    lines = ["[Known fix guidance]"]
    if solution:
        lines.append(solution)
    if solution_code:
        lines.append(f"参考写法: {solution_code}")
    return "\n" + "\n".join(lines)


def build_yutu_pitfall_context(limit: int = 5) -> str:
    _ensure_yutu_helpers()
    if search_errors is None:
        return ""
    try:
        results = search_errors(keywords=["pivot", "heatmap", "seaborn", "pandas", "format", "float"], page_size=limit)
    except Exception:
        return ""

    items = (results or {}).get("items") or []
    if not items:
        return ""

    lines = ["# Historical pitfalls to avoid"]
    for item in items[:limit]:
        error_type = str(item.get("error_type") or "").strip()
        error_message = str(item.get("error_message") or "").strip()
        solution = str(item.get("solution") or "").strip()
        if error_type:
            lines.append(f"- {error_type}: {error_message}")
        elif error_message:
            lines.append(f"- {error_message}")
        if solution:
            lines.append(f"  Fix: {solution[:220]}")
    return "\n" + "\n".join(lines)


def inject_analysis_runtime_hints(message_content: str, workspace_dir: str) -> str:
    base = str(message_content or "").rstrip()
    hints = [
        "# Analysis Workflow",
        "- 先把大任务拆成较小子任务，再逐个完成。",
        "- 每个子任务成功后，都应把可复用结果保存为命名明确的文件。",
        "- 继续分析前，先检查已有中间文件和 generated/ 目录，优先复用，避免重复生成相同图表和整段报告。",
        "- 最后一轮只做汇总组装，使用前面已经生成的结果，不要从头重跑全部分析。",
        "- 当前执行宿主是 Python；如果用户指定 R，请通过 rpy2 或 Rscript 从 Python 调用 R，不要输出无法直接在 Python 中运行的裸 R 脚本。",
        *KNOWN_ANALYSIS_PITFALL_HINTS,
    ]
    artifact_feedback = build_analysis_artifact_feedback(workspace_dir)
    if artifact_feedback:
        hints.append(artifact_feedback.strip())

    yutu_context = build_yutu_pitfall_context()
    if yutu_context:
        hints.append(yutu_context.strip())

    hint_block = "\n".join(hints)
    if hint_block in base:
        return base
    if not base:
        return hint_block
    return f"{base}\n\n{hint_block}"


def build_download_url(thread_id: str, rel_path: str) -> str:
    """Build download URL for a file"""
    try:
        encoded = quote(f"{thread_id}/{rel_path}", safe="/")
    except Exception:
        encoded = f"{thread_id}/{rel_path}"
    return f"http://localhost:{HTTP_SERVER_PORT}/{encoded}"


def get_thread_workspace(thread_id: str) -> str:
    """Get workspace directory path for one thread."""
    safe_thread_id = re.sub(r"[^a-zA-Z0-9._-]", "_", str(thread_id or "thread"))
    return os.path.join(WORKSPACE_BASE_DIR, safe_thread_id)


def uniquify_path(target: Path) -> Path:
    """Return a unique path if target already exists"""
    target = Path(target)
    if not target.exists():
        return target

    stem = target.stem
    suffix = target.suffix
    parent = target.parent
    index = 1

    while True:
        candidate = parent / f"{stem}_{index}{suffix}"
        if not candidate.exists():
            return candidate
        index += 1


def _normalize_openai_message_content(raw_content: Any) -> str:
    """Normalize OpenAI-style message content into a plain string."""
    if isinstance(raw_content, list):
        parts: List[str] = []
        for item in raw_content:
            if (
                isinstance(item, dict)
                and item.get("type") == "text"
                and "text" in item
            ):
                parts.append(item.get("text", {}).get("value", ""))
        return "".join(parts)
    return str(raw_content or "")


def extract_text_from_content(content: List[Dict[str, Any]]) -> str:
    """Extract plain text from message content items."""
    text_parts: List[str] = []
    for item in content or []:
        if isinstance(item, dict) and item.get("type") == "text":
            text_parts.append(item.get("text", {}).get("value", ""))
    return "".join(text_parts)


def collect_file_info(directory: str) -> str:
    """Collect file information from directory"""
    all_file_info_str = ""
    dir_path = Path(directory)
    if not dir_path.exists():
        return ""

    files = sorted([f for f in dir_path.iterdir() if f.is_file()])
    for idx, file_path in enumerate(files, start=1):
        size_bytes = os.path.getsize(file_path)
        size_kb = size_bytes / 1024
        size_str = f"{size_kb:.1f}KB"
        file_info = {"name": file_path.name, "size": size_str}
        file_info_str = json.dumps(file_info, indent=4, ensure_ascii=False)
        all_file_info_str += f"File {idx}:\n{file_info_str}\n\n"
    return all_file_info_str




def prepare_vllm_messages(
    messages: List[Dict[str, Any]],
    workspace_dir: str,
) -> List[Dict[str, str]]:
    """
    Convert incoming messages to vLLM format and inject DeepAnalyze template:
    - Prepend analyst methodology as system prompt if no system message is present
    - Always wrap user message with "# Instruction" heading
    - Optionally append workspace file info under "# Data"
    """
    vllm_messages: List[Dict[str, str]] = []
    for msg in messages:
        role = msg.get("role") if isinstance(msg, dict) else None
        raw_content = msg.get("content") if isinstance(msg, dict) else None
        content = _normalize_openai_message_content(raw_content)
        if role:
            vllm_messages.append({"role": role, "content": content})

    # Inject analyst methodology as system prompt if none is present
    has_system = any(m.get("role") == "system" for m in vllm_messages)
    if not has_system:
        combined_prompt = (
            f"{ANALYST_SYSTEM_PROMPT}\n\n{ANALYST_METHODOLOGY_ENFORCEMENT_PROMPT}"
        )
        vllm_messages.insert(0, {"role": "system", "content": combined_prompt})
    else:
        has_methodology_guard = any(
            m.get("role") == "system"
            and "方法论执行强化规则" in str(m.get("content", ""))
            for m in vllm_messages
        )
        if not has_methodology_guard:
            insert_at = 1 if vllm_messages and vllm_messages[0].get("role") == "system" else 0
            vllm_messages.insert(
                insert_at,
                {
                    "role": "system",
                    "content": ANALYST_METHODOLOGY_ENFORCEMENT_PROMPT,
                },
            )

    # Locate last user message
    last_user_idx: Optional[int] = None
    for idx in range(len(vllm_messages) - 1, -1, -1):
        if vllm_messages[idx].get("role") == "user":
            last_user_idx = idx
            break

    workspace_file_info = collect_file_info(workspace_dir)

    if last_user_idx is not None:
        user_content = str(vllm_messages[last_user_idx].get("content", "")).strip()
        instruction_body = user_content if user_content else "# Instruction"
        if workspace_file_info:
            vllm_messages[last_user_idx]["content"] = (
                f"# Instruction\n{instruction_body}\n\n# Data\n{workspace_file_info}"
            )
        else:
            vllm_messages[last_user_idx]["content"] = f"# Instruction\n{instruction_body}"
        vllm_messages[last_user_idx]["content"] = inject_analysis_runtime_hints(
            vllm_messages[last_user_idx]["content"], workspace_dir
        )

    return vllm_messages


def _decorate_runtime_output(raw_output: str, runtime: Dict[str, Any]) -> str:
    output = raw_output
    if runtime.get("mode") != "python_only" or runtime.get("notes"):
        runtime_lines = [
            f"[Runtime] Python-hosted R mode: {runtime.get('mode', 'python_only')}"
        ]
        if runtime.get("r_home"):
            runtime_lines.append(f"[Runtime] R_HOME={runtime['r_home']}")
        for note in runtime.get("notes", [])[:3]:
            runtime_lines.append(f"[Runtime] {note}")
        output = "\n".join(runtime_lines) + "\n" + output
    return output


def _run_python_script_once(tmp_path: str, exec_cwd: str, child_env: Dict[str, str], timeout_sec: int, runtime: Dict[str, Any]) -> str:
    completed = subprocess.run(
        [sys.executable, tmp_path],
        cwd=exec_cwd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout_sec,
        env=child_env,
    )
    output = (completed.stdout or "") + (completed.stderr or "")
    return _decorate_runtime_output(output, runtime)


def _build_dependency_install_block(missing_packages: List[str], install_result: Dict[str, Any]) -> str:
    install_lines = [
        "[DependencyInstaller] Missing Python packages detected.",
        f"[DependencyInstaller] Requested install: {', '.join(missing_packages)}",
        "[DependencyInstaller] pip install output:",
        install_result.get("output") or "(no pip output)",
    ]
    return "\n" + "\n".join(install_lines) + "\n"


def execute_code_safe(
    code_str: str, workspace_dir: str, timeout_sec: int = 120, allow_network_installs: bool = True
) -> str:
    """Execute Python code in a separate process with timeout"""
    exec_cwd = os.path.abspath(workspace_dir)
    os.makedirs(exec_cwd, exist_ok=True)
    tmp_path = None
    try:
        prepared_code, validation_error = prepare_python_execution(code_str)
        if validation_error:
            return validation_error

        fd, tmp_path = tempfile.mkstemp(suffix=".py", dir=exec_cwd)
        os.close(fd)
        with open(tmp_path, "w", encoding="utf-8") as f:
            f.write(prepared_code)

        child_env = os.environ.copy()
        child_env.setdefault("MPLBACKEND", "Agg")
        child_env.setdefault("QT_QPA_PLATFORM", "offscreen")
        child_env.pop("DISPLAY", None)

        runtime = prepare_r_execution_environment(child_env, exec_cwd)

        output = _run_python_script_once(tmp_path, exec_cwd, child_env, timeout_sec, runtime)
        if not allow_network_installs:
            return output

        missing_packages = extract_missing_python_packages(output)
        if not missing_packages:
            return output

        install_result = install_missing_python_packages(missing_packages, exec_cwd, child_env)
        install_block = build_dependency_install_block(missing_packages, install_result)
        if not install_result.get("success"):
            return output + install_block

        retry_output = _run_python_script_once(tmp_path, exec_cwd, child_env, timeout_sec, runtime)
        retry_block = "\n[DependencyInstaller] Re-ran the script after installing dependencies.\n"
        return output + install_block + retry_block + retry_output
    except subprocess.TimeoutExpired:
        return f"[Timeout]: execution exceeded {timeout_sec} seconds"
    except Exception as e:
        return f"[Error]: {str(e)}"
    finally:
        try:
            if tmp_path and os.path.exists(tmp_path):
                os.remove(tmp_path)
        except Exception:
            pass


async def execute_code_safe_async(
    code_str: str, workspace_dir: str, timeout_sec: int = 120, allow_network_installs: bool = True
) -> str:
    """Execute Python code in a separate process with timeout (async version)"""
    exec_cwd = os.path.abspath(workspace_dir)
    os.makedirs(exec_cwd, exist_ok=True)
    tmp_path = None
    try:
        prepared_code, validation_error = prepare_python_execution(code_str)
        if validation_error:
            return validation_error

        fd, tmp_path = tempfile.mkstemp(suffix=".py", dir=exec_cwd)
        os.close(fd)
        with open(tmp_path, "w", encoding="utf-8") as f:
            f.write(prepared_code)

        child_env = os.environ.copy()
        child_env.setdefault("MPLBACKEND", "Agg")
        child_env.setdefault("QT_QPA_PLATFORM", "offscreen")
        child_env.pop("DISPLAY", None)

        runtime = prepare_r_execution_environment(child_env, exec_cwd)

        async def _run_script_once() -> str:
            process = await asyncio.create_subprocess_exec(
                sys.executable, tmp_path,
                cwd=exec_cwd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=child_env,
            )
            try:
                stdout, stderr = await asyncio.wait_for(
                    process.communicate(),
                    timeout=timeout_sec
                )
                output = (stdout.decode() if stdout else "") + (stderr.decode() if stderr else "")
                return _decorate_runtime_output(output, runtime)
            except asyncio.TimeoutError:
                try:
                    process.kill()
                    await process.wait()
                except Exception:
                    pass
                return f"[Timeout]: execution exceeded {timeout_sec} seconds"

        output = await _run_script_once()
        if not allow_network_installs:
            return output

        missing_packages = extract_missing_python_packages(output)
        if not missing_packages:
            return output

        install_result = install_missing_python_packages(missing_packages, exec_cwd, child_env)
        install_block = build_dependency_install_block(missing_packages, install_result)
        if not install_result.get("success"):
            return output + install_block

        retry_output = await _run_script_once()
        retry_block = "\n[DependencyInstaller] Re-ran the script after installing dependencies.\n"
        return output + install_block + retry_block + retry_output
    except Exception as e:
        return f"[Error]: {str(e)}"
    finally:
        try:
            if tmp_path and os.path.exists(tmp_path):
                os.remove(tmp_path)
        except Exception:
            pass


def extract_code_from_segment(segment: str) -> Optional[str]:
    """Extract python code between <Code>...</Code>, optionally fenced by ```python ... ```"""
    code_match = re.search(r"<Code>(.*?)</Code>", segment, re.DOTALL)
    if not code_match:
        return None
    code_content = code_match.group(1).strip()
    md_match = re.search(r"```(?:python)?(.*?)```", code_content, re.DOTALL)
    return (md_match.group(1).strip() if md_match else code_content)


def fix_tags_and_codeblock(s: str) -> str:
    """Fix unclosed tags and code blocks"""
    pattern = re.compile(
        r"<(Analyze|Understand|Code|Execute|Answer)>(.*?)(?:</\1>|(?=$))", re.DOTALL
    )
    matches = list(pattern.finditer(s))
    if not matches:
        return s

    last_match = matches[-1]
    tag_name = last_match.group(1)
    matched_text = last_match.group(0)

    if not matched_text.endswith(f"</{tag_name}>"):
        if tag_name == "Code":
            if "```" in s and s.count("```") % 2 != 0:
                s += "\n```"
        s += f"\n</{tag_name}>"

    return s


def extract_sections_from_history(messages: List[Dict[str, str]]) -> str:
    """Build report body and appendix from tagged assistant messages."""
    if not isinstance(messages, list):
        return ""

    parts: List[str] = []
    appendix: List[str] = []
    tag_pattern = re.compile(r"<(Analyze|Understand|Code|Execute|File|Answer)>([\s\S]*?)</\1>")

    # 收集所有用户和助手消息对，用于构建完整的对话历史
    conversation_pairs: List[Dict[str, Any]] = []
    user_message = None

    # 第一轮遍历：收集用户-助手消息对
    for msg in messages:
        if not isinstance(msg, dict):
            continue
        role = (msg.get("role") or "").lower()
        content = str(msg.get("content", ""))

        if role == "user":
            user_message = content
        elif role == "assistant" and user_message is not None:
            conversation_pairs.append({
                "user": user_message,
                "assistant": content
            })
            user_message = None

    # 第二轮遍历：处理助手响应的标签内容
    # 找到最后一轮对话的Answer内容作为报告主体
    last_answer_content = ""
    for msg in messages:
        if not isinstance(msg, dict):
            continue
        if (msg.get("role") or "").lower() != "assistant":
            continue
        content = str(msg.get("content", ""))

        # 提取所有Answer标签内容，保留最后一次的
        answer_matches = tag_pattern.finditer(content)
        for match in answer_matches:
            tag, segment = match.groups()
            if tag == "Answer":
                segment = (segment or "").strip()
                if segment:
                    last_answer_content = segment

    # 将最后一轮的Answer内容添加到报告主体
    if last_answer_content:
        parts.append(f"{last_answer_content}\n")

    # 构建报告附件：包含所有对话轮次，每轮对话前加上用户指令
    conversation_round = 1
    for pair in conversation_pairs:
        user_content = pair["user"].strip()
        assistant_content = pair["assistant"]

        # 添加用户指令
        appendix.append(f"\n## 对话轮次 {conversation_round}\n\n")
        appendix.append(f"### 用户指令\n\n{user_content}\n\n")
        appendix.append(f"### 助手响应\n\n")

        # 处理助手响应中的标签
        step = 1
        for match in tag_pattern.finditer(assistant_content):
            tag, segment = match.groups()
            segment = (segment or "").strip()
            if not segment:
                continue
            appendix.append(f"#### 步骤 {step}: {tag}\n\n{segment}\n")
            step += 1

        conversation_round += 1

    final_text = "".join(parts).strip()
    if appendix:
        final_text += (
            "\n\n\\newpage\n\n# 附录：完整对话过程\n"
            + "".join(appendix).strip()
        )

    return final_text.strip()


def save_markdown_report(md_text: str, base_name: str, target_dir: Path) -> Path:
    """Persist markdown report under target directory."""
    target_dir.mkdir(parents=True, exist_ok=True)
    md_path = uniquify_path(target_dir / f"{base_name}.md")
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(md_text)
    return md_path




class WorkspaceTracker:
    """Track workspace file changes and collect artifacts into generated/ folder."""

    def __init__(self, workspace_dir: str, generated_dir: str):
        self.workspace_dir = Path(workspace_dir).resolve()
        self.generated_dir = Path(generated_dir).resolve()
        self.generated_dir.mkdir(parents=True, exist_ok=True)
        self.before_state = self._snapshot()

    def _snapshot(self) -> Dict[Path, Tuple[int, int]]:
        try:
            return {
                p.resolve(): (p.stat().st_size, p.stat().st_mtime_ns)
                for p in self.workspace_dir.rglob("*")
                if p.is_file()
            }
        except Exception:
            return {}

    def diff_and_collect(self) -> List[Path]:
        """Compute added/modified files, copy into generated/, and return artifact paths."""
        try:
            after_state = {
                p.resolve(): (p.stat().st_size, p.stat().st_mtime_ns)
                for p in self.workspace_dir.rglob("*")
                if p.is_file()
            }
        except Exception:
            after_state = {}

        added = [p for p in after_state.keys() if p not in self.before_state]
        modified = [
            p for p in after_state.keys()
            if p in self.before_state and after_state[p] != self.before_state[p]
        ]

        artifact_paths: List[Path] = []
        for p in added:
            try:
                if not str(p).startswith(str(self.generated_dir)):
                    dest = self.generated_dir / p.name
                    dest = uniquify_path(dest)
                    shutil.copy2(str(p), str(dest))
                    artifact_paths.append(dest.resolve())
                else:
                    artifact_paths.append(p)
            except Exception as e:
                print(f"Error moving file {p}: {e}")

        for p in modified:
            try:
                dest = self.generated_dir / f"{p.stem}_modified{p.suffix}"
                dest = uniquify_path(dest)
                shutil.copy2(str(p), str(dest))
                artifact_paths.append(dest.resolve())
            except Exception as e:
                print(f"Error copying modified file {p}: {e}")

        self.before_state = after_state
        return artifact_paths


def generate_report_from_messages(
    original_messages: List[Dict[str, Any]],
    assistant_reply: str,
    workspace_dir: str,
    thread_id: str,
    generated_files_sink: Optional[List[Dict[str, str]]] = None,
) -> str:
    """
    Generate markdown report from conversation history and return file block.

    Args:
        original_messages: Original message list from the API request
        assistant_reply: Complete assistant response text
        workspace_dir: Workspace directory path
        thread_id: Thread ID for building download URLs
        generated_files_sink: Optional list to append generated file metadata

    Returns:
        File block string with report link, or empty string on failure
    """
    # Build conversation history for report generation
    history_records: List[Dict[str, str]] = []
    for raw_msg in original_messages:
        role = raw_msg.get("role", "") if isinstance(raw_msg, dict) else ""
        raw_content = raw_msg.get("content", "") if isinstance(raw_msg, dict) else ""
        content_text = _normalize_openai_message_content(raw_content)
        history_records.append({"role": role, "content": content_text})

    history_records.append({"role": "assistant", "content": assistant_reply})

    try:
        md_text = extract_sections_from_history(history_records)
        if not md_text:
            md_text = (
                "(No <Analyze>/<Understand>/<Code>/<Execute>/<File>/<Answer> "
                "sections found.)"
            )

        export_dir = Path(workspace_dir) / "generated"
        export_dir.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        base_name = f"Conversation_Report_{timestamp}"
        report_path = save_markdown_report(md_text, base_name, export_dir)

        try:
            rel = report_path.resolve().relative_to(Path(workspace_dir).resolve())
            rel_path = rel.as_posix()
        except Exception:
            rel_path = report_path.name

        url = build_download_url(thread_id, rel_path)

        if generated_files_sink is not None:
            generated_files_sink.append({"name": report_path.name, "url": url})
        return "\n"

    except Exception as report_error:
        print(f"Report generation error: {report_error}")
        return ""
def render_file_block(
    artifact_paths: List[Path],
    workspace_dir: str,
    thread_id: str,
    generated_files_sink: Optional[List[Dict[str, str]]] = None,
) -> str:
    """Build the <File> markdown block and optionally collect generated file metadata."""
    if not artifact_paths:
        return ""


    for p in artifact_paths:
        try:
            rel = Path(p).resolve().relative_to(Path(workspace_dir).resolve()).as_posix()
        except Exception:
            rel = Path(p).name
        url = build_download_url(thread_id, rel)
        name = Path(p).name
        if generated_files_sink is not None :
            if {"name": name, "url": url} not in generated_files_sink:
                generated_files_sink.append({"name": name, "url": url})
    return ""

def start_http_server():
    os.makedirs(WORKSPACE_BASE_DIR, exist_ok=True)

    # 使用 ThreadingTCPServer 处理并发
    handler = partial(
        http.server.SimpleHTTPRequestHandler,
        directory=WORKSPACE_BASE_DIR
    )

    class ReusableThreadingTCPServer(socketserver.ThreadingTCPServer):
        allow_reuse_address = True
        daemon_threads = True

    try:
        with ReusableThreadingTCPServer(("", HTTP_SERVER_PORT), handler) as httpd:
            print(f"HTTP Server serving {WORKSPACE_BASE_DIR} at port {HTTP_SERVER_PORT}")
            try:
                httpd.serve_forever()
            except KeyboardInterrupt:
                print("HTTP server shutting down...")
                httpd.shutdown()
    except OSError as exc:
        print(f"HTTP server failed to start on port {HTTP_SERVER_PORT}: {exc}")