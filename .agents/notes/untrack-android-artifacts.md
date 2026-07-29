Catatan: Untrack Android build artifacts dan local.properties

Banyak file di apps/mobile/android/.gradle dan file apps/mobile/android/local.properties muncul
sebagai "modified" di working tree. Ini adalah artefak build / konfigurasi lokal yang tidak seharusnya
dikomit ke repository.

Rekomendasi:

- Tambahkan pola yang sesuai ke .gitignore (jika belum ada):

  apps/mobile/android/.gradle/
  apps/mobile/android/local.properties

- Hapus file-file ini dari tracking Git (tetap ada di disk lokal) dengan perintah:

  git rm --cached <path>

  Contoh (untrack local.properties dan semua file dalam .gradle):

  git rm --cached apps/mobile/android/local.properties
  git rm -r --cached apps/mobile/android/.gradle/

- Commit perubahan .gitignore dan staged removal:

  git add .gitignore
  git commit -m "chore: ignore android build artifacts (.gradle, local.properties)"

Catatan penting:

- `git rm --cached` tidak menghapus file dari disk lokal Anda; hanya menghentikan Git
  dari melacaknya. Jadi tidak ada build otomatis yang hilang pada mesin tempat perintah
  dijalankan.
- Setelah file ini tidak lagi dilacak, rekan tim atau CI yang menarik perubahan dari
  remote tidak akan mendapatkan artefak tersebut — mereka harus meregenerasi artefak
  dengan menjalankan proses build (mis. `pnpm --filter lazisnu-collector-app build:debug`).
- Komunikasikan perubahan ini dalam PR atau channel tim agar developer tahu mereka
  mungkin perlu melakukan build sekali untuk meregenerasi artefak.

Jika Anda ingin, saya bisa menjalankan perintah `git rm --cached` untuk file-artifact yang
terlihat di working tree sekarang dan membuat commit .gitignore + removal. Beri tahu saya
jika saya harus melanjutkan.
