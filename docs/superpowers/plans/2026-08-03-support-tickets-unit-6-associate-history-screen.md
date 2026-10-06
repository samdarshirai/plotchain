# Support Tickets Unit 6: Associate "Support Ticket history" Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A view-only, lazy-loaded Associate screen at `/support-tickets` listing the caller's own support tickets (subject, description, status, admin response, dates) with a status filter and paging, from the merged `GET /api/associates/me/support-tickets` (unit 4). Frontend only; no backend change.

**Architecture:** One standalone `SupportTicketHistoryComponent` modelled on `PayoutHistoryComponent` (filter strip, `app-inline-banner`, local `<table>` in a `.card`, prev/next pager), minus the balance ribbon. It REUSES the shared support-ticket model/API service that unit 5 (merged) created, adding one `listMine` method to that service. Rich cells (subject+description, quoted reply with stamp) are written directly in the template with plain `{{ }}` bindings, so Angular escapes ticket text; there is no `innerHTML`, no escape helper and no `EditableTableComponent` change. Styling is a `.ticket-history` block (NOT `.support-tickets`: unit 5's admin screen owns that global class, see Reconciliation note) in `frontend/src/styles/_admin.scss` using only existing tokens.

**Tech Stack:** Angular 18.2 standalone, `@ngx-translate/core`, Karma/Jasmine with `HttpClientTestingModule`, SCSS in `_admin.scss`. No new libraries.

**Spec:** `docs/superpowers/specs/role-capability/2026-08-03-support-tickets-domain-design.md` (Flows "Associate views", Decision 5); unit row 6 in `docs/superpowers/plans/2026-08-03-support-tickets-units.md`. Design: `docs/design/associate_operational_screens/support_ticket_history/` (`DESIGN.md` read fully first; `code.html` + `screen.png` visual reference).

## Prerequisites (hard)

- Unit 4 merged (done): `GET /api/associates/me/support-tickets?status&page&size` returns `SupportTicketPageResponse(entries, page, size, totalElements)` with rows `SupportTicketResponse(id, associateId, associateUserId, associateName, subject, description, status, response, respondedAt, createdAt, updatedAt)`; sorted `createdAt` desc; `size` clamped 1..100; status is `OPEN | IN_PROGRESS | RESOLVED | CLOSED`.
- **Unit 5 is merged (master d37d08c).** The real shared files are listed under Reconciliation below; each edit in Tasks 1, 2 and 3 is written against that real text. Unit 5 did NOT touch `app.routes.ts` for associate routes, the associate nav, `app.component.spec.ts` or `_admin.scss`; it added only the settings child route `support-tickets` (admin), `admin.supportTickets.*` i18n, and `settings.sections.supportTickets`. Re-read the files after any rebase anyway.

## Global Constraints

- Description and admin response are shown in FULL (no clamp, no "show more").
- Nav label and screen title: "Support Tickets"; own entry in the associate nav.
- Status = plain uppercase mono text via a normal `'text'` column; NO colored pills (do not use `'badge'`).
- Live tokens only from `_tokens.scss` (gold/oxblood: `--brand-gradient`, `--status-danger`, `--surface-raised`, `--surface-card`, `--text-primary`, `--text-muted`, `--border-subtle`); no new hex, no new custom property.
- Route lazy-loaded via `loadComponent` (initial bundle `maximumError` is 1.2MB, warning 500kB; plot-booking units sat at the budget).
- View-only: no create/respond/edit control, no `<input>`; `ADMIN` token on this route is not specially handled (spec Resolved decision 1).
- Mobile cards under 768px (`max-width: 768px`, the siblings' breakpoint).
- Style budget: `anyComponentStyle` is 2kB warning / 4kB error (angular.json). This unit adds NO component styles (the component has no `styleUrls`; all CSS goes in global `_admin.scss`), so it cannot trip the budget. Do not add `styleUrls`/`styles` to the component. Unit 5 had to split its component SCSS in two to stay under 4kB; do not copy that pattern here.
- Class-name namespace is `ticket-history` / `ticket-history__*`. Unit 5's `AdminSupportTicketsComponent` uses `ViewEncapsulation.None`, so its `.support-tickets*` rules (`max-width:1480px`, `__table`, `__retry`, `__skeleton-row`, `__pager`, `__empty`, `__title`...) become GLOBAL once that lazy chunk loads and would restyle this screen. Never use `support-tickets` as a CSS class here.
- i18n: unit 5's keys live under `admin.supportTickets.*`; this unit's top-level `supportTickets.*` block does not collide (verified, no top-level `supportTickets` exists in en.json or hi.json).
- Accessibility patterns carried from unit 5's review fixes (b84b021): `aria-live` is never put on a container; only status/error text spans get `role="alert"`/`role="status"`; controls the user is focused on are NOT `disabled` while a request runs (a disabled element drops focus to `<body>`); a failed/slow older response must never overwrite a newer one (latest-request-wins `seq`).
- No e2e (deferred). Do NOT commit/edit the units tracking file from the implementer; the coordinator marks it merged.

## Review Focus

1. Ticket text containing `<`, `&`, `"` or `<script>`/`<img onerror>`: must show as literal text (Angular `{{ }}` binding escapes it; no `innerHTML` anywhere). Tested in Task 2 (hostile-text spec covers subject, description and response).
2. Multi-line description/response: line breaks preserved (`white-space: pre-wrap`), not collapsed. CSS, checked in Task 5.
3. Very long unbroken text (a URL): must wrap, not blow out the card on mobile. `overflow-wrap: anywhere`, checked in Task 5.
4. Filter change while on page 3: resets to page 0. Tested in Task 2.
5. Load failure: banner + Retry, table hidden, Retry re-requests the same page/filter. Tested in Task 2.

## Deviations from DESIGN.md (veto at review)

1. **Cell approach (user decision 2026-10-06):** a component-local `<table>` modelled on unit 5's (plain `{{ }}` bindings; quoted reply, stamp and awaiting state are template markup + CSS). Chosen over a new `'html'` column type on `EditableTableComponent` (which needed `[innerHTML]`, an `escapeHtml` util and sanitizer reliance). Cost: this unit supplies its own card/table/empty/mobile-card/pager CSS in `_admin.scss` instead of inheriting `.editable-table*` styles.
2. Single-sentence empty state: the design's "title + one line" empty block ships as one sentence per variant (no tickets at all / no tickets for this filter).
3. Responded date sits inside the quoted reply as a mono stamp (design intent); no fifth column (DESIGN open question 4 answered: keep as designed).
4. Skeleton rows (3 bars, 1.2s pulse, off under `prefers-reduced-motion`) are a plain `div` list shown instead of the table while loading, inside a `role="status"` wrapper with an sr-only "Loading" label. The filter `<select>` is never `disabled` during load (focus would be lost); Previous/Next use `aria-disabled` plus a guard in `goToPage` (same reason). Stale responses are dropped via a `seq` counter.
5. Decision record: the `'html'` column type was originally approved, then replaced by the local table above on 2026-10-06 (user). No edit to `EditableTableComponent` or its spec in this unit.

## File Structure

- Reused from unit 5 (real, verified): `frontend/src/app/support-tickets/support-ticket.model.ts` exports `SupportTicketStatus`, `SUPPORT_TICKET_STATUSES` (const array of the four statuses), `SupportTicket` (already has `response: string | null` and `respondedAt: string | null`; matches the backend record field for field, no model change needed), `SupportTicketPage { entries: SupportTicket[]; page; size; totalElements }`, plus admin-only `CreateSupportTicketRequest`, `RespondToSupportTicketRequest`, `TicketFilters`. `support-ticket.service.ts` exports `SupportTicketService` (`providedIn: 'root'`; methods `list(f: TicketFilters, page, size)`, `create`, `respond`; imports `HttpClient, HttpParams`). Spec file `support-ticket.service.spec.ts` exists (TestBed + `HttpClientTestingModule`, vars `s` and `http`).
- Modify: `frontend/src/app/support-tickets/support-ticket.service.ts` (+ `support-ticket.service.spec.ts`): append `listMine`; add `SupportTicketStatus` to the model import list.
- Create: `frontend/src/app/support-ticket-history/support-ticket-history.component.ts` (+ `.spec.ts`), inline template, no component stylesheet.
- NOT touched: `EditableTableComponent` and its spec; no `support-ticket-cells.util.ts`.
- Modify: `frontend/src/app/app.routes.ts` (+ `app.routes.spec.ts`), `frontend/src/app/associate-nav-items.model.ts`, `frontend/src/app/app.component.spec.ts`, `frontend/src/assets/i18n/en.json` and `hi.json`, `frontend/src/styles/_admin.scss` (append at END of file, after the `.bookings-emi` media query, line ~4852, to avoid conflict-prone mid-file insertion).

---

### Task 1: Reuse unit 5's model/service; append `listMine`

**Files:** `support-ticket.service.ts` and `support-ticket.service.spec.ts` only (model unchanged).

**Interfaces:**
- Consumes: unit 5's `SupportTicketService` (`providedIn: 'root'`, injects `HttpClient`), `SupportTicket`, `SupportTicketPage` (`entries: SupportTicket[]; page; size; totalElements`), `SupportTicketStatus = 'OPEN'|'IN_PROGRESS'|'RESOLVED'|'CLOSED'`.
- Produces: `listMine(status: SupportTicketStatus | '', page: number, size: number): Observable<SupportTicketPage>`.

- [ ] **Step 1: Confirm names (already verified against d37d08c; just re-check after any rebase).** Run `grep -n "SupportTicketPage\|respondedAt" frontend/src/app/support-tickets/support-ticket.model.ts`. Expected: both present; no model edit needed. Do NOT create a second model/service.

- [ ] **Step 2: Failing test** (append inside the existing `describe` in `support-ticket.service.spec.ts`; use its real variable names `s` for the service and `http` for the `HttpTestingController`, not `service`/`httpMock`):

```typescript
it('lists my tickets with page, size and optional status', () => {
  s.listMine('RESOLVED', 2, 20).subscribe(res => expect(res.totalElements).toBe(0));
  const req = http.expectOne(r => r.url === '/api/associates/me/support-tickets');
  expect(req.request.method).toBe('GET');
  expect(req.request.params.get('status')).toBe('RESOLVED');
  expect(req.request.params.get('page')).toBe('2');
  expect(req.request.params.get('size')).toBe('20');
  req.flush({ entries: [], page: 2, size: 20, totalElements: 0 });
});

it('omits status when listing all my tickets', () => {
  s.listMine('', 0, 20).subscribe();
  const req = http.expectOne(r => r.url === '/api/associates/me/support-tickets');
  expect(req.request.params.has('status')).toBeFalse();
  req.flush({ entries: [], page: 0, size: 20, totalElements: 0 });
});
```

- [ ] **Step 3:** Run `cd frontend && npx ng test --watch=false --include='**/support-ticket.service.spec.ts'`. Expected: FAIL (`listMine` not a function).

- [ ] **Step 4: Implement.** `HttpParams` is already imported. Change the model import to `import { CreateSupportTicketRequest, RespondToSupportTicketRequest, SupportTicket, SupportTicketPage, SupportTicketStatus, TicketFilters } from './support-ticket.model';` (add `SupportTicketStatus`), then append inside the class after `respond`:

```typescript
listMine(status: SupportTicketStatus | '', page: number, size: number): Observable<SupportTicketPage> {
  let params = new HttpParams().set('page', page).set('size', size);
  if (status) {
    params = params.set('status', status);
  }
  return this.http.get<SupportTicketPage>('/api/associates/me/support-tickets', { params });
}
```

- [ ] **Step 5:** Re-run Step 3 command. Expected: PASS. Commit: `feat(support-tickets): listMine on the shared ticket service`.

---

### Task 2: `SupportTicketHistoryComponent` (local table), i18n, styles

**Files:** Create `frontend/src/app/support-ticket-history/support-ticket-history.component.ts` and `.spec.ts` (inline template, NO `styleUrls`: all CSS is global in `_admin.scss`); modify `frontend/src/assets/i18n/en.json`, `hi.json`, `frontend/src/styles/_admin.scss`.

**Interfaces:**
- Consumes: `SupportTicketService.listMine`, `SupportTicketPage`, `SupportTicketStatus` (Task 1), `InlineBannerComponent`. No `EditableTableComponent`, no util file, no `innerHTML`: the table is a local `<table>` with plain `{{ }}` bindings.
- Produces: `SupportTicketHistoryComponent` (selector `app-support-ticket-history`, exported for the lazy route in Task 3) with `goToPage(n)`, `onStatusChange(v)`, `retry()`, `loading`, `loadError`, `page`, `status`.

- [ ] **Step 1: Failing spec.** Fix import paths to unit 5's real model location.

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SupportTicketHistoryComponent } from './support-ticket-history.component';

describe('SupportTicketHistoryComponent', () => {
  let fixture: ComponentFixture<SupportTicketHistoryComponent>;
  let httpMock: HttpTestingController;
  const URL = '/api/associates/me/support-tickets';

  const answered = {
    id: 't1', associateId: 'a1', associateUserId: 'U1', associateName: 'Asha',
    subject: 'Cannot see my invoice', description: 'Line one\nLine two',
    status: 'RESOLVED', response: 'Fixed it', respondedAt: '2026-01-07T00:00:00Z',
    createdAt: '2026-01-05T00:00:00Z', updatedAt: '2026-01-07T00:00:00Z'
  };
  const waiting = { ...answered, id: 't2', status: 'OPEN', response: null, respondedAt: null, subject: 'Other' };

  function flushPage(entries: unknown[] = [answered, waiting], total = entries.length, page = 0): void {
    httpMock
      .expectOne(r => r.url === URL && r.params.get('page') === String(page))
      .flush({ entries, page, size: 20, totalElements: total });
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SupportTicketHistoryComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(SupportTicketHistoryComponent);
    httpMock = TestBed.inject(HttpTestingController);
    const t = TestBed.inject(TranslateService);
    t.setDefaultLang('en');
    t.setTranslation('en', {
      supportTickets: {
        eyebrow: 'Associate · Support Tickets', title: 'Support Tickets',
        subtitle: 'Requests our team has logged for you.',
        loading: 'Loading support tickets', statusFilterLabel: 'Status', statusFilterAllOption: 'All statuses',
        status: { OPEN: 'Open', IN_PROGRESS: 'In progress', RESOLVED: 'Resolved', CLOSED: 'Closed' },
        columnSubject: 'Subject', columnStatus: 'Status', columnCreatedAt: 'Created', columnResponse: 'Admin response',
        awaitingReply: 'Awaiting a reply', loadError: "Couldn't load your support tickets.", retryAction: 'Retry',
        emptyState: 'No support tickets yet.', emptyStateFiltered: 'No tickets with this status.',
        previousPageAction: 'Previous', nextPageAction: 'Next', pageIndicator: 'Page {{page}} of {{totalPages}}'
      }
    });
    t.use('en');
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('loads page 0 on init with no status param', () => {
    const req = httpMock.expectOne(r => r.url === URL);
    expect(req.request.params.has('status')).toBeFalse();
    expect(req.request.params.get('size')).toBe('20');
    req.flush({ entries: [], page: 0, size: 20, totalElements: 0 });
  });

  it('shows skeleton rows (role=status, sr-only label) while loading and never disables the filter', () => {
    expect(fixture.nativeElement.querySelectorAll('.ticket-history__skeleton-row').length).toBe(3);
    expect(fixture.nativeElement.querySelector('[role="status"] .ticket-history__sr').textContent).toContain('Loading');
    expect(fixture.nativeElement.querySelector('select').disabled).toBeFalse(); // never disabled: keeps focus
    flushPage();
    expect(fixture.nativeElement.querySelector('.ticket-history__skeleton-row')).toBeNull();
  });

  it('renders subject, full multi-line description, status, and a quoted reply with stamp', () => {
    flushPage();
    const el: HTMLElement = fixture.nativeElement;
    const text = el.textContent;
    expect(text).toContain('Cannot see my invoice');
    expect(el.querySelector('.ticket-history__description')!.textContent).toBe('Line one\nLine two');
    expect(el.querySelector('.ticket-history__reply-text')!.textContent).toBe('Fixed it');
    expect(el.querySelector('.ticket-history__reply-stamp')!.textContent).toContain('2026');
    expect(text).toContain('Resolved');
    expect(el.querySelectorAll('.ticket-history__reply').length).toBe(1); // only the answered row has the rail
    expect(el.querySelector('.ticket-history__awaiting')!.textContent).toContain('Awaiting a reply');
    expect(el.querySelector('table.ticket-history__table')!.getAttribute('aria-label')).toBe('Support Tickets');
    expect(el.querySelectorAll('thead th[scope="col"]').length).toBe(4);
  });

  it('renders hostile ticket text (subject, description, response) as literal text, never markup', () => {
    flushPage([{
      ...answered,
      subject: '<img src=x onerror=alert(1)>',
      description: '<script>alert(1)</script> & "q"',
      response: '<b>bold</b> <img src=y onerror=alert(2)>'
    }]);
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('script')).toBeNull();
    expect(el.querySelector('td b')).toBeNull();
    expect(el.querySelector('.ticket-history__subject')!.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(el.querySelector('.ticket-history__description')!.textContent).toBe('<script>alert(1)</script> & "q"');
    expect(el.querySelector('.ticket-history__reply-text')!.textContent).toBe('<b>bold</b> <img src=y onerror=alert(2)>');
  });

  it('applying a status filter resets to page 0 and sends status', () => {
    flushPage([answered], 45);
    fixture.componentInstance.goToPage(2);
    flushPage([answered], 45, 2);
    fixture.componentInstance.onStatusChange('RESOLVED');
    const req = httpMock.expectOne(r => r.url === URL && r.params.get('status') === 'RESOLVED');
    expect(req.request.params.get('page')).toBe('0');
    req.flush({ entries: [], page: 0, size: 20, totalElements: 0 });
  });

  it('shows the filtered empty state when a filter matches nothing, plain empty otherwise', () => {
    flushPage([], 0);
    expect(fixture.nativeElement.querySelector('.ticket-history__empty').textContent).toContain('No support tickets yet.');
    expect(fixture.nativeElement.querySelector('table')).toBeNull();
    fixture.componentInstance.onStatusChange('CLOSED');
    httpMock.expectOne(r => r.params.get('status') === 'CLOSED').flush({ entries: [], page: 0, size: 20, totalElements: 0 });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.ticket-history__empty').textContent).toContain('No tickets with this status.');
  });

  it('on error shows a danger banner with Retry, hides the table, and Retry re-requests', () => {
    httpMock.expectOne(r => r.url === URL).flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-inline-banner .inline-banner--danger')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('table')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-inline-banner [role="alert"]')).toBeTruthy(); // alert on the text span only
    fixture.nativeElement.querySelector('.ticket-history__retry').click();
    flushPage();
    expect(fixture.nativeElement.querySelector('table.ticket-history__table')).toBeTruthy();
  });

  it('Retry after a failed later page re-requests THAT page and the current status', () => {
    flushPage([answered], 45);
    fixture.componentInstance.goToPage(2);
    httpMock.expectOne(r => r.params.get('page') === '2').flush({}, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    fixture.componentInstance.retry();
    flushPage([answered], 45, 2);
  });

  it('ignores a stale response that arrives after a newer request', () => {
    const first = httpMock.expectOne(r => r.url === URL); // initial load, left pending
    fixture.componentInstance.onStatusChange('CLOSED');
    const second = httpMock.expectOne(r => r.params.get('status') === 'CLOSED');
    second.flush({ entries: [waiting], page: 0, size: 20, totalElements: 1 });
    first.flush({ entries: [answered], page: 0, size: 20, totalElements: 1 });
    fixture.detectChanges();
    expect(fixture.componentInstance.page?.entries[0].id).toBe('t2');
  });

  it('pager buttons are aria-disabled, not disabled, and goToPage ignores out-of-range or in-flight calls', () => {
    flushPage([answered], 21);
    const prev: HTMLButtonElement = fixture.nativeElement.querySelector('.ticket-history__prev');
    expect(prev.disabled).toBeFalse();
    expect(prev.getAttribute('aria-disabled')).toBe('true');
    fixture.componentInstance.goToPage(-1); // no request: afterEach httpMock.verify() would fail otherwise
  });

  it('Next loads the next page', () => {
    flushPage([answered], 21);
    fixture.componentInstance.goToPage(1);
    flushPage([answered], 21, 1);
    expect(fixture.componentInstance.page?.page).toBe(1);
  });

  it('is view-only: no inputs and no buttons in the table', () => {
    flushPage();
    expect(fixture.nativeElement.querySelectorAll('input').length).toBe(0);
    expect(fixture.nativeElement.querySelectorAll('table button').length).toBe(0);
  });
});
```

- [ ] **Step 2:** Run `--include='**/support-ticket-history.component.spec.ts'`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement the component.** Mirrors unit 5's `AdminSupportTicketsComponent` table (`<table aria-label>`, `th scope="col"`, per-`td` `data-label`, `*ngIf` states, skeleton `role="status"`) but with no row selection, no inline controls and no `ViewEncapsulation.None`/`styleUrls`. Every ticket string is bound with `{{ }}` (Angular escapes it), so no escape helper or `innerHTML` exists anywhere.

```typescript
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SupportTicketService } from '../support-tickets/support-ticket.service';
import { SUPPORT_TICKET_STATUSES, SupportTicket, SupportTicketPage, SupportTicketStatus } from '../support-tickets/support-ticket.model';
import { InlineBannerComponent } from '../shared/components/inline-banner/inline-banner.component';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-support-ticket-history',
  standalone: true,
  imports: [CommonModule, TranslateModule, InlineBannerComponent],
  template: `
    <div class="ticket-history">
      <div class="ticket-history__intro">
        <span class="ticket-history__eyebrow">{{ 'supportTickets.eyebrow' | translate }}</span>
        <h1 class="ticket-history__title">{{ 'supportTickets.title' | translate }}</h1>
        <p class="ticket-history__subtitle">{{ 'supportTickets.subtitle' | translate }}</p>
      </div>

      <div class="ticket-history__filters">
        <div class="ticket-history__filter-field">
          <label>
            {{ 'supportTickets.statusFilterLabel' | translate }}
            <select (change)="onStatusChange($any($event.target).value)">
              <option value="">{{ 'supportTickets.statusFilterAllOption' | translate }}</option>
              <option *ngFor="let s of statuses" [value]="s">{{ 'supportTickets.status.' + s | translate }}</option>
            </select>
          </label>
        </div>
      </div>

      <app-inline-banner *ngIf="loadError" tone="danger" class="ticket-history__load-error">
        <span role="alert">{{ 'supportTickets.loadError' | translate }}</span>
        <button type="button" class="ticket-history__retry" (click)="retry()">{{ 'supportTickets.retryAction' | translate }}</button>
      </app-inline-banner>

      <div class="card" *ngIf="loading" [attr.aria-busy]="true">
        <div role="status">
          <span class="ticket-history__sr">{{ 'supportTickets.loading' | translate }}</span>
          <div class="ticket-history__skeleton-row" *ngFor="let _ of [1, 2, 3]"></div>
        </div>
      </div>

      <div class="card" *ngIf="!loading && !loadError && page">
        <p class="ticket-history__empty" *ngIf="!page.entries.length">
          {{ (status ? 'supportTickets.emptyStateFiltered' : 'supportTickets.emptyState') | translate }}
        </p>
        <table class="ticket-history__table" *ngIf="page.entries.length" [attr.aria-label]="'supportTickets.title' | translate">
          <thead>
            <tr>
              <th scope="col">{{ 'supportTickets.columnSubject' | translate }}</th>
              <th scope="col">{{ 'supportTickets.columnStatus' | translate }}</th>
              <th scope="col">{{ 'supportTickets.columnCreatedAt' | translate }}</th>
              <th scope="col">{{ 'supportTickets.columnResponse' | translate }}</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let t of page.entries; trackBy: trackById">
              <td><span class="ticket-history__subject">{{ t.subject }}</span><span class="ticket-history__description">{{ t.description }}</span></td>
              <td [attr.data-label]="'supportTickets.columnStatus' | translate">{{ 'supportTickets.status.' + t.status | translate }}</td>
              <td [attr.data-label]="'supportTickets.columnCreatedAt' | translate">{{ t.createdAt | date: 'medium' }}</td>
              <td [attr.data-label]="'supportTickets.columnResponse' | translate">
                <span class="ticket-history__reply" *ngIf="t.response?.trim(); else awaiting"><span class="ticket-history__reply-text">{{ t.response }}</span><span class="ticket-history__reply-stamp" *ngIf="t.respondedAt">{{ t.respondedAt | date: 'medium' }}</span></span>
                <ng-template #awaiting><span class="ticket-history__awaiting">{{ 'supportTickets.awaitingReply' | translate }}</span></ng-template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="ticket-history__pagination" *ngIf="page && !loadError">
        <span class="ticket-history__page-indicator">
          {{ 'supportTickets.pageIndicator' | translate: { page: currentPage, totalPages: totalPages } }}
        </span>
        <button type="button" class="brand-button brand-button--secondary ticket-history__prev" [attr.aria-disabled]="page.page === 0 ? 'true' : null" (click)="goToPage(page.page - 1)">
          {{ 'supportTickets.previousPageAction' | translate }}
        </button>
        <button type="button" class="brand-button brand-button--secondary ticket-history__next" [attr.aria-disabled]="(page.page + 1) * page.size >= page.totalElements ? 'true' : null" (click)="goToPage(page.page + 1)">
          {{ 'supportTickets.nextPageAction' | translate }}
        </button>
      </div>
    </div>
  `
})
export class SupportTicketHistoryComponent implements OnInit, OnDestroy {
  private service = inject(SupportTicketService);
  private destroyed$ = new Subject<void>();
  private seq = 0; // latest-request-wins: a slow older response never overwrites a newer one
  private lastPage = 0; // last ATTEMPTED page, so Retry re-requests the page that failed

  readonly statuses = SUPPORT_TICKET_STATUSES;
  page: SupportTicketPage | null = null;
  loading = false;
  loadError = false;
  status: SupportTicketStatus | '' = '';

  get currentPage(): number {
    return (this.page?.page ?? 0) + 1;
  }

  get totalPages(): number {
    if (!this.page || this.page.size === 0) {
      return 1;
    }
    return Math.max(1, Math.ceil(this.page.totalElements / this.page.size));
  }

  trackById = (_: number, t: SupportTicket) => t.id;

  ngOnInit(): void {
    this.loadPage(0);
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  onStatusChange(value: string): void {
    this.status = value as SupportTicketStatus | '';
    this.loadPage(0);
  }

  goToPage(page: number): void {
    if (page < 0 || (this.page && page * this.page.size >= Math.max(this.page.totalElements, 1))) {
      return; // aria-disabled buttons stay clickable (focus-safe), so enforce bounds here
    }
    this.loadPage(page);
  }

  retry(): void {
    this.loadPage(this.lastPage);
  }

  private loadPage(page: number): void {
    const mine = ++this.seq;
    this.lastPage = page;
    this.loading = true;
    this.loadError = false;
    this.service.listMine(this.status, page, PAGE_SIZE).pipe(takeUntil(this.destroyed$)).subscribe({
      next: res => {
        if (mine !== this.seq) { return; }
        this.page = res;
        this.loading = false;
      },
      error: () => {
        if (mine !== this.seq) { return; }
        this.loading = false;
        this.loadError = true;
      }
    });
  }
}
```

Notes: keep each `<td>`'s spans on one line with no whitespace between them (the description test asserts exact `textContent`, and `pre-wrap` would render stray template whitespace). The first `<td>` has no `data-label` on purpose (the subject leads, unlabeled, on mobile). `retry()` uses `lastPage`, so a failed page-2 load retries page 2 and a failed first load retries page 0. Unit 5's `AdminSupportTicketsComponent.load()` uses the same `seq` guard.

- [ ] **Step 4: i18n.** Add a `supportTickets` block to `en.json` (keys exactly as in the spec's `setTranslation`, plus `loading: "Loading support tickets"` (sr-only skeleton label), `emptyState: "No support tickets yet. When our team logs a request for you, it will appear here with any reply."`, `emptyStateFiltered: "No tickets with this status. Try another status, or choose All statuses."`, `loadError: "Couldn't load your support tickets. Check your connection and try again."`) and `"supportTickets": "Support Tickets"` under the top-level `nav` block: en.json after `"payoutHistory": "Payout History",` (line ~542, before `"categories"`), hi.json after `"payoutHistory": "भुगतान इतिहास",` (line ~506). Place the new top-level `supportTickets` block right after the top-level `payoutHistory` block (en.json line ~499, hi.json ~464). Do not touch unit 5's `admin.supportTickets` (en.json ~851) or `admin.settings...supportTickets` (en ~1535, hi ~1439) entries; hi.json's `admin.supportTickets` block is English text, same convention. Add the same keys to `hi.json` (English text for the block like siblings do; Hindi only for `nav.supportTickets`: "सहायता टिकट" (same wording unit 5 used for the admin section label)). Run `node -e "JSON.parse(require('fs').readFileSync('frontend/src/assets/i18n/en.json'));JSON.parse(require('fs').readFileSync('frontend/src/assets/i18n/hi.json'))"`. Expected: no output.

- [ ] **Step 5: Styles.** Append to the END of `_admin.scss` (currently ends with `@media (max-width: 768px) { .bookings-emi { padding-inline: 1rem; } }`, line 4852). The placeholders `%admin-screen-title`, `%admin-screen-card`, `%admin-screen-table-head`, `%admin-screen-table-cell`, `%admin-screen-pagination`, `%admin-screen-page-indicator`, `%admin-screen-pagination-secondary-button` all exist (lines 13-82); `%admin-screen-subtitle`/`-eyebrow` exist too. Reuse the same placeholder extends and breakpoints as payout-history; only existing tokens. These rules supply everything `EditableTableComponent` would have (card chrome, header/cell padding, empty block, mobile stacked cards, pager); nothing is inherited from `.editable-table*`. Global base `table/th/td` rules in `_tables.scss` still apply underneath and the `.ticket-history__table` rules override width, collapse, header alignment and cell padding. Where it lives and budget: `_admin.scss` is pulled into the global `styles.scss` via `@use 'styles/admin'`, so it is NOT subject to the `anyComponentStyle` 2kB warn / 4kB error per-component budget (the component has no `styleUrls`). It only adds to the initial bundle (500kB warn / 1.2MB error); this block is roughly 2.5kB of source, negligible. If CSS ever has to move into a component file, keep it under 2kB (4kB is an error), as unit 5 did by splitting into two files.

```scss
// ---- Support Tickets (associate, view-only) ----
.ticket-history {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  max-width: 1040px;
  margin: 0 auto;
  padding: 1.5rem 2rem;
  font-family: 'Inter', var(--font-sans);
}
.ticket-history__intro { display: flex; flex-direction: column; gap: 0.25rem; }
.ticket-history__eyebrow {
  font-family: var(--font-mono); font-size: 0.6875rem; letter-spacing: 0.04em;
  text-transform: uppercase; color: var(--text-muted);
}
.ticket-history__title { @extend %admin-screen-title; margin: 0; }
.ticket-history__subtitle { margin: 0; font-size: 0.875rem; color: var(--text-muted); }

.ticket-history__filters {
  display: flex; padding: 1.25rem 1.5rem; background: var(--surface-raised); border-radius: 16px;
}
.ticket-history__filter-field {
  display: flex; flex-direction: column; min-width: 220px; max-width: 280px; flex: 1 1 220px;
  label {
    margin: 0; display: flex; flex-direction: column; gap: 0.375rem;
    font-family: var(--font-mono); font-size: 0.6875rem; font-weight: 500;
    letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-muted);
  }
  select { background: var(--surface-card); }
}
.ticket-history__load-error { margin: 0; }
.ticket-history__retry {
  margin-left: 0.75rem; min-height: 44px; background: none; border: 0; padding: 0;
  text-decoration: underline; cursor: pointer; color: inherit; font-weight: 600; // same link-style retry as unit 5's banner
}
.ticket-history__sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.ticket-history__pagination [aria-disabled='true'] { opacity: 0.5; cursor: not-allowed; }

.ticket-history .card { @extend %admin-screen-card; overflow-x: auto; }
.ticket-history__table { width: 100%; margin: 0; min-width: 760px; border-collapse: collapse; }
.ticket-history__table thead th { @extend %admin-screen-table-head; text-align: left; white-space: nowrap; }
.ticket-history__table tbody td { @extend %admin-screen-table-cell; vertical-align: top; }
.ticket-history__table tbody tr:last-child td { border-bottom: none; }
.ticket-history__table td:nth-child(1) { width: 34%; }
.ticket-history__table td:nth-child(2) {
  font-family: var(--font-mono); font-size: 0.75rem; font-weight: 600; letter-spacing: 0.04em;
  text-transform: uppercase; color: var(--text-muted); white-space: nowrap;
}
.ticket-history__table td:nth-child(3) {
  font-variant-numeric: tabular-nums; font-size: 0.8125rem; color: var(--text-muted); white-space: nowrap;
}
.ticket-history__empty { margin: 0; padding: 3rem 1.5rem; text-align: center; color: var(--text-muted); }

.ticket-history__subject {
  display: block; font-family: var(--font-display); font-weight: 600; color: var(--text-primary);
  overflow-wrap: anywhere;
}
.ticket-history__description {
  display: block; margin-top: 0.25rem; font-size: 0.8125rem; color: var(--text-muted);
  white-space: pre-wrap; overflow-wrap: anywhere;
}
// Quoted reply: 3px brand-gradient rail (same rail as the Payout History balance ribbon).
.ticket-history__reply {
  display: block; position: relative; padding-left: 0.875rem;
  &::before {
    content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
    border-radius: 2px; background: var(--brand-gradient);
  }
}
.ticket-history__reply-text {
  display: block; font-size: 0.8125rem; color: var(--text-primary);
  white-space: pre-wrap; overflow-wrap: anywhere;
}
.ticket-history__reply-stamp {
  display: block; margin-top: 0.375rem; font-family: var(--font-mono); font-size: 0.6875rem;
  letter-spacing: 0.04em; color: var(--text-muted);
}
.ticket-history__awaiting { font-size: 0.8125rem; font-style: italic; color: var(--text-muted); }

.ticket-history__skeleton-row {
  height: 3.5rem; margin: 0.75rem 1.25rem; border-radius: 8px; background: var(--surface-raised);
  animation: ticket-history-pulse 1.2s ease-in-out infinite;
}
@keyframes ticket-history-pulse { 50% { opacity: 0.45; } }
@media (prefers-reduced-motion: reduce) { .ticket-history__skeleton-row { animation: none; } }

.ticket-history__pagination { @extend %admin-screen-pagination; }
.ticket-history__page-indicator { @extend %admin-screen-page-indicator; }
.ticket-history__pagination .brand-button--secondary { @extend %admin-screen-pagination-secondary-button; }

@media (max-width: 768px) {
  .ticket-history { padding: 1rem; }
  .ticket-history__filters { flex-direction: column; align-items: stretch; }
  .ticket-history__filter-field { min-width: 0; max-width: none; }
  .ticket-history__table { table-layout: fixed; width: 100%; min-width: 0; }
  .ticket-history__table thead { display: none; }
  .ticket-history__table tbody tr {
    display: block; padding: 1rem 1.25rem; border-bottom: 1px solid var(--border-subtle);
  }
  .ticket-history__table tbody td {
    display: flex; align-items: baseline; justify-content: space-between; gap: 1rem;
    width: auto; padding: 0.375rem 0; border-bottom: none; text-align: right; min-width: 0;
    white-space: normal; overflow-wrap: anywhere;
    > * { min-width: 0; }
    &::before {
      content: attr(data-label); flex: 0 0 auto; font-family: var(--font-mono); font-size: 0.6875rem;
      font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-muted);
      text-align: left;
    }
  }
  // Subject: full-width, unlabeled, left-aligned lead.
  .ticket-history__table tbody td:nth-child(1) { display: block; text-align: left; }
  .ticket-history__table tbody td:nth-child(1)::before { display: none; }
  .ticket-history__subject { font-size: 1.0625rem; }
  // Admin response: full-width labeled block, left-aligned, rail kept.
  .ticket-history__table tbody td:nth-child(4) { display: block; text-align: left; }
  .ticket-history__table tbody td:nth-child(4)::before { display: block; margin-bottom: 0.375rem; }
  .ticket-history__pagination .brand-button--secondary { min-height: 44px; }
}
```

Note: the `.card` rule above also hits the skeleton card (intended). `td:nth-child(1) { width: 34% }` applies only on desktop (the media query resets `width: auto`).

- [ ] **Step 6:** Run `--include='**/support-ticket-history.component.spec.ts'`, then `npx ng build` is deferred to Task 4. Expected: all PASS. Commit: `feat(support-tickets): associate ticket history component`.

---

### Task 3: Lazy route + associate nav entry

**Files:** `frontend/src/app/app.routes.ts`, `app.routes.spec.ts`, `associate-nav-items.model.ts`, `app.component.spec.ts`. (Shared with unit 5 / announcements: re-read post-rebase.)

- [ ] **Step 1: Failing route spec** (in `app.routes.spec.ts`, insert right after the existing `'guards the plot-bookings route with authGuard and associateOnlyGuard'` test, which has the lazy-route precedent; `routes`, `authGuard`, `associateOnlyGuard` are already imported there. The existing settings-child test `'has a lazy support-tickets child...'` (line ~200) is a different route and stays untouched; this new test finds the TOP-LEVEL `support-tickets` path, which does not collide with the settings child because that one is nested under `settings`):

```typescript
it('guards the support-tickets route with authGuard and associateOnlyGuard and lazy-loads it', () => {
  const route = routes.find(r => r.path === 'support-tickets');
  expect(route).toBeTruthy();
  expect(route!.canActivate).toContain(authGuard);
  expect(route!.canActivate).toContain(associateOnlyGuard);
  expect(route!.loadComponent).toBeDefined();
  expect(route!.component).toBeUndefined();
});
```

Run `--include='**/app.routes.spec.ts'`. Expected: FAIL.

- [ ] **Step 2: Route.** In `app.routes.ts`, insert immediately after this real line (line 69) and before the `change-password` line; NO static import at the top:

`  { path: 'payout-history', component: PayoutHistoryComponent, canActivate: [authGuard, associateOnlyGuard] },`

Insert (same 2-space indent, mirrors the `plot-bookings` line):

```typescript
{ path: 'support-tickets', loadComponent: () => import('./support-ticket-history/support-ticket-history.component').then(m => m.SupportTicketHistoryComponent), canActivate: [authGuard, associateOnlyGuard] },
```

- [ ] **Step 3: Nav.** In `associate-nav-items.model.ts`, the last array entry is currently `  { key: 'payoutHistory', labelKey: 'nav.payoutHistory', icon: 'payments', path: '/payout-history' }` with no trailing comma: add a comma to it and append after it (verify `support_agent` renders in the real app in Task 5; fall back to `confirmation_number`-style existing glyph if it shows as text):

```typescript
{ key: 'supportTickets', labelKey: 'nav.supportTickets', icon: 'support_agent', path: '/support-tickets' }
```

In `app.component.spec.ts`: add `'nav.supportTickets': 'Support Tickets',` after `'nav.payoutHistory': 'Payout History',` (line 133), AND extend the exact-order assertion at lines ~141-143 from `... 'Income Statement', 'Payout History'` to `... 'Income Statement', 'Payout History', 'Support Tickets'` (it uses `toEqual` on the full list, so it WILL fail otherwise). No other spec references `ASSOCIATE_NAV_ITEMS`.

- [ ] **Step 4:** Run `--include='**/app.routes.spec.ts' --include='**/app.component.spec.ts'`. Expected: PASS. Commit: `feat(support-tickets): associate route and nav entry`.

---

### Task 4: Full suite and bundle budget

- [ ] **Step 1:** `cd frontend && npx ng test --watch=false`. Expected: all PASS.
- [ ] **Step 2:** `cd frontend && npx ng build`. Expected: no budget error (initial 500kB warn / 1.2MB error; anyComponentStyle 2kB warn / 4kB error, which this unit does not affect because it adds no component styles); no NEW warnings beyond those on master before this unit (run `npx ng build` on master first and compare); the component appears as a separate lazy chunk, initial total not increased beyond the pre-change figure by more than the nav/i18n bytes. Record the initial-bundle number in the commit/report.
- [ ] **Step 3:** If any failure, fix in the owning task's files and re-run; commit only if fixes were needed.

---

### Task 5: Real-app verification (desktop + mobile)

Follow the `run` skill (`.claude/skills/run/SKILL.md`): `docker compose up -d db`; `cd backend && ./mvnw spring-boot:run` (wait for `Started PlotchainApplication`); `cd frontend && npm start`; open `http://localhost:4200`. Drive with claude-in-chrome.

- [ ] **Step 1: Seed data via the real admin screen (unit 5).** An associate cannot create tickets. Sign in as admin, open Settings > Support Tickets (`/settings/support-tickets`, unit 5's "Log a ticket" button), and log at least: (a) a short ticket left OPEN; (b) a ticket with a multi-line description; (c) a ticket whose subject/description contain `<b>x</b> & "quotes"` and a 200-character unbroken string; (d) a ticket responded to and set RESOLVED with a multi-line response; (e) one IN_PROGRESS and one CLOSED (with response); plus enough extra tickets (21+) to get a second page, for one associate. Log one ticket for a second associate to prove isolation. If unit 5 isn't deployed, fall back to `POST /api/admin/support-tickets` with an admin token (curl).
- [ ] **Step 2: Desktop** (sign in as the first associate): "Support Tickets" is in the sidebar with a rendered icon and active highlight; the page loads; compare to `screen.png`. Check: newest first; the hostile ticket shows literal `<b>x</b> & "quotes"`; descriptions and responses are in full with line breaks; unanswered rows show italic "Awaiting a reply" with no rail, answered rows show the gold/oxblood rail and mono stamp; status is plain mono text, no pills; Status filter works and resets to page 1; Next/Previous work; second associate's tickets never appear; no inputs/buttons other than filter and pager.
- [ ] **Step 3: Empty/error/loading:** sign in as an associate with no tickets (empty message); filter to a status with no tickets (filtered message); stop the backend (or block `/api/associates/me/support-tickets` in devtools) and reload: banner + Retry, table hidden, Retry works after restart; throttle network to see 3 skeleton rows; the filter stays enabled and keeps keyboard focus while loading.
- [ ] **Step 4: Mobile (never verified in the design):** resize to 375px and 767px (chrome `resize_window`). Check: no horizontal page scroll; header row hidden; each ticket is a stacked card; subject + description lead full width, unlabeled; Status and Created are `label: value` rows; Admin response is a full-width labeled block with its rail; the long unbroken string wraps; filter full width; pager buttons at least 44px tall; focus ring visible on the select and buttons with keyboard. At 769px confirm the desktop table returns. Fix any defect in `_admin.scss`, re-run Task 4 steps 1-2 and note the fix.
- [ ] **Step 5:** Navigate directly to `/support-tickets` as admin: page renders (empty or whatever the admin has as an associate: none), no crash (spec: ADMIN token not specially handled; `associateOnlyGuard` may redirect: record actual behavior, it is acceptable either way).
- [ ] **Step 6:** Check the browser console: no errors or warnings. (There is no `innerHTML` in this screen, so any "sanitizing HTML" warning would be a bug; investigate.)
- [ ] **Step 6b: Style bleed check.** Unit 5's `.support-tickets*` rules are global once its lazy chunk loads, and this unit's `.ticket-history*` rules are global once `styles.scss` loads (always). Without a full reload, in one SPA session as an admin who also has an associate-visible route (or by navigating in-app after unit 5's chunk has loaded): open `/settings/support-tickets`, then navigate in-app to `/support-tickets` (and back). Neither screen's layout (max-width, table, skeleton, pager, retry) may change. Also grep the built CSS/`_admin.scss` that this unit adds no selector beginning with `.support-tickets`. This verifies the `.ticket-history` namespace and, since there is no `EditableTableComponent` here, that no `.editable-table*` rule is relied on.
- [ ] **Step 7:** Stop the dev servers. Do NOT edit the units tracking file; report results to the coordinator.

---

## Self-Review

- **Spec/units-row coverage:** view-only paged list with status filter (Task 2); empty state, no write affordance (Task 2 spec "view-only", empty tests); route + nav (Task 3); responsive (Task 2 SCSS, Task 5); specs, no e2e (all tasks); design folder exists (read first).
- **Placeholders:** none; the only conditional is unit 5's real file names/paths, none remain; unit 5's real names are now written in directly.
- **Type consistency:** `listMine(status: SupportTicketStatus | '', page, size)` is called as `listMine(this.status, page, PAGE_SIZE)`; page field is `entries` everywhere; template class names (`ticket-history__subject/description/reply/reply-text/reply-stamp/awaiting/empty/table/prev/next/retry/sr/skeleton-row`) match the spec selectors and the SCSS; `SUPPORT_TICKET_STATUSES` and `SupportTicket` come from the real model.
- **Known risks:** this unit owns its table/card/mobile/pager CSS (nothing inherited from `.editable-table*`), so Task 5 Step 4 (mobile) is the real check. `support_agent` glyph availability is verified only in the real app (Task 5).

## Coordinator decisions (user-approved 2026-10-06)

- Shared file paths reconciled with unit 5: flat `frontend/src/app/support-tickets/support-ticket.model.ts` and `support-ticket.service.ts`; unit 6 appends only `listMine`.
- Nav icon `support_agent` (verify renders); `hi.json` English except nav label.
- User chose a component-local hand-built `<table>` (like unit 5) over the previously approved `'html'` column type on `EditableTableComponent`, 2026-10-06. No `EditableTableComponent` change, no escape util, no `innerHTML`.

## Reconciled against master d37d08c

Plan reconciled against the merged unit 5 code (2026-10-06). What changed:

1. **Shared files confirmed real:** `support-tickets/support-ticket.model.ts` and `support-ticket.service.ts` exist as assumed. `SupportTicket` already has `response`/`respondedAt` (no model change); `SupportTicketPage` is `{ entries, page, size, totalElements }`; model also exports `SUPPORT_TICKET_STATUSES` (now reused instead of a local array). Service has `list/create/respond`; `HttpParams` already imported but `SupportTicketStatus` is NOT in its model import, so Task 1 now says to add it. Service spec variables are `s`/`http` (snippets updated).
2. **CSS namespace collision (real defect found):** unit 5 uses `.support-tickets*` with `ViewEncapsulation.None`, so its rules are global. Unit 6 renamed to `.ticket-history*` everywhere (component, SCSS, tests). Added a style-bleed check to Task 5.
3. **Unit 5 did not touch** `app.routes.ts` (associate side), associate nav, `app.component.spec.ts`, or `_admin.scss`; its only route is the admin settings child. Prerequisite section rewritten; routes/nav/spec insertion points now quote the real text. The `app.component.spec.ts` exact-order `toEqual` list at lines ~141-143 must also gain 'Support Tickets' (was missing from the old plan).
4. **i18n:** unit 5's keys are `admin.supportTickets.*` (+ `admin.settings` section label); no collision with the top-level `supportTickets` block. Exact insertion anchors given; added `supportTickets.loading` key.
5. **Unit 5 review lessons applied (b84b021 + earlier):** `role="alert"` on the error text span only (no aria-live container); skeleton in `role="status"` with sr-only label and `aria-busy`; filter select no longer `disabled` during load; pager uses `aria-disabled` plus guard; latest-request-wins `seq`; retry re-requests the last attempted page (old plan retried the stale current page); retry styled as unit 5's link-style button; `takeUntil` on the request. New tests cover stale-response, retry-failed-page and aria-disabled pager.
6. **Style budget:** real limits are anyComponentStyle 2kB warn/4kB error and initial 500kB/1.2MB; this unit adds no component styles (global `_admin.scss` only), so no per-component budget risk. `_admin.scss` append point changed to end of file.
7. **Table approach (superseded, user decision 2026-10-06):** the `'html'` column type and the `escapeHtml`/`subjectCell`/`replyCell` util were removed; the screen uses a component-local `<table>` with `{{ }}` bindings. Old Tasks 2 and 3 are deleted and the plan is renumbered to 5 tasks: 1 service `listMine`, 2 component + i18n + styles, 3 route + nav, 4 full suite + build, 5 real-app verification. Spec now has a hostile-text test covering subject, description and response (literal text, no `img`/`script`/`b` elements); sanitizer/escape tests are gone. Component spec also asserts `aria-label`/`th scope="col"` and that only the answered row has the reply rail. SCSS now targets `.ticket-history__table`/`__empty` (placed in global `_admin.scss`, outside the per-component style budget; initial-bundle impact negligible), and the style-bleed check (Task 5 Step 6b) was rewritten for in-app navigation between unit 5's and this screen.
