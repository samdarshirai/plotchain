# Plot-Booking Reference Gap, Unit 4: Reschedule Remaining Instalments

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin re-split the unpaid balance of an ACTIVE booking over a new number of monthly instalments (reference system "Add Plot EMI"), from the booking detail panel.

**Architecture:** One new endpoint `POST /api/admin/bookings/{id}/reschedule` backed by `BookingService.rescheduleBooking`. It locks the booking, voids the PENDING rows, inserts new PENDING rows numbered after the current maximum, writes one `RESCHEDULED` audit event (V46 widens the CHECK) and returns `BookingResponse`. The frontend adds a `reschedule` mode to `booking-seal` (count + native date input + client-side preview + the existing inline-form confirm), with styles in a new small stylesheet.

**Tech Stack:** Spring Boot 3 / JPA / Flyway (H2 in tests, Postgres in prod), JUnit 5 + Mockito + MockMvc; Angular 18 standalone, Karma/Jasmine, ngx-translate.

**Spec:** `docs/superpowers/plans/2026-10-12-plot-booking-reference-gap-plan.md` (section U4, narrowed by the owner decisions below). Related code: U1/U2 plans, `backend/src/main/java/com/plotchain/booking/BookingService.java`.

## Owner decisions (fixed)

- "Add Plot EMI" = RESCHEDULE the remaining balance of an ACTIVE booking. Admin picks a new instalment count and a first due date.
- PAID and ENTERED instalments (and the token, which is instalment 1 PAID) are untouched.
- Unpaid balance = `totalAmount - sum(PAID + ENTERED amounts)`. It is re-split over new PENDING instalments. Old PENDING rows become VOID, with an audit note.
- Admin-only, triggered from the booking-seal detail panel next to Confirm / Transfer / Cancel. No separate screen. PLC and Plot Transfer stay out of scope.

## Global Constraints

- Lock order is booking row first (`plotBookingRepository.findByIdForUpdate`). Reschedule never touches the plot, so there is no plot lock.
- Money is `BigDecimal` scale 2. Rounding is `divide(count, 2, RoundingMode.DOWN)` and the LAST instalment absorbs the remainder (same as `computeSchedule`).
- Due dates are `firstDueDate.plusMonths(i)` for `i = 0..count-1`, always computed from the first date (never cumulatively), so a 31st does not drift.
- "Today" is `LocalDate.now(clock)` (injected `Clock`, UTC), the same as the overdue derivation in `toResponses`.
- Any new `BookingEventType` needs `chk_booking_event_type` widened in a NEW Flyway migration (V43/V45 lesson) AND a real-DB test. The next free number is **V46** (verified: V45 is the highest).
- Frontend rules from DESIGN.md: tokens only, no hex; Oxblood primary buttons (`brand-button`); `--status-danger` for errors (via `app-inline-banner tone="danger"`); no `window.confirm`, use the inline form; `_admin.scss` must not grow; `booking-seal.component.scss` must not grow (new styles go in a new stylesheet). `hi.json` mirrors the English text.
- Do not edit `*-units.md` or `spec-cycle-status.md` (coordinator's job).

## Endpoint contract (the backend and frontend tasks both build to this)

```
POST /api/admin/bookings/{id}/reschedule        (ADMIN only; blanket POST /api/** rule)
Request : { "installmentCount": 1..60, "firstDueDate": "YYYY-MM-DD" }
200     : BookingResponse (same shape as pay/confirm/cancel/transfer; installments include the VOID rows
          and the new PENDING rows; paidAmount/dueAmount unchanged; installmentCount = number of non-VOID rows)
400     : {"error": "..."}  bean validation (count outside 1..60, missing/malformed date) -> ApiExceptionHandler;
          InvalidRescheduleException (firstDueDate before today, or balance too small for the count
          i.e. base instalment would be < 0.01) -> BookingExceptionHandler, message in "error"
404     : {"error": "..."}  BookingNotFoundException
409     : {"error": "Booking is not ACTIVE: <id>"}            BookingNotActiveException (existing)
409     : {"error": "...", "code": "NO_REMAINING_BALANCE"}    NothingToRescheduleException
401/403 : no token / non-admin (SecurityConfig)
```

## Design answers

1. **Validation.** Count bound is 1..60. The only existing limit is `default_installment_count INTEGER NOT NULL DEFAULT 1` with no CHECK or max, so 60 (5 years monthly) is a new constant, `RescheduleRequest.MAX_COUNT`, enforced by `@Min(1) @Max(60)`. Check order: booking 404, not ACTIVE 409, balance <= 0 409 `NO_REMAINING_BALANCE`, firstDueDate < today 400, `base < 0.01` 400. All checks run before the first write, so every 4xx leaves the DB untouched. ENTERED amounts DO count as committed. Reasoning: they are received money pending confirmation, and `dueAmount` already counts them as due until confirmed, so excluding them from the new schedule would double-bill the buyer. The new schedule only covers what is still PENDING.
2. **Concurrency and idempotency.** The booking row lock serialises against `recordPayment`, `confirmPayment`, `cancel`, `transfer` and `confirm`. If a pending instalment is entered before our lock, it is ENTERED and excluded from the re-split. If it is entered after, `recordPayment` re-reads the old row as VOID and returns 409 `InstallmentNotPayableException` (it only pays PENDING). A repeat call is NOT idempotent: it voids the previous reschedule's PENDING rows and creates another set, and numbers keep growing. That is acceptable. The UI locks while busy, and every call writes an audit event. No idempotency key (YAGNI). New instalment numbers start at `max(installmentNumber over ALL rows incl. VOID) + 1`, so `(booking, number)` identities are never reused, and `recordPayment`'s lookup by number cannot hit a VOID twin.
3. **Event type.** No existing type fits (PAID, CONFIRMED, CANCELLED, TRANSFERRED, PAY_CONFIRMED). Reusing one would corrupt the audit meaning, so add `RESCHEDULED` (10 chars, fits `VARCHAR(16)`), plus `V46__booking_event_rescheduled.sql` that drops and re-adds the named constraint. Detail (<= 500 chars, counts only, no number lists): `voided 3 pending (#4-#6); balance 300000.00 over 4 from 2026-11-05`.
4. **Response.** `BookingResponse` (HTTP 200), like the other actions.
5. **Reports and AUTO_THRESHOLD.** `thresholdReached` sums PAID over the booking total, which is unchanged. Rescheduling never changes status and never auto-confirms (a test pins this). The overdue report counts only PENDING rows, so voided overdue rows drop out and the new rows (due >= today) cannot be overdue. EMI-by-last-date uses `MAX(dueDate)` over non-VOID rows, so it moves to the new last due date. No query changes, but an integration test pins both.
6. **Frontend.** The preview is computed client-side from `pendingSum` (the sum of the booking's PENDING installment amounts), which equals the balance to re-split (because token + PAID + ENTERED + PENDING = total). The preview uses integer cents, so there is no float drift, and mirrors the server rounding. The server stays authoritative and its response replaces the booking. Confirmation is the existing form pattern (a mode with an effects list and a submit button, as for cancel), with no `confirm()`.

## Review Focus

- Balance below 0.01 per instalment (e.g. 0.05 over 60): 400, not zero-amount rows. Pinned in Task 2.
- Booking with only ENTERED/PAID left (nothing PENDING): 409 `NO_REMAINING_BALANCE`, not an empty schedule. Pinned in Task 2.
- Remainder rounding (100000.00 over 3 = 33333.33, 33333.33, 33333.34), and a month-end first date (Jan 31 -> Feb 28, Mar 31). Pinned in Task 2.
- A payment entered racing the reschedule: loser gets 409, no double-billing. Pinned in Task 4 (service test with a pre-ENTERED row) and by the lock-order assertion.
- Double submit in the UI, and a stale panel (booking cancelled or confirmed elsewhere): busy lock; 409 `notActive` reloads and flashes. Pinned in Task 6.

## File Structure

Backend (all under `backend/src/main/java/com/plotchain/booking/` unless noted):
- Create `RescheduleRequest.java`: record with validation.
- Create `InvalidRescheduleException.java`, `NothingToRescheduleException.java`.
- Modify `BookingEventType.java` (add `RESCHEDULED`), `BookingService.java` (new method), `BookingController.java` (endpoint), `BookingExceptionHandler.java` (2 handlers).
- Create `backend/src/main/resources/db/migration/V46__booking_event_rescheduled.sql`.
- Tests under `backend/src/test/java/com/plotchain/booking/`: create `BookingRescheduleServiceTest`, `BookingRescheduleControllerTest`, `BookingRescheduleIntegrationTest`. Modify `PlotBookingSchemaTest` (valid-type list) and `auth/SecurityConfigTest`.

Frontend (`frontend/src/app/admin/admin-bookings-emi/`):
- Modify `booking-seal.component.ts` (mode, template, handlers), `bookings-emi.service.ts` (`reschedule()`), `bookings-emi.model.ts` (`RescheduleRequest`), `bookings-emi.util.ts` (`previewSchedule`, `classifyError` op/kind), their specs.
- Create `booking-seal-reschedule.scss` (new styles only) and add it to the component's `styleUrls`.
- Modify `frontend/src/assets/i18n/en.json` and `hi.json`.

## Parallelism

- **Backend (Tasks 1-4) and frontend (Tasks 5-7) are disjoint** and may run in parallel in separate worktrees. The frontend uses the endpoint contract above and mocks HTTP, so it does not need the backend.
- Within the backend: Task 1 (migration + enum) first; Task 2 (service) depends on it; Task 3 (controller/handler/security) depends on Task 2's method signature; Task 4 (integration) last.
- Within the frontend: Task 5 (service/model/util) first; Task 6 (seal UI) depends on 5; Task 7 (i18n + styles + build) last.
- Final Task 8 (full suites, build, manual check) runs after both streams merge. Commit this plan to master before dispatching worktree agents.

---

### Task 1: Migration V46 and the RESCHEDULED event type

**Files:**
- Create: `backend/src/main/resources/db/migration/V46__booking_event_rescheduled.sql`
- Modify: `backend/src/main/java/com/plotchain/booking/BookingEventType.java`
- Test: `backend/src/test/java/com/plotchain/booking/PlotBookingSchemaTest.java` (the `bookingEventAcceptsEveryValidType` test, around line 164)

**Interfaces:**
- Produces: `BookingEventType.RESCHEDULED`.

- [ ] **Step 1: Write the failing test.** In `PlotBookingSchemaTest.bookingEventAcceptsEveryValidType` add `"RESCHEDULED"` to the list and change the expected count `5` to `6`. `BookingEventRepositoryTest.everyBookingEventTypeIsAcceptedByTheDatabaseCheckConstraint` already iterates `BookingEventType.values()`, so it covers the enum side with no edit.
- [ ] **Step 2: Run, expect FAIL** (CHECK violation): `cd backend && mvn test -Dtest=PlotBookingSchemaTest`
- [ ] **Step 3: Implement.**

```java
public enum BookingEventType { PAID, CONFIRMED, CANCELLED, TRANSFERRED, PAY_CONFIRMED, RESCHEDULED }
```

```sql
-- plot-booking reference-gap unit 4: reschedule audit event. Enum + CHECK widened together (V43/V45 lesson).
ALTER TABLE booking_event DROP CONSTRAINT chk_booking_event_type;
ALTER TABLE booking_event ADD CONSTRAINT chk_booking_event_type
    CHECK (type IN ('PAID','CONFIRMED','CANCELLED','TRANSFERRED','PAY_CONFIRMED','RESCHEDULED'));
```

- [ ] **Step 4: Run, expect PASS:** `mvn test -Dtest=PlotBookingSchemaTest,BookingEventRepositoryTest,V45MigrationTest`
- [ ] **Step 5: Commit** (`git add` the 4 files; message `feat(booking): V46 widens booking_event CHECK for RESCHEDULED`).

### Task 2: `BookingService.rescheduleBooking`

**Files:**
- Create: `RescheduleRequest.java`, `InvalidRescheduleException.java`, `NothingToRescheduleException.java`
- Modify: `BookingService.java` (add the method after `transferBooking`)
- Test: `backend/src/test/java/com/plotchain/booking/BookingRescheduleServiceTest.java` (copy the Mockito setup and `@BeforeEach` wiring from `BookingCancelServiceTest`, including its fixed `Clock`)

**Interfaces:**
- Consumes: `plotBookingRepository.findByIdForUpdate`, `emiInstallmentRepository.findByBookingIdOrderByInstallmentNumberAsc` / `saveAll`, `bookingEventRepository.save`, `toResponse`, `sumByStatus`, `clock`.
- Produces:
  - `public record RescheduleRequest(@Min(1) @Max(60) int installmentCount, @NotNull LocalDate firstDueDate) { public static final int MAX_COUNT = 60; }`
  - `public BookingResponse BookingService.rescheduleBooking(UUID bookingId, RescheduleRequest request, UUID actorId)`
  - `InvalidRescheduleException(String message)` and `NothingToRescheduleException(UUID bookingId)` (both RuntimeException).

- [ ] **Step 1: Write failing tests** in `BookingRescheduleServiceTest`. Fixture: booking ACTIVE total 100000.00; rows #1 token 10000 PAID, #2 20000 ENTERED, #3 35000 PENDING, #4 35000 PENDING. Clock fixed at 2026-10-12. Cases (each its own `@Test`):
  1. `splitsBalanceOverNewPendingRows`: request count 3, first due 2026-11-05. Balance = 100000 - 10000 - 20000 = 70000.00. Expect new rows #5/#6/#7 PENDING, amounts 23333.33 / 23333.33 / 23333.34, due 2026-11-05 / 2026-12-05 / 2027-01-05. Old #3 and #4 are VOID. #1 and #2 unchanged. `installmentCount` = 5 (non-VOID: #1, #2, #5, #6, #7). `paidAmount` and `dueAmount` in the response are unchanged.
  2. `monthEndFirstDueDoesNotDrift`: first due 2026-01-31... use clock 2026-01-10, count 3 -> 2026-01-31, 2026-02-28, 2026-03-31.
  3. `writesOneRescheduledEventWithCounts`: `ArgumentCaptor<BookingEvent>`; type RESCHEDULED, actor = actorId, detail contains `voided 2 pending` and `balance 70000.00 over 3 from 2026-11-05`.
  4. `rejectsNonActiveBooking`: status CONFIRMED -> `BookingNotActiveException`; `verify(emiInstallmentRepository, never()).saveAll(any())`.
  5. `rejectsWhenNoPendingBalance`: rows all PAID/ENTERED summing to total -> `NothingToRescheduleException`, no writes.
  6. `rejectsPastFirstDueDate`: first due 2026-10-11 -> `InvalidRescheduleException`; today (2026-10-12) is accepted.
  7. `rejectsBalanceTooSmallForCount`: balance 0.05, count 60 -> `InvalidRescheduleException` (base would be 0.00).
  8. `unknownBookingIs404`: `BookingNotFoundException`.
  9. `locksBookingBeforeReadingInstallments`: `InOrder` verifies `findByIdForUpdate` precedes `findByBookingIdOrderByInstallmentNumberAsc`.
  10. `doesNotChangeStatusOrTouchPlot`: status stays ACTIVE; `verifyNoInteractions(plotRepository)`.
- [ ] **Step 2: Run, expect FAIL (compile error):** `cd backend && mvn test -Dtest=BookingRescheduleServiceTest`
- [ ] **Step 3: Implement.**

```java
// Reference "Add Plot EMI" (reference-gap U4): re-split the unpaid balance of an ACTIVE booking over
// `count` new monthly PENDING instalments. PAID and ENTERED rows (and the token) stay; old PENDING rows
// become VOID. Booking lock first (Decision 8); the plot is not touched, so no plot lock. Every 4xx
// happens before the first write. Not idempotent by design: a repeat call re-splits again (audited).
@Transactional
public BookingResponse rescheduleBooking(UUID bookingId, RescheduleRequest request, UUID actorId) {
    PlotBooking booking = plotBookingRepository.findByIdForUpdate(bookingId)
        .orElseThrow(() -> new BookingNotFoundException(bookingId));
    if (booking.getStatus() != BookingStatus.ACTIVE) {
        throw new BookingNotActiveException(bookingId);
    }
    List<EmiInstallment> installments =
        emiInstallmentRepository.findByBookingIdOrderByInstallmentNumberAsc(bookingId);

    BigDecimal committed = sumByStatus(installments, InstallmentStatus.PAID)
        .add(sumByStatus(installments, InstallmentStatus.ENTERED));
    BigDecimal balance = booking.getTotalAmount().subtract(committed).setScale(2, RoundingMode.HALF_UP);
    if (balance.signum() <= 0) {
        throw new NothingToRescheduleException(bookingId);
    }
    int count = request.installmentCount();
    LocalDate firstDue = request.firstDueDate();
    if (firstDue.isBefore(LocalDate.now(clock))) {
        throw new InvalidRescheduleException("First due date must be today or later");
    }
    BigDecimal base = balance.divide(BigDecimal.valueOf(count), 2, RoundingMode.DOWN);
    if (base.signum() <= 0) {
        throw new InvalidRescheduleException("Remaining balance " + balance.toPlainString()
            + " is too small to split into " + count + " instalments");
    }

    int nextNumber = installments.stream().mapToInt(EmiInstallment::getInstallmentNumber).max().orElse(0) + 1;
    int firstVoided = 0, lastVoided = 0, voided = 0;
    for (EmiInstallment i : installments) {
        if (i.getStatus() == InstallmentStatus.PENDING) {
            i.setStatus(InstallmentStatus.VOID);
            if (voided++ == 0) { firstVoided = i.getInstallmentNumber(); }
            lastVoided = i.getInstallmentNumber();
        }
    }
    List<EmiInstallment> created = new ArrayList<>();
    BigDecimal running = BigDecimal.ZERO;
    for (int k = 0; k < count; k++) {
        EmiInstallment n = new EmiInstallment();
        n.setId(UUID.randomUUID());
        n.setBookingId(bookingId);
        n.setInstallmentNumber(nextNumber + k);
        n.setDueDate(firstDue.plusMonths(k));
        n.setAmount(k == count - 1 ? balance.subtract(running) : base); // last absorbs the DOWN remainder
        running = running.add(base);
        created.add(n);
    }
    installments.addAll(created);
    emiInstallmentRepository.saveAll(installments);

    booking.setInstallmentCount((int) installments.stream()
        .filter(i -> i.getStatus() != InstallmentStatus.VOID).count());
    plotBookingRepository.save(booking);

    bookingEventRepository.save(BookingEvent.of(bookingId, BookingEventType.RESCHEDULED, actorId,
        "voided " + voided + " pending" + (voided > 0 ? " (#" + firstVoided + "-#" + lastVoided + ")" : "")
            + "; balance " + balance.toPlainString() + " over " + count + " from " + firstDue, clock.instant()));

    return toResponse(booking, installments);
}
```

  Note `running` adds `base` each loop, but only the non-last iterations are used by subtraction on the last one, which is correct. Ensure `ArrayList`/`LocalDate` imports exist (both already used by `computeSchedule`). Remember the `PlotBooking` setter name is `setInstallmentCount`.
- [ ] **Step 4: Run, expect PASS:** `mvn test -Dtest=BookingRescheduleServiceTest`
- [ ] **Step 5: Commit** (`feat(booking): rescheduleBooking re-splits unpaid balance`).

### Task 3: Endpoint, exception mapping, security

**Files:**
- Modify: `BookingController.java`, `BookingExceptionHandler.java`
- Test: create `BookingRescheduleControllerTest.java` (copy the structure of `BookingTransferControllerTest`: `@SpringBootTest`, `@AutoConfigureMockMvc`, `@MockBean BookingService`, `tokenFor`), modify `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java` (add after the transfer block, ~line 744)

**Interfaces:**
- Consumes: `BookingService.rescheduleBooking(UUID, RescheduleRequest, UUID)`.
- Produces: the endpoint in the contract section above.

- [ ] **Step 1: Write failing tests.**
  Controller test cases: (a) admin + valid body -> 200 and `verify(bookingService).rescheduleBooking(eq(id), eq(new RescheduleRequest(3, LocalDate.of(2026,11,5))), eq(adminId))`; (b) count 0 -> 400, count 61 -> 400, missing `firstDueDate` -> 400, and `verifyNoInteractions(bookingService)` each time; (c) service throws `BookingNotActiveException` -> 409; (d) `NothingToRescheduleException` -> 409 with `$.code` = `NO_REMAINING_BALANCE`; (e) `InvalidRescheduleException` -> 400 with `$.error`; (f) `BookingNotFoundException` -> 404.
  SecurityConfigTest, mirroring the transfer tests:

```java
@ParameterizedTest
@EnumSource(AssociateRole.class)
void adminBookingRescheduleIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
    mockMvc.perform(post("/api/admin/bookings/{id}/reschedule", UUID.randomUUID())
            .header("Authorization", "Bearer " + tokenFor(role))
            .contentType("application/json")
            .content("{\"installmentCount\":3,\"firstDueDate\":\"2099-01-01\"}"))
        .andExpect(status().is(role == AssociateRole.ADMIN ? 404 : 403));
}

@Test
void adminBookingRescheduleIsUnauthorizedWithoutAToken() throws Exception {
    mockMvc.perform(post("/api/admin/bookings/{id}/reschedule", UUID.randomUUID())
            .contentType("application/json")
            .content("{\"installmentCount\":3,\"firstDueDate\":\"2099-01-01\"}"))
        .andExpect(status().isUnauthorized());
}
```

- [ ] **Step 2: Run, expect FAIL:** `mvn test -Dtest=BookingRescheduleControllerTest,SecurityConfigTest`
- [ ] **Step 3: Implement.**

```java
// Reference "Add Plot EMI": admin re-splits the unpaid balance of an ACTIVE booking. Returns the updated booking (200).
@PostMapping("/{id}/reschedule")
public BookingResponse reschedule(@PathVariable UUID id, @Valid @RequestBody RescheduleRequest request,
                                  @AuthenticationPrincipal UUID actorId) {
    return bookingService.rescheduleBooking(id, request, actorId);
}
```

```java
@ExceptionHandler(NothingToRescheduleException.class)
public ResponseEntity<Map<String, String>> handleNothingToReschedule(NothingToRescheduleException ex) {
    return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage(), "code", "NO_REMAINING_BALANCE"));
}

@ExceptionHandler(InvalidRescheduleException.class)
public ResponseEntity<Map<String, String>> handleInvalidReschedule(InvalidRescheduleException ex) {
    return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", ex.getMessage()));
}
```

  `NothingToRescheduleException` message: `"Booking has no remaining balance to reschedule: " + bookingId`. Also add a `BookingExceptionHandlerTest` case for each of the two handlers following the existing cases in that file.
- [ ] **Step 4: Run, expect PASS:** `mvn test -Dtest=BookingRescheduleControllerTest,SecurityConfigTest,BookingExceptionHandlerTest`
- [ ] **Step 5: Commit** (`feat(booking): POST /bookings/{id}/reschedule with admin-only security test`).

### Task 4: Real-DB integration (persistence, reports, concurrency)

**Files:**
- Test: create `backend/src/test/java/com/plotchain/booking/BookingRescheduleIntegrationTest.java` (copy the `@SpringBootTest` + `JdbcTemplate` fixtures and cleanup from `BookingTransferIntegrationTest` / `BookingPaymentIntegrationTest`)

**Interfaces:** consumes `BookingService.rescheduleBooking`, `OverdueReportService`, `LastEmiReportService`, `recordPayment`.

- [ ] **Step 1: Write the tests** (no production code in this task; if one fails, fix Task 2).
  1. `persistsVoidAndNewRowsAndEvent`: book via `createBooking` (token + 3 balance rows), enter+confirm #2, reschedule count 2. Via `emi_installment`/`booking_event` SQL: the old PENDING rows are VOID, 2 new PENDING rows are numbered 5-6 (after max 4), exactly one `RESCHEDULED` event row exists (this also proves the V46 CHECK accepts it through the real insert path).
  2. `sumOfNonVoidRowsEqualsTotal`: after reschedule, `sum(amount) WHERE status <> 'VOID'` equals `total_amount`.
  3. `autoThresholdBookingIsNotConfirmedByReschedule`: with the config set to AUTO_THRESHOLD 100, reschedule leaves the booking ACTIVE.
  4. `overdueReportDropsVoidedOverdueRows`: seed a PENDING row due in the past (use `LegacyScheduleSeed` or a SQL update), assert the booking is in `OverdueReportService` output, reschedule with first due today, assert it is gone.
  5. `lastEmiReportUsesNewLastDueDate`: after reschedule, `LastEmiReportService` for a range around the new last due date returns the booking and for the old range does not.
  6. `enteringAVoidedInstalmentAfterRescheduleIs409`: `recordPayment` on a voided old number throws `InstallmentNotPayableException`.
  7. `rescheduleThenPayNewRow`: `recordPayment` on a new row with its exact amount succeeds (ENTERED).
  8. `concurrentRescheduleAndPaySerialise` (follow `BookingConcurrencyTest` latch pattern): thread A `recordPayment` on a PENDING row, thread B `rescheduleBooking`. Whatever the order, `sum(non-VOID) == total` and no row is both ENTERED and VOID.
- [ ] **Step 2: Run:** `mvn test -Dtest=BookingRescheduleIntegrationTest` (expect PASS; fix Task 2 if not).
- [ ] **Step 3: Full booking package regression:** `mvn test -Dtest='Booking*Test,*Emi*Test,Overdue*Test,PlotBooking*Test,V4*MigrationTest'`. The ~55 spurious Mockito/JDK errors are a known baseline: diff against master, don't chase them.
- [ ] **Step 4: Commit** (`test(booking): reschedule persistence, reports and concurrency`).

---

### Task 5: Frontend service, model and util

**Files:**
- Modify: `bookings-emi.model.ts`, `bookings-emi.service.ts`, `bookings-emi.util.ts`
- Test: `bookings-emi.service.spec.ts`, `bookings-emi.util.spec.ts`

**Interfaces:**
- Produces:
  - `export interface RescheduleRequest { installmentCount: number; firstDueDate: string; }` (model)
  - `BookingsEmiService.reschedule(id: string, req: RescheduleRequest): Observable<Booking>` doing `POST /api/admin/bookings/${id}/reschedule`.
  - `export function previewSchedule(balance: number, count: number, firstDue: string): { n: number; dueDate: string; amount: number }[]`: pure, integer cents, `n` is 1-based within the preview, dates formatted `YYYY-MM-DD` via `Date.UTC` month arithmetic from the first date. It clamps the day to the target month's last day, matching Java's `plusMonths`. Returns `[]` when `count < 1`, `balance <= 0`, or the date is invalid.
  - `ErrorKind` gains `'noBalance'`; `classifyError`'s `op` union gains `'reschedule'`.

- [ ] **Step 1: Write failing tests.** Service: `reschedule` POSTs to the URL with the body. Util: `previewSchedule(70000, 3, '2026-11-05')` -> 23333.33, 23333.33, 23333.34 on 2026-11-05 / 2026-12-05 / 2027-01-05; `(100, 3, '2026-01-31')` -> due 01-31, 02-28, 03-31; `(0.05, 60, ...)` -> amounts with base 0 returns `[]`; `classifyError({status:409,error:{code:'NO_REMAINING_BALANCE'}}, 'reschedule')` -> `noBalance`; a 400 for `reschedule` -> `validation` with `serverText`; 409 `not ACTIVE` -> `notActive`; status 0 -> `network`.
- [ ] **Step 2: Run, expect FAIL:** `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include='src/app/admin/admin-bookings-emi/bookings-emi.{service,util}.spec.ts'`
- [ ] **Step 3: Implement** the above. In `classifyError`'s 409 branch add, before the `Plot is not available` check, `if (err.error?.code === 'NO_REMAINING_BALANCE') { return done('noBalance'); }`.
- [ ] **Step 4: Run, expect PASS** (same command).
- [ ] **Step 5: Commit** (`feat(admin-bookings-emi): reschedule service call and schedule preview util`).

### Task 6: Reschedule mode in `booking-seal`

**Files:**
- Modify: `booking-seal.component.ts`
- Test: `booking-seal.component.spec.ts` (follow the existing `transfer`/`cancel` specs near lines 212 and 270)

**Interfaces:**
- Consumes: Task 5's `service.reschedule`, `previewSchedule`, `RescheduleRequest`, `ErrorKind 'noBalance'`.
- Produces: `Mode` gains `'reschedule'`. Component fields `rsCount = ''` (string, bound to the number input), `rsFirstDue = ''` (`YYYY-MM-DD`). Getters `pendingSum` (sum of PENDING amounts), `rsPreview` (previewSchedule result), `rsCountInvalid`, `rsDateInvalid`. Method `submitReschedule()`.

- [ ] **Step 1: Write failing tests:**
  1. The Reschedule button is disabled when the booking is not ACTIVE, when `busy`, or when no instalment is PENDING; enabled for ACTIVE with PENDING rows. It carries `data-opener="reschedule"` and sits between Confirm and Transfer in DOM order.
  2. `open('reschedule')` shows the form: a number input (`name="installmentCount"`, `min=1 max=60`), a date input (`name="firstDueDate"`, `type="date"`, `[min]` = today local), and the effects list. Title focused.
  3. Validation: empty or 0 or 61 count, or a date before today, or an empty date, show `app-field-error` text (`tried` set), set `aria-invalid`, and issue NO http request (`expectNone`).
  4. Preview: with pending rows 35000 + 35000 and count 3, the preview table shows 3 rows with the expected amounts and a total row equal to 70000 (assert text via `money()`).
  5. Submit sends `POST .../reschedule` with `{installmentCount: 3, firstDueDate: '2026-11-05'}`, flushes the updated booking, emits `updated` and `flash` (`admin.bookingsEmi.ok.reschedule`), returns to detail mode and refocuses the opener.
  6. Double submit sends one request (`busy` guard); inputs and buttons are disabled while busy (fieldset `[disabled]`) and `busyChange` emits true then false.
  7. Errors: 409 not ACTIVE -> danger banner, `reloadRequested` emitted; 409 `NO_REMAINING_BALANCE` -> `err.noBalance` text; 400 -> generic text + `serverSaid` line; status 0 -> generic network text, the form stays open, no `netUnknown` lock (reschedule's outcome is re-checkable by Reload and a repeat is safe, unlike pay).
  8. `ngOnChanges`: while the reschedule form is open, a refreshed booking that is no longer ACTIVE closes the form (the existing `gone` rule already covers `status !== 'ACTIVE'` for non-pay modes; assert it).
- [ ] **Step 2: Run, expect FAIL:** `npx ng test --watch=false --browsers=ChromeHeadless --include='src/app/admin/admin-bookings-emi/booking-seal.component.spec.ts'`
- [ ] **Step 3: Implement.**
  - Types and wiring: add `'reschedule'` to `type Mode`, to `open()`'s mode union, to `run()`'s op union (and to `classifyError`'s `op`), to `onSubmit`, to the `labels` map in `submitLabel` as `reschedule: ['rescheduleBtn', 'rescheduling']`, and to the title lookup (`seal.reschedule`). `open()` also resets `rsCount = ''; rsFirstDue = ''`.
  - Action button in `.booking-seal__actions`, directly after Confirm:

```html
<button type="button" class="brand-button brand-button--secondary booking-seal__action"
  [disabled]="b.status !== 'ACTIVE' || busy || pendingCount === 0"
  [attr.aria-describedby]="b.status !== 'ACTIVE' ? 'seal-locked-reason' : null"
  data-opener="reschedule" (click)="open('reschedule')">{{ 'admin.bookingsEmi.action.reschedule' | translate }}</button>
```

  - Form block (placed with the other mode blocks inside the existing `<form>`, so the banner, submit and back buttons are reused):

```html
<ng-container *ngIf="mode === 'reschedule'">
  <ul class="booking-seal__effects">
    <li>{{ 'admin.bookingsEmi.rescheduleEffects.0' | translate: { count: pendingCount, amount: money(pendingSum) } }}</li>
    <li>{{ 'admin.bookingsEmi.rescheduleEffects.1' | translate }}</li>
    <li>{{ 'admin.bookingsEmi.rescheduleEffects.2' | translate }}</li>
  </ul>
  <fieldset class="booking-seal__fields" [disabled]="busy">
    <label>{{ 'admin.bookingsEmi.field.installmentCount' | translate }}
      <input name="installmentCount" type="number" inputmode="numeric" min="1" max="60" step="1"
        [attr.aria-invalid]="rsCountInvalid ? 'true' : null" aria-describedby="seal-count-hint seal-count-error"
        [value]="rsCount" (input)="rsCount = $any($event.target).value" /></label>
    <small id="seal-count-hint">{{ 'admin.bookingsEmi.field.installmentCountHint' | translate }}</small>
    <app-field-error id="seal-count-error" [message]="rsCountInvalid ? ('admin.bookingsEmi.validation.count' | translate) : undefined"></app-field-error>
    <label>{{ 'admin.bookingsEmi.field.firstDueDate' | translate }}
      <input name="firstDueDate" type="date" [min]="today" [attr.aria-invalid]="rsDateInvalid ? 'true' : null"
        aria-describedby="seal-date-error" [value]="rsFirstDue" (input)="rsFirstDue = $any($event.target).value" /></label>
    <app-field-error id="seal-date-error" [message]="rsDateInvalid ? ('admin.bookingsEmi.validation.firstDue' | translate) : undefined"></app-field-error>
  </fieldset>
  <div class="booking-reschedule__preview" *ngIf="rsPreview.length" role="status" aria-live="polite">
    <h3 class="booking-reschedule__heading">{{ 'admin.bookingsEmi.reschedulePreview' | translate }}</h3>
    <table class="booking-seal__table">
      <thead><tr><th>{{ 'admin.bookingsEmi.col.no' | translate }}</th><th>{{ 'admin.bookingsEmi.col.dueDate' | translate }}</th><th>{{ 'admin.bookingsEmi.col.amount' | translate }}</th></tr></thead>
      <tbody><tr *ngFor="let p of rsPreview"><td>{{ p.n }}</td><td>{{ p.dueDate | date: 'mediumDate' }}</td><td>{{ money(p.amount) }}</td></tr></tbody>
    </table>
  </div>
</ng-container>
```

  - Logic: `today` = local `YYYY-MM-DD` (build from `new Date()` components, not `toISOString`, so a late-evening IST user is not off by a day; the server's UTC "today" can be one day behind local, so a local-today date is always accepted). `pendingSum` = sum of `PENDING` amounts. `rsPreview` = `previewSchedule(this.pendingSum, +this.rsCount, this.rsFirstDue)` only when the count is a valid integer 1..60. `rsCountInvalid` = `tried && !(Number.isInteger(n) && n >= 1 && n <= 60)`. `rsDateInvalid` = `tried && (!rsFirstDue || rsFirstDue < today)`.

```ts
submitReschedule(): void {
  if (this.busy || !this.booking) { return; }
  this.tried = true;
  const n = Number(this.rsCount);
  if (!Number.isInteger(n) || n < 1 || n > 60 || !this.rsFirstDue || this.rsFirstDue < this.today) { return; }
  this.run('reschedule', this.service.reschedule(this.booking.id, { installmentCount: n, firstDueDate: this.rsFirstDue }),
    r => ({ key: 'admin.bookingsEmi.ok.reschedule', params: { buyer: r.buyerName, count: n } }));
}
```

  - Error banner: `bannerKey` already falls through to `'err.' + kind` for `noBalance`. Because there is no `payTarget` for this mode, the existing `network` case returns `generic`.
  - Styles: new file `booking-seal-reschedule.scss` with only `.booking-reschedule__preview` (top margin, `max-height` with `overflow-y: auto`, tokens only) and `.booking-reschedule__heading` (font from tokens). Change `styleUrls` to `['./booking-seal.component.scss', './booking-seal-reschedule.scss']`. Do NOT edit `booking-seal.component.scss`.
- [ ] **Step 4: Run, expect PASS** (same command as Step 2).
- [ ] **Step 5: Commit** (`feat(admin-bookings-emi): Reschedule action in booking seal`).

### Task 7: i18n (en + hi) and build

**Files:**
- Modify: `frontend/src/assets/i18n/en.json` and `hi.json`, both under `admin.bookingsEmi`.

**Keys to add** (`hi.json` mirrors the English values, per project convention):
- `seal.reschedule`: "Reschedule instalments"
- `action.reschedule`: "Reschedule"; `action.rescheduleBtn`: "Reschedule instalments"; `action.rescheduling`: "Rescheduling…"
- `field.installmentCount`: "New number of instalments"; `field.installmentCountHint`: "Between 1 and 60, billed monthly."; `field.firstDueDate`: "First due date"
- `validation.count`: "Enter a whole number from 1 to 60."; `validation.firstDue`: "Pick today or a later date."
- `rescheduleEffects`: `["{{count}} pending instalments ({{amount}}) will be voided and replaced by the new schedule.", "Paid and entered payments and the token stay as they are.", "The booking stays Active. The remaining balance is split evenly; the last instalment takes any rounding."]`
- `reschedulePreview`: "New schedule"
- `err.noBalance`: "Nothing is left to reschedule. Every instalment is already paid or entered."
- `ok.reschedule`: "{{buyer}}: remaining balance rescheduled over {{count}} instalments."

- [ ] **Step 1:** Add the keys to both files. If the repo has an i18n key-parity spec (search `frontend/src` for specs reading `hi.json`), run it; Task 6's tests already render these keys through the translate pipe.
- [ ] **Step 2:** `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include='src/app/admin/admin-bookings-emi/**/*.spec.ts'`, expect PASS.
- [ ] **Step 3:** `npx ng build` and confirm no new budget warning for `booking-seal` (the new stylesheet should keep the old one's size unchanged; the 1MB initial budget is lazy-route-safe).
- [ ] **Step 4: Commit** (`feat(i18n): reschedule strings (en, hi)`).

### Task 8: Full verification (after both streams merge)

- [ ] **Step 1:** `cd backend && mvn test` and compare failures against the master baseline (about 55 spurious Mockito/JDK errors are known). There must be no new failures.
- [ ] **Step 2:** `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless` and then `npx ng build`.
- [ ] **Step 3: Manual checklist** (run skill: DB on 5434, backend, frontend on port 4201; log in as `admin`):
  - Open an ACTIVE booking with a token, one ENTERED, and 2+ PENDING rows. Reschedule is enabled; it is disabled and explained for CONFIRMED and CANCELLED.
  - Count 3 with a first due date of today. The preview total equals the pending amount. Submit. Old PENDING rows show VOID (struck-through), 3 new PENDING rows follow, and Paid and Due totals are unchanged.
  - Try count 0 and 61 and a past date: inline field errors, no request in the network tab.
  - Reschedule a booking whose rows are all paid or entered: the button is disabled (no PENDING). Via a stale panel, the server returns the `noBalance` banner.
  - Enter a payment on a new row and confirm it. Overdue tab: a previously overdue booking is gone. EMI by last date: appears under the new last date.
  - `booking_event` has one `RESCHEDULED` row with the detail text. Log in as `VP00001`: no Reschedule UI, and a direct POST returns 403.
  - Keyboard and a11y: focus lands on the title when the form opens and returns to the Reschedule button on Back; errors are announced (`role=alert`); layout holds at 400px. Screenshot against DESIGN.md (tokens only, Oxblood primary submit).

## Self-Review

- Spec coverage: validation (Task 2 and 3), concurrency (Task 2 test 9, Task 4), event type + CHECK + real-DB test (Task 1, 4), response shape (Task 3), reports and AUTO_THRESHOLD (Task 4), frontend form/preview/confirm/errors/locking/i18n/a11y (Task 6, 7, 8). Admin-only has an explicit `SecurityConfigTest` (Task 3).
- Names used across tasks: `RescheduleRequest`, `rescheduleBooking`, `NothingToRescheduleException`, `InvalidRescheduleException`, `RESCHEDULED`, `NO_REMAINING_BALANCE`, `noBalance`, `previewSchedule`, `rsCount`/`rsFirstDue`, `submitReschedule` are consistent.

## Open Questions

1. Count cap of 60 is a new constant (no existing limit). Confirm it is acceptable.
2. Balance of 0 returns 409 (not 400) with `NO_REMAINING_BALANCE`; the UI also pre-disables the button when no PENDING rows exist.
3. `booking.installmentCount` becomes the number of non-VOID rows after reschedule. The seal "Plan" line shows `count x installments[0].amount` (the token), a pre-existing quirk this unit does not change.
4. Reschedule is intentionally not idempotent (each call is audited). Say so if a client-supplied idempotency key is wanted.
