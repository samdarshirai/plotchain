# Spec Cycle Status — role-capability domain specs

Index over `docs/superpowers/specs/role-capability/*.md`. This is the file a new session (or `spec-cycle-orchestrator`) reads first to know what's done, in progress, or not started at the spec level. Each spec's own unit-level detail lives in its `-units.md` file once sliced (see `spec-cycle-orchestrator`'s "Resuming in a new session" section).

**Status legend:**
- **not started** — no `-units.md` file exists yet; spec hasn't been through spec-slicer.
- **sliced** — units file exists, 0 units merged.
- **in progress** — units file exists, some units merged, some not.
- **done** — every unit merged.

| Spec | Status | Units file | Merged / total |
|---|---|---|---|
| `2026-08-03-role-capability-data-visibility-design.md` | sliced (7/11 already have a pre-existing plan — see units file) | `2026-08-03-role-capability-units.md` | 0 / 11 |
| `2026-08-03-cycle-management-domain-design.md` | **in progress** | `2026-08-03-cycle-management-units.md` | 2 / 10 |
| `2026-08-03-sales-domain-design.md` | not started | — | — |
| `2026-08-03-income-ledger-domain-design.md` | not started | — | — |
| `2026-08-04-wallet-withdrawal-domain-design.md` | not started | — | — |
| `2026-08-03-epin-domain-design.md` | not started | — | — |
| `2026-08-03-support-tickets-domain-design.md` | not started | — | — |
| `2026-08-03-announcements-domain-design.md` | not started | — | — |

**Known cross-spec dependency:** Sales' `CycleService.getOrOpenCurrent()` is consumed by cycle-management units 1–2 (confirmed during cycle-management's slice) — Sales isn't sliced yet but its `Cycle`-adjacent surface already has a real consumer. Check for more of these when slicing Sales.

**Maintenance:** update this file whenever a spec gets sliced for the first time (add its row + units-file link) or a unit merges (bump the merged/total count) — `spec-cycle-orchestrator` step 2 and step 3e are responsible for keeping it current.
