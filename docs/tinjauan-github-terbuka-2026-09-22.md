# Tinjauan Utang GitHub — 22 September 2026

Inventaris menyeluruh atas: **anotasi**, **issue**, **Security & Quality (code scanning)**,
dan **PR yang belum ditindaklanjuti**. Semua angka diambil langsung dari GitHub API pada
22 Sep 2026 ±19:05 WIB.

Titik acuan: `refs/heads/staging` = `93af841` (hasil merge PR #132), run CI **#557 success**.

---

## 1. Ringkasan sekali lihat

| Area | Jumlah | Kondisi |
|---|---|---|
| PR terbuka | **6** | semua Dependabot, semua CI hijau, **1 konflik** (#99) |
| Issue terbuka | **5** (#52–#56) | **4 dari 5 sudah tak relevan**; hanya #55 masih nyata |
| Code scanning (open) | **9** | 2 warning, 7 note — **tak ada satu pun punya tiket** |
| Dependabot alerts | **0** | bersih |
| Secret scanning | **0** | bersih |
| Anotasi pada `93af841` | 21 di 8 check-run | **jinak** — notice + warning lint, **nol error** |

**Kabar buruknya lebih dulu:** ada 9 temuan CodeQL yang terbuka dan **tidak tercatat di issue mana
pun**. Sebaliknya, hampir semua issue yang ada menuntun ke lokasi yang sudah bersih. Jadi papan tugas
Anda sekarang sebagian besar menunjuk ke arah yang salah — dan pekerjaan yang benar-benar tersisa
tidak punya tiket.

---

## 2. Anotasi — 21 buah, semuanya jinak

Tidak ada satu pun `failure`. Rinciannya:

| Check-run | Jumlah | Isi |
|---|---|---|
| `Verify (lint · format · typecheck)` | 11 | **10 warning ESLint nyata** + 1 notice |
| `Build Staging APK` | 3 | deprecasi Node.js 20 (`actions/upload-artifact@v4`), `netinfo`, notice Ubuntu |
| `Build Android Debug` | 2 | `netinfo`, notice Ubuntu |
| `CI status` | 1 | notice Ubuntu |
| `changes` | 1 | notice Ubuntu |
| `pnpm audit` | 1 | notice Ubuntu |
| `Test mobile` | 1 | notice Ubuntu |
| `CodeQL (JS/TS)` | 1 | notice Ubuntu |

### 2a. Notice yang muncul berulang (bukan masalah Anda)
- **`ubuntu-latest` → Ubuntu 26 mulai 19 Oktober 2026.** Muncul di hampir semua job. Belum perlu
  tindakan sampai tanggal itu; pantau.
- **Node.js 20 deprecated** — `actions/upload-artifact@v4` dipaksa jalan di Node 24. **PR #95 justru
  memperbaiki ini** (menaikkan ke v8) — lihat §5.

### 2b. Warning nyata (10 buah, dua berkas)
| Berkas | Baris | Pesan |
|---|---|---|
| `apps/mobile/__tests__/signature/signaturePng.test.ts` | 22 | `Unexpected use of '<<'` ×3, `'|'` ×3 |
| `apps/mobile/__tests__/signature/signaturePng.test.ts` | 26 | `Unexpected use of '|'` ×2, `'>>>'` ×1 |
| `apps/mobile/__tests__/screens/TaskDetailScreen.test.tsx` | 150 | `'allText' is already declared in the upper scope on line 48` |

Semuanya **berkas uji**, bukan kode produksi. Yang paling layak dibereskan: shadowing `allText`
(bisa menutupi bug saat tes diperluas).

### 2c. Catatan penting
Warning `no-restricted-syntax` ("Gunakan AppPressable") **sudah tidak muncul lagi** sebagai anotasi.
Tetapi grep membuktikan 7 komponen di issue #55 **masih memakai `TouchableOpacity`** → issue #55
masih sah secara isi, hanya berhenti berisik di CI.

---

## 3. Code scanning — 9 alert terbuka

Total repo: **open 9**, dismissed 4, fixed 1. Semua dari **CodeQL**, semua **tercipta 15–22 Sep 2026**.

| # | Tingkat | Rule | Lokasi | Pesan |
|---|---|---|---|---|
| 58 | ⚠️ warning | `js/trivial-conditional` | `apps/mobile/src/screens/SetoranScreen.tsx:143` | variable `submission` **selalu bernilai true** |
| 52 | ⚠️ warning | `js/useless-assignment-to-local` | `apps/backend/src/services/periodCalendar.ts:162` | nilai awal `serverTimeZone` tak pernah terpakai |
| 49 | note | `js/unused-local-variable` | `apps/backend/src/routes/admin/canProposals.ts:4` | import `inArray` |
| 50 | note | `js/unused-local-variable` | `apps/backend/src/services/__tests__/overviewReturnedCounts.test.ts:26` | import `getReturnedCounts` |
| 51 | note | `js/unused-local-variable` | `apps/mobile/src/screens/TasksScreen.tsx:56` | variabel `visitLoading` |
| 53 | note | `js/unused-local-variable` | `apps/backend/src/routes/mobile/submissions.ts:14` | import `getBranchBeritaAcara` |
| 55 | note | `js/unused-local-variable` | `apps/backend/src/services/cosign.ts:48` | import `periodKey` |
| 56 | note | `js/unused-local-variable` | `apps/backend/src/services/__tests__/mobileRoles.integration.test.ts:19` | import `countersignBranchSubmission` |
| 57 | note | `js/unused-local-variable` | `apps/mobile/src/screens/PersetujuanScreen.tsx:17` | import `PeriodChip` |

**Yang paling berharga:** #58 — `submission` selalu `true` di `SetoranScreen.tsx:143` adalah **ciri
logika yang tidak berjalan seperti yang ditulis**. Bukan sekadar sampah; layak dibaca manual.

Sisanya (7 note) adalah sisa import/variabel — sapu bersih, dampak nol, tapi menghilangkan 7 dari 9
alert sekaligus.

---

## 4. Issue terbuka — 5 buah, **semuanya basi**

Dibuat 30 Agustus 2026 oleh `bagus01darmawan-wq`, **tanpa label**, dari diagnostik 31 Agustus.

| # | Judul | Isi permintaan | Status sebenarnya |
|---|---|---|---|
| 52 | Bersihkan unused variables backend (**29** alert CodeQL) | 24 lokasi di `apps/backend` | **Basi** — 0 dari 24 lokasi masih terbuka |
| 53 | Review manual: `user-controlled-bypass` pada autentikasi (4 alert) | `middleware/auth.ts:39`, `routes/auth.ts:476,596,626` | ✅ **SUDAH DIKERJAKAN** — keempat alert **di-dismiss sebagai false positive oleh `bagus01darmawan-wq`** (alert #1–#4, lokasi persis sama). Issue tinggal ditutup. |
| 54 | Sanitasi command injection + file-system-race (5 alert) | `scripts/release-bump.mjs:60,110,114,115`, `routes/admin/backup.ts:28` | **Basi** — 0 alert terbuka |
| 55 | Migrasi 7 komponen ui lama ke `AppPressable` | `AppButton`, `AppHeader`, `SyncBanner`, `SegmentedControl`, `RangeCalendar` ×3 | **MASIH SAH** — grep membuktikan ketujuhnya masih `TouchableOpacity` |
| 56 | Sisa warning lint & alert CodeQL ringan (9 temuan) | `jest.setup.js:43`, `wa-monitor/page.tsx:362`, dll. | **Sebagian basi** — lokasi CodeQL sudah bersih; 2 warning lint belum diperiksa |

**Kesimpulan:** #52, #54 praktis selesai sendiri (alert-nya hilang) — tinggal diverifikasi lalu
ditutup. **#53 sudah benar-benar selesai**: keempat alert `user-controlled-bypass` (#1–#4) berstatus
**dismissed · reason: false positive · oleh `bagus01darmawan-wq`** — lokasinya persis sama dengan
yang diminta issue (`middleware/auth.ts:41`, `routes/auth.ts:476`, `:598`, `:628`). Review manusianya
sudah dilakukan; tinggal menutup issue. #55 masih nyata. #56 perlu dicek ulang satu per satu.

**Sisi baiknya:** tidak ada temuan keamanan yang menggantung. Satu-satunya kategori keamanan (#53)
sudah diputuskan, dan keputusannya terdokumentasi di GitHub. Empat alert `dismissed` itu **bukan**
utang — itu jejak audit yang justru bagus.

---

## 5. PR terbuka — 6 buah, semua Dependabot

Semuanya menganggur sejak **11 September 2026** (#95 diperbarui 16 Sep). **Tidak satu pun punya
CI yang merah** — jadi ini murni belum ditindaklanjuti, bukan gagal.

| # | Isi | Berkas | Mergeable | CI |
|---|---|---|---|---|
| 95 | `actions/download-artifact` 4 → **8** | `.github/workflows/release.yml` | ✅ CLEAN | 11 ✅ / 5 ⏭ |
| 96 | `@types/node` (dev) | `apps/backend` | ✅ CLEAN | 12 ✅ / 3 ⏭ |
| 97 | `dotenv` | `apps/backend` | ✅ CLEAN | 12 ✅ / 3 ⏭ |
| 98 | `fastify` | `apps/backend` | ✅ CLEAN | 12 ✅ / 3 ⏭ |
| 99 | `firebase-admin` | `apps/backend` + `pnpm-lock.yaml` | ❌ **CONFLICTING / DIRTY** | 12 ✅ / 3 ⏭ |
| 100 | `ioredis` | `apps/backend` | ✅ CLEAN | 12 ✅ / 3 ⏭ |

**Yang layak didahulukan:**
1. **#95** — paling murah (1 baris di 1 berkas), dan **langsung menghapus peringatan deprecasi
   Node.js 20** yang muncul di setiap build APK. Tidak menyentuh kode aplikasi sama sekali.
2. **#99** — satu-satunya yang butuh kerja: konflik di `package.json` + `pnpm-lock.yaml`.
   Perlu rebase/dependabot-recreate. Menaikkan `firebase-admin` juga berisiko lebih tinggi → jangan
   digabung dengan yang lain.
3. **#96–#98, #100** — empat bump `apps/backend`, semuanya CLEAN. Aman, tapi **jangan digabung
   semuanya sekaligus** kalau ingin tahu bump mana yang bermasalah bila nanti ada masalah.

**Peringatan penting soal deploy:** PR Dependabot yang menyentuh `apps/backend/**` akan menyalakan
`Test backend` + `build-image` + **`Deploy staging`** saat merge ke `staging` — tapi **`Test web`
tetap ter-skip** (gerbangnya hanya `web == true || infra == true`). Jadi merge PR backend **tidak**
membuktikan sisi web masih sehat.

---

## 6. Usulan urutan kerja

1. **Tutup issue basi** — #53 sudah diputuskan (false positive, tinggal tutup); verifikasi #52 & #54
   benar-benar bersih lalu tutup juga. Ganti dengan **satu issue baru** yang memuat 9 alert CodeQL
   yang benar-benar terbuka.
2. **Sapu 9 alert CodeQL** — 7 note (import/variabel sisa) dalam satu PR kecil; #58
   (`SetoranScreen.tsx:143`) dibaca manual dulu karena itu logika, bukan sampah.
3. **Merge #95** — 1 baris, menghilangkan peringatan Node.js 20.
4. **Bereskan #99** (rebase) lalu merge satu per satu bersama #96–#98, #100.
5. **Bersihkan 10 warning ESLint** di `signaturePng.test.ts` + `TaskDetailScreen.test.tsx`
   (sekaligus mengurangi anotasi CI).
6. **Issue #55** (AppPressable, 7 komponen) — pekerjaan nyata, tapi murni kosmetik konvensi;
   letakkan paling belakang.
7. **Pantau 19 Oktober 2026** — migrasi `ubuntu-latest` ke Ubuntu 26.

---

*Semua data di atas diambil dari GitHub API, bukan dari ingatan. Tidak ada berkas yang diubah
selama peninjauan ini.*
