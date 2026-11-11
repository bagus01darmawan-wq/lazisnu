# Laporan Masalah: Antrean Tanda Tangan Bendahara Terparkir di Periode 2026-07

**Tanggal**: 2026-11-04
**Lingkup**: Aplikasi mobile, role bendahara (STAF_KEUANGAN), akun "Bunda"
**Masalah awal**: Setelah login sebagai bendahara, layar Keuangan & BA hanya menampilkan tulisan *"Tidak ada antrean tanda tangan periode 2026-07."* Padahal bulan berjalan saat itu sudah November 2026.

---

## 1. Masalah awal

1. User masuk aplikasi mobile dengan akun bendahara (akun "Bunda").
2. Membuka tab Keuangan & BA (`KeuanganScreen`).
3. Antrean tanda tangan kosong, dan label periode yang ditampilkan masih Juli: **2026-07**.
4. Pertanyaan yang muncul: kenapa periode tidak mengikuti bulan kalender berjalan (2026-11)?

---

## 2. Alur penyelidikan

### 2.1 Asal-usul teks "Tidak ada antrean tanda tangan"

Teks tersebut hanya muncul di satu tempat:

- `apps/mobile/src/screens/KeuanganScreen.tsx:201`
  ```tsx
  <Text>Tidak ada antrean tanda tangan periode {period}.</Text>
  ```

Variabel `{period}` **bukan** diambil dari jam kalender HP dan **bukan** hardcoded. Ia berasal dari state lokal `period` (`KeuanganScreen.tsx:52`), yang diisi dari respons server di baris 82:

```ts
setPeriod(res.data.period);
```

### 2.2 Dari mana `period` itu ditentukan

Alur data lengkapnya:

```
GET /mobile/period-context (apps/mobile/src/services/api.ts:1048)
  → PeriodContextDto.display_period { year, month } (api.ts:862-867)
  → usePeriodStore.context (apps/mobile/src/stores/usePeriodStore.ts:18-35)
  → KeuanganScreen baca state.context?.display_period.year/month (KeuanganScreen.tsx:48-49)
  → c1Service.getKeuanganInbox(displayYear, displayMonth) (KeuanganScreen.tsx:72-88)
  → server balas { period: "2026-07", items: [] }
  → setPeriod(res.data.period) → tampil "Tidak ada antrean ... periode 2026-07"
```

`paymentQuery` (`api.ts:1030-1036`) hanya melampirkan query `year`/`month` bila keduanya terisi; `getKeuanganInbox` (`api.ts:1108-1112`) mengirimnya ke `GET /mobile/keuangan/inbox`.

Kesimpulan tahap ini: **client tidak pernah memilih Juli sendiri**. String periode yang tampil adalah *echo* dari server. Cek lengkap `mobile/src` tidak menemukan hardcode `2026-07` maupun default bulan Juli — satu-satunya kemunculan `2026-07` adalah placeholder input "Periode digabung" (`KeuanganScreen.tsx:285`) dan fixture test.

---

## 3. Mekanisme penyebab: periode berbasis aksi

Server menentukan periode tampilan bukan dari kalender, melainkan dari *rantai aksi* (dokumen `docs/periode-berbasis-aksi-2026-11-03.md`):

```
display_period = periode berhak tertua yang belum tuntas untuk cakupan pengguna
                 ?? periode operasional berjalan
```

- Ditentukan di `apps/backend/src/services/periodState.ts`:
  - `getPeriodState()` (`:460-488`): memindai `PERIOD_LOOKBACK_MONTHS = 6` periode terakhir dari periode operasional berjalan, mengumpulkan `unsettled[]`, lalu `display_period = unsettled[0] ?? current`.
  - Definisi "tuntas": PPK `FINAL`; ranting `FINAL` / `FINAL_NOL`.
  - Cakupan ditentukan dari JWT via `scopeForUser()` (`:83-95`): petugas → officer; pengguna ber-`branchId` → branch; selain itu → district. Bendahara (STAF_KEUANGAN dengan `branchId`) dipetakan ke **branch**.
  - Untuk branch, `branchCells()` (`:221-345`) membangun sel per periode dan memberi alasan tunggakan: `PPK_DRAFT` → PPK, `PPK_WAITING_BENDAHARA` → BENDAHARA_RANTING, `BRANCH_DRAFT` → BENDAHARA_RANTING, `BRANCH_WAITING_MWC` → BENDAHARA_MWC.

Artinya: **selama di scope Bunda masih ada periode lama yang belum tuntas, server sengaja membalas `display_period` itu** — sekalipun bulan kalender sudah berganti. `KeuanganScreen` pun mengirim `?year=2026&month=7` ke inbox; bila item Juli itu masih menunggu pihak lain (mis. PPK belum FINAL, bukan giliran tanda tangan bendahara), server mengembalikan `items: []` untuk Juli → pesan "Tidak ada antrean ..." adalah hasil yang **konsisten dengan desain**.

Jendela pencarian 6 bulan (`PERIOD_LOOKBACK_MONTHS`) berarti dari November, Juli masih di dalam jendela. Item Juli yang menggantung akan terus menjadi "periode" sampai tuntas.

---

## 4. Verifikasi data via skrip baca-saja

Agar penyebabnya tidak hanya teori, dibuat skrip laporan read-only:

```
apps/backend/scripts/cek-periode-display.ts
```

Skrip ini:

1. Memuat `DATABASE_URL` dari env (sama seperti `.env` backend, pooler AWS-1 port 6543).
2. Mencari akun bendahara (`STAF_KEUANGAN`) — opsional difilter `--kunci=bunda`.
3. Menjalankan ulang logika `getPeriodState` persis (same query `assignments`, `ppk_submissions`, `branch_submissions` dari `branchCells`/`districtCells`).
4. Menampilkan `display_period`, daftar `unsettled`, dan baris pemicu per akun.

Skrip **hanya SELECT** — tidak ada UPDATE/DELETE. Jalankan dengan:

```bash
pnpm exec tsx scripts/cek-periode-display.ts --kunci=bunda --konsol        # khusus Bunda
pnpm exec tsx scripts/cek-periode-display.ts --semua --konsol              # semua akun (untuk audit)
```

### 4.1 Hasil di DB `.env` lokal (bukan DB Bunda)

DB yang terhubung via `.env` backend adalah DB lokal/development — **di dalamnya tidak ada akun `STAF_KEUANGAN`** (`Total STAF_KEUANGAN di DB: 0`). Rekap role-nya:

```
ADMIN_KECAMATAN: 1
ADMIN_RANTING: 2
PETUGAS: 8
```

Meski bukan DB Bunda, mekanismenya terbukti untuk semua 10 akun yang diperiksa. Periode operasional berjalan menurut cerminan server: **2026-11**, jendela pencarian **2026-06 … 2026-11**. Hasilnya:

| Akun | Scope | display_period | Alasan | Pemicu |
|------|-------|----------------|--------|--------|
| Admin MWC Paninggaran (ADMIN_KECAMATAN) | district Paninggaran | 2026-07 | DISTRICT_UNSETTLED → ADMIN | 8 baris `branch_submissions` 2026-10 masih DRAFT |
| Admin Ranting Sawangan | branch SAWANGAN | 2026-07 | PPK_DRAFT → PPK | 2 `assignments` aktif 2026-07 |
| Auth Probe (BOTOSARI), boris, lalalu, ulan, ulin | branch masing-masing | 2026-07 | PPK_DRAFT → PPK | 2 `assignments` aktif 2026-07 |
| Ahmad Bagus (KOTAK TAQWA) | branch | 2026-07 | PPK_DRAFT → PPK | 67 aktif Jul, 68 Agu, 13 Sep, 66 Okt |
| lele/lulu (PANINGGARAN TIMUR) | branch | 2026-07 | PPK_DRAFT → PPK | 5 aktif Jul + `ppk_submissions` DRAFT Okt |

Pola utama: **Juli masih punya `assignments` berstatus aktif yang tidak pernah dibuar­kan `ppk_submissions`** (tidak ada baris PPK sama sekali untuk 2026-07). `branchCells` mengarang sel Juli sebagai:

```
2026-07: eligible=true settled=false reason=PPK_DRAFT waiting=PPK (sumber: assignments)
```

Karena Juli adalah periode belum tuntas **tertua** di jendela, `display_period` terparkir di sana — diperkuat tunggakan berlanjut (submission DRAFT sampai Oktober). Ini konsisten dengan prinsip "periode maju karena rantai aksi, bukan tanggal": selama tugas Juli belum ditutup (COMPLETED/REASSIGNED/UNCOLLECTED) dan PPK-nya belum FINAL, server tidak pernah maju ke November.

---

## 5. Hipotesis pendamping: stale state di mobile

Investigasi juga menemukan lubang nyata, terpisah dari penyebab utama di atas:

- `usePeriodStore.reset()` (`apps/mobile/src/stores/usePeriodStore.ts:34`) **tidak pernah dipanggil** di seluruh `src/`.
- `resetAllClientState()` (`apps/mobile/src/stores/useAuthStore.ts:131-177`) me-reset `taskCache`, cached user, `clearAllCache()`, serta store dashboard/tasks/collections/sync — tapi **tidak menyertakan `usePeriodStore`**.
- `login()` / `verifyOTP()` / `loginWithBiometric()` juga tidak me-reset period store.
- Store ini hanya in-memory (tanpa `persist`), jadi kebocoran hanya terjadi antar-pergantian akun **dalam proses yang sama** (logout → login akun lain tanpa kill app, atau forceLogout → pemulihan biometrik), bukan antar-restart.

Terlebih, di `KeuanganScreen.tsx:90-96` dua `useEffect` berjalan paralel tanpa menunggu refresh selesai:

```ts
useEffect(() => { refreshPeriod(); }, [refreshPeriod]);
useEffect(() => { load(); }, [load]);
```

Bila `refreshPeriod()` gagal/offline, `usePeriodStore.ts:28-29` diam-diam mempertahankan konteks lama sehingga label periode lama bisa tetap tampil.

Hipotesis ini **bisa menghasilkan request identik** `?year=2026&month=7`, sehingga dari UI saja tidak mudah dibedakan. Cara membedakannya saat repro: tangkap request `GET /mobile/period-context` saat Bunda login — bila responsnya sendiri `display_period: {year: 2026, month: 7}`, penyebabnya **server-side** (scope Bunda memang punya tunggakan Juli); bila `period-context` mengembalikan November tapi inbox terkirim `?year=2026&month=7`, penyebabnya **stale store**.

---

## 6. Ide penghapusan data

### 6.1 Mekanisme yang tersedia

- `DELETE /admin/data/reset` — endpoint wipe operasional, tanpa konfirmasi commit di level API.
- Yang dihapus: baris operasional (`assignments`, `collections`, `ppk_submissions`, `branch_submissions`, draft, visits, dst.).
- Yang dipertahankan: master (distrik, ranting, petugas, kaleng).
- Guard: hanya Super Admin / Admin Kecamatan, dan periode harus sudah LOCKED. Penghapusan dicatat di audit.

### 6.2 Risiko

- Menghapus data operasional langsung akan menghapus tunggakan Juli yang menahan `display_period`, sehingga periode tampilan bisa lompat ke periode berjalan.
- **Risiko besar**: hapus data sendiri tanpa menghitung barisnya dulu berpotensi menghapus pengeluaran/progres yang tidak terduga (mis. Koleksi Oktober yang sudah berjalan, bukan hanya Juli).
- `display_period` adalah turunan posisi rantai aksi; menghapus datanya menggeser arti "periode berjalan" bagi semua user dalam scope yang sama, bukan hanya Bunda.

### 6.3 Alternatif yang lebih terkendali

1. **Hitung baris dulu** sebelum menghapus: jalankan skrip `--kunci=bunda --konsol` terhadap DB staging/prod untuk melihat persis baris pemicu di scope Bunda (assignment aktif Juli, submission DRAFT, dll.).
2. Bila memang diputuskan bersih-bersih, hapus **per-periode yang belum tuntas** (khususnya assignments aktif + submission DRAFT untuk 2026-07 s/d 2026-10 di scope tersebut) — bukan wipe total.
3. Alternatif kalender: bersihkan/atur ulang `period_calendar` per-periode agar periode operasional berjalan (yang sudah 2026-11 menurut kalender) bisa dilanjutkan dengan bersih, tanpa menyentuh master.
4. Tetap pertimbangkan perbaikan UX: untuk bendahara, antrean kosong menunggu PPK sebaiknya menampilkan alasan ("menunggu PPK") alih-alih label periode lama yang membingungkan.

---

## 7. Kesimpulan & rekomendasi

1. **Penyebab utama** pesan "Tidak ada antrean tanda tangan periode 2026-07" adalah `display_period` dari server yang terparkir di Juli karena tugas Juli di scope bendahara belum tuntas (belum ada PPK FINAL). Ini by-design dari periode berbasis aksi, dipicu data tunggakan di DB.
2. **Perbaikan data** (hapus per-periode atau wipe via `DELETE /admin/data/reset`) akan melepaskan `display_period` ke periode berjalan 2026-11 — tetapi harus didahului penghitungan baris dengan skrip di §4 dan keputusan eksplisit, karena bersifat menghapus data operasional.
3. **Perbaikan kode pendamping** yang disarankan regardless:
   - Tambahkan `usePeriodStore.getState().reset()` ke `resetAllClientState()` (dan pertimbangkan reset saat sukses login) agar konteks periode tidak bocor antar-akun.
   - Pertimbangkan menahan render inbox sampai `refreshPeriod()` selesai, atau menampilkan label periode berjalan + alasan tunggakan di UI.
4. **Langkah berikutnya**: jalankan `cek-periode-display.ts --kunci=bunda` pada DB staging/prod (dengan `DATABASE_URL` yang benar) untuk mengkonfirmasi baris pemicu spesifik scope Bunda sebelum menghapus apa pun.
