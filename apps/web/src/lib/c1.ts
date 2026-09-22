import api from './api';

/**
 * C1-T10 — Klien kontrak siklus periode untuk dashboard web.
 * Envelope backend: `{ success, data?, error? }` (axios instance
 * meng-unwrap `response.data`). Penjaga peran tetap di server.
 */

export interface C1Envelope<T> {
  success: boolean;
  data?: T;
  error?: { code?: string; message?: string };
}

export interface PeriodDraftItem {
  id: string;
  period: string;
  branch_id: string;
  branch_name: string;
  branch_kind: 'RANTING' | 'PROGRAM_MWC';
  status: 'DRAFT' | 'APPROVED';
  prepared_at: string;
  item_count: number;
  event_kind: 'APPROVED' | 'ESCALATED' | 'PENDING';
  period_status: string;
}

export interface StafSummary {
  period: string;
  period_status: string;
  days_to_due: number;
  days_to_lock: number;
  in_tolerance: boolean;
  drafts: { pending: number; escalated: number; approved: number };
  ppk: { final_count: number; total_count: number };
  tugas_active: number;
}

export interface PpkPenyusun {
  officer_name: string;
  total: number;
  status: string;
}

export interface BranchSubmissionDetail {
  id: string;
  branch_id: string;
  period: string;
  period_year: number;
  period_month: number;
  total_amount: number;
  bisyaroh_total: number;
  share_mwc: number;
  net_amount: number;
  expected_share: number;
  share_variance: number;
  variance_reason: string | null;
  linked_periods: string[] | null;
  collection_count: number;
  status: 'DRAFT' | 'FINAL' | 'FINAL_NOL';
  version: number;
  ranting_signer_id: string | null;
  mwc_bendahara_signer_id: string | null;
  ppk_penyusun?: PpkPenyusun[];
}

export interface MwcRecapRow {
  branch_id: string;
  branch_name: string;
  kind: 'RANTING' | 'PROGRAM_MWC';
  status: 'FINAL' | 'FINAL_NOL' | 'BELUM_LAPOR';
  total: number;
  bisyaroh: number;
  share_mwc: number;
  bersih: number;
  selisih_share: number;
  variance_reason: string | null;
  flags: string[];
}

export interface MwcRecap {
  period: string;
  kartu_ranting: {
    total: number;
    bisyaroh: number;
    ekspektasi_share: number;
    share_mwc: number;
    bersih: number;
    reported_count: number;
    final_nol_count: number;
    belum_lapor_count: number;
  };
  kartu_program: {
    total: number;
    bisyaroh: number;
    bersih: number;
    reported_count: number;
    belum_lapor_count: number;
  };
  rows: MwcRecapRow[];
}

export interface BaVersion {
  version: number;
  status: string;
  pdf_hash: string | null;
  content_hash: string;
  verify_url: string;
  archived_at: string | null;
  is_current: boolean;
}

function periodQuery(year?: number, month?: number): string {
  const q = new URLSearchParams();
  if (year !== undefined) q.append('year', String(year));
  if (month !== undefined) q.append('month', String(month));
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const c1Api = {
  // Staf Pengumpulan — monitor + setujui.
  getDrafts: (year?: number, month?: number) =>
    api.get<C1Envelope<PeriodDraftItem[]>>(`/admin/period-drafts${periodQuery(year, month)}`),
  approveDraft: (id: string) => api.post<C1Envelope<unknown>>(`/admin/period-drafts/${id}/approve`, {}),
  getStafSummary: (year?: number, month?: number) =>
    api.get<C1Envelope<StafSummary>>(`/mobile/staf/ringkasan${periodQuery(year, month)}`),

  // Ranting — kunci (sign + countersign MWC) + BA + unduh.
  getBranchSubmissions: (year?: number, month?: number) =>
    api.get<C1Envelope<BranchSubmissionDetail[]>>(`/admin/branch-submissions${periodQuery(year, month)}`),
  getBranchSubmission: (id: string) =>
    api.get<C1Envelope<BranchSubmissionDetail>>(`/admin/branch-submissions/${id}`),
  signBranch: (
    id: string,
    body: { signature_png: string; consent: boolean; expected_version?: number; share_mwc: number; variance_reason?: string; linked_periods?: string[]; as_nol?: boolean },
  ) => api.post<C1Envelope<BranchSubmissionDetail>>(`/admin/branch-submissions/${id}/sign`, body),

  // MWC — tarik rekap FINAL.
  getLaporanMwc: (year?: number, month?: number) =>
    api.get<C1Envelope<MwcRecap>>(`/admin/laporan-mwc${periodQuery(year, month)}`),

  // BA — teks + unduh (signed URL pendek) + riwayat versi.
  getBranchBeritaAcara: (id: string) =>
    api.get<C1Envelope<unknown>>(`/admin/branch-submissions/${id}/berita-acara`),
  getBranchPdfVersions: (id: string) =>
    api.get<C1Envelope<BaVersion[]>>(`/admin/branch-submissions/${id}/pdf-versions`),

  /**
   * Unduh BA via signed URL: ambil `{ download_url }` lalu picu unduhan
   * browser (tanpa menaruh key R2 di DOM).
   */
  downloadBranchPdf: async (id: string, filename: string): Promise<void> => {
    const res = await api.get<C1Envelope<{ download_url: string }>>(
      `/admin/branch-submissions/${id}/pdf`,
    );
    const url = res.data?.download_url;
    if (!res.success || !url) throw new Error(res.error?.message || 'Berkas BA belum siap');
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  },
};
