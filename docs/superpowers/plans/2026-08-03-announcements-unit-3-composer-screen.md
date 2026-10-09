# Announcements Unit 3: Admin "Announcements" Composer Screen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give an Admin `/settings/announcements`: a compose form (title <= 300, body) that publishes live immediately, beside a paged, newest-first list of everything published, with a permanent "goes live immediately and can't be changed" warning and no edit/delete affordance.

**Architecture:** `AdminAnnouncementsComponent` owns the paged list, the success flash, the "just published" marker and the write lock; `AnnouncementComposeFormComponent` owns the form, client validation and the publish call. Both use a new shared `AnnouncementService` + `announcement.model.ts` (this unit CREATES them; unit 4's associate feed reuses `list`). Lazy route; styles split across three small lazy SCSS files on the LIVE gold/oxblood tokens (no port). Modeled on the merged Support Tickets admin screen (`frontend/src/app/admin/admin-support-tickets/`).

**Tech Stack:** Angular 18 standalone components, `@ngx-translate/core`, `HttpClient`, Karma + Jasmine with `HttpClientTestingModule`, SCSS (`ViewEncapsulation.None`). No new libraries, no new tokens.

**Spec:** `docs/superpowers/specs/role-capability/2026-08-03-announcements-domain-design.md` (Flows; Decisions 1, 3; Resolved decisions 1; Error handling) and the role-capability spec "Screens". Unit row: `docs/superpowers/plans/2026-08-03-announcements-units.md` unit 3. Design: `docs/design/admin_operational_screens/announcement_composer/` (`DESIGN.md`, `code.html`, PNGs).

## Prerequisites

- Backend units 1-2 merged (verified: `backend/src/main/java/com/plotchain/announcement/`). Frontend-only; zero backend changes.

## Shared files for unit 4 (this unit CREATES them; unit 4 reuses)

| File | Unit 3 creates | Unit 4 does |
|---|---|---|
| `frontend/src/app/announcements/announcement.model.ts` | `ANNOUNCEMENT_TITLE_MAX = 300`, `Announcement`, `AnnouncementPage`, `CreateAnnouncementRequest` | import `Announcement`, `AnnouncementPage` only |
| `frontend/src/app/announcements/announcement.service.ts` (+ `.spec.ts`) | `AnnouncementService` (`providedIn: 'root'`): `list(page: number, size: number): Observable<AnnouncementPage>`, `publish(req: CreateAnnouncementRequest): Observable<Announcement>` | call `list(page, size)`; do not change existing methods |
| `frontend/src/app/admin/admin-announcements/admin-announcements.util.ts` | `bodyNeedsToggle`, `validateDraft`, etc. | not needed (admin-only); if unit 4 wants the same clamp heuristic it imports `bodyNeedsToggle` from here or copies it |

**Rebase rule:** unit 4 is built AFTER unit 3 and rebases onto post-unit-3 text of every shared file below. Exact insertion points (so both units' hunks don't collide):

| Shared file | Unit 3 inserts | Unit 4 inserts |
|---|---|---|
| `frontend/src/app/app.routes.ts` | settings child `announcements` immediately AFTER the `support-tickets` child (currently line 105, inside `children` of `settings`, before the "There is no settings hub screen" comment) | a top-level associate route near the top-level `support-tickets` route (line 66), NOT in `settings.children` |
| `frontend/src/app/app.routes.spec.ts` | a `it(...)` right after the "has a lazy support-tickets child..." test (line ~209-216) inside the settings describe | its own `it` near the top-level support-tickets guard test (line ~43) |
| `frontend/src/app/admin-nav-categories.model.ts` (+ spec) | 4th item in the `system` items array after `supportTickets` | untouched (admin nav) |
| `frontend/src/app/associate-nav-items.model.ts` (+ spec) | untouched | adds its item |
| `frontend/src/assets/i18n/en.json` + `hi.json` | (a) `settings.sections.announcements` after `settings.sections.supportTickets`; (b) a NEW top-level `"announcements": { "composer": { ... } }` object directly AFTER the top-level `"supportTickets"` block (en.json ~line 499-525, hi.json ~464-489) and before `"payoutHistory"` | adds sibling `"feed": { ... }` INSIDE the same `announcements` object, after `composer`; never edits `composer` |
| `frontend/src/styles/_admin.scss` | NOT edited (styles live in component SCSS, as Support Tickets did) | not edited either; unit 4 uses `.announcement-feed*` in its own component SCSS |

Class prefix: `.announcement-composer*` is this unit's. `.support-tickets*` and `.ticket-history*` are taken; `.announcement-feed*` is unit 4's.

## Real backend contract (read from source)

- `POST /api/admin/announcements` body `{title, body}`; `CreateAnnouncementRequest`: `title` `@NotBlank @Size(max=300)`, `body` `@NotBlank`, body unbounded. **201** `AnnouncementResponse {id, title, body, publishedAt}` (ISO instant). `audience` is not exposed. Validation failure: **400** `{ "error": "validation failed", "fields": { "<field>": "<message>" } }` (`ApiExceptionHandler`, first message per field wins). Non-ADMIN: 403.
- `GET /api/announcements?page&size` (any authenticated user) → `{entries:[{id,title,body,publishedAt}], page, size, totalElements}`, `publishedAt` DESC; page clamped >= 0, size clamped 1..100, default 20.

## Global Constraints

- Route: child of the existing `settings` parent (inherits `[authGuard, adminGuard, launchedModeGuard]`), path `announcements`, `data: { sectionKey: 'announcements' }`, **lazy** `loadComponent`. Nav item `{ key: 'announcements', labelKey: 'settings.sections.announcements', path: '/settings/announcements' }` as the LAST item of the `system` category (after Support Tickets). `labelKey` must equal `'settings.sections.' + key` (existing nav spec enforces).
- Tokens: ONLY existing live tokens (`--surface-*`, `--border-subtle`, `--text-*`, `--brand-primary/secondary/primary-soft/primary-bright`, `--status-success/warning/danger` (there are NO `--status-*-text` variants in the live styles: the over-limit counter, the required asterisk and the invalid border use `var(--status-danger)`), `--font-*`, `--radius-sm`). No new tokens. Reuse global `.brand-button(--secondary)`, `.inline-banner--*` (via `app-inline-banner`), `.field-error` (via `app-field-error`), global input/textarea styles.
- **No confirm dialog on publish** (user decision). The only guard is the permanent, non-dismissible warning banner.
- **No backend body limit**; title max 300 is enforced client-side too (raw `title.length > 300` blocks; counter `n / 300`; NO `maxlength` attribute so an over-limit paste stays visible and gets the error). Title/body are trimmed before sending; whitespace-only counts as blank. Body internal line breaks are preserved.
- Admin list page size **10** (`PAGE_SIZE = 10`).
- Dates via Angular `date` pipe in the viewer's local time (app `LOCALE_ID` is `en-IN`). Body is plain text, `white-space: pre-wrap`, URLs NOT linkified (render with `{{ }}` interpolation only, never `innerHTML`).
- Copy: sentence case; one verb through the flow ("Publish announcement" -> "Publishing…" -> "Announcement published"). `hi.json` carries English text for every new key except the nav label (`"घोषणाएँ"`).
- Accessibility rules carried over from the Support Tickets review fixes: busy submit/Clear buttons use `aria-disabled="true"` (NOT `disabled`) and busy inputs use `readOnly` (NOT `disabled`) so focus is never lost; `aria-live` only on small status text, never a whole panel; `role="alert"` only on error text; error banner + Retry; skeleton `role="status"`; focus returns to Title after a successful publish and after Clear.
- No e2e (deferred per memory). Component/service specs only; real-app verification is the last task.

## Review Focus

1. Whitespace-only title or body: blocked client-side, no request, message shown, focus moves to the first invalid field (Task 3).
2. Title pasted at 301+ characters (including emoji / pasted newlines): stays visible, counter turns danger, "Shorten it by N" error, no request; exactly 300 is accepted (Task 3).
3. Double-click / Enter-mash on Publish: exactly one POST (in-flight lock); fields stay focusable and unchanged while busy (Task 3).
4. Publish fails (network/5xx) or 400: typed text is kept, nothing is cleared, retry works; the user is told "Nothing was sent to associates" (Task 3).
5. Very long or multi-line body, and a body with `<script>`/URLs: rendered as inert plain text, line breaks kept, clamped to 3 lines with a working "Show full text" toggle; a short body has no toggle (Tasks 2, 4).
6. A slow earlier list response arriving after a newer one (publish while paging, or Retry spam) must not overwrite the newer page; a page change while a load is in flight is ignored (Task 4).
7. Publish succeeds while the list is in error state: success banner still shows and the list load is retried (Task 4).
8. Mobile order: compose form comes first for keyboard / screen-reader / visual order alike (Task 4).

---

## File Structure

| File | Responsibility |
|---|---|
| Create `frontend/src/app/announcements/announcement.model.ts` | Shared types + `ANNOUNCEMENT_TITLE_MAX` |
| Create `frontend/src/app/announcements/announcement.service.ts` (+ `.spec.ts`) | `list`, `publish` |
| Create `frontend/src/app/admin/admin-announcements/admin-announcements.util.ts` (+ `.spec.ts`) | Pure helpers: `FlashMessage`, `validateDraft`, `publishPayload`, `classifyPublishError`, `bodyNeedsToggle` |
| Create `.../announcement-compose-form.component.ts` (+ `.scss`, `.spec.ts`) | Seal form: counter, validation, publish write, errors, focus |
| Create `.../admin-announcements.component.ts` (+ `.scss`, `-items.scss`, `.spec.ts`) | Page: header, flash, grid, list, pager, states |
| Modify `frontend/src/app/admin-nav-categories.model.ts` + `.spec.ts` | Nav item |
| Modify `frontend/src/app/app.routes.ts` + `.spec.ts` | Lazy route |
| Modify `frontend/src/assets/i18n/en.json`, `hi.json` | Keys |

Three SCSS files so each stays well under the 2kB-warn / 4kB-error `anyComponentStyle` budget (do not raise the budget).

---

### Task 1: Shared announcement model and API service

**Files:**
- Create: `frontend/src/app/announcements/announcement.model.ts`
- Create: `frontend/src/app/announcements/announcement.service.ts`
- Test: `frontend/src/app/announcements/announcement.service.spec.ts`

**Interfaces:**
- Produces (unit 3 Tasks 3-4 and unit 4 rely on these exact names):
  - `ANNOUNCEMENT_TITLE_MAX: number` (300), `interface Announcement { id: string; title: string; body: string; publishedAt: string }`, `interface AnnouncementPage { entries: Announcement[]; page: number; size: number; totalElements: number }`, `interface CreateAnnouncementRequest { title: string; body: string }`
  - `AnnouncementService.list(page: number, size: number): Observable<AnnouncementPage>`; `AnnouncementService.publish(req: CreateAnnouncementRequest): Observable<Announcement>`

- [ ] **Step 1: Write the failing test** (`announcement.service.spec.ts`)

```ts
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AnnouncementService } from './announcement.service';

describe('AnnouncementService', () => {
  let s: AnnouncementService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    s = TestBed.inject(AnnouncementService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('lists the feed with page and size only', () => {
    s.list(2, 10).subscribe();
    const r = http.expectOne(x => x.url === '/api/announcements');
    expect(r.request.method).toBe('GET');
    expect(r.request.params.get('page')).toBe('2');
    expect(r.request.params.get('size')).toBe('10');
    expect(r.request.params.keys().sort()).toEqual(['page', 'size']);
    r.flush({ entries: [], page: 2, size: 10, totalElements: 0 });
  });

  it('publishes by POST to the admin endpoint with exactly title and body', () => {
    let got: unknown;
    s.publish({ title: 'T', body: 'B' }).subscribe(a => (got = a));
    const r = http.expectOne('/api/admin/announcements');
    expect(r.request.method).toBe('POST');
    expect(r.request.body).toEqual({ title: 'T', body: 'B' });
    r.flush({ id: 'a1', title: 'T', body: 'B', publishedAt: '2026-10-09T08:00:00Z' }, { status: 201, statusText: 'Created' });
    expect(got).toEqual({ id: 'a1', title: 'T', body: 'B', publishedAt: '2026-10-09T08:00:00Z' });
  });
});
```

- [ ] **Step 2: Run to verify it fails.** From `frontend/`: `npx ng test --watch=false --browsers=ChromeHeadless --include='src/app/announcements/**/*.spec.ts'`. Expected: FAIL (cannot find module `./announcement.service`).

- [ ] **Step 3: Implement.**

`announcement.model.ts`:
```ts
export const ANNOUNCEMENT_TITLE_MAX = 300; // matches backend @Size(max = 300) / announcement.title VARCHAR(300)

// Mirrors backend AnnouncementResponse; audience is deliberately not exposed (spec Decision 2).
export interface Announcement { id: string; title: string; body: string; publishedAt: string; }
// Mirrors backend AnnouncementPageResponse (list field is "entries").
export interface AnnouncementPage { entries: Announcement[]; page: number; size: number; totalElements: number; }
export interface CreateAnnouncementRequest { title: string; body: string; }
```

`announcement.service.ts`:
```ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Announcement, AnnouncementPage, CreateAnnouncementRequest } from './announcement.model';

@Injectable({ providedIn: 'root' })
export class AnnouncementService {
  private http = inject(HttpClient);

  list(page: number, size: number): Observable<AnnouncementPage> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<AnnouncementPage>('/api/announcements', { params });
  }

  publish(req: CreateAnnouncementRequest): Observable<Announcement> {
    return this.http.post<Announcement>('/api/admin/announcements', req);
  }
}
```

- [ ] **Step 4: Run the same command; expected PASS.**
- [ ] **Step 5: Commit**
```bash
git add frontend/src/app/announcements
git commit -m "feat(announcements): shared announcement model and API service"
```

---

### Task 2: Pure helpers (validation, payload, error classification, clamp heuristic)

**Files:**
- Create: `frontend/src/app/admin/admin-announcements/admin-announcements.util.ts`
- Test: `frontend/src/app/admin/admin-announcements/admin-announcements.util.spec.ts`

**Interfaces:**
- Consumes: `ANNOUNCEMENT_TITLE_MAX`, `CreateAnnouncementRequest` (Task 1).
- Produces:
  - `interface FlashMessage { key: string; params?: Record<string, unknown> }`
  - `interface DraftErrors { title?: 'required' | 'tooLong'; body?: 'required'; over: number }`
  - `validateDraft(title: string, body: string): DraftErrors | null` (null = valid; `over` = chars above 300, 0 otherwise)
  - `publishPayload(title: string, body: string): CreateAnnouncementRequest` (trimmed)
  - `type PublishErrorKind = 'validation' | 'network' | 'generic'`; `classifyPublishError(err: { status: number; error?: { fields?: Record<string, string> } }): { kind: PublishErrorKind; fields?: { title?: string; body?: string } }`
  - `bodyNeedsToggle(body: string): boolean`

- [ ] **Step 1: Write the failing test**

```ts
import { bodyNeedsToggle, classifyPublishError, publishPayload, validateDraft } from './admin-announcements.util';

describe('admin-announcements.util', () => {
  it('accepts a valid draft and exactly 300 characters', () => {
    expect(validateDraft('Hello', 'World')).toBeNull();
    expect(validateDraft('x'.repeat(300), 'b')).toBeNull();
  });
  it('treats whitespace-only title or body as blank, both reported in one pass', () => {
    expect(validateDraft('   ', '\n\t ')).toEqual({ title: 'required', body: 'required', over: 0 });
  });
  it('flags 301+ characters with how many to cut, using the raw length the counter shows', () => {
    expect(validateDraft('x'.repeat(305), 'b')).toEqual({ title: 'tooLong', over: 5 });
  });
  it('blank wins over too-long only for the title field it applies to', () => {
    expect(validateDraft('x'.repeat(301), '')).toEqual({ title: 'tooLong', body: 'required', over: 1 });
  });
  it('trims the payload but keeps interior line breaks', () => {
    expect(publishPayload('  T  ', '\n line1\n\nline2 \n')).toEqual({ title: 'T', body: 'line1\n\nline2' });
  });
  it('classifies errors: 0 network, 400 validation with fields, others generic', () => {
    expect(classifyPublishError({ status: 0 })).toEqual({ kind: 'network' });
    expect(classifyPublishError({ status: 500 })).toEqual({ kind: 'generic' });
    expect(classifyPublishError({ status: 403 })).toEqual({ kind: 'generic' });
    expect(classifyPublishError({ status: 400, error: { fields: { title: 'size must be between 0 and 300' } } }))
      .toEqual({ kind: 'validation', fields: { title: 'size must be between 0 and 300', body: undefined } });
    expect(classifyPublishError({ status: 400, error: {} })).toEqual({ kind: 'validation', fields: undefined });
  });
  it('shows the toggle for multi-line or long-ish bodies and not for short ones', () => {
    expect(bodyNeedsToggle('Short note')).toBeFalse();
    expect(bodyNeedsToggle('a\nb\nc')).toBeFalse();
    expect(bodyNeedsToggle('a\nb\nc\nd')).toBeTrue();
    expect(bodyNeedsToggle('x'.repeat(91))).toBeTrue();
  });
});
```

- [ ] **Step 2: Run** `npx ng test --watch=false --browsers=ChromeHeadless --include='src/app/admin/admin-announcements/**/*.util.spec.ts'`; expect FAIL (module missing).

- [ ] **Step 3: Implement** `admin-announcements.util.ts`

```ts
import { ANNOUNCEMENT_TITLE_MAX, CreateAnnouncementRequest } from '../../announcements/announcement.model';

export interface FlashMessage { key: string; params?: Record<string, unknown>; }
export interface DraftErrors { title?: 'required' | 'tooLong'; body?: 'required'; over: number; }
export type PublishErrorKind = 'validation' | 'network' | 'generic';

// Mirrors @NotBlank + @Size(max = 300). The limit uses the RAW length (what the counter shows), even
// though the payload is trimmed: a title whose only excess is trailing spaces is rejected, which
// keeps the counter and the error from ever disagreeing.
export function validateDraft(title: string, body: string): DraftErrors | null {
  const errors: DraftErrors = { over: 0 };
  if (!title.trim()) { errors.title = 'required'; }
  else if (title.length > ANNOUNCEMENT_TITLE_MAX) { errors.title = 'tooLong'; errors.over = title.length - ANNOUNCEMENT_TITLE_MAX; }
  if (!body.trim()) { errors.body = 'required'; }
  return errors.title || errors.body ? errors : null;
}

export function publishPayload(title: string, body: string): CreateAnnouncementRequest {
  return { title: title.trim(), body: body.trim() };
}

// 400 body shape (ApiExceptionHandler): { error: 'validation failed', fields: { title?: string, body?: string } }
export function classifyPublishError(err: { status: number; error?: { fields?: Record<string, string> } }): { kind: PublishErrorKind; fields?: { title?: string; body?: string } } {
  if (err.status === 0) { return { kind: 'network' }; }
  if (err.status === 400) {
    const f = err.error?.fields;
    return { kind: 'validation', fields: f ? { title: f['title'], body: f['body'] } : undefined };
  }
  return { kind: 'generic' };
}

// ponytail: length/line heuristic instead of measuring rendered overflow. Errs toward showing the
// toggle (harmless if the text actually fits) so clamped text can never be left without a way to expand.
// Ceiling: a very narrow viewport with a < 91-char, <= 3-line body that still wraps past 3 lines; upgrade
// to a ResizeObserver scrollHeight > clientHeight check if that ever shows up.
export function bodyNeedsToggle(body: string): boolean {
  return body.length > 90 || body.split('\n').length > 3;
}
```

- [ ] **Step 4: Run; expect PASS.** (If the "blank wins" expectation fails because of the early return, adjust the implementation, not the spec: the spec above is the contract.)
- [ ] **Step 5: Commit** `git add frontend/src/app/admin/admin-announcements && git commit -m "feat(announcements): composer validation and clamp helpers"`

---

### Task 3: Compose form component (seal)

**Files:**
- Create: `frontend/src/app/admin/admin-announcements/announcement-compose-form.component.ts`
- Create: `frontend/src/app/admin/admin-announcements/announcement-compose-form.component.scss`
- Test: `frontend/src/app/admin/admin-announcements/announcement-compose-form.component.spec.ts`

**Interfaces:**
- Consumes: `AnnouncementService.publish`, `Announcement`, `ANNOUNCEMENT_TITLE_MAX` (Task 1); `validateDraft`, `publishPayload`, `classifyPublishError` (Task 2); `InlineBannerComponent` (`app-inline-banner`, `tone`), `FieldErrorComponent` (`app-field-error`, `[message]`).
- Produces: selector `app-announcement-compose-form`; `@Output() published = new EventEmitter<Announcement>()` (emitted AFTER the form has cleared); `@Output() busyChange = new EventEmitter<boolean>()`; ids `announcement-composer-title`, `announcement-composer-body`; public fields `title`, `body`, `busy`, `tried`, `publishFailed`; methods `submit()`, `clear()`. Host element carries class `announcement-composer__form-host` (Task 4 positions it in the grid).

- [ ] **Step 1: Write the failing spec** (`announcement-compose-form.component.spec.ts`)

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { AnnouncementComposeFormComponent } from './announcement-compose-form.component';

describe('AnnouncementComposeFormComponent', () => {
  let fixture: ComponentFixture<AnnouncementComposeFormComponent>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;
  const titleIn = () => el().querySelector<HTMLInputElement>('#announcement-composer-title')!;
  const bodyIn = () => el().querySelector<HTMLTextAreaElement>('#announcement-composer-body')!;
  const type = (e: HTMLInputElement | HTMLTextAreaElement, v: string) => { e.value = v; e.dispatchEvent(new Event('input')); fixture.detectChanges(); };
  const submit = () => { el().querySelector('form')!.dispatchEvent(new Event('submit')); fixture.detectChanges(); };
  const publishBtn = () => el().querySelector<HTMLButtonElement>('.announcement-composer__publish')!;
  const clearBtn = () => el().querySelector<HTMLButtonElement>('.announcement-composer__clear')!;
  const created = (over: Record<string, unknown> = {}) => ({ id: 'a1', title: 'T', body: 'B', publishedAt: '2026-10-09T08:00:00Z', ...over });

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AnnouncementComposeFormComponent, HttpClientTestingModule, TranslateModule.forRoot()] }).compileComponents();
    fixture = TestBed.createComponent(AnnouncementComposeFormComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });
  afterEach(() => http.verify());

  it('always shows the permanent warning and has no confirm step, edit or schedule controls', () => {
    expect(el().textContent).toContain('announcements.composer.form.warnTitle');
    expect(el().querySelector('.inline-banner__dismiss')).toBeNull();
    expect(el().querySelectorAll('button').length).toBe(2); // Publish + Clear only
  });

  it('counts the title as "n / 300" and turns the counter danger above 300 without a maxlength', () => {
    expect(el().querySelector('.announcement-composer__counter')!.textContent!.trim()).toBe('0 / 300');
    type(titleIn(), 'x'.repeat(301));
    const c = el().querySelector('.announcement-composer__counter')!;
    expect(c.textContent!.trim()).toBe('301 / 300');
    expect(c.classList).toContain('announcement-composer__counter--over');
    expect(titleIn().hasAttribute('maxlength')).toBeFalse();
    expect(titleIn().value.length).toBe(301);
  });

  it('blank submit sends nothing, shows both messages with aria-invalid, and focuses the first invalid field', () => {
    type(titleIn(), '   '); type(bodyIn(), '\n ');
    submit();
    expect(el().textContent).toContain('announcements.composer.err.titleRequired');
    expect(el().textContent).toContain('announcements.composer.err.bodyRequired');
    expect(titleIn().getAttribute('aria-invalid')).toBe('true');
    expect(bodyIn().getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(titleIn());
  });

  it('301 characters is rejected client-side with no request; exactly 300 is sent', () => {
    type(titleIn(), 'x'.repeat(301)); type(bodyIn(), 'b');
    submit();
    expect(el().textContent).toContain('announcements.composer.err.titleTooLong');
    http.expectNone('/api/admin/announcements');
    type(titleIn(), 'x'.repeat(300));
    submit();
    http.expectOne('/api/admin/announcements').flush(created(), { status: 201, statusText: 'Created' });
  });

  it('publishes trimmed text, then clears, resets the counter, emits published and returns focus to the title', () => {
    const spy = jasmine.createSpy('published'); fixture.componentInstance.published.subscribe(spy);
    type(titleIn(), '  Office closed  '); type(bodyIn(), 'Line 1\n\nLine 2 ');
    publishBtn().focus();
    submit();
    const r = http.expectOne('/api/admin/announcements');
    expect(r.request.body).toEqual({ title: 'Office closed', body: 'Line 1\n\nLine 2' });
    r.flush(created({ title: 'Office closed' }), { status: 201, statusText: 'Created' });
    fixture.detectChanges();
    expect(titleIn().value).toBe('');
    expect(bodyIn().value).toBe('');
    expect(el().querySelector('.announcement-composer__counter')!.textContent!.trim()).toBe('0 / 300');
    expect(el().querySelector('.field-error')).toBeNull();
    expect(spy).toHaveBeenCalledWith(jasmine.objectContaining({ id: 'a1' }));
    expect(document.activeElement).toBe(titleIn());
  });

  it('while publishing: aria-disabled (not disabled) buttons, readOnly (not disabled) fields, focus kept, one POST only', () => {
    const busy = jasmine.createSpy('busy'); fixture.componentInstance.busyChange.subscribe(busy);
    type(titleIn(), 'T'); type(bodyIn(), 'B');
    titleIn().focus();
    submit(); submit(); // double submit
    expect(publishBtn().disabled).toBeFalse();
    expect(publishBtn().getAttribute('aria-disabled')).toBe('true');
    expect(clearBtn().disabled).toBeFalse();
    expect(clearBtn().getAttribute('aria-disabled')).toBe('true');
    expect(titleIn().disabled).toBeFalse();
    expect(titleIn().readOnly).toBeTrue();
    expect(bodyIn().readOnly).toBeTrue();
    expect(document.activeElement).toBe(titleIn());
    expect(publishBtn().textContent).toContain('announcements.composer.form.publishing');
    clearBtn().click(); // Clear is inert while busy
    expect(titleIn().value).toBe('T');
    http.expectOne('/api/admin/announcements').flush(created(), { status: 201, statusText: 'Created' });
    fixture.detectChanges();
    expect(busy.calls.allArgs()).toEqual([[true], [false]]);
    expect(publishBtn().getAttribute('aria-disabled')).not.toBe('true');
  });

  it('a server 400 shows the per-field message in the same slot and keeps the text', () => {
    type(titleIn(), 'T'); type(bodyIn(), 'B');
    submit();
    http.expectOne('/api/admin/announcements').flush({ error: 'validation failed', fields: { title: 'size must be between 0 and 300' } }, { status: 400, statusText: 'Bad' });
    fixture.detectChanges();
    expect(el().textContent).toContain('size must be between 0 and 300');
    expect(titleIn().getAttribute('aria-invalid')).toBe('true');
    expect(titleIn().value).toBe('T');
    expect(el().querySelector('.announcement-composer__failed')).toBeNull();
  });

  it('a network or 5xx failure keeps the text, shows the "nothing was sent" banner, and a second Publish retries', () => {
    type(titleIn(), 'T'); type(bodyIn(), 'B');
    submit();
    http.expectOne('/api/admin/announcements').flush('boom', { status: 500, statusText: 'err' });
    fixture.detectChanges();
    expect(el().querySelector('.announcement-composer__failed')!.textContent).toContain('announcements.composer.err.publish');
    expect(titleIn().value).toBe('T');
    expect(bodyIn().value).toBe('B');
    submit();
    expect(el().querySelector('.announcement-composer__failed')).toBeNull();
    http.expectOne('/api/admin/announcements').flush(created(), { status: 201, statusText: 'Created' });
  });

  it('Clear empties both fields, errors and counter and focuses the title', () => {
    type(titleIn(), 'T'); type(bodyIn(), 'B'); submit();
    http.expectOne('/api/admin/announcements').flush('x', { status: 500, statusText: 'err' });
    fixture.detectChanges();
    clearBtn().click(); fixture.detectChanges();
    expect(titleIn().value).toBe('');
    expect(el().querySelector('.announcement-composer__failed')).toBeNull();
    expect(document.activeElement).toBe(titleIn());
  });

  it('keeps live-region roles tight: no aria-live on the panel, role=alert only on error text', () => {
    const seal = el().querySelector('.announcement-composer__seal')!;
    expect(seal.hasAttribute('aria-live')).toBeFalse();
    expect(seal.hasAttribute('role')).toBeFalse();
    type(titleIn(), 'T'); type(bodyIn(), 'B'); submit();
    http.expectOne('/api/admin/announcements').flush('x', { status: 500, statusText: 'err' });
    fixture.detectChanges();
    const alerts = Array.from(el().querySelectorAll('[role="alert"]'));
    expect(alerts.some(a => a.classList.contains('announcement-composer__failed'))).toBeTrue();
    expect(alerts.every(a => a.tagName === 'SPAN' || a.tagName === 'DIV')).toBeTrue();
    expect(el().querySelector('form')!.hasAttribute('role')).toBeFalse();
  });

  it('renders typed script text as inert characters (interpolation only)', () => {
    type(titleIn(), '<img src=x onerror=alert(1)>'); type(bodyIn(), 'B');
    expect(el().querySelector('img')).toBeNull();
  });
});
```

- [ ] **Step 2: Run** `npx ng test --watch=false --browsers=ChromeHeadless --include='src/app/admin/admin-announcements/announcement-compose-form*.spec.ts'`; expect FAIL (component missing).

- [ ] **Step 3: Implement the component** (`announcement-compose-form.component.ts`)

```ts
import { Component, ElementRef, EventEmitter, Output, ViewChild, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { FieldErrorComponent } from '../../shared/components/field-error/field-error.component';
import { ANNOUNCEMENT_TITLE_MAX, Announcement } from '../../announcements/announcement.model';
import { AnnouncementService } from '../../announcements/announcement.service';
import { DraftErrors, classifyPublishError, publishPayload, validateDraft } from './admin-announcements.util';

@Component({
  selector: 'app-announcement-compose-form',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  host: { class: 'announcement-composer__form-host' },
  styleUrls: ['./announcement-compose-form.component.scss'],
  imports: [CommonModule, TranslateModule, InlineBannerComponent, FieldErrorComponent],
  template: `
    <aside class="announcement-composer__seal" aria-labelledby="announcement-composer-seal-h">
      <h2 id="announcement-composer-seal-h">{{ 'announcements.composer.form.heading' | translate }}</h2>
      <app-inline-banner tone="warning">
        <p><strong>{{ 'announcements.composer.form.warnTitle' | translate }}</strong> {{ 'announcements.composer.form.warnBody' | translate }}</p>
      </app-inline-banner>
      <form class="announcement-composer__form" (submit)="submit(); $event.preventDefault()" novalidate>
        <div class="announcement-composer__field">
          <label for="announcement-composer-title">
            <span>{{ 'announcements.composer.form.title' | translate }} <span class="announcement-composer__req" aria-hidden="true">*</span></span>
            <span class="announcement-composer__counter" [class.announcement-composer__counter--over]="over > 0">{{ 'announcements.composer.form.counter' | translate: { count: title.length, max: max } }}</span>
          </label>
          <input #titleInput type="text" id="announcement-composer-title" autocomplete="off" aria-describedby="announcement-composer-title-error"
            [readOnly]="busy" [value]="title" (input)="onTitle($any($event.target).value)"
            [class.announcement-composer__invalid]="titleInvalid" [attr.aria-invalid]="titleInvalid ? 'true' : null" />
          <div id="announcement-composer-title-error" role="alert">
            <app-field-error [message]="titleKey ? (titleKey | translate: { over: errors?.over }) : serverFields?.title"></app-field-error>
          </div>
        </div>
        <div class="announcement-composer__field">
          <label for="announcement-composer-body">
            <span>{{ 'announcements.composer.form.body' | translate }} <span class="announcement-composer__req" aria-hidden="true">*</span></span>
          </label>
          <textarea #bodyInput id="announcement-composer-body" rows="7" aria-describedby="announcement-composer-body-error"
            [placeholder]="'announcements.composer.form.bodyPlaceholder' | translate"
            [readOnly]="busy" [value]="body" (input)="onBody($any($event.target).value)"
            [class.announcement-composer__invalid]="bodyInvalid" [attr.aria-invalid]="bodyInvalid ? 'true' : null"></textarea>
          <div id="announcement-composer-body-error" role="alert">
            <app-field-error [message]="bodyKey ? (bodyKey | translate) : serverFields?.body"></app-field-error>
          </div>
        </div>
        <app-inline-banner *ngIf="publishFailed" tone="danger">
          <span class="announcement-composer__failed" role="alert">{{ 'announcements.composer.err.publish' | translate }}</span>
        </app-inline-banner>
        <div class="announcement-composer__actions">
          <button type="submit" class="brand-button announcement-composer__publish" [attr.aria-disabled]="busy ? 'true' : null" [attr.aria-busy]="busy">
            <span *ngIf="busy; else icon" class="announcement-composer__spin" aria-hidden="true"></span>
            <ng-template #icon><span class="material-symbols-outlined" aria-hidden="true">campaign</span></ng-template>
            <span>{{ (busy ? 'announcements.composer.form.publishing' : 'announcements.composer.form.publish') | translate }}</span>
          </button>
          <button type="button" class="brand-button brand-button--secondary announcement-composer__clear" [attr.aria-disabled]="busy ? 'true' : null" (click)="clear()">{{ 'announcements.composer.form.clear' | translate }}</button>
        </div>
      </form>
    </aside>
  `
})
export class AnnouncementComposeFormComponent {
  private service = inject(AnnouncementService);

  @Output() published = new EventEmitter<Announcement>();
  @Output() busyChange = new EventEmitter<boolean>();
  @ViewChild('titleInput') titleInput?: ElementRef<HTMLInputElement>;
  @ViewChild('bodyInput') bodyInput?: ElementRef<HTMLTextAreaElement>;

  readonly max = ANNOUNCEMENT_TITLE_MAX;
  title = '';
  body = '';
  tried = false;
  busy = false;
  publishFailed = false;
  serverFields: { title?: string; body?: string } | null = null;

  get over(): number { return Math.max(0, this.title.length - this.max); }
  // Client messages only appear after the first submit attempt; a server field message replaces them.
  get errors(): DraftErrors | null { return this.tried ? validateDraft(this.title, this.body) : null; }
  get titleKey(): string | null {
    const e = this.errors?.title;
    return e === 'required' ? 'announcements.composer.err.titleRequired' : e === 'tooLong' ? 'announcements.composer.err.titleTooLong' : null;
  }
  get bodyKey(): string | null { return this.errors?.body ? 'announcements.composer.err.bodyRequired' : null; }
  get titleInvalid(): boolean { return !!this.titleKey || !!this.serverFields?.title; }
  get bodyInvalid(): boolean { return !!this.bodyKey || !!this.serverFields?.body; }

  // Editing a field drops its server message (the text it complained about is gone).
  onTitle(v: string): void { this.title = v; if (this.serverFields?.title) { this.serverFields = { ...this.serverFields, title: undefined }; } }
  onBody(v: string): void { this.body = v; if (this.serverFields?.body) { this.serverFields = { ...this.serverFields, body: undefined }; } }

  submit(): void {
    if (this.busy) { return; }
    this.tried = true;
    this.publishFailed = false;
    this.serverFields = null;
    const invalid = validateDraft(this.title, this.body);
    if (invalid) {
      (invalid.title ? this.titleInput : this.bodyInput)?.nativeElement.focus();
      return;
    }
    this.setBusy(true);
    this.service.publish(publishPayload(this.title, this.body)).subscribe({
      next: created => {
        this.setBusy(false);
        this.reset();
        this.published.emit(created);
        this.titleInput?.nativeElement.focus();
      },
      error: (err: HttpErrorResponse) => {
        this.setBusy(false);
        const c = classifyPublishError(err);
        if (c.kind === 'validation' && (c.fields?.title || c.fields?.body)) { this.serverFields = c.fields!; } else { this.publishFailed = true; }
      }
    });
  }

  clear(): void {
    if (this.busy) { return; }
    this.reset();
    this.titleInput?.nativeElement.focus();
  }

  private reset(): void {
    this.title = ''; this.body = ''; this.tried = false; this.publishFailed = false; this.serverFields = null;
  }

  private setBusy(v: boolean): void { this.busy = v; this.busyChange.emit(v); }
}
```

Notes for the implementer: `[value]` bindings re-write the DOM value only when the bound string changes, so typing is not clobbered (same pattern as `ticket-seal`). The 400 path with a `fields` map that has neither `title` nor `body` falls through to the generic banner. `role="alert"` wrappers are persistent, empty containers; the text inside is what is announced.

- [ ] **Step 4: SCSS** `announcement-compose-form.component.scss`. Transcribe from `docs/design/admin_operational_screens/announcement_composer/code.html` `<style>`, nested under `.announcement-composer { ... }` with `&__x` for these rules ONLY: `__seal` (WITHOUT `position: sticky; top` — the host class `.announcement-composer__form-host` is sticky instead, see Task 4), `__seal h2`, `__form`, `__field` (+ `label`, `input, textarea`, `textarea` min-height 9rem / vertical resize), `__req`, `__counter`, `__counter--over`, `__invalid`, `__actions` (+ `.brand-button` min-height 44px), `__spin`, the `announcement-composer-spin` keyframes, `__failed` (add `display: block`), and inside the `prefers-reduced-motion` query `__spin { animation: none }`; in the `max-width: 768px` query `__actions .brand-button { width: 100% }`. Deltas from the mock: add `&__publish[aria-disabled='true'], &__clear[aria-disabled='true'] { opacity: 0.6; cursor: not-allowed; }`; add `&__publish { display: inline-flex; align-items: center; gap: 0.5rem; }`; the mock's `.announcement-composer__sr` is NOT copied here. No new custom properties; do not define `__title`, `__eyebrow`, `__subtitle` here (the page shell owns them; `ViewEncapsulation.None` makes duplicated definitions leak globally and double the size). Compiled size must stay < 2kB (checked in Task 6).

- [ ] **Step 5: Run the spec; expect PASS.** Fix the implementation, not the spec, on failure.
- [ ] **Step 6: Commit**
```bash
git add frontend/src/app/admin/admin-announcements
git commit -m "feat(announcements): composer form with validation, publish lock and focus handling"
```

---

### Task 4: Page component (list, pager, flash, states)

**Files:**
- Create: `frontend/src/app/admin/admin-announcements/admin-announcements.component.ts`
- Create: `frontend/src/app/admin/admin-announcements/admin-announcements.component.scss` (shell, grid, header, list card chrome, pager, empty, retry, skeleton)
- Create: `frontend/src/app/admin/admin-announcements/admin-announcements-items.scss` (per-notice rows)
- Test: `frontend/src/app/admin/admin-announcements/admin-announcements.component.spec.ts`

**Interfaces:**
- Consumes: Task 1 service/model, Task 2 `FlashMessage`/`bodyNeedsToggle`, Task 3 `app-announcement-compose-form` (`(published)`, `(busyChange)`, host class `announcement-composer__form-host`).
- Produces: `AdminAnnouncementsComponent` (selector `app-admin-announcements`); public: `page`, `loading`, `loadError`, `locked`, `flash`, `justPublishedId`; `reload()`, `goTo(p)`, `onPublished(a)`, `onBusy(v)`, `toggle(id)`.

DOM / focus order (DESIGN: mobile shows compose ABOVE the list): the form host comes FIRST in the DOM, then the list `<section>`. On desktop the grid places the list in column 1 and the form in column 2, both `grid-row: 1`, via explicit `grid-column`/`grid-row`; at <= 960px both fall to a single column in DOM order, so visual, keyboard-tab and screen-reader order are all "form, then list" with no CSS `order` hack. The mock's DOM-list-first + `order: -1` is deliberately NOT used because it would put Tab focus on the list's "Show full text" buttons before the form that is visually first. Trade-off: on desktop, Tab reaches the form (right column) before the list (left column); acceptable because composing is the primary task and the form is a single short group.

- [ ] **Step 1: Write the failing spec** (`admin-announcements.component.spec.ts`)

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { AdminAnnouncementsComponent } from './admin-announcements.component';

describe('AdminAnnouncementsComponent', () => {
  let fixture: ComponentFixture<AdminAnnouncementsComponent>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;
  // built from local parts so the day/month assertions do not depend on the machine's time zone
  const at = (d: number, h = 14, m = 2) => new Date(2026, 9, d, h, m).toISOString();
  const an = (id: string, over: Record<string, unknown> = {}) => ({ id, title: 'Title ' + id, body: 'Body ' + id, publishedAt: at(9), ...over });
  const pageOf = (entries: unknown[], total = entries.length, page = 0) => ({ entries, page, size: 10, totalElements: total });
  const listReq = () => http.expectOne(r => r.url === '/api/announcements' && r.method === 'GET');
  const next = () => el().querySelector<HTMLButtonElement>('.announcement-composer__next')!;
  const prev = () => el().querySelector<HTMLButtonElement>('.announcement-composer__prev')!;

  function boot(entries: unknown[] = [an('a1'), an('a2')], total?: number) {
    listReq().flush(pageOf(entries, total));
    fixture.detectChanges();
  }
  function publishViaForm(title = 'New one', body = 'Fresh') {
    const t = el().querySelector<HTMLInputElement>('#announcement-composer-title')!;
    const b = el().querySelector<HTMLTextAreaElement>('#announcement-composer-body')!;
    t.value = title; t.dispatchEvent(new Event('input'));
    b.value = body; b.dispatchEvent(new Event('input'));
    el().querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AdminAnnouncementsComponent, HttpClientTestingModule, TranslateModule.forRoot()] }).compileComponents();
    fixture = TestBed.createComponent(AdminAnnouncementsComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });
  afterEach(() => http.verify());

  it('first load asks for page 0 with size 10', () => {
    const r = listReq();
    expect(r.request.params.get('page')).toBe('0');
    expect(r.request.params.get('size')).toBe('10');
    r.flush(pageOf([]));
  });

  it('renders each notice with day, month/year, title, body and a published line; body is plain text', () => {
    boot([an('a1', { title: 'Diwali cycle', body: 'Line 1\nLine 2 <b>x</b> https://example.com' })]);
    const item = el().querySelector('.announcement-composer__item')!;
    expect(item.querySelector('.announcement-composer__day')!.textContent!.trim()).toBe('09');
    expect(item.querySelector('.announcement-composer__mon')!.textContent).toContain('Oct');
    expect(item.querySelector('.announcement-composer__item-title')!.textContent).toContain('Diwali cycle');
    const body = item.querySelector('.announcement-composer__body')!;
    expect(body.textContent).toContain('Line 1\nLine 2 <b>x</b> https://example.com');
    expect(body.querySelector('b, a')).toBeNull();
    expect(item.querySelector('.announcement-composer__time')!.textContent).toContain('14:02');
    expect(item.querySelector('button, a, [tabindex]')).toBeNull(); // nothing selectable, no edit/delete
  });

  it('header shows the count with singular and plural forms', () => {
    boot([an('a1'), an('a2')], 13);
    expect(el().querySelector('.announcement-composer__count')!.textContent).toContain('announcements.composer.list.count');
    fixture.componentInstance.page = { entries: [an('a1')], page: 0, size: 10, totalElements: 1 };
    fixture.detectChanges();
    expect(el().querySelector('.announcement-composer__count')!.textContent).toContain('announcements.composer.list.countOne');
  });

  it('shows a skeleton with role=status while loading and a polite live count only', () => {
    const sk = el().querySelector('.announcement-composer__skeleton')!;
    expect(sk.getAttribute('role')).toBe('status');
    expect(el().querySelector('.announcement-composer__list')!.getAttribute('aria-busy')).toBe('true');
    expect(el().querySelector('.announcement-composer__list')!.hasAttribute('aria-live')).toBeFalse();
    expect(el().querySelector('.announcement-composer__count')!.getAttribute('aria-live')).toBe('polite');
    expect(el().querySelector('.announcement-composer__form-host button:disabled')).toBeNull(); // form stays usable
    listReq().flush(pageOf([]));
  });

  it('shows the empty state with no CTA button', () => {
    boot([]);
    const empty = el().querySelector('.announcement-composer__empty')!;
    expect(empty.textContent).toContain('announcements.composer.list.empty.title');
    expect(empty.querySelector('button')).toBeNull();
    expect(el().querySelector('.announcement-composer__pager')).toBeNull();
  });

  it('load failure: danger banner (role=alert on text only) and Retry re-requests', () => {
    listReq().flush('boom', { status: 500, statusText: 'err' });
    fixture.detectChanges();
    const alert = el().querySelector('.announcement-composer__list [role="alert"]')!;
    expect(alert.tagName).toBe('SPAN');
    expect(alert.textContent).toContain('announcements.composer.err.load');
    expect(el().querySelector('.announcement-composer__skeleton')).toBeNull();
    el().querySelector<HTMLButtonElement>('.announcement-composer__retry')!.click();
    listReq().flush(pageOf([an('a1')]));
    fixture.detectChanges();
    expect(el().querySelector('.announcement-composer__list [role="alert"]')).toBeNull();
  });

  it('pages: Next requests page 1; Previous is aria-disabled on page 1 and Next on the last page, never disabled', () => {
    boot([an('a1')], 25);
    expect(prev().getAttribute('aria-disabled')).toBe('true');
    expect(prev().disabled).toBeFalse();
    next().click();
    const r = listReq();
    expect(r.request.params.get('page')).toBe('1');
    r.flush(pageOf([an('a9')], 25, 1));
    fixture.detectChanges();
    expect(el().querySelector('.announcement-composer__page')!.textContent).toContain('announcements.composer.list.pager');
    next().focus();
    fixture.componentInstance.goTo(2);
    listReq().flush(pageOf([an('a10')], 25, 2));
    fixture.detectChanges();
    expect(next().getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(next());
    next().click(); // inert at the end
    http.expectNone(r2 => r2.url === '/api/announcements');
  });

  it('ignores a page change while a load is in flight', () => {
    boot([an('a1')], 25);
    next().click();
    const pending = listReq();
    next().click();
    fixture.componentInstance.goTo(2);
    http.expectNone(r => r.url === '/api/announcements');
    pending.flush(pageOf([an('a2')], 25, 1));
  });

  it('latest request wins: a slow older response cannot overwrite a newer one', () => {
    boot([an('a1')], 25);
    next().click();
    const slow = listReq();                       // page 1, in flight
    fixture.componentInstance.onPublished(an('new') as never); // forces load(0) and bumps the sequence
    const fast = listReq();
    fast.flush(pageOf([an('new')], 26, 0));
    slow.flush(pageOf([an('old')], 25, 1));
    fixture.detectChanges();
    expect(el().textContent).toContain('Title new');
    expect(el().textContent).not.toContain('Title old');
  });

  it('long bodies get a Show full text toggle with aria-expanded; short ones do not', () => {
    boot([an('long', { body: 'x'.repeat(200) }), an('short', { body: 'Hi' })]);
    const items = el().querySelectorAll('.announcement-composer__item');
    expect(items[1].querySelector('.announcement-composer__more')).toBeNull();
    const more = items[0].querySelector<HTMLButtonElement>('.announcement-composer__more')!;
    expect(more.getAttribute('aria-expanded')).toBe('false');
    expect(more.textContent).toContain('announcements.composer.list.showFull');
    more.click(); fixture.detectChanges();
    expect(more.getAttribute('aria-expanded')).toBe('true');
    expect(more.textContent).toContain('announcements.composer.list.showLess');
    expect(items[0].querySelector('.announcement-composer__body')!.classList).toContain('is-open');
    expect(document.activeElement).toBe(more);
  });

  it('publishing: success banner (role=status, dismissible) with the title, list reloads page 0, new top item carries the chip', () => {
    boot([an('a1')]);
    publishViaForm('Fresh news', 'Body text');
    http.expectOne('/api/admin/announcements').flush(an('n1', { title: 'Fresh news' }), { status: 201, statusText: 'Created' });
    fixture.detectChanges();
    const status = el().querySelector('.inline-banner--success [role="status"]')!;
    expect(status.textContent).toContain('announcements.composer.ok.published');
    const r = listReq();
    expect(r.request.params.get('page')).toBe('0');
    r.flush(pageOf([an('n1', { title: 'Fresh news' }), an('a1')], 2));
    fixture.detectChanges();
    const first = el().querySelector('.announcement-composer__item')!;
    expect(first.classList).toContain('announcement-composer__item--new');
    expect(first.querySelector('.announcement-composer__chip')).not.toBeNull();
    expect(el().querySelectorAll('.announcement-composer__chip').length).toBe(1);
    el().querySelector<HTMLButtonElement>('.inline-banner__dismiss')!.click(); fixture.detectChanges();
    expect(el().querySelector('.inline-banner--success')).toBeNull();
  });

  it('publish succeeds while the list is errored: success banner shows and the list load is retried', () => {
    listReq().flush('boom', { status: 500, statusText: 'err' });
    fixture.detectChanges();
    publishViaForm();
    http.expectOne('/api/admin/announcements').flush(an('n1'), { status: 201, statusText: 'Created' });
    fixture.detectChanges();
    expect(el().querySelector('.inline-banner--success')).not.toBeNull();
    listReq().flush(pageOf([an('n1')]));
    fixture.detectChanges();
    expect(el().querySelector('.announcement-composer__list [role="alert"]')).toBeNull();
  });

  it('locks the pager and Retry while a publish is in flight, clears the old flash when a new one starts, and unlocks after', () => {
    boot([an('a1')], 25);
    fixture.componentInstance.flash = { key: 'announcements.composer.ok.published', params: { title: 'Old' } };
    fixture.detectChanges();
    publishViaForm();
    expect(fixture.componentInstance.locked).toBeTrue();
    expect(fixture.componentInstance.flash).toBeNull();
    expect(next().getAttribute('aria-disabled')).toBe('true');
    next().click();
    http.expectNone(r => r.url === '/api/announcements');
    http.expectOne('/api/admin/announcements').flush('x', { status: 500, statusText: 'err' });
    fixture.detectChanges();
    expect(fixture.componentInstance.locked).toBeFalse();
  });

  it('using the pager clears the just-published marker', () => {
    boot([an('a1')], 25);
    fixture.componentInstance.onPublished(an('a1') as never);
    listReq().flush(pageOf([an('a1')], 25));
    fixture.detectChanges();
    expect(el().querySelector('.announcement-composer__chip')).not.toBeNull();
    next().click();
    listReq().flush(pageOf([an('a1')], 25, 1));
    fixture.detectChanges();
    expect(el().querySelector('.announcement-composer__chip')).toBeNull();
  });

  it('puts the compose form before the list in DOM order (mobile shows it first; no CSS order hack)', () => {
    const form = el().querySelector('.announcement-composer__form-host')!;
    const list = el().querySelector('.announcement-composer__list')!;
    expect(form.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    listReq().flush(pageOf([]));
  });
});
```

- [ ] **Step 2: Run** `npx ng test --watch=false --browsers=ChromeHeadless --include='src/app/admin/admin-announcements/admin-announcements.component.spec.ts'`; expect FAIL.

- [ ] **Step 3: Implement** `admin-announcements.component.ts`

```ts
import { Component, OnInit, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { Announcement, AnnouncementPage } from '../../announcements/announcement.model';
import { AnnouncementService } from '../../announcements/announcement.service';
import { AnnouncementComposeFormComponent } from './announcement-compose-form.component';
import { FlashMessage, bodyNeedsToggle } from './admin-announcements.util';

const PAGE_SIZE = 10;

@Component({
  selector: 'app-admin-announcements',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['./admin-announcements.component.scss', './admin-announcements-items.scss'],
  imports: [CommonModule, TranslateModule, InlineBannerComponent, AnnouncementComposeFormComponent],
  template: `
    <main class="announcement-composer">
      <header>
        <span class="announcement-composer__eyebrow">{{ 'announcements.composer.eyebrow' | translate }}</span>
        <h1 class="announcement-composer__title">{{ 'announcements.composer.title' | translate }}</h1>
        <p class="announcement-composer__subtitle">{{ 'announcements.composer.subtitle' | translate }}</p>
      </header>

      <app-inline-banner *ngIf="flash" tone="success" [dismissible]="true" (dismissed)="flash = null">
        <span role="status">{{ flash.key | translate: flash.params }}</span>
      </app-inline-banner>

      <div class="announcement-composer__grid">
        <app-announcement-compose-form (published)="onPublished($event)" (busyChange)="onBusy($event)"></app-announcement-compose-form>

        <section class="announcement-composer__list-wrap" [attr.aria-label]="'announcements.composer.list.heading' | translate">
          <div class="announcement-composer__list" [attr.aria-busy]="loading">
            <div class="announcement-composer__list-head">
              <h2>{{ 'announcements.composer.list.heading' | translate }}</h2>
              <span class="announcement-composer__count" aria-live="polite">
                <ng-container *ngIf="page; else loadingCount">{{ (page.totalElements === 1 ? 'announcements.composer.list.countOne' : 'announcements.composer.list.count') | translate: { count: page.totalElements } }}</ng-container>
                <ng-template #loadingCount>{{ 'announcements.composer.list.loadingCount' | translate }}</ng-template>
              </span>
            </div>

            <app-inline-banner *ngIf="loadError" tone="danger">
              <span role="alert">{{ 'announcements.composer.err.load' | translate }}</span>
              <button type="button" class="announcement-composer__retry" [attr.aria-disabled]="locked ? 'true' : null" (click)="reload()">{{ 'announcements.composer.err.retry' | translate }}</button>
            </app-inline-banner>

            <div class="announcement-composer__skeleton" role="status" *ngIf="!page && !loadError">
              <span class="announcement-composer__sr">{{ 'announcements.composer.list.loading' | translate }}</span>
              <span class="announcement-composer__skeleton-row" *ngFor="let i of [1,2,3]"></span>
            </div>

            <div class="announcement-composer__empty" *ngIf="page && !page.entries.length">
              <span class="material-symbols-outlined" aria-hidden="true">campaign</span>
              <h3>{{ 'announcements.composer.list.empty.title' | translate }}</h3>
              <p>{{ 'announcements.composer.list.empty.body' | translate }}</p>
            </div>

            <ul class="announcement-composer__items" *ngIf="page?.entries?.length">
              <li *ngFor="let a of page!.entries; trackBy: trackById" class="announcement-composer__item" [class.announcement-composer__item--new]="a.id === justPublishedId">
                <div class="announcement-composer__date">
                  <span class="announcement-composer__day">{{ a.publishedAt | date: 'dd' }}</span>
                  <span class="announcement-composer__mon">{{ a.publishedAt | date: 'MMM y' }}</span>
                </div>
                <div>
                  <h3 class="announcement-composer__item-title">{{ a.title }}<span class="announcement-composer__chip" *ngIf="a.id === justPublishedId">{{ 'announcements.composer.list.justPublished' | translate }}</span></h3>
                  <p class="announcement-composer__body" [class.is-open]="isOpen(a.id)" [id]="'announcement-body-' + a.id">{{ a.body }}</p>
                  <button type="button" class="announcement-composer__more" *ngIf="needsToggle(a)" [attr.aria-expanded]="isOpen(a.id)" [attr.aria-controls]="'announcement-body-' + a.id" (click)="toggle(a.id)">{{ (isOpen(a.id) ? 'announcements.composer.list.showLess' : 'announcements.composer.list.showFull') | translate }}</button>
                  <p class="announcement-composer__time">{{ 'announcements.composer.list.published' | translate: { date: (a.publishedAt | date: 'd MMM y, HH:mm') } }}</p>
                </div>
              </li>
            </ul>

            <nav class="announcement-composer__pager" *ngIf="page?.entries?.length" [attr.aria-label]="'announcements.composer.list.pagination' | translate">
              <button type="button" class="brand-button brand-button--secondary announcement-composer__prev" [attr.aria-disabled]="pagerOff || page!.page === 0 ? 'true' : null" (click)="goTo(page!.page - 1)">{{ 'announcements.composer.list.previous' | translate }}</button>
              <span class="announcement-composer__page">{{ 'announcements.composer.list.pager' | translate: { page: page!.page + 1, totalPages: totalPages, count: page!.totalElements } }}</span>
              <button type="button" class="brand-button brand-button--secondary announcement-composer__next" [attr.aria-disabled]="pagerOff || page!.page + 1 >= totalPages ? 'true' : null" (click)="goTo(page!.page + 1)">{{ 'announcements.composer.list.next' | translate }}</button>
            </nav>
          </div>
        </section>
      </div>
    </main>
  `
})
export class AdminAnnouncementsComponent implements OnInit {
  private service = inject(AnnouncementService);

  page: AnnouncementPage | null = null;
  loading = false;
  loadError = false;
  locked = false; // true while the form's publish is in flight: pager and Retry freeze
  flash: FlashMessage | null = null;
  justPublishedId: string | null = null;
  private seq = 0;
  private currentPage = 0;
  private open = new Set<string>();

  get totalPages(): number {
    return !this.page || !this.page.size ? 1 : Math.max(1, Math.ceil(this.page.totalElements / this.page.size));
  }
  get pagerOff(): boolean { return this.locked || this.loading; }
  trackById = (_: number, a: Announcement) => a.id;
  isOpen = (id: string) => this.open.has(id);
  needsToggle = (a: Announcement) => bodyNeedsToggle(a.body);

  ngOnInit(): void { this.reload(); }

  reload(): void { if (!this.locked) { this.load(this.currentPage); } }

  // aria-disabled buttons stay clickable, so every guard lives here, not on the button.
  goTo(p: number): void {
    if (this.pagerOff || p < 0 || p >= this.totalPages) { return; }
    this.justPublishedId = null;
    this.load(p);
  }

  toggle(id: string): void { this.open.has(id) ? this.open.delete(id) : this.open.add(id); }

  onBusy(busy: boolean): void {
    this.locked = busy;
    if (busy) { this.flash = null; }
  }

  // Publish finished: announce it, mark it, and re-read page 0 (newest-first). This also retries a failed list load.
  onPublished(created: Announcement): void {
    this.flash = { key: 'announcements.composer.ok.published', params: { title: created.title } };
    this.justPublishedId = created.id;
    this.load(0);
  }

  // Latest-request-wins: a slow earlier response can never overwrite a newer one.
  private load(p: number): void {
    const mine = ++this.seq;
    this.currentPage = p;
    this.loading = true;
    this.loadError = false;
    this.service.list(p, PAGE_SIZE).subscribe({
      next: res => { if (mine === this.seq) { this.loading = false; this.page = res; } },
      error: () => { if (mine === this.seq) { this.loading = false; this.loadError = true; } }
    });
  }
}
```

Note: `toggle` must not re-create the `<button>` (its `*ngIf` depends only on `needsToggle`, and `trackBy` keeps each `<li>` stable), so focus stays on it.

- [ ] **Step 4: SCSS.** Transcribe from `code.html`, nested under `.announcement-composer { ... }` / `&__x`:
  - `admin-announcements.component.scss`: root `.announcement-composer` (flex column, gap 1.25rem, max-width 1280, padding), `__eyebrow`, `__title`, `__subtitle`, `__sr`, `__grid` (columns `minmax(0, 1fr) 420px`; 1100px: `minmax(0, 1fr) 360px`; 960px: `1fr`; 768px: `.announcement-composer { padding-inline: 1rem }`), `__list`, `__list-head` (+ `h2`), `__count`, `__pager` (+ `.brand-button` min-height 44px), `__page`, `__empty` (+ glyph, `h3`, `p`), `__retry`, `__skeleton`, `__skeleton-row`, the `announcement-composer-shimmer` keyframes, reduced-motion for `__skeleton-row`, `__list-head` mobile padding. **Deltas from the mock (do these exactly):** (1) grid placement instead of `order: -1`: `&__list-wrap { grid-column: 1; grid-row: 1; min-width: 0; }` and `&__form-host { grid-column: 2; grid-row: 1; position: sticky; top: 1rem; align-self: start; }`; in the `max-width: 960px` query set `&__list-wrap, &__form-host { grid-column: 1; grid-row: auto; }` and `&__form-host { position: static; }`. (2) `[aria-disabled='true']` rule for `&__prev, &__next, &__retry`: `opacity: 0.6; cursor: not-allowed;`. (3) `__title`, `__eyebrow`, `__subtitle` are defined ONLY here (never also in the form file: `ViewEncapsulation.None` makes styles global, so a duplicate would double the bytes and could fight on specificity).
  - `admin-announcements-items.scss`: `__items`, `__item` (+ `:first-child`, `--new`), `__date`, `__day`, `__mon`, `__item-title`, `__chip`, `__body` (+ `.is-open`), `__more`, `__time`; in the `max-width: 768px` query the mock's item/date/day/mon collapse rules. `.announcement-composer__more:focus-visible` gets `outline: 2px solid var(--brand-primary); outline-offset: 2px`.
  No new custom properties. Each file must compile < 2kB (Task 6 checks).

- [ ] **Step 5: Run the spec; expect PASS.**
- [ ] **Step 6: Commit** `git add frontend/src/app/admin/admin-announcements && git commit -m "feat(announcements): admin composer page with paged list, states and publish flow"`

---

### Task 5: Nav item, lazy route and i18n

**Files:**
- Modify: `frontend/src/app/admin-nav-categories.model.ts` (the `system` category `items`, currently ending with the `supportTickets` entry at line 71)
- Modify: `frontend/src/app/admin-nav-categories.model.spec.ts` (line 20 array; add a `findNavCategoryForUrl` case after the support-tickets one at line 36-38)
- Modify: `frontend/src/app/app.routes.ts` (insert after line 105, the `support-tickets` settings child)
- Modify: `frontend/src/app/app.routes.spec.ts` (insert after the "has a lazy support-tickets child" test, ~line 216)
- Modify: `frontend/src/assets/i18n/en.json`, `frontend/src/assets/i18n/hi.json`

**Interfaces:** Consumes `AdminAnnouncementsComponent` (Task 4). Produces nav item key `announcements`, route path `announcements`, i18n keys below (consumed by Tasks 3-4).

- [ ] **Step 1: Failing spec edits.**
  - `admin-nav-categories.model.spec.ts`: change the last array to `['auditLog', 'adminStats', 'supportTickets', 'announcements']`, and add inside `describe('findNavCategoryForUrl'`:
```ts
  it('resolvesTheAnnouncementsScreenToTheSystemCategory', () => {
    expect(findNavCategoryForUrl('/settings/announcements')?.key).toBe('system');
  });
```
  - `app.routes.spec.ts` (inside the same `describe` as the support-tickets child test):
```ts
    it('has a lazy announcements child stamped with sectionKey announcements', () => {
      const settingsRoute = routes.find(r => r.path === 'settings');
      const child = settingsRoute!.children!.find(c => c.path === 'announcements');
      expect(child).toBeDefined();
      expect(child!.component).toBeUndefined();
      expect(child!.loadComponent).toBeDefined();
      expect(child!.data).toEqual({ sectionKey: 'announcements' });
    });
```
- [ ] **Step 2: Run** `npx ng test --watch=false --browsers=ChromeHeadless --include='src/app/admin-nav-categories.model.spec.ts' --include='src/app/app.routes.spec.ts'`; expect FAIL.
- [ ] **Step 3: Implement.**
  - Nav: append `,\n      { key: 'announcements', labelKey: 'settings.sections.announcements', path: '/settings/announcements' }` after the `supportTickets` entry.
  - Route, new line directly after the `support-tickets` child:
```ts
      { path: 'announcements', loadComponent: () => import('./admin/admin-announcements/admin-announcements.component').then(m => m.AdminAnnouncementsComponent), data: { sectionKey: 'announcements' } },
```
  - `en.json`: (a) `settings.sections`: add `"announcements": "Announcements"` after `"supportTickets": "Support Tickets"` (line ~1562; add the comma to the previous line). (b) New top-level key after the top-level `"supportTickets"` block, before `"payoutHistory"`:
```json
  "announcements": {
    "composer": {
      "eyebrow": "System",
      "title": "Announcements",
      "subtitle": "Publish a notice that every associate sees in their feed straight away. Below is everything you have published so far.",
      "form": {
        "heading": "New announcement",
        "warnTitle": "Goes live immediately and can't be changed.",
        "warnBody": "Every associate sees it as soon as you publish. There is no edit, delete or scheduling, so check the text first.",
        "title": "Title",
        "body": "Announcement",
        "bodyPlaceholder": "Write what associates need to know.",
        "counter": "{{count}} / {{max}}",
        "publish": "Publish announcement",
        "publishing": "Publishing…",
        "clear": "Clear"
      },
      "list": {
        "heading": "Published",
        "loading": "Loading announcements",
        "loadingCount": "Loading…",
        "count": "{{count}} announcements",
        "countOne": "{{count}} announcement",
        "pagination": "Pagination",
        "pager": "Page {{page}} of {{totalPages}} · {{count}} announcements",
        "previous": "Previous",
        "next": "Next",
        "showFull": "Show full text",
        "showLess": "Show less",
        "published": "Published {{date}}",
        "justPublished": "Just published",
        "empty": {
          "title": "Nothing published yet",
          "body": "Your first announcement will appear here, newest first, and in every associate's feed."
        }
      },
      "ok": { "published": "Announcement published. \"{{title}}\" is now live in every associate's feed." },
      "err": {
        "titleRequired": "Add a title.",
        "titleTooLong": "Title must be 300 characters or fewer. Shorten it by {{over}}.",
        "bodyRequired": "Add the announcement text.",
        "publish": "The announcement wasn't published. Check your connection and try again. Nothing was sent to associates.",
        "load": "The published list didn't load. Check your connection and try again. You can still publish a new announcement.",
        "retry": "Retry"
      }
    }
  },
```
  - `hi.json`: same two insertions with identical English text, except `settings.sections.announcements` = `"घोषणाएँ"`.
- [ ] **Step 4: Run the same command; expect PASS.** Then `npx ng test --watch=false --browsers=ChromeHeadless` (whole suite) and confirm no other spec enumerates the admin nav items or i18n keys and now fails.
- [ ] **Step 5: Commit**
```bash
git add frontend/src/app/admin-nav-categories.model.ts frontend/src/app/admin-nav-categories.model.spec.ts frontend/src/app/app.routes.ts frontend/src/app/app.routes.spec.ts frontend/src/assets/i18n/en.json frontend/src/assets/i18n/hi.json
git commit -m "feat(announcements): Announcements nav item, lazy /settings/announcements route, i18n"
```

---

### Task 6: Production build and style budgets

**Files:** none (verification); fix SCSS only if a budget trips.

- [ ] **Step 1:** From `frontend/`: `npx ng build --configuration production`. Expected: success; NO `anyComponentStyle` warning or error for `admin-announcements.component.scss`, `admin-announcements-items.scss`, `announcement-compose-form.component.scss` (warn at 2kB, error at 4kB); initial bundle under 1.2MB; a separate lazy chunk containing the composer. If any file warns, split or trim it (move item or chrome rules between the three files); never raise the budget and never move rules into `_admin.scss` unless splitting cannot fit.
- [ ] **Step 2:** `npx ng test --watch=false --browsers=ChromeHeadless` whole suite green (the known ~55 backend Mockito errors are backend-only and irrelevant here).
- [ ] **Step 3: Commit** only if SCSS changed: `git commit -am "style(announcements): keep composer styles within component budgets"`.

---

### Task 7: Real-app verification (fresh DB, own ports)

**Files:** none. Use the `run` skill; do NOT reuse the default 5434/8081/4200 stack or an existing DB, so the schema is freshly migrated by Flyway and no stale rows leak in.

- [ ] **Step 1: Throwaway Postgres** on its own port, e.g. `docker run -d --rm --name pc-ann3-db -e POSTGRES_USER=plotchain -e POSTGRES_PASSWORD=plotchain -e POSTGRES_DB=plotchain -p 55432:5432 postgres:16` (match the image major version in `docker-compose.yml`).
- [ ] **Step 2: Backend** `cd backend && DB_PORT=55432 PORT=18081 ./mvnw spring-boot:run` (env names from `application.yml`: `DB_PORT`, `PORT`). Wait for `Started PlotchainApplication`; Flyway migrates from scratch (founding admin `admin` / `ChangeMe123!` from V18; change password / finish setup if the app's guards demand it, using the real UI or API, never by editing guards).
- [ ] **Step 3: Frontend** with a scratch proxy file (outside the repo, in the scratchpad) targeting `http://localhost:18081`: `cd frontend && npx ng serve --port 14200 --proxy-config <scratch proxy json>`.
- [ ] **Step 4: Drive the flows** (claude-in-chrome) at `http://localhost:14200`, logged in as admin; open the System nav tab, "Announcements" (System lights up, URL `/settings/announcements`):
  1. Empty list: "Nothing published yet" with no CTA; header reads "0 announcements".
  2. Click Publish with both fields empty: both messages, red borders, focus on Title, no POST in the network tab.
  3. Paste 301 characters in Title: counter `301 / 300` red, nothing truncated; Publish shows "Shorten it by 1", no POST. Trim to 300: publishes.
  4. Publish "Test A" with a multi-line body containing `<b>x</b>` and a URL: success banner, form cleared, focus on Title, new top item with "Just published" chip, body shows tags as literal text, URL not a link, line breaks kept, local-time date line. 201 and then GET page 0 visible in the network tab.
  5. Body > 3 lines: clamped to 3 lines with "Show full text"; click toggles to "Show less" with full text; Tab/Enter/Space work; focus stays on the toggle.
  6. Publish 11+ announcements: pager shows "Page 1 of 2", Next loads page 1 (10 per page), Previous returns; Previous aria-disabled on page 1, Next on the last page; chip disappears after paging.
  7. Double-click Publish quickly: exactly one POST/one row. While request is slow (DevTools throttle), buttons look disabled but keep focus, fields read-only.
  8. Stop the backend, click Publish: danger banner "wasn't published... Nothing was sent", text kept; restart backend, click Publish again: succeeds. With the backend down, reload the page: list error banner + Retry; restart backend, Retry loads.
  9. Verify as ASSOCIATE: sign in as a non-admin: `/settings/announcements` is not reachable; `POST /api/admin/announcements` with that token is 403; `GET /api/announcements` is 200 (confirms the shared feed).
  10. Resize to <= 960px and <= 768px: compose form appears ABOVE the list, Tab order goes form first, notice gutter collapses to an inline "09 Oct 2026" row, buttons stack full width, targets >= 44px.
  11. Screen-reader semantics spot check (accessibility tree): only error text carries `role="alert"`; the count has `aria-live="polite"`; no whole-panel live region; skeleton `role="status"`.
  12. Keyboard-only run of the whole compose-publish-toggle-page flow, and `prefers-reduced-motion` stops spinner/skeleton.
- [ ] **Step 5: Tear down:** kill `ng serve`, the backend, `docker stop pc-ann3-db`; remove the scratch proxy file. Report results; fix any defect found with a failing spec first, then re-run Task 6 Step 2.

---

## Self-Review

- **Spec / units-row coverage:** compose form with 300 limit + 400 field messages + success clears and list shows it (Tasks 3-4); paged newest-first list with title/body/date, shared pager pattern, empty state (Task 4); permanent immediate/permanent warning, no edit/delete (Tasks 3-4, "Nothing selectable" assertion); admin nav entry + lazy route (Task 5); live tokens/shared components, component/service specs, no e2e (all); design folder exists. User decisions: no confirm (Task 3 test asserts only Publish + Clear buttons), nav label/path/placement (Task 5), no body limit and title counter (Tasks 2-3), mobile compose-first (Task 4, DOM-order approach), 3-line clamp + toggle (Tasks 2, 4), page size 10 (Task 4), date pipe local time + `pre-wrap` plain text (Task 4), hi English except nav label (Task 5), lazy route, no new tokens.
- **Placeholders:** SCSS bodies are specified by explicit transcription from the committed `code.html` with listed selector groups and deltas (same approach as the merged support-tickets plan); All TS, specs, JSON and commands are literal.
- **Type consistency:** `Announcement`, `AnnouncementPage.entries`, `CreateAnnouncementRequest`, `ANNOUNCEMENT_TITLE_MAX`, `AnnouncementService.list/publish`, `FlashMessage`, `DraftErrors`, `validateDraft`, `publishPayload`, `classifyPublishError`, `bodyNeedsToggle`, `published`/`busyChange` outputs, ids `announcement-composer-title/body`, class names, and i18n keys match across Tasks 1-5.
- **Review Focus:** items 1-8 map to named tests (blank, 301/300, double submit, failure keeps text, plain-text body + toggle, seq race + in-flight page ignore, publish-while-errored, DOM order).
- **Deviation from DESIGN.md (intentional):** design puts `aria-live="polite"` on the whole list section; this plan scopes it to the header count text only (Support Tickets review lesson). DOM order is form-first instead of list-first + `order: -1`.

## Open questions for the coordinator

1. Clamp-toggle heuristic (`bodyNeedsToggle`: > 90 chars or > 3 lines) is conservative rather than measured; OK, or measure rendered overflow with a ResizeObserver?
2. The title limit uses the raw length (a title with only trailing spaces over 300 is rejected even though the trimmed payload would fit). OK?
3. Admin `settings` shell guard `launchedModeGuard`: if the fresh DB redirects away from `/settings/*` until setup completes, Task 7 completes setup through the real UI. Confirm that is acceptable (vs a shortcut SQL flag).

## Coordinator decisions (user-approved 2026-10-09)

- Mobile order: form first in DOM (no CSS order:-1), as planned; aria-live on count text only.
- `bodyNeedsToggle` stays a heuristic (no ResizeObserver). Title limit uses raw length.
- If the fresh DB redirects away from `/settings/*` until setup completes, a SQL shortcut (setup_state.launched_at) is allowed as in support-tickets; record that it was used.
- Hindi nav label "घोषणाएँ"; other hi strings English.
- i18n: unit 3 creates the top-level `announcements` object with a `composer` child; unit 4 later adds a `feed` sibling.
