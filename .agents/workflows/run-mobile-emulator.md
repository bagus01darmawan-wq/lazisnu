# Workflow: Run Mobile Emulator
Description: Langkah-langkah cepat menyalakan emulator dan aplikasi mobile Lazisnu (React Native) di sistem operasi Windows.

## Konteks
Panduan ini digunakan sebagai referensi cepat bagi AI maupun Developer untuk menyalakan ekosistem mobile tanpa perlu menganalisis ulang file `package.json`.

## A. Langkah Harian (Jika aplikasi sudah pernah ter-install)
Gunakan langkah ini untuk aktivitas *coding* sehari-hari jika aplikasi belum dihapus dari emulator.

1. **Nyalakan Emulator**
   - Buka terminal baru (bisa di mana saja).
   - Jalankan: `emulator -avd medium_phone`
   - *(Biarkan terminal ini tetap menyala)*

2. **Nyalakan Database & Backend API**
   - Pastikan service PostgreSQL dan Redis sudah berjalan di komputermu.
   - Buka terminal baru di root proyek (`lazisnu`).
   - Jalankan: `pnpm run dev:backend`
   - *(Biarkan terminal ini tetap menyala)*

3. **Nyalakan Metro Bundler (Penggerak Mobile)**
   - Buka terminal baru di root proyek (`lazisnu`).
   - Jalankan: `pnpm run start:mobile`
   - *(Biarkan terminal ini tetap menyala)*

4. **Buka Aplikasi Manual**
   - Masuk ke layar emulator yang sudah menyala.
   - Cari icon aplikasi Lazisnu dan klik untuk membukanya.
   - Aplikasi akan otomatis tersambung ke Metro Bundler.

---

## B. Langkah Instalasi Ulang (Native Build)
Gunakan langkah ini **hanya jika**: aplikasi terhapus dari emulator, ada perubahan di folder `android/`, atau setelah menjalankan `pnpm install` yang berisi *library native* baru.

1. Lakukan **Langkah A (1 sampai 3)** di atas.
2. Buka terminal baru lagi di root proyek (`lazisnu`).
3. Jalankan perintah kompilasi:
   `pnpm run android:mobile`
4. Tunggu hingga proses build selesai 100%. Aplikasi akan otomatis dipasang (install) dan terbuka di emulator.
