# Wallet/Withdrawal Unit 12 — Cycle Management "Credit Wallets" Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-row "Credit Wallets" action to the already-shipped Admin "Cycle Management" screen, visible only on `CLOSED` cycles, that calls unit 1's `POST /api/admin/cycles/{id}/credit-wallets` and, on success, updates the screen's status display to `PAID`.

**Architecture:** A targeted, three-file delta to the existing `CycleManagementComponent`/`CycleManagementService` pair (no new route, no new component, no new screen): one new frontend model mirroring unit 1's `WalletCreditingResult` response, one new service method, and one new per-row action button + two inline-banner states (success/error) wired into the component's existing history table and reload flow. Follows the exact conventions the screen's own Close Cycle action (Task 5 of the original plan) already established — direct submit, no confirmation modal, `HttpErrorResponse.status === 409` branch, reload-after-success so the table reflects new state.

**Tech Stack:** Angular 18.2 (standalone components), `@ngx-translate/core` for i18n, Karma/Jasmine (`ng test`) with `HttpClientTestingModule`/`HttpTestingController`.

**Spec:** `docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md`; unit detail: `docs/superpowers/plans/2026-08-04-wallet-withdrawal-units.md` section "### 12."; extends the already-merged `docs/superpowers/plans/2026-08-13-cycle-management-screen.md`.

## Global Constraints

- **Backend dependency risk — read before starting implementation.** This screen delta is planned against unit 1's *contract* only (`POST /api/admin/cycles/{id}/credit-wallets` → `WalletCreditingResult(cycleId, entriesCredited, totalAmountCredited, newCycleStatus)`, 409 if not `CLOSED`, 404 unknown id, ADMIN-only), because unit 1 was still being planned in a parallel, separate agent — not implemented — at plan-writing time. **Before Task 1's implementation step, open the actual merged `backend/src/main/java/com/plotchain/wallet/WalletCreditingResult.java` (and the new `credit-wallets` method on `backend/src/main/java/com/plotchain/cycle/CycleController.java`) and diff their field names/path/HTTP method against this plan's Task 1 model and Task 2 service call.** If anything differs (field renamed, path uses underscores instead of a hyphen, response wraps the fields differently), fix Task 1/2 before writing Task 3 — do not build the component against a contract you haven't reconciled with the real merged code. This is the same ordering-risk pattern already used successfully for income-ledger unit 3 against income-ledger unit 1 (`docs/superpowers/plans/2026-08-14-income-ledger-admin-register.md`'s Global Constraints); if any other wallet-withdrawal unit's plan is executed before unit 1 merges, it should follow the same check.
- No new route, no new component, no new screen. All work lands in the three existing files `frontend/src/app/admin/cycle-management/{cycle-management.component.ts,cycle-management.service.ts}` plus one new model file — confirmed these are the actual merged files (read directly from source, not just the original plan) under `frontend/src/app/admin/cycle-management/`.
- No modal/confirmation dialog — matches this screen's existing Close Cycle action and the codebase-wide absence of any modal component (confirmed absent by the original screen's plan). Credit Wallets submits directly on click, same as Close Cycle.
- Reuse `frontend/src/styles/_tokens.scss` CSS custom properties and the screen's existing `.brand-button--secondary`/`app-inline-banner` idioms verbatim — no new hex colors, no new shared component. The existing action column already renders its one button (`cycle-management__view-detail-action`) as a plain `<button class="... brand-button brand-button--secondary">`, not `<app-brand-button>` — Credit Wallets follows that same plain-button idiom for consistency within the action cell, not the `<app-brand-button variant="danger">` idiom the single "Current Cycle" strip's Close Cycle button uses (that one is a full-width strip action, not a table-row action).
- Every user-facing string goes through `TranslateModule`/`| translate` with a key added to **both** `frontend/src/assets/i18n/en.json` and `frontend/src/assets/i18n/hi.json`, inside the existing `admin.cycleManagement` object. Per this screen's established convention (confirmed by reading both files), `hi.json`'s feature-copy keys duplicate the English text verbatim — only `settings.sections.*` nav labels get real Hindi, and no nav change is needed here.
- `CycleStatus` (`frontend/src/app/admin/models/cycle.model.ts`) already includes `'PAID'` in its union type and the history table already renders whatever string `cycle.status` is — no change needed to the model or to `historyColumns`/`updateTableRows()` for the status display itself to show `PAID` once the backend returns it after a successful credit. This plan's job is only to (a) surface the action button and (b) reload the table after success so the row's `status` field flips from `CLOSED` to `PAID` in the UI.
- No design-artifact dispatch (`superpowers:frontend-design`) for this delta — unlike the original screen build, this is a small, single-action addition expressible entirely with the existing action-column button styling and the existing `app-inline-banner` success/danger tones already used for the Close Cycle result. Do not invent new SCSS beyond a minor row-actions spacing rule (Task 3).

---

## Part A — File Structure

**New file:**
- `frontend/src/app/admin/models/wallet-crediting-result.model.ts` — `WalletCreditingResult` interface mirroring unit 1's response DTO.

**Modified files:**
- `frontend/src/app/admin/cycle-management/cycle-management.service.ts` — add `creditWallets(id: string): Observable<WalletCreditingResult>`.
- `frontend/src/app/admin/cycle-management/cycle-management.service.spec.ts` — add the corresponding test.
- `frontend/src/app/admin/cycle-management/cycle-management.component.ts` — add the per-row "Credit Wallets" button (visible only when a row's `status === 'CLOSED'`), `creditResult`/`creditError` state, `creditWallets(id)` method, and two `app-inline-banner` states.
- `frontend/src/app/admin/cycle-management/cycle-management.component.spec.ts` — add tests for button visibility, success, 409 conflict, and generic error.
- `frontend/src/assets/i18n/en.json` / `hi.json` — new keys inside the existing `admin.cycleManagement` object.
- `frontend/src/styles/_admin.scss` — one small addition: a flex/gap rule for the action cell now holding two buttons (`.cycle-management__row-actions`), appended after the existing `.cycle-management__pagination` rules (~line 989 in the current file).

**No backend changes** — unit 1 owns `POST /api/admin/cycles/{id}/credit-wallets` and is out of scope here.

---

## Task 1: `WalletCreditingResult` frontend model

**Files:**
- Create: `frontend/src/app/admin/models/wallet-crediting-result.model.ts`

**Interfaces:**
- Produces: `WalletCreditingResult` — consumed by Task 2's service and Task 3's component.

**Contract this model mirrors** (per `docs/superpowers/plans/2026-08-04-wallet-withdrawal-units.md` unit 1, NOT YET MERGED at plan-writing time — see Global Constraints, verify before implementing):
- `cycleId: string` (UUID)
- `entriesCredited: number` (int — count of `LedgerEntry` rows credited)
- `totalAmountCredited: number` (BigDecimal on the backend, serializes as a JSON number)
- `newCycleStatus: CycleStatus` — always `'PAID'` on success per unit 1's acceptance criteria, but typed as the full `CycleStatus` union rather than a `'PAID'` literal, matching how `CycleCloseResponse.status` is typed `CycleStatus` rather than a narrower literal even though it's always `'CLOSED'`.

- [ ] **Step 1: Verify the contract against unit 1's actual merged code**

Before writing the interface, run:
```bash
find /Users/ronalisenapati/Ronali/plotchain/backend/src/main/java/com/plotchain/wallet -iname "*Crediting*"
```
If `WalletCreditingResult.java` exists, open it and confirm its field names/types match the four fields above, and open `CycleController.java` to confirm the mapped path is exactly `/api/admin/cycles/{id}/credit-wallets` via `POST`. If it does not exist yet (unit 1 still unmerged), proceed with the contract as documented above, but flag in your task hand-off / PR description that this was built against the contract, not the merged code, so a later diff-check is still owed.

- [ ] **Step 2: Write `wallet-crediting-result.model.ts`**

```typescript
import { CycleStatus } from './cycle.model';

// Mirrors backend/src/main/java/com/plotchain/wallet/WalletCreditingResult.java. Field names
// verified (or, if unit 1 was not yet merged when this file was written, provisionally assumed)
// against docs/superpowers/plans/2026-08-04-wallet-withdrawal-units.md unit 1's acceptance
// criteria: "Returns WalletCreditingResult(cycleId, entriesCredited, totalAmountCredited,
// newCycleStatus)". Re-verify against the real merged file before relying on this in production
// if it was written before unit 1 merged -- see this plan's Global Constraints.
export interface WalletCreditingResult {
  cycleId: string;
  entriesCredited: number;
  totalAmountCredited: number;
  newCycleStatus: CycleStatus;
}
```

- [ ] **Step 3: Verify the project still compiles**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: no new errors (this file isn't imported anywhere yet, so this just checks syntax).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/admin/models/wallet-crediting-result.model.ts
git commit -m "feat(cycle): add WalletCreditingResult frontend model"
```

---

## Task 2: `CycleManagementService.creditWallets()`

**Files:**
- Modify: `frontend/src/app/admin/cycle-management/cycle-management.service.ts`
- Modify: `frontend/src/app/admin/cycle-management/cycle-management.service.spec.ts`

**Interfaces:**
- Consumes: `WalletCreditingResult` (Task 1).
- Produces: `CycleManagementService.creditWallets(id: string): Observable<WalletCreditingResult>` — consumed by Task 3's component.

The service currently (confirmed by reading the real file) exposes `list()`, `detail()`, `close()`. This task adds a fourth method following `close()`'s exact shape (`POST`, empty body, id in the URL path).

- [ ] **Step 1: Write the failing test (append to `cycle-management.service.spec.ts`)**

```typescript
  it('credits wallets for a cycle by id', () => {
    const mockResponse: WalletCreditingResult = {
      cycleId: 'c1', entriesCredited: 12, totalAmountCredited: 4500, newCycleStatus: 'PAID'
    };

    service.creditWallets('c1').subscribe(res => expect(res).toEqual(mockResponse));

    const req = httpMock.expectOne('/api/admin/cycles/c1/credit-wallets');
    expect(req.request.method).toBe('POST');
    req.flush(mockResponse);
  });
```

Also add the import at the top of the spec file:
```typescript
import { WalletCreditingResult } from '../models/wallet-crediting-result.model';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/cycle-management.service.spec.ts'`
Expected: FAIL — `creditWallets` is not a function on `CycleManagementService`.

- [ ] **Step 3: Write the implementation**

Add to `cycle-management.service.ts`:

```typescript
import { WalletCreditingResult } from '../models/wallet-crediting-result.model';
// ... existing imports (CycleStatus, CyclePage, CycleDetail, CycleCloseResponse)

@Injectable({ providedIn: 'root' })
export class CycleManagementService {
  private http = inject(HttpClient);

  // ...existing list(), detail(), close() unchanged...

  creditWallets(id: string): Observable<WalletCreditingResult> {
    return this.http.post<WalletCreditingResult>(`/api/admin/cycles/${id}/credit-wallets`, {});
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/cycle-management.service.spec.ts'`
Expected: PASS (5 specs total — the 4 existing plus this one).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/admin/cycle-management/cycle-management.service.ts frontend/src/app/admin/cycle-management/cycle-management.service.spec.ts
git commit -m "feat(cycle): add CycleManagementService.creditWallets"
```

---

## Task 3: CycleManagementComponent — Credit Wallets action

**Files:**
- Modify: `frontend/src/app/admin/cycle-management/cycle-management.component.ts`
- Modify: `frontend/src/app/admin/cycle-management/cycle-management.component.spec.ts`
- Modify: `frontend/src/assets/i18n/en.json`, `frontend/src/assets/i18n/hi.json`
- Modify: `frontend/src/styles/_admin.scss`

**Interfaces:**
- Consumes: `CycleManagementService.creditWallets(id)` (Task 2), `WalletCreditingResult` (Task 1), the component's existing `page: CyclePage | null`, `loadPage(page: number)` (both already present — confirmed by reading the real merged file).
- Produces: adds `creditResult: WalletCreditingResult | null`, `creditError: 'conflict' | 'generic' | null`, `creditWallets(id: string): void` to `CycleManagementComponent` — this is the unit's terminal action, no further consumers.

**Design decisions:**
1. **Per-row action, not a single "current cycle" strip action.** Unlike Close Cycle (which acts on the one derived `currentOpenCycle`), a `CLOSED` cycle can be any row in the history table — there is no guarantee it's the most recent one, and the history table already lists cycles across all statuses. So this button lives in the existing `actionsTpl` action-column template (where "View Detail" already lives), gated per-row on `page!.cycles[i].status === 'CLOSED'`, exactly matching the acceptance criteria's "visible/enabled only for a CLOSED cycle" (singular per-row condition, not a screen-level current-cycle condition). A cycle already `PAID` naturally has no button (its `status !== 'CLOSED'`) — hidden, not disabled, matching how Close Cycle's own button is `*ngIf`-hidden rather than disabled-and-erroring for the no-`OPEN`-cycle case.
2. **Reload the *current* page/filter, not forced back to page 0.** Close Cycle's `closeCycle()` always calls `loadPage(0)` because it also needs to refresh `currentOpenCycle`, which is only computed from an unfiltered page-0 load. Credit Wallets has no such constraint — it should just re-fetch whatever page/filter the admin is currently looking at, so the credited row's `status` visibly flips to `PAID` in place (and, if the admin is filtered to `status=CLOSED`, the now-`PAID` row correctly drops out of that filtered view, which is correct — it's no longer `CLOSED`). Implementation: `this.loadPage(this.page?.page ?? 0)`, which reuses the private `status` field already held on the component for whatever filter is active — no new parameter needed.
3. **Error handling mirrors `closeCycle()` exactly:** `HttpErrorResponse.status === 409 ? 'conflict' : 'generic'`. Unit 1's 409 case covers both "already `PAID`" and "not yet `CLOSED`" (a race where another admin closed/credited concurrently) — both map to the same `'conflict'` banner copy, worded to cover either. A 404 (row deleted/id invalid — practically unreachable since the row was already loaded, but not impossible under a concurrent hard-delete) falls into the `'generic'` bucket, same as any other unexpected failure, matching `closeCycle()`'s own scope (it doesn't special-case 404 either).

- [ ] **Step 1: Add the required i18n keys**

Add to the `admin.cycleManagement` object in both `frontend/src/assets/i18n/en.json` and `frontend/src/assets/i18n/hi.json` (verbatim duplicate in `hi.json`, per this screen's established convention):

```json
      "creditWalletsAction": "Credit Wallets",
      "creditSuccessTitle": "Wallets credited",
      "creditSuccessCycleLabel": "Cycle",
      "creditSuccessEntriesLabel": "Entries credited",
      "creditSuccessAmountLabel": "Total amount credited",
      "creditSuccessStatusLabel": "New cycle status",
      "creditConflictError": "This cycle could not be credited -- it may already be PAID, or settlement hasn't closed yet. Refresh to see its current status.",
      "creditGenericError": "Could not credit wallets for this cycle. Please try again."
```

- [ ] **Step 2: Write the failing tests (append to `cycle-management.component.spec.ts`)**

The existing `beforeEach` already loads page 0 with `c1` (`status: 'CLOSED'`) and `c2` (`status: 'OPEN'`) — confirmed by reading the real spec file — so `c1` is already available as a `CLOSED` row for these tests with no fixture changes needed.

```typescript
  it('shows a Credit Wallets button only for the CLOSED row, not the OPEN row', () => {
    fixture.detectChanges();
    const buttons: NodeListOf<HTMLButtonElement> = fixture.nativeElement.querySelectorAll('.cycle-management__credit-wallets-action');
    expect(buttons.length).toBe(1);
  });

  it('credits wallets for a CLOSED cycle and shows the success banner, then reloads the current page', () => {
    fixture.detectChanges();
    fixture.componentInstance.creditWallets('c1');

    const req = httpMock.expectOne('/api/admin/cycles/c1/credit-wallets');
    expect(req.request.method).toBe('POST');
    req.flush({ cycleId: 'c1', entriesCredited: 12, totalAmountCredited: 4500, newCycleStatus: 'PAID' });

    httpMock.expectOne('/api/admin/cycles?page=0&size=20').flush({
      cycles: [
        { id: 'c1', periodStart: '2026-08-01', periodEnd: '2026-08-15', status: 'PAID' },
        { id: 'c2', periodStart: '2026-08-16', periodEnd: '2026-08-31', status: 'OPEN' }
      ],
      page: 0, size: 20, totalElements: 2
    });

    expect(fixture.componentInstance.creditResult?.entriesCredited).toBe(12);
    expect(fixture.componentInstance.creditResult?.newCycleStatus).toBe('PAID');
    expect(fixture.componentInstance.creditError).toBeNull();
    expect(fixture.componentInstance.page?.cycles[0].status).toBe('PAID');
  });

  it('shows a conflict error on a 409 without crashing', () => {
    fixture.detectChanges();
    fixture.componentInstance.creditWallets('c1');

    const req = httpMock.expectOne('/api/admin/cycles/c1/credit-wallets');
    req.flush({ error: 'Cycle is not closed, cannot credit' }, { status: 409, statusText: 'Conflict' });

    expect(fixture.componentInstance.creditError).toBe('conflict');
    expect(fixture.componentInstance.creditResult).toBeNull();
  });

  it('shows a generic error on a non-409 credit-wallets failure', () => {
    fixture.detectChanges();
    fixture.componentInstance.creditWallets('c1');

    const req = httpMock.expectOne('/api/admin/cycles/c1/credit-wallets');
    req.flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });

    expect(fixture.componentInstance.creditError).toBe('generic');
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd frontend && npx ng test --watch=false --include='**/cycle-management.component.spec.ts'`
Expected: FAIL — `.cycle-management__credit-wallets-action` not found, `creditWallets`/`creditResult`/`creditError` undefined.

- [ ] **Step 4: Write the implementation**

Add the import and new state/method to `cycle-management.component.ts`:

```typescript
import { WalletCreditingResult } from '../models/wallet-crediting-result.model';
// ... existing imports (Component, OnInit, inject, CommonModule, HttpErrorResponse,
// TranslateModule, TranslateService, CycleManagementService, CycleStatus, CyclePage,
// CycleSummary, CycleDetail, CycleCloseResponse, EditableTableColumn, EditableTableComponent,
// InlineBannerComponent, SidePanelComponent, BrandButtonComponent)
```

Update the `actionsTpl` template (replace the existing single-button template with a two-button wrapper — the `cycle-management__view-detail-action` button and its click handler are unchanged, only the wrapping `<div>` and the new conditional button are added):

```html
      <ng-template #actionsTpl let-i="index">
        <div class="cycle-management__row-actions">
          <button type="button" class="cycle-management__view-detail-action brand-button brand-button--secondary" (click)="viewDetail(page!.cycles[i].id)">
            {{ 'admin.cycleManagement.viewDetailAction' | translate }}
          </button>
          <button
            type="button"
            *ngIf="page!.cycles[i].status === 'CLOSED'"
            class="cycle-management__credit-wallets-action brand-button brand-button--secondary"
            (click)="creditWallets(page!.cycles[i].id)"
          >
            {{ 'admin.cycleManagement.creditWalletsAction' | translate }}
          </button>
        </div>
      </ng-template>
```

Add the success/error banners to the template, placed directly after the existing `cycle-management__close-generic-error` banner (grouping all mutating-action results together, same visual region as Close Cycle's banners):

```html
      <app-inline-banner *ngIf="creditResult as result" tone="success" [dismissible]="true" class="cycle-management__credit-success" (dismissed)="creditResult = null">
        <p>{{ 'admin.cycleManagement.creditSuccessTitle' | translate }}</p>
        <p>{{ 'admin.cycleManagement.creditSuccessCycleLabel' | translate }}: <strong>{{ result.cycleId }}</strong> ({{ result.newCycleStatus }})</p>
        <p>{{ 'admin.cycleManagement.creditSuccessEntriesLabel' | translate }}: <strong>{{ result.entriesCredited }}</strong></p>
        <p>{{ 'admin.cycleManagement.creditSuccessAmountLabel' | translate }}: <strong>{{ result.totalAmountCredited }}</strong></p>
      </app-inline-banner>
      <app-inline-banner *ngIf="creditError === 'conflict'" tone="danger" [dismissible]="true" class="cycle-management__credit-conflict-error" (dismissed)="creditError = null">{{ 'admin.cycleManagement.creditConflictError' | translate }}</app-inline-banner>
      <app-inline-banner *ngIf="creditError === 'generic'" tone="danger" [dismissible]="true" class="cycle-management__credit-generic-error" (dismissed)="creditError = null">{{ 'admin.cycleManagement.creditGenericError' | translate }}</app-inline-banner>
```

Add the new state and method to the `CycleManagementComponent` class body (alongside the existing `closeResult`/`closeError`/`closeCycle()`):

```typescript
  creditResult: WalletCreditingResult | null = null;
  creditError: 'conflict' | 'generic' | null = null;

  creditWallets(id: string): void {
    this.creditError = null;
    this.cycleManagementService.creditWallets(id).subscribe({
      next: result => {
        this.creditResult = result;
        this.loadPage(this.page?.page ?? 0);
      },
      error: (err: HttpErrorResponse) => {
        this.creditResult = null;
        this.creditError = err.status === 409 ? 'conflict' : 'generic';
      }
    });
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npx ng test --watch=false --include='**/cycle-management.component.spec.ts'`
Expected: PASS (17 specs total — the 13 existing plus these 4).

- [ ] **Step 6: Add the row-actions spacing rule to `_admin.scss`**

Append after the existing `.cycle-management__pagination .brand-button--secondary` rule (~line 989 in the current file):

```scss
// Action column now holds two buttons per CLOSED row (View Detail, Credit Wallets) --
// a plain flex/gap wrapper, no new tokens.
.cycle-management__row-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
```

- [ ] **Step 7: Run the full frontend test suite to confirm no regressions**

Run: `cd frontend && npx ng test --watch=false`
Expected: PASS, no regressions in any other spec file.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/admin/cycle-management/cycle-management.component.ts frontend/src/app/admin/cycle-management/cycle-management.component.spec.ts frontend/src/assets/i18n/en.json frontend/src/assets/i18n/hi.json frontend/src/styles/_admin.scss
git commit -m "feat(cycle): add Credit Wallets action to CycleManagementComponent"
```

---

## Self-Review Notes

- **Spec coverage:** "Credit Wallets action visible/enabled only for a CLOSED cycle, calling unit 1's endpoint" → Task 3, Design decision 1 (`*ngIf="page!.cycles[i].status === 'CLOSED'"`). "On success, screen's cycle-status display now shows PAID" → Task 3 Step 4's `loadPage()` reload plus the pre-existing `CycleStatus`/`historyRows` machinery that already renders whatever status string comes back (Global Constraints notes this needed no model change). "A cycle that's already PAID shows the action disabled/hidden rather than erroring" → same `*ngIf`, Design decision 1. "Targeted addition to an existing screen's component, not a new screen or route" → Part A's file list touches only the three existing `cycle-management/*` files plus one new model, no route/nav-rail change.
- **Placeholder scan:** every task has concrete file paths, real TypeScript/HTML/SCSS, and real test assertions with real mock payloads. The one intentionally-flagged uncertainty is Task 1's contract-verification step, which is explicit about what to check and what to do in either outcome (found vs. not-yet-merged) — not a vague "verify as needed."
- **Type consistency:** `WalletCreditingResult`'s four fields (`cycleId`, `entriesCredited`, `totalAmountCredited`, `newCycleStatus`) introduced in Task 1 are used identically in Task 2's service signature and Task 3's component/template (`result.cycleId`, `result.entriesCredited`, `result.totalAmountCredited`, `result.newCycleStatus`). `creditWallets(id: string)` has the same name and signature shape on both the service (Task 2, returns `Observable<WalletCreditingResult>`) and the component (Task 3, returns `void`, calls the service method) — mirroring how `close()`/`closeCycle()` are already named differently between service and component in the existing merged code, avoiding a same-name collision between the service call and the component handler.
- **Existing-file drift check:** Task 3's starting point (imports, existing template structure, existing `closeCycle()`/`loadPage()` shape) was copied from the actual merged `frontend/src/app/admin/cycle-management/cycle-management.component.ts` and `cycle-management.service.ts` (read directly, not from the original plan document) — confirmed identical to the original plan's Task 5 output, so no reconciliation note was needed there, unlike the wallet-crediting-result contract itself (Task 1), which genuinely couldn't be verified against real code at plan-writing time.
