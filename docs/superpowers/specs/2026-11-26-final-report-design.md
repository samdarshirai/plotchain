# Final Report (admin, Finance) — design

Size: small change (one endpoint, one screen, one menu entry).

## Intent
Admin needs one screen per cycle that starts from the closing figures (Cycle Management detail) and adds
expenses and refunds, so they can see total payout and what % of business was paid out.

## Goals
- Admin screen "Final Report" under Finance, cycle picker.
- Shows: total business, net commission (by income type), expenses (one line per expense type), total payout,
  payout %, refunds on separate lines.
- Expenses come from the `expense_type` table, summed per type over the cycle's dates. No hardcoded type names for expenses.

## Non-goals
- No export/print, no editing of expenses, no change to the associate income statement.
- No new tab on Cycle Management.

## Anti-goals
- Refunds must not leak into the payout % .
- Money math must not live in the frontend.

## Decisions (user)
- Approach A: new backend endpoint + own screen.
- Commission = **net** (sum of net amounts for the cycle, same as `totalNet`).
- Payout % = (net commission + expenses) / total business.
- Refunds shown separately, outside the %.

## Approaches considered
- A (chosen): `GET /api/admin/cycles/{id}/final-report`, own Angular screen. Server does the math; new expense types appear automatically.
- B: tab inside Cycle Management. Rejected: user wants a separate screen, page already busy.
- C: frontend stitches cycle detail + expense list. Rejected: money math in client.

## Design
- Backend: new response record + `CycleService` (or small sibling) method reusing `getDetail` totals. Expense sums = group by
  expense type over [periodStart, periodEnd or today] (same window as existing trip expense). Refund types
  = system types "Plot Cancellation Refund" and "Plot Transfer Refund" (V89/V90), identified by the system flag/seed, listed under Refunds; all other types listed under Expenses.
  Payout % = 0 when total business is 0.
- Frontend: component under `frontend/src/app/admin/final-report/`, route `/admin/settings/final-report`, nav item `finalReport`
  in the `finance` category of `admin-nav-categories.model.ts` (after Cycle Management), i18n label "Final Report".
- Tables follow CLAUDE.md rules (no sideways scroll; check at 390/800/1280px).

## Builder's calls (check these)
- Existing `getDetail` `tripExpense` uses the literal `"Trip"` and misses the seeded "Trip Expense" type. Fix it to read from the
  DB type too, or drop the field once the Final Report covers it — builder decides, keep Cycle Management working.
- Expense window uses expense date between cycle start/end (existing convention).
- Verify with added+run tests, not an app run (project rule); width check still required.

## Revision 2026-11-26 (user, after first build): one table, per-cycle rows
- Screen is ONE table, one row per cycle (newest first), no cycle picker. Last row = Total over all rows.
- Columns: Cycle, Total Business, Net Commission, one column per expense type (from DB; union of names), Total Payout, Payout %, then one column per refund type.
- Total row sums every money column. Payout % in the Total row is recomputed from the totals (totalPayout x 100 / totalBusiness), never summed.
- Server does all math. New endpoint `GET /api/admin/cycles/final-report` replaces `GET /api/admin/cycles/{id}/final-report` (removed, along with its security matcher and tests).
- Response: `{ expenseTypes: string[], refundTypes: string[], rows: CycleFinalReportResponse[], total: CycleFinalReportResponse }`; `total` has null cycleId/periodStart/periodEnd/status and empty incomeTypeTotals. Every row/total carries `expenses` and `refunds` with an entry for every name in `expenseTypes`/`refundTypes` (0 if none), same order.
- Ceiling: no paging; all cycles each call (one getDetail per cycle). Add paging if cycle count grows past a few hundred.
- Table follows CLAUDE.md (auto-stacks to cards on narrow screens; money nowrap).

## Revision 2 2026-11-26 (user): cycle filter
- Multi-select cycle filter above the table; all cycles selected by default (also "Select all"/"Clear" shortcuts).
- Server does the math: `GET /api/admin/cycles/final-report?cycleIds=a,b,c`. Param absent = all cycles; present but empty = no cycles (empty rows, zero total). Unknown ids are ignored. `expenseTypes`/`refundTypes` = union over the selected cycles only.
- The filter's option list (all cycles, labelled "start – end|ongoing") comes from the first, unfiltered load and stays stable while filtering. Add `allCycles: [{cycleId, periodStart, periodEnd, status}]` to the response (always the full list, newest first) so the frontend needs no second endpoint.
- Selection is not persisted.
