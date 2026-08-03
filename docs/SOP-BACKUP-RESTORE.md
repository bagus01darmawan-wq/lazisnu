# SOP Backup & Restore — Lazisnu

> Terakhir diperbarui: 2026-07-30 (test restore pertama berhasil — 08-B2 ✅)

## Jadwal

| Item | Detail |
|------|--------|
| Backup otomatis | Setiap hari jam 02:00 WIB (cron) |
| Health-check | Setiap jam pada menit 17; memeriksa marker dan object R2 |
| Test restore | Setiap tanggal 1 bulan berjalan |
| Retensi backup | 30 hari (lokal + R2) |
| Penanggung jawab | Tim DevOps / Admin Kecamatan |

---

## 1. Cara Kerja Backup Otomatis

Script `scripts/backup.sh` dijalankan cron harian:

```bash
0 2 * * * /usr/bin/flock -n /run/lock/lazisnu-backup.lock /usr/bin/timeout --foreground 15m /opt/lazisnu/scripts/backup.sh
```

Alur backup:

1. Cron trigger jam 02:00
2. Script cek flag file `/opt/lazisnu/backup-data/active`
3. Jika flag **tidak ada** → SKIP (backup dinonaktifkan)
4. Jika flag **ada** → `pg_dump` → gzip → upload ke R2
5. Verifikasi ukuran object R2
6. Tulis marker sukses `backup-status/lazisnu-latest.json`
7. Hapus/archive backup lokal sesuai retention

Jika dump, upload, atau verifikasi gagal, script menulis `FAILURE` dengan tahap
kegagalan dan keluar dengan exit code non-zero. Timeout dump adalah 15 menit.

Health-check independen membaca marker sukses dari R2, memeriksa object yang
dirujuk marker, mencocokkan ukuran file, dan memberi status gagal jika backup
terakhir lebih tua dari 26 jam. Webhook opsional memakai variable
`BACKUP_ALERT_WEBHOOK_URL` di `/opt/lazisnu/.env.backup`.

### Cara mengaktifkan/menonaktifkan backup

**Via Dashboard Web** (Admin Kecamatan):
- Buka halaman Overview → card "Backup Control"
- Klik **Aktifkan Backup** / **Nonaktifkan Backup**

**Via SSH** (jika dashboard tidak tersedia):
```bash
# Aktifkan
touch /opt/lazisnu/backup-data/active

# Nonaktifkan
rm /opt/lazisnu/backup-data/active

# Cek status
ls -la /opt/lazisnu/backup-data/active
```

---

## 2. Test Restore Bulanan

### 2.1 Prasyarat

- Database staging sudah tersedia (Supabase project: `ngskcwwjwxsvjrswomkf`)
- File backup terbaru dari R2 atau lokal

### 2.2 Langkah Restore ke Staging

```bash
# 1. SSH ke VM
ssh ubuntu@vm.lazisnu.site

# 2. Download backup terbaru dari R2
cd /opt/lazisnu/backups
# Cari file backup terbaru
ls -t lazisnu_*.sql.gz | head -1

# Jika dari R2 (nama file diketahui):
aws s3 cp "s3://$R2_BUCKET_NAME/backups/lazisnu_20260701_020001.sql.gz" \
  restore_test.sql.gz \
  --endpoint-url "https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com"

# 3. Restore ke database staging
# Dump menggunakan DIRECT_URL (session pooler, port 5432)
# pg_dump versi 17 diperlukan karena Supabase PG 17.x
# Flags wajib:
#   --schema=public  : hanya public schema (bukan internal Supabase)
#   --no-owner       : tidak dump owner (postgres user staging berbeda)
#   --no-acl         : tidak dump GRANT/REVOKE
#   --clean          : tambah DROP TABLE IF EXISTS sebelum CREATE (restore idempotent)
#   --if-exists      : DROP IF EXISTS, tidak error jika tabel belum ada
gunzip -c restore_test.sql.gz | \
  psql "$DIRECT_URL_STAGING" 2>&1 | tee restore_$(date +%Y%m%d).log

# 4. Verifikasi
psql "$DIRECT_URL_STAGING" -c "
SELECT 'collections' AS tabel, COUNT(*) FROM collections
UNION ALL
SELECT 'assignments', COUNT(*) FROM assignments
UNION ALL
SELECT 'users', COUNT(*) FROM users
UNION ALL
SELECT 'cans', COUNT(*) FROM cans
UNION ALL
SELECT 'user_sessions', COUNT(*) FROM user_sessions;
"
```

### 2.3 Verifikasi Wajib

| Tabel | Yang Dicek | Ekspektasi |
|-------|-----------|------------|
| `collections` | Row count | Sama dengan production |
| `assignments` | Row count | Sama dengan production |
| `users` | Row count | Sama dengan production |
| `cans` | Row count | Sama dengan production |
| `user_sessions` | Tidak kosong | > 0 |

### 2.4 Tanda Tangan Laporan

Setiap test restore wajib dicatat:

```
Tanggal restore : __________________
Nama backup     : lazisnu_YYYYMMDD_HHMMSS.sql.gz
Ukuran backup   : __________________
Restore ke      : Staging (ngskcwwjwxsvjrswomkf)

Verifikasi:
  collections   : ______ baris (production: ______)
  assignments   : ______ baris (production: ______)
  users         : ______ baris (production: ______)
  cans          : ______ baris (production: ______)
  user_sessions : ______ baris

Status          : [ ] SUKSES  [ ] GAGAL
Catatan         : __________________
Penanggung jawab: __________________
```

---

## 3. Restore Darurat ke Production

> Hanya dilakukan jika database production rusak/hilang.

```bash
# 1. Stop semua service TULIS
docker compose stop backend worker

# 2. Restore dari backup terbaru
gunzip -c /opt/lazisnu/backups/lazisnu_TERBARU.sql.gz | \
  psql "$DIRECT_URL" 2>&1 | tee emergency_restore.log

# 3. Start service kembali
docker compose start backend worker

# 4. Smoke test
curl -sf https://api.lazisnu.site/health/ready && echo "OK" || echo "FAIL"
```

**Peringatan:** Restore darurat akan **menimpa semua data production** sejak backup terakhir. Data yang masuk setelah backup terakhir akan hilang.

---

## 4. Troubleshooting

### Backup gagal: "backup flag not active"

Backup memang dinonaktifkan (normal). Aktifkan via dashboard atau `touch /opt/lazisnu/backup-data/active`.

### Backup gagal: "pg_dump: command not found"

```bash
sudo apt install -y postgresql-client-17
```

### Restore gagal: "ERROR: database is being accessed by other users"

Stop semua service sebelum restore:
```bash
docker compose stop backend worker
# ... restore ...
docker compose start backend worker
```

### Backup tidak ditemukan di R2

Cek kredensial:
```bash
cat /opt/lazisnu/.env.backup | grep R2
```

---

## 5. Riwayat Test Restore

| Tanggal | Backup | Ukuran | Status | Catatan |
|---------|--------|--------|:------:|---------|
| 2026-07-30 | lazisnu_20260730_003554.sql.gz | 80K | ✅ SUKSES | Test restore pertama (08-B2). collections=42, assignments=79, users=10, cans=76, user_sessions=252. Fix: tambah --clean --if-exists ke pg_dump |

---

## 6. Checklist Bulanan

- [ ] Cron backup berjalan (cek log: `tail /opt/lazisnu/backups/backup.log`)
- [ ] Backup terbaru ada di R2 (cek dashboard Cloudflare)
- [ ] Test restore ke staging berhasil
- [ ] Row count tabel kritis cocok antara production & staging
- [ ] Laporan restore ditandatangani
- [ ] Backup >30 hari terhapus otomatis
