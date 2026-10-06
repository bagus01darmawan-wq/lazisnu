# C1 — Syarat Lanjutan Hasil Review T2 (20 Sep 2026)

> Status: **BUKAN tugas baru.** Ini acceptance criteria tambahan yang WAJIB
> dipenuhi oleh tiket yang sudah ada di rencana C1 (T3, T8, T9, T12) plus satu
> aksi seketika sebelum PR. Sumber: review C1-T2 20 Sep 2026 atas commit
> `24b51f7` (`feat(c1-t2): scan toleran lintas periode + kunci submit + kode
> QR_PERIOD`). Semua butir diverifikasi terhadap kode — T2 LULUS; butir di sini
> adalah penajaman, bukan pemblokir. Pola dokumen mengikuti
> `C1-SYARAT-LANJUTAN-REVIEW-T0-2026-09-20.md`. Dokumen induk C1 adalah salinan
> verbatim dan tidak boleh diedit.
>
> Premis T2 yang sudah dikunci (jangan dibongkar tugas berikutnya): lookup
> toleran `classifyScan` murni; kunci submit di `validateAssignmentForSubmit`;
> jendela `collected_at` `[assign_date, tolerance_end] ±10 mnt`
> (`assertCollectedAtInWindow`, `CLOCK_SKEW_MINUTES=10`); penolakan non-retry →
> gagal permanen yang terlihat di antrean HP.

## Aksi seketika — sebelum PR

- [ ] **Pindahkan commit T2 ke branch sendiri** `feat/c1-t2-scan-submit-kunci-…`
      (sekarang menumpang `feat/c1-t1-kalender-periode-2026-09-20`, commit
      `24b51f7`). Cherry-pick + rebase cukup; T3 mulai dari branch T2 ini, bukan
      branch T1, agar riwayat PR satu-tiket-satu-branch.

## → T3 (generate approve, §14.12–14.13)

- [ ] **Guard periode masa depan pada scan/HIT** (temuan #1): `classifyScan`
      saat ini dapat mengembalikan `HIT` untuk assignment ACTIVE periode *masa
      depan* bila petugas tidak punya assignment periode berjalan
      (`scanClassification.ts:77-82` — `activeInWindow[0]` hasil sort desc).
      Dalam alur normal (generate tepat tgl 10/20, §6) kasus ini jarang, tetapi
      saat T3 menulis robot generate, pastikan: (a) robot TIDAK membuat
      assignment lebih awal dari `assign_date` periode ybs; (b) tambahkan guard
      atau dokumentasikan eksplisit bahwa HIT hanya sah untuk
      `period <= periode berjalan` — sama disiplinnya dengan asumsi
      PERIOD_CLOSED (hanya bln lalu) yang sudah tertulis di T2.
- [ ] Baris `period_calendar` yang ditulis robot wajib identik dengan
      `buildPeriodBoundaries(y, m)` (assign 20 00:00, due 27 23:59:59,
      tolerance_end 9 bln berikut 23:59:59) — smoke test ini sudah menjadi
      langkah 4 checklist T12; T3 memastikan datanya bisa dibandingkan.

## → T8 (laporan MWC + selisih, §14.5/13)

- [ ] **`anomaly_flags` tidak pernah diisi oleh T2** (temuan #2): §14.3
      menawarkan "tolak `VALIDATION_ERROR` / flag `anomaly_flags` + audit".
      T2 memilih jalur tolak + audit (`COLLECTED_AT_REJECTED` di
      `activity_logs`; `collections.ts:87-114` online, `mobileSyncService.ts:98-123`
      batch) TANPA menulis flag anomaly apa pun. Keputusan ini sah, tetapi T8
      harus tahu: selisih/laporan tidak boleh mengandalkan `anomaly_flags`
      untuk mendeteksi klaim `collected_at` menyimpang — satu-satunya jejak
      adalah baris audit tersebut. Bila T8 tetap ingin flag, tambahkan kolom/
      penulisan flag di jalur T8 sendiri, jangan ubah semantik penolakan T2.

## → T9 (mobile 1 APK peran)

- [ ] **Pesan ber-periode vs fallback statis** (temuan #4): server mengirim
      pesan ber-periode untuk `ALREADY_COLLECTED` ("sudah dijemput pada periode
      2026-09", `scanClassification.ts:60-62`), tetapi `ScanScreen.tsx` hanya
      memprioritaskan pesan server untuk `QR_WRONG_PERIOD`/`QR_PERIOD_CLOSED`
      (`SERVER_MESSAGE_CODES`, `ScanScreen.tsx:48-49`). Untuk
      `QR_ALREADY_SUBMITTED` fallback statis ("sudah disetor pada periode
      berjalan") bisa menimpa pesan ber-periode. Saat menyentuh ScanScreen di
      T9 (chip Toleransi, countdown), tambahkan `QR_ALREADY_SUBMITTED` ke
      `SERVER_MESSAGE_CODES` — perubahan 1 baris, tanpa ubah wire.
- [ ] Chip Toleransi T9 WAJIB membaca `tolerance` dari respons scan (sudah
      tersedia; `packages/shared-types` `Task.tolerance?`). Dengan guard T3
      butir pertama, `tolerance: true` berarti persis "bulan lalu" — tidak ada
      arti lain.

## → T12 (rollout + docs + bersih-bersih, §14.14/16)

- [ ] **CI: suite integration wajib seri** (temuan #3): test integrasi
      DB (`*.integration.test.ts`, termasuk `periodLock.integration.test.ts`)
      melakukan `DROP RULE`/`CREATE RULE` GLOBAL pada tabel `collections`
      (`periodLock.integration.test.ts:14-23`) dan memakai `closeDbConnection`
      di `afterAll`. Bila CI menjalankan workers paralel, dua suite integrasi
      bisa saling menjatuhkan (lolos seri — terbukti 41/41 hijau saat berjalan
      bersama kali ini, tetapi racy). Di CI, jalankan pola `*.integration`
      dengan `--runInBand` (pola `test:integration` di
      `apps/backend/package.json`) atau pisahkan lewat jest `projects`.
      Cantumkan di baris tiket T12 bersama revisi B1/checklist/API/metrik
      (§15:444).
- [ ] **Pola fixture tanggal dinamis**: fixture Juni statis sudah diperbaiki
      jadi periode dinamis (dilaporkan di laporan T2). T12 memastikan semua
      fixture tanggal baru mengikuti pola itu supaya suite tidak kedaluwarsa
      oleh waktu.

## → Backlog (di luar nomor T)

- (tidak ada butir baru T2; TD-06 Redis-noise tetap tercatat di
  `MASTER-GOAL-LIST.md` dan tidak disentuh oleh T2.)
