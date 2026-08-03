# Role Capability & Data Visibility Model (Admin / Associate)

**Supersedes:**
- `land-mlm-platform-prd.md` §4 (persona table) and §5.2 (Admin/Back-office feature list's "RBAC: super-admin, finance, KYC-reviewer, support") — narrows back to the two-role direction `docs/superpowers/specs/2026-07-29-remove-tenant-id-design.md` already stated ("this is a single-tenant application... with two roles — admin and associate") before Phase 10 reintroduced four admin sub-roles.
- `mlm-land-platform-spec.md` §5.2 ("Admin Login (RBAC)" row) — same narrowing.
- `docs/superpowers/plans/2026-07-30-setup-onboarding-phase-10.md` (Admin Team step: `SUPER_ADMIN`/`FINANCE`/`KYC_REVIEWER`/`SUPPORT` account creation, `AdminRolePermissions` preview) and the Root Associate step in `docs/superpowers/plans/2026-07-30-setup-onboarding-phase-0-1.md` roadmap / `setup-onboarding-spec.md` Step 7 — both features are removed by this design, not narrowed.
- `docs/superpowers/specs/2026-08-02-admin-usage-core-ops-design.md` §"per-role access" table (SUPER_ADMIN/ADMIN/FINANCE/KYC_REVIEWER/SUPPORT split) — collapses to a single ADMIN row.

## Context

Product direction, restated: one deployment, one organization, two account types — **Admin** (back-office + sits at the root of the binary tree) and **Associate** (an individual placed left or right somewhere in the tree). This spec exists to answer, for every domain of data in the system, "who sees what" — and that answer is what drives which screens get built and what each screen shows, rather than deriving screens from a feature checklist first.

Two things currently in the codebase conflict with this and are removed here:

1. **Admin sub-roles** (`SUPER_ADMIN`, `FINANCE`, `KYC_REVIEWER`, `SUPPORT`) — added in Phase 10 (`AssociateRole` enum, `company/AdminRolePermissions.java`, the Admin Team setup step, `frontend/src/app/setup/steps/admin-team/**`) on top of the two-role decision already made a day earlier. Today they carry no real distinction anyway: `SecurityConfig.java`'s blanket write rule (`hasAnyAuthority("ADMIN", "SUPER_ADMIN", "FINANCE", "KYC_REVIEWER", "SUPPORT")`) treats them identically except for two narrow `@PreAuthorize` checks (`AdminAssociateController` suspend/reactivate/reset-password, `KycReviewController` decide — both `ADMIN`/`SUPER_ADMIN`-plus-one-extra). `AdminRolePermissions` itself is a documentation-only map, never enforced. There is no product ask driving the distinction; it's parked as a future follow-up if delegated back-office staff become a real need.

2. **Root Associate as a separate seeded account** (`company/RootAssociateProvisioningService.java`, `RootAssociateController`, setup-onboarding-spec.md Step 7) — a regular `ASSOCIATE`-role row placed with no parent, created via its own wizard step, distinct from the `ADMIN` login. This design instead makes the Admin account itself the tree root: no separate seeding step, no separate account.

## Role model

- **ADMIN** — exactly one conceptual role (the founding/back-office account). Full back-office visibility across the whole organization, and is the root node of the binary tree (so also has a place in genealogy views, though with no upline/sponsor above it).
- **ASSOCIATE** — an individual account placed `L` or `R` under the Admin (root) or under another Associate. Sees data scoped to itself and its own descendant subtree only.

No other roles. `AssociateRole.isAdminFamily()` and every sub-role branch (`SUPER_ADMIN`, `FINANCE`, `KYC_REVIEWER`, `SUPPORT`) go away — see Out of Scope / Removed for what's deleted vs. deferred.

## Data visibility matrix

The authoritative answer to "who sees what," organized by domain. This is what each screen's query scopes to, not just a UI label.

| Domain | Admin sees | Associate sees |
|---|---|---|
| Dashboard / company stats | Company-wide: total associates, total sales volume, rank distribution, cycle-over-cycle growth | Own cycle summary only: own L/R carry-forward, own new business, own associate counts, own income totals |
| Tree / genealogy | Full org tree from root, any node, leg-volume anomaly flags | Subtree rooted at self only — own direct downline + full L/R descendants. No visibility into ancestors above self or siblings' other branches |
| Associate directory | Full list, filter by rank/KYC status/join date, drill into any profile; places every new associate (choose parent + L/R) | No directory access, no self-serve invite — Admin places new associates on their behalf |
| Sales | Full sales register — all associates, void/export, records every sale | Own sales + descendant sales (team-volume reports), view-only |
| Income / ledger | All associates' ledger entries (for reports/audit) | Own ledger entries only, itemized by income type (direct/matching/sponsor/royalty/reward), view-only |
| Wallet & withdrawal | Approval queue — approve/reject/hold; also submits withdrawal requests on an associate's behalf | Own wallet balance, own withdrawal history + status, view-only |
| Plot / project inventory | Full CRUD — create projects, plots, pricing, EMI plans; books plots against any associate's record | View available plots, own bookings + EMI schedule, view-only |
| KYC | Review queue — approve/reject any associate's submission | Own KYC submission + status only, view-only |
| Compensation rules | Configure direct/matching/sponsor %, royalty table, reward thresholds (versioned) | View own rank progress / reward tiers (read-only) |
| Cycle management | Trigger/monitor/re-run settlement cycle close | Own cycle-scoped reports only, no control over cycle state |
| e-PIN | Generate/allocate batches, redeems on an associate's behalf | Own PIN/activation status, view-only |
| Announcements | Compose/publish | Read-only feed |
| Support tickets | Queue — logs and responds to tickets on any associate's behalf | Own ticket history, view-only |
| Audit log | Full log, every actor and action | No access |
| Digital ID card | No dedicated screen (not the persona this serves) | Own ID card only (photo, ID number, rank, QR) |
| **Own profile** | Own profile (Admin has no separate "profile edit" concept beyond password) | **View and edit own profile — the one write action available to an Associate** (name, contact, bank details, KYC docs, login/transaction password) |

## Screens (derived from the matrix)

Every associate-initiated action beyond editing their own profile — recording a sale, placing a new associate (L/R), requesting a withdrawal, booking a plot, redeeming an e-PIN, raising a support ticket — is performed by Admin on the associate's behalf, not self-serve in the associate app. This is a deliberate v1 narrowing (matches how the manual back-office reference process already works), not an oversight; the associate app is a reporting/visibility surface plus profile management, full stop.

**Admin (back-office, web)**: Company Dashboard, Associate Directory + profile drill-down + add new associate (choose parent + L/R), Tree Explorer (full org), Sales Register + record new sale (for any associate), Project & Plot Management + book a plot (against any associate), Cycle Management, Compensation Rules Config, Withdrawal/Payout Approval Queue + submit a withdrawal request (on an associate's behalf), KYC Review Queue, e-PIN Generation + redemption (on an associate's behalf), Announcement Composer, Support Ticket Queue + log a ticket (on an associate's behalf), Reports & Exports, Audit Log.

**Associate (mobile-first, view + own-profile-edit only)**: Dashboard/Home, My Tree (own subtree, view-only), Sales History (own + descendant, view-only), Income Statement (per income type, view-only), Payout/Withdrawal History (view-only), Rewards & Perks progress (view-only), Plot Bookings + EMI schedule (view-only), Digital ID Card (view-only), Support Ticket history (view-only), Announcements feed (view-only), Notifications (view-only), **Profile & Bank/KYC Details (the one editable screen)**.

No screen is admin-family-conditional anymore (no "Finance sees this tab, Support doesn't") — a screen is either Admin-only, Associate-only, or (rare — e.g. Announcements feed content) the same data both can read. Within Associate-only screens, exactly one (Profile) accepts writes; the rest are pure reports.

## Out of scope / removed (not deferred)

- `SUPER_ADMIN`, `FINANCE`, `KYC_REVIEWER`, `SUPPORT` roles, `AssociateRole.isAdminFamily()`, `company/AdminRolePermissions.java`, the Admin Team setup step and its frontend (`frontend/src/app/setup/steps/admin-team/**`), `admin-team.model.ts`. If delegated back-office staff roles are needed later, that's a new spec built on top of this one, not a resurrection of Phase 10's version.
- `company/RootAssociateProvisioningService.java`, `RootAssociateController`, `CreateRootAssociateRequest`/`Response`, `RootAssociateSlotsResponse`, `RootAssociateAlreadyExistsException`, `RightRootDetailsRequiredException`, the Root Associate setup step (Step 7) and its frontend.
- Per-role narrowing already shipped in `AdminAssociateController` (suspend/reactivate/reset-password) and `KycReviewController` (decide) collapses to a plain `ADMIN`-only check (no more `SUPER_ADMIN`/`KYC_REVIEWER` alternates).
- `SecurityConfig.java`'s blanket admin-family `hasAnyAuthority(...)` write rules simplify to `hasAuthority("ADMIN")`.
- `auth/AdminBootstrapRunner.java` (the `ApplicationRunner` that seeds the founding `ADMIN` row from environment variables on first boot) — replaced by a Flyway migration that seeds the single admin row directly (see Resolved decisions #1).

## Resolved decisions

1. **Admin seeding**: always via a Flyway migration, not `AdminBootstrapRunner`'s environment-variable-driven `ApplicationRunner`. The migration inserts the one `ADMIN` row with `parent_id = null` (making it the tree root by construction, no separate flag needed) and `must_change_password = true`, forcing a password change on first login — same forced-rotation pattern `AdminProvisioningService`/`AdminBootstrapRunner` already use elsewhere. The seeded password is a fixed default baked into the migration; forced change on first login is the control that makes that acceptable.
2. **Admin participates in compensation.** The root's own left/right leg volumes feed into matching income, sponsor matching, royalty, and reward calculations exactly like any other associate node — no special-cased exclusion in the compensation engine.
3. **No self-serve e-PIN (or any other self-serve action) for Associates** — resolved by the broader decision below.

**Associate write scope, generally**: an Associate can view every report in their matrix column and edit their own profile. Every other action that might look associate-initiated in the source PRD/spec (new sale, refer/invite placement, withdrawal request, plot booking, e-PIN redemption, raising a support ticket) is instead something Admin does *on the associate's behalf* — reflected in both the matrix and Screens section above.

## Reconciliation & gap-fill

Audited all 21 backend `@RestController` classes against the matrix. Status per domain:

| Domain | Status | Detail |
|---|---|---|
| Dashboard/stats | **Aligned** | `GET /api/admin/stats` (company-wide), `GET /api/associates/me/dashboard` (self-scoped via `@AuthenticationPrincipal`, not a path param) — both already correct. Only the role-collapse (below) touches these. |
| Tree/genealogy | **Aligned (Admin)** / **Not built (Associate)** | `GET /api/admin/tree/{associateId}` + `/search` exist, admin-only. No "my subtree" endpoint for an Associate at all. |
| Associate directory | **Aligned** | `GET /api/admin/associates` (paginated/filterable), `GET /api/associates` (flat list), `POST /api/associates` (create/place) all exist, admin-only. No associate-facing directory endpoint exists — correct by omission. Unverified: whether `AssociateProvisioningService.create()`'s request shape already carries parent + L/R position — check before planning, don't assume. |
| Sales | **Not built** | No `sale` package/entity/controller exists anywhere in the codebase. This is upstream of the whole compensation engine — biggest single gap. |
| Income/ledger | **Not built** | `income` package has `LedgerEntry` entity + repository only, no controller (neither an admin audit view nor an associate own-ledger view). |
| Wallet/withdrawal | **Not built** | `wallet` package has `Wallet` entity + repository only, no controller. The `payments` package (`WithdrawalConfigController`, etc.) is entirely setup-wizard *policy config* (minimum threshold, frequency) — no `WithdrawalRequest` entity or runtime approval-queue endpoint exists. |
| Plot/project inventory | **Aligned (Admin)** / **Gap (Associate)** | `ProjectController`/`PlotController` full CRUD exists, but their `GET`s are gated admin-family-only in `SecurityConfig` — an Associate token gets 403 on viewing plots today, contradicting the matrix. Needs a new associate-reachable read scope. `PlotBooking`/`EMISchedule` entities don't exist (only `BookingEmiConfig`, a policy setting) — booking/EMI runtime **not built**. |
| KYC | **Gap** | `GET/POST /api/admin/kyc` exist; `decide()` currently allows `KYC_REVIEWER` as an alternate to `ADMIN`/`SUPER_ADMIN` — collapsing that role is a real behavior change (see Migration approach below), not just cleanup. No associate-facing KYC submission (doc upload) or own-status endpoint exists at all — **not built**. |
| Compensation rules | **Aligned (Admin)** / **Not built (Associate)** | `CompensationPlanController` (get/history/put) exists, admin-only, versioned. No associate-facing "my rank progress / reward tiers" endpoint — `rank` package is entity+repo only. |
| Cycle management | **Not built** | `cycle` package is entity/repo/exception only — no controller to trigger, monitor, or view cycle state, for either role. |
| e-PIN | **Not built** | No entity, no package, nothing — full stop. |
| Announcements | **Not built** | `announcement` package is entity+repo only, no controller (neither compose nor read-feed). |
| Support tickets | **Not built** | No package/entity/controller exists anywhere. |
| Audit log | **Likely aligned, verify** | `SettingsAuditController`/`SettingsAuditService` exist and are referenced as the write path for config changes; confirm coverage extends to KYC decisions and suspend/reactivate actions when those controllers are touched during implementation, don't assume. |
| Digital ID card | **Not built** | No endpoint (spec always described this as render-on-demand, not persisted — consistent with not having started). |
| Own profile | **Partially built** | Only `POST /api/associates/me/password` exists (correctly self-scoped by construction). No endpoint for name/contact/bank-details/KYC-doc self-edit. |

### Mechanical role-collapse (applies everywhere, no design decision left)

- `SecurityConfig.java`: all 14 occurrences of `hasAnyAuthority("ADMIN","SUPER_ADMIN","FINANCE","KYC_REVIEWER","SUPPORT")` → `hasAuthority("ADMIN")`.
- `AdminAssociateController` suspend/reactivate/reset-password `@PreAuthorize("hasAnyAuthority('ADMIN','SUPER_ADMIN')")` → `hasAuthority('ADMIN')` — no functional change (`SUPER_ADMIN` was always admin-equivalent).
- `KycReviewController.decide()` `@PreAuthorize(...,'KYC_REVIEWER')` → `hasAuthority('ADMIN')` — **functional change**, see below.
- `AssociateRole` enum: drop `SUPER_ADMIN`/`FINANCE`/`KYC_REVIEWER`/`SUPPORT`; `isAdminFamily()` removed (verify no remaining caller needs it before deleting, rather than assuming).
- Delete outright: `AdminController`, `AdminProvisioningService`, `AdminRolePermissions`, `CreateAdminRequest/Response`, `AdminSummaryResponse`, `UserIdAvailabilityResponse`, `InvalidAdminRoleException`, `UserIdAlreadyRegisteredException` (verify this exception isn't reused by `AssociateProvisioningService`'s own duplicate-userId path before deleting), `AssociateRepository.findByRoleNot` (verify no other caller).
- Delete outright: `RootAssociateController`, `RootAssociateProvisioningService`, `CreateRootAssociateRequest/Response`, `RootAssociateSlotsResponse`, `RootAssociateAlreadyExistsException`, `RightRootDetailsRequiredException`, `RootAssociateCreationResult`.
- `AdminBootstrapRunner` deleted, replaced by a new Flyway migration seeding the one `ADMIN` row directly (Resolved decisions #1).
- Frontend: delete the Admin Team step (`setup/steps/admin-team/**`, `admin-team.model.ts`) and Root Associate step, their routes, and their `SetupStateService.STEP_DEFINITIONS` entries; Review & Launch step-count references need updating to match.

### Migration approach

`role` is `VARCHAR(20)` with a `CHECK` constraint (`V4__user_id_login_and_admin_roles.sql`), not a native Postgres enum — cheap to narrow, same shape as the `tenant_id` precedent (`docs/superpowers/specs/2026-07-29-remove-tenant-id-design.md`). **Resolved: local/dev only, no deployed database carries `SUPER_ADMIN`/`FINANCE`/`KYC_REVIEWER`/`SUPPORT`-role rows or a seeded Root Associate row.** No backfill needed — `V2`/`V4` and the root-associate migration are edited in place, same as the `tenant_id` removal did with `V1`.

This audit is the writing-plans input.
