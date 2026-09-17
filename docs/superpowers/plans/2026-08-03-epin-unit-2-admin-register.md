# e-PIN Unit 2 — Admin Register (`GET /api/admin/epins`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `GET /api/admin/epins`, a paginated, filterable ADMIN-only e-PIN issuance/redemption register, returning `EPinPageResponse(epins, page, size, totalElements)`.

**Architecture:** One new repository derived-query method (`EPinRepository.search`, null-safe optional-filter JPQL — the exact shape `LedgerEntryRepository.search` already uses), one new service method (`EPinService.list`) mapping `Page<EPin>` to `EPinPageResponse`, one new controller method (`EPinController.list`) with the standard `page`/`size` clamp, and one new `SecurityConfig` GET matcher. The `EPin` entity gains the five redemption-time columns (`redeemedTo`/`redeemedBy`/`redeemedAt`/`redemptionType`/`linkedEntityId`) it left unmapped in unit 1 — `redeemedTo` is required for the `redeemedTo` filter; the other four are mapped alongside it so the register's row shape is already correct once unit 4's redeem happy path starts populating them (unit 4's own acceptance criteria assume these entity setters already exist — it has no chartered scope to add entity mapping itself).

**Tech Stack:** Spring Boot, Spring Data JPA (derived `@Query` + `Pageable`), Spring Security (`SecurityConfig` request matchers), JUnit 5 + Mockito + AssertJ + MockMvc, H2 (`MODE=PostgreSQL`) for `@DataJpaTest`.

**Spec:** `docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md` (Decisions 4, 11, 12, 13; Flows "Admin register"; Error handling; Testing). Unit definition: `docs/superpowers/plans/2026-08-03-epin-units.md`, unit 2.

## Global Constraints

- `page`/`size` clamp: `page = Math.max(page, 0)`, `size = Math.min(size, 100)` — exact convention `AdminAssociateController.list`/`LedgerController.list` already use (spec Decision 13).
- Filters (`status`, `redeemedTo`, `batchId`) are all optional and independently combinable — null means "don't filter on this" (spec Decision 4).
- Response shape is `EPinPageResponse(epins, page, size, totalElements)`, matching `AdminAssociatePageResponse`'s exact field shape (spec Flows "Admin register").
- `GET /api/admin/epins` is ADMIN-only: associate token → 403, no token → 401 (spec Decision 12).
- Full code visibility, no masking, on every row a caller already has visibility into (spec Resolved decisions #4).
- No redeem-side write logic in this unit (that's units 3/4) — only the entity mapping/read path this GET endpoint needs.

---

## Task 1: Map the redemption columns onto `EPin`, add `RedemptionType`

**Files:**
- Create: `backend/src/main/java/com/plotchain/epin/RedemptionType.java`
- Modify: `backend/src/main/java/com/plotchain/epin/EPin.java`
- Test: `backend/src/test/java/com/plotchain/epin/EPinRepositoryTest.java`

**Interfaces:**
- Consumes: nothing new (migration `V33__epin.sql`, already merged, already created `redeemed_to`/`redeemed_by`/`redeemed_at`/`redemption_type`/`linked_entity_id` as nullable columns).
- Produces: `RedemptionType` enum (`ACTIVATION`, `TOPUP`); `EPin.getRedeemedTo()/setRedeemedTo(UUID)`, `getRedeemedBy()/setRedeemedBy(UUID)`, `getRedeemedAt()/setRedeemedAt(Instant)`, `getRedemptionType()/setRedemptionType(RedemptionType)`, `getLinkedEntityId()/setLinkedEntityId(UUID)` — later tasks in this plan (and unit 4, out of this plan's scope) read/write these.

- [ ] **Step 1: Write the failing test**

Add to `backend/src/test/java/com/plotchain/epin/EPinRepositoryTest.java` (new test method; existing tests/imports stay as-is):

```java
    @Test
    void redemptionFieldsRoundTripThroughFindById() {
        UUID adminId = persistAdmin();
        UUID redeemedToId = persistAdmin();
        UUID linkedEntityId = UUID.randomUUID();
        EPin epin = newEPin("code-for-roundtrip", UUID.randomUUID(), adminId);
        epin.setStatus(EPinStatus.USED);
        epin.setRedeemedTo(redeemedToId);
        epin.setRedeemedBy(adminId);
        epin.setRedeemedAt(Instant.now());
        epin.setRedemptionType(RedemptionType.ACTIVATION);
        epin.setLinkedEntityId(linkedEntityId);
        UUID id = epinRepository.saveAndFlush(epin).getId();
        entityManager.clear();

        EPin reloaded = epinRepository.findById(id).orElseThrow();

        assertThat(reloaded.getRedeemedTo()).isEqualTo(redeemedToId);
        assertThat(reloaded.getRedeemedBy()).isEqualTo(adminId);
        assertThat(reloaded.getRedeemedAt()).isNotNull();
        assertThat(reloaded.getRedemptionType()).isEqualTo(RedemptionType.ACTIVATION);
        assertThat(reloaded.getLinkedEntityId()).isEqualTo(linkedEntityId);
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && mvn -q -Dtest=EPinRepositoryTest#redemptionFieldsRoundTripThroughFindById test`
Expected: FAIL — compile error, `EPin` has no `setRedeemedTo`/etc. (method not defined) and `RedemptionType` doesn't exist.

- [ ] **Step 3: Create `RedemptionType`**

```java
package com.plotchain.epin;

// epin-domain unit 2 (docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md,
// Decision 6): closed enum, not free text -- the PRD names exactly these two redemption
// occasions ("used at associate activation or plot top-up time"). Matches the
// chk_epin_redemption_type CHECK constraint (migration V33).
public enum RedemptionType {
    ACTIVATION,
    TOPUP
}
```

- [ ] **Step 4: Map the redemption columns onto `EPin`**

Replace the whole file `backend/src/main/java/com/plotchain/epin/EPin.java` with:

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

// epin-domain unit 1 mapped only the generation-time columns (id/code/batchId/status/
// generatedBy/generatedAt). Unit 2 (docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md,
// Data model section) adds the five redemption-time columns that migration V33 already created
// as nullable: redeemedTo is needed for the admin register's redeemedTo filter, and the other
// four (redeemedBy/redeemedAt/redemptionType/linkedEntityId) are mapped alongside it so the
// register's row shape (EPinResponse, this unit) is already correct once unit 4's redeem happy
// path starts populating them -- unit 4's own acceptance criteria assume these entity setters
// already exist and it has no chartered scope to add entity mapping itself. No redeem write
// logic lands here (units 3/4); this unit only reads/returns whatever is in these columns
// (currently always null, since every row today is UNUSED).
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

    @Column(name = "redeemed_to")
    private UUID redeemedTo;

    @Column(name = "redeemed_by")
    private UUID redeemedBy;

    @Column(name = "redeemed_at")
    private Instant redeemedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "redemption_type")
    private RedemptionType redemptionType;

    @Column(name = "linked_entity_id")
    private UUID linkedEntityId;

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
    public UUID getRedeemedTo() { return redeemedTo; }
    public void setRedeemedTo(UUID redeemedTo) { this.redeemedTo = redeemedTo; }
    public UUID getRedeemedBy() { return redeemedBy; }
    public void setRedeemedBy(UUID redeemedBy) { this.redeemedBy = redeemedBy; }
    public Instant getRedeemedAt() { return redeemedAt; }
    public void setRedeemedAt(Instant redeemedAt) { this.redeemedAt = redeemedAt; }
    public RedemptionType getRedemptionType() { return redemptionType; }
    public void setRedemptionType(RedemptionType redemptionType) { this.redemptionType = redemptionType; }
    public UUID getLinkedEntityId() { return linkedEntityId; }
    public void setLinkedEntityId(UUID linkedEntityId) { this.linkedEntityId = linkedEntityId; }
}
```

Also add these two imports to `backend/src/test/java/com/plotchain/epin/EPinRepositoryTest.java` (needed by Step 1's test — `entityManager.clear()` uses the already-autowired `TestEntityManager`, no new import needed for that call itself):

No new imports are required beyond what the file already has (`Instant`, `UUID`, `assertThat` are already imported); `RedemptionType` is in the same package so needs no import.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && mvn -q -Dtest=EPinRepositoryTest test`
Expected: PASS — all `EPinRepositoryTest` tests green, including the new one and the pre-existing `duplicateCodeInsertIsRejectedByTheUniqueConstraint`.

- [ ] **Step 6: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/main/java/com/plotchain/epin/RedemptionType.java \
        backend/src/main/java/com/plotchain/epin/EPin.java \
        backend/src/test/java/com/plotchain/epin/EPinRepositoryTest.java
git commit -m "$(cat <<'EOF'
feat(epin): map redemption columns onto EPin entity, add RedemptionType

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `EPinRepository.search` — the register's filter query

**Files:**
- Modify: `backend/src/main/java/com/plotchain/epin/EPinRepository.java`
- Test: `backend/src/test/java/com/plotchain/epin/EPinRepositoryTest.java`

**Interfaces:**
- Consumes: `EPin.getRedeemedTo()`/`setRedeemedTo` etc. (Task 1).
- Produces: `EPinRepository.search(EPinStatus status, UUID redeemedTo, UUID batchId, Pageable pageable): Page<EPin>` — Task 3's `EPinService.list` calls this.

- [ ] **Step 1: Write the failing tests**

Add to `backend/src/test/java/com/plotchain/epin/EPinRepositoryTest.java`, and add two imports at the top of the file (`import org.springframework.data.domain.Page;` and `import org.springframework.data.domain.PageRequest;`):

```java
    @Test
    void searchFiltersByStatusRedeemedToAndBatchIdIndependentlyAndInCombination() {
        UUID adminId = persistAdmin();
        UUID associateA = persistAdmin();
        UUID associateB = persistAdmin();
        UUID batchA = UUID.randomUUID();
        UUID batchB = UUID.randomUUID();

        EPin unusedInBatchA = epinRepository.saveAndFlush(newEPin("code-1", batchA, adminId));

        EPin usedForA = newEPin("code-2", batchA, adminId);
        usedForA.setStatus(EPinStatus.USED);
        usedForA.setRedeemedTo(associateA);
        usedForA.setRedeemedBy(adminId);
        usedForA.setRedeemedAt(Instant.now());
        usedForA.setRedemptionType(RedemptionType.ACTIVATION);
        epinRepository.saveAndFlush(usedForA);

        EPin usedForBInBatchB = newEPin("code-3", batchB, adminId);
        usedForBInBatchB.setStatus(EPinStatus.USED);
        usedForBInBatchB.setRedeemedTo(associateB);
        usedForBInBatchB.setRedeemedBy(adminId);
        usedForBInBatchB.setRedeemedAt(Instant.now());
        usedForBInBatchB.setRedemptionType(RedemptionType.TOPUP);
        epinRepository.saveAndFlush(usedForBInBatchB);

        Page<EPin> byStatus = epinRepository.search(EPinStatus.UNUSED, null, null, PageRequest.of(0, 20));
        assertThat(byStatus.getContent()).extracting(EPin::getId).containsExactly(unusedInBatchA.getId());

        Page<EPin> byRedeemedTo = epinRepository.search(null, associateA, null, PageRequest.of(0, 20));
        assertThat(byRedeemedTo.getContent()).extracting(EPin::getId).containsExactly(usedForA.getId());

        Page<EPin> byBatchId = epinRepository.search(null, null, batchB, PageRequest.of(0, 20));
        assertThat(byBatchId.getContent()).extracting(EPin::getId).containsExactly(usedForBInBatchB.getId());

        Page<EPin> combined = epinRepository.search(EPinStatus.USED, associateA, batchA, PageRequest.of(0, 20));
        assertThat(combined.getContent()).extracting(EPin::getId).containsExactly(usedForA.getId());

        Page<EPin> unfiltered = epinRepository.search(null, null, null, PageRequest.of(0, 20));
        assertThat(unfiltered.getTotalElements()).isEqualTo(3);
    }

    @Test
    void searchOrdersByGeneratedAtDescendingAndPaginatesCorrectly() {
        UUID adminId = persistAdmin();
        EPin earlier = newEPin("code-earlier", UUID.randomUUID(), adminId);
        earlier.setGeneratedAt(Instant.parse("2026-01-10T00:00:00Z"));
        epinRepository.saveAndFlush(earlier);
        EPin later = newEPin("code-later", UUID.randomUUID(), adminId);
        later.setGeneratedAt(Instant.parse("2026-01-20T00:00:00Z"));
        epinRepository.saveAndFlush(later);
        EPin latest = newEPin("code-latest", UUID.randomUUID(), adminId);
        latest.setGeneratedAt(Instant.parse("2026-01-30T00:00:00Z"));
        epinRepository.saveAndFlush(latest);

        Page<EPin> firstPage = epinRepository.search(null, null, null, PageRequest.of(0, 2));
        assertThat(firstPage.getContent()).extracting(EPin::getId)
            .containsExactly(latest.getId(), later.getId());
        assertThat(firstPage.getTotalElements()).isEqualTo(3);

        Page<EPin> secondPage = epinRepository.search(null, null, null, PageRequest.of(1, 2));
        assertThat(secondPage.getContent()).extracting(EPin::getId).containsExactly(earlier.getId());
    }

    @Test
    void searchReturnsAnEmptyPageWhenNoRowMatchesTheGivenFilters() {
        persistAdmin();

        Page<EPin> result = epinRepository.search(null, UUID.randomUUID(), null, PageRequest.of(0, 20));

        assertThat(result.getContent()).isEmpty();
        assertThat(result.getTotalElements()).isZero();
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && mvn -q -Dtest=EPinRepositoryTest test`
Expected: FAIL — compile error, `EPinRepository.search(...)` not defined.

- [ ] **Step 3: Add `search` to `EPinRepository`**

Replace `backend/src/main/java/com/plotchain/epin/EPinRepository.java` with:

```java
package com.plotchain.epin;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.UUID;

public interface EPinRepository extends JpaRepository<EPin, UUID> {

    // epin-domain unit 1 (Decision 3): defensive collision re-check for EPinService's
    // generation loop, mirroring AssociateIdGenerator.generate()'s own re-check. The DB-level
    // UNIQUE constraint on code (migration V33) is the real guarantee; this is belt-and-braces.
    boolean existsByCode(String code);

    // epin-domain unit 2 (docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md,
    // Decision 4, Flows "Admin register"): all three filters are optional (null = don't filter
    // on this). Same null-safe "(:param IS NULL OR ...)" derived-query shape as
    // LedgerEntryRepository.search -- status/redeemedTo/batchId are all pure-equality UUID/enum
    // comparisons, so (unlike AssociateRepository.searchDirectory's text/date-range filters) no
    // Postgres bind-parameter CAST workaround is needed: Hibernate resolves UUID- and
    // enum-typed parameters from their Java type alone, independent of the surrounding SQL
    // expression.
    @Query("""
        SELECT e FROM EPin e
        WHERE (:status IS NULL OR e.status = :status)
        AND (:redeemedTo IS NULL OR e.redeemedTo = :redeemedTo)
        AND (:batchId IS NULL OR e.batchId = :batchId)
        ORDER BY e.generatedAt DESC
        """)
    Page<EPin> search(
        @Param("status") EPinStatus status,
        @Param("redeemedTo") UUID redeemedTo,
        @Param("batchId") UUID batchId,
        Pageable pageable);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && mvn -q -Dtest=EPinRepositoryTest test`
Expected: PASS — all `EPinRepositoryTest` tests green.

- [ ] **Step 5: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/main/java/com/plotchain/epin/EPinRepository.java \
        backend/src/test/java/com/plotchain/epin/EPinRepositoryTest.java
git commit -m "$(cat <<'EOF'
feat(epin): add EPinRepository.search for the admin register's filters

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `EPinResponse`/`EPinPageResponse` + `EPinService.list`

**Files:**
- Create: `backend/src/main/java/com/plotchain/epin/EPinResponse.java`
- Create: `backend/src/main/java/com/plotchain/epin/EPinPageResponse.java`
- Modify: `backend/src/main/java/com/plotchain/epin/EPinService.java`
- Test: `backend/src/test/java/com/plotchain/epin/EPinServiceTest.java`

**Interfaces:**
- Consumes: `EPinRepository.search(...)` (Task 2).
- Produces: `EPinService.list(EPinStatus status, UUID redeemedTo, UUID batchId, int page, int size): EPinPageResponse` — Task 4's `EPinController.list` calls this. `EPinPageResponse(List<EPinResponse> epins, int page, int size, long totalElements)`. `EPinResponse(UUID id, String code, UUID batchId, EPinStatus status, UUID generatedBy, Instant generatedAt, UUID redeemedTo, UUID redeemedBy, Instant redeemedAt, RedemptionType redemptionType, UUID linkedEntityId)`.

- [ ] **Step 1: Write the failing tests**

Add to `backend/src/test/java/com/plotchain/epin/EPinServiceTest.java`, and add two imports at the top of the file (`import org.springframework.data.domain.PageImpl;` and `import org.springframework.data.domain.PageRequest;` — `any`, `verify`, `when`, `assertThat` are already imported):

```java
    @Test
    void listReturnsAPageMappedToResponsesWithAllEPinFields() {
        UUID id = UUID.randomUUID();
        UUID batchId = UUID.randomUUID();
        UUID generatedBy = UUID.randomUUID();
        UUID redeemedTo = UUID.randomUUID();
        UUID redeemedBy = UUID.randomUUID();
        UUID linkedEntityId = UUID.randomUUID();
        Instant generatedAt = Instant.now();
        Instant redeemedAt = Instant.now();

        EPin epin = new EPin();
        epin.setId(id);
        epin.setCode("some-code");
        epin.setBatchId(batchId);
        epin.setStatus(EPinStatus.USED);
        epin.setGeneratedBy(generatedBy);
        epin.setGeneratedAt(generatedAt);
        epin.setRedeemedTo(redeemedTo);
        epin.setRedeemedBy(redeemedBy);
        epin.setRedeemedAt(redeemedAt);
        epin.setRedemptionType(RedemptionType.ACTIVATION);
        epin.setLinkedEntityId(linkedEntityId);

        when(epinRepository.search(any(), any(), any(), any()))
            .thenReturn(new PageImpl<>(List.of(epin), PageRequest.of(0, 20), 1));

        EPinPageResponse response = epinService.list(EPinStatus.USED, redeemedTo, batchId, 0, 20);

        assertThat(response.page()).isEqualTo(0);
        assertThat(response.size()).isEqualTo(20);
        assertThat(response.totalElements()).isEqualTo(1);
        EPinResponse row = response.epins().get(0);
        assertThat(row.id()).isEqualTo(id);
        assertThat(row.code()).isEqualTo("some-code");
        assertThat(row.batchId()).isEqualTo(batchId);
        assertThat(row.status()).isEqualTo(EPinStatus.USED);
        assertThat(row.generatedBy()).isEqualTo(generatedBy);
        assertThat(row.generatedAt()).isEqualTo(generatedAt);
        assertThat(row.redeemedTo()).isEqualTo(redeemedTo);
        assertThat(row.redeemedBy()).isEqualTo(redeemedBy);
        assertThat(row.redeemedAt()).isEqualTo(redeemedAt);
        assertThat(row.redemptionType()).isEqualTo(RedemptionType.ACTIVATION);
        assertThat(row.linkedEntityId()).isEqualTo(linkedEntityId);
    }

    @Test
    void listPassesAllThreeFiltersAndThePageRequestThroughToSearchUnchanged() {
        UUID redeemedTo = UUID.randomUUID();
        UUID batchId = UUID.randomUUID();
        when(epinRepository.search(any(), any(), any(), any())).thenReturn(new PageImpl<>(List.of()));

        epinService.list(EPinStatus.UNUSED, redeemedTo, batchId, 2, 10);

        verify(epinRepository).search(EPinStatus.UNUSED, redeemedTo, batchId, PageRequest.of(2, 10));
    }

    @Test
    void listReturnsAnEmptyPageWhenSearchFindsNothing() {
        when(epinRepository.search(any(), any(), any(), any())).thenReturn(new PageImpl<>(List.of()));

        EPinPageResponse response = epinService.list(null, null, null, 0, 20);

        assertThat(response.epins()).isEmpty();
        assertThat(response.totalElements()).isZero();
    }
```

Also add `import java.time.Instant;` to the top of `EPinServiceTest.java` if not already present (it currently is not).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && mvn -q -Dtest=EPinServiceTest test`
Expected: FAIL — compile error, `EPinService.list(...)`, `EPinPageResponse`, `EPinResponse` not defined.

- [ ] **Step 3: Create `EPinResponse`**

```java
package com.plotchain.epin;

import java.time.Instant;
import java.util.UUID;

// epin-domain unit 2 (docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md,
// Data model): one row of the admin register, one field per EPin column. Raw UUIDs for
// generatedBy/redeemedTo/redeemedBy/linkedEntityId -- deliberately no batch-resolved associate
// userId/name enrichment like AdminLedgerEntryResponse's associateUserId/associateName:
// nothing in this spec's Decisions/Flows asks for it (unlike the Income/Ledger spec's explicit
// Decisions 11-13), this is a backend-only unit, and a future screen unit can add an
// enrichment endpoint if the admin UI turns out to need associate names inline. Full code
// visibility, no masking (spec's Resolved decisions #4).
public record EPinResponse(
    UUID id,
    String code,
    UUID batchId,
    EPinStatus status,
    UUID generatedBy,
    Instant generatedAt,
    UUID redeemedTo,
    UUID redeemedBy,
    Instant redeemedAt,
    RedemptionType redemptionType,
    UUID linkedEntityId
) {}
```

- [ ] **Step 4: Create `EPinPageResponse`**

```java
package com.plotchain.epin;

import java.util.List;

// epin-domain unit 2 (Flows "Admin register"): field shape matches AdminAssociatePageResponse
// exactly (list, page, size, totalElements).
public record EPinPageResponse(List<EPinResponse> epins, int page, int size, long totalElements) {}
```

- [ ] **Step 5: Add `list` to `EPinService`**

Replace `backend/src/main/java/com/plotchain/epin/EPinService.java` with:

```java
package com.plotchain.epin;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
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

    // epin-domain unit 2 (Flows "Admin register"): three independently-optional filters, same
    // null-safe pattern as LedgerService.adminList -- passed straight through to
    // EPinRepository.search unchanged. No batch-resolved associate enrichment (see
    // EPinResponse's own comment for why).
    public EPinPageResponse list(EPinStatus status, UUID redeemedTo, UUID batchId, int page, int size) {
        Page<EPin> result = epinRepository.search(status, redeemedTo, batchId, PageRequest.of(page, size));
        List<EPinResponse> epins = result.getContent().stream().map(this::toResponse).toList();
        return new EPinPageResponse(epins, page, size, result.getTotalElements());
    }

    private EPinResponse toResponse(EPin epin) {
        return new EPinResponse(
            epin.getId(), epin.getCode(), epin.getBatchId(), epin.getStatus(),
            epin.getGeneratedBy(), epin.getGeneratedAt(),
            epin.getRedeemedTo(), epin.getRedeemedBy(), epin.getRedeemedAt(),
            epin.getRedemptionType(), epin.getLinkedEntityId());
    }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && mvn -q -Dtest=EPinServiceTest test`
Expected: PASS — all `EPinServiceTest` tests green, including the pre-existing `generateBatch...` tests.

- [ ] **Step 7: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/main/java/com/plotchain/epin/EPinResponse.java \
        backend/src/main/java/com/plotchain/epin/EPinPageResponse.java \
        backend/src/main/java/com/plotchain/epin/EPinService.java \
        backend/src/test/java/com/plotchain/epin/EPinServiceTest.java
git commit -m "$(cat <<'EOF'
feat(epin): add EPinService.list and the register response types

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `GET /api/admin/epins` — controller wiring, page/size clamp

**Files:**
- Modify: `backend/src/main/java/com/plotchain/epin/EPinController.java`
- Test: `backend/src/test/java/com/plotchain/epin/EPinControllerTest.java`

**Interfaces:**
- Consumes: `EPinService.list(...)` (Task 3). Uses the existing `@MockBean EPinRepository epinRepository` already declared in `EPinControllerTest` — mirrors this test file's own established pattern (mock the repository, let the real `EPinService` run), not `LedgerControllerTest`'s pattern of mocking the service, since this file already mocks `EPinRepository` for its `generateBatch` tests and adding a second `@MockBean EPinService` in the same test class would replace the real `EPinService` bean and break those existing tests.
- Produces: `GET /api/admin/epins` route (`page`/`size` clamped 0–100) — Task 5's `SecurityConfig` matcher targets this exact route.

- [ ] **Step 1: Write the failing tests**

Add to `backend/src/test/java/com/plotchain/epin/EPinControllerTest.java`. First, add these imports (alongside the existing ones):

```java
import java.time.Instant;
import java.util.List;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
```

and these static imports:

```java
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
```

Then add the test methods:

```java
    @Test
    void listReturns200WithFilters() throws Exception {
        UUID id = UUID.randomUUID();
        UUID batchId = UUID.randomUUID();
        UUID redeemedTo = UUID.randomUUID();
        EPin epin = new EPin();
        epin.setId(id);
        epin.setCode("some-code");
        epin.setBatchId(batchId);
        epin.setStatus(EPinStatus.USED);
        epin.setGeneratedBy(UUID.randomUUID());
        epin.setGeneratedAt(Instant.now());
        epin.setRedeemedTo(redeemedTo);
        epin.setRedeemedBy(UUID.randomUUID());
        epin.setRedeemedAt(Instant.now());
        epin.setRedemptionType(RedemptionType.ACTIVATION);
        when(epinRepository.search(eq(EPinStatus.USED), eq(redeemedTo), eq(batchId), any()))
            .thenReturn(new PageImpl<>(List.of(epin), PageRequest.of(0, 20), 1));

        mockMvc.perform(get("/api/admin/epins")
                .param("status", "USED")
                .param("redeemedTo", redeemedTo.toString())
                .param("batchId", batchId.toString())
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.epins[0].id").value(id.toString()))
            .andExpect(jsonPath("$.epins[0].code").value("some-code"))
            .andExpect(jsonPath("$.epins[0].status").value("USED"))
            .andExpect(jsonPath("$.epins[0].redeemedTo").value(redeemedTo.toString()))
            .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void listReturns200WithAnEmptyPageWhenUnfiltered() throws Exception {
        when(epinRepository.search(isNull(), isNull(), isNull(), any()))
            .thenReturn(new PageImpl<>(List.of()));

        mockMvc.perform(get("/api/admin/epins")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.epins").isEmpty())
            .andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    void listClampsAnOversizedPageSizeToTheServerSideMaximum() throws Exception {
        when(epinRepository.search(isNull(), isNull(), isNull(), eq(PageRequest.of(0, 100))))
            .thenReturn(new PageImpl<>(List.of()));

        mockMvc.perform(get("/api/admin/epins").param("size", "999999")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk());

        verify(epinRepository).search(isNull(), isNull(), isNull(), eq(PageRequest.of(0, 100)));
    }

    @Test
    void listClampsANegativePageToZeroInsteadOfThrowing() throws Exception {
        when(epinRepository.search(isNull(), isNull(), isNull(), eq(PageRequest.of(0, 20))))
            .thenReturn(new PageImpl<>(List.of()));

        mockMvc.perform(get("/api/admin/epins").param("page", "-5")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk());

        verify(epinRepository).search(isNull(), isNull(), isNull(), eq(PageRequest.of(0, 20)));
    }

    @Test
    void listReturns400ForAnInvalidStatusValue() throws Exception {
        mockMvc.perform(get("/api/admin/epins").param("status", "NOT_A_STATUS")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("invalid value for status"));
    }

    @Test
    void listReturns400ForAnInvalidUuidInRedeemedTo() throws Exception {
        mockMvc.perform(get("/api/admin/epins").param("redeemedTo", "not-a-uuid")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("invalid value for redeemedTo"));
    }

    @Test
    void listIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/admin/epins")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    @Test
    void listIsUnauthorizedWithoutAToken() throws Exception {
        mockMvc.perform(get("/api/admin/epins"))
            .andExpect(status().isUnauthorized());
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && mvn -q -Dtest=EPinControllerTest test`
Expected: FAIL — `listReturns200WithFilters` etc. 404 (no `GET /api/admin/epins` mapping exists yet); `listIsForbiddenForAnAssociateToken` and `listIsUnauthorizedWithoutAToken` also fail since a 404 falls through security to `anyRequest().authenticated()`, which the associate token satisfies (200/404 rather than 403), so both need Task 5's `SecurityConfig` matcher too — that's expected and resolved after Task 5, not a bug in this step.

- [ ] **Step 3: Add `list` to `EPinController`**

Replace `backend/src/main/java/com/plotchain/epin/EPinController.java` with:

```java
package com.plotchain.epin;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
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

    // epin-domain unit 2 (docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md,
    // Flows "Admin register", Decision 13): same page/size clamp convention as
    // AdminAssociateController.list/LedgerController.list -- clamped here, not left to
    // EPinService, so every caller of EPinService.list (there is only this one today) still has
    // to pass an already-clamped page/size, same division of responsibility as those two
    // controllers.
    @GetMapping
    public EPinPageResponse list(
            @RequestParam(required = false) EPinStatus status,
            @RequestParam(required = false) UUID redeemedTo,
            @RequestParam(required = false) UUID batchId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        page = Math.max(page, 0);
        size = Math.min(size, 100);
        return epinService.list(status, redeemedTo, batchId, page, size);
    }
}
```

- [ ] **Step 4: Run tests to verify they pass (except the two auth tests, until Task 5)**

Run: `cd backend && mvn -q -Dtest=EPinControllerTest test`
Expected: `listReturns200WithFilters`, `listReturns200WithAnEmptyPageWhenUnfiltered`, `listClampsAnOversizedPageSizeToTheServerSideMaximum`, `listClampsANegativePageToZeroInsteadOfThrowing`, `listReturns400ForAnInvalidStatusValue`, `listReturns400ForAnInvalidUuidInRedeemedTo` PASS. `listIsForbiddenForAnAssociateToken` and `listIsUnauthorizedWithoutAToken` still FAIL (no `SecurityConfig` matcher yet — the route is reachable by any authenticated caller and returns 200, not 403/401) — expected at this point; Task 5 fixes them.

- [ ] **Step 5: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/main/java/com/plotchain/epin/EPinController.java \
        backend/src/test/java/com/plotchain/epin/EPinControllerTest.java
git commit -m "$(cat <<'EOF'
feat(epin): add GET /api/admin/epins register endpoint

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `SecurityConfig` ADMIN-only matcher for `GET /api/admin/epins`

**Files:**
- Modify: `backend/src/main/java/com/plotchain/auth/SecurityConfig.java`
- Modify: `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`

**Interfaces:**
- Consumes: `GET /api/admin/epins` route (Task 4).
- Produces: ADMIN-only enforcement for that route — no other unit depends on this.

- [ ] **Step 1: Write the failing test**

Add to `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`, directly after the existing `adminEpinsGenerateBatchIsReachableOnlyForAdminAndForbiddenForEveryOtherRole` test (around line 565 — `get` and `ParameterizedTest`/`EnumSource` are already imported and used by the neighboring `adminSalesListIsReachable...`/`adminLedgerListIsReachable...` tests, so no new imports are needed):

```java
    // epin-domain unit 2 (docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md,
    // "Admin register -- GET /api/admin/epins, ADMIN-only", Decision 12): same target-role-model
    // pattern as adminSalesListIsReachableOnlyForAdminAndForbiddenForEveryOtherRole and
    // adminLedgerListIsReachableOnlyForAdminAndForbiddenForEveryOtherRole above. An ADMIN token
    // reaches the real (H2, unmocked) EPinRepository and gets 200 with an empty page -- there's
    // no not-found case for a list endpoint. Every other role, including the soon-to-be-deleted
    // admin-family sub-roles, is blocked at the filter layer before the controller ever runs.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminEpinsListIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        mockMvc.perform(get("/api/admin/epins")
                .header("Authorization", "Bearer " + tokenFor(role)))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 200 : 403));
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && mvn -q -Dtest=SecurityConfigTest#adminEpinsListIsReachableOnlyForAdminAndForbiddenForEveryOtherRole test`
Expected: FAIL for every non-ADMIN role — `GET /api/admin/epins` currently falls through to `anyRequest().authenticated()`, so any authenticated associate token gets 200, not 403.

Also re-run `EPinControllerTest` to confirm its two still-red tests from Task 4:
Run: `cd backend && mvn -q -Dtest=EPinControllerTest#listIsForbiddenForAnAssociateToken+listIsUnauthorizedWithoutAToken test`
Expected: FAIL (same underlying cause).

- [ ] **Step 3: Add the `SecurityConfig` matcher**

In `backend/src/main/java/com/plotchain/auth/SecurityConfig.java`, insert immediately after the existing `POST /api/admin/epins` matcher (currently lines 205–214) and before the blanket `POST /api/**` rule (currently line 215):

```java
                // Admin e-PIN register: ADMIN-only, per epin-domain unit 2
                // (docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md,
                // Decision 12: "...and an explicit SecurityConfig GET matcher (for the register
                // list)"), same target-role-model pattern as GET /api/admin/sales and GET
                // /api/admin/ledger above -- not the admin-family hasAnyAuthority(...) pattern
                // most other admin GETs still use. Grouped here with the POST
                // /api/admin/epins matcher directly above for readability; a GET never collides
                // with the POST/PUT/PATCH/DELETE blanket rules, so there's no first-match-wins
                // ordering requirement forcing it to live in any one spot.
                .requestMatchers(HttpMethod.GET, "/api/admin/epins")
                    .hasAuthority("ADMIN")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && mvn -q -Dtest=SecurityConfigTest,EPinControllerTest,EPinServiceTest,EPinRepositoryTest test`
Expected: PASS — every test in all four files, including `adminEpinsListIsReachableOnlyForAdminAndForbiddenForEveryOtherRole`, `EPinControllerTest#listIsForbiddenForAnAssociateToken`, and `EPinControllerTest#listIsUnauthorizedWithoutAToken`.

- [ ] **Step 5: Run the full backend test suite**

Run: `cd backend && mvn -q test`
Expected: BUILD SUCCESS (aside from the ~55 pre-existing, unrelated Mockito/JDK21-25 spurious errors recorded in memory — not caused by this change).

- [ ] **Step 6: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/main/java/com/plotchain/auth/SecurityConfig.java \
        backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java
git commit -m "$(cat <<'EOF'
feat(epin): add ADMIN-only SecurityConfig matcher for GET /api/admin/epins

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Notes (for the plan author / reviewer, not a task)

- **Spec coverage:** `EPinPageResponse` shape (Task 3) ✓; combinable optional filters (Task 2/3/4) ✓; page/size clamp 0–100 (Task 4) ✓; status=UNUSED / redeemedTo reconciliation semantics — a direct consequence of the filter query (Task 2), no separate task needed, exercised by Task 2's `searchFiltersByStatusRedeemedToAndBatchIdIndependentlyAndInCombination` ✓; 403/401 (Task 4 controller-level + Task 5 SecurityConfig-level, matching the existing `generateBatch` test's own two-layer coverage) ✓.
- **Entity-mapping scope decision:** documented inline in Task 1 and in this plan's Architecture section — `redeemedTo` is required for filtering; the other four redemption columns are mapped now (not deferred to unit 4) because unit 4's acceptance criteria assume the setters already exist and unit 4 has no chartered scope to add entity mapping itself. No redeem write logic (setting these fields at redemption time) is added here.
- **No enrichment scope creep:** `EPinResponse` deliberately stays raw-UUID (no associate userId/name batch-resolution like `AdminLedgerEntryResponse`) — noted inline as a deliberate, spec-consistent minimalism decision, not an oversight.
- **Type consistency check:** `EPinRepository.search`'s parameter order (`status, redeemedTo, batchId, pageable`) is identical across Task 2 (repository), Task 3 (`EPinService.list`'s call), and Task 4 (`EPinController.list`'s call) — verified matching in every code block above.
