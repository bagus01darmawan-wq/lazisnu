---
trigger: model_decision
---

# Rule: Sprint Aktif
# Scope: Semua agent — baca ini untuk tahu SEDANG ADA DI MANA dalam pengembangan
# ⚠️ UPDATE file ini setiap kali berganti fase atau sprint

---

## Status Saat Ini

```
FASE AKTIF : FASE 6 — Sprint 2 Web Dashboard & Technical Debt Refactor
MINGGU     : 11–12
STATUS     : 🔄 Refactor Pilar Inti & Persiapan Next.js Dashboard
```

---

## Progres & Refactor Audit (April 2026)

```
Pilar 1: Immortality & Immutability
  [x] Tabel 'collections' menggunakan tipe data BIGINT (nominal)
  [x] PostgreSQL RULES (disable_delete, disable_update_nominal) aktif
  [ ] Endpoint /resubmit (Sequence++) - PRIORITAS LANJUTAN

Pilar 2: WhatsApp & Reliability
  [ ] BullMQ + Redis integration - PRIORITAS 2
  [ ] WhatsApp Async Worker - PRIORITAS 2

Pilar 3: Audit Trail
  [ ] Global Audit Logger middleware - PRIORITAS 3
```

---

## Konteks untuk Agent

```
Codebase saat ini berada di FASE 6 (Web Dashboard).
Backend (Fastify + Drizzle) sudah berjalan di port 3000.
Database sudah di-reset dan di-migrate dengan tipe data BIGINT untuk nominal di semua tabel (collections, cans, summaries).
Immutability Rule untuk 'collections' sudah aktif di level database.

Status Service:
- PostgreSQL: Aktif
- Redis: Standby (Belum digunakan BullMQ)
- WhatsApp: Mock/Dev Mode (Sync)
```

---

*Lazisnu Infaq Collection System — rules/10-sprint-aktif.md*
*⚠️ Update file ini setiap berganti sprint/fase*
