# Sales — Unit Queue

Sliced from `docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md` by spec-slicer via `spec-cycle-orchestrator`, 2026-08-05. This file is the persisted record of that slice — a fresh session should read this instead of re-running spec-slicer, unless the source spec has changed since.

**Why sliced now, out of the original queue order:** cycle-management unit 4 (leg-volume rollup, OPEN→CLOSED, reopen) calls `CycleService.getOrOpenCurrent()`, which the cycle-management spec explicitly says is Sales' method, "not redefined here." That method doesn't exist in the codebase (no `sales` package at all) — cycle-management unit 4 was blocked on it. Sales unit 1 below is the unblock; the rest of Sales' units were sliced along with it since spec-slicer needs the whole spec for dependency ordering.

**Status legend:** `pending` (not started) · `planned` (plan file exists, not yet implemented) · `merged` (implemented, reviewed, on `master`)

| # | Type | Unit | Depends on | Status | Plan file | Merged as |
|---|---|---|---|---|---|---|
| 1 | backend | `CycleService.getOrOpenCurrent()` returns today's OPEN cycle, creating one only if none exists | none | **merged** | `docs/superpowers/plans/2026-08-05-cycle-get-or-open-current.md` | `abde5dc` on `master` |
| 2 | backend | Recording a sale against an unavailable plot, or an unknown plot/associate, is rejected with no side effects | none | pending | — | — |
| 3 | backend | Recording a sale against an available plot flips it to SOLD and synchronously credits Direct Income | 1, 2 | pending | — | — |
| 4 | backend | Voiding a sale that doesn't exist, or is already voided, is rejected with no side effects | 3 | pending | — | — |
| 5 | backend | Voiding a RECORDED sale reverts the plot to AVAILABLE and reverses its linked ledger entry | 3, 4 | pending | — | — |
| 6 | backend | Admin lists and filters sales in the register | 3 | pending | — | — |
| 7 | backend | An associate views their own and descendant sales, read-only | 3 | pending | — | — |
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

**Next pending unit:** 2 (record-sale guards) — independently buildable, no deps. Unit 1's landing also unblocks cycle-management unit 4, which can now resume planning.
