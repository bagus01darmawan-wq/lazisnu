# Rencana Penambalan `ip-address` (GHSA-rxp7-6hxx-x8q5)

Tanggal: 30 Oktober 2026
Repo: `bagus01darmawan-wq/lazisnu`
Status: **rencana — belum ada berkas yang diubah**
Cakupan: `pnpm-lock.yaml` + `security/audit-baseline.json`

---

## Kesimpulan singkat

Cacatnya **nyata**, tetapi di aplikasi ini **tidak bisa dijangkau**. Tetap saya sarankan
ditambal, karena biayanya nyaris nol dan hasilnya menghapus satu alert MEDIUM yang akan terus
muncul di tab Security.

> Analogi: ini seperti menemukan kunci duplikat untuk pintu gudang yang **sudah tidak dipakai**
> lagi. Maling tidak bisa masuk lewat situ, karena pintunya sudah diganti. Tapi membuang kunci
> duplikatnya tetap lebih rapi daripada menyimpannya di laci.

---

## 1. Cacatnya apa

| Item | Nilai |
|---|---|
| Advisory | GHSA-rxp7-6hxx-x8q5 |
| Tingkat | MEDIUM |
| Jenis | CWE-1333 — Regular Expression Denial of Service |
| Rentan | `ip-address` **<= 10.7.3** |
| Tertambal | **10.7.4** |

Cara kerjanya: `new Address6()` dan `Address6.isValid()` membuang "zona" (bagian setelah `%`)
memakai pola `/%.*$/` **sebelum** batas panjang 45 karakter diperiksa. String berisi banyak `%`
diikuti baris baru membuat pola itu dicoba ulang dari setiap `%`, masing-masing memindai sampai
akhir baris sebelum gagal — waktu pemrosesan tumbuh **kuadratik**:

| Panjang input | Waktu yang dihabiskan |
|---|---|
| 10.000 karakter | 41 ms |
| 40.000 karakter | 632 ms |
| 100.000 karakter | 3,9 detik |

Satu permintaan bisa menahan proses Node selama itu. Input tetap ditolak dengan error yang
benar — yang jadi cacat adalah **biaya untuk sampai ke penolakan itu**.

Bentuk yang **tidak** berbahaya: string yang sama **tanpa** baris baru — ditolak di bawah 1 ms.

---

## 2. Jalur masuknya di proyek ini

Hanya satu: **`@fastify/rate-limit@11.2.0`** — pembatas jumlah permintaan.

| Berkas | Baris | Isi |
|---|---|---|
| `apps/backend/src/app.ts` | 91 | `await server.register(rateLimit, { max: 100, timeWindow: '1 minute', ... })` |
| `@fastify/rate-limit` `index.js` | 58 | `defaultKeyGenerator = (req, ipv6Subnet) => normalizeIP(req.ip, ipv6Subnet)` |
| `@fastify/rate-limit` `index.js` | 32-48 | `normalizeIP()` — memanggil `new Address6(ip)` |

Tidak ada paket lain yang memakai `ip-address` (hanya satu instance di lockfile, baris 5718).

---

## 3. Kenapa tidak bisa dijangkau — dua pagar, keduanya diuji

### Pagar 1 — kode rentan hanya dipanggil setelah validasi

`normalizeIP()` memanggil `new Address6(ip)` **hanya jika** `net.isIPv6(ip)` bernilai benar.
`net.isIPv6` adalah fungsi bawaan Node (`node:net`), bukan bagian paket yang rentan.

Diuji langsung di Node 22 (versi yang dipakai CI):

| Input | `net.isIPv6()` | Artinya |
|---|---|---|
| `'%'` × 100.000 + baris baru | **false** | ditolak sebelum `Address6` |
| `'::1%'` + `'%'` × 1000 + baris baru | **false** | ditolak sebelum `Address6` |
| `'::1%'` + `'%'` × 1000 (tanpa baris baru) | **false** | ditolak sebelum `Address6` |
| `fe80::1%eth0` (zona normal) | true | lolos, tapi bukan bentuk kuadratik |
| `'::1%'` + `'a'` × 1000 (tanpa baris baru) | true | lolos, tapi bukan bentuk kuadratik |

Bentuk yang memicu kemacetan **selalu mengandung baris baru**, dan setiap bentuk berbaris baru
ditolak oleh `net.isIPv6`. Jadi kode rentan tidak pernah menerima input berbahaya.

### Pagar 2 — alamat IP tidak bisa dikarang pengirim

`req.ip` diambil Fastify dari alamat koneksi, **kecuali** `trustProxy` diaktifkan.
Di `apps/backend/src/app.ts:30` server dibuat dengan `Fastify({ logger: {...} })` — **tanpa**
`trustProxy`, dan kata `trustProxy` tidak muncul di mana pun dalam repo. Artinya header
`X-Forwarded-For` yang dikirim klien **diabaikan** untuk keperluan `req.ip`.

### Kesimpulan risiko

Untuk aplikasi ini hari ini: **tidak dapat dijangkau**. Bukan "kecil" — jalurnya tidak tersambung.

---

## 4. Lalu kenapa tetap ditambal

1. **Murah dan tanpa risiko.** 10.7.3 → 10.7.5 adalah tambalan versi: tetap CommonJS, tanpa
   dependensi, `engines: node >= 12`. Tidak ada satu baris kode aplikasi yang berubah.
2. **Menutup dua hal sekaligus.** Alert MEDIUM hilang dari tab Security, dan Dependabot #221
   menutup sendiri setelah perbaikan masuk (pola yang sama terjadi pada `re2js`, 29 Okt 2026).
3. **Menghapus jebakan laten.** Kedua pagar di atas bergantung pada **cara pemanggilan** paket
   ini. Kalau nanti ada fitur baru yang memvalidasi alamat IP kiriman pengguna langsung lewat
   `Address6.isValid()`, pagar itu tidak ikut terbawa — dan cacatnya hidup lagi.

---

## 5. Perubahan yang direncanakan

### 5.1 `pnpm-lock.yaml` — tiga titik

| Baris | Sebelum | Sesudah |
|---|---|---|
| 5718-5720 | `ip-address@10.7.3:` + integrity `sha512-A1kdq/…` + `engines: {node: '>= 12'}` | `ip-address@10.7.5:` + integrity baru + `engines: {node: '>= 12'}` |
| 9999 | `ip-address: 10.7.3` (di dalam snapshot `@fastify/rate-limit@11.2.0`) | `ip-address: 10.7.5` |
| 14950 | `ip-address@10.7.3: {}` | `ip-address@10.7.5: {}` |

Integrity 10.7.5 (dari registry npm, bukan tebakan):

```
sha512-t2v0rkILYv9WXmSL7TpAaU3HXgaFYOPUcH3QHgwQ++gpJuH3bqyMy4Fvt/DJCTKwzH3Cf+bAp5W/mFL39KPLzA==
```

Alasan versi ini sah:

- Induknya, `@fastify/rate-limit@11.2.0`, memakai rentang `^10.2.0` → 10.7.5 **sudah diizinkan**,
  `package.json` tidak perlu disentuh.
- `dist/ipv6.js` versi 10.7.4 dan 10.7.5 **identik** (0 baris berbeda) — 10.7.5 sekadar versi
  terbaru pada jalur 10.x.
- Paket tanpa dependensi → penggantian tidak menarik paket lain.

### 5.2 `security/audit-baseline.json` — hapus satu entri

Entri `GHSA-rxp7-6hxx-x8q5` (`ip-address`) **dihapus**, karena setelah naik versi advisory itu
tidak lagi muncul. Kalau dibiarkan, ia menjadi entri usang dan langkah *self-heal* di
`security.yml` akan menulis ulang basis lalu membuat commit otomatis — bising tanpa manfaat.

`updatedAt` diperbarui.

---

## 6. Verifikasi (semua tanpa build di PC lokal)

| Langkah | Perintah | Hasil yang diharapkan |
|---|---|---|
| 1 | `pnpm install --lockfile-only` | lockfile **tidak ditulis ulang** (hash `sha256` sama) → resolusi sah |
| 2 | `pnpm audit --json` | turun jadi **3** temuan; `ip-address` hilang |
| 3 | `node scripts/audit-baseline.mjs --input <hasil audit>` | **exit 0**, tanpa bagian "BASIS USANG" |
| 4 | `node scripts/audit-baseline.mjs --update --input <hasil audit>` | "Set advisory tidak berubah" → self-heal tidak akan menulis ulang |
| 5 | GitHub Actions | Security hijau; job `Verify` lolos = hash integrity benar-benar diterima saat unduh |

Langkah 5 adalah satu-satunya yang membuktikan unduhan sungguhan. Langkah 1-4 hanya membuktikan
resolusi dan isi basis.

---

## 7. Risiko dan efek samping

- **Deploy staging ikut berjalan.** `pnpm-lock.yaml` cocok dengan filter `backend`, `web`, dan
  `mobile` (`ci.yml:128-141`), jadi push akan memicu Docker build + `Deploy staging`
  (`ci.yml:793`). Produksi tidak tersentuh (butuh `main`). Ini akan menjadi deploy staging
  **ketiga** pada 30 Oktober.
- **Tidak ada perubahan perilaku aplikasi.** Versi tambalan, tanpa dependensi, tanpa perubahan API.
- **APK tidak berubah** secara fungsional; job APK hanya dibangun ulang.

---

## 8. Rollback

`git revert <commit>` lalu push. Lockfile kembali ke 10.7.3 dan entri basis pulih. Tidak ada
migrasi data, tidak ada state yang tertinggal.

---

## 9. Yang **tidak** dikerjakan dalam rencana ini

- Tidak menyentuh `trustProxy` (lihat dokumen terpisah).
- Tidak menaikkan paket lain — hanya `ip-address`.
- Tidak mengubah entri basis selain `GHSA-rxp7-6hxx-x8q5`.
- Tidak menyentuh kode aplikasi mana pun.

---

## 10. Daftar periksa eksekusi

- [ ] Sunting 3 titik di `pnpm-lock.yaml` (kunci, referensi snapshot, snapshot)
- [ ] Hapus entri `GHSA-rxp7-6hxx-x8q5` dari `security/audit-baseline.json`, perbarui `updatedAt`
- [ ] `pnpm install --lockfile-only` → hash lockfile tidak berubah
- [ ] `pnpm audit --json` → 3 temuan
- [ ] Gerbang `--input` → exit 0
- [ ] Commit dengan pesan yang menyebut GHSA dan alasan penerimaan risiko
- [ ] Push ke `staging`
- [ ] Pantau Security (job `pnpm audit`) dan CI (`Verify` + tes) sampai hijau
- [ ] Pastikan Dependabot #221 menutup sendiri
