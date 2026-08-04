#!/bin/bash
set -euo pipefail

# Renew Let's Encrypt certificates without stopping the production nginx.
# The nginx HTTP server already exposes /.well-known/acme-challenge/.

LOG_FILE="${CERTBOT_RENEW_LOG_FILE:-/var/log/lazisnu-certbot-renew.log}"
LOCK_FILE="${CERTBOT_RENEW_LOCK_FILE:-/run/lock/lazisnu-certbot-renew.lock}"
PROJECT_DIR="${LAZISNU_PROJECT_DIR:-/opt/lazisnu}"
CERTBOT_CONF_DIR="${CERTBOT_CONF_DIR:-$PROJECT_DIR/nginx/certbot/conf}"
CERTBOT_WEBROOT_DIR="${CERTBOT_WEBROOT_DIR:-$PROJECT_DIR/nginx/certbot/www}"
CERTBOT_IMAGE="${CERTBOT_IMAGE:-certbot/certbot:latest}"
NGINX_CONTAINER="${NGINX_CONTAINER:-lazisnu-nginx-1}"
RENEW_TIMEOUT="${CERTBOT_RENEW_TIMEOUT:-10m}"

STAGE="initialization"
FAILURE_REASON="unknown"
SUCCESS=0

mkdir -p "$(dirname "$LOG_FILE")" "$(dirname "$LOCK_FILE")"

log() {
  local message="$1"
  local line
  line="[$(date '+%Y-%m-%d %H:%M:%S')] $message"
  printf '%s\n' "$line" >> "$LOG_FILE"
  printf '%s\n' "$line" 2>/dev/null || true
}

on_exit() {
  local rc=$?
  if [[ "$rc" -ne 0 && "${SUCCESS:-0}" -ne 1 ]]; then
    printf '[%s] FAILURE stage=%s reason=%s exit_code=%s\n' \
      "$(date '+%Y-%m-%d %H:%M:%S')" \
      "${STAGE:-unknown}" \
      "${FAILURE_REASON:-unknown}" \
      "$rc" >> "$LOG_FILE" 2>/dev/null || true
    if command -v logger >/dev/null 2>&1; then
      logger -t lazisnu-certbot-renew -p daemon.err -- \
        "FAILURE stage=${STAGE:-unknown} reason=${FAILURE_REASON:-unknown}" || true
    fi
  fi
}
trap on_exit EXIT

fail() {
  STAGE="$1"
  FAILURE_REASON="$2"
  exit 1
}

for command_name in date docker flock timeout; do
  command -v "$command_name" >/dev/null 2>&1 || fail "preflight" "missing_command_$command_name"
done

[[ -d "$CERTBOT_CONF_DIR" ]] || fail "preflight" "missing_certbot_conf_dir"
[[ -d "$CERTBOT_WEBROOT_DIR" ]] || fail "preflight" "missing_certbot_webroot_dir"

NGINX_STATUS="$(docker inspect "$NGINX_CONTAINER" --format '{{.State.Status}}' 2>/dev/null || true)"
[[ "$NGINX_STATUS" == "running" ]] || fail "preflight" "nginx_not_running"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log "SKIPPED: another certificate renewal is running"
  exit 0
fi

STAGE="renew"
log "START certificate renewal mode=webroot nginx=$NGINX_CONTAINER"
if ! timeout --foreground "$RENEW_TIMEOUT" docker run --rm \
  -v "$CERTBOT_CONF_DIR:/etc/letsencrypt" \
  -v "$CERTBOT_WEBROOT_DIR:/var/www/certbot" \
  "$CERTBOT_IMAGE" renew \
  --webroot \
  -w /var/www/certbot \
  --non-interactive \
  --quiet >> "$LOG_FILE" 2>&1; then
  fail "$STAGE" "certbot_renew_failed_or_timed_out"
fi

STAGE="nginx_validate"
if ! docker exec "$NGINX_CONTAINER" nginx -t >> "$LOG_FILE" 2>&1; then
  fail "$STAGE" "nginx_config_test_failed"
fi

STAGE="nginx_reload"
if ! docker exec "$NGINX_CONTAINER" nginx -s reload >> "$LOG_FILE" 2>&1; then
  fail "$STAGE" "nginx_reload_failed"
fi

SUCCESS=1
log "SUCCESS certificate renewal completed without stopping nginx"
exit 0
