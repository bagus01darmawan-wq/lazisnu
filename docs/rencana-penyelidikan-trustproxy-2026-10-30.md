# Rencana Penyelidikan: `trustProxy` dan Alamat IP Pengguna

Tanggal: 30 Oktober 2026
Repo: `bagus01darmawan-wq/lazisnu`
Status: **rencana penyelidikan — belum ada kode yang diubah. H1, H3, K2 terbukti; H2 terbalik.**
Revisi: **4** (30 Okt 2026) — tahap 0 diperiksa ulang (K1–K4), H1 diuji (E1–E4), lalu H2/H3/K2 diuji
lewat database & log staging (E5–E8). Belum ada kesimpulan final, belum ada opsi perbaikan dipilih.
Cakupan: `apps/backend/src/app.ts`, `apps/backend/src/middleware/audit-logger.ts`,
`apps/backend/src/database/schema.ts`, `apps/backend/src/services/auditLogService.ts`,
`nginx/nginx.conf`, `docker-compose.prod.yml`, `docker-compose.blue-green.yml`,
`scripts/deploy-blue-green.sh`, dan pemakaian `request.ip` di `apps/backend/src/**`

---

## Kenapa dokumen ini ada

Saat menyelidiki `ip-address`, saya melihat `trustProxy` **tidak diset** di backend. Itu
memunculkan dugaan bahwa backend tidak pernah tahu alamat IP sebenarnya dari pengguna — yang
berarti dua hal bisa rusak sekaligus: **pembatas jumlah permintaan** dan **catatan audit**.

Dugaan ini **belum terbukti**. Dokumen ini adalah rencana untuk membuktikannya, bukan
kesimpulannya.

> Analogi: semua surat masuk lewat satu pos depan. Kalau pos depan tidak menuliskan alamat
> pengirim yang asli di amplop, maka kantor di belakang hanya melihat "dari pos depan" untuk
> **semua** surat. Akibatnya dua hal: catatan siapa mengirim apa jadi tidak berguna, dan aturan
> "satu pengirim maksimal 100 surat per menit" berubah artinya menjadi "semua pengirim
> digabung maksimal 100 surat per menit".

---

## Pertanyaan yang harus dijawab

1. Apakah semua pengguna benar-benar berbagi **satu** kuota pembatas permintaan?
2. Apakah catatan audit (`ipAddress`) berisi alamat IP nginx, bukan alamat pengguna?
3. Apakah pengirim bisa memalsukan alamat IP di catatan audit lewat header `X-Forwarded-For`?
4. Kalau ya, apa perbaikan yang paling sempit risikonya?

---

## Bukti awal yang sudah dikumpulkan (fakta, bukan dugaan)

| Berkas | Baris | Fakta |
|---|---|---|
| `apps/backend/src/app.ts` | 30-38 | `Fastify({ logger: {...} })` — **tanpa** `trustProxy`. Default Fastify: `false`. |
| seluruh repo | — | Kata `trustProxy` **tidak muncul sama sekali** (pencarian menyeluruh di luar `node_modules`). |
| `docker-compose.prod.yml` | 29-45 | Service `backend` **tanpa** `ports:` → tidak dipublikasikan ke host, hanya bisa diakses dari dalam jaringan Docker. |
| `docker-compose.prod.yml` | 80-95 | Service `nginx` mempublikasikan `80:80` dan `443:443` → satu-satunya pintu masuk dari luar. |
| `docker-compose.prod.yml` | 65-74 | Service `web` memanggil backend langsung lewat `API_URL=http://backend:3001` (baris 73). |
| `nginx/nginx.conf` | 74, 84, 109, 140, 160 | `proxy_pass` ke backend untuk `api.lazisnu.site` dan `staging-api.lazisnu.site`. |
| `nginx/nginx.conf` | 77-78 | `X-Real-IP $remote_addr` dan `X-Forwarded-For $proxy_add_x_forwarded_for`. |
| `apps/backend/src/app.ts` | 91-103 | `rateLimit` didaftarkan dengan `max: 100`, `timeWindow: '1 minute'`, tanpa `keyGenerator` khusus, dan **tanpa** `store` Redis → hitungan in-memory per proses (rincian di K4). |
| `@fastify/rate-limit` `index.js` | 58 | `defaultKeyGenerator = (req, ipv6Subnet) => normalizeIP(req.ip, ipv6Subnet)` → kunci kuota = `req.ip`. |
| `@fastify/rate-limit` `index.js` | 79-90 | Header `x-ratelimit-limit` / `-remaining` / `-reset` dikirim **secara default** → sah dipakai sebagai alat ukur H1. |
| `docker-compose.blue-green.yml` | 21-22 | Service `backend` **dipublikasikan** ke `127.0.0.1:${BACKEND_PORT}:${BACKEND_PORT}`. Berkas inilah yang dipakai produksi (`scripts/deploy-blue-green.sh`), **bukan** `docker-compose.prod.yml`. |
| `apps/backend/src/app.ts` | 130 | `server.addHook('onResponse', auditLogger)` → audit berjalan **global**: semua POST/PUT/PATCH/DELETE + setiap 401/403. |
| `apps/backend/src/database/schema.ts` | 293, 642 | `ipAddress: varchar('ip_address', { length: 45 })` — tanpa pemotongan di sisi aplikasi. |
| `apps/backend/src/services/auditLogService.ts` | 64-77 | `insertActivityLog` menyisipkan `ipAddress` **apa adanya** — tidak ada `slice()` atau penjaga panjang. |

Pemakaian alamat IP untuk catatan audit (pola yang ditemukan):

| Berkas | Pola |
|---|---|
| `routes/auth.ts` | **9 titik** header mentah: `ipAddress: (request.headers['x-forwarded-for'] as string) \|\| request.ip` (baris 130, 164, 187, 238, 387, 464, 675, 845, 908) + **8 titik** `ipAddress: request.ip` — dua pola bercampur dalam satu berkas |
| `middleware/audit-logger.ts` | **3 titik** header mentah (baris 26, 43, 78) — hook `onResponse` **global**, jadi cakupannya paling luas dari semua pemakaian |
| `routes/bendahara.ts` | `ipAddress: (request.headers['x-forwarded-for'] as string) \|\| request.ip` |
| `routes/mobile/collections.ts` | `ipAddress: request.ip` |
| `routes/mobile/tasks.ts` | `ipAddress: request.ip` |
| `routes/mobile/submissions.ts` | `ipAddress: request.ip` |

Total pemakaian `.ip` di `src/` (di luar berkas uji, dihitung 30 Okt 2026): **29 titik** — **13**
membaca header mentah, **16** memakai `request.ip` polos.
Karena backend tidak punya `ports:` di `docker-compose.prod.yml`, **tidak ada jalur langsung dari
internet** ke backend. Jadi `req.ip` untuk semua permintaan API berasal dari satu pihak: container
nginx (atau container `web` untuk permintaan SSR).

**Tetapi lihat koreksi K1** — compose yang benar-benar dipakai produksi mempublikasikan backend ke
`127.0.0.1`, sehingga "tidak ada jalur langsung" hanya benar untuk internet, bukan untuk host VM itu
sendiri.

---

## Koreksi hasil pemeriksaan ulang (30 Okt 2026)

Bagian ini **mengoreksi dan menambah** bukti tahap 0 di atas. Semua butir di sini berasal dari
membaca kode dan konfigurasi — **belum satu pun diuji runtime**. Bedakan dengan jelas: "terbaca di
kode" ≠ "terbukti di server".

### K1 — Jaminan "backend tak bisa diakses langsung" lebih lemah dari yang tertulis

Tabel bukti di atas mengutip `docker-compose.prod.yml` (backend tanpa `ports:`). Itu benar untuk
berkas tersebut, tetapi **berkas itu bukan jalur produksi**. Produksi dijalankan lewat
`docker-compose.blue-green.yml` oleh `scripts/deploy-blue-green.sh`, dan di sana:

```yaml
# docker-compose.blue-green.yml:21-22
ports:
  - "127.0.0.1:${BACKEND_PORT}:${BACKEND_PORT}"
```

Bind ke `127.0.0.1` berarti **tidak** terjangkau dari internet — klaim lama tetap berdiri untuk
penyerang luar. Yang berubah: siapa pun yang punya akses ke VM (atau proses apa pun di VM itu) bisa
menembak `http://127.0.0.1:3001` dan mengarang header sesukanya.

**Akibat pada pilihan perbaikan:** Opsi A (`trustProxy: 1`) mempercayai header dari **siapa pun**
yang bisa menjangkau soket, termasuk `127.0.0.1`. Opsi B (CIDR jaringan Docker) menutup celah itu
karena koneksi dari host tidak termasuk CIDR. Ini bukan lagi soal "lebih ketat", melainkan soal
jalur yang memang terbuka.

### K2 — H3 lebih berbahaya dari "IP bisa dipalsukan": jejak audit bisa dihapus

Rantai yang terbaca di kode:

1. `nginx.conf` memakai `$proxy_add_x_forwarded_for` → header berisi **daftar ber-koma**, bukan satu
   alamat: `<karangan klien>, <IP asli>`.
2. Rute dan middleware menulis nilai header itu **utuh** ke `ipAddress`.
3. Kolomnya `varchar(45)` (`schema.ts:293`, `:642`) dan `insertActivityLog` **tidak memotong**
   (`auditLogService.ts:64-77`).
4. PostgreSQL menolak nilai lebih panjang (SQLSTATE `22001`).

Jadi klien yang mengirim `X-Forwarded-For` panjang membuat **insert audit gagal**. Yang terjadi
sesudahnya berbeda menurut jalur:

| Jalur | Perlakuan | Dugaan akibat |
|---|---|---|
| Rute (`auth.ts` dll.) | `try { insertActivityLog } catch` (`auth.ts:133`, `:167`, `:190`, …) | Login tetap berjalan, **catatan audit hilang diam-diam**; hanya tersisa error log |
| Middleware `audit-logger.ts:19` | `await` **tanpa** `try/catch` di dalam hook `onResponse` | Diduga hanya error log (respons sudah terkirim) — **belum diuji, jangan dianggap aman** |

Artinya H3 bukan sekadar "catatan audit berisi alamat palsu", melainkan **"penyerang dapat
menghilangkan catatan auditnya sendiri"**. Bagi jejak audit keamanan, itu lebih berat, dan cukup
alasan untuk menaikkan prioritas di atas H1.

### K3 — Perbaikan wajib menyentuh middleware, bukan hanya rute

`audit-logger.ts` adalah hook `onResponse` **global** (`app.ts:130`): ia menangkap semua mutasi
(POST/PUT/PATCH/DELETE) yang berhasil, plus setiap 401 dan 403. Sebagian besar catatan audit
sebenarnya lahir di sini, bukan di rute. Memperbaiki 9 titik di `auth.ts` dan 1 di `bendahara.ts`
tetapi meninggalkan middleware = sebagian besar jejak tetap memakai header mentah. Daftar kerja
perbaikan karena itu **tiga berkas**: `routes/auth.ts`, `routes/bendahara.ts`,
`middleware/audit-logger.ts`.

### K4 — Cara uji H1 sah, tetapi hati-hati membaca hasilnya

Yang menguatkan: `x-ratelimit-remaining` memang dikirim default (`index.js:79-90`), dan
`POST /v1/auth/login` memakai `max: 5 / 1 menit` dengan kunci `req.ip` default (`auth.ts:55-58`) —
persis seperti yang ditulis rencana.

Yang perlu diwaspadai: `rateLimit` didaftarkan **tanpa** `store` Redis (`app.ts:91-103`), jadi
hitungannya in-memory dan **milik satu proses**. Dua akibat saat menguji:

- Kuota **hilang setiap restart/deploy** — jangan menyimpulkan apa pun dari sisa kuota yang tiba-tiba
  penuh kembali.
- Container **biru dan hijau tidak berbagi kuota**. Kalau permintaan A dan B jatuh ke warna berbeda,
  H1 akan tampak "tidak terbukti" padahal sebenarnya terbukti. Pastikan dulu warna mana yang aktif
  (`nginx/upstream.conf`), atau lakukan kedua permintaan berurutan dalam hitungan detik.

---

## Hasil eksekusi (30 Okt 2026, 08:38–08:42 WIB)

Uji dijalankan terhadap **staging** (`https://staging-api.lazisnu.site`), 5 permintaan `GET`,
baca-saja: tidak ada login, tidak ada mutasi, tidak ada baris audit lahir (`auditLogger` hanya
mencatat mutasi + 401/403). Biaya: kuota turun 5 dari 100.

| # | Permintaan | `x-ratelimit-remaining` |
|---|---|---|
| 0 | `GET /health/ready` | 99 |
| 1 | `GET /health/live` | 98 |
| 2 | `GET /health/live` | 97 |
| 3 | `GET /health/live` + `X-Forwarded-For: 1.2.3.4` | 96 |
| 4 | `GET /health/live` + `X-Forwarded-For: 9.9.9.9` + `X-Real-IP: 8.8.8.8` | 95 |

### E1 — H1 terbukti, dan lebih kuat dari rencana

Penghitung turun **satu per satu** (98 → 97 → 96 → 95) walaupun header diganti-ganti, dan **lintas
rute yang berbeda**. Dua hal terbukti sekaligus:

1. **`trustProxy` mati** — header karangan diabaikan. Ini konfirmasi runtime, bukan lagi dugaan dari
   kode.
2. **Kuncinya satu** — IP soket = container nginx. Aplikasi mobile memakai
   `https://api.lazisnu.site` (`apps/mobile/src/services/api.ts:68`), yang lewat nginx; jadi semua
   pengguna menumpang satu ember.

**Konsekuensi:** uji dua perangkat di H1 **tidak perlu lagi** — mekanismenya sudah terbukti langsung,
dan itu bukti yang lebih kuat daripada membandingkan dua HP. H1 naik status dari "belum" ke
**terbukti**.

### E2 — Temuan baru: yang dibagi 100/menit itu **seluruh sistem**

Bukan "kuota per pengguna yang salah kunci", melainkan **100 permintaan per menit untuk semua
pengguna digabung**. Satu orang yang membuka dashboard berkali-kali bisa menghabiskan jatah semua
orang, dan mereka menerima 429. Ini kerusakan ketersediaan, bukan sekadar ketidaktepatan catatan.

### E3 — Kekhawatiran yang gugur: batas login punya penghitung sendiri

`LocalStore.child()` mengembalikan LRU **baru** (`store/LocalStore.js:79-81`), dan rute dengan
`config.rateLimit` memakai store anak itu (`index.js:175-179`). Jadi `POST /v1/auth/login` (5/menit)
**tidak** berbagi penghitung dengan batas global 100/menit. Artinya login tidak akan terblokir gara-
gara lalu lintas umum, dan uji 429 di H1 aman dilakukan.

### E4 — H4: terbaca di kode, belum diuji runtime

`apps/web/src` **tidak pernah** mengirim `X-Forwarded-For` (pencarian menyeluruh: nol hasil), dan
`web-staging` memanggil backend lewat `API_URL=http://backend-staging:4001`
(`docker-compose.staging.yml:85`). Jadi permintaan SSR datang dari IP container `web` → ember
terpisah dari nginx. Dampaknya kecil, sesuai dugaan semula.

### E5 — H2: **terbalik** — dan ini temuan paling mengejutkan

Tiga login gagal dikirim ke staging (identifier karangan, `password: salah`), lalu
`activity_logs` dibaca lewat container staging:

| Probe | Header dikirim | `ip_address` tersimpan | Panjang |
|---|---|---|---|
| P1 | — | `114.10.4.212` | 12 |
| P2 | `X-Forwarded-For: 1.2.3.4` | `1.2.3.4, 114.10.4.212` | 21 |
| P3 | `X-Forwarded-For` 56 karakter | **tidak ada baris** | — |

P1 menyimpan **IP publik klien**, bukan `172.x`. Jadi dugaan awal "catatan audit berisi IP nginx"
**salah** — tetapi bukan karena `trustProxy` bekerja, melainkan karena `routes/auth.ts` membaca
header mentah. Konsekuensinya, hasilnya bergantung pada rute mana yang menulis:

- **13 titik ber-header** → IP benar, tetapi **kebetulan** dan bisa dipalsukan (lihat E6).
- **16 titik `request.ip` polos** → IP nginx. Ini mengikuti mekanisme yang sudah dibuktikan E1
  (satu kunci untuk semua permintaan hanya mungkin bila `req.ip` = IP nginx).

Dua sumber kebenaran di satu tabel yang sama menghasilkan dua perilaku berbeda. Itu bukti langsung
K3, bukan lagi dugaan.

### E6 — H3: **terbukti**

P2 menyimpan `1.2.3.4, 114.10.4.212` — nilai karangan klien di depan, IP asli **ditambahkan** nginx
di belakang. Siapa pun bisa menulis alamat apa pun di kolom audit, dan pembaca yang mengambil elemen
pertama akan membaca nilai palsu itu.

### E7 — K2: **terbukti, dan lebih buruk dari dugaan**

P3 tidak meninggalkan **satu baris pun** — baik `FAILED_LOGIN` dari rute maupun `AUTH_FAILED` dari
middleware. Log backend mencatat dua kegagalan identik:

```
value too long for type character varying(45)
msg: "FAILED_LOGIN audit log failed"      (rute, auth.js:114)
msg: "Audit Logger Insert Failed"          (middleware, audit-logger.js:82)
```

Proses **tidak** crash dan permintaan tetap dijawab `401` — jadi dugaan "mungkin hanya error log"
benar. Tetapi akibatnya: satu header panjang cukup untuk menghapus seluruh jejak audit sebuah
permintaan. Satu-satunya sisa adalah baris error di log aplikasi, yang akan tergulung oleh rotasi
`max-size 10m, max-file 3` (`docker-compose.staging.yml:50-54`).

### E8 — Rantai yang sekarang terbukti utuh

1. `trustProxy` mati → `req.ip` = IP nginx untuk **semua** permintaan (E1).
2. 13 titik menulis header mentah → isi kolom = `<karangan>, <IP asli>` (E6).
3. 16 titik menulis `request.ip` → isi kolom = IP nginx (E5).
4. Header >45 karakter → kedua jalur gagal insert → jejak hilang (E7).
5. Semua pengguna berbagi 100 permintaan/menit (E2).

Tidak ada satu pun dari lima butir di atas yang masih berupa dugaan.

---

## Hipotesis dan cara mematahkannya

Setiap hipotesis harus punya cara **membuktikan salah**, bukan hanya cara membenarkan.

### H1 — Semua pengguna berbagi satu kuota rate-limit

**STATUS: TERBUKTI (30 Okt 2026)** — lihat [E1](#e1--h1-terbukti-dan-lebih-kuat-dari-rencana).
Uji dua perangkat di bawah **tidak perlu lagi dijalankan**; disimpan sebagai catatan cara menguji.

**Kalau benar:** dua perangkat di jaringan berbeda akan melihat angka sisa kuota yang **sama**.

**Cara uji (staging, aman, tanpa efek samping):**

1. Pakai endpoint `POST /v1/auth/login` (`routes/auth.ts:55-58`, batas **5 per menit**). Kirim
   dengan kredensial salah — tidak mengirim OTP, tidak mengubah data.
2. Dari perangkat A (wifi): kirim **1** permintaan. Catat header `x-ratelimit-remaining`.
3. Dari perangkat B (**data seluler**, IP publik berbeda): kirim **1** permintaan. Catat header
   yang sama.
4. **Kalau benar (H1):** sisa kuota di B sudah berkurang karena permintaan A.
   **Kalau salah:** sisa kuota di B masih penuh (5).
5. Ulangi sampai salah satu perangkat menerima **429**. Kalau 429 muncul setelah total 5
   permintaan lintas perangkat → H1 terbukti.

**Catatan:** uji ini menghabiskan kuota staging selama satu menit. Lakukan di luar jam pemakaian.

### H2 — Catatan audit berisi IP nginx

**STATUS: TERBALIK (30 Okt 2026)** — lihat [E5](#e5--h2-terbalik--dan-ini-temuan-paling-mengejutkan).
Rute yang membaca header mentah menyimpan **IP publik klien** (bukan IP nginx); rute yang memakai
`request.ip` polos menyimpan IP nginx. Jadi hipotesis ini benar untuk sebagian rute saja.

**Kalau benar:** kolom `ipAddress` pada catatan login/audit berisi alamat internal
(`172.x.x.x`), bukan IP publik pengguna.

**Cara uji:**

1. Catat IP publik perangkat uji (mis. lewat situs "what is my IP").
2. Lakukan satu login gagal dari perangkat itu ke staging.
3. Periksa catatan audit / log backend untuk permintaan tersebut.
4. **Kalau benar:** yang tercatat `172.x.x.x` (jaringan Docker), bukan IP publik tadi.

**Cara alternatif tanpa akses database:** bandingkan log nginx (`$remote_addr`, IP asli) dengan
log backend untuk permintaan pada detik yang sama. Kalau berbeda, H2 terbukti.

### H3 — Alamat IP bisa dipalsukan lewat header

**Kalau benar:** mengirim header `X-Forwarded-For: 1.2.3.4` membuat catatan audit menampilkan
`1.2.3.4`.

**Dasar dugaan (dari kode, belum diuji runtime):** beberapa rute memakai
`request.headers['x-forwarded-for'] || request.ip` — membaca header mentah lebih dulu. Sementara
nginx memakai `$proxy_add_x_forwarded_for`, yang **menambahkan** IP asli ke header kiriman klien,
bukan menggantinya. Jadi nilai karangan klien tetap ada di depan.

**Cara uji:** kirim satu login gagal dengan header itu, lalu periksa catatan audit. Kalau yang
tercatat `1.2.3.4`, H3 terbukti.

**Koreksi (K2, 30 Okt 2026):** hasil yang paling mungkin bukan `1.2.3.4` bersih, melainkan
`1.2.3.4, <IP asli>` — karena nginx **menambahkan**, bukan mengganti. Jadi yang harus diperiksa
adalah apakah nilai karangan itu **ada di dalam** kolom, bukan apakah ia satu-satunya isi kolom.

**Uji tambahan yang lebih menentukan:** kirim `X-Forwarded-For` yang panjangnya > 45 karakter, lalu
periksa apakah catatan audit untuk permintaan itu **ada sama sekali**. Kalau hilang, H3 bukan cuma
pemalsuan — penyerang bisa menghapus jejaknya sendiri (rincian di K2). Ini yang membuat H3 lebih
mendesak daripada H1.

### H4 — Web SSR punya kuota sendiri

**Kalau benar:** permintaan dari dashboard web (lewat container `web`) memakai kunci berbeda
dari permintaan API langsung.

**Cara uji:** bandingkan `x-ratelimit-remaining` antara permintaan yang lewat nginx→backend dan
yang dihasilkan SSR web. Kalau angkanya bergerak terpisah, H4 terbukti. Dampaknya kecil, tetapi
perlu diketahui sebelum mengubah `trustProxy` supaya perbaikan tidak mengejutkan.

---

## Tahapan penyelidikan

| Tahap | Isi | Alat | Status |
|---|---|---|---|
| 0 | Baca kode & konfigurasi (tabel bukti di atas) | repo | **selesai** (revisi 2, 30 Okt 2026) |
| 1 | Uji H1 di staging (dua jaringan, endpoint login) | saya + curl | **selesai** (cara berbeda, lihat E1) |
| 2 | Uji H2 & H3 (catatan audit / log) | saya + SSH/psql | **selesai** (H2 terbalik, H3 & K2 terbukti — E5–E7) |
| 3 | Uji H4 (SSR web) | saya | **terbaca di kode** (E4), belum runtime |
| 4 | Tulis kesimpulan + keputusan perbaikan | saya | belum |

**Kenapa harus di staging:** PC pengembangan ini tidak punya Docker, PostgreSQL, maupun Redis,
dan aturan proyek melarang build di sini. Uji runtime hanya bisa dilakukan di staging.

---

## Kriteria keputusan

- **H1 terbukti** → ini **bug nyata** dan berbahaya: satu pengguna dapat menyebabkan seluruh
  pengguna lain terkena "terlalu banyak permintaan". Perbaikan jadi prioritas. *(Sudah terjadi —
  E1/E2.)*
- **H1 tidak terbukti** → tidak ada bug rate-limit; `trustProxy` tetap perlu ditinjau hanya untuk
  kebenaran catatan audit (H2/H3). *(Tidak berlaku: H1 terbukti.)*
- **H3 terbukti** → catatan audit tidak bisa dipercaya sebagai bukti; ini perlu diperbaiki
  terlepas dari hasil H1, karena menyangkut jejak audit keamanan. *(Sudah terjadi — E6.)*
- **K2 sudah terbaca di kode** (bukan hipotesis) → perbaikan cara menulis `ipAddress` perlu
  dikerjakan **bahkan bila H1 dan H3 tidak terbukti**: `varchar(45)` + header mentah + tanpa
  pemotongan = catatan audit bisa hilang, dan itu tidak bergantung pada `trustProxy` sama sekali.
  `trustProxy` hanya memperbaiki **isi** kolom; ia tidak memperbaiki **panjang** nilai.

---

## Opsi perbaikan (belum dipilih)

> **Rencana perbaikannya kini ada di dokumen terpisah:**
> [`rencana-perbaikan-trustproxy-2026-11-01.md`](rencana-perbaikan-trustproxy-2026-11-01.md).
> Dokumen ini tetap menyimpan analisis dan buktinya; dokumen itu menyimpan langkah kerjanya.

| Opsi | Isi | Risiko |
|---|---|---|
| **A. `trustProxy: 1`** | Percaya **satu** lompatan proxy saja (nginx). Fastify mengambil IP dari entri terakhir `X-Forwarded-For`. | Paling sesuai topologi **asal** backend benar-benar tak terjangkau selain lewat nginx. **Koreksi K1:** produksi memakai compose blue-green yang mempublikasikan `127.0.0.1:${BACKEND_PORT}` — jadi header dari koneksi lokal VM ikut dipercaya. Jangan dipilih tanpa menyadari itu. |
| **B. `trustProxy: <CIDR jaringan Docker>`** | Hanya percaya header bila koneksi datang dari jaringan internal. | CIDR harus disesuaikan bila jaringan Docker berubah. **Koreksi K1:** inilah opsi yang menutup jalur `127.0.0.1`, jadi kini lebih diutamakan daripada A. Perlu dicek: nginx dan backend harus berada di jaringan yang sama. |
| **C. `trustProxy: true`** | Percaya header dari mana saja. | **JANGAN.** Header bisa dikarang; alamat IP jadi palsu dan kuota rate-limit bisa diakali. |

Tambahan yang perlu ikut dipertimbangkan bila opsi A/B dipilih:

1. **Samakan pola penulisan audit.** Setelah `trustProxy` aktif, `request.ip` sudah benar —
   pemakaian `request.headers['x-forwarded-for']` mentah sebaiknya dihapus agar tidak ada dua
   sumber kebenaran (dan agar tidak bisa dipalsukan). **Koreksi K3:** yang harus disentuh **tiga
   berkas** — `routes/auth.ts` (9 titik), `routes/bendahara.ts` (1 titik), dan yang paling penting
   `middleware/audit-logger.ts` (3 titik, hook global).
2. **Tinjau ulang batas rate-limit.** Setelah kunci menjadi per pengguna, batas `100/menit`
   berlaku untuk tiap pengguna, bukan seluruh sistem. Beban total yang diterima server bisa naik;
   angka ini perlu ditinjau, bukan dibiarkan.
3. **Perhatikan permintaan SSR web.** Permintaan dari container `web` akan tampak berasal dari IP
   container itu, bukan pengguna. Kalau kuota per pengguna diinginkan untuk jalur itu juga,
   `web` perlu meneruskan IP pengguna — dan itu perubahan terpisah.
4. **Jaga panjang `ipAddress` (K2).** Terlepas dari `trustProxy`, nilai yang masuk kolom
   `varchar(45)` harus dipotong atau divalidasi di `insertActivityLog`. Tanpa itu, satu header
   panjang cukup untuk menghapus satu baris jejak audit. Ini perbaikan kecil dan berdiri sendiri —
   tidak perlu menunggu keputusan A/B.
5. **Pertimbangkan store Redis untuk rate-limit (K4).** Selama hitungan masih in-memory, kuota
   hilang saat deploy dan tidak dibagi antar warna. Ini bukan bug hari ini, tetapi membuat hasil uji
   H1 sulit dibaca dan membuat batas 100/menit tidak konsisten setelah blue-green switch.

---

## Rollback

Perubahan `trustProxy` hanya satu opsi di `Fastify({...})`. Rollback = hapus opsi itu, build
ulang, deploy. Tidak ada migrasi data. Dampaknya hanya pada kunci rate-limit dan isi catatan
audit yang dibuat **setelah** perubahan.

---

## Yang **tidak** dikerjakan dalam dokumen ini

- Tidak mengubah `app.ts`, `nginx.conf`, atau `docker-compose`.
- Tidak mengubah batas rate-limit.
- Tidak menyentuh penambalan `ip-address` (dokumen terpisah).

---

## Daftar periksa

- [x] Tahap 0 (revisi 2): periksa ulang bukti + catat koreksi K1–K4
- [x] Tahap 1: H1 **terbukti** lewat probe header (E1) — uji dua perangkat tidak diperlukan
- [ ] Tahap 1: uji 429 lintas pengguna (opsional, untuk mengukur dampak nyata E2)
- [x] Tahap 2: isi `ipAddress` pada login gagal — **IP publik klien**, bukan IP nginx (E5)
- [x] Tahap 2: pemalsuan `X-Forwarded-For` pendek — **berhasil**, `1.2.3.4, 114.10.4.212` (E6)
- [x] Tahap 2: `X-Forwarded-For` **> 45 karakter** — **jejak hilang total**, error `22001` di log (E7)
- [x] Tahap 3: jalur SSR web — terbaca di kode (E4), tidak mengirim XFF → ember terpisah
- [ ] Tahap 4: tulis kesimpulan dengan angka, lalu pilih opsi perbaikan (A/B, dengan K1 sebagai pertimbangan)

**Sisa jejak uji di staging:** dua baris `activity_logs` dengan identifier
`probe-h2-1793324626@example.invalid` dan `probe-h3-1793324626@example.invalid`, dibuat 30 Okt 2026
18:43 UTC. Sengaja **tidak dihapus** — menghapus baris audit bukan tindakan yang pantas dilakukan
tanpa izin, dan baris itu sendiri adalah bukti. Baris P3 tidak ada, justru karena temuannya.
