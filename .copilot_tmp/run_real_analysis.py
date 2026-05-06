import json
import os
import time
import urllib.request
from pathlib import Path

REPO_ROOT = Path("/Users/m3max/IdeaProjects/DeepAnalyze")
CONFIG_ROOT = REPO_ROOT / "demo/chat/configs/rainforgrain"
MESSAGE = "请分析cus数据库，分析这些企业在各时间段进口金额的分布。给我一个报告。"
DATABASE_ID = "db_postgresql_localhost_5432_postgres_cus"
PROVIDER_ID = os.getenv("PROVIDER_ID", "custom-openai-compatible")
BACKEND_URL = "http://localhost:8200/chat/completions"

with (CONFIG_ROOT / "database_connections.json").open("r", encoding="utf-8") as f:
    database_connections = json.load(f).get("connections", [])

with (CONFIG_ROOT / "model_providers.json").open("r", encoding="utf-8") as f:
    model_providers = json.load(f).get("providers", [])

selected_database_source = next(
    (item for item in database_connections if isinstance(item, dict) and item.get("id") == DATABASE_ID),
    None,
)
if not selected_database_source:
    raise SystemExit(f"database source not found: {DATABASE_ID}")

selected_provider = next(
    (item for item in model_providers if isinstance(item, dict) and item.get("id") == PROVIDER_ID),
    None,
)
if not selected_provider:
    raise SystemExit(f"provider not found: {PROVIDER_ID}")

session_id = f"session_real_validation_{int(time.time() * 1000)}"
payload = {
    "messages": [{"role": "user", "content": MESSAGE}],
    "workspace": [],
    "session_id": session_id,
    "username": "rainforgrain",
    "strategy": "聚焦诉求",
    "analysis_mode": "full_agent",
    "analysis_language": "zh-CN",
    "report_types": ["pdf"],
    "model_provider": selected_provider,
    "selected_database_sources": [selected_database_source],
    "source_selection_explicit": True,
}

request = urllib.request.Request(
    BACKEND_URL,
    data=json.dumps(payload).encode("utf-8"),
    headers={"Content-Type": "application/json"},
    method="POST",
)

output_chunks: list[str] = []
print(f"SESSION_ID={session_id}")
print("STREAM_BEGIN")

with urllib.request.urlopen(request, timeout=1800) as response:
    for raw_line in response:
        line = raw_line.decode("utf-8", errors="ignore").strip()
        if not line:
            continue
        try:
            payload_line = json.loads(line)
        except json.JSONDecodeError:
            continue
        choices = payload_line.get("choices") or []
        if not choices:
            continue
        choice = choices[0] if isinstance(choices[0], dict) else {}
        delta = choice.get("delta") or {}
        content = delta.get("content") or ""
        if content:
            print(content, end="", flush=True)
            output_chunks.append(content)

print("\nSTREAM_END")
output_text = "".join(output_chunks)
out_path = Path("/tmp") / f"{session_id}_analysis_output.txt"
out_path.write_text(output_text, encoding="utf-8")
print(f"OUTPUT_PATH={out_path}")
print(f"OUTPUT_CHARS={len(output_text)}")
