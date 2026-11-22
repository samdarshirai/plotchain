# Compare payments of multiple plots — short design

## Context / why
On `/plot-bookings/team` (and left/right leg), the user checks payments by opening a plot's Details popup, reading, closing, opening another, and remembering the numbers. They want 2+ plots compared at once on the same screen, start with 2, add more as needed.

## Goals
- Tick plots in the table; with 2+ ticked, show a compare view with one card per plot, side by side.
- Each card: plot header (project · plot no), total / paid / rest, payment list (same columns as the Details popup: payment date, amount, receipt no, mode, instrument no, date).
- Add a plot by ticking another row; remove by unticking or a card's remove button. Clear-all.

## Non-goals / anti-goals
- No new API or backend change (rows already carry `installments`).
- Not for My Sales (no installments). My Bookings left off for now.
- Must not make any table scroll sideways (CLAUDE.md); must not change existing table behaviour when compare is off.

## Approaches considered
1. **Opt-in compare mode on shared `BookingTableComponent` + new `plot-compare` component (chosen).** Small, reuses row/installment logic, Team/Left/Right all get it.
2. Team-page only: duplicates selection and row logic, Left/Right need rework. Dropped.
3. Several stacked Details popups: overlapping dialogs, poor on phone. Dropped.
Layout: side-by-side cards (chosen over merged table and summary-strip variants).

## Design
- `BookingTableComponent`: new `@Input() compare = false`. When true: leading tick column (only on rows with `installments`), selection `Set<string>` of row keys kept across filter changes, bar "Compare N plots · clear" shown at 2+ ticks.
- New standalone `plot-compare.component.ts` (in `frontend/src/app/plot-bookings/`): input = selected `BookingRow[]`; renders cards in a CSS grid, `repeat(auto-fit, minmax(...))`, one column on phone (cards stack, no min-width on tables). Payment list uses the existing `payments(r)` rule (ENTERED/PAID with paid date, newest first), so extract it to a shared function in `booking-view.util.ts` instead of duplicating.
- Compare view renders above the table inside `app-booking-table`, so ticking continues below it.
- `TeamPlotBookingsComponent` passes `[compare]="true"`. i18n keys added to `en.json` and `hi.json`.
- Payment lists inside cards are normal `<thead>/<tbody>` tables so `table-fit.ts` stacks them when narrow; money/IDs stay on one line.

## Calls I made (not discussed — check these)
- Compare view above the table, not a popup.
- Ticks persist when filters hide a plot.
- No tick box on rows without installments.
- No cap on number of plots (cards wrap).
- My Bookings stays off.

## Left to the builder
Exact card styling (follow `booking-table.component.scss` tokens), remove-button placement, empty-payments text (reuse `plotBookings.payments.empty`).

## Verification
- Unit tests: selection add/remove/persist across filter; compare appears only at 2+; payments rule unchanged (extend `booking-table.component.spec.ts`, add `plot-compare.component.spec.ts`); Team spec passes `compare`.
- Width check per CLAUDE.md at 390 / 800 / 1280px: container and page `scrollWidth <= clientWidth`, with 2 and 3 plots compared.
- Run frontend tests for the plot-bookings folder.
