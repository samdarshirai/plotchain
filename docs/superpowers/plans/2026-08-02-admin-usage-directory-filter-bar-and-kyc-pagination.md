# Associate Directory Filter Bar, KYC Stat-Tiles & Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the gap between the `admin-usage-core-ops` design spec and the shipped Associate Directory / KYC Review Queue screens — add the missing filter bar, KYC queue counts, KYC pagination UI, and `editable-table` adoption (with empty states) on both screens.

**Architecture:** One new backend read endpoint (`GET /api/admin/kyc/counts`) backed by a new repository derived-query method. On the frontend, extend the existing `editable-table` shared component with an additive read-only mode (`readOnly`, `rowClick`, an `'action'` column type) so both admin screens can adopt it without becoming editors. Then wire each screen's missing UI (filter bar, stat-tiles, pagination) against interfaces/endpoints that mostly already exist.

**Tech Stack:** Spring Boot / Spring Data JPA (backend), Angular standalone components + `@ngx-translate` (frontend), JUnit 5 + Mockito + MockMvc (backend tests), Jasmine/Karma + `HttpClientTestingModule` (frontend tests).

## Global Constraints

- Backend list/paginated endpoints clamp `size` to a maximum of 100 and clamp `page` to a minimum of 0 (existing `KycReviewController`/`AdminAssociateController` pattern) — the new counts endpoint is unpaginated, so this doesn't apply to it, but don't regress it on existing endpoints.
- Every new or changed UI string needs a key in **both** `frontend/src/assets/i18n/en.json` and `frontend/src/assets/i18n/hi.json`. The existing `admin.associateDirectory` / `admin.kycQueue` sections in `hi.json` are currently untranslated placeholders (English text duplicated from `en.json`) — match that precedent for new keys in those two sections; do not leave `hi.json` missing a key `en.json` has.
- `editable-table`, `stat-tile`, and `tab-bar` are shared components with other consumers (e.g. compensation/rank config editors). Extensions must be strictly additive — no existing consumer's template, inputs, or behavior may change. Every new `@Input`/`@Output` must default to a value that reproduces today's behavior exactly.
- Follow existing codebase conventions already visible in the files this plan touches: standalone Angular components, `inject()` over constructor injection in components (services still use constructor injection), Angular structural directives (`*ngIf`/`*ngFor`, not the newer `@if`/`@for` control-flow syntax), JUnit 5 + AssertJ + Mockito on the backend.

---

### Task 1: Backend — KYC queue counts endpoint

**Files:**
- Modify: `backend/src/main/java/com/plotchain/associate/AssociateRepository.java`
- Create: `backend/src/main/java/com/plotchain/associate/KycCountsResponse.java`
- Modify: `backend/src/main/java/com/plotchain/associate/KycReviewService.java`
- Modify: `backend/src/main/java/com/plotchain/associate/KycReviewController.java`
- Test: `backend/src/test/java/com/plotchain/associate/KycReviewServiceTest.java`
- Test: `backend/src/test/java/com/plotchain/associate/KycReviewControllerTest.java`

**Interfaces:**
- Produces: `AssociateRepository.countByRoleAndKycStatus(AssociateRole role, KycStatus kycStatus): long`; `KycCountsResponse(long pending, long verified, long rejected)`; `KycReviewService.counts(): KycCountsResponse`; `GET /api/admin/kyc/counts` → `KycCountsResponse` JSON (same access as existing `GET /api/admin/kyc` — no `@PreAuthorize`, gated only by the blanket admin-family matcher).

- [ ] **Step 1: Write the failing service test**

Add to `backend/src/test/java/com/plotchain/associate/KycReviewServiceTest.java` (new test method, anywhere among the other `@Test` methods):

```java
    @Test
    void countsReturnsCountsPerStatus() {
        when(associateRepository.countByRoleAndKycStatus(AssociateRole.ASSOCIATE, KycStatus.PENDING)).thenReturn(3L);
        when(associateRepository.countByRoleAndKycStatus(AssociateRole.ASSOCIATE, KycStatus.VERIFIED)).thenReturn(10L);
        when(associateRepository.countByRoleAndKycStatus(AssociateRole.ASSOCIATE, KycStatus.REJECTED)).thenReturn(2L);

        KycCountsResponse response = service.counts();

        assertThat(response.pending()).isEqualTo(3L);
        assertThat(response.verified()).isEqualTo(10L);
        assertThat(response.rejected()).isEqualTo(2L);
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && mvn -q -Dtest=KycReviewServiceTest test`
Expected: compile error (`KycCountsResponse` and `AssociateRepository.countByRoleAndKycStatus` don't exist yet) or test failure once those stubs exist. If Maven refuses to compile the test module at all, that's the expected "fail" for this step — proceed to Step 3.

- [ ] **Step 3: Add the repository method, response record, and service method**

Add to `AssociateRepository.java`, alongside the other derived-query methods (e.g. near `countByRoleNot`):

```java
    long countByRoleAndKycStatus(AssociateRole role, KycStatus kycStatus);
```

Create `backend/src/main/java/com/plotchain/associate/KycCountsResponse.java`:

```java
package com.plotchain.associate;

public record KycCountsResponse(long pending, long verified, long rejected) {}
```

Add to `KycReviewService.java`, alongside `list`:

```java
    public KycCountsResponse counts() {
        return new KycCountsResponse(
            associateRepository.countByRoleAndKycStatus(AssociateRole.ASSOCIATE, KycStatus.PENDING),
            associateRepository.countByRoleAndKycStatus(AssociateRole.ASSOCIATE, KycStatus.VERIFIED),
            associateRepository.countByRoleAndKycStatus(AssociateRole.ASSOCIATE, KycStatus.REJECTED)
        );
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && mvn -q -Dtest=KycReviewServiceTest test`
Expected: PASS, including the new `countsReturnsCountsPerStatus` test.

- [ ] **Step 5: Write the failing controller test**

Add to `backend/src/test/java/com/plotchain/associate/KycReviewControllerTest.java`:

```java
    @Test
    void countsReturnsCountsForAnyAdminFamilyToken() throws Exception {
        when(associateRepository.countByRoleAndKycStatus(AssociateRole.ASSOCIATE, KycStatus.PENDING)).thenReturn(3L);
        when(associateRepository.countByRoleAndKycStatus(AssociateRole.ASSOCIATE, KycStatus.VERIFIED)).thenReturn(10L);
        when(associateRepository.countByRoleAndKycStatus(AssociateRole.ASSOCIATE, KycStatus.REJECTED)).thenReturn(2L);

        mockMvc.perform(get("/api/admin/kyc/counts")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.FINANCE)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.pending").value(3))
            .andExpect(jsonPath("$.verified").value(10))
            .andExpect(jsonPath("$.rejected").value(2));
    }
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd backend && mvn -q -Dtest=KycReviewControllerTest test`
Expected: FAIL with 404 (no `/counts` mapping yet).

- [ ] **Step 7: Add the controller endpoint**

Add to `KycReviewController.java`, alongside `list`:

```java
    @GetMapping("/counts")
    public KycCountsResponse counts() {
        return kycReviewService.counts();
    }
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd backend && mvn -q -Dtest=KycReviewServiceTest,KycReviewControllerTest test`
Expected: PASS, all tests including the two new ones.

- [ ] **Step 9: Commit**

```bash
git add backend/src/main/java/com/plotchain/associate/AssociateRepository.java \
        backend/src/main/java/com/plotchain/associate/KycCountsResponse.java \
        backend/src/main/java/com/plotchain/associate/KycReviewService.java \
        backend/src/main/java/com/plotchain/associate/KycReviewController.java \
        backend/src/test/java/com/plotchain/associate/KycReviewServiceTest.java \
        backend/src/test/java/com/plotchain/associate/KycReviewControllerTest.java
git commit -m "feat(admin): add KYC queue counts endpoint"
```

---

### Task 2: Frontend — `editable-table` read-only mode + row click

**Files:**
- Modify: `frontend/src/app/shared/components/editable-table/editable-table.component.ts`
- Test: `frontend/src/app/shared/components/editable-table/editable-table.component.spec.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `EditableTableComponent.readOnly: boolean` (default `false`); `EditableTableComponent.rowClick: EventEmitter<number>` (emits the clicked row's index, only when `readOnly` is `true`).

- [ ] **Step 1: Write the failing tests**

Add to `frontend/src/app/shared/components/editable-table/editable-table.component.spec.ts`, inside the existing `describe('EditableTableComponent', ...)` block (after the last existing `it(...)`):

```ts
  it('readOnly renders plain-text cells and hides add/remove affordances', () => {
    fixture.componentInstance.readOnly = true;
    fixture.detectChanges();

    const bodyRows = fixture.nativeElement.querySelectorAll('tbody tr');
    expect(bodyRows[0].querySelector('input')).toBeNull();
    expect(bodyRows[0].querySelector('select')).toBeNull();
    expect(bodyRows[0].textContent).toContain('gold');
    expect(fixture.nativeElement.querySelector('.editable-table__add-row')).toBeNull();
    expect(fixture.nativeElement.querySelector('.editable-table__remove-row')).toBeNull();
  });

  it('readOnly clicking a row emits rowClick with that row\'s index', () => {
    fixture.componentInstance.readOnly = true;
    fixture.detectChanges();
    const spy = jasmine.createSpy('rowClick');
    fixture.componentInstance.rowClick.subscribe(spy);

    const bodyRows = fixture.nativeElement.querySelectorAll('tbody tr');
    bodyRows[1].click();

    expect(spy).toHaveBeenCalledWith(1);
  });

  it('non-readOnly clicking a row does not emit rowClick', () => {
    fixture.detectChanges();
    const spy = jasmine.createSpy('rowClick');
    fixture.componentInstance.rowClick.subscribe(spy);

    const bodyRows = fixture.nativeElement.querySelectorAll('tbody tr');
    bodyRows[0].click();

    expect(spy).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx ng test --include='**/editable-table.component.spec.ts' --watch=false`
Expected: FAIL — `readOnly` and `rowClick` don't exist on the component yet (compile error) or the three new tests fail.

- [ ] **Step 3: Implement `readOnly` and `rowClick`**

Replace the full contents of `frontend/src/app/shared/components/editable-table/editable-table.component.ts` with:

```ts
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface EditableTableColumn {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select';
  options?: { value: string; label: string }[];
}

@Component({
  selector: 'app-editable-table',
  standalone: true,
  imports: [CommonModule],
  template: `
    <table class="editable-table">
      <thead>
        <tr>
          <th *ngFor="let column of columns">{{ column.label }}</th>
        </tr>
      </thead>
      <tbody *ngIf="rows.length > 0; else emptyState">
        <tr *ngFor="let row of rows; let i = index" (click)="onRowClick(i)">
          <td *ngFor="let column of columns">
            <span *ngIf="readOnly">{{ row[column.key] }}</span>
            <ng-container *ngIf="!readOnly">
              <select
                *ngIf="column.type === 'select'; else textOrNumberCell"
                [value]="row[column.key]"
                (change)="onCellInput($event, i, column.key)"
              >
                <option *ngFor="let option of column.options" [value]="option.value">
                  {{ option.label }}
                </option>
              </select>
              <ng-template #textOrNumberCell>
                <input
                  [type]="column.type"
                  [value]="row[column.key]"
                  (input)="onCellInput($event, i, column.key)"
                />
              </ng-template>
            </ng-container>
          </td>
          <td *ngIf="!readOnly">
            <button type="button" class="editable-table__remove-row" (click)="removeRow(i)">
              {{ removeRowLabel }}
            </button>
          </td>
        </tr>
      </tbody>
      <ng-template #emptyState>
        <tbody>
          <tr>
            <td class="editable-table__empty" [attr.colspan]="readOnly ? columns.length : columns.length + 1">
              {{ emptyStateLabel }}
            </td>
          </tr>
        </tbody>
      </ng-template>
    </table>
    <button *ngIf="!readOnly" type="button" class="editable-table__add-row" (click)="addRow()">
      {{ addRowLabel }}
    </button>
  `
})
export class EditableTableComponent {
  @Input({ required: true }) columns: EditableTableColumn[] = [];
  @Input({ required: true }) rows: Record<string, string | number>[] = [];
  @Input() addRowLabel = '';
  @Input() removeRowLabel = '';
  @Input() emptyStateLabel = '';
  @Input() readOnly = false;
  @Output() rowsChange = new EventEmitter<Record<string, string | number>[]>();
  @Output() rowClick = new EventEmitter<number>();

  onRowClick(index: number): void {
    if (this.readOnly) {
      this.rowClick.emit(index);
    }
  }

  onCellInput(event: Event, rowIndex: number, key: string): void {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    this.updateCell(rowIndex, key, target.value);
  }

  updateCell(rowIndex: number, key: string, value: string): void {
    const column = this.columns.find((c) => c.key === key);
    const nextValue: string | number = column?.type === 'number' ? Number(value) : value;
    const nextRows = this.rows.map((row, i) => (i === rowIndex ? { ...row, [key]: nextValue } : row));
    this.rowsChange.emit(nextRows);
  }

  addRow(): void {
    const blankRow: Record<string, string | number> = {};
    for (const column of this.columns) {
      blankRow[column.key] = column.type === 'number' ? 0 : '';
    }
    this.rowsChange.emit([...this.rows, blankRow]);
  }

  removeRow(rowIndex: number): void {
    const nextRows = this.rows.filter((_, i) => i !== rowIndex);
    this.rowsChange.emit(nextRows);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx ng test --include='**/editable-table.component.spec.ts' --watch=false`
Expected: PASS, all tests including the 3 new ones and all 6 pre-existing ones (readOnly defaults to `false`, so every pre-existing test's behavior is unchanged).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/shared/components/editable-table/editable-table.component.ts \
        frontend/src/app/shared/components/editable-table/editable-table.component.spec.ts
git commit -m "feat(shared): add readOnly mode and rowClick to editable-table"
```

---

### Task 3: Frontend — `editable-table` action column type

**Files:**
- Modify: `frontend/src/app/shared/components/editable-table/editable-table.component.ts`
- Test: `frontend/src/app/shared/components/editable-table/editable-table.component.spec.ts`

**Interfaces:**
- Consumes: `EditableTableComponent` from Task 2 (`readOnly`, `rowClick` already present).
- Produces: `EditableTableColumn.type` gains `'action'`; `EditableTableComponent.actionTemplate?: TemplateRef<ActionCellContext>`; exported `ActionCellContext { $implicit: Record<string, string | number>; index: number }`. A column with `type: 'action'` renders `actionTemplate` (via `ngTemplateOutlet`, context `{ $implicit: row, index }`) instead of `row[column.key]`, regardless of `readOnly`.

- [ ] **Step 1: Write the failing test**

Add to the bottom of `frontend/src/app/shared/components/editable-table/editable-table.component.spec.ts` (new top-level `describe`, after the closing `});` of the existing one):

```ts

import { Component } from '@angular/core';

@Component({
  standalone: true,
  imports: [EditableTableComponent],
  template: `
    <app-editable-table
      [readOnly]="true"
      [columns]="columns"
      [rows]="rows"
      [actionTemplate]="actionTpl"
      [emptyStateLabel]="'No rows'"
    ></app-editable-table>
    <ng-template #actionTpl let-row let-i="index">
      <button class="action-cell" [attr.data-index]="i">{{ row.note }}</button>
    </ng-template>
  `
})
class ActionColumnHostComponent {
  columns: EditableTableColumn[] = [
    { key: 'note', label: 'Note', type: 'text' },
    { key: 'actions', label: 'Actions', type: 'action' }
  ];
  rows: Record<string, string | number>[] = [{ note: 'top tier' }, { note: 'mid tier' }];
}

describe('EditableTableComponent action column', () => {
  it('renders the caller-supplied template in an action-type column cell', () => {
    TestBed.configureTestingModule({ imports: [ActionColumnHostComponent] });
    const fixture = TestBed.createComponent(ActionColumnHostComponent);
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll('.action-cell');
    expect(buttons.length).toBe(2);
    expect(buttons[0].textContent).toContain('top tier');
    expect(buttons[0].getAttribute('data-index')).toBe('0');
    expect(buttons[1].textContent).toContain('mid tier');
    expect(buttons[1].getAttribute('data-index')).toBe('1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx ng test --include='**/editable-table.component.spec.ts' --watch=false`
Expected: FAIL — `'action'` is not assignable to `EditableTableColumn['type']`, and `actionTemplate` doesn't exist yet (compile error).

- [ ] **Step 3: Implement the `'action'` column type**

In `frontend/src/app/shared/components/editable-table/editable-table.component.ts`:

Change the import line to:

```ts
import { Component, EventEmitter, Input, Output, TemplateRef } from '@angular/core';
```

Change the `EditableTableColumn` interface's `type` field to:

```ts
  type: 'text' | 'number' | 'select' | 'action';
```

Add this new exported interface above `@Component`:

```ts
export interface ActionCellContext {
  $implicit: Record<string, string | number>;
  index: number;
}
```

Replace the `<td *ngFor="let column of columns">...</td>` block (the one containing the `<span *ngIf="readOnly">` / editable `<ng-container>`) with:

```html
          <td *ngFor="let column of columns">
            <ng-container *ngIf="column.type === 'action'; else dataCell">
              <ng-container
                *ngTemplateOutlet="actionTemplate ?? null; context: { $implicit: row, index: i }"
              ></ng-container>
            </ng-container>
            <ng-template #dataCell>
              <span *ngIf="readOnly">{{ row[column.key] }}</span>
              <ng-container *ngIf="!readOnly">
                <select
                  *ngIf="column.type === 'select'; else textOrNumberCell"
                  [value]="row[column.key]"
                  (change)="onCellInput($event, i, column.key)"
                >
                  <option *ngFor="let option of column.options" [value]="option.value">
                    {{ option.label }}
                  </option>
                </select>
                <ng-template #textOrNumberCell>
                  <input
                    [type]="column.type"
                    [value]="row[column.key]"
                    (input)="onCellInput($event, i, column.key)"
                  />
                </ng-template>
              </ng-container>
            </ng-template>
          </td>
```

Add this new `@Input` to the class, alongside `readOnly`:

```ts
  @Input() actionTemplate?: TemplateRef<ActionCellContext>;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx ng test --include='**/editable-table.component.spec.ts' --watch=false`
Expected: PASS, all tests — the new action-column test plus all 9 tests from Task 2 (a column never using `type: 'action'` renders exactly as before).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/shared/components/editable-table/editable-table.component.ts \
        frontend/src/app/shared/components/editable-table/editable-table.component.spec.ts
git commit -m "feat(shared): add action column type to editable-table"
```

---

### Task 4: Frontend — KYC counts model + service method

**Files:**
- Create: `frontend/src/app/admin/models/kyc-counts.model.ts`
- Modify: `frontend/src/app/admin/kyc-queue/kyc-queue.service.ts`
- Test: `frontend/src/app/admin/kyc-queue/kyc-queue.service.spec.ts`

**Interfaces:**
- Consumes: `GET /api/admin/kyc/counts` from Task 1, response shape `{ pending: number, verified: number, rejected: number }`.
- Produces: `KycCounts { pending: number; verified: number; rejected: number }`; `KycQueueService.counts(): Observable<KycCounts>`.

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/app/admin/kyc-queue/kyc-queue.service.spec.ts`, inside the `describe` block (after the last existing `it`):

```ts
  it('fetches KYC queue counts', () => {
    const mockCounts: KycCounts = { pending: 3, verified: 10, rejected: 2 };

    service.counts().subscribe(res => expect(res).toEqual(mockCounts));

    const req = httpMock.expectOne('/api/admin/kyc/counts');
    expect(req.request.method).toBe('GET');
    req.flush(mockCounts);
  });
```

Add this import at the top of the file, alongside the existing `KycPage` import:

```ts
import { KycCounts } from '../models/kyc-counts.model';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx ng test --include='**/kyc-queue.service.spec.ts' --watch=false`
Expected: FAIL — `KycCounts` module doesn't exist and `service.counts` isn't a function (compile error).

- [ ] **Step 3: Create the model and add the service method**

Create `frontend/src/app/admin/models/kyc-counts.model.ts`:

```ts
export interface KycCounts {
  pending: number;
  verified: number;
  rejected: number;
}
```

In `frontend/src/app/admin/kyc-queue/kyc-queue.service.ts`, add this import:

```ts
import { KycCounts } from '../models/kyc-counts.model';
```

Add this method to `KycQueueService`, alongside `list`:

```ts
  counts(): Observable<KycCounts> {
    return this.http.get<KycCounts>('/api/admin/kyc/counts');
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx ng test --include='**/kyc-queue.service.spec.ts' --watch=false`
Expected: PASS, all 4 tests (3 pre-existing + the new one).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/admin/models/kyc-counts.model.ts \
        frontend/src/app/admin/kyc-queue/kyc-queue.service.ts \
        frontend/src/app/admin/kyc-queue/kyc-queue.service.spec.ts
git commit -m "feat(admin): add KYC queue counts to KycQueueService"
```

---

### Task 5: Frontend — KYC queue stat-tiles

**Files:**
- Modify: `frontend/src/app/admin/kyc-queue/kyc-queue.component.ts`
- Test: `frontend/src/app/admin/kyc-queue/kyc-queue.component.spec.ts`

**Interfaces:**
- Consumes: `KycQueueService.counts()` from Task 4; `StatTileComponent` (`frontend/src/app/shared/components/stat-tile/stat-tile.component.ts`, unmodified) — `@Input label: string`, `@Input value: string`.
- Produces: `KycQueueComponent.counts: KycCounts | null`.

Note: every existing test in this spec file flushes exactly one HTTP request in `beforeEach` (the `PENDING` list load). Once `ngOnInit` also fires a counts request, every existing test needs to flush that too, or `httpMock.verify()` in `afterEach` fails with "unmatched request". This step updates the shared `beforeEach`/`afterEach` once so every existing test keeps passing.

- [ ] **Step 1: Write the failing test and update the shared `beforeEach`**

In `frontend/src/app/admin/kyc-queue/kyc-queue.component.spec.ts`, replace the `beforeEach` block with:

```ts
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [KycQueueComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(KycQueueComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    httpMock.expectOne('/api/admin/kyc/counts')
      .flush({ pending: 1, verified: 4, rejected: 2 });
    httpMock.expectOne('/api/admin/kyc?status=PENDING&page=0&size=20')
      .flush({ entries: [{ id: 'a1', userId: 'VP00001', name: 'Jane', kycStatus: 'PENDING', joinedAt: '2026-01-01T00:00:00Z' }], page: 0, size: 20, totalElements: 1 });
  });
```

Add this new test after the last existing `it(...)` in the file:

```ts
  it('loads and displays queue counts on init', () => {
    expect(fixture.componentInstance.counts).toEqual({ pending: 1, verified: 4, rejected: 2 });
  });

  it('reloads counts after an approval decision', () => {
    fixture.componentInstance.approve('a1');

    const decisionReq = httpMock.expectOne('/api/admin/kyc/a1/decision');
    decisionReq.flush({ id: 'a1', userId: 'VP00001', name: 'Jane', kycStatus: 'VERIFIED', joinedAt: '2026-01-01T00:00:00Z' });

    httpMock.expectOne('/api/admin/kyc?status=PENDING&page=0&size=20')
      .flush({ entries: [], page: 0, size: 20, totalElements: 0 });
    httpMock.expectOne('/api/admin/kyc/counts')
      .flush({ pending: 0, verified: 5, rejected: 2 });

    expect(fixture.componentInstance.counts).toEqual({ pending: 0, verified: 5, rejected: 2 });
  });
```

Every other existing test in this file that calls `onTabChange`, `approve`, or `reject` and then flushes a reload request will now also need a counts flush once Step 3 lands — that's expected; those tests are fixed as part of Step 3 below, not this step (this step only adds the two new tests and the shared `beforeEach`; the pre-existing tests are expected to fail at Step 2, since `approve`/`reject`/`onTabChange` don't yet trigger a second counts request).

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `cd frontend && npx ng test --include='**/kyc-queue.component.spec.ts' --watch=false`
Expected: FAIL on `'loads and displays queue counts on init'` (`counts` is `undefined`) and on `'reloads counts after an approval decision'` (`httpMock.verify()` fails — an extra `/api/admin/kyc/counts` request the component never made is left unflushed by the test, or the component field doesn't exist). Other pre-existing tests may also start failing here due to `httpMock.verify()` in `afterEach` seeing the counts request added in `beforeEach` — that's expected until Step 3.

- [ ] **Step 3: Add stat-tiles to the component**

In `frontend/src/app/admin/kyc-queue/kyc-queue.component.ts`, add these imports:

```ts
import { KycCounts } from '../models/kyc-counts.model';
import { StatTileComponent } from '../../shared/components/stat-tile/stat-tile.component';
```

Add `StatTileComponent` to the `@Component` decorator's `imports` array:

```ts
  imports: [CommonModule, FormsModule, TranslateModule, TabBarComponent, StatTileComponent],
```

Add this markup to the template, directly above the `<app-tab-bar ...>` line:

```html
      <div class="kyc-queue__stat-tiles">
        <app-stat-tile [label]="'admin.kycQueue.tabPending' | translate" [value]="(counts?.pending ?? 0).toString()"></app-stat-tile>
        <app-stat-tile [label]="'admin.kycQueue.tabVerified' | translate" [value]="(counts?.verified ?? 0).toString()"></app-stat-tile>
        <app-stat-tile [label]="'admin.kycQueue.tabRejected' | translate" [value]="(counts?.rejected ?? 0).toString()"></app-stat-tile>
      </div>
```

Add this field to the class, alongside `page`:

```ts
  counts: KycCounts | null = null;
```

Change `ngOnInit` to:

```ts
  ngOnInit(): void {
    this.loadCounts();
    this.loadPage(0);
  }
```

Add this private method, alongside `loadPage`:

```ts
  private loadCounts(): void {
    this.kycQueueService.counts().subscribe(res => (this.counts = res));
  }
```

Change `approve` and `reject` to also reload counts on success:

```ts
  approve(id: string): void {
    this.decisionError = false;
    this.kycQueueService.decide(id, 'VERIFIED').subscribe({
      next: () => {
        this.loadPage(this.page?.page ?? 0);
        this.loadCounts();
      },
      error: () => (this.decisionError = true)
    });
  }

  reject(id: string): void {
    this.decisionError = false;
    this.kycQueueService.decide(id, 'REJECTED', this.rejectReasons[id]).subscribe({
      next: () => {
        delete this.rejectReasons[id];
        this.loadPage(this.page?.page ?? 0);
        this.loadCounts();
      },
      error: () => (this.decisionError = true)
    });
  }
```

- [ ] **Step 4: Fix the remaining pre-existing tests**

Only `approve` and `reject` were changed to also call `loadCounts()` on success — `onTabChange` still calls only `loadPage`. So exactly the tests that exercise a *successful* `approve`/`reject` need a new `httpMock.expectOne('/api/admin/kyc/counts').flush(...)` immediately after their existing reload-flush line (order doesn't matter relative to the reload — the two are independent subscriptions):

- `'approves an entry and removes it from the pending list'`
- `'rejects an entry with a reason'`
- `'keeps each row\'s reject reason independent, so rejecting one leaves the other untouched'`

Add this line immediately after each of those three tests' existing reload-flush line:

```ts
    httpMock.expectOne('/api/admin/kyc/counts').flush({ pending: 0, verified: 0, rejected: 0 });
```

Every other existing test is unaffected and needs no change:
- `'reloads the queue when the status tab changes'` and `'shows a load error when the tab-change reload fails...'` — both go through `onTabChange`, which never calls `loadCounts`.
- `'shows a decision error when approve fails...'` and `'shows a decision error when reject fails...'` — the decide call itself fails, so the success branch (and its `loadCounts()` call) never runs.
- `'clears a stale decision error once a subsequent list load succeeds'` — its `approve('a1')` call fails (500), and its recovery step is `onTabChange`, not a successful `approve`/`reject` — neither branch calls `loadCounts`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npx ng test --include='**/kyc-queue.component.spec.ts' --watch=false`
Expected: PASS, all tests (10 pre-existing + 2 new).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/admin/kyc-queue/kyc-queue.component.ts \
        frontend/src/app/admin/kyc-queue/kyc-queue.component.spec.ts
git commit -m "feat(admin): add stat-tiles to KYC review queue"
```

---

### Task 6: Frontend — KYC queue pagination UI

**Files:**
- Modify: `frontend/src/app/admin/kyc-queue/kyc-queue.component.ts`
- Modify: `frontend/src/assets/i18n/en.json`
- Modify: `frontend/src/assets/i18n/hi.json`
- Test: `frontend/src/app/admin/kyc-queue/kyc-queue.component.spec.ts`

**Interfaces:**
- Consumes: existing `KycQueueComponent.page: KycPage | null`, `KycQueueComponent.goToPage(page: number): void` (unchanged).
- Produces: `KycQueueComponent.currentPage: number` (getter, 1-based), `KycQueueComponent.totalPages: number` (getter).

- [ ] **Step 1: Write the failing tests**

Add to `frontend/src/app/admin/kyc-queue/kyc-queue.component.spec.ts`, after the last existing `it(...)`:

```ts
  it('computes a 1-based current page and total pages from the loaded page', () => {
    expect(fixture.componentInstance.currentPage).toBe(1);
    expect(fixture.componentInstance.totalPages).toBe(1);
  });

  it('renders Prev/Next buttons and a page indicator, Prev disabled on page 1', () => {
    fixture.detectChanges();

    const prevButton: HTMLButtonElement = fixture.nativeElement.querySelector('.kyc-queue__pagination button:first-child');
    expect(prevButton.disabled).toBeTrue();

    const indicator: HTMLElement = fixture.nativeElement.querySelector('.kyc-queue__page-indicator');
    expect(indicator.textContent).toContain('1');
  });

  it('clicking Next loads the next page', () => {
    fixture.componentInstance.goToPage(1);

    const req = httpMock.expectOne('/api/admin/kyc?status=PENDING&page=1&size=20');
    req.flush({ entries: [], page: 1, size: 20, totalElements: 21 });

    expect(fixture.componentInstance.page?.page).toBe(1);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx ng test --include='**/kyc-queue.component.spec.ts' --watch=false`
Expected: FAIL — `currentPage`/`totalPages` don't exist, and `.kyc-queue__pagination` isn't in the template yet.

- [ ] **Step 3: Add pagination to the component**

In `frontend/src/app/admin/kyc-queue/kyc-queue.component.ts`, add this markup to the template, directly below the closing `</table>` tag:

```html
      <div class="kyc-queue__pagination" *ngIf="page">
        <button type="button" [disabled]="page.page === 0" (click)="goToPage(page.page - 1)">
          {{ 'admin.kycQueue.previousPageAction' | translate }}
        </button>
        <span class="kyc-queue__page-indicator">
          {{ 'admin.kycQueue.pageIndicator' | translate: { page: currentPage, totalPages: totalPages } }}
        </span>
        <button
          type="button"
          [disabled]="(page.page + 1) * page.size >= page.totalElements"
          (click)="goToPage(page.page + 1)"
        >
          {{ 'admin.kycQueue.nextPageAction' | translate }}
        </button>
      </div>
```

Add these two getters to the class, alongside the existing `get tabs()`:

```ts
  get currentPage(): number {
    return (this.page?.page ?? 0) + 1;
  }

  get totalPages(): number {
    if (!this.page || this.page.size === 0) {
      return 1;
    }
    return Math.max(1, Math.ceil(this.page.totalElements / this.page.size));
  }
```

Add these keys to `frontend/src/assets/i18n/en.json`, inside the `admin.kycQueue` object (alongside `decisionError`):

```json
      "previousPageAction": "Previous",
      "nextPageAction": "Next",
      "pageIndicator": "Page {{page}} of {{totalPages}}"
```

Add the same three keys, with the same English values, to `frontend/src/assets/i18n/hi.json`'s `admin.kycQueue` object (matching that file's existing untranslated-placeholder precedent for this section):

```json
      "previousPageAction": "Previous",
      "nextPageAction": "Next",
      "pageIndicator": "Page {{page}} of {{totalPages}}"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx ng test --include='**/kyc-queue.component.spec.ts' --watch=false`
Expected: PASS, all tests (12 pre-existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/admin/kyc-queue/kyc-queue.component.ts \
        frontend/src/app/admin/kyc-queue/kyc-queue.component.spec.ts \
        frontend/src/assets/i18n/en.json \
        frontend/src/assets/i18n/hi.json
git commit -m "feat(admin): add pagination UI to KYC review queue"
```

---

### Task 7: Frontend — KYC queue `editable-table` adoption

**Files:**
- Modify: `frontend/src/app/admin/kyc-queue/kyc-queue.component.ts`
- Modify: `frontend/src/assets/i18n/en.json`
- Modify: `frontend/src/assets/i18n/hi.json`
- Test: `frontend/src/app/admin/kyc-queue/kyc-queue.component.spec.ts`

**Interfaces:**
- Consumes: `EditableTableComponent` with `readOnly`, `actionTemplate` (Tasks 2–3); `KycQueueEntry` (existing model: `{ id, userId, name, kycStatus, joinedAt }`).
- Produces: `KycQueueComponent.kycColumns: EditableTableColumn[]` (getter), `KycQueueComponent.kycRows: Record<string, string>[]` (getter).

- [ ] **Step 1: Write the failing tests**

Add to `frontend/src/app/admin/kyc-queue/kyc-queue.component.spec.ts`, after the last existing `it(...)`:

```ts
  it('shows an empty-state row when the queue has no entries', () => {
    fixture.componentInstance.onTabChange('REJECTED');
    httpMock.expectOne('/api/admin/kyc?status=REJECTED&page=0&size=20')
      .flush({ entries: [], page: 0, size: 20, totalElements: 0 });
    fixture.detectChanges();

    const emptyCell: HTMLElement | null = fixture.nativeElement.querySelector('.editable-table__empty');
    expect(emptyCell?.textContent?.trim()).toBeTruthy();
  });

  it('only includes the actions column on the PENDING tab', () => {
    expect(fixture.componentInstance.kycColumns.some(c => c.key === 'actions')).toBeTrue();

    fixture.componentInstance.onTabChange('VERIFIED');
    httpMock.expectOne('/api/admin/kyc?status=VERIFIED&page=0&size=20')
      .flush({ entries: [], page: 0, size: 20, totalElements: 0 });

    expect(fixture.componentInstance.kycColumns.some(c => c.key === 'actions')).toBeFalse();
  });

  it('approve button in the rendered action cell calls approve with the row entry id', () => {
    fixture.detectChanges();
    const spy = spyOn(fixture.componentInstance, 'approve');

    const approveButton: HTMLButtonElement = fixture.nativeElement.querySelector('.kyc-queue__approve-action');
    approveButton.click();

    expect(spy).toHaveBeenCalledWith('a1');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx ng test --include='**/kyc-queue.component.spec.ts' --watch=false`
Expected: FAIL — `kycColumns` doesn't exist, `.editable-table__empty` and `.kyc-queue__approve-action` aren't in the rendered DOM yet.

- [ ] **Step 3: Adopt `editable-table`**

In `frontend/src/app/admin/kyc-queue/kyc-queue.component.ts`, add these imports:

```ts
import { EditableTableColumn, EditableTableComponent } from '../../shared/components/editable-table/editable-table.component';
import { DatePipe } from '@angular/common';
```

Add `EditableTableComponent` to the `@Component` decorator's `imports` array, and add a `providers` array (needed to inject `DatePipe` as a service rather than use it only as a template pipe):

```ts
  imports: [CommonModule, FormsModule, TranslateModule, TabBarComponent, StatTileComponent, EditableTableComponent],
  providers: [DatePipe],
```

Replace the entire `<table class="kyc-queue__table">...</table>` block with:

```html
      <app-editable-table
        [readOnly]="true"
        [columns]="kycColumns"
        [rows]="kycRows"
        [actionTemplate]="actionsTpl"
        [emptyStateLabel]="'admin.kycQueue.emptyState' | translate"
      ></app-editable-table>
      <ng-template #actionsTpl let-i="index">
        <button type="button" class="kyc-queue__approve-action" (click)="approve(page!.entries[i].id)">
          {{ 'admin.kycQueue.approveAction' | translate }}
        </button>
        <input
          type="text"
          [(ngModel)]="rejectReasons[page!.entries[i].id]"
          [placeholder]="'admin.kycQueue.rejectReasonPlaceholder' | translate"
        />
        <button type="button" (click)="reject(page!.entries[i].id)">
          {{ 'admin.kycQueue.rejectAction' | translate }}
        </button>
      </ng-template>
```

Add `private datePipe = inject(DatePipe);` to the class, alongside the other `inject()` calls:

```ts
  private datePipe = inject(DatePipe);
```

Add these two getters to the class:

```ts
  get kycColumns(): EditableTableColumn[] {
    const columns: EditableTableColumn[] = [
      { key: 'userId', label: this.translate.instant('admin.kycQueue.columnUserId'), type: 'text' },
      { key: 'name', label: this.translate.instant('admin.kycQueue.columnName'), type: 'text' },
      { key: 'joinedAt', label: this.translate.instant('admin.kycQueue.columnJoinedAt'), type: 'text' }
    ];
    if (this.activeStatus === 'PENDING') {
      columns.push({ key: 'actions', label: this.translate.instant('admin.kycQueue.columnActions'), type: 'action' });
    }
    return columns;
  }

  get kycRows(): Record<string, string>[] {
    return (this.page?.entries ?? []).map(entry => ({
      userId: entry.userId,
      name: entry.name,
      joinedAt: this.datePipe.transform(entry.joinedAt, 'medium') ?? entry.joinedAt
    }));
  }
```

Add this key to `frontend/src/assets/i18n/en.json`'s `admin.kycQueue` object:

```json
      "emptyState": "No entries in this status."
```

Add the same key, same English value, to `frontend/src/assets/i18n/hi.json`'s `admin.kycQueue` object.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx ng test --include='**/kyc-queue.component.spec.ts' --watch=false`
Expected: PASS, all tests (15 pre-existing + 3 new). If `'approves an entry and removes it from the pending list'` or similar tests fail because they no longer find rows via the old `<table>` structure, check whether they queried the DOM directly (they don't — they call `fixture.componentInstance.approve('a1')` directly) or asserted `fixture.componentInstance.page` state (they do) — those should be unaffected by the template swap.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/admin/kyc-queue/kyc-queue.component.ts \
        frontend/src/app/admin/kyc-queue/kyc-queue.component.spec.ts \
        frontend/src/assets/i18n/en.json \
        frontend/src/assets/i18n/hi.json
git commit -m "feat(admin): adopt editable-table on KYC review queue"
```

---

### Task 8: Frontend — Associate Directory filter bar

**Files:**
- Modify: `frontend/src/app/admin/associate-directory/associate-directory.component.ts`
- Modify: `frontend/src/assets/i18n/en.json`
- Modify: `frontend/src/assets/i18n/hi.json`
- Test: `frontend/src/app/admin/associate-directory/associate-directory.component.spec.ts`

**Interfaces:**
- Consumes: `AdminAssociateFilters { search?, rank?, kycStatus?, status?, joinedFrom?, joinedTo? }` (existing, unchanged); `AssociateDirectoryService.list(filters, page, size)` (existing, unchanged — already forwards arbitrary filter keys); `CompensationPlanService.getCurrent(): Observable<CompensationPlanResponse>` (existing, `frontend/src/app/setup/steps/compensation/compensation-plan.service.ts`); `RankOption { id: string; name: string }` (existing, `frontend/src/app/setup/models/compensation-plan.model.ts`).
- Produces: `AssociateDirectoryComponent.availableRanks: RankOption[]`; filter fields `rank`, `kycStatus`, `status`, `joinedFrom`, `joinedTo` on the component (all `string`, empty string = "no filter").

- [ ] **Step 1: Write the failing tests**

Add to `frontend/src/app/admin/associate-directory/associate-directory.component.spec.ts`, after the last existing `it(...)`:

Note: this file's `beforeEach` only flushes the directory list request. Once the component also fetches `availableRanks` on init, the shared `beforeEach` needs to flush that too. Replace the `beforeEach` block with:

```ts
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AssociateDirectoryComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(AssociateDirectoryComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    httpMock.expectOne('/api/company/compensation')
      .flush({ availableRanks: [{ id: 'r1', name: 'Sales Associate' }] });
    httpMock.expectOne('/api/admin/associates?page=0&size=20')
      .flush({ associates: [{ id: 'a1', userId: 'VP00001', name: 'Jane', rankName: 'Sales Associate', kycStatus: 'PENDING', status: 'ACTIVE', joinedAt: '2026-01-01T00:00:00Z', lastActiveAt: null }], page: 0, size: 20, totalElements: 1 });
  });
```

Add these new tests:

```ts
  it('loads available ranks for the rank filter dropdown', () => {
    expect(fixture.componentInstance.availableRanks).toEqual([{ id: 'r1', name: 'Sales Associate' }]);
  });

  it('changing the rank filter reloads page 0 with the rank param', () => {
    fixture.componentInstance.onRankChange('r1');

    const req = httpMock.expectOne(r => r.url === '/api/admin/associates' && r.params.get('rank') === 'r1' && r.params.get('page') === '0');
    req.flush({ associates: [], page: 0, size: 20, totalElements: 0 });
  });

  it('changing the KYC status filter reloads page 0 with the kycStatus param', () => {
    fixture.componentInstance.onKycStatusChange('VERIFIED');

    const req = httpMock.expectOne(r => r.url === '/api/admin/associates' && r.params.get('kycStatus') === 'VERIFIED' && r.params.get('page') === '0');
    req.flush({ associates: [], page: 0, size: 20, totalElements: 0 });
  });

  it('changing the status filter reloads page 0 with the status param', () => {
    fixture.componentInstance.onStatusChange('SUSPENDED');

    const req = httpMock.expectOne(r => r.url === '/api/admin/associates' && r.params.get('status') === 'SUSPENDED' && r.params.get('page') === '0');
    req.flush({ associates: [], page: 0, size: 20, totalElements: 0 });
  });

  it('changing joinedFrom/joinedTo reloads page 0 with both params', () => {
    fixture.componentInstance.onJoinedFromChange('2026-01-01');
    let req = httpMock.expectOne(r => r.url === '/api/admin/associates' && r.params.get('joinedFrom') === '2026-01-01');
    req.flush({ associates: [], page: 0, size: 20, totalElements: 0 });

    fixture.componentInstance.onJoinedToChange('2026-06-30');
    req = httpMock.expectOne(r => r.url === '/api/admin/associates' && r.params.get('joinedFrom') === '2026-01-01' && r.params.get('joinedTo') === '2026-06-30');
    req.flush({ associates: [], page: 0, size: 20, totalElements: 0 });
  });

  it('an empty filter value omits that param instead of sending an empty string', () => {
    fixture.componentInstance.onRankChange('');

    const req = httpMock.expectOne('/api/admin/associates?page=0&size=20');
    req.flush({ associates: [], page: 0, size: 20, totalElements: 0 });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx ng test --include='**/associate-directory.component.spec.ts' --watch=false`
Expected: FAIL — `availableRanks`, `onRankChange`, `onKycStatusChange`, `onStatusChange`, `onJoinedFromChange`, `onJoinedToChange` don't exist yet; the `beforeEach`'s new `/api/company/compensation` flush has no matching request yet (`httpMock.expectOne` throws if no such request was made).

- [ ] **Step 3: Add the filter bar**

In `frontend/src/app/admin/associate-directory/associate-directory.component.ts`, add these imports:

```ts
import { AdminAssociateFilters } from '../models/admin-associate-page.model';
import { CompensationPlanService } from '../../setup/steps/compensation/compensation-plan.service';
import { RankOption } from '../../setup/models/compensation-plan.model';
```

(`AdminAssociateFilters` may already be imported alongside `AdminAssociatePage` from the same file — check the existing import line and merge rather than duplicate.)

Replace the `<div class="associate-directory__filters">...</div>` block with:

```html
      <div class="associate-directory__filters">
        <input
          type="text"
          [placeholder]="'admin.associateDirectory.searchPlaceholder' | translate"
          (input)="onSearchInput($any($event.target).value)"
        />
        <label>
          {{ 'admin.associateDirectory.rankFilterLabel' | translate }}
          <select (change)="onRankChange($any($event.target).value)">
            <option value="">{{ 'admin.associateDirectory.rankFilterAllOption' | translate }}</option>
            <option *ngFor="let rank of availableRanks" [value]="rank.id">{{ rank.name }}</option>
          </select>
        </label>
        <label>
          {{ 'admin.associateDirectory.kycStatusFilterLabel' | translate }}
          <select (change)="onKycStatusChange($any($event.target).value)">
            <option value="">{{ 'admin.associateDirectory.kycStatusFilterAllOption' | translate }}</option>
            <option value="PENDING">PENDING</option>
            <option value="VERIFIED">VERIFIED</option>
            <option value="REJECTED">REJECTED</option>
          </select>
        </label>
        <label>
          {{ 'admin.associateDirectory.statusFilterLabel' | translate }}
          <select (change)="onStatusChange($any($event.target).value)">
            <option value="">{{ 'admin.associateDirectory.statusFilterAllOption' | translate }}</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="SUSPENDED">SUSPENDED</option>
          </select>
        </label>
        <label>
          {{ 'admin.associateDirectory.joinedFromLabel' | translate }}
          <input type="date" (change)="onJoinedFromChange($any($event.target).value)" />
        </label>
        <label>
          {{ 'admin.associateDirectory.joinedToLabel' | translate }}
          <input type="date" (change)="onJoinedToChange($any($event.target).value)" />
        </label>
      </div>
```

Add this field and this injected service to the class:

```ts
  private compensationPlanService = inject(CompensationPlanService);

  availableRanks: RankOption[] = [];
  private rank = '';
  private kycStatus = '';
  private status = '';
  private joinedFrom = '';
  private joinedTo = '';
```

Change `ngOnInit` to:

```ts
  ngOnInit(): void {
    this.compensationPlanService.getCurrent().subscribe(res => (this.availableRanks = res.availableRanks));
    this.loadPage(0);
  }
```

Add these methods, alongside `onSearchInput`:

```ts
  onRankChange(value: string): void {
    this.rank = value;
    this.loadPage(0);
  }

  onKycStatusChange(value: string): void {
    this.kycStatus = value;
    this.loadPage(0);
  }

  onStatusChange(value: string): void {
    this.status = value;
    this.loadPage(0);
  }

  onJoinedFromChange(value: string): void {
    this.joinedFrom = value;
    this.loadPage(0);
  }

  onJoinedToChange(value: string): void {
    this.joinedTo = value;
    this.loadPage(0);
  }
```

Replace the `private loadPage(page: number): void { ... }` method's body to build the full filter set:

```ts
  private loadPage(page: number): void {
    this.loadError = false;
    const filters: AdminAssociateFilters = {};
    if (this.search) filters.search = this.search;
    if (this.rank) filters.rank = this.rank;
    if (this.kycStatus) filters.kycStatus = this.kycStatus;
    if (this.status) filters.status = this.status;
    if (this.joinedFrom) filters.joinedFrom = this.joinedFrom;
    if (this.joinedTo) filters.joinedTo = this.joinedTo;
    this.associateDirectoryService.list(filters, page, PAGE_SIZE).subscribe({
      next: res => (this.page = res),
      error: () => (this.loadError = true)
    });
  }
```

Add these keys to `frontend/src/assets/i18n/en.json`'s `admin.associateDirectory` object (alongside `actionError`):

```json
      "rankFilterLabel": "Rank",
      "rankFilterAllOption": "All ranks",
      "kycStatusFilterLabel": "KYC Status",
      "kycStatusFilterAllOption": "All KYC statuses",
      "statusFilterLabel": "Status",
      "statusFilterAllOption": "All statuses",
      "joinedFromLabel": "Joined from",
      "joinedToLabel": "Joined to"
```

Add the same 8 keys, same English values, to `frontend/src/assets/i18n/hi.json`'s `admin.associateDirectory` object.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx ng test --include='**/associate-directory.component.spec.ts' --watch=false`
Expected: PASS, all tests (7 pre-existing + 6 new).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/admin/associate-directory/associate-directory.component.ts \
        frontend/src/app/admin/associate-directory/associate-directory.component.spec.ts \
        frontend/src/assets/i18n/en.json \
        frontend/src/assets/i18n/hi.json
git commit -m "feat(admin): add filter bar to Associate Directory"
```

---

### Task 9: Frontend — Associate Directory `editable-table` adoption

**Files:**
- Modify: `frontend/src/app/admin/associate-directory/associate-directory.component.ts`
- Modify: `frontend/src/assets/i18n/en.json`
- Modify: `frontend/src/assets/i18n/hi.json`
- Test: `frontend/src/app/admin/associate-directory/associate-directory.component.spec.ts`

**Interfaces:**
- Consumes: `EditableTableComponent` with `readOnly`, `rowClick` (Task 2); `AdminAssociateSummary` (existing: `{ id, userId, name, rankName, kycStatus, status, joinedAt, lastActiveAt }`).
- Produces: `AssociateDirectoryComponent.directoryColumns: EditableTableColumn[]` (getter), `AssociateDirectoryComponent.directoryRows: Record<string, string>[]` (getter).

- [ ] **Step 1: Write the failing tests**

Add to `frontend/src/app/admin/associate-directory/associate-directory.component.spec.ts`, after the last existing `it(...)`:

```ts
  it('shows an empty-state row when no associates match', () => {
    fixture.componentInstance.onRankChange('r1');
    httpMock.expectOne(r => r.url === '/api/admin/associates' && r.params.get('rank') === 'r1')
      .flush({ associates: [], page: 0, size: 20, totalElements: 0 });
    fixture.detectChanges();

    const emptyCell: HTMLElement | null = fixture.nativeElement.querySelector('.editable-table__empty');
    expect(emptyCell?.textContent?.trim()).toBeTruthy();
  });

  it('clicking a rendered row opens the detail panel for that associate', () => {
    fixture.detectChanges();

    const bodyRows = fixture.nativeElement.querySelectorAll('tbody tr');
    bodyRows[0].click();

    const req = httpMock.expectOne('/api/admin/associates/a1');
    req.flush({
      id: 'a1', userId: 'VP00001', name: 'Jane', email: null, phone: null, rankName: 'Sales Associate',
      kycStatus: 'PENDING', status: 'ACTIVE', joinedAt: '2026-01-01T00:00:00Z', lastActiveAt: null,
      sponsorId: null, sponsorUserId: null, parentId: null, parentUserId: null, position: null,
      directDownlineCount: 0, totalDownlineCount: 0, leftLegVolume: 0, rightLegVolume: 0
    });

    expect(fixture.componentInstance.selected?.userId).toBe('VP00001');
    expect(fixture.componentInstance.panelOpen).toBeTrue();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx ng test --include='**/associate-directory.component.spec.ts' --watch=false`
Expected: FAIL — `.editable-table__empty` doesn't exist in the rendered DOM yet (the hand-rolled `<table>` never shows an empty row), and clicking a `<tr>` doesn't call `selectAssociate` yet.

- [ ] **Step 3: Adopt `editable-table`**

In `frontend/src/app/admin/associate-directory/associate-directory.component.ts`, add this import:

```ts
import { EditableTableColumn, EditableTableComponent } from '../../shared/components/editable-table/editable-table.component';
```

Add `EditableTableComponent` to the `@Component` decorator's `imports` array:

```ts
  imports: [CommonModule, TranslateModule, SidePanelComponent, EditableTableComponent],
```

Replace the `<table class="associate-directory__table">...</table>` block with:

```html
      <app-editable-table
        [readOnly]="true"
        [columns]="directoryColumns"
        [rows]="directoryRows"
        [emptyStateLabel]="'admin.associateDirectory.emptyState' | translate"
        (rowClick)="selectAssociate(page!.associates[$event].id)"
      ></app-editable-table>
```

Add these two getters to the class, alongside the existing methods:

```ts
  get directoryColumns(): EditableTableColumn[] {
    return [
      { key: 'userId', label: this.translate.instant('admin.associateDirectory.columnUserId'), type: 'text' },
      { key: 'name', label: this.translate.instant('admin.associateDirectory.columnName'), type: 'text' },
      { key: 'rankName', label: this.translate.instant('admin.associateDirectory.columnRank'), type: 'text' },
      { key: 'kycStatus', label: this.translate.instant('admin.associateDirectory.columnKycStatus'), type: 'text' },
      { key: 'status', label: this.translate.instant('admin.associateDirectory.columnStatus'), type: 'text' }
    ];
  }

  get directoryRows(): Record<string, string>[] {
    return (this.page?.associates ?? []).map(a => ({
      userId: a.userId,
      name: a.name,
      rankName: a.rankName ?? '',
      kycStatus: a.kycStatus,
      status: a.status
    }));
  }
```

This introduces a new dependency on `TranslateService` for the column labels — check whether `AssociateDirectoryComponent` already injects it (`KycQueueComponent` does, `AssociateDirectoryComponent` as read in this plan's research did not). Add it:

```ts
  private translate = inject(TranslateService);
```

And add the import:

```ts
import { TranslateModule, TranslateService } from '@ngx-translate/core';
```

(replacing the existing `import { TranslateModule } from '@ngx-translate/core';` line).

Add this key to `frontend/src/assets/i18n/en.json`'s `admin.associateDirectory` object:

```json
      "emptyState": "No associates match these filters."
```

Add the same key, same English value, to `frontend/src/assets/i18n/hi.json`'s `admin.associateDirectory` object.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx ng test --include='**/associate-directory.component.spec.ts' --watch=false`
Expected: PASS, all tests (13 pre-existing + 2 new).

- [ ] **Step 5: Run the full frontend and backend test suites**

Run: `cd frontend && npx ng test --watch=false`
Run: `cd backend && mvn -q test`
Expected: PASS — no regressions in any other consumer of `editable-table`, `stat-tile`, or the admin models touched across this plan.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/admin/associate-directory/associate-directory.component.ts \
        frontend/src/app/admin/associate-directory/associate-directory.component.spec.ts \
        frontend/src/assets/i18n/en.json \
        frontend/src/assets/i18n/hi.json
git commit -m "feat(admin): adopt editable-table on Associate Directory"
```
