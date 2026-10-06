# C1 — Syarat Lanjutan Hasil Review T5 (20 Sep 2026)

> Status: **BUKAN tugas baru.** Ini temuan terbuka + acceptance tambahan dari
> review C1-T5, 20 Sep 2026 atas commit `3393ecfb50ee68f09a95d849be5a43de5151a931`
> (branch `feat/c1-t5-cosign-ba-berkas-2026-09-20`, `feat(c1-t5): co-sign 2 HP +
> BA teks + PDF lazy + verifikasi + purge`). Semua klaim laporan T5 diverifikasi
> ulang terhadap kode dan eksekusi — **T5 LULUS**: `npx tsc --noEmit` backend &
> web EXIT 0; `jest` **48/48 suite, 451/451 test** hijau (dijalankan ulang di
> `apps/backend`, 102 dtk). Tak satu pun temuan di bawah memblokir merge; F1,
> F4, F5 murah dan layak diberesi sebelum PR, sisanya dicatat untuk tiket
> lanjutan. Pola dokumen mengikuti
> `C1-SYARAT-LANJUTAN-REVIEW-T4-2026-09-20.md`. Dokumen induk C1 dan dokumen
> `C1-SYARAT-LANJUTAN-REVIEW-T0/T2/T3/T4-*` bersifat read-only.

> **Premis T5 yang sudah dikunci (jangan dibongkar tugas berikutnya):**
> `signer_id` selalu pemilik sesi (kunci `*_signer_id` di body → 400 `.strict()`);
> `sign` PPK DRAFT→`PPK_SIGNED` sekali (ulang = CONFLICT) → `countersign`
> bendahara **seranting** (`FINAL` bila `ACTIVE=0`, selain itu tetap `PPK_SIGNED`
> + `needs_force`); `force-finalize` Admin Ranting wajib kedua TTD + alasan
> (hanya menimpa gerbang `ACTIVE`, tidak pernah syarat TTD); tier-2 `sign`
> Admin Ranting tetap DRAFT (+ angka T4) → `countersign` MWC sedistrik →
> `FINAL`/`FINAL_NOL`; BA teks & PDF dibangun dari **snapshot** (bukan hitung
> ulang) + cap `DRAFT — belum sah` pra-FINAL; PDF lazy saat unduh, `pdf_url` =
> KEY acak `ba-pdfs/{tier}/{id}/v{n}-{uuid}.pdf`, `pdf_hash` = SHA-256 bytes
> (arsip) dan hash QR = SHA-256 konten kanonis (otentisitas) — dua hash, dua
> guna; FINAL tidak pernah bergantung R2; `purgeSignatureFile` hanya prefix
> `signatures/`; semua transisi 1 transaksi + `expected_version` → CONFLICT.
> **Baseline baru untuk T6: 48 suite / 451 test** (baseline T4: 45/421).

## Ringkasan temuan

| # | Prio | Lokasi | Ringkas | Target |
| --- | --- | --- | --- | --- |
| F1 | P2 | `services/cosign.ts:181,254,434,523` | Coretan diunggah ke R2 **sebelum** gerbang kepemilikan/scope/status/versi → objek yatim di setiap percobaan 403/400/409; coretan lama juga tidak dihapus saat re-sign tier-2 | Aksi seketika (F1a); F1b → T7 |
| F2 | P2 | `routes/admin/signatures.ts:14–21` | Purge coretan tidak terikat scope distrik admin (hanya prefix `signatures/`) | Backlog keamanan-retensi |
| F3 | P3 | `services/baPdfService.ts:392–409` | Verifikasi QR tidak mengecek status `FINAL`/`FINAL_NOL` — `valid:true` berarti "konten cocok hash", bukan "BA sah" | T6 (sebelum QR dipakai UI T9/T10) |
| F4 | P3 | tidak ada di test | Jebakan #1 (`.strict()` menolak `*_signer_id`) benar di kode tapi **belum diuji** | Aksi seketika (1 test) |
| F5 | P4 | `API_DOCUMENTATION.md:485`, `baPdfService.ts:12` | Nit dokumen/komentar: kalimat "Tanda ulang / versi basi → 409" menempel di `GET /pdf` yang justru idempoten; komentar "Deterministik … bytes stabil" overstate (doc-ID pdf-lib acak) | Aksi seketika (docs/komentar) |
| F6 | P4 | `services/cosign.ts:546–560` | `as_nol` tidak dipersistensi → `FINAL_NOL` diturunkan dari (total 0 + share 0 + alasan tersimpan) | T6 (putuskan saat kunci berlapis) |
| F7 | P4 | `services/baPdfService.ts:164–169` | Pernyataan BA dipotong `substring(0,95)` — kalimat/nama panjang terpotong di PDF | Backlog (kosmetik) |
| F8 | P4 | `services/cosign.ts:263–277` | Bendahara boleh `countersign` berkali-kali selama `PPK_SIGNED` (menimpa coretan); PPK justru sekali jalan | T6 (putuskan kebijakan) |

## Aksi seketika — sebelum PR T5 (murah, tidak memblokir)

- [ ] **F1a — Hapus objek bila sign/countersign gagal setelah upload.**
      `uploadSignature()` dipanggil di `cosign.ts:181` (`signPpkSubmission`),
      `:254` (`countersignPpkSubmission`), `:434` (`signBranchSubmission`),
      `:523` (`countersignBranchSubmission`) — semuanya **sebelum** transaksi
      yang memeriksa kepemilikan (`officer.userId !== actor.userId`), scope
      (`assertPpkBendaharaScope`/`assertMwcBendaharaScope`/
      `actor.branchId !== sub.branchId`) dan status/versi. Akibatnya setiap
      percobaan yang berakhir 403/400/409 tetap meninggalkan PNG yatim di
      bucket, sementara `deleteFromR2` hanya dipakai `purgeSignatureFile`
      (`cosign.ts:802`). Dampak terbatas (butuh user terautentikasi, ≤50KB,
      rate-limit global 100/menit di `app.ts:90`) — higiene biaya/limbah, bukan
      kebocoran. Saran: pindahkan upload ke dalam transaksi setelah gerbang lolos,
      atau bungkus `try { … } catch (e) { await deleteFromR2(key); throw e; }`.
      Verifikasi cepat: `Select-String -Path apps/backend/src/services/cosign.ts
      -Pattern 'uploadSignature\('` (4 panggilan) vs `deleteFromR2` (1, di purge).
- [ ] **F4 — Test jebakan #1: body ber-`signer_id` harus 400.** Ini inti tiket
      T5, tapi satu-satunya yang belum dipagari test. Cukup satu test
      schema/HTTP: `POST /mobile/submissions/:id/sign` dengan body memuat
      `ppk_signer_id` (atau `POST /admin/branch-submissions/:id/sign` dengan
      `ranting_signer_id`) → `400 VALIDATION_ERROR`. Tanpa ini, regresi
      `.strict()` (mis. berubah ke `.passthrough()` saat menambah field) tidak
      akan tertangkap. Bukti celah: `git grep -n 'signer_id' --
      'apps/backend/src/**/*.test.ts'` hanya memuat assertion respons + kasus T4,
      tidak ada kasus "key asing di body ditolak".
- [ ] **F5 — Rapikan nit dokumen/komentar.**
      (a) `docs/API_DOCUMENTATION.md:485` menutup paragraf `GET …/pdf` dengan
      "Tanda ulang / versi basi → `409 CONFLICT`" — padahal GET pdf idempoten
      (`reused: true`); kalimat itu milik `sign`/`countersign`. Pindahkan ke
      paragraf yang tepat (atau hapus dari blok PDF).
      (b) Komentar `baPdfService.ts:12` ("Deterministik: metadata tanggal PDF
      difiksasi agar bytes stabil", lihat juga `:61`) overstate: tanggal/title
      memang difiksasi, tetapi doc-ID pdf-lib tetap acak sehingga bytes **tidak**
      identik antar-generate — idempotensi dijamin hash tersimpan, bukan
      determinisme renderer. Sesuaikan komentarnya agar tidak menyesatkan sesi T7
      saat menyusun arsip per versi.

## → T6 (kunci berlapis MWC + notifikasi, §14.7)

- [ ] **F3 — Verifikasi QR harus memeriksa status sah.** `verifyBaRecord`
      (`baPdfService.ts:392–409`) sudah benar membandingkan `version` + hash
      konten, tapi tidak memeriksa `status`. Artinya `valid:true` = "konten
      cocok dengan hash", bukan "BA ini terbit/sah". QR hanya dicetak di PDF
      FINAL, jadi bukan lubang praktis hari ini; namun saat T9/T10 menampilkan
      halaman verifikasi ("SAH/TIDAK") dan T6 menambah varian status
      (`FINAL_NOL` massal), tambahkan gerbang `status ∈ {FINAL, FINAL_NOL}` pada
      `verifyBaRecord` (uji: hash konten benar + status DRAFT → `false`).
      Alternatif yang sah: dokumentasikan tegas di §API bahwa `valid` =
      integritas konten, bukan status — tetapi gerbang status lebih kuat.
- [ ] **F6 — Putuskan representasi `as_nol`.** Sekarang `as_nol` tidak disimpan;
      `countersignBranchSubmission` menurunkannya sebagai
      `computed.total === 0 && computed.shareMwc === 0 && storedReason !== null`
      (`cosign.ts:548–560`, `:579`). Untuk §14.7 (FINAL_NOL = 0 pemasukan) ini
      benar dan deterministik, tetapi `variance_reason` yang terisi "gratis" pada
      setoran total 0 akan menjadikannya `FINAL_NOL` tanpa niat eksplisit. Kalau
      T6 (kunci periode tahap-b) perlu membedakan "NOL karena laporan nol" vs
      "NOL kebetulan + alasan", simpan flag/kolom turunan di T6 (ingat: T5
      sengaja **tanpa migrasi**) atau bakukan definisinya di §14.7.
- [ ] **F8 — Kebijakan re-countersign bendahara.** `countersignPpkSubmission`
      menolak hanya bila `FINAL` atau status ≠ `PPK_SIGNED`
      (`cosign.ts:263–277`), sehingga selama `needs_force` bendahara bisa
      menandatangani ulang berkali-kali (menimpa `bendahara_signature_url` +
      audit baru + objek lama jadi yatim — lihat F1b). PPK sendiri sekali jalan.
      Tentukan: biarkan (koreksi coretan sebelum FINAL) atau tolak bila
      `bendaharaSignerId` sudah terisi dan bukan sesi itu. Jangan mengubah
      diam-diam tanpa keputusan — perilaku sekarang konsisten dengan semantik
      "menimpa" tier-2.
- [ ] Saran T6 dari laporan T5 tetap berlaku: `POST /v1/admin/kunci-periode`
      (MWC) dua tahap — tahap-a (27–9: tarik FINAL saja) vs tahap-b (10+: buat
      `FINAL_NOL` + audit + notifikasi + flag merah "bukan lapor") memakai
      `finalizeBranchSubmission(asNol)` + `resolvePeriodStatus`; tombol Kunci
      Ranting sudah tersedia lewat `sign` + `countersign` T5 (tanpa endpoint baru).
- [ ] Ketetapan review-T4 tetap berlaku: list ranting = ensure tulis + N+1
      (`GET /admin/branch-submissions`); T6 boleh memecahnya (list ringan tanpa
      upsert) bila volume ranting naik — jangan "merapikan" tanpa alasan ukuran.

## → T7 (reopen + arsip PDF per versi)

- [ ] **F1b — Higiene berkas saat menghanguskan TTD / re-sign.** T7 akan
      menghapus TTD saat reopen dan menaikkan `version`; sekalian pastikan
      coretan lama dihapus (`deleteFromR2`) dan `pdf_url`/`pdf_hash` di-`null`-kan
      agar `ensure*BaPdf` tidak menyajikan PDF versi lama sebagai idempoten yang
      sah. Perhatikan: bytes PDF lama **tidak bisa** diregenerasi identik
      (jebakan T5 #c) → arsip per versi butuh tabel riwayat PDF, bukan kolom
      tunggal (sudah dicatat laporan T5).
- [ ] Purge saat ini sengaja membiarkan kolom `*_signature_url` menunjuk key
      yang sudah dihapus (PDF lama tampil "(arsip coretan tidak terbaca)") —
      didokumentasikan di `cosign.ts:793–795`. T7 harus menegaskan mana yang
      berlaku setelah reopen (TTD hangus = kolom `null`, bukan key hantu).

## Backlog (di luar nomor T)

- [ ] **F2 — Purge coretan terikat scope.** `DELETE /admin/signatures`
      (`routes/admin/signatures.ts:14–21`) hanya `authorize('ADMIN_KECAMATAN')`
      + prefix `signatures/` di `purgeSignatureFile` (`cosign.ts:798–802`).
      Admin distrik lain bisa menghapus coretan distrik bukan miliknya **bila**
      key-nya bocor (UUID acak — tebak-tebakan praktis mustahil). Perkuat:
      resolve key → baris submission (kolom `*_signature_url`), cek `districtId`
      admin, tetap wajib alasan; audit `SIGNATURE_PURGED` sudah ada.
- [ ] **F7 — Pembungkusan teks PDF.** `baPdfService.ts:167` memotong pernyataan
      pada 95 karakter (`substring(0,95)`) sehingga kalimat/nama panjang
      terpotong tanpa elipsis. Ganti dengan pembungkus kata sederhana
      (`maxWidth` sudah disiapkan pdf-lib) saat menyentuh renderer lagi
      (beririsan T7 arsip).
- [ ] TD-06 (noise Redis di jest) tetap pre-existing dan tidak disentuh T5 —
      log review masih memuat `ECONNREFUSED 6379` + "Force exiting Jest",
      semua test tetap hijau.
- [ ] Catatan lingkungan: `apps/mobile` punya error `TS2786` pre-existing yang
      tidak berubah oleh T5 (diff T5 tidak menyentuh `apps/mobile`/`packages`);
      jest mobile tidak dijalankan sesuai instruksi prompt.

## Bukti verifikasi review (agar sesi T6 tidak mengulang)

Dijalankan 20 Sep 2026 di `C:\Users\user\Documents\lazisnu` pada `3393ecf`:

```
cd apps/backend ; npx tsc --noEmit                       → EXIT 0
cd apps/web     ; npx tsc --noEmit                       → EXIT 0
cd apps/backend ; node .\node_modules\jest\bin\jest.js --ci --runInBand
   → Test Suites: 48 passed, 48 total
   → Tests: 451 passed, 451 total   (102,4 dtk; 0 baris FAIL, 48 baris PASS)
```

Catatan cara jalan: `npx jest … | Select-Object` di PowerShell bisa terpotong
karena banner `npm notice` ditulis ke stderr (`NativeCommandError`); pakai
`node .\node_modules\jest\bin\jest.js` langsung, atau `cmd /c "… > log 2>&1"`
lalu baca lognya.

Aritmetika test (dihitung ulang, bukan dikutip): baseline 45 suite/421 test →
head 48/451. `git ls-tree` berkas `*.test.ts`: 45 → 48. Deklarasi `test(`/`it(`:
384 → 414 (+30 = 13 unit `beritaAcara` + 12 integrasi `cosign` + 3 HTTP
`verify-ba` + 2 scope-T4), offset deklarasi→jumlah jest identik di baseline dan
head (37) — klaim 421 dan 451 saling konsisten.

Juga diverifikasi: 19 berkas berubah; `origin/feat/c1-t5-…` = `3393ecf` (push ✅);
tak ada berkas migrasi; `apps/mobile`/`packages` tak tersentuh; tak ada pemanggil
rute `finalize` lama lagi (`git grep -i 'finalize|countersign|berita-acara' --
apps/mobile apps/web packages` → kosong); CHECK DB `ppk_signers_different_chk`
dan `branch_signers_different_chk` ada di `0008_blue_proteus.sql:106–107`;
`FOR UPDATE` ada di `collectionSubmission.ts:38–42`; `getSignedDownloadUrl(key,
600)` benar-benar dipakai (TTL dihormati) dan `Cache-Control: private` terpasang
di unggahan TTD maupun PDF.

## Jebakan T5 yang terbukti (bekal sesi berikutnya)

1. Konstanta magic PNG: `0x47` = 71 desimal — menulis `47` membuat guard
   lolos-meloloskan. Test pertama T5 menangkap ini; jangan "merapikan" test itu.
2. pdf-lib `StandardFonts` = WinAnsi: nama ber-em-dash/quote meledakkan
   `drawText` → wajib lewat `asciiSafe` (`beritaAcara.ts:44–57`).
3. pdf-lib menyisipkan doc-ID acak → bytes PDF **tidak** deterministik;
   idempotensi dijamin `pdf_hash`/`pdf_url` tersimpan, bukan regen.
4. `Buffer.from(str, 'base64')` tidak pernah throw → validasi coretan
   mengandalkan round-trip + magic + ukuran (`cosign.ts:65–83`).
5. Verifikasi QR wajib seragam (`{ valid }`, HTTP 200) untuk id tak dikenal,
   format salah, tipe salah, versi beda — pola `scan-qr.test.ts`; jangan
   menambah pesan pembeda saat menambah fitur (lihat F3).

> Dokumen ini artefak review T5. Saat sebuah butir dikerjakan di tiket lanjutan,
> centang di sini atau catat pengecualiannya di prompt tiket yang bersangkutan
> agar jejak audit tetap utuh (pola yang sama dipakai dokumen review T0–T4).
