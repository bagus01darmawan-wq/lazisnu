# Tambal 6 Advisory Baru di Luar Basis Audit — 2026-10-12

Latar: workflow **Security** merah di `staging` pada job `pnpm audit`
(gerbang basis-banding `scripts/audit-baseline.mjs --strict` vs
`security/audit-baseline.json` terakhir diperbarui 2026-10-06T05:46:18Z).
Basis lama mencatat 10 ID; audit terkini menghasilkan 16 ID unik, sehingga
**6 advisory baru di luar basis** menggagalkan CI. Merahnya sudah sejak
minimal 2026-10-09 (PR Dependabot `@aws-sdk` dan `@types/node` ikut gagal),
bukan akibat perubahan kode apa pun — `git diff` antar commit tidak
menyentuh `package.json`/`pnpm-lock.yaml`.

Commit: `c7cbbd2` dan `262f7e4` di `staging` (sudah push). Workflow
`Security` kembali hijau (run 38192686731, `completed success`).

## 1. Rekonsiliasi angka (sering tertukar)

Empat angka beredar dan memakai satuan hitung berbeda, sehingga tidak bisa
langsung dijumlahkan:

```
pnpm audit (per jalur) ................ 20
  └─ advisory unik ................... 16   ← 4 selisih = jalur dobel
       ├─ 6 BARU (luar basis) ............. → menggagalkan CI
       └─ 10 SUDAH DI BASIS
            ├─ 7 = alert Dependabot OPEN .. → tidak menggagalkan CI
            └─ 3 = sudah DISMISS (tolerable_risk)
```

| Hitungan | Jumlah | Arti |
|---|---|---|
| `pnpm audit` (per jalur) | 20 | advisory × jalur; dobel untuk paket multi-jalur |
| advisory unik | 16 | = 6 baru + 10 di basis |
| temuan baru | 6 | di luar basis → mematikan CI |
| alert Dependabot terbuka | 7 | sudah di basis → tidak mematikan CI |

Empat kelebihan hitungan per jalur berasal dari `sharp` (2 jalur:
`apps/mobile>sharp` dan `apps/web>next>sharp`), `sprintf-js` (2 jalur:
`ioredis-mock>fengari` dan `jest>…>argparse`), dan `uuid` (3 jalur).
Cek silang per severity cocok persis: critical 3=3, low 1=1, high 6 unik → 7
(sharp dobel), moderate 6 unik → 9 (sprintf-js +1, uuid +2).

Enam temuan baru **tidak beririsan** dengan tujuh alert Dependabot:
advisory-nya terbit setelah basis diperbarui 2026-10-06, jadi belum pernah
sampai ke Dependabot.

## 2. Enam temuan baru dan perbaikannya

| Severity | Paket | Sebelum → Sesudah | Jalur | Temuan yang hilang |
|---|---|---|---|---|
| HIGH | `sharp` | 0.35.4 → **0.35.5** | `next>sharp` (runtime prod) + mobile | `GHSA-wq5f-xc86-pv6w` |
| MODERATE | `fast-jwt` | 6.3.2 → **6.3.4** | `@fastify/jwt` → middleware auth backend | `GHSA-x937-hj6v-793p` |
| CRITICAL | `shell-quote` | 1.9.0 → **1.11.0** | React Native CLI (tooling) | `GHSA-pqg4-j6r4-53mv` |
| CRITICAL ×2 + MODERATE | `handlebars` | 4.7.9 → **4.7.10** | `ts-jest` (test saja) | `GHSA-8r5x-fm3f-whwj`, `GHSA-p8wg-vrv2-v86f`, `GHSA-xw65-4hp5-5hc7` |

Dua di antaranya justru **dikunci oleh pin override buatan repo sendiri** di
`pnpm-workspace.yaml` (`'sharp': 0.35.4` dan `'shell-quote': 1.9.0`) — pin
yang ketinggalan sehingga `pnpm audit` terus melaporkan versi pin-nya.
Keempat versi patch sudah diverifikasi ada di registry.

`fast-jwt` memakai override biasa (bukan upgrade induk) karena
`@fastify/jwt@10.2.2` mensyaratkan `fast-jwt: ^6.2.4` dan 6.3.4 masih masuk
rentang itu — plugin tetap kompatibel. Ini melanjutkan pendekatan yang sudah
dipakai sejak `@fastify/jwt` dinaikkan 8 → 10; komentar lama yang menyebut
masalahnya "selesai lewat upgrade dan bukan override" ikut diperbarui karena
kini memang memakai override.

Komentar nyasar `# shell-quote <=1.8.4 (CVE-2026-XXXXX) — naik dari 1.8.4
(di atas)` di blok US1 ikut dihapus: menggantung di tempat yang salah dan
merujuk keputusan yang sudah lewat.

## 3. Keputusan: basis audit TIDAK diubah

`security/audit-baseline.json` sengaja tidak disentuh. Alasannya:

1. Enam temuan itu **tidak pernah ada di basis**, jadi begitu hilang otomatis
   tidak ada yang usang — `--strict` lolos dengan `temuan 10 = basis 10`.
2. Menjalankan `--update` saat masih ada temuan baru akan **menelannya diam-diam**
   ke dalam basis tanpa justifikasi, yang justru menghilangkan alarm.

Hati-hati untuk pekerjaan lanjutan: `--strict` **menggagalkan** CI bila ada
entri basis yang sudah tidak muncul lagi (blok `BASIS USANG`). Jadi meng-fix
temuan yang **sudah** di basis wajib diikuti `--update`, sedangkan meng-fix
temuan yang **belum** di basis tidak butuh perubahan basis sama sekali.

## 4. Verifikasi

- `node scripts/audit-baseline.mjs --strict` → **exit 0**, `temuan 10 = basis 10`,
  tanpa blok `KERENTANAN BARU` dan tanpa blok `BASIS USANG`.
- `pnpm install` sukses (P0: +4/−3 paket; P1: selesai 19.5s).
- Biner native `sharp` 0.35.5 lolos smoke test (libvips 8.18.7, encode PNG sukses).
- `pnpm build:web` sukses — seluruh route ter-buat.
- `shell-quote` 1.11.0 dan `handlebars` 4.7.10 lolos smoke test render.
- `tsc --noEmit` web, backend, dan mobile → bersih.
- `vitest` web → 8 file / 45 tes lolos.
- Backend jest → **identik dengan sebelum perubahan**: 53 suite lulus, 19 tes
  gagal pada 3 suite (`cosign`, `periodLock`, `collectionSubmission`).

Catatan atas 3 suite integrasi itu: kini keterangannya lebih presisi dari
dokumen 2026-10-06. Supabase pooler **memang terjangkau** dari mesin lokal
(`.env` menunjuk `aws-1-ap-southeast-1.pooler.supabase.com:6543`), tetapi
gagalnya karena **pelanggaran foreign key saat pembersihan data test** —
`delete from "branches"` diblokir `period_drafts_branch_id_branches_id_fk`
karena sisa data dari run sebelumnya. Tak terkait perubahan dependensi;
semua tes `src/middleware/__tests__` (termasuk jalur auth) lulus.

## 5. Catatan: overrides kini berfungsi (melengkapi dokumen 2026-10-06)

Dokumen `perbaikan-akar-audit-2026-10-06.md` §2 menyimpulkan **"jangan pakai
`pnpm.overrides` di repo ini"** setelah dua kali uji memicu resolusi ulang
yang menyeret downgrade (`tar`, `postcss`, `send`, `minimatch`).

Kesimpulan itu **sudah tidak berlaku untuk keadaan sekarang**, dan
pekerjaan ini membuktikannya: empat override ditambahkan, `pnpm install`
bersih, tidak ada paket yang ter-downgrade, dan gerbang audit lolos.
Penyebabnya ada di dua perubahan struktural:

- Overrides dipindahkan dari field `pnpm` di `package.json` (diabaikan sejak
  pnpm 10) ke `pnpm-workspace.yaml`, tempat pin diterapkan aktif oleh
  pnpm 10+ — kini ada 41 baris override di file itu dan commit `e804ebd`
  sebelumnya sudah memperbaruinya.
- Selektor per-major (`'brace-expansion@>=2 <5'`, `'tar@7'`, dst.) mencegah
  versi yang sudah aman di tree ikut tertarik.

Dokumen 2026-10-06 tidak diubah — ia tetap catatan yang akurat untuk
keadaan saat itu.

## 6. Tindak lanjut yang belum dikerjakan

### P2 — dua alert yang patch-nya ada tapi ditahan

| Paket | Terpasang → Target | Jalur | Status |
|---|---|---|---|
| `@grpc/grpc-js` | 1.9.16 → 1.14.6 | `@react-native-firebase/app > firebase > @firebase/firestore` (mobile) | ditahan |
| `image-size` | 1.2.1 → 2.0.4 (mayor) | `@react-native/metro-config > metro` (mobile) | ditahan |

Keduanya **berbenturan dengan keputusan terdokumentasi**:

- `perbaikan-akar-audit-2026-10-06.md:46` — "Firestore tidak pernah diimpor
  web (`grep` bersih); sisi mobile terkunci RN Firebase native."
- `tinjauan-ulang-perbaikan-akar-2026-10-06.md:167` — "bump minor 1.9→1.13+
  berisiko runtime, **TIDAK dicoba**."
- `tinjauan-ulang-perbaikan-akar-2026-10-06.md:207` — image-size "Patch
  ≥2.0.3 = mayor; metro terkunci RN 0.74.1 … Lepas via upgrade RN."

**Dua bukti baru** ditemukan pada 2026-10-12 yang melemahkan alasan di atas:

1. Firestore **tidak pernah diimpor di mana pun** — `grep` di `apps/mobile`,
   `apps/web/src`, dan `apps/backend/src` semuanya bersih. Jalur `grpc-js`
   itu terpasang tapi **tidak pernah dieksekusi**, jadi risiko "runtime"
   bersifat teoritis. (`@react-native-firebase` hanya dipakai di
   `src/config/crashlytics.ts`.)
2. `image-size` **kini bisa diverifikasi nyata**: bundling metro tanpa
   Android SDK (`react-native bundle --platform android --dev false`) lulus
   pada keadaan sebelum perubahan (bundle + 7 asset disalin), jadi major bump
   1.2.1 → 2.0.4 bisa diuji sungguhan, bukan sekadar diandaikan.

Keputusan 2026-10-12: **tidak jadi dikerjakan** tanpa persetujuan eksplisit,
karena membalik keputusan terdokumentasi. Bila nanti disetujui, urutannya:

1. Di `pnpm-workspace.yaml`: ganti
   `'@grpc/grpc-js@>=1.14.0 <1.14.5': 1.14.5` menjadi `'@grpc/grpc-js': 1.14.6`
   (menaikkan 1.9.16 dan 1.14.5 sekaligus; keduanya upgrade, bukan downgrade),
   dan tambahkan `'image-size': 2.0.4`.
2. `pnpm install`, lalu **wajib** `node scripts/audit-baseline.mjs --update`
   — keempat ID itu (`GHSA-m9gg-hp2v-232j`, `GHSA-f596-whhp-79r4`,
   `GHSA-w3rx-r6r6-pgpr`, `GHSA-5p2g-fcmc-qvqq`) akan menjadi BASIS USANG.
   Basis turun 10 → 6.
3. Verifikasi: `tsc --noEmit` mobile, `jest` mobile, dan bundling metro
   (bandingkan jumlah asset dengan baseline 7).
4. Perbarui juga komentar `# image-size <=2.0.2: NO-FIX — akan di-dismiss
   berjustifikasi.` di `pnpm-workspace.yaml` yang sudah basi, plus baris 135
   di `.github/workflows/security.yml` yang masih menyebut image-size tanpa
   patch, dan `tinjauan-ulang-…:207`.

### P3 — tiga alert tanpa patch

`braces` 3.0.3, `node-forge` 1.4.0, `sprintf-js` 1.1.3 — versi terpasang
**sama dengan versi terbaru npm**, jadi memang tidak ada yang bisa
di-upgrade. Tindakannya dokumentasi, bukan kode:

- Tulis justifikasi permanen (preseden sudah ada di `pnpm-workspace.yaml`
  baris komentar `Transitive rentan — diblokir dependabot
  (security_update_not_possible)`).
- Opsional: dismiss manual di Dependabot dengan alasan
  `security_update_not_possible` → alert turun 7 → 3.
- Opsional/riset: naikkan induk agar transitivenya hilang — `sprintf-js`
  via `argparse`/`js-yaml` (jest) dan `ioredis-mock`; `node-forge` via
  `@expo/cli`; `braces` via `jscodeshift`.

Tiga alert yang sudah **DISMISS** di Dependabot dengan alasan
`tolerable_risk`: `esbuild`, `fast-xml-parser`, `uuid` — tetap masuk hitungan
`pnpm audit` sehingga tetap harus ada di basis.
