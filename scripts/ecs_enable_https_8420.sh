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
REMOTE_DOMAIN="${REMOTE_DOMAIN:-rainforgrain.top}"
REMOTE_NGINX_SITE_FILE="${REMOTE_NGINX_SITE_FILE:-/etc/nginx/sites-available/roundtable}"

SSH_IDENTITY_ARG=""
if [ -n "${ECS_SSH_KEY_PATH:-}" ]; then
    SSH_IDENTITY_ARG="-i $ECS_SSH_KEY_PATH"
fi
SSH_OPTS="-p $ECS_SSH_PORT -o StrictHostKeyChecking=accept-new $SSH_IDENTITY_ARG"

EFFECTIVE_API_PORT="$(ssh $SSH_OPTS "$ECS_USER@$ECS_HOST" "grep '^DEEPANALYZE_API_PORT=' /opt/deepanalyze/shared/deploy.env 2>/dev/null | head -n 1 | cut -d= -f2-" || true)"
if [ -z "$EFFECTIVE_API_PORT" ]; then
    echo "Error: cannot read DEEPANALYZE_API_PORT from /opt/deepanalyze/shared/deploy.env"
    exit 1
fi

ssh $SSH_OPTS "$ECS_USER@$ECS_HOST" \
    REMOTE_DOMAIN="$REMOTE_DOMAIN" \
    REMOTE_NGINX_SITE_FILE="$REMOTE_NGINX_SITE_FILE" \
    EFFECTIVE_API_PORT="$EFFECTIVE_API_PORT" \
    'bash -s' <<'EOF'
set -euo pipefail

if [ ! -f "$REMOTE_NGINX_SITE_FILE" ]; then
    echo "Error: nginx site file not found: $REMOTE_NGINX_SITE_FILE"
    exit 1
fi

TS="$(date +%Y%m%d%H%M%S)"
cp "$REMOTE_NGINX_SITE_FILE" "${REMOTE_NGINX_SITE_FILE}.bak.${TS}"

if grep -q "# deepanalyze-8420" "$REMOTE_NGINX_SITE_FILE"; then
    awk -v p="$EFFECTIVE_API_PORT" '
    BEGIN{inblock=0}
    /# deepanalyze-8420 begin/{inblock=1}
    {
        if (inblock==1 && $0 ~ /proxy_pass http:\/\/127\.0\.0\.1:[0-9]+;/) {
            print "        proxy_pass http://127.0.0.1:" p ";"
        } else {
            print $0
        }
    }
    /# deepanalyze-8420 end/{inblock=0}
    ' "$REMOTE_NGINX_SITE_FILE" > "${REMOTE_NGINX_SITE_FILE}.tmp"
    mv "${REMOTE_NGINX_SITE_FILE}.tmp" "$REMOTE_NGINX_SITE_FILE"
else
cat >> "$REMOTE_NGINX_SITE_FILE" <<NGINXBLOCK

# deepanalyze-8420 begin
server {
    listen 8420 ssl;
    server_name ${REMOTE_DOMAIN};

    ssl_certificate /etc/letsencrypt/live/${REMOTE_DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${REMOTE_DOMAIN}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location / {
        proxy_pass http://127.0.0.1:${EFFECTIVE_API_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_connect_timeout 30s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }
}
# deepanalyze-8420 end
NGINXBLOCK
fi

if ss -ltnp | grep -q ':8420 .*frps'; then
    systemctl stop frps || true
    systemctl disable frps || true
fi

nginx -t
systemctl reload nginx
ufw allow 8420/tcp >/dev/null 2>&1 || true

curl -k -sS "https://127.0.0.1:8420/health" >/dev/null

echo "HTTPS 8420 enabled -> 127.0.0.1:${EFFECTIVE_API_PORT}"
EOF

echo "HTTPS endpoint ready: https://${REMOTE_DOMAIN}:8420/health"
