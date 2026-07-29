# Remove tenant_id Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the `tenant_id` column and all tenant-scoping code from the schema, entities, repositories, and service layer, since the product is single-tenant (admin + associates), not multi-tenant SaaS.

**Architecture:** Table-by-table sweep. Each task removes `tenant_id` from one table's migration DDL, its JPA entity, its repository query methods, the one `DashboardService` call site that passes `associate.getTenantId()` into that table's repository, and the tests that exercise it. `Associate`/`AssociateRepository` are done last because every other task still reads `associate.getTenantId()` until its own turn — removing it earlier would break compilation everywhere else.

**Tech Stack:** Spring Boot 3.3.4, Spring Data JPA, Flyway (single migration `V1__create_dashboard_tables.sql`, edited in place — no new migration, no deployed data to preserve), JUnit 5 + Mockito + AssertJ, H2 (Postgres-compatible mode) for tests.

## Global Constraints

- Single migration file only — edit `V1__create_dashboard_tables.sql` directly, do not add a `V2`.
- No new tests for new behavior — this is a pure removal; existing tests are updated to match the new (tenant-free) signatures.
- Run tests from the `backend` directory: `mvn -f backend/pom.xml test -Dtest=<ClassName>` for a single class, or `mvn -f backend/pom.xml test` for the full suite.
- Every task must leave the project compiling and all tests passing — no task may be merged mid-way through a signature change.

---

### Task 1: RankTier

**Files:**
- Modify: `backend/src/main/resources/db/migration/V1__create_dashboard_tables.sql:1-8` (`rank_tier` table)
- Modify: `backend/src/main/java/com/plotchain/rank/RankTier.java`
- Modify: `backend/src/main/java/com/plotchain/rank/RankTierRepository.java`
- Modify: `backend/src/main/java/com/plotchain/dashboard/DashboardService.java:84`
- Modify: `backend/src/test/java/com/plotchain/dashboard/DashboardServiceTest.java:78-79,95-96`
- Modify: `backend/src/test/java/com/plotchain/associate/AssociateRepositoryTest.java:33,51-52,72`

**Interfaces:**
- Produces: `RankTier(UUID id, String name, int rankOrder, BigDecimal volumeThreshold)` (drops the `tenantId` positional argument), `RankTierRepository.findAllByOrderByRankOrder(): List<RankTier>` (replaces `findByTenantIdOrderByRankOrder(UUID)`).

- [ ] **Step 1: Update the tests to the new (tenant-free) `RankTier` shape**

In `backend/src/test/java/com/plotchain/dashboard/DashboardServiceTest.java`, change:

```java
RankTier currentRank = new RankTier(currentRankId, tenantId, "Sales Associate", 1, BigDecimal.valueOf(5000));
RankTier nextRank = new RankTier(nextRankId, tenantId, "Sales Executive", 2, BigDecimal.valueOf(10000));
```

to:

```java
RankTier currentRank = new RankTier(currentRankId, "Sales Associate", 1, BigDecimal.valueOf(5000));
RankTier nextRank = new RankTier(nextRankId, "Sales Executive", 2, BigDecimal.valueOf(10000));
```

and change:

```java
when(rankTierRepository.findByTenantIdOrderByRankOrder(tenantId))
    .thenReturn(List.of(currentRank, nextRank));
```

to:

```java
when(rankTierRepository.findAllByOrderByRankOrder())
    .thenReturn(List.of(currentRank, nextRank));
```

In `backend/src/test/java/com/plotchain/associate/AssociateRepositoryTest.java`, change each `RankTier` construction to drop the tenant argument:

```java
RankTier rank = new RankTier(UUID.randomUUID(), "Sales Associate", 1, BigDecimal.valueOf(10000));
```

(three call sites: `countDownlineCountsAllDescendantsRegardlessOfDepth`, `countDownlineExcludesAssociatesFromAnotherTenantSharingTheSameParentId` — including its second `otherRank` construction, which also drops `otherTenantId` — and `countJoinedBetweenIncludesAssociatesWhoJoinOnTheEndDate`).

- [ ] **Step 2: Run the affected tests and confirm they fail to compile**

Run: `mvn -f backend/pom.xml test -Dtest=DashboardServiceTest,AssociateRepositoryTest`
Expected: COMPILE ERROR — `RankTier` constructor and `findByTenantIdOrderByRankOrder` don't match the new call sites yet.

- [ ] **Step 3: Remove tenant_id from the rank_tier table, entity, and repository**

In `backend/src/main/resources/db/migration/V1__create_dashboard_tables.sql`, change:

```sql
CREATE TABLE rank_tier (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    rank_order INT NOT NULL,
    volume_threshold NUMERIC(14,2) NOT NULL,
    UNIQUE (tenant_id, rank_order)
);
```

to:

```sql
CREATE TABLE rank_tier (
    id UUID PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    rank_order INT NOT NULL,
    volume_threshold NUMERIC(14,2) NOT NULL,
    UNIQUE (rank_order)
);
```

Replace `backend/src/main/java/com/plotchain/rank/RankTier.java` with:

```java
package com.plotchain.rank;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "rank_tier")
public class RankTier {
    @Id
    private UUID id;
    private String name;
    @Column(name = "rank_order")
    private int rankOrder;
    @Column(name = "volume_threshold")
    private BigDecimal volumeThreshold;

    protected RankTier() {}

    public RankTier(UUID id, String name, int rankOrder, BigDecimal volumeThreshold) {
        this.id = id;
        this.name = name;
        this.rankOrder = rankOrder;
        this.volumeThreshold = volumeThreshold;
    }

    public UUID getId() { return id; }
    public String getName() { return name; }
    public int getRankOrder() { return rankOrder; }
    public BigDecimal getVolumeThreshold() { return volumeThreshold; }
}
```

Replace `backend/src/main/java/com/plotchain/rank/RankTierRepository.java` with:

```java
package com.plotchain.rank;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface RankTierRepository extends JpaRepository<RankTier, UUID> {
    List<RankTier> findAllByOrderByRankOrder();
}
```

In `backend/src/main/java/com/plotchain/dashboard/DashboardService.java`, change:

```java
List<RankTier> ranks = rankTierRepository.findByTenantIdOrderByRankOrder(associate.getTenantId());
```

to:

```java
List<RankTier> ranks = rankTierRepository.findAllByOrderByRankOrder();
```

- [ ] **Step 4: Run the affected tests and confirm they pass**

Run: `mvn -f backend/pom.xml test -Dtest=DashboardServiceTest,AssociateRepositoryTest`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/resources/db/migration/V1__create_dashboard_tables.sql \
        backend/src/main/java/com/plotchain/rank/RankTier.java \
        backend/src/main/java/com/plotchain/rank/RankTierRepository.java \
        backend/src/main/java/com/plotchain/dashboard/DashboardService.java \
        backend/src/test/java/com/plotchain/dashboard/DashboardServiceTest.java \
        backend/src/test/java/com/plotchain/associate/AssociateRepositoryTest.java
git commit -m "refactor: remove tenant_id from rank_tier"
```

---

### Task 2: Cycle

**Files:**
- Modify: `backend/src/main/resources/db/migration/V1__create_dashboard_tables.sql:26-32` (`cycle` table)
- Modify: `backend/src/main/java/com/plotchain/cycle/Cycle.java`
- Modify: `backend/src/main/java/com/plotchain/cycle/CycleRepository.java`
- Modify: `backend/src/main/java/com/plotchain/cycle/NoOpenCycleException.java`
- Modify: `backend/src/main/java/com/plotchain/dashboard/DashboardService.java:68-69`
- Modify: `backend/src/test/java/com/plotchain/dashboard/DashboardServiceTest.java:73,84-85`
- Modify: `backend/src/test/java/com/plotchain/dashboard/DashboardControllerTest.java:62-71`

**Interfaces:**
- Produces: `CycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus): Optional<Cycle>` (replaces `findFirstByTenantIdAndStatusOrderByPeriodStartDesc(UUID, CycleStatus)`), `NoOpenCycleException()` no-arg constructor (replaces `NoOpenCycleException(UUID)`).

- [ ] **Step 1: Update the tests to the new (tenant-free) `Cycle`/`NoOpenCycleException` shape**

In `backend/src/test/java/com/plotchain/dashboard/DashboardServiceTest.java`, delete the line:

```java
cycle.setTenantId(tenantId);
```

and change:

```java
when(cycleRepository.findFirstByTenantIdAndStatusOrderByPeriodStartDesc(tenantId, CycleStatus.OPEN))
    .thenReturn(Optional.of(cycle));
```

to:

```java
when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN))
    .thenReturn(Optional.of(cycle));
```

In `backend/src/test/java/com/plotchain/dashboard/DashboardControllerTest.java`, change:

```java
@Test
void returns409WhenNoOpenCycle() throws Exception {
    UUID associateId = UUID.randomUUID();
    UUID tenantId = UUID.randomUUID();
    when(dashboardService.getDashboard(associateId))
        .thenThrow(new com.plotchain.cycle.NoOpenCycleException(tenantId));

    mockMvc.perform(get("/api/associates/{associateId}/dashboard", associateId))
        .andExpect(status().isConflict());
}
```

to:

```java
@Test
void returns409WhenNoOpenCycle() throws Exception {
    UUID associateId = UUID.randomUUID();
    when(dashboardService.getDashboard(associateId))
        .thenThrow(new com.plotchain.cycle.NoOpenCycleException());

    mockMvc.perform(get("/api/associates/{associateId}/dashboard", associateId))
        .andExpect(status().isConflict());
}
```

- [ ] **Step 2: Run the affected tests and confirm they fail to compile**

Run: `mvn -f backend/pom.xml test -Dtest=DashboardServiceTest,DashboardControllerTest`
Expected: COMPILE ERROR

- [ ] **Step 3: Remove tenant_id from the cycle table, entity, repository, and exception**

In `backend/src/main/resources/db/migration/V1__create_dashboard_tables.sql`, change:

```sql
CREATE TABLE cycle (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('OPEN','CALCULATING','CLOSED','PAID'))
);
```

to:

```sql
CREATE TABLE cycle (
    id UUID PRIMARY KEY,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('OPEN','CALCULATING','CLOSED','PAID'))
);
```

In `backend/src/main/java/com/plotchain/cycle/Cycle.java`, remove the `tenantId` field and its getter/setter:

```java
@Column(name = "tenant_id", nullable = false)
private UUID tenantId;
```

```java
public UUID getTenantId() { return tenantId; }
public void setTenantId(UUID tenantId) { this.tenantId = tenantId; }
```

Replace `backend/src/main/java/com/plotchain/cycle/CycleRepository.java` with:

```java
package com.plotchain.cycle;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface CycleRepository extends JpaRepository<Cycle, UUID> {
    Optional<Cycle> findFirstByStatusOrderByPeriodStartDesc(CycleStatus status);
}
```

Replace `backend/src/main/java/com/plotchain/cycle/NoOpenCycleException.java` with:

```java
package com.plotchain.cycle;

public class NoOpenCycleException extends RuntimeException {
    public NoOpenCycleException() {
        super("No open cycle");
    }
}
```

In `backend/src/main/java/com/plotchain/dashboard/DashboardService.java`, change:

```java
Cycle cycle = cycleRepository.findFirstByTenantIdAndStatusOrderByPeriodStartDesc(associate.getTenantId(), CycleStatus.OPEN)
    .orElseThrow(() -> new NoOpenCycleException(associate.getTenantId()));
```

to:

```java
Cycle cycle = cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)
    .orElseThrow(NoOpenCycleException::new);
```

- [ ] **Step 4: Run the affected tests and confirm they pass**

Run: `mvn -f backend/pom.xml test -Dtest=DashboardServiceTest,DashboardControllerTest`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/resources/db/migration/V1__create_dashboard_tables.sql \
        backend/src/main/java/com/plotchain/cycle/Cycle.java \
        backend/src/main/java/com/plotchain/cycle/CycleRepository.java \
        backend/src/main/java/com/plotchain/cycle/NoOpenCycleException.java \
        backend/src/main/java/com/plotchain/dashboard/DashboardService.java \
        backend/src/test/java/com/plotchain/dashboard/DashboardServiceTest.java \
        backend/src/test/java/com/plotchain/dashboard/DashboardControllerTest.java
git commit -m "refactor: remove tenant_id from cycle"
```

---

### Task 3: Wallet

**Files:**
- Modify: `backend/src/main/resources/db/migration/V1__create_dashboard_tables.sql:61-65` (`wallet` table)
- Modify: `backend/src/main/java/com/plotchain/wallet/Wallet.java`
- Modify: `backend/src/main/java/com/plotchain/dashboard/DashboardService.java:81-82`
- Modify: `backend/src/test/java/com/plotchain/dashboard/DashboardServiceTest.java:94`

**Interfaces:**
- Produces: `Wallet.zero(UUID associateId): Wallet` (replaces `zero(UUID associateId, UUID tenantId)`).

- [ ] **Step 1: Update the test to the new `Wallet.zero` shape**

In `backend/src/test/java/com/plotchain/dashboard/DashboardServiceTest.java`, change:

```java
when(walletRepository.findById(associateId)).thenReturn(Optional.of(Wallet.zero(associateId, tenantId)));
```

to:

```java
when(walletRepository.findById(associateId)).thenReturn(Optional.of(Wallet.zero(associateId)));
```

- [ ] **Step 2: Run the affected test and confirm it fails to compile**

Run: `mvn -f backend/pom.xml test -Dtest=DashboardServiceTest`
Expected: COMPILE ERROR

- [ ] **Step 3: Remove tenant_id from the wallet table, entity, and service call site**

In `backend/src/main/resources/db/migration/V1__create_dashboard_tables.sql`, change:

```sql
CREATE TABLE wallet (
    associate_id UUID PRIMARY KEY REFERENCES associate(id),
    tenant_id UUID NOT NULL,
    balance NUMERIC(14,2) NOT NULL DEFAULT 0
);
```

to:

```sql
CREATE TABLE wallet (
    associate_id UUID PRIMARY KEY REFERENCES associate(id),
    balance NUMERIC(14,2) NOT NULL DEFAULT 0
);
```

Replace `backend/src/main/java/com/plotchain/wallet/Wallet.java` with:

```java
package com.plotchain.wallet;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "wallet")
public class Wallet {
    @Id
    @Column(name = "associate_id")
    private UUID associateId;
    @Column(nullable = false)
    private BigDecimal balance = BigDecimal.ZERO;

    public static Wallet zero(UUID associateId) {
        Wallet w = new Wallet();
        w.associateId = associateId;
        return w;
    }

    public UUID getAssociateId() { return associateId; }
    public BigDecimal getBalance() { return balance; }
}
```

In `backend/src/main/java/com/plotchain/dashboard/DashboardService.java`, change:

```java
Wallet wallet = walletRepository.findById(associateId)
    .orElseGet(() -> Wallet.zero(associateId, associate.getTenantId()));
```

to:

```java
Wallet wallet = walletRepository.findById(associateId)
    .orElseGet(() -> Wallet.zero(associateId));
```

- [ ] **Step 4: Run the affected test and confirm it passes**

Run: `mvn -f backend/pom.xml test -Dtest=DashboardServiceTest`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/resources/db/migration/V1__create_dashboard_tables.sql \
        backend/src/main/java/com/plotchain/wallet/Wallet.java \
        backend/src/main/java/com/plotchain/dashboard/DashboardService.java \
        backend/src/test/java/com/plotchain/dashboard/DashboardServiceTest.java
git commit -m "refactor: remove tenant_id from wallet"
```

---

### Task 4: LegVolume

**Files:**
- Modify: `backend/src/main/resources/db/migration/V1__create_dashboard_tables.sql:49-59` (`leg_volume` table)
- Modify: `backend/src/main/java/com/plotchain/legvolume/LegVolume.java`
- Modify: `backend/src/main/java/com/plotchain/dashboard/DashboardService.java:75-76`
- Modify: `backend/src/test/java/com/plotchain/dashboard/DashboardServiceTest.java:81`

**Interfaces:**
- Produces: `LegVolume.empty(UUID associateId, UUID cycleId): LegVolume` (replaces `empty(UUID associateId, UUID cycleId, UUID tenantId)`).

- [ ] **Step 1: Update the test to the new `LegVolume.empty` shape**

In `backend/src/test/java/com/plotchain/dashboard/DashboardServiceTest.java`, change:

```java
LegVolume legVolume = LegVolume.empty(associateId, cycleId, tenantId);
```

to:

```java
LegVolume legVolume = LegVolume.empty(associateId, cycleId);
```

- [ ] **Step 2: Run the affected test and confirm it fails to compile**

Run: `mvn -f backend/pom.xml test -Dtest=DashboardServiceTest`
Expected: COMPILE ERROR

- [ ] **Step 3: Remove tenant_id from the leg_volume table, entity, and service call site**

In `backend/src/main/resources/db/migration/V1__create_dashboard_tables.sql`, change:

```sql
CREATE TABLE leg_volume (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    associate_id UUID NOT NULL REFERENCES associate(id),
    cycle_id UUID NOT NULL REFERENCES cycle(id),
    left_leg_volume NUMERIC(14,2) NOT NULL DEFAULT 0,
    right_leg_volume NUMERIC(14,2) NOT NULL DEFAULT 0,
    carried_forward_left NUMERIC(14,2) NOT NULL DEFAULT 0,
    carried_forward_right NUMERIC(14,2) NOT NULL DEFAULT 0,
    UNIQUE (associate_id, cycle_id)
);
```

to:

```sql
CREATE TABLE leg_volume (
    id UUID PRIMARY KEY,
    associate_id UUID NOT NULL REFERENCES associate(id),
    cycle_id UUID NOT NULL REFERENCES cycle(id),
    left_leg_volume NUMERIC(14,2) NOT NULL DEFAULT 0,
    right_leg_volume NUMERIC(14,2) NOT NULL DEFAULT 0,
    carried_forward_left NUMERIC(14,2) NOT NULL DEFAULT 0,
    carried_forward_right NUMERIC(14,2) NOT NULL DEFAULT 0,
    UNIQUE (associate_id, cycle_id)
);
```

Replace `backend/src/main/java/com/plotchain/legvolume/LegVolume.java` with:

```java
package com.plotchain.legvolume;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "leg_volume")
public class LegVolume {
    @Id
    private UUID id;
    @Column(name = "associate_id", nullable = false)
    private UUID associateId;
    @Column(name = "cycle_id", nullable = false)
    private UUID cycleId;
    @Column(name = "left_leg_volume", nullable = false)
    private BigDecimal leftLegVolume = BigDecimal.ZERO;
    @Column(name = "right_leg_volume", nullable = false)
    private BigDecimal rightLegVolume = BigDecimal.ZERO;
    @Column(name = "carried_forward_left", nullable = false)
    private BigDecimal carriedForwardLeft = BigDecimal.ZERO;
    @Column(name = "carried_forward_right", nullable = false)
    private BigDecimal carriedForwardRight = BigDecimal.ZERO;

    public static LegVolume empty(UUID associateId, UUID cycleId) {
        LegVolume lv = new LegVolume();
        lv.id = UUID.randomUUID();
        lv.associateId = associateId;
        lv.cycleId = cycleId;
        return lv;
    }

    public UUID getId() { return id; }
    public UUID getAssociateId() { return associateId; }
    public UUID getCycleId() { return cycleId; }
    public BigDecimal getLeftLegVolume() { return leftLegVolume; }
    public BigDecimal getRightLegVolume() { return rightLegVolume; }
    public BigDecimal getCarriedForwardLeft() { return carriedForwardLeft; }
    public BigDecimal getCarriedForwardRight() { return carriedForwardRight; }
}
```

In `backend/src/main/java/com/plotchain/dashboard/DashboardService.java`, change:

```java
LegVolume legVolume = legVolumeRepository.findByAssociateIdAndCycleId(associateId, cycle.getId())
    .orElseGet(() -> LegVolume.empty(associateId, cycle.getId(), associate.getTenantId()));
```

to:

```java
LegVolume legVolume = legVolumeRepository.findByAssociateIdAndCycleId(associateId, cycle.getId())
    .orElseGet(() -> LegVolume.empty(associateId, cycle.getId()));
```

- [ ] **Step 4: Run the affected test and confirm it passes**

Run: `mvn -f backend/pom.xml test -Dtest=DashboardServiceTest`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/resources/db/migration/V1__create_dashboard_tables.sql \
        backend/src/main/java/com/plotchain/legvolume/LegVolume.java \
        backend/src/main/java/com/plotchain/dashboard/DashboardService.java \
        backend/src/test/java/com/plotchain/dashboard/DashboardServiceTest.java
git commit -m "refactor: remove tenant_id from leg_volume"
```

---

### Task 5: Announcement

**Files:**
- Modify: `backend/src/main/resources/db/migration/V1__create_dashboard_tables.sql:67-75` (`announcement` table)
- Modify: `backend/src/main/java/com/plotchain/announcement/Announcement.java`
- Modify: `backend/src/main/java/com/plotchain/announcement/AnnouncementRepository.java`
- Modify: `backend/src/main/java/com/plotchain/dashboard/DashboardService.java:113`
- Modify: `backend/src/test/java/com/plotchain/dashboard/DashboardServiceTest.java:100`

**Interfaces:**
- Produces: `AnnouncementRepository.findTop5ByOrderByPublishedAtDesc(): List<Announcement>` (replaces `findTop5ByTenantIdOrderByPublishedAtDesc(UUID)`).

- [ ] **Step 1: Update the test to the new `AnnouncementRepository` method**

In `backend/src/test/java/com/plotchain/dashboard/DashboardServiceTest.java`, change:

```java
when(announcementRepository.findTop5ByTenantIdOrderByPublishedAtDesc(tenantId)).thenReturn(List.of());
```

to:

```java
when(announcementRepository.findTop5ByOrderByPublishedAtDesc()).thenReturn(List.of());
```

- [ ] **Step 2: Run the affected test and confirm it fails to compile**

Run: `mvn -f backend/pom.xml test -Dtest=DashboardServiceTest`
Expected: COMPILE ERROR

- [ ] **Step 3: Remove tenant_id from the announcement table, entity, repository, and service call site**

In `backend/src/main/resources/db/migration/V1__create_dashboard_tables.sql`, change:

```sql
CREATE TABLE announcement (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    title VARCHAR(300) NOT NULL,
    body TEXT NOT NULL,
    published_at TIMESTAMP NOT NULL,
    audience VARCHAR(50) NOT NULL DEFAULT 'ALL'
);
CREATE INDEX idx_announcement_tenant_published ON announcement(tenant_id, published_at DESC);
```

to:

```sql
CREATE TABLE announcement (
    id UUID PRIMARY KEY,
    title VARCHAR(300) NOT NULL,
    body TEXT NOT NULL,
    published_at TIMESTAMP NOT NULL,
    audience VARCHAR(50) NOT NULL DEFAULT 'ALL'
);
CREATE INDEX idx_announcement_published ON announcement(published_at DESC);
```

In `backend/src/main/java/com/plotchain/announcement/Announcement.java`, remove the `tenantId` field and getter:

```java
@Column(name = "tenant_id", nullable = false)
private UUID tenantId;
```

```java
public UUID getTenantId() { return tenantId; }
```

Replace `backend/src/main/java/com/plotchain/announcement/AnnouncementRepository.java` with:

```java
package com.plotchain.announcement;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface AnnouncementRepository extends JpaRepository<Announcement, UUID> {
    List<Announcement> findTop5ByOrderByPublishedAtDesc();
}
```

In `backend/src/main/java/com/plotchain/dashboard/DashboardService.java`, change:

```java
List<Announcement> announcements = announcementRepository.findTop5ByTenantIdOrderByPublishedAtDesc(associate.getTenantId());
```

to:

```java
List<Announcement> announcements = announcementRepository.findTop5ByOrderByPublishedAtDesc();
```

- [ ] **Step 4: Run the affected test and confirm it passes**

Run: `mvn -f backend/pom.xml test -Dtest=DashboardServiceTest`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/resources/db/migration/V1__create_dashboard_tables.sql \
        backend/src/main/java/com/plotchain/announcement/Announcement.java \
        backend/src/main/java/com/plotchain/announcement/AnnouncementRepository.java \
        backend/src/main/java/com/plotchain/dashboard/DashboardService.java \
        backend/src/test/java/com/plotchain/dashboard/DashboardServiceTest.java
git commit -m "refactor: remove tenant_id from announcement"
```

---

### Task 6: Associate (final — removes tenant_id everywhere else depends on this)

**Files:**
- Modify: `backend/src/main/resources/db/migration/V1__create_dashboard_tables.sql:10-24` (`associate` table)
- Modify: `backend/src/main/java/com/plotchain/associate/Associate.java`
- Modify: `backend/src/main/java/com/plotchain/associate/AssociateRepository.java`
- Modify: `backend/src/main/java/com/plotchain/dashboard/DashboardService.java:88,104-105,108-109`
- Modify: `backend/src/test/java/com/plotchain/dashboard/DashboardServiceTest.java:58,66`
- Modify: `backend/src/test/java/com/plotchain/associate/AssociateRepositoryTest.java` (full rewrite)

**Interfaces:**
- Consumes: `RankTier(UUID, String, int, BigDecimal)` from Task 1.
- Produces: `AssociateRepository.countDownline(UUID associateId)`, `countActiveToday(UUID associateId, LocalDate sinceDate)`, `countJoinedBetween(UUID associateId, LocalDate start, LocalDate end)` (each drops its `UUID tenantId` parameter).

- [ ] **Step 1: Update the tests to the new (tenant-free) `Associate`/`AssociateRepository` shape**

In `backend/src/test/java/com/plotchain/dashboard/DashboardServiceTest.java`, delete these two lines:

```java
UUID tenantId = UUID.randomUUID();
```

```java
associate.setTenantId(tenantId);
```

Then change:

```java
when(associateRepository.countDownline(associateId, tenantId)).thenReturn(12L);
when(associateRepository.countActiveToday(any(), any(), any())).thenReturn(3L);
when(associateRepository.countJoinedBetween(any(), any(), any(), any())).thenReturn(2L);
```

to:

```java
when(associateRepository.countDownline(associateId)).thenReturn(12L);
when(associateRepository.countActiveToday(any(), any())).thenReturn(3L);
when(associateRepository.countJoinedBetween(any(), any(), any())).thenReturn(2L);
```

Replace `backend/src/test/java/com/plotchain/associate/AssociateRepositoryTest.java` with:

```java
package com.plotchain.associate;

import com.plotchain.rank.RankTier;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@ActiveProfiles("test")
class AssociateRepositoryTest {

    @Autowired
    AssociateRepository associateRepository;

    @Autowired
    org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager entityManager;

    @Test
    void countDownlineCountsAllDescendantsRegardlessOfDepth() {
        RankTier rank = new RankTier(UUID.randomUUID(), "Sales Associate", 1, BigDecimal.valueOf(10000));
        entityManager.persist(rank);

        Associate root = newAssociate(null, null, rank.getId());
        Associate child = newAssociate(root.getId(), "L", rank.getId());
        Associate grandchild = newAssociate(child.getId(), "L", rank.getId());
        associateRepository.saveAll(java.util.List.of(root, child, grandchild));
        entityManager.flush();

        long count = associateRepository.countDownline(root.getId());

        assertThat(count).isEqualTo(2);
    }

    @Test
    void countJoinedBetweenIncludesAssociatesWhoJoinOnTheEndDate() {
        RankTier rank = new RankTier(UUID.randomUUID(), "Sales Associate", 1, BigDecimal.valueOf(10000));
        entityManager.persist(rank);

        LocalDate start = LocalDate.now().minusDays(5);
        LocalDate end = LocalDate.now();

        Associate root = newAssociate(null, null, rank.getId());
        Associate lastDayJoiner = newAssociate(root.getId(), "L", rank.getId());
        lastDayJoiner.setJoinedAt(instantAt(end, LocalTime.of(23, 59, 59)));
        associateRepository.saveAll(java.util.List.of(root, lastDayJoiner));
        entityManager.flush();

        // Upper bound is exclusive by contract: callers pass the day AFTER the last day to
        // include (mirrors what DashboardService does with cycle.getPeriodEnd().plusDays(1)).
        long count = associateRepository.countJoinedBetween(root.getId(), start, end.plusDays(1));

        assertThat(count).isEqualTo(1);
    }

    // Uses the JVM default zone (matching how the DATE query params below are interpreted
    // against the TIMESTAMP-without-timezone joined_at column) so the boundary lines up.
    private static Instant instantAt(LocalDate date, LocalTime time) {
        return date.atTime(time).atZone(ZoneId.systemDefault()).toInstant();
    }

    private Associate newAssociate(UUID parentId, String position, UUID rankId) {
        Associate a = new Associate();
        a.setId(UUID.randomUUID());
        a.setParentId(parentId);
        a.setPosition(position);
        a.setName("Test Associate");
        a.setRankId(rankId);
        a.setKycStatus(KycStatus.VERIFIED);
        a.setJoinedAt(Instant.now());
        a.setCumulativeMatchedVolume(BigDecimal.ZERO);
        return a;
    }
}
```

(This drops the `countDownlineExcludesAssociatesFromAnotherTenantSharingTheSameParentId` test entirely — cross-tenant isolation is no longer a concept the system has.)

- [ ] **Step 2: Run the affected tests and confirm they fail to compile**

Run: `mvn -f backend/pom.xml test -Dtest=DashboardServiceTest,AssociateRepositoryTest`
Expected: COMPILE ERROR

- [ ] **Step 3: Remove tenant_id from the associate table, entity, repository, and service**

In `backend/src/main/resources/db/migration/V1__create_dashboard_tables.sql`, change:

```sql
CREATE TABLE associate (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    sponsor_id UUID,
    parent_id UUID REFERENCES associate(id),
    position VARCHAR(1) CHECK (position IN ('L','R')),
    name VARCHAR(200) NOT NULL,
    rank_id UUID NOT NULL REFERENCES rank_tier(id),
    kyc_status VARCHAR(20) NOT NULL CHECK (kyc_status IN ('PENDING','VERIFIED','REJECTED')),
    joined_at TIMESTAMP NOT NULL,
    cumulative_matched_volume NUMERIC(14,2) NOT NULL DEFAULT 0,
    last_active_at TIMESTAMP
);
CREATE INDEX idx_associate_parent_id ON associate(parent_id);
CREATE INDEX idx_associate_tenant_id ON associate(tenant_id);
```

to:

```sql
CREATE TABLE associate (
    id UUID PRIMARY KEY,
    sponsor_id UUID,
    parent_id UUID REFERENCES associate(id),
    position VARCHAR(1) CHECK (position IN ('L','R')),
    name VARCHAR(200) NOT NULL,
    rank_id UUID NOT NULL REFERENCES rank_tier(id),
    kyc_status VARCHAR(20) NOT NULL CHECK (kyc_status IN ('PENDING','VERIFIED','REJECTED')),
    joined_at TIMESTAMP NOT NULL,
    cumulative_matched_volume NUMERIC(14,2) NOT NULL DEFAULT 0,
    last_active_at TIMESTAMP
);
CREATE INDEX idx_associate_parent_id ON associate(parent_id);
```

In `backend/src/main/java/com/plotchain/associate/Associate.java`, remove the `tenantId` field and its getter/setter:

```java
@Column(name = "tenant_id", nullable = false)
private UUID tenantId;
```

```java
public UUID getTenantId() { return tenantId; }
public void setTenantId(UUID tenantId) { this.tenantId = tenantId; }
```

Replace `backend/src/main/java/com/plotchain/associate/AssociateRepository.java` with:

```java
package com.plotchain.associate;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.UUID;

public interface AssociateRepository extends JpaRepository<Associate, UUID> {

    @Query(value = """
        WITH RECURSIVE downline(id) AS (
            SELECT id FROM associate WHERE parent_id = :associateId
            UNION ALL
            SELECT a.id FROM associate a JOIN downline d ON a.parent_id = d.id
        )
        SELECT count(*) FROM downline
        """, nativeQuery = true)
    long countDownline(@Param("associateId") UUID associateId);

    @Query(value = """
        WITH RECURSIVE downline(id) AS (
            SELECT id FROM associate WHERE parent_id = :associateId
            UNION ALL
            SELECT a.id FROM associate a JOIN downline d ON a.parent_id = d.id
        )
        SELECT count(*) FROM downline dl JOIN associate a2 ON a2.id = dl.id
        WHERE a2.last_active_at >= :sinceDate
        """, nativeQuery = true)
    long countActiveToday(@Param("associateId") UUID associateId, @Param("sinceDate") LocalDate sinceDate);

    // :end is treated as an EXCLUSIVE upper bound (the day after the last day to include).
    // joined_at is a TIMESTAMP; a BETWEEN against a LocalDate coerces the upper bound to
    // midnight and silently drops same-day joins on the period's last day. Callers must pass
    // the day *after* the last day to include (e.g. cycle.getPeriodEnd().plusDays(1)).
    @Query(value = """
        WITH RECURSIVE downline(id) AS (
            SELECT id FROM associate WHERE parent_id = :associateId
            UNION ALL
            SELECT a.id FROM associate a JOIN downline d ON a.parent_id = d.id
        )
        SELECT count(*) FROM downline dl JOIN associate a2 ON a2.id = dl.id
        WHERE a2.joined_at >= :start AND a2.joined_at < :end
        """, nativeQuery = true)
    long countJoinedBetween(@Param("associateId") UUID associateId, @Param("start") LocalDate start, @Param("end") LocalDate end);
}
```

In `backend/src/main/java/com/plotchain/dashboard/DashboardService.java`, change:

```java
long totalDownline = associateRepository.countDownline(associateId, associate.getTenantId());
long activeToday = associateRepository.countActiveToday(associateId, associate.getTenantId(), LocalDate.now());
// Upper bound is exclusive, so pass the day *after* the cycle's last day to include
// associates who joined on periodEnd itself (see AssociateRepository#countJoinedBetween).
long newJoins = associateRepository.countJoinedBetween(
    associateId, associate.getTenantId(), cycle.getPeriodStart(), cycle.getPeriodEnd().plusDays(1));
```

to:

```java
long totalDownline = associateRepository.countDownline(associateId);
long activeToday = associateRepository.countActiveToday(associateId, LocalDate.now());
// Upper bound is exclusive, so pass the day *after* the cycle's last day to include
// associates who joined on periodEnd itself (see AssociateRepository#countJoinedBetween).
long newJoins = associateRepository.countJoinedBetween(
    associateId, cycle.getPeriodStart(), cycle.getPeriodEnd().plusDays(1));
```

Also in `DashboardService.java`, this is the last remaining stray reference to "tenant" in the codebase — update the wording:

```java
.orElseThrow(() -> new IllegalStateException("Associate's rank not found in tenant's rank table: " + associate.getRankId()));
```

to:

```java
.orElseThrow(() -> new IllegalStateException("Associate's rank not found in rank table: " + associate.getRankId()));
```

- [ ] **Step 4: Run the full test suite and confirm everything passes**

Run: `mvn -f backend/pom.xml test`
Expected: PASS. Note: `LedgerEntry.java` and the `ledger_entry` table still have `tenant_id` at the end of this task — that's Task 7, a plan gap discovered after Task 5 (the original 6-task scope missed it; `LedgerEntry`'s `tenantId` is a dead field, never queried or referenced by `DashboardService`, `LedgerEntryRepository`, or any test). "No remaining references anywhere" is only true after Task 7.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/resources/db/migration/V1__create_dashboard_tables.sql \
        backend/src/main/java/com/plotchain/associate/Associate.java \
        backend/src/main/java/com/plotchain/associate/AssociateRepository.java \
        backend/src/main/java/com/plotchain/dashboard/DashboardService.java \
        backend/src/test/java/com/plotchain/dashboard/DashboardServiceTest.java \
        backend/src/test/java/com/plotchain/associate/AssociateRepositoryTest.java
git commit -m "refactor: remove tenant_id from associate"
```

---

### Task 7: LedgerEntry (plan gap, discovered after Task 5 — the original 6-task scope missed this table)

**Files:**
- Modify: `backend/src/main/resources/db/migration/V1__create_dashboard_tables.sql:34-42` (`ledger_entry` table)
- Modify: `backend/src/main/java/com/plotchain/income/LedgerEntry.java`

**Interfaces:** None — `tenantId` on `LedgerEntry` is a dead field. `LedgerEntryRepository`'s two `@Query` methods (`sumNetAmountByAssociateCycleAndType`, `sumNetAmountByAssociateAndCycle`) filter only by `associateId`/`cycleId`/`incomeType`, never `tenantId`. `DashboardService` never calls `LedgerEntry.getTenantId()`/`setTenantId()`. No test file exists for `LedgerEntry` or `LedgerEntryRepository`. Removing the field touches no other file.

- [ ] **Step 1: Remove tenant_id from the ledger_entry table and entity**

In `backend/src/main/resources/db/migration/V1__create_dashboard_tables.sql`, change:

```sql
CREATE TABLE ledger_entry (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    associate_id UUID NOT NULL REFERENCES associate(id),
    income_type VARCHAR(30) NOT NULL CHECK (income_type IN ('DIRECT','MATCHING','SPONSOR_MATCHING','ROYALTY','REWARD','PERK')),
    cycle_id UUID NOT NULL REFERENCES cycle(id),
    gross_amount NUMERIC(14,2) NOT NULL,
    tds_deduction NUMERIC(14,2) NOT NULL,
    admin_deduction NUMERIC(14,2) NOT NULL,
    net_amount NUMERIC(14,2) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('PENDING','CARRIED_FORWARD','PAID','REVERSED')),
    created_at TIMESTAMP NOT NULL
);
```

to:

```sql
CREATE TABLE ledger_entry (
    id UUID PRIMARY KEY,
    associate_id UUID NOT NULL REFERENCES associate(id),
    income_type VARCHAR(30) NOT NULL CHECK (income_type IN ('DIRECT','MATCHING','SPONSOR_MATCHING','ROYALTY','REWARD','PERK')),
    cycle_id UUID NOT NULL REFERENCES cycle(id),
    gross_amount NUMERIC(14,2) NOT NULL,
    tds_deduction NUMERIC(14,2) NOT NULL,
    admin_deduction NUMERIC(14,2) NOT NULL,
    net_amount NUMERIC(14,2) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('PENDING','CARRIED_FORWARD','PAID','REVERSED')),
    created_at TIMESTAMP NOT NULL
);
```

(The `idx_ledger_associate_cycle` index below this table is unaffected — it doesn't reference `tenant_id`.)

In `backend/src/main/java/com/plotchain/income/LedgerEntry.java`, remove the `tenantId` field and its getter/setter:

```java
@Column(name = "tenant_id", nullable = false)
private UUID tenantId;
```

```java
public UUID getTenantId() { return tenantId; }
public void setTenantId(UUID tenantId) { this.tenantId = tenantId; }
```

- [ ] **Step 2: Run the full test suite and confirm everything passes**

Run: `mvn -f backend/pom.xml test`
Expected: PASS. `DashboardControllerTest` will still show its 3 pre-existing, unrelated ApplicationContext/ByteBuddy errors (JDK 25 incompatibility) — not caused by this change. After this task, grep for `tenant_id`/`tenantId` across `backend/src` returns zero hits.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/resources/db/migration/V1__create_dashboard_tables.sql \
        backend/src/main/java/com/plotchain/income/LedgerEntry.java
git commit -m "refactor: remove tenant_id from ledger_entry"
```
