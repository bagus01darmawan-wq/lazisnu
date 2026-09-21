#!/usr/bin/env bash
# ============================================================================
#  Gerbang mutu LOKAL — cermin job "Verify (lint · format · typecheck)" di
#  .github/workflows/ci.yml, supaya kegagalan format/lint ketahuan SEBELUM
#  push, bukan setelah CI merah.
#
#  Kenapa ada: dari 10 kegagalan CI nyata (15–20 Sep 2026), 5 di antaranya
#  format/lint — 4 di paket mobile. Semua itu bisa dicegah di laptop.
#
#  Pakai:
#    bash scripts/cek-lokal.sh                    # area yang berubah saja
#    bash scripts/cek-lokal.sh --semua            # paksa semua area
#    bash scripts/cek-lokal.sh --base origin/staging
#    bash scripts/cek-lokal.sh --perbaiki         # prettier --write + eslint --fix dulu
#
#  Keluar 0 = hijau. Keluar 1 = ada langkah gagal (ringkasan di akhir).
#  pnpm tidak ada di PATH → lewat dengan peringatan (fail-open: gerbang lokal
#  tidak boleh memblokir kerja hanya karena tooling belum siap).
# ============================================================================
set -uo pipefail

akar_repo="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$akar_repo" ]; then
  echo "⚠️  Bukan direktori git — gerbang lokal dilewati."
  exit 0
fi
cd "$akar_repo"

PERBAIKI=0
SEMUA=0
BASE="${BASE:-}"

while [ $# -gt 0 ]; do
  case "$1" in
    --perbaiki) PERBAIKI=1 ;;
    --semua)    SEMUA=1 ;;
    --base)     shift; BASE="${1:-}" ;;
    -h|--help)  sed -n '2,18p' "$0"; exit 0 ;;
    *) echo "Argumen tidak dikenal: $1 (lihat --help)"; exit 2 ;;
  esac
  shift
done

if ! command -v pnpm >/dev/null 2>&1; then
  echo "⚠️  pnpm tidak ada di PATH — gerbang lokal dilewati (fail-open)."
  exit 0
fi

# ─── Tentukan area yang berubah (mengikuti paths-filter di ci.yml) ──────────
B_BACKEND=0; B_WEB=0; B_MOBILE=0; B_INFRA=0

if [ "$SEMUA" = 1 ]; then
  B_BACKEND=1; B_WEB=1; B_MOBILE=1; B_INFRA=1
  echo "▶ Mode --semua: seluruh area diperiksa."
else
  if [ -z "$BASE" ]; then
    if git rev-parse --abbrev-ref '@{push}' >/dev/null 2>&1; then
      BASE="$(git rev-parse --abbrev-ref '@{push}')"
    elif git rev-parse --verify -q origin/main >/dev/null 2>&1; then
      BASE="origin/main"
    elif git rev-parse --verify -q origin/staging >/dev/null 2>&1; then
      BASE="origin/staging"
    fi
  fi

  berkas=""
  if [ -n "$BASE" ] && git rev-parse --verify -q "$BASE" >/dev/null 2>&1; then
    berkas="$(git diff --name-only "$BASE"...HEAD 2>/dev/null || true)"
  fi
  berkas="$berkas
$(git diff --name-only 2>/dev/null || true)
$(git diff --name-only --cached 2>/dev/null || true)
$(git ls-files --others --exclude-standard 2>/dev/null || true)"
# Baris terakhir = berkas BARU yang belum di-add. Sengaja ikut: berkas baru
# justru yang paling sering belum rapi (dan akan ikut ke commit Anda).

  while IFS= read -r f; do
    [ -n "$f" ] || continue
    case "$f" in
      apps/backend/*|packages/shared-types/*) B_BACKEND=1 ;;
    esac
    case "$f" in
      apps/web/*|packages/shared-types/*) B_WEB=1 ;;
    esac
    case "$f" in
      apps/mobile/*|packages/shared-types/*) B_MOBILE=1 ;;
    esac
    case "$f" in
      pnpm-lock.yaml|pnpm-workspace.yaml) B_BACKEND=1; B_WEB=1; B_MOBILE=1 ;;
    esac
    case "$f" in
      .github/workflows/*|scripts/*|nginx/*|prometheus/*|docker-compose*) B_INFRA=1 ;;
    esac
  done <<< "$berkas"

  # Tidak ada perubahan yang bisa dibaca → jangan menebak "tidak ada apa-apa";
  # periksa semua (arah aman, sama seperti keputusan `decide` di ci.yml).
  if [ -z "${berkas//[[:space:]]/}" ]; then
    echo "▶ Tidak ada berkas berubah yang terdeteksi — semua area diperiksa (arah aman)."
    B_BACKEND=1; B_WEB=1; B_MOBILE=1; B_INFRA=1
  else
    echo "▶ Area berubah (base: ${BASE:-tanpa base}): backend=$B_BACKEND web=$B_WEB mobile=$B_MOBILE infra=$B_INFRA"
  fi
fi

# infra (workflow/skrip) menyentuh semua lint — sama seperti ci.yml.
if [ "$B_INFRA" = 1 ]; then
  B_BACKEND=1; B_WEB=1; B_MOBILE=1
fi

# ─── Mode perbaiki (prettier --write + eslint --fix) ────────────────────────
# Catatan CRLF: di Windows core.autocrlf=true, berkas yang ekstensinya TIDAK
# terdaftar "eol=lf" di .gitattributes (mis. *.mjs) keluar sebagai CRLF di
# working tree, sementara Prettier defaultnya endOfLine=lf → muncul alarm palsu
# yang tidak terjadi di CI (checkout Linux selalu LF). Karena itu pengecekan
# Prettier lokal dijalankan dengan --end-of-line auto: isi tetap diperiksa,
# hanya urusan akhir baris yang diabaikan (git tetap menormalkan saat commit).
# Catatan lingkup --perbaiki: HANYA berkas yang berubah yang disentuh.
# "eslint . --fix" pernah dipakai dan ikut merapikan berkas lain yang tidak
# ada hubungannya (aturan taraf-warning, mis. curly) → diff jadi kotor tanpa
# diminta. Jadi perbaikan dijalankan per-berkas, per-area.
perbaiki_area() {
  local dir="$1" daftar satu
  daftar="$(printf '%s\n' "$berkas" | grep -E "^${dir}/.*\.(ts|tsx|js|jsx|mjs|cjs|json)$" | sed "s|^${dir}/||" | sort -u)"
  if [ -z "$daftar" ]; then
    echo "   • ${dir}: tidak ada berkas berubah — dilewati."
    return 0
  fi
  satu="$(printf '%s' "$daftar" | tr '\n' ' ')"
  echo "   • ${dir}: ${satu}"
  # shellcheck disable=SC2086 — sengaja tanpa kutip: ini daftar berkas per spasi.
  ( cd "${akar_repo}/${dir}" && pnpm exec eslint --fix $satu ) >/dev/null 2>&1 || true
  ( cd "${akar_repo}/${dir}" && pnpm exec prettier --write --end-of-line auto $satu ) >/dev/null 2>&1 || true
}

if [ "$PERBAIKI" = 1 ]; then
  echo "▶ Mode --perbaiki: merapikan berkas yang berubah saja ..."
  [ "$B_WEB" = 1 ]    && perbaiki_area apps/web
  [ "$B_MOBILE" = 1 ] && perbaiki_area apps/mobile
  echo ""
fi

# ─── Daftar langkah (urutan & syarat mengikuti ci.yml) ──────────────────────
nama_langkah=()
perintah_langkah=()

tambah() { nama_langkah+=("$1"); perintah_langkah+=("$2"); }

tambah "Build shared types" "pnpm build:shared"
[ "$B_BACKEND" = 1 ] && tambah "Lint backend (tsc --noEmit)"   "pnpm --filter lazisnu-backend run lint"
[ "$B_WEB" = 1 ]     && tambah "Lint web (eslint)"             "pnpm --filter web run lint"
[ "$B_MOBILE" = 1 ]  && tambah "Lint mobile (eslint)"          "pnpm --filter lazisnu-collector-app run lint"
[ "$B_MOBILE" = 1 ]  && tambah "Prettier check (mobile)"       "pnpm --filter lazisnu-collector-app exec prettier --check . --end-of-line auto"
tambah "Typecheck semua workspace" "pnpm -r exec tsc --noEmit"
[ "$B_BACKEND" = 1 ] && tambah "Cek migration orphans"         "pnpm --filter lazisnu-backend db:check-orphans"

# ─── Jalankan ───────────────────────────────────────────────────────────────
gagal=0
hasil=()
i=0
while [ $i -lt ${#nama_langkah[@]} ]; do
  nama="${nama_langkah[$i]}"
  cmd="${perintah_langkah[$i]}"
  mulai=$(date +%s)
  printf '▶ %s ... ' "$nama"
  if eval "$cmd" >/tmp/cek-lokal-out.txt 2>&1; then
    printf 'OK (%ss)\n' "$(( $(date +%s) - mulai ))"
    hasil+=("OK   $nama")
  else
    printf 'GAGAL (%ss)\n' "$(( $(date +%s) - mulai ))"
    echo "     perintah: $cmd"
    tail -n 25 /tmp/cek-lokal-out.txt | sed 's/^/     | /'
    hasil+=("GAGAL $nama")
    gagal=1
  fi
  i=$((i + 1))
done

echo ""
echo "──────── Ringkasan gerbang lokal ────────"
for h in "${hasil[@]}"; do
  echo "  $h"
done

if [ "$gagal" = 1 ]; then
  echo ""
  echo "Ada langkah gagal. Perbaiki otomatis dengan: bash scripts/cek-lokal.sh --perbaiki (lalu ulangi cek)."
  echo "CI akan menolak push seperti ini — lebih murah ketahuan di sini."
  exit 1
fi

echo ""
echo "✅ Semua langkah hijau."
exit 0
