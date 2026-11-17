# Clearer Kelola Kaleng Dukuh Counts

Written against: `staging` (working tree was clean when inspected)

## Evidence chain

- Surface: `apps/web/src/app/dashboard/cans/page.tsx` → `RegionCards` with `page="cans"` → `/admin/cans/region-cards` → `apps/backend/src/services/regionCardService.ts`.
- Problem: the Kelola Kaleng card mixes all registered cans with PICKUP assignment rows. It shows `total` as an unlabeled headline, `assigned / total` as a progress value, then `assignmentTotal` and `total - assignmentTotal` as “penugasan” and “belum”. The latter difference includes cans that cannot receive pickup tasks. Returned cans are available in `breakdown` but are not displayed.
- Evidence: `RegionCards.tsx:220-238, 291-312`; `regionCardService.ts:190-234, 409-432`.
- Design evidence: existing service contract provides `assignableCans`, `assignedAssignableCans`, `unassignedAssignableCans`, `nonAssignableCans`, and status `breakdown`; assignments page already uses eligible-can coverage. The repository's operational rule only assigns pickup work to assignable cans.
- Owner: `apps/web/src/components/region/RegionCards.tsx`; response owner `apps/backend/src/services/regionCardService.ts`.
- Scope and affected surfaces: RegionCards on Kelola Kaleng (`page="cans"`) only. Preserve the existing Assignments-page numbers and behavior (`page="assignments"`).
- Uncertainty: live staging counts were not queried because the SSH connection timed out. The formulas are confirmed from source; the examples 18/12/6/4 are the values reported by the user.

## Design decision

On Kelola Kaleng, show task coverage across the two valid task populations: pickup-eligible cans and visitable NON_AKTIF cans. Count unique cans with period-matched PICKUP or VISIT assignments against those populations. Do not show the raw inventory total or the separate nonactive count; keep returned cans as their own status count.

## Reuse

- Reuse API fields `assignableCans`, `assignedAssignableCans`, and `breakdown.DIKEMBALIKAN` already returned by `regionCardService`.
- Add `visitableCans` and `assignedVisitableCans` to the API response; keep pickup coverage fields unchanged for the Assignments page.
- Reuse the eligible-can coverage pattern already used by the Assignments branch in `RegionCards.tsx`.
- Exemplar: `apps/web/src/components/region/RegionCards.tsx:220-238`.

## Changes

1. `apps/web/src/components/region/RegionCards.tsx`
   - Change: On `page="cans"`, remove the raw total headline and nonactive count; show combined unique-can coverage as `assigned PICKUP + assigned VISIT` over `pickup-eligible + visitable NON_AKTIF` cans. Guard a zero denominator.
   - Change: Remove the bottom **belum** and duplicate **penugasan** rows. Keep `Dikembalikan N` from `region.breakdown.DIKEMBALIKAN` when nonzero.
   - Preserve: `page="assignments"` headline, pickup-only coverage/counts, and officer list unchanged.
   - Verify: With the reported example, 12 pickup plus 4 visit cans show `16/16`; the raw total `18`, nonactive `4`, and “belum” residual are absent; returned count remains visible.

2. `apps/web/src/components/region/RegionCards.test.tsx`
   - Change: Test combined pickup/visit coverage, absence of the raw total/nonactive/“belum” labels, returned count, and zero-taskable behavior.
   - Preserve: test the Assignments variant to prevent this correction from changing its existing count semantics.

3. `apps/backend/src/services/regionCardService.ts`
   - Change: Return visit-eligible can count and unique visit-assigned can count, scoped to the selected period and region.
   - Preserve: `assignmentTotal` remains the number of PICKUP rows; pickup completion and uncollected status metrics remain pickup-only.

## Scope

- Inherit: Branch and dukuh variants used by the Kelola Kaleng page.
- Verify: Assignments page cards, especially `assignableCans` and Visit handling, remain unchanged.
- Exclude: Displaying raw inventory totals, a nonactive subtotal, or a separate task count by kind on Kelola Kaleng.

## Validation

- Product: Compare combined coverage against current pickup-eligible and visitable can states plus selected-period PICKUP/VISIT assignments; returned remains a can count, not a task count.
- Interface: Check cards at desktop and narrow mobile widths; ensure the labels remain legible and no duplicate “assigned” metric is shown on Kelola Kaleng.
- System: Verify backend response includes both visit coverage fields and `breakdown.DIKEMBALIKAN`; preserve independent page variants.
- Repository: Run the new web component tests and `pnpm --filter web typecheck`; run `git diff --check`.

## Stop conditions

- Stop if the returned count is absent from the API response or source data cannot distinguish returned cans; report the gap rather than synthesizing a value.
- Stop if changing the shared component alters the Assignments page semantics; use an explicit page-specific branch instead.

## Design documentation

- After acceptance and validation: none; the change clarifies existing metrics and uses existing response fields.
