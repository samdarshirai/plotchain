# Design: Associate Directory filter bar, KYC stat-tiles, and KYC pagination UI

**Date:** 2026-08-02
**Source:** `docs/follow-ups/2026-08-02-admin-usage-directory-filter-bar-and-kyc-pagination.md`
**Status:** Approved, pending write-up review

## Background

The `admin-usage-core-ops` design spec (`docs/superpowers/specs/2026-08-02-admin-usage-core-ops-design.md`,
section 6) required, for the admin screens shipped on `master`:

- Associate Directory: paginated table via the `editable-table` shared component, plus a filter bar.
- KYC Review Queue: `tab-bar` for status, `stat-tile` for queue counts, pagination.

The implementation plan's sample code for these two tasks was thinner than the spec, and that gap
passed through per-task review undetected. This design closes it. Scope, in priority order:

1. KYC queue pagination — functional gap; past page 1 of any status, entries are permanently
   unreachable through the UI.
2. Associate Directory filter bar — the backend already implements all five filters
   (`AdminAssociateFilters`); only the UI is missing.
3. KYC queue stat-tiles — queue counts per status, currently shown nowhere.
4. `editable-table` adoption on both screens (currently hand-rolled `<table>`s), with empty-state
   rows.

## Non-goals

- No changes to KYC decision semantics, associate suspend/reactivate/reset-password, or any
  existing endpoint's request/response shape beyond what's listed below.
- No new permission model — new endpoint reuses the access level of its sibling existing endpoint.

## 1. Backend

### New endpoint: KYC queue counts

`GET /api/admin/kyc/counts` — same access as the existing `GET /api/admin/kyc` (all admin-family
roles; no `@PreAuthorize` beyond what `KycReviewController` already has at the class/method level
for read access).

Response: `KycCountsResponse(long pending, long verified, long rejected)`.

`KycReviewService` gets a new method:

```java
public KycCountsResponse counts() {
    return new KycCountsResponse(
        associateRepository.countByRoleAndKycStatus(AssociateRole.ASSOCIATE, KycStatus.PENDING),
        associateRepository.countByRoleAndKycStatus(AssociateRole.ASSOCIATE, KycStatus.VERIFIED),
        associateRepository.countByRoleAndKycStatus(AssociateRole.ASSOCIATE, KycStatus.REJECTED)
    );
}
```

`AssociateRepository` gets a new derived-query method, following the existing `countByRoleNot`
precedent:

```java
long countByRoleAndKycStatus(AssociateRole role, KycStatus kycStatus);
```

Three queries rather than one grouped query — `KycStatus` only has three values, and this matches
the repository's existing style (no `GROUP BY` projections used elsewhere in this repo).

### Associate Directory filters

No backend change. `AdminAssociateService.list` / `AssociateRepository.searchDirectory` already
accept `search`, `rankId`, `kycStatus`, `status`, `joinedFrom`, `joinedTo`. `AssociateDirectoryService.list()`
(frontend) already forwards any key present in the `AdminAssociateFilters` object it's given as an
HTTP query param — only the component template and class need to grow.

### Rank filter options

No backend change. `GET /api/company/compensation` already returns `availableRanks: RankOptionDto[]`
(`{id, name}`) via `CompensationPlanService`. The Associate Directory component calls
`CompensationPlanService.getCurrent()` once on init and reads `.availableRanks` for the rank
dropdown.

## 2. `editable-table` extension (shared component)

`EditableTableComponent` (`frontend/src/app/shared/components/editable-table/`) is currently
edit-only: every row renders an `<input>`/`<select>` per cell plus an add-row button and a
per-row remove button. Neither admin screen is an editor — Associate Directory rows open a
side-panel on click; KYC queue rows show static data plus (on the PENDING tab) an approve/reject
action.

Two additive capabilities, both off by default so existing consumers (e.g. rank/compensation
config editors) are unaffected by this change:

- **`@Input() readOnly = false`.** When `true`:
  - The add-row button and the per-row remove-button column are not rendered.
  - Each cell renders its value as plain text (`{{ row[column.key] }}`) instead of an
    `<input>`/`<select>`; `onCellInput` is not wired up.
- **`@Output() rowClick = new EventEmitter<number>()`.** Emits the row index when a `<tr>` is
  clicked. Only meaningful when `readOnly` is `true` — non-readOnly consumers can leave it
  unbound with no behavior change.
- **New column type `'action'`.** For a column whose per-row content isn't `row[column.key]` but
  caller-supplied markup (KYC queue's approve/reject-with-reason). Consumers provide a
  `<ng-template #actionCell let-row let-i="index">` and reference it from the column definition
  (`{ key: 'actions', label: '...', type: 'action', template: actionCellRef }`); `EditableTableComponent`
  projects it with `*ngTemplateOutlet` instead of rendering an input/select. Columns with other
  types are unaffected.

Existing rank/compensation editors keep `readOnly` unset (`false`) and never set a column's
`type` to `'action'`, so this is a pure capability addition — no existing template or spec
changes required outside the new tests for these three additions.

## 3. Associate Directory

`AssociateDirectoryComponent` filter bar, alongside the existing free-text search input:

- **Rank** — `<select>`, options from `availableRanks` (fetched once on init) plus an "All" option.
- **KYC status** — `<select>`, options `PENDING` / `VERIFIED` / `REJECTED` plus "All".
- **Status** — `<select>`, options `ACTIVE` / `SUSPENDED` plus "All".
- **Joined from / Joined to** — two `<input type="date">`.

Each control's change handler updates the component's filter state and calls `loadPage(0)`,
same as the existing `onSearchInput`. "All" / empty maps to omitting that key from the
`AdminAssociateFilters` object passed to `AssociateDirectoryService.list()` (the service already
skips falsy values when building `HttpParams`).

The hand-rolled `<table>` is replaced with:

```html
<app-editable-table
  [readOnly]="true"
  [columns]="directoryColumns"
  [rows]="directoryRows"
  [emptyStateLabel]="'admin.associateDirectory.emptyState' | translate"
  (rowClick)="selectAssociate(page!.associates[$event].id)"
></app-editable-table>
```

`directoryRows` is `page.associates` mapped to `Record<string, string>` (userId, name, rankName,
kycStatus, status) — the associate `id` itself is not a rendered column; `rowClick` looks it up
from `page.associates[index]` by index, since editable-table's row model doesn't carry an opaque
id field. Empty state (`emptyStateLabel`) comes from editable-table's existing `emptyState`
template — new translate key `admin.associateDirectory.emptyState`.

## 4. KYC Review Queue

**Stat-tiles.** Three `StatTileComponent` instances above the `tab-bar`, labeled Pending/Verified/Rejected,
value bound to the new `/api/admin/kyc/counts` response. Loaded once on `ngOnInit` alongside the
first page load, and reloaded after every `approve`/`reject` (counts shift between PENDING and
VERIFIED/REJECTED on decision).

**Pagination.** Audit-log pattern (`audit-log.component.ts`) rather than Associate Directory's
bare Prev/Next: Prev/Next buttons plus a "Page X of Y" indicator, using the same
`pageIndicator: { page, totalPages }` translate-key shape as `settings.auditLog.pageIndicator`,
added under `admin.kycQueue`.

**Table.** Replaced with `<app-editable-table [readOnly]="true">`, same row-mapping approach as
Associate Directory (userId, name, joinedAt formatted via existing `date: 'medium'` pipe before
mapping into the row record, since editable-table cells render raw values). The PENDING tab's
`columns` array includes the `'action'` column (approve button, reject-reason `<input>` bound via
`[(ngModel)]="rejectReasons[...]"` same as today, reject button) via its `<ng-template>`; other
tabs' `columns` array omits it — mirrors today's `*ngIf="activeStatus === 'PENDING'"` conditional,
now expressed as which columns are passed in rather than an in-cell `*ngIf`. No `rowClick` binding
— KYC queue rows have no drill-down.

New translate key `admin.kycQueue.emptyState`, following the audit-log precedent
(`settings.auditLog.emptyState`).

## 5. Testing

- **Backend:** unit test for `AssociateRepository.countByRoleAndKycStatus` (or covered indirectly
  via `KycReviewServiceTest`), a `KycReviewServiceTest` case for `counts()`, and a
  `KycReviewControllerTest` case for `GET /api/admin/kyc/counts` (happy path + access-control,
  matching the existing test style in that spec file).
- **Frontend:** `editable-table.component.spec.ts` gains cases for `readOnly` (no add/remove
  affordances, plain-text cells), `rowClick` emission, and the `'action'` column type's template
  projection. `associate-directory.component.spec.ts` gains cases for each filter updating
  `AdminAssociateFilters` and resetting to page 0, plus the rank-options fetch.
  `kyc-queue.component.spec.ts` gains cases for stat-tile counts loading/reloading after a
  decision, pagination controls, and the action column appearing only on the PENDING tab.

## Open questions

None outstanding — scope and approach confirmed during brainstorming.
