# Plan: Sinkronisasi VM Production ↔ Repo Git

## Summary

VM production di `43.128.98.52` ketinggalan 1 commit dari repo (`541bdd7` vs `c7a4440`). Ada 3 file yang statusnya tidak sinkron: `docker-compose.yml` (modified), `nginx/nginx.conf` (modified), `nginx/certbot/` (untracked). Plan ini akan menyelaraskan repo dengan konfigurasi VM yang sudah terbukti berjalan, lalu sync VM.

---

## Current State Analysis

### Repo (HEAD: `c7a4440`)

| File | Status |
|------|--------|
| `nginx/nginx.conf` | Sudah punya `/v1/` di SSL API + SSL Web block ✅ |
| `docker-compose.yml` | `NEXT_PUBLIC_API_URL=https://api.lazisnu.site` ⚠️ |
| `.gitignore` | Belum ignore `nginx/certbot/` ❌ |

### VM (HEAD: `541bdd7`)

| File | Status |
|------|--------|
| `nginx/nginx.conf` | `M` (modified — punya `/v1/`, ditulis via heredoc) |
| `docker-compose.yml` | `M` (modified — `NEXT_PUBLIC_API_URL=http://backend:3001` via `sed`) |
| `nginx/certbot/` | `??` (untracked — folder cert Let's Encrypt) |

### Discrepancy

| Item | Repo | VM | Keputusan |
|------|------|-----|-----------|
| `NEXT_PUBLIC_API_URL` | `https://api.lazisnu.site` | `http://backend:3001` | Pakai VM: internal Docker network lebih cepat, tidak perlu SSL hop |
| `nginx/nginx.conf` | Sama | Sama | Tidak ada konflik konten, hanya versioning |
| `nginx/certbot/` | Tidak ada | Ada (untracked) | Tambah ke `.gitignore` |

### Kenapa `http://backend:3001` Lebih Baik?

- Reports page menggunakan server-side fetch (Next.js Server Component)
- Fetch terjadi **di dalam** container web, bukan di browser client
- `http://backend:3001` langsung resolve via Docker internal DNS → lebih cepat, 0ms latency ke internet
- `https://api.lazisnu.site` akan keluar Docker network → ke internet → masuk lagi via nginx (unnecessary roundtrip)

---

## Proposed Changes

### 1. Fix `docker-compose.yml` — ganti `NEXT_PUBLIC_API_URL` ke internal URL

**File:** `c:\Users\user\Documents\lazisnu\docker-compose.yml`  
**Line:** 45  
**Change:**
```yaml
# Before:
- NEXT_PUBLIC_API_URL=https://api.lazisnu.site

# After:
- NEXT_PUBLIC_API_URL=http://backend:3001
```

**Why:** Menyamakan dengan VM. Server-side Next.js fetch data via Docker internal network, bukan via internet publik.

### 2. Add `nginx/certbot/` to `.gitignore`

**File:** `c:\Users\user\Documents\lazisnu\.gitignore`  
**Change:** Tambah baris baru:
```
# SSL certificates (generated at runtime by certbot, NOT for git)
nginx/certbot/
```

**Why:** Folder certbot berisi sertifikat SSL yang di-generate runtime oleh Let's Encrypt di VM. Tidak boleh di-commit ke repo (security risk, dan akan berbeda per environment).

### 3. Commit & push

```
git add docker-compose.yml .gitignore
git commit -m "chore: sync NEXT_PUBLIC_API_URL ke internal + gitignore nginx/certbot"
git push origin feature/sync-sprint-cleanup
```

### 4. Sync VM

Setelah repo updated, jalankan di VM:

```bash
cd /opt/lazisnu && \
git checkout -- docker-compose.yml nginx/nginx.conf && \
git pull origin feature/sync-sprint-cleanup && \
echo "=== Verifikasi ===" && \
git log --oneline -3 && \
git status --short
```

**Kenapa `git checkout --` dulu?** Ini membuang modifikasi lokal (yang kontennya sudah ada di repo terbaru), sehingga `git pull` tidak conflict.

**Expected output:**
- `git log` HEAD = commit terbaru (setelah `c7a4440` + commit baru)
- `git status --short` = hanya menampilkan `?? nginx/certbot/` (karena sudah di-gitignore, seharusnya hilang setelah `git pull`)

---

## Verification Steps

1. **Repo:** `git status --short` → kosong (clean)
2. **VM:** `git status --short` → kosong (kecuali certbot jika `.gitignore` belum efektif — perlu restart shell atau `git rm --cached` jika sebelumnya tertrack)
3. **VM:** `docker compose restart nginx` → pastikan nginx reload config terbaru
4. **Browser:** Buka `https://dashboard.lazisnu.site` → semua halaman (Overview, Reports, dll) tetap berfungsi

---

## Assumptions & Decisions

- `http://backend:3001` adalah URL yang benar untuk server-side fetch di dalam Docker network
- `nginx/certbot/` TIDAK boleh di-commit ke repo (berisi private key SSL)
- Tidak perlu restart container selain nginx (perubahan docker-compose.yml hanya untuk reference/deploy berikutnya)
- VM tidak ada perubahan lain selain 3 file yang disebutkan
