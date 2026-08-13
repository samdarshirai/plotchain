# Role-Capability Unit 10: Associate Can View Their Digital ID Card — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single self-scoped, read-only `GET /api/associates/me/id-card` endpoint that renders an Associate's own digital ID card (ID number, name, rank, a QR payload, and a documented-null photo field) on demand from existing data, with no new persisted "ID card" record.

**Architecture:** One new `associate`-package service method (`AssociateIdCardService.getMyIdCard`) joins the caller's own `Associate` row to its `RankTier` by `rankId` (same join pattern `CompensationPlanService#getMyRankProgress` already established) and assembles a plain response record — no writes, no new table for the card itself. A thin `@RestController` exposes it at `/api/associates/me/id-card`, self-scoped via `@AuthenticationPrincipal`, needing no new `SecurityConfig` matcher (a bare GET falls through to the existing `anyRequest().authenticated()`).

**Tech Stack:** Spring Boot 3.3.4 / Java 21, Spring Data JPA, Spring Security (JWT bearer via `JwtAuthenticationFilter` + `@AuthenticationPrincipal`), JUnit 5 + Mockito (unit tests) + MockMvc `@SpringBootTest` (controller tests), no new Maven dependency.

**Spec:** `docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md` — "Data visibility matrix" → "Digital ID card" row (Associate: "Own ID card only (photo, ID number, rank, QR)"; Admin: "No dedicated screen (not the persona this serves)") and "Reconciliation & gap-fill" → "Digital ID card" row ("No endpoint... spec always described this as render-on-demand, not persisted").

## Global Constraints

- Render-on-demand, not persisted: no new "ID card" entity/table; every call recomputes the response from the `associate` and `rank_tier` tables. (Spec, "Reconciliation & gap-fill" → "Digital ID card" row.)
- Associate-only capability: no admin-side equivalent endpoint. (Spec, "Digital ID card" row: "No dedicated screen (not the persona this serves)".)
- Self-scoped by construction: the target associate always comes from the verified JWT (`@AuthenticationPrincipal`), never from a path/query parameter — matches every other `/api/associates/me/*` route in this codebase.
- Role model is `ADMIN`/`ASSOCIATE` only (role-capability unit 1, merged) — no `SUPER_ADMIN`/`FINANCE`/`KYC_REVIEWER`/`SUPPORT` branches anywhere in new code.
- No new Maven dependency: no QR-image-generation library exists in `backend/pom.xml` today (verified), and none is added by this unit — the QR field is the raw payload string a frontend encodes into an image client-side, not a server-rendered image.

---

## Design decisions (read before implementing)

**Package: `com.plotchain.associate`, not `compensation` or `tree`.** This is identity/profile data (ID number, name, rank label as a personal attribute, not a compensation computation), matching where `KycSubmissionController`/`PasswordController`-adjacent self-service identity endpoints already live. `AssociateRankProgressController` lives in `compensation` because it's fundamentally a compensation-progress computation; this unit isn't.

**Photo field: stubbed to `null`, not built.** Investigated before deciding:
- No photo/avatar field exists on `Associate` (`backend/src/main/java/com/plotchain/associate/Associate.java`) or anywhere else in the codebase (grepped `photo|avatar|image` across `backend/src/main/java` — only hits are `AssociateKycDocument` (KYC *review* documents, BYTEA-stored, unit 8's precedent), `CompanyBranding.logoSquare/logoWide` (a company-wide asset, not per-associate), and frontend CSS/i18n glyphs unrelated to a real photo).
- Critically, the spec's own "Own profile" matrix row — the one place that enumerates which fields an Associate can edit ("name, contact, bank details, KYC docs, login/transaction password") — **never mentions a photo**. There is no described ingestion path for this field anywhere in the spec, not just in the code. Building upload/storage infrastructure here would be inventing scope the spec itself never asked for, on top of this unit's own stated size ("no dependencies", a single read endpoint).
- Decision: `AssociateIdCardResponse.photoUrl` is always `null` today, explicitly documented in the service's header comment and covered by its own test. A future unit — most likely folded into unit 11/14's profile-edit work, the natural home for any associate-editable field — should revisit this once the spec describes how a photo actually gets set. Reusing `AssociateKycDocument`'s table for a personal photo was considered and rejected: uploading through `KycSubmissionService.uploadDocument` unconditionally resets `kycStatus` to `PENDING`, which is correct for KYC evidence but wrong for a personal photo, and would wrongly send someone back into the admin KYC review queue just for updating their photo.

**QR field: raw payload string, not a server-rendered image.** `backend/pom.xml` has no QR-image library (e.g. ZXing) today, and adding one is unnecessary: the simpler, no-new-dependency option — returning the string a frontend renders into a QR code client-side — satisfies the acceptance criteria ("whatever a QR code would encode") without inventing new infrastructure in a backend-focused unit whose screen (unit 16) is built separately, later. The payload is the associate's own `userId` (e.g. `VP00001`) — the same self-scoped identifier already used for login and directory lookup — rather than a verification URL, since no public verification page/endpoint exists in this codebase to point at, and inventing one would exceed this unit's scope.

**No `SecurityConfig` matcher needed.** Re-verified directly against the current file (`backend/src/main/java/com/plotchain/auth/SecurityConfig.java`): the blanket `POST`/`PUT`/`PATCH`/`DELETE` → `hasAuthority("ADMIN")` rules only match those HTTP methods. A bare `GET /api/associates/me/id-card` never collides with them and falls through to `.anyRequest().authenticated()`, exactly like `GET /api/associates/me/dashboard`, `GET /api/associates/me/rank-progress`, and `GET /api/associates/me/kyc` already do with no matcher of their own.

**`NoRankAssignedException`: a third per-package copy, not a shared one.** `dashboard.NoRankAssignedException` and `compensation.NoRankAssignedException` already exist as independent classes with the identical "admin has no rank" reasoning, each documented as deliberately not shared to avoid a cross-package dependency. This unit adds `associate.NoRankAssignedException` following the same precedent — and since `associate` is the base package both `dashboard` and `compensation` already depend on (via `AssociateRepository`/`Associate`/`AssociateNotFoundException`), reusing either of theirs from here would risk a circular dependency in the other direction.

**`AssociateNotFoundException` gets no new handler.** It's already mapped globally to 404 by `DashboardExceptionHandler` (`@RestControllerAdvice` beans are registered application-wide, not scoped to a package) — role-capability unit 9's review caught exactly this mistake (a duplicate handler added to `CompensationExceptionHandler`) and it must not be repeated here. `NoRankAssignedException` (this unit's own new class) is genuinely new and does need its own handler, added to the existing `AssociateProvisioningExceptionHandler` in the same package rather than a new advice class.

---

## Files

- Create: `backend/src/main/java/com/plotchain/associate/AssociateIdCardResponse.java` — response record.
- Create: `backend/src/main/java/com/plotchain/associate/NoRankAssignedException.java` — 409 case, admin-token-on-associate-route defense.
- Create: `backend/src/main/java/com/plotchain/associate/AssociateIdCardService.java` — the render-on-demand assembly logic.
- Create: `backend/src/main/java/com/plotchain/associate/AssociateIdCardController.java` — the HTTP route.
- Modify: `backend/src/main/java/com/plotchain/associate/AssociateProvisioningExceptionHandler.java` — register the new exception's 409 mapping.
- Modify: `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java` — add the reachable-by-associate-token proof test.
- Test: `backend/src/test/java/com/plotchain/associate/AssociateIdCardServiceTest.java`
- Test: `backend/src/test/java/com/plotchain/associate/AssociateIdCardControllerTest.java`

No migration file — no new table.

---

## Task 1: `AssociateIdCardService` — render-on-demand assembly

**Files:**
- Create: `backend/src/main/java/com/plotchain/associate/AssociateIdCardResponse.java`
- Create: `backend/src/main/java/com/plotchain/associate/NoRankAssignedException.java`
- Create: `backend/src/main/java/com/plotchain/associate/AssociateIdCardService.java`
- Test: `backend/src/test/java/com/plotchain/associate/AssociateIdCardServiceTest.java`

**Interfaces:**
- Consumes: `AssociateRepository.findById(UUID): Optional<Associate>` (existing), `Associate.getUserId()/getName()/getRankId()` (existing), `RankTierRepository.findById(UUID): Optional<RankTier>` (existing, inherited from `JpaRepository`), `RankTier.getName()` (existing), `AssociateNotFoundException(UUID)` (existing, thrown as-is — no new handler).
- Produces: `AssociateIdCardResponse(String idNumber, String name, String rank, String photoUrl, String qrPayload)`, `AssociateIdCardService.getMyIdCard(UUID associateId): AssociateIdCardResponse`, `NoRankAssignedException(UUID associateId)` — all consumed by Task 2's controller.

- [ ] **Step 1: Write the failing service tests**

Create `backend/src/test/java/com/plotchain/associate/AssociateIdCardServiceTest.java`:

```java
package com.plotchain.associate;

import com.plotchain.rank.RankTier;
import com.plotchain.rank.RankTierRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AssociateIdCardServiceTest {

    @Mock AssociateRepository associateRepository;
    @Mock RankTierRepository rankTierRepository;

    AssociateIdCardService service;
    private static final UUID ASSOCIATE_ID = UUID.randomUUID();
    private static final UUID RANK_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        service = new AssociateIdCardService(associateRepository, rankTierRepository);
    }

    private Associate associateWithRank() {
        Associate a = new Associate();
        a.setId(ASSOCIATE_ID);
        a.setUserId("VP00001");
        a.setName("Asha Rao");
        a.setRankId(RANK_ID);
        return a;
    }

    @Test
    void returnsIdCardWithIdNumberNameRankAndQrPayload() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associateWithRank()));
        RankTier rank = new RankTier(RANK_ID, "Silver Associate", 2, BigDecimal.valueOf(10000));
        when(rankTierRepository.findById(RANK_ID)).thenReturn(Optional.of(rank));

        AssociateIdCardResponse response = service.getMyIdCard(ASSOCIATE_ID);

        assertThat(response.idNumber()).isEqualTo("VP00001");
        assertThat(response.name()).isEqualTo("Asha Rao");
        assertThat(response.rank()).isEqualTo("Silver Associate");
        assertThat(response.qrPayload()).isEqualTo("VP00001");
    }

    @Test
    void photoUrlIsAlwaysNull() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associateWithRank()));
        RankTier rank = new RankTier(RANK_ID, "Silver Associate", 2, BigDecimal.valueOf(10000));
        when(rankTierRepository.findById(RANK_ID)).thenReturn(Optional.of(rank));

        AssociateIdCardResponse response = service.getMyIdCard(ASSOCIATE_ID);

        assertThat(response.photoUrl()).isNull();
    }

    @Test
    void throwsAssociateNotFoundExceptionWhenAssociateMissing() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getMyIdCard(ASSOCIATE_ID))
            .isInstanceOf(AssociateNotFoundException.class);
    }

    @Test
    void throwsNoRankAssignedExceptionWhenRankIdIsNull() {
        Associate associate = associateWithRank();
        associate.setRankId(null);
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associate));

        assertThatThrownBy(() -> service.getMyIdCard(ASSOCIATE_ID))
            .isInstanceOf(NoRankAssignedException.class);
    }

    @Test
    void throwsIllegalStateExceptionWhenRankIdNotInRankTable() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associateWithRank()));
        when(rankTierRepository.findById(RANK_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getMyIdCard(ASSOCIATE_ID))
            .isInstanceOf(IllegalStateException.class);
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && mvn -q test -Dtest=AssociateIdCardServiceTest`
Expected: compile failure — `AssociateIdCardService`, `AssociateIdCardResponse`, `NoRankAssignedException` don't exist yet.

- [ ] **Step 3: Create the response record**

Create `backend/src/main/java/com/plotchain/associate/AssociateIdCardResponse.java`:

```java
package com.plotchain.associate;

// role-capability unit 10 (docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md,
// "Digital ID card" row -- Associate sees "Own ID card only (photo, ID number, rank, QR)").
//
// photoUrl is always null today: no photo-upload/storage mechanism exists anywhere in this
// codebase, and the spec's own "Own profile" row -- the one place that enumerates which fields
// an Associate can edit -- never mentions a photo either. See
// AssociateIdCardService#getMyIdCard's header comment for the full reasoning. Documented gap,
// not silently dropped: a future unit should revisit this once the spec describes how a photo
// actually gets set.
//
// qrPayload is the raw string a frontend renders into a QR code client-side (the associate's
// own userId), not image bytes -- no QR-image-generation dependency exists in this codebase and
// none is added by this unit.
public record AssociateIdCardResponse(
    String idNumber,
    String name,
    String rank,
    String photoUrl,
    String qrPayload
) {}
```

- [ ] **Step 4: Create the exception**

Create `backend/src/main/java/com/plotchain/associate/NoRankAssignedException.java`:

```java
package com.plotchain.associate;

import java.util.UUID;

// Raised when the digital ID card is requested for an account that has no rank -- in practice
// an ADMIN, which by design has no MLM rank (see chk_associate_rank_required). The ID card is
// an associate-facing view; admins have no meaningful one -- the spec's own matrix says so
// explicitly ("No dedicated screen (not the persona this serves)"). Mirrors
// com.plotchain.dashboard.NoRankAssignedException / com.plotchain.compensation.NoRankAssignedException's
// identical reasoning; kept as its own class in this package rather than reused across
// packages, same cross-package-dependency avoidance those two already document -- associate is
// the base package both dashboard and compensation depend on, so reusing either of theirs here
// would risk a circular dependency in the other direction.
public class NoRankAssignedException extends RuntimeException {
    public NoRankAssignedException(UUID associateId) {
        super("No rank assigned to account " + associateId
            + "; the digital ID card does not apply to accounts without a rank");
    }
}
```

- [ ] **Step 5: Create the service**

Create `backend/src/main/java/com/plotchain/associate/AssociateIdCardService.java`:

```java
package com.plotchain.associate;

import com.plotchain.rank.RankTier;
import com.plotchain.rank.RankTierRepository;
import org.springframework.stereotype.Service;

import java.util.UUID;

// role-capability unit 10 (docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md,
// "Digital ID card" row -- Associate sees "Own ID card only (photo, ID number, rank, QR)").
// Render-on-demand, not persisted: every call recomputes the response from the associate and
// rank_tier tables directly (the reconciliation table's own note: "No endpoint (spec always
// described this as render-on-demand, not persisted...)") -- there is no AssociateIdCard
// entity/table, and this method never writes one.
//
// photoUrl is always null today: no photo-upload/storage mechanism exists anywhere in this
// codebase (verified -- only AssociateKycDocument, which stores KYC review documents under a
// resubmission-resets-status-to-PENDING policy that would be wrong for a personal photo, and
// CompanyBranding's logo bytes, a company-wide asset, not a per-associate one), AND the spec's
// own "Own profile" row -- the one place that lists which fields an Associate can edit (name,
// contact, bank details, KYC docs, login/transaction password) -- never mentions a photo
// either. There is no described ingestion path for this field anywhere in the spec, so
// inventing upload infrastructure here would be scope invention beyond both this unit and the
// spec itself. A future unit -- most likely folded into unit 11/14's profile-edit work, the
// natural home for any associate-editable field -- should revisit this once the spec describes
// how a photo actually gets set.
@Service
public class AssociateIdCardService {

    private final AssociateRepository associateRepository;
    private final RankTierRepository rankTierRepository;

    public AssociateIdCardService(AssociateRepository associateRepository, RankTierRepository rankTierRepository) {
        this.associateRepository = associateRepository;
        this.rankTierRepository = rankTierRepository;
    }

    // Self-scoped by construction: associateId always comes from the caller's own JWT (see
    // AssociateIdCardController), never from the request -- no caller can view another
    // associate's ID card through this method, same reasoning as
    // CompensationPlanService#getMyRankProgress.
    public AssociateIdCardResponse getMyIdCard(UUID associateId) {
        Associate associate = associateRepository.findById(associateId)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));
        if (associate.getRankId() == null) {
            // In practice only reachable by an ADMIN token calling this associate-only route --
            // chk_associate_rank_required guarantees every ASSOCIATE-role row has a rank.
            throw new NoRankAssignedException(associateId);
        }
        RankTier rank = rankTierRepository.findById(associate.getRankId())
            .orElseThrow(() -> new IllegalStateException(
                "Associate's rank not found in rank table: " + associate.getRankId()));

        // The QR payload is the data a frontend would encode into a QR image client-side, not a
        // server-rendered image -- no QR-generation library exists in pom.xml, and the simpler,
        // no-new-dependency option is preferred absent a stated need for a server-rendered
        // image. Encodes the associate's own userId -- the same self-scoped identifier already
        // used for login and directory lookup -- rather than a verification URL, since no
        // public verification page/endpoint exists in this codebase to point at, and inventing
        // one would exceed this unit's scope.
        return new AssociateIdCardResponse(
            associate.getUserId(),
            associate.getName(),
            rank.getName(),
            null,
            associate.getUserId()
        );
    }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd backend && mvn -q test -Dtest=AssociateIdCardServiceTest`
Expected: PASS, 5 tests green.

- [ ] **Step 7: Commit**

```bash
cd backend
git add src/main/java/com/plotchain/associate/AssociateIdCardResponse.java \
        src/main/java/com/plotchain/associate/NoRankAssignedException.java \
        src/main/java/com/plotchain/associate/AssociateIdCardService.java \
        src/test/java/com/plotchain/associate/AssociateIdCardServiceTest.java
git commit -m "feat(associate): add AssociateIdCardService, render-on-demand digital ID card assembly"
```

---

## Task 2: `AssociateIdCardController` + exception wiring

**Files:**
- Create: `backend/src/main/java/com/plotchain/associate/AssociateIdCardController.java`
- Modify: `backend/src/main/java/com/plotchain/associate/AssociateProvisioningExceptionHandler.java`
- Modify: `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java` — add the "reachable by an associate token" proof every prior self-service bare-GET route in this run added (`associateMeSalesIsReachableByAnAssociateToken`, `associateMeRankProgressIsReachableByAnAssociateToken`).
- Test: `backend/src/test/java/com/plotchain/associate/AssociateIdCardControllerTest.java`

**Interfaces:**
- Consumes: `AssociateIdCardService.getMyIdCard(UUID): AssociateIdCardResponse` (Task 1), `NoRankAssignedException` (Task 1), `JwtService.generateToken(Associate)` (existing, test-only).
- Produces: `GET /api/associates/me/id-card` — 200 with `AssociateIdCardResponse` JSON body for an authenticated associate; 401 with no token; 409 (`{"error": "..."}`) when the authenticated account has no rank.

- [ ] **Step 1: Write the failing controller test**

Create `backend/src/test/java/com/plotchain/associate/AssociateIdCardControllerTest.java`:

```java
package com.plotchain.associate;

import com.plotchain.auth.JwtService;
import com.plotchain.rank.RankTier;
import com.plotchain.rank.RankTierRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// @MockBean on the repository INTERFACES (not the concrete AssociateIdCardService), per
// AssociateRankProgressControllerTest/KycSubmissionControllerTest's established pattern: this
// runs a real AssociateIdCardService inside a real Spring Security filter chain, proving auth
// actually gates this route, while avoiding the JDK25/ByteBuddy concrete-class-mocking issue.
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AssociateIdCardControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;
    @MockBean RankTierRepository rankTierRepository;

    private String tokenFor(UUID associateId) {
        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setRole(AssociateRole.ASSOCIATE);
        return jwtService.generateToken(associate);
    }

    @Test
    void returnsIdCardJsonForTheAuthenticatedAssociate() throws Exception {
        UUID associateId = UUID.randomUUID();
        UUID rankId = UUID.randomUUID();
        String token = tokenFor(associateId);

        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setUserId("VP00042");
        associate.setName("Priya Nair");
        associate.setRankId(rankId);
        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));
        when(rankTierRepository.findById(rankId))
            .thenReturn(Optional.of(new RankTier(rankId, "Gold Associate", 3, BigDecimal.valueOf(20000))));

        mockMvc.perform(get("/api/associates/me/id-card")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.idNumber").value("VP00042"))
            .andExpect(jsonPath("$.name").value("Priya Nair"))
            .andExpect(jsonPath("$.rank").value("Gold Associate"))
            .andExpect(jsonPath("$.photoUrl").doesNotExist())
            .andExpect(jsonPath("$.qrPayload").value("VP00042"));
    }

    @Test
    void returns401WithoutAToken() throws Exception {
        mockMvc.perform(get("/api/associates/me/id-card"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void returns409WhenAssociateHasNoRank() throws Exception {
        UUID associateId = UUID.randomUUID();
        String token = tokenFor(associateId);
        Associate associate = new Associate();
        associate.setId(associateId);
        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));

        mockMvc.perform(get("/api/associates/me/id-card")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.error").isNotEmpty());
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && mvn -q test -Dtest=AssociateIdCardControllerTest`
Expected: 404/compile-adjacent failure — no `AssociateIdCardController` exists yet, so `/api/associates/me/id-card` isn't mapped (and `NoRankAssignedException` has no handler yet, so the 409 test would 500 even once the route exists).

- [ ] **Step 3: Create the controller**

Create `backend/src/main/java/com/plotchain/associate/AssociateIdCardController.java`:

```java
package com.plotchain.associate;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

// role-capability unit 10 (docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md,
// "Digital ID card" row -- Associate sees "Own ID card only (photo, ID number, rank, QR)"). A
// bare @RestController with one route, same shape as AssociateRankProgressController/
// PasswordController/DashboardController -- lives in the associate package (not compensation or
// tree) because this is identity/profile data, not a compensation computation or genealogy
// data.
//
// No SecurityConfig matcher needed: this is a bare GET, which never collides with the blanket
// POST/PUT/PATCH/DELETE write rules there, so it falls through to anyRequest().authenticated()
// the same way GET /api/associates/me/dashboard, GET /api/associates/me/rank-progress, and GET
// /api/associates/me/kyc already do with no matcher of their own.
@RestController
public class AssociateIdCardController {

    private final AssociateIdCardService associateIdCardService;

    public AssociateIdCardController(AssociateIdCardService associateIdCardService) {
        this.associateIdCardService = associateIdCardService;
    }

    // Self-scoped by construction: the target associate comes from the verified JWT, never from
    // the request -- no caller can view another associate's ID card through this route, same
    // reasoning as PasswordController.changePassword(...) /
    // AssociateRankProgressController.getMyRankProgress(...).
    @GetMapping("/api/associates/me/id-card")
    public AssociateIdCardResponse getMyIdCard(@AuthenticationPrincipal UUID associateId) {
        return associateIdCardService.getMyIdCard(associateId);
    }
}
```

- [ ] **Step 4: Wire the 409 exception handler**

Read `backend/src/main/java/com/plotchain/associate/AssociateProvisioningExceptionHandler.java` first (it currently ends after the `InvalidKycUploadException` handler, just before the closing brace). Add a new handler for `NoRankAssignedException`:

```java
    @ExceptionHandler(NoRankAssignedException.class)
    public ResponseEntity<Map<String, String>> handleNoRankAssigned(NoRankAssignedException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }
```

Insert it directly after the existing `handleInvalidKycUpload` method and before the class's closing brace. No new imports are needed — `HttpStatus`, `ResponseEntity`, `ExceptionHandler`, and `Map` are already imported in this file.

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && mvn -q test -Dtest=AssociateIdCardControllerTest`
Expected: PASS, 3 tests green.

- [ ] **Step 6: Add the SecurityConfigTest proof-of-reachability test**

Every prior self-service bare-GET route added in this run (`GET /api/associates/me/sales`, `GET /api/associates/me/rank-progress`) got its own test in `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java` proving the route is reachable by an ordinary associate token (asserting not-403), not just relying on the route's own controller test. Read the file's existing `associateMeRankProgressIsReachableByAnAssociateToken` test (directly above `adminAssociatesIsForbiddenForAnAssociateToken`) for the exact placement and pattern, then add immediately after it:

```java
    // role-capability unit 10 (docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md,
    // "Digital ID card" row -- Associate sees "Own ID card only (photo, ID number, rank, QR)"):
    // needs no explicit SecurityConfig matcher -- a bare GET never collides with the blanket
    // POST/PUT/PATCH/DELETE write rules above, so it falls through to
    // anyRequest().authenticated() below, the same way GET /api/associates/me/dashboard, GET
    // /api/associates/me/sales, and GET /api/associates/me/rank-progress already do with no
    // matcher of their own. This test proves the route is reachable by an ordinary associate
    // token, not accidentally blocked by 403.
    //
    // tokenFor(role) mints a random associateId and stubs associateRepository.findById(...) to
    // return a bare Associate with no rankId set, so the request reaches
    // AssociateIdCardService.getMyIdCard and throws NoRankAssignedException (409) -- not a 403.
    // Same "assert not 403" reasoning as associateMeRankProgressIsReachableByAnAssociateToken
    // above: only a 403 here would mean the route regressed to being blocked at the security
    // layer.
    @Test
    void associateMeIdCardIsReachableByAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/associates/me/id-card")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().is(not(403)));
    }
```

No new imports needed — `get`, `status`, `not`, `AssociateRole`, and `@Test` are already imported in this file.

Run: `cd backend && mvn -q test -Dtest=SecurityConfigTest`
Expected: PASS, including the new `associateMeIdCardIsReachableByAnAssociateToken` test.

- [ ] **Step 8: Run the full backend test suite**

Run: `cd backend && mvn -q test`
Expected: PASS (aside from the pre-existing, unrelated JDK21/25-vs-Mockito spurious failures already tracked in this project's memory notes — confirm any failures seen match that known class of noise, don't assume; if any failure is new or in `associate`/`compensation`/`SecurityConfig`-adjacent tests, treat it as a real regression and investigate before proceeding).

- [ ] **Step 9: Commit**

```bash
cd backend
git add src/main/java/com/plotchain/associate/AssociateIdCardController.java \
        src/main/java/com/plotchain/associate/AssociateProvisioningExceptionHandler.java \
        src/test/java/com/plotchain/associate/AssociateIdCardControllerTest.java \
        src/test/java/com/plotchain/auth/SecurityConfigTest.java
git commit -m "feat(associate): expose GET /api/associates/me/id-card, self-scoped digital ID card"
```

---

## Self-review notes (for the plan author / next reviewer)

- **Spec coverage:** "Digital ID card" row's four Associate-visible fields (photo, ID number, rank, QR) are all present in `AssociateIdCardResponse` — `photoUrl` and `qrPayload` are deliberately not literal images, with reasoning documented inline and in this plan's Design Decisions section. Admin gets no endpoint, matching "No dedicated screen (not the persona this serves)". Render-on-demand (no new table) matches the reconciliation row's explicit note.
- **No placeholders:** every step has real code, no "TBD"/"add appropriate handling" text.
- **Type consistency:** `AssociateIdCardResponse` field names/types are identical between Task 1 (service, defines the record) and Task 2 (controller test, asserts against the same field names via `jsonPath`). `NoRankAssignedException(UUID)` constructor signature is identical between Task 1 (defines it) and Task 2 (handler references the class only, no signature dependency).
- **Known follow-up, explicitly out of scope for this unit:** the photo field has no ingestion path in the spec at all yet — flagged for whichever future unit ends up owning associate-editable profile fields (likely unit 11/14), not something to silently build here.
