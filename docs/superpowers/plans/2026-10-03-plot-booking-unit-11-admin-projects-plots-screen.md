# Plot Booking Unit 11: Admin "Projects & Plots" Screen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give an Admin a new operational screen, `/settings/projects-plots`, that shows each project's plots as a colour-coded survey-style grid (`AVAILABLE`/`BOOKED`/`SOLD`), lets them add/edit projects and plots (plus CSV import), and book an `AVAILABLE` plot for an associate's buyer.

**Architecture:** One container component (`admin/projects-plots/projects-plots.component.ts`) owns all state and every HTTP call that mutates; four small presentational/form components (`book-plot-form`, `plot-form`, `project-form`, `csv-import-panel`) fill a single swappable aside. A new shared `plot-tile` component (plus pure helpers in `shared/utils/plot-grid.util.ts`) is built here and reused unchanged by unit 13. A thin `ProjectsPlotsService` wraps the four endpoints the existing `ProjectsService` lacks (grid, single plot, create booking, EMI config); project/plot CRUD and CSV reuse the existing `ProjectsService` as-is. The nav gains one new category, `inventory`, that unit 12 later extends.

**Tech Stack:** Angular 18 standalone components, `@ngx-translate/core`, `HttpClient`, `FormsModule` (template-driven, as `epin-register` does), Karma + Jasmine with `HttpClientTestingModule`/`HttpTestingController`, SCSS partials under `frontend/src/styles/`. No new libraries.

**Spec:** `docs/superpowers/specs/role-capability/2026-10-01-plot-booking-lifecycle-design.md` — "Screens" → Admin "Projects & Plots", Decision 10 (grid read), Decision 12 (admin-only writes). Design: `docs/design/admin_operational_screens/projects_plots/DESIGN.md` (read it fully first; `screen.png`, `screen-booking-form.png`, and `code.html#<state>` are the visual reference). Tracked as row 11 of `docs/superpowers/plans/2026-10-01-plot-booking-units.md`; depends on unit 1 (`POST /api/admin/bookings`) and unit 10 (`GET /api/projects/{id}/plots/grid`), both merged.

## Global Constraints

- Frontend only. Zero backend changes: every endpoint used already exists and is merged (verified by reading `PlotController`, `BookingEmiConfigController`, `PlotGridResponse`, `CreateBookingRequest`).
- Admin-only: the route sits under the existing `settings` parent, which is already guarded `[authGuard, adminGuard, launchedModeGuard]`. No new guard.
- Endpoints (exact): grid `GET /api/projects/{id}/plots/grid` (NOT under `/api/company`) → bare array `{plotId, plotNo, type, area, price, status}`; single plot `GET /api/company/projects/{projectId}/plots/{plotId}` → `Plot` (carries `rate`); booking `POST /api/admin/bookings` body `{plotId, associateId, buyerName (NotBlank ≤200), buyerPhone? ≤20}`; EMI config `GET /api/company/booking-emi` → `{emiEnabled, defaultInstallmentCount, confirmRule, confirmThresholdPercent, updatedAt}`.
- Reuse, don't redeclare: `Project`, `ProjectRequest`, `Plot`, `PlotRequest`, `PlotType`, `PlotStatus`, `CsvValidationResponse` from `setup/models/project.model.ts`; `ProjectsService` from `setup/steps/projects/projects.service.ts` (CRUD, thumbnail upload, CSV validate/commit, `csvTemplateUrl()`); `AdminService.listAssociates()`; `app-associate-lookup`, `app-inline-banner`, `app-field-error`, `.brand-button`.
- Nav: category `key: 'inventory'` (NOT `inventory-bookings`). `admin-nav-categories.model.spec.ts` enforces `labelKey === 'nav.categories.' + key`, and DESIGN's own i18n table uses `nav.categories.inventory`; the design's phrase "group key `inventory-bookings`" is loose wording for the same category. Unit 12 appends its item to this same category — whichever lands second reuses it.
- No delete action for projects or plots anywhere (DESIGN Decision 5). No e2e (deferred per the e2e testing plan).
- Currency/area use `Intl` `en-IN` (`₹51,30,000`; tile shorthand `₹51.3 L`).
- Component selector/class prefix: `projects-plots` (BEM, `projects-plots__*`), as `epin-register` uses `epin-register__*`.
- Icons are Material Symbols: `<span class="material-symbols-outlined" aria-hidden="true">name</span>`.
- i18n convention: `en.json` gets all new keys; `hi.json` gets the two `nav.*`/`settings.sections.*` keys translated and the screen-body blocks (`admin.projectsPlots`, `plotTile`) copied verbatim in English (matches the existing pattern: screen bodies are not translated to Hindi).

## Deviations from DESIGN.md (decided here; veto at plan review)

1. **Palette = live theme tokens, not the violet siblings.** DESIGN Decision 12 says violet/cyan, but every colour in the design is already a `var(--token)`, and the live `_tokens.scss` is the gold/oxblood/parchment theme the whole rest of the app uses. Porting violet would make this one screen look foreign to its neighbours (`epin-register`, `sales-register`). The plan therefore uses `var(--brand-primary)`, `var(--surface-*)`, `var(--status-*)` as they are. Only the darker status-text shades are new (Task 2), derived with `color-mix` exactly as DESIGN's "Token drift" section prescribes. If the user wants violet after all, it is a single scoped override block on `.projects-plots` — no component code changes.
2. **Associate lookup lists role `ASSOCIATE`, not "ACTIVE only".** `GET /api/associates` returns `AssociateSummaryResponse(id, userId, name, role, hasFreeSlot)` — there is no status field, so ACTIVE-vs-PENDING cannot be filtered client-side. The lookup filters `role === 'ASSOCIATE'`; the hint text drops the "only active" sentence. If a non-active associate is chosen the server rejects it and the 400/404 danger banner surfaces its message. Real fix = add `status` to the summary (belongs with unit 14's read-model follow-up).
3. **409 on booking returns the aside to the plot detail** (plot now shown `BOOKED`, Book disabled) with the warning banner and a refreshed grid; typed buyer entries are not preserved. DESIGN says the form is kept with entries; that needs a draft held outside the form for marginal value, so it is cut. Say so if you want it back.
4. **Project photo: upload only.** The Project form uploads a thumbnail (`ProjectsService.uploadThumbnail`) but the screen does not render project photos (the setup step already does). Add display when someone asks.
5. **"View booking" link** in the success banner targets `/settings/bookings-emi?booking=<id>` — unit 12 owns that route and it does not exist yet, so the link is dead until unit 12 lands. It is a plain `routerLink`; nothing to change later except unit 12 registering the path.

## Review Focus

Failure modes the design implies but no happy-path test covers; each is pinned by a test in the task named.

1. **Plot numbers with no `-`** (e.g. `101`, `102`): block grouping must fall back to one flat group, not crash or create a block named after the whole number. (Task 1.)
2. **Natural sort**: `A-2` before `A-10`, `2` before `10`. (Task 1.)
3. **Double submit of the booking form** must be impossible while the request is in flight, and Cancel mid-flight must still let the request complete and refresh the grid. (Task 7.)
4. **409 "plot just booked"** must refresh the grid and show the warning, not leave a stale AVAILABLE tile. (Task 7.)
5. **Booked/sold plot edit** must be read-only and the Book button disabled with visible reason text — never silently enabled from stale detail state. (Tasks 4, 5.)
6. **Empty states**: no projects, and a project with 0 plots (grid returns `[]`), must show the empty panels, not a blank page. (Task 4.)
7. **Grid refresh failure** must keep the last good grid on screen with a Retry banner. (Task 4.)

---

## File Structure

Create (all under `frontend/src/app/` unless noted):

| File | Responsibility |
|---|---|
| `shared/utils/plot-grid.util.ts` + `.spec.ts` | Pure helpers: `PlotGridItem`, `formatInr`, `formatLakh`, `formatArea`, `groupIntoBlocks`, `countByStatus`. Shared with unit 13. |
| `shared/components/plot-tile/plot-tile.component.ts` + `.spec.ts` | The survey-style tile. Shared with unit 13. |
| `admin/projects-plots/projects-plots.model.ts` | `BookingEmiConfig`, `BookingFormValue`, `CreateBookingRequest`, `CreatedBooking`. |
| `admin/projects-plots/projects-plots.service.ts` + `.spec.ts` | 4 endpoints: grid, single plot, create booking, EMI config. |
| `admin/projects-plots/book-plot-form.component.ts` + `.spec.ts` | Book form (associate, buyer, preview, validation). Presentational. |
| `admin/projects-plots/plot-form.component.ts` + `.spec.ts` | Add/edit plot form, locked variant. Presentational. |
| `admin/projects-plots/project-form.component.ts` + `.spec.ts` | Add/edit project form. Presentational. |
| `admin/projects-plots/csv-import-panel.component.ts` + `.spec.ts` | CSV validate/commit (self-contained, uses `ProjectsService`). |
| `admin/projects-plots/projects-plots.component.ts` + `.spec.ts` | Container: list, grid, legend, aside, all mutations. |

Modify:

| File | Change |
|---|---|
| `admin-nav-categories.model.ts` + `.spec.ts` | Add category `inventory` with item `projectsPlots`. |
| `app.routes.ts` + `app.routes.spec.ts` | Add `projects-plots` child under `settings`. |
| `../assets/i18n/en.json`, `hi.json` | New keys. |
| `../styles/_shared-components.scss` | `.plot-tile` styles + status-text tokens. |
| `../styles/_admin.scss` | `.projects-plots` styles (append at end). |
| `docs/superpowers/plans/2026-10-01-plot-booking-units.md` | Row 11 plan path (coordinator does this, not the implementer). |

Commands run from `frontend/`. Single spec: `npx ng test --watch=false --browsers=ChromeHeadless --include='src/app/<path>.spec.ts'`. Full suite: `npx ng test --watch=false --browsers=ChromeHeadless`. Build check: `npx ng build`.

---

### Task 1: Pure grid helpers

**Files:**
- Create: `src/app/shared/utils/plot-grid.util.ts`
- Test: `src/app/shared/utils/plot-grid.util.spec.ts`

**Interfaces:**
- Produces: `PlotGridItem`, `PlotBlock`, `StatusCounts`, `formatInr(n)`, `formatLakh(n)`, `formatArea(n)`, `groupIntoBlocks(plots)`, `countByStatus(plots)` — used by Tasks 2, 4, 5, 7 and unit 13.

- [ ] **Step 1: Write the failing test**

```ts
// src/app/shared/utils/plot-grid.util.spec.ts
import { countByStatus, formatArea, formatInr, formatLakh, groupIntoBlocks, PlotGridItem } from './plot-grid.util';

const plot = (plotNo: string, status: PlotGridItem['status'] = 'AVAILABLE'): PlotGridItem =>
  ({ plotId: 'id-' + plotNo, plotNo, type: 'NORMAL', area: 1200, price: 4500000, status });

describe('plot-grid.util', () => {
  it('formats rupees with Indian grouping', () => {
    expect(formatInr(5130000).replace(/\s/g, '')).toBe('₹51,30,000');
  });

  it('formats lakh shorthand, falling back to full rupees under one lakh', () => {
    expect(formatLakh(5130000)).toBe('₹51.3 L');
    expect(formatLakh(4500000)).toBe('₹45.0 L');
    expect(formatLakh(75000).replace(/\s/g, '')).toBe('₹75,000');
  });

  it('formats area with Indian grouping', () => {
    expect(formatArea(1800)).toBe('1,800');
    expect(formatArea(123456)).toBe('1,23,456');
  });

  it('groups by the plotNo prefix before the first dash', () => {
    const blocks = groupIntoBlocks([plot('B-1'), plot('A-2'), plot('A-1')]);
    expect(blocks.map(b => b.block)).toEqual(['A', 'B']);
    expect(blocks[0].plots.map(p => p.plotNo)).toEqual(['A-1', 'A-2']);
  });

  it('sorts naturally within a block (A-2 before A-10)', () => {
    const blocks = groupIntoBlocks([plot('A-10'), plot('A-2'), plot('A-1')]);
    expect(blocks[0].plots.map(p => p.plotNo)).toEqual(['A-1', 'A-2', 'A-10']);
  });

  it('falls back to one flat group when any plotNo has no dash', () => {
    const blocks = groupIntoBlocks([plot('10'), plot('A-1'), plot('2')]);
    expect(blocks.length).toBe(1);
    expect(blocks[0].block).toBe('');
    expect(blocks[0].plots.map(p => p.plotNo)).toEqual(['2', '10', 'A-1']);
  });

  it('returns no blocks for an empty grid', () => {
    expect(groupIntoBlocks([])).toEqual([]);
  });

  it('counts plots per status including zeros', () => {
    expect(countByStatus([plot('1'), plot('2', 'BOOKED'), plot('3', 'BOOKED')]))
      .toEqual({ AVAILABLE: 1, BOOKED: 2, SOLD: 0 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx ng test --watch=false --browsers=ChromeHeadless --include='src/app/shared/utils/plot-grid.util.spec.ts'`
Expected: FAIL — cannot find module `./plot-grid.util`.

- [ ] **Step 3: Write the implementation**

```ts
// src/app/shared/utils/plot-grid.util.ts
import { PlotStatus, PlotType } from '../../setup/models/project.model';

// Row of GET /api/projects/{id}/plots/grid (plot-booking unit 10). Deliberately has no rate,
// buyer or booking data; the admin screen fetches rate separately.
export interface PlotGridItem {
  plotId: string;
  plotNo: string;
  type: PlotType;
  area: number;
  price: number;
  status: PlotStatus;
}

export interface PlotBlock {
  block: string;
  plots: PlotGridItem[];
}

export type StatusCounts = Record<PlotStatus, number>;

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const grouped = new Intl.NumberFormat('en-IN');
const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

export const formatInr = (n: number): string => inr.format(n);
export const formatArea = (n: number): string => grouped.format(n);

// "₹51.3 L" tile shorthand; below one lakh the full figure reads better than "₹0.8 L".
export function formatLakh(n: number): string {
  return n < 100000 ? formatInr(n) : `₹${(n / 100000).toFixed(1)} L`;
}

// The API has no block field, so a block is the plotNo prefix before the first "-". One plotNo
// without a dash makes the whole grid a single unnamed group rather than a mixed bag.
export function groupIntoBlocks(plots: PlotGridItem[]): PlotBlock[] {
  if (!plots.length) {
    return [];
  }
  const dashed = plots.every(p => p.plotNo.includes('-'));
  const byBlock = new Map<string, PlotGridItem[]>();
  for (const p of plots) {
    const key = dashed ? p.plotNo.slice(0, p.plotNo.indexOf('-')) : '';
    byBlock.set(key, [...(byBlock.get(key) ?? []), p]);
  }
  return [...byBlock.entries()]
    .sort(([a], [b]) => natural(a, b))
    .map(([block, items]) => ({ block, plots: items.sort((a, b) => natural(a.plotNo, b.plotNo)) }));
}

export function countByStatus(plots: PlotGridItem[]): StatusCounts {
  const counts: StatusCounts = { AVAILABLE: 0, BOOKED: 0, SOLD: 0 };
  for (const p of plots) {
    counts[p.status]++;
  }
  return counts;
}
```

- [ ] **Step 4: Run to verify it passes**

Run the same command. Expected: PASS (8 specs).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/shared/utils/plot-grid.util.ts frontend/src/app/shared/utils/plot-grid.util.spec.ts
git commit -m "feat(frontend): plot grid helpers (block grouping, natural sort, lakh format) (unit 11)"
```

---

### Task 2: Shared `plot-tile` component, tile styles, status-text tokens

**Files:**
- Create: `src/app/shared/components/plot-tile/plot-tile.component.ts`
- Test: `src/app/shared/components/plot-tile/plot-tile.component.spec.ts`
- Modify: `src/styles/_shared-components.scss` (append)
- Modify: `src/assets/i18n/en.json`, `hi.json` (add top-level `plotTile` block — see Step 3)

**Interfaces:**
- Consumes: `formatLakh`, `formatInr`, `formatArea` (Task 1).
- Produces: `<app-plot-tile [plotNo] [type] [area] [price] [status] [selectable]=true [selected]=false (tileSelect)>`; selector `app-plot-tile`; class `PlotTileComponent`. Unit 13 reuses it unchanged. Host element is a `<button>` inside, so callers attach `data-plot-id` to the `<app-plot-tile>` host.

- [ ] **Step 1: Write the failing test**

```ts
// src/app/shared/components/plot-tile/plot-tile.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { PlotTileComponent } from './plot-tile.component';

describe('PlotTileComponent', () => {
  let fixture: ComponentFixture<PlotTileComponent>;
  const el = () => fixture.nativeElement as HTMLElement;
  const button = () => el().querySelector('button') as HTMLButtonElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [PlotTileComponent, TranslateModule.forRoot()] });
    fixture = TestBed.createComponent(PlotTileComponent);
    fixture.componentRef.setInput('plotNo', 'A-12');
    fixture.componentRef.setInput('type', 'CORNER');
    fixture.componentRef.setInput('area', 1800);
    fixture.componentRef.setInput('price', 5130000);
    fixture.componentRef.setInput('status', 'AVAILABLE');
    fixture.detectChanges();
  });

  it('shows plot number, grouped area, lakh price and a corner marker', () => {
    const text = el().textContent!;
    expect(text).toContain('A-12');
    expect(text).toContain('1,800');
    expect(text).toContain('₹51.3 L');
    expect(button().classList).toContain('plot-tile--corner');
  });

  it('carries the status as a class and a visible status key (never colour alone)', () => {
    expect(button().classList).toContain('plot-tile--available');
    expect(el().querySelector('.plot-tile__status')!.textContent).toContain('plotTile.status.AVAILABLE');
    expect(el().querySelector('.plot-tile__icon')).not.toBeNull();
  });

  it('exposes a full aria-label with the full rupee price', () => {
    expect(button().getAttribute('aria-label')).toContain('plotTile.aria');
  });

  it('emits tileSelect on click and reflects aria-pressed', () => {
    const emitted: string[] = [];
    fixture.componentInstance.tileSelect.subscribe(() => emitted.push('x'));
    button().click();
    expect(emitted.length).toBe(1);
    fixture.componentRef.setInput('selected', true);
    fixture.detectChanges();
    expect(button().getAttribute('aria-pressed')).toBe('true');
  });

  it('is inert and not pressable when selectable is false', () => {
    fixture.componentRef.setInput('selectable', false);
    fixture.detectChanges();
    expect(button().disabled).toBeTrue();
    expect(button().getAttribute('aria-pressed')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx ng test --watch=false --browsers=ChromeHeadless --include='src/app/shared/components/plot-tile/plot-tile.component.spec.ts'`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the component, i18n and styles**

```ts
// src/app/shared/components/plot-tile/plot-tile.component.ts
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { PlotStatus, PlotType } from '../../../setup/models/project.model';
import { formatArea, formatInr, formatLakh } from '../../utils/plot-grid.util';

const ICONS: Record<PlotStatus, string> = { AVAILABLE: 'check_circle', BOOKED: 'schedule', SOLD: 'lock' };

// Shared by the admin Projects & Plots grid (unit 11) and the associate availability grid
// (unit 13). Book/Edit controls deliberately live outside it. Status is conveyed by icon shape,
// visible word and border/hatch style as well as colour (DESIGN.md Accessibility).
@Component({
  selector: 'app-plot-tile',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <button type="button" class="plot-tile"
      [class.plot-tile--corner]="type === 'CORNER'"
      [class.plot-tile--available]="status === 'AVAILABLE'"
      [class.plot-tile--booked]="status === 'BOOKED'"
      [class.plot-tile--sold]="status === 'SOLD'"
      [class.plot-tile--selected]="selected"
      [disabled]="!selectable"
      [attr.aria-pressed]="selectable ? selected : null"
      [attr.aria-label]="'plotTile.aria' | translate: {
        no: plotNo, type: ('plotTile.type.' + type | translate), area: areaText, price: fullPrice,
        status: ('plotTile.status.' + status | translate) }"
      (click)="tileSelect.emit()">
      <span class="plot-tile__no">{{ plotNo }}</span>
      <span class="plot-tile__meta">{{ areaText }}<ng-container *ngIf="type === 'CORNER'"> · {{ 'plotTile.corner' | translate }}</ng-container></span>
      <span class="plot-tile__price">{{ shortPrice }}</span>
      <span class="plot-tile__status">
        <span class="material-symbols-outlined plot-tile__icon" aria-hidden="true">{{ icon }}</span>
        {{ 'plotTile.status.' + status | translate }}
      </span>
    </button>
  `
})
export class PlotTileComponent {
  @Input({ required: true }) plotNo!: string;
  @Input({ required: true }) type!: PlotType;
  @Input({ required: true }) area!: number;
  @Input({ required: true }) price!: number;
  @Input({ required: true }) status!: PlotStatus;
  @Input() selectable = true;
  @Input() selected = false;
  @Output() tileSelect = new EventEmitter<void>();

  get areaText(): string { return formatArea(this.area); }
  get shortPrice(): string { return formatLakh(this.price); }
  get fullPrice(): string { return formatInr(this.price); }
  get icon(): string { return ICONS[this.status]; }
}
```

i18n — add this top-level block to `en.json` (insert before the final closing brace of the root object, after the last existing top-level block, with a comma), and copy it verbatim into `hi.json`:

```json
  "plotTile": {
    "aria": "Plot {{no}}, {{type}}, {{area}} square feet, {{price}}, {{status}}",
    "corner": "Corner",
    "status": { "AVAILABLE": "Available", "BOOKED": "Booked", "SOLD": "Sold" },
    "type": { "NORMAL": "Normal", "CORNER": "Corner" }
  }
```

Verify both files still parse: `node -e "JSON.parse(require('fs').readFileSync('src/assets/i18n/en.json','utf8'));JSON.parse(require('fs').readFileSync('src/assets/i18n/hi.json','utf8'));console.log('ok')"` → `ok`.

Styles — append to `src/styles/_shared-components.scss`:

```scss
// ---- Plot tile (shared: admin Projects & Plots, associate availability grid) ----------------
// Darker text-only status shades: the raw status colours fail 4.5:1 on their own tints.
// Derived per DESIGN.md "Token drift" so a re-themed --status-* stays legible.
:root {
  --status-success-text: color-mix(in srgb, var(--status-success) 55%, black);
  --status-warning-text: color-mix(in srgb, var(--status-warning) 55%, black);
}

.plot-tile {
  position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 0.125rem;
  width: 100%; min-width: 88px; min-height: 88px; padding: 0.5rem 0.625rem; text-align: left;
  background: var(--surface-card); color: var(--text-primary);
  border: 2px solid var(--border-subtle); border-radius: 10px; cursor: pointer;
  font-family: var(--font-sans);

  &__no { font: 700 0.9375rem var(--font-mono); font-variant-numeric: tabular-nums; }
  &__meta { font: 500 0.75rem var(--font-mono); font-variant-numeric: tabular-nums; color: var(--text-muted); }
  &__price { font: 600 0.8125rem var(--font-mono); font-variant-numeric: tabular-nums; }
  &__status { display: inline-flex; align-items: center; gap: 0.25rem; margin-top: auto; font-size: 0.75rem; font-weight: 600; }
  &__icon { font-size: 1rem; }

  // Survey-plan signature: corner plots get a notched top-right corner.
  &--corner { clip-path: polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 0 100%); }

  &--available { background: color-mix(in srgb, var(--status-success) 12%, var(--surface-card)); border-color: var(--status-success);
    .plot-tile__status { color: var(--status-success-text); } }
  &--booked { background: color-mix(in srgb, var(--status-warning) 12%, var(--surface-card)); border-color: var(--status-warning);
    .plot-tile__status { color: var(--status-warning-text); } }
  &--sold { border-style: dashed; border-color: var(--text-muted);
    background: repeating-linear-gradient(45deg, var(--surface-raised) 0 6px, var(--surface-card) 6px 12px);
    .plot-tile__status { color: var(--text-muted); } }

  &--selected { border-width: 3px; border-color: var(--brand-primary); }
  &:focus-visible { outline: 2px solid var(--brand-primary); outline-offset: 2px; }
  &:disabled { cursor: default; }
}
```

- [ ] **Step 4: Run to verify it passes**

Run the spec command from Step 2. Expected: PASS (5 specs).

- [ ] **Step 5: Contrast check (owed by DESIGN: "unit 11 status-text contrast has not been re-checked")**

Compute WCAG ratio of each status text colour on its tint over the card, using the live token values. Save as `$SCRATCH/contrast.js` (scratchpad dir) and run with `node`:

```js
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const mix = (c, base, pct) => c.map((v, i) => v * pct + base[i] * (1 - pct));
const card = hex('#FCFAF5'), black = [0, 0, 0];
for (const [name, c] of [['success', hex('#4B7A52')], ['warning', hex('#B4790E')]]) {
  const text = mix(c, black, 0.55), tint = mix(c, card, 0.12);
  console.log(name, ratio(text, tint).toFixed(2));
}
console.log('muted on raised', ratio(hex('#6B6153'), hex('#F0E9D6')).toFixed(2));
```

Expected: all three ≥ 4.5. If `muted on raised` is below 4.5, change `.plot-tile--sold .plot-tile__status` and `__meta` to `var(--text-primary)`; if a status text is below 4.5, raise the mix to 65% and re-run. Record the printed ratios in the commit message body.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/shared/components/plot-tile frontend/src/styles/_shared-components.scss frontend/src/assets/i18n/en.json frontend/src/assets/i18n/hi.json
git commit -m "feat(frontend): shared plot-tile component with accessible status styling (unit 11)"
```

---

### Task 3: Models and `ProjectsPlotsService`

**Files:**
- Create: `src/app/admin/projects-plots/projects-plots.model.ts`
- Create: `src/app/admin/projects-plots/projects-plots.service.ts`
- Test: `src/app/admin/projects-plots/projects-plots.service.spec.ts`

**Interfaces:**
- Consumes: `PlotGridItem` (Task 1), `Plot` (existing).
- Produces:
  - `BookingEmiConfig { emiEnabled: boolean; defaultInstallmentCount: number }`
  - `BookingFormValue { associateId: string; buyerName: string; buyerPhone: string }`
  - `CreateBookingRequest { plotId: string; associateId: string; buyerName: string; buyerPhone?: string }`
  - `CreatedBooking { id: string; plotId: string; buyerName: string; totalAmount: number; installmentCount: number }`
  - `ProjectsPlotsService.getGrid(projectId): Observable<PlotGridItem[]>`, `.getPlot(projectId, plotId): Observable<Plot>`, `.createBooking(req): Observable<CreatedBooking>`, `.getEmiConfig(): Observable<BookingEmiConfig>`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/admin/projects-plots/projects-plots.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ProjectsPlotsService } from './projects-plots.service';

describe('ProjectsPlotsService', () => {
  let service: ProjectsPlotsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(ProjectsPlotsService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('reads the plot grid from the any-authenticated /api/projects path', () => {
    service.getGrid('p1').subscribe(g => expect(g.length).toBe(1));
    const req = http.expectOne('/api/projects/p1/plots/grid');
    expect(req.request.method).toBe('GET');
    req.flush([{ plotId: 'x', plotNo: 'A-1', type: 'NORMAL', area: 1, price: 2, status: 'AVAILABLE' }]);
  });

  it('reads a single plot (for its rate) from the company path', () => {
    service.getPlot('p1', 'x').subscribe();
    http.expectOne('/api/company/projects/p1/plots/x').flush({});
  });

  it('creates a booking at POST /api/admin/bookings with the request body', () => {
    const body = { plotId: 'x', associateId: 'a', buyerName: 'Rohit', buyerPhone: '99' };
    service.createBooking(body).subscribe();
    const req = http.expectOne('/api/admin/bookings');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush({});
  });

  it('reads the EMI config', () => {
    service.getEmiConfig().subscribe();
    http.expectOne('/api/company/booking-emi').flush({ emiEnabled: true, defaultInstallmentCount: 6 });
  });
});
```

- [ ] **Step 2: Run to verify it fails** — same `--include` pattern for this spec. Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// src/app/admin/projects-plots/projects-plots.model.ts
export interface BookingEmiConfig {
  emiEnabled: boolean;
  defaultInstallmentCount: number;
}

// What the Book form emits; the container adds plotId.
export interface BookingFormValue {
  associateId: string;
  buyerName: string;
  buyerPhone: string;
}

export interface CreateBookingRequest {
  plotId: string;
  associateId: string;
  buyerName: string;
  buyerPhone?: string;
}

// The subset of BookingResponse (POST /api/admin/bookings, 201) this screen reads.
export interface CreatedBooking {
  id: string;
  plotId: string;
  buyerName: string;
  totalAmount: number;
  installmentCount: number;
}
```

```ts
// src/app/admin/projects-plots/projects-plots.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Plot } from '../../setup/models/project.model';
import { PlotGridItem } from '../../shared/utils/plot-grid.util';
import { BookingEmiConfig, CreateBookingRequest, CreatedBooking } from './projects-plots.model';

// Only the endpoints ProjectsService (setup/steps/projects) lacks. Project/plot CRUD and CSV
// import reuse that service as-is.
@Injectable({ providedIn: 'root' })
export class ProjectsPlotsService {
  private http = inject(HttpClient);

  // Note the path: /api/projects/..., not /api/company/projects/... -- the grid is readable by any
  // authenticated user (unit 10, Decision 10).
  getGrid(projectId: string): Observable<PlotGridItem[]> {
    return this.http.get<PlotGridItem[]>(`/api/projects/${projectId}/plots/grid`);
  }

  getPlot(projectId: string, plotId: string): Observable<Plot> {
    return this.http.get<Plot>(`/api/company/projects/${projectId}/plots/${plotId}`);
  }

  createBooking(request: CreateBookingRequest): Observable<CreatedBooking> {
    return this.http.post<CreatedBooking>('/api/admin/bookings', request);
  }

  getEmiConfig(): Observable<BookingEmiConfig> {
    return this.http.get<BookingEmiConfig>('/api/company/booking-emi');
  }
}
```

- [ ] **Step 4: Run to verify it passes.** Expected: PASS (4 specs).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/admin/projects-plots
git commit -m "feat(frontend): projects-plots models and service (unit 11)"
```

---

### Task 4: Nav category, route, i18n copy, and the container shell (list, grid, legend, states)

This task makes the screen reachable and renders it read-only: project list, grid, legend filter, loading/empty/error states, plot selection with a detail aside. Mutations come in Tasks 5–7. A skeleton `book`/`edit` aside is NOT stubbed here — the detail aside simply omits those buttons until their tasks add them.

**Files:**
- Create: `src/app/admin/projects-plots/projects-plots.component.ts`
- Test: `src/app/admin/projects-plots/projects-plots.component.spec.ts`
- Modify: `src/app/admin-nav-categories.model.ts`, `src/app/admin-nav-categories.model.spec.ts`, `src/app/app.routes.ts`, `src/app/app.routes.spec.ts`
- Modify: `src/assets/i18n/en.json`, `hi.json`
- Modify: `src/styles/_admin.scss` (append layout styles — Task 8 finishes responsive/drawer rules)

**Interfaces:**
- Consumes: `ProjectsService.listProjects()`, `ProjectsPlotsService.getGrid/getPlot/getEmiConfig`, `AdminService.listAssociates()`, helpers (Task 1), `PlotTileComponent` (Task 2).
- Produces: `ProjectsPlotsComponent` (selector `app-projects-plots`) with public members used by Tasks 5–7: `projects: Project[] | null`, `selectedProject: Project | null`, `grid: PlotGridItem[] | null`, `selectedPlot: PlotGridItem | null` (getter), `plotDetail: Plot | null`, `aside: Aside`, `banner: Banner | null`, `associates: AssociateSummary[]`, `emiConfig: BookingEmiConfig | null`, `loadGrid()`, `reloadProjects(selectId?)`, `selectPlot(p)`, `closeAside()`.

Types declared in the component file:

```ts
type Aside =
  | { kind: 'none' }
  | { kind: 'detail' }
  | { kind: 'book' }
  | { kind: 'editPlot' }
  | { kind: 'addPlot' }
  | { kind: 'project'; mode: 'add' | 'edit' }
  | { kind: 'csv' };

interface Banner { tone: 'success' | 'warning' | 'danger'; key?: string; params?: Record<string, unknown>; text?: string; bookingId?: string; }
```

- [ ] **Step 1: Nav + routes tests first (failing)**

In `admin-nav-categories.model.spec.ts`, update the first two tests and keep the rest:

```ts
  it('listsTheMockupCategoriesInOrderWithTheirIcons', () => {
    expect(ADMIN_NAV_CATEGORIES.map(category => [category.key, category.icon])).toEqual([
      ['setup', 'tune'],
      ['network', 'group'],
      ['finance', 'point_of_sale'],
      ['inventory', 'domain'],
      ['system', 'admin_panel_settings']
    ]);
  });

  it('groupsEverySettingsScreenUnderItsCategory', () => {
    expect(ADMIN_NAV_CATEGORIES.map(category => category.items.map(item => item.key))).toEqual([
      ['companyProfile', 'branding', 'compensation', 'projects', 'paymentsKyc'],
      ['associateDirectory', 'treeExplorer', 'kycQueue'],
      ['salesRegister', 'cycleManagement', 'ledgerRegister', 'epinRegister', 'payoutApproval'],
      ['projectsPlots'],
      ['auditLog', 'adminStats']
    ]);
  });
```

Add to the `findNavCategoryForUrl` describe:

```ts
  it('resolvesTheProjectsPlotsScreenToTheInventoryCategory', () => {
    expect(findNavCategoryForUrl('/settings/projects-plots')?.key).toBe('inventory');
  });
```

In `app.routes.spec.ts`, add inside the `settings route` describe:

```ts
    it('has a projects-plots child stamped with sectionKey projectsPlots', () => {
      const settingsRoute = routes.find(r => r.path === 'settings');
      const child = settingsRoute!.children!.find(c => c.path === 'projects-plots');
      expect(child).toBeTruthy();
      expect(child!.data).toEqual({ sectionKey: 'projectsPlots' });
    });
```

(The existing "has a child route behind every nav item in every category" test will also cover it.)

- [ ] **Step 2: Write the container's failing spec**

```ts
// src/app/admin/projects-plots/projects-plots.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ProjectsPlotsComponent } from './projects-plots.component';

describe('ProjectsPlotsComponent', () => {
  let fixture: ComponentFixture<ProjectsPlotsComponent>;
  let http: HttpTestingController;

  const project = (over: Record<string, unknown> = {}) => ({
    id: 'p1', name: 'Green Valley', location: 'Hyderabad', hasThumbnail: false,
    totalPlots: 3, availablePlots: 1, soldPlots: 1, createdAt: '2026-01-01T00:00:00Z', ...over
  });
  const cell = (plotNo: string, status = 'AVAILABLE', over: Record<string, unknown> = {}) =>
    ({ plotId: 'id-' + plotNo, plotNo, type: 'NORMAL', area: 1200, price: 4500000, status, ...over });
  const associates = [
    { id: 'a1', userId: 'VP00001', name: 'Jane', role: 'ASSOCIATE', hasFreeSlot: true },
    { id: 'adm', userId: 'ADMIN', name: 'Boss', role: 'ADMIN', hasFreeSlot: false }
  ];
  const el = () => fixture.nativeElement as HTMLElement;

  // Initial burst: associates, EMI config, projects; then the first project's grid.
  function boot(projects: unknown[] = [project()], grid: unknown[] = [cell('A-2'), cell('A-1', 'BOOKED'), cell('B-1', 'SOLD')]) {
    http.expectOne('/api/associates').flush(associates);
    http.expectOne('/api/company/booking-emi').flush({ emiEnabled: true, defaultInstallmentCount: 4 });
    http.expectOne('/api/company/projects').flush(projects);
    if (projects.length) {
      http.expectOne('/api/projects/p1/plots/grid').flush(grid);
    }
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProjectsPlotsComponent, HttpClientTestingModule, TranslateModule.forRoot()],
      providers: [provideRouter([])]
    }).compileComponents();
    fixture = TestBed.createComponent(ProjectsPlotsComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });
  afterEach(() => http.verify());

  it('lists projects and loads the first project grid, grouped into blocks in natural order', () => {
    boot();
    expect(el().textContent).toContain('Green Valley');
    const blocks = el().querySelectorAll('.projects-plots__block');
    expect(blocks.length).toBe(2);
    expect(blocks[0].querySelectorAll('app-plot-tile')[0].textContent).toContain('A-1');
  });

  it('shows the no-projects empty state and hides the list', () => {
    boot([]);
    expect(el().textContent).toContain('admin.projectsPlots.empty.noProjectsTitle');
    expect(el().querySelector('.projects-plots__list')).toBeNull();
  });

  it('shows the empty-project state for a project with zero plots', () => {
    boot([project({ totalPlots: 0, availablePlots: 0, soldPlots: 0 })], []);
    expect(el().textContent).toContain('admin.projectsPlots.empty.noPlotsTitle');
  });

  it('legend counts match the tiles and a chip filters the grid by status', () => {
    boot();
    const chips = el().querySelectorAll<HTMLButtonElement>('.projects-plots__chip');
    expect(chips[0].textContent).toContain('1');
    chips[1].click(); // BOOKED
    fixture.detectChanges();
    expect(chips[1].getAttribute('aria-pressed')).toBe('true');
    const tiles = el().querySelectorAll('app-plot-tile');
    expect(tiles.length).toBe(1);
    expect(tiles[0].textContent).toContain('A-1');
  });

  it('shows the filter-empty message when the chosen status has no plots', () => {
    boot([project()], [cell('A-1')]);
    el().querySelectorAll<HTMLButtonElement>('.projects-plots__chip')[2].click(); // SOLD
    fixture.detectChanges();
    expect(el().textContent).toContain('admin.projectsPlots.empty.filter');
  });

  it('selecting a plot fetches its rate and shows the detail aside', () => {
    boot();
    el().querySelector<HTMLButtonElement>('app-plot-tile button')!.click();
    const req = http.expectOne('/api/company/projects/p1/plots/id-A-1');
    req.flush({ id: 'id-A-1', plotNo: 'A-1', plotType: 'NORMAL', areaSqft: 1200, rate: 3750, price: 4500000, status: 'BOOKED' });
    fixture.detectChanges();
    const aside = el().querySelector('.projects-plots__aside')!;
    expect(aside.textContent).toContain('A-1');
    expect(aside.textContent).toContain('3,750');
  });

  it('keeps the last good grid and shows a Retry banner when a refresh fails', () => {
    boot();
    fixture.componentInstance.loadGrid();
    http.expectOne('/api/projects/p1/plots/grid').flush('boom', { status: 500, statusText: 'err' });
    fixture.detectChanges();
    expect(el().querySelectorAll('app-plot-tile').length).toBe(3);
    expect(el().textContent).toContain('admin.projectsPlots.error.loadGrid');
    expect(el().querySelector('.projects-plots__retry')).not.toBeNull();
  });

  it('switching project resets the selected plot and aside', () => {
    boot([project(), project({ id: 'p2', name: 'Lake View' })]);
    el().querySelector<HTMLButtonElement>('app-plot-tile button')!.click();
    http.expectOne('/api/company/projects/p1/plots/id-A-1').flush({ rate: 1 });
    fixture.componentInstance.selectProject(fixture.componentInstance.projects![1]);
    http.expectOne('/api/projects/p2/plots/grid').flush([]);
    fixture.detectChanges();
    expect(fixture.componentInstance.aside.kind).toBe('none');
    expect(fixture.componentInstance.selectedPlot).toBeNull();
  });
});
```

- [ ] **Step 3: Run both new/changed specs to verify they fail**

Run: `npx ng test --watch=false --browsers=ChromeHeadless --include='src/app/admin-nav-categories.model.spec.ts' --include='src/app/app.routes.spec.ts' --include='src/app/admin/projects-plots/projects-plots.component.spec.ts'`
Expected: nav/routes/container specs FAIL.

- [ ] **Step 4: Implement nav, route, i18n**

`admin-nav-categories.model.ts` — insert between the `finance` and `system` entries:

```ts
  {
    key: 'inventory',
    labelKey: 'nav.categories.inventory',
    icon: 'domain',
    items: [
      { key: 'projectsPlots', labelKey: 'settings.sections.projectsPlots', path: '/settings/projects-plots' }
    ]
  },
```

`app.routes.ts` — add the import and the child (after `payout-approval`):

```ts
import { ProjectsPlotsComponent } from './admin/projects-plots/projects-plots.component';
...
      { path: 'projects-plots', component: ProjectsPlotsComponent, data: { sectionKey: 'projectsPlots' } },
```

`en.json`:
- `nav.categories` (line ~519): add `"inventory": "Inventory & Bookings"`.
- `settings.sections` (line ~1252): add `"projectsPlots": "Projects & Plots"`.
- `admin` namespace, as a sibling of `epinRegister`: add the block below.

`hi.json`: `nav.categories.inventory` = `"इन्वेंटरी और बुकिंग"`, `settings.sections.projectsPlots` = `"प्रोजेक्ट्स और प्लॉट्स"`; copy the `admin.projectsPlots` block verbatim in English.

```json
    "projectsPlots": {
      "eyebrow": "Inventory · Plots",
      "title": "Projects & Plots",
      "subtitle": "See what is open, booked and sold in every project, and book a plot for an associate's buyer.",
      "projectsHeading": "Projects",
      "projectSelectLabel": "Project",
      "addProjectAction": "Add project",
      "editProjectAction": "Edit project",
      "plotsSummary": "{{total}} plots · {{available}} available",
      "loading": "Loading plots",
      "legendLabel": "Filter plots by status",
      "cornerNote": "Notched tiles are corner plots. Select a plot for details.",
      "status": { "AVAILABLE": "Available", "BOOKED": "Booked", "SOLD": "Sold" },
      "blockHeading": "Block {{block}}",
      "blockSummary": "{{available}} available of {{total}}",
      "addPlotAction": "Add plot",
      "editPlotAction": "Edit plot",
      "savePlotAction": "Save plot",
      "editLockedTitle": "This plot can't be edited.",
      "editLockedBody": "Booked and sold plots are locked so the booking's price and plot details stay accurate.",
      "backToPlot": "Back to plot",
      "plotNoLabel": "Plot number",
      "plotTypeLabel": "Type",
      "areaLabel": "Area (sq ft)",
      "rateLabel": "Rate (₹ / sq ft)",
      "priceLabel": "Price (₹)",
      "statusLabel": "Status",
      "plotNoHint": "Must be unique within the project.",
      "priceHint": "Entered separately from area × rate, as in the existing project setup.",
      "statusReadonlyHint": "Status changes through booking, not here.",
      "type": { "NORMAL": "Normal", "CORNER": "Corner" },
      "importCsvAction": "Import CSV",
      "downloadTemplateAction": "Download CSV template",
      "chooseFileLabel": "CSV file",
      "validateAction": "Validate",
      "commitAction": "Commit import",
      "csvSummary": "{{valid}} of {{total}} rows are valid",
      "csvRowError": "Row {{row}}: {{field}} - {{message}}",
      "csvGenericError": "Something went wrong processing this file. Please try again.",
      "nameLabel": "Project name",
      "locationLabel": "Location",
      "photoLabel": "Project photo",
      "saveProjectAction": "Save project",
      "bookAction": "Book this plot",
      "bookDisabledBooked": "Already booked. Open it in Bookings & EMI to pay, confirm or cancel.",
      "bookDisabledSold": "Already sold.",
      "bookTitle": "Book plot {{no}}",
      "associateLabel": "Associate",
      "associateHint": "The associate who gets credit for this booking.",
      "associateRequired": "Choose an associate.",
      "lookupPlaceholder": "Search by ID or name",
      "buyerNameLabel": "Buyer name",
      "buyerNamePlaceholder": "Full name of the buyer",
      "buyerNameRequired": "Enter the buyer's name.",
      "buyerPhoneLabel": "Buyer phone",
      "optional": "(optional)",
      "totalLabel": "Total",
      "totalHint": "Fixed to the plot price at the time of booking.",
      "schedulePreviewLabel": "Preview",
      "schedulePreview": "{{count}} installments of {{amount}} each",
      "scheduleSingle": "Paid in a single installment",
      "confirmBookingAction": "Confirm booking",
      "bookingInProgress": "Booking…",
      "cancelAction": "Cancel",
      "factsType": "Type",
      "factsArea": "Area",
      "factsRate": "Rate",
      "factsPrice": "Price",
      "error": {
        "conflict": "Plot {{no}} was just booked by someone else. The grid has been refreshed. Pick another available plot.",
        "generic": "Something went wrong. Try again.",
        "forbidden": "You do not have access to this action.",
        "loadGrid": "Could not load plots.",
        "loadProjects": "Could not load projects.",
        "duplicatePlotNo": "A plot with this number already exists in the project.",
        "notFound": "This project or plot no longer exists."
      },
      "retry": "Retry",
      "banner": { "booked": "Plot {{no}} booked for {{buyer}}.", "viewBooking": "View booking" },
      "empty": {
        "noProjectsTitle": "No projects yet",
        "noProjectsBody": "Create your first project, then add plots one by one or import them from a CSV.",
        "noPlotsTitle": "No plots in this project",
        "noPlotsBody": "Add a plot manually, or download the CSV template and import the whole layout at once.",
        "filter": "No plots with this status."
      }
    }
```

Re-run the JSON parse check from Task 2 Step 3.

- [ ] **Step 5: Implement the container**

```ts
// src/app/admin/projects-plots/projects-plots.component.ts
import { Component, HostListener, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { catchError, of } from 'rxjs';
import { AdminService } from '../admin.service';
import { AssociateSummary } from '../models/associate-summary.model';
import { ProjectsService } from '../../setup/steps/projects/projects.service';
import { Plot, PlotStatus, Project } from '../../setup/models/project.model';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { PlotTileComponent } from '../../shared/components/plot-tile/plot-tile.component';
import {
  PlotBlock, PlotGridItem, StatusCounts, countByStatus, formatArea, formatInr, groupIntoBlocks
} from '../../shared/utils/plot-grid.util';
import { ProjectsPlotsService } from './projects-plots.service';
import { BookingEmiConfig } from './projects-plots.model';

type Aside =
  | { kind: 'none' }
  | { kind: 'detail' }
  | { kind: 'book' }
  | { kind: 'editPlot' }
  | { kind: 'addPlot' }
  | { kind: 'project'; mode: 'add' | 'edit' }
  | { kind: 'csv' };

interface Banner {
  tone: 'success' | 'warning' | 'danger';
  key?: string;
  params?: Record<string, unknown>;
  text?: string;
  bookingId?: string;
}

const STATUSES: PlotStatus[] = ['AVAILABLE', 'BOOKED', 'SOLD'];

@Component({
  selector: 'app-projects-plots',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslateModule, InlineBannerComponent, PlotTileComponent],
  template: `
    <div class="projects-plots">
      <div class="projects-plots__head">
        <div class="projects-plots__intro">
          <span class="projects-plots__eyebrow">{{ 'admin.projectsPlots.eyebrow' | translate }}</span>
          <h1 class="projects-plots__title">{{ 'admin.projectsPlots.title' | translate }}</h1>
          <p class="projects-plots__subtitle">{{ 'admin.projectsPlots.subtitle' | translate }}</p>
        </div>
        <button type="button" class="brand-button" (click)="openAside({ kind: 'project', mode: 'add' })">
          {{ 'admin.projectsPlots.addProjectAction' | translate }}
        </button>
      </div>

      <app-inline-banner *ngIf="projectsError" tone="danger">{{ 'admin.projectsPlots.error.loadProjects' | translate }}</app-inline-banner>

      <div class="projects-plots__empty" *ngIf="projects && !projects.length">
        <h2>{{ 'admin.projectsPlots.empty.noProjectsTitle' | translate }}</h2>
        <p>{{ 'admin.projectsPlots.empty.noProjectsBody' | translate }}</p>
      </div>

      <div class="projects-plots__layout" *ngIf="projects?.length">
        <!-- (a) master list; a <select> stands in below 1024px -->
        <nav class="projects-plots__list" [attr.aria-label]="'admin.projectsPlots.projectsHeading' | translate">
          <h2 class="projects-plots__list-heading">{{ 'admin.projectsPlots.projectsHeading' | translate }}</h2>
          <button type="button" *ngFor="let p of projects" class="projects-plots__project"
            [class.projects-plots__project--selected]="p.id === selectedProject?.id"
            [attr.aria-current]="p.id === selectedProject?.id ? 'true' : null" (click)="selectProject(p)">
            <span class="projects-plots__project-name">{{ p.name }}</span>
            <span class="projects-plots__project-loc">{{ p.location }}</span>
            <span class="projects-plots__bar" aria-hidden="true">
              <span class="projects-plots__bar-seg projects-plots__bar-seg--available" [style.flex-grow]="p.availablePlots"></span>
              <span class="projects-plots__bar-seg projects-plots__bar-seg--booked" [style.flex-grow]="bookedCount(p)"></span>
              <span class="projects-plots__bar-seg projects-plots__bar-seg--sold" [style.flex-grow]="p.soldPlots"></span>
            </span>
            <span class="projects-plots__project-count">{{ 'admin.projectsPlots.plotsSummary' | translate: { total: p.totalPlots, available: p.availablePlots } }}</span>
          </button>
        </nav>
        <label class="projects-plots__project-select">
          {{ 'admin.projectsPlots.projectSelectLabel' | translate }}
          <select (change)="selectProjectById($any($event.target).value)">
            <option *ngFor="let p of projects" [value]="p.id" [selected]="p.id === selectedProject?.id">{{ p.name }}</option>
          </select>
        </label>

        <!-- (b) project header + legend + grid -->
        <section class="projects-plots__main" *ngIf="selectedProject as sp">
          <div class="projects-plots__project-head">
            <div>
              <h2 class="projects-plots__project-title">{{ sp.name }}</h2>
              <span class="projects-plots__project-loc">{{ sp.location }}</span>
            </div>
            <div class="projects-plots__project-actions">
              <button type="button" class="brand-button brand-button--secondary" (click)="openAside({ kind: 'project', mode: 'edit' })">{{ 'admin.projectsPlots.editProjectAction' | translate }}</button>
              <button type="button" class="brand-button brand-button--secondary" (click)="openAside({ kind: 'csv' })">{{ 'admin.projectsPlots.importCsvAction' | translate }}</button>
              <button type="button" class="brand-button" (click)="openAside({ kind: 'addPlot' })">{{ 'admin.projectsPlots.addPlotAction' | translate }}</button>
            </div>
          </div>

          <app-inline-banner *ngIf="gridError" tone="danger">
            {{ 'admin.projectsPlots.error.loadGrid' | translate }}
            <button type="button" class="projects-plots__retry" (click)="loadGrid()">{{ 'admin.projectsPlots.retry' | translate }}</button>
          </app-inline-banner>

          <div class="projects-plots__skeleton" role="status" *ngIf="!grid && !gridError">
            <span class="projects-plots__sr">{{ 'admin.projectsPlots.loading' | translate }}</span>
            <span class="projects-plots__skeleton-tile" *ngFor="let i of [1,2,3,4,5,6,7,8]"></span>
          </div>

          <ng-container *ngIf="grid">
            <div class="projects-plots__legend" role="group" [attr.aria-label]="'admin.projectsPlots.legendLabel' | translate">
              <button type="button" *ngFor="let s of statuses" class="projects-plots__chip"
                [class.projects-plots__chip--on]="filter.has(s)" [attr.aria-pressed]="filter.has(s)" (click)="toggleFilter(s)">
                {{ 'admin.projectsPlots.status.' + s | translate }} <span class="projects-plots__chip-count">{{ counts[s] }}</span>
              </button>
              <span class="projects-plots__note">{{ 'admin.projectsPlots.cornerNote' | translate }}</span>
            </div>

            <div class="projects-plots__empty" *ngIf="!grid.length">
              <h2>{{ 'admin.projectsPlots.empty.noPlotsTitle' | translate }}</h2>
              <p>{{ 'admin.projectsPlots.empty.noPlotsBody' | translate }}</p>
            </div>
            <p class="projects-plots__empty" *ngIf="grid.length && !visibleBlocks.length">{{ 'admin.projectsPlots.empty.filter' | translate }}</p>

            <section class="projects-plots__block" *ngFor="let b of visibleBlocks">
              <h3 class="projects-plots__block-heading" *ngIf="b.block">
                {{ 'admin.projectsPlots.blockHeading' | translate: { block: b.block } }}
                <span>{{ 'admin.projectsPlots.blockSummary' | translate: blockSummary(b) }}</span>
              </h3>
              <ul class="projects-plots__tiles">
                <li *ngFor="let p of b.plots">
                  <app-plot-tile [attr.data-plot-id]="p.plotId" [plotNo]="p.plotNo" [type]="p.type" [area]="p.area"
                    [price]="p.price" [status]="p.status" [selected]="p.plotId === selectedPlotId" (tileSelect)="selectPlot(p)"></app-plot-tile>
                </li>
              </ul>
            </section>
          </ng-container>
        </section>

        <!-- (c/d) aside: one region, swapped content. Task 5-7 add the form cases. -->
        <div class="projects-plots__scrim" *ngIf="aside.kind !== 'none'" (click)="closeAside()"></div>
        <aside class="projects-plots__aside" *ngIf="aside.kind !== 'none'" [attr.aria-label]="'admin.projectsPlots.title' | translate">
          <app-inline-banner *ngIf="banner as b" [tone]="b.tone" [dismissible]="true" (dismissed)="banner = null">
            <span [attr.role]="b.tone === 'success' ? 'status' : 'alert'">
              {{ b.key ? (b.key | translate: b.params) : b.text }}
              <a *ngIf="b.bookingId" [routerLink]="['/settings/bookings-emi']" [queryParams]="{ booking: b.bookingId }">{{ 'admin.projectsPlots.banner.viewBooking' | translate }}</a>
            </span>
          </app-inline-banner>
          <ng-container *ngIf="aside.kind === 'detail' && selectedPlot as sel">
            <h2 class="projects-plots__aside-title">{{ sel.plotNo }}</h2>
            <dl class="projects-plots__facts">
              <dt>{{ 'admin.projectsPlots.factsType' | translate }}</dt><dd>{{ 'plotTile.type.' + sel.type | translate }}</dd>
              <dt>{{ 'admin.projectsPlots.factsArea' | translate }}</dt><dd>{{ areaText(sel.area) }}</dd>
              <dt>{{ 'admin.projectsPlots.factsRate' | translate }}</dt><dd>{{ plotDetail ? plotDetail.rate.toLocaleString('en-IN') : '—' }}</dd>
              <dt>{{ 'admin.projectsPlots.factsPrice' | translate }}</dt><dd>{{ priceText(sel.price) }}</dd>
              <dt>{{ 'admin.projectsPlots.statusLabel' | translate }}</dt><dd>{{ 'plotTile.status.' + sel.status | translate }}</dd>
            </dl>
          </ng-container>
        </aside>
      </div>
    </div>
  `
})
export class ProjectsPlotsComponent implements OnInit {
  protected projectsService = inject(ProjectsService);
  protected plotsService = inject(ProjectsPlotsService);
  private adminService = inject(AdminService);

  readonly statuses = STATUSES;
  projects: Project[] | null = null;
  projectsError = false;
  selectedProject: Project | null = null;
  grid: PlotGridItem[] | null = null;
  gridError = false;
  filter = new Set<PlotStatus>();
  counts: StatusCounts = { AVAILABLE: 0, BOOKED: 0, SOLD: 0 };
  visibleBlocks: PlotBlock[] = [];
  selectedPlotId: string | null = null;
  plotDetail: Plot | null = null;
  aside: Aside = { kind: 'none' };
  banner: Banner | null = null;
  associates: AssociateSummary[] = [];
  emiConfig: BookingEmiConfig | null = null;

  get selectedPlot(): PlotGridItem | null {
    return this.grid?.find(p => p.plotId === this.selectedPlotId) ?? null;
  }

  ngOnInit(): void {
    // Only role ASSOCIATE can sell; the summary has no status field (see plan Deviation 2).
    this.adminService.listAssociates().pipe(catchError(() => of([] as AssociateSummary[])))
      .subscribe(list => (this.associates = list.filter(a => a.role === 'ASSOCIATE')));
    // EMI preview is a nicety: an unreadable config hides the preview, never blocks the form.
    this.plotsService.getEmiConfig().pipe(catchError(() => of(null))).subscribe(c => (this.emiConfig = c));
    this.reloadProjects();
  }

  reloadProjects(selectId?: string): void {
    this.projectsService.listProjects().subscribe({
      next: list => {
        this.projects = list;
        this.projectsError = false;
        const keep = selectId ?? this.selectedProject?.id;
        const next = list.find(p => p.id === keep) ?? list[0] ?? null;
        if (next && next.id !== this.selectedProject?.id) {
          this.selectProject(next);
        } else {
          this.selectedProject = next;
        }
      },
      error: () => (this.projectsError = true)
    });
  }

  selectProjectById(id: string): void {
    const p = this.projects?.find(x => x.id === id);
    if (p) { this.selectProject(p); }
  }

  selectProject(p: Project): void {
    this.selectedProject = p;
    this.selectedPlotId = null;
    this.plotDetail = null;
    this.aside = { kind: 'none' };
    this.banner = null;
    this.filter.clear();
    this.grid = null;
    this.loadGrid();
  }

  // Keeps the last good grid on a failed refresh (DESIGN: "Grid refresh failure").
  loadGrid(): void {
    const project = this.selectedProject;
    if (!project) { return; }
    this.plotsService.getGrid(project.id).subscribe({
      next: grid => {
        if (project.id !== this.selectedProject?.id) { return; }
        this.grid = grid;
        this.gridError = false;
        this.rebuild();
      },
      error: () => {
        if (project.id === this.selectedProject?.id) { this.gridError = true; }
      }
    });
  }

  toggleFilter(s: PlotStatus): void {
    this.filter.has(s) ? this.filter.delete(s) : this.filter.add(s);
    this.rebuild();
  }

  private rebuild(): void {
    const all = this.grid ?? [];
    this.counts = countByStatus(all);
    this.visibleBlocks = groupIntoBlocks(all)
      .map(b => ({ block: b.block, plots: this.filter.size ? b.plots.filter(p => this.filter.has(p.status)) : b.plots }))
      .filter(b => b.plots.length);
  }

  blockSummary(b: PlotBlock): { available: number; total: number } {
    const full = (this.grid ?? []).filter(p => groupIntoBlocks([p])[0].block === b.block || !b.block);
    return { available: full.filter(p => p.status === 'AVAILABLE').length, total: full.length };
  }

  bookedCount(p: Project): number {
    return Math.max(p.totalPlots - p.availablePlots - p.soldPlots, 0);
  }

  selectPlot(p: PlotGridItem): void {
    this.selectedPlotId = p.plotId;
    this.plotDetail = null;
    this.banner = null;
    this.aside = { kind: 'detail' };
    this.plotsService.getPlot(this.selectedProject!.id, p.plotId).subscribe({
      next: d => { if (this.selectedPlotId === p.plotId) { this.plotDetail = d; } },
      error: () => undefined // rate shows "—"; the grid facts are still enough to act on
    });
  }

  openAside(next: Aside): void {
    this.banner = null;
    this.aside = next;
  }

  closeAside(): void {
    const returnTo = this.selectedPlotId;
    this.aside = { kind: 'none' };
    if (returnTo) {
      setTimeout(() => document.querySelector<HTMLElement>(`[data-plot-id="${returnTo}"] button`)?.focus());
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.aside.kind !== 'none') { this.closeAside(); }
  }

  areaText = formatArea;
  priceText = formatInr;

  protected errorBanner(err: HttpErrorResponse): Banner {
    if (err.status === 403) { return { tone: 'danger', key: 'admin.projectsPlots.error.forbidden' }; }
    if (err.status === 404) { return { tone: 'danger', key: 'admin.projectsPlots.error.notFound' }; }
    const serverText = err.status === 400 && typeof err.error?.error === 'string' ? err.error.error : undefined;
    return serverText ? { tone: 'danger', text: serverText } : { tone: 'danger', key: 'admin.projectsPlots.error.generic' };
  }
}
```

Note on `blockSummary`: the dash-less fallback group has `block === ''` and no heading is rendered for it, so it is never called for that case; the `|| !b.block` clause just keeps it total. If a reviewer finds this clumsy, replace with a `Map<block, {available,total}>` built in `rebuild()` from the unfiltered `groupIntoBlocks(all)` — same behaviour, no per-render grouping.

Layout styles — append to `src/styles/_admin.scss`:

```scss
// ---- Projects & Plots (plot-booking unit 11) -------------------------------------------------
.projects-plots {
  display: flex; flex-direction: column; gap: 1.5rem;
  max-width: 1480px; margin: 0 auto; padding: 1.5rem 2rem;
  font-family: 'Inter', var(--font-sans);

  &__head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: 1.5rem; }
  &__intro { display: flex; flex-direction: column; gap: 0.375rem; }
  &__eyebrow { @extend %admin-screen-eyebrow; }
  &__title { @extend %admin-screen-title; }
  &__subtitle { @extend %admin-screen-subtitle; max-width: 46rem; }
  &__sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }

  &__layout { display: grid; grid-template-columns: 272px minmax(0, 1fr) 352px; gap: 1.5rem; align-items: start; }
  &__project-select { display: none; flex-direction: column; gap: 0.375rem; font: 500 0.6875rem var(--font-mono); text-transform: uppercase; color: var(--text-muted); }

  &__list { display: flex; flex-direction: column; gap: 0.5rem; }
  &__list-heading { margin: 0 0 0.25rem; font: 600 1.125rem var(--font-sans); }
  &__project {
    display: flex; flex-direction: column; gap: 0.25rem; padding: 0.875rem 1rem; text-align: left;
    background: var(--surface-card); border: 1px solid var(--border-subtle); border-radius: 16px; cursor: pointer;
    &--selected { background: var(--surface-raised); border-color: var(--brand-primary); box-shadow: inset 4px 0 0 var(--brand-primary); }
    &:focus-visible { outline: 2px solid var(--brand-primary); outline-offset: 2px; }
  }
  &__project-name { font-weight: 600; }
  &__project-loc, &__project-count { font-size: 0.8125rem; color: var(--text-muted); }
  &__project-count { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
  &__bar { display: flex; height: 6px; border-radius: 999px; overflow: hidden; background: var(--border-subtle); }
  &__bar-seg { flex-basis: 0; &--available { background: var(--status-success); } &--booked { background: var(--status-warning); } &--sold { background: var(--text-muted); } }

  &__main { display: flex; flex-direction: column; gap: 1rem; min-width: 0; }
  &__project-head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 1rem; }
  &__project-title { margin: 0; font: 600 1.25rem var(--font-sans); }
  &__project-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  &__retry { margin-left: 0.75rem; background: none; border: 0; text-decoration: underline; cursor: pointer; color: inherit; font-weight: 600; }

  &__legend { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
  &__chip {
    display: inline-flex; gap: 0.5rem; align-items: center; padding: 0.375rem 0.875rem; min-height: 36px;
    background: var(--surface-card); border: 1px solid var(--border-subtle); border-radius: 999px; cursor: pointer; font-weight: 600;
    &--on { background: var(--brand-primary-soft); border-color: var(--brand-primary); }
    &:focus-visible { outline: 2px solid var(--brand-primary); outline-offset: 2px; }
  }
  &__chip-count { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
  &__note { font-size: 0.8125rem; color: var(--text-muted); }

  &__block-heading { display: flex; gap: 0.75rem; align-items: baseline; margin: 0.5rem 0; font: 600 1rem var(--font-sans);
    span { font: 500 0.8125rem var(--font-mono); color: var(--text-muted); } }
  &__tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 0.625rem; list-style: none; margin: 0; padding: 0; }

  &__empty { padding: 2.5rem 1rem; text-align: center; background: var(--surface-card); border: 1px dashed var(--border-subtle); border-radius: 16px;
    h2 { margin: 0 0 0.5rem; font: 600 1.125rem var(--font-sans); } p { margin: 0; color: var(--text-muted); } }

  &__skeleton { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 0.625rem; }
  &__skeleton-tile { height: 88px; border-radius: 10px; background: linear-gradient(90deg, var(--surface-raised), var(--surface-card), var(--surface-raised)); background-size: 200% 100%; animation: projects-plots-shimmer 1.4s linear infinite; }

  &__aside { position: sticky; top: 1rem; display: flex; flex-direction: column; gap: 1rem; padding: 1.5rem; background: var(--surface-card); border-radius: 20px; box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.08); }
  &__aside-title { margin: 0; font: 700 1.125rem var(--font-mono); }
  &__facts { display: grid; grid-template-columns: auto 1fr; gap: 0.5rem 1rem; margin: 0;
    dt { font: 500 0.6875rem var(--font-mono); letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-muted); align-self: center; }
    dd { margin: 0; font: 600 0.9375rem var(--font-mono); font-variant-numeric: tabular-nums; } }
  &__scrim { display: none; }
}
@keyframes projects-plots-shimmer { to { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) { .projects-plots__skeleton-tile { animation: none; } }
```

(Responsive drawer/sheet rules are Task 8.)

- [ ] **Step 6: Run to verify they pass**

Run the Step 3 command. Expected: PASS (nav 2 changed + 1 new, routes 1 new + existing coverage, container 8). If `app.routes.spec.ts` fails on other children, read the message: it means an existing assertion enumerates categories; update that assertion, not the implementation.

- [ ] **Step 7: Build check**

Run: `npx ng build`
Expected: succeeds with no template errors (`TS-998xxx` strict-template errors would show here, e.g. `$any` misuse).

- [ ] **Step 8: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): admin Projects & Plots screen shell — list, grid, legend, detail aside (unit 11)"
```

---

### Task 5: Plot form (add / edit / locked) and project form

**Files:**
- Create: `src/app/admin/projects-plots/plot-form.component.ts` + `.spec.ts`
- Create: `src/app/admin/projects-plots/project-form.component.ts` + `.spec.ts`
- Modify: `src/app/admin/projects-plots/projects-plots.component.ts` (+ spec)
- Modify: `src/styles/_admin.scss` (form rules)

**Interfaces:**
- Consumes: `Plot`, `PlotRequest`, `ProjectRequest`, `Project` (existing), `ProjectsService.createPlot/updatePlot/createProject/updateProject/uploadThumbnail`.
- Produces:
  - `<app-plot-form [plot]="Plot|null" [locked]="boolean" [busy]="boolean" [duplicatePlotNo]="boolean" (submitted)="PlotRequest" (cancelled)>`
  - `<app-project-form [project]="Project|null" [busy]="boolean" (submitted)="{ request: ProjectRequest; photo: File | null }" (cancelled)>`

- [ ] **Step 1: Write the failing form specs**

```ts
// src/app/admin/projects-plots/plot-form.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { PlotFormComponent } from './plot-form.component';
import { Plot, PlotRequest } from '../../setup/models/project.model';

describe('PlotFormComponent', () => {
  let fixture: ComponentFixture<PlotFormComponent>;
  const el = () => fixture.nativeElement as HTMLElement;
  const plot: Plot = { id: 'x', plotNo: 'A-1', plotType: 'CORNER', areaSqft: 1800, rate: 2850, price: 5130000, status: 'AVAILABLE' };

  function setup(inputs: Record<string, unknown> = {}) {
    TestBed.configureTestingModule({ imports: [PlotFormComponent, TranslateModule.forRoot()] });
    fixture = TestBed.createComponent(PlotFormComponent);
    for (const [k, v] of Object.entries({ plot: null, locked: false, busy: false, duplicatePlotNo: false, ...inputs })) {
      fixture.componentRef.setInput(k, v);
    }
    fixture.detectChanges();
  }
  const type = (name: string, value: string) => {
    const input = el().querySelector<HTMLInputElement>(`[name="${name}"]`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };

  it('emits a PlotRequest for a valid new plot with status AVAILABLE', async () => {
    setup();
    const out: PlotRequest[] = [];
    fixture.componentInstance.submitted.subscribe(r => out.push(r));
    type('plotNo', 'C-9'); type('areaSqft', '1200'); type('rate', '3000'); type('price', '3600000');
    await fixture.whenStable();
    el().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    expect(out).toEqual([{ plotNo: 'C-9', plotType: 'NORMAL', areaSqft: 1200, rate: 3000, price: 3600000, status: 'AVAILABLE' }]);
  });

  it('blocks submit and shows required errors when fields are empty or non-positive', async () => {
    setup();
    const out: PlotRequest[] = [];
    fixture.componentInstance.submitted.subscribe(r => out.push(r));
    type('areaSqft', '0');
    await fixture.whenStable();
    el().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(out.length).toBe(0);
    expect(el().querySelectorAll('.field-error').length).toBeGreaterThan(0);
  });

  it('prefills when editing and keeps the current status in the request', async () => {
    setup({ plot });
    const out: PlotRequest[] = [];
    fixture.componentInstance.submitted.subscribe(r => out.push(r));
    await fixture.whenStable();
    el().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    expect(out[0]).toEqual({ plotNo: 'A-1', plotType: 'CORNER', areaSqft: 1800, rate: 2850, price: 5130000, status: 'AVAILABLE' });
  });

  it('renders the locked variant with no inputs and a back button', () => {
    setup({ plot: { ...plot, status: 'BOOKED' }, locked: true });
    expect(el().querySelector('input')).toBeNull();
    expect(el().textContent).toContain('admin.projectsPlots.editLockedTitle');
    let backed = false;
    fixture.componentInstance.cancelled.subscribe(() => (backed = true));
    el().querySelector<HTMLButtonElement>('.plot-form__back')!.click();
    expect(backed).toBeTrue();
  });

  it('shows the duplicate plot number error on the plotNo field', () => {
    setup({ duplicatePlotNo: true });
    expect(el().textContent).toContain('admin.projectsPlots.error.duplicatePlotNo');
  });
});
```

```ts
// src/app/admin/projects-plots/project-form.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { ProjectFormComponent } from './project-form.component';

describe('ProjectFormComponent', () => {
  let fixture: ComponentFixture<ProjectFormComponent>;
  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ProjectFormComponent, TranslateModule.forRoot()] });
    fixture = TestBed.createComponent(ProjectFormComponent);
    fixture.componentRef.setInput('project', null);
    fixture.componentRef.setInput('busy', false);
    fixture.detectChanges();
  });

  const type = (name: string, value: string) => {
    const input = el().querySelector<HTMLInputElement>(`[name="${name}"]`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };

  it('emits the trimmed request with no photo when none chosen', async () => {
    const out: unknown[] = [];
    fixture.componentInstance.submitted.subscribe(v => out.push(v));
    type('name', '  Lake View '); type('location', 'Pune');
    await fixture.whenStable();
    el().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    expect(out).toEqual([{ request: { name: 'Lake View', location: 'Pune' }, photo: null }]);
  });

  it('does not emit when the name is blank', async () => {
    const out: unknown[] = [];
    fixture.componentInstance.submitted.subscribe(v => out.push(v));
    type('name', '   '); type('location', 'Pune');
    await fixture.whenStable();
    el().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    expect(out.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify they fail** (modules missing).

- [ ] **Step 3: Implement the forms**

```ts
// src/app/admin/projects-plots/plot-form.component.ts
import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { Plot, PlotRequest, PlotType } from '../../setup/models/project.model';
import { FieldErrorComponent } from '../../shared/components/field-error/field-error.component';

@Component({
  selector: 'app-plot-form',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, FieldErrorComponent],
  template: `
    <ng-container *ngIf="locked; else editable">
      <h2 class="plot-form__title">{{ 'admin.projectsPlots.editLockedTitle' | translate }}</h2>
      <p>{{ 'admin.projectsPlots.editLockedBody' | translate }}</p>
      <button type="button" class="brand-button brand-button--secondary plot-form__back" (click)="cancelled.emit()">
        {{ 'admin.projectsPlots.backToPlot' | translate }}
      </button>
    </ng-container>
    <ng-template #editable>
      <form class="plot-form" (submit)="submit($event)" novalidate>
        <h2 class="plot-form__title">{{ (plot ? 'admin.projectsPlots.editPlotAction' : 'admin.projectsPlots.addPlotAction') | translate }}</h2>
        <label>{{ 'admin.projectsPlots.plotNoLabel' | translate }}
          <input type="text" name="plotNo" maxlength="50" [(ngModel)]="plotNo" [attr.aria-invalid]="plotNoInvalid" />
          <small>{{ 'admin.projectsPlots.plotNoHint' | translate }}</small>
          <app-field-error [message]="plotNoError() | translate"></app-field-error>
        </label>
        <fieldset class="plot-form__type">
          <legend>{{ 'admin.projectsPlots.plotTypeLabel' | translate }}</legend>
          <label *ngFor="let t of types"><input type="radio" name="plotType" [value]="t" [(ngModel)]="plotType" /> {{ 'admin.projectsPlots.type.' + t | translate }}</label>
        </fieldset>
        <label>{{ 'admin.projectsPlots.areaLabel' | translate }}
          <input type="number" name="areaSqft" min="0" step="any" [(ngModel)]="areaSqft" />
          <app-field-error [message]="(positive(areaSqft) || !submitted_ ? '' : 'admin.projectsPlots.error.generic') | translate"></app-field-error>
        </label>
        <label>{{ 'admin.projectsPlots.rateLabel' | translate }}
          <input type="number" name="rate" min="0" step="any" [(ngModel)]="rate" />
          <app-field-error [message]="(positive(rate) || !submitted_ ? '' : 'admin.projectsPlots.error.generic') | translate"></app-field-error>
        </label>
        <label>{{ 'admin.projectsPlots.priceLabel' | translate }}
          <input type="number" name="price" min="0" step="any" [(ngModel)]="price" />
          <small>{{ 'admin.projectsPlots.priceHint' | translate }}</small>
          <app-field-error [message]="(positive(price) || !submitted_ ? '' : 'admin.projectsPlots.error.generic') | translate"></app-field-error>
        </label>
        <p *ngIf="plot" class="plot-form__status">{{ 'admin.projectsPlots.statusLabel' | translate }}: {{ 'plotTile.status.' + plot.status | translate }} — {{ 'admin.projectsPlots.statusReadonlyHint' | translate }}</p>
        <div class="projects-plots__form-actions">
          <button type="submit" class="brand-button" [disabled]="busy">{{ 'admin.projectsPlots.savePlotAction' | translate }}</button>
          <button type="button" class="brand-button brand-button--secondary" (click)="cancelled.emit()">{{ 'admin.projectsPlots.cancelAction' | translate }}</button>
        </div>
      </form>
    </ng-template>
  `
})
export class PlotFormComponent implements OnChanges {
  @Input() plot: Plot | null = null;
  @Input() locked = false;
  @Input() busy = false;
  @Input() duplicatePlotNo = false;
  @Output() submitted = new EventEmitter<PlotRequest>();
  @Output() cancelled = new EventEmitter<void>();

  readonly types: PlotType[] = ['NORMAL', 'CORNER'];
  plotNo = '';
  plotType: PlotType = 'NORMAL';
  areaSqft: number | null = null;
  rate: number | null = null;
  price: number | null = null;
  submitted_ = false;

  ngOnChanges(): void {
    if (this.plot) {
      ({ plotNo: this.plotNo, plotType: this.plotType, areaSqft: this.areaSqft, rate: this.rate, price: this.price } = this.plot);
    }
  }

  get plotNoInvalid(): boolean { return this.duplicatePlotNo || (this.submitted_ && !this.plotNo.trim()); }

  positive(v: number | null): boolean { return typeof v === 'number' && v > 0; }

  plotNoError(): string {
    if (this.duplicatePlotNo) { return 'admin.projectsPlots.error.duplicatePlotNo'; }
    return this.submitted_ && !this.plotNo.trim() ? 'admin.projectsPlots.error.generic' : '';
  }

  submit(e: Event): void {
    e.preventDefault();
    this.submitted_ = true;
    if (!this.plotNo.trim() || !this.positive(this.areaSqft) || !this.positive(this.rate) || !this.positive(this.price)) { return; }
    this.submitted.emit({
      plotNo: this.plotNo.trim(), plotType: this.plotType,
      areaSqft: this.areaSqft!, rate: this.rate!, price: this.price!,
      status: this.plot?.status ?? 'AVAILABLE' // status is not editable here; echo the current one
    });
  }
}
```

```ts
// src/app/admin/projects-plots/project-form.component.ts
import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { Project, ProjectRequest } from '../../setup/models/project.model';
import { FieldErrorComponent } from '../../shared/components/field-error/field-error.component';

@Component({
  selector: 'app-project-form',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, FieldErrorComponent],
  template: `
    <form class="project-form" (submit)="submit($event)" novalidate>
      <h2 class="plot-form__title">{{ (project ? 'admin.projectsPlots.editProjectAction' : 'admin.projectsPlots.addProjectAction') | translate }}</h2>
      <label>{{ 'admin.projectsPlots.nameLabel' | translate }}
        <input type="text" name="name" maxlength="200" [(ngModel)]="name" [attr.aria-invalid]="tried && !name.trim()" />
        <app-field-error [message]="(tried && !name.trim() ? 'admin.projectsPlots.error.generic' : '') | translate"></app-field-error>
      </label>
      <label>{{ 'admin.projectsPlots.locationLabel' | translate }}
        <input type="text" name="location" maxlength="200" [(ngModel)]="location" [attr.aria-invalid]="tried && !location.trim()" />
        <app-field-error [message]="(tried && !location.trim() ? 'admin.projectsPlots.error.generic' : '') | translate"></app-field-error>
      </label>
      <label>{{ 'admin.projectsPlots.photoLabel' | translate }}
        <input type="file" name="photo" accept="image/*" (change)="photo = $any($event.target).files?.[0] ?? null" />
      </label>
      <div class="projects-plots__form-actions">
        <button type="submit" class="brand-button" [disabled]="busy">{{ 'admin.projectsPlots.saveProjectAction' | translate }}</button>
        <button type="button" class="brand-button brand-button--secondary" (click)="cancelled.emit()">{{ 'admin.projectsPlots.cancelAction' | translate }}</button>
      </div>
    </form>
  `
})
export class ProjectFormComponent implements OnChanges {
  @Input() project: Project | null = null;
  @Input() busy = false;
  @Output() submitted = new EventEmitter<{ request: ProjectRequest; photo: File | null }>();
  @Output() cancelled = new EventEmitter<void>();

  name = '';
  location = '';
  photo: File | null = null;
  tried = false;

  ngOnChanges(): void {
    if (this.project) {
      this.name = this.project.name;
      this.location = this.project.location;
    }
  }

  submit(e: Event): void {
    e.preventDefault();
    this.tried = true;
    if (!this.name.trim() || !this.location.trim()) { return; }
    this.submitted.emit({ request: { name: this.name.trim(), location: this.location.trim() }, photo: this.photo });
  }
}
```

(The plot-form's per-field error key for non-positive numbers reuses `error.generic` — a deliberate simplification: the `required` styling plus the HTML `min`/`type=number` already tells the admin which field; adding four more copy keys is not worth it. Replace if copy review disagrees.)

- [ ] **Step 4: Run to verify the form specs pass.** Expected: PASS.

- [ ] **Step 5: Wire the forms into the container — write failing container specs first**

Append to `projects-plots.component.spec.ts` (inside the describe):

```ts
  describe('plot and project mutations', () => {
    const detail = (over: Record<string, unknown> = {}) =>
      ({ id: 'id-A-2', plotNo: 'A-2', plotType: 'NORMAL', areaSqft: 1200, rate: 3750, price: 4500000, status: 'AVAILABLE', ...over });

    function selectFirstAvailable(status = 'AVAILABLE') {
      const first = fixture.componentInstance.grid!.find(p => p.status === status)!;
      el().querySelectorAll<HTMLButtonElement>('app-plot-tile button')[
        fixture.componentInstance.visibleBlocks.flatMap(b => b.plots).findIndex(p => p.plotId === first.plotId)
      ].click();
      http.expectOne(`/api/company/projects/p1/plots/${first.plotId}`).flush(detail({ id: first.plotId, plotNo: first.plotNo, status }));
      fixture.detectChanges();
    }

    it('offers Edit plot on an AVAILABLE plot and PUTs the change, then refreshes grid and project counts', () => {
      boot();
      selectFirstAvailable();
      el().querySelector<HTMLButtonElement>('.projects-plots__edit-plot')!.click();
      fixture.detectChanges();
      fixture.componentInstance.saveEditedPlot({ plotNo: 'A-2', plotType: 'NORMAL', areaSqft: 1300, rate: 3750, price: 4875000, status: 'AVAILABLE' });
      const put = http.expectOne('/api/company/projects/p1/plots/id-A-2');
      expect(put.request.method).toBe('PUT');
      put.flush(detail({ areaSqft: 1300 }));
      http.expectOne('/api/projects/p1/plots/grid').flush([cell('A-2')]);
      http.expectOne('/api/company/projects').flush([project()]);
      http.expectOne('/api/company/projects/p1/plots/id-A-2').flush(detail({ areaSqft: 1300 }));
      expect(fixture.componentInstance.aside.kind).toBe('detail');
    });

    it('shows the locked edit variant for a BOOKED plot', () => {
      boot();
      selectFirstAvailable('BOOKED');
      el().querySelector<HTMLButtonElement>('.projects-plots__edit-plot')!.click();
      fixture.detectChanges();
      expect(el().textContent).toContain('admin.projectsPlots.editLockedTitle');
      expect(el().querySelector('app-plot-form input')).toBeNull();
    });

    it('maps a 409 on plot save to the duplicate plot number field error', () => {
      boot();
      fixture.componentInstance.openAside({ kind: 'addPlot' });
      fixture.componentInstance.saveNewPlot({ plotNo: 'A-1', plotType: 'NORMAL', areaSqft: 1, rate: 1, price: 1, status: 'AVAILABLE' });
      http.expectOne('/api/company/projects/p1/plots').flush({ error: 'dup' }, { status: 409, statusText: 'Conflict' });
      fixture.detectChanges();
      expect(fixture.componentInstance.duplicatePlotNo).toBeTrue();
      expect(el().textContent).toContain('admin.projectsPlots.error.duplicatePlotNo');
    });

    it('creates a plot then refreshes grid and project counts and closes the aside', () => {
      boot();
      fixture.componentInstance.openAside({ kind: 'addPlot' });
      fixture.componentInstance.saveNewPlot({ plotNo: 'C-1', plotType: 'NORMAL', areaSqft: 1, rate: 1, price: 1, status: 'AVAILABLE' });
      http.expectOne('/api/company/projects/p1/plots').flush(detail());
      http.expectOne('/api/projects/p1/plots/grid').flush([cell('C-1')]);
      http.expectOne('/api/company/projects').flush([project({ totalPlots: 4 })]);
      expect(fixture.componentInstance.aside.kind).toBe('none');
    });

    it('creates a project, uploads its photo, and selects it', () => {
      boot();
      const photo = new File(['x'], 'p.png');
      fixture.componentInstance.saveProject({ request: { name: 'New', location: 'Goa' }, photo });
      http.expectOne({ method: 'POST', url: '/api/company/projects' }).flush(project({ id: 'p9', name: 'New' }));
      http.expectOne('/api/company/projects/p9/thumbnail').flush(null);
      http.expectOne('/api/company/projects').flush([project(), project({ id: 'p9', name: 'New' })]);
      http.expectOne('/api/projects/p9/plots/grid').flush([]);
      expect(fixture.componentInstance.selectedProject!.id).toBe('p9');
    });
  });
```

- [ ] **Step 6: Implement the container wiring**

In `projects-plots.component.ts`:

1. Add imports: `PlotFormComponent`, `ProjectFormComponent` (to `imports` array); `PlotRequest`, `ProjectRequest` types; `switchMap`, `of` from rxjs (`catchError` already imported).
2. Add fields:

```ts
  busy = false;
  duplicatePlotNo = false;
```

3. In the template's `<aside>`, inside the detail block after `</dl>`, add the action buttons; then add the form cases after the detail `ng-container`:

```html
            <div class="projects-plots__aside-actions">
              <button type="button" class="brand-button brand-button--secondary projects-plots__edit-plot" (click)="openAside({ kind: 'editPlot' })">
                {{ 'admin.projectsPlots.editPlotAction' | translate }}
              </button>
            </div>
          </ng-container>

          <app-plot-form *ngIf="aside.kind === 'editPlot' && selectedPlot && plotDetail"
            [plot]="plotDetail" [locked]="plotDetail.status !== 'AVAILABLE'" [busy]="busy" [duplicatePlotNo]="duplicatePlotNo"
            (submitted)="saveEditedPlot($event)" (cancelled)="openAside({ kind: 'detail' })"></app-plot-form>
          <app-plot-form *ngIf="aside.kind === 'addPlot'" [plot]="null" [busy]="busy" [duplicatePlotNo]="duplicatePlotNo"
            (submitted)="saveNewPlot($event)" (cancelled)="closeAside()"></app-plot-form>
          <app-project-form *ngIf="aside.kind === 'project'" [project]="aside.mode === 'edit' ? selectedProject : null" [busy]="busy"
            (submitted)="saveProject($event)" (cancelled)="closeAside()"></app-project-form>
```

(Remove the original `</ng-container>` that closed the detail block so the structure stays balanced; the detail block now ends after the actions `div`. Task 6 adds the CSV panel, Task 7 the book form and Book button.)

4. Add methods:

```ts
  saveNewPlot(req: PlotRequest): void {
    this.mutate(this.projectsService.createPlot(this.selectedProject!.id, req), () => {
      this.refreshAfterPlotChange();
      this.aside = { kind: 'none' };
    });
  }

  saveEditedPlot(req: PlotRequest): void {
    const plotId = this.selectedPlotId!;
    this.mutate(this.projectsService.updatePlot(this.selectedProject!.id, plotId, req), () => {
      this.refreshAfterPlotChange();
      this.aside = { kind: 'detail' };
      this.plotsService.getPlot(this.selectedProject!.id, plotId).subscribe(d => (this.plotDetail = d));
    });
  }

  saveProject(v: { request: ProjectRequest; photo: File | null }): void {
    const editing = this.aside.kind === 'project' && this.aside.mode === 'edit' && this.selectedProject;
    const save$ = editing
      ? this.projectsService.updateProject(this.selectedProject!.id, v.request)
      : this.projectsService.createProject(v.request);
    this.mutate(
      save$.pipe(switchMap(p => (v.photo ? this.projectsService.uploadThumbnail(p.id, v.photo).pipe(map(() => p)) : of(p)))),
      p => {
        this.aside = { kind: 'none' };
        this.reloadProjects(p.id);
      }
    );
  }

  // Grid and the project list's counts both change when plots are added/edited.
  private refreshAfterPlotChange(): void {
    this.loadGrid();
    this.reloadProjects();
  }

  private mutate<T>(source: Observable<T>, onOk: (v: T) => void): void {
    this.busy = true;
    this.duplicatePlotNo = false;
    source.subscribe({
      next: v => { this.busy = false; onOk(v); },
      error: (err: HttpErrorResponse) => {
        this.busy = false;
        if (err.status === 409 && (this.aside.kind === 'addPlot' || this.aside.kind === 'editPlot')) {
          this.duplicatePlotNo = true;
        } else {
          this.banner = this.errorBanner(err);
        }
      }
    });
  }
```

Add `map` and `switchMap` to the rxjs import and `Observable`.

Also reset `duplicatePlotNo = false` inside `openAside`.

Important edge: `reloadProjects()` with no argument keeps the current selection (it only calls `selectProject` — which would clear the aside and refetch the grid — when the selected id changes). That is what the "refreshes grid and project counts" spec above relies on: it expects exactly ONE `/api/projects/p1/plots/grid` request from `loadGrid()`, not two. Verify by running the spec.

Append form styles to `_admin.scss` inside the `.projects-plots` block:

```scss
  &__aside-actions, &__form-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  &__aside form, &__aside .plot-form, &__aside .project-form { display: flex; flex-direction: column; gap: 1rem; }
  &__aside label { display: flex; flex-direction: column; gap: 0.375rem; font-size: 0.875rem; font-weight: 500; margin: 0; }
  &__aside small { font-weight: 400; color: var(--text-muted); }
  &__aside fieldset { display: flex; gap: 1rem; border: 0; padding: 0; margin: 0;
    legend { font: 500 0.6875rem var(--font-mono); text-transform: uppercase; color: var(--text-muted); }
    label { flex-direction: row; align-items: center; } }
```

- [ ] **Step 7: Run all projects-plots specs.**

Run: `npx ng test --watch=false --browsers=ChromeHeadless --include='src/app/admin/projects-plots/**/*.spec.ts'`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): plot and project add/edit forms with locked variant for booked/sold plots (unit 11)"
```

---

### Task 6: CSV import panel

**Files:**
- Create: `src/app/admin/projects-plots/csv-import-panel.component.ts` + `.spec.ts`
- Modify: `src/app/admin/projects-plots/projects-plots.component.ts` (+ spec)

**Interfaces:**
- Consumes: `ProjectsService.validateCsv(projectId, file)`, `.commitCsv(projectId, file)`, `.csvTemplateUrl()`; `CsvValidationResponse`.
- Produces: `<app-csv-import-panel [projectId]="string" (imported) (cancelled)>`.

The template link is a plain `<a [href]>` to `ProjectsService.csvTemplateUrl()`, exactly as `projects-step.component.ts:252` does it today (same mechanism, same behaviour; if that link turns out to 401 without a token, fix both places together in a separate change, not here).

- [ ] **Step 1: Write the failing spec**

```ts
// src/app/admin/projects-plots/csv-import-panel.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { CsvImportPanelComponent } from './csv-import-panel.component';

describe('CsvImportPanelComponent', () => {
  let fixture: ComponentFixture<CsvImportPanelComponent>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;
  const file = new File(['a,b'], 'plots.csv');

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [CsvImportPanelComponent, HttpClientTestingModule, TranslateModule.forRoot()] });
    fixture = TestBed.createComponent(CsvImportPanelComponent);
    fixture.componentRef.setInput('projectId', 'p1');
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });
  afterEach(() => http.verify());

  it('keeps Commit disabled until validation returns no errors', () => {
    fixture.componentInstance.file = file;
    fixture.componentInstance.validate();
    http.expectOne('/api/company/projects/p1/plots/csv/validate')
      .flush({ totalRows: 36, validRows: 34, errors: [{ rowNumber: 3, field: 'plotNo', message: 'dup' }] });
    fixture.detectChanges();
    expect(el().textContent).toContain('admin.projectsPlots.csvRowError');
    expect(el().querySelector<HTMLButtonElement>('.csv-panel__commit')!.disabled).toBeTrue();
  });

  it('enables Commit on a clean validation, commits, and emits imported', () => {
    let imported = false;
    fixture.componentInstance.imported.subscribe(() => (imported = true));
    fixture.componentInstance.file = file;
    fixture.componentInstance.validate();
    http.expectOne('/api/company/projects/p1/plots/csv/validate').flush({ totalRows: 2, validRows: 2, errors: [] });
    fixture.detectChanges();
    const commit = el().querySelector<HTMLButtonElement>('.csv-panel__commit')!;
    expect(commit.disabled).toBeFalse();
    commit.click();
    http.expectOne('/api/company/projects/p1/plots/csv/commit').flush(null, { status: 204, statusText: 'No Content' });
    expect(imported).toBeTrue();
  });

  it('shows a generic error when validation request fails', () => {
    fixture.componentInstance.file = file;
    fixture.componentInstance.validate();
    http.expectOne('/api/company/projects/p1/plots/csv/validate').flush('x', { status: 500, statusText: 'err' });
    fixture.detectChanges();
    expect(el().textContent).toContain('admin.projectsPlots.csvGenericError');
  });

  it('forgets a previous validation result when a different file is chosen', () => {
    fixture.componentInstance.file = file;
    fixture.componentInstance.validate();
    http.expectOne('/api/company/projects/p1/plots/csv/validate').flush({ totalRows: 1, validRows: 1, errors: [] });
    fixture.componentInstance.onFile(new File(['z'], 'other.csv'));
    expect(fixture.componentInstance.result).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement**

```ts
// src/app/admin/projects-plots/csv-import-panel.component.ts
import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { ProjectsService } from '../../setup/steps/projects/projects.service';
import { CsvValidationResponse } from '../../setup/models/project.model';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';

// Same semantics as the setup wizard's CSV import (validate first, commit only when errors is
// empty), reusing ProjectsService so the two screens cannot drift on the contract.
@Component({
  selector: 'app-csv-import-panel',
  standalone: true,
  imports: [CommonModule, TranslateModule, InlineBannerComponent],
  template: `
    <h2 class="plot-form__title">{{ 'admin.projectsPlots.importCsvAction' | translate }}</h2>
    <a class="csv-panel__template" [href]="templateUrl">{{ 'admin.projectsPlots.downloadTemplateAction' | translate }}</a>
    <label>{{ 'admin.projectsPlots.chooseFileLabel' | translate }}
      <input type="file" accept=".csv,text/csv" (change)="onFile($any($event.target).files?.[0] ?? null)" />
    </label>
    <app-inline-banner *ngIf="failed" tone="danger">{{ 'admin.projectsPlots.csvGenericError' | translate }}</app-inline-banner>
    <ng-container *ngIf="result as r">
      <p role="status">{{ 'admin.projectsPlots.csvSummary' | translate: { valid: r.validRows, total: r.totalRows } }}</p>
      <ul class="csv-panel__errors" *ngIf="r.errors.length">
        <li *ngFor="let e of r.errors">{{ 'admin.projectsPlots.csvRowError' | translate: { row: e.rowNumber, field: e.field, message: e.message } }}</li>
      </ul>
    </ng-container>
    <div class="projects-plots__form-actions">
      <button type="button" class="brand-button brand-button--secondary" [disabled]="!file || busy" (click)="validate()">{{ 'admin.projectsPlots.validateAction' | translate }}</button>
      <button type="button" class="brand-button csv-panel__commit" [disabled]="!canCommit || busy" (click)="commit()">{{ 'admin.projectsPlots.commitAction' | translate }}</button>
      <button type="button" class="brand-button brand-button--secondary" (click)="cancelled.emit()">{{ 'admin.projectsPlots.cancelAction' | translate }}</button>
    </div>
  `
})
export class CsvImportPanelComponent {
  private projects = inject(ProjectsService);
  @Input({ required: true }) projectId!: string;
  @Output() imported = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  readonly templateUrl = this.projects.csvTemplateUrl();
  file: File | null = null;
  result: CsvValidationResponse | null = null;
  failed = false;
  busy = false;

  get canCommit(): boolean { return !!this.result && this.result.errors.length === 0; }

  onFile(f: File | null): void {
    this.file = f;
    this.result = null; // a result belongs to the file it validated
    this.failed = false;
  }

  validate(): void {
    if (!this.file) { return; }
    this.busy = true;
    this.projects.validateCsv(this.projectId, this.file).subscribe({
      next: r => { this.busy = false; this.failed = false; this.result = r; },
      error: () => { this.busy = false; this.failed = true; }
    });
  }

  commit(): void {
    if (!this.file || !this.canCommit) { return; }
    this.busy = true;
    this.projects.commitCsv(this.projectId, this.file).subscribe({
      next: () => { this.busy = false; this.imported.emit(); },
      error: () => { this.busy = false; this.failed = true; }
    });
  }
}
```

- [ ] **Step 4: Wire into the container — failing spec first**

```ts
    it('opens the CSV panel and refreshes grid and counts after a successful import', () => {
      boot();
      el().querySelectorAll<HTMLButtonElement>('.projects-plots__project-actions button')[1].click();
      fixture.detectChanges();
      expect(el().querySelector('app-csv-import-panel')).not.toBeNull();
      fixture.componentInstance.onCsvImported();
      http.expectOne('/api/projects/p1/plots/grid').flush([cell('A-1')]);
      http.expectOne('/api/company/projects').flush([project()]);
      expect(fixture.componentInstance.aside.kind).toBe('none');
    });
```

(Add inside the `plot and project mutations` describe.) In the container: add `CsvImportPanelComponent` to `imports`, add to the aside template

```html
          <app-csv-import-panel *ngIf="aside.kind === 'csv' && selectedProject" [projectId]="selectedProject.id"
            (imported)="onCsvImported()" (cancelled)="closeAside()"></app-csv-import-panel>
```

and the method

```ts
  onCsvImported(): void {
    this.refreshAfterPlotChange();
    this.aside = { kind: 'none' };
  }
```

- [ ] **Step 5: Run `--include='src/app/admin/projects-plots/**/*.spec.ts'`.** Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): CSV plot import panel on Projects & Plots (unit 11)"
```

---

### Task 7: Book form and booking flow

**Files:**
- Create: `src/app/admin/projects-plots/book-plot-form.component.ts` + `.spec.ts`
- Modify: `src/app/admin/projects-plots/projects-plots.component.ts` (+ spec)

**Interfaces:**
- Consumes: `AssociateLookupComponent`, `BookingEmiConfig`, `BookingFormValue`, `PlotGridItem`, `formatInr`.
- Produces: `<app-book-plot-form [plot]="PlotGridItem" [associates]="AssociateSummary[]" [emiConfig]="BookingEmiConfig|null" [busy]="boolean" (submitted)="BookingFormValue" (cancelled)>`.

- [ ] **Step 1: Write the failing form spec**

```ts
// src/app/admin/projects-plots/book-plot-form.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { BookPlotFormComponent } from './book-plot-form.component';
import { BookingFormValue } from './projects-plots.model';

describe('BookPlotFormComponent', () => {
  let fixture: ComponentFixture<BookPlotFormComponent>;
  const el = () => fixture.nativeElement as HTMLElement;
  const associates = [{ id: 'a1', userId: 'VP00001', name: 'Jane', role: 'ASSOCIATE' as const, hasFreeSlot: true }];
  const plot = { plotId: 'x', plotNo: 'A-12', type: 'NORMAL' as const, area: 1800, price: 5130000, status: 'AVAILABLE' as const };

  function setup(emi: unknown = { emiEnabled: true, defaultInstallmentCount: 6 }, busy = false) {
    TestBed.configureTestingModule({ imports: [BookPlotFormComponent, TranslateModule.forRoot()] });
    fixture = TestBed.createComponent(BookPlotFormComponent);
    fixture.componentRef.setInput('plot', plot);
    fixture.componentRef.setInput('associates', associates);
    fixture.componentRef.setInput('emiConfig', emi);
    fixture.componentRef.setInput('busy', busy);
    fixture.detectChanges();
  }
  const submitForm = () => el().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
  const typeInto = (name: string, v: string) => {
    const i = el().querySelector<HTMLInputElement>(`[name="${name}"]`)!;
    i.value = v; i.dispatchEvent(new Event('input'));
  };

  it('blocks submit with a blank buyer name, flags the field and moves focus to it', async () => {
    setup();
    const out: BookingFormValue[] = [];
    fixture.componentInstance.submitted.subscribe(v => out.push(v));
    fixture.componentInstance.associateId = 'a1';
    typeInto('buyerName', '   ');
    await fixture.whenStable();
    submitForm();
    fixture.detectChanges();
    const field = el().querySelector<HTMLInputElement>('[name="buyerName"]')!;
    expect(out.length).toBe(0);
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(el().textContent).toContain('admin.projectsPlots.buyerNameRequired');
    expect(document.activeElement).toBe(field);
  });

  it('requires an associate', async () => {
    setup();
    const out: BookingFormValue[] = [];
    fixture.componentInstance.submitted.subscribe(v => out.push(v));
    typeInto('buyerName', 'Rohit');
    await fixture.whenStable();
    submitForm();
    fixture.detectChanges();
    expect(out.length).toBe(0);
    expect(el().textContent).toContain('admin.projectsPlots.associateRequired');
  });

  it('emits the trimmed value when valid', async () => {
    setup();
    const out: BookingFormValue[] = [];
    fixture.componentInstance.submitted.subscribe(v => out.push(v));
    fixture.componentInstance.associateId = 'a1';
    typeInto('buyerName', '  Rohit Kulkarni ');
    typeInto('buyerPhone', ' 9876543210 ');
    await fixture.whenStable();
    submitForm();
    expect(out).toEqual([{ associateId: 'a1', buyerName: 'Rohit Kulkarni', buyerPhone: '9876543210' }]);
  });

  it('shows the equal-split preview when EMI is on', () => {
    setup();
    expect(el().textContent).toContain('admin.projectsPlots.schedulePreview');
  });

  it('shows the single-installment line when EMI is off, and no preview when config is unreadable', () => {
    setup({ emiEnabled: false, defaultInstallmentCount: 1 });
    expect(el().textContent).toContain('admin.projectsPlots.scheduleSingle');
    TestBed.resetTestingModule();
    setup(null);
    expect(el().textContent).not.toContain('admin.projectsPlots.schedulePreview');
    expect(el().textContent).not.toContain('admin.projectsPlots.scheduleSingle');
  });

  it('disables inputs and the submit button, and marks it busy, while submitting', () => {
    setup(undefined, true);
    const btn = el().querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(btn.disabled).toBeTrue();
    expect(btn.getAttribute('aria-busy')).toBe('true');
    expect(el().querySelector<HTMLInputElement>('[name="buyerName"]')!.disabled).toBeTrue();
    // Cancel stays enabled while in flight (the request still completes; see container spec).
    expect(el().querySelector<HTMLButtonElement>('.book-form__cancel')!.disabled).toBeFalse();
  });

  it('does not emit twice when submitted again while busy', async () => {
    setup(undefined, true);
    const out: BookingFormValue[] = [];
    fixture.componentInstance.submitted.subscribe(v => out.push(v));
    fixture.componentInstance.associateId = 'a1';
    fixture.componentInstance.buyerName = 'Rohit';
    submitForm();
    expect(out.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement**

```ts
// src/app/admin/projects-plots/book-plot-form.component.ts
import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { AssociateSummary } from '../models/associate-summary.model';
import { AssociateLookupComponent } from '../../shared/components/associate-lookup/associate-lookup.component';
import { FieldErrorComponent } from '../../shared/components/field-error/field-error.component';
import { PlotGridItem, formatInr } from '../../shared/utils/plot-grid.util';
import { BookingEmiConfig, BookingFormValue } from './projects-plots.model';

@Component({
  selector: 'app-book-plot-form',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, AssociateLookupComponent, FieldErrorComponent],
  template: `
    <form class="book-form" (submit)="submit($event)" novalidate>
      <h2 class="plot-form__title">{{ 'admin.projectsPlots.bookTitle' | translate: { no: plot.plotNo } }}</h2>
      <div class="book-form__field">
        <span class="book-form__label">{{ 'admin.projectsPlots.associateLabel' | translate }}</span>
        <app-associate-lookup [associates]="associates" [value]="associateId"
          [placeholder]="'admin.projectsPlots.lookupPlaceholder' | translate"
          (selected)="associateId = $event?.id ?? ''"></app-associate-lookup>
        <small>{{ 'admin.projectsPlots.associateHint' | translate }}</small>
        <app-field-error [message]="(tried && !associateId ? 'admin.projectsPlots.associateRequired' : '') | translate"></app-field-error>
      </div>
      <label>{{ 'admin.projectsPlots.buyerNameLabel' | translate }}
        <input #buyerNameInput type="text" name="buyerName" maxlength="200" autocomplete="off"
          [placeholder]="'admin.projectsPlots.buyerNamePlaceholder' | translate" [disabled]="busy" [(ngModel)]="buyerName"
          [attr.aria-invalid]="nameInvalid ? 'true' : null" [attr.aria-describedby]="nameInvalid ? 'book-name-err' : null" />
        <app-field-error id="book-name-err" [message]="(nameInvalid ? 'admin.projectsPlots.buyerNameRequired' : '') | translate"></app-field-error>
      </label>
      <label>{{ 'admin.projectsPlots.buyerPhoneLabel' | translate }} <span>{{ 'admin.projectsPlots.optional' | translate }}</span>
        <input type="tel" name="buyerPhone" maxlength="20" [disabled]="busy" [(ngModel)]="buyerPhone" />
      </label>
      <div class="book-form__total">
        <span class="book-form__label">{{ 'admin.projectsPlots.totalLabel' | translate }}</span>
        <strong>{{ priceText }}</strong>
        <small>{{ 'admin.projectsPlots.totalHint' | translate }}</small>
      </div>
      <p class="book-form__preview" *ngIf="previewKey as k">
        <span class="book-form__label">{{ 'admin.projectsPlots.schedulePreviewLabel' | translate }}</span>
        {{ k | translate: previewParams }}
      </p>
      <div class="projects-plots__form-actions">
        <button type="submit" class="brand-button" [disabled]="busy" [attr.aria-busy]="busy">
          {{ (busy ? 'admin.projectsPlots.bookingInProgress' : 'admin.projectsPlots.confirmBookingAction') | translate }}
        </button>
        <button type="button" class="brand-button brand-button--secondary book-form__cancel" (click)="cancelled.emit()">{{ 'admin.projectsPlots.cancelAction' | translate }}</button>
      </div>
    </form>
  `
})
export class BookPlotFormComponent {
  @Input({ required: true }) plot!: PlotGridItem;
  @Input() associates: AssociateSummary[] = [];
  @Input() emiConfig: BookingEmiConfig | null = null;
  @Input() busy = false;
  @Output() submitted = new EventEmitter<BookingFormValue>();
  @Output() cancelled = new EventEmitter<void>();
  @ViewChild('buyerNameInput') buyerNameInput?: ElementRef<HTMLInputElement>;

  associateId = '';
  buyerName = '';
  buyerPhone = '';
  tried = false;

  get nameInvalid(): boolean { return this.tried && !this.buyerName.trim(); }
  get priceText(): string { return formatInr(this.plot.price); }

  // Preview is an equal-split estimate only; the real schedule is server-side (DESIGN Decision 3).
  get previewKey(): string | null {
    if (!this.emiConfig) { return null; }
    return this.emiConfig.emiEnabled && this.emiConfig.defaultInstallmentCount > 1
      ? 'admin.projectsPlots.schedulePreview' : 'admin.projectsPlots.scheduleSingle';
  }
  get previewParams(): { count: number; amount: string } {
    const count = this.emiConfig?.defaultInstallmentCount ?? 1;
    return { count, amount: formatInr(Math.round(this.plot.price / count)) };
  }

  submit(e: Event): void {
    e.preventDefault();
    if (this.busy) { return; } // double-submit guard; the disabled button alone is not enough for Enter-key submits
    this.tried = true;
    if (!this.buyerName.trim()) {
      this.buyerNameInput?.nativeElement.focus();
      return;
    }
    if (!this.associateId) { return; }
    this.submitted.emit({ associateId: this.associateId, buyerName: this.buyerName.trim(), buyerPhone: this.buyerPhone.trim() });
  }
}
```

- [ ] **Step 4: Run the form spec.** Expected: PASS. (Focus assertion needs the fixture attached: if `document.activeElement` fails, add `document.body.appendChild(fixture.nativeElement)` in the first test before `submitForm()`.)

- [ ] **Step 5: Failing container specs for the booking flow**

Add inside the container spec describe:

```ts
  describe('booking', () => {
    const detail = { id: 'id-A-2', plotNo: 'A-2', plotType: 'NORMAL', areaSqft: 1200, rate: 3750, price: 4500000, status: 'AVAILABLE' };
    const form = { associateId: 'a1', buyerName: 'Rohit', buyerPhone: '' };

    function openBookForm(status = 'AVAILABLE') {
      boot([project()], [cell('A-2', status)]);
      el().querySelector<HTMLButtonElement>('app-plot-tile button')!.click();
      http.expectOne('/api/company/projects/p1/plots/id-A-2').flush({ ...detail, status });
      fixture.detectChanges();
    }

    it('offers Book on an AVAILABLE plot and opens the form with only ASSOCIATE-role lookups', () => {
      openBookForm();
      el().querySelector<HTMLButtonElement>('.projects-plots__book')!.click();
      fixture.detectChanges();
      expect(el().querySelector('app-book-plot-form')).not.toBeNull();
      expect(fixture.componentInstance.associates.map(a => a.id)).toEqual(['a1']);
    });

    it('disables Book on a BOOKED plot and explains why in text', () => {
      openBookForm('BOOKED');
      const btn = el().querySelector<HTMLButtonElement>('.projects-plots__book')!;
      expect(btn.disabled).toBeTrue();
      expect(el().textContent).toContain('admin.projectsPlots.bookDisabledBooked');
      expect(btn.getAttribute('aria-describedby')).toBe('book-disabled-reason');
    });

    it('explains a SOLD plot too', () => {
      openBookForm('SOLD');
      expect(el().textContent).toContain('admin.projectsPlots.bookDisabledSold');
    });

    it('on 201 refreshes the grid, shows the success banner with a view-booking link, returns to detail', () => {
      openBookForm();
      fixture.componentInstance.openAside({ kind: 'book' });
      fixture.componentInstance.submitBooking(form);
      const post = http.expectOne('/api/admin/bookings');
      expect(post.request.body).toEqual({ plotId: 'id-A-2', associateId: 'a1', buyerName: 'Rohit', buyerPhone: undefined });
      post.flush({ id: 'b1', plotId: 'id-A-2', buyerName: 'Rohit', totalAmount: 4500000, installmentCount: 4 }, { status: 201, statusText: 'Created' });
      http.expectOne('/api/projects/p1/plots/grid').flush([cell('A-2', 'BOOKED')]);
      http.expectOne('/api/company/projects').flush([project()]);
      fixture.detectChanges();
      expect(fixture.componentInstance.aside.kind).toBe('detail');
      expect(fixture.componentInstance.banner).toEqual(jasmine.objectContaining({ tone: 'success', bookingId: 'b1' }));
      expect(el().querySelector('.projects-plots__aside a')!.getAttribute('href')).toContain('booking=b1');
    });

    it('on 409 refreshes the grid, shows the warning banner and returns to the (now booked) detail', () => {
      openBookForm();
      fixture.componentInstance.openAside({ kind: 'book' });
      fixture.componentInstance.submitBooking(form);
      http.expectOne('/api/admin/bookings').flush({ error: 'Plot is not available' }, { status: 409, statusText: 'Conflict' });
      http.expectOne('/api/projects/p1/plots/grid').flush([cell('A-2', 'BOOKED')]);
      fixture.detectChanges();
      expect(fixture.componentInstance.banner).toEqual(jasmine.objectContaining({ tone: 'warning', key: 'admin.projectsPlots.error.conflict' }));
      expect(fixture.componentInstance.selectedPlot!.status).toBe('BOOKED');
      expect(el().querySelector<HTMLButtonElement>('.projects-plots__book')!.disabled).toBeTrue();
    });

    it('shows the server error text on a 400 and keeps the form open and re-enabled', () => {
      openBookForm();
      fixture.componentInstance.openAside({ kind: 'book' });
      fixture.componentInstance.submitBooking(form);
      http.expectOne('/api/admin/bookings').flush({ error: 'buyerName must not be blank' }, { status: 400, statusText: 'Bad Request' });
      expect(fixture.componentInstance.banner).toEqual(jasmine.objectContaining({ tone: 'danger', text: 'buyerName must not be blank' }));
      expect(fixture.componentInstance.aside.kind).toBe('book');
      expect(fixture.componentInstance.busy).toBeFalse();
    });

    it('shows a generic error on a network failure and keeps the form', () => {
      openBookForm();
      fixture.componentInstance.openAside({ kind: 'book' });
      fixture.componentInstance.submitBooking(form);
      http.expectOne('/api/admin/bookings').error(new ProgressEvent('error'));
      expect(fixture.componentInstance.banner).toEqual(jasmine.objectContaining({ key: 'admin.projectsPlots.error.generic' }));
      expect(fixture.componentInstance.aside.kind).toBe('book');
    });

    it('lets the request finish and refresh the grid after the admin cancels mid-flight', () => {
      openBookForm();
      fixture.componentInstance.openAside({ kind: 'book' });
      fixture.componentInstance.submitBooking(form);
      fixture.componentInstance.closeAside();
      http.expectOne('/api/admin/bookings').flush({ id: 'b1', plotId: 'id-A-2', buyerName: 'Rohit', totalAmount: 1, installmentCount: 1 });
      http.expectOne('/api/projects/p1/plots/grid').flush([cell('A-2', 'BOOKED')]);
      http.expectOne('/api/company/projects').flush([project()]);
      expect(fixture.componentInstance.selectedPlot!.status).toBe('BOOKED');
      expect(fixture.componentInstance.aside.kind).toBe('none'); // stays closed; the banner still records the outcome
    });

    it('ignores a second submit while the first is in flight', () => {
      openBookForm();
      fixture.componentInstance.openAside({ kind: 'book' });
      fixture.componentInstance.submitBooking(form);
      fixture.componentInstance.submitBooking(form);
      expect(http.match('/api/admin/bookings').length).toBe(1);
    });
  });
```

Note: the banner lives inside the `<aside>`, which is only rendered while the aside is open; after a mid-flight Cancel the banner is recorded but not visible until the admin reopens any aside. That is acceptable (nothing irreversible is hidden, and the grid shows the tile as BOOKED), and it avoids a second banner region.

- [ ] **Step 6: Run to verify they fail.**

- [ ] **Step 7: Wire into the container**

1. Import `BookPlotFormComponent` into `imports`; import `BookingFormValue`.
2. In the detail block's actions, add the Book button and reason:

```html
              <button type="button" class="brand-button projects-plots__book" [disabled]="sel.status !== 'AVAILABLE'"
                [attr.aria-describedby]="sel.status !== 'AVAILABLE' ? 'book-disabled-reason' : null" (click)="openAside({ kind: 'book' })">
                {{ 'admin.projectsPlots.bookAction' | translate }}
              </button>
```

and directly after the actions `div`:

```html
            <p id="book-disabled-reason" class="projects-plots__reason" *ngIf="sel.status !== 'AVAILABLE'">
              {{ (sel.status === 'BOOKED' ? 'admin.projectsPlots.bookDisabledBooked' : 'admin.projectsPlots.bookDisabledSold') | translate }}
            </p>
```

3. Add the form case to the aside:

```html
          <app-book-plot-form *ngIf="aside.kind === 'book' && selectedPlot" [plot]="selectedPlot" [associates]="associates"
            [emiConfig]="emiConfig" [busy]="busy" (submitted)="submitBooking($event)" (cancelled)="openAside({ kind: 'detail' })"></app-book-plot-form>
```

4. Method:

```ts
  // The request is owned here, not by the form, so cancelling or switching plots mid-flight does
  // not abort it: it completes and the grid refreshes (DESIGN Decision 7).
  submitBooking(v: BookingFormValue): void {
    const plot = this.selectedPlot;
    if (!plot || this.busy) { return; }
    const plotId = plot.plotId;
    this.busy = true;
    this.plotsService.createBooking({
      plotId, associateId: v.associateId, buyerName: v.buyerName, buyerPhone: v.buyerPhone || undefined
    }).subscribe({
      next: booking => {
        this.busy = false;
        this.banner = { tone: 'success', key: 'admin.projectsPlots.banner.booked', params: { no: plot.plotNo, buyer: booking.buyerName }, bookingId: booking.id };
        if (this.aside.kind === 'book' && this.selectedPlotId === plotId) { this.aside = { kind: 'detail' }; }
        this.refreshAfterPlotChange();
      },
      error: (err: HttpErrorResponse) => {
        this.busy = false;
        if (err.status === 409) {
          this.banner = { tone: 'warning', key: 'admin.projectsPlots.error.conflict', params: { no: plot.plotNo } };
          if (this.aside.kind === 'book' && this.selectedPlotId === plotId) { this.aside = { kind: 'detail' }; }
          this.loadGrid();
        } else {
          this.banner = this.errorBanner(err);
        }
      }
    });
  }
```

Also reset `busy` handling: `openAside` must NOT clear `busy` (a request may be in flight).

Add form-field styles to `_admin.scss` inside `.projects-plots`:

```scss
  .book-form { display: flex; flex-direction: column; gap: 1rem; }
  .book-form__label { font: 500 0.6875rem var(--font-mono); letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-muted); }
  .book-form__field, .book-form__total { display: flex; flex-direction: column; gap: 0.375rem; }
  .book-form__preview { margin: 0; padding: 0.625rem 0.75rem; background: var(--surface-raised); border-radius: 8px; font: 500 0.875rem var(--font-mono); }
  .book-form input[aria-invalid='true'] { border-color: var(--status-danger); }
  &__reason { margin: 0; font-size: 0.875rem; color: var(--text-muted); }
```

- [ ] **Step 8: Run `--include='src/app/admin/projects-plots/**/*.spec.ts'`.** Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): book-a-plot form and booking flow with 400/409 handling (unit 11)"
```

---

### Task 8: Responsive layout, final sweep and tracking

**Files:**
- Modify: `src/styles/_admin.scss` (responsive rules)
- Modify: `docs/superpowers/plans/2026-10-01-plot-booking-units.md` — **coordinator only** (see Step 5)

- [ ] **Step 1: Responsive rules** — append inside the `.projects-plots` block (after the Task 4–7 rules), then close with the media queries below at top level:

```scss
@media (max-width: 1279px) {
  .projects-plots__layout { grid-template-columns: 240px minmax(0, 1fr); }
  .projects-plots__aside {
    position: fixed; top: 0; right: 0; bottom: 0; z-index: 40; width: min(400px, 100vw);
    border-radius: 20px 0 0 20px; overflow-y: auto;
  }
  .projects-plots__scrim { display: block; position: fixed; inset: 0; z-index: 30; background: rgba(0, 0, 0, 0.35); }
}
@media (max-width: 1023px) {
  .projects-plots { padding-inline: 1rem; }
  .projects-plots__layout { grid-template-columns: 1fr; }
  .projects-plots__list { display: none; }
  .projects-plots__project-select { display: flex; }
}
@media (max-width: 639px) {
  .projects-plots__tiles, .projects-plots__skeleton { grid-template-columns: repeat(3, 1fr); }
  .projects-plots__aside { width: 100vw; border-radius: 0; }
  .projects-plots .brand-button, .projects-plots__chip { min-height: 44px; }
}
```

- [ ] **Step 2: Full verification**

Run: `npx ng test --watch=false --browsers=ChromeHeadless` → whole suite passes (record the count). Run `npx ng build` → succeeds.

- [ ] **Step 3: Real-app check (per the `run` skill)** — start the stack, log in as admin, open `/settings/projects-plots`, and verify with screenshots at 1440px, 1100px and 600px: list + grid + legend; select an AVAILABLE plot → Book form; blank buyer name shows the error; successful booking turns the tile BOOKED and shows the banner; BOOKED tile shows the disabled Book with the reason; Esc closes the drawer and focus returns to the tile; sidebar shows "Inventory & Bookings → Projects & Plots". Anything off from `screen.png` / `screen-booking-form.png` beyond the documented deviations is a bug to fix, not to note.

- [ ] **Step 4: Commit**

```bash
git add frontend/src
git commit -m "style(frontend): responsive drawer/sheet layout for Projects & Plots (unit 11)"
```

- [ ] **Step 5: Tracking (coordinator, after merge — not the implementer)** — update row 11 of `docs/superpowers/plans/2026-10-01-plot-booking-units.md`: plan path `2026-10-03-plot-booking-unit-11-admin-projects-plots-screen.md`, status `merged`, commit range; add a carry-forward note: shared `plot-tile` + `plot-grid.util.ts` exist (unit 13 reuses), nav category `inventory` exists (unit 12 appends `bookingsEmi` item with path `/settings/bookings-emi`), live tokens used (not violet), `--status-*-text` tokens defined in `_shared-components.scss`.

---

## Self-Review

**Spec coverage** (units file, row 11 acceptance criteria):
- Project list + colour-coded grid from unit 10 → Tasks 1, 2, 4.
- Plot create/edit via existing CRUD → Task 5 (plus CSV import, Task 6, from DESIGN).
- "Book" on `AVAILABLE` plot with associate lookup / `buyerName` / `buyerPhone` calling unit 1's endpoint, surfacing 400/409 → Task 7.
- Admin sidebar entry → Task 4 (`inventory` category; `AdminSidebarComponent` iterates `ADMIN_NAV_CATEGORIES`, so no sidebar code change — confirmed by reading `admin-sidebar.component.ts`).
- Component/service specs, no e2e → every task.
- DESIGN states: loading, no projects, empty project, filter-empty, grid-refresh-failure, long names (CSS wrap via normal flow), EMI off/unreadable, locked edit, double-submit, 409, success banner — all mapped to a test or CSS rule. Not covered by a test: "Long names" (CSS only, checked in Task 8 Step 3) and drawer focus return beyond the `closeAside` focus call (checked in Task 8 Step 3).
- DESIGN items deliberately cut: see Deviations 1–5.

**Placeholder scan:** none. The CSV template link mirrors `projects-step.component.ts:252` exactly.

**Type consistency:** `PlotGridItem`/`PlotBlock`/`StatusCounts` (Task 1) match their uses in Tasks 2, 4, 7. `BookingFormValue` produced by Task 7's form is consumed by `submitBooking` with the same fields. Container members listed in Task 4's Interfaces (`aside`, `banner`, `busy` added in Task 5, `refreshAfterPlotChange` added in Task 5 and used in Tasks 6–7) are all defined before use. `reloadProjects()` without an argument keeps selection and does not refetch the grid — relied on by the Task 5/6/7 specs that expect exactly one grid request.

**Known risk to watch in execution:** `blockSummary()` in Task 4 is O(n) per block per change-detection pass; fine at the ~5,000-plot ceiling unit 10 documents only because `visibleBlocks` is small. If the Task 8 real-app check shows jank, precompute in `rebuild()` (noted inline in Task 4).
