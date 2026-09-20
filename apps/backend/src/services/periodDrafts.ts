/**
 * C1-T3 — Generate Approve: robot siapkan draft → manusia setujui (§14.12, §6).
 *
 * Alur yang dikunci pemilik produk:
 * 1. Robot (cron tgl 10 & 20 via `POST /v1/scheduler/prepare-draft`, kunci
 *    internal) menyiapkan DRAFT siap-jalan per ranting/program — tepat jadwal,
 *    sesuai hitungan generator yang sama dengan tombol manual lama. Robot TIDAK
 *    PERNAH menulis tabel `assignments` (hanya draft + baris `period_calendar`
 *    yang identik dengan `buildPeriodBoundaries` — syarat review-T2 butir b).
 * 2. Staf Bid. Pengumpulan (scope ranting/MWC-program) boleh melihat + mengedit
 *    draft (ganti petugas, hapus item) lalu menyetujui → draft jadi tugas aktif
 *    dalam 1 transaksi; tombol mati sekali (setujui dua kali ditolak, aman dari
 *    klik ganda maupun cron ganda).
 * 3. Staf diam 24 jam → eskalasi: STAF_KEUANGAN (Bendahara/Sekretaris, scope
 *    sama) boleh menyetujui. Sekali salah satu setuju → selesai.
 * 4. Telat = tugas telat lahir (`assignedAt` = saat setuju, tidak dimajukan).
 *    Draft periode yang sudah dikunci / masih masa depan tidak bisa disetujui
 *    (menyetujui hanya melahirkan tugas mati).
 * 5. Sapuan susulan (§6, tgl 20): prepare men-top-up draft DRAFT; bila draft
 *    sudah APPROVED, selisih kaleng baru langsung dijadikan assignment
 *    (tercatat audit sebagai susulan robot — tanpa ini kaleng baru telantar
 *    sebulan, melanggar go/no-go "tidak ada uang hilang" §14.14).
 *
 * Batasan wilayah: FINAL/kunci (T4/T6), reopen (T7), laporan (T8), dan
 * pengiriman notifikasi (T11) BUKAN di sini. Persiapan T11 = daftar penerima
 * (`collectApprovalRecipients`) + jenis event (`approvalEventKind`), tanpa
 * mengirim apa pun.
 */
import { db } from '../config/database';
import * as schema from '../database/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { Errors } from '../utils/errorCatalog';
import { insertActivityLog } from './auditLogService';
import { findCansWithoutAssignment, buildFirstOfficerAssignments } from './assignmentGenerator';
import {
  buildPeriodBoundaries,
  isPeriodLocked,
  periodKey,
  resolvePeriodStatus,
} from './periodCalendar';
import { getRoleScope } from '../utils/role-scope';
import type { JWTPayload } from '../middleware/auth';

/** C1-T3 (§14.12): diam 24 jam → approve diteruskan ke Bendahara/Sekretaris. */
export const ESCALATION_HOURS = 24;

export interface DraftActor {
  userId: string;
  role: string;
  branchId?: string | null;
  districtId?: string | null;
}

export interface DraftScope {
  branchId: string;
  districtId: string;
  branchKind: 'RANTING' | 'PROGRAM_MWC';
}

// ---------------------------------------------------------------------------
// Fungsi murni (tanpa DB) — bisa di-unit-test tanpa fixture.
// ---------------------------------------------------------------------------

/** True bila draft sudah melewati jendela eskalasi 24 jam. */
export function isEscalated(preparedAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - preparedAt.getTime() >= ESCALATION_HOURS * 3_600_000;
}

/**
 * Komparator smoke test T12 (syarat review-T2 butir b): baris period_calendar
 * tulisan robot harus identik hingga milidetik dengan buildPeriodBoundaries.
 */
export function periodCalendarRowMatches(
  row: { assignDate: Date; dueDate: Date; toleranceEnd: Date },
  year: number,
  month: number,
): boolean {
  const b = buildPeriodBoundaries(year, month);
  return (
    row.assignDate.getTime() === b.assignDate.getTime() &&
    row.dueDate.getTime() === b.dueDate.getTime() &&
    row.toleranceEnd.getTime() === b.toleranceEnd.getTime()
  );
}

/** Jenis event approve untuk persiapan pengiriman T11 (tanpa efek samping). */
export function approvalEventKind(
  draft: { status: string; preparedAt: Date },
  now: Date = new Date(),
): 'APPROVED' | 'ESCALATED' | 'PENDING' {
  if (draft.status === 'APPROVED') return 'APPROVED';
  return isEscalated(draft.preparedAt, now) ? 'ESCALATED' : 'PENDING';
}

/**
 * Penjaga scope draft (§14.13): Staf Pengumpulan/Keuangan hanya menyentuh
 * draft scope-nya — rantingnya (branchId) atau program MWC distriknya
 * (districtId + branch kind=PROGRAM_MWC). Staf tanpa scope → 403 (pola T0).
 */
export function assertDraftAccess(actor: DraftActor, draft: DraftScope): void {
  if (actor.role !== 'STAF_PENGUMPULAN' && actor.role !== 'STAF_KEUANGAN') {
    throw Errors.FORBIDDEN('Hanya Staf Bid. Pengumpulan / Keuangan yang mengelola draft');
  }
  if (actor.branchId) {
    if (draft.branchId !== actor.branchId) {
      throw Errors.FORBIDDEN_SCOPE('Draft ini milik ranting/program lain');
    }
    return;
  }
  if (actor.districtId) {
    if (draft.districtId !== actor.districtId || draft.branchKind !== 'PROGRAM_MWC') {
      throw Errors.FORBIDDEN_SCOPE('Draft ini di luar program MWC distrik Anda');
    }
    return;
  }
  throw Errors.FORBIDDEN_SCOPE('Akun staf tanpa scope ranting/distrik');
}

// ---------------------------------------------------------------------------
// Robot: siapkan draft (dipanggil cron internal tgl 10 & 20 — lihat
// routes/scheduler.ts untuk spesifikasi jadwal).
// ---------------------------------------------------------------------------

export interface PrepareBranchResult {
  branchId: string;
  draftId: string;
  draftStatus: 'DRAFT' | 'APPROVED';
  addedItems: number;
  totalItems: number;
  /** Assignment langsung (susulan pasca-approve, §6 tgl 20). */
  directAssignments: number;
}

export interface PrepareResult {
  period: string;
  periodYear: number;
  periodMonth: number;
  calendarRowWritten: boolean;
  drafts: PrepareBranchResult[];
}

/** Tulis baris period_calendar bila belum ada (nilai = helper tunggal). */
async function ensurePeriodCalendarRow(year: number, month: number): Promise<boolean> {
  const b = buildPeriodBoundaries(year, month);
  await db
    .insert(schema.periodCalendar)
    .values({
      periodYear: year,
      periodMonth: month,
      assignDate: b.assignDate,
      dueDate: b.dueDate,
      toleranceEnd: b.toleranceEnd,
      status: 'OPEN',
    })
    .onConflictDoNothing({ target: [schema.periodCalendar.periodYear, schema.periodCalendar.periodMonth] });
  const row = await db.query.periodCalendar.findFirst({
    where: and(eq(schema.periodCalendar.periodYear, year), eq(schema.periodCalendar.periodMonth, month)),
  });
  // Baris warisan yang isinya meleset tidak ditimpa di sini — smoke test T12
  // (periodCalendarRowMatches) yang menandainya untuk rekonsiliasi manual.
  return !!row && periodCalendarRowMatches(row, year, month);
}

async function loadDraftWithBranch(draftId: string) {
  const draft = await db.query.periodDrafts.findFirst({
    where: eq(schema.periodDrafts.id, draftId),
    with: { branch: { columns: { id: true, districtId: true, kind: true } } },
  });
  if (!draft || !draft.branch) throw Errors.DRAFT_NOT_FOUND();
  return { draft, branchKind: draft.branch.kind as 'RANTING' | 'PROGRAM_MWC' };
}

export async function preparePeriodDraft(
  year: number,
  month: number,
  opts: { now?: Date } = {},
): Promise<PrepareResult> {
  const now = opts.now ?? new Date();
  const b = buildPeriodBoundaries(year, month); // sekaligus validasi periode
  void b;
  // Guard jadwal (§14.12 "tepat jadwal, tidak dimajukan"): robot hanya menyiapkan
  // draft bulan BERJALAN (cron tgl 10 → bulan itu = M+1 pasca-kunci; cron tgl 20
  // → susulan bulan itu). Draft masa depan tidak akan pernah bisa disetujui.
  const nowY = now.getFullYear();
  const nowM = now.getMonth() + 1;
  if (year > nowY || (year === nowY && month > nowM)) {
    throw Errors.VALIDATION_ERROR(
      `Draft periode ${periodKey(year, month)} belum berjalan — robot tidak menyiapkan masa depan.`,
    );
  }
  const calendarRowWritten = await ensurePeriodCalendarRow(year, month);

  const branches = await db.select({
    id: schema.branches.id,
    districtId: schema.branches.districtId,
  }).from(schema.branches);

  // Hitungan generator yang sama dengan tombol manual lama — global, lalu
  // dikelompokkan per ranting agar tiap draft hanya berisi kalengnya sendiri.
  const { cansToAssign } = await findCansWithoutAssignment(year, month);
  const cansByBranch = new Map<string, typeof cansToAssign>();
  for (const can of cansToAssign) {
    const list = cansByBranch.get(can.branchId) ?? [];
    list.push(can);
    cansByBranch.set(can.branchId, list);
  }

  const drafts: PrepareBranchResult[] = [];
  for (const branch of branches) {
    const result = await db.transaction(async (tx) => {
      const existing = await tx.query.periodDrafts.findFirst({
        where: and(
          eq(schema.periodDrafts.periodYear, year),
          eq(schema.periodDrafts.periodMonth, month),
          eq(schema.periodDrafts.branchId, branch.id),
        ),
      });

      const branchCans = cansByBranch.get(branch.id) ?? [];

      // Draft sudah APPROVED → sapuan susulan (§6 tgl 20): selisih kaleng baru
      // langsung jadi assignment (sudah disetujui manusianya), tercatat audit.
      if (existing && existing.status === 'APPROVED') {
        let direct = 0;
        if (branchCans.length > 0) {
          const built = buildFirstOfficerAssignments(branchCans, year, month);
          if (built.length > 0) {
            const inserted = await tx
              .insert(schema.assignments)
              .values(
                built.map((a) => ({
                  canId: a.canId!,
                  officerId: a.officerId!,
                  backupOfficerId: a.backupOfficerId ?? null,
                  periodYear: year,
                  periodMonth: month,
                  status: 'ACTIVE' as const,
                  assignedAt: now,
                })),
              )
              .onConflictDoNothing({
                target: [
                  schema.assignments.canId,
                  schema.assignments.officerId,
                  schema.assignments.periodYear,
                  schema.assignments.periodMonth,
                ],
              })
              .returning({ id: schema.assignments.id });
            direct = inserted.length;
          }
        }
        const [{ n: totalItems }] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(schema.periodDraftItems)
          .where(eq(schema.periodDraftItems.draftId, existing.id));
        try {
          await insertActivityLog({
            userId: null,
            officerId: null,
            actionType: 'DRAFT_TOPPED_UP_POST_APPROVAL',
            entityType: 'period_draft',
            entityId: existing.id,
            oldData: null,
            newData: { period: periodKey(year, month), branch_id: branch.id, direct_assignments: direct },
            ipAddress: 'scheduler-robot',
            userAgent: null,
          });
        } catch {
          // Audit tidak boleh menggagalkan prepare.
        }
        return {
          branchId: branch.id,
          draftId: existing.id,
          draftStatus: 'APPROVED' as const,
          addedItems: 0,
          totalItems,
          directAssignments: direct,
        };
      }

      // Draft DRAFT (atau belum ada) → buat/top-up item draft. Robot tidak
      // menyentuh tabel assignments di jalur ini (syarat review-T2 butir a).
      let draftId: string;
      if (existing) {
        draftId = existing.id;
      } else {
        const [created] = await tx
          .insert(schema.periodDrafts)
          .values({
            periodYear: year,
            periodMonth: month,
            branchId: branch.id,
            districtId: branch.districtId,
            status: 'DRAFT',
            // Eksplisit (bukan defaultNow) agar eskalasi 24 jam deterministik
            // terhadap `now` injeksi (cron nyata: now = waktu jalan).
            preparedAt: now,
          })
          .onConflictDoNothing({
            target: [
              schema.periodDrafts.periodYear,
              schema.periodDrafts.periodMonth,
              schema.periodDrafts.branchId,
            ],
          })
          .returning({ id: schema.periodDrafts.id });
        if (created) {
          draftId = created.id;
        } else {
          // Balapan dengan cron ganda: baca pemenangnya.
          const winner = await tx.query.periodDrafts.findFirst({
            where: and(
              eq(schema.periodDrafts.periodYear, year),
              eq(schema.periodDrafts.periodMonth, month),
              eq(schema.periodDrafts.branchId, branch.id),
            ),
          });
          draftId = winner!.id;
        }
      }

      const present = await tx
        .select({ canId: schema.periodDraftItems.canId })
        .from(schema.periodDraftItems)
        .where(eq(schema.periodDraftItems.draftId, draftId));
      const presentSet = new Set(present.map((r) => r.canId));
      const fresh = branchCans.filter((c) => !presentSet.has(c.id));
      let added = 0;
      if (fresh.length > 0) {
        const built = buildFirstOfficerAssignments(fresh, year, month);
        if (built.length > 0) {
          const inserted = await tx
            .insert(schema.periodDraftItems)
            .values(
              built.map((a) => ({
                draftId,
                canId: a.canId!,
                officerId: a.officerId!,
                backupOfficerId: a.backupOfficerId ?? null,
              })),
            )
            .onConflictDoNothing({
              target: [schema.periodDraftItems.draftId, schema.periodDraftItems.canId],
            })
            .returning({ id: schema.periodDraftItems.id });
          added = inserted.length;
        }
      }
      const totalItems = present.length + added;
      return {
        branchId: branch.id,
        draftId,
        draftStatus: 'DRAFT' as const,
        addedItems: added,
        totalItems,
        directAssignments: 0,
      };
    });
    drafts.push(result);
  }

  try {
    await insertActivityLog({
      userId: null,
      officerId: null,
      actionType: 'DRAFT_PREPARED',
      entityType: 'period',
      entityId: null,
      oldData: null,
      newData: {
        period: periodKey(year, month),
        calendar_row_written: calendarRowWritten,
        drafts: drafts.map((d) => ({
          branch_id: d.branchId,
          status: d.draftStatus,
          added_items: d.addedItems,
          direct_assignments: d.directAssignments,
        })),
      },
      ipAddress: 'scheduler-robot',
      userAgent: null,
    });
  } catch {
    // Audit tidak boleh menggagalkan prepare.
  }

  return { period: periodKey(year, month), periodYear: year, periodMonth: month, calendarRowWritten, drafts };
}

// ---------------------------------------------------------------------------
// Staf: lihat + edit + setujui.
// ---------------------------------------------------------------------------

export interface DraftListItem {
  id: string;
  period: string;
  periodYear: number;
  periodMonth: number;
  branchId: string;
  branchName: string;
  branchKind: 'RANTING' | 'PROGRAM_MWC';
  status: 'DRAFT' | 'APPROVED';
  preparedAt: Date;
  itemCount: number;
  /** PENDING = menunggu Staf; ESCALATED = lewat 24 jam, giliran Keuangan. */
  eventKind: 'APPROVED' | 'ESCALATED' | 'PENDING';
  periodStatus: 'OPEN' | 'TOLERANCE' | 'LOCKED' | 'DIBUKA_SEBAGIAN';
}

export async function listDrafts(
  actor: DraftActor,
  filter: { year?: number; month?: number } = {},
  now: Date = new Date(),
): Promise<DraftListItem[]> {
  const scope = await getRoleScope(
    {
      userId: actor.userId,
      role: actor.role,
      branchId: actor.branchId ?? undefined,
      districtId: actor.districtId ?? undefined,
    } as JWTPayload,
    schema.periodDrafts,
  );
  const rows = await db.query.periodDrafts.findMany({
    where: and(
      scope,
      filter.year !== undefined ? eq(schema.periodDrafts.periodYear, filter.year) : undefined,
      filter.month !== undefined ? eq(schema.periodDrafts.periodMonth, filter.month) : undefined,
    ),
    with: { branch: { columns: { id: true, name: true, kind: true } } },
    orderBy: (drafts, { desc }) => [desc(drafts.periodYear), desc(drafts.periodMonth)],
  });

  return Promise.all(
    rows.map(async (d) => {
      const b = buildPeriodBoundaries(d.periodYear, d.periodMonth);
      const [{ n: itemCount }] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.periodDraftItems)
        .where(eq(schema.periodDraftItems.draftId, d.id));
      return {
        id: d.id,
        period: periodKey(d.periodYear, d.periodMonth),
        periodYear: d.periodYear,
        periodMonth: d.periodMonth,
        branchId: d.branchId,
        branchName: d.branch?.name ?? '',
        branchKind: (d.branch?.kind ?? 'RANTING') as 'RANTING' | 'PROGRAM_MWC',
        status: d.status,
        preparedAt: d.preparedAt,
        itemCount,
        eventKind: approvalEventKind({ status: d.status, preparedAt: d.preparedAt }, now),
        // Status waktu murni dari jam (DIBUKA_SEBAGIAN ditulis logika reopen T7).
        periodStatus: resolvePeriodStatus(now, b),
      };
    }),
  );
}

export interface DraftDetailItem {
  id: string;
  canId: string;
  qrCode: string | null;
  ownerName: string;
  officerId: string;
  officerName: string;
}

export async function getDraftDetail(actor: DraftActor, draftId: string) {
  const { draft, branchKind } = await loadDraftWithBranch(draftId);
  assertDraftAccess(actor, { branchId: draft.branchId, districtId: draft.districtId, branchKind });
  const items = await db.query.periodDraftItems.findMany({
    where: eq(schema.periodDraftItems.draftId, draft.id),
    with: {
      can: { columns: { id: true, qrCode: true, ownerName: true } },
      officer: { columns: { id: true, fullName: true } },
    },
  });
  const detailItems: DraftDetailItem[] = items.map((it) => ({
    id: it.id,
    canId: it.canId,
    qrCode: it.can?.qrCode ?? null,
    ownerName: it.can?.ownerName ?? '',
    officerId: it.officerId,
    officerName: it.officer?.fullName ?? '',
  }));
  return {
    id: draft.id,
    period: periodKey(draft.periodYear, draft.periodMonth),
    periodYear: draft.periodYear,
    periodMonth: draft.periodMonth,
    branchId: draft.branchId,
    status: draft.status,
    preparedAt: draft.preparedAt,
    approvedAt: draft.approvedAt,
    approvedByRole: draft.approvedByRole,
    items: detailItems,
  };
}

async function loadItemWithDraft(itemId: string) {
  const item = await db.query.periodDraftItems.findFirst({
    where: eq(schema.periodDraftItems.id, itemId),
    with: { draft: { with: { branch: { columns: { id: true, districtId: true, kind: true } } } } },
  });
  if (!item || !item.draft || !item.draft.branch) throw Errors.VALIDATION_ERROR('Item draft tidak ditemukan');
  return {
    item,
    draft: item.draft,
    branchKind: item.draft.branch.kind as 'RANTING' | 'PROGRAM_MWC',
  };
}

/** Edit draft (§14.12) — hanya Staf Pengumpulan scope-nya, selama masih DRAFT. */
export async function updateDraftItem(
  actor: DraftActor,
  itemId: string,
  patch: { officerId: string },
) {
  const { item, draft, branchKind } = await loadItemWithDraft(itemId);
  assertDraftAccess(actor, { branchId: draft.branchId, districtId: draft.districtId, branchKind });
  if (actor.role !== 'STAF_PENGUMPULAN') {
    throw Errors.FORBIDDEN('Hanya Staf Bid. Pengumpulan yang boleh mengedit draft');
  }
  if (draft.status !== 'DRAFT') {
    throw Errors.VALIDATION_ERROR('Draft sudah disetujui — tidak bisa diedit');
  }
  const officer = await db.query.officers.findFirst({
    where: eq(schema.officers.id, patch.officerId),
    columns: { id: true, branchId: true, isActive: true },
  });
  if (!officer || !officer.isActive || officer.branchId !== draft.branchId) {
    throw Errors.VALIDATION_ERROR('Petugas pengganti harus aktif dan satu ranting/program dengan draft');
  }
  const oldOfficerId = item.officerId;
  await db
    .update(schema.periodDraftItems)
    .set({ officerId: patch.officerId })
    .where(eq(schema.periodDraftItems.id, item.id));
  try {
    await insertActivityLog({
      userId: actor.userId,
      officerId: null,
      actionType: 'DRAFT_ITEM_EDITED',
      entityType: 'period_draft_item',
      entityId: item.id,
      oldData: { officer_id: oldOfficerId },
      newData: { officer_id: patch.officerId, draft_id: draft.id },
      ipAddress: 'admin-draft',
      userAgent: null,
    });
  } catch {
    // Audit tidak boleh menggagalkan edit yang sah.
  }
  return { id: item.id, draftId: draft.id, officerId: patch.officerId };
}

export async function deleteDraftItem(actor: DraftActor, itemId: string) {
  const { item, draft, branchKind } = await loadItemWithDraft(itemId);
  assertDraftAccess(actor, { branchId: draft.branchId, districtId: draft.districtId, branchKind });
  if (actor.role !== 'STAF_PENGUMPULAN') {
    throw Errors.FORBIDDEN('Hanya Staf Bid. Pengumpulan yang boleh mengedit draft');
  }
  if (draft.status !== 'DRAFT') {
    throw Errors.VALIDATION_ERROR('Draft sudah disetujui — tidak bisa diedit');
  }
  await db.delete(schema.periodDraftItems).where(eq(schema.periodDraftItems.id, item.id));
  try {
    await insertActivityLog({
      userId: actor.userId,
      officerId: null,
      actionType: 'DRAFT_ITEM_DELETED',
      entityType: 'period_draft_item',
      entityId: item.id,
      oldData: { draft_id: draft.id, can_id: item.canId, officer_id: item.officerId },
      newData: null,
      ipAddress: 'admin-draft',
      userAgent: null,
    });
  } catch {
    // Audit tidak boleh menggagalkan edit yang sah.
  }
  return { id: item.id, draftId: draft.id };
}

export interface ApproveResult {
  draftId: string;
  period: string;
  itemCount: number;
  createdAssignments: number;
  approvedByRole: string;
  /** True bila yang menyetujui adalah Keuangan via eskalasi 24 jam. */
  escalated: boolean;
}

/**
 * Setujui draft → tugas aktif dalam 1 transaksi (§14.12).
 * - Tombol mati sekali: WHERE status='DRAFT' + cek baris terpengaruh (aman
 *   dari klik ganda / cron ganda / dua admin barengan).
 * - Keuangan hanya bila sudah eskalasi (24 jam). Telat = tugas telat lahir.
 * - Draft periode masa depan / sudah dikunci → ditolak (tugas mati).
 */
export async function approveDraft(
  actor: DraftActor,
  draftId: string,
  now: Date = new Date(),
): Promise<ApproveResult> {
  const summary = await db.transaction(async (tx) => {
    const draft = await tx.query.periodDrafts.findFirst({
      where: eq(schema.periodDrafts.id, draftId),
      with: { branch: { columns: { id: true, districtId: true, kind: true } } },
    });
    if (!draft || !draft.branch) throw Errors.DRAFT_NOT_FOUND();
    const branchKind = draft.branch.kind as 'RANTING' | 'PROGRAM_MWC';
    assertDraftAccess(actor, { branchId: draft.branchId, districtId: draft.districtId, branchKind });

    if (draft.status !== 'DRAFT') {
      throw Errors.VALIDATION_ERROR(
        `Draft periode ${periodKey(draft.periodYear, draft.periodMonth)} sudah disetujui — tidak bisa disetujui dua kali.`,
      );
    }

    const escalated = actor.role === 'STAF_KEUANGAN';
    if (escalated && !isEscalated(draft.preparedAt, now)) {
      throw Errors.FORBIDDEN('Eskalasi berlaku 24 jam setelah draft disiapkan — menunggu Staf Pengumpulan dulu');
    }

    // Guard masa depan (syarat review-T2 butir a): approve hanya untuk periode
    // yang bulannya sudah berjalan. Menyetujui draft Okt pada 10–31 Okt sah
    // (jemput awal §6); menyetujui Nov pada Okt ditolak.
    const nowY = now.getFullYear();
    const nowM = now.getMonth() + 1;
    if (draft.periodYear > nowY || (draft.periodYear === nowY && draft.periodMonth > nowM)) {
      throw Errors.VALIDATION_ERROR(
        `Draft periode ${periodKey(draft.periodYear, draft.periodMonth)} belum berjalan — tidak bisa disetujui duluan.`,
      );
    }

    // Guard kunci: menyetujui draft periode terkunci hanya melahirkan tugas mati.
    const b = buildPeriodBoundaries(draft.periodYear, draft.periodMonth);
    if (isPeriodLocked(now, b.toleranceEnd)) {
      const period = periodKey(draft.periodYear, draft.periodMonth);
      throw Errors.QR_PERIOD_CLOSED(
        `Periode ${period} sudah dikunci — draft tidak bisa disetujui. Siapkan untuk periode berjalan.`,
        { period },
      );
    }

    const items = await tx.query.periodDraftItems.findMany({
      where: eq(schema.periodDraftItems.draftId, draft.id),
    });

    let created = 0;
    if (items.length > 0) {
      const inserted = await tx
        .insert(schema.assignments)
        .values(
          items.map((it) => ({
            canId: it.canId,
            officerId: it.officerId,
            backupOfficerId: it.backupOfficerId ?? null,
            periodYear: draft.periodYear,
            periodMonth: draft.periodMonth,
            status: 'ACTIVE' as const,
            assignedAt: now,
          })),
        )
        .onConflictDoNothing({
          target: [
            schema.assignments.canId,
            schema.assignments.officerId,
            schema.assignments.periodYear,
            schema.assignments.periodMonth,
          ],
        })
        .returning({ id: schema.assignments.id });
      created = inserted.length;
    }

    const updated = await tx
      .update(schema.periodDrafts)
      .set({
        status: 'APPROVED',
        approvedAt: now,
        approvedBy: actor.userId,
        approvedByRole: actor.role,
        updatedAt: now,
      })
      .where(and(eq(schema.periodDrafts.id, draft.id), eq(schema.periodDrafts.status, 'DRAFT')))
      .returning({ id: schema.periodDrafts.id });
    if (updated.length === 0) {
      // Balapan approve ganda: pemenang lain sudah mengunci duluan.
      throw Errors.VALIDATION_ERROR('Draft baru saja disetujui pihak lain — tidak bisa disetujui dua kali.');
    }

    return { created, itemCount: items.length };
  });

  try {
    await insertActivityLog({
      userId: actor.userId,
      officerId: null,
      actionType: 'DRAFT_APPROVED',
      entityType: 'period_draft',
      entityId: draftId,
      oldData: null,
      newData: {
        approved_by_role: actor.role,
        escalated: actor.role === 'STAF_KEUANGAN',
        created_assignments: summary.created,
        item_count: summary.itemCount,
      },
      ipAddress: 'admin-draft',
      userAgent: null,
    });
  } catch {
    // Audit tidak boleh menggagalkan approve yang sah.
  }

  const draft = await db.query.periodDrafts.findFirst({
    where: eq(schema.periodDrafts.id, draftId),
    columns: { periodYear: true, periodMonth: true },
  });
  return {
    draftId,
    period: periodKey(draft!.periodYear, draft!.periodMonth),
    itemCount: summary.itemCount,
    createdAssignments: summary.created,
    approvedByRole: actor.role,
    escalated: actor.role === 'STAF_KEUANGAN',
  };
}

// ---------------------------------------------------------------------------
// Persiapan T11 (tanpa efek samping): siapa yang perlu diberi tahu.
// ---------------------------------------------------------------------------

export interface ApprovalRecipient {
  userId: string;
  role: string;
  phone: string;
  fcmToken: string | null;
}

/**
 * Kumpulkan penerima notifikasi approve untuk satu draft: Staf Pengumpulan +
 * Keuangan pada scope yang sama (ranting = branchId; program MWC = staf
 * distrik tanpa branchId). T11 yang mengirim (push → WA fallback); T3 hanya
 * menyiapkan daftar.
 */
export async function collectApprovalRecipients(draftId: string): Promise<ApprovalRecipient[]> {
  const { draft } = await loadDraftWithBranch(draftId);
  const users = await db.query.users.findMany({
    where: and(
      inArray(schema.users.role, ['STAF_PENGUMPULAN', 'STAF_KEUANGAN']),
      eq(schema.users.isActive, true),
    ),
    columns: { id: true, role: true, phone: true, fcmToken: true, branchId: true, districtId: true },
  });
  return users
    .filter(
      (u) =>
        (u.branchId !== null && u.branchId === draft.branchId) ||
        (u.branchId === null && u.districtId !== null && u.districtId === draft.districtId),
    )
    .map((u) => ({
      userId: u.id,
      role: u.role,
      phone: u.phone,
      fcmToken: u.fcmToken,
    }));
}
