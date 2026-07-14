# Tahap 5 — Testing dan Acceptance

## Test Otomatis per Tahap

```powershell
pnpm --filter lazisnu-collector-app typecheck
pnpm --filter lazisnu-collector-app lint
pnpm --filter lazisnu-collector-app test
```

Setelah semua screen selesai:

```powershell
pnpm --filter lazisnu-collector-app build:debug
```

## Checklist Visual Android

Target: Pixel 6, API 34.

- [ ] Status bar tidak menimpa header.
- [ ] Konten tidak terpotong gesture/navigation area.
- [ ] Tombol utama minimal 56 px.
- [ ] Target sentuh lain minimal 48 px.
- [ ] Teks penting minimal 16sp.
- [ ] Keyboard tidak menutup input/tombol penting.
- [ ] Deep Green dan Warm Beige konsisten.
- [ ] Status tidak hanya dibedakan berdasarkan warna.
- [ ] Long text dan nominal besar tidak overflow.
- [ ] Loading, empty, error, offline, dan disabled state terlihat.

## Regression Fungsional

- [ ] Cold start dengan token valid.
- [ ] Login password berhasil/gagal.
- [ ] Request dan verifikasi OTP.
- [ ] Refresh Dashboard.
- [ ] Filter Tasks.
- [ ] Camera permission denied/blocked.
- [ ] QR invalid, already submitted, dan not assigned.
- [ ] Nominal kosong, nol, dan lebih dari batas.
- [ ] Submit online.
- [ ] Submit offline tersimpan terenkripsi.
- [ ] Auto-sync saat jaringan kembali.
- [ ] WhatsApp pending/completed terlihat di History.
- [ ] Resubmit meminta alasan dan membuat versi baru.
- [ ] Logout kembali ke AuthStack.

## Format Laporan Testing

Setelah pengujian besar, buat file:

```text
docs/testing-report-YYYY-MM-DD.md
```

Contoh:

```text
docs/testing-report-2026-07-04.md
```

Template:

```md
# Testing Report Mobile Design System

Tanggal:
Commit/branch:
Emulator/device:

## Perintah

- typecheck:
- lint:
- test:
- build:debug:

## Hasil Manual

- Login:
- OTP:
- Dashboard:
- QR scan:
- Collection online:
- Collection offline:
- History/resubmit:
- Profile/logout:

## Bug

- Critical:
- Minor:

## Keputusan

Siap lanjut: YA/BELUM
```

Nama ini bukan file otomatis. Developer membuatnya sebagai bukti pengujian pada tanggal tersebut.

