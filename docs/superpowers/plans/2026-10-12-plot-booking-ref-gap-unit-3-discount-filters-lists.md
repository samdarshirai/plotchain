# Plot-Booking Reference-Gap Unit 3: Discount, Filters, Lists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backend for booking discount, richer booking responses, register date/search filters, an admin payments list (unconfirmed queue + confirmed ledger), a "EMI by last date" report, and two small defect fixes.

**Architecture:** Extend the merged `com.plotchain.booking` package. Discount lives in `BookingService.createBooking` (snapshot columns already exist from V45). Register filters extend the existing null-safe JPQL `PlotBookingRepository.search` and flow controller -> `BookingRegisterService`. Two new read-only endpoints each get a small service + JPQL constructor-expression query + record row (payments on `AdminPaymentController`, last-EMI on `AdminEmiReportController`), plus one exact-path `.hasAuthority("ADMIN")` matcher each in `SecurityConfig`. No migration, no entity change.

**Tech Stack:** Spring Boot 3 / Java 21, Spring Data JPA (Hibernate 6, JPQL), Spring Security, JUnit 5, Mockito (strict stubs), MockMvc, `@SpringBootTest @Transactional` real-DB (H2 + Flyway) tests.

**Spec:** `docs/superpowers/plans/2026-10-12-plot-booking-reference-gap-plan.md` (section U3; U1 = V45 migration, U2 = two-step payments, both merged). Gap analysis: `docs/design/plot-booking-vs-reference-video.md` (rows 7, 10, 11, 15, 18). Prior-unit plan for style: `docs/superpowers/plans/2026-10-12-plot-booking-ref-gap-unit-2-two-step-payments.md`.

## Global Constraints

- Backend only. No migration (V45 already added `list_price`, `discount`, `area_sqft`, `rate` on `plot_booking`; `confirmed_at/by`, `payment_mode` on `emi_installment`). No frontend, no `*-units.md`, no `spec-cycle-status.md` edits (the coordinator owns tracking files).
- Money semantics from U2 stay: only `PAID` installments count as Paid; `ENTERED` is received-but-unconfirmed, still Due, and NOT overdue (`BookingOverdue` is `PENDING` only, do not touch it).
- All new endpoints ADMIN-only. `SecurityConfig` has no blanket `GET /api/admin/**` rule: each new admin GET needs its OWN exact-path `.requestMatchers(HttpMethod.GET, "<path>").hasAuthority("ADMIN")` placed next to the existing booking/emi-report GET matchers (around `SecurityConfig.java:236-250`), before `anyRequest()`. `/x` does not match `/x/*`.
- Dates in filters are inclusive UTC calendar days (`LocalDate` in, converted to half-open `[from 00:00Z, to+1 00:00Z)` `Instant`s). `from > to` is a 400 (`ResponseStatusException`, same as `AssociateBookingController.checkRange`).
- Paging convention used by the admin controllers: `page = Math.max(page, 0)`, `size = Math.min(Math.max(size, 1), 100)`, defaults `page=0`, `size=20`.
- Bulk confirm (U2) returns `BookingResponse[]` ordered by ascending bookingId and the entered-event type is still `PAID`: leave both alone.
- JPQL null-safety: UUID/enum/boolean params use the existing `(:x IS NULL OR ...)` shape. `Instant`/`String` params are NEVER bound as null (Postgres cannot infer a null parameter's type): the service passes open-ended sentinels (`Instant.EPOCH`, `9999-01-01`) and `""` for "no filter".
- Text-block trap in `PlotBookingRepository.search`: the first text block ends mid-clause and is concatenated (`+ " AND " + BookingOverdue.EXISTS_OVERDUE + "))"`). New predicate lines MUST go inside the first text block, ABOVE the `:overdueOnly` line, each starting on its own line. Never append text after the concatenation, and never leave a clause glued to the previous one without whitespace.
- Backend test env: do NOT run the full suite (about 55 spurious Mockito errors from a JDK21/25 mismatch, plus a baseline of 4 failures + 5 errors on master). Run only named classes from `/Users/ronalisenapati/Ronali/plotchain/backend`: `mvn -q test -Dtest=<Class1>,<Class2>`. If you work in a worktree, do not `cd` into it from a shared shell; use absolute paths.
- Implementers must not edit `docs/superpowers/plans/*-units.md` or any tracking file. Commit only code and tests.
- No `System.out`, no emojis, no new dependencies.

## Review Focus

1. Discount equal to or above the list price (total would be 0 or negative) must be a 400, plot stays AVAILABLE (Task 1 test).
2. Token must be checked against the DISCOUNTED total, not the list price (Task 1 test).
3. `q` of blank, mixed case, padded, or containing `%`/`_` must not 500 or return the whole table by accident when non-blank (Task 3 tests: blank = no filter, case-insensitive, trimmed). Known ceiling: `%`/`_` act as LIKE wildcards (not escaped).
4. Date boundary: a booking at 23:59:59Z on the `to` day is included, 00:00:00Z the day after is excluded (Task 3 repo + service tests).
5. Cancelled-date filter must not hide non-cancelled bookings when it is not supplied (their `cancelled_at` is NULL) (Task 3 repo test).
6. Payments list must keep rows whose `recorded_by`/`payment_mode` are NULL (token installments, legacy PAID rows): LEFT JOINs, not inner (Task 4 repo test).
7. Last-EMI "Paid" must not count `ENTERED` or `VOID`; "Rest" = total - paid (so ENTERED sits in Rest) (Task 5 test).
8. `size=0` on associate list endpoints must be clamped, not a 500 from `PageRequest.of` (Task 6 tests).
9. Team-bookings response must not expose `buyerPhone` or `rate` to the upline associate (Task 2 test; see Open Questions).

## Open Questions (defaults chosen, flag to owner)

- Payments list date filter applies to `paidAt` (payment date) for BOTH ENTERED and PAID. A "by confirm date" variant for the ledger is not built.
- `buyerPhone` and `rate` are stripped from `GET /api/associates/me/team-bookings` rows (downline privacy; the master plan says rates must not leak to associates). Own-bookings and admin responses carry them. Reverse if U8 wants a Mobile column on the team view.
- `GET /api/admin/emi-reports/last-emi` is a plain list (not paged), CANCELLED bookings excluded, "Mobile" = buyer phone.
- `SalesHistory` item (7): `SaleResponse` already carries `associateUserId` (login ID) and `associateName` for `GET /api/associates/me/sales` (set in `SaleService.toResponses`, pinned by `SaleServiceTest` ~line 1077). The My Sales UUID defect is purely frontend (`sales-history.component.ts` binds `associateId`); no backend change in this unit, handled in U8.

---

## File Structure

- Modify `backend/src/main/java/com/plotchain/booking/CreateBookingRequest.java`: optional `discount`.
- Create `backend/src/main/java/com/plotchain/booking/InvalidDiscountException.java`; modify `BookingExceptionHandler.java` (400), `InvalidTokenAmountException.java` (message wording).
- Modify `backend/src/main/java/com/plotchain/booking/BookingService.java`: discount math, response mapping, team strip, promote `fromInstant/toInstant` to package-private.
- Modify `backend/src/main/java/com/plotchain/booking/BookingResponse.java`: 7 new fields + `withoutBuyerPhoneAndRate()`.
- Modify `PlotBookingRepository.java` (`search`), `BookingRegisterService.java` (`list`), `AdminBookingRegisterController.java`.
- Create `PaymentRow.java`, `PaymentPageResponse.java`, `PaymentLedgerService.java`; modify `EmiInstallmentRepository.java`, `AdminPaymentController.java`.
- Create `LastEmiHead.java`, `LastEmiRow.java`, `LastEmiReportService.java`; modify `PlotBookingRepository.java` (`findLastEmiHeads`), `AdminEmiReportController.java`.
- Modify `backend/src/main/java/com/plotchain/auth/SecurityConfig.java` (2 matchers).
- Modify `AssociateBookingController.java` and `backend/src/main/java/com/plotchain/sales/AssociateSaleController.java` (size clamp).
- Tests (all under `backend/src/test/java/com/plotchain/`): modify `booking/BookingServiceTest.java`, `booking/BookingControllerTest.java`, `booking/BookingExceptionHandlerTest.java`, `booking/BookingPaymentIntegrationTest.java`, `booking/AdminBookingRegisterControllerTest.java`, `booking/BookingRegisterServiceTest.java`, `booking/PlotBookingRegisterRepositoryTest.java`, `booking/AdminEmiReportControllerTest.java`, `booking/AssociateBookingControllerTest.java`, `sales/AssociateSaleControllerTest.java`, `auth/SecurityConfigTest.java`; create `booking/PaymentLedgerRepositoryTest.java`, `booking/PaymentLedgerServiceTest.java`, `booking/AdminPaymentControllerTest.java`, `booking/LastEmiRepositoryTest.java`, `booking/LastEmiReportServiceTest.java`.

---

### Task 1: Discount on createBooking

**Files:**
- Modify: `backend/src/main/java/com/plotchain/booking/CreateBookingRequest.java`
- Create: `backend/src/main/java/com/plotchain/booking/InvalidDiscountException.java`
- Modify: `BookingExceptionHandler.java`, `InvalidTokenAmountException.java`, `BookingService.java` (`createBooking`, ~L74-130)
- Test: `BookingServiceTest.java`, `BookingControllerTest.java`, `BookingExceptionHandlerTest.java`, `BookingPaymentIntegrationTest.java`

**Interfaces:**
- Consumes: `Plot.getPrice()/getAreaSqft()/getRate()`; `PlotBooking.setListPrice/setDiscount/setTotalAmount` (exist).
- Produces: `CreateBookingRequest(UUID plotId, UUID associateId, String buyerName, String buyerPhone, BigDecimal tokenAmount, BigDecimal discount)` plus a retained 5-arg convenience constructor (discount = null) so the ~5 existing `new CreateBookingRequest(...)` call sites in tests (e.g. `SecurityConfigTest`, `BookingServiceTest.requestFor`) keep compiling. `InvalidDiscountException(BigDecimal discount, BigDecimal price)` mapped to HTTP 400.

- [ ] **Step 1: Write failing service tests** in `BookingServiceTest.java`. Mirror the stubbing of the existing `createBookingRejectsATokenEqualToOrAboveThePlotPriceAndDoesNotBookThePlot` (~L173) for rejection tests (strict stubs: stub only what the rejected path touches, e.g. plot + associate lookups, NOT the emi config), and `stubHappyPathGuardsAndDependencies("600000.00", emiConfig(true, 4))` for the happy path. Add a 6-arg helper `requestWithDiscount(String token, String discount)` that calls the new canonical constructor.

```java
@Test
void createBookingWithDiscountStoresListPriceDiscountAndReducedTotalAndSplitsTheReducedBalance() {
    stubHappyPathGuardsAndDependencies("600000.00", emiConfig(true, 4));

    BookingResponse response = bookingService.createBooking(requestWithDiscount("100000", "100000"));

    ArgumentCaptor<PlotBooking> bc = ArgumentCaptor.forClass(PlotBooking.class);
    verify(plotBookingRepository).save(bc.capture());
    PlotBooking b = bc.getValue();
    assertThat(b.getListPrice()).isEqualByComparingTo("600000.00");
    assertThat(b.getDiscount()).isEqualByComparingTo("100000.00");
    assertThat(b.getTotalAmount()).isEqualByComparingTo("500000.00");
    // token 100000 + balance 400000 over 3 installments: 133333.33 + 133333.33 + 133333.34
    assertThat(response.installments()).extracting(EmiInstallmentResponse::amount)
        .usingComparatorForType(BigDecimal::compareTo, BigDecimal.class)
        .containsExactly(new BigDecimal("100000"), new BigDecimal("133333.33"),
            new BigDecimal("133333.33"), new BigDecimal("133333.34"));
    assertThat(response.totalAmount()).isEqualByComparingTo("500000.00");
}

@Test
void createBookingRejectsADiscountEqualToOrAboveThePlotPriceAndDoesNotBookThePlot() {
    // stub plot (price 600000, AVAILABLE) + associate exactly like the token-rejection test above
    assertThatThrownBy(() -> bookingService.createBooking(requestWithDiscount("1000", "600000")))
        .isInstanceOf(InvalidDiscountException.class);
    assertThatThrownBy(() -> bookingService.createBooking(requestWithDiscount("1000", "700000")))
        .isInstanceOf(InvalidDiscountException.class);
    verify(plotRepository, never()).save(any());
    verify(plotBookingRepository, never()).save(any());
}

@Test
void createBookingChecksTheTokenAgainstTheDiscountedTotalNotTheListPrice() {
    // price 600000, discount 500000 => total 100000; token 100000 is NOT below total => 400
    // same stubbing as the rejection test above
    assertThatThrownBy(() -> bookingService.createBooking(requestWithDiscount("100000", "500000")))
        .isInstanceOf(InvalidTokenAmountException.class);
    verify(plotBookingRepository, never()).save(any());
}

@Test
void createBookingWithNullDiscountKeepsTotalEqualToListPriceAndDiscountZero() {
    stubHappyPathGuardsAndDependencies("600000.00", emiConfig(true, 4));
    bookingService.createBooking(requestFor(PLOT_ID, ASSOCIATE_ID, "100000")); // 5-arg => null discount
    ArgumentCaptor<PlotBooking> bc = ArgumentCaptor.forClass(PlotBooking.class);
    verify(plotBookingRepository).save(bc.capture());
    assertThat(bc.getValue().getDiscount()).isEqualByComparingTo("0");
    assertThat(bc.getValue().getTotalAmount()).isEqualByComparingTo("600000.00");
}
```

- [ ] **Step 2: Run to verify they fail** (compile error: 6-arg constructor missing).

Run: `cd /Users/ronalisenapati/Ronali/plotchain/backend && mvn -q test -Dtest=BookingServiceTest`
Expected: compilation FAIL.

- [ ] **Step 3: Implement.**

`CreateBookingRequest.java` (keep the existing explanatory comment, extend it to mention discount):

```java
public record CreateBookingRequest(
    @NotNull UUID plotId,
    @NotNull UUID associateId,
    @NotBlank @Size(max = 200) String buyerName,
    @Size(max = 20) String buyerPhone,
    @NotNull @Positive BigDecimal tokenAmount,
    @PositiveOrZero BigDecimal discount   // optional; null = 0. Upper bound (< price) needs the plot, so BookingService checks it.
) {
    public CreateBookingRequest(UUID plotId, UUID associateId, String buyerName, String buyerPhone, BigDecimal tokenAmount) {
        this(plotId, associateId, buyerName, buyerPhone, tokenAmount, null);
    }
}
```
(import `jakarta.validation.constraints.PositiveOrZero`.)

`InvalidDiscountException.java`:

```java
package com.plotchain.booking;

import java.math.BigDecimal;

// Discount must be 0 or more and strictly below the plot list price. Mapped to 400 in BookingExceptionHandler.
public class InvalidDiscountException extends RuntimeException {
    public InvalidDiscountException(BigDecimal discount, BigDecimal price) {
        super("Discount " + discount.toPlainString() + " must be 0 or more and below the plot price " + price.toPlainString());
    }
}
```

`BookingExceptionHandler`: add a handler identical in shape to `handleInvalidTokenAmount` returning 400 for `InvalidDiscountException`.

`InvalidTokenAmountException`: change the message tail from "below the plot price" to "below the payable total" (the second argument is now the discounted total). First `grep -rn "below the plot price" backend/src/test` and update any test asserting the old wording.

`BookingService.createBooking`: replace the token check block with:

```java
BigDecimal listPrice = plot.getPrice();
BigDecimal discount = request.discount() == null ? BigDecimal.ZERO
    : request.discount().setScale(2, RoundingMode.HALF_UP);
if (discount.signum() < 0 || discount.compareTo(listPrice) >= 0) {
    throw new InvalidDiscountException(discount, listPrice);
}
BigDecimal total = listPrice.subtract(discount);
BigDecimal token = request.tokenAmount();
if (token.compareTo(total) >= 0) {
    throw new InvalidTokenAmountException(token, total);
}
```
Both checks stay BEFORE `plot.setStatus(BOOKED)`. Then: `computeSchedule(total, token, config, bookedAt, associate.getId())`, `booking.setTotalAmount(total)`, `booking.setListPrice(listPrice)`, `booking.setDiscount(discount)` (remove the hard-coded `BigDecimal.ZERO`).

- [ ] **Step 4: Run service tests, expect PASS.**

Run: `mvn -q test -Dtest=BookingServiceTest`

- [ ] **Step 5: Controller + handler + real-DB tests.**
  - `BookingControllerTest`: `postWithoutDiscountFieldStillBindsAndForwardsNullDiscount` (JSON body of the old 5 fields => 201/200 as the existing happy test; `verify(bookingService).createBooking(argThat(r -> r.discount() == null))`), `postWithDiscountIsForwardedToTheService` (`"discount": 25000`), `postWithNegativeDiscountIs400` (`"discount": -1`). Follow the file's existing `tokenFor`/MockMvc pattern.
  - `BookingExceptionHandlerTest`: `invalidDiscountMapsTo400WithMessage`, copy the existing `InvalidTokenAmountException` test.
  - `BookingPaymentIntegrationTest` (real DB): `discountedBookingPersistsSnapshotAndTotalAndAutoConfirmUsesTheDiscountedTotal`. Reuse that class's existing setup to create a booking via the real `BookingService.createBooking` with `discount`, reload via `PlotBookingRepository.findById`, assert `listPrice`, `discount`, `totalAmount = listPrice - discount`, and that the sum of the persisted installment amounts equals `totalAmount`.

Run: `mvn -q test -Dtest=BookingControllerTest,BookingExceptionHandlerTest,BookingPaymentIntegrationTest,BookingServiceTest,SecurityConfigTest`
Expected: PASS (SecurityConfigTest proves the retained 5-arg constructor).

- [ ] **Step 6: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/main/java/com/plotchain/booking backend/src/test/java/com/plotchain/booking
git commit -m "feat(booking): optional discount on create, total = list price - discount (U3)"
```
(add the Co-Authored-By trailer required by the session's attribution reminder to every commit.)

---

### Task 2: BookingResponse new fields

**Files:**
- Modify: `backend/src/main/java/com/plotchain/booking/BookingResponse.java`, `BookingService.java` (`toResponses`, `getTeamBookings`)
- Test: `BookingServiceTest.java`, `AdminBookingRegisterControllerTest.java`

**Interfaces:**
- Consumes: `PlotBooking` getters `getBuyerPhone/getListPrice/getDiscount/getAreaSqft/getRate/getCancelledAt`; `Associate.getUserId()` (the login ID, e.g. "VP00001").
- Produces: canonical `BookingResponse(UUID id, UUID plotId, UUID associateId, BookingStatus status, String buyerName, BigDecimal totalAmount, int installmentCount, Instant bookedAt, BigDecimal paidAmount, BigDecimal dueAmount, List<EmiInstallmentResponse> installments, String plotNo, String projectName, String associateName, String buyerPhone, BigDecimal listPrice, BigDecimal discount, BigDecimal areaSqft, BigDecimal rate, Instant cancelledAt, String associateCode)`; the existing 11-arg and 14-arg constructors are KEPT, delegating with `null` for new fields (about 10 call sites in tests use them; do not churn them). New method `BookingResponse withoutBuyerPhoneAndRate()`.

- [ ] **Step 1: Failing tests** in `BookingServiceTest` (copy the setup of `getMyBookingsComputesPaidAndDueAmountsAndExposesStatusAndBuyer`, ~L125, then add `setBuyerPhone("9999999999")`, `setListPrice`, `setDiscount`, `setAreaSqft`, `setRate`, `setCancelledAt` on the stub booking and `setUserId("VP00042")` on the stub associate):
  - `getMyBookingsExposesBuyerPhonePriceSnapshotDiscountCancelledAtAndAssociateCode`: assert each new field on `page.bookings().get(0)`.
  - `getTeamBookingsBlanksBuyerPhoneAndRateButKeepsDiscountAndAssociateCode`: stub `plotBookingRepository.findByDownline(...)`; assert `buyerPhone()` and `rate()` are null, `discount()` and `associateCode()` populated.
  - `adminGetBookingStillExposesBuyerPhoneAndRate` (`getBooking(id)` path unstripped).

  In `AdminBookingRegisterControllerTest` add `listSerialisesTheNewFields`: stub `registerService.list(...)` (use `any()` matchers; its signature changes in Task 3, so write this test AFTER Task 3 compiles, or use `Mockito.any()` for all args with the then-current signature) returning a row built with the 21-arg constructor; assert `$.bookings[0].buyerPhone`, `.listPrice`, `.discount`, `.areaSqft`, `.rate`, `.associateCode` values and `.cancelledAt` null-safe (`value(nullValue())`).

- [ ] **Step 2: Run to verify failure.** `mvn -q test -Dtest=BookingServiceTest` -> compile FAIL or assertion FAIL.

- [ ] **Step 3: Implement.**
  - `BookingResponse`: add the 7 components at the END of the record; keep both legacy constructors, the 14-arg one delegating `this(..., null, null, null, null, null, null, null)`; the 11-arg one keeps delegating to the 14-arg. Add:

```java
// Team (upline) view must not carry the buyer's phone or the plot rate.
public BookingResponse withoutBuyerPhoneAndRate() {
    return new BookingResponse(id, plotId, associateId, status, buyerName, totalAmount, installmentCount, bookedAt,
        paidAmount, dueAmount, installments, plotNo, projectName, associateName,
        null, listPrice, discount, areaSqft, null, cancelledAt, associateCode);
}
```
  - `BookingService.toResponses`: pass `booking.getBuyerPhone(), booking.getListPrice(), booking.getDiscount(), booking.getAreaSqft(), booking.getRate(), booking.getCancelledAt(), associate == null ? null : associate.getUserId()` to the canonical constructor.
  - `BookingService.getTeamBookings`: map `bookings` through `BookingResponse::withoutBuyerPhoneAndRate` before building `AssociateBookingPageResponse`.

- [ ] **Step 4: Run.** `mvn -q test -Dtest=BookingServiceTest,AdminBookingRegisterControllerTest,AssociateBookingControllerTest,BookingRegisterServiceTest,BookingControllerTest` -> PASS (legacy constructors keep other tests compiling).

- [ ] **Step 5: Commit** `git add backend/src/main/java/com/plotchain/booking backend/src/test/java/com/plotchain/booking && git commit -m "feat(booking): buyerPhone, price snapshot, discount, cancelledAt, associateCode on BookingResponse (U3)"`

---

### Task 3: Register filters (booked/cancelled dates, q search)

**Files:**
- Modify: `PlotBookingRepository.java` (`search`), `BookingRegisterService.java` (`list`), `AdminBookingRegisterController.java` (`list`), `BookingService.java` (make `fromInstant`/`toInstant` package-private `static`; they are `private static` today)
- Test: `PlotBookingRegisterRepositoryTest.java`, `BookingRegisterServiceTest.java`, `AdminBookingRegisterControllerTest.java`

**Interfaces:**
- Consumes: `BookingService.fromInstant(LocalDate)` / `toInstant(LocalDate)` (null bound = `Instant.EPOCH` / `9999-01-01`; `to` returns start of the day AFTER, exclusive).
- Produces:
  - `Page<PlotBooking> PlotBookingRepository.search(BookingStatus status, UUID associateId, UUID plotId, UUID projectId, boolean overdueOnly, LocalDate today, Instant bookedFrom, Instant bookedTo, boolean cancelledFilter, Instant cancelledFrom, Instant cancelledTo, String q, Pageable pageable)` (`q` is non-null, already lowercased/trimmed; `""` = no search).
  - `AdminBookingPageResponse BookingRegisterService.list(BookingStatus status, UUID associateId, UUID plotId, UUID projectId, boolean overdue, LocalDate bookedFrom, LocalDate bookedTo, LocalDate cancelledFrom, LocalDate cancelledTo, String q, int page, int size)`.
  - Endpoint `GET /api/admin/bookings` gains params `bookedFrom`, `bookedTo`, `cancelledFrom`, `cancelledTo` (ISO dates) and `q`. No SecurityConfig change (exact matcher already exists).

- [ ] **Step 1: Failing repository tests** in `PlotBookingRegisterRepositoryTest`. Update its private `search(...)` helper to the new signature with neutral defaults (`Instant.EPOCH`, `Instant.parse("9999-01-01T00:00:00Z")`, `false`, same sentinels, `""`) and add a second helper `searchWith(...)` taking the new args. Seed facts (`BookingRegisterTestData`): booked_at = `T + dayOffset days` with `T = 2026-06-01T00:00:00Z`; b1 off 1 (p1), b2 off 2 (p1), b3 off 3 (p1), b8 off 0 (p1); b5 CANCELLED off 5 (p2) with NO `cancelledAt` set, so tests set it. Scope every assertion with `projectId`.
  - `bookedRangeIncludesTheToDayUntil235959AndExcludesTheNextMidnight`: booked_at is `T + offset days`, so b1 = 06-02, b2 = 06-03, b3 = 06-04 (00:00Z), b8 = 06-01. Use bookedFrom = `2026-06-03T00:00:00Z`, bookedTo = `BookingService.toInstant(2026-06-03)` = `2026-06-04T00:00:00Z` on p1 => `[b2]` only (b3 at exactly the exclusive bound is out, b1 before the start is out). Then `setBookedAt(2026-06-03T23:59:59Z)` on b1 via `saveAndFlush` and assert b1 and b2 are both in.
  - `cancelledRangeReturnsOnlyBookingsCancelledInsideIt`: `b5.setCancelledAt(Instant.parse("2026-06-10T12:00:00Z"))`, save; range covering it => `[b5]`; range not covering => empty.
  - `omittingTheCancelledFilterKeepsBookingsWithNullCancelledAt`: p1 search with `cancelledFilter=false` still returns 4 rows.
  - `qMatchesAssociateLoginIdCaseInsensitivelyAsSubstring`: read `userId` of `d.a1` via `associates.findById(d.a1)`, pass a lowercase middle substring => only a1's bookings in p1 (b1, b2, b8); a unique-enough value, so assert `containsAll`/`doesNotContain(b3)` using the actual generated ids.
  - `qMatchesPlotNoSubstring`: `plots.findById(b2.getPlotId()).get().getPlotNo()` lowercased => `[b2]`.
  - `blankQMeansNoFilter` (q `""` => 4 rows on p1) and `qNoMatchReturnsEmpty` (`"zzzz-nope"`).
  - `qCombinesWithProjectFilterUsingAnd`: q matching a1's userId + project p2 => only a1's p2 booking (b5).

- [ ] **Step 2: Run to verify failure.** `mvn -q test -Dtest=PlotBookingRegisterRepositoryTest` -> compile FAIL.

- [ ] **Step 3: Implement the repository.** In `search`, insert these lines inside the FIRST text block, directly ABOVE the `AND (:overdueOnly = false OR (b.status = ...ACTIVE` line (the line that precedes the `+ " AND " + BookingOverdue.EXISTS_OVERDUE` concatenation stays last):

```java
        AND b.bookedAt >= :bookedFrom AND b.bookedAt < :bookedTo
        AND (:cancelledFilter = false OR (b.cancelledAt >= :cancelledFrom AND b.cancelledAt < :cancelledTo))
        AND (:q = '' OR EXISTS (SELECT 1 FROM Associate qa WHERE qa.id = b.associateId AND LOWER(qa.userId) LIKE CONCAT('%', :q, '%'))
             OR EXISTS (SELECT 1 FROM Plot qp WHERE qp.id = b.plotId AND LOWER(qp.plotNo) LIKE CONCAT('%', :q, '%')))
```
Add the matching `@Param`s to the method (order as in Interfaces above; keep `today` where it is). Update the comment above `search` (filters now include dates and `q`; text-block trap). Ceiling comment: `% _` in `q` are LIKE wildcards, unescaped.

- [ ] **Step 4: Run repo tests, expect PASS.**

- [ ] **Step 5: Failing service tests** in `BookingRegisterServiceTest` (follow its existing mock/setup style; it already constructs `BookingRegisterService`, so adapt existing `list(...)` calls and `search(...)` stubs/verifies to the new signatures with neutral args):
  - `listConvertsInclusiveDatesToUtcHalfOpenInstants`: `bookedFrom=2026-06-02`, `bookedTo=2026-06-03` => `search` captured with `Instant.parse("2026-06-02T00:00:00Z")` and `Instant.parse("2026-06-04T00:00:00Z")`.
  - `listUsesOpenEndedSentinelsAndNoCancelledFilterWhenDatesAbsent`: `cancelledFilter=false`, bookedFrom `Instant.EPOCH`.
  - `listTurnsOnTheCancelledFilterWhenEitherCancelledBoundIsGiven` (only `cancelledTo` supplied => `cancelledFilter=true`, `cancelledFrom=EPOCH`).
  - `listTrimsAndLowercasesQAndMapsNullToEmptyString`.

- [ ] **Step 6: Implement service.** In `BookingRegisterService.list`:

```java
boolean cancelledFilter = cancelledFrom != null || cancelledTo != null;
String needle = q == null ? "" : q.trim().toLowerCase(java.util.Locale.ROOT);
Page<PlotBooking> result = plotBookingRepository.search(
    status, associateId, plotId, projectId, overdue, LocalDate.now(clock),
    BookingService.fromInstant(bookedFrom), BookingService.toInstant(bookedTo),
    cancelledFilter, BookingService.fromInstant(cancelledFrom), BookingService.toInstant(cancelledTo),
    needle, PageRequest.of(page, size, NEWEST_FIRST));
```
Change `BookingService.fromInstant`/`toInstant` from `private static` to `static`.

- [ ] **Step 7: Failing controller tests** in `AdminBookingRegisterControllerTest` (existing `tokenFor`/`admin()` pattern; update the existing `registerService.list(...)` stubs/verifies to the 12-arg signature):
  - `datesAndQAreBoundAndForwarded`: params `bookedFrom=2026-06-01&bookedTo=2026-06-30&cancelledFrom=2026-07-01&cancelledTo=2026-07-31&q=VP00` => `verify(registerService).list(null, null, null, null, false, LocalDate.of(2026,6,1), LocalDate.of(2026,6,30), LocalDate.of(2026,7,1), LocalDate.of(2026,7,31), "VP00", 0, 20)`.
  - `bookedFromAfterBookedToIs400` and `cancelledFromAfterCancelledToIs400`.
  - `malformedDateIs400` (`bookedFrom=not-a-date`; if the app's handler returns 500 for the conversion error, report it, do not fix globally).
  - `omittedNewParamsForwardNulls`.
  Implement in the controller: add `@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate bookedFrom, bookedTo, cancelledFrom, cancelledTo` and `@RequestParam(required = false) String q`, a private `checkRange(from, to)` identical to `AssociateBookingController.checkRange` (throw `ResponseStatusException(BAD_REQUEST, "... from must not be after to")`), applied to both pairs, then call the 12-arg `registerService.list`.

- [ ] **Step 8: Run all touched classes.**

Run: `mvn -q test -Dtest=PlotBookingRegisterRepositoryTest,BookingRegisterServiceTest,AdminBookingRegisterControllerTest,SecurityConfigTest`
Expected: PASS. Also run Task 2's `listSerialisesTheNewFields` now if it was deferred.

- [ ] **Step 9: Commit** `git add backend/src/main/java/com/plotchain/booking backend/src/test/java/com/plotchain/booking && git commit -m "feat(booking): register booked/cancelled date filters and q search (U3)"`

---

### Task 4: GET /api/admin/payments (unconfirmed queue + confirmed ledger)

**Files:**
- Create: `PaymentRow.java`, `PaymentPageResponse.java`, `PaymentLedgerService.java` (all `backend/src/main/java/com/plotchain/booking/`)
- Modify: `EmiInstallmentRepository.java`, `AdminPaymentController.java`, `backend/src/main/java/com/plotchain/auth/SecurityConfig.java`
- Test: create `PaymentLedgerRepositoryTest.java`, `PaymentLedgerServiceTest.java`, `AdminPaymentControllerTest.java`; modify `auth/SecurityConfigTest.java`

**Interfaces:**
- Consumes: `InstallmentStatus {PENDING, ENTERED, PAID, VOID}`, `PaymentMode`, `EmiInstallment` fields (`paidAt` = payment date, `recordedBy` = entry-by, `confirmedAt/By`).
- Produces:

```java
public record PaymentRow(UUID bookingId, int installmentNumber, Instant paymentDate, String associateCode,
    String associateName, String projectName, String plotNo, BigDecimal amount, PaymentMode paymentMode,
    String paymentRef, String entryBy, String confirmBy, Instant confirmedAt) {}

public record PaymentPageResponse(List<PaymentRow> payments, int page, int size, long totalElements,
    BigDecimal pageTotal, BigDecimal grandTotal) {}
```
  - `Page<PaymentRow> EmiInstallmentRepository.findPayments(InstallmentStatus status, Instant from, Instant to, UUID projectId, Pageable unsorted)` and `BigDecimal EmiInstallmentRepository.sumPayments(InstallmentStatus status, Instant from, Instant to, UUID projectId)` (may return null when no rows).
  - `PaymentPageResponse PaymentLedgerService.list(InstallmentStatus status, LocalDate from, LocalDate to, UUID projectId, int page, int size)`.
  - `GET /api/admin/payments?status=ENTERED|PAID&from&to&projectId&page&size` (default `status=ENTERED`).

- [ ] **Step 1: Failing repository test** `PaymentLedgerRepositoryTest` (`@SpringBootTest @ActiveProfiles("test") @Transactional`, same autowiring and `BookingRegisterTestData.seed()` as `PlotBookingRegisterRepositoryTest`; assert only on seeded rows by scoping `projectId` to `d.p1`/`d.p2`). Add a private helper that loads an installment by `findByBookingIdOrderByInstallmentNumberAsc(booking.getId())` and sets `status/paidAt/recordedBy/paymentMode/paymentRef/confirmedAt/confirmedBy` then `saveAndFlush`. `recordedBy`/`confirmedBy` must be real associate ids (FK): use `d.a1`/`d.a2`. Seed: b1 inst1 -> ENTERED paidAt 2026-06-10T10:00Z mode CASH by a1; b2 inst1 -> ENTERED paidAt 2026-06-12T10:00Z mode UPI by a2; b3 inst1 is already PAID (leave it: recordedBy/paymentMode NULL, paidAt set by the helper only for the null-join test); b7 inst1 -> PAID paidAt 2026-06-05, confirmed by a1 at 2026-06-06 (p2).
  - `enteredFilterReturnsOnlyEnteredRowsNewestPaymentFirstWithJoinedLabels` (p1 => `[b2 row, b1 row]`; assert `associateCode` == a1/a2 `userId`, `associateName`, `projectName`, `plotNo`, `entryBy` == recording associate's name, `confirmBy` null).
  - `paidFilterExcludesEnteredAndCarriesConfirmByAndConfirmedAt` (p2 => `[b7 row]`).
  - `dateRangeIsHalfOpenOnPaidAt` (to-bound = start of next day excludes a row at exactly that instant).
  - `projectFilterNullMeansAllProjects` (only assert seeded rows are present via `containsAll`).
  - `grandTotalSumsEveryFilteredRowNotJustThePage` (size 1 => 1 row, `totalElements` 2, `sumPayments` == sum of both amounts).
  - `rowWithNullEntryByAndNullModeStillAppears`: make b3 inst1 `paidAt` set but `recordedBy`/`paymentMode` null (token-like) => present in PAID p1, `entryBy` null, `paymentMode` null (proves LEFT JOIN).

- [ ] **Step 2: Run to verify failure.** `mvn -q test -Dtest=PaymentLedgerRepositoryTest` -> compile FAIL.

- [ ] **Step 3: Implement repository** in `EmiInstallmentRepository`:

```java
// Admin payments list (U3). ENTERED = unconfirmed queue, PAID = confirmed ledger; date filter is on
// paid_at (payment date) for both. LEFT JOINs keep rows whose entry-by/confirm-by is NULL (token
// installments, legacy rows). Pageable must be UNSORTED: order is fixed here.
@Query(value = """
    SELECT new com.plotchain.booking.PaymentRow(
        b.id, i.installmentNumber, i.paidAt, a.userId, a.name, pr.name, pl.plotNo,
        i.amount, i.paymentMode, i.paymentRef, eb.name, cb.name, i.confirmedAt)
    FROM EmiInstallment i
    JOIN PlotBooking b ON b.id = i.bookingId
    JOIN Associate a ON a.id = b.associateId
    JOIN Plot pl ON pl.id = b.plotId
    JOIN Project pr ON pr.id = pl.projectId
    LEFT JOIN Associate eb ON eb.id = i.recordedBy
    LEFT JOIN Associate cb ON cb.id = i.confirmedBy
    WHERE i.status = :status AND i.paidAt >= :from AND i.paidAt < :to
    AND (:projectId IS NULL OR pl.projectId = :projectId)
    ORDER BY i.paidAt DESC, i.id DESC
    """,
    countQuery = """
    SELECT COUNT(i)
    FROM EmiInstallment i
    JOIN PlotBooking b ON b.id = i.bookingId
    JOIN Plot pl ON pl.id = b.plotId
    WHERE i.status = :status AND i.paidAt >= :from AND i.paidAt < :to
    AND (:projectId IS NULL OR pl.projectId = :projectId)
    """)
Page<PaymentRow> findPayments(@Param("status") InstallmentStatus status, @Param("from") Instant from,
    @Param("to") Instant to, @Param("projectId") UUID projectId, Pageable pageable);

@Query("""
    SELECT SUM(i.amount)
    FROM EmiInstallment i
    JOIN PlotBooking b ON b.id = i.bookingId
    JOIN Plot pl ON pl.id = b.plotId
    WHERE i.status = :status AND i.paidAt >= :from AND i.paidAt < :to
    AND (:projectId IS NULL OR pl.projectId = :projectId)
    """)
BigDecimal sumPayments(@Param("status") InstallmentStatus status, @Param("from") Instant from,
    @Param("to") Instant to, @Param("projectId") UUID projectId);
```
(imports: `Page`, `Pageable`, `BigDecimal`.) If Hibernate rejects the constructor-expression types, align the `PaymentRow` component types with the selected expression types (do not change the query shape).

- [ ] **Step 4: Run repo tests, expect PASS.**

- [ ] **Step 5: Failing service tests** `PaymentLedgerServiceTest` (`@ExtendWith(MockitoExtension.class)`, mock `EmiInstallmentRepository`, real service):
  - `listConvertsDatesToHalfOpenUtcInstantsAndUnboundedWhenNull` (capture args of `findPayments`).
  - `pageTotalSumsOnlyTheRowsOnThePageAndGrandTotalComesFromTheSumQuery` (two rows 100 + 50 with `grandTotal` stub 400 => `pageTotal` 150, `grandTotal` 400).
  - `grandTotalIsZeroWhenSumQueryReturnsNull`.
  - `listPassesAnUnsortedPageableWithPageAndSize`.
  Implement `PaymentLedgerService` (`@Service`, `@Transactional(readOnly = true)`) using `BookingService.fromInstant/toInstant`; empty page => `pageTotal` ZERO.

- [ ] **Step 6: Failing controller tests** `AdminPaymentControllerTest` (`@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test")`, `@MockBean AssociateRepository`, `@MockBean PaymentLedgerService`, `@MockBean BookingService`, `tokenFor` pattern copied from `AdminBookingRegisterControllerTest`):
  - `noParamsDefaultsToEnteredPage0Size20AndReturnsTheEnvelope` (jsonPath `$.payments`, `$.pageTotal`, `$.grandTotal`, `$.totalElements`).
  - `statusPaidAndFiltersAreBoundAndForwarded` (`from`, `to`, `projectId`, `page=2`, `size=5`).
  - `statusPendingOrVoidIs400` (only ENTERED/PAID allowed; implement as `ResponseStatusException`).
  - `fromAfterToIs400`.
  - `sizeIsClampedBetween1And100AndNegativePageToZero` (size=0 -> 1; size=500 -> 100; page=-3 -> 0).
  Implement in `AdminPaymentController`: inject `PaymentLedgerService` (add to the constructor; first `grep -rn "new AdminPaymentController" backend/src` and update any manual construction), and

```java
@GetMapping
public PaymentPageResponse list(
        @RequestParam(defaultValue = "ENTERED") InstallmentStatus status,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
        @RequestParam(required = false) UUID projectId,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size) {
    if (status != InstallmentStatus.ENTERED && status != InstallmentStatus.PAID) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "status must be ENTERED or PAID");
    }
    if (from != null && to != null && from.isAfter(to)) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "from must not be after to");
    }
    page = Math.max(page, 0);
    size = Math.min(Math.max(size, 1), 100);
    return paymentLedgerService.list(status, from, to, projectId, page, size);
}
```
Update the class comment: POST confirm rides the blanket POST rule; this GET has its own matcher.

- [ ] **Step 7: Security matcher + tests.** In `SecurityConfig.java`, directly after the `GET /api/admin/emi-reports/overdue` matcher (~L249-250) add, with a short comment ("no blanket GET /api/admin/**; /api/admin/payments is exact, the POST /confirm sub-path is separate"):

```java
.requestMatchers(HttpMethod.GET, "/api/admin/payments")
    .hasAuthority("ADMIN")
```
In `SecurityConfigTest` add, copying the overdue-report pair at ~L776-789:
`adminPaymentsListIsReachableOnlyForAdminAndForbiddenForEveryOtherRole` (`@ParameterizedTest @EnumSource(AssociateRole.class)`; ADMIN => 200, others 403; if the real service returns 200 on the empty test DB no mock is needed, else follow how the overdue test gets 200) and `adminPaymentsListIsUnauthorizedWithoutAToken` (401). Also `adminPaymentsListWithStatusPaidIsStillAdminOnly` (ASSOCIATE token + `status=PAID` => 403).

- [ ] **Step 8: Run.**

Run: `mvn -q test -Dtest=PaymentLedgerRepositoryTest,PaymentLedgerServiceTest,AdminPaymentControllerTest,SecurityConfigTest`
Expected: PASS.

- [ ] **Step 9: Commit** `git add backend/src/main/java backend/src/test/java && git commit -m "feat(booking): GET /api/admin/payments for unconfirmed queue and confirmed ledger (U3)"`

---

### Task 5: GET /api/admin/emi-reports/last-emi

**Files:**
- Create: `LastEmiHead.java`, `LastEmiRow.java`, `LastEmiReportService.java` (`backend/src/main/java/com/plotchain/booking/`)
- Modify: `PlotBookingRepository.java` (add `findLastEmiHeads`), `AdminEmiReportController.java`, `SecurityConfig.java`
- Test: create `LastEmiRepositoryTest.java`, `LastEmiReportServiceTest.java`; modify `AdminEmiReportControllerTest.java`, `SecurityConfigTest.java`

**Interfaces:**
- Consumes: Task 4's sentinel idea (here `LocalDate` sentinels), `EmiInstallmentRepository.findByBookingIdInOrderByInstallmentNumberAsc`.
- Produces:

```java
record LastEmiHead(UUID bookingId, Instant bookedAt, String associateCode, String associateName,
    String buyerName, String buyerPhone, String plotNo, String projectName,
    LocalDate lastDueDate, BigDecimal discount, BigDecimal total) {}

public record LastEmiRow(UUID bookingId, Instant bookedAt, String associateCode, String associateName,
    String buyerName, String buyerPhone, String plotNo, String projectName,
    LocalDate lastDueDate, BigDecimal discount, BigDecimal total, BigDecimal paid, BigDecimal rest) {}
```
  - `List<LastEmiHead> PlotBookingRepository.findLastEmiHeads(LocalDate from, LocalDate to, UUID projectId)`.
  - `List<LastEmiRow> LastEmiReportService.report(LocalDate from, LocalDate to, UUID projectId)`; endpoint `GET /api/admin/emi-reports/last-emi?from&to&projectId`.

- [ ] **Step 1: Failing repository test** `LastEmiRepositoryTest` (same real-DB setup as Task 4; seed due dates: b1 {06-14, 06-10, 07-15} last 07-15; b2 {06-15}; b3 {05-01, 08-01} last 08-01 (its inst1 is PAID); b4 {05-01} CONFIRMED; b5 CANCELLED {05-01 VOID}; b6 {06-14}; b7 {05-01}; b8 none). Scope with projectId p1/p2:
  - `rangeIsInclusiveAtBothEndsOnTheLastDueDate`: p1, from 2026-06-15, to 2026-07-15 => b1 (07-15) and b2 (06-15); order by `lastDueDate` asc then id.
  - `usesTheMaximumDueDateNotAnyInstalment`: p1, 2026-06-10..2026-06-14 => empty (b1 has installments in that range but its LAST is 07-15).
  - `cancelledBookingsAreExcluded`: p2, 2026-05-01..2026-05-01 => b4 and b7 but never b5.
  - `bookingWithNoInstallmentsNeverAppears` (b8 absent from p1 with open range).
  - `nullProjectMeansAllAndOpenDatesMeanNoBound` (use sentinels as the service will; assert the seeded non-cancelled bookings are all present via `containsAll`).
  - `rowCarriesLabelsDiscountAndTotal` (assert associateCode == `userId` of a1, `plotNo`, `projectName`, `total` 600000.00, `discount` 0).

- [ ] **Step 2: Run to verify failure.** `mvn -q test -Dtest=LastEmiRepositoryTest` -> compile FAIL.

- [ ] **Step 3: Implement the query** in `PlotBookingRepository`:

```java
// Admin "EMI by last date" (U3): bookings whose LAST instalment due date (MAX over non-void rows) is in
// [from, to]. CANCELLED excluded (all rows VOID). Inner join on installments => a booking with none never
// appears. `paid` is added by LastEmiReportService from a second query (PAID only) to keep this JPQL simple.
@Query("""
    SELECT new com.plotchain.booking.LastEmiHead(
        b.id, b.bookedAt, a.userId, a.name, b.buyerName, b.buyerPhone, pl.plotNo, pr.name,
        MAX(i.dueDate), b.discount, b.totalAmount)
    FROM PlotBooking b
    JOIN EmiInstallment i ON i.bookingId = b.id
    JOIN Associate a ON a.id = b.associateId
    JOIN Plot pl ON pl.id = b.plotId
    JOIN Project pr ON pr.id = pl.projectId
    WHERE b.status <> com.plotchain.booking.BookingStatus.CANCELLED
    AND i.status <> com.plotchain.booking.InstallmentStatus.VOID
    AND (:projectId IS NULL OR pl.projectId = :projectId)
    GROUP BY b.id, b.bookedAt, a.userId, a.name, b.buyerName, b.buyerPhone, pl.plotNo, pr.name,
        b.discount, b.totalAmount
    HAVING MAX(i.dueDate) >= :from AND MAX(i.dueDate) <= :to
    ORDER BY MAX(i.dueDate) ASC, b.id ASC
    """)
List<LastEmiHead> findLastEmiHeads(@Param("from") LocalDate from, @Param("to") LocalDate to,
    @Param("projectId") UUID projectId);
```
`LastEmiHead` is a package-private record (the repository is in the same package; the interface method is public, which is fine for a package-private type only if the repository interface is also in that package; it is). If the compiler complains, make `LastEmiHead` public.

- [ ] **Step 4: Run repo tests, expect PASS.**

- [ ] **Step 5: Failing service tests** `LastEmiReportServiceTest` (Mockito, mock `PlotBookingRepository` + `EmiInstallmentRepository`):
  - `paidCountsOnlyPaidInstallmentsEnteredAndVoidAndPendingAreRest`: installments for one booking {PAID 100, ENTERED 50, PENDING 50, VOID 999}; head total 200 => `paid` 100, `rest` 100.
  - `restIsTotalMinusPaidAndNeverNegativeScaleIssues` (total 500000.00, paid 0 => rest 500000.00).
  - `nullDatesBecomeOpenEndedSentinels` (`findLastEmiHeads` captured with `LocalDate.of(1900,1,1)` and `LocalDate.of(9999,12,31)`).
  - `emptyHeadsDoNotQueryInstallments` (`verifyNoInteractions(emiInstallmentRepository)`).
  - `discountIsPassedThrough`.
  Implement `LastEmiReportService` (`@Service`, `@Transactional(readOnly = true)`): heads -> `ids` -> `findByBookingIdInOrderByInstallmentNumberAsc(ids)` grouped by booking -> `paid` = sum of `PAID` amounts, `rest = total.subtract(paid)`. No paging: `// ponytail: unpaged list, add paging if a date range ever returns thousands of bookings`.

- [ ] **Step 6: Failing controller tests** in `AdminEmiReportControllerTest` (add `@MockBean LastEmiReportService`; keep its existing `tokenFor`/`OverdueReportService` setup):
  - `lastEmiForwardsDatesAndProjectAndReturnsTheList`.
  - `lastEmiWithNoParamsForwardsNulls`.
  - `lastEmiFromAfterToIs400`.
  Implement in `AdminEmiReportController`: inject `LastEmiReportService` (constructor), add

```java
@GetMapping("/api/admin/emi-reports/last-emi")
public List<LastEmiRow> lastEmi(
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
        @RequestParam(required = false) UUID projectId) {
    if (from != null && to != null && from.isAfter(to)) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "from must not be after to");
    }
    return lastEmiReportService.report(from, to, projectId);
}
```
(grep for manual `new AdminEmiReportController(` in tests first.)

- [ ] **Step 7: Security matcher + tests.** `SecurityConfig.java`: add right after the Task 4 payments matcher:

```java
.requestMatchers(HttpMethod.GET, "/api/admin/emi-reports/last-emi")
    .hasAuthority("ADMIN")
```
(Exact path; `/overdue` matcher does NOT cover it.) `SecurityConfigTest`: `adminLastEmiReportIsReachableOnlyForAdminAndForbiddenForEveryOtherRole` (parameterized, copy of the overdue pair) and `adminLastEmiReportIsUnauthorizedWithoutAToken`.

- [ ] **Step 8: Run.**

Run: `mvn -q test -Dtest=LastEmiRepositoryTest,LastEmiReportServiceTest,AdminEmiReportControllerTest,SecurityConfigTest`
Expected: PASS.

- [ ] **Step 9: Commit** `git add backend/src/main/java backend/src/test/java && git commit -m "feat(booking): GET /api/admin/emi-reports/last-emi (U3)"`

---

### Task 6: Fix size=0 clamp on associate list endpoints

**Files:**
- Modify: `backend/src/main/java/com/plotchain/booking/AssociateBookingController.java` (`getMyBookings` ~L36, `getTeamBookings` ~L58), `backend/src/main/java/com/plotchain/sales/AssociateSaleController.java` (`getMySales`)
- Test: `AssociateBookingControllerTest.java`, `sales/AssociateSaleControllerTest.java`

**Root cause:** `size = Math.min(size, 100)` has no lower bound, so `size=0` (or negative) reaches `PageRequest.of`, which throws `IllegalArgumentException` (500). `AdminBookingRegisterController` already uses `Math.min(Math.max(size, 1), 100)`. The same one-sided clamp is in the sibling team-bookings route and in `AssociateSaleController`; fix all three at once.

- [ ] **Step 1: Failing tests.** In `AssociateBookingControllerTest`, after `getMyBookingsClampsPageAndSizeTheSameWayOtherAssociateMeEndpointsDo` (~L72), add (mock `bookingService.getMyBookings(eq(associateId), eq(0), eq(1))` returning an empty `AssociateBookingPageResponse(List.of(), 0, 1, 0)`):
  - `getMyBookingsSizeZeroIsClampedToOneNotA500` (param `size=0` => 200, `$.size` 1)
  - `getMyBookingsNegativeSizeIsClampedToOne` (`size=-5`)
  - `getTeamBookingsSizeZeroIsClampedToOne` (`bookingService.getTeamBookings(eq(id), eq(null), eq(0), eq(1))`)
  In `AssociateSaleControllerTest` add `getMySalesSizeZeroIsClampedToOne` (`saleService.getMySales(eq(id), eq(0), eq(1))`).

- [ ] **Step 2: Run to verify failure** (unmatched stub => null body / 500).

Run: `mvn -q test -Dtest=AssociateBookingControllerTest,AssociateSaleControllerTest`

- [ ] **Step 3: Implement.** Replace `size = Math.min(size, 100);` with `size = Math.min(Math.max(size, 1), 100);` in `getMyBookings` and `getMySales`; in `getTeamBookings` use `Math.min(Math.max(size, 1), 100)` in the call.

- [ ] **Step 4: Run, expect PASS.** Same command.

- [ ] **Step 5: Commit** `git add backend/src/main/java backend/src/test/java && git commit -m "fix(booking,sales): clamp size>=1 on associate list endpoints (size=0 was a 500) (U3)"`

---

### Task 7: Final verification (no new code)

- [ ] **Step 1:** Run every class this unit touched together:

```bash
cd /Users/ronalisenapati/Ronali/plotchain/backend && mvn -q test -Dtest=BookingServiceTest,BookingControllerTest,BookingExceptionHandlerTest,BookingPaymentIntegrationTest,AdminBookingRegisterControllerTest,BookingRegisterServiceTest,PlotBookingRegisterRepositoryTest,PaymentLedgerRepositoryTest,PaymentLedgerServiceTest,AdminPaymentControllerTest,LastEmiRepositoryTest,LastEmiReportServiceTest,AdminEmiReportControllerTest,AssociateBookingControllerTest,AssociateSaleControllerTest,SecurityConfigTest,BookingConfirmIntegrationTest,BookingCancelIntegrationTest,OverdueReportIntegrationTest,V45MigrationTest
```
Expected: PASS. Any failure in a class from this list that was green on master before your change is yours to fix. Do not chase the known baseline (4 failures + 5 errors in the full suite; spurious Mockito/JDK errors).

- [ ] **Step 2:** `git status` shows only intended files; `git log --oneline` shows the six task commits. Do not modify `*-units.md` or `spec-cycle-status.md`; report completion to the coordinator.

---

## Self-Review

- **Spec coverage:** (1) discount + BookingResponse fields: Tasks 1-2. (2) register filters: Task 3. (3) payments list with pageTotal/grandTotal: Task 4. (4) last-EMI: Task 5. (5) SecurityConfig matchers + SecurityConfigTest: Tasks 4 and 5 (bookings GET reuses the existing exact matcher; noted). (6) size=0 clamp: Task 6. (7) SalesHistory: already satisfied by `SaleResponse.associateUserId/associateName`; documented under Open Questions, no code.
- **Placeholders:** Test-body prose steps in Tasks 3-6 name exact method names, seed facts, and assertions; helpers to copy are cited by file/line. No TBD.
- **Type consistency:** `BookingRegisterService.list` 12-arg and `PlotBookingRepository.search` 13-arg signatures are identical wherever referenced (Tasks 2, 3). `PaymentRow` components match the JPQL constructor expression order. `LastEmiHead`/`LastEmiRow` fields match the query and service. `BookingService.fromInstant/toInstant` are promoted to package-private in Task 3 and reused in Tasks 3-4.
