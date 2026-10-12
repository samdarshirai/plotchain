# Plan: close Plot & Booking gaps vs reference video (styled per DESIGN.md)

## Context
`docs/design/plot-booking-vs-reference-video.md` lists 25 differences between the reference system (video) and Plotchain. Owner decisions: **no PLC, no Plot Transfer**; implement all four groups: (1) 2-step payments with bulk confirm, (2) Discount + list columns/filters/export, (3) new views (Cancelled, EMI by last date, Search, Add EMI), (4) associate UI defects #21-24. Confirmed answers: payments entered by **admin/staff only** (all writes stay ADMIN, no new associate write endpoint); **only confirmed payments count** toward Paid/Due/AUTO_THRESHOLD/EMI report.
All new UI follows `/DESIGN.md` (below). Execute as TDD units via the repo's spec-cycle flow.

## Design rules (DESIGN.md) applied to every new screen
- Parchment content, Ink only in shell; Warm Charcoal text; tokens only (`--brand-primary` gold, `--brand-secondary` oxblood, `--surface-*`, `--border-subtle`, `--status-success/warning/danger`) — no hex literals.
- Primary buttons = `.brand-button` (Oxblood bg, Bright Gold text). Danger/error = `--status-danger`, never Oxblood. Bulk "Confirm selected" is primary; "Uncheck all" ghost.
- Fraunces only for page title + the one hero figure. Section headers = flanking-rule small caps (`── UNCONFIRMED ──`). Amounts/dates/IDs in mono tabular-nums (`--font-mono`).
- **One Seal Card per screen**: Unconfirmed tab → total pending ₹ (use `shared/components/seal-card` or the double-hairline `box-shadow` pattern in `booking-seal.component.scss`); other tabs none. No extra shadows beyond 1px border, no gradients/animation. Material Symbols Outlined icons only.
- Per-screen BEM prefix + lazy component SCSS with `ViewEncapsulation.None` (collision lesson; `_admin.scss` is at bundle budget — do NOT grow it): `.payment-queue`, `.payment-ledger`, `.cancelled-bookings`, `.last-emi`, `.team-bookings`, `.my-sales`. Reuse register table look (mono uppercase headers, `border-top` cells, `data-label` stacked mobile <768px).

## Backend

### U1 — Migration V45 + entities (`backend/src/main/resources/db/migration`, next free = V45)
- `emi_installment`: widen `chk_emi_installment_status` to `PENDING,ENTERED,PAID,VOID` (named: DROP+ADD). `PAID` = confirmed (keeps all existing readers valid). Add `confirmed_at TIMESTAMP`, `confirmed_by UUID FK associate`, `payment_mode VARCHAR(24)` (CASH/CHEQUE/UPI/BANK_TRANSFER/OTHER, CHECK). Backfill existing PAID: `confirmed_at=paid_at, confirmed_by=recorded_by`. `recorded_by`/`paid_at` = entry-by / entry date.
- `booking_event`: widen `chk_booking_event_type` to add `PAY_CONFIRMED` (13 chars, fits VARCHAR(16)).
- `plot_booking`: add snapshot columns `list_price`, `discount NUMERIC DEFAULT 0 CHECK (discount>=0)`, `area_sqft`, `rate`; backfill from `plot` join (`list_price=total_amount`, `area_sqft`, `rate` from plot). `total_amount` stays = list_price − discount.
- Update `EmiInstallment`, `InstallmentStatus`, `PlotBooking`, `BookingEventType`, `PaymentMode` enum. **Lesson:** enum + DB CHECK widened in same unit, proven by real-DB test (copy `PlotBookingSchemaTest` invalid-value tests + `V41MigrationTest` backfill shape at `target("44")→"45"`). Run once against real Postgres (docker `plotchain-db-1`, 5434) — H2-only today.

### U2 — Two-step payment logic (`booking/BookingService.java`)
- `recordPayment` (L130): installment PENDING→**ENTERED** (sets paidAt, paymentRef, paymentMode, recordedBy), keep exact-amount check (partial/free-form allocation stays out of scope per lifecycle spec — flagged), write `PAID` event (= entry). **No** `afterInstallmentPaid` here.
- New `confirmPayment(bookingId, n, actorId)`: lock booking→(plot in confirmLocked) order preserved; requires booking ACTIVE + installment ENTERED; →PAID, confirmedAt/By; `PAY_CONFIRMED` event; then `afterInstallmentPaid` (threshold auto-confirm unchanged).
- New `confirmPayments(List<PaymentRef>, actorId)`: bulk, **all-or-nothing in one tx**, items sorted by bookingId (deadlock-safe), 409 naming the first offending item.
- `thresholdReached`/`toResponses`/`sumByStatus` keep summing `PAID` only (= confirmed). Token installment created `PAID` + confirmedAt at booking. `cancelBooking`: ENTERED installments → VOID with note "N unconfirmed payments voided" (else they'd be stuck). `findEmiReport` stays `PAID` by `paidAt`. Overdue (`BookingOverdue` + `toResponses`) unchanged: PENDING only.
- Endpoints: `POST /api/admin/payments/confirm` (bulk, body `{items:[{bookingId,installmentNumber}]}`), `POST /api/admin/bookings/{id}/installments/{n}/confirm` (single; Pay button in `booking-seal` becomes "Enter payment", ENTERED row shows "Confirm").
- Tests: Mockito service tests; real-DB `BookingPaymentIntegrationTest` updated; new threshold test (entered doesn't count, confirm triggers auto-confirm); bulk rollback test; concurrency test; cancel-with-ENTERED test.

### U3 — Discount, filters, lists (`booking/*Controller`, `PlotBookingRepository`)
- `CreateBookingRequest` + optional `discount` (≥0, < price); `total = price − discount`; token < total; snapshot list_price/area/rate. `BookingResponse` + `buyerPhone, listPrice, discount, areaSqft, rate, cancelledAt, associateCode`.
- `GET /api/admin/bookings` (+`AdminBookingRegisterController`, `BookingRegisterService`): add `bookedFrom/bookedTo`, `cancelledFrom/cancelledTo` (UTC days), `q` (case-insensitive contains on associate login ID or plot no). Extend JPQL `search` null-safe pattern (mind text-block spacing trap).
- New `GET /api/admin/payments?status=ENTERED|PAID&from&to&projectId&page&size` (rows: payment date, associate id/name, project, plot, amount, mode, entry-by, confirm-by/at; response also `pageTotal` + `grandTotal`).
- New `GET /api/admin/emi-reports/last-emi?from&to&projectId` (bookings whose last instalment due date in range; `MAX(due_date)` JPQL; show total/paid/rest/discount).
- `SecurityConfig` (`auth/SecurityConfig.java` ~L236-250): each new admin GET needs its own `.hasAuthority("ADMIN")` matcher (`/x` ≠ `/x/*`).
- Fix `AssociateBookingController.getMyBookings` `size=0` clamp bug. `SalesHistory` response: add associate login ID + name (fixes UUID in My Sales).
- Tests: `AdminBookingRegisterControllerTest` pattern (MockMvc, `tokenFor`), repository `@DataJpaTest` for filters.

### U4 — Add Plot EMI (reschedule) — smallest, last, optional
`POST /api/admin/bookings/{id}/reschedule {installmentCount}`: ACTIVE only; keeps PAID/ENTERED, re-splits remaining balance over new PENDING installments (reuse `computeSchedule` rounding, last absorbs remainder). **Assumption:** reference "Add Plot EMI" = adjust/define the instalment plan; confirm wording with owner before building.

## Frontend (`frontend/src/app`, Angular 18 standalone, Karma/Jasmine)

### U5 — Foundations
- New `shared/components/pager` (none exists; each screen hand-rolls) and `shared/utils/table-export.util.ts`: `exportCsv(rows, columns, filename)` via Blob + `<a download>` (no new dependency; "Excel" = CSV) and `printTable()` using a print-only stylesheet. Export fetches all pages (size=100 loop). Specs for both.
- Models/services: extend `bookings-emi.model.ts`, `associate-booking-page.model.ts` (`ENTERED`, `PaymentMode`, new fields), `bookings-emi.service.ts` (`payments()`, `confirmPayments()`, `confirmPayment()`, `cancelled()`, `lastEmi()`). i18n keys in **both** `en.json` + `hi.json` under `admin.bookingsEmi.*`, `plotBookings.*`, `salesHistory.*`.

### U6 — Bookings & EMI tabs (`admin/admin-bookings-emi/`, lazy)
Tabs via `app-tab-bar`: **Register · Unconfirmed · Confirmed · Overdue · Cancelled · EMI by last date**.
- Register (`booking-register`): add columns Mobile, Area, Rate, Discount; filters booked-from/to (native `<input type="date">`), `q` search box ("Associate ID or Plot No", typed), existing selects; Export CSV / Print buttons.
- Unconfirmed (`payment-queue`): seal card = total pending; filters date range + project; table with checkboxes, Total row, **Check All / Uncheck All / Confirm selected** (+ confirm-dialog inline, not `confirm()`), success/err `inline-banner`; locks during write (existing `locked` pattern).
- Confirmed (`payment-ledger`): Entry By, Confirm By, Confirm Date, Print (`payment-receipt` component, `@media print`, seal-style double rule).
- Cancelled (`cancelled-bookings`): reuse register endpoint with `status=CANCELLED` + cancel-date range; columns per reference minus PLC.
- EMI by last date (`last-emi`): date range + project.
- `booking-seal`: "Pay"→"Enter payment" (+ payment mode select), ENTERED row → "Confirm" button, status chip for ENTERED uses `--status-warning`.
- Update specs; `admin-nav-categories.model.spec.ts` unaffected (tabs, not nav items).

### U7 — Plots & discount UI (`projects-plots.component.ts`)
- Table view (admin only, not `readOnly`): add Rate column, client-side search, CSV export (needs plots endpoint with rate — grid payload deliberately omits it; do not leak rate to associates).
- Book-plot form: optional Discount field, live total = price − discount, token validation.

### U8 — Associate defects (#21-24)
- `readOnly` empty state: associate-appropriate copy ("No plots listed for this project yet") not admin wording (#21).
- `sales-history`: show associate ID/name (U3), `formatInr`/currency pipe for amounts (#22); prefix `.my-sales`.
- `team-plot-bookings`: replace inline plain table with register-look SCSS under `.team-bookings` + shared pager; route existing `my-bookings.component` as `/plot-bookings/mine` + associate nav item "My Bookings" (update `app.routes.spec.ts`, `associate-nav-items` + sidebar specs) (#23).
- Project dropdown "Select project" placeholder in associate View Plot (#24).

## Execution notes (from memory lessons)
Commit plan/unit docs to master **before** dispatching worktree agents; coordinator (not implementers) updates the units tracking file; avoid `cd` into worktrees leaking cwd. Order: U1→U2→U3 (backend), U5→U6→U7, U8 independent, U4 last. Backend `mvn test` shows ~55 spurious Mockito/JDK errors — diff against master baseline.

## Verification
- Backend: `cd backend && mvn test -Dtest=<new/changed classes comma-separated>`; real-DB tests for CHECK widening + V45 backfill; one smoke on Postgres 5434.
- Frontend: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless`; `npx ng build` (watch 1MB budget).
- Live: start DB/backend/frontend (run skill; use port 4201 since 4200 is TriageDesk), log in `admin` and `VP00001`: enter payment on ACTIVE booking → Paid unchanged, appears in Unconfirmed → bulk confirm → Paid/Due update, AUTO_THRESHOLD booking confirms, Confirmed tab + receipt print; create booking with discount → total correct; cancel booking with ENTERED payment; Cancelled and EMI-by-last-date tabs; CSV export opens in Excel; associate pages (My Sales name/formatting, Team pages styling, My Bookings route). Screenshot new screens against DESIGN.md (one seal card, tokens only).
