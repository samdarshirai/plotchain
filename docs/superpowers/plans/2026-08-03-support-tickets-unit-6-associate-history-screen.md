# Support Tickets Unit 6: Associate "Support Ticket history" Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A view-only, lazy-loaded Associate screen at `/support-tickets` listing the caller's own support tickets (subject, description, status, admin response, dates) with a status filter and paging, from the merged `GET /api/associates/me/support-tickets` (unit 4). Frontend only; no backend change.

**Architecture:** One standalone `SupportTicketHistoryComponent` modelled on `PayoutHistoryComponent` (filter strip, `app-inline-banner`, read-only `app-editable-table` in a `.card`, prev/next pager), minus the balance ribbon. It REUSES the shared support-ticket model/API service that unit 5 (Admin queue screen, built first) creates, adding one `listMine` method to that service. The two rich cells (subject+description, quoted reply) use PRE-COMPOSED, HTML-escaped markup rendered through one new read-only column type `'html'` on `EditableTableComponent` (a one-line `[innerHTML]` switch case; no template-hook API). Styling is a `.support-tickets` block in `frontend/src/styles/_admin.scss` using only existing tokens.

**Tech Stack:** Angular 18.2 standalone, `@ngx-translate/core`, Karma/Jasmine with `HttpClientTestingModule`, SCSS in `_admin.scss`. No new libraries.

**Spec:** `docs/superpowers/specs/role-capability/2026-08-03-support-tickets-domain-design.md` (Flows "Associate views", Decision 5); unit row 6 in `docs/superpowers/plans/2026-08-03-support-tickets-units.md`. Design: `docs/design/associate_operational_screens/support_ticket_history/` (`DESIGN.md` read fully first; `code.html` + `screen.png` visual reference).

## Prerequisites (hard)

- Unit 4 merged (done): `GET /api/associates/me/support-tickets?status&page&size` returns `SupportTicketPageResponse(entries, page, size, totalElements)` with rows `SupportTicketResponse(id, associateId, associateUserId, associateName, subject, description, status, response, respondedAt, createdAt, updatedAt)`; sorted `createdAt` desc; `size` clamped 1..100; status is `OPEN | IN_PROGRESS | RESOLVED | CLOSED`.
- **Unit 5 must be merged first.** It creates the shared frontend model + API service files. This plan REUSES them and never recreates them. Unit 5 also edits `app.routes.ts`, `app.routes.spec.ts`, `admin-nav-categories.model.ts` (+spec) and the i18n files. Therefore, before Task 1, rebase this branch on master containing unit 5 and re-read the four shared files below; `app.routes.ts`, the associate nav model (`associate-nav-items.model.ts`), `app.component.spec.ts`, `en.json`/`hi.json` and `_admin.scss` are all shared-edit files, so make each edit against the post-unit-5 text, not the text quoted here.

## Global Constraints

- Description and admin response are shown in FULL (no clamp, no "show more").
- Nav label and screen title: "Support Tickets"; own entry in the associate nav.
- Status = plain uppercase mono text via a normal `'text'` column; NO colored pills (do not use `'badge'`).
- Live tokens only from `_tokens.scss` (gold/oxblood: `--brand-gradient`, `--status-danger`, `--surface-raised`, `--surface-card`, `--text-primary`, `--text-muted`, `--border-subtle`); no new hex, no new custom property.
- Route lazy-loaded via `loadComponent` (initial bundle `maximumError` is 1.2MB, warning 500kB; plot-booking units sat at the budget).
- View-only: no create/respond/edit control, no `<input>`; `ADMIN` token on this route is not specially handled (spec Resolved decision 1).
- Mobile cards under 768px (`max-width: 768px`, the siblings' breakpoint).
- No e2e (deferred). Do NOT commit/edit the units tracking file from the implementer; the coordinator marks it merged.

## Review Focus

1. Ticket text containing `<`, `&`, `"` or `<script>`/`<img onerror>`: must show as literal text (escaped before the `'html'` cell). Tested in Task 3.
2. Multi-line description/response: line breaks preserved (`white-space: pre-wrap`), not collapsed. CSS, checked in Task 7.
3. Very long unbroken text (a URL): must wrap, not blow out the card on mobile. `overflow-wrap: anywhere`, checked in Task 7.
4. Filter change while on page 3: resets to page 0. Tested in Task 4.
5. Load failure: banner + Retry, table hidden, Retry re-requests the same page/filter. Tested in Task 4.

## Deviations from DESIGN.md (veto at review)

1. **Cell approach (user decision, checked against code):** `EditableTableComponent`'s read-only cells are `{{ row[key] }}` text interpolation only; there is no template hook and `actionTemplate` is only for `type:'action'`. Smallest working change chosen: a new column `type: 'html'` rendering `<span [innerHTML]="row[key]">` in the existing `ngSwitch`. Angular's sanitizer is the second layer; the first is our own `escapeHtml` in the cell builder, so ticket text can never inject markup. Alternatives rejected: a cell `TemplateRef` input (larger API, per-column plumbing, spec churn); rendering our own `<table>` (loses shared pager/empty/mobile styles).
2. Single-string empty state: `emptyStateLabel` is one string, so the design's "title + one line" empty block ships as one sentence per variant (no tickets at all / no tickets for this filter).
3. Responded date sits inside the quoted reply as a mono stamp (design intent); no fifth column (DESIGN open question 4 answered: keep as designed).
4. Skeleton rows (3 bars, 1.2s pulse, off under `prefers-reduced-motion`) are a plain `div` list shown instead of the table while loading; filter and pager are disabled during load.

## File Structure

- Reused from unit 5 (post-unit-5 real paths to be confirmed in Task 1; assumed `frontend/src/app/support-tickets/`): `support-ticket.model.ts (flat file, also holds SupportTicketPage)` (`SupportTicketStatus`, `SupportTicket`), (same file) (`SupportTicketPage`), `support-ticket.service.ts` (`SupportTicketService`).
- Modify: the unit-5 service (+ its spec): append `listMine`.
- Modify: `frontend/src/app/shared/components/editable-table/editable-table.component.ts` (+ spec): `'html'` column type.
- Create: `frontend/src/app/support-ticket-history/support-ticket-cells.util.ts` (+ spec): `escapeHtml`, `subjectCell`, `replyCell`.
- Create: `frontend/src/app/support-ticket-history/support-ticket-history.component.ts` (+ spec).
- Modify: `frontend/src/app/app.routes.ts` (+ spec), `frontend/src/app/associate-nav-items.model.ts`, `frontend/src/app/app.component.spec.ts`, `frontend/src/assets/i18n/en.json` and `hi.json`, `frontend/src/styles/_admin.scss`.

---

### Task 1: Reuse unit 5's model/service; append `listMine`

**Files:** the three shared files above (modify service + spec only; models only if a field is missing).

**Interfaces:**
- Consumes: unit 5's `SupportTicketService` (`providedIn: 'root'`, injects `HttpClient`), `SupportTicket`, `SupportTicketPage` (`entries: SupportTicket[]; page; size; totalElements`), `SupportTicketStatus = 'OPEN'|'IN_PROGRESS'|'RESOLVED'|'CLOSED'`.
- Produces: `listMine(status: SupportTicketStatus | '', page: number, size: number): Observable<SupportTicketPage>`.

- [ ] **Step 1: Confirm real names.** Run `ls frontend/src/app/support-tickets* frontend/src/app/admin 2>/dev/null; grep -rn "class SupportTicketService" frontend/src/app`. Open the model files and diff them against the backend record above. If the model lacks `respondedAt`/`response` or unit 5 named things differently, use unit 5's names everywhere below (find/replace in this plan's snippets, including import paths) and add only the missing field. Do NOT create a second model/service.

- [ ] **Step 2: Failing test** (append to the service spec; adjust import path if different):

```typescript
it('lists my tickets with page, size and optional status', () => {
  service.listMine('RESOLVED', 2, 20).subscribe(res => expect(res.totalElements).toBe(0));
  const req = httpMock.expectOne(r => r.url === '/api/associates/me/support-tickets');
  expect(req.request.method).toBe('GET');
  expect(req.request.params.get('status')).toBe('RESOLVED');
  expect(req.request.params.get('page')).toBe('2');
  expect(req.request.params.get('size')).toBe('20');
  req.flush({ entries: [], page: 2, size: 20, totalElements: 0 });
});

it('omits status when listing all my tickets', () => {
  service.listMine('', 0, 20).subscribe();
  const req = httpMock.expectOne(r => r.url === '/api/associates/me/support-tickets');
  expect(req.request.params.has('status')).toBeFalse();
  req.flush({ entries: [], page: 0, size: 20, totalElements: 0 });
});
```

- [ ] **Step 3:** Run `cd frontend && npx ng test --watch=false --include='**/support-ticket.service.spec.ts'`. Expected: FAIL (`listMine` not a function).

- [ ] **Step 4: Implement** (append inside the service class; add `HttpParams` to the imports if absent):

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

### Task 2: `'html'` column type on `EditableTableComponent`

**Files:** `frontend/src/app/shared/components/editable-table/editable-table.component.ts`, `editable-table.component.spec.ts`.

**Interfaces:** Produces: `EditableTableColumn.type` gains `'html'` (read-only tables only; value must already be escaped by the caller).

- [ ] **Step 1: Failing test** (match the existing spec's fixture-setup style; read it first):

```typescript
it('renders an html column as markup in a read-only table', () => {
  const fixture = TestBed.createComponent(EditableTableComponent);
  fixture.componentInstance.readOnly = true;
  fixture.componentInstance.columns = [{ key: 'subject', label: 'Subject', type: 'html' }];
  fixture.componentInstance.rows = [{ subject: '<span class="x">Hi</span>' }];
  fixture.detectChanges();
  const el: HTMLElement = fixture.nativeElement.querySelector('td .x');
  expect(el.textContent).toBe('Hi');
});

it('sanitizes script/handler markup in an html column', () => {
  const fixture = TestBed.createComponent(EditableTableComponent);
  fixture.componentInstance.readOnly = true;
  fixture.componentInstance.columns = [{ key: 'a', label: 'A', type: 'html' }];
  fixture.componentInstance.rows = [{ a: '<img src=x onerror="alert(1)">' }];
  fixture.detectChanges();
  expect(fixture.nativeElement.innerHTML).not.toContain('onerror');
});
```

- [ ] **Step 2:** Run `npx ng test --watch=false --include='**/editable-table.component.spec.ts'`. Expected: FAIL (first test: no `.x`; `{{ }}` default case prints raw text).

- [ ] **Step 3: Implement.** Union becomes `'text' | 'number' | 'select' | 'action' | 'badge' | 'rank-badge' | 'html'` (add a one-line comment: `'html': read-only pre-composed markup; caller MUST escape user text`). Add this case in the read-only `ngSwitch`, before `*ngSwitchDefault`:

```html
<span *ngSwitchCase="'html'" class="editable-table__html" [innerHTML]="row[column.key]"></span>
```

- [ ] **Step 4:** Re-run Step 2 command, then the whole editable-table spec. Expected: PASS. Commit: `feat(editable-table): read-only html column type`.

---

### Task 3: Cell markup builders

**Files:** Create `frontend/src/app/support-ticket-history/support-ticket-cells.util.ts`, `support-ticket-cells.util.spec.ts`.

**Interfaces:** Produces:
- `escapeHtml(s: string): string`
- `subjectCell(subject: string, description: string): string`
- `replyCell(response: string | null, respondedAtLabel: string, awaitingLabel: string): string`

- [ ] **Step 1: Failing spec**

```typescript
import { escapeHtml, replyCell, subjectCell } from './support-ticket-cells.util';

describe('support-ticket-cells util', () => {
  it('escapes markup characters', () => {
    expect(escapeHtml(`<b>"a" & 'b'</b>`)).toBe('&lt;b&gt;&quot;a&quot; &amp; &#39;b&#39;&lt;/b&gt;');
  });

  it('subjectCell escapes user text and keeps full description', () => {
    const html = subjectCell('<script>x</script>', 'line1\nline2 <i>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('line1\nline2 &lt;i&gt;');
    expect(html).toContain('support-tickets__subject');
    expect(html).toContain('support-tickets__description');
  });

  it('replyCell renders a quote with stamp when answered', () => {
    const html = replyCell('We fixed <it>', 'Jan 7, 2026', 'Awaiting a reply');
    expect(html).toContain('support-tickets__reply');
    expect(html).toContain('We fixed &lt;it&gt;');
    expect(html).toContain('Jan 7, 2026');
    expect(html).not.toContain('Awaiting');
  });

  it('replyCell shows the awaiting line with no rail when unanswered', () => {
    const html = replyCell(null, '', 'Awaiting a reply');
    expect(html).toContain('support-tickets__awaiting');
    expect(html).toContain('Awaiting a reply');
    expect(html).not.toContain('support-tickets__reply"');
  });

  it('replyCell treats a blank response as unanswered', () => {
    expect(replyCell('   ', '', 'Awaiting')).toContain('support-tickets__awaiting');
  });
});
```

- [ ] **Step 2:** Run `--include='**/support-ticket-cells.util.spec.ts'`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```typescript
// Pre-composed markup for EditableTableComponent's read-only 'html' columns. Every user-supplied
// string passes through escapeHtml; the label args are i18n strings and are escaped too.
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function subjectCell(subject: string, description: string): string {
  return (
    `<span class="support-tickets__subject">${escapeHtml(subject)}</span>` +
    `<span class="support-tickets__description">${escapeHtml(description)}</span>`
  );
}

export function replyCell(response: string | null, respondedAtLabel: string, awaitingLabel: string): string {
  if (!response || !response.trim()) {
    return `<span class="support-tickets__awaiting">${escapeHtml(awaitingLabel)}</span>`;
  }
  return (
    `<span class="support-tickets__reply">` +
    `<span class="support-tickets__reply-text">${escapeHtml(response)}</span>` +
    `<span class="support-tickets__reply-stamp">${escapeHtml(respondedAtLabel)}</span>` +
    `</span>`
  );
}
```

- [ ] **Step 4:** Re-run. Expected: PASS. Commit: `feat(support-tickets): escaped ticket cell builders`.

---

### Task 4: `SupportTicketHistoryComponent`, i18n, styles

**Files:** Create `frontend/src/app/support-ticket-history/support-ticket-history.component.ts` and `.spec.ts`; modify `frontend/src/assets/i18n/en.json`, `hi.json`, `frontend/src/styles/_admin.scss`.

**Interfaces:**
- Consumes: `SupportTicketService.listMine`, `SupportTicketPage`, `SupportTicketStatus` (Task 1), `subjectCell`/`replyCell` (Task 3), `'html'` column type (Task 2), `InlineBannerComponent`.
- Produces: `SupportTicketHistoryComponent` (selector `app-support-ticket-history`, exported for the lazy route in Task 5) with `goToPage(n)`, `onStatusChange(v)`, `retry()`, `loading`, `loadError`, `historyColumns`, `historyRows`.

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
        statusFilterLabel: 'Status', statusFilterAllOption: 'All statuses',
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

  it('shows skeleton rows and disables the filter while loading', () => {
    expect(fixture.nativeElement.querySelectorAll('.support-tickets__skeleton-row').length).toBe(3);
    expect(fixture.nativeElement.querySelector('select').disabled).toBeTrue();
    flushPage();
    expect(fixture.nativeElement.querySelector('.support-tickets__skeleton-row')).toBeNull();
    expect(fixture.nativeElement.querySelector('select').disabled).toBeFalse();
  });

  it('renders subject, full multi-line description, status, and a quoted reply', () => {
    flushPage();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Cannot see my invoice');
    expect(fixture.nativeElement.querySelector('.support-tickets__description').textContent).toBe('Line one\nLine two');
    expect(fixture.nativeElement.querySelector('.support-tickets__reply-text').textContent).toBe('Fixed it');
    expect(text).toContain('Resolved');
    expect(fixture.nativeElement.querySelector('.support-tickets__awaiting').textContent).toContain('Awaiting a reply');
  });

  it('renders hostile ticket text as literal text', () => {
    flushPage([{ ...answered, subject: '<img src=x onerror=alert(1)>' }]);
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect(fixture.nativeElement.querySelector('.support-tickets__subject').textContent).toBe('<img src=x onerror=alert(1)>');
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
    expect(fixture.nativeElement.querySelector('.editable-table__empty').textContent).toContain('No support tickets yet.');
    fixture.componentInstance.onStatusChange('CLOSED');
    httpMock.expectOne(r => r.params.get('status') === 'CLOSED').flush({ entries: [], page: 0, size: 20, totalElements: 0 });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.editable-table__empty').textContent).toContain('No tickets with this status.');
  });

  it('on error shows a danger banner with Retry, hides the table, and Retry re-requests', () => {
    httpMock.expectOne(r => r.url === URL).flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-inline-banner .inline-banner--danger')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-editable-table')).toBeNull();
    fixture.nativeElement.querySelector('.support-tickets__retry').click();
    flushPage();
    expect(fixture.nativeElement.querySelector('app-editable-table')).toBeTruthy();
  });

  it('Next loads the next page', () => {
    flushPage([answered], 21);
    fixture.componentInstance.goToPage(1);
    flushPage([answered], 21, 1);
    expect(fixture.componentInstance.page?.page).toBe(1);
  });

  it('is view-only: no action column, no inputs', () => {
    flushPage();
    expect(fixture.componentInstance.historyColumns.some(c => c.type === 'action')).toBeFalse();
    expect(fixture.nativeElement.querySelectorAll('input').length).toBe(0);
  });
});
```

- [ ] **Step 2:** Run `--include='**/support-ticket-history.component.spec.ts'`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement the component.** (Columns built with `translate.get` + `onLangChange` exactly as `PayoutHistoryComponent` does and for the same reason.)

```typescript
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SupportTicketService } from '../support-tickets/support-ticket.service';
import { SupportTicketPage } from '../support-tickets/support-ticket.model';
import { SupportTicketStatus } from '../support-tickets/support-ticket.model';
import { EditableTableColumn, EditableTableComponent } from '../shared/components/editable-table/editable-table.component';
import { InlineBannerComponent } from '../shared/components/inline-banner/inline-banner.component';
import { replyCell, subjectCell } from './support-ticket-cells.util';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-support-ticket-history',
  standalone: true,
  imports: [CommonModule, TranslateModule, EditableTableComponent, InlineBannerComponent],
  providers: [DatePipe],
  template: `
    <div class="support-tickets">
      <div class="support-tickets__intro">
        <span class="support-tickets__eyebrow">{{ 'supportTickets.eyebrow' | translate }}</span>
        <h1 class="support-tickets__title">{{ 'supportTickets.title' | translate }}</h1>
        <p class="support-tickets__subtitle">{{ 'supportTickets.subtitle' | translate }}</p>
      </div>

      <div class="support-tickets__filters">
        <div class="support-tickets__filter-field">
          <label>
            {{ 'supportTickets.statusFilterLabel' | translate }}
            <select [disabled]="loading" (change)="onStatusChange($any($event.target).value)">
              <option value="">{{ 'supportTickets.statusFilterAllOption' | translate }}</option>
              <option *ngFor="let s of statuses" [value]="s">{{ 'supportTickets.status.' + s | translate }}</option>
            </select>
          </label>
        </div>
      </div>

      <app-inline-banner *ngIf="loadError" tone="danger" class="support-tickets__load-error">
        {{ 'supportTickets.loadError' | translate }}
        <button type="button" class="brand-button brand-button--secondary support-tickets__retry" (click)="retry()">
          {{ 'supportTickets.retryAction' | translate }}
        </button>
      </app-inline-banner>

      <div class="card" *ngIf="loading" aria-busy="true">
        <div class="support-tickets__skeleton-row" *ngFor="let _ of [1, 2, 3]"></div>
      </div>

      <div class="card" *ngIf="!loading && !loadError">
        <app-editable-table
          [readOnly]="true"
          [columns]="historyColumns"
          [rows]="historyRows"
          [emptyStateLabel]="(status ? 'supportTickets.emptyStateFiltered' : 'supportTickets.emptyState') | translate"
        ></app-editable-table>
      </div>

      <div class="support-tickets__pagination" *ngIf="page && !loadError">
        <span class="support-tickets__page-indicator">
          {{ 'supportTickets.pageIndicator' | translate: { page: currentPage, totalPages: totalPages } }}
        </span>
        <button type="button" class="brand-button brand-button--secondary" [disabled]="loading || page.page === 0" (click)="goToPage(page.page - 1)">
          {{ 'supportTickets.previousPageAction' | translate }}
        </button>
        <button type="button" class="brand-button brand-button--secondary" [disabled]="loading || (page.page + 1) * page.size >= page.totalElements" (click)="goToPage(page.page + 1)">
          {{ 'supportTickets.nextPageAction' | translate }}
        </button>
      </div>
    </div>
  `
})
export class SupportTicketHistoryComponent implements OnInit, OnDestroy {
  private service = inject(SupportTicketService);
  private translate = inject(TranslateService);
  private datePipe = inject(DatePipe);
  private destroyed$ = new Subject<void>();

  readonly statuses: SupportTicketStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
  page: SupportTicketPage | null = null;
  loading = false;
  loadError = false;
  status: SupportTicketStatus | '' = '';
  historyColumns: EditableTableColumn[] = [];
  historyRows: Record<string, string>[] = [];

  get currentPage(): number {
    return (this.page?.page ?? 0) + 1;
  }

  get totalPages(): number {
    if (!this.page || this.page.size === 0) {
      return 1;
    }
    return Math.max(1, Math.ceil(this.page.totalElements / this.page.size));
  }

  ngOnInit(): void {
    this.buildColumns();
    this.translate.onLangChange.pipe(takeUntil(this.destroyed$)).subscribe(() => this.buildColumns());
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
    this.loadPage(page);
  }

  retry(): void {
    this.loadPage(this.page?.page ?? 0);
  }

  private buildColumns(): void {
    this.translate
      .get([
        'supportTickets.columnSubject',
        'supportTickets.columnStatus',
        'supportTickets.columnCreatedAt',
        'supportTickets.columnResponse'
      ])
      .pipe(takeUntil(this.destroyed$))
      .subscribe(t => {
        this.historyColumns = [
          { key: 'subject', label: t['supportTickets.columnSubject'], type: 'html' },
          { key: 'status', label: t['supportTickets.columnStatus'], type: 'text' },
          { key: 'createdAt', label: t['supportTickets.columnCreatedAt'], type: 'text' },
          { key: 'response', label: t['supportTickets.columnResponse'], type: 'html' }
        ];
      });
  }

  private loadPage(page: number): void {
    this.loading = true;
    this.loadError = false;
    this.service.listMine(this.status, page, PAGE_SIZE).subscribe({
      next: res => {
        this.page = res;
        this.updateRows();
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.loadError = true;
      }
    });
  }

  private fmt(iso: string): string {
    return this.datePipe.transform(iso, 'medium') ?? iso;
  }

  private updateRows(): void {
    const awaiting = this.translate.instant('supportTickets.awaitingReply');
    this.historyRows = (this.page?.entries ?? []).map(t => ({
      subject: subjectCell(t.subject, t.description),
      status: this.translate.instant('supportTickets.status.' + t.status),
      createdAt: this.fmt(t.createdAt),
      response: replyCell(t.response, t.respondedAt ? this.fmt(t.respondedAt) : '', awaiting)
    }));
  }
}
```

If the spec's "error then Retry" test shows `retry()` re-requesting page 0 when `this.page` is still null, that is correct (first load failed).

- [ ] **Step 4: i18n.** Add a `supportTickets` block to `en.json` (keys exactly as in the spec's `setTranslation`, plus `emptyState: "No support tickets yet. When our team logs a request for you, it will appear here with any reply."`, `emptyStateFiltered: "No tickets with this status. Try another status, or choose All statuses."`, `loadError: "Couldn't load your support tickets. Check your connection and try again."`) and `"supportTickets": "Support Tickets"` under `nav`. Add the same keys to `hi.json` (English text for the block like siblings do; Hindi `"नवीन"`-style translation only for `nav.supportTickets`: "सहायता टिकट"). Run `node -e "JSON.parse(require('fs').readFileSync('frontend/src/assets/i18n/en.json'));JSON.parse(require('fs').readFileSync('frontend/src/assets/i18n/hi.json'))"`. Expected: no output.

- [ ] **Step 5: Styles.** Append to `_admin.scss` directly after the `.payout-history` block's closing media query (re-locate after rebase). Reuse the same placeholder extends and breakpoints as payout-history; only existing tokens:

```scss
// ---- Support Tickets (associate, view-only) ----
.support-tickets {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  max-width: 1040px;
  margin: 0 auto;
  padding: 1.5rem 2rem;
  font-family: 'Inter', var(--font-sans);
}
.support-tickets__intro { display: flex; flex-direction: column; gap: 0.25rem; }
.support-tickets__eyebrow {
  font-family: var(--font-mono); font-size: 0.6875rem; letter-spacing: 0.04em;
  text-transform: uppercase; color: var(--text-muted);
}
.support-tickets__title { @extend %admin-screen-title; margin: 0; }
.support-tickets__subtitle { margin: 0; font-size: 0.875rem; color: var(--text-muted); }

.support-tickets__filters {
  display: flex; padding: 1.25rem 1.5rem; background: var(--surface-raised); border-radius: 16px;
}
.support-tickets__filter-field {
  display: flex; flex-direction: column; min-width: 220px; max-width: 280px; flex: 1 1 220px;
  label {
    margin: 0; display: flex; flex-direction: column; gap: 0.375rem;
    font-family: var(--font-mono); font-size: 0.6875rem; font-weight: 500;
    letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-muted);
  }
  select { background: var(--surface-card); }
}
.support-tickets__load-error { margin: 0; }
.support-tickets__retry { margin-left: 0.75rem; min-height: 44px; }

.support-tickets .card { @extend %admin-screen-card; overflow-x: auto; }
.support-tickets .editable-table { margin: 0; min-width: 760px; }
.support-tickets .editable-table thead th { @extend %admin-screen-table-head; white-space: nowrap; }
.support-tickets .editable-table tbody td { @extend %admin-screen-table-cell; vertical-align: top; }
.support-tickets .editable-table tbody tr:last-child td { border-bottom: none; }
.support-tickets .editable-table td:nth-child(1) { width: 34%; }
.support-tickets .editable-table td:nth-child(2) {
  font-family: var(--font-mono); font-size: 0.75rem; font-weight: 600; letter-spacing: 0.04em;
  text-transform: uppercase; color: var(--text-muted); white-space: nowrap;
}
.support-tickets .editable-table td:nth-child(3) {
  font-variant-numeric: tabular-nums; font-size: 0.8125rem; color: var(--text-muted); white-space: nowrap;
}
.support-tickets .editable-table__empty { padding: 3rem 1.5rem; }

.support-tickets__subject {
  display: block; font-family: var(--font-display); font-weight: 600; color: var(--text-primary);
  overflow-wrap: anywhere;
}
.support-tickets__description {
  display: block; margin-top: 0.25rem; font-size: 0.8125rem; color: var(--text-muted);
  white-space: pre-wrap; overflow-wrap: anywhere;
}
// Quoted reply: 3px brand-gradient rail (same rail as the Payout History balance ribbon).
.support-tickets__reply {
  display: block; position: relative; padding-left: 0.875rem;
  &::before {
    content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
    border-radius: 2px; background: var(--brand-gradient);
  }
}
.support-tickets__reply-text {
  display: block; font-size: 0.8125rem; color: var(--text-primary);
  white-space: pre-wrap; overflow-wrap: anywhere;
}
.support-tickets__reply-stamp {
  display: block; margin-top: 0.375rem; font-family: var(--font-mono); font-size: 0.6875rem;
  letter-spacing: 0.04em; color: var(--text-muted);
}
.support-tickets__awaiting { font-size: 0.8125rem; font-style: italic; color: var(--text-muted); }

.support-tickets__skeleton-row {
  height: 3.5rem; margin: 0.75rem 1.25rem; border-radius: 8px; background: var(--surface-raised);
  animation: support-tickets-pulse 1.2s ease-in-out infinite;
}
@keyframes support-tickets-pulse { 50% { opacity: 0.45; } }
@media (prefers-reduced-motion: reduce) { .support-tickets__skeleton-row { animation: none; } }

.support-tickets__pagination { @extend %admin-screen-pagination; }
.support-tickets__page-indicator { @extend %admin-screen-page-indicator; }
.support-tickets__pagination .brand-button--secondary { @extend %admin-screen-pagination-secondary-button; }

@media (max-width: 768px) {
  .support-tickets { padding: 1rem; }
  .support-tickets__filters { flex-direction: column; align-items: stretch; }
  .support-tickets__filter-field { min-width: 0; max-width: none; }
  .support-tickets .editable-table { table-layout: fixed; width: 100%; min-width: 0; }
  .support-tickets .editable-table thead { display: none; }
  .support-tickets .editable-table tbody tr {
    display: block; padding: 1rem 1.25rem; border-bottom: 1px solid var(--border-subtle);
  }
  .support-tickets .editable-table tbody td {
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
  .support-tickets .editable-table tbody td:nth-child(1) { display: block; text-align: left; }
  .support-tickets .editable-table tbody td:nth-child(1)::before { display: none; }
  .support-tickets__subject { font-size: 1.0625rem; }
  // Admin response: full-width labeled block, left-aligned, rail kept.
  .support-tickets .editable-table tbody td:nth-child(4) { display: block; text-align: left; }
  .support-tickets .editable-table tbody td:nth-child(4)::before { display: block; margin-bottom: 0.375rem; }
  .support-tickets__pagination .brand-button--secondary { min-height: 44px; }
}
```

Note: the `.card` rule above also hits the skeleton card (intended). `td:nth-child(1) { width: 34% }` applies only on desktop (the media query resets `width: auto`).

- [ ] **Step 6:** Run `--include='**/support-ticket-history.component.spec.ts'`, then `npx ng build` is deferred to Task 6. Expected: all PASS. Commit: `feat(support-tickets): associate ticket history component`.

---

### Task 5: Lazy route + associate nav entry

**Files:** `frontend/src/app/app.routes.ts`, `app.routes.spec.ts`, `associate-nav-items.model.ts`, `app.component.spec.ts`. (Shared with unit 5 / announcements: re-read post-rebase.)

- [ ] **Step 1: Failing route spec** (add near the `plot-bookings` route test, which has the lazy-route precedent):

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

- [ ] **Step 2: Route** (after `payout-history`; NO static import at the top):

```typescript
{ path: 'support-tickets', loadComponent: () => import('./support-ticket-history/support-ticket-history.component').then(m => m.SupportTicketHistoryComponent), canActivate: [authGuard, associateOnlyGuard] },
```

- [ ] **Step 3: Nav** append to `ASSOCIATE_NAV_ITEMS` after `payoutHistory` (verify `support_agent` renders in the real app in Task 7; fall back to `confirmation_number`-style existing glyph if it shows as text):

```typescript
{ key: 'supportTickets', labelKey: 'nav.supportTickets', icon: 'support_agent', path: '/support-tickets' }
```

Add `'nav.supportTickets': 'Support Tickets'` beside `'nav.payoutHistory'` in `app.component.spec.ts` (~line 133). If any spec asserts the nav length, bump it.

- [ ] **Step 4:** Run `--include='**/app.routes.spec.ts' --include='**/app.component.spec.ts'`. Expected: PASS. Commit: `feat(support-tickets): associate route and nav entry`.

---

### Task 6: Full suite and bundle budget

- [ ] **Step 1:** `cd frontend && npx ng test --watch=false`. Expected: all PASS.
- [ ] **Step 2:** `cd frontend && npx ng build`. Expected: no budget error; the component appears as a separate lazy chunk, initial total not increased beyond the pre-change figure by more than the nav/i18n bytes. Record the initial-bundle number in the commit/report.
- [ ] **Step 3:** If any failure, fix in the owning task's files and re-run; commit only if fixes were needed.

---

### Task 7: Real-app verification (desktop + mobile)

Follow the `run` skill (`.claude/skills/run/SKILL.md`): `docker compose up -d db`; `cd backend && ./mvnw spring-boot:run` (wait for `Started PlotchainApplication`); `cd frontend && npm start`; open `http://localhost:4200`. Drive with claude-in-chrome.

- [ ] **Step 1: Seed data via the real admin screen (unit 5).** An associate cannot create tickets. Sign in as admin, open the Support Ticket Queue, and log at least: (a) a short ticket left OPEN; (b) a ticket with a multi-line description; (c) a ticket whose subject/description contain `<b>x</b> & "quotes"` and a 200-character unbroken string; (d) a ticket responded to and set RESOLVED with a multi-line response; (e) one IN_PROGRESS and one CLOSED (with response); plus enough extra tickets (21+) to get a second page, for one associate. Log one ticket for a second associate to prove isolation. If unit 5 isn't deployed, fall back to `POST /api/admin/support-tickets` with an admin token (curl).
- [ ] **Step 2: Desktop** (sign in as the first associate): "Support Tickets" is in the sidebar with a rendered icon and active highlight; the page loads; compare to `screen.png`. Check: newest first; the hostile ticket shows literal `<b>x</b> & "quotes"`; descriptions and responses are in full with line breaks; unanswered rows show italic "Awaiting a reply" with no rail, answered rows show the gold/oxblood rail and mono stamp; status is plain mono text, no pills; Status filter works and resets to page 1; Next/Previous work; second associate's tickets never appear; no inputs/buttons other than filter and pager.
- [ ] **Step 3: Empty/error/loading:** sign in as an associate with no tickets (empty message); filter to a status with no tickets (filtered message); stop the backend (or block `/api/associates/me/support-tickets` in devtools) and reload: banner + Retry, table hidden, Retry works after restart; throttle network to see 3 skeleton rows and the disabled filter/pager.
- [ ] **Step 4: Mobile (never verified in the design):** resize to 375px and 767px (chrome `resize_window`). Check: no horizontal page scroll; header row hidden; each ticket is a stacked card; subject + description lead full width, unlabeled; Status and Created are `label: value` rows; Admin response is a full-width labeled block with its rail; the long unbroken string wraps; filter full width; pager buttons at least 44px tall; focus ring visible on the select and buttons with keyboard. At 769px confirm the desktop table returns. Fix any defect in `_admin.scss`, re-run Task 6 steps 1-2 and note the fix.
- [ ] **Step 5:** Navigate directly to `/support-tickets` as admin: page renders (empty or whatever the admin has as an associate: none), no crash (spec: ADMIN token not specially handled; `associateOnlyGuard` may redirect: record actual behavior, it is acceptable either way).
- [ ] **Step 6:** Check the browser console: no errors or sanitizer warnings ("sanitizing HTML stripped some content" means an escaped cell leaked something; investigate).
- [ ] **Step 7:** Stop the dev servers. Do NOT edit the units tracking file; report results to the coordinator.

---

## Self-Review

- **Spec/units-row coverage:** view-only paged list with status filter (Task 4); empty state, no write affordance (Task 4 spec "view-only", empty tests); route + nav (Task 5); responsive (Task 4 SCSS, Task 7); specs, no e2e (all tasks); design folder exists (read first).
- **Placeholders:** none; the only conditional is unit 5's real file names/paths, handled by the explicit Task 1 Step 1 reconcile plus a stated assumption.
- **Type consistency:** `listMine(status: SupportTicketStatus | '', page, size)` is called as `listMine(this.status, page, PAGE_SIZE)`; page field is `entries` everywhere; column type `'html'` defined in Task 2 and used in Task 4; `subjectCell`/`replyCell` signatures match their call sites and CSS classes match the SCSS.
- **Known risks:** Angular's sanitizer must keep `class` on `span` (it does); if a Task 4 test shows classes stripped, check `ng test` console warnings. `support_agent` glyph availability is verified only in the real app (Task 7).

## Coordinator decisions (user-approved 2026-10-06)

- Shared file paths reconciled with unit 5: flat `frontend/src/app/support-tickets/support-ticket.model.ts` and `support-ticket.service.ts`; unit 6 appends only `listMine`.
- Nav icon `support_agent` (verify renders); `hi.json` English except nav label; `'html'` column type in EditableTableComponent approved.
