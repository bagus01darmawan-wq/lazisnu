import { db } from '../config/database';
import * as schema from '../database/schema';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { JWTPayload } from '../middleware/auth';

/**
 * Ringkasan per wilayah untuk layer kartu (halaman Cans & Assignments).
 *
 * Dua scope, dipilih dari role — bukan dari parameter request:
 *  - ADMIN_KECAMATAN → satu kartu per ranting di kecamatannya.
 *  - ADMIN_RANTING    → satu kartu per dukuh di rantingnya.
 *
 * Admin Ranting dengan ranting tanpa record dukuh (`dukuhs` kosong) akan
 * mendapat SATU kartu mewakili ranting itu sendiri. Tanpa fallback ini
 * layer 1 akan kosong total dan user tidak punya apa pun untuk diklik —
 * persis kondisi yang layer kartu ini diciptakan untuk dihilangkan.
 *
 * Angka pada kartu harus SEDAPAT mungkin dengan tabel yang muncul setelah
 * kartu ditekan, jadi agregasi di sini memakai filter yang sama dengan
 * `canService.getCans` (roleScope + branch_id + condition) dan rute
 * `/admin/assignments` (periode + branch_id).
 */

export type RegionScope = 'branch' | 'dukuh';

export interface RegionSummary {
  /** `branch` = kartu ranting, `dukuh` = kartu dukuh. */
  kind: RegionScope;
  /** Falls back ke ranting saat tidak ada dukuh (lihat catatan di atas). */
  isFallback: boolean;
  id: string;
  name: string;
  /** Hanya terisi untuk kartu dukuh: ranting induknya. */
  branchId: string | null;
  branchName: string | null;
  /** Hanya terisi untuk kartu ranting. */
  branchCode: string | null;
  total: number;
  breakdown: Record<string, number>;
  nonActive: number;
  assigned: number;
  unassigned: number;
  completed: number;
  uncollected: number;
  officerCount: number;
  activeOfficerCount: number;
  unmappedOfficerCount: number;
  /**
   * Petugas di wilayah ini. Kartu Penugasan menampilkan daftarnya supaya admin
   * tahu siapa yang menutup wilayah tersebut tanpa perlu klik ke tabel.
   */
  officers: RegionOfficer[];
}

export interface RegionOfficer {
  id: string;
  name: string;
  employeeCode: string;
  isActive: boolean;
}

export interface RegionCardResponse {
  scope: RegionScope;
  period: { year: number; month: number } | null;
  /**
   * Petugas di ranting admin ini yang belum punya relasi Dukuh.
   *
   * Ditaruh di level respons, BUKAN ditempel ke salah satu kartu dukuh:
   * attaching-nya ke kartu tertentu berarti mengklaim officer itu anggota
   * dukuh itu, dan itu data yang tidak kita ketahui. Daftar officer yang
   * belum ter-mapping sengaja tidak dipaksakan ke Dukuh mana pun.
   *
   * 0 untuk scope branch — di scope itu semua petugas ranting sudah
   * tercakup oleh filter ranting.
   */
  unmappedOfficerCount: number;
  regions: RegionSummary[];
}

function parsePeriod(year?: string, month?: string) {
  if (!year || !month) return null;
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  if (Number.isNaN(y) || Number.isNaN(m)) return null;
  return { year: y, month: m };
}

/**
 * Ranting yang boleh dilihat user. Sama dengan `getRoleScope`, tapi
 * diekspresikan sebagai daftar id supaya bisa dipakai sebagai daftar kartu.
 */
async function visibleBranchIds(user: JWTPayload): Promise<string[] | 'all'> {
  if (user.role === 'ADMIN_RANTING') {
    return user.branchId ? [user.branchId] : [];
  }
  if (user.role === 'ADMIN_KECAMATAN') {
    if (!user.districtId) return [];
    const rows = await db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(eq(schema.branches.districtId, user.districtId));
    return rows.map((r) => r.id);
  }
  return 'all';
}

/** Upgrade `STAF_*` dengan scope branchId seperti `getRoleScope` (C1-T0 §14.13/B-5). */
function isRantingScoped(user: JWTPayload) {
  return (
    (user.role === 'ADMIN_RANTING' || (user.role === 'STAF_PENGUMPULAN' && user.branchId) ||
      (user.role === 'STAF_KEUANGAN' && user.branchId)) && !!user.branchId
  );
}

function isDistrictScoped(user: JWTPayload) {
  return (
    (user.role === 'ADMIN_KECAMATAN' || (user.role === 'STAF_PENGUMPULAN' && user.districtId) ||
      (user.role === 'STAF_KEUANGAN' && user.districtId)) && !!user.districtId
  );
}

function emptyBreakdown(): Record<string, number> {
  return { AKTIF: 0, RUSAK: 0, HILANG: 0, NON_AKTIF: 0, DIKEMBALIKAN: 0 };
}

function emptyRegion(over: Partial<RegionSummary>): RegionSummary {
  return {
    kind: 'branch',
    isFallback: false,
    id: '',
    name: '',
    branchId: null,
    branchName: null,
    branchCode: null,
    total: 0,
    breakdown: emptyBreakdown(),
    nonActive: 0,
    assigned: 0,
    unassigned: 0,
    completed: 0,
    uncollected: 0,
    officerCount: 0,
    activeOfficerCount: 0,
    unmappedOfficerCount: 0,
    officers: [],
    ...over,
  };
}

/**
 * Satu query untuk agregat kaleng + assignment + petugas per wilayah.
 *
 * Dipisah tiga SELECT, bukan satu JOIN besar: kaleng, assignment, dan
 * petugas punya kardinalitas berbeda. joinedLeft pada tiga sisi sekaligus
 * akan membikin penghitung bisa terduplikasi, dan angka di kartu harus
 * bisa dipercaya tanpa perlu cek ulang.
 */
async function aggregate(
  regionIds: string[],
  regionColumn: 'branchId' | 'dukuhId',
  period: { year: number; month: number } | null
) {
  const regionFilter = inArray(schema.cans[regionColumn], regionIds);

  const canRows = await db
    .select({
      regionId: schema.cans[regionColumn],
      total: sql<number>`count(*)`,
      aktif: sql<number>`count(*) FILTER (WHERE ${schema.cans.condition} = 'AKTIF')`,
      rusak: sql<number>`count(*) FILTER (WHERE ${schema.cans.condition} = 'RUSAK')`,
      hilang: sql<number>`count(*) FILTER (WHERE ${schema.cans.condition} = 'HILANG')`,
      nonAktif: sql<number>`count(*) FILTER (WHERE ${schema.cans.condition} = 'NON_AKTIF')`,
      dikembalikan: sql<number>`count(*) FILTER (WHERE ${schema.cans.condition} = 'DIKEMBALIKAN')`,
    })
    .from(schema.cans)
    .where(regionFilter)
    .groupBy(schema.cans[regionColumn]);

  const assignmentConds: any[] = [regionFilter];
  if (period) {
    assignmentConds.push(eq(schema.assignments.periodYear, period.year));
    assignmentConds.push(eq(schema.assignments.periodMonth, period.month));
  }
  const assignmentRows = await db
    .select({
      regionId: schema.cans[regionColumn],
      assigned: sql<number>`count(*)`,
      completed: sql<number>`count(*) FILTER (WHERE ${schema.assignments.status} = 'COMPLETED')`,
      uncollected: sql<number>`count(*) FILTER (WHERE ${schema.assignments.status} = 'UNCOLLECTED')`,
    })
    .from(schema.assignments)
    .innerJoin(schema.cans, eq(schema.cans.id, schema.assignments.canId))
    .where(and(...assignmentConds))
    .groupBy(schema.cans[regionColumn]);

  const officerRows = await db
    .select({
      regionId: schema.officers[regionColumn],
      officerCount: sql<number>`count(*)`,
      activeOfficerCount: sql<number>`count(*) FILTER (WHERE ${schema.officers.isActive})`,
    })
    .from(schema.officers)
    .where(inArray(schema.officers[regionColumn], regionIds))
    .groupBy(schema.officers[regionColumn]);

  // Daftar petugas per wilayah, untuk isi kartu Penugasan.
  const officerListRows = await db
    .select({
      regionId: schema.officers[regionColumn],
      id: schema.officers.id,
      name: schema.officers.fullName,
      employeeCode: schema.officers.employeeCode,
      isActive: schema.officers.isActive,
    })
    .from(schema.officers)
    .where(inArray(schema.officers[regionColumn], regionIds))
    .orderBy(schema.officers.fullName);

  return { canRows, assignmentRows, officerRows, officerListRows };
}

function pick<T extends { regionId: string | null }>(rows: T[], id: string): T | undefined {
  return rows.find((r) => r.regionId === id);
}

function officersOf(
  rows: { regionId: string | null; id: string; name: string; employeeCode: string; isActive: boolean }[],
  id: string
): RegionOfficer[] {
  return rows
    .filter((r) => r.regionId === id)
    .map((r) => ({ id: r.id, name: r.name, employeeCode: r.employeeCode, isActive: r.isActive }));
}

/** Kartu per ranting — dipakai admin kecamatan, dan admin ranting sebagai fallback. */
async function buildBranchCards(
  user: JWTPayload,
  period: { year: number; month: number } | null
): Promise<RegionSummary[]> {
  const allowed = await visibleBranchIds(user);
  const branchRows =
    allowed === 'all'
      ? await db.select().from(schema.branches)
      : allowed.length === 0
        ? []
        : await db
            .select()
            .from(schema.branches)
            .where(inArray(schema.branches.id, allowed));

  const ids = branchRows.map((b) => b.id);
  if (ids.length === 0) return [];

  const agg = await aggregate(ids, 'branchId', period);

  return branchRows
    .map((b) => {
      const c = pick(agg.canRows, b.id);
      const a = pick(agg.assignmentRows, b.id);
      const o = pick(agg.officerRows, b.id);
      const total = c ? Number(c.total) : 0;
      const breakdown = c
        ? {
            AKTIF: Number(c.aktif),
            RUSAK: Number(c.rusak),
            HILANG: Number(c.hilang),
            NON_AKTIF: Number(c.nonAktif),
            DIKEMBALIKAN: Number(c.dikembalikan),
          }
        : emptyBreakdown();
      const assigned = a ? Number(a.assigned) : 0;
      const completed = a ? Number(a.completed) : 0;
      return emptyRegion({
        kind: 'branch',
        isFallback: false,
        id: b.id,
        name: b.name,
        branchId: b.id,
        branchName: b.name,
        branchCode: b.code,
        total,
        breakdown,
        nonActive: breakdown.NON_AKTIF,
        assigned,
        unassigned: Math.max(total - assigned, 0),
        completed,
        uncollected: a ? Number(a.uncollected) : 0,
        officerCount: o ? Number(o.officerCount) : 0,
        activeOfficerCount: o ? Number(o.activeOfficerCount) : 0,
        unmappedOfficerCount: 0,
        officers: officersOf(agg.officerListRows, b.id),
      });
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'id'));
}

/**
 * Kartu per dukuh untuk admin ranting.
 *
 * Ranting yang tidak punya record dukuh dapat satu kartu fallback
 * mewakili ranting itu sendiri (O1, disetujui 2026-09-26).
 */
async function buildDukuhCards(
  user: JWTPayload,
  period: { year: number; month: number } | null
): Promise<{ regions: RegionSummary[]; unmappedOfficerCount: number }> {
  if (!user.branchId) return { regions: [], unmappedOfficerCount: 0 };

  const branch = await db.query.branches.findFirst({
    where: eq(schema.branches.id, user.branchId),
  });
  if (!branch) return { regions: [], unmappedOfficerCount: 0 };

  const dukuhRows = await db
    .select()
    .from(schema.dukuhs)
    .where(eq(schema.dukuhs.branchId, user.branchId));

  // Tanpa data dukuh, kartu per dukuh akan kosong. Fallback ke satu kartu ranting.
  if (dukuhRows.length === 0) {
    const all = await buildBranchCards(user, period);
    return {
      regions: all.length ? [{ ...all[0], isFallback: true }] : [],
      // Di scope fallback semua petugas ranting sudah tercakup, jadi tidak ada
      // yang perlu dilaporkan sebagai "belum ter-mapping".
      unmappedOfficerCount: 0,
    };
  }

  const ids = dukuhRows.map((d) => d.id);
  const agg = await aggregate(ids, 'dukuhId', period);

  // Petugas di ranting ini yang belum dipetakan ke dukuh mana pun.
  // Dihitung di sini (bukan di `aggregate`) karena `aggregate` menerima
  // daftar id DUKUH, sedangkan yang dicari CONDISIdukuh_id IS NULL pada
  // baris officer milik ranting induk.
  const [unmappedRow] = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.officers)
    .where(and(eq(schema.officers.branchId, user.branchId), isNull(schema.officers.dukuhId)));

  const cards = dukuhRows.map((d) => {
    const c = pick(agg.canRows, d.id);
    const a = pick(agg.assignmentRows, d.id);
    const o = pick(agg.officerRows, d.id);
    const total = c ? Number(c.total) : 0;
    const breakdown = c
      ? {
          AKTIF: Number(c.aktif),
          RUSAK: Number(c.rusak),
          HILANG: Number(c.hilang),
          NON_AKTIF: Number(c.nonAktif),
          DIKEMBALIKAN: Number(c.dikembalikan),
        }
      : emptyBreakdown();
    const assigned = a ? Number(a.assigned) : 0;
    return emptyRegion({
      kind: 'dukuh',
      isFallback: false,
      id: d.id,
      name: d.name,
      branchId: branch.id,
      branchName: branch.name,
      branchCode: branch.code,
      total,
      breakdown,
      nonActive: breakdown.NON_AKTIF,
      assigned,
      unassigned: Math.max(total - assigned, 0),
      completed: a ? Number(a.completed) : 0,
      uncollected: a ? Number(a.uncollected) : 0,
      officerCount: o ? Number(o.officerCount) : 0,
      activeOfficerCount: o ? Number(o.activeOfficerCount) : 0,
      unmappedOfficerCount: 0,
      officers: officersOf(agg.officerListRows, d.id),
    });
  });

  return {
    regions: cards.sort((a, b) => a.name.localeCompare(b.name, 'id')),
    unmappedOfficerCount: Number(unmappedRow?.n ?? 0),
  };
}

export async function getCanRegionCards(
  user: JWTPayload,
  period?: { year?: string; month?: string }
): Promise<RegionCardResponse> {
  const useDukuh = isRantingScoped(user) && !isDistrictScoped(user);
  const scope: RegionScope = useDukuh ? 'dukuh' : 'branch';
  const p = parsePeriod(period?.year, period?.month);
  if (useDukuh) {
    const { regions, unmappedOfficerCount } = await buildDukuhCards(user, p);
    return { scope, period: p, unmappedOfficerCount, regions };
  }
  return { scope, period: p, unmappedOfficerCount: 0, regions: await buildBranchCards(user, p) };
}

export async function getAssignmentRegionCards(
  user: JWTPayload,
  period?: { year?: string; month?: string }
): Promise<RegionCardResponse> {
  return getCanRegionCards(user, period);
}
