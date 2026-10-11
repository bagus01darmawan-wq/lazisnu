-- Pengaman 1 & 2 — integritas penjemputan terhadap penugasannya.
-- Latar: penjemputan boleh menempel ke penugasan milik petugas lain dan/atau yang
-- sudah tidak berstatus ACTIVE. Terbukti di data produksi (laporan
-- docs/penelusuran-angka-210-2026-10-09.md §10): 37 dari 102 baris melanggar —
-- 1 menempel ke penugasan petugas lain, 36 ber-tanggal luar periode. Rantai
-- akibatnya: kaleng yang sama bisa tercatat dijemput dua kali dalam sebulan
-- karena tiap penjemputan menempel ke penugasan yang BERBEDA, sehingga indeks
-- unik (assignment_id, can_id, submit_sequence) tak pernah terpicu.
--
-- Catatan opsi "baris lama dibiarkan": FK memakai NOT VALID. Indeks unik
-- sebagian (pengaman 1) aman dibuat langsung karena 0 pelanggaran pada data
-- yang ada. Pengaman "satu penjemputan per kaleng per bulan" BELUM dibuat —
-- 27 baris lama (9 kelompok) melanggarnya dan indeks unik PostgreSQL tidak
-- punya opsi NOT VALID.

-- ─── Pengaman 1: satu penugasan AKTIF per kaleng per periode ─────────────
-- Sebelumnya indeks can_officer_period_unq mengunci per (kaleng, PETUGAS,
-- periode), sehingga satu kaleng bisa punya dua penugasan aktif di bulan yang
-- sama bila petugasnya berbeda. Inilah celah yang membuat dua penugasan
-- sekaligus hidup untuk kaleng yang sama.
CREATE UNIQUE INDEX IF NOT EXISTS assignments_active_one_per_can_period_unq
  ON "assignments" ("can_id", "period_year", "period_month")
  WHERE "status" = 'ACTIVE';

-- ─── Pengaman 2: penjemputan harus memakai penugasan milik petugas itu ────
-- Target FK: indeks unik gabungan pada tabel penugasan.
CREATE UNIQUE INDEX IF NOT EXISTS assignments_id_can_officer_unq
  ON "assignments" ("id", "can_id", "officer_id");

-- NOT VALID = baris lama tidak diperiksa (masih ada 1 baris penjemputan yang
-- menempel ke penugasan petugas lain). Baris BARU tetap wajib memenuhi.
-- Efek samping yang diketahui: penjemputan historis tersebut tidak bisa
-- "diperbaiki" lewat /collections/:id/resubmit, karena alur itu menyalin
-- (assignment_id, can_id, officer_id) ke baris baru — dan baris baru WAJIB
-- memenuhi FK.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'collections_assignment_can_officer_fk'
  ) THEN
    ALTER TABLE "collections"
      ADD CONSTRAINT "collections_assignment_can_officer_fk"
      FOREIGN KEY ("assignment_id", "can_id", "officer_id")
      REFERENCES "assignments" ("id", "can_id", "officer_id")
      NOT VALID;
  END IF;
END $$;
