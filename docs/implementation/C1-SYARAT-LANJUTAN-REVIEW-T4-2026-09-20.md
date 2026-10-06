# C1 — Syarat Lanjutan Hasil Review T4 (20 Sep 2026)

> Status: **BUKAN tugas baru.** Ini acceptance criteria tambahan yang WAJIB
> dipenuhi oleh tiket lanjutan (T5, T6/T8) plus satu aksi seketika sebelum PR.
> Sumber: review C1-T4 20 Sep 2026 atas commit `3a3f009` (`feat(c1-t4):
> submission PPK dan ranting - hitung otomatis, FINAL, kunci, version`).
> Semua klaim laporan T4 diverifikasi terhadap kode dan eksekusi ulang —
> T4 LULUS (tsc backend/web EXIT 0; `npx jest --ci --runInBand` 45/45 suite,
> 421/421 test hijau, direproduksi saat review). Butir di sini adalah
> penajaman, bukan pemblokir. Pola dokumen mengikuti
> `C1-SYARAT-LANJUTAN-REVIEW-T3-2026-09-20.md`. Dokumen induk C1 adalah salinan
> verbatim dan tidak boleh diedit.
>
> Premis T4 yang sudah dikunci (jangan dibongkar tugas berikutnya): angka murni
> dari sistem (`computePpkTotals` SUM versi terbaru COMPLETED + `c1Math` ceil,
> tanpa ketik nominal); ensure = hitung-ulang selama DRAFT, baris FINAL beku;
> FINAL = 1 transaksi, tombol mati sekali (`UPDATE … WHERE DRAFT + version` +
> cek baris terpengaruh → `CONFLICT` 409); gerbang peran FINAL PPK (PPK
> miliknya / Keuangan seranting tanpa force / Admin Ranting hanya force +
> alasan); FINAL ranting hanya Admin Ranting pemilik; kunci
> submit/resubmit/skip pasca-FINAL di choke point (`QR_ALREADY_SUBMITTED`
> non-retry) — online maupun batch sama-sama tertutup.

## Aksi seketika — sebelum PR

- [ ] **Rapikan footnote aritmetika test di laporan T4** (temuan #4):
      laporan menulis "baseline 43/402 + 10 integrasi T4 + 6 scope + 1 katalog
      + 1 fix-T3 +1? — total konsisten" padahal 402+10+6 = 418 ≠ 421 dan tiga
      test sisanya tidak dijelaskan. Angka akhir **421/421** benar (diverifikasi
      saat review); perbaiki penjabarannya agar jejak audit konsisten (jelaskan
      dari suite mana 3 test tambahan berasal, atau cantumkan baseline
      terukur). Tidak ada perubahan kode.

## → T5 (co-sign 2 HP + berita acara + berkas, §14.6/8/9)

- [ ] **Scope bendahara signer wajib divalidasi** (temuan #1 — paling penting):
      `loadUserRoleTx` (`ppkSubmissions.ts:409–415`) hanya mengecek
      `role === 'STAF_KEUANGAN'`. Akibatnya di FINAL PPK maupun FINAL ranting,
      STAF_KEUANGAN dari ranting/distrik *lain* bisa dicatat sebagai penandatangan
      kedua (submit id-nya saja). Ini celah lebih lebar dari "celah spoof id"
      yang sudah disebut laporan T4. Saat T5 memindahkan penandatangan ke
      `signer_id = pemilik sesi`, sekaligus kunci scope:
      bendahara FINAL PPK = STAF_KEUANGAN **seranting** dengan setoran;
      bendahara FINAL ranting = STAF_KEUANGAN **satu distrik** (MWC) ranting
      itu. Test 4 varian signer-ditolak T4 ditambah varian "keuangan ranting
      lain → ditolak".
- [ ] **Saran T5 dari laporan T4 tetap berlaku** dan menjadi bagian tiket:
      endpoint sign per sesi (PPK di HP-nya, bendahara di HP-nya) menutup celah
      spoof id; status `PPK_SIGNED` perantara; PDF lazy dari snapshot +
      `pdf_hash` per versi; R2 privat-rasa-publik + audit unduh + consent TTD;
      QR verifikasi minimal.
- [ ] **Kunci baris submission saat cek terbuka** (temuan #2, murah):
      `assertSubmissionOpen` (`collectionSubmission.ts`) dan hitungan ACTIVE di
      `finalizePpkSubmission` (`ppkSubmissions.ts:318–334`) adalah point-read
      tanpa `FOR UPDATE` pada isolation READ COMMITTED — submit yang commit
      tepat setelah FINAL commit bisa lolos (baris FINAL + 1 collection tak
      terhitung). Jendela milidetik dan masih bisa dibereskan lewat reopen T7,
      tapi tambah `SELECT … FOR UPDATE` pada baris `ppkSubmissions` di
      `assertSubmissionOpen` (baris belum ada = terbuka, perilaku tetap)
      menutupnya tanpa mengubah semantik. Boleh digabung ke T5 atau dikerjakan
      sebagai patch kecil mandiri.

## → T6/T8 (orkestrasi kunci berlapis / agregat-insiden)

- [ ] **GET list ranting = tulis + N+1** (temuan #3, catatan desain):
      `GET /admin/branch-submissions` (`branchSubmissions.ts:23–54`) memanggil
      `ensureBranchSubmission` per ranting — untuk Admin Kecamatan berarti N
      query agregat + N upsert DRAFT pada operasi GET. Benar secara desain
      "ensure", dan skala ranting kecil membuatnya wajar; bila ranting per
      distrik membesar (atau T6 perlu daftar massal), pecah: list ringan tanpa
      upsert + hitung on-demand, upsert hanya di detail/finalize. Jangan
      "merapikan" dengan satu query global dulu tanpa alasan ukuran.
- [ ] Ketetapan review-T3 tetap berlaku: fixture beraudit wajib hapus
      `activity_logs` dulu (pola `deleteMyAuditTrails` — terbukti lagi di
      `ppkSubmissions.integration.test.ts`); suite integrasi tetap seri
      (`--runInBand` di CI).

## Backlog (di luar nomor T)

- [ ] TD-06 Redis-noise tetap tercatat di `MASTER-GOAL-LIST.md` dan tidak
      disentuh oleh T4 (log jest masih menampilkan `ECONNREFUSED 6379` +
      "Force exiting Jest" — pre-existing, semua test tetap hijau).
- [ ] **Disiplin T4 yang dipertahankan ke depan**: tanpa migrasi/kolom baru di
      tiket fitur (T4 bersih — diff tak menyentuh `schema.ts`/migrations/
      `shared-types`); tanpa DB non-lokal; tanpa `git add -A`; audit tidak
      boleh menggagalkan FINAL yang sah (`try { insertActivityLog } catch {}`).
