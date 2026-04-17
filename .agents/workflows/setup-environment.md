---
description: 
---

# Workflow: /setup-environment
# Trigger: Ketik /setup-environment di chat Antigravity
# Tujuan: Panduan setup environment lengkap (FASE 0 — Minggu 1-2)
# Gunakan ini saat pertama kali setup project di mesin baru

---

## Instruksi untuk Agent

Bantu user menyelesaikan setup environment development untuk project Lazisnu Infaq System.
Ikuti checklist berikut secara berurutan. Setelah setiap langkah selesai, konfirmasi ke user sebelum lanjut.

---

### BLOK A — Tools Wajib di Windows (urutan tidak boleh diubah)

**A1. WSL2 + Ubuntu**
Instruksikan user untuk membuka PowerShell sebagai Administrator dan jalankan:
```powershell
wsl --install
# Restart Windows setelah selesai
# Buka Ubuntu, buat username dan password Linux
wsl --set-default-version 2
```
Verifikasi: `wsl --list --verbose` → harus tampil `Ubuntu  Running  2`

**A2. Git**
```bash
# Download dari git-scm.com/download/win, lalu di terminal WSL2:
git config --global user.name "Nama User"
git config --global user.email "email@domain.com"
git --version  # verifikasi
```

**A3. Node.js via NVM (di dalam WSL2)**
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install --lts
nvm use --lts
node --version   # harus v20.x.x
npm --version
```

**A4. PostgreSQL (di dalam WSL2)**
```bash
sudo apt update && sudo apt install postgresql postgresql-contrib
sudo service postgresql start
sudo -u postgres psql -c "CREATE USER lazisnu_dev WITH PASSWORD 'password_dev_123';"
sudo -u postgres psql -c "CREATE DATABASE lazisnu_db OWNER lazisnu_dev;"
# Verifikasi:
psql -U lazisnu_dev -d lazisnu_db -h localhost -c "\conninfo"
```

**A5. Redis (di dalam WSL2)**
```bash
sudo apt install redis-server
sudo service redis-server start
redis-cli ping  # harus PONG
```

**A6. Java JDK 17**
Instruksikan user download Temurin JDK 17 dari adoptium.net, install di Windows.
Verifikasi: `java --version` → harus `openjdk 17`

**A7. Android Studio**
- Download dari developer.android.com/studio
- Install SDK Platform 34 dan 35 via SDK Manager
- Buat AVD: Pixel 6, API 34
- Set environment variable ANDROID_HOME di Windows

**A8. VS Code + Extensions Wajib**
Extensions yang harus dipasang: WSL, ESLint, Prettier, TypeScript Importer, REST Client, React Native Tools, Tailwind CSS IntelliSense, GitLens, PostgreSQL (cweijan)

---

### BLOK B — Akun Online (bantu user buat checklist ini)

Tampilkan checklist berikut dan minta user konfirmasi mana yang sudah selesai:
```
[ ] GitHub Organization: lazisnu-infaq-system
[ ] Firebase Project: lazisnu-infaq
[ ] Microsoft App Center: app Android terdaftar
[ ] Cloudflare Account + R2 bucket
[ ] Sentry Account
[ ] WhatsApp Business API (daftar dan submit template SEGERA — proses 1-2 minggu)
[ ] Figma account
[ ] Notion atau Linear untuk task management
```

---

### BLOK C — Setup Repository

```bash
mkdir ~/lazisnu-infaq-system && cd ~/lazisnu-infaq-system
git init
# Buat struktur folder:
mkdir -p apps/mobile apps/web apps/backend
mkdir -p packages/shared-types packages/shared-utils
mkdir -p .agents/rules .agents/workflows .agents/skills
mkdir -p .github/workflows docs

# Setup branch strategy:
git checkout -b develop
git checkout -b staging
```

Buat file `.gitignore` dengan konten:
```
node_modules/
.env
.env.local
.env.staging
.env.production
*.keystore
dist/
build/
.next/
coverage/
```

---

### BLOK D — Verifikasi Akhir

Setelah semua selesai, jalankan verifikasi berikut dan laporkan hasilnya ke user:
```bash
node --version    # v20.x.x
npm --version     # 10.x.x
git --version     # 2.x.x
java --version    # openjdk 17
psql --version    # 16.x
redis-cli ping    # PONG
```

Tampilkan summary: berapa dari checklist yang sudah selesai, dan apa yang masih pending.

Update file `.agents/rules/10-sprint-aktif.md` dengan mencentang semua item yang sudah selesai.
