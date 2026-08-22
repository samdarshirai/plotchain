# Associate Dashboard Mockup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/dashboard` (the associate-facing landing page) to match the Viraj Acres Dashboard mockup (option 1a) — a page-header row, a Seal Card income hero with a trend delta, a 4-tile KPI row, and a two-column panel row (Recent Sales table; Network Growth chart, KYC network summary, quick actions) — backed by new derived fields on the existing `/api/associates/me/dashboard` response.

**Architecture:** No new service or table. `DashboardResponse`/`DashboardService` gain new aggregate fields (income trend/delta, sales-this-cycle, revenue-booked, network growth history, live network counts, downline KYC breakdown) and lose two whole sub-objects (`legVolume`, `teamSnapshot` — no consumer once their widgets are deleted). `SaleResponse`/`SaleService` gain `plotNo`/`projectName`. On the frontend, `dashboard.component.ts` is rewritten around the new layout, three new small widgets are added, and six now-unused widgets are deleted. All new styling is a new `_dashboard.scss` partial using tokens/primitives that already exist — no design-token changes.

**Tech Stack:** Spring Boot (Java 21, JPA/Hibernate, Postgres in prod / H2 in `@DataJpaTest`), Angular 17+ standalone components, `@ngx-translate/core` for i18n, SCSS with the app's existing custom-property token set.

**Spec:** `docs/superpowers/specs/2026-08-22-associate-dashboard-mockup-design.md`

## Global Constraints

- No new migration — every new field is a derived aggregate over existing columns (spec §6).
- No new self-service backend routes for record-sale/provision-associate/withdraw — those stay inert, restyled only (spec §1/§2).
- Sale status pill is 2-state (`RECORDED`/`VOIDED`), not the mockup's invented 3-state lifecycle (spec §1).
- No target-progress column on the Seal Card (spec §1).
- Global Ink header/nav (`app.component.html`, `_app-shell.scss`) is untouched (spec §2).
- `leg-volume-gauge`, `rank-progress` (dashboard instance), `team-snapshot`, `announcements-strip`, `cycle-countdown`, `wallet-card`, `associate-identity-header` are deleted, not deprecated-in-place (spec §2/§3.2).
- All new/changed backend query methods follow the existing recursive-CTE (`WITH RECURSIVE downline(id) AS (...)`) or `COALESCE(SUM(...), 0)` shapes already used in `AssociateRepository`/`SaleRepository` — no new query style introduced.
- Every step that touches a shared file (`DashboardResponse`, `DashboardService`, `SaleResponse`, `SaleService`, `dashboard-response.model.ts`) must keep every other consumer of that file compiling — this plan calls out each one explicitly per task.

---

## File Structure

**Backend — new/changed:**
- `backend/src/main/java/com/plotchain/associate/AssociateRepository.java` — 2 new query methods
- `backend/src/main/java/com/plotchain/sales/SaleRepository.java` — 2 new query methods
- `backend/src/main/java/com/plotchain/sales/SaleResponse.java` — 2 new fields
- `backend/src/main/java/com/plotchain/sales/SaleService.java` — batch Plot/Project resolution replaces the old bare `toResponse(Sale)`
- `backend/src/main/java/com/plotchain/dashboard/DashboardResponse.java` — restructured
- `backend/src/main/java/com/plotchain/dashboard/DashboardService.java` — restructured

**Backend — tests:**
- `backend/src/test/java/com/plotchain/associate/AssociateRepositoryTest.java`
- `backend/src/test/java/com/plotchain/sales/SaleRepositoryTest.java`
- `backend/src/test/java/com/plotchain/sales/SaleServiceTest.java`
- `backend/src/test/java/com/plotchain/dashboard/DashboardServiceTest.java`
- `backend/src/test/java/com/plotchain/dashboard/DashboardControllerTest.java`

**Frontend — new:**
- `frontend/src/app/dashboard/widgets/recent-sales-table/recent-sales-table.component.ts` (+ `.spec.ts`)
- `frontend/src/app/dashboard/widgets/network-growth-chart/network-growth-chart.component.ts` (+ `.spec.ts`)
- `frontend/src/app/dashboard/widgets/kyc-network-summary/kyc-network-summary.component.ts` (+ `.spec.ts`)
- `frontend/src/styles/_dashboard.scss`

**Frontend — changed:**
- `frontend/src/app/dashboard/models/dashboard-response.model.ts`
- `frontend/src/app/dashboard/widgets/cycle-income-card/cycle-income-card.component.ts` (+ `.spec.ts`)
- `frontend/src/app/dashboard/widgets/quick-actions/quick-actions.component.ts` (+ `.spec.ts`)
- `frontend/src/app/dashboard/dashboard.component.ts` (+ `.spec.ts`)
- `frontend/src/app/admin/models/sale.model.ts`
- `frontend/src/styles.scss`
- `frontend/src/assets/i18n/en.json`, `frontend/src/assets/i18n/hi.json`

**Frontend — deleted:**
- `frontend/src/app/dashboard/widgets/{leg-volume-gauge,rank-progress,team-snapshot,announcements-strip,cycle-countdown,wallet-card,associate-identity-header}/` (component + spec, all 7 directories)

---

### Task 1: `AssociateRepository` — downline-as-of-date and downline-by-KYC-status queries

**Files:**
- Modify: `backend/src/main/java/com/plotchain/associate/AssociateRepository.java`
- Test: `backend/src/test/java/com/plotchain/associate/AssociateRepositoryTest.java`

**Interfaces:**
- Produces: `long countDownlineJoinedBefore(UUID associateId, Instant cutoffExclusive)`, `long countDownlineByKycStatus(UUID associateId, String kycStatus)` — both consumed by `DashboardService` in Task 4.

- [ ] **Step 1: Write the failing tests**

Add to `AssociateRepositoryTest.java` (same file, alongside the existing `countDownlineByPosition*` tests):

```java
@Test
void countDownlineJoinedBeforeCountsOnlyAssociatesWhoHadJoinedByTheCutoff() {
    RankTier rank = new RankTier(UUID.randomUUID(), "Sales Associate", 1, BigDecimal.valueOf(10000));
    entityManager.persist(rank);

    Associate root = newAssociate(null, null, rank.getId());
    Associate early = newAssociate(root.getId(), "L", rank.getId());
    early.setJoinedAt(Instant.parse("2026-01-01T00:00:00Z"));
    Associate late = newAssociate(root.getId(), "R", rank.getId());
    late.setJoinedAt(Instant.parse("2026-03-01T00:00:00Z"));
    associateRepository.saveAll(java.util.List.of(root, early, late));
    entityManager.flush();

    long count = associateRepository.countDownlineJoinedBefore(
        root.getId(), Instant.parse("2026-02-01T00:00:00Z"));

    assertThat(count).isEqualTo(1);
}

@Test
void countDownlineJoinedBeforeExcludesAnAssociateWhoJoinsExactlyAtTheCutoff() {
    RankTier rank = new RankTier(UUID.randomUUID(), "Sales Associate", 1, BigDecimal.valueOf(10000));
    entityManager.persist(rank);

    Associate root = newAssociate(null, null, rank.getId());
    Associate exact = newAssociate(root.getId(), "L", rank.getId());
    Instant cutoff = Instant.parse("2026-02-01T00:00:00Z");
    exact.setJoinedAt(cutoff);
    associateRepository.saveAll(java.util.List.of(root, exact));
    entityManager.flush();

    assertThat(associateRepository.countDownlineJoinedBefore(root.getId(), cutoff)).isEqualTo(0);
}

@Test
void countDownlineByKycStatusCountsOnlyDownlineMatchingThatStatus() {
    RankTier rank = new RankTier(UUID.randomUUID(), "Sales Associate", 1, BigDecimal.valueOf(10000));
    entityManager.persist(rank);

    Associate root = newAssociate(null, null, rank.getId());
    Associate verified = newAssociate(root.getId(), "L", rank.getId());
    verified.setKycStatus(KycStatus.VERIFIED);
    Associate pending = newAssociate(root.getId(), "R", rank.getId());
    pending.setKycStatus(KycStatus.PENDING);
    Associate rejectedGrandchild = newAssociate(pending.getId(), "L", rank.getId());
    rejectedGrandchild.setKycStatus(KycStatus.REJECTED);
    associateRepository.saveAll(java.util.List.of(root, verified, pending, rejectedGrandchild));
    entityManager.flush();

    assertThat(associateRepository.countDownlineByKycStatus(root.getId(), "VERIFIED")).isEqualTo(1);
    assertThat(associateRepository.countDownlineByKycStatus(root.getId(), "PENDING")).isEqualTo(1);
    assertThat(associateRepository.countDownlineByKycStatus(root.getId(), "REJECTED")).isEqualTo(1);
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && mvn test -Dtest=AssociateRepositoryTest -pl . -am`
Expected: FAIL — `countDownlineJoinedBefore`/`countDownlineByKycStatus` do not exist on `AssociateRepository`.

- [ ] **Step 3: Implement the two query methods**

In `AssociateRepository.java`, add after `countDownlineByPosition` (which they mirror):

```java
    // Network Growth chart's per-cycle cumulative downline size (dashboard-mockup spec §3.1):
    // same recursive-CTE shape as countDownline, with an exclusive upper bound on joined_at so
    // a cycle's point reflects "who was already in the downline by that cycle's close".
    // cutoffExclusive is the day AFTER that cycle's periodEnd, same convention as
    // countJoinedBetween above.
    @Query(value = """
        WITH RECURSIVE downline(id) AS (
            SELECT id FROM associate WHERE parent_id = :associateId
            UNION ALL
            SELECT a.id FROM associate a JOIN downline d ON a.parent_id = d.id
        )
        SELECT count(*) FROM downline dl JOIN associate a2 ON a2.id = dl.id
        WHERE a2.joined_at < :cutoffExclusive
        """, nativeQuery = true)
    long countDownlineJoinedBefore(@Param("associateId") UUID associateId, @Param("cutoffExclusive") Instant cutoffExclusive);

    // KYC network summary bar (dashboard-mockup spec §3.1): downline-scoped KYC status counts,
    // same CTE shape as countDownlineByPosition but filtered on kyc_status instead of position.
    // kycStatus is passed as its enum .name() (String), not the enum itself -- nativeQuery=true
    // bypasses Hibernate's enum-to-JDBC-type resolution, the same reason findAncestorChainIds
    // above casts its UUID column to VARCHAR rather than trusting driver-specific type mapping.
    @Query(value = """
        WITH RECURSIVE downline(id) AS (
            SELECT id FROM associate WHERE parent_id = :associateId
            UNION ALL
            SELECT a.id FROM associate a JOIN downline d ON a.parent_id = d.id
        )
        SELECT count(*) FROM downline dl JOIN associate a2 ON a2.id = dl.id
        WHERE a2.kyc_status = :kycStatus
        """, nativeQuery = true)
    long countDownlineByKycStatus(@Param("associateId") UUID associateId, @Param("kycStatus") String kycStatus);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && mvn test -Dtest=AssociateRepositoryTest -pl . -am`
Expected: PASS (all `AssociateRepositoryTest` tests, including the 3 new ones).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/associate/AssociateRepository.java backend/src/test/java/com/plotchain/associate/AssociateRepositoryTest.java
git commit -m "feat(associate): add downline-as-of-date and downline-by-KYC-status queries"
```

---

### Task 2: `SaleRepository` — sales-this-cycle count and revenue-booked sum

**Files:**
- Modify: `backend/src/main/java/com/plotchain/sales/SaleRepository.java`
- Test: `backend/src/test/java/com/plotchain/sales/SaleRepositoryTest.java`

**Interfaces:**
- Produces: `long countByAssociateIdAndCycleIdAndStatus(UUID associateId, UUID cycleId, SaleStatus status)`, `BigDecimal sumAmountByAssociateIdAndCycleIdAndStatus(UUID associateId, UUID cycleId, SaleStatus status)` — both consumed by `DashboardService` in Task 4.

- [ ] **Step 1: Write the failing tests**

Add to `SaleRepositoryTest.java`, reusing its existing `persistProject`/`persistPlot`/`persistAssociate`/`persistCycle`/`persistSale` helpers:

```java
@Test
void countByAssociateIdAndCycleIdAndStatusCountsOnlyThatAssociateCycleAndStatus() {
    UUID projectId = persistProject();
    UUID plotId = persistPlot(projectId);
    UUID cycleId = persistCycle();
    UUID otherCycleId = persistCycle();
    UUID associateA = persistAssociate();
    UUID associateB = persistAssociate();
    persistSale(associateA, plotId, cycleId, SaleStatus.RECORDED, Instant.now());
    persistSale(associateA, plotId, cycleId, SaleStatus.RECORDED, Instant.now());
    persistSale(associateA, plotId, cycleId, SaleStatus.VOIDED, Instant.now());
    persistSale(associateA, plotId, otherCycleId, SaleStatus.RECORDED, Instant.now());
    persistSale(associateB, plotId, cycleId, SaleStatus.RECORDED, Instant.now());
    entityManager.flush();

    long count = saleRepository.countByAssociateIdAndCycleIdAndStatus(associateA, cycleId, SaleStatus.RECORDED);

    assertThat(count).isEqualTo(2);
}

@Test
void sumAmountByAssociateIdAndCycleIdAndStatusSumsOnlyMatchingRows() {
    UUID projectId = persistProject();
    UUID plotId = persistPlot(projectId);
    UUID cycleId = persistCycle();
    UUID associateId = persistAssociate();
    persistSale(associateId, plotId, cycleId, SaleStatus.RECORDED, Instant.now());
    persistSale(associateId, plotId, cycleId, SaleStatus.RECORDED, Instant.now());
    persistSale(associateId, plotId, cycleId, SaleStatus.VOIDED, Instant.now());
    entityManager.flush();

    BigDecimal sum = saleRepository.sumAmountByAssociateIdAndCycleIdAndStatus(associateId, cycleId, SaleStatus.RECORDED);

    // Two RECORDED sales at persistSale's fixed amount, 600000.00 each.
    assertThat(sum).isEqualByComparingTo("1200000.00");
}

@Test
void sumAmountByAssociateIdAndCycleIdAndStatusReturnsZeroNotNullWhenNoRowsMatch() {
    UUID projectId = persistProject();
    UUID plotId = persistPlot(projectId);
    UUID cycleId = persistCycle();
    UUID associateId = persistAssociate();
    entityManager.flush();

    BigDecimal sum = saleRepository.sumAmountByAssociateIdAndCycleIdAndStatus(associateId, cycleId, SaleStatus.RECORDED);

    assertThat(sum).isEqualByComparingTo("0");
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && mvn test -Dtest=SaleRepositoryTest -pl . -am`
Expected: FAIL — methods do not exist on `SaleRepository`.

- [ ] **Step 3: Implement the two query methods**

In `SaleRepository.java`, add after `sumAmountByCycleIdAndStatus`:

```java
    // Dashboard mockup's Sales This Cycle KPI tile (dashboard-mockup spec §3.1): a plain derived
    // query, same shape as the existing countByCycleIdAndStatus but scoped to one associate too.
    long countByAssociateIdAndCycleIdAndStatus(UUID associateId, UUID cycleId, SaleStatus status);

    // Dashboard mockup's Revenue Booked KPI tile (dashboard-mockup spec §3.1): COALESCE mirrors
    // sumAmountByCycleIdAndStatus above -- an associate/cycle with no matching sales must sum to
    // 0, not null.
    @Query("SELECT COALESCE(SUM(s.amount), 0) FROM Sale s WHERE s.associateId = :associateId AND s.cycleId = :cycleId AND s.status = :status")
    BigDecimal sumAmountByAssociateIdAndCycleIdAndStatus(
        @Param("associateId") UUID associateId,
        @Param("cycleId") UUID cycleId,
        @Param("status") SaleStatus status);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && mvn test -Dtest=SaleRepositoryTest -pl . -am`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/sales/SaleRepository.java backend/src/test/java/com/plotchain/sales/SaleRepositoryTest.java
git commit -m "feat(sales): add per-associate sales-count and revenue-booked queries"
```

---

### Task 3: `SaleResponse`/`SaleService` — plot number and project name

**Files:**
- Modify: `backend/src/main/java/com/plotchain/sales/SaleResponse.java`
- Modify: `backend/src/main/java/com/plotchain/sales/SaleService.java`
- Test: `backend/src/test/java/com/plotchain/sales/SaleServiceTest.java`

**Interfaces:**
- Consumes: `ProjectRepository` (`backend/src/main/java/com/plotchain/projects/ProjectRepository.java`, already exists, `findAllById(Iterable<UUID>)` inherited from `JpaRepository`) and `PlotRepository.findAllById(Iterable<UUID>)` (inherited, already exists).
- Produces: `SaleResponse` gains `String plotNo, String projectName` as its last two components. `RecentSalesTableComponent` (Task 8) reads these off the JSON `GET /api/associates/me/sales` already returns.

- [ ] **Step 1: Write the failing tests**

Add to `SaleServiceTest.java`. First, the two-mock addition every other test in this class will need at compile time — add the field and pass it in `setUp()`:

```java
    @Mock com.plotchain.projects.ProjectRepository projectRepository;
```

and change the `setUp()` constructor call to:

```java
        saleService = new SaleService(
            plotRepository, associateRepository, cycleService,
            compensationPlanVersionRepository, saleRepository, ledgerEntryRepository,
            selfPerformanceBonusConfigService, projectRepository);
```

Then add two new tests (near `getMySalesResolvesSelfAndDownlineIdsThenFiltersSalesByThem`):

```java
@Test
void getMySalesPopulatesPlotNoAndProjectNameFromABatchLookupNotPerRowQueries() {
    UUID plotId = UUID.randomUUID();
    UUID projectId = UUID.randomUUID();
    Sale sale = new Sale();
    sale.setId(UUID.randomUUID());
    sale.setPlotId(plotId);
    sale.setAssociateId(ASSOCIATE_ID);
    sale.setBuyerName("Jane Buyer");
    sale.setBuyerPhone("9999999999");
    sale.setAmount(new BigDecimal("600000.00"));
    sale.setCycleId(CYCLE_ID);
    sale.setLegCredited("L");
    sale.setStatus(SaleStatus.RECORDED);
    sale.setRecordedAt(Instant.now());

    com.plotchain.projects.Plot plot = new com.plotchain.projects.Plot(
        plotId, projectId, "VG2-118", com.plotchain.projects.PlotType.NORMAL,
        new BigDecimal("1200.00"), new BigDecimal("500.00"), new BigDecimal("600000.00"),
        com.plotchain.projects.PlotStatus.SOLD);
    com.plotchain.projects.Project project = new com.plotchain.projects.Project(
        projectId, "Viraj Greens Ph II", "Patna", null, null, Instant.now());

    when(associateRepository.findSelfAndDownline(ASSOCIATE_ID)).thenReturn(List.of(ASSOCIATE_ID));
    when(saleRepository.findByAssociateIdInOrderByRecordedAtDesc(eq(List.of(ASSOCIATE_ID)), any(Pageable.class)))
        .thenReturn(new PageImpl<>(List.of(sale)));
    when(plotRepository.findAllById(List.of(plotId))).thenReturn(List.of(plot));
    when(projectRepository.findAllById(List.of(projectId))).thenReturn(List.of(project));

    AssociateSalePageResponse response = saleService.getMySales(ASSOCIATE_ID, 0, 20);

    assertThat(response.sales()).hasSize(1);
    assertThat(response.sales().get(0).plotNo()).isEqualTo("VG2-118");
    assertThat(response.sales().get(0).projectName()).isEqualTo("Viraj Greens Ph II");
}

@Test
void getMySalesLeavesPlotNoAndProjectNameNullWhenThePlotCannotBeFound() {
    UUID plotId = UUID.randomUUID();
    Sale sale = new Sale();
    sale.setId(UUID.randomUUID());
    sale.setPlotId(plotId);
    sale.setAssociateId(ASSOCIATE_ID);
    sale.setBuyerName("Jane Buyer");
    sale.setBuyerPhone("9999999999");
    sale.setAmount(new BigDecimal("600000.00"));
    sale.setCycleId(CYCLE_ID);
    sale.setLegCredited("L");
    sale.setStatus(SaleStatus.RECORDED);
    sale.setRecordedAt(Instant.now());

    when(associateRepository.findSelfAndDownline(ASSOCIATE_ID)).thenReturn(List.of(ASSOCIATE_ID));
    when(saleRepository.findByAssociateIdInOrderByRecordedAtDesc(eq(List.of(ASSOCIATE_ID)), any(Pageable.class)))
        .thenReturn(new PageImpl<>(List.of(sale)));
    when(plotRepository.findAllById(List.of(plotId))).thenReturn(List.of());

    AssociateSalePageResponse response = saleService.getMySales(ASSOCIATE_ID, 0, 20);

    assertThat(response.sales().get(0).plotNo()).isNull();
    assertThat(response.sales().get(0).projectName()).isNull();
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && mvn test -Dtest=SaleServiceTest -pl . -am`
Expected: FAIL to compile — `SaleService`'s constructor doesn't take a `ProjectRepository` yet, `SaleResponse` has no `plotNo()`/`projectName()`.

- [ ] **Step 3: Implement**

`SaleResponse.java` — add the two fields as the last two components:

```java
package com.plotchain.sales;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record SaleResponse(
    UUID id,
    UUID plotId,
    UUID associateId,
    String buyerName,
    String buyerPhone,
    String buyerEmail,
    BigDecimal amount,
    UUID cycleId,
    String legCredited,
    String status,
    String voidReason,
    Instant recordedAt,
    String plotNo,
    String projectName
) {}
```

`SaleService.java` — add `ProjectRepository` to the constructor, and replace the single `toResponse(Sale)` with a batch-aware version used by every call site (`recordSale`, `voidSale`, `list`, `getMySales`), so a single Sale and a paged list share one code path:

```java
import com.plotchain.projects.Project;
import com.plotchain.projects.ProjectRepository;
// ...(existing imports unchanged)...
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class SaleService {

    private final PlotRepository plotRepository;
    private final AssociateRepository associateRepository;
    private final CycleService cycleService;
    private final CompensationPlanVersionRepository compensationPlanVersionRepository;
    private final SaleRepository saleRepository;
    private final LedgerEntryRepository ledgerEntryRepository;
    private final SelfPerformanceBonusConfigService selfPerformanceBonusConfigService;
    private final ProjectRepository projectRepository;

    public SaleService(
            PlotRepository plotRepository,
            AssociateRepository associateRepository,
            CycleService cycleService,
            CompensationPlanVersionRepository compensationPlanVersionRepository,
            SaleRepository saleRepository,
            LedgerEntryRepository ledgerEntryRepository,
            SelfPerformanceBonusConfigService selfPerformanceBonusConfigService,
            ProjectRepository projectRepository) {
        this.plotRepository = plotRepository;
        this.associateRepository = associateRepository;
        this.cycleService = cycleService;
        this.compensationPlanVersionRepository = compensationPlanVersionRepository;
        this.saleRepository = saleRepository;
        this.ledgerEntryRepository = ledgerEntryRepository;
        this.selfPerformanceBonusConfigService = selfPerformanceBonusConfigService;
        this.projectRepository = projectRepository;
    }
```

Change every `return toResponse(sale);` (in `recordSale` and `voidSale`) to `return toResponses(List.of(sale)).get(0);`, and change `list()`/`getMySales()`'s `result.getContent().stream().map(this::toResponse).toList()` to `toResponses(result.getContent())`. Replace the old private `toResponse(Sale sale)` method with:

```java
    // dashboard-mockup spec §3.1: plotNo/projectName resolved here via a batch Plot/Project
    // lookup (two IN-queries total, regardless of how many sales are being mapped) rather than
    // a per-row join or per-row repository call -- recordSale/voidSale route a single-element
    // list through the same path so there is exactly one mapping implementation, not two.
    private List<SaleResponse> toResponses(List<Sale> sales) {
        List<UUID> plotIds = sales.stream().map(Sale::getPlotId).distinct().toList();
        Map<UUID, Plot> plotsById = plotRepository.findAllById(plotIds).stream()
            .collect(Collectors.toMap(Plot::getId, p -> p));
        List<UUID> projectIds = plotsById.values().stream().map(Plot::getProjectId).distinct().toList();
        Map<UUID, String> projectNamesByProjectId = projectRepository.findAllById(projectIds).stream()
            .collect(Collectors.toMap(Project::getId, Project::getName));

        return sales.stream().map(sale -> {
            Plot plot = plotsById.get(sale.getPlotId());
            String plotNo = plot != null ? plot.getPlotNo() : null;
            String projectName = plot != null ? projectNamesByProjectId.get(plot.getProjectId()) : null;
            return new SaleResponse(
                sale.getId(), sale.getPlotId(), sale.getAssociateId(),
                sale.getBuyerName(), sale.getBuyerPhone(), sale.getBuyerEmail(),
                sale.getAmount(), sale.getCycleId(), sale.getLegCredited(),
                sale.getStatus().name(), sale.getVoidReason(), sale.getRecordedAt(),
                plotNo, projectName);
        }).toList();
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && mvn test -Dtest=SaleServiceTest -pl . -am`
Expected: PASS — all pre-existing `SaleServiceTest` tests still pass unchanged (they don't stub `plotRepository.findAllById`/`projectRepository.findAllById`, which default to empty lists under Mockito, so `plotNo`/`projectName` are simply `null` in responses those tests don't assert on), plus the 2 new tests.

Also run the full sales test package to catch any other compile-time break from the constructor/record signature change:

Run: `cd backend && mvn test -Dtest="com.plotchain.sales.**" -pl . -am`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/sales/SaleResponse.java backend/src/main/java/com/plotchain/sales/SaleService.java backend/src/test/java/com/plotchain/sales/SaleServiceTest.java
git commit -m "feat(sales): populate plotNo/projectName on SaleResponse via a batch Plot/Project lookup"
```

---

### Task 4: `DashboardResponse`/`DashboardService` — restructure for the mockup

**Files:**
- Modify: `backend/src/main/java/com/plotchain/dashboard/DashboardResponse.java`
- Modify: `backend/src/main/java/com/plotchain/dashboard/DashboardService.java`
- Test: `backend/src/test/java/com/plotchain/dashboard/DashboardServiceTest.java`
- Test: `backend/src/test/java/com/plotchain/dashboard/DashboardControllerTest.java`

**Interfaces:**
- Consumes: `AssociateRepository.countDownlineJoinedBefore`/`countDownlineByKycStatus` (Task 1), `SaleRepository.countByAssociateIdAndCycleIdAndStatus`/`sumAmountByAssociateIdAndCycleIdAndStatus` (Task 2), and pre-existing `AssociateRepository.countDownline`/`countByParentId`, `CycleRepository.findAllByOrderByPeriodStartDesc(Pageable)`.
- Produces: the new `DashboardResponse` shape frontend Task 5 mirrors exactly.

This task removes the `legVolume`/`teamSnapshot`/`rankProgress`/`announcements` sub-objects (each loses its only consumer once Tasks 9-11's widget deletions land — deleting them here first, ahead of the frontend tasks, is safe because `DashboardComponent` still compiles against the old model shape until Task 11 rewrites it; **do this task and Task 5 back-to-back**, since the frontend model in Task 5 must match this response shape exactly and nothing in between depends on the intermediate broken state). It keeps `legVolumeRepository` as a dependency — narrowed to the one read still needed: the associate's most-recently-closed-cycle matched volume, which `royaltyBonusPct`'s slab lookup still requires.

- [ ] **Step 1: Rewrite `DashboardResponse.java`**

```java
package com.plotchain.dashboard;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record DashboardResponse(
    AssociateSummary associate,
    boolean kycPendingBannerVisible,
    CycleIncome cycleIncome,
    WalletSummary wallet,
    CycleCountdown cycleCountdown,
    SalesSummary salesSummary,
    NetworkSummary networkSummary,
    List<NetworkGrowthPoint> networkGrowth,
    KycBreakdown kycBreakdown
) {
    public record AssociateSummary(String associateId, String name, String rank, String phone, Instant joinedAt, Instant rankChangedAt) {}
    public record CycleIncome(
        UUID cycleId, BigDecimal directIncome, BigDecimal matchingIncome, BigDecimal sponsorMatchingIncome,
        BigDecimal selfPerformanceBonus, BigDecimal royaltyBonus, BigDecimal royaltyBonusPct, BigDecimal totalIncome,
        BigDecimal previousCycleTotalIncome, List<BigDecimal> incomeTrend) {}
    public record WalletSummary(BigDecimal balance) {}
    public record CycleCountdown(UUID cycleId, long daysRemaining) {}
    public record SalesSummary(int salesThisCycle, BigDecimal revenueBookedThisCycle, BigDecimal revenueBookedChangePct) {}
    public record NetworkSummary(long totalDownline, long directCount) {}
    public record NetworkGrowthPoint(String cycleLabel, long downlineCount) {}
    public record KycBreakdown(long verified, long pending, long rejected) {}
}
```

- [ ] **Step 2: Update `DashboardServiceTest.java`'s two full-flow tests and delete the third**

`aggregatesAllDashboardWidgetsForAnAssociate` and `currentLegVolumeDefaultsToZeroWhenTheAssociateHasNeverBeenThroughAClose` both assert on fields that no longer exist and need new stubs for the fields that were just added. Replace the whole file's body (imports, fixtures, and all 4 test methods) with:

```java
package com.plotchain.dashboard;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.KycStatus;
import com.plotchain.compensation.CompensationPlanVersion;
import com.plotchain.compensation.CompensationPlanVersionRepository;
import com.plotchain.compensation.RoyaltyBonusRate;
import com.plotchain.compensation.RoyaltyBonusRateRepository;
import com.plotchain.compensation.SettlementCycle;
import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleRepository;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.income.IncomeType;
import com.plotchain.income.LedgerEntryRepository;
import com.plotchain.legvolume.LegVolume;
import com.plotchain.legvolume.LegVolumeRepository;
import com.plotchain.rank.RankTier;
import com.plotchain.rank.RankTierRepository;
import com.plotchain.sales.SaleRepository;
import com.plotchain.sales.SaleStatus;
import com.plotchain.wallet.Wallet;
import com.plotchain.wallet.WalletRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DashboardServiceTest {

    @Mock AssociateRepository associateRepository;
    @Mock RankTierRepository rankTierRepository;
    @Mock CycleRepository cycleRepository;
    @Mock LedgerEntryRepository ledgerEntryRepository;
    @Mock LegVolumeRepository legVolumeRepository;
    @Mock WalletRepository walletRepository;
    @Mock CompensationPlanVersionRepository compensationPlanVersionRepository;
    @Mock RoyaltyBonusRateRepository royaltyBonusRateRepository;
    @Mock SaleRepository saleRepository;

    DashboardService dashboardService;

    @BeforeEach
    void setUp() {
        dashboardService = new DashboardService(
            associateRepository, rankTierRepository, cycleRepository,
            ledgerEntryRepository, legVolumeRepository, walletRepository,
            compensationPlanVersionRepository, royaltyBonusRateRepository, saleRepository);
    }

    private static CompensationPlanVersion compensationPlanVersion(BigDecimal matchingIncomePct) {
        return new CompensationPlanVersion(
            UUID.randomUUID(), "v1", LocalDate.now().minusDays(1),
            new BigDecimal("10.00"), matchingIncomePct, new BigDecimal("3.00"), new BigDecimal("5.00"),
            new BigDecimal("2.00"), new BigDecimal("4.00"), BigDecimal.ZERO, BigDecimal.ZERO,
            SettlementCycle.MONTHLY, Instant.now(), null,
            BigDecimal.ZERO, new BigDecimal("2000"), BigDecimal.ZERO, new BigDecimal("3000"));
    }

    // Stubs every call this method makes unconditionally regardless of fixture specifics: the
    // last-8-cycles lookup (incomeTrend/networkGrowth) and the three downline-count/KYC-breakdown
    // reads. Individual tests override any of these with their own when(...) after calling this.
    private void stubUnconditionalCalls(UUID associateId) {
        when(cycleRepository.findAllByOrderByPeriodStartDesc(any(PageRequest.class))).thenReturn(Page.empty());
        when(associateRepository.countDownline(associateId)).thenReturn(0L);
        when(associateRepository.countByParentId(associateId)).thenReturn(0L);
        when(associateRepository.countDownlineByKycStatus(any(), any())).thenReturn(0L);
    }

    @Test
    void aggregatesTheDashboardForAnAssociate() {
        UUID associateId = UUID.randomUUID();
        UUID cycleId = UUID.randomUUID();
        UUID currentRankId = UUID.randomUUID();

        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setRankId(currentRankId);
        associate.setKycStatus(KycStatus.PENDING);
        associate.setUserId("SDI384818");
        associate.setName("Asha Kumar");
        associate.setPhone("9876543210");
        Instant joinedAt = Instant.parse("2025-09-05T05:25:42Z");
        Instant rankChangedAt = Instant.parse("2026-01-10T09:00:00Z");
        associate.setJoinedAt(joinedAt);
        associate.setRankChangedAt(rankChangedAt);

        Cycle cycle = new Cycle();
        cycle.setId(cycleId);
        cycle.setStatus(CycleStatus.OPEN);
        cycle.setPeriodStart(LocalDate.now().minusDays(5));
        cycle.setPeriodEnd(LocalDate.now().plusDays(10));

        RankTier currentRank = new RankTier(currentRankId, "Sales Associate", 1, BigDecimal.valueOf(5000));

        UUID closedCycleId = UUID.randomUUID();
        Cycle closedCycle = new Cycle();
        closedCycle.setId(closedCycleId);
        closedCycle.setStatus(CycleStatus.CLOSED);
        closedCycle.setPeriodStart(LocalDate.now().minusDays(20));
        closedCycle.setPeriodEnd(LocalDate.now().minusDays(6));

        LegVolume legVolume = new LegVolume(UUID.randomUUID(), associateId, closedCycleId,
            new BigDecimal("300000"), new BigDecimal("200000"), new BigDecimal("100000"), BigDecimal.ZERO);

        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)).thenReturn(Optional.of(cycle));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.of(closedCycle));
        when(legVolumeRepository.findByAssociateIdAndCycleId(associateId, closedCycleId)).thenReturn(Optional.of(legVolume));

        when(ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(associateId, cycleId, IncomeType.DIRECT)).thenReturn(BigDecimal.valueOf(1000));
        when(ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(associateId, cycleId, IncomeType.MATCHING)).thenReturn(BigDecimal.valueOf(500));
        when(ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(associateId, cycleId, IncomeType.SPONSOR_MATCHING)).thenReturn(BigDecimal.valueOf(300));
        when(ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(associateId, cycleId, IncomeType.SELF_PERFORMANCE)).thenReturn(BigDecimal.valueOf(200));
        when(ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(associateId, cycleId, IncomeType.ROYALTY)).thenReturn(BigDecimal.valueOf(400));
        when(ledgerEntryRepository.sumNetAmountByAssociateAndCycle(associateId, cycleId)).thenReturn(BigDecimal.valueOf(2400));
        when(ledgerEntryRepository.sumNetAmountByAssociateAndCycle(associateId, closedCycleId)).thenReturn(BigDecimal.valueOf(1800));

        CompensationPlanVersion planVersion = compensationPlanVersion(new BigDecimal("7.00"));
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(any())).thenReturn(Optional.of(planVersion));
        // matchedVolume = min(300000, 200000) = 200000 > 0, exercises the real slab lookup.
        when(royaltyBonusRateRepository.findFirstByPlanVersionIdAndVolumeThresholdLessThanEqualOrderByVolumeThresholdDesc(planVersion.getId(), new BigDecimal("200000")))
            .thenReturn(Optional.of(new RoyaltyBonusRate(UUID.randomUUID(), planVersion.getId(), BigDecimal.ZERO, new BigDecimal("3.00"))));

        when(walletRepository.findById(associateId)).thenReturn(Optional.of(Wallet.zero(associateId)));
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(currentRank));

        stubUnconditionalCalls(associateId);
        when(cycleRepository.findAllByOrderByPeriodStartDesc(any(PageRequest.class))).thenReturn(new PageImpl<>(List.of(cycle, closedCycle)));
        when(associateRepository.countDownlineJoinedBefore(any(), any())).thenReturn(3L);
        when(associateRepository.countDownline(associateId)).thenReturn(12L);
        when(associateRepository.countByParentId(associateId)).thenReturn(8L);
        when(associateRepository.countDownlineByKycStatus(associateId, "VERIFIED")).thenReturn(9L);
        when(associateRepository.countDownlineByKycStatus(associateId, "PENDING")).thenReturn(2L);
        when(associateRepository.countDownlineByKycStatus(associateId, "REJECTED")).thenReturn(1L);

        when(saleRepository.countByAssociateIdAndCycleIdAndStatus(associateId, cycleId, SaleStatus.RECORDED)).thenReturn(6L);
        when(saleRepository.sumAmountByAssociateIdAndCycleIdAndStatus(associateId, cycleId, SaleStatus.RECORDED)).thenReturn(new BigDecimal("3850000"));
        when(saleRepository.sumAmountByAssociateIdAndCycleIdAndStatus(associateId, closedCycleId, SaleStatus.RECORDED)).thenReturn(new BigDecimal("3260000"));

        DashboardResponse response = dashboardService.getDashboard(associateId);

        assertThat(response.kycPendingBannerVisible()).isTrue();
        assertThat(response.associate().associateId()).isEqualTo("SDI384818");
        assertThat(response.associate().name()).isEqualTo("Asha Kumar");
        assertThat(response.associate().rank()).isEqualTo("Sales Associate");
        assertThat(response.associate().rankChangedAt()).isEqualTo(rankChangedAt);
        assertThat(response.cycleIncome().directIncome()).isEqualByComparingTo("1000");
        assertThat(response.cycleIncome().sponsorMatchingIncome()).isEqualByComparingTo("300");
        assertThat(response.cycleIncome().selfPerformanceBonus()).isEqualByComparingTo("200");
        assertThat(response.cycleIncome().royaltyBonus()).isEqualByComparingTo("400");
        assertThat(response.cycleIncome().royaltyBonusPct()).isEqualByComparingTo("3.00");
        assertThat(response.cycleIncome().totalIncome()).isEqualByComparingTo("2400");
        assertThat(response.cycleIncome().previousCycleTotalIncome()).isEqualByComparingTo("1800");
        assertThat(response.cycleIncome().incomeTrend()).hasSize(2);
        assertThat(response.wallet().balance()).isEqualByComparingTo("0");
        assertThat(response.cycleCountdown().daysRemaining()).isEqualTo(10L);
        assertThat(response.salesSummary().salesThisCycle()).isEqualTo(6);
        assertThat(response.salesSummary().revenueBookedThisCycle()).isEqualByComparingTo("3850000");
        // (3850000 - 3260000) / 3260000 * 100 = 18.09... -> rounds to 18.
        assertThat(response.salesSummary().revenueBookedChangePct()).isEqualByComparingTo("18");
        assertThat(response.networkSummary().totalDownline()).isEqualTo(12L);
        assertThat(response.networkSummary().directCount()).isEqualTo(8L);
        assertThat(response.networkGrowth()).hasSize(2);
        assertThat(response.networkGrowth().get(0).cycleLabel()).isEqualTo("01");
        assertThat(response.networkGrowth().get(1).cycleLabel()).isEqualTo("02");
        assertThat(response.kycBreakdown().verified()).isEqualTo(9L);
        assertThat(response.kycBreakdown().pending()).isEqualTo(2L);
        assertThat(response.kycBreakdown().rejected()).isEqualTo(1L);
    }

    @Test
    void royaltyBonusPctIsZeroWhenNoCycleHasEverClosed() {
        UUID associateId = UUID.randomUUID();
        UUID cycleId = UUID.randomUUID();
        UUID currentRankId = UUID.randomUUID();

        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setRankId(currentRankId);
        associate.setKycStatus(KycStatus.VERIFIED);

        Cycle cycle = new Cycle();
        cycle.setId(cycleId);
        cycle.setStatus(CycleStatus.OPEN);
        cycle.setPeriodStart(LocalDate.now().minusDays(5));
        cycle.setPeriodEnd(LocalDate.now().plusDays(10));

        RankTier currentRank = new RankTier(currentRankId, "Sales Associate", 1, BigDecimal.valueOf(5000));

        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)).thenReturn(Optional.of(cycle));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());

        when(ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(any(), any(), any())).thenReturn(BigDecimal.ZERO);
        when(ledgerEntryRepository.sumNetAmountByAssociateAndCycle(any(), any())).thenReturn(BigDecimal.ZERO);
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(any()))
            .thenReturn(Optional.of(compensationPlanVersion(new BigDecimal("7.00"))));
        when(walletRepository.findById(associateId)).thenReturn(Optional.of(Wallet.zero(associateId)));
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(currentRank));
        when(saleRepository.countByAssociateIdAndCycleIdAndStatus(any(), any(), any())).thenReturn(0L);
        when(saleRepository.sumAmountByAssociateIdAndCycleIdAndStatus(any(), any(), any())).thenReturn(BigDecimal.ZERO);

        stubUnconditionalCalls(associateId);

        DashboardResponse response = dashboardService.getDashboard(associateId);

        assertThat(response.cycleIncome().royaltyBonusPct()).isEqualByComparingTo("0");
        assertThat(response.cycleIncome().previousCycleTotalIncome()).isEqualByComparingTo("0");
        assertThat(response.salesSummary().revenueBookedChangePct()).isEqualByComparingTo("0");
    }

    @Test
    void rejectsTheDashboardForAnAccountWithNoRank() {
        UUID associateId = UUID.randomUUID();
        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setRankId(null);
        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));

        assertThatThrownBy(() -> dashboardService.getDashboard(associateId))
            .isInstanceOf(NoRankAssignedException.class);
    }

    @Test
    void throwsAssociateNotFoundExceptionWhenAssociateDoesNotExist() {
        UUID associateId = UUID.randomUUID();
        when(associateRepository.findById(associateId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> dashboardService.getDashboard(associateId))
            .isInstanceOf(AssociateNotFoundException.class);
    }
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && mvn test -Dtest=DashboardServiceTest -pl . -am`
Expected: FAIL to compile — `DashboardService`'s constructor still takes `announcementRepository`; `DashboardResponse` doesn't have `salesSummary()`/`networkSummary()`/etc. yet.

- [ ] **Step 4: Rewrite `DashboardService.java`**

```java
package com.plotchain.dashboard;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.KycStatus;
import com.plotchain.compensation.CompensationPlanVersion;
import com.plotchain.compensation.CompensationPlanVersionRepository;
import com.plotchain.compensation.RoyaltyBonusRate;
import com.plotchain.compensation.RoyaltyBonusRateRepository;
import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleRepository;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.cycle.NoOpenCycleException;
import com.plotchain.income.IncomeType;
import com.plotchain.income.LedgerEntryRepository;
import com.plotchain.legvolume.LegVolumeRepository;
import com.plotchain.rank.RankTier;
import com.plotchain.rank.RankTierRepository;
import com.plotchain.sales.SaleRepository;
import com.plotchain.sales.SaleStatus;
import com.plotchain.wallet.Wallet;
import com.plotchain.wallet.WalletRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class DashboardService {

    private final AssociateRepository associateRepository;
    private final RankTierRepository rankTierRepository;
    private final CycleRepository cycleRepository;
    private final LedgerEntryRepository ledgerEntryRepository;
    private final LegVolumeRepository legVolumeRepository;
    private final WalletRepository walletRepository;
    private final CompensationPlanVersionRepository compensationPlanVersionRepository;
    private final RoyaltyBonusRateRepository royaltyBonusRateRepository;
    private final SaleRepository saleRepository;

    public DashboardService(
        AssociateRepository associateRepository,
        RankTierRepository rankTierRepository,
        CycleRepository cycleRepository,
        LedgerEntryRepository ledgerEntryRepository,
        LegVolumeRepository legVolumeRepository,
        WalletRepository walletRepository,
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
        this.compensationPlanVersionRepository = compensationPlanVersionRepository;
        this.royaltyBonusRateRepository = royaltyBonusRateRepository;
        this.saleRepository = saleRepository;
    }

    public DashboardResponse getDashboard(UUID associateId) {
        Associate associate = associateRepository.findById(associateId)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));

        if (associate.getRankId() == null) {
            throw new NoRankAssignedException(associateId);
        }

        Cycle cycle = cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)
            .orElseThrow(NoOpenCycleException::new);

        BigDecimal direct = ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(associateId, cycle.getId(), IncomeType.DIRECT);
        BigDecimal matching = ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(associateId, cycle.getId(), IncomeType.MATCHING);
        BigDecimal sponsorMatching = ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(associateId, cycle.getId(), IncomeType.SPONSOR_MATCHING);
        BigDecimal selfPerformance = ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(associateId, cycle.getId(), IncomeType.SELF_PERFORMANCE);
        BigDecimal total = ledgerEntryRepository.sumNetAmountByAssociateAndCycle(associateId, cycle.getId());
        BigDecimal royaltyBonus = ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(associateId, cycle.getId(), IncomeType.ROYALTY);

        // Royalty slab lookup needs matched volume from the associate's most-recently-CLOSED
        // cycle -- the currently OPEN cycle never has a leg_volume row of its own (rows are only
        // written at cycle close, CycleService#rollUpSubtree). This is the one LegVolume read
        // this dashboard still needs after dashboard-mockup spec §3.1 dropped the rest of
        // LegVolumeSummary; latestClosedCycle is also reused below for the income/revenue deltas.
        Optional<Cycle> latestClosedCycle = cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED);
        BigDecimal matchedVolume = latestClosedCycle
            .flatMap(closed -> legVolumeRepository.findByAssociateIdAndCycleId(associateId, closed.getId()))
            .map(lv -> lv.getLeftLegVolume().min(lv.getRightLegVolume()))
            .orElse(BigDecimal.ZERO);

        CompensationPlanVersion planVersion = compensationPlanVersionRepository
            .findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(LocalDate.now())
            .orElseThrow(() -> new IllegalStateException("compensation_plan_version row missing - V8 migration seeds it"));
        // Mirrors CycleService#creditRoyalty's own guard (matchedVolume <= 0 -> skip): a
        // non-positive matched volume must never reach the slab lookup.
        BigDecimal royaltyBonusPct = matchedVolume.compareTo(BigDecimal.ZERO) > 0
            ? royaltyBonusRateRepository
                .findFirstByPlanVersionIdAndVolumeThresholdLessThanEqualOrderByVolumeThresholdDesc(planVersion.getId(), matchedVolume)
                .map(RoyaltyBonusRate::getRoyaltyPct)
                .orElse(BigDecimal.ZERO)
            : BigDecimal.ZERO;

        BigDecimal previousCycleTotalIncome = latestClosedCycle
            .map(closed -> ledgerEntryRepository.sumNetAmountByAssociateAndCycle(associateId, closed.getId()))
            .orElse(BigDecimal.ZERO);

        // Seal Card sparkline and Network Growth chart both plot the last 8 cycles, oldest first
        // -- findAllByOrderByPeriodStartDesc comes back newest-first, so it's reversed once here
        // and shared by both loops below.
        List<Cycle> lastCycles = new ArrayList<>(
            cycleRepository.findAllByOrderByPeriodStartDesc(PageRequest.of(0, 8)).getContent());
        Collections.reverse(lastCycles);

        List<BigDecimal> incomeTrend = lastCycles.stream()
            .map(c -> ledgerEntryRepository.sumNetAmountByAssociateAndCycle(associateId, c.getId()))
            .toList();

        List<DashboardResponse.NetworkGrowthPoint> networkGrowth = new ArrayList<>();
        for (int i = 0; i < lastCycles.size(); i++) {
            Cycle c = lastCycles.get(i);
            // Exclusive upper bound, same convention as AssociateRepository#countJoinedBetween:
            // the day AFTER this cycle's periodEnd, so a join on the close date itself counts.
            Instant cutoffExclusive = c.getPeriodEnd().plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant();
            networkGrowth.add(new DashboardResponse.NetworkGrowthPoint(
                String.format("%02d", i + 1),
                associateRepository.countDownlineJoinedBefore(associateId, cutoffExclusive)));
        }

        int salesThisCycle = (int) saleRepository.countByAssociateIdAndCycleIdAndStatus(associateId, cycle.getId(), SaleStatus.RECORDED);
        BigDecimal revenueBookedThisCycle = saleRepository.sumAmountByAssociateIdAndCycleIdAndStatus(associateId, cycle.getId(), SaleStatus.RECORDED);
        BigDecimal revenueBookedPreviousCycle = latestClosedCycle
            .map(closed -> saleRepository.sumAmountByAssociateIdAndCycleIdAndStatus(associateId, closed.getId(), SaleStatus.RECORDED))
            .orElse(BigDecimal.ZERO);
        BigDecimal revenueBookedChangePct = revenueBookedPreviousCycle.compareTo(BigDecimal.ZERO) > 0
            ? revenueBookedThisCycle.subtract(revenueBookedPreviousCycle)
                .multiply(BigDecimal.valueOf(100))
                .divide(revenueBookedPreviousCycle, 0, RoundingMode.HALF_UP)
            : BigDecimal.ZERO;

        Wallet wallet = walletRepository.findById(associateId)
            .orElseGet(() -> Wallet.zero(associateId));

        List<RankTier> ranks = rankTierRepository.findAllByOrderByRankOrder();
        RankTier currentRank = ranks.stream()
            .filter(r -> r.getId().equals(associate.getRankId()))
            .findFirst()
            .orElseThrow(() -> new IllegalStateException("Associate's rank not found in rank table: " + associate.getRankId()));

        long totalDownline = associateRepository.countDownline(associateId);
        long directCount = associateRepository.countByParentId(associateId);

        long verified = associateRepository.countDownlineByKycStatus(associateId, KycStatus.VERIFIED.name());
        long pending = associateRepository.countDownlineByKycStatus(associateId, KycStatus.PENDING.name());
        long rejected = associateRepository.countDownlineByKycStatus(associateId, KycStatus.REJECTED.name());

        long daysRemaining = Math.max(0, ChronoUnit.DAYS.between(LocalDate.now(), cycle.getPeriodEnd()));

        return new DashboardResponse(
            new DashboardResponse.AssociateSummary(
                associate.getUserId(), associate.getName(), currentRank.getName(),
                associate.getPhone(), associate.getJoinedAt(), associate.getRankChangedAt()),
            associate.getKycStatus() != KycStatus.VERIFIED,
            new DashboardResponse.CycleIncome(
                cycle.getId(), direct, matching, sponsorMatching, selfPerformance, royaltyBonus, royaltyBonusPct, total,
                previousCycleTotalIncome, incomeTrend),
            new DashboardResponse.WalletSummary(wallet.getBalance()),
            new DashboardResponse.CycleCountdown(cycle.getId(), daysRemaining),
            new DashboardResponse.SalesSummary(salesThisCycle, revenueBookedThisCycle, revenueBookedChangePct),
            new DashboardResponse.NetworkSummary(totalDownline, directCount),
            networkGrowth,
            new DashboardResponse.KycBreakdown(verified, pending, rejected)
        );
    }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && mvn test -Dtest=DashboardServiceTest -pl . -am`
Expected: PASS.

- [ ] **Step 6: Update `DashboardControllerTest.java`**

Remove the `AnnouncementRepository`/`announcementRepository` mock entirely (field, import, and its stub), remove the `LegVolume` import/stub for `findByAssociateIdOrderByCyclePeriodStartAsc` and `sumPlotAreaSqftByAssociateIdAndCycleIdAndStatus`, add the new unconditional stubs, and replace the `legVolume.*`/`teamSnapshot.*` `jsonPath` assertions with the new fields. The one full-flow test becomes:

```java
    @Test
    void returnsDashboardJsonForTheAuthenticatedAssociate() throws Exception {
        UUID associateId = UUID.randomUUID();
        UUID cycleId = UUID.randomUUID();
        UUID currentRankId = UUID.randomUUID();

        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setRankId(currentRankId);
        associate.setKycStatus(KycStatus.VERIFIED);
        associate.setUserId("SDI384818");
        associate.setName("Asha Kumar");
        associate.setPhone("9876543210");
        Instant joinedAt = Instant.now();
        associate.setJoinedAt(joinedAt);

        Cycle cycle = new Cycle();
        cycle.setId(cycleId);
        cycle.setStatus(CycleStatus.OPEN);
        cycle.setPeriodStart(LocalDate.now().minusDays(5));
        cycle.setPeriodEnd(LocalDate.now().plusDays(10));

        RankTier currentRank = new RankTier(currentRankId, "Sales Associate", 1, BigDecimal.valueOf(5000));

        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)).thenReturn(Optional.of(cycle));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        when(cycleRepository.findAllByOrderByPeriodStartDesc(any(org.springframework.data.domain.PageRequest.class)))
            .thenReturn(org.springframework.data.domain.Page.empty());
        when(ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(any(), any(), any())).thenReturn(BigDecimal.ZERO);
        when(ledgerEntryRepository.sumNetAmountByAssociateAndCycle(any(), any())).thenReturn(BigDecimal.ZERO);
        when(royaltyBonusRateRepository.findFirstByPlanVersionIdAndVolumeThresholdLessThanEqualOrderByVolumeThresholdDesc(any(), any()))
            .thenReturn(Optional.empty());
        when(walletRepository.findById(associateId)).thenReturn(Optional.of(Wallet.zero(associateId)));
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(currentRank));
        when(associateRepository.countDownline(any())).thenReturn(12L);
        when(associateRepository.countByParentId(any())).thenReturn(8L);
        when(associateRepository.countDownlineByKycStatus(any(), any())).thenReturn(0L);
        when(saleRepository.countByAssociateIdAndCycleIdAndStatus(any(), any(), any())).thenReturn(0L);
        when(saleRepository.sumAmountByAssociateIdAndCycleIdAndStatus(any(), any(), any())).thenReturn(BigDecimal.ZERO);

        mockMvc.perform(get("/api/associates/me/dashboard")
                .header("Authorization", "Bearer " + tokenFor(associateId)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.networkSummary.totalDownline").value(12))
            .andExpect(jsonPath("$.networkSummary.directCount").value(8))
            .andExpect(jsonPath("$.associate.name").value("Asha Kumar"))
            .andExpect(jsonPath("$.associate.joinedAt").value(joinedAt.toString()))
            .andExpect(jsonPath("$.cycleIncome.sponsorMatchingIncome").value(0))
            .andExpect(jsonPath("$.cycleIncome.royaltyBonusPct").value(0))
            .andExpect(jsonPath("$.salesSummary.salesThisCycle").value(0))
            .andExpect(jsonPath("$.kycBreakdown.verified").value(0));
    }
```

Also remove the `@MockBean AnnouncementRepository announcementRepository;` field and its `com.plotchain.announcement.AnnouncementRepository` import; the two error-path tests (`returns409WhenAssociateHasNoRank`, `returns409WhenNoOpenCycle`) are unchanged.

- [ ] **Step 7: Run the full dashboard test package**

Run: `cd backend && mvn test -Dtest="com.plotchain.dashboard.**" -pl . -am`
Expected: PASS.

- [ ] **Step 8: Run the full backend suite to confirm nothing else references the removed fields**

Run: `cd backend && mvn test -pl . -am`
Expected: PASS. (This surfaces any other consumer of `DashboardResponse.legVolume()`/`teamSnapshot()`/`rankProgress()`/`announcements()` this plan missed — if it fails elsewhere, that call site needs the same field removal before continuing.)

- [ ] **Step 9: Commit**

```bash
git add backend/src/main/java/com/plotchain/dashboard/DashboardResponse.java backend/src/main/java/com/plotchain/dashboard/DashboardService.java backend/src/test/java/com/plotchain/dashboard/DashboardServiceTest.java backend/src/test/java/com/plotchain/dashboard/DashboardControllerTest.java
git commit -m "feat(dashboard): restructure DashboardResponse for the mockup layout"
```

---

### Task 5: `dashboard-response.model.ts` — mirror the backend shape

**Files:**
- Modify: `frontend/src/app/dashboard/models/dashboard-response.model.ts`

**Interfaces:**
- Produces: the TypeScript interfaces every frontend task from here on imports.

This file has no separate spec (it's a pure type file); the compile step in Task 11 is what verifies it. Replace its full contents:

- [ ] **Step 1: Replace the file**

```typescript
export interface AssociateSummary {
  associateId: string;
  name: string;
  rank: string;
  phone: string | null;
  joinedAt: string;
  rankChangedAt: string | null;
}

export interface CycleIncome {
  cycleId: string;
  directIncome: number;
  matchingIncome: number;
  sponsorMatchingIncome: number;
  selfPerformanceBonus: number;
  royaltyBonus: number;
  royaltyBonusPct: number;
  totalIncome: number;
  previousCycleTotalIncome: number;
  incomeTrend: number[];
}

export interface WalletSummary {
  balance: number;
}

export interface CycleCountdown {
  cycleId: string;
  daysRemaining: number;
}

export interface SalesSummary {
  salesThisCycle: number;
  revenueBookedThisCycle: number;
  revenueBookedChangePct: number;
}

export interface NetworkSummary {
  totalDownline: number;
  directCount: number;
}

export interface NetworkGrowthPoint {
  cycleLabel: string;
  downlineCount: number;
}

export interface KycBreakdown {
  verified: number;
  pending: number;
  rejected: number;
}

export interface DashboardResponse {
  associate: AssociateSummary;
  kycPendingBannerVisible: boolean;
  cycleIncome: CycleIncome;
  wallet: WalletSummary;
  cycleCountdown: CycleCountdown;
  salesSummary: SalesSummary;
  networkSummary: NetworkSummary;
  networkGrowth: NetworkGrowthPoint[];
  kycBreakdown: KycBreakdown;
}
```

- [ ] **Step 2: Commit**

This alone won't compile (every widget still imports the removed types) — commit it together with Task 6 below rather than standalone. Skip to Task 6 before running any Angular build.

---

### Task 6: `cycle-income-card` — delta caption and trend sparkline

**Files:**
- Modify: `frontend/src/app/dashboard/widgets/cycle-income-card/cycle-income-card.component.ts`
- Modify: `frontend/src/app/dashboard/widgets/cycle-income-card/cycle-income-card.component.spec.ts`
- Modify: `frontend/src/assets/i18n/en.json`, `frontend/src/assets/i18n/hi.json`

**Interfaces:**
- Consumes: `CycleIncome` (Task 5) — `previousCycleTotalIncome`, `incomeTrend`.

- [ ] **Step 1: Check whether a spec file already exists**

Run: `test -f frontend/src/app/dashboard/widgets/cycle-income-card/cycle-income-card.component.spec.ts && echo exists || echo missing`

If `missing`, create it with the shell below before Step 2; if `exists`, read it first and extend it in place — the new tests below assume a `TestBed`/`ComponentFixture` harness already exists for this component (standalone Angular component spec pattern used throughout `dashboard/widgets/`).

- [ ] **Step 2: Write the failing tests**

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { RouterTestingModule } from '@angular/router/testing';
import { CycleIncomeCardComponent } from './cycle-income-card.component';
import { CycleIncome } from '../../models/dashboard-response.model';

describe('CycleIncomeCardComponent', () => {
  let fixture: ComponentFixture<CycleIncomeCardComponent>;

  const baseData: CycleIncome = {
    cycleId: 'c1', directIncome: 1000, matchingIncome: 500, sponsorMatchingIncome: 300,
    selfPerformanceBonus: 200, royaltyBonus: 400, royaltyBonusPct: 3, totalIncome: 2400,
    previousCycleTotalIncome: 1800, incomeTrend: [1200, 1800, 2400]
  };

  async function render(data: CycleIncome): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [CycleIncomeCardComponent, TranslateModule.forRoot(), RouterTestingModule]
    }).compileComponents();
    fixture = TestBed.createComponent(CycleIncomeCardComponent);
    fixture.componentInstance.data = data;
    fixture.detectChanges();
  }

  it('shows a positive delta caption when this cycle beats the previous one', async () => {
    await render(baseData);
    const delta: HTMLElement = fixture.nativeElement.querySelector('.seal-card__delta');
    expect(delta.classList).not.toContain('seal-card__delta--down');
    expect(delta.textContent).toContain('600');
  });

  it('marks the delta caption as down when this cycle trails the previous one', async () => {
    await render({ ...baseData, totalIncome: 1500, previousCycleTotalIncome: 1800 });
    const delta: HTMLElement = fixture.nativeElement.querySelector('.seal-card__delta');
    expect(delta.classList).toContain('seal-card__delta--down');
  });

  it('renders a trend sparkline only when at least two points exist', async () => {
    await render(baseData);
    expect(fixture.nativeElement.querySelector('.seal-card__trend')).toBeTruthy();
  });

  it('omits the sparkline for a single-point trend', async () => {
    await render({ ...baseData, incomeTrend: [2400] });
    expect(fixture.nativeElement.querySelector('.seal-card__trend')).toBeFalsy();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd frontend && npx ng test --watch=false --include='**/cycle-income-card.component.spec.ts'`
Expected: FAIL — `.seal-card__delta`/`.seal-card__trend` don't exist yet; `CycleIncome` fixtures above also won't compile against the old model until Task 5's model change is in place (it already is, from Task 5).

- [ ] **Step 4: Implement**

```typescript
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { CycleIncome } from '../../models/dashboard-response.model';

@Component({
  selector: 'app-cycle-income-card',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslateModule],
  template: `
    <a class="cycle-income-card seal-card" [routerLink]="['/income-statement']" [queryParams]="{ cycleId: data.cycleId }">
      <div class="seal-card__hairline seal-card__hairline--top"></div>
      <div class="seal-card__body">
        <div class="seal-card__header">
          <span class="seal-card__header-rule"></span>
          <span class="seal-card__header-label">{{ 'dashboard.cycleIncomeEyebrow' | translate }}</span>
          <span class="seal-card__header-rule"></span>
        </div>
        <h2 class="total seal-card__figure">{{ data.totalIncome | currency:'INR' }}</h2>
        <p class="seal-card__legal">{{ 'dashboard.total' | translate }}</p>
        <p class="seal-card__delta" [class.seal-card__delta--down]="delta < 0">
          {{ (delta >= 0 ? 'dashboard.deltaUp' : 'dashboard.deltaDown') | translate: { amount: (deltaAbs | currency:'INR':'symbol':'1.0-0') } }}
        </p>
        <svg class="seal-card__trend" *ngIf="trendPoints" viewBox="0 0 100 28" preserveAspectRatio="none">
          <polyline [attr.points]="trendPoints"></polyline>
        </svg>
        <div class="seal-card__details">
          <p class="direct">{{ 'dashboard.direct' | translate }}: {{ data.directIncome | currency:'INR' }}</p>
          <p class="matching">{{ 'dashboard.matching' | translate }}: {{ data.matchingIncome | currency:'INR' }}</p>
          <p class="sponsor-matching">{{ 'dashboard.sponsorMatching' | translate }}: {{ data.sponsorMatchingIncome | currency:'INR' }}</p>
          <p class="self-performance">{{ 'dashboard.selfPerformance' | translate }}: {{ data.selfPerformanceBonus | currency:'INR' }}</p>
          <p class="royalty">{{ 'dashboard.royalty' | translate }} ({{ data.royaltyBonusPct }}%): {{ data.royaltyBonus | currency:'INR' }}</p>
        </div>
      </div>
      <div class="seal-card__hairline seal-card__hairline--bottom"></div>
    </a>
  `
})
export class CycleIncomeCardComponent {
  @Input({ required: true }) data!: CycleIncome;

  get delta(): number {
    return this.data.totalIncome - this.data.previousCycleTotalIncome;
  }

  get deltaAbs(): number {
    return Math.abs(this.delta);
  }

  get trendPoints(): string | null {
    const trend = this.data.incomeTrend;
    if (!trend || trend.length < 2) {
      return null;
    }
    const max = Math.max(...trend);
    const min = Math.min(...trend, 0);
    const range = max - min || 1;
    const stepX = 100 / (trend.length - 1);
    return trend
      .map((value, i) => `${(i * stepX).toFixed(1)},${(28 - ((value - min) / range) * 28).toFixed(1)}`)
      .join(' ');
  }
}
```

Add to `frontend/src/assets/i18n/en.json` under `dashboard`:

```json
"deltaUp": "+{{amount}} vs last cycle",
"deltaDown": "-{{amount}} vs last cycle",
```

Add to `frontend/src/assets/i18n/hi.json` under `dashboard`:

```json
"deltaUp": "पिछले साइकिल से +{{amount}}",
"deltaDown": "पिछले साइकिल से -{{amount}}",
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npx ng test --watch=false --include='**/cycle-income-card.component.spec.ts'`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/dashboard/models/dashboard-response.model.ts frontend/src/app/dashboard/widgets/cycle-income-card/ frontend/src/assets/i18n/en.json frontend/src/assets/i18n/hi.json
git commit -m "feat(dashboard): add a vs-last-cycle delta and trend sparkline to the Seal Card"
```

---

### Task 7: `admin/models/sale.model.ts` — add `plotNo`/`projectName`

**Files:**
- Modify: `frontend/src/app/admin/models/sale.model.ts`

**Interfaces:**
- Produces: `Sale.plotNo`, `Sale.projectName` — consumed by Task 8's `RecentSalesTableComponent`.

This is a pure type addition shared by `sales-history`, `admin/sales-register`, and the new `recent-sales-table` — no behavior to test in isolation; Task 8's tests cover it in use.

- [ ] **Step 1: Edit the file**

```typescript
export type SaleStatus = 'RECORDED' | 'VOIDED';

export interface Sale {
  id: string;
  plotId: string;
  associateId: string;
  buyerName: string;
  buyerPhone: string;
  buyerEmail: string | null;
  amount: number;
  cycleId: string;
  legCredited: string;
  status: SaleStatus;
  voidReason: string | null;
  recordedAt: string;
  plotNo: string | null;
  projectName: string | null;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/admin/models/sale.model.ts
git commit -m "feat(sales): add plotNo/projectName to the frontend Sale model"
```

---

### Task 8: `RecentSalesTableComponent` (new)

**Files:**
- Create: `frontend/src/app/dashboard/widgets/recent-sales-table/recent-sales-table.component.ts`
- Create: `frontend/src/app/dashboard/widgets/recent-sales-table/recent-sales-table.component.spec.ts`
- Modify: `frontend/src/assets/i18n/en.json`, `frontend/src/assets/i18n/hi.json`

**Interfaces:**
- Consumes: `SalesHistoryService.getMySales(page, size)` (`frontend/src/app/sales-history/sales-history.service.ts`, already exists — `Observable<AssociateSalePage>`), `Sale` (Task 7).
- Produces: `<app-recent-sales-table>`, no `@Input` — fetches its own data. Consumed by `dashboard.component.ts` in Task 11.

- [ ] **Step 1: Write the failing test**

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { RecentSalesTableComponent } from './recent-sales-table.component';
import { AssociateSalePage } from '../../../sales-history/models/associate-sale-page.model';

describe('RecentSalesTableComponent', () => {
  let fixture: ComponentFixture<RecentSalesTableComponent>;
  let httpMock: HttpTestingController;

  const page: AssociateSalePage = {
    page: 0, size: 5, totalElements: 1,
    sales: [{
      id: 's1', plotId: 'p1', associateId: 'a1', buyerName: 'Jane Buyer', buyerPhone: '9999999999',
      buyerEmail: null, amount: 840000, cycleId: 'c1', legCredited: 'L', status: 'RECORDED',
      voidReason: null, recordedAt: '2026-08-18T00:00:00Z', plotNo: 'VG2-118', projectName: 'Viraj Greens Ph II'
    }]
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RecentSalesTableComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(RecentSalesTableComponent);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('requests exactly 5 recent sales on init and renders plot/project/amount/status', () => {
    fixture.detectChanges();
    const req = httpMock.expectOne(r => r.url === '/api/associates/me/sales' && r.params.get('size') === '5' && r.params.get('page') === '0');
    req.flush(page);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('VG2-118');
    expect(text).toContain('Viraj Greens Ph II');
    const statusPill: HTMLElement = fixture.nativeElement.querySelector('.recent-sales-table__status-pill');
    expect(statusPill.classList).not.toContain('recent-sales-table__status-pill--voided');
  });

  it('marks a VOIDED sale with the voided pill class', () => {
    fixture.detectChanges();
    const req = httpMock.expectOne(r => r.url === '/api/associates/me/sales');
    req.flush({ ...page, sales: [{ ...page.sales[0], status: 'VOIDED' }] });
    fixture.detectChanges();

    const statusPill: HTMLElement = fixture.nativeElement.querySelector('.recent-sales-table__status-pill');
    expect(statusPill.classList).toContain('recent-sales-table__status-pill--voided');
  });

  it('shows an empty state when there are no sales yet', () => {
    fixture.detectChanges();
    const req = httpMock.expectOne(r => r.url === '/api/associates/me/sales');
    req.flush({ page: 0, size: 5, totalElements: 0, sales: [] });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.recent-sales-table__empty')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('table')).toBeFalsy();
  });

  it('shows a load-error state on request failure, isolated from the rest of the dashboard', () => {
    fixture.detectChanges();
    const req = httpMock.expectOne(r => r.url === '/api/associates/me/sales');
    req.flush('error', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.recent-sales-table__error')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/recent-sales-table.component.spec.ts'`
Expected: FAIL — the component file does not exist yet.

- [ ] **Step 3: Implement**

```typescript
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { SalesHistoryService } from '../../../sales-history/sales-history.service';
import { Sale } from '../../../admin/models/sale.model';

const RECENT_SALES_COUNT = 5;

@Component({
  selector: 'app-recent-sales-table',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  providers: [DatePipe],
  template: `
    <div class="recent-sales-table">
      <div class="recent-sales-table__header">
        <span class="recent-sales-table__rule"></span>
        <span class="recent-sales-table__label">{{ 'dashboard.recentSalesEyebrow' | translate }}</span>
        <span class="recent-sales-table__rule"></span>
      </div>
      <p *ngIf="loadError" class="recent-sales-table__error">{{ 'dashboard.recentSalesLoadError' | translate }}</p>
      <p *ngIf="!loadError && loaded && sales.length === 0" class="recent-sales-table__empty">{{ 'dashboard.recentSalesEmpty' | translate }}</p>
      <table class="recent-sales-table__table" *ngIf="sales.length">
        <thead>
          <tr>
            <th>{{ 'dashboard.recentSalesColumnPlot' | translate }}</th>
            <th>{{ 'dashboard.recentSalesColumnProject' | translate }}</th>
            <th>{{ 'dashboard.recentSalesColumnValue' | translate }}</th>
            <th>{{ 'dashboard.recentSalesColumnDate' | translate }}</th>
            <th>{{ 'dashboard.recentSalesColumnStatus' | translate }}</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let sale of sales">
            <td class="recent-sales-table__plot-no">{{ sale.plotNo }}</td>
            <td>{{ sale.projectName }}</td>
            <td>{{ sale.amount | currency:'INR' }}</td>
            <td>{{ sale.recordedAt | date:'d MMM' }}</td>
            <td>
              <span
                class="recent-sales-table__status-pill"
                [class.recent-sales-table__status-pill--voided]="sale.status === 'VOIDED'"
              >{{ (sale.status === 'VOIDED' ? 'dashboard.saleStatusVoided' : 'dashboard.saleStatusRecorded') | translate }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  `
})
export class RecentSalesTableComponent implements OnInit {
  private salesHistoryService = inject(SalesHistoryService);

  sales: Sale[] = [];
  loadError = false;
  loaded = false;

  ngOnInit(): void {
    this.salesHistoryService.getMySales(0, RECENT_SALES_COUNT).subscribe({
      next: res => {
        this.sales = res.sales;
        this.loaded = true;
      },
      error: () => {
        this.loadError = true;
        this.loaded = true;
      }
    });
  }
}
```

Add to `frontend/src/assets/i18n/en.json` under `dashboard`:

```json
"recentSalesEyebrow": "Recent Sales",
"recentSalesLoadError": "Couldn't load your recent sales.",
"recentSalesEmpty": "No sales recorded yet.",
"recentSalesColumnPlot": "Plot",
"recentSalesColumnProject": "Project",
"recentSalesColumnValue": "Value",
"recentSalesColumnDate": "Date",
"recentSalesColumnStatus": "Status",
"saleStatusRecorded": "Recorded",
"saleStatusVoided": "Voided",
```

Add to `frontend/src/assets/i18n/hi.json` under `dashboard`:

```json
"recentSalesEyebrow": "हाल की बिक्री",
"recentSalesLoadError": "हाल की बिक्री लोड नहीं हो सकी।",
"recentSalesEmpty": "अभी तक कोई बिक्री दर्ज नहीं हुई।",
"recentSalesColumnPlot": "प्लॉट",
"recentSalesColumnProject": "प्रोजेक्ट",
"recentSalesColumnValue": "मूल्य",
"recentSalesColumnDate": "तिथि",
"recentSalesColumnStatus": "स्थिति",
"saleStatusRecorded": "दर्ज",
"saleStatusVoided": "रद्द",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/recent-sales-table.component.spec.ts'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/dashboard/widgets/recent-sales-table/ frontend/src/assets/i18n/en.json frontend/src/assets/i18n/hi.json
git commit -m "feat(dashboard): add RecentSalesTableComponent"
```

---

### Task 9: `NetworkGrowthChartComponent` (new)

**Files:**
- Create: `frontend/src/app/dashboard/widgets/network-growth-chart/network-growth-chart.component.ts`
- Create: `frontend/src/app/dashboard/widgets/network-growth-chart/network-growth-chart.component.spec.ts`
- Modify: `frontend/src/assets/i18n/en.json`, `frontend/src/assets/i18n/hi.json`

**Interfaces:**
- Consumes: `NetworkGrowthPoint[]` (Task 5).
- Produces: `<app-network-growth-chart [data]="...">`, consumed by `dashboard.component.ts` in Task 11.

- [ ] **Step 1: Write the failing test**

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { NetworkGrowthChartComponent } from './network-growth-chart.component';

describe('NetworkGrowthChartComponent', () => {
  let fixture: ComponentFixture<NetworkGrowthChartComponent>;

  async function render(data: { cycleLabel: string; downlineCount: number }[]): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [NetworkGrowthChartComponent, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(NetworkGrowthChartComponent);
    fixture.componentInstance.data = data;
    fixture.detectChanges();
  }

  it('renders one bar per data point and the cycle labels beneath them', async () => {
    await render([
      { cycleLabel: '01', downlineCount: 4 },
      { cycleLabel: '02', downlineCount: 9 },
      { cycleLabel: '03', downlineCount: 6 }
    ]);
    expect(fixture.nativeElement.querySelectorAll('rect').length).toBe(3);
    const axisText = fixture.nativeElement.querySelector('.network-growth-chart__axis').textContent;
    expect(axisText).toContain('01');
    expect(axisText).toContain('03');
  });

  it('gives the tallest bar the full chart height', async () => {
    await render([
      { cycleLabel: '01', downlineCount: 4 },
      { cycleLabel: '02', downlineCount: 8 }
    ]);
    const bars: NodeListOf<SVGRectElement> = fixture.nativeElement.querySelectorAll('rect');
    expect(bars[1].getAttribute('height')).toBe('40');
    expect(bars[0].getAttribute('height')).toBe('20');
  });

  it('renders nothing when there is no data', async () => {
    await render([]);
    expect(fixture.nativeElement.querySelector('svg')).toBeFalsy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/network-growth-chart.component.spec.ts'`
Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Implement**

```typescript
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { NetworkGrowthPoint } from '../../models/dashboard-response.model';

@Component({
  selector: 'app-network-growth-chart',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="network-growth-chart">
      <div class="network-growth-chart__header">
        <span class="network-growth-chart__rule"></span>
        <span class="network-growth-chart__label">{{ 'dashboard.networkGrowthEyebrow' | translate }}</span>
        <span class="network-growth-chart__rule"></span>
      </div>
      <svg class="network-growth-chart__bars" *ngIf="data.length" viewBox="0 0 100 40" preserveAspectRatio="none">
        <rect
          *ngFor="let point of data; let i = index"
          [attr.x]="barX(i)"
          [attr.y]="barY(point.downlineCount)"
          [attr.width]="barWidth"
          [attr.height]="barHeight(point.downlineCount)"
        ></rect>
      </svg>
      <div class="network-growth-chart__axis" *ngIf="data.length">
        <span *ngFor="let point of data">{{ point.cycleLabel }}</span>
      </div>
    </div>
  `
})
export class NetworkGrowthChartComponent {
  @Input({ required: true }) data: NetworkGrowthPoint[] = [];

  private get maxCount(): number {
    return Math.max(...this.data.map(p => p.downlineCount), 1);
  }

  get barWidth(): number {
    return this.data.length ? 100 / this.data.length - 2 : 0;
  }

  barX(index: number): number {
    return index * (100 / this.data.length);
  }

  barHeight(count: number): number {
    return Math.round((count / this.maxCount) * 40);
  }

  barY(count: number): number {
    return 40 - this.barHeight(count);
  }
}
```

Add to `frontend/src/assets/i18n/en.json` under `dashboard`: `"networkGrowthEyebrow": "Network Growth",`
Add to `frontend/src/assets/i18n/hi.json` under `dashboard`: `"networkGrowthEyebrow": "नेटवर्क वृद्धि",`

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/network-growth-chart.component.spec.ts'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/dashboard/widgets/network-growth-chart/ frontend/src/assets/i18n/en.json frontend/src/assets/i18n/hi.json
git commit -m "feat(dashboard): add NetworkGrowthChartComponent"
```

---

### Task 10: `KycNetworkSummaryComponent` (new) and `quick-actions` restyle

**Files:**
- Create: `frontend/src/app/dashboard/widgets/kyc-network-summary/kyc-network-summary.component.ts`
- Create: `frontend/src/app/dashboard/widgets/kyc-network-summary/kyc-network-summary.component.spec.ts`
- Modify: `frontend/src/app/dashboard/widgets/quick-actions/quick-actions.component.ts`
- Modify/Create: `frontend/src/app/dashboard/widgets/quick-actions/quick-actions.component.spec.ts`
- Modify: `frontend/src/assets/i18n/en.json`, `frontend/src/assets/i18n/hi.json`

**Interfaces:**
- Consumes: `KycBreakdown` (Task 5).
- Produces: `<app-kyc-network-summary [data]="...">`, `<app-quick-actions>` (unchanged selector/no inputs) — both consumed by `dashboard.component.ts` in Task 11.

- [ ] **Step 1: Write the failing tests**

`kyc-network-summary.component.spec.ts`:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { KycNetworkSummaryComponent } from './kyc-network-summary.component';

describe('KycNetworkSummaryComponent', () => {
  let fixture: ComponentFixture<KycNetworkSummaryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [KycNetworkSummaryComponent, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(KycNetworkSummaryComponent);
    fixture.componentInstance.data = { verified: 38, pending: 1, rejected: 3 };
    fixture.detectChanges();
  });

  it('renders all three counts', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('38');
    expect(text).toContain('1');
    expect(text).toContain('3');
  });
});
```

`quick-actions.component.spec.ts` (create if it doesn't already exist; if it does, extend it):

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { QuickActionsComponent } from './quick-actions.component';

describe('QuickActionsComponent', () => {
  let fixture: ComponentFixture<QuickActionsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QuickActionsComponent, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(QuickActionsComponent);
    fixture.detectChanges();
  });

  it('renders both action buttons as inert (no button/link elements)', () => {
    expect(fixture.nativeElement.querySelectorAll('button, a').length).toBe(0);
    const buttons = fixture.nativeElement.querySelectorAll('.quick-actions__button');
    expect(buttons.length).toBe(2);
  });

  it('still shows the contact-admin hint', () => {
    expect(fixture.nativeElement.textContent).toContain('admin');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx ng test --watch=false --include='**/kyc-network-summary.component.spec.ts' --include='**/quick-actions.component.spec.ts'`
Expected: FAIL — `kyc-network-summary` component doesn't exist; `quick-actions`'s current template has no `.quick-actions__button` elements.

- [ ] **Step 3: Implement `KycNetworkSummaryComponent`**

```typescript
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { KycBreakdown } from '../../models/dashboard-response.model';

@Component({
  selector: 'app-kyc-network-summary',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="kyc-network-summary">
      <span class="kyc-network-summary__label">{{ 'dashboard.kycNetworkLabel' | translate }}</span>
      <div class="kyc-network-summary__counts">
        <span class="kyc-network-summary__count kyc-network-summary__count--verified">
          {{ 'dashboard.kycVerifiedCount' | translate: { count: data.verified } }}
        </span>
        <span class="kyc-network-summary__count kyc-network-summary__count--pending">
          {{ 'dashboard.kycPendingCount' | translate: { count: data.pending } }}
        </span>
        <span class="kyc-network-summary__count kyc-network-summary__count--rejected">
          {{ 'dashboard.kycRejectedCount' | translate: { count: data.rejected } }}
        </span>
      </div>
    </div>
  `
})
export class KycNetworkSummaryComponent {
  @Input({ required: true }) data!: KycBreakdown;
}
```

- [ ] **Step 4: Implement the `quick-actions` restyle**

```typescript
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

// Rendered as <span>, not <button>/<a>: these two actions have no associate-facing backend
// route (dashboard-mockup spec §1/§2, matching the 2026-08-17 spec's identical resolution) --
// a real button/link would imply an interaction that doesn't exist.
@Component({
  selector: 'app-quick-actions',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="quick-actions">
      <span class="quick-actions__button quick-actions__button--primary">{{ 'dashboard.recordSaleAction' | translate }}</span>
      <span class="quick-actions__button quick-actions__button--secondary">{{ 'dashboard.provisionAssociateAction' | translate }}</span>
      <p class="quick-actions__hint">{{ 'dashboard.quickActionsContactAdmin' | translate }}</p>
    </div>
  `
})
export class QuickActionsComponent {}
```

Add to `frontend/src/assets/i18n/en.json` under `dashboard`:

```json
"kycNetworkLabel": "KYC in Network",
"kycVerifiedCount": "{{count}} verified",
"kycPendingCount": "{{count}} pending",
"kycRejectedCount": "{{count}} rejected",
"recordSaleAction": "+ Record Sale",
"provisionAssociateAction": "+ Provision Associate",
```

Add to `frontend/src/assets/i18n/hi.json` under `dashboard`:

```json
"kycNetworkLabel": "नेटवर्क में केवाईसी",
"kycVerifiedCount": "{{count}} सत्यापित",
"kycPendingCount": "{{count}} लंबित",
"kycRejectedCount": "{{count}} अस्वीकृत",
"recordSaleAction": "+ बिक्री दर्ज करें",
"provisionAssociateAction": "+ एसोसिएट जोड़ें",
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npx ng test --watch=false --include='**/kyc-network-summary.component.spec.ts' --include='**/quick-actions.component.spec.ts'`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/dashboard/widgets/kyc-network-summary/ frontend/src/app/dashboard/widgets/quick-actions/ frontend/src/assets/i18n/en.json frontend/src/assets/i18n/hi.json
git commit -m "feat(dashboard): add KycNetworkSummaryComponent and restyle quick-actions to two buttons"
```

---

### Task 11: `dashboard.component.ts` rewrite and legacy widget deletion

**Files:**
- Modify: `frontend/src/app/dashboard/dashboard.component.ts`
- Modify: `frontend/src/app/dashboard/dashboard.component.spec.ts`
- Modify: `frontend/src/assets/i18n/en.json`, `frontend/src/assets/i18n/hi.json`
- Delete: `frontend/src/app/dashboard/widgets/leg-volume-gauge/` (both files)
- Delete: `frontend/src/app/dashboard/widgets/rank-progress/` (both files)
- Delete: `frontend/src/app/dashboard/widgets/team-snapshot/` (both files)
- Delete: `frontend/src/app/dashboard/widgets/announcements-strip/` (both files)
- Delete: `frontend/src/app/dashboard/widgets/cycle-countdown/` (both files)
- Delete: `frontend/src/app/dashboard/widgets/wallet-card/` (both files)
- Delete: `frontend/src/app/dashboard/widgets/associate-identity-header/` (both files)

**Interfaces:**
- Consumes: `DashboardResponse` (Task 5), `StatTileComponent` (`frontend/src/app/shared/components/stat-tile/stat-tile.component.ts`, already exists), `KycBannerComponent`, `CycleIncomeCardComponent` (Task 6), `QuickActionsComponent` (Task 10), `RecentSalesTableComponent` (Task 8), `NetworkGrowthChartComponent` (Task 9), `KycNetworkSummaryComponent` (Task 10).

- [ ] **Step 1: Delete the seven unused widget directories**

```bash
rm -rf frontend/src/app/dashboard/widgets/leg-volume-gauge
rm -rf frontend/src/app/dashboard/widgets/rank-progress
rm -rf frontend/src/app/dashboard/widgets/team-snapshot
rm -rf frontend/src/app/dashboard/widgets/announcements-strip
rm -rf frontend/src/app/dashboard/widgets/cycle-countdown
rm -rf frontend/src/app/dashboard/widgets/wallet-card
rm -rf frontend/src/app/dashboard/widgets/associate-identity-header
```

- [ ] **Step 2: Write the failing test — rewrite `dashboard.component.spec.ts`**

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { DashboardComponent } from './dashboard.component';
import { DashboardResponse } from './models/dashboard-response.model';

describe('DashboardComponent', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let httpMock: HttpTestingController;

  const mockResponse: DashboardResponse = {
    associate: {
      associateId: 'SDI384818', name: 'Asha Kumar', rank: 'Sales Associate',
      phone: '9876543210', joinedAt: '2025-09-05T05:25:42Z', rankChangedAt: null
    },
    kycPendingBannerVisible: true,
    cycleIncome: {
      cycleId: 'c1', directIncome: 1000, matchingIncome: 500, sponsorMatchingIncome: 300,
      selfPerformanceBonus: 200, royaltyBonus: 400, royaltyBonusPct: 3, totalIncome: 2400,
      previousCycleTotalIncome: 1800, incomeTrend: [1200, 1800, 2400]
    },
    wallet: { balance: 2500 },
    cycleCountdown: { cycleId: 'c1', daysRemaining: 9 },
    salesSummary: { salesThisCycle: 6, revenueBookedThisCycle: 3850000, revenueBookedChangePct: 18 },
    networkSummary: { totalDownline: 42, directCount: 8 },
    networkGrowth: [
      { cycleLabel: '01', downlineCount: 12 }, { cycleLabel: '02', downlineCount: 18 },
      { cycleLabel: '03', downlineCount: 25 }, { cycleLabel: '04', downlineCount: 30 },
      { cycleLabel: '05', downlineCount: 34 }, { cycleLabel: '06', downlineCount: 37 },
      { cycleLabel: '07', downlineCount: 40 }, { cycleLabel: '08', downlineCount: 42 }
    ],
    kycBreakdown: { verified: 38, pending: 1, rejected: 3 }
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardComponent, HttpClientTestingModule, RouterTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    const dashboardReq = httpMock.expectOne('/api/associates/me/dashboard');
    dashboardReq.flush(mockResponse);
    fixture.detectChanges();

    // RecentSalesTableComponent fires its own request as a child; flush it so fixture settles.
    const salesReq = httpMock.expectOne(r => r.url === '/api/associates/me/sales');
    salesReq.flush({ page: 0, size: 5, totalElements: 0, sales: [] });
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('renders the page header with the associate name, rank badge, and cycle subtitle', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Asha Kumar');
    expect(text).toContain('Sales Associate');
    expect(text).toContain('SDI384818');
  });

  it('renders the Seal Card, KYC banner, and all four KPI tiles', () => {
    expect(fixture.nativeElement.querySelector('app-cycle-income-card')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-kyc-banner')).toBeTruthy();
    expect(fixture.nativeElement.querySelectorAll('app-stat-tile').length).toBe(4);
  });

  it('renders the two-column panel row: recent sales, network growth, KYC summary, quick actions', () => {
    expect(fixture.nativeElement.querySelector('app-recent-sales-table')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-network-growth-chart')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-kyc-network-summary')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-quick-actions')).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/dashboard.component.spec.ts'`
Expected: FAIL — `DashboardComponent` still imports the seven deleted widget files (build error) and its template doesn't have the new structure yet.

- [ ] **Step 4: Implement**

```typescript
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { DashboardService } from './dashboard.service';
import { DashboardResponse } from './models/dashboard-response.model';
import { KycBannerComponent } from './widgets/kyc-banner/kyc-banner.component';
import { CycleIncomeCardComponent } from './widgets/cycle-income-card/cycle-income-card.component';
import { QuickActionsComponent } from './widgets/quick-actions/quick-actions.component';
import { RecentSalesTableComponent } from './widgets/recent-sales-table/recent-sales-table.component';
import { NetworkGrowthChartComponent } from './widgets/network-growth-chart/network-growth-chart.component';
import { KycNetworkSummaryComponent } from './widgets/kyc-network-summary/kyc-network-summary.component';
import { StatTileComponent } from '../shared/components/stat-tile/stat-tile.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule, TranslateModule, KycBannerComponent, CycleIncomeCardComponent,
    QuickActionsComponent, RecentSalesTableComponent, NetworkGrowthChartComponent,
    KycNetworkSummaryComponent, StatTileComponent
  ],
  providers: [CurrencyPipe],
  template: `
    <div class="dashboard" *ngIf="dashboard as d">
      <div class="dashboard__header">
        <div class="dashboard__header-left">
          <h1 class="dashboard__title">{{ 'dashboard.title' | translate }}</h1>
          <p class="dashboard__subtitle">{{ 'dashboard.cycleCloses' | translate: { days: d.cycleCountdown.daysRemaining } }}</p>
        </div>
        <div class="dashboard__header-right">
          <span class="dashboard__name">{{ d.associate.name }}</span>
          <span class="dashboard__rank-badge">{{ d.associate.rank }}</span>
          <span class="dashboard__id-caption">{{ 'dashboard.associateIdLabel' | translate }} {{ d.associate.associateId }}</span>
        </div>
      </div>

      <app-kyc-banner [visible]="d.kycPendingBannerVisible"></app-kyc-banner>

      <app-cycle-income-card [data]="d.cycleIncome"></app-cycle-income-card>

      <div class="dashboard__tiles">
        <app-stat-tile
          icon="account_balance_wallet"
          [label]="'dashboard.walletBalanceLabel' | translate"
          [value]="formatCurrency(d.wallet.balance)"
          [hint]="'dashboard.withdrawContactAdmin' | translate"
        ></app-stat-tile>
        <app-stat-tile
          icon="group"
          [label]="'dashboard.networkLabel' | translate"
          [value]="d.networkSummary.totalDownline.toString()"
          [hint]="'dashboard.networkHint' | translate: { direct: d.networkSummary.directCount, downline: d.networkSummary.totalDownline - d.networkSummary.directCount }"
        ></app-stat-tile>
        <app-stat-tile
          icon="sell"
          [label]="'dashboard.salesThisCycleLabel' | translate"
          [value]="d.salesSummary.salesThisCycle.toString()"
        ></app-stat-tile>
        <app-stat-tile
          icon="trending_up"
          [label]="'dashboard.revenueBookedLabel' | translate"
          [value]="formatCurrency(d.salesSummary.revenueBookedThisCycle)"
          [hint]="revenueHint(d.salesSummary.revenueBookedChangePct)"
        ></app-stat-tile>
      </div>

      <div class="dashboard__panels">
        <app-recent-sales-table></app-recent-sales-table>
        <div class="dashboard__panels-right">
          <app-network-growth-chart [data]="d.networkGrowth"></app-network-growth-chart>
          <app-kyc-network-summary [data]="d.kycBreakdown"></app-kyc-network-summary>
          <app-quick-actions></app-quick-actions>
        </div>
      </div>
    </div>
    <div class="dashboard-error" *ngIf="error">{{ 'dashboard.loadError' | translate }}</div>
  `
})
export class DashboardComponent implements OnInit {
  private dashboardService = inject(DashboardService);
  private currencyPipe = inject(CurrencyPipe);

  dashboard: DashboardResponse | null = null;
  error = false;

  ngOnInit(): void {
    this.dashboardService.getDashboard().subscribe({
      next: d => (this.dashboard = d),
      error: () => (this.error = true)
    });
  }

  formatCurrency(value: number): string {
    return this.currencyPipe.transform(value, 'INR', 'symbol', '1.0-0') ?? String(value);
  }

  revenueHint(changePct: number): string {
    const sign = changePct >= 0 ? '+' : '';
    return `${sign}${changePct}%`;
  }
}
```

Add to `frontend/src/assets/i18n/en.json` under `dashboard` (and remove the now-dead keys listed in Step 6 below):

```json
"title": "Dashboard",
"walletBalanceLabel": "Wallet Balance",
"networkLabel": "Network",
"networkHint": "{{direct}} direct · {{downline}} downline",
"salesThisCycleLabel": "Sales This Cycle",
"revenueBookedLabel": "Revenue Booked",
```

Add to `frontend/src/assets/i18n/hi.json` under `dashboard`:

```json
"title": "डैशबोर्ड",
"walletBalanceLabel": "वॉलेट बैलेंस",
"networkLabel": "नेटवर्क",
"networkHint": "{{direct}} प्रत्यक्ष · {{downline}} डाउनलाइन",
"salesThisCycleLabel": "इस साइकिल में बिक्री",
"revenueBookedLabel": "बुक्ड राजस्व",
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/dashboard.component.spec.ts'`
Expected: PASS.

- [ ] **Step 6: Remove now-dead i18n keys**

Delete these keys from both `frontend/src/assets/i18n/en.json` and `frontend/src/assets/i18n/hi.json`, under `dashboard` — no component references them after the widget deletions in Step 1: `projectedMatch`, `nextRank`, `leftLeg`, `rightLeg`, `leftLegAssociates`, `rightLegAssociates`, `totalDownlineLabel`, `activeTodayLabel`, `newJoinsLabel`, `carriedForward`, `totalBusiness`, `newBookedArea`, `phoneLabel`, `joinedAtLabel`, `rankChangedAtLabel`.

- [ ] **Step 7: Run the full frontend test suite**

Run: `cd frontend && npx ng test --watch=false`
Expected: PASS. (This surfaces any other spec file — e.g. a routing smoke test — that still references a deleted widget selector or the old `DashboardResponse` shape.)

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/dashboard/ frontend/src/assets/i18n/en.json frontend/src/assets/i18n/hi.json
git commit -m "feat(dashboard): rewrite the layout around the mockup, delete 7 superseded widgets"
```

---

### Task 12: `_dashboard.scss` — styling pass

**Files:**
- Create: `frontend/src/styles/_dashboard.scss`
- Modify: `frontend/src/styles.scss`

**Interfaces:**
- Consumes: existing tokens from `_tokens.scss` (`--ink`, `--surface-page`, `--surface-card`, `--surface-raised`, `--border-subtle`, `--text-primary`, `--text-muted`, `--brand-primary`, `--brand-primary-bright`, `--brand-secondary`, `--brand-secondary-contrast`, `--status-success/warning/danger`, `--font-display`, `--font-mono`, `--radius-sm`) and the `.seal-card`/`.seal-card__*` classes already in `_setup.scss` (Task 6 added `.seal-card__delta`/`.seal-card__trend`, styled here) and `.stat-tile` in `_shared-components.scss`.

This task has no automated test — it's a pure CSS pass. Verification is the manual run-through in Task 13 (per spec §5, no Playwright/visual-regression coverage for this route).

- [ ] **Step 1: Create the partial**

```scss
// Associate Dashboard (dashboard-mockup spec, Viraj Acres Dashboard.dc.html option 1a):
// page-header row, the existing Seal Card hero (see _setup.scss's .seal-card, extended here
// with .seal-card__delta/.seal-card__trend), a 4-tile KPI row, and a two-column panel row.

.dashboard {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding: 1.5rem 1.75rem 2rem;
}

.dashboard__header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.dashboard__title {
  margin: 0 0 0.3rem;
  font-family: var(--font-display);
  font-size: 1.875rem;
  font-weight: 600;
  color: var(--text-primary);
}

.dashboard__subtitle {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--text-muted);
}

.dashboard__header-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.dashboard__name {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-primary);
}

.dashboard__rank-badge {
  padding: 0.375rem 0.6875rem;
  border: 1px solid var(--brand-secondary);
  border-radius: var(--radius-sm);
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--brand-secondary);
}

.dashboard__id-caption {
  font-family: var(--font-mono);
  font-size: 0.6875rem;
  color: var(--text-muted);
}

.kyc-banner {
  padding: 0.75rem 1rem;
  background: var(--status-warning);
  border-radius: var(--radius-sm);
  color: var(--brand-secondary-contrast);
  font-size: 0.8125rem;
  font-weight: 500;
}

// Seal Card additions (base .seal-card/.seal-card__* rules live in _setup.scss).
.seal-card__delta {
  margin: 0 0 0.75rem;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--status-success);
}

.seal-card__delta--down {
  color: var(--status-danger);
}

.seal-card__trend {
  width: 100%;
  height: 40px;
  margin: 0 0 0.75rem;
  color: var(--brand-primary);

  polyline {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
  }
}

.dashboard__tiles {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
}

.dashboard__panels {
  display: grid;
  grid-template-columns: 1.15fr 1fr;
  gap: 1rem;
  align-items: start;
}

.dashboard__panels-right {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

// Recent Sales table.
.recent-sales-table {
  background: var(--surface-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 1rem 1.125rem;
}

.recent-sales-table__header {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  margin-bottom: 0.75rem;
}

.recent-sales-table__rule {
  flex: 1;
  height: 1px;
  background: rgba(92, 26, 42, 0.22);
}

.recent-sales-table__label {
  font-size: 0.625rem;
  font-weight: 500;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--brand-secondary);
  white-space: nowrap;
}

.recent-sales-table__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.75rem;

  th {
    text-align: left;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border-subtle);
    font-size: 0.5938rem;
    font-weight: 500;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  td {
    padding: 0.625rem 0.375rem 0.625rem 0;
    border-bottom: 1px solid rgba(217, 207, 188, 0.6);
    color: var(--text-primary);
  }
}

.recent-sales-table__plot-no {
  font-family: var(--font-mono);
}

.recent-sales-table__status-pill {
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.5625rem;
  border-radius: 999px;
  background: rgba(75, 122, 82, 0.12);
  font-size: 0.6563rem;
  font-weight: 500;
  color: var(--status-success);
}

.recent-sales-table__status-pill--voided {
  background: rgba(178, 59, 50, 0.12);
  color: var(--status-danger);
}

.recent-sales-table__empty,
.recent-sales-table__error {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--text-muted);
}

// Network Growth chart.
.network-growth-chart {
  background: var(--surface-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 1rem 1.125rem;
}

.network-growth-chart__header {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  margin-bottom: 0.75rem;
}

.network-growth-chart__rule {
  flex: 1;
  height: 1px;
  background: rgba(92, 26, 42, 0.22);
}

.network-growth-chart__label {
  font-size: 0.625rem;
  font-weight: 500;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--brand-secondary);
  white-space: nowrap;
}

.network-growth-chart__bars {
  width: 100%;
  height: 60px;
  display: block;

  rect {
    fill: var(--brand-secondary);
    opacity: 0.35;
  }
}

.network-growth-chart__axis {
  display: flex;
  justify-content: space-between;
  margin-top: 0.375rem;
  font-family: var(--font-mono);
  font-size: 0.5938rem;
  color: var(--text-muted);
}

// KYC network summary.
.kyc-network-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  background: var(--surface-raised);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 0.8125rem 1.125rem;
}

.kyc-network-summary__label {
  font-size: 0.625rem;
  font-weight: 500;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.kyc-network-summary__counts {
  display: flex;
  gap: 1rem;
  font-size: 0.75rem;
  font-weight: 500;
}

.kyc-network-summary__count--verified {
  color: var(--status-success);
}

.kyc-network-summary__count--pending {
  color: var(--status-warning);
}

.kyc-network-summary__count--rejected {
  color: var(--status-danger);
}

// Quick actions (inert -- see quick-actions.component.ts's own comment for why these are spans).
.quick-actions {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.quick-actions__button {
  display: block;
  border-radius: var(--radius-sm);
  padding: 0.8125rem 0;
  text-align: center;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: default;
}

.quick-actions__button--primary {
  background: var(--brand-secondary);
  color: var(--brand-secondary-contrast);
}

.quick-actions__button--secondary {
  border: 1px solid var(--brand-secondary);
  color: var(--brand-secondary);
}

.quick-actions__hint {
  margin: 0;
  font-size: 0.75rem;
  color: var(--text-muted);
}

@media (max-width: 960px) {
  .dashboard__tiles {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .dashboard__panels {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 2: Wire the partial into `styles.scss`**

In `frontend/src/styles.scss`, add `@use 'styles/dashboard';` after `@use 'styles/setup';`:

```scss
@use 'styles/tokens';
@use 'styles/reset';
@use 'styles/forms';
@use 'styles/buttons';
@use 'styles/cards';
@use 'styles/tables';
@use 'styles/app-shell';
@use 'styles/shared-components';
@use 'styles/admin';
@use 'styles/setup';
@use 'styles/dashboard';
@use 'styles/settings';

@import 'material-symbols/outlined.css';
```

- [ ] **Step 3: Verify the Angular build compiles the new SCSS with no errors**

Run: `cd frontend && npx ng build --configuration development`
Expected: build succeeds with no SCSS errors (undefined variable, syntax, etc.).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/styles/_dashboard.scss frontend/src/styles.scss
git commit -m "style(dashboard): add the mockup's page-header/tiles/panels/chart styling"
```

---

### Task 13: Manual verification

**Files:** none — this task runs the app and looks at it, per the spec's explicit "no Playwright/visual-regression" testing decision (spec §5).

- [ ] **Step 1: Start the stack**

Use the `run` skill (per this repo's own convention for "confirm a change works in the real app") to start backend + frontend + DB.

- [ ] **Step 2: Walk through as an associate**

Log in as a seeded `ASSOCIATE`-role user, navigate to `/dashboard`, and confirm against the mockup and spec:
- Page-header shows title, cycle-closes subtitle, associate name, rank badge, associate ID.
- KYC banner appears only when `kycPendingBannerVisible` is true.
- Seal Card shows the total figure, the vs-last-cycle delta (correct sign/color), the sparkline (or its absence on a fresh account with <2 cycles of history), and the existing 5-line breakdown.
- Four KPI tiles render with correct values and the Network tile's direct/downline hint sums back to the total.
- Recent Sales table shows up to 5 rows with real plot numbers/project names and a 2-state status pill, or its own empty/error state — independent of the rest of the page if that one request fails (throttle/block `/api/associates/me/sales` in devtools to confirm isolation).
- Network Growth chart renders 8 bars with the tallest at full height.
- KYC network summary shows 3 counts.
- Quick actions render as two inert buttons plus the existing contact-admin hint — clicking them does nothing.
- Confirm `/rewards` still shows rank progress (unaffected by this plan's dashboard-instance removal).

- [ ] **Step 3: Check both languages**

Switch the app language to Hindi and repeat a quick pass over the page — confirm no raw i18n keys are visible (a key falling back to itself means a `hi.json` addition was missed).

- [ ] **Step 4: Report findings**

If everything matches, this plan is complete — no commit for this task (nothing changes). If something's off, fix it as a small follow-up commit against the specific task above whose deliverable is wrong, not a new ad-hoc change.
