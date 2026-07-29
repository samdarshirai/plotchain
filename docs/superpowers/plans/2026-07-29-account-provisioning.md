# Account Provisioning & Auth Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the committed test credentials, give the system a real way to provision accounts (admin-creates-associate, with a forced password change on first login), and close the two small frontend auth gaps (no logout UI, guard ignores token expiry).

**Architecture:** Backend first, bottom-up: schema → bootstrap → create endpoint → change-password endpoint → then frontend. The existing auth feature (JWT login, `JwtAuthenticationFilter`, `SecurityConfig`) is complete and unchanged in shape — this plan adds provisioning on top of it.

**Tech Stack:** Spring Boot 3.3.4 + Spring Security + jjwt 0.12.6, Flyway, JUnit 5 + Mockito + AssertJ, H2 (Postgres mode) for tests. Angular 18.2 standalone + Jasmine/Karma.

## Decisions already made (fixed — do not re-litigate)

- **Admin creates accounts.** No self-signup. Admin provisions an associate; the system generates a temporary password returned to the admin **once**, communicated out-of-band. The associate must change it on first login.
- **No password reset flow.** Forgotten passwords are handled by an admin provisioning a new temporary password. No mail infrastructure is being introduced.
- **Committed test credentials must stop shipping** in the production migration path.

## Judgment call being made in this plan (flagged, not silently assumed)

`associate.rank_id` is currently `NOT NULL REFERENCES rank_tier(id)`. "Rank" is an MLM-associate concept that does not apply to a platform admin — the current V2 seed works around this by pointing its admin row at a fake `rank_order=999` tier, and a prior review flagged exactly this as "a structural FK artifact, not a real business fact." Bootstrapping a real admin would require inventing that fake tier again.

**This plan drops the NOT NULL and adds `chk_associate_rank_required` (`role = 'ADMIN' OR rank_id IS NOT NULL`)** so the constraint expresses the actual rule: associates have a rank, admins don't. `Associate.rankId` becomes nullable in the entity.

**Consequence discovered during Task 1's review — do not skip this.** `DashboardService.getDashboard` resolves the associate's rank with `ranks.stream().filter(r -> r.getId().equals(associate.getRankId())).findFirst().orElseThrow(IllegalStateException::new)`. With a null `rankId` nothing matches, so it throws — surfacing as an unhandled **500**. The bootstrapped admin from Task 2 has `rankId = null`, so an admin would log in and immediately break on the dashboard. The old fake-rank seed masked this by pointing admins at a real (meaningless) tier.

The existing suite does not catch it: no test constructs a rank-less associate for the dashboard path, so "tests pass" is not "this cannot break." Two changes address it, and both are required:
- **Task 4** makes the backend fail *clearly* — a dedicated exception mapped to 409 with an actionable message, instead of a 500 from a leaked `IllegalStateException`.
- **Task 7** stops admins reaching the associate dashboard at all, routing them to the admin area after login.

## Global Constraints

- Nothing is deployed, so editing the existing `V2` migration in place is acceptable and preferred over a compensating `V3` DELETE (this repo has already done an in-place migration edit deliberately, during the tenant_id removal).
- **Writes are ADMIN-only by default** (`SecurityConfig` gates `POST/PUT/PATCH/DELETE /api/**` behind `hasAuthority("ADMIN")`). The self-service password-change endpoint is an associate-reachable POST, so it **needs its own matcher declared ABOVE the blanket ADMIN rules** — Spring Security is first-match-wins. This is the exact trap `SecurityConfig`'s own comment warns about, and `SecurityConfigTest` will catch it.
- Never mock concrete classes in tests (JDK25/ByteBuddy limitation). Mock interfaces; use `MockMvcBuilders.standaloneSetup` or `@SpringBootTest` + `@MockBean` on repository interfaces.
- Generated temporary passwords must come from `java.security.SecureRandom`, never `java.util.Random`.
- Password hashes are BCrypt via the existing `PasswordEncoder` bean. Never store or log plaintext.
- Backend tests: `mvn -f backend/pom.xml test -Dtest=<ClassName>`, full suite `mvn -f backend/pom.xml test` (currently 29/29).
- Frontend tests: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless` (currently 30/30).
- Every task must leave both suites green.

---

### Task 1: V3 schema — `must_change_password`, nullable `rank_id`

**Files:**
- Create: `backend/src/main/resources/db/migration/V3__account_provisioning.sql`
- Modify: `backend/src/main/java/com/plotchain/associate/Associate.java`
- Modify: `backend/src/test/java/com/plotchain/associate/AssociateRepositoryTest.java`

**Interfaces:**
- Produces: `Associate.isMustChangePassword()` / `setMustChangePassword(boolean)`; `rankId` now nullable.

- [ ] **Step 1: Write the failing test**

Append to `AssociateRepositoryTest`:

```java
    @Test
    void persistsAnAdminWithoutARank() {
        Associate admin = newAssociate(null, null, null);
        admin.setRole(AssociateRole.ADMIN);
        admin.setRankId(null);
        admin.setMustChangePassword(true);
        associateRepository.save(admin);
        entityManager.flush();
        entityManager.clear();

        Associate found = associateRepository.findById(admin.getId()).orElseThrow();

        assertThat(found.getRankId()).isNull();
        assertThat(found.getRole()).isEqualTo(AssociateRole.ADMIN);
        assertThat(found.isMustChangePassword()).isTrue();
    }
```

`newAssociate(...)` currently sets a rank id; the call above overrides it to null after construction, so the helper needs no change.

- [ ] **Step 2: Run it and confirm it fails**

Run: `mvn -f backend/pom.xml test -Dtest=AssociateRepositoryTest`
Expected: COMPILE ERROR — `setMustChangePassword`/`isMustChangePassword` do not exist.

- [ ] **Step 3: Add the migration and entity fields**

Create `backend/src/main/resources/db/migration/V3__account_provisioning.sql`:

```sql
-- Associates must change the temporary password an admin provisioned for them.
ALTER TABLE associate ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

-- "Rank" is an MLM-associate concept that does not apply to a platform admin. rank_id was
-- NOT NULL, which forced admin rows to reference a meaningless placeholder rank tier. Express
-- the real rule instead: associates have a rank, admins do not.
ALTER TABLE associate ALTER COLUMN rank_id DROP NOT NULL;
ALTER TABLE associate ADD CONSTRAINT chk_associate_rank_required
    CHECK (role = 'ADMIN' OR rank_id IS NOT NULL);
```

In `Associate.java`, change the `rankId` column to drop `nullable = false`, and add the new field plus accessors:

```java
    @Column(name = "rank_id")
    private UUID rankId;
```

```java
    @Column(name = "must_change_password", nullable = false)
    private boolean mustChangePassword;
```

```java
    public boolean isMustChangePassword() { return mustChangePassword; }
    public void setMustChangePassword(boolean mustChangePassword) { this.mustChangePassword = mustChangePassword; }
```

- [ ] **Step 4: Run it and confirm it passes, then run the full suite**

Run: `mvn -f backend/pom.xml test -Dtest=AssociateRepositoryTest` → PASS
Run: `mvn -f backend/pom.xml test` → PASS (30/30). If `DashboardServiceTest` or `DashboardControllerTest` break on a null rank, STOP and report — that would mean a read path assumes a rank exists, which this plan's judgment call claims it does not.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/resources/db/migration/V3__account_provisioning.sql \
        backend/src/main/java/com/plotchain/associate/Associate.java \
        backend/src/test/java/com/plotchain/associate/AssociateRepositoryTest.java
git commit -m "feat: add must_change_password, make rank_id nullable for admins"
```

---

### Task 2: Stop shipping test credentials; bootstrap the first admin from env

**Files:**
- Modify: `backend/src/main/resources/db/migration/V2__add_associate_auth.sql`
- Create: `backend/src/main/resources/db/migration-dev/V900__seed_dev_accounts.sql`
- Create: `backend/src/main/resources/application-dev.yml`
- Create: `backend/src/main/java/com/plotchain/auth/AdminBootstrapRunner.java`
- Create: `backend/src/test/java/com/plotchain/auth/AdminBootstrapRunnerTest.java`

**Interfaces:**
- Consumes: `AssociateRepository`, `PasswordEncoder`.
- Produces: `AdminBootstrapRunner` — an `ApplicationRunner` that creates one ADMIN when the `associate` table is empty and `PLOTCHAIN_ADMIN_EMAIL` + `PLOTCHAIN_ADMIN_PASSWORD` are both set.

- [ ] **Step 1: Strip the seed rows out of the production migration path**

In `V2__add_associate_auth.sql`, delete the header comment block naming the two test accounts, the `INSERT INTO rank_tier ...` statement, and the `INSERT INTO associate ...` statement. Keep everything else — the `ALTER TABLE ... ADD COLUMN`s, the backfill `UPDATE`, the `SET NOT NULL`s, `chk_associate_role`, and `idx_associate_email`.

The `rank_order=999` justification comment goes with the deleted INSERT: it existed only because the seeded tier shared a database with tests that create `rank_order=1` tiers. With the seed gone from `classpath:db/migration`, that collision cannot happen.

Replace the file's opening comment with:

```sql
-- Adds the authentication columns to `associate`. No accounts are seeded here: production
-- bootstraps its first admin via AdminBootstrapRunner (env-driven), and local development
-- seeds test accounts from classpath:db/migration-dev, loaded only under the `dev` profile.
```

- [ ] **Step 2: Move the dev seed to a dev-only location**

Create `backend/src/main/resources/db/migration-dev/V900__seed_dev_accounts.sql`:

```sql
-- LOCAL DEVELOPMENT ONLY. Loaded only when the `dev` profile is active (see
-- application-dev.yml). These are publicly-known credentials and must never be applied to a
-- real deployment.
--   associate@plotchain.test / Password123!  (role ASSOCIATE)
--   admin@plotchain.test     / Password123!  (role ADMIN)
--
-- Versioned V900 to stay clear of the main migration sequence, which is free to grow to V899
-- before colliding.
INSERT INTO rank_tier (id, name, rank_order, volume_threshold) VALUES
    ('11111111-1111-1111-1111-111111111111', 'Sales Associate', 1, 5000);

INSERT INTO associate (id, sponsor_id, parent_id, position, name, rank_id, kyc_status, joined_at, cumulative_matched_volume, last_active_at, email, password_hash, role, must_change_password) VALUES
    ('22222222-2222-2222-2222-222222222222', NULL, NULL, NULL, 'Test Associate', '11111111-1111-1111-1111-111111111111', 'VERIFIED', NOW(), 0, NULL, 'associate@plotchain.test', '$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C', 'ASSOCIATE', FALSE),
    ('33333333-3333-3333-3333-333333333333', NULL, NULL, NULL, 'Test Admin', NULL, 'VERIFIED', NOW(), 0, NULL, 'admin@plotchain.test', '$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C', 'ADMIN', FALSE);
```

Note the admin row now has `rank_id NULL` — the whole reason for Task 1's schema change.

Create `backend/src/main/resources/application-dev.yml`:

```yaml
spring:
  flyway:
    locations: classpath:db/migration,classpath:db/migration-dev
```

- [ ] **Step 3: Write the failing bootstrap test**

Create `backend/src/test/java/com/plotchain/auth/AdminBootstrapRunnerTest.java`:

```java
package com.plotchain.auth;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdminBootstrapRunnerTest {

    @Mock AssociateRepository associateRepository;
    PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    @Test
    void createsTheFirstAdminWhenTheTableIsEmpty() throws Exception {
        when(associateRepository.count()).thenReturn(0L);
        AdminBootstrapRunner runner = new AdminBootstrapRunner(
            associateRepository, passwordEncoder, "boss@example.com", "s3cret-password");

        runner.run(null);

        ArgumentCaptor<Associate> saved = ArgumentCaptor.forClass(Associate.class);
        verify(associateRepository).save(saved.capture());
        Associate admin = saved.getValue();
        assertThat(admin.getEmail()).isEqualTo("boss@example.com");
        assertThat(admin.getRole()).isEqualTo(AssociateRole.ADMIN);
        assertThat(admin.getRankId()).isNull();
        assertThat(admin.isMustChangePassword()).isTrue();
        assertThat(admin.getPasswordHash()).isNotEqualTo("s3cret-password");
        assertThat(passwordEncoder.matches("s3cret-password", admin.getPasswordHash())).isTrue();
    }

    @Test
    void doesNothingWhenAssociatesAlreadyExist() throws Exception {
        when(associateRepository.count()).thenReturn(5L);
        AdminBootstrapRunner runner = new AdminBootstrapRunner(
            associateRepository, passwordEncoder, "boss@example.com", "s3cret-password");

        runner.run(null);

        verify(associateRepository, never()).save(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void doesNothingWhenCredentialsAreNotConfigured() throws Exception {
        AdminBootstrapRunner runner = new AdminBootstrapRunner(
            associateRepository, passwordEncoder, "", "");

        runner.run(null);

        verify(associateRepository, never()).save(org.mockito.ArgumentMatchers.any());
        verify(associateRepository, never()).count();
    }
}
```

- [ ] **Step 4: Run it and confirm it fails**

Run: `mvn -f backend/pom.xml test -Dtest=AdminBootstrapRunnerTest`
Expected: COMPILE ERROR — `AdminBootstrapRunner` does not exist.

- [ ] **Step 5: Write the runner**

Create `backend/src/main/java/com/plotchain/auth/AdminBootstrapRunner.java`:

```java
package com.plotchain.auth;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Creates the very first ADMIN account on an otherwise empty database, from environment
 * configuration, so that no credentials need to be committed to the repository.
 *
 * Runs only when both properties are set AND no associate rows exist, so it is a no-op on
 * every subsequent boot. The provisioned admin must change its password on first login.
 */
@Component
public class AdminBootstrapRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(AdminBootstrapRunner.class);

    private final AssociateRepository associateRepository;
    private final PasswordEncoder passwordEncoder;
    private final String adminEmail;
    private final String adminPassword;

    public AdminBootstrapRunner(
        AssociateRepository associateRepository,
        PasswordEncoder passwordEncoder,
        @Value("${plotchain.bootstrap.admin-email:}") String adminEmail,
        @Value("${plotchain.bootstrap.admin-password:}") String adminPassword
    ) {
        this.associateRepository = associateRepository;
        this.passwordEncoder = passwordEncoder;
        this.adminEmail = adminEmail;
        this.adminPassword = adminPassword;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (adminEmail == null || adminEmail.isBlank() || adminPassword == null || adminPassword.isBlank()) {
            return;
        }
        if (associateRepository.count() > 0) {
            return;
        }

        Associate admin = new Associate();
        admin.setId(UUID.randomUUID());
        admin.setName("Administrator");
        admin.setEmail(adminEmail);
        admin.setPasswordHash(passwordEncoder.encode(adminPassword));
        admin.setRole(AssociateRole.ADMIN);
        admin.setRankId(null);
        admin.setKycStatus(KycStatus.VERIFIED);
        admin.setJoinedAt(Instant.now());
        admin.setCumulativeMatchedVolume(BigDecimal.ZERO);
        admin.setMustChangePassword(true);
        associateRepository.save(admin);

        // Log the email only — never the password.
        log.info("Bootstrapped initial ADMIN account for {}. It must change its password on first login.", adminEmail);
    }
}
```

Add to `application.yml` (mirroring the existing `${VAR:default}` convention):

```yaml
plotchain:
  bootstrap:
    admin-email: ${PLOTCHAIN_ADMIN_EMAIL:}
    admin-password: ${PLOTCHAIN_ADMIN_PASSWORD:}
```

- [ ] **Step 6: Run it and confirm it passes, then the full suite**

Run: `mvn -f backend/pom.xml test -Dtest=AdminBootstrapRunnerTest` → PASS (3/3)
Run: `mvn -f backend/pom.xml test` → PASS. Note the dev seed is now absent from the test DB; if any test depended on the seeded rows it will fail here. Fix by having the test create its own data, not by restoring the seed.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/resources/db/migration/V2__add_associate_auth.sql \
        backend/src/main/resources/db/migration-dev/V900__seed_dev_accounts.sql \
        backend/src/main/resources/application-dev.yml \
        backend/src/main/resources/application.yml \
        backend/src/main/java/com/plotchain/auth/AdminBootstrapRunner.java \
        backend/src/test/java/com/plotchain/auth/AdminBootstrapRunnerTest.java
git commit -m "feat: bootstrap first admin from env, move test seed to dev-only migration"
```

---

### Task 3: Admin provisions an associate

**Files:**
- Create: `backend/src/main/java/com/plotchain/associate/CreateAssociateRequest.java`
- Create: `backend/src/main/java/com/plotchain/associate/CreateAssociateResponse.java`
- Create: `backend/src/main/java/com/plotchain/associate/AssociateProvisioningService.java`
- Create: `backend/src/main/java/com/plotchain/associate/AssociateController.java`
- Create: `backend/src/main/java/com/plotchain/associate/AssociateProvisioningExceptionHandler.java`
- Create: `backend/src/main/java/com/plotchain/associate/EmailAlreadyRegisteredException.java`
- Create: `backend/src/main/java/com/plotchain/associate/PlacementUnavailableException.java`
- Create: `backend/src/main/java/com/plotchain/associate/NoRankTiersConfiguredException.java`
- Modify: `backend/src/main/java/com/plotchain/associate/AssociateRepository.java`
- Create: `backend/src/test/java/com/plotchain/associate/AssociateProvisioningServiceTest.java`

**Interfaces:**
- Consumes: `AssociateRepository`, `RankTierRepository`, `PasswordEncoder`.
- Produces: `POST /api/associates` (ADMIN-only via the existing blanket write rule) → `CreateAssociateResponse(UUID associateId, String temporaryPassword)`.
- Adds `AssociateRepository.existsByParentIdAndPosition(UUID parentId, String position)`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/plotchain/associate/AssociateProvisioningServiceTest.java`:

```java
package com.plotchain.associate;

import com.plotchain.rank.RankTier;
import com.plotchain.rank.RankTierRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AssociateProvisioningServiceTest {

    @Mock AssociateRepository associateRepository;
    @Mock RankTierRepository rankTierRepository;

    PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
    AssociateProvisioningService service;

    private final RankTier lowestRank =
        new RankTier(UUID.randomUUID(), "Sales Associate", 1, BigDecimal.valueOf(5000));

    @BeforeEach
    void setUp() {
        service = new AssociateProvisioningService(associateRepository, rankTierRepository, passwordEncoder);
    }

    @Test
    void createsAnAssociateWithATemporaryPasswordThatMustBeChanged() {
        when(associateRepository.existsByEmail("new@plotchain.test")).thenReturn(false);
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(lowestRank));

        CreateAssociateResponse response = service.create(
            new CreateAssociateRequest("Jane Doe", "new@plotchain.test", null, null, null));

        ArgumentCaptor<Associate> saved = ArgumentCaptor.forClass(Associate.class);
        org.mockito.Mockito.verify(associateRepository).save(saved.capture());
        Associate created = saved.getValue();

        assertThat(created.getEmail()).isEqualTo("new@plotchain.test");
        assertThat(created.getName()).isEqualTo("Jane Doe");
        assertThat(created.getRole()).isEqualTo(AssociateRole.ASSOCIATE);
        assertThat(created.getRankId()).isEqualTo(lowestRank.getId());
        assertThat(created.getKycStatus()).isEqualTo(KycStatus.PENDING);
        assertThat(created.isMustChangePassword()).isTrue();

        assertThat(response.temporaryPassword()).isNotBlank();
        assertThat(response.associateId()).isEqualTo(created.getId());
        // The response carries the plaintext once; only the hash is persisted.
        assertThat(created.getPasswordHash()).isNotEqualTo(response.temporaryPassword());
        assertThat(passwordEncoder.matches(response.temporaryPassword(), created.getPasswordHash())).isTrue();
    }

    @Test
    void rejectsADuplicateEmail() {
        when(associateRepository.existsByEmail("taken@plotchain.test")).thenReturn(true);

        assertThatThrownBy(() -> service.create(
            new CreateAssociateRequest("Jane Doe", "taken@plotchain.test", null, null, null)))
            .isInstanceOf(EmailAlreadyRegisteredException.class);
    }

    @Test
    void rejectsAPlacementThatIsAlreadyOccupied() {
        UUID parentId = UUID.randomUUID();
        when(associateRepository.existsByEmail("new@plotchain.test")).thenReturn(false);
        when(associateRepository.findById(parentId)).thenReturn(Optional.of(new Associate()));
        when(associateRepository.existsByParentIdAndPosition(parentId, "L")).thenReturn(true);

        assertThatThrownBy(() -> service.create(
            new CreateAssociateRequest("Jane Doe", "new@plotchain.test", null, parentId, "L")))
            .isInstanceOf(PlacementUnavailableException.class);
    }

    @Test
    void rejectsAnUnknownParent() {
        UUID parentId = UUID.randomUUID();
        when(associateRepository.existsByEmail("new@plotchain.test")).thenReturn(false);
        when(associateRepository.findById(parentId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.create(
            new CreateAssociateRequest("Jane Doe", "new@plotchain.test", null, parentId, "L")))
            .isInstanceOf(AssociateNotFoundException.class);
    }

    @Test
    void failsClearlyWhenNoRankTiersAreConfigured() {
        when(associateRepository.existsByEmail("new@plotchain.test")).thenReturn(false);
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of());

        assertThatThrownBy(() -> service.create(
            new CreateAssociateRequest("Jane Doe", "new@plotchain.test", null, null, null)))
            .isInstanceOf(NoRankTiersConfiguredException.class);
    }
}
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `mvn -f backend/pom.xml test -Dtest=AssociateProvisioningServiceTest`
Expected: COMPILE ERROR — none of the production types exist yet.

- [ ] **Step 3: Write the production code**

`CreateAssociateRequest.java`:

```java
package com.plotchain.associate;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

import java.util.UUID;

public record CreateAssociateRequest(
    @NotBlank String name,
    @NotBlank @Email String email,
    UUID sponsorId,
    UUID parentId,
    @Pattern(regexp = "L|R", message = "position must be L or R") String position
) {}
```

`CreateAssociateResponse.java`:

```java
package com.plotchain.associate;

import java.util.UUID;

/**
 * The temporary password is returned exactly once, at creation. It is never stored in
 * plaintext and cannot be retrieved again — the admin communicates it to the associate
 * out-of-band, and the associate must change it on first login.
 */
public record CreateAssociateResponse(UUID associateId, String temporaryPassword) {}
```

`EmailAlreadyRegisteredException.java`:

```java
package com.plotchain.associate;

public class EmailAlreadyRegisteredException extends RuntimeException {
    public EmailAlreadyRegisteredException(String email) {
        super("Email already registered: " + email);
    }
}
```

`PlacementUnavailableException.java`:

```java
package com.plotchain.associate;

import java.util.UUID;

public class PlacementUnavailableException extends RuntimeException {
    public PlacementUnavailableException(UUID parentId, String position) {
        super("Placement already occupied: parent " + parentId + " position " + position);
    }
}
```

`NoRankTiersConfiguredException.java`:

```java
package com.plotchain.associate;

public class NoRankTiersConfiguredException extends RuntimeException {
    public NoRankTiersConfiguredException() {
        super("No rank tiers are configured; an associate cannot be created without a rank");
    }
}
```

Add to `AssociateRepository`:

```java
    boolean existsByEmail(String email);

    boolean existsByParentIdAndPosition(UUID parentId, String position);
```

`AssociateProvisioningService.java`:

```java
package com.plotchain.associate;

import com.plotchain.rank.RankTier;
import com.plotchain.rank.RankTierRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

@Service
public class AssociateProvisioningService {

    private static final SecureRandom RANDOM = new SecureRandom();

    private final AssociateRepository associateRepository;
    private final RankTierRepository rankTierRepository;
    private final PasswordEncoder passwordEncoder;

    public AssociateProvisioningService(
        AssociateRepository associateRepository,
        RankTierRepository rankTierRepository,
        PasswordEncoder passwordEncoder
    ) {
        this.associateRepository = associateRepository;
        this.rankTierRepository = rankTierRepository;
        this.passwordEncoder = passwordEncoder;
    }

    public CreateAssociateResponse create(CreateAssociateRequest request) {
        if (associateRepository.existsByEmail(request.email())) {
            throw new EmailAlreadyRegisteredException(request.email());
        }

        if (request.parentId() != null) {
            associateRepository.findById(request.parentId())
                .orElseThrow(() -> new AssociateNotFoundException(request.parentId()));
            if (request.position() != null
                && associateRepository.existsByParentIdAndPosition(request.parentId(), request.position())) {
                throw new PlacementUnavailableException(request.parentId(), request.position());
            }
        }

        RankTier lowestRank = rankTierRepository.findAllByOrderByRankOrder().stream()
            .findFirst()
            .orElseThrow(NoRankTiersConfiguredException::new);

        String temporaryPassword = generateTemporaryPassword();

        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setName(request.name());
        associate.setEmail(request.email());
        associate.setPasswordHash(passwordEncoder.encode(temporaryPassword));
        associate.setRole(AssociateRole.ASSOCIATE);
        associate.setSponsorId(request.sponsorId());
        associate.setParentId(request.parentId());
        associate.setPosition(request.position());
        associate.setRankId(lowestRank.getId());
        associate.setKycStatus(KycStatus.PENDING);
        associate.setJoinedAt(Instant.now());
        associate.setCumulativeMatchedVolume(BigDecimal.ZERO);
        associate.setMustChangePassword(true);
        associateRepository.save(associate);

        return new CreateAssociateResponse(associate.getId(), temporaryPassword);
    }

    private static String generateTemporaryPassword() {
        byte[] bytes = new byte[12];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
```

`AssociateController.java`:

```java
package com.plotchain.associate;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

// Reachable by ADMIN only — SecurityConfig gates every POST /api/** behind hasAuthority("ADMIN").
@RestController
public class AssociateController {

    private final AssociateProvisioningService provisioningService;

    public AssociateController(AssociateProvisioningService provisioningService) {
        this.provisioningService = provisioningService;
    }

    @PostMapping("/api/associates")
    public ResponseEntity<CreateAssociateResponse> create(@Valid @RequestBody CreateAssociateRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(provisioningService.create(request));
    }
}
```

`AssociateProvisioningExceptionHandler.java` (follows the existing per-domain `@RestControllerAdvice` convention):

```java
package com.plotchain.associate;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

@RestControllerAdvice
public class AssociateProvisioningExceptionHandler {

    @ExceptionHandler(EmailAlreadyRegisteredException.class)
    public ResponseEntity<Map<String, String>> handleEmailTaken(EmailAlreadyRegisteredException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(PlacementUnavailableException.class)
    public ResponseEntity<Map<String, String>> handlePlacementTaken(PlacementUnavailableException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(NoRankTiersConfiguredException.class)
    public ResponseEntity<Map<String, String>> handleNoRanks(NoRankTiersConfiguredException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `mvn -f backend/pom.xml test -Dtest=AssociateProvisioningServiceTest` → PASS (5/5)

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/associate/ \
        backend/src/test/java/com/plotchain/associate/AssociateProvisioningServiceTest.java
git commit -m "feat: add ADMIN-only POST /api/associates to provision accounts"
```

---

### Task 4: Self-service password change

**Files:**
- Create: `backend/src/main/java/com/plotchain/auth/ChangePasswordRequest.java`
- Create: `backend/src/main/java/com/plotchain/auth/PasswordController.java`
- Modify: `backend/src/main/java/com/plotchain/auth/AuthService.java`
- Modify: `backend/src/main/java/com/plotchain/auth/SecurityConfig.java`
- Modify: `backend/src/main/java/com/plotchain/auth/LoginResponse.java`
- Modify: `backend/src/test/java/com/plotchain/auth/AuthServiceTest.java`
- Modify: `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`

**Interfaces:**
- Produces: `POST /api/associates/me/password` — associate-reachable, self-scoped. `LoginResponse` gains a `mustChangePassword` flag.

- [ ] **Step 1: Write the failing tests**

Append to `AuthServiceTest`:

```java
    @Test
    void changesThePasswordAndClearsTheMustChangeFlag() {
        UUID associateId = UUID.randomUUID();
        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setRole(AssociateRole.ASSOCIATE);
        associate.setPasswordHash(passwordEncoder.encode("OldPassword1!"));
        associate.setMustChangePassword(true);
        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));

        authService.changePassword(associateId, new ChangePasswordRequest("OldPassword1!", "NewPassword1!"));

        assertThat(passwordEncoder.matches("NewPassword1!", associate.getPasswordHash())).isTrue();
        assertThat(associate.isMustChangePassword()).isFalse();
        verify(associateRepository).save(associate);
    }

    @Test
    void rejectsAPasswordChangeWhenTheCurrentPasswordIsWrong() {
        UUID associateId = UUID.randomUUID();
        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setRole(AssociateRole.ASSOCIATE);
        associate.setPasswordHash(passwordEncoder.encode("OldPassword1!"));
        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));

        assertThatThrownBy(() -> authService.changePassword(
            associateId, new ChangePasswordRequest("wrong", "NewPassword1!")))
            .isInstanceOf(InvalidCredentialsException.class);

        verify(associateRepository, never()).save(org.mockito.ArgumentMatchers.any());
    }
```

Add the imports `AssociateRole`, `never`, `verify`, and `assertThatThrownBy` if not already present.

Append to `SecurityConfigTest` — this is the ordering guard for the new associate-reachable POST:

```java
    @Test
    void passwordChangeIsReachableByAnAssociateToken() throws Exception {
        // A POST under /api/** that an ASSOCIATE must be able to reach. It needs its own
        // matcher ABOVE the blanket ADMIN write rules; without it this returns 403 and no
        // associate could ever clear their must-change-password state.
        mockMvc.perform(post("/api/associates/me/password")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE))
                .contentType("application/json")
                .content("{\"currentPassword\":\"x\",\"newPassword\":\"y\"}"))
            .andExpect(status().is(not(403)));
    }
```

Use a concrete assertion rather than `not(403)` if that reads awkwardly — e.g. assert the status is 401 (the service rejects the bogus current password) and explicitly document that the point is "not 403". Prefer:

```java
            .andExpect(status().isUnauthorized());
```

with a comment noting a 403 here would mean the security matcher ordering regressed.

- [ ] **Step 2: Run and confirm they fail**

Run: `mvn -f backend/pom.xml test -Dtest=AuthServiceTest,SecurityConfigTest`
Expected: COMPILE ERROR / FAILURE — `changePassword` and the endpoint do not exist.

- [ ] **Step 3: Write the production code**

`ChangePasswordRequest.java`:

```java
package com.plotchain.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ChangePasswordRequest(
    @NotBlank String currentPassword,
    @NotBlank @Size(min = 8, message = "newPassword must be at least 8 characters") String newPassword
) {}
```

Add to `AuthService`:

```java
    public void changePassword(UUID associateId, ChangePasswordRequest request) {
        Associate associate = associateRepository.findById(associateId)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));

        if (!passwordEncoder.matches(request.currentPassword(), associate.getPasswordHash())) {
            throw new InvalidCredentialsException();
        }

        associate.setPasswordHash(passwordEncoder.encode(request.newPassword()));
        associate.setMustChangePassword(false);
        associateRepository.save(associate);
    }
```

`PasswordController.java`:

```java
package com.plotchain.auth;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
public class PasswordController {

    private final AuthService authService;

    public PasswordController(AuthService authService) {
        this.authService = authService;
    }

    // Self-scoped by construction: the target associate comes from the verified JWT, never
    // from the request, so no caller can change another associate's password.
    @PostMapping("/api/associates/me/password")
    public ResponseEntity<Void> changePassword(
        @AuthenticationPrincipal UUID associateId,
        @Valid @RequestBody ChangePasswordRequest request
    ) {
        authService.changePassword(associateId, request);
        return ResponseEntity.noContent().build();
    }
}
```

In `SecurityConfig`, add the matcher **above** the blanket ADMIN write rules:

```java
                .requestMatchers(HttpMethod.POST, "/api/auth/login").permitAll()
                // Self-service password change: an associate-reachable POST. Must precede the
                // blanket ADMIN write rules below (first-match-wins) or associates could never
                // clear their must-change-password state. SecurityConfigTest locks this.
                .requestMatchers(HttpMethod.POST, "/api/associates/me/password").authenticated()
                .requestMatchers(HttpMethod.POST, "/api/**").hasAuthority("ADMIN")
```

Change `LoginResponse` to carry the flag:

```java
public record LoginResponse(String token, UUID associateId, String role, boolean mustChangePassword) {}
```

and update `AuthService.login`'s construction to `new LoginResponse(token, associate.getId(), associate.getRole().name(), associate.isMustChangePassword())`. Fix the existing `AuthServiceTest`/`AuthControllerTest` expectations for the widened record.

- [ ] **Step 4: Make the dashboard fail clearly for a rank-less account**

This closes the regression identified in Task 1's review: a null `rankId` currently escapes `DashboardService` as an unhandled `IllegalStateException` → 500. The bootstrapped admin has exactly that.

Create `backend/src/main/java/com/plotchain/dashboard/NoRankAssignedException.java`:

```java
package com.plotchain.dashboard;

import java.util.UUID;

/**
 * Raised when the associate dashboard is requested for an account that has no rank — in
 * practice an ADMIN, which by design has no MLM rank (see chk_associate_rank_required). The
 * dashboard is an associate-facing view; admins have no meaningful one.
 */
public class NoRankAssignedException extends RuntimeException {
    public NoRankAssignedException(UUID associateId) {
        super("No rank assigned to account " + associateId
            + "; the associate dashboard does not apply to accounts without a rank");
    }
}
```

In `DashboardService.getDashboard`, guard before the rank lookup:

```java
        if (associate.getRankId() == null) {
            throw new NoRankAssignedException(associateId);
        }
```

In `DashboardExceptionHandler`, map it (same convention as the existing handlers):

```java
    @ExceptionHandler(NoRankAssignedException.class)
    public ResponseEntity<Map<String, String>> handleNoRankAssigned(NoRankAssignedException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }
```

Add a covering test to `DashboardServiceTest`:

```java
    @Test
    void rejectsTheDashboardForAnAccountWithNoRank() {
        UUID associateId = UUID.randomUUID();
        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setRankId(null);
        associate.setKycStatus(KycStatus.VERIFIED);
        associate.setCumulativeMatchedVolume(BigDecimal.ZERO);
        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));

        assertThatThrownBy(() -> dashboardService.getDashboard(associateId))
            .isInstanceOf(NoRankAssignedException.class);
    }
```

The guard must sit early enough that the test needs no cycle/ledger/wallet stubbing — if Mockito reports unnecessary stubbings or the test needs more `when(...)` calls than above, move the guard earlier in the method.

- [ ] **Step 5: Run and confirm they pass, then the full suite**

Run: `mvn -f backend/pom.xml test` → PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/plotchain/auth/ backend/src/test/java/com/plotchain/auth/ \
        backend/src/main/java/com/plotchain/dashboard/ backend/src/test/java/com/plotchain/dashboard/
git commit -m "feat: add self-service password change, surface mustChangePassword on login"
```

---

### Task 5: Frontend — logout UI and expiry-aware guard

**Files:**
- Modify: `frontend/src/app/auth/auth.service.ts`
- Modify: `frontend/src/app/auth/auth.guard.ts`
- Modify: `frontend/src/app/auth/auth.service.spec.ts`
- Modify: `frontend/src/app/auth/auth.guard.spec.ts`
- Modify: `frontend/src/app/app.component.ts` (and its template file if separate)
- Modify: `frontend/src/assets/i18n/en.json`, `frontend/src/assets/i18n/hi.json`

**Interfaces:**
- Produces: `AuthService.isAuthenticated()` now returns false for an expired token; `AuthService.mustChangePassword()`; a logout control in the app shell.

- [ ] **Step 1: Write the failing specs**

Append to `auth.service.spec.ts`:

```ts
  function tokenExpiringAt(secondsFromNow: number): string {
    const payload = { sub: 'assoc-1', role: 'ASSOCIATE', exp: Math.floor(Date.now() / 1000) + secondsFromNow };
    const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.signature-not-verified-client-side`;
  }

  it('reports not authenticated when the stored token has expired', () => {
    localStorage.setItem('plotchain.auth.token', tokenExpiringAt(-60));
    expect(service.isAuthenticated()).toBeFalse();
  });

  it('reports authenticated when the stored token is still valid', () => {
    localStorage.setItem('plotchain.auth.token', tokenExpiringAt(3600));
    expect(service.isAuthenticated()).toBeTrue();
  });

  it('reports not authenticated when the stored token is malformed', () => {
    localStorage.setItem('plotchain.auth.token', 'not-a-jwt');
    expect(service.isAuthenticated()).toBeFalse();
  });
```

- [ ] **Step 2: Run and confirm they fail**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include='**/auth.service.spec.ts'`
Expected: FAIL — `isAuthenticated()` currently only checks presence.

- [ ] **Step 3: Implement expiry awareness and the logout control**

In `auth.service.ts`, replace `isAuthenticated()` and add a payload decoder:

```ts
  isAuthenticated(): boolean {
    const payload = this.decodePayload(this.getToken());
    if (!payload || typeof payload['exp'] !== 'number') {
      return false;
    }
    return payload['exp'] * 1000 > Date.now();
  }

  mustChangePassword(): boolean {
    return localStorage.getItem(MUST_CHANGE_KEY) === 'true';
  }

  // Reads the JWT payload for client-side routing decisions only. The signature is NOT
  // verified here and cannot be — the backend is the only authority on token validity. This
  // exists so an expired token routes to /login without a round-trip, not as a security check.
  private decodePayload(token: string | null): Record<string, unknown> | null {
    if (!token) {
      return null;
    }
    const segments = token.split('.');
    if (segments.length !== 3) {
      return null;
    }
    try {
      const base64 = segments[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(base64)) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
```

Add `const MUST_CHANGE_KEY = 'plotchain.auth.mustChangePassword';` beside the existing `TOKEN_KEY`, store it in `login()`'s `tap` (`localStorage.setItem(MUST_CHANGE_KEY, String(response.mustChangePassword))`), and clear it in `logout()`.

In `app.component.ts`, add a minimal shell with a logout control shown only when authenticated. Keep it consistent with the app's existing standalone/`TranslateModule` style:

```ts
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterOutlet } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from './auth/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, TranslateModule],
  template: `
    <header class="app-header" *ngIf="authService.isAuthenticated()">
      <button type="button" class="logout" (click)="onLogout()">{{ 'auth.logout' | translate }}</button>
    </header>
    <router-outlet></router-outlet>
  `
})
export class AppComponent {
  authService = inject(AuthService);
  private router = inject(Router);

  onLogout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
```

Preserve whatever the existing `AppComponent` already declares (title field, etc.) — read it first and add to it rather than replacing wholesale. If it uses a separate `app.component.html`, put the template there instead.

Add `"logout"` to the `auth` namespace in both `en.json` (`"Log Out"`) and `hi.json` (`"लॉग आउट"`).

- [ ] **Step 4: Run the full frontend suite**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless` → PASS. `app.component.spec.ts` may need updating if it asserts on the old template.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/auth frontend/src/app/app.component.ts frontend/src/assets/i18n
git commit -m "feat: add logout control and expiry-aware auth guard"
```

---

### Task 6: Frontend — forced password change on first login

**Files:**
- Create: `frontend/src/app/auth/change-password.component.ts`
- Create: `frontend/src/app/auth/change-password.component.spec.ts`
- Modify: `frontend/src/app/auth/models/login-response.model.ts` — add `mustChangePassword: boolean` to mirror the widened backend record from Task 4. Without this the TypeScript build fails on `response.mustChangePassword` below.
- Modify: `frontend/src/app/auth/auth.service.ts`
- Modify: `frontend/src/app/auth/login.component.ts`
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/app.routes.spec.ts`
- Modify: `frontend/src/assets/i18n/en.json`, `frontend/src/assets/i18n/hi.json`

**Known limitation, deliberate:** routing to `/change-password` on login is a prompt, not an enforcement — an associate who manually navigates to `/dashboard` still reaches it, because the backend does not yet refuse other endpoints while `must_change_password` is true. Closing that properly means gating server-side (rejecting non-password-change requests with a 409 until the flag clears), which is a larger change and is not in this plan. `AuthService.mustChangePassword()` is added in Task 5 so a future guard has the state available. Do not pretend the client-side routing is enforcement.

**Interfaces:**
- Consumes: `POST /api/associates/me/password`, `LoginResponse.mustChangePassword`.
- Produces: `/change-password` route; `LoginComponent` routes there instead of `/dashboard` when the flag is set.

- [ ] **Step 1: Write the failing spec**

Create `change-password.component.spec.ts` following `login.component.spec.ts`'s shape: standalone component import + `HttpClientTestingModule` + `RouterTestingModule` + `TranslateModule.forRoot()`; assert a successful change POSTs to `/api/associates/me/password` and navigates to `/dashboard`, and that a 401 sets the error flag.

Also extend `app.routes.spec.ts`:

```ts
  it('exposes a change-password route behind the auth guard', () => {
    const route = routes.find(r => r.path === 'change-password');
    expect(route).toBeTruthy();
    expect(route!.canActivate).toContain(authGuard);
  });
```

- [ ] **Step 2: Run and confirm failure**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless`
Expected: FAIL — component and route do not exist.

- [ ] **Step 3: Implement**

Add to `auth.service.ts`:

```ts
  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.http.post<void>('/api/associates/me/password', { currentPassword, newPassword }).pipe(
      tap(() => localStorage.setItem(MUST_CHANGE_KEY, 'false'))
    );
  }
```

Create `change-password.component.ts` mirroring `LoginComponent` — standalone, `inject()`-based DI (constructor DI breaks under this repo's ES2022 target; see the TS2729 note from the auth work), reactive form with `currentPassword`/`newPassword`, `Validators.required` plus `Validators.minLength(8)` on the new password, success → `router.navigate(['/dashboard'])`, failure → `error = true`.

In `login.component.ts`, route on the flag:

```ts
      next: response => this.router.navigate([response.mustChangePassword ? '/change-password' : '/dashboard']),
```

In `app.routes.ts`, add before the root redirect:

```ts
  { path: 'change-password', component: ChangePasswordComponent, canActivate: [authGuard] },
```

Add `changePasswordTitle`, `currentPasswordLabel`, `newPasswordLabel`, `changePasswordButton`, `changePasswordError` to the `auth` namespace in both locale files.

- [ ] **Step 4: Run both suites**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless` → PASS
Run: `mvn -f backend/pom.xml test` → PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/auth frontend/src/app/app.routes.ts frontend/src/app/app.routes.spec.ts frontend/src/assets/i18n
git commit -m "feat: force password change on first login"
```

---

### Task 7: Frontend — minimal admin form to provision an associate

**Files:**
- Create: `frontend/src/app/admin/create-associate.component.ts`
- Create: `frontend/src/app/admin/create-associate.component.spec.ts`
- Create: `frontend/src/app/admin/admin.service.ts`
- Create: `frontend/src/app/admin/admin.service.spec.ts`
- Create: `frontend/src/app/admin/admin.guard.ts`
- Create: `frontend/src/app/admin/admin.guard.spec.ts`
- Modify: `frontend/src/app/auth/auth.service.ts` (expose the stored role)
- Modify: `frontend/src/app/app.routes.ts`, `frontend/src/app/app.routes.spec.ts`
- Modify: `frontend/src/assets/i18n/en.json`, `frontend/src/assets/i18n/hi.json`

**Interfaces:**
- Consumes: `POST /api/associates`.
- Produces: `/admin/associates/new` route behind an `adminGuard`; the generated temporary password is displayed once after creation.

- [ ] **Step 1: Write the failing specs**

`admin.service.spec.ts` — POSTs to `/api/associates`, returns `{associateId, temporaryPassword}`.
`admin.guard.spec.ts` — allows when the stored role is `ADMIN`, returns a `UrlTree` to `/dashboard` otherwise.
`create-associate.component.spec.ts` — on success renders the returned temporary password; on a 409 sets an error flag.

Extend `app.routes.spec.ts` to assert the admin route is guarded by both `authGuard` and `adminGuard`.

- [ ] **Step 2: Run and confirm failure**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless`

- [ ] **Step 3: Implement**

Store the role at login: in `auth.service.ts` add `const ROLE_KEY = 'plotchain.auth.role';`, set it in `login()`'s `tap`, clear it in `logout()`, and expose `getRole(): string | null`.

`admin.guard.ts` — functional `CanActivateFn`: `inject(AuthService).getRole() === 'ADMIN' ? true : inject(Router).parseUrl('/dashboard')`.

`admin.service.ts` — `createAssociate(request): Observable<CreateAssociateResponse>` POSTing to `/api/associates`.

`create-associate.component.ts` — standalone, `inject()`-based DI, reactive form (name, email, optional sponsorId/parentId/position). On success, display the returned temporary password prominently with copy of the form cleared, and a note that it is shown only once. On error, set an error flag.

Route: `{ path: 'admin/associates/new', component: CreateAssociateComponent, canActivate: [authGuard, adminGuard] }`.

Add the corresponding i18n keys to both locale files.

**Note the client-side role check is UX only** — the backend's `hasAuthority("ADMIN")` rule is the actual enforcement, and it is already tested by `SecurityConfigTest`. Add a comment in `admin.guard.ts` saying so, so nobody mistakes it for a security boundary.

**Also route admins away from the associate dashboard** — the second half of the fix for the regression found in Task 1's review. An admin has no rank, so the associate dashboard cannot render for them; Task 4 made that fail cleanly with a 409, but an admin should never be sent there in the first place.

In `login.component.ts`, extend the post-login routing to consider role as well as the password flag:

```ts
      next: response => {
        if (response.mustChangePassword) {
          this.router.navigate(['/change-password']);
          return;
        }
        this.router.navigate([response.role === 'ADMIN' ? '/admin/associates/new' : '/dashboard']);
      },
```

Apply the same rule in `change-password.component.ts`'s success handler, so an admin completing a forced password change also lands in the admin area rather than a dashboard that will 409.

Add a spec case to `login.component.spec.ts` asserting an ADMIN login navigates to the admin route and an ASSOCIATE login navigates to `/dashboard`. Without it, this routing rule is exactly as deletable-without-consequence as the wiring gaps found in the previous plan.

- [ ] **Step 4: Run both suites**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless` → PASS
Run: `mvn -f backend/pom.xml test` → PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/admin frontend/src/app/auth/auth.service.ts \
        frontend/src/app/app.routes.ts frontend/src/app/app.routes.spec.ts frontend/src/assets/i18n
git commit -m "feat: add admin form to provision associate accounts"
```

---

### Task 8: Document deployment configuration

**Files:**
- Create or modify: `README.md`

- [ ] **Step 1: Document the required configuration**

Add a section covering, at minimum:
- `JWT_SECRET` — required; the app refuses to start outside dev/test without it. Generate with `openssl rand -base64 48`.
- `PLOTCHAIN_ADMIN_EMAIL` / `PLOTCHAIN_ADMIN_PASSWORD` — set on first boot against an empty database to bootstrap the initial admin; the account must change its password on first login. Safe to leave unset afterwards.
- `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD`.
- Running locally with the `dev` profile to get the seeded test accounts, and an explicit warning that those credentials are public and must never be used in a real deployment.
- The fact that `POST /api/associates` is the only way to create accounts, and that it requires an ADMIN token.

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document required deployment configuration"
```
