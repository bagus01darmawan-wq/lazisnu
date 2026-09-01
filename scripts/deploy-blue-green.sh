#!/bin/bash
set -eo pipefail

# ============================================
# Lazisnu Blue-Green Deploy Script
# ============================================
# Usage:
#   ./scripts/deploy-blue-green.sh blue      # deploy ke blue
#   ./scripts/deploy-blue-green.sh green     # deploy ke green
#   ./scripts/deploy-blue-green.sh status    # cek status blue & green
#   ./scripts/deploy-blue-green.sh active    # cetak warna yang sedang live
#   ./scripts/deploy-blue-green.sh teardown <warna>  # bongkar warna lama
#   ./scripts/deploy-blue-green.sh migrate     # hanya jalankan migrasi database
#   ./scripts/deploy-blue-green.sh rollback  # kembali ke warna sebelumnya
#
# Prasyarat VM:
#   1. docker compose sudah terinstall
#   2. GHCR sudah login (untuk pull image)
#   3. docker-compose.blue-green.yml ada di root
#   4. nginx/upstream.conf sudah di-setup (lihat langkah setup di bawah)
#
# Strategi:
#   1. Tentukan warna target (blue/green) — lawan dari yang sedang live
#   2. Pull image + deploy container ke warna target
#   3. Smoke test: curl /health/ready ke target
#   4. Switch nginx upstream ke warna target
#   5. Graceful reload nginx
#   6. Teardown warna lama — HANYA setelah verifikasi publik lolos (lihat bawah)
# ============================================
#
# TENTANG TEARDOWN DAN ROLLBACK — baca sebelum mengubah apa pun di sini:
#   Rollback hanya mungkin kalau warna lama MASIH HIDUP. Karena itu CI tidak
#   lagi memakai AUTO_TEARDOWN=1, melainkan KEEP_OLD_COLOR=1: warna lama
#   dibiarkan hidup sampai verifikasi lewat domain publik benar-benar lolos.
#   Urutan yang benar:
#     PREV=$(./deploy-blue-green.sh active)
#     KEEP_OLD_COLOR=1 ./deploy-blue-green.sh deploy
#     <verifikasi publik>  ->  kalau gagal: ./deploy-blue-green.sh rollback
#     ./deploy-blue-green.sh teardown "$PREV"
#   Jangan pernah teardown sebelum verifikasi publik selesai.
# ============================================

set -a
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
set +a

# ─── Konfigurasi ───
GHCR_REPO="${GHCR_REPO:-bagus01darmawan-wq/lazisnu}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
NGINX_UPSTREAM_FILE="${NGINX_UPSTREAM_FILE:-$PROJECT_DIR/nginx/upstream.conf}"
NGINX_CONTAINER="${NGINX_CONTAINER:-lazisnu-nginx-1}"
# KEEP_OLD_COLOR=1 -> warna lama DIBIARKAN HIDUP, tanpa prompt interaktif.
# Dipakai CI supaya rollback masih mungkin setelah health check publik.
# (Prompt `read` tidak bisa dipakai di CI: tanpa stdin ia gagal dan
#  menghentikan skrip karena `set -e`.)
KEEP_OLD_COLOR="${KEEP_OLD_COLOR:-0}"
AUTO_TEARDOWN="${AUTO_TEARDOWN:-0}"
BACKEND_PORT_BLUE=3001
BACKEND_PORT_GREEN=3101
WEB_PORT_BLUE=3000
WEB_PORT_GREEN=3100
HEALTH_RETRIES="${HEALTH_RETRIES:-12}"
HEALTH_INTERVAL="${HEALTH_INTERVAL:-5}"

# ─── Warna terminal ───
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log()  { echo -e "[$(date '+%H:%M:%S')] $1"; }
info() { log "${BLUE}[INFO]${NC} $1"; }
ok()   { log "${GREEN}[OK]${NC} $1"; }
warn() { log "${YELLOW}[WARN]${NC} $1"; }
err()  { log "${RED}[ERROR]${NC} $1"; }

# ─── Fungsi: dapatkan warna yang sedang live ───
get_active_color() {
  # Cek upstream.conf: container mana yang sedang dipakai nginx
  if [ -f "$NGINX_UPSTREAM_FILE" ]; then
    if grep -q "blue-backend" "$NGINX_UPSTREAM_FILE" 2>/dev/null; then
      echo "blue"
    elif grep -q "green-backend" "$NGINX_UPSTREAM_FILE" 2>/dev/null; then
      echo "green"
    else
      echo ""
    fi
  else
    echo ""
  fi
}

# ─── Fungsi: tentukan warna target ───
get_target_color() {
  local active
  active=$(get_active_color)
  if [ "$active" = "blue" ]; then
    echo "green"
  elif [ "$active" = "green" ]; then
    echo "blue"
  else
    # Default: jika tidak ada yang live, deploy blue dulu
    echo "blue"
  fi
}

# ─── Fungsi: dapatkan port untuk warna ───
get_backend_port() {
  if [ "$1" = "blue" ]; then echo "$BACKEND_PORT_BLUE"; else echo "$BACKEND_PORT_GREEN"; fi
}
get_web_port() {
  if [ "$1" = "blue" ]; then echo "$WEB_PORT_BLUE"; else echo "$WEB_PORT_GREEN"; fi
}

# ─── Fungsi: pull image ───
pull_images() {
  info "Pulling images (tag: $IMAGE_TAG)..."
  docker pull "ghcr.io/${GHCR_REPO}/backend:${IMAGE_TAG}"
  docker pull "ghcr.io/${GHCR_REPO}/web:${IMAGE_TAG}"
  ok "Images pulled"
}

# ─── Fungsi: deploy container ke warna target ───
deploy_color() {
  local color=$1
  local backend_port
  local web_port
  backend_port=$(get_backend_port "$color")
  web_port=$(get_web_port "$color")

  info "Deploying to ${YELLOW}${color}${NC} (backend:${backend_port}, web:${web_port})..."

  cd "$PROJECT_DIR"

  COLOR="$color" \
  BACKEND_PORT="$backend_port" \
  WEB_PORT="$web_port" \
  GHCR_REPO="$GHCR_REPO" \
  IMAGE_TAG="$IMAGE_TAG" \
    docker compose -p "$color" -f docker-compose.blue-green.yml up -d --wait

  ok "Containers ${color} deployed"
}

# ─── Fungsi: smoke test ───
smoke_test() {
  local color=$1
  local backend_port
  local web_port
  backend_port=$(get_backend_port "$color")
  web_port=$(get_web_port "$color")

  info "Smoke testing ${YELLOW}${color}${NC} backend (port ${backend_port})..."

  local attempt=1
  while [ $attempt -le $HEALTH_RETRIES ]; do
    if curl -sf "http://localhost:${backend_port}/health/ready" > /dev/null 2>&1; then
      ok "Backend ${color} healthy (attempt ${attempt})"
      break
    fi
    warn "Attempt ${attempt}/${HEALTH_RETRIES} — waiting ${HEALTH_INTERVAL}s..."
    sleep "$HEALTH_INTERVAL"
    attempt=$((attempt + 1))
  done
  if [ $attempt -gt $HEALTH_RETRIES ]; then
    err "Backend ${color} FAILED health check after ${HEALTH_RETRIES} attempts"
    return 1
  fi

  # Web: marker JSON dari route /api/health (Next.js cold start bisa lambat).
  info "Smoke testing ${YELLOW}${color}${NC} web (port ${web_port})..."

  attempt=1
  while [ $attempt -le $HEALTH_RETRIES ]; do
    if curl -sf "http://localhost:${web_port}/api/health" 2>/dev/null | grep -q '"status":"ok"'; then
      ok "Web ${color} healthy (attempt ${attempt})"
      return 0
    fi
    warn "Attempt ${attempt}/${HEALTH_RETRIES} — waiting ${HEALTH_INTERVAL}s..."
    sleep "$HEALTH_INTERVAL"
    attempt=$((attempt + 1))
  done

  err "Web ${color} FAILED health check after ${HEALTH_RETRIES} attempts"
  return 1
}

# ─── Fungsi: update nginx upstream ───
update_nginx_upstream() {
  local color=$1
  local backend_port
  local web_port
  backend_port=$(get_backend_port "$color")
  web_port=$(get_web_port "$color")

  info "Updating nginx upstream → ${YELLOW}${color}${NC}..."

  cat > "$NGINX_UPSTREAM_FILE" << NGINXEOF
# Auto-generated by deploy-blue-green.sh
# Active: ${color} — $(date)
set \$backend_upstream "http://${color}-backend:${backend_port}";
set \$web_upstream "http://${color}-web:${web_port}";
NGINXEOF

  ok "upstream.conf written (${color}-backend:${backend_port}, ${color}-web:${web_port})"
}

# ─── Fungsi: reload nginx ───
reload_nginx() {
  info "Reloading nginx..."
  if docker exec "$NGINX_CONTAINER" nginx -t 2>&1; then
    docker exec "$NGINX_CONTAINER" nginx -s reload
    ok "Nginx reloaded successfully"
  else
    err "Nginx config test FAILED — rolling back upstream"
    # Kembalikan upstream ke warna lama
    local active
    active=$(get_active_color)
    if [ -n "$active" ] && [ "$active" != "$1" ]; then
      update_nginx_upstream "$active"
      docker exec "$NGINX_CONTAINER" nginx -s reload
      err "Rolled back to ${active}"
    fi
    return 1
  fi
}

# ─── Fungsi: teardown warna lama ───
teardown_color() {
  local color=$1
  local backend_port
  local web_port
  backend_port=$(get_backend_port "$color")
  web_port=$(get_web_port "$color")
  info "Tearing down old ${YELLOW}${color}${NC}..."
  cd "$PROJECT_DIR"
  COLOR="$color" BACKEND_PORT="$backend_port" WEB_PORT="$web_port" \
    docker compose -p "$color" -f docker-compose.blue-green.yml down
  ok "Old ${color} torn down"
}

# ─── Fungsi: jalankan migrasi database ─────────────────────────────────
# Migrasi dijalankan dari dalam image backend yang baru, memakai kredensial
# yang sudah ada di apps/backend/.env — jadi tidak perlu menambah secret.
#
# Catatan: drizzle-kit adalah devDependency, sehingga TIDAK ada di dalam image
# produksi (Dockerfile memasang dengan --prod). Yang dipakai karena itu
# migrator bawaan drizzle-orm, melalui dist/database/migrate-cli.js.
run_migrations() {
  local image="ghcr.io/${GHCR_REPO}/backend:${IMAGE_TAG}"
  if [ ! -f "$PROJECT_DIR/apps/backend/.env" ]; then
    err "apps/backend/.env tidak ditemukan — butuh DATABASE_URL untuk migrasi."
    return 1
  fi
  info "Menjalankan migrasi database dari image ${YELLOW}${image}${NC}..."
  cd "$PROJECT_DIR"
  docker run --rm \
    --env-file apps/backend/.env \
    -e NODE_ENV=production \
    "$image" \
    node apps/backend/dist/database/migrate-cli.js
  ok "Migrasi selesai — skema sudah mutakhir."
}

# ─── Fungsi: status ───
show_status() {
  echo ""
  echo "============================================"
  echo " Blue-Green Status"
  echo "============================================"
  local active
  active=$(get_active_color)
  echo "Active (nginx) : ${GREEN}${active:-NONE}${NC}"

  for color in blue green; do
    local backend_port
    backend_port=$(get_backend_port "$color")
    local status="DOWN"
    if curl -sf "http://localhost:${backend_port}/health/ready" > /dev/null 2>&1; then
      status="${GREEN}HEALTHY${NC}"
    fi
    echo "  ${color}-backend (${backend_port}) : ${status}"
  done
  echo "============================================"
  echo ""
}

# ─── Fungsi: setup nginx untuk blue-green (dijalankan sekali) ───
setup_nginx() {
  info "Setting up nginx for blue-green deployment..."

  # Cek apakah nginx.conf sudah include upstream.conf
  if ! grep -q "upstream.conf" "$PROJECT_DIR/nginx/nginx.conf" 2>/dev/null; then
    warn "nginx.conf belum meng-include upstream.conf"
    warn "Tambahkan ini di dalam blok 'http { ... }' di nginx.conf:"
    echo ""
    echo "    include /etc/nginx/upstream.conf;"
    echo ""
    warn "Lalu ganti semua 'proxy_pass http://backend:3001' menjadi 'proxy_pass http://backend_active;'"
    warn "Dan ganti semua 'proxy_pass http://web:3000' menjadi 'proxy_pass http://web_active;'"
    warn ""
    warn "Kemudian mount upstream.conf di docker-compose.yml service nginx:"
    warn "  - ./nginx/upstream.conf:/etc/nginx/upstream.conf"
    warn ""
    warn "Jalankan ulang: docker compose up -d nginx"
  else
    ok "nginx.conf sudah include upstream.conf"
  fi
}

# ═══════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════

COMMAND="${1:-deploy}"

case "$COMMAND" in
  status|check)
    show_status
    exit 0
    ;;
  setup)
    setup_nginx
    exit 0
    ;;
  active)
    # Cetak warna yang sedang live ke stdout (kosong kalau belum ada).
    # Dipakai CI untuk mengingat warna lama sebelum deploy.
    get_active_color
    exit 0
    ;;
  migrate)
    # Hanya menjalankan migrasi database, tanpa menyentuh deploy.
    # Berguna untuk menerapkan skema lebih dulu sebelum rilis yang
    # membutuhkannya. Aman dijalankan berulang: migrator mencatat apa
    # yang sudah diterapkan dan hanya menjalankan yang belum.
    run_migrations
    exit 0
    ;;
  teardown)
    # Bongkar warna tertentu. Dipanggil CI SETELAH verifikasi publik lolos.
    if [ -z "$2" ]; then
      err "Pakai: $0 teardown <blue|green>"
      exit 1
    fi
    if [ "$2" != "blue" ] && [ "$2" != "green" ]; then
      err "Warna tidak dikenal: $2 (harus blue atau green)"
      exit 1
    fi
    CURRENT=$(get_active_color)
    if [ "$2" = "$CURRENT" ]; then
      err "Menolak membongkar $2 — itu warna yang SEDANG LIVE."
      err "Menjalankan ini akan mematikan produksi."
      exit 1
    fi
    teardown_color "$2"
    exit 0
    ;;
  rollback)
    # Rollback: switch ke warna lama
    ACTIVE=$(get_active_color)
    if [ -z "$ACTIVE" ]; then
      err "Tidak ada environment yang aktif — tidak bisa rollback"
      exit 1
    fi
    # Target rollback = lawan dari active
    if [ "$ACTIVE" = "blue" ]; then
      TARGET="green"
    else
      TARGET="blue"
    fi

    # Cek apakah target masih berjalan
    TARGET_PORT=$(get_backend_port "$TARGET")
    if ! curl -sf "http://localhost:${TARGET_PORT}/health/ready" > /dev/null 2>&1; then
      warn "${TARGET} tidak berjalan, tidak bisa rollback"
      warn "Deploy ulang ${TARGET} dulu: $0 ${TARGET}"
      exit 1
    fi

    info "Rolling back to ${YELLOW}${TARGET}${NC}..."
    update_nginx_upstream "$TARGET"
    reload_nginx "$TARGET"
    ok "Rollback complete — now serving ${TARGET}"
    exit 0
    ;;
  blue|green)
    TARGET="$COMMAND"
    ;;
  deploy|"")
    TARGET=$(get_target_color)
    info "Auto-selected target: ${YELLOW}${TARGET}${NC}"
    ;;
  *)
    echo "Usage: $0 [blue|green|deploy|rollback|status|setup]"
    echo ""
    echo "  blue       Deploy ke environment blue"
    echo "  green      Deploy ke environment green"
    echo "  deploy     Auto-detect idle color dan deploy"
    echo "  active     Cetak warna yang sedang live"
    echo "  teardown   Bongkar warna lama: $0 teardown <blue|green>"
    echo "  migrate    Hanya jalankan migrasi database (tanpa deploy)"
    echo "  rollback   Switch ke environment sebelumnya"
    echo "  status     Tampilkan status blue & green"
    echo "  setup      Setup nginx untuk blue-green (dijalankan sekali)"
    exit 1
    ;;
esac

ACTIVE=$(get_active_color)

# ─── Validasi ───
if [ "$TARGET" = "$ACTIVE" ]; then
  warn "${TARGET} is already active. Proceeding with re-deploy (no downtime)."
fi

if ! docker info > /dev/null 2>&1; then
  err "Docker tidak berjalan"
  exit 1
fi

echo ""
echo "============================================"
echo " Blue-Green Deploy"
echo " Active : ${GREEN}${ACTIVE:-none}${NC}"
echo " Target : ${YELLOW}${TARGET}${NC}"
echo " Tag    : ${IMAGE_TAG}"
echo "============================================"
echo ""

# ─── Step 1: Pull ───
pull_images

# ─── Step 2: Deploy ke target ───
deploy_color "$TARGET"

# ─── Step 3: Smoke test ───
if ! smoke_test "$TARGET"; then
  err "Smoke test FAILED — target ${TARGET} tidak di-switch ke nginx"
  warn "Container ${TARGET} tetap berjalan untuk debugging."
  warn "Cek log: docker logs ${TARGET}-backend"
  warn "Untuk membersihkan: docker compose -p ${TARGET} -f docker-compose.blue-green.yml down"
  exit 1
fi

# ─── Step 3.5: Migrasi database ────────────────────────────────────────
# Dijalankan SEBELUM lalu lintas dialihkan. Kalau migrasi gagal, nginx tidak
# diswitch dan produksi tetap dilayani warna lama.
#
# DEFAULT 0 (NONAKTIF) — ini disengaja, bukan kelupaan. Alasannya:
#   Skema produksi dibuat dengan `drizzle-kit push`, yang TIDAK mencatat apa
#   pun ke tabel penanda migrasi. Akibatnya migrator menganggap semua berkas
#   migrasi belum pernah dijalankan, lalu mencoba mengulang semuanya dari
#   0000 — dan akan gagal karena tabelnya sudah ada.
#   Aktifkan hanya setelah jurnal migrasi direkonsiliasi, yaitu menandai
#   migrasi yang sudah diterapkan agar tidak diulang. Lihat
#   docs/audit-cicd-2026-08-31.md dan docs/implementation/03-data-model-database.md.
if [ "${RUN_MIGRATIONS:-0}" = "1" ]; then
  if ! run_migrations; then
    err "Migrasi GAGAL — ${TARGET} TIDAK dialihkan ke nginx."
    warn "Lalu lintas tetap di ${ACTIVE:-warna sebelumnya}. Perbaiki, lalu ulangi."
    warn "Untuk melewati: RUN_MIGRATIONS=0 $0 $TARGET"
    exit 1
  fi
else
  warn "RUN_MIGRATIONS tidak aktif — migrasi DILEWATI."
  warn "Kalau rilis ini mengubah skema, terapkan manual dulu:"
  warn "  bash scripts/deploy-blue-green.sh migrate"
fi

# ─── Step 4: Switch nginx ───
update_nginx_upstream "$TARGET"
if ! reload_nginx "$TARGET"; then
  err "Nginx reload FAILED"
  exit 1
fi

# ─── Step 5: Teardown warna lama (opsional) ───
if [ -n "$ACTIVE" ] && [ "$ACTIVE" != "$TARGET" ]; then
  echo ""
  if [ "$KEEP_OLD_COLOR" = "1" ]; then
    # Mode CI: biarkan warna lama hidup. Rollback masih mungkin kalau
    # verifikasi publik di langkah berikutnya gagal.
    warn "KEEP_OLD_COLOR=1 — ${ACTIVE} DIBIARKAN HIDUP untuk jaga-jaga rollback."
    warn "Setelah verifikasi publik lolos jalankan: $0 teardown ${ACTIVE}"
  elif [ "$AUTO_TEARDOWN" = "1" ]; then
    teardown_color "$ACTIVE"
  else
    read -r -p "$(echo -e "${YELLOW}Tear down old ${ACTIVE}? [y/N] ${NC}")" CONFIRM
    if [ "$CONFIRM" = "y" ] || [ "$CONFIRM" = "Y" ]; then
      teardown_color "$ACTIVE"
    else
      warn "Old ${ACTIVE} kept running — you can rollback with: $0 rollback"
    fi
  fi
fi

echo ""
ok "============================================"
ok " Deploy SUCCESS — now serving ${YELLOW}${TARGET}${NC}"
ok "============================================"
echo ""
show_status
