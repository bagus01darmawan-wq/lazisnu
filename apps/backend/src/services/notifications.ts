/**
 * C1-T11 — Notifikasi 7 event (§14.15): push dulu, gagal/tak-baca → WA.
 *
 * - Template murni (`buildNotifBody`) — unit-testable tanpa DB/IO.
 * - `dispatchNotif` tak pernah melempar: push best-effort per token,
 *   gagal/tanpa-token + punya HP → antre WA (`send-text`, retry 10x +
 *   backoff + DLQ di worker); audit 1 baris best-effort.
 * - Sapuan (eskalasi/H-3/mendekati-kunci) memakai dedup jendela-waktu via
 *   tabel notifications agar cron ganda tak spam; hook event-driven
 *   (FINAL/reopen/approve/...) tak perlu dedup (api sekali per aksi).
 */
import { db } from '../config/database';
import * as schema from '../database/schema';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { insertActivityLog } from './auditLogService';
import { sendFCMToDevice } from './fcm';
import { addStaffTextJob } from './queues';

// ---------------------------------------------------------------------------
// Template murni (7 event §14.15).
// ---------------------------------------------------------------------------

export type NotifTemplate =
  | 'TUGAS_DIGENERATE'
  | 'APPROVE_DIMINTA'
  | 'APPROVE_ESKALASI'
  | 'PENGINGAT_H3'
  | 'MENDEKATI_KUNCI'
  | 'PPK_FINAL'
  | 'REOPEN'
  | 'SELISIH_BESAR'
  | 'BA_SIAP';

export interface NotifText {
  title: string;
  body: string;
}

export function buildNotifBody(template: NotifTemplate, p: Record<string, string | number>): NotifText {
  const period = String(p.period ?? '');
  switch (template) {
    case 'TUGAS_DIGENERATE':
      return {
        title: 'Tugas penjemputan baru',
        body: `Daftar ${p.count} kaleng periode ${period} (${p.branch}) sudah terbit di aplikasi. Jemput s/d tgl 27.`,
      };
    case 'APPROVE_DIMINTA':
      return {
        title: 'Minta persetujuan draft',
        body: `Robot menyiapkan draft ${p.branch} periode ${period} (${p.count} kaleng). Setujui di aplikasi — diam 24 jam diteruskan ke Bendahara.`,
      };
    case 'APPROVE_ESKALASI':
      return {
        title: 'Eskalasi persetujuan',
        body: `Draft ${p.branch} periode ${period} belum disetujui >24 jam. Giliran Anda menyetujui agar tugas lahir tepat waktu.`,
      };
    case 'PENGINGAT_H3':
      return {
        title: 'Pengingat penjemputan',
        body: `${p.name}, tersisa ${p.left} tugas periode ${period} (H-3 batas jemput tgl 27). Segera selesaikan.`,
      };
    case 'MENDEKATI_KUNCI':
      return {
        title: 'Mendekati kunci periode',
        body: `${p.name}, tersisa ${p.left} tugas periode ${period}. Periode dikunci tgl 10 — lewat itu tercatat UNCOLLECTED.`,
      };
    case 'PPK_FINAL':
      return {
        title: 'Setoran PPK FINAL',
        body: `Setoran ${p.officer} periode ${period} sudah FINAL (${p.total}). Lanjut ke rekap ranting.`,
      };
    case 'REOPEN':
      return {
        title: 'Setoran dibuka kembali',
        body: `${p.what} periode ${period} di-reopen: ${p.reason}. Jendela koreksi 48 jam.`,
      };
    case 'SELISIH_BESAR':
      return {
        title: 'Selisih share besar',
        body: `Ranting ${p.branch} periode ${period}: selisih Rp ${p.variance} (alasan: ${p.reason}). Mohon periksa.`,
      };
    case 'BA_SIAP':
      return {
        title: 'Berita acara siap diunduh',
        body: `${p.what} periode ${period} sudah FINAL. Unduh BA di aplikasi.`,
      };
  }
}

// ---------------------------------------------------------------------------
// Resolusi penerima (user aktif saja).
// ---------------------------------------------------------------------------

export interface NotifRecipient {
  userId: string;
  phone: string | null;
  fcmToken: string | null;
  fullName: string;
}

const recipientCols = { id: true, phone: true, fcmToken: true, fullName: true } as const;

async function usersByIds(userIds: string[]): Promise<NotifRecipient[]> {
  if (userIds.length === 0) return [];
  const rows = await db.query.users.findMany({
    where: and(inArray(schema.users.id, userIds), eq(schema.users.isActive, true)),
    columns: recipientCols,
  });
  return rows.map((u) => ({ userId: u.id, phone: u.phone, fcmToken: u.fcmToken, fullName: u.fullName }));
}

async function usersByScope(params: {
  roles: string[];
  branchId?: string | null;
  districtId?: string | null;
  districtWide?: boolean;
}): Promise<NotifRecipient[]> {
  const rows = await db.query.users.findMany({
    where: and(inArray(schema.users.role, params.roles as never[]), eq(schema.users.isActive, true)),
    columns: { ...recipientCols, branchId: true, districtId: true },
  });
  return rows
    .filter((u) => {
      if (params.branchId && u.branchId === params.branchId) return true;
      if (params.districtWide && params.districtId && u.branchId === null && u.districtId === params.districtId) return true;
      return false;
    })
    .map((u) => ({ userId: u.id, phone: u.phone, fcmToken: u.fcmToken, fullName: u.fullName }));
}

/** Pemilik PPK (akun user di balik officer). */
export async function ppkOwner(officerId: string): Promise<NotifRecipient[]> {
  const off = await db.query.officers.findFirst({
    where: eq(schema.officers.id, officerId),
    columns: { userId: true },
  });
  if (!off) return [];
  return usersByIds([off.userId]);
}

/** Admin Ranting pemilik + Keuangan seranting. */
export async function rantingStaff(branchId: string): Promise<NotifRecipient[]> {
  return usersByScope({ roles: ['ADMIN_RANTING', 'STAF_KEUANGAN'], branchId });
}

/** Admin Ranting pemilik saja. */
export async function rantingAdmin(branchId: string): Promise<NotifRecipient[]> {
  return usersByScope({ roles: ['ADMIN_RANTING'], branchId });
}

/** Admin MWC (kecamatan) sedistrik. */
export async function mwcAdmins(districtId: string): Promise<NotifRecipient[]> {
  return usersByScope({ roles: ['ADMIN_KECAMATAN'], districtId, districtWide: true });
}

/** Keuangan MWC sedistrik. */
export async function mwcKeuangan(districtId: string): Promise<NotifRecipient[]> {
  return usersByScope({ roles: ['STAF_KEUANGAN'], districtId, districtWide: true });
}

// ---------------------------------------------------------------------------
// Dedup sapuan (tanpa migrasi — pakai tabel notifications yang ada).
// ---------------------------------------------------------------------------

/** True bila template+HP ini sudah tercatat ≤ windowHours terakhir. */
export async function recentlyNotified(
  template: string,
  phone: string,
  windowHours: number,
  now: Date = new Date(),
): Promise<boolean> {
  const since = new Date(now.getTime() - windowHours * 3_600_000);
  const rows = await db
    .select({ id: schema.notifications.id })
    .from(schema.notifications)
    .where(
      and(
        eq(schema.notifications.messageTemplate, template),
        eq(schema.notifications.recipientPhone, phone),
        gte(schema.notifications.createdAt, since),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Dispatcher: push → WA. Tak pernah melempar.
// ---------------------------------------------------------------------------

export interface DispatchInput {
  template: NotifTemplate;
  text: NotifText;
  recipients: NotifRecipient[];
  /** Kunci entitas untuk jobId WA (mis. draftId/submissionId). */
  entityId: string;
  /** UserId pencetus (untuk audit agar cleanup fixture T6–T8 menghapusnya). */
  actorUserId?: string | null;
}

export interface DispatchResult {
  push_ok: number;
  push_fail: number;
  wa_queued: number;
  skipped: number;
}

export async function dispatchNotif(input: DispatchInput, now: Date = new Date()): Promise<DispatchResult> {
  const res: DispatchResult = { push_ok: 0, push_fail: 0, wa_queued: 0, skipped: 0 };
  try {
    for (const r of input.recipients) {
      try {
        if (r.fcmToken) {
          const sent = await sendFCMToDevice({
            fcmToken: r.fcmToken,
            title: input.text.title,
            body: input.text.body,
            data: { template: input.template, entity: input.entityId },
          });
          if (sent.success) {
            res.push_ok += 1;
            await logNotifRow(input.template, r.phone, 'SENT', input.text.body, now).catch(() => {});
            continue;
          }
          res.push_fail += 1;
        }
        if (r.phone) {
          await addStaffTextJob({
            phone: r.phone,
            body: `${input.text.title}: ${input.text.body}`,
            template: input.template,
            entityId: input.entityId,
            userId: r.userId,
          });
          res.wa_queued += 1;
          await logNotifRow(input.template, r.phone, 'QUEUED', input.text.body, now).catch(() => {});
        } else {
          res.skipped += 1;
        }
      } catch {
        res.push_fail += 1;
      }
    }
  } catch {
    // Dispatcher tak pernah melempar (tugas tak boleh gagal gara-gara notif).
  }
  try {
    await insertActivityLog({
      userId: input.actorUserId ?? null,
      officerId: null,
      actionType: 'NOTIF_DISPATCHED',
      entityType: 'notification',
      entityId: null,
      oldData: null,
      newData: {
        template: input.template,
        entity_id: input.entityId,
        push_ok: res.push_ok,
        push_fail: res.push_fail,
        wa_queued: res.wa_queued,
        skipped: res.skipped,
      },
      ipAddress: 'notif-dispatch',
      userAgent: null,
    });
  } catch {
    // Audit tak boleh menggagalkan apa pun.
  }
  return res;
}

async function logNotifRow(template: string, phone: string | null, status: string, body: string, now: Date): Promise<void> {
  if (!phone) return;
  await db.insert(schema.notifications).values({
    collectionId: null,
    recipientPhone: phone,
    recipientName: null,
    messageTemplate: template,
    messageContent: body.slice(0, 500),
    status,
    sentAt: status === 'SENT' ? now : null,
    createdAt: now,
  });
}

/** Sapuan dedup: lewati penerima yang sudah tercatat ≤ windowHours. */
export async function filterFresh(
  template: string,
  recipients: NotifRecipient[],
  windowHours: number,
  now: Date = new Date(),
): Promise<NotifRecipient[]> {
  const out: NotifRecipient[] = [];
  for (const r of recipients) {
    if (!r.phone) {
      out.push(r);
      continue;
    }
    try {
      if (await recentlyNotified(template, r.phone, windowHours, now)) continue;
    } catch {
      // Gagal cek dedup = kirim saja (spam 1x lebih baik dari hilang).
    }
    out.push(r);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Hook siap-panggil per event (1 baris di service induk, best-effort).
// Semua mengembalikan null bila resolusi penerima gagal total — pemanggil
// tak perlu try/catch (dispatch sendiri juga tak pernah melempar).
// ---------------------------------------------------------------------------

async function branchOf(branchId: string): Promise<{ name: string; districtId: string } | null> {
  try {
    const b = await db.query.branches.findFirst({
      where: eq(schema.branches.id, branchId),
      columns: { name: true, districtId: true },
    });
    return b ? { name: b.name, districtId: b.districtId } : null;
  } catch {
    return null;
  }
}

async function officerOf(officerId: string): Promise<{ fullName: string; branchId: string } | null> {
  try {
    const o = await db.query.officers.findFirst({
      where: eq(schema.officers.id, officerId),
      columns: { fullName: true, branchId: true },
    });
    return o ? { fullName: o.fullName, branchId: o.branchId } : null;
  } catch {
    return null;
  }
}

/** (1) Tugas lahir saat approve → PPK + Staf scope. */
export async function notifyTugasDigenerate(
  draftId: string,
  actorUserId?: string | null,
): Promise<DispatchResult | null> {
  try {
    const { collectApprovalRecipients } = await import('./periodDrafts.js');
    const draft = await db.query.periodDrafts.findFirst({
      where: eq(schema.periodDrafts.id, draftId),
      columns: { periodYear: true, periodMonth: true, branchId: true },
    });
    if (!draft) return null;
    const b = await branchOf(draft.branchId);
    const period = periodKeyOf(draft.periodYear, draft.periodMonth);
    const items = await db.query.periodDraftItems.findMany({
      where: eq(schema.periodDraftItems.draftId, draftId),
      columns: { officerId: true },
    });
    const officerIds = [...new Set(items.map((i) => i.officerId))];
    const ppks: NotifRecipient[] = [];
    for (const oid of officerIds) ppks.push(...(await ppkOwner(oid)));
    const staf = await collectApprovalRecipients(draftId);
    const recipients = [...ppks, ...staf.map((s) => ({ userId: s.userId, phone: s.phone, fcmToken: s.fcmToken, fullName: '' }))];
    if (recipients.length === 0) return null;
    return dispatchNotif({
      template: 'TUGAS_DIGENERATE',
      text: buildNotifBody('TUGAS_DIGENERATE', { count: officerIds.length, period, branch: b?.name ?? '' }),
      recipients,
      entityId: draftId,
      actorUserId,
    });
  } catch {
    return null;
  }
}

/** (2a) Robot menyiapkan draft → Staf scope (dedup 20 jam, cron aman). */
export async function notifyApproveDiminta(draftIds: string[], now: Date = new Date()): Promise<DispatchResult | null> {
  try {
    const { collectApprovalRecipients } = await import('./periodDrafts.js');
    let agg: DispatchResult = { push_ok: 0, push_fail: 0, wa_queued: 0, skipped: 0 };
    let any = false;
    for (const draftId of draftIds) {
      const draft = await db.query.periodDrafts.findFirst({
        where: eq(schema.periodDrafts.id, draftId),
        columns: { periodYear: true, periodMonth: true, branchId: true, status: true },
      });
      if (!draft || draft.status !== 'DRAFT') continue;
      const b = await branchOf(draft.branchId);
      const items = await db.query.periodDraftItems.findMany({
        where: eq(schema.periodDraftItems.draftId, draftId),
        columns: { id: true },
      });
      const staf = await collectApprovalRecipients(draftId);
      const fresh = await filterFresh(
        'APPROVE_DIMINTA',
        staf.map((s) => ({ userId: s.userId, phone: s.phone, fcmToken: s.fcmToken, fullName: '' })),
        20,
        now,
      );
      if (fresh.length === 0) continue;
      any = true;
      const r = await dispatchNotif({
        template: 'APPROVE_DIMINTA',
        text: buildNotifBody('APPROVE_DIMINTA', {
          branch: b?.name ?? '',
          period: periodKeyOf(draft.periodYear, draft.periodMonth),
          count: items.length,
        }),
        recipients: fresh,
        entityId: draftId,
      });
      agg = {
        push_ok: agg.push_ok + r.push_ok,
        push_fail: agg.push_fail + r.push_fail,
        wa_queued: agg.wa_queued + r.wa_queued,
        skipped: agg.skipped + r.skipped,
      };
    }
    return any ? agg : null;
  } catch {
    return null;
  }
}

/** (4+7 PPK) FINAL PPK → Admin Ranting + BA siap untuk PPK. */
export async function notifyPpkFinal(
  officerId: string,
  branchId: string,
  period: string,
  total: number,
  actorUserId?: string | null,
): Promise<DispatchResult | null> {
  try {
    const o = await officerOf(officerId);
    const admins = await rantingAdmin(branchId);
    const owners = await ppkOwner(officerId);
    const r1 = admins.length > 0
      ? await dispatchNotif({
        template: 'PPK_FINAL',
        text: buildNotifBody('PPK_FINAL', { officer: o?.fullName ?? '', period, total }),
        recipients: admins,
        entityId: `${officerId}-${period}`,
        actorUserId,
      })
      : null;
    const r2 = owners.length > 0
      ? await dispatchNotif({
        template: 'BA_SIAP',
        text: buildNotifBody('BA_SIAP', { what: `Setoran ${o?.fullName ?? ''}`, period }),
        recipients: owners,
        entityId: `${officerId}-${period}`,
        actorUserId,
      })
      : null;
    if (!r1 && !r2) return null;
    const a = r1 ?? { push_ok: 0, push_fail: 0, wa_queued: 0, skipped: 0 };
    const b2 = r2 ?? { push_ok: 0, push_fail: 0, wa_queued: 0, skipped: 0 };
    return {
      push_ok: a.push_ok + b2.push_ok,
      push_fail: a.push_fail + b2.push_fail,
      wa_queued: a.wa_queued + b2.wa_queued,
      skipped: a.skipped + b2.skipped,
    };
  } catch {
    return null;
  }
}

/** (5) Reopen → PPK + Admin Ranting (+ MWC bila tingkat ranting). */
export async function notifyReopen(
  kind: 'ppk' | 'branch',
  officerId: string | null,
  branchId: string,
  districtId: string,
  period: string,
  reason: string,
  actorUserId?: string | null,
): Promise<DispatchResult | null> {
  try {
    const b = await branchOf(branchId);
    const o = officerId ? await officerOf(officerId) : null;
    const label = kind === 'ppk' ? `Setoran ${o?.fullName ?? ''}` : `Rekap ${b?.name ?? ''}`;
    const recips = [...(await rantingAdmin(branchId))];
    if (officerId) recips.push(...(await ppkOwner(officerId)));
    if (kind === 'branch') recips.push(...(await mwcAdmins(districtId)));
    const seen = new Set<string>();
    const recipients = recips.filter((r) => (seen.has(r.userId) ? false : (seen.add(r.userId), true)));
    if (recipients.length === 0) return null;
    return dispatchNotif({
      template: 'REOPEN',
      text: buildNotifBody('REOPEN', { what: label, period, reason }),
      recipients,
      entityId: `${branchId}-${period}`,
      actorUserId,
    });
  } catch {
    return null;
  }
}

/** (6) Selisih besar → Admin Ranting + MWC. Diam bila dalam toleransi. */
export async function notifySelisih(
  branchId: string,
  period: string,
  variance: number,
  reason: string,
  actorUserId?: string | null,
): Promise<DispatchResult | null> {
  try {
    const { needsVarianceReason } = await import('../utils/c1Math.js');
    if (!needsVarianceReason(variance)) return null;
    const b = await branchOf(branchId);
    if (!b) return null;
    const recipients = [...(await rantingAdmin(branchId)), ...(await mwcAdmins(b.districtId))];
    if (recipients.length === 0) return null;
    return dispatchNotif({
      template: 'SELISIH_BESAR',
      text: buildNotifBody('SELISIH_BESAR', { branch: b.name, period, variance, reason }),
      recipients,
      entityId: `${branchId}-${period}`,
      actorUserId,
    });
  } catch {
    return null;
  }
}

/** (7 ranting) Branch FINAL → Admin Ranting (BA siap unduh). */
export async function notifyBaSiapBranch(
  branchId: string,
  period: string,
  actorUserId?: string | null,
): Promise<DispatchResult | null> {
  try {
    const b = await branchOf(branchId);
    const recipients = await rantingAdmin(branchId);
    if (recipients.length === 0) return null;
    return dispatchNotif({
      template: 'BA_SIAP',
      text: buildNotifBody('BA_SIAP', { what: `Rekap ${b?.name ?? ''}`, period }),
      recipients,
      entityId: `${branchId}-${period}`,
      actorUserId,
    });
  } catch {
    return null;
  }
}

function periodKeyOf(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Sapuan scheduler (dipanggil endpoint internal, wiring cron = T12):
// eskalasi approve + pengingat H-3 + mendekati kunci. Semua dedup 20 jam.
// ---------------------------------------------------------------------------

export interface SweepResult {
  period: string;
  escalated: number;
  h3: number;
  near_lock: number;
}

export async function sweepNotifs(
  year: number,
  month: number,
  now: Date = new Date(),
): Promise<SweepResult> {
  const res: SweepResult = { period: periodKeyOf(year, month), escalated: 0, h3: 0, near_lock: 0 };
  try {
    const { buildPeriodBoundaries } = await import('./periodCalendar.js');
    const { isEscalated } = await import('./periodDrafts.js');
    const b = buildPeriodBoundaries(year, month);
    const t = now.getTime();

    // (2b) Eskalasi: draft DRAFT + >24 jam → Keuangan scope.
    const { collectApprovalRecipients } = await import('./periodDrafts.js');
    const drafts = await db.query.periodDrafts.findMany({
      where: and(
        eq(schema.periodDrafts.periodYear, year),
        eq(schema.periodDrafts.periodMonth, month),
        eq(schema.periodDrafts.status, 'DRAFT'),
      ),
      columns: { id: true, branchId: true, preparedAt: true, periodYear: true, periodMonth: true },
    });
    for (const d of drafts) {
      if (!isEscalated(d.preparedAt, now)) continue;
      const br = await branchOf(d.branchId);
      const all = await collectApprovalRecipients(d.id);
      const keu = all.filter((u) => u.role === 'STAF_KEUANGAN');
      const fresh = await filterFresh(
        'APPROVE_ESKALASI',
        keu.map((u) => ({ userId: u.userId, phone: u.phone, fcmToken: u.fcmToken, fullName: '' })),
        20,
        now,
      );
      if (fresh.length === 0) continue;
      await dispatchNotif(
        {
          template: 'APPROVE_ESKALASI',
          text: buildNotifBody('APPROVE_ESKALASI', { branch: br?.name ?? '', period: res.period }),
          recipients: fresh,
          entityId: d.id,
        },
        now,
      );
      res.escalated += fresh.length;
    }

    // (3) H-3: now ∈ [due-3d, due] + ACTIVE>0 → PPK. Mendekati kunci:
    // now ∈ [toleranceEnd-2d, toleranceEnd] + ACTIVE>0 → PPK.
    const inH3 = t >= b.dueDate.getTime() - 3 * 86_400_000 && t <= b.dueDate.getTime();
    const inNearLock = t >= b.toleranceEnd.getTime() - 2 * 86_400_000 && t <= b.toleranceEnd.getTime();
    if (inH3 || inNearLock) {
      const actives = await db
        .select({
          officerId: schema.assignments.officerId,
          year: schema.assignments.periodYear,
          month: schema.assignments.periodMonth,
        })
        .from(schema.assignments)
        .where(
          and(
            eq(schema.assignments.periodYear, year),
            eq(schema.assignments.periodMonth, month),
            eq(schema.assignments.status, 'ACTIVE'),
          ),
        );
      const byOfficer = new Map<string, number>();
      for (const a of actives) byOfficer.set(a.officerId, (byOfficer.get(a.officerId) ?? 0) + 1);
      for (const [officerId, left] of byOfficer) {
        const owners = await ppkOwner(officerId);
        if (owners.length === 0) continue;
        const o = await officerOf(officerId);
        if (inH3) {
          const fresh = await filterFresh('PENGINGAT_H3', owners, 20, now);
          if (fresh.length > 0) {
            await dispatchNotif(
              {
                template: 'PENGINGAT_H3',
                text: buildNotifBody('PENGINGAT_H3', { name: o?.fullName ?? '', left, period: res.period }),
                recipients: fresh,
                entityId: `${officerId}-${res.period}`,
              },
              now,
            );
            res.h3 += fresh.length;
          }
        }
        if (inNearLock) {
          const fresh = await filterFresh('MENDEKATI_KUNCI', owners, 20, now);
          if (fresh.length > 0) {
            await dispatchNotif(
              {
                template: 'MENDEKATI_KUNCI',
                text: buildNotifBody('MENDEKATI_KUNCI', { name: o?.fullName ?? '', left, period: res.period }),
                recipients: fresh,
                entityId: `${officerId}-${res.period}`,
              },
              now,
            );
            res.near_lock += fresh.length;
          }
        }
      }
    }
  } catch {
    // Sapuan tak pernah melempar (cron mencatat hasil parsial).
  }
  return res;
}


