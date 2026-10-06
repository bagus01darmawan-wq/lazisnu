# Laporan Tinjauan Ulang 40 Poin AI Jules vs Kode Aktual

Tanggal: 2026-09-05 · Repo: `lazisnu` (main, pasca PR #85–#88) · Metode: baca langsung tiap file/baris yang diklaim, termasuk konteks sekitar (rute pemanggil, skema DB, fallback, constraint).

Skor klaim laporan asal: 34 relevan (85%). **Hasil verifikasi: ~14 dari 40 (≈35%) layak ditindaklanjuti.**

## Ringkasan vonis

| Vonis | Jumlah | Item |
|---|---|---|
| ✅ Terkonfirmasi, layak kerja (P1) | 3 | #3, #15, #16 |
| 🟡 Terkonfirmasi, batch santai (P2) | ~11 | #1, #2, #6, #7, #27, #29, #32, #33, #39, #40, #30 |
| ⚪ Sudah ada / sudah tertutup | 4 | #18 (parsial), #24, #26, #20 |
| 🔵 Desain decision / idiom / negligible | 9 | #4, #5, #8, #9, #11, #12, #13, #37, #19/#28 (resolved, betul) |
| ❌ Salah / file fiktif | 9 | #10 (betul irrelevant), #14 (betul resolved), #17, #21, #25, #31, #35, #36, #38 |
| 🔴 Koreksi fatal: diklaim hijau, ternyata merah | 1 | #15 |

---

## A. Keamanan (poin 1–5)

### #3 OTP `Math.random()` — P1, tapi risiko aktual KECIL (klaim "tinggi" overstated)
- Kode: `apps/backend/src/services/otp.ts:24` — `Math.floor(100000 + Math.random() * 900000)`.
- Tiga lapis pertahanan yang tidak disebut laporan asal, semuanya di `routes/auth.ts:239-386`:
  1. Rate limit request OTP (Redis, 3x/5 mnt per nomor).
  2. Rate limit rute verify 5/mnt (`auth.ts:310`).
  3. **Attempt counter max 5x lalu OTP dibakar** (`auth.ts:328-336`); OTP dihapus setelah sukses (`:386`).
- Analisis: brute force = 5 tebakan per ruang 900 ribu (mustahil). Prediksi PRNG V8 butuh output terpantau penyerang — OTP hanya terkirim ke HP korban via WhatsApp. Praktis tidak tereksploitasi hari ini.
- Fix: `crypto.randomInt(100000, 1000000)` — satu baris, nol risiko regresi. Tetap P1 karena murah + auth-adjacent (defense in depth).

### #1/#2 Suffix QR `Math.random()` — P2, BUKAN isu keamanan
- Kode aktual: `canService.ts:168` (single) dan `:317` (batch) — nomor baris laporan (150/266) basi.
- Format: `LAZ-{region}-{count BERURUTAN}-{suffix acak}`. Bagian count sekuensial memang enumerable — "unpredictability" tidak pernah jadi properti desain QR ini.
- Skenario gagal terburuk: dua kaleng cabang sama dibuat bersamaan + suffix sama (1/1000) → ditolak constraint `UNIQUE` (`qr_code`, `schema.ts:74`) → error 500 sesaat, bukan duplikat diam-diam.
- Fix yang benar: `crypto.randomInt` + **retry-on-conflict**, bukan sekadar ganti PRNG. Effort ±30 menit.

### #4 Fallback key baru di secureKey — DESAIN, bukan bug
- Jalur fallback benar ada, tapi ini design decision Opsi B yang terdokumentasi (ephemeral key + `forceLogout`, `App.tsx:80`): logout paksa justru menghindari silent decrypt failure yang dikhawatirkan.
- Tindakan valid satu-satunya: tambah test untuk jalur fallback. Tanpa perubahan perilaku.

### #5 Logout tanpa `finally` — negligible
- Logika di `routes/auth.ts` (bukan `authService.ts` — file itu tidak ada). Revoke hanya gagal saat Redis/DB down, ketika seluruh backend juga down. Client tetap hapus token lokal.
- Opsional: kembalikan 503 agar client retry. Tidak mendesak.

---

## B. Performa (poin 6–9) — semua micro-opt pada data kecil

| # | Lokasi aktual | Ukuran data nyata | Vonis |
|---|---|---|---|
| 6 | `mobile/.../offline/sync.ts:186` `.find` per item antrean | puluhan–ratusan transaksi (mikrodetik) | Ganti ke `Map` sekali jalan (±5 mnt); klaim "lag low-end" berlebihan |
| 7 | `stores/useTasksStore.ts:38` — file ini **sudah pakai `Map` di 3 tempat** (`:16, :69, :396`) | tugas 1 petugas (puluhan) | Ikuti pola yang sudah ada (±5 mnt) |
| 8 | `stores/useDashboardStore.ts:112,132` | assignment + statistik milik sendiri | Pagination/caching = over-engineering; tolak |
| 9 | Loop revoke per-device (hasil fix Fase 1, PR #86) | N = jumlah device (1–3) | Batching tak berguna di N sekecil ini; tolak |

---

## C. Type-safety & kebersihan (poin 11–18, 21–23, 26)

- **#16 valid sebagian (P1 ringan):** `mobile/tasks.ts:157` cast query + `status` tanpa validasi + `page/limit` tanpa clamp. Status invalid → hasil kosong (aman); `page=abc` → `NaN` → error DB → 500 via `sendInternalError`. Authenticated-only, self-DoS. Fix: validasi enum + clamp (±10 mnt).
- **#11–13 `response.json() as any` (`whatsapp.ts:162`, dst):** polymorphic by design (Fonnte vs Meta beda shape); semua akses optional-chaining dengan fallback ID (`data.messages?.[0]?.id || wa-...`) — shape asing degradasi, tidak crash. Union type = boleh, nilai rendah.
- **#26 TERTUTUP:** `sendInternalError()` memang default 500 (`response.ts:46-57`); audit 16 file menunjukkan semua call site `sendError` mengisi kode eksplisit (400×36, 403×35, 404×21, 401×11…).
- **#18 sebagian tertutup:** `formatPaginatedResponse` sudah generic `<T>`; tersisa hanya `total: any`.
- **🔴 #15 KOREKSI FATAL — diklaim "sudah teratasi", ternyata MASIH ADA:** `request.query as any` masih di `routes/admin/officers.ts:22` (yang bersih hanya `district.ts`). P1.
- **Fiktif (file/simbol tidak ada):** #17 (`authService.ts` tak ada; `authorize()` aktual memakai union type di `middleware/auth.ts:81`), #21 (`utils/token.ts` tak ada; `TokenPayload` nol hasil repo-wide), #25 (biometrik hanya di Login/Profile/`biometric.ts`; `StatisticsScreen.tsx` tak ada).
- Hygiene terkonfirmasi: #22 (`database.ts:29` bocor; `console.log` di `sync.ts` aman karena `__DEV__`), #23 (`r2.ts:36`).

---

## D. Test (poin 24, 27, 29–38)

- **#24 TUTUP — Poison Pill SUDAH ADA:** `getFailedPermanent`/`moveToFailedPermanent` (`offline/queue.ts:168,184`) + klasifikasi `permanentFailures` (`sync.ts:212`). Hanya beda nama dari usulan.
- **Murah diuji, satu sesi menutup 4 item (P2):** #27 `generateQrPreviewDataUrl` (assert prefix `data:image/png;base64`), #29 `formatPaginatedResponse` (murni), #32 `toMobileHistoryItem` (mapper murni; `serializer.test.ts` kini hanya cover `serializeOutput`), #33 `statsRange` **backend** (`backend/utils/statsRange.ts` — file web-nya memang tak ada).
- **Medium:** #30 test antrean offline (butuh mock MMKV). Catatan: keberadaan `generateOfflineId` tak terverifikasi.
- **Gugur (file tak ada):** #31 deviceInfo, #35 network, #36 mobile-auth, #38 authService-backend. Mobile justru sudah punya `authSessionPolicy.test.ts`.
- **Lemah:** #37 — `formatters.ts` hanya berisi 1 fungsi (`cleanBranchName`) yang sudah diuji 3 kasus.

---

## E. Arsitektur (poin 39–40) — terkonfirmasi presisi

- **#39:** `routes/auth.ts` **tepat 809 baris**, 9 rute terpetakan: login (`:43`), request-otp (`:239`), verify-otp (`:308`), refresh (`:466`), logout (`:581`), me (`:658`), sessions (`:716, :739, :775`). Usulan pecah: `auth-password.ts` + `auth-otp.ts` + `auth-session.ts` + `auth.schema.ts`; effort 1–2 jam termasuk update path test. P2.
- **#40:** `mobile/tasks.ts` 483 baris (laporan salah path — seharusnya di `mobile/`, bukan `routes/`). P2.

---

## Backlog eksekusi yang diusulkan

| Prioritas | Item | Effort |
|---|---|---|
| P1 (< 1 jam total) | #3 OTP → `crypto.randomInt`; #15 hapus cast officers; #16 validasi query tasks | kecil |
| P2 (1 sesi) | Test #27/#29/#32/#33; retry-on-conflict #1/#2; Map #6/#7; pecah #39 | sedang |
| Tutup tanpa kerja | #24, #26, #18-sisa-kecil, #4, #5, #8, #9, #11–13, fiktif (#17, #21, #25, #31, #35, #36, #38) | — |

## Catatan pola kesalahan laporan asal
1. Klaim tanpa membaca konteks sekitar: rate limit di rute lain (#3), fallback ID di baris bawah (#11–13), constraint UNIQUE di skema (#1/#2), guard `__DEV__` (#22).
2. Path file basi/tidak ada: ~9 item merujuk file yang tidak eksis (`authService.ts`, `utils/token.ts`, `tasksStore.ts`, `StatisticsScreen.tsx`, `deviceInfo.ts`, `network.ts`, dst.).
3. Satu vonis terbalik (#15) — alasan tiap "sudah teratasi" wajib diverifikasi ulang ke kode, tidak diterima mentah.
