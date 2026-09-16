/**
 * Guard kelas bug overview 500 (2026-09-15, fix 0e99267).
 *
 * Aturan: ekspresi tanggal mentah (variabel tanggal atau `new Date(...)`)
 * TIDAK BOLEH menjadi operand perbandingan langsung di dalam template
 * `sql`. Driver postgres-js memanggil `Buffer.byteLength()` pada tiap
 * parameter bind dan menolak Date dengan `ERR_INVALID_ARG_TYPE`, yang
 * meledak menjadi 500 seluruh endpoint.
 *
 * Pola wajib untuk filter tanggal: operator Drizzle (`gte`/`lt`/`lte`).
 * Literal string tanggal boleh dibungkus `sql` agar tetap string di driver
 * (semantik identik, bukan Date) — itu TIDAK ditandai tes ini. Interpolasi
 * kolom/number/string untuk keperluan non-tanggal juga tidak ditandai.
 *
 * Tes ini statis (tanpa database): memindai seluruh file `.ts` di bawah
 * `services` dan `routes`, kecuali `__tests__` dan `*.test.ts`.
 */
import * as fs from 'fs';
import * as path from 'path';

/** Awal ekspresi tanggal mentah yang dilarang sebagai operand. */
const DATE_EXPR_HEAD =
  /^\s*(start|end|today|weekStart|monthStart|startDate|endDate|now|visitedAt|collectedAt|firstStart)\b/;

const TRAILING_OP = /(>=|<=|<>|!=|=|<|>)\s*$/;
const LEADING_OP = /^\s*(>=|<=|<>|!=|=|<|>)/;
const TRAILING_ARROW = /=>\s*$/;

/** Isi mentah tiap template bertag `sql` (tanpa backtick pembatas). */
function sqlSpans(src: string): string[] {
  const spans: string[] = [];
  let i = 0;
  while (i < src.length) {
    const tag = src.indexOf('sql`', i);
    if (tag === -1) break;
    let j = tag + 4;
    let depth = 0;
    while (j < src.length) {
      const ch = src[j];
      if (depth === 0 && ch === '`') break;
      if (ch === '$' && src[j + 1] === '{') {
        depth += 1;
        j += 2;
        continue;
      }
      if (ch === '}') {
        depth -= 1;
        j += 1;
        continue;
      }
      j += 1;
    }
    spans.push(src.slice(tag + 4, j));
    i = j + 1;
  }
  return spans;
}

function isDateExpr(expr: string): boolean {
  const trimmed = expr.trim();
  return DATE_EXPR_HEAD.test(trimmed) || /new Date\s*\(/.test(trimmed);
}

/**
 * Pelanggaran dalam satu span: interpolasi tanggal yang bersebelahan
 * langsung dengan operator perbandingan (`col >= ${start}`). Interpolasi
 * tanggal yang berdiri sendiri (mis. dibungkus `sql` sebagai argumen
 * operator Drizzle) bukan pelanggaran.
 */
function spanViolations(span: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < span.length) {
    const d = span.indexOf('${', i);
    if (d === -1) break;
    let j = d + 2;
    let depth = 1;
    while (j < span.length && depth > 0) {
      if (span[j] === '{') depth += 1;
      else if (span[j] === '}') depth -= 1;
      j += 1;
    }
    const expr = span.slice(d + 2, j - 1);
    if (isDateExpr(expr)) {
      const before = span.slice(0, d);
      const after = span.slice(j);
      const beforeOp = TRAILING_OP.exec(before);
      const afterOp = LEADING_OP.exec(after);
      // `=>` (arrow function) diakhiri `>` — bukan operator perbandingan.
      const hasBeforeOp = !!beforeOp && !TRAILING_ARROW.test(before);
      if (hasBeforeOp || !!afterOp) {
        out.push(expr.trim().slice(0, 80));
      }
    }
    i = j;
  }
  return out;
}

function collectTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectTsFiles(full, out);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

describe('larangan operand tanggal mentah di perbandingan sql', () => {
  it('tidak ada interpolasi tanggal sebagai operand perbandingan sql', () => {
    const backendSrc = path.join(__dirname, '..', '..');
    const roots = [path.join(backendSrc, 'services'), path.join(backendSrc, 'routes')];
    const violations: string[] = [];

    for (const root of roots) {
      for (const file of collectTsFiles(root)) {
        const src = fs.readFileSync(file, 'utf8');
        for (const span of sqlSpans(src)) {
          for (const expr of spanViolations(span)) {
            violations.push(`${path.relative(backendSrc, file)}: operand ${expr}`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
