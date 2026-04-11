# Product Requirements Document (PRD)
# Aplikasi Manajemen Pengumpulan Zakat - LAZISNU

## 1. Informasi Umum

| Item | Detail |
|------|--------|
| **Nama Aplikasi** | Lazisnu Collector App |
| **Tipe** | Mobile App (Android & iOS) + Web Dashboard |
| **Lembaga** | LAZISNU (Lembaga Zakat, Infaq, Sodaqoh Nahdlatul Ulama) |
| **Versi** | 1.0 (MVP) |
| **Tanggal** | April 2026 |

---

## 2. Tujuan Aplikasi

Aplikasi ini dirancang untuk:
1. **Mengelola distribusi dan penjemputan kaleng/kotak infaq** di rumah-rumah warga
2. **Memantau aktivitas petugas lapangan** dalam collecting dana infaq/sodaqoh
3. **Menyediakan transparansi** melalui notifikasi WhatsApp otomatis ke pemilik kaleng
4. **Menghasilkan laporan keuangan** yang akurat untuk bendahara dan admin

---

## 3. Pengguna Sistem

### 3.1 Petugas Lapangan (~100 orang)
- Mobile app (prioritas Android, iOS menyusul)
- Bertugas menjemput kaleng infaq dari rumah ke rumah
- Bisa beroperasi di area dengan sinyal lemah (offline-first)
- Dalam satu trip bisa menjemput 40-60 kaleng

### 3.2 Admin Ranting (multi-user per ranting)
- Web dashboard (browser)
- Input & update data kaleng di wilayahnya
- Lihat data operasional petugas di rantingnya saja

### 3.3 Admin Kecamatan (1 per kecamatan)
- Web dashboard (browser)
- Mengelola semua admin ranting di bawahnya
- Lihat data operasional seluruh ranting di wilayah kecamatan
- Tidak bisa input data kaleng (hanya koordinatif)

### 3.4 Bendahara
- Web dashboard (browser)
- Akses penuh ke laporan keuangan
- Akses ke data operasional lengkap (jadwal trip, status kaleng, histori petugas)
- Mengunduh laporan dalam format CSV

---

## 4. Fitur Utama

### 4.1 Fitur Mobile (Petugas)

| No | Fitur | Prioritas | Keterangan |
|----|-------|-----------|------------|
| F1 | Login & OTP | Must Have | Authentication via phone number + OTP |
| F2 | Dashboard Tugas | Must Have | Daftar kaleng yang harus dijemput |
| F3 | Scan QR Code | Must Have | Scan QR di kaleng untuk identifikasi |
| F4 | Input Nominal | Must Have | Petugas input jumlah uang yang diterima |
| F5 | Submit Data | Must Have | Simpan data penjemputan (online/offline) |
| F6 | WhatsApp Notifikasi | Must Have | Kirim pesan ke pemilik kaleng via WA Business API |
| F7 | Sync Otomatis | Must Have | Auto-sync data saat ada sinyal |
| F8 | Navigasi Peta | Nice to Have | Bantu petugas menuju lokasi kaleng |
| F9 | History Penjemputan | Should Have | Riwayat kaleng yang sudah dijemput |

### 4.2 Fitur Web (Admin Ranting)

| No | Fitur | Prioritas | Keterangan |
|----|-------|-----------|------------|
| W1 | Dashboard | Must Have | Overview data kaleng dan petugas |
| W2 | CRUD Kaleng | Must Have | Tambah, edit, hapus data kaleng |
| W3 | CRUD Petugas | Must Have | Kelola data petugas di ranting |
| W4 | Lihat Laporan | Must Have | Lihat laporan penjemputan |
| W5 | Download CSV | Must Have | Export laporan dalam format CSV |

### 4.3 Fitur Web (Admin Kecamatan)

| No | Fitur | Prioritas | Keterangan |
|----|-------|-----------|------------|
| W6 | Dashboard Aggregate | Must Have | Overview seluruh ranting di kecamatan |
| W7 | Monitoring Petugas | Must Have | Lihat aktivitas petugas seluruh ranting |
| W8 | Monitoring Kaleng | Must Have | Status kaleng di seluruh ranting |
| W9 | Rekap Laporan | Must Have | Laporan agregat seluruh kecamatan |
| W10 | Download CSV Aggregate | Must Have | Export laporan agregat |

### 4.4 Fitur Web (Bendahara)

| No | Fitur | Prioritas | Keterangan |
|----|-------|-----------|------------|
| B1 | Dashboard Keuangan | Must Have | Ringkasan keuangan per periode |
| B2 | Laporan Per Petugas | Must Have | Total collecte per petugas |
| B3 | Laporan Per Wilayah | Must Have | Total collecte per kecamatan/ranting |
| B4 | Detail Transaksi | Must Have | Histori lengkap penjemputan |
| B5 | Export CSV | Must Have | Download laporan lengkap |

---

## 5. Alur Kerja Utama

### 5.1 Alur Penjemputan Kaleng

```
[Mulai Trip]
     │
     ▼
┌─────────────┐
│ Scan QR     │
│ Kaleng      │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Input       │
│ Nominal     │
│ (uang Cash) │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Simpan Data │ ──► [Mode Offline]
│ Lokal       │      (Queue max 60 kaleng)
└──────┬──────┘
       │
       ▼ (saat ada sinyal)
┌─────────────┐
│ Auto Sync   │
│ ke Server   │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ WA Otomatis │ ──► [Pesan ke Pemilik]
│ Kirim       │      (Nama + Nominal)
└──────┬──────┘
       │
       ▼
[Selesai Trip]
```

### 5.2 Alur Pembuatan Tugas Otomatis

```
[Tanggal 1 Setiap Bulan - 00:00]
     │
     ▼
┌─────────────────────┐
│ Generate Tasks      │
│ untuk semua kaleng  │
│ yang belum dijemput │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ Assign ke Petugas   │
│ (berdasarkan zona)  │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ Notifikasi ke       │
│ masing-masing       │
│ petugas via FCM     │
└─────────────────────┘
```

### 5.3 Alur Generate QR Code

```
[Admin Ranting Input Data Kaleng]
     │
     ▼
┌─────────────────────┐
│ Generate QR Code    │
│ (kode unik kaleng)  │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ Download QR Code    │
│ (PNG/PDF)           │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ Cetak & Tempel      │
│ di Kaleng           │
└─────────────────────┘
```

---

## 6. Mekanisme Anti-Fraud

### 6.1 Verifikasi Silang
- Setiap penjemputan akan mengirim WhatsApp ke pemilik kaleng
- Pesan berisi: nama pemilik, nominal yang dijemput, tanggal, nama petugas
- Jika ada kecurangan, pemilik bisa komplain ke bendahara

### 6.2 Pembatasan Foto Bukti
- Petugas TIDAK perlu foto uang atau foto kaleng
- Mekanisme anti-fraud rely pada WA notifikasi ke pemilik
- Foto bukti transfer hanya untuk pembayaran via transfer (ditunjukkan manual ke bendahara)

### 6.3 Offline Integrity
- Data di-sync saat ada sinyal
- Tidak ada edit data setelah submit (mencegah manipulsi)
- Timestamp server digunakan sebagai referensi

---

## 7. Arsitektur Teknis

### 7.1 Tech Stack

| Komponen | Teknologi | Biaya |
|----------|-----------|-------|
| Mobile App | React Native + TypeScript | Gratis |
| Backend API | Node.js + Fastify + TypeScript | Gratis |
| Database | PostgreSQL | Gratis |
| Cache/Session | Redis | Gratis (self-hosted) |
| File Storage | Cloudflare R2 | Gratis 10GB |
| Push Notification | Firebase FCM | Gratis |
| WhatsApp | WhatsApp Business API | Berbayar |
| OTA Update | Microsoft CodePush | Gratis |
| Crash Monitoring | Firebase Crashlytics + Sentry | Gratis |
| Security | Google Play Integrity API | Gratis |

### 7.2 Arsitektur Sistem

```
┌─────────────────────────────────────────────────────────────┐
│                      MOBILE APP                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ React Native│  │ CodePush    │  │ Play Integrity      │ │
│  │ + TypeScript│  │ (OTA Update)│  │ (Anti-Tamper)       │ │
│  └──────┬──────┘  └─────────────┘  └─────────────────────┘ │
│         │                                                  │
│  ┌──────▼──────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ SQLite Local│  │ ML Kit      │  │ Firebase Crashlytics│ │
│  │ (Offline)   │  │ (QR Scanner)│  │                     │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │
                    HTTPS + JWT Token
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      API GATEWAY                            │
│                   (Rate Limiting, Auth)                     │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│  API SERVER   │   │    WORKER     │   │   SCHEDULER   │
│  Node.js      │   │  (Background)│   │  (Cron Jobs)  │
│  Fastify      │   │               │   │               │
└───────┬───────┘   └───────┬───────┘   └───────┬───────┘
        │                   │                   │
        │                   │                   │
        ▼                   ▼                   ▼
   ┌────────┐         ┌────────────┐     ┌────────────┐
   │PostgreSQL│        │ WhatsApp   │     │ Auto Task  │
   │ (Data) │         │ Business API│     │ Generation │
   └────────┘         └────────────┘     └────────────┘
        │
        ▼
   ┌────────┐         ┌────────────┐
   │ Redis  │         │ Cloudflare │
   │(Cache) │         │ R2 (Files) │
   └────────┘         └────────────┘

┌─────────────────────────────────────────────────────────────┐
│                      WEB DASHBOARD                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ Admin       │  │ Admin       │  │ Bendahara           │ │
│  │ Kecamatan   │  │ Ranting     │  │ Dashboard           │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 8. Struktur Data

### 8.1 Entitas Utama

- **User** - Pengguna sistem (admin, bendahara)
- **Petugas** - Petugas lapangan
- **Kaleng** - Data kaleng/kotak infaq
- **Assignment** - Penugasan kaleng ke petugas
- **Collection** - Data penjemputan
- **Notifikasi** - Log WhatsApp yang dikirim

### 8.2 Relasi

```
Kecamatan ──1:N──► Ranting
Ranting ────1:N──► Kaleng
Ranting ────1:N──► Admin Ranting
Kecamatan ──1:N──► Admin Kecamatan
Kaleng ─────N:N──► Petugas (via Assignment)
Petugas ───1:N──► Collection
Kaleng ─────1:N──► Collection
```

---

## 9. Kebutuhan Non-Fungsional

| Item | Requirement |
|------|-------------|
| **Ketersediaan** | App harus bisa bekerja offline minimal 8 jam |
| **Kapasitas** | Support 100 petugas simultaneous |
| **Keamanan** | JWT-based auth, HTTPS only, Play Integrity |
| **Performance** | API response < 500ms, sync < 5 detik |
| **Skalabilitas** | Arsitektur microservices-ready |

---

## 10. Deliverables

| No | Deliverable | Format |
|----|--------------|--------|
| D1 | PRD Document | .md / Notion |
| D2 | Database Schema | .sql |
| D3 | API Documentation | .md / Swagger |
| D4 | UI/UX Wireframe | Figma |
| D5 | Mobile App | APK (Android) |
| D6 | Web Dashboard | Deployed URL |
| D7 | Technical Documentation | .md |

---

## 11. Prioritas MVP

### Phase 1 (Must Have)
- Authentication (Login + OTP)
- Dashboard tugas
- Scan QR code
- Input nominal
- Submit & sync data
- WhatsApp notification
- Dashboard Admin Ranting (basic)
- Dashboard Bendahara (basic)

### Phase 2 (Should Have)
- Auto task generation (tanggal 1)
- Export CSV
- Navigasi peta
- Monitoring petugas real-time

### Phase 3 (Nice to Have)
- iOS app
- Multi-language
- Analytics dashboard

---

## 12. Pertimbangan Khusus

### 12.1 Hierarki Admin
- Admin Kecamatan: ROLE_OPERATIONAL (melihat semua data ranting)
- Admin Ranting: ROLE_DATA (input/update data kaleng & petugas)
- Akses berdasarkan role, tidak ada overlap
- Admin Kecamatan dapat melihat semua ranting di bawahnya
- Admin Ranting hanya dapat melihat data rantingnya sendiri

### 12.2 Assignment Petugas
- Default: fixed assignment per bulan
- Exception: admin bisa ubah assignment jika petugas berhalangan
- Struktur: petugas tetap menangani kaleng yang sama dengan backup assignment
- Admin dapat melakukan reassignment sebagai alternatif

### 12.3 QR Code Generation
- Sistem generate QR code dengan format: `LZNU-{REGION_CODE}-{UNIQUE_ID}`
- QR di-download dalam format PNG untuk dicetak
- Setiap kaleng memiliki QR unik yang tidak bisa diduplikasi

### 12.4 Akses Bendahara
- FULL access ke data operasional lengkap
- Bisa lihat: jadwal trip, histori petugas, detail koleksi per kaleng
- Bisa lihat: status semua kaleng, lokasi, jadwal trip
- Tidak bisa edit data (read-only untuk akuntabilitas)

---

*Document Version: 1.0*
*Last Updated: April 2026*
*Author: MiniMax Agent*