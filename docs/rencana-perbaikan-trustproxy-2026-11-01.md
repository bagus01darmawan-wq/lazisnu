# Rencana Perbaikan: `trustProxy` dan Catatan Audit IP

Tanggal: 1 November 2026
Repo: `bagus01darmawan-wq/lazisnu`
Status: **Tahap 1–3 terpasang di staging (2–3 November 2026), semuanya terverifikasi** —
Tahap 1: PR #170; Tahap 2: PR #171 (verifikasi manual 3 probe + kuota lulus, lihat di bawah);
alarm P1: PR #174; D4 pool 20: PR #176; Tahap 3 (200/menit per IP + pemutus 3.000/menit): PR #177.
PR #172 menutup gerbang `pnpm audit`. Yang belum: **promosi ke produksi** (staging → main,
blue-green) + pantau 429 dan isi `ip_address` selama 24 jam; ukur ulang batas setelah 2–4 minggu.
Dasar: `docs/rencana-penyelidikan-trustproxy-2026-10-30.md` (revisi 4). Semua temuan di bawah sudah
**terbukti lewat uji**, bukan dugaan — rujukan E1–E8 di dokumen itu.
Revisi: **3** (2 Nov 2026) — pelaksanaan Tahap 1–2 selesai di staging; catatan: urutan terealisasi
terbalik dari D2 (Tahap 2 mendarat 1 Nov lewat PR #171, Tahap 1 menyusul 2 Nov lewat PR #170) —
tanpa kerugian, karena setelah `trustProxy` aktif nilai yang masuk selalu satu alamat ≤45 karakter,
sehingga pemotongan Tahap 1 kini murni jaring pengaman. Revisi 2 (1 Nov): keputusan D1–D3 dicatat
sebagai disetujui; angka batas dan beban VM dimasukkan dari hasil ukur, bukan taksiran.

---

## Masalahnya dalam satu paragraf

Backend tidak bisa membedakan satu pengguna dari pengguna lain, karena semua permintaan masuk lewat
container nginx dan `trustProxy` dimatikan. Akibatnya: (a) jatah 100 permintaan/menit dihitung untuk
**seluruh sistem**, bukan per pengguna; (b) 16 tempat menulis alamat nginx ke catatan audit, bukan
alamat pengguna; (c) 13 tempat membaca header `X-Forwarded-For` mentah sehingga alamat bisa
dikarang; (d) header karangan yang panjang membuat **seluruh baris audit gagal disimpan** dan hilang
tanpa jejak.

---

## Keputusan yang sudah disetujui (1 Nov 2026)

| Kode | Keputusan | Nilai yang disetujui |
|---|---|---|
| **D1** | Dasar `trustProxy` | CIDR **`172.18.0.0/16`** — **bukan** `trustProxy: 1` |
| **D2** | Urutan kerja | Potongan 45 karakter **dijalankan lebih dulu**, sebagai tahap terpisah dari `trustProxy` |
| **D3** | Batas permintaan | **200/menit per IP** + pemutus arus sistem **3.000/menit** |
| **D4** | Pool koneksi Supabase | Naikkan `max` dari 10 → **20** (`config/database.ts:16`). Pemutus arus tetap 3.000/menit — tidak diturunkan |
| **P1** | Prasyarat (bukan keputusan) | Dua alarm wajib aktif **sebelum** D3 berlaku: CPU > 70% dan latensi p95 > 500 ms, masing-masing selama 5 menit |

Ketiganya disetujui Pion pada 1 November 2026. Pelaksanaan Tahap 1–2 selesai 2 November 2026
(PR #170 + #171, deploy staging sukses). Yang **belum** terjadi: alarm P1, D4, Tahap 3.

Dua tahap di bawah menutup D1 dan D2. **D3 dikerjakan sebagai tahap 3**, setelah keduanya terpasang
dan terverifikasi di staging — bukan bersamaan, supaya kalau ada masalah, penyebabnya tunggal.

| Tahap | Isi | Kenapa dipisah |
|---|---|---|
| **1** | Potong `ipAddress` jadi maksimal 45 karakter | Berdiri sendiri, risiko mendekati nol, menutup kebocoran jejak audit (K2) tanpa menunggu keputusan lain |
| **2** | `trustProxy` = CIDR jaringan Docker **+** hapus 13 pembacaan header mentah, **satu commit** | Kalau header mentah dihapus tanpa `trustProxy`, **semua** catatan audit berubah jadi alamat nginx — lebih buruk dari sekarang. Keduanya harus mendarat bersamaan |
| **3** | Batas 200/menit per IP + pemutus arus 3.000/menit, **setelah P1 aktif** | Menaikkan batas tanpa alarm = melepas pagar tanpa lampu. Angka 3.000 juga belum pernah diuji beban nyatanya |

---

## Fakta pendukung (diukur 1 Nov 2026, bukan dikira)

| Hal | Nilai | Sumber |
|---|---|---|
| Subnet jaringan Docker | `172.18.0.0/16` | `docker network inspect lazisnu_default` di VM |
| IP container | nginx `.4`, backend staging `.11`, blue-backend `.12`, blue-web `.13` | `docker inspect` |
| Titik baca header mentah | **13** — `auth.ts` 9, `audit-logger.ts` 3, `bendahara.ts` 1 | `grep x-forwarded-for` |
| Titik `request.ip` polos | **16** | `grep '\.ip\b'` di luar berkas uji |
| Lebar kolom `ip_address` | `varchar(45)` | `database/schema.ts:293`, `:642` |
| Batas global | 100 permintaan / 1 menit, kunci `req.ip` | `app.ts:91-103` |

Catatan penting: `blue-web` (`.13`) **berada di subnet yang sama** dengan nginx. Artinya CIDR ini
mempercayai container web juga. Itu dapat diterima **hanya karena** web tidak pernah meneruskan
header `X-Forwarded-For` (sudah diperiksa: nol kemunculan di `apps/web/src`). Syarat ini harus
tertulis, bukan diingat.

---

## Perubahan rinci

### Tahap 1 — `apps/backend/src/services/auditLogService.ts`

```ts
// Jaga kolom varchar(45). Sengaja TIDAK memilih entri mana pun dari daftar:
// memilih entri pertama berarti memilih nilai yang bisa dikarang klien.
ipAddress: String(input.ipAddress ?? '').slice(0, 45),
```

Mengapa memotong, bukan memilih: setelah Tahap 2 nilai yang masuk selalu satu alamat (≤45 karakter),
jadi pemotongan ini murni jaring pengaman. Kalau di sini kita "memilih entri pertama", kita justru
mengabadikan nilai karangan klien sebagai kebenaran.

**Efek:** satu-satunya perubahan perilaku adalah baris audit yang sebelumnya **gagal** kini **tersimpan**
(dengan alamat terpotong). Tidak ada baris yang hilang, tidak ada skema berubah.

### Tahap 2a — `apps/backend/src/app.ts`

```ts
const server = Fastify({
  trustProxy: '172.18.0.0/16',   // hanya jaringan Docker internal
  logger: { /* tidak berubah */ },
});
```

**Mengapa CIDR dan bukan `trustProxy: 1`:** produksi berjalan lewat `docker-compose.blue-green.yml`
yang mempublikasikan backend ke `127.0.0.1:${BACKEND_PORT}` (baris 21-22). Dengan `1`, siapa pun
yang bisa menjangkau `localhost:3001` di VM ikut dipercaya. Dengan CIDR, koneksi dari host **tidak**
dipercaya, sehingga `req.ip` untuk koneksi itu tetap `127.0.0.1` — tidak bisa dipalsukan.

**Mengapa CIDR dan bukan IP nginx tunggal (`172.18.0.4/32`):** alamat container diberikan Docker
secara dinamis. Kalau nginx dibuat ulang dan kebetulan mendapat alamat lain, `/32` akan berhenti
bekerja tanpa suara. `/16` tahan terhadap perubahan itu.

**Sifat gagal-aman:** bila CIDR salah atau nginx pindah jaringan, `req.ip` kembali menjadi alamat
nginx — yaitu **perilaku hari ini**. Perbaikan yang gagal tidak membuat keadaan lebih buruk.

### Tahap 2b — ganti 13 pembacaan header mentah

Pola lama di tiga berkas:

```ts
ipAddress: (request.headers['x-forwarded-for'] as string) || request.ip,
```

Pola baru:

```ts
ipAddress: request.ip,
```

Berkas: `routes/auth.ts` (9 titik: baris 130, 164, 187, 238, 387, 464, 675, 845, 908),
`middleware/audit-logger.ts` (3 titik: 26, 43, 78), `routes/bendahara.ts` (1 titik: 153).

`middleware/audit-logger.ts` **wajib** ikut: ia hook `onResponse` global yang menangkap semua mutasi
dan setiap 401/403 — cakupannya paling luas dari seluruh daftar.

---

## Uji yang harus lulus sebelum dianggap selesai

### Otomatis (CI, bukan di PC ini)

| Uji | Berkas | Yang diperiksa |
|---|---|---|
| Pemotongan | `services/__tests__/auditLogService.test.ts` | `ipAddress` 100 karakter → tersimpan 45 |
| Sumber alamat | `middleware/__tests__/audit-logger.test.ts` | header `x-forwarded-for: 1.2.3.4` ada, `request.ip` = `9.9.9.9` → yang dipakai `9.9.9.9` |

### Manual di staging (setelah CI hijau & deploy staging)

Tiga probe yang sama seperti uji 30 Okt, dengan hasil yang **berbeda**:

| Probe | Sebelum perbaikan (30 Okt) | Sesudah perbaikan (diharapkan) |
|---|---|---|
| Login gagal tanpa header | `114.10.4.212` | `114.10.4.212` (tetap benar) |
| Login gagal + `X-Forwarded-For: 1.2.3.4` | `1.2.3.4, 114.10.4.212` | **`114.10.4.212`** — karangan diabaikan |
| Login gagal + XFF 56 karakter | **baris hilang** | **baris ada**, alamat benar |

Dan satu pemeriksaan kuota: dua perangkat dengan IP publik berbeda harus melihat sisa kuota yang
**bergerak terpisah** (sebelumnya bergerak bersama).

### Hasil verifikasi manual — 2 Nov 2026, semua lulus

Dua sumber: VM (`168.110.198.70`, egress publik) dan PC (`114.10.11.29`), masing-masing 3×
`POST /v1/auth/login` kredensial salah ke `staging-api.lazisnu.site`. Hasilnya **identik di kedua
sumber**:

| Probe | Hasil terukur | Sesuai harapan |
|---|---|---|
| Tanpa header | satu alamat bersih milik sumber (`len` 12/14) | ✓ |
| `X-Forwarded-For: 1.2.3.4` | karangan **diabaikan** — tersimpan alamat sumber | ✓ |
| XFF 58 karakter | baris **ada** (30 Okt: hilang total), alamat sumber | ✓ |

Setiap probe meninggalkan dua baris — `FAILED_LOGIN` (rute) + `AUTH_FAILED` (middleware) — jadi
kedua jalur penulis sama-sama benar memakai `request.ip`.

Kuota: kedua sumber masing-masing melihat `x-ratelimit-remaining` turun 99 → 98 dari **ember
sendiri** (dulu satu ember bersama, E2). Kuota kini per alamat IP, sesuai desain.

---

## Risiko dan mitigasinya

| Risiko | Besar | Mitigasi |
|---|---|---|
| CIDR salah → perbaikan tidak berefek | Sedang | Sifat gagal-aman: kembali ke perilaku sekarang. Verifikasi manual di staging membuktikannya sebelum produksi |
| Beban total server naik (karena kuota jadi per pengguna) | **Nyata** | Batas 100/menit tidak diubah di tahap 1–2. Untuk tahap 3: CPU aman (20% dari 4 inti), tetapi **database Supabase** hanya punya headroom 1,2× pada pool 10 — naikkan pool ke 20 atau turunkan cap ke 2.000/menit lebih dulu |
| Container `web` ikut dipercaya | Rendah | Syarat tertulis: web tidak boleh meneruskan XFF mentah. Saat ini nol kemunculan di `apps/web/src` |
| Catatan audit lama berformat `<karangan>, <IP asli>` | Rendah | Baris lama tidak diubah. Pembaca yang mengambil elemen pertama akan membaca nilai palsu — catat di SOP bahwa baris sebelum 1 Nov 2026 tidak bisa dipakai sebagai bukti tunggal |
| Container `web` tetap tercatat sebagai alamatnya sendiri | Rendah | Diketahui dan diterima. Meneruskan IP pengguna dari SSR adalah perubahan terpisah (butuh aturan sanitasi) |

---

## Rollback

Dua commit terpisah, jadi rollback bisa bertahap:

- **Batalkan Tahap 2** → `trustProxy` hilang, `request.ip` kembali jadi alamat nginx. **Jangan
  dibalik setengah**: mengembalikan `trustProxy` tetapi membiarkan 13 titik memakai `request.ip`
  akan membuat semua catatan audit berisi alamat nginx. Batalkan keduanya sekaligus.
- **Batalkan Tahap 1** → baris audit panjang kembali gagal tersimpan. Tidak disarankan.
- Tidak ada migrasi data, tidak ada perubahan skema. Deploy ulang lewat blue-green seperti biasa.

---

## Yang sengaja **belum** dikerjakan

1. **Batas 100/menit.** Sudah **diputuskan** (D3): 200/menit per IP + pemutus arus sistem
   3.000/menit. Tetap **bukan** bagian dari tahap 1–2 — dikerjakan sebagai **tahap 3**, dan baru
   boleh berlaku setelah dua alarm di P1 terpasang.
2. **Kuota jalur SSR web.** Semua permintaan dashboard dari container `web` masih berbagi satu ember
   100/menit. Ini masalah terpisah yang tidak hilang dengan `trustProxy`.
3. **Store Redis untuk rate-limit.** Sekarang hitungan in-memory: hilang saat deploy dan tidak
   dibagi antar warna biru/hijau. Perubahan tersendiri.
4. **Membersihkan 2 baris audit uji** di staging dari 30 Okt. Sengaja dibiarkan sebagai bukti.

### Cara mengukur ulang (sudah dijalankan sekali, 1 Nov 2026)

Dari VM, hitung puncak permintaan per menit pada jam sibuk dari log nginx — hanya membaca:

```bash
docker logs lazisnu-nginx-1 --since 24h 2>&1 \
  | awk '{print $4}' | cut -c2-17 | sort | uniq -c | sort -rn | head -5
```

Angka tertinggi itu yang menjadi dasar menetapkan batas baru. Tanpa angka ini, menaikkan batas
hanya menebak.

---

## Dasar angka untuk batas baru (diukur 1 Nov 2026)

Pengukuran sudah dilakukan. Sumber: log nginx `lazisnu-nginx-1` (23 Okt–1 Nov, 97.528 baris) dan
Prometheus. Semua hanya membaca.

| Ukuran | Angka | Cara baca |
|---|---|---|
| Permintaan API total, 9 hari (tanpa probe VM) | 3.356 | ~373/hari — pemakaian masih kecil |
| Respons `429` selama 9 hari | **0** | Bug ini **belum pernah menggigit**; puncak total belum melewati 100/menit |
| Puncak total per menit | 58 (27 Okt 18:27) | Sisa ruang terhadap batas 100 hanya ~40% |
| Per IP per menit — median / p90 / p95 / p99 / maks | 6 / 19 / 24 / 48 / **58** | Inilah angka "satu pengguna sibuk" |
| Puncak beban backend (Prometheus, 9 hari) | ~11 permintaan/detik ≈ 660/menit | Termasuk permintaan SSR web |
| Latensi p95 backend (30 menit terakhir) | 143 ms | Pada beban hampir kosong |
| Pengguna berbeda per IP (audit `LOGIN_SUCCESS`, 10 hari) | **1 pengguna** di IP tersibuk (`114.10.120.178`) | 39 login dari 4 IP. Jadi 58/menit itu **satu orang**, bukan gerombolan |

### Patokan yang dipakai (bukan angka bulat)

1. **Batas bawah** = puncak sah per IP yang pernah terukur × 3. Yaitu 58 × 3 ≈ 175.
   Faktor 3 memberi ruang untuk jam ramai yang belum pernah terjadi, tanpa perlu menyetel ulang
   dalam sebulan.
2. **Batas atas** = jangan sampai satu IP sendiri bisa membebani server seperti beban puncak
   seluruh sistem. Backend pernah menangani ~660/menit; satu IP sebaiknya tidak melewati ~30% dari
   itu.
3. **Angka yang disetujui (D3): 200 permintaan/menit per IP.** Berada di antara dua patokan itu.
   Batas login tetap 5/menit (penghitungnya terpisah, sudah dibuktikan).
4. **Ukur ulang setelah 2–4 minggu pemakaian nyata.** Kalau p99 per IP sudah mendekati 100/menit,
   naikkan ke 300. Kalau tetap di bawah 30/menit, 200 sudah berlebih dan boleh diturunkan.

### Satu peringatan yang harus dibaca sebelum memilih angka

Kunci rate-limit adalah **alamat IP**, dan secara prinsip **satu IP belum tentu satu orang** — petugas
di lapangan bisa berbagi IP operator (NAT).

**Tetapi data hari ini tidak menunjukkan itu.** Dari audit `LOGIN_SUCCESS` 10 hari terakhir: 39 login
dari 4 IP, dan IP tersibuk (`114.10.120.178`, yang mencatat 58 permintaan/menit) hanya milik
**1 pengguna**. Jadi untuk data yang ada sekarang, "per IP" ≈ "per orang".

Kesimpulannya: risiko NAT itu **laten, belum terbukti**. Angka 200/menit aman dibaca sebagai
"per orang" untuk kondisi hari ini, tetapi harus diukur ulang kalau jumlah petugas bertambah —
karena kalau kelak lima petugas berbagi satu menara, mereka akan berbagi 200/menit itu.

### Jaring pengaman yang menyertainya (bagian dari D3)

Batas per IP saja tidak membatasi jumlah total. Tetapi angka pemutus arusnya **tidak boleh dikarang**.
Hitung dari data: satu pengguna bisa 58/menit dalam satu sinkronisasi besar. Kalau 50 petugas
menyinkron bersamaan pada jam yang sama (pagi, setelah pengajian), bebannya ≈ **2.900/menit**.

Karena itu pemutus arus disarankan **3.000/menit untuk seluruh sistem** — cukup tinggi sehingga
skenario di atas tidak terpotong, cukup rendah untuk mencegah server tumbang. Angka 1.500 yang
sempat saya usulkan **terlalu rendah**: 26 sinkronisasi bersamaan saja sudah menyentuhnya, dan itu
bukan skenario mustahil.

Catatan kejujuran: 3.000/menit (50 permintaan/detik) belum pernah diuji di server ini. Beban puncak
yang pernah terbukti hanya ~660/menit. Jadi pemutus arus ini murni jaring pengaman, bukan angka
kapasitas yang terukur — dan harus diperiksa lagi setelah pemakaian nyata bertambah.

### Berapa besar bebannya ke VM (diukur 1 Nov 2026)

Kapasitas mesin: **4 inti CPU, RAM 7,9 GB** (6,1 GB tersedia), load average 0,02.

| Kondisi | CPU backend | RAM backend | nginx |
|---|---|---|---|
| Sekarang (~0,1 permintaan/detik) | 0,12–0,20% (≈0,002 inti) | 78 MB | 0% |
| Perkiraan bila batas 3.000/menit terpakai penuh (50/detik) | **≈0,8 inti (20% dari 4 inti)** | hampir tidak berubah | ≈0% |

Cara menghitungnya: rasio terukur 0,00159 inti ÷ 0,1018 permintaan/detik ≈ **15,6 ms CPU per
permintaan**. Dikalikan 50/detik ≈ 0,78 inti. Angka ini **batas atas** — diukur saat mesin hampir
kosong, sehingga overhead tetap (health check, scrape metrik) ikut terhitung.

**Yang paling penting:** perubahan ini **tidak menambah beban hari ini**. Lalu lintas sekarang
5–60 permintaan/menit, jauh di bawah batas lama 100. Yang berubah hanyalah pengguna tidak lagi
saling mengunci. Beban 3.000/menit hanya terjadi kalau ada yang benar-benar memakainya — dan kalau
itu terjadi, CPU masih di bawah seperempat kapasitas.

Alasannya bukan sekadar "lalu lintas kecil", tetapi **batas lama belum pernah mengikat**: dalam 9
hari ada **0 respons 429**, artinya tidak ada permintaan yang selama ini tertahan. Menaikkan batas
tidak melepaskan lalu lintas tersembunyi, karena memang tidak ada yang tertahan. Batas itu pagar,
bukan mesin — menaikkan pagar tidak menambah kendaraan.

Sebagai gambaran skala: langit-langit 3.000/menit = 4,32 juta permintaan/hari, sedangkan pemakaian
nyata sekarang ~373/hari. Batas itu sekitar **11.000 kali** pemakaian hari ini.

**Database: Supabase (diukur 1 Nov 2026).** Sebelumnya saya menulis "tidak bisa diukur". Itu keliru —
databasenya Supabase, dan berikut angka nyatanya:

| Hal | Nilai | Sumber |
|---|---|---|
| Host | `aws-1-ap-northeast-2.pooler.supabase.com` — region **Seoul** | `new URL(DATABASE_URL).hostname` |
| Port | **6543** = Supavisor, **transaction mode** | idem |
| Latensi `SELECT 1` dari VM | **median 82 ms** (min 82, maks 646) | 10 kali pengukuran |
| Ukuran pool aplikasi | **`max: 10`** koneksi | `config/database.ts:15-20` |
| `max_connections` Supabase | 60 (menurut catatan di kode) | komentar `database.ts:13-14` |

**Hitung throughput maksimum** (hukum Little: konkurensi ÷ latensi):

| Kueri per permintaan | Batas alami dengan pool 10 | Status terhadap 3.000/menit (50/detik) |
|---|---|---|
| 1 kueri | 10 ÷ 0,082 s ≈ **122/detik** | aman, 2,4× headroom |
| 2 kueri | ≈ **61/detik** | **mepet** — hanya 1,2× headroom |
| 3 kueri | ≈ **41/detik** | **tidak cukup** — di bawah 50/detik |

**Koreksi penting:** klaim saya sebelumnya "aman dengan margin besar" benar untuk **CPU**, tetapi
**tidak** untuk database. Dengan latensi 82 ms dan pool 10, batas 3.000/menit berada tepat di tepi
kapasitas database kalau satu permintaan rata-rata memakai 2 kueri atau lebih. Antrean akan muncul
sebelum 429 muncul — gejalanya latensi naik, bukan penolakan.

**Dua jalan keluar, keduanya murah:**
1. Naikkan `max` pool dari 10 → 20–25 (`database.ts:16`). Karena aplikasi terhubung ke **Supavisor**
   (port 6543, transaction mode), koneksi klien itu di-multiplex di sisi server — biayanya kecil.
   Dengan pool 20: 3 kueri/permintaan ≈ 81/detik, cukup lega.
2. Turunkan pemutus arus sistem dari 3.000 → **2.000/menit**, sehingga tetap di dalam kapasitas
   pool 10 meski 3 kueri per permintaan.

### Batas Supabase yang sebenarnya (dari dokumentasi resmi, 1 Nov 2026)

Dicek langsung ke dokumentasi Supabase — bukan dari ingatan. Untuk compute **Nano (paket gratis)**:

| Batas | Nano (gratis) | Artinya bagi kita |
|---|---|---|
| Connection Pooler Max Clients | **200** | Naik 10 → 20 memakai **10%** dari batas. Aman |
| Database Max Connections | 60 | Dipakai bersama Auth, Storage, PostgREST, health checker |
| Default Pool Size (backend) | **15** | Pooler hanya membuka 15 koneksi nyata ke Postgres |
| RAM / CPU | **0,5 GB**, shared | Inilah batas yang sesungguhnya, bukan jumlah koneksi |
| Disk baseline | 5 MB/s, 250 IOPS | Bisa burst, lalu turun kembali ke baseline |

**Kesimpulan yang mengubah gambaran:** menaikkan pool aplikasi 10 → 20 **tidak menambah beban ke
Postgres sama sekali**. Supavisor memultipleks 20 koneksi klien itu ke **15 koneksi backend** yang
sama. Yang berubah hanya tempat antre: sebelumnya antre di aplikasi, sesudahnya antre di pooler.

Artinya risiko sesungguhnya bukan di jumlah koneksi, melainkan di **compute Nano: RAM 0,5 GB dan
CPU shared**. Angka itu tidak bisa diukur dari VM — hanya terlihat di Observability dashboard
Supabase. Jadi kalau nanti lambat, tersangkanya compute, bukan pool.

**Catatan tambahan yang perlu diperiksa (belum dipastikan):** `config/database.ts:10-11` menyinggung
"prefetch tidak didukung pada transaction pool mode", tetapi opsi `prepare: false` **tidak diset** di
`postgres()` (baris 15-20). Dokumentasi Supabase menegaskan prepared statement **tidak didukung**
pada transaction mode. Ini bisa menjelaskan outlier 646 ms. Namun aplikasi sekarang berjalan normal,
jadi **jangan diasumsikan rusak** — perlu diuji, bukan ditebak.

**Yang tidak bisa saya ukur dari sini:** berapa kueri rata-rata per permintaan. Angka itu yang
menentukan baris mana yang berlaku di tabel atas.

Karena itu, menyertai perubahan batas disarankan **dua alarm** yang sudah punya alatnya
(Prometheus + Alertmanager sudah berjalan):
- CPU VM/backend > 70% selama 5 menit;
- latensi p95 backend > 500 ms selama 5 menit.

Tanpa dua alarm itu, menaikkan batas sama dengan melepas pagar tanpa memasang lampu.

---

## Daftar periksa

- [x] Pion menyetujui pilihan **CIDR `172.18.0.0/16`** (bukan `trustProxy: 1`) — D1
- [x] Pion menyetujui pemotongan `ipAddress` dijalankan lebih dulu sebagai tahap terpisah — D2
- [x] Pion memutuskan batas baru: **200/menit per IP** + pemutus arus sistem 3.000/menit — D3
- [x] Pion memutuskan pool Supabase **10 → 20** (cap tetap 3.000/menit) — D4, 1 Nov 2026
- [x] Pasang dua alarm (CPU > 70%, p95 > 500 ms) — **wajib sebelum tahap 3** (P1) — terpasang
      3 Nov 2026 (PR #174, commit `2fbf4bc`): `HighCpuUsage` disetel ulang jadi 70% **dari 4 inti
      VM** (rumus lama 80% per-inti justru akan berbunyi pada beban sah penuh 0,8 inti) +
      `BackendLatencyP95High` (baru, p95 histogram > 500 ms). Keduanya `for: 5m`, ter-load sehat
      di Prometheus (7 rules, promtool lulus), ekspresi tervalidasi terhadap data live
      (CPU 0,04%, p95 48 ms — jauh di bawah ambang). Tindak lanjut 3 Nov (PR #175): mount config
      Prometheus/Alertmanager diubah ke level direktori — update rules berikutnya cukup edit
      berkas + reload HUP, tanpa restart (jebakan inode bind-mount file tunggal, terbukti saat
      pemasangan alarm: container terus membaca berkas lama walau host sudah baru)
- [x] Tahap 1: ubah `auditLogService.ts` + uji pemotongan → PR → CI hijau → deploy staging — PR #170, merge 2 Nov 2026 (`1e85be5`)
- [x] Tahap 2: `app.ts` + 13 titik header mentah + uji sumber alamat → PR → CI hijau → deploy staging — PR #171, merge 2 Nov 2026 (`97b5f17`)
- [x] Verifikasi manual staging: 3 probe, hasil sesuai tabel "Sesudah perbaikan" — 2 Nov 2026,
      dua sumber IP, lulus semua; rincian di bagian "Hasil verifikasi manual"
- [x] Tahap 3: batas 200/menit per IP + pemutus arus 3.000/menit — 3 Nov 2026 (PR #177, commit
      `9516c07`): `max: 200` + modul `utils/systemBreaker.ts` (fixed window 1 menit, tanpa
      dependensi; hook didaftarkan SETELAH rate-limit sehingga permintaan 429 per-IP tidak
      menggerus jatah global 3.000). Verifikasi staging: header `x-ratelimit-limit: 200`,
      limiter login tak tersentuh (429 mulai permintaan ke-6), build container memuat
      `max: 200` + `max: 3000`
- [ ] (Opsional) putuskan apakah kuota dikunci pada identitas pengguna, bukan IP — perubahan terpisah
- [x] **Keputusan baru (wajib sebelum tahap 3):** naikkan pool Supabase 10 → 20 (disarankan; hanya
      10% dari batas 200 klien, dan tidak menambah beban Postgres) **atau** turunkan pemutus arus
      sistem 3.000 → 2.000/menit. Pilih satu, jangan dua-duanya — **D4 dieksekusi 3 Nov 2026**
      (PR #176): pool `max: 20` di `config/database.ts`, cap tetap 3.000/menit; terverifikasi
      aktif di container staging (`dist/config/database.js` memuat `max: 20`)
- [ ] (Opsional) periksa `prepare: false` untuk Supavisor transaction mode — dugaan, belum diuji
- [ ] (Opsional) pertimbangkan pindah region Supabase ke Singapura — latensi 82 ms ke Seoul adalah
      biaya terbesar per permintaan, dan itu tidak bisa diperbaiki dengan menambah koneksi
- [ ] Deploy produksi lewat blue-green, pantau 429 dan isi `ip_address` selama 24 jam — tinggal
      promosi `staging` → `main` (semua sudah terverifikasi di staging; alarm P1 aktif sebagai
      lampu selama pemantauan)
- [x] Ukur puncak permintaan/menit dari log nginx (angka, bukan taksiran) — lihat tabel di atas
- [ ] Ukur ulang setelah 2–4 minggu pemakaian nyata, lalu setel angka bila perlu
