---
name: Bookings & EMI (Admin Operational Screen)
spec: docs/superpowers/specs/role-capability/2026-10-01-plot-booking-lifecycle-design.md
unit: plot-booking-lifecycle unit 12
tokens:
  source: sibling violet/cyan tokens (sales_register / ledger_register / payout_approval); NOT the live _tokens.scss
  colors: { surface-page: "#f8f9ff", surface-card: "#ffffff", surface-raised: "#eff4ff", border-subtle: "#c2c6d9", text-primary: "#0b1c30", text-muted: "#424656", brand-primary: "#7C3AED", brand-secondary: "#22D3EE", status-success: "#34D399", status-warning: "#F59E0B", status-danger: "#F87171" }
  derived: "--success-ink / --warning-ink / --danger-strong = color-mix(status 50-65%, text-primary) for readable text and fills; --on-brand #ffffff; --ink #0b1c30 (sidebar)"
  typography: { display: "Geist (titles)", body: "Inter", data: "JetBrains Mono (data, eyebrows, table heads)" }
  radius: { card: 20px, filters: 16px, control: 8px, seal: 12px, chip: 999px }
  shadow: "0 4px 20px -2px rgba(0,0,0,0.08) as --shadow-card"
---

Artifacts in this directory: `code.html` (static mock; inline JS only toggles states, hash form `#view=register&list=ok&seal=detail&flash=none&clean`), `screen.png` (primary state, 1440px), plus state shots `screen-pay-form.png`, `screen-pay-plot-drift-error.png`, `screen-cancel-form.png`, `screen-transfer-form.png`, `screen-overdue-report.png`, `screen-empty.png`, `screen-pay-network-error.png`, `screen-narrow-600.png`. The dark chip strip at the bottom of the live HTML is a design-review state switcher, not part of the screen (hidden with `#...&clean`).

## Purpose

The day-to-day desk for plot bookings that are paid in monthly EMIs. An admin uses it to (1) find a booking, (2) record an instalment as cash arrives, (3) confirm, cancel or transfer a booking while it is ACTIVE, and (4) work down the list of overdue bookings. It is read-heavy with four small, consequential writes, so it follows the shipped e-Pin Register shape: filter bar, paged list, sticky double-ruled detail "seal", and action forms that replace the seal contents in place.

## Token note (read first)

**User choice: the violet/cyan sibling palette** (`surface-page #f8f9ff`, `surface-card #fff`, `surface-raised #eff4ff`, `border-subtle #c2c6d9`, `text-primary #0b1c30`, `text-muted #424656`, `brand-primary #7C3AED`, `brand-secondary #22D3EE`; Geist titles, Inter body, JetBrains Mono data and eyebrows), the same as `sales_register`, `ledger_register` and `payout_approval`. The live `frontend/src/styles/_tokens.scss` (Ink / Antique Gold / Oxblood / Parchment, Fraunces / IBM Plex) differs, and the shipped e-Pin Register and sidebar use it; implementers must port the tokens deliberately rather than assume they match. An earlier draft of this mock used the live gold theme and was converted.

All colours in `code.html` sit in the `:root` block (or are `color-mix()` of those tokens). Because the sibling status colours are light, text on status tints uses derived tokens (`--success-ink`, `--warning-ink`, `--danger-strong`, mixed toward `text-primary`), and the cyan `brand-secondary` is used only as a non-text accent (sidebar active rule, logo mark), never as text. Layout rules from the siblings are kept (eyebrow, 1.75rem title, raised filter strip with 16px radius, 20px card with shadow, mono 0.6875rem uppercase table heads, page column, pager).

## Layout and regions

```
┌ sidebar 248px ┐ ┌ content ─────────────────────────────────────────────────────────────┐
│ Dashboard      │ │ INVENTORY & BOOKINGS (eyebrow)                                       │
│ Setup / Network│ │ Bookings & EMI (Geist 28)           [Confirm rule: Auto at 30%]   │
│ ▾ Inventory &  │ │ subtitle                                                            │
│   Bookings     │ │ [flash banner: success, dismissible, only after an action]          │
│    Projects &  │ │ Register [48] | Overdue report [7]            (tabs, violet underline) │
│     Plots      │ │ ┌ filters (raised strip) status|associate lookup|plot|project|Overdue│
│   ▸Bookings &  │ │ │ only|Reset                                                         │
│     EMI        │ │ ├ list card (table, newest first) ─┬ seal (sticky, 420px) ─────────┤
│ Finance / Sys  │ │ │ buyer+plot | associate | status  │ ── BOOKING DETAIL ──          │
│                │ │ │ total | paid(+meter) | due       │ buyer, chip, plot, id          │
│                │ │ │ rows…                            │ meta (associate, total, paid…) │
│                │ │ └ pager                            │ paid-vs-threshold meter        │
│                │ │                                    │ instalment table (Pay per row) │
│                │ │                                    │ [Confirm][Transfer][Cancel]    │
└────────────────┘ └──────────────────────────────────────────────────────────────────────┘
```

- Left aligned throughout; numbers right-aligned in JetBrains Mono with tabular figures, INR lakh grouping (`₹18,00,000`), formatted with `Intl.NumberFormat('en-IN')` / `currency` pipe with `en-IN`.
- The memorable element is the seal: the e-Pin double-rule panel in violet, with the **paid-vs-threshold meter** (green fill, dark tick at the confirm threshold) so the admin sees how close a booking is to auto-confirming before they press Pay. Everything else stays quiet.
- Dates always show the year (`5 Sep 2026`, Decision Q11); use `mediumDate`-style formatting, the instalment table scrolls horizontally inside the seal if needed.

### Sidebar entry

New group **Inventory & Bookings** (key `inventory-bookings`, icon `real_estate_agent`) holding `Projects & Plots` (unit 11) then `Bookings & EMI`, shared with unit 11 (Decision Q1). Rationale: both are plot-inventory work, neither is a ledger (Finance) nor company setup (Setup). Route proposal `/settings/bookings-emi`, key `bookingsEmi`, labelKey `settings.sections.bookingsEmi`. Units 11 and 12 both edit `admin-nav-categories.model.ts`; whichever lands second adds one `items[]` entry to the group the first created.

## Component inventory

Reused as-is: `app-associate-lookup`, `app-inline-banner` (danger/success/warning tones), `app-brand-button`, `app-tab-bar` (view tabs), `TranslateModule`, `DatePipe`. Epin-register CSS patterns (`__filters`, `__toggle`, `__grid`, `__detail`, `__seal`, `__seal-title`, `__meta`, `__chip`, `__pagination`) are re-scoped under `.bookings-emi__*`. New, screen-local only: the instalment sub-table (`.emi`), the threshold meter, the locked-amount field, the red `overdue` pill. No new shared primitive.

| Region | Behaviour |
|---|---|
| Confirm-rule pill | Reads `GET /api/company/booking-emi`. `MANUAL` shows "Confirm rule Manual, confirm each booking yourself". `AUTO_THRESHOLD` shows "Auto at x%". If `emiEnabled` is false or the call fails, hide the pill and the auto-confirm warnings (do not guess). |
| Tabs | Register / Overdue report. Overdue count badge = `totalElements` of the report (fetched on load with `size=1`). |
| Filters | Status select, Associate lookup, Plot, Project, Overdue-only toggle, Reset. Changing any filter reloads page 0. |
| Register table | Buyer (+ plot), Associate (name + id), Status chip (+ red "n overdue" pill), Total, Paid (+ meter), Due. Row is a `tr` with `tabindex=0`, Enter/Space selects. Selected row: soft violet fill + violet left rule. |
| Seal | Four modes: **detail**, **pay**, **confirm**, **cancel**, **transfer** (+ empty "select a booking"). Switching rows closes any open form (e-Pin `select()` behaviour). |
| Instalment table | `#`, Due (+ red "Overdue" pill when `overdue`, no day count (Decision Q10)), Amount, Status. PAID: green chip + paid date. PENDING: "Pending" + per-row **Pay** button. VOID: struck-through grey chip, no button. Scrolls inside the seal, opened scrolled to the first unpaid row. |
| Flash banner | Success `app-inline-banner` above the tabs, no toast (Decision Q7). |

## Flows and form specs (all replace the seal contents)

**Pay** (`PATCH /api/admin/bookings/{id}/installments/{n}/pay`). Opened from a row's Pay button. Fields: Amount received (read-only, locked, prefilled with the instalment amount, lock icon, hint "Fixed to the instalment amount. Part payments aren't supported."), Payment reference (required, `maxlength=100`, live counter), Received on (optional `datetime-local`, blank = now; sent as ISO instant or omitted). Submit label "Record ₹1,50,000" (states the amount). Request body `{ amount, paymentRef, paidAt? }`; amount is sent from the instalment, never typed.
- If `AUTO_THRESHOLD` and `(paid + instalment) / total >= threshold%` the form shows a warning block "This payment will confirm the booking", with the before/after paid amount, the sale amount and the note that failure rolls the payment back. Computed client-side from `BookingResponse` plus the config; the server stays the authority and the prediction may be stale (Decision Q8): the refreshed detail shows the real outcome.
- On 200: refetch the booking (the response is the full updated `BookingResponse`, so use it directly), refresh the row in the list, close the form. Banner copy depends on the result: if `status` changed `ACTIVE -> CONFIRMED` show **"Booking auto-confirmed. …"**, otherwise "Payment recorded."

**Confirm** (`POST .../confirm`, no body). Shown under both rules; states that it works even though only 25% is paid. Lists effects: sale amount = booking total, plot Booked -> Sold, sale credits the associate's ledger like a recorded sale, remaining instalments stay pending, undo = void the sale in the Sales Register.

**Cancel** (`POST .../cancel`, `{ reason }`). Reason required, `maxlength=255`, counter, inline "Enter a reason for cancelling." Consequence list stated before the button: PENDING instalments voided (count shown), amounts already paid stay on record with no refund handling, plot becomes Available unless another live booking holds it (server leaves a non-BOOKED plot as found, unit 6). Danger-filled primary "Cancel booking"; secondary "Keep booking" (not "Back", to avoid ambiguity with the action).

**Transfer** (`POST .../transfer`, `{ associateId }`). Associate lookup (same component as e-Pin), submit disabled until a target is chosen. Copy: only active associates can receive a booking; buyer, plan and paid instalments move with it; recorded in booking history.

**Disabled when not ACTIVE.** For CONFIRMED / CANCELLED bookings the three action buttons stay visible but `disabled`, with `aria-describedby` pointing to a visible reason: "Actions are only available while a booking is Active. To reverse a confirmed booking, void its sale in the Sales Register." (CANCELLED variant: "This booking was cancelled. Cancelled bookings can't be changed."). Per-row Pay buttons are not rendered. The reason is visible text, not a tooltip, so touch and keyboard users get it.

**In-flight.** The submitting button shows a spinner and "Recording…" / "Confirming…" / "Cancelling…" / "Transferring…", is `disabled` and `aria-busy`; all other form controls and the other three actions are disabled; row selection is locked until the call settles (prevents the stale-selection race the e-Pin screen guards with sequence numbers; use the same `seq` guard on the detail refetch). On Pay specifically (Decision Q6) the button is disabled while the call is in flight, so a double click cannot send two requests. If the call ends in a network error (no response), the form shows a danger banner "We couldn't confirm whether the payment was recorded. Reload to check whether instalment N was recorded before you try again." with a **Reload booking** action, and hides the submit button until the booking is refetched (state `pay-net`, `screen-pay-network-error.png`).

**Post-action refresh.** Pay/confirm/cancel/transfer all return the updated `BookingResponse`. Replace the selected booking with it, patch the list row in place, refetch the current list page and the overdue count (a cancelled/paid booking can leave the overdue tab). Keep the selection on the same booking. After a transfer the row's associate changes (resolved from the directory), and if the list is filtered by the old associate the row drops out on refetch; the booking stays selected and the seal shows the note "This booking no longer matches the current filters" (Decision Q9).

## Error mapping (per endpoint)

The 400/409 bodies are `{ "error": "<server text>" }` from `BookingExceptionHandler`. The UI maps by status plus a recognisable substring, shows friendly copy, and always keeps the raw server text as small muted "Server said: …" for support. Banners are danger `app-inline-banner`, `role="alert"`, rendered inside the open form (seal) so the admin keeps their input.

| Endpoint | Status | Server text (class) | UI copy | Where |
|---|---|---|---|---|
| pay | 400 | `Payment amount must equal the installment amount N` (PaymentAmountMismatch) | "The amount must be exactly ₹1,50,000, the instalment amount. Reload the booking in case the plan changed." + reload button | form banner |
| pay | 400 | bean validation: blank / >100 `paymentRef`, missing amount | Field error under the field: "Enter a payment reference." / "Keep the reference to 100 characters." | field |
| pay | 404 | `Booking not found` / `Installment N not found` | "This booking or instalment no longer exists." Close seal, refetch list. | banner + list refetch |
| pay | 409 | `Booking is not ACTIVE` | "This booking is no longer Active, so payments can't be recorded. It was confirmed or cancelled in the meantime." Refetch detail. | banner |
| pay | 409 | `Installment N of booking … is not payable` | "Instalment 4 is already paid or voided. Reload to see its current status." Refetch detail. | banner |
| pay | 409 | **`Plot is not available for booking: <plotId>`** (PlotNotAvailable) | **Plot-drift trap**, see below | banner |
| confirm | 409 | `Booking is not ACTIVE` | as above, "confirmed or cancelled" | banner |
| confirm | 409 | `Plot is not available for booking` | Same plot-drift copy, reworded for confirm: "The booking wasn't confirmed. Plot A-12 is no longer marked Booked, and confirming needs it to be Booked. Set the plot back to Booked in Projects & Plots, then try again." | banner |
| confirm | 404 | booking not found | as pay 404 | banner |
| cancel | 400 | blank / >255 reason | field error "Enter a reason for cancelling." / "Keep the reason to 255 characters." | field |
| cancel | 409 / 404 | not ACTIVE / not found | as pay | banner |
| transfer | 400 | `Booking is already assigned to associate …` (SameAssociate) | "Choose a different associate. This booking already belongs to Anjali Rao." | field-level under lookup |
| transfer | 400 | `Cannot transfer booking to associate …: associate is PENDING, must be ACTIVE` (InvalidTransferTarget) | "Only active associates can receive a booking. Suresh Patil's account is Pending." (status parsed from text, else generic) | under lookup |
| transfer | 404 | unknown associate / booking | "That associate wasn't found." / booking copy | under lookup / banner |
| transfer | 409 | not ACTIVE | as pay | banner |
| any | 401 / 403 | auth | existing global handling (login redirect / forbidden screen); the screen never shows write controls to non-admins | global |
| any | 5xx / network | | "Something went wrong and nothing was saved. Check your connection and try again." Keep the form open. For Pay, a network error uses the Reload-to-check flow above instead of a blind retry (Decision Q6). | banner |
| list / report GET | any | | Danger banner "The booking register didn't load. Check your connection and try again." + Try again; table region shows the error empty state. | page |

### Plot-drift trap (pay that crosses the threshold)

The API returns a bare 409 `Plot is not available for booking` and rolls the payment back, so the cash has not been recorded. Copy (shown in the pay form, `role="alert"`):

> **Payment not recorded. Plot A-12 is no longer marked Booked.**
> This payment would take the booking past the 30% auto-confirm threshold, and confirming needs the plot to be Booked. Nothing was saved: instalment 4 is still pending.
> **To fix it,** either set plot A-12 back to Booked in Projects & Plots, or switch the confirm rule to Manual in Settings, then record the payment again.

Detection: a 409 on `pay` whose body matches `Plot is not available` is classified as plot drift. The two other 409s on pay have distinct texts (`not ACTIVE`, `not payable`), so substring matching is reliable today but brittle (Decision Q4: kept for now; the copy is a best-effort hint, and a distinct error `code` from the backend, optional in unit 14, would be more robust). The recovery actions are links, not buttons: "Projects & Plots" (unit 11 route, deep-linked to the plot if unit 11 supports it) and "Settings" (Booking & EMI). The Pay form has no extra drift pre-warning (Decision Q4); the existing "This payment will confirm the booking" block is the only advance notice.

## States and edge cases

- **Loading**: skeleton rows (6) in the table card, `aria-busy="true"`; the seal keeps its previous content with filters disabled; overdue tab shows 3 skeleton rows.
- **Empty register (no bookings at all)**: "No bookings yet. When an associate books a plot it appears here, with its instalment plan." + primary "Go to Projects & Plots". **Empty with filters active**: "No bookings match these filters." + "Reset filters" (the same component, different copy; the mock shows the first).
- **Empty overdue**: calm and celebratory, no confetti: "Nothing overdue. Every active booking is paid up to date. This list fills in on its own when an instalment passes its due date." (`task_alt` glyph in a violet-ruled square.)
- **Error**: banner plus in-card error state with Try again; the Overdue tab count badge hides if its call fails.
- **No selection**: seal says "Select a booking to see its instalments and take action."
- **Selected booking vanished** after a filter change or refetch: seal returns to "no selection" unless the booking is still in the page; do not silently show stale data.
- **0 instalments paid / all paid**: meter 0% / 100%. No "Ready to confirm" chip (Decision Q14, not in spec).
- **ACTIVE with a PAID installment and CANCELLED**: Paid shows the retained amount; Due shows "—" (server returns due 0 for cancelled, VOID rows excluded).
- **Long names**: buyer and associate names truncate with ellipsis in the table and wrap in the seal; ids never wrap (`overflow-wrap: anywhere` on the id).
- **Overdue** is derived server-side from `status = PENDING and dueDate < today (UTC)`; the UI trusts `installment.overdue` and never recomputes it. The UI shows only "Overdue", never a client-side day count, to avoid timezone drift (Decision Q10).
- **Paying out of order** is allowed; every PENDING row has Pay.
- **Concurrent edits**: all four writes row-lock the booking; a 409 `not ACTIVE` after another admin acted is expected and handled above.

## Responsive behaviour

- **>= 1100px**: list + 420px seal (`minmax(0,1fr) 420px`), seal sticky and internally scrollable (`max-height: calc(100vh - 2rem)`).
- **961-1100px**: seal narrows to 360px.
- **<= 960px (tablet)**: single column, seal stacked under the list, static position; admin sidebar collapses to the top bar with a menu button (keeps the shipped shell's sidebar behaviour, not redesigned here; the admin console is desktop-first, Decision Q12). Page padding 1rem.
- **<= 768px (phone)**: register and overdue rows become one stacked card per row with `data-label` pairs (`content: attr(data-label)`), buyer + plot as the card title, meters hidden, filters one per row, toggle and reset full width, pager spreads, form action rows stack. Requires the one-line `[attr.data-label]` on `<td>` already flagged by `sales_register/DESIGN.md`. Touch targets (buttons, tabs, pager, rows' Pay) are at least 44px (Pay is 32px inside the dense instalment table; it is padded to 44px below 768px in implementation). When a row is tapped on phone, scroll the seal into view.
- Verified visually at 1440 and 600 wide only (headless Chrome enforces about 500px minimum), not at 390.

## Accessibility

- Tabs use `role=tablist/tab/tabpanel`, `aria-selected`, `aria-controls`; arrow-key movement per the existing `TabBarComponent`.
- Tables have `aria-label`, `scope=col` heads; rows selectable by Enter/Space; selected row has `aria-selected` or `aria-current`; the seal is `aria-live="polite"` and focus moves to the seal title when a form opens and returns to the triggering control when it closes.
- Status and overdue are never colour-only: text labels in the chip, "Overdue" text, struck-through VOID. Meter has `role=img` with text alternative. Contrast: status text on tinted chip backgrounds uses `--success-ink` / `--warning-ink` / `--danger-strong` (status colour mixed toward `text-primary`); verify 4.5:1 at 0.75rem when ported.
- Locked amount uses `readonly` (focusable, announced) rather than `disabled`, plus a visible reason. Disabled actions have a visible, programmatically associated reason.
- Errors are `role="alert"`; field errors linked with `aria-describedby`; counters are not live.
- `prefers-reduced-motion`: skeleton shimmer and spinner slow or stop; no entrance animations anywhere.
- Visible `:focus-visible` violet outline on every control.

## i18n copy list (keys under `admin.bookingsEmi.*`; sentence case; verbs stay consistent: Record, Confirm, Cancel, Transfer)

eyebrow "Inventory & Bookings" · title "Bookings & EMI" · subtitle "Track every plot booking, record instalments as they are collected, and chase the ones that are overdue." · tabs `tab.register` "Register", `tab.overdue` "Overdue report" · rule `rule.manual` "Confirm rule Manual" / `rule.auto` "Confirm rule Auto at {percent}%" / hints · filters: status "Status", "All statuses", `status.ACTIVE|CONFIRMED|CANCELLED` "Active|Confirmed|Cancelled", associate "Associate", "Any associate", plot "Plot", "Plot, e.g. A-12", project "Project", "All projects", overdueOnly "Overdue only", reset "Reset filters" · columns: buyer, associate, status, total, paid, due; overdue report: associate, buyer, plot, overdue, amountOverdue, oldestDue · `overduePill` "{count} overdue" · `overdueBadge` "Overdue" (no day count) · installment status `PENDING|PAID|VOID` "Pending|Paid|Void" · seal titles "Booking detail", "Record payment", "Confirm booking", "Cancel booking", "Transfer booking" · meta labels · `thresholdMeter` "Paid {pct}% of {threshold}% needed to auto-confirm" · actions: pay "Pay", `payBtn` "Record {amount}", confirm, transfer, cancel, keep "Keep booking", back "Back" · pending verbs "Recording…", "Confirming…", "Cancelling…", "Transferring…" · `err.pay.network` "We couldn't confirm whether the payment was recorded. Reload to check whether instalment {n} was recorded before you try again." + `reload` "Reload booking" · `filterMismatch` "This booking no longer matches the current filters" · field labels/hints (amount locked, reference required/100, received on optional) · cancel consequences (3 lines) · confirm effects (3 lines) · transfer hint · `locked.active`/`locked.cancelled` reasons · success: `ok.pay` "Payment recorded. Instalment {n} of booking {ref} is paid, {amount} received.", `ok.autoConfirm` "Booking auto-confirmed. Paying instalment {n} took {buyer} to {pct}% paid, past the {threshold}% threshold. Plot {plot} is now Sold and the sale is in the Sales Register.", `ok.confirm`, `ok.cancel` "Booking cancelled. {count} pending instalments voided and plot {plot} is Available again.", `ok.transfer` · all error copy in the table above (`err.pay.amountMismatch`, `err.plotDrift.pay`, `err.plotDrift.confirm`, …) · empty/loading/error copy above · pager "Page {page} of {totalPages} · {count} bookings". Currency and dates always through locale-aware pipes (`en-IN`), never concatenated strings.

## Data-binding map

| UI element | Source |
|---|---|
| Register rows | `GET /api/admin/bookings?status&associateId&plotId&projectId&overdue&page&size` -> `AdminBookingPageResponse { bookings[], page, size, totalElements }`; newest `bookedAt` first (server sort, no client sort) |
| Status filter | `status` = `ACTIVE | CONFIRMED | CANCELLED` |
| Associate filter | `app-associate-lookup` -> `associateId` (UUID) |
| Plot filter | `plotId` (UUID; the plot-number text input needs a plot lookup, or a `plotNo` query param if unit 14 adds one) |
| Project filter | `projectId` (UUID; options from the existing projects list endpoint) |
| Overdue toggle | `overdue=true` (ACTIVE bookings with an overdue instalment) |
| Page size | `size` 20 (server clamps 1-100, default 20) |
| Row: buyer | `BookingResponse.buyerName` |
| Row: associate name + id | `BookingResponse.associateName` (**dependency: unit 14 adds it**, Decision Q5) + `userId` label from `AdminService.listAssociates()` (`AssociateSummary { id, userId, name }`, e.g. VA-0042). Fallback until unit 14 lands: resolve the name client-side from the same directory; show `id.slice(0,8)` while loading / not found |
| Row: plot | `BookingResponse.plotNo` and `projectName` (**dependency: unit 14 adds them**, Decision Q3). Fallback: `plotId.slice(0,8)` |
| Row: status chip | `status` |
| Row: total / paid / due | `totalAmount` / `paidAmount` / `dueAmount` |
| Row: paid meter | `paidAmount / totalAmount` |
| Row: "n overdue" pill | `installments.filter(i => i.overdue).length` (rows carry installments) |
| Seal header | selected `BookingResponse` (buyerName, status, id) |
| Seal: booked date | `bookedAt` |
| Seal: plan | `installmentCount` x `installments[0].amount`, monthly (monthly is a display assumption from the spec's sample; derive from due dates if plans can vary) |
| Seal: confirm-rule pill + threshold tick | `GET /api/company/booking-emi` -> `{ emiEnabled, confirmRule, confirmThresholdPercent }` |
| Instalment table | `installments[] { installmentNumber, amount, dueDate, status, paidAt, overdue }` |
| Pay button visible | `status === 'ACTIVE'` (booking) and `installment.status === 'PENDING'` |
| Pay form amount (locked) | `installment.amount` |
| Pay submit | `PATCH /api/admin/bookings/{id}/installments/{installmentNumber}/pay` body `{ amount, paymentRef, paidAt? }` -> `BookingResponse` |
| Confirm submit | `POST /api/admin/bookings/{id}/confirm` -> `BookingResponse` |
| Cancel submit | `POST /api/admin/bookings/{id}/cancel` body `{ reason }` -> `BookingResponse` |
| Transfer submit | `POST /api/admin/bookings/{id}/transfer` body `{ associateId }` -> `BookingResponse` |
| Auto-confirm banner | pay response `status === 'CONFIRMED'` while previous status was `ACTIVE` |
| Overdue rows | `GET /api/admin/emi-reports/overdue?page&size` -> `OverdueReportPageResponse { rows[], page, size, totalElements }`, `OverdueReportRow { bookingId, plotId, plotNo, associateId, associateName, buyerName, overdueCount, overdueAmount, oldestDueDate }`; oldest due date first (server) |
| Overdue row click | set `selectedId = bookingId`, switch to Register tab, fetch `GET /api/admin/bookings/{id}` -> `BookingResponse`. **Dependency: that endpoint does not exist yet; unit 14 adds it (Decision Q2). Until it exists the click-through is not shippable** (the overdue tab itself is) |
| Tab badges | register `totalElements`; overdue report `totalElements` |
| Pager | `page`, `size`, `totalElements` (same math as e-Pin) |

## Backend follow-up: unit 14 (assumed, not yet specced)

Screen-side dependencies on one small backend unit: (a) `GET /api/admin/bookings/{id}` returning `BookingResponse` (required for the overdue click-through); (b) `plotNo` and `projectName` on `BookingResponse` (register plot column); (c) `associateName` on `BookingResponse` (register associate column; client-side directory resolution is the fallback); (d) optional: a distinct error `code` for the plot-drift 409. (b) and (c) have client-side fallbacks; (a) does not.

## Out of scope (spec)

Booking creation (unit 11, from an AVAILABLE plot), interest / down payment / part payment, refunds accounting, post-confirm cancel/transfer, payment-event history timeline (booking_event has no read endpoint), reminders/notifications, exports, associate-facing views.

## Decisions (defaults applied, pending user sign-off)

| Q | Default applied | Rationale |
|---|---|---|
| 1 Nav placement | New group "Inventory & Bookings", key `inventory-bookings`, shared with unit 11 (Projects & Plots + Bookings & EMI) | Both are plot-inventory work; one shared key avoids two groups |
| 2 Overdue click-through | Unit 14 adds `GET /api/admin/bookings/{id}`; screen binds to it; click-through not shippable until then | Cleanest load path; register has no id filter |
| 3 Plot number in register | Unit 14 adds `plotNo` and `projectName` to `BookingResponse`; design binds to them | Avoids a per-project plot fetch |
| 4 Plot-drift detection | Keep matching 409 text "Plot is not available"; copy is a best-effort hint; distinct error `code` (unit 14, optional) would be more robust. No pay-form pre-warning | Texts of the three pay 409s are distinct today; pre-check adds a fetch for a rare case |
| 5 Associate names | Unit 14 adds `associateName`; client-side directory resolution is the fallback | Works beyond the directory's page size |
| 6 Pay double-submit | Disable button in flight; on network error show "Reload to check whether the payment was recorded" with Reload action | Server has no idempotency key; reload is the safe check |
| 7 Success feedback | Existing inline banner, no toast | No toast primitive exists |
| 8 Confirm-rule prediction | Accept staleness; server is authoritative, refreshed detail shows the real outcome | Config changes between load and Pay are rare |
| 9 Post-transfer under associate filter | Keep booking selected with "no longer matches the current filter" note | Avoids the seal vanishing mid-task |
| 10 "Nd late" badge | Show just "Overdue", no client-side day count | Avoids timezone drift vs the server's UTC rule |
| 11 Instalment dates | Year on every date | Plans cross year boundaries; unambiguous |
| 12 Small screens | Desktop-first; below 960px stack seal under list; keep shipped sidebar behaviour | Do not redesign the shell here |
| 13 Booking history timeline | Out of scope for unit 12 | No read endpoint for `booking_event` |
| 14 "Ready to confirm" chip | Dropped | Not in spec |
