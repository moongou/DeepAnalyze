#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${DEPLOY_ENV_FILE:-$SCRIPT_DIR/deploy.ecs.env}"

if [ -f "$ENV_FILE" ]; then
    # shellcheck disable=SC1090
    source "$ENV_FILE"
fi

ECS_HOST="${ECS_HOST:-39.97.253.10}"
ECS_USER="${ECS_USER:-root}"
ECS_SSH_PORT="${ECS_SSH_PORT:-22}"
REMOTE_SERVICE_NAME="${REMOTE_SERVICE_NAME:-deepanalyze-api}"

SSH_IDENTITY_ARG=""
if [ -n "${ECS_SSH_KEY_PATH:-}" ]; then
    SSH_IDENTITY_ARG="-i $ECS_SSH_KEY_PATH"
fi

ACTION="${1:-status}"
SSH_OPTS="-p $ECS_SSH_PORT -o StrictHostKeyChecking=accept-new $SSH_IDENTITY_ARG"

case "$ACTION" in
    status)
        ssh $SSH_OPTS "$ECS_USER@$ECS_HOST" "systemctl --no-pager status $REMOTE_SERVICE_NAME"
        ;;
    restart)
        ssh $SSH_OPTS "$ECS_USER@$ECS_HOST" "systemctl restart $REMOTE_SERVICE_NAME && systemctl --no-pager status $REMOTE_SERVICE_NAME | sed -n '1,16p'"
        ;;
    stop)
        ssh $SSH_OPTS "$ECS_USER@$ECS_HOST" "systemctl stop $REMOTE_SERVICE_NAME && systemctl --no-pager status $REMOTE_SERVICE_NAME | sed -n '1,16p'"
        ;;
    logs)
        ssh $SSH_OPTS "$ECS_USER@$ECS_HOST" "journalctl -u $REMOTE_SERVICE_NAME -n 120 --no-pager"
        ;;
    *)
        echo "Usage: $0 {status|restart|stop|logs}"
        exit 1
        ;;
esac
