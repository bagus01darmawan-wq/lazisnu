# Perbaikan Akar Kegagalan Security (pnpm audit) — 2026-10-06

Latar: workflow Security merah di `main` dan `staging` pada job `pnpm audit`
(gerbang basis-banding `scripts/audit-baseline.mjs --strict` vs
`security/audit-baseline.json` per 2026-09-02). Temuan awal: 23 (18 di luar
basis). Commit: `b4e91c3` di `staging` (sudah push; merge ke `main` dibiarkan
apa adanya per instruksi).

## 1. Yang ditambal di akar (temuan auditnya hilang)

| Paket | Sebelum → Sesudah | Temuan yang hilang |
|---|---|---|
| `next` (web, pin exact) | 16.3.3 → 16.3.8 | CRITICAL `GHSA-vcvr-r3jv-pc5j` |
| `fastify` (backend) | 5.12.1 → 5.12.5 | 4 HIGH (`GHSA-667r-xxjv-c9mm`, `GHSA-p68q-wchp-6fh7`, `GHSA-hwr6-493r-vm6h`, `GHSA-9q9j-q6p8-xq58`) |
| `firebase-admin` (backend) | 13.8.0 → **14.5.0** (mayor) | — (mengurangi permukaan; grpc 1.14.4 tetap, lihat §3) |
| `firebase` (web) | 12.14.0 → 12.19.0 | — |
| `eslint` (web dev) | 9.14.0 → 9.39.5 | — |
| Transitif ikut bersih | `fast-uri`, `ip-address`, `@fastify/busboy`, `compression`, `source-map-js` | semua temuannya hilang |

Keputusan mayor `firebase-admin` 13 → 14: backend hanya memakai
`admin.credential.cert()` + `admin.messaging().send()` (`services/fcm.ts`),
keduanya stabil antar mayor. Syarat Node >=22 terpenuhi (Dockerfile
`node:24-alpine`, lokal v26, CI node 24). Typecheck backend bersih.

## 2. Jalan buntu yang terbukti: `pnpm.overrides`

Dua kali uji, dua kali gagal dengan pola sama:
- Tambah overrides → `pnpm install --lockfile-only` → temuan 14 → **50/51**
  (resolusi ulang menyeret downgrade: `tar` 7.5.22→6.2.1,
  `postcss`→8.4.49/8.5.23, `send`→0.18.0, `minimatch`→9.0.3).
- Cabut overrides → instal ulang → kembali 14.

Kesimpulan: **jangan pakai `pnpm.overrides` di repo ini.** Andalkan bump
induk langsung (`pnpm update --filter <workspace> <paket>`). Larangan ini
juga dicatat di pesan commit `b4e91c3`.

Catatan filter: nama workspace backend adalah `lazisnu-backend`, bukan
`backend` — `--filter backend` diam-diam tidak meng-update apa pun.

## 3. Sisa 9 temuan → masuk basis (diterima dengan alasan)

| Temuan | Alasan diterima |
|---|---|
| `brace-expansion` 1.1.18 (rantai RN codegen mobile) + 5.0.9 (rantai ts-morph) | Patch ada (1.1.21 / 5.0.12) tapi tak terjangkau: rantai RN terkunci versi React Native 0.74.1; ts-morph sudah termutakhir. Keduanya tooling dev/build, input tak tepercaya tak pernah sampai ke sana. |
| `@grpc/grpc-js` 1.14.4 (backend via google-gax) | Backend tidak menjalankan server gRPC dan tidak memakai firestore — hanya FCM. Patch 1.14.5 tak terjangkau tanpa menaikkan google-gax secara manual. |
| `@grpc/grpc-js` 1.9.16 (rantai firestore) | Firestore tidak pernah diimpor web (`grep` bersih); sisi mobile terkunci RN Firebase native. |
| `joi` 17.13.7 (rantai RN CLI mobile) | Patch 17.13.8 ada, tapi induknya terkunci versi React Native. Dev-only (validasi argumen CLI). |
| `node-forge` 1.4.0, `braces` 3.0.3, `sprintf-js` 1.0.3/1.1.3 | **Belum ada patch upstream** (`patched: <0.0.0`) — satu-satunya jalan adalah basis. |

Perintah yang dijalankan: `node scripts/audit-baseline.mjs --update`
(+ verifikasi `--strict` hijau: "Tidak ada kerentanan baru di luar basis").

## 4. Verifikasi

- `node scripts/audit-baseline.mjs --strict` → hijau (14 temuan = 14 basis).
- `tsc --noEmit` web + backend → bersih.
- `vitest` web → 8 file / 45 tes lolos.
- Backend `test:unit` → 451 lolos, 19 gagal pada 3 suite
  (`cosign`, `periodLock`, `collectionSubmission` — semuanya
  `*.integration.test.ts` yang butuh DB Supabase live; kredensial lokal
  memang tidak jalan. Tak terkait perubahan ini).

## 5. Tindak lanjut yang disengaja TIDAK dikerjakan

- Upgrade React Native 0.74.x (membuka `joi`, `grpc-js` mobile,
  `brace-expansion` 1.x, `node-forge`, `braces`) — risiko build native,
  perlu sesi sendiri + uji APK.
- `firebase-admin` 15 / `firebase` 13 bila nanti rilis (membuka
  `grpc-js` 1.14.4).
- Dependabot PR `next-16.3.6` kini kedaluwarsa (sudah 16.3.8) — bisa ditutup.
