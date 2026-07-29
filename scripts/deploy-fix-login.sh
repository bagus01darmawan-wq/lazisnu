#!/bin/bash
# ============================================================
# Deploy Script: Fix Login Redirect + Rate Limit 500
# ------------------------------------------------------------
# Cara pakai: Copy-paste seluruh isi script ini ke terminal VM
#              setelah SSH ke ubuntu@43.128.98.52
# ============================================================
set -e

echo "=========================================="
echo " DEPLOY FIX: Login Redirect & Rate Limit"
echo "=========================================="
echo ""

PROJECT_DIR="/opt/lazisnu"
BRANCH="feature/sync-sprint-cleanup"

# ── Step 1: Navigasi ke project ──
echo "[1/6] Masuk ke direktori project..."
cd "$PROJECT_DIR"
echo "      PWD: $(pwd)"

# ── Step 2: Git pull latest ──
echo "[2/6] Git pull latest code..."
git fetch origin
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "$BRANCH" ]; then
  echo "      Branch saat ini: $CURRENT_BRANCH"
  echo "      Checkout ke $BRANCH..."
  git checkout "$BRANCH"
fi
git pull origin "$BRANCH"
echo "      Commit terbaru: $(git log --oneline -1)"

# ── Step 3: Verifikasi JWT_ACCESS_SECRET di backend .env ──
echo "[3/6] Verifikasi JWT_ACCESS_SECRET..."
if grep -q "JWT_ACCESS_SECRET" apps/backend/.env 2>/dev/null; then
  echo "      JWT_ACCESS_SECRET: TERISI ✅"
else
  echo "      ⚠️  JWT_ACCESS_SECRET TIDAK DITEMUKAN di apps/backend/.env!"
  echo "      Pastikan JWT_ACCESS_SECRET sudah diset (min 32 karakter)."
  echo "      Generate: openssl rand -hex 32"
  exit 1
fi

# ── Step 4: Rebuild & restart backend + web ──
echo "[4/6] Rebuild & restart backend + web..."
docker compose up -d --build backend web
echo "      Tunggu 10 detik untuk service siap..."
sleep 10

# ── Step 5: Cek status container ──
echo "[5/6] Cek status container..."
docker compose ps
echo ""

# ── Step 6: Smoke test ──
echo "[6/6] Smoke test login endpoint..."
echo "      Test 1: Kredensial salah (harus 401)..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST http://localhost:3001/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"test@example.com","password":"wrong"}')
if [ "$HTTP_CODE" = "401" ]; then
  echo "      → 401 INVALID_CREDENTIALS ✅"
else
  echo "      → $HTTP_CODE (expected 401) ⚠️"
fi

echo "      Test 2: Rate limit test (setelah 6x cepat → harus 429)..."
for i in $(seq 1 6); do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST http://localhost:3001/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"identifier":"ratelimit@test.com","password":"test123456"}' 2>/dev/null)
  echo "      Request #$i: $CODE"
done
echo "      (Harus ada 429 TOO_MANY_REQUESTS di atas)"

echo ""
echo "=========================================="
echo " DEPLOY SELESAI!"
echo "=========================================="
echo ""
echo "Cek log backend (jika ada masalah):"
echo "  docker compose logs --tail=50 backend"
echo ""
echo "Sekarang coba login di:"
echo "  https://dashboard.lazisnu.site"
echo ""
echo "⚠️  Tunggu minimal 1 menit sebelum test login"
echo "   (rate limit 5x/menit masih berlaku)"
