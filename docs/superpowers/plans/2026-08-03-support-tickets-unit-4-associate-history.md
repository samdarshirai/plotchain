# Support Tickets Unit 4: Associate Own Ticket History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `GET /api/associates/me/support-tickets` returns the calling associate's own tickets, paged, newest first, optional `status` filter, view-only.

**Architecture:** New `AssociateSupportTicketController` (bare `@RestController`, no class-level mapping, same shape as `AssociateBookingController`) -> new `AssociateSupportTicketService` -> `SupportTicketRepository` (two derived methods) + `AssociateRepository.findById`. `associateId` comes only from `@AuthenticationPrincipal UUID`. Rows built with the existing `SupportTicketResponse.of(ticket, associate)`. No `SecurityConfig` edit.

**Tech Stack:** Java 21, Spring Boot, Spring Data JPA, Spring Security, JUnit 5, Mockito, MockMvc.

**Spec:** `docs/superpowers/specs/role-capability/2026-08-03-support-tickets-domain-design.md` (Decisions 5, 8; Flows "Associate views their own ticket history"; Resolved decisions 1; Testing). Unit row: `docs/superpowers/plans/2026-08-03-support-tickets-units.md` unit 4.

## Global Constraints

- Package `com.plotchain.supportticket`; no Lombok; plain getters/setters (existing style).
- `page = Math.max(page, 0)`, `size = Math.min(size, 100)`, default size 20 (same clamp as `AssociateBookingController`). Note: `size` of 0 or negative makes `PageRequest.of` throw 500, same latent behavior as every existing endpoint; clamp the lower bound here with `Math.max(..., 1)` (cheap, new code).
- Sort `createdAt` desc via the derived repository method names; no separate `Sort`.
- Self-scoped by construction: no `associateId` request parameter, ever.
- No write route for associates. ADMIN token reaches the route, ungated (Resolved decision 1).
- Response shape: `SupportTicketResponse` rows (unchanged), page wrapper `SupportTicketPageResponse(List<SupportTicketResponse> entries, int page, int size, long totalElements)` (spec "DTOs").
- Do not commit as part of planning; implementers commit per task with the repo's attribution trailer.

## Overlap with units 2 and 3 (read before dispatching)

Units 2 and 3 are planned in parallel and edit `AdminSupportTicketService`, `AdminSupportTicketController`, `SupportTicketRepository`, and (unit 2) `SecurityConfig` + `SecurityConfigTest`. To avoid collisions this unit:

- puts service and controller in NEW files (no edits to the admin classes);
- touches `SupportTicketRepository.java` minimally: adds exactly two method lines. **This edit and the `SupportTicketPageResponse` file must be rebased after units 2-3 merge**: unit 2 will also need `SupportTicketPageResponse` (spec DTO list) and edits the same repository file (it removes the "added by units 2 and 4" comment lines). If unit 2 has merged first, skip Task 1 Step 3's file creation and just reuse the existing record; if unit 4 merges first, unit 2 must reuse it. Whoever merges second resolves the repository conflict by keeping both sets of methods;
- appends two rows to `SecurityConfigTest.java` near the existing `associateMeBookingsIsReachableByAnAssociateToken` (line ~819). Unit 2 appends nearby; rebase conflicts there are append-only.

## Review Focus

- Associate A must never see Associate B's tickets (test seeds both, asserts only caller's; repository verified called with the principal id only).
- Associate with zero tickets: `200` with empty `entries`, `totalElements` 0 (not 404).
- `page=-1` / `size=500` / `size=0`: clamped, not 500.
- Unknown/invalid `status` value (`?status=BOGUS`): Spring's enum binding returns 400 (not 500); pinned in the controller test.
- JWT principal whose `Associate` row is missing: `AssociateNotFoundException` (404 via existing handler); and ADMIN token (own id, no tickets) returns 200 empty.
- Unauthenticated: 401; ASSOCIATE token not 403.

## File Structure

- Create `backend/src/main/java/com/plotchain/supportticket/SupportTicketPageResponse.java` - page record.
- Create `backend/src/main/java/com/plotchain/supportticket/AssociateSupportTicketService.java` - `myTickets(associateId, status, page, size)`.
- Create `backend/src/main/java/com/plotchain/supportticket/AssociateSupportTicketController.java` - the route.
- Modify `backend/src/main/java/com/plotchain/supportticket/SupportTicketRepository.java` - two methods (rebase after units 2-3).
- Test (create) `backend/src/test/java/com/plotchain/supportticket/AssociateSupportTicketServiceTest.java`, `AssociateSupportTicketControllerTest.java`.
- Test (modify) `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java` - two rows.

Backend tests run from `backend/`: `mvn test -Dtest=<Class>` (the ~55 spurious Mockito JDK errors in a full run are a known env issue, unrelated).

---

### Task 1: Repository methods, page DTO, service

**Files:**
- Modify: `backend/src/main/java/com/plotchain/supportticket/SupportTicketRepository.java`
- Create: `backend/src/main/java/com/plotchain/supportticket/SupportTicketPageResponse.java`
- Create: `backend/src/main/java/com/plotchain/supportticket/AssociateSupportTicketService.java`
- Test: `backend/src/test/java/com/plotchain/supportticket/AssociateSupportTicketServiceTest.java`

**Interfaces:**
- Consumes: `SupportTicket`, `SupportTicketStatus`, `SupportTicketResponse.of(SupportTicket, Associate)`, `AssociateRepository.findById(UUID)`, `com.plotchain.associate.AssociateNotFoundException` (check its constructor at implementation time: `grep -n "AssociateNotFoundException(" backend/src/main/java/com/plotchain/associate/AssociateNotFoundException.java`; the unit-1 service `AdminSupportTicketService` already throws it, copy that call).
- Produces: `SupportTicketPageResponse(List<SupportTicketResponse> entries, int page, int size, long totalElements)`; `AssociateSupportTicketService(SupportTicketRepository, AssociateRepository)` with `SupportTicketPageResponse myTickets(UUID associateId, SupportTicketStatus status, int page, int size)`; repository `Page<SupportTicket> findByAssociateIdOrderByCreatedAtDesc(UUID, Pageable)` and `Page<SupportTicket> findByAssociateIdAndStatusOrderByCreatedAtDesc(UUID, SupportTicketStatus, Pageable)`.

- [ ] **Step 1: Write the failing service test**

```java
package com.plotchain.supportticket;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
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
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.any;

@ExtendWith(MockitoExtension.class)
class AssociateSupportTicketServiceTest {

    @Mock SupportTicketRepository supportTicketRepository;
    @Mock AssociateRepository associateRepository;

    AssociateSupportTicketService service;

    static final UUID ME = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        service = new AssociateSupportTicketService(supportTicketRepository, associateRepository);
    }

    private Associate me() {
        Associate a = new Associate();
        a.setId(ME);
        a.setUserId("VP00001");
        a.setName("Jane Doe");
        return a;
    }

    private SupportTicket ticket(SupportTicketStatus status) {
        SupportTicket t = new SupportTicket();
        t.setId(UUID.randomUUID());
        t.setAssociateId(ME);
        t.setSubject("Subject");
        t.setDescription("Desc");
        t.setStatus(status);
        t.setResponse("Done");
        t.setRespondedAt(Instant.parse("2026-10-01T00:00:00Z"));
        t.setCreatedAt(Instant.parse("2026-09-30T00:00:00Z"));
        t.setUpdatedAt(Instant.parse("2026-10-01T00:00:00Z"));
        return t;
    }

    @Test
    void myTicketsWithoutStatusQueriesByCallerIdOnlyAndMapsRowsWithAssociateNameAndUserId() {
        SupportTicket t = ticket(SupportTicketStatus.RESOLVED);
        when(associateRepository.findById(ME)).thenReturn(Optional.of(me()));
        when(supportTicketRepository.findByAssociateIdOrderByCreatedAtDesc(ME, PageRequest.of(2, 20)))
            .thenReturn(new PageImpl<>(List.of(t), PageRequest.of(2, 20), 41));

        SupportTicketPageResponse result = service.myTickets(ME, null, 2, 20);

        assertThat(result.page()).isEqualTo(2);
        assertThat(result.size()).isEqualTo(20);
        assertThat(result.totalElements()).isEqualTo(41);
        assertThat(result.entries()).hasSize(1);
        SupportTicketResponse row = result.entries().get(0);
        assertThat(row.id()).isEqualTo(t.getId());
        assertThat(row.associateId()).isEqualTo(ME);
        assertThat(row.associateUserId()).isEqualTo("VP00001");
        assertThat(row.associateName()).isEqualTo("Jane Doe");
        assertThat(row.status()).isEqualTo(SupportTicketStatus.RESOLVED);
        assertThat(row.response()).isEqualTo("Done");
        assertThat(row.respondedAt()).isEqualTo(t.getRespondedAt());
    }

    @Test
    void myTicketsWithStatusUsesTheStatusFilteredQuery() {
        when(associateRepository.findById(ME)).thenReturn(Optional.of(me()));
        when(supportTicketRepository.findByAssociateIdAndStatusOrderByCreatedAtDesc(
                ME, SupportTicketStatus.OPEN, PageRequest.of(0, 20)))
            .thenReturn(new PageImpl<>(List.of(ticket(SupportTicketStatus.OPEN))));

        SupportTicketPageResponse result = service.myTickets(ME, SupportTicketStatus.OPEN, 0, 20);

        assertThat(result.entries()).hasSize(1);
        verify(supportTicketRepository, never()).findByAssociateIdOrderByCreatedAtDesc(any(), any());
    }

    @Test
    void myTicketsForAnAssociateWithNoTicketsReturnsAnEmptyPageNotAnError() {
        when(associateRepository.findById(ME)).thenReturn(Optional.of(me()));
        when(supportTicketRepository.findByAssociateIdOrderByCreatedAtDesc(ME, PageRequest.of(0, 20)))
            .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 20), 0));

        SupportTicketPageResponse result = service.myTickets(ME, null, 0, 20);

        assertThat(result.entries()).isEmpty();
        assertThat(result.totalElements()).isZero();
    }

    @Test
    void myTicketsThrowsAssociateNotFoundWhenThePrincipalHasNoAssociateRow() {
        when(associateRepository.findById(ME)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.myTickets(ME, null, 0, 20))
            .isInstanceOf(AssociateNotFoundException.class);
        verify(supportTicketRepository, never()).findByAssociateIdOrderByCreatedAtDesc(any(), any());
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run (from `backend/`): `mvn test -Dtest=AssociateSupportTicketServiceTest`
Expected: compilation FAIL (`AssociateSupportTicketService`, `SupportTicketPageResponse`, repository methods missing).

- [ ] **Step 3: Implement**

`SupportTicketRepository.java` (replace the placeholder comment lines only if unit 2/3 have not already rewritten them; otherwise just add the two methods):

```java
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface SupportTicketRepository extends JpaRepository<SupportTicket, UUID> {
    Page<SupportTicket> findByAssociateIdOrderByCreatedAtDesc(UUID associateId, Pageable pageable);
    Page<SupportTicket> findByAssociateIdAndStatusOrderByCreatedAtDesc(UUID associateId, SupportTicketStatus status, Pageable pageable);
}
```

`SupportTicketPageResponse.java` (skip if unit 2 already merged it):

```java
package com.plotchain.supportticket;

import java.util.List;

public record SupportTicketPageResponse(List<SupportTicketResponse> entries, int page, int size, long totalElements) {
}
```

`AssociateSupportTicketService.java`:

```java
package com.plotchain.supportticket;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

// Read-only, self-scoped history. Every ticket on the page belongs to associateId (the query is
// keyed on it), so the one Associate lookup serves every row's name/userId.
@Service
public class AssociateSupportTicketService {

    private final SupportTicketRepository supportTicketRepository;
    private final AssociateRepository associateRepository;

    public AssociateSupportTicketService(SupportTicketRepository supportTicketRepository,
                                         AssociateRepository associateRepository) {
        this.supportTicketRepository = supportTicketRepository;
        this.associateRepository = associateRepository;
    }

    @Transactional(readOnly = true)
    public SupportTicketPageResponse myTickets(UUID associateId, SupportTicketStatus status, int page, int size) {
        Associate associate = associateRepository.findById(associateId)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));
        PageRequest pageable = PageRequest.of(page, size);
        Page<SupportTicket> result = status == null
            ? supportTicketRepository.findByAssociateIdOrderByCreatedAtDesc(associateId, pageable)
            : supportTicketRepository.findByAssociateIdAndStatusOrderByCreatedAtDesc(associateId, status, pageable);
        return new SupportTicketPageResponse(
            result.getContent().stream().map(t -> SupportTicketResponse.of(t, associate)).toList(),
            page, size, result.getTotalElements());
    }
}
```

(If `AssociateNotFoundException` takes a different argument, copy the exact call from `AdminSupportTicketService.create`.)

- [ ] **Step 4: Run to verify it passes**

Run: `mvn test -Dtest=AssociateSupportTicketServiceTest`
Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/supportticket/SupportTicketRepository.java \
  backend/src/main/java/com/plotchain/supportticket/SupportTicketPageResponse.java \
  backend/src/main/java/com/plotchain/supportticket/AssociateSupportTicketService.java \
  backend/src/test/java/com/plotchain/supportticket/AssociateSupportTicketServiceTest.java
git commit -m "feat(support-tickets): associate own-history service with status filter"
```

---

### Task 2: Controller + endpoint tests

**Files:**
- Create: `backend/src/main/java/com/plotchain/supportticket/AssociateSupportTicketController.java`
- Test: `backend/src/test/java/com/plotchain/supportticket/AssociateSupportTicketControllerTest.java`

**Interfaces:**
- Consumes: `AssociateSupportTicketService.myTickets(UUID, SupportTicketStatus, int, int)`, `SupportTicketPageResponse`.
- Produces: `GET /api/associates/me/support-tickets?status=&page=&size=` -> `SupportTicketPageResponse` JSON (`entries[]`, `page`, `size`, `totalElements`).

- [ ] **Step 1: Write the failing controller test** (service mocked, mirrors `AssociateBookingControllerTest`; the "only the caller's" guarantee is also covered with a real-service slice below)

```java
package com.plotchain.supportticket;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.auth.JwtService;
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
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AssociateSupportTicketControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;
    @MockBean SupportTicketRepository supportTicketRepository;

    private Associate associate(UUID id, AssociateRole role, String userId, String name) {
        Associate a = new Associate();
        a.setId(id);
        a.setRole(role);
        a.setUserId(userId);
        a.setName(name);
        when(associateRepository.findById(id)).thenReturn(Optional.of(a));
        return a;
    }

    private String tokenFor(Associate a) {
        return "Bearer " + jwtService.generateToken(a);
    }

    private SupportTicket ticket(UUID associateId, String subject, SupportTicketStatus status) {
        SupportTicket t = new SupportTicket();
        t.setId(UUID.randomUUID());
        t.setAssociateId(associateId);
        t.setSubject(subject);
        t.setDescription("Desc");
        t.setStatus(status);
        t.setCreatedAt(Instant.now());
        t.setUpdatedAt(Instant.now());
        return t;
    }

    @Test
    void returnsOnlyTheCallersTicketsAndQueriesByTheJwtAssociateId() throws Exception {
        UUID meId = UUID.randomUUID();
        UUID otherId = UUID.randomUUID();
        Associate me = associate(meId, AssociateRole.ASSOCIATE, "VP00001", "Jane Doe");
        associate(otherId, AssociateRole.ASSOCIATE, "VP00002", "Other Person");
        when(supportTicketRepository.findByAssociateIdOrderByCreatedAtDesc(eq(meId), eq(PageRequest.of(0, 20))))
            .thenReturn(new PageImpl<>(List.of(ticket(meId, "Mine", SupportTicketStatus.OPEN)), PageRequest.of(0, 20), 1));
        when(supportTicketRepository.findByAssociateIdOrderByCreatedAtDesc(eq(otherId), any()))
            .thenReturn(new PageImpl<>(List.of(ticket(otherId, "Not mine", SupportTicketStatus.OPEN))));

        mockMvc.perform(get("/api/associates/me/support-tickets").header("Authorization", tokenFor(me)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.entries.length()").value(1))
            .andExpect(jsonPath("$.entries[0].subject").value("Mine"))
            .andExpect(jsonPath("$.entries[0].associateUserId").value("VP00001"))
            .andExpect(jsonPath("$.entries[0].associateName").value("Jane Doe"))
            .andExpect(jsonPath("$.totalElements").value(1));
        verify(supportTicketRepository, never()).findByAssociateIdOrderByCreatedAtDesc(eq(otherId), any());
    }

    @Test
    void anAssociateIdQueryParamIsIgnoredSoNoOneCanReadAnotherAssociatesTickets() throws Exception {
        UUID meId = UUID.randomUUID();
        UUID otherId = UUID.randomUUID();
        Associate me = associate(meId, AssociateRole.ASSOCIATE, "VP00001", "Jane Doe");
        when(supportTicketRepository.findByAssociateIdOrderByCreatedAtDesc(any(), any()))
            .thenReturn(new PageImpl<>(List.of()));

        mockMvc.perform(get("/api/associates/me/support-tickets")
                .param("associateId", otherId.toString())
                .header("Authorization", tokenFor(me)))
            .andExpect(status().isOk());
        verify(supportTicketRepository).findByAssociateIdOrderByCreatedAtDesc(eq(meId), any());
        verify(supportTicketRepository, never()).findByAssociateIdOrderByCreatedAtDesc(eq(otherId), any());
    }

    @Test
    void statusParamSelectsTheStatusFilteredQuery() throws Exception {
        UUID meId = UUID.randomUUID();
        Associate me = associate(meId, AssociateRole.ASSOCIATE, "VP00001", "Jane Doe");
        when(supportTicketRepository.findByAssociateIdAndStatusOrderByCreatedAtDesc(
                eq(meId), eq(SupportTicketStatus.RESOLVED), any()))
            .thenReturn(new PageImpl<>(List.of(ticket(meId, "Done one", SupportTicketStatus.RESOLVED))));

        mockMvc.perform(get("/api/associates/me/support-tickets").param("status", "RESOLVED")
                .header("Authorization", tokenFor(me)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.entries[0].status").value("RESOLVED"));
    }

    @Test
    void emptyHistoryIs200WithAnEmptyEntriesList() throws Exception {
        UUID meId = UUID.randomUUID();
        Associate me = associate(meId, AssociateRole.ASSOCIATE, "VP00001", "Jane Doe");
        when(supportTicketRepository.findByAssociateIdOrderByCreatedAtDesc(eq(meId), any()))
            .thenReturn(new PageImpl<>(List.of()));

        mockMvc.perform(get("/api/associates/me/support-tickets").header("Authorization", tokenFor(me)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.entries.length()").value(0))
            .andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    void clampsNegativePageZeroSizeAndOversizedSize() throws Exception {
        UUID meId = UUID.randomUUID();
        Associate me = associate(meId, AssociateRole.ASSOCIATE, "VP00001", "Jane Doe");
        when(supportTicketRepository.findByAssociateIdOrderByCreatedAtDesc(eq(meId), eq(PageRequest.of(0, 100))))
            .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 100), 0));
        when(supportTicketRepository.findByAssociateIdOrderByCreatedAtDesc(eq(meId), eq(PageRequest.of(0, 1))))
            .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 1), 0));

        mockMvc.perform(get("/api/associates/me/support-tickets").param("page", "-1").param("size", "500")
                .header("Authorization", tokenFor(me)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.size").value(100)).andExpect(jsonPath("$.page").value(0));
        mockMvc.perform(get("/api/associates/me/support-tickets").param("size", "0")
                .header("Authorization", tokenFor(me)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.size").value(1));
    }

    @Test
    void anUnknownStatusValueIsA400NotA500() throws Exception {
        Associate me = associate(UUID.randomUUID(), AssociateRole.ASSOCIATE, "VP00001", "Jane Doe");
        mockMvc.perform(get("/api/associates/me/support-tickets").param("status", "BOGUS")
                .header("Authorization", tokenFor(me)))
            .andExpect(status().isBadRequest());
    }

    @Test
    void anAdminTokenReachesTheRouteUngatedAndSeesItsOwnEmptyHistory() throws Exception {
        UUID adminId = UUID.randomUUID();
        Associate admin = associate(adminId, AssociateRole.ADMIN, "ADMIN01", "Admin");
        when(supportTicketRepository.findByAssociateIdOrderByCreatedAtDesc(eq(adminId), any()))
            .thenReturn(new PageImpl<>(List.of()));

        mockMvc.perform(get("/api/associates/me/support-tickets").header("Authorization", tokenFor(admin)))
            .andExpect(status().isOk());
    }

    @Test
    void unauthenticatedIs401() throws Exception {
        mockMvc.perform(get("/api/associates/me/support-tickets")).andExpect(status().isUnauthorized());
    }

    @Test
    void thereIsNoWriteRouteForAssociatesOnTheirTicketHistory() throws Exception {
        Associate me = associate(UUID.randomUUID(), AssociateRole.ASSOCIATE, "VP00001", "Jane Doe");
        mockMvc.perform(post("/api/associates/me/support-tickets").contentType("application/json").content("{}")
                .header("Authorization", tokenFor(me)))
            .andExpect(status().is4xxClientError());
        verify(supportTicketRepository, never()).save(any());
    }
}
```

Note: these tests use the real `AssociateSupportTicketService` with mocked repositories (so they also prove the end-to-end scoping). If the 400 test returns 500 or a different status in this app's exception handling (check the global `@RestControllerAdvice` for `MethodArgumentTypeMismatchException`), adjust the assertion to the actual established behavior and record it in the commit message; do not add a handler.

- [ ] **Step 2: Run to verify it fails**

Run: `mvn test -Dtest=AssociateSupportTicketControllerTest`
Expected: FAIL (404 on the route: controller not defined).

- [ ] **Step 3: Implement**

```java
package com.plotchain.supportticket;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

// Bare @RestController (no class-level @RequestMapping), same shape as AssociateBookingController
// and the spec's AssociateSupportTicketController. Self-scoped by construction: associateId only
// ever comes from the verified JWT. No SecurityConfig matcher: a bare GET falls through to
// anyRequest().authenticated(), like GET /api/associates/me/bookings and /me/sales. ADMIN tokens
// reach it ungated (spec Resolved decision 1).
@RestController
public class AssociateSupportTicketController {

    private final AssociateSupportTicketService associateSupportTicketService;

    public AssociateSupportTicketController(AssociateSupportTicketService associateSupportTicketService) {
        this.associateSupportTicketService = associateSupportTicketService;
    }

    @GetMapping("/api/associates/me/support-tickets")
    public SupportTicketPageResponse myTickets(
            @AuthenticationPrincipal UUID associateId,
            @RequestParam(required = false) SupportTicketStatus status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        page = Math.max(page, 0);
        size = Math.max(Math.min(size, 100), 1);
        return associateSupportTicketService.myTickets(associateId, status, page, size);
    }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `mvn test -Dtest=AssociateSupportTicketControllerTest,AssociateSupportTicketServiceTest`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/supportticket/AssociateSupportTicketController.java \
  backend/src/test/java/com/plotchain/supportticket/AssociateSupportTicketControllerTest.java
git commit -m "feat(support-tickets): GET /api/associates/me/support-tickets own history"
```

---

### Task 3: SecurityConfig coverage (tests only, no matcher)

**Files:**
- Test: `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java` (append next to `associateMeBookingsIsReachableByAnAssociateToken`, ~line 819)

**Interfaces:**
- Consumes: existing `tokenFor(AssociateRole)` helper, `not(...)` and `get(...)` imports already used by the bookings row.
- Produces: none.

First verify the premise: `grep -n "anyRequest" backend/src/main/java/com/plotchain/auth/SecurityConfig.java` shows `anyRequest().authenticated()` and `grep -n "support-tickets" .../SecurityConfig.java` shows no matcher that catches `/api/associates/me/support-tickets` (unit 2's `GET /api/admin/support-tickets` matcher must not affect it). If either is wrong, stop and report rather than editing SecurityConfig.

- [ ] **Step 1: Write the rows**

```java
    // support-tickets unit 4: GET /api/associates/me/support-tickets needs no SecurityConfig
    // matcher (bare GET -> anyRequest().authenticated(), like /me/bookings above). Reachable by
    // ASSOCIATE and, unguarded per spec Resolved decision 1, by ADMIN; 401 without a token.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void associateMeSupportTicketsIsReachableByEveryAuthenticatedRole(AssociateRole role) throws Exception {
        mockMvc.perform(get("/api/associates/me/support-tickets")
                .header("Authorization", "Bearer " + tokenFor(role)))
            .andExpect(status().is(not(403)));
    }

    @Test
    void associateMeSupportTicketsIsUnauthorizedWithoutAToken() throws Exception {
        mockMvc.perform(get("/api/associates/me/support-tickets"))
            .andExpect(status().isUnauthorized());
    }
```

(Confirm `@ParameterizedTest`/`@EnumSource` are already imported - the unit-1 row uses them. `not(403)` can pass on a 404/500 from downstream mocked repos; that is the same accepted proof as the bookings row. Add `.andExpect(status().is(not(401)))` is unnecessary.)

- [ ] **Step 2: Run**

Run: `mvn test -Dtest=SecurityConfigTest`
Expected: PASS (rows pass immediately because Task 2's controller exists; they are regression pins, so no red phase is possible without removing the controller).

- [ ] **Step 3: Commit**

```bash
git add backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java
git commit -m "test(support-tickets): SecurityConfigTest rows for associate own-history route"
```

---

## Self-Review

- Spec coverage: caller-only via `@AuthenticationPrincipal` (Tasks 1-2 tests); optional status, page/size clamp, createdAt desc (derived method names); two-associate seed (Task 2 test 1); no new matcher + ADMIN ungated + 401 (Task 3 + Task 2); no associate write route (Task 2 last test). View-only response fields come from the existing `SupportTicketResponse`.
- Placeholders: none; one runtime check (`AssociateNotFoundException` constructor) points to the exact file to copy.
- Types: `SupportTicketPageResponse`, `myTickets(UUID, SupportTicketStatus, int, int)` and repository method names are identical across tasks.

## Coordinator decisions (user-approved 2026-10-06)

- Unit 2 owns `SupportTicketPageResponse` and merges first. Unit 4 REUSES the existing record; do not create it. Rebase after units 2 and 3 merge.
- `size` clamped to a minimum of 1 (max 100, default 20).
- Bad `status` value: expect 400; check the global advice, match actual behaviour, add no handler.
