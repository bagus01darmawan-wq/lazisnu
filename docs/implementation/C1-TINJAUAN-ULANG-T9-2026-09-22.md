# C1 — Tinjauan Ulang T9 Mobile Peran + PDF-Versions (22 Sep 2026)

> Status: **LULUS (hijau), tanpa temuan blocking.**
> Objek: commit `356fa53` (`feat(c1-t9): mobile 1 APK peran + endpoint dukung (H3)`)
> pada branch `feat/c1-t9-mobile-peran-2026-09-22`.
> Basis: T8 `7d78dcd` (review T8: LULUS + J1–J4). Baseline: 55 suite / 480 test
> (backend); mobile 31/243 + tsc 13 error pre-existing (drift tipe `Task`).
> Pola mengikuti `C1-TINJAUAN-ULANG-T8-2026-09-21.md`. Dokumen review T0–T8 read-only.

## 1. Verifikasi klaim laporan T9

| Klaim | Hasil |
|---|---|
| 22 file | ✅ `git diff --name-only 7d78dcd HEAD` = tepat 22 (3 service+route backend baru, 1 test backend baru, roleMap+test, c1Service+4 layar+chip+navigator+tabbar+dashboard+mock test mobile, docs §4.16) |
| Backend `tsc` EXIT 0 | ✅ dijalankan ulang live |
| Backend `jest --ci --runInBand` **56/56, 485/485** | ✅ **dijalankan ulang penuh secara live** (proses latar): `Test Suites: 56 passed; Tests: 485 passed`. Aritmetika: 480 + 5 integrasi (period-info/device-token/staf/inbox/H3) = 485; 55+1 file = 56 |
| Mobile `jest --ci` **32/32, 250/250** | ✅ **dijalankan ulang penuh secara live**: `Test Suites: 32 passed; Tests: 250 passed`. Aritmetika: 243 + 7 (6 roleMap + 1 c1Service di mock) = 250; suite 31+1 ✅ |
| Mobile `tsc` tetap 13 (nol di file baru) | ✅ dijalankan ulang: tepat 13 error, **semua di file pre-existing** (`CollectionScreen`, `TaskDetailScreen`, `TaskItem`, `TasksScreen`, `api.ts:20`) — drift tipe `Task`/`VisitTask` dari B2 yang ada SEBELUM T9 (dibuktikan: `7d78dcd:api.ts` sudah mengimpor `VisitTask` yang tak ada di shared-types; 4 file screen tak tersentuh T9 — diff T9 atasnya kosong). ---NEWFILES--- tidak muncul satu pun hit di log tsc ✅ |
| Web `tsc` EXIT 0 | ✅ dijalankan ulang live |
| Prettier bersih | — tak diverifikasi ulang sesi ini (klaim diterima; file baru mengikuti gaya repo yang terbukti lolos `Verify` CI di PR T9 bila di-merge) |

| H3 `pdf-versions` ×2 | ✅ `listPpkBaVersions`/`listBranchBaVersions`: live (hash dihitung realtime + `verify_url` QR) + arsip (kecuali bentrok versi) → sort menanjak; tanpa `pdf_key` (test: `'pdf_key' in liveOnly[0]` = false); `pdf_hash` NULL lolos (komentar UI eksplisit: bukan rusak — menutup catatan H3); gerbang = panggil `getBranchBeritaAcara`/PPK dulu (403 tanpa jangkauan — konsisten pola T4–T5). Test: live-only 1 entri PPK_SIGNED → FINAL + unduh + reopen → `[1,2]` (arsip v1 FINAL+`pdf_hash` 64-hex, live v2 DRAFT `is_current`) |
| `period-info` (murni, countdown deterministik) | ✅ `getPeriodInfo(y,m,now)` tanpa DB; batas inklusif-consistent dengan T1 (`Math.ceil` — temuan 6a dibetulkan 12→13); invalid → VALIDATION_ERROR; route `/mobile/period-info` tanpa authorize khusus (semua peran terautentikasi, sesuai plugin `mobileRoutes` yang sudah ber-auth) |
| `device-token` (fondasi T11) | ✅ schema `.strict()`; `saveDeviceToken(userId sesi, token)` — tanpa userId body; milik sendiri; kosong/panjang/uuid-tak-ada → 400; test assert kolom `fcmToken` tertulis |
| `staf/ringkasan` + `keuangan/inbox` (scope server) | ✅ service menolak peran salah (FORBIDDEN) dan akun tanpa scope (FORBIDDEN_SCOPE); staf: draft pending/eskalasi (`isEscalated` — reuse T3) + progres PPK + ACTIVE dalam scope; inbox: PPK_SIGNED seranting (+ `needs_force` dari hitung ACTIVE — reuse semantik T5) / branch-signed (filter `rantingSignerId`) sedistrik; FINAL tak masuk antrean. Test: inbox 1 PPK + branch R2, 403 staf |
| roleMap murni (+ test 6) | ✅ normalize/5 predikat/`tabsForRole` (PPK persis 5 tab lama; 4 peran lain tanpa Scan/Tasks/History; UNKNOWN→Profile) + `countdownText`/`toleranceChip`/`reminderFor`/`homeTitle` — 6 unit test deterministik penuh |
| 4 layar + tab peran (PPK tak berubah) | ✅ tab = `tabsForRole(role)` dinamis dari store; TAB_COMPONENTS mencakup 8 nama; Scan FAB dirender hanya bila tab Scan ada (PPK saja); PPK 5 tab persis lama; `Setoran` via stack (tab PPK stabil — klaim konsisten dengan kode). PeriodChip+countdown di Dashboard + mock `c1Service` ditambah di smoke test lama (pilihan benar per temuan 6c: mock lama diperbarui, bukan prod diakali) |
| auto-sync foreground + pengingat in-app | ✅ listener AppState background→active + guard `isSyncing` ganda (store-level); reminder via `reminderFor` di Persetujuan (+ Setoran memakai PeriodChip). Tanda tangan interaktif eksplisit ditunda ke T10 di 3 komentar layar |
| c1Service (DTO + klien kontrak) | ✅ 10 fungsi + 9 interface DTO snake_case cermin backend; `getDrafts` memakai `/admin/period-drafts` (benar: approve+GET sudah `stafOnly` STAFF KE-2 di server — Staf Pengumpulan termasuk — jadi satu endpoint lama terpakai ulang, tanpa duplikasi); `approveDraft` POST body `{}` (konsisten parser JSON kosong T5) |
| Checklist server lain | ✅ cleanup fixture T9 mengikuti pola keras (draft-items dulu + arsip + agregat — konsisten jebakan T7); temuan 6b (pecah R1/R2 agar branch-sign butuh PPK FINAL) terkonfirmasi di `beforeAll` (R1 DRAFT polos vs R2 FINAL+sign) |
| API docs §4.16 | ✅ 5 endpoint + DTO + catatan T10/T11; `pdf_hash` NULL = bukan rusak dicatat dua tempat (docs + komentar `BaVersionItem`) |

## 2. Temuan sesi ini (4, semua non-blokir)

| # | Prio | Isi | Target |
|---|---|---|---|
| K1 | P3 | **`reminderFor` di Persetujuan memalsukan countdown**: `days_to_due: 99, days_to_lock: 99` (konstanta) karena `getStafSummary` tak mengembalikan countdown — akibatnya pengingat "H-7 info" (`days_to_due <= 7`) di layar staf **tak pernah info** (99>7); urgent hanya via `in_tolerance \|\| days<=3`. Koreksi termurah: server sertakan `days_to_due/days_to_lock` di `StafSummary` (atau klien fetch `period-info`), lalu ganti 99 dengan nilai nyata. Bukan sekadar kosmetik: pengingat adalah syarat §15 | T10/backlog |
| K2 | P4 | **`listPpkBaVersions` tak menyaring arsip per-peran**: gerbang baca = berita-acara (sudah scope), tapi daftar arsip tak memfilter status — versi arsip DRAFT ikut tampil bila pernah ada (hari ini arsip hanya lahir dari FINAL/FINAL_NOL sehingga aman; `if (a.version === sub.version) continue` satu-satunya filter). Bila suatu saat arsip bisa lahir dari status lain, tambahkan filter status di sini. Catatan preventif | backlog |
| K3 | P4 | **`saveDeviceToken` tak mencatat audit**: `fcmToken` ditulis + `updatedAt` tanpa `insertActivityLog` (semua jalur insiden/reopen/co-sign punya audit). T11 (push ke token yang tepat) akan lebih mudah diaudit bila ada jejak `DEVICE_TOKEN_SAVED`. Murah: 1 audit best-effort | T11 |
| K4 | P4 | **Drift tipe `Task` (13 error tsc mobile) bukan urusan T9 tapi makin berisiko disentuh**: file T9 (`DashboardScreen`, `api.ts` tanpa `VisitTask`, `FloatingTabBar`, navigator) bersih; tetapi `getDrafts`/layar baru lain tak menutupi bahwa peran baru bekerja di atas tipe basi (`is_visit_task`/`condition` dipakai `TaskDetailScreen` dkk). Saat T10 menyentuh layar apapun yang memakai `Task`, sinkronkan `shared-types` dulu (atau tadahkan di DTO) | T10 |

## 3. Tindak lanjut

- T9 **selesai, boleh merge**. Bukti live sesi ini: backend tsc EXIT 0, web EXIT 0; backend jest **56/56, 485/485**; mobile jest **32/32, 250/250**; mobile tsc = 13 error pre-existing yang terbukti BUKAN dari T9.
- Ditinggalkan dengan benar: T10 web peran + **TTD interaktif mobile** (K1 sekalian diperbaiki — countdown nyata di ringkasan staf — + K4 sinkron tipe `Task`); T11 push asli (+ audit token K3); T12 cron + **rollout 0008–0011 ke produksi** (state terverifikasi: main pra-C1, DB 0007; boleh setelah semua tiket — migrasi mendahului kode `main`).
- Backlog tetap: F2 (purge scope distrik), F7 (bungkus teks PDF), H1-test (J1), J3 (audit `MANUAL_COLLECTION` luar tx).
- Baseline baru untuk T10: backend **56/485**; mobile **32/250**.
