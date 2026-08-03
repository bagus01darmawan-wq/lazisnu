#!/bin/bash
# ============================================
# Lazisnu VM — Housekeeping Mingguan
# ============================================
# Dijalankan oleh cron weekly ( Sundays 06:00 )
# Membersihkan 3 sumber growth tanpa batas:
#   1. /var/cache/apt           (apt-get clean)
#   2. /var/lib/snapd/cache     (rm -rf)
#   3. /var/log/journal          (journalctl --vacuum-time=7d)
# Aman: tidak menyentuh image container, snap aktif,
#       metrik Grafana, atau data aplikasi.
# Log keluaran ke /var/log/lazisnu-cleanup.log
# ============================================

set -euo pipefail

LOG=/var/log/lazisnu-cleanup.log
BEFORE=$(df --output=avail -BM / | tail -1 | tr -d ' M')

{
  echo "============================================"
  echo "[$(date -Iseconds)] Lazisnu weekly cleanup START"
  echo "Free disk before: ${BEFORE}M"
  echo "--------------------------------------------"

  # 1. APT cache — hapus semua .deb yang sudah terinstall
  echo "[1/3] apt-get clean ..."
  apt-get clean
  APT_AFTER=$(du -sm /var/cache/apt 2>/dev/null | cut -f1)
  echo "    /var/cache/apt sekarang: ${APT_AFTER:-0}M"

  # 2. Snapd cache — hapus .snap yang sudah ter-mount di /var/lib/snapd/snaps
  echo "[2/3] snapd cache cleanup ..."
  SNAP_BEFORE=$(du -sm /var/lib/snapd/cache 2>/dev/null | cut -f1 || echo 0)
  rm -rf /var/lib/snapd/cache/*
  echo "    snapd cache dibersihkan (sebelum: ${SNAP_BEFORE}M)"

  # 3. Journal systemd — simpan 7 hari terakhir
  echo "[3/3] journalctl vacuum-time=7d ..."
  journalctl --vacuum-time=7d

  echo "--------------------------------------------"
  AFTER=$(df --output=avail -BM / | tail -1 | tr -d ' M')
  echo "[$(date -Iseconds)] Lazisnu weekly cleanup END"
  echo "Free disk after: ${AFTER}M (delta: $((AFTER - BEFORE))M)"
  echo "============================================"
} >> "$LOG" 2>&1