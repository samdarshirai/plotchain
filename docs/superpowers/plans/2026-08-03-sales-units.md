# Sales — Unit Queue

Sliced from `docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md` by spec-slicer via `spec-cycle-orchestrator`, 2026-08-05. This file is the persisted record of that slice — a fresh session should read this instead of re-running spec-slicer, unless the source spec has changed since.

**Why sliced now, out of the original queue order:** cycle-management unit 4 (leg-volume rollup, OPEN→CLOSED, reopen) calls `CycleService.getOrOpenCurrent()`, which the cycle-management spec explicitly says is Sales' method, "not redefined here." That method doesn't exist in the codebase (no `sales` package at all) — cycle-management unit 4 was blocked on it. Sales unit 1 below is the unblock; the rest of Sales' units were sliced along with it since spec-slicer needs the whole spec for dependency ordering.

**Status legend:** `pending` (not started) · `planned` (plan file exists, not yet implemented) · `merged` (implemented, reviewed, on `master`)

| # | Type | Unit | Depends on | Status | Plan file | Merged as |
|---|---|---|---|---|---|---|
| 1 | backend | `CycleService.getOrOpenCurrent()` returns today's OPEN cycle, creating one only if none exists | none | **merged** | `docs/superpowers/plans/2026-08-05-cycle-get-or-open-current.md` | `abde5dc` on `master` |
| 2 | backend | Recording a sale against an unavailable plot, or an unknown plot/associate, is rejected with no side effects | none | **merged** | `docs/superpowers/plans/2026-08-05-sales-record-sale-guards.md` | `f48bf54`..`f885cac` on `master` |
| 3 | backend | Recording a sale against an available plot flips it to SOLD and synchronously credits Direct Income | 1, 2 | **merged** | `docs/superpowers/plans/2026-08-05-sales-record-sale-happy-path.md` | `0d5a1c8`..`bcf5008` on `master` |
| 4 | backend | Voiding a sale that doesn't exist, or is already voided, is rejected with no side effects | 3 | **merged** | `docs/superpowers/plans/2026-08-10-sales-void-guards.md` | `b1a9e86`..`192c69c` on `master` |
| 5 | backend | Voiding a RECORDED sale reverts the plot to AVAILABLE and reverses its linked ledger entry | 3, 4 | **merged** | `docs/superpowers/plans/2026-08-10-sales-void-happy-path.md` | `9b8278c`..`8c77e7b` on `master` |
| 6 | backend | Admin lists and filters sales in the register | 3 | **merged** | `docs/superpowers/plans/2026-08-10-sales-admin-register-list.md` | `7ddb5fd`..`3776430` on `master` |
| 7 | backend | An associate views their own and descendant sales, read-only | 3 | **merged** | `docs/superpowers/plans/2026-08-10-sales-associate-own-view.md` | `578db76`..`576a3d6` on `master` |
| 8 | **screen** | Admin "Sales Register" screen — list/filter (6), record new sale (3), void with reason (4, 5) | 3, 4, 5, 6 | pending | — | — |
| 9 | **screen** | Associate "Sales History" screen — own + descendant, view-only | 7 | pending | — | — |

Units 8–9 added 2026-08-05, same pass as cycle-management unit 11 and role-capability units 12–16 — screens weren't sliced alongside endpoints. One Admin screen (8) covers list/record/void per the spec's own Admin row ("Full sales register — all associates, void/export, records every sale"), not three.

**Dependency order:**

```
1 (getOrOpenCurrent)  ─┐
2 (record: guards)    ─┴─→ 3 (record: happy path) ─┬─→ 4 (void: guards) ─┬─→ 5 (void: happy path)
                                                     │                    │
                                                     ├─────────────────→ 6 (admin register list)
                                                     └─────────────────→ 7 (associate own-view)
```

Units 1 and 2 are mutually independent — build order between them doesn't matter.

**File overlap check against other approved/in-flight units (done at slice time):** `com.plotchain.cycle` (`Cycle`, `CycleStatus`, `CycleRepository`, `CycleService`) is shared with cycle-management units 1/3 (merged) and unit 4 (next up, currently blocked on this spec's unit 1). Unit 1 here only *adds* a method to `CycleService` — it doesn't touch `close()` or the row-lock query cycle-management unit 3 added, so no edit collision expected, but land this unit before resuming cycle-management unit 4's planning phase so that phase can build against the real method signature instead of guessing at it. `legvolume` package is untouched by any Sales unit. `income` package (`LedgerEntry`, `IncomeType`, `LedgerEntryStatus`) is touched by Sales unit 3 (new `sourceRef` column, `DIRECT` entries) — no other in-flight unit currently touches it.

**Explicitly excluded (per spec's own Scope section, not units):** Matching/Sponsor Matching/Royalty/Reward income, leg-volume rollup batch, admin-triggered cycle open/close/re-run, cycle monitoring UI, EMI/installment tracking, PAN capture on `Associate` — all named out-of-scope or deferred in the spec; none should surface as a unit or as a stray acceptance criterion.

**Note on unit 3's merge:** post-implementation code review found a Plot double-sale race (unlocked `findById` before the SOLD flip) — fixed as a follow-up commit (`bcf5008`) adding `PlotRepository.findByIdForUpdate` (mirroring `CycleRepository`'s), re-reviewed clean, then merged. `Sale` rows are now real: `status=RECORDED`, `cycleId` populated via `getOrOpenCurrent()` — cycle-management unit 4 can now plan against real data.

**Next pending unit:** Both remaining units are screens, now fully unblocked — 8 (Admin Sales Register: needs 3,4,5,6, all merged) and 9 (Associate Sales History: needs 7, merged). All 7 backend units for this spec are done.

**Known scoping decision, not a bug (2026-08-10):** unit 5's `voidSale()` sets `voidReason` unconditionally — no guard rejects a null/blank `reason`. The spec's data-model note (line 44, "required by the API when voiding, not by the DB constraint") arguably calls for this, but the spec's own flow steps (3-6) and error-handling table don't list a reason-blank guard or a 400 status for it. Code review flagged this tension explicitly; user chose to merge as planned rather than add validation. If a blank-reason rejection is wanted later, it's a new, separately-spec'd requirement — not something to silently backfill into a future unit.
