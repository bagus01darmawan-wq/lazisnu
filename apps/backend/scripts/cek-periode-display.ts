/**
 * LAPORAN BACA-SAJA: asal-usul `display_period` 2026-07 untuk akun bendahara.
 *
 * Server menentukan `display_period` = periode berhak tertua yang belum tuntas
 * (jendela 6 bulan dari periode operasional berjalan) untuk cakupan akun:
 *   1. cari akun bendahara (role STAF_KEUANGAN, atau nama mengandung "bunda")
 *   2. hitung scope-nya (branchId || districtId)
 *   3. jalankan ulang `getPeriodState` (logika persis endpoint
 *      /mobile/period-context & /admin/period-context)
 *   4. rincikan SEL yang belum tuntas per periode (alasan + waiting_for)
 *
 * Skrip ini TIDAK PERNAH mengubah data (hanya SELECT + logika baca).
 * Jangan tambahkan UPDATE/DELETE di sini.
 *
 * Pakai:
 *   DATABASE_URL="postgres://..." npx tsx scripts/cek-periode-display.ts [--kunci=<substring>] [--konsol] [--semua]
 *
 *   --kunci=bunda   hanya akun dengan nama/email mengandung "bunda"
 *                   (default: tanpa filter, semua STAF_KEUANGAN)
 *   --konsol        tampilkan rekonstruksi SEL lengkap (siapa belum tuntas)
 *   --semua         tampilkan SEMUA role (bayesian: benarkah 'bunda' sudah di DB?)
 *
 * Kebutuhan: DATABASE_URL dari .env backend (skrip ini membaca process.env
 * langsung; jalankan lewat shell yang sudah punya DATABASE_URL, atau pass
 * lewat argumen --url=... AWS-1 pooler 6543 SAMA seperti di .env).
 */
import postgres from 'postgres';

const LOOKBACK = 6;
const EMAIL_SUFFIX = '@petugas.lazisnu.id';

/* ── util periode (cerminan periodState.ts) ──────────────────────────────── */
interface Ref {
  year: number;
  month: number;
}
function ordinal(p: Ref): number {
  return p.year * 12 + (p.month - 1);
}
function shift(p: Ref, delta: number): Ref {
  const t = ordinal(p) + delta;
  return { year: Math.floor(t / 12), month: (t % 12) + 1 };
}
function periodKey(p: Ref): string {
  return `${p.year}-${String(p.month).padStart(2, '0')}`;
}
function periodList(anchor: Ref, count: number): Ref[] {
  const out: Ref[] = [];
  for (let i = count - 1; i >= 0; i -= 1) out.push(shift(anchor, -i));
  return out;
}

/* ── sel struktural (cerminan PeriodCell) ─────────────────────────────── */
interface Sel {
  eligible: boolean;
  settled: boolean;
  reason: string | null;
  waitingFor: string | null;
}
function sel(): Sel {
  return { eligible: false, settled: false, reason: null, waitingFor: null };
}

interface Args {
  url: string;
  kunci: string | null;
  konsol: boolean;
  semua: boolean;
}
function argValue(): Args {
  const args = process.argv.slice(2);
  const urlArg = args.find((a) => a.startsWith('--url='));
  const kunciArg = args.find((a) => a.startsWith('--kunci='));
  return {
    url: urlArg ? urlArg.slice('--url='.length) : process.env.DATABASE_URL || '',
    kunci: kunciArg ? kunciArg.slice('--kunci='.length).toLowerCase() : null,
    konsol: args.includes('--konsol'),
    semua: args.includes('--semua'),
  };
}

interface Akun {
  id: string;
  full_name: string;
  email: string;
  role: string;
  branch_id: string | null;
  district_id: string | null;
  branch_name: string | null;
  district_name: string | null;
  is_active: boolean;
}

type Sql = postgres.Sql;

async function operationalPeriod(sql: Sql): Promise<{ ref: Ref; via: string }> {
  // Cerminan `currentOperationalPeriod`: WIB, batas assign tgl 20.
  // Preferensi: baca dari period_calendar (sumber kalender resmi, status terakhir)
  // supaya tanggalnya konsisten dengan server. Fallback: jam WIB sekarang.
  const rows = await sql<{ period_year: number; period_month: number; status: string }[]>`
    SELECT period_year, period_month, status
      FROM period_calendar
     ORDER BY period_year DESC, period_month DESC
     LIMIT 1`;
  if (rows.length > 0) {
    const r = rows[0];
    return { ref: { year: r.period_year, month: r.period_month }, via: `period_calendar (${r.status})` };
  }
  const wib = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  return { ref: { year: wib.getFullYear(), month: wib.getMonth() + 1 }, via: 'jam WIB' };
}

async function branchCells(
  sql: Sql,
  branchId: string,
  periods: Ref[],
): Promise<{ map: Map<string, Sel>; detail: string[] }> {
  const from = periods[0];
  const to = periods[periods.length - 1];
  const lo = ordinal(from) + 1;
  const hi = ordinal(to) + 1;
  const detail: string[] = [];

  const assignmentRows = await sql<{ year: number; month: number; total: number; reassigned: number }[]>`
    SELECT a.period_year AS year, a.period_month AS month,
           count(*)::int AS total,
           count(*) FILTER (WHERE a.status = 'REASSIGNED')::int AS reassigned
      FROM assignments a
      JOIN officers o ON a.officer_id = o.id
     WHERE o.branch_id = ${branchId}
       AND (a.period_year * 12 + a.period_month) BETWEEN ${lo} AND ${hi}
     GROUP BY a.period_year, a.period_month`;

  const ppkRows = await sql<{ year: number; month: number; status: string; total: number }[]>`
    SELECT period_year AS year, period_month AS month, status, count(*)::int AS total
      FROM ppk_submissions
     WHERE branch_id = ${branchId}
       AND (period_year * 12 + period_month) BETWEEN ${lo} AND ${hi}
     GROUP BY period_year, period_month, status`;

  const map = new Map<string, Sel>();
  const get = (p: Ref): Sel => {
    const k = periodKey(p);
    let s = map.get(k);
    if (!s) {
      s = sel();
      map.set(k, s);
    }
    return s;
  };

  const work = new Map<string, number>();
  for (const r of assignmentRows) {
    const k = periodKey({ year: r.year, month: r.month });
    work.set(k, (work.get(k) ?? 0) + (Number(r.total) - Number(r.reassigned)));
    if (Number(r.total) - Number(r.reassigned) > 0) detail.push(`assignments aktif ${k}: ${Number(r.total) - Number(r.reassigned)}`);
  }

  const ppkByPeriod = new Map<string, { draft: number; signed: number; other: number }>();
  for (const r of ppkRows) {
    const k = periodKey({ year: r.year, month: r.month });
    const acc = ppkByPeriod.get(k) ?? { draft: 0, signed: 0, other: 0 };
    if (r.status === 'DRAFT') acc.draft += Number(r.total);
    else if (r.status === 'PPK_SIGNED') acc.signed += Number(r.total);
    else acc.other += Number(r.total);
    ppkByPeriod.set(k, acc);
    detail.push(`ppk_submissions ${k}: ${r.status} ×${Number(r.total)}`);
  }


  for (const [k, aktif] of work) {
    if (aktif <= 0) continue;
    const [y, m] = k.split('-').map(Number);
    get({ year: y, month: m }).eligible = true;
  }

  // Branch completion follows PPK FINAL; there is no second BA-to-MWC stage.
  for (const [k, s] of map) {
    if (s.settled) continue;
    const ppk = ppkByPeriod.get(k);
    if (ppk && ppk.draft === 0 && ppk.signed === 0 && ppk.other > 0) {
      s.settled = true;
      continue;
    }
    if (!ppk || ppk.draft + ppk.signed > 0) {
      if (ppk && ppk.signed > 0) {
        s.reason = 'PPK_WAITING_BENDAHARA';
        s.waitingFor = 'BENDAHARA_RANTING';
      } else {
        s.reason = 'PPK_DRAFT';
        s.waitingFor = 'PPK';
      }
    }
  }

  return { map, detail };
}

async function districtCells(
  sql: Sql,
  districtId: string,
  periods: Ref[],
): Promise<{ map: Map<string, Sel>; detail: string[] }> {
  const from = periods[0];
  const to = periods[periods.length - 1];
  const lo = ordinal(from) + 1;
  const hi = ordinal(to) + 1;
  const detail: string[] = [];

  const assignmentRows = await sql<{ year: number; month: number; branch_id: string; total: number; reassigned: number }[]>`
    SELECT a.period_year AS year, a.period_month AS month, o.branch_id AS "branchId",
           count(*)::int AS total,
           count(*) FILTER (WHERE a.status = 'REASSIGNED')::int AS reassigned
      FROM assignments a
      JOIN officers o ON a.officer_id = o.id
      JOIN branches b ON o.branch_id = b.id
     WHERE b.district_id = ${districtId}
       AND (a.period_year * 12 + a.period_month) BETWEEN ${lo} AND ${hi}
     GROUP BY a.period_year, a.period_month, o.branch_id`;

  const ppkRows = await sql<{ year: number; month: number; branch_id: string; status: string; total: number }[]>`
    SELECT p.period_year AS year, p.period_month AS month, p.branch_id, p.status, count(*)::int AS total
      FROM ppk_submissions p
      JOIN branches b ON b.id = p.branch_id
     WHERE b.district_id = ${districtId}
       AND (p.period_year * 12 + p.period_month) BETWEEN ${lo} AND ${hi}
     GROUP BY p.period_year, p.period_month, p.branch_id, p.status`;
  const map = new Map<string, Sel>();
  const get = (p: Ref): Sel => {
    const k = periodKey(p);
    let s = map.get(k);
    if (!s) {
      s = sel();
      map.set(k, s);
    }
    return s;
  };

  const branchesWithWork = new Map<string, Set<string>>();
  for (const r of assignmentRows) {
    const aktif = Number(r.total) - Number(r.reassigned);
    if (aktif <= 0) continue;
    const k = periodKey({ year: r.year, month: r.month });
    const set = branchesWithWork.get(k) ?? new Set<string>();
    set.add(r.branch_id);
    branchesWithWork.set(k, set);
    get({ year: r.year, month: r.month }).eligible = true;
  }

  const ppkByPeriodBranch = new Map<string, Map<string, { draft: number; signed: number; final: number }>>();
  for (const r of ppkRows) {
    const k = periodKey({ year: r.year, month: r.month });
    const byBranch = ppkByPeriodBranch.get(k) ?? new Map();
    const status = byBranch.get(r.branch_id) ?? { draft: 0, signed: 0, final: 0 };
    if (r.status === 'DRAFT') status.draft += Number(r.total);
    else if (r.status === 'PPK_SIGNED') status.signed += Number(r.total);
    else status.final += Number(r.total);
    byBranch.set(r.branch_id, status);
    ppkByPeriodBranch.set(k, byBranch);
    detail.push(`ppk_submissions ${k} ${r.branch_id}: ${r.status} ×${Number(r.total)}`);
  }

  for (const [k, s] of map) {
    const needed = branchesWithWork.get(k) ?? new Set<string>();
    const ppkByBranch = ppkByPeriodBranch.get(k) ?? new Map();
    s.settled = [...needed].every((branchId) => {
      const ppk = ppkByBranch.get(branchId);
      return !!ppk && ppk.draft === 0 && ppk.signed === 0 && ppk.final > 0;
    });
    if (!s.settled) {
      s.reason = 'DISTRICT_UNSETTLED';
      s.waitingFor = 'ADMIN';
    }
  }

  return { map, detail };
}

async function main(): Promise<void> {
  const { url, kunci, konsol, semua } = argValue();
  if (!url) {
    console.error('DATABASE_URL belum diisi. Jalankan dengan DATABASE_URL di env, atau --url=... AWS-1 pooler 6543 SAMA seperti di .env.');
    process.exit(2);
  }
  const sql: Sql = postgres(url, { max: 1, prepare: false, idle_timeout: 5 });
  try {
    let akun: Akun[] = await sql<Akun[]>`
      SELECT u.id, u.full_name, u.email, u.role::text AS role,
             u.branch_id, u.district_id,
             b.name AS branch_name, d.name AS district_name, u.is_active
        FROM users u
        LEFT JOIN branches b ON b.id = u.branch_id
        LEFT JOIN districts d ON d.id = u.district_id
       WHERE u.role = 'STAF_KEUANGAN'
       ORDER BY u.full_name`;
    const semuaKeuangan = akun.length;
    if (semua) {
      akun = await sql<Akun[]>`
        SELECT u.id, u.full_name, u.email, u.role::text AS role,
               u.branch_id, u.district_id,
               b.name AS branch_name, d.name AS district_name, u.is_active
          FROM users u
          LEFT JOIN branches b ON b.id = u.branch_id
          LEFT JOIN districts d ON d.id = u.district_id
         ORDER BY u.role, u.full_name`;
    } else if (kunci) {
      akun = akun.filter(
        (a) => a.full_name.toLowerCase().includes(kunci) || a.email.toLowerCase().includes(kunci),
      );
    }
    // Fallback: bila kunci tak cocok, cari nama mengandung "bunda" di semua role.
    if (kunci && akun.length === 0 && !semua) {
      akun = await sql<Akun[]>`
        SELECT u.id, u.full_name, u.email, u.role::text AS role,
               u.branch_id, u.district_id,
               b.name AS branch_name, d.name AS district_name, u.is_active
          FROM users u
          LEFT JOIN branches b ON b.id = u.branch_id
          LEFT JOIN districts d ON d.id = u.district_id
         WHERE u.full_name ILIKE ${'%' + kunci + '%'} OR u.email ILIKE ${'%' + kunci + '%'}
         ORDER BY u.full_name`;
      console.log('(fallback) kunci tidak ditemukan di STAF_KEUANGAN — dicari di semua role.');
    }
    if (semua) {
      const hitungRole = await sql<{ role: string; n: number }[]>`
        SELECT role::text AS role, count(*)::int AS n FROM users GROUP BY role ORDER BY role`;
      console.log('Rekap role di tabel users:');
      for (const r of hitungRole) console.log(`  ${r.role}: ${r.n}`);
      console.log('');
    }
    if (akun.length === 0) {
      console.log(`Tidak ada akun bendahara yang cocok. Total STAF_KEUANGAN di DB: ${semuaKeuangan}.`);
      return;
    }

    const op = await operationalPeriod(sql);
    const periods = periodList(op.ref, LOOKBACK);
    console.log(`Periode operasional berjalan (cerminan server): ${periodKey(op.ref)}  [sumber: ${op.via}]`);
    console.log(`Jendela pencarian: ${periodKey(periods[0])} … ${periodKey(periods[periods.length - 1])} (${LOOKBACK} bulan)`);
    console.log(`Akun diperiksa: ${akun.length}${kunci ? ` (kunci "${kunci}")` : ''}\n`);

    for (const a of akun) {
      const scope = a.branch_id
        ? { kind: 'branch' as const, id: a.branch_id }
        : a.district_id
          ? { kind: 'district' as const, id: a.district_id }
          : null;
      console.log(`── ${a.full_name} <${a.email}> [${a.role}] aktif=${a.is_active ? 'ya' : 'tidak'} ──`);
      if (!scope) {
        console.log('  SCOPE_MISSING: akun tidak punya branch_id/district_id → endpoint membalas 400, display_period tidak pernah dibentuk.');
        continue;
      }
      console.log(
        `  Scope: ${scope.kind} = ${scope.kind === 'branch' ? a.branch_name : a.district_name} (${scope.id})`,
      );

      const { map, detail } =
        scope.kind === 'branch'
          ? await branchCells(sql, scope.id, periods)
          : await districtCells(sql, scope.id, periods);

      const unsettled: Array<{ p: Ref; s: Sel }> = [];
      for (const p of periods) {
        const s = map.get(periodKey(p));
        if (!s || !s.eligible || s.settled) continue;
        if (!s.reason || !s.waitingFor) continue;
        unsettled.push({ p, s });
      }
      const first = unsettled[0];
      console.log(`  display_period = ${first ? periodKey(first.p) : periodKey(op.ref)} (alasan: ${first ? first.s.reason : '—'})`);
      console.log(`  unsettled (${unsettled.length}): ${unsettled.map((u) => `${periodKey(u.p)} [${u.s.reason} → ${u.s.waitingFor}]`).join(', ') || '—'}`);
      if (konsol) {
        console.log('  ── isi SEL (rekonstruksi) ──');
        for (const p of periods) {
          const s = map.get(periodKey(p));
          if (!s) continue;
          console.log(
            `    ${periodKey(p)}: eligible=${s.eligible} settled=${s.settled} reason=${s.reason ?? '—'} waiting=${s.waitingFor ?? '—'}`,
          );
        }
        if (detail.length > 0) {
          console.log('  ── baris pemicu ──');
          for (const d of detail) console.log(`    ${d}`);
        }
      }
      console.log('');
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error('Gagal menjalankan laporan:', err instanceof Error ? err.message : err);
  process.exit(2);
});
