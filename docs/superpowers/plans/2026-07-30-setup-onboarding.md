# Implementation Plan: Company Setup & Onboarding

Spec: `setup-onboarding-spec.md` · Design: `ChatGPT Image Jul 29, 2026, 11_07_58 PM.png`

## Context

plotchain is a single-tenant land-MLM platform. Today a founding admin is created by `AdminBootstrapRunner` from env vars, logs in, and lands on a dashboard — but there is **nowhere to configure the company**. Every business parameter the platform needs either doesn't exist or is hardcoded: the only compensation figure in the system is `compensation.preview-matching-rate: 0.07` in `application.yml`, read via `@Value` at `DashboardService.java:52`. There is no company name, no branding, no payout rates, no projects, no payment or KYC config, no way to create a second admin, and no root associate to anchor the binary tree.

`setup-onboarding-spec.md` defines the fix: an 8-step wizard the founding admin completes before associates start using the instance, which then persists as a Company Settings area. This plan builds it — backend tables and endpoints, an Angular design system (the frontend currently has **zero CSS**), the wizard, launch gating, and the post-launch settings area with an audit log.

Outcome: a fresh deployment goes from empty database to live, associate-usable instance entirely through the UI, with the admin's chosen primary/secondary colors driving the whole app's palette and gradients.

### Decisions already made (fixed — do not re-litigate)

1. **Full scope, phased.** All 8 steps + Company Settings + audit log.
2. **Logos in Postgres `bytea`.** No filesystem, no data-URI. Served from an endpoint.
3. **`user_id` becomes the login identifier.** A real unique column on `associate`. Admins choose theirs (`finance01`); associates get an auto-generated `VP00001`-style ID. `email` stays as a contact field. This matches the mockup's login preview, which shows an **"Associate ID"** field, not email.
4. **Role enum expands** with `SUPER_ADMIN, FINANCE, KYC_REVIEWER, SUPPORT` alongside `ADMIN, ASSOCIATE`.
5. **Dark-only theme, tokens app-wide.** Defaults `#7C3AED` primary / `#22D3EE` secondary, overridden at runtime by the admin's Branding choices, driving buttons, nav, links, badges, highlights and all gradients — across wizard, login, and the existing dashboard.

### Global constraints (from existing repo conventions)

- Money: `BigDecimal` in Java, `NUMERIC(14,2)` in Postgres. Never float/double.
- `ddl-auto: validate` in both `application.yml` and `application-test.yml` — **every** entity change needs a matching Flyway migration or the context won't start.
- Migrations `V<n>__snake_case.sql` in `db/migration`. Explicit UUID PKs (no `gen_random_uuid()`), `TIMESTAMP` not TIMESTAMPTZ, enums as `VARCHAR` + `CHECK` named `chk_*`, indexes `idx_<table>_<cols>`. Dev seeds stay at V900+.
- Backend: flat one-package-per-domain under `com.plotchain.<domain>`; entity + repo + DTO records + exceptions + controller + service colocated. No `@ManyToOne` — FKs are raw `UUID` fields. App-assigned `UUID.randomUUID()` ids.
- Authorities carry **no `ROLE_` prefix**; JWT principal is the associate `UUID`.
- Angular: standalone components, functional guards/interceptors, inline `template:`, a co-located `.spec.ts` beside **every** source file, `*ngIf`/`*ngFor` (not `@if`/`@for`), 2-space indent, single quotes.
- **Zero hardcoded user-facing strings.** Everything through `| translate`, with `assets/i18n/en.json` and `hi.json` at exact key parity.
- **Mock interfaces only.** This JDK's Mockito/ByteBuddy cannot instrument concrete classes (see `AuthControllerTest.java:25-28`). Mock repositories; instantiate services for real.
- Conventional Commits, one per task, footer `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## Architecture

### Data model: per-domain tables, not one wide settings row

Config lives in **separate tables per domain**, each a singleton where the spec implies one (company profile, branding, payment config, KYC config, withdrawal config) and multi-row where it doesn't (projects, plots, compensation versions, royalty rates, reward tiers, admin accounts, audit log).

Rationale: a single wide `company_settings` table would mix a `bytea` logo blob with percentages the compensation engine reads on every payout run, force nullable-everything (killing the `NOT NULL` constraints that make "is this step complete?" answerable in SQL), and make the audit log unable to name what changed. Singleton tables enforce their own invariants and keep the blob out of hot reads.

Singleton enforcement: `id UUID PRIMARY KEY` plus `CHECK (singleton_guard = TRUE)` on a `BOOLEAN NOT NULL DEFAULT TRUE UNIQUE` column — one row, enforced by the database, no application discipline required.

### Step completeness is derived, never stored

`SetupStateService` computes each step's status by asking each domain whether its required rows exist and validate. Only two facts are persisted, in `setup_state`: `terms_accepted_at` and `launched_at`.

Rationale: a persisted `step_1_complete` flag drifts the moment a later edit clears a required field. Deriving it means the Go Live gate and the Step 8 checklist can never disagree with the actual data.

`GET /api/company/setup-state` returns per-step status plus `canGoLive` (Company Profile + Compensation + Payments & KYC all complete) and `launchedAt`.

### Setup mode vs live

- `launched_at IS NULL` → **setup mode**. Associate-role logins are rejected with a 403 and a "not yet live" message; admin-family logins succeed. Enforced in `AuthService.login`, not just the UI.
- Founding admin login while in setup mode redirects to `/setup`, resuming at the first incomplete step (after the existing `mustChangePassword` redirect, which still wins).
- After go-live, `/setup` redirects to `/settings`.

### Theming: two CSS custom properties, everything derived

`styles.scss` gains a dark token layer under `:root`. Two of those tokens are brand-owned:

```scss
:root {
  --brand-primary: #7C3AED;
  --brand-secondary: #22D3EE;

  --brand-gradient: linear-gradient(135deg, var(--brand-primary), var(--brand-secondary));
  --brand-primary-soft: color-mix(in srgb, var(--brand-primary) 14%, transparent);
  --brand-primary-hover: color-mix(in srgb, var(--brand-primary) 85%, white);
  --brand-secondary-soft: color-mix(in srgb, var(--brand-secondary) 14%, transparent);
  --brand-primary-contrast: #FFFFFF; /* recomputed by ThemeService per chosen color */

  --surface-page: #0F1420;
  --surface-card: #151B2B;
  --surface-raised: #1C2436;
  --border-subtle: #263148;
  --text-primary: #E8ECF6;
  --text-muted: #8C98B4;
  --status-success: #34D399;
  --status-warning: #F59E0B;
  --status-danger: #F87171;
}
```

Every shade and gradient derives from the two brand variables via `color-mix(in srgb, …)`, so setting two properties re-themes the app. `color-mix()` is Baseline-supported (Chrome/Edge 111+, Safari 16.2+, Firefox 113+); acceptable for an internal admin tool, and noted as the one modern-CSS dependency.

`ThemeService` (`core/theme/theme.service.ts`):
- `apply(primary, secondary, target = document.documentElement)` — sets the two properties plus a computed `--brand-primary-contrast` (white or `#0B1020`, chosen by WCAG relative luminance so button labels stay legible when an admin picks a pale yellow).
- `contrastRatio(fg, bg)` — exported so the Branding step can show an inline warning when the chosen primary falls below 4.5:1 against `--surface-card`. Warn, never block; it's their brand.
- **Live preview scoping**: the preview panel calls `apply()` with its own container element as `target`, so unsaved colors style only that subtree. Global `:root` changes only on successful save.

Bootstrap: `GET /api/company/branding/public` is **unauthenticated** (name, tagline, logo refs, two colors) so the login page is branded before any token exists. `provideAppInitializer` fetches it once and calls `ThemeService.apply()` before first paint, falling back silently to the defaults if the call fails or setup hasn't reached Branding yet.

### Frontend structure

```
frontend/src/app/
  core/
    theme/theme.service.ts
    api/field-errors.model.ts          # { error, fields?: Record<string,string> }
  shared/
    components/                        # one folder per component, mirroring dashboard/widgets/
      brand-button/ field-error/ color-field/ logo-uploader/
      editable-table/ toggle-group/ stat-tile/ checklist-row/
      tab-bar/ side-panel/ inline-banner/
  setup/
    setup-shell.component.ts           # left rail + <router-outlet>, layout for all steps
    setup-progress-rail.component.ts
    setup.service.ts  setup.guard.ts
    steps/company-profile/ branding/ compensation/ projects/
          payments-kyc/ admin-team/ root-associates/ review-launch/
    models/*.model.ts
  settings/
    settings-shell.component.ts        # left nav + <router-outlet>
    audit-log/audit-log.component.ts
    settings.service.ts
```

Routing uses **child routes** (a first for this repo, which has one flat array):

```ts
{ path: 'setup', component: SetupShellComponent, canActivate: [authGuard, adminGuard, setupModeGuard],
  children: [ { path: 'company-profile', component: CompanyProfileStepComponent }, /* … 8 steps */
              { path: '', redirectTo: 'company-profile', pathMatch: 'full' } ] },
{ path: 'settings', component: SettingsShellComponent, canActivate: [authGuard, adminGuard],
  children: [ /* same step form components, `mode="settings"` */ ] },
```

**Company Settings reuses the step form components rather than duplicating them.** Each step component takes an `@Input() mode: 'setup' | 'settings'` that switches the footer (Previous/Next vs Save/Cancel) and hides the progress rail. The form controls, validation, live previews and service calls are identical because they hit the same endpoints.

**Save-and-resume** uses `PUT` per step with the step's complete payload, not `PATCH`. Each step is a self-contained aggregate, so a full-object upsert is idempotent, needs no merge semantics on the server, and makes the audit log's before/after diff trivial. The form autosaves on `blur` (debounced 400ms via `valueChanges`) and on Next; a "Saved just now" indicator mirrors the mockup.

**The 4kB component-style budget** (`angular.json:52-56`) is real, and wizard steps are style-heavy. Mitigation: shared primitives (cards, form rows, tables, buttons, the progress rail) live in global SCSS partials imported by `styles.scss`; component styles carry only step-specific layout. Any step approaching the cap moves its layout rules into a partial rather than raising the budget.

---

## Phase 0 — Backend error-handling foundation

Must land first: the wizard's many-field forms are unusable under the current error shape.

**The landmine**: the *only* `MethodArgumentNotValidException` handler is `auth/AuthExceptionHandler.java:19-22`, it isn't package-scoped, and it returns a hardcoded `"email and password are required"` for **every** controller's validation failure in the application.

- Create `com.plotchain.api.ApiExceptionHandler` (`@RestControllerAdvice`) handling `MethodArgumentNotValidException` → `400 { "error": "validation failed", "fields": { "<field>": "<message>" } }`, plus `HttpMessageNotReadableException`, `MethodArgumentTypeMismatchException`, `DataIntegrityViolationException`, and `MaxUploadSizeExceededException` — none of which are handled today.
- Delete the `MethodArgumentNotValidException` handler from `AuthExceptionHandler`; leave `InvalidCredentialsException` there. Update `AuthControllerTest` (which asserts the old message) and add the standalone-MockMvc advice registration.
- `pom.xml`: add `org.apache.commons:commons-csv` (Step 4 CSV) — multipart needs no dependency, only config.
- `application.yml`: `spring.servlet.multipart.max-file-size: 2MB`, `max-request-size: 4MB`.
- Frontend `core/api/field-errors.model.ts` + `shared/components/field-error/` — the first per-field validation display in the app (none exists today).

Files: `backend/.../api/ApiExceptionHandler.java` (new) + test, `backend/.../auth/AuthExceptionHandler.java`, `backend/.../auth/AuthControllerTest.java`, `backend/pom.xml`, `backend/src/main/resources/application.yml`, `frontend/src/app/core/api/field-errors.model.ts`, `frontend/src/app/shared/components/field-error/*`.

---

## Phase 1 — Auth migration: `user_id` login + role expansion

Blocking and invasive: touches every existing auth path and test. Doing it before any wizard work means later phases build on the final contract.

**`V4__user_id_login_and_admin_roles.sql`**

```sql
ALTER TABLE associate ADD COLUMN user_id VARCHAR(64);
-- Backfill from email local-part so existing rows stay loginable; the unique index below
-- would fail on collisions, which is the correct outcome for a dev DB with duplicates.
UPDATE associate SET user_id = split_part(email, '@', 1) WHERE user_id IS NULL;
ALTER TABLE associate ALTER COLUMN user_id SET NOT NULL;
CREATE UNIQUE INDEX idx_associate_user_id ON associate (user_id);

ALTER TABLE associate DROP CONSTRAINT chk_associate_role;
ALTER TABLE associate ADD CONSTRAINT chk_associate_role
    CHECK (role IN ('ADMIN','ASSOCIATE','SUPER_ADMIN','FINANCE','KYC_REVIEWER','SUPPORT'));

-- chk_associate_rank_required said `role = 'ADMIN' OR rank_id IS NOT NULL`, which would
-- force the four new staff roles to carry a meaningless rank. Invert it: only associates
-- have a rank.
ALTER TABLE associate DROP CONSTRAINT chk_associate_rank_required;
ALTER TABLE associate ADD CONSTRAINT chk_associate_rank_required
    CHECK (role <> 'ASSOCIATE' OR rank_id IS NOT NULL);
```

> **Do not edit V1–V3 in place.** The README already documents a Flyway checksum incident from an in-place edit; existing dev databases refuse to boot afterward. All changes here are new forward migrations.

Backend changes:
- `AssociateRole` — add `SUPER_ADMIN, FINANCE, KYC_REVIEWER, SUPPORT`; add `isAdminFamily()` returning true for everything except `ASSOCIATE`.
- `Associate` — add `userId` field/column.
- `AssociateRepository` — add `findByUserId`, `existsByUserId`.
- `LoginRequest` — `email` → `userId`. `AuthService.login` looks up by `userId`; still throws `InvalidCredentialsException` on miss (never leak which half failed). Add the setup-mode gate: if `launched_at IS NULL` and the role is `ASSOCIATE`, throw `PlatformNotLiveException` → 403.
- `AssociateProvisioningService` — generate `VP%05d` associate IDs from a sequence-style max-suffix query; return the generated `userId` in `CreateAssociateResponse` alongside the one-time temporary password.
- `AdminBootstrapRunner` — add `plotchain.bootstrap.admin-user-id` (default `admin`), keep `admin-email` as contact.
- **`SecurityConfig`** — the blanket `hasAuthority("ADMIN")` write rules would lock out all four new roles. Replace with `hasAnyAuthority("ADMIN","SUPER_ADMIN","FINANCE","KYC_REVIEWER","SUPPORT")`. Fine-grained per-role restriction comes with the permission matrix in Phase 10; until then any admin-family role can write, which matches the spec's "founding admin can act as all roles". `SecurityConfigTest` must gain a case per new role, and the first-match-wins ordering comment stays accurate.
- `V900__seed_dev_accounts.sql` — add `user_id` values (`associate01`, `admin`). Dev-only file, safe to edit.
- `README.md` — document `PLOTCHAIN_ADMIN_USER_ID` and the login-identifier change.

Frontend changes:
- `login-request.model.ts` `email` → `userId`; `LoginComponent` field, validators (`Validators.required` + pattern, no `Validators.email`), and label key; `auth.service.ts` `login(userId, password)`.
- `admin.guard.ts` — `getRole() === 'ADMIN'` → an admin-family set check.
- `auth.interceptor.ts` — no change needed; `/api/auth/login` is already on `EXPECTED_401_PATHS`, and the new 403 isn't intercepted.
- Update `login.component.spec.ts`, `auth.service.spec.ts`, `admin.guard.spec.ts`.

---

## Phase 2 — Design system + theming

No backend work. Establishes the visual foundation every later phase consumes.

- `styles.scss` — the token block above, a CSS reset, Inter-ish system font stack, and global partials: `_tokens.scss`, `_reset.scss`, `_forms.scss`, `_cards.scss`, `_tables.scss`, `_buttons.scss` under `src/styles/`.
- `core/theme/theme.service.ts` + spec — `apply()`, `contrastRatio()`, luminance-based contrast-token selection, `target`-scoped application for previews.
- `app.config.ts` — `provideAppInitializer` fetching `/api/company/branding/public` (endpoint arrives in Phase 5; until then the initializer tolerates a 404 and keeps defaults). Add `registerLocaleData(localeEnIn)`, `{ provide: LOCALE_ID, useValue: 'en-IN' }`, `{ provide: DEFAULT_CURRENCY_CODE, useValue: 'INR' }` so `| currency` renders the mockup's `₹1,63,200` lakh grouping — currently unconfigured, so amounts render with Western grouping.
- `AppComponent` — dark page chrome; existing dashboard widget class names (`.wallet-card`, `.kyc-banner`, `.progress-bar`/`.progress-fill`, `.leg-volume-gauge`) finally get styles, using `--brand-gradient` for the progress and gauge fills.
- `shared/components/` — `brand-button`, `inline-banner`, `stat-tile`, `toggle-group`, `tab-bar`, `side-panel`, `checklist-row`, each with a spec.

---

## Phase 3 — Setup shell, state API, gating

**`V5__company_setup_state.sql`** — `setup_state` (singleton: `id`, `singleton_guard`, `terms_accepted_at`, `launched_at`, `updated_at`).

Backend, new package `com.plotchain.company`:
- `SetupState` entity + repository; `SetupStateService` computing derived per-step status; `SetupStateController`.
- `GET /api/company/setup-state` → `SetupStateResponse(List<StepStatus> steps, boolean canGoLive, Instant launchedAt)`, `StepStatus(int number, String key, boolean complete, boolean required, int percentComplete)`.
- `POST /api/company/launch` → accepts terms, validates `canGoLive`, sets `launched_at`. Throws `LaunchBlockedException` → 409 listing incomplete required steps.
- `company/CompanyExceptionHandler` for the package's exceptions.
- `SetupStateService` returns every step as incomplete until its phase lands, so this is testable immediately and each later phase just adds its predicate.

Frontend:
- `setup/setup-shell.component.ts` — the left rail + main area layout from the mockup.
- `setup/setup-progress-rail.component.ts` — percent label, gradient bar, numbered 1–8 list with completed checks, current-step highlight, `(Optional)` labels, and the "We save your progress automatically" note.
- `setup/setup.service.ts` — setup state fetch, cached and refreshed after each step save.
- `setup/setup.guard.ts` (setup mode only) and the reverse guard on `/settings`.
- `app.routes.ts` — the `setup` parent + 8 child routes (placeholder step components), `settings` parent.
- `login.component.ts` — post-login routing gains "admin + not launched → `/setup`", after the existing `mustChangePassword` check.
- i18n: `setup.*` namespace in both `en.json` and `hi.json`.

---

## Phase 4 — Step 1: Company Profile

**`V6__company_profile.sql`** — `company_profile` singleton: `display_name`, `legal_name`, `registration_number` (nullable — spec says optional if not yet registered), `contact_name`, `contact_phone`, `contact_email`, `registered_address` (TEXT), `updated_at`.

- `company/CompanyProfile` + repository + `CompanyProfileService`; `GET`/`PUT /api/company/profile`; `CompanyProfileRequest`/`Response` records with `@NotBlank` on the six required fields, `@Email`, and a `@Pattern` phone check (format only — the spec is explicit that there is no OTP).
- `SetupStateService` step-1 predicate: profile row exists with all required fields non-blank.
- Frontend `steps/company-profile/` — the form plus the mockup's **Company Card Preview** tile (logo placeholder, name, phone, email, address), bound live to `form.valueChanges`.

---

## Phase 5 — Step 2: Branding

**`V7__company_branding.sql`** — `company_branding` singleton: `logo_square BYTEA`, `logo_square_content_type`, `logo_wide BYTEA`, `logo_wide_content_type`, `primary_color VARCHAR(7)`, `secondary_color VARCHAR(7)`, `tagline VARCHAR(60)`, `updated_at`. `CHECK (primary_color ~ '^#[0-9A-Fa-f]{6}$')` on both colors.

- `GET`/`PUT /api/company/branding` (colors + tagline).
- `POST /api/company/branding/logo/{variant}` — multipart, `variant` ∈ `square|wide`. Validates content type (`image/png|jpeg|svg+xml|webp`) and size against the Phase 0 multipart limits.
- `GET /api/company/branding/logo/{variant}` — **unauthenticated**, returns bytes with the stored content type and a `Cache-Control` header.
- `GET /api/company/branding/public` — **unauthenticated**: display name, tagline, two colors, logo presence flags. Feeds the login page and the Phase 2 app initializer.
- **`SecurityConfig`**: both public GETs need `permitAll()` matchers, and the logo `POST` needs one, placed **above** the blanket write rules (first-match-wins — the same trap the file's comments already warn about twice).
- Favicon: `GET /api/company/branding/favicon` renders the square logo; `index.html` points at it, satisfying the spec's "auto-generates favicon" without an image-processing dependency.
- Frontend `shared/components/color-field/` (native `<input type="color">` + hex text input + swatch, matching the mockup — no picker library added), `shared/components/logo-uploader/` (square and wide tiles with Change buttons), and `steps/branding/`.
- **Live Login Preview**: a component rendering the real associate login markup — logo, tagline, "Associate ID" input, password with eye toggle, gradient Login button, Forgot password link — inside a container the branding step passes to `ThemeService.apply()` as its `target`, so unsaved colors preview locally. On save, `apply()` runs against `document.documentElement` and the whole app re-themes immediately.
- Tagline `18/60` character counter per the mockup.

---

## Phase 6 — Step 3: Compensation Plan

Highest-stakes screen, and the one with a hard domain requirement: *"compensation % and reward thresholds must be tied to the cycle they applied in, so changing them going forward never rewrites historical payouts."* The mockup shows `Current Version v2.1 (Effective 01 May 2025)` with a View History link.

**`V8__compensation_plan.sql`** — versioned, append-only:

- `compensation_plan_version` — `id`, `version_label VARCHAR(16)`, `effective_from DATE`, `direct_income_pct`, `matching_income_pct`, `sponsor_matching_pct`, `tds_pct`, `admin_charge_with_pan_pct`, `admin_charge_without_pan_pct`, `activation_fee NUMERIC(14,2)`, `min_withdrawal NUMERIC(14,2)`, `settlement_cycle VARCHAR(16)` + `chk_settlement_cycle CHECK (settlement_cycle IN ('SEMI_MONTHLY','MONTHLY','CUSTOM'))`, `created_at`, `created_by_associate_id`. Unique index on `effective_from`.
- `royalty_bonus_rate` — `id`, `plan_version_id`, `rank_id`, `royalty_pct`. Unique `(plan_version_id, rank_id)`.
- `reward_tier` — `id`, `plan_version_id`, `tier_level INT`, `volume_threshold NUMERIC(14,2)`, `cash_reward NUMERIC(14,2)`, `perk_description`. Unique `(plan_version_id, tier_level)`.
- `cycle` gains `compensation_plan_version_id UUID` (nullable, backfilled to the first version) so historical payouts stay pinned to the rates that produced them.

Editing the plan **creates a new version row** rather than updating in place; percentages are never mutated. `GET /api/company/compensation` returns the current version, `GET /api/company/compensation/history` the list, `PUT /api/company/compensation` creates the next version (auto-incrementing the label, `effective_from` = today unless overridden).

Reward tiers must be *"ordered, no gaps allowed"* — validated in `CompensationPlanService`: levels form `1..n` contiguously and thresholds strictly increase. Violation → `RewardTierGapException` → 409.

**Retire the hardcoded rate**: `DashboardService.java:52` reads `compensation.preview-matching-rate` via `@Value`. Replace with a `CompensationPlanRepository` lookup of the current version's `matching_income_pct`, and delete the property from `application.yml`. `DashboardServiceTest` gains the mocked repository.

Frontend `steps/compensation/`:
- Three `stat-tile`s (Direct / Matching / Sponsor Bonus) with inline-editable percentages.
- `shared/components/editable-table/` — reused for the Royalty Bonus (Rank → %) and Reward Tiers (Level → Volume → Reward) tables, both with `+ Add` rows.
- The small select row: Settlement Cycle, TDS %, Admin Charge (PAN) %, Admin Charge (without PAN) %, Activation / e-PIN fee.
- **Sample Earnings Preview** — a pure client-side `computeSampleEarnings()` function in `steps/compensation/sample-earnings.ts`, unit-tested independently, recomputing on every keystroke: scenario volume → direct income, matching income, sponsor bonus, royalty bonus, admin charge, TDS, **Final Earnings**. It mirrors the mockup's line items exactly. Its formulas are asserted against the technical spec's definitions (matching = `min(left, right) × matching_pct`, sponsor bonus = `sponsor_matching_pct ×` sponsee matching, etc.).
- Amber `inline-banner`: *"Changes here apply to future cycles only. Past payouts are never recalculated."*
- Defaults pre-filled from the spec's Indian-market constants: TDS 2%, admin charge 5% / 15%, activation fee ₹1,100, semi-monthly cycle.

---

## Phase 7 — Step 5: Payments & KYC

Built before Step 4 because it is launch-blocking and Step 4 is not.

**`V9__payment_and_kyc_config.sql`**

- `payment_config` singleton — `gateway VARCHAR(32)`, `credentials_encrypted TEXT`, `modes_enabled VARCHAR(64)` (comma-separated `CARDS,UPI,NETBANKING,WALLET`), `updated_at`.
- `payout_bank_account` singleton — `bank_name`, `account_holder`, `account_number`, `ifsc_code`, `account_type` + `chk_account_type CHECK (account_type IN ('CURRENT','SAVINGS'))`.
- `kyc_config` singleton — `strictness VARCHAR(8)` + `chk_kyc_strictness CHECK (strictness IN ('STRICT','RELAXED'))`, `required_documents VARCHAR(255)`.
- `withdrawal_config` singleton — `approval_mode VARCHAR(24)` + `chk_approval_mode CHECK (approval_mode IN ('AUTO_UNDER_LIMIT','ALWAYS_MANUAL'))`, `auto_approve_limit NUMERIC(14,2)`.

The spec requires KYC *"cannot be fully disabled — only strict/relaxed configurable"*, which the CHECK constraint enforces at the database level: there is no `OFF` value to set.

**Gateway credentials**: never returned by any `GET`. `GET /api/company/payments` returns the gateway name and a masked indicator (`credentialsConfigured: true`); only `PUT` accepts them. Stored via a `TextEncryptor` (Spring Security Crypto, already on the classpath) keyed by a new required env var `PLOTCHAIN_SECRETS_KEY` — documented in `README.md` alongside `JWT_SECRET`, with the same fail-closed startup guard pattern `JwtService` already uses.

Frontend `steps/payments-kyc/` — the mockup's three-column layout: Payment Collection (gateway select + mode tiles), Payout Account (bank fields with IFSC format validation), KYC Requirements (Strict/Relaxed `toggle-group` + document checkboxes), Withdrawal Approval (mode select, auto-approve limit, and the vertical flow preview: Request Raised → Admin Review → Approved → Payout Initiated).

---

## Phase 8 — Step 8: Review & Launch

All three blocking steps now exist, so the instance can actually go live — this is the first point the wizard is end-to-end usable.

- `SetupStateService` predicates complete for steps 1/2/3/5; `canGoLive` becomes genuinely satisfiable.
- `POST /api/company/launch` wired to the UI, with terms acceptance recorded in `setup_state.terms_accepted_at`.
- Frontend `steps/review-launch/` — the Summary Checklist (per-step green check, Complete badge, Edit link routing back to that child route), the "You're all set!" panel, the Terms of Service + Privacy Policy checkbox, and the large gradient **Go Live** button, `[disabled]` until `canGoLive`. On success the shell shows the live state and subsequent `/setup` visits redirect to `/settings`.
- The blocked state lists which required steps remain, matching the spec's ✅/⛔ checklist.

---

## Phase 9 — Step 4: Projects & Plots

**`V10__project_and_plot.sql`**

- `project` — `id`, `name`, `location`, `thumbnail BYTEA` (nullable), `thumbnail_content_type`, `created_at`.
- `plot` — `id`, `project_id`, `plot_no VARCHAR(32)`, `plot_type` + `chk_plot_type CHECK (plot_type IN ('NORMAL','CORNER'))`, `area_sqft NUMERIC(14,2)`, `rate NUMERIC(14,2)`, `price NUMERIC(14,2)`, `status` + `chk_plot_status CHECK (status IN ('AVAILABLE','BOOKED','SOLD'))`. Unique `(project_id, plot_no)`; `idx_plot_project_status`.

Field names follow the PRD (`area`, `rate`, `price`, `type` normal/corner, status available/booked/sold).

- Full CRUD: `GET`/`POST`/`PUT`/`DELETE /api/company/projects[/{id}]`, `GET`/`POST`/`PUT`/`DELETE /api/company/projects/{id}/plots[/{plotId}]`, paginated plot list (the mockup shows "Showing 1 to 5 of 450 plots").
- **Two-phase CSV import** (the spec requires per-row errors shown *before* commit):
  - `GET /api/company/projects/plots/csv-template` → the header row as `text/csv`.
  - `POST /api/company/projects/{id}/plots/csv/validate` → multipart; parses with commons-csv, returns `CsvValidationResponse(int totalRows, int validRows, List<CsvRowError> errors)` where `CsvRowError(int rowNumber, String field, String message)`. **Commits nothing.**
  - `POST /api/company/projects/{id}/plots/csv/commit` → multipart; re-validates and rejects the whole file if any row fails (all-or-nothing, so a partial import can't leave a project half-populated).
- Frontend `steps/projects/` — project cards with thumbnails and Total/Available/Sold counts, and the Plot List / Import CSV `tab-bar` with a paginated table and a per-row error list on the import tab.

---

## Phase 10 — Step 6: Admin Team & Roles

The role enum landed in Phase 1; this adds the ability to create accounts using it. There is currently **no endpoint that can create an admin** — `AssociateProvisioningService.java:58` hardcodes `AssociateRole.ASSOCIATE`.

- `POST /api/company/admins` → `CreateAdminRequest(@NotBlank userId, @NotBlank fullName, @NotBlank role, String temporaryPassword)`. Restricted to `SUPER_ADMIN` and `ADMIN` (its own `SecurityConfig` matcher above the blanket rules). Rejects `ASSOCIATE` as a role. Sets `mustChangePassword = true`, `rankId = null`, `kycStatus = VERIFIED`. If `temporaryPassword` is blank, generates one with the existing `SecureRandom` helper and returns it **once** — reuse `AssociateProvisioningService`'s generator rather than writing a second one.
- `GET /api/company/admins/user-id-available?userId=` — live uniqueness check the mockup implies. Needs its own `permitAll`-adjacent handling: it's a `GET`, so `anyRequest().authenticated()` already covers it.
- `GET /api/company/admins` → list with `userId`, name, role, `lastActiveAt` (reusing the existing column as "Last Login"), status.
- Permission matrix: a static `AdminRolePermissions` map exposed via `GET /api/company/admins/role-permissions`, driving the mockup's read-only Permissions Preview. This is the seam where per-role authority narrowing lands later; for now it is documentation the UI renders, and the code comment says so explicitly.
- Frontend `steps/admin-team/` — the admin table plus an "Add New Admin" `side-panel` with User ID (live availability), Full Name, Role select, Temporary Password with a Generate button, Permissions Preview checklist, and Create Admin.

---

## Phase 11 — Step 7: Root Associate(s)

- No new tables — root associates are `associate` rows with `parentId = null`, `sponsorId = null`, `position = null`.
- `POST /api/company/root-associates` → `CreateRootAssociateRequest(@NotBlank name, @NotBlank phone, boolean seedRightRoot, String rightName, String rightPhone)`. Reuses `AssociateProvisioningService` for ID generation and the temporary password. Rejects a second left root if one exists.
- `GET /api/company/root-associates` → existing roots plus left/right slot occupancy for the tree preview.
- `associate` needs a `phone` column — **`V11__associate_phone.sql`** (nullable; the spec captures phone for roots, and the PRD wants it generally).
- Frontend `steps/root-associates/` — the binary tree preview (root node card, Left/Right slot boxes with "Empty" state), the left-root form with read-only auto-generated Associate ID, and the optional right-root toggle.
- Per the spec this step **flags rather than blocks**: an inline warning that referral placement won't work until a root exists, and it does not gate Go Live.

---

## Phase 12 — Company Settings + Audit Log

**`V12__settings_audit_log.sql`** — `settings_audit_log`: `id`, `changed_by_associate_id`, `section VARCHAR(32)`, `summary TEXT`, `detail TEXT` (JSON before/after), `changed_at TIMESTAMP`. `idx_settings_audit_changed_at` descending.

- `company/SettingsAuditService.record(section, summary, detail, actorId)` called from every settings-mutating service. Append-only — no update or delete endpoint exists, deliberately.
- `GET /api/company/audit-log?section=&page=` — paginated, newest first.
- Frontend `settings/settings-shell.component.ts` — the left nav (the seven sections + Audit Log) wrapping the **same step components** in `mode="settings"`.
- Read-only summary cards per the mockup, each with Edit/Manage, plus the compensation card's `Current Version v2.1 (Effective …)` label and View History link (from Phase 6's history endpoint).
- `settings/audit-log/` — avatar + who-changed-what + timestamp rows.

---

## Risks and landmines

| Risk | Mitigation |
|---|---|
| `AuthExceptionHandler`'s hardcoded `"email and password are required"` fires for every controller's validation failure | Phase 0 replaces it with a field-level `ApiExceptionHandler`; the auth handler keeps only `InvalidCredentialsException` |
| `ddl-auto: validate` fails the context on any entity/schema mismatch | Every phase pairs its entity change with its migration in the same task; `@DataJpaTest` runs real Flyway against H2 and catches drift |
| `SecurityConfig` first-match-wins: new public/associate-reachable endpoints get swallowed by the blanket ADMIN write rules | Every new matcher goes **above** lines 53-56, and `SecurityConfigTest` gains a case per endpoint. Applies to the logo POST and both public branding GETs |
| Sub-roles aren't covered by `hasAuthority("ADMIN")` — new staff would be locked out of all writes | Phase 1 switches to `hasAnyAuthority(...)` with a test per role |
| `chk_associate_rank_required` forces a rank on the four new staff roles | V4 inverts it to `role <> 'ASSOCIATE' OR rank_id IS NOT NULL` |
| Flyway checksum breakage (already happened once, documented in README) | Forward migrations only, V4+. Never edit V1–V3. `V900` dev seed is the sole exception |
| 4kB `anyComponentStyle` budget vs style-heavy wizard steps | Shared primitives in global SCSS partials; component styles hold only step-specific layout |
| en/hi key parity drift across a large volume of new copy | Each step task adds keys to **both** files in the same commit; a spec asserts `Object.keys` parity of the two JSON files |
| Mockito can't mock concrete classes on this JDK | Mock repository interfaces only; instantiate services for real, per the existing four test patterns |
| `DashboardService`'s `@Value` compensation rate becomes stale once the plan is configurable | Phase 6 replaces it with a repository lookup and deletes the property |
| `color-mix()` browser requirement | Baseline-supported (Chrome 111+, Safari 16.2+, Firefox 113+); acceptable for an internal admin tool, and the only modern-CSS dependency introduced |
| An admin picks an unreadable brand color | `ThemeService` computes `--brand-primary-contrast` by luminance; the Branding step warns below 4.5:1 but never blocks |
| Gateway credentials in plaintext | Encrypted at rest via `TextEncryptor` + `PLOTCHAIN_SECRETS_KEY`; never returned by any GET |
| Partial CSV import leaving a project half-populated | Two-phase validate/commit, all-or-nothing on commit |

### Spec gaps flagged, not silently invented

- **Settlement cycle "custom"** — the spec lists it as an option but never says what's configurable. Persisted as an enum value with no extra parameters; the UI disables it with a "coming soon" note rather than shipping a half-defined editor.
- **Terms of Service / Privacy Policy** content doesn't exist. Step 8 links to placeholder routes; acceptance is still recorded.
- **`registration_number` "format-checked"** — no format given. GSTIN's standard 15-character pattern is applied, and the field stays optional per the spec.
- **Reward tier "no gaps"** is validated as contiguous levels with strictly increasing thresholds; the spec says "ordered, no gaps" without defining it.
- **Role permission matrix** is displayed but not enforced per-role in Phase 10 — all admin-family roles can write. Enforcement is a named follow-up, not an assumed part of this plan.

---

## Verification

**Automated** (must pass at the end of every task):

```bash
mvn -f backend/pom.xml test
cd frontend && npx ng test --watch=false --browsers=ChromeHeadless
```

Baselines to beat: backend ~30 tests, frontend ~30. Single-target runs: `mvn -f backend/pom.xml test -Dtest=CompensationPlanServiceTest`, `npx ng test --watch=false --include='**/branding-step.component.spec.ts'`.

**Reset to a pre-setup state** (required to re-test the wizard from zero):

```bash
docker compose up -d
dropdb -h localhost -p 5434 -U plotchain plotchain && createdb -h localhost -p 5434 -U plotchain plotchain
export JWT_SECRET=$(openssl rand -base64 48)
export PLOTCHAIN_SECRETS_KEY=$(openssl rand -base64 32)
export PLOTCHAIN_ADMIN_USER_ID=admin PLOTCHAIN_ADMIN_PASSWORD='ChangeMe123!' PLOTCHAIN_ADMIN_EMAIL=admin@example.com
mvn -f backend/pom.xml spring-boot:run
cd frontend && npx ng serve
```

`AdminBootstrapRunner` only fires on an empty database, so the drop/create is what makes the founding-admin path re-testable.

**Manual end-to-end walkthrough:**

1. Log in at `/login` as `admin` — confirm the **Associate ID** field (not email), and that `mustChangePassword` forces the change-password screen first.
2. After the password change, confirm the redirect lands on `/setup/company-profile` and the rail reads a low percentage with steps 1–8 listed.
3. Fill Company Profile; confirm the Company Card Preview updates live and "Saved just now" appears on blur. Reload the page — data persists, the rail shows step 1 complete.
4. Branding: upload square and wide logos, set primary to something distinct (e.g. `#E11D48`) and secondary to `#F59E0B`. Confirm the **Live Login Preview only** re-colors while unsaved. Save, and confirm the whole app — rail, buttons, progress bar gradient — adopts the new colors, and that the browser tab favicon becomes the uploaded logo.
5. Compensation: set the percentages, add two royalty ranks and three reward tiers. Confirm Sample Earnings recomputes per keystroke and Final Earnings renders with lakh grouping (`₹1,63,200`). Try a gapped tier list (levels 1, 3) and confirm the 409 surfaces as a field error. Save, then edit again and confirm History shows two versions with distinct effective dates.
6. Payments & KYC: configure gateway, bank account, Strict KYC, auto-approve under ₹25,000. Reload and confirm credentials come back masked, not in plaintext.
7. Review & Launch: confirm the checklist shows 1/2/3/5 complete and 4/6/7 optional-incomplete, and that **Go Live** is enabled. In a second browser, confirm an associate login is rejected while `launched_at IS NULL`.
8. Accept terms, click Go Live. Confirm the status flips in place with no reload, `/setup` now redirects to `/settings`, and the associate login succeeds.
9. Post-launch: complete Projects (add a project, import a CSV with one deliberately bad row — confirm the per-row error appears and nothing commits; fix it and confirm 450 plots land), Admin Team (create `finance01`, confirm the temporary password shows once, then log in as it and confirm the forced password change), and Root Associates (create the left root, confirm the auto-generated `VP00001` and the tree preview's Empty slots).
10. Settings → Audit Log: confirm every change above is listed with actor, section, summary and timestamp, newest first.
11. Open the existing associate dashboard and confirm it is dark-themed and uses the admin's brand colors for the progress and leg-volume gauges.
