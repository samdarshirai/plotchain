# Plot Booking Lifecycle — Unit Queue

Sliced from `docs/superpowers/specs/role-capability/2026-10-01-plot-booking-lifecycle-design.md` by spec-slicer, 2026-10-01. This file is the persisted record of that slice — a fresh session should read this instead of re-running spec-slicer, unless the source spec has changed since.

No ADRs or glossary file exist for this spec; sliced from the spec doc alone. Endpoint units were sliced first; the spec's "Screens" section was then cross-checked and one `screen` unit added per named screen (Admin "Projects & Plots", Admin "Bookings & EMI", Associate grid + extended Plot Bookings), grouped by screen not by endpoint. Pure-backend units (unit 3 extraction) have no screen.

**Migration placement:** the whole schema change (Data model: `plot_booking`, `emi_installment`, `sale.booking_id`, `booking_event`, all status CHECKs, unique `sale.booking_id`) lands in unit 1 as one migration file, because units 2-9 all share it and splitting would create several migrations against the same tables; unit 1 is still a demoable outcome (buyer fields + status/paid/due/overdue on the associate own view), not a bare schema unit.

**Status legend:** `pending` (not started) · `planned` (plan file exists, not yet implemented) · `merged` (implemented, reviewed, on `master`)

| Unit # | Title | Type | Depends on | Status | Plan file path | Merged commit range |
|---|---|---|---|---|---|---|
| 1 | Bookings carry buyer details and an `ACTIVE` status; associate own view shows status, paid/due and per-installment overdue — schema migration + `POST /api/admin/bookings` + `GET /api/associates/me/bookings` | backend | none | merged | `2026-10-01-plot-booking-unit-1-buyer-status-own-view.md` | `a321459..a6ba44f` |
| 2 | Admin records a per-installment payment — `PATCH /api/admin/bookings/{id}/installments/{n}/pay` | backend | 1 | merged | `2026-10-01-plot-booking-unit-2-pay-installment.md` | `a0b3c6b..d7d6ec1` |
| 3 | `SaleService.recordConfirmedBooking` extracted from `recordSale` with `recordSale` behaviour unchanged | backend | 1 | merged | `2026-10-01-plot-booking-unit-3-extract-confirmed-booking-sale.md` | `2b36d24..c5dbac8` (merge `490f137`) |
| 4 | Admin manually confirms an `ACTIVE` booking, creating a linked `Sale` — `POST /api/admin/bookings/{id}/confirm` | backend | 1, 3 | merged | `2026-10-01-plot-booking-unit-4-manual-confirm.md` | `aa2f5b5..a7f7909` (merge `feaaa8b`) |
| 5 | `AUTO_THRESHOLD` rule confirms the booking inside the pay call once paid% reaches the threshold | backend | 2, 4 | merged | `2026-10-01-plot-booking-unit-5-auto-threshold-confirm.md` | `397e3d5..90689fd` (merge `d90168a`) |
| 6 | Admin cancels an `ACTIVE` booking — `POST /api/admin/bookings/{id}/cancel` | backend | 1 | merged | `2026-10-01-plot-booking-unit-6-cancel-booking.md` | `d49b9ff..ee40da4` (merge `a46f1f4`) |
| 7 | Admin transfers an `ACTIVE` booking to another associate — `POST /api/admin/bookings/{id}/transfer` | backend | 1 | planned | `2026-10-01-plot-booking-unit-7-transfer-booking.md` | — |
| 8 | Admin views a paged, filterable booking register — `GET /api/admin/bookings` | backend | 1 | planned | `2026-10-01-plot-booking-unit-8-admin-booking-register.md` | — |
| 9 | Admin views a paged overdue EMI report — `GET /api/admin/emi-reports/overdue` | backend | 1 | planned | `2026-10-01-plot-booking-unit-9-overdue-emi-report.md` | — |
| 10 | Any authenticated user reads a project's plot grid — `GET /api/projects/{id}/plots/grid` | backend | none | pending | — | — |
| 11 | Admin "Projects & Plots" screen — project list, colour-coded plot grid, plot create/edit, "Book" action | screen | 1, 10 | pending | — | — |
| 12 | Admin "Bookings & EMI" screen — register, booking detail with Pay/Confirm/Cancel/Transfer, overdue report tab | screen | 1, 2, 4, 5, 6, 7, 8, 9 | pending | — | — |
| 13 | Associate view-only availability grid + extended Plot Bookings screen | screen | 1, 10 | pending | — | — |

**Dependency order:**

```
1 (schema + buyer/status + associate own view data) ─┬─→ 2 (pay) ──────────────┐
                                                      ├─→ 3 (extract recordConfirmedBooking) ─→ 4 (manual confirm) ─┬─→ 5 (auto-confirm; also needs 2)
                                                      ├─→ 6 (cancel)            │
                                                      ├─→ 7 (transfer)          │
                                                      ├─→ 8 (admin register)    │
                                                      └─→ 9 (overdue report)    │
10 (plot grid read) ─ independent ───────────────────────────────────────────────┘

1, 10 ──────────────────────────→ 11 (Admin Projects & Plots)
1, 2, 4, 5, 6, 7, 8, 9 ─────────→ 12 (Admin Bookings & EMI)
1, 10 ──────────────────────────→ 13 (Associate grid + Plot Bookings)
```

Units 2, 3, 6, 7, 8, 9, 10 are mutually independent once 1 is built (10 needs nothing); order among them doesn't matter. Unit 5 needs both 2 and 4. Units 11-13 are mutually independent.

## Unit detail

### 1. Bookings carry buyer details and an `ACTIVE` status; associate own view shows status, paid/due and per-installment overdue

**Depends on:** none
**Refs:** Context; Decisions 7, 9, 11; Data model (all tables, DTOs); Flows "Associate own view"; Error handling; Testing (Repository/DB, `SecurityConfigTest`, existing `createBooking` tests)

Acceptance criteria:
- One new migration (next free `V__` number) adds, per Data model: `plot_booking.status` (`ACTIVE`/`CONFIRMED`/`CANCELLED`, default `ACTIVE`, CHECK), `buyer_name` NOT NULL (backfilled from associate name), `buyer_phone`, `confirmed_at`, `cancelled_at`, `cancel_reason`, `sale_id` (FK `sale`); `emi_installment.status` (`PENDING`/`PAID`/`VOID`, default `PENDING`, CHECK), `paid_at`, `payment_ref`, `recorded_by` (FK `associate`); `sale.booking_id` (FK `plot_booking`, unique when not null); new `booking_event` table (id, booking_id, type `PAID`/`CONFIRMED`/`CANCELLED`/`TRANSFERRED`, actor_id, detail, created_at).
- DB rejects an invalid `status` on `plot_booking` and `emi_installment`, and a duplicate non-null `sale.booking_id` (Testing, Repository/DB; DB-enum-CHECK lesson).
- `CreateBookingRequest` gains required `buyerName` and optional `buyerPhone`; a missing/blank `buyerName` returns 400 (Decision 9). New bookings start `ACTIVE`.
- `GET /api/associates/me/bookings` stays self-scoped; `BookingResponse` gains `status`, `buyerName`, `paidAmount`, `dueAmount`, `installments[status, paidAt, overdue]` (Flows "Associate own view"; Data model).
- Overdue is derived, never stored: `status = PENDING` and `due_date < today (UTC)`, computed with an injectable `Clock`; no batch job (Decision 7; Testing).
- Associate token on `POST /api/admin/bookings` gets 403, unauthenticated 401 (Decision 12).
- Existing `createBooking` tests stay green (Testing).
- New exceptions `BookingNotFoundException` (404), `BookingNotActiveException` (409), `InstallmentNotPayableException` (409), `InstallmentNotFoundException` (404), `SameAssociateTransferException` (400) are defined here as shared types (Data model); `findByIdForUpdate` lock pattern per Decision 8 is reused from `createBooking`.

### 2. Admin records a per-installment payment

**Depends on:** 1
**Refs:** Decisions 6, 7, 8, 12; Flows "Record payment"; Error handling; Testing (service tests, concurrency)

Acceptance criteria:
- ADMIN `PATCH /api/admin/bookings/{id}/installments/{n}/pay` with `RecordPaymentRequest(amount, paymentRef, paidAt?)` locks the booking (`findByIdForUpdate`), sets installment `PAID`, `paid_at` (default now), `payment_ref`, `recorded_by`, and writes a `PAID` `booking_event` (Flows).
- Unknown booking 404; booking not `ACTIVE` 409 `BookingNotActiveException`; unknown installment `n` 404; installment not `PENDING` (already `PAID`/`VOID`) 409; amount mismatch 400 (Flows; Decision 6; Error handling). See Ambiguities re: where the amount comes from.
- Installments may be paid in any order (Decision 6).
- Concurrent pay on one installment succeeds exactly once (Testing, concurrency).
- Associate token 403, unauthenticated 401 (Decision 12).
- This unit does not trigger auto-confirm (unit 5).

### 3. `SaleService.recordConfirmedBooking` extracted from `recordSale`

**Depends on:** 1
**Refs:** Decision 2; Testing ("Existing `recordSale`/`voidSale`/`createBooking` tests stay green"); File overlap notes

Acceptance criteria:
- The ledger/leg-volume/cycle logic of `recordSale` is extracted into an internal `SaleService.recordConfirmedBooking(booking, …)` that accepts a `BOOKED` plot, flips it to `SOLD`, and sets `sale.booking_id` (Decision 2).
- Sale amount = `booking.total_amount`; `buyerName`/`buyerPhone` from the booking; `projectId` from the plot; `note` = "Confirmed from booking {id}" (Decision 2).
- `recordSale` keeps its own guards (plot must be `AVAILABLE`) and behaviour unchanged; all existing `recordSale`/`voidSale` tests stay green (Decision 2; Testing).
- Service-level test: ledger/leg-volume effects of `recordConfirmedBooking` match `recordSale` for the same inputs (Testing, Confirm integration).
- No endpoint is added in this unit.

### 4. Admin manually confirms an `ACTIVE` booking, creating a linked `Sale`

**Depends on:** 1, 3
**Refs:** Decisions 1, 2, 3, 8, 12; Flows "Confirm"; Error handling; Testing (service, confirm integration, concurrency)

Acceptance criteria:
- ADMIN `POST /api/admin/bookings/{id}/confirm` locks booking then plot; booking not `ACTIVE` is 409 `BookingNotActiveException`; unknown booking 404 (Flows; Decision 8).
- On success: `recordConfirmedBooking` runs, booking becomes `CONFIRMED` with `confirmed_at` and `sale_id`, plot `BOOKED` -> `SOLD`, a `CONFIRMED` `booking_event` is written — all in one transaction (Decision 2; Flows).
- Manual confirm is allowed under both `MANUAL` and `AUTO_THRESHOLD` rules, never blocked (Decision 1).
- Integration: Sale row linked via `booking_id`, plot `SOLD`, ledger/leg-volume effects match `recordSale` (Testing).
- Voiding the linked sale returns the plot to `AVAILABLE`; the booking stays `CONFIRMED` (Decision 3; Testing).
- Two simultaneous confirms yield exactly one `Sale`, mirroring `BookingConcurrencyTest` (Testing).
- Associate token 403, unauthenticated 401 (Decision 12).

### 5. `AUTO_THRESHOLD` rule confirms the booking inside the pay call

**Depends on:** 2, 4
**Refs:** Decisions 1, 2; Flows "Record payment" (last sentence); Open items; Testing (auto-threshold)

Acceptance criteria:
- When the rule is `AUTO_THRESHOLD` and paid% (paid amount / `total_amount`) >= `confirmThresholdPercent` after a payment, the confirm flow runs in the same transaction as the pay (Decision 1; Flows).
- At/above threshold confirms; below threshold does not (Testing, "at/below threshold").
- Under `MANUAL`, paying never auto-confirms (Decision 1).
- If the confirm step fails, the payment is rolled back too (same transaction — Flows).

### 6. Admin cancels an `ACTIVE` booking

**Depends on:** 1
**Refs:** Decisions 4, 8, 12; Flows "Cancel"; Error handling; Testing (cancel, concurrency)

Acceptance criteria:
- ADMIN `POST /api/admin/bookings/{id}/cancel` with `CancelBookingRequest(reason)`; blank reason 400 (Flows; Error handling).
- On success: booking `CANCELLED` with `cancelled_at`/`cancel_reason`; plot -> `AVAILABLE`; `PENDING` installments -> `VOID`; `PAID` installments untouched; `CANCELLED` `booking_event` written (Decision 4).
- `CONFIRMED` or already `CANCELLED` booking is 409; unknown booking 404 (Decision 4; Error handling).
- Locks booking and plot (Decision 8); concurrent cancel/pay/confirm on one booking resolves to one winner (Testing).
- Associate token 403, unauthenticated 401.

### 7. Admin transfers an `ACTIVE` booking to another associate

**Depends on:** 1
**Refs:** Decisions 5, 8, 12; Flows "Transfer"; Error handling; Testing (transfer)

Acceptance criteria:
- ADMIN `POST /api/admin/bookings/{id}/transfer` with `TransferBookingRequest(associateId)` reassigns `associate_id`; installments and payments carry over; `TRANSFERRED` `booking_event` written (Decision 5).
- Unknown target 404 `AssociateNotFoundException`; same-associate target 400 `SameAssociateTransferException`; booking not `ACTIVE` 409; unknown booking 404 (Flows; Decision 5; Error handling).
- Target must be non-suspended (Decision 5). See Ambiguities re: other non-active associate states.
- Booking row-locked (Decision 8).
- Associate token 403, unauthenticated 401.

### 8. Admin views a paged, filterable booking register

**Depends on:** 1
**Refs:** Decisions 11, 12; Flows "Admin register"; Data model (`AdminBookingPageResponse`)

Acceptance criteria:
- ADMIN `GET /api/admin/bookings` returns `AdminBookingPageResponse`, paged, `page >= 0`, `size <= 100` clamped (Decision 11).
- Combinable filters `status`, `associateId`, `plotId`, `projectId`, `overdue=true` (Flows).
- Rows include extended `BookingResponse` fields (status, buyerName, paid/due, installments).
- Associate token 403, unauthenticated 401.

### 9. Admin views a paged overdue EMI report

**Depends on:** 1
**Refs:** Decisions 7, 11, 12; Flows "Overdue report"; Testing (overdue with fixed `Clock`)

Acceptance criteria:
- ADMIN `GET /api/admin/emi-reports/overdue` returns `OverdueReportPageResponse`, paged and clamped (Decision 11).
- Only `ACTIVE` bookings with at least one overdue installment appear; each row has booking, associate, buyer, overdue count, overdue amount, oldest due date (Flows).
- Overdue is derived per Decision 7; verified with a fixed `Clock` (Testing).
- Associate token 403, unauthenticated 401.

### 10. Any authenticated user reads a project's plot grid

**Depends on:** none (reads existing `projects`/`plot` data)
**Refs:** Decision 10; Flows "Plot grid read"; Testing (`SecurityConfigTest`); File overlap notes

Acceptance criteria:
- `GET /api/projects/{id}/plots/grid` returns `PlotGridResponse` (plotId, plotNo, type, area, price, status) and nothing else — no buyer/booking data (Decision 10).
- Unknown project 404 (Flows).
- Reachable by an associate token and an admin token via `anyRequest().authenticated()`; unauthenticated 401 (Decision 10; Testing).
- Any `SecurityConfig` edit is limited to what this needs (ideally none) — see File overlap check.

### 11. Admin "Projects & Plots" screen

**Depends on:** 1, 10 (plus existing, already-merged project/plot CRUD and associate lookup)
**Refs:** Screens "Admin Projects & Plots"; Scope

Acceptance criteria:
- Project list; selecting a project shows a colour-coded grid (`AVAILABLE`/`BOOKED`/`SOLD`) using the existing token system, fed by unit 10.
- Plot create/edit via the existing CRUD endpoints.
- "Book" action on an `AVAILABLE` plot opens a booking form (associate lookup, `buyerName`, `buyerPhone`) calling unit 1's create endpoint, surfacing 400/409 outcomes.
- Admin sidebar entry added in the collapsible admin sidebar (File overlap notes).
- Component/service specs; no e2e (Testing).

### 12. Admin "Bookings & EMI" screen

**Depends on:** 1, 2, 4, 5, 6, 7, 8, 9
**Refs:** Screens "Admin Bookings & EMI"; Error handling; Testing (frontend)

Acceptance criteria:
- Register with filters (`status`, `associateId`, `plotId`, `projectId`, overdue) and pagination (unit 8).
- Booking detail with installment table (status, paid date, overdue badge) and Pay (2), Confirm (4), Cancel (6), Transfer (7) actions, disabled unless booking is `ACTIVE`; 409/400 outcomes are surfaced; an auto-confirm after Pay (5) is reflected in the refreshed detail.
- Overdue report tab (unit 9).
- Admin sidebar entry (shared with unit 11 — whichever lands second reuses the nav pattern).
- Component/service specs; no e2e.

### 13. Associate view-only availability grid + extended Plot Bookings screen

**Depends on:** 1, 10
**Refs:** Screens "Associate"; Decision 10; Flows "Associate own view"

Acceptance criteria:
- View-only grid of a project's plots (plot number, type, area, price, status) from unit 10; no buyer/booking data shown.
- Existing Plot Bookings screen shows booking status, paid/due amounts, and overdue badges per installment (unit 1).
- No write affordance anywhere on either (Screens; Decision 12).
- Component/service specs; no e2e.

## Ambiguities — all resolved 2026-10-01 (see spec "Resolved decisions (post-slice)")

Resolutions: (1) `RecordPaymentRequest` gains `amount`, 400 on mismatch; (2) cancel stores reason + paid total in `CANCELLED` `booking_event.detail`; (3) current global `booking_emi_config` at pay/confirm time; (4) transfer target must be `ACTIVE`; (5) `overdue=true` limited to `ACTIVE` bookings; (6) auto-confirm writes both `PAID` and `CONFIRMED` events; (7) `createBooking` already sets `BOOKED`; (8) register `booked_at` desc, overdue report oldest due date asc. Original questions kept below for the record.


1. **Payment amount source.** Decision 6 and Flow "Record payment" say "amount must equal the installment amount" / "400 if body amount != installment amount", but `RecordPaymentRequest(paymentRef, paidAt?)` has no amount field. Either the DTO gains an `amount`, or there is nothing to mismatch (and the 400 case is dropped). Unit 2 lists the 400 criterion pending this.
2. **Where cancelled-booking paid amounts are "retained as a note".** Decision 4 says PAID amounts are retained "as a note"; no column/event field is named (`cancel_reason`? `booking_event.detail`?).
3. **Which `booking_emi_config` applies at confirm time** (current config vs the one in force at booking creation), and whether the config is per project or global. Spec says only "existing policy".
4. **Transfer target eligibility.** Decision 5 says "non-suspended"; the epin blog-extension added a PENDING associate status. Whether PENDING (or other non-ACTIVE) targets are allowed is unspecified.
5. **`overdue=true` on the admin register** — whether it is restricted to `ACTIVE` bookings (as the overdue report is) is not stated.
6. **Event rows on auto-confirm** — pay + confirm in one call presumably writes both a `PAID` and a `CONFIRMED` event; not stated explicitly.
7. **Admin booking-creation response / plot status.** The spec assumes `createBooking` already moves the plot to `BOOKED` (confirm "Plot `BOOKED` to `SOLD`"); not restated in the spec.
8. **Sort order** of the register and overdue report is unspecified.

**Spec correction (unit 3 planning, 2026-10-01):** the spec/units text refers to "leg-volume" logic in `recordSale`; there is none at sale time. `recordSale` only snapshots `legCredited` and `cycleId`; leg volumes are computed at cycle close in `CycleService.rollUpLegVolumes`. Unit 3 parity is therefore proven on `legCredited`, `cycleId` and the ledger entry.

**Carry-forward notes for planners (from unit 2/3 reviews):**
- `SaleService.recordConfirmedBooking(bookingId, associateId, buyerName, buyerPhone, totalAmount, Plot)` takes primitives so `sales` never imports `booking` (repo rule: booking must not depend on sales' package direction reversed; `booking -> sales` is the allowed direction). Unit 4 calls it from `BookingService` with the locked plot; a non-`BOOKED` plot throws `sales.PlotNotAvailableException` — unit 4 should translate it to a booking-flavoured error.
- Unit 4/5/6/7 first write non-`PAID` `booking_event` types: add a test that persists one event per `BookingEventType` value (enum-CHECK lesson; unit 2 only covers `PAID`). Also pin that a future `paidAt` is accepted and that a `PAID`/`VOID` installment returns 409 if not already covered.
- Unit 5 hooks into `BookingService.afterInstallmentPaid(booking, installments, actorId)` (empty seam from unit 2).
- `plot_booking.sale_id` / `sale.booking_id` redundant two-way link: DECIDED in unit 4 — `sale.booking_id` (FK + unique `uq_sale_booking_id`) is authoritative; `plot_booking.sale_id` stays as an unindexed read convenience. Circular FKs: test cleanup must `UPDATE plot_booking SET sale_id = NULL` before deleting sales.
- Unit 4 provides package-private `BookingService.confirmLocked(booking, actorId)` (locks plot itself; lock order booking -> plot) for unit 5 to call from `afterInstallmentPaid`. Unit 5 must also prove atomicity of pay+confirm (rollback test with a spy, see `BookingConfirmIntegrationTest.aFailureAfterTheSaleIsCreatedRollsTheWholeConfirmBack`; Boot 3.3.4 so use `@SpyBean`, not `@MockitoSpyBean`).

**Known follow-ups / operational notes (unit 5 review, merged as-is 2026-10-01):**
- Cosmetic debt (unit 5 review S1-S3): FIXED post-merge — block reindented, `lockedAutoBooking` wrapper removed, static imports for `times`/`reset`, `pool.shutdownNow()` moved into `finally` in the two race tests.
- Operational trap (spec-mandated): if a plot has drifted away from `BOOKED`, any pay that crosses the `AUTO_THRESHOLD` fails with 409 `PlotNotAvailableException` and rolls back, so the cash cannot be recorded until the plot is repaired or the config switched to `MANUAL`. The 409 text does not hint at the cause. Surface this in unit 12's UI error copy.
- A `VOID` installment exclusion from paid% has no unit test (no flow yields `VOID` until unit 6).

**Cross-plan notes (units 6-9 planning, 2026-10-01):**
- `SecurityConfig` has NO blanket `GET /api/admin/**` ADMIN rule (only POST/PUT/PATCH/DELETE `/api/**`); every admin GET needs its own explicit matcher. Units 8 and 9 add matchers (`GET /api/admin/bookings`, `GET /api/admin/emi-reports/overdue`); the spec's Decision 12 wording is wrong for reads. Unit 10's grid read is intentionally any-authenticated.
- Implementation order is sequential 6 -> 7 -> 8 -> 9. Units 6 and 7 append to `BookingService`, `BookingController`, `BookingExceptionHandler`/`SecurityConfigTest`; units 6 and 8 both append to `PlotBookingRepository` (keep both methods, one `Collection` import). Unit 8 owns the reusable overdue JPQL fragments (`BookingOverdue`); unit 9 reuses them.
- Unit 6 adds a stale-booking plot guard (do not free a plot another ACTIVE/CONFIRMED booking holds) via `PlotBookingRepository.findFirstByPlotIdAndIdNotAndStatusIn`.

**Unit 6 notes (merged 2026-10-01):**
- Cancel frees the plot only when it is `BOOKED` and no other `ACTIVE`/`CONFIRMED` booking holds it; a non-`BOOKED` plot is left as found (`; plot left <STATUS>`), and a `SOLD` plot is never freed.
- Plot-lock coverage: only `cancelReadsThePlotAfterTheLockSoAHoldersSoldStatusIsNeverOverwritten` discriminates the plot `findByIdForUpdate` (the plain `AVAILABLE` variant stays green under the mutation on H2).
- Unit 7 must rebase over unit 6's appended code in `BookingService` (after `confirmLocked`), `BookingController` (after `cancel`) and `SecurityConfigTest`. `BookingExceptionHandler` is unchanged by unit 6. Unit 8 appends to `PlotBookingRepository` (keep both methods, one `Collection` import).

## Excluded — not a unit

- **Interest / down payment / free-form payment allocation, refund accounting, post-confirm cancel/transfer, plot-swap transfers, payment gateway, notifications/reminders, finance exports** — Scope's Out-of-scope section.
- **KYC gate on confirm** (PRD §9 q1 alternative) — Open items, follow-up.
- **Standalone "schema migration" unit, "exceptions" unit, "locking" unit, "booking_event audit" unit** — layer-shaped/cross-cutting; folded into unit 1 and the units that use them.
- **Voiding a booking-linked sale** — existing void behaviour; verified as criteria in unit 4, not new work.
- **Cancel/transfer as separate failure units** — guard clauses folded into units 6/7.

## File overlap check against other approved/in-flight units (done at slice time)

Grepped all `docs/superpowers/plans/*-units.md` (cycle-management, epin, income-ledger, role-capability, sales, wallet-withdrawal) for `SaleService`, `SecurityConfig`, `PlotBooking`, `EmiInstallment`, `BookingService`, `sidebar`. Matching files are income-ledger, epin, role-capability and wallet-withdrawal, but every unit in every one of them is `merged`; there are no `pending`/`planned` units anywhere. Result: no in-flight collision. Support-tickets and announcements are not yet sliced and so are unchecked — when sliced, sequence any unit touching these files against this spec:

- `SaleService.java` / `Sale.java`: units 3, 4 (refactor + `booking_id` mapping in unit 1). Sequence 3 before 4; keep unit 3 a pure refactor so existing `recordSale`/`voidSale` tests act as the safety net.
- `SecurityConfig.java`: unit 10 (grid read falls through to `anyRequest().authenticated()`, so likely no edit) and admin write rules already cover `/api/admin/**` (Decision 12); `SecurityConfigTest` matrix extended across units 1, 2, 4, 6-9, 10.
- `BookingService` / `PlotBooking` / `EmiInstallment`: units 1, 2, 4-9 all edit these — serialise via the dependency order above (1 first), do not parallel-dispatch 2/6/7 in worktrees without rebasing.
- Admin sidebar nav: units 11 and 12 each add an entry — serialise or rebase.
