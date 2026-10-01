# Plot Booking Lifecycle (EMI Payments, Confirm, Cancel/Transfer, Registers, Availability Grid)

## Context

Plot/project inventory CRUD (`projects` package, incl. CSV import) and a create-only booking (`booking` package: `POST /api/admin/bookings`, `GET /api/associates/me/bookings`, flat no-interest EMI schedule from `booking_emi_config`) already exist (role-capability units 6, 7, 13). What is missing:

- `emi_installment` has no paid state, so no payment can be recorded and nothing can be overdue.
- `plot_booking` has no status, so no cancel, transfer or confirm.
- `booking_emi_config.confirmRule` (`MANUAL` / `AUTO_THRESHOLD`) and `confirmThresholdPercent` are stored but consumed by nothing.
- No admin booking list, no EMI/overdue report, no admin Projects & Plots screen, no availability grid for anyone.
- PRD §7.3 step 4: a booking feeds compensation (a `Sale`) only once **confirmed**. No booking-to-sale link exists; `SaleService.recordSale` works independently and requires the plot to be `AVAILABLE`.

Grounding: `land-mlm-platform-prd.md` §5.1 item 6, §5.2 items 5–6, §6 (`PlotBooking`, `EMISchedule`/`EMIPayment`), §7.3, §9 open question 1 (confirm rule). Role model per `2026-08-03-role-capability-data-visibility-design.md`: Admin performs all writes on an associate's behalf; Associate is view-only. Sibling: `2026-08-03-sales-domain-design.md` (void flow, plot status flips) and `2026-08-03-epin-domain-design.md` (endpoint split conventions).

## Scope

In scope: installment payment recording, derived overdue state, confirm (manual and auto-threshold) creating a `Sale`, pre-confirm cancel, pre-confirm associate transfer, admin booking register, admin overdue report, associate paid/due/overdue visibility, associate-reachable plot read for a grid, admin "Projects & Plots" and "Bookings & EMI" screens, associate view-only grid.

Out of scope: interest/down-payment/free-form payment allocation, refunds accounting (cancel records a note only), post-confirm cancel/transfer (use the existing sale-void flow), plot-swap transfers, payment gateway, notifications/reminders, finance exports.

## Decisions

1. **Confirm rule = existing policy.** `MANUAL`: admin calls confirm. `AUTO_THRESHOLD`: confirm fires inside the pay call when paid% (paid amount / `total_amount`) >= `confirmThresholdPercent`. Manual confirm is also allowed under `AUTO_THRESHOLD` (admin override), never blocked.
2. **Confirm creates the Sale (approach 1).** Extract the ledger/leg-volume/cycle logic of `SaleService.recordSale` into an internal `SaleService.recordConfirmedBooking(booking, …)` that accepts a `BOOKED` plot, flips it to `SOLD`, sets `sale.booking_id`. `recordSale` keeps its own guards and behaviour unchanged. Sale amount = `booking.total_amount`; `buyerName/buyerPhone` from the booking; `projectId` from the plot; `note` = "Confirmed from booking {id}". Confirm, status flip and sale creation are one transaction.
3. **Voiding a booking-linked sale** returns the plot to `AVAILABLE` (existing void behaviour); the booking stays `CONFIRMED` (history), cancellation is not retroactive.
4. **Cancel: `ACTIVE` only.** Plot to `AVAILABLE`, `PENDING` installments to `VOID`, `PAID` installments untouched (amounts retained as a note, no refund accounting), `cancel_reason` required. `CONFIRMED` or already `CANCELLED` is 409.
5. **Transfer: `ACTIVE` only,** reassigns `associate_id` to another existing, non-suspended associate; installments and payments carry over; same-associate transfer is 400. Recorded as a `booking_event` row (see Data model).
6. **Payments are per-installment, admin-recorded,** amount must equal the installment amount, installments need not be paid in order. Already `PAID`/`VOID` installment is 409. Booking not `ACTIVE` is 409.
7. **Overdue is derived,** never stored: `status = PENDING` and `due_date < today (UTC)`. No batch job.
8. **Locking.** Pay, confirm, cancel and transfer row-lock the `PlotBooking` (`findByIdForUpdate`), cancel/confirm also lock the `Plot`, same pattern as `createBooking`/`recordSale`.
9. **Buyer fields.** `CreateBookingRequest` gains required `buyerName` and optional `buyerPhone`.
10. **Associate plot read** is a new endpoint returning only plot number, type, area, price and status, with no buyer/booking data. Falls through to `anyRequest().authenticated()`.
11. **Pagination** clamps `page >= 0`, `size <= 100` everywhere, as in existing controllers.
12. **All writes are ADMIN-only** via `SecurityConfig`'s existing blanket admin write rules for `/api/admin/**`. Associate token gets 403, unauthenticated 401.

## Data model

New migration (next free `V__` number at implementation time):

- `plot_booking` add: `status` VARCHAR NOT NULL default `ACTIVE` (`ACTIVE`/`CONFIRMED`/`CANCELLED`, CHECK constraint — see the DB-enum-CHECK lesson in `self_performance_bonus_spec_status`), `buyer_name` NOT NULL (backfill from associate name), `buyer_phone` NULL, `confirmed_at`, `cancelled_at`, `cancel_reason` NULL, `sale_id` NULL (FK `sale`).
- `emi_installment` add: `status` NOT NULL default `PENDING` (`PENDING`/`PAID`/`VOID`, CHECK), `paid_at` NULL, `payment_ref` NULL, `recorded_by` NULL (FK `associate`).
- `sale` add: `booking_id` NULL (FK `plot_booking`, unique when not null).
- `booking_event` (id, booking_id, type [`PAID`/`CONFIRMED`/`CANCELLED`/`TRANSFERRED`], actor_id, detail, created_at) for audit of transfer/cancel/confirm/pay.

DTOs: `RecordPaymentRequest(amount, paymentRef, paidAt?)`, `CancelBookingRequest(reason)`, `TransferBookingRequest(associateId)`, `AdminBookingPageResponse`, `BookingResponse` extended with `status`, `buyerName`, `paidAmount`, `dueAmount`, `installments[status, paidAt, overdue]`, `OverdueReportPageResponse`, `PlotGridResponse`.

New exceptions: `BookingNotFoundException` (404), `BookingNotActiveException` (409), `InstallmentNotPayableException` (409), `InstallmentNotFoundException` (404), `SameAssociateTransferException` (400).

## Flows

### Record payment — `PATCH /api/admin/bookings/{id}/installments/{n}/pay`
Lock booking; 404 if missing, 409 if not `ACTIVE`; 404 if installment `n` missing; 409 if not `PENDING`; 400 if body amount != installment amount. Set `PAID`, `paid_at` (default now), `payment_ref`, `recorded_by`; write `booking_event`. If rule is `AUTO_THRESHOLD` and paid% >= threshold, run the confirm flow in the same transaction.

### Confirm — `POST /api/admin/bookings/{id}/confirm`
Lock booking then plot; 409 if not `ACTIVE`. `SaleService.recordConfirmedBooking`, set `CONFIRMED`, `confirmed_at`, `sale_id`; event. Plot `BOOKED` to `SOLD`.

### Cancel — `POST /api/admin/bookings/{id}/cancel`
Per Decision 4. 400 on blank reason.

### Transfer — `POST /api/admin/bookings/{id}/transfer`
Per Decision 5. 404 `AssociateNotFoundException` for unknown target.

### Admin register — `GET /api/admin/bookings`
Filters `status`, `associateId`, `plotId`, `projectId`, `overdue=true`; paged `AdminBookingPageResponse`.

### Overdue report — `GET /api/admin/emi-reports/overdue`
Bookings that are `ACTIVE` with at least one overdue installment; each row: booking, associate, buyer, overdue count, overdue amount, oldest due date. Paged.

### Associate own view — `GET /api/associates/me/bookings` (extended)
Same self-scope; response gains status, paid/due amounts, per-installment status and overdue flag. Buyer name included (own bookings).

### Plot grid read — `GET /api/projects/{id}/plots/grid`
Any authenticated user; `PlotGridResponse` (plotId, plotNo, type, area, price, status). Unknown project 404.

## Screens

- **Admin "Projects & Plots":** project list; per-project colour-coded grid (`AVAILABLE` / `BOOKED` / `SOLD`) using the existing token system; plot create/edit via existing CRUD endpoints; "Book" action from an `AVAILABLE` plot opening a booking form (associate lookup, buyerName, buyerPhone).
- **Admin "Bookings & EMI":** register with filters; booking detail with installment table and Pay / Confirm / Cancel / Transfer actions (disabled unless `ACTIVE`), surfacing 409/400 outcomes; overdue report tab.
- **Associate:** view-only availability grid; existing Plot Bookings screen shows status, paid/due, overdue badges. No write affordance.

## Error handling

| Case | Result |
|---|---|
| Booking/installment/associate/project unknown | 404 |
| Booking not `ACTIVE` for pay/confirm/cancel/transfer | 409 `BookingNotActiveException` |
| Installment not `PENDING` | 409 |
| Payment amount != installment amount, blank cancel reason, same-associate transfer, bean validation | 400 |
| Associate token on admin endpoints | 403; unauthenticated 401 |

## Testing

- Service tests: pay (happy, wrong amount, double pay, not-active), auto-threshold confirm at/below threshold, manual confirm under both rules, cancel, transfer, overdue derivation with a fixed `Clock`.
- Confirm integration: Sale row linked, plot `SOLD`, ledger/leg-volume effects match `recordSale`; void of the linked sale returns plot to `AVAILABLE`.
- Concurrency: concurrent pay/confirm/cancel on one booking; two simultaneous confirms yield exactly one Sale (mirror `BookingConcurrencyTest`).
- Repository/DB: CHECK constraints reject invalid `status` values; unique `sale.booking_id`.
- `SecurityConfigTest`: 403/401 matrix for all new endpoints; grid endpoint reachable by an associate token.
- Existing `recordSale`/`voidSale`/`createBooking` tests stay green (refactor safety net).
- Frontend: component/service specs for both admin screens and the associate grid; no e2e (deferred per project plan).

## File overlap notes (for planning/slicing)

Touches `SaleService.java` and `Sale.java` (refactor + `booking_id`), `SecurityConfig.java` (new grid read), `BookingService`/`PlotBooking`/`EmiInstallment`, and admin nav (`admin` sidebar). Sequence units touching `SaleService` and `SecurityConfig` against any other in-flight spec.

## Resolved decisions (post-slice)

1. `RecordPaymentRequest` carries `amount`; server returns 400 if it != the installment amount.
2. Cancel stores the reason and total paid amount in the `CANCELLED` `booking_event.detail`; no new column.
3. Confirm rule/threshold are read from the current global `booking_emi_config` singleton at pay/confirm time (no per-booking snapshot, not per-project).
4. Transfer target must be `ACTIVE`; `PENDING` or suspended targets return 400.
5. `overdue=true` on the admin register is restricted to `ACTIVE` bookings, matching the overdue report.
6. Auto-confirm writes both a `PAID` and a `CONFIRMED` `booking_event` in the same transaction.
7. `createBooking` already sets the plot `BOOKED` (existing behaviour, unchanged).
8. Register sorts by `booked_at` descending; overdue report by oldest overdue due date ascending.

## Open items

None blocking. Auto-confirm threshold uses paid amount / total amount of the booking; if finance later wants a KYC gate on confirm (PRD §9 q1 alternative), it is a follow-up.
