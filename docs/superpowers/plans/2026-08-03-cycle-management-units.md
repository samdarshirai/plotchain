# Cycle Management — Unit Queue

Sliced from `docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md` by spec-slicer via `spec-cycle-orchestrator`, 2026-08-04. This file is the persisted record of that slice — a fresh session should read this instead of re-running spec-slicer, unless the source spec has changed since.

**Status legend:** `pending` (not started) · `planned` (plan file exists, not yet implemented) · `merged` (implemented, reviewed, on `master`)

| # | Type | Unit | Depends on | Status | Plan file | Merged as |
|---|---|---|---|---|---|---|
| 1 | backend | Admin views cycle history | none | **merged** | `docs/superpowers/plans/2026-08-04-admin-cycle-history.md` | `33e69a7`..`fe3eb54` on `master` |
| 2 | backend | Admin views a single cycle's per-income-type totals | none | pending | — | — |
| 3 | backend | Closing a cycle that isn't OPEN is rejected; concurrent close attempts serialize | none | **merged** | `docs/superpowers/plans/2026-08-04-cycle-close-endpoint.md` | `90bfe31`..`50a99ef` on `master` |
| 4 | backend | Closing an OPEN cycle computes leg-volume rollup tree-wide, OPEN→CLOSED, opens next cycle | 3 | **merged** | `docs/superpowers/plans/2026-08-10-cycle-close-legvolume-rollup.md` | `daa1bdc`..`e21bc69` on `master` |
| 5 | backend | Matching Income credited, net of deductions, KYC-gated | 4 | **merged** | `docs/superpowers/plans/2026-08-10-cycle-management-matching-income.md` | `bac5cef`..`0b38f4b` on `master` |
| 6 | backend | Rank advances to highest qualified tier, never demotes | 5 | **merged** | `docs/superpowers/plans/2026-08-10-cycle-management-rank-progression.md` | `0be35d9`..`4552fad` on `master` |
| 7 | backend | Sponsor Matching, one entry per direct sponsee | 5 | pending | — | — |
| 8 | backend | Royalty at post-advancement rank, no-op if no rate configured | 5, 6 | pending | — | — |
| 9 | backend | Reward tiers, awarded once ever (no cycle scoping) | 5 | pending | — | — |
| 10 | backend | Settlement batch atomic + safely re-runnable end-to-end | 3,4,5,6,7,8,9 | pending | — | — |
| 11 | **screen** | Admin "Cycle Management" screen — cycle history list (1), per-cycle detail view (2), trigger/monitor close action (4) | 1, 2, 4 | pending | — | — |

Unit 11 added 2026-08-05, retroactively — added late because screens weren't sliced alongside endpoints the first pass through (see `spec-cycle-orchestrator`'s per-spec loop step 2). One screen unit, not three: the spec's own Admin Screens list names "Cycle Management" as a single screen, and a list/detail/action split across three near-identical Angular pages editing the same route would be the wrong cut, not a more careful one — depends on all three endpoints it surfaces, nothing skipped.

**Excluded (not a unit):** associate-facing endpoint — Decision #13 says none needed, `GET /api/associates/me/dashboard` already covers it. No associate-facing screen for this domain either, for the same reason.

**Open questions carried, not resolved here:** OQ2 (CARRIED_FORWARD reconciliation — lives in Wallet/Withdrawal spec), OQ1 (batch perf/chunking — deferred).

**Next pending unit:** 2 (no unmet dependencies), or 7/8/9 (7 and 9 depend only on 5, merged; 8/Royalty now also unblocked since 6/Rank is merged). All three insert into `CycleService.close()` at their own point in the flow-step sequence (5=Matching → 4=Rank[merged, out of numeric order per the Flow section's actual sequence] → 5=Sponsor Matching → 6=Royalty → 7=Reward → 8=Close). Unit 11 (screen) still blocked on unit 2.

**Note for the next unit's plan:** `CycleService.close()` now has Matching Income (unit 5) and Rank progression (unit 6) inserted between the leg-volume rollup and the `CLOSED` flip; the constructor is 7 args (adds `RankTierRepository` to unit 5's 6). `RankTierRepository.findAllByOrderByRankOrder()` is in scope for Royalty's (unit 8) post-advancement rank lookup. The rank/staff-role guard convention is `associate.getRole() == AssociateRole.ASSOCIATE` (process only associates), matching the *live* `chk_associate_rank_required` constraint (V4, not V3) — reuse this exact guard for any future unit that needs to skip non-ASSOCIATE roles, don't re-derive it. `ledger_entry.source_ref` NOT NULL + unique constraint (V17) and `LedgerEntryRepository.existsByAssociateIdAndCycleIdAndIncomeTypeAndSourceRef(...)` remain the idempotency pattern for units 7-9's own `LedgerEntry` writes.
