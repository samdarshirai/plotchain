# Follow-up: Compensation step's editable-table rows lose input focus every keystroke

**Filed:** 2026-08-03
**Source:** Final whole-branch review of `docs/superpowers/plans/2026-08-02-admin-usage-directory-filter-bar-and-kyc-pagination.md`, while fixing the same bug class on the KYC Review Queue and Associate Directory screens.
**Status:** Open

## What's wrong

`CompensationStepComponent` (`frontend/src/app/setup/steps/compensation/compensation-step.component.ts`) uses the shared `EditableTableComponent` for its royalty-bonus-rate and reward-tier tables, driving them from `royaltyColumns`/`rewardTierColumns` **getters** (lines ~424, ~436) that build fresh column-definition arrays (including fresh `options` arrays) on every read.

`EditableTableComponent`'s column loop (`<th *ngFor="let column of columns">` / `<td *ngFor="let column of columns">`) has no `trackBy`, and the component has no `OnPush` change-detection strategy. So every Angular change-detection tick — including the one triggered by typing a single character into a royalty-percent or reward-tier text/number `<input>` — re-evaluates those getters, hands the column `*ngFor` a brand-new array of brand-new objects, and Angular's identity-based differ tears down and rebuilds every cell, including the `<input>` the user is actively typing into. The likely user-visible symptom: only one character can be typed per click into these fields before focus is lost.

This is the same bug class just fixed on the row side of `EditableTableComponent`'s other two consumers (`KycQueueComponent`'s reject-reason input, `AssociateDirectoryComponent`'s row data) via `trackBy` + converting getters to memoized fields recomputed only when their underlying data actually changes. `EditableTableComponent`'s row loop now has `trackBy: trackByIndex` (added in that fix), but the **column** loop still doesn't, and `compensation-step.component.ts`'s columns are still getters — so this screen was never touched by that fix and is presumed still broken.

## Why this wasn't caught by the KYC/directory fix

`compensation-step.component.ts` wasn't part of that plan's scope — it's `EditableTableComponent`'s original consumer, not one of the two screens the plan touched. The final-review fix intentionally stayed scoped to the plan's own files rather than opportunistically fixing an unrelated pre-existing screen.

## Suggested fix

Mirror the same two-part fix:
1. Add `trackBy` to `EditableTableComponent`'s column loop (`<th *ngFor="let column of columns; trackBy: trackByKey">` / same on the `<td>` loop), tracking by `column.key` since columns don't have a natural index-stability guarantee the way rows do via `ActionCellContext.index`.
2. Convert `royaltyColumns`/`rewardTierColumns` in `compensation-step.component.ts` from getters to plain fields, computed once (they appear to be static translation-driven definitions, not derived from mutable state) rather than re-derived every change-detection tick.

Verify with the same style of regression test used in the KYC fix: dispatch two real sequential DOM `input` events on the same cached `<input>` element reference (with a `detectChanges()` between them) and assert the accumulated value survives, rather than only asserting the model via programmatic mutation.

## Suggested scope

Small, isolated fix — one component, same pattern already proven to work on the KYC/directory screens. No design decisions needed, just apply the established fix.
