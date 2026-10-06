# C1 — Tinjauan Ulang T11 Notifikasi Push-WA + Sapu (22 Sep 2026)

> Status: **LULUS (hijau), tanpa temuan blocking.**
> Objek: commit `5810249` (`feat(c1-t11): notifikasi 7 event push-WA + sapu + K3/K2/L1-L3`)
> pada branch `feat/c1-t11-notifikasi-push-wa-2026-09-22`.
> Basis: T10 `ef3fa8a` (review T10: LULUS + L1–L4). Baseline: backend 56/485,
> mobile 34/256 + tsc 1 (L1), web 6/31.
> Pola mengikuti `C1-TINJAUAN-ULANG-T10-2026-09-22.md`. Dokumen review T0–T10 read-only.

## 1. Verifikasi klaim laporan T11

| Klaim | Hasil |
|---|---|
| 17 file | ✅ `git diff --name-only ef3fa8a..HEAD` = tepat 17 (notifications baru + WA teks + worker + 2 test backend; sapu route; 7 jenis event di 5 service; SignSheet test, SignaturePad web+test; docs §4.18) |
| Backend `tsc` 0 | ✅ live (`npx tsc --noEmit` EXIT 0) |
| Mobile `tsc` **0** (L1) | ✅ live EXIT 0 — helper `textsOf` baru berbasis isi props, bukan banding `node.type === 'Text'` |
| Web `tsc` 0 | ✅ live EXIT 0 |
| Notif unit+integrasi (9 template + dispatcher/hook/sapu/K3/K2) | ✅ live: `2 suite, 14 test passed` |
| SignSheet L1+L3 | ✅ live: `3/3 passed` (render + diam-tanpa-consent + consent-tanpa-coretan) |
| SignaturePad web | ✅ live: `2/2 passed` (dengan warning jsdom `getContext not implemented` — lihat M3) |
| Regresi hook (cosign + periodDrafts) | ✅ live: `29/29 passed`; reopen `6/6 passed` |
| Full backend **58/58, 499/499**; `prettier bersih` | ⚠️ **tak terkonfirmasi live sesi ini**: full suite timeout >30 dtk di mesin ini; binari `prettier` tak ada di repo (`devDeps` backend kosong) — jadikan log CI sebagai sumber kebenaran |
| Dispatcher push→WA tak melempar | ✅ `dispatchNotif` (`notifications.ts:208-270`): loop per-recipient try/catch + outer try/catch + audit `NOTIF_DISPATCHED` best-effort |
| 9 template murni | ✅ `NotifTemplate` + `buildNotifBody` (TUGAS_DIGENERATE, APPROVE_DIMINTA, APPROVE_ESKALASI, PENGINGAT_H3, MENDEKATI_KUNCI, PPK_FINAL, REOPEN, SELISIH_BESAR, BA_SIAP) — unit test mencakup ke-9 |
| 7 titik hook | ✅ dengan koreksi redaksi: **7 jenis event / 9 call-site** — approve→`notifyTugasDigenerate`; prepare→`notifyApproveDiminta`; `finalizePpk`+`countersignPpk(finalized)`→`notifyPpkFinal` (jalur force delegasi ke finalize, benar ganda); `finalizeBranch`+`countersignBranch`→`notifyBaSiapBranch` (jalur upacara T5, benar ganda); `signBranch`→`notifySelisih` (diam bila toleransi via `needsVarianceReason` reuse); `reopenPpk`/`reopenBranch`→`notifyReopen` |
| Sapu (eskalasi/H-3/kunci, dedup 20 jam + jobId) | ✅ `sweepNotifs` + `POST /scheduler/notifikasi-sapu` (kunci internal, zod): eskalasi via `isEscalated` reuse T3 → Keuangan; H-3 `[due-3d,due]` + kunci `[toleranceEnd-2d,toleranceEnd]` → PPK ACTIVE; semua via `filterFresh(...,20,now)`; `logNotifRow` pakai `createdAt: now` injeksi (konsisten dedup vs `now`); komentar cron menunjuk T12 eksplisit |
| Queue/WA (`send-text`, retry 10x + DLQ) | ✅ default `attempts:10 + backoff exponential 3s`; `jobId=staff-template-entity-user` deterministik; worker route per `job.name`; `handleJobFailure` hanya attempt terakhir; `sendStaffTextSync` dry-run bila provider tak dikonfigurasi + selalu log `staff_notice` |
| FCM tanpa kredensial = instan-false | ✅ `fcm.ts:50-53` (`getFirebaseApp()=null → {success:false}`) → dispatcher jatuh ke WA; aman di test/lokal |
| Dynamic import sufiks `.js` (node16) | ✅ 6 titik di `notifications.ts` + 1 di `worker.ts`, konsisten |
| K3 audit token | ✅ `DEVICE_TOKEN_SAVED` best-effort (`mobileRoles.ts:76-91`), diuji integrasi |
| K2 filter arsip | ✅ `baPdfService.ts` kedua lister skip non-`FINAL`/`FINAL_NOL`; diuji (versi 99 DRAFT tak tampil); preventif, benar |
| L2 DPR web | ✅ `dprRef` dibekukan saat init, `toCss` dipakai di down+move |
| Docs §4.18 | ✅ 14 baris, akurat (push→WA, retry 10x, tak-menggagalkan, daftar template, endpoint sapu) |

## 2. Temuan sesi ini (4, semua non-blokir)

| # | Prio | Isi | Target |
|---|---|---|---|
| M1 | P3 | **`jobId` deterministik bisa menelan update isi**: `staff-${template}-${entityId}-${userId}` — bila notif sama masih pending lalu alasan berubah (mis. reason reopen direvisi), `add` kedua kena dedup BullMQ dan isi baru hilang; dispatcher menghitungnya sebagai `push_fail` via catch dalam. Terima untuk T11; bila mengganggu, tambah hash alasan ke jobId atau hitung duplicate sebagai `wa_queued` | backlog |
| M2 | P4 | **Dedup sapu per (template+HP), bukan per entitas**: benar untuk anti-spam, tapi 1 Keuangan mencakup 2 ranting yang sama-sama eskalasi dalam 20 jam → ranting kedua ter-suppress. Diterima (staf umumnya 1 scope); catat sebagai batasan yang diketahui | backlog |
| M3 | P4 | **Path gambar SignaturePad web tak teruji**: jsdom tak punya `getContext` (warning `not implemented` saat test) — hanya render+hapus yang hijau; down/move/up/emit tak tercakup. Mobile menutup via SignSheet. Bila mau, tambah mock `getContext` | T12 |
| M4 | P4 | **Redaksi backlog butir 5 laporan T11**: "`K2-sisa? (tutup), L4? (tutup via J-recheck? ...)`" menggantung — K2 memang ditutup diff ini; status L4 peninggalan T10 sebaiknya ditegaskan di perencanaan T12 agar tak menggantung | T12 |

## 3. Tindak lanjut

- T11 **selesai, boleh merge**. Bukti live sesi ini: backend/mobile/web tsc 0; notif `2 suite, 14 passed`; SignSheet `3/3`; SignaturePad `2/2`; cosign+periodDrafts `29/29`; reopen `6/6`. Full `58/58, 499/499` + prettier mengacu log CI (tak terkonfirmasi lokal — lihat tabel §1).
- Ditinggalkan dengan benar: **T12** cron wiring + **rollout produksi 0008–0011** + verif 22 uji; mobile terima-push (dep messaging, device farm).
- Backlog tetap: F2, F7, J1, J3, M1, M2 (+ M3/M4 di T12).
- Baseline baru untuk T12: backend **58/499** (per CI); mobile **34/257**; web **7/33**.
