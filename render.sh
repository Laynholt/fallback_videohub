#!/bin/sh
# Renders /etc/nginx/nginx.conf from the template and starts nginx.
# Shared by docker-compose.yml and test/nginx-config.sh. RENDER_ONLY=1 stops after `nginx -t`.
set -eu

fail() {
    printf 'render.sh: %s\n' "$1" >&2
    exit 1
}

template=/etc/nginx/templates/nginx.conf.template
socket=${NGINX_PROXY_SOCKET:-}

# Optional unix socket with PROXY protocol for Xray Reality `target` (xver=1); empty means off.
if [ -n "$socket" ]; then
    # tr: a newline would let grep match one line and pass the rest into the config.
    printf '%s' "$socket" | tr '\n' ' ' | grep -Eqx '/[A-Za-z0-9._/-]+\.sock' ||
        fail "bad NGINX_PROXY_SOCKET: $socket"
    directory=${socket%/*}
    lock=$directory/.frontend.lock
    # nginx trusts the client address in the PROXY header, so only root may reach the socket.
    [ -d "$directory" ] && [ ! -L "$directory" ] &&
        [ "$(stat -c '%u:%g:%a' "$directory")" = 0:0:700 ] || fail "$directory must be a root:root 0700 directory"
    [ -f "$lock" ] && [ ! -L "$lock" ] &&
        [ "$(stat -c '%u:%g:%a:%h' "$lock")" = 0:0:600:1 ] || fail "$lock must be a root:root 0600 file"
    # fd 9 stays open in nginx after exec, so the lock is held while nginx runs.
    exec 9<>"$lock"
    flock -n 9 || fail "$directory already has an owner"
    if [ -e "$socket" ] || [ -L "$socket" ]; then
        [ -S "$socket" ] && [ ! -L "$socket" ] &&
            [ "$(stat -c '%u:%g' "$socket")" = 0:0 ] || fail "$socket is not a previous root socket"
        rm -- "$socket"
    fi
    printf 'listen unix:%s ssl proxy_protocol;\nset_real_ip_from unix:;\nreal_ip_header proxy_protocol;\n' \
        "$socket" > /etc/nginx/proxy-socket.conf
fi

# Every ${VAR} of the template, so a new one cannot be missed; nginx variables such as $host survive.
envsubst "$(grep -oE '\$\{[A-Z_][A-Z0-9_]*\}' "$template" | sort -u)" < "$template" > /etc/nginx/nginx.conf
[ "${RENDER_ONLY:-0}" = 1 ] && exec nginx -t
exec nginx -g 'daemon off;'
