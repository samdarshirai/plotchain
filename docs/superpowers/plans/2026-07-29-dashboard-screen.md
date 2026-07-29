# Dashboard Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the associate-facing Dashboard hero screen (spec §8): a Spring Boot REST endpoint that aggregates cycle income, wallet, leg volume, rank progress, team stats, cycle countdown, and announcements for one associate, and an Angular page that renders the nine widgets in the user-validated stat-first order.

**Architecture:** Single Spring Boot monolith backend (no new microservices, per spec §6 YAGNI) exposing `GET /api/associates/{associateId}/dashboard`, backed by Postgres via Flyway-managed schema and Spring Data JPA repositories. Angular standalone-component frontend with one `DashboardService` HTTP call feeding nine presentational widget components via `@Input()`. This plan builds only the read path — it does not implement the compensation batch engine, Sale/Booking/EMI capture, e-PIN, Grievance, ID Card, or the full withdrawal flow; those are separate subsystem plans and this plan's tests seed rows directly into the tables those subsystems will eventually populate.

**Tech Stack:** Java 21, Spring Boot 3.3.x (Web, Data JPA, Validation), Postgres 16, Flyway, H2 (test scope, Postgres compatibility mode) for fast repository/integration tests, JUnit 5 + Mockito. Angular 18 standalone components, `@ngx-translate/core` for i18n, Jasmine/Karma (Angular CLI default).

## Global Constraints

- Every table carries `tenant_id` (PRD §8 NFR: multi-tenancy). This plan stores the column and filters queries by the associate's own `tenant_id`; it does NOT build a cross-tenant request-context/interceptor — that is a separate platform/auth plan.
- All associate-facing UI strings must go through `@ngx-translate/core` translation keys with English (`en.json`) and Hindi (`hi.json`) entries — no hardcoded UI copy (spec §9, PRD §8 NFR i18n).
- Widget order is fixed, top to bottom, per the user-validated mockup (spec §8): KYC banner → Cycle income card → Wallet card → Leg volume gauge → Rank progress → Team snapshot → Quick actions row → Cycle countdown → Announcements strip. Do not reorder.
- Money fields are `BigDecimal` in Java / `NUMERIC(14,2)` in Postgres — never `float`/`double` for currency.
- Two-factor transaction-password gating on withdrawal (PRD §8 NFR) is explicitly OUT of scope here — the Wallet card's Withdraw action only navigates to `/wallet/withdraw`; the full withdrawal flow belongs to a separate Wallet/Withdrawal subsystem plan.
- No new microservices (spec §6).

---

## File Structure

```
backend/
  pom.xml
  src/main/resources/application.yml
  src/main/resources/db/migration/V1__create_dashboard_tables.sql
  src/main/java/com/plotchain/PlotchainApplication.java
  src/main/java/com/plotchain/rank/RankTier.java
  src/main/java/com/plotchain/rank/RankTierRepository.java
  src/main/java/com/plotchain/associate/Associate.java
  src/main/java/com/plotchain/associate/KycStatus.java
  src/main/java/com/plotchain/associate/AssociateRepository.java
  src/main/java/com/plotchain/associate/AssociateNotFoundException.java
  src/main/java/com/plotchain/cycle/Cycle.java
  src/main/java/com/plotchain/cycle/CycleStatus.java
  src/main/java/com/plotchain/cycle/CycleRepository.java
  src/main/java/com/plotchain/cycle/NoOpenCycleException.java
  src/main/java/com/plotchain/income/LedgerEntry.java
  src/main/java/com/plotchain/income/IncomeType.java
  src/main/java/com/plotchain/income/LedgerEntryStatus.java
  src/main/java/com/plotchain/income/LedgerEntryRepository.java
  src/main/java/com/plotchain/legvolume/LegVolume.java
  src/main/java/com/plotchain/legvolume/LegVolumeRepository.java
  src/main/java/com/plotchain/wallet/Wallet.java
  src/main/java/com/plotchain/wallet/WalletRepository.java
  src/main/java/com/plotchain/announcement/Announcement.java
  src/main/java/com/plotchain/announcement/AnnouncementRepository.java
  src/main/java/com/plotchain/dashboard/DashboardResponse.java
  src/main/java/com/plotchain/dashboard/DashboardService.java
  src/main/java/com/plotchain/dashboard/DashboardController.java
  src/main/java/com/plotchain/dashboard/DashboardExceptionHandler.java
  src/test/resources/application-test.yml
  src/test/java/com/plotchain/PlotchainApplicationTests.java
  src/test/java/com/plotchain/associate/AssociateRepositoryTest.java
  src/test/java/com/plotchain/dashboard/DashboardServiceTest.java
  src/test/java/com/plotchain/dashboard/DashboardControllerTest.java

frontend/
  src/app/dashboard/models/dashboard-response.model.ts
  src/app/dashboard/dashboard.service.ts
  src/app/dashboard/dashboard.service.spec.ts
  src/app/dashboard/dashboard.component.ts
  src/app/dashboard/dashboard.component.spec.ts
  src/app/dashboard/widgets/kyc-banner/kyc-banner.component.ts
  src/app/dashboard/widgets/kyc-banner/kyc-banner.component.spec.ts
  src/app/dashboard/widgets/cycle-income-card/cycle-income-card.component.ts
  src/app/dashboard/widgets/cycle-income-card/cycle-income-card.component.spec.ts
  src/app/dashboard/widgets/wallet-card/wallet-card.component.ts
  src/app/dashboard/widgets/wallet-card/wallet-card.component.spec.ts
  src/app/dashboard/widgets/leg-volume-gauge/leg-volume-gauge.component.ts
  src/app/dashboard/widgets/leg-volume-gauge/leg-volume-gauge.component.spec.ts
  src/app/dashboard/widgets/rank-progress/rank-progress.component.ts
  src/app/dashboard/widgets/rank-progress/rank-progress.component.spec.ts
  src/app/dashboard/widgets/team-snapshot/team-snapshot.component.ts
  src/app/dashboard/widgets/team-snapshot/team-snapshot.component.spec.ts
  src/app/dashboard/widgets/quick-actions/quick-actions.component.ts
  src/app/dashboard/widgets/quick-actions/quick-actions.component.spec.ts
  src/app/dashboard/widgets/cycle-countdown/cycle-countdown.component.ts
  src/app/dashboard/widgets/cycle-countdown/cycle-countdown.component.spec.ts
  src/app/dashboard/widgets/announcements-strip/announcements-strip.component.ts
  src/app/dashboard/widgets/announcements-strip/announcements-strip.component.spec.ts
  src/assets/i18n/en.json
  src/assets/i18n/hi.json
```

---

### Task 1: Backend project scaffold

**Files:**
- Create: `backend/pom.xml`
- Create: `backend/src/main/resources/application.yml`
- Create: `backend/src/main/java/com/plotchain/PlotchainApplication.java`
- Test: `backend/src/test/java/com/plotchain/PlotchainApplicationTests.java`
- Create: `backend/src/test/resources/application-test.yml`

**Interfaces:**
- Produces: a bootable Spring Boot app on port 8080, Postgres datasource config for dev, H2 (Postgres mode) for tests.

- [ ] **Step 1: Write `pom.xml`**

```xml
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.plotchain</groupId>
  <artifactId>plotchain-backend</artifactId>
  <version>0.1.0</version>
  <packaging>jar</packaging>
  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.3.4</version>
  </parent>
  <properties>
    <java.version>21</java.version>
  </properties>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-data-jpa</artifactId>
    </dependency>
    <dependency>
      <groupId>org.flywaydb</groupId>
      <artifactId>flyway-core</artifactId>
    </dependency>
    <dependency>
      <groupId>org.flywaydb</groupId>
      <artifactId>flyway-database-postgresql</artifactId>
    </dependency>
    <dependency>
      <groupId>org.postgresql</groupId>
      <artifactId>postgresql</artifactId>
      <scope>runtime</scope>
    </dependency>
    <dependency>
      <groupId>com.h2database</groupId>
      <artifactId>h2</artifactId>
      <scope>test</scope>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-test</artifactId>
      <scope>test</scope>
    </dependency>
  </dependencies>
  <build>
    <plugins>
      <plugin>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-maven-plugin</artifactId>
      </plugin>
    </plugins>
  </build>
</project>
```

- [ ] **Step 2: Write `application.yml`**

```yaml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/plotchain
    username: plotchain
    password: plotchain
  jpa:
    hibernate:
      ddl-auto: validate
  flyway:
    locations: classpath:db/migration
compensation:
  preview-matching-rate: 0.07
```

- [ ] **Step 3: Write `application-test.yml`**

```yaml
spring:
  datasource:
    url: jdbc:h2:mem:plotchain;MODE=PostgreSQL;DB_CLOSE_DELAY=-1
    username: sa
    password: ""
  jpa:
    hibernate:
      ddl-auto: validate
  flyway:
    locations: classpath:db/migration
compensation:
  preview-matching-rate: 0.07
```

- [ ] **Step 4: Write `PlotchainApplication.java`**

```java
package com.plotchain;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class PlotchainApplication {
    public static void main(String[] args) {
        SpringApplication.run(PlotchainApplication.class, args);
    }
}
```

- [ ] **Step 5: Write failing context-load test**

```java
package com.plotchain;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("test")
class PlotchainApplicationTests {
    @Test
    void contextLoads() {
    }
}
```

- [ ] **Step 6: Run test to verify it fails (no migrations exist yet, Flyway will error)**

Run: `cd backend && mvn -q test -Dtest=PlotchainApplicationTests`
Expected: FAIL — Flyway finds no migration scripts / schema validation error, since `V1__create_dashboard_tables.sql` doesn't exist yet.

- [ ] **Step 7: Commit**

```bash
git add backend/pom.xml backend/src/main/resources/application.yml backend/src/test/resources/application-test.yml backend/src/main/java/com/plotchain/PlotchainApplication.java backend/src/test/java/com/plotchain/PlotchainApplicationTests.java
git commit -m "feat: scaffold Spring Boot backend project"
```

---

### Task 2: Core domain entities and schema migration

**Files:**
- Create: `backend/src/main/resources/db/migration/V1__create_dashboard_tables.sql`
- Create: `backend/src/main/java/com/plotchain/rank/RankTier.java`
- Create: `backend/src/main/java/com/plotchain/rank/RankTierRepository.java`
- Create: `backend/src/main/java/com/plotchain/associate/KycStatus.java`
- Create: `backend/src/main/java/com/plotchain/associate/Associate.java`
- Create: `backend/src/main/java/com/plotchain/associate/AssociateRepository.java`
- Create: `backend/src/main/java/com/plotchain/associate/AssociateNotFoundException.java`
- Create: `backend/src/main/java/com/plotchain/cycle/CycleStatus.java`
- Create: `backend/src/main/java/com/plotchain/cycle/Cycle.java`
- Create: `backend/src/main/java/com/plotchain/cycle/CycleRepository.java`
- Create: `backend/src/main/java/com/plotchain/cycle/NoOpenCycleException.java`
- Create: `backend/src/main/java/com/plotchain/income/IncomeType.java`
- Create: `backend/src/main/java/com/plotchain/income/LedgerEntryStatus.java`
- Create: `backend/src/main/java/com/plotchain/income/LedgerEntry.java`
- Create: `backend/src/main/java/com/plotchain/income/LedgerEntryRepository.java`
- Create: `backend/src/main/java/com/plotchain/legvolume/LegVolume.java`
- Create: `backend/src/main/java/com/plotchain/legvolume/LegVolumeRepository.java`
- Create: `backend/src/main/java/com/plotchain/wallet/Wallet.java`
- Create: `backend/src/main/java/com/plotchain/wallet/WalletRepository.java`
- Create: `backend/src/main/java/com/plotchain/announcement/Announcement.java`
- Create: `backend/src/main/java/com/plotchain/announcement/AnnouncementRepository.java`
- Test: `backend/src/test/java/com/plotchain/associate/AssociateRepositoryTest.java`

**Interfaces:**
- Consumes: nothing (foundational).
- Produces: JPA entities `Associate`, `RankTier`, `Cycle`, `LedgerEntry`, `LegVolume`, `Wallet`, `Announcement` and their `JpaRepository<T, UUID>` interfaces, used by Task 3/4.

- [ ] **Step 1: Write the migration**

```sql
CREATE TABLE rank_tier (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    rank_order INT NOT NULL,
    volume_threshold NUMERIC(14,2) NOT NULL,
    UNIQUE (tenant_id, rank_order)
);

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

CREATE TABLE cycle (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('OPEN','CALCULATING','CLOSED','PAID'))
);

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
CREATE INDEX idx_ledger_associate_cycle ON ledger_entry(associate_id, cycle_id);

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

CREATE TABLE wallet (
    associate_id UUID PRIMARY KEY REFERENCES associate(id),
    tenant_id UUID NOT NULL,
    balance NUMERIC(14,2) NOT NULL DEFAULT 0
);

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

- [ ] **Step 2: Write the failing repository test**

```java
package com.plotchain.associate;

import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.rank.RankTier;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@ActiveProfiles("test")
class AssociateRepositoryTest {

    @Autowired
    AssociateRepository associateRepository;

    @Autowired
    org.springframework.test.context.junit.jupiter.SpringExtension springExtension;

    @Test
    void countDownlineCountsAllDescendantsRegardlessOfDepth() {
        UUID tenantId = UUID.randomUUID();
        RankTier rank = new RankTier(UUID.randomUUID(), tenantId, "Sales Associate", 1, BigDecimal.valueOf(10000));
        // persisted via cascade below through entity manager in real test setup

        Associate root = newAssociate(tenantId, null, null, rank.getId());
        Associate child = newAssociate(tenantId, root.getId(), "L", rank.getId());
        Associate grandchild = newAssociate(tenantId, child.getId(), "L", rank.getId());

        associateRepository.saveAll(java.util.List.of(root, child, grandchild));

        long count = associateRepository.countDownline(root.getId());

        assertThat(count).isEqualTo(2);
    }

    private Associate newAssociate(UUID tenantId, UUID parentId, String position, UUID rankId) {
        Associate a = new Associate();
        a.setId(UUID.randomUUID());
        a.setTenantId(tenantId);
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

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && mvn -q test -Dtest=AssociateRepositoryTest`
Expected: FAIL — `Associate`, `AssociateRepository`, `RankTier` classes don't exist yet (compile error).

- [ ] **Step 4: Write the entity/enum classes**

```java
// backend/src/main/java/com/plotchain/rank/RankTier.java
package com.plotchain.rank;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "rank_tier")
public class RankTier {
    @Id
    private UUID id;
    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;
    private String name;
    @Column(name = "rank_order")
    private int rankOrder;
    @Column(name = "volume_threshold")
    private BigDecimal volumeThreshold;

    protected RankTier() {}

    public RankTier(UUID id, UUID tenantId, String name, int rankOrder, BigDecimal volumeThreshold) {
        this.id = id;
        this.tenantId = tenantId;
        this.name = name;
        this.rankOrder = rankOrder;
        this.volumeThreshold = volumeThreshold;
    }

    public UUID getId() { return id; }
    public UUID getTenantId() { return tenantId; }
    public String getName() { return name; }
    public int getRankOrder() { return rankOrder; }
    public BigDecimal getVolumeThreshold() { return volumeThreshold; }
}
```

```java
// backend/src/main/java/com/plotchain/rank/RankTierRepository.java
package com.plotchain.rank;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface RankTierRepository extends JpaRepository<RankTier, UUID> {
    List<RankTier> findByTenantIdOrderByRankOrder(UUID tenantId);
}
```

```java
// backend/src/main/java/com/plotchain/associate/KycStatus.java
package com.plotchain.associate;

public enum KycStatus { PENDING, VERIFIED, REJECTED }
```

```java
// backend/src/main/java/com/plotchain/associate/Associate.java
package com.plotchain.associate;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "associate")
public class Associate {
    @Id
    private UUID id;
    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;
    @Column(name = "sponsor_id")
    private UUID sponsorId;
    @Column(name = "parent_id")
    private UUID parentId;
    private String position;
    private String name;
    @Column(name = "rank_id", nullable = false)
    private UUID rankId;
    @Enumerated(EnumType.STRING)
    @Column(name = "kyc_status", nullable = false)
    private KycStatus kycStatus;
    @Column(name = "joined_at", nullable = false)
    private Instant joinedAt;
    @Column(name = "cumulative_matched_volume", nullable = false)
    private BigDecimal cumulativeMatchedVolume = BigDecimal.ZERO;
    @Column(name = "last_active_at")
    private Instant lastActiveAt;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getTenantId() { return tenantId; }
    public void setTenantId(UUID tenantId) { this.tenantId = tenantId; }
    public UUID getSponsorId() { return sponsorId; }
    public void setSponsorId(UUID sponsorId) { this.sponsorId = sponsorId; }
    public UUID getParentId() { return parentId; }
    public void setParentId(UUID parentId) { this.parentId = parentId; }
    public String getPosition() { return position; }
    public void setPosition(String position) { this.position = position; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public UUID getRankId() { return rankId; }
    public void setRankId(UUID rankId) { this.rankId = rankId; }
    public KycStatus getKycStatus() { return kycStatus; }
    public void setKycStatus(KycStatus kycStatus) { this.kycStatus = kycStatus; }
    public Instant getJoinedAt() { return joinedAt; }
    public void setJoinedAt(Instant joinedAt) { this.joinedAt = joinedAt; }
    public BigDecimal getCumulativeMatchedVolume() { return cumulativeMatchedVolume; }
    public void setCumulativeMatchedVolume(BigDecimal v) { this.cumulativeMatchedVolume = v; }
    public Instant getLastActiveAt() { return lastActiveAt; }
    public void setLastActiveAt(Instant lastActiveAt) { this.lastActiveAt = lastActiveAt; }
}
```

```java
// backend/src/main/java/com/plotchain/associate/AssociateRepository.java
package com.plotchain.associate;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.UUID;

public interface AssociateRepository extends JpaRepository<Associate, UUID> {

    @Query(value = """
        WITH RECURSIVE downline AS (
            SELECT id FROM associate WHERE parent_id = :associateId
            UNION ALL
            SELECT a.id FROM associate a JOIN downline d ON a.parent_id = d.id
        )
        SELECT count(*) FROM downline
        """, nativeQuery = true)
    long countDownline(@Param("associateId") UUID associateId);

    @Query(value = """
        WITH RECURSIVE downline AS (
            SELECT id FROM associate WHERE parent_id = :associateId
            UNION ALL
            SELECT a.id FROM associate a JOIN downline d ON a.parent_id = d.id
        )
        SELECT count(*) FROM downline dl JOIN associate a2 ON a2.id = dl.id
        WHERE a2.last_active_at >= :sinceDate
        """, nativeQuery = true)
    long countActiveToday(@Param("associateId") UUID associateId, @Param("sinceDate") LocalDate sinceDate);

    @Query(value = """
        WITH RECURSIVE downline AS (
            SELECT id FROM associate WHERE parent_id = :associateId
            UNION ALL
            SELECT a.id FROM associate a JOIN downline d ON a.parent_id = d.id
        )
        SELECT count(*) FROM downline dl JOIN associate a2 ON a2.id = dl.id
        WHERE a2.joined_at BETWEEN :start AND :end
        """, nativeQuery = true)
    long countJoinedBetween(@Param("associateId") UUID associateId, @Param("start") LocalDate start, @Param("end") LocalDate end);
}
```

```java
// backend/src/main/java/com/plotchain/associate/AssociateNotFoundException.java
package com.plotchain.associate;

import java.util.UUID;

public class AssociateNotFoundException extends RuntimeException {
    public AssociateNotFoundException(UUID associateId) {
        super("Associate not found: " + associateId);
    }
}
```

```java
// backend/src/main/java/com/plotchain/cycle/CycleStatus.java
package com.plotchain.cycle;

public enum CycleStatus { OPEN, CALCULATING, CLOSED, PAID }
```

```java
// backend/src/main/java/com/plotchain/cycle/Cycle.java
package com.plotchain.cycle;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "cycle")
public class Cycle {
    @Id
    private UUID id;
    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;
    @Column(name = "period_start", nullable = false)
    private LocalDate periodStart;
    @Column(name = "period_end", nullable = false)
    private LocalDate periodEnd;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private CycleStatus status;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getTenantId() { return tenantId; }
    public void setTenantId(UUID tenantId) { this.tenantId = tenantId; }
    public LocalDate getPeriodStart() { return periodStart; }
    public void setPeriodStart(LocalDate periodStart) { this.periodStart = periodStart; }
    public LocalDate getPeriodEnd() { return periodEnd; }
    public void setPeriodEnd(LocalDate periodEnd) { this.periodEnd = periodEnd; }
    public CycleStatus getStatus() { return status; }
    public void setStatus(CycleStatus status) { this.status = status; }
}
```

```java
// backend/src/main/java/com/plotchain/cycle/CycleRepository.java
package com.plotchain.cycle;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface CycleRepository extends JpaRepository<Cycle, UUID> {
    Optional<Cycle> findFirstByTenantIdAndStatusOrderByPeriodStartDesc(UUID tenantId, CycleStatus status);
}
```

```java
// backend/src/main/java/com/plotchain/cycle/NoOpenCycleException.java
package com.plotchain.cycle;

import java.util.UUID;

public class NoOpenCycleException extends RuntimeException {
    public NoOpenCycleException(UUID tenantId) {
        super("No open cycle for tenant: " + tenantId);
    }
}
```

```java
// backend/src/main/java/com/plotchain/income/IncomeType.java
package com.plotchain.income;

public enum IncomeType { DIRECT, MATCHING, SPONSOR_MATCHING, ROYALTY, REWARD, PERK }
```

```java
// backend/src/main/java/com/plotchain/income/LedgerEntryStatus.java
package com.plotchain.income;

public enum LedgerEntryStatus { PENDING, CARRIED_FORWARD, PAID, REVERSED }
```

```java
// backend/src/main/java/com/plotchain/income/LedgerEntry.java
package com.plotchain.income;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "ledger_entry")
public class LedgerEntry {
    @Id
    private UUID id;
    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;
    @Column(name = "associate_id", nullable = false)
    private UUID associateId;
    @Enumerated(EnumType.STRING)
    @Column(name = "income_type", nullable = false)
    private IncomeType incomeType;
    @Column(name = "cycle_id", nullable = false)
    private UUID cycleId;
    @Column(name = "gross_amount", nullable = false)
    private BigDecimal grossAmount;
    @Column(name = "tds_deduction", nullable = false)
    private BigDecimal tdsDeduction;
    @Column(name = "admin_deduction", nullable = false)
    private BigDecimal adminDeduction;
    @Column(name = "net_amount", nullable = false)
    private BigDecimal netAmount;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private LedgerEntryStatus status;
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getTenantId() { return tenantId; }
    public void setTenantId(UUID tenantId) { this.tenantId = tenantId; }
    public UUID getAssociateId() { return associateId; }
    public void setAssociateId(UUID associateId) { this.associateId = associateId; }
    public IncomeType getIncomeType() { return incomeType; }
    public void setIncomeType(IncomeType incomeType) { this.incomeType = incomeType; }
    public UUID getCycleId() { return cycleId; }
    public void setCycleId(UUID cycleId) { this.cycleId = cycleId; }
    public BigDecimal getGrossAmount() { return grossAmount; }
    public void setGrossAmount(BigDecimal grossAmount) { this.grossAmount = grossAmount; }
    public BigDecimal getTdsDeduction() { return tdsDeduction; }
    public void setTdsDeduction(BigDecimal tdsDeduction) { this.tdsDeduction = tdsDeduction; }
    public BigDecimal getAdminDeduction() { return adminDeduction; }
    public void setAdminDeduction(BigDecimal adminDeduction) { this.adminDeduction = adminDeduction; }
    public BigDecimal getNetAmount() { return netAmount; }
    public void setNetAmount(BigDecimal netAmount) { this.netAmount = netAmount; }
    public LedgerEntryStatus getStatus() { return status; }
    public void setStatus(LedgerEntryStatus status) { this.status = status; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
```

```java
// backend/src/main/java/com/plotchain/income/LedgerEntryRepository.java
package com.plotchain.income;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.UUID;

public interface LedgerEntryRepository extends JpaRepository<LedgerEntry, UUID> {

    @Query("SELECT COALESCE(SUM(l.netAmount), 0) FROM LedgerEntry l WHERE l.associateId = :associateId AND l.cycleId = :cycleId AND l.incomeType = :type")
    BigDecimal sumNetAmountByAssociateCycleAndType(@Param("associateId") UUID associateId, @Param("cycleId") UUID cycleId, @Param("type") IncomeType type);

    @Query("SELECT COALESCE(SUM(l.netAmount), 0) FROM LedgerEntry l WHERE l.associateId = :associateId AND l.cycleId = :cycleId")
    BigDecimal sumNetAmountByAssociateAndCycle(@Param("associateId") UUID associateId, @Param("cycleId") UUID cycleId);
}
```

```java
// backend/src/main/java/com/plotchain/legvolume/LegVolume.java
package com.plotchain.legvolume;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "leg_volume")
public class LegVolume {
    @Id
    private UUID id;
    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;
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

    public static LegVolume empty(UUID associateId, UUID cycleId, UUID tenantId) {
        LegVolume lv = new LegVolume();
        lv.id = UUID.randomUUID();
        lv.tenantId = tenantId;
        lv.associateId = associateId;
        lv.cycleId = cycleId;
        return lv;
    }

    public UUID getId() { return id; }
    public UUID getTenantId() { return tenantId; }
    public UUID getAssociateId() { return associateId; }
    public UUID getCycleId() { return cycleId; }
    public BigDecimal getLeftLegVolume() { return leftLegVolume; }
    public BigDecimal getRightLegVolume() { return rightLegVolume; }
    public BigDecimal getCarriedForwardLeft() { return carriedForwardLeft; }
    public BigDecimal getCarriedForwardRight() { return carriedForwardRight; }
}
```

```java
// backend/src/main/java/com/plotchain/legvolume/LegVolumeRepository.java
package com.plotchain.legvolume;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface LegVolumeRepository extends JpaRepository<LegVolume, UUID> {
    Optional<LegVolume> findByAssociateIdAndCycleId(UUID associateId, UUID cycleId);
}
```

```java
// backend/src/main/java/com/plotchain/wallet/Wallet.java
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
    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;
    @Column(nullable = false)
    private BigDecimal balance = BigDecimal.ZERO;

    public static Wallet zero(UUID associateId, UUID tenantId) {
        Wallet w = new Wallet();
        w.associateId = associateId;
        w.tenantId = tenantId;
        return w;
    }

    public UUID getAssociateId() { return associateId; }
    public UUID getTenantId() { return tenantId; }
    public BigDecimal getBalance() { return balance; }
}
```

```java
// backend/src/main/java/com/plotchain/wallet/WalletRepository.java
package com.plotchain.wallet;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface WalletRepository extends JpaRepository<Wallet, UUID> {
}
```

```java
// backend/src/main/java/com/plotchain/announcement/Announcement.java
package com.plotchain.announcement;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "announcement")
public class Announcement {
    @Id
    private UUID id;
    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;
    private String title;
    private String body;
    @Column(name = "published_at", nullable = false)
    private Instant publishedAt;
    private String audience;

    public UUID getId() { return id; }
    public UUID getTenantId() { return tenantId; }
    public String getTitle() { return title; }
    public String getBody() { return body; }
    public Instant getPublishedAt() { return publishedAt; }
    public String getAudience() { return audience; }
}
```

```java
// backend/src/main/java/com/plotchain/announcement/AnnouncementRepository.java
package com.plotchain.announcement;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface AnnouncementRepository extends JpaRepository<Announcement, UUID> {
    List<Announcement> findTop5ByTenantIdOrderByPublishedAtDesc(UUID tenantId);
}
```

- [ ] **Step 5: Simplify the test's RankTier persistence** (the initial draft above referenced an unused field; fix it to actually persist the rank via `TestEntityManager`)

```java
// replace the test body's rank handling in AssociateRepositoryTest with:
@Autowired
org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager entityManager;

@Test
void countDownlineCountsAllDescendantsRegardlessOfDepth() {
    UUID tenantId = UUID.randomUUID();
    RankTier rank = new RankTier(UUID.randomUUID(), tenantId, "Sales Associate", 1, BigDecimal.valueOf(10000));
    entityManager.persist(rank);

    Associate root = newAssociate(tenantId, null, null, rank.getId());
    Associate child = newAssociate(tenantId, root.getId(), "L", rank.getId());
    Associate grandchild = newAssociate(tenantId, child.getId(), "L", rank.getId());
    associateRepository.saveAll(java.util.List.of(root, child, grandchild));
    entityManager.flush();

    long count = associateRepository.countDownline(root.getId());

    assertThat(count).isEqualTo(2);
}
```

Remove the earlier unused `SpringExtension` field from the test class.

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && mvn -q test -Dtest=AssociateRepositoryTest`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/resources/db/migration/V1__create_dashboard_tables.sql backend/src/main/java/com/plotchain/rank backend/src/main/java/com/plotchain/associate backend/src/main/java/com/plotchain/cycle backend/src/main/java/com/plotchain/income backend/src/main/java/com/plotchain/legvolume backend/src/main/java/com/plotchain/wallet backend/src/main/java/com/plotchain/announcement backend/src/test/java/com/plotchain/associate/AssociateRepositoryTest.java
git commit -m "feat: add dashboard domain entities, schema migration, and downline query"
```

---

### Task 3: DashboardResponse DTO and DashboardService aggregation

**Files:**
- Create: `backend/src/main/java/com/plotchain/dashboard/DashboardResponse.java`
- Create: `backend/src/main/java/com/plotchain/dashboard/DashboardService.java`
- Test: `backend/src/test/java/com/plotchain/dashboard/DashboardServiceTest.java`

**Interfaces:**
- Consumes: `AssociateRepository`, `RankTierRepository`, `CycleRepository`, `LedgerEntryRepository`, `LegVolumeRepository`, `WalletRepository`, `AnnouncementRepository` (Task 2).
- Produces: `DashboardService.getDashboard(UUID associateId): DashboardResponse`, consumed by Task 4's `DashboardController`.

- [ ] **Step 1: Write the failing unit test**

```java
package com.plotchain.dashboard;

import com.plotchain.announcement.AnnouncementRepository;
import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.KycStatus;
import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleRepository;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.income.IncomeType;
import com.plotchain.income.LedgerEntryRepository;
import com.plotchain.legvolume.LegVolume;
import com.plotchain.legvolume.LegVolumeRepository;
import com.plotchain.rank.RankTier;
import com.plotchain.rank.RankTierRepository;
import com.plotchain.wallet.Wallet;
import com.plotchain.wallet.WalletRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
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
    @Mock AnnouncementRepository announcementRepository;

    @InjectMocks
    DashboardService dashboardService;

    @Test
    void aggregatesAllDashboardWidgetsForAnAssociate() {
        UUID tenantId = UUID.randomUUID();
        UUID associateId = UUID.randomUUID();
        UUID cycleId = UUID.randomUUID();
        UUID currentRankId = UUID.randomUUID();
        UUID nextRankId = UUID.randomUUID();

        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setTenantId(tenantId);
        associate.setRankId(currentRankId);
        associate.setKycStatus(KycStatus.PENDING);
        associate.setCumulativeMatchedVolume(BigDecimal.valueOf(4000));

        Cycle cycle = new Cycle();
        cycle.setId(cycleId);
        cycle.setTenantId(tenantId);
        cycle.setStatus(CycleStatus.OPEN);
        cycle.setPeriodStart(LocalDate.now().minusDays(5));
        cycle.setPeriodEnd(LocalDate.now().plusDays(10));

        RankTier currentRank = new RankTier(currentRankId, tenantId, "Sales Associate", 1, BigDecimal.valueOf(5000));
        RankTier nextRank = new RankTier(nextRankId, tenantId, "Sales Executive", 2, BigDecimal.valueOf(10000));

        LegVolume legVolume = LegVolume.empty(associateId, cycleId, tenantId);

        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));
        when(cycleRepository.findFirstByTenantIdAndStatusOrderByPeriodStartDesc(tenantId, CycleStatus.OPEN))
            .thenReturn(Optional.of(cycle));
        when(ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(associateId, cycleId, IncomeType.DIRECT))
            .thenReturn(BigDecimal.valueOf(1000));
        when(ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(associateId, cycleId, IncomeType.MATCHING))
            .thenReturn(BigDecimal.valueOf(500));
        when(ledgerEntryRepository.sumNetAmountByAssociateAndCycle(associateId, cycleId))
            .thenReturn(BigDecimal.valueOf(1500));
        when(legVolumeRepository.findByAssociateIdAndCycleId(associateId, cycleId))
            .thenReturn(Optional.of(legVolume));
        when(walletRepository.findById(associateId)).thenReturn(Optional.of(Wallet.zero(associateId, tenantId)));
        when(rankTierRepository.findByTenantIdOrderByRankOrder(tenantId))
            .thenReturn(List.of(currentRank, nextRank));
        when(associateRepository.countDownline(associateId)).thenReturn(12L);
        when(associateRepository.countActiveToday(any(), any())).thenReturn(3L);
        when(associateRepository.countJoinedBetween(any(), any(), any())).thenReturn(2L);
        when(announcementRepository.findTop5ByTenantIdOrderByPublishedAtDesc(tenantId)).thenReturn(List.of());

        DashboardResponse response = dashboardService.getDashboard(associateId);

        assertThat(response.kycPendingBannerVisible()).isTrue();
        assertThat(response.cycleIncome().directIncome()).isEqualByComparingTo("1000");
        assertThat(response.cycleIncome().matchingIncome()).isEqualByComparingTo("500");
        assertThat(response.cycleIncome().totalIncome()).isEqualByComparingTo("1500");
        assertThat(response.rankProgress().currentRank()).isEqualTo("Sales Associate");
        assertThat(response.rankProgress().nextRank()).isEqualTo("Sales Executive");
        assertThat(response.rankProgress().progressPercent()).isEqualTo(40);
        assertThat(response.teamSnapshot().totalDownline()).isEqualTo(12L);
        assertThat(response.teamSnapshot().activeToday()).isEqualTo(3L);
        assertThat(response.teamSnapshot().newJoinsThisCycle()).isEqualTo(2L);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && mvn -q test -Dtest=DashboardServiceTest`
Expected: FAIL — `DashboardResponse` and `DashboardService` don't exist.

- [ ] **Step 3: Write `DashboardResponse.java`**

```java
package com.plotchain.dashboard;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record DashboardResponse(
    boolean kycPendingBannerVisible,
    CycleIncome cycleIncome,
    WalletSummary wallet,
    LegVolumeSummary legVolume,
    RankProgress rankProgress,
    TeamSnapshot teamSnapshot,
    CycleCountdown cycleCountdown,
    List<AnnouncementSummary> announcements
) {
    public record CycleIncome(UUID cycleId, BigDecimal directIncome, BigDecimal matchingIncome, BigDecimal totalIncome) {}
    public record WalletSummary(BigDecimal balance) {}
    public record LegVolumeSummary(BigDecimal leftVolume, BigDecimal rightVolume, BigDecimal carriedForwardLeft, BigDecimal carriedForwardRight, BigDecimal projectedMatchAmount) {}
    public record RankProgress(String currentRank, int currentRankOrder, String nextRank, int progressPercent, BigDecimal volumeToNextRank) {}
    public record TeamSnapshot(long totalDownline, long activeToday, long newJoinsThisCycle) {}
    public record CycleCountdown(UUID cycleId, long daysRemaining) {}
    public record AnnouncementSummary(UUID id, String title, Instant publishedAt) {}
}
```

- [ ] **Step 4: Write `DashboardService.java`**

```java
package com.plotchain.dashboard;

import com.plotchain.announcement.Announcement;
import com.plotchain.announcement.AnnouncementRepository;
import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.KycStatus;
import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleRepository;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.cycle.NoOpenCycleException;
import com.plotchain.income.IncomeType;
import com.plotchain.income.LedgerEntryRepository;
import com.plotchain.legvolume.LegVolume;
import com.plotchain.legvolume.LegVolumeRepository;
import com.plotchain.rank.RankTier;
import com.plotchain.rank.RankTierRepository;
import com.plotchain.wallet.Wallet;
import com.plotchain.wallet.WalletRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
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
    private final AnnouncementRepository announcementRepository;
    private final BigDecimal previewMatchingRate;

    public DashboardService(
        AssociateRepository associateRepository,
        RankTierRepository rankTierRepository,
        CycleRepository cycleRepository,
        LedgerEntryRepository ledgerEntryRepository,
        LegVolumeRepository legVolumeRepository,
        WalletRepository walletRepository,
        AnnouncementRepository announcementRepository,
        @Value("${compensation.preview-matching-rate}") BigDecimal previewMatchingRate
    ) {
        this.associateRepository = associateRepository;
        this.rankTierRepository = rankTierRepository;
        this.cycleRepository = cycleRepository;
        this.ledgerEntryRepository = ledgerEntryRepository;
        this.legVolumeRepository = legVolumeRepository;
        this.walletRepository = walletRepository;
        this.announcementRepository = announcementRepository;
        this.previewMatchingRate = previewMatchingRate;
    }

    public DashboardResponse getDashboard(UUID associateId) {
        Associate associate = associateRepository.findById(associateId)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));

        Cycle cycle = cycleRepository.findFirstByTenantIdAndStatusOrderByPeriodStartDesc(associate.getTenantId(), CycleStatus.OPEN)
            .orElseThrow(() -> new NoOpenCycleException(associate.getTenantId()));

        BigDecimal direct = ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(associateId, cycle.getId(), IncomeType.DIRECT);
        BigDecimal matching = ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(associateId, cycle.getId(), IncomeType.MATCHING);
        BigDecimal total = ledgerEntryRepository.sumNetAmountByAssociateAndCycle(associateId, cycle.getId());

        LegVolume legVolume = legVolumeRepository.findByAssociateIdAndCycleId(associateId, cycle.getId())
            .orElseGet(() -> LegVolume.empty(associateId, cycle.getId(), associate.getTenantId()));
        BigDecimal projectedMatch = legVolume.getLeftLegVolume()
            .min(legVolume.getRightLegVolume())
            .multiply(previewMatchingRate);

        Wallet wallet = walletRepository.findById(associateId)
            .orElseGet(() -> Wallet.zero(associateId, associate.getTenantId()));

        List<RankTier> ranks = rankTierRepository.findByTenantIdOrderByRankOrder(associate.getTenantId());
        RankTier currentRank = ranks.stream()
            .filter(r -> r.getId().equals(associate.getRankId()))
            .findFirst()
            .orElseThrow(() -> new IllegalStateException("Associate's rank not found in tenant's rank table: " + associate.getRankId()));
        Optional<RankTier> nextRank = ranks.stream()
            .filter(r -> r.getRankOrder() == currentRank.getRankOrder() + 1)
            .findFirst();

        int progressPercent = nextRank
            .map(nr -> associate.getCumulativeMatchedVolume()
                .multiply(BigDecimal.valueOf(100))
                .divide(nr.getVolumeThreshold(), 0, RoundingMode.DOWN)
                .min(BigDecimal.valueOf(100))
                .intValue())
            .orElse(100);
        BigDecimal volumeToNextRank = nextRank
            .map(nr -> nr.getVolumeThreshold().subtract(associate.getCumulativeMatchedVolume()).max(BigDecimal.ZERO))
            .orElse(BigDecimal.ZERO);

        long totalDownline = associateRepository.countDownline(associateId);
        long activeToday = associateRepository.countActiveToday(associateId, LocalDate.now());
        long newJoins = associateRepository.countJoinedBetween(associateId, cycle.getPeriodStart(), cycle.getPeriodEnd());

        long daysRemaining = Math.max(0, ChronoUnit.DAYS.between(LocalDate.now(), cycle.getPeriodEnd()));

        List<Announcement> announcements = announcementRepository.findTop5ByTenantIdOrderByPublishedAtDesc(associate.getTenantId());

        return new DashboardResponse(
            associate.getKycStatus() != KycStatus.VERIFIED,
            new DashboardResponse.CycleIncome(cycle.getId(), direct, matching, total),
            new DashboardResponse.WalletSummary(wallet.getBalance()),
            new DashboardResponse.LegVolumeSummary(
                legVolume.getLeftLegVolume(), legVolume.getRightLegVolume(),
                legVolume.getCarriedForwardLeft(), legVolume.getCarriedForwardRight(),
                projectedMatch),
            new DashboardResponse.RankProgress(
                currentRank.getName(), currentRank.getRankOrder(),
                nextRank.map(RankTier::getName).orElse(null),
                progressPercent, volumeToNextRank),
            new DashboardResponse.TeamSnapshot(totalDownline, activeToday, newJoins),
            new DashboardResponse.CycleCountdown(cycle.getId(), daysRemaining),
            announcements.stream()
                .map(a -> new DashboardResponse.AnnouncementSummary(a.getId(), a.getTitle(), a.getPublishedAt()))
                .toList()
        );
    }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && mvn -q test -Dtest=DashboardServiceTest`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/plotchain/dashboard/DashboardResponse.java backend/src/main/java/com/plotchain/dashboard/DashboardService.java backend/src/test/java/com/plotchain/dashboard/DashboardServiceTest.java
git commit -m "feat: aggregate dashboard data into DashboardService"
```

---

### Task 4: DashboardController REST endpoint

**Files:**
- Create: `backend/src/main/java/com/plotchain/dashboard/DashboardController.java`
- Create: `backend/src/main/java/com/plotchain/dashboard/DashboardExceptionHandler.java`
- Test: `backend/src/test/java/com/plotchain/dashboard/DashboardControllerTest.java`

**Interfaces:**
- Consumes: `DashboardService.getDashboard(UUID): DashboardResponse` (Task 3).
- Produces: `GET /api/associates/{associateId}/dashboard` returning `DashboardResponse` as JSON (200) or `{"error": "..."}` (404), consumed by Task 6's Angular `DashboardService`.

- [ ] **Step 1: Write the failing integration test**

```java
package com.plotchain.dashboard;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class DashboardControllerTest {

    @Autowired MockMvc mockMvc;
    @MockBean DashboardService dashboardService;

    @Test
    void returnsDashboardJsonForKnownAssociate() throws Exception {
        UUID associateId = UUID.randomUUID();
        UUID cycleId = UUID.randomUUID();
        DashboardResponse response = new DashboardResponse(
            true,
            new DashboardResponse.CycleIncome(cycleId, BigDecimal.valueOf(1000), BigDecimal.valueOf(500), BigDecimal.valueOf(1500)),
            new DashboardResponse.WalletSummary(BigDecimal.valueOf(2500)),
            new DashboardResponse.LegVolumeSummary(BigDecimal.valueOf(3000), BigDecimal.valueOf(2000), BigDecimal.ZERO, BigDecimal.valueOf(1000), BigDecimal.valueOf(140)),
            new DashboardResponse.RankProgress("Sales Associate", 1, "Sales Executive", 40, BigDecimal.valueOf(6000)),
            new DashboardResponse.TeamSnapshot(12, 3, 2),
            new DashboardResponse.CycleCountdown(cycleId, 10),
            List.of()
        );
        when(dashboardService.getDashboard(associateId)).thenReturn(response);

        mockMvc.perform(get("/api/associates/{associateId}/dashboard", associateId))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.kycPendingBannerVisible").value(true))
            .andExpect(jsonPath("$.cycleIncome.directIncome").value(1000))
            .andExpect(jsonPath("$.teamSnapshot.totalDownline").value(12));
    }

    @Test
    void returns404WhenAssociateNotFound() throws Exception {
        UUID associateId = UUID.randomUUID();
        when(dashboardService.getDashboard(associateId))
            .thenThrow(new com.plotchain.associate.AssociateNotFoundException(associateId));

        mockMvc.perform(get("/api/associates/{associateId}/dashboard", associateId))
            .andExpect(status().isNotFound());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && mvn -q test -Dtest=DashboardControllerTest`
Expected: FAIL — `DashboardController` doesn't exist / no mapping for the route.

- [ ] **Step 3: Write `DashboardController.java`**

```java
package com.plotchain.dashboard;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
public class DashboardController {

    private final DashboardService dashboardService;

    public DashboardController(DashboardService dashboardService) {
        this.dashboardService = dashboardService;
    }

    @GetMapping("/api/associates/{associateId}/dashboard")
    public DashboardResponse getDashboard(@PathVariable UUID associateId) {
        return dashboardService.getDashboard(associateId);
    }
}
```

- [ ] **Step 4: Write `DashboardExceptionHandler.java`**

```java
package com.plotchain.dashboard;

import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.cycle.NoOpenCycleException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

@RestControllerAdvice
public class DashboardExceptionHandler {

    @ExceptionHandler(AssociateNotFoundException.class)
    public ResponseEntity<Map<String, String>> handleAssociateNotFound(AssociateNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(NoOpenCycleException.class)
    public ResponseEntity<Map<String, String>> handleNoOpenCycle(NoOpenCycleException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && mvn -q test -Dtest=DashboardControllerTest`
Expected: PASS

- [ ] **Step 6: Run the full backend test suite**

Run: `cd backend && mvn -q test`
Expected: PASS (all tests from Tasks 1-4)

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/plotchain/dashboard/DashboardController.java backend/src/main/java/com/plotchain/dashboard/DashboardExceptionHandler.java backend/src/test/java/com/plotchain/dashboard/DashboardControllerTest.java
git commit -m "feat: expose GET /api/associates/{id}/dashboard endpoint"
```

---

### Task 5: Angular project scaffold, i18n, models, and DashboardService

**Files:**
- Create: `frontend/` (via Angular CLI)
- Create: `frontend/src/assets/i18n/en.json`
- Create: `frontend/src/assets/i18n/hi.json`
- Create: `frontend/src/app/dashboard/models/dashboard-response.model.ts`
- Create: `frontend/src/app/dashboard/dashboard.service.ts`
- Test: `frontend/src/app/dashboard/dashboard.service.spec.ts`

**Interfaces:**
- Consumes: `GET /api/associates/{associateId}/dashboard` (Task 4).
- Produces: `DashboardService.getDashboard(associateId: string): Observable<DashboardResponse>` and the `DashboardResponse` TS types, consumed by Tasks 6-15's widgets and Task 16's `DashboardComponent`.

- [ ] **Step 1: Scaffold the Angular workspace**

Run: `npx -p @angular/cli@18 ng new frontend --standalone --routing --style=scss --skip-git`
Then: `cd frontend && npm install @ngx-translate/core@15 @ngx-translate/http-loader@8`

- [ ] **Step 2: Wire `TranslateModule` into `app.config.ts`**

```typescript
// frontend/src/app/app.config.ts
import { ApplicationConfig, importProvidersFrom } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpClient } from '@angular/common/http';
import { TranslateModule, TranslateLoader } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';
import { routes } from './app.routes';

export function httpLoaderFactory(http: HttpClient) {
  return new TranslateHttpLoader(http, '/assets/i18n/', '.json');
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(),
    importProvidersFrom(
      TranslateModule.forRoot({
        defaultLanguage: 'en',
        loader: { provide: TranslateLoader, useFactory: httpLoaderFactory, deps: [HttpClient] }
      })
    )
  ]
};
```

- [ ] **Step 3: Write initial translation files**

```json
// frontend/src/assets/i18n/en.json
{
  "dashboard": {
    "kycBanner": "Complete your KYC verification to unlock payouts.",
    "direct": "Direct",
    "matching": "Matching",
    "total": "Total",
    "withdraw": "Withdraw",
    "projectedMatch": "Will match at cycle close",
    "nextRank": "Next rank",
    "recordSale": "+ Record Sale",
    "addReferral": "+ Add Referral",
    "cycleCloses": "Cycle closes in {{days}} days"
  }
}
```

```json
// frontend/src/assets/i18n/hi.json
{
  "dashboard": {
    "kycBanner": "भुगतान पाने के लिए अपना केवाईसी सत्यापन पूरा करें।",
    "direct": "प्रत्यक्ष",
    "matching": "मैचिंग",
    "total": "कुल",
    "withdraw": "निकासी",
    "projectedMatch": "साइकिल बंद होने पर मिलान होगा",
    "nextRank": "अगला रैंक",
    "recordSale": "+ बिक्री दर्ज करें",
    "addReferral": "+ रेफरल जोड़ें",
    "cycleCloses": "साइकिल {{days}} दिनों में बंद होगी"
  }
}
```

- [ ] **Step 4: Write `dashboard-response.model.ts`**

```typescript
export interface CycleIncome {
  cycleId: string;
  directIncome: number;
  matchingIncome: number;
  totalIncome: number;
}

export interface WalletSummary {
  balance: number;
}

export interface LegVolumeSummary {
  leftVolume: number;
  rightVolume: number;
  carriedForwardLeft: number;
  carriedForwardRight: number;
  projectedMatchAmount: number;
}

export interface RankProgress {
  currentRank: string;
  currentRankOrder: number;
  nextRank: string | null;
  progressPercent: number;
  volumeToNextRank: number;
}

export interface TeamSnapshot {
  totalDownline: number;
  activeToday: number;
  newJoinsThisCycle: number;
}

export interface CycleCountdown {
  cycleId: string;
  daysRemaining: number;
}

export interface AnnouncementSummary {
  id: string;
  title: string;
  publishedAt: string;
}

export interface DashboardResponse {
  kycPendingBannerVisible: boolean;
  cycleIncome: CycleIncome;
  wallet: WalletSummary;
  legVolume: LegVolumeSummary;
  rankProgress: RankProgress;
  teamSnapshot: TeamSnapshot;
  cycleCountdown: CycleCountdown;
  announcements: AnnouncementSummary[];
}
```

- [ ] **Step 5: Write the failing service test**

```typescript
// frontend/src/app/dashboard/dashboard.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { DashboardService } from './dashboard.service';
import { DashboardResponse } from './models/dashboard-response.model';

describe('DashboardService', () => {
  let service: DashboardService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [DashboardService]
    });
    service = TestBed.inject(DashboardService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('fetches the dashboard for a given associate id', () => {
    const associateId = 'associate-123';
    const mockResponse: Partial<DashboardResponse> = { kycPendingBannerVisible: false };

    service.getDashboard(associateId).subscribe(res => {
      expect(res.kycPendingBannerVisible).toBeFalse();
    });

    const req = httpMock.expectOne(`/api/associates/${associateId}/dashboard`);
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/dashboard.service.spec.ts'`
Expected: FAIL — `DashboardService` doesn't exist.

- [ ] **Step 7: Write `dashboard.service.ts`**

```typescript
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { DashboardResponse } from './models/dashboard-response.model';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  constructor(private http: HttpClient) {}

  getDashboard(associateId: string): Observable<DashboardResponse> {
    return this.http.get<DashboardResponse>(`/api/associates/${associateId}/dashboard`);
  }
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/dashboard.service.spec.ts'`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add frontend
git commit -m "feat: scaffold Angular frontend with i18n and DashboardService"
```

---

### Task 6: KycBannerComponent

**Files:**
- Create: `frontend/src/app/dashboard/widgets/kyc-banner/kyc-banner.component.ts`
- Test: `frontend/src/app/dashboard/widgets/kyc-banner/kyc-banner.component.spec.ts`

**Interfaces:**
- Consumes: nothing beyond `boolean`.
- Produces: `<app-kyc-banner [visible]="boolean">`, consumed by Task 16.

- [ ] **Step 1: Write the failing test**

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { KycBannerComponent } from './kyc-banner.component';

describe('KycBannerComponent', () => {
  let fixture: ComponentFixture<KycBannerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [KycBannerComponent, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(KycBannerComponent);
  });

  it('renders the banner when visible is true', () => {
    fixture.componentInstance.visible = true;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.kyc-banner')).toBeTruthy();
  });

  it('renders nothing when visible is false', () => {
    fixture.componentInstance.visible = false;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.kyc-banner')).toBeFalsy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/kyc-banner.component.spec.ts'`
Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Write `kyc-banner.component.ts`**

```typescript
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-kyc-banner',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `<div class="kyc-banner" *ngIf="visible">{{ 'dashboard.kycBanner' | translate }}</div>`
})
export class KycBannerComponent {
  @Input() visible = false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/kyc-banner.component.spec.ts'`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/dashboard/widgets/kyc-banner
git commit -m "feat: add KycBannerComponent"
```

---

### Task 7: CycleIncomeCardComponent

**Files:**
- Create: `frontend/src/app/dashboard/widgets/cycle-income-card/cycle-income-card.component.ts`
- Test: `frontend/src/app/dashboard/widgets/cycle-income-card/cycle-income-card.component.spec.ts`

**Interfaces:**
- Consumes: `CycleIncome` (Task 5).
- Produces: `<app-cycle-income-card [data]="CycleIncome">`, consumed by Task 16.

- [ ] **Step 1: Write the failing test**

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { CycleIncomeCardComponent } from './cycle-income-card.component';

describe('CycleIncomeCardComponent', () => {
  let fixture: ComponentFixture<CycleIncomeCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CycleIncomeCardComponent, RouterTestingModule, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(CycleIncomeCardComponent);
    fixture.componentInstance.data = { cycleId: 'c1', directIncome: 1000, matchingIncome: 500, totalIncome: 1500 };
    fixture.detectChanges();
  });

  it('renders direct, matching, and total income', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('1,000');
    expect(text).toContain('500');
    expect(text).toContain('1,500');
  });

  it('links to the income statement screen', () => {
    const link = fixture.nativeElement.querySelector('.cycle-income-card');
    expect(link.getAttribute('href')).toContain('/income-statement');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/cycle-income-card.component.spec.ts'`
Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Write `cycle-income-card.component.ts`**

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
    <a class="cycle-income-card" [routerLink]="['/income-statement']" [queryParams]="{ cycleId: data.cycleId }">
      <div class="direct">{{ 'dashboard.direct' | translate }}: {{ data.directIncome | currency:'INR' }}</div>
      <div class="matching">{{ 'dashboard.matching' | translate }}: {{ data.matchingIncome | currency:'INR' }}</div>
      <div class="total">{{ 'dashboard.total' | translate }}: {{ data.totalIncome | currency:'INR' }}</div>
    </a>
  `
})
export class CycleIncomeCardComponent {
  @Input({ required: true }) data!: CycleIncome;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/cycle-income-card.component.spec.ts'`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/dashboard/widgets/cycle-income-card
git commit -m "feat: add CycleIncomeCardComponent"
```

---

### Task 8: WalletCardComponent

**Files:**
- Create: `frontend/src/app/dashboard/widgets/wallet-card/wallet-card.component.ts`
- Test: `frontend/src/app/dashboard/widgets/wallet-card/wallet-card.component.spec.ts`

**Interfaces:**
- Consumes: `number` (wallet balance).
- Produces: `<app-wallet-card [balance]="number">`, consumed by Task 16.

- [ ] **Step 1: Write the failing test**

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { WalletCardComponent } from './wallet-card.component';

describe('WalletCardComponent', () => {
  let fixture: ComponentFixture<WalletCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WalletCardComponent, RouterTestingModule, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(WalletCardComponent);
    fixture.componentInstance.balance = 2500;
    fixture.detectChanges();
  });

  it('renders the withdrawable balance', () => {
    expect(fixture.nativeElement.textContent).toContain('2,500');
  });

  it('the withdraw action links to /wallet/withdraw', () => {
    const link = fixture.nativeElement.querySelector('.withdraw-action');
    expect(link.getAttribute('href')).toBe('/wallet/withdraw');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/wallet-card.component.spec.ts'`
Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Write `wallet-card.component.ts`**

```typescript
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-wallet-card',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslateModule],
  template: `
    <div class="wallet-card">
      <span class="balance">{{ balance | currency:'INR' }}</span>
      <a class="withdraw-action" [routerLink]="['/wallet/withdraw']">{{ 'dashboard.withdraw' | translate }}</a>
    </div>
  `
})
export class WalletCardComponent {
  @Input({ required: true }) balance!: number;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/wallet-card.component.spec.ts'`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/dashboard/widgets/wallet-card
git commit -m "feat: add WalletCardComponent"
```

---

### Task 9: LegVolumeGaugeComponent

**Files:**
- Create: `frontend/src/app/dashboard/widgets/leg-volume-gauge/leg-volume-gauge.component.ts`
- Test: `frontend/src/app/dashboard/widgets/leg-volume-gauge/leg-volume-gauge.component.spec.ts`

**Interfaces:**
- Consumes: `LegVolumeSummary` (Task 5).
- Produces: `<app-leg-volume-gauge [data]="LegVolumeSummary">`, consumed by Task 16.

- [ ] **Step 1: Write the failing test**

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { LegVolumeGaugeComponent } from './leg-volume-gauge.component';

describe('LegVolumeGaugeComponent', () => {
  let fixture: ComponentFixture<LegVolumeGaugeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LegVolumeGaugeComponent, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(LegVolumeGaugeComponent);
    fixture.componentInstance.data = {
      leftVolume: 3000, rightVolume: 2000,
      carriedForwardLeft: 0, carriedForwardRight: 1000,
      projectedMatchAmount: 140
    };
    fixture.detectChanges();
  });

  it('renders left and right leg volumes and the projected match amount', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('3,000');
    expect(text).toContain('2,000');
    expect(text).toContain('140');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/leg-volume-gauge.component.spec.ts'`
Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Write `leg-volume-gauge.component.ts`**

```typescript
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { LegVolumeSummary } from '../../models/dashboard-response.model';

@Component({
  selector: 'app-leg-volume-gauge',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="leg-volume-gauge">
      <div class="leg left" [style.flex]="data.leftVolume || 1">L: {{ data.leftVolume | currency:'INR' }}</div>
      <div class="leg right" [style.flex]="data.rightVolume || 1">R: {{ data.rightVolume | currency:'INR' }}</div>
      <div class="projected-match">{{ 'dashboard.projectedMatch' | translate }}: {{ data.projectedMatchAmount | currency:'INR' }}</div>
    </div>
  `
})
export class LegVolumeGaugeComponent {
  @Input({ required: true }) data!: LegVolumeSummary;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/leg-volume-gauge.component.spec.ts'`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/dashboard/widgets/leg-volume-gauge
git commit -m "feat: add LegVolumeGaugeComponent"
```

---

### Task 10: RankProgressComponent

**Files:**
- Create: `frontend/src/app/dashboard/widgets/rank-progress/rank-progress.component.ts`
- Test: `frontend/src/app/dashboard/widgets/rank-progress/rank-progress.component.spec.ts`

**Interfaces:**
- Consumes: `RankProgress` (Task 5).
- Produces: `<app-rank-progress [data]="RankProgress">`, consumed by Task 16.

- [ ] **Step 1: Write the failing test**

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { RankProgressComponent } from './rank-progress.component';

describe('RankProgressComponent', () => {
  let fixture: ComponentFixture<RankProgressComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RankProgressComponent, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(RankProgressComponent);
    fixture.componentInstance.data = {
      currentRank: 'Sales Associate', currentRankOrder: 1,
      nextRank: 'Sales Executive', progressPercent: 40, volumeToNextRank: 6000
    };
    fixture.detectChanges();
  });

  it('renders current rank and progress bar width', () => {
    expect(fixture.nativeElement.textContent).toContain('Sales Associate');
    const fill = fixture.nativeElement.querySelector('.progress-fill');
    expect(fill.style.width).toBe('40%');
  });

  it('renders the next rank name when present', () => {
    expect(fixture.nativeElement.textContent).toContain('Sales Executive');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/rank-progress.component.spec.ts'`
Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Write `rank-progress.component.ts`**

```typescript
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { RankProgress } from '../../models/dashboard-response.model';

@Component({
  selector: 'app-rank-progress',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="rank-progress">
      <div class="current-rank">{{ data.currentRank }}</div>
      <div class="progress-bar"><div class="progress-fill" [style.width.%]="data.progressPercent"></div></div>
      <div class="next-rank" *ngIf="data.nextRank">
        {{ 'dashboard.nextRank' | translate }}: {{ data.nextRank }} ({{ data.progressPercent }}%)
      </div>
    </div>
  `
})
export class RankProgressComponent {
  @Input({ required: true }) data!: RankProgress;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/rank-progress.component.spec.ts'`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/dashboard/widgets/rank-progress
git commit -m "feat: add RankProgressComponent"
```

---

### Task 11: TeamSnapshotComponent

**Files:**
- Create: `frontend/src/app/dashboard/widgets/team-snapshot/team-snapshot.component.ts`
- Test: `frontend/src/app/dashboard/widgets/team-snapshot/team-snapshot.component.spec.ts`

**Interfaces:**
- Consumes: `TeamSnapshot` (Task 5).
- Produces: `<app-team-snapshot [data]="TeamSnapshot">`, consumed by Task 16.

- [ ] **Step 1: Write the failing test**

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TeamSnapshotComponent } from './team-snapshot.component';

describe('TeamSnapshotComponent', () => {
  let fixture: ComponentFixture<TeamSnapshotComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TeamSnapshotComponent] }).compileComponents();
    fixture = TestBed.createComponent(TeamSnapshotComponent);
    fixture.componentInstance.data = { totalDownline: 12, activeToday: 3, newJoinsThisCycle: 2 };
    fixture.detectChanges();
  });

  it('renders downline size, active-today count, and new joins', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('12');
    expect(text).toContain('3');
    expect(text).toContain('2');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/team-snapshot.component.spec.ts'`
Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Write `team-snapshot.component.ts`**

```typescript
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TeamSnapshot } from '../../models/dashboard-response.model';

@Component({
  selector: 'app-team-snapshot',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="team-snapshot">
      <div class="total-downline">{{ data.totalDownline }}</div>
      <div class="active-today">{{ data.activeToday }}</div>
      <div class="new-joins">{{ data.newJoinsThisCycle }}</div>
    </div>
  `
})
export class TeamSnapshotComponent {
  @Input({ required: true }) data!: TeamSnapshot;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/team-snapshot.component.spec.ts'`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/dashboard/widgets/team-snapshot
git commit -m "feat: add TeamSnapshotComponent"
```

---

### Task 12: QuickActionsComponent

**Files:**
- Create: `frontend/src/app/dashboard/widgets/quick-actions/quick-actions.component.ts`
- Test: `frontend/src/app/dashboard/widgets/quick-actions/quick-actions.component.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `<app-quick-actions>`, consumed by Task 16.

- [ ] **Step 1: Write the failing test**

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { QuickActionsComponent } from './quick-actions.component';

describe('QuickActionsComponent', () => {
  let fixture: ComponentFixture<QuickActionsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QuickActionsComponent, RouterTestingModule, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(QuickActionsComponent);
    fixture.detectChanges();
  });

  it('links Record Sale to /sales/new and Add Referral to /referrals/new', () => {
    expect(fixture.nativeElement.querySelector('.record-sale').getAttribute('href')).toBe('/sales/new');
    expect(fixture.nativeElement.querySelector('.add-referral').getAttribute('href')).toBe('/referrals/new');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/quick-actions.component.spec.ts'`
Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Write `quick-actions.component.ts`**

```typescript
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-quick-actions',
  standalone: true,
  imports: [RouterLink, TranslateModule],
  template: `
    <div class="quick-actions">
      <a class="record-sale" [routerLink]="['/sales/new']">{{ 'dashboard.recordSale' | translate }}</a>
      <a class="add-referral" [routerLink]="['/referrals/new']">{{ 'dashboard.addReferral' | translate }}</a>
    </div>
  `
})
export class QuickActionsComponent {}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/quick-actions.component.spec.ts'`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/dashboard/widgets/quick-actions
git commit -m "feat: add QuickActionsComponent"
```

---

### Task 13: CycleCountdownComponent

**Files:**
- Create: `frontend/src/app/dashboard/widgets/cycle-countdown/cycle-countdown.component.ts`
- Test: `frontend/src/app/dashboard/widgets/cycle-countdown/cycle-countdown.component.spec.ts`

**Interfaces:**
- Consumes: `CycleCountdown` (Task 5).
- Produces: `<app-cycle-countdown [data]="CycleCountdown">`, consumed by Task 16.

- [ ] **Step 1: Write the failing test**

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { CycleCountdownComponent } from './cycle-countdown.component';

describe('CycleCountdownComponent', () => {
  let fixture: ComponentFixture<CycleCountdownComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CycleCountdownComponent, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(CycleCountdownComponent);
    fixture.componentInstance.data = { cycleId: 'c1', daysRemaining: 10 };
    fixture.detectChanges();
  });

  it('renders the days remaining', () => {
    expect(fixture.nativeElement.textContent).toContain('10');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/cycle-countdown.component.spec.ts'`
Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Write `cycle-countdown.component.ts`**

```typescript
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { CycleCountdown } from '../../models/dashboard-response.model';

@Component({
  selector: 'app-cycle-countdown',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `<div class="cycle-countdown">{{ 'dashboard.cycleCloses' | translate: { days: data.daysRemaining } }}</div>`
})
export class CycleCountdownComponent {
  @Input({ required: true }) data!: CycleCountdown;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/cycle-countdown.component.spec.ts'`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/dashboard/widgets/cycle-countdown
git commit -m "feat: add CycleCountdownComponent"
```

---

### Task 14: AnnouncementsStripComponent

**Files:**
- Create: `frontend/src/app/dashboard/widgets/announcements-strip/announcements-strip.component.ts`
- Test: `frontend/src/app/dashboard/widgets/announcements-strip/announcements-strip.component.spec.ts`

**Interfaces:**
- Consumes: `AnnouncementSummary[]` (Task 5).
- Produces: `<app-announcements-strip [announcements]="AnnouncementSummary[]">`, consumed by Task 16.

- [ ] **Step 1: Write the failing test**

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AnnouncementsStripComponent } from './announcements-strip.component';

describe('AnnouncementsStripComponent', () => {
  let fixture: ComponentFixture<AnnouncementsStripComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AnnouncementsStripComponent] }).compileComponents();
    fixture = TestBed.createComponent(AnnouncementsStripComponent);
    fixture.componentInstance.announcements = [
      { id: 'a1', title: 'New Project Launch: Green Valley', publishedAt: '2026-07-20T00:00:00Z' }
    ];
    fixture.detectChanges();
  });

  it('renders one .announcement element per announcement', () => {
    const items = fixture.nativeElement.querySelectorAll('.announcement');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('Green Valley');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/announcements-strip.component.spec.ts'`
Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Write `announcements-strip.component.ts`**

```typescript
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AnnouncementSummary } from '../../models/dashboard-response.model';

@Component({
  selector: 'app-announcements-strip',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="announcements-strip">
      <div class="announcement" *ngFor="let a of announcements">{{ a.title }}</div>
    </div>
  `
})
export class AnnouncementsStripComponent {
  @Input() announcements: AnnouncementSummary[] = [];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/announcements-strip.component.spec.ts'`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/dashboard/widgets/announcements-strip
git commit -m "feat: add AnnouncementsStripComponent"
```

---

### Task 15: DashboardComponent — wire widgets in spec order

**Files:**
- Create: `frontend/src/app/dashboard/dashboard.component.ts`
- Test: `frontend/src/app/dashboard/dashboard.component.spec.ts`
- Modify: `frontend/src/app/app.routes.ts` — add the dashboard route

**Interfaces:**
- Consumes: `DashboardService` (Task 5), all nine widget components (Tasks 6-14).
- Produces: `<app-dashboard>` routed at `/dashboard/:associateId`, the full hero screen.

- [ ] **Step 1: Write the failing integration test**

```typescript
// frontend/src/app/dashboard/dashboard.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { DashboardComponent } from './dashboard.component';
import { DashboardResponse } from './models/dashboard-response.model';

describe('DashboardComponent', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let httpMock: HttpTestingController;

  const mockResponse: DashboardResponse = {
    kycPendingBannerVisible: true,
    cycleIncome: { cycleId: 'c1', directIncome: 1000, matchingIncome: 500, totalIncome: 1500 },
    wallet: { balance: 2500 },
    legVolume: { leftVolume: 3000, rightVolume: 2000, carriedForwardLeft: 0, carriedForwardRight: 1000, projectedMatchAmount: 140 },
    rankProgress: { currentRank: 'Sales Associate', currentRankOrder: 1, nextRank: 'Sales Executive', progressPercent: 40, volumeToNextRank: 6000 },
    teamSnapshot: { totalDownline: 12, activeToday: 3, newJoinsThisCycle: 2 },
    cycleCountdown: { cycleId: 'c1', daysRemaining: 10 },
    announcements: [{ id: 'a1', title: 'Green Valley launch', publishedAt: '2026-07-20T00:00:00Z' }]
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardComponent, HttpClientTestingModule, RouterTestingModule, TranslateModule.forRoot()],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ associateId: 'assoc-1' }) } } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    const req = httpMock.expectOne('/api/associates/assoc-1/dashboard');
    req.flush(mockResponse);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('renders all nine widgets in the spec-mandated stat-first order', () => {
    const selectors = Array.from(fixture.nativeElement.querySelectorAll('.dashboard > *'))
      .map((el: any) => el.tagName.toLowerCase());
    expect(selectors).toEqual([
      'app-kyc-banner',
      'app-cycle-income-card',
      'app-wallet-card',
      'app-leg-volume-gauge',
      'app-rank-progress',
      'app-team-snapshot',
      'app-quick-actions',
      'app-cycle-countdown',
      'app-announcements-strip'
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/dashboard.component.spec.ts'`
Expected: FAIL — `DashboardComponent` doesn't exist.

- [ ] **Step 3: Write `dashboard.component.ts`**

```typescript
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { DashboardService } from './dashboard.service';
import { DashboardResponse } from './models/dashboard-response.model';
import { KycBannerComponent } from './widgets/kyc-banner/kyc-banner.component';
import { CycleIncomeCardComponent } from './widgets/cycle-income-card/cycle-income-card.component';
import { WalletCardComponent } from './widgets/wallet-card/wallet-card.component';
import { LegVolumeGaugeComponent } from './widgets/leg-volume-gauge/leg-volume-gauge.component';
import { RankProgressComponent } from './widgets/rank-progress/rank-progress.component';
import { TeamSnapshotComponent } from './widgets/team-snapshot/team-snapshot.component';
import { QuickActionsComponent } from './widgets/quick-actions/quick-actions.component';
import { CycleCountdownComponent } from './widgets/cycle-countdown/cycle-countdown.component';
import { AnnouncementsStripComponent } from './widgets/announcements-strip/announcements-strip.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule, KycBannerComponent, CycleIncomeCardComponent, WalletCardComponent,
    LegVolumeGaugeComponent, RankProgressComponent, TeamSnapshotComponent,
    QuickActionsComponent, CycleCountdownComponent, AnnouncementsStripComponent
  ],
  template: `
    <div class="dashboard" *ngIf="dashboard as d">
      <app-kyc-banner [visible]="d.kycPendingBannerVisible"></app-kyc-banner>
      <app-cycle-income-card [data]="d.cycleIncome"></app-cycle-income-card>
      <app-wallet-card [balance]="d.wallet.balance"></app-wallet-card>
      <app-leg-volume-gauge [data]="d.legVolume"></app-leg-volume-gauge>
      <app-rank-progress [data]="d.rankProgress"></app-rank-progress>
      <app-team-snapshot [data]="d.teamSnapshot"></app-team-snapshot>
      <app-quick-actions></app-quick-actions>
      <app-cycle-countdown [data]="d.cycleCountdown"></app-cycle-countdown>
      <app-announcements-strip [announcements]="d.announcements"></app-announcements-strip>
    </div>
  `
})
export class DashboardComponent implements OnInit {
  dashboard: DashboardResponse | null = null;

  constructor(private dashboardService: DashboardService, private route: ActivatedRoute) {}

  ngOnInit(): void {
    const associateId = this.route.snapshot.paramMap.get('associateId')!;
    this.dashboardService.getDashboard(associateId).subscribe(d => this.dashboard = d);
  }
}
```

- [ ] **Step 4: Add the route**

```typescript
// frontend/src/app/app.routes.ts
import { Routes } from '@angular/router';
import { DashboardComponent } from './dashboard/dashboard.component';

export const routes: Routes = [
  { path: 'dashboard/:associateId', component: DashboardComponent },
  { path: '', redirectTo: '/dashboard/me', pathMatch: 'full' }
];
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/dashboard.component.spec.ts'`
Expected: PASS

- [ ] **Step 6: Run the full frontend test suite**

Run: `cd frontend && npx ng test --watch=false`
Expected: PASS (all tests from Tasks 5-15)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/dashboard/dashboard.component.ts frontend/src/app/dashboard/dashboard.component.spec.ts frontend/src/app/app.routes.ts
git commit -m "feat: wire dashboard widgets into DashboardComponent in spec order"
```

---

## Self-Review Notes

- **Spec coverage:** All nine §8 widgets have a task (6-14) and are wired in order in Task 15. The KYC banner's conditional visibility (§8 item 1) is covered by Task 6's two test cases. Wallet withdraw and quick-action navigation intentionally stop at a route stub per this plan's stated scope boundary (see Global Constraints and plan Architecture note) — the destination screens are separate subsystem plans.
- **Placeholder scan:** no TBD/TODO markers; every step has concrete code.
- **Type consistency:** `DashboardResponse` field names in Task 3's Java DTO match the TS interface field names in Task 5 exactly (Jackson's default camelCase record-accessor serialization), and every widget's `@Input()` type matches the corresponding nested interface.
- **Security scope:** `GET /api/associates/{associateId}/dashboard` ships unauthenticated by design — `associateId` is caller-supplied with no authN/authZ check. This is the stated scope boundary from Global Constraints (auth/tenant-context is a separate platform plan, not yet written); it is tracked here, not fixed in this plan.

---

## Related Plans (not yet written)

Per the Scope Check, these subsystems from the gap-fill spec are separate plans, deliberately not covered here:
- Plot/Booking/EMI/Sale confirm-gate (spec §4.1, §4.2, §5)
- Wallet/Withdrawal flow with transaction-password gating, Compliance (Income Disclosure, Grievance), e-PIN, Digital ID Card (spec §4.3, §4.4, §6, §7)
- Compensation batch engine (base spec §3) that actually populates `LedgerEntry` and `LegVolume`
