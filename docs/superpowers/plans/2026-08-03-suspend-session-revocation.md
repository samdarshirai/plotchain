# Suspend Session Revocation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Revoke a suspended associate's live JWT access on their next request, not just at their next login.

**Architecture:** `JwtAuthenticationFilter` gains a per-request associate-status check against a new `AssociateStatusCache` (an in-process Caffeine cache over `AssociateRepository`). `AdminAssociateService.suspend()`/`reactivate()` explicitly evict the cache entry so the check reflects the new status on the associate's very next request, with a 30s TTL as a safety net for any path that misses eviction.

**Tech Stack:** Java 21, Spring Boot 3.3.4, Spring Security, Caffeine (new dependency), JUnit 5 + Mockito + AssertJ.

## Global Constraints

- Fail closed: a cache miss where the associate can't be found in the DB (deleted, bad id) must be treated as not-active, never as active.
- No behavior change to `AuthService.login()` — it already checks `SUSPENDED` at login time; this plan only adds the per-request path.
- No frontend changes (out of scope per spec).
- No new DB tables, no `spring-boot-starter-cache` — use the Caffeine library directly so eviction can be called explicitly.

---

### Task 1: `AssociateStatusCache`

**Files:**
- Modify: `backend/pom.xml` (add Caffeine dependency)
- Create: `backend/src/main/java/com/plotchain/associate/AssociateStatusCache.java`
- Test: `backend/src/test/java/com/plotchain/associate/AssociateStatusCacheTest.java`

**Interfaces:**
- Consumes: `AssociateRepository.findById(UUID)` (existing, from `JpaRepository<Associate, UUID>`), `Associate.getStatus()` (existing).
- Produces: `AssociateStatusCache.isActive(UUID associateId): boolean`, `AssociateStatusCache.evict(UUID associateId): void` — consumed by Task 2 (`JwtAuthenticationFilter`) and Task 3 (`AdminAssociateService`).

- [ ] **Step 1: Add the Caffeine dependency**

Add inside `<dependencies>` in `backend/pom.xml`, after the `commons-csv` dependency block and before the `h2` test dependency:

```xml
    <dependency>
      <groupId>com.github.ben-manes.caffeine</groupId>
      <artifactId>caffeine</artifactId>
      <version>3.1.8</version>
    </dependency>
```

- [ ] **Step 2: Write the failing tests**

Create `backend/src/test/java/com/plotchain/associate/AssociateStatusCacheTest.java`:

```java
package com.plotchain.associate;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AssociateStatusCacheTest {

    @Mock AssociateRepository associateRepository;

    AssociateStatusCache cache;

    @BeforeEach
    void setUp() {
        cache = new AssociateStatusCache(associateRepository);
    }

    private Associate newAssociate(UUID id, AssociateStatus status) {
        Associate a = new Associate();
        a.setId(id);
        a.setStatus(status);
        return a;
    }

    @Test
    void isActiveReturnsTrueForAnActiveAssociate() {
        UUID id = UUID.randomUUID();
        when(associateRepository.findById(id)).thenReturn(Optional.of(newAssociate(id, AssociateStatus.ACTIVE)));

        assertThat(cache.isActive(id)).isTrue();
    }

    @Test
    void isActiveReturnsFalseForASuspendedAssociate() {
        UUID id = UUID.randomUUID();
        when(associateRepository.findById(id)).thenReturn(Optional.of(newAssociate(id, AssociateStatus.SUSPENDED)));

        assertThat(cache.isActive(id)).isFalse();
    }

    @Test
    void isActiveReturnsFalseWhenAssociateDoesNotExist() {
        UUID id = UUID.randomUUID();
        when(associateRepository.findById(id)).thenReturn(Optional.empty());

        assertThat(cache.isActive(id)).isFalse();
    }

    @Test
    void isActiveOnlyHitsTheRepositoryOnceBeforeEviction() {
        UUID id = UUID.randomUUID();
        when(associateRepository.findById(id)).thenReturn(Optional.of(newAssociate(id, AssociateStatus.ACTIVE)));

        cache.isActive(id);
        cache.isActive(id);

        verify(associateRepository, times(1)).findById(id);
    }

    @Test
    void evictForcesTheNextIsActiveCallToReReadTheRepository() {
        UUID id = UUID.randomUUID();
        when(associateRepository.findById(id))
            .thenReturn(Optional.of(newAssociate(id, AssociateStatus.ACTIVE)))
            .thenReturn(Optional.of(newAssociate(id, AssociateStatus.SUSPENDED)));

        assertThat(cache.isActive(id)).isTrue();
        cache.evict(id);
        assertThat(cache.isActive(id)).isFalse();

        verify(associateRepository, times(2)).findById(id);
    }
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && mvn -q -Dtest=AssociateStatusCacheTest test`
Expected: FAIL to compile — `AssociateStatusCache` does not exist yet.

- [ ] **Step 4: Implement `AssociateStatusCache`**

Create `backend/src/main/java/com/plotchain/associate/AssociateStatusCache.java`:

```java
package com.plotchain.associate;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.UUID;

/**
 * In-process cache of associate status, checked on every authenticated request so a
 * suspended associate's still-valid JWT stops working on their next request rather than
 * only at natural token expiry. AdminAssociateService evicts explicitly on suspend/reactivate;
 * the TTL here is only a safety net for any path that misses that eviction.
 */
@Component
public class AssociateStatusCache {

    private static final int MAX_ENTRIES = 10_000;
    private static final Duration TTL = Duration.ofSeconds(30);

    private final AssociateRepository associateRepository;
    private final Cache<UUID, AssociateStatus> cache;

    public AssociateStatusCache(AssociateRepository associateRepository) {
        this.associateRepository = associateRepository;
        this.cache = Caffeine.newBuilder()
            .expireAfterWrite(TTL)
            .maximumSize(MAX_ENTRIES)
            .build();
    }

    public boolean isActive(UUID associateId) {
        AssociateStatus status = cache.get(associateId, this::loadStatus);
        return status == AssociateStatus.ACTIVE;
    }

    public void evict(UUID associateId) {
        cache.invalidate(associateId);
    }

    private AssociateStatus loadStatus(UUID associateId) {
        return associateRepository.findById(associateId).map(Associate::getStatus).orElse(null);
    }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && mvn -q -Dtest=AssociateStatusCacheTest test`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/pom.xml backend/src/main/java/com/plotchain/associate/AssociateStatusCache.java backend/src/test/java/com/plotchain/associate/AssociateStatusCacheTest.java
git commit -m "feat(auth): add AssociateStatusCache for per-request status checks"
```

---

### Task 2: Wire the status check into `JwtAuthenticationFilter`

**Files:**
- Modify: `backend/src/main/java/com/plotchain/auth/JwtAuthenticationFilter.java`
- Modify: `backend/src/test/java/com/plotchain/auth/JwtAuthenticationFilterTest.java`

**Interfaces:**
- Consumes: `AssociateStatusCache.isActive(UUID): boolean` (Task 1).
- Produces: no new public interface — `JwtAuthenticationFilter`'s constructor now takes `(JwtService, AssociateStatusCache)`, which `SecurityConfig` picks up automatically via Spring's single-constructor autowiring (no change needed there).

- [ ] **Step 1: Write the failing test**

Add to `backend/src/test/java/com/plotchain/auth/JwtAuthenticationFilterTest.java`. Replace the existing field declarations and add a new test:

```java
package com.plotchain.auth;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.AssociateStatusCache;
import jakarta.servlet.FilterChain;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
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
    AssociateStatusCache associateStatusCache = Mockito.mock(AssociateStatusCache.class);
    JwtAuthenticationFilter filter;

    @BeforeEach
    void setUp() {
        filter = new JwtAuthenticationFilter(jwtService, associateStatusCache);
    }

    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void populatesSecurityContextForAValidTokenOfAnActiveAssociate() throws Exception {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(AssociateRole.ADMIN);
        String token = jwtService.generateToken(associate);
        when(associateStatusCache.isActive(associate.getId())).thenReturn(true);

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

    @Test
    void leavesSecurityContextEmptyForAValidTokenOfASuspendedAssociate() throws Exception {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(AssociateRole.ASSOCIATE);
        String token = jwtService.generateToken(associate);
        when(associateStatusCache.isActive(associate.getId())).thenReturn(false);

        HttpServletRequest request = Mockito.mock(HttpServletRequest.class);
        HttpServletResponse response = Mockito.mock(HttpServletResponse.class);
        FilterChain chain = Mockito.mock(FilterChain.class);
        when(request.getHeader("Authorization")).thenReturn("Bearer " + token);

        filter.doFilterInternal(request, response, chain);

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        verify(chain).doFilter(request, response);
    }
}
```

- [ ] **Step 2: Run tests to verify the new test fails**

Run: `cd backend && mvn -q -Dtest=JwtAuthenticationFilterTest test`
Expected: FAIL to compile — `JwtAuthenticationFilter(JwtService, AssociateStatusCache)` constructor does not exist yet.

- [ ] **Step 3: Update `JwtAuthenticationFilter`**

Replace `backend/src/main/java/com/plotchain/auth/JwtAuthenticationFilter.java` with:

```java
package com.plotchain.auth;

import com.plotchain.associate.AssociateStatusCache;
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

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final String BEARER_PREFIX = "Bearer ";

    private final JwtService jwtService;
    private final AssociateStatusCache associateStatusCache;

    public JwtAuthenticationFilter(JwtService jwtService, AssociateStatusCache associateStatusCache) {
        this.jwtService = jwtService;
        this.associateStatusCache = associateStatusCache;
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
            // Single parse/verify per request: a malformed-but-signed token (no role claim,
            // non-UUID subject) must fall through to "unauthenticated", never throw. A
            // well-formed token for a since-suspended associate falls through the same way --
            // AssociateStatusCache is what makes suspend take effect before the token expires.
            jwtService.authenticate(token).ifPresent(authenticated -> {
                if (!associateStatusCache.isActive(authenticated.associateId())) {
                    return;
                }
                var authentication = new UsernamePasswordAuthenticationToken(
                    authenticated.associateId(), null,
                    List.of(new SimpleGrantedAuthority(authenticated.role().name())));
                SecurityContextHolder.getContext().setAuthentication(authentication);
            });
        }
        filterChain.doFilter(request, response);
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && mvn -q -Dtest=JwtAuthenticationFilterTest test`
Expected: PASS (3 tests)

- [ ] **Step 5: Run the full backend test suite to check for regressions**

Run: `cd backend && mvn -q test`
Expected: PASS. `SecurityConfigTest` and any integration test that exercises an authenticated endpoint through the real filter chain will now go through a real `AssociateStatusCache` — if any such test fails because the associate it authenticates as isn't persisted/active in that test's H2 database, note the failure and fix the test's setup (e.g. persist the associate as `ACTIVE` before making the authenticated call) rather than weakening the filter.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/plotchain/auth/JwtAuthenticationFilter.java backend/src/test/java/com/plotchain/auth/JwtAuthenticationFilterTest.java
git commit -m "feat(auth): reject requests from suspended associates in JwtAuthenticationFilter"
```

---

### Task 3: Evict the cache on suspend/reactivate

**Files:**
- Modify: `backend/src/main/java/com/plotchain/associate/AdminAssociateService.java`
- Modify: `backend/src/test/java/com/plotchain/associate/AdminAssociateServiceTest.java`

**Interfaces:**
- Consumes: `AssociateStatusCache.evict(UUID): void` (Task 1).
- Produces: none — `AdminAssociateService`'s constructor gains an `AssociateStatusCache` parameter, used only by this test file and by Spring's autowiring.

- [ ] **Step 1: Write the failing tests**

In `backend/src/test/java/com/plotchain/associate/AdminAssociateServiceTest.java`:

`AssociateStatusCache` lives in the same package (`com.plotchain.associate`) as this test, so no new import is needed.

Add a new `@Mock` field alongside the existing ones:

```java
    @Mock AssociateStatusCache associateStatusCache;
```

Update the `setUp()` constructor call to pass it:

```java
        service = new AdminAssociateService(
            associateRepository, rankTierRepository, cycleRepository, legVolumeRepository,
            passwordEncoder, settingsAuditService, associateStatusCache);
```

Add two new test methods, placed after `suspendSetsStatusAndRecordsAudit` and `reactivateSetsStatusBackToActive` respectively:

```java
    @Test
    void suspendEvictsTheAssociateFromTheStatusCache() {
        UUID id = UUID.randomUUID();
        Associate associate = newAssociate(id, "VP00001");
        when(associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(associate));
        when(rankTierRepository.findById(rank.getId())).thenReturn(Optional.of(rank));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)).thenReturn(Optional.empty());

        service.suspend(id, ACTOR_ID);

        verify(associateStatusCache).evict(id);
    }

    @Test
    void reactivateEvictsTheAssociateFromTheStatusCache() {
        UUID id = UUID.randomUUID();
        Associate associate = newAssociate(id, "VP00001");
        associate.setStatus(AssociateStatus.SUSPENDED);
        when(associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(associate));
        when(rankTierRepository.findById(rank.getId())).thenReturn(Optional.of(rank));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)).thenReturn(Optional.empty());

        service.reactivate(id, ACTOR_ID);

        verify(associateStatusCache).evict(id);
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && mvn -q -Dtest=AdminAssociateServiceTest test`
Expected: FAIL to compile — `AdminAssociateService` constructor doesn't accept an `AssociateStatusCache` argument yet.

- [ ] **Step 3: Update `AdminAssociateService`**

In `backend/src/main/java/com/plotchain/associate/AdminAssociateService.java`:

Add the field and constructor parameter (edit the existing constructor and field block, `AdminAssociateService.java:27-51`):

```java
@Service
public class AdminAssociateService {

    private final AssociateRepository associateRepository;
    private final RankTierRepository rankTierRepository;
    private final CycleRepository cycleRepository;
    private final LegVolumeRepository legVolumeRepository;
    private final PasswordEncoder passwordEncoder;
    private final SettingsAuditService settingsAuditService;
    private final AssociateStatusCache associateStatusCache;

    public AdminAssociateService(
        AssociateRepository associateRepository,
        RankTierRepository rankTierRepository,
        CycleRepository cycleRepository,
        LegVolumeRepository legVolumeRepository,
        PasswordEncoder passwordEncoder,
        SettingsAuditService settingsAuditService,
        AssociateStatusCache associateStatusCache
    ) {
        this.associateRepository = associateRepository;
        this.rankTierRepository = rankTierRepository;
        this.cycleRepository = cycleRepository;
        this.legVolumeRepository = legVolumeRepository;
        this.passwordEncoder = passwordEncoder;
        this.settingsAuditService = settingsAuditService;
        this.associateStatusCache = associateStatusCache;
    }
```

Update `suspend` and `reactivate` (`AdminAssociateService.java:75-93`) to evict after saving:

```java
    @Transactional
    public AdminAssociateDetailResponse suspend(UUID id, UUID actorId) {
        Associate associate = findOrThrow(id);
        associate.setStatus(AssociateStatus.SUSPENDED);
        associateRepository.save(associate);
        associateStatusCache.evict(id);
        settingsAuditService.record("associate", "Suspended " + associate.getUserId(),
            Map.of("associateId", id.toString()), actorId);
        return toDetail(associate);
    }

    @Transactional
    public AdminAssociateDetailResponse reactivate(UUID id, UUID actorId) {
        Associate associate = findOrThrow(id);
        associate.setStatus(AssociateStatus.ACTIVE);
        associateRepository.save(associate);
        associateStatusCache.evict(id);
        settingsAuditService.record("associate", "Reactivated " + associate.getUserId(),
            Map.of("associateId", id.toString()), actorId);
        return toDetail(associate);
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && mvn -q -Dtest=AdminAssociateServiceTest test`
Expected: PASS (all tests in the file, including the two new ones)

- [ ] **Step 5: Run the full backend test suite**

Run: `cd backend && mvn -q test`
Expected: PASS. Any other test that constructs `AdminAssociateService` directly (check with `grep -rn "new AdminAssociateService(" backend/src/test` first) needs its constructor call updated to pass an `AssociateStatusCache` mock/instance the same way.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/plotchain/associate/AdminAssociateService.java backend/src/test/java/com/plotchain/associate/AdminAssociateServiceTest.java
git commit -m "feat(admin): evict associate status cache on suspend and reactivate"
```

---

### Task 4: Full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the entire backend test suite**

Run: `cd backend && mvn -q test`
Expected: PASS, zero failures.

- [ ] **Step 2: Confirm no other constructor call sites were missed**

Run: `grep -rn "new AdminAssociateService(\|new JwtAuthenticationFilter(" backend/src`
Expected: every match either matches the new 7-arg / 2-arg signatures, or is inside a test file already updated in Tasks 2–3. Fix any stragglers and re-run Step 1.

- [ ] **Step 3: Manual smoke check of the login-then-suspend flow (optional but recommended)**

This confirms the end-to-end behavior the whole plan exists for, beyond what unit tests assert in isolation:

1. Start the backend: `cd backend && mvn spring-boot:run` (profile `dev`).
2. Log in as an associate via `POST /api/auth/login`, capture the returned JWT.
3. Call any authenticated GET (e.g. `GET /api/associates/me` if it exists, or any `/api/admin/*` endpoint with an admin token) — confirm 200.
4. As an admin, call `POST /api/admin/associates/{id}/suspend` for that associate.
5. Re-call the same authenticated GET with the *original* JWT from step 2 — confirm 401, without waiting for token expiry.

If step 5 doesn't 401 immediately, stop and re-check the cache eviction wiring before considering this plan complete.
