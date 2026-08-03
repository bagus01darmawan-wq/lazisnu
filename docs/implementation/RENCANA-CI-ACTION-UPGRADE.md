# Rencana Migrasi CI — Upgrade GitHub Actions ke Node 24

> Dibuat: 2026-08-01 | Status: **DRAFT — menunggu konfirmasi user**
> File ini adalah rencana tunggal yang bisa ditinjau ulang/dikonfirmasi ulang sebelum eksekusi.
> Berlaku untuk: `.github/workflows/ci.yml`

---

## 1. Latar Belakang & Mengapa Ini Perlu

GitHub menghentikan runtime Node.js 20 di GitHub-hosted runners:

| Tanggal | Peristiwa | Dampak ke proyek |
|---------|-----------|------------------|
| April 2026 | Node.js 20 EOL (tanpa security patch) | Risiko supply-chain |
| 16 Juni 2026 | Runner default Node 24; action node20 **dipaksa** jalan di node24 | **SUDAH TERJADI** — CI masih hijau karena action kebetulan kompatibel |
| **Fall 2026 (~1-1.5 bulan lagi)** | Node 20 runtime **dihapus total**. Action yang `runs.using: node20` → **FAIL HARD, tanpa opt-out** | **CI bisa mati total** |

Kesimpulan: upgrade **wajib dilakukan sebelum Fall 2026**, tapi **tidak mendesak hari ini** — ada runway ~1-1.5 bulan untuk melakukannya dengan aman.

> ⚠️ Catatan penting: sejak 16 Juni, action kita **sudah berjalan di Node 24** (dipaksa) dan lulus. Ini bukti empiris bahwa mayoritas action kompatibel node24 — risiko utama hanya deklarasi `runs.using: node20` yang akan ditolak runner di Fall 2026.

---

## 2. Inventarisasi Action Saat Ini (Audit)

Hasil grep `uses:` di `.github/workflows/ci.yml`:

| # | Action | Versi dipakai | Job | `runs.using` | Perlu diubah? |
|---|--------|--------------|-----|--------------|---------------|
| 1 | `actions/checkout` | v4 | Semua job | node20 | ✅ v5 (node24) |
| 2 | `actions/setup-node` | v4 | lint-and-typecheck | node20 | ✅ v5 (node24) |
| 3 | `pnpm/action-setup` | v3 | lint-and-typecheck | node20 | ⚠️ Lihat §3.3 — **jangan asal v4** |
| 4 | `docker/login-action` | v3 | build-image | node20 | ✅ v4 (node24) |
| 5 | `docker/setup-buildx-action` | v3 | build-image | node20 | ✅ v4 (node24) |
| 6 | `docker/build-push-action` | v6 | build-image | node20 | ⚠️ v7 (node24) tapi **ada breaking change** — lihat §3.2 |
| 7 | `appleboy/ssh-action` | v1 | deploy, deploy-staging | **docker** (bukan JS) | ❌ **TIDAK terpengaruh** — jangan diubah |

---

## 3. Temuan Riset (Kenapa "bump major" BUKAN jawaban sederhana)

### 3.1 Cacat rencana test yang umum dilakukan
`build-image` di [ci.yml L78](file:///c:/Users/user/Documents/lazisnu/.github/workflows/ci.yml#L78) hanya jalan di `push`/`workflow_dispatch` — **tidak jalan di PR**. Jadi upgrade `docker/*` **tidak akan teruji** oleh PR biasa. Test lewat PR hanya valid untuk action yang dipakai di `lint-and-typecheck`.

### 3.2 `docker/build-push-action@v7` — ada breaking change nyata
Rilis v7 menghapus:
- Dukungan "legacy export-build tool"
- Env deprecated (`DOCKER_BUILD_NO_SUMMARY`, `DOCKER_BUILD_EXPORT_RETENTION_DAYS`)
- Menuntut runner lebih baru (runner hosted sudah OK)

Artinya upgrade ini harus **diuji langsung** pada job build-image, bukan dianggap aman.

### 3.3 `pnpm/action-setup` — situasi berantah (temuan kritis)
- Tag `v4` **dipindah** menunjuk ke rilis node24 (`fc06bc1` = `v4.4.0` = `v5.0.0`, satu commit sama)
- Rilis node24 itu **merusak pipeline** banyak orang (issue pnpm/action-setup#210) — error pada runner yang tidak terbaru
- Versi stabil node20 = `v4.3.0` (revert dari #205)
- **Kesimpulan**: pilihan aman = pin versi spesifik yang terverifikasi, bukan ikut tag mengambang. Dua opsi:
  - **Opsi A**: pin `pnpm/action-setup@v5.0.0` (node24, resmi) — lalu UJI di CI; jika gagal → turun
  - **Opsi B**: pin `pnpm/action-setup@v4.3.0` (node20 stabil) — tetap di-declare node20 → **bermasalah Fall 2026**
  - **Opsi C (paling aman)**: HAPUS `pnpm/action-setup` sama sekali — `actions/setup-node@v5` punya **auto-install pnpm dari field `packageManager`** di root package.json (`pnpm@10.33.2`). Satu action lebih sedikit, satu sumber kegagalan berkurang.

### 3.4 `actions/setup-node@v5` — perilaku caching berubah
v5 punya **auto-cache otomatis** (baca `packageManager`). Konflik dengan `cache: 'pnpm'` eksplisit yang sudah ada di ci.yml. Saat upgrade: **pilih salah satu** — hapus `cache:` eksplisit (biarkan auto), atau set `package-manager-cache: false`.

### 3.5 `appleboy/ssh-action@v1` — TIDAK disentuh
Berbasis Docker container, bukan JavaScript — bebas dari deprecation Node 20. Mengubahnya tanpa alasan = risiko tak perlu.

---

## 4. Prinsip Pendekatan (Aman Bertahap)

1. **Satu batch = satu sumber risiko** — pisahkan action testable-di-PR vs testable-hanya-di-push
2. **Uji sebelum merge** — setiap batch diuji pada jalur yang BENAR-BENAR menjalankannya
3. **Pin versi, bukan tag mengambang** — hindari kejutan `pnpm/action-setup@v4` seperti §3.3
4. **Rollback selalu tersedia** — revert commit CI = CI kembali ke versi lama (hijau)
5. **Jangan sentuh yang bekerja** — `appleboy/ssh-action`, `node-version: '20'` (runtime aplikasi), Dockerfile `node:20-alpine` tetap dipertahankan
6. **Waktu pelaksanaan**: di luar window deployment produksi / saat traffic rendah

---

## 5. Rencana Eksekusi Bertahap

### Phase 0 — Baseline & Snapshot (sebelum menyentuh apa pun)
- [ ] Catat hash CI run terakhir yang hijau (run `30654929726` / commit `d32842c`)
- [ ] Screenshot/export annotation deprecation sebagai bukti "sebelum"
- [ ] Konfirmasi smoke test staging OK (sudah diverifikasi 2026-08-01)
- **Gate 0**: baseline tercatat → lanjut

### Phase 1 — Batch A: action di `lint-and-typecheck` (testable via PR)
File: action #1, #2, #3 (lihat tabel §2)
- [ ] `actions/checkout@v4` → `@v5`
- [ ] `actions/setup-node@v4` → `@v5`, dan putuskan caching (§3.4): **rekomendasi** hapus `cache: 'pnpm'` eksplisit, biarkan auto-cache v5
- [ ] `pnpm/action-setup@v3` → putuskan §3.3: **rekomendasi Opsi C** (hapus action, andalkan auto-install setup-node@v5). Jika auto-install bermasalah → fallback Opsi A pin `@v5.0.0`
- [ ] Push ke **branch feature** + buka PR (CI jalan di PR untuk job ini)
- [ ] Verifikasi: 3 kondisi di §6 (annotation hilang, job hijau, tidak ada regresi test 54/54 + mobile)
- **Gate 1**: PR hijau + annotation batch A bersih → merge

### Phase 2 — Batch B: action di `build-image` (testable via workflow_dispatch)
File: action #4, #5, #6
- [ ] `docker/login-action@v3` → `@v4`
- [ ] `docker/setup-buildx-action@v3` → `@v4`
- [ ] `docker/build-push-action@v6` → `@v7` (sadar breaking change §3.2)
- [ ] Sebelum push: verifikasi tiap `action.yml` di versi target benar `runs.using: node24`
- [ ] Push ke **branch feature**, lalu trigger **`workflow_dispatch` manual** (job build-image jalan di branch karena kondisi `github.event_name == 'workflow_dispatch'`)
- [ ] Verifikasi: image berhasil build + push ke GHCR (cek tag `:latest` + `:sha`)
- [ ] **JANGAN merge ke main sebelum Batch B lulus** — merge = auto-trigger deploy-staging
- **Gate 2**: build-image hijau di workflow_dispatch → merge

### Phase 3 — Verifikasi end-to-end setelah merge ke main
- [ ] Merge batch A + B → push main → CI penuh jalan otomatis
- [ ] Konfirmasi: `lint-and-typecheck` ✅, `build-image` ✅, `deploy-staging` ✅, `deploy` skip
- [ ] Konfirmasi staging live (`staging-api` 200, `staging-web` 307)
- [ ] Konfirmasi **annotation deprecation hilang di semua job**
- **Gate 3**: CI all green + staging OK → selesai

### Phase 4 — Dokumentasi & backlog
- [ ] Update `docs/implementation/TASK-PENDING.md` — tandai item "CI Node 20 deprecation" selesai
- [ ] Catat keputusan caching & pnpm di commit message / session doc
- [ ] (Opsional) Aktifkan **Dependabot untuk GitHub Actions** agar update action ke depan otomatis ter-pantau

---

## 6. Kriteria Verifikasi (Definition of Done)

Untuk tiap phase, SEMUA ini harus terpenuhi:

- [ ] **Annotation hilang**: tidak ada lagi `Node.js 20 actions are deprecated` di log/annotation semua job
- [ ] **CI hijau**: job yang terpengaruh pass (tidak boleh ada job merah baru)
- [ ] **Tidak ada regresi test**: `lint-and-typecheck` — 54/54 backend unit + mobile test pass; migration orphan check pass
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
| `pnpm/action-setup@v5` auto-install gagal | Fallback: re-add action pin `@v4.3.0` ATAU `@v5.0.0` | 10 menit |

**Prinsip rollback**: karena kita tidak pernah merge sebelum hijau (Gate 1-2), rollback praktis hanya terjadi pada "CI main merah pasca-merge" — dan itu dijamin reversibel via `git revert`.

---

## 8. Matriks Keputusan (Perlu Konfirmasi User)

| # | Keputusan | Opsi | Rekomendasi |
|---|-----------|------|-------------|
| D1 | Kapan eksekusi? | (a) Sekarang / (b) Tunggu mendekati Fall 2026 | (b) — ada runway, lakukan saat senggang; tapi jangan melewati ~pertengahan September 2026 |
| D2 | `pnpm/action-setup` | (a) Hapus, andalkan auto-install setup-node@v5 / (b) Pin `@v5.0.0` / (c) Pin `@v4.3.0` | (a) — paling sedikit sumber kegagalan; (b) fallback |
| D3 | Caching setup-node@v5 | (a) Auto-cache (hapus `cache:` eksplisit) / (b) `package-manager-cache: false` + pertahankan `cache: pnpm` | (a) — ikut default maintainer |
| D4 | `docker/build-push-action` v7 | (a) Upgrade + uji / (b) Tunda ke sesi terpisah | (a) — wajib sebelum Fall 2026, uji di Phase 2 |
| D5 | Dependabot untuk Actions | (a) Aktifkan / (b) Tidak | (a) — cegah menumpuk lagi |

---

## 9. Checkpoint Persetujuan

Rencana ini hanya dieksekusi setelah user menandatangani checklist berikut:

- [ ] Saya memahami risiko (Fall 2026 fail-hard, breaking change docker v7, pnpm tag chaos)
- [ ] Saya setuju dengan prinsip §4 (bertahap, pin versi, rollback, jangan sentuh yang bekerja)
- [ ] Saya setuju dengan Gate 1-2 (tidak merge sebelum hijau di jalur test yang benar)
- [ ] Saya pilih keputusan D1-D5 di §8
- [ ] Saya paham bahwa Node 20 di Dockerfile/`node-version` TIDAK ikut diubah (itu runtime aplikasi, beda konteks)

---

## 10. Referensi

- Changelog resmi GitHub: [Deprecation of Node 20 on GitHub Actions runners](https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/)
- Analisis timeline & checklist: [Migrate GitHub Actions to Node.js 24 Before the Deadline](https://www.tenki.cloud/blog/migrate-github-actions-node-24)
- `pnpm/action-setup` issue #210 (node24 rusak pipeline) & #209 (deprecation): https://github.com/pnpm/action-setup/issues/210
- `docker/build-push-action` v7 breaking changes: https://github.com/docker/build-push-action/releases
- File kerja: `.github/workflows/ci.yml` | Tracking: `docs/implementation/TASK-PENDING.md`
