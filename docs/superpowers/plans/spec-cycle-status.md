# Spec Cycle Status — role-capability domain specs

Index over `docs/superpowers/specs/role-capability/*.md`. This is the file a new session (or `spec-cycle-orchestrator`) reads first to know what's done, in progress, or not started at the spec level. Each spec's own unit-level detail lives in its `-units.md` file once sliced (see `spec-cycle-orchestrator`'s "Resuming in a new session" section).

**Status legend:**
- **not started** — no `-units.md` file exists yet; spec hasn't been through spec-slicer.
- **sliced** — units file exists, 0 units merged.
- **in progress** — units file exists, some units merged, some not.
- **done** — every unit merged.

| Spec | Status | Units file | Merged / total |
|---|---|---|---|
| `2026-08-03-role-capability-data-visibility-design.md` | sliced (7/16 already have a pre-existing plan — see units file; units 12–16 are screens, added 2026-08-05) | `2026-08-03-role-capability-units.md` | 0 / 16 |
| `2026-08-03-cycle-management-domain-design.md` | **in progress** | `2026-08-03-cycle-management-units.md` | 7 / 11 |
| `2026-08-03-sales-domain-design.md` | **done** | `2026-08-03-sales-units.md` | 9 / 9 |
| `2026-08-03-income-ledger-domain-design.md` | not started | — | — |
| `2026-08-04-wallet-withdrawal-domain-design.md` | not started | — | — |
| `2026-08-03-epin-domain-design.md` | not started | — | — |
| `2026-08-03-support-tickets-domain-design.md` | not started | — | — |
| `2026-08-03-announcements-domain-design.md` | not started | — | — |

**Known cross-spec dependency — resolved 2026-08-05:** Sales unit 1 (`CycleService.getOrOpenCurrent()`) merged as `abde5dc` on `master`. This unblocks cycle-management unit 4 (leg-volume rollup, OPEN→CLOSED, reopen), which can now proceed to its own planning phase against the real method signature.

**Known environment issue (2026-08-11, unrelated to any unit's code):** `cd backend && mvn test` currently shows ~55 `Mockito cannot mock this class` errors (e.g. `CycleService`) on top of the 4 known pre-existing `JwtServiceTest`/`SecretsEncryptionServiceTest` failures. Root cause: Maven resolves JDK 25 (Homebrew) while `java` on PATH is JDK 21 — verified directly on `master` with no worktree/unit changes involved. Breaks Mockito's inline-mock-maker across many unrelated test classes. Fix is an environment/JAVA_HOME alignment task, not a code fix — until resolved, expect backend test runs to show this noise regardless of which unit is being verified; don't treat it as a regression caused by new work.

**Maintenance:** update this file whenever a spec gets sliced for the first time (add its row + units-file link) or a unit merges (bump the merged/total count) — `spec-cycle-orchestrator` step 2 and step 3e are responsible for keeping it current.
