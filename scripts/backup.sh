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
KEEP_DAYS=30

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

# Cleanup old backups (>30 days)
DELETED=$(find "$BACKUP_DIR" -name "*.sql.gz" -mtime +$KEEP_DAYS -delete -print | wc -l)
if [ "$DELETED" -gt 0 ]; then
  log "Cleaned up $DELETED old backup(s)"
fi

log "DONE"
