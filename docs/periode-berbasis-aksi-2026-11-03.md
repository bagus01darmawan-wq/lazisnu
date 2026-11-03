# Periode Berbasis Aksi (bukan Kalender)

**Tanggal**: 2026-11-03
**Masalah asal**: BA Oktober milik PPK tertinggal di status `PPK_SIGNED` (menunggu
tanda tangan bendahara). Begitu bulan berganti, semua layar mobile & web memakai
jam dinding sehingga BA itu tidak bisa ditemukan lagi — padahal belum tuntas.

---

## 1. Prinsip

1. **Periode maju karena rantai aksi**, bukan karena tanggal.
2. **Tanggal (20/27/9) hanya pengingat** — tidak ada penolakan aksi berbasis waktu.
3. **Tuntas** = status akhir rantai:
   - PPK: `ppk_submissions.status = 'FINAL'`
   - Ranting: `branch_submissions.status ∈ ('FINAL','FINAL_NOL')`
4. **REASSIGNED netral**: tugas lepas dari petugas asal, bukan beban/progresnya.
5. **Transfer final oleh admin** — tanpa status `TRANSFER_PENDING`.

## 2. Periode tampilan

```
periodeTampil(cakupan) = periode berhak tertua yang belum tuntas
                         ?? periode operasional berjalan
```

- `berhak(P)` = ada `assignments` untuk cakupan itu di P (bukan sekadar DRAFT
  kosong hasil `ensurePpkSubmission`), atau submission sudah ber-TTD/final.
- Cakupan ditentukan peran: petugas → officer, bendahara/admin ranting → branch,
  staf/admin kecamatan → district.
- Jendela pencarian 6 periode terakhir; gate giliran melihat 12 periode ke belakang.
- Bila ada beberapa periode menunggak, `unsettled[]` berisi semuanya (tertua dulu).

## 3. Endpoint

| Endpoint | Isi |
|---|---|
| `GET /v1/mobile/period-context` | `{ current_period, display_period, display_reason, unsettled[] }` |
| `GET /v1/admin/period-context` | idem, cakupan admin |

Alasan tunggakan: `PPK_DRAFT`, `PPK_WAITING_BENDAHARA`, `BRANCH_DRAFT`,
`BRANCH_WAITING_MWC`, `DISTRICT_UNSETTLED`, dengan `waiting_for` pelakunya.

## 4. Gate giliran penugasan

- Diterapkan di `approveDraft` (persetujuan draft) dan endpoint manual
  `POST /admin/assignments`, `bulk-branch`, `bulk-cans`.
- Periode M hanya boleh dibuka bila periode berhak sebelumnya tuntas.
- Mode: `PERIOD_GATE=warn` (default, hanya peringatan di log) atau
  `PERIOD_GATE=enforce` (menolak `409 PREVIOUS_PERIOD_NOT_SETTLED`).
- Pengecualian: kirim `force: true` + `force_reason` → tercatat
  `PERIOD_GATE_OVERRIDE` di `activity_logs`.

## 5. Gerbang waktu yang dilunakkan

| Dulu | Sekarang |
|---|---|
| `assertCollectedAtInWindow` menolak setoran di luar jendela | mengembalikan `late: true`; data tetap masuk, atribusi memakai periode assignment |
| `isPeriodLocked` menolak submit/scan setelah tanggal 10 | dihapus; status "terlambat" hanya badge |
| `assertReopenWindowOpen` (48 jam) menolak tulis | no-op |
| Fase `BELUM_SAATNYA` menolak kunci periode | tidak menolak; diperlakukan REKAP non-destruktif |
| Draft: eskalasi 24 jam / bulan masa depan / periode terkunci | tidak lagi gerbang; diganti gate giliran |
| Reopen assignment hanya periode berjalan | semua periode boleh |

**Tetap dijaga** (integritas, bukan tanggal): data `FINAL` tidak bisa ditimpa tanpa
reopen, satu submission per (officer/branch, periode), TTD tidak bisa diulang,
PPK ≠ bendahara.

## 6. Metrik REASSIGNED

`task_total = ACTIVE + COMPLETED + UNCOLLECTED` (REASSIGNED tidak masuk penyebut).
`task_reassigned` dilaporkan terpisah. Invariant akuntansi:
`task_total + task_reassigned == jumlah baris`.

Contoh: kurir 10 paket, transfer 3, selesaikan 7 → progres 100%.

## 7. Klien

- **Mobile**: `usePeriodStore` mengambil `/mobile/period-context`; Setoran &
  Keuangan memakai `display_period`; Beranda menampilkan banner periode belum
  tuntas + CTA ke Setoran.
- **Web**: `useOperationalPeriod()` → `display_period` menjadi nilai awal
  pemilih periode di Overview, Berita Acara, Rekap MWC, Persetujuan, Penugasan,
  dan Kelola Kaleng. Pemilih periode tetap ada.

## 8. Belum tercakup

- Halaman web `reports` (server component) dan `audit-log` masih default bulan
  kalender; dapat menyusul dengan pola hook yang sama.
- Notifikasi ke bendahara saat giliran TTD berpindah (transfer final juga belum
  mengirim notifikasi ke petugas pengganti).
- `kunciPeriode` masih memakai fase waktu untuk memilih perilaku
  REKAP vs FINAL_NOL; aksinya sendiri tetap manual oleh MWC.
