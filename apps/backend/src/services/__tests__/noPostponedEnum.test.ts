/**
 * Guard dead enum POSTPONED (2026-09-16).
 *
 * `POSTPONED` adalah nilai `assignment_status` yang tidak pernah ditulis
 * alur manapun (generator: ACTIVE; transfer petugas: REASSIGNED;
 * skip petugas: UNCOLLECTED) dan tidak punya baris di DB produksi.
 * Dihapus bersamaan dengan pembersihan kode.
 *
 * Aturan: kata "POSTPONED" tidak boleh muncul sebagai *kode* (nilai enum,
 * anggota enum TS, validasi zod) di seluruh source backend. Komentar
 * penjelasan ("POSTPONED dihapus ...") dikecualikan karena tidak menjadi
 * bagian kode yang dieksekusi — pengecualian dipakai untuk menjaga jejak
 * audit alasan penghapusan tetap terbaca.
 *
 * Tujuan: mencegah dead enum hidup lagi diam-diam (mis. anggota enum baru
 * atau validasi API yang menerima nilai tanpa alur yang menulisnya).
 */
import * as fs from 'fs';
import * as path from 'path';

/** Komentar inline atau penjelasan — bukan kode yang dieksekusi. */
function isInsideComment(line: string): boolean {
  const trimmed = line.trim();
  // komentar penuh (// atau * atau /*)
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return true;
  // komentar inline setelah kode: hanya izinkan bila kemunculan POSTPONED
  // berada SETELAH token komentar (mis. `status: 'X' // POSTPONED ...`).
  const idx = line.indexOf('//');
  return idx !== -1 && line.indexOf('POSTPONED') > idx;
}

describe('POSTPONED adalah dead enum dan tidak boleh muncul sebagai kode', () => {
  it('tidak ada anggota enum / nilai / validasi zod POSTPONED di backend', () => {
    const srcRoot = path.join(__dirname, '..', '..');
    const hits: string[] = [];

    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.name.endsWith('.ts')) continue;
        if (entry.name.endsWith('.test.ts')) continue; // dir ini sendiri
        const src = fs.readFileSync(full, 'utf8');
        for (const line of src.split('\n')) {
          if (!line.includes('POSTPONED')) continue;
          if (isInsideComment(line)) continue;
          hits.push(`${path.relative(srcRoot, full)}: ${line.trim().slice(0, 90)}`);
        }
      }
    };

    walk(srcRoot);

    expect(hits).toEqual([]);
  });
});
