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
| 7 | Admin transfers an `ACTIVE` booking to another associate — `POST /api/admin/bookings/{id}/transfer` | backend | 1 | merged | `2026-10-01-plot-booking-unit-7-transfer-booking.md` | `4c533df..e946dc5` (merge `2a92070`) |
| 8 | Admin views a paged, filterable booking register — `GET /api/admin/bookings` | backend | 1 | merged | `2026-10-01-plot-booking-unit-8-admin-booking-register.md` | `099b955..c1f4f16` (merge `c010443`) |
| 9 | Admin views a paged overdue EMI report — `GET /api/admin/emi-reports/overdue` | backend | 1 | merged | `2026-10-01-plot-booking-unit-9-overdue-emi-report.md` | `e0420d6..a865aa5` (merge `b9cd7fb`) |
| 10 | Any authenticated user reads a project's plot grid — `GET /api/projects/{id}/plots/grid` | backend | none | merged | `2026-10-01-plot-booking-unit-10-plot-grid-read.md` | `f837e7b..5ee47f7` (merge `f02ccdf`) |
| 11 | Admin "Projects & Plots" screen — project list, colour-coded plot grid, plot create/edit, "Book" action | screen | 1, 10 | merged | `2026-10-03-plot-booking-unit-11-admin-projects-plots-screen.md` (design: `docs/design/admin_operational_screens/projects_plots/`) | `c87ac0a..7c2b78c` (merge `b0354e3`) |
| 12 | Admin "Bookings & EMI" screen — register, booking detail with Pay/Confirm/Cancel/Transfer, overdue report tab | screen | 1, 2, 4, 5, 6, 7, 8, 9 | merged (Tasks 1-8; Task 9 real-app check 2026-10-05, gaps noted in Unit 12 notes) | `2026-10-03-plot-booking-unit-12-admin-bookings-emi-screen.md` (design: `docs/design/admin_operational_screens/bookings_emi/`; Task 8 gated on unit 14) | `0091004..6f68842` (merge `afc6d7f`) + Task 8 `be6adec` |
| 13 | Associate view-only availability grid + extended Plot Bookings screen | screen | 1, 10 | merged | `2026-10-03-plot-booking-unit-13-associate-availability-bookings-screen.md` (design: `docs/design/associate_operational_screens/plot_availability_bookings/`) | `0747a09..689dec4` (merge `401af3a`) |
| 14a | Admin reads one booking — `GET /api/admin/bookings/{id}` (unit 12 overdue click-through and unit 11 banner deep link) | backend | 1 | merged | none (small slice, built inline) | `a646569` |
| 14b | Booking responses carry `plotNo`, `projectName`, `associateName`, enriched inside `BookingService.toResponse` for every endpoint, batched on paged lists | backend | 1, 8 | pending | — | — |
| 14c | OPTIONAL — distinct `code` on the plot-drift 409 body (additive), plus frontend swap from substring match | backend + small frontend | none | optional | — | — |
| 14d | OPTIONAL — `status` on `AssociateSummaryResponse` so lookups can list ACTIVE associates only | backend + small frontend | none | optional | — | — |

**Unit 14 sliced 2026-10-03 into 14a-14d** (user: 14a and 14b hard, 14c and 14d optional; acceptance criteria in section "14a-14d" below). Only 14a gates a screen (unit 12 Task 8); 14b upgrades fallback labels in units 12/13 with no frontend change beyond reading the new fields. Neither needs a plan yet; write plans when a slice is picked up.

**Unit 14 (added 2026-10-01 after screen design sign-off; superseded by the slicing above):** not in the original spec. The approved designs for units 11-13 bind to fields the merged backend lacks: unit 12's overdue-report click-through needs `GET /api/admin/bookings/{id}` (no by-id endpoint exists); units 12 and 13 need `plotNo` and `projectName` on `BookingResponse` (it carries `plotId` only); the admin register needs `associateName` (rows carry `associateId` only); unit 12's plot-drift hint currently matches the 409 text 'Plot is not available', so an optional distinct error `code` is more robust. Screens 11-13 can be built without it (fallbacks are specified in each DESIGN.md: short plot id, client-side directory lookup) but unit 12's overdue click-through is not shippable until the by-id endpoint exists. Needs its own spec addendum, plan and review like any unit; also requires a `SecurityConfig` explicit ADMIN matcher for the new GET (no blanket GET admin rule).

**Screen plans written 2026-10-03 (commit 403ae32), none built yet.** Build order 11 -> 13 -> 12 (user choice). Unit 11 builds the shared `app-plot-tile`, `shared/utils/plot-grid.util.ts`, the `--status-*-text` tokens and nav category `inventory` (not `inventory-bookings`); 13 and 12 consume them unchanged. All three plans use the live gold/oxblood tokens instead of the designs' violet/cyan (deviation, pending user veto). Unit 12 Tasks 1-7 do not depend on unit 14; Task 8 (overdue click-through and unit 11's banner deep link) needs `GET /api/admin/bookings/{id}` from unit 14, still unsliced.

**Screen design sign-off (2026-10-01):** user approved the unit 11-13 designs with violet/cyan sibling tokens (live `frontend/src/styles/_tokens.scss` is the gold/oxblood/parchment theme and differs; implementers port tokens deliberately). Each DESIGN.md carries a 'Decisions (defaults applied, pending user sign-off)' table that the user approved wholesale ('approve all'). Status-colour text needs the darker `-text` variants (sibling status colours fail 4.5:1 on white). Unit 11's design has not had its status-text contrast re-checked. Units 11 and 13 share a plot tile component (inputs plotNo, type, area, price, status, selectable). Nav group key `inventory-bookings` is shared by units 11 and 12.

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

### 14a-14d. Booking read-model follow-up (sliced 2026-10-03)

Origin: needs listed in the unit 14 note above. Not in the original spec; each slice needs a short spec addendum before its plan.

**14a. `GET /api/admin/bookings/{id}`** — Depends on: 1. Acceptance criteria:
- Returns the same `BookingResponse` shape as the register rows (installments embedded, overdue derived via `toResponse`).
- Unknown id: 404 `{"error": "Booking not found: <id>"}` (reuse `BookingNotFoundException`; handler already exists).
- `SecurityConfig` gets an explicit `GET /api/admin/bookings/*` ADMIN matcher placed before the catch-all (no blanket GET admin rule); associate token gets 403, no token 401. `SecurityConfigTest` matrix row added. The existing exact-path `GET /api/admin/bookings` matcher stays and must not shadow or be shadowed.
- Controller shape follows `AdminBookingRegisterController` (bare `@RestController`, absolute path); watch the path-collision with `BookingController`'s class-level `/api/admin/bookings` mapping (pin with a test like `getDoesNotCollideWithPostOnTheSamePath`).
- Works for ACTIVE, CONFIRMED and CANCELLED bookings.

**14b. Enriched booking responses** — Depends on: 1, 8. Acceptance criteria:
- `BookingResponse` gains `plotNo` (String), `projectName` (String), `associateName` (String). All populated by `toResponse` on every endpoint that returns it: create, pay, confirm, cancel, transfer, associate own view, admin register, and 14a.
- Paged paths (`getMyBookings`, register `list`) batch-load plots, projects and associates with `findAllById`-style queries: constant number of queries regardless of page size (pinned by a query-count or repository-interaction test), no N+1.
- Missing referent (deleted plot/associate) yields `null` for that field, never an exception.
- Existing `BookingResponse` consumers (frontend `Booking` model already has the optional fields from unit 13/12 plans) keep working; fields are additive, no existing field changes.
- No leak: associate own view exposes only the associate's own name; the unit 10 plot grid response is unchanged (it carries no booking data).
- Booking package must not gain a circular dependency: use existing repository access (`PlotRepository`, `ProjectRepository`, `AssociateRepository`) the way `BookingService` already reads plots/associates; do not import controllers or response DTOs from other packages.

**14c (optional). Distinct plot-drift error code** — Acceptance criteria: the 409 body for `PlotNotAvailableException` becomes `{"error": "...", "code": "PLOT_NOT_AVAILABLE"}` (additive; the `error` text is unchanged so current clients keep working); same exception serves booking creation (unit 11) and pay/confirm (unit 12), so the frontend keys on `code` only where it distinguishes drift; unit 12's `classifyError` replaces the `Plot is not available` substring match with a `code` check (keeping the substring as fallback for one release).

**14d (optional). Associate status in the directory** — Acceptance criteria: `AssociateSummaryResponse` gains `status`; existing consumers unaffected (additive); unit 11's Book form lookup and unit 12's Transfer lookup filter to `ACTIVE`, replacing the role-only filter; unit 11/12 plan deviations noting the role-only filter are retired.

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

**Unit 7 notes (merged 2026-10-01):**
- Transfer takes only the booking lock (never the plot), so it cannot deadlock with confirm/cancel (booking -> plot). Target must be `ACTIVE` (`InvalidTransferTargetException` -> 400, deliberately not `AssociateNotActiveException`, which `EPinExceptionHandler` maps to 409).
- Operational note: the target associate row is not locked, so a suspension landing between the status check and commit slips through (same window as `EPinService`). Target role is not restricted to `ASSOCIATE`.
- The plain "transfer waits for the lock" test is not discriminating on H2 (the unlocked UPDATE blocks anyway); the lock is proven by the holder-flips-to-`CANCELLED` variant and the transfer-vs-confirm/cancel races. The transfer-vs-pay race is a smoke test only (different tables).

**Unit 8 notes (merged 2026-10-01) — for unit 9's implementer:**
- `BookingOverdue` holds two JPQL fragments (alias contract `b`, `i`, `:today`): `INSTALLMENT_CONDITION` (PENDING and `dueDate < :today`) and `EXISTS_OVERDUE`. For unit 9's grouped count/sum/min, join `EmiInstallment i` to `PlotBooking b` and reuse `INSTALLMENT_CONDITION`. Do NOT combine it with `EXISTS_OVERDUE` in one query (both use alias `i`, so they shadow). Neither fragment includes the `ACTIVE` restriction (it lives in `PlotBookingRepository.search`), so unit 9 must add its own `b.status = ACTIVE`.
- The register's `@Query` closes a text block mid-expression and concatenates (`ACTIVE\n` + `" AND " + EXISTS_OVERDUE`); an earlier `ANDEXISTS` token bug came from that, so keep spaces explicit in any similar concatenation.
- `GET /api/admin/bookings` has an explicit ADMIN matcher in `SecurityConfig` (placed after the POST matcher). Unit 9 needs its own matcher for `GET /api/admin/emi-reports/overdue`.
- Null-UUID/enum parameter binding in the register query is proven on H2 only (same shape as `EPinRepository.search`). The register sorts `booked_at` DESC then `id` DESC; `id DESC` is only a stable tiebreak (UUID order differs between H2 and Postgres). Size is clamped to [1,100] (default 20); unknown `projectId`/`plotId`/`associateId` returns an empty page, not 404.

**Unit 9 notes (merged 2026-10-01) — for the screen units (11-13) and ops:**
- `GET /api/admin/emi-reports/overdue` returns `OverdueReportPageResponse(rows, page, size, totalElements)`; each row is `OverdueReportRow(bookingId, plotId, plotNo, associateId, associateName, buyerName, overdueCount, overdueAmount, oldestDueDate)`, sorted oldest overdue due date ASC then `booked_at` ASC then `id`. Size clamped to [1,100] (default 20). It has its own explicit ADMIN matcher in `SecurityConfig`. The register rows (unit 8) carry `associateId` + `buyerName` only (no associate name); the report rows carry `associateName` and `plotNo`.
- Before relying on units 8 and 9 in production, smoke-test their JPQL against real PostgreSQL: the register's null-UUID/enum parameter binding and the report's grouped query (entity joins, constructor expression, `COUNT(DISTINCT)`) are proven on H2 only. V41 itself also has not been run on real Postgres.
- Test-quality nits left as is: an underscore in `OverdueReportIntegrationTest` test name `paidAndVoidPastDueNeverCount_andMixedBookingCountsOnlyPending`; the `id` tiebreak alone is only probabilistically caught on H2; no HTTP-level test pins empty-page `totalElements`.
- Backend units 1-9 are complete. Unit 11 merged 2026-10-05. Remaining: units 13 and 12 (planned, build order 13 then 12) and unit 14 slices (14a, 14b hard; 14c, 14d optional; no plans yet).

**Unit 11 notes (merged 2026-10-05, merge `b0354e3`) — for units 13 and 12:**
- Built and on `master`: shared `app-plot-tile` (`shared/components/plot-tile/`, inputs plotNo/type/area/price/status/selectable/selected, output tileSelect; callers put `data-plot-id` on the host), `shared/utils/plot-grid.util.ts` (PlotGridItem, formatInr, formatLakh, formatArea, groupIntoBlocks, countByStatus), `--status-success-text`/`--status-warning-text` tokens in `_shared-components.scss`, nav category `inventory` (icon `domain`) with item `projectsPlots` at `/settings/projects-plots`, `ProjectsPlotsService` (grid, single plot, create booking, EMI config). Unit 12 appends item `bookingsEmi` (`/settings/bookings-emi`) to the same category; the unit 11 success banner already links to `/settings/bookings-emi?booking=<id>` (dead until unit 12).
- Live gold/oxblood tokens used, not the designs' violet (deviation, user veto still open). Associate lookup filters role `ASSOCIATE` because `AssociateSummaryResponse` has no status (14d would fix).
- Backend fix merged alongside (merge `dfbd437`): `PlotService.update` is `@Transactional`, reads via `PlotRepository.findByIdForUpdate`, and throws `PlotStatusLockedException` (409) when a BOOKED/SOLD plot's request status differs; omitted status keeps the current one. Found by the final review: a stale UI could flip a just-booked plot to AVAILABLE. Known gaps: no two-thread lock test for `update`; `PlotService.delete`/`get` still use the unlocked finder.
- Not exercised in the real app: CSV import, creating a plot, photo upload. Corner-tile focus ring verified on a standalone page only (outline-offset -7px); ring is clipped about 2.8px at the notch (accepted).
- Deferred minors (final review): aside lacks dialog semantics and focus-on-open; projectsError has no retry; no scroll lock behind the drawer; admin shell sidebar does not collapse at narrow widths (shell issue); form focus/aria-describedby polish.
- Dev DB rows left by verification runs: project "ZZ Task8 Verify With A Rather Long Project Name For Wrapping" (17 plots), bookings of A-1, A-4, A-8 edits. Delete if unwanted.

**Unit 10 notes (merged 2026-10-03) — frontend contract for units 11 and 13:**
- `GET /api/projects/{id}/plots/grid` (NOT under `/api/company/projects`) returns a bare JSON array of `{plotId, plotNo, type, area, price, status}`; `type` is `NORMAL`|`CORNER`, `status` is `AVAILABLE`|`BOOKED`|`SOLD`, `area` and `price` are numbers. No project name, no counts, no `rate`, no thumbnail, no booking or buyer data. Counts per status are derived client-side; unit 11 fetches `GET /api/company/projects/{projectId}/plots/{plotId}` for the rate.
- Natural order on `plotNo` ('2' before '10', 'A-2' before 'A-10'), done in Java after one query. Unpaginated (`// ponytail:` ceiling about 5,000 plots per project). Unknown project is 404; an empty project is 200 with `[]`.
- Any authenticated user can read it. No `SecurityConfig` edit was needed: `/api/projects/**` has no matcher and falls to `anyRequest().authenticated()`; only `/api/company/projects/*/thumbnail` and `/plots/csv-template` stay admin-only (pinned by a `SecurityConfigTest` row).
- Nit left as is: the leak-guard test also has brittle `doesNotContain("booking")`-style substring assertions next to the exact key-set check.

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

**Unit 13 notes (merged 2026-10-05):** `/plot-bookings` is now lazy-loaded (`loadComponent`) because the initial bundle hit the 1MB error budget; guards unchanged. `PlotBookingsService.listPlots` removed. Unit 14b upgrade: once `BookingResponse` carries `plotNo`/`projectName`, `plotLabel()` and the detail project line light up with no frontend change. Deferred minors: `aria-modal` on the mobile popover, `role="alert"` on shared `InlineBannerComponent`, project choice resets on tab return, double-click same-page pager sends two requests. Not checked in a real browser: narrow-width sheet/stacked layout (window resize does not change the viewport), admin redirect, overdue badge, cancelled card. Dev DB now holds associate VSA00001 and a VP00001 booking (plot A-2, "ZZ Task8 Verify..." project).

**Unit 12 notes (Tasks 1-7 merged 2026-10-05):** `/settings/bookings-emi` is lazy-loaded; unit-12 styles live in three lazy component scss files (ViewEncapsulation.None) because global `_admin.scss` tripped the 1MB initial-bundle error budget (angular.json untouched; two anyComponentStyle warnings remain: seal 3.34kB, host 2.7kB). **Task 8 not built**: needs unit 14a `GET /api/admin/bookings/{id}`; overdue rows are deliberately non-interactive and `openFromOverdue` is a no-op stub; `BookingsEmiService.get` exists but no non-test code calls it; the register's `focusBookingId` is an inert stub (unit 11's `?booking=` banner link does nothing yet). Rulings that differ from the plan/DESIGN: auto-confirm warning ignores `emiEnabled` (backend `thresholdReached` ignores it); money uses a 2-decimal local formatter (`formatMoney`) not shared `formatInr`; plot-drift link goes to `/settings/payments-kyc` not compensation. Deferred minors: tab switch during a write drops the flash; netUnknown→PAID reload closes silently; empty last page after a write shows no pager; shared TabBar lacks trackBy; hi.json screen copy is English. Not browser-verified: real Pay/Confirm/Cancel/Transfer submits, 1000/600px, overdue rows, auto-confirm warning. Suspected intermittent flake: unit 13 MyBookings 'moves focus to Back' spec under concurrent Chrome load.

**Unit 12 Task 9 real-app check (2026-10-05, 1440px, dev DB):** verified Pay (empty-reference validation, then paid), Confirm (status Confirmed, actions disabled with reason), Cancel (empty-reason validation, pending count, Cancelled + Void row), Transfer (flash, associate updated; the current owner is excluded from the lookup so the same-associate error is unreachable from the UI), Overdue tab (backdated a due date in the DB), overdue click-through, `?booking=<id>` deep link, 404 banner, sidebar entries. NOT verified: AUTO_THRESHOLD warning and auto-confirm (rule is MANUAL in dev DB), 1000/600px (the Chrome MCP viewport follows the window only in a freshly created tab). Visual issues seen: register table clips the DUE column at 1440px (the list pane scrolls/clips); the overdue pill in the status cell wraps and overlaps; overdue-report buyer button is indented against the plot line; stale success flash persists across tab switches. Dev DB now: Unit13 booking CONFIRMED (plot sold, sale created), ZZ Fix booking CANCELLED, Task8 booking transferred to VP00001 with a backdated overdue instalment.
