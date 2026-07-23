# Design System Workspace

Ini "meja kerja" AI Design System Specialist kamu — gatekeeper dari `packages/design-tokens/` dan penjaga konsistensi antara desain (agent Product Designer) dan implementasi aktual.

## Alur kerja tiga agent kamu sekarang

```
   Client (kamu)
        │
        ├──► ux-auditor          (baca kode + data/, hasilkan laporan audit — dipanggil manual)
        │
        ├──► product-designer    (baca brief, desain lewat kode, USUL token baru ke proposals/)
        │         │
        │         ▼
        │    packages/design-tokens/proposals/
        │         │
        └──► design-system-specialist   (review proposal → approve/reject → canonical)
                  │
                  ▼
             packages/design-tokens/   (canonical, cuma agent ini yang boleh tulis langsung)
```

Product Designer tidak berhenti kerja sambil menunggu approval — dia jalan terus pakai nilai sementara dan menandai TODO. Kamu (client) yang memicu review lewat `/design-system-review` kapan pun dirasa perlu (misal: setelah beberapa sesi desain numpuk beberapa usulan).

## Menjalankan

Review usulan token/komponen baru:
```
opencode
/design-system-review
```

Audit konsistensi desain vs implementasi (manual, bukan terjadwal — sesuai pilihanmu):
```
/design-system-audit
```
Atau fokus ke area tertentu:
```
/design-system-audit komponen form
```

## Kenapa dokumentasi cuma Markdown, bukan Storybook

Kamu pilih ringan tanpa tooling baru — jadi dokumentasi murni Markdown di `docs/design-system/`, bukan Storybook/Zeroheight. Konsekuensinya: tidak ada preview visual interaktif otomatis, semua rujukan berbasis teks + contoh kode. Kalau nanti tim berkembang dan butuh preview visual (terutama buat onboarding desainer/dev baru), Storybook untuk sisi web bisa ditambahkan belakangan tanpa mengubah struktur token — tinggal beri tahu di sesi berikutnya kalau mau upgrade ke arah situ.

## Struktur folder

```
docs/design-system/
├── README.md         (file ini)
├── tokens.md          (referensi lengkap token approved — dijaga agent ini)
├── components.md      (katalog komponen web & native — dijaga agent ini)
├── CONTRIBUTING.md    (panduan kontribusi jangka panjang — dijaga agent ini)
└── audits/            (hasil tiap /design-system-audit)

packages/design-tokens/
├── proposals/          (Product Designer nulis usulan di sini)
├── CHANGELOG.md         (dijaga agent ini — breaking change ditandai jelas)
└── ...                  (token canonical — hanya agent ini yang tulis langsung)
```

## Peran kamu sebagai client

- Picu `/design-system-review` secara berkala supaya usulan Product Designer tidak menumpuk lama
- Jadi penengah kalau Product Designer dan Design System Specialist "berbeda pendapat" soal sebuah usulan (reject dengan alasan yang menurutmu kurang tepat, misalnya)
- Putuskan kalau suatu saat mau upgrade ke Storybook atau sistem cross-platform beneran (react-native-web/Tamagui) — itu keputusan besar yang sengaja tidak diambil otomatis oleh agent ini
