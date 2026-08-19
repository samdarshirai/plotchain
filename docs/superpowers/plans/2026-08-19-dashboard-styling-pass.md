# Dashboard Full Styling Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give all 10 dashboard widgets (the 9 original ones plus the identity header) real card chrome, spacing, and this app's brand visual language — closing the single largest visible gap against the reference (`frontend/src/app/dashboard/` currently ships zero `styles`/`styleUrl` anywhere, every widget is an unstyled `<div>`).

**Architecture:** This app does not use per-component `styleUrl`s for route content — `frontend/src/styles.scss` is a single global stylesheet that `@use`s one hand-authored partial per route tree (`_admin.scss`, `_setup.scss`, `_settings.scss`, plus shared primitives in `_cards.scss`/`_shared-components.scss`), each targeting the plain CSS classes its components already render. This plan follows that exact convention: a new `frontend/src/styles/_dashboard.scss` partial, registered in `styles.scss`, targeting the classes already on (or added to) the 10 widget templates. Most widgets need only one added class — `card` — reusing `_cards.scss`'s existing `.card` primitive (the same `class="widget-name card"` composition already used by `profile-kyc`, `sales-history`, `rewards`, `digital-id-card`, and others). Three widgets get more: `cycle-income-card` becomes this app's dashboard-specific Seal Card (`DESIGN.md` §5: *"A Parchment (or Ink, on the dashboard) card... used for exactly one thing per screen: current-cycle earnings on the dashboard"* — literal, named example), reusing the `.seal-card`/`.seal-card__*` classes and keyframes already defined in `_setup.scss` for `company-profile-step` (explicitly documented there as *"a shared class... so future screens — dashboard earnings... — can adopt it without new CSS"*); `leg-volume-gauge` and `team-snapshot` migrate their metric rows to `shared/components/stat-tile` (spec §3.2's explicit instruction), each metric's existing test-queried class moving onto the `<app-stat-tile>` host element itself so no test file changes are needed anywhere in this plan.

**Tech Stack:** Angular 18 standalone components, SCSS (Sass `@use` modules), `@ngx-translate/core`, Jasmine/Karma.

**Spec:** `docs/superpowers/specs/2026-08-17-associate-dashboard-parity-design.md` §2 (*"a full CSS pass giving all 9 existing widgets plus the new header actual card chrome, spacing, and color — not a pixel clone of the reference's dark/gold theme, but this app's own visual language... reusing `shared/components/stat-tile` where it already fits rather than inventing a second tile component"*) and §3.2's Styling paragraph. Brand system: `DESIGN.md` (repo root) §2 (Color), §3 (Typography), §5 (Seal Card), §9 (Do/Don't).

## Global Constraints

- This app has no per-component `styleUrl`/`styles` convention for route content — do not add one. All CSS in this plan lives in one new global partial, `frontend/src/styles/_dashboard.scss`, registered via `@use 'styles/dashboard';` in `frontend/src/styles.scss` (append after the existing `@use 'styles/settings';` line, matching the file's route-tree-partial-per-line pattern).
- No widget's existing CSS classes may be renamed or removed — every existing Jasmine test in `frontend/src/app/dashboard/` queries the DOM by one of these classes (`.kyc-banner`, `.sponsor-matching`, `.leg-carried-forward.left`, `.left-associates`, etc.); this plan is styling-and-markup-restructuring only, never a test change. Read each affected `.component.spec.ts` before touching its `.component.ts` — this plan's own tasks already did this and call out the exact constraint each file's tests impose; do not skip that check when the code differs from what a task expects.
- No new UI copy renders without both an English (`frontend/src/assets/i18n/en.json`) and Hindi (`frontend/src/assets/i18n/hi.json`) key — this plan adds exactly four new keys (`dashboard.cycleIncomeEyebrow`, `dashboard.totalDownlineLabel`, `dashboard.activeTodayLabel`, `dashboard.newJoinsLabel`), each task below gives the exact key/value pair for both files.
- `dashboard.component.spec.ts`'s `renders all nine widgets in the spec-mandated stat-first order` test asserts `.dashboard > *` maps to an exact list of tag names, in order. CSS Grid does not care about a child's own `display` value — an unstyled custom element becomes a grid item automatically — so `.dashboard { display: grid; ... }` needs no markup change. Never wrap a widget's host tag in an extra `<div>` inside `dashboard.component.ts`'s own template; that would insert a `div` into `.dashboard > *` and break this test. (Wrapping *inside* a widget's own template, e.g. `leg-volume-gauge`'s new `__bar`/`__tiles` sub-containers, is unaffected — that test only inspects `.dashboard`'s immediate children, not further down.)
- Reuse existing shared primitives before writing new CSS: `.card`/`.card-title`/`.card-subtitle` (`_cards.scss`), `.inline-banner`/`.inline-banner--warning` (`_shared-components.scss`), `app-stat-tile` (`shared/components/stat-tile`), `.seal-card`/`.seal-card__*` (`_setup.scss`, global despite the filename). This plan's own task breakdown was designed around maximizing that reuse — do not reintroduce a bespoke card/tile/banner shape a task doesn't call for.
- Color/spacing/type tokens only — no literal hex colors, no arbitrary pixel values invented ad hoc. Every value in this plan's CSS comes from `frontend/src/styles/_tokens.scss`'s custom properties (`--surface-card`, `--border-subtle`, `--text-primary`, `--text-muted`, `--brand-primary`, `--brand-gradient`, `--radius-sm`, `--font-display`, etc.) or matches an existing sibling partial's own literal (e.g. `_shared-components.scss`'s `1px`/`0.875rem` spacing scale).
- "Tests" for a pure-styling task means the existing Jasmine spec for that widget still passes unmodified, plus the full frontend suite has no new failures. There is no new behavior to TDD in most tasks here — each task's steps say so explicitly and skip the usual "write a failing test first" step where nothing new is being asserted.

---

### Task 1: Foundation — `_dashboard.scss` partial, shell grid, `.dashboard-error`

**Files:**
- Create: `frontend/src/styles/_dashboard.scss`
- Modify: `frontend/src/styles.scss`

**Interfaces:**
- Produces: the `styles/dashboard` Sass module other tasks' CSS additions land in (each later task appends its own section to this same file — this task creates it with only the shell-level rules). No component files touched.

- [ ] **Step 1: Create the partial with the shell grid and error banner**

Create `frontend/src/styles/_dashboard.scss`:

```scss
// Dashboard-scoped design language (docs/superpowers/specs/2026-08-17-associate-dashboard-parity-design.md
// §2: "this spec's frontend work introduces one [design token set] scoped to dashboard/, reusing
// shared/components/stat-tile where it already fits"). Not per-component styleUrls -- this app's
// route-content convention is one global partial per route tree (see _admin.scss/_setup.scss/
// _settings.scss), targeting the plain classes each widget's template already renders.

.dashboard {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.25rem;
  max-width: 1200px;
  margin: 0 auto;
  padding: 1.5rem;
}

// Horizontal banners/strips span the full grid width; stat-card-shaped widgets (identity header
// is itself banner-shaped, not tile-shaped, hence its inclusion here) auto-place into the grid's
// columns below.
.dashboard > app-associate-identity-header,
.dashboard > app-kyc-banner,
.dashboard > app-quick-actions,
.dashboard > app-cycle-countdown,
.dashboard > app-announcements-strip {
  grid-column: 1 / -1;
}

.dashboard-error {
  margin: 1.5rem;
  padding: 1rem 1.25rem;
  border: 1px solid var(--status-danger);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--status-danger) 10%, var(--surface-card));
  color: var(--status-danger);
  font-size: 0.875rem;
}
```

- [ ] **Step 2: Register the partial**

In `frontend/src/styles.scss`, currently:

```scss
@use 'styles/tokens';
@use 'styles/reset';
@use 'styles/forms';
@use 'styles/buttons';
@use 'styles/cards';
@use 'styles/tables';
@use 'styles/app-shell';
@use 'styles/shared-components';
@use 'styles/admin';
@use 'styles/setup';
@use 'styles/settings';

@import 'material-symbols/outlined.css';
```

change to:

```scss
@use 'styles/tokens';
@use 'styles/reset';
@use 'styles/forms';
@use 'styles/buttons';
@use 'styles/cards';
@use 'styles/tables';
@use 'styles/app-shell';
@use 'styles/shared-components';
@use 'styles/admin';
@use 'styles/setup';
@use 'styles/settings';
@use 'styles/dashboard';

@import 'material-symbols/outlined.css';
```

- [ ] **Step 3: Build and confirm no Sass errors**

Run: `cd frontend && npx ng build --configuration development 2>&1 | tail -40`
Expected: build succeeds, no Sass compile errors. (A build, not a test run — this step exists purely to catch a Sass syntax mistake before any later task's component changes are dispatched on top of it.)

- [ ] **Step 4: Run the full frontend test suite**

Run: `cd frontend && npx ng test --watch=false`
Expected: same pass count as before this change — a CSS-only, no-markup-touched change cannot move any test.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/styles/_dashboard.scss frontend/src/styles.scss
git commit -m "feat(dashboard): add dashboard styling partial with shell grid layout"
```

---

### Task 2: Six small widgets — card chrome via the existing `.card`/`.inline-banner` primitives

**Files:**
- Modify: `frontend/src/app/dashboard/widgets/kyc-banner/kyc-banner.component.ts`
- Modify: `frontend/src/app/dashboard/widgets/wallet-card/wallet-card.component.ts`
- Modify: `frontend/src/app/dashboard/widgets/quick-actions/quick-actions.component.ts`
- Modify: `frontend/src/app/dashboard/widgets/cycle-countdown/cycle-countdown.component.ts`
- Modify: `frontend/src/app/dashboard/widgets/announcements-strip/announcements-strip.component.ts`
- Modify: `frontend/src/app/dashboard/widgets/rank-progress/rank-progress.component.ts`
- Modify: `frontend/src/styles/_dashboard.scss` (append)

**Interfaces:**
- Consumes: Task 1's `_dashboard.scss` file (this task appends new sections to it) and the shell grid it defines (these six widgets' host tags are exactly the ones Task 1 already grid-columned).
- Produces: nothing new consumed by later tasks — these six widgets are independent leaves.

Six small, same-shape edits: add a class to each widget's existing root element, append that widget's CSS rules to `_dashboard.scss`. No test file in this task's scope needs any change — verify this as you go by re-reading each spec file's assertions before editing its component (they're quoted below so you don't have to, but confirm the live file still matches before assuming the edit is safe).

- [ ] **Step 1: `kyc-banner` — reuse `.inline-banner`/`.inline-banner--warning`, no new CSS**

`kyc-banner.component.spec.ts` only asserts presence/absence of `.kyc-banner` (`querySelector('.kyc-banner')` truthy/falsy) — adding classes alongside it is safe, removing it is not.

In `frontend/src/app/dashboard/widgets/kyc-banner/kyc-banner.component.ts`, currently:

```typescript
  template: `<div class="kyc-banner" *ngIf="visible">{{ 'dashboard.kycBanner' | translate }}</div>`
```

change to:

```typescript
  template: `<div class="kyc-banner inline-banner inline-banner--warning" *ngIf="visible">{{ 'dashboard.kycBanner' | translate }}</div>`
```

No `_dashboard.scss` addition for this widget — `.inline-banner`/`.inline-banner--warning` are already fully styled in `_shared-components.scss`.

- [ ] **Step 2: `wallet-card` — card chrome, large balance figure**

`wallet-card.component.spec.ts` asserts: full-page text contains the formatted balance; `querySelector('.withdraw-action')` and `querySelector('a')` are both `null` (associates get no self-service withdrawal link — do not add an `<a>` anywhere in this template); `.withdraw-info` exists with non-empty text.

In `frontend/src/app/dashboard/widgets/wallet-card/wallet-card.component.ts`, currently:

```typescript
  template: `
    <div class="wallet-card">
      <span class="balance">{{ balance | currency:'INR' }}</span>
      <p class="withdraw-info">{{ 'dashboard.withdrawContactAdmin' | translate }}</p>
    </div>
  `
```

change to:

```typescript
  template: `
    <div class="wallet-card card">
      <span class="balance">{{ balance | currency:'INR' }}</span>
      <p class="withdraw-info">{{ 'dashboard.withdrawContactAdmin' | translate }}</p>
    </div>
  `
```

Append to `frontend/src/styles/_dashboard.scss`:

```scss
.wallet-card {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  align-items: flex-start;
}

.wallet-card .balance {
  font-family: var(--font-display);
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--brand-primary);
}

.wallet-card .withdraw-info {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--text-muted);
}
```

- [ ] **Step 3: `quick-actions` — card chrome**

`quick-actions.component.spec.ts` asserts: no `.record-sale`, no `.add-referral`, no `<a>` anywhere; `.quick-actions-empty` exists with non-empty text.

In `frontend/src/app/dashboard/widgets/quick-actions/quick-actions.component.ts`, currently:

```typescript
  template: `
    <div class="quick-actions">
      <p class="quick-actions-empty">{{ 'dashboard.quickActionsContactAdmin' | translate }}</p>
    </div>
  `
```

change to:

```typescript
  template: `
    <div class="quick-actions card">
      <p class="quick-actions-empty">{{ 'dashboard.quickActionsContactAdmin' | translate }}</p>
    </div>
  `
```

Append to `frontend/src/styles/_dashboard.scss`:

```scss
.quick-actions {
  display: flex;
  align-items: center;
}

.quick-actions .quick-actions-empty {
  margin: 0;
  font-size: 0.875rem;
  color: var(--text-muted);
}
```

- [ ] **Step 4: `cycle-countdown` — card chrome**

`cycle-countdown.component.spec.ts` only asserts full-page text contains the days-remaining number.

In `frontend/src/app/dashboard/widgets/cycle-countdown/cycle-countdown.component.ts`, currently:

```typescript
  template: `<div class="cycle-countdown">{{ 'dashboard.cycleCloses' | translate: { days: data.daysRemaining } }}</div>`
```

change to:

```typescript
  template: `<div class="cycle-countdown card">{{ 'dashboard.cycleCloses' | translate: { days: data.daysRemaining } }}</div>`
```

Append to `frontend/src/styles/_dashboard.scss`:

```scss
.cycle-countdown {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--brand-primary);
  text-align: center;
}
```

- [ ] **Step 5: `announcements-strip` — card chrome, per-row divider**

`announcements-strip.component.spec.ts` asserts: with announcements present, `.announcements-strip` exists and exactly one `.announcement` per item; with an empty array, `.announcements-strip` is `null` **and `fixture.nativeElement.textContent.trim()` is the empty string** — the existing `*ngIf="announcements.length"` gate on the outer div already guarantees this; do not add any markup outside that `*ngIf`.

In `frontend/src/app/dashboard/widgets/announcements-strip/announcements-strip.component.ts`, currently:

```typescript
  template: `
    <div class="announcements-strip" *ngIf="announcements.length">
      <div class="announcement" *ngFor="let a of announcements">{{ a.title }}</div>
    </div>
  `
```

change to:

```typescript
  template: `
    <div class="announcements-strip card" *ngIf="announcements.length">
      <div class="announcement" *ngFor="let a of announcements">{{ a.title }}</div>
    </div>
  `
```

Append to `frontend/src/styles/_dashboard.scss`:

```scss
.announcements-strip {
  display: flex;
  flex-direction: column;
}

.announcement {
  padding: 0.625rem 0;
  border-bottom: 1px solid var(--border-subtle);
  font-size: 0.875rem;
  color: var(--text-primary);
}

.announcement:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.announcement:first-child {
  padding-top: 0;
}
```

- [ ] **Step 6: `rank-progress` — card chrome, styled progress track/fill**

`rank-progress.component.spec.ts` asserts: full-page text contains the current and next rank names; `querySelector('.progress-fill').style.width` is **exactly** `'40%'` for a `progressPercent: 40` fixture — the `[style.width.%]="data.progressPercent"` binding must not change.

In `frontend/src/app/dashboard/widgets/rank-progress/rank-progress.component.ts`, currently:

```typescript
  template: `
    <div class="rank-progress">
      <div class="current-rank">{{ data.currentRank }}</div>
      <div class="progress-bar"><div class="progress-fill" [style.width.%]="data.progressPercent"></div></div>
      <div class="next-rank" *ngIf="data.nextRank">
        {{ 'dashboard.nextRank' | translate }}: {{ data.nextRank }} ({{ data.progressPercent }}%)
      </div>
    </div>
  `
```

change to:

```typescript
  template: `
    <div class="rank-progress card">
      <div class="current-rank">{{ data.currentRank }}</div>
      <div class="progress-bar"><div class="progress-fill" [style.width.%]="data.progressPercent"></div></div>
      <div class="next-rank" *ngIf="data.nextRank">
        {{ 'dashboard.nextRank' | translate }}: {{ data.nextRank }} ({{ data.progressPercent }}%)
      </div>
    </div>
  `
```

Append to `frontend/src/styles/_dashboard.scss`:

```scss
.rank-progress .current-rank {
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 0.75rem;
}

.rank-progress .progress-bar {
  height: 0.5rem;
  border-radius: 999px;
  background: var(--surface-raised);
  overflow: hidden;
}

.rank-progress .progress-fill {
  height: 100%;
  background: var(--brand-gradient);
  border-radius: 999px;
  transition: width 0.3s ease;
}

.rank-progress .next-rank {
  margin-top: 0.625rem;
  font-size: 0.8125rem;
  color: var(--text-muted);
}
```

- [ ] **Step 7: Run each touched widget's own spec**

Run: `cd frontend && npx ng test --watch=false --include='**/kyc-banner.component.spec.ts' --include='**/wallet-card.component.spec.ts' --include='**/quick-actions.component.spec.ts' --include='**/cycle-countdown.component.spec.ts' --include='**/announcements-strip.component.spec.ts' --include='**/rank-progress.component.spec.ts'`
Expected: all PASS, unchanged from before this task.

- [ ] **Step 8: Run the full frontend test suite**

Run: `cd frontend && npx ng test --watch=false`
Expected: same pass count as before this task.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app/dashboard/widgets/kyc-banner/kyc-banner.component.ts \
        frontend/src/app/dashboard/widgets/wallet-card/wallet-card.component.ts \
        frontend/src/app/dashboard/widgets/quick-actions/quick-actions.component.ts \
        frontend/src/app/dashboard/widgets/cycle-countdown/cycle-countdown.component.ts \
        frontend/src/app/dashboard/widgets/announcements-strip/announcements-strip.component.ts \
        frontend/src/app/dashboard/widgets/rank-progress/rank-progress.component.ts \
        frontend/src/styles/_dashboard.scss
git commit -m "feat(dashboard): style kyc-banner, wallet-card, quick-actions, cycle-countdown, announcements-strip, rank-progress"
```

---

### Task 3: Associate identity header — avatar circle, Fraunces name

**Files:**
- Modify: `frontend/src/app/dashboard/widgets/associate-identity-header/associate-identity-header.component.ts`
- Modify: `frontend/src/styles/_dashboard.scss` (append)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new consumed by later tasks.

`associate-identity-header.component.spec.ts` asserts: full-page text contains associate ID/name/rank/phone; `.associate-identity-header__rank-changed` exists only when `rankChangedAt` is set; `.associate-identity-header__avatar`'s **exact trimmed textContent** is `'AK'` (two words) or `'A'` (one word) — the avatar element must render only the initials text, no icon or extra markup inside it; `.associate-identity-header__phone` is absent when `phone` is `null`. All of these are already true of the current template — this task only adds CSS, no markup change is needed to satisfy any of them.

- [ ] **Step 1: Add the `card` class and CSS**

In `frontend/src/app/dashboard/widgets/associate-identity-header/associate-identity-header.component.ts`, currently:

```typescript
  template: `
    <div class="associate-identity-header">
      <span class="associate-identity-header__avatar">{{ initials }}</span>
```

change to:

```typescript
  template: `
    <div class="associate-identity-header card">
      <span class="associate-identity-header__avatar">{{ initials }}</span>
```

(The rest of the template — `__details`, `__id`, `__name`, `__rank`, `__phone`, `__joined`, `__rank-changed` — is unchanged.)

Append to `frontend/src/styles/_dashboard.scss`:

```scss
.associate-identity-header {
  display: flex;
  align-items: center;
  gap: 1.25rem;
}

.associate-identity-header__avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3.5rem;
  height: 3.5rem;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--brand-gradient);
  color: var(--brand-primary-contrast);
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 700;
}

.associate-identity-header__details {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.associate-identity-header__name {
  font-family: var(--font-display);
  font-size: 1.375rem;
  font-weight: 700;
  color: var(--text-primary);
}

.associate-identity-header__id,
.associate-identity-header__rank {
  font-size: 0.875rem;
  color: var(--text-muted);
}

.associate-identity-header__phone,
.associate-identity-header__joined,
.associate-identity-header__rank-changed {
  font-size: 0.8125rem;
  color: var(--text-muted);
}
```

- [ ] **Step 2: Run this widget's spec**

Run: `cd frontend && npx ng test --watch=false --include='**/associate-identity-header.component.spec.ts'`
Expected: all PASS, unchanged from before this task.

- [ ] **Step 3: Run the full frontend test suite**

Run: `cd frontend && npx ng test --watch=false`
Expected: same pass count as before this task.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/dashboard/widgets/associate-identity-header/associate-identity-header.component.ts frontend/src/styles/_dashboard.scss
git commit -m "feat(dashboard): style associate identity header with avatar and Fraunces name"
```

---

### Task 4: Cycle income card — the dashboard's Seal Card

**Files:**
- Modify: `frontend/src/app/dashboard/widgets/cycle-income-card/cycle-income-card.component.ts`
- Modify: `frontend/src/assets/i18n/en.json`
- Modify: `frontend/src/assets/i18n/hi.json`

**Interfaces:**
- Consumes: the global `.seal-card`/`.seal-card__*` classes and `sealDrawTop`/`sealDrawBottom` keyframes already defined in `frontend/src/styles/_setup.scss` (no new CSS needed for this task — that file's own comment documents them as a shared, cross-screen class precisely for this use).
- Produces: nothing new consumed by later tasks.

**Design note (why this widget diverges from spec §3.2's literal "stat-tile for the income widget" instruction):** `DESIGN.md` §5 names *"current-cycle earnings on the dashboard"* as one of exactly three named Seal Card usages system-wide, and explicitly permits the dashboard's own Seal Card to be a full Ink surface (*"A Parchment (or Ink, on the dashboard) card"*) — unlike every other Seal Card usage, which stays Parchment. `shared/components/stat-tile` is styled for a light `--surface-card` background; nesting light stat-tile cards inside a full-Ink seal card fights `DESIGN.md` §9's *"Don't let Ink chrome creep into content areas"* and §5's *"restrict it on purpose"* framing in the opposite direction (light islands inside dark chrome reads as visual noise, not restraint). This task instead gives `cycle-income-card` the complete Seal Card treatment — hero figure plus supporting detail rows, mirroring `company-profile-step`'s own working seal card structure exactly — and leaves the stat-tile instruction to Task 5's `leg-volume-gauge`/`team-snapshot`, which stay ordinary Parchment cards where stat-tile's own styling fits naturally.

`cycle-income-card.component.spec.ts` asserts: full-page text contains `'1,000'`/`'500'`/`'2,400'`; `.sponsor-matching` and `.self-performance` each exist with their own value text (`'300'`/`'200'`); `.royalty` exists and contains both `'400'` and `'3'` (the bonus amount and its percentage); `.cycle-income-card` is the anchor element itself and its `href` contains `/income-statement`. Every one of these classes must survive this restructure.

- [ ] **Step 1: Add the new i18n key**

In `frontend/src/assets/i18n/en.json`, inside the `"dashboard"` object, currently:

```json
    "royalty": "Royalty Bonus",
    "total": "Total",
    "projectedMatch": "Will match at cycle close",
```

change to:

```json
    "royalty": "Royalty Bonus",
    "total": "Total",
    "cycleIncomeEyebrow": "This Cycle's Earnings",
    "projectedMatch": "Will match at cycle close",
```

In `frontend/src/assets/i18n/hi.json`, inside the `"dashboard"` object, currently:

```json
    "royalty": "रॉयल्टी बोनस",
    "total": "कुल",
    "projectedMatch": "साइकिल बंद होने पर मिलान होगा",
```

change to:

```json
    "royalty": "रॉयल्टी बोनस",
    "total": "कुल",
    "cycleIncomeEyebrow": "इस साइकिल की कमाई",
    "projectedMatch": "साइकिल बंद होने पर मिलान होगा",
```

- [ ] **Step 2: Restructure the template as a Seal Card**

In `frontend/src/app/dashboard/widgets/cycle-income-card/cycle-income-card.component.ts`, currently:

```typescript
  template: `
    <a class="cycle-income-card" [routerLink]="['/income-statement']" [queryParams]="{ cycleId: data.cycleId }">
      <div class="direct">{{ 'dashboard.direct' | translate }}: {{ data.directIncome | currency:'INR' }}</div>
      <div class="matching">{{ 'dashboard.matching' | translate }}: {{ data.matchingIncome | currency:'INR' }}</div>
      <div class="sponsor-matching">{{ 'dashboard.sponsorMatching' | translate }}: {{ data.sponsorMatchingIncome | currency:'INR' }}</div>
      <div class="self-performance">{{ 'dashboard.selfPerformance' | translate }}: {{ data.selfPerformanceBonus | currency:'INR' }}</div>
      <div class="royalty">{{ 'dashboard.royalty' | translate }} ({{ data.royaltyBonusPct }}%): {{ data.royaltyBonus | currency:'INR' }}</div>
      <div class="total">{{ 'dashboard.total' | translate }}: {{ data.totalIncome | currency:'INR' }}</div>
    </a>
  `
```

change to:

```typescript
  template: `
    <a class="cycle-income-card seal-card" [routerLink]="['/income-statement']" [queryParams]="{ cycleId: data.cycleId }">
      <div class="seal-card__hairline seal-card__hairline--top"></div>
      <div class="seal-card__body">
        <div class="seal-card__header">
          <span class="seal-card__header-rule"></span>
          <span class="seal-card__header-label">{{ 'dashboard.cycleIncomeEyebrow' | translate }}</span>
          <span class="seal-card__header-rule"></span>
        </div>
        <h2 class="total seal-card__figure">{{ data.totalIncome | currency:'INR' }}</h2>
        <p class="seal-card__legal">{{ 'dashboard.total' | translate }}</p>
        <div class="seal-card__details">
          <p class="direct">{{ 'dashboard.direct' | translate }}: {{ data.directIncome | currency:'INR' }}</p>
          <p class="matching">{{ 'dashboard.matching' | translate }}: {{ data.matchingIncome | currency:'INR' }}</p>
          <p class="sponsor-matching">{{ 'dashboard.sponsorMatching' | translate }}: {{ data.sponsorMatchingIncome | currency:'INR' }}</p>
          <p class="self-performance">{{ 'dashboard.selfPerformance' | translate }}: {{ data.selfPerformanceBonus | currency:'INR' }}</p>
          <p class="royalty">{{ 'dashboard.royalty' | translate }} ({{ data.royaltyBonusPct }}%): {{ data.royaltyBonus | currency:'INR' }}</p>
        </div>
      </div>
      <div class="seal-card__hairline seal-card__hairline--bottom"></div>
    </a>
  `
```

- [ ] **Step 3: Run this widget's spec**

Run: `cd frontend && npx ng test --watch=false --include='**/cycle-income-card.component.spec.ts'`
Expected: all PASS, unchanged from before this task.

- [ ] **Step 4: Confirm i18n key parity**

Run: `cd frontend && node -e "
const en = require('./src/assets/i18n/en.json');
const hi = require('./src/assets/i18n/hi.json');
function keys(o,p=''){let r=[];for(const k in o){const kp=p?p+'.'+k:k; if(typeof o[k]==='object') r=r.concat(keys(o[k],kp)); else r.push(kp);} return r;}
const ek=keys(en).sort(), hk=keys(hi).sort();
console.log('en', ek.length, 'hi', hk.length);
console.log('missing in hi:', ek.filter(k=>!hk.includes(k)));
console.log('missing in en:', hk.filter(k=>!ek.includes(k)));
"`
Expected: `en` and `hi` counts equal, both "missing" lists empty.

- [ ] **Step 5: Run the full frontend test suite**

Run: `cd frontend && npx ng test --watch=false`
Expected: same pass count as before this task.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/dashboard/widgets/cycle-income-card/cycle-income-card.component.ts frontend/src/assets/i18n/en.json frontend/src/assets/i18n/hi.json
git commit -m "feat(dashboard): give cycle income card the dashboard's Seal Card treatment"
```

---

### Task 5: Leg volume gauge + Team snapshot — migrate metric cells to `shared/components/stat-tile`

**Files:**
- Modify: `frontend/src/app/dashboard/widgets/leg-volume-gauge/leg-volume-gauge.component.ts`
- Modify: `frontend/src/app/dashboard/widgets/team-snapshot/team-snapshot.component.ts`
- Modify: `frontend/src/assets/i18n/en.json`
- Modify: `frontend/src/assets/i18n/hi.json`
- Modify: `frontend/src/styles/_dashboard.scss` (append)

**Interfaces:**
- Consumes: `shared/components/stat-tile`'s `StatTileComponent` (`frontend/src/app/shared/components/stat-tile/stat-tile.component.ts`) — `[label]` and `[value]` are both required `string` inputs; every value below is either already piped to a string (`currency`/`number`) or explicitly `.toString()`'d.
- Produces: nothing new consumed by later tasks — this is the plan's last task.

Both widgets keep every existing test-queried class, moved onto the `<app-stat-tile>` host element itself (a class on a custom element's host tag is exactly as queryable via `querySelector` as a class on a plain `div`, and a compound selector like `.leg-carried-forward.left` matches an element carrying both classes regardless of what tag it is).

- [ ] **Step 1: `leg-volume-gauge` — bar stays custom flex, four metric rows become stat-tiles**

`leg-volume-gauge.component.spec.ts` asserts: full-page text contains `'3,000'`/`'2,000'`/`'140'`; `.leg-carried-forward.left`/`.right` each contain their own value (`'500'`/`'1,000'`); `.leg-total-business.left`/`.right` each contain their own value (`'300,000'`/`'200,000'`); `.new-booked-area` contains `'450'`. None of these reference `.leg.left`/`.leg.right` directly (only via full-page text), so those two stay as they are — a two-segment flex bar, not stat-tiles (their `[style.flex]` binding is a layout mechanic stat-tile has no input for).

In `frontend/src/app/dashboard/widgets/leg-volume-gauge/leg-volume-gauge.component.ts`, currently:

```typescript
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { LegVolumeSummary } from '../../models/dashboard-response.model';

@Component({
  selector: 'app-leg-volume-gauge',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="leg-volume-gauge">
      <div class="leg left" [style.flex]="data.leftVolume || 1">{{ 'dashboard.leftLeg' | translate }}: {{ data.leftVolume | currency:'INR' }}</div>
      <div class="leg right" [style.flex]="data.rightVolume || 1">{{ 'dashboard.rightLeg' | translate }}: {{ data.rightVolume | currency:'INR' }}</div>
      <div class="leg-carried-forward left">{{ 'dashboard.carriedForward' | translate }} ({{ 'dashboard.leftLeg' | translate }}): {{ data.carriedForwardLeft | currency:'INR' }}</div>
      <div class="leg-carried-forward right">{{ 'dashboard.carriedForward' | translate }} ({{ 'dashboard.rightLeg' | translate }}): {{ data.carriedForwardRight | currency:'INR' }}</div>
      <div class="leg-total-business left">{{ 'dashboard.totalBusiness' | translate }} ({{ 'dashboard.leftLeg' | translate }}): {{ data.totalLeftBusiness | currency:'INR' }}</div>
      <div class="leg-total-business right">{{ 'dashboard.totalBusiness' | translate }} ({{ 'dashboard.rightLeg' | translate }}): {{ data.totalRightBusiness | currency:'INR' }}</div>
      <div class="new-booked-area">{{ 'dashboard.newBookedArea' | translate }}: {{ data.newBookedAreaSqft | number }} sqft</div>
      <div class="projected-match">{{ 'dashboard.projectedMatch' | translate }}: {{ data.projectedMatchAmount | currency:'INR' }}</div>
    </div>
  `
})
export class LegVolumeGaugeComponent {
  @Input({ required: true }) data!: LegVolumeSummary;
}
```

change to:

```typescript
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { StatTileComponent } from '../../../shared/components/stat-tile/stat-tile.component';
import { LegVolumeSummary } from '../../models/dashboard-response.model';

@Component({
  selector: 'app-leg-volume-gauge',
  standalone: true,
  imports: [CommonModule, TranslateModule, StatTileComponent],
  template: `
    <div class="leg-volume-gauge card">
      <div class="leg-volume-gauge__bar">
        <div class="leg left" [style.flex]="data.leftVolume || 1">{{ 'dashboard.leftLeg' | translate }}: {{ data.leftVolume | currency:'INR' }}</div>
        <div class="leg right" [style.flex]="data.rightVolume || 1">{{ 'dashboard.rightLeg' | translate }}: {{ data.rightVolume | currency:'INR' }}</div>
      </div>
      <div class="leg-volume-gauge__tiles">
        <app-stat-tile class="leg-carried-forward left" [label]="('dashboard.carriedForward' | translate) + ' (' + ('dashboard.leftLeg' | translate) + ')'" [value]="data.carriedForwardLeft | currency:'INR'"></app-stat-tile>
        <app-stat-tile class="leg-carried-forward right" [label]="('dashboard.carriedForward' | translate) + ' (' + ('dashboard.rightLeg' | translate) + ')'" [value]="data.carriedForwardRight | currency:'INR'"></app-stat-tile>
        <app-stat-tile class="leg-total-business left" [label]="('dashboard.totalBusiness' | translate) + ' (' + ('dashboard.leftLeg' | translate) + ')'" [value]="data.totalLeftBusiness | currency:'INR'"></app-stat-tile>
        <app-stat-tile class="leg-total-business right" [label]="('dashboard.totalBusiness' | translate) + ' (' + ('dashboard.rightLeg' | translate) + ')'" [value]="data.totalRightBusiness | currency:'INR'"></app-stat-tile>
        <app-stat-tile class="new-booked-area" [label]="'dashboard.newBookedArea' | translate" [value]="(data.newBookedAreaSqft | number) + ' sqft'"></app-stat-tile>
        <app-stat-tile class="projected-match" [label]="'dashboard.projectedMatch' | translate" [value]="data.projectedMatchAmount | currency:'INR'"></app-stat-tile>
      </div>
    </div>
  `
})
export class LegVolumeGaugeComponent {
  @Input({ required: true }) data!: LegVolumeSummary;
}
```

- [ ] **Step 2: `team-snapshot` — all five fields become stat-tiles**

`team-snapshot.component.spec.ts` asserts: full-page text contains `'12'`/`'3'`/`'2'` (downline/active/new-joins); `.left-associates`/`.right-associates` each contain their own value (`'7'`/`'5'`). This widget currently has no i18n labels at all on `totalDownline`/`activeToday`/`newJoinsThisCycle` — `stat-tile`'s `label` input is required, so this task adds the three missing labels as new i18n keys (`leftAssociates`/`rightAssociates` already have keys from the prior unit).

In `frontend/src/app/dashboard/widgets/team-snapshot/team-snapshot.component.ts`, currently:

```typescript
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { TeamSnapshot } from '../../models/dashboard-response.model';

@Component({
  selector: 'app-team-snapshot',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="team-snapshot">
      <div class="total-downline">{{ data.totalDownline }}</div>
      <div class="active-today">{{ data.activeToday }}</div>
      <div class="new-joins">{{ data.newJoinsThisCycle }}</div>
      <div class="left-associates">{{ 'dashboard.leftLegAssociates' | translate }}: {{ data.leftAssociates }}</div>
      <div class="right-associates">{{ 'dashboard.rightLegAssociates' | translate }}: {{ data.rightAssociates }}</div>
    </div>
  `
})
export class TeamSnapshotComponent {
  @Input({ required: true }) data!: TeamSnapshot;
}
```

change to:

```typescript
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { StatTileComponent } from '../../../shared/components/stat-tile/stat-tile.component';
import { TeamSnapshot } from '../../models/dashboard-response.model';

@Component({
  selector: 'app-team-snapshot',
  standalone: true,
  imports: [CommonModule, TranslateModule, StatTileComponent],
  template: `
    <div class="team-snapshot card">
      <app-stat-tile class="total-downline" [label]="'dashboard.totalDownlineLabel' | translate" [value]="data.totalDownline.toString()"></app-stat-tile>
      <app-stat-tile class="active-today" [label]="'dashboard.activeTodayLabel' | translate" [value]="data.activeToday.toString()"></app-stat-tile>
      <app-stat-tile class="new-joins" [label]="'dashboard.newJoinsLabel' | translate" [value]="data.newJoinsThisCycle.toString()"></app-stat-tile>
      <app-stat-tile class="left-associates" [label]="'dashboard.leftLegAssociates' | translate" [value]="data.leftAssociates.toString()"></app-stat-tile>
      <app-stat-tile class="right-associates" [label]="'dashboard.rightLegAssociates' | translate" [value]="data.rightAssociates.toString()"></app-stat-tile>
    </div>
  `
})
export class TeamSnapshotComponent {
  @Input({ required: true }) data!: TeamSnapshot;
}
```

- [ ] **Step 3: Add the three new i18n keys**

In `frontend/src/assets/i18n/en.json`, inside the `"dashboard"` object, currently:

```json
    "leftLegAssociates": "Left Leg Associates",
    "rightLegAssociates": "Right Leg Associates",
    "carriedForward": "Carried Forward",
```

change to:

```json
    "leftLegAssociates": "Left Leg Associates",
    "rightLegAssociates": "Right Leg Associates",
    "totalDownlineLabel": "Total Downline",
    "activeTodayLabel": "Active Today",
    "newJoinsLabel": "New Joins",
    "carriedForward": "Carried Forward",
```

In `frontend/src/assets/i18n/hi.json`, inside the `"dashboard"` object, currently:

```json
    "leftLegAssociates": "बायें पैर के सहयोगी",
    "rightLegAssociates": "दायें पैर के सहयोगी",
    "carriedForward": "कैरी फॉरवर्ड",
```

change to:

```json
    "leftLegAssociates": "बायें पैर के सहयोगी",
    "rightLegAssociates": "दायें पैर के सहयोगी",
    "totalDownlineLabel": "कुल डाउनलाइन",
    "activeTodayLabel": "आज सक्रिय",
    "newJoinsLabel": "नए जुड़े सदस्य",
    "carriedForward": "कैरी फॉरवर्ड",
```

- [ ] **Step 4: Append the layout CSS**

Append to `frontend/src/styles/_dashboard.scss`:

```scss
.leg-volume-gauge__bar {
  display: flex;
  gap: 2px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  margin-bottom: 1rem;
}

.leg {
  padding: 0.75rem 1rem;
  color: var(--brand-primary-contrast);
  font-weight: 600;
  font-size: 0.875rem;
}

.leg.left {
  background: var(--brand-primary);
}

.leg.right {
  background: var(--brand-primary-hover);
}

.leg-volume-gauge__tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.75rem;
}

.team-snapshot {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 0.75rem;
}
```

- [ ] **Step 5: Run both widgets' specs**

Run: `cd frontend && npx ng test --watch=false --include='**/leg-volume-gauge.component.spec.ts' --include='**/team-snapshot.component.spec.ts'`
Expected: all PASS, unchanged from before this task.

- [ ] **Step 6: Confirm i18n key parity**

Run: `cd frontend && node -e "
const en = require('./src/assets/i18n/en.json');
const hi = require('./src/assets/i18n/hi.json');
function keys(o,p=''){let r=[];for(const k in o){const kp=p?p+'.'+k:k; if(typeof o[k]==='object') r=r.concat(keys(o[k],kp)); else r.push(kp);} return r;}
const ek=keys(en).sort(), hk=keys(hi).sort();
console.log('en', ek.length, 'hi', hk.length);
console.log('missing in hi:', ek.filter(k=>!hk.includes(k)));
console.log('missing in en:', hk.filter(k=>!ek.includes(k)));
"`
Expected: `en` and `hi` counts equal (7 more than Task 4's checkpoint — 3 new keys here, plus Task 4's 1, plus whatever the count was before this plan started), both "missing" lists empty.

- [ ] **Step 7: Run the full frontend test suite**

Run: `cd frontend && npx ng test --watch=false`
Expected: same pass count as before this task — this is the plan's final task, so this is also the plan's final full-suite confirmation.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/dashboard/widgets/leg-volume-gauge/leg-volume-gauge.component.ts \
        frontend/src/app/dashboard/widgets/team-snapshot/team-snapshot.component.ts \
        frontend/src/assets/i18n/en.json \
        frontend/src/assets/i18n/hi.json \
        frontend/src/styles/_dashboard.scss
git commit -m "feat(dashboard): migrate leg volume gauge and team snapshot metric cells to stat-tile"
```
