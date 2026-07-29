# Associate Auth (JWT login) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build real login (email + password, JWT, admin/associate roles on the existing `Associate` entity) and use it to fix the actual reported bug — `GET /api/associates/me/dashboard` returning 400 because the frontend sends the literal string `"me"` where a UUID path variable is expected. The fix resolves the associate id from a verified JWT instead of a client-supplied path segment.

**Architecture:** Backend-first, bottom-up: schema/entity → pure-logic JWT service → login endpoint (security permissive) → security filter wiring (security locked down) → the actual dashboard-route fix → frontend last, since it consumes the now-final backend contract. Full design rationale lives in `/Users/ronalisenapati/.claude/plans/cuddly-brewing-valley.md` (the approved architecture plan) — this document is its task-by-task breakdown.

**Tech Stack:** Spring Boot 3.3.4 + `spring-boot-starter-security` (new) + `io.jsonwebtoken:jjwt` 0.12.6 (new) on the backend; Angular 18.2 standalone components + functional guards/interceptors on the frontend.

## Global Constraints

- Single-tenant app (admin + associates) — `tenant_id` was already fully removed in a prior refactor. Do not reintroduce any tenant concept.
- Email + password login only — no signup/registration flow. Seed 1-2 test accounts via a Flyway migration.
- Admin is a role (`ADMIN`/`ASSOCIATE`) on the existing `Associate` entity/table, not a separate entity.
- Stateless JWT (Bearer token) — no server-side session store, no logout-invalidation/blacklist.
- Authorization policy (documented now, not enforced by any endpoint yet — none exists to gate): admin can write; associates are read-only except their own profile. `@EnableMethodSecurity` + the `hasAuthority('ADMIN')`/`hasAuthority('ASSOCIATE')` convention (plain authority names, no `ROLE_` prefix) is put in place now so the next endpoint added inherits the right mechanism. **No profile-edit endpoint is being built in this plan** — nothing to gate today.
- Avoid `@MockBean`/`Mockito.mock(...)` on concrete classes anywhere in new or edited tests — this JDK's Mockito/ByteBuddy combination cannot instrument concrete classes (confirmed pre-existing, unrelated environment issue). Mocking interfaces (Spring Data repositories, `PasswordEncoder`, servlet interfaces) is fine and already proven to work in this codebase (see `DashboardServiceTest`).
- Run backend tests: `mvn -f backend/pom.xml test -Dtest=<ClassName>` or `mvn -f backend/pom.xml test` for the full suite. Run frontend tests: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless` (confirmed: no custom `karma.conf.js` exists, `karma-chrome-launcher` is already a devDependency, and the Angular CLI karma builder passes `--browsers` straight through — this invocation works as-is).
- Every task must leave the project compiling and all tests passing.

---

### Task 1: Schema & Associate entity — auth columns + findByEmail

**Files:**
- Modify: `backend/src/main/resources/db/migration/V1__create_dashboard_tables.sql` — **do not edit this.** Create a new migration instead (see below) — V1 already shipped as the base schema for the tenant_id-removal work; this plan adds a new migration on top.
- Create: `backend/src/main/resources/db/migration/V2__add_associate_auth.sql`
- Modify: `backend/src/main/java/com/plotchain/associate/Associate.java`
- Create: `backend/src/main/java/com/plotchain/associate/AssociateRole.java`
- Modify: `backend/src/main/java/com/plotchain/associate/AssociateRepository.java`
- Modify: `backend/src/test/java/com/plotchain/associate/AssociateRepositoryTest.java`

**Interfaces:**
- Produces: `AssociateRole` enum (`ADMIN`, `ASSOCIATE`), `Associate.getEmail()/setEmail()`, `getPasswordHash()/setPasswordHash()`, `getRole()/setRole()`, `AssociateRepository.findByEmail(String): Optional<Associate>`.

- [ ] **Step 1: Generate a real BCrypt hash for the seed password** (already done for you — reuse this value, do not regenerate)

The seed password for both test accounts is `Password123!`. Its BCrypt hash (cost 10, generated via `htpasswd -bnBC 10 "" 'Password123!'`) is:

```
$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C
```

Spring Security's `BCryptPasswordEncoder` accepts `$2a$`/`$2b$`/`$2y$` hash prefixes interchangeably for verification, so this hash works with `passwordEncoder.matches("Password123!", storedHash)`.

- [ ] **Step 2: Update `AssociateRepositoryTest` first — add `findByEmail`, and give `newAssociate` real auth values**

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
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@ActiveProfiles("test")
class AssociateRepositoryTest {

    private static final String TEST_PASSWORD_HASH = "$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C";

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

    @Test
    void findByEmailReturnsTheMatchingAssociate() {
        RankTier rank = new RankTier(UUID.randomUUID(), "Sales Associate", 1, BigDecimal.valueOf(10000));
        entityManager.persist(rank);

        Associate associate = newAssociate(null, null, rank.getId());
        associate.setEmail("jane@plotchain.test");
        associateRepository.save(associate);
        entityManager.flush();

        Optional<Associate> found = associateRepository.findByEmail("jane@plotchain.test");

        assertThat(found).isPresent();
        assertThat(found.get().getId()).isEqualTo(associate.getId());
    }

    @Test
    void findByEmailReturnsEmptyForAnUnknownEmail() {
        Optional<Associate> found = associateRepository.findByEmail("nobody@plotchain.test");

        assertThat(found).isEmpty();
    }

    // Uses the JVM default zone (matching how the DATE query params below are interpreted
    // against the TIMESTAMP-without-timezone joined_at column) so the boundary lines up.
    private static Instant instantAt(LocalDate date, LocalTime time) {
        return date.atTime(time).atZone(ZoneId.systemDefault()).toInstant();
    }

    private Associate newAssociate(UUID parentId, String position, UUID rankId) {
        Associate a = new Associate();
        UUID id = UUID.randomUUID();
        a.setId(id);
        a.setParentId(parentId);
        a.setPosition(position);
        a.setName("Test Associate");
        a.setRankId(rankId);
        a.setKycStatus(KycStatus.VERIFIED);
        a.setJoinedAt(Instant.now());
        a.setCumulativeMatchedVolume(BigDecimal.ZERO);
        a.setEmail(id + "@test.local");
        a.setPasswordHash(TEST_PASSWORD_HASH);
        a.setRole(AssociateRole.ASSOCIATE);
        return a;
    }
}
```

- [ ] **Step 3: Run the test and confirm it fails to compile**

Run: `mvn -f backend/pom.xml test -Dtest=AssociateRepositoryTest`
Expected: COMPILE ERROR — `Associate` has no `setEmail`/`setPasswordHash`/`setRole`, `AssociateRole` doesn't exist, `AssociateRepository.findByEmail` doesn't exist.

- [ ] **Step 4: Add the migration, the enum, the entity fields, and the repository method**

Create `backend/src/main/resources/db/migration/V2__add_associate_auth.sql`:

```sql
-- Seed test accounts for login (this app has no signup flow — accounts are provisioned
-- here). Both use the same password for simplicity:
--   associate@plotchain.test / Password123!  (role ASSOCIATE)
--   admin@plotchain.test     / Password123!  (role ADMIN)
-- password_hash is a BCrypt hash of "Password123!" (cost 10).

ALTER TABLE associate ADD COLUMN email VARCHAR(255);
ALTER TABLE associate ADD COLUMN password_hash VARCHAR(60);
ALTER TABLE associate ADD COLUMN role VARCHAR(20);

-- Structural placeholder: rank_id is a NOT NULL FK on associate, but "rank" is an
-- MLM-associate concept that doesn't really apply to a platform admin. Both seeded
-- rows point at this one rank row purely to satisfy the FK constraint. rank_order=999
-- is deliberately out of the way of real rank tiers (which start at 1) and of the
-- rank_order=1 rows several tests create in their own (rolled-back) transactions —
-- this seeded row is committed at migration time, outside any test transaction, so it
-- persists for the life of the shared test database and would collide with
-- rank_tier's UNIQUE(rank_order) constraint if it used rank_order=1 too.
INSERT INTO rank_tier (id, name, rank_order, volume_threshold) VALUES
    ('11111111-1111-1111-1111-111111111111', 'Sales Associate', 999, 5000);

INSERT INTO associate (id, sponsor_id, parent_id, position, name, rank_id, kyc_status, joined_at, cumulative_matched_volume, last_active_at, email, password_hash, role) VALUES
    ('22222222-2222-2222-2222-222222222222', NULL, NULL, NULL, 'Test Associate', '11111111-1111-1111-1111-111111111111', 'VERIFIED', NOW(), 0, NULL, 'associate@plotchain.test', '$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C', 'ASSOCIATE'),
    ('33333333-3333-3333-3333-333333333333', NULL, NULL, NULL, 'Test Admin', '11111111-1111-1111-1111-111111111111', 'VERIFIED', NOW(), 0, NULL, 'admin@plotchain.test', '$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C', 'ADMIN');

ALTER TABLE associate ALTER COLUMN email SET NOT NULL;
ALTER TABLE associate ALTER COLUMN password_hash SET NOT NULL;
ALTER TABLE associate ALTER COLUMN role SET NOT NULL;
ALTER TABLE associate ADD CONSTRAINT chk_associate_role CHECK (role IN ('ADMIN','ASSOCIATE'));
CREATE UNIQUE INDEX idx_associate_email ON associate(email);
```

Create `backend/src/main/java/com/plotchain/associate/AssociateRole.java`:

```java
package com.plotchain.associate;

public enum AssociateRole { ADMIN, ASSOCIATE }
```

In `backend/src/main/java/com/plotchain/associate/Associate.java`, add three fields (after `lastActiveAt`) and their getters/setters:

```java
    @Column(nullable = false)
    private String email;
    @Column(name = "password_hash", nullable = false)
    private String passwordHash;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private AssociateRole role;
```

```java
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getPasswordHash() { return passwordHash; }
    public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }
    public AssociateRole getRole() { return role; }
    public void setRole(AssociateRole role) { this.role = role; }
```

In `backend/src/main/java/com/plotchain/associate/AssociateRepository.java`, add the import `java.util.Optional;` and this method to the interface:

```java
    Optional<Associate> findByEmail(String email);
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `mvn -f backend/pom.xml test -Dtest=AssociateRepositoryTest`
Expected: PASS (5/5)

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/resources/db/migration/V2__add_associate_auth.sql \
        backend/src/main/java/com/plotchain/associate/Associate.java \
        backend/src/main/java/com/plotchain/associate/AssociateRole.java \
        backend/src/main/java/com/plotchain/associate/AssociateRepository.java \
        backend/src/test/java/com/plotchain/associate/AssociateRepositoryTest.java
git commit -m "feat: add email/password/role auth columns to associate, seed test accounts"
```

---

### Task 2: JwtService (pure logic, no HTTP layer yet)

**Files:**
- Modify: `backend/pom.xml`
- Modify: `backend/src/main/resources/application.yml`
- Modify: `backend/src/test/resources/application-test.yml`
- Create: `backend/src/main/java/com/plotchain/auth/JwtService.java`
- Create: `backend/src/test/java/com/plotchain/auth/JwtServiceTest.java`

**Interfaces:**
- Produces: `JwtService(String secret, long expirationMinutes)`, `generateToken(Associate): String`, `extractAssociateId(String): UUID`, `extractRole(String): AssociateRole`, `isTokenValid(String): boolean`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/plotchain/auth/JwtServiceTest.java`:

```java
package com.plotchain.auth;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRole;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class JwtServiceTest {

    private static final String SECRET = "test-secret-key-at-least-32-bytes-long-for-hs256";

    @Test
    void generatesATokenThatRoundTripsAssociateIdAndRole() {
        JwtService jwtService = new JwtService(SECRET, 60);
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(AssociateRole.ADMIN);

        String token = jwtService.generateToken(associate);

        assertThat(jwtService.isTokenValid(token)).isTrue();
        assertThat(jwtService.extractAssociateId(token)).isEqualTo(associate.getId());
        assertThat(jwtService.extractRole(token)).isEqualTo(AssociateRole.ADMIN);
    }

    @Test
    void rejectsATokenSignedWithADifferentSecret() {
        JwtService signer = new JwtService(SECRET, 60);
        JwtService verifier = new JwtService("different-secret-key-at-least-32-bytes-long!!", 60);
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(AssociateRole.ASSOCIATE);

        String token = signer.generateToken(associate);

        assertThat(verifier.isTokenValid(token)).isFalse();
    }

    @Test
    void rejectsAnExpiredToken() throws InterruptedException {
        JwtService jwtService = new JwtService(SECRET, 0);
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(AssociateRole.ASSOCIATE);

        String token = jwtService.generateToken(associate);
        Thread.sleep(1000);

        assertThat(jwtService.isTokenValid(token)).isFalse();
    }
}
```

- [ ] **Step 2: Run it to confirm it fails to compile**

Run: `mvn -f backend/pom.xml test -Dtest=JwtServiceTest`
Expected: COMPILE ERROR — `JwtService` doesn't exist yet, and jjwt isn't on the classpath.

- [ ] **Step 3: Add the jjwt dependency and JWT config**

In `backend/pom.xml`, add inside `<dependencies>` (after the `postgresql` dependency, before the `h2` test dependency):

```xml
    <dependency>
      <groupId>io.jsonwebtoken</groupId>
      <artifactId>jjwt-api</artifactId>
      <version>0.12.6</version>
    </dependency>
    <dependency>
      <groupId>io.jsonwebtoken</groupId>
      <artifactId>jjwt-impl</artifactId>
      <version>0.12.6</version>
      <scope>runtime</scope>
    </dependency>
    <dependency>
      <groupId>io.jsonwebtoken</groupId>
      <artifactId>jjwt-jackson</artifactId>
      <version>0.12.6</version>
      <scope>runtime</scope>
    </dependency>
```

In `backend/src/main/resources/application.yml`, add at the end (after the `server:` block):

```yaml
jwt:
  secret: ${JWT_SECRET:dev-only-change-me-this-needs-to-be-at-least-32-bytes-long}
  expiration-minutes: ${JWT_EXPIRATION_MINUTES:60}
```

In `backend/src/test/resources/application-test.yml`, add the same block at the end:

```yaml
jwt:
  secret: test-secret-key-at-least-32-bytes-long-for-hs256
  expiration-minutes: 60
```

Create `backend/src/main/java/com/plotchain/auth/JwtService.java`:

```java
package com.plotchain.auth;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRole;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;

@Component
public class JwtService {

    private final SecretKey key;
    private final long expirationMinutes;

    public JwtService(
        @Value("${jwt.secret}") String secret,
        @Value("${jwt.expiration-minutes}") long expirationMinutes
    ) {
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expirationMinutes = expirationMinutes;
    }

    public String generateToken(Associate associate) {
        Instant now = Instant.now();
        return Jwts.builder()
            .subject(associate.getId().toString())
            .claim("role", associate.getRole().name())
            .issuedAt(Date.from(now))
            .expiration(Date.from(now.plusSeconds(expirationMinutes * 60)))
            .signWith(key)
            .compact();
    }

    public UUID extractAssociateId(String token) {
        return UUID.fromString(parseClaims(token).getSubject());
    }

    public AssociateRole extractRole(String token) {
        return AssociateRole.valueOf(parseClaims(token).get("role", String.class));
    }

    public boolean isTokenValid(String token) {
        try {
            parseClaims(token);
            return true;
        } catch (JwtException | IllegalArgumentException e) {
            return false;
        }
    }

    private Claims parseClaims(String token) {
        return Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload();
    }
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `mvn -f backend/pom.xml test -Dtest=JwtServiceTest`
Expected: PASS (3/3)

- [ ] **Step 5: Commit**

```bash
git add backend/pom.xml backend/src/main/resources/application.yml \
        backend/src/test/resources/application-test.yml \
        backend/src/main/java/com/plotchain/auth/JwtService.java \
        backend/src/test/java/com/plotchain/auth/JwtServiceTest.java
git commit -m "feat: add JwtService for issuing and validating associate JWTs"
```

---

### Task 3: Login endpoint (security permissive for now)

**Files:**
- Modify: `backend/pom.xml`
- Create: `backend/src/main/java/com/plotchain/auth/LoginRequest.java`
- Create: `backend/src/main/java/com/plotchain/auth/LoginResponse.java`
- Create: `backend/src/main/java/com/plotchain/auth/InvalidCredentialsException.java`
- Create: `backend/src/main/java/com/plotchain/auth/AuthExceptionHandler.java`
- Create: `backend/src/main/java/com/plotchain/auth/AuthService.java`
- Create: `backend/src/main/java/com/plotchain/auth/AuthController.java`
- Create: `backend/src/main/java/com/plotchain/auth/SecurityConfig.java`
- Create: `backend/src/test/java/com/plotchain/auth/AuthServiceTest.java`
- Create: `backend/src/test/java/com/plotchain/auth/AuthControllerTest.java`

**Interfaces:**
- Consumes: `JwtService` (Task 2), `AssociateRepository.findByEmail` (Task 1).
- Produces: `POST /api/auth/login` → `LoginResponse(token, associateId, role)`. `PasswordEncoder` bean (BCrypt), available to any future consumer.

- [ ] **Step 1: Write the failing tests**

Create `backend/src/test/java/com/plotchain/auth/AuthServiceTest.java`:

```java
package com.plotchain.auth;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock AssociateRepository associateRepository;

    PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
    JwtService jwtService = new JwtService("test-secret-key-at-least-32-bytes-long-for-hs256", 60);
    AuthService authService;

    @BeforeEach
    void setUp() {
        authService = new AuthService(associateRepository, passwordEncoder, jwtService);
    }

    @Test
    void issuesATokenForValidCredentials() {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(AssociateRole.ASSOCIATE);
        associate.setPasswordHash(passwordEncoder.encode("Password123!"));
        when(associateRepository.findByEmail("jane@plotchain.test")).thenReturn(Optional.of(associate));

        LoginResponse response = authService.login(new LoginRequest("jane@plotchain.test", "Password123!"));

        assertThat(response.token()).isNotBlank();
        assertThat(response.associateId()).isEqualTo(associate.getId());
        assertThat(response.role()).isEqualTo("ASSOCIATE");
    }

    @Test
    void rejectsAnUnknownEmail() {
        when(associateRepository.findByEmail("nobody@plotchain.test")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> authService.login(new LoginRequest("nobody@plotchain.test", "whatever")))
            .isInstanceOf(InvalidCredentialsException.class);
    }

    @Test
    void rejectsAWrongPassword() {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(AssociateRole.ASSOCIATE);
        associate.setPasswordHash(passwordEncoder.encode("Password123!"));
        when(associateRepository.findByEmail("jane@plotchain.test")).thenReturn(Optional.of(associate));

        assertThatThrownBy(() -> authService.login(new LoginRequest("jane@plotchain.test", "wrong-password")))
            .isInstanceOf(InvalidCredentialsException.class);
    }
}
```

Create `backend/src/test/java/com/plotchain/auth/AuthControllerTest.java`:

```java
package com.plotchain.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.Optional;
import java.util.UUID;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Deliberately NOT @SpringBootTest/@MockBean: this JDK's Mockito/ByteBuddy combination
// cannot mock concrete classes. Wiring a real AuthService against a mocked (interface)
// AssociateRepository sidesteps that entirely while still exercising the real HTTP/JSON/
// exception-mapping path via standalone MockMvc.
@ExtendWith(MockitoExtension.class)
class AuthControllerTest {

    @Mock AssociateRepository associateRepository;

    MockMvc mockMvc;
    PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    @BeforeEach
    void setUp() {
        JwtService jwtService = new JwtService("test-secret-key-at-least-32-bytes-long-for-hs256", 60);
        AuthService authService = new AuthService(associateRepository, passwordEncoder, jwtService);
        mockMvc = MockMvcBuilders.standaloneSetup(new AuthController(authService))
            .setControllerAdvice(new AuthExceptionHandler())
            .build();
    }

    @Test
    void returnsATokenForValidCredentials() throws Exception {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(AssociateRole.ASSOCIATE);
        associate.setPasswordHash(passwordEncoder.encode("Password123!"));
        when(associateRepository.findByEmail("jane@plotchain.test")).thenReturn(Optional.of(associate));

        mockMvc.perform(post("/api/auth/login")
                .contentType("application/json")
                .content(new ObjectMapper().writeValueAsString(new LoginRequest("jane@plotchain.test", "Password123!"))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.token").isNotEmpty())
            .andExpect(jsonPath("$.role").value("ASSOCIATE"));
    }

    @Test
    void returns401ForWrongPassword() throws Exception {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(AssociateRole.ASSOCIATE);
        associate.setPasswordHash(passwordEncoder.encode("Password123!"));
        when(associateRepository.findByEmail("jane@plotchain.test")).thenReturn(Optional.of(associate));

        mockMvc.perform(post("/api/auth/login")
                .contentType("application/json")
                .content(new ObjectMapper().writeValueAsString(new LoginRequest("jane@plotchain.test", "wrong"))))
            .andExpect(status().isUnauthorized());
    }
}
```

- [ ] **Step 2: Run them and confirm they fail to compile**

Run: `mvn -f backend/pom.xml test -Dtest=AuthServiceTest,AuthControllerTest`
Expected: COMPILE ERROR — none of the production classes exist yet.

- [ ] **Step 3: Add spring-security and the production classes**

In `backend/pom.xml`, add inside `<dependencies>` (after the jjwt dependencies from Task 2):

```xml
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-security</artifactId>
    </dependency>
```

Create `backend/src/main/java/com/plotchain/auth/LoginRequest.java`:

```java
package com.plotchain.auth;

public record LoginRequest(String email, String password) {}
```

Create `backend/src/main/java/com/plotchain/auth/LoginResponse.java`:

```java
package com.plotchain.auth;

import java.util.UUID;

public record LoginResponse(String token, UUID associateId, String role) {}
```

Create `backend/src/main/java/com/plotchain/auth/InvalidCredentialsException.java`:

```java
package com.plotchain.auth;

public class InvalidCredentialsException extends RuntimeException {
    public InvalidCredentialsException() {
        super("Invalid email or password");
    }
}
```

Create `backend/src/main/java/com/plotchain/auth/AuthExceptionHandler.java`:

```java
package com.plotchain.auth;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

@RestControllerAdvice
public class AuthExceptionHandler {

    @ExceptionHandler(InvalidCredentialsException.class)
    public ResponseEntity<Map<String, String>> handleInvalidCredentials(InvalidCredentialsException ex) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", ex.getMessage()));
    }
}
```

Create `backend/src/main/java/com/plotchain/auth/AuthService.java`:

```java
package com.plotchain.auth;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class AuthService {

    private final AssociateRepository associateRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public AuthService(AssociateRepository associateRepository, PasswordEncoder passwordEncoder, JwtService jwtService) {
        this.associateRepository = associateRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    public LoginResponse login(LoginRequest request) {
        Associate associate = associateRepository.findByEmail(request.email())
            .orElseThrow(InvalidCredentialsException::new);

        if (!passwordEncoder.matches(request.password(), associate.getPasswordHash())) {
            throw new InvalidCredentialsException();
        }

        String token = jwtService.generateToken(associate);
        return new LoginResponse(token, associate.getId(), associate.getRole().name());
    }
}
```

Create `backend/src/main/java/com/plotchain/auth/AuthController.java`:

```java
package com.plotchain.auth;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/api/auth/login")
    public LoginResponse login(@RequestBody LoginRequest request) {
        return authService.login(request);
    }
}
```

Create `backend/src/main/java/com/plotchain/auth/SecurityConfig.java` (**permissive for now** — Task 4 locks it down once the JWT filter exists):

```java
package com.plotchain.auth;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth.anyRequest().permitAll());
        return http.build();
    }
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `mvn -f backend/pom.xml test -Dtest=AuthServiceTest,AuthControllerTest`
Expected: PASS (5/5)

- [ ] **Step 5: Commit**

```bash
git add backend/pom.xml \
        backend/src/main/java/com/plotchain/auth/LoginRequest.java \
        backend/src/main/java/com/plotchain/auth/LoginResponse.java \
        backend/src/main/java/com/plotchain/auth/InvalidCredentialsException.java \
        backend/src/main/java/com/plotchain/auth/AuthExceptionHandler.java \
        backend/src/main/java/com/plotchain/auth/AuthService.java \
        backend/src/main/java/com/plotchain/auth/AuthController.java \
        backend/src/main/java/com/plotchain/auth/SecurityConfig.java \
        backend/src/test/java/com/plotchain/auth/AuthServiceTest.java \
        backend/src/test/java/com/plotchain/auth/AuthControllerTest.java
git commit -m "feat: add POST /api/auth/login (security permissive pending Task 4)"
```

---

### Task 4: Security filter wiring — lock it down

**Files:**
- Create: `backend/src/main/java/com/plotchain/auth/JwtAuthenticationFilter.java`
- Modify: `backend/src/main/java/com/plotchain/auth/SecurityConfig.java`
- Create: `backend/src/test/java/com/plotchain/auth/JwtAuthenticationFilterTest.java`

**Interfaces:**
- Consumes: `JwtService` (Task 2).
- Produces: after this task, every request except `POST /api/auth/login` requires a valid `Authorization: Bearer <token>` header. `SecurityContextHolder`'s `Authentication.getPrincipal()` is the associate's `UUID`; its authorities are plain `"ADMIN"`/`"ASSOCIATE"` strings (no `ROLE_` prefix — use `hasAuthority(...)`, not `hasRole(...)`, in any future `@PreAuthorize`).

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/plotchain/auth/JwtAuthenticationFilterTest.java`:

```java
package com.plotchain.auth;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRole;
import jakarta.servlet.FilterChain;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class JwtAuthenticationFilterTest {

    JwtService jwtService = new JwtService("test-secret-key-at-least-32-bytes-long-for-hs256", 60);
    JwtAuthenticationFilter filter = new JwtAuthenticationFilter(jwtService);

    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void populatesSecurityContextForAValidToken() throws Exception {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(AssociateRole.ADMIN);
        String token = jwtService.generateToken(associate);

        HttpServletRequest request = Mockito.mock(HttpServletRequest.class);
        HttpServletResponse response = Mockito.mock(HttpServletResponse.class);
        FilterChain chain = Mockito.mock(FilterChain.class);
        when(request.getHeader("Authorization")).thenReturn("Bearer " + token);

        filter.doFilterInternal(request, response, chain);

        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        assertThat(auth).isNotNull();
        assertThat(auth.getPrincipal()).isEqualTo(associate.getId());
        assertThat(auth.getAuthorities()).extracting(Object::toString).containsExactly("ADMIN");
        verify(chain).doFilter(request, response);
    }

    @Test
    void leavesSecurityContextEmptyWhenNoAuthorizationHeaderIsPresent() throws Exception {
        HttpServletRequest request = Mockito.mock(HttpServletRequest.class);
        HttpServletResponse response = Mockito.mock(HttpServletResponse.class);
        FilterChain chain = Mockito.mock(FilterChain.class);
        when(request.getHeader("Authorization")).thenReturn(null);

        filter.doFilterInternal(request, response, chain);

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        verify(chain).doFilter(request, response);
    }
}
```

- [ ] **Step 2: Run it and confirm it fails to compile**

Run: `mvn -f backend/pom.xml test -Dtest=JwtAuthenticationFilterTest`
Expected: COMPILE ERROR — `JwtAuthenticationFilter` doesn't exist yet.

- [ ] **Step 3: Add the filter, then lock down SecurityConfig**

Create `backend/src/main/java/com/plotchain/auth/JwtAuthenticationFilter.java`:

```java
package com.plotchain.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final String BEARER_PREFIX = "Bearer ";

    private final JwtService jwtService;

    public JwtAuthenticationFilter(JwtService jwtService) {
        this.jwtService = jwtService;
    }

    @Override
    protected void doFilterInternal(
        @NonNull HttpServletRequest request,
        @NonNull HttpServletResponse response,
        @NonNull FilterChain filterChain
    ) throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith(BEARER_PREFIX)) {
            String token = header.substring(BEARER_PREFIX.length());
            if (jwtService.isTokenValid(token)) {
                UUID associateId = jwtService.extractAssociateId(token);
                String role = jwtService.extractRole(token).name();
                var authentication = new UsernamePasswordAuthenticationToken(
                    associateId, null, List.of(new SimpleGrantedAuthority(role)));
                SecurityContextHolder.getContext().setAuthentication(authentication);
            }
        }
        filterChain.doFilter(request, response);
    }
}
```

Replace `backend/src/main/java/com/plotchain/auth/SecurityConfig.java` with:

```java
package com.plotchain.auth;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;

    public SecurityConfig(JwtAuthenticationFilter jwtAuthenticationFilter) {
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/auth/login").permitAll()
                .anyRequest().authenticated())
            .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `mvn -f backend/pom.xml test -Dtest=JwtAuthenticationFilterTest`
Expected: PASS (2/2)

Note: this step tightens security globally, which will break `DashboardControllerTest` (no `Authorization` header sent) until Task 5 updates it — expected, not a regression to chase down now.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/auth/JwtAuthenticationFilter.java \
        backend/src/main/java/com/plotchain/auth/SecurityConfig.java \
        backend/src/test/java/com/plotchain/auth/JwtAuthenticationFilterTest.java
git commit -m "feat: wire JWT authentication filter, lock down SecurityConfig"
```

---

### Task 5: Fix the actual bug — dashboard route derives associate id from the token

**Files:**
- Modify: `backend/src/main/java/com/plotchain/dashboard/DashboardController.java`
- Modify: `backend/src/test/java/com/plotchain/dashboard/DashboardControllerTest.java`
- Modify: `backend/src/main/java/com/plotchain/auth/SecurityConfig.java` — **added mid-execution.** Task 4's config registers no `AuthenticationEntryPoint`, and with neither `httpBasic()` nor `formLogin()` enabled, Spring Security 6 falls back to `Http403ForbiddenEntryPoint` — so an unauthenticated request gets 403, not 401. Task 5's `returns401WithoutAToken` is the first test in the repo to exercise that path, which is why it surfaced here. This is load-bearing, not cosmetic: Task 6's HTTP interceptor keys off `error.status === 401` to clear auth and redirect to `/login`, so a 403 would silently break session-expiry UX. It also keeps 401 ("no/invalid credentials") distinguishable from 403 ("authenticated but not permitted"), which the documented admin-write policy will need later. Fix: `.exceptionHandling(ex -> ex.authenticationEntryPoint((request, response, authException) -> response.sendError(HttpServletResponse.SC_UNAUTHORIZED)))`.

**Interfaces:**
- Consumes: `JwtService` (Task 2), the security filter chain (Task 4).
- Produces: `GET /api/associates/me/dashboard` (was `/api/associates/{associateId}/dashboard`), associate id resolved via `@AuthenticationPrincipal UUID associateId`.

- [ ] **Step 1: Update the test first — new URL, real auth header, mock repository interfaces instead of the concrete `DashboardService`**

Replace `backend/src/test/java/com/plotchain/dashboard/DashboardControllerTest.java` with:

```java
package com.plotchain.dashboard;

import com.plotchain.announcement.AnnouncementRepository;
import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.auth.JwtService;
import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleRepository;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.income.LedgerEntryRepository;
import com.plotchain.legvolume.LegVolume;
import com.plotchain.legvolume.LegVolumeRepository;
import com.plotchain.rank.RankTier;
import com.plotchain.rank.RankTierRepository;
import com.plotchain.wallet.Wallet;
import com.plotchain.wallet.WalletRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// @MockBean on the 7 repository INTERFACES (not on the concrete DashboardService) so this
// runs a real DashboardService inside a real Spring Security filter chain — proving auth
// actually gates this route — while avoiding the JDK25/ByteBuddy concrete-class-mocking
// issue entirely (interfaces mock fine; see AuthControllerTest/DashboardServiceTest).
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class DashboardControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;
    @MockBean RankTierRepository rankTierRepository;
    @MockBean CycleRepository cycleRepository;
    @MockBean LedgerEntryRepository ledgerEntryRepository;
    @MockBean LegVolumeRepository legVolumeRepository;
    @MockBean WalletRepository walletRepository;
    @MockBean AnnouncementRepository announcementRepository;

    private String tokenFor(UUID associateId) {
        Associate token = new Associate();
        token.setId(associateId);
        token.setRole(AssociateRole.ASSOCIATE);
        return jwtService.generateToken(token);
    }

    @Test
    void returnsDashboardJsonForTheAuthenticatedAssociate() throws Exception {
        UUID associateId = UUID.randomUUID();
        UUID cycleId = UUID.randomUUID();
        UUID currentRankId = UUID.randomUUID();

        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setRankId(currentRankId);
        associate.setKycStatus(KycStatus.VERIFIED);
        associate.setCumulativeMatchedVolume(BigDecimal.ZERO);

        Cycle cycle = new Cycle();
        cycle.setId(cycleId);
        cycle.setStatus(CycleStatus.OPEN);
        cycle.setPeriodStart(LocalDate.now().minusDays(5));
        cycle.setPeriodEnd(LocalDate.now().plusDays(10));

        RankTier currentRank = new RankTier(currentRankId, "Sales Associate", 1, BigDecimal.valueOf(5000));

        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)).thenReturn(Optional.of(cycle));
        when(ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(any(), any(), any())).thenReturn(BigDecimal.ZERO);
        when(ledgerEntryRepository.sumNetAmountByAssociateAndCycle(any(), any())).thenReturn(BigDecimal.ZERO);
        when(legVolumeRepository.findByAssociateIdAndCycleId(any(), any()))
            .thenReturn(Optional.of(LegVolume.empty(associateId, cycleId)));
        when(walletRepository.findById(associateId)).thenReturn(Optional.of(Wallet.zero(associateId)));
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(currentRank));
        when(associateRepository.countDownline(any())).thenReturn(12L);
        when(associateRepository.countActiveToday(any(), any())).thenReturn(3L);
        when(associateRepository.countJoinedBetween(any(), any(), any())).thenReturn(2L);
        when(announcementRepository.findTop5ByOrderByPublishedAtDesc()).thenReturn(List.of());

        mockMvc.perform(get("/api/associates/me/dashboard")
                .header("Authorization", "Bearer " + tokenFor(associateId)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.teamSnapshot.totalDownline").value(12));
    }

    @Test
    void returns401WithoutAToken() throws Exception {
        mockMvc.perform(get("/api/associates/me/dashboard"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void returns404WhenAssociateNotFound() throws Exception {
        UUID associateId = UUID.randomUUID();
        when(associateRepository.findById(associateId)).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/associates/me/dashboard")
                .header("Authorization", "Bearer " + tokenFor(associateId)))
            .andExpect(status().isNotFound());
    }

    @Test
    void returns409WhenNoOpenCycle() throws Exception {
        UUID associateId = UUID.randomUUID();
        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setRankId(UUID.randomUUID());
        associate.setKycStatus(KycStatus.VERIFIED);
        associate.setCumulativeMatchedVolume(BigDecimal.ZERO);
        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/associates/me/dashboard")
                .header("Authorization", "Bearer " + tokenFor(associateId)))
            .andExpect(status().isConflict());
    }
}
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `mvn -f backend/pom.xml test -Dtest=DashboardControllerTest`
Expected: FAIL — route is still `/api/associates/{associateId}/dashboard` (404 on the new URL) and `@MockBean DashboardService` no longer exists in this file to satisfy the old wiring.

- [ ] **Step 3: Fix the controller**

Replace `backend/src/main/java/com/plotchain/dashboard/DashboardController.java` with:

```java
package com.plotchain.dashboard;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
public class DashboardController {

    private final DashboardService dashboardService;

    public DashboardController(DashboardService dashboardService) {
        this.dashboardService = dashboardService;
    }

    @GetMapping("/api/associates/me/dashboard")
    public DashboardResponse getDashboard(@AuthenticationPrincipal UUID associateId) {
        return dashboardService.getDashboard(associateId);
    }
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `mvn -f backend/pom.xml test -Dtest=DashboardControllerTest`
Expected: PASS (4/4) — this test now runs green in this environment (no more JDK25/ByteBuddy failure), since nothing here mocks a concrete class.

- [ ] **Step 5: Run the full backend suite**

Run: `mvn -f backend/pom.xml test`
Expected: PASS — all backend tests green.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/plotchain/dashboard/DashboardController.java \
        backend/src/test/java/com/plotchain/dashboard/DashboardControllerTest.java
git commit -m "fix: resolve dashboard associate id from JWT instead of a client-supplied path variable"
```

---

### Task 6: Frontend auth feature (login, guard, interceptor)

**Files:**
- Create: `frontend/src/app/auth/models/login-request.model.ts`
- Create: `frontend/src/app/auth/models/login-response.model.ts`
- Create: `frontend/src/app/auth/auth.service.ts`
- Create: `frontend/src/app/auth/auth.service.spec.ts`
- Create: `frontend/src/app/auth/auth.guard.ts`
- Create: `frontend/src/app/auth/auth.guard.spec.ts`
- Create: `frontend/src/app/auth/auth.interceptor.ts`
- Create: `frontend/src/app/auth/auth.interceptor.spec.ts`
- Create: `frontend/src/app/auth/login.component.ts`
- Create: `frontend/src/app/auth/login.component.spec.ts`

**Interfaces:**
- Produces: `AuthService.login(email, password): Observable<LoginResponse>`, `.logout()`, `.getToken(): string | null`, `.isAuthenticated(): boolean`. `authGuard: CanActivateFn`. `authInterceptor: HttpInterceptorFn`. `LoginComponent` (standalone).

- [ ] **Step 1: Create the models**

Create `frontend/src/app/auth/models/login-request.model.ts`:

```ts
export interface LoginRequest {
  email: string;
  password: string;
}
```

Create `frontend/src/app/auth/models/login-response.model.ts`:

```ts
export interface LoginResponse {
  token: string;
  associateId: string;
  role: string;
}
```

- [ ] **Step 2: Write the failing test for `AuthService`**

Create `frontend/src/app/auth/auth.service.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { LoginResponse } from './models/login-response.model';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [AuthService]
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('logs in and stores the returned token', () => {
    const mockResponse: LoginResponse = { token: 'abc.def.ghi', associateId: 'assoc-1', role: 'ASSOCIATE' };

    service.login('jane@plotchain.test', 'Password123!').subscribe(res => {
      expect(res.token).toBe('abc.def.ghi');
    });

    const req = httpMock.expectOne('/api/auth/login');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'jane@plotchain.test', password: 'Password123!' });
    req.flush(mockResponse);

    expect(service.getToken()).toBe('abc.def.ghi');
    expect(service.isAuthenticated()).toBeTrue();
  });

  it('reports not authenticated when no token is stored', () => {
    expect(service.isAuthenticated()).toBeFalse();
  });

  it('clears the token on logout', () => {
    localStorage.setItem('plotchain.auth.token', 'some-token');
    service.logout();
    expect(service.getToken()).toBeNull();
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include='**/auth.service.spec.ts'`
Expected: FAIL — `AuthService` doesn't exist.

- [ ] **Step 4: Create `AuthService`**

Create `frontend/src/app/auth/auth.service.ts`:

```ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { LoginRequest } from './models/login-request.model';
import { LoginResponse } from './models/login-response.model';

const TOKEN_KEY = 'plotchain.auth.token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  constructor(private http: HttpClient) {}

  login(email: string, password: string): Observable<LoginResponse> {
    const request: LoginRequest = { email, password };
    return this.http.post<LoginResponse>('/api/auth/login', request).pipe(
      tap(response => localStorage.setItem(TOKEN_KEY, response.token))
    );
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
  }

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  isAuthenticated(): boolean {
    return this.getToken() !== null;
  }
}
```

- [ ] **Step 5: Run it and confirm it passes**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include='**/auth.service.spec.ts'`
Expected: PASS (3/3)

- [ ] **Step 6: Write the failing test for `authGuard`**

Create `frontend/src/app/auth/auth.guard.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { authGuard } from './auth.guard';
import { AuthService } from './auth.service';

describe('authGuard', () => {
  let authService: jasmine.SpyObj<AuthService>;

  beforeEach(() => {
    authService = jasmine.createSpyObj('AuthService', ['isAuthenticated']);
    TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      providers: [{ provide: AuthService, useValue: authService }]
    });
  });

  it('allows navigation when authenticated', () => {
    authService.isAuthenticated.and.returnValue(true);
    const result = TestBed.runInInjectionContext(() => authGuard({} as any, {} as any));
    expect(result).toBeTrue();
  });

  it('redirects to /login when not authenticated', () => {
    authService.isAuthenticated.and.returnValue(false);
    const router = TestBed.inject(Router);
    const result = TestBed.runInInjectionContext(() => authGuard({} as any, {} as any)) as UrlTree;
    expect(result.toString()).toBe(router.parseUrl('/login').toString());
  });
});
```

- [ ] **Step 7: Run it and confirm it fails**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include='**/auth.guard.spec.ts'`
Expected: FAIL — `authGuard` doesn't exist.

- [ ] **Step 8: Create `authGuard`**

Create `frontend/src/app/auth/auth.guard.ts`:

```ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  return authService.isAuthenticated() ? true : router.parseUrl('/login');
};
```

- [ ] **Step 9: Run it and confirm it passes**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include='**/auth.guard.spec.ts'`
Expected: PASS (2/2)

- [ ] **Step 10: Write the failing test for `authInterceptor`**

Create `frontend/src/app/auth/auth.interceptor.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { Router } from '@angular/router';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

describe('authInterceptor', () => {
  let httpClient: HttpClient;
  let httpMock: HttpTestingController;
  let authService: AuthService;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting()
      ]
    });
    httpClient = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    authService = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
  });

  afterEach(() => httpMock.verify());

  it('attaches the bearer token when one is present', () => {
    spyOn(authService, 'getToken').and.returnValue('abc.def.ghi');

    httpClient.get('/api/associates/me/dashboard').subscribe();

    const req = httpMock.expectOne('/api/associates/me/dashboard');
    expect(req.request.headers.get('Authorization')).toBe('Bearer abc.def.ghi');
    req.flush({});
  });

  it('logs out and redirects to /login on a 401 response', () => {
    spyOn(authService, 'getToken').and.returnValue('abc.def.ghi');
    spyOn(authService, 'logout');
    spyOn(router, 'navigate');

    httpClient.get('/api/associates/me/dashboard').subscribe({ error: () => {} });

    const req = httpMock.expectOne('/api/associates/me/dashboard');
    req.flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(authService.logout).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });
});
```

- [ ] **Step 11: Run it and confirm it fails**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include='**/auth.interceptor.spec.ts'`
Expected: FAIL — `authInterceptor` doesn't exist.

- [ ] **Step 12: Create `authInterceptor`**

Create `frontend/src/app/auth/auth.interceptor.ts`:

```ts
import { inject } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const token = authService.getToken();

  const authorizedReq = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authorizedReq).pipe(
    catchError(error => {
      if (error.status === 401) {
        authService.logout();
        router.navigate(['/login']);
      }
      return throwError(() => error);
    })
  );
};
```

- [ ] **Step 13: Run it and confirm it passes**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include='**/auth.interceptor.spec.ts'`
Expected: PASS (2/2)

- [ ] **Step 14: Write the failing test for `LoginComponent`**

Create `frontend/src/app/auth/login.component.spec.ts`:

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { LoginComponent } from './login.component';

describe('LoginComponent', () => {
  let fixture: ComponentFixture<LoginComponent>;
  let httpMock: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginComponent, HttpClientTestingModule, RouterTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    spyOn(router, 'navigate');
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('navigates to /dashboard on successful login', () => {
    fixture.componentInstance.form.setValue({ email: 'jane@plotchain.test', password: 'Password123!' });
    fixture.componentInstance.onSubmit();

    const req = httpMock.expectOne('/api/auth/login');
    req.flush({ token: 'abc.def.ghi', associateId: 'assoc-1', role: 'ASSOCIATE' });

    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('shows an error on failed login', () => {
    fixture.componentInstance.form.setValue({ email: 'jane@plotchain.test', password: 'wrong' });
    fixture.componentInstance.onSubmit();

    const req = httpMock.expectOne('/api/auth/login');
    req.flush({ error: 'Invalid email or password' }, { status: 401, statusText: 'Unauthorized' });

    expect(fixture.componentInstance.error).toBeTrue();
  });
});
```

- [ ] **Step 15: Run it and confirm it fails**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include='**/login.component.spec.ts'`
Expected: FAIL — `LoginComponent` doesn't exist.

- [ ] **Step 16: Create `LoginComponent`**

Create `frontend/src/app/auth/login.component.ts`:

```ts
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule],
  template: `
    <form class="login-form" [formGroup]="form" (ngSubmit)="onSubmit()">
      <label>
        {{ 'auth.emailLabel' | translate }}
        <input type="email" formControlName="email" />
      </label>
      <label>
        {{ 'auth.passwordLabel' | translate }}
        <input type="password" formControlName="password" />
      </label>
      <button type="submit" [disabled]="form.invalid">{{ 'auth.loginButton' | translate }}</button>
      <div class="login-error" *ngIf="error">{{ 'auth.loginError' | translate }}</div>
    </form>
  `
})
export class LoginComponent {
  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required]
  });
  error = false;

  constructor(private fb: FormBuilder, private authService: AuthService, private router: Router) {}

  onSubmit(): void {
    if (this.form.invalid) {
      return;
    }
    const { email, password } = this.form.getRawValue();
    this.authService.login(email!, password!).subscribe({
      next: () => this.router.navigate(['/dashboard']),
      error: () => this.error = true
    });
  }
}
```

- [ ] **Step 17: Run it and confirm it passes**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include='**/login.component.spec.ts'`
Expected: PASS (2/2)

- [ ] **Step 18: Commit**

```bash
git add frontend/src/app/auth
git commit -m "feat: add frontend login (AuthService, authGuard, authInterceptor, LoginComponent)"
```

---

### Task 7: Wire it up — routes, config, dashboard param removal, i18n

**Files:**
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/app.config.ts`
- Modify: `frontend/src/app/dashboard/dashboard.service.ts`
- Modify: `frontend/src/app/dashboard/dashboard.service.spec.ts`
- Modify: `frontend/src/app/dashboard/dashboard.component.ts`
- Modify: `frontend/src/app/dashboard/dashboard.component.spec.ts`
- Modify: `frontend/src/assets/i18n/en.json`
- Modify: `frontend/src/assets/i18n/hi.json`

**Interfaces:**
- Consumes: `LoginComponent`, `authGuard`, `authInterceptor` (Task 6).
- Produces: `DashboardService.getDashboard()` (no param, was `getDashboard(associateId: string)`).

- [ ] **Step 1: Update the dashboard tests first to the new (no-param) shape**

Replace `frontend/src/app/dashboard/dashboard.service.spec.ts` with:

```ts
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

  it("fetches the authenticated associate's dashboard", () => {
    const mockResponse: Partial<DashboardResponse> = { kycPendingBannerVisible: false };

    service.getDashboard().subscribe(res => {
      expect(res.kycPendingBannerVisible).toBeFalse();
    });

    const req = httpMock.expectOne('/api/associates/me/dashboard');
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });
});
```

Replace `frontend/src/app/dashboard/dashboard.component.spec.ts` with:

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
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
      imports: [DashboardComponent, HttpClientTestingModule, RouterTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    const req = httpMock.expectOne('/api/associates/me/dashboard');
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

- [ ] **Step 2: Run them and confirm they fail**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include='**/dashboard.service.spec.ts' --include='**/dashboard.component.spec.ts'`
Expected: FAIL — `getDashboard()` still requires an argument, and requests still hit the old `/api/associates/assoc-1/dashboard`-style URL.

- [ ] **Step 3: Update `DashboardService` and `DashboardComponent`, wire routes/config, add i18n**

Replace `frontend/src/app/dashboard/dashboard.service.ts` with:

```ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { DashboardResponse } from './models/dashboard-response.model';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  constructor(private http: HttpClient) {}

  getDashboard(): Observable<DashboardResponse> {
    return this.http.get<DashboardResponse>('/api/associates/me/dashboard');
  }
}
```

Replace `frontend/src/app/dashboard/dashboard.component.ts` with:

```ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
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
    CommonModule, TranslateModule, KycBannerComponent, CycleIncomeCardComponent, WalletCardComponent,
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
    <div class="dashboard-error" *ngIf="error">{{ 'dashboard.loadError' | translate }}</div>
  `
})
export class DashboardComponent implements OnInit {
  dashboard: DashboardResponse | null = null;
  error: boolean = false;

  constructor(private dashboardService: DashboardService) {}

  ngOnInit(): void {
    this.dashboardService.getDashboard().subscribe({
      next: d => this.dashboard = d,
      error: () => this.error = true
    });
  }
}
```

Replace `frontend/src/app/app.routes.ts` with:

```ts
import { Routes } from '@angular/router';
import { DashboardComponent } from './dashboard/dashboard.component';
import { LoginComponent } from './auth/login.component';
import { authGuard } from './auth/auth.guard';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'dashboard', component: DashboardComponent, canActivate: [authGuard] },
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' }
];
```

Replace `frontend/src/app/app.config.ts` with:

```ts
import { ApplicationConfig, provideZoneChangeDetection, importProvidersFrom } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpClient } from '@angular/common/http';
import { TranslateModule, TranslateLoader } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';

import { routes } from './app.routes';
import { authInterceptor } from './auth/auth.interceptor';

export function httpLoaderFactory(http: HttpClient) {
  return new TranslateHttpLoader(http, '/assets/i18n/', '.json');
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    importProvidersFrom(
      TranslateModule.forRoot({
        defaultLanguage: 'en',
        loader: { provide: TranslateLoader, useFactory: httpLoaderFactory, deps: [HttpClient] }
      })
    )
  ]
};
```

In `frontend/src/assets/i18n/en.json`, add an `"auth"` namespace alongside the existing `"dashboard"` one:

```json
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
    "cycleCloses": "Cycle closes in {{days}} days",
    "leftLeg": "L",
    "rightLeg": "R",
    "loadError": "Something went wrong loading your dashboard. Please try again."
  },
  "auth": {
    "emailLabel": "Email",
    "passwordLabel": "Password",
    "loginButton": "Log In",
    "loginError": "Invalid email or password. Please try again."
  }
}
```

In `frontend/src/assets/i18n/hi.json`, add the parallel `"auth"` namespace:

```json
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
    "cycleCloses": "साइकिल {{days}} दिनों में बंद होगी",
    "leftLeg": "बायाँ",
    "rightLeg": "दायाँ",
    "loadError": "आपका डैशबोर्ड लोड करने में समस्या हुई। कृपया पुनः प्रयास करें।"
  },
  "auth": {
    "emailLabel": "ईमेल",
    "passwordLabel": "पासवर्ड",
    "loginButton": "लॉग इन करें",
    "loginError": "ईमेल या पासवर्ड गलत है। कृपया पुनः प्रयास करें।"
  }
}
```

- [ ] **Step 4: Run the frontend tests and confirm they pass**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless`
Expected: PASS — full frontend suite green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/app.routes.ts frontend/src/app/app.config.ts \
        frontend/src/app/dashboard/dashboard.service.ts \
        frontend/src/app/dashboard/dashboard.service.spec.ts \
        frontend/src/app/dashboard/dashboard.component.ts \
        frontend/src/app/dashboard/dashboard.component.spec.ts \
        frontend/src/assets/i18n/en.json frontend/src/assets/i18n/hi.json
git commit -m "feat: wire login route/guard/interceptor, drop associateId param from dashboard"
```
