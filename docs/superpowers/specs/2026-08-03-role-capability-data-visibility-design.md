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
| Associate directory | Full list, filter by rank/KYC status/join date, drill into any profile | No directory access. "Refer / Invite" adds a new associate placed under self (L or R) |
| Sales | Full sales register — all associates, void/export | Own sales + descendant sales (team-volume reports); can record a new sale |
| Income / ledger | All associates' ledger entries (for reports/audit) | Own ledger entries only, itemized by income type (direct/matching/sponsor/royalty/reward) |
| Wallet & withdrawal | Approval queue — approve/reject/hold any associate's withdrawal request | Own wallet balance, own withdrawal requests + status |
| Plot / project inventory | Full CRUD — create projects, plots, pricing, EMI plans | View available plots, book a plot for a buyer, view own bookings + EMI schedule |
| KYC | Review queue — approve/reject any associate's submission | Own KYC submission + status only |
| Compensation rules | Configure direct/matching/sponsor %, royalty table, reward thresholds (versioned) | View own rank progress / reward tiers (read-only) |
| Cycle management | Trigger/monitor/re-run settlement cycle close | Own cycle-scoped reports only, no control over cycle state |
| e-PIN | Generate/allocate batches | Redeem a PIN for own activation or downline top-up |
| Announcements | Compose/publish | Read-only feed |
| Support tickets | Queue — view/respond to all tickets | Raise/track own tickets |
| Audit log | Full log, every actor and action | No access |
| Digital ID card | No dedicated screen (not the persona this serves) | Own ID card only (photo, ID number, rank, QR) |

## Screens (derived from the matrix)

**Admin (back-office, web)**: Company Dashboard, Associate Directory + profile drill-down, Tree Explorer (full org), Sales Register, Project & Plot Management, Cycle Management, Compensation Rules Config, Withdrawal/Payout Approval Queue, KYC Review Queue, e-PIN Generation, Announcement Composer, Support Ticket Queue, Reports & Exports, Audit Log.

**Associate (mobile-first)**: Dashboard/Home, My Tree (own subtree), Sales/New Sale, Income Statement (per income type), Payout/Withdrawal History + request, Refer/Invite (choose L/R placement), Rewards & Perks progress, Profile & Bank/KYC details, Plot booking + EMI view, Digital ID Card, Support tickets (raise/track), Announcements feed (read-only), Notifications.

No screen is admin-family-conditional anymore (no "Finance sees this tab, Support doesn't") — a screen is either Admin-only, Associate-only, or (rare — e.g. Announcements feed content) the same data both can read.

## Out of scope / removed (not deferred)

- `SUPER_ADMIN`, `FINANCE`, `KYC_REVIEWER`, `SUPPORT` roles, `AssociateRole.isAdminFamily()`, `company/AdminRolePermissions.java`, the Admin Team setup step and its frontend (`frontend/src/app/setup/steps/admin-team/**`), `admin-team.model.ts`. If delegated back-office staff roles are needed later, that's a new spec built on top of this one, not a resurrection of Phase 10's version.
- `company/RootAssociateProvisioningService.java`, `RootAssociateController`, `CreateRootAssociateRequest`/`Response`, `RootAssociateSlotsResponse`, `RootAssociateAlreadyExistsException`, `RightRootDetailsRequiredException`, the Root Associate setup step (Step 7) and its frontend.
- Per-role narrowing already shipped in `AdminAssociateController` (suspend/reactivate/reset-password) and `KycReviewController` (decide) collapses to a plain `ADMIN`-only check (no more `SUPER_ADMIN`/`KYC_REVIEWER` alternates).
- `SecurityConfig.java`'s blanket admin-family `hasAnyAuthority(...)` write rules simplify to `hasAuthority("ADMIN")`.

## Open questions

1. Where does the Admin account itself get created — is `AdminBootstrapRunner` (currently seeding a founding `ADMIN` row) also the mechanism that gives it root tree position (`parent_id = null`), or does that need its own field/flag distinguishing "the one admin" from a future associate with no parent? Needs a look at `AdminBootstrapRunner` before the implementation plan is written.
2. Does the Admin's root position participate in leg-volume/matching-income calculations at all, or is it purely a tree anchor with no income of its own? (The compensation engine spec computes matching income per associate — the root may need to be explicitly excluded.)
3. Self-serve e-PIN generation by an Associate for their own downline top-up — PRD open question #2, still unresolved, orthogonal to this role model but affects the Associate e-PIN screen's exact affordances.

## Reconciliation & gap-fill (next step)

This spec defines the target state. Before writing the implementation plan, a reconciliation pass is needed against the current codebase: for every endpoint currently gated by the admin-family blanket rule, confirm it becomes `ADMIN`-only under the new model (it does, since there's no more admin-family split), then separately audit every domain in the matrix above against what's actually query-scoped to "self + descendants" vs. what today accidentally returns company-wide data to an associate token. That audit plus the deletions listed above becomes the writing-plans input.
