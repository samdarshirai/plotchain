# Follow-up: Associate Directory filter bar, KYC stat-tiles, and KYC pagination UI

**Filed:** 2026-08-02
**Source:** Final whole-branch review of `docs/superpowers/plans/2026-08-02-admin-usage-core-ops.md` (Tasks 3 and 7), after all 7 tasks landed on `master`.
**Status:** Open

## What's missing

`docs/superpowers/specs/2026-08-02-admin-usage-core-ops-design.md` requires, but the shipped implementation plan's Task 3/7 sample code never included:

- **Associate Directory filter bar** (spec line 145: "paginated table (`editable-table` shared component), filter bar"). Shipped: a single free-text search box only. The backend already implements all five filters — `AdminAssociateFilters` (`frontend/src/app/admin/models/admin-associate-page.model.ts:11-17`) declares `rank`, `kycStatus`, `status`, `joinedFrom`, `joinedTo`, and `AdminAssociateService.list` (backend) accepts and applies all five — but `AssociateDirectoryComponent` never renders UI for any of them except free-text search. The plan's own Task 3 Interfaces section even promises `GET /api/company/compensation`'s `availableRanks` "reused for the rank filter dropdown," then never uses it.
- **KYC queue stat-tiles** (spec line 148: "`stat-tile` for queue counts"). Not implemented — no counts are shown anywhere on the KYC Review Queue screen.
- **KYC queue pagination UI** (spec line 159: "Pagination on directory and KYC queue from day one — no assumption about associate-count"). `KycQueueComponent` fetches `totalElements` from the backend but never renders a pager — with more than one page's worth of entries in a given status (default page size 20), everything past the first page is permanently unreachable through the UI. The Associate Directory screen does have prev/next pagination; the KYC queue does not.
- Neither screen uses the `editable-table` shared component named in the spec — both hand-roll a bare `<table>`. Neither has an empty-state row (the codebase's own precedent, `frontend/src/app/settings/audit-log/audit-log.component.ts:34-36`, does).

## Why this happened

The gap is between the design spec and the implementation plan, not between the plan and the code — Tasks 3 and 7's implementers built exactly what their briefs specified. The plan's sample component code was thinner than the spec it was supposed to satisfy, and that thinness passed through seven individually-scoped task reviews undetected; only the final whole-branch review (which read the spec directly) caught it.

## Suggested scope for the fix

1. **KYC pagination UI** — highest priority; this is a functional gap (data becomes unreachable), not just a missing nice-to-have. Add prev/next controls to `KycQueueComponent`, following the existing pattern in `AssociateDirectoryComponent`.
2. **Associate Directory filter bar** — wire up rank/kycStatus/status/joinedFrom/joinedTo controls against the `AdminAssociateFilters` interface that already exists; the backend needs no changes.
3. **KYC stat-tiles** — add a small counts row above the tab bar using the existing `StatTileComponent` (`frontend/src/app/shared/components/stat-tile/`), likely backed by a lightweight new backend aggregate or by summing the existing per-status page totals.
4. Consider `editable-table` adoption and empty-state rows for both screens while touching this code, though these are cosmetic/consistency items, not functional gaps.
