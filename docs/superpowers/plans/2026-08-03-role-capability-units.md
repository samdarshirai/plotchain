# Role Capability & Data Visibility — Unit Queue

Sliced from `docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md` by spec-slicer via `spec-cycle-orchestrator`, 2026-08-04.

**Reconciled against a pre-existing plan** committed before this slice existed: `docs/superpowers/plans/2026-08-03-role-model-collapse.md` (commit `c949339`, 948 lines) already covers 7 of these 11 units in detail. Where it does, that plan is authoritative — units below point at its task numbers rather than getting a redundant new plan written. Not yet verified line-by-line against this slice's acceptance criteria; do that before executing any of the mapped units, don't assume the mapping is exact.

**Status legend:** `pending` (no plan) · `planned` (plan exists, not implemented) · `merged` (implemented, reviewed, on `master`)

| # | Type | Unit | Depends on | Status | Plan file | Merged as |
|---|---|---|---|---|---|---|
| 1 | backend | Only ADMIN role carries back-office authority | none | planned | `2026-08-03-role-model-collapse.md` Tasks 2–3 | — |
| 2 | backend | Admin seeded as single root account via Flyway migration | none | planned | `2026-08-03-role-model-collapse.md` Task 1 | — |
| 3 | backend+removal | Root Associate no longer exists as separate account/step | 2 | planned | `2026-08-03-role-model-collapse.md` Task 5 (+ Task 9 frontend) | — |
| 4 | backend+removal | Admin Team setup step removed | 1 | planned | `2026-08-03-role-model-collapse.md` Task 4 (+ Task 9 frontend) | — |
| 5 | backend | Associate can view their own subtree | none | planned | `2026-08-03-role-model-collapse.md` Task 7 | — |
| 6 | backend | Associate can view available plots | 1 (verify overlap — see original slice's open question) | planned | `2026-08-03-role-model-collapse.md` Task 6 | — |
| 7 | backend | Plot booking + EMI schedule runtime | 6 | **pending** | — (not covered by the pre-existing plan) | — |
| 8 | backend | Associate can submit KYC + view own status | none | **pending** | — (not covered by the pre-existing plan) | — |
| 9 | backend | Associate can view own rank progress / reward tiers | none | **pending** | — (not covered by the pre-existing plan) | — |
| 10 | backend | Associate can view their digital ID card | none | **pending** | — (not covered by the pre-existing plan) | — |
| 11 | backend | Associate can view and edit their own profile | none | planned | `2026-08-03-role-model-collapse.md` Task 8 | — |
| 12 | **screen** | Associate "My Tree" screen | 5 | pending | — | — |
| 13 | **screen** | Associate "Plot Bookings + EMI schedule" screen | 6, 7 | pending | — | — |
| 14 | **screen** | Associate "Profile & Bank/KYC Details" screen (the one editable screen — submit KYC docs, edit profile) | 8, 11 | pending | — | — |
| 15 | **screen** | Associate "Rewards & Perks progress" screen | 9 | pending | — | — |
| 16 | **screen** | Associate "Digital ID Card" screen | 10 | pending | — | — |

Units 12–16 added 2026-08-05, retroactively, same reason as cycle-management unit 11 — screens weren't sliced alongside endpoints the first pass. Grouped by the spec's own Associate Screens list, not 1:1 per endpoint: units 8 (KYC submission) and 11 (profile edit) share one screen unit (14) because the spec's own screen list names them as one screen — "Profile & Bank/KYC Details (the one editable screen)" — not two. Same reasoning for 13 (plots-view + booking/EMI share one "Plot Bookings" screen). Units 1–4 get no screen unit: 1–2 are pure backend/authority changes with no new screen surface, and 3–4 are *removals* of existing setup-wizard frontend, already inside those units via Task 9 — not a new screen to build.

**Skipped (already aligned, no unit needed):** Dashboard/stats, Associate directory, Audit log — see original slice.

**Before executing units 1–6 or 11:** read `role-model-collapse.md`'s relevant task(s) in full and confirm its acceptance criteria actually satisfy this slice's — it was written independently of this slice and may diverge in scope or convention (e.g. check it against this repo's current `SecurityConfig.java`/`AssociateRole` state, which may have moved since `c949339`). Confirmed by direct read (2026-08-05): Tasks 7 and 8 are backend-only (new endpoints, no Angular work) — units 12 and 14's screen work is not secretly already done by this plan.

**Units 7–10 need a plan written from scratch** — nothing pre-existing covers them. **Units 12–16 (all screens) need a plan written from scratch too** — the pre-existing plan never touches the frontend beyond deleting the two setup-wizard steps.
