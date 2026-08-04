# MIGRATION-VM.md — Runbook Pindah Penyedia / VM Baru (Plug-and-Play)

> Tujuan: migrasi server ke penyedia lain secepat & seaman mungkin.
> Prinsip: **repo = git** (ter-pull), **data = R2** (backup + export bundle), **credential = R2 secrets/**.
> Waktu estimasi: 2-4 jam (tergantung DNS propagation).

---

## 0. PRASYARAT KRITIS (sebelum mulai)

- [ ] **Kredensial EAS/Expo** (email + password + kode 2FA/backup codes) disimpan di password manager.
      Keystore APK production ada di server EAS — tanpa akses akun ini, **tidak bisa rilis update app**.
      (APK signing TIDAK ikut migrasi VM — tidak terpengaruh.)
- [ ] Akun Supabase (2 project), Cloudflare R2, Rollbar, Hookdeck, Fonnte, Uptime Kuma — akses login tersimpan.
- [ ] **SSH key `lazisnu_vm`** ada di laptop (sudah ada di `~/.ssh/`).
- [ ] Jalankan export bundle (langkah 1) dan verifikasi objeknya ada di R2.

---

## 1. PERSIAPAN DI VM LAMA

```bash
# Bundle artefak non-git → R2 (secrets, cron, letsencrypt, sshd, sysctl, grafana/prometheus data)
sudo bash /opt/lazisnu/scripts/vm-migration-export.sh
# → catat r2_key dari output (mis. migrasi/lazisnu-vm-export-20260805_040000.tar.gz)
# verifikasi
aws s3 ls s3://lazisnu-backups/migrasi/ --endpoint-url https://<ACCOUNT_ID>.r2.cloudflarestorage.com
```

Opsional: backup final DB (`sudo bash /opt/lazisnu/scripts/backup.sh`) supaya arsip terakhir sedekat mungkin dengan waktu cutover.

---

## 2. PROVISION VM BARU (penyedia baru)

1. Buat VM Ubuntu **22.04/24.04 LTS**, minimal **2 CPU / 4 GB RAM / 20 GB disk** (referensi VM lama: 3.6GB RAM, disk 76% terpakai di 20GB).
2. **Security group / firewall**: buka port **22, 80, 443** (SSH/HTTP/HTTPS). UFW di VM lama nonaktif — firewall di tingkat provider.
3. SSH key user:
   ```bash
   # dari laptop
   ssh-copy-id -i ~/.ssh/lazisnu_vm.pub ubuntu@<IP-BARU>
   ```
4. Install Docker + compose:
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker ubuntu
   # restart session, lalu:
   docker compose version
   ```
5. (Opsional) set hostname & timezone:
   ```bash
   sudo timedatectl set-timezone Asia/Jakarta   # atau pertahankan Asia/Shanghai (dampak: jam cron)
   ```

---

## 3. DEPLOY APLIKASI

```bash
cd /opt
sudo mkdir -p lazisnu && sudo chown ubuntu:ubuntu lazisnu
cd lazisnu
git clone git@github.com:bagus01darmawan-wq/lazisnu.git .   # atau https
```

**Restore bundle migrasi:**
```bash
# download dari R2 (perlu creds R2 — ambil dari laptop/notes):
aws s3 cp s3://lazisnu-backups/migrasi/<r2_key> - --endpoint-url https://<ACCOUNT_ID>.r2.cloudflarestorage.com | tar -xzf - -C /opt/lazisnu --strip-components=1
# isi yang ter-extract: secrets/, cron/, letsencrypt/, ssh/, sysctl/, data/
sudo chown -R root:root /opt/lazisnu/secrets
sudo chmod 700 /opt/lazisnu/secrets && sudo chmod 600 /opt/lazisnu/secrets/*
```

**Restore config sistem (opsional, sesuai kebutuhan):**
```bash
sudo cp cron/root-crontab /tmp/cron.new && sudo crontab /tmp/cron.new     # root crontab
sudo cp cron/lazisnu-backup-health /etc/cron.d/                            # healthcheck cron
sudo cp sysctl/sysctl.conf /etc/sysctl.conf && sudo sysctl --system        # overcommit_memory=1 dll
sudo cp -a letsencrypt /opt/lazisnu/nginx/                                 # sertifikat (dari bundle; nginx mount /opt/lazisnu/nginx/certbot)
# kalau cert expired: sudo certbot renew --force-renewal (atau re-issue via webroot)
```

**Jalankan infrastruktur + staging:**
```bash
cd /opt/lazisnu
cp -a data/grafana-data . 2>/dev/null; cp -a data/prometheus-data . 2>/dev/null   # riwayat metrik (opsional)
sudo chown -R 472:472 grafana-data 2>/dev/null; sudo chown -R 65534:65534 prometheus-data 2>/dev/null
docker compose up -d                          # redis, prometheus, grafana, nginx, kuma, certbot(?)
docker compose -f docker-compose.staging.yml up -d   # staging (auto juga via CI)
```

**Deploy production (via CI — cara resmi):**
1. Update **GitHub Actions secrets**: `VM_HOST` → **IP baru** (repo → Settings → Secrets and variables → Actions). `VM_USER`/`VM_SSH_KEY` tetap.
2. Trigger deploy production:
   ```bash
   git tag v1.0.3 && git push origin v1.0.3
   gh workflow run ci.yml --ref v1.0.3    # atau jalankan dari UI Actions
   ```

---

## 4. DNS

Update 5 record di **Hostinger** (domain `lazisnu.site`) → IP baru:

| Record | Target |
|---|---|
| `api` | IP baru |
| `dashboard` | IP baru |
| `staging` | IP baru |
| `staging-api` | IP baru |
| `status` | IP baru |

Set **TTL rendah (60s)** sehari sebelum cutover biar propagation cepat; kembalikan TTL normal setelah stabil.

---

## 5. VERIFIKASI (checklist pasca migrasi)

```bash
# endpoint
curl -s https://api.lazisnu.site/health/ready   # 200
curl -sI https://dashboard.lazisnu.site          # 307/200
curl -sI https://staging-api.lazisnu.site/health # 200
curl -sI https://status.lazisnu.site             # 200
# infra
docker ps                                       # semua healthy
tail -3 /opt/lazisnu/backups/backup.log         # backup malam berikutnya SUCCESS
tail -3 /opt/lazisnu/backups/backup-health.log  # healthcheck SUCCESS
# backup staging
tail -3 /opt/lazisnu/backups-staging/backup.log
# cron
sudo crontab -l; cat /etc/cron.d/lazisnu-backup-health
# cert
sudo certbot certificates                       # expiry > 30 hari
```

**E2E fungsional:**
- [ ] Login dashboard production (web)
- [ ] Login staging (web)
- [ ] OTP via Fonnte (request → WA masuk) — atau cukup `/v1/auth/request-otp` 200
- [ ] App Android: login OTP (pastikan API_URL prod)
- [ ] Uptime Kuma status page: semua monitor UP + alert Discord (bisa uji test-down)

---

## 6. TEARDOWN VM LAMA

Hanya setelah **48-72 jam stabil** di VM baru:
- [ ] Nonaktifkan/stop VM lama (jangan langsung hapus — rollback plan)
- [ ] Setelah 1 minggu tanpa masalah: hapus VM lama + hapus security group lama
- [ ] Update catatan/notes: IP baru, tanggal migrasi

---

## 7. ROLLBACK (jika gagal)

1. DNS → kembalikan ke IP lama (TTL rendah membantu)
2. GH Actions `VM_HOST` → IP lama
3. VM lama masih hidup (belum di-teardown) — aplikasi kembali normal otomatis
4. Diagnosa masalah di VM baru tanpa tekanan

---

## Catatan EAS / APK Signing

- Keystore production **tidak pernah keluar dari EAS** — tidak perlu dipindah.
- Satu-satunya risiko: kehilangan akses akun EAS → **simpan kredensial + backup codes 2FA di password manager**.
- `eas.json` + `projectId` (app.json) sudah di git → clone repo langsung bisa `eas build`.
