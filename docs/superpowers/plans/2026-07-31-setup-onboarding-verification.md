# Verification Report: Company Setup & Onboarding

Verified against `setup-onboarding-spec.md` and `ChatGPT Image Jul 29, 2026, 11_07_58 PM.png` (the design mockup), by driving a real headless-browser session through a freshly-bootstrapped instance (clean DB, `AdminBootstrapRunner` fired). Backend (373 tests) and frontend (330 tests) suites both pass; this report covers manual/browser findings the suites don't catch.

---

## Issues found

Ranked by severity.

### 1. Root Associate creation is broken on every fresh deployment, and the error message actively misleads the admin

**Files:** `backend/src/main/java/com/plotchain/company/RootAssociateProvisioningService.java:56-58`, `frontend/src/app/setup/steps/root-associates/root-associates-step.component.ts:220-222`

Nothing in the codebase seeds `rank_tier` rows. An earlier phase (`docs/superpowers/plans/2026-07-29-account-provisioning.md:146`) deliberately *removed* the old test-data `INSERT INTO rank_tier` from `V2__add_associate_auth.sql`, and no later migration or admin UI replaces it. Every associate row (root associates included) requires a non-null `rank_id` FK, so:

- `GET /api/company/root-associates` correctly returns `{"roots":[],"leftOccupied":false,"rightOccupied":false}` — no root exists.
- `POST /api/company/root-associates` throws `NoRankTiersConfiguredException`, mapped to **409** with body `{"error":"No rank tiers are configured; an associate cannot be created without a rank"}` (`AssociateProvisioningExceptionHandler.java:23-25`).
- The frontend's error handler treats **any** 409 from this endpoint as `RootAssociateAlreadyExistsException` and shows *"A root associate already exists"* — the wrong message, pointing the admin at a nonexistent problem instead of the real, fixable one.

Reproduced with a full network trace (request/response bodies) and a direct DB check confirming the `associate` table has only the bootstrapped admin row, no root.

**Impact:** Step 7 (Root Associate) can never be completed on a real fresh deployment. This also blocks associate provisioning generally, since `AssociateProvisioningService.java:46-48` has the identical `NoRankTiersConfiguredException` dependency.

**Fix direction:** seed a default `rank_tier` set (the mockup shows Silver/Gold/Diamond/Crown) via a new Flyway migration, or build the rank-management surface the spec assumes exists; separately, stop collapsing every 409 into "already exists" — surface the backend's actual error message.

### 2. Post-password-change redirect doesn't land the admin in the setup wizard

Spec (`docs/superpowers/plans/2026-07-30-setup-onboarding.md:230`, walkthrough step 2) requires: admin + not launched → forced password change → `/setup/company-profile`. On a fresh instance it instead lands on the pre-existing `/admin/associates/new` ("Provision a New Associate") screen. The wizard itself is unaffected — navigating to `/setup` directly works and resumes correctly — so this is an isolated missing routing rule in the post-login/post-password-change flow, not a wizard defect.

### 3. Sample Earnings Preview never shows the ₹ symbol

Compensation step's live preview (`compensation-step.component.ts`) uses correct Indian digit grouping (`1,73,500`) but no currency symbol anywhere in the panel — every figure in the mockup and the spec's own example ("if an associate sells ₹10L... they'd earn ₹X") is ₹-prefixed. Confirmed via page content: no `₹` glyph anywhere in the `.compensation-step__earnings` markup.

### 4. Cosmetic / minor

- **Terms links render with no separator**: `review-launch-step` template has `<a>Terms of Service</a><a>Privacy Policy</a>` back-to-back with no space, rendering as `Terms of ServicePrivacy Policy`.
- **Company Settings → Projects & Plots: orphaned Save button.** The step's `app-setup-step-nav` (mode="settings") is a sibling of `.card`, not inside its layout grid, so the Save button floats detached at the far right of the viewport instead of sitting under the card — every other step's nav renders correctly inline.
- **Reward Tiers table has no visible "Level" column.** By design (`compensation-step.component.ts:451-455`, explicit code comment): level is derived from row order and is never user-editable, specifically to make a gapped-level state unconstructable through the UI. This means the walkthrough's literal "enter levels 1 and 3, confirm the 409" step cannot be reproduced via the UI — the backend's `RewardTierGapException` still exists as defense-in-depth, but the UI prevents the bad state by construction instead of erroring on it. Better UX, but a real behavior difference from the spec's literal wording.
- **No "Forgot password?" link** anywhere (real login page, or its Live Login Preview), unlike the mockup. Given the spec's explicit "no verification loops, no OTP, no email confirmation" principle, a working reset flow wouldn't have anywhere to go — this is plausibly an intentional omission rather than a bug, but it is a visible mockup deviation.

---

## What worked correctly (no deviation found)

- Login uses **Associate ID**, not email; `mustChangePassword` forces the change-password screen first.
- Company Profile: all 7 fields, live Company Card Preview, "Saved just now" autosave, persists across reload.
- Branding: scoped Live Login Preview (colors apply only to the preview panel pre-save) vs. whole-app retheme + favicon change post-save — both verified precisely, including on a second, logged-out browser context hitting the real `/login` page.
- Compensation: stat-tile percentages, Royalty/Reward editable tables, defaults (TDS 2%, admin charge 5/15%, activation fee ₹1,100, semi-monthly) all match spec; versioning creates a new row per edit (confirmed via Audit Log: "Updated compensation plan (v2)").
- Payments & KYC: 4-panel layout matches mockup; KYC strictness has no OFF state; gateway credentials correctly masked (`Configured`, no plaintext) after reload.
- Admin Team: user ID + role + temporary password (generate button) + one-time-display warning, all correct.
- Review & Launch: checklist accurately reflects step completion (1/2/3/5 complete, 4/6/7 incomplete); Go Live is disabled until required steps done **and** terms accepted; launching flips state in place with no reload, and `/setup` redirects to `/settings` afterward.
- Audit Log: accurate, newest-first, no secrets leaked in the payment-config entries.
- No browser console errors across any screen tested.

---

## Screen-by-screen comparison vs. `ChatGPT Image Jul 29, 2026, 11_07_58 PM.png`

The mockup shows all 8 wizard steps plus post-launch Company Settings and Audit Log in one composite image. Comparing each panel to the corresponding real screen:

### Step 1 — Company Profile
Mockup: form + live "Company Card Preview" tile (logo placeholder, name, phone, email, address), rail at "12% Complete."
Actual: **matches closely.** Same 7 fields, same live-updating preview card, "Saved just now" indicator present. Only difference: the Company Card Preview's logo/building-icon graphic is absent until Branding is completed (expected — no logo exists yet at this point in a fresh run; mockup's version was captured post-branding).

### Step 2 — Branding
Mockup: color pickers (swatch + hex), square/wide logo tiles, tagline counter, "Live Login Preview" panel (logo, tagline, Associate ID, Password, Show, gradient Login button, **Forgot password? link**).
Actual: **matches** except no "Forgot password?" link anywhere (issue #4). Scoped preview vs. whole-app retheme behavior verified correct, logo upload + favicon change verified correct.

### Step 3 — Compensation Plan
Mockup: 3 stat-tiles, Royalty Bonus table (Rank | %), Reward Tiers table (Level | Volume (₹) | Reward), Sample Earnings Preview with ₹-prefixed line items, amber "future cycles only" banner, "Current Version v2.1" + View History.
Actual: stat-tiles, tables, banner, and versioning all present and functional. **Differences:** (a) Sample Earnings Preview has no ₹ symbol (issue #3); (b) Reward Tiers table has no "Level" column — mockup shows it as the first column, actual omits it entirely (issue #4); (c) Royalty Bonus Table's "Rank" column is an empty `<select>` in a fresh deployment because no ranks exist to populate it (downstream symptom of issue #1) — mockup shows it pre-populated with Silver/Gold/Diamond/Crown.

### Step 4 — Projects & Plots
Mockup: project cards with thumbnails, Total/Available/Sold counts, Plot List / Import CSV tab bar, paginated table.
Actual: only the empty state was exercised (`+ Add Project` header, no cards). Structure present; full card/table/CSV-import UI not exhaustively re-verified in this pass.

### Step 5 — Payments & KYC
Mockup: 4-panel layout — Payment Collection, Payout/Disbursement Account, KYC Requirements (Strict/Relaxed), Withdrawal Approval with flow preview (Request Raised → Admin Review → Approved → Payout Initiated).
Actual: **matches exactly**, including the 4-step flow preview list and masked credentials after reload.

### Step 6 — Admin Team & Roles
Mockup: admin table (User ID, Name, Role, Last Login, Status) + "Add New Admin" side panel with live user-ID check, Role select, Temporary Password + Generate, read-only Permissions Preview.
Actual: **matches.** Table, side panel, Generate button, one-time password display all verified working. Only cosmetic difference: mockup's "Add Admin" is a prominent top-right button; actual is a plain text link below the table.

### Step 7 — Root Associate(s)
Mockup: binary tree preview with Root/Left Slot/Right Slot boxes ("Empty" states styled as cards), form with auto-generated read-only Associate ID.
Actual: form and warning banner match; binary tree preview renders as plain text ("Root / LeftEmpty / RightEmpty") rather than the mockup's boxed slot cards — but this is moot given issue #1: **creation itself fails**, so the tree preview was never exercised with real data.

### Step 8 — Review & Launch
Mockup: Summary Checklist with per-step Complete badges + Edit links, "You're all set!" panel, terms checkbox with **separated** "Terms of Service" / "Privacy Policy" links, gradient Go Live button (disabled until ready).
Actual: **matches**, including exact gating behavior and the in-place "You're live!" transition. Only difference: the two policy links are concatenated with no space (issue #4).

### Post-Launch: Company Settings
Mockup: left-nav settings shell (7 sections + Audit Log), read-only summary cards, Compensation card showing "Current Version v2.1 (Effective ...)" + View History.
Actual: **matches closely** — nav rail, summary cards, and the versioned Compensation card all present. One layout bug specific to this area: Projects & Plots' Save button floats detached from its card (issue #4).

### Audit Log
Mockup: avatar + actor + action summary + timestamp, newest first.
Actual: **matches exactly**, verified with real entries (company profile, branding, logo uploads, compensation v2, payment config, withdrawal settings, admin creation), correctly ordered newest-first, no secrets exposed.

---

## Not fully exercised in this pass

- Projects & Plots CSV import (template download, per-row validation, all-or-nothing commit).
- Root Associate flow end-to-end (blocked by issue #1).
- Associate-role login rejection while `launched_at IS NULL` (no associate account could be created to test with, due to issue #1) — verified instead at the code level: `AuthService.login`'s setup-mode gate exists as described in the plan.
- Compensation gap-validation (`levels 1, 3 → 409`) via the UI — not reproducible through the UI by design (see issue #4).
