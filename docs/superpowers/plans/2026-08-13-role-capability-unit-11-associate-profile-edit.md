# Role-Capability Unit 11: Associate Self-Service Profile View/Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give an Associate a self-scoped `GET /api/associates/me/profile` to view their own profile and a self-scoped `PUT /api/associates/me/profile` to edit their name, phone, and email — the write action the data-visibility spec's "Own profile" row grants Associates, narrowed to only what remains unbuilt after role-capability units 8 (KYC submission) and the pre-existing password-change endpoint already covered their share of that row.

**Architecture:** One new controller (`AssociateProfileController`) backed by one new service (`AssociateProfileService`), following the codebase's established controller-delegates-to-service pattern (mirrors `PasswordController`/`AuthService` and `KycSubmissionController`/`KycSubmissionService` — no controller in this package talks to `AssociateRepository` directly except the single flat-list read in `AssociateController`, which this unit is not). The target associate always comes from `@AuthenticationPrincipal`, never a path/query/body parameter, so both endpoints are self-scoped by construction — the same pattern `PasswordController`'s own header comment documents. `SecurityConfig.java` gets one new `PUT` matcher placed with the other associate-self-service write matchers, ahead of the blanket ADMIN-only write rule (the same ordering trap the file already documents on the password and KYC matchers). No new exception handler: `AssociateNotFoundException` is already mapped globally by `DashboardExceptionHandler`, and email-uniqueness conflicts reuse the existing `EmailAlreadyRegisteredException` + `AssociateProvisioningExceptionHandler` mapping `AssociateProvisioningService` already established. No Flyway migration: every field this unit touches (`name`, `phone`, `email`) already exists on the `associate` table.

**Tech Stack:** Spring Boot (Java), Spring Security (JWT bearer auth via `@AuthenticationPrincipal`), Spring Data JPA, Jakarta Bean Validation, JUnit 5 + Mockito + MockMvc, Flyway (not touched by this unit).

**Spec:** `docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md` — "Data visibility matrix" table, last row ("Own profile"): Associate sees "View and edit own profile — the one write action available to an Associate (name, contact, bank details, KYC docs, login/transaction password)." "Reconciliation & gap-fill" table, "Own profile" row: partially built (only `POST /api/associates/me/password` existed at spec-writing time).

## Global Constraints

- Self-scoping is structural, not a runtime check: the associate ID must come from `@AuthenticationPrincipal`, never from the request body or a path variable, on every new endpoint (spec's "Own profile" row + established codebase convention on `PasswordController`/`KycSubmissionController`).
- No new global `@RestControllerAdvice` exception handler may be registered for `AssociateNotFoundException` — `DashboardExceptionHandler` already owns that mapping application-wide (`@RestControllerAdvice` beans are global, not scoped to their declaring package). Reuse it, per role-capability unit 9's code-review finding that a duplicate handler for the same exception type is a real Standards violation in this codebase (`CompensationExceptionHandler`'s own header comment states the rule explicitly).
- Any new `PUT`/`POST`/`PATCH`/`DELETE` matcher added to `SecurityConfig.java` for an associate-reachable route must be declared **before** the blanket `hasAuthority("ADMIN")` write rules (first-match-wins in Spring Security) — this is the same ordering trap already documented on the `POST /api/associates/me/password` and `POST /api/associates/me/kyc/documents/*` matchers.
- KYC documents and password/transaction-password change are explicitly OUT of scope for this unit — role-capability unit 8 already built self-service KYC submission (`KycSubmissionController`, `POST`/`GET /api/associates/me/kyc/...`), and `PasswordController` (`POST /api/associates/me/password`) predates this spec entirely. Do not rebuild either, and do not have the new profile response re-expose KYC document data (that stays owned by `AssociateKycStatusResponse`) or rank data (owned by role-capability unit 9's `GET /api/associates/me/rank-progress`).
- Bank details are OUT of scope: `Associate` (`backend/src/main/java/com/plotchain/associate/Associate.java`) has no bank-related field. The only bank-account entity in the codebase, `PayoutBankAccount` (`backend/src/main/java/com/plotchain/payments/PayoutBankAccount.java`), is a company-level singleton (`singleton_guard` column, no `associate_id` foreign key) — configured once for the whole company's payout account, not per associate. This is a real, currently-undesigned gap between the spec's "own profile" row and what the data model supports; it is out of scope for this unit (which wires up existing fields) and would need its own design-plus-migration unit, not a mechanical wire-up.
- Every step that adds or changes code must be followed by running the relevant test file, and the final task must run the full backend suite (`cd backend && ./mvnw test`) before considering the unit done.

---

## Scope note — corrects an assumption in the pre-existing reference plan

`docs/superpowers/plans/2026-08-03-role-model-collapse.md` Task 8 (a plan written independently before this slice existed, predating role-capability unit 8's KYC work) covers the same ground but scopes the editable/viewable fields to **name and phone only**, explicitly leaving out email with no stated reason (its own field list for `AssociateProfileResponse`/`UpdateAssociateProfileRequest` never mentions it).

Direct inspection of the current `Associate` entity (`backend/src/main/java/com/plotchain/associate/Associate.java:18-19,36`) shows three plausible "contact" fields exist: `name`, `phone`, and `email` — not two. `email` is a real, actively-used column: it is unique (`idx_associate_email`, `V2__add_associate_auth.sql`), was validated as `@NotBlank @Email` at associate-creation time (`CreateAssociateRequest`), and its uniqueness is already enforced by `AssociateProvisioningService.create()` via `existsByEmail()` + `EmailAlreadyRegisteredException`. Since the spec's own wording for what an Associate can edit is "name, contact, bank details, KYC docs, login/transaction password" and `email` is unambiguously a contact field the entity already has, this plan includes it — reusing the exact `existsByEmail()`/`EmailAlreadyRegisteredException` pattern `AssociateProvisioningService` already established, so uniqueness enforcement stays consistent between create-time and edit-time.

The reference plan's other conclusions hold up under verification and are carried into this plan unchanged: no bank-detail field exists on `Associate` (`PayoutBankAccount` is confirmed company-level, see Global Constraints above), and the profile response must not duplicate KYC document data or rank data — both now doubly true since role-capability units 8 and 9 have since merged and each already owns that surface.

The reference plan also puts the update logic directly in the controller (`associateRepository` autowired straight into `AssociateProfileController`). This plan instead adds a small `AssociateProfileService`, matching the codebase's actual established convention: every controller in this package that does more than a bare flat-list read delegates to a service (`PasswordController`→`AuthService`, `KycSubmissionController`→`KycSubmissionService`, `AdminAssociateController`→`AdminAssociateService`, `KycReviewController`→`KycReviewService`). The one exception, `AssociateController`, does a single unconditional `findAllByOrderByUserIdAsc()` with no business logic at all — not this unit's shape, which needs an email-uniqueness check.

---

## Files

- Create: `backend/src/main/java/com/plotchain/associate/AssociateProfileService.java` — owns the get/update business logic (self-scoped lookup, email-uniqueness check on change).
- Create: `backend/src/main/java/com/plotchain/associate/AssociateProfileResponse.java` — response record for both `GET` and `PUT`.
- Create: `backend/src/main/java/com/plotchain/associate/UpdateAssociateProfileRequest.java` — request record for `PUT`.
- Create: `backend/src/main/java/com/plotchain/associate/AssociateProfileController.java` — thin controller, `@AuthenticationPrincipal`-scoped, delegates to `AssociateProfileService`.
- Create: `backend/src/test/java/com/plotchain/associate/AssociateProfileServiceTest.java` — unit tests (Mockito) for the service.
- Create: `backend/src/test/java/com/plotchain/associate/AssociateProfileControllerTest.java` — integration tests (`@SpringBootTest` + `MockMvc`, real Spring Security filter chain, same pattern as `KycSubmissionControllerTest`).
- Modify: `backend/src/main/java/com/plotchain/auth/SecurityConfig.java` — add one `PUT /api/associates/me/profile` matcher (`.authenticated()`), placed directly after the existing `POST /api/associates/me/kyc/documents/*` matcher (line 58) and before the `POST /api/company/admins` matcher (line 64).
- Modify: `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java` — add one test proving the new matcher is reachable by an `ASSOCIATE` token, plus the `put` static import.

No Flyway migration file. No changes to `AssociateNotFoundException`, `DashboardExceptionHandler`, `EmailAlreadyRegisteredException`, or `AssociateProvisioningExceptionHandler` — all four are reused as-is.

---

## Task 1: `AssociateProfileService` — get and update, with email-uniqueness enforcement

**Files:**
- Create: `backend/src/main/java/com/plotchain/associate/AssociateProfileService.java`
- Create: `backend/src/main/java/com/plotchain/associate/AssociateProfileResponse.java`
- Create: `backend/src/main/java/com/plotchain/associate/UpdateAssociateProfileRequest.java`
- Test: `backend/src/test/java/com/plotchain/associate/AssociateProfileServiceTest.java`

**Interfaces:**
- Consumes: `AssociateRepository.findById(UUID): Optional<Associate>`, `AssociateRepository.save(Associate): Associate`, `AssociateRepository.existsByEmail(String): boolean` (all pre-existing, `backend/src/main/java/com/plotchain/associate/AssociateRepository.java`); `AssociateNotFoundException(UUID)` and `EmailAlreadyRegisteredException(String)` (both pre-existing).
- Produces: `AssociateProfileResponse(UUID id, String userId, String name, String phone, String email, Instant joinedAt)` — a static factory `AssociateProfileResponse.from(Associate)`. `UpdateAssociateProfileRequest(String name, String phone, String email)`. `AssociateProfileService.getProfile(UUID associateId): AssociateProfileResponse` and `AssociateProfileService.updateProfile(UUID associateId, UpdateAssociateProfileRequest request): AssociateProfileResponse` — both consumed by Task 2's controller.

- [ ] **Step 1: Write the failing service tests**

Create `backend/src/test/java/com/plotchain/associate/AssociateProfileServiceTest.java`:

```java
package com.plotchain.associate;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AssociateProfileServiceTest {

    @Mock AssociateRepository associateRepository;

    AssociateProfileService service;
    private static final UUID ASSOCIATE_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        service = new AssociateProfileService(associateRepository);
    }

    private Associate seeded() {
        Associate a = new Associate();
        a.setId(ASSOCIATE_ID);
        a.setUserId("VP00001");
        a.setName("Jane Doe");
        a.setPhone("9990001111");
        a.setEmail("jane@example.com");
        a.setRole(AssociateRole.ASSOCIATE);
        a.setJoinedAt(Instant.parse("2026-01-01T00:00:00Z"));
        return a;
    }

    @Test
    void getProfileReturnsTheAssociatesOwnFields() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(seeded()));

        AssociateProfileResponse response = service.getProfile(ASSOCIATE_ID);

        assertThat(response.userId()).isEqualTo("VP00001");
        assertThat(response.name()).isEqualTo("Jane Doe");
        assertThat(response.phone()).isEqualTo("9990001111");
        assertThat(response.email()).isEqualTo("jane@example.com");
    }

    @Test
    void getProfileThrowsWhenAssociateNotFound() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getProfile(ASSOCIATE_ID))
            .isInstanceOf(AssociateNotFoundException.class);
    }

    @Test
    void updateProfileChangesNamePhoneAndEmail() {
        Associate associate = seeded();
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associate));
        when(associateRepository.existsByEmail("jane.doe@example.com")).thenReturn(false);
        UpdateAssociateProfileRequest request =
            new UpdateAssociateProfileRequest("Jane A. Doe", "9990002222", "jane.doe@example.com");

        AssociateProfileResponse response = service.updateProfile(ASSOCIATE_ID, request);

        assertThat(response.name()).isEqualTo("Jane A. Doe");
        assertThat(response.phone()).isEqualTo("9990002222");
        assertThat(response.email()).isEqualTo("jane.doe@example.com");
        assertThat(associate.getName()).isEqualTo("Jane A. Doe");
        assertThat(associate.getPhone()).isEqualTo("9990002222");
        assertThat(associate.getEmail()).isEqualTo("jane.doe@example.com");
        verify(associateRepository).save(associate);
    }

    @Test
    void updateProfileAllowsResubmittingTheAssociatesOwnUnchangedEmail() {
        Associate associate = seeded();
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associate));
        UpdateAssociateProfileRequest request =
            new UpdateAssociateProfileRequest("Jane Doe", "9990001111", "jane@example.com");

        AssociateProfileResponse response = service.updateProfile(ASSOCIATE_ID, request);

        assertThat(response.email()).isEqualTo("jane@example.com");
        // Own unchanged email must never trip the uniqueness check against itself.
        verify(associateRepository, never()).existsByEmail(any());
    }

    @Test
    void updateProfileRejectsAnEmailAlreadyRegisteredToAnotherAssociate() {
        Associate associate = seeded();
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associate));
        when(associateRepository.existsByEmail("taken@example.com")).thenReturn(true);
        UpdateAssociateProfileRequest request =
            new UpdateAssociateProfileRequest("Jane Doe", "9990001111", "taken@example.com");

        assertThatThrownBy(() -> service.updateProfile(ASSOCIATE_ID, request))
            .isInstanceOf(EmailAlreadyRegisteredException.class);

        // Email must not be applied to the entity, and no save on the rejected path.
        assertThat(associate.getEmail()).isEqualTo("jane@example.com");
        verify(associateRepository, never()).save(any());
    }

    @Test
    void updateProfileClearsEmailWhenRequestOmitsIt() {
        Associate associate = seeded();
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associate));
        UpdateAssociateProfileRequest request =
            new UpdateAssociateProfileRequest("Jane Doe", "9990001111", null);

        AssociateProfileResponse response = service.updateProfile(ASSOCIATE_ID, request);

        assertThat(response.email()).isNull();
        assertThat(associate.getEmail()).isNull();
        verify(associateRepository, never()).existsByEmail(any());
    }

    @Test
    void updateProfileThrowsWhenAssociateNotFound() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.empty());
        UpdateAssociateProfileRequest request =
            new UpdateAssociateProfileRequest("Jane Doe", "9990001111", "jane@example.com");

        assertThatThrownBy(() -> service.updateProfile(ASSOCIATE_ID, request))
            .isInstanceOf(AssociateNotFoundException.class);
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && ./mvnw test -Dtest=AssociateProfileServiceTest`
Expected: FAIL to compile — `AssociateProfileService`, `AssociateProfileResponse`, `UpdateAssociateProfileRequest` don't exist yet.

- [ ] **Step 3: Create the response and request records**

Create `backend/src/main/java/com/plotchain/associate/AssociateProfileResponse.java`:

```java
package com.plotchain.associate;

import java.time.Instant;
import java.util.UUID;

// Deliberately does NOT include kycStatus, KYC documents, or rankId: those are owned by
// AssociateKycStatusResponse (role-capability unit 8's KycSubmissionController) and the
// rank-progress endpoint (role-capability unit 9) respectively. This response is scoped to the
// editable profile identity/contact fields only, per this unit's own scope note.
public record AssociateProfileResponse(
    UUID id, String userId, String name, String phone, String email, Instant joinedAt
) {
    public static AssociateProfileResponse from(Associate a) {
        return new AssociateProfileResponse(
            a.getId(), a.getUserId(), a.getName(), a.getPhone(), a.getEmail(), a.getJoinedAt());
    }
}
```

Create `backend/src/main/java/com/plotchain/associate/UpdateAssociateProfileRequest.java`:

```java
package com.plotchain.associate;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

// name is NOT NULL on the associate table (V1 migration) -- @NotBlank. phone and email are both
// nullable columns (V11__associate_phone.sql; email's NOT NULL constraint was dropped in
// V4__user_id_login_and_admin_roles.sql), so neither is @NotBlank here: a null value clears the
// field, matching column nullability rather than inventing a "required going forward" rule this
// unit has no product basis for. @Email permits null (only validates format when present), same
// as its use on CreateAssociateRequest.
public record UpdateAssociateProfileRequest(
    @NotBlank String name,
    String phone,
    @Email String email
) {}
```

- [ ] **Step 4: Create the service**

Create `backend/src/main/java/com/plotchain/associate/AssociateProfileService.java`:

```java
package com.plotchain.associate;

import org.springframework.stereotype.Service;

import java.util.Objects;
import java.util.UUID;

// Self-scoped by construction: every method takes the caller's own associateId, sourced by
// AssociateProfileController from @AuthenticationPrincipal, never from request content -- same
// pattern as AuthService.changePassword and KycSubmissionService.
@Service
public class AssociateProfileService {

    private final AssociateRepository associateRepository;

    public AssociateProfileService(AssociateRepository associateRepository) {
        this.associateRepository = associateRepository;
    }

    public AssociateProfileResponse getProfile(UUID associateId) {
        Associate associate = associateRepository.findById(associateId)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));
        return AssociateProfileResponse.from(associate);
    }

    public AssociateProfileResponse updateProfile(UUID associateId, UpdateAssociateProfileRequest request) {
        Associate associate = associateRepository.findById(associateId)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));

        // Only check uniqueness when the email is actually changing -- resubmitting the
        // associate's own current email (a plain PUT of unchanged data) must not trip a false
        // conflict against itself. Reuses the exact existsByEmail()/EmailAlreadyRegisteredException
        // pattern AssociateProvisioningService.create() already established for create-time
        // uniqueness, so the rule is enforced identically at create and at edit.
        if (!Objects.equals(request.email(), associate.getEmail())) {
            if (request.email() != null && associateRepository.existsByEmail(request.email())) {
                throw new EmailAlreadyRegisteredException(request.email());
            }
            associate.setEmail(request.email());
        }

        associate.setName(request.name());
        associate.setPhone(request.phone());
        associateRepository.save(associate);

        return AssociateProfileResponse.from(associate);
    }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && ./mvnw test -Dtest=AssociateProfileServiceTest`
Expected: PASS, all 7 tests green.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/plotchain/associate/AssociateProfileService.java \
        backend/src/main/java/com/plotchain/associate/AssociateProfileResponse.java \
        backend/src/main/java/com/plotchain/associate/UpdateAssociateProfileRequest.java \
        backend/src/test/java/com/plotchain/associate/AssociateProfileServiceTest.java
git commit -m "feat(associate): add AssociateProfileService for self-service profile get/update"
```

---

## Task 2: `AssociateProfileController` — wire the service to `GET`/`PUT /api/associates/me/profile`

**Files:**
- Create: `backend/src/main/java/com/plotchain/associate/AssociateProfileController.java`
- Test: `backend/src/test/java/com/plotchain/associate/AssociateProfileControllerTest.java`

**Interfaces:**
- Consumes: `AssociateProfileService.getProfile(UUID): AssociateProfileResponse`, `AssociateProfileService.updateProfile(UUID, UpdateAssociateProfileRequest): AssociateProfileResponse` (Task 1).
- Produces: `GET /api/associates/me/profile` → 200 `AssociateProfileResponse` JSON. `PUT /api/associates/me/profile` (body `UpdateAssociateProfileRequest`) → 200 `AssociateProfileResponse` JSON, or 404 (`AssociateNotFoundException`, handled globally by `DashboardExceptionHandler`), or 409 (`EmailAlreadyRegisteredException`, handled globally by `AssociateProvisioningExceptionHandler`), or 400 (bean validation failure on a blank `name` or malformed `email`).

- [ ] **Step 1: Write the failing controller test**

Create `backend/src/test/java/com/plotchain/associate/AssociateProfileControllerTest.java`:

```java
package com.plotchain.associate;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.auth.JwtService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// @MockBean on the repository INTERFACE (not AssociateProfileService), so this runs a real
// AssociateProfileService inside a real Spring Security filter chain -- same pattern as
// KycSubmissionControllerTest.
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AssociateProfileControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;

    private Associate seeded(UUID id) {
        Associate a = new Associate();
        a.setId(id);
        a.setUserId("VP00001");
        a.setName("Jane Doe");
        a.setPhone("9990001111");
        a.setEmail("jane@example.com");
        a.setRole(AssociateRole.ASSOCIATE);
        a.setJoinedAt(Instant.now());
        return a;
    }

    private String tokenFor(Associate associate) {
        when(associateRepository.findById(associate.getId())).thenReturn(Optional.of(associate));
        return jwtService.generateToken(associate);
    }

    @Test
    void getReturnsTheCallersOwnProfile() throws Exception {
        Associate self = seeded(UUID.randomUUID());
        String token = tokenFor(self);

        mockMvc.perform(get("/api/associates/me/profile")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.userId").value("VP00001"))
            .andExpect(jsonPath("$.name").value("Jane Doe"))
            .andExpect(jsonPath("$.email").value("jane@example.com"));
    }

    @Test
    void getReturns401WithoutAToken() throws Exception {
        mockMvc.perform(get("/api/associates/me/profile"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void putUpdatesNamePhoneAndEmail() throws Exception {
        Associate self = seeded(UUID.randomUUID());
        String token = tokenFor(self);
        when(associateRepository.existsByEmail("jane.a.doe@example.com")).thenReturn(false);
        when(associateRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        mockMvc.perform(put("/api/associates/me/profile")
                .header("Authorization", "Bearer " + token)
                .contentType("application/json")
                .content(new ObjectMapper().writeValueAsString(
                    new UpdateAssociateProfileRequest("Jane A. Doe", "9990002222", "jane.a.doe@example.com"))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.name").value("Jane A. Doe"))
            .andExpect(jsonPath("$.phone").value("9990002222"))
            .andExpect(jsonPath("$.email").value("jane.a.doe@example.com"));
    }

    @Test
    void putRejectsABlankName() throws Exception {
        Associate self = seeded(UUID.randomUUID());
        String token = tokenFor(self);

        mockMvc.perform(put("/api/associates/me/profile")
                .header("Authorization", "Bearer " + token)
                .contentType("application/json")
                .content(new ObjectMapper().writeValueAsString(
                    new UpdateAssociateProfileRequest("  ", "9990002222", "jane@example.com"))))
            .andExpect(status().isBadRequest());
    }

    @Test
    void putReturnsConflictWhenEmailAlreadyRegisteredToAnotherAssociate() throws Exception {
        Associate self = seeded(UUID.randomUUID());
        String token = tokenFor(self);
        when(associateRepository.existsByEmail("taken@example.com")).thenReturn(true);

        mockMvc.perform(put("/api/associates/me/profile")
                .header("Authorization", "Bearer " + token)
                .contentType("application/json")
                .content(new ObjectMapper().writeValueAsString(
                    new UpdateAssociateProfileRequest("Jane Doe", "9990001111", "taken@example.com"))))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.error").isNotEmpty());
    }

    @Test
    void putReturns401WithoutAToken() throws Exception {
        mockMvc.perform(put("/api/associates/me/profile")
                .contentType("application/json")
                .content(new ObjectMapper().writeValueAsString(
                    new UpdateAssociateProfileRequest("Jane Doe", "9990001111", "jane@example.com"))))
            .andExpect(status().isUnauthorized());
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && ./mvnw test -Dtest=AssociateProfileControllerTest`
Expected: FAIL to compile — `AssociateProfileController` doesn't exist yet.

- [ ] **Step 3: Create the controller**

Create `backend/src/main/java/com/plotchain/associate/AssociateProfileController.java`:

```java
package com.plotchain.associate;

import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

// Self-scoped by construction, same pattern as PasswordController (/api/associates/me/password)
// and KycSubmissionController (/api/associates/me/kyc): the target associate always comes from
// the verified JWT (@AuthenticationPrincipal), never a path/query/body parameter, so no caller
// can read or edit another associate's profile. Deliberately thin -- all business logic
// (email-uniqueness enforcement, entity lookup) lives in AssociateProfileService.
@RestController
@RequestMapping("/api/associates/me/profile")
public class AssociateProfileController {

    private final AssociateProfileService associateProfileService;

    public AssociateProfileController(AssociateProfileService associateProfileService) {
        this.associateProfileService = associateProfileService;
    }

    @GetMapping
    public AssociateProfileResponse get(@AuthenticationPrincipal UUID associateId) {
        return associateProfileService.getProfile(associateId);
    }

    @PutMapping
    public AssociateProfileResponse update(
        @AuthenticationPrincipal UUID associateId,
        @Valid @RequestBody UpdateAssociateProfileRequest request
    ) {
        return associateProfileService.updateProfile(associateId, request);
    }
}
```

- [ ] **Step 4: Run the tests, confirm the expected partial-pass state**

Run: `cd backend && ./mvnw test -Dtest=AssociateProfileControllerTest`
Expected: `getReturnsTheCallersOwnProfile`, `getReturns401WithoutAToken`, and `putReturns401WithoutAToken` PASS (a bare `GET` never collides with the blanket `PUT`-only write rule, and a missing-token request 401s at authentication time, before any authorization rule is even evaluated — neither depends on the new matcher). `putUpdatesNamePhoneAndEmail`, `putRejectsABlankName`, and `putReturnsConflictWhenEmailAlreadyRegisteredToAnotherAssociate` are expected to FAIL, all with 403 rather than their asserted status — Spring Security's authorization filter runs before the `DispatcherServlet` reaches `@Valid` bean validation or the controller body, so every `PUT` from an `ASSOCIATE` token 403s at the security layer as long as `SecurityConfig.java` still routes all `PUT`s through the blanket ADMIN-only rule, regardless of request-body content. This 3-test expected-red state is resolved by Task 3, not a bug in this task.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/associate/AssociateProfileController.java \
        backend/src/test/java/com/plotchain/associate/AssociateProfileControllerTest.java
git commit -m "feat(associate): add AssociateProfileController for GET/PUT /api/associates/me/profile"
```

---

## Task 3: Security matcher, `SecurityConfigTest` coverage, full suite verification

**Files:**
- Modify: `backend/src/main/java/com/plotchain/auth/SecurityConfig.java`
- Modify: `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`

**Interfaces:**
- Consumes: nothing new — wires the existing `PUT /api/associates/me/profile` route from Task 2 through Spring Security's authorization chain.
- Produces: nothing new — this task closes out the unit.

- [ ] **Step 1: Add the write matcher above the blanket `PUT` rule**

In `backend/src/main/java/com/plotchain/auth/SecurityConfig.java`, insert immediately after the existing KYC-submission matcher (currently line 58, `.requestMatchers(HttpMethod.POST, "/api/associates/me/kyc/documents/*").authenticated()`) and before the Admin Team creation matcher (currently line 64, `.requestMatchers(HttpMethod.POST, "/api/company/admins")`):

```java
                // Self-service profile edit: an associate-reachable PUT (role-capability unit
                // 11, docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md,
                // "Own profile" row -- name/contact edit is the one write action alongside
                // password change and KYC submission above). Must precede the blanket ADMIN
                // write rules below (first-match-wins) or an associate could never edit their
                // own profile. GET /api/associates/me/profile needs no matcher of its own -- a
                // bare GET never collides with the POST/PUT/PATCH/DELETE blanket rules, so it
                // falls through to anyRequest().authenticated() below, same as GET
                // /api/associates/me/dashboard, GET /api/associates/me/sales, and GET
                // /api/associates/me/kyc already do.
                .requestMatchers(HttpMethod.PUT, "/api/associates/me/profile").authenticated()
```

- [ ] **Step 2: Run `AssociateProfileControllerTest` again to confirm the previously-red tests now pass**

Run: `cd backend && ./mvnw test -Dtest=AssociateProfileControllerTest`
Expected: PASS, all 6 tests green (including `putUpdatesNamePhoneAndEmail`, `putRejectsABlankName`, and `putReturnsConflictWhenEmailAlreadyRegisteredToAnotherAssociate` — all three red in Task 2's Step 4).

- [ ] **Step 3: Add the `SecurityConfigTest` case and the `put` static import**

In `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`, add to the static imports (alongside the existing `get`/`post`/`multipart` imports near the top of the file):

```java
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
```

Add this test near `passwordChangeIsReachableByAnAssociateToken` and `kycDocumentUploadIsReachableByAnAssociateToken` (same file, same self-service-route grouping):

```java
    // Role-capability unit 11: PUT /api/associates/me/profile needs its own matcher ABOVE the
    // blanket ADMIN write rules, same ordering trap as passwordChangeIsReachableByAnAssociateToken
    // and kycDocumentUploadIsReachableByAnAssociateToken above. associateRepository is a
    // @MockBean here returning a fake associate never actually persisted to the real H2
    // database, and existsByEmail is unstubbed (defaults to false via Mockito), so the request
    // reaches AssociateProfileService.updateProfile and succeeds -- 200, not 403. Only a 403 here
    // would mean the matcher ordering regressed.
    @Test
    void profileUpdateIsReachableByAnAssociateToken() throws Exception {
        mockMvc.perform(put("/api/associates/me/profile")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE))
                .contentType("application/json")
                .content("{\"name\":\"Jane Doe\",\"phone\":\"9990001111\",\"email\":\"jane@example.com\"}"))
            .andExpect(status().is(not(403)));
    }
```

- [ ] **Step 4: Run `SecurityConfigTest` to verify it passes**

Run: `cd backend && ./mvnw test -Dtest=SecurityConfigTest`
Expected: PASS, every test in the file green, including the new `profileUpdateIsReachableByAnAssociateToken`.

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && ./mvnw test`
Expected: PASS. Per the user memory note on this repo's known JDK/Mockito environment issue, ~55 spurious `Mockito` errors from a JDK21/25 mismatch may appear and are unrelated to this change — cross-check any failure against that baseline (or a clean-`master` run) before treating it as a regression, same diligence role-capability unit 2's own history required (`docs/superpowers/plans/2026-08-03-role-capability-units.md`, unit 2 entry: a real regression was caught only by diffing against a clean master baseline, not by trusting an "unrelated" classification on faith).

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/plotchain/auth/SecurityConfig.java \
        backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java
git commit -m "feat(associate): wire PUT /api/associates/me/profile through SecurityConfig"
```

---

## Self-review notes

- **Spec coverage:** "View own profile" → Task 2's `GET`. "Edit name" → Task 1/2 (`name`, `@NotBlank`). "Edit contact" → Task 1/2 (`phone` + `email`, both nullable to match column nullability). "Bank details" → confirmed out of scope, documented in Global Constraints (no per-associate field exists; `PayoutBankAccount` is company-level). "KYC docs" → confirmed out of scope, already built by role-capability unit 8, response does not re-expose it. "Login/transaction password" → confirmed out of scope, already built pre-spec by `PasswordController`, untouched by this plan.
- **Placeholder scan:** no TBD/TODO markers; every step has literal code, not a description of code.
- **Type consistency:** `AssociateProfileResponse(UUID id, String userId, String name, String phone, String email, Instant joinedAt)` and `UpdateAssociateProfileRequest(String name, String phone, String email)` are defined once in Task 1 and referenced identically (same field order/names) in Task 1's service, Task 2's controller and controller test, and nowhere else diverges. `AssociateProfileService.getProfile`/`updateProfile` signatures declared in Task 1 match exactly how Task 2's controller calls them.
