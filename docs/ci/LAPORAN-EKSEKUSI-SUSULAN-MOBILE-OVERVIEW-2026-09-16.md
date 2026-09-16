# Laporan eksekusi susulan mobile–overview (fix overview 500)

**Tanggal:** 16 September 2026
**Rencana acuan:** `docs/ci/RENCANA-SUSULAN-MOBILE-OVERVIEW-2026-09-16.md` (Fase 0–5)
**Status:** Kode selesai + terverifikasi otomatis. Uji manual staging/APK lama belum dijalankan.

## Ringkasan eksekutif

Fix overview 500 (`0e99267`) benar untuk crash-nya (backend + web) tetapi
meninggalkan 4 alur bisnis yang seharusnya menyentuh mobile. Seluruhnya kini
disambungkan: proposal skip terlihat petugas (Fase 0–1), definisi tugas mobile
disamakan dengan kontrak final 2026-09-13 (Fase 2), alur kunjungan yang tadinya
nol pemanggil kini punya entry point + riwayat (Fase 3), kaleng DIKEMBALIKAN
diberi pesan khusus (Fase 4), dan kelas bug `Date` di `sql` diberi guard
regresi (Fase 5).

## Berkas yang diubah (hanya ini)

Backend (`apps/backend/src`):

- `routes/mobile/tasks.ts` — endpoint `GET /assignments/:id/proposal-status`;
  endpoint `GET /visits`; `month_stats` + `stats-range` memakai kontrak metrik
  final; cabang `CAN_RETURNED` pada scan.
- `services/conditionProposalService.ts` — `getLatestProposalForCan()`.
- `services/officerService.ts`, `services/collectionReportService.ts` —
  filter tanggal ke operator Drizzle (literal string dibungkus `sql`, lihat
  keputusan 1 di bawah).
- `services/__tests__/noRawDateInterpolation.test.ts` — baru (guard regresi).

Mobile (`apps/mobile/src`):

- `services/api.ts` — tipe `proposal_id`, `getProposalStatus()`, `getVisits()`.
- `stores/useTasksStore.ts` — teruskan `proposalId`; `fetchStats` menghitung
  UNCOLLECTED sebagai selesai.
- `stores/useDashboardStore.ts` — merge `task_closed`/`task_uncollected`/`task_active`.
- `screens/TaskDetailScreen.tsx` — banner status usulan, tombol + alur
  "Catat Kunjungan", pesan sukses skip berproposal.
- `screens/ScanScreen.tsx` — pesan `CAN_RETURNED`, pesan sukses skip berproposal.
- `screens/DashboardScreen.tsx`, `screens/RangeStatsScreen.tsx` — tampilkan
  `closed/total` + `belum` (fallback ke field lama untuk server lama).
- `screens/HistoryScreen.tsx` — seksi kunjungan non-penjemputan.

Bersama (`packages/shared-types/src/index.ts`, + rebuild `dist`):

- `ProposalStatusResponse`, `CanVisitHistoryItem` (baru);
  `MonthStats`/`RangeStatsResponse` tambah field opsional
  `task_active`/`task_closed`/`task_uncollected`.

Tidak disentuh: `apps/mobile/android/app/build.gradle`,
`google-services.json` (modifikasi pre-existing di working copy, di luar scope).

## Keputusan penting saat eksekusi

1. **`gte`/`lte` menolak string polos** (kolom timestamp menuntut
   `Date | SQLWrapper`). Literal `YYYY-MM-DD` dibungkus `sql` agar tetap
   string di driver — semantik runtime identik dengan sebelumnya dan tanpa
   risiko geser zona waktu (konversi ke `Date` UTC akan menggeser batas).
   Guard dipersempit: yang dilarang adalah interpolasi tanggal sebagai
   **operand perbandingan langsung**, bukan setiap interpolasi tanggal.
2. **`GET /mobile/visits` ditambahkan** (tidak eksplisit di rencana) sebagai
   sumber data seksi riwayat kunjungan.
3. **Penghapusan enum `POSTPONED` ditunda** (butuh migrasi data).
   `task_total` dihitung dari seluruh baris status yang ada sehingga
   definisinya tetap "seluruh assignment scope + periode".
4. Respons hanya **menambah** field; semua field baru opsional di tipe agar
   aplikasi baru tetap jalan melawan server lama (dan sebaliknya).

## Verifikasi (perintah + hasil)

| Cek | Hasil |
|-----|-------|
| `tsc --noEmit` backend | Hijau, nol error |
| Unit backend `src/services/__tests__` | 12 suite / 87 tes hijau, termasuk guard baru. **Dikoreksi:** 20 suite / 191 tes hijau setelah branch ini (verifikasi ulang 16 Sep 2026) |
| Kontrol negatif guard (pola bug lama `updated_at >= ${start}`) | Terbukti tertangkap |
| `tsc --noEmit` mobile | 18 error (`TS2786`/`TS2607`, pre-existing — bukan "22 baseline"; angka 22 tak terbukti) |
| Uji mobile terkait (`api`, `offlineFlowRegression`, `SkipReasonSheet`) | 3 suite / 34 tes hijau |
| `prettier --check` file mobile tersentuh | Hijau (4 file diformat ulang otomatis) |

## Sisa pekerjaan sebelum rilis

1. Uji end-to-end staging: skip `CAN_LOST` → usulan PENDING di web →
   approve → angka overview berubah → banner mobile berubah APPROVED.
2. Uji kunjungan: VERIFIKASI/PENGGANTIAN dari HP → kondisi berubah → angka
   infak tidak bergerak → riwayat tampil.
3. Uji APK lama: skip tanpa `reason_code` tetap sukses; ring lama tetap tampil
   (persen bisa sedikit turun karena denominator kini lengkap — ekspektasi).
4. Uji scan kaleng DIKEMBALIKAN → pesan `CAN_RETURNED`.
5. Tinjau apakah `POSTPONED` jadi dihapus via migrasi (keputusan produk).

## Risiko terbuka

- Perubahan makna `task_total`/`task_completed` di server memengaruhi tampilan
  APK lama yang masih memakai rumus lama (persen progres bisa turun). Ini arah
  yang disepakati dokumen 2026-09-13, tetapi perlu komunikasi rilis.
- Endpoint `proposal-status`/`visits` baru perlu liputan uji integrasi
  ber-database (belum ada; pola `routes/__tests__` tersedia bila DB uji siap).
