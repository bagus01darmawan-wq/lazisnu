# Migrasi VM ke Oracle Cloud — 2026-10-17 (Status & Handoff)

> Dokumen ini ditulis **setelah** migrasi selesai, agar AI/operator berikutnya bisa
> memahami kondisi terkini **tanpa perlu inspeksi manual**. Semua ID sumber daya,
> lokasi berkas, dan perintah verifikasi ada di sini. **Rahasia (token/password/isi
> `.env`) TIDAK ditulis di sini** — hanya lokasinya.

---

## 1. Ringkasan

- VM lama **Tencent CVM** (`ins-o1qw6akm`, `43.128.98.52`, Singapura) **kadaluarsa
  2026-10-17 22:42 (WIB)** — tidak diperpanjang (tidak ada dana).
- Seluruh stack dipindah ke **VM baru Oracle Cloud Always Free home region Batam**,
  sementara masih memakai **kredit trial $300** (berbayar) agar segera "bernafas".
- **Situs sudah live di server baru** (terverifikasi via DNS publik). VM lama tidak
  lagi melayani dan akan mati sendiri; **tanpa downtime** (cutover DNS sebelum expiry).
- Database adalah **Supabase eksternal** → tidak ada data yang perlu dimigrasikan;
  aplikasi di server baru tersambung ke project Supabase yang sama.
- Antrean otomatis untuk merebut **Ampere A1 gratis** tetap berjalan (lihat §10).

---

## 2. Server baru (detail)

| Item | Nilai |
|---|---|
| Public IPv4 | **168.110.198.70** |
| Nama instance (display) | `lazisnu-prod` |
| Shape | `VM.Standard.E5.Flex` (x86/AMD) |
| OCPU / RAM | 2 OCPU (4 vCPU) / 8 GB |
| OS | Ubuntu 24.04 LTS (x86_64) |
| Boot volume | 100 GB |
| Region | **`ap-batam-1`** (home region, permanen) |
| Availability Domain | `PjYK:AP-BATAM-1-AD-1` |
| Zona waktu | `Asia/Jakarta` |
| SSH | `ssh -i ~/.ssh/lazisnu_vm ubuntu@168.110.198.70` |
| Root aplikasi | `/opt/lazisnu` (pemilik: `ubuntu`) |

> **PENTING (gotcha image Oracle):** di image Ubuntu Oracle, **`opc` = uid/gid 1000**
> dan **`ubuntu` = uid/gid 1001**. Berkas dari VM lama (uid 1000) karena itu harus
> di-`chown -R ubuntu:ubuntu` (kecuali `alertmanager-data` = `nobody:nogroup`).

---

## 3. Sumber daya OCI yang dibuat (semua di compartment = tenancy root)

| Sumber daya | Nama | OCID |
|---|---|---|
| Tenancy | — | `ocid1.tenancy.oc1..aaaaaaaa2y7kw4xmwh4qmlam4ybdanakzrlnmst4mwrlzuluy2wy7uuvacqq` |
| User (API) | — | `ocid1.user.oc1..aaaaaaaajq4unlaygtwi47t34dlqn7wynjezwhadgfwibuyueey5kivo574q` |
| VCN | `lazisnu-vcn` | `ocid1.vcn.oc1.ap-batam-1.amaaaaaawwvvbtyakjwidco4d72byxy4odpdayjfqw4w2vhf4r7nipjpdzpq` |
| Internet Gateway | `lazisnu-igw` | `ocid1.internetgateway.oc1.ap-batam-1.aaaaaaaaaq2gygkhzqznryacfndjuzzo7xxhfddmpcblz533vuxxnmubjtca` |
| Route Table (default VCN) | — | `ocid1.routetable.oc1.ap-batam-1.aaaaaaaatepu4qjzmf7s5wzfvdw3ojc6bqdogkmbxd5slm3fzg4ijcndcn5a` |
| Security List | `lazisnu-seclist` | `ocid1.securitylist.oc1.ap-batam-1.aaaaaaaaz4cfjimvdvus2wmfltrfqc23mxaj3qny4ypnl6efpjnbn24gqkcq` |
| Subnet (public) | `lazisnu-public` | `ocid1.subnet.oc1.ap-batam-1.aaaaaaaawbsbdlrwkxihbmp63f6mjl5qw7d3ttzgh6xo5mckftqzqrzfuwsa` |
| Instance | `lazisnu-prod` | `ocid1.instance.oc1.ap-batam-1.anrguljrwwvvbtycrct566ee2ux6iw2w24sl7fk5w7fzpqgcfotrr4j6qnbq` |

Detail jaringan:
- VCN CIDR `10.0.0.0/16`, subnet CIDR `10.0.0.0/24`.
- Route table default → `0.0.0.0/0` via `lazisnu-igw`.
- Security list ingress: **TCP 22, 80, 443** dari `0.0.0.0/0`; egress: semua.
- Subnet mengizinkan public IP.

Image yang dipakai/tercatat (region Batam):
- x86 Ubuntu 24.04: `ocid1.image.oc1.ap-batam-1.aaaaaaaavgwpsdil5nmmgvecuegyranwxwwxan6c73rve63o4w7es23s2dia`
- ARM/aarch64 Ubuntu 24.04: `ocid1.image.oc1.ap-batam-1.aaaaaaaaoim33bqupt5df6uiudy34rx75v5sfbsxu3ootl522bpik5q7h6tq`

---

## 4. OCI CLI di laptop (untuk mengelola Oracle)

- Binary: `%USERPROFILE%\bin\oci.exe` (versi 3.95.0), ada di user PATH.
- venv: `%USERPROFILE%\lib\oracle-cli` (dipasang di **Python 3.12** pendamping di
  `%LOCALAPPDATA%\Python\Python312`; Python 3.14 bawaan **tidak kompatibel** dengan
  `oci_cli`/PyYAML).
- Config: `%USERPROFILE%\.oci\config` → region `ap-batam-1`.
- Kunci API: `%USERPROFILE%\.oci\oci_api_key` (format **RSA PEM**, fingerprint
  `92:a5:1d:03:6a:aa:1e:07:1a:b1:a5:f8:ff:0c:3d:f8`).
  > Format OpenSSH & `PUBLIC KEY`/PKCS#1 ditolak Oracle; **wajib** `BEGIN RSA PRIVATE KEY`.
  > Kunci kedua (dari konsol) berfingerprint `9c:44:63:c7:bf:eb:9d:15:77:09:9d:f7:42:f0:fc:3f`
  > (berkas di `D:\tools\bw\`), terdaftar juga tapi tidak dipakai.
- Contoh perintah cepat:
  ```powershell
  $env:SUPPRESS_LABEL_WARNING = "True"
  & "$env:USERPROFILE\bin\oci.exe" compute instance list `
    --compartment-id ocid1.tenancy.oc1..aaaaaaaa2y7kw4xmwh4qmlam4ybdanakzrlnmst4mwrlzuluy2wy7uuvacqq
  ```

---

## 5. Langkah migrasi yang dilakukan (ringkas)

1. **Export bundle** dari VM lama → R2: `migrasi/lazisnu-vm-export-20261012_103311.tar.gz`
   (berisi secrets, cron, letsencrypt, sshd, sysctl). Backup DB final juga dilakukan.
2. **Membuat jaringan + instance Oracle** (di atas) via OCI CLI.
3. **Memindahkan seluruh `/opt/lazisnu`** dari VM lama → VM baru:
   - Dibuat `tar.gz` (kecuali data berat: `prometheus-data`, `grafana-data`,
     `backups*`, `redis-data*`), dikirim lewat jalur **VM-lama → VM-baru** (`scp` +
     kunci sementara `/tmp/mig_key`), diekstrak `--numeric-owner` ke `/opt`.
   - Juga disalin: `~/.ssh` (termasuk **deploy key GitHub** `ed25519_lazisnu_deploy`)
     dan `~/.docker` dari VM lama.
   - `chown -R ubuntu:ubuntu /opt/lazisnu` (+ kembalikan `alertmanager-data` ke
     `nobody:nogroup`).
4. **Menjalankan stack** di VM baru:
   - `docker compose up -d --no-deps redis prometheus alertmanager grafana nginx uptime-kuma`
     (project `lazisnu`).
   - `docker compose -f docker-compose.staging.yml up -d` (staging).
   - Prod blue-green: `GHCR_REPO=bagus01darmawan-wq/lazisnu IMAGE_TAG=bf0b083bd56edf704b4e35891de68ff71bae3e67 bash scripts/deploy-blue-green.sh blue`
     → warna aktif **`blue`**.
5. **Login GHCR** di VM baru (image privat) memakai token `gh auth token` laptop
   (dipipe `--password-stdin`, tidak ditampilkan).
6. **Operasional** (lihat §7).
7. **DNS** dipindah (lihat §8) dan **secret CI** diperbarui (lihat §9).

---

## 6. Arsitektur runtime di VM baru

- **Prod**: blue-green via `docker-compose.blue-green.yml` + `scripts/deploy-blue-green.sh`.
  Warna aktif = `blue` (container `blue-backend`, `blue-worker`, `blue-web`).
  Tag image prod saat migrasi: `bf0b083bd56edf704b4e35891de68ff71bae3e67`.
- **Staging**: `docker-compose.staging.yml` (`lazisnu-backend-staging-1`, `-worker-`, `-web-`,
  `-redis-staging-1`).
- **Infra** (`docker-compose.yml`): `lazisnu-redis-1`, `lazisnu-prometheus-1`,
  `lazisnu-alertmanager-1`, `lazisnu-grafana-1`, `lazisnu-nginx-1`, `uptime-kuma`.
- **Database**: **Supabase eksternal** (via `DATABASE_URL` di `apps/backend/.env`).
  Tidak ada container Postgres. `redis` = cache lokal.
- **Images**: privat di GHCR `ghcr.io/bagus01darmawan-wq/lazisnu/{backend,web}`.
  CI (`ci.yml` job `deploy`) login GHCR otomatis saat deploy.

Total container sehat: 13.

---

## 7. Operasional yang sudah dipasang

- **`postgresql-client-17`** (repo PGDG) → `/usr/lib/postgresql/17/bin/pg_dump`
  (dipakai `scripts/backup.sh`).
- **`awscli` v2** → `/usr/local/bin/aws` (backup upload ke R2). *(apt `awscli`
  tidak tersedia di image ini.)*
- **`vm.overcommit_memory=1`** di `/etc/sysctl.conf` (redis/backup).
- **Cron** dipulihkan:
  - Root crontab: renew certbot (Sen 03:00), backup prod (02:00), backup staging
    (02:30, pakai `BACKUP_ENV_FILE=/opt/lazisnu/secrets/env.backup-staging`),
    backup Kuma (03:00).
  - `/etc/cron.d/`: `lazisnu-auth-probe`, `lazisnu-backup-health`,
    `lazisnu-backup-prod`, `lazisnu-config-drift`, `lazisnu-scheduler-staging`.
- **Certbot**: **tanpa binary host** — dipakai image `certbot/certbot` via
  `scripts/certbot-renew-safe.sh` (webroot). Sertifikat ada di
  `/opt/lazisnu/nginx/certbot/conf/live/` (has dari VM lama).
  - Kadaluarsa saat migrasi: `api.lazisnu.site` **21 Okt 2026** (paling dekat),
    `staging-api` 27 Okt, `status` 29 Okt, `grafana` 6 Nov, `png` 9 Nov.
- **Backup teruji**: `sudo bash /opt/lazisnu/scripts/backup.sh` → **SUCCESS**,
  upload `backups/lazisnu_20261017_220235.sql.gz` (488286 bytes) ke R2.

Lokasi berkas rahasia (JANGAN dicetak):
- `/opt/lazisnu/.env.backup` (kredensial R2 prod — default `ENV_FILE` export script).
- `/opt/lazisnu/.env.backup-prod`, `/opt/lazisnu/secrets/*` (env backup staging,
  auth-probe, scheduler-staging).
- `/opt/lazisnu/apps/backend/.env` (prod) & `.env.staging`.
- `~/.ssh/ed25519_lazisnu_deploy` (deploy key GitHub), `~/.docker/config.json` (GHCR).

---

## 8. DNS (Cloudflare — BUKAN Hostinger)

- Domain `lazisnu.site` dikelola di **Cloudflare**; nameserver:
  `dell.ns.cloudflare.com`, `tanner.ns.cloudflare.com`. (Dipindah dari Hostinger
  ke Cloudflare pada 25 Agu 2026 — lihat `docs/implementation/RENCANA-PINDAH-DNS-R2-2026-08-25.md`.)
- 7 record A (mode **DNS only / awan abu-abu**, TTL **300**s) diubah ke
  **`168.110.198.70`**: `api`, `dashboard`, `staging`, `staging-api`, `status`,
  `grafana`, `png`.
- Verifikasi otoritatif:
  ```powershell
  Resolve-DnsName api.lazisnu.site -Type A -Server dell.ns.cloudflare.com -DnsOnly
  ```

---

## 9. CI / GitHub Actions

- Secret **`VM_HOST`** di repo `bagus01darmawan-wq/lazisnu` sudah diubah ke
  **`168.110.198.70`** (via `gh secret set VM_HOST`). `VM_USER` (`ubuntu`) &
  `VM_SSH_KEY` tetap.
- Artinya: push ke `main` / tag `v*` → build image + deploy blue-green otomatis ke
  server baru.
- **Catatan**: verifikasi publik di workflow `deploy` menembak `https://api.lazisnu.site`
  (kini sudah mengarah ke server baru) — jadi verifikasi sekarang benar-benar menguji
  server baru.

---

## 10. Ampere gratis (upaya paralel, masih berjalan)

Karena trial hanya $300 / ~30 hari, disiapkan antrean otomatis untuk merebut
instance **Ampere A1 gratis** (2 OCPU/12 GB) di Batam:

- Script: `%USERPROFILE%\.lazisnu-oracle\retry-ampere.ps1`
- Log: `%USERPROFILE%\.lazisnu-oracle\retry.log`
- Auto-start saat login: `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\lazisnu-ampere-retry.cmd`
- Instance target: display `lazisnu-ampere`, hostname `lzampere` (nama berbeda agar
  bisa berdampingan dengan `lazisnu-prod`), 2 OCPU / 12 GB, Ubuntu 24.04 **aarch64**.
- Jadwal: retry tiap ~6–10 menit; menangani `Out of host capacity` & `TooManyRequests`
  (429) dengan backoff.

Cek status cepat:
```powershell
Get-Content "$env:USERPROFILE\.lazisnu-oracle\retry.log" -Tail 5
```

> **Batasan penting:** Always Free (termasuk Ampere) **hanya bisa dibuat di home
> region** = Batam. Region lain (mis. Singapura) **tidak bisa** dipakai gratis.
> Home region tidak bisa diubah. Stok Ampere Batam sedang kosong → bisa lama.

---

## 11. Verifikasi (hasil setelah DNS pindah)

| Endpoint | Hasil |
|---|---|
| `https://api.lazisnu.site/health/ready` | `{"success":true,"status":"ready","checks":{"db":"ok","redis":"ok"}}` |
| `https://dashboard.lazisnu.site/` | 307 (normal) |
| `https://dashboard.lazisnu.site/api/health` | `{"status":"ok","service":"web"}` |
| `https://staging-api.lazisnu.site/health` | `{"status":"ok"}` |
| `https://status.lazisnu.site/` | 302 (Uptime Kuma) |
| `https://api.lazisnu.site/v1/auth/me` (tanpa token) | 401 |
| TLS | valid & dipercaya (diuji tanpa `-k`) |

Perintah pemeriksaan di server:
```bash
ssh -i ~/.ssh/lazisnu_vm ubuntu@168.110.198.70
docker ps --format '{{.Names}} | {{.Status}}'
cd /opt/lazisnu && bash scripts/deploy-blue-green.sh status
tail -5 /opt/lazisnu/backups/backup.log
```

---

## 12. Rollback & risiko

- **Rollback nyata tidak tersedia lagi setelah VM Tencent mati** (DNS tak bisa
  dikembalikan ke host mati). Karena DB eksternal & situs stabil terverifikasi,
  risiko dinilai kecil.
- Rollback sementara (dalam ~1 jam setelah cutover) = kembalikan 7 record A ke
  `43.128.98.52` di Cloudflare.
- Risiko utama ke depan: **kredit trial habis (± 13 Nov 2026)** sebelum Ampere
  gratis didapat → server berhenti. Rencana: pindah ke Ampere gratis (butuh build
  image **arm64** — tambah `platforms: linux/amd64,linux/arm64` di `.github/workflows/ci.yml`).

---

## 13. Tindak lanjut (TODO)

- [ ] **Pantau konsumsi kredit trial** (Oracle Console → Billing). Runway ~30 hari.
- [ ] **Kejar Ampere gratis**; begitu dapat, migrasi ke ARM (build multi-arch) dan
      matikan instance berbayar. Ingat: total Ampere Always Free ≤ 2 OCPU/12 GB.
- [ ] `docs/DEPLOYMENT.md`, `docs/SOP-UPTIME-KUMA.md`, `docs/VM-STRUCTURE.md` **masih
      menyebut Hostinger / IP lama `43.128.98.52`** — perbarui agar tidak menyesatkan.
- [ ] Pastikan **renew cert** Senin 03:00 berhasil (sertifikat `api` expire 21 Okt).
- [ ] Setelah stabil beberapa hari, pertimbangkan naikkan TTL DNS kembali normal.
- [ ] Commit docs fix: **`2d6d22c`** di branch `staging` (DNS→Cloudflare + ENV_FILE
      export) — **belum di-push** saat dokumen ini ditulis.

---

## 14. Lampiran — berkas & artefak penting

Repo (sudah di-commit / berubah):
- `docs/MIGRATION-VM.md` (runbook migrasi; §DNS sudah dikoreksi ke Cloudflare).
- `scripts/vm-migration-export.sh` (default `ENV_FILE` → `/opt/lazisnu/.env.backup`,
  override `EXPORT_ENV_FILE`).
- `scripts/deploy-blue-green.sh`, `docker-compose.blue-green.yml`,
  `docker-compose.staging.yml`, `docker-compose.yml` (tidak berubah — dipakai apa adanya).

Artefak R2 terbaru:
- Export bundle: `migrasi/lazisnu-vm-export-20261012_103311.tar.gz`
- Backup DB (dari VM baru): `backups/lazisnu_20261017_220235.sql.gz`
- Backup terakhir dari VM lama: `backups/lazisnu_20261017_212425.sql.gz`

Di VM baru (`/opt/lazisnu`): `apps/backend/.env`, `apps/backend/.env.staging`,
`.env.backup`, `.env.backup-prod`, `secrets/`, `nginx/certbot/`, `backups/`.
