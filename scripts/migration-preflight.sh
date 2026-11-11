#!/bin/bash
# migration-preflight.sh — inspeksi READ-ONLY VM lama sebelum migrasi.
#
# Jalankan sebagai root:
#   sudo bash /tmp/migration-preflight.sh
# atau dari laptop (scp lebih aman agar tidak ada CRLF):
#   scp scripts/migration-preflight.sh ubuntu@host:/tmp/
#   ssh ubuntu@host 'sudo bash /tmp/migration-preflight.sh'
#
# Script ini TIDAK mengubah apa pun dan TIDAK mencetak isi env/secret.
# Output sengaja berupa metadata, nama file, mode, dan hitungan.

set -uo pipefail

section() {
  printf '\n===== %s =====\n' "$1"
}

have() {
  command -v "$1" >/dev/null 2>&1
}

section "Waktu & host"
date
timedatectl 2>/dev/null || true
hostnamectl 2>/dev/null || true
printf 'kernel: %s\n' "$(uname -r)"
printf 'uptime: %s\n' "$(uptime -p 2>/dev/null || uptime)"
printf 'os: %s\n' "$( (. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME") || echo unknown )"
printf 'user: %s\n' "$(id)"
id ubuntu 2>/dev/null || true

section "Repo /opt/lazisnu"
if [ -d /opt/lazisnu/.git ]; then
  printf 'HEAD: %s\n' "$(git -C /opt/lazisnu rev-parse HEAD 2>/dev/null || echo unreadable)"
  printf 'branch: %s\n' "$(git -C /opt/lazisnu branch --show-current 2>/dev/null || echo unknown)"
  git -C /opt/lazisnu log -1 --oneline 2>/dev/null || true
  printf '%s\n' '--- git status --short ---'
  git -C /opt/lazisnu status --short 2>/dev/null || true
else
  echo "WARN: /opt/lazisnu bukan git repo"
fi

section "SSH keys"
UBUNTU_HOME="$(getent passwd ubuntu | cut -d: -f6 2>/dev/null || true)"
if [ -n "${UBUNTU_HOME:-}" ] && [ -f "$UBUNTU_HOME/.ssh/authorized_keys" ]; then
  echo "--- authorized_keys fingerprints ---"
  ssh-keygen -lf "$UBUNTU_HOME/.ssh/authorized_keys" 2>/dev/null || true
fi
echo "--- recent accepted publickey (fingerprint saja) ---"
grep -hE 'Accepted publickey for ubuntu' /var/log/auth.log /var/log/auth.log.1 2>/dev/null | tail -5 || true

section "Docker"
if have docker; then
  docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}' 2>/dev/null || true
  printf '%s\n' '--- image warna blue/green ---'
  for c in blue-backend blue-worker blue-web green-backend green-worker green-web; do
    if docker inspect "$c" >/dev/null 2>&1; then
      printf '%s -> %s\n' "$c" "$(docker inspect -f '{{.Config.Image}}' "$c")"
    fi
  done
  printf '%s\n' '--- versi tool ---'
  docker --version 2>/dev/null || true
  docker compose version 2>/dev/null || true
else
  echo "WARN: docker tidak tersedia"
fi
have aws && aws --version 2>&1 | head -1 || echo "WARN: aws tidak tersedia"
if [ -x /usr/lib/postgresql/17/bin/pg_dump ]; then
  /usr/lib/postgresql/17/bin/pg_dump --version
else
  echo "WARN: pg_dump 17 tidak ada di /usr/lib/postgresql/17/bin"
fi

section "nginx upstream"
if [ -e /opt/lazisnu/nginx/upstream.conf ]; then
  stat -c '%A %U:%G %n' /opt/lazisnu/nginx/upstream.conf
  grep -E '^# Active:|^set \$' /opt/lazisnu/nginx/upstream.conf 2>/dev/null || true
else
  echo "MISSING: /opt/lazisnu/nginx/upstream.conf"
fi

section "nginx hostnames & cert paths"
if have docker && docker inspect lazisnu-nginx-1 >/dev/null 2>&1; then
  docker exec lazisnu-nginx-1 nginx -T 2>/dev/null \
    | grep -E 'server_name|ssl_certificate ' \
    | sed 's/^[[:space:]]*//' || true
else
  echo "WARN: container lazisnu-nginx-1 tidak ditemukan"
fi

section "Cron"
if [ "$(id -u)" -eq 0 ]; then
  echo "--- root crontab ---"
  crontab -l 2>/dev/null || echo "tidak terbaca"
else
  echo "--- root crontab (sudo -n) ---"
  sudo -n crontab -l 2>/dev/null || echo "tidak terbaca tanpa sudo"
fi
echo "--- /etc/cron.d/lazisnu-* ---"
for f in /etc/cron.d/lazisnu-*; do
  [ -e "$f" ] || continue
  stat -c '%A %U:%G %n' "$f"
  grep -vE '^[[:space:]]*(#|$)' "$f" 2>/dev/null || true
done

section "Backup: file & log"
for f in \
  /opt/lazisnu/backup-data/active \
  /opt/lazisnu/backup-prod-data/active \
  /opt/lazisnu/.env.backup \
  /opt/lazisnu/.env.backup-prod \
  /opt/lazisnu/scripts/backup.sh \
  /opt/lazisnu/scripts/backup-prod.sh \
  /opt/lazisnu/scripts/backup-healthcheck.sh \
  /opt/lazisnu/scripts/backup-kuma.sh; do
  if [ -e "$f" ]; then
    stat -c '%A %U:%G %n' "$f"
  else
    echo "MISSING: $f"
  fi
done
for d in /opt/lazisnu/backups /opt/lazisnu/backups-prod /opt/lazisnu/backups-staging; do
  [ -d "$d" ] || continue
  echo "--- $d ---"
  for log in backup.log backup-health.log; do
    if [ -f "$d/$log" ]; then
      echo "[$log]"
      tail -n 3 "$d/$log" 2>/dev/null || true
    fi
  done
done

section "Env & secret: metadata saja"
for f in \
  /opt/lazisnu/.env \
  /opt/lazisnu/.env.alertmanager \
  /opt/lazisnu/.env.staging \
  /opt/lazisnu/apps/backend/.env \
  /opt/lazisnu/apps/backend/.env.staging \
  /opt/lazisnu/secrets; do
  if [ -e "$f" ]; then
    stat -c '%A %U:%G %n' "$f"
  else
    echo "MISSING: $f"
  fi
done
if [ -d /opt/lazisnu/secrets ]; then
  echo "--- isi secrets (nama + mode, bukan isi) ---"
  find /opt/lazisnu/secrets -mindepth 1 -maxdepth 1 -printf '%M %u:%g %p\n' 2>/dev/null | sort || true
fi

section "Sertifikat"
if [ -d /opt/lazisnu/nginx/certbot/conf/live ]; then
  for d in /opt/lazisnu/nginx/certbot/conf/live/*/; do
    [ -f "${d}fullchain.pem" ] || continue
    printf '%s: ' "$(basename "$d")"
    openssl x509 -noout -enddate -in "${d}fullchain.pem" 2>/dev/null || echo "tidak terbaca"
  done
  echo "--- direktori cert ---"
  ls -1 /opt/lazisnu/nginx/certbot/conf/live 2>/dev/null || true
else
  echo "WARN: certbot conf/live tidak ada"
fi

section "Redis"
if have docker && docker inspect lazisnu-redis-1 >/dev/null 2>&1; then
  printf 'revoked=%s\n' "$(docker exec lazisnu-redis-1 redis-cli --scan --pattern 'revoked:*' 2>/dev/null | wc -l)"
  printf 'refresh=%s\n' "$(docker exec lazisnu-redis-1 redis-cli --scan --pattern 'refresh:*' 2>/dev/null | wc -l)"
  printf 'dbsize=%s\n' "$(docker exec lazisnu-redis-1 redis-cli DBSIZE 2>/dev/null || echo '?')"
  docker exec lazisnu-redis-1 redis-cli INFO persistence 2>/dev/null \
    | grep -E 'aof_enabled|aof_rewrite_in_progress|aof_rewrite_scheduled|aof_last_bgrewrite_status' || true
else
  echo "WARN: container lazisnu-redis-1 tidak ditemukan"
fi

section "Volume & disk"
for d in redis-data redis-data-staging prometheus-data grafana-data alertmanager-data uptime-kuma backup-data backup-prod-data backups backups-prod backups-staging; do
  if [ -e "/opt/lazisnu/$d" ]; then
    printf '%s: %s\n' "$d" "$(du -sh "/opt/lazisnu/$d" 2>/dev/null | awk '{print $1}')"
    stat -c '  %A %U:%G %n' "/opt/lazisnu/$d"
  else
    echo "MISSING: /opt/lazisnu/$d"
  fi
done
df -h / /opt 2>/dev/null || df -h /
free -m 2>/dev/null || true
printf 'load: %s\n' "$(cat /proc/loadavg 2>/dev/null || echo '?')"

section "Selesai"
echo "Tidak ada perubahan yang dilakukan."
