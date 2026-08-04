#!/bin/bash
set -eo pipefail

# Lazisnu database backup: Supabase public schema to Cloudflare R2.
# The script exits non-zero on any failed dump, validation, upload, or verify step.

ENV_FILE="${BACKUP_ENV_FILE:-/opt/lazisnu/.env.backup}"
if [[ ! -r "$ENV_FILE" ]]; then
  printf 'Backup failed: env file is not readable: %s\n' "$ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
set -u

FLAG_FILE="${BACKUP_FLAG_FILE:-/opt/lazisnu/backup-data/active}"
BACKUP_DIR="${BACKUP_DIR:-/opt/lazisnu/backups}"
LOG_FILE="${BACKUP_LOG_FILE:-$BACKUP_DIR/backup.log}"
LOCK_FILE="${BACKUP_LOCK_FILE:-$BACKUP_DIR/.backup.lock}"
PG_DUMP_BIN="${PG_DUMP_BIN:-/usr/lib/postgresql/17/bin/pg_dump}"
DUMP_TIMEOUT="${BACKUP_DUMP_TIMEOUT:-15m}"
MIN_FREE_MB="${BACKUP_MIN_FREE_MB:-1024}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-90}"
R2_STATUS_KEY="${R2_STATUS_KEY:-backup-status/lazisnu-latest.json}"

# Allow the env file to use either R2_* or standard AWS credential names.
export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-${R2_ACCESS_KEY_ID:-}}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-${R2_SECRET_ACCESS_KEY:-}}"

STAGE="initialization"
FAILURE_REASON="unknown"
BACKUP_SUCCESS=0
TEMP_FILE=""
STATUS_FILE=""

mkdir -p "$BACKUP_DIR"

log() {
  local message="$1"
  local line
  line="[$(date '+%Y-%m-%d %H:%M:%S')] $message"
  printf '%s\n' "$line" >> "$LOG_FILE"
  printf '%s\n' "$line" 2>/dev/null || true
}

on_exit() {
  local rc=$?

  if [[ "$rc" -ne 0 && "${BACKUP_SUCCESS:-0}" -ne 1 ]]; then
    printf '[%s] FAILURE stage=%s reason=%s exit_code=%s\n' \
      "$(date '+%Y-%m-%d %H:%M:%S')" \
      "${STAGE:-unknown}" \
      "${FAILURE_REASON:-unknown}" \
      "$rc" >> "$LOG_FILE" 2>/dev/null || true
  fi

  [[ -z "${TEMP_FILE:-}" ]] || rm -f "$TEMP_FILE" 2>/dev/null || true
  [[ -z "${STATUS_FILE:-}" ]] || rm -f "$STATUS_FILE" 2>/dev/null || true
}
trap on_exit EXIT

fail() {
  STAGE="$1"
  FAILURE_REASON="$2"
  exit 1
}

require_command() {
  local command_name="$1"
  command -v "$command_name" >/dev/null 2>&1 || fail "preflight" "missing_command_$command_name"
}

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log "SKIPPED: another backup is running"
  exit 0
fi

if [[ ! -f "$FLAG_FILE" ]]; then
  log "SKIPPED: backup flag not active"
  exit 0
fi

STAGE="preflight"
for required_var in DIRECT_URL R2_ACCOUNT_ID R2_BUCKET_NAME AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY; do
  [[ -n "${!required_var:-}" ]] || fail "$STAGE" "missing_${required_var}"
done

for required_command in aws df flock gzip sha256sum stat timeout; do
  require_command "$required_command"
done

[[ -x "$PG_DUMP_BIN" ]] || fail "$STAGE" "pg_dump_not_executable"
[[ "$MIN_FREE_MB" =~ ^[0-9]+$ ]] || fail "$STAGE" "invalid_min_free_mb"
[[ "$KEEP_DAYS" =~ ^[0-9]+$ ]] || fail "$STAGE" "invalid_keep_days"

AVAILABLE_KB="$(df -Pk "$BACKUP_DIR" | awk 'NR == 2 { print $4 }')"
[[ "$AVAILABLE_KB" =~ ^[0-9]+$ ]] || fail "$STAGE" "cannot_read_free_space"
AVAILABLE_MB=$((AVAILABLE_KB / 1024))
if (( AVAILABLE_MB < MIN_FREE_MB )); then
  fail "$STAGE" "free_space_${AVAILABLE_MB}MB_below_${MIN_FREE_MB}MB"
fi

R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/lazisnu_${TIMESTAMP}.sql.gz"
TEMP_FILE="$BACKUP_FILE.part"
R2_KEY="backups/$(basename "$BACKUP_FILE")"

log "START backup timestamp=$TIMESTAMP free_before=${AVAILABLE_MB}MB"

STAGE="dump"
log "Dumping database with timeout=$DUMP_TIMEOUT..."
if ! timeout --foreground "$DUMP_TIMEOUT" "$PG_DUMP_BIN" \
  --schema=public \
  --no-owner \
  --no-acl \
  --clean \
  --if-exists \
  "$DIRECT_URL" 2>>"$LOG_FILE" | gzip -c >"$TEMP_FILE" 2>>"$LOG_FILE"; then
  fail "$STAGE" "pg_dump_failed_or_timed_out"
fi

STAGE="validate"
if [[ ! -s "$TEMP_FILE" ]]; then
  fail "$STAGE" "empty_dump"
fi
if ! gzip -t "$TEMP_FILE" 2>>"$LOG_FILE"; then
  fail "$STAGE" "invalid_gzip"
fi

mv "$TEMP_FILE" "$BACKUP_FILE"
TEMP_FILE=""
SIZE_BYTES="$(stat -c '%s' "$BACKUP_FILE")"
SIZE_HUMAN="$(du -h "$BACKUP_FILE" | awk '{ print $1 }')"
LOCAL_SHA256="$(sha256sum "$BACKUP_FILE" | awk '{ print $1 }')"
log "Dump valid file=$BACKUP_FILE size=$SIZE_HUMAN sha256=$LOCAL_SHA256"

STAGE="upload"
log "Uploading to R2 key=$R2_KEY..."
if ! aws s3 cp "$BACKUP_FILE" "s3://$R2_BUCKET_NAME/$R2_KEY" \
  --endpoint-url "$R2_ENDPOINT" \
  --only-show-errors >>"$LOG_FILE" 2>&1; then
  fail "$STAGE" "r2_upload_failed"
fi

STAGE="verify_upload"
if ! REMOTE_SIZE="$(aws s3api head-object \
  --bucket "$R2_BUCKET_NAME" \
  --key "$R2_KEY" \
  --endpoint-url "$R2_ENDPOINT" \
  --query ContentLength \
  --output text 2>>"$LOG_FILE")"; then
  fail "$STAGE" "r2_object_not_found"
fi
if [[ "$REMOTE_SIZE" != "$SIZE_BYTES" ]]; then
  fail "$STAGE" "r2_size_${REMOTE_SIZE}_expected_${SIZE_BYTES}"
fi
log "R2 object verified key=$R2_KEY size_bytes=$REMOTE_SIZE"

STAGE="write_status"
STATUS_FILE="$(mktemp "${TMPDIR:-/tmp}/lazisnu-backup-status.XXXXXX.json")"
COMPLETED_AT="$(date -Iseconds)"
COMPLETED_EPOCH="$(date +%s)"
printf '{"status":"success","backup_key":"%s","completed_at":"%s","completed_at_epoch":%s,"size_bytes":%s,"sha256":"%s"}\n' \
  "$R2_KEY" "$COMPLETED_AT" "$COMPLETED_EPOCH" "$SIZE_BYTES" "$LOCAL_SHA256" > "$STATUS_FILE"

if ! aws s3 cp "$STATUS_FILE" "s3://$R2_BUCKET_NAME/$R2_STATUS_KEY" \
  --endpoint-url "$R2_ENDPOINT" \
  --content-type application/json \
  --cache-control no-cache \
  --only-show-errors >>"$LOG_FILE" 2>&1; then
  fail "$STAGE" "status_marker_upload_failed"
fi

STATUS_SIZE="$(stat -c '%s' "$STATUS_FILE")"
if ! STATUS_REMOTE_SIZE="$(aws s3api head-object \
  --bucket "$R2_BUCKET_NAME" \
  --key "$R2_STATUS_KEY" \
  --endpoint-url "$R2_ENDPOINT" \
  --query ContentLength \
  --output text 2>>"$LOG_FILE")"; then
  fail "$STAGE" "status_marker_not_found"
fi
if [[ "$STATUS_REMOTE_SIZE" != "$STATUS_SIZE" ]]; then
  fail "$STAGE" "status_marker_size_mismatch"
fi
log "Success marker verified key=$R2_STATUS_KEY"

STAGE="cleanup"
if ! find "$BACKUP_DIR" -name "*.sql.gz" -size -1k -mmin +60 -delete; then
  log "WARNING: placeholder cleanup failed"
fi

# Retain the existing 90-day local policy and archive old local dumps to R2 first.
while IFS= read -r -d '' file; do
  ARCHIVE_KEY="archive/$(basename "$file")"
  if aws s3 cp "$file" "s3://$R2_BUCKET_NAME/$ARCHIVE_KEY" \
    --endpoint-url "$R2_ENDPOINT" \
    --only-show-errors >>"$LOG_FILE" 2>&1; then
    if rm -f "$file"; then
      log "Archived old backup file=$file key=$ARCHIVE_KEY"
    else
      log "WARNING: archive uploaded but local removal failed file=$file"
    fi
  else
    log "WARNING: archive upload failed; local file kept file=$file"
  fi
done < <(find "$BACKUP_DIR" -name "lazisnu_*.sql.gz" -mtime +"$KEEP_DAYS" -print0)

AFTER_KB="$(df -Pk "$BACKUP_DIR" | awk 'NR == 2 { print $4 }')"
AFTER_MB=$((AFTER_KB / 1024))
log "Cleanup complete retention=${KEEP_DAYS}d free_after=${AFTER_MB}MB"

BACKUP_SUCCESS=1
log "SUCCESS backup=$BACKUP_FILE r2_key=$R2_KEY size_bytes=$SIZE_BYTES"
exit 0
