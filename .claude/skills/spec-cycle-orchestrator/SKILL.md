---
name: spec-cycle-orchestrator
description: Use when the user wants each spec in a batch of domain design docs carried from spec to implemented, reviewed screens via subagents — phrases like "go through the whole cycle for each spec", "run the pipeline on these specs", "orchestrate implementation across the domain specs".
---

# Spec Cycle Orchestrator

## Overview

One cycle = `spec-slicer` → `writing-plans` → `frontend-design` (screen artifact) → `tdd` (in an isolated worktree) → `code-review` (Standards + Spec), for one spec, one unit at a time. This skill sequences those sub-skills via dispatched subagents and holds the checkpoints between them — it does none of the actual slicing/planning/designing/coding/reviewing itself.

**REQUIRED SUB-SKILLS:** superpowers:spec-slicer, superpowers:writing-plans, frontend-design, superpowers:test-driven-development, code-review, superpowers:using-git-worktrees, superpowers:finishing-a-development-branch.

## Checkpoints — never skip

| After | Gate |
|---|---|
| Slicing a spec | User sees the unit list + dependency order, approves or edits it, before any plan gets written |
| Planning a unit | User sees the plan before any code is touched |
| Implementing a unit | `code-review` must run against the worktree diff before the branch is offered for merge |
| Finishing a unit's branch | User explicitly says merge/finish — never automatic |
| Finishing all units in a spec | User decides whether to continue to the next spec or stop |

These are the same checkpoints already used earlier in this session (spec-slicer output was shown before proceeding, design decisions were asked rather than assumed). This skill formalizes that pattern so it doesn't have to be re-derived per spec.

## Resuming in a new session

Nothing about this skill's progress lives in conversation memory — a fresh session has none of it. Everything that matters is either committed to git or it doesn't exist yet. Before picking a next unit, in order:

1. Read `docs/superpowers/plans/spec-cycle-status.md` first — the top-level index over every spec in the batch (not started / sliced / in progress / done). This answers "what's done, what's in progress, what's not started" at a glance without opening every spec.
2. **Check for an existing plan or spec covering the same ground**, committed or not, even for a spec the index shows as "not started" — `grep`/read `docs/superpowers/plans/` and `docs/superpowers/specs/` for anything touching the same domain before slicing or planning. A plan can predate this skill's use entirely (written by hand, by a different session, before this skill existed) and still be the authoritative one. Slicing without checking this produces duplicate, conflicting plans for the same code — reconcile against what exists, don't re-derive from scratch.
3. Read `git log --oneline` on the base branch — this is ground truth for what's actually merged, regardless of what any tracking file claims.
4. Read `docs/superpowers/plans/<spec-slug>-units.md` (linked from the index — see step 2 of the loop below) for that spec's unit queue and status. If the index shows "not started," that spec hasn't been sliced yet — start at loop step 1.
5. Cross-check: a unit marked `merged` in a tracking file should correspond to real commits from step 3. A unit marked `planned` should have a real plan file at the path named. If they disagree, trust git and the filesystem over any tracking file, then fix the tracking file (and the index, if the counts it shows are now stale).

## Per-spec loop

1. Pick the next spec file (queue order set by the user; if unstated, ask rather than guessing an order). First check for pre-existing plans/specs on the same ground (see Resuming, step 1) — reconcile before proceeding if found.
2. Dispatch a subagent running `spec-slicer` on that spec (+ its ADRs/glossary if any exist). spec-slicer, left alone, slices from a Reconciliation/gap-fill or Scope table — API endpoints only. **Cross-check the result against the spec's own Screens section** (or equivalent — the section naming actual Admin/Associate-facing pages): for every named screen that consumes one or more of the sliced endpoint units, add one paired `screen`-type unit depending on all the endpoint units it needs. Group by the spec's own named screen, not by raw endpoint count — three endpoints feeding one named screen (e.g. list + record + void all on one "Sales Register" page) get one screen unit, not three. A unit with no screen (pure backend computation, an internal batch step, a removal with no new UI) gets none — don't invent one. Mark every unit's type (`backend` / `screen`) in the table. **Persist the result** to `docs/superpowers/plans/<spec-slug>-units.md` — a table of unit #, title, depends-on, status (`pending`/`planned`/`merged`), plan file path, and merged-commit range, updated as units progress through the loop. This file, not the chat transcript, is what a future session reads. **Add or update this spec's row in `docs/superpowers/plans/spec-cycle-status.md`** (create the index if this is the first spec sliced in the batch) so the top-level view stays current. Report the unit list to the user. **Stop here until approved**, then commit both files.
3. For each approved unit, in dependency order:
   a. Dispatch a subagent running `writing-plans` scoped to that unit's acceptance criteria only.
   b. If the unit touches a screen: dispatch a subagent running `frontend-design`, producing a `screen.png`/`code.html`/`DESIGN.md`-conformant artifact under `docs/design/`. Reuse this repo's existing token system and responsive rules unless the spec explicitly calls for a new one — don't re-decide the palette per screen.
   c. Dispatch a subagent, isolated in a worktree (`isolation: "worktree"`), running `test-driven-development` to implement the plan for that unit only.
   d. Dispatch a `code-review` subagent against that worktree's diff (Standards + Spec axes).
   e. Report findings to the user. Only merge on explicit go-ahead (`finishing-a-development-branch`) — never auto-merge, never auto-push. After merging, update that unit's row in `docs/superpowers/plans/<spec-slug>-units.md` to `merged` with the commit range, bump the merged/total count in `spec-cycle-status.md`, and commit both updates — this is what makes the merge visible to a future session, the git log alone doesn't say which spec/unit a commit range belongs to.
4. After all units in the spec land, mark the spec `done` in `spec-cycle-status.md` and ask the user: continue automatically to the next spec, or stop here.

## Why subagents, not inline

Each phase gets a context window scoped to one unit — across an 8-spec backlog of dozens of units, doing this inline would blow out the main thread's context long before the queue empties. Dispatch prompts must be self-contained: unit acceptance criteria, spec section citations, file paths — a fresh subagent has no memory of this conversation or of earlier units.

## Never automate away

- Never skip the plan-approval or code-review checkpoints because a unit "looks trivial."
- Never invent acceptance criteria the spec-slicer output didn't state — if a unit is ambiguous, that's a question for the user, not a judgment call for a subagent.
- Never run two units' implementation phases in parallel without checking file overlap first. Units from different specs (or different units in the same spec) that touch the same file — `SecurityConfig.java`, `AssociateRole` enum, `DESIGN.md` — get sequenced, not parallelized; uncoordinated parallel agents on the same file silently clobber each other.
- The file-overlap check isn't just for parallel execution — check it **before dispatching the planning phase (3a) too**. A planning subagent given only "match the codebase's existing convention" will faithfully copy a convention another already-approved unit is scheduled to delete, because it has no way to know that unless told. Before dispatching `writing-plans` for a unit, scan the other approved units' `Refs`/file lists (across all specs sliced so far, not just this one) for shared files, and if found, tell the planning subagent explicitly which target state to build to — don't let it infer from current code alone. (Found in dry run: cycle-management unit 1's plan initially copied `SecurityConfig.java`'s current `hasAnyAuthority(ADMIN,SUPER_ADMIN,...)` pattern, which role-capability unit 1 — already approved — deletes. Caught at the plan-approval checkpoint, not before, because the dispatch prompt didn't carry that context.)

## Red flags — stop and ask

| Thought | Reality |
|---|---|
| "Unit's small, skip the plan step" | Small units still get the wrong shape without a plan. Dispatch it anyway. |
| "Code-review can wait until all units land" | Findings compound — review each unit's diff before starting the next one built on top of it. |
| "I'll just merge, review looked clean" | User checkpoint, not a formality — always wait for explicit go-ahead. |
| "These two units don't look related, run them together" | Check file overlap before assuming — grep the plan for shared paths first. |

## Quick reference — dispatching a phase

```
Agent({
  description: "<phase> for unit <N>: <unit title>",
  subagent_type: "general-purpose",   // or the skill's own agent if one exists
  isolation: "worktree",              // implementation phase only
  prompt: "Follow the <skill-name> skill. Unit: <title>. Acceptance criteria: <bulleted list from spec-slicer output>. Refs: <spec section / file paths>. <Any prior-phase output this phase needs, inlined — it has no memory of this conversation.>"
})
```
