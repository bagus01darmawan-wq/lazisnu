# C1 — Syarat Lanjutan Hasil Review T3 (20 Sep 2026)

> Status: **BUKAN tugas baru.** Ini acceptance criteria tambahan yang WAJIB
> dipenuhi oleh tiket lanjutan (T4, T12) plus satu aksi seketika sebelum PR.
> Sumber: review C1-T3 20 Sep 2026 atas commit `aa29a62` (`feat(c1-t3):
> generate approve robot-draft-manusia-setujui + eskalasi 24 jam`). Semua butir
> diverifikasi terhadap kode — T3 LULUS; butir di sini adalah penajaman, bukan
> pemblokir. Pola dokumen mengikuti
> `C1-SYARAT-LANJUTAN-REVIEW-T2-2026-09-20.md`. Dokumen induk C1 adalah salinan
> verbatim dan tidak boleh diedit.
>
> Premis T3 yang sudah dikunci (jangan dibongkar tugas berikutnya): robot hanya
> menulis draft + `period_calendar` (TIDAK pernah `assignments` di jalur DRAFT);
> approve = 1 transaksi, tombol mati sekali (`WHERE status='DRAFT'` + cek baris
> terpengaruh); eskalasi Keuangan 24 jam; telat = `assignedAt` saat setuju;
> guard masa depan/kunci di approve dan guard future-HIT di `classifyScan`;
> sapuan susulan pasca-approve yang teraudit (`DRAFT_TOPPED_UP_POST_APPROVAL`).

## Aksi seketika — sebelum PR

- [ ] **Koreksi angka test di laporan T3** (temuan #1): laporan menulis
      `402/402`; eksekusi ulang (`npx jest --runInBand`) menghasilkan
      **404/404, 43/43 suite**. Perbaiki angka di laporan agar jejak audit
      konsisten (selisih +2 kemungkinan dari run sebelum penambahan test
      terakhir). Tidak ada perubahan kode.

## → T4 (submission PPK + berita acara, §14.5/10)

- [ ] **Validasi petugas aktif saat approve** (temuan #2, pinjam pola T3):
      `approveDraft` memasukkan `officerId` dari item draft apa adanya — petugas
      yang dinonaktifkan antara prepare (tgl 10) dan approve (bisa >24 jam)
      tetap melahirkan tugas ACTIVE. Edit item (`updateDraftItem`) sudah
      memvalidasi `isActive`, approve belum. Perbaikan murah: satu query
      `inArray` officers aktif di dalam transaksi approve → tolak
      `VALIDATION_ERROR` (atau daftarkan sebagai bagian kualitas T4; jangan
      ubah semantik tombol-mati T3). Temuan ini juga dicatat sebagai tindak
      lanjut mandiri bila T4 tidak menyentuh draft.
- [ ] Saran T3 untuk T4 tetap berlaku dan diturunkan ke butir tiket T4:
      hitung `ceil` otomatis (`c1Math`) saat FINAL; tolak resubmit/skip
      pasca-FINAL; `version` optimistik; kedua-signer wajib terisi di server
      (CHECK DB tak mencakupnya — syarat review-T0); test staf-tanpa-`branchId`
      → 403 (pola `assertDraftAccess` T3).

## → T12 (rollout + docs + bersih-bersih, §14.14/16)

- [ ] **Pola fixture beraudit ke depan** (temuan dari laporan T3, dikonfirmasi):
      fixture integrasi `periodDrafts.integration.test.ts` wajib menghapus
      `activity_logs` lebih dulu (FK `users`/`entityId`) sebelum users/draft —
      pola `deleteMyAuditTrails`. Semua suite baru yang menulis audit wajib
      mengikuti pola ini supaya cleanup idempoten.
- [ ] **CI: suite integrasi tetap seri** (ketetapan review-T2, tidak berubah):
      `periodDrafts.integration.test.ts` bergabung ke pola
      `*.integration.test.ts` yang dijalankan `--runInBand` di CI. Catatan baru:
      suite T3 juga melakukan `DROP RULE`/`CREATE RULE` global
      (`withImmutableRulesDisabled`) — memperkuat alasan wajib-seri.

## Backlog (di luar nomor T)

- [ ] **Penamaan `calendarRowWritten`** (temuan #3): nilai yang dikembalikan
      sebenarnya "baris kalender kini cocok dengan helper" (true walau tidak
      menulis; false bila baris warisan meleset). Perilakunya benar (baris
      warisan tidak ditimpa — rekonsiliasi manual via smoke T12), hanya nama/
      komentar yang perlu diperjelas. Ganti nama (mis.
      `calendarRowConsistent`) atau tambah komentar 1 baris.
- [ ] **`listDrafts` N+1** (temuan #4): hitung `itemCount` per draft dengan
      query terpisah per baris. Wajar untuk skala ranting; bila branch
      membesar, satukan ke satu query `GROUP BY draftId`.
- [ ] **Transaksi per-branch di `preparePeriodDraft`** (temuan #5, keputusan,
      bukan perbaikan): crash di tengah menyisakan sebagian draft; desain ini
      diterima karena idempoten (run ulang men-top-up sisanya). Dicatat agar
      tugas berikutnya tidak "merapikan" menjadi satu transaksi global tanpa
      alasan — itu justru memperpanjang durasi lock seluruh tabel branches.
- [ ] TD-06 Redis-noise tetap tercatat di `MASTER-GOAL-LIST.md` dan tidak
      disentuh oleh T3.
