# Announcements Unit 4 (Associate Announcements Feed Screen) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A view-only, paged (10/page), newest-first "Announcements" screen for associates at lazy route `/announcements`, with a sidebar nav item.

**Architecture:** One standalone component `AnnouncementFeedComponent` modelled 1:1 on the merged `SupportTicketHistoryComponent` (latest-request-wins seq, takeUntil, last-attempted-page Retry, aria-disabled pager, skeleton/empty/error states) but rendering cards (dateline gutter + title + pre-wrap body) instead of a table. It reuses the shared announcement model + service created by unit 3 (built before this unit). Styles go in the global `_admin.scss` under `.announcement-feed*`.

**Tech Stack:** Angular (standalone components, ngx-translate, Jasmine/Karma + HttpTestingController), SCSS. Backend is already merged (unit 2): `GET /api/announcements?page&size` -> `{entries:[{id,title,body,publishedAt}], page, size, totalElements}`.

**Spec:** `docs/superpowers/specs/role-capability/2026-08-03-announcements-domain-design.md`; design `docs/design/associate_operational_screens/announcements_feed/DESIGN.md` (+ `code.html` for markup); queue `docs/superpowers/plans/2026-08-03-announcements-units.md`; template `docs/superpowers/plans/2026-08-03-support-tickets-unit-6-associate-history-screen.md` and `frontend/src/app/support-ticket-history/*`.

## Global Constraints

- Decisions (2026-10-09): NO "Show more" clamp (bodies shown in full); dates via Angular `date` pipe in viewer local time; subtitle `Company updates`; body plain text, `white-space: pre-wrap`, URLs NOT linkified; page size 10; nav label `Announcements`, Material icon `campaign`; `hi.json` gets English strings except the nav label (translated); hand-built cards (do NOT touch `EditableTableComponent`); no new design tokens; route `/announcements` lazy with `canActivate: [authGuard, associateOnlyGuard]`.
- Controls are never `disabled` during load. Pager buttons use `aria-disabled`, and `goToPage` ignores in-flight and out-of-range calls.
- `role="alert"` only on the error text. Skeleton is `role="status"` with an sr-only label and the container has `aria-busy`.
- All user text is rendered with `{{ }}` only (no `innerHTML`, no `[innerHTML]`, no `bypassSecurityTrust*`).
- CSS prefix `.announcement-feed*` only. Must not collide with `.announcement-composer*` (unit 3), `.support-tickets*`, `.ticket-history*`. No bare element selectors (scope every `h1`, `p`, `ol` under a class).
- Sidebar count: `associate-sidebar.component.spec.ts` link-label count 9 -> 10. `app.component.spec.ts` exact-order nav label list gains `'Announcements'` at the end.
- Do NOT commit until the executor's own task steps say so; coordinator marks the unit merged in `-units.md`, the implementer must not edit that tracking file.

## Review Focus

- Long unbroken string (no spaces, 300-char title / 5k-char body): must wrap (`overflow-wrap: anywhere`), no horizontal page scroll at 375px. Pinned by Task 3 spec (class assertion) and Task 6 browser check.
- HTML-looking text (`<script>`, `<img onerror>`, `<b>`): shown literally. Pinned by Task 3 hostile-text spec.
- Multi-line body: line breaks preserved (`pre-wrap`). Pinned by Task 3 + Task 6.
- Failed page 2 then Retry: re-requests page 2 not page 1. Pinned by Task 3.
- Empty feed (viewer, zero announcements): friendly empty message, no pager. Pinned by Task 3 + Task 6 (real browser).
- ADMIN token visiting `/announcements`: `associateOnlyGuard` behaviour recorded in Task 4/6 (not assumed).
- `publishedAt` near midnight displays in viewer-local day (documented, not tested beyond rendering a `<time datetime>`).

---

## File Structure

- Create: `frontend/src/app/announcements/announcement-feed.component.ts` and `.spec.ts` (the screen).
- Reuse (from unit 3): `frontend/src/app/announcements/announcement.model.ts`, `announcement.service.ts`.
- Modify: `frontend/src/app/associate-nav-items.model.ts`, `frontend/src/app/shared/components/associate-sidebar/associate-sidebar.component.spec.ts`, `frontend/src/app/app.component.spec.ts`, `frontend/src/app/app.routes.ts`, `frontend/src/app/app.routes.spec.ts`, `frontend/src/assets/i18n/en.json`, `hi.json`, `frontend/src/styles/_admin.scss`.

---

### Task 1: Rebase on unit 3 and reconcile shared model/service names

**Files:** read-only first; possibly Modify `announcement.model.ts` / `announcement.service.ts`.

**Interfaces:**
- Consumes (assumed from unit 3; VERIFY): `Announcement { id: string; title: string; body: string; publishedAt: string }`, `AnnouncementPage { entries: Announcement[]; page: number; size: number; totalElements: number }`, `AnnouncementService.list(page: number, size: number): Observable<AnnouncementPage>` (calls `GET /api/announcements` with params `page`,`size`).
- Produces: confirmed names used verbatim by Tasks 2-3 (if different, substitute them everywhere in this plan).

- [ ] **Step 1:** Confirm unit 3 is merged to master and rebase/branch from it: `git log --oneline -5 && ls frontend/src/app/announcements/`. If unit 3 is NOT merged, stop and tell the coordinator (this unit is sequenced after it).
- [ ] **Step 2:** `Read` `announcement.model.ts` and `announcement.service.ts`. Write down the actual exported names (page type name, `list` signature, param names `page`/`size`, whether service is `providedIn: 'root'`).
- [ ] **Step 3:** If the service only has `publish` or `list` lacks `(page,size)`, append the missing method to the unit 3 file, no other edits:

```ts
list(page: number, size: number): Observable<AnnouncementPage> {
  return this.http.get<AnnouncementPage>('/api/announcements', { params: { page, size } });
}
```
and ensure `AnnouncementPage` / `Announcement` interfaces exist in the model with the four/three fields above. Match the URL style unit 3 already uses (prefix constant vs literal).
- [ ] **Step 4:** If a model/service change was needed, add one spec to the existing service spec: `list(2,10)` issues `GET /api/announcements` with `page=2&size=10`. Run `cd frontend && npx ng test --watch=false --include='**/announcements/**'` -> PASS. If nothing changed, no commit for this task.

---

### Task 2: i18n keys, nav item, nav specs

**Files:** Modify `associate-nav-items.model.ts`, `associate-sidebar.component.spec.ts` (line ~25), `app.component.spec.ts` (lines ~134-145), `en.json`, `hi.json`.

**Interfaces:** Produces i18n keys as a `feed` child INSIDE the top-level `announcements` object that unit 3 creates (sibling of unit 3's `composer`; never edit `composer`; user-approved 2026-10-09, replaces the earlier separate `announcements.feed` keys): `eyebrow`, `title`, `subtitle`, `loading`, `loadError`, `retryAction`, `emptyTitle`, `emptyBody`, `previousPageAction`, `nextPageAction`, `pageIndicator`; plus `nav.announcements`. Nav item `{ key: 'announcements', labelKey: 'nav.announcements', icon: 'campaign', path: '/announcements' }` appended LAST in `ASSOCIATE_NAV_ITEMS`.

- [ ] **Step 1: Failing tests.** In `associate-sidebar.component.spec.ts` change `.toBe(9)` to `.toBe(10)`. In `app.component.spec.ts` add `'nav.announcements': 'Announcements',` after the `nav.supportTickets` translation (line ~134) and append `'Announcements'` to the exact-order array at line ~145 (after `'Support Tickets'`).
- [ ] **Step 2:** Run `cd frontend && npx ng test --watch=false --include='**/associate-sidebar/**' --include='**/app.component.spec.ts'` -> FAIL (9 vs 10 / missing label).
- [ ] **Step 3: Implement.** Append the nav item after `supportTickets` in `associate-nav-items.model.ts`. In `en.json` add `"announcements": "Announcements"` in `nav` (after `supportTickets`, line ~569) and a top-level block:

```json
"feed": {  /* nested inside the existing top-level "announcements" object, after "composer" */
  "eyebrow": "Associate · Announcements",
  "title": "Announcements",
  "subtitle": "Company updates",
  "loading": "Loading announcements",
  "loadError": "Couldn't load announcements. Check your connection and try again.",
  "retryAction": "Retry",
  "emptyTitle": "No announcements yet",
  "emptyBody": "When the company posts an update, it will appear here.",
  "previousPageAction": "Previous",
  "nextPageAction": "Next",
  "pageIndicator": "Page {{page}} of {{totalPages}}"
}
```
In `hi.json` add the same block in English and `nav.announcements` as `"घोषणाएँ"`. Keep JSON valid (check commas); place the nav key beside `"supportTickets": "सहायता टिकट"` (line ~533).
- [ ] **Step 4:** Re-run the Step 2 command -> PASS. Also `node -e "JSON.parse(require('fs').readFileSync('frontend/src/assets/i18n/en.json'));JSON.parse(require('fs').readFileSync('frontend/src/assets/i18n/hi.json'))"` -> no error.
- [ ] **Step 5: Verify the icon renders.** `grep -rn "Material" frontend/src/index.html frontend/angular.json | head` to see how the icon font loads (Material Symbols vs Icons). Confirm `campaign` exists in that font (it exists in both Material Icons and Symbols); the real-browser check is in Task 6. Commit: `git add -A frontend/src && git commit -m "feat(announcements): associate nav item and feed i18n"` (with the attribution trailer).

---

### Task 3: AnnouncementFeedComponent (TDD)

**Files:** Create `frontend/src/app/announcements/announcement-feed.component.ts` and `announcement-feed.component.spec.ts`.

**Interfaces:**
- Consumes: `AnnouncementService.list(page, size)`, `Announcement`, `AnnouncementPage` (Task 1 names); `InlineBannerComponent` from `../shared/components/inline-banner/inline-banner.component`.
- Produces: `AnnouncementFeedComponent` (selector `app-announcement-feed`, standalone), members `page`, `loading`, `loadError`, `goToPage(n)`, `retry()`, getters `currentPage`, `totalPages`; `PAGE_SIZE = 10`.

- [ ] **Step 1: Write the failing spec** (mirror of the ticket spec; URL `/api/announcements`; `flushPage(entries, total, page)` flushes `{entries,page,size:10,totalElements}`). Translation setup supplies the `announcementFeed` block from Task 2. Specs, each with real assertions:
  1. `loads page 0 with size 10 on init` (`params.get('page')==='0'`, `size==='10'`).
  2. `shows skeleton cards (role=status, sr-only label, aria-busy) while loading and nothing is disabled` (no element with `disabled` attr; `[role=status]` text contains 'Loading announcements'; `.announcement-feed__skeleton-card` count 3).
  3. `renders title, full multi-line body and a <time> with datetime`: body `'Line one\nLine two'`; assert `.announcement-feed__body` `textContent` equals it and that the element has class (pre-wrap lives in CSS), `time[datetime]` equals the `publishedAt` ISO string, one `article` per entry, order preserved.
  4. `renders hostile text literally`: title `'<img src=x onerror=alert(1)>'`, body `'<script>alert(1)</script><b>x</b>'`; assert `querySelector('img, script, b')` is null inside the feed and `textContent` contains the literal strings. Also a 300-char unbroken title renders fully (`textContent.length`).
  5. `empty page shows emptyTitle/emptyBody, no articles, no pager`.
  6. `on error shows danger banner with Retry, role=alert only on the error text, hides feed and pager, Retry re-requests`: assert `querySelectorAll('[role=alert]').length===1` and it is the `<span>` inside the banner.
  7. `Retry after a failed later page re-requests THAT page`: load page 0 (total 25), click Next, `flush(null,{status:500})`-style error on page 1, click Retry, `expectOne(page==='1')`.
  8. `ignores a stale response that arrives after a newer request`: two sequential `goToPage` calls via Retry/Next so the first request is superseded; flush newer first then older; assert page shows newer data. (Same technique as the ticket spec at line ~148; open that spec section and copy its mechanics, since goToPage blocks while loading use `retry()` twice to create two in-flight requests.)
  9. `pager buttons are aria-disabled, not disabled; goToPage ignores out-of-range`: on page 0 of 1 page: both `aria-disabled='true'`, no `disabled`; call `component.goToPage(-1)` and `goToPage(1)` then `httpMock.verify()` (no new request).
  10. `rapid Next clicks while loading issue only one request`.
  11. `Next loads the next page` (page param '1', indicator 'Page 2 of 3' for total 25).
  12. `is view-only`: no `input`, `textarea`, `select`, and no buttons other than Previous/Next/Retry.
- [ ] **Step 2:** `cd frontend && npx ng test --watch=false --include='**/announcement-feed.component.spec.ts'` -> FAIL (component missing).
- [ ] **Step 3: Implement** the component by copying `support-ticket-history.component.ts` logic (seq, lastPage, destroyed$, loadPage/goToPage/retry exactly as in the template) with these differences: `PAGE_SIZE = 10`; no status filter / `onStatusChange`; service call `this.service.list(page, PAGE_SIZE)`; types `AnnouncementPage`/`Announcement`; `trackById`. Template:

```html
<div class="announcement-feed">
  <div class="announcement-feed__intro">
    <span class="announcement-feed__eyebrow">{{ 'announcements.feed.eyebrow' | translate }}</span>
    <h1 class="announcement-feed__title">{{ 'announcements.feed.title' | translate }}</h1>
    <p class="announcement-feed__subtitle">{{ 'announcements.feed.subtitle' | translate }}</p>
  </div>

  <app-inline-banner *ngIf="loadError" tone="danger" class="announcement-feed__load-error">
    <span role="alert">{{ 'announcements.feed.loadError' | translate }}</span>
    <button type="button" class="announcement-feed__retry" (click)="retry()">{{ 'announcements.feed.retryAction' | translate }}</button>
  </app-inline-banner>

  <div *ngIf="loading" [attr.aria-busy]="true">
    <div role="status">
      <span class="announcement-feed__sr">{{ 'announcements.feed.loading' | translate }}</span>
      <div class="announcement-feed__skeleton-card" *ngFor="let _ of [1, 2, 3]"></div>
    </div>
  </div>

  <ng-container *ngIf="!loading && !loadError && page">
    <div class="announcement-feed__empty" *ngIf="!page.entries.length">
      <p class="announcement-feed__empty-title">{{ 'announcements.feed.emptyTitle' | translate }}</p>
      <p class="announcement-feed__empty-body">{{ 'announcements.feed.emptyBody' | translate }}</p>
    </div>
    <ol class="announcement-feed__list" *ngIf="page.entries.length">
      <li *ngFor="let a of page.entries; trackBy: trackById">
        <article class="announcement-feed__card">
          <time class="announcement-feed__dateline" [attr.datetime]="a.publishedAt">
            <span class="announcement-feed__day">{{ a.publishedAt | date: 'd' }}</span>
            <span class="announcement-feed__month">{{ a.publishedAt | date: 'MMM' }}</span>
            <span class="announcement-feed__year">{{ a.publishedAt | date: 'y' }}</span>
          </time>
          <div class="announcement-feed__content">
            <h2 class="announcement-feed__card-title">{{ a.title }}</h2>
            <p class="announcement-feed__body">{{ a.body }}</p>
          </div>
        </article>
      </li>
    </ol>
  </ng-container>

  <div class="announcement-feed__pagination" *ngIf="page && !loadError && page.entries.length">
    <!-- same indicator + aria-disabled Previous/Next buttons as the ticket template, with
         announcement-feed__prev / __next classes and announcements.feed.* keys -->
  </div>
</div>
```
Write the pager block out in full (copy from the ticket template, renaming classes/keys); do not leave the comment. If `page.entries` is empty but `page.page > 0` (rows deleted), the pager is hidden and empty state shows; acceptable (no delete feature exists).
- [ ] **Step 4:** Re-run the Step 2 command -> all PASS.
- [ ] **Step 5:** Commit `feat(announcements): associate announcements feed component`.

---

### Task 4: Route and route spec

**Files:** Modify `frontend/src/app/app.routes.ts` (after line 66, the `support-tickets` associate route), `frontend/src/app/app.routes.spec.ts` (after the support-tickets spec, line ~43-50).

- [ ] **Step 1: Failing test** in `app.routes.spec.ts` (copy the support-tickets spec, path `announcements`, title `guards the announcements route with authGuard and associateOnlyGuard and lazy-loads it`).
- [ ] **Step 2:** `npx ng test --watch=false --include='**/app.routes.spec.ts'` -> FAIL.
- [ ] **Step 3:** Add (against post-unit-3 text; unit 3 adds an admin child route, not a top-level `announcements` path; confirm no top-level path collision with `grep -n "'announcements'" frontend/src/app/app.routes.ts`):

```ts
{ path: 'announcements', loadComponent: () => import('./announcements/announcement-feed.component').then(m => m.AnnouncementFeedComponent), canActivate: [authGuard, associateOnlyGuard] },
```
- [ ] **Step 4:** Re-run -> PASS. Then `npx ng build` (or the repo's build script) must succeed and not exceed budgets; the screen is lazy.
- [ ] **Step 5:** Record what an ADMIN token does at `/announcements`: read `associateOnlyGuard` source (`grep -rn associateOnlyGuard frontend/src/app/auth`) and note the outcome (expected: redirect away) in the Task 6 verification notes; confirm in the browser in Task 6. Commit `feat(announcements): lazy /announcements route`.

---

### Task 5: Styles (`.announcement-feed*`)

**Files:** Modify `frontend/src/styles/_admin.scss` (append at end, after the Unit 3 composer block; place the new block under header comment `// ---- Announcements feed (associate, view-only) ----`).

**Interfaces:** Consumes existing placeholders `%admin-screen-title`, `%admin-screen-pagination`, `%admin-screen-page-indicator`, `%admin-screen-pagination-secondary-button`, tokens `--surface-card/raised`, `--border-subtle`, `--text-primary/muted`, `--brand-secondary`, `--font-display/mono`. No new tokens/hexes.

- [ ] **Step 1:** `Read` the tail of `_admin.scss` (post-rebase) and `docs/design/associate_operational_screens/announcements_feed/code.html` styles for the exact values; port class-for-class. Required rules:

```scss
.announcement-feed { display: flex; flex-direction: column; gap: 1.5rem; max-width: 880px; margin: 0 auto; padding: 1.5rem 2rem; font-family: 'Inter', var(--font-sans); }
.announcement-feed__intro { display: flex; flex-direction: column; gap: 0.25rem; }
.announcement-feed__eyebrow { font-family: var(--font-mono); font-size: 0.6875rem; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-muted); }
.announcement-feed__title { @extend %admin-screen-title; margin: 0; }
.announcement-feed__subtitle { margin: 0; font-size: 0.875rem; color: var(--text-muted); }
.announcement-feed__load-error { margin: 0; }
.announcement-feed__retry { margin-left: 0.75rem; min-height: 44px; background: none; border: 0; padding: 0; text-decoration: underline; cursor: pointer; color: inherit; font-weight: 600; }
.announcement-feed__sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.announcement-feed__pagination [aria-disabled='true'] { opacity: 0.5; cursor: not-allowed; }
.announcement-feed__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 1rem; }
.announcement-feed__card { display: grid; grid-template-columns: 7.5rem minmax(0, 1fr); background: var(--surface-card); border-radius: 20px; box-shadow: 0 4px 20px -2px rgba(0,0,0,0.08); overflow: hidden; }
.announcement-feed__dateline { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.125rem; padding: 1.25rem 0.75rem; background: var(--surface-raised); border-right: 1px solid var(--border-subtle); font-family: var(--font-mono); font-size: 0.75rem; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-muted); }
.announcement-feed__day { font-family: var(--font-display); font-size: 2rem; line-height: 1; color: var(--brand-secondary); }
.announcement-feed__content { padding: 1.25rem 1.5rem; min-width: 0; }
.announcement-feed__card-title { margin: 0 0 0.5rem; font-family: var(--font-display); font-size: 1.25rem; font-weight: 600; color: var(--text-primary); overflow-wrap: anywhere; }
.announcement-feed__body { margin: 0; max-width: 62ch; font-size: 0.9375rem; color: var(--text-primary); white-space: pre-wrap; overflow-wrap: anywhere; }
.announcement-feed__empty { padding: 3rem 1.5rem; text-align: center; color: var(--text-muted); background: var(--surface-card); border-radius: 20px; }
.announcement-feed__empty-title { margin: 0 0 0.25rem; font-family: var(--font-display); font-size: 1.125rem; color: var(--text-primary); }
.announcement-feed__empty-body { margin: 0; }
.announcement-feed__skeleton-card { height: 7rem; border-radius: 20px; background: var(--surface-raised); margin-bottom: 1rem; animation: announcement-feed-pulse 1.2s ease-in-out infinite; }
@keyframes announcement-feed-pulse { 50% { opacity: 0.45; } }
@media (prefers-reduced-motion: reduce) { .announcement-feed__skeleton-card { animation: none; } }
.announcement-feed__pagination { @extend %admin-screen-pagination; }
.announcement-feed__page-indicator { @extend %admin-screen-page-indicator; }
.announcement-feed__pagination .brand-button--secondary { @extend %admin-screen-pagination-secondary-button; }

@media (max-width: 768px) {
  .announcement-feed { padding: 1rem; }
  .announcement-feed__card { grid-template-columns: 1fr; border-radius: 16px; }
  .announcement-feed__dateline { flex-direction: row; justify-content: flex-start; gap: 0.375rem; padding: 0.625rem 1.25rem; border-right: 0; border-bottom: 1px solid var(--border-subtle); }
  .announcement-feed__day { font-size: 1rem; }
  .announcement-feed__content { padding: 1.125rem 1.25rem; }
  .announcement-feed__pagination .brand-button--secondary { min-height: 44px; }
}
```
Adjust values to `code.html` where it differs (the design wins). Confirm `.announcement-feed__pagination` placeholders behave inside a column flex container as for tickets.
- [ ] **Step 2:** Collision check: `grep -n "announcement-feed" frontend/src/styles/*.scss | grep -v "^frontend/src/styles/_admin.scss"` empty; `grep -n "^\.announcement-feed" _admin.scss` only the names above; no selector in the block starts with a bare element.
- [ ] **Step 3:** `npx ng build` succeeds (SCSS compiles). Commit `style(announcements): feed card styles`.

---

### Task 6: Real-app verification (browser) on a fresh DB

Use the `run` skill for startup details. Throwaway Postgres container, its own free ports (not the dev defaults), freshly migrated (Flyway runs V1..latest on startup). No code changes expected; fix defects found in Tasks 2-5 and add a regression spec for each.

- [ ] **Step 1:** Start Postgres on a free port, backend (`SPRING_DATASOURCE_*` pointed at it, own server port), frontend dev server proxied to that backend (per `run` skill). Create an admin and an associate (per the skill's seeding approach). Record the ports used.
- [ ] **Step 2 (empty state first):** Log in as the associate with ZERO announcements. Open `/announcements`; confirm the empty message "No announcements yet" with no pager, and a screenshot. Check the sidebar item "Announcements" shows the `campaign` glyph (not the literal text `campaign`) and is highlighted when active.
- [ ] **Step 3 (seed):** As admin, publish via `POST /api/admin/announcements` (or the unit 3 composer if merged): 1 with HTML-looking text (`<b>bold</b> <script>alert(1)</script> <img src=x onerror=alert(1)>`), 1 with a 300-char unbroken title and a 5000-char unbroken body, 1 multi-line body (blank lines + indentation), and enough short ones to total 12+ (page 2). Note `publishedAt` ordering: newest first.
- [ ] **Step 4 (desktop):** As the associate, verify: 10 cards on page 1, newest first, HTML shown literally with no alert dialog, line breaks preserved, URLs not links, dates in local time, "Page 1 of 2", Previous aria-disabled, Next goes to page 2 with 2+ cards and Next then aria-disabled. Check the console for errors (`read_console_messages`).
- [ ] **Step 5 (loading/error/Retry):** Throttle or delay the request (devtools network throttling or a proxy delay) to see skeletons with the pager absent and no disabled controls; then kill the backend (or block `/api/announcements`), click Next on page 1 so the failure is for page 2, confirm the banner + Retry, restore the backend, click Retry, and confirm page 2 (not page 1) loads.
- [ ] **Step 6 (responsive):** Via same-origin iframes of the running app at widths 375 (sidebar rail collapsed; the pinned-sidebar ~127px shell issue is pre-existing and out of scope), 767 and 769: at 375 and 767 cards stack with the dateline strip; at 769 the gutter layout returns; no horizontal page scroll (check `document.documentElement.scrollWidth <= innerWidth` inside each iframe) even with the unbroken-string announcement; Previous/Next at least 44px tall on mobile.
- [ ] **Step 7 (guards):** Open `/announcements` with an ADMIN token and record the outcome (per `associateOnlyGuard`); unauthenticated -> login redirect. Note both in the final report.
- [ ] **Step 8:** Stop servers and remove the throwaway container and temp files. Final: `cd frontend && npx ng test --watch=false` full run: all PASS (backend untouched, so no mvn run needed).

---

## Self-Review

- Spec coverage: nav item (T2), route+guards (T4), paging 10 (T3), newest-first (server order, T3 order assertion), empty/loading/error (T3, T6), view-only (T3 spec 12), tokens-only styling (T5), responsive (T5, T6). Audience not exposed: model has no audience field.
- Name consistency: `AnnouncementFeedComponent`, `announcements.feed.*` keys, `.announcement-feed*` classes used identically across tasks. Model/service names depend on Task 1 reconciliation.

## Open Questions

1. Unit 3's actual model/service file names and `list` signature (Task 1 reconciles; plan assumes `announcements/announcement.model.ts`, `announcement.service.ts`, `AnnouncementPage`).
2. What does `associateOnlyGuard` do for ADMIN (redirect target)? Recorded in Task 6 rather than assumed.
3. `hi.json` nav label proposed as "घोषणाएँ"; confirm wording.

## Coordinator decisions (user-approved 2026-10-09)

- i18n: feed keys live at `announcements.feed.*` (a `feed` child inside the top-level `announcements` object created by unit 3, sibling of `composer`). Any remaining mention of a separate `announcementFeed` namespace is superseded; the JSON snippet in Task 2 is a `feed` block to nest, not a new top-level key (the implementer must nest it after reading unit 3's merged en.json/hi.json).
- Hindi nav label "घोषणाएँ"; other hi strings English.
- Unit 3's merged model/service names win over any assumption here (Task 1 reconciles).
