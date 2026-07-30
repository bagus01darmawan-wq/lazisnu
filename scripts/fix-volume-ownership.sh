#!/usr/bin/env bash
# =============================================================================
# fix-volume-ownership.sh
# -----------------------------------------------------------------------------
# Chown volume mount-point ke UID:GID default container, untuk menghindari
# permission error saat container di-restart.
#
# Root cause:
#   Sesi 31 menjalankan `chown -R ubuntu:ubuntu /opt/lazisnu` saat fix Redis
#   MISCONF. Efek samping: SEMUA sub-directory (termasuk volume mount-point)
#   di-chown ke ubuntu. Saat container restart, default user container (mis.
#   nobody 65534 untuk prometheus) tidak bisa write ke volume.
#
#   Saat itu hanya redis-data yang kelihatan efeknya. Sesi 30 (Lanjutan 3)
#   menemukan efek yang sama untuk prometheus-data dan grafana-data.
#   postgres-data dan minio-data latent risk — baru akan muncul saat
#   container restart berikutnya.
#
# Usage:
#   ./scripts/fix-volume-ownership.sh           # apply fix
#   ./scripts/fix-volume-ownership.sh --dry-run  # tampilkan tanpa eksekusi
#   ./scripts/fix-volume-ownership.sh --help     # bantuan
#
# Idempotent: aman run berkali-kali. Hanya chown file yang mismatch.
# =============================================================================

set -e

# --- konfigurasi ---
# Base directory volume (default: /opt/lazisnu, override via BASE_DIR env)
BASE_DIR="${BASE_DIR:-/opt/lazisnu}"

# Mapping volume -> UID:GID default container.
# Sesuaikan jika Docker image berubah.
#
# backup-data TIDAK termasuk di sini — folder ini ditulis oleh:
#   1. Host backup script (jalan sebagai ubuntu, uid 1000)
#   2. Container backend (mount sebagai root)
# Tidak perlu strict ownership tertentu — biarkan natural host user.
declare -A VOLUMES=(
  ["redis-data"]="999:999"          # redis:7-alpine (redis user)
  ["prometheus-data"]="65534:65534" # prom/prometheus (nobody)
  ["grafana-data"]="472:472"        # grafana/grafana (grafana user)
  ["postgres-data"]="999:999"       # postgres:15-alpine (postgres user)
  ["minio-data"]="999:999"          # minio/minio (minio user, jika ada)
  ["nginx-data"]="101:101"          # nginx:alpine (nginx user, jika ada)
)

# --- argumen parsing ---
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run|-n) DRY_RUN=1 ;;
    --help|-h)
      sed -n '2,30p' "$0"
      exit 0
      ;;
    *) echo "Unknown arg: $arg. Use --help."; exit 1 ;;
  esac
done

# --- main ---
echo "============================================"
echo " Fix Volume Ownership"
echo " Base dir: $BASE_DIR"
echo " Mode: $([ $DRY_RUN -eq 1 ] && echo 'DRY-RUN' || echo 'APPLY')"
echo "============================================"
echo ""

CHANGED=0
UNCHANGED=0
SKIPPED=0
ERRORS=0

for vol in "${!VOLUMES[@]}"; do
  owner="${VOLUMES[$vol]}"
  path="$BASE_DIR/$vol"

  if [ ! -d "$path" ]; then
    printf "  SKIP  %-20s (directory tidak ada)\n" "$vol"
    SKIPPED=$((SKIPPED+1))
    continue
  fi

  # Cek owner saat ini
  current_owner=$(stat -c '%u:%g' "$path")

  if [ "$current_owner" = "$owner" ]; then
    printf "  OK    %-20s (sudah %s)\n" "$vol" "$owner"
    UNCHANGED=$((UNCHANGED+1))
    continue
  fi

  # Mismatch — perlu chown
  if [ $DRY_RUN -eq 1 ]; then
    printf "  WOULD %-20s %s -> %s\n" "$vol" "$current_owner" "$owner"
    CHANGED=$((CHANGED+1))
  else
    if chown -R "$owner" "$path" 2>/dev/null; then
      printf "  CHOWN %-20s %s -> %s\n" "$vol" "$current_owner" "$owner"
      CHANGED=$((CHANGED+1))
    else
      printf "  ERROR %-20s chown gagal (perlu sudo?)\n" "$vol"
      ERRORS=$((ERRORS+1))
    fi
  fi
done

echo ""
echo "============================================"
echo " Summary"
echo "============================================"
echo "  Changed:   $CHANGED"
echo "  Unchanged: $UNCHANGED"
echo "  Skipped:   $SKIPPED"
echo "  Errors:    $ERRORS"
echo ""

if [ $ERRORS -gt 0 ]; then
  echo "Ada error. Coba dengan sudo:"
  echo "  sudo BASE_DIR=$BASE_DIR $0"
  exit 1
fi

if [ $DRY_RUN -eq 1 ] && [ $CHANGED -gt 0 ]; then
  echo "Dry-run selesai. Untuk apply, jalankan tanpa --dry-run."
fi

echo "Selesai."
