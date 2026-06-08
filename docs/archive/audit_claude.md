## 🔬 Bedah Teknis: Repo Lazisnu

### 1. Fondasi Arsitektur — Nilainya Bagus

**Monorepo dengan pnpm workspaces** adalah pilihan tepat untuk proyek ini. Dengan tiga surface (mobile, backend, web) yang berbagi tipe data, monorepo menghilangkan masalah klasik "type drift" — kondisi di mana definisi data di mobile berbeda dengan yang di backend. Package `@lazisnu/shared-types` menjadi single source of truth yang sangat baik.

**TypeScript 93.8%** menunjukkan komitmen type safety yang konsisten. Ini bukan sekadar estetika — di sistem keuangan seperti zakat, type error yang lolos ke production bisa menyebabkan kesalahan pencatatan nominal.

**Keputusan immutable `collections` table** adalah arsitektur keuangan yang benar. Ini adalah pola *append-only ledger* — setiap transaksi hanya bisa di-INSERT, bukan diubah. Jika petugas salah input, tidak ada UPDATE, melainkan counter-entry baru. Audit trail-nya bersih dan tidak bisa dimanipulasi.

**BullMQ untuk WhatsApp** juga tepat. Notifikasi WhatsApp ke donatur tidak perlu real-time — yang penting sampai. Queue dengan retry mechanism memastikan tidak ada notifikasi yang hilang meski WhatsApp Business API sedang down sesaat.

---

### 2. Temuan Tersembunyi yang Perlu Diperhatikan

Ada beberapa hal yang tidak muncul di README tapi terdeteksi dari file lain:

**Prisma ORM** ditemukan di `.gitignore` pada baris `prisma/migrations/dev/` — artinya Prisma digunakan sebagai ORM, tapi tidak terdokumentasi sama sekali di README. Ini bukan masalah teknis, tapi masalah dokumentasi yang bisa menyulitkan developer baru. Harus ditambahkan ke tech stack.

**`protobufjs` di allowBuilds** cukup mengejutkan. Protobuf biasanya dipakai untuk komunikasi binary antar service (gRPC) atau serialisasi payload yang efisien. Kalau ini hanya dependency transitif dari library lain, tidak masalah. Tapi kalau memang digunakan secara aktif tanpa dokumentasi, itu merupakan hidden complexity.

**`sharp`** kemungkinan dipakai untuk generate QR code atau resize gambar. Keduanya masuk akal untuk aplikasi ini, tapi perlu dikonfirmasi.

**`unrs-resolver`** adalah Rust-based module resolver — ini mengindikasikan penggunaan bundler modern seperti Rspack atau Oxc. Pilihan yang cutting-edge, tapi perlu dipertimbangkan kematangan ekosistemnya untuk production.

---

### 3. Risk Assessment

**🔴 Risiko Tinggi**

**Microsoft App Center (CodePush) sedang dalam proses sunset.** Microsoft telah mengumumkan penghentian App Center, termasuk CodePush. Menggantungkan OTA update mobile pada platform yang akan mati adalah risiko delivery yang serius. Harus segera dimigrasi ke alternatif seperti Expo Updates atau EAS Update sebelum terlambat.

**Tidak ada CI/CD sama sekali.** Dengan 18 commit dan 0 GitHub Actions, tidak ada automated testing, tidak ada lint check, tidak ada type check otomatis sebelum merge. Di proyek keuangan, ini sangat berbahaya — satu commit yang tidak sengaja merusak validasi nominal bisa lolos ke production tanpa diketahui.

**🟡 Risiko Menengah**

**Hanya 1 branch (`main`).** Tidak ada branching strategy yang terlihat — tidak ada `develop`, tidak ada `staging`, tidak ada `feature/*`. Ini berarti semua pekerjaan langsung ke main. Untuk tim kecil mungkin masih aman, tapi begitu ada lebih dari 1 developer aktif, ini akan menjadi masalah konflik dan stabilitas.

**`scratch/` folder di-commit ke repo.** Folder draft/eksperimen seharusnya ada di `.gitignore`, bukan di version control. Ini mencemari history repo dan bisa mengandung kode yang belum siap.

**Stack service eksternal terlalu banyak untuk tahap awal.** Redis + BullMQ + Firebase FCM + WhatsApp Business API + Cloudflare R2 + Sentry + Crashlytics adalah 7 layanan eksternal untuk MVP. Setiap layanan = satu titik failure, satu dependency billing, satu set credentials yang harus dikelola. Untuk fase pertama, beberapa bisa disederhanakan dulu.

**🟢 Risiko Rendah (tapi perlu dicatat)**

`.vscode/settings.json` dikecualikan dari gitignore tapi folder `.vscode/` sendiri di-commit — ini sebenarnya intentional dan baik untuk team consistency, asalkan settings yang di-commit tidak mengandung path atau extension yang spesifik untuk mesin tertentu.

---

### 4. Rekomendasi Prioritas

Kalau ini proyekmu dan kamu ingin aku bantu lebih dalam, urutan yang aku sarankan:

Pertama, segera tambahkan CI/CD minimal — cukup satu GitHub Actions workflow yang menjalankan `tsc --noEmit` dan `pnpm lint` di setiap push. Ini gratis dan menyelamatkan banyak masalah.

Kedua, buat branching strategy sederhana: `main` untuk production-ready code, `develop` untuk integrasi harian. Semua fitur lewat PR ke `develop`, baru merge ke `main` saat siap release.

Ketiga, migrasi dari App Center CodePush sekarang — sebelum mendekati production dan baru panik mencari alternatif.

Keempat, dokumentasikan Prisma di README dan buat satu file `ARCHITECTURE.md` yang menjelaskan keputusan-keputusan arsitektur penting (terutama immutable collections pattern) beserta alasannya.

---

Secara keseluruhan ini adalah pondasi yang **cukup solid untuk proyek early-stage** — pilihan teknologi masuk akal, ada pemikiran tentang financial data integrity, dan struktur monorepo yang rapi. Yang masih kurang adalah infrastruktur pengembangan (CI/CD, branching) dan beberapa dokumentasi yang perlu dilengkapi.