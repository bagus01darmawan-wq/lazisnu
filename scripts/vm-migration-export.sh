#!/bin/bash
# vm-migration-export.sh — bundel artefak NON-GIT untuk migrasi VM / DR.
#
# Jalankan sebagai root:  sudo bash /opt/lazisnu/scripts/vm-migration-export.sh
# Opsional:               sudo bash /opt/lazisnu/scripts/vm-migration-export.sh --with-data
#   (--with-data ikut menyertakan grafana-data + prometheus-data — riwayat metrik,
#    ukuran besar & upload lambat; DEFAULT tidak disertakan karena history opsional)
# Hasil: satu arsip .tar.gz diupload ke R2 (prefix migrasi/).
#
# Isi arsip: secrets/ (env files), cron (root crontab + cron.d), letsencrypt
# (sertifikat dari /opt/lazisnu/nginx/certbot), sshd_config, sysctl. Yang TIDAK
# perlu dibundel: source repo (di git), backup DB (sudah di R2), backup kuma
# (sudah di R2).
#
# Restore di VM baru = clone repo + download arsip ini + extract (lihat
# docs/MIGRATION-VM.md).

set -euo pipefail

INCLUDE_DATA=0
if [[ "${1:-}" == "--with-data" ]]; then
  INCLUDE_DATA=1
fi

ENV_FILE="/opt/lazisnu/secrets/env.backup-2026-07-27"
if [[ ! -r "$ENV_FILE" ]]; then
  echo "Env file tidak terbaca: $ENV_FILE" >&2
  exit 1
fi

TS="$(date +%Y%m%d_%H%M%S)"
STAGE_DIR="$(mktemp -d /tmp/lazisnu-export.XXXXXX)"
TARBALL="/tmp/lazisnu-vm-export-${TS}.tar.gz"
R2_KEY="migrasi/lazisnu-vm-export-${TS}.tar.gz"

cleanup() {
  rm -rf "$STAGE_DIR" 2>/dev/null || true
  rm -f "$TARBALL" 2>/dev/null || true
}
trap cleanup EXIT

mkdir -p "$STAGE_DIR/secrets" "$STAGE_DIR/cron" "$STAGE_DIR/letsencrypt" "$STAGE_DIR/ssh" "$STAGE_DIR/sysctl" "$STAGE_DIR/data"

echo "[1/6] secrets"
cp -a /opt/lazisnu/secrets/. "$STAGE_DIR/secrets/" 2>/dev/null || echo "  WARN: secrets kosong/tidak ada"

echo "[2/6] cron"
crontab -l > "$STAGE_DIR/cron/root-crontab" 2>/dev/null || echo "  WARN: crontab root tidak terbaca"
cp -a /etc/cron.d/lazisnu-backup-health "$STAGE_DIR/cron/" 2>/dev/null || echo "  WARN: cron.d healthcheck tidak ada"

echo "[3/6] letsencrypt (sertifikat) — bind mount nginx: /opt/lazisnu/nginx/certbot"
if [[ -d /opt/lazisnu/nginx/certbot ]]; then
  cp -a /opt/lazisnu/nginx/certbot "$STAGE_DIR/letsencrypt/"
  echo "  ok: $(du -sh /opt/lazisnu/nginx/certbot | awk '{print $1}')"
else
  echo "  WARN: /opt/lazisnu/nginx/certbot tidak ada"
fi

echo "[4/6] sshd_config + sysctl"
cp -a /etc/ssh/sshd_config "$STAGE_DIR/ssh/" 2>/dev/null || true
cp -a /etc/sysctl.conf "$STAGE_DIR/sysctl/" 2>/dev/null || true
cp -a /etc/sysctl.d "$STAGE_DIR/sysctl/" 2>/dev/null || true

echo "[5/6] data bind-mount (grafana/prometheus)"
if [[ "$INCLUDE_DATA" == "1" ]]; then
  for d in grafana-data prometheus-data; do
    if [[ -d "/opt/lazisnu/$d" ]]; then
      cp -a "/opt/lazisnu/$d" "$STAGE_DIR/data/$d"
      echo "  ok: $d ($(du -sh "/opt/lazisnu/$d" | awk '{print $1}'))"
    else
      echo "  skip: $d (tidak ada)"
    fi
  done
else
  echo "  skip: history metrik tidak disertakan (gunakan --with-data bila perlu)"
fi

echo "[6/6] tar + upload R2"
tar -czf "$TARBALL" -C "$(dirname "$STAGE_DIR")" "$(basename "$STAGE_DIR")"
rm -rf "$STAGE_DIR"

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-${R2_ACCESS_KEY_ID:-}}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-${R2_SECRET_ACCESS_KEY:-}}"

# aws-cli lama (1.22) punya bug multipart upload ke R2 (SSL EOF) —
# paksa single PUT untuk file besar, dengan timeout panjang.
sudo aws configure set default.s3.multipart_threshold 128MB || true

R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
SIZE_BYTES="$(stat -c '%s' "$TARBALL")"
aws s3 cp "$TARBALL" "s3://${R2_BUCKET_NAME}/${R2_KEY}" \
  --endpoint-url "$R2_ENDPOINT" \
  --cli-read-timeout 600 --cli-connect-timeout 60 \
  --only-show-errors
REMOTE_SIZE="$(aws s3api head-object \
  --bucket "$R2_BUCKET_NAME" --key "$R2_KEY" \
  --endpoint-url "$R2_ENDPOINT" --query ContentLength --output text)"
if [[ "$REMOTE_SIZE" != "$SIZE_BYTES" ]]; then
  echo "FAILURE r2_size_mismatch local=${SIZE_BYTES} remote=${REMOTE_SIZE}" >&2
  exit 1
fi
rm -f "$TARBALL"

echo "SUCCESS r2_key=$R2_KEY size_bytes=$SIZE_BYTES"
echo "Simpan r2_key ini — dibutuhkan saat migrasi (docs/MIGRATION-VM.md)."
