# C1 — Syarat Lanjutan Hasil Review T0 (20 Sep 2026)

> Status: **BUKAN tugas baru.** Ini acceptance criteria tambahan yang WAJIB
> dipenuhi oleh tugas T1, T4, T7 yang sudah ada di rencana C1. Sumber:
> review C1-T0 20 Sep 2026 (lihat juga `docs/tinjauan/tinjauan-rencana-c1-b1-2026-09-19.md`).
> Semua butir di sini sudah diverifikasi terhadap kode (bukan spekulasi).

## → T1 (kalender periode + cron)

- [ ] Semua perhitungan `assign_date` (tgl 20), `due_date` (tgl 27),
  `tolerance_end` (tgl 9 bln berikutnya 23:59) **wajib lewat satu helper tunggal**
  (mis. `buildPeriodBoundaries` di service kalender) mengikuti kebijakan
  `utils/operationalTimeZone.ts`. Larangan eksplisit (sudah tertulis di file itu):
  jangan menyebar `new Date()` dengan asumsi zona berbeda — preseden bug: server
  VM berjalan UTC, `monthStart` dihitung dari `new Date()` (dashboard.ts:30,
  district.ts:194-195).
- [ ] **Unit test batas wajib**: satu baris kalender lintas tahun (Desember →
  Januari); tepat 23:59:59 tgl 9 masih dalam toleransi, 00:00 tgl 10 sudah LOCKED.
- [ ] Saat deploy (T12): verifikasi TZ container/VM = Asia/Jakarta.
- Premis skema (jangan diubah): kolom `timestamp` tanpa timezone pada
  `period_calendar` adalah **konsisten dengan kebijakan** yang dinyatakan di
  `operationalTimeZone.ts`. Migrasi ke `timestamptz` adalah jalan evolusi di luar C1.

## → T4 (rute/layanan submission PPK & ranting)

- [ ] Route FINAL wajib menegakkan di server: **kedua signer terisi** (bukan hanya
  beda orang). CHECK DB (`ppk_signers_different_chk`,
  `branch_signers_different_chk`) hanya menolak TTD sama orang — ia TIDAK
  mewajibkan kedua TTD terisi; itu wewenang aplikasi.
- [ ] Test integrasi: INSERT/UPDATE dengan kedua TTD = userId yang sama harus
  ditolak DB — dokumentasi hidup pertahanan lapis-2.
- [ ] Test "staf tanpa `branchId` → 403" untuk `STAF_PENGUMPULAN`/`STAF_KEUANGAN`
  (`middleware/ownership.ts` sudah menolak; kunci perilakunya dengan test).

## → T7 (reopen/finalisasi ulang)

- [ ] Reopen wajib **menghanguskan TTD**: reset kolom signer + `signed_at` +
  `signature_url`, dan `version` bertambah. Sudah menjadi komentar desain di
  `schema.ts` (§14.9/14.10); kunci sebagai acceptance criteria, bukan catatan opsional.

## → Backlog (di luar nomor T)

- **TD-06** — noise Redis di jest (BullMQ tidak mengenali ioredis-mock):
  sudah tercatat di `docs/implementation/MASTER-GOAL-LIST.md` bagian Technical
  Debt. Dikerjakan terpisah dari commit fitur (menyentuh jalur queue produksi).
