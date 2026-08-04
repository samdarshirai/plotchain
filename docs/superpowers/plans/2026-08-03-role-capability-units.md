# Role Capability & Data Visibility — Unit Queue

Sliced from `docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md` by spec-slicer via `spec-cycle-orchestrator`, 2026-08-04.

**Reconciled against a pre-existing plan** committed before this slice existed: `docs/superpowers/plans/2026-08-03-role-model-collapse.md` (commit `c949339`, 948 lines) already covers 7 of these 11 units in detail. Where it does, that plan is authoritative — units below point at its task numbers rather than getting a redundant new plan written. Not yet verified line-by-line against this slice's acceptance criteria; do that before executing any of the mapped units, don't assume the mapping is exact.

**Status legend:** `pending` (no plan) · `planned` (plan exists, not implemented) · `merged` (implemented, reviewed, on `master`)

| # | Unit | Depends on | Status | Plan file | Merged as |
|---|---|---|---|---|---|
| 1 | Only ADMIN role carries back-office authority | none | planned | `2026-08-03-role-model-collapse.md` Tasks 2–3 | — |
| 2 | Admin seeded as single root account via Flyway migration | none | planned | `2026-08-03-role-model-collapse.md` Task 1 | — |
| 3 | Root Associate no longer exists as separate account/step | 2 | planned | `2026-08-03-role-model-collapse.md` Task 5 (+ Task 9 frontend) | — |
| 4 | Admin Team setup step removed | 1 | planned | `2026-08-03-role-model-collapse.md` Task 4 (+ Task 9 frontend) | — |
| 5 | Associate can view their own subtree | none | planned | `2026-08-03-role-model-collapse.md` Task 7 | — |
| 6 | Associate can view available plots | 1 (verify overlap — see original slice's open question) | planned | `2026-08-03-role-model-collapse.md` Task 6 | — |
| 7 | Plot booking + EMI schedule runtime | 6 | **pending** | — (not covered by the pre-existing plan) | — |
| 8 | Associate can submit KYC + view own status | none | **pending** | — (not covered by the pre-existing plan) | — |
| 9 | Associate can view own rank progress / reward tiers | none | **pending** | — (not covered by the pre-existing plan) | — |
| 10 | Associate can view their digital ID card | none | **pending** | — (not covered by the pre-existing plan) | — |
| 11 | Associate can view and edit their own profile | none | planned | `2026-08-03-role-model-collapse.md` Task 8 | — |

**Skipped (already aligned, no unit needed):** Dashboard/stats, Associate directory, Audit log — see original slice.

**Before executing units 1–6 or 11:** read `role-model-collapse.md`'s relevant task(s) in full and confirm its acceptance criteria actually satisfy this slice's — it was written independently of this slice and may diverge in scope or convention (e.g. check it against this repo's current `SecurityConfig.java`/`AssociateRole` state, which may have moved since `c949339`).

**Units 7–9, 10 need a plan written from scratch** — nothing pre-existing covers them.
