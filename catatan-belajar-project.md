# Catatan Belajar Project Lazisnu

> Modul pembelajaran pribadi untuk memahami project `lazisnu`, penggunaan AI di IDE Trea, serta cara meningkatkan skill developer selama menyelesaikan project.

---

## Daftar Isi

1. [Latar Belakang](#1-latar-belakang)
2. [Masalah Utama yang Dihadapi](#2-masalah-utama-yang-dihadapi)
3. [Strategi Belajar dari Project yang Sudah 70 Persen](#3-strategi-belajar-dari-project-yang-sudah-70-persen)
4. [Cara Kerja AI Rules, Skills, dan Workflows](#4-cara-kerja-ai-rules-skills-dan-workflows)
5. [Struktur Agent di Repo Lazisnu](#5-struktur-agent-di-repo-lazisnu)
6. [Perubahan yang Sudah Dilakukan di Repo](#6-perubahan-yang-sudah-dilakukan-di-repo)
7. [Cara Memakai Rules, Skills, dan Workflows di Trea](#7-cara-memakai-rules-skills-dan-workflows-di-trea)
8. [Konsep Git yang Dipelajari](#8-konsep-git-yang-dipelajari)
9. [Pola Prompt yang Disarankan](#9-pola-prompt-yang-disarankan)
10. [Checklist Belajar Harian](#10-checklist-belajar-harian)
11. [Target Skill yang Ingin Dicapai](#11-target-skill-yang-ingin-dicapai)
12. [Ringkasan Akhir](#12-ringkasan-akhir)

---

# 1. Latar Belakang

Saya sedang membangun project monorepo bernama **Lazisnu** dengan bantuan AI. Project sudah berjalan cukup jauh, sekitar 70 persen, tetapi karena banyak bagian dibuat dengan bantuan AI, pemahaman pemrograman saya belum berkembang secepat progres project.

Tujuan sesi ini adalah mengubah AI dari sekadar **generator kode** menjadi **mentor teknis** yang membantu saya belajar sambil menyelesaikan project.

Prinsip utama yang disepakati:

> Project harus selesai, tetapi proses belajar tidak boleh dikorbankan.

Artinya, AI tetap boleh membantu menulis kode, tetapi harus:

- menjelaskan konsep;
- menunjukkan file yang terdampak;
- memberi langkah kecil;
- mengajak saya mencoba;
- mereview hasil saya;
- menutup dengan Learning Checkpoint.

---

# 2. Masalah Utama yang Dihadapi

## 2.1 Project Maju, Skill Belum Mengikuti

Masalah utama:

```txt
Project hampir selesai,
tetapi pemahaman developer belum ikut naik secara signifikan.
```

Penyebab:

- terlalu sering meminta AI membuat kode jadi;
- kurang membedah alur project;
- kurang membaca error sendiri;
- kurang memahami hubungan backend, web, mobile, dan shared types;
- belum ada aturan yang memaksa AI mengajar secara bertahap.

## 2.2 Solusi Umum

AI perlu diarahkan agar bekerja sebagai:

- mentor;
- reviewer;
- pair programmer;
- pembimbing debugging;
- penjaga konsistensi arsitektur.

Bukan hanya sebagai alat untuk membuat kode otomatis.

---

# 3. Strategi Belajar dari Project yang Sudah 70 Persen

Fase akhir project adalah waktu yang baik untuk belajar karena semua konsep sudah muncul dalam bentuk nyata.

## 3.1 Jangan Langsung Minta Kode Jadi

Hindari prompt seperti:

```txt
Buatkan fitur X sampai selesai.
```

Gunakan prompt seperti:

```txt
Jelaskan dulu konsep dan file yang terdampak.
Jangan beri kode penuh sebelum saya mencoba bagian kecilnya.
```

## 3.2 Bedah Project, Bukan Hanya Menyelesaikan Project

Untuk setiap fitur, pahami alurnya:

```txt
User klik apa?
File frontend/mobile mana yang berjalan?
API endpoint apa yang dipanggil?
Backend route mana yang menerima?
Service mana yang menjalankan logic?
Tabel database mana yang berubah?
Response balik ke UI seperti apa?
```

## 3.3 Sisakan Task Kecil untuk Dikerjakan Manual

Contoh task kecil yang bagus untuk belajar:

- memperbaiki validasi form;
- menambah loading state;
- menambah empty state;
- memperbaiki error message;
- membuat komponen reusable kecil;
- menulis test sederhana;
- merapikan README;
- memperbaiki script build/lint.

Aturan belajar:

```txt
Coba sendiri 30-45 menit.
Jika mentok, minta AI memberi petunjuk.
Jangan langsung minta patch penuh.
```

---

# 4. Cara Kerja AI Rules, Skills, dan Workflows

Di Trea, ada beberapa jenis arahan untuk AI. Masing-masing punya fungsi berbeda.

## 4.1 AGENTS.md

`AGENTS.md` adalah instruksi utama project.

Karakteristik:

- berada di root repo;
- dibaca oleh agent saat bekerja di project;
- berlaku sebagai project instruction;
- cocok untuk aturan umum yang selalu penting.

Contoh isi penting:

- AI harus menjadi mentor teknis;
- jangan langsung memberi implementasi penuh;
- selalu cek dampak backend-web-mobile;
- gunakan Learning Checkpoint;
- perhatikan database immutable;
- ikuti design system Lazisnu.

## 4.2 Rules

Rules adalah aturan teknis per area.

Contoh:

```txt
.agents/rules/02-arsitektur-database.md
.agents/rules/03-api-conventions.md
.agents/rules/06-pedoman-mobile.md
.agents/rules/07-pedoman-web.md
```

Rules tidak selalu harus dibaca semuanya setiap saat. Rules dibaca saat area terkait relevan.

Contoh:

- task database → baca rule database;
- task web → baca rule web;
- task mobile → baca rule mobile;
- task environment → baca rule environment.

## 4.3 Skills

Skills adalah kemampuan khusus yang aktif ketika trigger atau konteks cocok.

Contoh skills yang dibuat:

```txt
.agents/skills/lazisnu-debug.md
.agents/skills/lazisnu-code-review.md
.agents/skills/lazisnu-testing.md
.agents/skills/lazisnu-architecture.md
.agents/skills/lazisnu-tech-debt.md
.agents/skills/lazisnu-deploy-checklist.md
```

Skills cocok untuk tugas seperti:

- debugging;
- code review;
- testing strategy;
- architecture planning;
- audit technical debt;
- deploy checklist.

## 4.4 Workflows

Workflows adalah SOP atau checklist bertahap untuk tugas yang lebih panjang.

Contoh:

```txt
.agents/workflows/start-sprint.md
.agents/workflows/debug-error.md
.agents/workflows/run-testing.md
.agents/workflows/build-qr-scanner.md
.agents/workflows/build-web-dashboard.md
```

Workflow tidak dipanggil setiap saat. Workflow dipakai saat task besar, lintas modul, atau butuh alur kerja yang rapi.

Perbedaan singkat:

```txt
AGENTS.md   = instruksi utama project
Rules       = aturan teknis per area
Skills      = kemampuan khusus berdasarkan trigger/konteks
Workflows   = SOP/checklist bertahap untuk task besar
```

---

# 5. Struktur Agent di Repo Lazisnu

Struktur agent yang sekarang dipakai:

```txt
lazisnu/
├── AGENTS.md
├── .agents/
│   ├── rules/
│   ├── skills/
│   └── workflows/
└── catatan-belajar-project.md
```

## 5.1 Project Rules, Bukan Global Rules

Rules yang ada di repo adalah **project-level rules**, bukan global rules.

Artinya:

- berlaku untuk project Lazisnu;
- tidak otomatis berlaku untuk semua project lain;
- cocok karena aturan ini sangat spesifik terhadap Lazisnu.

Di Trea:

- `AGENTS.md` aktif jika toggle **Include AGENTS.md in context** menyala;
- `.agents/skills` aktif jika setting **Enable .agents Skills Directory** menyala;
- workflow dipakai jika agent atau user memanggilnya.

---

# 6. Perubahan yang Sudah Dilakukan di Repo

## 6.1 Update AGENTS.md

`AGENTS.md` diupdate agar AI bekerja dalam mode mentor.

Isi penting yang ditambahkan:

- Mode Belajar Developer Pemula;
- Batasan Bantuan AI;
- Learning Checkpoint;
- Protokol Debugging;
- Protokol Review Kode;
- Protokol Monorepo;
- Konvensi Bahasa Kode;
- Routing Rule Wajib.

Tujuan utamanya:

```txt
AI tidak langsung membuat semua kode,
tetapi membantu saya memahami prosesnya.
```

## 6.2 Skills yang Ditambahkan

Skills yang dibuat:

```txt
.agents/skills/lazisnu-debug.md
.agents/skills/lazisnu-code-review.md
.agents/skills/lazisnu-testing.md
.agents/skills/lazisnu-architecture.md
.agents/skills/lazisnu-tech-debt.md
.agents/skills/lazisnu-deploy-checklist.md
```

Fungsinya:

| Skill | Fungsi |
|---|---|
| `lazisnu-debug` | Debug error secara sistematis |
| `lazisnu-code-review` | Review kode sebelum merge |
| `lazisnu-testing` | Menyusun strategi testing |
| `lazisnu-architecture` | Mendesain/mereview arsitektur dan data flow |
| `lazisnu-tech-debt` | Audit technical debt dan prioritas refactor |
| `lazisnu-deploy-checklist` | Checklist sebelum deploy |

## 6.3 Rules yang Disesuaikan

Beberapa rule disesuaikan agar sinkron dengan kondisi project saat ini.

File yang diupdate:

```txt
AGENTS.md
.agents/rules/00-workflow-guarantee.md
.agents/rules/01-arsitektur-folder.md
.agents/rules/05-konvensi-kode.md
.agents/rules/07-pedoman-web.md
.agents/rules/08-pedoman-backend.md
.agents/rules/10-sprint-aktif.md
```

Perbaikan penting:

- workflow tidak wajib untuk task kecil;
- struktur folder disesuaikan dengan monorepo aktual;
- `shared-utils` ditandai belum aktif/planned;
- web disesuaikan ke Next.js 16 + React 19;
- backend disesuaikan ke Node 20 recommended, minimum Node >=18;
- istilah kode/database diarahkan ke nama aktual bahasa Inggris;
- sprint aktif diubah menjadi fase finalisasi dan pembelajaran.

## 6.4 Workflows yang Ditambahkan

Workflows yang ditambahkan:

```txt
.agents/workflows/README.md
.agents/workflows/start-sprint.md
.agents/workflows/update-sprint.md
.agents/workflows/setup-environment.md
.agents/workflows/debug-error.md
.agents/workflows/run-testing.md
.agents/workflows/build-backend-auth.md
.agents/workflows/build-mobile-login.md
.agents/workflows/build-qr-scanner.md
.agents/workflows/build-web-dashboard.md
.agents/workflows/integrate-whatsapp.md
.agents/workflows/integrate-security.md
```

Workflow lama dioptimasi agar tidak lagi menganggap project masih dari nol.

Contoh perubahan:

- `build-web-dashboard` tidak menjalankan `create-next-app` lagi jika dashboard sudah ada;
- `build-mobile-login` tidak menjalankan `react-native init` lagi jika app sudah ada;
- `build-backend-auth` mulai dari audit implementasi aktual;
- `setup-environment` tidak melakukan `git init` pada repo yang sudah ada;
- `run-testing` menyesuaikan scope testing, bukan langsung UAT penuh.

---

# 7. Cara Memakai Rules, Skills, dan Workflows di Trea

## 7.1 Setelah Ada Update dari GitHub

Setiap kali file ditambahkan atau diubah di GitHub, repo lokal di Trea belum otomatis berubah.

Jalankan:

```bash
git pull origin main
```

Lalu:

- reload Trea;
- refresh Skills;
- pastikan `AGENTS.md` terbaca;
- pastikan `.agents/skills` aktif.

## 7.2 Memakai Skill

Contoh:

```txt
Gunakan lazisnu-debug. Error saya seperti ini: ...
```

```txt
Gunakan lazisnu-code-review. Review perubahan saya sebelum merge.
```

```txt
Gunakan lazisnu-testing. Buat test strategy untuk fitur login.
```

## 7.3 Memakai Workflow

Contoh:

```txt
/start-sprint
```

```txt
/debug-error
Error saya seperti ini: ...
```

```txt
/build-qr-scanner
Audit alur scan QR sampai submit collection.
```

```txt
/run-testing
Bantu saya testing fitur web dashboard.
```

## 7.4 Kapan Tidak Perlu Workflow

Tidak perlu workflow untuk:

- memperbaiki typo;
- mengganti label tombol;
- styling kecil satu komponen;
- pertanyaan konsep singkat;
- perubahan kecil satu file.

Gunakan workflow untuk:

- task lintas modul;
- perubahan database;
- perubahan API contract;
- auth;
- QR scan/offline sync;
- deploy;
- testing besar;
- debugging sulit.

---

# 8. Konsep Git yang Dipelajari

## 8.1 Remote vs Local

Perubahan yang dibuat di GitHub berada di **remote repository**.

Trea membuka project dari **local repository** di komputer.

Karena itu, setelah ada perubahan di GitHub, perlu menjalankan:

```bash
git pull origin main
```

Artinya:

```txt
git pull  = ambil dan gabungkan perubahan
origin    = remote GitHub
main      = branch yang diambil
```

## 8.2 Mengecek Branch Aktif

```bash
git branch --show-current
```

Jika bukan `main`, pindah dulu:

```bash
git switch main
```

## 8.3 Mengecek Status Repo

```bash
git status
```

Gunanya untuk melihat:

- ada file lokal berubah atau tidak;
- branch sudah sinkron atau belum;
- ada konflik atau tidak.

## 8.4 Mengecek Commit Terakhir

```bash
git log -1 --oneline
```

Gunanya untuk memastikan update terbaru sudah masuk ke local repo.

---

# 9. Pola Prompt yang Disarankan

## 9.1 Prompt Umum Mentor Mode

```txt
Ikuti AGENTS.md.
Bantu saya sebagai developer pemula.
Jangan langsung beri kode penuh.
Jelaskan dulu file yang terdampak, konsepnya, dan langkah kecil yang bisa saya coba.
Tutup dengan Learning Checkpoint.
```

## 9.2 Prompt Debugging

```txt
Gunakan lazisnu-debug atau workflow debug-error.
Error saya seperti ini:
[paste error lengkap]

Jangan langsung kasih patch.
Bantu saya pahami arti error, kemungkinan penyebab, dan langkah ceknya.
```

## 9.3 Prompt Code Review

```txt
Gunakan lazisnu-code-review.
Review perubahan saya sebelum merge.
Fokus pada correctness, type safety, security, data flow backend-web-mobile, dan maintainability untuk pemula.
```

## 9.4 Prompt Architecture

```txt
Gunakan lazisnu-architecture.
Bantu saya desain alur fitur ini dari UI sampai database.
Tunjukkan data flow, API contract, file terdampak, dan trade-off.
```

## 9.5 Prompt Testing

```txt
Gunakan lazisnu-testing.
Buat test strategy untuk fitur ini.
Pisahkan test backend, web, mobile, shared-types, dan manual regression checklist.
```

## 9.6 Prompt Workflow QR Scanner

```txt
Gunakan workflow .agents/workflows/build-qr-scanner.md.
Audit alur scan QR sampai submit collection.
Jangan rewrite dulu. Mulai dari peta file, data flow, risiko, dan langkah test.
```

---

# 10. Checklist Belajar Harian

Gunakan checklist ini setiap hari saat mengerjakan project.

## 10.1 Sebelum Coding

```txt
[ ] Saya tahu task yang ingin dikerjakan.
[ ] Saya tahu area terdampak: backend / web / mobile / shared-types.
[ ] Saya tahu rule atau skill yang relevan.
[ ] Saya tahu file pertama yang harus dibaca.
```

## 10.2 Saat Coding

```txt
[ ] Saya mencoba memahami alur sebelum mengubah kode.
[ ] Saya tidak langsung meminta AI membuat semua file.
[ ] Saya membaca error sendiri sebelum bertanya.
[ ] Saya mencatat konsep baru yang muncul.
```

## 10.3 Setelah Coding

```txt
[ ] Saya menjalankan build/lint/test yang relevan.
[ ] Saya bisa menjelaskan perubahan dengan bahasa sendiri.
[ ] Saya tahu risiko perubahan saya.
[ ] Saya menulis atau membaca Learning Checkpoint.
[ ] Saya update sprint jika task penting selesai.
```

---

# 11. Target Skill yang Ingin Dicapai

Target realistis sebagai developer pemula di akhir project:

```txt
[ ] Bisa menjalankan project sendiri.
[ ] Paham struktur monorepo PNPM.
[ ] Paham perbedaan backend, web, mobile, dan shared-types.
[ ] Bisa membaca package scripts.
[ ] Bisa menjelaskan alur frontend/mobile ke backend.
[ ] Bisa memahami shared types sebagai kontrak data.
[ ] Bisa membaca error TypeScript dan runtime sederhana.
[ ] Bisa memperbaiki bug kecil dengan bantuan AI yang terkontrol.
[ ] Bisa melakukan code review sederhana.
[ ] Bisa menjalankan build/lint/test dasar.
[ ] Bisa menyiapkan deploy checklist sederhana.
```

## 11.1 Skill Teknis yang Perlu Diprioritaskan

Urutan belajar yang disarankan:

1. Git dasar: branch, pull, status, log.
2. Struktur monorepo PNPM.
3. TypeScript dasar.
4. Alur API request/response.
5. Validasi Zod.
6. React/Next.js state dan UI states.
7. Fastify route/service pattern.
8. Database schema dan query dasar.
9. Debugging error.
10. Testing dan deploy readiness.

---

# 12. Ringkasan Akhir

Sesi ini menghasilkan perubahan besar pada cara AI membantu project Lazisnu.

Sebelumnya:

```txt
AI cenderung menyelesaikan task untuk saya.
```

Sekarang diarahkan menjadi:

```txt
AI membantu saya menyelesaikan task sambil belajar.
```

Struktur yang sudah dibuat:

```txt
AGENTS.md       → instruksi utama project
.agents/rules   → aturan teknis per area
.agents/skills  → kemampuan khusus seperti debug/review/testing
.agents/workflows → SOP task besar
```

Hal paling penting untuk diingat:

> Jangan hanya memakai AI untuk menyelesaikan project. Gunakan AI untuk memahami project.

Setiap kali AI memberi jawaban, saya perlu bertanya pada diri sendiri:

```txt
Apa konsep baru yang saya pahami?
File apa yang sekarang lebih saya mengerti?
Error apa yang sekarang bisa saya baca sendiri?
Task kecil apa yang bisa saya coba tanpa bantuan penuh AI?
```

Jika saya konsisten memakai pola ini, penyelesaian project Lazisnu akan sekaligus menjadi proses naik level sebagai developer.

---

## Lampiran A — Command Penting

```bash
# Ambil update dari GitHub
git pull origin main

# Cek branch aktif
git branch --show-current

# Cek status repo
git status

# Cek commit terakhir
git log -1 --oneline

# Install dependency
pnpm install

# Build shared types
pnpm build:shared

# Jalankan backend
pnpm dev:backend

# Jalankan web
pnpm dev:web

# Jalankan Metro mobile
pnpm start:mobile

# Build semua area utama
pnpm build:all
```

---

## Lampiran B — Format Learning Checkpoint

Gunakan format ini setiap selesai perubahan penting:

```md
## Learning Checkpoint

**Konsep yang dipakai:**
- ...

**Kenapa perubahan ini diperlukan:**
- ...

**File yang perlu dipahami:**
- `path/to/file` — fungsi file ini adalah ...

**Cara mengetes:**
- ...

**Latihan kecil:**
- ...
```

---

## Lampiran C — Pertanyaan Refleksi Mingguan

Jawab pertanyaan ini setiap akhir minggu:

1. Fitur apa yang paling saya pahami minggu ini?
2. Error apa yang berhasil saya pahami sendiri?
3. File apa yang awalnya membingungkan tapi sekarang lebih jelas?
4. Apa satu konsep TypeScript/React/Fastify/database yang saya pelajari?
5. Task apa yang minggu depan ingin saya kerjakan lebih mandiri?

---

*Catatan ini dibuat sebagai modul belajar pribadi untuk project Lazisnu.*
