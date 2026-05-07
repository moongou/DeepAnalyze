#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

ENV_FILE="${DEPLOY_ENV_FILE:-$SCRIPT_DIR/deploy.ecs.env}"
if [ -f "$ENV_FILE" ]; then
    # shellcheck disable=SC1090
    source "$ENV_FILE"
fi

ECS_HOST="${ECS_HOST:-39.97.253.10}"
ECS_USER="${ECS_USER:-root}"
ECS_SSH_PORT="${ECS_SSH_PORT:-22}"
REMOTE_BASE_DIR="${REMOTE_BASE_DIR:-/opt/deepanalyze}"
REMOTE_SERVICE_NAME="${REMOTE_SERVICE_NAME:-deepanalyze-api}"
REMOTE_API_PORT="${REMOTE_API_PORT:-8420}"
REMOTE_FILE_PORT="${REMOTE_FILE_PORT:-8421}"
REMOTE_MODEL_API_BASE="${REMOTE_MODEL_API_BASE:-http://127.0.0.1:8000/v1}"
REMOTE_CORS_ALLOW_ORIGINS="${REMOTE_CORS_ALLOW_ORIGINS:-https://rainforgrain.top,https://rainforgrain.top:8420}"
REMOTE_RUN_USER="${REMOTE_RUN_USER:-$ECS_USER}"
REMOTE_RUN_GROUP="${REMOTE_RUN_GROUP:-$ECS_USER}"

SSH_IDENTITY_ARG=""
if [ -n "${ECS_SSH_KEY_PATH:-}" ]; then
    SSH_IDENTITY_ARG="-i $ECS_SSH_KEY_PATH"
fi

SSH_OPTS="-p $ECS_SSH_PORT -o StrictHostKeyChecking=accept-new $SSH_IDENTITY_ARG"

require_cmd() {
    local cmd="$1"
    if ! command -v "$cmd" >/dev/null 2>&1; then
        echo "Error: required command '$cmd' not found." >&2
        exit 1
    fi
}

require_cmd git
require_cmd ssh
require_cmd rsync
require_cmd python3

cd "$PROJECT_ROOT"

COMMIT_SHA="$(git rev-parse --short HEAD)"
TS="$(date +%Y%m%d%H%M%S)"
RELEASE_ID="${TS}-${COMMIT_SHA}"
REMOTE_RELEASE_DIR="$REMOTE_BASE_DIR/releases/$RELEASE_ID"

echo "==> Deploy target: $ECS_USER@$ECS_HOST:$REMOTE_RELEASE_DIR"
echo "==> Service name:  $REMOTE_SERVICE_NAME"
echo "==> API port:      $REMOTE_API_PORT"

ssh $SSH_OPTS "$ECS_USER@$ECS_HOST" "mkdir -p '$REMOTE_RELEASE_DIR'"

RSYNC_EXCLUDES=(
    --exclude ".git/"
    --exclude ".venv/"
    --exclude ".idea/"
    --exclude ".vscode/"
    --exclude "__pycache__/"
    --exclude "*.pyc"
    --exclude "logs/"
    --exclude "workspace/"
    --exclude "demo/chat/logs/"
    --exclude "demo/chat/workspace/"
    --exclude "demo/chat/frontend/node_modules/"
    --exclude "demo/chat/frontend/.next/"
    --exclude "DeepAnalyze-8B/"
    --exclude "DeepAnalyze-8B-MLX-4bit/"
    --exclude "DeepAnalyze-8B-MLX-FP16/"
    --exclude "assets/fonts/*.ttf"
)

echo "==> Syncing repository files to ECS..."
rsync -az --delete -e "ssh $SSH_OPTS" "${RSYNC_EXCLUDES[@]}" "$PROJECT_ROOT/" "$ECS_USER@$ECS_HOST:$REMOTE_RELEASE_DIR/"

echo "==> Running remote release steps..."
ssh $SSH_OPTS "$ECS_USER@$ECS_HOST" \
    REMOTE_BASE_DIR="$REMOTE_BASE_DIR" \
    REMOTE_RELEASE_DIR="$REMOTE_RELEASE_DIR" \
    REMOTE_SERVICE_NAME="$REMOTE_SERVICE_NAME" \
    REMOTE_API_PORT="$REMOTE_API_PORT" \
    REMOTE_FILE_PORT="$REMOTE_FILE_PORT" \
    REMOTE_MODEL_API_BASE="$REMOTE_MODEL_API_BASE" \
    REMOTE_CORS_ALLOW_ORIGINS="$REMOTE_CORS_ALLOW_ORIGINS" \
    REMOTE_RUN_USER="$REMOTE_RUN_USER" \
    REMOTE_RUN_GROUP="$REMOTE_RUN_GROUP" \
    'bash -s' <<'EOF'
set -euo pipefail

mkdir -p "$REMOTE_BASE_DIR/releases" "$REMOTE_BASE_DIR/shared" "$REMOTE_BASE_DIR/logs" "$REMOTE_BASE_DIR/run"
mkdir -p "$REMOTE_BASE_DIR/shared/workspace"
ln -sfn "$REMOTE_RELEASE_DIR" "$REMOTE_BASE_DIR/current"

port_is_busy() {
    local port="$1"
    if ss -ltn | awk '{print $4}' | grep -E "(^|[.:])${port}$" >/dev/null 2>&1; then
        return 0
    fi
    return 1
}

pick_fallback_port() {
    local requested="$1"
    local candidate="$requested"
    local step=10000

    while port_is_busy "$candidate"; do
        candidate=$((candidate + step))
        if [ "$candidate" -gt 65535 ]; then
            echo ""
            return 1
        fi
    done

    echo "$candidate"
    return 0
}

CURRENT_API_PORT=""
CURRENT_FILE_PORT=""
if [ -f "$REMOTE_BASE_DIR/shared/deploy.env" ]; then
    CURRENT_API_PORT="$(grep '^DEEPANALYZE_API_PORT=' "$REMOTE_BASE_DIR/shared/deploy.env" | head -n 1 | cut -d= -f2- || true)"
    CURRENT_FILE_PORT="$(grep '^DEEPANALYZE_HTTP_SERVER_PORT=' "$REMOTE_BASE_DIR/shared/deploy.env" | head -n 1 | cut -d= -f2- || true)"
fi

EFFECTIVE_API_PORT="$REMOTE_API_PORT"
if port_is_busy "$EFFECTIVE_API_PORT"; then
    if [ -n "$CURRENT_API_PORT" ]; then
        EFFECTIVE_API_PORT="$CURRENT_API_PORT"
        echo "Requested API port $REMOTE_API_PORT is busy, reusing current effective port $EFFECTIVE_API_PORT"
    else
        EFFECTIVE_API_PORT="$(pick_fallback_port "$REMOTE_API_PORT")"
        echo "Requested API port $REMOTE_API_PORT is busy, using fallback port $EFFECTIVE_API_PORT"
    fi
    if [ -z "$EFFECTIVE_API_PORT" ]; then
        echo "Error: no available fallback port for API (requested $REMOTE_API_PORT)."
        exit 1
    fi
fi

EFFECTIVE_FILE_PORT="$REMOTE_FILE_PORT"
if [ "$EFFECTIVE_FILE_PORT" = "$EFFECTIVE_API_PORT" ] || port_is_busy "$EFFECTIVE_FILE_PORT"; then
    if [ -n "$CURRENT_FILE_PORT" ] && [ "$CURRENT_FILE_PORT" != "$EFFECTIVE_API_PORT" ]; then
        EFFECTIVE_FILE_PORT="$CURRENT_FILE_PORT"
        echo "Requested file port $REMOTE_FILE_PORT is busy, reusing current effective port $EFFECTIVE_FILE_PORT"
    else
        EFFECTIVE_FILE_PORT=$((EFFECTIVE_API_PORT + 1))
        while port_is_busy "$EFFECTIVE_FILE_PORT" || [ "$EFFECTIVE_FILE_PORT" = "$EFFECTIVE_API_PORT" ]; do
            EFFECTIVE_FILE_PORT=$((EFFECTIVE_FILE_PORT + 1))
            if [ "$EFFECTIVE_FILE_PORT" -gt 65535 ]; then
                echo "Error: no available fallback port for file server (requested $REMOTE_FILE_PORT)."
                exit 1
            fi
        done
        echo "Requested file port $REMOTE_FILE_PORT is busy, using fallback port $EFFECTIVE_FILE_PORT"
    fi
fi

if [ ! -x "$REMOTE_BASE_DIR/shared/venv/bin/python" ]; then
    python3 -m venv "$REMOTE_BASE_DIR/shared/venv"
fi

"$REMOTE_BASE_DIR/shared/venv/bin/python" -m pip install --upgrade pip setuptools wheel

REQ_IN="$REMOTE_BASE_DIR/current/requirements_python.txt"
REQ_OUT="$REMOTE_BASE_DIR/shared/requirements.deploy.txt"

"$REMOTE_BASE_DIR/shared/venv/bin/python" - "$REQ_IN" "$REQ_OUT" <<'PY'
import pathlib
import platform
import re
import sys

src = pathlib.Path(sys.argv[1])
dst = pathlib.Path(sys.argv[2])

lines = src.read_text(encoding="utf-8").splitlines()
block = re.compile(r"^(mlx|mlx-lm|mlx-metal|rpy2|rpy2-rinterface|rpy2-robjects)==", re.IGNORECASE)

is_linux = platform.system().lower() == "linux"
out = []
for line in lines:
    stripped = line.strip()
    if not stripped:
        out.append(line)
        continue
    if stripped.startswith("#"):
        out.append(line)
        continue
    if is_linux and block.match(stripped):
        continue
    out.append(line)

dst.write_text("\n".join(out) + "\n", encoding="utf-8")
PY

"$REMOTE_BASE_DIR/shared/venv/bin/pip" install -r "$REQ_OUT"
"$REMOTE_BASE_DIR/shared/venv/bin/pip" install PyJWT bcrypt

if [ -d "$REMOTE_BASE_DIR/current/workspace" ] && [ ! -L "$REMOTE_BASE_DIR/current/workspace" ]; then
    rm -rf "$REMOTE_BASE_DIR/current/workspace"
fi
ln -sfn "$REMOTE_BASE_DIR/shared/workspace" "$REMOTE_BASE_DIR/current/workspace"

cat > "$REMOTE_BASE_DIR/shared/deploy.env" <<ENVVARS
DEEPANALYZE_API_PORT=$EFFECTIVE_API_PORT
DEEPANALYZE_HTTP_SERVER_PORT=$EFFECTIVE_FILE_PORT
DEEPANALYZE_MODEL_API_BASE=$REMOTE_MODEL_API_BASE
DEEPANALYZE_CORS_ALLOW_ORIGINS=$REMOTE_CORS_ALLOW_ORIGINS
PYTHONUNBUFFERED=1
ENVVARS

cat > "/etc/systemd/system/$REMOTE_SERVICE_NAME.service" <<UNIT
[Unit]
Description=DeepAnalyze API Service
After=network.target

[Service]
Type=simple
User=$REMOTE_RUN_USER
Group=$REMOTE_RUN_GROUP
WorkingDirectory=$REMOTE_BASE_DIR/current
EnvironmentFile=$REMOTE_BASE_DIR/shared/deploy.env
ExecStart=$REMOTE_BASE_DIR/shared/venv/bin/python API/start_server.py
Restart=always
RestartSec=5
KillSignal=SIGINT
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable "$REMOTE_SERVICE_NAME" >/dev/null 2>&1 || true
systemctl restart "$REMOTE_SERVICE_NAME"

sleep 2
systemctl --no-pager --full status "$REMOTE_SERVICE_NAME" | sed -n '1,18p'

HEALTH_OK=0
for _ in $(seq 1 20); do
    if curl -fsS "http://127.0.0.1:$EFFECTIVE_API_PORT/health" >/dev/null 2>&1; then
        HEALTH_OK=1
        break
    fi
    sleep 1
done

if [ "$HEALTH_OK" -ne 1 ]; then
    echo "Error: health check failed on :$EFFECTIVE_API_PORT"
    exit 1
fi

echo "Remote health check passed on :$EFFECTIVE_API_PORT"
echo "Requested API port: $REMOTE_API_PORT"
echo "Effective API port: $EFFECTIVE_API_PORT"
echo "Requested file port: $REMOTE_FILE_PORT"
echo "Effective file port: $EFFECTIVE_FILE_PORT"
EOF

echo "==> Deployment finished"
EFFECTIVE_API_PORT_REMOTE="$(ssh $SSH_OPTS "$ECS_USER@$ECS_HOST" "grep '^DEEPANALYZE_API_PORT=' '$REMOTE_BASE_DIR/shared/deploy.env' | head -n 1 | cut -d= -f2-" 2>/dev/null || true)"
EFFECTIVE_FILE_PORT_REMOTE="$(ssh $SSH_OPTS "$ECS_USER@$ECS_HOST" "grep '^DEEPANALYZE_HTTP_SERVER_PORT=' '$REMOTE_BASE_DIR/shared/deploy.env' | head -n 1 | cut -d= -f2-" 2>/dev/null || true)"

if [ -z "$EFFECTIVE_API_PORT_REMOTE" ]; then
    EFFECTIVE_API_PORT_REMOTE="$REMOTE_API_PORT"
fi

if [ -z "$EFFECTIVE_FILE_PORT_REMOTE" ]; then
    EFFECTIVE_FILE_PORT_REMOTE="$REMOTE_FILE_PORT"
fi

echo "Effective API endpoint (ECS):  http://$ECS_HOST:$EFFECTIVE_API_PORT_REMOTE/health"
echo "Effective file endpoint (ECS): http://$ECS_HOST:$EFFECTIVE_FILE_PORT_REMOTE"
if [ "$EFFECTIVE_API_PORT_REMOTE" != "$REMOTE_API_PORT" ]; then
    echo "Note: requested API port $REMOTE_API_PORT was occupied on ECS and remapped to $EFFECTIVE_API_PORT_REMOTE."
fi
if [ "$EFFECTIVE_FILE_PORT_REMOTE" != "$REMOTE_FILE_PORT" ]; then
    echo "Note: requested file port $REMOTE_FILE_PORT was occupied on ECS and remapped to $EFFECTIVE_FILE_PORT_REMOTE."
fi
echo "Domain target you requested: https://rainforgrain.top:$REMOTE_API_PORT/health"
