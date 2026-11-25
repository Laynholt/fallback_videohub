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
# The same render.sh and mounts as docker-compose.yml.
MOUNTS=(-v "$ROOT_DIR/render.sh:/etc/nginx/render.sh:ro"
  -v "$ROOT_DIR/nginx.conf:/etc/nginx/templates/nginx.conf.template:ro" -v "$TMP_DIR:/etc/nginx/certs:ro")
for domains in 'example.test' 'example.test www.example.test'; do
  docker run --rm --network none --add-host app:127.0.0.1 -e RENDER_ONLY=1 \
    -e "SITE_DOMAIN=$domains" -e APP_PORT=8085 -e NGINX_HTTPS_PORT=9443 -e NGINX_LISTEN_HOST=0.0.0.0 \
    "${MOUNTS[@]}" "$NGINX_IMAGE" sh /etc/nginx/render.sh
done
# The HTTPS server listens on NGINX_LISTEN_HOST, and sites/server/*.conf adds locations to it.
mkdir "$TMP_DIR/server"
echo 'location = /hook { return 200 hook-ok; }' > "$TMP_DIR/server/x.conf"
for host in 0.0.0.0 127.0.0.1; do
  docker run --rm --network none --add-host app:127.0.0.1 -e RENDER_ONLY=1 \
    -e SITE_DOMAIN=example.test -e APP_PORT=8085 -e NGINX_HTTPS_PORT=9443 -e "NGINX_LISTEN_HOST=$host" \
    "${MOUNTS[@]}" -v "$TMP_DIR/server:/etc/nginx/sites/server:ro" \
    --entrypoint sh "$NGINX_IMAGE" -ec \
    'sh /etc/nginx/render.sh
     nginx -T 2>/dev/null | grep -qF "listen '"$host"':9443 ssl;"
     [ ! -e /etc/nginx/proxy-socket.conf ]
     nginx; sleep 1
     wget -qO- --no-check-certificate "https://'"$host"':9443/hook" | grep -qx hook-ok'
done
# NGINX_PROXY_SOCKET: render.sh checks the socket directory and lock and removes a stale socket;
# nginx takes the client address from the PROXY header. The stream proxy below puts 127.0.0.1 there;
# without real IP from PROXY protocol $remote_addr would be "unix:". The client runs as root, like Xray:
# the socket directory is 0700.
echo 'location = /ip { return 200 $remote_addr; }' > "$TMP_DIR/server/ip.conf"
printf '%s\n' 'user root;' 'pid /tmp/client.pid;' 'events {}' \
  'stream { server { listen 127.0.0.1:7000; proxy_pass unix:/run/px/cover.sock; proxy_protocol on; } }' \
  > "$TMP_DIR/client.conf"
docker run --rm --network none --add-host app:127.0.0.1 --tmpfs /run/px:mode=700 \
  -e SITE_DOMAIN=example.test -e APP_PORT=8085 -e NGINX_HTTPS_PORT=9443 -e NGINX_LISTEN_HOST=127.0.0.1 \
  -e NGINX_PROXY_SOCKET=/run/px/cover.sock \
  "${MOUNTS[@]}" -v "$TMP_DIR/server:/etc/nginx/sites/server:ro" \
  --entrypoint sh "$NGINX_IMAGE" -ec \
  'R=/etc/nginx/render.sh
   RENDER_ONLY=1 sh $R 2>&1 | grep -qF "/run/px/.frontend.lock must be a root:root 0600 file"
   install -m 600 /dev/null /run/px/.frontend.lock
   chmod 755 /run/px
   RENDER_ONLY=1 sh $R 2>&1 | grep -qF "/run/px must be a root:root 0700 directory"
   chmod 700 /run/px
   NGINX_PROXY_SOCKET="/run/px/a.sock; listen 80" RENDER_ONLY=1 sh $R 2>&1 | grep -qF "bad NGINX_PROXY_SOCKET"
   sh $R & sleep 1
   [ -S /run/px/cover.sock ]
   RENDER_ONLY=1 sh $R 2>&1 | grep -qF "/run/px already has an owner"
   # A crash leaves the socket behind and releases the lock; the next start removes the socket.
   killall -9 nginx; sleep 1
   [ -S /run/px/cover.sock ]
   sh $R & sleep 1
   nginx -c /etc/nginx/certs/client.conf
   wget -qO- --no-check-certificate https://127.0.0.1:7000/ip | grep -qx 127.0.0.1
   # The TCP listener still takes plain TLS without a PROXY header.
   wget -qO- --no-check-certificate https://127.0.0.1:9443/ip | grep -qx 127.0.0.1'
