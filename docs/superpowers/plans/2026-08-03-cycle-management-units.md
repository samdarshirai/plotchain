# Cycle Management — Unit Queue

Sliced from `docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md` by spec-slicer via `spec-cycle-orchestrator`, 2026-08-04. This file is the persisted record of that slice — a fresh session should read this instead of re-running spec-slicer, unless the source spec has changed since.

**Status legend:** `pending` (not started) · `planned` (plan file exists, not yet implemented) · `merged` (implemented, reviewed, on `master`)

| # | Unit | Depends on | Status | Plan file | Merged as |
|---|---|---|---|---|---|
| 1 | Admin views cycle history | none | **merged** | `docs/superpowers/plans/2026-08-04-admin-cycle-history.md` | `33e69a7`..`fe3eb54` on `master` |
| 2 | Admin views a single cycle's per-income-type totals | none | pending | — | — |
| 3 | Closing a cycle that isn't OPEN is rejected; concurrent close attempts serialize | none | **merged** | `docs/superpowers/plans/2026-08-04-cycle-close-endpoint.md` | `90bfe31`..`50a99ef` on `master` |
| 4 | Closing an OPEN cycle computes leg-volume rollup tree-wide, OPEN→CLOSED, opens next cycle | 3 | pending | — | — |
| 5 | Matching Income credited, net of deductions, KYC-gated | 4 | pending | — | — |
| 6 | Rank advances to highest qualified tier, never demotes | 5 | pending | — | — |
| 7 | Sponsor Matching, one entry per direct sponsee | 5 | pending | — | — |
| 8 | Royalty at post-advancement rank, no-op if no rate configured | 5, 6 | pending | — | — |
| 9 | Reward tiers, awarded once ever (no cycle scoping) | 5 | pending | — | — |
| 10 | Settlement batch atomic + safely re-runnable end-to-end | 3,4,5,6,7,8,9 | pending | — | — |

**Excluded (not a unit):** associate-facing endpoint — Decision #13 says none needed, `GET /api/associates/me/dashboard` already covers it.

**Open questions carried, not resolved here:** OQ2 (CARRIED_FORWARD reconciliation — lives in Wallet/Withdrawal spec), OQ1 (batch perf/chunking — deferred).

**Next pending unit:** 2 (no unmet dependencies) or 4 (needs unit 3, now merged — the settlement batch itself: leg-volume rollup, OPEN→CLOSED, opens next cycle).
