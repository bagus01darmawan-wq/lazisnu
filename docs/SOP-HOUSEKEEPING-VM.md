# SOP Housekeeping VM — Lazisnu

> Jadwal: setiap awal bulan | PIC: Tim DevOps
> Terakhir diperbarui: 2026-08-01 (Phase 6 RENCANA-CLEANUP-HOUSEKEEPING)

## Checklist Bulanan

- [ ] Disk usage cek `df -h /` (target <80%)
- [ ] Docker image dangling: `docker image prune -f`
- [ ] Docker build cache: `docker builder prune -af`
- [ ] Journal vacuum: `sudo journalctl --vacuum-size=50M`
- [ ] Backup file cek: `ls -la /opt/lazisnu/backups/`
- [ ] apt cleanup: `sudo apt autoremove --purge --dry-run` dulu, review list, baru eksekusi
- [ ] Inspect `/opt/lazisnu/` untuk file unreferenced:
      `ls -la /opt/lazisnu/ | grep -vE 'docs|app|backups|redis|prom|grafana|nginx|secrets'`
      **JANGAN hapus file panduan (AGENTS.md, nopeAGENTS.md, README*, CHANGELOG*, LICENSE)**

## Checklist Kuartalan

- [ ] Phase 3 (unused image prune dengan filter 30 hari / 720h) — **OPSIONAL, butuh persetujuan user**
- [ ] Review retention policy backup (90 hari + R2 archive)
- [ ] Review `/opt/lazisnu/secrets/` permission (chmod 600, owner ubuntu)
- [ ] Test rclone/aws connectivity ke R2

## Insiden & Recovery

- Lihat `RENCANA-CLEANUP-HOUSEKEEPING.md` untuk rollback tiap phase
- **JANGAN PERNAH** hapus file di `/opt/lazisnu/` tanpa cek isinya dulu
- **JANGAN PERNAH** hapus folder `/opt/lazisnu/secrets/` (recovery credential)
- **JANGAN hapus** `/opt/lazisnu/nopeAGENTS.md` (panduan agent, bukan testing artifact)
- `.env.backup` di `/opt/lazisnu/` adalah **SYMLINK** ke `secrets/env.backup-2026-07-27` — jangan dihapus, backup.sh & backup-kuma.sh source dari sana

## Referensi Eksekusi (2026-08-01)

| Phase | Status | Catatan |
|-------|--------|---------|
| 1 (safe cleanup) | ✅ Selesai | journal 224M→50M (freed 152M), scratch & penggalan dihapus (backup di /tmp/cleanup-2026-07-30), sysctl overcommit=1, apt dry-run 0 package, placeholder dihapus |
| 2 (build cache+dangling) | ✅ Selesai (Sesi 30) | reclaim 7.2GB, disk 96%→81% |
| 3 (unused images) | ⏸️ **SKIP** | Keputusan user 2026-08-01: tidak ingin menghapus image |
| 4 (backup retention) | ✅ Selesai | `scripts/backup.sh`: KEEP_DAYS 30→90, archive ke R2 prefix `archive/` sebelum hapus lokal (pakai `aws s3`, rclone tidak ada) |
| 5 (move env) | ✅ Selesai | `.env.backup` + `.env.backup-2026-07-24` → `secrets/` (chmod 600/700), backup R2 dulu, symlink `/opt/lazisnu/.env.backup` dibuat agar script tetap jalan |
| 6 (SOP) | ✅ Selesai | File ini |
