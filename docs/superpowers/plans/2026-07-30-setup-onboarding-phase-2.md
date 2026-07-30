# Phase 2 — Design system + theming

Continuation of `docs/superpowers/plans/2026-07-30-setup-onboarding-phase-0-1.md` (Phases 0-1, already implemented — confirmed against `git log`: all six of their commits are present on `master`). Full roadmap: `docs/superpowers/plans/2026-07-30-setup-onboarding.md`, its "Phase 2" section. Spec: `setup-onboarding-spec.md`. Design: `ChatGPT Image Jul 29, 2026, 11_07_58 PM.png`.

## Context

Phase 2 is the first purely visual phase: **100% frontend, no backend files touched, no working API call**. It exists because every phase from 4 onward builds wizard-step UI, and today the frontend has **zero CSS** — confirmed `frontend/src/styles.scss` is a one-line placeholder comment, and all 15 existing components ship an inline `template:` with no `styles`/`styleUrls` at all. Building step forms on that foundation would mean re-deriving colors, spacing, and card/button/table primitives independently in every later phase. Phase 2 lands the design-token system, a `ThemeService` that later phases' Branding step will drive, and the seven shared presentational primitives (`brand-button`, `inline-banner`, `stat-tile`, `toggle-group`, `tab-bar`, `side-panel`, `checklist-row`) the wizard steps consume from Phase 4 onward.

The one HTTP call this phase adds — a fetch of `GET /api/company/branding/public` — 404s until Phase 5 creates that endpoint. That is expected, tested behavior, not a gap.

Outcome: the existing dashboard and login screens (unchanged markup) render dark-themed with brand-gradient accents and correct `₹` lakh-grouped currency, and a library of seven reusable, spec'd components exists for Phase 4+ to consume — with no backend dependency yet.

## Corrections and decisions (fixed — do not re-litigate)

1. **`provideAppInitializer` does not exist in this project's Angular version.** The master roadmap doc names it, but the installed `@angular/core` is **18.2.14** (confirmed in `node_modules/@angular/core/package.json`), and `provideAppInitializer` is an Angular 19 addition — confirmed absent from `node_modules/@angular/core/index.d.ts`. The older **`APP_INITIALIZER`** injection token **is** present in 18.2.14 and is what this plan uses instead. Not a downgrade of intent, a version-correct substitute.

2. **Adding `APP_INITIALIZER` will silently break the existing `app.config.spec.ts` — verified, not hypothetical.** That spec spreads `...appConfig.providers` into its own `TestBed.configureTestingModule` and calls `TestBed.inject(AuthService)` / `TestBed.inject(HttpClient)`. Confirmed directly in `node_modules/@angular/core/fesm2022/testing.mjs` (line 1051): `TestBed`'s internal `finalize()` calls `this.testModuleRef.injector.get(ApplicationInitStatus).runInitializers()` the moment anything is injected. Once `BrandingBootstrapService.initialize()` is registered as an `APP_INITIALIZER`, this spec will trigger a real `http.get('/api/company/branding/public')` against its `provideHttpClientTesting()` backend, and the spec's closing `httpMock.verify()` — which asserts zero outstanding requests — will throw on the unflushed call. **Task 2.3 must add one line to this pre-existing spec in the same commit**: `httpMock.expectOne('/api/company/branding/public').flush(null, { status: 404, statusText: 'Not Found' });` before its `httpMock.verify()`. Confirmed via grep that no other spec imports `appConfig`, so this is the only file at risk.

3. **Locale providers have no version issue.** `@angular/common/locales/en-IN.mjs`/`.d.ts` exist in `node_modules` already (ship inside the already-installed `@angular/common`); `LOCALE_ID` and `DEFAULT_CURRENCY_CODE` are standard Angular 18 tokens. No new npm dependency, no `@angular/localize` needed (that package is for compile-time `$localize`/extraction, unrelated to `registerLocaleData`).

4. **Sass: `@use`, not `@import`.** Installed compiler is Dart Sass 1.77.6, which fully supports the module system. None of this phase's partials define Sass-level `$variables`/`@mixin`/`@function` (only plain CSS rules and `:root { --custom-prop }`), so `@use` vs `@import` compile identically here — flagged only so a future phase adding a shared `$breakpoint` knows `@use 'tokens' as tokens;` + `tokens.$breakpoint` is required, not a bare global.

5. **`app.component.scss` stays empty this phase.** `.app-header`/`.logout` rules go into a new global partial instead of that file. Reasons: keeps Phase 2 a single consistent story (all styling is global-partial-driven, zero exceptions); and it keeps the `anyComponentStyle` budget (2kB warn / 4kB error, confirmed at `angular.json:52-56`) genuinely inapplicable this phase — zero component files carry real `styles`/`styleUrl` content, so the budget has nothing to measure yet. That's a deliberate outcome, not an accident, and matters because Phase 4+'s style-heavy wizard steps are where that budget is actually meant to start biting.

6. **App-specific classnames (`.wallet-card`, `.kyc-banner`, `.login-form`, …) do not go in the six generic partials the roadmap names** (`_tokens`, `_reset`, `_forms`, `_cards`, `_tables`, `_buttons`). They go in a new `frontend/src/styles/_app-shell.scss`, so the six generic partials stay adoptable by Phase 4+ step forms without dragging in dashboard-specific rules.

7. **A second new partial, `_shared-components.scss`,** holds the six non-button primitives' styles (`.inline-banner`, `.stat-tile`, `.toggle-group`, `.tab-bar`, `.side-panel`, `.checklist-row`). `.brand-button` styles live in `_buttons.scss` instead, next to the bare `button` reset it extends.

8. **No new i18n keys this phase.** All seven shared components are presentational shells — every input is a caller-supplied, already-translated string, or a non-text value (boolean/enum/routerLink). None imports `TranslateModule`. `checklist-row`'s `✓` glyph is a symbol, not language-dependent copy.

9. **`BrandingBootstrapService.initialize()` does nothing on error** (today, always 404). It does not call `ThemeService.apply()` with hardcoded fallback constants on failure — `_tokens.scss`'s static `:root` defaults already are the fallback, and duplicating `#7C3AED`/`#22D3EE` in TypeScript risks silent drift between the two files for no behavioral gain.

## Task 2.1 — Design tokens and generic global partials

**Create**, under `frontend/src/styles/`:

- **`_tokens.scss`** — the `:root { … }` block from the master roadmap's Architecture section, verbatim (`--brand-primary` through `--status-danger`), plus one addition needed by `_reset.scss`: `--font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;` (no literal `'Inter'` — no font file ships, so naming a font that never loads would mislead; "Inter-ish" describes the visual family this stack already resembles).
- **`_reset.scss`** — box-sizing reset; zeroed margin/padding on `body, h1–h6, p, figure`; `body { background: var(--surface-page); color: var(--text-primary); font-family: var(--font-sans); line-height: 1.5; }`; `a { color: inherit; text-decoration: none; }`; `button, input, select, textarea { font: inherit; color: inherit; }`; `:focus-visible { outline: 2px solid var(--brand-primary); outline-offset: 2px; }`.
- **`_forms.scss`** — element selectors only (no classes), so the login screen's bare `<label>`/`<input>` gets styled with zero template changes: label layout, `input[type=…]`/`select`/`textarea` surface/border/radius using `--surface-raised`/`--border-subtle`, focus ring using `--brand-primary`/`--brand-primary-soft`, `::placeholder` using `--text-muted`.
- **`_cards.scss`** — one generic reusable family for later phases: `.card`, `.card-title`, `.card-subtitle`.
- **`_tables.scss`** — element selectors (`table`, `th`, `td`, row hover), unused until Phase 9's `editable-table` but established now per the roadmap's explicit file list.
- **`_buttons.scss`** — bare `button` reset (cursor, radius, padding, `:disabled` state) plus `.brand-button` and its modifiers (`--secondary`, `--ghost`, `--danger`, `--full`), the latter using `--brand-gradient`/`--brand-primary-contrast`.

**Modify** `frontend/src/styles.scss` — replace the placeholder with `@use` imports in order: tokens → reset → forms → buttons → cards → tables. (Task 2.4/2.5's `@use 'styles/app-shell'` and `@use 'styles/shared-components'` lines land in those tasks' own commits, matching each commit's actual file creations.)

**Tests:** none — pure CSS has no Jasmine spec. Verification is structural: `styles.scss` is registered in both `angular.json`'s `build` and `test` style arrays, so a Sass error fails `ng test` before any spec runs; `ng build --configuration production` proves clean compilation under the same Dart Sass version.

Commit: `feat: add dark design-token system and generic global style partials`

## Task 2.2 — ThemeService

**Create** `frontend/src/app/core/theme/theme.service.ts`:
- `contrastRatio(foreground: string, background: string): number` — standalone exported function implementing WCAG relative luminance (sRGB→linear per channel, `0.2126/0.7152/0.0722` weights) and the `(L1+0.05)/(L2+0.05)` ratio formula. Exists now so a later Branding step can warn under 4.5:1 — Phase 2 does not wire that warning to any UI yet.
- `ThemeService.apply(primary: string, secondary: string, target: HTMLElement = document.documentElement): void` — sets `--brand-primary`, `--brand-secondary`, and a computed `--brand-primary-contrast` (`#FFFFFF` or `#0B1020`, chosen via `contrastRatio` against each candidate rather than a separate luminance threshold, so there's one implementation of "which is more readable") on `target.style` via `setProperty`. No `target === document.documentElement` branching needed — setting inline style on any element already scopes via custom-property inheritance to that element's subtree only, which is exactly the live-preview scoping later phases need.

**Create** `frontend/src/app/core/theme/theme.service.spec.ts` (TDD, red first):
- `contrastRatio('#FFFFFF', '#000000')` → `21`; `contrastRatio('#000000', '#000000')` → `1`; symmetry check; `contrastRatio('#767676', '#FFFFFF')` → `toBeCloseTo(4.54, 1)` (well-known WCAG AA boundary gray, an anchor independent of this file's own math).
- `apply()` on a detached `target` element sets the three properties there **and leaves `document.documentElement` untouched** — the core "preview doesn't leak app-wide" assertion.
- `apply()` with no `target` sets the three properties on `document.documentElement` (default-parameter path); `afterEach` removes them so this spec can't pollute others sharing the Karma browser instance.
- A light primary (`#FFFF00`) resolves contrast to `#0B1020`; a dark primary (`#1A1A2E`) resolves to `#FFFFFF` — proves the branch actually branches.

Commit: `feat: add ThemeService with WCAG contrast math and scoped theme application`

## Task 2.3 — `app.config.ts`: Angular-18-correct bootstrap, branding fetch, Indian locale

**Create** `frontend/src/app/core/theme/branding-bootstrap.service.ts` — injects `HttpClient` and `ThemeService`; `initialize(): Promise<void>` does `GET /api/company/branding/public` (typed to only the two fields Phase 2 consumes: `primaryColor`, `secondaryColor` — Phase 5 owns the full contract), `catchError(() => of(null))`, calls `theme.apply(...)` only when a body comes back, otherwise does nothing (decision 9).

**Create** `frontend/src/app/core/theme/branding-bootstrap.service.spec.ts` — flushing a valid body calls `ThemeService.apply()` with those exact values (spy); flushing a 404 resolves without calling `apply()`; a network error (`req.error(...)`) also resolves cleanly rather than rejecting/hanging.

**Modify** `frontend/src/app/app.config.ts`:
- Add `APP_INITIALIZER`, `LOCALE_ID`, `DEFAULT_CURRENCY_CODE` imports from `@angular/core`; `registerLocaleData` from `@angular/common`; `localeEnIn` from `@angular/common/locales/en-IN`. Call `registerLocaleData(localeEnIn)` once at module scope.
- Add to `providers`: `{ provide: LOCALE_ID, useValue: 'en-IN' }`, `{ provide: DEFAULT_CURRENCY_CODE, useValue: 'INR' }`, and `{ provide: APP_INITIALIZER, useFactory: (b: BrandingBootstrapService) => () => b.initialize(), deps: [BrandingBootstrapService], multi: true }` — the version-correct substitute for the roadmap's `provideAppInitializer` (decision 1).

**Modify** `frontend/src/app/app.config.spec.ts` — add the one `httpMock.expectOne('/api/company/branding/public').flush(...)` line from decision 2, with a comment explaining why (mirrors the Phase 0/1 doc's style of calling out traps explicitly).

**Tests:** the two new spec files above; the modified `app.config.spec.ts`; and a concrete, automated version of the roadmap's manual "lakh grouping" check — extend an existing widget spec (e.g. `wallet-card.component.spec.ts`) to assert `{{ 163200 | currency:'INR' }}` renders `₹1,63,200` once the locale providers are wired, catching a mis-registered locale before a human opens a browser.

Commit: `feat: bootstrap branding fetch and Indian locale via Angular-18-compatible APP_INITIALIZER`

## Task 2.4 — Dark chrome for AppComponent, dashboard widgets, and login

**Create** `frontend/src/styles/_app-shell.scss` — every rule scoped under a unique parent class (`.dashboard .total`, never bare `.total`) to avoid collisions across features, since there's no CSS Modules/scoping in this app. Covers, using tokens from Task 2.1:

- `.app-header` / `.app-header .logout` (card-surface header bar, hover picks up brand color).
- `.dashboard` (responsive grid) / `.dashboard-error` (danger-toned card).
- `.dashboard .wallet-card` / `.balance` / `.withdraw-action` (pill styled with `--brand-gradient`, since it's an `<a>` and can't reuse the shared `brand-button` component).
- `.dashboard .kyc-banner` (warning-toned, full-width).
- `.dashboard .cycle-income-card` `.direct`/`.matching`/`.total` (all scoped under `.cycle-income-card` per the collision guard).
- `.dashboard .rank-progress .progress-bar`/`.progress-fill` — `.progress-fill` uses `--brand-gradient`; width itself stays driven by the component's existing inline `[style.width.%]`, unchanged.
- **`.leg-volume-gauge`** — needs a deliberate visual translation rather than a direct "fill", since its markup is two flex-proportioned `.leg` children plus one un-proportioned `.projected-match` sibling (confirmed unchanged in this phase). Rule shape: the gauge's own background is `--brand-gradient` (the "fill"); `.leg.left`/`.leg.right` render as translucent dark overlays on top of it so their relative widths stay legible; `.projected-match` gets `flex: 1 1 100%` on a `flex-wrap: wrap` parent so it drops to its own row instead of squeezing onto the first line.
- `.dashboard .team-snapshot`, `.quick-actions .record-sale`/`.add-referral`, `.cycle-countdown`, `.announcements-strip .announcement`.
- `.login-form` (centered card) / `.login-form button[type='submit']` (brand-gradient, the only way to target this un-classed button precisely without touching `login.component.ts`) / `.login-form .login-error` (danger-toned). The bare `<label>`/`<input>` inside it are already covered by `_forms.scss` — no login-specific input rules needed.

No template/TS changes to any dashboard widget or `login.component.ts` in this task — CSS only, confirmed safe because none of `dashboard.component.spec.ts`, the eight widget specs, or `login.component.spec.ts` assert on computed styles, only DOM presence/text/event wiring.

**Tests:** none new, for the reason above.

Commit: `feat: style the dashboard, login, and app chrome with the dark token system`

## Task 2.5 — Seven shared primitive components

Each at `shared/components/<name>/<name>.component.ts` + co-located `.spec.ts`, following the `field-error` precedent exactly: standalone, inline `template:`, `CommonModule` only if the template needs `*ngIf`/`*ngFor`, no `TranslateModule` (decision 8), zero consumers yet (each spec instantiates directly via `TestBed.configureTestingModule({ imports: [XComponent] })`).

- **`brand-button`** — `@Input() variant: 'primary'|'secondary'|'ghost'|'danger' = 'primary'`, `@Input() type: 'button'|'submit' = 'button'`, `@Input() disabled = false`, `@Input() fullWidth = false`, `@Output() clicked = new EventEmitter<void>()`. Projects content; styles come from `_buttons.scss`, not a component stylesheet. Tests: projects content, emits on click, suppresses emit when disabled, applies modifier class per variant, defaults to `type='button'`.
- **`inline-banner`** — `@Input() tone: 'info'|'warning'|'success'|'danger' = 'info'`, `@Input() dismissible = false`, `@Output() dismissed`. Internal `visible` flag toggled by an optional close button. Consumers: Phase 6's amber compensation-change banner, Phase 8's success panel. Tests: renders content, tone class, close button only when dismissible, dismiss hides + emits once.
- **`stat-tile`** — `@Input({required}) label`, `@Input({required}) value`, `@Input() hint?`, `@Input() tone: 'default'|'accent' = 'default'`, plus a `[tile-editor]` projection slot for Phase 6's inline-editable tiles. Tests: label/value render, hint conditional, tone class, slot projection.
- **`toggle-group`** — `ToggleOption { value; label }[]` input, `value` input, `valueChange` output; renders one button per option, guards re-emitting the already-active value. Consumer: Phase 7's KYC Strict/Relaxed selector. Tests per option rendering/click/active-class/no-redundant-emit.
- **`tab-bar`** — `TabDefinition { id; label }[]` input, `activeTabId` input, `tabChange` output; `role="tablist"`/`role="tab"`/`aria-selected`; header-only, caller owns panel rendering. Consumer: Phase 9's Plot List/Import CSV tabs.
- **`side-panel`** — `open`, `title` inputs, `closed` output; backdrop `*ngIf="open"` (click emits close), `<aside>` always present with `[class.side-panel--open]` for a CSS-transform transition (no new `@angular/animations` usage — present in `package.json` but unused today, not introduced here). Consumer: Phase 10's Admin Team side-over.
- **`checklist-row`** — `label` (required), `complete`, `badgeLabel?`, `editLabel?`, `editHref?` inputs; edit link renders only when both `editLabel` and `editHref` are supplied. Consumer: Phase 8's Review & Launch checklist.

**Create** `frontend/src/styles/_shared-components.scss` with the six non-button primitives' presentational rules (tone-keyed banners/tiles, segmented-control look for toggle-group/tab-bar, fixed-position slide-over for side-panel, flex row for checklist-row).

Commit: `feat: add seven shared presentational primitives for the setup wizard`

## Risks

| Risk | Mitigation |
|---|---|
| Master roadmap says `provideAppInitializer`, which doesn't exist in this project's Angular 18.2.14 | Verified absent in `node_modules/@angular/core/index.d.ts`; `APP_INITIALIZER` token used instead, confirmed present |
| Adding `APP_INITIALIZER` silently breaks `app.config.spec.ts` via TestBed's lazy `runInitializers()` | Mechanism confirmed directly in `testing.mjs`; Task 2.3 adds the missing `httpMock.expectOne(...).flush(...)` line in the same commit |
| `color-mix()` browser support | Already accepted at the master-plan level (Baseline Chrome 111+/Safari 16.2+/Firefox 113+); unchanged for Phase 2 |
| `@import` deprecation in Dart Sass | `@use` throughout; installed `sass@1.77.6` fully supports it; no cross-partial `$variable` sharing needed yet |
| Global, unscoped classnames collide across features (e.g. `.total`) | Every dashboard-specific selector in `_app-shell.scss` scoped under its widget's parent class |
| `anyComponentStyle` budget (2kB warn/4kB error) | Doesn't apply in Phase 2 — no component has real `styles`/`styleUrl` content; `app.component.scss` deliberately stays empty so this stays true rather than becoming trivially true. Phase 4+ wizard steps are where it starts mattering |
| `leg-volume-gauge`'s markup shape (two proportioned children + one un-proportioned sibling) doesn't support a simple "fill" | `flex-wrap` + `flex-basis: 100%` on `.projected-match` forces its own row without touching the component's template; legs render as overlays on a gradient base |
| Seven new components ship with zero consumers, risking API drift before Phase 4+ | APIs sized to the specific later-phase consumer named in the roadmap (KYC toggle, Projects tabs, Admin Team panel, Review & Launch checklist), not generically guessed |

## Verification

**Automated** (after every task):
```bash
cd frontend && npx ng test --watch=false --browsers=ChromeHeadless
npx ng build --configuration production
```
Spec count should rise (new: `theme.service.spec.ts`, `branding-bootstrap.service.spec.ts`, 7 component specs, plus the modified `app.config.spec.ts` and one extended widget spec) with none of the pre-existing ~30 specs shrinking or being deleted. The production build must complete with no `anyComponentStyle` budget warning and no Sass errors.

**Manual walkthrough:**
1. `ng serve`, log in as the seeded dev admin/associate — confirm dark background, brand-gradient buttons/progress bar/leg-volume-gauge, Inter-ish sans-serif type, with zero backend changes.
2. Confirm the wallet balance renders lakh-grouped, e.g. `₹1,63,200` not `₹163,200`.
3. Dev tools Network tab: confirm exactly one request to `/api/company/branding/public`, returns 404, produces no console error and no visible UI change.
4. Confirm no console errors anywhere in the dashboard/login flow attributable to this phase.
5. Log out — confirm the login form is centered, dark-card-styled, its submit button carries the brand gradient despite `login.component.ts` being untouched.

### Critical files

- `frontend/src/styles.scss`, `frontend/src/styles/_tokens.scss`, `_reset.scss`, `_forms.scss`, `_cards.scss`, `_tables.scss`, `_buttons.scss`, `_app-shell.scss`, `_shared-components.scss`
- `frontend/src/app/core/theme/theme.service.ts` (+spec)
- `frontend/src/app/core/theme/branding-bootstrap.service.ts` (+spec)
- `frontend/src/app/app.config.ts`, `frontend/src/app/app.config.spec.ts`
- `frontend/src/app/shared/components/{brand-button,inline-banner,stat-tile,toggle-group,tab-bar,side-panel,checklist-row}/*.component.ts` (+spec each)
