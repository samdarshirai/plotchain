# Support Tickets Unit 3: Admin Responds To / Changes Status Of A Ticket Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An ADMIN can `POST /api/admin/support-tickets/{id}/respond` with `{status, response?}` to set a ticket's status and (optionally) replace its single response.

**Architecture:** Add one `respond` method to the existing `AdminSupportTicketService` and one route to the existing `AdminSupportTicketController`, plus three new small files (request DTO, two exceptions) and two handlers in the existing `SupportTicketExceptionHandler` shell. No migration, no repository change (inherited `findById`), no `SecurityConfig` change (blanket `POST /api/**` -> ADMIN rule + `@PreAuthorize`).

**Tech Stack:** Spring Boot 3 / JPA / H2 (tests) / JUnit5 + Mockito + AssertJ + MockMvc.

**Spec:** `docs/superpowers/specs/role-capability/2026-08-03-support-tickets-domain-design.md` (Decisions 2, 3, 4, 8, 9; Flows "Admin responds"; Error handling; Testing). Unit source: `docs/superpowers/plans/2026-08-03-support-tickets-units.md`, unit 3.

## Global Constraints

- **Sequencing: implement AFTER unit 2 (admin queue GET) is merged**, in a worktree branched from master containing unit 2. Unit 2 edits the same `AdminSupportTicketService`, `AdminSupportTicketController`, `SupportTicketRepository` and `SecurityConfigTest` (and `SecurityConfig`). This plan assumes only unit 1's state plus "unit 2 added more members/imports to those files". Every edit below is an **append** (new method at the end of the class body, new imports merged into the existing import block). If the plan is executed before unit 2 or the files differ from what is described, locate the equivalent anchor (last method of the class) and append there; do not overwrite whole files. Unit 3 does not touch `SupportTicketRepository` at all.
- Unit 3 does NOT add a service/controller test to `AdminSupportTicketServiceTest` / `AdminSupportTicketControllerTest` (unit 2 edits those too). New tests live in NEW classes `AdminSupportTicketRespondServiceTest` and `AdminSupportTicketRespondControllerTest`. The only edited existing test file is `SecurityConfigTest` (append rows).
- `SupportTicket` has no `@PreUpdate`: `respond` MUST set `updatedAt = now` by hand.
- Missing ticket: new `SupportTicketNotFoundException(UUID id)` -> 404 `{"error": msg}`, mapped in `SupportTicketExceptionHandler`. Blank-response guard: `InvalidSupportTicketResponseException(String)` -> 400 `{"error": msg}`. Same body shape as `BookingExceptionHandler`. Do NOT map `AssociateNotFoundException` here (already global; see the shell's header comment).
- Semantics (spec Decisions 2-4, Flows): single response field, replaced (never appended) when a non-blank response is given; `respondedAt = now` only then; status-only change leaves `response`/`respondedAt` untouched; whitespace-only response counts as "not provided"; `RESOLVED`/`CLOSED` with null/blank response -> 400 (even if the ticket already holds an older response: spec says "response required when the new status is RESOLVED/CLOSED"); any transition allowed incl. reopening (no state machine). Response text is stored exactly as sent (no trim).
- Order of checks: ticket lookup (404) first, then blank-response guard (400), then associate lookup, then writes. A rejected request writes nothing and audits nothing.
- Audit via `settingsAuditService.record("support-ticket", summary, detail, actorId)`; detail carries the new status and the response truncated to 200 chars (+ `...`) when one was provided. Detail is built with `LinkedHashMap` (`Map.of` rejects null values and the response key must be absent for status-only).
- Concurrency: last write wins (single Admin account, spec Decision 6). No locking.
- `@PreAuthorize("hasAuthority('ADMIN')")` on the method; ASSOCIATE 403, unauthenticated 401.
- Success returns 200 with `SupportTicketResponse.of(saved, associate)` (existing).
- Backend test env noise: do NOT run the whole suite (~55 spurious Mockito JDK errors). Run only classes named in each task from `/Users/ronalisenapati/Ronali/plotchain/backend` using `mvn test -Dtest=<Class>`; only failures inside them are real. Build `SettingsAuditService` for real around a mocked `SettingsAuditLogRepository` (as unit 1's service test does); never `@Mock` it.
- Scope: this unit only. No GET, no frontend, no migration. The plan author makes no commit; commit steps are for the executor, each ending with trailers `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01Qebsn6vZHDsjj8khCRiDEV`.

## Review Focus

- Re-replying replaces the previous reply and refreshes `respondedAt` (Task 1 test).
- Status-only `OPEN -> IN_PROGRESS` must not null the existing response or bump `respondedAt`; whitespace-only response behaves as status-only (Task 1 tests).
- `RESOLVED`/`CLOSED` with null, empty, or whitespace-only response is 400 and writes/audits nothing (Task 1 + Task 2 tests).
- Unknown `status` string (`"BOGUS"`) or malformed path UUID must be 400, not 500 (Task 2 tests).
- A very long response must not bloat the audit row (truncation test, Task 1).
- `updatedAt` must advance on every successful respond (no `@PreUpdate`) (Task 1 test).

## File Structure

- Create `backend/src/main/java/com/plotchain/supportticket/RespondToSupportTicketRequest.java`
- Create `backend/src/main/java/com/plotchain/supportticket/SupportTicketNotFoundException.java`
- Create `backend/src/main/java/com/plotchain/supportticket/InvalidSupportTicketResponseException.java`
- Modify (append) `.../supportticket/SupportTicketExceptionHandler.java`: two `@ExceptionHandler` methods.
- Modify (append) `.../supportticket/AdminSupportTicketService.java`: `respond` method + constant + imports.
- Modify (append) `.../supportticket/AdminSupportTicketController.java`: `respond` route + imports (`PathVariable`).
- Create tests `.../test/.../supportticket/AdminSupportTicketRespondServiceTest.java`, `AdminSupportTicketRespondControllerTest.java`.
- Modify (append) `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`: rows after the support-ticket create rows.

---

### Task 1: DTO, exceptions, handler, and `respond` service logic

**Files:**
- Create: the three new main files above
- Modify: `SupportTicketExceptionHandler.java`, `AdminSupportTicketService.java`
- Test: `AdminSupportTicketRespondServiceTest.java` (new)

**Interfaces:**
- Consumes (unit 1, on master): `SupportTicketRepository.findById/save`, `AssociateRepository.findById(UUID)`, `SettingsAuditService.record(String, String, Object, UUID)`, `SupportTicketResponse.of(SupportTicket, Associate)`, `AssociateNotFoundException(UUID)`, `SupportTicket` setters.
- Produces: `RespondToSupportTicketRequest(SupportTicketStatus status, String response)`; `AdminSupportTicketService#respond(UUID id, RespondToSupportTicketRequest request, UUID actorId)` returning `SupportTicketResponse`; the two exceptions (Task 2 and the handler rely on them).

- [ ] **Step 1: Create the DTO and exceptions (needed to compile the tests)**

```java
package com.plotchain.supportticket;

import jakarta.validation.constraints.NotNull;

public record RespondToSupportTicketRequest(@NotNull SupportTicketStatus status, String response) {}
```

```java
package com.plotchain.supportticket;

import java.util.UUID;

public class SupportTicketNotFoundException extends RuntimeException {
    public SupportTicketNotFoundException(UUID id) {
        super("Support ticket not found: " + id);
    }
}
```

```java
package com.plotchain.supportticket;

public class InvalidSupportTicketResponseException extends RuntimeException {
    public InvalidSupportTicketResponseException(String message) {
        super(message);
    }
}
```

- [ ] **Step 2: Write the failing service tests**

Create `AdminSupportTicketRespondServiceTest.java`:

```java
package com.plotchain.supportticket;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.company.SettingsAuditLog;
import com.plotchain.company.SettingsAuditLogRepository;
import com.plotchain.company.SettingsAuditService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdminSupportTicketRespondServiceTest {

    @Mock SupportTicketRepository supportTicketRepository;
    @Mock AssociateRepository associateRepository;
    @Mock SettingsAuditLogRepository settingsAuditLogRepository;

    AdminSupportTicketService service;

    private static final UUID ACTOR_ID = UUID.randomUUID();
    private static final UUID ASSOCIATE_ID = UUID.randomUUID();
    private static final UUID TICKET_ID = UUID.randomUUID();
    private static final Instant OLD = Instant.now().minus(2, ChronoUnit.DAYS);

    @BeforeEach
    void setUp() {
        SettingsAuditService audit = new SettingsAuditService(
            settingsAuditLogRepository, associateRepository, new ObjectMapper().findAndRegisterModules());
        service = new AdminSupportTicketService(supportTicketRepository, associateRepository, audit);
    }

    private SupportTicket ticket(SupportTicketStatus status, String response, Instant respondedAt) {
        SupportTicket t = new SupportTicket();
        t.setId(TICKET_ID);
        t.setAssociateId(ASSOCIATE_ID);
        t.setSubject("Wallet blank");
        t.setDescription("Page is empty");
        t.setStatus(status);
        t.setResponse(response);
        t.setRespondedAt(respondedAt);
        t.setCreatedAt(OLD);
        t.setUpdatedAt(OLD);
        return t;
    }

    private void stubFound(SupportTicket t) {
        when(supportTicketRepository.findById(TICKET_ID)).thenReturn(Optional.of(t));
        Associate a = new Associate();
        a.setId(ASSOCIATE_ID);
        a.setUserId("VP00001");
        a.setName("Jane Doe");
        a.setRole(AssociateRole.ASSOCIATE);
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(a));
        when(supportTicketRepository.save(any(SupportTicket.class))).thenAnswer(i -> i.getArgument(0));
    }

    @Test
    void respondSetsStatusResponseRespondedAtAndUpdatedAtAndReturnsTheTicketRow() {
        stubFound(ticket(SupportTicketStatus.OPEN, null, null));

        SupportTicketResponse out = service.respond(TICKET_ID,
            new RespondToSupportTicketRequest(SupportTicketStatus.RESOLVED, "Fixed, please retry"), ACTOR_ID);

        ArgumentCaptor<SupportTicket> captor = ArgumentCaptor.forClass(SupportTicket.class);
        verify(supportTicketRepository).save(captor.capture());
        SupportTicket saved = captor.getValue();
        assertThat(saved.getStatus()).isEqualTo(SupportTicketStatus.RESOLVED);
        assertThat(saved.getResponse()).isEqualTo("Fixed, please retry");
        assertThat(saved.getRespondedAt()).isNotNull().isAfter(OLD);
        assertThat(saved.getUpdatedAt()).isAfter(OLD);
        assertThat(saved.getCreatedAt()).isEqualTo(OLD);

        assertThat(out.id()).isEqualTo(TICKET_ID);
        assertThat(out.status()).isEqualTo(SupportTicketStatus.RESOLVED);
        assertThat(out.response()).isEqualTo("Fixed, please retry");
        assertThat(out.associateUserId()).isEqualTo("VP00001");
        assertThat(out.associateName()).isEqualTo("Jane Doe");
    }

    @Test
    void aNewReplyReplacesThePreviousReplyAndRefreshesRespondedAt() {
        stubFound(ticket(SupportTicketStatus.IN_PROGRESS, "old reply", OLD));

        service.respond(TICKET_ID, new RespondToSupportTicketRequest(SupportTicketStatus.IN_PROGRESS, "new reply"), ACTOR_ID);

        ArgumentCaptor<SupportTicket> captor = ArgumentCaptor.forClass(SupportTicket.class);
        verify(supportTicketRepository).save(captor.capture());
        assertThat(captor.getValue().getResponse()).isEqualTo("new reply");
        assertThat(captor.getValue().getRespondedAt()).isAfter(OLD);
    }

    @Test
    void statusOnlyChangeKeepsExistingResponseAndRespondedAtButBumpsUpdatedAt() {
        stubFound(ticket(SupportTicketStatus.OPEN, "old reply", OLD));

        service.respond(TICKET_ID, new RespondToSupportTicketRequest(SupportTicketStatus.IN_PROGRESS, null), ACTOR_ID);

        ArgumentCaptor<SupportTicket> captor = ArgumentCaptor.forClass(SupportTicket.class);
        verify(supportTicketRepository).save(captor.capture());
        SupportTicket saved = captor.getValue();
        assertThat(saved.getStatus()).isEqualTo(SupportTicketStatus.IN_PROGRESS);
        assertThat(saved.getResponse()).isEqualTo("old reply");
        assertThat(saved.getRespondedAt()).isEqualTo(OLD);
        assertThat(saved.getUpdatedAt()).isAfter(OLD);
    }

    @Test
    void whitespaceOnlyResponseOnANonTerminalStatusIsTreatedAsNotProvided() {
        stubFound(ticket(SupportTicketStatus.OPEN, null, null));

        service.respond(TICKET_ID, new RespondToSupportTicketRequest(SupportTicketStatus.IN_PROGRESS, "   "), ACTOR_ID);

        ArgumentCaptor<SupportTicket> captor = ArgumentCaptor.forClass(SupportTicket.class);
        verify(supportTicketRepository).save(captor.capture());
        assertThat(captor.getValue().getResponse()).isNull();
        assertThat(captor.getValue().getRespondedAt()).isNull();
    }

    @Test
    void reopeningAResolvedTicketWithoutAResponseIsAllowed() {
        stubFound(ticket(SupportTicketStatus.RESOLVED, "done", OLD));

        SupportTicketResponse out = service.respond(TICKET_ID,
            new RespondToSupportTicketRequest(SupportTicketStatus.OPEN, null), ACTOR_ID);

        assertThat(out.status()).isEqualTo(SupportTicketStatus.OPEN);
        assertThat(out.response()).isEqualTo("done");
    }

    @ParameterizedTest
    @EnumSource(value = SupportTicketStatus.class, names = {"RESOLVED", "CLOSED"})
    void resolvedOrClosedWithANullResponseIsRejectedAndWritesNothing(SupportTicketStatus status) {
        when(supportTicketRepository.findById(TICKET_ID)).thenReturn(Optional.of(ticket(SupportTicketStatus.OPEN, "older reply", OLD)));

        assertThatThrownBy(() -> service.respond(TICKET_ID, new RespondToSupportTicketRequest(status, null), ACTOR_ID))
            .isInstanceOf(InvalidSupportTicketResponseException.class);

        verify(supportTicketRepository, never()).save(any());
        verifyNoInteractions(settingsAuditLogRepository);
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "   ", "\n\t"})
    void resolvedWithABlankResponseIsRejectedAndWritesNothing(String blank) {
        when(supportTicketRepository.findById(TICKET_ID)).thenReturn(Optional.of(ticket(SupportTicketStatus.OPEN, null, null)));

        assertThatThrownBy(() -> service.respond(TICKET_ID,
            new RespondToSupportTicketRequest(SupportTicketStatus.RESOLVED, blank), ACTOR_ID))
            .isInstanceOf(InvalidSupportTicketResponseException.class);

        verify(supportTicketRepository, never()).save(any());
        verifyNoInteractions(settingsAuditLogRepository);
    }

    @Test
    void unknownTicketThrowsNotFoundAndWritesNothing() {
        when(supportTicketRepository.findById(TICKET_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.respond(TICKET_ID,
            new RespondToSupportTicketRequest(SupportTicketStatus.IN_PROGRESS, null), ACTOR_ID))
            .isInstanceOf(SupportTicketNotFoundException.class);

        verify(supportTicketRepository, never()).save(any());
        verifyNoInteractions(settingsAuditLogRepository);
    }

    @Test
    void respondAuditsUnderSupportTicketWithNewStatusAndResponse() {
        stubFound(ticket(SupportTicketStatus.OPEN, null, null));

        service.respond(TICKET_ID, new RespondToSupportTicketRequest(SupportTicketStatus.RESOLVED, "Fixed"), ACTOR_ID);

        ArgumentCaptor<SettingsAuditLog> captor = ArgumentCaptor.forClass(SettingsAuditLog.class);
        verify(settingsAuditLogRepository).save(captor.capture());
        SettingsAuditLog log = captor.getValue();
        assertThat(log.getSection()).isEqualTo("support-ticket");
        assertThat(log.getSummary()).isEqualTo("Responded to ticket " + TICKET_ID + " for VP00001: status RESOLVED");
        assertThat(log.getChangedByAssociateId()).isEqualTo(ACTOR_ID);
        assertThat(log.getDetail()).contains(TICKET_ID.toString()).contains("RESOLVED").contains("Fixed");
    }

    @Test
    void auditTruncatesALongResponseTo200Chars() {
        stubFound(ticket(SupportTicketStatus.OPEN, null, null));

        service.respond(TICKET_ID, new RespondToSupportTicketRequest(SupportTicketStatus.RESOLVED, "x".repeat(500)), ACTOR_ID);

        ArgumentCaptor<SettingsAuditLog> captor = ArgumentCaptor.forClass(SettingsAuditLog.class);
        verify(settingsAuditLogRepository).save(captor.capture());
        assertThat(captor.getValue().getDetail()).contains("x".repeat(200)).doesNotContain("x".repeat(201));
    }

    @Test
    void auditForAStatusOnlyChangeHasNoResponseKey() {
        stubFound(ticket(SupportTicketStatus.OPEN, "old reply", OLD));

        service.respond(TICKET_ID, new RespondToSupportTicketRequest(SupportTicketStatus.IN_PROGRESS, null), ACTOR_ID);

        ArgumentCaptor<SettingsAuditLog> captor = ArgumentCaptor.forClass(SettingsAuditLog.class);
        verify(settingsAuditLogRepository).save(captor.capture());
        assertThat(captor.getValue().getDetail()).contains("IN_PROGRESS").doesNotContain("response").doesNotContain("old reply");
    }
}
```

- [ ] **Step 3: Run to confirm failure**

Run: `cd /Users/ronalisenapati/Ronali/plotchain/backend && mvn test -Dtest=AdminSupportTicketRespondServiceTest`
Expected: compilation FAIL (`respond` not defined on `AdminSupportTicketService`).

- [ ] **Step 4: Implement `respond` (append to the service class)**

Add imports if absent: `java.util.LinkedHashMap`. Append inside `AdminSupportTicketService`, after the last existing method (unit 1's `create`, or unit 2's `list` if present):

```java
    private static final int AUDIT_RESPONSE_MAX = 200;

    @Transactional
    public SupportTicketResponse respond(UUID id, RespondToSupportTicketRequest request, UUID actorId) {
        SupportTicket ticket = supportTicketRepository.findById(id)
            .orElseThrow(() -> new SupportTicketNotFoundException(id));

        SupportTicketStatus status = request.status();
        boolean hasResponse = request.response() != null && !request.response().isBlank();
        if (!hasResponse && (status == SupportTicketStatus.RESOLVED || status == SupportTicketStatus.CLOSED)) {
            throw new InvalidSupportTicketResponseException("A response is required when a ticket is " + status);
        }

        // FK guarantees the associate exists; orElseThrow only guards a corrupted DB.
        Associate associate = associateRepository.findById(ticket.getAssociateId())
            .orElseThrow(() -> new AssociateNotFoundException(ticket.getAssociateId()));

        // No @PreUpdate on SupportTicket: updatedAt is set by hand.
        Instant now = Instant.now();
        ticket.setStatus(status);
        if (hasResponse) {
            ticket.setResponse(request.response());
            ticket.setRespondedAt(now);
        }
        ticket.setUpdatedAt(now);
        SupportTicket saved = supportTicketRepository.save(ticket);

        Map<String, String> detail = new LinkedHashMap<>();
        detail.put("ticketId", saved.getId().toString());
        detail.put("status", status.name());
        if (hasResponse) {
            String r = request.response();
            detail.put("response", r.length() > AUDIT_RESPONSE_MAX ? r.substring(0, AUDIT_RESPONSE_MAX) + "..." : r);
        }
        settingsAuditService.record("support-ticket",
            "Responded to ticket " + saved.getId() + " for " + associate.getUserId() + ": status " + status,
            detail, actorId);

        return SupportTicketResponse.of(saved, associate);
    }
```

- [ ] **Step 5: Add the two handlers (append in `SupportTicketExceptionHandler`)**

Add imports `org.springframework.http.HttpStatus`, `ResponseEntity`, `org.springframework.web.bind.annotation.ExceptionHandler`, `java.util.Map`. Replace the "unit 3 adds ..." sentence in the header comment with "unit 3 added them". Inside the class:

```java
    @ExceptionHandler(SupportTicketNotFoundException.class)
    public ResponseEntity<Map<String, String>> handleNotFound(SupportTicketNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(InvalidSupportTicketResponseException.class)
    public ResponseEntity<Map<String, String>> handleInvalidResponse(InvalidSupportTicketResponseException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", ex.getMessage()));
    }
```

- [ ] **Step 6: Run to confirm pass**

Run: `cd /Users/ronalisenapati/Ronali/plotchain/backend && mvn test -Dtest=AdminSupportTicketRespondServiceTest`
Expected: PASS (all). Also run `-Dtest=AdminSupportTicketServiceTest` to confirm unit 1/2 service tests still pass.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/plotchain/supportticket backend/src/test/java/com/plotchain/supportticket/AdminSupportTicketRespondServiceTest.java
git commit -m "feat(support-tickets): admin respond service with blank-response guard and audit"
```
(append the two trailers to the message)

---

### Task 2: `POST /{id}/respond` controller route

**Files:**
- Modify (append): `AdminSupportTicketController.java`
- Test: `AdminSupportTicketRespondControllerTest.java` (new)

**Interfaces:**
- Consumes: Task 1's `respond`, `RespondToSupportTicketRequest`, handler mappings.
- Produces: `POST /api/admin/support-tickets/{id}/respond` -> 200 `SupportTicketResponse` (Task 3 and unit 5 frontend rely on this).

- [ ] **Step 1: Write the failing controller tests**

```java
package com.plotchain.supportticket;

import com.fasterxml.jackson.databind.ObjectMapper;
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
class AdminSupportTicketRespondControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;
    @Autowired ObjectMapper objectMapper;

    @MockBean AssociateRepository associateRepository;
    @MockBean SettingsAuditLogRepository settingsAuditLogRepository;
    @MockBean SupportTicketRepository supportTicketRepository;

    private static final UUID TICKET_ID = UUID.randomUUID();
    private static final UUID ASSOCIATE_ID = UUID.randomUUID();

    private String tokenFor(AssociateRole role) {
        Associate principal = new Associate();
        principal.setId(UUID.randomUUID());
        principal.setRole(role);
        when(associateRepository.findById(principal.getId())).thenReturn(Optional.of(principal));
        return "Bearer " + jwtService.generateToken(principal);
    }

    private void seedTicket() {
        SupportTicket t = new SupportTicket();
        t.setId(TICKET_ID);
        t.setAssociateId(ASSOCIATE_ID);
        t.setSubject("Wallet blank");
        t.setDescription("Page is empty");
        t.setStatus(SupportTicketStatus.OPEN);
        t.setCreatedAt(Instant.now());
        t.setUpdatedAt(Instant.now());
        when(supportTicketRepository.findById(TICKET_ID)).thenReturn(Optional.of(t));
        when(supportTicketRepository.save(any(SupportTicket.class))).thenAnswer(i -> i.getArgument(0));
        Associate a = new Associate();
        a.setId(ASSOCIATE_ID);
        a.setUserId("VP00001");
        a.setName("Jane Doe");
        a.setRole(AssociateRole.ASSOCIATE);
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(a));
    }

    private String json(Object status, Object response) throws Exception {
        Map<String, Object> body = new HashMap<>();
        if (status != null) body.put("status", status);
        if (response != null) body.put("response", response);
        return objectMapper.writeValueAsString(body);
    }

    private org.springframework.test.web.servlet.ResultActions respond(UUID id, String token, String body) throws Exception {
        var req = post("/api/admin/support-tickets/{id}/respond", id).contentType("application/json").content(body);
        if (token != null) req = req.header("Authorization", token);
        return mockMvc.perform(req);
    }

    @Test
    void adminRespondReturns200WithTheUpdatedTicket() throws Exception {
        seedTicket();
        respond(TICKET_ID, tokenFor(AssociateRole.ADMIN), json("RESOLVED", "Fixed"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(TICKET_ID.toString()))
            .andExpect(jsonPath("$.status").value("RESOLVED"))
            .andExpect(jsonPath("$.response").value("Fixed"))
            .andExpect(jsonPath("$.respondedAt").exists())
            .andExpect(jsonPath("$.associateUserId").value("VP00001"));
    }

    @Test
    void statusOnlyChangeReturns200() throws Exception {
        seedTicket();
        respond(TICKET_ID, tokenFor(AssociateRole.ADMIN), json("IN_PROGRESS", null))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("IN_PROGRESS"))
            .andExpect(jsonPath("$.response").doesNotExist());
    }

    @Test
    void associateTokenIsForbiddenAndWritesNothing() throws Exception {
        seedTicket();
        respond(TICKET_ID, tokenFor(AssociateRole.ASSOCIATE), json("RESOLVED", "x")).andExpect(status().isForbidden());
        verify(supportTicketRepository, never()).save(any());
    }

    @Test
    void unauthenticatedIsUnauthorized() throws Exception {
        respond(TICKET_ID, null, json("RESOLVED", "x")).andExpect(status().isUnauthorized());
    }

    @Test
    void unknownTicketIs404AndWritesNothing() throws Exception {
        when(supportTicketRepository.findById(TICKET_ID)).thenReturn(Optional.empty());
        respond(TICKET_ID, tokenFor(AssociateRole.ADMIN), json("IN_PROGRESS", null))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.error").exists());
        verify(supportTicketRepository, never()).save(any());
    }

    @Test
    void missingStatusIs400() throws Exception {
        seedTicket();
        respond(TICKET_ID, tokenFor(AssociateRole.ADMIN), json(null, "text")).andExpect(status().isBadRequest());
        verify(supportTicketRepository, never()).save(any());
    }

    @Test
    void unknownStatusValueIs400NotA500() throws Exception {
        seedTicket();
        respond(TICKET_ID, tokenFor(AssociateRole.ADMIN), json("BOGUS", "text")).andExpect(status().isBadRequest());
    }

    @Test
    void resolvedWithBlankResponseIs400() throws Exception {
        seedTicket();
        respond(TICKET_ID, tokenFor(AssociateRole.ADMIN), json("RESOLVED", "   "))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").exists());
        verify(supportTicketRepository, never()).save(any());
    }

    @Test
    void closedWithNoResponseFieldIs400() throws Exception {
        seedTicket();
        respond(TICKET_ID, tokenFor(AssociateRole.ADMIN), json("CLOSED", null)).andExpect(status().isBadRequest());
    }

    @Test
    void malformedTicketIdInPathIs400NotA500() throws Exception {
        mockMvc.perform(post("/api/admin/support-tickets/not-a-uuid/respond")
                .header("Authorization", tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(json("IN_PROGRESS", null)))
            .andExpect(status().isBadRequest());
    }
}
```

- [ ] **Step 2: Run to confirm failure**

Run: `cd /Users/ronalisenapati/Ronali/plotchain/backend && mvn test -Dtest=AdminSupportTicketRespondControllerTest`
Expected: FAIL (route not mapped: 404/405 where 200/403 expected).

- [ ] **Step 3: Implement (append to the controller class, after the last existing route)**

Add imports `org.springframework.web.bind.annotation.PathVariable` (others already present from unit 1). Append:

```java
    // Defense-in-depth @PreAuthorize alongside the blanket POST /api/** -> ADMIN rule (Decision 8).
    @PostMapping("/{id}/respond")
    @PreAuthorize("hasAuthority('ADMIN')")
    public SupportTicketResponse respond(@PathVariable UUID id,
                                         @Valid @RequestBody RespondToSupportTicketRequest request,
                                         @AuthenticationPrincipal UUID actorId) {
        return adminSupportTicketService.respond(id, request, actorId);
    }
```

- [ ] **Step 4: Run to confirm pass**

Run: `cd /Users/ronalisenapati/Ronali/plotchain/backend && mvn test -Dtest='AdminSupportTicketRespondControllerTest,AdminSupportTicketControllerTest'`
Expected: PASS. If `unknownStatusValueIs400NotA500` or the malformed-UUID test returns 500, add a handler for `HttpMessageNotReadableException` / `MethodArgumentTypeMismatchException` mirroring how another package's advice does it; check first whether a global advice already maps them (do not duplicate).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/supportticket/AdminSupportTicketController.java backend/src/test/java/com/plotchain/supportticket/AdminSupportTicketRespondControllerTest.java
git commit -m "feat(support-tickets): POST /api/admin/support-tickets/{id}/respond"
```
(append the two trailers)

---

### Task 3: `SecurityConfigTest` rows

**Files:**
- Modify (append): `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`, directly after `adminSupportTicketCreateIsUnauthorizedWithoutAToken` (unit 2 may have added GET rows nearby: keep both, rebase-merge by hand). No `SecurityConfig` edit.

**Interfaces:**
- Consumes: Task 2 route; existing `tokenFor(AssociateRole)`, `mockMvc`, `post`, `ObjectMapper`, `@EnumSource` imports already in the class.

- [ ] **Step 1: Add the rows**

```java
    // support-tickets unit 3 (Decision 8): POST .../{id}/respond rides the blanket ADMIN write rule
    // plus @PreAuthorize. A random ticket id reaches the real service for the ADMIN token and 404s
    // (no such ticket) -- proof it passed the security layer, same "not 403" reasoning as create.
    // Every other role is 403 at the filter.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminSupportTicketRespondIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        mockMvc.perform(post("/api/admin/support-tickets/{id}/respond", UUID.randomUUID())
                .header("Authorization", "Bearer " + tokenFor(role))
                .contentType("application/json")
                .content("{\"status\":\"IN_PROGRESS\"}"))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 404 : 403));
    }

    @Test
    void adminSupportTicketRespondIsUnauthorizedWithoutAToken() throws Exception {
        mockMvc.perform(post("/api/admin/support-tickets/{id}/respond", UUID.randomUUID())
                .contentType("application/json")
                .content("{\"status\":\"IN_PROGRESS\"}"))
            .andExpect(status().isUnauthorized());
    }
```

- [ ] **Step 2: Run**

Run: `cd /Users/ronalisenapati/Ronali/plotchain/backend && mvn test -Dtest=SecurityConfigTest`
Expected: new tests PASS (they pass immediately since Task 2 shipped the route; if ADMIN returns something other than 404, check whether `SecurityConfigTest` mocks `SupportTicketRepository` and stubs `findById` non-empty). Ignore the 4 pre-existing unrelated failures noted in memory only if they appear outside the support-ticket rows.

- [ ] **Step 3: Commit**

```bash
git add backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java
git commit -m "test(support-tickets): SecurityConfigTest rows for respond route"
```
(append the two trailers)

---

## Self-Review

- Spec coverage: respond semantics (Flows), Decisions 2/3/4/8/9, both Error-handling rows (404, 400 x2: missing status via `@NotNull`, blank response via exception), Testing `respond()` bullets and controller validation, SecurityConfigTest row. Covered.
- Placeholders: none. Types consistent: `respond(UUID, RespondToSupportTicketRequest, UUID)`, exception names identical across tasks.
- Hand-off: units file row set to `planned` by the plan author; the coordinator marks it `merged`.
