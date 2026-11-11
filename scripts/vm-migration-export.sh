#!/bin/bash
# vm-migration-export.sh — bundel artefak NON-GIT untuk migrasi VM / DR.
#
# Jalankan sebagai root:  sudo bash /opt/lazisnu/scripts/vm-migration-export.sh
# Opsional:               sudo bash /opt/lazisnu/scripts/vm-migration-export.sh --with-data
#   (--with-data ikut menyertakan grafana-data + prometheus-data — riwayat metrik,
#    ukuran besar & upload lambat; DEFAULT tidak disertakan karena history opsional)
# Hasil: satu arsip .tar.gz diupload ke R2 (prefix migrasi/).
#
# Isi arsip:
#   - secrets/                  env auth-probe, scheduler, backup staging, dll
#   - env produksi/staging      .env, .env.alertmanager, .env.backup*,
#                               apps/backend/.env, apps/backend/.env.staging
#   - cron/                     root crontab + SEMUA /etc/cron.d/lazisnu-*
#   - letsencrypt/              sertifikat dari /opt/lazisnu/nginx/certbot
#   - ssh/sshd_config, sysctl/
#   - scripts/backup-prod.sh    wrapper VM-local (jika ada)
#   - data/                     grafana/prometheus, hanya dengan --with-data
#   - MANIFEST.txt, REVISION
#
# TIDAK dibundel: source repo (Git), backup DB (R2), backup Kuma (R2), dan
# Redis AOF (buat snapshot konsisten terpisah — lihat rencana migrasi).
#
# PENTING: r2_key yang dicetak adalah key LENGKAP
# (migrasi/lazisnu-vm-export-….tar.gz). Saat mengunduh, gunakan key itu SEKALI:
#   s3://$R2_BUCKET_NAME/$R2_KEY
# Jangan menambahkan prefix migrasi/ lagi.
#
# CATATAN BOOTSTRAP: arsip ini berisi .env.backup, tetapi arsip tidak bisa
# mengunduh dirinya sendiri. Siapkan .env.backup lewat scp (root, 0600) atau
# token R2 read-only sebelum mengunduh.

set -euo pipefail
umask 077

INCLUDE_DATA=0
if [[ "${1:-}" == "--with-data" ]]; then
  INCLUDE_DATA=1
fi

# Env sumber kredensial R2 (prod). Override via EXPORT_ENV_FILE bila lokasinya beda.
# Contoh: sudo EXPORT_ENV_FILE=/opt/lazisnu/.env.backup bash scripts/vm-migration-export.sh
ENV_FILE="${EXPORT_ENV_FILE:-/opt/lazisnu/.env.backup}"
if [[ ! -r "$ENV_FILE" ]]; then
  echo "Env file tidak terbaca: $ENV_FILE" >&2
  echo "Set EXPORT_ENV_FILE=/opt/lazisnu/.env.backup bila lokasinya berbeda." >&2
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

mkdir -p "$STAGE_DIR"/{secrets,cron,letsencrypt,ssh,sysctl,data,apps/backend,scripts}

copy_env_file() {
  local src="$1"
  local dest="$2"
  local label="$3"
  if [[ -f "$src" ]]; then
    mkdir -p "$(dirname "$dest")"
    cp -a "$src" "$dest"
    chmod 600 "$dest" 2>/dev/null || true
    echo "  ok: $label"
  else
    echo "  WARN: $label tidak ada: $src"
  fi
}

echo "[1/7] secrets + env files"
cp -a /opt/lazisnu/secrets/. "$STAGE_DIR/secrets/" 2>/dev/null || echo "  WARN: secrets kosong/tidak ada"
copy_env_file /opt/lazisnu/.env "$STAGE_DIR/.env" ".env"
copy_env_file /opt/lazisnu/.env.alertmanager "$STAGE_DIR/.env.alertmanager" ".env.alertmanager"
copy_env_file /opt/lazisnu/.env.backup "$STAGE_DIR/.env.backup" ".env.backup"
copy_env_file /opt/lazisnu/.env.backup-prod "$STAGE_DIR/.env.backup-prod" ".env.backup-prod"
copy_env_file /opt/lazisnu/.env.staging "$STAGE_DIR/.env.staging" ".env.staging"
copy_env_file /opt/lazisnu/apps/backend/.env "$STAGE_DIR/apps/backend/.env" "apps/backend/.env"
copy_env_file /opt/lazisnu/apps/backend/.env.staging "$STAGE_DIR/apps/backend/.env.staging" "apps/backend/.env.staging"

echo "[2/7] cron"
crontab -l > "$STAGE_DIR/cron/root-crontab" 2>/dev/null || echo "  WARN: crontab root tidak terbaca"
shopt -s nullglob
cron_files=(/etc/cron.d/lazisnu-*)
shopt -u nullglob
if (( ${#cron_files[@]} == 0 )); then
  echo "  WARN: tidak ada /etc/cron.d/lazisnu-*"
else
  for cron_file in "${cron_files[@]}"; do
    cp -a "$cron_file" "$STAGE_DIR/cron/"
    echo "  ok: cron.d/$(basename "$cron_file")"
  done
fi

echo "[3/7] letsencrypt (sertifikat) — bind mount nginx: /opt/lazisnu/nginx/certbot"
if [[ -d /opt/lazisnu/nginx/certbot ]]; then
  cp -a /opt/lazisnu/nginx/certbot "$STAGE_DIR/letsencrypt/"
  echo "  ok: $(du -sh /opt/lazisnu/nginx/certbot | awk '{print $1}')"
else
  echo "  WARN: /opt/lazisnu/nginx/certbot tidak ada"
fi

echo "[4/7] sshd_config + sysctl"
cp -a /etc/ssh/sshd_config "$STAGE_DIR/ssh/" 2>/dev/null || true
cp -a /etc/sysctl.conf "$STAGE_DIR/sysctl/" 2>/dev/null || true
cp -a /etc/sysctl.d "$STAGE_DIR/sysctl/" 2>/dev/null || true

echo "[5/7] data bind-mount (grafana/prometheus)"
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

echo "[6/7] VM-local scripts + manifest"
if [[ -f /opt/lazisnu/scripts/backup-prod.sh ]]; then
  cp -a /opt/lazisnu/scripts/backup-prod.sh "$STAGE_DIR/scripts/backup-prod.sh"
  echo "  ok: scripts/backup-prod.sh"
else
  echo "  WARN: /opt/lazisnu/scripts/backup-prod.sh tidak ada (cek /etc/cron.d/lazisnu-backup-prod)"
fi

if git -C /opt/lazisnu rev-parse HEAD >/dev/null 2>&1; then
  git -C /opt/lazisnu rev-parse HEAD > "$STAGE_DIR/REVISION"
  echo "  ok: REVISION $(cat "$STAGE_DIR/REVISION")"
else
  echo "  WARN: tidak bisa membaca git HEAD /opt/lazisnu"
fi

{
  echo "# Manifest dibuat $(date -Is) dari $(hostname)"
  echo "# path\tmode\towner\tbytes"
  find "$STAGE_DIR" -type f -printf '%P\t%m\t%u:%g\t%s\n' | sort
} > "$STAGE_DIR/MANIFEST.txt"
echo "  ok: MANIFEST.txt"

echo "[7/7] tar + upload R2"
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
echo "PENTING: gunakan key lengkap di atas SEKALI. Jangan menambahkan prefix migrasi/ lagi."
echo "Contoh unduh: aws s3 cp s3://\$R2_BUCKET_NAME/\$R2_KEY - --endpoint-url \$R2_ENDPOINT | tar -xzf - -C /opt/lazisnu --strip-components=1"
echo "Bootstrap: siapkan .env.backup via scp (root 0600) atau token R2 read-only; arsip tidak bisa mengunduh dirinya sendiri."
