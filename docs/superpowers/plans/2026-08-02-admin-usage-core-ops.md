# Admin Usage — Core Back-Office Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Associate Directory, Tree Explorer, and KYC Review Queue admin screens (backend + frontend), plus the RBAC enforcement they depend on, per `docs/superpowers/specs/2026-08-02-admin-usage-core-ops-design.md`.

**Architecture:** Backend adds a `status` column to `Associate` plus three new read/write surfaces in Spring Boot: directory endpoints and KYC-decision endpoints added to the existing `associate` package (they mutate `Associate`), and a new `tree` package for the read-only tree explorer. All mutating endpoints reuse `SettingsAuditService` for audit logging and `@PreAuthorize` (already enabled via `@EnableMethodSecurity`) for per-role narrowing beyond the existing admin-family blanket rule. Frontend adds three standalone Angular components under `frontend/src/app/admin/`, wired into the existing `settings` shell/nav-rail, following the exact patterns of `create-associate.component.ts` (forms/HTTP) and `audit-log.component.ts` (paginated list).

**Tech Stack:** Spring Boot (Java), PostgreSQL + Flyway, Spring Security (JWT, method security), JUnit 5 + Mockito + AssertJ, Angular 18 (standalone components, `@ngx-translate`), Jasmine/Karma.

## Global Constraints

- ADMIN and SUPER_ADMIN are equivalent (full access everywhere) — never write a check that treats them differently.
- Every new mutating endpoint must call `SettingsAuditService.record(section, summary, detail, actorId)` — no mutation bypasses the audit trail.
- `AssociateNotFoundException` already has a global handler (`DashboardExceptionHandler`) — do NOT add a second `@ExceptionHandler(AssociateNotFoundException.class)` anywhere; Spring's exception resolution across multiple `@RestControllerAdvice` beans for the exact same exception type is order-dependent and must be avoided.
- Directory/Tree/KYC scope is `role = ASSOCIATE` only — admin/staff accounts (Admin Team) are a separate concern with their own existing screens; every new query and lookup filters to `AssociateRole.ASSOCIATE`.
- All Angular components are `standalone: true` with inline templates, matching every existing component in this codebase — do not introduce NgModules or separate template files.
- Pagination is 0-based on the wire (`page`/`size` query params and response fields), matching `PlotPageResponse`/`SettingsAuditPageResponse`/`AuditLogPage` exactly.
- Test runner is Jasmine/Karma on the frontend (NOT Jest) and JUnit 5 + Mockito on the backend — match existing spec files' exact `TestBed`/`MockitoExtension` patterns, shown per-task below.

**Planning-time refinement of the spec, noted here since it changes an interface:** the spec's Tree Explorer search says "find a node by name/userId." This plan narrows that to **exact `userId` lookup only** (no fuzzy name search) for v1 — it matches what the reference-app recording actually showed (an "Enter Associate ID" jump field, not a fuzzy search box), and keeps the ancestor-path result unambiguous (a fuzzy name search could match multiple associates, each with a different path). If fuzzy name search turns out to be wanted later, it's an additive change to `GET /api/admin/tree/search`, not a breaking one.

---

## File Structure

**Backend — new files:**
- `backend/src/main/resources/db/migration/V15__associate_status.sql`
- `backend/src/main/java/com/plotchain/associate/AssociateStatus.java`
- `backend/src/main/java/com/plotchain/associate/AdminAssociateSummaryResponse.java`
- `backend/src/main/java/com/plotchain/associate/AdminAssociateDetailResponse.java`
- `backend/src/main/java/com/plotchain/associate/AdminAssociatePageResponse.java`
- `backend/src/main/java/com/plotchain/associate/ResetPasswordResponse.java`
- `backend/src/main/java/com/plotchain/associate/AdminAssociateService.java`
- `backend/src/main/java/com/plotchain/associate/AdminAssociateController.java`
- `backend/src/main/java/com/plotchain/associate/KycDecisionRequest.java`
- `backend/src/main/java/com/plotchain/associate/KycQueueEntryResponse.java`
- `backend/src/main/java/com/plotchain/associate/KycPageResponse.java`
- `backend/src/main/java/com/plotchain/associate/InvalidKycDecisionException.java`
- `backend/src/main/java/com/plotchain/associate/KycReviewService.java`
- `backend/src/main/java/com/plotchain/associate/KycReviewController.java`
- `backend/src/main/java/com/plotchain/tree/TreeNodeResponse.java`
- `backend/src/main/java/com/plotchain/tree/TreeNodeSummary.java`
- `backend/src/main/java/com/plotchain/tree/TreeSearchResponse.java`
- `backend/src/main/java/com/plotchain/tree/TreeExplorerService.java`
- `backend/src/main/java/com/plotchain/tree/TreeExplorerController.java`

**Backend — modified files:**
- `backend/src/main/java/com/plotchain/associate/Associate.java` (add `status` field)
- `backend/src/main/java/com/plotchain/associate/AssociateRepository.java` (add query methods)
- `backend/src/main/java/com/plotchain/associate/AssociateNotFoundException.java` (add userId-based constructor overload)
- `backend/src/main/java/com/plotchain/associate/AssociateProvisioningExceptionHandler.java` (add `InvalidKycDecisionException` handler)
- `backend/src/main/java/com/plotchain/auth/AuthService.java` (suspended-login gate)
- `backend/src/main/java/com/plotchain/auth/SecurityConfig.java` (new GET matchers)

**Backend — new test files:** one test file per new main file above (see per-task steps for exact names and content).

**Frontend — new files:**
- `frontend/src/app/admin/models/admin-associate-summary.model.ts`
- `frontend/src/app/admin/models/admin-associate-detail.model.ts`
- `frontend/src/app/admin/models/admin-associate-page.model.ts`
- `frontend/src/app/admin/associate-directory/associate-directory.service.ts` (+ `.spec.ts`)
- `frontend/src/app/admin/associate-directory/associate-directory.component.ts` (+ `.spec.ts`)
- `frontend/src/app/admin/models/tree-node.model.ts`
- `frontend/src/app/admin/models/tree-search.model.ts`
- `frontend/src/app/admin/tree-explorer/tree-explorer.service.ts` (+ `.spec.ts`)
- `frontend/src/app/admin/tree-explorer/tree-explorer.component.ts` (+ `.spec.ts`)
- `frontend/src/app/admin/models/kyc-queue-entry.model.ts`
- `frontend/src/app/admin/models/kyc-page.model.ts`
- `frontend/src/app/admin/kyc-queue/kyc-queue.service.ts` (+ `.spec.ts`)
- `frontend/src/app/admin/kyc-queue/kyc-queue.component.ts` (+ `.spec.ts`)

**Frontend — modified files:**
- `frontend/src/app/app.routes.ts` (three new routes under `settings`)
- `frontend/src/app/settings/settings-nav-rail.component.ts` (three new nav entries)
- `frontend/src/assets/i18n/en.json` and `frontend/src/assets/i18n/hi.json` (new translation keys — English content only; Hindi translation text is a follow-up, structure/keys must stay in sync per this repo's existing convention)

---

## Task 1: Associate suspension — migration, entity, login gate

**Files:**
- Create: `backend/src/main/resources/db/migration/V15__associate_status.sql`
- Create: `backend/src/main/java/com/plotchain/associate/AssociateStatus.java`
- Modify: `backend/src/main/java/com/plotchain/associate/Associate.java`
- Create: `backend/src/main/java/com/plotchain/auth/AssociateSuspendedException.java`
- Modify: `backend/src/main/java/com/plotchain/auth/AuthService.java`
- Modify: `backend/src/main/java/com/plotchain/auth/AuthExceptionHandler.java`
- Test: `backend/src/test/java/com/plotchain/auth/AuthServiceTest.java` (add cases)
- Test: `backend/src/test/java/com/plotchain/associate/AssociateRepositoryTest.java` (add case, if it covers entity persistence — otherwise a new minimal check is added inline in Task 2's repository test)

**Interfaces:**
- Produces: `AssociateStatus` enum (`ACTIVE`, `SUSPENDED`) — `Associate.getStatus()`/`setStatus(AssociateStatus)`, defaults to `ACTIVE`. `AssociateSuspendedException` (auth package), thrown by `AuthService.login()`.

- [ ] **Step 1: Add the migration**

```sql
-- Admin-imposed suspension (login-access gate), distinct from the date-range-computed
-- "active/inactive" business-activity concept already served by
-- AssociateRepository.countActiveToday against last_active_at.
ALTER TABLE associate ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE associate ADD CONSTRAINT chk_associate_status CHECK (status IN ('ACTIVE','SUSPENDED'));
```

Save as `backend/src/main/resources/db/migration/V15__associate_status.sql`.

- [ ] **Step 2: Add the `AssociateStatus` enum**

```java
package com.plotchain.associate;

public enum AssociateStatus { ACTIVE, SUSPENDED }
```

- [ ] **Step 3: Add the `status` field to `Associate`**

In `Associate.java`, add the import `java.util.UUID` is already present; add near the other `@Enumerated` fields (after `kycStatus`):

```java
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private AssociateStatus status = AssociateStatus.ACTIVE;
```

And the accessor pair, alongside the other getters/setters:

```java
    public AssociateStatus getStatus() { return status; }
    public void setStatus(AssociateStatus status) { this.status = status; }
```

- [ ] **Step 4: Write the failing test for the login gate**

Add to `backend/src/test/java/com/plotchain/auth/AuthServiceTest.java`, following the exact pattern of `rejectsAnAssociateLoginWhilePlatformIsNotLive`:

```java
    @Test
    void rejectsLoginForASuspendedAssociate() {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(AssociateRole.ASSOCIATE);
        associate.setPasswordHash(passwordEncoder.encode("Password123!"));
        associate.setStatus(AssociateStatus.SUSPENDED);
        when(associateRepository.findByUserId("jane")).thenReturn(Optional.of(associate));

        assertThatThrownBy(() -> authService.login(new LoginRequest("jane", "Password123!")))
            .isInstanceOf(AssociateSuspendedException.class);

        verify(associateRepository, never()).save(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void admitsLoginForAnActiveAssociate() {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(AssociateRole.ASSOCIATE);
        associate.setPasswordHash(passwordEncoder.encode("Password123!"));
        associate.setStatus(AssociateStatus.ACTIVE);
        when(associateRepository.findByUserId("jane")).thenReturn(Optional.of(associate));
        stubLaunched(true);

        LoginResponse response = authService.login(new LoginRequest("jane", "Password123!"));

        assertThat(response.token()).isNotBlank();
    }
```

Add `import com.plotchain.associate.AssociateStatus;` to the test's imports.

- [ ] **Step 5: Run the tests to verify they fail**

Run: `cd backend && mvn test -Dtest=AuthServiceTest`
Expected: FAIL — `AssociateSuspendedException` does not exist yet (compile error), and the suspended-login test has no gate to trigger it.

- [ ] **Step 6: Create `AssociateSuspendedException` and add the gate**

```java
package com.plotchain.auth;

public class AssociateSuspendedException extends RuntimeException {
    public AssociateSuspendedException() {
        super("Your account has been suspended. Please contact your administrator.");
    }
}
```

In `AuthService.java`, insert the check right after the password match and before `setLastActiveAt` (a suspended associate's failed login attempt shouldn't update their last-active timestamp):

```java
        if (!passwordEncoder.matches(request.password(), associate.getPasswordHash())) {
            throw new InvalidCredentialsException();
        }

        if (associate.getStatus() == com.plotchain.associate.AssociateStatus.SUSPENDED) {
            throw new AssociateSuspendedException();
        }

        associate.setLastActiveAt(Instant.now());
```

(Use a proper import `com.plotchain.associate.AssociateStatus;` at the top of the file instead of the fully-qualified reference above — written inline here only for clarity of insertion point.)

- [ ] **Step 7: Add the exception handler**

In `AuthExceptionHandler.java`, add, following the exact pattern of `handlePlatformNotLive` (same status code, same "report the real reason" reasoning — a suspension notice is not a credential-guessing risk):

```java
    @ExceptionHandler(AssociateSuspendedException.class)
    public ResponseEntity<Map<String, String>> handleAssociateSuspended(AssociateSuspendedException ex) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", ex.getMessage()));
    }
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd backend && mvn test -Dtest=AuthServiceTest`
Expected: PASS, all cases including the two new ones.

- [ ] **Step 9: Commit**

```bash
git add backend/src/main/resources/db/migration/V15__associate_status.sql \
        backend/src/main/java/com/plotchain/associate/AssociateStatus.java \
        backend/src/main/java/com/plotchain/associate/Associate.java \
        backend/src/main/java/com/plotchain/auth/AssociateSuspendedException.java \
        backend/src/main/java/com/plotchain/auth/AuthService.java \
        backend/src/main/java/com/plotchain/auth/AuthExceptionHandler.java \
        backend/src/test/java/com/plotchain/auth/AuthServiceTest.java
git commit -m "feat(auth): add associate suspension status and login gate"
```

---

## Task 2: Associate Directory — backend

**Files:**
- Modify: `backend/src/main/java/com/plotchain/associate/AssociateRepository.java`
- Modify: `backend/src/main/java/com/plotchain/associate/AssociateNotFoundException.java`
- Create: `backend/src/main/java/com/plotchain/associate/AdminAssociateSummaryResponse.java`
- Create: `backend/src/main/java/com/plotchain/associate/AdminAssociateDetailResponse.java`
- Create: `backend/src/main/java/com/plotchain/associate/AdminAssociatePageResponse.java`
- Create: `backend/src/main/java/com/plotchain/associate/ResetPasswordResponse.java`
- Create: `backend/src/main/java/com/plotchain/associate/AdminAssociateService.java`
- Create: `backend/src/main/java/com/plotchain/associate/AdminAssociateController.java`
- Modify: `backend/src/main/java/com/plotchain/auth/SecurityConfig.java`
- Test: `backend/src/test/java/com/plotchain/associate/AssociateRepositoryTest.java` (new file)
- Test: `backend/src/test/java/com/plotchain/associate/AdminAssociateServiceTest.java` (new file)
- Test: `backend/src/test/java/com/plotchain/associate/AdminAssociateControllerTest.java` (new file)
- Test: `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java` (add cases)

**Interfaces:**
- Consumes: `AssociateStatus` (Task 1), `AssociateRepository`, `RankTierRepository.findAllByOrderByRankOrder(): List<RankTier>`, `CycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus): Optional<Cycle>`, `LegVolumeRepository.findByAssociateIdAndCycleId(UUID, UUID): Optional<LegVolume>`, `TemporaryPasswordGenerator.generate(): String`, `SettingsAuditService.record(String, String, Object, UUID): void`.
- Produces: `AdminAssociateService` with methods `list(String search, UUID rankId, KycStatus kycStatus, AssociateStatus status, LocalDate joinedFrom, LocalDate joinedTo, int page, int size): AdminAssociatePageResponse`, `get(UUID id): AdminAssociateDetailResponse`, `suspend(UUID id, UUID actorId): AdminAssociateDetailResponse`, `reactivate(UUID id, UUID actorId): AdminAssociateDetailResponse`, `resetPassword(UUID id, UUID actorId): ResetPasswordResponse`. `AdminAssociateController` at `/api/admin/associates`.

- [ ] **Step 1: Write the failing repository test**

Create `backend/src/test/java/com/plotchain/associate/AssociateRepositoryTest.java`:

```java
package com.plotchain.associate;

import com.plotchain.rank.RankTier;
import com.plotchain.rank.RankTierRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@ActiveProfiles("test")
class AssociateRepositoryTest {

    @Autowired AssociateRepository associateRepository;
    @Autowired RankTierRepository rankTierRepository;
    @Autowired TestEntityManager entityManager;

    private RankTier persistRank(String name, int order) {
        RankTier rank = new RankTier(UUID.randomUUID(), name, order, BigDecimal.valueOf(5000));
        entityManager.persist(rank);
        return rank;
    }

    private Associate persistAssociate(String userId, String name, AssociateRole role, UUID rankId,
                                        KycStatus kycStatus, AssociateStatus status, Instant joinedAt) {
        Associate a = new Associate();
        a.setId(UUID.randomUUID());
        a.setUserId(userId);
        a.setName(name);
        a.setRole(role);
        a.setRankId(rankId);
        a.setKycStatus(kycStatus);
        a.setStatus(status);
        a.setJoinedAt(joinedAt);
        a.setPasswordHash("hash");
        a.setCumulativeMatchedVolume(BigDecimal.ZERO);
        a.setMustChangePassword(false);
        entityManager.persist(a);
        return a;
    }

    @Test
    void findByIdAndRoleOnlyMatchesAssociateRoleRows() {
        RankTier rank = persistRank("Sales Associate", 1);
        Associate associate = persistAssociate("VP00001", "Jane", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.PENDING, AssociateStatus.ACTIVE, Instant.now());
        Associate admin = persistAssociate("admin", "Admin", AssociateRole.ADMIN, null,
            KycStatus.VERIFIED, AssociateStatus.ACTIVE, Instant.now());
        entityManager.flush();

        assertThat(associateRepository.findByIdAndRole(associate.getId(), AssociateRole.ASSOCIATE)).isPresent();
        assertThat(associateRepository.findByIdAndRole(admin.getId(), AssociateRole.ASSOCIATE)).isEmpty();
    }

    @Test
    void countByParentIdCountsOnlyDirectChildren() {
        RankTier rank = persistRank("Sales Associate", 1);
        Associate parent = persistAssociate("VP00001", "Parent", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.PENDING, AssociateStatus.ACTIVE, Instant.now());
        Associate child = persistAssociate("VP00002", "Child", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.PENDING, AssociateStatus.ACTIVE, Instant.now());
        child.setParentId(parent.getId());
        Associate grandchild = persistAssociate("VP00003", "Grandchild", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.PENDING, AssociateStatus.ACTIVE, Instant.now());
        grandchild.setParentId(child.getId());
        entityManager.flush();

        assertThat(associateRepository.countByParentId(parent.getId())).isEqualTo(1);
    }

    @Test
    void searchDirectoryFiltersBySearchRankKycStatusAndStatus() {
        RankTier rankA = persistRank("Sales Associate", 1);
        RankTier rankB = persistRank("Sales Executive", 2);
        persistAssociate("VP00001", "Jane Doe", AssociateRole.ASSOCIATE, rankA.getId(),
            KycStatus.VERIFIED, AssociateStatus.ACTIVE, Instant.now());
        persistAssociate("VP00002", "John Smith", AssociateRole.ASSOCIATE, rankB.getId(),
            KycStatus.PENDING, AssociateStatus.SUSPENDED, Instant.now());
        persistAssociate("admin", "Admin", AssociateRole.ADMIN, null,
            KycStatus.VERIFIED, AssociateStatus.ACTIVE, Instant.now());
        entityManager.flush();

        Page<Associate> bySearch = associateRepository.searchDirectory(
            "jane", null, null, null, null, null, PageRequest.of(0, 20));
        assertThat(bySearch.getContent()).extracting(Associate::getUserId).containsExactly("VP00001");

        Page<Associate> byRank = associateRepository.searchDirectory(
            null, rankB.getId(), null, null, null, null, PageRequest.of(0, 20));
        assertThat(byRank.getContent()).extracting(Associate::getUserId).containsExactly("VP00002");

        Page<Associate> byKycStatus = associateRepository.searchDirectory(
            null, null, KycStatus.PENDING, null, null, null, PageRequest.of(0, 20));
        assertThat(byKycStatus.getContent()).extracting(Associate::getUserId).containsExactly("VP00002");

        Page<Associate> byStatus = associateRepository.searchDirectory(
            null, null, null, AssociateStatus.SUSPENDED, null, null, PageRequest.of(0, 20));
        assertThat(byStatus.getContent()).extracting(Associate::getUserId).containsExactly("VP00002");

        Page<Associate> noFilters = associateRepository.searchDirectory(
            null, null, null, null, null, null, PageRequest.of(0, 20));
        assertThat(noFilters.getContent()).extracting(Associate::getUserId)
            .containsExactlyInAnyOrder("VP00001", "VP00002");
    }

    @Test
    void searchDirectoryFiltersByJoinedDateRange() {
        RankTier rank = persistRank("Sales Associate", 1);
        Instant inRange = Instant.parse("2026-01-15T00:00:00Z");
        Instant outOfRange = Instant.parse("2026-02-15T00:00:00Z");
        persistAssociate("VP00001", "Jane", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.PENDING, AssociateStatus.ACTIVE, inRange);
        persistAssociate("VP00002", "John", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.PENDING, AssociateStatus.ACTIVE, outOfRange);
        entityManager.flush();

        Page<Associate> result = associateRepository.searchDirectory(
            null, null, null, null,
            Instant.parse("2026-01-01T00:00:00Z"), Instant.parse("2026-02-01T00:00:00Z"),
            PageRequest.of(0, 20));

        assertThat(result.getContent()).extracting(Associate::getUserId).containsExactly("VP00001");
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && mvn test -Dtest=AssociateRepositoryTest`
Expected: FAIL — compile error, `findByIdAndRole`/`countByParentId`/`searchDirectory` don't exist yet.

- [ ] **Step 3: Add the repository methods**

In `AssociateRepository.java`, add (near the other methods, imports `java.time.Instant`, `org.springframework.data.domain.Page`, `org.springframework.data.domain.Pageable` needed):

```java
    Optional<Associate> findByIdAndRole(UUID id, AssociateRole role);

    long countByParentId(UUID parentId);

    List<Associate> findByParentId(UUID parentId);

    // All five filters are optional (null = "don't filter on this"). Scoped to role = ASSOCIATE
    // only -- this is the associate network directory, not the Admin Team staff roster.
    // joinedToExclusive is an EXCLUSIVE upper bound, same convention as countJoinedBetween above:
    // callers pass the day *after* the last day to include.
    @Query("""
        SELECT a FROM Associate a
        WHERE a.role = com.plotchain.associate.AssociateRole.ASSOCIATE
        AND (:search IS NULL OR LOWER(a.name) LIKE LOWER(CONCAT('%', :search, '%'))
             OR LOWER(a.userId) LIKE LOWER(CONCAT('%', :search, '%')))
        AND (:rankId IS NULL OR a.rankId = :rankId)
        AND (:kycStatus IS NULL OR a.kycStatus = :kycStatus)
        AND (:status IS NULL OR a.status = :status)
        AND (:joinedFrom IS NULL OR a.joinedAt >= :joinedFrom)
        AND (:joinedToExclusive IS NULL OR a.joinedAt < :joinedToExclusive)
        ORDER BY a.userId ASC
        """)
    Page<Associate> searchDirectory(
        @Param("search") String search,
        @Param("rankId") UUID rankId,
        @Param("kycStatus") KycStatus kycStatus,
        @Param("status") AssociateStatus status,
        @Param("joinedFrom") Instant joinedFrom,
        @Param("joinedToExclusive") Instant joinedToExclusive,
        Pageable pageable);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && mvn test -Dtest=AssociateRepositoryTest`
Expected: PASS.

- [ ] **Step 5: Add the userId-based `AssociateNotFoundException` constructor**

In `AssociateNotFoundException.java`, add a second constructor alongside the existing one:

```java
    public AssociateNotFoundException(String userId) {
        super("Associate not found: " + userId);
    }
```

- [ ] **Step 6: Add the response DTOs**

`AdminAssociateSummaryResponse.java`:

```java
package com.plotchain.associate;

import java.time.Instant;
import java.util.UUID;

public record AdminAssociateSummaryResponse(
    UUID id, String userId, String name, String rankName, KycStatus kycStatus,
    AssociateStatus status, Instant joinedAt, Instant lastActiveAt) {}
```

`AdminAssociateDetailResponse.java`:

```java
package com.plotchain.associate;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record AdminAssociateDetailResponse(
    UUID id, String userId, String name, String email, String phone, String rankName,
    KycStatus kycStatus, AssociateStatus status, Instant joinedAt, Instant lastActiveAt,
    UUID sponsorId, String sponsorUserId, UUID parentId, String parentUserId, String position,
    long directDownlineCount, long totalDownlineCount,
    BigDecimal leftLegVolume, BigDecimal rightLegVolume) {}
```

`AdminAssociatePageResponse.java`:

```java
package com.plotchain.associate;

import java.util.List;

public record AdminAssociatePageResponse(
    List<AdminAssociateSummaryResponse> associates, int page, int size, long totalElements) {}
```

`ResetPasswordResponse.java`:

```java
package com.plotchain.associate;

public record ResetPasswordResponse(String temporaryPassword) {}
```

- [ ] **Step 7: Write the failing service test**

Create `backend/src/test/java/com/plotchain/associate/AdminAssociateServiceTest.java`:

```java
package com.plotchain.associate;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.company.SettingsAuditLog;
import com.plotchain.company.SettingsAuditLogRepository;
import com.plotchain.company.SettingsAuditService;
import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleRepository;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.legvolume.LegVolume;
import com.plotchain.legvolume.LegVolumeRepository;
import com.plotchain.rank.RankTier;
import com.plotchain.rank.RankTierRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdminAssociateServiceTest {

    @Mock AssociateRepository associateRepository;
    @Mock RankTierRepository rankTierRepository;
    @Mock CycleRepository cycleRepository;
    @Mock LegVolumeRepository legVolumeRepository;
    @Mock SettingsAuditLogRepository settingsAuditLogRepository;

    PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
    AdminAssociateService service;

    private static final UUID ACTOR_ID = UUID.randomUUID();
    private final RankTier rank = new RankTier(UUID.randomUUID(), "Sales Associate", 1, BigDecimal.valueOf(5000));

    @BeforeEach
    void setUp() {
        SettingsAuditService settingsAuditService = new SettingsAuditService(
            settingsAuditLogRepository, associateRepository, new ObjectMapper().findAndRegisterModules());
        service = new AdminAssociateService(
            associateRepository, rankTierRepository, cycleRepository, legVolumeRepository,
            passwordEncoder, settingsAuditService);
    }

    private Associate newAssociate(UUID id, String userId) {
        Associate a = new Associate();
        a.setId(id);
        a.setUserId(userId);
        a.setName("Jane Doe");
        a.setRole(AssociateRole.ASSOCIATE);
        a.setRankId(rank.getId());
        a.setKycStatus(KycStatus.PENDING);
        a.setStatus(AssociateStatus.ACTIVE);
        a.setJoinedAt(Instant.now());
        a.setPasswordHash("hash");
        return a;
    }

    @Test
    void listReturnsAPageMappedToSummaries() {
        Associate associate = newAssociate(UUID.randomUUID(), "VP00001");
        when(associateRepository.searchDirectory(
            eq("jane"), isNull(), isNull(), isNull(), isNull(), isNull(), eq(PageRequest.of(0, 20))))
            .thenReturn(new PageImpl<>(List.of(associate), PageRequest.of(0, 20), 1));
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(rank));

        AdminAssociatePageResponse response = service.list(
            "jane", null, null, null, null, null, 0, 20);

        assertThat(response.totalElements()).isEqualTo(1);
        assertThat(response.associates()).hasSize(1);
        assertThat(response.associates().get(0).userId()).isEqualTo("VP00001");
        assertThat(response.associates().get(0).rankName()).isEqualTo("Sales Associate");
    }

    @Test
    void listConvertsJoinedDateRangeToAnExclusiveUpperBoundInstant() {
        when(associateRepository.searchDirectory(
            isNull(), isNull(), isNull(), isNull(), any(), any(), eq(PageRequest.of(0, 20))))
            .thenReturn(new PageImpl<>(List.of()));
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of());

        service.list(null, null, null, null, LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31), 0, 20);

        ArgumentCaptor<Instant> fromCaptor = ArgumentCaptor.forClass(Instant.class);
        ArgumentCaptor<Instant> toCaptor = ArgumentCaptor.forClass(Instant.class);
        verify(associateRepository).searchDirectory(
            isNull(), isNull(), isNull(), isNull(), fromCaptor.capture(), toCaptor.capture(), any());
        assertThat(fromCaptor.getValue()).isEqualTo(Instant.parse("2026-01-01T00:00:00Z"));
        // Exclusive upper bound: the day AFTER joinedTo, so Jan 31 itself is included.
        assertThat(toCaptor.getValue()).isEqualTo(Instant.parse("2026-02-01T00:00:00Z"));
    }

    @Test
    void getReturnsFullDetailWithSponsorParentAndLegVolumes() {
        UUID id = UUID.randomUUID();
        UUID sponsorId = UUID.randomUUID();
        UUID parentId = UUID.randomUUID();
        UUID cycleId = UUID.randomUUID();
        Associate associate = newAssociate(id, "VP00003");
        associate.setSponsorId(sponsorId);
        associate.setParentId(parentId);
        associate.setPosition("L");
        Associate sponsor = newAssociate(sponsorId, "VP00001");
        Associate parent = newAssociate(parentId, "VP00002");
        Cycle openCycle = new Cycle();
        openCycle.setId(cycleId);
        LegVolume legVolume = LegVolume.empty(id, cycleId);

        when(associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(associate));
        when(associateRepository.findById(sponsorId)).thenReturn(Optional.of(sponsor));
        when(associateRepository.findById(parentId)).thenReturn(Optional.of(parent));
        when(rankTierRepository.findById(rank.getId())).thenReturn(Optional.of(rank));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN))
            .thenReturn(Optional.of(openCycle));
        when(legVolumeRepository.findByAssociateIdAndCycleId(id, cycleId)).thenReturn(Optional.of(legVolume));
        when(associateRepository.countByParentId(id)).thenReturn(2L);
        when(associateRepository.countDownline(id)).thenReturn(5L);

        AdminAssociateDetailResponse response = service.get(id);

        assertThat(response.sponsorUserId()).isEqualTo("VP00001");
        assertThat(response.parentUserId()).isEqualTo("VP00002");
        assertThat(response.position()).isEqualTo("L");
        assertThat(response.directDownlineCount()).isEqualTo(2);
        assertThat(response.totalDownlineCount()).isEqualTo(5);
        assertThat(response.leftLegVolume()).isEqualTo(BigDecimal.ZERO);
    }

    @Test
    void getThrowsWhenAssociateNotFound() {
        UUID id = UUID.randomUUID();
        when(associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.get(id)).isInstanceOf(AssociateNotFoundException.class);
    }

    @Test
    void suspendSetsStatusAndRecordsAudit() {
        UUID id = UUID.randomUUID();
        Associate associate = newAssociate(id, "VP00001");
        when(associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(associate));
        when(rankTierRepository.findById(rank.getId())).thenReturn(Optional.of(rank));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)).thenReturn(Optional.empty());

        AdminAssociateDetailResponse response = service.suspend(id, ACTOR_ID);

        assertThat(associate.getStatus()).isEqualTo(AssociateStatus.SUSPENDED);
        assertThat(response.status()).isEqualTo(AssociateStatus.SUSPENDED);
        verify(associateRepository).save(associate);

        ArgumentCaptor<SettingsAuditLog> captor = ArgumentCaptor.forClass(SettingsAuditLog.class);
        verify(settingsAuditLogRepository).save(captor.capture());
        assertThat(captor.getValue().getSection()).isEqualTo("associate");
        assertThat(captor.getValue().getChangedByAssociateId()).isEqualTo(ACTOR_ID);
    }

    @Test
    void reactivateSetsStatusBackToActive() {
        UUID id = UUID.randomUUID();
        Associate associate = newAssociate(id, "VP00001");
        associate.setStatus(AssociateStatus.SUSPENDED);
        when(associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(associate));
        when(rankTierRepository.findById(rank.getId())).thenReturn(Optional.of(rank));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)).thenReturn(Optional.empty());

        AdminAssociateDetailResponse response = service.reactivate(id, ACTOR_ID);

        assertThat(associate.getStatus()).isEqualTo(AssociateStatus.ACTIVE);
        assertThat(response.status()).isEqualTo(AssociateStatus.ACTIVE);
    }

    @Test
    void resetPasswordGeneratesANewTemporaryPasswordAndSetsMustChangeFlag() {
        UUID id = UUID.randomUUID();
        Associate associate = newAssociate(id, "VP00001");
        String originalHash = associate.getPasswordHash();
        when(associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(associate));

        ResetPasswordResponse response = service.resetPassword(id, ACTOR_ID);

        assertThat(response.temporaryPassword()).isNotBlank();
        assertThat(associate.getPasswordHash()).isNotEqualTo(originalHash);
        assertThat(passwordEncoder.matches(response.temporaryPassword(), associate.getPasswordHash())).isTrue();
        assertThat(associate.isMustChangePassword()).isTrue();
        verify(associateRepository).save(associate);
    }
}
```

- [ ] **Step 8: Run the test to verify it fails**

Run: `cd backend && mvn test -Dtest=AdminAssociateServiceTest`
Expected: FAIL — compile error, `AdminAssociateService` doesn't exist yet.

- [ ] **Step 9: Implement `AdminAssociateService`**

```java
package com.plotchain.associate;

import com.plotchain.company.SettingsAuditService;
import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleRepository;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.legvolume.LegVolume;
import com.plotchain.legvolume.LegVolumeRepository;
import com.plotchain.rank.RankTier;
import com.plotchain.rank.RankTierRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class AdminAssociateService {

    private final AssociateRepository associateRepository;
    private final RankTierRepository rankTierRepository;
    private final CycleRepository cycleRepository;
    private final LegVolumeRepository legVolumeRepository;
    private final PasswordEncoder passwordEncoder;
    private final SettingsAuditService settingsAuditService;

    public AdminAssociateService(
        AssociateRepository associateRepository,
        RankTierRepository rankTierRepository,
        CycleRepository cycleRepository,
        LegVolumeRepository legVolumeRepository,
        PasswordEncoder passwordEncoder,
        SettingsAuditService settingsAuditService
    ) {
        this.associateRepository = associateRepository;
        this.rankTierRepository = rankTierRepository;
        this.cycleRepository = cycleRepository;
        this.legVolumeRepository = legVolumeRepository;
        this.passwordEncoder = passwordEncoder;
        this.settingsAuditService = settingsAuditService;
    }

    public AdminAssociatePageResponse list(String search, UUID rankId, KycStatus kycStatus, AssociateStatus status,
                                            LocalDate joinedFrom, LocalDate joinedTo, int page, int size) {
        Instant joinedFromInstant = joinedFrom == null ? null : joinedFrom.atStartOfDay(ZoneOffset.UTC).toInstant();
        Instant joinedToExclusive = joinedTo == null
            ? null : joinedTo.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant();
        String normalizedSearch = (search == null || search.isBlank()) ? null : search;

        Page<Associate> result = associateRepository.searchDirectory(
            normalizedSearch, rankId, kycStatus, status, joinedFromInstant, joinedToExclusive,
            PageRequest.of(page, size));

        Map<UUID, RankTier> ranksById = ranksById();
        List<AdminAssociateSummaryResponse> summaries = result.getContent().stream()
            .map(a -> toSummary(a, ranksById.get(a.getRankId())))
            .toList();
        return new AdminAssociatePageResponse(summaries, page, size, result.getTotalElements());
    }

    public AdminAssociateDetailResponse get(UUID id) {
        return toDetail(findOrThrow(id));
    }

    public AdminAssociateDetailResponse suspend(UUID id, UUID actorId) {
        Associate associate = findOrThrow(id);
        associate.setStatus(AssociateStatus.SUSPENDED);
        associateRepository.save(associate);
        settingsAuditService.record("associate", "Suspended " + associate.getUserId(),
            Map.of("associateId", id.toString()), actorId);
        return toDetail(associate);
    }

    public AdminAssociateDetailResponse reactivate(UUID id, UUID actorId) {
        Associate associate = findOrThrow(id);
        associate.setStatus(AssociateStatus.ACTIVE);
        associateRepository.save(associate);
        settingsAuditService.record("associate", "Reactivated " + associate.getUserId(),
            Map.of("associateId", id.toString()), actorId);
        return toDetail(associate);
    }

    public ResetPasswordResponse resetPassword(UUID id, UUID actorId) {
        Associate associate = findOrThrow(id);
        String temporaryPassword = TemporaryPasswordGenerator.generate();
        associate.setPasswordHash(passwordEncoder.encode(temporaryPassword));
        associate.setMustChangePassword(true);
        associateRepository.save(associate);
        settingsAuditService.record("associate", "Reset password for " + associate.getUserId(),
            Map.of("associateId", id.toString()), actorId);
        return new ResetPasswordResponse(temporaryPassword);
    }

    private Associate findOrThrow(UUID id) {
        return associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)
            .orElseThrow(() -> new AssociateNotFoundException(id));
    }

    private Map<UUID, RankTier> ranksById() {
        return rankTierRepository.findAllByOrderByRankOrder().stream()
            .collect(Collectors.toMap(RankTier::getId, r -> r));
    }

    private AdminAssociateSummaryResponse toSummary(Associate a, RankTier rank) {
        return new AdminAssociateSummaryResponse(
            a.getId(), a.getUserId(), a.getName(), rank == null ? null : rank.getName(),
            a.getKycStatus(), a.getStatus(), a.getJoinedAt(), a.getLastActiveAt());
    }

    private AdminAssociateDetailResponse toDetail(Associate a) {
        RankTier rank = a.getRankId() == null ? null : rankTierRepository.findById(a.getRankId()).orElse(null);
        Associate sponsor = a.getSponsorId() == null ? null : associateRepository.findById(a.getSponsorId()).orElse(null);
        Associate parent = a.getParentId() == null ? null : associateRepository.findById(a.getParentId()).orElse(null);

        Optional<Cycle> openCycle = cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN);
        BigDecimal leftLegVolume = BigDecimal.ZERO;
        BigDecimal rightLegVolume = BigDecimal.ZERO;
        if (openCycle.isPresent()) {
            Optional<LegVolume> legVolume =
                legVolumeRepository.findByAssociateIdAndCycleId(a.getId(), openCycle.get().getId());
            leftLegVolume = legVolume.map(LegVolume::getLeftLegVolume).orElse(BigDecimal.ZERO);
            rightLegVolume = legVolume.map(LegVolume::getRightLegVolume).orElse(BigDecimal.ZERO);
        }

        return new AdminAssociateDetailResponse(
            a.getId(), a.getUserId(), a.getName(), a.getEmail(), a.getPhone(),
            rank == null ? null : rank.getName(), a.getKycStatus(), a.getStatus(),
            a.getJoinedAt(), a.getLastActiveAt(),
            a.getSponsorId(), sponsor == null ? null : sponsor.getUserId(),
            a.getParentId(), parent == null ? null : parent.getUserId(), a.getPosition(),
            associateRepository.countByParentId(a.getId()), associateRepository.countDownline(a.getId()),
            leftLegVolume, rightLegVolume);
    }
}
```

- [ ] **Step 10: Run the test to verify it passes**

Run: `cd backend && mvn test -Dtest=AdminAssociateServiceTest`
Expected: PASS.

- [ ] **Step 11: Write the failing controller test**

Create `backend/src/test/java/com/plotchain/associate/AdminAssociateControllerTest.java`, following `PlotControllerTest`'s exact pattern:

```java
package com.plotchain.associate;

import com.plotchain.auth.JwtService;
import com.plotchain.company.SettingsAuditLogRepository;
import com.plotchain.cycle.CycleRepository;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.legvolume.LegVolumeRepository;
import com.plotchain.rank.RankTier;
import com.plotchain.rank.RankTierRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AdminAssociateControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;
    @MockBean RankTierRepository rankTierRepository;
    @MockBean CycleRepository cycleRepository;
    @MockBean LegVolumeRepository legVolumeRepository;
    @MockBean SettingsAuditLogRepository settingsAuditLogRepository;

    private static final UUID ASSOCIATE_ID = UUID.randomUUID();
    private final RankTier rank = new RankTier(UUID.randomUUID(), "Sales Associate", 1, BigDecimal.valueOf(5000));

    private String tokenFor(AssociateRole role) {
        Associate token = new Associate();
        token.setId(UUID.randomUUID());
        token.setRole(role);
        return jwtService.generateToken(token);
    }

    private Associate seedAssociate() {
        Associate a = new Associate();
        a.setId(ASSOCIATE_ID);
        a.setUserId("VP00001");
        a.setName("Jane Doe");
        a.setRole(AssociateRole.ASSOCIATE);
        a.setRankId(rank.getId());
        a.setKycStatus(KycStatus.PENDING);
        a.setStatus(AssociateStatus.ACTIVE);
        a.setJoinedAt(Instant.now());
        a.setPasswordHash("hash");
        return a;
    }

    @Test
    void listReturnsAPageForAnyAdminFamilyToken() throws Exception {
        when(associateRepository.searchDirectory(any(), any(), any(), any(), any(), any(), any()))
            .thenReturn(new PageImpl<>(List.of(seedAssociate()), PageRequest.of(0, 20), 1));
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(rank));

        mockMvc.perform(get("/api/admin/associates")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.SUPPORT)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.associates[0].userId").value("VP00001"))
            .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void listIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/admin/associates")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    @Test
    void suspendSucceedsForAnAdminToken() throws Exception {
        when(associateRepository.findByIdAndRole(ASSOCIATE_ID, AssociateRole.ASSOCIATE))
            .thenReturn(Optional.of(seedAssociate()));
        when(rankTierRepository.findById(rank.getId())).thenReturn(Optional.of(rank));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)).thenReturn(Optional.empty());

        mockMvc.perform(post("/api/admin/associates/" + ASSOCIATE_ID + "/suspend")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("SUSPENDED"));
    }

    @Test
    void suspendIsForbiddenForAFinanceToken() throws Exception {
        // 403 here proves the @PreAuthorize narrowing beyond the blanket admin-family POST rule:
        // FINANCE passes SecurityConfig's web-layer check but must be rejected by method security.
        mockMvc.perform(post("/api/admin/associates/" + ASSOCIATE_ID + "/suspend")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.FINANCE)))
            .andExpect(status().isForbidden());
    }

    @Test
    void resetPasswordIsForbiddenForAKycReviewerToken() throws Exception {
        mockMvc.perform(post("/api/admin/associates/" + ASSOCIATE_ID + "/reset-password")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.KYC_REVIEWER)))
            .andExpect(status().isForbidden());
    }
}
```

- [ ] **Step 12: Run the test to verify it fails**

Run: `cd backend && mvn test -Dtest=AdminAssociateControllerTest`
Expected: FAIL — `AdminAssociateController` and the `/api/admin/associates` routes don't exist yet (404s / compile error).

- [ ] **Step 13: Implement `AdminAssociateController`**

```java
package com.plotchain.associate;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/associates")
public class AdminAssociateController {

    private final AdminAssociateService adminAssociateService;

    public AdminAssociateController(AdminAssociateService adminAssociateService) {
        this.adminAssociateService = adminAssociateService;
    }

    @GetMapping
    public AdminAssociatePageResponse list(
        @RequestParam(required = false) String search,
        @RequestParam(required = false) UUID rank,
        @RequestParam(required = false) KycStatus kycStatus,
        @RequestParam(required = false) AssociateStatus status,
        @RequestParam(required = false) LocalDate joinedFrom,
        @RequestParam(required = false) LocalDate joinedTo,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size
    ) {
        return adminAssociateService.list(search, rank, kycStatus, status, joinedFrom, joinedTo, page, size);
    }

    @GetMapping("/{id}")
    public AdminAssociateDetailResponse get(@PathVariable UUID id) {
        return adminAssociateService.get(id);
    }

    @PostMapping("/{id}/suspend")
    @PreAuthorize("hasAnyAuthority('ADMIN','SUPER_ADMIN')")
    public AdminAssociateDetailResponse suspend(@PathVariable UUID id, @AuthenticationPrincipal UUID actorId) {
        return adminAssociateService.suspend(id, actorId);
    }

    @PostMapping("/{id}/reactivate")
    @PreAuthorize("hasAnyAuthority('ADMIN','SUPER_ADMIN')")
    public AdminAssociateDetailResponse reactivate(@PathVariable UUID id, @AuthenticationPrincipal UUID actorId) {
        return adminAssociateService.reactivate(id, actorId);
    }

    @PostMapping("/{id}/reset-password")
    @PreAuthorize("hasAnyAuthority('ADMIN','SUPER_ADMIN')")
    public ResetPasswordResponse resetPassword(@PathVariable UUID id, @AuthenticationPrincipal UUID actorId) {
        return adminAssociateService.resetPassword(id, actorId);
    }
}
```

- [ ] **Step 14: Add the SecurityConfig GET matcher**

In `SecurityConfig.java`, add directly after the existing `GET /api/associates` matcher block (same reasoning: a bare GET otherwise falls through to `anyRequest().authenticated()`, reachable by a plain `ASSOCIATE` token):

```java
                // Admin Usage: Associate Directory, Tree Explorer, and KYC Review Queue GETs
                // stay admin-family-only, same reasoning as every other admin-only GET above.
                // Their mutating POSTs (suspend/reactivate/reset-password/kyc decision) are
                // covered by the blanket POST rule above for the admin-family baseline, then
                // narrowed further per-role by @PreAuthorize on the controller methods
                // themselves (AdminAssociateController, KycReviewController) -- the first use
                // of real per-role narrowing in this codebase, per AdminRolePermissions' stated
                // follow-up.
                .requestMatchers(HttpMethod.GET, "/api/admin/associates", "/api/admin/associates/*")
                    .hasAnyAuthority("ADMIN", "SUPER_ADMIN", "FINANCE", "KYC_REVIEWER", "SUPPORT")
                .requestMatchers(HttpMethod.GET, "/api/admin/tree/*")
                    .hasAnyAuthority("ADMIN", "SUPER_ADMIN", "FINANCE", "KYC_REVIEWER", "SUPPORT")
                .requestMatchers(HttpMethod.GET, "/api/admin/kyc")
                    .hasAnyAuthority("ADMIN", "SUPER_ADMIN", "FINANCE", "KYC_REVIEWER", "SUPPORT")
```

(Place this block before `.anyRequest().authenticated()`, after the existing `/api/associates` GET matcher.)

- [ ] **Step 15: Run the tests to verify they pass**

Run: `cd backend && mvn test -Dtest=AdminAssociateControllerTest`
Expected: PASS.

- [ ] **Step 16: Add SecurityConfigTest coverage**

In `SecurityConfigTest.java`, add (mirroring `setupStateIsForbiddenForAnAssociateToken`'s pattern, reading further into the file to match its exact style — same `@MockBean`s already present cover this, no new mocks needed):

```java
    @Test
    void adminAssociatesIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/admin/associates")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    @Test
    void adminTreeIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/admin/tree/" + UUID.randomUUID())
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    @Test
    void adminKycIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/admin/kyc")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }
```

Run: `cd backend && mvn test -Dtest=SecurityConfigTest`
Expected: PASS.

- [ ] **Step 17: Commit**

```bash
git add backend/src/main/java/com/plotchain/associate/AssociateRepository.java \
        backend/src/main/java/com/plotchain/associate/AssociateNotFoundException.java \
        backend/src/main/java/com/plotchain/associate/AdminAssociate*.java \
        backend/src/main/java/com/plotchain/associate/ResetPasswordResponse.java \
        backend/src/main/java/com/plotchain/auth/SecurityConfig.java \
        backend/src/test/java/com/plotchain/associate/AssociateRepositoryTest.java \
        backend/src/test/java/com/plotchain/associate/AdminAssociateServiceTest.java \
        backend/src/test/java/com/plotchain/associate/AdminAssociateControllerTest.java \
        backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java
git commit -m "feat(associate): add Associate Directory admin endpoints"
```

---

## Task 3: Associate Directory — frontend

**Files:**
- Create: `frontend/src/app/admin/models/admin-associate-summary.model.ts`
- Create: `frontend/src/app/admin/models/admin-associate-detail.model.ts`
- Create: `frontend/src/app/admin/models/admin-associate-page.model.ts`
- Create: `frontend/src/app/admin/associate-directory/associate-directory.service.ts`
- Test: `frontend/src/app/admin/associate-directory/associate-directory.service.spec.ts`
- Create: `frontend/src/app/admin/associate-directory/associate-directory.component.ts`
- Test: `frontend/src/app/admin/associate-directory/associate-directory.component.spec.ts`
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/settings/settings-nav-rail.component.ts`
- Modify: `frontend/src/assets/i18n/en.json`, `frontend/src/assets/i18n/hi.json`

**Interfaces:**
- Consumes: `GET /api/admin/associates`, `GET /api/admin/associates/{id}`, `POST /api/admin/associates/{id}/suspend|reactivate|reset-password` (Task 2). `SidePanelComponent` (`@Input() open`, `title`, `@Output() closed`). `GET /api/company/compensation`'s `availableRanks: RankOptionDto[]` (existing, reused for the rank filter dropdown — no new endpoint).
- Produces: `AssociateDirectoryService` with `list(filters, page, size): Observable<AdminAssociatePage>`, `get(id): Observable<AdminAssociateDetail>`, `suspend(id)/reactivate(id): Observable<AdminAssociateDetail>`, `resetPassword(id): Observable<{temporaryPassword: string}>`.

- [ ] **Step 1: Add the models**

`frontend/src/app/admin/models/admin-associate-summary.model.ts`:

```typescript
export interface AdminAssociateSummary {
  id: string;
  userId: string;
  name: string;
  rankName: string | null;
  kycStatus: 'PENDING' | 'VERIFIED' | 'REJECTED';
  status: 'ACTIVE' | 'SUSPENDED';
  joinedAt: string;
  lastActiveAt: string | null;
}
```

`frontend/src/app/admin/models/admin-associate-detail.model.ts`:

```typescript
export interface AdminAssociateDetail {
  id: string;
  userId: string;
  name: string;
  email: string | null;
  phone: string | null;
  rankName: string | null;
  kycStatus: 'PENDING' | 'VERIFIED' | 'REJECTED';
  status: 'ACTIVE' | 'SUSPENDED';
  joinedAt: string;
  lastActiveAt: string | null;
  sponsorId: string | null;
  sponsorUserId: string | null;
  parentId: string | null;
  parentUserId: string | null;
  position: string | null;
  directDownlineCount: number;
  totalDownlineCount: number;
  leftLegVolume: number;
  rightLegVolume: number;
}
```

`frontend/src/app/admin/models/admin-associate-page.model.ts`:

```typescript
import { AdminAssociateSummary } from './admin-associate-summary.model';

export interface AdminAssociatePage {
  associates: AdminAssociateSummary[];
  page: number;
  size: number;
  totalElements: number;
}

export interface AdminAssociateFilters {
  search?: string;
  rank?: string;
  kycStatus?: string;
  status?: string;
  joinedFrom?: string;
  joinedTo?: string;
}
```

- [ ] **Step 2: Write the failing service test**

Create `frontend/src/app/admin/associate-directory/associate-directory.service.spec.ts`, mirroring `admin.service.spec.ts`'s pattern:

```typescript
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AssociateDirectoryService } from './associate-directory.service';
import { AdminAssociatePage } from '../models/admin-associate-page.model';
import { AdminAssociateDetail } from '../models/admin-associate-detail.model';

describe('AssociateDirectoryService', () => {
  let service: AssociateDirectoryService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [AssociateDirectoryService]
    });
    service = TestBed.inject(AssociateDirectoryService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('lists associates with filters and pagination as query params', () => {
    const mockResponse: AdminAssociatePage = { associates: [], page: 0, size: 20, totalElements: 0 };

    service.list({ search: 'jane', status: 'ACTIVE' }, 0, 20).subscribe(res => {
      expect(res).toEqual(mockResponse);
    });

    const req = httpMock.expectOne(
      r => r.url === '/api/admin/associates' && r.params.get('search') === 'jane' && r.params.get('status') === 'ACTIVE'
    );
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });

  it('omits filter params that are undefined', () => {
    service.list({}, 0, 20).subscribe();

    const req = httpMock.expectOne('/api/admin/associates?page=0&size=20');
    req.flush({ associates: [], page: 0, size: 20, totalElements: 0 });
  });

  it('gets a single associate detail', () => {
    const mockDetail = { id: 'a1', userId: 'VP00001' } as AdminAssociateDetail;

    service.get('a1').subscribe(res => expect(res).toEqual(mockDetail));

    const req = httpMock.expectOne('/api/admin/associates/a1');
    expect(req.request.method).toBe('GET');
    req.flush(mockDetail);
  });

  it('suspends an associate', () => {
    service.suspend('a1').subscribe();

    const req = httpMock.expectOne('/api/admin/associates/a1/suspend');
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('reactivates an associate', () => {
    service.reactivate('a1').subscribe();

    const req = httpMock.expectOne('/api/admin/associates/a1/reactivate');
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('resets an associate password', () => {
    service.resetPassword('a1').subscribe(res => expect(res.temporaryPassword).toBe('Temp1234!'));

    const req = httpMock.expectOne('/api/admin/associates/a1/reset-password');
    expect(req.request.method).toBe('POST');
    req.flush({ temporaryPassword: 'Temp1234!' });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd frontend && npx ng test --include='**/associate-directory.service.spec.ts' --watch=false`
Expected: FAIL — `AssociateDirectoryService` doesn't exist yet.

- [ ] **Step 4: Implement `AssociateDirectoryService`**

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AdminAssociateFilters, AdminAssociatePage } from '../models/admin-associate-page.model';
import { AdminAssociateDetail } from '../models/admin-associate-detail.model';

@Injectable({ providedIn: 'root' })
export class AssociateDirectoryService {
  private http = inject(HttpClient);

  list(filters: AdminAssociateFilters, page: number, size: number): Observable<AdminAssociatePage> {
    let params = new HttpParams().set('page', page).set('size', size);
    for (const [key, value] of Object.entries(filters)) {
      if (value) {
        params = params.set(key, value);
      }
    }
    return this.http.get<AdminAssociatePage>('/api/admin/associates', { params });
  }

  get(id: string): Observable<AdminAssociateDetail> {
    return this.http.get<AdminAssociateDetail>(`/api/admin/associates/${id}`);
  }

  suspend(id: string): Observable<AdminAssociateDetail> {
    return this.http.post<AdminAssociateDetail>(`/api/admin/associates/${id}/suspend`, {});
  }

  reactivate(id: string): Observable<AdminAssociateDetail> {
    return this.http.post<AdminAssociateDetail>(`/api/admin/associates/${id}/reactivate`, {});
  }

  resetPassword(id: string): Observable<{ temporaryPassword: string }> {
    return this.http.post<{ temporaryPassword: string }>(`/api/admin/associates/${id}/reset-password`, {});
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd frontend && npx ng test --include='**/associate-directory.service.spec.ts' --watch=false`
Expected: PASS.

- [ ] **Step 6: Write the failing component test**

Create `frontend/src/app/admin/associate-directory/associate-directory.component.spec.ts`:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { AssociateDirectoryComponent } from './associate-directory.component';

describe('AssociateDirectoryComponent', () => {
  let fixture: ComponentFixture<AssociateDirectoryComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AssociateDirectoryComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(AssociateDirectoryComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    httpMock.expectOne('/api/admin/associates?page=0&size=20')
      .flush({ associates: [{ id: 'a1', userId: 'VP00001', name: 'Jane', rankName: 'Sales Associate', kycStatus: 'PENDING', status: 'ACTIVE', joinedAt: '2026-01-01T00:00:00Z', lastActiveAt: null }], page: 0, size: 20, totalElements: 1 });
  });

  afterEach(() => httpMock.verify());

  it('loads and displays the first page of associates', () => {
    expect(fixture.componentInstance.page?.associates.length).toBe(1);
    expect(fixture.componentInstance.page?.associates[0].userId).toBe('VP00001');
  });

  it('opens the detail panel and loads full detail on row selection', () => {
    fixture.componentInstance.selectAssociate('a1');

    const req = httpMock.expectOne('/api/admin/associates/a1');
    req.flush({
      id: 'a1', userId: 'VP00001', name: 'Jane', email: null, phone: null, rankName: 'Sales Associate',
      kycStatus: 'PENDING', status: 'ACTIVE', joinedAt: '2026-01-01T00:00:00Z', lastActiveAt: null,
      sponsorId: null, sponsorUserId: null, parentId: null, parentUserId: null, position: null,
      directDownlineCount: 0, totalDownlineCount: 0, leftLegVolume: 0, rightLegVolume: 0
    });

    expect(fixture.componentInstance.selected?.userId).toBe('VP00001');
    expect(fixture.componentInstance.panelOpen).toBeTrue();
  });

  it('suspends the selected associate and refreshes detail', () => {
    fixture.componentInstance.selected = { id: 'a1', userId: 'VP00001', status: 'ACTIVE' } as any;

    fixture.componentInstance.suspendSelected();

    const req = httpMock.expectOne('/api/admin/associates/a1/suspend');
    req.flush({ id: 'a1', userId: 'VP00001', status: 'SUSPENDED' });

    expect(fixture.componentInstance.selected?.status).toBe('SUSPENDED');
  });

  it('shows the one-time temporary password after a reset', () => {
    fixture.componentInstance.selected = { id: 'a1', userId: 'VP00001' } as any;

    fixture.componentInstance.resetPasswordForSelected();

    const req = httpMock.expectOne('/api/admin/associates/a1/reset-password');
    req.flush({ temporaryPassword: 'Temp1234!' });

    expect(fixture.componentInstance.temporaryPassword).toBe('Temp1234!');
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `cd frontend && npx ng test --include='**/associate-directory.component.spec.ts' --watch=false`
Expected: FAIL — `AssociateDirectoryComponent` doesn't exist yet.

- [ ] **Step 8: Implement `AssociateDirectoryComponent`**

```typescript
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { AssociateDirectoryService } from './associate-directory.service';
import { AdminAssociatePage } from '../models/admin-associate-page.model';
import { AdminAssociateDetail } from '../models/admin-associate-detail.model';
import { SidePanelComponent } from '../../shared/components/side-panel/side-panel.component';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-associate-directory',
  standalone: true,
  imports: [CommonModule, TranslateModule, SidePanelComponent],
  template: `
    <div class="associate-directory card">
      <h1 class="card-title">{{ 'admin.associateDirectory.title' | translate }}</h1>

      <div class="associate-directory__filters">
        <input
          type="text"
          [placeholder]="'admin.associateDirectory.searchPlaceholder' | translate"
          (input)="onSearchInput($any($event.target).value)"
        />
      </div>

      <table class="associate-directory__table">
        <thead>
          <tr>
            <th>{{ 'admin.associateDirectory.columnUserId' | translate }}</th>
            <th>{{ 'admin.associateDirectory.columnName' | translate }}</th>
            <th>{{ 'admin.associateDirectory.columnRank' | translate }}</th>
            <th>{{ 'admin.associateDirectory.columnKycStatus' | translate }}</th>
            <th>{{ 'admin.associateDirectory.columnStatus' | translate }}</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let associate of page?.associates" (click)="selectAssociate(associate.id)">
            <td>{{ associate.userId }}</td>
            <td>{{ associate.name }}</td>
            <td>{{ associate.rankName }}</td>
            <td>{{ associate.kycStatus }}</td>
            <td>{{ associate.status }}</td>
          </tr>
        </tbody>
      </table>

      <div class="associate-directory__pagination" *ngIf="page">
        <button type="button" [disabled]="page.page === 0" (click)="goToPage(page.page - 1)">
          {{ 'admin.associateDirectory.previousPageAction' | translate }}
        </button>
        <button type="button" [disabled]="(page.page + 1) * page.size >= page.totalElements" (click)="goToPage(page.page + 1)">
          {{ 'admin.associateDirectory.nextPageAction' | translate }}
        </button>
      </div>
    </div>

    <app-side-panel [open]="panelOpen" [title]="selected?.userId ?? ''" (closed)="closePanel()">
      <div *ngIf="selected" class="associate-directory__detail">
        <p>{{ selected.name }} — {{ selected.rankName }}</p>
        <p>{{ 'admin.associateDirectory.sponsorLabel' | translate }}: {{ selected.sponsorUserId }}</p>
        <p>{{ 'admin.associateDirectory.placementLabel' | translate }}: {{ selected.parentUserId }} ({{ selected.position }})</p>
        <p>{{ 'admin.associateDirectory.downlineLabel' | translate }}: {{ selected.directDownlineCount }} / {{ selected.totalDownlineCount }}</p>

        <div *ngIf="temporaryPassword" class="associate-directory__temp-password">
          {{ 'admin.associateDirectory.temporaryPasswordNotice' | translate }}: <strong>{{ temporaryPassword }}</strong>
        </div>

        <button type="button" *ngIf="selected.status === 'ACTIVE'" (click)="suspendSelected()">
          {{ 'admin.associateDirectory.suspendAction' | translate }}
        </button>
        <button type="button" *ngIf="selected.status === 'SUSPENDED'" (click)="reactivateSelected()">
          {{ 'admin.associateDirectory.reactivateAction' | translate }}
        </button>
        <button type="button" (click)="resetPasswordForSelected()">
          {{ 'admin.associateDirectory.resetPasswordAction' | translate }}
        </button>
      </div>
    </app-side-panel>
  `
})
export class AssociateDirectoryComponent implements OnInit {
  private associateDirectoryService = inject(AssociateDirectoryService);

  page: AdminAssociatePage | null = null;
  selected: AdminAssociateDetail | null = null;
  panelOpen = false;
  temporaryPassword: string | null = null;
  private search = '';

  ngOnInit(): void {
    this.loadPage(0);
  }

  onSearchInput(value: string): void {
    this.search = value;
    this.loadPage(0);
  }

  goToPage(page: number): void {
    this.loadPage(page);
  }

  selectAssociate(id: string): void {
    this.temporaryPassword = null;
    this.associateDirectoryService.get(id).subscribe(detail => {
      this.selected = detail;
      this.panelOpen = true;
    });
  }

  closePanel(): void {
    this.panelOpen = false;
  }

  suspendSelected(): void {
    if (!this.selected) return;
    this.associateDirectoryService.suspend(this.selected.id).subscribe(detail => {
      this.selected = detail;
      this.loadPage(this.page?.page ?? 0);
    });
  }

  reactivateSelected(): void {
    if (!this.selected) return;
    this.associateDirectoryService.reactivate(this.selected.id).subscribe(detail => {
      this.selected = detail;
      this.loadPage(this.page?.page ?? 0);
    });
  }

  resetPasswordForSelected(): void {
    if (!this.selected) return;
    this.associateDirectoryService.resetPassword(this.selected.id).subscribe(res => {
      this.temporaryPassword = res.temporaryPassword;
    });
  }

  private loadPage(page: number): void {
    this.associateDirectoryService
      .list(this.search ? { search: this.search } : {}, page, PAGE_SIZE)
      .subscribe(res => (this.page = res));
  }
}
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `cd frontend && npx ng test --include='**/associate-directory.component.spec.ts' --watch=false`
Expected: PASS.

- [ ] **Step 10: Wire the route and nav-rail entry**

In `app.routes.ts`, add the import and a new child route under `settings`:

```typescript
import { AssociateDirectoryComponent } from './admin/associate-directory/associate-directory.component';
```

```typescript
      { path: 'associate-directory', component: AssociateDirectoryComponent, data: { sectionKey: 'associateDirectory' } },
```

(placed inside the `settings` route's `children` array, alongside `audit-log`).

In `settings-nav-rail.component.ts`, add a nav entry the same way `audit-log` is hardcoded (not via `SECTION_PATHS`, since it's not a wrapped setup-step component):

```html
        <li class="settings-nav-rail__item" [class.settings-nav-rail__item--active]="activeSectionKey === 'associateDirectory'">
          <a [routerLink]="['/settings', 'associate-directory']">{{ 'settings.sections.associateDirectory' | translate }}</a>
        </li>
```

(Insert this `<li>` right before the existing `audit-log` `<li>`.)

- [ ] **Step 11: Add i18n keys**

In `frontend/src/assets/i18n/en.json`, add to the `settings.sections` object:

```json
    "associateDirectory": "Associate Directory",
```

And a new top-level block inside `admin` (or as its own top-level key — follow the existing `admin.*` nesting since this is an admin-family screen):

```json
    "associateDirectory": {
      "title": "Associate Directory",
      "searchPlaceholder": "Search by name or ID",
      "columnUserId": "Associate ID",
      "columnName": "Name",
      "columnRank": "Rank",
      "columnKycStatus": "KYC Status",
      "columnStatus": "Status",
      "previousPageAction": "Previous",
      "nextPageAction": "Next",
      "sponsorLabel": "Sponsor",
      "placementLabel": "Placement",
      "downlineLabel": "Downline (direct / total)",
      "suspendAction": "Suspend",
      "reactivateAction": "Reactivate",
      "resetPasswordAction": "Reset Password",
      "temporaryPasswordNotice": "New temporary password (shown once)"
    }
```

Add the matching `settings.sections.associateDirectory` key and `admin.associateDirectory` block to `frontend/src/assets/i18n/hi.json` too — English text is fine as a placeholder value there (translation is a follow-up), but the **keys** must exist in both files per this repo's kept-in-sync convention.

- [ ] **Step 12: Run the full frontend test suite**

Run: `cd frontend && npx ng test --watch=false`
Expected: PASS, no regressions.

- [ ] **Step 13: Commit**

```bash
git add frontend/src/app/admin/models/admin-associate*.model.ts \
        frontend/src/app/admin/associate-directory/ \
        frontend/src/app/app.routes.ts \
        frontend/src/app/settings/settings-nav-rail.component.ts \
        frontend/src/assets/i18n/en.json frontend/src/assets/i18n/hi.json
git commit -m "feat(admin): add Associate Directory screen"
```

---

## Task 4: Tree Explorer — backend

**Files:**
- Modify: `backend/src/main/java/com/plotchain/associate/AssociateRepository.java` (add `findAncestorChain`)
- Modify: `backend/src/main/java/com/plotchain/legvolume/LegVolume.java` (add an all-args constructor for tests)
- Create: `backend/src/main/java/com/plotchain/tree/TreeNodeResponse.java`
- Create: `backend/src/main/java/com/plotchain/tree/TreeNodeSummary.java`
- Create: `backend/src/main/java/com/plotchain/tree/TreeSearchResponse.java`
- Create: `backend/src/main/java/com/plotchain/tree/TreeExplorerService.java`
- Create: `backend/src/main/java/com/plotchain/tree/TreeExplorerController.java`
- Test: `backend/src/test/java/com/plotchain/associate/AssociateRepositoryTest.java` (add case)
- Test: `backend/src/test/java/com/plotchain/tree/TreeExplorerServiceTest.java` (new file)
- Test: `backend/src/test/java/com/plotchain/tree/TreeExplorerControllerTest.java` (new file)

**Interfaces:**
- Consumes: `AssociateRepository.findByIdAndRole`, `findByUserId`, `findByParentId`, `countByParentId` (Task 2/existing); `CycleRepository`, `LegVolumeRepository`, `RankTierRepository` (existing).
- Produces: `TreeExplorerController` at `/api/admin/tree`, methods `subtree(UUID associateId, int depth): TreeNodeResponse`, `search(String q): TreeSearchResponse`.

- [ ] **Step 1: Write the failing repository test for the ancestor-chain query**

Add to `AssociateRepositoryTest.java`:

```java
    @Test
    void findAncestorChainReturnsRootToTargetInclusiveInOrder() {
        RankTier rank = persistRank("Sales Associate", 1);
        Associate root = persistAssociate("VP00001", "Root", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.PENDING, AssociateStatus.ACTIVE, Instant.now());
        Associate middle = persistAssociate("VP00002", "Middle", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.PENDING, AssociateStatus.ACTIVE, Instant.now());
        middle.setParentId(root.getId());
        Associate leaf = persistAssociate("VP00003", "Leaf", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.PENDING, AssociateStatus.ACTIVE, Instant.now());
        leaf.setParentId(middle.getId());
        entityManager.flush();

        List<UUID> chain = associateRepository.findAncestorChain(leaf.getId());

        assertThat(chain).containsExactly(root.getId(), middle.getId(), leaf.getId());
    }
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && mvn test -Dtest=AssociateRepositoryTest#findAncestorChainReturnsRootToTargetInclusiveInOrder`
Expected: FAIL — `findAncestorChain` doesn't exist yet.

- [ ] **Step 3: Add the repository method**

In `AssociateRepository.java`:

```java
    // Walks UP from a target associate to the root of its binary-tree branch. depth 0 is the
    // target itself; each step further out is +1. ORDER BY depth DESC puts the root first and
    // the target last -- root-to-target inclusive, the order the UI expands top-down.
    @Query(value = """
        WITH RECURSIVE ancestors(id, parent_id, depth) AS (
            SELECT id, parent_id, 0 FROM associate WHERE id = :associateId
            UNION ALL
            SELECT a.id, a.parent_id, anc.depth + 1
            FROM associate a JOIN ancestors anc ON a.id = anc.parent_id
        )
        SELECT id FROM ancestors ORDER BY depth DESC
        """, nativeQuery = true)
    List<UUID> findAncestorChain(@Param("associateId") UUID associateId);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && mvn test -Dtest=AssociateRepositoryTest`
Expected: PASS.

- [ ] **Step 4a: Add a test-friendly constructor to `LegVolume`**

`LegVolume` currently exposes only `empty(associateId, cycleId)` (all volumes zero) and getters — there's no way to construct one with specific non-zero left/right volumes from outside its package, which the skewed-legs test below needs. In `backend/src/main/java/com/plotchain/legvolume/LegVolume.java`, add an all-args constructor, matching `RankTier`'s existing constructor convention:

```java
    public LegVolume(UUID id, UUID associateId, UUID cycleId, BigDecimal leftLegVolume, BigDecimal rightLegVolume,
                      BigDecimal carriedForwardLeft, BigDecimal carriedForwardRight) {
        this.id = id;
        this.associateId = associateId;
        this.cycleId = cycleId;
        this.leftLegVolume = leftLegVolume;
        this.rightLegVolume = rightLegVolume;
        this.carriedForwardLeft = carriedForwardLeft;
        this.carriedForwardRight = carriedForwardRight;
    }
```

(Add this above the existing `empty(...)` static factory; it's additive, no existing caller changes.)

- [ ] **Step 5: Add the tree response DTOs**

`backend/src/main/java/com/plotchain/tree/TreeNodeResponse.java`:

```java
package com.plotchain.tree;

import com.plotchain.associate.KycStatus;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public record TreeNodeResponse(
    UUID id, String userId, String name, String rankName, KycStatus kycStatus, String position,
    BigDecimal leftLegVolume, BigDecimal rightLegVolume,
    boolean skewedLegsFlag, boolean stagnantFlag, List<TreeNodeResponse> children) {}
```

`backend/src/main/java/com/plotchain/tree/TreeNodeSummary.java`:

```java
package com.plotchain.tree;

import java.util.UUID;

public record TreeNodeSummary(UUID id, String userId, String name) {}
```

`backend/src/main/java/com/plotchain/tree/TreeSearchResponse.java`:

```java
package com.plotchain.tree;

import java.util.List;

public record TreeSearchResponse(List<TreeNodeSummary> ancestorPath) {}
```

- [ ] **Step 6: Write the failing service test**

Create `backend/src/test/java/com/plotchain/tree/TreeExplorerServiceTest.java`:

```java
package com.plotchain.tree;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleRepository;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.legvolume.LegVolume;
import com.plotchain.legvolume.LegVolumeRepository;
import com.plotchain.rank.RankTier;
import com.plotchain.rank.RankTierRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TreeExplorerServiceTest {

    @Mock AssociateRepository associateRepository;
    @Mock RankTierRepository rankTierRepository;
    @Mock CycleRepository cycleRepository;
    @Mock LegVolumeRepository legVolumeRepository;

    TreeExplorerService service;
    private final RankTier rank = new RankTier(UUID.randomUUID(), "Sales Associate", 1, BigDecimal.valueOf(5000));

    @BeforeEach
    void setUp() {
        service = new TreeExplorerService(associateRepository, rankTierRepository, cycleRepository, legVolumeRepository);
    }

    private Associate newAssociate(UUID id, String userId, Instant joinedAt) {
        Associate a = new Associate();
        a.setId(id);
        a.setUserId(userId);
        a.setName("Name " + userId);
        a.setRole(AssociateRole.ASSOCIATE);
        a.setRankId(rank.getId());
        a.setKycStatus(KycStatus.PENDING);
        a.setJoinedAt(joinedAt);
        return a;
    }

    @Test
    void subtreeThrowsWhenRootNotFound() {
        UUID id = UUID.randomUUID();
        when(associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.subtree(id, 3)).isInstanceOf(AssociateNotFoundException.class);
    }

    @Test
    void subtreeBuildsNestedChildrenUpToDepth() {
        UUID rootId = UUID.randomUUID();
        UUID childId = UUID.randomUUID();
        Associate root = newAssociate(rootId, "VP00001", Instant.now());
        Associate child = newAssociate(childId, "VP00002", Instant.now());

        when(associateRepository.findByIdAndRole(rootId, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(root));
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(rank));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)).thenReturn(Optional.empty());
        when(associateRepository.findByParentId(rootId)).thenReturn(List.of(child));
        when(associateRepository.findByParentId(childId)).thenReturn(List.of());
        when(associateRepository.countByParentId(rootId)).thenReturn(1L);
        when(associateRepository.countByParentId(childId)).thenReturn(0L);

        TreeNodeResponse response = service.subtree(rootId, 1);

        assertThat(response.userId()).isEqualTo("VP00001");
        assertThat(response.children()).hasSize(1);
        assertThat(response.children().get(0).userId()).isEqualTo("VP00002");
        assertThat(response.children().get(0).children()).isEmpty();
    }

    @Test
    void subtreeDoesNotDescendPastTheRequestedDepth() {
        UUID rootId = UUID.randomUUID();
        Associate root = newAssociate(rootId, "VP00001", Instant.now());

        when(associateRepository.findByIdAndRole(rootId, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(root));
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(rank));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)).thenReturn(Optional.empty());
        when(associateRepository.countByParentId(rootId)).thenReturn(0L);

        TreeNodeResponse response = service.subtree(rootId, 0);

        assertThat(response.children()).isEmpty();
        // depth 0 means no expansion at all -- findByParentId must never be called.
        org.mockito.Mockito.verify(associateRepository, org.mockito.Mockito.never()).findByParentId(rootId);
    }

    @Test
    void subtreeDoesNotFlagSkewedWhenBothLegsAreZero() {
        UUID id = UUID.randomUUID();
        UUID cycleId = UUID.randomUUID();
        Associate associate = newAssociate(id, "VP00001", Instant.now());
        Cycle openCycle = new Cycle();
        openCycle.setId(cycleId);
        LegVolume legVolume = LegVolume.empty(id, cycleId);

        when(associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(associate));
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(rank));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)).thenReturn(Optional.of(openCycle));
        when(legVolumeRepository.findByAssociateIdAndCycleId(id, cycleId)).thenReturn(Optional.of(legVolume));
        when(associateRepository.countByParentId(id)).thenReturn(0L);

        TreeNodeResponse response = service.subtree(id, 0);

        // The skew rule only applies when BOTH legs are non-zero -- a brand-new node with no
        // sales on either leg must never be flagged, even though 0/0 is technically undefined.
        assertThat(response.skewedLegsFlag()).isFalse();
    }

    @Test
    void subtreeFlagsSkewedLegsWhenOneLegIsAtLeastTenTimesTheOther() {
        UUID id = UUID.randomUUID();
        UUID cycleId = UUID.randomUUID();
        Associate associate = newAssociate(id, "VP00001", Instant.now());
        Cycle openCycle = new Cycle();
        openCycle.setId(cycleId);
        LegVolume skewed = new LegVolume(UUID.randomUUID(), id, cycleId,
            new BigDecimal("100000"), new BigDecimal("1000000"), BigDecimal.ZERO, BigDecimal.ZERO);

        when(associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(associate));
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(rank));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)).thenReturn(Optional.of(openCycle));
        when(legVolumeRepository.findByAssociateIdAndCycleId(id, cycleId)).thenReturn(Optional.of(skewed));
        when(associateRepository.countByParentId(id)).thenReturn(0L);

        TreeNodeResponse response = service.subtree(id, 0);

        assertThat(response.skewedLegsFlag()).isTrue();
    }

    @Test
    void subtreeDoesNotFlagSkewedWhenLegsAreWithinTheRatioThreshold() {
        UUID id = UUID.randomUUID();
        UUID cycleId = UUID.randomUUID();
        Associate associate = newAssociate(id, "VP00001", Instant.now());
        Cycle openCycle = new Cycle();
        openCycle.setId(cycleId);
        // Just under the 10x threshold: 900000 / 100000 = 9, must not be flagged.
        LegVolume balanced = new LegVolume(UUID.randomUUID(), id, cycleId,
            new BigDecimal("100000"), new BigDecimal("900000"), BigDecimal.ZERO, BigDecimal.ZERO);

        when(associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(associate));
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(rank));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)).thenReturn(Optional.of(openCycle));
        when(legVolumeRepository.findByAssociateIdAndCycleId(id, cycleId)).thenReturn(Optional.of(balanced));
        when(associateRepository.countByParentId(id)).thenReturn(0L);

        TreeNodeResponse response = service.subtree(id, 0);

        assertThat(response.skewedLegsFlag()).isFalse();
    }

    @Test
    void subtreeFlagsStagnantWhenJoinedOverNinetyDaysAgoWithNoDirectDownline() {
        UUID id = UUID.randomUUID();
        Associate associate = newAssociate(id, "VP00001", Instant.now().minus(91, ChronoUnit.DAYS));

        when(associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(associate));
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(rank));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)).thenReturn(Optional.empty());
        when(associateRepository.countByParentId(id)).thenReturn(0L);

        TreeNodeResponse response = service.subtree(id, 0);

        assertThat(response.stagnantFlag()).isTrue();
    }

    @Test
    void searchReturnsTheAncestorPathForAnExactUserIdMatch() {
        UUID rootId = UUID.randomUUID();
        UUID targetId = UUID.randomUUID();
        Associate root = newAssociate(rootId, "VP00001", Instant.now());
        Associate target = newAssociate(targetId, "VP00002", Instant.now());
        target.setRole(AssociateRole.ASSOCIATE);

        when(associateRepository.findByUserId("VP00002")).thenReturn(Optional.of(target));
        when(associateRepository.findAncestorChain(targetId)).thenReturn(List.of(rootId, targetId));
        when(associateRepository.findAllById(List.of(rootId, targetId))).thenReturn(List.of(root, target));

        TreeSearchResponse response = service.search("VP00002");

        assertThat(response.ancestorPath()).extracting(TreeNodeSummary::userId)
            .containsExactly("VP00001", "VP00002");
    }

    @Test
    void searchThrowsWhenUserIdNotFound() {
        when(associateRepository.findByUserId("nobody")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.search("nobody")).isInstanceOf(AssociateNotFoundException.class);
    }
}
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `cd backend && mvn test -Dtest=TreeExplorerServiceTest`
Expected: FAIL — `TreeExplorerService` doesn't exist yet.

- [ ] **Step 8: Implement `TreeExplorerService`**

```java
package com.plotchain.tree;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleRepository;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.legvolume.LegVolume;
import com.plotchain.legvolume.LegVolumeRepository;
import com.plotchain.rank.RankTier;
import com.plotchain.rank.RankTierRepository;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class TreeExplorerService {

    private static final int MAX_LEG_SKEW_RATIO = 10;
    private static final long STAGNANT_THRESHOLD_DAYS = 90;

    private final AssociateRepository associateRepository;
    private final RankTierRepository rankTierRepository;
    private final CycleRepository cycleRepository;
    private final LegVolumeRepository legVolumeRepository;

    public TreeExplorerService(
        AssociateRepository associateRepository,
        RankTierRepository rankTierRepository,
        CycleRepository cycleRepository,
        LegVolumeRepository legVolumeRepository
    ) {
        this.associateRepository = associateRepository;
        this.rankTierRepository = rankTierRepository;
        this.cycleRepository = cycleRepository;
        this.legVolumeRepository = legVolumeRepository;
    }

    public TreeNodeResponse subtree(UUID associateId, int depth) {
        Associate root = associateRepository.findByIdAndRole(associateId, AssociateRole.ASSOCIATE)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));
        Map<UUID, RankTier> ranksById = rankTierRepository.findAllByOrderByRankOrder().stream()
            .collect(Collectors.toMap(RankTier::getId, r -> r));
        Optional<Cycle> openCycle = cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN);
        return buildNode(root, depth, ranksById, openCycle);
    }

    public TreeSearchResponse search(String userId) {
        Associate target = associateRepository.findByUserId(userId)
            .filter(a -> a.getRole() == AssociateRole.ASSOCIATE)
            .orElseThrow(() -> new AssociateNotFoundException(userId));

        List<UUID> chain = associateRepository.findAncestorChain(target.getId());
        Map<UUID, Associate> byId = associateRepository.findAllById(chain).stream()
            .collect(Collectors.toMap(Associate::getId, a -> a));
        List<TreeNodeSummary> path = chain.stream()
            .map(byId::get)
            .map(a -> new TreeNodeSummary(a.getId(), a.getUserId(), a.getName()))
            .toList();
        return new TreeSearchResponse(path);
    }

    private TreeNodeResponse buildNode(Associate a, int remainingDepth, Map<UUID, RankTier> ranksById,
                                        Optional<Cycle> openCycle) {
        BigDecimal[] legs = legVolumesFor(a.getId(), openCycle);
        List<TreeNodeResponse> children = remainingDepth <= 0
            ? List.of()
            : associateRepository.findByParentId(a.getId()).stream()
                .map(child -> buildNode(child, remainingDepth - 1, ranksById, openCycle))
                .toList();
        RankTier rank = ranksById.get(a.getRankId());
        return new TreeNodeResponse(
            a.getId(), a.getUserId(), a.getName(), rank == null ? null : rank.getName(),
            a.getKycStatus(), a.getPosition(), legs[0], legs[1],
            isSkewed(legs[0], legs[1]), isStagnant(a), children);
    }

    private boolean isSkewed(BigDecimal left, BigDecimal right) {
        if (left.signum() == 0 || right.signum() == 0) {
            return false;
        }
        BigDecimal larger = left.max(right);
        BigDecimal smaller = left.min(right);
        return larger.compareTo(smaller.multiply(BigDecimal.valueOf(MAX_LEG_SKEW_RATIO))) >= 0;
    }

    private boolean isStagnant(Associate a) {
        boolean oldEnough = a.getJoinedAt().isBefore(Instant.now().minus(STAGNANT_THRESHOLD_DAYS, ChronoUnit.DAYS));
        return oldEnough && associateRepository.countByParentId(a.getId()) == 0;
    }

    private BigDecimal[] legVolumesFor(UUID associateId, Optional<Cycle> openCycle) {
        if (openCycle.isEmpty()) {
            return new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO};
        }
        return legVolumeRepository.findByAssociateIdAndCycleId(associateId, openCycle.get().getId())
            .map(lv -> new BigDecimal[]{lv.getLeftLegVolume(), lv.getRightLegVolume()})
            .orElse(new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO});
    }
}
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `cd backend && mvn test -Dtest=TreeExplorerServiceTest`
Expected: PASS.

- [ ] **Step 10: Write the failing controller test**

Create `backend/src/test/java/com/plotchain/tree/TreeExplorerControllerTest.java`:

```java
package com.plotchain.tree;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.auth.JwtService;
import com.plotchain.cycle.CycleRepository;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.legvolume.LegVolumeRepository;
import com.plotchain.rank.RankTierRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class TreeExplorerControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;
    @MockBean RankTierRepository rankTierRepository;
    @MockBean CycleRepository cycleRepository;
    @MockBean LegVolumeRepository legVolumeRepository;

    private static final UUID ROOT_ID = UUID.randomUUID();

    private String tokenFor(AssociateRole role) {
        Associate token = new Associate();
        token.setId(UUID.randomUUID());
        token.setRole(role);
        return jwtService.generateToken(token);
    }

    private Associate seedRoot() {
        Associate a = new Associate();
        a.setId(ROOT_ID);
        a.setUserId("VP00001");
        a.setName("Root");
        a.setRole(AssociateRole.ASSOCIATE);
        a.setKycStatus(KycStatus.PENDING);
        a.setJoinedAt(Instant.now());
        return a;
    }

    @Test
    void subtreeReturnsTheRootNodeForAnyAdminFamilyToken() throws Exception {
        when(associateRepository.findByIdAndRole(ROOT_ID, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(seedRoot()));
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of());
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)).thenReturn(Optional.empty());
        when(associateRepository.countByParentId(ROOT_ID)).thenReturn(0L);

        mockMvc.perform(get("/api/admin/tree/" + ROOT_ID)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.SUPPORT)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.userId").value("VP00001"));
    }

    @Test
    void subtreeIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/admin/tree/" + ROOT_ID)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    @Test
    void searchReturnsTheAncestorPath() throws Exception {
        Associate root = seedRoot();
        when(associateRepository.findByUserId("VP00001")).thenReturn(Optional.of(root));
        when(associateRepository.findAncestorChain(ROOT_ID)).thenReturn(List.of(ROOT_ID));
        when(associateRepository.findAllById(List.of(ROOT_ID))).thenReturn(List.of(root));

        mockMvc.perform(get("/api/admin/tree/search").param("q", "VP00001")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.SUPPORT)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.ancestorPath[0].userId").value("VP00001"));
    }
}
```

- [ ] **Step 11: Run the test to verify it fails**

Run: `cd backend && mvn test -Dtest=TreeExplorerControllerTest`
Expected: FAIL — `TreeExplorerController` doesn't exist yet.

- [ ] **Step 12: Implement `TreeExplorerController`**

```java
package com.plotchain.tree;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/admin/tree")
public class TreeExplorerController {

    private final TreeExplorerService treeExplorerService;

    public TreeExplorerController(TreeExplorerService treeExplorerService) {
        this.treeExplorerService = treeExplorerService;
    }

    @GetMapping("/{associateId}")
    public TreeNodeResponse subtree(@PathVariable UUID associateId, @RequestParam(defaultValue = "3") int depth) {
        return treeExplorerService.subtree(associateId, depth);
    }

    @GetMapping("/search")
    public TreeSearchResponse search(@RequestParam String q) {
        return treeExplorerService.search(q);
    }
}
```

Note: since `/api/admin/tree/search` and `/api/admin/tree/{associateId}` both match `GET /api/admin/tree/*` for Spring MVC routing purposes, Spring's more-specific-literal-beats-path-variable matching rule means `/search` resolves to the `search` method, not `subtree` with `associateId="search"` — this is standard Spring MVC behavior, no extra configuration needed.

- [ ] **Step 13: Run the tests to verify they pass**

Run: `cd backend && mvn test -Dtest=TreeExplorerControllerTest`
Expected: PASS.

- [ ] **Step 14: Commit**

```bash
git add backend/src/main/java/com/plotchain/associate/AssociateRepository.java \
        backend/src/main/java/com/plotchain/legvolume/LegVolume.java \
        backend/src/main/java/com/plotchain/tree/ \
        backend/src/test/java/com/plotchain/associate/AssociateRepositoryTest.java \
        backend/src/test/java/com/plotchain/tree/
git commit -m "feat(tree): add read-only Tree Explorer endpoints"
```

---

## Task 5: Tree Explorer — frontend

**Files:**
- Create: `frontend/src/app/admin/models/tree-node.model.ts`
- Create: `frontend/src/app/admin/models/tree-search.model.ts`
- Create: `frontend/src/app/admin/tree-explorer/tree-explorer.service.ts`
- Test: `frontend/src/app/admin/tree-explorer/tree-explorer.service.spec.ts`
- Create: `frontend/src/app/admin/tree-explorer/tree-explorer.component.ts`
- Test: `frontend/src/app/admin/tree-explorer/tree-explorer.component.spec.ts`
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/settings/settings-nav-rail.component.ts`
- Modify: `frontend/src/assets/i18n/en.json`, `frontend/src/assets/i18n/hi.json`

**Interfaces:**
- Consumes: `GET /api/admin/tree/{associateId}?depth=N`, `GET /api/admin/tree/search?q=` (Task 4).
- Produces: `TreeExplorerService` with `subtree(associateId, depth): Observable<TreeNode>`, `search(userId): Observable<TreeSearchResult>`.

- [ ] **Step 1: Add the models**

`frontend/src/app/admin/models/tree-node.model.ts`:

```typescript
export interface TreeNode {
  id: string;
  userId: string;
  name: string;
  rankName: string | null;
  kycStatus: 'PENDING' | 'VERIFIED' | 'REJECTED';
  position: string | null;
  leftLegVolume: number;
  rightLegVolume: number;
  skewedLegsFlag: boolean;
  stagnantFlag: boolean;
  children: TreeNode[];
}
```

`frontend/src/app/admin/models/tree-search.model.ts`:

```typescript
export interface TreeNodeSummary {
  id: string;
  userId: string;
  name: string;
}

export interface TreeSearchResult {
  ancestorPath: TreeNodeSummary[];
}
```

- [ ] **Step 2: Write the failing service test**

Create `frontend/src/app/admin/tree-explorer/tree-explorer.service.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TreeExplorerService } from './tree-explorer.service';
import { TreeNode } from '../models/tree-node.model';
import { TreeSearchResult } from '../models/tree-search.model';

describe('TreeExplorerService', () => {
  let service: TreeExplorerService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [TreeExplorerService]
    });
    service = TestBed.inject(TreeExplorerService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('fetches a subtree at the given depth', () => {
    const mockNode: TreeNode = {
      id: 'a1', userId: 'VP00001', name: 'Root', rankName: null, kycStatus: 'PENDING', position: null,
      leftLegVolume: 0, rightLegVolume: 0, skewedLegsFlag: false, stagnantFlag: false, children: []
    };

    service.subtree('a1', 2).subscribe(res => expect(res).toEqual(mockNode));

    const req = httpMock.expectOne('/api/admin/tree/a1?depth=2');
    expect(req.request.method).toBe('GET');
    req.flush(mockNode);
  });

  it('searches by exact userId', () => {
    const mockResult: TreeSearchResult = { ancestorPath: [{ id: 'a1', userId: 'VP00001', name: 'Root' }] };

    service.search('VP00001').subscribe(res => expect(res).toEqual(mockResult));

    const req = httpMock.expectOne('/api/admin/tree/search?q=VP00001');
    expect(req.request.method).toBe('GET');
    req.flush(mockResult);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd frontend && npx ng test --include='**/tree-explorer.service.spec.ts' --watch=false`
Expected: FAIL — `TreeExplorerService` doesn't exist yet.

- [ ] **Step 4: Implement `TreeExplorerService`**

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { TreeNode } from '../models/tree-node.model';
import { TreeSearchResult } from '../models/tree-search.model';

@Injectable({ providedIn: 'root' })
export class TreeExplorerService {
  private http = inject(HttpClient);

  subtree(associateId: string, depth: number): Observable<TreeNode> {
    return this.http.get<TreeNode>(`/api/admin/tree/${associateId}`, { params: new HttpParams().set('depth', depth) });
  }

  search(userId: string): Observable<TreeSearchResult> {
    return this.http.get<TreeSearchResult>('/api/admin/tree/search', { params: new HttpParams().set('q', userId) });
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd frontend && npx ng test --include='**/tree-explorer.service.spec.ts' --watch=false`
Expected: PASS.

- [ ] **Step 6: Write the failing component test**

Create `frontend/src/app/admin/tree-explorer/tree-explorer.component.spec.ts`:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { TreeExplorerComponent } from './tree-explorer.component';

describe('TreeExplorerComponent', () => {
  let fixture: ComponentFixture<TreeExplorerComponent>;
  let httpMock: HttpTestingController;

  const rootNode = {
    id: 'a1', userId: 'VP00001', name: 'Root', rankName: null, kycStatus: 'PENDING', position: null,
    leftLegVolume: 0, rightLegVolume: 0, skewedLegsFlag: false, stagnantFlag: false, children: []
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TreeExplorerComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(TreeExplorerComponent);
  });

  afterEach(() => httpMock.verify());

  it('does nothing on init until a root is searched', () => {
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectNone(() => true);
    expect(fixture.componentInstance.root).toBeNull();
  });

  it('loads a subtree when searching by exact userId', () => {
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    fixture.componentInstance.searchQuery = 'VP00001';
    fixture.componentInstance.onSearch();

    const searchReq = httpMock.expectOne('/api/admin/tree/search?q=VP00001');
    searchReq.flush({ ancestorPath: [{ id: 'a1', userId: 'VP00001', name: 'Root' }] });

    const subtreeReq = httpMock.expectOne('/api/admin/tree/a1?depth=3');
    subtreeReq.flush(rootNode);

    expect(fixture.componentInstance.root?.userId).toBe('VP00001');
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `cd frontend && npx ng test --include='**/tree-explorer.component.spec.ts' --watch=false`
Expected: FAIL — `TreeExplorerComponent` doesn't exist yet.

- [ ] **Step 8: Implement `TreeExplorerComponent`**

```typescript
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { TreeExplorerService } from './tree-explorer.service';
import { TreeNode } from '../models/tree-node.model';

const DEFAULT_DEPTH = 3;

@Component({
  selector: 'app-tree-explorer',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="tree-explorer card">
      <h1 class="card-title">{{ 'admin.treeExplorer.title' | translate }}</h1>

      <div class="tree-explorer__search">
        <input
          type="text"
          [(ngModel)]="searchQuery"
          [placeholder]="'admin.treeExplorer.searchPlaceholder' | translate"
        />
        <button type="button" (click)="onSearch()">{{ 'admin.treeExplorer.searchAction' | translate }}</button>
      </div>

      <p *ngIf="notFound" class="tree-explorer__not-found">{{ 'admin.treeExplorer.notFound' | translate }}</p>

      <ng-container *ngIf="root">
        <ng-container *ngTemplateOutlet="nodeTemplate; context: { node: root }"></ng-container>
      </ng-container>

      <ng-template #nodeTemplate let-node="node">
        <div class="tree-explorer__node">
          <span class="tree-explorer__node-id">{{ node.userId }}</span>
          <span class="tree-explorer__node-name">{{ node.name }}</span>
          <span class="tree-explorer__flag tree-explorer__flag--skewed" *ngIf="node.skewedLegsFlag">
            {{ 'admin.treeExplorer.skewedLegsFlag' | translate }}
          </span>
          <span class="tree-explorer__flag tree-explorer__flag--stagnant" *ngIf="node.stagnantFlag">
            {{ 'admin.treeExplorer.stagnantFlag' | translate }}
          </span>
          <div class="tree-explorer__children" *ngIf="node.children.length">
            <ng-container *ngFor="let child of node.children">
              <ng-container *ngTemplateOutlet="nodeTemplate; context: { node: child }"></ng-container>
            </ng-container>
          </div>
        </div>
      </ng-template>
    </div>
  `
})
export class TreeExplorerComponent {
  private treeExplorerService = inject(TreeExplorerService);

  searchQuery = '';
  root: TreeNode | null = null;
  notFound = false;

  onSearch(): void {
    if (!this.searchQuery) return;
    this.notFound = false;
    this.treeExplorerService.search(this.searchQuery).subscribe({
      next: result => {
        const target = result.ancestorPath[result.ancestorPath.length - 1];
        this.treeExplorerService.subtree(target.id, DEFAULT_DEPTH).subscribe(node => (this.root = node));
      },
      error: () => {
        this.root = null;
        this.notFound = true;
      }
    });
  }
}
```

Note: the template uses `[(ngModel)]`, which requires `FormsModule` in `imports` — add `import { FormsModule } from '@angular/forms';` and include `FormsModule` in the component's `imports` array (it's missing from the block above; add it before running Step 9).

- [ ] **Step 9: Run the test to verify it passes**

Run: `cd frontend && npx ng test --include='**/tree-explorer.component.spec.ts' --watch=false`
Expected: PASS.

- [ ] **Step 10: Wire the route and nav-rail entry**

In `app.routes.ts`:

```typescript
import { TreeExplorerComponent } from './admin/tree-explorer/tree-explorer.component';
```

```typescript
      { path: 'tree-explorer', component: TreeExplorerComponent, data: { sectionKey: 'treeExplorer' } },
```

In `settings-nav-rail.component.ts`, add another hardcoded `<li>` (same pattern as `associate-directory` added in Task 3):

```html
        <li class="settings-nav-rail__item" [class.settings-nav-rail__item--active]="activeSectionKey === 'treeExplorer'">
          <a [routerLink]="['/settings', 'tree-explorer']">{{ 'settings.sections.treeExplorer' | translate }}</a>
        </li>
```

- [ ] **Step 11: Add i18n keys**

`en.json`, in `settings.sections`:

```json
    "treeExplorer": "Tree Explorer",
```

New `admin.treeExplorer` block:

```json
    "treeExplorer": {
      "title": "Tree Explorer",
      "searchPlaceholder": "Enter Associate ID",
      "searchAction": "Search",
      "notFound": "No associate found with that ID.",
      "skewedLegsFlag": "Skewed legs",
      "stagnantFlag": "Stagnant"
    }
```

Add the matching keys to `hi.json` (English placeholder text, per Task 3's note).

- [ ] **Step 12: Run the full frontend test suite**

Run: `cd frontend && npx ng test --watch=false`
Expected: PASS, no regressions.

- [ ] **Step 13: Commit**

```bash
git add frontend/src/app/admin/models/tree-*.model.ts \
        frontend/src/app/admin/tree-explorer/ \
        frontend/src/app/app.routes.ts \
        frontend/src/app/settings/settings-nav-rail.component.ts \
        frontend/src/assets/i18n/en.json frontend/src/assets/i18n/hi.json
git commit -m "feat(admin): add Tree Explorer screen"
```

---

## Task 6: KYC Review Queue — backend

**Files:**
- Create: `backend/src/main/java/com/plotchain/associate/KycDecisionRequest.java`
- Create: `backend/src/main/java/com/plotchain/associate/KycQueueEntryResponse.java`
- Create: `backend/src/main/java/com/plotchain/associate/KycPageResponse.java`
- Create: `backend/src/main/java/com/plotchain/associate/InvalidKycDecisionException.java`
- Create: `backend/src/main/java/com/plotchain/associate/KycReviewService.java`
- Create: `backend/src/main/java/com/plotchain/associate/KycReviewController.java`
- Modify: `backend/src/main/java/com/plotchain/associate/AssociateRepository.java` (add `findByRoleAndKycStatusOrderByJoinedAtAsc`)
- Modify: `backend/src/main/java/com/plotchain/associate/AssociateProvisioningExceptionHandler.java`
- Test: `backend/src/test/java/com/plotchain/associate/KycReviewServiceTest.java` (new file)
- Test: `backend/src/test/java/com/plotchain/associate/KycReviewControllerTest.java` (new file)

**Interfaces:**
- Consumes: `AssociateRepository.findByIdAndRole` (Task 2), `SettingsAuditService.record` (existing).
- Produces: `KycReviewController` at `/api/admin/kyc`, `list(KycStatus status, int page, int size): KycPageResponse`, `decide(UUID associateId, KycDecisionRequest, UUID actorId): KycQueueEntryResponse`.

- [ ] **Step 1: Add the DTOs and exception**

`KycDecisionRequest.java`:

```java
package com.plotchain.associate;

import jakarta.validation.constraints.NotNull;

public record KycDecisionRequest(@NotNull KycStatus decision, String reason) {}
```

`KycQueueEntryResponse.java`:

```java
package com.plotchain.associate;

import java.time.Instant;
import java.util.UUID;

public record KycQueueEntryResponse(UUID id, String userId, String name, KycStatus kycStatus, Instant joinedAt) {}
```

`KycPageResponse.java`:

```java
package com.plotchain.associate;

import java.util.List;

public record KycPageResponse(List<KycQueueEntryResponse> entries, int page, int size, long totalElements) {}
```

`InvalidKycDecisionException.java`:

```java
package com.plotchain.associate;

public class InvalidKycDecisionException extends RuntimeException {
    public InvalidKycDecisionException(String message) {
        super(message);
    }
}
```

- [ ] **Step 2: Add the repository method**

In `AssociateRepository.java`:

```java
    Page<Associate> findByRoleAndKycStatusOrderByJoinedAtAsc(AssociateRole role, KycStatus kycStatus, Pageable pageable);
```

- [ ] **Step 3: Write the failing service test**

Create `backend/src/test/java/com/plotchain/associate/KycReviewServiceTest.java`:

```java
package com.plotchain.associate;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.company.SettingsAuditLog;
import com.plotchain.company.SettingsAuditLogRepository;
import com.plotchain.company.SettingsAuditService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class KycReviewServiceTest {

    @Mock AssociateRepository associateRepository;
    @Mock SettingsAuditLogRepository settingsAuditLogRepository;

    KycReviewService service;
    private static final UUID ACTOR_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        SettingsAuditService settingsAuditService = new SettingsAuditService(
            settingsAuditLogRepository, associateRepository, new ObjectMapper().findAndRegisterModules());
        service = new KycReviewService(associateRepository, settingsAuditService);
    }

    private Associate newAssociate(UUID id, String userId, KycStatus kycStatus) {
        Associate a = new Associate();
        a.setId(id);
        a.setUserId(userId);
        a.setName("Jane Doe");
        a.setRole(AssociateRole.ASSOCIATE);
        a.setKycStatus(kycStatus);
        a.setJoinedAt(Instant.now());
        return a;
    }

    @Test
    void listReturnsAPageOfEntriesForTheGivenStatus() {
        Associate associate = newAssociate(UUID.randomUUID(), "VP00001", KycStatus.PENDING);
        when(associateRepository.findByRoleAndKycStatusOrderByJoinedAtAsc(
            AssociateRole.ASSOCIATE, KycStatus.PENDING, PageRequest.of(0, 20)))
            .thenReturn(new PageImpl<>(List.of(associate), PageRequest.of(0, 20), 1));

        KycPageResponse response = service.list(KycStatus.PENDING, 0, 20);

        assertThat(response.entries()).hasSize(1);
        assertThat(response.entries().get(0).userId()).isEqualTo("VP00001");
    }

    @Test
    void decideApprovesAndRecordsAudit() {
        UUID id = UUID.randomUUID();
        Associate associate = newAssociate(id, "VP00001", KycStatus.PENDING);
        when(associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(associate));

        KycQueueEntryResponse response = service.decide(id, new KycDecisionRequest(KycStatus.VERIFIED, null), ACTOR_ID);

        assertThat(associate.getKycStatus()).isEqualTo(KycStatus.VERIFIED);
        assertThat(response.kycStatus()).isEqualTo(KycStatus.VERIFIED);
        verify(associateRepository).save(associate);

        ArgumentCaptor<SettingsAuditLog> captor = ArgumentCaptor.forClass(SettingsAuditLog.class);
        verify(settingsAuditLogRepository).save(captor.capture());
        assertThat(captor.getValue().getSection()).isEqualTo("kyc");
    }

    @Test
    void decideRejectsWithoutAReasonThrows() {
        UUID id = UUID.randomUUID();
        Associate associate = newAssociate(id, "VP00001", KycStatus.PENDING);
        when(associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(associate));

        assertThatThrownBy(() -> service.decide(id, new KycDecisionRequest(KycStatus.REJECTED, ""), ACTOR_ID))
            .isInstanceOf(InvalidKycDecisionException.class);
        assertThatThrownBy(() -> service.decide(id, new KycDecisionRequest(KycStatus.REJECTED, null), ACTOR_ID))
            .isInstanceOf(InvalidKycDecisionException.class);
    }

    @Test
    void decideWithReasonAcceptsRejection() {
        UUID id = UUID.randomUUID();
        Associate associate = newAssociate(id, "VP00001", KycStatus.PENDING);
        when(associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(associate));

        KycQueueEntryResponse response =
            service.decide(id, new KycDecisionRequest(KycStatus.REJECTED, "Blurry PAN photo"), ACTOR_ID);

        assertThat(response.kycStatus()).isEqualTo(KycStatus.REJECTED);
    }

    @Test
    void decideRejectsAPendingDecisionValue() {
        UUID id = UUID.randomUUID();
        Associate associate = newAssociate(id, "VP00001", KycStatus.PENDING);
        when(associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(associate));

        assertThatThrownBy(() -> service.decide(id, new KycDecisionRequest(KycStatus.PENDING, null), ACTOR_ID))
            .isInstanceOf(InvalidKycDecisionException.class);
    }

    @Test
    void decideThrowsWhenAssociateNotFound() {
        UUID id = UUID.randomUUID();
        when(associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.decide(id, new KycDecisionRequest(KycStatus.VERIFIED, null), ACTOR_ID))
            .isInstanceOf(AssociateNotFoundException.class);
    }
}
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd backend && mvn test -Dtest=KycReviewServiceTest`
Expected: FAIL — `KycReviewService` doesn't exist yet.

- [ ] **Step 5: Implement `KycReviewService`**

```java
package com.plotchain.associate;

import com.plotchain.company.SettingsAuditService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class KycReviewService {

    private final AssociateRepository associateRepository;
    private final SettingsAuditService settingsAuditService;

    public KycReviewService(AssociateRepository associateRepository, SettingsAuditService settingsAuditService) {
        this.associateRepository = associateRepository;
        this.settingsAuditService = settingsAuditService;
    }

    public KycPageResponse list(KycStatus status, int page, int size) {
        Page<Associate> result = associateRepository.findByRoleAndKycStatusOrderByJoinedAtAsc(
            AssociateRole.ASSOCIATE, status, PageRequest.of(page, size));
        List<KycQueueEntryResponse> entries = result.getContent().stream().map(KycReviewService::toEntry).toList();
        return new KycPageResponse(entries, page, size, result.getTotalElements());
    }

    public KycQueueEntryResponse decide(UUID associateId, KycDecisionRequest request, UUID actorId) {
        if (request.decision() != KycStatus.VERIFIED && request.decision() != KycStatus.REJECTED) {
            throw new InvalidKycDecisionException("decision must be VERIFIED or REJECTED");
        }
        if (request.decision() == KycStatus.REJECTED && (request.reason() == null || request.reason().isBlank())) {
            throw new InvalidKycDecisionException("reason is required when rejecting");
        }

        Associate associate = associateRepository.findByIdAndRole(associateId, AssociateRole.ASSOCIATE)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));
        associate.setKycStatus(request.decision());
        associateRepository.save(associate);

        settingsAuditService.record("kyc",
            "KYC " + request.decision().name() + " for " + associate.getUserId(),
            Map.of("decision", request.decision().name(), "reason", request.reason() == null ? "" : request.reason()),
            actorId);

        return toEntry(associate);
    }

    private static KycQueueEntryResponse toEntry(Associate a) {
        return new KycQueueEntryResponse(a.getId(), a.getUserId(), a.getName(), a.getKycStatus(), a.getJoinedAt());
    }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd backend && mvn test -Dtest=KycReviewServiceTest`
Expected: PASS.

- [ ] **Step 7: Add the exception handler**

In `AssociateProvisioningExceptionHandler.java`, add:

```java
    @ExceptionHandler(InvalidKycDecisionException.class)
    public ResponseEntity<Map<String, String>> handleInvalidKycDecision(InvalidKycDecisionException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", ex.getMessage()));
    }
```

- [ ] **Step 8: Write the failing controller test**

Create `backend/src/test/java/com/plotchain/associate/KycReviewControllerTest.java`:

```java
package com.plotchain.associate;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.auth.JwtService;
import com.plotchain.company.SettingsAuditLogRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class KycReviewControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;
    @MockBean SettingsAuditLogRepository settingsAuditLogRepository;

    private static final UUID ASSOCIATE_ID = UUID.randomUUID();

    private String tokenFor(AssociateRole role) {
        Associate token = new Associate();
        token.setId(UUID.randomUUID());
        token.setRole(role);
        return jwtService.generateToken(token);
    }

    private Associate seedAssociate() {
        Associate a = new Associate();
        a.setId(ASSOCIATE_ID);
        a.setUserId("VP00001");
        a.setName("Jane Doe");
        a.setRole(AssociateRole.ASSOCIATE);
        a.setKycStatus(KycStatus.PENDING);
        a.setJoinedAt(Instant.now());
        return a;
    }

    @Test
    void listDefaultsToPendingAndAllowsAnyAdminFamilyToken() throws Exception {
        when(associateRepository.findByRoleAndKycStatusOrderByJoinedAtAsc(
            eq(AssociateRole.ASSOCIATE), eq(KycStatus.PENDING), any()))
            .thenReturn(new PageImpl<>(List.of(seedAssociate()), PageRequest.of(0, 20), 1));

        mockMvc.perform(get("/api/admin/kyc")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.FINANCE)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.entries[0].userId").value("VP00001"));
    }

    @Test
    void decideSucceedsForAKycReviewerToken() throws Exception {
        when(associateRepository.findByIdAndRole(ASSOCIATE_ID, AssociateRole.ASSOCIATE))
            .thenReturn(Optional.of(seedAssociate()));

        mockMvc.perform(post("/api/admin/kyc/" + ASSOCIATE_ID + "/decision")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.KYC_REVIEWER))
                .contentType("application/json")
                .content(new ObjectMapper().writeValueAsString(new KycDecisionRequest(KycStatus.VERIFIED, null))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.kycStatus").value("VERIFIED"));
    }

    @Test
    void decideIsForbiddenForAFinanceToken() throws Exception {
        // 403 proves @PreAuthorize narrowing: FINANCE passes the blanket admin-family POST
        // rule at the web layer but is not in KycReviewController's allowed-authority list.
        mockMvc.perform(post("/api/admin/kyc/" + ASSOCIATE_ID + "/decision")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.FINANCE))
                .contentType("application/json")
                .content(new ObjectMapper().writeValueAsString(new KycDecisionRequest(KycStatus.VERIFIED, null))))
            .andExpect(status().isForbidden());
    }
}
```

- [ ] **Step 9: Run the test to verify it fails**

Run: `cd backend && mvn test -Dtest=KycReviewControllerTest`
Expected: FAIL — `KycReviewController` doesn't exist yet.

- [ ] **Step 10: Implement `KycReviewController`**

```java
package com.plotchain.associate;

import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/admin/kyc")
public class KycReviewController {

    private final KycReviewService kycReviewService;

    public KycReviewController(KycReviewService kycReviewService) {
        this.kycReviewService = kycReviewService;
    }

    @GetMapping
    public KycPageResponse list(
        @RequestParam(defaultValue = "PENDING") KycStatus status,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size
    ) {
        return kycReviewService.list(status, page, size);
    }

    @PostMapping("/{associateId}/decision")
    @PreAuthorize("hasAnyAuthority('ADMIN','SUPER_ADMIN','KYC_REVIEWER')")
    public KycQueueEntryResponse decide(@PathVariable UUID associateId, @Valid @RequestBody KycDecisionRequest request,
                                         @AuthenticationPrincipal UUID actorId) {
        return kycReviewService.decide(associateId, request, actorId);
    }
}
```

- [ ] **Step 11: Run the tests to verify they pass**

Run: `cd backend && mvn test -Dtest=KycReviewControllerTest`
Expected: PASS.

- [ ] **Step 12: Add SecurityConfigTest coverage for the KYC decision narrowing**

Add to `SecurityConfigTest.java`:

```java
    @Test
    void kycDecisionIsForbiddenForASupportToken() throws Exception {
        mockMvc.perform(post("/api/admin/kyc/" + UUID.randomUUID() + "/decision")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.SUPPORT))
                .contentType("application/json")
                .content("{\"decision\":\"VERIFIED\"}"))
            .andExpect(status().isForbidden());
    }
```

Run: `cd backend && mvn test -Dtest=SecurityConfigTest`
Expected: PASS.

- [ ] **Step 13: Run the full backend test suite**

Run: `cd backend && mvn test`
Expected: PASS, no regressions across the whole module.

- [ ] **Step 14: Commit**

```bash
git add backend/src/main/java/com/plotchain/associate/Kyc*.java \
        backend/src/main/java/com/plotchain/associate/InvalidKycDecisionException.java \
        backend/src/main/java/com/plotchain/associate/AssociateRepository.java \
        backend/src/main/java/com/plotchain/associate/AssociateProvisioningExceptionHandler.java \
        backend/src/test/java/com/plotchain/associate/KycReviewServiceTest.java \
        backend/src/test/java/com/plotchain/associate/KycReviewControllerTest.java \
        backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java
git commit -m "feat(associate): add KYC Review Queue endpoints"
```

---

## Task 7: KYC Review Queue — frontend

**Files:**
- Create: `frontend/src/app/admin/models/kyc-queue-entry.model.ts`
- Create: `frontend/src/app/admin/models/kyc-page.model.ts`
- Create: `frontend/src/app/admin/kyc-queue/kyc-queue.service.ts`
- Test: `frontend/src/app/admin/kyc-queue/kyc-queue.service.spec.ts`
- Create: `frontend/src/app/admin/kyc-queue/kyc-queue.component.ts`
- Test: `frontend/src/app/admin/kyc-queue/kyc-queue.component.spec.ts`
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/settings/settings-nav-rail.component.ts`
- Modify: `frontend/src/assets/i18n/en.json`, `frontend/src/assets/i18n/hi.json`

**Interfaces:**
- Consumes: `GET /api/admin/kyc?status=&page=&size=`, `POST /api/admin/kyc/{id}/decision` (Task 6). `TabBarComponent` (`@Input() tabs`, `activeTabId`, `@Output() tabChange`). `StatTileComponent` (`@Input() label`, `value`, `hint?`, `tone?`).
- Produces: `KycQueueService` with `list(status, page, size): Observable<KycPage>`, `decide(id, decision, reason?): Observable<KycQueueEntry>`.

- [ ] **Step 1: Add the models**

`frontend/src/app/admin/models/kyc-queue-entry.model.ts`:

```typescript
export interface KycQueueEntry {
  id: string;
  userId: string;
  name: string;
  kycStatus: 'PENDING' | 'VERIFIED' | 'REJECTED';
  joinedAt: string;
}
```

`frontend/src/app/admin/models/kyc-page.model.ts`:

```typescript
import { KycQueueEntry } from './kyc-queue-entry.model';

export interface KycPage {
  entries: KycQueueEntry[];
  page: number;
  size: number;
  totalElements: number;
}
```

- [ ] **Step 2: Write the failing service test**

Create `frontend/src/app/admin/kyc-queue/kyc-queue.service.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { KycQueueService } from './kyc-queue.service';
import { KycPage } from '../models/kyc-page.model';

describe('KycQueueService', () => {
  let service: KycQueueService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [KycQueueService]
    });
    service = TestBed.inject(KycQueueService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('lists the queue for a given status', () => {
    const mockPage: KycPage = { entries: [], page: 0, size: 20, totalElements: 0 };

    service.list('PENDING', 0, 20).subscribe(res => expect(res).toEqual(mockPage));

    const req = httpMock.expectOne('/api/admin/kyc?status=PENDING&page=0&size=20');
    expect(req.request.method).toBe('GET');
    req.flush(mockPage);
  });

  it('submits an approval decision with no reason', () => {
    service.decide('a1', 'VERIFIED').subscribe();

    const req = httpMock.expectOne('/api/admin/kyc/a1/decision');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ decision: 'VERIFIED', reason: undefined });
    req.flush({});
  });

  it('submits a rejection decision with a reason', () => {
    service.decide('a1', 'REJECTED', 'Blurry PAN photo').subscribe();

    const req = httpMock.expectOne('/api/admin/kyc/a1/decision');
    expect(req.request.body).toEqual({ decision: 'REJECTED', reason: 'Blurry PAN photo' });
    req.flush({});
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd frontend && npx ng test --include='**/kyc-queue.service.spec.ts' --watch=false`
Expected: FAIL — `KycQueueService` doesn't exist yet.

- [ ] **Step 4: Implement `KycQueueService`**

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { KycPage } from '../models/kyc-page.model';
import { KycQueueEntry } from '../models/kyc-queue-entry.model';

@Injectable({ providedIn: 'root' })
export class KycQueueService {
  private http = inject(HttpClient);

  list(status: string, page: number, size: number): Observable<KycPage> {
    const params = new HttpParams().set('status', status).set('page', page).set('size', size);
    return this.http.get<KycPage>('/api/admin/kyc', { params });
  }

  decide(id: string, decision: 'VERIFIED' | 'REJECTED', reason?: string): Observable<KycQueueEntry> {
    return this.http.post<KycQueueEntry>(`/api/admin/kyc/${id}/decision`, { decision, reason });
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd frontend && npx ng test --include='**/kyc-queue.service.spec.ts' --watch=false`
Expected: PASS.

- [ ] **Step 6: Write the failing component test**

Create `frontend/src/app/admin/kyc-queue/kyc-queue.component.spec.ts`:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { KycQueueComponent } from './kyc-queue.component';

describe('KycQueueComponent', () => {
  let fixture: ComponentFixture<KycQueueComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [KycQueueComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(KycQueueComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    httpMock.expectOne('/api/admin/kyc?status=PENDING&page=0&size=20')
      .flush({ entries: [{ id: 'a1', userId: 'VP00001', name: 'Jane', kycStatus: 'PENDING', joinedAt: '2026-01-01T00:00:00Z' }], page: 0, size: 20, totalElements: 1 });
  });

  afterEach(() => httpMock.verify());

  it('loads the pending queue by default', () => {
    expect(fixture.componentInstance.page?.entries.length).toBe(1);
    expect(fixture.componentInstance.activeStatus).toBe('PENDING');
  });

  it('reloads the queue when the status tab changes', () => {
    fixture.componentInstance.onTabChange('REJECTED');

    const req = httpMock.expectOne('/api/admin/kyc?status=REJECTED&page=0&size=20');
    req.flush({ entries: [], page: 0, size: 20, totalElements: 0 });

    expect(fixture.componentInstance.activeStatus).toBe('REJECTED');
  });

  it('approves an entry and removes it from the pending list', () => {
    fixture.componentInstance.approve('a1');

    const req = httpMock.expectOne('/api/admin/kyc/a1/decision');
    expect(req.request.body).toEqual({ decision: 'VERIFIED', reason: undefined });
    req.flush({ id: 'a1', userId: 'VP00001', name: 'Jane', kycStatus: 'VERIFIED', joinedAt: '2026-01-01T00:00:00Z' });

    const reload = httpMock.expectOne('/api/admin/kyc?status=PENDING&page=0&size=20');
    reload.flush({ entries: [], page: 0, size: 20, totalElements: 0 });
  });

  it('rejects an entry with a reason', () => {
    fixture.componentInstance.rejectReason = 'Blurry PAN photo';
    fixture.componentInstance.reject('a1');

    const req = httpMock.expectOne('/api/admin/kyc/a1/decision');
    expect(req.request.body).toEqual({ decision: 'REJECTED', reason: 'Blurry PAN photo' });
    req.flush({ id: 'a1', userId: 'VP00001', name: 'Jane', kycStatus: 'REJECTED', joinedAt: '2026-01-01T00:00:00Z' });

    const reload = httpMock.expectOne('/api/admin/kyc?status=PENDING&page=0&size=20');
    reload.flush({ entries: [], page: 0, size: 20, totalElements: 0 });
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `cd frontend && npx ng test --include='**/kyc-queue.component.spec.ts' --watch=false`
Expected: FAIL — `KycQueueComponent` doesn't exist yet.

- [ ] **Step 8: Implement `KycQueueComponent`**

```typescript
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { KycQueueService } from './kyc-queue.service';
import { KycPage } from '../models/kyc-page.model';
import { TabBarComponent, TabDefinition } from '../../shared/components/tab-bar/tab-bar.component';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-kyc-queue',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, TabBarComponent],
  template: `
    <div class="kyc-queue card">
      <h1 class="card-title">{{ 'admin.kycQueue.title' | translate }}</h1>

      <app-tab-bar [tabs]="tabs" [activeTabId]="activeStatus" (tabChange)="onTabChange($event)"></app-tab-bar>

      <table class="kyc-queue__table">
        <thead>
          <tr>
            <th>{{ 'admin.kycQueue.columnUserId' | translate }}</th>
            <th>{{ 'admin.kycQueue.columnName' | translate }}</th>
            <th>{{ 'admin.kycQueue.columnJoinedAt' | translate }}</th>
            <th *ngIf="activeStatus === 'PENDING'">{{ 'admin.kycQueue.columnActions' | translate }}</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let entry of page?.entries">
            <td>{{ entry.userId }}</td>
            <td>{{ entry.name }}</td>
            <td>{{ entry.joinedAt | date: 'medium' }}</td>
            <td *ngIf="activeStatus === 'PENDING'">
              <button type="button" (click)="approve(entry.id)">
                {{ 'admin.kycQueue.approveAction' | translate }}
              </button>
              <input
                type="text"
                [(ngModel)]="rejectReason"
                [placeholder]="'admin.kycQueue.rejectReasonPlaceholder' | translate"
              />
              <button type="button" (click)="reject(entry.id)">
                {{ 'admin.kycQueue.rejectAction' | translate }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  `
})
export class KycQueueComponent implements OnInit {
  private kycQueueService = inject(KycQueueService);
  private translate = inject(TranslateService);

  page: KycPage | null = null;
  activeStatus = 'PENDING';
  rejectReason = '';

  get tabs(): TabDefinition[] {
    return [
      { id: 'PENDING', label: this.translate.instant('admin.kycQueue.tabPending') },
      { id: 'VERIFIED', label: this.translate.instant('admin.kycQueue.tabVerified') },
      { id: 'REJECTED', label: this.translate.instant('admin.kycQueue.tabRejected') }
    ];
  }

  ngOnInit(): void {
    this.loadPage(0);
  }

  onTabChange(status: string): void {
    this.activeStatus = status;
    this.loadPage(0);
  }

  approve(id: string): void {
    this.kycQueueService.decide(id, 'VERIFIED').subscribe(() => this.loadPage(this.page?.page ?? 0));
  }

  reject(id: string): void {
    this.kycQueueService.decide(id, 'REJECTED', this.rejectReason).subscribe(() => {
      this.rejectReason = '';
      this.loadPage(this.page?.page ?? 0);
    });
  }

  private loadPage(page: number): void {
    this.kycQueueService.list(this.activeStatus, page, PAGE_SIZE).subscribe(res => (this.page = res));
  }
}
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `cd frontend && npx ng test --include='**/kyc-queue.component.spec.ts' --watch=false`
Expected: PASS.

- [ ] **Step 10: Wire the route and nav-rail entry**

In `app.routes.ts`:

```typescript
import { KycQueueComponent } from './admin/kyc-queue/kyc-queue.component';
```

```typescript
      { path: 'kyc-queue', component: KycQueueComponent, data: { sectionKey: 'kycQueue' } },
```

In `settings-nav-rail.component.ts`:

```html
        <li class="settings-nav-rail__item" [class.settings-nav-rail__item--active]="activeSectionKey === 'kycQueue'">
          <a [routerLink]="['/settings', 'kyc-queue']">{{ 'settings.sections.kycQueue' | translate }}</a>
        </li>
```

- [ ] **Step 11: Add i18n keys**

`en.json`, in `settings.sections`:

```json
    "kycQueue": "KYC Review Queue",
```

New `admin.kycQueue` block:

```json
    "kycQueue": {
      "title": "KYC Review Queue",
      "tabPending": "Pending",
      "tabVerified": "Verified",
      "tabRejected": "Rejected",
      "columnUserId": "Associate ID",
      "columnName": "Name",
      "columnJoinedAt": "Joined",
      "columnActions": "Actions",
      "approveAction": "Approve",
      "rejectAction": "Reject",
      "rejectReasonPlaceholder": "Reason for rejection"
    }
```

Add matching keys to `hi.json`.

- [ ] **Step 12: Run the full frontend test suite**

Run: `cd frontend && npx ng test --watch=false`
Expected: PASS, no regressions.

- [ ] **Step 13: Commit**

```bash
git add frontend/src/app/admin/models/kyc-*.model.ts \
        frontend/src/app/admin/kyc-queue/ \
        frontend/src/app/app.routes.ts \
        frontend/src/app/settings/settings-nav-rail.component.ts \
        frontend/src/assets/i18n/en.json frontend/src/assets/i18n/hi.json
git commit -m "feat(admin): add KYC Review Queue screen"
```

---

## Final verification (after all 7 tasks)

- [ ] Run the full backend suite: `cd backend && mvn test` — expect all green, including every new `SecurityConfigTest` case.
- [ ] Run the full frontend suite: `cd frontend && npx ng test --watch=false` — expect all green.
- [ ] Manually smoke-test against a local `dev`-profile instance: log in as `admin` / `Password123!`, navigate to Settings → Associate Directory / Tree Explorer / KYC Review Queue, confirm each loads without console errors. Then log in as the seeded `associate01` and confirm all three routes redirect away (blocked by `adminGuard` client-side, and would 403 server-side if hit directly).
- [ ] Confirm `docs/superpowers/specs/2026-08-02-admin-usage-core-ops-design.md`'s three in-scope screens each have a working, tested endpoint and UI — cross-check against the spec's tables in §3/§4/§5.
