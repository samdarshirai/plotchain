# Announcements Unit 1: Admin Composes and Publishes an Announcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An ADMIN can `POST /api/admin/announcements` with `{title, body}` and get back the stored, immediately-live announcement (201); the `Announcement` entity and `AnnouncementRepository` are recreated against the existing `announcement` table.

**Architecture:** No migration: the `announcement` table from `V1__create_dashboard_tables.sql` already has every column. New package `com.plotchain.announcement` (deleted in commit `a018129`) gets the entity, a bare repository, two DTOs, `AnnouncementService.compose`, and a POST-only `AnnouncementController`. No `SecurityConfig` edit, no exception handler (the only failure is bean validation, already mapped by the global `ApiExceptionHandler.handleValidationFailure`), no audit logging (user decision).

**Tech Stack:** Spring Boot 3 / JPA (`ddl-auto: validate`) / Flyway / H2 PostgreSQL mode (tests) / JUnit5 + Mockito + AssertJ + MockMvc.

**Spec:** `docs/superpowers/specs/role-capability/2026-08-03-announcements-domain-design.md` (Decisions 2, 3, 4; Data model; Flows "Compose & publish"; Error handling; Testing; Context corrected 2026-10-08). Unit source: `docs/superpowers/plans/2026-08-03-announcements-units.md`, unit 1.

## Global Constraints

- Table (verified in `V1__create_dashboard_tables.sql`, no later migration touches it): `id UUID PK`, `title VARCHAR(300) NOT NULL`, `body TEXT NOT NULL`, `published_at TIMESTAMP NOT NULL`, `audience VARCHAR(50) NOT NULL DEFAULT 'ALL'`, index `idx_announcement_published`. **No migration**; do not add `V44`.
- Entity mapping must match exactly for Hibernate `validate`: `Instant publishedAt` -> `@Column(name = "published_at")` (same Instant-on-TIMESTAMP mapping `SupportTicket` uses); other fields map by name. Original (deleted) entity for reference: `git show a018129^:backend/src/main/java/com/plotchain/announcement/Announcement.java`.
- Entity gets a `protected` no-arg constructor (JPA) plus `public Announcement(UUID id, String title, String body, Instant publishedAt, String audience)`, like `com.plotchain.rank.RankTier`. Getters only, no setters, no Lombok.
- `compose` always sets `publishedAt = Instant.now()` and `audience = "ALL"`, never from the request (Decision 2). Request has only `title`, `body`; unknown JSON fields (e.g. `audience`) are ignored.
- Create returns **201 Created** via `ResponseEntity.status(HttpStatus.CREATED)` (matches `AdminSupportTicketController.create`, `SaleController.record`, `BookingController.create`).
- `@PreAuthorize("hasAuthority('ADMIN')")` on the method as defense-in-depth; the blanket `POST /api/**` -> ADMIN rule (`SecurityConfig.java:290`, verified, declared before `anyRequest().authenticated()`) already covers the route. ASSOCIATE token 403, unauthenticated 401. **Do not edit `SecurityConfig.java`.**
- **No audit logging (user decision):** no `SettingsAuditService`, no new audit section, no CHECK change.
- Validation: `title` `@NotBlank @Size(max = 300)`, `body` `@NotBlank`; failures are 400 via the existing `ApiExceptionHandler`. No new exception type, no `AnnouncementExceptionHandler`.
- Backend test env noise: whole-module `mvn test` shows ~55 spurious Mockito errors (JDK21/25 mismatch) plus 4 pre-existing `JwtServiceTest`/`SecretsEncryptionServiceTest` failures. Do NOT run the whole suite; run only the classes named per task from `/Users/ronalisenapati/Ronali/plotchain/backend`. Mock interfaces only (`@Mock`/`@MockBean AnnouncementRepository`).
- Scope: this unit only. No `GET`, no paging, no `findAllByOrderByPublishedAtDesc`, no frontend.
- The plan author makes no commit. Commit steps are for the executor, each ending with the trailers `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01Qebsn6vZHDsjj8khCRiDEV`.

## Review Focus

- Entity must map to the real migrated table (a column/type mismatch only shows at boot as a `validate` failure): Task 1 `@DataJpaTest` saves and reloads a row through the real H2/Flyway schema.
- `title` of exactly 300 chars succeeds, 301 is a 400 (not a 500 from `VARCHAR(300)`): Task 3 controller tests.
- Whitespace-only `title` or `body` (`"   "`) is a 400: Task 3 test.
- Client-supplied `audience`/`publishedAt`/`id` in the JSON are ignored: Task 2 service test and Task 3 controller test (response `publishedAt` is server time, row `audience` stays `ALL`).
- Stored title/body are persisted verbatim (no trimming/truncation), and the long `body` (TEXT) is not length-limited: Task 2 test.
- Missing body / missing title (null, absent key) is a 400, not an NPE/500: Task 3 test.

## File Structure

Paths relative to `backend/src/main/java/com/plotchain/` (main) or `backend/src/test/java/com/plotchain/` (test).

- Create `announcement/Announcement.java`: entity.
- Create `announcement/AnnouncementRepository.java`: bare `JpaRepository<Announcement, UUID>`. **Unit 2 appends `Page<Announcement> findAllByOrderByPublishedAtDesc(Pageable pageable);` here.**
- Create `announcement/CreateAnnouncementRequest.java`, `announcement/AnnouncementResponse.java`: DTOs. `AnnouncementResponse.of(Announcement)` is the one shape unit 2's feed reuses.
- Create `announcement/AnnouncementService.java`: `compose` only. **Unit 2 adds `feed(page, size)` here** (plus `AnnouncementPageResponse`).
- Create `announcement/AnnouncementController.java`: no class-level mapping, because unit 2's `GET /api/announcements` and this `POST /api/admin/announcements` have different prefixes. Methods carry full paths. **Unit 2 appends the `@GetMapping("/api/announcements")` method here.**
- Tests: `announcement/AnnouncementSchemaTest.java`, `AnnouncementServiceTest.java`, `AnnouncementControllerTest.java` (new); `auth/SecurityConfigTest.java` (add rows only).

---

### Task 1: Entity, repository, real-schema test

**Files:**
- Create: `announcement/Announcement.java`, `announcement/AnnouncementRepository.java`
- Test: `announcement/AnnouncementSchemaTest.java` (`@DataJpaTest`)

**Interfaces:**
- Produces: `Announcement(UUID id, String title, String body, Instant publishedAt, String audience)` with getters `getId/getTitle/getBody/getPublishedAt/getAudience`; `interface AnnouncementRepository extends JpaRepository<Announcement, UUID>`.

- [ ] **Step 1: Write the failing test** `announcement/AnnouncementSchemaTest.java`

```java
package com.plotchain.announcement;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

// Real Flyway-migrated schema + ddl-auto: validate (application-test.yml): context start fails if
// the entity drifts from the V1 table, and the round trip proves every column is mapped.
@DataJpaTest
@ActiveProfiles("test")
class AnnouncementSchemaTest {

    @Autowired AnnouncementRepository announcementRepository;
    @Autowired TestEntityManager entityManager;
    @Autowired JdbcTemplate jdbc;

    @Test
    void entityRoundTripsThroughTheRealTable() {
        UUID id = UUID.randomUUID();
        Instant at = Instant.now().truncatedTo(ChronoUnit.MILLIS);
        String longBody = "b".repeat(5000); // body is TEXT, not VARCHAR(300)

        announcementRepository.saveAndFlush(new Announcement(id, "t".repeat(300), longBody, at, "ALL"));
        entityManager.clear();

        Announcement found = announcementRepository.findById(id).orElseThrow();
        assertThat(found.getTitle()).hasSize(300);
        assertThat(found.getBody()).isEqualTo(longBody);
        assertThat(found.getPublishedAt()).isEqualTo(at);
        assertThat(found.getAudience()).isEqualTo("ALL");
    }

    @Test
    void rowsInsertedWithoutAudienceGetTheColumnDefault() {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO announcement (id, title, body, published_at) VALUES (?, 't', 'b', CURRENT_TIMESTAMP)", id);
        assertThat(jdbc.queryForObject("SELECT audience FROM announcement WHERE id = ?", String.class, id)).isEqualTo("ALL");
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /Users/ronalisenapati/Ronali/plotchain/backend && mvn -q test -Dtest=AnnouncementSchemaTest`
Expected: COMPILE FAIL, `Announcement`/`AnnouncementRepository` not found.

- [ ] **Step 3: Implement**

`announcement/Announcement.java`:

```java
package com.plotchain.announcement;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "announcement")
public class Announcement {

    @Id
    private UUID id;
    private String title;
    private String body;
    @Column(name = "published_at", nullable = false)
    private Instant publishedAt;
    private String audience;

    protected Announcement() {}

    public Announcement(UUID id, String title, String body, Instant publishedAt, String audience) {
        this.id = id;
        this.title = title;
        this.body = body;
        this.publishedAt = publishedAt;
        this.audience = audience;
    }

    public UUID getId() { return id; }
    public String getTitle() { return title; }
    public String getBody() { return body; }
    public Instant getPublishedAt() { return publishedAt; }
    public String getAudience() { return audience; }
}
```

`announcement/AnnouncementRepository.java`:

```java
package com.plotchain.announcement;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

// Unit 2 appends: Page<Announcement> findAllByOrderByPublishedAtDesc(Pageable pageable);
public interface AnnouncementRepository extends JpaRepository<Announcement, UUID> {}
```

- [ ] **Step 4: Run to verify it passes**

Run: `mvn -q test -Dtest=AnnouncementSchemaTest`
Expected: PASS (2 tests). If Hibernate reports a schema-validation error, fix the entity mapping, never the migration.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/announcement backend/src/test/java/com/plotchain/announcement/AnnouncementSchemaTest.java
git commit -m "feat(announcements): recreate Announcement entity and repository on existing table"
```

---

### Task 2: DTOs and `AnnouncementService.compose`

**Files:**
- Create: `announcement/CreateAnnouncementRequest.java`, `announcement/AnnouncementResponse.java`, `announcement/AnnouncementService.java`
- Test: `announcement/AnnouncementServiceTest.java`

**Interfaces:**
- Consumes: Task 1 `Announcement` constructor/getters, `AnnouncementRepository`.
- Produces: `record CreateAnnouncementRequest(String title, String body)`; `record AnnouncementResponse(UUID id, String title, String body, Instant publishedAt)` with `static AnnouncementResponse of(Announcement)`; `AnnouncementService(AnnouncementRepository)` with `AnnouncementResponse compose(CreateAnnouncementRequest)`.

- [ ] **Step 1: Write the failing test** `announcement/AnnouncementServiceTest.java`

```java
package com.plotchain.announcement;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AnnouncementServiceTest {

    @Mock AnnouncementRepository announcementRepository;

    @Test
    void composePublishesNowToEveryoneAndReturnsTheStoredRow() {
        when(announcementRepository.save(any(Announcement.class))).thenAnswer(i -> i.getArgument(0));
        AnnouncementService service = new AnnouncementService(announcementRepository);
        Instant before = Instant.now().minus(1, ChronoUnit.SECONDS);

        AnnouncementResponse response = service.compose(new CreateAnnouncementRequest("  Holiday  ", "Office closed\nMonday"));

        ArgumentCaptor<Announcement> saved = ArgumentCaptor.forClass(Announcement.class);
        verify(announcementRepository).save(saved.capture());
        Announcement a = saved.getValue();
        assertThat(a.getId()).isNotNull();
        assertThat(a.getAudience()).isEqualTo("ALL");
        assertThat(a.getPublishedAt()).isBetween(before, Instant.now().plus(1, ChronoUnit.SECONDS));
        // verbatim: no trimming or truncation
        assertThat(a.getTitle()).isEqualTo("  Holiday  ");
        assertThat(a.getBody()).isEqualTo("Office closed\nMonday");
        assertThat(response).isEqualTo(AnnouncementResponse.of(a));
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `mvn -q test -Dtest=AnnouncementServiceTest`
Expected: COMPILE FAIL, types not found.

- [ ] **Step 3: Implement**

`announcement/CreateAnnouncementRequest.java`:

```java
package com.plotchain.announcement;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

// 300 matches announcement.title VARCHAR(300); body is TEXT, unbounded. audience/publishedAt are
// deliberately not request fields (spec Decision 2).
public record CreateAnnouncementRequest(
    @NotBlank @Size(max = 300) String title,
    @NotBlank String body
) {}
```

`announcement/AnnouncementResponse.java`:

```java
package com.plotchain.announcement;

import java.time.Instant;
import java.util.UUID;

// Unit 2's feed maps rows with of(...); audience is intentionally not exposed (spec Decision 2).
public record AnnouncementResponse(UUID id, String title, String body, Instant publishedAt) {
    public static AnnouncementResponse of(Announcement a) {
        return new AnnouncementResponse(a.getId(), a.getTitle(), a.getBody(), a.getPublishedAt());
    }
}
```

`announcement/AnnouncementService.java`:

```java
package com.plotchain.announcement;

import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.UUID;

// Unit 2 adds feed(page, size) here.
@Service
public class AnnouncementService {

    private final AnnouncementRepository announcementRepository;

    public AnnouncementService(AnnouncementRepository announcementRepository) {
        this.announcementRepository = announcementRepository;
    }

    public AnnouncementResponse compose(CreateAnnouncementRequest request) {
        Announcement saved = announcementRepository.save(
            new Announcement(UUID.randomUUID(), request.title(), request.body(), Instant.now(), "ALL"));
        return AnnouncementResponse.of(saved);
    }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `mvn -q test -Dtest=AnnouncementServiceTest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/announcement backend/src/test/java/com/plotchain/announcement/AnnouncementServiceTest.java
git commit -m "feat(announcements): compose service and DTOs"
```

---

### Task 3: POST controller, controller tests, SecurityConfigTest rows

**Files:**
- Create: `announcement/AnnouncementController.java`
- Test: `announcement/AnnouncementControllerTest.java` (new); Modify `auth/SecurityConfigTest.java` (append rows after the last support-ticket rows; imports `post`, `status`, `ObjectMapper`, `ParameterizedTest`, `EnumSource` already present)

**Interfaces:**
- Consumes: `AnnouncementService.compose`, `CreateAnnouncementRequest`, `AnnouncementResponse`.
- Produces: `POST /api/admin/announcements` -> 201 `AnnouncementResponse`.

- [ ] **Step 1: Write the failing tests**

`announcement/AnnouncementControllerTest.java` (shape copied from `AdminSupportTicketControllerTest`; only `AssociateRepository` is mocked for JWT auth, `AnnouncementRepository` is `@MockBean`):

```java
package com.plotchain.announcement;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.auth.JwtService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AnnouncementControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;
    @Autowired ObjectMapper objectMapper;

    @MockBean AssociateRepository associateRepository;
    @MockBean AnnouncementRepository announcementRepository;

    @BeforeEach
    void stubSave() {
        when(announcementRepository.save(any(Announcement.class))).thenAnswer(i -> i.getArgument(0));
    }

    private String tokenFor(AssociateRole role) {
        Associate principal = new Associate();
        principal.setId(UUID.randomUUID());
        principal.setRole(role);
        when(associateRepository.findById(principal.getId())).thenReturn(Optional.of(principal));
        return "Bearer " + jwtService.generateToken(principal);
    }

    private String json(String title, String body) throws Exception {
        Map<String, Object> m = new HashMap<>();
        if (title != null) m.put("title", title);
        if (body != null) m.put("body", body);
        return objectMapper.writeValueAsString(m);
    }

    private org.springframework.test.web.servlet.ResultActions compose(String content) throws Exception {
        return mockMvc.perform(post("/api/admin/announcements")
            .header("Authorization", tokenFor(AssociateRole.ADMIN))
            .contentType("application/json").content(content));
    }

    @Test
    void adminComposeReturns201WithTheLiveAnnouncement() throws Exception {
        compose(json("Holiday", "Office closed Monday"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.id").exists())
            .andExpect(jsonPath("$.title").value("Holiday"))
            .andExpect(jsonPath("$.body").value("Office closed Monday"))
            .andExpect(jsonPath("$.publishedAt").exists())
            .andExpect(jsonPath("$.audience").doesNotExist());
    }

    @Test
    void clientSuppliedAudienceAndPublishedAtAreIgnored() throws Exception {
        compose("{\"title\":\"t\",\"body\":\"b\",\"audience\":\"VIP\",\"publishedAt\":\"2000-01-01T00:00:00Z\"}")
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.publishedAt").value(org.hamcrest.Matchers.not(org.hamcrest.Matchers.startsWith("2000"))));
        org.mockito.ArgumentCaptor<Announcement> c = org.mockito.ArgumentCaptor.forClass(Announcement.class);
        verify(announcementRepository).save(c.capture());
        org.assertj.core.api.Assertions.assertThat(c.getValue().getAudience()).isEqualTo("ALL");
    }

    @Test
    void titleOf300CharsIsAccepted() throws Exception {
        compose(json("x".repeat(300), "b")).andExpect(status().isCreated());
    }

    @Test
    void titleOver300CharsIs400NotA500() throws Exception {
        compose(json("x".repeat(301), "b"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.fields.title").exists());
        verify(announcementRepository, never()).save(any());
    }

    @Test
    void blankOrMissingTitleIs400() throws Exception {
        compose(json("   ", "b")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.fields.title").exists());
        compose(json(null, "b")).andExpect(status().isBadRequest());
        verify(announcementRepository, never()).save(any());
    }

    @Test
    void blankOrMissingBodyIs400() throws Exception {
        compose(json("t", "")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.fields.body").exists());
        compose(json("t", null)).andExpect(status().isBadRequest());
        verify(announcementRepository, never()).save(any());
    }
}
```

Append to `auth/SecurityConfigTest.java` (after the last support-ticket test). `SecurityConfigTest` does not mock `AnnouncementRepository`, so ADMIN hits the real H2 table and gets a true 201:

```java
    // announcements unit 1 (Decision 4): POST /api/admin/announcements rides the blanket ADMIN write
    // rule plus @PreAuthorize; no dedicated matcher. ADMIN reaches the real controller and the real
    // (H2) announcement table and gets 201, proving the request passed the security layer. Every
    // other role is 403 at the filter.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminAnnouncementComposeIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        mockMvc.perform(post("/api/admin/announcements")
                .header("Authorization", "Bearer " + tokenFor(role))
                .contentType("application/json")
                .content("{\"title\":\"Hello\",\"body\":\"World\"}"))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 201 : 403));
    }

    @Test
    void adminAnnouncementComposeIsUnauthorizedWithoutAToken() throws Exception {
        mockMvc.perform(post("/api/admin/announcements")
                .contentType("application/json")
                .content("{\"title\":\"Hello\",\"body\":\"World\"}"))
            .andExpect(status().isUnauthorized());
    }
```

- [ ] **Step 2: Run to verify they fail**

Run: `mvn -q test -Dtest=AnnouncementControllerTest,SecurityConfigTest#adminAnnouncement*`
Expected: FAIL (404 / no handler for POST).

- [ ] **Step 3: Implement** `announcement/AnnouncementController.java`

```java
package com.plotchain.announcement;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

// Full paths on methods (no class-level mapping): unit 2 appends GET /api/announcements here, which
// does not share the /api/admin prefix.
@RestController
public class AnnouncementController {

    private final AnnouncementService announcementService;

    public AnnouncementController(AnnouncementService announcementService) {
        this.announcementService = announcementService;
    }

    // 201 like the other admin creates (AdminSupportTicketController.create, SaleController.record).
    // Defense-in-depth @PreAuthorize alongside the blanket POST /api/** -> ADMIN rule in SecurityConfig.
    @PostMapping("/api/admin/announcements")
    @PreAuthorize("hasAuthority('ADMIN')")
    public ResponseEntity<AnnouncementResponse> compose(@Valid @RequestBody CreateAnnouncementRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(announcementService.compose(request));
    }
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `mvn -q test -Dtest='AnnouncementSchemaTest,AnnouncementServiceTest,AnnouncementControllerTest,SecurityConfigTest'`
Expected: PASS in the new classes. Pre-existing noise in `SecurityConfigTest` (if any) is unrelated; compare against `git stash` baseline only if a non-announcement row fails.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/announcement backend/src/test/java/com/plotchain/announcement/AnnouncementControllerTest.java backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java
git commit -m "feat(announcements): admin compose endpoint POST /api/admin/announcements"
```

---

## Final verification (executor)

- `git diff --stat master` shows no change to `SecurityConfig.java`, no new file under `db/migration/`, no reference to `SettingsAuditService` in `announcement/`.
- Boot check (optional, real app): `Hibernate validate` passes at startup with the new entity (the `@DataJpaTest` already proves it against the same migrations).

## Self-Review

- Spec coverage: entity + all-args constructor (T1), repository (T1), compose flow + `audience="ALL"`/`publishedAt=now` (T2), 201 `AnnouncementResponse(id,title,body,publishedAt)` (T3), validation 400 via existing handler (T3), SecurityConfigTest associate 403 / admin 201 (T3). Feed, paging, `AnnouncementPageResponse` are unit 2.
- Spec deviation noted: the spec's testing section lists no schema test and says no repository test; the user asked for a real-DB mapping test because the entity was recreated, so T1 adds it.
- Type consistency: `Announcement` ctor argument order `(id, title, body, publishedAt, audience)` is used identically in T1 test, T2 service; `AnnouncementResponse.of` defined T2, used T2 test/T3.
