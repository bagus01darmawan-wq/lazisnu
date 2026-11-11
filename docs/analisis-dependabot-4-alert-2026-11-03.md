# Analisis 4 Alert Dependabot Terbuka — Temuan & Tindakan Lanjutan

Tanggal: 3 November 2026
Repo: `bagus01darmawan-wq/lazisnu`
Status: **analisis selesai; tindakan direkomendasikan sudah dieksekusi 3 Nov 2026** —
`ip-address` diperbaiki (PR #179, commit `d24d070`, 10.7.5 di staging, alert #221 auto-`fixed`);
#236/#235/#233 didismiss `tolerable_risk` dengan komentar dari draf di bawah. Open alerts
Dependabot: **0**. CodeQL #72/#73 ditutup terpisah lewat PR #178.
Metode: diagnosis REAL vs PHANTOM sesuai `references/audit-baseline-gate.md` (skill lazisnu-infra-ops) —
peta jalur `pnpm why <pkg> -r`, keberadaan fisik, import di source, keterjangkauan API rentan.
Sumber: `pnpm audit --json`, Dependabot API, pnpm-lock.yaml. Semua pembacaan, nol perubahan graf.

---

## Ringkasan eksekutif

| # | Paket | GHSA | Severity | Rentan di tree | Patch upstream | Jalur | Vonis | Tindakan |
|---|---|---|---|---|---|---|---|---|
| 236 | minimatch | GHSA-g3hv-75wg-m249 | medium | 3.1.5, 9.0.9, 10.2.5, 10.2.6 | **≥11.0.1** (major) | eslint, jest/ts-jest/babel-jest, ts-morph — **tooling** | PHANTOM-runtime | Terima; dismiss alert; pantau naiknya jest/eslint |
| 235 | glob | GHSA-3g3m-2fjr-6pw4 | medium | 10.5.0, 13.0.6 | **≥14.0.2** (major) | jest reporters, ts-jest — **tooling** (7.2.3 tidak rentan) | PHANTOM-runtime | Terima; dismiss alert; idem |
| 233 | deepmerge | GHSA-gcqx-w48m-w2h4 | low | 4.3.1 | **TIDAK ADA** (`patched: <0.0.0`) | jest-config — **tooling**; nol import di source | Tidak bisa di-fix upstream | Terima permanen; dismiss alert |
| 221 | ip-address | GHSA-rxp7-6hxx-x8q5 | moderate | 10.7.3 | **≥10.7.4 (patch bump!)** | `@fastify/rate-limit` → **RUNTIME backend** | REAL | **Fix segera** — pnpm up biasa, tanpa override |

Satu-satunya yang layak dan murah untuk diperbaiki: **ip-address**. Tiga lainnya: tidak bisa
di-fix murah (major bump tooling) atau tidak bisa di-fix sama sekali (deepmerge) — dan tidak ada
yang sampai ke runtime produksi.

---

## 1. ip-address GHSA-rxp7-6hxx-x8q5 — REAL, di runtime, murah ditambal (TINDAKAN UTAMA)

**Advisory:** "Address6 matches a zone identifier in quadratic time ahead of its length limit,
allowing a single long string to stall the process" — ReDoS-like: satu string panjang buatan
menggantung proses (stall, bukan crash). Rentan `<=10.7.3`; tertambal `>=10.7.4` (**patch**).

**Jalur:** `apps/backend → @fastify/rate-limit@11.2.0 → ip-address@10.7.3` — satu-satunya
pemakai; runtime backend produksi.

**Keterjangkauan (terbaca di kode `@fastify/rate-limit/index.js`):**

```js
const { Address6 } = require('ip-address')          // baris 4
const address = new Address6(ip)                     // baris 37 — ip = request.ip
return new Address6(`${ip}/${ipv6Subnet}`).startAddress().correctForm()  // baris 44
```

`request.ip` adalah data berasal dari klien. **Mitigasi yang sudah berdiri:** sejak tahap 2
(trustProxy CIDR, PR #171), `request.ip` = alamat sumber TCP nyata — Fastify mengambil entri
paling kanan yang tidak-tepercaya dari XFF, dan entri itu ditambahkan nginx dari koneksi nyata
(terbukti probe 2 Nov: karangan klien diabaikan). Jadi lewat jalur nginx, string panjang buatan
**tidak bisa masuk** sebagai `request.ip`.

**Mengapa tetap fix (bukan terima):**
1. Biayanya patch bump satu baris — range `^10.2.0` di `@fastify/rate-limit` sudah mengizinkan
   10.7.4, cukup `pnpm up ip-address -r`, tanpa override, tanpa risiko API.
2. Pertahanan berlapis: jalur langsung ke backend **tetap ada** untuk siapa pun di VM
   (`127.0.0.1:3001`, jaringan Docker — lihat K1 dokumen penyelidikan). Di sana `request.ip`
   persis seperti yang dikirim.
3. Kita baru saja menaikkan batas rate-limit (tahap 3) — komponen yang mem-parse IP klien layak
   berada di versi tertambal.

**Cara fix:** `pnpm up ip-address -r` → bersihkan entri `GHSA-rxp7-6hxx-x8q5` dari
`security/audit-baseline.json` (entri jadi basi; `--strict` akan menolak entri yang tidak muncul
lagi) → jalankan `node scripts/audit-baseline.mjs --update` lalu `--strict` → PR kecil.
**Jangan dismiss alert Dependabot #221** — setelah merge ia hilang sendiri.

---

## 2. minimatch GHSA-g3hv-75wg-m249 — tooling, major bump, tetap diterima

**Advisory:** DoS via globparts amplification. Rentan `<11.0.1`; tertambal `>=11.0.1` (major).

**Versi di tree & jalurnya (semua dev tooling):**

| Versi | Jalur |
|---|---|
| 3.1.5 | @typescript-eslint/eslint-plugin + type-utils (resolusi peer) — lint |
| 9.0.9 | ts-jest, babel-jest — uji |
| 10.2.5 | ts-morph → @ts-morph/common (codegen scripts/) + devDep root |
| 10.2.6 | rantai jest/eslint lain |

**Nol pemakaian runtime:** backend runtime = stack Fastify; web = Next; mobile = bundle RN.
minimatch tidak di-import oleh satu pun source aplikasi (verifikasi grep).

**Mengapa tidak di-fix:** menutup berarti memaksa minimatch 11 ke semuanya — major bump lintas
jest 29/30, ts-jest, babel-jest, @typescript-eslint, ts-morph secara serentak. Pola risiko ini
sudah pernah dihindari secara disiplin (selector sempit
`@typescript-eslint/typescript-estree>minimatch` ada justru karena itu). Gain keamanannya nol:
tooling tidak menerima input dari luar.

**Tindakan lanjutan:** dismiss alert #236 dengan justifikasi (draf di bawah); ikuti secara
pasif — saat jest/eslint/ts-morph merilis versi yang membawa minimatch ≥11 secara alami, naikkan
biasa dan bersihkan entri basis via `--update`.

---

## 3. glob GHSA-3g3m-2fjr-6pw4 — tooling, major bump, tetap diterima

**Advisory:** "AbortSignal cancellation bypass allows post-timeout filesystem traversal".
Rentan `>=9.0.0 <=14.0.1`; tertambal `>=14.0.2` (major). glob 7.2.3 (babel-jest 29) **di luar**
rentang rentan — tidak kena.

**Versi kena:** 10.5.0 (jest reporters via babel-jest 30), 13.0.6 (ts-jest/jest-runtime).
Semua test tooling; nol runtime; nol input dari luar.

**Mengapa tidak di-fix:** glob 10/13 → 14 adalah major bump ke rantai jest — risiko yang sama
dengan minimatch, gain yang sama (nol).

**Tindakan lanjutan:** dismiss alert #235 dengan justifikasi; idem — ikut naik saat tooling naik.

---

## 4. deepmerge GHSA-gcqx-w48m-w2h4 — tidak bisa di-fix upstream, terima permanen

**Advisory:** "mergeObject() allows prototype poisoning of returned objects" (low).
Rentan `>=4.2.0 <=4.3.1`; **tertambal `<0.0.0` — upstream belum merilis versi tetambal**.

**Jalur:** `apps/backend → jest → @jest/core → jest-config → deepmerge@4.3.1` — satu-satunya
jalur; test tooling. **Nol import di source** (grep `apps/*/src`, `packages/*/src` kosong).
Prototype poisoning hanya relevan bila menggabungkan input tidak-tepercaya — jest-config
menggabungkan konfigurasi yang kita tulis sendiri.

**Tindakan lanjutan:** dismiss alert #233 dengan justifikasi; entri basis tetap. Pantau
advisory — bila upstream merilis patch, naikkan dan bersihkan basis.

---

## Draf komentar dismissal (batas GitHub 280 karakter)

**#236 minimatch:**
```
Diterima di basis audit (PR #172): semua jalur dev tooling (eslint, jest, ts-morph), nol runtime.
Fix = major bump minimatch 11 lintas jest/ts-jest/@typescript-eslint serentak — risiko tooling,
gain nol (nol input eksternal). Ikut naik saat tooling utama membawa minimatch >=11.
```

**#235 glob:**
```
Diterima di basis audit (PR #172): jalur jest reporters/ts-jest (test tooling), nol runtime;
glob 7.2.3 di luar rentang rentan. Fix = major bump glob 14 di rantai jest — risiko tooling,
gain nol. Ikut naik saat jest naik ke versi yang membawa glob >=14.0.2.
```

**#233 deepmerge:**
```
Tidak ada versi tertambal upstream (patched: <0.0.0). Jalur jest-config (test tooling), nol
import di source aplikasi, tidak menerima input tidak-tepercaya. Diterima di basis audit;
pantau rilis upstream, naikkan saat patch tersedia.
```

(#221 ip-address **tidak** di-dismiss — di-fix; alert hilang sendiri setelah merge.)

---

## Catatan divergensi basis data

`pnpm audit` (npm audit DB) dan Dependabot (GitHub advisory DB) **tidak identik**:
- `follow-redirects` + `joi` (diperbaiki PR #172) muncul di pnpm audit, tidak di Dependabot.
- `uuid` (GHSA-w5hq-g745-h8pq) ada di basis audit tapi tidak jadi alert Dependabot terbuka.
Karena itu dua gerbang harus dipantau keduanya; yang satu hijau belum tentu yang lain hijau.
Runbook `audit-baseline-gate.md` sudah mencatat fenomena ini (kasus tmp 0.2.6).
