# Security Runbook — Lazisnu

> Terakhir diperbarui: 2026-07-23

## Rotasi Secret

### JWT Secret

**Dampak:** Semua sesi aktif mati. User harus login ulang.

```bash
# 1. Generate secret baru
openssl rand -hex 32

# 2. Update .env (dual-verify selama 15 menit)
# JWT_ACCESS_SECRET=<secret-lama>
# JWT_ACCESS_SECRET_NEW=<secret-baru>
# JWT_REFRESH_SECRET=<secret-lama>
# JWT_REFRESH_SECRET_NEW=<secret-baru>

# 3. Deploy dengan kedua secret aktif
docker compose up -d --build

# 4. Setelah 15 menit, hapus secret lama dari .env
# JWT_ACCESS_SECRET=<secret-baru>
# JWT_REFRESH_SECRET=<secret-baru>

# 5. Deploy ulang
docker compose up -d --build
```

### Database Password

**Dampak:** Rolling restart. Tidak ada downtime jika dilakukan cepat.

```bash
# 1. Ubah password di Supabase Dashboard
# 2. Update DATABASE_URL di apps/backend/.env
# 3. Restart semua service
docker compose restart backend worker
```

### WhatsApp Token (Fonnte/Meta)

**Dampak:** Notifikasi WA gagal sampai token baru aktif.

```bash
# 1. Generate token baru di dashboard provider
# 2. Update WA_ACCESS_TOKEN di apps/backend/.env
# 3. Restart worker
docker compose restart worker
```

### Cloudflare R2 Keys

**Dampak:** Upload/download file gagal sampai key baru aktif.

```bash
# 1. Generate key baru di Cloudflare Dashboard
# 2. Update R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY di .env
# 3. Restart backend
docker compose restart backend
```

### Internal API Key

**Dampak:** Scheduler HTTP endpoint tidak bisa diakses sampai key di-update di caller.

```bash
# 1. Generate key baru
openssl rand -hex 16

# 2. Update INTERNAL_API_KEY di .env
# 3. Update key di CronJob/system yang memanggil /v1/scheduler/*
# 4. Restart
docker compose restart backend
```

## Jadwal Review Secret

| Interval | Secret |
|----------|--------|
| 30 hari | JWT_ACCESS_SECRET, JWT_REFRESH_SECRET |
| 90 hari | DATABASE_URL password, REDIS_URL password |
| 90 hari | WA_ACCESS_TOKEN, R2 keys |
| 90 hari | INTERNAL_API_KEY, APP_SECRET |
| 180 hari | API keys yang tidak sering berubah |

## Jika Kredensial Bocor

1. **Segera rotate** semua secret yang terdampak (ikuti prosedur di atas)
2. **Cek audit log** (`activity_logs` table) untuk aktivitas mencurigakan
3. **Revoke semua sesi** via `DELETE /v1/auth/sessions`
4. **Informasikan user** untuk login ulang
5. **Cek git history**: `git log --all -- **/.env` — pastikan `.env` tidak pernah ter-commit
6. **Update firewall** jika perlu

## Checklist Keamanan Deploy

- [ ] `.env` tidak ada di git history
- [ ] `CORS_ORIGINS` hanya berisi domain production
- [ ] `INTERNAL_API_KEY` diset
- [ ] Semua secret ≥ 32 karakter
- [ ] `JWT_ACCESS_SECRET` ≠ `JWT_REFRESH_SECRET`
- [ ] SSL aktif di nginx
- [ ] Firewall hanya buka port 22, 80, 443
- [ ] Docker containers tidak berjalan sebagai root
