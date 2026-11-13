#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
NGINX_IMAGE="$(awk '$1 == "image:" && $2 ~ /^nginx:/ { print $2 }' "$ROOT_DIR/docker-compose.yml")"
[[ -n "$NGINX_IMAGE" ]]
openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 1 \
  -keyout "$TMP_DIR/privkey.pem" -out "$TMP_DIR/fullchain.pem" \
  -subj /CN=example.test >/dev/null 2>&1
for domains in 'example.test' 'example.test www.example.test'; do
  docker run --rm --network none --add-host app:127.0.0.1 \
    -e "SITE_DOMAIN=$domains" -e APP_PORT=8085 -e NGINX_HTTPS_PORT=9443 -e NGINX_LISTEN_HOST=0.0.0.0 \
    -v "$ROOT_DIR/nginx.conf:/template:ro" -v "$TMP_DIR:/etc/nginx/certs:ro" \
    --entrypoint sh "$NGINX_IMAGE" -ec \
    'envsubst '\''$APP_PORT $NGINX_HTTPS_PORT $NGINX_LISTEN_HOST $SITE_DOMAIN'\'' < /template > /etc/nginx/nginx.conf && nginx -t'
done
# The HTTPS server listens on NGINX_LISTEN_HOST, and sites/server/*.conf adds locations to it.
mkdir "$TMP_DIR/server"
echo 'location = /hook { return 200 hook-ok; }' > "$TMP_DIR/server/x.conf"
for host in 0.0.0.0 127.0.0.1; do
  docker run --rm --network none --add-host app:127.0.0.1 \
    -e SITE_DOMAIN=example.test -e APP_PORT=8085 -e NGINX_HTTPS_PORT=9443 -e "NGINX_LISTEN_HOST=$host" \
    -v "$ROOT_DIR/nginx.conf:/template:ro" -v "$TMP_DIR:/etc/nginx/certs:ro" \
    -v "$TMP_DIR/server:/etc/nginx/sites/server:ro" \
    --entrypoint sh "$NGINX_IMAGE" -ec \
    'envsubst '\''$APP_PORT $NGINX_HTTPS_PORT $NGINX_LISTEN_HOST $SITE_DOMAIN'\'' < /template > /etc/nginx/nginx.conf
     nginx -T 2>/dev/null | grep -qF "listen '"$host"':9443 ssl;"
     nginx; sleep 1
     wget -qO- --no-check-certificate "https://'"$host"':9443/hook" | grep -qx hook-ok'
done
