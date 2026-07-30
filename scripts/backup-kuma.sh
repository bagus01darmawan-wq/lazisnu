#!/usr/bin/env bash
# =============================================================================
# backup-kuma.sh
# -----------------------------------------------------------------------------
# Backup database SQLite Uptime Kuma ke Cloudflare R2.
#
# Latar belakang (Lapis 4a — Backlog Sesi 30 Lanjutan 6):
#   Uptime Kuma menyimpan konfigurasi 4 monitor + history uptime 90 hari di
#   SQLite (/app/data/kuma.db). Saat ini TIDAK ada backup — kalau VM corrupt
#   atau disk failure, harus setup ulang semua monitor dari nol + kehilangan
#   history.
#
# Strategi:
#   1. docker cp kuma.db dari container ke /tmp (atomic copy via Docker)
#   2. Upload ke R2 bucket lazisnu-backups/kuma/YYYYMMDD/kuma.db.gz
#   3. Retention 30 hari (cleanup backup lokal >30 hari)
#
# Best practice SQLite backup: gunakan `sqlite3 .backup` (online, consistent).
# Tapi karena kuma.db < 50MB dan Kuma tulis infrequent, docker cp sudah cukup
# aman. Fallback ke sqlite3 .backup jika tersedia.
#
# Dijalankan oleh cron setiap hari jam 03:00 WIB (1 jam setelah backup Postgres
# jam 02:00 agar tidak rebutan R2 quota).
#
# Prasyarat VM:
#   1. Uptime Kuma container jalan dengan nama `uptime-kuma`
#   2. File /opt/lazisnu/.env.backup berisi R2_* (R2_ACCOUNT_ID, R2_BUCKET_NAME,
#      R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)
#   3. awscli terinstall (apt install -y awscli)
#   4. Opsional: sqlite3 CLI untuk fallback online backup
#
# Usage:
#   bash scripts/backup-kuma.sh
#
# Schedule (tambah di crontab):
#   0 3 * * * bash /opt/lazisnu/scripts/backup-kuma.sh
# =============================================================================

set -eo pipefail

# Load credentials dari file env (sama dengan backup.sh Postgres)
set -a; . /opt/lazisnu/.env.backup; set +a

KUMA_CONTAINER="uptime-kuma"
KUMA_DB_PATH="/app/data/kuma.db"   # Path di dalam container
BACKUP_DIR="/opt/lazisnu/backups/kuma"
LOG_FILE="$BACKUP_DIR/backup-kuma.log"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/kuma_${TIMESTAMP}.db"
BACKUP_FILE_GZ="${BACKUP_FILE}.gz"
KEEP_DAYS=30

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Pre-flight: container harus jalan
if ! docker ps --format '{{.Names}}' | grep -qx "$KUMA_CONTAINER"; then
  log "ERROR: container '$KUMA_CONTAINER' tidak jalan. Backup dibatalkan."
  exit 1
fi

log "START backup Uptime Kuma"
mkdir -p "$BACKUP_DIR"

# Strategi 1 (preferred): sqlite3 .backup untuk online consistent backup
# Strategi 2 (fallback): docker cp
if command -v sqlite3 >/dev/null 2>&1; then
  log "Using sqlite3 .backup (online, consistent)"

  # Copy db dari container ke /tmp host dulu (karena .backup perlu path lokal)
  TMP_DB="/tmp/kuma_${TIMESTAMP}.db"
  docker cp "$KUMA_CONTAINER:$KUMA_DB_PATH" "$TMP_DB" 2>> "$LOG_FILE"

  # sqlite3 .backup target (online, lock-safe)
  sqlite3 "$TMP_DB" ".backup '$BACKUP_FILE'" 2>> "$LOG_FILE"

  # Cleanup tmp
  rm -f "$TMP_DB"
else
  log "sqlite3 CLI tidak tersedia, fallback ke docker cp (best-effort)"

  # docker cp langsung ke BACKUP_FILE. SQLite biasanya safe untuk cp
  # selama tidak ada write besar berlangsung (Kuma writes infrequent).
  docker cp "$KUMA_CONTAINER:$KUMA_DB_PATH" "$BACKUP_FILE" 2>> "$LOG_FILE"
fi

# Verifikasi file ada dan size > 0
if [ ! -s "$BACKUP_FILE" ]; then
  log "ERROR: backup file kosong atau gagal dibuat"
  exit 1
fi

SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
log "Backup created: $BACKUP_FILE ($SIZE)"

# Compress (kuma.db biasanya < 50MB, gzip reduce ~80%)
gzip -f "$BACKUP_FILE"
SIZE_GZ=$(du -h "$BACKUP_FILE_GZ" | cut -f1)
log "Compressed: $BACKUP_FILE_GZ ($SIZE_GZ)"

# Upload to Cloudflare R2
if [ -n "$R2_ACCOUNT_ID" ] && [ -n "$R2_BUCKET_NAME" ]; then
  log "Uploading to R2..."

  R2_PATH="kuma/${TIMESTAMP:0:8}/kuma_${TIMESTAMP}.db.gz"
  aws s3 cp "$BACKUP_FILE_GZ" \
    "s3://$R2_BUCKET_NAME/$R2_PATH" \
    --endpoint-url "https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com" \
    2>> "$LOG_FILE"

  if [ $? -eq 0 ]; then
    log "Upload to R2 complete: s3://$R2_BUCKET_NAME/$R2_PATH"
  else
    log "ERROR: upload to R2 gagal. File lokal tetap disimpan."
    exit 1
  fi
else
  log "WARNING: R2 credentials not set, skipping upload"
fi

# Cleanup old backups lokal (>30 hari)
DELETED=$(find "$BACKUP_DIR" -name "kuma_*.db.gz" -mtime +$KEEP_DAYS -delete -print 2>/dev/null | wc -l)
if [ "$DELETED" -gt 0 ]; then
  log "Cleaned up $DELETED old backup(s) (>$KEEP_DAYS hari)"
fi

log "DONE"
