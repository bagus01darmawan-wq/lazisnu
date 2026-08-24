#!/bin/bash
set -euo pipefail

# Config drift check — memverifikasi konsistensi secret JWT antar lingkungan.
#
# Latar belakang (2026-08-24): middleware web pernah memverifikasi access token
# dengan secret yang berbeda dari backend (JWT_ACCESS_SECRET tidak tersedia di
# env web) → semua navigasi protected redirect ke /login. Produksi selamat hanya
# karena kebetulan struktural (web mewarisi env backend via env_file).
#
# Skrip ini membandingkan per PASANGAN (web == backend) di tiap lingkungan dan
# memastikan variabel wajib ada & tidak kosong. Alert ke Discord + pesan
# pemulihan (pola backup-healthcheck.sh / auth-probe.sh).
#
# Env: jalankan sebagai root (cron). Webhook dibaca dari
# /opt/lazisnu/.env.alertmanager (DISCORD_WEBHOOK_PROMETHEUS) atau fallback
# BACKUP_ALERT_WEBHOOK_URL di /opt/lazisnu/apps/backend/.env. Override:
# DRIFT_WEBHOOK_URL, DRIFT_LOG_FILE, DRIFT_STATE_FILE.

LOG_FILE="${DRIFT_LOG_FILE:-/opt/lazisnu/auth-probe/config-drift.log}"
STATE_FILE="${DRIFT_STATE_FILE:-/opt/lazisnu/auth-probe/.config-drift-alert}"
BACKEND_ENV_FILE="/opt/lazisnu/apps/backend/.env"

mkdir -p "$(dirname "$LOG_FILE")"

log() {
  local line
  line="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
  printf '%s\n' "$line" >> "$LOG_FILE"
  printf '%s\n' "$line" 2>/dev/null || true
}

# Ambil nilai variabel dari env container (nama container, nama variabel)
container_env_value() {
  local container="$1"
  local var="$2"
  docker inspect "$container" --format "{{range .Config.Env}}{{println .}}{{end}}" 2>/dev/null \
    | sed -n "s/^${var}=\(.*\)$/\1/p" | head -1
}

# Ambil nilai variabel dari file env
file_env_value() {
  local file="$1"
  local var="$2"
  sed -n "s/^${var}=\(.*\)$/\1/p" "$file" 2>/dev/null | head -1
}

send_alert() {
  local reason="$1"
  local payload

  if [[ -z "$WEBHOOK_URL" ]]; then
    log "ALERT_NOT_SENT reason=webhook_not_configured alert=$reason"
    return 0
  fi

  payload="$(printf '{\"content\":\"[Lazisnu] Config drift: %s\"}' "$reason")"
  if curl --fail --silent --show-error --max-time 15 \
    -H 'Content-Type: application/json' \
    --data "$payload" \
    "$WEBHOOK_URL" >>"$LOG_FILE" 2>&1; then
    log "ALERT_SENT reason=$reason"
    return 0
  fi

  log "ALERT_DELIVERY_FAILED reason=$reason"
  return 1
}

send_recovery() {
  local previous_reason="$1"
  local payload

  if [[ -z "$WEBHOOK_URL" ]]; then
    log "RECOVERY_NOT_SENT reason=webhook_not_configured previous=$previous_reason"
    return 0
  fi

  payload="$(printf '{\"content\":\"[Lazisnu] Config drift OK: pulih otomatis — %s (semua secret konsisten)\"}' "$previous_reason")"
  if curl --fail --silent --show-error --max-time 15 \
    -H 'Content-Type: application/json' \
    --data "$payload" \
    "$WEBHOOK_URL" >>"$LOG_FILE" 2>&1; then
    log "RECOVERY_SENT previous=$previous_reason"
    return 0
  fi

  log "RECOVERY_DELIVERY_FAILED previous=$previous_reason"
  return 1
}

fail_drift() {
  local reason="$1"
  local previous_reason=""

  log "FAILURE reason=$reason"
  if [[ -f "$STATE_FILE" ]]; then
    previous_reason="$(cat "$STATE_FILE")"
  fi

  if [[ "$previous_reason" != "$reason" ]]; then
    if send_alert "$reason"; then
      printf '%s\n' "$reason" > "$STATE_FILE"
    fi
  fi
  exit 1
}

# ─── Webhook: cari di .env.alertmanager dulu, fallback ke backup webhook ────
WEBHOOK_URL="${DRIFT_WEBHOOK_URL:-}"
if [[ -z "$WEBHOOK_URL" && -f /opt/lazisnu/.env.alertmanager ]]; then
  WEBHOOK_URL="$(sed -n 's/^DISCORD_WEBHOOK_PROMETHEUS=\(.*\)$/\1/p' /opt/lazisnu/.env.alertmanager | head -1)"
fi
if [[ -z "$WEBHOOK_URL" && -f "$BACKEND_ENV_FILE" ]]; then
  WEBHOOK_URL="$(sed -n 's/^BACKUP_ALERT_WEBHOOK_URL=\(.*\)$/\1/p' "$BACKEND_ENV_FILE" | head -1)"
fi

# ─── Preflight ─────────────────────────────────────────────────────────────
command -v docker >/dev/null 2>&1 || fail_drift "missing_command_docker"
command -v curl >/dev/null 2>&1 || fail_drift "missing_command_curl"

# ─── Periksa pasangan produksi (warna aktif dari upstream.conf) ────────────
# Blue-green: deploy berpindah warna → cek warna yang ADA (aktif dan/atau idle).
ACTIVE_COLOR="$(sed -n 's/^# Active: \([a-z]*\) .*/\1/p' /opt/lazisnu/nginx/upstream.conf 2>/dev/null | head -1)"
[[ -n "$ACTIVE_COLOR" ]] || ACTIVE_COLOR="blue"
log "ACTIVE_COLOR=$ACTIVE_COLOR"

PROD_PAIRS=()
for color in blue green; do
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "${color}-backend"; then
    PROD_PAIRS+=("$color")
  fi
done
[[ "${#PROD_PAIRS[@]}" -gt 0 ]] || fail_drift "no_production_backend_container"

for color in "${PROD_PAIRS[@]}"; do
  PROD_BACKEND_ACCESS="$(container_env_value "${color}-backend" JWT_ACCESS_SECRET)"
  PROD_WEB_ACCESS="$(container_env_value "${color}-web" JWT_ACCESS_SECRET)"
  PROD_BACKEND_REFRESH="$(container_env_value "${color}-backend" JWT_REFRESH_SECRET)"
  PROD_WEB_REFRESH="$(container_env_value "${color}-web" JWT_REFRESH_SECRET)"

  [[ -n "$PROD_BACKEND_ACCESS" ]] || fail_drift "${color}_backend_missing_jwt_access_secret"
  [[ -n "$PROD_WEB_ACCESS" ]] || fail_drift "${color}_web_missing_jwt_access_secret"
  [[ -n "$PROD_BACKEND_REFRESH" ]] || fail_drift "${color}_backend_missing_jwt_refresh_secret"
  [[ -n "$PROD_WEB_REFRESH" ]] || fail_drift "${color}_web_missing_jwt_refresh_secret"
  [[ "$PROD_BACKEND_ACCESS" == "$PROD_WEB_ACCESS" ]] || fail_drift "${color}_pair_jwt_access_secret_mismatch"
  [[ "$PROD_BACKEND_REFRESH" == "$PROD_WEB_REFRESH" ]] || fail_drift "${color}_pair_jwt_refresh_secret_mismatch"

  if [[ "$color" == "$ACTIVE_COLOR" ]]; then
    ACTIVE_ACCESS="$PROD_BACKEND_ACCESS"
  fi
done

# Baseline file env produksi (jika ada) harus konsisten dengan warna aktif.
if [[ -r "$BACKEND_ENV_FILE" ]]; then
  FILE_ACCESS="$(file_env_value "$BACKEND_ENV_FILE" JWT_ACCESS_SECRET)"
  if [[ -n "$FILE_ACCESS" && -n "${ACTIVE_ACCESS:-}" && "$FILE_ACCESS" != "$ACTIVE_ACCESS" ]]; then
    fail_drift "${ACTIVE_COLOR}_envfile_jwt_access_secret_mismatch"
  fi
fi
log "PROD_OK"

# ─── Periksa pasangan staging ──────────────────────────────────────────────
STG_BACKEND_ACCESS="$(container_env_value lazisnu-backend-staging-1 JWT_ACCESS_SECRET)"
STG_WEB_ACCESS="$(container_env_value lazisnu-web-staging-1 JWT_ACCESS_SECRET)"
STG_BACKEND_REFRESH="$(container_env_value lazisnu-backend-staging-1 JWT_REFRESH_SECRET)"
STG_WEB_REFRESH="$(container_env_value lazisnu-web-staging-1 JWT_REFRESH_SECRET)"

[[ -n "$STG_BACKEND_ACCESS" ]] || fail_drift "staging_backend_missing_jwt_access_secret"
[[ -n "$STG_WEB_ACCESS" ]] || fail_drift "staging_web_missing_jwt_access_secret"
[[ -n "$STG_BACKEND_REFRESH" ]] || fail_drift "staging_backend_missing_jwt_refresh_secret"
[[ -n "$STG_WEB_REFRESH" ]] || fail_drift "staging_web_missing_jwt_refresh_secret"
[[ "$STG_BACKEND_ACCESS" == "$STG_WEB_ACCESS" ]] || fail_drift "staging_pair_jwt_access_secret_mismatch"
[[ "$STG_BACKEND_REFRESH" == "$STG_WEB_REFRESH" ]] || fail_drift "staging_pair_jwt_refresh_secret_mismatch"

log "STAGING_OK"

# ─── Sukses: kirim pemulihan jika sebelumnya ada alert ─────────────────────
if [[ -f "$STATE_FILE" ]]; then
  previous_reason="$(cat "$STATE_FILE")"
  if send_recovery "$previous_reason"; then
    rm -f "$STATE_FILE"
  fi
else
  rm -f "$STATE_FILE"
fi
log "SUCCESS"
exit 0
