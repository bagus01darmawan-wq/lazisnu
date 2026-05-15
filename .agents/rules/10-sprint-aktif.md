---
trigger: manual
---

# Rule: Sprint Aktif
# Scope: Semua agent — baca ini untuk memahami posisi pengembangan saat ini
# ⚠️ UPDATE file ini setiap kali berganti fase atau sprint

---

## Status Saat Ini

```
FASE AKTIF : Finalization & Learning-Assisted Completion
STATUS     : Project berjalan menuju penyelesaian; fokus pada stabilisasi, review, testing, deploy readiness, dokumentasi, dan peningkatan pemahaman developer.
FOKUS      : Bugfix terarah, konsistensi contract backend-web-mobile, shared-types, audit tech debt, testing strategy, dan learning checkpoint.
```

Catatan untuk agent:
- Jangan menganggap semua modul sudah final hanya karena ada checklist lama yang selesai.
- Verifikasi kondisi aktual codebase sebelum menyimpulkan fitur sudah lengkap.
- Untuk task kecil, jangan memaksa workflow besar. Untuk task lintas modul atau berisiko, ikuti `00-workflow-guarantee.md`.
- Developer adalah pemula yang sedang belajar dari project ini. Sertakan penjelasan singkat dan latihan kecil setelah perubahan penting.

---

## Prioritas Sprint Saat Ini

### P0 — Stabilitas dan Bugfix

- Pastikan project bisa dijalankan, dibuild, dan dilint untuk area yang sedang dikerjakan.
- Perbaiki error yang memblokir login, dashboard, submit collection, sync mobile, laporan, atau build.
- Jangan melakukan refactor besar tanpa alasan kuat dan tanpa rencana test.

### P1 — Contract Consistency

- Pastikan `packages/shared-types` menjadi acuan kontrak lintas app.
- Pastikan perubahan backend response/request dicek dampaknya ke `apps/web` dan `apps/mobile`.
- Hindari duplikasi type yang bisa membuat web/mobile berbeda dari backend.

### P2 — Testing dan Deploy Readiness

- Buat test plan untuk flow kritis.
- Tambahkan regression checklist sebelum merge/deploy.
- Siapkan rollback plan untuk perubahan database, auth, API contract, dan deploy.

### P3 — Learning-Oriented Maintenance

- Setiap bantuan agent harus membantu user memahami minimal satu konsep baru.
- Prioritaskan task kecil yang bisa dikerjakan user sendiri dengan review AI.
- Gunakan skill `.agents/skills/` sesuai konteks: debug, code review, testing, architecture, tech debt, deploy checklist.

---

## Konteks Teknis Aktual yang Harus Diingat

```
Repo      : lazisnu
Monorepo  : PNPM workspace apps/* dan packages/*
Backend   : Fastify + TypeScript + Drizzle ORM + PostgreSQL + Redis/BullMQ + Zod
Web       : Next.js 16 App Router + React 19 + TypeScript + Tailwind CSS 4
Mobile    : React Native Android-first + MMKV + offline-first
Shared    : packages/shared-types untuk kontrak data lintas app
```

---

## Aturan Domain Paling Penting

### Collections Immutable

- `collections` adalah data finansial/audit.
- Jangan UPDATE/DELETE data transaksi untuk mengubah nominal, metode bayar, petugas, atau identitas transaksi.
- Koreksi dilakukan dengan re-submit: INSERT record baru + sequence bertambah + flag latest/versioning yang diizinkan.

### WhatsApp Async

- Notifikasi WhatsApp setelah submit collection harus diproses async melalui queue.
- Kegagalan WhatsApp tidak boleh membatalkan collection yang sudah valid tersimpan.

### Mobile Offline-first

- Mobile fokus Android.
- Gunakan MMKV/offline queue untuk data yang perlu bertahan saat sinyal buruk.
- Sync harus aman terhadap retry dan duplikasi.

---

## Checklist untuk Agent Sebelum Mengubah Kode

```txt
1. Apakah task ini kecil atau lintas modul?
2. File/folder mana yang terdampak?
3. Apakah shared-types perlu dicek?
4. Apakah API contract berubah?
5. Apakah mobile/web/backend ikut terdampak?
6. Apakah ada risiko database atau data finansial?
7. Command test/build/lint apa yang relevan?
8. Learning checkpoint apa yang akan diberikan ke user?
```

---

## Riwayat Penting yang Masih Relevan

```
- Project sudah memakai monorepo PNPM.
- Database menggunakan nama domain Inggris seperti collections, cans, assignments, districts, branches.
- Rule visual dashboard memakai tema Earthy & Premium.
- Agent rules dan skills mulai difokuskan untuk mentor-mode agar developer pemula ikut berkembang.
```

Detail historis lama boleh dijadikan referensi, tetapi jangan dianggap sebagai kondisi final tanpa verifikasi codebase aktual.

---

## Konteks Teknis UI

```css
/* Acuan Warna Utama Dashboard: */
/* Layout Header/Bg : #2C473E (Deep Green) */
/* Card & Sidebar   : #F4F1EA (Warm Beige) */
/* Title & Icon     : #EAD19B (Muted Sand) */
/* Brand Positive   : #1F8243 (Emerald) */
```

---

*Lazisnu Infaq Collection System — rules/10-sprint-aktif.md*
*⚠️ Update file ini setiap berganti sprint/fase*
*Last updated: 2026-05-16*