# Tech Debt — Persetujuan (approve) kaleng NON_AKTIF di web

> Dicatat: 27 September 2026
> Status: TERBUKA
> Konteks penghapusan: kartu "Perlu tindakan" overview dihapus total
> (`ActionRequiredList`, `getActionItems`, `action_items`) karena link-nya mati
> dan web tidak punya UI eksekusi — kartu itu hanya navigasi.

## Masalah

Kaleng berstatus NON_AKTIF yang butuh keputusan admin (kunjungi verifikasi /
aktifkan kembali) tidak punya alur persetujuan di dashboard web:

- `POST /admin/can-proposals` (buat usulan) — ada di backend, tidak ada UI web.
- `POST /admin/can-proposals/:id/approve|reject` — ada di backend
  (`apps/backend/src/routes/admin/canProposals.ts`), bisa dipakai kedua role
  admin — tidak ada UI web (hanyaapprove draft periode di
  `/dashboard/persetujuan`, itu hal berbeda).
- Satu-satunya aksi terkait di web: tombol reaktivasi di tabel Kelola Kaleng
  (langsung `PUT /admin/cans/:id {is_active: true}`, tanpa jejak persetujuan).

## Yang perlu dibangun (saat dibutuhkan lagi)

1. Daftar usulan pending (HILANG/RUSAK/NON_AKTIF) per scope + tombol
   Setujui/Tolak memanggil endpoint di atas (ikuti pola `ConfirmToast`).
2. Audit trail sudah ada (`request.auditContext` di route) — pastikan tampil di
   audit-log.
3. Putuskan aturan peran: apakah ADMIN_RANTING boleh menyetujui, atau hanya
   mengusulkan dan ADMIN_KECAMATAN menyetujui (saat ini backend mengizinkan
   keduanya, hanya cek scope).

## Peringatan: jalur cepat mem-bypass approval (temuan 27 Sep 2026)

`PUT /admin/cans/:id` (`updateCanSchema`, `routes/admin/schemas.ts:20-26`)
menerima `condition` + `condition_reason_code` dan `canService.updateCan`
(`services/canService.ts:324-342`) langsung mengubah kondisi — validasi hanya
`isTransitionAllowed`, **tanpa proposal, tanpa approval, tanpa alasan wajib**
(`condition_reason_code` opsional). Berlaku untuk SEMUA transisi matriks dan
kedua role admin.

Form Edit di web tidak mengekspos field itu (hanya nama/WA/wilayah/RT/RW),
tetapi pintunya terbuka di API. Artinya: UI Setujui/Tolak yang dibangun nanti
hanya prosedural kecuali jalur cepat ikut dibatasi. Opsi saat implementasi:

- a. Batasi `condition` di PUT hanya untuk reaktivasi (`→ AKTIF`) dan penarikan
  (`→ DIKEMBALIKAN` via DELETE); perubahan HILANG/RUSAK/NON_AKTIF lain wajib
  via proposal.
- b. Biarkan keduanya dan terima approval sebagai prosedural (cepat, lemah).

## Referensi kode

- `apps/backend/src/routes/admin/canProposals.ts`
- `apps/backend/src/services/conditionProposalService.ts`
- `apps/backend/src/services/conditionRules.ts` (`ACTION_LABELS`)
- `apps/backend/src/routes/admin/schemas.ts` (`updateCanSchema`)
- `apps/backend/src/services/canService.ts` (`updateCan`, blok transisi kondisi)
