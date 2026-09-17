# e-PIN Unit 1 — Admin Generates a Batch of e-PIN Codes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `POST /api/admin/epins`, the ADMIN-only endpoint that generates a batch of `count` new e-PIN codes sharing one `batchId`, backed by a new `epin` table.

**Architecture:** New backend-only package `com.plotchain.epin`, laid out exactly like the sibling `com.plotchain.sales` package (Controller/Service/Repository/Entity/DTOs, one `@RestController` per route group). One new Flyway migration creates the `epin` table with its full column set (per the spec's Data model section) even though this unit only ever writes the generation-time columns — later units (3/4, separately planned) add redemption behavior without any further schema change. `EPinCodeGenerator` copies `com.plotchain.associate.TemporaryPasswordGenerator`'s exact code-generation pattern (a new class, not a reused one). No screen/frontend work — this plan is backend-only.

**Tech Stack:** Java 21, Spring Boot, Spring Data JPA (Hibernate, `ddl-auto: validate`), Flyway, Spring Security (JWT), JUnit 5 + Mockito + AssertJ, MockMvc, H2 (test profile).

**Spec:** `docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md` (Scope; Decisions 1, 2, 3, 4, 9, 11, 12; Data model; Flows "Generate a batch"; Error handling; Testing). Unit definition: `docs/superpowers/plans/2026-08-03-epin-units.md`, unit 1.

## Global Constraints

- New package `com.plotchain.epin`, sibling to `income`/`wallet`/`withdrawal`/`sales` (Decision 1).
- `EPinCodeGenerator` (new, in `com.plotchain.epin`) copies `TemporaryPasswordGenerator`'s exact pattern — `SecureRandom`, 12 random bytes, `Base64.getUrlEncoder().withoutPadding()` — it does not reuse or extend `TemporaryPasswordGenerator` itself (Decision 2).
- `code` has a DB-level unique constraint; `EPinService`'s generation loop defensively retries on collision via `EPinRepository.existsByCode(String)` (Decision 3).
- No separate `EPinBatch` entity/table — `batchId` (`UUID.randomUUID()`) is just a grouping column stamped onto every `EPin` row generated together (Decision 4).
- `CreateEPinBatchRequest.count` is `@Min(1) @Max(2000)`, rejected with 400 via bean validation on violation — never silently clamped, and no rows are created on rejection (Decision 9).
- Endpoint path is `/api/admin/epins` (plural, matching `/api/admin/associates`, `/api/admin/sales`) (Decision 11).
- `POST /api/admin/epins` requires `hasAuthority("ADMIN")` — the target two-role model (`ADMIN`/`ASSOCIATE`), not the admin-family `hasAnyAuthority(...)` pattern older endpoints still use (Decision 12).
- No `activation_fee_paid` field or any other change lands on the `associate` table (Decision 8, Resolved decisions #2).
- All Maven commands below run from `backend/` (`cd backend && mvn ...`). This repo has a known unrelated issue: a full `mvn test` run surfaces ~55 spurious Mockito errors from a JDK21/25 mismatch — ignore those; run the specific test classes named in each task instead, and judge pass/fail only on tests in this plan's own classes.

---

## Task 1: `epin` table migration, `EPinStatus`, `EPin` entity, `EPinRepository`

**Files:**
- Create: `backend/src/main/resources/db/migration/V33__epin.sql`
- Create: `backend/src/main/java/com/plotchain/epin/EPinStatus.java`
- Create: `backend/src/main/java/com/plotchain/epin/EPin.java`
- Create: `backend/src/main/java/com/plotchain/epin/EPinRepository.java`
- Test: `backend/src/test/java/com/plotchain/epin/EPinRepositoryTest.java`

**Interfaces:**
- Produces: `EPin` entity with `getId/setId(UUID)`, `getCode/setCode(String)`, `getBatchId/setBatchId(UUID)`, `getStatus/setStatus(EPinStatus)`, `getGeneratedBy/setGeneratedBy(UUID)`, `getGeneratedAt/setGeneratedAt(Instant)`. `EPinStatus` enum: `UNUSED`, `USED`. `EPinRepository extends JpaRepository<EPin, UUID>` with `boolean existsByCode(String code)`. Task 3 (`EPinService`) constructs and saves `EPin` rows and calls `existsByCode`.

Before this migration, the highest existing Flyway migration in this repo is `V32__sale_project_note_plot_optional.sql` — confirm this is still true (`ls backend/src/main/resources/db/migration | sort -V | tail -3`) before creating `V33__epin.sql`; if a `V33` already exists from unrelated work landed since this plan was written, renumber to the next free integer and update this plan's references accordingly.

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/plotchain/epin/EPinRepositoryTest.java`:

```java
package com.plotchain.epin;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DataJpaTest
@ActiveProfiles("test")
class EPinRepositoryTest {

    @Autowired EPinRepository epinRepository;
    @Autowired TestEntityManager entityManager;

    // Same "persistable, FK-satisfying ADMIN row" fixture reasoning as
    // com.plotchain.sales.SaleRepositoryTest.persistAssociate(): chk_associate_rank_required (V4)
    // only demands a rank_id for an ASSOCIATE row, so ADMIN keeps this fixture minimal.
    private UUID persistAdmin() {
        UUID id = UUID.randomUUID();
        Associate associate = new Associate();
        associate.setId(id);
        associate.setPosition("L");
        associate.setName("Test Admin");
        associate.setKycStatus(KycStatus.VERIFIED);
        associate.setJoinedAt(Instant.now());
        associate.setCumulativeMatchedVolume(BigDecimal.ZERO);
        associate.setUserId("u-" + id);
        associate.setEmail(id + "@test.local");
        associate.setPasswordHash("$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C");
        associate.setRole(AssociateRole.ADMIN);
        return entityManager.persist(associate).getId();
    }

    private EPin newEPin(String code, UUID batchId, UUID generatedBy) {
        EPin epin = new EPin();
        epin.setId(UUID.randomUUID());
        epin.setCode(code);
        epin.setBatchId(batchId);
        epin.setStatus(EPinStatus.UNUSED);
        epin.setGeneratedBy(generatedBy);
        epin.setGeneratedAt(Instant.now());
        return epin;
    }

    @Test
    void duplicateCodeInsertIsRejectedByTheUniqueConstraint() {
        UUID adminId = persistAdmin();
        String code = "duplicate-code-value";
        epinRepository.saveAndFlush(newEPin(code, UUID.randomUUID(), adminId));

        assertThatThrownBy(() -> epinRepository.saveAndFlush(newEPin(code, UUID.randomUUID(), adminId)))
            .isInstanceOf(DataIntegrityViolationException.class);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && mvn test -Dtest=EPinRepositoryTest`
Expected: FAIL to compile — `EPin`, `EPinStatus`, and `EPinRepository` don't exist yet.

- [ ] **Step 3: Write the migration**

Create `backend/src/main/resources/db/migration/V33__epin.sql`:

```sql
-- epin: e-PIN batch generation and redemption. epin-domain unit 1
-- (docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md, Data model section).
-- Full column set is created here even though unit 1 (this migration's own unit) only ever
-- writes id/code/batch_id/status/generated_by/generated_at -- later redeem units need the
-- redemption columns to already exist and be nullable, same "build the full table shape up
-- front" convention as V22__withdrawal_request.sql's REJECTED/DISBURSED status values and
-- decided_at/disbursed_at columns.
CREATE TABLE epin (
    id UUID PRIMARY KEY,
    code VARCHAR(24) NOT NULL UNIQUE,
    batch_id UUID NOT NULL,
    status VARCHAR(16) NOT NULL,
    generated_by UUID NOT NULL REFERENCES associate(id),
    generated_at TIMESTAMP NOT NULL,
    redeemed_to UUID REFERENCES associate(id),
    redeemed_by UUID REFERENCES associate(id),
    redeemed_at TIMESTAMP,
    redemption_type VARCHAR(16),
    linked_entity_id UUID,
    CONSTRAINT chk_epin_status CHECK (status IN ('UNUSED','USED')),
    CONSTRAINT chk_epin_redemption_type CHECK (redemption_type IN ('ACTIVATION','TOPUP'))
);
CREATE INDEX idx_epin_batch_id ON epin(batch_id);
```

- [ ] **Step 4: Write `EPinStatus`**

Create `backend/src/main/java/com/plotchain/epin/EPinStatus.java`:

```java
package com.plotchain.epin;

public enum EPinStatus {
    UNUSED,
    USED
}
```

- [ ] **Step 5: Write the `EPin` entity**

Create `backend/src/main/java/com/plotchain/epin/EPin.java`:

```java
package com.plotchain.epin;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

// epin-domain unit 1 (docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md,
// Data model section): only the generation-time columns are mapped here. redeemed_to/
// redeemed_by/redeemed_at/redemption_type/linked_entity_id already exist on the epin table
// (migration V33) so a later redeem unit needs no schema change, but they stay unmapped in this
// entity until that unit's service logic actually reads/writes them -- Hibernate's
// ddl-auto=validate only checks mapped columns, so an unmapped extra DB column is not an error.
@Entity
@Table(name = "epin")
public class EPin {

    @Id
    private UUID id;

    @Column(nullable = false)
    private String code;

    @Column(name = "batch_id", nullable = false)
    private UUID batchId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private EPinStatus status;

    @Column(name = "generated_by", nullable = false)
    private UUID generatedBy;

    @Column(name = "generated_at", nullable = false)
    private Instant generatedAt;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    public UUID getBatchId() { return batchId; }
    public void setBatchId(UUID batchId) { this.batchId = batchId; }
    public EPinStatus getStatus() { return status; }
    public void setStatus(EPinStatus status) { this.status = status; }
    public UUID getGeneratedBy() { return generatedBy; }
    public void setGeneratedBy(UUID generatedBy) { this.generatedBy = generatedBy; }
    public Instant getGeneratedAt() { return generatedAt; }
    public void setGeneratedAt(Instant generatedAt) { this.generatedAt = generatedAt; }
}
```

- [ ] **Step 6: Write `EPinRepository`**

Create `backend/src/main/java/com/plotchain/epin/EPinRepository.java`:

```java
package com.plotchain.epin;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface EPinRepository extends JpaRepository<EPin, UUID> {

    // epin-domain unit 1 (Decision 3): defensive collision re-check for EPinService's
    // generation loop, mirroring AssociateIdGenerator.generate()'s own re-check. The DB-level
    // UNIQUE constraint on code (migration V33) is the real guarantee; this is belt-and-braces.
    boolean existsByCode(String code);
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd backend && mvn test -Dtest=EPinRepositoryTest`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/resources/db/migration/V33__epin.sql \
    backend/src/main/java/com/plotchain/epin/EPinStatus.java \
    backend/src/main/java/com/plotchain/epin/EPin.java \
    backend/src/main/java/com/plotchain/epin/EPinRepository.java \
    backend/src/test/java/com/plotchain/epin/EPinRepositoryTest.java
git commit -m "feat(epin): add epin table migration, EPin entity, and EPinRepository

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: `EPinCodeGenerator`

**Files:**
- Create: `backend/src/main/java/com/plotchain/epin/EPinCodeGenerator.java`
- Test: `backend/src/test/java/com/plotchain/epin/EPinCodeGeneratorTest.java`

**Interfaces:**
- Produces: `EPinCodeGenerator.generate()` (static, no-arg) returning a non-blank `String`. Task 3 (`EPinService`) calls this in its generation loop.

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/plotchain/epin/EPinCodeGeneratorTest.java`:

```java
package com.plotchain.epin;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class EPinCodeGeneratorTest {

    @Test
    void generatesANonBlankCode() {
        String code = EPinCodeGenerator.generate();

        assertThat(code).isNotNull();
        assertThat(code).isNotEmpty();
    }

    @Test
    void generatesDifferentCodesOnSuccessiveCalls() {
        String first = EPinCodeGenerator.generate();
        String second = EPinCodeGenerator.generate();

        assertThat(first).isNotEqualTo(second);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && mvn test -Dtest=EPinCodeGeneratorTest`
Expected: FAIL to compile — `EPinCodeGenerator` doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `backend/src/main/java/com/plotchain/epin/EPinCodeGenerator.java`:

```java
package com.plotchain.epin;

import java.security.SecureRandom;
import java.util.Base64;

// epin-domain unit 1 (docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md,
// Decision 2): copies com.plotchain.associate.TemporaryPasswordGenerator's exact pattern rather
// than reusing that class directly -- e-PIN codes are a different domain concept that happens to
// share an implementation shape, not a real cross-domain dependency. No "PIN-like" numeric
// format: redemption is always Admin-driven (see spec Context), so no human ever types this code
// by hand.
public final class EPinCodeGenerator {

    private static final SecureRandom RANDOM = new SecureRandom();

    private EPinCodeGenerator() {
    }

    public static String generate() {
        byte[] bytes = new byte[12];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && mvn test -Dtest=EPinCodeGeneratorTest`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/epin/EPinCodeGenerator.java \
    backend/src/test/java/com/plotchain/epin/EPinCodeGeneratorTest.java
git commit -m "feat(epin): add EPinCodeGenerator

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: `CreateEPinBatchRequest`, `EPinBatchResponse`, `EPinService`

**Files:**
- Create: `backend/src/main/java/com/plotchain/epin/CreateEPinBatchRequest.java`
- Create: `backend/src/main/java/com/plotchain/epin/EPinBatchResponse.java`
- Create: `backend/src/main/java/com/plotchain/epin/EPinService.java`
- Test: `backend/src/test/java/com/plotchain/epin/EPinServiceTest.java`

**Interfaces:**
- Consumes: `EPinRepository.existsByCode(String)`, `EPinRepository.save(EPin)` (Task 1); `EPinCodeGenerator.generate()` (Task 2); `EPin` entity setters (Task 1).
- Produces: `CreateEPinBatchRequest(int count)` (record, `@Min(1) @Max(2000)` on `count`). `EPinBatchResponse(UUID batchId, int count, List<String> codes, Instant generatedAt)` (record). `EPinService.generateBatch(CreateEPinBatchRequest request, UUID actorId)` returning `EPinBatchResponse`. Task 4 (`EPinController`) calls `generateBatch`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/plotchain/epin/EPinServiceTest.java`:

```java
package com.plotchain.epin;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class EPinServiceTest {

    @Mock EPinRepository epinRepository;

    private final EPinService epinService = new EPinService(epinRepository);

    @Test
    void generateBatchProducesTheRequestedCountOfRowsSharingOneBatchIdAllUnused() {
        when(epinRepository.existsByCode(any())).thenReturn(false);
        when(epinRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        ArgumentCaptor<EPin> captor = ArgumentCaptor.forClass(EPin.class);
        UUID actorId = UUID.randomUUID();

        EPinBatchResponse response = epinService.generateBatch(new CreateEPinBatchRequest(3), actorId);

        verify(epinRepository, times(3)).save(captor.capture());
        List<EPin> saved = captor.getAllValues();
        assertThat(saved).hasSize(3);
        assertThat(saved).extracting(EPin::getBatchId).containsOnly(saved.get(0).getBatchId());
        assertThat(saved).allMatch(e -> e.getStatus() == EPinStatus.UNUSED);
        assertThat(saved).allMatch(e -> e.getGeneratedBy().equals(actorId));
        assertThat(saved).allMatch(e -> e.getGeneratedAt() != null);
        assertThat(saved).extracting(EPin::getCode).doesNotHaveDuplicates();

        assertThat(response.batchId()).isEqualTo(saved.get(0).getBatchId());
        assertThat(response.count()).isEqualTo(3);
        assertThat(response.codes()).hasSize(3);
        assertThat(response.generatedAt()).isNotNull();
    }

    @Test
    void generateBatchRetriesOnACodeCollisionAndStillProducesTheRequestedRow() {
        // First existsByCode call simulates a collision (Decision 3); the retry's second call
        // reports no collision, so the loop must still produce exactly one saved row.
        when(epinRepository.existsByCode(any())).thenReturn(true, false);
        when(epinRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        EPinBatchResponse response = epinService.generateBatch(new CreateEPinBatchRequest(1), UUID.randomUUID());

        assertThat(response.codes()).hasSize(1);
        verify(epinRepository, times(2)).existsByCode(any());
        verify(epinRepository, times(1)).save(any());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && mvn test -Dtest=EPinServiceTest`
Expected: FAIL to compile — `CreateEPinBatchRequest`, `EPinBatchResponse`, and `EPinService` don't exist yet.

- [ ] **Step 3: Write `CreateEPinBatchRequest`**

Create `backend/src/main/java/com/plotchain/epin/CreateEPinBatchRequest.java`:

```java
package com.plotchain.epin;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

// epin-domain unit 1 (docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md,
// Decision 9): count is validated, not silently clamped -- an out-of-range value rejects the
// whole request with 400 (bean validation) instead of generating a different number of codes
// than asked for. 2,000 is the confirmed real ceiling (spec's Resolved decisions #1).
public record CreateEPinBatchRequest(
    @Min(1) @Max(2000) int count
) {}
```

- [ ] **Step 4: Write `EPinBatchResponse`**

Create `backend/src/main/java/com/plotchain/epin/EPinBatchResponse.java`:

```java
package com.plotchain.epin;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record EPinBatchResponse(
    UUID batchId,
    int count,
    List<String> codes,
    Instant generatedAt
) {}
```

- [ ] **Step 5: Write `EPinService`**

Create `backend/src/main/java/com/plotchain/epin/EPinService.java`:

```java
package com.plotchain.epin;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
public class EPinService {

    private final EPinRepository epinRepository;

    public EPinService(EPinRepository epinRepository) {
        this.epinRepository = epinRepository;
    }

    // epin-domain unit 1 (docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md,
    // Flows "Generate a batch"): one batchId shared by every row this call creates. Each code is
    // generated via EPinCodeGenerator and defensively retried on an existsByCode collision
    // (Decision 3) before the row is built and saved.
    @Transactional
    public EPinBatchResponse generateBatch(CreateEPinBatchRequest request, UUID actorId) {
        UUID batchId = UUID.randomUUID();
        Instant generatedAt = Instant.now();
        List<String> codes = new ArrayList<>();

        for (int i = 0; i < request.count(); i++) {
            String code;
            do {
                code = EPinCodeGenerator.generate();
            } while (epinRepository.existsByCode(code));

            EPin epin = new EPin();
            epin.setId(UUID.randomUUID());
            epin.setCode(code);
            epin.setBatchId(batchId);
            epin.setStatus(EPinStatus.UNUSED);
            epin.setGeneratedBy(actorId);
            epin.setGeneratedAt(generatedAt);
            epinRepository.save(epin);
            codes.add(code);
        }

        return new EPinBatchResponse(batchId, request.count(), codes, generatedAt);
    }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && mvn test -Dtest=EPinServiceTest`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/plotchain/epin/CreateEPinBatchRequest.java \
    backend/src/main/java/com/plotchain/epin/EPinBatchResponse.java \
    backend/src/main/java/com/plotchain/epin/EPinService.java \
    backend/src/test/java/com/plotchain/epin/EPinServiceTest.java
git commit -m "feat(epin): add EPinService batch generation

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: `EPinController`, `SecurityConfig` matcher, controller/security tests

**Files:**
- Create: `backend/src/main/java/com/plotchain/epin/EPinController.java`
- Modify: `backend/src/main/java/com/plotchain/auth/SecurityConfig.java`
- Test: `backend/src/test/java/com/plotchain/epin/EPinControllerTest.java`
- Modify: `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`

**Interfaces:**
- Consumes: `EPinService.generateBatch(CreateEPinBatchRequest, UUID)` (Task 3).
- Produces: `POST /api/admin/epins` — `201` with `EPinBatchResponse` body on success; `400` (bean validation, via the existing app-wide `com.plotchain.api.ApiExceptionHandler`) when `count` is out of range; `401` unauthenticated; `403` for a non-ADMIN token.

- [ ] **Step 1: Write the failing tests**

Create `backend/src/test/java/com/plotchain/epin/EPinControllerTest.java`:

```java
package com.plotchain.epin;

import com.fasterxml.jackson.databind.ObjectMapper;
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

import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// @SpringBootTest + real Spring Security filter chain, mirroring WithdrawalControllerTest's
// pattern -- proves auth/validation/exception-mapping wiring end to end.
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class EPinControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;
    @MockBean EPinRepository epinRepository;

    private String tokenFor(AssociateRole role) {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(role);
        when(associateRepository.findById(associate.getId())).thenReturn(Optional.of(associate));
        return jwtService.generateToken(associate);
    }

    @Test
    void generateBatchReturns201WithTheRequestedCountOfCodesForAnAdminToken() throws Exception {
        when(epinRepository.existsByCode(any())).thenReturn(false);
        when(epinRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        String body = new ObjectMapper().writeValueAsString(new CreateEPinBatchRequest(5));

        mockMvc.perform(post("/api/admin/epins")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(body))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.count").value(5))
            .andExpect(jsonPath("$.codes.length()").value(5))
            .andExpect(jsonPath("$.batchId").isNotEmpty())
            .andExpect(jsonPath("$.generatedAt").isNotEmpty());
    }

    @Test
    void generateBatchReturns400AndCreatesNoRowsWhenCountIsZero() throws Exception {
        String body = new ObjectMapper().writeValueAsString(new CreateEPinBatchRequest(0));

        mockMvc.perform(post("/api/admin/epins")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(body))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.fields.count").isNotEmpty());

        verify(epinRepository, never()).save(any());
    }

    @Test
    void generateBatchReturns400WhenCountExceeds2000() throws Exception {
        String body = new ObjectMapper().writeValueAsString(new CreateEPinBatchRequest(2001));

        mockMvc.perform(post("/api/admin/epins")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(body))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.fields.count").isNotEmpty());

        verify(epinRepository, never()).save(any());
    }

    @Test
    void generateBatchIsUnauthorizedWithoutAToken() throws Exception {
        String body = new ObjectMapper().writeValueAsString(new CreateEPinBatchRequest(5));

        mockMvc.perform(post("/api/admin/epins")
                .contentType("application/json")
                .content(body))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void generateBatchIsForbiddenForAnAssociateToken() throws Exception {
        String body = new ObjectMapper().writeValueAsString(new CreateEPinBatchRequest(5));

        mockMvc.perform(post("/api/admin/epins")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE))
                .contentType("application/json")
                .content(body))
            .andExpect(status().isForbidden());
    }
}
```

Now add a matching `SecurityConfigTest` case. Open `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java` and add this test right after `adminBookingsCreateIsReachableOnlyForAdminAndForbiddenForEveryOtherRole` (before `associateMeBookingsIsReachableByAnAssociateToken`):

```java
    // epin-domain unit 1 (docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md,
    // "POST /api/admin/epins, ADMIN-only", Decision 12): same target-role-model pattern as
    // adminSalesRecordIsReachableOnlyForAdminAndForbiddenForEveryOtherRole and
    // adminBookingsCreateIsReachableOnlyForAdminAndForbiddenForEveryOtherRole above. EPinRepository
    // is NOT @MockBean'd in this class, so an ADMIN token reaches the real (H2, unmocked)
    // EPinRepository -- but tokenFor(role) never persists a real Associate row (only a mocked
    // AssociateRepository.findById stub), so the epin table's generated_by FK constraint (V33)
    // rejects the very first insert as a DataIntegrityViolationException, mapped to 409 by
    // ApiExceptionHandler. 409 (not 403) is what proves the request passed the security layer for
    // ADMIN, same "assert not 403" reasoning as adminWithdrawalsSubmitIsReachableOnlyFor... above.
    // Every other role, including the soon-to-be-deleted admin-family sub-roles, is blocked at the
    // filter layer before the controller/service ever runs.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminEpinsGenerateBatchIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        String body = new ObjectMapper().writeValueAsString(new com.plotchain.epin.CreateEPinBatchRequest(5));

        mockMvc.perform(post("/api/admin/epins")
                .header("Authorization", "Bearer " + tokenFor(role))
                .contentType("application/json")
                .content(body))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 409 : 403));
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && mvn test -Dtest=EPinControllerTest,SecurityConfigTest`
Expected: FAIL — `EPinControllerTest` fails to compile (`EPinController` doesn't exist); `SecurityConfigTest` fails to compile too, since it now references `com.plotchain.epin.CreateEPinBatchRequest`, which doesn't exist yet at this point in the task (it was created in Task 3 — if Task 3 is already merged, this specific class exists, but `EPinController` and the `POST /api/admin/epins` route do not, so the new parameterized test's ADMIN case would fail at runtime with 404, not 409, once compilation succeeds via Task 3's classes. Confirm the failure reflects "route not wired," not a stale compile error from Task 3).

- [ ] **Step 3: Write `EPinController`**

Create `backend/src/main/java/com/plotchain/epin/EPinController.java`:

```java
package com.plotchain.epin;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/admin/epins")
public class EPinController {

    private final EPinService epinService;

    public EPinController(EPinService epinService) {
        this.epinService = epinService;
    }

    @PostMapping
    public ResponseEntity<EPinBatchResponse> generateBatch(
            @Valid @RequestBody CreateEPinBatchRequest request,
            @AuthenticationPrincipal UUID actorId) {
        return ResponseEntity.status(HttpStatus.CREATED).body(epinService.generateBatch(request, actorId));
    }
}
```

- [ ] **Step 4: Add the `SecurityConfig` matcher**

In `backend/src/main/java/com/plotchain/auth/SecurityConfig.java`, insert a new matcher immediately before the blanket `.requestMatchers(HttpMethod.POST, "/api/**").hasAuthority("ADMIN")` rule (i.e. directly after the existing `/api/admin/bookings` matcher):

```java
                // Generate a batch of e-PINs: ADMIN-only, per epin-domain unit 1
                // (docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md,
                // Decision 12: "POST/GET /api/admin/epins* require hasAuthority("ADMIN")...
                // via the blanket write rule (for the POSTs)"), same target-role-model
                // reasoning and first-match-wins placement as the Sales/Bookings matchers
                // directly above -- not load-bearing on its own (the blanket POST rule below
                // already covers it), added for the same readability/grouping reason those
                // matchers document.
                .requestMatchers(HttpMethod.POST, "/api/admin/epins")
                    .hasAuthority("ADMIN")
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && mvn test -Dtest=EPinControllerTest,SecurityConfigTest`
Expected: PASS — all `EPinControllerTest` cases pass; the new `adminEpinsGenerateBatchIsReachableOnlyForAdminAndForbiddenForEveryOtherRole` case passes (409 for ADMIN, 403 for every other role), and every pre-existing `SecurityConfigTest` case still passes.

- [ ] **Step 6: Run the full epin test package plus SecurityConfigTest once more as a final check**

Run: `cd backend && mvn test -Dtest=EPinRepositoryTest,EPinCodeGeneratorTest,EPinServiceTest,EPinControllerTest,SecurityConfigTest`
Expected: PASS — every test from Tasks 1–4 passes together.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/plotchain/epin/EPinController.java \
    backend/src/main/java/com/plotchain/auth/SecurityConfig.java \
    backend/src/test/java/com/plotchain/epin/EPinControllerTest.java \
    backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java
git commit -m "feat(epin): add POST /api/admin/epins endpoint and ADMIN-only security matcher

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review Notes (for the plan author, not a task to execute)

- **Spec coverage:** Every unit-1 acceptance criterion maps to a task — batch generation/batchId/status/generatedBy/generatedAt (Task 3), `EPinCodeGenerator` pattern + collision retry (Tasks 2–3), `EPinBatchResponse`/201 (Task 4), `count` bean validation with no rows created (Task 4), full `epin` table column set (Task 1), DB unique constraint rejection (Task 1), 403/401 (Task 4), no `associate` table change (no task touches `Associate.java` or any `associate` migration — confirmed by file list above).
- **Placeholder scan:** No TBD/TODO/"add error handling" placeholders — every step has literal code or an exact shell command.
- **Type consistency:** `CreateEPinBatchRequest(int count)` and `EPinBatchResponse(UUID batchId, int count, List<String> codes, Instant generatedAt)` are used with the same shape everywhere they appear (Tasks 3 and 4). `EPinService.generateBatch(CreateEPinBatchRequest, UUID)` signature matches its Task 3 definition and Task 4's controller call site.
