/**
 * Tipe view overview (camelCase) — hasil normalisasi caseConverter atas
 * OverviewResponse backend yang berkawat snake_case. Kontrak kawat
 * (shared-types) TIDAK diubah; tipe ini hanya untuk konsumsi komponen web.
 */

export interface OverviewScopeView {
  type: 'branch' | 'district';
  districtId: string;
  branchId?: string;
  branchName?: string;
}

export interface OverviewPeriodView {
  year: number;
  month: number;
  months: number[];
  timezone: string;
  generatedAt: string;
}

export interface OverviewSummaryView {
  placementCoverage: number;
  activeCans: number;
  inactiveCans: number;
  damagedCans: number;
  lostCans: number;
  returnedThisMonth: number;
  returnedTotal: number;
  actionRequired: number;
  totalOfficers: number;
  collectionNominal: number;
  successfulCollections: number;
  reactivated: number;
  newCans: number;
  withdrawn: number;
  taskActive: number;
  taskClosed: number;
  taskCompleted: number;
  taskUncollected: number;
  taskTotal: number;
}

export interface OverviewConditionBreakdownItemView {
  condition: string;
  count: number;
}

export interface OverviewMonthlyTrendItemView {
  month: string;
  collected: number;
  empty: number;
  uncollected: number;
  taskClosed: number;
  taskTotal: number;
  nominal: number;
}

export interface OverviewBranchComparisonItemView {
  branchId: string;
  branchName: string;
  placementCoverage: number;
  lostCans: number;
  actionRequired: number;
  taskClosed: number;
  taskTotal: number;
  collectionNominal: number;
  collectionFilled: number;
}

export interface OverviewProductivityTotalsView {
  taskTotal: number;
  filled: number;
  empty: number;
  uncollected: number;
  active: number;
}

export interface OverviewResponseView {
  scope: OverviewScopeView;
  period: OverviewPeriodView;
  summary: OverviewSummaryView;
  conditionBreakdown: OverviewConditionBreakdownItemView[];
  monthlyTrend: OverviewMonthlyTrendItemView[];
  productivity: OverviewProductivityTotalsView;
  branchComparison?: OverviewBranchComparisonItemView[];
}
