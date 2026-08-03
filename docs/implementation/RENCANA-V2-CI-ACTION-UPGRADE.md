# Rencana Migrasi CI — Upgrade GitHub Actions ke Node 24

> Dibuat: 2026-08-01 | Review ulang: 2026-08-01 (**REVIEWED — 2 koreksi faktual kritis diterapkan, lihat §3.3 & §3.4**) | **APPROVED 2026-08-01** — keputusan D1-D5 terkunci (lihat §8) | **✅ SELESAI 2026-08-01** — Batch A+B merged (PR #18/#19), Gate 1-3 lulus, 0 annotation deprecation, staging OK
> File ini adalah rencana tunggal yang bisa ditinjau ulang/dikonfirmasi ulang sebelum eksekusi.
> Berlaku untuk: `.github/workflows/ci.yml` (satu-satunya workflow di repo — terverifikasi)

---

## 1. Latar Belakang & Mengapa Ini Perlu

GitHub menghentikan runtime Node.js 20 di GitHub-hosted runners:

| Tanggal | Peristiwa | Dampak ke proyek |
|---------|-----------|------------------|
| April 2026 | Node.js 20 EOL (tanpa security patch) | Risiko supply-chain |
| 16 Juni 2026 | Runner default Node 24; action node20 **dipaksa** jalan di node24 | **SUDAH TERJADI** — CI masih hijau karena action kebetulan kompatibel |
| **16 September 2026** | Node 20 runtime **dihapus total dari runner**. Action yang `runs.using: node20` → **FAIL HARD, tanpa opt-out** | **CI mati total** |

> Tanggal **16 September 2026** adalah tanggal resmi yang tercantum di teks warning Annotation GitHub: *"Node.js 20 will be removed from the runner on September 16th, 2026."* (bukan perkiraan "Fall 2026" seperti draft awal).

Kesimpulan: upgrade **wajib selesai sebelum 16 September 2026**. Dari 1 Agustus tersisa **~46 hari** — tidak mendesak hari ini, tapi target aman: **tuntas sebelum 1 September 2026** agar ada buffer 2 minggu.

> ⚠️ Catatan penting: sejak 16 Juni, action kita **sudah berjalan di Node 24** (dipaksa) dan lulus. Ini bukti empiris bahwa mayoritas action kompatibel node24 — risiko utama hanya deklarasi `runs.using: node20` yang akan **ditolak runner mulai 16 September 2026**.

---

## 2. Inventarisasi Action Saat Ini (Audit)

Hasil grep `uses:` di `.github/workflows/ci.yml` (diverifikasi ulang 2026-08-01, **100% cocok**):

| # | Action | Versi dipakai | Lokasi di ci.yml | `runs.using` | Perlu diubah? |
|---|--------|--------------|-------------------|--------------|---------------|
| 1 | `actions/checkout` | v4 | 4× (semua job: L37, L86, L133, L172) | node20 | ✅ `@v5` (node24). v6 juga sudah rilis; pilih v5 (matang), v6 nanti via Dependabot |
| 2 | `actions/setup-node` | v4 | lint-and-typecheck (L45) | node20 | ✅ `@v5` (node24). **Jangan loncat ke v6** — lihat §3.4 |
| 3 | `pnpm/action-setup` | v3 | lint-and-typecheck (L40) | node20 | ⚠️ **KOREKSI §3.3** — pin `@v5.0.0` (rekomendasi), atau hapus+ganti corepack. Jangan tag mengambang |
| 4 | `docker/login-action` | v3 | build-image (L89) | node20 | ✅ `@v4` / pin `@v4.2.0` (node24) |
| 5 | `docker/setup-buildx-action` | v3 | build-image (L96) | node20 | ✅ `@v4` / pin `@v4.1.0` (node24). v4 menghapus input deprecated — **ci.yml tidak pakai input apa pun → aman** |
| 6 | `docker/build-push-action` | v6 | build-image (L99, L111 — 2×) | node20 | ⚠️ `@v7` / pin `@v7.3.0` (node24) — ada breaking change, lihat §3.2 |
| 7 | `appleboy/ssh-action` | v1 | deploy (L136), deploy-staging (L175) | **docker** (bukan JS) | ❌ **TIDAK terpengaruh** — jangan diubah |

---

## 3. Temuan Riset (Kenapa "bump major" BUKAN jawaban sederhana)

### 3.1 Cacat rencana test yang umum dilakukan
`build-image` di [ci.yml L78](file:///c:/Users/user/Documents/lazisnu/.github/workflows/ci.yml#L78) hanya jalan di `push`/`workflow_dispatch` — **tidak jalan di PR** (terverifikasi: `if: github.event_name == 'push' || github.event_name == 'workflow_dispatch'`). Jadi upgrade `docker/*` **tidak akan teruji** oleh PR biasa. Test lewat PR hanya valid untuk action yang dipakai di `lint-and-typecheck`.

### 3.2 `docker/build-push-action@v7` — ada breaking change nyata (terverifikasi via release notes v7.0.0)
Rilis v7 menghapus:
- Dukungan "legacy export-build tool support for build summary"
- Env deprecated (`DOCKER_BUILD_NO_SUMMARY`, `DOCKER_BUILD_EXPORT_RETENTION_DAYS`)
- Menuntut runner ≥ v2.327.1 (hosted runner sudah OK — log publik membuktikan runner hosted kini 2.334.0+)
- Pindah ke ESM + bump `@actions/core` 3.0.0 (internal, tidak menyentuh workflow kita)

**Verifikasi terhadap ci.yml kita**: kita tidak memakai env deprecated tersebut maupun input lama → perubahan seharusnya transparan. Tetap wajib **diuji langsung** pada job build-image (§3.1), bukan dianggap aman. Versi terkini saat review: **v7.3.0**.

### 3.3 `pnpm/action-setup` — situasi tag berantah + KOREKSI KRITIS
**Fakta tag (terverifikasi dari issue pnpm/action-setup#210, komentar MikeMcC399):**
- Tag `v4` **dipindah** menunjuk ke rilis node24 (`fc06bc1` = `v4.4.0` = `v5.0.0`, satu commit sama)
- Rilis node24 itu **merusak pipeline** sebagian orang (issue #210) — **tapi penyebabnya spesifik: self-hosted runner versi lama** (< v2.327.1). GitHub-hosted runner sudah jauh lebih baru → **tidak berlaku untuk kita**
- Versi stabil node20 = `v4.3.0` (`b906aff`, revert dari #205)

**⛔ KOREKSI KRITIS terhadap draft awal** — draft lama menulis: Opsi C "HAPUS `pnpm/action-setup` — `actions/setup-node@v5` punya auto-install pnpm dari field `packageManager`". **Ini SALAH FAKTUAL:**
- `setup-node` (v5 maupun v6) **tidak pernah meng-install pnpm**. Fitur baru v5 hanyalah **auto-*caching*** dari field `packageManager` (PR actions/setup-node#1348), dan README eksplisit menyatakan *"Package manager should be pre-installed"*.
- Jika action dihapus tanpa pengganti → step `pnpm install` gagal (`command not found`) dan/atau cache step setup-node gagal (`pnpm store path`) → **CI merah**.
- Runner ubuntu-latest memang pre-install pnpm di imagenya, tapi versinya **mengambang** — melanggar prinsip §4 poin 3.

**Opsi yang valid (dikoreksi):**
- **Opsi A (REKOMENDASI BARU)**: pin `pnpm/action-setup@v5.0.0` — node24 resmi, perubahan satu baris, perilaku identik dengan sekarang (`version: 10`). Issue #210 tidak relevan untuk hosted runner.
- **Opsi B**: pin `pnpm/action-setup@v4.3.0` (node20 stabil) — tetap `runs.using: node20` → **ditolak runner mulai 16 Sept 2026**. Hanya berguna sebagai fallback darurat sesaat, bukan solusi.
- **Opsi C (dikoreksi)**: HAPUS `pnpm/action-setup`, ganti dengan step `corepack enable` **SEBELUM** setup-node. Node target `'20'` (toolchain di job) mengandung corepack; corepack membaca `packageManager: pnpm@10.33.2` di root package.json → mengaktifkan pnpm **persis 10.33.2** (paling deterministik). Syarat mutlak: urutan step `corepack enable` → `setup-node` → `pnpm install`.

**Syarat urutan yang berlaku untuk SEMUA opsi**: pnpm harus sudah tersedia **sebelum** `actions/setup-node` jalan, karena cache setup-node memanggil `pnpm store path`. Urutan `ci.yml` sekarang (Install pnpm → Setup Node) sudah benar dan **harus dipertahankan**.

### 3.4 `actions/setup-node` — perilaku caching berubah (DITAMBAH: v5 vs v6)
- **v5.0.0** (node24): menambah **auto-cache** — jika field `packageManager` valid ada di package.json, caching nyala otomatis (default `package-manager-cache: true`). Repo kita punya `packageManager: pnpm@10.33.2` → auto-cache pnpm **akan aktif** jika input `cache:` dihapus.
- **v6.0.0 (sudah rilis!)**: breaking change — **auto-cache dibatasi hanya npm** (PR #1374). Artinya di v6, pnpm **tidak** di-auto-cache; input `cache: 'pnpm'` eksplisit kembali wajib.
- Dua konfigurasi yang VALID (pilih satu, jangan campur keduanya):
  1. `setup-node@v5` **tanpa** `cache:` eksplisit → auto-cache pnpm (syarat §3.3: pnpm ter-install lebih dulu). ← **Rekomendasi**
  2. `setup-node@v5` atau `@v6` + `cache: 'pnpm'` **dan** `package-manager-cache: false` → perilaku eksplisit identik di kedua versi.
- Menyalakan keduanya tanpa sadar (auto + eksplisit) = sumber kebingungan duplikasi cache — inilah yang ingin dihindari §3.4 draft awal, dan masih valid.

### 3.5 `appleboy/ssh-action@v1` — TIDAK disentuh
Berbasis Docker container (`drone-ssh`), bukan JavaScript action — bebas dari deprecation Node 20. Mengubahnya tanpa alasan = risiko tak perlu.

---

## 4. Prinsip Pendekatan (Aman Bertahap)

1. **Satu batch = satu sumber risiko** — pisahkan action testable-di-PR vs testable-hanya-di-push
2. **Uji sebelum merge** — setiap batch diuji pada jalur yang BENAR-BENAR menjalankannya
3. **Pin versi, bukan tag mengambang** — wajib untuk action third-party (`pnpm/action-setup`, `docker/*`); untuk `actions/*` (first-party GitHub) tag major `@v5` dapat diterima
4. **Rollback selalu tersedia** — revert commit CI = CI kembali ke versi lama (hijau)
5. **Jangan sentuh yang bekerja** — `appleboy/ssh-action`, `node-version: '20'` (toolchain test/lint, beda konteks dari runtime action), Dockerfile `node:20-alpine` di kedua apps (terverifikasi) tetap dipertahankan
6. **Waktu pelaksanaan**: di luar window deployment produksi / saat traffic rendah
7. **Runner**: semua action node24 butuh runner ≥ v2.327.1. Proyek ini 100% GitHub-hosted (`ubuntu-latest`) → otomatis terpenuhi; tidak perlu aksi apa pun (issue pnpm #210 hanya menimpa self-hosted lama)

---

## 5. Rencana Eksekusi Bertahap

### Phase 0 — Baseline & Snapshot (sebelum menyentuh apa pun)
- [x] Catat hash CI run terakhir yang hijau (run `30654929726` / commit `d32842c`) — **terverifikasi**: HEAD main = `d32842c` saat mulai
- [x] Screenshot/export annotation deprecation sebagai bukti "sebelum" — **terdokumentasi**: annotation `docker/*` masih muncul di run main pasca Batch A; hilang total setelah Batch B
- [x] Konfirmasi smoke test staging OK (sudah diverifikasi 2026-08-01) — **staging-api 200 / staging-web 307**
- **Gate 0**: baseline tercatat → lanjut — **LULUS**

### Phase 1 — Batch A: action di `lint-and-typecheck` (testable via PR)
File: action #1, #2, #3 (lihat tabel §2)
- [x] `actions/checkout@v4` → `@v5` di **keempat** kemunculan sekaligus (L37, L86, L133, L172) — **DONE** di ci.yml. Tidak semua teruji via PR, tapi cakupan ujinya bertahap: **L37** teruji di PR (Phase 1) → **L86** teruji di workflow_dispatch (Phase 2) → **L172** teruji otomatis saat merge ke main (Phase 3). Hanya **L133** (deploy produksi, tag `v*`) yang tanpa jalur uji dini — risiko diterima: v4→v5 hanya bump runtime node24 (tanpa perubahan input/behavior), input checkout default-identik di keempat job, dan v4 sudah terbukti hijau berjalan dipaksa di node24 sejak 16 Juni.
- [x] **D2 = pin `pnpm/action-setup@v5.0.0`** (Opsi A) — **DONE** di ci.yml. ⚠️ Temuan implementasi: v5.0.0 **menolak duplikasi sumber versi** (`version: 10` + `packageManager` → error `ERR_PNPM_BAD_PM_VERSION` di CI, gagal 21s). Solusi: `with: version: 10` **dihapus** → versi diambil dari `packageManager: pnpm@10.33.2` (lebih deterministik)
- [x] **D3 = auto-cache v5**: `actions/setup-node@v4` → `@v5` (BUKAN v6) + hapus `cache: 'pnpm'` eksplisit — **DONE** di ci.yml
- [x] Pastikan urutan step tetap: (corepack/pnpm-setup) → setup-node → `pnpm install` — **terverifikasi di log** (`pnpm store path` ter-resolve, cache hit)
- [x] Push ke **branch feature** + buka PR (CI jalan di PR untuk job ini) — **PR #18** (`ci/upgrade-actions-node24`)
- [x] Verifikasi: 3 kondisi di §6 (annotation hilang, job hijau, tidak ada regresi test 54/54 + mobile) + **`pnpm --version` di log** — **lint-and-typecheck pass 1m55s, 54/54 unit, pnpm 10.33.2, auto-cache hit, annotation Batch A hilang**
- **Gate 1**: PR hijau + annotation batch A bersih → merge — **LULUS & MERGED 2026-08-01**

### Phase 2 — Batch B: action di `build-image` (testable via workflow_dispatch)
File: action #4, #5, #6
- [x] `docker/login-action@v3` → `@v4` — **DONE** di ci.yml
- [x] `docker/setup-buildx-action@v3` → `@v4` — **DONE** di ci.yml
- [x] `docker/build-push-action@v6` → `@v7` — **DONE** di **kedua** step (backend + web), sadar breaking change §3.2
- [x] Sebelum push: verifikasi tiap `action.yml` di versi target benar `runs.using: node24` — **terverifikasi** (v4/v7 = node24 resmi)
- [x] Push ke **branch feature**, lalu trigger **`workflow_dispatch` manual dari branch tersebut** — **branch `ci/upgrade-docker-actions` (commit c4f1237)**, dispatch → **run 30661900400**: `deploy-staging` **tidak** ikut (benar — bukan main)
- [x] ⚠️ **Catatan risiko kecil**: dispatch-test menimpa tag `:latest` di GHCR — **terjadi & diterima**; tidak ada deploy/restart manual staging di antara dispatch-test dan merge
- [x] Verifikasi: image berhasil build + push ke GHCR — **backend & web `:latest` + `:c4f1237` (sha) ter-push**, attestation/provenance OK, cache GHA OK
- [x] **JANGAN merge ke main sebelum Batch B lulus** — **dipatuhi**: merge (PR #19) dilakukan setelah run dispatch hijau
- **Gate 2**: build-image hijau di workflow_dispatch → merge — **LULUS & MERGED 2026-08-01**

### Phase 3 — Verifikasi end-to-end setelah merge ke main
- [x] Merge batch A + B → push main → CI penuh jalan otomatis — **Batch A (PR #18) + Batch B (PR #19) merged**
- [x] Konfirmasi: `lint-and-typecheck` ✅ (1m43s), `build-image` ✅ (3m31s), `deploy-staging` ✅ (54s), `deploy` skip (bukan tag `v*`) — **run main final 30662371949**
- [x] Konfirmasi staging live — **`staging-api` 200, `staging-web` 307** (2026-08-01)
- [x] Konfirmasi **annotation deprecation hilang di semua job** — **0 annotation** di run final (sebelumnya tersisa `docker/*` di build-image)
- **Gate 3**: CI all green + staging OK → selesai — **LULUS 2026-08-01**

### Phase 4 — Dokumentasi & backlog
- [x] Update `docs/implementation/TASK-PENDING.md` — **DONE**: entry "CI GitHub Actions upgrade ke Node 24 ✅ SELESAI" ditambahkan di bagian E
- [x] Catat keputusan D2/D3 (pnpm & caching) di commit message / session doc — **DONE**: tercatat di commit `538d666` (hapus `version:` — single source of truth) + blok keputusan §8 file ini
- [x] (Opsional) Aktifkan **Dependabot untuk GitHub Actions** — **DONE**: `.github/dependabot.yml` dibuat (github-actions, `/`, mingguan), commit `4764fa6` di main

---

## 6. Kriteria Verifikasi (Definition of Done)

Untuk tiap phase, SEMUA ini harus terpenuhi:

- [ ] **Annotation hilang**: tidak ada lagi `Node.js 20 actions are deprecated` di log/annotation semua job
- [ ] **CI hijau**: job yang terpengaruh pass (tidak boleh ada job merah baru)
- [ ] **Tidak ada regresi test**: `lint-and-typecheck` — 54/54 backend unit + mobile test pass; migration orphan check pass
- [ ] **Versi pnpm benar di log**: tepat `10.33.2` — diambil dari `packageManager` (v5.0.0 melarang `version:` eksplisit bersamaan, jadi tidak ada lagi opsi "10.x terbaru" dari input)
- [ ] **Urutan setup terjaga**: tidak ada error `pnpm: command not found` / kegagalan `pnpm store path` di step setup-node
- [ ] **Image GHCR benar**: `ghcr.io/.../backend:latest` & `:sha` ter-push, ukuran/waktu build wajar (tidak error attestation/provenance)
- [ ] **Staging tetap hidup**: `staging-api.lazisnu.site/health` → 200, `staging.lazisnu.site` → 307
- [ ] **Production tidak tersentuh**: tidak ada trigger tag `v*`, `deploy` job tetap skip

---

## 7. Rollback Plan

| Skenario | Aksi | Waktu |
|----------|------|-------|
| Batch A gagal di PR | Jangan merge — revert/amandemen commit di branch | 5 menit |
| Batch B gagal di workflow_dispatch | Jangan merge — perbaiki di branch | 5-15 menit |
| Batch B lulus tapi CI main merah setelah merge | `git revert` commit batch B → push → CI kembali ke versi lama (d32842c) yang hijau | 10 menit |
| Deploy-staging rusak pasca-merge | Revert + `docker compose -f docker-compose.staging.yml up -d` manual ke image lama (GHCR masih punya `:sha` lama) | 15 menit |
| Opsi C (corepack) gagal di CI | Fallback: re-add `pnpm/action-setup@v5.0.0`**(Opsi A)** | 10 menit |
| Auto-cache v5 bermasalah (miss/error cache) | Fallback: kembalikan `cache: 'pnpm'` + set `package-manager-cache: false` (konfigurasi valid #2 §3.4) | 5 menit |
| Darurat lewat 16 Sept & CI mati | Sementara: `ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION=true` di env workflow (opt-out sementara pasca-June, **mungkin sudah tidak berlaku setelah removal** — jangan jadikan strategi) | 5 menit |

**Prinsip rollback**: karena kita tidak pernah merge sebelum hijau (Gate 1-2), rollback praktis hanya terjadi pada "CI main merah pasca-merge" — dan itu dijamin reversibel via `git revert`.

---

## 8. Matriks Keputusan (Perlu Konfirmasi User)

| # | Keputusan | Opsi | Rekomendasi |
|---|-----------|------|-------------|
| D1 | Kapan eksekusi? | (a) Segera / (b) Nanti, sebelum 1 Sept 2026 | Keduanya sah — **hard deadline 16 Sept 2026**; target aman tuntas sebelum 1 Sept |
| D2 | `pnpm/action-setup` | (a) Pin `@v5.0.0` / (b) Hapus, ganti `corepack enable` sebelum setup-node / (c) Pin `@v4.3.0` (node20 — mati 16 Sept) | **(a)** — satu baris, hosted runner kebal issue #210; (b) jika ingin pnpm persis 10.33.2 |
| D3 | Caching setup-node@v5 | (a) Hapus `cache:` eksplisit → auto-cache v5 / (b) `cache: pnpm` + `package-manager-cache: false` | (a) — ikut fitur resmi v5; (b) jika nanti mau v6 (auto-cache v6 hanya npm) |
| D4 | `docker/build-push-action` v7 | (a) Upgrade + uji (`@v7.3.0`) / (b) Tunda ke sesi terpisah | (a) — wajib sebelum 16 Sept, uji di Phase 2 |
| D5 | Dependabot untuk Actions | (a) Aktifkan / (b) Tidak | (a) — cegah menumpuk lagi (config `.github/dependabot.yml`) |

> **Keputusan terpilih (2026-08-01, semua sesuai rekomendasi):** D1 = (a) Segera · D2 = (a) pin `pnpm/action-setup@v5.0.0` · D3 = (a) auto-cache setup-node@v5 (hapus `cache:` eksplisit) · D4 = (a) upgrade `docker/build-push-action@v7.3.0` + uji · D5 = (a) aktifkan Dependabot di Phase 4.

---

## 9. Checkpoint Persetujuan

Rencana ini hanya dieksekusi setelah user menandatangani checklist berikut:

- [x] Saya memahami risiko (fail-hard **16 September 2026**, breaking change docker v7, pnpm tag chaos)
- [x] Saya memahami **koreksi kritis**: draft lama Opsi C (setup-node auto-install pnpm) tidak valid; yang benar = pin `@v5.0.0` atau `corepack enable` (§3.3)
- [x] Saya memahami setup-node **v5 ≠ v6** untuk caching pnpm dan memilih tetap di v5 (§3.4)
- [x] Saya setuju dengan prinsip §4 (bertahap, pin versi third-party, rollback, jangan sentuh yang bekerja)
- [x] Saya setuju dengan Gate 1-2 (tidak merge sebelum hijau di jalur test yang benar)
- [x] Saya pilih keputusan D1-D5 di §8 (tercatat di blok keputusan §8)
- [x] Saya paham bahwa Node 20 di Dockerfile/`node-version` TIDAK ikut diubah (itu runtime aplikasi, beda konteks)

---

## 10. Referensi

- Changelog resmi GitHub: [Deprecation of Node 20 on GitHub Actions runners](https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/) — tanggal removal **16 Sept 2026** juga tercetak di teks warning Annotation setiap run
- Analisis timeline & checklist: [Migrate GitHub Actions to Node.js 24 Before the Deadline](https://www.tenki.cloud/blog/migrate-github-actions-node-24)
- `pnpm/action-setup` issue #210 (node24 rusak pipeline **self-hosted runner lama**) & pemetaan tag: https://github.com/pnpm/action-setup/issues/210
- `actions/setup-node` v5.0.0 (node24 + auto-cache dari `packageManager`): https://github.com/actions/setup-node/releases/v5.0.0 — dan v6.0.0 (auto-cache dibatasi npm): PR actions/setup-node#1374
- `docker/build-push-action` v7 breaking changes: https://github.com/docker/build-push-action/releases (v7.0.0; terkini v7.3.0)
- `docker/login-action` v4 (node24, v4.2.0) & `docker/setup-buildx-action` v4 (node24, v4.1.0): release notes masing-masing repo
- File kerja: `.github/workflows/ci.yml` | Tracking: `docs/implementation/TASK-PENDING.md`
