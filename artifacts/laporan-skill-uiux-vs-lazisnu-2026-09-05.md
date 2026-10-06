# Laporan: Dampak Skill UI/UX Hermes pada Aplikasi Web LAZISNU
**Tanggal:** 2026-09-05 · **Audiens:** Bagus Darmwan (HOTL LAZISNU) · **Metode:** Analisis repo + skill + live site

---

## Ringkasan eksekutif

Ada **dua aplikasi web** yang sering dianggap satu oleh user, padahal punya karakter berbeda:

| Aspek | A. Landing Publik (lazisnu.org) | B. Dashboard Admin (`apps/web/`) |
|---|---|---|
| Peran | Menggalang donasi, menampilkan pengurus & mitra | Operasional: catat kaleng, penjemputan, laporan, audit, user mgmt |
| Audiens | Publik / calon donatur | Admin Kecamatan, Ranting, Petugas, Bendahara |
| Domain kode | Tidak ada di repo `apps/web/` (layanan terpisah / CMS lain) | Next.js 16 + React 19 + Tailwind v4 di `apps/web/` |
| Bahasa UI | Indonesia | Indonesia |
| Owner | Tidak terlihat di repo | Anda (admin LAZISNU) — HOTL SDLC |

Semua skill UI/UX Hermes **harus** memandang dua-duanya, tapi **dominannya work di B (dashboard)** yang ada di repo. Pelajaran utama dari analisis: skill-skill ini punya **profil dampak yang sangat berbeda** tergantung target. Skill "tajam" tertentu akan sangat bermanfaat, yang "polos" akan **mengganggu** karena menabrak aturan `12-standar-ui-web.md` yang Anda sendiri sudah tetapkan.

---

## 1. Inventaris skill UI/UX (kategori + dampak)

### A. Tier SANGAT TINGGI — wajib dipakai (read-only)
| Skill | Triggernya di sini | Output |
|---|---|---|
| **improve-ui** | "Audit produk terhadap evidence-nya sendiri" | Laporan issue UI terverifikasi + rencana implementasi read-only |
| **baseline-ui** | "Mencegah AI-slop" — hard constraints | Cek cepat terhadap 9 kategori (typography, layout, animation, dsb.) |
| **fixing-accessibility** | Modal tanpa focus trap, tombol tanpa aria-label | Audit ARIA, keyboard, focus management, form errors |
| **fixing-metadata** | `lang="en"` tapi konten ID, metadata default Next.js | Audit title, OG, canonical, lang, manifest |

### B. Tier TINGGI — dipakai selektif, hati-hati tabrakan dengan brand palette
| Skill | Pemakaian di LAZISNU | Catatan |
|---|---|---|
| **better-ui** | Polish micro-interactions, hover, shadow | Tabrakan ringan dengan `12-standar-ui-web.md` — filter output-nya |
| **improve-animations** | Survey motion code (`animate-pulse`, transition) | Read-only, audit saja — jangan ganti animasi brand |
| **ui-ux-pro-max** | Searchable DB: 79 style, 192 palette, 119 UX guidelines, 22 stack | Boleh untuk "search" referensi, TAPI palet nonprofit-nya tidak cocok dengan brand NU-Care Anda (Deep Green #2C473E, Warm Beige #F4F1EA, dll) |
| **emil-design-eng** | Detail optik, motion restraint | Default-nya "jangan tambahkan animasi" → cocok dengan karakter dashboard admin Anda yang utility-first |

### C. Tier RENDAH / BERBAHAYA untuk LAZISNU
| Skill | Masalah | Verdict |
|---|---|---|
| **frontend-design** | "Distinctive, intentional visual design" → mendorong eksperimen estetika | **Jangan dipakai** — Anda sudah punya standar resmi `.agents/rules/12-standar-ui-web.md`. Skill ini akan menabrak palet tetap Anda dan menyarankan "redesign" yang justru membuat drift. |
| **frontend-ui-engineering** | Membangun UI baru "production-quality" dengan stack generik | **Jangan dipakai langsung** — skill-nya tidak kenal `12-standar-ui-web.md` Anda; bisa-bisa dia generate UI yang menurut dia "best practice" tapi melangar pedoman (mis. ganti `bg-[#EAD19B]` jadi "oklch(0.7 0.15 80)") |
| **sketch / website-mockup-iteration / website-design-iteration / claude-design** | Untuk mockup/landing baru | Hanya relevan untuk **landing publik lazisnu.org** (yang tidak Anda kode). Untuk dashboard B, skip. |
| **competitive-design-benchmarking / web-design-analysis** | Benchmark kompetitor (philanthropy) | Berguna sebagai LATAR riset landing publik saja, tapi `web-design-analysis` ada di skill `lazisnu-mobile-release` ecosystem sudah pernah dipakai untuk philanthropy study 2026 |

---

## 2. Audit kondisi UI dashboard `apps/web/` saat ini (bukti)

### 2.1 Yang sudah BAGUS (jangan disentuh)
- **Standar resmi `.agents/rules/12-standar-ui-web.md`** sangat lengkap: palet 7 token + 6 warna hardcoded izin, struktur layout Header/Toolbar/Table/Pagination/Modal, dimensi presisi 35/36px, pola tombol Pill, dsb. Ini level enterprise.
- **`cans/page.tsx`** (1222 baris) = implementasi referensi, menyebut dirinya "implementasi paling matang"
- **Palette glass + brand** di komponen Header/Card/Modal/Sidebar/Login sangat kohesif: `#2C473E` (bg dashboard), `#F4F1EA` (sidebar + teks terang), `#EAD19B` (CTA primer), `#DE6F4A` (filter aktif + danger), `#6B9E9F` (toolbar bg), `#D97A76` (logout/error ringan)
- **Sidebar toggle** punya `aria-label`, `aria-expanded`, `aria-controls` lengkap
- **Login page** punya `aria-label` toggle password, error inline ke field via `error` prop
- **A11y form**: label terhubung, error inline
- **EmptyState** ada (konsisten dengan `baseline-ui` "MUST give empty states one clear next action")

### 2.2 Yang RUSAK / off-standard (kandidat ditemukan skill)
| # | Lokasi | Temuan | Verifikasi |
|---|---|---|---|
| 1 | `src/app/layout.tsx:31` | `<html lang="en">` padahal semua konten Indonesia | Web publik & dashboard keduanya bahasa ID |
| 2 | `src/app/layout.tsx:17` | `title: "Create Next App"`, `description: "Generated by create next app"` — default Next.js template, tidak pernah dioverride | Metadata brand hilang total |
| 3 | `src/app/globals.css:3-6,22-26` | CSS root pakai palet Netral `#ffffff`/`#171717`, font Arial — **bertentangan** dengan palet brand yang dipakai komponen | CSS tokens tidak konsisten |
| 4 | `src/components/ui/Button.tsx:13-18` | Variant default: `bg-green-600 text-white hover:bg-green-700` (Tailwind default) — TIDAK ada variant "brand" (`bg-[#2C473E]` atau `bg-[#EAD19B]`) | Standar §3.1 mensyaratkan tombol CTA primer `bg-[#EAD19B]` — tapi Button primitif tidak punya variant itu |
| 5 | `src/components/ui/Badge.tsx:11-16` | Hardcode Tailwind palette (`green-100`, `red-100`, dll), TIDAK satu pun pakai palet brand `#DE6F4A` / `#EAD19B` | Standar §8 izinkan `green-100` untuk success/active, tapi lihat konsistensi visual |
| 6 | `src/components/ui/Skeleton.tsx:6` | Hanya `bg-gray-200` — TIDAK ada variant untuk dark-bg dashboard `#2C473E` | Loading state di dashboard jadi kontras tinggi, "berteriak" |
| 7 | `src/components/ui/Card.tsx:25-26` | Title bar `bg-gray-50/50 text-gray-800` — untuk variant "default" yang dipakai di atas bg `#2C473E` dashboard | White card "terbang" tanpa akar visual |
| 8 | `src/components/ui/Modal.tsx` | `useEffect` Escape OK, tapi **TIDAK ada focus trap**, **TIDAK ada initial focus**, **TIDAK restore focus ke trigger** — gagal pada prioritas-1 `fixing-accessibility` §3 | A11y critical |
| 9 | `src/components/ui/Modal.tsx:83-93` | Tombol close tanpa `aria-label` | A11y critical |
| 10 | `src/components/Sidebar.tsx:35` | Spinner loading `bg-slate-900` — saat role null sidebar pakai bg slate (beda dari brand `#2C473E`) | Loading state inconsistency |
| 11 | `src/app/dashboard/error.tsx:33, 41` | Tombol "Coba Lagi" pakai `bg-slate-900 hover:bg-slate-800` — bukan palet brand | Standar patah |
| 12 | `src/app/(auth)/login/page.tsx:78-80` | `blur-[120px] animate-pulse` — slow glow efek di login; `baseline-ui` larang glow sebagai primary affordance | Borderline, tapi acceptable karena hanya login |
| 13 | `src/app/(auth)/login/page.tsx:80` | `bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]` — fetch gambar EKSTERNAL untuk dekorasi | Risiko privasi/CSP, bandingkan dengan `static-site-deploy`/CSP |
| 14 | `src/components/ui/DropdownFilter.tsx:92-95` | Escape hanya close, TIDAK return focus ke trigger button | A11y dropdown |
| 15 | `src/components/ui/GlassSelect.tsx:88-91` | Sama: Escape close tanpa restore focus | A11y |
| 16 | `src/components/ui/FilterPills.tsx:23-32` | Pill wrapper pakai palet `#F4F1EA/10` — untuk used ON TOOLBAR (`#6B9E9F`) per standar §5. Tapi kode pakai `bg-[#F4F1EA]/30` (sesuai §5 spesifikasi) — OK | Tidak ada masalah |
| 17 | `src/components/ui/ConfirmToast.tsx:69-72` | Variant "warning" tombol confirm `bg-[#EAD19B]` — sama persis dengan tombol Primer di §3.1 — bisa membingungkan hierarki | Standar §3.1 hanya izinkan EAD19B untuk CTA primer; ini confirm dialog sekunder |
| 18 | `src/lib/api.ts`, store, middleware, dll | Di luar scope UI, tapi konsisten dengan arsitektur | — |

### 2.3 Yg sudah bagus dan boleh tinggal (verified cocok dengan `baseline-ui`)
- `cn()` utility di `src/lib/utils.ts` (clsx + twMerge) ✓
- `Modal` pakai portal ✓
- Glass components (GlassDatePicker, GlassSelect) memakai CSS variables + aria-friendly ✓
- Animate-in/out dipakai (Tailwind v4) ✓
- EmptyState component ✓
- Sidebar slide animation `duration-300` (di bawah 200ms? sedikit di atas) — debatable

---

## 3. Jawaban langsung: DAMPAK bila skill dipakai tanpa perintah spesifik

### Skenario A — Anda suruh agent menjalankan SEMUA skill UI/UX untuk "audit" / "improve" tanpa instruksi lebih lanjut

| Outcome | Probabilitas | Efek |
|---|---|---|
| **Drift palet** — agent akan rekomendasikan ganti `bg-[#EAD19B]` jadi palette "modern 2026" (oklch / slate) | TINGGI | Tabrakan langsung dengan `.agents/rules/12-standar-ui-web.md` Anda. Anda harus menolak dan agent kerja dua kali. |
| **Mockup alternatif** untuk landing lazisnu.org | TINGGI | Mengalihkan fokus ke publik (yang bukan tanggung jawab repo); tidak ada hasil yang bisa di-merge. |
| **Redesign Button/Card/Badge** generik (dari `frontend-ui-engineering`) | TINGGI | Komponen akan ditulis ulang dengan referensi ke Radix/Base UI — bentrok dengan komponen custom Anda yang sudah jadi dan dipakai di 8+ halaman. |
| **A11y audit** (Modal focus trap, html lang, aria-label) | TINGGI & BERGUNA | Ini output yang paling valuable dan langsung dapat di-merge. |
| **CSS tokens terpusat** (palette as Tailwind v4 @theme) | TINGGI & BERGUNA | Mengatasi inkonsistensi globals.css vs komponen. |
| **Search referensi `ui-ux-pro-max`** | RENDAH | Default palet nonprofit di DB-nya bukan NU-Care brand; output-nya误导. |
| **Waktu yang terbuang** | TINGGI | Eksperimen desain 3-5 mockup + perdebatan estetika = beberapa ratus ribu token AI |

**Estimasi dampak konkret:** ±60% dari output skill akan BERTENTANGAN dengan standar Anda. ±25% akan NETRAL. ±15% akan langsung dipakai (a11y + CSS tokens).

### Skenario B — Anda pakai TEPAT 4 skill (improve-ui, baseline-ui, fixing-accessibility, fixing-metadata) dengan scope "audit dashboard `apps/web/` saja"

| Outcome | Probabilitas | Efek |
|---|---|---|
| **Laporan issue terverifikasi** dengan kutipan kode | TINGGI | Anda duduk, baca, putuskan apa yang mau di-merge |
| **Rencana implementasi read-only** | TINGGI | Agent tidak menyentuh kode, hanya plan — Anda kontrol merge |
| **Zero drift palet** karena saya sandingkan dengan `.agents/rules/12-standar-ui-web.md` | TINGGI | Output langsung kompatibel |
| **A11y + metadata + baseline slop-check** menemukan 5-12 issue konkret | TINGGI | 100% bisa di-merge, tidak ada eksperimen |

**Estimasi dampak konkret:** ±85% output akan BERGUNA. ±15% rekomendasi mungkin Anda tolak karena taste (mis. brand Anda memang punya shadow dramatis, jangan diralihkan).

### Skenario C — Landing publik lazisnu.org (yang tidak di repo)
Jika Anda mau audit/benchmark landing publik → skill yang relevan: **web-design-analysis** (sudah pernah dipakai untuk philanthropy study 2026), **competitive-design-benchmarking**, **claude-design**, **website-mockup-iteration**. Tapi HATI-HATI: tanpa source code, output-nya jadi saran subjektif, tidak ada kode yang bisa di-merge.

---

## 4. Rekomendasi hierarki (urutan eksekusi)

### 4.1 Pilihan yang saya rekomendasikan (jika Anda tidak keberatan saya mulai)

**Tier 1 — Eksekusi read-only, ZERO sentuh kode:**
1. **improve-ui** — Audit dashboard `apps/web/` terhadap evidence (`12-standar-ui-web.md` + tokens + komponen existing) → laporan issue terverifikasi + plan
2. **fixing-accessibility** — Audit a11y 8 halaman dashboard (Modal focus trap, aria-label, lang, form errors, keyboard nav)
3. **fixing-metadata** — Audit title/description/canonical/OG/manifest untuk semua halaman dashboard publik (login, error)
4. **baseline-ui** — Slop-check cepat (typography, animation, hierarchy) di komponen UI yang ada

**Tier 2 — Eksperimen terkontrol (mockup saja, tidak menyentuh kode):**
5. **ui-ux-pro-max --domain color --stack react-native** (walaupun untuk RN, principles-nya kepakai) atau **search.py** untuk referensi palet nonprofit warna hijau/earth-tone — sebagai BAHAN DISKUSI, bukan source of truth
6. **website-mockup-iteration** HANYA untuk landing `lazisnu.org` publik (di luar repo)

**Tier 3 — JANGAN dipakai untuk dashboard:**
- `frontend-design`, `frontend-ui-engineering` (mereka akan rewrite komponen, bertentangan dengan brand)
- `improve-animations` kecuali Anda memang minta survey motion (bukan delivery)
- `emil-design-eng` — boleh untuk referensi filosofi "don't add animation unless asked", tapi output skill-nya generik

### 4.2 Mapping skill → komponen LAZISNU

| Skill | Komponen/Halaman yang di-audit | Output |
|---|---|---|
| **improve-ui** | Semua 8 halaman dashboard + 16 komponen UI | Laporan 12-18 issue |
| **baseline-ui** | Komponen Button/Card/Badge/Input/Modal/EmptyState | Slop-checklist |
| **fixing-accessibility** | Modal, DropdownFilter, GlassSelect, Form modal di cans/users/reports | Issue a11y + patch plan |
| **fixing-metadata** | layout.tsx + login page + error page | Metadata plan |
| **ui-ux-pro-max** | — | Referensi palet & UX heuristics untuk diskusi |

---

## 5. Yang TIDAK boleh dilakukan skill manapun

1. **Jangan** rename/tambah token Tailwind yang melangar palet di `12-standar-ui-web.md`
2. **Jangan** tulis ulang Button/Card/Badge untuk "dipercantik" — komponen dipakai 8+ halaman
3. **Jangan** ganti font dari Geist ke Inter/Roboto/etc. tanpa konfirmasi
4. **Jangan** refactor Sidebar animation `duration-300` ke `duration-200` hanya karena `baseline-ui` bilang max 200ms — itu feedback interaksi, bukan enter animation
5. **Jangan** hapus `glow effects` di login page — itu satu-satunya tempat di mana `baseline-ui` izinkan (dekoratif, BUKAN primary affordance)
6. **Jangan** tambahkan `motion/react` atau `framer-motion` ke package.json tanpa diskusi — skill `baseline-ui` anjurkannya tapi `12-standar-ui-web.md` Anda saat ini pakai Tailwind animate (no JS animation library)
7. **Jangan** kerjakan landing publik `lazisnu.org` karena tidak ada di repo — saran desain jadi mengambang tanpa kode yang bisa di-merge

---

## 6. Verifikasi data (sumber primer)

| Sumber | Baris/URL | Validasi |
|---|---|---|
| `.agents/rules/12-standar-ui-web.md` | 609 baris | Standar palet & layout resmi |
| `apps/web/src/app/layout.tsx` | 40 baris | Metadata default Next.js, lang=en |
| `apps/web/src/app/globals.css` | 54 baris | Palette root tidak konsisten |
| `apps/web/src/components/ui/Button.tsx` | 49 baris | Variant tanpa brand color |
| `apps/web/src/components/ui/Modal.tsx` | 120 baris | Tidak ada focus trap / aria-label close |
| `apps/web/src/components/ui/Card.tsx` | 38 baris | Variant glass OK, default white |
| `apps/web/src/components/ui/Sidebar.tsx` | 151 baris | A11y toggle OK |
| `apps/web/src/components/ui/Skeleton.tsx` | 12 baris | Hanya gray, tidak ada dark variant |
| `apps/web/src/components/ui/FilterPills.tsx` | 37 baris | Standar compliant |
| `apps/web/src/components/ui/DropdownFilter.tsx` | 194 baris | Escape close tanpa restore focus |
| `apps/web/src/components/ui/GlassSelect.tsx` | 180 baris | Escape close tanpa restore focus |
| `apps/web/src/app/dashboard/cans/page.tsx` | 1222 baris | "Implementasi paling matang" |
| `apps/web/src/app/dashboard/error.tsx` | 56 baris | Pakai slate, bukan brand |
| `apps/web/src/app/(auth)/login/page.tsx` | 160 baris | Glow + external texture image |
| `lazisnu.org` live site | web_extract | Landing publik (campaigns, gallery, pengurus) |

---

## 7. Langkah selanjutnya — butuh keputusan Anda

Saya tidak akan mulai audit sampai Anda pilih jalur. Opsi:

1. **Jalankan Tier 1 (read-only audit)** → 4 skill, output laporan + plan implementasi, ZERO kode disentuh
2. **Jalankan Tier 1 + Tier 2 (audit + mockup referensi)** → + beberapa mockup warna untuk landing publik (di luar repo)
3. **Jalankan semuanya dan biarkan saya filter yang sesuai `12-standar-ui-web.md`** → saya pakai skill, tapi output-nya saya sandingkan dengan standar Anda sebelum laporkan

Saya menunggu instruksi.