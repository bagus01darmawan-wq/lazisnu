#!/bin/bash
set -euo pipefail

# Verify the latest successful backup marker and its R2 object.
# This must run independently from the backup cron job.

ENV_FILE="${BACKUP_ENV_FILE:-/opt/lazisnu/.env.backup}"
if [[ ! -r "$ENV_FILE" ]]; then
  printf 'Backup healthcheck failed: env file is not readable: %s\n' "$ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
set -u

FLAG_FILE="${BACKUP_FLAG_FILE:-/opt/lazisnu/backup-data/active}"
BACKUP_DIR="${BACKUP_DIR:-/opt/lazisnu/backups}"
LOG_FILE="${BACKUP_HEALTH_LOG_FILE:-$BACKUP_DIR/backup-health.log}"
ALERT_STATE_FILE="${BACKUP_ALERT_STATE_FILE:-$BACKUP_DIR/.backup-health-alert}"
STATUS_KEY="${R2_STATUS_KEY:-backup-status/lazisnu-latest.json}"
MAX_AGE_HOURS="${BACKUP_MAX_AGE_HOURS:-26}"
ALERT_WEBHOOK_URL="${BACKUP_ALERT_WEBHOOK_URL:-}"
R2_PREFIX="${BACKUP_R2_PREFIX:-backups}"

export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-${R2_ACCESS_KEY_ID:-}}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-${R2_SECRET_ACCESS_KEY:-}}"

mkdir -p "$BACKUP_DIR"

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

  payload="$(printf '{\"content\":\"[Lazisnu] Backup alert: %s\"}' "$reason")"
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

fail_health() {
  local reason="$1"
  local previous_reason=""

  log "FAILURE reason=$reason"
  if command -v logger >/dev/null 2>&1; then
    logger -t lazisnu-backup-health -p daemon.err -- "FAILURE reason=$reason" || true
  fi
  if [[ -f "$ALERT_STATE_FILE" ]]; then
    previous_reason="$(cat "$ALERT_STATE_FILE")"
  fi

  if [[ "$previous_reason" != "$reason" ]]; then
    if send_alert "$reason"; then
      printf '%s\n' "$reason" > "$ALERT_STATE_FILE"
    fi
  fi
  exit 1
}

if [[ ! -f "$FLAG_FILE" ]]; then
  log "SKIPPED: backup flag not active"
  exit 0
fi

for required_var in R2_ACCOUNT_ID R2_BUCKET_NAME AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY; do
  [[ -n "${!required_var:-}" ]] || fail_health "missing_${required_var}"
done

[[ "$MAX_AGE_HOURS" =~ ^[0-9]+$ ]] || fail_health "invalid_max_age_hours"
command -v aws >/dev/null 2>&1 || fail_health "missing_command_aws"
command -v date >/dev/null 2>&1 || fail_health "missing_command_date"
if [[ -n "$ALERT_WEBHOOK_URL" ]]; then
  command -v curl >/dev/null 2>&1 || fail_health "missing_command_curl"
fi

R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
STATUS_URI="s3://$R2_BUCKET_NAME/$STATUS_KEY"

if ! STATUS_JSON="$(aws s3 cp "$STATUS_URI" - \
  --endpoint-url "$R2_ENDPOINT" \
  --only-show-errors 2>>"$LOG_FILE")"; then
  fail_health "status_marker_unavailable"
fi

if ! printf '%s' "$STATUS_JSON" | grep -q '"status":"success"'; then
  fail_health "status_marker_not_success"
fi

BACKUP_KEY="$(printf '%s' "$STATUS_JSON" | sed -n 's/.*"backup_key":"\([^"]*\)".*/\1/p')"
BACKUP_SIZE="$(printf '%s' "$STATUS_JSON" | sed -n 's/.*"size_bytes":\([0-9][0-9]*\).*/\1/p')"
COMPLETED_EPOCH="$(printf '%s' "$STATUS_JSON" | sed -n 's/.*"completed_at_epoch":\([0-9][0-9]*\).*/\1/p')"

[[ "$BACKUP_KEY" == "$R2_PREFIX"/*.sql.gz ]] || fail_health "invalid_backup_key"
[[ "$BACKUP_SIZE" =~ ^[0-9]+$ ]] || fail_health "invalid_backup_size"

if ! REMOTE_SIZE="$(aws s3api head-object \
  --bucket "$R2_BUCKET_NAME" \
  --key "$BACKUP_KEY" \
  --endpoint-url "$R2_ENDPOINT" \
  --query ContentLength \
  --output text 2>>"$LOG_FILE")"; then
  fail_health "backup_object_unavailable"
fi
if [[ "$REMOTE_SIZE" != "$BACKUP_SIZE" ]]; then
  fail_health "backup_size_mismatch"
fi

if [[ "$COMPLETED_EPOCH" =~ ^[0-9]+$ ]]; then
  LAST_SUCCESS_EPOCH="$COMPLETED_EPOCH"
else
  if ! MARKER_LAST_MODIFIED="$(aws s3api head-object \
    --bucket "$R2_BUCKET_NAME" \
    --key "$STATUS_KEY" \
    --endpoint-url "$R2_ENDPOINT" \
    --query LastModified \
    --output text 2>>"$LOG_FILE")"; then
    fail_health "marker_timestamp_unavailable"
  fi
  if ! LAST_SUCCESS_EPOCH="$(date -d "$MARKER_LAST_MODIFIED" +%s 2>>"$LOG_FILE")"; then
    fail_health "marker_timestamp_invalid"
  fi
fi

NOW_EPOCH="$(date +%s)"
AGE_SECONDS=$((NOW_EPOCH - LAST_SUCCESS_EPOCH))
MAX_AGE_SECONDS=$((MAX_AGE_HOURS * 3600))
if (( AGE_SECONDS < 0 )); then
  fail_health "marker_timestamp_in_future"
fi
if (( AGE_SECONDS > MAX_AGE_SECONDS )); then
  fail_health "last_success_age_${AGE_SECONDS}s_over_${MAX_AGE_SECONDS}s"
fi

rm -f "$ALERT_STATE_FILE"
log "SUCCESS key=$BACKUP_KEY size_bytes=$REMOTE_SIZE age_seconds=$AGE_SECONDS"
exit 0
