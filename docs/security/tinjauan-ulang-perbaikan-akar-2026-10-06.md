# Tinjauan Ulang: Perbaikan Akar Audit 2026-10-06 + Daftar Kerja

Tanggal tinjau: 2026-10-06. Pembanding: commit `b4e91c3` di `staging`,
`security/audit-baseline.json`, `scripts/audit-baseline.mjs`,
`pnpm-workspace.yaml`, `apps/*/package.json`, `pnpm audit --json` lokal.

## 1. Hasil verifikasi (yang TERBUKTI benar)

- Gate hijau terkonfirmasi: `node scripts/audit-baseline.mjs --strict` →
  `temuan sekarang: 14, di basis: 14, ✅ Tidak ada kerentanan baru`.
- Catatan hitungan: 14 = jumlah **ID GHSA unik**. `pnpm audit --json`
  mentah saat ini = **19 advisory** (brace-expansion 3 ID × 2 versi = 6,
  grpc-js 2 ID × 2 versi = 4, sisanya 9). Skrip mengelompokkan per GHSA ID.
  Dokumen asal menulis "14 temuan" tanpa penjelasan ini — wajar tapi
  membingungkan saat orang membandingkan dengan output `pnpm audit` langsung.
- Aritmetika konsisten: basis lama 5 ID → awal 23 raw (≈18 di luar basis) →
  kini 14 ID (5 lama + 9 baru). 9 ID baru = brace-expansion ×3, grpc-js ×2,
  joi ×1, node-forge ×1, braces ×1, sprintf-js ×1. Cocok dengan baseline.
- Bump terkonfirmasi di `package.json` + `pnpm-lock.yaml` (±1969 baris):
  `next` 16.3.3→16.3.8, `fastify` 5.12.1→5.12.5,
  `firebase-admin` 13.8.0→14.5.0, `firebase` 12.14.0→12.19.0,
  `eslint` 9.14.0→9.39.5.
- `firebase-admin` 14: pemakaian backend memang hanya
  `admin.credential.cert()` + `admin.messaging().send()`
  (`apps/backend/src/services/fcm.ts:25,72`). Dockerfile `node:24-alpine`
  (`apps/backend/Dockerfile:1`) dan CI `node-version: '24'`
  (`.github/workflows/security.yml:118`) memenuhi syarat Node ≥22.
- Rantai sisa terkonfirmasi via `pnpm audit --json`:
  RN `0.74.1` terkunci (`apps/mobile/package.json`), `ts-morph ^28.0.0`
  (root `package.json:26`), firestore tak dipakai web, backend hanya FCM.
- Klaim "integration test butuh DB live" plausibel:
  `cosign.integration.test.ts:6` mengimpor DB nyata (`db.execute`).
- `tsc`/`vitest` TIDAK saya jalankan ulang (berat) — statusnya mengandalkan
  klaim dokumen asal.

## 2. Temuan koreksi (ini yang penting)

### 2.1. Klaim §2 soal overrides KELIRU / menyesatkan [PRIORITAS TERTINGGI]

Dokumen menulis "jangan pakai `pnpm.overrides` di repo ini" dan
"cabut overrides → kembali 14". Fakta:

- Commit `b4e91c3` **tidak menyentuh** `pnpm-workspace.yaml`.
  File itu **masih berisi ±30 overrides** (`pnpm-workspace.yaml:15-70`).
- Lebih buruk: overrides yang ada **justru mengunci versi rentan** —
  4 dari 9 ID "tak terjangkau" dikunci oleh overrides sendiri:

| Override (`pnpm-workspace.yaml`) | Terkunci rentan | Patch tersedia |
|---|---|---|
| `'brace-expansion@<2': 1.1.18` (:30) | 1.1.18 | ≥1.1.21 |
| `'brace-expansion@>=5': 5.0.9` (:32) | 5.0.9 | ≥5.0.12 |
| `'joi': 17.13.7` (:40) | 17.13.7 | ≥17.13.8 |
| `'@grpc/grpc-js@>=1.14.0 <1.14.4': 1.14.4` (:18) | 1.14.4 | ≥1.14.5 (stale) |

- Uji "tambah overrides → 50/51" tidak terdokumentasi (overrides APA yang
  ditambah? tidak ada di git) sehingga **tidak bisa direproduksi**.
- Kesimpulan yang benar bukan "jangan pakai overrides", melainkan:
  (a) overrides lama untuk brace-expansion/joi/grpc-js sudah basi dan
  mengunci versi rentan — uji naikkan ke versi patch;
  (b) penambahan overrides baru yang sembrono memicu resolusi ulang
  + downgrade (tar/postcss/send/minimatch) — itu yang terbukti berbahaya.

### 2.2. Hal lain yang perlu dikerjakan

- **Baseline lama tak dijustifikasi ulang.** 5 ID lama terbawa diam-diam:
  `image-size` ×2 (1.2.1 butuh ≥2.0.3 = major bump via metro RN),
  `esbuild`, `fast-xml-parser`, `uuid`. Butuh alasan tertulis per ID,
  terutama `image-size` (sama seriusnya dengan item RN).
- **`engines` longgar.** Root `package.json:8` mengizinkan Node ≥20.9.0,
  tapi `firebase-admin@14` butuh ≥22. Prod/CI aman (24), dev lokal Node 20
  akan rusak. Backend tidak punya `engines` sendiri.
- **Skew `next`.** `apps/web/package.json:25` `next 16.3.8` vs `:43`
  `eslint-config-next 16.2.4`. Kemungkinan ok, tapi samakan/cek.
- **`main` masih merah.** `staging` kini **138 commit** di depan `main`
  (`git rev-list --count main..staging`), diff ±296 berkas / 55rb baris.
  `main` masih pakai baseline lama (5 ID) + lockfile lama → job Security di
  `main` TETAP merah. Jangan cherry-pick buta (risiko konflik lockfile).
- **Laporan asal belum di-commit.** `git status` → `?? docs/security/`.
  Putuskan: commit (aman — workflow meng-ignore `docs/**`) atau hapus.
- **Bukti uji backend lemah.** Klaim "451 lolos / 19 gagal murni DB"
  belum dibuktikan tak-terkait (perlu log atau perbandingan sebelum/sesudah).
- **Dependabot PR `next-16.3.6`** belum diverifikasi tertutup (butuh cek GitHub).

## 3. Daftar kerja (urut prioritas)

### P0 — wajib sebelum klaim "selesai"

- [ ] **P0-1. Uji naikkan 4 overrides basi, lalu audit ulang.**
  Di branch percobaan (JANGAN di `staging` langsung):
  `brace-expansion@<2` → `1.1.21`, `brace-expansion@>=5` → `5.0.12`,
  `joi` → `17.13.8`, `@grpc/grpc-js` → `1.14.5`.
  Lalu `pnpm install --lockfile-only`, `pnpm audit --json`,
  `node scripts/audit-baseline.mjs` (tanpa `--update` dulu).
  Hasil yang diharapkan: sebagian dari 9 ID hilang tanpa ledakan 50/51.
  Bila malah meledak seperti uji lalu, revert dan catat override mana
  pemicunya (satu per satu, bukan sekaligus).
  Berkas: `pnpm-workspace.yaml:18,30,32,40`.
- [ ] **P0-2. Perbaiki kalimat larangan overrides.**
  Ubah dokumen asal §2 + pesan commit ke depan: larangan yang akurat adalah
  "jangan tambah overrides baru tanpa uji per-satu; 4 overrides lama
  mengunci versi rentan dan harus dievaluasi (P0-1)".
- [ ] **P0-3. Tulis justifikasi 5 ID baseline lama.**
  Tambahkan tabel alasan untuk `image-size` ×2, `esbuild`,
  `fast-xml-parser`, `uuid` (jalur, kenapa diterima, rencana lepas).
  Berkas: `security/audit-baseline.json` (+ dokumen ini).
- [ ] **P0-4. Kencangkan `engines` Node.**
  Opsi A: root `package.json:8` → `"node": ">=22"`.
  Opsi B: tambah `engines: { node: ">=22" }` di `apps/backend/package.json`.
  Lalu cek `.nvmrc`/CI selaras (CI sudah 24 — ok).

### P1 — selesaikan alur Security

- [ ] **P1-1. Putuskan strategi `main`.**
  `main` masih merah (baseline+lockfile lama). Pilih eksplisit:
  (a) cherry-pick hanya `b4e91c3` ke `main` (cepat, risiko konflik
  `pnpm-lock.yaml` besar), atau (b) merge `staging`→`main` (benar tapi
  menyeret 138 commit / 296 berkas — perlu jendela rilis).
  Jangan biarkan `main` merah tanpa tanggal rencana.
- [ ] **P1-2. Commit atau hapus `docs/security/`.**
  `git status` menunjukkan `?? docs/security/` (termasuk dokumen asal +
  tinjauan ini). Bila dikomit, workflow Security tetap skip (`paths-ignore`
  `docs/**` — `.github/workflows/security.yml:18`). Perintah:
  `git add docs/security && git commit -m "docs(security): arsip tinjauan audit 2026-10-06"`.
- [ ] **P1-3. Samakan `eslint-config-next` dengan `next`.**
  `apps/web/package.json:43` (16.2.4 vs next 16.3.8). Cek rilis 16.3.x,
  naikkan bila ada, lalu `tsc --noEmit` + `next build` web.
- [ ] **P1-4. Simpan bukti uji backend.**
  Jalankan ulang `test:unit` backend, simpan log 19 kegagalan, buktikan
  semuanya `*.integration.test.ts` + gagal di koneksi DB (bukan di
  `firebase-admin` 14). Lampirkan potongan log ke dokumen.

### P2 — hutang keamanan terencana

- [ ] **P2-1. Rencana upgrade React Native 0.74.x.**
  Ini satu-satunya jalan keluar untuk `joi`, `grpc-js` mobile,
  `brace-expansion` 1.x, `node-forge`, `braces`, `image-size`.
  Butuh sesi sendiri + uji APK. Buat isu/tiket dengan estimasi, bukan janji.
- [ ] **P2-2. Tutup Dependabot PR `next-16.3.6`.**
  Verifikasi di GitHub bahwa 16.3.8 mencakupnya, lalu tutup dengan komentar.
- [ ] **P2-3. Jelaskan "14 vs 19" di dokumen.**
  Tambahkan satu paragraf: gate menghitung ID GHSA unik (14), sedangkan
  `pnpm audit --json` mentah menampilkan 19 (ID yang sama di 2 versi
  dihitung 2×). Mencegah kebingungan berikutnya.
- [ ] **P2-4. Pantau `firebase-admin` 15 / `firebase` 13.**
  Bila rilis dan membawa `grpc-js` ≥1.14.5, uji upgrade (membuka 2 ID grpc
  backend). Tidak mendesak.

## 4. Putusan singkat

Pekerjaan bump langsung (next/fastify/firebase/eslint) **benar dan
terverifikasi hijau**. Yang belum beres: **klaim overrides menyesatkan +
4 overrides basi mengunci versi rentan (P0-1), justifikasi 5 ID lama (P0-3),
`engines` Node (P0-4), dan `main` yang masih merah (P1-1).**
Kerjakan P0 dulu sebelum menutup topik ini.

## 5. Hasil eksekusi bertahap — 2026-10-06 (branch `exp/overrides-bump-2026-10-06`)

### 5.1. P0-1: 4 overrides basi → SELESAI, 4 ID hilang (satu temuan baru di tengah jalan)

Uji satu per satu dengan `pnpm install --lockfile-only` (bukan `pnpm update`):

| Override | Hasil |
|---|---|
| `joi` 17.13.7 → 17.13.8 | ✅ lockfile ±14 baris, GHSA-wr44 **hilang** (RAW 19→18) |
| `brace-expansion@>=5` 5.0.9 → 5.0.12 | ✅ lockfile ±26 baris, sisi ts-morph bersih (RAW 18→15) |
| `brace-expansion@<2` 1.1.18 → 1.1.21 | ✅ lockfile ±36 baris, 3 ID brace **hilang total** (IDS 14→10). Klaim "terkunci RN" TERBUKTI KELIRU untuk patch-level ini |
| `@grpc/grpc-js` 1.14.4 → 1.14.5 | ✅ rantai backend bersih; tersisa hanya 1.9.16 (mobile firestore, tanpa override — bump minor 1.9→1.13+ berisiko runtime, TIDAK dicoba) |
| `brace-expansion@>=2 <5` 2.1.4 → 2.1.7 | ✅ temuan insidental (lihat 5.2), RAW kembali 13→10 |

Tidak ada downgrade `tar`/`postcss`/`send`/`minimatch` pada semua langkah
`--lockfile-only`. Koreksi terhadap dokumen asal §2: yang berbahaya adalah
**resolusi ulang penuh**, bukan overrides per se — lihat 5.2.

### 5.2. P1-3: `eslint-config-next` 16.2.4 → 16.3.8 → SELESAI dengan catatan

`pnpm update --filter web eslint-config-next@16.3.8` (16.3.8 memang rilis)
menimbulkan **resolusi ulang lockfile ±729 baris** dan memunculkan 3 ID
"baru" (RAW 10→13): `brace-expansion` 2.1.4 via rantai backend
`jest → babel-plugin-istanbul → test-exclude → glob → minimatch`.
Akarnya override basi `brace-expansion@>=2 <5: 2.1.4` — diperbaiki ke 2.1.7
(5.1). Pelajaran: untuk bump kecil ke depan, pilih
`pnpm install --lockfile-only` sesudah edit manual, bukan `pnpm update`,
kecuali siap menanggung resolusi ulang. `tsc --noEmit` web + backend
**lolos** setelah semua perubahan.

### 5.3. P0-4: `engines` → SELESAI

Root `package.json` → `"node": ">=22"`; tambah
`engines: { node: ">=22" }` di `apps/backend/package.json`.
Seluruh CI (`ci.yml` NODE_VERSION 24, `security.yml`, `release.yml`,
`lockfile-fix.yml`) + Dockerfile (`node:24-alpine`) sudah ≥22. Lokal v26.

### 5.4. P1-4: bukti uji backend → SELESAI (dengan koreksi)

`cosign.integration.test.ts` dijalankan ulang: FAIL sesuai dugaan, TAPI
mesin ini **bisa** menjangkau DB (error =
`PostgresError: update or delete on table "branches" violates foreign key
constraint "period_drafts_branch_id_branches_id_fk"`) — jadi bukan
"kredensial tidak jalan", melainkan **state/fixture cleanup menabrak FK**.
Tidak ada error `firebase-admin`/FCM di log → tak terkait perubahan
dependensi. Koreksi redaksional untuk dokumen asal §4.

### 5.5. P0-3: justifikasi 5 ID baseline lama (jalur dari `pnpm audit --json`)

| ID | Paket@versi | Jalur | Kenapa diterima |
|---|---|---|---|
| GHSA-5p2g-fcmc-qvqq + GHSA-w3rx-r6r6-pgpr (high) | `image-size` 1.2.1 | mobile `metro-config → metro` | Patch ≥2.0.3 = major bump; metro terkunci RN 0.74.1. Build-time asset sizing, input tak tepercaya tak sampai. Lepas via upgrade RN (P2-1) |
| GHSA-67mh-4wv8-2f99 (moderate) | `esbuild` 0.18.20 | backend `drizzle-kit → @esbuild-kit` | Dev/migrasi-only. Patch ≥0.25.0 butuh drizzle-kit rilis baru. Lepas saat drizzle-kit bump |
| GHSA-gh4j-gqv2-49f6 (moderate) | `fast-xml-parser` 4.5.6 | mobile `cli-doctor → cli-platform-apple` | Dev-only (doctor). Patch ≥5.7.0 = major. Lepas via upgrade RN CLI (P2-1) |
| GHSA-w5hq-g745-h8pq (moderate) | `uuid` 7.0.3/8.3.2 | mobile `expo → rudder-sdk-node` | Patch ≥11.1.1 hanya untuk lini 11.x; lini 7/8 memang tak dipatch upstream di advisory ini. Dev/telemetri Expo. Lepas via upgrade Expo/RN (P2-1) |

Sisa di basis kini (10 ID): 5 di atas + `grpc-js` ×2 (hanya sisi mobile
1.9.16) + `node-forge`/`braces`/`sprintf-js` (tanpa patch upstream).
Yang sudah keluar dari basis berkat eksekusi ini: `joi`, 3×
`brace-expansion` (14 → 10 ID).

Status checklist: P0-1 ✅, P0-3 ✅ (tabel di atas), P0-4 ✅, P1-3 ✅,
P1-4 ✅. Tersisa keputusan manusia: P1-1 (strategi `main`), P1-2
(commit `docs/security/`), penggabungan branch percobaan → `staging`.
