#!/usr/bin/env bash
# Penyapu berkas sementara R2 — label QR kaleng (prefix `qr-pdfs/`).
# Memanggil POST /v1/scheduler/cleanup-qr-pdfs (dijaga x-internal-api-key).
#
# Kenapa ada: `qrPdfService` dulu mengunggah dengan key bertimestamp
# (`...-{Date.now()}.pdf`) dan tidak pernah menghapus, tidak ada cron → bucket R2
# menumpuk selamanya (temuan 23 Sep 2026). Key sudah dibuat deterministik supaya
# generate ulang menimpa; skrip ini membereskan sisa lama.
#
# Pemakaian:
#   bash cleanup-qr-pdfs.sh              # jalankan, retensi bawaan server (7 hari)
#   bash cleanup-qr-pdfs.sh dry          # uji coba: laporkan saja, tidak menghapus
#   RETENTION_DAYS=30 bash cleanup-qr-pdfs.sh
#
# Env:
#   ENVIRONMENT          production (bawaan) | staging
#   SCHEDULER_BASE_URL   override penuh (menang atas ENVIRONMENT)
#   SCHEDULER_ENV_FILE   berkas rahasia berisi INTERNAL_API_KEY= (root, 0600)
#   RETENTION_DAYS       opsional; kalau kosong diserahkan ke bawaan server
#   SCHEDULER_LOG_FILE   default /var/log/lazisnu-cleanup-qr.log
#
# ⚠️ Hanya menyentuh `qr-pdfs/`. `ba-pdfs/` = arsip hukum — TIDAK PERNAH dihapus.
set -u

MODE="${1:-run}"
ENVIRONMENT="${ENVIRONMENT:-production}"

case "$ENVIRONMENT" in
  staging)
    DEFAULT_BASE="https://staging-api.lazisnu.site"
    DEFAULT_SECRET="/opt/lazisnu/secrets/env.scheduler-staging"
    ;;
  *)
    DEFAULT_BASE="https://api.lazisnu.site"
    DEFAULT_SECRET="/opt/lazisnu/secrets/env.scheduler"
    ;;
esac

SECRET_FILE="${SCHEDULER_ENV_FILE:-$DEFAULT_SECRET}"
BASE="${SCHEDULER_BASE_URL:-$DEFAULT_BASE}"
LOG_FILE="${SCHEDULER_LOG_FILE:-/var/log/lazisnu-cleanup-qr.log}"

if [ -f "$SECRET_FILE" ]; then
  # shellcheck disable=SC1090
  set -a; . "$SECRET_FILE"; set +a
fi
KEY="${INTERNAL_API_KEY:?INTERNAL_API_KEY kosong (cek $SECRET_FILE)}"

if [ "$MODE" = "dry" ]; then
  PAYLOAD='{"dry_run":true}'
elif [ -n "${RETENTION_DAYS:-}" ]; then
  PAYLOAD="{\"retention_days\":${RETENTION_DAYS}}"
else
  PAYLOAD='{}'
fi

RESP=$(curl -s --max-time 300 -X POST "$BASE/v1/scheduler/cleanup-qr-pdfs" \
  -H "Content-Type: application/json" \
  -H "x-internal-api-key: $KEY" \
  -d "$PAYLOAD" 2>&1) || RESP="CURL_FAIL"

printf '%s env=%s mode=%s retention=%s resp=%s\n' \
  "$(date '+%F %T %Z')" "$ENVIRONMENT" "$MODE" "${RETENTION_DAYS:-default}" \
  "$(printf '%s' "$RESP" | head -c 500)" \
  >> "$LOG_FILE" 2>/dev/null || true

printf '%s\n' "$RESP"
