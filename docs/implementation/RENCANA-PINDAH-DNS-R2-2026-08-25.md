# Rencana: Pindah DNS lazisnu.site ke Cloudflare + Hosting APK di R2 (apk.lazisnu.site)

Tanggal: 2026-08-25
Status: MENUNGGU PERSETUJUAN
Keputusan user: opsi B — R2 dengan custom domain. Domain dibeli di Hostinger (TANPA paket hosting).

---

## 1. Latar Belakang

Distribusi APK via GitHub Releases berfungsi, tetapi membatasi opsi privatisasi repo (aset release repo privat tidak bisa diunduh publik). R2 + custom domain `apk.lazisnu.site` adalah hosting APK permanen: gratis (10 GB), cepat (CDN Cloudflare), tanpa biaya unduh.

Syarat R2 custom domain: zona `lazisnu.site` harus dikelola di Cloudflare → nameserver dipindah dari Hostinger. **Ini hanya memindahkan "buku alamat" DNS — semua hosting tetap di tempatnya.**

## 2. Inventarisasi DNS (hasil enumerasi publik 2026-08-25)

| Record | Tipe | Nilai | Tujuan |
|---|---|---|---|
| `lazisnu.site` | A | `2.57.91.91` | Parkir Hostinger (tidak terpakai) |
| `www.lazisnu.site` | CNAME | → `lazisnu.site` | Ikut apex |
| `api.lazisnu.site` | A | `43.128.98.52` | VM Tencent (prod API) |
| `dashboard.lazisnu.site` | A | `43.128.98.52` | VM Tencent (web) |
| `staging-api.lazisnu.site` | A | `43.128.98.52` | VM Tencent (staging) |
| MX | — | **tidak ada** | ✅ tanpa email |
| TXT | — | **tidak ada** | ✅ tanpa SPF/DKIM |

Total 4 record (www ikut apex) — migrasi berisiko rendah.

## 3. Fase Eksekusi

### Fase 1 — Persiapan (15 menit, bisa sekarang)
1. Konfirmasi akun Cloudflare sudah ada (R2 memakainya — harusnya sudah).
2. Di Cloudflare: **Add a site** → masukkan `lazisnu.site` → pilih **Free** → Cloudflare akan menampilkan daftar record yang terdeteksi → **samakan dengan tabel §2** (tambah yang kurang, hapus yang tidak dikenal).
3. Set semua record eksisting ke mode **DNS only** (awan abu-abu) — lalu lintas api/dashboard TETAP langsung ke VM, tidak lewat Cloudflare. (Mode oranye = CDN/proxy, bisa diaktifkan kapan pun nanti.)

### Fase 2 — Pindah nameserver (15 menit, pilih jam sepi)
1. Di Cloudflare (Add site selesai): salin 2 nameserver yang diberikan (ns1.cloudflare.com / ns2...).
2. Di Hostinger hPanel → **Domains** → `lazisnu.site` → **Nameservers** → ganti dengan 2 NS Cloudflare → simpan.
3. Tunggu propagasi (umumnya <1 jam; maks 24 jam). Status "Active" di Cloudflare = selesai.
4. **Rollback bila ada masalah:** kembalikan NS ke `hyperion.dns-parking.com` + `atlas.dns-parking.com` (5 menit, propagasi balik).

### Fase 3 — R2 custom domain (30 menit, setelah zona aktif)
1. Pastikan bucket `lazisnu-apk` ada (lokasi Asia Pacific/Singapore).
2. Bucket → **Settings** → **Custom Domains** → connect `apk.lazisnu.site` → Cloudflare otomatis membuat CNAME + verifikasi (karena zona sudah di Cloudflare).
3. Unggah `lazisnu-1.1.1.apk` (API token R2 yang kamu buat → saya unggah; atau drag-drop dashboard).
4. Uji: `curl https://apk.lazisnu.site/lazisnu-1.1.1.apk` → 200.

### Fase 4 — Cutover (menyusul, satu paket dengan rilis v1.1.2)
1. `mobileRelease.json`: `apkUrl` → `https://apk.lazisnu.site/lazisnu-1.1.2.apk`.
2. Build EAS v1.1.2 (isi: editan user + fix kecil + apk baru) → unggah R2.
3. Commit + tag → deploy prod (dispatch `--ref`).
4. Opsional setelah stabil: **privatisasi repo** + pasang token deploy read-only di VM (tanpa itu, `git fetch` di VM akan gagal saat repo privat).

## 4. Risiko & Jaring Pengaman

| Risiko | Mitigasi |
|---|---|
| Record terlewat → api/dashboard putus | Tabel §2 lengkap + verifikasi ulang sebelum pindah NS; DNS-only (bukan proxy) agar arah lalu lintas identik |
| Propagasi DNS lambat | Tidak ada downtime keras: NS lama tetap melayani sampai propagasi; catatan DNS identik di kedua sisi |
| Kesalahan fatal | Rollback nameserver ke Hostinger (5 menit) |
| Email | Tidak ada (MX kosong) — tidak berisiko |

## 5. Yang TIDAK berubah

- Hosting tetap di VM Tencent (`43.128.98.52`) — api/dashboard/staging tidak pindah.
- Registrasi domain tetap di Hostinger (hanya nameserver yang diganti; bisa pindah balik kapan pun).
- CI/CD, EAS, deploy biru-hijau: tidak tersentuh.

## 6. Catatan

- Waktu propagasi bisa dimanfaatkan untuk: daftar editan aplikasi dari user + fix kecil CI (dependabot dll).
- Token R2 (Access Key ID/Secret) disimpan di `D:\bukti-builder\` — tidak pernah masuk repo/KB.
