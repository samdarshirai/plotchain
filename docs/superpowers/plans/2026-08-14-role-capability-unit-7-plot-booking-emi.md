# Role Capability Unit 7: Plot Booking + EMI Schedule Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Admin book an available plot against any associate's record, generate a real EMI installment schedule for that booking from the existing `BookingEmiConfig` policy, and let the Associate view their own bookings + schedules read-only — closing the gap the spec's reconciliation table flagged: "`PlotBooking`/`EMISchedule` entities don't exist (only `BookingEmiConfig`, a policy setting) — booking/EMI runtime not built."

**Architecture:** New top-level `com.plotchain.booking` package (sibling to `sales`, not folded into `projects` — see "Package placement" below), following the `sales` package's already-built shape almost line for line: an Admin-only creation endpoint that locks and flips a `Plot` row, a bare self-scoped associate read endpoint, one `@Service` owning both flows, one `@RestControllerAdvice` for the one new exception type. `PlotStatus.BOOKED` already exists in the enum (unused until now) — booking flips `Plot.status` `AVAILABLE -> BOOKED`, which by construction makes the plot fail every other domain's `AVAILABLE` check (booking again, or `SaleService.recordSale`), satisfying "a booked plot should not be independently bookable again" with no new guard logic anywhere else. EMI computation is a flat, no-interest, equal-installment split of `Plot.price` over `BookingEmiConfig.defaultInstallmentCount` (or a single installment when `emiEnabled` is false) — `BookingEmiConfig` has no down-payment-percentage or interest-rate field to apply, confirmed by reading the entity directly, not assumed.

**Tech Stack:** Spring Boot (Java), Spring Data JPA, Flyway, JUnit 5 + Mockito + AssertJ, MockMvc, H2 (test, `MODE=PostgreSQL`) / Postgres (prod).

**Spec:** `docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md` — "Data visibility matrix" row "Plot / project inventory" and "Reconciliation & gap-fill" table's same-named row. Unit tracked in `docs/superpowers/plans/2026-08-03-role-capability-units.md` row 7.

## Global Constraints

- Only `ADMIN` carries back-office authority (role-capability unit 1, merged) — every write matcher this plan adds uses `hasAuthority("ADMIN")`, never `hasAnyAuthority(...)`.
- Associate self-service routes are read-only for this unit (`GET /api/associates/me/bookings`) — no associate-initiated write. Matches the spec's "Associate write scope, generally" resolved decision: every associate-initiated-looking action (booking a plot included) is something Admin does on the associate's behalf.
- `BookingEmiConfig` (`com.plotchain.payments`) is read-only policy input to this unit — do not add fields to it or change its migration (`V14__booking_emi_config.sql`), and do not touch `BookingEmiConfigController`/`Service`/`Request`/`Response`.
- Next Flyway migration number is `V20` as of this writing (latest is `V19__associate_kyc_document.sql`) — **verify this is still free immediately before creating the migration file**, the same collision role-capability unit 8 hit on `V18` (renumbered to `V19` when another unit claimed it first). Renumber if a concurrently-merged unit has since taken `V20`.
- Follow existing code style exactly: plain getter/setter entities with an implicit no-arg constructor (the `Sale`/`LedgerEntry` shape), not `Plot`/`Project`'s explicit-constructor-plus-protected-no-arg shape — `PlotBooking`/`EmiInstallment` are transactional records, not catalog/config entities, so they follow the entity closest to them in kind.

---

## Investigation findings (read before starting — these override the task-brief's speculative assumptions)

1. **`BookingEmiConfig`'s actual fields** (`backend/src/main/java/com/plotchain/payments/BookingEmiConfig.java`): `emiEnabled` (boolean), `defaultInstallmentCount` (int), `confirmRule` (`AUTO_THRESHOLD`/`MANUAL`/`KYC_GATED`), `confirmThresholdPercent` (nullable Integer, only meaningful for `AUTO_THRESHOLD`). **There is no down-payment-percentage field and no interest-rate field.** `confirmRule`/`confirmThresholdPercent` govern a booking-confirmation workflow (e.g. "auto-confirm once X% paid") that this unit does **not** implement — no acceptance criterion asks for a pending/confirmed booking state; a booking is created directly in its completed shape, the same way `Sale` is created directly `RECORDED` with no separate confirmation step. Out of scope, not forgotten.
2. **`Plot`/`PlotStatus`** (`backend/src/main/java/com/plotchain/projects/Plot.java`, `PlotStatus.java`): `PlotStatus` is already `AVAILABLE, BOOKED, SOLD` — `BOOKED` exists and is unused today. No new status value needed.
3. **`Sale`/`SaleService`/`SaleController`/`AssociateSaleController`** (`backend/src/main/java/com/plotchain/sales/`) is the exact precedent the task brief asked to check, and it is a *very* close structural match: `CreateSaleRequest` omits the amount (server-computed from `Plot.price`), `SaleService.recordSale` locks the plot row via `PlotRepository.findByIdForUpdate` (added after a pre-merge code-review finding caught a double-sell race), flips `Plot.status`, and `AssociateSaleController` is a bare `@RestController` with one self-scoped `GET`. This plan reuses that shape almost exactly. One real difference: the spec's matrix gives Associates "own sales **+ descendant sales**" but only "own bookings" (no descendant wording) for plot inventory — so unlike `SaleService.getMySales`, `BookingService.getMyBookings` does **not** resolve `AssociateRepository.findSelfAndDownline` and is scoped to the caller's own `associateId` only.
4. **`SecurityConfig.java`'s current state**: role-capability unit 6 already split the projects/plots `GET` matcher to `.authenticated()` (associate-reachable) — unaffected by this unit. The pattern this unit follows is the Sales matchers: a narrow `POST /api/admin/sales` → `hasAuthority("ADMIN")` matcher declared *before* the blanket `POST /api/**` → `hasAuthority("ADMIN")` rule (first-match-wins is irrelevant here since both resolve to the same authority, but the convention groups domain-specific matchers together for readability) and no explicit matcher at all for the bare associate `GET`.
5. **Global exception handlers already registered**: `AssociateNotFoundException` → `DashboardExceptionHandler` (app-wide), `PlotNotFoundException` → `ProjectsExceptionHandler` (app-wide). **Do not** add a second handler for either in this unit's new `BookingExceptionHandler` — role-capability unit 9's pre-merge review caught exactly this mistake (a duplicate `AssociateNotFoundException` handler in `CompensationExceptionHandler`) and had to remove it before merge.
6. **Package placement: new `com.plotchain.booking` package**, not `com.plotchain.projects`. Justification: `Sale` — the domain closest in shape to `PlotBooking` (both read `Plot`/`Associate`, both flip `Plot.status`, both are Admin-acts-on-an-associate's-behalf transactions) — was deliberately placed in its own `com.plotchain.sales` package rather than folded into `projects`, even though it depends heavily on `Plot`. `projects` stays scoped to plot/project *catalog* CRUD (`PlotService`, `ProjectService`, CSV import); booking is inventory-state-changing transactional behavior, the same category Sales already established as its own package. Following that precedent keeps `projects` focused and matches this run's other units' placement reasoning.

## Files

**Create:**
- `backend/src/main/resources/db/migration/V20__plot_booking.sql`
- `backend/src/main/java/com/plotchain/booking/PlotBooking.java`
- `backend/src/main/java/com/plotchain/booking/EmiInstallment.java`
- `backend/src/main/java/com/plotchain/booking/PlotBookingRepository.java`
- `backend/src/main/java/com/plotchain/booking/EmiInstallmentRepository.java`
- `backend/src/main/java/com/plotchain/booking/CreateBookingRequest.java`
- `backend/src/main/java/com/plotchain/booking/EmiInstallmentResponse.java`
- `backend/src/main/java/com/plotchain/booking/BookingResponse.java`
- `backend/src/main/java/com/plotchain/booking/AssociateBookingPageResponse.java`
- `backend/src/main/java/com/plotchain/booking/PlotNotAvailableException.java`
- `backend/src/main/java/com/plotchain/booking/BookingExceptionHandler.java`
- `backend/src/main/java/com/plotchain/booking/BookingService.java`
- `backend/src/main/java/com/plotchain/booking/BookingController.java`
- `backend/src/main/java/com/plotchain/booking/AssociateBookingController.java`
- `backend/src/test/java/com/plotchain/booking/BookingServiceTest.java`
- `backend/src/test/java/com/plotchain/booking/BookingControllerTest.java`
- `backend/src/test/java/com/plotchain/booking/AssociateBookingControllerTest.java`
- `backend/src/test/java/com/plotchain/booking/BookingConcurrencyTest.java`

**Modify:**
- `backend/src/main/java/com/plotchain/payments/BookingEmiConfigRepository.java` — add one derived-query method.
- `backend/src/main/java/com/plotchain/auth/SecurityConfig.java` — add one `POST /api/admin/bookings` matcher.
- `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java` — add two reachability tests.

---

### Task 1: Migration — `plot_booking` and `emi_installment` tables

**Files:**
- Create: `backend/src/main/resources/db/migration/V20__plot_booking.sql`

**Interfaces:**
- Produces: `plot_booking` table (`id`, `plot_id` FK→plot, `associate_id` FK→associate, `total_amount NUMERIC(14,2)`, `installment_count INTEGER`, `booked_at TIMESTAMP`) and `emi_installment` table (`id`, `booking_id` FK→plot_booking, `installment_number INTEGER`, `amount NUMERIC(14,2)`, `due_date DATE`), for Task 2's entities to map onto.

- [ ] **Step 1: Verify V20 is free**

Run: `ls backend/src/main/resources/db/migration | sort -V | tail -5`
Expected: highest existing file is `V19__associate_kyc_document.sql`. If a `V20` already exists (a concurrently-merged unit claimed it first), use the next free number instead and update every reference to `V20` in this plan's later tasks accordingly before continuing.

- [ ] **Step 2: Write the migration**

```sql
-- role-capability unit 7: PlotBooking/EMISchedule runtime the V14 booking_emi_config
-- migration's own comment flagged as not yet built ("no PlotBooking/EMISchedule transactional
-- tables exist yet, this only stores the policy that will govern them"). This migration adds
-- those two tables; BookingService applies the existing booking_emi_config policy row to compute
-- each booking's installment schedule at creation time.

CREATE TABLE plot_booking (
    id UUID PRIMARY KEY,
    plot_id UUID NOT NULL REFERENCES plot(id),
    associate_id UUID NOT NULL REFERENCES associate(id),
    total_amount NUMERIC(14,2) NOT NULL,
    installment_count INTEGER NOT NULL,
    booked_at TIMESTAMP NOT NULL
);
CREATE INDEX idx_plot_booking_associate_id ON plot_booking(associate_id);

CREATE TABLE emi_installment (
    id UUID PRIMARY KEY,
    booking_id UUID NOT NULL REFERENCES plot_booking(id),
    installment_number INTEGER NOT NULL,
    amount NUMERIC(14,2) NOT NULL,
    due_date DATE NOT NULL
);
CREATE INDEX idx_emi_installment_booking_id ON emi_installment(booking_id);
```

- [ ] **Step 3: Verify Flyway picks it up**

Run: `cd backend && mvn -q -Dtest=SaleRepositoryTest test` (any existing `@SpringBootTest` boots the full Flyway migration chain; this one is cheap and unrelated, so a failure here means the new migration itself is broken, not a pre-existing issue).
Expected: `BUILD SUCCESS`. If it fails on a Flyway checksum/syntax error, fix the SQL and rerun.

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/resources/db/migration/V20__plot_booking.sql
git commit -m "feat(booking): add plot_booking and emi_installment tables"
```

---

### Task 2: Entities and repositories

**Files:**
- Create: `backend/src/main/java/com/plotchain/booking/PlotBooking.java`
- Create: `backend/src/main/java/com/plotchain/booking/EmiInstallment.java`
- Create: `backend/src/main/java/com/plotchain/booking/PlotBookingRepository.java`
- Create: `backend/src/main/java/com/plotchain/booking/EmiInstallmentRepository.java`
- Modify: `backend/src/main/java/com/plotchain/payments/BookingEmiConfigRepository.java`
- Test: `backend/src/test/java/com/plotchain/booking/BookingServiceTest.java` (this task's own repository additions are exercised indirectly through Task 4's service tests via Mockito `@Mock`, matching how `PlotRepository.findByIdForUpdate` and `SaleRepository.findByAssociateIdInOrderByRecordedAtDesc` have no dedicated repository test files of their own — only `SaleRepository`'s hand-written `@Query` got one. This task has no hand-written `@Query`, so no dedicated repository test is needed.)

**Interfaces:**
- Produces: `PlotBooking` entity (getters/setters: `id`, `plotId`, `associateId`, `totalAmount`, `installmentCount`, `bookedAt`), `EmiInstallment` entity (getters/setters: `id`, `bookingId`, `installmentNumber`, `amount`, `dueDate`), `PlotBookingRepository.findByAssociateIdOrderByBookedAtDesc(UUID, Pageable): Page<PlotBooking>`, `EmiInstallmentRepository.findByBookingIdOrderByInstallmentNumberAsc(UUID): List<EmiInstallment>`, `BookingEmiConfigRepository.findBySingletonGuardTrue(): Optional<BookingEmiConfig>` — all consumed by Task 4's `BookingService`.

- [ ] **Step 1: Write `PlotBooking`**

```java
package com.plotchain.booking;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "plot_booking")
public class PlotBooking {

    @Id
    private UUID id;

    @Column(name = "plot_id", nullable = false)
    private UUID plotId;

    @Column(name = "associate_id", nullable = false)
    private UUID associateId;

    @Column(name = "total_amount", nullable = false)
    private BigDecimal totalAmount;

    @Column(name = "installment_count", nullable = false)
    private int installmentCount;

    @Column(name = "booked_at", nullable = false)
    private Instant bookedAt;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getPlotId() { return plotId; }
    public void setPlotId(UUID plotId) { this.plotId = plotId; }
    public UUID getAssociateId() { return associateId; }
    public void setAssociateId(UUID associateId) { this.associateId = associateId; }
    public BigDecimal getTotalAmount() { return totalAmount; }
    public void setTotalAmount(BigDecimal totalAmount) { this.totalAmount = totalAmount; }
    public int getInstallmentCount() { return installmentCount; }
    public void setInstallmentCount(int installmentCount) { this.installmentCount = installmentCount; }
    public Instant getBookedAt() { return bookedAt; }
    public void setBookedAt(Instant bookedAt) { this.bookedAt = bookedAt; }
}
```

- [ ] **Step 2: Write `EmiInstallment`**

```java
package com.plotchain.booking;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "emi_installment")
public class EmiInstallment {

    @Id
    private UUID id;

    @Column(name = "booking_id", nullable = false)
    private UUID bookingId;

    @Column(name = "installment_number", nullable = false)
    private int installmentNumber;

    @Column(nullable = false)
    private BigDecimal amount;

    @Column(name = "due_date", nullable = false)
    private LocalDate dueDate;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getBookingId() { return bookingId; }
    public void setBookingId(UUID bookingId) { this.bookingId = bookingId; }
    public int getInstallmentNumber() { return installmentNumber; }
    public void setInstallmentNumber(int installmentNumber) { this.installmentNumber = installmentNumber; }
    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }
    public LocalDate getDueDate() { return dueDate; }
    public void setDueDate(LocalDate dueDate) { this.dueDate = dueDate; }
}
```

- [ ] **Step 3: Write the repositories**

```java
package com.plotchain.booking;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface PlotBookingRepository extends JpaRepository<PlotBooking, UUID> {

    // Role-capability unit 7 ("Associate own view -- GET /api/associates/me/bookings"): the
    // matrix's Plot/project inventory row gives an Associate "own bookings + EMI schedule", not
    // "own + descendant" like the Sales row's "team-volume reports" wording -- so, unlike
    // SaleRepository.findByAssociateIdInOrderByRecordedAtDesc, this takes a single associateId,
    // never a self-plus-downline ID list.
    Page<PlotBooking> findByAssociateIdOrderByBookedAtDesc(UUID associateId, Pageable pageable);
}
```

```java
package com.plotchain.booking;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface EmiInstallmentRepository extends JpaRepository<EmiInstallment, UUID> {

    List<EmiInstallment> findByBookingIdOrderByInstallmentNumberAsc(UUID bookingId);
}
```

- [ ] **Step 4: Add the config lookup method to `BookingEmiConfigRepository`**

Modify `backend/src/main/java/com/plotchain/payments/BookingEmiConfigRepository.java`:

```java
package com.plotchain.payments;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface BookingEmiConfigRepository extends JpaRepository<BookingEmiConfig, UUID> {

    // Role-capability unit 7: booking-schedule generation needs to read the singleton policy
    // row directly (BookingEmiConfigService.currentConfig(), which does the same lookup via
    // findAll().stream().findFirst(), is private and stays that way -- this is a plain derived
    // query against the same singleton_guard column V14's migration already added for exactly
    // this "there is only ever one row" guarantee).
    Optional<BookingEmiConfig> findBySingletonGuardTrue();
}
```

- [ ] **Step 5: Compile**

Run: `cd backend && mvn -q compile`
Expected: `BUILD SUCCESS`. No test to run yet — these types have no behavior of their own.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/plotchain/booking/PlotBooking.java \
        backend/src/main/java/com/plotchain/booking/EmiInstallment.java \
        backend/src/main/java/com/plotchain/booking/PlotBookingRepository.java \
        backend/src/main/java/com/plotchain/booking/EmiInstallmentRepository.java \
        backend/src/main/java/com/plotchain/payments/BookingEmiConfigRepository.java
git commit -m "feat(booking): add PlotBooking/EmiInstallment entities and repositories"
```

---

### Task 3: DTOs and the one new exception

**Files:**
- Create: `backend/src/main/java/com/plotchain/booking/CreateBookingRequest.java`
- Create: `backend/src/main/java/com/plotchain/booking/EmiInstallmentResponse.java`
- Create: `backend/src/main/java/com/plotchain/booking/BookingResponse.java`
- Create: `backend/src/main/java/com/plotchain/booking/AssociateBookingPageResponse.java`
- Create: `backend/src/main/java/com/plotchain/booking/PlotNotAvailableException.java`
- Create: `backend/src/main/java/com/plotchain/booking/BookingExceptionHandler.java`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `CreateBookingRequest(UUID plotId, UUID associateId)`, `EmiInstallmentResponse(int installmentNumber, BigDecimal amount, LocalDate dueDate)`, `BookingResponse(UUID id, UUID plotId, UUID associateId, BigDecimal totalAmount, int installmentCount, Instant bookedAt, List<EmiInstallmentResponse> installments)`, `AssociateBookingPageResponse(List<BookingResponse> bookings, int page, int size, long totalElements)`, `PlotNotAvailableException(UUID plotId)` — all consumed by Task 4's `BookingService`.

- [ ] **Step 1: Write `CreateBookingRequest`**

```java
package com.plotchain.booking;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

// No amount or installment-count override fields: totalAmount is always a server-computed
// snapshot of Plot.price at booking time (same convention as Sales' CreateSaleRequest omitting
// amount), and the installment split always derives from the singleton BookingEmiConfig policy,
// not a per-booking client override -- no acceptance criterion asks for one.
public record CreateBookingRequest(
    @NotNull UUID plotId,
    @NotNull UUID associateId
) {}
```

- [ ] **Step 2: Write the response DTOs**

```java
package com.plotchain.booking;

import java.math.BigDecimal;
import java.time.LocalDate;

public record EmiInstallmentResponse(
    int installmentNumber,
    BigDecimal amount,
    LocalDate dueDate
) {}
```

```java
package com.plotchain.booking;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record BookingResponse(
    UUID id,
    UUID plotId,
    UUID associateId,
    BigDecimal totalAmount,
    int installmentCount,
    Instant bookedAt,
    List<EmiInstallmentResponse> installments
) {}
```

```java
package com.plotchain.booking;

import java.util.List;

public record AssociateBookingPageResponse(List<BookingResponse> bookings, int page, int size, long totalElements) {}
```

- [ ] **Step 3: Write `PlotNotAvailableException`**

```java
package com.plotchain.booking;

import java.util.UUID;

// A booking-scoped copy of the same idea as sales.PlotNotAvailableException, not a reuse of
// that class -- booking must not import the sales package (packages stay siblings, not
// cross-dependent), and the message is domain-specific ("for booking", not "for sale").
public class PlotNotAvailableException extends RuntimeException {
    public PlotNotAvailableException(UUID plotId) {
        super("Plot is not available for booking: " + plotId);
    }
}
```

- [ ] **Step 4: Write `BookingExceptionHandler`**

```java
package com.plotchain.booking;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

// PlotNotFoundException and AssociateNotFoundException are deliberately NOT handled here even
// though BookingService throws both -- ProjectsExceptionHandler and DashboardExceptionHandler
// already map them to 404 globally (same reasoning SalesExceptionHandler documents for omitting
// the same two types). Adding a second @ExceptionHandler for either here would create a
// redundant, order-dependent second mapping -- exactly the mistake role-capability unit 9's
// pre-merge review caught and removed from CompensationExceptionHandler. This class only owns
// the one exception type new to this unit.
@RestControllerAdvice
public class BookingExceptionHandler {

    @ExceptionHandler(PlotNotAvailableException.class)
    public ResponseEntity<Map<String, String>> handlePlotNotAvailable(PlotNotAvailableException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }
}
```

- [ ] **Step 5: Compile**

Run: `cd backend && mvn -q compile`
Expected: `BUILD SUCCESS`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/plotchain/booking/CreateBookingRequest.java \
        backend/src/main/java/com/plotchain/booking/EmiInstallmentResponse.java \
        backend/src/main/java/com/plotchain/booking/BookingResponse.java \
        backend/src/main/java/com/plotchain/booking/AssociateBookingPageResponse.java \
        backend/src/main/java/com/plotchain/booking/PlotNotAvailableException.java \
        backend/src/main/java/com/plotchain/booking/BookingExceptionHandler.java
git commit -m "feat(booking): add booking DTOs and PlotNotAvailableException handler"
```

---

### Task 4: `BookingService.createBooking` — the admin booking + EMI generation flow (TDD)

**Files:**
- Create: `backend/src/main/java/com/plotchain/booking/BookingService.java`
- Test: `backend/src/test/java/com/plotchain/booking/BookingServiceTest.java`

**Interfaces:**
- Consumes: `PlotRepository.findByIdForUpdate(UUID): Optional<Plot>` (existing, `com.plotchain.projects`), `AssociateRepository.findById(UUID): Optional<Associate>` (existing, `com.plotchain.associate`), `BookingEmiConfigRepository.findBySingletonGuardTrue()` (Task 2), `PlotBookingRepository`/`EmiInstallmentRepository` (Task 2), `CreateBookingRequest`/`BookingResponse`/`EmiInstallmentResponse`/`PlotNotAvailableException` (Task 3), `PlotNotFoundException` (existing, `com.plotchain.projects`), `AssociateNotFoundException` (existing, `com.plotchain.associate`).
- Produces: `BookingService.createBooking(CreateBookingRequest): BookingResponse` — consumed by Task 6's `BookingController`.

- [ ] **Step 1: Write the failing tests**

Create `backend/src/test/java/com/plotchain/booking/BookingServiceTest.java`:

```java
package com.plotchain.booking;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.payments.BookingEmiConfig;
import com.plotchain.payments.BookingEmiConfigRepository;
import com.plotchain.projects.Plot;
import com.plotchain.projects.PlotNotFoundException;
import com.plotchain.projects.PlotRepository;
import com.plotchain.projects.PlotStatus;
import com.plotchain.projects.PlotType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class BookingServiceTest {

    @Mock PlotRepository plotRepository;
    @Mock AssociateRepository associateRepository;
    @Mock BookingEmiConfigRepository bookingEmiConfigRepository;
    @Mock PlotBookingRepository plotBookingRepository;
    @Mock EmiInstallmentRepository emiInstallmentRepository;

    BookingService bookingService;

    private static final UUID PLOT_ID = UUID.randomUUID();
    private static final UUID ASSOCIATE_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        bookingService = new BookingService(
            plotRepository, associateRepository, bookingEmiConfigRepository,
            plotBookingRepository, emiInstallmentRepository);
    }

    private Plot plotWithStatusAndPrice(PlotStatus status, String price) {
        return new Plot(PLOT_ID, UUID.randomUUID(), "A-101", PlotType.NORMAL,
            new BigDecimal("1200.00"), new BigDecimal("500.00"), new BigDecimal(price), status);
    }

    private CreateBookingRequest requestFor(UUID plotId, UUID associateId) {
        return new CreateBookingRequest(plotId, associateId);
    }

    private BookingEmiConfig emiConfig(boolean enabled, int count) {
        BookingEmiConfig config = new BookingEmiConfig();
        config.setEmiEnabled(enabled);
        config.setDefaultInstallmentCount(count);
        config.setConfirmRule("MANUAL");
        return config;
    }

    private void stubHappyPathGuardsAndDependencies(String price, BookingEmiConfig config) {
        when(plotRepository.findByIdForUpdate(PLOT_ID))
            .thenReturn(Optional.of(plotWithStatusAndPrice(PlotStatus.AVAILABLE, price)));
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(new Associate()));
        when(bookingEmiConfigRepository.findBySingletonGuardTrue()).thenReturn(Optional.of(config));
        when(plotBookingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(emiInstallmentRepository.saveAll(any())).thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    void createBookingAcquiresTheRowLockOnThePlotViaFindByIdForUpdateNotFindById() {
        stubHappyPathGuardsAndDependencies("600000.00", emiConfig(true, 4));

        bookingService.createBooking(requestFor(PLOT_ID, ASSOCIATE_ID));

        verify(plotRepository).findByIdForUpdate(PLOT_ID);
        verify(plotRepository, never()).findById(any());
    }

    @Test
    void createBookingThrowsPlotNotFoundExceptionWhenThePlotDoesNotExist() {
        when(plotRepository.findByIdForUpdate(PLOT_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> bookingService.createBooking(requestFor(PLOT_ID, ASSOCIATE_ID)))
            .isInstanceOf(PlotNotFoundException.class);

        verify(plotRepository, never()).save(any());
        verify(associateRepository, never()).findById(any());
    }

    @Test
    void createBookingThrowsPlotNotAvailableExceptionWhenThePlotIsAlreadyBooked() {
        when(plotRepository.findByIdForUpdate(PLOT_ID))
            .thenReturn(Optional.of(plotWithStatusAndPrice(PlotStatus.BOOKED, "600000.00")));

        assertThatThrownBy(() -> bookingService.createBooking(requestFor(PLOT_ID, ASSOCIATE_ID)))
            .isInstanceOf(PlotNotAvailableException.class);

        verify(plotRepository, never()).save(any());
        verify(associateRepository, never()).findById(any());
    }

    @Test
    void createBookingThrowsPlotNotAvailableExceptionWhenThePlotIsAlreadySold() {
        when(plotRepository.findByIdForUpdate(PLOT_ID))
            .thenReturn(Optional.of(plotWithStatusAndPrice(PlotStatus.SOLD, "600000.00")));

        assertThatThrownBy(() -> bookingService.createBooking(requestFor(PLOT_ID, ASSOCIATE_ID)))
            .isInstanceOf(PlotNotAvailableException.class);
    }

    @Test
    void createBookingThrowsAssociateNotFoundExceptionWhenTheAssociateDoesNotExist() {
        when(plotRepository.findByIdForUpdate(PLOT_ID))
            .thenReturn(Optional.of(plotWithStatusAndPrice(PlotStatus.AVAILABLE, "600000.00")));
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> bookingService.createBooking(requestFor(PLOT_ID, ASSOCIATE_ID)))
            .isInstanceOf(AssociateNotFoundException.class);

        verify(plotRepository, never()).save(any());
    }

    @Test
    void createBookingThrowsIllegalStateExceptionWhenTheBookingEmiConfigRowIsMissing() {
        when(plotRepository.findByIdForUpdate(PLOT_ID))
            .thenReturn(Optional.of(plotWithStatusAndPrice(PlotStatus.AVAILABLE, "600000.00")));
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(new Associate()));
        when(bookingEmiConfigRepository.findBySingletonGuardTrue()).thenReturn(Optional.empty());

        assertThatThrownBy(() -> bookingService.createBooking(requestFor(PLOT_ID, ASSOCIATE_ID)))
            .isInstanceOf(IllegalStateException.class);

        verify(plotBookingRepository, never()).save(any());
    }

    @Test
    void createBookingFlipsThePlotToBooked() {
        stubHappyPathGuardsAndDependencies("600000.00", emiConfig(true, 4));

        bookingService.createBooking(requestFor(PLOT_ID, ASSOCIATE_ID));

        ArgumentCaptor<Plot> captor = ArgumentCaptor.forClass(Plot.class);
        verify(plotRepository).save(captor.capture());
        assertThat(captor.getValue().getStatus()).isEqualTo(PlotStatus.BOOKED);
    }

    @Test
    void createBookingSavesABookingWithTotalAmountAndInstallmentCountSnapshotted() {
        stubHappyPathGuardsAndDependencies("600000.00", emiConfig(true, 4));

        bookingService.createBooking(requestFor(PLOT_ID, ASSOCIATE_ID));

        ArgumentCaptor<PlotBooking> captor = ArgumentCaptor.forClass(PlotBooking.class);
        verify(plotBookingRepository).save(captor.capture());
        PlotBooking saved = captor.getValue();
        assertThat(saved.getPlotId()).isEqualTo(PLOT_ID);
        assertThat(saved.getAssociateId()).isEqualTo(ASSOCIATE_ID);
        assertThat(saved.getTotalAmount()).isEqualByComparingTo("600000.00");
        assertThat(saved.getInstallmentCount()).isEqualTo(4);
        assertThat(saved.getBookedAt()).isNotNull();
    }

    // Flat, no-interest amortization: BookingEmiConfig has no down-payment or interest-rate
    // field, so an evenly-divisible total splits into exactly-equal installments.
    @Test
    void createBookingGeneratesEqualInstallmentsWhenTheAmountDividesEvenly() {
        stubHappyPathGuardsAndDependencies("600000.00", emiConfig(true, 4));

        BookingResponse response = bookingService.createBooking(requestFor(PLOT_ID, ASSOCIATE_ID));

        assertThat(response.installments()).hasSize(4);
        assertThat(response.installments()).allSatisfy(i ->
            assertThat(i.amount()).isEqualByComparingTo("150000.00"));
        BigDecimal sum = response.installments().stream()
            .map(EmiInstallmentResponse::amount).reduce(BigDecimal.ZERO, BigDecimal::add);
        assertThat(sum).isEqualByComparingTo("600000.00");
    }

    // The DOWN-rounded per-installment amount times (count - 1) leaves a remainder; the last
    // installment absorbs it so the schedule's total always equals the plot price exactly.
    @Test
    void createBookingLastInstallmentAbsorbsTheRoundingRemainder() {
        stubHappyPathGuardsAndDependencies("100000.00", emiConfig(true, 3));

        BookingResponse response = bookingService.createBooking(requestFor(PLOT_ID, ASSOCIATE_ID));

        assertThat(response.installments()).hasSize(3);
        assertThat(response.installments().get(0).amount()).isEqualByComparingTo("33333.33");
        assertThat(response.installments().get(1).amount()).isEqualByComparingTo("33333.33");
        assertThat(response.installments().get(2).amount()).isEqualByComparingTo("33333.34");
        BigDecimal sum = response.installments().stream()
            .map(EmiInstallmentResponse::amount).reduce(BigDecimal.ZERO, BigDecimal::add);
        assertThat(sum).isEqualByComparingTo("100000.00");
    }

    @Test
    void createBookingGeneratesASingleInstallmentForTheFullAmountWhenEmiIsDisabled() {
        stubHappyPathGuardsAndDependencies("600000.00", emiConfig(false, 4));

        BookingResponse response = bookingService.createBooking(requestFor(PLOT_ID, ASSOCIATE_ID));

        assertThat(response.installmentCount()).isEqualTo(1);
        assertThat(response.installments()).hasSize(1);
        assertThat(response.installments().get(0).amount()).isEqualByComparingTo("600000.00");
        assertThat(response.installments().get(0).installmentNumber()).isEqualTo(1);
    }

    @Test
    void createBookingSpacesInstallmentDueDatesOneMonthApartStartingOneMonthAfterBooking() {
        stubHappyPathGuardsAndDependencies("600000.00", emiConfig(true, 3));

        BookingResponse response = bookingService.createBooking(requestFor(PLOT_ID, ASSOCIATE_ID));

        LocalDate bookedDate = response.bookedAt().atZone(ZoneOffset.UTC).toLocalDate();
        assertThat(response.installments().get(0).dueDate()).isEqualTo(bookedDate.plusMonths(1));
        assertThat(response.installments().get(1).dueDate()).isEqualTo(bookedDate.plusMonths(2));
        assertThat(response.installments().get(2).dueDate()).isEqualTo(bookedDate.plusMonths(3));
    }

    @Test
    void createBookingInstallmentNumbersAreOneBasedAndSequential() {
        stubHappyPathGuardsAndDependencies("600000.00", emiConfig(true, 3));

        BookingResponse response = bookingService.createBooking(requestFor(PLOT_ID, ASSOCIATE_ID));

        assertThat(response.installments()).extracting(EmiInstallmentResponse::installmentNumber)
            .containsExactly(1, 2, 3);
    }

    @Test
    void createBookingPersistsTheGeneratedScheduleViaSaveAll() {
        stubHappyPathGuardsAndDependencies("600000.00", emiConfig(true, 3));

        bookingService.createBooking(requestFor(PLOT_ID, ASSOCIATE_ID));

        ArgumentCaptor<List<EmiInstallment>> captor = ArgumentCaptor.forClass(List.class);
        verify(emiInstallmentRepository).saveAll(captor.capture());
        assertThat(captor.getValue()).hasSize(3);
        assertThat(captor.getValue()).allSatisfy(i -> assertThat(i.getBookingId()).isNotNull());
    }

    @Test
    void createBookingReturnsAFullyPopulatedBookingResponse() {
        stubHappyPathGuardsAndDependencies("600000.00", emiConfig(true, 4));

        BookingResponse response = bookingService.createBooking(requestFor(PLOT_ID, ASSOCIATE_ID));

        assertThat(response.id()).isNotNull();
        assertThat(response.plotId()).isEqualTo(PLOT_ID);
        assertThat(response.associateId()).isEqualTo(ASSOCIATE_ID);
        assertThat(response.totalAmount()).isEqualByComparingTo("600000.00");
        assertThat(response.installmentCount()).isEqualTo(4);
        assertThat(response.bookedAt()).isNotNull();
        assertThat(response.installments()).hasSize(4);
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail on missing `BookingService`**

Run: `cd backend && mvn -q -Dtest=BookingServiceTest test`
Expected: compile error — `BookingService` does not exist yet.

- [ ] **Step 3: Write `BookingService`**

```java
package com.plotchain.booking;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.payments.BookingEmiConfig;
import com.plotchain.payments.BookingEmiConfigRepository;
import com.plotchain.projects.Plot;
import com.plotchain.projects.PlotNotFoundException;
import com.plotchain.projects.PlotRepository;
import com.plotchain.projects.PlotStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
public class BookingService {

    private final PlotRepository plotRepository;
    private final AssociateRepository associateRepository;
    private final BookingEmiConfigRepository bookingEmiConfigRepository;
    private final PlotBookingRepository plotBookingRepository;
    private final EmiInstallmentRepository emiInstallmentRepository;

    public BookingService(
            PlotRepository plotRepository,
            AssociateRepository associateRepository,
            BookingEmiConfigRepository bookingEmiConfigRepository,
            PlotBookingRepository plotBookingRepository,
            EmiInstallmentRepository emiInstallmentRepository) {
        this.plotRepository = plotRepository;
        this.associateRepository = associateRepository;
        this.bookingEmiConfigRepository = bookingEmiConfigRepository;
        this.plotBookingRepository = plotBookingRepository;
        this.emiInstallmentRepository = emiInstallmentRepository;
    }

    // Row-lock the Plot first, same fix Sales unit 3's pre-merge code review forced onto
    // SaleService.recordSale (PlotRepository.findByIdForUpdate's own comment) -- two concurrent
    // bookings against the same plot must not both pass the AVAILABLE check before either
    // commits. See BookingConcurrencyTest for the end-to-end proof.
    @Transactional
    public BookingResponse createBooking(CreateBookingRequest request) {
        Plot plot = plotRepository.findByIdForUpdate(request.plotId())
            .orElseThrow(() -> new PlotNotFoundException(request.plotId()));

        if (plot.getStatus() != PlotStatus.AVAILABLE) {
            throw new PlotNotAvailableException(plot.getId());
        }

        Associate associate = associateRepository.findById(request.associateId())
            .orElseThrow(() -> new AssociateNotFoundException(request.associateId()));

        // Plot -> BOOKED, not SOLD: a booking reserves the plot under an installment plan, it
        // doesn't complete a sale. A BOOKED plot still fails the AVAILABLE check above (and
        // SaleService.recordSale's own AVAILABLE check), so it can't be independently booked or
        // sold again -- the plot-inventory-integrity requirement this unit exists to satisfy,
        // for free, from the AVAILABLE check that already exists.
        plot.setStatus(PlotStatus.BOOKED);
        plotRepository.save(plot);

        BookingEmiConfig config = bookingEmiConfigRepository.findBySingletonGuardTrue()
            .orElseThrow(() -> new IllegalStateException(
                "booking_emi_config row missing - V14 migration seeds it"));

        Instant bookedAt = Instant.now();
        List<EmiInstallment> schedule = computeSchedule(plot.getPrice(), config, bookedAt);

        PlotBooking booking = new PlotBooking();
        booking.setId(UUID.randomUUID());
        booking.setPlotId(plot.getId());
        booking.setAssociateId(associate.getId());
        booking.setTotalAmount(plot.getPrice());
        booking.setInstallmentCount(schedule.size());
        booking.setBookedAt(bookedAt);
        booking = plotBookingRepository.save(booking);

        for (EmiInstallment installment : schedule) {
            installment.setBookingId(booking.getId());
        }
        emiInstallmentRepository.saveAll(schedule);

        return toResponse(booking, schedule);
    }

    // Self-scoped only, unlike Sales' getMySales -- the data visibility matrix's Plot/project
    // inventory row gives an Associate "own bookings + EMI schedule", not "own + descendant"
    // like the Sales row's explicit "team-volume reports" wording. No AssociateRepository
    // downline resolution needed here.
    public AssociateBookingPageResponse getMyBookings(UUID associateId, int page, int size) {
        Page<PlotBooking> result = plotBookingRepository.findByAssociateIdOrderByBookedAtDesc(
            associateId, PageRequest.of(page, size));

        List<BookingResponse> bookings = result.getContent().stream()
            .map(booking -> toResponse(booking, emiInstallmentRepository
                .findByBookingIdOrderByInstallmentNumberAsc(booking.getId())))
            .toList();

        return new AssociateBookingPageResponse(bookings, page, size, result.getTotalElements());
    }

    // Flat, no-interest amortization: BookingEmiConfig carries no down-payment-percentage or
    // interest-rate field (only emiEnabled, defaultInstallmentCount, confirmRule,
    // confirmThresholdPercent -- confirmed by reading the entity directly, not assumed), so
    // there is nothing to compound or front-load. When EMI is disabled, the schedule is a single
    // installment for the full amount, still due one month out -- the same formula as every
    // other case below, deliberately not special-cased to a due-today date, so there's one
    // schedule shape for a future payment-recording unit to reason about, not two.
    private List<EmiInstallment> computeSchedule(BigDecimal totalAmount, BookingEmiConfig config, Instant bookedAt) {
        int count = config.isEmiEnabled() ? config.getDefaultInstallmentCount() : 1;
        LocalDate bookedDate = bookedAt.atZone(ZoneOffset.UTC).toLocalDate();
        BigDecimal base = totalAmount.divide(BigDecimal.valueOf(count), 2, RoundingMode.DOWN);

        List<EmiInstallment> schedule = new ArrayList<>();
        BigDecimal runningTotal = BigDecimal.ZERO;
        for (int i = 1; i < count; i++) {
            EmiInstallment installment = new EmiInstallment();
            installment.setId(UUID.randomUUID());
            installment.setInstallmentNumber(i);
            installment.setAmount(base);
            installment.setDueDate(bookedDate.plusMonths(i));
            schedule.add(installment);
            runningTotal = runningTotal.add(base);
        }

        // Last installment absorbs whatever the DOWN rounding above left behind, so the
        // schedule's total always equals totalAmount exactly, never a cent short or over.
        EmiInstallment last = new EmiInstallment();
        last.setId(UUID.randomUUID());
        last.setInstallmentNumber(count);
        last.setAmount(totalAmount.subtract(runningTotal));
        last.setDueDate(bookedDate.plusMonths(count));
        schedule.add(last);

        return schedule;
    }

    private BookingResponse toResponse(PlotBooking booking, List<EmiInstallment> installments) {
        List<EmiInstallmentResponse> installmentResponses = installments.stream()
            .map(i -> new EmiInstallmentResponse(i.getInstallmentNumber(), i.getAmount(), i.getDueDate()))
            .toList();
        return new BookingResponse(
            booking.getId(),
            booking.getPlotId(),
            booking.getAssociateId(),
            booking.getTotalAmount(),
            booking.getInstallmentCount(),
            booking.getBookedAt(),
            installmentResponses
        );
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && mvn -q -Dtest=BookingServiceTest test`
Expected: `BUILD SUCCESS`, all tests green.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/booking/BookingService.java \
        backend/src/test/java/com/plotchain/booking/BookingServiceTest.java
git commit -m "feat(booking): add BookingService.createBooking with EMI schedule generation"
```

---

### Task 5: `BookingService.getMyBookings` — associate self-view (TDD)

**Files:**
- Modify: `backend/src/main/java/com/plotchain/booking/BookingService.java` (already has `getMyBookings` from Task 4 — this task only adds its tests; `getMyBookings` itself needs no code change)
- Test: `backend/src/test/java/com/plotchain/booking/BookingServiceTest.java`

**Interfaces:**
- Consumes: `PlotBookingRepository.findByAssociateIdOrderByBookedAtDesc` (Task 2), `EmiInstallmentRepository.findByBookingIdOrderByInstallmentNumberAsc` (Task 2).
- Produces: nothing new — `BookingService.getMyBookings(UUID, int, int): AssociateBookingPageResponse` already exists from Task 4; consumed by Task 7's `AssociateBookingController`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/src/test/java/com/plotchain/booking/BookingServiceTest.java` (add these imports if not already present: `org.springframework.data.domain.Page`, `org.springframework.data.domain.PageImpl`, `org.springframework.data.domain.PageRequest`, and `static org.mockito.ArgumentMatchers.eq`):

```java
    @Test
    void getMyBookingsFiltersByTheGivenAssociateIdOnly() {
        PlotBooking booking = new PlotBooking();
        booking.setId(UUID.randomUUID());
        booking.setPlotId(PLOT_ID);
        booking.setAssociateId(ASSOCIATE_ID);
        booking.setTotalAmount(new BigDecimal("600000.00"));
        booking.setInstallmentCount(1);
        booking.setBookedAt(Instant.now());
        when(plotBookingRepository.findByAssociateIdOrderByBookedAtDesc(
            eq(ASSOCIATE_ID), eq(PageRequest.of(0, 20))))
            .thenReturn(new PageImpl<>(List.of(booking), PageRequest.of(0, 20), 1));
        when(emiInstallmentRepository.findByBookingIdOrderByInstallmentNumberAsc(booking.getId()))
            .thenReturn(List.of());

        AssociateBookingPageResponse response = bookingService.getMyBookings(ASSOCIATE_ID, 0, 20);

        verify(plotBookingRepository).findByAssociateIdOrderByBookedAtDesc(ASSOCIATE_ID, PageRequest.of(0, 20));
        assertThat(response.totalElements()).isEqualTo(1);
        assertThat(response.page()).isEqualTo(0);
        assertThat(response.size()).isEqualTo(20);
        assertThat(response.bookings()).hasSize(1);
        assertThat(response.bookings().get(0).id()).isEqualTo(booking.getId());
    }

    @Test
    void getMyBookingsAttachesEachBookingsEmiScheduleFromTheInstallmentRepository() {
        PlotBooking booking = new PlotBooking();
        booking.setId(UUID.randomUUID());
        booking.setPlotId(PLOT_ID);
        booking.setAssociateId(ASSOCIATE_ID);
        booking.setTotalAmount(new BigDecimal("600000.00"));
        booking.setInstallmentCount(2);
        booking.setBookedAt(Instant.now());
        EmiInstallment first = new EmiInstallment();
        first.setInstallmentNumber(1);
        first.setAmount(new BigDecimal("300000.00"));
        first.setDueDate(LocalDate.now().plusMonths(1));
        EmiInstallment second = new EmiInstallment();
        second.setInstallmentNumber(2);
        second.setAmount(new BigDecimal("300000.00"));
        second.setDueDate(LocalDate.now().plusMonths(2));
        when(plotBookingRepository.findByAssociateIdOrderByBookedAtDesc(eq(ASSOCIATE_ID), any()))
            .thenReturn(new PageImpl<>(List.of(booking), PageRequest.of(0, 20), 1));
        when(emiInstallmentRepository.findByBookingIdOrderByInstallmentNumberAsc(booking.getId()))
            .thenReturn(List.of(first, second));

        AssociateBookingPageResponse response = bookingService.getMyBookings(ASSOCIATE_ID, 0, 20);

        assertThat(response.bookings().get(0).installments()).hasSize(2);
        assertThat(response.bookings().get(0).installments().get(0).amount()).isEqualByComparingTo("300000.00");
    }

    @Test
    void getMyBookingsReturnsAnEmptyPageWhenTheCallerHasNoBookings() {
        when(plotBookingRepository.findByAssociateIdOrderByBookedAtDesc(eq(ASSOCIATE_ID), any()))
            .thenReturn(new PageImpl<>(List.of()));

        AssociateBookingPageResponse response = bookingService.getMyBookings(ASSOCIATE_ID, 0, 20);

        assertThat(response.totalElements()).isEqualTo(0);
        assertThat(response.bookings()).isEmpty();
    }
```

- [ ] **Step 2: Run the tests**

Run: `cd backend && mvn -q -Dtest=BookingServiceTest test`
Expected: `BUILD SUCCESS`, all tests including the three new ones green — `getMyBookings` already exists from Task 4, so these tests should pass without further implementation. If any fails, fix `getMyBookings` (not the test) to match the interface documented in Task 4.

- [ ] **Step 3: Commit**

```bash
git add backend/src/test/java/com/plotchain/booking/BookingServiceTest.java
git commit -m "test(booking): cover BookingService.getMyBookings self-scoping and schedule attachment"
```

---

### Task 6: `BookingController` — admin booking-creation endpoint

**Files:**
- Create: `backend/src/main/java/com/plotchain/booking/BookingController.java`
- Test: `backend/src/test/java/com/plotchain/booking/BookingControllerTest.java`

**Interfaces:**
- Consumes: `BookingService.createBooking` (Task 4), `CreateBookingRequest`/`BookingResponse` (Task 3).
- Produces: `POST /api/admin/bookings` → 201 `BookingResponse` — consumed by Task 8 (SecurityConfig wiring).

- [ ] **Step 1: Write the failing tests**

```java
package com.plotchain.booking;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.auth.JwtService;
import com.plotchain.projects.PlotNotFoundException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class BookingControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;
    @MockBean BookingService bookingService;

    private static final String REQUEST_BODY = """
        {"plotId":"%s","associateId":"%s"}
        """;

    private String tokenFor(AssociateRole role) {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(role);
        when(associateRepository.findById(associate.getId())).thenReturn(Optional.of(associate));
        return jwtService.generateToken(associate);
    }

    @Test
    void createReturns404WhenThePlotDoesNotExist() throws Exception {
        UUID plotId = UUID.randomUUID();
        when(bookingService.createBooking(any(CreateBookingRequest.class)))
            .thenThrow(new PlotNotFoundException(plotId));

        mockMvc.perform(post("/api/admin/bookings")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(REQUEST_BODY.formatted(plotId, UUID.randomUUID())))
            .andExpect(status().isNotFound());
    }

    @Test
    void createReturns404WhenTheAssociateDoesNotExist() throws Exception {
        UUID associateId = UUID.randomUUID();
        when(bookingService.createBooking(any(CreateBookingRequest.class)))
            .thenThrow(new AssociateNotFoundException(associateId));

        mockMvc.perform(post("/api/admin/bookings")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(REQUEST_BODY.formatted(UUID.randomUUID(), associateId)))
            .andExpect(status().isNotFound());
    }

    @Test
    void createReturns409WhenThePlotIsNotAvailable() throws Exception {
        UUID plotId = UUID.randomUUID();
        when(bookingService.createBooking(any(CreateBookingRequest.class)))
            .thenThrow(new PlotNotAvailableException(plotId));

        mockMvc.perform(post("/api/admin/bookings")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(REQUEST_BODY.formatted(plotId, UUID.randomUUID())))
            .andExpect(status().isConflict());
    }

    @Test
    void createIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(post("/api/admin/bookings")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE))
                .contentType("application/json")
                .content(REQUEST_BODY.formatted(UUID.randomUUID(), UUID.randomUUID())))
            .andExpect(status().isForbidden());
    }

    @Test
    void createReturns201WithAFullyPopulatedBookingResponse() throws Exception {
        UUID bookingId = UUID.randomUUID();
        UUID plotId = UUID.randomUUID();
        UUID associateId = UUID.randomUUID();
        BookingResponse response = new BookingResponse(
            bookingId, plotId, associateId, new BigDecimal("600000.00"), 4, Instant.now(),
            List.of(new EmiInstallmentResponse(1, new BigDecimal("150000.00"), LocalDate.now().plusMonths(1))));
        when(bookingService.createBooking(any(CreateBookingRequest.class))).thenReturn(response);

        mockMvc.perform(post("/api/admin/bookings")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(REQUEST_BODY.formatted(plotId, associateId)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.id").value(bookingId.toString()))
            .andExpect(jsonPath("$.installmentCount").value(4))
            .andExpect(jsonPath("$.installments[0].installmentNumber").value(1));
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail on missing `BookingController`**

Run: `cd backend && mvn -q -Dtest=BookingControllerTest test`
Expected: compile error or 404-for-everything failure — `BookingController` does not exist yet, so `POST /api/admin/bookings` isn't mapped.

- [ ] **Step 3: Write `BookingController`**

```java
package com.plotchain.booking;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/bookings")
public class BookingController {

    private final BookingService bookingService;

    public BookingController(BookingService bookingService) {
        this.bookingService = bookingService;
    }

    // Admin books a plot against any associate's record (data visibility matrix, Plot/project
    // inventory row, Admin column: "books plots against any associate's record") -- same
    // Admin-acts-on-an-associate's-behalf request shape as Sales' POST /api/admin/sales
    // (CreateSaleRequest: plotId + associateId, no client-supplied amount).
    @PostMapping
    public ResponseEntity<BookingResponse> create(@Valid @RequestBody CreateBookingRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(bookingService.createBooking(request));
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && mvn -q -Dtest=BookingControllerTest test`
Expected: `BUILD SUCCESS`. Note `createIsForbiddenForAnAssociateToken` requires Task 8's `SecurityConfig` matcher to actually 403 — if Task 8 hasn't landed yet, this specific test will fail with something other than 403 (likely 201, since without the matcher an associate token would currently be blocked by the blanket `POST /api/**` → `hasAuthority("ADMIN")` rule already in `SecurityConfig`, so it should still 403 even before Task 8 — the blanket rule alone is sufficient for this test; Task 8 only adds the *narrower* rule for readability/grouping, matching how Sales' equivalent matcher is documented as non-essential-for-authorization but added for convention). Confirm this test passes now; if it doesn't, do not proceed to Task 8 to "fix" it — diagnose why the blanket rule isn't applying first.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/booking/BookingController.java \
        backend/src/test/java/com/plotchain/booking/BookingControllerTest.java
git commit -m "feat(booking): add POST /api/admin/bookings"
```

---

### Task 7: `AssociateBookingController` — associate self-view endpoint

**Files:**
- Create: `backend/src/main/java/com/plotchain/booking/AssociateBookingController.java`
- Test: `backend/src/test/java/com/plotchain/booking/AssociateBookingControllerTest.java`

**Interfaces:**
- Consumes: `BookingService.getMyBookings` (Task 4/5).
- Produces: `GET /api/associates/me/bookings` → 200 `AssociateBookingPageResponse`.

- [ ] **Step 1: Write the failing tests**

```java
package com.plotchain.booking;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.auth.JwtService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AssociateBookingControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;
    @MockBean BookingService bookingService;

    private String tokenFor(AssociateRole role, UUID associateId) {
        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setRole(role);
        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));
        return jwtService.generateToken(associate);
    }

    @Test
    void getMyBookingsReturns200WithThePageForTheCallersOwnJwtAssociateId() throws Exception {
        UUID associateId = UUID.randomUUID();
        UUID bookingId = UUID.randomUUID();
        BookingResponse booking = new BookingResponse(
            bookingId, UUID.randomUUID(), associateId, new BigDecimal("600000.00"), 1, Instant.now(),
            List.of(new EmiInstallmentResponse(1, new BigDecimal("600000.00"), LocalDate.now().plusMonths(1))));
        AssociateBookingPageResponse page = new AssociateBookingPageResponse(List.of(booking), 0, 20, 1);
        when(bookingService.getMyBookings(eq(associateId), eq(0), eq(20))).thenReturn(page);

        mockMvc.perform(get("/api/associates/me/bookings")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE, associateId)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.bookings[0].id").value(bookingId.toString()))
            .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void getMyBookingsClampsPageAndSizeTheSameWayOtherAssociateMeEndpointsDo() throws Exception {
        UUID associateId = UUID.randomUUID();
        AssociateBookingPageResponse page = new AssociateBookingPageResponse(List.of(), 0, 100, 0);
        when(bookingService.getMyBookings(eq(associateId), eq(0), eq(100))).thenReturn(page);

        mockMvc.perform(get("/api/associates/me/bookings")
                .param("page", "-1")
                .param("size", "500")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE, associateId)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.size").value(100));
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && mvn -q -Dtest=AssociateBookingControllerTest test`
Expected: 404 or compile error — the route isn't mapped yet.

- [ ] **Step 3: Write `AssociateBookingController`**

```java
package com.plotchain.booking;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

// Bare @RestController, same shape as AssociateSaleController -- SecurityConfig's own comment
// there explains why: a class-level @RequestMapping("/api/admin/bookings") on BookingController
// would make an absolute-path method mapping here compose incorrectly. No SecurityConfig matcher
// needed either: a bare GET never collides with the blanket POST/PUT/PATCH/DELETE write rules,
// so it falls through to anyRequest().authenticated() the same way GET /api/associates/me/sales
// already does with no matcher of its own.
@RestController
public class AssociateBookingController {

    private final BookingService bookingService;

    public AssociateBookingController(BookingService bookingService) {
        this.bookingService = bookingService;
    }

    // Self-scoped by construction: associateId always comes from the verified JWT, never the
    // request -- same reasoning as AssociateSaleController.getMySales.
    @GetMapping("/api/associates/me/bookings")
    public AssociateBookingPageResponse getMyBookings(
            @AuthenticationPrincipal UUID associateId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        page = Math.max(page, 0);
        size = Math.min(size, 100);
        return bookingService.getMyBookings(associateId, page, size);
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && mvn -q -Dtest=AssociateBookingControllerTest test`
Expected: `BUILD SUCCESS`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/booking/AssociateBookingController.java \
        backend/src/test/java/com/plotchain/booking/AssociateBookingControllerTest.java
git commit -m "feat(booking): add GET /api/associates/me/bookings"
```

---

### Task 8: `SecurityConfig` wiring + matcher tests

**Files:**
- Modify: `backend/src/main/java/com/plotchain/auth/SecurityConfig.java`
- Modify: `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`

**Interfaces:**
- Consumes: nothing new.
- Produces: `POST /api/admin/bookings` explicitly gated `hasAuthority("ADMIN")`.

- [ ] **Step 1: Write the failing tests**

Add to `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`, near the existing `adminSalesRecordIsReachableOnlyForAdminAndForbiddenForEveryOtherRole` test (add `import org.junit.jupiter.params.ParameterizedTest;` and `import org.junit.jupiter.params.provider.EnumSource;` if not already imported — they already are, per the existing test at that location):

```java
    // Role-capability unit 7 (docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md,
    // Plot/project inventory row, Admin column: "books plots against any associate's record"):
    // POST /api/admin/bookings is ADMIN-only, same target-role-model pattern and first-match-wins
    // placement as the Sales matchers directly above. A random, non-existent plotId reaches the
    // real (H2, unmocked) PlotRepository and 404s for the ADMIN token -- proof the request passed
    // the security layer, not proof of any particular business outcome, same "assert not 403"
    // reasoning as passwordChangeIsReachableByAnAssociateToken elsewhere in this file. Every
    // other role is blocked at the filter layer before the controller ever runs.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminBookingsCreateIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        String body = new ObjectMapper().writeValueAsString(
            new com.plotchain.booking.CreateBookingRequest(UUID.randomUUID(), UUID.randomUUID()));

        mockMvc.perform(post("/api/admin/bookings")
                .header("Authorization", "Bearer " + tokenFor(role))
                .contentType("application/json")
                .content(body))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 404 : 403));
    }

    // Role-capability unit 7: GET /api/associates/me/bookings needs no explicit SecurityConfig
    // matcher -- a bare GET never collides with the blanket POST/PUT/PATCH/DELETE write rules
    // above, so it falls through to anyRequest().authenticated() below, the same way GET
    // /api/associates/me/sales already does with no matcher of its own. This test proves the
    // route is reachable by an ordinary associate token, not accidentally blocked by 403.
    @Test
    void associateMeBookingsIsReachableByAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/associates/me/bookings")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().is(not(403)));
    }
```

- [ ] **Step 2: Run the tests to verify current state**

Run: `cd backend && mvn -q -Dtest=SecurityConfigTest#adminBookingsCreateIsReachableOnlyForAdminAndForbiddenForEveryOtherRole,SecurityConfigTest#associateMeBookingsIsReachableByAnAssociateToken test`
Expected: both tests already pass, because the blanket `POST /api/**` → `hasAuthority("ADMIN")` rule and the bare-GET fallthrough (`anyRequest().authenticated()`) already cover these routes without any new matcher — same as the note at the end of Task 6 Step 4. If `adminBookingsCreateIsReachableOnlyForAdminAndForbiddenForEveryOtherRole` fails for the ADMIN case with something other than 404, investigate before adding the matcher in Step 3 — it means `BookingController`/`BookingService` from Tasks 4-6 isn't wired correctly, not a `SecurityConfig` gap.

- [ ] **Step 3: Add the explicit matcher for grouping/readability**

Modify `backend/src/main/java/com/plotchain/auth/SecurityConfig.java` — insert immediately after the existing `GET /api/admin/sales` matcher block (right before `.requestMatchers(HttpMethod.POST, "/api/**")`):

```java
                // Book a plot: ADMIN-only, per role-capability unit 7
                // (docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md,
                // Plot/project inventory row, Admin column: "books plots against any associate's
                // record"), same target-role-model reasoning and first-match-wins placement as
                // the Sales matchers directly above -- not load-bearing on its own (the blanket
                // POST rule below already covers it), added for the same readability/grouping
                // reason those Sales matchers document.
                .requestMatchers(HttpMethod.POST, "/api/admin/bookings")
                    .hasAuthority("ADMIN")
```

- [ ] **Step 4: Run the full test file**

Run: `cd backend && mvn -q -Dtest=SecurityConfigTest test`
Expected: `BUILD SUCCESS`, all tests green (no change in behavior from Step 2, confirming the matcher is additive/non-breaking).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/auth/SecurityConfig.java \
        backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java
git commit -m "feat(booking): wire POST /api/admin/bookings through SecurityConfig"
```

---

### Task 9: Concurrency test — proves the double-booking race is actually closed

**Files:**
- Create: `backend/src/test/java/com/plotchain/booking/BookingConcurrencyTest.java`

**Interfaces:**
- Consumes: `BookingService.createBooking` (Task 4), `PlotRepository.findByIdForUpdate` (existing).

This directly exercises the "a booked plot should not be independently bookable again" acceptance criterion under real concurrency, the same way `SaleRecordConcurrencyTest` exercises Sales' equivalent race. Uses the real H2 (`MODE=PostgreSQL`) test datasource — row-lock blocking is a database property, not application code, so a mocked repository can't prove it.

- [ ] **Step 1: Write the test**

```java
package com.plotchain.booking;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.payments.BookingEmiConfigRepository;
import com.plotchain.projects.Plot;
import com.plotchain.projects.PlotRepository;
import com.plotchain.projects.PlotStatus;
import com.plotchain.projects.PlotType;
import com.plotchain.projects.Project;
import com.plotchain.projects.ProjectRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

// Exercises the row-lock/serialization mechanism BookingService.createBooking uses, same
// PlotRepository.findByIdForUpdate this codebase already added for Sales unit 3's identical
// double-sell race (SaleRecordConcurrencyTest is this test's direct template). Two concurrent
// POST /api/admin/bookings requests against the same plot must not both pass the AVAILABLE
// check before either commits -- a double-booked plot and an over-generated EMI schedule.
@SpringBootTest
@ActiveProfiles("test")
class BookingConcurrencyTest {

    @Autowired BookingService bookingService;
    @Autowired PlotRepository plotRepository;
    @Autowired ProjectRepository projectRepository;
    @Autowired AssociateRepository associateRepository;
    @Autowired PlotBookingRepository plotBookingRepository;
    @Autowired EmiInstallmentRepository emiInstallmentRepository;
    @Autowired BookingEmiConfigRepository bookingEmiConfigRepository;
    @Autowired PlatformTransactionManager transactionManager;

    private UUID plotId;
    private UUID projectId;
    private UUID associateId;

    @AfterEach
    void cleanUp() {
        // Delete child rows first: the "succeeds" test lets a real createBooking() commit a
        // PlotBooking (FK -> plot, associate) and its EmiInstallment rows (FK -> plot_booking).
        if (associateId != null) {
            List<PlotBooking> bookings = plotBookingRepository.findAll().stream()
                .filter(b -> associateId.equals(b.getAssociateId())).toList();
            for (PlotBooking booking : bookings) {
                List<EmiInstallment> installments = emiInstallmentRepository
                    .findByBookingIdOrderByInstallmentNumberAsc(booking.getId());
                emiInstallmentRepository.deleteAll(installments);
            }
            plotBookingRepository.deleteAll(bookings);
        }
        if (plotId != null) {
            plotRepository.deleteById(plotId);
        }
        if (projectId != null) {
            projectRepository.deleteById(projectId);
        }
        if (associateId != null) {
            associateRepository.deleteById(associateId);
        }
    }

    private UUID seedAvailablePlot() {
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        return tx.execute(status -> {
            Project project = new Project(UUID.randomUUID(), "Green Valley", "Hyderabad", null, null, Instant.now());
            projectRepository.saveAndFlush(project);
            projectId = project.getId();

            Plot plot = new Plot(UUID.randomUUID(), project.getId(), "A-101", PlotType.NORMAL,
                new BigDecimal("1200.00"), new BigDecimal("500.00"), new BigDecimal("600000.00"),
                PlotStatus.AVAILABLE);
            plotRepository.saveAndFlush(plot);
            return plot.getId();
        });
    }

    private UUID seedAssociate() {
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        return tx.execute(status -> {
            UUID id = UUID.randomUUID();
            Associate associate = new Associate();
            associate.setId(id);
            associate.setPosition("L");
            associate.setName("Test Associate");
            associate.setKycStatus(KycStatus.VERIFIED);
            associate.setJoinedAt(Instant.now());
            associate.setCumulativeMatchedVolume(BigDecimal.ZERO);
            associate.setUserId("u-" + id);
            associate.setEmail(id + "@test.local");
            associate.setPasswordHash("$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C");
            // ADMIN, not ASSOCIATE: same reasoning as SaleRecordConcurrencyTest.seedAssociate --
            // chk_associate_rank_required (V4) demands a rank_id for any ASSOCIATE row, and this
            // test only needs a persistable, FK-satisfying associate row to exercise the Plot
            // row lock, not a real rank-tiered associate.
            associate.setRole(AssociateRole.ADMIN);
            associateRepository.saveAndFlush(associate);
            return id;
        });
    }

    private CreateBookingRequest bookingRequestFor(UUID plotId, UUID associateId) {
        return new CreateBookingRequest(plotId, associateId);
    }

    private void awaitQuietly(CountDownLatch latch) {
        try {
            latch.await(5, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    @Test
    void secondCreateBookingBlocksUntilFirstTransactionResolvesThenSucceedsIfPlotIsStillAvailable() throws Exception {
        plotId = seedAvailablePlot();
        associateId = seedAssociate();

        CountDownLatch lockHeld = new CountDownLatch(1);
        CountDownLatch releaseLock = new CountDownLatch(1);
        List<String> events = Collections.synchronizedList(new ArrayList<>());
        ExecutorService pool = Executors.newFixedThreadPool(2);
        TransactionTemplate holderTx = new TransactionTemplate(transactionManager);

        Future<?> holder = pool.submit(() -> holderTx.executeWithoutResult(status -> {
            plotRepository.findByIdForUpdate(plotId).orElseThrow();
            events.add("holder-locked");
            lockHeld.countDown();
            awaitQuietly(releaseLock);
        }));

        lockHeld.await(5, TimeUnit.SECONDS);

        Future<BookingResponse> second = pool.submit(() -> {
            events.add("second-calling");
            BookingResponse response = bookingService.createBooking(bookingRequestFor(plotId, associateId));
            events.add("second-returned");
            return response;
        });

        Thread.sleep(300);
        assertThat(events).containsExactly("holder-locked", "second-calling");

        releaseLock.countDown();
        holder.get(5, TimeUnit.SECONDS);
        BookingResponse response = second.get(5, TimeUnit.SECONDS);

        assertThat(events).containsExactly("holder-locked", "second-calling", "second-returned");
        assertThat(response.plotId()).isEqualTo(plotId);
        assertThat(plotRepository.findById(plotId).orElseThrow().getStatus()).isEqualTo(PlotStatus.BOOKED);
    }

    @Test
    void secondCreateBookingBlocksUntilFirstTransactionResolvesThenGetsPlotNotAvailableIfFirstBookedThePlot() throws Exception {
        plotId = seedAvailablePlot();
        associateId = seedAssociate();

        CountDownLatch lockHeld = new CountDownLatch(1);
        CountDownLatch releaseLock = new CountDownLatch(1);
        List<String> events = Collections.synchronizedList(new ArrayList<>());
        ExecutorService pool = Executors.newFixedThreadPool(2);
        TransactionTemplate holderTx = new TransactionTemplate(transactionManager);

        Future<?> holder = pool.submit(() -> holderTx.executeWithoutResult(status -> {
            Plot locked = plotRepository.findByIdForUpdate(plotId).orElseThrow();
            // Stands in for a real first createBooking call's Plot -> BOOKED flip
            // (BookingService.java), which happens inside the same locked transaction in
            // production code.
            locked.setStatus(PlotStatus.BOOKED);
            plotRepository.save(locked);
            events.add("holder-locked");
            lockHeld.countDown();
            awaitQuietly(releaseLock);
        }));

        lockHeld.await(5, TimeUnit.SECONDS);

        Future<BookingResponse> second = pool.submit(() -> {
            events.add("second-calling");
            BookingResponse response = bookingService.createBooking(bookingRequestFor(plotId, associateId));
            events.add("second-returned");
            return response;
        });

        Thread.sleep(300);
        assertThat(events).containsExactly("holder-locked", "second-calling");

        releaseLock.countDown();
        holder.get(5, TimeUnit.SECONDS);

        assertThatThrownBy(second::get).hasCauseInstanceOf(PlotNotAvailableException.class);
        pool.shutdownNow();
    }
}
```

- [ ] **Step 2: Run the tests**

Run: `cd backend && mvn -q -Dtest=BookingConcurrencyTest test`
Expected: `BUILD SUCCESS`, both tests green. If the first test's holder thread finishes too fast for the 300ms window to catch the block reliably, this mirrors a known-flaky-in-theory pattern already accepted for `SaleRecordConcurrencyTest` — do not "fix" by removing the lock assertion, only adjust the sleep duration if it's demonstrably flaky in CI.

- [ ] **Step 3: Commit**

```bash
git add backend/src/test/java/com/plotchain/booking/BookingConcurrencyTest.java
git commit -m "test(booking): prove the Plot row lock closes the double-booking race"
```

---

## Final verification

- [ ] **Run the full backend test suite**

Run: `cd backend && mvn test`
Expected: all `com.plotchain.booking.*` tests green. Some pre-existing unrelated failures may appear (JDK21/25 Mockito mismatch — see project memory `plotchain_jdk_mockito_env_issue.md` — and possibly a handful of expected-residual-red tests from other in-flight units per `docs/superpowers/plans/2026-08-03-role-capability-units.md`'s running log). Diff against a clean `master` baseline before classifying anything as "pre-existing/unrelated" — do not take that classification on faith, per the explicit lesson logged for role-capability unit 2's near-miss in the same units-queue doc.

## Explicit non-goals (do not implement these — no acceptance criterion asks for them)

- No admin-facing `GET /api/admin/bookings` list/register endpoint. The acceptance criteria only require Admin to *create* a booking; Admin can already see a plot's `BOOKED` status via the existing `GET /api/company/projects/{id}/plots` endpoints.
- No booking cancellation/void endpoint, no `BOOKED -> AVAILABLE` release path. Symmetrical to Sales having its own separate `voidSale` (a different unit's scope entirely) — if a "cancel a booking" capability is needed later, it's a new unit, not smuggled into this one.
- No `confirmRule`/`confirmThresholdPercent` workflow (auto-confirm on a payment threshold, KYC-gating a booking, etc.) — `BookingEmiConfig` carries these fields for a booking-confirmation feature this unit doesn't build; a booking is created directly in its completed shape.
- No EMI-payment recording (marking an installment paid, tracking overdue status). This unit only generates and persists the schedule; nothing in the acceptance criteria asks for payment tracking.
- No changes to `BookingEmiConfig`/`BookingEmiConfigController`/`Service` themselves — read-only policy input.
