# C1-T12 — Checklist Verifikasi Zona Waktu Saat Deploy (20 Sep 2026)

> Sumber: hasil review C1-T1 (helper kalender periode). Dokumen ini adalah
> tindak lanjut temuan review — dokumen induk C1/B1 di folder ini adalah
> **salinan verbatim** (hash identik) dan TIDAK boleh diedit, sehingga
> checklist deploy T12 ditulis terpisah di sini.
>
> Premis dasar: kolom `timestamp` pada `period_calendar` (dan tabel lain)
> bertipe `timestamp without time zone`; seluruh batas tanggal dibangun
> dengan konstruktor lokal di `services/periodCalendar.ts`
> (`buildPeriodBoundaries`). Karena itu kebenaran bergantung pada **tiga
> lapis zona waktu yang HARUS senada**, bukan hanya satu.

## Lapis zona waktu yang wajib senada (semua = Asia/Jakarta / +07:00)

- [ ] **1. OS / VM / container server**
  - `timedatectl` (VM) atau `date` di dalam container → WIB (+07:00).
  - Bila container: `TZ=Asia/Jakarta` di env compose/manifest, bukan
    hanya host.
- [ ] **2. Aplikasi Node (backend)**
  - Respons endpoint yang mengekspos zona (lihat `operationalTimeZone.ts`)
    melaporkan `Asia/Jakarta`.
  - `checkOperationalTimezone()` mengembalikan `ok: true`.
- [ ] **3. SESSION PostgreSQL**
  - `SHOW timezone;` → `Asia/Jakarta` (atau padanan +07:00; bila berupa
    offset tetap seperti `Etc/GMT-7`, catat sebagai pass-with-note).
  - Jika tidak: set `timezone = 'Asia/Jakarta'` pada `postgresql.conf`,
    role user aplikasi, ATAU parameter sesi di connection string
    (`?timezone=Asia/Jakarta` / `options=-c timezone=Asia/Jakarta`).
  - **Kenapa penting:** driver pg menyerialisasi objek `Date` dengan offset
    sesi DB. OS = WIB tetapi sesi PG = UTC membuat nilai
    `timestamp without time zone` yang ditulis/dibaca geser 7 jam meski
    seluruh kode aplikasi benar. Semua perbandingan batas periode
    (`assign_date`, `due_date`, `tolerance_end`) bisa meleset satu jendela.

## Prosedur verifikasi (jalankan berurutan)

1. [ ] Jalankan `checkOperationalTimezone()` pada instance produksi
       (via endpoint/runbook); harapkan `{ ok: true, expected: 'Asia/Jakarta',
       serverTimeZone: 'Asia/Jakarta', offsetMinutes: 420 }`.
2. [ ] Bila `ok: false` **tapi** `offsetMinutes === 420`: nama zona adalah
       alias setara — perlakukan pass-with-note, lanjut ke langkah 3 dan
       konfirmasi manual. Jangan biarkan `offsetMinutes !== 420`.
3. [ ] `psql -c 'SHOW timezone;'` dan `psql -c 'SELECT now();'` → sesi PG
       WIB; `now()` menampilkan +07.
4. [ ] Smoke test kalender (T3/T12): setelah cron tgl 10/20 berjalan, bandingkan
       baris `period_calendar` terbaru dengan output `buildPeriodBoundaries(y, m)`
       (assign = tgl 20 00:00, due = tgl 27 23:59:59, tolerance_end = tgl 9
       bln berikut 23:59:59) — harus identik hingga milidetik.
5. [ ] Catat hasil verifikasi (nilai `SHOW timezone`, versi gambar/container,
       tangkapan `checkOperationalTimezone`) di log deploy/runbook.

## Catatan desain terkait (dari review T1)

- Batas periode HANYA boleh dibangun lewat `buildPeriodBoundaries`
  (`services/periodCalendar.ts`); dilarang menyebar `new Date(y, m, ...)`
  asumsi-zona di file lain (preseden bug: `monthStart` di `dashboard.ts:30`,
  `district.ts:194-195` saat server VM UTC).
- `isPeriodLocked(now, toleranceEnd)`: pemanggil wajib mengoper
  `buildPeriodBoundaries(...).toleranceEnd`, bukan tanggal buatan sendiri.
- `periodKey` masih terduplikasi inline di `routes/scheduler.ts:65` —
  dedupe ke helper saat wiring T2.
- Migrasi ke `timestamptz` adalah jalan evolusi di luar C1 (jangan diubah
  sekarang).
