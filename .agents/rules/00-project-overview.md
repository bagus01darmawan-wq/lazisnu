---
trigger: model_decision
---

# Rule: Project Overview
# Scope: Semua agent / semua task
# Baca file ini pertama sebelum file rules lainnya.

---

## Identitas Project

**Nama**: Lazisnu Infaq Collection System
**Tujuan**: Sistem digital pengumpulan infaq/sodaqoh untuk lembaga Lazisnu.
**Pengguna utama**: ~100 petugas lapangan yang mengambil uang dari kaleng/kotak infaq di rumah donatur.

---

## Tiga Pilar Utama — Jangan Pernah Dilanggar

```
1. IMMUTABLE AUDIT TRAIL
   Data koleksi tidak bisa dihapus atau diubah.
   Koreksi hanya boleh via re-submit (INSERT baru dengan flag).

2. WHATSAPP SEBAGAI VERIFIKASI EKSTERNAL
   Setiap submit koleksi WAJIB memicu notifikasi WA ke pemilik kaleng
   berisi nominal aktual. Ini adalah mekanisme anti-fraud utama.

3. OFFLINE-FIRST
   Petugas beroperasi di area tanpa sinyal.
   Semua operasi harus bisa berjalan offline dan sync otomatis saat ada koneksi.
```

---

## Alur Kerja Inti (Happy Path)

```
Petugas buka app
  → Tap task kaleng dari daftar
  → Scan QR code pada kaleng
  → Sistem validasi QR (kaleng valid? assignment aktif? belum disubmit periode ini?)
  → Input nominal uang yang diterima (Cash atau Transfer)
  → Review & konfirmasi (tidak bisa dibatalkan setelah ini)
  → Submit → WA terkirim otomatis ke pemilik kaleng
  → Task ditandai selesai
```

---

## Tech Stack Ringkas

| Layer | Teknologi |
|---|---|
| Mobile | React Native + TypeScript (Android prioritas) |
| Web Dashboard | Next.js 14 App Router + TypeScript + Tailwind |
| Backend API | Node.js + Fastify + TypeScript |
| Database | PostgreSQL 16 |
| Cache & Queue | Redis 7 + BullMQ |
| Storage | Cloudflare R2 (QR PDF) |
| Push Notif | Firebase Cloud Messaging |
| WhatsApp | Meta WhatsApp Business API |
| OTA Update | Microsoft App Center CodePush |
| Security | Google Play Integrity API |
| Monitoring | Firebase Crashlytics + Sentry |
| CI/CD | GitHub Actions → Railway |

---

## User Roles

| Role | Platform | Akses |
|---|---|---|
| `admin_kecamatan` | Web | Super admin — semua data semua ranting |
| `admin_ranting` | Web (responsive di HP) | Data rantingnya sendiri saja |
| `petugas` | Mobile App | Task yang diassign kepadanya saja |
| `bendahara` | Web Dashboard | Read-only laporan + operasional |

---

*Lazisnu Infaq Collection System — rules/00-project-overview.md*
