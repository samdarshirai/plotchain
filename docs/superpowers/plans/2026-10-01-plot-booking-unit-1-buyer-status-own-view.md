# Plot Booking Unit 1: Buyer Details, ACTIVE Status, Associate Own View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bookings carry buyer details and an `ACTIVE` status, the whole plot-booking-lifecycle schema lands in one migration, and `GET /api/associates/me/bookings` returns status, buyer name, paid/due amounts and per-installment status/paidAt/overdue.

**Architecture:** One Flyway migration (`V41`) adds every column/table the later units (2-9) need. `PlotBooking`/`EmiInstallment` entities gain status enums with field-initializer defaults so existing code paths keep working. Overdue is derived at response-build time in `BookingService` from an injected `java.time.Clock` (the existing bean from `EPinConfig`). Shared exception types, their handler mappings and `PlotBookingRepository.findByIdForUpdate` are defined here for units 2-9.

**Tech Stack:** Spring Boot 3 / JPA / Flyway / H2 (tests, PostgreSQL mode) / JUnit5 + Mockito + AssertJ; Angular + Karma/Jasmine.

**Spec:** `docs/superpowers/specs/role-capability/2026-10-01-plot-booking-lifecycle-design.md` (Decisions 7, 9, 11, 12; Data model; Flows "Associate own view"; Error handling; Testing; "Resolved decisions (post-slice)"). Unit source: `docs/superpowers/plans/2026-10-01-plot-booking-units.md`, unit 1.

## Global Constraints

- Migration is `backend/src/main/resources/db/migration/V41__plot_booking_lifecycle.sql` (latest existing is `V40__epin_extension.sql`, verified). It must run on both PostgreSQL and H2 (`MODE=PostgreSQL`): no `UPDATE ... FROM`, use correlated subqueries.
- `plot_booking.status` values exactly `ACTIVE`/`CONFIRMED`/`CANCELLED`, default `ACTIVE`; `emi_installment.status` exactly `PENDING`/`PAID`/`VOID`, default `PENDING`; `booking_event.type` exactly `PAID`/`CONFIRMED`/`CANCELLED`/`TRANSFERRED`. All enforced by DB CHECK constraints.
- Overdue = `status = PENDING` and `due_date < today (UTC)`; derived, never stored; no batch job (Decision 7).
- Pagination clamps `page >= 0`, `size <= 100` (already done in `AssociateBookingController`; do not change).
- All writes ADMIN-only via existing `/api/admin/**` rules; associate token 403, unauthenticated 401 (Decision 12). No `SecurityConfig` edit is needed.
- `Sale.java` change is minimal: one `bookingId` field + getter/setter. No `SaleService` change.
- DB-enum-CHECK lesson (memory: self_performance_bonus_spec_status): constraint tests must hit the real DB with raw invalid strings, not Java enums.
- Column widths must not exceed `sale`'s so a later confirm can copy them: `buyer_name VARCHAR(200)`, `buyer_phone VARCHAR(20)` (V16).
- Backend test env noise: `mvn test` on the whole module shows ~55 spurious Mockito errors (JDK21/25 mismatch) plus 4 pre-existing `JwtServiceTest`/`SecretsEncryptionServiceTest` failures. Do not run the whole suite to judge this work; run the targeted classes named in each task and treat only failures inside them as real. Run from `/Users/ronalisenapati/Ronali/plotchain/backend`.
- No commit is made by the plan author. Commit steps below are for the executor, each ending with the trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- Blank/whitespace-only `buyerName` (`"   "`) must 400, not be stored (`@NotBlank`, Task 2 test).
- `buyerName` > 200 chars or `buyerPhone` > 20 chars must 400, not surface as a 500 from the DB column width (`@Size`, Task 2 test).
- Installment due exactly today is NOT overdue; due yesterday is (strict `<`, Task 3 test with fixed Clock).
- `PAID` and `VOID` installments with a past due date must never be flagged overdue (Task 3 test).
- A `CANCELLED` booking's `dueAmount` must not count `VOID` installments (Task 3 test).
- Pre-existing bookings (rows created before V41) get `buyer_name` from the associate and status `ACTIVE` (Task 1 migration backfill; verified by the NOT NULL + manual check step).

## File Structure

- Create `backend/src/main/resources/db/migration/V41__plot_booking_lifecycle.sql`: whole schema change.
- Create `booking/BookingStatus.java`, `booking/InstallmentStatus.java`: enums.
- Modify `booking/PlotBooking.java`, `booking/EmiInstallment.java`: new columns/accessors.
- Modify `sales/Sale.java`: `bookingId` mapping only.
- Modify `booking/CreateBookingRequest.java`, `BookingResponse.java`, `EmiInstallmentResponse.java`, `BookingService.java`, `BookingExceptionHandler.java`, `PlotBookingRepository.java`.
- Create five exception classes in `booking/`.
- Tests under `backend/src/test/java/com/plotchain/booking/` plus `auth/SecurityConfigTest.java`.
- Frontend: `frontend/src/app/plot-bookings/models/associate-booking-page.model.ts` and `plot-bookings.component.spec.ts`.

All backend paths below are relative to `backend/src/main/java/com/plotchain/` (main) or `backend/src/test/java/com/plotchain/` (test).

---

### Task 1: Migration, enums, entity mappings, DB constraint tests

**Files:**
- Create: `backend/src/main/resources/db/migration/V41__plot_booking_lifecycle.sql`
- Create: `booking/BookingStatus.java`, `booking/InstallmentStatus.java`
- Modify: `booking/PlotBooking.java`, `booking/EmiInstallment.java`, `sales/Sale.java`
- Test: `booking/PlotBookingSchemaTest.java` (new, `@DataJpaTest`)

**Interfaces:**
- Produces: `BookingStatus {ACTIVE, CONFIRMED, CANCELLED}`, `InstallmentStatus {PENDING, PAID, VOID}`; `PlotBooking` accessors `getStatus/setStatus(BookingStatus)` (default `ACTIVE`), `getBuyerName/setBuyerName(String)`, `getBuyerPhone/setBuyerPhone(String)`, `getConfirmedAt/setConfirmedAt(Instant)`, `getCancelledAt/setCancelledAt(Instant)`, `getCancelReason/setCancelReason(String)`, `getSaleId/setSaleId(UUID)`; `EmiInstallment` accessors `getStatus/setStatus(InstallmentStatus)` (default `PENDING`), `getPaidAt/setPaidAt(Instant)`, `getPaymentRef/setPaymentRef(String)`, `getRecordedBy/setRecordedBy(UUID)`; `Sale.getBookingId/setBookingId(UUID)`. No `BookingEvent` entity is created here (units 2+ add it when they first write events); the table exists.

- [ ] **Step 1: Write the failing DB test**

Create `booking/PlotBookingSchemaTest.java`. Fixture helpers mirror `sales/SaleRepositoryTest` (`persistProject`, `persistPlot`, `persistAssociate` with `AssociateRole.ADMIN`, `persistCycle`); copy them verbatim into this class (plot status `BOOKED`). Then:

```java
@DataJpaTest
@ActiveProfiles("test")
class PlotBookingSchemaTest {

    @Autowired PlotBookingRepository plotBookingRepository;
    @Autowired EmiInstallmentRepository emiInstallmentRepository;
    @Autowired com.plotchain.sales.SaleRepository saleRepository;
    @Autowired TestEntityManager entityManager;
    @Autowired JdbcTemplate jdbc;

    // ... persistProject/persistPlot/persistAssociate/persistCycle copied from SaleRepositoryTest ...

    private PlotBooking persistBooking() {
        UUID plotId = persistPlot(persistProject());
        PlotBooking b = new PlotBooking();
        b.setId(UUID.randomUUID());
        b.setPlotId(plotId);
        b.setAssociateId(persistAssociate());
        b.setBuyerName("Jane Buyer");
        b.setTotalAmount(new BigDecimal("600000.00"));
        b.setInstallmentCount(1);
        b.setBookedAt(Instant.now());
        return plotBookingRepository.saveAndFlush(b);
    }

    private EmiInstallment persistInstallment(UUID bookingId) {
        EmiInstallment i = new EmiInstallment();
        i.setId(UUID.randomUUID());
        i.setBookingId(bookingId);
        i.setInstallmentNumber(1);
        i.setAmount(new BigDecimal("600000.00"));
        i.setDueDate(LocalDate.of(2026, 1, 1));
        return emiInstallmentRepository.saveAndFlush(i);
    }

    @Test
    void newBookingDefaultsToActiveAndNewInstallmentToPending() {
        PlotBooking b = persistBooking();
        EmiInstallment i = persistInstallment(b.getId());
        entityManager.clear();
        assertThat(plotBookingRepository.findById(b.getId()).orElseThrow().getStatus()).isEqualTo(BookingStatus.ACTIVE);
        assertThat(emiInstallmentRepository.findById(i.getId()).orElseThrow().getStatus()).isEqualTo(InstallmentStatus.PENDING);
    }

    @Test
    void dbRejectsAnInvalidPlotBookingStatus() {
        PlotBooking b = persistBooking();
        assertThatThrownBy(() -> jdbc.update("UPDATE plot_booking SET status = 'BOGUS' WHERE id = ?", b.getId()))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void dbRejectsAnInvalidEmiInstallmentStatus() {
        EmiInstallment i = persistInstallment(persistBooking().getId());
        assertThatThrownBy(() -> jdbc.update("UPDATE emi_installment SET status = 'BOGUS' WHERE id = ?", i.getId()))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void dbRejectsAnInvalidBookingEventType() {
        PlotBooking b = persistBooking();
        assertThatThrownBy(() -> jdbc.update(
            "INSERT INTO booking_event (id, booking_id, type, actor_id, created_at) VALUES (?, ?, 'BOGUS', ?, CURRENT_TIMESTAMP)",
            UUID.randomUUID(), b.getId(), b.getAssociateId()))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void bookingEventAcceptsEveryValidType() {
        PlotBooking b = persistBooking();
        for (String type : List.of("PAID", "CONFIRMED", "CANCELLED", "TRANSFERRED")) {
            jdbc.update("INSERT INTO booking_event (id, booking_id, type, actor_id, detail, created_at) VALUES (?, ?, ?, ?, NULL, CURRENT_TIMESTAMP)",
                UUID.randomUUID(), b.getId(), type, b.getAssociateId());
        }
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM booking_event WHERE booking_id = ?", Integer.class, b.getId())).isEqualTo(4);
    }

    @Test
    void dbRejectsTwoSalesLinkedToTheSameBooking() {
        PlotBooking b = persistBooking();
        UUID cycleId = persistCycle();
        saleRepository.saveAndFlush(saleFor(b, cycleId));
        assertThatThrownBy(() -> saleRepository.saveAndFlush(saleFor(b, cycleId)))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void manySalesWithANullBookingIdAreAllowed() {
        UUID cycleId = persistCycle();
        PlotBooking b = persistBooking();
        Sale one = saleFor(b, cycleId); one.setBookingId(null);
        Sale two = saleFor(b, cycleId); two.setBookingId(null);
        saleRepository.saveAndFlush(one);
        saleRepository.saveAndFlush(two);
    }

    // Field set copied from SaleRepositoryTest.persistSale; plotId/projectId taken from the booking's plot.
    private Sale saleFor(PlotBooking b, UUID cycleId) {
        Sale s = new Sale();
        s.setId(UUID.randomUUID());
        s.setPlotId(b.getPlotId());
        s.setProjectId(entityManager.find(Plot.class, b.getPlotId()).getProjectId());
        s.setAssociateId(b.getAssociateId());
        s.setBuyerName("Jane Buyer");
        s.setNote("Confirmed from booking " + b.getId());
        s.setAmount(b.getTotalAmount());
        s.setCycleId(cycleId);
        s.setLegCredited("L");
        s.setStatus(SaleStatus.ACTIVE);
        s.setRecordedAt(Instant.now());
        s.setBookingId(b.getId());
        return s;
    }
}
```

Executor note: check the `SaleStatus` constant names and `Plot#getProjectId` in the real code (`SaleRepositoryTest` uses a `SaleStatus` parameter; use its non-void value) and add the imports (`DataIntegrityViolationException`, `JdbcTemplate`, entities, `SaleStatus`).

- [ ] **Step 2: Run to verify it fails**

Run: `mvn -q test -Dtest=PlotBookingSchemaTest`
Expected: compile FAIL (`BookingStatus`, `setBuyerName`, `setBookingId` not defined).

- [ ] **Step 3: Write the migration**

`V41__plot_booking_lifecycle.sql`:

```sql
-- plot-booking-lifecycle unit 1 (docs/superpowers/specs/role-capability/2026-10-01-plot-booking-lifecycle-design.md,
-- Data model). One migration for the whole spec: units 2-9 all build on these columns.

ALTER TABLE plot_booking ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE plot_booking ADD CONSTRAINT chk_plot_booking_status
    CHECK (status IN ('ACTIVE','CONFIRMED','CANCELLED'));
ALTER TABLE plot_booking ADD COLUMN buyer_name VARCHAR(200);
UPDATE plot_booking SET buyer_name =
    (SELECT a.name FROM associate a WHERE a.id = plot_booking.associate_id);
ALTER TABLE plot_booking ALTER COLUMN buyer_name SET NOT NULL;
ALTER TABLE plot_booking ADD COLUMN buyer_phone VARCHAR(20);
ALTER TABLE plot_booking ADD COLUMN confirmed_at TIMESTAMP;
ALTER TABLE plot_booking ADD COLUMN cancelled_at TIMESTAMP;
ALTER TABLE plot_booking ADD COLUMN cancel_reason VARCHAR(255);
ALTER TABLE plot_booking ADD COLUMN sale_id UUID REFERENCES sale(id);

ALTER TABLE emi_installment ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'PENDING';
ALTER TABLE emi_installment ADD CONSTRAINT chk_emi_installment_status
    CHECK (status IN ('PENDING','PAID','VOID'));
ALTER TABLE emi_installment ADD COLUMN paid_at TIMESTAMP;
ALTER TABLE emi_installment ADD COLUMN payment_ref VARCHAR(100);
ALTER TABLE emi_installment ADD COLUMN recorded_by UUID REFERENCES associate(id);

ALTER TABLE sale ADD COLUMN booking_id UUID REFERENCES plot_booking(id);
-- Unique only when non-null: both PostgreSQL and H2 allow many NULLs in a unique index.
CREATE UNIQUE INDEX uq_sale_booking_id ON sale(booking_id);

CREATE TABLE booking_event (
    id UUID PRIMARY KEY,
    booking_id UUID NOT NULL REFERENCES plot_booking(id),
    type VARCHAR(16) NOT NULL,
    actor_id UUID NOT NULL REFERENCES associate(id),
    detail VARCHAR(500),
    created_at TIMESTAMP NOT NULL,
    CONSTRAINT chk_booking_event_type CHECK (type IN ('PAID','CONFIRMED','CANCELLED','TRANSFERRED'))
);
CREATE INDEX idx_booking_event_booking_id ON booking_event(booking_id);
```

(`associate.name` is `NOT NULL VARCHAR(200)` per V1, so the backfill needs no COALESCE.)

- [ ] **Step 4: Write enums and entity mappings**

`BookingStatus.java`: `public enum BookingStatus { ACTIVE, CONFIRMED, CANCELLED }`. `InstallmentStatus.java`: `public enum InstallmentStatus { PENDING, PAID, VOID }`.

`PlotBooking.java` add (imports `jakarta.persistence.EnumType`, `Enumerated`):

```java
@Enumerated(EnumType.STRING)
@Column(nullable = false)
private BookingStatus status = BookingStatus.ACTIVE;
@Column(name = "buyer_name", nullable = false)
private String buyerName;
@Column(name = "buyer_phone")
private String buyerPhone;
@Column(name = "confirmed_at")
private Instant confirmedAt;
@Column(name = "cancelled_at")
private Instant cancelledAt;
@Column(name = "cancel_reason")
private String cancelReason;
@Column(name = "sale_id")
private UUID saleId;
```
plus the getter/setter pairs listed under Interfaces, in the file's existing one-line style.

`EmiInstallment.java` add:

```java
@Enumerated(EnumType.STRING)
@Column(nullable = false)
private InstallmentStatus status = InstallmentStatus.PENDING;
@Column(name = "paid_at")
private Instant paidAt;
@Column(name = "payment_ref")
private String paymentRef;
@Column(name = "recorded_by")
private UUID recordedBy;
```
plus accessors.

`sales/Sale.java` add only:

```java
@Column(name = "booking_id")
private UUID bookingId;
public UUID getBookingId() { return bookingId; }
public void setBookingId(UUID bookingId) { this.bookingId = bookingId; }
```

- [ ] **Step 5: Run to verify it passes**

Run: `mvn -q test -Dtest=PlotBookingSchemaTest,SaleRepositoryTest`
Expected: PASS (`SaleRepositoryTest` proves the `Sale` mapping did not break validate).

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/resources/db/migration/V41__plot_booking_lifecycle.sql backend/src/main/java/com/plotchain/booking backend/src/main/java/com/plotchain/sales/Sale.java backend/src/test/java/com/plotchain/booking/PlotBookingSchemaTest.java
git commit -m "feat(booking): V41 lifecycle schema, status enums and entity mappings"
```

Note for the executor: between this task and Task 2, `BookingConcurrencyTest` (real `createBooking`) is red because `buyer_name` is NOT NULL and `createBooking` does not set it yet. That is expected; Task 2 fixes it.

---

### Task 2: `buyerName`/`buyerPhone` on create, new bookings ACTIVE

**Files:**
- Modify: `booking/CreateBookingRequest.java`, `booking/BookingService.java` (`createBooking`, `toResponse` untouched here)
- Modify (fixtures for the new request shape): `booking/BookingServiceTest.java`, `booking/BookingControllerTest.java`, `booking/BookingConcurrencyTest.java`, `auth/SecurityConfigTest.java`
- Test: `booking/BookingControllerTest.java`, `booking/BookingServiceTest.java`

**Interfaces:**
- Consumes: `PlotBooking.setBuyerName/setBuyerPhone`, `BookingStatus` (Task 1).
- Produces: `record CreateBookingRequest(UUID plotId, UUID associateId, String buyerName, String buyerPhone)` (field order exactly this); persisted booking has `buyerName`/`buyerPhone` and status `ACTIVE`.

- [ ] **Step 1: Write the failing tests**

In `BookingControllerTest`, change `REQUEST_BODY` to `{"plotId":"%s","associateId":"%s","buyerName":"Jane Buyer"}` (existing tests keep passing with 2 format args) and add:

```java
@Test
void createReturns400WhenBuyerNameIsMissing() throws Exception {
    mockMvc.perform(post("/api/admin/bookings")
            .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
            .contentType("application/json")
            .content("{\"plotId\":\"%s\",\"associateId\":\"%s\"}".formatted(UUID.randomUUID(), UUID.randomUUID())))
        .andExpect(status().isBadRequest());
}

@Test
void createReturns400WhenBuyerNameIsWhitespaceOnly() throws Exception {
    mockMvc.perform(post("/api/admin/bookings")
            .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
            .contentType("application/json")
            .content("{\"plotId\":\"%s\",\"associateId\":\"%s\",\"buyerName\":\"   \"}".formatted(UUID.randomUUID(), UUID.randomUUID())))
        .andExpect(status().isBadRequest());
}

@Test
void createReturns400WhenBuyerNameOrPhoneExceedTheColumnWidths() throws Exception {
    String longName = "x".repeat(201);
    mockMvc.perform(post("/api/admin/bookings")
            .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
            .contentType("application/json")
            .content("{\"plotId\":\"%s\",\"associateId\":\"%s\",\"buyerName\":\"%s\"}".formatted(UUID.randomUUID(), UUID.randomUUID(), longName)))
        .andExpect(status().isBadRequest());
    mockMvc.perform(post("/api/admin/bookings")
            .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
            .contentType("application/json")
            .content("{\"plotId\":\"%s\",\"associateId\":\"%s\",\"buyerName\":\"Jane\",\"buyerPhone\":\"%s\"}".formatted(UUID.randomUUID(), UUID.randomUUID(), "9".repeat(21))))
        .andExpect(status().isBadRequest());
}
```

In `BookingServiceTest`, change `requestFor` to `new CreateBookingRequest(plotId, associateId, "Jane Buyer", "9999999999")` and add (using the existing `stubHappyPathGuardsAndDependencies` + `ArgumentCaptor<PlotBooking>` pattern already used in that file):

```java
@Test
void createBookingPersistsBuyerDetailsAndStartsActive() {
    stubHappyPathGuardsAndDependencies("600000.00", emiConfig(true, 4));

    bookingService.createBooking(requestFor(PLOT_ID, ASSOCIATE_ID));

    ArgumentCaptor<PlotBooking> captor = ArgumentCaptor.forClass(PlotBooking.class);
    verify(plotBookingRepository).save(captor.capture());
    assertThat(captor.getValue().getBuyerName()).isEqualTo("Jane Buyer");
    assertThat(captor.getValue().getBuyerPhone()).isEqualTo("9999999999");
    assertThat(captor.getValue().getStatus()).isEqualTo(BookingStatus.ACTIVE);
}
```

In `BookingConcurrencyTest.bookingRequestFor` and `SecurityConfigTest` (line ~534) use `new CreateBookingRequest(..., ..., "Jane Buyer", null)`.

- [ ] **Step 2: Run to verify failure**

Run: `mvn -q test -Dtest=BookingControllerTest,BookingServiceTest`
Expected: compile FAIL (4-arg constructor missing).

- [ ] **Step 3: Implement**

`CreateBookingRequest.java`:

```java
public record CreateBookingRequest(
    @NotNull UUID plotId,
    @NotNull UUID associateId,
    @NotBlank @Size(max = 200) String buyerName,
    @Size(max = 20) String buyerPhone
) {}
```
(imports `jakarta.validation.constraints.NotBlank`, `Size`; keep the existing explanatory comment.) In `BookingService.createBooking`, after `booking.setTotalAmount(...)` add:

```java
booking.setBuyerName(request.buyerName().trim());
booking.setBuyerPhone(request.buyerPhone());
booking.setStatus(BookingStatus.ACTIVE);
```

- [ ] **Step 4: Run to verify pass**

Run: `mvn -q test -Dtest=BookingControllerTest,BookingServiceTest,BookingConcurrencyTest,SecurityConfigTest`
Expected: PASS for the booking classes. Compare `SecurityConfigTest` against baseline; it must show no new failures (pre-existing JWT-related failures live in `JwtServiceTest`/`SecretsEncryptionServiceTest`, not here).

- [ ] **Step 5: Commit**

```bash
git add backend/src
git commit -m "feat(booking): buyerName/buyerPhone on create, bookings start ACTIVE"
```

---

### Task 3: Own view returns status, buyer, paid/due and per-installment overdue

**Files:**
- Modify: `booking/BookingResponse.java`, `booking/EmiInstallmentResponse.java`, `booking/BookingService.java`
- Test: `booking/BookingServiceTest.java`, `booking/BookingControllerTest.java`, `booking/AssociateBookingControllerTest.java`

**Interfaces:**
- Consumes: Task 1 entities; the existing `java.time.Clock` bean (declared in `epin/EPinConfig.java`, `Clock.systemUTC()`; verified the only one). Reuse by constructor injection; do not declare a second bean (would make injection ambiguous).
- Produces (exact):
  - `record EmiInstallmentResponse(int installmentNumber, BigDecimal amount, LocalDate dueDate, InstallmentStatus status, Instant paidAt, boolean overdue)`
  - `record BookingResponse(UUID id, UUID plotId, UUID associateId, BookingStatus status, String buyerName, BigDecimal totalAmount, int installmentCount, Instant bookedAt, BigDecimal paidAmount, BigDecimal dueAmount, List<EmiInstallmentResponse> installments)`
  - `BookingService` constructor gains a trailing `Clock clock` parameter (6 args: plotRepository, associateRepository, bookingEmiConfigRepository, plotBookingRepository, emiInstallmentRepository, clock).
  - Units 8/9 reuse `BookingService.toResponse(PlotBooking, List<EmiInstallment>)` (keep it, make it package-private rather than private).

Definitions: `paidAmount` = sum of `PAID` installment amounts; `dueAmount` = sum of `PENDING` installment amounts (so VOID is excluded and a cancelled booking shows due 0). `overdue` = `status == PENDING && dueDate.isBefore(LocalDate.now(clock))`.

- [ ] **Step 1: Write the failing tests**

In `BookingServiceTest`: add `static final Instant NOW = Instant.parse("2026-06-15T10:00:00Z");` and `Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);`; update `setUp` to pass `clock` as 6th arg. Add a helper `installment(int n, String amount, LocalDate due, InstallmentStatus status)` and:

```java
@Test
void getMyBookingsFlagsOnlyPendingInstallmentsDueBeforeTodayUtcAsOverdue() {
    PlotBooking booking = bookingWithId(2);
    EmiInstallment dueYesterday = installment(1, "100.00", LocalDate.of(2026, 6, 14), InstallmentStatus.PENDING);
    EmiInstallment dueToday     = installment(2, "100.00", LocalDate.of(2026, 6, 15), InstallmentStatus.PENDING);
    EmiInstallment paidOld      = installment(3, "100.00", LocalDate.of(2026, 1, 1),  InstallmentStatus.PAID);
    EmiInstallment voidOld      = installment(4, "100.00", LocalDate.of(2026, 1, 1),  InstallmentStatus.VOID);
    stubOwnPage(booking, List.of(dueYesterday, dueToday, paidOld, voidOld));

    BookingResponse r = bookingService.getMyBookings(ASSOCIATE_ID, 0, 20).bookings().get(0);

    assertThat(r.installments()).extracting(EmiInstallmentResponse::overdue)
        .containsExactly(true, false, false, false);
}

@Test
void getMyBookingsComputesPaidAndDueAmountsAndExposesStatusAndBuyer() {
    PlotBooking booking = bookingWithId(3);
    booking.setBuyerName("Jane Buyer");
    EmiInstallment paid = installment(1, "200000.00", LocalDate.of(2026, 7, 1), InstallmentStatus.PAID);
    paid.setPaidAt(NOW);
    EmiInstallment pending = installment(2, "250000.00", LocalDate.of(2026, 8, 1), InstallmentStatus.PENDING);
    EmiInstallment voided = installment(3, "150000.00", LocalDate.of(2026, 9, 1), InstallmentStatus.VOID);
    stubOwnPage(booking, List.of(paid, pending, voided));

    BookingResponse r = bookingService.getMyBookings(ASSOCIATE_ID, 0, 20).bookings().get(0);

    assertThat(r.status()).isEqualTo(BookingStatus.ACTIVE);
    assertThat(r.buyerName()).isEqualTo("Jane Buyer");
    assertThat(r.paidAmount()).isEqualByComparingTo("200000.00");
    assertThat(r.dueAmount()).isEqualByComparingTo("250000.00");
    assertThat(r.installments().get(0).status()).isEqualTo(InstallmentStatus.PAID);
    assertThat(r.installments().get(0).paidAt()).isEqualTo(NOW);
}

@Test
void createBookingResponseIsActiveWithAllInstallmentsPendingNoneOverdueAndZeroPaid() {
    stubHappyPathGuardsAndDependencies("600000.00", emiConfig(true, 4));

    BookingResponse r = bookingService.createBooking(requestFor(PLOT_ID, ASSOCIATE_ID));

    assertThat(r.status()).isEqualTo(BookingStatus.ACTIVE);
    assertThat(r.paidAmount()).isEqualByComparingTo("0");
    assertThat(r.dueAmount()).isEqualByComparingTo("600000.00");
    assertThat(r.installments()).allMatch(i -> i.status() == InstallmentStatus.PENDING && !i.overdue());
}
```

`bookingWithId(int count)` / `stubOwnPage(booking, installments)` are small private helpers: build a `PlotBooking` like the two existing `getMyBookings` tests (buyerName "Jane Buyer", total 600000.00, status default ACTIVE), and stub `findByAssociateIdOrderByBookedAtDesc(eq(ASSOCIATE_ID), any())` / `findByBookingIdOrderByInstallmentNumberAsc`. In the two existing `getMyBookings` tests that build `EmiInstallment` without `id`/status, nothing else changes (status defaults to `PENDING`).

In `BookingControllerTest` and `AssociateBookingControllerTest`, update the `new BookingResponse(...)` / `new EmiInstallmentResponse(...)` calls to the new signatures (e.g. `bookingId, plotId, associateId, BookingStatus.ACTIVE, "Jane Buyer", new BigDecimal("600000.00"), 4, Instant.now(), BigDecimal.ZERO, new BigDecimal("600000.00"), List.of(new EmiInstallmentResponse(1, new BigDecimal("150000.00"), LocalDate.now().plusMonths(1), InstallmentStatus.PENDING, null, false))`). Add to `AssociateBookingControllerTest.getMyBookingsReturns200...` assertions:

```java
.andExpect(jsonPath("$.bookings[0].status").value("ACTIVE"))
.andExpect(jsonPath("$.bookings[0].buyerName").value("Jane Buyer"))
.andExpect(jsonPath("$.bookings[0].paidAmount").value(0))
.andExpect(jsonPath("$.bookings[0].installments[0].status").value("PENDING"))
.andExpect(jsonPath("$.bookings[0].installments[0].overdue").value(false))
```
Existing self-scope test (`eq(associateId)` from the JWT) stays and proves the endpoint is still self-scoped.

- [ ] **Step 2: Run to verify failure**

Run: `mvn -q test -Dtest=BookingServiceTest,BookingControllerTest,AssociateBookingControllerTest`
Expected: compile FAIL (signatures).

- [ ] **Step 3: Implement**

Replace the two records with the signatures above. In `BookingService` add `private final Clock clock;` + ctor param; rewrite `toResponse` (package-private):

```java
BookingResponse toResponse(PlotBooking booking, List<EmiInstallment> installments) {
    LocalDate today = LocalDate.now(clock);
    List<EmiInstallmentResponse> rows = installments.stream()
        .map(i -> new EmiInstallmentResponse(
            i.getInstallmentNumber(), i.getAmount(), i.getDueDate(), i.getStatus(), i.getPaidAt(),
            i.getStatus() == InstallmentStatus.PENDING && i.getDueDate().isBefore(today)))
        .toList();
    return new BookingResponse(
        booking.getId(), booking.getPlotId(), booking.getAssociateId(),
        booking.getStatus(), booking.getBuyerName(),
        booking.getTotalAmount(), booking.getInstallmentCount(), booking.getBookedAt(),
        sumByStatus(installments, InstallmentStatus.PAID),
        sumByStatus(installments, InstallmentStatus.PENDING),
        rows);
}

private BigDecimal sumByStatus(List<EmiInstallment> installments, InstallmentStatus status) {
    return installments.stream().filter(i -> i.getStatus() == status)
        .map(EmiInstallment::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
}
```
Add `import java.time.Clock;`. (`LocalDate.now(clock)` uses the clock's zone, UTC for the bean.)

- [ ] **Step 4: Run to verify pass**

Run: `mvn -q test -Dtest=BookingServiceTest,BookingControllerTest,AssociateBookingControllerTest,BookingConcurrencyTest`
Expected: PASS. `BookingConcurrencyTest` is `@SpringBootTest`, so passing also proves the single `Clock` bean injects into `BookingService`.

- [ ] **Step 5: Commit**

```bash
git add backend/src
git commit -m "feat(booking): own view returns status, buyer, paid/due and per-installment overdue"
```

---

### Task 4: Shared exceptions, handler mappings, `PlotBookingRepository.findByIdForUpdate`

**Files:**
- Create: `booking/BookingNotFoundException.java`, `BookingNotActiveException.java`, `InstallmentNotPayableException.java`, `InstallmentNotFoundException.java`, `SameAssociateTransferException.java`
- Modify: `booking/BookingExceptionHandler.java`, `booking/PlotBookingRepository.java`
- Test: `booking/BookingExceptionHandlerTest.java` (new, plain unit), `booking/BookingConcurrencyTest.java`

**Interfaces:**
- Produces (units 2, 4, 6, 7 consume): `new BookingNotFoundException(UUID bookingId)` -> 404; `new BookingNotActiveException(UUID bookingId)` -> 409; `new InstallmentNotPayableException(UUID bookingId, int installmentNumber)` -> 409; `new InstallmentNotFoundException(UUID bookingId, int installmentNumber)` -> 404; `new SameAssociateTransferException(UUID associateId)` -> 400. All extend `RuntimeException`. Response body `Map.of("error", message)` like the existing handler. `Optional<PlotBooking> PlotBookingRepository.findByIdForUpdate(UUID id)` with `@Lock(PESSIMISTIC_WRITE)`.

- [ ] **Step 1: Write the failing tests**

`BookingExceptionHandlerTest`:

```java
class BookingExceptionHandlerTest {
    private final BookingExceptionHandler handler = new BookingExceptionHandler();
    private final UUID id = UUID.randomUUID();

    @Test void bookingNotFoundIs404() {
        var r = handler.handleBookingNotFound(new BookingNotFoundException(id));
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(r.getBody()).containsKey("error");
    }
    @Test void bookingNotActiveIs409() {
        assertThat(handler.handleBookingNotActive(new BookingNotActiveException(id)).getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
    }
    @Test void installmentNotPayableIs409() {
        assertThat(handler.handleInstallmentNotPayable(new InstallmentNotPayableException(id, 2)).getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
    }
    @Test void installmentNotFoundIs404() {
        assertThat(handler.handleInstallmentNotFound(new InstallmentNotFoundException(id, 9)).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }
    @Test void sameAssociateTransferIs400() {
        assertThat(handler.handleSameAssociateTransfer(new SameAssociateTransferException(id)).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }
}
```

In `BookingConcurrencyTest` add (mirrors the existing holder/second pattern; booking seeded via the real service, cleanup already deletes bookings of `associateId`):

```java
@Test
void findByIdForUpdateOnABookingBlocksASecondLockerUntilTheFirstTransactionEnds() throws Exception {
    plotId = seedAvailablePlot();
    associateId = seedAssociate();
    UUID bookingId = bookingService.createBooking(bookingRequestFor(plotId, associateId)).id();

    CountDownLatch lockHeld = new CountDownLatch(1);
    CountDownLatch releaseLock = new CountDownLatch(1);
    List<String> events = Collections.synchronizedList(new ArrayList<>());
    ExecutorService pool = Executors.newFixedThreadPool(2);
    TransactionTemplate tx = new TransactionTemplate(transactionManager);

    Future<?> holder = pool.submit(() -> tx.executeWithoutResult(s -> {
        plotBookingRepository.findByIdForUpdate(bookingId).orElseThrow();
        events.add("holder-locked");
        lockHeld.countDown();
        awaitQuietly(releaseLock);
    }));
    lockHeld.await(5, TimeUnit.SECONDS);

    Future<?> second = pool.submit(() -> tx.executeWithoutResult(s -> {
        events.add("second-calling");
        plotBookingRepository.findByIdForUpdate(bookingId).orElseThrow();
        events.add("second-locked");
    }));

    Thread.sleep(300);
    assertThat(events).containsExactly("holder-locked", "second-calling");
    releaseLock.countDown();
    holder.get(5, TimeUnit.SECONDS);
    second.get(5, TimeUnit.SECONDS);
    assertThat(events).containsExactly("holder-locked", "second-calling", "second-locked");
    pool.shutdownNow();
}
```

Also add a one-line absent case: `assertThat(plotBookingRepository.findByIdForUpdate(UUID.randomUUID())).isEmpty();` in a transactional test method or inside `tx.execute` (a `@Lock` query needs a transaction).

- [ ] **Step 2: Run to verify failure**

Run: `mvn -q test -Dtest=BookingExceptionHandlerTest,BookingConcurrencyTest`
Expected: compile FAIL.

- [ ] **Step 3: Implement**

Exceptions, e.g.:

```java
public class BookingNotFoundException extends RuntimeException {
    public BookingNotFoundException(UUID bookingId) { super("Booking not found: " + bookingId); }
}
```
`BookingNotActiveException(UUID)`: `"Booking is not ACTIVE: " + id`; `InstallmentNotPayableException(UUID, int)`: `"Installment " + n + " of booking " + id + " is not payable"`; `InstallmentNotFoundException(UUID, int)`: `"Installment " + n + " not found on booking " + id`; `SameAssociateTransferException(UUID)`: `"Booking is already assigned to associate " + id`.

`BookingExceptionHandler`: add five `@ExceptionHandler` methods named as in the test (`handleBookingNotFound` 404, `handleBookingNotActive` 409, `handleInstallmentNotPayable` 409, `handleInstallmentNotFound` 404, `handleSameAssociateTransfer` 400), each `ResponseEntity.status(...).body(Map.of("error", ex.getMessage()))`. Update the class comment: these are the exception types new to the lifecycle spec; `AssociateNotFoundException` stays handled globally (unit 7 relies on that).

`PlotBookingRepository` (imports `jakarta.persistence.LockModeType`, `org.springframework.data.jpa.repository.Lock`, `Query`, `org.springframework.data.repository.query.Param`, `java.util.Optional`):

```java
// Same pessimistic-lock pattern as PlotRepository.findByIdForUpdate: must be the first statement
// of the @Transactional pay/confirm/cancel/transfer methods (Decision 8); empty Optional doubles
// as the "booking not found" check.
@Lock(LockModeType.PESSIMISTIC_WRITE)
@Query("SELECT b FROM PlotBooking b WHERE b.id = :id")
Optional<PlotBooking> findByIdForUpdate(@Param("id") UUID id);
```

- [ ] **Step 4: Run to verify pass**

Run: `mvn -q test -Dtest=BookingExceptionHandlerTest,BookingConcurrencyTest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src
git commit -m "feat(booking): shared lifecycle exceptions, handler mappings, booking row lock"
```

---

### Task 5: Security matrix for `POST /api/admin/bookings` and own-view self-scope

**Files:**
- Test: `auth/SecurityConfigTest.java`

No production change expected: `/api/admin/**` blanket write rules already cover this (Decision 12). The existing parameterised test `adminBookingsCreateIsReachableOnlyForAdminAndForbiddenForEveryOtherRole` already asserts every non-ADMIN role (including ASSOCIATE) gets 403 and was updated to the new request shape in Task 2. Missing: an unauthenticated case.

- [ ] **Step 1: Write the test**

Add beside that test:

```java
@Test
void adminBookingsCreateIsUnauthorizedWithoutAToken() throws Exception {
    String body = new ObjectMapper().writeValueAsString(
        new com.plotchain.booking.CreateBookingRequest(UUID.randomUUID(), UUID.randomUUID(), "Jane Buyer", null));
    mockMvc.perform(post("/api/admin/bookings").contentType("application/json").content(body))
        .andExpect(status().isUnauthorized());
}
```

- [ ] **Step 2: Run**

Run: `mvn -q test -Dtest=SecurityConfigTest`
Expected: PASS (it should pass immediately; it pins existing behaviour required by acceptance criteria). If it returns 403 instead of 401, mirror how other unauthenticated tests in this file assert (grep `isUnauthorized` in that file) and match them; do not edit `SecurityConfig`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java
git commit -m "test(security): pin 401 for unauthenticated POST /api/admin/bookings"
```

---

### Task 6: Frontend model and spec accept the new response fields

**Files:**
- Modify: `frontend/src/app/plot-bookings/models/associate-booking-page.model.ts`
- Modify: `frontend/src/app/plot-bookings/plot-bookings.component.spec.ts` (typed literal at ~line 189; other fixtures are untyped flush payloads)
- Modify (mocks only): `frontend/src/app/plot-bookings/plot-bookings.service.spec.ts` if it builds typed bookings (currently empty `bookings: []`, so likely no change)

No frontend caller of `POST /api/admin/bookings` exists (grepped `createBooking`/`admin/bookings` under `frontend/src`: no hits), so no `buyerName` send is needed in this unit; the admin Book form is unit 11. Displaying the new fields is unit 13; do not touch `plot-bookings.component.ts` templates or i18n.

**Interfaces:** Produces TS types `BookingStatus = 'ACTIVE' | 'CONFIRMED' | 'CANCELLED'`, `InstallmentStatus = 'PENDING' | 'PAID' | 'VOID'`; `EmiInstallment` gains `status: InstallmentStatus; paidAt: string | null; overdue: boolean`; `Booking` gains `status: BookingStatus; buyerName: string; paidAmount: number; dueAmount: number`. Unit 13 consumes these.

- [ ] **Step 1: Make the spec fail to compile**

In `plot-bookings.component.spec.ts` update the typed assignment to include the new fields:

```ts
fixture.componentInstance.selectedBooking = {
  id: 'b1', plotId: 'plot-1', associateId: 'a1', status: 'ACTIVE', buyerName: 'Jane Buyer',
  totalAmount: 1, installmentCount: 1, bookedAt: '', paidAmount: 0, dueAmount: 1, installments: []
};
```
Also extend the two `flush` payload fixtures (~lines 149-155, 171-177) with `status: 'ACTIVE', buyerName: 'Jane Buyer', paidAmount: 0, dueAmount: 600000` on the booking and `status: 'PENDING', paidAt: null, overdue: false` on each installment, so mocks match the real API.

- [ ] **Step 2: Run to verify failure**

Run (from `/Users/ronalisenapati/Ronali/plotchain/frontend`): `npx ng test --watch=false --browsers=ChromeHeadless --include='src/app/plot-bookings/**/*.spec.ts'`
Expected: FAIL to compile (`status` not in `Booking`). If `--include` is unsupported by the installed Angular version, run the full `npx ng test --watch=false --browsers=ChromeHeadless` and filter to `PlotBookings`.

- [ ] **Step 3: Update the model**

```ts
export type BookingStatus = 'ACTIVE' | 'CONFIRMED' | 'CANCELLED';
export type InstallmentStatus = 'PENDING' | 'PAID' | 'VOID';

export interface EmiInstallment {
  installmentNumber: number;
  amount: number;
  dueDate: string;
  status: InstallmentStatus;
  paidAt: string | null;
  overdue: boolean;
}

export interface Booking {
  id: string;
  plotId: string;
  associateId: string;
  status: BookingStatus;
  buyerName: string;
  totalAmount: number;
  installmentCount: number;
  bookedAt: string;
  paidAmount: number;
  dueAmount: number;
  installments: EmiInstallment[];
}
```
(`AssociateBookingPage` unchanged.) If `plot-bookings.component.ts` constructs `EmiInstallment`/`Booking` literals anywhere (grep `installmentNumber:` in it), the compiler will flag them; fix only by adding the fields, no UI change.

- [ ] **Step 4: Run to verify pass**

Run the same command; expected PASS. Then `npx ng build` (from `frontend/`) to confirm the app still compiles.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/plot-bookings
git commit -m "feat(plot-bookings): extend booking TS model with status, buyer, paid/due, installment overdue"
```

---

## Final verification (executor)

- [ ] Run, from `backend/`: `mvn -q test -Dtest='PlotBookingSchemaTest,BookingServiceTest,BookingControllerTest,AssociateBookingControllerTest,BookingExceptionHandlerTest,BookingConcurrencyTest,SecurityConfigTest,SaleRepositoryTest,SaleServiceTest,SaleControllerTest'`. All pass. (`SaleServiceTest` uses Mockito and may hit the known JDK mismatch noise; compare against a pre-change run on `master` rather than treating it as a regression.)
- [ ] Optional full `mvn test` only to confirm the failure set equals the documented baseline (~55 Mockito errors + 4 JwtServiceTest/SecretsEncryptionServiceTest failures), with no new class names appearing.
- [ ] Do NOT edit `docs/superpowers/plans/2026-10-01-plot-booking-units.md` or the status index; the coordinator marks the unit merged.

## Self-Review

- Spec coverage: migration columns/tables/CHECKs/unique (T1); DB-level rejection tests (T1); request buyer fields + 400 + ACTIVE (T2); response fields, derived overdue via existing Clock, self-scope (T3); five exceptions + handler + `findByIdForUpdate` (T4); 403/401 (T2 existing param test + T5); existing tests stay green (fixtures updated T2/T3, verified in final step); Sale mapping only (T1); frontend model (T6).
- Type consistency: `BookingResponse`/`EmiInstallmentResponse` signatures in T3 are used verbatim by the controller-test fixture updates; `CreateBookingRequest` 4-arg order is used identically in T2 across four test files.
