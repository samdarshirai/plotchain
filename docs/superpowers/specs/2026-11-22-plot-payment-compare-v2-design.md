# Plot payment compare v2 — short design

Supersedes the layout in `2026-11-22-plot-payment-compare-design.md` (v1, built: per-plot cards, tick column, add dropdown). v1's selection and tick mechanics stay; the panel, its data and its lifecycle change.

## Intent
On `/plot-bookings/team|left|right` the user compares 2–4 plots at once to answer three things together: who has paid more or less, how payments differ (date, mode, receipt), and what is still due. v1 cards could not show the first and third, could not tell two bookings of the same plot apart, and broke down with long payment lists and many plots.

## Goals
- Summary table, plots as columns, so each metric lines up across plots.
- Below it, one payment column per plot, each scrolling on its own.
- Plots identifiable when the same plot number appears twice (cancel + rebook).
- Works from laptop to phone without a sideways scrollbar (CLAUDE.md table rule).

## Non-goals
- Exporting or printing the comparison. Remembering it after leaving the page. More than 4 plots. Backend or API changes.

## Layout (chosen: mockup C)
- **Header per plot** (summary column heading and payment column heading): plot no · project, buyer ID, booked date, status badge (Active / Cancelled), colour dot. Colour is decoration only; the text identifies.
- **Summary rows:** Total price · Paid (amount, % of total, progress bar) · Rest due (cancelled: refund amount) · Payments (count, plus "N pending" badge) · Last paid · Next due (earliest PENDING installment: date + amount) or an Overdue badge (count + sum of overdue installments; cancelled: "—").
- **Payment columns:** Date, Amount, Mode, Receipt No, plus Pending/Confirmed badge. Same payment rule as the Details popup (`paymentsOf`). Full 7 columns stay in the popup. Each list scrolls vertically (max about 60vh); empty plot shows `plotBookings.payments.empty`.
- **Top bar of the panel:** title, add-plot control, Clear all.
- **Sticky bottom bar** "Comparing N plots · View comparison ↑ · Clear all", shown only while the panel is off-screen (IntersectionObserver); the link scrolls the panel into view.
- **Phone / narrow:** summary table stacks to labelled cards through `table-fit.ts` (cells carry `data-label`); payment columns stack one under another.

## Behaviour and cases
- Selection: min 2 to show the panel, **max 4**. At 4 the add control is hidden and un-ticked tick boxes are disabled with a note.
- Add: tick rows in the table, or the type-to-filter control (native `<input list>` + `<datalist>`), options labelled "A-2 · VSA53628 · 20 Nov" so duplicates differ. Choosing one adds it and clears the input.
- Remove: untick, ✕ on a column heading, or Clear all.
- **Survives filters and date changes:** compared plots keep a snapshot of their row until removed. If the same booking key reappears in `rows`, the snapshot refreshes. Replaces v1's "drop when missing from rows".
- Rows without installments (sales) have no tick box.
- Cancelled bookings show a Cancelled badge, refund amount, "—" for next due; their payments still list.
- Money/ids stay on one line; headers break between words only.

## Approaches considered
1. Summary + merged ledger (mockup A): best for many plots/payments, but loses per-plot reading order. Not chosen.
2. Cards + summary line + Payments/Dues switch (B): smallest change, no cross-plot summary. Not chosen.
3. **Summary table + per-plot payment columns (C): chosen by the user.** Known weakness: payments of different plots do not line up by date; accepted.

## Design (builder notes)
- `BookingRow` gains `status`, `refundAmount`, `cancellationCharge`, `buyerCode` is already `associateCode`; map them in `bookingRow` (from `Booking.status`, `refundAmount`, `cancellationCharge`).
- New pure function `summarize(row: BookingRow, today?: Date)` in `booking-view.util.ts` returning `{ paidPct, paymentCount, pendingCount, lastPaidAt, nextDue: {dueDate, amount} | null, overdueCount, overdueAmount }`. Uses `paymentsOf` and `isOverdueRow` (do not reimplement). Unit-tested, including 0 payments, total 0, all paid, cancelled.
- `PlotCompareComponent` rework: inputs `rows` (snapshots), `available`; outputs `add`, `remove`, `clear`. Summary rendered as a `<table>` (`thead` = plot headings, `tbody` rows keyed by metric, each `td` with `data-label` = plot heading text). Payment columns as before, compact.
- `BookingTableComponent`: keep `compared` as a `Map<string, BookingRow>` (snapshots); `comparedRows` returns the map values; on `rows` change refresh snapshots for keys still present; replace v1 pruning. Enforce max 4 in `toggleCompare`/add.
- Sticky bar: small `IntersectionObserver` on the panel host; falls back to always-visible if unsupported.
- i18n (`en.json`, `hi.json`): metric labels, status labels (Pending/Confirmed, Active/Cancelled), "Overdue", "Next due", "Last paid", "refund", max-reached note, sticky bar text.
- Left to builder: exact colours (existing tokens), column widths, tooltip wording.

## Constraints
No fixed `min-width`, no `overflow-x:auto` wrapper; verify at 390 / 800 / 1280px with 2, 3 and 4 plots that container and page `scrollWidth <= clientWidth`. Compare stays opt-in via `[compare]`; with it off the table renders as today.

## Verification
Unit tests for `summarize`, snapshot survival across `rows` changes and filters, max-4 behaviour, duplicate-plot labelling, cancelled rendering; full `ng test`; browser width check (throwaway DB clone, test login) at the three widths with 2/3/4 plots and a plot with 9+ payments.
