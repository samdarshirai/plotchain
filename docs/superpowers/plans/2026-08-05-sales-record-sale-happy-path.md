# Sales — Record Sale Happy Path (Unit 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `POST /api/admin/sales` actually record a sale: flip the `Plot` to `SOLD`, stamp the current cycle, persist a `Sale` row with snapshotted `amount`/`legCredited`, and synchronously credit Direct Income as a `PENDING` `LedgerEntry` — all inside one transaction, all-or-nothing.

**Architecture:** `SaleService.recordSale(...)` currently ends in a placeholder `throw` after its three existing guards (plot exists/available, associate exists). This plan replaces only that placeholder with the real happy-path logic from the source spec's flow steps 4-9, and wires in four new constructor dependencies (`CycleService`, `CompensationPlanVersionRepository`, `SaleRepository`, `LedgerEntryRepository`) that the placeholder never needed. `LedgerEntry` also gets a new `sourceRef` field — the DB column exists (`V16__sale.sql`) but no Java field maps it yet.

**Tech Stack:** Spring Boot (constructor injection, `@Transactional`), Spring Data JPA, JUnit 5 + Mockito (`@ExtendWith(MockitoExtension.class)`), MockMvc + real JWT for controller tests, AssertJ (`isEqualByComparingTo` for `BigDecimal`).

## Global Constraints

- `Sale.amount` is a snapshot of `Plot.price` taken at record time, never a live reference (source spec Decision 1).
- `Sale.legCredited` is a snapshot of `associate.getPosition()` taken at record time, never a live lookup (source spec Decision 7). `Associate.position` is literally the string `"L"` or `"R"` (see `CreateAssociateRequest`'s `@Pattern(regexp = "L|R")` and the `sale.leg_credited` column's `CHECK (leg_credited IN ('L','R'))` in `V16__sale.sql`) — snapshot the value as-is, no translation.
- Admin-charge deduction always uses `CompensationPlanVersion.getAdminChargeWithoutPanPct()` — never `getAdminChargeWithPanPct()`. `Associate` has no `pan_number` field; this is a documented simplification (Decision 4), not a bug to fix in this unit.
- BigDecimal percentage math follows the exact convention already established in `DashboardService.java:88` (`backend/src/main/java/com/plotchain/dashboard/DashboardService.java`): `base.multiply(pct.divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP))`. Do not invent a different scale/rounding convention.
- `Plot` save, `Sale` save, and `LedgerEntry` save must be atomic (all three or none) — `SaleService.recordSale(...)` gets `@Transactional`, matching `CycleService.close()`'s precedent for multi-entity-write services in this codebase.
- Entity IDs in this codebase are application-assigned, not `@GeneratedValue` — every new `Sale` and `LedgerEntry` gets `UUID.randomUUID()` set explicitly before `.save(...)`, matching `CycleService.openNewCycle(...)`'s `cycle.setId(UUID.randomUUID())` convention.
- Repositories in tests are mocked with Mockito (no real Spring context in `SaleServiceTest`), so every entity mutation the spec requires "saved" needs an explicit `.save(...)` call in the implementation — JPA dirty-checking isn't observable through a mock and won't satisfy `verify(...)` assertions.

---

## Missing compensation plan version — resolved as: throw, don't zero out

`DashboardService.getDashboard(...)` (line 82-85) handles an empty `findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(...)` result with:
```java
.orElseThrow(() -> new IllegalStateException("compensation_plan_version row missing - V8 migration seeds it"));
```
This plan follows that exact convention in `SaleService` rather than inventing a different one, and rather than silently producing a zero-value `LedgerEntry`. Reasoning: `DashboardService`'s stat is read-only and re-computed on every request, so a wrong answer there is transient and low-stakes. Here, a silently-zeroed Direct Income `LedgerEntry` would be a **written, persisted, incorrect financial record** that shortchanges the associate — worse than failing loudly, and harder to detect after the fact than an exception that surfaces immediately at record time. Combined with `@Transactional`, throwing here also rolls back the `Plot`→`SOLD` flip and the `Sale` row, so an admin retrying the sale after fixing the missing compensation plan version doesn't collide with an already-SOLD plot from a half-completed first attempt.

---

### Task 1: Add `LedgerEntry.sourceRef` and wire `SaleService`'s new dependencies (no behavior change)

**Files:**
- Modify: `backend/src/main/java/com/plotchain/income/LedgerEntry.java`
- Modify: `backend/src/main/java/com/plotchain/sales/SaleService.java`
- Modify: `backend/src/test/java/com/plotchain/sales/SaleServiceTest.java`

**Interfaces:**
- Consumes: `CycleService.getOrOpenCurrent()` (`backend/src/main/java/com/plotchain/cycle/CycleService.java`) — no-arg, returns `Cycle`. `CompensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(LocalDate)` — returns `Optional<CompensationPlanVersion>`. `SaleRepository` and `LedgerEntryRepository` — both bare `JpaRepository<T, UUID>`, `.save(T)` used.
- Produces: `SaleService`'s new 6-arg constructor `(PlotRepository, AssociateRepository, CycleService, CompensationPlanVersionRepository, SaleRepository, LedgerEntryRepository)` — Task 2 builds on this signature. `LedgerEntry.getSourceRef()`/`setSourceRef(UUID)` — Task 2's ledger-entry creation uses this.

This task only changes the constructor and adds the field; `recordSale(...)`'s body still ends in the placeholder `throw`. This keeps the deliverable small and independently verifiable: "the new dependencies are correctly wired and nothing broke" is a distinct, reviewable claim from "the happy-path logic is correct" (Task 2).

- [ ] **Step 1: Add `sourceRef` to `LedgerEntry`**

Edit `backend/src/main/java/com/plotchain/income/LedgerEntry.java`. Add the field (with the rest of the `@Column` fields) and its getter/setter (with the rest of the getters/setters):

```java
    @Column(name = "source_ref")
    private UUID sourceRef;
```

```java
    public UUID getSourceRef() { return sourceRef; }
    public void setSourceRef(UUID sourceRef) { this.sourceRef = sourceRef; }
```

No `nullable = false` — the column is nullable in `V16__sale.sql` (`source_ref UUID NULL`), since only `DIRECT` entries populate it today.

- [ ] **Step 2: Update `SaleServiceTest`'s mocks and constructor call for the new signature**

Edit `backend/src/test/java/com/plotchain/sales/SaleServiceTest.java`. Add four new `@Mock` fields alongside the existing two, and update `setUp()`:

```java
    @Mock PlotRepository plotRepository;
    @Mock AssociateRepository associateRepository;
    @Mock com.plotchain.cycle.CycleService cycleService;
    @Mock com.plotchain.compensation.CompensationPlanVersionRepository compensationPlanVersionRepository;
    @Mock SaleRepository saleRepository;
    @Mock com.plotchain.income.LedgerEntryRepository ledgerEntryRepository;

    SaleService saleService;

    private static final UUID PLOT_ID = UUID.randomUUID();
    private static final UUID ASSOCIATE_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        saleService = new SaleService(
            plotRepository, associateRepository, cycleService,
            compensationPlanVersionRepository, saleRepository, ledgerEntryRepository);
    }
```

(Use proper top-of-file imports instead of fully-qualified names in the final edit — `com.plotchain.cycle.CycleService`, `com.plotchain.cycle.Cycle`, `com.plotchain.compensation.CompensationPlanVersionRepository`, `com.plotchain.compensation.CompensationPlanVersion`, `com.plotchain.compensation.SettlementCycle`, `com.plotchain.income.LedgerEntryRepository`, `com.plotchain.income.LedgerEntry`, `com.plotchain.income.LedgerEntryStatus`, `com.plotchain.income.IncomeType`, `java.time.Instant`, `java.time.LocalDate`, `org.mockito.ArgumentCaptor` — Task 2 needs all of these too, so add them now.)

Leave the four existing `@Test` methods untouched except that they now compile against the new constructor — their assertions (`PlotNotFoundException`, `PlotNotAvailableException`, `AssociateNotFoundException`, and the placeholder-`UnsupportedOperationException` test) still hold, since `recordSale(...)`'s body hasn't changed yet.

- [ ] **Step 3: Update `SaleService`'s constructor**

Edit `backend/src/main/java/com/plotchain/sales/SaleService.java`:

```java
package com.plotchain.sales;

import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.compensation.CompensationPlanVersionRepository;
import com.plotchain.cycle.CycleService;
import com.plotchain.income.LedgerEntryRepository;
import com.plotchain.projects.Plot;
import com.plotchain.projects.PlotNotFoundException;
import com.plotchain.projects.PlotRepository;
import com.plotchain.projects.PlotStatus;
import org.springframework.stereotype.Service;

@Service
public class SaleService {

    private final PlotRepository plotRepository;
    private final AssociateRepository associateRepository;
    private final CycleService cycleService;
    private final CompensationPlanVersionRepository compensationPlanVersionRepository;
    private final SaleRepository saleRepository;
    private final LedgerEntryRepository ledgerEntryRepository;

    public SaleService(
            PlotRepository plotRepository,
            AssociateRepository associateRepository,
            CycleService cycleService,
            CompensationPlanVersionRepository compensationPlanVersionRepository,
            SaleRepository saleRepository,
            LedgerEntryRepository ledgerEntryRepository) {
        this.plotRepository = plotRepository;
        this.associateRepository = associateRepository;
        this.cycleService = cycleService;
        this.compensationPlanVersionRepository = compensationPlanVersionRepository;
        this.saleRepository = saleRepository;
        this.ledgerEntryRepository = ledgerEntryRepository;
    }

    // Sales unit 2 (docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md,
    // flow "Record a sale", steps 1-3): guards only. Unit 3 inserts the happy-path Plot->SOLD
    // flip, cycle lookup, Sale persistence, and Direct Income ledger entry between the
    // associate lookup below and the placeholder throw -- sequentially, without changing this
    // method's signature -- following the same convention CycleService.close() established for
    // its own unit 4 placeholder.
    public SaleResponse recordSale(CreateSaleRequest request) {
        Plot plot = plotRepository.findById(request.plotId())
            .orElseThrow(() -> new PlotNotFoundException(request.plotId()));

        if (plot.getStatus() != PlotStatus.AVAILABLE) {
            throw new PlotNotAvailableException(plot.getId());
        }

        associateRepository.findById(request.associateId())
            .orElseThrow(() -> new AssociateNotFoundException(request.associateId()));

        // Placeholder: unit 3 replaces this line with Plot->SOLD, cycle lookup, Sale creation,
        // and the Direct Income ledger entry (source spec flow steps 4-9).
        throw new UnsupportedOperationException(
            "Sale recording happy path is not yet implemented (Sales unit 3)");
    }
}
```

Only the constructor and field list changed; the guard logic and placeholder throw are untouched.

- [ ] **Step 4: Run the sales test suite to confirm everything still compiles and passes**

Run: `cd backend && mvn test -Dtest=SaleServiceTest,SaleControllerTest`
Expected: all existing tests PASS (4 in `SaleServiceTest`, 4 in `SaleControllerTest`), nothing new yet.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/income/LedgerEntry.java \
        backend/src/main/java/com/plotchain/sales/SaleService.java \
        backend/src/test/java/com/plotchain/sales/SaleServiceTest.java
git commit -m "refactor(sales): wire SaleService's Sales-unit-3 dependencies, add LedgerEntry.sourceRef"
```

---

### Task 2: Implement the sale-recording happy path (flow steps 4-9)

**Files:**
- Modify: `backend/src/main/java/com/plotchain/sales/SaleService.java`
- Modify: `backend/src/test/java/com/plotchain/sales/SaleServiceTest.java`

**Interfaces:**
- Consumes: `Sale` setters (`backend/src/main/java/com/plotchain/sales/Sale.java`) — `setId`, `setPlotId`, `setAssociateId`, `setBuyerName`, `setBuyerPhone`, `setBuyerEmail`, `setAmount`, `setCycleId`, `setLegCredited`, `setStatus`, `setRecordedAt`. `LedgerEntry` setters (Task 1) — `setId`, `setIncomeType`, `setAssociateId`, `setCycleId`, `setGrossAmount`, `setTdsDeduction`, `setAdminDeduction`, `setNetAmount`, `setStatus`, `setSourceRef`, `setCreatedAt`. `CompensationPlanVersion` getters — `getDirectIncomePct()`, `getTdsPct()`, `getAdminChargeWithoutPanPct()` (all `BigDecimal`). `SaleResponse` record (`backend/src/main/java/com/plotchain/sales/SaleResponse.java`) — `(UUID id, UUID plotId, UUID associateId, String buyerName, String buyerPhone, String buyerEmail, BigDecimal amount, UUID cycleId, String legCredited, String status, String voidReason, Instant recordedAt)`.
- Produces: `SaleService.recordSale(CreateSaleRequest)` now returns a fully-populated `SaleResponse` on success (201 via the existing `SaleController`), or throws `IllegalStateException` if no `CompensationPlanVersion` is configured. Unit 4 (void guards) and unit 5 (void happy path) will read real `RECORDED` `Sale` rows this method persists.

- [ ] **Step 1: Add the new happy-path test methods to `SaleServiceTest`**

Add these helper methods and test methods to `backend/src/test/java/com/plotchain/sales/SaleServiceTest.java` (alongside the existing `plotWithStatus`/`requestFor` helpers):

```java
    private static final UUID CYCLE_ID = UUID.randomUUID();

    private Associate associateWithPosition(String position) {
        Associate associate = new Associate();
        associate.setId(ASSOCIATE_ID);
        associate.setPosition(position);
        return associate;
    }

    private Cycle cycleWithId(UUID id) {
        Cycle cycle = new Cycle();
        cycle.setId(id);
        return cycle;
    }

    private CompensationPlanVersion compensationPlanVersion() {
        return new CompensationPlanVersion(
            UUID.randomUUID(), "v1", LocalDate.now().minusDays(1),
            new BigDecimal("10.00"), BigDecimal.ZERO, BigDecimal.ZERO,
            new BigDecimal("5.00"), BigDecimal.ZERO, new BigDecimal("4.00"),
            BigDecimal.ZERO, BigDecimal.ZERO, SettlementCycle.MONTHLY,
            Instant.now(), null);
    }

    private void stubHappyPathGuardsAndDependencies() {
        when(plotRepository.findById(PLOT_ID)).thenReturn(Optional.of(plotWithStatus(PlotStatus.AVAILABLE)));
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associateWithPosition("L")));
        when(cycleService.getOrOpenCurrent()).thenReturn(cycleWithId(CYCLE_ID));
        when(saleRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(ledgerEntryRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(compensationPlanVersionRepository
                .findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(any()))
            .thenReturn(Optional.of(compensationPlanVersion()));
    }

    @Test
    void recordSaleFlipsThePlotToSold() {
        stubHappyPathGuardsAndDependencies();

        saleService.recordSale(requestFor(PLOT_ID, ASSOCIATE_ID));

        ArgumentCaptor<Plot> captor = ArgumentCaptor.forClass(Plot.class);
        verify(plotRepository).save(captor.capture());
        assertThat(captor.getValue().getStatus()).isEqualTo(PlotStatus.SOLD);
    }

    @Test
    void recordSaleStampsTheCurrentCycleOntoTheSale() {
        stubHappyPathGuardsAndDependencies();

        saleService.recordSale(requestFor(PLOT_ID, ASSOCIATE_ID));

        verify(cycleService).getOrOpenCurrent();
        ArgumentCaptor<Sale> captor = ArgumentCaptor.forClass(Sale.class);
        verify(saleRepository).save(captor.capture());
        assertThat(captor.getValue().getCycleId()).isEqualTo(CYCLE_ID);
    }

    @Test
    void recordSaleSavesASaleWithAmountAndLegSnapshottedAtRecordTime() {
        stubHappyPathGuardsAndDependencies();

        saleService.recordSale(requestFor(PLOT_ID, ASSOCIATE_ID));

        ArgumentCaptor<Sale> captor = ArgumentCaptor.forClass(Sale.class);
        verify(saleRepository).save(captor.capture());
        Sale saved = captor.getValue();
        assertThat(saved.getPlotId()).isEqualTo(PLOT_ID);
        assertThat(saved.getAssociateId()).isEqualTo(ASSOCIATE_ID);
        assertThat(saved.getAmount()).isEqualByComparingTo("600000.00");
        assertThat(saved.getLegCredited()).isEqualTo("L");
        assertThat(saved.getStatus()).isEqualTo(SaleStatus.RECORDED);
        assertThat(saved.getRecordedAt()).isNotNull();
        assertThat(saved.getBuyerName()).isEqualTo("Jane Buyer");
        assertThat(saved.getBuyerPhone()).isEqualTo("9999999999");
    }

    @Test
    void recordSaleSavesADirectIncomeLedgerEntryWithCorrectMath() {
        stubHappyPathGuardsAndDependencies();

        SaleResponse response = saleService.recordSale(requestFor(PLOT_ID, ASSOCIATE_ID));

        ArgumentCaptor<LedgerEntry> captor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository).save(captor.capture());
        LedgerEntry entry = captor.getValue();
        assertThat(entry.getIncomeType()).isEqualTo(IncomeType.DIRECT);
        assertThat(entry.getAssociateId()).isEqualTo(ASSOCIATE_ID);
        assertThat(entry.getCycleId()).isEqualTo(CYCLE_ID);
        // gross = 600000.00 * (10.00 / 100) = 60000
        assertThat(entry.getGrossAmount()).isEqualByComparingTo("60000");
        // tds = 60000 * (5.00 / 100) = 3000
        assertThat(entry.getTdsDeduction()).isEqualByComparingTo("3000");
        // admin = 60000 * (4.00 / 100) = 2400 -- always the without-PAN tier (Decision 4)
        assertThat(entry.getAdminDeduction()).isEqualByComparingTo("2400");
        // net = 60000 - 3000 - 2400 = 54600
        assertThat(entry.getNetAmount()).isEqualByComparingTo("54600");
        assertThat(entry.getStatus()).isEqualTo(LedgerEntryStatus.PENDING);
        assertThat(entry.getSourceRef()).isEqualTo(response.id());
        assertThat(entry.getCreatedAt()).isNotNull();
    }

    @Test
    void recordSaleReturnsAFullyPopulatedSaleResponse() {
        stubHappyPathGuardsAndDependencies();

        SaleResponse response = saleService.recordSale(requestFor(PLOT_ID, ASSOCIATE_ID));

        assertThat(response.id()).isNotNull();
        assertThat(response.plotId()).isEqualTo(PLOT_ID);
        assertThat(response.associateId()).isEqualTo(ASSOCIATE_ID);
        assertThat(response.buyerName()).isEqualTo("Jane Buyer");
        assertThat(response.buyerPhone()).isEqualTo("9999999999");
        assertThat(response.buyerEmail()).isNull();
        assertThat(response.amount()).isEqualByComparingTo("600000.00");
        assertThat(response.cycleId()).isEqualTo(CYCLE_ID);
        assertThat(response.legCredited()).isEqualTo("L");
        assertThat(response.status()).isEqualTo("RECORDED");
        assertThat(response.voidReason()).isNull();
        assertThat(response.recordedAt()).isNotNull();
    }

    @Test
    void recordSaleThrowsIllegalStateExceptionWhenNoCompensationPlanVersionIsConfigured() {
        when(plotRepository.findById(PLOT_ID)).thenReturn(Optional.of(plotWithStatus(PlotStatus.AVAILABLE)));
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associateWithPosition("L")));
        when(cycleService.getOrOpenCurrent()).thenReturn(cycleWithId(CYCLE_ID));
        when(saleRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(compensationPlanVersionRepository
                .findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(any()))
            .thenReturn(Optional.empty());

        assertThatThrownBy(() -> saleService.recordSale(requestFor(PLOT_ID, ASSOCIATE_ID)))
            .isInstanceOf(IllegalStateException.class);

        verify(ledgerEntryRepository, never()).save(any());
    }
```

Remove the now-obsolete placeholder test, `recordSaleReachesThePlaceholderWhenAllGuardsPass` (its assertion — that all-guards-pass reaches an `UnsupportedOperationException` — is no longer true once this task lands, and is superseded by the six tests above).

Also add these imports (needed by the new test code, on top of the existing ones):

```java
import com.plotchain.compensation.CompensationPlanVersion;
import com.plotchain.compensation.SettlementCycle;
import com.plotchain.cycle.Cycle;
import com.plotchain.income.IncomeType;
import com.plotchain.income.LedgerEntry;
import com.plotchain.income.LedgerEntryStatus;

import java.time.Instant;
import java.time.LocalDate;

import org.mockito.ArgumentCaptor;

import static org.assertj.core.api.Assertions.assertThat;
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `cd backend && mvn test -Dtest=SaleServiceTest`
Expected: FAIL — the six new tests fail because `recordSale(...)` still throws `UnsupportedOperationException` instead of doing the real work; the removed placeholder test's absence means no failure there.

- [ ] **Step 3: Implement the happy-path logic in `SaleService.recordSale(...)`**

Replace the placeholder block in `backend/src/main/java/com/plotchain/sales/SaleService.java` (everything from the associate lookup's `orElseThrow` line down through the closing `throw`) with:

```java
    @Transactional
    public SaleResponse recordSale(CreateSaleRequest request) {
        Plot plot = plotRepository.findById(request.plotId())
            .orElseThrow(() -> new PlotNotFoundException(request.plotId()));

        if (plot.getStatus() != PlotStatus.AVAILABLE) {
            throw new PlotNotAvailableException(plot.getId());
        }

        Associate associate = associateRepository.findById(request.associateId())
            .orElseThrow(() -> new AssociateNotFoundException(request.associateId()));

        // Flow step 4: flip Plot -> SOLD (Decision 1).
        plot.setStatus(PlotStatus.SOLD);
        plotRepository.save(plot);

        // Flow step 5.
        Cycle cycle = cycleService.getOrOpenCurrent();

        // Flow step 6: amount and legCredited are snapshots taken now, never live references
        // (Decisions 1 and 7) -- plot.getPrice() and associate.getPosition() are read once,
        // here, and never re-read from Sale later.
        Sale sale = new Sale();
        sale.setId(UUID.randomUUID());
        sale.setPlotId(plot.getId());
        sale.setAssociateId(associate.getId());
        sale.setBuyerName(request.buyerName());
        sale.setBuyerPhone(request.buyerPhone());
        sale.setBuyerEmail(request.buyerEmail());
        sale.setAmount(plot.getPrice());
        sale.setCycleId(cycle.getId());
        sale.setLegCredited(associate.getPosition());
        sale.setStatus(SaleStatus.RECORDED);
        sale.setRecordedAt(Instant.now());
        sale = saleRepository.save(sale);

        // Flow step 7: same pattern DashboardService already uses. An empty result here is a
        // data-integrity problem, not a valid "no income" case -- see this plan's "Missing
        // compensation plan version" section for why this throws instead of zeroing the ledger
        // entry. @Transactional means this also rolls back the Plot flip and Sale row above.
        CompensationPlanVersion planVersion = compensationPlanVersionRepository
            .findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(LocalDate.now())
            .orElseThrow(() -> new IllegalStateException(
                "compensation_plan_version row missing - V8 migration seeds it"));

        // Flow step 8: Direct Income, computed synchronously. Admin-charge deduction always
        // uses the without-PAN tier (Decision 4) -- Associate has no pan_number field.
        BigDecimal grossAmount = sale.getAmount()
            .multiply(planVersion.getDirectIncomePct().divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP));
        BigDecimal tdsDeduction = grossAmount
            .multiply(planVersion.getTdsPct().divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP));
        BigDecimal adminDeduction = grossAmount
            .multiply(planVersion.getAdminChargeWithoutPanPct().divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP));
        BigDecimal netAmount = grossAmount.subtract(tdsDeduction).subtract(adminDeduction);

        LedgerEntry ledgerEntry = new LedgerEntry();
        ledgerEntry.setId(UUID.randomUUID());
        ledgerEntry.setIncomeType(IncomeType.DIRECT);
        ledgerEntry.setAssociateId(sale.getAssociateId());
        ledgerEntry.setCycleId(sale.getCycleId());
        ledgerEntry.setGrossAmount(grossAmount);
        ledgerEntry.setTdsDeduction(tdsDeduction);
        ledgerEntry.setAdminDeduction(adminDeduction);
        ledgerEntry.setNetAmount(netAmount);
        ledgerEntry.setStatus(LedgerEntryStatus.PENDING);
        ledgerEntry.setSourceRef(sale.getId());
        ledgerEntry.setCreatedAt(Instant.now());
        ledgerEntryRepository.save(ledgerEntry);

        // Flow step 9.
        return toResponse(sale);
    }

    private SaleResponse toResponse(Sale sale) {
        return new SaleResponse(
            sale.getId(),
            sale.getPlotId(),
            sale.getAssociateId(),
            sale.getBuyerName(),
            sale.getBuyerPhone(),
            sale.getBuyerEmail(),
            sale.getAmount(),
            sale.getCycleId(),
            sale.getLegCredited(),
            sale.getStatus().name(),
            sale.getVoidReason(),
            sale.getRecordedAt());
    }
```

Add these imports to `SaleService.java` (on top of Task 1's imports):

```java
import com.plotchain.associate.Associate;
import com.plotchain.compensation.CompensationPlanVersion;
import com.plotchain.cycle.Cycle;
import com.plotchain.income.IncomeType;
import com.plotchain.income.LedgerEntry;
import com.plotchain.income.LedgerEntryStatus;

import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && mvn test -Dtest=SaleServiceTest`
Expected: PASS — all 9 tests (3 original guards + 6 new happy-path/error tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/sales/SaleService.java \
        backend/src/test/java/com/plotchain/sales/SaleServiceTest.java
git commit -m "feat(sales): implement record-sale happy path — Plot flip, cycle stamp, Direct Income ledger entry"
```

---

### Task 3: Add the `SaleControllerTest` 201 case

**Files:**
- Modify: `backend/src/test/java/com/plotchain/sales/SaleControllerTest.java`

**Interfaces:**
- Consumes: `SaleResponse` record (from Task 2/existing) and `SaleController.record(...)` (existing, unchanged — `POST /api/admin/sales` returns `201` via `ResponseEntity.status(HttpStatus.CREATED)`).
- Produces: nothing new for later units — this task is verification-only, confirming the controller/status code from unit 2 (per the AC: "verify they still hold, don't rebuild") correctly serializes a fully-populated `SaleResponse` from unit 3's service.

`SaleControllerTest` mocks `SaleService` via `@MockBean`, so this test doesn't exercise the real ledger math from Task 2 — it only confirms the HTTP layer (status code, JSON shape) that already existed from unit 2 still works once `SaleService.recordSale(...)` actually returns a value instead of always throwing.

- [ ] **Step 1: Write the failing test**

Add to `backend/src/test/java/com/plotchain/sales/SaleControllerTest.java`:

```java
    @Test
    void recordReturns201WithAFullyPopulatedSaleResponse() throws Exception {
        UUID saleId = UUID.randomUUID();
        UUID plotId = UUID.randomUUID();
        UUID associateId = UUID.randomUUID();
        UUID cycleId = UUID.randomUUID();
        SaleResponse response = new SaleResponse(
            saleId, plotId, associateId, "Jane Buyer", "9999999999", null,
            new BigDecimal("600000.00"), cycleId, "L", "RECORDED", null, Instant.now());
        when(saleService.recordSale(any(CreateSaleRequest.class))).thenReturn(response);

        mockMvc.perform(post("/api/admin/sales")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(REQUEST_BODY.formatted(plotId, associateId)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.id").value(saleId.toString()))
            .andExpect(jsonPath("$.status").value("RECORDED"))
            .andExpect(jsonPath("$.legCredited").value("L"))
            .andExpect(jsonPath("$.cycleId").value(cycleId.toString()));
    }
```

Add these imports:

```java
import com.plotchain.sales.SaleResponse; // no-op if already in-package; keep as needed for clarity
import java.math.BigDecimal;
import java.time.Instant;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
```

(`SaleResponse` is already in the `com.plotchain.sales` package alongside the test, so no import line is actually needed for it — only `BigDecimal`, `Instant`, and the static `jsonPath` import are new.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && mvn test -Dtest=SaleControllerTest#recordReturns201WithAFullyPopulatedSaleResponse`
Expected: This test should actually PASS immediately if Task 2 already landed, since `SaleController.record(...)` and `SaleResponse` both already exist unchanged from unit 2. Run it anyway to confirm — if it fails, the failure diagnoses a real gap in the controller/serialization layer, not a missing-implementation gap (unlike Tasks 1-2, this one has no corresponding "not yet implemented" placeholder to fail against).

- [ ] **Step 3: Run the full `SaleControllerTest` suite to confirm nothing regressed**

Run: `cd backend && mvn test -Dtest=SaleControllerTest`
Expected: PASS — all 5 tests (4 existing + 1 new).

- [ ] **Step 4: Commit**

```bash
git add backend/src/test/java/com/plotchain/sales/SaleControllerTest.java
git commit -m "test(sales): verify POST /api/admin/sales returns 201 with a fully-populated SaleResponse"
```

---

## Self-review notes (for the plan author, not a task to execute)

- **Spec coverage:** Flow steps 4 (Plot→SOLD), 5 (cycle stamp), 6 (Sale snapshot fields), 7 (CompensationPlanVersion lookup), 8 (LedgerEntry math incl. always-without-PAN tier), 9 (201 response) are each implemented in Task 2 and each has a dedicated test. Decision 1 (snapshot amount) and Decision 7 (snapshot legCredited) are called out in comments and asserted directly. Decision 4 (without-PAN tier) is asserted via the `adminDeduction` value in the math test. Decision 8 (endpoint path/ADMIN-only) is pre-existing from unit 2 and reconfirmed by Task 3's 201 test plus the untouched `recordIsForbiddenForAnAssociateToken` test.
- **Out-of-scope guardrails respected:** No void logic (units 4/5), no admin register listing (unit 6), no associate own-view (unit 7) — this plan touches only `SaleService.recordSale(...)`, `LedgerEntry`, and their tests.
- **Placeholder scan:** no TBD/TODO; every step has literal code, not a description of code.
- **Type consistency:** `SaleService`'s constructor signature introduced in Task 1 (`PlotRepository, AssociateRepository, CycleService, CompensationPlanVersionRepository, SaleRepository, LedgerEntryRepository`) is the exact signature Task 2's `SaleServiceTest.setUp()` (unchanged from Task 1) already calls. `LedgerEntry.sourceRef` (Task 1) is the exact field Task 2's ledger-entry construction and its test assertion (`entry.getSourceRef()`) both reference. `SaleResponse`'s 12-arg constructor order matches the existing record declaration exactly in both `toResponse(...)` (Task 2) and the Task 3 test's manual construction.
