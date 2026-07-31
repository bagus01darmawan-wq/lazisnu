#!/bin/bash
set -eo pipefail

# ============================================
# Lazisnu Database Backup Script
# ============================================
# Backup berjalan hanya jika file flag ada:
#   /opt/lazisnu/backup-active
#
# Untuk mengaktifkan:  touch /opt/lazisnu/backup-active
# Untuk menonaktifkan: rm /opt/lazisnu/backup-active
#
# Dijalankan oleh cron setiap hari jam 02:00 WIB
#
# Prasyarat VM:
#   1. apt install -y postgresql-client-17 awscli
#   2. File /opt/lazisnu/.env.backup berisi DATABASE_URL, DIRECT_URL, R2_*
# ============================================

# Load credentials dari file env
set -a; . /opt/lazisnu/.env.backup; set +a

FLAG_FILE="/opt/lazisnu/backup-data/active"
BACKUP_DIR="/opt/lazisnu/backups"
LOG_FILE="$BACKUP_DIR/backup.log"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/lazisnu_$TIMESTAMP.sql.gz"
# Retention: 90 hari (compliance audit, revisi RENCANA-CLEANUP Phase 4)
KEEP_DAYS=90

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Check if backup is active
if [ ! -f "$FLAG_FILE" ]; then
  log "SKIPPED: backup flag not active"
  exit 0
fi

log "START backup"
mkdir -p "$BACKUP_DIR"

# Dump menggunakan DIRECT_URL (session pooler, port 5432)
# pg_dump versi 17 diperlukan karena Supabase PG 17.x
log "Dumping database..."
/usr/lib/postgresql/17/bin/pg_dump \
  --schema=public \
  --no-owner \
  --no-acl \
  --clean \
  --if-exists \
  "$DIRECT_URL" 2>> "$LOG_FILE" | gzip > "$BACKUP_FILE"

SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
log "Dump created: $BACKUP_FILE ($SIZE)"

# Upload to Cloudflare R2
if [ -n "$R2_ACCOUNT_ID" ] && [ -n "$R2_BUCKET_NAME" ]; then
  log "Uploading to R2..."
  aws s3 cp "$BACKUP_FILE" \
    "s3://$R2_BUCKET_NAME/backups/lazisnu_$TIMESTAMP.sql.gz" \
    --endpoint-url "https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com" \
    2>> "$LOG_FILE"
  log "Upload to R2 complete"
else
  log "WARNING: R2 credentials not set, skipping upload"
fi

# --- Cleanup ---
# Hapus file backup placeholder (dump gagal <1KB, dari test sebelum fix --schema=public)
find "$BACKUP_DIR" -name "*.sql.gz" -size -1k -mmin +60 -delete

# Retention policy (90 hari — RENCANA-CLEANUP Phase 4):
# File > 90 hari: ARCHIVE dulu ke R2 (bucket yang sama, prefix archive/), baru hapus lokal.
# Pakai aws s3 (rclone tidak terinstall di VM).
if [ -n "$R2_ACCOUNT_ID" ] && [ -n "$R2_BUCKET_NAME" ]; then
  find "$BACKUP_DIR" -name "*.sql.gz" -mtime +$KEEP_DAYS -print0 | while IFS= read -r -d '' f; do
    ARCHIVE_KEY="archive/$(basename "$f")"
    echo "Archiving to R2: $f -> $ARCHIVE_KEY"
    if aws s3 cp "$f" "s3://$R2_BUCKET_NAME/$ARCHIVE_KEY" \
        --endpoint-url "https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com" \
        >> "$LOG_FILE" 2>&1; then
      rm -f "$f"
      echo "  -> archived & local removed"
    else
      echo "  -> R2 upload FAILED, keep local"
    fi
  done
else
  # Fallback: hapus lokal langsung jika R2 creds tidak tersedia
  find "$BACKUP_DIR" -name "*.sql.gz" -mtime +$KEEP_DAYS -delete
fi

echo "$(date -Iseconds) Cleanup: placeholder + retention (${KEEP_DAYS}d + R2 archive) done" >> "$LOG_FILE"

log "DONE"
