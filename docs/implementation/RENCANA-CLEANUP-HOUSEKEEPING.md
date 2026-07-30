# Rencana Implementasi — Cleanup & Housekeeping VM

> Dibuat: 2026-07-30 | Status: **RENCANA (belum dieksekusi)** | Sasaran: disk 94% → <70%

## Latar Belakang

Audit VM `lazisnu` per 2026-07-30 menunjukkan disk `/` sudah **94%** (18G dari 20G, sisa 1.3G). Jika tren berlanjut, dalam 1-2 bulan ke depan VM akan penuh dan service bisa crash. Backlog Sesi 31 #4 (housekeeping) dan #5 (disk cleanup) digabung jadi satu rencana karena saling terkait.

### Temuan Audit

| # | Item | Size | Risiko |
|---|------|------|--------|
| 1 | Docker build cache | 4.106GB | 🟢 Aman di-prune |
| 2 | Docker images unused (18 image) | 3.857GB | 🟡 Risiko rollback capability |
| 3 | Docker images dangling | ~100MB | 🟢 Aman di-prune |
| 4 | `/var/log/journal` | 193M | 🟢 Aman di-vacuum |
| 5 | `/opt/lazisnu/backups/` placeholder 20B (7 file) | ~140B | 🟢 Hapus saja |
| 6 | `/opt/lazisnu/scratch/` (testing artifact) | ~1K | 🟢 Hapus |
| 7 | `/opt/lazisnu/nopeAGENTS.md` (typo) | 8K | 🟢 Hapus |
| 8 | `/opt/lazisnu/penggalan riwayat.txt` (Codex log) | 52K | 🟢 Hapus |
| 9 | `/opt/lazisnu/.env.backup*` (kredensial) | ~1.5K | 🟡 Pindah ke folder aman |
| 10 | Redis warning `vm.overcommit_memory` | — | 🟢 Tambah sysctl |
| 11 | `scripts/backup.sh` belum ada retention eksplisit | — | 🟢 Tambah retensi |

### Target Reclaim

| Skenario | Reclaim | Disk Akhir | % |
|----------|---------|-----------|---|
| **Konservatif** (tanpa #2) | ~4.3GB | 13.7G | 68% ✅ |
| **Agresif** (dengan #2) | ~8.1GB | 9.9G | 50% ✅ |

## Prinsip Pelaksanaan

1. **Backup dulu, hapus kemudian** — untuk file yang belum jelas statusnya, archive ke `tmp/` dulu bukan langsung `rm`
2. **Idempotent** — semua script/skema bisa di-run ulang tanpa efek samping
3. **Bisa di-interleave** — setiap phase independen, bisa dijadwalkan terpisah
4. **Tidak ganggu runtime** — semua dilakukan di luar window production sibuk
5. **Verifiable** — setiap phase ada `verification` command

---

## Phase Plan

| Phase | Target | Estimasi Reclaim | Risiko | Bisa di-skip? |
|-------|--------|------------------|--------|---------------|
| **Phase 1** | Safe cleanup (log, scratch, sysctl) | ~200MB | 🟢 Rendah | Tidak |
| **Phase 2** | Docker build cache + dangling | ~4.2GB | 🟢 Rendah | Tidak |
| **Phase 3** | Docker unused images (blue/green lama) | ~3.8GB | 🟡 Sedang | Ya, optional |
| **Phase 4** | Backup script retention | ~10MB/bulan | 🟢 Rendah | Tidak |
| **Phase 5** | Move `.env.backup` ke folder khusus | 0 | 🟢 Rendah | Tidak |
| **Phase 6** | SOP Housekeeping | 0 | 🟢 Rendah | Tidak |

**Rekomendasi urutan eksekusi**: 1 → 2 → 5 → 4 → 3 (opsional) → 6

---

## Phase 1 — Safe Cleanup (Reclaim ~200MB, Risiko Rendah)

### 1.1 Vacuum journal systemd

```bash
# Cek ukuran sebelum
sudo journalctl --disk-usage

# Vacuum ke max 50M
sudo journalctl --vacuum-size=50M

# Verifikasi
sudo journalctl --disk-usage
```

**Risiko**: Tidak ada. Hanya menghapus journal entry lama.
**Rollback**: Tidak perlu.

### 1.2 Hapus testing artifacts di `/opt/lazisnu`

```bash
# Backup dulu ke /tmp (just in case)
mkdir -p /tmp/cleanup-2026-07-30
cp -r /opt/lazisnu/scratch /tmp/cleanup-2026-07-30/
cp /opt/lazisnu/nopeAGENTS.md /tmp/cleanup-2026-07-30/
cp "/opt/lazisnu/penggalan riwayat.txt" /tmp/cleanup-2026-07-30/

# Hapus
rm -rf /opt/lazisnu/scratch
rm -f /opt/lazisnu/nopeAGENTS.md
rm -f "/opt/lazisnu/penggalan riwayat.txt"

# Verifikasi
ls -la /opt/lazisnu/ | grep -E '(scratch|nopeAGENTS|penggalan)'
# Expected: no output
```

**Risiko**: Rendah. File sudah di-backup ke `/tmp`. Jika ternyata perlu, ada di `/tmp/cleanup-2026-07-30/`.

### 1.3 Set `vm.overcommit_memory = 1`

```bash
# Backup sysctl.conf
sudo cp /etc/sysctl.conf /etc/sysctl.conf.bak-2026-07-30

# Tambah line (jika belum ada)
if ! grep -q "vm.overcommit_memory" /etc/sysctl.conf; then
  echo "vm.overcommit_memory = 1" | sudo tee -a /etc/sysctl.conf
fi

# Apply tanpa reboot
sudo sysctl -w vm.overcommit_memory=1

# Verifikasi
cat /proc/sys/vm/overcommit_memory
# Expected: 1
```

**Risiko**: Tidak ada. Hanya sysctl vm.
**Alasan**: Redis log menampilkan warning, ini best practice untuk redis.

### 1.4 apt cleanup

```bash
# Hapus package yang tidak dipakai
sudo apt autoremove --purge -y

# Bersihkan cache .deb
sudo apt autoclean

# Verifikasi
du -sh /var/cache/apt/
```

**Risiko**: Rendah. Hanya hapus package yang tidak ada dependensi aktif.

### 1.5 Hapus file backup placeholder 20-byte

```bash
# Hapus file backup kosong (test gagal sebelum fix --schema=public)
cd /opt/lazisnu/backups
for f in lazisnu_20260727_*.sql.gz; do
  if [ $(stat -c%s "$f") -lt 1000 ]; then
    echo "Removing placeholder: $f ($(stat -c%s $f) bytes)"
    rm -f "$f"
  fi
done

# Verifikasi
ls -la /opt/lazisnu/backups/
# Expected: hanya file backup valid (>1KB)
```

**Risiko**: Tidak ada. File 20-byte adalah artifact test yang gagal di Sesi 30 awal (sebelum fix `pg_dump --schema=public`).

### Phase 1 Verification

```bash
df -h /
# Expected: lebih banyak available dari sebelumnya
```

---

## Phase 2 — Docker Build Cache + Dangling (Reclaim ~4.2GB, Risiko Rendah)

### 2.1 Prune build cache

```bash
# Lihat dulu
sudo docker builder du

# Prune semua build cache
sudo docker builder prune -af

# Verifikasi
sudo docker system df
```

**Risiko**: Rendah. Build cache adalah cache, bisa di-rebuild. Next build mungkin sedikit lebih lambat (pull layer dari GHCR).
**Estimasi**: 4.1GB reclaim.

### 2.2 Prune dangling images

```bash
# Lihat dangling
sudo docker images -f "dangling=true"

# Prune
sudo docker image prune -f

# Verifikasi
sudo docker images -f "dangling=true"
# Expected: no output
```

**Risiko**: Tidak ada. Dangling = image tanpa tag, tidak dipakai siapa pun.

### Phase 2 Verification

```bash
# Build image baru untuk test (pastikan masih bisa build)
cd /opt/lazisnu
sudo docker build -t test-build-check -f apps/backend/Dockerfile . --no-cache
# Tunggu sukses, lalu hapus test image
sudo docker rmi test-build-check
```

---

## Phase 3 — Docker Unused Images (Reclaim ~3.8GB, Risiko Sedang) — **OPSIONAL**

> ⚠️ **Skip phase ini jika rollback capability penting.** Image blue/green lama akan terhapus, butuh pull ulang dari GHCR untuk rollback (~5-10 menit downtime tambahan).

### 3.1 Lihat image yang akan di-prune

```bash
# Image yang tidak dipakai container aktif manapun
sudo docker image prune -af --dry-run
```

**Output diharapkan**: daftar image seperti `ghcr.io/.../backend:<old-sha>`, `lazisnu-backend:<old-tag>`, dll.

### 3.2 Prune dengan filter umur (lebih aman)

```bash
# Hanya prune image yang dibuat >7 hari lalu
sudo docker image prune -af --filter "until=168h"
```

**Risiko**: Rollback ke image <7 hari tetap aman. Image lama (>7 hari) akan terhapus.

### 3.3 Verifikasi image penting masih ada

```bash
# Image yang sedang dipakai container
sudo docker ps --format "{{.Image}}" | sort -u
# Expected: list image yang running
```

**Rollback jika salah**: Pull dari GHCR
```bash
sudo docker pull ghcr.io/bagus01darmawan-wq/lazisnu/backend:<previous-sha>
```

### Phase 3 Verification

```bash
df -h /
# Expected: turun signifikan
sudo docker images | wc -l
# Expected: hanya image aktif + dangling
```

---

## Phase 4 — Backup Retention di `scripts/backup.sh` (Risiko Rendah)

Modifikasi `scripts/backup.sh` untuk auto-cleanup backup placeholder dan tambah retention eksplisit.

### 4.1 Modifikasi script

Tambah block di akhir `scripts/backup.sh` (sebelum exit):

```bash
# --- Cleanup ---
# Hapus file backup placeholder (test gagal <1KB)
find "$BACKUP_DIR" -name "*.sql.gz" -size -1k -mmin +60 -delete

# Retention policy:
# - Keep 7 backup harian terakhir
# - Keep 4 backup mingguan terakhir (backup hari Minggu)
# - Keep 3 backup bulanan terakhir (backup tanggal 1)
# File backup yang lebih lama dari 30 hari dihapus
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +30 -delete

echo "$(date -Iseconds) Cleanup: placeholder + retention done" >> "$BACKUP_LOG"
```

### 4.2 Test logic (tanpa execute)

```bash
# Dry-run: lihat apa yang akan dihapus
find /opt/lazisnu/backups -name "*.sql.gz" -size -1k -mmin +60
find /opt/lazisnu/backups -name "*.sql.gz" -mtime +30
```

### 4.3 Commit & deploy

```bash
git add scripts/backup.sh
git commit -m "feat(backup): tambah retention policy + auto-cleanup placeholder"
git push origin main
# CI auto deploy-staging
```

---

## Phase 5 — Move `.env.backup` ke Folder Khusus (Risiko Rendah)

### 5.1 Buat folder khusus dengan permission ketat

```bash
sudo mkdir -p /opt/lazisnu/secrets
sudo chown ubuntu:ubuntu /opt/lazisnu/secrets
sudo chmod 700 /opt/lazisnu/secrets
```

### 5.2 Pindahkan file

```bash
sudo mv /opt/lazisnu/.env.backup /opt/lazisnu/secrets/env.backup-2026-07-27
sudo mv /opt/lazisnu/apps/backend/.env.backup-2026-07-24 /opt/lazisnu/secrets/
sudo chown ubuntu:ubuntu /opt/lazisnu/secrets/*
sudo chmod 600 /opt/lazisnu/secrets/*
```

### 5.3 Verifikasi

```bash
ls -la /opt/lazisnu/secrets/
# Expected: 2 file, mode 600, owner ubuntu
ls -la /opt/lazisnu/.env.backup /opt/lazisnu/apps/backend/.env.backup-2026-07-24 2>&1
# Expected: 'No such file or directory'
```

**Risiko**: Tidak ada. Hanya move file. `.env` aktif tetap di `apps/backend/.env`.
**Alasan**: Konsolidasi secret ke satu folder dengan permission 600, sesuai best practice.

### 5.4 Update `.gitignore` (di repo)

```gitignore
# Secrets (jangan commit)
.env
.env.backup
apps/backend/.env.backup-*
/opt/lazisnu/secrets/
```

---

## Phase 6 — SOP Housekeeping (Risiko Rendah, No Disk Impact)

Buat `docs/SOP-HOUSEKEEPING-VM.md` dengan checklist bulanan.

### Outline SOP

```markdown
# SOP Housekeeping VM — Lazisnu

> Jadwal: setiap awal bulan | PIC: Tim DevOps

## Checklist Bulanan
- [ ] Disk usage cek `df -h /` (target <80%)
- [ ] Docker image dangling: `docker image prune -f`
- [ ] Docker build cache: `docker builder prune -af`
- [ ] Journal vacuum: `sudo journalctl --vacuum-size=50M`
- [ ] Backup file cek: `ls -la /opt/lazisnu/backups/`
- [ ] apt cleanup: `sudo apt autoremove --purge && sudo apt autoclean`

## Checklist Kuartalan
- [ ] Phase 3 (unused image prune dengan filter 30 hari)
- [ ] Review retention policy backup
- [ ] Review /opt/lazisnu untuk file unreferenced

## Insiden & Recovery
- Lihat `RENCANA-CLEANUP-HOUSEKEEPING.md` untuk rollback tiap phase
```

---

## Pre-Flight Checklist (Sebelum Mulai)

- [ ] Backup VM snapshot (jika provider support) — **WAJIB untuk Phase 3**
- [ ] Cek service up: `curl -sf https://api.lazisnu.site/health/ready` → 200
- [ ] Catat `df -h /` sebelum
- [ ] Catat `sudo docker system df` sebelum
- [ ] Pastikan tidak ada deployment berjalan (cek CI di GitHub)

## Post-Execution Verification

```bash
# 1. Disk usage turun
df -h /

# 2. Service masih hidup
curl -sf https://api.lazisnu.site/health/ready
curl -sf https://dashboard.lazisnu.site
curl -sf http://127.0.0.1:9090/-/ready  # Prometheus
curl -sf http://127.0.0.1:3030/api/health  # Grafana

# 3. Container semua up
sudo docker ps

# 4. Prometheus targets masih up
curl -s http://127.0.0.1:9090/api/v1/targets | python3 -c "import sys, json; d=json.load(sys.stdin); [print(t['labels'].get('job'), t['health']) for t in d['data']['activeTargets']]"
```

---

## Rollback Plan per Phase

| Phase | Rollback | Effort |
|-------|----------|--------|
| 1.1 Journal | `sudo journalctl --vacuum-size=200M` (restore) | 1 menit |
| 1.2 Scratch/nopeAGENTS | `cp -r /tmp/cleanup-2026-07-30/* /opt/lazisnu/` | 1 menit |
| 1.3 Sysctl | `sudo sed -i '/overcommit_memory/d' /etc/sysctl.conf && sudo sysctl -w vm.overcommit_memory=0` | 1 menit |
| 1.4 apt | `sudo apt install <package>` per package | 5-10 menit |
| 1.5 Backup placeholder | Backup sudah dihapus, tidak ada di tempat lain (file test gagal, tidak ada recovery point) | ❌ Tidak bisa |
| 2.1 Build cache | Otomatis rebuild next build | 0 (tidak perlu) |
| 2.2 Dangling | Otomatis re-pull | 0 (tidak perlu) |
| 3 Unused image | `docker pull <image>:<tag>` per image | 5-10 menit/image |
| 4 Retention | Manual restore dari R2 (off-site backup) | 5 menit |
| 5 Move env | `mv /opt/lazisnu/secrets/* /opt/lazisnu/` | 1 menit |

---

## File yang Akan Disentuh

| File | Aksi | Phase |
|------|------|-------|
| `/opt/lazisnu/scratch/` | hapus | 1.2 |
| `/opt/lazisnu/nopeAGENTS.md` | hapus | 1.2 |
| `/opt/lazisnu/penggalan riwayat.txt` | hapus | 1.2 |
| `/etc/sysctl.conf` | tambah `vm.overcommit_memory = 1` | 1.3 |
| `/opt/lazisnu/backups/lazisnu_20260727_*.sql.gz` (placeholder) | hapus | 1.5 |
| `/opt/lazisnu/.env.backup` | pindah ke `secrets/` | 5 |
| `/opt/lazisnu/apps/backend/.env.backup-2026-07-24` | pindah ke `secrets/` | 5 |
| `/opt/lazisnu/secrets/` (BARU) | buat folder 700 | 5 |
| `scripts/backup.sh` | tambah retention block | 4 |
| `.gitignore` | tambah `/opt/lazisnu/secrets/` | 5 |
| `docs/SOP-HOUSEKEEPING-VM.md` (BARU) | buat SOP | 6 |

---

## Backlog Update Setelah Eksekusi

Setelah semua phase selesai, update:
- ✅ **Sesi 31 #4 housekeeping VM**: SELESAI
- ✅ **Sesi 31 #5 disk cleanup**: SELESAI
- Sisa backlog: #3 password admin Grafana (low), #6 mount bind-file prosedur, TD-01, TD-02, TD-03 (low)

---

*Rencana ini akan dieksekusi menyusul (menurut keputusan user 2026-07-30). Phase 1+2+4+5+6 adalah default. Phase 3 opsional, butuh persetujuan ulang saat eksekusi.*
