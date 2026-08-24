#!/bin/bash
set -euo pipefail

# Synthetic auth probe — canary login/refresh/prefetch untuk dashboard.lazisnu.site.
#
# Mereproduksi siklus keluhan user: login → navigasi menu (prefetch RSC lewat
# middleware) → access token TTL 15 menit habis → refresh token dipakai lagi.
# Gagal di tahap mana pun → alert ke Discord (dedup via state file).
# Pulih setelah gagal → kirim pesan pemulihan (pola backup-healthcheck.sh).
#
# Env: /opt/lazisnu/secrets/env.auth-probe (root, chmod 600) atau variabel
# lingkungan override: BACKEND_URL, DASHBOARD_URL, TEST_EMAIL, TEST_PASSWORD,
# ALERT_WEBHOOK_URL, REFRESH_WAIT_SECONDS, PROBE_DEVICE_ID, LOG_FILE, STATE_FILE.

ENV_FILE="${AUTH_PROBE_ENV_FILE:-/opt/lazisnu/secrets/env.auth-probe}"
if [[ ! -r "$ENV_FILE" ]]; then
  printf 'Auth probe failed: env file is not readable: %s\n' "$ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
set -u

BACKEND_URL="${BACKEND_URL:-https://api.lazisnu.site}"
DASHBOARD_URL="${DASHBOARD_URL:-https://dashboard.lazisnu.site}"
REFRESH_WAIT_SECONDS="${REFRESH_WAIT_SECONDS:-960}"   # 16 menit > TTL access 15m
PROBE_DEVICE_ID="${PROBE_DEVICE_ID:-auth-probe}"
LOG_FILE="${AUTH_PROBE_LOG_FILE:-/opt/lazisnu/auth-probe/auth-probe.log}"
STATE_FILE="${AUTH_PROBE_STATE_FILE:-/opt/lazisnu/auth-probe/.auth-probe-alert}"

mkdir -p "$(dirname "$LOG_FILE")"

log() {
  local line
  line="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
  printf '%s\n' "$line" >> "$LOG_FILE"
  printf '%s\n' "$line" 2>/dev/null || true
}

send_alert() {
  local reason="$1"
  local payload

  if [[ -z "$ALERT_WEBHOOK_URL" ]]; then
    log "ALERT_NOT_SENT reason=webhook_not_configured alert=$reason"
    return 0
  fi

  payload="$(printf '{\"content\":\"[Lazisnu] Auth probe alert: %s\"}' "$reason")"
  if curl --fail --silent --show-error --max-time 15 \
    -H 'Content-Type: application/json' \
    --data "$payload" \
    "$ALERT_WEBHOOK_URL" >>"$LOG_FILE" 2>&1; then
    log "ALERT_SENT reason=$reason"
    return 0
  fi

  log "ALERT_DELIVERY_FAILED reason=$reason"
  return 1
}

send_recovery() {
  local previous_reason="$1"
  local payload

  if [[ -z "$ALERT_WEBHOOK_URL" ]]; then
    log "RECOVERY_NOT_SENT reason=webhook_not_configured previous=$previous_reason"
    return 0
  fi

  payload="$(printf '{\"content\":\"[Lazisnu] Auth probe OK: pulih otomatis — %s (probe sehat kembali)\"}' "$previous_reason")"
  if curl --fail --silent --show-error --max-time 15 \
    -H 'Content-Type: application/json' \
    --data "$payload" \
    "$ALERT_WEBHOOK_URL" >>"$LOG_FILE" 2>&1; then
    log "RECOVERY_SENT previous=$previous_reason"
    return 0
  fi

  log "RECOVERY_DELIVERY_FAILED previous=$previous_reason"
  return 1
}

fail_probe() {
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

# ─── Preflight ─────────────────────────────────────────────────────────────
if [[ -z "$TEST_EMAIL" || -z "$TEST_PASSWORD" ]]; then
  fail_probe "missing_test_credentials"
fi
command -v curl >/dev/null 2>&1 || fail_probe "missing_command_curl"
command -v sed >/dev/null 2>&1 || fail_probe "missing_command_sed"

# ─── Tahap 1: Login ─────────────────────────────────────────────────────────
LOGIN_HTTP="$(curl --silent --show-error --max-time 30 -o /tmp/authprobe-login.$$ -w '%{http_code}' \
  -H 'Content-Type: application/json' \
  --data "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"device_id\":\"$PROBE_DEVICE_ID\"}" \
  "$BACKEND_URL/v1/auth/login" 2>>"$LOG_FILE")"
LOGIN_BODY="$(cat /tmp/authprobe-login.$$ 2>/dev/null || true)"
rm -f /tmp/authprobe-login.$$

if [[ "$LOGIN_HTTP" != "200" ]]; then
  fail_probe "login_http_${LOGIN_HTTP}"
fi

ACCESS_TOKEN="$(printf '%s' "$LOGIN_BODY" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')"
REFRESH_TOKEN="$(printf '%s' "$LOGIN_BODY" | sed -n 's/.*"refresh_token":"\([^"]*\)".*/\1/p')"
if [[ -z "$ACCESS_TOKEN" || -z "$REFRESH_TOKEN" ]]; then
  fail_probe "login_response_missing_tokens"
fi
log "LOGIN_OK"

# ─── Tahap 2: /auth/me dengan access token ──────────────────────────────────
ME1_HTTP="$(curl --silent --show-error --max-time 30 -o /dev/null -w '%{http_code}' \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  "$BACKEND_URL/v1/auth/me" 2>>"$LOG_FILE")"
if [[ "$ME1_HTTP" != "200" ]]; then
  fail_probe "me_http_${ME1_HTTP}"
fi
log "ME_OK"

# ─── Tahap 3: Prefetch RSC lewat middleware web (simulasi klik menu) ────────
PREFETCH_HTTP="$(curl --silent --show-error --max-time 30 -o /dev/null -w '%{http_code}' \
  -H "Cookie: lazisnu_token=$ACCESS_TOKEN" \
  "$DASHBOARD_URL/dashboard/reports?_rsc=auth-probe" 2>>"$LOG_FILE")"
if [[ "$PREFETCH_HTTP" == "307" || "$PREFETCH_HTTP" == "302" ]]; then
  fail_probe "prefetch_redirect_${PREFETCH_HTTP}"
fi
log "PREFETCH_OK http=$PREFETCH_HTTP"

# ─── Tahap 4: Tunggu hingga access token kedaluwarsa (TTL 15 menit) ────────
log "WAIT start=${REFRESH_WAIT_SECONDS}s"
sleep "$REFRESH_WAIT_SECONDS"
log "WAIT done"

# ─── Tahap 5: /auth/me dengan token lama (harapan: 401 = token expired) ────
ME2_HTTP="$(curl --silent --show-error --max-time 30 -o /dev/null -w '%{http_code}' \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  "$BACKEND_URL/v1/auth/me" 2>>"$LOG_FILE")"
if [[ "$ME2_HTTP" == "200" ]]; then
  log "ME2_STILL_VALID http=200 (token belum kedaluwarsa — lanjut uji refresh)"
else
  log "ME2_EXPECTED_401 http=$ME2_HTTP"
fi

# ─── Tahap 6: Refresh token (uji inti: sesi tidak boleh di-revoke) ─────────
REFRESH_HTTP="$(curl --silent --show-error --max-time 30 -o /tmp/authprobe-refresh.$$ -w '%{http_code}' \
  -H 'Content-Type: application/json' \
  --data "{\"refresh_token\":\"$REFRESH_TOKEN\",\"device_id\":\"$PROBE_DEVICE_ID\"}" \
  "$BACKEND_URL/v1/auth/refresh" 2>>"$LOG_FILE")"
REFRESH_BODY="$(cat /tmp/authprobe-refresh.$$ 2>/dev/null || true)"
rm -f /tmp/authprobe-refresh.$$

if [[ "$REFRESH_HTTP" != "200" ]]; then
  fail_probe "refresh_http_${REFRESH_HTTP}"
fi
NEW_ACCESS_TOKEN="$(printf '%s' "$REFRESH_BODY" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')"
if [[ -z "$NEW_ACCESS_TOKEN" ]]; then
  fail_probe "refresh_response_missing_access_token"
fi
log "REFRESH_OK"

# ─── Tahap 7: /auth/me dengan token baru ────────────────────────────────────
ME3_HTTP="$(curl --silent --show-error --max-time 30 -o /dev/null -w '%{http_code}' \
  -H "Authorization: Bearer $NEW_ACCESS_TOKEN" \
  "$BACKEND_URL/v1/auth/me" 2>>"$LOG_FILE")"
if [[ "$ME3_HTTP" != "200" ]]; then
  fail_probe "me_after_refresh_http_${ME3_HTTP}"
fi
log "ME_AFTER_REFRESH_OK"

# ─── Sukses: kirim pemulihan jika sebelumnya ada alert, lalu bersihkan ─────
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
