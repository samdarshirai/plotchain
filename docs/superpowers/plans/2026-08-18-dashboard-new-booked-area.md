# New Booked Area (Leg Volume Gauge) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `newBookedAreaSqft` — the SUM of `plot.area_sqft` for the associate's `RECORDED` sales in the current cycle — to the dashboard's leg volume gauge widget, backend and frontend.

**Architecture:** One new aggregate `@Query` method on the existing `SaleRepository` (JPQL ad-hoc join `Sale` → `Plot` on `plot_id`, filtered by `associate_id`, `cycle_id`, `status`), wired into `DashboardService.getDashboard` alongside the other `LegVolumeSummary` fields, rendered as a new row on `leg-volume-gauge.component.ts`. No migration — `sale` and `plot` schemas are untouched (spec §3.1, §6).

**Tech Stack:** Spring Boot 3.3 / Java 21, Spring Data JPA (`@Query` JPQL), JUnit 5 + Mockito + AssertJ, `@DataJpaTest` against H2 (MODE=PostgreSQL); Angular 18 standalone components, Jasmine/Karma, `@ngx-translate/core`.

**Spec:** `docs/superpowers/specs/2026-08-17-associate-dashboard-parity-design.md` (§2 "In scope"; §3.1 table row `LegVolumeSummary.newBookedAreaSqft`; §3.2 widget order item 5)

## Global Constraints

- New aggregate queries return a plain `BigDecimal` via `COALESCE(SUM(...), 0)`, never `Optional` — house style already used by `LedgerEntryRepository`, `LegVolumeRepository.sumLeftLegVolumeByAssociateId`/`sumRightLegVolumeByAssociateId`, and `SaleRepository.sumAmountByCycleIdAndStatus`.
- No new migration — `plot.area_sqft` and `sale.plot_id`/`associate_id`/`cycle_id`/`status` all already exist. Do not touch any `V*.sql` file.
- Every associate-facing string change needs both `frontend/src/assets/i18n/en.json` and `frontend/src/assets/i18n/hi.json` — this project has zero exceptions to that rule.
- `DashboardControllerTest` runs a real `DashboardService` behind `@MockBean` repository interfaces (`DashboardControllerTest.java:41-44`) — any new repository dependency `DashboardService` takes must get a matching `@MockBean` and a stub in that test, or the endpoint test fails with an unstubbed-mock NPE, not a compile error.

---

### Task 1: Backend — `newBookedAreaSqft` query, wiring, and tests

**Files:**
- Modify: `backend/src/main/java/com/plotchain/sales/SaleRepository.java`
- Modify: `backend/src/test/java/com/plotchain/sales/SaleRepositoryTest.java`
- Modify: `backend/src/main/java/com/plotchain/dashboard/DashboardResponse.java`
- Modify: `backend/src/main/java/com/plotchain/dashboard/DashboardService.java`
- Modify: `backend/src/test/java/com/plotchain/dashboard/DashboardServiceTest.java`
- Modify: `backend/src/test/java/com/plotchain/dashboard/DashboardControllerTest.java`

**Interfaces:**
- Produces: `SaleRepository.sumPlotAreaSqftByAssociateIdAndCycleIdAndStatus(UUID associateId, UUID cycleId, SaleStatus status): BigDecimal` — never null, `COALESCE(...,0)`.
- Produces: `DashboardResponse.LegVolumeSummary` gains a final `BigDecimal newBookedAreaSqft` component (record field order matters — it is the new last field).

- [ ] **Step 1: Write the failing repository test**

Open `backend/src/test/java/com/plotchain/sales/SaleRepositoryTest.java`. It already has `persistProject()`, `persistPlot(UUID projectId)` (fixed at `area_sqft = 1200.00`, `plot_no = "A-101"`), `persistAssociate()`, `persistCycle()`, and `persistSale(...)` helpers — reuse them verbatim. `persistPlot` always uses the same `plot_no`, and `plot` has a `UNIQUE (project_id, plot_no)` constraint (`V10__project_and_plot.sql:21`), so when a test needs two plots it must pair each with its own `persistProject()` call.

Add these two test methods at the end of the class, just before the closing `}`:

```java
    @Test
    void sumsPlotAreaSqftForAssociatesRecordedSalesInTheGivenCycle() {
        UUID cycleId = persistCycle();
        UUID otherCycleId = persistCycle();
        UUID associateA = persistAssociate();
        UUID associateB = persistAssociate();
        UUID plotOneId = persistPlot(persistProject());
        UUID plotTwoId = persistPlot(persistProject());
        persistSale(associateA, plotOneId, cycleId, SaleStatus.RECORDED, Instant.now());
        persistSale(associateA, plotTwoId, cycleId, SaleStatus.RECORDED, Instant.now());
        // Voided -- must be excluded.
        persistSale(associateA, plotOneId, cycleId, SaleStatus.VOIDED, Instant.now());
        // Recorded but in a different cycle -- must be excluded.
        persistSale(associateA, plotOneId, otherCycleId, SaleStatus.RECORDED, Instant.now());
        // Recorded, this cycle, but a different associate -- must be excluded.
        persistSale(associateB, plotOneId, cycleId, SaleStatus.RECORDED, Instant.now());
        entityManager.flush();

        BigDecimal sum = saleRepository.sumPlotAreaSqftByAssociateIdAndCycleIdAndStatus(
            associateA, cycleId, SaleStatus.RECORDED);

        // Both plots persisted via persistPlot() are fixed at 1200.00 sqft -> 1200 + 1200 = 2400.00
        assertThat(sum).isEqualByComparingTo("2400.00");
    }

    @Test
    void sumPlotAreaSqftReturnsZeroNotNullWhenNoSalesMatch() {
        UUID cycleId = persistCycle();
        UUID associateId = persistAssociate();

        BigDecimal sum = saleRepository.sumPlotAreaSqftByAssociateIdAndCycleIdAndStatus(
            associateId, cycleId, SaleStatus.RECORDED);

        assertThat(sum).isNotNull().isEqualByComparingTo(BigDecimal.ZERO);
    }
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `cd backend && mvn test -Dtest=SaleRepositoryTest -pl . 2>&1 | tail -40`
Expected: FAIL — `sumPlotAreaSqftByAssociateIdAndCycleIdAndStatus` does not exist on `SaleRepository` (compile error).

- [ ] **Step 3: Add the repository query**

In `backend/src/main/java/com/plotchain/sales/SaleRepository.java`, add the import and method:

```java
import com.plotchain.projects.Plot;
```

(add alongside the existing imports at the top)

```java
    // Dashboard's "New Booked Area" (docs/superpowers/specs/2026-08-17-associate-dashboard-parity-design.md
    // §3.1): SUM of plot.area_sqft for the associate's RECORDED sales in one cycle. Sale has no
    // JPA relationship to Plot (plot_id is a bare UUID column), so this is an ad-hoc JPQL join on
    // the FK equality -- Hibernate 6 supports "JOIN Plot p ON p.id = s.plotId" between unrelated
    // entities. COALESCE avoids returning null for an associate/cycle with no matching sales.
    @Query("SELECT COALESCE(SUM(p.areaSqft), 0) FROM Sale s JOIN Plot p ON p.id = s.plotId " +
        "WHERE s.associateId = :associateId AND s.cycleId = :cycleId AND s.status = :status")
    BigDecimal sumPlotAreaSqftByAssociateIdAndCycleIdAndStatus(
        @Param("associateId") UUID associateId,
        @Param("cycleId") UUID cycleId,
        @Param("status") SaleStatus status);
```

Place it after `sumAmountByCycleIdAndStatus` (near line 26), before the `searchRegister` javadoc-style comment block.

- [ ] **Step 4: Run the repository tests to verify they pass**

Run: `cd backend && mvn test -Dtest=SaleRepositoryTest -pl . 2>&1 | tail -40`
Expected: PASS (7 tests: the 5 existing + the 2 new ones)

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/sales/SaleRepository.java backend/src/test/java/com/plotchain/sales/SaleRepositoryTest.java
git commit -m "feat(sales): add new-booked-area sqft aggregate query"
```

- [ ] **Step 6: Extend `LegVolumeSummary` with the new field**

In `backend/src/main/java/com/plotchain/dashboard/DashboardResponse.java`, change:

```java
    public record LegVolumeSummary(BigDecimal leftVolume, BigDecimal rightVolume, BigDecimal carriedForwardLeft, BigDecimal carriedForwardRight, BigDecimal projectedMatchAmount, BigDecimal totalLeftBusiness, BigDecimal totalRightBusiness) {}
```

to:

```java
    public record LegVolumeSummary(BigDecimal leftVolume, BigDecimal rightVolume, BigDecimal carriedForwardLeft, BigDecimal carriedForwardRight, BigDecimal projectedMatchAmount, BigDecimal totalLeftBusiness, BigDecimal totalRightBusiness, BigDecimal newBookedAreaSqft) {}
```

- [ ] **Step 7: Write the failing `DashboardServiceTest` assertions**

Open `backend/src/test/java/com/plotchain/dashboard/DashboardServiceTest.java`.

Add the import:

```java
import com.plotchain.sales.SaleRepository;
import com.plotchain.sales.SaleStatus;
```

Add the mock field, alongside the other `@Mock` fields:

```java
    @Mock SaleRepository saleRepository;
```

Update the `setUp()` constructor call to pass it as the new last argument:

```java
        dashboardService = new DashboardService(
            associateRepository, rankTierRepository, cycleRepository,
            ledgerEntryRepository, legVolumeRepository, walletRepository,
            announcementRepository, compensationPlanVersionRepository,
            royaltyBonusRateRepository, saleRepository);
```

In `aggregatesAllDashboardWidgetsForAnAssociate`, add this stub near the other `legVolumeRepository`/`ledgerEntryRepository` stubs:

```java
        when(saleRepository.sumPlotAreaSqftByAssociateIdAndCycleIdAndStatus(associateId, cycleId, SaleStatus.RECORDED))
            .thenReturn(BigDecimal.valueOf(1200));
```

and add this assertion next to the other `response.legVolume()...` assertions:

```java
        assertThat(response.legVolume().newBookedAreaSqft()).isEqualByComparingTo("1200");
```

In `projectsMatchAmountFromTheDbStoredMatchingIncomePercentNotAHardcodedFraction`, add this stub near the other repository stubs:

```java
        when(saleRepository.sumPlotAreaSqftByAssociateIdAndCycleIdAndStatus(associateId, cycleId, SaleStatus.RECORDED))
            .thenReturn(BigDecimal.ZERO);
```

and add this assertion near the other `response.legVolume()...` assertions:

```java
        assertThat(response.legVolume().newBookedAreaSqft()).isEqualByComparingTo("0");
```

- [ ] **Step 8: Run the service tests to verify they fail**

Run: `cd backend && mvn test -Dtest=DashboardServiceTest -pl . 2>&1 | tail -60`
Expected: FAIL — compile error, `DashboardService` constructor doesn't take a 10th `SaleRepository` argument yet, and `LegVolumeSummary` doesn't have `newBookedAreaSqft()`.

- [ ] **Step 9: Wire `SaleRepository` into `DashboardService`**

In `backend/src/main/java/com/plotchain/dashboard/DashboardService.java`:

Add imports:

```java
import com.plotchain.sales.SaleRepository;
import com.plotchain.sales.SaleStatus;
```

Add the field:

```java
    private final SaleRepository saleRepository;
```

Add the constructor parameter (as the new last parameter) and assignment:

```java
    public DashboardService(
        AssociateRepository associateRepository,
        RankTierRepository rankTierRepository,
        CycleRepository cycleRepository,
        LedgerEntryRepository ledgerEntryRepository,
        LegVolumeRepository legVolumeRepository,
        WalletRepository walletRepository,
        AnnouncementRepository announcementRepository,
        CompensationPlanVersionRepository compensationPlanVersionRepository,
        RoyaltyBonusRateRepository royaltyBonusRateRepository,
        SaleRepository saleRepository
    ) {
        this.associateRepository = associateRepository;
        this.rankTierRepository = rankTierRepository;
        this.cycleRepository = cycleRepository;
        this.ledgerEntryRepository = ledgerEntryRepository;
        this.legVolumeRepository = legVolumeRepository;
        this.walletRepository = walletRepository;
        this.announcementRepository = announcementRepository;
        this.compensationPlanVersionRepository = compensationPlanVersionRepository;
        this.royaltyBonusRateRepository = royaltyBonusRateRepository;
        this.saleRepository = saleRepository;
    }
```

In `getDashboard`, add this line right after the `totalRightBusiness` line (after `BigDecimal totalRightBusiness = legVolumeRepository.sumRightLegVolumeByAssociateId(associateId);`):

```java
        BigDecimal newBookedAreaSqft = saleRepository.sumPlotAreaSqftByAssociateIdAndCycleIdAndStatus(
            associateId, cycle.getId(), SaleStatus.RECORDED);
```

Update the `LegVolumeSummary` constructor call to append the new field as the last argument:

```java
            new DashboardResponse.LegVolumeSummary(
                legVolume.getLeftLegVolume(), legVolume.getRightLegVolume(),
                legVolume.getCarriedForwardLeft(), legVolume.getCarriedForwardRight(),
                projectedMatch, totalLeftBusiness, totalRightBusiness, newBookedAreaSqft),
```

- [ ] **Step 10: Run the service tests to verify they pass**

Run: `cd backend && mvn test -Dtest=DashboardServiceTest -pl . 2>&1 | tail -60`
Expected: PASS (4 tests)

- [ ] **Step 11: Update `DashboardControllerTest`**

Open `backend/src/test/java/com/plotchain/dashboard/DashboardControllerTest.java`.

Add the import:

```java
import com.plotchain.sales.SaleRepository;
```

Add the mock bean, alongside the other `@MockBean` fields:

```java
    @MockBean SaleRepository saleRepository;
```

In `returnsDashboardJsonForTheAuthenticatedAssociate`, add this stub near the other repository stubs:

```java
        when(saleRepository.sumPlotAreaSqftByAssociateIdAndCycleIdAndStatus(any(), any(), any())).thenReturn(BigDecimal.ZERO);
```

Add this assertion to the chained `.andExpect(...)` calls, after `jsonPath("$.legVolume.totalRightBusiness").value(0)`:

```java
            .andExpect(jsonPath("$.legVolume.newBookedAreaSqft").value(0));
```

(remember to move the semicolon off the previous line's `.value(0))` onto this new last line)

- [ ] **Step 12: Run the controller tests to verify they pass**

Run: `cd backend && mvn test -Dtest=DashboardControllerTest -pl . 2>&1 | tail -60`
Expected: PASS (4 tests)

- [ ] **Step 13: Run the full backend suite**

Run: `cd backend && mvn test 2>&1 | tail -60`
Expected: PASS, with only the 4 known pre-existing `JwtServiceTest`/`SecretsEncryptionServiceTest` failures (JDK21/25 + Mockito environment mismatch, documented in `issues.md` — unrelated to this change). Total test count should be 4 higher than the pre-task baseline (2 new `SaleRepositoryTest` methods).

- [ ] **Step 14: Commit**

```bash
git add backend/src/main/java/com/plotchain/dashboard/DashboardResponse.java backend/src/main/java/com/plotchain/dashboard/DashboardService.java backend/src/test/java/com/plotchain/dashboard/DashboardServiceTest.java backend/src/test/java/com/plotchain/dashboard/DashboardControllerTest.java
git commit -m "feat(dashboard): add new booked area sqft to leg volume summary"
```

---

### Task 2: Frontend — render `newBookedAreaSqft` on the leg volume gauge

**Files:**
- Modify: `frontend/src/app/dashboard/models/dashboard-response.model.ts`
- Modify: `frontend/src/app/dashboard/widgets/leg-volume-gauge/leg-volume-gauge.component.ts`
- Modify: `frontend/src/app/dashboard/widgets/leg-volume-gauge/leg-volume-gauge.component.spec.ts`
- Modify: `frontend/src/app/dashboard/dashboard.component.spec.ts`
- Modify: `frontend/src/assets/i18n/en.json`
- Modify: `frontend/src/assets/i18n/hi.json`

**Interfaces:**
- Consumes: backend now sends `legVolume.newBookedAreaSqft: number` on every `GET /api/associates/me/dashboard` response (Task 1).

- [ ] **Step 1: Extend the `LegVolumeSummary` TypeScript interface**

In `frontend/src/app/dashboard/models/dashboard-response.model.ts`, change:

```typescript
export interface LegVolumeSummary {
  leftVolume: number;
  rightVolume: number;
  carriedForwardLeft: number;
  carriedForwardRight: number;
  projectedMatchAmount: number;
  totalLeftBusiness: number;
  totalRightBusiness: number;
}
```

to:

```typescript
export interface LegVolumeSummary {
  leftVolume: number;
  rightVolume: number;
  carriedForwardLeft: number;
  carriedForwardRight: number;
  projectedMatchAmount: number;
  totalLeftBusiness: number;
  totalRightBusiness: number;
  newBookedAreaSqft: number;
}
```

- [ ] **Step 2: Add the i18n key**

In `frontend/src/assets/i18n/en.json`, in the `"dashboard"` block, add this line after `"totalBusiness": "Total Business",`:

```json
    "newBookedArea": "New Booked Area",
```

In `frontend/src/assets/i18n/hi.json`, in the `"dashboard"` block, add this line after `"totalBusiness": "कुल व्यवसाय",`:

```json
    "newBookedArea": "नया बुक्ड क्षेत्र",
```

- [ ] **Step 3: Write the failing component test**

In `frontend/src/app/dashboard/widgets/leg-volume-gauge/leg-volume-gauge.component.spec.ts`, add `newBookedAreaSqft: 450` to the `data` fixture object in `beforeEach`:

```typescript
    fixture.componentInstance.data = {
      leftVolume: 3000, rightVolume: 2000,
      carriedForwardLeft: 500, carriedForwardRight: 1000,
      projectedMatchAmount: 140,
      totalLeftBusiness: 300000, totalRightBusiness: 200000,
      newBookedAreaSqft: 450
    };
```

Add this test after the `renders lifetime total left and right business` test:

```typescript
  it('renders new booked area', () => {
    const area = fixture.nativeElement.querySelector('.new-booked-area').textContent;
    expect(area).toContain('450');
  });
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/leg-volume-gauge.component.spec.ts' 2>&1 | tail -40`
Expected: FAIL — `.new-booked-area` not found in the DOM (`querySelector` returns `null`, `.textContent` throws).

- [ ] **Step 5: Add the row to the template**

In `frontend/src/app/dashboard/widgets/leg-volume-gauge/leg-volume-gauge.component.ts`, add this line after the two `leg-total-business` rows, before the `projected-match` row:

```typescript
      <div class="new-booked-area">{{ 'dashboard.newBookedArea' | translate }}: {{ data.newBookedAreaSqft | number }} sqft</div>
```

so the template reads:

```typescript
  template: `
    <div class="leg-volume-gauge">
      <div class="leg left" [style.flex]="data.leftVolume || 1">{{ 'dashboard.leftLeg' | translate }}: {{ data.leftVolume | currency:'INR' }}</div>
      <div class="leg right" [style.flex]="data.rightVolume || 1">{{ 'dashboard.rightLeg' | translate }}: {{ data.rightVolume | currency:'INR' }}</div>
      <div class="leg-carried-forward left">{{ 'dashboard.carriedForward' | translate }} ({{ 'dashboard.leftLeg' | translate }}): {{ data.carriedForwardLeft | currency:'INR' }}</div>
      <div class="leg-carried-forward right">{{ 'dashboard.carriedForward' | translate }} ({{ 'dashboard.rightLeg' | translate }}): {{ data.carriedForwardRight | currency:'INR' }}</div>
      <div class="leg-total-business left">{{ 'dashboard.totalBusiness' | translate }} ({{ 'dashboard.leftLeg' | translate }}): {{ data.totalLeftBusiness | currency:'INR' }}</div>
      <div class="leg-total-business right">{{ 'dashboard.totalBusiness' | translate }} ({{ 'dashboard.rightLeg' | translate }}): {{ data.totalRightBusiness | currency:'INR' }}</div>
      <div class="new-booked-area">{{ 'dashboard.newBookedArea' | translate }}: {{ data.newBookedAreaSqft | number }} sqft</div>
      <div class="projected-match">{{ 'dashboard.projectedMatch' | translate }}: {{ data.projectedMatchAmount | currency:'INR' }}</div>
    </div>
  `
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/leg-volume-gauge.component.spec.ts' 2>&1 | tail -40`
Expected: PASS (4 tests)

- [ ] **Step 7: Fix `dashboard.component.spec.ts`'s stale `LegVolumeSummary` fixture**

`dashboard.component.spec.ts:20` builds a `LegVolumeSummary` object that will now fail TypeScript compilation (missing required property). Change:

```typescript
    legVolume: { leftVolume: 3000, rightVolume: 2000, carriedForwardLeft: 0, carriedForwardRight: 1000, projectedMatchAmount: 140, totalLeftBusiness: 300000, totalRightBusiness: 200000 },
```

to:

```typescript
    legVolume: { leftVolume: 3000, rightVolume: 2000, carriedForwardLeft: 0, carriedForwardRight: 1000, projectedMatchAmount: 140, totalLeftBusiness: 300000, totalRightBusiness: 200000, newBookedAreaSqft: 450 },
```

- [ ] **Step 8: Run the full frontend suite**

Run: `cd frontend && npx ng test --watch=false 2>&1 | tail -60`
Expected: PASS, `TOTAL: <baseline + 1> SUCCESS` (one new test added).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app/dashboard/models/dashboard-response.model.ts frontend/src/app/dashboard/widgets/leg-volume-gauge/leg-volume-gauge.component.ts frontend/src/app/dashboard/widgets/leg-volume-gauge/leg-volume-gauge.component.spec.ts frontend/src/app/dashboard/dashboard.component.spec.ts frontend/src/assets/i18n/en.json frontend/src/assets/i18n/hi.json
git commit -m "feat(dashboard): render new booked area on leg volume gauge"
```
