# Announcements Unit 2: Paged Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Any authenticated user (ADMIN or ASSOCIATE) reads the announcement feed, newest first: `GET /api/announcements`, paged.

**Architecture:** Append to the merged unit-1 `com.plotchain.announcement` package: a repository finder with a deterministic tiebreak, `AnnouncementPageResponse`, `AnnouncementService.feed(page, size)`, and a `@GetMapping` in the existing `AnnouncementController` with no `@PreAuthorize`. Paging clamp lives in the controller, mirroring `AssociateSupportTicketController`. No `SecurityConfig` edit, no migration, no audit.

**Tech Stack:** Spring Boot, Spring Data JPA, Spring Security, JUnit 5, Mockito, MockMvc, `@DataJpaTest` (H2 + Flyway).

**Spec:** `docs/superpowers/specs/role-capability/2026-08-03-announcements-domain-design.md` (Decisions 1, 2, 4, 5; Data model; Flows "Read feed"; Testing; Context corrected 2026-10-08). Unit source: `docs/superpowers/plans/2026-08-03-announcements-units.md`, unit 2. Unit 1 plan (where the append markers are): `docs/superpowers/plans/2026-08-03-announcements-unit-1-compose.md`.

## Global Constraints

- Path exactly `GET /api/announcements`, standalone (not under `/api/admin/` or `/api/associates/`) (spec Decision 5).
- ADMIN and every associate role get 200; no/invalid JWT gets 401. NO `@PreAuthorize`, NO `SecurityConfig.java` change (Decision 4). Verified at plan time: the only `GET` matchers in `SecurityConfig` are exact paths under `/api/admin/*`, `/api/company/*`, and `/api/associates` (exact); none matches `/api/announcements`, and the blanket write rules are POST/PUT/PATCH/DELETE only, so a GET falls to `anyRequest().authenticated()`.
- Ordering `publishedAt` DESC with `id DESC` tiebreak (same as `SupportTicketRepository.searchQueue`'s `createdAt DESC, id DESC`).
- Paging convention (user-approved from support tickets, supersedes the spec's looser "page >= 0, size <= 100"): `page = Math.max(page, 0)`, `size = Math.max(Math.min(size, 100), 1)`, defaults `page=0`, `size=20`. The feed designs' ~10 per page is a frontend choice, not a backend default.
- No audience filtering and `audience` is never in the response (Decision 2): everyone reads all rows. `AnnouncementResponse.of` already omits it.
- No audit log, no migration, no edit/delete (Decision 3).
- Backend test env: do NOT run the whole suite (about 55 spurious Mockito errors from a JDK21/25 mismatch plus 4 pre-existing `JwtServiceTest`/`SecretsEncryptionServiceTest` failures). Run only the named classes from `/Users/ronalisenapati/Ronali/plotchain/backend`: `mvn -q test -Dtest=<Class>`. Mock interfaces only.
- Shared in-memory H2 persists across test classes in one JVM: no test may assume the `announcement` table is empty.

## Review Focus

- `size=0` or negative must not reach `PageRequest.of` (throws `IllegalArgumentException`, a 500): clamped to 1 (Task 2 test).
- Negative `page` must not 500: floored to 0 (Task 2 test).
- Huge `size` (e.g. 100000) must be capped at 100 (Task 2 test).
- Two announcements with identical `publishedAt` must page deterministically, no row duplicated or skipped across pages (Task 1 test).
- Empty feed returns 200 with `entries: []`, not 404/500 (Task 1 service test, Task 3 security test tolerates any content).
- `audience` must never leak into the JSON (Task 2 test).
- Non-numeric `page=abc` should be a 4xx, not 500 (Task 2 test; if the app's handler turns it into 500, report it, do not fix here).

---

## File Structure

- Modify `backend/src/main/java/com/plotchain/announcement/AnnouncementRepository.java`: add finder.
- Create `backend/src/main/java/com/plotchain/announcement/AnnouncementPageResponse.java`.
- Modify `backend/src/main/java/com/plotchain/announcement/AnnouncementService.java`: add `feed`.
- Modify `backend/src/main/java/com/plotchain/announcement/AnnouncementController.java`: add GET.
- Create `backend/src/test/java/com/plotchain/announcement/AnnouncementFeedRepositoryTest.java` (`@DataJpaTest`).
- Modify `backend/src/test/java/com/plotchain/announcement/AnnouncementServiceTest.java`, `AnnouncementControllerTest.java`, `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`.

The spec says "No dedicated `AnnouncementRepositoryTest`". This plan adds one deliberately: the spec reasoned the finder was a bare derived query, but it now carries a `@Query` with an `id` tiebreak, and the controller tests mock the repository so they cannot prove ordering.

---

### Task 1: Repository finder, page DTO, service `feed`

**Files:**
- Modify: `backend/src/main/java/com/plotchain/announcement/AnnouncementRepository.java`
- Create: `backend/src/main/java/com/plotchain/announcement/AnnouncementPageResponse.java`
- Modify: `backend/src/main/java/com/plotchain/announcement/AnnouncementService.java`
- Test: `backend/src/test/java/com/plotchain/announcement/AnnouncementFeedRepositoryTest.java` (create), `AnnouncementServiceTest.java` (modify)

**Interfaces:**
- Consumes: `Announcement(UUID id, String title, String body, Instant publishedAt, String audience)`; `AnnouncementResponse.of(Announcement)`.
- Produces: `Page<Announcement> AnnouncementRepository.findAllByOrderByPublishedAtDesc(Pageable)`; `record AnnouncementPageResponse(List<AnnouncementResponse> entries, int page, int size, long totalElements)`; `AnnouncementPageResponse AnnouncementService.feed(int page, int size)` (no clamping here; the caller clamps).

- [ ] **Step 1: Write the failing repository test**

Create `AnnouncementFeedRepositoryTest.java`:

```java
package com.plotchain.announcement;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.ActiveProfiles;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

// Real-DB (H2 + Flyway) proof of the feed ordering. @DataJpaTest rolls back each test. Other test
// classes (e.g. SecurityConfigTest) may leave committed rows, so every assertion looks only at the
// rows this test created and checks their RELATIVE order.
@DataJpaTest
@ActiveProfiles("test")
class AnnouncementFeedRepositoryTest {

    @Autowired AnnouncementRepository repo;
    @Autowired TestEntityManager em;

    private Announcement row(String title, String publishedAt) {
        return em.persist(new Announcement(UUID.randomUUID(), title, "body", Instant.parse(publishedAt), "ALL"));
    }

    private static List<UUID> ours(Page<Announcement> p, Announcement... rows) {
        List<UUID> mine = List.of(rows).stream().map(Announcement::getId).toList();
        return p.getContent().stream().map(Announcement::getId).filter(mine::contains).toList();
    }

    @Test
    void newestPublishedAtComesFirst() {
        Announcement oldest = row("oldest", "2031-01-01T00:00:00Z");
        Announcement newest = row("newest", "2031-03-01T00:00:00Z");
        Announcement middle = row("middle", "2031-02-01T00:00:00Z");
        em.flush();

        Page<Announcement> p = repo.findAllByOrderByPublishedAtDesc(PageRequest.of(0, 1000));

        assertThat(ours(p, oldest, newest, middle))
            .containsExactly(newest.getId(), middle.getId(), oldest.getId());
    }

    @Test
    void samePublishedAtFallsBackToIdDescending() {
        Announcement a = row("a", "2032-01-01T00:00:00Z");
        Announcement b = row("b", "2032-01-01T00:00:00Z");
        em.flush();

        Page<Announcement> p = repo.findAllByOrderByPublishedAtDesc(PageRequest.of(0, 1000));

        // Compare ids as strings: the DB orders UUIDs as unsigned bytes, UUID.compareTo is signed.
        List<UUID> expected = List.of(a.getId(), b.getId()).stream()
            .sorted(Comparator.comparing(UUID::toString).reversed()).toList();
        assertThat(ours(p, a, b)).containsExactlyElementsOf(expected);
    }

    @Test
    void pagingReportsTotalAndSplitsWithoutLosingOrDuplicatingTiedRows() {
        Announcement t1 = row("t1", "2033-01-01T00:00:00Z");
        Announcement t2 = row("t2", "2033-01-01T00:00:00Z");
        Announcement t3 = row("t3", "2033-01-01T00:00:00Z");
        em.flush();
        long total = repo.count();

        Page<Announcement> first = repo.findAllByOrderByPublishedAtDesc(PageRequest.of(0, 2));
        assertThat(first.getTotalElements()).isEqualTo(total);
        assertThat(first.getContent()).hasSize(2);

        // Walk every page; each of our three tied rows must appear exactly once.
        java.util.ArrayList<UUID> seen = new java.util.ArrayList<>();
        for (int i = 0; i < first.getTotalPages(); i++) {
            repo.findAllByOrderByPublishedAtDesc(PageRequest.of(i, 2)).forEach(x -> seen.add(x.getId()));
        }
        assertThat(seen).containsOnlyOnce(t1.getId(), t2.getId(), t3.getId());
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /Users/ronalisenapati/Ronali/plotchain/backend && mvn -q test -Dtest=AnnouncementFeedRepositoryTest`
Expected: compilation FAIL, `findAllByOrderByPublishedAtDesc` not defined.

- [ ] **Step 3: Implement the repository finder**

Replace `AnnouncementRepository.java` (this removes the unit-2 marker comment):

```java
package com.plotchain.announcement;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.UUID;

public interface AnnouncementRepository extends JpaRepository<Announcement, UUID> {

    // Explicit @Query (not derived) so ordering carries an id tiebreak: two announcements with the
    // same publishedAt must still page deterministically. Same pattern as SupportTicketRepository.searchQueue.
    @Query("""
        SELECT a FROM Announcement a
        ORDER BY a.publishedAt DESC, a.id DESC
        """)
    Page<Announcement> findAllByOrderByPublishedAtDesc(Pageable pageable);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd /Users/ronalisenapati/Ronali/plotchain/backend && mvn -q test -Dtest=AnnouncementFeedRepositoryTest`
Expected: PASS (3 tests). Also run `-Dtest=AnnouncementSchemaTest` to confirm the entity still boots.

- [ ] **Step 5: Write the failing service tests**

In `AnnouncementServiceTest.java` add imports `org.springframework.data.domain.PageImpl`, `org.springframework.data.domain.PageRequest`, `java.util.List`, `java.util.UUID`, and these tests inside the class:

```java
    @Test
    void feedMapsRowsToResponsesAndEchoesPagingWithoutAudience() {
        Announcement a = new Announcement(UUID.randomUUID(), "T", "B", Instant.parse("2031-01-01T00:00:00Z"), "ALL");
        when(announcementRepository.findAllByOrderByPublishedAtDesc(PageRequest.of(2, 5)))
            .thenReturn(new PageImpl<>(List.of(a), PageRequest.of(2, 5), 11));

        AnnouncementPageResponse page = new AnnouncementService(announcementRepository).feed(2, 5);

        assertThat(page.entries()).containsExactly(AnnouncementResponse.of(a));
        assertThat(page.page()).isEqualTo(2);
        assertThat(page.size()).isEqualTo(5);
        assertThat(page.totalElements()).isEqualTo(11);
    }

    @Test
    void emptyFeedIsAnEmptyPageNotAnError() {
        when(announcementRepository.findAllByOrderByPublishedAtDesc(PageRequest.of(0, 20)))
            .thenReturn(new PageImpl<>(List.of()));

        AnnouncementPageResponse page = new AnnouncementService(announcementRepository).feed(0, 20);

        assertThat(page.entries()).isEmpty();
        assertThat(page.totalElements()).isZero();
    }
```

- [ ] **Step 6: Run to verify they fail**

Run: `cd /Users/ronalisenapati/Ronali/plotchain/backend && mvn -q test -Dtest=AnnouncementServiceTest`
Expected: compilation FAIL, `AnnouncementPageResponse` / `feed` not defined.

- [ ] **Step 7: Implement DTO and service method**

Create `AnnouncementPageResponse.java`:

```java
package com.plotchain.announcement;

import java.util.List;

// Same shape as SupportTicketPageResponse / KycPageResponse (list field named "entries").
public record AnnouncementPageResponse(List<AnnouncementResponse> entries, int page, int size, long totalElements) {}
```

In `AnnouncementService.java`: delete the `// Unit 2 adds feed(page, size) here.` comment, add imports `org.springframework.data.domain.Page`, `org.springframework.data.domain.PageRequest`, `org.springframework.transaction.annotation.Transactional`, and this method after `compose`:

```java
    // page/size arrive already clamped by the controller (PageRequest.of throws on size < 1).
    @Transactional(readOnly = true)
    public AnnouncementPageResponse feed(int page, int size) {
        Page<Announcement> result = announcementRepository.findAllByOrderByPublishedAtDesc(PageRequest.of(page, size));
        return new AnnouncementPageResponse(
            result.getContent().stream().map(AnnouncementResponse::of).toList(),
            page, size, result.getTotalElements());
    }
```

- [ ] **Step 8: Run to verify they pass**

Run: `cd /Users/ronalisenapati/Ronali/plotchain/backend && mvn -q test -Dtest=AnnouncementServiceTest,AnnouncementFeedRepositoryTest`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add backend/src/main/java/com/plotchain/announcement backend/src/test/java/com/plotchain/announcement
git commit -m "feat(announcements): feed repository finder, page DTO and service"
```

---

### Task 2: `GET /api/announcements` controller with paging clamp

**Files:**
- Modify: `backend/src/main/java/com/plotchain/announcement/AnnouncementController.java`
- Test: `backend/src/test/java/com/plotchain/announcement/AnnouncementControllerTest.java` (modify)

**Interfaces:**
- Consumes: `AnnouncementService.feed(int, int)` and `AnnouncementPageResponse` (Task 1).
- Produces: `GET /api/announcements?page&size` returning `AnnouncementPageResponse` JSON (`entries`, `page`, `size`, `totalElements`), open to any authenticated user.

- [ ] **Step 1: Write the failing controller tests**

In `AnnouncementControllerTest.java` add imports `org.springframework.data.domain.PageImpl`, `org.springframework.data.domain.PageRequest`, `java.time.Instant`, `java.util.List`, `static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get`, `static org.mockito.ArgumentMatchers.eq`. The class `@MockBean AnnouncementRepository` returns null for an unstubbed finder, so each test stubs it. Add:

```java
    private Announcement row(String title, String publishedAt) {
        return new Announcement(UUID.randomUUID(), title, "Body of " + title, Instant.parse(publishedAt), "ALL");
    }

    private void stubFeed(PageRequest expected, List<Announcement> rows, long total) {
        when(announcementRepository.findAllByOrderByPublishedAtDesc(eq(expected)))
            .thenReturn(new PageImpl<>(rows, expected, total));
    }

    @Test
    void feedReturnsPageShapeInRepositoryOrderForAnAssociateAndHidesAudience() throws Exception {
        stubFeed(PageRequest.of(0, 20),
            List.of(row("Newer", "2031-02-01T00:00:00Z"), row("Older", "2031-01-01T00:00:00Z")), 2);

        mockMvc.perform(get("/api/announcements").header("Authorization", tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.entries.length()").value(2))
            .andExpect(jsonPath("$.entries[0].title").value("Newer"))
            .andExpect(jsonPath("$.entries[1].title").value("Older"))
            .andExpect(jsonPath("$.entries[0].body").value("Body of Newer"))
            .andExpect(jsonPath("$.entries[0].publishedAt").exists())
            .andExpect(jsonPath("$.entries[0].id").exists())
            .andExpect(jsonPath("$.entries[0].audience").doesNotExist())
            .andExpect(jsonPath("$.page").value(0))
            .andExpect(jsonPath("$.size").value(20))
            .andExpect(jsonPath("$.totalElements").value(2));
    }

    @Test
    void adminReadsTheSameFeed() throws Exception {
        stubFeed(PageRequest.of(0, 20), List.of(row("Only", "2031-01-01T00:00:00Z")), 1);

        mockMvc.perform(get("/api/announcements").header("Authorization", tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.entries[0].title").value("Only"));
    }

    @Test
    void emptyFeedIs200WithEmptyEntries() throws Exception {
        stubFeed(PageRequest.of(0, 20), List.of(), 0);

        mockMvc.perform(get("/api/announcements").header("Authorization", tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.entries.length()").value(0))
            .andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    void pageAndSizeArePassedThrough() throws Exception {
        stubFeed(PageRequest.of(3, 10), List.of(), 40);

        mockMvc.perform(get("/api/announcements").param("page", "3").param("size", "10")
                .header("Authorization", tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.page").value(3))
            .andExpect(jsonPath("$.size").value(10));
    }

    @Test
    void oversizedSizeIsCappedAt100() throws Exception {
        stubFeed(PageRequest.of(0, 100), List.of(), 0);

        mockMvc.perform(get("/api/announcements").param("size", "100000")
                .header("Authorization", tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.size").value(100));
    }

    @Test
    void zeroOrNegativeSizeIsRaisedToOneNotA500() throws Exception {
        stubFeed(PageRequest.of(0, 1), List.of(), 0);

        mockMvc.perform(get("/api/announcements").param("size", "0")
                .header("Authorization", tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.size").value(1));
        mockMvc.perform(get("/api/announcements").param("size", "-5")
                .header("Authorization", tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.size").value(1));
    }

    @Test
    void negativePageIsFlooredToZeroNotA500() throws Exception {
        stubFeed(PageRequest.of(0, 20), List.of(), 0);

        mockMvc.perform(get("/api/announcements").param("page", "-1")
                .header("Authorization", tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.page").value(0));
    }

    @Test
    void nonNumericPageIsA4xxNotA500() throws Exception {
        mockMvc.perform(get("/api/announcements").param("page", "abc")
                .header("Authorization", tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().is4xxClientError());
    }

    @Test
    void feedWithoutATokenIs401() throws Exception {
        mockMvc.perform(get("/api/announcements")).andExpect(status().isUnauthorized());
    }
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd /Users/ronalisenapati/Ronali/plotchain/backend && mvn -q test -Dtest=AnnouncementControllerTest`
Expected: FAIL on the new tests (404/405: no GET mapping yet; `feedWithoutATokenIs401` may already pass). Existing compose tests still pass.

- [ ] **Step 3: Add the GET mapping**

In `AnnouncementController.java`: replace the class-top comment ("Full paths on methods ... unit 2 appends GET ...") with `// Full paths on methods (no class-level mapping): the feed GET /api/announcements does not share the /api/admin prefix.`; add imports `org.springframework.web.bind.annotation.GetMapping`, `org.springframework.web.bind.annotation.RequestParam`; append this method:

```java
    // Any authenticated user (ADMIN or any associate role): deliberately NO @PreAuthorize and no
    // SecurityConfig matcher; a bare GET falls through to anyRequest().authenticated() (spec
    // Decision 4). Clamp matches AssociateSupportTicketController: size >= 1 because PageRequest.of
    // throws below 1; the 20 default is the backend's, the screens pick their own size.
    @GetMapping("/api/announcements")
    public AnnouncementPageResponse feed(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        page = Math.max(page, 0);
        size = Math.max(Math.min(size, 100), 1);
        return announcementService.feed(page, size);
    }
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd /Users/ronalisenapati/Ronali/plotchain/backend && mvn -q test -Dtest=AnnouncementControllerTest`
Expected: PASS, including the unit-1 compose tests. If `nonNumericPageIsA4xxNotA500` returns 500, do not change the exception handler (out of scope): remove that test and report it.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/announcement/AnnouncementController.java backend/src/test/java/com/plotchain/announcement/AnnouncementControllerTest.java
git commit -m "feat(announcements): GET /api/announcements paged feed for any authenticated user"
```

---

### Task 3: SecurityConfigTest rows and cleanup of unit 1's leftover row

**Files:**
- Modify: `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java` (around lines 1305-1325; add one `@Autowired`, edit one test, add two tests)

**Interfaces:**
- Consumes: `GET /api/announcements` (Task 2); `AnnouncementRepository` (real bean, not mocked in this class).
- Produces: nothing for later tasks.

Background: unit 1's `adminAnnouncementComposeIsReachableOnlyForAdminAndForbiddenForEveryOtherRole` POSTs through the real controller and repository for the ADMIN case and leaves one committed row (`Hello` / `World`) in the shared H2 for the rest of the JVM. Delete it so the table does not carry cross-test debris.

- [ ] **Step 1: Write the new tests and the cleanup (test-only task, so "failing" means the cleanup is not yet there)**

Add import `com.plotchain.announcement.AnnouncementRepository` and `org.springframework.test.web.servlet.MvcResult` (check existing imports first; `ObjectMapper`, `UUID`, `get`, `post`, `jsonPath` are already used in this file). Add under the existing autowired fields:

```java
    @Autowired AnnouncementRepository announcementRepository;
```

Replace the unit-1 test body (keep its signature and annotations) with:

```java
    void adminAnnouncementComposeIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/admin/announcements")
                .header("Authorization", "Bearer " + tokenFor(role))
                .contentType("application/json")
                .content("{\"title\":\"Hello\",\"body\":\"World\"}"))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 201 : 403))
            .andReturn();
        if (role == AssociateRole.ADMIN) {
            // This hits the real repository / shared in-memory H2; remove the committed row so it
            // does not leak into other tests (announcements unit 2 feed tests).
            String id = new ObjectMapper().readTree(result.getResponse().getContentAsString()).get("id").asText();
            announcementRepository.deleteById(UUID.fromString(id));
        }
    }
```

Add after the no-token compose test:

```java
    // announcements unit 2 (Decision 4): GET /api/announcements has no matcher and falls to
    // anyRequest().authenticated(), so EVERY role is 200. Real controller + real H2; the table's
    // contents are not asserted (shared across test classes), only that the request is allowed
    // and the page shape is returned.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void announcementFeedIsReachableForEveryRole(AssociateRole role) throws Exception {
        mockMvc.perform(get("/api/announcements")
                .header("Authorization", "Bearer " + tokenFor(role)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.entries").isArray());
    }

    @Test
    void announcementFeedIsUnauthorizedWithoutAToken() throws Exception {
        mockMvc.perform(get("/api/announcements")).andExpect(status().isUnauthorized());
    }
```

- [ ] **Step 2: Run to verify it passes**

Run: `cd /Users/ronalisenapati/Ronali/plotchain/backend && mvn -q test -Dtest=SecurityConfigTest`
Expected: PASS, including every pre-existing row. Sanity check the cleanup by asserting nothing: confirm no new failure in `AnnouncementFeedRepositoryTest` / `AnnouncementControllerTest` when run in the same invocation: `mvn -q test -Dtest=SecurityConfigTest,AnnouncementControllerTest,AnnouncementFeedRepositoryTest,AnnouncementServiceTest,AnnouncementSchemaTest`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java
git commit -m "test(announcements): SecurityConfigTest feed rows; delete unit-1 compose row after use"
```

---

## Self-Review

- Spec coverage: finder (T1), `AnnouncementPageResponse` (T1), `feed` (T1), GET with clamp (T2), any-authenticated access incl. ADMIN and every role, 401 (T2 MockMvc, T3 real chain), no audience filter/leak (T2), no SecurityConfig/migration/audit (Global Constraints, verified matchers). Spec says `AnnouncementPageResponse` has field `announcements`; this plan uses `entries` per the support-tickets precedent the user asked to follow (see handoff question).
- Spec's "no dedicated repository test" is overridden deliberately (File Structure note).
- Placeholder scan: none. Type names consistent (`feed`, `AnnouncementPageResponse(entries, page, size, totalElements)`, `findAllByOrderByPublishedAtDesc`).

## Coordinator decisions (user-approved 2026-10-09)

- List field is `entries` (matches SupportTicketPageResponse), not the spec's `announcements`; units 3 and 4 follow `entries`.
- Clamp: page floored at 0, size in [1,100], default 20 (supersedes spec's looser "size <= 100").
- Keep the dedicated real-DB repository test despite the spec's "no repository test".
- `page=abc` test expects 4xx; if the handler gives 500, remove the test and report, no handler change.
