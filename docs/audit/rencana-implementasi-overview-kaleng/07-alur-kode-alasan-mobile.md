# 07 — Alur kirim kode alasan "tidak terjemput" (APK petugas)

## Latar belakang (untuk awam)

Saat ini di aplikasi HP, ketika petugas menekan tombol **"Tidak Dijemput"**, muncul kotak
konfirmasi sederhana ("Tandai kaleng X sebagai tidak dijemput? Ya / Batal"). Petugas **tidak
pernah ditanya alasannya**. Akibatnya semua kasus tercatat tanpa alasan, dan admin tidak tahu
apakah kaleng itu rusak, hilang, atau pemiliknya sedang tidak di tempat — padahal perlakuan
ketiganya berbeda.

Back-end **sudah siap** menerima 6 kode alasan baku. Yang kurang hanya antarmukanya (pilihan
berlabel) di aplikasi HP.

## Yang sudah ada (tidak perlu dibuat ulang)

| Bagian | Status |
|---|---|
| Back-end menerima `reason_code` (6 pilihan) | ✅ sudah (`routes/mobile/schemas.ts`) |
| Label bahasa Indonesia untuk 6 alasan | ✅ sudah (`services/conditionRules.ts` → `SKIP_REASON_LABELS`) |
| Alasan `CAN_LOST`/`CAN_DAMAGED` memicu usulan kondisi otomatis | ✅ sudah (`routes/mobile/tasks.ts`) |
| Fungsi API mendukung `reason_code` | ✅ sudah (`api.ts` → `skipAssignment`) |
| **Antarmuka pilihan alasan di APK** | ❌ belum ada (yang ada hanya Ya/Batal) |

## 6 kode alasan + labelnya (sudah baku di sistem)

| Kode | Label di layar | Efek samping otomatis |
|---|---|---|
| `OWNER_ABSENT` | Pemilik tidak di tempat | — |
| `OWNER_REFUSED` | Pemilik menolak dijemput | — |
| `CAN_LOST` | Kaleng hilang | **mengusulkan status → HILANG** (admin menyetujui) |
| `CAN_DAMAGED` | Kaleng rusak | **mengusulkan status → RUSAK** (admin menyetujui) |
| `ACCESS_DIFFICULT` | Akses ke lokasi sulit | — |
| `OTHER` | Lainnya | — |

## Alur baru yang diusulkan (dari sisi petugas)

```
Tekan "Tidak Dijemput"
        ↓
┌─────────────────────────────────────────────────┐
│  KOTAK PILIHAN (menggantikan Ya/Batal)          │
│                                                 │
│  Kenapa tidak terjemput?                        │
│  ○ Pemilik tidak di tempat                      │
│  ○ Pemilik menolak dijemput                     │
│  ● Kaleng rusak           ← ditekan petugas     │
│  ○ Kaleng hilang                                 │
│  ○ Akses ke lokasi sulit                         │
│  ○ Lainnya                                       │
│                                                 │
│  Catatan (opsional):  [____________]            │
│                                                 │
│           [ Batal ]        [ Simpan ]           │
└─────────────────────────────────────────────────┘
        ↓  (petugas pilih "Kaleng rusak", tekan Simpan)
        ↓
Kirim ke server: { reason_code: "CAN_DAMAGED", notes: ... }
        ↓
Server: tugas → UNCOLLECTED + catat alasan
        ↓
Server: karena CAN_DAMAGED → buat usulan "RUSAK" (otomatis)
        ↓
Berhasil → kembali ke daftar tugas
        ↓
Admin web melihat kaleng ini masuk daftar "Perlu Tindakan"
     dengan label "Ganti unit kaleng"
```

## Perubahan berkas (untuk programmer)

Hanya 4 berkas, semua kecil:

| # | Berkas | Ubahan | Ukuran |
|---|---|---|---|
| 1 | `apps/mobile/src/components/ui/OptionList.tsx` | **Baru.** Komponen pilihan radio bertanda (mengikuti gaya `SegmentedControl.tsx` yang sudah ada) | ~70 baris |
| 2 | `apps/mobile/src/screens/TaskDetailScreen.tsx` | Ganti `Alert.alert(Ya/Batal)` jadi kotak pilihan alasan | ~40 baris |
| 3 | `apps/mobile/src/screens/ScanScreen.tsx` | Sama: ganti `handleSkip` jadi kotak pilihan | ~40 baris |
| 4 | `apps/mobile/src/stores/useTasksStore.ts` | `skipAssignment(taskId)` → `skipAssignment(taskId, reasonCode?, notes?)` | ~10 baris |

**Catatan teknis:** `api.ts` dan back-end **tidak diubah** — keduanya sudah mendukung
`reason_code`. Back-end tetap menerima kiriman tanpa kode (memetakan ke `OTHER`), jadi
**APK lama yang belum ter-update tetap jalan** selama masa transisi.

## Masa transisi (penting)

- APK yang **sudah update** → mengirim kode alasan → data bersih.
- APK yang **belum update** → tidak mengirim kode → server catat `OTHER` + tandai di catatan
  "APK lama tanpa reason_code". **Tidak ada yang rusak.**
- Setelah semua petugas update, `OTHER` tak berlabel bisa dipantau apakah masih masuk akal.

## Cara meninjau hasilnya nanti

1. Buka APK → masuk ke detail tugas → tekan "Tidak Dijemput".
   Pastikan muncul **6 pilihan berlabel**, bukan kotak Ya/Batal.
2. Pilih "Kaleng hilang" → cek di web admin: kaleng muncul di daftar Perlu Tindakan
   dengan usulan status **Hilang** (status belum berubah sampai admin menyetujui).
3. Pilih "Pemilik tidak di tempat" → tidak boleh muncul usulan apa pun (kasus biasa).
4. Matikan jaringan saat tekan Simpan → harus muncul pesan gagal yang jujur, bukan
   tuduhan "sinyal lemah" (sudah ada pola penanganan errornya).

## Kriteria penerimaan

- [ ] Petugas wajib pilih 1 dari 6 alasan sebelum bisa menyimpan (tidak boleh kosong).
- [ ] Catatan teks opsional, tidak wajib.
- [ ] Pilihan "Kaleng rusak"/"Kaleng hilang" memunculkan usulan di sisi admin (bukan
      langsung mengubah status — tetap perlu persetujuan).
- [ ] APK lama tetap berfungsi tanpa error.
- [ ] Sentuh: tombol minimal 44px tinggi, ada batas fokus terlihat (sesuai standar
      aksesibilitas yang sudah dipakai komponen overview web).
