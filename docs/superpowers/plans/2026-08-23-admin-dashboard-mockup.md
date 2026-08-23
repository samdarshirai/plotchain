# Admin Dashboard Mockup Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/admin/dashboard` (`AdminDashboardComponent`) around the same two-column mockup layout the associate dashboard already uses, replacing its old section-by-section structure, and backfill the backend fields (income delta/trend, org-wide network growth, an admin-scoped recent-sales list, and per-sale associate identity) the new layout needs.

**Architecture:** No new services or tables. `AdminStatsResponse`/`AdminStatsService` gain new fields computed from existing repositories (one new `AssociateRepository` query, reused `LedgerEntryRepository`/`CycleRepository` calls already used elsewhere, and one new `SaleService` dependency for the recent-sales list). `SaleResponse` gains two associate-display fields, resolved via the same batch-lookup pattern `LedgerService.associatesById` already establishes. On the frontend: `SealCardComponent` gains optional delta/trend inputs (only consumer is the admin dashboard, so this is a safe extension); two new small presentational widgets (`AdminRecentSalesTableComponent`, `AdminNetworkGrowthChartComponent`) mirror the associate dashboard's own widgets but read off `@Input` instead of firing their own HTTP calls; the associate side's `KycNetworkSummaryComponent` is reused directly (structurally-compatible `KycBreakdown` shape, no adapter needed). `AdminDashboardComponent`'s template and `_admin.scss`'s admin-dashboard block are both rewritten.

**Tech Stack:** Spring Boot / JPA / Postgres (H2 for `@DataJpaTest`), JUnit 5 + Mockito + AssertJ; Angular 17+ standalone components, `@ngx-translate/core`, Karma.

**Spec:** `docs/superpowers/specs/2026-08-23-admin-dashboard-mockup-design.md`

## Global Constraints

- No migration file is touched — every new field is a derived aggregate over existing columns.
- No Playwright e2e — deferred per standing project decision (see memory `e2e-testing-plan`). Verify the finished screen manually via the `run` skill instead.
- `AdminStatsResponse`'s existing fields (`totalAssociates`, `totalWalletBalance`, `pendingWithdrawals`, `kycBreakdown`, and `currentCycle`'s existing fields) keep their current meaning — only new fields are added, nothing renamed or removed.
- `SalesRegisterComponent` (`/settings/sales-register`) is out of scope — do not wire the new `associateUserId`/`associateName` `Sale` fields into it.
- This plan deliberately drops the KYC-pending tile's `routerLink` to `/settings/kyc-queue` that exists on the current admin dashboard: the new layout reuses `KycNetworkSummaryComponent` directly (per spec §3.2), which is a read-only 3-pill summary with no link. The queue is still reachable from the Settings nav. This is a spec-approved trade, not an oversight — do not silently restore the old link.
- Exclusive-upper-bound date convention: every `cutoffExclusive`/`...ToExclusive` parameter in this plan is the day *after* the last day to include, matching `AssociateRepository.countByRoleAndJoinedBetween`/`countDownlineJoinedBefore` and `DashboardService`'s own cycle-boundary math.

---

### Task 1: Sale associate display fields (`SaleResponse`, `SaleService`)

**Files:**
- Modify: `backend/src/main/java/com/plotchain/sales/SaleResponse.java`
- Modify: `backend/src/main/java/com/plotchain/sales/SaleService.java`
- Modify: `backend/src/test/java/com/plotchain/sales/SaleServiceTest.java`
- Modify: `backend/src/test/java/com/plotchain/sales/SaleControllerTest.java`
- Modify: `backend/src/test/java/com/plotchain/sales/AssociateSaleControllerTest.java`

**Interfaces:**
- Produces: `SaleResponse` gains two new *trailing* record components: `associateUserId` (`String`, nullable), `associateName` (`String`, nullable). Every other component and its position is unchanged.

- [ ] **Step 1: Add the two fields to `SaleResponse`**

Edit `backend/src/main/java/com/plotchain/sales/SaleResponse.java` to:

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
    String projectName,
    String associateUserId,
    String associateName
) {}
```

- [ ] **Step 2: Write the failing test for `toResponses`' batch associate resolution**

Add to `backend/src/test/java/com/plotchain/sales/SaleServiceTest.java`, right after the existing `getMySalesPopulatesPlotNoAndProjectNameFromABatchLookupNotPerRowQueries` test:

```java
    @Test
    void getMySalesPopulatesAssociateUserIdAndNameFromABatchLookupNotPerRowQueries() {
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
        when(associateRepository.findAllById(List.of(ASSOCIATE_ID))).thenReturn(List.of(associateWithPosition("L")));

        AssociateSalePageResponse response = saleService.getMySales(ASSOCIATE_ID, 0, 20);

        assertThat(response.sales().get(0).associateUserId()).isEqualTo("VP00001");
        assertThat(response.sales().get(0).associateName()).isEqualTo("Jane Associate");
    }
```

Also update the `associateWithPosition` helper (used by nearly every existing test in this file) so it carries a real `userId`/`name` the new assertions above and in Step 4 can check against:

```java
    private Associate associateWithPosition(String position) {
        Associate associate = new Associate();
        associate.setId(ASSOCIATE_ID);
        associate.setPosition(position);
        associate.setUserId("VP00001");
        associate.setName("Jane Associate");
        return associate;
    }
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd backend && ./mvnw -o test -Dtest=SaleServiceTest#getMySalesPopulatesAssociateUserIdAndNameFromABatchLookupNotPerRowQueries`
Expected: FAIL — `SaleResponse` has no `associateUserId()`/`associateName()` accessors yet (compile error), or once those exist, the returned values are `null`.

- [ ] **Step 4: Update `SaleService`'s mapping methods**

In `backend/src/main/java/com/plotchain/sales/SaleService.java`:

Replace the `toResponses` private method with:

```java
    // dashboard-mockup spec §3.1 and 2026-08-23-admin-dashboard-mockup-design.md §3.1:
    // plotNo/projectName/associateUserId/associateName are all resolved here via batch lookups
    // (three IN-queries total, regardless of how many sales are being mapped) rather than a
    // per-row join or per-row repository call. recordSale/voidSale don't route through this --
    // they already hold their own Plot/Associate from earlier in their own flow, so they call
    // toResponse(sale, plot, associate) directly instead of re-fetching here.
    private List<SaleResponse> toResponses(List<Sale> sales) {
        List<UUID> plotIds = sales.stream().map(Sale::getPlotId).distinct().toList();
        Map<UUID, Plot> plotsById = plotRepository.findAllById(plotIds).stream()
            .collect(Collectors.toMap(Plot::getId, p -> p));
        List<UUID> projectIds = plotsById.values().stream().map(Plot::getProjectId).distinct().toList();
        Map<UUID, String> projectNamesByProjectId = projectRepository.findAllById(projectIds).stream()
            .collect(Collectors.toMap(Project::getId, Project::getName));
        List<UUID> associateIds = sales.stream().map(Sale::getAssociateId).distinct().toList();
        Map<UUID, Associate> associatesById = associateRepository.findAllById(associateIds).stream()
            .collect(Collectors.toMap(Associate::getId, a -> a));

        return sales.stream().map(sale -> {
            Plot plot = plotsById.get(sale.getPlotId());
            String plotNo = plot != null ? plot.getPlotNo() : null;
            String projectName = plot != null ? projectNamesByProjectId.get(plot.getProjectId()) : null;
            Associate associate = associatesById.get(sale.getAssociateId());
            String associateUserId = associate != null ? associate.getUserId() : null;
            String associateName = associate != null ? associate.getName() : null;
            return buildResponse(sale, plotNo, projectName, associateUserId, associateName);
        }).toList();
    }

    // recordSale/voidSale's single-sale path: both already hold the Plot and Associate they need
    // (recordSale from its own guard-loading earlier in the same transaction; voidSale via a
    // fresh single findById, see below), so this resolves projectName with one findById instead
    // of routing through toResponses' batch findAllById, which would silently re-fetch rows
    // already in memory.
    private SaleResponse toResponse(Sale sale, Plot plot, Associate associate) {
        String plotNo = plot != null ? plot.getPlotNo() : null;
        String projectName = plot != null
            ? projectRepository.findById(plot.getProjectId()).map(Project::getName).orElse(null)
            : null;
        String associateUserId = associate != null ? associate.getUserId() : null;
        String associateName = associate != null ? associate.getName() : null;
        return buildResponse(sale, plotNo, projectName, associateUserId, associateName);
    }

    private SaleResponse buildResponse(
            Sale sale, String plotNo, String projectName, String associateUserId, String associateName) {
        return new SaleResponse(
            sale.getId(), sale.getPlotId(), sale.getAssociateId(),
            sale.getBuyerName(), sale.getBuyerPhone(), sale.getBuyerEmail(),
            sale.getAmount(), sale.getCycleId(), sale.getLegCredited(),
            sale.getStatus().name(), sale.getVoidReason(), sale.getRecordedAt(),
            plotNo, projectName, associateUserId, associateName);
    }
```

This removes the old two-argument `toResponse(Sale sale, Plot plot)` and the old three-argument `buildResponse(Sale sale, String plotNo, String projectName)` — replace them in place with the versions above (do not leave both old and new overloads present).

Update `recordSale`'s final line (it already has `associate` in scope from its own guard) from:

```java
        return toResponse(sale, plot);
```

to:

```java
        return toResponse(sale, plot, associate);
```

Update `voidSale`'s final line — it does not currently load an `Associate` at all. Change:

```java
        // Flow step 6. plot is already loaded above -- toResponse(sale, plot) reuses it instead
        // of re-fetching via toResponses' batch Plot lookup.
        return toResponse(sale, plot);
```

to:

```java
        // Flow step 6. plot is already loaded above -- toResponse(sale, plot, associate) reuses
        // it instead of re-fetching via toResponses' batch Plot lookup. associate is a fresh,
        // single lookup (never loaded elsewhere in this method) resolved null-safely, same as the
        // plot/project resolution in toResponse above -- not the missing-Plot case's strict
        // IllegalStateException a few lines up, since a missing associate here is a display-field
        // gap, not a broken data invariant blocking the write.
        Associate associate = associateRepository.findById(sale.getAssociateId()).orElse(null);
        return toResponse(sale, plot, associate);
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && ./mvnw -o test -Dtest=SaleServiceTest#getMySalesPopulatesAssociateUserIdAndNameFromABatchLookupNotPerRowQueries`
Expected: PASS

- [ ] **Step 6: Add coverage for `recordSale`'s reused-associate path and `voidSale`'s new lookup path**

Add to `SaleServiceTest.java`, right after `recordSaleReturnsAFullyPopulatedSaleResponse`:

```java
    @Test
    void recordSaleReturnsTheAssociateDisplayFieldsFromTheAlreadyLoadedAssociateNoNewQuery() {
        stubHappyPathGuardsAndDependencies();

        SaleResponse response = saleService.recordSale(requestFor(PLOT_ID, ASSOCIATE_ID));

        assertThat(response.associateUserId()).isEqualTo("VP00001");
        assertThat(response.associateName()).isEqualTo("Jane Associate");
        // associateRepository.findById is the guard lookup itself (see
        // recordSaleThrowsAssociateNotFoundExceptionWhenTheAssociateDoesNotExist) -- proving it's
        // called exactly once here proves the response fields came from that same call, not a
        // second, redundant lookup.
        verify(associateRepository, org.mockito.Mockito.times(1)).findById(ASSOCIATE_ID);
    }
```

And update `stubVoidHappyPath` to stub the new lookup:

```java
    private void stubVoidHappyPath(Sale sale, LedgerEntry ledgerEntry) {
        when(saleRepository.findById(sale.getId())).thenReturn(Optional.of(sale));
        when(saleRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(plotRepository.findById(sale.getPlotId())).thenReturn(Optional.of(plotWithStatus(PlotStatus.SOLD)));
        when(plotRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(ledgerEntryRepository.findAllBySourceRef(sale.getId())).thenReturn(List.of(ledgerEntry));
        when(ledgerEntryRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associateWithPosition("L")));
    }
```

Then add, right after `voidSaleReturnsAFullyPopulatedSaleResponseReflectingTheReversal`:

```java
    @Test
    void voidSaleResolvesAssociateDisplayFieldsViaANewLookup() {
        UUID saleId = UUID.randomUUID();
        Sale sale = recordedSale(saleId, PLOT_ID);
        stubVoidHappyPath(sale, pendingLedgerEntry(saleId));

        SaleResponse response = saleService.voidSale(saleId, new VoidSaleRequest("Buyer backed out"));

        assertThat(response.associateUserId()).isEqualTo("VP00001");
        assertThat(response.associateName()).isEqualTo("Jane Associate");
    }
```

And update `voidSaleReversesEveryLedgerEntrySharingTheSaleAsSourceRef` (it stubs manually rather than via `stubVoidHappyPath`) to add one line — insert after its existing `when(ledgerEntryRepository.save(any())).thenAnswer(...)` line:

```java
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associateWithPosition("L")));
```

- [ ] **Step 7: Run the full test class**

Run: `cd backend && ./mvnw -o test -Dtest=SaleServiceTest`
Expected: PASS, all tests green.

- [ ] **Step 8: Fix the now-broken positional `SaleResponse` constructor calls in the two controller test files**

`SaleResponse` gained 2 trailing components — every direct `new SaleResponse(...)` call site needs `, null, null` appended. There are 3 in `SaleControllerTest.java` and 1 in `AssociateSaleControllerTest.java`.

In `backend/src/test/java/com/plotchain/sales/SaleControllerTest.java`, in `recordReturns201WithAFullyPopulatedSaleResponse`, change:

```java
        SaleResponse response = new SaleResponse(
            saleId, plotId, associateId, "Jane Buyer", "9999999999", null,
            new BigDecimal("600000.00"), cycleId, "L", "RECORDED", null, Instant.now(), null, null);
```

to:

```java
        SaleResponse response = new SaleResponse(
            saleId, plotId, associateId, "Jane Buyer", "9999999999", null,
            new BigDecimal("600000.00"), cycleId, "L", "RECORDED", null, Instant.now(), null, null,
            null, null);
```

In `voidReturns200WithAFullyPopulatedSaleResponseReflectingTheReversal`, change:

```java
        SaleResponse response = new SaleResponse(
            saleId, plotId, associateId, "Jane Buyer", "9999999999", null,
            new BigDecimal("600000.00"), cycleId, "L", "VOIDED", "Buyer backed out", Instant.now(), null, null);
```

to:

```java
        SaleResponse response = new SaleResponse(
            saleId, plotId, associateId, "Jane Buyer", "9999999999", null,
            new BigDecimal("600000.00"), cycleId, "L", "VOIDED", "Buyer backed out", Instant.now(), null, null,
            null, null);
```

In `listReturnsAPageMappedToSaleResponses`, wait — that method is actually named `listReturns200WithFilters` in this file; change:

```java
        SaleResponse sale = new SaleResponse(
            saleId, UUID.randomUUID(), associateId, "Jane Buyer", "9999999999", null,
            new BigDecimal("600000.00"), UUID.randomUUID(), "L", "RECORDED", null, Instant.now(), null, null);
```

to:

```java
        SaleResponse sale = new SaleResponse(
            saleId, UUID.randomUUID(), associateId, "Jane Buyer", "9999999999", null,
            new BigDecimal("600000.00"), UUID.randomUUID(), "L", "RECORDED", null, Instant.now(), null, null,
            null, null);
```

In `backend/src/test/java/com/plotchain/sales/AssociateSaleControllerTest.java`, find the single `new SaleResponse(` call and apply the same fix — append `,\n            null, null` before the closing `);`.

- [ ] **Step 9: Run the full sales test package**

Run: `cd backend && ./mvnw -o test -Dtest='com.plotchain.sales.*'`
Expected: PASS, all tests green (existing ~55 spurious JDK21/25 Mockito errors elsewhere in the suite are unrelated — see memory `plotchain_jdk_mockito_env_issue`).

- [ ] **Step 10: Commit**

```bash
git add backend/src/main/java/com/plotchain/sales/SaleResponse.java \
        backend/src/main/java/com/plotchain/sales/SaleService.java \
        backend/src/test/java/com/plotchain/sales/SaleServiceTest.java \
        backend/src/test/java/com/plotchain/sales/SaleControllerTest.java \
        backend/src/test/java/com/plotchain/sales/AssociateSaleControllerTest.java
git commit -m "feat(sales): resolve associate display fields onto SaleResponse"
```

---

### Task 2: Org-wide associate join-count query

**Files:**
- Modify: `backend/src/main/java/com/plotchain/associate/AssociateRepository.java`
- Modify: `backend/src/test/java/com/plotchain/associate/AssociateRepositoryTest.java`

**Interfaces:**
- Produces: `AssociateRepository.countByRoleAndJoinedBefore(AssociateRole role, Instant cutoffExclusive): long`

- [ ] **Step 1: Write the failing tests**

Add to `backend/src/test/java/com/plotchain/associate/AssociateRepositoryTest.java`, right after `searchDirectoryFiltersByJoinedDateRange`:

```java
    @Test
    void countByRoleAndJoinedBeforeCountsAllMatchingAssociatesRegardlessOfParent() {
        RankTier rank = persistRank("Sales Associate", 1);
        persistAssociate("VP00001", "Early", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.PENDING, AssociateStatus.ACTIVE, Instant.parse("2026-01-01T00:00:00Z"));
        persistAssociate("VP00002", "Late", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.PENDING, AssociateStatus.ACTIVE, Instant.parse("2026-03-01T00:00:00Z"));
        persistAssociate("testadmin", "Admin", AssociateRole.ADMIN, null,
            KycStatus.VERIFIED, AssociateStatus.ACTIVE, Instant.parse("2026-01-01T00:00:00Z"));
        entityManager.flush();

        long count = associateRepository.countByRoleAndJoinedBefore(
            AssociateRole.ASSOCIATE, Instant.parse("2026-02-01T00:00:00Z"));

        // "Early" counts. "Late" (joined after the cutoff) and the ADMIN-role row (wrong role,
        // despite joining before the cutoff) are both excluded.
        assertThat(count).isEqualTo(1);
    }

    @Test
    void countByRoleAndJoinedBeforeExcludesAnAssociateWhoJoinsExactlyAtTheCutoff() {
        RankTier rank = persistRank("Sales Associate", 1);
        Instant cutoff = Instant.parse("2026-02-01T00:00:00Z");
        persistAssociate("VP00001", "Exact", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.PENDING, AssociateStatus.ACTIVE, cutoff);
        entityManager.flush();

        assertThat(associateRepository.countByRoleAndJoinedBefore(AssociateRole.ASSOCIATE, cutoff)).isEqualTo(0);
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && ./mvnw -o test -Dtest=AssociateRepositoryTest#countByRoleAndJoinedBeforeCountsAllMatchingAssociatesRegardlessOfParent+countByRoleAndJoinedBeforeExcludesAnAssociateWhoJoinsExactlyAtTheCutoff`
Expected: FAIL — compile error, `countByRoleAndJoinedBefore` does not exist yet.

- [ ] **Step 3: Add the query method**

In `backend/src/main/java/com/plotchain/associate/AssociateRepository.java`, right after `countByRoleAndJoinedBetween`, add:

```java
    // Admin Dashboard rebuild's Network Growth chart (2026-08-23-admin-dashboard-mockup-design.md
    // §3.1): the org-wide sibling of countByRoleAndJoinedBetween above, unscoped by parent/sponsor
    // -- the admin dashboard has no single caller's downline to chart, unlike
    // AssociateRepository#countDownlineJoinedBefore on the associate side. cutoffExclusive is the
    // day AFTER a cycle's periodEnd, same exclusive-upper-bound convention as every other
    // cutoff in this repository.
    @Query("""
        SELECT COUNT(a) FROM Associate a
        WHERE a.role = :role AND a.joinedAt < :cutoffExclusive
        """)
    long countByRoleAndJoinedBefore(@Param("role") AssociateRole role, @Param("cutoffExclusive") Instant cutoffExclusive);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && ./mvnw -o test -Dtest=AssociateRepositoryTest`
Expected: PASS, all tests in the class green.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/associate/AssociateRepository.java \
        backend/src/test/java/com/plotchain/associate/AssociateRepositoryTest.java
git commit -m "feat(associate): add org-wide join-count query for the admin dashboard rebuild"
```

---

### Task 3: Admin stats income delta/trend, network growth, and recent sales

**Files:**
- Modify: `backend/src/main/java/com/plotchain/stats/AdminStatsResponse.java`
- Modify: `backend/src/main/java/com/plotchain/stats/AdminStatsService.java`
- Modify: `backend/src/test/java/com/plotchain/stats/AdminStatsServiceTest.java`
- Modify: `backend/src/test/java/com/plotchain/stats/AdminStatsControllerTest.java`

**Interfaces:**
- Consumes: `SaleService.list(UUID, SaleStatus, LocalDate, LocalDate, int, int): AdminSalePageResponse` (Task 1's `SaleResponse` now carries `associateUserId`/`associateName`); `AssociateRepository.countByRoleAndJoinedBefore` (Task 2).
- Produces: `AdminStatsResponse.CurrentCycleStats` gains trailing fields `previousCycleTotalIncome: BigDecimal`, `incomeTrend: List<BigDecimal>`. `AdminStatsResponse` gains trailing top-level fields `networkGrowth: List<NetworkGrowthPoint>`, `recentSales: List<SaleResponse>`. New nested record `AdminStatsResponse.NetworkGrowthPoint(String cycleLabel, long associateCount)`.

- [ ] **Step 1: Extend `AdminStatsResponse`**

Replace the full contents of `backend/src/main/java/com/plotchain/stats/AdminStatsResponse.java` with:

```java
package com.plotchain.stats;

import com.plotchain.sales.SaleResponse;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record AdminStatsResponse(
    long totalAssociates,
    KycBreakdown kycBreakdown,
    BigDecimal totalWalletBalance,
    long pendingWithdrawals,
    CurrentCycleStats currentCycle,
    long activePlots,
    long totalSalesRecorded,
    long cyclesCompleted,
    List<NetworkGrowthPoint> networkGrowth,
    List<SaleResponse> recentSales
) {
    public record KycBreakdown(long pending, long verified, long rejected) {}

    public record CurrentCycleStats(
        UUID cycleId,
        LocalDate periodStart,
        LocalDate periodEnd,
        long daysRemaining,
        BigDecimal directIncome,
        BigDecimal matchingIncome,
        BigDecimal totalIncome,
        long newAssociatesThisCycle,
        long salesThisCycle,
        BigDecimal revenueThisCycle,
        BigDecimal previousCycleTotalIncome,
        List<BigDecimal> incomeTrend
    ) {}

    // Admin Dashboard rebuild's Network Growth chart (2026-08-23-admin-dashboard-mockup-design.md
    // §3.1): org-wide associate-count-over-time, the admin sibling of DashboardResponse's own
    // NetworkGrowthPoint (which is scoped to one caller's downline). cycleLabel uses the same
    // month-of-periodStart format DashboardService.CYCLE_LABEL_FORMAT already established.
    public record NetworkGrowthPoint(String cycleLabel, long associateCount) {}
}
```

- [ ] **Step 2: Write the failing tests**

Replace the full contents of `backend/src/test/java/com/plotchain/stats/AdminStatsServiceTest.java` with:

```java
package com.plotchain.stats;

import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleRepository;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.income.IncomeType;
import com.plotchain.income.LedgerEntryRepository;
import com.plotchain.projects.PlotRepository;
import com.plotchain.projects.PlotStatus;
import com.plotchain.sales.AdminSalePageResponse;
import com.plotchain.sales.SaleRepository;
import com.plotchain.sales.SaleResponse;
import com.plotchain.sales.SaleService;
import com.plotchain.sales.SaleStatus;
import com.plotchain.wallet.WalletRepository;
import com.plotchain.withdrawal.WithdrawalRequestRepository;
import com.plotchain.withdrawal.WithdrawalRequestStatus;
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
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdminStatsServiceTest {

    @Mock AssociateRepository associateRepository;
    @Mock WalletRepository walletRepository;
    @Mock LedgerEntryRepository ledgerEntryRepository;
    @Mock CycleRepository cycleRepository;
    @Mock SaleRepository saleRepository;
    @Mock WithdrawalRequestRepository withdrawalRequestRepository;
    @Mock PlotRepository plotRepository;
    @Mock SaleService saleService;

    AdminStatsService adminStatsService;

    private static final DateTimeFormatter CYCLE_LABEL_FORMAT = DateTimeFormatter.ofPattern("MMM", Locale.ENGLISH);

    @BeforeEach
    void setUp() {
        adminStatsService = new AdminStatsService(
            associateRepository, walletRepository, ledgerEntryRepository, cycleRepository,
            saleRepository, withdrawalRequestRepository, plotRepository, saleService);
    }

    @Test
    void aggregatesCompanyWideStatsWhenACycleIsOpen() {
        UUID cycleId = UUID.randomUUID();
        Cycle cycle = new Cycle();
        cycle.setId(cycleId);
        cycle.setStatus(CycleStatus.OPEN);
        cycle.setPeriodStart(LocalDate.now().minusDays(5));
        cycle.setPeriodEnd(LocalDate.now().plusDays(10));

        when(associateRepository.countByRole(AssociateRole.ASSOCIATE)).thenReturn(42L);
        when(associateRepository.countByRoleAndKycStatus(AssociateRole.ASSOCIATE, KycStatus.PENDING)).thenReturn(5L);
        when(associateRepository.countByRoleAndKycStatus(AssociateRole.ASSOCIATE, KycStatus.VERIFIED)).thenReturn(30L);
        when(associateRepository.countByRoleAndKycStatus(AssociateRole.ASSOCIATE, KycStatus.REJECTED)).thenReturn(7L);
        when(walletRepository.sumAllBalances()).thenReturn(new BigDecimal("125000.50"));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN))
            .thenReturn(Optional.of(cycle));
        when(cycleRepository.findAllByOrderByPeriodStartDesc(any(PageRequest.class)))
            .thenReturn(new PageImpl<>(List.of(cycle)));
        when(ledgerEntryRepository.sumNetAmountByCycleAndType(cycleId, IncomeType.DIRECT))
            .thenReturn(new BigDecimal("1000"));
        when(ledgerEntryRepository.sumNetAmountByCycleAndType(cycleId, IncomeType.MATCHING))
            .thenReturn(new BigDecimal("500"));
        when(ledgerEntryRepository.sumNetAmountByCycle(cycleId))
            .thenReturn(new BigDecimal("1500"));
        when(associateRepository.countByRoleAndJoinedBetween(any(), any(), any())).thenReturn(3L);
        when(associateRepository.countByRoleAndJoinedBefore(any(), any())).thenReturn(2L);
        when(withdrawalRequestRepository.countByStatus(WithdrawalRequestStatus.REQUESTED)).thenReturn(4L);
        when(saleRepository.countByCycleIdAndStatus(cycleId, SaleStatus.RECORDED)).thenReturn(12L);
        when(saleRepository.sumAmountByCycleIdAndStatus(cycleId, SaleStatus.RECORDED))
            .thenReturn(new BigDecimal("2400000"));
        when(plotRepository.countByStatusNot(PlotStatus.SOLD)).thenReturn(21L);
        when(saleRepository.countByStatus(SaleStatus.RECORDED)).thenReturn(63L);
        when(cycleRepository.countByStatusIn(List.of(CycleStatus.CLOSED, CycleStatus.PAID))).thenReturn(11L);
        when(saleService.list(null, null, null, null, 0, 5))
            .thenReturn(new AdminSalePageResponse(List.of(), 0, 5, 0));

        AdminStatsResponse response = adminStatsService.getStats();

        assertThat(response.totalAssociates()).isEqualTo(42L);
        assertThat(response.kycBreakdown().pending()).isEqualTo(5L);
        assertThat(response.kycBreakdown().verified()).isEqualTo(30L);
        assertThat(response.kycBreakdown().rejected()).isEqualTo(7L);
        assertThat(response.totalWalletBalance()).isEqualByComparingTo("125000.50");
        assertThat(response.pendingWithdrawals()).isEqualTo(4L);
        assertThat(response.currentCycle()).isNotNull();
        assertThat(response.currentCycle().cycleId()).isEqualTo(cycleId);
        assertThat(response.currentCycle().periodStart()).isEqualTo(cycle.getPeriodStart());
        assertThat(response.currentCycle().periodEnd()).isEqualTo(cycle.getPeriodEnd());
        assertThat(response.currentCycle().daysRemaining()).isEqualTo(10L);
        assertThat(response.currentCycle().directIncome()).isEqualByComparingTo("1000");
        assertThat(response.currentCycle().matchingIncome()).isEqualByComparingTo("500");
        assertThat(response.currentCycle().totalIncome()).isEqualByComparingTo("1500");
        assertThat(response.currentCycle().newAssociatesThisCycle()).isEqualTo(3L);
        assertThat(response.currentCycle().salesThisCycle()).isEqualTo(12L);
        assertThat(response.currentCycle().revenueThisCycle()).isEqualByComparingTo("2400000");
        // No CLOSED cycle stubbed -- degrades to zero, same as DashboardService's own fallback.
        assertThat(response.currentCycle().previousCycleTotalIncome()).isEqualByComparingTo("0");
        assertThat(response.currentCycle().incomeTrend()).containsExactly(new BigDecimal("1500"));
        assertThat(response.activePlots()).isEqualTo(21L);
        assertThat(response.totalSalesRecorded()).isEqualTo(63L);
        assertThat(response.cyclesCompleted()).isEqualTo(11L);
        assertThat(response.networkGrowth()).hasSize(1);
        assertThat(response.networkGrowth().get(0).cycleLabel()).isEqualTo(CYCLE_LABEL_FORMAT.format(cycle.getPeriodStart()));
        assertThat(response.networkGrowth().get(0).associateCount()).isEqualTo(2L);
        assertThat(response.recentSales()).isEmpty();
    }

    @Test
    void populatesPreviousCycleTotalIncomeAndRecentSalesWhenTheyExist() {
        UUID cycleId = UUID.randomUUID();
        Cycle cycle = new Cycle();
        cycle.setId(cycleId);
        cycle.setStatus(CycleStatus.OPEN);
        cycle.setPeriodStart(LocalDate.now().minusDays(5));
        cycle.setPeriodEnd(LocalDate.now().plusDays(10));

        UUID closedCycleId = UUID.randomUUID();
        Cycle closedCycle = new Cycle();
        closedCycle.setId(closedCycleId);
        closedCycle.setStatus(CycleStatus.CLOSED);
        closedCycle.setPeriodStart(LocalDate.now().minusDays(35));
        closedCycle.setPeriodEnd(LocalDate.now().minusDays(6));

        when(associateRepository.countByRole(AssociateRole.ASSOCIATE)).thenReturn(10L);
        when(associateRepository.countByRoleAndKycStatus(any(), any())).thenReturn(0L);
        when(walletRepository.sumAllBalances()).thenReturn(BigDecimal.ZERO);
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN))
            .thenReturn(Optional.of(cycle));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED))
            .thenReturn(Optional.of(closedCycle));
        when(cycleRepository.findAllByOrderByPeriodStartDesc(any(PageRequest.class)))
            .thenReturn(new PageImpl<>(List.of(closedCycle, cycle)));
        when(ledgerEntryRepository.sumNetAmountByCycleAndType(any(), any())).thenReturn(BigDecimal.ZERO);
        when(ledgerEntryRepository.sumNetAmountByCycle(cycleId)).thenReturn(new BigDecimal("1500"));
        when(ledgerEntryRepository.sumNetAmountByCycle(closedCycleId)).thenReturn(new BigDecimal("1200"));
        when(associateRepository.countByRoleAndJoinedBetween(any(), any(), any())).thenReturn(0L);
        when(associateRepository.countByRoleAndJoinedBefore(any(), any())).thenReturn(0L);
        when(withdrawalRequestRepository.countByStatus(any())).thenReturn(0L);
        when(saleRepository.countByCycleIdAndStatus(any(), any())).thenReturn(0L);
        when(saleRepository.sumAmountByCycleIdAndStatus(any(), any())).thenReturn(BigDecimal.ZERO);
        when(plotRepository.countByStatusNot(any())).thenReturn(0L);
        when(saleRepository.countByStatus(any())).thenReturn(0L);
        when(cycleRepository.countByStatusIn(any())).thenReturn(0L);
        SaleResponse recentSale = new SaleResponse(
            UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "Jane Buyer", "9999999999", null,
            new BigDecimal("600000"), cycleId, "L", "RECORDED", null, Instant.now(), "A-101", "Viraj Greens",
            "VP00001", "Jane Associate");
        when(saleService.list(null, null, null, null, 0, 5))
            .thenReturn(new AdminSalePageResponse(List.of(recentSale), 0, 5, 1));

        AdminStatsResponse response = adminStatsService.getStats();

        assertThat(response.currentCycle().previousCycleTotalIncome()).isEqualByComparingTo("1200");
        // lastCycles is oldest-first (closedCycle, cycle) -- same ordering DashboardService uses.
        assertThat(response.currentCycle().incomeTrend()).containsExactly(new BigDecimal("1200"), new BigDecimal("1500"));
        assertThat(response.recentSales()).hasSize(1);
        assertThat(response.recentSales().get(0).associateUserId()).isEqualTo("VP00001");
        assertThat(response.recentSales().get(0).associateName()).isEqualTo("Jane Associate");
    }

    @Test
    void degradesGracefullyWithANullCurrentCycleWhenNoCycleIsOpen() {
        when(associateRepository.countByRole(AssociateRole.ASSOCIATE)).thenReturn(10L);
        when(associateRepository.countByRoleAndKycStatus(any(), any())).thenReturn(0L);
        when(walletRepository.sumAllBalances()).thenReturn(BigDecimal.ZERO);
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN))
            .thenReturn(Optional.empty());
        when(cycleRepository.findAllByOrderByPeriodStartDesc(any(PageRequest.class)))
            .thenReturn(Page.empty());
        when(withdrawalRequestRepository.countByStatus(WithdrawalRequestStatus.REQUESTED)).thenReturn(0L);
        when(plotRepository.countByStatusNot(PlotStatus.SOLD)).thenReturn(0L);
        when(saleRepository.countByStatus(SaleStatus.RECORDED)).thenReturn(0L);
        when(cycleRepository.countByStatusIn(List.of(CycleStatus.CLOSED, CycleStatus.PAID))).thenReturn(0L);
        when(saleService.list(null, null, null, null, 0, 5))
            .thenReturn(new AdminSalePageResponse(List.of(), 0, 5, 0));

        AdminStatsResponse response = adminStatsService.getStats();

        assertThat(response.totalAssociates()).isEqualTo(10L);
        assertThat(response.pendingWithdrawals()).isEqualTo(0L);
        assertThat(response.currentCycle()).isNull();
        assertThat(response.activePlots()).isEqualTo(0L);
        assertThat(response.totalSalesRecorded()).isEqualTo(0L);
        assertThat(response.cyclesCompleted()).isEqualTo(0L);
        // networkGrowth/recentSales are top-level fields, populated regardless of whether a cycle
        // is currently OPEN -- both degrade to empty here since there are no cycles/sales at all.
        assertThat(response.networkGrowth()).isEmpty();
        assertThat(response.recentSales()).isEmpty();
    }
}
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd backend && ./mvnw -o test -Dtest=AdminStatsServiceTest`
Expected: FAIL — compile errors (`AdminStatsService` constructor doesn't take a `SaleService` yet, `AdminStatsResponse` doesn't have the new fields yet).

- [ ] **Step 4: Update `AdminStatsService`**

Replace the full contents of `backend/src/main/java/com/plotchain/stats/AdminStatsService.java` with:

```java
package com.plotchain.stats;

import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleRepository;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.income.IncomeType;
import com.plotchain.income.LedgerEntryRepository;
import com.plotchain.projects.PlotRepository;
import com.plotchain.projects.PlotStatus;
import com.plotchain.sales.SaleRepository;
import com.plotchain.sales.SaleResponse;
import com.plotchain.sales.SaleService;
import com.plotchain.sales.SaleStatus;
import com.plotchain.wallet.WalletRepository;
import com.plotchain.withdrawal.WithdrawalRequestRepository;
import com.plotchain.withdrawal.WithdrawalRequestStatus;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

@Service
public class AdminStatsService {

    // Network Growth chart x-axis, same convention DashboardService.CYCLE_LABEL_FORMAT already
    // established: short month name of each cycle's periodStart, not a bare positional index.
    private static final DateTimeFormatter CYCLE_LABEL_FORMAT = DateTimeFormatter.ofPattern("MMM", Locale.ENGLISH);

    private final AssociateRepository associateRepository;
    private final WalletRepository walletRepository;
    private final LedgerEntryRepository ledgerEntryRepository;
    private final CycleRepository cycleRepository;
    private final SaleRepository saleRepository;
    private final WithdrawalRequestRepository withdrawalRequestRepository;
    private final PlotRepository plotRepository;
    private final SaleService saleService;

    public AdminStatsService(
        AssociateRepository associateRepository,
        WalletRepository walletRepository,
        LedgerEntryRepository ledgerEntryRepository,
        CycleRepository cycleRepository,
        SaleRepository saleRepository,
        WithdrawalRequestRepository withdrawalRequestRepository,
        PlotRepository plotRepository,
        SaleService saleService
    ) {
        this.associateRepository = associateRepository;
        this.walletRepository = walletRepository;
        this.ledgerEntryRepository = ledgerEntryRepository;
        this.cycleRepository = cycleRepository;
        this.saleRepository = saleRepository;
        this.withdrawalRequestRepository = withdrawalRequestRepository;
        this.plotRepository = plotRepository;
        this.saleService = saleService;
    }

    // Unlike DashboardService.getDashboard, this does NOT throw/409 when there's no OPEN cycle:
    // an admin still wants total associates / wallet balance / pending withdrawals / network
    // growth / recent sales regardless of cycle state, so currentCycle simply comes back null and
    // the rest of the stats still populate.
    public AdminStatsResponse getStats() {
        long totalAssociates = associateRepository.countByRole(AssociateRole.ASSOCIATE);

        AdminStatsResponse.KycBreakdown kycBreakdown = new AdminStatsResponse.KycBreakdown(
            associateRepository.countByRoleAndKycStatus(AssociateRole.ASSOCIATE, KycStatus.PENDING),
            associateRepository.countByRoleAndKycStatus(AssociateRole.ASSOCIATE, KycStatus.VERIFIED),
            associateRepository.countByRoleAndKycStatus(AssociateRole.ASSOCIATE, KycStatus.REJECTED)
        );

        BigDecimal totalWalletBalance = walletRepository.sumAllBalances();
        long pendingWithdrawals = withdrawalRequestRepository.countByStatus(WithdrawalRequestStatus.REQUESTED);

        // Seal Card sparkline (incomeTrend, nested under currentCycle -- only meaningful when a
        // cycle is OPEN) and Network Growth chart (top-level, populated regardless) both plot the
        // same last 8 cycles, oldest first -- computed once here and shared, same reasoning as
        // DashboardService's own lastCycles list.
        List<Cycle> lastCycles = new ArrayList<>(
            cycleRepository.findAllByOrderByPeriodStartDesc(PageRequest.of(0, 8)).getContent());
        Collections.reverse(lastCycles);

        List<AdminStatsResponse.NetworkGrowthPoint> networkGrowth = new ArrayList<>();
        for (Cycle c : lastCycles) {
            Instant cutoffExclusive = c.getPeriodEnd().plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant();
            networkGrowth.add(new AdminStatsResponse.NetworkGrowthPoint(
                CYCLE_LABEL_FORMAT.format(c.getPeriodStart()),
                associateRepository.countByRoleAndJoinedBefore(AssociateRole.ASSOCIATE, cutoffExclusive)));
        }

        List<SaleResponse> recentSales = saleService.list(null, null, null, null, 0, 5).sales();

        AdminStatsResponse.CurrentCycleStats currentCycle = cycleRepository
            .findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)
            .map(cycle -> currentCycleStats(cycle, lastCycles))
            .orElse(null);

        long activePlots = plotRepository.countByStatusNot(PlotStatus.SOLD);
        long totalSalesRecorded = saleRepository.countByStatus(SaleStatus.RECORDED);
        long cyclesCompleted = cycleRepository.countByStatusIn(List.of(CycleStatus.CLOSED, CycleStatus.PAID));

        return new AdminStatsResponse(
            totalAssociates, kycBreakdown, totalWalletBalance, pendingWithdrawals, currentCycle,
            activePlots, totalSalesRecorded, cyclesCompleted, networkGrowth, recentSales);
    }

    private AdminStatsResponse.CurrentCycleStats currentCycleStats(Cycle cycle, List<Cycle> lastCycles) {
        BigDecimal direct = ledgerEntryRepository.sumNetAmountByCycleAndType(cycle.getId(), IncomeType.DIRECT);
        BigDecimal matching = ledgerEntryRepository.sumNetAmountByCycleAndType(cycle.getId(), IncomeType.MATCHING);
        BigDecimal total = ledgerEntryRepository.sumNetAmountByCycle(cycle.getId());

        long daysRemaining = Math.max(0, ChronoUnit.DAYS.between(LocalDate.now(), cycle.getPeriodEnd()));

        // :end is an EXCLUSIVE upper bound, same convention as AdminAssociateService.list /
        // AssociateRepository#searchDirectory: pass the day *after* periodEnd to include
        // associates who joined on periodEnd itself.
        Instant start = cycle.getPeriodStart().atStartOfDay(ZoneOffset.UTC).toInstant();
        Instant endExclusive = cycle.getPeriodEnd().plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant();
        long newAssociates = associateRepository.countByRoleAndJoinedBetween(AssociateRole.ASSOCIATE, start, endExclusive);

        long salesThisCycle = saleRepository.countByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED);
        BigDecimal revenueThisCycle = saleRepository.sumAmountByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED);

        Optional<Cycle> latestClosedCycle = cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED);
        BigDecimal previousCycleTotalIncome = latestClosedCycle
            .map(closed -> ledgerEntryRepository.sumNetAmountByCycle(closed.getId()))
            .orElse(BigDecimal.ZERO);

        List<BigDecimal> incomeTrend = lastCycles.stream()
            .map(c -> ledgerEntryRepository.sumNetAmountByCycle(c.getId()))
            .toList();

        return new AdminStatsResponse.CurrentCycleStats(
            cycle.getId(), cycle.getPeriodStart(), cycle.getPeriodEnd(), daysRemaining,
            direct, matching, total, newAssociates, salesThisCycle, revenueThisCycle,
            previousCycleTotalIncome, incomeTrend
        );
    }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && ./mvnw -o test -Dtest=AdminStatsServiceTest`
Expected: PASS, all 3 tests green.

- [ ] **Step 6: Update `AdminStatsControllerTest`**

Add `@MockBean SaleService saleService;` to the mock field list in `backend/src/test/java/com/plotchain/stats/AdminStatsControllerTest.java` (right after `@MockBean PlotRepository plotRepository;`), and add `import com.plotchain.sales.AdminSalePageResponse;` and `import com.plotchain.sales.SaleService;` to its imports.

In `returnsCompanyWideStatsJsonForAnAdminToken`, add these two stubs alongside the existing ones:

```java
        when(cycleRepository.findAllByOrderByPeriodStartDesc(any())).thenReturn(org.springframework.data.domain.Page.empty());
        when(saleService.list(null, null, null, null, 0, 5))
            .thenReturn(new AdminSalePageResponse(List.of(), 0, 5, 0));
```

(This needs `import static org.mockito.ArgumentMatchers.any;` — add it if not already present.)

And add these two assertions to the same test's `mockMvc.perform(...)` chain, right after `.andExpect(jsonPath("$.cyclesCompleted").value(11))`:

```java
            .andExpect(jsonPath("$.networkGrowth").isEmpty())
            .andExpect(jsonPath("$.recentSales").isEmpty());
```

- [ ] **Step 7: Run the controller test**

Run: `cd backend && ./mvnw -o test -Dtest=AdminStatsControllerTest`
Expected: PASS, both tests green.

- [ ] **Step 8: Run the full backend suite**

Run: `cd backend && ./mvnw -o test`
Expected: PASS aside from the pre-existing ~55 spurious JDK21/25 Mockito failures unrelated to this change (memory `plotchain_jdk_mockito_env_issue`).

- [ ] **Step 9: Commit**

```bash
git add backend/src/main/java/com/plotchain/stats/AdminStatsResponse.java \
        backend/src/main/java/com/plotchain/stats/AdminStatsService.java \
        backend/src/test/java/com/plotchain/stats/AdminStatsServiceTest.java \
        backend/src/test/java/com/plotchain/stats/AdminStatsControllerTest.java
git commit -m "feat(stats): add income delta/trend, org-wide network growth, and recent sales to admin stats"
```

---

### Task 4: Admin dashboard and sale frontend models

**Files:**
- Modify: `frontend/src/app/admin-dashboard/admin-dashboard.model.ts`
- Modify: `frontend/src/app/admin/models/sale.model.ts`

**Interfaces:**
- Produces: `CurrentCycleStats` gains `previousCycleTotalIncome: number`, `incomeTrend: number[]`. `AdminStatsResponse` gains `networkGrowth: NetworkGrowthPoint[]`, `recentSales: Sale[]`. New `NetworkGrowthPoint` interface `{ cycleLabel: string; associateCount: number }`. `Sale` gains `associateUserId: string | null`, `associateName: string | null`.

- [ ] **Step 1: Update the `Sale` model**

Edit `frontend/src/app/admin/models/sale.model.ts` to:

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
  associateUserId: string | null;
  associateName: string | null;
}
```

- [ ] **Step 2: Update `admin-dashboard.model.ts`**

Replace the full contents of `frontend/src/app/admin-dashboard/admin-dashboard.model.ts` with:

```typescript
// Field-for-field with the backend's AdminStatsResponse record (backend/src/main/java/com/plotchain/stats/AdminStatsResponse.java).
// BigDecimal fields serialize as JSON numbers, same convention as dashboard-response.model.ts.
import { Sale } from '../admin/models/sale.model';

export interface KycBreakdown {
  pending: number;
  verified: number;
  rejected: number;
}

export interface CurrentCycleStats {
  cycleId: string;
  periodStart: string;
  periodEnd: string;
  daysRemaining: number;
  directIncome: number;
  matchingIncome: number;
  totalIncome: number;
  newAssociatesThisCycle: number;
  salesThisCycle: number;
  revenueThisCycle: number;
  previousCycleTotalIncome: number;
  incomeTrend: number[];
}

// Org-wide sibling of dashboard-response.model.ts's own NetworkGrowthPoint (which is scoped to
// one associate's downline) -- same field-name-mismatch-with-the-associate-version reasoning as
// KycBreakdown above, this one keyed on associateCount rather than downlineCount.
export interface NetworkGrowthPoint {
  cycleLabel: string;
  associateCount: number;
}

export interface AdminStatsResponse {
  totalAssociates: number;
  kycBreakdown: KycBreakdown;
  totalWalletBalance: number;
  pendingWithdrawals: number;
  currentCycle: CurrentCycleStats | null;
  activePlots: number;
  totalSalesRecorded: number;
  cyclesCompleted: number;
  networkGrowth: NetworkGrowthPoint[];
  recentSales: Sale[];
}
```

- [ ] **Step 3: Type-check the frontend**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.json`
Expected: PASS, no new type errors (existing consumers of `Sale`/`AdminStatsResponse` only read fields that still exist unchanged).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/admin-dashboard/admin-dashboard.model.ts frontend/src/app/admin/models/sale.model.ts
git commit -m "feat(admin-dashboard): extend frontend models for income trend, network growth, and recent sales"
```

---

### Task 5: Seal Card delta caption and trend sparkline

**Files:**
- Modify: `frontend/src/app/shared/components/seal-card/seal-card.component.ts`
- Modify: `frontend/src/app/shared/components/seal-card/seal-card.component.spec.ts`
- Modify: `frontend/src/styles/_shared-components.scss`

**Interfaces:**
- Produces: `SealCardComponent` gains optional `@Input() deltaCaption?: string`, `@Input() deltaDown = false`, `@Input() trendPoints?: string`. `app-seal-card`'s only current consumer (`AdminDashboardComponent`) is unaffected until Task 9 wires these in — existing consumers that don't set them see no rendering change (verified by the existing 5 spec tests, unmodified below).

- [ ] **Step 1: Write the failing tests**

Add to `frontend/src/app/shared/components/seal-card/seal-card.component.spec.ts`. First, update `HostComponent` to expose the new bindings:

```typescript
@Component({
  standalone: true,
  imports: [SealCardComponent],
  template: `<app-seal-card [label]="label" [value]="value" [caption]="caption" [deltaCaption]="deltaCaption" [deltaDown]="deltaDown" [trendPoints]="trendPoints"></app-seal-card>`
})
class HostComponent {
  label = 'CURRENT CYCLE';
  value = '₹4,82,600';
  caption?: string = 'Across 6 associates this cycle.';
  deltaCaption?: string;
  deltaDown = false;
  trendPoints?: string;
}
```

Then add, at the end of the `describe` block (after the existing `'renders top and bottom hairlines'` test):

```typescript
  it('renders the delta caption when provided', () => {
    hostFixture.componentInstance.deltaCaption = '+₹1,20,000 vs last cycle';
    hostFixture.detectChanges();
    const delta: HTMLElement = hostFixture.nativeElement.querySelector('.seal-card-panel__delta');
    expect(delta.textContent?.trim()).toBe('+₹1,20,000 vs last cycle');
    expect(delta.classList).not.toContain('seal-card-panel__delta--down');
  });

  it('marks the delta caption as a decrease when deltaDown is true', () => {
    hostFixture.componentInstance.deltaCaption = '-₹40,000 vs last cycle';
    hostFixture.componentInstance.deltaDown = true;
    hostFixture.detectChanges();
    const delta: HTMLElement = hostFixture.nativeElement.querySelector('.seal-card-panel__delta');
    expect(delta.classList).toContain('seal-card-panel__delta--down');
  });

  it('omits the delta caption element when not provided', () => {
    hostFixture.detectChanges();
    expect(hostFixture.nativeElement.querySelector('.seal-card-panel__delta')).toBeFalsy();
  });

  it('renders the trend sparkline polyline when trendPoints is provided', () => {
    hostFixture.componentInstance.trendPoints = '0,20 50,10 100,0';
    hostFixture.detectChanges();
    const polyline = hostFixture.nativeElement.querySelector('.seal-card-panel__trend polyline');
    expect(polyline.getAttribute('points')).toBe('0,20 50,10 100,0');
  });

  it('omits the trend sparkline when trendPoints is not provided', () => {
    hostFixture.detectChanges();
    expect(hostFixture.nativeElement.querySelector('.seal-card-panel__trend')).toBeFalsy();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx ng test --watch=false --include='**/seal-card.component.spec.ts'`
Expected: FAIL — `deltaCaption`/`deltaDown`/`trendPoints` don't exist on `SealCardComponent` yet.

- [ ] **Step 3: Extend `SealCardComponent`**

Replace the full contents of `frontend/src/app/shared/components/seal-card/seal-card.component.ts` with:

```typescript
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

// The mockup's Dashboard card (Viraj_Acres_Settings.dc.html lines 52-58): an Ink panel with a
// double gold hairline top and bottom, a centered label flanked by literal box-drawing rules
// ("── LABEL ──" -- U+2500, not CSS-drawn borders), a large Fraunces figure, and a muted caption.
// Distinct from the animated `.seal-card` skeleton in _setup.scss (company-profile-step's Company
// Card Preview / cycle-income-card) -- that one has its own header-rule/legal/details/footer
// structure and settles in on first paint; this component is the simpler three-part card the
// mockup actually draws for the Dashboard, so it gets its own class names to avoid colliding with
// that unrelated pattern.
//
// deltaCaption/deltaDown/trendPoints (2026-08-23-admin-dashboard-mockup-design.md §3.2): optional
// delta-vs-last-cycle text and an SVG sparkline, both pre-computed and pre-formatted by the
// caller (mirroring how CycleIncomeCardComponent computes its own delta/trendPoints from raw
// data) -- this component stays presentational and string-based, same as its existing
// label/value/caption inputs.
@Component({
  selector: 'app-seal-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="seal-card-panel">
      <div class="seal-card-panel__hairline seal-card-panel__hairline--top"></div>
      <div class="seal-card-panel__label">── {{ label }} ──</div>
      <div class="seal-card-panel__figure">{{ value }}</div>
      <p class="seal-card-panel__delta" *ngIf="deltaCaption" [class.seal-card-panel__delta--down]="deltaDown">{{ deltaCaption }}</p>
      <svg class="seal-card-panel__trend" *ngIf="trendPoints" viewBox="0 0 100 28" preserveAspectRatio="none">
        <polyline [attr.points]="trendPoints"></polyline>
      </svg>
      <div class="seal-card-panel__caption" *ngIf="caption">{{ caption }}</div>
      <div class="seal-card-panel__hairline seal-card-panel__hairline--bottom"></div>
    </div>
  `
})
export class SealCardComponent {
  @Input({ required: true }) label!: string;
  @Input({ required: true }) value!: string;
  @Input() caption?: string;
  @Input() deltaCaption?: string;
  @Input() deltaDown = false;
  @Input() trendPoints?: string;
}
```

- [ ] **Step 4: Add the SCSS**

In `frontend/src/styles/_shared-components.scss`, right after the `.seal-card-panel__figure` block and before `.seal-card-panel__caption`, insert:

```scss
.seal-card-panel__delta {
  margin: 0.5rem 0 0;
  font-size: 0.8125rem; // 13px
  font-weight: 500;
  text-align: center;
  color: var(--status-success);
}

.seal-card-panel__delta--down {
  color: var(--status-danger);
}

.seal-card-panel__trend {
  width: 100%;
  height: 44px;
  margin-top: 0.75rem;
  color: var(--brand-primary-bright);

  polyline {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd frontend && npx ng test --watch=false --include='**/seal-card.component.spec.ts'`
Expected: PASS, all 10 tests green (5 existing + 5 new).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/shared/components/seal-card/seal-card.component.ts \
        frontend/src/app/shared/components/seal-card/seal-card.component.spec.ts \
        frontend/src/styles/_shared-components.scss
git commit -m "feat(seal-card): add optional delta caption and trend sparkline"
```

---

### Task 6: Admin Recent Sales table widget

**Files:**
- Create: `frontend/src/app/admin-dashboard/widgets/recent-sales-table/recent-sales-table.component.ts`
- Create: `frontend/src/app/admin-dashboard/widgets/recent-sales-table/recent-sales-table.component.spec.ts`

**Interfaces:**
- Consumes: `Sale` from `admin/models/sale.model.ts` (Task 4).
- Produces: `AdminRecentSalesTableComponent`, selector `app-admin-recent-sales-table`, `@Input({required:true}) sales: Sale[]`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/admin-dashboard/widgets/recent-sales-table/recent-sales-table.component.spec.ts`:

```typescript
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { AdminRecentSalesTableComponent } from './recent-sales-table.component';
import { Sale } from '../../../admin/models/sale.model';

@Component({
  standalone: true,
  imports: [AdminRecentSalesTableComponent],
  template: `<app-admin-recent-sales-table [sales]="sales"></app-admin-recent-sales-table>`
})
class HostComponent {
  sales: Sale[] = [];
}

describe('AdminRecentSalesTableComponent', () => {
  let hostFixture: ComponentFixture<HostComponent>;

  const sale: Sale = {
    id: 's1', plotId: 'p1', associateId: 'a1', buyerName: 'Jane Buyer', buyerPhone: '9999999999',
    buyerEmail: null, amount: 840000, cycleId: 'c1', legCredited: 'L', status: 'RECORDED',
    voidReason: null, recordedAt: '2026-08-18T00:00:00Z', plotNo: 'VG2-118', projectName: 'Viraj Greens Ph II',
    associateUserId: 'VP00001', associateName: 'Jane Associate'
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminRecentSalesTableComponent, HostComponent, TranslateModule.forRoot()]
    }).compileComponents();
    hostFixture = TestBed.createComponent(HostComponent);
  });

  it('renders plot, project, associate, value, date and status for each sale', () => {
    hostFixture.componentInstance.sales = [sale];
    hostFixture.detectChanges();

    const text = hostFixture.nativeElement.textContent;
    expect(text).toContain('VG2-118');
    expect(text).toContain('Viraj Greens Ph II');
    expect(text).toContain('Jane Associate');
    const cells: NodeListOf<HTMLElement> = hostFixture.nativeElement.querySelectorAll('td');
    expect(cells[3].textContent).toContain('840,000');
    expect(cells[4].textContent).toContain('Aug');
    const statusPill: HTMLElement = hostFixture.nativeElement.querySelector('.admin-recent-sales-table__status-pill');
    expect(statusPill.classList).not.toContain('admin-recent-sales-table__status-pill--voided');
  });

  it('marks a VOIDED sale with the voided pill class', () => {
    hostFixture.componentInstance.sales = [{ ...sale, status: 'VOIDED' }];
    hostFixture.detectChanges();

    const statusPill: HTMLElement = hostFixture.nativeElement.querySelector('.admin-recent-sales-table__status-pill');
    expect(statusPill.classList).toContain('admin-recent-sales-table__status-pill--voided');
  });

  it('shows an empty state when there are no sales', () => {
    hostFixture.detectChanges();

    expect(hostFixture.nativeElement.querySelector('.admin-recent-sales-table__empty')).toBeTruthy();
    expect(hostFixture.nativeElement.querySelector('table')).toBeFalsy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/admin-dashboard/widgets/recent-sales-table/*.spec.ts'`
Expected: FAIL — `recent-sales-table.component.ts` does not exist yet.

- [ ] **Step 3: Create the component**

Create `frontend/src/app/admin-dashboard/widgets/recent-sales-table/recent-sales-table.component.ts`:

```typescript
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { Sale } from '../../../admin/models/sale.model';

// Unlike the associate side's RecentSalesTableComponent, this widget takes its data as an
// @Input rather than firing its own HTTP request: 2026-08-23-admin-dashboard-mockup-design.md §4
// rides recentSales on the single GET /api/admin/stats response, so a load failure here is a
// whole-dashboard load failure, not an isolated one -- there's no separate loading/error state to
// manage.
@Component({
  selector: 'app-admin-recent-sales-table',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="admin-recent-sales-table">
      <div class="admin-recent-sales-table__header">
        <span class="admin-recent-sales-table__rule"></span>
        <span class="admin-recent-sales-table__label">{{ 'adminDashboard.recentSalesEyebrow' | translate }}</span>
        <span class="admin-recent-sales-table__rule"></span>
      </div>
      <p *ngIf="!sales.length" class="admin-recent-sales-table__empty">{{ 'adminDashboard.recentSalesEmpty' | translate }}</p>
      <table class="admin-recent-sales-table__table" *ngIf="sales.length">
        <thead>
          <tr>
            <th>{{ 'adminDashboard.recentSalesColumnPlot' | translate }}</th>
            <th>{{ 'adminDashboard.recentSalesColumnProject' | translate }}</th>
            <th>{{ 'adminDashboard.recentSalesColumnAssociate' | translate }}</th>
            <th>{{ 'adminDashboard.recentSalesColumnValue' | translate }}</th>
            <th>{{ 'adminDashboard.recentSalesColumnDate' | translate }}</th>
            <th>{{ 'adminDashboard.recentSalesColumnStatus' | translate }}</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let sale of sales">
            <td class="admin-recent-sales-table__plot-no">{{ sale.plotNo }}</td>
            <td>{{ sale.projectName }}</td>
            <td>{{ sale.associateName }}</td>
            <td>{{ sale.amount | currency:'INR' }}</td>
            <td>{{ sale.recordedAt | date:'d MMM' }}</td>
            <td>
              <span
                class="admin-recent-sales-table__status-pill"
                [class.admin-recent-sales-table__status-pill--voided]="sale.status === 'VOIDED'"
              >{{ (sale.status === 'VOIDED' ? 'adminDashboard.saleStatusVoided' : 'adminDashboard.saleStatusRecorded') | translate }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  `
})
export class AdminRecentSalesTableComponent {
  @Input({ required: true }) sales: Sale[] = [];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/admin-dashboard/widgets/recent-sales-table/*.spec.ts'`
Expected: PASS, all 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/admin-dashboard/widgets/recent-sales-table/
git commit -m "feat(admin-dashboard): add the Recent Sales table widget"
```

---

### Task 7: Admin Network Growth chart widget

**Files:**
- Create: `frontend/src/app/admin-dashboard/widgets/network-growth-chart/network-growth-chart.component.ts`
- Create: `frontend/src/app/admin-dashboard/widgets/network-growth-chart/network-growth-chart.component.spec.ts`

**Interfaces:**
- Consumes: `NetworkGrowthPoint` from `admin-dashboard.model.ts` (Task 4).
- Produces: `AdminNetworkGrowthChartComponent`, selector `app-admin-network-growth-chart`, `@Input({required:true}) data: NetworkGrowthPoint[]`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/admin-dashboard/widgets/network-growth-chart/network-growth-chart.component.spec.ts`:

```typescript
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { AdminNetworkGrowthChartComponent } from './network-growth-chart.component';
import { NetworkGrowthPoint } from '../../admin-dashboard.model';

@Component({
  standalone: true,
  imports: [AdminNetworkGrowthChartComponent],
  template: `<app-admin-network-growth-chart [data]="data"></app-admin-network-growth-chart>`
})
class HostComponent {
  data: NetworkGrowthPoint[] = [];
}

describe('AdminNetworkGrowthChartComponent', () => {
  let hostFixture: ComponentFixture<HostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminNetworkGrowthChartComponent, HostComponent, TranslateModule.forRoot()]
    }).compileComponents();
    hostFixture = TestBed.createComponent(HostComponent);
  });

  it('renders one bar and one axis label per data point', () => {
    hostFixture.componentInstance.data = [
      { cycleLabel: 'Jun', associateCount: 10 },
      { cycleLabel: 'Jul', associateCount: 18 },
      { cycleLabel: 'Aug', associateCount: 25 }
    ];
    hostFixture.detectChanges();

    expect(hostFixture.nativeElement.querySelectorAll('rect').length).toBe(3);
    const axisLabels = hostFixture.nativeElement.querySelectorAll('.admin-network-growth-chart__axis span');
    expect(axisLabels.length).toBe(3);
    expect(axisLabels[2].textContent).toBe('Aug');
  });

  it('scales the tallest bar to the full chart height', () => {
    hostFixture.componentInstance.data = [
      { cycleLabel: 'Jul', associateCount: 10 },
      { cycleLabel: 'Aug', associateCount: 20 }
    ];
    hostFixture.detectChanges();

    const rects: NodeListOf<SVGRectElement> = hostFixture.nativeElement.querySelectorAll('rect');
    expect(rects[1].getAttribute('height')).toBe('40');
    expect(rects[0].getAttribute('height')).toBe('20');
  });

  it('renders nothing when there is no data', () => {
    hostFixture.detectChanges();

    expect(hostFixture.nativeElement.querySelector('svg')).toBeFalsy();
    expect(hostFixture.nativeElement.querySelector('.admin-network-growth-chart__axis')).toBeFalsy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/admin-dashboard/widgets/network-growth-chart/*.spec.ts'`
Expected: FAIL — `network-growth-chart.component.ts` does not exist yet.

- [ ] **Step 3: Create the component**

Create `frontend/src/app/admin-dashboard/widgets/network-growth-chart/network-growth-chart.component.ts`:

```typescript
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { NetworkGrowthPoint } from '../../admin-dashboard.model';

// Org-wide sibling of the associate dashboard's own NetworkGrowthChartComponent (same
// inline-SVG bar-chart technique) -- keyed on associateCount instead of downlineCount, so it
// takes admin-dashboard.model.ts's own NetworkGrowthPoint rather than the associate side's.
@Component({
  selector: 'app-admin-network-growth-chart',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="admin-network-growth-chart">
      <div class="admin-network-growth-chart__header">
        <span class="admin-network-growth-chart__rule"></span>
        <span class="admin-network-growth-chart__label">{{ 'adminDashboard.networkGrowthEyebrow' | translate }}</span>
        <span class="admin-network-growth-chart__rule"></span>
      </div>
      <svg class="admin-network-growth-chart__bars" *ngIf="data.length" viewBox="0 0 100 40" preserveAspectRatio="none">
        <rect
          *ngFor="let point of data; let i = index"
          [attr.x]="barX(i)"
          [attr.y]="barY(point.associateCount)"
          [attr.width]="barWidth"
          [attr.height]="barHeight(point.associateCount)"
        ></rect>
      </svg>
      <div class="admin-network-growth-chart__axis" *ngIf="data.length">
        <span *ngFor="let point of data">{{ point.cycleLabel }}</span>
      </div>
    </div>
  `
})
export class AdminNetworkGrowthChartComponent {
  @Input({ required: true }) data: NetworkGrowthPoint[] = [];

  private get maxCount(): number {
    return Math.max(...this.data.map(p => p.associateCount), 1);
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

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/admin-dashboard/widgets/network-growth-chart/*.spec.ts'`
Expected: PASS, all 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/admin-dashboard/widgets/network-growth-chart/
git commit -m "feat(admin-dashboard): add the Network Growth chart widget"
```

---

### Task 8: Admin dashboard i18n keys

**Files:**
- Modify: `frontend/src/assets/i18n/en.json`
- Modify: `frontend/src/assets/i18n/hi.json`

**Interfaces:**
- Produces: new keys under `adminDashboard` consumed by Tasks 6, 7, and 9. Removes keys made dead by Task 9's template rebuild.

- [ ] **Step 1: Edit `en.json`'s `adminDashboard` block**

Within the `adminDashboard` object, remove these now-dead keys: `currentCycleTitle`, `currentCycleCaption`, `periodLabel`, `daysRemainingLabel`, `directIncomeLabel`, `matchingIncomeLabel`, `newAssociatesLabel`, `kycBreakdownTitle`, `kycPendingLabel`, `kycVerifiedLabel`, `kycRejectedLabel`, `quickActionsTitle`.

Add these new keys (placement within the object doesn't matter — keep it readable, e.g. grouped near related existing keys):

```json
    "cycleCloses": "Cycle closes in {{days}} days",
    "cycleClosesSingular": "Cycle closes in 1 day",
    "deltaUp": "+{{amount}} vs last cycle",
    "deltaDown": "-{{amount}} vs last cycle",
    "cyclesCompletedHint": "{{count}} cycles completed",
    "totalSalesRecordedHint": "{{count}} ever recorded",
    "activePlotsHint": "{{count}} plots still available",
    "recentSalesEyebrow": "Recent Sales",
    "recentSalesEmpty": "No sales recorded yet.",
    "recentSalesColumnPlot": "Plot",
    "recentSalesColumnProject": "Project",
    "recentSalesColumnAssociate": "Associate",
    "recentSalesColumnValue": "Value",
    "recentSalesColumnDate": "Date",
    "recentSalesColumnStatus": "Status",
    "saleStatusRecorded": "Recorded",
    "saleStatusVoided": "Voided",
    "networkGrowthEyebrow": "Network Growth"
```

The resulting `adminDashboard` object should read:

```json
  "adminDashboard": {
    "heading": "Dashboard",
    "subtitle": "Welcome back. Here's how your network is performing this cycle.",
    "totalAssociatesLabel": "Total Associates",
    "walletBalanceLabel": "Total Wallet Balance",
    "salesThisCycleLabel": "Sales This Cycle",
    "revenueThisCycleLabel": "Revenue This Cycle",
    "currentCycleLabel": "CURRENT CYCLE",
    "cycleCloses": "Cycle closes in {{days}} days",
    "cycleClosesSingular": "Cycle closes in 1 day",
    "deltaUp": "+{{amount}} vs last cycle",
    "deltaDown": "-{{amount}} vs last cycle",
    "cyclesCompletedHint": "{{count}} cycles completed",
    "totalSalesRecordedHint": "{{count}} ever recorded",
    "activePlotsHint": "{{count}} plots still available",
    "noCycleEmptyState": "No open cycle right now.",
    "recentSalesEyebrow": "Recent Sales",
    "recentSalesEmpty": "No sales recorded yet.",
    "recentSalesColumnPlot": "Plot",
    "recentSalesColumnProject": "Project",
    "recentSalesColumnAssociate": "Associate",
    "recentSalesColumnValue": "Value",
    "recentSalesColumnDate": "Date",
    "recentSalesColumnStatus": "Status",
    "saleStatusRecorded": "Recorded",
    "saleStatusVoided": "Voided",
    "networkGrowthEyebrow": "Network Growth",
    "pendingWithdrawalsLabel": "Pending Withdrawals",
    "recordSaleAction": "+ Record Sale",
    "provisionAssociateAction": "+ Provision Associate",
    "loadError": "Couldn't load the dashboard. Try again later."
  }
```

- [ ] **Step 2: Apply the matching edit to `hi.json`**

Remove the same 12 dead keys from `hi.json`'s `adminDashboard` block, and add the Hindi equivalents (matching this block's existing word choice — "चक्र" for cycle, as already used by `currentCycleTitle`/`currentCycleCaption` elsewhere in this block, not "साइकिल" as the separate `dashboard` block uses):

```json
    "cycleCloses": "चक्र {{days}} दिनों में बंद होगा",
    "cycleClosesSingular": "चक्र 1 दिन में बंद होगा",
    "deltaUp": "पिछले चक्र से +{{amount}}",
    "deltaDown": "पिछले चक्र से -{{amount}}",
    "cyclesCompletedHint": "{{count}} चक्र पूर्ण",
    "totalSalesRecordedHint": "अब तक {{count}} दर्ज",
    "activePlotsHint": "{{count}} प्लॉट अभी भी उपलब्ध",
    "recentSalesEyebrow": "हाल की बिक्री",
    "recentSalesEmpty": "अभी तक कोई बिक्री दर्ज नहीं हुई।",
    "recentSalesColumnPlot": "प्लॉट",
    "recentSalesColumnProject": "प्रोजेक्ट",
    "recentSalesColumnAssociate": "एसोसिएट",
    "recentSalesColumnValue": "मूल्य",
    "recentSalesColumnDate": "तिथि",
    "recentSalesColumnStatus": "स्थिति",
    "saleStatusRecorded": "दर्ज",
    "saleStatusVoided": "रद्द",
    "networkGrowthEyebrow": "नेटवर्क वृद्धि"
```

The resulting `hi.json` `adminDashboard` object should read:

```json
  "adminDashboard": {
    "heading": "डैशबोर्ड",
    "subtitle": "वापसी पर स्वागत है। इस चक्र में आपके नेटवर्क का प्रदर्शन यहाँ देखें।",
    "totalAssociatesLabel": "कुल एसोसिएट्स",
    "walletBalanceLabel": "कुल वॉलेट बैलेंस",
    "salesThisCycleLabel": "इस चक्र में बिक्री",
    "revenueThisCycleLabel": "इस चक्र का राजस्व",
    "currentCycleLabel": "वर्तमान चक्र",
    "cycleCloses": "चक्र {{days}} दिनों में बंद होगा",
    "cycleClosesSingular": "चक्र 1 दिन में बंद होगा",
    "deltaUp": "पिछले चक्र से +{{amount}}",
    "deltaDown": "पिछले चक्र से -{{amount}}",
    "cyclesCompletedHint": "{{count}} चक्र पूर्ण",
    "totalSalesRecordedHint": "अब तक {{count}} दर्ज",
    "activePlotsHint": "{{count}} प्लॉट अभी भी उपलब्ध",
    "noCycleEmptyState": "अभी कोई खुला चक्र नहीं है।",
    "recentSalesEyebrow": "हाल की बिक्री",
    "recentSalesEmpty": "अभी तक कोई बिक्री दर्ज नहीं हुई।",
    "recentSalesColumnPlot": "प्लॉट",
    "recentSalesColumnProject": "प्रोजेक्ट",
    "recentSalesColumnAssociate": "एसोसिएट",
    "recentSalesColumnValue": "मूल्य",
    "recentSalesColumnDate": "तिथि",
    "recentSalesColumnStatus": "स्थिति",
    "saleStatusRecorded": "दर्ज",
    "saleStatusVoided": "रद्द",
    "networkGrowthEyebrow": "नेटवर्क वृद्धि",
    "pendingWithdrawalsLabel": "लंबित निकासी",
    "recordSaleAction": "+ बिक्री दर्ज करें",
    "provisionAssociateAction": "+ एसोसिएट जोड़ें",
    "loadError": "डैशबोर्ड लोड नहीं हो सका। बाद में पुनः प्रयास करें।"
  }
```

- [ ] **Step 3: Validate both files are well-formed JSON**

Run: `cd frontend/src/assets/i18n && python3 -c "import json; json.load(open('en.json')); json.load(open('hi.json')); print('ok')"`
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/assets/i18n/en.json frontend/src/assets/i18n/hi.json
git commit -m "feat(admin-dashboard): add i18n keys for the mockup rebuild, remove keys the rebuild drops"
```

---

### Task 9: Admin Dashboard component rebuild

**Files:**
- Modify: `frontend/src/app/admin-dashboard/admin-dashboard.component.ts`
- Modify: `frontend/src/app/admin-dashboard/admin-dashboard.component.spec.ts`

**Interfaces:**
- Consumes: `AdminStatsResponse`/`CurrentCycleStats`/`NetworkGrowthPoint` (Task 4), `SealCardComponent`'s new inputs (Task 5), `AdminRecentSalesTableComponent` (Task 6), `AdminNetworkGrowthChartComponent` (Task 7), `KycNetworkSummaryComponent` (reused directly from `frontend/src/app/dashboard/widgets/kyc-network-summary/kyc-network-summary.component.ts`, unmodified), all Task 8 i18n keys.

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `frontend/src/app/admin-dashboard/admin-dashboard.component.spec.ts` with:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { RouterTestingModule } from '@angular/router/testing';
import { AdminDashboardComponent } from './admin-dashboard.component';
import { AdminStatsResponse } from './admin-dashboard.model';

describe('AdminDashboardComponent', () => {
  let fixture: ComponentFixture<AdminDashboardComponent>;
  let httpMock: HttpTestingController;

  const statsWithCycle: AdminStatsResponse = {
    totalAssociates: 6,
    kycBreakdown: { pending: 3, verified: 35, rejected: 4 },
    totalWalletBalance: 12345.67,
    pendingWithdrawals: 2,
    currentCycle: {
      cycleId: 'c1',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      daysRemaining: 28,
      directIncome: 1000,
      matchingIncome: 500,
      totalIncome: 482600,
      newAssociatesThisCycle: 5,
      salesThisCycle: 12,
      revenueThisCycle: 2400000,
      previousCycleTotalIncome: 400000,
      incomeTrend: [380000, 400000, 482600]
    },
    activePlots: 21,
    totalSalesRecorded: 63,
    cyclesCompleted: 11,
    networkGrowth: [
      { cycleLabel: 'Jun', associateCount: 4 },
      { cycleLabel: 'Jul', associateCount: 5 },
      { cycleLabel: 'Aug', associateCount: 6 }
    ],
    recentSales: [{
      id: 's1', plotId: 'p1', associateId: 'a1', buyerName: 'Jane Buyer', buyerPhone: '9999999999',
      buyerEmail: null, amount: 840000, cycleId: 'c1', legCredited: 'L', status: 'RECORDED',
      voidReason: null, recordedAt: '2026-08-18T00:00:00Z', plotNo: 'VG2-118', projectName: 'Viraj Greens Ph II',
      associateUserId: 'VP00001', associateName: 'Jane Associate'
    }]
  };

  const statsWithoutCycle: AdminStatsResponse = {
    totalAssociates: 42,
    kycBreakdown: { pending: 3, verified: 35, rejected: 4 },
    totalWalletBalance: 12345.67,
    pendingWithdrawals: 0,
    currentCycle: null,
    activePlots: 0,
    totalSalesRecorded: 0,
    cyclesCompleted: 0,
    networkGrowth: [],
    recentSales: []
  };

  function flushInitialLoad(response: AdminStatsResponse = statsWithCycle): void {
    httpMock.expectOne('/api/admin/stats').flush(response);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminDashboardComponent, HttpClientTestingModule, TranslateModule.forRoot(), RouterTestingModule]
    }).compileComponents();

    fixture = TestBed.createComponent(AdminDashboardComponent);
    httpMock = TestBed.inject(HttpTestingController);

    const translate = TestBed.inject(TranslateService);
    translate.setDefaultLang('en');
    translate.use('en');
    translate.setTranslation('en', {
      adminDashboard: {
        cycleCloses: '{{days}} days left', cycleClosesSingular: '1 day left',
        deltaUp: '+{{amount}} vs last cycle', deltaDown: '-{{amount}} vs last cycle'
      }
    });

    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('renders the heading and subtitle', () => {
    flushInitialLoad();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('adminDashboard.heading');
    expect(text).toContain('adminDashboard.subtitle');
  });

  it('renders one Seal Card with this cycle\'s total income as the figure', () => {
    flushInitialLoad();

    const figure: HTMLElement = fixture.nativeElement.querySelector('.seal-card-panel__figure');
    expect(figure.textContent).toContain('482,600');
  });

  it('renders the Seal Card delta caption and trend sparkline from the cycle income trend', () => {
    flushInitialLoad();

    const delta: HTMLElement = fixture.nativeElement.querySelector('.seal-card-panel__delta');
    // 482600 - 400000 = 82600, positive -> deltaUp, not marked down.
    expect(delta.textContent).toContain('82,600');
    expect(delta.classList).not.toContain('seal-card-panel__delta--down');
    expect(fixture.nativeElement.querySelector('.seal-card-panel__trend polyline')).toBeTruthy();
  });

  it('renders the caption with the days remaining in the cycle', () => {
    flushInitialLoad();

    const caption: HTMLElement = fixture.nativeElement.querySelector('.seal-card-panel__caption');
    expect(caption.textContent?.trim()).toBe('28 days left');
  });

  it('renders an empty state instead of the Seal Card when currentCycle is null', () => {
    flushInitialLoad(statsWithoutCycle);

    expect(fixture.nativeElement.querySelector('.seal-card-panel')).toBeFalsy();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('adminDashboard.noCycleEmptyState');
  });

  it('sets loadError and renders the error message when the request fails', () => {
    httpMock.expectOne('/api/admin/stats').flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.loadError).toBe(true);
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('adminDashboard.loadError');
  });

  it('renders 4 KPI tiles with the previously-dead fields folded in as hints', () => {
    flushInitialLoad();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('6');
    expect(text).toContain('12,345.67');
    expect(text).toContain('12');
    expect(text).toContain('2,400,000');
    const hints: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('.stat-tile__hint');
    // Total Associates, Sales This Cycle, Revenue This Cycle each get a hint; Wallet Balance does not.
    expect(hints).toHaveSize(3);
  });

  it('renders the two-column panel row: recent sales, network growth, KYC summary', () => {
    flushInitialLoad();

    expect(fixture.nativeElement.querySelector('app-admin-recent-sales-table')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-admin-network-growth-chart')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-kyc-network-summary')).toBeTruthy();
  });

  it('links the pending withdrawals tile to the payout approval queue', () => {
    flushInitialLoad();

    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('a[href="/settings/payout-approval"]');
    expect(link).toBeTruthy();
  });

  it('renders quick action links to Record Sale and Provision Associate', () => {
    flushInitialLoad();

    expect(fixture.nativeElement.querySelector('a[href="/admin/sales/new"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('a[href="/admin/associates/new"]')).toBeTruthy();
  });
});
```

This intentionally drops the old file's `'links the KYC pending tile to the KYC review queue'` test — the rebuild reuses `KycNetworkSummaryComponent` directly (a read-only 3-pill summary with no link), per this plan's Global Constraints.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx ng test --watch=false --include='**/admin-dashboard/admin-dashboard.component.spec.ts'`
Expected: FAIL — the current template has no `.seal-card-panel__delta`, no `app-admin-recent-sales-table`, etc.

- [ ] **Step 3: Rebuild the component**

Replace the full contents of `frontend/src/app/admin-dashboard/admin-dashboard.component.ts` with:

```typescript
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminStatsResponse, CurrentCycleStats } from './admin-dashboard.model';
import { StatTileComponent } from '../shared/components/stat-tile/stat-tile.component';
import { SealCardComponent } from '../shared/components/seal-card/seal-card.component';
import { AdminRecentSalesTableComponent } from './widgets/recent-sales-table/recent-sales-table.component';
import { AdminNetworkGrowthChartComponent } from './widgets/network-growth-chart/network-growth-chart.component';
import { KycNetworkSummaryComponent } from '../dashboard/widgets/kyc-network-summary/kyc-network-summary.component';

// Post-login landing page for admin-family roles. Rebuilt per docs/superpowers/specs/2026-08-23-
// admin-dashboard-mockup-design.md to the same two-column mockup layout the associate dashboard
// already got -- this supersedes 2026-08-22-settings-design-parity.md's D6, which had deliberately
// kept the old section-by-section structure (D6's actual substance -- exactly one Seal Card for
// current-cycle income -- still holds; only the surrounding layout changed).
@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [
    CommonModule, RouterLink, TranslateModule, StatTileComponent, SealCardComponent,
    AdminRecentSalesTableComponent, AdminNetworkGrowthChartComponent, KycNetworkSummaryComponent
  ],
  providers: [CurrencyPipe],
  template: `
    <div class="admin-dashboard">
      <h1 class="admin-dashboard__title">{{ 'adminDashboard.heading' | translate }}</h1>
      <p class="admin-dashboard__subtitle">{{ 'adminDashboard.subtitle' | translate }}</p>

      <p *ngIf="loadError" class="admin-dashboard__load-error">{{ 'adminDashboard.loadError' | translate }}</p>

      <ng-container *ngIf="stats as s">
        <ng-container *ngIf="s.currentCycle as cycle; else noCycle">
          <app-seal-card
            [label]="'adminDashboard.currentCycleLabel' | translate"
            [value]="formatCurrency(cycle.totalIncome)"
            [caption]="cycleClosesKey(cycle.daysRemaining) | translate: { days: cycle.daysRemaining }"
            [deltaCaption]="cycleDeltaKey(cycle) | translate: { amount: formatCurrency(cycleDeltaAbs(cycle)) }"
            [deltaDown]="cycleDelta(cycle) < 0"
            [trendPoints]="cycleTrendPoints(cycle)"
          ></app-seal-card>
        </ng-container>
        <ng-template #noCycle>
          <p class="admin-dashboard__empty">{{ 'adminDashboard.noCycleEmptyState' | translate }}</p>
        </ng-template>

        <div class="admin-dashboard__tiles">
          <app-stat-tile
            icon="group"
            [label]="'adminDashboard.totalAssociatesLabel' | translate"
            [value]="s.totalAssociates.toString()"
            [hint]="'adminDashboard.cyclesCompletedHint' | translate: { count: s.cyclesCompleted }"
          ></app-stat-tile>
          <app-stat-tile
            icon="payments"
            [label]="'adminDashboard.walletBalanceLabel' | translate"
            [value]="formatCurrency(s.totalWalletBalance)"
          ></app-stat-tile>
          <app-stat-tile
            icon="point_of_sale"
            [label]="'adminDashboard.salesThisCycleLabel' | translate"
            [value]="(s.currentCycle?.salesThisCycle ?? 0).toString()"
            [hint]="'adminDashboard.totalSalesRecordedHint' | translate: { count: s.totalSalesRecorded }"
          ></app-stat-tile>
          <app-stat-tile
            icon="trending_up"
            [label]="'adminDashboard.revenueThisCycleLabel' | translate"
            [value]="formatCurrency(s.currentCycle?.revenueThisCycle ?? 0)"
            [hint]="'adminDashboard.activePlotsHint' | translate: { count: s.activePlots }"
          ></app-stat-tile>
        </div>

        <div class="admin-dashboard__panels">
          <app-admin-recent-sales-table [sales]="s.recentSales"></app-admin-recent-sales-table>
          <div class="admin-dashboard__panels-right">
            <app-admin-network-growth-chart [data]="s.networkGrowth"></app-admin-network-growth-chart>
            <app-kyc-network-summary [data]="s.kycBreakdown"></app-kyc-network-summary>
            <div class="admin-dashboard__quick-actions">
              <a [routerLink]="['/settings', 'payout-approval']" class="admin-dashboard__tile-link">
                <app-stat-tile
                  icon="account_balance_wallet"
                  [label]="'adminDashboard.pendingWithdrawalsLabel' | translate"
                  [value]="s.pendingWithdrawals.toString()"
                  tone="accent"
                ></app-stat-tile>
              </a>
              <a [routerLink]="['/admin', 'sales', 'new']" class="admin-dashboard__quick-action admin-dashboard__quick-action--primary">
                {{ 'adminDashboard.recordSaleAction' | translate }}
              </a>
              <a [routerLink]="['/admin', 'associates', 'new']" class="admin-dashboard__quick-action admin-dashboard__quick-action--secondary">
                {{ 'adminDashboard.provisionAssociateAction' | translate }}
              </a>
            </div>
          </div>
        </div>
      </ng-container>
    </div>
  `
})
export class AdminDashboardComponent implements OnInit {
  private adminDashboardService = inject(AdminDashboardService);
  private currencyPipe = inject(CurrencyPipe);

  stats: AdminStatsResponse | null = null;
  loadError = false;

  ngOnInit(): void {
    this.loadStats();
  }

  formatCurrency(value: number): string {
    return this.currencyPipe.transform(value, 'INR', 'symbol', '1.0-2') ?? String(value);
  }

  cycleClosesKey(days: number): string {
    return days === 1 ? 'adminDashboard.cycleClosesSingular' : 'adminDashboard.cycleCloses';
  }

  cycleDelta(cycle: CurrentCycleStats): number {
    return cycle.totalIncome - cycle.previousCycleTotalIncome;
  }

  cycleDeltaAbs(cycle: CurrentCycleStats): number {
    return Math.abs(this.cycleDelta(cycle));
  }

  cycleDeltaKey(cycle: CurrentCycleStats): string {
    return this.cycleDelta(cycle) >= 0 ? 'adminDashboard.deltaUp' : 'adminDashboard.deltaDown';
  }

  cycleTrendPoints(cycle: CurrentCycleStats): string | null {
    const trend = cycle.incomeTrend;
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

  private loadStats(): void {
    this.loadError = false;
    this.adminDashboardService.getStats().subscribe({
      next: res => (this.stats = res),
      error: () => (this.loadError = true)
    });
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx ng test --watch=false --include='**/admin-dashboard/admin-dashboard.component.spec.ts'`
Expected: PASS, all 10 tests green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/admin-dashboard/admin-dashboard.component.ts \
        frontend/src/app/admin-dashboard/admin-dashboard.component.spec.ts
git commit -m "feat(admin-dashboard): rebuild the dashboard around the mockup layout"
```

---

### Task 10: Admin dashboard layout styles

**Files:**
- Modify: `frontend/src/styles/_admin.scss`

**Interfaces:**
- Consumes: nothing new — replaces the existing `.admin-dashboard*` block (currently `_admin.scss:3535`–`3600`) in place.

- [ ] **Step 1: Replace the existing `.admin-dashboard*` block**

In `frontend/src/styles/_admin.scss`, find the block starting at the comment `// Admin Dashboard -- the mockup's \`isDashboard\` block...` (currently around line 3530) through the closing `}` of the `@media (max-width: 700px)` rule at the end of that block (currently around line 3600). Replace that entire span with:

```scss
// Admin Dashboard -- rebuilt to the same mockup layout the associate dashboard uses (dashboard-
// mockup spec's Viraj Acres Dashboard.dc.html option 1a), adapted for admin-scoped data per
// docs/superpowers/specs/2026-08-23-admin-dashboard-mockup-design.md. This supersedes design-
// parity spec D6's "keep the console as-is" instruction -- D6's actual substance (exactly one
// Seal Card for current-cycle income, styled via _shared-components.scss's .seal-card-panel*)
// still holds, only the surrounding layout changed.
.admin-dashboard {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  max-width: 1240px;
  margin: 0 auto;
  padding: 40px 44px 80px;
}

.admin-dashboard__title {
  margin: 0 0 0.375rem; // 6px
  font-family: var(--font-display);
  font-size: 1.75rem; // 28px
  font-weight: 600;
  color: var(--text-primary);
}

.admin-dashboard__subtitle {
  margin: 0 0 0.5rem;
  font-size: 0.875rem; // 14px
  color: var(--text-muted);
}

.admin-dashboard__tiles {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
}

.admin-dashboard__tile-link {
  display: block;
  text-decoration: none;
  color: inherit;
}

.admin-dashboard__empty,
.admin-dashboard__load-error {
  margin: 0;
  font-size: 0.875rem;
  color: var(--text-muted);
}

.admin-dashboard__panels {
  display: grid;
  grid-template-columns: 1.15fr 1fr;
  gap: 1rem;
  align-items: start;
}

.admin-dashboard__panels-right {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.admin-dashboard__quick-actions {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.admin-dashboard__quick-action {
  display: block;
  border-radius: var(--radius-sm);
  padding: 0.8125rem 0;
  text-align: center;
  font-size: 0.8125rem;
  font-weight: 600;
  text-decoration: none;
}

.admin-dashboard__quick-action--primary {
  background: var(--brand-secondary);
  color: var(--brand-secondary-contrast);
}

.admin-dashboard__quick-action--secondary {
  border: 1px solid var(--brand-secondary);
  color: var(--brand-secondary);
}

// Admin Recent Sales table (admin-dashboard/widgets/recent-sales-table) -- same visual pattern as
// _dashboard.scss's .recent-sales-table, kept as an independent copy under admin-prefixed classes
// rather than a cross-partial @extend: styles.scss loads each partial via @use, which gives every
// partial its own module scope, and this design deliberately keeps _admin.scss self-contained
// rather than reaching into _dashboard.scss (see the design doc's note on why).
.admin-recent-sales-table {
  background: var(--surface-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 1rem 1.125rem;
}

.admin-recent-sales-table__header {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  margin-bottom: 0.75rem;
}

.admin-recent-sales-table__rule {
  flex: 1;
  height: 1px;
  background: rgba(92, 26, 42, 0.22);
}

.admin-recent-sales-table__label {
  font-size: 0.625rem;
  font-weight: 500;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--brand-secondary);
  white-space: nowrap;
}

.admin-recent-sales-table__table {
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

.admin-recent-sales-table__plot-no {
  font-family: var(--font-mono);
}

.admin-recent-sales-table__status-pill {
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.5625rem;
  border-radius: 999px;
  background: rgba(75, 122, 82, 0.12);
  font-size: 0.6563rem;
  font-weight: 500;
  color: var(--status-success);
}

.admin-recent-sales-table__status-pill--voided {
  background: rgba(178, 59, 50, 0.12);
  color: var(--status-danger);
}

.admin-recent-sales-table__empty {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--text-muted);
}

// Admin Network Growth chart (admin-dashboard/widgets/network-growth-chart) -- same visual
// pattern as _dashboard.scss's .network-growth-chart, independent copy for the same reason as
// .admin-recent-sales-table above.
.admin-network-growth-chart {
  background: var(--surface-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 1rem 1.125rem;
}

.admin-network-growth-chart__header {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  margin-bottom: 0.75rem;
}

.admin-network-growth-chart__rule {
  flex: 1;
  height: 1px;
  background: rgba(92, 26, 42, 0.22);
}

.admin-network-growth-chart__label {
  font-size: 0.625rem;
  font-weight: 500;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--brand-secondary);
  white-space: nowrap;
}

.admin-network-growth-chart__bars {
  width: 100%;
  height: 60px;
  display: block;

  rect {
    fill: var(--brand-secondary);
    opacity: 0.35;
  }
}

.admin-network-growth-chart__axis {
  display: flex;
  justify-content: space-between;
  margin-top: 0.375rem;
  font-family: var(--font-mono);
  font-size: 0.5938rem;
  color: var(--text-muted);
}

@media (max-width: 960px) {
  .admin-dashboard__tiles {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .admin-dashboard__panels {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 700px) {
  .admin-dashboard__tiles {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 2: Build the frontend to verify the SCSS compiles**

Run: `cd frontend && npx ng build --configuration production 2>&1 | tail -40`
Expected: PASS, no SCSS compile errors (undefined variable/mixin, syntax errors).

- [ ] **Step 3: Run the full frontend test suite**

Run: `cd frontend && npx ng test --watch=false`
Expected: PASS — all tests green, including every test touched or added in Tasks 4-9.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/styles/_admin.scss
git commit -m "style(admin-dashboard): rebuild the admin dashboard layout to match the mockup"
```

---

## After all tasks: manual verification

Per the `run` skill: start the DB (`docker compose up -d db`), backend (`cd backend && ./mvnw spring-boot:run`), and frontend (`cd frontend && npm start`), then log in as an admin and visually confirm the rebuilt `/admin/dashboard` — Seal Card delta/sparkline, 4 KPI tiles with hints, two-column panel row (Recent Sales with an Associate column, Network Growth bars, KYC pill summary, Quick Actions block with a working Pending Withdrawals link and two working action buttons) — against `docs/superpowers/specs/2026-08-23-admin-dashboard-mockup-design.md`.
