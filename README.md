# LAZISNU Collector App

Aplikasi manajemen pengumpulan zakat, infaq, dan sodaqoh untuk LAZISNU (Lembaga Zakat, Infaq, Sodaqoh Nahdlatul Ulama).

## 📋 Deskripsi

Aplikasi mobile-first untuk petugas lapangan yang berfungsi untuk:
- Memindai QR code kaleng/kotak infaq
- Mencatat nominal penjemputan
- Mengirim notifikasi WhatsApp ke pemilik kaleng
- Bekerja offline di area dengan sinyal lemah
- Dashboard web untuk admin dan bendahara

## 🏗️ Arsitektur

```
├── docs/                  # Dokumentasi
│   ├── PRD.md           # Product Requirements Document
│   ├── DATABASE_SCHEMA.sql # Skema database PostgreSQL
│   └── API_DOCUMENTATION.md # Dokumentasi API
│
├── mobile/               # React Native App (Petugas)
│   ├── src/
│   │   ├── screens/     # Halaman aplikasi
│   │   ├── components/  # Komponen reusable
│   │   ├── services/    # API services
│   │   ├── stores/      # State management
│   │   ├── types/       # TypeScript types
│   │   └── utils/       # Utilities
│   └── assets/          # Assets statis
│
├── backend/              # Node.js + Fastify API
│   ├── src/
│   │   ├── routes/      # API endpoints
│   │   ├── models/      # Database models
│   │   ├── middleware/  # Auth, validation, etc.
│   │   ├── services/    # Business logic
│   │   ├── utils/       # Helpers
│   │   └── config/      # Konfigurasi
│   └── tests/           # Unit tests
│
└── web/                  # React Web Dashboard
    ├── src/
    │   ├── pages/       # Halaman web
    │   ├── components/  # Komponen reusable
    │   ├── services/    # API services
    │   └── types/       # TypeScript types
    └── public/          # Static files
```

## 🛠️ Tech Stack

| Komponen | Teknologi |
|----------|-----------|
| Mobile App | React Native + TypeScript |
| Backend | Node.js + Fastify + TypeScript |
| Database | PostgreSQL 14+ |
| Cache | Redis |
| File Storage | Cloudflare R2 |
| Push Notification | Firebase FCM |
| WhatsApp | WhatsApp Business API |
| OTA Update | Microsoft App Center (CodePush) |
| Crash Monitoring | Firebase Crashlytics + Sentry |
| Security | Google Play Integrity API |

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Redis 7+
- React Native CLI
- Android Studio (untuk development Android)

### Setup Backend
```bash
cd backend
npm install
cp .env.example .env
# Edit .env dengan konfigurasi database
npm run dev
```

### Setup Mobile App
```bash
cd mobile
npm install
npx pod-install  # untuk iOS
npm run android  # untuk Android
```

### Setup Web Dashboard
```bash
cd web
npm install
npm run dev
```

## 📱 Fitur Utama

### Mobile App (Petugas)
- [ ] Login dengan OTP
- [ ] Dashboard tugas penjemputan
- [ ] Scan QR code kaleng
- [ ] Input nominal penjemputan
- [ ] Sinkronisasi offline
- [ ] Notifikasi WhatsApp otomatis

### Web Dashboard (Admin)
- [ ] CRUD kaleng dan petugas
- [ ] Generate QR code
- [ ] Monitoring aktivitas
- [ ] Export laporan CSV

### Web Dashboard (Bendahara)
- [ ] Laporan keuangan
- [ ] Detail transaksi
- [ ] Export CSV
- [ ] Akses data operasional lengkap

## 📄 Dokumentasi

Lihat folder `docs/` untuk:
- `PRD.md` - Product Requirements Document
- `DATABASE_SCHEMA.sql` - Skema database lengkap
- `API_DOCUMENTATION.md` - Dokumentasi semua endpoint API

## 📅 Timeline Pengembangan

| Phase | Durasi | Target |
|-------|--------|--------|
| Phase 1 (MVP) | 8-12 minggu | Fitur inti mobile + basic web |
| Phase 2 | 4-6 minggu | Auto task generation + reporting |
| Phase 3 | 4-6 minggu | Optimasi + iOS app |

## 👥 Team Requirements

| Role | Jumlah | Keterangan |
|------|--------|------------|
| Mobile Developer | 1-2 | React Native |
| Backend Developer | 1-2 | Node.js + PostgreSQL |
| UI/UX Designer | 1 | Figma |
| QA Tester | 1 | Testing |

## 📞 Kontak

Untuk informasi lebih lanjut, hubungi tim development LAZISNU.

---

*Author: MiniMax Agent*
*Version: 1.0.0*
*Last Updated: April 2026*