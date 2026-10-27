-- Index untuk guard hapus permanen kaleng.
-- `canService.findDraftLocks` mencari baris draft lewat `can_id` saja, sedangkan
-- index yang sudah ada adalah unik gabungan (draft_id, can_id) — kolom depannya
-- `draft_id`, jadi tidak bisa dipakai untuk pencarian per kaleng.
-- Dampak sebelumnya: setiap percobaan hapus permanen memindai seluruh tabel.
CREATE INDEX "period_draft_items_can_idx" ON "period_draft_items" USING btree ("can_id");--> statement-breakpoint
