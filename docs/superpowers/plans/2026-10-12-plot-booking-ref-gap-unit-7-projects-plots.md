# Plot-Booking Reference-Gap U7 — Projects & Plots (Rate / Search / Export, Booking Discount) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. TDD: write the spec, watch it fail, implement, watch it pass. **Do NOT edit any tracking file** (`*-units.md`, `spec-cycle-status.md`); the coordinator does that.
>
> **Worktree base:** this plan must be committed on master before dispatch. In a worktree run `git log --oneline -1 -- docs/superpowers/plans/2026-10-12-plot-booking-ref-gap-unit-7-projects-plots.md`; if empty, run `git merge --ff-only master` first (U1-U3 backend and U5-U6 frontend must be in your base). Never `cd` into another worktree.

**Goal:** In `/settings/projects-plots` give admins a Rate column, client-side search and CSV export on the Table view, and let the Book-plot form take an optional Discount with a live total and token validation that mirrors the U3 backend rules.

**Architecture:** Frontend only. No backend change (Decision 1). The grid payload stays rate-free; admin-only Table view lazily loads rates from the **existing** paged plots endpoint and joins them to grid rows by `plotId`. New table tools live in a tiny lazy `ViewEncapsulation.None` stylesheet under a new prefix; the discount block likewise. `_admin.scss` is not touched.

**Tech Stack:** Angular 18 standalone, `@ngx-translate`, Karma/Jasmine (`HttpClientTestingModule`), RxJS.

**Spec:** parent plan `docs/superpowers/plans/2026-10-12-plot-booking-reference-gap-plan.md` (U7 + "Design rules"), `/DESIGN.md`, `docs/design/plot-booking-vs-reference-video.md` (rows 4, 5, 7, 20), U5 plan `...-unit-5-fe-foundations.md`, U6 plan `...-unit-6-bookings-emi-tabs.md` (conventions).

Working dir for every frontend command: `/Users/ronalisenapati/Ronali/plotchain/frontend`. Targeted run: `npx ng test --watch=false --browsers=ChromeHeadless --include=<spec path relative to frontend/>`.

## Global Constraints

- Tokens only, **no hex literals** in new SCSS (do not copy the `#F0E9D6` in `_admin.scss`'s `.book-form__preview`). Primary = `.brand-button`, secondary = `.brand-button.brand-button--secondary`. Errors = `--status-danger` (never Oxblood). Amounts/IDs mono + `font-variant-numeric: tabular-nums`. No shadows/gradients/animation. Material Symbols Outlined only. No Fraunces in this unit; **no new seal card** (this screen has none).
- Per-screen BEM prefixes: new table tools = `.plot-table-tools`; new discount block = `.book-totals`. Both in NEW component SCSS with `encapsulation: ViewEncapsulation.None`. **Do not touch `frontend/src/styles/_admin.scss`** (at bundle budget). Each new SCSS < 2000 B (component-style budget warn 2 kB / error 4 kB).
- Rate is shown/fetched/exported **only when `!readOnly`**. An associate (route `data.readOnly`) must produce **zero** extra requests and see no Rate/search/export; pinned in Task 2.
- No `window.confirm/alert`. No new npm dependency. "Excel" = CSV via the existing `exportCsv` (`shared/utils/table-export.util.ts`).
- i18n: every key in BOTH `src/assets/i18n/en.json` and `hi.json` (hi mirrors English, existing practice). Reuse existing keys wherever listed in Task 1; **no key may be added without a consumer** and none left unused (final grep in Task 5).
- Keep every existing spec green. Existing component specs `http.verify()` after `boot()`, so **no new request may fire on load/boot**; rates load only when the Table view is opened (Decision 3).

## Review Focus

1. **Rate must not leak to associates:** the Rate request, column, search and export are all gated on `!readOnly`; a readOnly spec asserts no `/api/company/projects/p1/plots?...` request after switching to Table (Task 2).
2. **Server/client discount rule drift:** server (`BookingService` L87-95): `discount` null=0, rounded HALF_UP to 2dp, must be `>= 0` and `< listPrice`; `token > 0` and `token < listPrice - discount`. UI must reject exactly the same set (boundary specs: discount == price rejected, price-0.01 accepted, token == total rejected, token == total-0.01 accepted) (Task 3).
3. **Token validated against the stale list price:** the old check/preview use `plot.price`; both must switch to the net total, and re-evaluate when the discount changes after the token was typed (Task 3).
4. **Blank discount must not send `discount: 0` surprises:** blank/0 omits the field so the request is byte-identical to today's (existing container specs stay green); positive sends the 2dp number (Task 4).
5. **CSV shows what the admin sees:** export = current legend-filter + search rows, never the whole project silently, and is disabled while rates are unavailable so a CSV never ships blank rates (Task 2). Formula-injection safety comes from `toCsv`'s `cell()`; plot numbers like `-5` are covered by it.
6. **Project switch mid-flight:** a late rates response for project A must not paint into project B (same guard as `loadGrid`) (Task 2).

## Decisions

1. **No backend task.** A rate-bearing plots endpoint already exists: `GET /api/company/projects/{projectId}/plots?page&size` (`PlotController.list` -> `PlotResponse{id, plotNo, plotType, areaSqft, rate, price, status}`), consumed by the existing `ProjectsService.listPlots`. The grid (`/api/projects/{id}/plots/grid`, `PlotGridResponse`) deliberately has no rate and stays untouched. Therefore no new controller, no `SecurityConfig` matcher (the `/x` vs `/x/*` lesson does not arise), no backend tests.
   - **Pre-existing exposure (open question 1):** `SecurityConfig` L341-343 makes that endpoint `.authenticated()` and `PlotControllerTest.listReturnsAPageForAnAssociateToken` pins it, so an associate calling the API directly already receives `rate`. The UI never asks for it; this unit does not change the API. Needs an owner call; a separate backend unit if wanted.
2. **Rates are joined to grid rows by `plotId`** (`Plot.id` == `PlotGridResponse.plotId`). The table keeps its grid-sourced status (live-derived) and only borrows `rate`. A plot missing from the rates map shows an em dash.
3. **Lazy load:** rates are requested the first time Table view is shown for a project (`view === 'table' && !readOnly`), cached per project id (cleared in `selectProject`), retried via a Retry button. Because it is lazy, no existing boot-based spec gains an open request.
4. **Fetch strategy:** `ProjectsPlotsService.getPlotRates(projectId)` walks pages of `size=500` with the existing `collectPages` (`admin/admin-bookings-emi/bookings-emi.util.ts`) and returns `Record<plotId, rate>`. The backend page query has no explicit sort, so paging order across >500 plots is not guaranteed (open question 2); for projects under 500 plots it is one request.
5. **Search:** one text box above the table (admin only). Case-insensitive substring on `plotNo`, OR status match (typed text is a substring of the translated status label, or of the status code lower-cased). Composes with the legend status chips (AND). Cleared on project change. Pure function `filterPlotRows` in `projects-plots.util.ts` (new, unit-tested) so the component stays thin.
6. **Export:** `exportCsv` of the visible rows; columns `Plot, Area (sq ft), Rate, Total, Status` with headers from existing keys; filename `plots-<project name slug>.csv`. Disabled when there are no rows or rates are not loaded.
7. **Book form:** discount is an optional number input between buyer phone and token. Blank = 0. Value is rounded to 2dp (mirrors server `setScale(2, HALF_UP)`) before validation/emit. `net = round2(price - discount)` drives the live summary, token validation and the instalment preview. Summary block (`.book-totals`: Plot price / Discount / Total after discount, `aria-live="polite"`) renders only when the discount is valid and > 0; the header total remains the list price.
8. **Request shape:** `BookingFormValue.discount: number` (0 when blank); `CreateBookingRequest.discount?: number` sent only when `> 0`.

## Task map and parallelism

| # | Task | Files touched | Depends on |
|---|------|---------------|------------|
| 1 | i18n keys en+hi | `src/assets/i18n/en.json`, `hi.json` | none |
| 2a | Service `getPlotRates` + util `filterPlotRows` | `projects-plots.service.ts/.spec.ts`, `projects-plots.util.ts/.spec.ts` (new) | none |
| 2b | Table Rate/search/export in container | `projects-plots.component.ts/.spec.ts`, `plot-table-tools.scss` (new) | 2a |
| 3 | Book form discount | `book-plot-form.component.ts/.spec.ts`, `book-plot-form.component.scss` (new), `projects-plots.model.ts` | none |
| 4 | Container passes `discount` | `projects-plots.component.ts/.spec.ts` | 3, and 2b merged (same files) |
| 5 | Full verification + manual checklist | none | all |

**Disjoint, safe to run in parallel worktrees:** Task 1, Task 2a, Task 3 (no shared files). **Must be sequenced:** 2b after 2a; Task 4 after both 3 and 2b (it edits `projects-plots.component.ts/.spec.ts`, which 2b owns, and consumes 3's model); Task 5 last. Recommended dispatch: wave 1 = {1, 2a, 3}; wave 2 = {2b}; wave 3 = {4}; then 5. Task 1 only needs to merge before Task 5 (specs use `TranslateModule.forRoot()` with keys-as-text, so they do not read the JSON).

---

### Task 1: i18n keys (en + hi)

**Files:** Modify `frontend/src/assets/i18n/en.json`, `frontend/src/assets/i18n/hi.json` (both under `admin.projectsPlots`, hi values = the English text).

New keys (exact names; consumers in parentheses):
- `table.searchLabel` "Search plots" (2b, sr-only label), `table.searchPlaceholder` "Plot no or status" (2b), `table.exportCsv` "Export CSV" (2b), `table.noMatch` "No plots match your search." (2b), `table.count` "{{shown}} of {{total}} plots" (2b), `table.rateError` "Couldn't load rates." (2b; Retry reuses existing `admin.projectsPlots.retry`).
- `discountLabel` "Discount" (3; reuses existing `optional`), `discount.negative` "The discount can't be negative." (3), `discount.tooHigh` "The discount must be less than the plot price." (3), `summary.price` "Plot price" (3), `summary.discount` "Discount" (3), `summary.total` "Total after discount" (3).
- **Change text** of existing `token.tooHigh` to "The token must be less than the total after discount." (3), both files.
- **Reused as-is (do not add):** `table.plot/area/total/status`, `rateLabel` ("Rate (₹ / sq ft)") for the Rate header and CSV, `retry`, `optional`, `totalLabel`.

- [ ] **Step 1:** Add the keys in `en.json` next to the existing `table`/`token` entries; mirror in `hi.json` (English text).
- [ ] **Step 2:** Validate JSON: `node -e "for (const f of ['en','hi']) JSON.parse(require('fs').readFileSync('src/assets/i18n/'+f+'.json','utf8'))"` -> no output.
- [ ] **Step 3:** Parity check: `node -e "const g=f=>require('./src/assets/i18n/'+f+'.json').admin.projectsPlots; const k=(o,p='')=>Object.entries(o).flatMap(([a,b])=>typeof b==='object'?k(b,p+a+'.'):[p+a]); const e=k(g('en')),h=k(g('hi')); console.log(e.filter(x=>!h.includes(x)),h.filter(x=>!e.includes(x)))"` -> `[] []`.
- [ ] **Step 4:** Commit: `git add frontend/src/assets/i18n/en.json frontend/src/assets/i18n/hi.json && git commit -m "feat(i18n): plots table tools and booking discount keys"`.

### Task 2a: Service `getPlotRates` + util `filterPlotRows`

**Files:** Modify `frontend/src/app/admin/projects-plots/projects-plots.service.ts`, `projects-plots.service.spec.ts`; Create `frontend/src/app/admin/projects-plots/projects-plots.util.ts`, `projects-plots.util.spec.ts`.

- [ ] **Step 1 (RED, service spec):** in `projects-plots.service.spec.ts` add:
  - `getPlotRates reads /api/company/projects/p1/plots with page=0&size=500 and maps id -> rate` (flush `{plots:[{id:'x',rate:2299,...},{id:'y',rate:1999,...}], page:0, size:500, totalElements:2}`; expect `{x:2299, y:1999}`).
  - `getPlotRates walks every page` (flush `totalElements: 501` on page 0 with one plot, expect a second request `page=1&size=500`, merged result has both ids).
  - `getPlotRates propagates an HTTP error` (500 -> error callback).
- [ ] **Step 2:** `npx ng test --watch=false --browsers=ChromeHeadless --include=src/app/admin/projects-plots/projects-plots.service.spec.ts` -> new specs FAIL.
- [ ] **Step 3 (GREEN):** add to `ProjectsPlotsService`:
  `getPlotRates(projectId: string): Observable<Record<string, number>>` = `collectPages` (size 500; load = GET `/api/company/projects/${projectId}/plots` with `HttpParams page,size`, mapped to `{rows: r.plots, totalElements: r.totalElements}`) then `map` reduce to `{[p.id]: p.rate}`. Import `PlotPageResponse` from `../../setup/models/project.model` and `collectPages` from `../admin-bookings-emi/bookings-emi.util`. Do NOT add anything to `getGrid`.
- [ ] **Step 4 (RED, util spec):** `projects-plots.util.spec.ts` for `filterPlotRows(rows: PlotGridItem[], query: string, statusLabel: (s: PlotStatus) => string): PlotGridItem[]`:
  - empty/whitespace query returns the same rows
  - `'a-1'` matches plot `A-12` and `A-1` case-insensitively, not `B-2`
  - `'book'` matches rows whose translated label contains it (`label = s => s === 'BOOKED' ? 'Booked' : ...`)
  - `'sold'` matches status code even if label differs (label returns Hindi)
  - query is trimmed; no match returns `[]`
  Run `--include=src/app/admin/projects-plots/projects-plots.util.spec.ts` -> FAIL.
- [ ] **Step 5 (GREEN):** implement `filterPlotRows` (pure; `q = query.trim().toLowerCase()`; keep a row if `plotNo.toLowerCase().includes(q) || status.toLowerCase().includes(q) || statusLabel(status).toLowerCase().includes(q)`). Re-run both specs -> PASS.
- [ ] **Step 6:** Commit those four files.

### Task 2b: Table view — Rate column, search, CSV export

**Files:** Modify `projects-plots.component.ts`, `projects-plots.component.spec.ts`; Create `frontend/src/app/admin/projects-plots/plot-table-tools.scss`. Requires 2a merged.

Component changes (all gated on `!readOnly` except where noted): inject `TranslateService`; add `rates: Record<string, number> | null`, `ratesError`, `search = ''`, `tableRows: PlotGridItem[]` (flattened `visibleBlocks` -> `filterPlotRows`, recomputed in `rebuild()` and `onSearch()`); `loadRates()` (guard `selectedProject` id before assigning, like `loadGrid`); view switch handler `setView(v)` replaces the inline `(click)="view = v"` and calls `loadRates()` when `v === 'table' && !readOnly && !rates && !ratesLoading`; `selectProject` clears `rates`, `ratesError`, `search`; `exportPlots()` builds `ExportColumn<PlotGridItem>[]` from translated existing headers and calls `exportCsv(this.tableRows, cols, 'plots-' + slug + '.csv')`. Template: in the table block, above `<table>`, an admin-only `<div class="plot-table-tools">` with the search `<input type="search" class="plot-table-tools__search">` (sr-only `<label>` using `table.searchLabel`, placeholder `table.searchPlaceholder`, `(input)="onSearch($any($event.target).value)"`), a `plot-table-tools__count` (`table.count`), the `Export CSV` secondary button (`plot-table-tools__export`, `[disabled]="!rates || !tableRows.length"`), and a rates error line with Retry (`table.rateError`, `.projects-plots__retry`). Add a `<th class="projects-plots__num">` Rate (`admin.projectsPlots.rateLabel`) and a `<td class="projects-plots__num">` after Area, both `*ngIf="!readOnly"`; cell = `rates?.[p.plotId] != null ? rate.toLocaleString('en-IN') : '—'`. Empty search result shows `<p class="projects-plots__empty">` with `table.noMatch`. The table body iterates `tableRows` (grouped-block iteration is dropped for the table only; grid/site views unchanged). Add `styleUrl: './plot-table-tools.scss'` and `encapsulation: ViewEncapsulation.None`.
`plot-table-tools.scss` (< 2000 B, tokens only): flex row wrapping, gap `0.75rem`, search input min-height 40px / `border: 1px solid var(--border-subtle)` / `background: var(--surface-card)` (use whichever surface token `_admin.scss` uses for inputs), mono count `var(--font-mono)` `var(--text-muted)`, export button inherits `.brand-button--secondary`; `@media (max-width: 767px)` search grows to full width.

- [ ] **Step 1 (RED), add to `projects-plots.component.spec.ts`** (helper `openTable()` clicks the Table view button; `rates()` flushes `/api/company/projects/p1/plots?page=0&size=500` — match by `req.url` + params with `http.expectOne(r => r.url === '/api/company/projects/p1/plots' && r.params.get('size') === '500')`):
  - `no rates request fires on boot` (existing boot + `http.verify()` already; add explicit test that switching to Grid/Site fires none).
  - `opening Table view requests rates once and shows the Rate column` (flush `{plots:[{id:'id-A-2', rate:3750, ...}], ..., totalElements:1}`; header contains `admin.projectsPlots.rateLabel`; A-2 row shows `3,750`; rows without a rate show `—`; switching Table->Grid->Table does not re-request).
  - `readOnly (associate) Table view has no Rate column, no search, no export and makes no rates request` (override route data `{readOnly: true}` as the existing readOnly spec does; `http.verify()` proves it).
  - `search narrows rows by plot number and by status, composes with the legend chip, and shows noMatch` (type `a-1`; click BOOKED chip + search `a`; type `zzz` -> `table.noMatch`).
  - `search is cleared when another project is selected`.
  - `a late rates response for the previously selected project is ignored` (two projects; open table on p1; select p2 before flushing p1's response; p2's table must not show p1's rates).
  - `rates failure shows the rateError line, Rate cells show — and Export is disabled; Retry refetches` .
  - `Export CSV is disabled until rates load and exports exactly the visible (filtered) rows with Plot,Area,Rate,Total,Status columns`: spy `URL.createObjectURL` and capture the Blob (`await blob.text()`), assert header row and that a searched-out plot is absent; filename `plots-green-valley.csv` via the anchor's `download`.
- [ ] **Step 2:** `npx ng test --watch=false --browsers=ChromeHeadless --include=src/app/admin/projects-plots/projects-plots.component.spec.ts` -> new specs FAIL, old ones still PASS.
- [ ] **Step 3 (GREEN):** implement as described above. Update any existing spec that clicks the Table view (grep `view.table` / `table` in the spec) to flush the rates request, or to `http.match` it.
- [ ] **Step 4:** re-run the component spec + `plot-grid.util` specs -> all PASS. `npx ng build` must not warn on `plot-table-tools.scss`.
- [ ] **Step 5:** Commit: `git add` the component, its spec, `plot-table-tools.scss`; message ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

### Task 3: Book-plot form — Discount, live total, token validation

**Files:** Modify `projects-plots.model.ts`, `book-plot-form.component.ts`, `book-plot-form.component.spec.ts`; Create `frontend/src/app/admin/projects-plots/book-plot-form.component.scss` (prefix `.book-totals`, `ViewEncapsulation.None`, `styleUrl`).

Model: `BookingFormValue.discount: number` (0 when blank); `CreateBookingRequest.discount?: number`.
Form logic (mirror the server): `discountRaw: number | null` bound to `<input name="discount" type="number" inputmode="decimal" min="0" step="any">` placed after buyer phone, label `discountLabel` + `optional`; `get discount()` = `round2(discountRaw ?? 0)` where `round2 = n => Math.round((n + Number.EPSILON) * 100) / 100`; `get discountError(): 'negative'|'tooHigh'|null` (only after `tried`; negative if `< 0`, tooHigh if `>= plot.price`); `get net()` = `round2(plot.price - discount)` (valid discount only, else `plot.price`); token checks (`tokenError`, `tokenValid`, `previewParams`) switch from `plot.price` to `net`; token rule `t > 0 && t < net`. Summary block shown when `discount > 0 && !discountError`: three mono rows (`summary.price`, `summary.discount` with a leading minus, `summary.total`), `aria-live="polite"`, wrapper `.book-totals`. Discount `aria-invalid`/`aria-describedby="book-discount-err"` + `<app-field-error>` using `discount.<error>`. Submit focuses the first invalid control in DOM order (name, discount, token); emits `discount: this.discount`.

- [ ] **Step 1 (RED), add specs to `book-plot-form.component.spec.ts`** (plot price 5,130,000):
  - `shows no summary and emits discount 0 when the discount is blank`
  - `live total: typing 130000 shows Plot price, Discount and Total after discount = 5,000,000`
  - `rejects a negative discount (flags field, focuses it, no emit)`
  - `rejects a discount equal to the plot price; accepts price - 0.01` (boundary)
  - `rounds the discount to 2dp before validating and emitting` (e.g. `1000.005` -> emitted `1000.01`)
  - `token must be below the discounted total: with discount 130000 a token of 5,000,000 is tooHigh, 4,999,999.99 accepted`
  - `changing the discount after the token re-validates the token` (token 5,100,000 valid at no discount; add discount 130000 -> submit blocked with `token.tooHigh`)
  - `instalment preview uses the discounted total` (EMI 6 installments; discount 130000, token 500000 -> amount = (5,000,000-500,000)/5 = 900,000 in the preview params)
  - `emits discount alongside associate, buyer and token on a valid submit`
- [ ] **Step 2:** `npx ng test --watch=false --browsers=ChromeHeadless --include=src/app/admin/projects-plots/book-plot-form.component.spec.ts` -> new FAIL, old PASS.
- [ ] **Step 3 (GREEN):** implement. `book-plot-form.component.scss` (< 2000 B, tokens only, no hex): `.book-totals` bordered block (`1px solid var(--border-subtle)`), rows `display:flex; justify-content:space-between`, values `var(--font-mono)` + `tabular-nums`, final row `border-top: 1px solid var(--border-subtle)` and `font-weight:600`; label text in `var(--text-muted)`.
- [ ] **Step 4:** re-run the spec -> PASS; also run `--include=src/app/admin/projects-plots/projects-plots.component.spec.ts` to confirm the container still compiles (Task 4 wires the value; the existing submit specs may need `discount: 0` added to their expected `BookingFormValue` only if they `toEqual` it).
- [ ] **Step 5:** Commit the four files (model, form, spec, scss).

### Task 4: Container sends `discount`

**Files:** Modify `projects-plots.component.ts`, `projects-plots.component.spec.ts`. Requires 2b and 3 merged.

- [ ] **Step 1 (RED):** in the component spec's booking section add:
  - `submitBooking sends discount when positive` (flush-less: `http.expectOne('/api/admin/bookings')` body `toEqual` `{plotId, associateId, buyerName, buyerPhone, tokenAmount, discount: 130000}`)
  - `submitBooking omits discount when blank/0` (assert `'discount' in body === false`).
  - `a 400 InvalidDiscount response shows the server text in the danger banner` (400 `{error:'Discount ... '}` -> banner text; form stays open).
- [ ] **Step 2:** run the component spec -> new FAIL.
- [ ] **Step 3 (GREEN):** in `submitBooking` add `...(v.discount > 0 ? { discount: v.discount } : {})` to the request object. Nothing else (error mapping already shows `err.error.error` for 400).
- [ ] **Step 4:** run the component + book-form + service specs -> PASS. Commit both files.

### Task 5: Full verification

- [ ] `npx ng test --watch=false --browsers=ChromeHeadless` (whole suite) -> 0 failed; compare the count with master baseline and note any pre-existing flake.
- [ ] `npx ng build` -> no new errors; no new component-style or initial-bundle budget warnings versus master (`plot-table-tools.scss` and `book-plot-form.component.scss` each < 2 kB).
- [ ] No-hex check: `git diff master -- 'src/**/*.scss' | grep -n '^+.*#[0-9A-Fa-f]\{3,6\}\b'` -> empty. `_admin.scss` not in `git diff --stat`.
- [ ] Unused-key check for each new i18n key: `grep -rn "projectsPlots.<key>\|'table.<...>'" src/app` shows at least one consumer; `discount.negative/tooHigh` are reached through the dynamic `'admin.projectsPlots.discount.' + discountError` (note this in the commit message so a reviewer does not flag them).
- [ ] Manual checklist (run skill; frontend on 4201; `admin` and `VP00001`):
  1. Admin > Projects & Plots > pick a project > Table: Rate column fills after a beat; plots without a rate show an em dash; exactly one `GET /api/company/projects/{id}/plots?page=0&size=500` in the network tab; switching views and back does not refetch.
  2. Search `A-1`, then `book`, then a nonsense string (empty message); legend chip + search combine; switching project clears the box.
  3. Export CSV with a search active: opens in Excel/Numbers with BOM-safe headers `Plot, Area (sq ft), Rate (₹ / sq ft), Total, Status`, only the visible rows; disabled while rates are loading or after a forced failure (block the request in devtools, Retry works).
  4. Log in as `VP00001` > View Plot > Table: no Rate column, no search, no Export, no `/plots?page` request.
  5. Book plot as admin: type discount 130000 -> summary shows list, discount, total; token equal to total shows the "less than the total after discount" error; discount equal to the price and a negative value are rejected; blank discount books as before; with a discount, Bookings & EMI register shows Discount and the booking total = price - discount.
  6. Narrow viewport (<768px): tools wrap, table scrolls inside its wrap, summary readable. Screenshot Table view and Book form against DESIGN.md (tokens, mono numerics, no extra shadows).

## Open questions (for the owner)

1. `GET /api/company/projects/{id}/plots` (and `/{plotId}`) returns `rate` to any authenticated user including associates (pinned by `PlotControllerTest.listReturnsAPageForAnAssociateToken`; `SecurityConfig` `.authenticated()`). The UI does not request it for associates, but the API does expose it. Should rate be ADMIN-only at the API (a separate backend unit: split matcher for the list/get routes; associate "View Plot" must keep working off the grid)?
2. Backend plot list pages without an explicit sort; for projects over 500 plots, rates could be missed/duplicated across pages. Add `Sort.by("plotNo")` in `PlotService.list` (one line plus a repository test) if projects that large are expected.
3. Search covers plot no and status only (per the parent plan); area/price search and column-visibility toggles from the reference DataTable are intentionally not included.
