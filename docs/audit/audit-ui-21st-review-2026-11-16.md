# Audit UI — 21st CLI Review `apps/web/src`

- **Tanggal:** 2026-11-16
- **Tool:** `@21st-dev/cli` v1.18.0, perintah `21st review apps/web/src --json`
- **Karakter tool:** aturan deterministik, lokal, offline — bukan AI, bukan pengganti audit a11y manual
- **Scope:** `apps/web/src` — 105 file
- **Exit code:** 1 (penanda "ada findings", bukan kegagalan tool)
- **Raw output:** `tmp/review-web.json` (gitignored, regenerate: `21st review apps/web/src --json`)

## Ringkasan

| Severity | Jumlah |
|---|---|
| error | 21 |
| warning | 187 |
| info | 1272 |
| **total** | **1480** |

Findings **tidak ada yang autofixable** (0/1480) — `--fix` no-op pada codebase ini.

## Breakdown per aturan

| Jumlah | Severity | Rule | Catatan |
|---|---|---|---|
| 1270 | info | `design-hardcoded-color` | 195 di `styles/themes.css` (definisi token itu sendiri → noise); 1075 di luar itu |
| 160 | warning | `motion-transition-all` | `transition-all` menganimasikan properti tak diinginkan |
| 21 | **error** | `focus-outline-none` | Outline fokus dihapus tanpa pengganti `focus-visible` |
| 11 | warning | `motion-long-duration` | Animasi UI terlalu panjang |
| 7 | warning | `responsive-fixed-width` | Lebar fixed berisiko overflow |
| 7 | warning | `responsive-min-width` | Min-width berisiko overflow |
| 2 | info | `responsive-overflow-hidden` | |
| 1 | warning | `motion-hover-scale` | |
| 1 | warning | `a11y-autofocus` | |

## Error: 21× `focus-outline-none`

### Komponen UI shared (perbaiki dulu — dampak ke seluruh app)

| File | Line |
|---|---|
| `apps/web/src/components/ui/Badge.tsx` | 35 |
| `apps/web/src/components/ui/Button.tsx` | 42 |
| `apps/web/src/components/ui/DropdownFilter.tsx` | 153 |
| `apps/web/src/components/ui/GlassDatePicker.tsx` | 73 |
| `apps/web/src/components/ui/GlassSelect.tsx` | 124 |

### Halaman dashboard

| File | Lines |
|---|---|
| `apps/web/src/app/dashboard/master/page.tsx` | 725, 898, 927, 938, 981, 1023, 1033, 1046 (8×) |
| `apps/web/src/app/dashboard/cans/[id]/page.tsx` | 958, 1251 |
| `apps/web/src/app/dashboard/assignments/[id]/page.tsx` | 671 |
| `apps/web/src/app/dashboard/audit-log/page.tsx` | 280 |
| `apps/web/src/app/dashboard/reports/FilterDropdown.tsx` | 178 |
| `apps/web/src/app/dashboard/resubmit/page.tsx` | 175 |
| `apps/web/src/app/dashboard/users/page.tsx` | 571 |
| `apps/web/src/app/dashboard/wa-monitor/page.tsx` | 623 |

## Warning terbanyak (di luar `design-hardcoded-color`)

| File | Findings |
|---|---|
| `app/dashboard/master/page.tsx` | 30 |
| `app/dashboard/cans/[id]/page.tsx` | 25 |
| `app/dashboard/wa-monitor/page.tsx` | 17 |
| `app/dashboard/users/page.tsx` | 13 |
| `app/dashboard/assignments/[id]/page.tsx` | 9 |
| `app/dashboard/audit-log/page.tsx` | 8 |
| `app/dashboard/setoran/page.tsx` | 7 |
| `app/dashboard/reports/page.tsx` | 6 |
| `app/dashboard/resubmit/page.tsx` | 6 |
| `app/dashboard/layout.tsx` | 5 |

`motion-long-duration` (11×): `audit-log:332`, `cans/[id]:1025`, `rekap-mwc:131`, `reports/ReportsClient.tsx:115`, `reports/page.tsx:217`, `setoran:278`, `users/[id]:199,216,228`, `users/page.tsx:647`, `wa-monitor:656`.

`responsive-fixed-width` + `responsive-min-width` (7 pasangan, line sama): `cans/[id]:1027`, `master:907`, `persetujuan:191`, `produktivitas:258`, `rekap-mwc:133`, `resubmit:196`, `setoran:280`.

Lainnya: `responsive-overflow-hidden` — `dashboard/layout.tsx:56,113`; `motion-hover-scale` — `components/Sidebar.tsx:113`; `a11y-autofocus` — `components/ui/DropdownFilter.tsx:154`.

## File terbanyak total temuan

| File | Total |
|---|---|
| `styles/themes.css` | 195 |
| `app/dashboard/cans/[id]/page.tsx` | 129 |
| `app/dashboard/master/page.tsx` | 125 |
| `app/dashboard/wa-monitor/page.tsx` | 112 |
| `app/dashboard/users/page.tsx` | 74 |
| `app/dashboard/audit-log/page.tsx` | 66 |
| `app/dashboard/assignments/[id]/page.tsx` | 47 |
| `components/region/RegionCards.tsx` | 41 |
| `app/dashboard/resubmit/page.tsx` | 40 |
| `app/dashboard/reports/page.tsx` | 35 |

## Uji kedalaman (hasil ukur, 2026-11-16)

| Lever | Hasil |
|---|---|
| `--strict` | 1482 findings vs 1480 default (+2) — tidak signifikan |
| `--fix` | 0/1480 fixable — no-op |
| `.21st/design.json` (design context, diisi manual) | Rerun hasil identik; review tidak membaca design context. Context hanya dipakai memandu coding agent (`DESIGN.md`) |

Catatan: `21st init --design-context --check` tetap melaporkan "drift detected" (keterbatasan deteksi CLI terhadap layout monorepo). **Jangan** jalankan `--refresh` — akan menimpa `.21st/design.json` yang sudah diisi manual.

## Rekomendasi

1. **Perbaiki 21 `focus-outline-none`** — mulai dari 5 komponen UI shared, lalu `master/page.tsx`.
2. **Token enforcement di CI** (stylelint / `declaration-property-value-disallowed-list`) untuk menutup kelas `design-hardcoded-color` (1270 findings; 195 adalah noise `themes.css`) — bukan diperbaiki manual.
3. **a11y berlapis** — tambah `eslint-plugin-jsx-a11y` strict atau `@axe-core/playwright` (focus-visible, contrast, ARIA); 2 aturan a11y bawaan CLI terlalu dangkal.
4. **Ganti `transition-all`** dengan properti eksplisit (`transition-colors`, `transition-transform`, dll.) — 160 warning.
5. Scope review per direktori (`21st review apps/web/src/components/ui`) untuk sinyal lebih tinggi.

## Caveat

- Tool ini mendeteksi pola, bukan memahami intent — hasil perlu triase manusia/agent.
- `themes.css` sengaja berisi hex hardcode (definisi 15 tema) — abaikan untuk aturan `design-hardcoded-color`.
- Findings ≠ compliance a11y/WCAG; tidak mengukur contrast, tab order, atau screen-reader behavior.
