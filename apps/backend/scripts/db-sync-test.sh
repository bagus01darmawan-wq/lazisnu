#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# db-sync-test.sh — Reset test DB & apply Drizzle migrations (TD-03)
# ─────────────────────────────────────────────────────────────────────
#
# Akar masalah: `drizzle-kit push` tidak reliable untuk deteksi drift
# di test DB. Setelah schema berubah, test DB tidak auto-sync dan harus
# di-ALTER manual. Solusi: drop schema public + apply migration files.
#
# Usage:
#   pnpm db:reset-test          # reset & migrate test DB
#   bash scripts/db-sync-test.sh
#
# Environment (.env.test):
#   DATABASE_URL=postgresql://postgres:lazisnu_test_2026@localhost:5432/lazisnu_test
#
# Idempotent: aman dijalankan berulang.
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${BACKEND_DIR}"

# Load .env.test (override process env yang ada)
if [ ! -f ".env.test" ]; then
  echo "❌ ERROR: .env.test tidak ditemukan di ${BACKEND_DIR}"
  exit 1
fi

# shellcheck disable=SC1091
set -a; source .env.test; set +a

if [ -z "${DATABASE_URL:-}" ]; then
  echo "❌ ERROR: DATABASE_URL kosong di .env.test"
  exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TD-03: Reset Test DB & Apply Migrations"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "DB: ${DATABASE_URL}"
echo ""

# ─── Step 1: Drop schema public ───
echo "▶ [1/4] Drop schema public..."
psql "${DATABASE_URL}" -c "DROP SCHEMA IF EXISTS public CASCADE;" -c "CREATE SCHEMA public;" -c "GRANT ALL ON SCHEMA public TO public;"
echo "  ✅ Schema public dropped & re-created"
echo ""

# ─── Step 2: Apply migrations via drizzle-kit ───
echo "▶ [2/4] Apply migrations via drizzle-kit migrate..."
# drizzle-kit migrate membaca .env; kita inject DATABASE_URL env var
DATABASE_URL="${DATABASE_URL}" npx drizzle-kit migrate --config=drizzle.config.ts
echo "  ✅ Migrations applied"
echo ""

# ─── Step 3: Verify table count ───
echo "▶ [3/4] Verify table count..."
TABLE_COUNT=$(psql "${DATABASE_URL}" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';")
echo "  ℹ️  Tables in public: ${TABLE_COUNT// /}"

if [ "${TABLE_COUNT// /}" -lt 5 ]; then
  echo "  ⚠️  WARNING: Hanya ${TABLE_COUNT} tables. Seharusnya ≥ 5 (users, officers, donations, dll)"
  exit 1
fi
echo "  ✅ Table count looks healthy"
echo ""

# ─── Step 4: List applied migrations ───
echo "▶ [4/4] List applied migrations..."
MIGRATION_DIR="${BACKEND_DIR}/src/database/migrations"
if [ -d "${MIGRATION_DIR}" ]; then
  echo "  Migration files:"
  ls -1 "${MIGRATION_DIR}"/*.sql 2>/dev/null | while read -r f; do
    echo "    - $(basename "$f")"
  done
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Test DB siap. Jalankan integration test dengan:"
echo "   pnpm test:integration"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
