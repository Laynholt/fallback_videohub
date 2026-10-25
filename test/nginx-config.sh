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
    -e "SITE_DOMAIN=$domains" -e APP_PORT=8085 -e NGINX_HTTPS_PORT=9443 \
    -v "$ROOT_DIR/nginx.conf:/template:ro" -v "$TMP_DIR:/etc/nginx/certs:ro" \
    --entrypoint sh "$NGINX_IMAGE" -ec \
    'envsubst '\''$APP_PORT $NGINX_HTTPS_PORT $SITE_DOMAIN'\'' < /template > /etc/nginx/nginx.conf && nginx -t'
done
