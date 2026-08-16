# Self-Performance Bonus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Credit a new `SELF_PERFORMANCE` income type at sale time (1% of the sale amount when the sold plot is ≥2,000 sqft, 2% when ≥3,000 sqft), gated by a new admin-controlled enable/disable switch.

**Architecture:** A new mutable singleton config table (`self_performance_bonus_config`, mirrors the existing `withdrawal_config` pattern) holds the on/off bit. The two rate/threshold tiers live as four new columns on the existing versioned `CompensationPlanVersion`. `SaleService.recordSale()` gains a second credit step alongside its existing Direct Income credit, in the same transaction.

**Tech Stack:** Spring Boot, Spring Data JPA, Flyway, JUnit 5 + Mockito (unit), `@SpringBootTest`/MockMvc (integration) — all matching this backend's existing stack, no new dependencies.

**Spec:** `docs/superpowers/specs/role-capability/2026-08-16-self-performance-bonus-design.md`

## Global Constraints

- Boundary is inclusive (`>=`): sqft ≥ 2,000 → 1%, sqft ≥ 3,000 → 2%, below 2,000 → no entry (Decision 4).
- Config-disabled is a hard gate — no entry written at all, not a zero-rate no-op (Decision 7).
- `SELF_PERFORMANCE` entries are KYC-gated (`VERIFIED` → `PENDING`, else → `CARRIED_FORWARD`), unlike Direct Income's current unconditional `PENDING` (Decision 5).
- `sourceRef = sale.getId()` on the new entry, same as Direct Income's (Decision 6) — this means a voided sale can now have **two** ledger entries sharing one `sourceRef`, which breaks the existing single-result `findBySourceRef` lookup `voidSale()` uses today. Task 5 fixes this; it must land before or together with Task 4, not after a release.
- `CompensationPlanVersion`'s constructor is a 14-arg positional constructor (append-only entity, no setters) used directly at 7 known call sites across main and test code. The four new fields are appended at the **end** of the parameter list (after `createdByAssociateId`), not interleaved among the existing pct fields — this makes every call site's fix a pure trailing-argument append, the least error-prone edit across that many files.

---

### Task 1: Migration + `CompensationPlanVersion` schema + fix every call site

**Files:**
- Create: `backend/src/main/resources/db/migration/V25__self_performance_bonus.sql`
- Modify: `backend/src/main/java/com/plotchain/compensation/CompensationPlanVersion.java`
- Modify: `backend/src/main/java/com/plotchain/compensation/CompensationPlanService.java:175-190` (construction call)
- Modify: `backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java` (`planVersionFixture()` and `referencePlanVersionFixture()`)
- Modify: `backend/src/test/java/com/plotchain/sales/SaleServiceTest.java` (`compensationPlanVersion()` and `referenceCompensationPlanVersion()`)
- Modify: `backend/src/test/java/com/plotchain/compensation/CompensationPlanServiceTest.java` (`seedVersion()` line 63, `versionOn()` line 86)
- Modify: `backend/src/test/java/com/plotchain/compensation/CompensationPlanVersionRepositoryTest.java` (`persistPlanVersion()`)
- Modify: `backend/src/test/java/com/plotchain/cycle/CycleCloseFullPipelineIntegrationTest.java` (direct construction ~line 213-219)
- Modify: `backend/src/test/java/com/plotchain/cycle/CycleCloseCompensationReferenceIntegrationTest.java` (direct construction)

**Interfaces:**
- Produces: `CompensationPlanVersion.getSelfPerformanceTier1Pct()`, `getSelfPerformanceTier1SqftThreshold()`, `getSelfPerformanceTier2Pct()`, `getSelfPerformanceTier2SqftThreshold()` (all `BigDecimal`) — Task 4 reads these.

- [ ] **Step 1: Write the migration**

```sql
-- backend/src/main/resources/db/migration/V25__self_performance_bonus.sql
ALTER TABLE compensation_plan_version ADD COLUMN self_performance_tier1_pct NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE compensation_plan_version ADD COLUMN self_performance_tier1_sqft_threshold NUMERIC(10,2) NOT NULL DEFAULT 2000;
ALTER TABLE compensation_plan_version ADD COLUMN self_performance_tier2_pct NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE compensation_plan_version ADD COLUMN self_performance_tier2_sqft_threshold NUMERIC(10,2) NOT NULL DEFAULT 3000;

CREATE TABLE self_performance_bonus_config (
    id UUID PRIMARY KEY,
    singleton_guard BOOLEAN NOT NULL DEFAULT TRUE,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT chk_self_performance_bonus_config_singleton CHECK (singleton_guard = TRUE),
    CONSTRAINT uq_self_performance_bonus_config_singleton UNIQUE (singleton_guard)
);

INSERT INTO self_performance_bonus_config (id, singleton_guard, enabled, updated_at)
VALUES ('00000000-0000-0000-0000-000000000001', TRUE, FALSE, CURRENT_TIMESTAMP);
```

- [ ] **Step 2: Add the four fields to `CompensationPlanVersion`**

Add after the `createdByAssociateId` field declaration (line 45), append four new `@Column` fields:

```java
    @Column(name = "self_performance_tier1_pct")
    private BigDecimal selfPerformanceTier1Pct;
    @Column(name = "self_performance_tier1_sqft_threshold")
    private BigDecimal selfPerformanceTier1SqftThreshold;
    @Column(name = "self_performance_tier2_pct")
    private BigDecimal selfPerformanceTier2Pct;
    @Column(name = "self_performance_tier2_sqft_threshold")
    private BigDecimal selfPerformanceTier2SqftThreshold;
```

Extend the constructor's parameter list (append after `UUID createdByAssociateId`) and body:

```java
    public CompensationPlanVersion(
            UUID id,
            String versionLabel,
            LocalDate effectiveFrom,
            BigDecimal directIncomePct,
            BigDecimal matchingIncomePct,
            BigDecimal sponsorMatchingPct,
            BigDecimal tdsPct,
            BigDecimal adminChargeWithPanPct,
            BigDecimal adminChargeWithoutPanPct,
            BigDecimal activationFee,
            BigDecimal minWithdrawal,
            SettlementCycle settlementCycle,
            Instant createdAt,
            UUID createdByAssociateId,
            BigDecimal selfPerformanceTier1Pct,
            BigDecimal selfPerformanceTier1SqftThreshold,
            BigDecimal selfPerformanceTier2Pct,
            BigDecimal selfPerformanceTier2SqftThreshold) {
        this.id = id;
        this.versionLabel = versionLabel;
        this.effectiveFrom = effectiveFrom;
        this.directIncomePct = directIncomePct;
        this.matchingIncomePct = matchingIncomePct;
        this.sponsorMatchingPct = sponsorMatchingPct;
        this.tdsPct = tdsPct;
        this.adminChargeWithPanPct = adminChargeWithPanPct;
        this.adminChargeWithoutPanPct = adminChargeWithoutPanPct;
        this.activationFee = activationFee;
        this.minWithdrawal = minWithdrawal;
        this.settlementCycle = settlementCycle;
        this.createdAt = createdAt;
        this.createdByAssociateId = createdByAssociateId;
        this.selfPerformanceTier1Pct = selfPerformanceTier1Pct;
        this.selfPerformanceTier1SqftThreshold = selfPerformanceTier1SqftThreshold;
        this.selfPerformanceTier2Pct = selfPerformanceTier2Pct;
        this.selfPerformanceTier2SqftThreshold = selfPerformanceTier2SqftThreshold;
    }
```

Append four getters after `getCreatedByAssociateId()`:

```java
    public BigDecimal getSelfPerformanceTier1Pct() { return selfPerformanceTier1Pct; }
    public BigDecimal getSelfPerformanceTier1SqftThreshold() { return selfPerformanceTier1SqftThreshold; }
    public BigDecimal getSelfPerformanceTier2Pct() { return selfPerformanceTier2Pct; }
    public BigDecimal getSelfPerformanceTier2SqftThreshold() { return selfPerformanceTier2SqftThreshold; }
```

- [ ] **Step 3: Find every call site**

```bash
grep -rn "new CompensationPlanVersion(" backend/src
```

This must return exactly the 8 sites listed in **Files** above (7 test-file sites + the 1 production site in `CompensationPlanService.java`). If it returns any additional site not listed above, fix that one too using the same pattern below — do not skip it.

- [ ] **Step 4: Fix `CompensationPlanService.java:175-190`**

Append four trailing arguments matching the new rates the admin just submitted:

```java
        CompensationPlanVersion newVersion = new CompensationPlanVersion(
            UUID.randomUUID(),
            versionLabel,
            effectiveFrom,
            request.directIncomePct(),
            request.matchingIncomePct(),
            request.sponsorMatchingPct(),
            request.tdsPct(),
            request.adminChargeWithPanPct(),
            request.adminChargeWithoutPanPct(),
            request.activationFee(),
            request.minWithdrawal(),
            SettlementCycle.valueOf(request.settlementCycle()),
            Instant.now(),
            adminId,
            request.selfPerformanceTier1Pct(),
            request.selfPerformanceTier1SqftThreshold(),
            request.selfPerformanceTier2Pct(),
            request.selfPerformanceTier2SqftThreshold()
        );
```

(`request.selfPerformanceTier1Pct()` etc. don't exist on `CompensationPlanRequest` yet — Task 6 adds them. For this task, use literal `BigDecimal.ZERO`/`BigDecimal.ZERO`/`BigDecimal.ZERO`/`BigDecimal.ZERO` as placeholders here instead, since Task 6 will come back and replace these four lines with the `request.xxx()` calls shown above. Note this in the commit message: "self-performance rate fields hardcoded to zero pending Task 6".)

- [ ] **Step 5: Fix every test-file call site**

For each of the 6 test-file sites in **Files** above, append four trailing arguments. Use these values everywhere except where noted:

```java
            BigDecimal.ZERO,           // selfPerformanceTier1Pct
            new BigDecimal("2000"),    // selfPerformanceTier1SqftThreshold
            BigDecimal.ZERO,           // selfPerformanceTier2Pct
            new BigDecimal("3000")     // selfPerformanceTier2SqftThreshold
```

Example — `CycleServiceTest.planVersionFixture()`:

```java
    private CompensationPlanVersion planVersionFixture() {
        return new CompensationPlanVersion(
            UUID.randomUUID(), "v1", LocalDate.of(2026, 1, 1),
            BigDecimal.ZERO, new BigDecimal("10.00"), new BigDecimal("11.00"),
            new BigDecimal("5.00"), BigDecimal.ZERO, new BigDecimal("4.00"),
            BigDecimal.ZERO, BigDecimal.ZERO, SettlementCycle.SEMI_MONTHLY,
            Instant.now(), null,
            BigDecimal.ZERO, new BigDecimal("2000"), BigDecimal.ZERO, new BigDecimal("3000"));
    }
```

Apply the identical trailing-four-argument pattern to `referencePlanVersionFixture()` (same file), `compensationPlanVersion()` and `referenceCompensationPlanVersion()` (`SaleServiceTest.java`), `seedVersion()` and `versionOn()` (`CompensationPlanServiceTest.java`), `persistPlanVersion()` (`CompensationPlanVersionRepositoryTest.java`), and the direct constructions in `CycleCloseFullPipelineIntegrationTest.java` and `CycleCloseCompensationReferenceIntegrationTest.java`.

- [ ] **Step 6: Compile and run the full backend suite**

```bash
cd backend && mvn -q -o test-compile
```

Expected: compiles clean (no "cannot find symbol" / "constructor not applicable" errors — this confirms every call site was found and fixed).

```bash
cd backend && mvn -q -o test
```

Expected: same pass/fail count as before this task (754 tests, 750 pass, 4 pre-existing unrelated `JwtServiceTest`/`SecretsEncryptionServiceTest` failures) — this task only adds schema/fields, no new behavior, so nothing should newly fail or newly pass.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/resources/db/migration/V25__self_performance_bonus.sql \
  backend/src/main/java/com/plotchain/compensation/CompensationPlanVersion.java \
  backend/src/main/java/com/plotchain/compensation/CompensationPlanService.java \
  backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java \
  backend/src/test/java/com/plotchain/sales/SaleServiceTest.java \
  backend/src/test/java/com/plotchain/compensation/CompensationPlanServiceTest.java \
  backend/src/test/java/com/plotchain/compensation/CompensationPlanVersionRepositoryTest.java \
  backend/src/test/java/com/plotchain/cycle/CycleCloseFullPipelineIntegrationTest.java \
  backend/src/test/java/com/plotchain/cycle/CycleCloseCompensationReferenceIntegrationTest.java
git commit -m "feat(compensation): add self-performance bonus rate/threshold columns to CompensationPlanVersion"
```

---

### Task 2: `SelfPerformanceBonusConfig` entity + repository + service

**Files:**
- Create: `backend/src/main/java/com/plotchain/compensation/SelfPerformanceBonusConfig.java`
- Create: `backend/src/main/java/com/plotchain/compensation/SelfPerformanceBonusConfigRepository.java`
- Create: `backend/src/main/java/com/plotchain/compensation/SelfPerformanceBonusConfigService.java`
- Create: `backend/src/main/java/com/plotchain/compensation/SelfPerformanceBonusConfigRequest.java`
- Create: `backend/src/main/java/com/plotchain/compensation/SelfPerformanceBonusConfigResponse.java`
- Test: `backend/src/test/java/com/plotchain/compensation/SelfPerformanceBonusConfigServiceTest.java`

**Interfaces:**
- Consumes: schema from Task 1 (`self_performance_bonus_config` table already migrated).
- Produces: `SelfPerformanceBonusConfigService.isEnabled()` (`boolean`) — Task 4 (`SaleService`) calls this. `SelfPerformanceBonusConfigService.getConfig()`/`updateConfig(request, actorId)` — Task 3 (controller) calls these.

- [ ] **Step 1: Write the failing test**

```java
// backend/src/test/java/com/plotchain/compensation/SelfPerformanceBonusConfigServiceTest.java
package com.plotchain.compensation;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.company.SettingsAuditLog;
import com.plotchain.company.SettingsAuditLogRepository;
import com.plotchain.company.SettingsAuditService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SelfPerformanceBonusConfigServiceTest {

    @Mock SelfPerformanceBonusConfigRepository selfPerformanceBonusConfigRepository;
    @Mock SettingsAuditLogRepository settingsAuditLogRepository;
    @Mock AssociateRepository associateRepository;

    SelfPerformanceBonusConfigService selfPerformanceBonusConfigService;

    private static final UUID ACTOR_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        SettingsAuditService settingsAuditService = new SettingsAuditService(
            settingsAuditLogRepository, associateRepository, new ObjectMapper().findAndRegisterModules());
        selfPerformanceBonusConfigService =
            new SelfPerformanceBonusConfigService(selfPerformanceBonusConfigRepository, settingsAuditService);
    }

    @Test
    void isEnabledIsFalseByDefault() {
        SelfPerformanceBonusConfig stored = new SelfPerformanceBonusConfig();
        when(selfPerformanceBonusConfigRepository.findAll()).thenReturn(List.of(stored));

        assertThat(selfPerformanceBonusConfigService.isEnabled()).isFalse();
    }

    @Test
    void isEnabledIsTrueAfterEnabling() {
        SelfPerformanceBonusConfig stored = new SelfPerformanceBonusConfig();
        stored.setEnabled(true);
        when(selfPerformanceBonusConfigRepository.findAll()).thenReturn(List.of(stored));

        assertThat(selfPerformanceBonusConfigService.isEnabled()).isTrue();
    }

    @Test
    void updateConfigSavesTheEnabledFlag() {
        SelfPerformanceBonusConfig stored = new SelfPerformanceBonusConfig();
        when(selfPerformanceBonusConfigRepository.findAll()).thenReturn(List.of(stored));

        SelfPerformanceBonusConfigResponse response =
            selfPerformanceBonusConfigService.updateConfig(new SelfPerformanceBonusConfigRequest(true), ACTOR_ID);

        ArgumentCaptor<SelfPerformanceBonusConfig> captor = ArgumentCaptor.forClass(SelfPerformanceBonusConfig.class);
        verify(selfPerformanceBonusConfigRepository).save(captor.capture());
        assertThat(captor.getValue().isEnabled()).isTrue();
        assertThat(response.enabled()).isTrue();
    }

    @Test
    void updateConfigRecordsAnAuditEntry() {
        SelfPerformanceBonusConfig stored = new SelfPerformanceBonusConfig();
        when(selfPerformanceBonusConfigRepository.findAll()).thenReturn(List.of(stored));

        selfPerformanceBonusConfigService.updateConfig(new SelfPerformanceBonusConfigRequest(true), ACTOR_ID);

        ArgumentCaptor<SettingsAuditLog> captor = ArgumentCaptor.forClass(SettingsAuditLog.class);
        verify(settingsAuditLogRepository).save(captor.capture());
        SettingsAuditLog saved = captor.getValue();
        assertThat(saved.getSection()).isEqualTo("COMPENSATION");
        assertThat(saved.getSummary()).isEqualTo("Updated self-performance bonus enabled flag");
        assertThat(saved.getChangedByAssociateId()).isEqualTo(ACTOR_ID);
        assertThat(saved.getDetail()).contains("\"before\":{\"enabled\":false}")
            .contains("\"after\":{\"enabled\":true}");
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd backend && mvn -q -o test-compile
```

Expected: FAIL — `SelfPerformanceBonusConfig`, `SelfPerformanceBonusConfigRepository`, `SelfPerformanceBonusConfigService`, `SelfPerformanceBonusConfigRequest`, `SelfPerformanceBonusConfigResponse` don't exist yet.

- [ ] **Step 3: Write the entity**

```java
// backend/src/main/java/com/plotchain/compensation/SelfPerformanceBonusConfig.java
package com.plotchain.compensation;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "self_performance_bonus_config")
public class SelfPerformanceBonusConfig {

    @Id
    private UUID id;

    @Column(name = "singleton_guard", nullable = false)
    private boolean singletonGuard = true;

    @Column(name = "enabled", nullable = false)
    private boolean enabled;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public UUID getId() { return id; }

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
```

- [ ] **Step 4: Write the repository**

```java
// backend/src/main/java/com/plotchain/compensation/SelfPerformanceBonusConfigRepository.java
package com.plotchain.compensation;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface SelfPerformanceBonusConfigRepository extends JpaRepository<SelfPerformanceBonusConfig, UUID> {
}
```

- [ ] **Step 5: Write the DTOs**

```java
// backend/src/main/java/com/plotchain/compensation/SelfPerformanceBonusConfigRequest.java
package com.plotchain.compensation;

import jakarta.validation.constraints.NotNull;

public record SelfPerformanceBonusConfigRequest(@NotNull Boolean enabled) {}
```

```java
// backend/src/main/java/com/plotchain/compensation/SelfPerformanceBonusConfigResponse.java
package com.plotchain.compensation;

import java.time.Instant;

public record SelfPerformanceBonusConfigResponse(boolean enabled, Instant updatedAt) {}
```

- [ ] **Step 6: Write the service**

```java
// backend/src/main/java/com/plotchain/compensation/SelfPerformanceBonusConfigService.java
package com.plotchain.compensation;

import com.plotchain.company.SettingsAuditService;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Service
public class SelfPerformanceBonusConfigService {

    private final SelfPerformanceBonusConfigRepository selfPerformanceBonusConfigRepository;
    private final SettingsAuditService settingsAuditService;

    public SelfPerformanceBonusConfigService(
            SelfPerformanceBonusConfigRepository selfPerformanceBonusConfigRepository,
            SettingsAuditService settingsAuditService) {
        this.selfPerformanceBonusConfigRepository = selfPerformanceBonusConfigRepository;
        this.settingsAuditService = settingsAuditService;
    }

    // Narrow public surface for other domains (SaleService) to consume -- currentConfig() itself
    // stays private, same pattern as WithdrawalConfigService.isComplete().
    public boolean isEnabled() {
        return currentConfig().isEnabled();
    }

    public SelfPerformanceBonusConfigResponse getConfig() {
        return toResponse(currentConfig());
    }

    public SelfPerformanceBonusConfigResponse updateConfig(SelfPerformanceBonusConfigRequest request, UUID actorId) {
        SelfPerformanceBonusConfig config = currentConfig();
        SelfPerformanceBonusConfigResponse before = toResponse(config);
        config.setEnabled(request.enabled());
        config.setUpdatedAt(Instant.now());
        selfPerformanceBonusConfigRepository.save(config);
        SelfPerformanceBonusConfigResponse after = toResponse(config);
        settingsAuditService.record("COMPENSATION", "Updated self-performance bonus enabled flag",
            Map.of("before", before, "after", after), actorId);
        return after;
    }

    private SelfPerformanceBonusConfig currentConfig() {
        return selfPerformanceBonusConfigRepository.findAll().stream().findFirst()
            .orElseThrow(() -> new IllegalStateException(
                "self_performance_bonus_config row missing - V25 migration seeds it"));
    }

    private static SelfPerformanceBonusConfigResponse toResponse(SelfPerformanceBonusConfig config) {
        return new SelfPerformanceBonusConfigResponse(config.isEnabled(), config.getUpdatedAt());
    }
}
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
cd backend && mvn -q -o test -Dtest=SelfPerformanceBonusConfigServiceTest
```

Expected: PASS, all 4 tests.

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/java/com/plotchain/compensation/SelfPerformanceBonusConfig*.java \
  backend/src/test/java/com/plotchain/compensation/SelfPerformanceBonusConfigServiceTest.java
git commit -m "feat(compensation): add SelfPerformanceBonusConfig singleton entity, repository, and service"
```

---

### Task 3: `SelfPerformanceBonusConfigController` + security rule

**Files:**
- Create: `backend/src/main/java/com/plotchain/compensation/SelfPerformanceBonusConfigController.java`
- Modify: `backend/src/main/java/com/plotchain/auth/SecurityConfig.java:210-213`
- Test: `backend/src/test/java/com/plotchain/compensation/SelfPerformanceBonusConfigControllerTest.java`

**Interfaces:**
- Consumes: `SelfPerformanceBonusConfigService.getConfig()`/`updateConfig(...)` from Task 2.
- Produces: `GET`/`PUT /api/company/self-performance-bonus` (admin-only) — nothing downstream in this plan consumes this directly; it's the admin-facing surface.

- [ ] **Step 1: Write the failing test**

```java
// backend/src/test/java/com/plotchain/compensation/SelfPerformanceBonusConfigControllerTest.java
package com.plotchain.compensation;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.auth.JwtService;
import com.plotchain.company.SettingsAuditLogRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class SelfPerformanceBonusConfigControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean SelfPerformanceBonusConfigRepository selfPerformanceBonusConfigRepository;
    @MockBean SettingsAuditLogRepository settingsAuditLogRepository;
    @MockBean AssociateRepository associateRepository;

    private String tokenFor(AssociateRole role) {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(role);
        when(associateRepository.findById(associate.getId())).thenReturn(Optional.of(associate));
        return jwtService.generateToken(associate);
    }

    @Test
    void getConfigReturnsTheStoredEnabledFlagForAnAdminToken() throws Exception {
        SelfPerformanceBonusConfig stored = new SelfPerformanceBonusConfig();
        stored.setEnabled(true);
        when(selfPerformanceBonusConfigRepository.findAll()).thenReturn(List.of(stored));

        mockMvc.perform(get("/api/company/self-performance-bonus")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.enabled").value(true));
    }

    @Test
    void getConfigIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/company/self-performance-bonus")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    @Test
    void putConfigSavesAndReturnsTheUpdatedFlag() throws Exception {
        SelfPerformanceBonusConfig stored = new SelfPerformanceBonusConfig();
        when(selfPerformanceBonusConfigRepository.findAll()).thenReturn(List.of(stored));
        when(selfPerformanceBonusConfigRepository.save(any())).thenReturn(stored);

        mockMvc.perform(put("/api/company/self-performance-bonus")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"enabled\":true}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.enabled").value(true));
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd backend && mvn -q -o test-compile
```

Expected: FAIL — `SelfPerformanceBonusConfigController` doesn't exist.

- [ ] **Step 3: Write the controller**

```java
// backend/src/main/java/com/plotchain/compensation/SelfPerformanceBonusConfigController.java
package com.plotchain.compensation;

import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/company/self-performance-bonus")
public class SelfPerformanceBonusConfigController {

    private final SelfPerformanceBonusConfigService selfPerformanceBonusConfigService;

    public SelfPerformanceBonusConfigController(SelfPerformanceBonusConfigService selfPerformanceBonusConfigService) {
        this.selfPerformanceBonusConfigService = selfPerformanceBonusConfigService;
    }

    @GetMapping
    public SelfPerformanceBonusConfigResponse getConfig() {
        return selfPerformanceBonusConfigService.getConfig();
    }

    @PutMapping
    public SelfPerformanceBonusConfigResponse updateConfig(
            @Valid @RequestBody SelfPerformanceBonusConfigRequest request,
            @AuthenticationPrincipal UUID actorId) {
        return selfPerformanceBonusConfigService.updateConfig(request, actorId);
    }
}
```

- [ ] **Step 4: Add the security rule**

In `backend/src/main/java/com/plotchain/auth/SecurityConfig.java`, extend the existing admin-family-only GET matcher (lines 210-213):

```java
                .requestMatchers(HttpMethod.GET,
                        "/api/company/payments", "/api/company/payout-account",
                        "/api/company/kyc", "/api/company/withdrawal", "/api/company/booking-emi",
                        "/api/company/self-performance-bonus")
                    .hasAuthority("ADMIN")
```

(PUT is already covered by the existing blanket admin-only PUT rule elsewhere in this file — no separate matcher needed, same reasoning as every sibling endpoint's comment in this block.)

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend && mvn -q -o test -Dtest=SelfPerformanceBonusConfigControllerTest
```

Expected: PASS, all 3 tests.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/plotchain/compensation/SelfPerformanceBonusConfigController.java \
  backend/src/main/java/com/plotchain/auth/SecurityConfig.java \
  backend/src/test/java/com/plotchain/compensation/SelfPerformanceBonusConfigControllerTest.java
git commit -m "feat(compensation): expose self-performance bonus toggle at /api/company/self-performance-bonus"
```

---

### Task 4: Credit `SELF_PERFORMANCE` in `SaleService.recordSale()`

**Files:**
- Modify: `backend/src/main/java/com/plotchain/income/IncomeType.java`
- Modify: `backend/src/main/java/com/plotchain/sales/SaleService.java`
- Test: `backend/src/test/java/com/plotchain/sales/SaleServiceTest.java`

**Interfaces:**
- Consumes: `SelfPerformanceBonusConfigService.isEnabled()` (Task 2), `CompensationPlanVersion.getSelfPerformanceTier1Pct()` etc. (Task 1), `Plot.getAreaSqft()` (existing).
- Produces: a `LedgerEntry` with `IncomeType.SELF_PERFORMANCE`, `sourceRef = sale.getId()` — Task 5's `voidSale()` fix and Task 7's integration test both depend on this existing.

- [ ] **Step 1: Add the enum value**

```java
// backend/src/main/java/com/plotchain/income/IncomeType.java
package com.plotchain.income;

public enum IncomeType { DIRECT, MATCHING, SPONSOR_MATCHING, ROYALTY, REWARD, PERK, SELF_PERFORMANCE }
```

- [ ] **Step 2: Write the failing tests**

Add to `backend/src/test/java/com/plotchain/sales/SaleServiceTest.java`. First, add two new imports to the existing import block (lines 1-45):

```java
import com.plotchain.associate.KycStatus;
import com.plotchain.compensation.SelfPerformanceBonusConfigService;
```

Then add one new mock field and wire it into `setUp()`:

```java
    @Mock SelfPerformanceBonusConfigService selfPerformanceBonusConfigService;
```

(add this line among the existing `@Mock` fields, lines 50-55)

```java
    @BeforeEach
    void setUp() {
        saleService = new SaleService(
            plotRepository, associateRepository, cycleService,
            compensationPlanVersionRepository, saleRepository, ledgerEntryRepository,
            selfPerformanceBonusConfigService);
    }
```

(replace the existing `setUp()`, lines 63-68 — this is the ONLY place the constructor call needs updating; every other existing test in this file reuses `saleService` via this shared `setUp()`)

Then add these new tests, near `recordSaleSavesADirectIncomeLedgerEntryWithCorrectMath` (after line 226):

```java
    private Plot plotWithAreaSqft(BigDecimal areaSqft) {
        return new Plot(PLOT_ID, UUID.randomUUID(), "A-101", PlotType.NORMAL,
            areaSqft, new BigDecimal("500.00"), new BigDecimal("600000.00"), PlotStatus.AVAILABLE);
    }

    @Test
    void recordSaleCreditsSelfPerformanceBonusAtTier1WhenEnabledAndAreaMeetsTheLowerThreshold() {
        when(plotRepository.findByIdForUpdate(PLOT_ID)).thenReturn(Optional.of(plotWithAreaSqft(new BigDecimal("2000"))));
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associateWithPosition("L")));
        when(cycleService.getOrOpenCurrent()).thenReturn(cycleWithId(CYCLE_ID));
        when(saleRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(ledgerEntryRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(compensationPlanVersionRepository
                .findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(any()))
            .thenReturn(Optional.of(compensationPlanVersion()));
        when(selfPerformanceBonusConfigService.isEnabled()).thenReturn(true);

        SaleResponse response = saleService.recordSale(requestFor(PLOT_ID, ASSOCIATE_ID));

        ArgumentCaptor<LedgerEntry> captor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository, org.mockito.Mockito.times(2)).save(captor.capture());
        LedgerEntry selfPerformanceEntry = captor.getAllValues().stream()
            .filter(e -> e.getIncomeType() == IncomeType.SELF_PERFORMANCE).findFirst().orElseThrow();
        // gross = 600000.00 * 1% = 6000
        assertThat(selfPerformanceEntry.getGrossAmount()).isEqualByComparingTo("6000");
        assertThat(selfPerformanceEntry.getSourceRef()).isEqualTo(response.id());
    }

    @Test
    void recordSaleCreditsSelfPerformanceBonusAtTier2WhenAreaMeetsTheHigherThreshold() {
        when(plotRepository.findByIdForUpdate(PLOT_ID)).thenReturn(Optional.of(plotWithAreaSqft(new BigDecimal("3000"))));
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associateWithPosition("L")));
        when(cycleService.getOrOpenCurrent()).thenReturn(cycleWithId(CYCLE_ID));
        when(saleRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(ledgerEntryRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(compensationPlanVersionRepository
                .findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(any()))
            .thenReturn(Optional.of(compensationPlanVersion()));
        when(selfPerformanceBonusConfigService.isEnabled()).thenReturn(true);

        saleService.recordSale(requestFor(PLOT_ID, ASSOCIATE_ID));

        ArgumentCaptor<LedgerEntry> captor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository, org.mockito.Mockito.times(2)).save(captor.capture());
        LedgerEntry selfPerformanceEntry = captor.getAllValues().stream()
            .filter(e -> e.getIncomeType() == IncomeType.SELF_PERFORMANCE).findFirst().orElseThrow();
        // gross = 600000.00 * 2% = 12000
        assertThat(selfPerformanceEntry.getGrossAmount()).isEqualByComparingTo("12000");
    }

    @Test
    void recordSaleWritesNoSelfPerformanceEntryWhenAreaIsBelowTheLowerThreshold() {
        when(plotRepository.findByIdForUpdate(PLOT_ID)).thenReturn(Optional.of(plotWithAreaSqft(new BigDecimal("1999"))));
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associateWithPosition("L")));
        when(cycleService.getOrOpenCurrent()).thenReturn(cycleWithId(CYCLE_ID));
        when(saleRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(ledgerEntryRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(compensationPlanVersionRepository
                .findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(any()))
            .thenReturn(Optional.of(compensationPlanVersion()));
        when(selfPerformanceBonusConfigService.isEnabled()).thenReturn(true);

        saleService.recordSale(requestFor(PLOT_ID, ASSOCIATE_ID));

        verify(ledgerEntryRepository, never()).save(
            argThat(e -> e.getIncomeType() == IncomeType.SELF_PERFORMANCE));
    }

    @Test
    void recordSaleWritesNoSelfPerformanceEntryWhenConfigIsDisabledRegardlessOfArea() {
        stubHappyPathGuardsAndDependencies(); // plotWithStatus(AVAILABLE) has no explicit areaSqft set (null) -- irrelevant, since disabled short-circuits before reading it
        // isEnabled() is NOT stubbed -- Mockito's boolean default (false) is exactly "disabled".

        saleService.recordSale(requestFor(PLOT_ID, ASSOCIATE_ID));

        verify(ledgerEntryRepository, never()).save(
            argThat(e -> e.getIncomeType() == IncomeType.SELF_PERFORMANCE));
    }

    @Test
    void recordSaleCreditsSelfPerformanceBonusAsCarriedForwardWhenAssociateKycIsNotVerified() {
        Associate unverified = associateWithPosition("L");
        unverified.setKycStatus(KycStatus.PENDING);
        when(plotRepository.findByIdForUpdate(PLOT_ID)).thenReturn(Optional.of(plotWithAreaSqft(new BigDecimal("2000"))));
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(unverified));
        when(cycleService.getOrOpenCurrent()).thenReturn(cycleWithId(CYCLE_ID));
        when(saleRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(ledgerEntryRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(compensationPlanVersionRepository
                .findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(any()))
            .thenReturn(Optional.of(compensationPlanVersion()));
        when(selfPerformanceBonusConfigService.isEnabled()).thenReturn(true);

        saleService.recordSale(requestFor(PLOT_ID, ASSOCIATE_ID));

        ArgumentCaptor<LedgerEntry> captor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository, org.mockito.Mockito.times(2)).save(captor.capture());
        LedgerEntry selfPerformanceEntry = captor.getAllValues().stream()
            .filter(e -> e.getIncomeType() == IncomeType.SELF_PERFORMANCE).findFirst().orElseThrow();
        assertThat(selfPerformanceEntry.getStatus()).isEqualTo(LedgerEntryStatus.CARRIED_FORWARD);
    }
```

`associateWithPosition("L")` (line 79-84 of this file) constructs a plain `new Associate()` with only `id`/`position` set — `getKycStatus()` returns `null` by default, which the new `kycGatedStatus` helper (Step 4 below) must treat as "not verified" (same `VERIFIED`-or-else logic `CycleService.kycGatedStatus()` uses — `null == VERIFIED` is `false`, so this falls through to `CARRIED_FORWARD` correctly without a null-check). This means every EXISTING test in this file that doesn't explicitly stub `selfPerformanceBonusConfigService.isEnabled()` gets Mockito's default `false` (disabled) and is completely unaffected by this change — no other existing test in `SaleServiceTest.java` needs modification.

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd backend && mvn -q -o test-compile
```

Expected: FAIL — `SaleService`'s constructor doesn't accept a 7th argument yet, `IncomeType.SELF_PERFORMANCE` doesn't exist yet (fixed by Step 1 above, already done), plot's constructor call in the new test needs `PlotType` (already imported in this file per line 19).

- [ ] **Step 4: Implement**

In `backend/src/main/java/com/plotchain/sales/SaleService.java`:

Add one new constructor parameter and field:

```java
import com.plotchain.associate.KycStatus;
import com.plotchain.compensation.SelfPerformanceBonusConfigService;
```

(add to the import block, alphabetically ordered per this file's existing convention)

```java
    private final SelfPerformanceBonusConfigService selfPerformanceBonusConfigService;

    public SaleService(
            PlotRepository plotRepository,
            AssociateRepository associateRepository,
            CycleService cycleService,
            CompensationPlanVersionRepository compensationPlanVersionRepository,
            SaleRepository saleRepository,
            LedgerEntryRepository ledgerEntryRepository,
            SelfPerformanceBonusConfigService selfPerformanceBonusConfigService) {
        this.plotRepository = plotRepository;
        this.associateRepository = associateRepository;
        this.cycleService = cycleService;
        this.compensationPlanVersionRepository = compensationPlanVersionRepository;
        this.saleRepository = saleRepository;
        this.ledgerEntryRepository = ledgerEntryRepository;
        this.selfPerformanceBonusConfigService = selfPerformanceBonusConfigService;
    }
```

Insert the new credit block immediately after the existing Direct Income block (after line 127's `ledgerEntryRepository.save(ledgerEntry);`, before `// Flow step 9.` / `return toResponse(sale);`):

```java
        // Self-Performance Bonus: same shape as Direct Income above (self-only, sale-time,
        // this sale's own amount), gated by SelfPerformanceBonusConfigService.isEnabled() and
        // the plot's area crossing one of the two tier thresholds on this same planVersion.
        // Highest qualifying tier wins; below the lower threshold, no entry (compensation-plan-
        // reference.md's own Known Gap: no rate is documented below 2,000 sqft).
        if (selfPerformanceBonusConfigService.isEnabled()) {
            BigDecimal areaSqft = plot.getAreaSqft();
            BigDecimal selfPerformancePct = null;
            if (areaSqft.compareTo(planVersion.getSelfPerformanceTier2SqftThreshold()) >= 0) {
                selfPerformancePct = planVersion.getSelfPerformanceTier2Pct();
            } else if (areaSqft.compareTo(planVersion.getSelfPerformanceTier1SqftThreshold()) >= 0) {
                selfPerformancePct = planVersion.getSelfPerformanceTier1Pct();
            }

            if (selfPerformancePct != null) {
                BigDecimal spGrossAmount = sale.getAmount()
                    .multiply(selfPerformancePct.divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP));
                if (spGrossAmount.compareTo(BigDecimal.ZERO) > 0) {
                    BigDecimal spTdsDeduction = spGrossAmount
                        .multiply(planVersion.getTdsPct().divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP));
                    BigDecimal spAdminDeduction = spGrossAmount
                        .multiply(planVersion.getAdminChargeWithoutPanPct().divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP));
                    BigDecimal spNetAmount = spGrossAmount.subtract(spTdsDeduction).subtract(spAdminDeduction);

                    LedgerEntry selfPerformanceEntry = new LedgerEntry();
                    selfPerformanceEntry.setId(UUID.randomUUID());
                    selfPerformanceEntry.setIncomeType(IncomeType.SELF_PERFORMANCE);
                    selfPerformanceEntry.setAssociateId(sale.getAssociateId());
                    selfPerformanceEntry.setCycleId(sale.getCycleId());
                    selfPerformanceEntry.setGrossAmount(spGrossAmount);
                    selfPerformanceEntry.setTdsDeduction(spTdsDeduction);
                    selfPerformanceEntry.setAdminDeduction(spAdminDeduction);
                    selfPerformanceEntry.setNetAmount(spNetAmount);
                    selfPerformanceEntry.setStatus(kycGatedStatus(associate));
                    selfPerformanceEntry.setSourceRef(sale.getId());
                    selfPerformanceEntry.setCreatedAt(Instant.now());
                    ledgerEntryRepository.save(selfPerformanceEntry);
                }
            }
        }
```

Add the private helper (place near the bottom of the class, after `toResponse`):

```java
    // Duplicates CycleService.kycGatedStatus()'s one-line logic rather than extracting a shared
    // utility -- consistent with how the deduction math above is already duplicated between the
    // two classes; no cross-class extraction is in scope here.
    private LedgerEntryStatus kycGatedStatus(Associate associate) {
        return associate.getKycStatus() == KycStatus.VERIFIED
            ? LedgerEntryStatus.PENDING
            : LedgerEntryStatus.CARRIED_FORWARD;
    }
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend && mvn -q -o test -Dtest=SaleServiceTest
```

Expected: PASS, all tests (existing + 5 new) — total test count in this class should be the prior count + 5.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/plotchain/income/IncomeType.java \
  backend/src/main/java/com/plotchain/sales/SaleService.java \
  backend/src/test/java/com/plotchain/sales/SaleServiceTest.java
git commit -m "feat(sales): credit self-performance bonus at sale time when enabled and area qualifies"
```

---

### Task 5: Fix `voidSale()` for two same-`sourceRef` entries

**Files:**
- Modify: `backend/src/main/java/com/plotchain/income/LedgerEntryRepository.java`
- Modify: `backend/src/main/java/com/plotchain/sales/SaleService.java` (`voidSale`, lines 138-175)
- Modify: `backend/src/test/java/com/plotchain/sales/SaleServiceTest.java`

**Interfaces:**
- Consumes: `LedgerEntry.getSourceRef()`/`getIncomeType()` (existing).
- Produces: `LedgerEntryRepository.findAllBySourceRef(UUID)` returning `List<LedgerEntry>` — nothing later in this plan depends on this, but any future income type that reuses `sourceRef = sale.getId()` will.

- [ ] **Step 1: Write the failing test**

Add to `backend/src/test/java/com/plotchain/sales/SaleServiceTest.java`, near `voidSaleReversesTheLinkedLedgerEntry` (after line 420):

```java
    @Test
    void voidSaleReversesEveryLedgerEntrySharingTheSaleAsSourceRef() {
        UUID saleId = UUID.randomUUID();
        Sale sale = recordedSale(saleId, PLOT_ID);
        LedgerEntry directEntry = pendingLedgerEntry(saleId);
        LedgerEntry selfPerformanceEntry = pendingLedgerEntry(saleId);
        selfPerformanceEntry.setId(UUID.randomUUID());
        selfPerformanceEntry.setIncomeType(IncomeType.SELF_PERFORMANCE);

        when(saleRepository.findById(saleId)).thenReturn(Optional.of(sale));
        when(saleRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(plotRepository.findById(sale.getPlotId())).thenReturn(Optional.of(plotWithStatus(PlotStatus.SOLD)));
        when(plotRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(ledgerEntryRepository.findAllBySourceRef(saleId)).thenReturn(List.of(directEntry, selfPerformanceEntry));
        when(ledgerEntryRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        saleService.voidSale(saleId, new VoidSaleRequest("Buyer backed out"));

        ArgumentCaptor<LedgerEntry> captor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository, org.mockito.Mockito.times(2)).save(captor.capture());
        assertThat(captor.getAllValues()).allMatch(e -> e.getStatus() == LedgerEntryStatus.REVERSED);
        assertThat(captor.getAllValues()).extracting(LedgerEntry::getId)
            .containsExactlyInAnyOrder(directEntry.getId(), selfPerformanceEntry.getId());
    }
```

Update `stubVoidHappyPath` (lines 371-378) — replace the single-entry stub with a list stub:

```java
    private void stubVoidHappyPath(Sale sale, LedgerEntry ledgerEntry) {
        when(saleRepository.findById(sale.getId())).thenReturn(Optional.of(sale));
        when(saleRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(plotRepository.findById(sale.getPlotId())).thenReturn(Optional.of(plotWithStatus(PlotStatus.SOLD)));
        when(plotRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(ledgerEntryRepository.findAllBySourceRef(sale.getId())).thenReturn(List.of(ledgerEntry));
        when(ledgerEntryRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
    }
```

Update `voidSaleReversesTheLinkedLedgerEntry` (line 415) — replace the `findBySourceRef` verify with `findAllBySourceRef`:

```java
        verify(ledgerEntryRepository).findAllBySourceRef(saleId);
```

Update `voidSaleThrowsIllegalStateExceptionWhenTheLedgerEntryRowIsMissing` (line 458) — replace the empty-`Optional` stub with an empty list:

```java
        when(ledgerEntryRepository.findAllBySourceRef(saleId)).thenReturn(List.of());
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && mvn -q -o test -Dtest=SaleServiceTest
```

Expected: FAIL — `findAllBySourceRef` doesn't exist on `LedgerEntryRepository` yet; the new/updated tests reference it.

- [ ] **Step 3: Implement**

In `backend/src/main/java/com/plotchain/income/LedgerEntryRepository.java`, add after `findBySourceRef` (line 66):

```java
    // Same source data as findBySourceRef above, but plural -- once a sale can create more than
    // one LedgerEntry sharing sourceRef = sale.id (Direct Income + Self-Performance Bonus, both
    // set at sale time in SaleService.recordSale), the old single-result findBySourceRef throws
    // IncorrectResultSizeDataAccessException at void time whenever both were credited.
    // SaleService.voidSale uses this one instead, reversing every entry it finds.
    List<LedgerEntry> findAllBySourceRef(UUID sourceRef);
```

In `backend/src/main/java/com/plotchain/sales/SaleService.java`, replace the `voidSale` ledger-reversal block (Flow step 5, around lines 163-171):

```java
        // Flow step 5: reverse every ledger entry this sale created at record time (Direct
        // Income always, Self-Performance Bonus when it was enabled and the area qualified) --
        // Decision 6 (self-performance-bonus design). Same data-integrity reasoning as the
        // missing-Plot case above -- recordSale always creates at least one LedgerEntry per Sale
        // (Direct Income), in the same transaction.
        List<LedgerEntry> ledgerEntries = ledgerEntryRepository.findAllBySourceRef(sale.getId());
        if (ledgerEntries.isEmpty()) {
            throw new IllegalStateException(
                "ledger_entry row missing for sale " + sale.getId()
                    + " - recordSale always creates one in the same transaction");
        }
        for (LedgerEntry ledgerEntry : ledgerEntries) {
            ledgerEntry.setStatus(LedgerEntryStatus.REVERSED);
            ledgerEntryRepository.save(ledgerEntry);
        }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && mvn -q -o test -Dtest=SaleServiceTest
```

Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/income/LedgerEntryRepository.java \
  backend/src/main/java/com/plotchain/sales/SaleService.java \
  backend/src/test/java/com/plotchain/sales/SaleServiceTest.java
git commit -m "fix(sales): voidSale reverses every ledger entry sharing a sale's sourceRef, not just one"
```

---

### Task 6: Expose the rate/threshold fields on the admin compensation-plan API

**Files:**
- Modify: `backend/src/main/java/com/plotchain/compensation/CompensationPlanRequest.java`
- Modify: `backend/src/main/java/com/plotchain/compensation/CompensationPlanResponse.java`
- Modify: `backend/src/main/java/com/plotchain/compensation/CompensationPlanService.java` (construction call from Task 1 Step 4, and `toResponse`)
- Test: `backend/src/test/java/com/plotchain/compensation/CompensationPlanServiceTest.java`

**Interfaces:**
- Consumes: `CompensationPlanVersion`'s four new fields (Task 1).
- Produces: `CompensationPlanRequest.selfPerformanceTier1Pct()` etc., `CompensationPlanResponse.selfPerformanceTier1Pct()` etc.

- [ ] **Step 1: Write the failing test**

Add to `backend/src/test/java/com/plotchain/compensation/CompensationPlanServiceTest.java`, near the existing plan-update test(s):

```java
    @Test
    void updatePlanSavesTheSelfPerformanceBonusRatesAndThresholds() {
        lenient().when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of());
        when(versionRepository.findByEffectiveFrom(any())).thenReturn(Optional.empty());

        CompensationPlanRequest request = new CompensationPlanRequest(
            new BigDecimal("6.00"), new BigDecimal("7.00"), new BigDecimal("11.00"),
            new BigDecimal("2.00"), new BigDecimal("5.00"), new BigDecimal("15.00"),
            new BigDecimal("1100.00"), new BigDecimal("500.00"), "SEMI_MONTHLY",
            List.of(), List.of(), null,
            new BigDecimal("1.00"), new BigDecimal("2000"),
            new BigDecimal("2.00"), new BigDecimal("3000"));

        compensationPlanService.updatePlan(request, ADMIN_ID);

        ArgumentCaptor<CompensationPlanVersion> captor = ArgumentCaptor.forClass(CompensationPlanVersion.class);
        verify(versionRepository).save(captor.capture());
        assertThat(captor.getValue().getSelfPerformanceTier1Pct()).isEqualByComparingTo("1.00");
        assertThat(captor.getValue().getSelfPerformanceTier1SqftThreshold()).isEqualByComparingTo("2000");
        assertThat(captor.getValue().getSelfPerformanceTier2Pct()).isEqualByComparingTo("2.00");
        assertThat(captor.getValue().getSelfPerformanceTier2SqftThreshold()).isEqualByComparingTo("3000");
    }
```

(`compensationPlanService.updatePlan(request, adminId)`, `versionRepository` (the `@Mock CompensationPlanVersionRepository` field), and `ADMIN_ID` are this test file's existing method/field names, confirmed at `CompensationPlanServiceTest.java:39,49,293`. `updatePlan` internally calls `toResponse(...)`, which reads `rankTierRepository.findAllByOrderByRankOrder()` to build `availableRanks` — hence the `lenient()` stub above, same pattern this file's own `updatePlanReplacesTheSameDaysVersionBySameAdminKeepingItsVersionLabel` test already uses.)

- [ ] **Step 2: Run it to verify it fails**

```bash
cd backend && mvn -q -o test-compile
```

Expected: FAIL — `CompensationPlanRequest`'s constructor doesn't accept 4 extra trailing arguments yet.

- [ ] **Step 3: Extend the DTOs**

```java
// backend/src/main/java/com/plotchain/compensation/CompensationPlanRequest.java
public record CompensationPlanRequest(
    @NotNull @DecimalMin("0") @DecimalMax("100") BigDecimal directIncomePct,
    @NotNull @DecimalMin("0") @DecimalMax("100") BigDecimal matchingIncomePct,
    @NotNull @DecimalMin("0") @DecimalMax("100") BigDecimal sponsorMatchingPct,
    @NotNull @DecimalMin("0") @DecimalMax("100") BigDecimal tdsPct,
    @NotNull @DecimalMin("0") @DecimalMax("100") BigDecimal adminChargeWithPanPct,
    @NotNull @DecimalMin("0") @DecimalMax("100") BigDecimal adminChargeWithoutPanPct,
    @NotNull @DecimalMin("0") BigDecimal activationFee,
    @NotNull @DecimalMin("0") BigDecimal minWithdrawal,
    @NotBlank @Pattern(regexp = "SEMI_MONTHLY|MONTHLY|CUSTOM") String settlementCycle,
    @Valid List<RoyaltyBonusRateInput> royaltyBonusRates,
    @Valid List<RewardTierInput> rewardTiers,
    LocalDate effectiveFrom,
    @NotNull @DecimalMin("0") @DecimalMax("100") BigDecimal selfPerformanceTier1Pct,
    @NotNull @DecimalMin("0.01") BigDecimal selfPerformanceTier1SqftThreshold,
    @NotNull @DecimalMin("0") @DecimalMax("100") BigDecimal selfPerformanceTier2Pct,
    @NotNull @DecimalMin("0.01") BigDecimal selfPerformanceTier2SqftThreshold
) {}
```

```java
// backend/src/main/java/com/plotchain/compensation/CompensationPlanResponse.java
public record CompensationPlanResponse(
    String versionLabel,
    LocalDate effectiveFrom,
    BigDecimal directIncomePct,
    BigDecimal matchingIncomePct,
    BigDecimal sponsorMatchingPct,
    BigDecimal tdsPct,
    BigDecimal adminChargeWithPanPct,
    BigDecimal adminChargeWithoutPanPct,
    BigDecimal activationFee,
    BigDecimal minWithdrawal,
    String settlementCycle,
    List<RoyaltyBonusRateDto> royaltyBonusRates,
    List<RewardTierDto> rewardTiers,
    List<RankOptionDto> availableRanks,
    Instant createdAt,
    BigDecimal selfPerformanceTier1Pct,
    BigDecimal selfPerformanceTier1SqftThreshold,
    BigDecimal selfPerformanceTier2Pct,
    BigDecimal selfPerformanceTier2SqftThreshold
) {}
```

- [ ] **Step 4: Wire the new fields through `CompensationPlanService`**

Replace the four `BigDecimal.ZERO` placeholders left by Task 1 Step 4 (in the `new CompensationPlanVersion(...)` construction) with the real request fields:

```java
            request.selfPerformanceTier1Pct(),
            request.selfPerformanceTier1SqftThreshold(),
            request.selfPerformanceTier2Pct(),
            request.selfPerformanceTier2SqftThreshold()
```

In `toResponse(...)` (the `new CompensationPlanResponse(...)` construction), append after `version.getCreatedAt()`:

```java
            version.getCreatedAt(),
            version.getSelfPerformanceTier1Pct(),
            version.getSelfPerformanceTier1SqftThreshold(),
            version.getSelfPerformanceTier2Pct(),
            version.getSelfPerformanceTier2SqftThreshold()
```

- [ ] **Step 5: Fix every other `new CompensationPlanRequest(...)` call site**

```bash
grep -rln "new CompensationPlanRequest(" backend/src/test
```

For each file returned, append four trailing arguments to every construction: `new BigDecimal("1.00"), new BigDecimal("2000"), new BigDecimal("2.00"), new BigDecimal("3000")` (the same values Task 1 used for the `CompensationPlanVersion` fixtures, for consistency).

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd backend && mvn -q -o test -Dtest=CompensationPlanServiceTest,CompensationPlanControllerTest
```

Expected: PASS, all tests.

```bash
cd backend && mvn -q -o test
```

Expected: PASS, prior count + all new tests from Tasks 2-6, same 4 pre-existing unrelated failures as Task 1's baseline.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/plotchain/compensation/CompensationPlanRequest.java \
  backend/src/main/java/com/plotchain/compensation/CompensationPlanResponse.java \
  backend/src/main/java/com/plotchain/compensation/CompensationPlanService.java \
  backend/src/test/java/com/plotchain/compensation/CompensationPlanServiceTest.java
git commit -m "feat(compensation): expose self-performance bonus rates/thresholds on the admin compensation-plan API"
```

---

### Task 7: End-to-end integration test

**Files:**
- Create: `backend/src/test/java/com/plotchain/sales/SaleServiceSelfPerformanceBonusIntegrationTest.java`

**Interfaces:**
- Consumes: everything from Tasks 1-5, wired together via real Spring beans and a real H2 (Postgres-mode) datasource, same pattern as `CycleCloseCompensationReferenceIntegrationTest`.

- [ ] **Step 1: Write the test**

```java
package com.plotchain.sales;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.compensation.CompensationPlanVersion;
import com.plotchain.compensation.CompensationPlanVersionRepository;
import com.plotchain.compensation.SelfPerformanceBonusConfig;
import com.plotchain.compensation.SelfPerformanceBonusConfigRepository;
import com.plotchain.compensation.SettlementCycle;
import com.plotchain.income.IncomeType;
import com.plotchain.income.LedgerEntry;
import com.plotchain.income.LedgerEntryRepository;
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

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@ActiveProfiles("test")
class SaleServiceSelfPerformanceBonusIntegrationTest {

    @Autowired SaleService saleService;
    @Autowired AssociateRepository associateRepository;
    @Autowired ProjectRepository projectRepository;
    @Autowired PlotRepository plotRepository;
    @Autowired SaleRepository saleRepository;
    @Autowired LedgerEntryRepository ledgerEntryRepository;
    @Autowired CompensationPlanVersionRepository compensationPlanVersionRepository;
    @Autowired SelfPerformanceBonusConfigRepository selfPerformanceBonusConfigRepository;

    private UUID planVersionId;
    private UUID projectId;
    private UUID plotId;
    private UUID associateId;
    private UUID saleId;

    @AfterEach
    void cleanUp() {
        if (saleId != null) {
            ledgerEntryRepository.deleteAll(ledgerEntryRepository.findAll().stream()
                .filter(e -> saleId.equals(e.getSourceRef())).toList());
            saleRepository.deleteById(saleId);
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
        if (planVersionId != null) {
            compensationPlanVersionRepository.deleteById(planVersionId);
        }
        // Restore the singleton config row to its seeded (disabled) state for other tests.
        SelfPerformanceBonusConfig config = selfPerformanceBonusConfigRepository.findAll().get(0);
        config.setEnabled(false);
        selfPerformanceBonusConfigRepository.save(config);
    }

    @Test
    void recordSaleCreditsBothDirectIncomeAndSelfPerformanceBonusInOneTransaction() {
        CompensationPlanVersion planVersion = new CompensationPlanVersion(
            UUID.randomUUID(), "sp-bonus-test", LocalDate.of(2025, 6, 1),
            new BigDecimal("6.00"), new BigDecimal("7.00"), new BigDecimal("11.00"),
            new BigDecimal("2.00"), BigDecimal.ZERO, new BigDecimal("15.00"),
            BigDecimal.ZERO, BigDecimal.ZERO, SettlementCycle.SEMI_MONTHLY, Instant.now(), null,
            new BigDecimal("1.00"), new BigDecimal("2000"),
            new BigDecimal("2.00"), new BigDecimal("3000"));
        compensationPlanVersionRepository.saveAndFlush(planVersion);
        planVersionId = planVersion.getId();

        SelfPerformanceBonusConfig config = selfPerformanceBonusConfigRepository.findAll().get(0);
        config.setEnabled(true);
        selfPerformanceBonusConfigRepository.saveAndFlush(config);

        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setName("sp-bonus-associate");
        associate.setUserId("sp-bonus-associate");
        associate.setEmail("sp-bonus-associate@test.local");
        associate.setPasswordHash("$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C");
        associate.setRole(AssociateRole.ASSOCIATE);
        associate.setRankId(UUID.fromString("00000000-0000-0000-0000-000000000201"));
        associate.setKycStatus(KycStatus.VERIFIED);
        associate.setJoinedAt(Instant.now());
        associate.setCumulativeMatchedVolume(BigDecimal.ZERO);
        associateRepository.saveAndFlush(associate);
        associateId = associate.getId();

        Project project = new Project(UUID.randomUUID(), "SP Bonus Test Project", "Test City", null, null, Instant.now());
        projectRepository.saveAndFlush(project);
        projectId = project.getId();

        Plot plot = new Plot(UUID.randomUUID(), projectId, "SP-101", PlotType.NORMAL,
            new BigDecimal("3000"), new BigDecimal("500.00"), new BigDecimal("1000000.00"), PlotStatus.AVAILABLE);
        plotRepository.saveAndFlush(plot);
        plotId = plot.getId();

        CreateSaleRequest request = new CreateSaleRequest(plotId, associateId, "Jane Buyer", "9999999999", null);
        SaleResponse response = saleService.recordSale(request);
        saleId = response.id();

        List<LedgerEntry> entries = ledgerEntryRepository.findAllBySourceRef(saleId);
        assertThat(entries).hasSize(2);

        LedgerEntry directEntry = entries.stream()
            .filter(e -> e.getIncomeType() == IncomeType.DIRECT).findFirst().orElseThrow();
        // gross = 1000000.00 * 6% = 60000
        assertThat(directEntry.getGrossAmount()).isEqualByComparingTo("60000");

        LedgerEntry selfPerformanceEntry = entries.stream()
            .filter(e -> e.getIncomeType() == IncomeType.SELF_PERFORMANCE).findFirst().orElseThrow();
        // 3000 sqft meets the tier-2 threshold: gross = 1000000.00 * 2% = 20000
        assertThat(selfPerformanceEntry.getGrossAmount()).isEqualByComparingTo("20000");
        assertThat(selfPerformanceEntry.getSourceRef()).isEqualTo(saleId);
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd backend && mvn -q -o test -Dtest=SaleServiceSelfPerformanceBonusIntegrationTest
```

Expected: FAIL if any earlier task is incomplete (e.g. `findAllBySourceRef` missing, or the seeded singleton config row's `id` literal doesn't match — check `V25__self_performance_bonus.sql`'s seeded row against what `findAll().get(0)` returns; if this test errors with "no such element" instead of a real assertion failure, the migration didn't seed the row, revisit Task 1 Step 1).

- [ ] **Step 3: Run it to verify it passes**

```bash
cd backend && mvn -q -o test -Dtest=SaleServiceSelfPerformanceBonusIntegrationTest
```

Expected: PASS.

- [ ] **Step 4: Run the full backend suite one final time**

```bash
cd backend && mvn -q -o test
```

Expected: 754 (baseline) + all new tests from this plan, all passing except the same 4 pre-existing unrelated `JwtServiceTest`/`SecretsEncryptionServiceTest` failures.

- [ ] **Step 5: Commit**

```bash
git add backend/src/test/java/com/plotchain/sales/SaleServiceSelfPerformanceBonusIntegrationTest.java
git commit -m "test(sales): add end-to-end integration test for self-performance bonus crediting"
```
