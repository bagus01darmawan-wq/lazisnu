## Rencana Perbaikan Offline-First

  Target akhirnya:

  Data penjemputan masuk MMKV
    → tetap terlihat sebagai Pending
    → dikirim dengan payload yang valid
    → server mengonfirmasi
    → baru dihapus dari queue lokal

  Data finansial tidak boleh hilang karena refresh, logout, retry gagal, maupun tindakan pengguna.

  ### Fase 1 — Perbaiki kontrak sinkronisasi

  File utama:

  - packages/shared-types/src/index.ts
  - apps/mobile/src/services/offline/sync.ts
  - apps/mobile/src/services/api.ts
  - apps/backend/src/routes/mobile/schemas.ts
  - apps/backend/src/services/mobileSyncService.ts

  Perubahan:

  1. Buat shared type khusus payload batch, misalnya:

  interface BatchCollectionRequestItem {
    offline_id: string;
    assignment_id: string;
    can_id: string;
    nominal: number;
    collected_at: string;
    latitude?: number;
    longitude?: number;
    device_info?: DeviceInfo;
  }

  2. Pisahkan dengan tegas:

  QueuedCollection
  ├── data transaksi
  └── metadata lokal: retry_attempts, error_type, error_message

  BatchCollectionRequestItem
  └── hanya data yang boleh dikirim ke API

  3. Tambahkan mapper allowlist:

  function toBatchPayload(item: QueuedCollection): BatchCollectionRequestItem

  Mapper tidak boleh memakai spread ...item, sehingga metadata lokal tidak mungkin ikut terkirim.

  4. Backend batch schema tetap .strict() untuk keamanan, tetapi menerima device_info.
  5. Tambahkan test yang memastikan:

  - device_info diterima.
  - retry_attempts tidak terkirim.
  - error_message tidak terkirim.
  - payment_method dan transfer_receipt_url tetap ditolak.

  ### Fase 2 — Selamatkan data gagal yang sudah ada

  Saat ini transaksi Anda kemungkinan berada di failedPermanent. Jangan menghapus aplikasi atau storage emulator sebelum recovery selesai.

  Tambahkan migrasi MMKV satu kali:

  1. Baca semua record failedPermanent.
  2. Validasi field transaksi utamanya.
  3. Reset metadata kegagalan kontrak:
      - retry_attempts = 0
      - hapus error_type
      - hapus error_message
      - hapus can_retry

  4. Pindahkan kembali ke active queue.
  5. Jangan hapus failed record sampai salinan active queue berhasil ditulis.
  6. Beri version key, misalnya:

  offline_queue_schema_version = 2

  Migrasi hanya berjalan sekali dan harus idempotent.

  ### Fase 3 — Kunci penghapusan data finansial

  File yang terdampak:

  - apps/mobile/src/services/offline/queue.ts
  - apps/mobile/src/stores/useSyncStore.ts
  - apps/mobile/src/stores/useAuthStore.ts
  - apps/mobile/src/screens/DashboardScreen.tsx
  - apps/mobile/src/screens/TasksScreen.tsx

  Perubahan wajib:

  1. Hapus dari public API:

  clearFailedPermanent()
  clearQueue()
  clearFailed()

  2. Hapus tombol “Hapus Data Lokal” dari Dashboard dan Tasks.
  3. Hapus seluruh callback yang memanggil fungsi penghapusan tersebut.
  4. Logout tidak boleh menghapus pending/failed collection. Saat ini resetAllClientState() juga membersihkan queue finansial; ini harus diubah.

  Pilihan aman saat logout:

  - Jika ada queue pending/failed, blokir logout dan minta sinkronisasi dahulu; atau
  - simpan queue berdasarkan officerId agar tetap tersedia setelah login kembali.

  Untuk tahap sekarang, saya merekomendasikan simpan queue berdasarkan officerId agar tetap tersedia setelah login kembali.

  5. Satu-satunya operasi yang boleh menghapus record dari active queue adalah:

  removeAcknowledged(offlineIds)

  Fungsi ini hanya dipanggil ketika server mengembalikan:

  COMPLETED
  ALREADY_SYNCED

  6. Tambahkan komentar invariant:

  // FINANCIAL DATA INVARIANT:
  // Never delete a queued collection without server acknowledgement.

  ### Fase 4 — Tambahkan pengunci otomatis

  Agar tombol hapus tidak muncul lagi secara tidak sengaja:

  1. Tambahkan unit test kebijakan queue:

  - offlineQueue tidak mengekspor clearQueue
  - offlineQueue tidak mengekspor clearFailedPermanent
  - useSyncStore tidak memiliki clearFailed

  2. Tambahkan UI test:

  Dashboard tidak menampilkan “Hapus Data Lokal”
  Tasks tidak menampilkan “Hapus Data Lokal”

  3. Tambahkan pemeriksaan source pada test atau CI:

  rg "Hapus Data Lokal|clearFailedPermanent|clearQueue" apps/mobile/src

  Build harus gagal bila istilah/fungsi terlarang muncul kembali di area mobile production.

  4. Jika perlu reset selama development, buat fungsi terpisah yang hanya tersedia di test/dev tooling, bukan production bundle:

  if (__DEV__) {
    // test-only reset helper
  }

  Fungsi tersebut tidak boleh dapat dipanggil dari UI petugas.

  ### Fase 5 — Perbaiki rekonsiliasi refresh

  Refresh tidak boleh mengganti seluruh state lokal dengan data server.

  Gunakan alur:

  Ambil data server
    + baca active queue
    + baca failed/quarantine queue
    → merge berdasarkan offline_id atau assignment_id
    → tampilkan hasil gabungan

  Status lokal:

  PENDING_SYNC
  SYNCING
  SYNC_FAILED_RETRYABLE
  NEEDS_REVIEW
  COMPLETED

  Aturan:

  - Record lokal tetap muncul di Riwayat selama belum ACK.
  - Task lokal tetap berstatus selesai/pending sync.
  - Dashboard tetap memasukkan nominal lokal.
  - Setelah server ACK, local shadow diganti record server.
  - Hindari double count menggunakan offline_id.

  ### Fase 6 — Perbaiki UX kegagalan

  Ganti popup saat ini menjadi:

  Data Belum Terkirim

  Penjemputan tetap aman tersimpan di perangkat.
  Aplikasi akan mencoba mengirim kembali secara otomatis.

  Tombol:

  - Coba Kirim Lagi
  - Lihat Detail
  - Nanti

  Tidak ada tombol hapus.

  Halaman detail harus menampilkan:

  - nama/kode kaleng;
  - nominal;
  - waktu penjemputan;
  - jumlah percobaan;
  - pesan error yang ramah;
  - tombol retry.

  ### Fase 7 — Perbaiki logika retry

  Masalah kontrak atau HTTP 500 tidak boleh langsung berubah menjadi “permanent failed” setelah tiga percobaan dalam satu sesi.

  Perbaikan:

  - Retry maksimal satu kali per event konektivitas.
  - Gunakan exponential backoff lintas waktu.
  - Simpan next_retry_at.
  - HTTP 5xx/network error tetap berada di active queue.
  - Validation error masuk quarantine/needs-review, tetapi tidak dihapus.
  - Batch-level HTTP 400 harus menyimpan detail response untuk diagnosis.
  - Backend tidak boleh menghitung validation error sebagai succeeded.

  ### Fase 8 — Verifikasi wajib

  Automated:

  pnpm --filter @lazisnu/shared-types build
  pnpm --filter lazisnu-backend typecheck
  pnpm --filter lazisnu-backend test -- --runInBand
  pnpm --filter lazisnu-collector-app typecheck
  pnpm --filter lazisnu-collector-app test -- --runInBand
  pnpm --filter lazisnu-collector-app lint
  pnpm --filter lazisnu-collector-app build:debug

  Manual emulator:

  1. Matikan jaringan.
  2. Lakukan penjemputan.
  3. Pastikan data masuk riwayat sebagai “Menunggu Sinkronisasi”.
  4. Refresh Dashboard, Tasks, dan History.
  5. Pastikan data tidak hilang.
  6. Restart aplikasi.
  7. Pastikan data masih ada.
  8. Aktifkan jaringan.
  9. Pastikan sinkronisasi berhasil.
  10. Restart aplikasi dan pastikan data server tetap tampil.
  11. Simulasikan backend mati.
  12. Pastikan data tetap tersimpan dan tidak ada tombol hapus.
  13. Coba logout ketika queue belum kosong.
  14. Pastikan logout diblokir atau queue tetap aman.

  ## Acceptance criteria

  Perbaikan dianggap selesai jika:

  - Tidak ada tombol “Hapus Data Lokal”.
  - Tidak ada public method untuk menghapus queue finansial secara massal.
  - Refresh tidak menghilangkan transaksi pending/failed.
  - Restart aplikasi tidak menghilangkan transaksi.
  - Logout tidak menghapus transaksi.
  - Payload batch tidak membawa metadata internal.
  - Record queue hanya dihapus setelah ACK server.
  - Transaksi gagal dapat dicoba kembali.
  - Data gagal lama berhasil dipulihkan dan disinkronkan.