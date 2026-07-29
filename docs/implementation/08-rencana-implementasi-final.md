# Sub-bab 08 — Rencana Implementasi Final

> **Target Minggu**: Bulan 2–3
> **Prasyarat**: Sub-bab 02–07 sudah selesai (atau sebagian besar selesai)
> **Estimasi Total**: 2–3 hari (tersebar)
> **Keputusan diperlukan**: D-06 (⏳ strategi assignment), semua D lain harus sudah diputuskan

---

## Konteks dan Tujuan

Sub-bab ini adalah **fase maturity** — bukan perbaikan bug, tapi peningkatan kualitas jangka panjang:
1. Grafana + Prometheus dashboard lengkap (dari data prom-client Sub-bab 07)
2. Test restore backup rutin bulanan (SOP dari Sub-bab 07)
3. Blue-green deployment (zero-downtime)
4. DB pool tuning + PgBouncer (jika user sudah >200)
5. Keputusan trade-off akhir — semua D harus diputuskan

Referensi analisis: `analisis-master-lazisnu.md` Bab 23 (roadmap), Bab 24 (trade-offs)

---

## Task List

### A — Grafana + Prometheus Dashboard

- [ ] **A1**: Setup Prometheus di VM: scrape endpoint `/metrics` (dari Sub-bab 07 A3) setiap 15 detik
- [ ] **A2**: Install Grafana di VM (atau gunakan Grafana Cloud free tier)
- [ ] **A3**: Import dashboard Node.js standar (dashboard ID: 11159 atau 1860 di grafana.com)
- [ ] **A4**: Buat alert rules:
  - CPU > 80% selama 5 menit → alert Telegram
  - Memory > 85% → alert
  - HTTP error rate > 5% → alert
  - Event loop lag > 100ms → alert
- [ ] **A5**: Verifikasi: dashboard menampilkan request rate, latency, error rate, CPU, memory

**Effort**: 1 hari | **Referensi**: Bab 23 (item 30)

---

### B — SOP Test Restore Backup Bulanan

- [ ] **B1**: Dokumen `docs/SOP-BACKUP-RESTORE.md`:
  - Jadwal: setiap tanggal 1 bulan berjalan
  - Langkah restore ke database staging (dari Sub-bab 07 E3)
  - Verifikasi: row count tabel kritis (`collections`, `assignments`, `users`)
  - Laporan: catat hasil di tabel "Riwayat Restore"
- [ ] **B2**: Lakukan pertama kali setelah backup cron aktif (Sub-bab 07 E2)

**Effort**: setengah hari | **Referensi**: Bab 23 (item 31)

---

### C — Blue-Green Deployment

- [ ] **C1**: Setup nginx dengan 2 upstream: `blue` dan `green`
- [ ] **C2**: Buat script `deploy-blue-green.sh`:
  - Tentukan target (blue atau green)
  - `docker compose -p {target} up -d` di port berbeda
  - Smoke test: `curl /health/ready` ke target
  - Switch nginx upstream ke target baru
  - Teardown instance lama (opsional: pertahankan untuk rollback cepat)
- [ ] **C3**: Test: deploy versi baru tanpa downtime → verifikasi traffic tidak terputus

**Effort**: 1 hari | **Referensi**: Bab 23 (item 29), I-2 (Tahap 3)

---

### D — DB Pool Tuning (jika dibutuhkan)

> Kerjakan HANYA jika sudah ada pengukuran: >200 petugas aktif atau >2 instance app berjalan.

- [ ] **D1**: Verifikasi metrik koneksi dari prom-client (Sub-bab 07 A3) — berapa koneksi aktif?
- [ ] **D2**: Jika sudah mendekati limit (max: 10):
  - Pindah ke Supabase Pooler (transaction mode)
  - Update `database.ts`: tambah `prepare: false` (wajib untuk transaction mode)
  - Update `max` sesuai kebutuhan
- [ ] **D3**: Dokumentasikan baseline dan perubahan

**Effort**: 1 jam (konfigurasi saat dibutuhkan) | **Referensi**: INFRA-21, INFRA-22, I-18

---

### E — Audit Final Keputusan Trade-Off

- [ ] **E1**: Review semua keputusan di `decisions-log.md` — tidak boleh ada yang masih ⏳ Pending
- [ ] **E2**: Review tabel trade-offs di Bab 24 analisis — semua sudah terimplementasi?
  - Scheduler: BullMQ cron + HTTP fallback (D-05)
  - Worker: proses terpisah via Docker (Sub-bab 07 B4)
  - Migrasi: `drizzle-kit migrate` untuk staging/prod (Sub-bab 03 B)
  - CI: lint + typecheck + unit test + integration test (Sub-bab 07 A2)
  - Observability: Sentry + prom-client + health alerting (Sub-bab 07 D)
  - Refresh TTL: 365d (D-02)
  - Access token window: 15 menit — terima (D-07)
  - Redis fallback: fail-closed di prod (D-08)
- [ ] **E3**: Update `analisis-master-lazisnu.md` jika ada bagian yang perlu dikoreksi pasca-implementasi

**Effort**: setengah hari

---

### F — Update Dokumentasi Final

- [ ] **F1**: Update `.agents/rules/00-project-overview.md` — pastikan TTL refresh 365d (D-02) dan arsitektur terkini tercermin
- [ ] **F2**: Update `analisis-master-lazisnu.md` — tandai temuan yang sudah diselesaikan (P0-1, P0-2, P0-3, dll.)
- [ ] **F3**: Pastikan `docs/DEPLOYMENT.md` dan `docs/SECURITY.md` lengkap dan up-to-date

**Effort**: setengah hari | **Referensi**: Bab 20.4 Fase 3

---

## Verifikasi dan Done Criteria

- [ ] Grafana dashboard aktif dan menampilkan data real ✅
- [ ] SOP restore backup terdokumentasi dan diuji sekali ✅
- [ ] Blue-green deployment berhasil tanpa downtime ✅
- [ ] Semua keputusan di decisions-log.md berstatus ✅ Diputuskan ✅
- [ ] `analisis-master-lazisnu.md` diupdate dengan status implementasi ✅
- [ ] `.agents/rules/00-project-overview.md` diupdate ✅

---

## Referensi

- `analisis-master-lazisnu.md`: Bab 20.4 (Fase 3 ops + docs), Bab 23 (roadmap Bulan 2-3), Bab 24 (trade-offs)
- `docs/implementation/decisions-log.md`: semua D
- File baru: `docs/SOP-BACKUP-RESTORE.md`, script `deploy-blue-green.sh`
- File yang dimodifikasi: `docs/DEPLOYMENT.md`, `docs/SECURITY.md`, `.agents/rules/00-project-overview.md`, `analisis-master-lazisnu.md`
