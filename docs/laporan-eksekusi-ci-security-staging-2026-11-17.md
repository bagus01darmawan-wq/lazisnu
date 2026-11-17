# Laporan Eksekusi Pemulihan CI, Security, dan Deploy Staging

**Tanggal eksekusi:** 17 November 2026
**Commit staging akhir:** `d4b6b905f12748cbc946733e75c9982d12b3a30b`
**Status:** CI dan Security hijau; deploy staging sukses pada percobaan kedua setelah kegagalan pull GHCR transien.

## 1. Kondisi awal yang terverifikasi

| Aspek | Bukti |
|---|---|
| Git | `HEAD` = `origin/staging` = `4937889` sebelum perubahan; tidak ada perbedaan. |
| CI | Run [44009728542](https://github.com/bagus01darmawan-wq/lazisnu/actions/runs/44009728542) gagal di `Prettier check (mobile)` pada 6 berkas. Job tes, build image dan deploy ter-skip. |
| Security | Run [44009728522](https://github.com/bagus01darmawan-wq/lazisnu/actions/runs/44009728522) gagal di `pnpm audit`: GHSA-mfr8-8qww-v76h (`next`), patch `>=16.4.5`. CodeQL sukses. |
| Staging | Health publik sehat, tetapi deploy terakhir yang sukses berasal dari `8661fca` (run [43873822910](https://github.com/bagus01darmawan-wq/lazisnu/actions/runs/43873822910)). `4937889` dan migrasi `0022`–`0024` belum terpasang. |
| Proteksi branch | `staging` **tidak punya** branch protection maupun ruleset. Pengguna memilih untuk tidak mengaktifkannya pada eksekusi ini. |
| Akses VM/DB | Tidak ada akses SSH read-only dari mesin eksekusi; verifikasi versi runtime dan isi schema langsung tidak dapat dilakukan. |

## 2. Pekerjaan yang diselesaikan

### 2.1 PR #200 — format mobile dan perbaikan tes

- Enam berkas diformat ulang dengan Prettier; diff murni format.
- `VisualStateAudit.test.tsx` diperbaiki:
  - inisialisasi MMKV sebelum render `HistoryScreen`;
  - mock `useAuthStore` diberi `getState`;
  - tes sukses menekan tombol "Konfirmasi & Simpan" sesuai modal baru.
- Alasan digabung: PR format saja merah pada `Test mobile`, PR tes saja merah pada Prettier; keduanya tidak bisa hijau terpisah.
- PR #202 (tes terpisah) ditutup karena isinya dipindahkan ke #200.
- Hasil: PR hijau, merge commit `f294dae`. Push staging untuk `f294dae` sukses dan **tidak** men-deploy (mobile-only).

### 2.2 PR #201 — dependency Next.js

- Advisory: GHSA-mfr8-8qww-v76h / CVE-2026-119790, moderate, terdampak `>=16.3.0 <=16.4.4`, patch `16.4.5`.
- Aplikasi tidak memakai `'use cache'` maupun `unstable_cache` (pencarian di `apps/web` nihil), tetapi tetap dipatch.
- `next` dinaikkan ke **`16.4.6`** (stabil terbaru saat eksekusi).
- `pnpm-lock.yaml` hanya berubah untuk `next` dan paket `@next/*`.
- `eslint-config-next` tidak diubah karena tidak ada bukti ketidakcocokan; lint tetap lolos.
- Entri `deepmerge` dihapus dari `security/audit-baseline.json` karena audit membuktikan advisory itu sudah tidak muncul.
- PR dependabot #199 (16.4.5, basis lama) ditutup/digantikan.
- Hasil: PR hijau; merge commit `d4b6b90`.

## 3. Bukti CI, Security, dan deploy

| Pemeriksaan | Hasil |
|---|---|
| CI PR #201 | `changes`, `Verify`, `Test backend`, `Test mobile`, `Test web`, `CI status` semuanya sukses. |
| Security PR #201 | CodeQL, Dependency review, `pnpm audit` sukses. |
| Security push `d4b6b90` | Run [44019823673](https://github.com/bagus01darmawan-wq/lazisnu/actions/runs/44019823673) **sukses**, termasuk `pnpm audit`. |
| CI push `d4b6b90` | Run [44019823823](https://github.com/bagus01darmawan-wq/lazisnu/actions/runs/44019823823) **sukses** setelah rerun job deploy. |
| Build image | Backend/web-prod/web-staging sukses. Backend digest `sha256:718369db7b5fbe92e14c0ecdde7bc3cf08e500fb8d9b73cf1ec90d7a28b31e25`. |
| Deploy staging | Gagal sekali pada `docker pull backend:latest` karena layer `35abb2489a9b` “not found” dari GHCR. Manifest dan blob diverifikasi ada (`HEAD blob 200`); ini kegagalan registry transien. Deploy berhenti **sebelum** migrasi dan `compose down`, sehingga staging tetap hidup di versi lama. |
| Rerun deploy | Sukses. Log menunjukkan `HEAD is now at d4b6b90`, backend digest `718369…`, web:latest `087348…`, web:staging `d1ba…`. |
| Migrasi | `migrate-cli.js` selesai sukses. `_journal.json` memuat `0022_correction_operation_id`, `0023_can_visit_operation_id`, `0024_collection_offline_payload_hash`. CLI menjalankan `migrate()` sehingga migrasi yang tertunda diterapkan sebelum container baru naik. |
| Health publik | `/health` → `status ok`; `/health/ready` → `ready`, DB `ok`, Redis `ok`; `/v1/auth/me` tanpa token → `401`; `https://staging.lazisnu.site` → `200`. |
| Probe autentikasi | Log deploy: `✅ Probe auth lolos — alur login/refresh sehat`. |

## 4. Batasan dan hal yang belum diverifikasi

1. **Isi schema DB tidak dibaca langsung.** Tidak ada akses read-only ke database staging. Bukti migrasi adalah keberhasilan `migrate()` dan journal yang memuat 0022–0024; kolom/index tidak diperiksa dengan `SELECT`/`information_schema`.
2. **Uji API dengan akun uji belum dilakukan.** Tidak ada kredensial akun uji yang diberikan; yang diverifikasi hanya health, readiness, dan penolakan 401.
3. **APK staging untuk `d4b6b90` tidak dibuat.** Job `Build Staging APK` ter-skip pada push ini karena tidak ada perubahan kode mobile. Artifact APK staging dari PR #200 (`8750cc6`) ada, tetapi tidak dipasang atau diuji di perangkat.
4. **Uji mutasi di HP/staging belum dilakukan.** Sesuai rencana, ini memerlukan persetujuan fixture dan akun/kaleng khusus; belum ada persetujuan.
5. **Replay transaksi lama tanpa `offline_payload_hash` belum dibuktikan aman.** Tidak ada desain/tes baru untuk kasus ini pada eksekusi ini; statusnya tetap belum selesai.
6. **Proteksi branch staging tetap tidak ada.** Pengguna memilih “biarkan apa adanya” pada eksekusi ini. Deploy berikutnya masih bisa berjalan tanpa menunggu Security selesai.
7. **Verifikasi versi container langsung tidak dilakukan.** Bukti versi berasal dari log deploy (SHA dan digest image), bukan dari inspeksi container/VM.

## 5. Tindak lanjut yang disarankan

- Aktifkan proteksi/ruleset `staging` bila ingin deploy otomatis benar-benar menunggu CI dan Security.
- Buat mekanisme agar job deploy menunggu hasil workflow Security, atau jalankan audit sebagai bagian workflow CI.
- Unduh artifact APK staging dan uji alur offline (Kosong, Dikembalikan, Isi, reconnect, konflik) pada fixture yang disetujui.
- Buat desain dan tes untuk replay transaksi lama tanpa `offline_payload_hash` sebelum menyatakan alur itu aman.
- Verifikasi isi schema staging secara read-only saat akses DB tersedia.

## 6. Referensi

- PR #200: https://github.com/bagus01darmawan-wq/lazisnu/pull/200
- PR #201: https://github.com/bagus01darmawan-wq/lazisnu/pull/201
- Run CI staging `d4b6b90`: https://github.com/bagus01darmawan-wq/lazisnu/actions/runs/44019823823
- Run Security staging `d4b6b90`: https://github.com/bagus01darmawan-wq/lazisnu/actions/runs/44019823673
- Advisory: https://github.com/advisories/GHSA-mfr8-8qww-v76h
