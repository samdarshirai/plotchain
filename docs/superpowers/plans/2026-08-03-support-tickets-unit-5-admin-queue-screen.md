# Support Tickets Unit 5: Admin "Support Ticket Queue" Screen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give an Admin `/settings/support-tickets`: a status/associate-filterable paged ticket queue with a sticky "seal" panel that either replies to / changes the status of the selected ticket, or logs a new ticket on an associate's behalf.

**Architecture:** `AdminSupportTicketsComponent` owns filters, the paged list, selection, flash and the write lock; `TicketSealComponent` owns the respond form and the log form and every write call. Both talk to a new shared `SupportTicketService` (admin methods only; unit 6 appends the associate method). The route is lazy-loaded; styles live in two lazy component SCSS files (as unit 12 did), ported to the LIVE gold/oxblood tokens.

**Tech Stack:** Angular 18 standalone components, `@ngx-translate/core`, `HttpClient`, Karma + Jasmine with `HttpClientTestingModule`, SCSS (`ViewEncapsulation.None`). No new libraries, no new design tokens.

**Spec:** `docs/superpowers/specs/role-capability/2026-08-03-support-tickets-domain-design.md` (Decisions 2, 3, 4, 5; Flows; Error handling) and the role-capability spec "Screens" section. Unit row: `docs/superpowers/plans/2026-08-03-support-tickets-units.md` unit 5. Design: `docs/design/admin_operational_screens/support_tickets/` (`DESIGN.md`, `code.html`, PNGs).

## Prerequisites

- Backend units 1-4 merged (verified by reading `backend/src/main/java/com/plotchain/supportticket/`).
- Frontend-only; zero backend changes.

## Shared files for unit 6 (this unit CREATES them; unit 6 reuses and APPENDS)

| File | Contents unit 5 creates | Unit 6 does |
|---|---|---|
| `frontend/src/app/support-tickets/support-ticket.model.ts` | `SupportTicketStatus`, `SUPPORT_TICKET_STATUSES`, `SupportTicket`, `SupportTicketPage`, `CreateSupportTicketRequest`, `RespondToSupportTicketRequest`, `TicketFilters` (all in this ONE flat file) | import only (needs `SupportTicket`, `SupportTicketPage`, `SupportTicketStatus`, `SUPPORT_TICKET_STATUSES`) |
| `frontend/src/app/support-tickets/support-ticket.service.ts` (+ `.spec.ts`) | `SupportTicketService` (`providedIn: 'root'`) with `list`, `create`, `respond` | append `listMine(status: SupportTicketStatus \| '', page, size): Observable<SupportTicketPage>` hitting `GET /api/associates/me/support-tickets`; do not change existing methods |

Note for unit 6's plan: it currently assumes `support-tickets/models/support-ticket.model.ts` and `models/support-ticket-page.model.ts`; the real paths are the flat files above (its Task 1 Step 1 already says to reconcile). Unit 5 also edits `admin-nav-categories.model.ts` + spec, `app.routes.ts` + spec, `en.json`, `hi.json`; unit 6 must make its edits to those against post-unit-5 text.

## Real backend contract (read from source)

- `GET /api/admin/support-tickets?status&associateId&page&size` → `{entries, page, size, totalElements}`; `status` optional enum, `associateId` optional UUID, `page` clamped ≥0, `size` clamped 1..100, default 20. Order `createdAt` desc (spec). 200.
- `POST /api/admin/support-tickets` body `{associateId (required UUID), subject (required, ≤200), description (required)}` → **201** `SupportTicketResponse`. Unknown associate → 404 `{error}` (`AssociateNotFoundException`); blank/missing fields → 400.
- `POST /api/admin/support-tickets/{id}/respond` body `{status (required), response?}` → **200** `SupportTicketResponse`. Unknown id → 404 `{error}`; `RESOLVED`/`CLOSED` with blank/missing response → 400 `{error}`; missing status → 400. A status-only change leaves the existing `response` untouched; `respondedAt` is set only when a non-blank response is provided.
- `SupportTicketResponse`: `{id, associateId, associateUserId, associateName, subject, description, status, response (nullable), respondedAt (nullable), createdAt, updatedAt}` (ISO instants). One shape for rows (no detail endpoint, Decision 5).
- Error bodies are `{ "error": "<text>" }`.

## Global Constraints

- Route is a child of the existing `settings` parent (inherits `[authGuard, adminGuard, launchedModeGuard]`); no new guard. Path `support-tickets`, `data: { sectionKey: 'supportTickets' }`, **lazy** via `loadComponent` (initial-bundle budget error is 1.2MB and prior units sat near it; `anyComponentStyle` budget is 4kB error per component, so keep each SCSS file small and split queue/seal).
- Nav: new item `{ key: 'supportTickets', labelKey: 'settings.sections.supportTickets', path: '/settings/support-tickets' }` in the `system` category (user decision). `labelKey` must equal `'settings.sections.' + key` (existing nav spec enforces).
- Tokens: use ONLY existing `var(--surface-*)`, `--border-subtle`, `--text-*`, `--brand-primary/secondary(-soft)`, `--status-success/warning/danger`, `--status-success-text/--status-warning-text` (defined in `_shared-components.scss`), `--font-*`. Do NOT add tokens and do NOT copy the violet/cyan hexes from `code.html`. Selected row = `--brand-primary-soft` fill + inset 4px `--brand-primary` rule. Open = warning tint, In progress = `--brand-primary-soft`, Resolved = success tint, Closed = `--surface-raised`/muted.
- Replacing an existing reply: **no confirm dialog**, hint text only (user decision).
- Blank reply with `RESOLVED`/`CLOSED` is invalid client-side AND a server 400 is surfaced (same field message plus the server's `error` text).
- Statuses exactly `OPEN | IN_PROGRESS | RESOLVED | CLOSED`; labels sentence case ("Open", "In progress", "Resolved", "Closed").
- Reuse: `AdminService.listAssociates()` (`GET /api/associates`), `app-associate-lookup` (`shared/components/associate-lookup/`), `app-inline-banner`, `app-field-error`, `.brand-button` / `.brand-button--secondary`. Do not modify them.
- Dates through the `date` pipe (`mediumDate`), never string-concatenated. 44px touch targets. Seal `aria-live="polite"`; errors `role="alert"` and not colour-only.
- i18n: `en.json` gets `settings.sections.supportTickets` and the `admin.supportTickets.*` block; `hi.json` gets the translated nav key and the screen block copied in English (unit 12 convention).
- No e2e (deferred). No new libraries.

## Deviations from DESIGN.md (veto at review)

1. Live gold/oxblood tokens instead of the mock's violet/cyan (user decision; DESIGN open Q5).
2. Nav home is `system` (user decision; DESIGN open Q2). NOTE the live KYC Review item currently sits in the `network` category, not `system`; this plan follows "under System" literally and appends the item to `system` (see Questions in the hand-off).
3. No confirm when replacing a reply (user decision; DESIGN open Q3).
4. Associate filter and the log-form lookup both reuse `app-associate-lookup` fed by `AdminService.listAssociates()` (client-side filter, same as Bookings); drill-down from the Associate Directory is not built.
5. After logging, the new ticket is selected from the 201 body (no extra fetch) and page 0 reloads; if active filters would hide it, the seal shows the "no longer matches the current filters" note.
6. Focus on row select moves to the seal heading (`tabindex=-1`) at every width; `scrollIntoView` is called only at <=960px (seal below the list), guarded for test environments.

## Review Focus

1. **Blank/whitespace reply on RESOLVED/CLOSED**: client blocks (no request), and a server 400 (`error` text) still shows if the server disagrees. (Task 5.)
2. **Status-only change (OPEN/IN_PROGRESS, blank reply) must not wipe an existing reply**: request omits `response`. (Tasks 2, 5.)
3. **Double submit** on Save response / Log ticket; filters, pager and row selection lock while a write is in flight. (Tasks 4-6.)
4. **Stale list response race**: a slow earlier page/filter response must never overwrite a newer one; a late write for ticket A must not steal selection from B. (Task 4.)
5. **Saved ticket no longer matches the status filter**: stays selected with the note, not a vanished seal. (Task 4.)
6. **Respond 404** (ticket gone): friendly message and queue reload; **log 404** shown under the associate lookup, not as a generic error. (Tasks 5, 6.)
7. **Subject > 200 chars / whitespace-only subject or description**: blocked client-side (maxlength 200 + trim check). (Task 6.)
8. **Empty states**: no tickets at all vs. filters hide everything; load error with Retry keeps filters usable. (Task 4.)

---

## File Structure

Create:
- `frontend/src/app/support-tickets/support-ticket.model.ts` — types shared with unit 6.
- `frontend/src/app/support-tickets/support-ticket.service.ts` and `.spec.ts` — HTTP.
- `frontend/src/app/admin/admin-support-tickets/admin-support-tickets.util.ts` and `.spec.ts` — pure helpers (`FlashMessage`, `replyRequired`, `respondPayload`, `snippet`, `classifyTicketError`).
- `frontend/src/app/admin/admin-support-tickets/admin-support-tickets.component.ts`, `.scss`, `.spec.ts` — page: header, filters, list, pager, flash, selection.
- `frontend/src/app/admin/admin-support-tickets/ticket-seal.component.ts`, `.scss`, `.spec.ts` — respond + log forms.

Modify:
- `frontend/src/app/admin-nav-categories.model.ts` (+ `.spec.ts`) — nav item.
- `frontend/src/app/app.routes.ts` (+ `.spec.ts`) — lazy route.
- `frontend/src/assets/i18n/en.json`, `hi.json` — copy.
- `docs/superpowers/plans/2026-08-03-support-tickets-units.md` — unit 5 row only (`planned` now; `merged` by the coordinator later).

Test command (from `frontend/`): `npx ng test --watch=false --browsers=ChromeHeadless --include='<spec path>'` (confirm flags against `package.json`/the `run` skill).

---

### Task 1: Shared model and service

**Files:**
- Create: `frontend/src/app/support-tickets/support-ticket.model.ts`
- Create: `frontend/src/app/support-tickets/support-ticket.service.ts`
- Test: `frontend/src/app/support-tickets/support-ticket.service.spec.ts`

**Interfaces:**
- Produces (exact; unit 6 and Tasks 2-6 rely on these names):
  - `type SupportTicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'`; `const SUPPORT_TICKET_STATUSES: SupportTicketStatus[]`
  - `interface SupportTicket`, `interface SupportTicketPage { entries: SupportTicket[]; page: number; size: number; totalElements: number }`
  - `interface CreateSupportTicketRequest { associateId: string; subject: string; description: string }`, `interface RespondToSupportTicketRequest { status: SupportTicketStatus; response?: string }`, `interface TicketFilters { status: SupportTicketStatus | ''; associateId: string }`
  - `SupportTicketService.list(f: TicketFilters, page: number, size: number): Observable<SupportTicketPage>`, `.create(req): Observable<SupportTicket>`, `.respond(id: string, req): Observable<SupportTicket>`

- [ ] **Step 1: Write the failing test**

```ts
// support-ticket.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { SupportTicketService } from './support-ticket.service';

describe('SupportTicketService', () => {
  let s: SupportTicketService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    s = TestBed.inject(SupportTicketService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('lists with only the set filters plus paging', () => {
    s.list({ status: 'OPEN', associateId: '' }, 2, 20).subscribe();
    const r = http.expectOne(x => x.url === '/api/admin/support-tickets');
    expect(r.request.method).toBe('GET');
    expect(r.request.params.get('status')).toBe('OPEN');
    expect(r.request.params.get('page')).toBe('2');
    expect(r.request.params.get('size')).toBe('20');
    expect(r.request.params.has('associateId')).toBeFalse();
    r.flush({ entries: [], page: 2, size: 20, totalElements: 0 });
  });

  it('omits both filters when unset and sends associateId when set', () => {
    s.list({ status: '', associateId: 'a1' }, 0, 20).subscribe();
    const r = http.expectOne(x => x.url === '/api/admin/support-tickets');
    expect(r.request.params.has('status')).toBeFalse();
    expect(r.request.params.get('associateId')).toBe('a1');
    r.flush({});
  });

  it('creates a ticket by POST', () => {
    s.create({ associateId: 'a1', subject: 'S', description: 'D' }).subscribe();
    const r = http.expectOne('/api/admin/support-tickets');
    expect(r.request.method).toBe('POST');
    expect(r.request.body).toEqual({ associateId: 'a1', subject: 'S', description: 'D' });
    r.flush({});
  });

  it('responds by POST to the ticket id', () => {
    s.respond('t1', { status: 'RESOLVED', response: 'Done' }).subscribe();
    const r = http.expectOne('/api/admin/support-tickets/t1/respond');
    expect(r.request.method).toBe('POST');
    expect(r.request.body).toEqual({ status: 'RESOLVED', response: 'Done' });
    r.flush({});
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx ng test --watch=false --browsers=ChromeHeadless --include='src/app/support-tickets/support-ticket.service.spec.ts'`. Expected: compile FAIL, `support-ticket.service` not found.

- [ ] **Step 3: Implement**

```ts
// support-ticket.model.ts
export type SupportTicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export const SUPPORT_TICKET_STATUSES: SupportTicketStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

// Mirrors backend SupportTicketResponse: one shape for admin queue rows and (unit 6) the associate's own history.
export interface SupportTicket {
  id: string;
  associateId: string;
  associateUserId: string;
  associateName: string;
  subject: string;
  description: string;
  status: SupportTicketStatus;
  response: string | null;
  respondedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupportTicketPage { entries: SupportTicket[]; page: number; size: number; totalElements: number; }
export interface CreateSupportTicketRequest { associateId: string; subject: string; description: string; }
export interface RespondToSupportTicketRequest { status: SupportTicketStatus; response?: string; }
export interface TicketFilters { status: SupportTicketStatus | ''; associateId: string; }
```

```ts
// support-ticket.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  CreateSupportTicketRequest, RespondToSupportTicketRequest, SupportTicket, SupportTicketPage, TicketFilters
} from './support-ticket.model';

@Injectable({ providedIn: 'root' })
export class SupportTicketService {
  private http = inject(HttpClient);

  list(f: TicketFilters, page: number, size: number): Observable<SupportTicketPage> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (f.status) { params = params.set('status', f.status); }
    if (f.associateId) { params = params.set('associateId', f.associateId); }
    return this.http.get<SupportTicketPage>('/api/admin/support-tickets', { params });
  }

  create(req: CreateSupportTicketRequest): Observable<SupportTicket> {
    return this.http.post<SupportTicket>('/api/admin/support-tickets', req);
  }

  respond(id: string, req: RespondToSupportTicketRequest): Observable<SupportTicket> {
    return this.http.post<SupportTicket>(`/api/admin/support-tickets/${id}/respond`, req);
  }
}
```

- [ ] **Step 4: Run to verify it passes** — same command. Expected: 4 specs PASS.
- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/support-tickets
git commit -m "feat(support-tickets): shared frontend ticket model and admin API service"
```

---

### Task 2: Pure helpers

**Files:**
- Create: `frontend/src/app/admin/admin-support-tickets/admin-support-tickets.util.ts`
- Test: `frontend/src/app/admin/admin-support-tickets/admin-support-tickets.util.spec.ts`

**Interfaces:**
- Consumes: `SupportTicketStatus`, `RespondToSupportTicketRequest` (Task 1).
- Produces: `interface FlashMessage { key: string; params?: Record<string, unknown> }`; `replyRequired(s): boolean`; `respondPayload(status, reply: string): RespondToSupportTicketRequest`; `snippet(text: string, max = 90): string`; `type TicketErrorKind = 'notFound' | 'validation' | 'network' | 'generic'`; `classifyTicketError(err: {status:number; error?:{error?:string}}): { kind: TicketErrorKind; serverText?: string }`.

- [ ] **Step 1: Write the failing test**

```ts
import { classifyTicketError, replyRequired, respondPayload, snippet } from './admin-support-tickets.util';

describe('admin-support-tickets util', () => {
  it('requires a reply only for RESOLVED and CLOSED', () => {
    expect(replyRequired('RESOLVED')).toBeTrue();
    expect(replyRequired('CLOSED')).toBeTrue();
    expect(replyRequired('OPEN')).toBeFalse();
    expect(replyRequired('IN_PROGRESS')).toBeFalse();
  });

  it('respondPayload trims the reply and omits it when blank so an existing reply is kept', () => {
    expect(respondPayload('RESOLVED', '  Fixed  ')).toEqual({ status: 'RESOLVED', response: 'Fixed' });
    expect(respondPayload('IN_PROGRESS', '   ')).toEqual({ status: 'IN_PROGRESS' });
    expect('response' in respondPayload('OPEN', '')).toBeFalse();
  });

  it('snippet collapses whitespace and truncates with an ellipsis', () => {
    expect(snippet('a\n\n b')).toBe('a b');
    expect(snippet('x'.repeat(100), 10)).toBe('xxxxxxxxx…');
    expect(snippet('short', 10)).toBe('short');
  });

  it('classifies errors', () => {
    expect(classifyTicketError({ status: 0 }).kind).toBe('network');
    expect(classifyTicketError({ status: 404 }).kind).toBe('notFound');
    expect(classifyTicketError({ status: 400, error: { error: 'Response is required' } })).toEqual({ kind: 'validation', serverText: 'Response is required' });
    expect(classifyTicketError({ status: 500 }).kind).toBe('generic');
  });
});
```

- [ ] **Step 2: Run to verify it fails** (module not found).
- [ ] **Step 3: Implement**

```ts
import { RespondToSupportTicketRequest, SupportTicketStatus } from '../../support-tickets/support-ticket.model';

export interface FlashMessage { key: string; params?: Record<string, unknown>; }
export type TicketErrorKind = 'notFound' | 'validation' | 'network' | 'generic';

export const replyRequired = (s: SupportTicketStatus): boolean => s === 'RESOLVED' || s === 'CLOSED';

// Blank reply is omitted (not sent as ""), so a status-only change leaves the stored reply untouched (spec Flows).
export function respondPayload(status: SupportTicketStatus, reply: string): RespondToSupportTicketRequest {
  const r = reply.trim();
  return r ? { status, response: r } : { status };
}

export function snippet(text: string, max = 90): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

export function classifyTicketError(err: { status: number; error?: { error?: string } }): { kind: TicketErrorKind; serverText?: string } {
  const serverText = err.error?.error;
  if (err.status === 0) { return { kind: 'network', serverText }; }
  if (err.status === 404) { return { kind: 'notFound', serverText }; }
  if (err.status === 400) { return { kind: 'validation', serverText }; }
  return { kind: 'generic', serverText };
}
```

- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit** `git add frontend/src/app/admin/admin-support-tickets && git commit -m "feat(support-tickets): admin queue pure helpers"`

---

### Task 3: Nav item, lazy route, i18n, host shell

**Files:**
- Modify: `frontend/src/app/admin-nav-categories.model.ts` (system items), `admin-nav-categories.model.spec.ts`
- Modify: `frontend/src/app/app.routes.ts` (settings children, after `admin-stats`), `app.routes.spec.ts`
- Modify: `frontend/src/assets/i18n/en.json`, `hi.json`
- Create: `frontend/src/app/admin/admin-support-tickets/admin-support-tickets.component.ts` (minimal header-only shell, replaced in Task 4)

**Interfaces:**
- Produces: exported class `AdminSupportTicketsComponent` (selector `app-admin-support-tickets`), route child `support-tickets`.

- [ ] **Step 1: Failing tests.** In `admin-nav-categories.model.spec.ts` change the last row of `groupsEverySettingsScreenUnderTheirCategory` to `['auditLog', 'adminStats', 'supportTickets']` and add:

```ts
  it('resolvesTheSupportTicketsScreenToTheSystemCategory', () => {
    expect(findNavCategoryForUrl('/settings/support-tickets')?.key).toBe('system');
  });
```

In `app.routes.spec.ts`, beside the existing bookings-emi test (~line 192; read it and mirror its exact lookup form), add:

```ts
    it('has a lazy support-tickets child stamped with sectionKey supportTickets', () => {
      const settingsRoute = routes.find(r => r.path === 'settings');
      const child = settingsRoute!.children!.find(c => c.path === 'support-tickets');
      expect(child).toBeDefined();
      expect(child!.component).toBeUndefined();
      expect(child!.loadComponent).toBeDefined();
      expect(child!.data).toEqual({ sectionKey: 'supportTickets' });
    });
```

If any existing test enumerates every settings child path in order, add `'support-tickets'` after `'admin-stats'`.

- [ ] **Step 2: Run** both spec files. Expected: FAIL.
- [ ] **Step 3: Implement.**

Nav: append `{ key: 'supportTickets', labelKey: 'settings.sections.supportTickets', path: '/settings/support-tickets' }` after `adminStats` in the `system` items.

Route (after the `admin-stats` child):

```ts
      { path: 'support-tickets', loadComponent: () => import('./admin/admin-support-tickets/admin-support-tickets.component').then(m => m.AdminSupportTicketsComponent), data: { sectionKey: 'supportTickets' } },
```

i18n `en.json`: add `"supportTickets": "Support Tickets"` to `settings.sections` (next to `"bookingsEmi"`), and a new `admin.supportTickets` block (sibling of `admin.bookingsEmi`):

```json
"supportTickets": {
  "eyebrow": "System",
  "title": "Support Tickets",
  "subtitle": "Log what an associate reported by phone or message, then reply and move it to resolved.",
  "logButton": "Log a ticket",
  "filter": { "status": "Status", "allStatuses": "All statuses", "associate": "Associate", "anyAssociate": "Any associate", "reset": "Reset filters" },
  "status": { "OPEN": "Open", "IN_PROGRESS": "In progress", "RESOLVED": "Resolved", "CLOSED": "Closed" },
  "col": { "ticket": "Ticket", "associate": "Associate", "status": "Status", "logged": "Logged" },
  "loading": "Loading tickets",
  "pager": "Page {{page}} of {{totalPages}} · {{count}} tickets",
  "previous": "Previous",
  "next": "Next",
  "empty": {
    "noTicketsTitle": "No tickets yet",
    "noTicketsBody": "When an associate reports a problem, log it here so it can be tracked to a reply.",
    "noMatchTitle": "No tickets match these filters"
  },
  "seal": {
    "none": "Select a ticket to read it and reply.",
    "log": "Log a ticket",
    "logged": "Logged",
    "description": "Description",
    "currentReply": "Current reply",
    "repliedOn": "Replied {{date}}",
    "noReply": "No reply yet.",
    "status": "Status",
    "reply": "Reply",
    "replyHint": "Required for Resolved and Closed. The associate sees this reply. Saving a new reply replaces the current one.",
    "filterMismatch": "This ticket no longer matches the current filters.",
    "associate": "Associate",
    "subject": "Subject",
    "descriptionField": "Description"
  },
  "action": { "save": "Save response", "saving": "Saving…", "log": "Log ticket", "logging": "Logging…", "cancel": "Cancel" },
  "ok": {
    "responded": "Response saved. Ticket {{subject}} is now {{status}}.",
    "logged": "Ticket logged. \"{{subject}}\" is open for {{name}} ({{userId}})."
  },
  "err": {
    "load": "The ticket queue didn't load. Check your connection and try again. Nothing was changed.",
    "retry": "Retry",
    "replyRequired": "Add a reply before resolving or closing this ticket.",
    "logRequired": "Choose an associate and fill in the subject and description.",
    "associateNotFound": "That associate wasn't found.",
    "ticketNotFound": "This ticket no longer exists. Reload the queue.",
    "network": "Couldn't reach the server. Check your connection and try again.",
    "generic": "Something went wrong. Nothing was changed. Please try again."
  }
}
```

`hi.json`: nav key `"supportTickets": "सहायता टिकट"` in `settings.sections`, plus the same `admin.supportTickets` block in English (unit 12 convention). Validate both files parse: `node -e "JSON.parse(require('fs').readFileSync('src/assets/i18n/en.json'));JSON.parse(require('fs').readFileSync('src/assets/i18n/hi.json'))"` (from `frontend/`).

Host shell (replaced in Task 4):

```ts
import { Component, ViewEncapsulation } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-admin-support-tickets',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [TranslateModule],
  template: `
    <div class="support-tickets">
      <span class="support-tickets__eyebrow">{{ 'admin.supportTickets.eyebrow' | translate }}</span>
      <h1 class="support-tickets__title">{{ 'admin.supportTickets.title' | translate }}</h1>
    </div>
  `
})
export class AdminSupportTicketsComponent {}
```

- [ ] **Step 4: Run** both specs. Expected PASS.
- [ ] **Step 5: Commit** `git add frontend/src/app frontend/src/assets/i18n && git commit -m "feat(support-tickets): admin nav item, lazy route and copy for the ticket queue"`

---

### Task 4: Queue page (filters, list, pager, states, selection)

**Files:**
- Modify (replace shell): `frontend/src/app/admin/admin-support-tickets/admin-support-tickets.component.ts`
- Create: `.../admin-support-tickets.component.scss`, `.../admin-support-tickets.component.spec.ts`
- Create a compile stub: `.../ticket-seal.component.ts` (Task 5 fills it) with inputs/outputs exactly as in Task 5's Interfaces and a template of just the `none` message.

**Interfaces:**
- Consumes: `SupportTicketService.list`, `AdminService.listAssociates()`, `AssociateSummary` (`admin/models/associate-summary.model`), `AssociateLookupComponent`, `InlineBannerComponent`, `FlashMessage`, `snippet`.
- Produces: page members `filters`, `page`, `selected`, `sealMode: 'respond' | 'log'`, `locked`, `filterMismatch`, `flash`; methods `applyFilter(partial)`, `resetFilters()`, `reload()`, `goTo(p)`, `selectTicket(t)`, `startLog()`, `onCancelLog()`, `onSaved(t)`, `onLogged(t)`.

- [ ] **Step 1: Failing spec** (`boot()` flushes `/api/associates` then the list; mirrors `booking-register.component.spec.ts`):

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { AdminSupportTicketsComponent } from './admin-support-tickets.component';

describe('AdminSupportTicketsComponent', () => {
  let fixture: ComponentFixture<AdminSupportTicketsComponent>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;
  const tk = (id: string, over: Record<string, unknown> = {}) => ({
    id, associateId: 'a1', associateUserId: 'VA-1', associateName: 'Jane', subject: 'Subject ' + id,
    description: 'Desc ' + id, status: 'OPEN', response: null, respondedAt: null,
    createdAt: '2026-03-01T00:00:00Z', updatedAt: '2026-03-01T00:00:00Z', ...over
  });
  const pageOf = (entries: unknown[], total = entries.length, page = 0) => ({ entries, page, size: 20, totalElements: total });
  const directory = [{ id: 'a1', userId: 'VA-1', name: 'Jane', role: 'ASSOCIATE', hasFreeSlot: true }];
  const listReq = () => http.expectOne(r => r.url === '/api/admin/support-tickets');

  function boot(entries: unknown[] = [tk('t1'), tk('t2')], total?: number) {
    http.expectOne('/api/associates').flush(directory);
    listReq().flush(pageOf(entries, total));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminSupportTicketsComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(AdminSupportTicketsComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });
  afterEach(() => http.verify());

  it('renders a row per ticket with subject, snippet, associate and status chip', () => {
    boot();
    const rows = el().querySelectorAll('tbody tr.support-tickets__row');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('Subject t1');
    expect(rows[0].textContent).toContain('Desc t1');
    expect(rows[0].textContent).toContain('Jane');
    expect(rows[0].textContent).toContain('VA-1');
    expect(rows[0].querySelector('.support-tickets__chip--open')).not.toBeNull();
  });

  it('first load is unfiltered: no status or associateId param, page 0', () => {
    http.expectOne('/api/associates').flush(directory);
    const r = listReq();
    expect(r.request.params.has('status')).toBeFalse();
    expect(r.request.params.has('associateId')).toBeFalse();
    expect(r.request.params.get('page')).toBe('0');
    r.flush(pageOf([]));
  });

  it('changing a filter reloads page 0 with it', () => {
    boot();
    fixture.componentInstance.applyFilter({ status: 'RESOLVED' });
    const r = listReq();
    expect(r.request.params.get('status')).toBe('RESOLVED');
    expect(r.request.params.get('page')).toBe('0');
    r.flush(pageOf([]));
  });

  it('shows the first-run empty state without filters and the no-match state with filters', () => {
    boot([]);
    expect(el().querySelector('.support-tickets__empty')!.textContent).toContain('admin.supportTickets.empty.noTicketsTitle');
    fixture.componentInstance.applyFilter({ status: 'CLOSED' });
    listReq().flush(pageOf([]));
    fixture.detectChanges();
    expect(el().querySelector('.support-tickets__empty')!.textContent).toContain('admin.supportTickets.empty.noMatchTitle');
  });

  it('shows a skeleton while loading and a retry banner on load failure that re-requests', () => {
    http.expectOne('/api/associates').flush(directory);
    expect(el().querySelector('.support-tickets__skeleton')).not.toBeNull();
    listReq().flush('boom', { status: 500, statusText: 'err' });
    fixture.detectChanges();
    expect(el().textContent).toContain('admin.supportTickets.err.load');
    el().querySelector<HTMLButtonElement>('.support-tickets__retry')!.click();
    listReq().flush(pageOf([tk('t1')]));
  });

  it('pages: next requests page 1', () => {
    boot([tk('t1')], 45);
    el().querySelector<HTMLButtonElement>('.support-tickets__next')!.click();
    const r = listReq();
    expect(r.request.params.get('page')).toBe('1');
    r.flush(pageOf([tk('t9')], 45, 1));
  });

  it('a stale slow response never overwrites a newer one', () => {
    boot();
    fixture.componentInstance.applyFilter({ status: 'OPEN' });
    const slow = listReq();
    fixture.componentInstance.applyFilter({ status: 'CLOSED' });
    const fast = listReq();
    fast.flush(pageOf([tk('closed1', { status: 'CLOSED' })]));
    slow.flush(pageOf([tk('open1')]));
    expect(fixture.componentInstance.page!.entries[0].id).toBe('closed1');
  });

  it('selecting a row opens the respond seal', () => {
    boot();
    el().querySelectorAll<HTMLElement>('tbody tr.support-tickets__row')[1].click();
    expect(fixture.componentInstance.selected!.id).toBe('t2');
    expect(fixture.componentInstance.sealMode).toBe('respond');
  });

  it('a saved ticket patches its row, keeps selection, and flags a filter mismatch when it left the status filter', () => {
    boot();
    fixture.componentInstance.applyFilter({ status: 'OPEN' });
    listReq().flush(pageOf([tk('t1'), tk('t2')]));
    fixture.componentInstance.selectTicket(fixture.componentInstance.page!.entries[0]);
    fixture.componentInstance.onSaved(tk('t1', { status: 'RESOLVED', response: 'Done' }) as never);
    expect(fixture.componentInstance.page!.entries[0].status).toBe('RESOLVED');
    expect(fixture.componentInstance.selected!.id).toBe('t1');
    listReq().flush(pageOf([tk('t2')])); // resync (status=OPEN) no longer contains t1
    expect(fixture.componentInstance.filterMismatch).toBeTrue();
    expect(fixture.componentInstance.selected!.id).toBe('t1');
  });

  it('locks filters, pager and selection while a write is in flight', () => {
    boot();
    fixture.componentInstance.locked = true;
    fixture.componentInstance.applyFilter({ status: 'CLOSED' });
    fixture.componentInstance.selectTicket(fixture.componentInstance.page!.entries[0]);
    expect(fixture.componentInstance.filters.status).toBe('');
    expect(fixture.componentInstance.selected).toBeNull();
  });

  it('Log a ticket switches the seal to log mode; cancel returns to respond', () => {
    boot();
    el().querySelector<HTMLButtonElement>('.support-tickets__log')!.click();
    expect(fixture.componentInstance.sealMode).toBe('log');
    fixture.componentInstance.onCancelLog();
    expect(fixture.componentInstance.sealMode).toBe('respond');
  });
});
```

- [ ] **Step 2: Run** — FAIL (members missing).
- [ ] **Step 3: Implement** `admin-support-tickets.component.ts`:

```ts
import { Component, OnInit, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { AdminService } from '../admin.service';
import { AssociateSummary } from '../models/associate-summary.model';
import { AssociateLookupComponent } from '../../shared/components/associate-lookup/associate-lookup.component';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { SUPPORT_TICKET_STATUSES, SupportTicket, SupportTicketPage, TicketFilters } from '../../support-tickets/support-ticket.model';
import { SupportTicketService } from '../../support-tickets/support-ticket.service';
import { FlashMessage, snippet } from './admin-support-tickets.util';
import { TicketSealComponent } from './ticket-seal.component';

const PAGE_SIZE = 20;
const NO_FILTERS: TicketFilters = { status: '', associateId: '' };

@Component({
  selector: 'app-admin-support-tickets',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['./admin-support-tickets.component.scss'],
  imports: [CommonModule, TranslateModule, AssociateLookupComponent, InlineBannerComponent, TicketSealComponent],
  template: `
    <div class="support-tickets">
      <div class="support-tickets__head">
        <div>
          <span class="support-tickets__eyebrow">{{ 'admin.supportTickets.eyebrow' | translate }}</span>
          <h1 class="support-tickets__title">{{ 'admin.supportTickets.title' | translate }}</h1>
          <p class="support-tickets__subtitle">{{ 'admin.supportTickets.subtitle' | translate }}</p>
        </div>
        <button type="button" class="brand-button support-tickets__log" [disabled]="locked" (click)="startLog()">{{ 'admin.supportTickets.logButton' | translate }}</button>
      </div>

      <div class="support-tickets__filters">
        <label class="support-tickets__field">{{ 'admin.supportTickets.filter.status' | translate }}
          <select class="support-tickets__status" [disabled]="locked" (change)="applyFilter({ status: $any($event.target).value })">
            <option value="" [selected]="!filters.status">{{ 'admin.supportTickets.filter.allStatuses' | translate }}</option>
            <option *ngFor="let s of statuses" [value]="s" [selected]="filters.status === s">{{ 'admin.supportTickets.status.' + s | translate }}</option>
          </select>
        </label>
        <div class="support-tickets__field" [class.support-tickets__field--locked]="locked" [attr.inert]="locked ? '' : null">{{ 'admin.supportTickets.filter.associate' | translate }}
          <app-associate-lookup [associates]="directory" [value]="filters.associateId"
            [placeholder]="'admin.supportTickets.filter.anyAssociate' | translate"
            (selected)="applyFilter({ associateId: $event?.id ?? '' })"></app-associate-lookup>
        </div>
        <button type="button" class="brand-button brand-button--secondary support-tickets__reset" [disabled]="locked" (click)="resetFilters()">{{ 'admin.supportTickets.filter.reset' | translate }}</button>
      </div>

      <app-inline-banner *ngIf="flash" tone="success" [dismissible]="true" (dismissed)="flash = null">
        <span role="status">{{ flash.key | translate: flash.params }}</span>
      </app-inline-banner>
      <app-inline-banner *ngIf="loadError" tone="danger">
        <span role="alert">{{ 'admin.supportTickets.err.load' | translate }}</span>
        <button type="button" class="support-tickets__retry" [disabled]="locked" (click)="reload()">{{ 'admin.supportTickets.err.retry' | translate }}</button>
      </app-inline-banner>

      <div class="support-tickets__grid">
        <div class="support-tickets__list" [attr.aria-busy]="loading">
          <div class="support-tickets__skeleton" role="status" *ngIf="!page && !loadError">
            <span class="support-tickets__sr">{{ 'admin.supportTickets.loading' | translate }}</span>
            <span class="support-tickets__skeleton-row" *ngFor="let i of [1,2,3]"></span>
          </div>

          <div class="support-tickets__empty" *ngIf="page && !page.entries.length">
            <ng-container *ngIf="hasFilters; else firstRun">
              <h2>{{ 'admin.supportTickets.empty.noMatchTitle' | translate }}</h2>
              <button type="button" class="brand-button brand-button--secondary" [disabled]="locked" (click)="resetFilters()">{{ 'admin.supportTickets.filter.reset' | translate }}</button>
            </ng-container>
            <ng-template #firstRun>
              <h2>{{ 'admin.supportTickets.empty.noTicketsTitle' | translate }}</h2>
              <p>{{ 'admin.supportTickets.empty.noTicketsBody' | translate }}</p>
              <button type="button" class="brand-button" [disabled]="locked" (click)="startLog()">{{ 'admin.supportTickets.logButton' | translate }}</button>
            </ng-template>
          </div>

          <table class="support-tickets__table" *ngIf="page?.entries?.length" [attr.aria-label]="'admin.supportTickets.title' | translate">
            <thead>
              <tr>
                <th scope="col">{{ 'admin.supportTickets.col.ticket' | translate }}</th>
                <th scope="col">{{ 'admin.supportTickets.col.associate' | translate }}</th>
                <th scope="col">{{ 'admin.supportTickets.col.status' | translate }}</th>
                <th scope="col">{{ 'admin.supportTickets.col.logged' | translate }}</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let t of page!.entries" class="support-tickets__row" tabindex="0"
                [class.support-tickets__row--selected]="t.id === selected?.id" [attr.aria-current]="t.id === selected?.id ? 'true' : null"
                (click)="selectTicket(t)" (keydown.enter)="selectTicket(t)" (keydown.space)="selectTicket(t); $event.preventDefault()">
                <td [attr.data-label]="'admin.supportTickets.col.ticket' | translate">
                  <strong>{{ t.subject }}</strong><br /><span class="support-tickets__sub">{{ snip(t.description) }}</span>
                </td>
                <td [attr.data-label]="'admin.supportTickets.col.associate' | translate">{{ t.associateName }}<br /><span class="support-tickets__id">{{ t.associateUserId }}</span></td>
                <td [attr.data-label]="'admin.supportTickets.col.status' | translate">
                  <span class="support-tickets__chip support-tickets__chip--{{ t.status | lowercase }}">{{ 'admin.supportTickets.status.' + t.status | translate }}</span>
                </td>
                <td class="support-tickets__date" [attr.data-label]="'admin.supportTickets.col.logged' | translate">{{ t.createdAt | date: 'mediumDate' }}</td>
              </tr>
            </tbody>
          </table>

          <div class="support-tickets__pager" *ngIf="page?.entries?.length">
            <button type="button" class="brand-button brand-button--secondary support-tickets__prev" [disabled]="locked || page!.page === 0" (click)="goTo(page!.page - 1)">{{ 'admin.supportTickets.previous' | translate }}</button>
            <span>{{ 'admin.supportTickets.pager' | translate: { page: page!.page + 1, totalPages: totalPages, count: page!.totalElements } }}</span>
            <button type="button" class="brand-button brand-button--secondary support-tickets__next" [disabled]="locked || page!.page + 1 >= totalPages" (click)="goTo(page!.page + 1)">{{ 'admin.supportTickets.next' | translate }}</button>
          </div>
        </div>

        <app-ticket-seal [ticket]="selected" [mode]="sealMode" [directory]="directory" [filterMismatch]="filterMismatch"
          (saved)="onSaved($event)" (logged)="onLogged($event)" (cancelLog)="onCancelLog()"
          (flash)="flash = $event" (busyChange)="locked = $event" (reloadRequested)="reload()"></app-ticket-seal>
      </div>
    </div>
  `
})
export class AdminSupportTicketsComponent implements OnInit {
  private service = inject(SupportTicketService);
  private admin = inject(AdminService);

  readonly statuses = SUPPORT_TICKET_STATUSES;
  filters: TicketFilters = { ...NO_FILTERS };
  directory: AssociateSummary[] = [];
  page: SupportTicketPage | null = null;
  selected: SupportTicket | null = null;
  sealMode: 'respond' | 'log' = 'respond';
  filterMismatch = false;
  flash: FlashMessage | null = null;
  loadError = false;
  loading = false;
  locked = false; // true while a seal write is in flight: filters, pager, selection and Log freeze
  private seq = 0;
  private currentPage = 0;

  snip = (t: string) => snippet(t);
  get hasFilters(): boolean { return !!(this.filters.status || this.filters.associateId); }
  get totalPages(): number {
    return !this.page || !this.page.size ? 1 : Math.max(1, Math.ceil(this.page.totalElements / this.page.size));
  }

  ngOnInit(): void {
    this.admin.listAssociates().subscribe({ next: d => (this.directory = d), error: () => undefined });
    this.reload();
  }

  applyFilter(partial: Partial<TicketFilters>): void {
    if (this.locked) { return; }
    this.filters = { ...this.filters, ...partial };
    this.filterMismatch = false;
    this.load(0);
  }

  resetFilters(): void {
    if (this.locked) { return; }
    this.filters = { ...NO_FILTERS };
    this.filterMismatch = false;
    this.load(0);
  }

  // re-requests the last attempted page and re-checks whether the selection still matches the filters
  reload(): void { this.load(this.currentPage, true); }
  goTo(p: number): void { if (!this.locked) { this.load(p); } }

  // Latest-request-wins: a slow earlier response can never overwrite a newer one.
  private load(p: number, checkMismatch = false): void {
    const mine = ++this.seq;
    this.currentPage = p;
    this.loading = true;
    this.loadError = false;
    this.service.list(this.filters, p, PAGE_SIZE).subscribe({
      next: res => {
        if (mine !== this.seq) { return; }
        this.loading = false;
        this.page = res;
        if (this.selected) {
          const still = res.entries.find(t => t.id === this.selected!.id);
          if (still) { this.selected = still; this.filterMismatch = false; } else if (checkMismatch) { this.filterMismatch = true; }
        }
      },
      error: () => { if (mine === this.seq) { this.loading = false; this.loadError = true; } }
    });
  }

  selectTicket(t: SupportTicket): void {
    if (this.locked) { return; }
    this.selected = t;
    this.sealMode = 'respond';
    this.filterMismatch = false;
  }

  startLog(): void { if (!this.locked) { this.sealMode = 'log'; this.flash = null; } }
  onCancelLog(): void { this.sealMode = 'respond'; }

  // Respond finished: patch the row + selection immediately, then re-sync the page.
  onSaved(updated: SupportTicket): void {
    if (this.page) {
      this.page = { ...this.page, entries: this.page.entries.map(t => (t.id === updated.id ? updated : t)) };
    }
    if (this.selected?.id === updated.id) { this.selected = updated; } // a late write for A must not steal selection from B
    this.reload();
  }

  // Log finished: select the new ticket from the 201 body, reload page 0 (newest-first); the note shows if filters hide it.
  onLogged(created: SupportTicket): void {
    this.selected = created;
    this.sealMode = 'respond';
    this.load(0, true);
  }
}
```

SCSS `admin-support-tickets.component.scss`: transcribe the `.booking-register` filters / grid / list / table / row / chip / pager / empty / retry / skeleton / mobile-card rules from `admin-bookings-emi/booking-register.component.scss` and `bookings-emi.component.scss`, renamed `.support-tickets*`, with these deltas: grid columns `minmax(0, 1fr) 420px` (1100px: 360px; 960px: one column); chips `--open` (`color-mix(in srgb, var(--status-warning) 14%, var(--surface-card))`, text `--status-warning-text`, border `--status-warning`), `--in_progress` (`--brand-primary-soft`, `--brand-primary` border), `--resolved` (success tint, `--status-success-text`), `--closed` (`--surface-raised`, `--text-muted`); `&__id` mono muted, `&__date` mono; `&__head` flex with the Log button right-aligned; title/eyebrow/subtitle typography copied from `.bookings-emi__title/__eyebrow/__subtitle`. No new custom properties. Keep compiled size under ~3.5kB (checked in Task 8).

- [ ] **Step 4: Run** the spec. Expected PASS (the seal stub renders only the `none` text).
- [ ] **Step 5: Commit** `git add frontend/src/app/admin/admin-support-tickets && git commit -m "feat(support-tickets): admin queue page with filters, paging and selection"`

---

### Task 5: Seal — respond form

**Files:**
- Modify (replace stub): `frontend/src/app/admin/admin-support-tickets/ticket-seal.component.ts`
- Create: `ticket-seal.component.scss`, `ticket-seal.component.spec.ts`

**Interfaces:**
- Consumes: `SupportTicketService.respond`, `replyRequired`, `respondPayload`, `classifyTicketError`, `FieldErrorComponent`, `InlineBannerComponent`, `TranslateService`.
- Produces (exact; Task 4 already binds these): inputs `ticket: SupportTicket | null`, `mode: 'respond' | 'log'`, `directory: AssociateSummary[]`, `filterMismatch: boolean`; outputs `saved: EventEmitter<SupportTicket>`, `logged: EventEmitter<SupportTicket>`, `cancelLog: EventEmitter<void>`, `flash: EventEmitter<FlashMessage>`, `busyChange: EventEmitter<boolean>`, `reloadRequested: EventEmitter<void>`.

- [ ] **Step 1: Failing spec** (`fixture.componentRef.setInput(...)` per Angular 18):

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { TicketSealComponent } from './ticket-seal.component';

// helpers hoisted so the Task 6 `describe` reuses them
let fixture: ComponentFixture<TicketSealComponent>;
let http: HttpTestingController;
const el = () => fixture.nativeElement as HTMLElement;
const tk = (over: Record<string, unknown> = {}) => ({
  id: 't1', associateId: 'a1', associateUserId: 'VA-1', associateName: 'Jane', subject: 'Printer', description: 'Line one\nLine two',
  status: 'OPEN', response: null, respondedAt: null, createdAt: '2026-03-01T00:00:00Z', updatedAt: '2026-03-01T00:00:00Z', ...over
});
const submit = () => el().querySelector<HTMLFormElement>('form.ticket-seal__form')!.dispatchEvent(new Event('submit'));
async function setup(mode: 'respond' | 'log', directory: unknown[] = []) {
  await TestBed.configureTestingModule({ imports: [TicketSealComponent, HttpClientTestingModule, TranslateModule.forRoot()] }).compileComponents();
  fixture = TestBed.createComponent(TicketSealComponent);
  fixture.componentRef.setInput('mode', mode);
  fixture.componentRef.setInput('directory', directory);
  fixture.componentRef.setInput('filterMismatch', false);
  http = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
}

describe('TicketSealComponent (respond)', () => {
  const setTicket = (t: unknown) => { fixture.componentRef.setInput('ticket', t); fixture.detectChanges(); };
  const pick = (status: string) => { fixture.componentInstance.status = status as never; fixture.detectChanges(); };
  const typeReply = (v: string) => { fixture.componentInstance.reply = v; fixture.detectChanges(); };

  beforeEach(() => setup('respond'));
  afterEach(() => http.verify());

  it('shows the none message with no ticket', () => {
    expect(el().textContent).toContain('admin.supportTickets.seal.none');
  });

  it('presets the status to the ticket status, shows the current reply or the no-reply text', () => {
    setTicket(tk({ status: 'IN_PROGRESS', response: 'Looking', respondedAt: '2026-03-02T00:00:00Z' }));
    expect(fixture.componentInstance.status).toBe('IN_PROGRESS');
    expect(el().querySelector('.ticket-seal__reply-quote')!.textContent).toContain('Looking');
    setTicket(tk({ id: 't2' }));
    expect(el().textContent).toContain('admin.supportTickets.seal.noReply');
  });

  it('marks Reply required only while Resolved or Closed is selected', () => {
    setTicket(tk());
    expect(el().querySelector('.ticket-seal__req')).toBeNull();
    pick('RESOLVED');
    expect(el().querySelector('.ticket-seal__req')).not.toBeNull();
  });

  it('blank reply on RESOLVED/CLOSED sends nothing and shows the field error', () => {
    setTicket(tk());
    pick('RESOLVED'); typeReply('   ');
    submit(); fixture.detectChanges();
    http.expectNone('/api/admin/support-tickets/t1/respond');
    expect(el().textContent).toContain('admin.supportTickets.err.replyRequired');
    expect(el().querySelector('textarea')!.getAttribute('aria-invalid')).toBe('true');
    pick('CLOSED');
    submit(); http.expectNone('/api/admin/support-tickets/t1/respond');
  });

  it('status-only change posts without a response and emits saved + flash', () => {
    setTicket(tk({ response: 'Old' }));
    const saved = jasmine.createSpy('saved'); const flash = jasmine.createSpy('flash');
    fixture.componentInstance.saved.subscribe(saved); fixture.componentInstance.flash.subscribe(flash);
    pick('IN_PROGRESS'); typeReply('');
    submit();
    const r = http.expectOne('/api/admin/support-tickets/t1/respond');
    expect(r.request.body).toEqual({ status: 'IN_PROGRESS' });
    r.flush(tk({ status: 'IN_PROGRESS', response: 'Old' }));
    expect(saved).toHaveBeenCalled();
    expect(flash).toHaveBeenCalledWith({ key: 'admin.supportTickets.ok.responded', params: { subject: 'Printer', status: 'admin.supportTickets.status.IN_PROGRESS' } });
  });

  it('ignores a second submit while the first is in flight and emits busy true then false', () => {
    setTicket(tk());
    const busy = jasmine.createSpy('busy'); fixture.componentInstance.busyChange.subscribe(busy);
    pick('RESOLVED'); typeReply('Done');
    submit(); submit();
    const r = http.expectOne('/api/admin/support-tickets/t1/respond');
    expect(busy).toHaveBeenCalledWith(true);
    r.flush(tk({ status: 'RESOLVED', response: 'Done' }));
    expect(busy).toHaveBeenCalledWith(false);
  });

  it('surfaces a server 400 as the reply error plus the server text, keeping the form input', () => {
    setTicket(tk());
    pick('RESOLVED'); typeReply('x');
    submit();
    http.expectOne('/api/admin/support-tickets/t1/respond').flush({ error: 'Response is required when resolving' }, { status: 400, statusText: 'Bad' });
    fixture.detectChanges();
    expect(el().textContent).toContain('admin.supportTickets.err.replyRequired');
    expect(el().textContent).toContain('Response is required when resolving');
    expect(fixture.componentInstance.reply).toBe('x');
  });

  it('respond 404 shows the not-found banner and requests a queue reload', () => {
    setTicket(tk());
    const reload = jasmine.createSpy('reload'); fixture.componentInstance.reloadRequested.subscribe(reload);
    pick('CLOSED'); typeReply('bye');
    submit();
    http.expectOne('/api/admin/support-tickets/t1/respond').flush({ error: 'nope' }, { status: 404, statusText: 'NF' });
    fixture.detectChanges();
    expect(el().textContent).toContain('admin.supportTickets.err.ticketNotFound');
    expect(reload).toHaveBeenCalled();
  });

  it('switching to another ticket resets the form and clears errors', () => {
    setTicket(tk());
    pick('RESOLVED'); typeReply('');
    submit(); fixture.detectChanges();
    setTicket(tk({ id: 't2', status: 'CLOSED', response: 'R' }));
    expect(fixture.componentInstance.status).toBe('CLOSED');
    expect(fixture.componentInstance.reply).toBe('');
    expect(el().textContent).not.toContain('admin.supportTickets.err.replyRequired');
  });

  it('shows the filter-mismatch note when told', () => {
    fixture.componentRef.setInput('filterMismatch', true);
    setTicket(tk());
    expect(el().textContent).toContain('admin.supportTickets.seal.filterMismatch');
  });
});
```

- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** `ticket-seal.component.ts` (respond half now; Task 6 adds the log half to the same class):

```ts
import { Component, ElementRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AssociateSummary } from '../models/associate-summary.model';
import { AssociateLookupComponent } from '../../shared/components/associate-lookup/associate-lookup.component';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { FieldErrorComponent } from '../../shared/components/field-error/field-error.component';
import { SUPPORT_TICKET_STATUSES, SupportTicket, SupportTicketStatus } from '../../support-tickets/support-ticket.model';
import { SupportTicketService } from '../../support-tickets/support-ticket.service';
import { FlashMessage, TicketErrorKind, classifyTicketError, replyRequired, respondPayload } from './admin-support-tickets.util';

@Component({
  selector: 'app-ticket-seal',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['./ticket-seal.component.scss'],
  imports: [CommonModule, TranslateModule, AssociateLookupComponent, InlineBannerComponent, FieldErrorComponent],
  template: `
    <section class="ticket-seal" aria-live="polite">
      <!-- RESPOND -->
      <ng-container *ngIf="mode === 'respond'">
        <p class="ticket-seal__none" *ngIf="!ticket">{{ 'admin.supportTickets.seal.none' | translate }}</p>
        <ng-container *ngIf="ticket as t">
          <h2 #title tabindex="-1" class="ticket-seal__title">{{ t.subject }}</h2>
          <div class="ticket-seal__sub">{{ t.associateName }} · <span class="ticket-seal__id">{{ t.associateUserId }}</span></div>
          <p class="ticket-seal__note" role="status" *ngIf="filterMismatch">{{ 'admin.supportTickets.seal.filterMismatch' | translate }}</p>
          <dl class="ticket-seal__meta">
            <dt>{{ 'admin.supportTickets.col.status' | translate }}</dt>
            <dd><span class="support-tickets__chip support-tickets__chip--{{ t.status | lowercase }}">{{ 'admin.supportTickets.status.' + t.status | translate }}</span></dd>
            <dt>{{ 'admin.supportTickets.seal.logged' | translate }}</dt><dd>{{ t.createdAt | date: 'mediumDate' }}</dd>
          </dl>
          <h3 class="ticket-seal__label">{{ 'admin.supportTickets.seal.description' | translate }}</h3>
          <p class="ticket-seal__text">{{ t.description }}</p>
          <ng-container *ngIf="t.response; else noReply">
            <h3 class="ticket-seal__label">{{ 'admin.supportTickets.seal.currentReply' | translate }}
              <span class="ticket-seal__replied" *ngIf="t.respondedAt">{{ 'admin.supportTickets.seal.repliedOn' | translate: { date: (t.respondedAt | date: 'mediumDate') } }}</span></h3>
            <blockquote class="ticket-seal__reply-quote">{{ t.response }}</blockquote>
          </ng-container>
          <ng-template #noReply><p class="ticket-seal__muted">{{ 'admin.supportTickets.seal.noReply' | translate }}</p></ng-template>

          <app-inline-banner *ngIf="error && error.kind !== 'validation'" tone="danger"><span role="alert">{{ errorKey | translate }}</span></app-inline-banner>
          <form class="ticket-seal__form" (submit)="submitRespond(); $event.preventDefault()" novalidate>
            <label class="ticket-seal__field">{{ 'admin.supportTickets.seal.status' | translate }}
              <select name="status" [disabled]="busy" (change)="status = $any($event.target).value">
                <option *ngFor="let s of statuses" [value]="s" [selected]="status === s">{{ 'admin.supportTickets.status.' + s | translate }}</option>
              </select>
            </label>
            <label class="ticket-seal__field">{{ 'admin.supportTickets.seal.reply' | translate }}
              <span class="ticket-seal__req" *ngIf="needsReply" aria-hidden="true">*</span>
              <textarea rows="4" name="reply" [class.ticket-seal__invalid]="replyInvalid" [attr.aria-invalid]="replyInvalid ? 'true' : null"
                [disabled]="busy" [value]="reply" (input)="reply = $any($event.target).value"></textarea>
            </label>
            <small class="ticket-seal__hint">{{ 'admin.supportTickets.seal.replyHint' | translate }}</small>
            <div role="alert">
              <app-field-error [message]="replyInvalid ? ('admin.supportTickets.err.replyRequired' | translate) : undefined"></app-field-error>
              <div class="ticket-seal__server" *ngIf="error?.kind === 'validation' && error?.serverText">{{ error?.serverText }}</div>
            </div>
            <div class="ticket-seal__form-actions">
              <button type="submit" class="brand-button ticket-seal__submit" [disabled]="busy" [attr.aria-busy]="busy">{{ (busy ? 'admin.supportTickets.action.saving' : 'admin.supportTickets.action.save') | translate }}</button>
            </div>
          </form>
        </ng-container>
      </ng-container>
    </section>
  `
})
export class TicketSealComponent implements OnChanges {
  private service = inject(SupportTicketService);
  private translate = inject(TranslateService);
  private el = inject<ElementRef<HTMLElement>>(ElementRef);

  @Input() ticket: SupportTicket | null = null;
  @Input() mode: 'respond' | 'log' = 'respond';
  @Input() directory: AssociateSummary[] = [];
  @Input() filterMismatch = false;
  @Output() saved = new EventEmitter<SupportTicket>();
  @Output() logged = new EventEmitter<SupportTicket>();
  @Output() cancelLog = new EventEmitter<void>();
  @Output() flash = new EventEmitter<FlashMessage>();
  @Output() busyChange = new EventEmitter<boolean>();
  @Output() reloadRequested = new EventEmitter<void>();
  @ViewChild('title') title?: ElementRef<HTMLElement>;

  readonly statuses = SUPPORT_TICKET_STATUSES;
  status: SupportTicketStatus = 'OPEN';
  reply = '';
  tried = false;
  busy = false;
  error: { kind: TicketErrorKind; serverText?: string } | null = null;

  get needsReply(): boolean { return replyRequired(this.status); }
  // client check mirrors the 400 (Decision 4); a server 400 on respond shows the same message
  get replyInvalid(): boolean {
    return (this.tried && this.needsReply && !this.reply.trim()) || this.error?.kind === 'validation';
  }
  get errorKey(): string {
    const k = this.error?.kind;
    return 'admin.supportTickets.err.' + (k === 'notFound' ? 'ticketNotFound' : k === 'network' ? 'network' : 'generic');
  }

  ngOnChanges(ch: SimpleChanges): void {
    if (ch['ticket'] && ch['ticket'].previousValue?.id !== this.ticket?.id) {
      this.status = this.ticket?.status ?? 'OPEN';
      this.reply = '';
      this.tried = false;
      this.error = null;
      if (this.ticket) { this.focusTitle(); }
    }
  }

  private focusTitle(): void {
    setTimeout(() => {
      this.title?.nativeElement.focus();
      if (window.innerWidth <= 960) { this.el.nativeElement.scrollIntoView?.({ block: 'start' }); }
    });
  }

  submitRespond(): void {
    if (this.busy || !this.ticket) { return; }
    this.tried = true;
    this.error = null;
    if (this.needsReply && !this.reply.trim()) { return; }
    const t = this.ticket;
    this.setBusy(true);
    this.service.respond(t.id, respondPayload(this.status, this.reply)).subscribe({
      next: res => {
        this.setBusy(false);
        this.reply = ''; this.tried = false;
        this.flash.emit({ key: 'admin.supportTickets.ok.responded', params: { subject: res.subject, status: this.translate.instant('admin.supportTickets.status.' + res.status) } });
        this.saved.emit(res);
      },
      error: (err: HttpErrorResponse) => {
        this.setBusy(false);
        this.error = classifyTicketError(err);
        if (this.error.kind === 'notFound') { this.reloadRequested.emit(); }
      }
    });
  }

  private setBusy(v: boolean): void { this.busy = v; this.busyChange.emit(v); }
}
```

(The flash `status` param is the already-translated label, so the banner shows "Resolved" not a key. In tests `TranslateModule.forRoot()` returns the key unchanged, which is what the spec asserts.)

SCSS `ticket-seal.component.scss`: transcribe `.booking-seal` from `booking-seal.component.scss` (sticky double-ruled panel: `--brand-primary` border + ring box-shadow, `__none`, `__title` with focus-visible outline, `__sub`, `__id`, `__note` with `--status-warning` left rule, `__meta` dl grid, `__form`, `__field` with 44px inputs, `__form-actions` with 44px buttons, `__server`, 960px `position: static; max-height: none`) renamed `.ticket-seal*`, plus: `&__label` (mono 0.6875rem uppercase muted), `&__text { white-space: pre-wrap; overflow-wrap: anywhere }`, `&__reply-quote` (margin 0; padding .5rem .75rem; `border-left: 3px solid var(--brand-secondary)`; `--surface-raised` fill; `white-space: pre-wrap`), `&__replied` muted, `&__req { color: var(--status-danger) }`, `&__invalid { border-color: var(--status-danger) }`, `&__hint` muted, `&__muted` muted. The seal width comes from the parent grid column (420px).

- [ ] **Step 4: Run** seal spec + queue spec. Expected PASS.
- [ ] **Step 5: Commit** `git add frontend/src/app/admin/admin-support-tickets && git commit -m "feat(support-tickets): respond/status form in the ticket seal"`

---

### Task 6: Seal — log-a-ticket form

**Files:**
- Modify: `ticket-seal.component.ts`, `ticket-seal.component.spec.ts` (second `describe`, reusing the hoisted helpers from Task 5)

**Interfaces:**
- Consumes: `SupportTicketService.create`, `AssociateLookupComponent` (`[associates] [value] [placeholder] (selected)`), `classifyTicketError`.
- Produces: log-mode state `associateId`, `subject`, `description`, `logTried`, getter `logInvalid`; emits `logged(ticket)`, `flash({key:'admin.supportTickets.ok.logged', params:{subject, name, userId}})`, `cancelLog`.

- [ ] **Step 1: Failing tests** (append):

```ts
describe('TicketSealComponent (log)', () => {
  const dir = [{ id: 'a1', userId: 'VA-1', name: 'Jane', role: 'ASSOCIATE', hasFreeSlot: true }];
  const fill = (a = 'a1', s = 'Printer', d = 'Jammed') => { const c = fixture.componentInstance; c.associateId = a; c.subject = s; c.description = d; fixture.detectChanges(); };

  beforeEach(() => setup('log', dir));
  afterEach(() => http.verify());

  it('missing associate, subject or description sends nothing and shows the required message', () => {
    fill('', 'x', 'y'); submit(); http.expectNone('/api/admin/support-tickets');
    fill('a1', '   ', 'y'); submit(); http.expectNone('/api/admin/support-tickets');
    fill('a1', 'x', '  '); submit(); fixture.detectChanges();
    http.expectNone('/api/admin/support-tickets');
    expect(el().textContent).toContain('admin.supportTickets.err.logRequired');
  });

  it('subject input caps at 200 characters and a longer programmatic subject is blocked', () => {
    expect(el().querySelector('input[name=subject]')!.getAttribute('maxlength')).toBe('200');
    fill('a1', 'x'.repeat(201), 'y'); submit(); http.expectNone('/api/admin/support-tickets');
  });

  it('posts trimmed fields, then emits logged + flash with the associate name and userId', () => {
    const logged = jasmine.createSpy('logged'); const flash = jasmine.createSpy('flash');
    fixture.componentInstance.logged.subscribe(logged); fixture.componentInstance.flash.subscribe(flash);
    fill('a1', '  Printer  ', ' Jammed ');
    submit();
    const r = http.expectOne('/api/admin/support-tickets');
    expect(r.request.method).toBe('POST');
    expect(r.request.body).toEqual({ associateId: 'a1', subject: 'Printer', description: 'Jammed' });
    r.flush(tk(), { status: 201, statusText: 'Created' });
    expect(logged).toHaveBeenCalled();
    expect(flash).toHaveBeenCalledWith({ key: 'admin.supportTickets.ok.logged', params: { subject: 'Printer', name: 'Jane', userId: 'VA-1' } });
  });

  it('double submit sends once', () => {
    fill(); submit(); submit();
    http.expectOne('/api/admin/support-tickets').flush(tk(), { status: 201, statusText: 'Created' });
  });

  it('404 shows the associate-not-found message under the lookup and keeps the form input', () => {
    fill(); submit();
    http.expectOne('/api/admin/support-tickets').flush({ error: 'Associate not found' }, { status: 404, statusText: 'NF' });
    fixture.detectChanges();
    expect(el().querySelector('.ticket-seal__lookup-error')!.textContent).toContain('admin.supportTickets.err.associateNotFound');
    expect(fixture.componentInstance.subject).toBe('Printer');
  });

  it('400 shows the server text; Cancel emits cancelLog', () => {
    fill(); submit();
    http.expectOne('/api/admin/support-tickets').flush({ error: 'subject must not be blank' }, { status: 400, statusText: 'Bad' });
    fixture.detectChanges();
    expect(el().textContent).toContain('subject must not be blank');
    const cancel = jasmine.createSpy('cancel'); fixture.componentInstance.cancelLog.subscribe(cancel);
    el().querySelector<HTMLButtonElement>('.ticket-seal__cancel')!.click();
    expect(cancel).toHaveBeenCalled();
  });

  it('re-entering log mode clears previous log input', () => {
    fill();
    fixture.componentRef.setInput('mode', 'respond'); fixture.detectChanges();
    fixture.componentRef.setInput('mode', 'log'); fixture.detectChanges();
    expect(fixture.componentInstance.subject).toBe('');
    expect(fixture.componentInstance.associateId).toBe('');
  });
});
```

- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** Add to the template (sibling of the respond `ng-container`, inside the `<section>`):

```html
      <!-- LOG -->
      <ng-container *ngIf="mode === 'log'">
        <h2 #title tabindex="-1" class="ticket-seal__title">{{ 'admin.supportTickets.seal.log' | translate }}</h2>
        <app-inline-banner *ngIf="error && error.kind !== 'notFound'" tone="danger"><span role="alert">{{ error.kind === 'validation' && error.serverText ? error.serverText : (errorKey | translate) }}</span></app-inline-banner>
        <form class="ticket-seal__form" (submit)="submitLog(); $event.preventDefault()" novalidate>
          <div class="ticket-seal__field">{{ 'admin.supportTickets.seal.associate' | translate }}
            <app-associate-lookup [associates]="directory" [value]="associateId" [placeholder]="'admin.supportTickets.filter.anyAssociate' | translate"
              (selected)="associateId = $event?.id ?? ''; error = null"></app-associate-lookup>
            <div class="ticket-seal__lookup-error" role="alert" *ngIf="error?.kind === 'notFound'">{{ 'admin.supportTickets.err.associateNotFound' | translate }}</div>
          </div>
          <label class="ticket-seal__field">{{ 'admin.supportTickets.seal.subject' | translate }}
            <input type="text" name="subject" maxlength="200" [disabled]="busy" [value]="subject" (input)="subject = $any($event.target).value" />
          </label>
          <label class="ticket-seal__field">{{ 'admin.supportTickets.seal.descriptionField' | translate }}
            <textarea rows="5" name="description" [disabled]="busy" [value]="description" (input)="description = $any($event.target).value"></textarea>
          </label>
          <div role="alert"><app-field-error [message]="logInvalid ? ('admin.supportTickets.err.logRequired' | translate) : undefined"></app-field-error></div>
          <div class="ticket-seal__form-actions">
            <button type="submit" class="brand-button ticket-seal__submit" [disabled]="busy" [attr.aria-busy]="busy">{{ (busy ? 'admin.supportTickets.action.logging' : 'admin.supportTickets.action.log') | translate }}</button>
            <button type="button" class="brand-button brand-button--secondary ticket-seal__cancel" [disabled]="busy" (click)="cancelLog.emit()">{{ 'admin.supportTickets.action.cancel' | translate }}</button>
          </div>
        </form>
      </ng-container>
```

Class additions:

```ts
  associateId = ''; subject = ''; description = ''; logTried = false;

  get logInvalid(): boolean {
    const s = this.subject.trim();
    return this.logTried && (!this.associateId || !s || s.length > 200 || !this.description.trim());
  }

  // in ngOnChanges, add:
  //   if (ch['mode'] && this.mode === 'log') {
  //     this.associateId = ''; this.subject = ''; this.description = ''; this.logTried = false; this.error = null; this.focusTitle();
  //   }

  submitLog(): void {
    if (this.busy) { return; }
    this.logTried = true;
    this.error = null;
    if (this.logInvalid) { return; }
    this.setBusy(true);
    this.service.create({ associateId: this.associateId, subject: this.subject.trim(), description: this.description.trim() }).subscribe({
      next: res => {
        this.setBusy(false);
        this.logTried = false;
        this.flash.emit({ key: 'admin.supportTickets.ok.logged', params: { subject: res.subject, name: res.associateName, userId: res.associateUserId } });
        this.logged.emit(res);
      },
      error: (err: HttpErrorResponse) => { this.setBusy(false); this.error = classifyTicketError(err); }
    });
  }
```

(The test's flushed `tk()` has `subject: 'Printer'`, `associateName: 'Jane'`, `associateUserId: 'VA-1'`, matching the asserted flash params.) Add `.ticket-seal__lookup-error { color: var(--status-danger); font-size: 0.8125rem; }` to the SCSS.

- [ ] **Step 4: Run** seal + queue specs. Expected PASS (Tasks 4-6).
- [ ] **Step 5: Commit** `git add frontend/src/app/admin/admin-support-tickets && git commit -m "feat(support-tickets): log-a-ticket form in the ticket seal"`

---

### Task 7: Page-to-seal integration, responsive and a11y pass

**Files:**
- Test: `admin-support-tickets.component.spec.ts` (add two integration cases)
- Modify: the two SCSS files only if gaps are found

- [ ] **Step 1: Add the integration tests** (add `import { By } from '@angular/platform-browser'` and `import { TicketSealComponent } from './ticket-seal.component'`):

```ts
  it('logging a ticket selects it, reloads page 0 and shows the success banner', () => {
    boot();
    el().querySelector<HTMLButtonElement>('.support-tickets__log')!.click(); fixture.detectChanges();
    const seal = fixture.debugElement.query(By.directive(TicketSealComponent)).componentInstance as TicketSealComponent;
    seal.associateId = 'a1'; seal.subject = 'New'; seal.description = 'Body';
    seal.submitLog();
    http.expectOne(r => r.method === 'POST' && r.url === '/api/admin/support-tickets').flush(tk('t9', { subject: 'New' }), { status: 201, statusText: 'Created' });
    listReq().flush(pageOf([tk('t9', { subject: 'New' }), tk('t1')]));
    fixture.detectChanges();
    expect(fixture.componentInstance.selected!.id).toBe('t9');
    expect(fixture.componentInstance.sealMode).toBe('respond');
    expect(el().textContent).toContain('admin.supportTickets.ok.logged');
  });

  it('responding keeps the selection and shows the success banner', () => {
    boot();
    fixture.componentInstance.selectTicket(fixture.componentInstance.page!.entries[0]); fixture.detectChanges();
    const seal = fixture.debugElement.query(By.directive(TicketSealComponent)).componentInstance as TicketSealComponent;
    seal.status = 'RESOLVED'; seal.reply = 'Done';
    seal.submitRespond();
    http.expectOne('/api/admin/support-tickets/t1/respond').flush(tk('t1', { status: 'RESOLVED', response: 'Done' }));
    listReq().flush(pageOf([tk('t1', { status: 'RESOLVED', response: 'Done' }), tk('t2')]));
    fixture.detectChanges();
    expect(fixture.componentInstance.selected!.status).toBe('RESOLVED');
    expect(el().textContent).toContain('admin.supportTickets.ok.responded');
  });
```

A failure here is a wiring bug in Tasks 4-6 components; fix the component, not the test.

- [ ] **Step 2:** Run the full frontend suite from `frontend/`: `npx ng test --watch=false --browsers=ChromeHeadless`. Expected: all PASS, no regressions in the nav/routes specs.
- [ ] **Step 3:** Confirm the SCSS covers: `<=960px` seal `position: static`, `<=768px` table becomes `data-label` stacked cards, 44px touch targets on buttons/inputs, `prefers-reduced-motion` stops the skeleton shimmer, visible focus rings on `.support-tickets__row` and the seal title. Fix gaps.
- [ ] **Step 4: Commit** `git add frontend/src/app/admin/admin-support-tickets && git commit -m "test(support-tickets): queue and seal integration, responsive polish"`

---

### Task 8: Production build and real-app verification

**Files:** none (verification). The units-file `merged` edit is the coordinator's job after merge.

- [ ] **Step 1: Production build budgets.** From `frontend/`: `npx ng build --configuration production`. Expected: success; no `anyComponentStyle` error (4kB) for the two new SCSS files; initial bundle under 1.2MB; a separate lazy chunk for `admin-support-tickets`. If a SCSS file is over budget, trim or split it; do not raise the budget.
- [ ] **Step 2: Start the stack** per the `run` skill (backend `cd backend && ./mvnw spring-boot:run` on 8081, frontend dev server, DB). Log in as admin; open `/settings/support-tickets` through the System nav tab (label "Support Tickets"; System category lights up).
- [ ] **Step 3: Drive the flows in the real app** against the real backend:
  1. Empty queue shows "No tickets yet" and a working "Log a ticket" button.
  2. Submit the empty log form: required message, no request. Choose an associate, subject, description: success banner, ticket selected, listed first as Open.
  3. Select it, choose In progress with a blank reply, Save: chip updates, banner shows, no reply appears.
  4. Choose Resolved with a blank reply: inline error, no request in the network tab. Add a reply: saved; "Current reply" quote and "Replied {date}" show.
  5. Save a different reply on the same ticket: no confirm dialog, reply replaced, hint text visible.
  6. Status filter = Open while a Resolved ticket is selected: the "no longer matches" note appears; Reset filters clears it.
  7. Associate filter narrows the list to that associate.
  8. Pager (seed >20 tickets or use a second associate's data): Previous/Next disabled at the ends, pager text correct.
  9. Stop the backend, reload the queue: danger banner + Retry; restart backend, Retry loads.
  10. Resize to <=960px and <=768px: seal below the list, stacked cards, focus lands on the seal heading after selecting a row.
  11. An ASSOCIATE login cannot open `/settings/support-tickets`, and `GET /api/admin/support-tickets` with that token is 403.
- [ ] **Step 4:** Report the results; fix any defect found with a failing spec first.

---

## Self-Review

- **Spec/units-row coverage:** queue + status/associate filters + pagination (Tasks 1, 4); log form with lookup, 400/404 surfaced (Task 6); respond/status form, Resolved/Closed requires a reply client-side plus server 400 surfaced, status-only allowed (Tasks 2, 5); nav entry (Task 3); live tokens, shared components, lazy route (Tasks 3-5); component/service specs, no e2e (all). Decision 2 (single reply, replace, no confirm): Task 5 hint copy. Decision 5 (no detail endpoint): rows carry full content, seal reads from the selected row.
- **Placeholders:** SCSS bodies are specified by explicit transcription from named existing files with listed renames and deltas rather than reprinted; all TS, specs, i18n and commands are literal.
- **Type consistency:** `TicketFilters`, `SupportTicketPage.entries`, page methods (`applyFilter/resetFilters/reload/goTo/selectTicket/startLog/onCancelLog/onSaved/onLogged`), seal inputs/outputs, `FlashMessage`, `respondPayload`, `classifyTicketError` match across Tasks 1-7.
- **Review Focus:** items 1-8 each map to named tests (blank reply, status-only payload, double submit, stale race, filter mismatch, 404s, subject length, empty/error states).

## Coordinator decisions (user-approved 2026-10-06)

- Nav: new item goes at the end of the `system` category (KYC Review is in `network`; user chose `system`).
- After logging a ticket, select it even if active filters hide it, with the "no longer matches" note.
- `hi.json`: English text except the nav label.
