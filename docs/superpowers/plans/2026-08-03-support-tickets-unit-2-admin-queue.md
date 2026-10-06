# Support Tickets Unit 2: Admin Ticket Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ADMIN `GET /api/admin/support-tickets` returns a paged `SupportTicketPageResponse` of full-content `SupportTicketResponse` rows, filterable by optional `status` and `associateId`, newest first.

**Architecture:** One null-safe JPQL `@Query` (`SupportTicketRepository.searchQueue`) with the same `(:p IS NULL OR t.x = :p)` shape `PlotBookingRepository.search` / `EPinRepository.search` use. `AdminSupportTicketService.list` runs the page query, loads the page's associates in ONE `findAllById`, and maps rows with the merged `SupportTicketResponse.of(ticket, associate)`. `AdminSupportTicketController` gets a `@GetMapping` that clamps `page`/`size`. `SecurityConfig` gets an explicit GET matcher (no blanket admin GET rule exists).

**Tech Stack:** Spring Boot 3.3.4, Spring Data JPA/Hibernate 6 (JPQL), Flyway + H2 (test profile), JUnit 5 / AssertJ / Mockito / MockMvc.

**Spec:** `docs/superpowers/specs/role-capability/2026-08-03-support-tickets-domain-design.md` (Decisions 5, 8; Data model `searchQueue`, `SupportTicketPageResponse`, controller `list`; Flow "Admin browses the queue"; Testing). Unit queue: `docs/superpowers/plans/2026-08-03-support-tickets-units.md` (unit 2). Pattern reference: `docs/superpowers/plans/2026-10-01-plot-booking-unit-8-admin-booking-register.md`.

## Sequencing (read first)

- **This unit is implemented BEFORE unit 3.** Unit 3 builds on top of what this unit leaves in `AdminSupportTicketService`, `AdminSupportTicketController`, `SupportTicketRepository` (it adds `respond`, a `POST /{id}/respond` mapping and, if it wants it, `findById` which already exists on `JpaRepository`). Unit 3 must not re-create imports/fields this unit added; it appends its own methods. Unit 4 reuses `SupportTicketPageResponse` created here.
- Tests live in NEW classes (`SupportTicketQueueRepositoryTest`, `AdminSupportTicketQueueServiceTest`, `AdminSupportTicketQueueControllerTest`) so unit 3 can extend `AdminSupportTicketServiceTest`/`AdminSupportTicketControllerTest` without merge conflicts. The only existing test file touched is `SecurityConfigTest` (append-only at the support-ticket block).

## Global Constraints

- Admin-only: ASSOCIATE token 403, unauthenticated 401 (Decision 8). `SecurityConfig` has NO blanket `GET /api/admin/**` rule; an unmatched GET would fall to `anyRequest().authenticated()` and let any associate in. `"/api/admin/support-tickets"` is an exact match in AntPathMatcher, so `"/api/admin/support-tickets/*"` is added alongside it (same reasoning as the `/api/admin/kyc` + `/*` matcher).
- `page = max(page, 0)`, `size` clamped to `[1, 100]` (default 20). Min 1 because `PageRequest.of` rejects `size < 1` (would otherwise 500), same as `AdminBookingRegisterController`.
- No status filter by default (spec Flow "Admin browses the queue"). Sorted `createdAt` DESC, `id` DESC tiebreak.
- Each row carries full content (`subject`, `description`, `status`, `response`, `respondedAt`); no summary/detail split and NO `GET /{id}` (Decision 5).
- Null-UUID/enum JPQL params: bound with plain `(:p IS NULL OR ...)`, no `CAST`. This exact shape (UUID + enum, nullable) was verified on real PostgreSQL 16 in plot-booking unit 8 (`PlotBookingRepository.search`; see units-file note "Real-Postgres smoke test (2026-10-05)"). `CAST(... AS ...)` is only needed for String/Instant params (`AssociateRepository.searchDirectory`); this query has none. Do not add casts.
- No migration (table + indexes on `associate_id`, `status` exist since unit 1). No frontend.
- Env noise: ~55 spurious Mockito errors from the JDK21/25 mismatch on FULL runs. Run ONLY targeted `-Dtest=` classes from the worktree's `backend/` dir, e.g. `cd <worktree>/backend && mvn -q test -Dtest=SupportTicketQueueRepositoryTest`. Mocks in the new tests are on interfaces (fine on this JDK).
- Do NOT edit `docs/superpowers/plans/2026-08-03-support-tickets-units.md` (coordinator's job).

## Review Focus

- `size=0` / negative / `page=-1`: must clamp, not 500. Controller test pins it.
- `status=BOGUS` / malformed `associateId`: 400 (via `ApiExceptionHandler` type-mismatch handling), not 500. Controller test pins it.
- No filters: returns ALL statuses (not just OPEN). Repository test pins it.
- Unknown `associateId`: empty page 200, not 404. Repository + controller tests pin it.
- Page past the end: empty `entries`, `totalElements` still the true total. Repository test pins it.
- Two tickets with identical `createdAt`: stable order across pages (id DESC tiebreak). Repository test pins it.
- Empty page must not call `associateRepository.findAllById` with an empty set needlessly / must not NPE on the mock. Service test pins it.
- A ticket's associate missing from the lookup (cannot happen: FK) must fail loudly, not emit a row with null name. Service test pins `IllegalStateException`.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `backend/src/main/java/com/plotchain/supportticket/SupportTicketRepository.java` | Modify | Add `searchQueue(...)`; replace the "added by units 2 and 4" comment |
| `backend/src/main/java/com/plotchain/supportticket/SupportTicketPageResponse.java` | Create | Page DTO (unit 4 reuses) |
| `backend/src/main/java/com/plotchain/supportticket/AdminSupportTicketService.java` | Modify | Add `list(...)` |
| `backend/src/main/java/com/plotchain/supportticket/AdminSupportTicketController.java` | Modify | Add `GET` with clamping |
| `backend/src/main/java/com/plotchain/auth/SecurityConfig.java` | Modify | ADMIN GET matcher next to `/api/admin/kyc` |
| `backend/src/test/java/com/plotchain/supportticket/SupportTicketQueueRepositoryTest.java` | Create | Filters/order/count against H2 |
| `backend/src/test/java/com/plotchain/supportticket/AdminSupportTicketQueueServiceTest.java` | Create | Mapping, one-lookup, empty page |
| `backend/src/test/java/com/plotchain/supportticket/AdminSupportTicketQueueControllerTest.java` | Create | Param binding, clamping, 400s, JSON shape |
| `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java` | Modify | 200/403/401 matrix for the GET |

---

### Task 1: `searchQueue` + `SupportTicketPageResponse` (real-DB test)

**Files:**
- Modify: `backend/src/main/java/com/plotchain/supportticket/SupportTicketRepository.java`
- Create: `backend/src/main/java/com/plotchain/supportticket/SupportTicketPageResponse.java`
- Test: `backend/src/test/java/com/plotchain/supportticket/SupportTicketQueueRepositoryTest.java`

**Interfaces:**
- Consumes: `SupportTicket` entity (setters as merged), `SupportTicketStatus`, `Associate`.
- Produces:
  - `Page<SupportTicket> SupportTicketRepository.searchQueue(SupportTicketStatus status, UUID associateId, Pageable pageable)`; ordering is inside the query (`createdAt DESC, id DESC`), so callers pass an UNSORTED `PageRequest.of(page, size)`.
  - `record SupportTicketPageResponse(List<SupportTicketResponse> entries, int page, int size, long totalElements)`.

- [ ] **Step 1: Write the failing repository test**

Mirrors `SupportTicketSchemaTest` (`@DataJpaTest`, real H2 + Flyway, `persistAssociate` helper).

```java
package com.plotchain.supportticket;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

// Real-DB (H2 + Flyway) proof of searchQueue. @DataJpaTest rolls back each test. Every assertion
// scopes to the two seeded associates (via associateId or an id filter) in case other test
// classes leave committed rows behind.
@DataJpaTest
@ActiveProfiles("test")
class SupportTicketQueueRepositoryTest {

    static final Instant T = Instant.parse("2026-06-01T00:00:00Z");

    @Autowired SupportTicketRepository repo;
    @Autowired TestEntityManager em;

    UUID a1, a2;
    SupportTicket t1, t2, t3, t4, t5, t6;

    @BeforeEach
    void seed() {
        a1 = persistAssociate();
        a2 = persistAssociate();
        t1 = ticket(a1, SupportTicketStatus.OPEN, 1);
        t2 = ticket(a1, SupportTicketStatus.IN_PROGRESS, 2);
        t3 = ticket(a2, SupportTicketStatus.OPEN, 3);
        t4 = ticket(a2, SupportTicketStatus.RESOLVED, 4);
        t5 = ticket(a1, SupportTicketStatus.CLOSED, 5);
        t6 = ticket(a1, SupportTicketStatus.CLOSED, 5);   // same createdAt as t5: tiebreak case
        em.flush();
    }

    private Page<SupportTicket> search(SupportTicketStatus status, UUID associateId, int page, int size) {
        return repo.searchQueue(status, associateId, PageRequest.of(page, size));
    }

    private static List<UUID> ids(Page<SupportTicket> p) {
        return p.getContent().stream().map(SupportTicket::getId).toList();
    }

    // t5 and t6 share createdAt, so their relative order is id DESC.
    private List<UUID> t5t6ByIdDesc() {
        return List.of(t5.getId(), t6.getId()).stream().sorted(Comparator.reverseOrder()).toList();
    }

    @Test
    void noFiltersReturnsEveryStatusNewestFirstWithIdTiebreak() {
        Page<SupportTicket> p = search(null, null, 0, 1000);
        // Other committed rows may exist; assert the relative order of ours.
        List<UUID> ours = ids(p).stream().filter(id -> List.of(t1, t2, t3, t4, t5, t6).stream()
            .anyMatch(t -> t.getId().equals(id))).toList();
        List<UUID> expected = new ArrayList<>(t5t6ByIdDesc());
        expected.addAll(List.of(t4.getId(), t3.getId(), t2.getId(), t1.getId()));
        assertThat(ours).containsExactlyElementsOf(expected);   // OPEN, IN_PROGRESS, RESOLVED, CLOSED all present
    }

    @Test
    void statusFilterAlone() {
        Page<SupportTicket> open = search(SupportTicketStatus.OPEN, a1, 0, 50);
        assertThat(ids(open)).containsExactly(t1.getId());
        assertThat(ids(search(SupportTicketStatus.OPEN, a2, 0, 50))).containsExactly(t3.getId());
        assertThat(search(SupportTicketStatus.RESOLVED, a1, 0, 50).getTotalElements()).isZero();
    }

    @Test
    void associateFilterAlone() {
        Page<SupportTicket> p = search(null, a2, 0, 50);
        assertThat(ids(p)).containsExactly(t4.getId(), t3.getId());
        assertThat(p.getTotalElements()).isEqualTo(2);
        assertThat(search(null, a1, 0, 50).getTotalElements()).isEqualTo(4);
    }

    @Test
    void statusAndAssociateCombined() {
        assertThat(ids(search(SupportTicketStatus.CLOSED, a1, 0, 50))).containsExactlyElementsOf(t5t6ByIdDesc());
        assertThat(search(SupportTicketStatus.CLOSED, a2, 0, 50).getTotalElements()).isZero();
    }

    @Test
    void unknownAssociateGivesAnEmptyPage() {
        Page<SupportTicket> p = search(null, UUID.randomUUID(), 0, 20);
        assertThat(p.getContent()).isEmpty();
        assertThat(p.getTotalElements()).isZero();
    }

    @Test
    void paginationKeepsTheTrueTotalAndAStableOrderAcrossPages() {
        Page<SupportTicket> first = search(null, a1, 0, 3);
        Page<SupportTicket> second = search(null, a1, 1, 3);
        Page<SupportTicket> beyond = search(null, a1, 5, 3);
        assertThat(first.getTotalElements()).isEqualTo(4);
        assertThat(ids(first)).hasSize(3);
        assertThat(ids(second)).containsExactly(t1.getId());
        assertThat(beyond.getContent()).isEmpty();
        assertThat(beyond.getTotalElements()).isEqualTo(4);
    }

    private SupportTicket ticket(UUID associateId, SupportTicketStatus status, int dayOffset) {
        SupportTicket t = new SupportTicket();
        t.setId(UUID.randomUUID());
        t.setAssociateId(associateId);
        t.setSubject("Subject " + dayOffset);
        t.setDescription("Description " + dayOffset);
        t.setStatus(status);
        t.setCreatedAt(T.plusSeconds(86400L * dayOffset));
        t.setUpdatedAt(T.plusSeconds(86400L * dayOffset));
        return em.persist(t);
    }

    private UUID persistAssociate() {
        UUID id = UUID.randomUUID();
        Associate associate = new Associate();
        associate.setId(id);
        associate.setPosition("L");
        associate.setName("Queue Associate");
        associate.setKycStatus(KycStatus.VERIFIED);
        associate.setJoinedAt(Instant.now());
        associate.setCumulativeMatchedVolume(BigDecimal.ZERO);
        associate.setUserId("u-" + id);
        associate.setEmail(id + "@test.local");
        associate.setPasswordHash("$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C");
        associate.setRole(AssociateRole.ADMIN);   // same trick as SupportTicketSchemaTest: ASSOCIATE rows need a rank_id
        return em.persist(associate).getId();
    }
}
```

(The associate FK needs a real associate row; `persistAssociate` is copied from `SupportTicketSchemaTest`. `em.flush()` after persisting associates is implicit via the ticket persists + explicit flush at the end of `seed()`.)

- [ ] **Step 2: Run to confirm it fails**

Run (from `<worktree>/backend`): `mvn -q test -Dtest=SupportTicketQueueRepositoryTest`
Expected: compilation error, `searchQueue` not defined.

- [ ] **Step 3: Implement**

`SupportTicketPageResponse.java`:

```java
package com.plotchain.supportticket;

import java.util.List;

// Same shape as KycPageResponse / AdminAssociatePageResponse. Reused by the associate's own
// history endpoint (unit 4).
public record SupportTicketPageResponse(List<SupportTicketResponse> entries, int page, int size, long totalElements) {}
```

`SupportTicketRepository.java` (replace the whole file; the old comment said units 2 and 4 add methods, keep a note for unit 4):

```java
package com.plotchain.supportticket;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.UUID;

// Unit 4 adds findByAssociateId...OrderByCreatedAtDesc (own-history) beside searchQueue.
public interface SupportTicketRepository extends JpaRepository<SupportTicket, UUID> {

    // Admin queue (support-tickets unit 2). Both filters are independently optional (null = don't
    // filter), the searchDirectory / PlotBookingRepository.search shape, not four derived methods.
    // Plain (:p IS NULL OR ...) with no CAST: UUID and enum nulls bind fine on real Postgres
    // (verified in plot-booking unit 8, 2026-10-05); only String/Instant nulls need a CAST. Order is
    // fixed here (createdAt DESC, id DESC tiebreak) so callers pass an UNSORTED Pageable; the count
    // query is derived from this one.
    @Query("""
        SELECT t FROM SupportTicket t
        WHERE (:status IS NULL OR t.status = :status)
        AND (:associateId IS NULL OR t.associateId = :associateId)
        ORDER BY t.createdAt DESC, t.id DESC
        """)
    Page<SupportTicket> searchQueue(
        @Param("status") SupportTicketStatus status,
        @Param("associateId") UUID associateId,
        Pageable pageable);
}
```

- [ ] **Step 4: Run to confirm it passes**

Run: `mvn -q test -Dtest=SupportTicketQueueRepositoryTest`
Expected: PASS (6 tests). If Hibernate rejects the derived count query because of `ORDER BY`, add an explicit `countQuery = "SELECT COUNT(t) FROM SupportTicket t WHERE (:status IS NULL OR t.status = :status) AND (:associateId IS NULL OR t.associateId = :associateId)"` rather than weakening a test.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/supportticket/SupportTicketRepository.java \
        backend/src/main/java/com/plotchain/supportticket/SupportTicketPageResponse.java \
        backend/src/test/java/com/plotchain/supportticket/SupportTicketQueueRepositoryTest.java
git commit -m "feat(support-tickets): searchQueue null-safe filter query and page DTO (unit 2)"
```

---

### Task 2: `AdminSupportTicketService.list` (one associate lookup)

**Files:**
- Modify: `backend/src/main/java/com/plotchain/supportticket/AdminSupportTicketService.java`
- Test: `backend/src/test/java/com/plotchain/supportticket/AdminSupportTicketQueueServiceTest.java`

**Interfaces:**
- Consumes: `SupportTicketRepository.searchQueue` (Task 1); `AssociateRepository.findAllById(Iterable<UUID>)` (inherited `JpaRepository`); `SupportTicketResponse.of(SupportTicket, Associate)`; `SupportTicketPageResponse` (Task 1). Existing fields `supportTicketRepository`, `associateRepository` and the constructor are unchanged.
- Produces: `SupportTicketPageResponse AdminSupportTicketService.list(SupportTicketStatus status, UUID associateId, int page, int size)`, `@Transactional(readOnly = true)`, expects already-clamped `page`/`size`. Unit 3 adds `respond(...)` beside it.

- [ ] **Step 1: Write the failing service test**

```java
package com.plotchain.supportticket;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
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
import org.springframework.data.domain.Pageable;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdminSupportTicketQueueServiceTest {

    @Mock SupportTicketRepository supportTicketRepository;
    @Mock AssociateRepository associateRepository;
    @Mock SettingsAuditLogRepository settingsAuditLogRepository;

    AdminSupportTicketService service;

    @BeforeEach
    void setUp() {
        SettingsAuditService audit = new SettingsAuditService(
            settingsAuditLogRepository, associateRepository, new ObjectMapper().findAndRegisterModules());
        service = new AdminSupportTicketService(supportTicketRepository, associateRepository, audit);
    }

    private Associate associate(UUID id, String userId, String name) {
        Associate a = new Associate();
        a.setId(id);
        a.setUserId(userId);
        a.setName(name);
        a.setRole(AssociateRole.ASSOCIATE);
        return a;
    }

    private SupportTicket ticket(UUID associateId, String subject, SupportTicketStatus status, String response) {
        SupportTicket t = new SupportTicket();
        t.setId(UUID.randomUUID());
        t.setAssociateId(associateId);
        t.setSubject(subject);
        t.setDescription("desc of " + subject);
        t.setStatus(status);
        t.setResponse(response);
        t.setRespondedAt(response == null ? null : Instant.parse("2026-06-02T00:00:00Z"));
        t.setCreatedAt(Instant.parse("2026-06-01T00:00:00Z"));
        t.setUpdatedAt(Instant.parse("2026-06-02T00:00:00Z"));
        return t;
    }

    @Test
    void listMapsFullRowsAndLooksUpAssociatesInOneQuery() {
        UUID a1 = UUID.randomUUID();
        UUID a2 = UUID.randomUUID();
        SupportTicket t1 = ticket(a1, "Wallet blank", SupportTicketStatus.OPEN, null);
        SupportTicket t2 = ticket(a2, "KYC stuck", SupportTicketStatus.RESOLVED, "Fixed");
        SupportTicket t3 = ticket(a1, "Another", SupportTicketStatus.CLOSED, "Done");
        when(supportTicketRepository.searchQueue(eq(null), eq(null), any(Pageable.class)))
            .thenReturn(new PageImpl<>(List.of(t1, t2, t3), PageRequest.of(0, 20), 57));
        when(associateRepository.findAllById(any())).thenReturn(
            List.of(associate(a1, "VP00001", "Jane Doe"), associate(a2, "VP00002", "John Roe")));

        SupportTicketPageResponse page = service.list(null, null, 0, 20);

        assertThat(page.page()).isEqualTo(0);
        assertThat(page.size()).isEqualTo(20);
        assertThat(page.totalElements()).isEqualTo(57);
        assertThat(page.entries()).extracting(SupportTicketResponse::subject)
            .containsExactly("Wallet blank", "KYC stuck", "Another");           // repository order preserved
        SupportTicketResponse first = page.entries().get(0);
        assertThat(first.associateUserId()).isEqualTo("VP00001");
        assertThat(first.associateName()).isEqualTo("Jane Doe");
        assertThat(first.description()).isEqualTo("desc of Wallet blank");
        assertThat(first.response()).isNull();
        SupportTicketResponse second = page.entries().get(1);
        assertThat(second.associateName()).isEqualTo("John Roe");
        assertThat(second.status()).isEqualTo(SupportTicketStatus.RESOLVED);
        assertThat(second.response()).isEqualTo("Fixed");
        assertThat(second.respondedAt()).isEqualTo(Instant.parse("2026-06-02T00:00:00Z"));
        verify(associateRepository).findAllById(any());                          // exactly one lookup for the whole page
    }

    @Test
    void listPassesBothFiltersAndAnUnsortedPageableToTheRepository() {
        UUID a1 = UUID.randomUUID();
        when(supportTicketRepository.searchQueue(eq(SupportTicketStatus.OPEN), eq(a1), any(Pageable.class)))
            .thenReturn(new PageImpl<>(List.of(), PageRequest.of(2, 5), 0));

        SupportTicketPageResponse page = service.list(SupportTicketStatus.OPEN, a1, 2, 5);

        ArgumentCaptor<Pageable> captor = ArgumentCaptor.forClass(Pageable.class);
        verify(supportTicketRepository).searchQueue(eq(SupportTicketStatus.OPEN), eq(a1), captor.capture());
        assertThat(captor.getValue().getPageNumber()).isEqualTo(2);
        assertThat(captor.getValue().getPageSize()).isEqualTo(5);
        assertThat(captor.getValue().getSort().isUnsorted()).isTrue();           // order is inside searchQueue
        assertThat(page.page()).isEqualTo(2);
        assertThat(page.size()).isEqualTo(5);
    }

    @Test
    void emptyPageSkipsTheAssociateLookupAndReturnsAnEmptyList() {
        when(supportTicketRepository.searchQueue(eq(null), eq(null), any(Pageable.class)))
            .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 20), 0));

        SupportTicketPageResponse page = service.list(null, null, 0, 20);

        assertThat(page.entries()).isEmpty();
        assertThat(page.totalElements()).isZero();
        verify(associateRepository, never()).findAllById(any());
    }

    @Test
    void listFailsLoudlyIfATicketsAssociateIsMissing() {
        // The FK makes this impossible in production; a silent null name would hide corruption.
        UUID a1 = UUID.randomUUID();
        when(supportTicketRepository.searchQueue(eq(null), eq(null), any(Pageable.class)))
            .thenReturn(new PageImpl<>(List.of(ticket(a1, "x", SupportTicketStatus.OPEN, null)), PageRequest.of(0, 20), 1));
        when(associateRepository.findAllById(any())).thenReturn(List.of());

        assertThatThrownBy(() -> service.list(null, null, 0, 20)).isInstanceOf(IllegalStateException.class);
    }
}
```

- [ ] **Step 2: Run to confirm it fails**

Run: `mvn -q test -Dtest=AdminSupportTicketQueueServiceTest`
Expected: compilation error, `list` not defined.

- [ ] **Step 3: Implement**

In `AdminSupportTicketService.java` add imports `org.springframework.data.domain.Page`, `org.springframework.data.domain.PageRequest`, `java.util.List`, `java.util.function.Function`, `java.util.stream.Collectors` (keep the existing ones), and add this method after `create`:

```java
    // Admin queue (support-tickets unit 2). page/size must already be clamped by the controller.
    // One findAllById for the whole page (not one lookup per row). The query fixes the order, so the
    // Pageable is unsorted.
    @Transactional(readOnly = true)
    public SupportTicketPageResponse list(SupportTicketStatus status, UUID associateId, int page, int size) {
        Page<SupportTicket> result = supportTicketRepository.searchQueue(status, associateId, PageRequest.of(page, size));

        List<SupportTicketResponse> rows = List.of();
        if (!result.isEmpty()) {
            List<UUID> ids = result.getContent().stream().map(SupportTicket::getAssociateId).distinct().toList();
            Map<UUID, Associate> byId = associateRepository.findAllById(ids).stream()
                .collect(Collectors.toMap(Associate::getId, Function.identity()));
            rows = result.getContent().stream().map(t -> {
                Associate a = byId.get(t.getAssociateId());
                if (a == null) {
                    throw new IllegalStateException("Ticket " + t.getId() + " references missing associate " + t.getAssociateId());
                }
                return SupportTicketResponse.of(t, a);
            }).toList();
        }
        return new SupportTicketPageResponse(rows, page, size, result.getTotalElements());
    }
```

- [ ] **Step 4: Run to confirm it passes**

Run: `mvn -q test -Dtest=AdminSupportTicketQueueServiceTest,AdminSupportTicketServiceTest`
Expected: PASS (4 new + unit 1's existing service tests still green).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/supportticket/AdminSupportTicketService.java \
        backend/src/test/java/com/plotchain/supportticket/AdminSupportTicketQueueServiceTest.java
git commit -m "feat(support-tickets): admin queue list service with batched associate lookup (unit 2)"
```

---

### Task 3: `GET /api/admin/support-tickets` controller (param binding, clamping)

**Files:**
- Modify: `backend/src/main/java/com/plotchain/supportticket/AdminSupportTicketController.java`
- Test: `backend/src/test/java/com/plotchain/supportticket/AdminSupportTicketQueueControllerTest.java`

**Interfaces:**
- Consumes: `AdminSupportTicketService.list(SupportTicketStatus, UUID, int, int)` (Task 2).
- Produces: `GET /api/admin/support-tickets?status=&associateId=&page=&size=` returning `SupportTicketPageResponse` JSON `{entries, page, size, totalElements}`. Unit 3 adds `@PostMapping("/{id}/respond")` to the same class.

- [ ] **Step 1: Write the failing controller test**

Mocks the SERVICE (interface-free concrete class mock; the existing booking controller test does the same with `BookingRegisterService`, so this works on this JDK; if Mockito/ByteBuddy rejects it on the local JDK, switch to the `@MockBean SupportTicketRepository` + `@MockBean AssociateRepository` style used by `AdminSupportTicketControllerTest` and stub `searchQueue`/`findAllById`).

```java
package com.plotchain.supportticket;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.auth.JwtService;
import com.plotchain.company.SettingsAuditLogRepository;
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

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AdminSupportTicketQueueControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;          // token principal lookup
    @MockBean SettingsAuditLogRepository settingsAuditLogRepository;
    @MockBean AdminSupportTicketService service;

    private String admin() {
        Associate principal = new Associate();
        principal.setId(UUID.randomUUID());
        principal.setRole(AssociateRole.ADMIN);
        when(associateRepository.findById(principal.getId())).thenReturn(Optional.of(principal));
        return "Bearer " + jwtService.generateToken(principal);
    }

    private static SupportTicketPageResponse emptyPage(int page, int size) {
        return new SupportTicketPageResponse(List.of(), page, size, 0);
    }

    @Test
    void noParamsMeansUnfilteredPageZeroSizeTwenty() throws Exception {
        when(service.list(null, null, 0, 20)).thenReturn(emptyPage(0, 20));
        mockMvc.perform(get("/api/admin/support-tickets").header("Authorization", admin()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.entries").isEmpty())
            .andExpect(jsonPath("$.page").value(0))
            .andExpect(jsonPath("$.size").value(20))
            .andExpect(jsonPath("$.totalElements").value(0));
        verify(service).list(null, null, 0, 20);
    }

    @Test
    void bindsStatusAssociateIdPageAndSize() throws Exception {
        UUID associateId = UUID.randomUUID();
        when(service.list(SupportTicketStatus.OPEN, associateId, 2, 5)).thenReturn(emptyPage(2, 5));
        mockMvc.perform(get("/api/admin/support-tickets").header("Authorization", admin())
                .param("status", "OPEN").param("associateId", associateId.toString())
                .param("page", "2").param("size", "5"))
            .andExpect(status().isOk());
        verify(service).list(SupportTicketStatus.OPEN, associateId, 2, 5);
    }

    @Test
    void rowsCarryFullTicketContentAndAssociateIdentity() throws Exception {
        UUID id = UUID.randomUUID();
        UUID associateId = UUID.randomUUID();
        SupportTicketResponse row = new SupportTicketResponse(id, associateId, "VP00001", "Jane Doe",
            "Wallet blank", "Page is empty", SupportTicketStatus.RESOLVED, "Fixed",
            Instant.parse("2026-06-02T00:00:00Z"), Instant.parse("2026-06-01T00:00:00Z"),
            Instant.parse("2026-06-02T00:00:00Z"));
        when(service.list(null, null, 0, 20)).thenReturn(new SupportTicketPageResponse(List.of(row), 0, 20, 1));
        mockMvc.perform(get("/api/admin/support-tickets").header("Authorization", admin()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.entries[0].id").value(id.toString()))
            .andExpect(jsonPath("$.entries[0].associateUserId").value("VP00001"))
            .andExpect(jsonPath("$.entries[0].associateName").value("Jane Doe"))
            .andExpect(jsonPath("$.entries[0].subject").value("Wallet blank"))
            .andExpect(jsonPath("$.entries[0].description").value("Page is empty"))
            .andExpect(jsonPath("$.entries[0].status").value("RESOLVED"))
            .andExpect(jsonPath("$.entries[0].response").value("Fixed"))
            .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void sizeIsClampedToOneThroughOneHundredAndPageToZero() throws Exception {
        when(service.list(any(), any(), anyInt(), anyInt())).thenReturn(emptyPage(0, 1));
        mockMvc.perform(get("/api/admin/support-tickets").header("Authorization", admin())
            .param("size", "0")).andExpect(status().isOk());
        verify(service).list(null, null, 0, 1);
        mockMvc.perform(get("/api/admin/support-tickets").header("Authorization", admin())
            .param("size", "-7")).andExpect(status().isOk());
        mockMvc.perform(get("/api/admin/support-tickets").header("Authorization", admin())
            .param("size", "500").param("page", "-3")).andExpect(status().isOk());
        verify(service).list(null, null, 0, 100);
    }

    @Test
    void badStatusOrBadUuidIs400() throws Exception {
        mockMvc.perform(get("/api/admin/support-tickets").header("Authorization", admin()).param("status", "BOGUS"))
            .andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/admin/support-tickets").header("Authorization", admin()).param("associateId", "nope"))
            .andExpect(status().isBadRequest());
    }

    @Test
    void unknownAssociateIdIsAnEmptyPageNot404() throws Exception {
        UUID unknown = UUID.randomUUID();
        when(service.list(null, unknown, 0, 20)).thenReturn(emptyPage(0, 20));
        mockMvc.perform(get("/api/admin/support-tickets").header("Authorization", admin())
                .param("associateId", unknown.toString()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.entries").isEmpty());
    }
}
```

Remove the unused `isNull` import if the compiler/linter flags it.

- [ ] **Step 2: Run to confirm it fails**

Run: `mvn -q test -Dtest=AdminSupportTicketQueueControllerTest`
Expected: FAIL, 405 (no GET handler) on every request.

- [ ] **Step 3: Implement**

In `AdminSupportTicketController.java` add imports `org.springframework.web.bind.annotation.GetMapping` and `org.springframework.web.bind.annotation.RequestParam`, and add before `create`:

```java
    // Admin queue (support-tickets unit 2). status and associateId are independently optional;
    // no default status filter (an Admin landing here wants everything first, spec Flow "Admin
    // browses the queue"). Clamp: page >= 0, size in [1, 100] (min 1: PageRequest.of rejects
    // size < 1, which would be a 500). ADMIN-only via the explicit GET matcher in SecurityConfig
    // (no blanket admin GET rule); no @PreAuthorize needed on reads, same as KycReviewController.list.
    @GetMapping
    public SupportTicketPageResponse list(
            @RequestParam(required = false) SupportTicketStatus status,
            @RequestParam(required = false) UUID associateId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        page = Math.max(page, 0);
        size = Math.min(Math.max(size, 1), 100);
        return adminSupportTicketService.list(status, associateId, page, size);
    }
```

(Before writing, confirm `KycReviewController.list` indeed has no `@PreAuthorize` on its GET; if it does, add `@PreAuthorize("hasAuthority('ADMIN')")` here too for defense in depth.)

- [ ] **Step 4: Run to confirm it passes**

Run: `mvn -q test -Dtest=AdminSupportTicketQueueControllerTest,AdminSupportTicketControllerTest`
Expected: PASS (6 new + unit 1's create tests still green). Note the new test `@MockBean`s the service; unit 1's test does not, so they do not interfere.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/supportticket/AdminSupportTicketController.java \
        backend/src/test/java/com/plotchain/supportticket/AdminSupportTicketQueueControllerTest.java
git commit -m "feat(support-tickets): GET /api/admin/support-tickets with clamped paging (unit 2)"
```

---

### Task 4: `SecurityConfig` GET matcher + `SecurityConfigTest` rows

**Files:**
- Modify: `backend/src/main/java/com/plotchain/auth/SecurityConfig.java` (directly after the `/api/admin/kyc` GET matcher, ~line 378-379)
- Modify: `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java` (append after the unit 1 `adminSupportTicketCreateIsUnauthorizedWithoutAToken` test, ~line 575)

**Interfaces:**
- Consumes: the `@GetMapping` from Task 3 (real controller + real H2 `SupportTicketRepository` in `SecurityConfigTest`; `AssociateRepository` is a `@MockBean` there, but an empty queue never calls `findAllById`).
- Produces: GET matcher `"/api/admin/support-tickets", "/api/admin/support-tickets/*"` -> `hasAuthority("ADMIN")`. Unit 3 needs no edit here (its POST rides the blanket rule; its security rows go in the same test block).

- [ ] **Step 1: Write the failing tests**

Append (imports `get`, `status`, `ParameterizedTest`, `EnumSource`, `AssociateRole` already exist in this file; `get` is used by the kyc tests):

```java
    // support-tickets unit 2 (Decision 8): there is NO blanket GET /api/admin/** rule, so the queue
    // GET needs its own matcher or an associate token falls through to anyRequest().authenticated().
    // ADMIN reaches the real controller and the real (H2) repository: an empty queue is 200,
    // proving the request passed the security layer. Every other role is 403 at the filter.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminSupportTicketQueueIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        mockMvc.perform(get("/api/admin/support-tickets")
                .param("associateId", UUID.randomUUID().toString())
                .header("Authorization", "Bearer " + tokenFor(role)))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 200 : 403));
    }

    @Test
    void adminSupportTicketQueueIsUnauthorizedWithoutAToken() throws Exception {
        mockMvc.perform(get("/api/admin/support-tickets")).andExpect(status().isUnauthorized());
    }

    // "/api/admin/support-tickets" is an exact AntPathMatcher match and does not cover sub-paths;
    // the "/*" pattern keeps any future GET beneath it (and today's non-existent one) off
    // anyRequest().authenticated(). An associate must be 403, not 404/200.
    @Test
    void adminSupportTicketQueueSubPathIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/admin/support-tickets/" + UUID.randomUUID())
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }
```

(The `associateId` param is a random UUID so the real query returns an empty page regardless of rows other test classes left in H2.)

- [ ] **Step 2: Run to confirm they fail**

Run: `mvn -q test -Dtest=SecurityConfigTest#adminSupportTicketQueue*`
Expected: the ASSOCIATE row and the sub-path test FAIL (200 / 404 instead of 403 -- the leak the matcher closes); ADMIN and 401 rows pass.

- [ ] **Step 3: Add the matcher**

In `SecurityConfig.java`, directly after the `/api/admin/kyc` matcher:

```java
                // Admin support-ticket queue (support-tickets unit 2, Decision 8): no blanket GET
                // /api/admin/** rule exists, and "/api/admin/support-tickets" is an exact match that
                // does not cover sub-paths (same gotcha as /api/admin/kyc vs /api/admin/kyc/*).
                // POST (create, respond) is covered by the blanket POST /api/** -> ADMIN rule.
                .requestMatchers(HttpMethod.GET, "/api/admin/support-tickets", "/api/admin/support-tickets/*")
                    .hasAuthority("ADMIN")
```

- [ ] **Step 4: Run to confirm they pass**

Run: `mvn -q test -Dtest=SecurityConfigTest`
Expected: PASS, all prior rows plus 5 new (3 role rows + 401 + sub-path). If the full class shows only the known env noise, compare against a baseline run on master before concluding.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/auth/SecurityConfig.java \
        backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java
git commit -m "feat(support-tickets): ADMIN-only GET matcher for the ticket queue (unit 2)"
```

---

## Final verification

- [ ] From `<worktree>/backend`: `mvn -q test -Dtest=SupportTicketQueueRepositoryTest,AdminSupportTicketQueueServiceTest,AdminSupportTicketQueueControllerTest,AdminSupportTicketServiceTest,AdminSupportTicketControllerTest,SupportTicketSchemaTest,SecurityConfigTest` -- all green.
- [ ] Do NOT run the full suite for pass/fail (JDK21/25 Mockito env noise).
- [ ] Optional smoke (matches what plot-booking unit 8 did): against the dev Postgres, `GET /api/admin/support-tickets` with no filters, `status=OPEN`, and `associateId=<uuid>` all return 200 with no exception in the backend log. Not required for merge; the null-UUID/enum bind shape is already proven on Postgres by unit 8.

## Self-review

- Spec/units-file coverage: response shape and clamp (Tasks 2-3); independent + combined filters via one `searchQueue` (Task 1); full row content, no `GET /{id}`, `createdAt` DESC (Tasks 1, 3); SecurityConfig matcher + 403/401 row (Task 4); null param binding (Global Constraints + Task 1 tests).
- Types consistent: `searchQueue(SupportTicketStatus, UUID, Pageable)`, `list(SupportTicketStatus, UUID, int, int)`, `SupportTicketPageResponse(List<SupportTicketResponse> entries, int page, int size, long totalElements)` used identically across tasks.
- Out of scope (deliberately): no frontend, no unit 3/4 methods, no text search (spec Resolved decision 2).
