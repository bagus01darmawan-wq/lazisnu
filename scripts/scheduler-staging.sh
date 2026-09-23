#!/usr/bin/env bash
# Robot staging: prepare-draft (tgl 10 & 20) + sapu notifikasi (harian 07:00).
# Dijalankan cron sebagai root (lihat /etc/cron.d/lazisnu-scheduler-staging).
# Kunci internal: /opt/lazisnu/secrets/env.scheduler-staging (root, 0600):
#   INTERNAL_API_KEY=<isi dari container backend-staging, jangan commit>
set -u

MODE="${1:?pakai: prepare | sweep}"
SECRET_FILE="${SCHEDULER_ENV_FILE:-/opt/lazisnu/secrets/env.scheduler-staging}"
LOG_FILE="${SCHEDULER_LOG_FILE:-/var/log/lazisnu-scheduler-staging.log}"
BASE="${SCHEDULER_BASE_URL:-https://staging-api.lazisnu.site}"

if [ -f "$SECRET_FILE" ]; then
  # shellcheck disable=SC1090
  set -a; . "$SECRET_FILE"; set +a
fi
KEY="${INTERNAL_API_KEY:?INTERNAL_API_KEY kosong (cek $SECRET_FILE)}"
YEAR=$(date +%Y)
MONTH=$(date +%-m)

if [ "$MODE" = "prepare" ]; then EP="prepare-draft"; else EP="notifikasi-sapu"; fi

RESP=$(curl -s --max-time 90 -X POST "$BASE/v1/scheduler/$EP" \
  -H "Content-Type: application/json" \
  -H "x-internal-api-key: $KEY" \
  -d "{\"year\":$YEAR,\"month\":$MONTH}" 2>&1) || RESP="CURL_FAIL"
CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$BASE/health" 2>&1) || CODE="?"

printf '%s mode=%s period=%s-%s health=%s resp=%s\n' \
  "$(date '+%F %T %Z')" "$MODE" "$YEAR" "$MONTH" "$CODE" "$(printf '%s' "$RESP" | head -c 500)" \
  >> "$LOG_FILE" 2>/dev/null || true
printf '%s\n' "$RESP"
