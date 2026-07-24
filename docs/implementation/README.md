# Implementation Plan — Lazisnu

> Dokumen ini adalah **indeks utama** dari seluruh implementation plan Lazisnu.
> Disusun berdasarkan analisis: docs/analisis-master-lazisnu.md
> Terakhir diperbarui: 2026-07-24

---

## Cara Menggunakan

1. **Lakukan To-Do Tracking**: Gunakan [MASTER-GOAL-LIST.md](./MASTER-GOAL-LIST.md) sebagai master checklist harian
2. Mulai dari [Sub-bab 01](./01-arsitektur-konteks.md) untuk memahami konteks
3. **Pertama kerjakan**: [Sub-bab 06](./06-temuan-perbaikan-kode.md) (Minggu 1 — P0 kritis)
4. Selesaikan [decisions-log.md](./decisions-log.md) untuk keputusan yang masih pending
5. Ikuti urutan roadmap di bawah

---

## Roadmap Eksekusi

```
REFERENSI   Sub-bab 01 — Arsitektur & Konteks Proyek
               (baca dulu, tidak ada task)
     |
MINGGU 1    Sub-bab 06 — Temuan & Perbaikan Kode (P0+P1+P2+P3)
            Sub-bab 07A — Quick Wins Infra (scheduler, CI test, prom-client, audit secrets)
     |
MINGGU 2    Sub-bab 02 — Backend Core (scheduler, JWT secret, role hantu, logging)
            Sub-bab 03 — Data Model & Database (migrasi, schema, kolom baru)
            Sub-bab 04 — Alur Data & Sesi (Bab 20 Fase 1: per-device keys)
            Sub-bab 07B — Containerization (Docker, CI build)
     |
MINGGU 3-4  Sub-bab 05 — Frontend: Web & Mobile (Bab 20 Fase 2: biometrik)
            Sub-bab 07C — nginx, backup, staging
     |
BULAN 2-3   Sub-bab 08 — Maturity (Grafana, blue-green, SOP backup)

REFERENSI   Sub-bab 09 — Appendix & Referensi (panduan belajar)
```

---

## Daftar File

| File | Sub-bab | Target | Status |
|------|---------|--------|--------|
| [01-arsitektur-konteks.md](./01-arsitektur-konteks.md) | Arsitektur & Konteks | Referensi | Baca |
| [02-backend-core.md](./02-backend-core.md) | Backend Core | Minggu 2 | Belum |
| [03-data-model-database.md](./03-data-model-database.md) | Data Model & Database | Minggu 2 | Belum |
| [04-alur-data-sesi.md](./04-alur-data-sesi.md) | Alur Data & Sesi | Minggu 2 | Belum |
| [05-frontend-web-mobile.md](./05-frontend-web-mobile.md) | Frontend Web & Mobile | Minggu 3-4 | Belum |
| [06-temuan-perbaikan-kode.md](./06-temuan-perbaikan-kode.md) | Temuan & Perbaikan Kode | Minggu 1 UTAMA | Belum |
| [07-infrastruktur-devops.md](./07-infrastruktur-devops.md) | Infrastruktur & DevOps | Minggu 1 - Bulan 3 | Belum |
| [08-rencana-implementasi-final.md](./08-rencana-implementasi-final.md) | Rencana Final | Bulan 2-3 | Belum |
| [09-appendix-referensi.md](./09-appendix-referensi.md) | Appendix & Referensi | Referensi | Baca |
| [decisions-log.md](./decisions-log.md) | Decisions Log | Selalu update | 3 pending |

---

## Keputusan Pending (Harus Diputuskan Dulu)

🎉 **SEMUA 10 KEPUTUSAN SUDAH DIPUTUSKAN!** (D-01: OTP WA Opsi A, D-06: Scheduler Hapus Total, D-10: sync_queues DROP Opsi A).
Lihat detail lengkap di [decisions-log.md](./decisions-log.md). Tidak ada hambatan keputusan lagi untuk memulai implementasi!