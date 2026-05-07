#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"$SCRIPT_DIR/deploy_ecs.sh"
"$SCRIPT_DIR/ecs_enable_https_8420.sh"

echo "Done: deploy + HTTPS upgrade completed."
