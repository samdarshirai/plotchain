# Support Tickets Unit 1: Admin Logs an OPEN Ticket Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An ADMIN can `POST /api/admin/support-tickets` to log an `OPEN` ticket on an associate's behalf and get the stored ticket back; the whole `support_ticket` schema lands here.

**Architecture:** One Flyway migration (`V42`) creates `support_ticket`. New package `com.plotchain.supportticket` holds the entity, status enum, repository base, the shared `SupportTicketResponse` shape (units 2-4 reuse it), `AdminSupportTicketService.create`, a POST-only `AdminSupportTicketController`, and an empty `SupportTicketExceptionHandler` shell that units 3 fills. No `SecurityConfig` edit: the existing blanket `POST /api/**` -> ADMIN rule plus `@PreAuthorize` cover this route.

**Tech Stack:** Spring Boot 3 / JPA / Flyway / H2 (tests, PostgreSQL mode) / JUnit5 + Mockito + AssertJ + MockMvc.

**Spec:** `docs/superpowers/specs/role-capability/2026-08-03-support-tickets-domain-design.md` (Decisions 1, 3, 6, 7, 8, 9; Data model; Flows "Admin logs a ticket"; Error handling; Testing). Unit source: `docs/superpowers/plans/2026-08-03-support-tickets-units.md`, unit 1.

## Global Constraints

- Migration is `backend/src/main/resources/db/migration/V42__support_ticket.sql` (latest existing is `V41__plot_booking_lifecycle.sql`, verified). Re-check `ls backend/src/main/resources/db/migration | sort -V | tail -3` at dispatch; renumber only if something newer exists. Must run on PostgreSQL and H2 (`MODE=PostgreSQL`).
- Table exactly per spec: `status VARCHAR(20) NOT NULL DEFAULT 'OPEN'` + CHECK `OPEN/IN_PROGRESS/RESOLVED/CLOSED`; indexes on `associate_id` and `status`; no `assigned_to`, no thread table, no attachments, no `created_by` (Decisions 1, 2, 6).
- Timestamp columns use `TIMESTAMP`, not the spec's `TIMESTAMPTZ`: every existing migration uses `TIMESTAMP` and none uses `TIMESTAMPTZ`; entities map `Instant`. (Raised as a question to the user; swap to `TIMESTAMPTZ` only if they say so.)
- Create returns **201 Created** via `ResponseEntity.status(HttpStatus.CREATED)`: matches `SaleController.record` and `BookingController.create` (the admin "act on an associate's behalf" POSTs). `KycReviewController`/`AdminAssociateController` return 200 only because they are state-changes on existing rows, not creates. Resolves units-file open question 4.
- Package `com.plotchain.supportticket` (single word, Decision 7). Plain getters/setters, no Lombok.
- `@PreAuthorize("hasAuthority('ADMIN')")` on the method; ASSOCIATE token 403, unauthenticated 401 (Decision 8).
- Audit: `settingsAuditService.record("support-ticket", "Logged ticket for <userId>: <subject>", Map.of("ticketId", ..., "associateId", ...), actorId)` (Decision 9). `SettingsAuditService` is in `com.plotchain.company` and is reused unedited.
- Reuse `com.plotchain.associate.AssociateNotFoundException`, `AssociateRepository.findByIdAndRole(id, ASSOCIATE)` unedited. The existing global handlers already map `AssociateNotFoundException` to 404 (`DashboardExceptionHandler`); do NOT add a second mapping in `SupportTicketExceptionHandler` (same pitfall `BookingExceptionHandler`'s header comment documents).
- **Decision (user, 2026-10-06):** associate lookup is ASSOCIATE-role only (`findByIdAndRole`), so an ADMIN-role id returns 404. Add the `AssociateRole` import where used; add a service/controller test that an ADMIN-role id 404s.
- DB-enum-CHECK lesson (memory: self_performance_bonus_spec_status): the constraint test must hit the real DB with a raw invalid string, not a Java enum.
- Backend test env noise: whole-module `mvn test` shows ~55 spurious Mockito errors (JDK21/25 mismatch) plus 4 pre-existing `JwtServiceTest`/`SecretsEncryptionServiceTest` failures. Do NOT run the whole suite; run only the classes named in each task from `/Users/ronalisenapati/Ronali/plotchain/backend` and treat only failures inside them as real. Mock interfaces (`@Mock SupportTicketRepository`) and construct `SettingsAuditService` for real around a mocked `SettingsAuditLogRepository` (as `AdminAssociateServiceTest` does); never `@Mock` the concrete `SettingsAuditService`.
- Scope: this unit only. No `GET`, no `respond`, no `SecurityConfig` change, no frontend.
- The plan author makes no commit. Commit steps are for the executor, each ending with the trailers `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01Qebsn6vZHDsjj8khCRiDEV`.

## Review Focus

- `subject` longer than 200 chars must 400, not surface as a 500 from `VARCHAR(200)` (`@Size(max = 200)`, Task 4 controller test).
- Whitespace-only `subject` or `description` (`"   "`) must 400 (`@NotBlank`, Task 4 test).
- Unknown `associateId` must 404 and must NOT write a ticket or an audit row (Task 3 test: `verify(..., never())`).
- Missing `associateId` (null) must 400, not NPE/500 (Task 4 test).
- Stored subject/description are persisted as sent (no silent trimming/truncation); the audit summary uses the subject verbatim (Task 3 test).
- A raw invalid `status` string is rejected by the DB itself (Task 1 test), so later units cannot bypass the enum.

## File Structure

- Create `backend/src/main/resources/db/migration/V42__support_ticket.sql`: table + indexes.
- Create `supportticket/SupportTicketStatus.java`, `SupportTicket.java`, `SupportTicketRepository.java`: persistence.
- Create `supportticket/CreateSupportTicketRequest.java`, `SupportTicketResponse.java`: DTOs (the response is the one shape reused by units 2-4).
- Create `supportticket/AdminSupportTicketService.java`: `create` only (units 2, 3 add `list`, `respond`).
- Create `supportticket/AdminSupportTicketController.java`: POST only (unit 2 adds GET, unit 3 adds respond).
- Create `supportticket/SupportTicketExceptionHandler.java`: empty `@RestControllerAdvice` shell.
- Tests: `supportticket/SupportTicketSchemaTest.java`, `AdminSupportTicketServiceTest.java`, `AdminSupportTicketControllerTest.java`; modify `auth/SecurityConfigTest.java` (add rows only).

Paths below are relative to `backend/src/main/java/com/plotchain/` (main) or `backend/src/test/java/com/plotchain/` (test) unless absolute.

---

### Task 1: Migration, enum, entity, repository, schema test

**Files:**
- Create: `backend/src/main/resources/db/migration/V42__support_ticket.sql`
- Create: `supportticket/SupportTicketStatus.java`, `supportticket/SupportTicket.java`, `supportticket/SupportTicketRepository.java`
- Test: `supportticket/SupportTicketSchemaTest.java` (new, `@DataJpaTest`)

**Interfaces:**
- Produces: `enum SupportTicketStatus { OPEN, IN_PROGRESS, RESOLVED, CLOSED }`; `SupportTicket` with `getId/setId(UUID)`, `getAssociateId/setAssociateId(UUID)`, `getSubject/setSubject(String)`, `getDescription/setDescription(String)`, `getStatus/setStatus(SupportTicketStatus)` (field default `OPEN`), `getResponse/setResponse(String)`, `getRespondedAt/setRespondedAt(Instant)`, `getCreatedAt/setCreatedAt(Instant)`, `getUpdatedAt/setUpdatedAt(Instant)`; `interface SupportTicketRepository extends JpaRepository<SupportTicket, UUID>` (no extra methods yet; units 2 and 4 add theirs).

- [ ] **Step 1: Write the failing schema test**

Create `supportticket/SupportTicketSchemaTest.java`. Copy the `persistAssociate()` helper from `epin/EPinRepositoryTest.persistAdmin()` (a persistable ADMIN row; `chk_associate_rank_required` only demands a rank for ASSOCIATE rows).

```java
package com.plotchain.supportticket;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DataJpaTest
@ActiveProfiles("test")
class SupportTicketSchemaTest {

    @Autowired SupportTicketRepository supportTicketRepository;
    @Autowired TestEntityManager entityManager;
    @Autowired JdbcTemplate jdbc;

    private UUID persistAssociate() {
        UUID id = UUID.randomUUID();
        Associate associate = new Associate();
        associate.setId(id);
        associate.setPosition("L");
        associate.setName("Test Admin");
        associate.setKycStatus(KycStatus.VERIFIED);
        associate.setJoinedAt(Instant.now());
        associate.setCumulativeMatchedVolume(BigDecimal.ZERO);
        associate.setUserId("u-" + id);
        associate.setEmail(id + "@test.local");
        associate.setPasswordHash("$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C");
        associate.setRole(AssociateRole.ADMIN);
        return entityManager.persist(associate).getId();
    }

    private SupportTicket newTicket(UUID associateId) {
        SupportTicket t = new SupportTicket();
        t.setId(UUID.randomUUID());
        t.setAssociateId(associateId);
        t.setSubject("Cannot see my wallet");
        t.setDescription("Wallet page is blank since yesterday");
        t.setCreatedAt(Instant.now());
        t.setUpdatedAt(Instant.now());
        return t;
    }

    @Test
    void newTicketDefaultsToOpenWithNullResponse() {
        SupportTicket saved = supportTicketRepository.saveAndFlush(newTicket(persistAssociate()));
        entityManager.clear();
        SupportTicket found = supportTicketRepository.findById(saved.getId()).orElseThrow();
        assertThat(found.getStatus()).isEqualTo(SupportTicketStatus.OPEN);
        assertThat(found.getResponse()).isNull();
        assertThat(found.getRespondedAt()).isNull();
    }

    @Test
    void dbRejectsAnInvalidStatusString() {
        SupportTicket saved = supportTicketRepository.saveAndFlush(newTicket(persistAssociate()));
        assertThatThrownBy(() -> jdbc.update("UPDATE support_ticket SET status = 'BOGUS' WHERE id = ?", saved.getId()))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void dbRejectsATicketForANonexistentAssociate() {
        assertThatThrownBy(() -> supportTicketRepository.saveAndFlush(newTicket(UUID.randomUUID())))
            .isInstanceOf(DataIntegrityViolationException.class);
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run (from `/Users/ronalisenapati/Ronali/plotchain/backend`): `mvn -q test -Dtest=SupportTicketSchemaTest`
Expected: compilation FAIL (`SupportTicket`, `SupportTicketRepository`, `SupportTicketStatus` not defined).

- [ ] **Step 3: Write the migration, enum, entity, repository**

`V42__support_ticket.sql`:

```sql
-- support-tickets unit 1 (docs/superpowers/specs/role-capability/2026-08-03-support-tickets-domain-design.md,
-- Data model). One migration for the whole spec: units 2-4 only add reads/updates on these columns.
-- TIMESTAMP (not TIMESTAMPTZ) matches every other migration in this repo.

CREATE TABLE support_ticket (
    id UUID PRIMARY KEY,
    associate_id UUID NOT NULL REFERENCES associate(id),
    subject VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    response TEXT,
    responded_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT chk_support_ticket_status CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'))
);

CREATE INDEX idx_support_ticket_associate_id ON support_ticket(associate_id);
CREATE INDEX idx_support_ticket_status ON support_ticket(status);
```

`SupportTicketStatus.java`:

```java
package com.plotchain.supportticket;

public enum SupportTicketStatus { OPEN, IN_PROGRESS, RESOLVED, CLOSED }
```

`SupportTicket.java` (entity; follow `epin/EPinEvent.java` annotations; `@Column(columnDefinition = "TEXT")` is not needed since `ddl-auto` is validate, but `description`/`response` map to `TEXT` so use plain `String` fields, same as other TEXT columns in the repo; if schema validation complains about the type, add `@Column(columnDefinition = "TEXT")`):

```java
package com.plotchain.supportticket;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "support_ticket")
public class SupportTicket {

    @Id
    private UUID id;

    @Column(name = "associate_id", nullable = false)
    private UUID associateId;

    @Column(nullable = false, length = 200)
    private String subject;

    @Column(nullable = false)
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private SupportTicketStatus status = SupportTicketStatus.OPEN;

    private String response;

    @Column(name = "responded_at")
    private Instant respondedAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getAssociateId() { return associateId; }
    public void setAssociateId(UUID associateId) { this.associateId = associateId; }
    public String getSubject() { return subject; }
    public void setSubject(String subject) { this.subject = subject; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public SupportTicketStatus getStatus() { return status; }
    public void setStatus(SupportTicketStatus status) { this.status = status; }
    public String getResponse() { return response; }
    public void setResponse(String response) { this.response = response; }
    public Instant getRespondedAt() { return respondedAt; }
    public void setRespondedAt(Instant respondedAt) { this.respondedAt = respondedAt; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
```

`SupportTicketRepository.java`:

```java
package com.plotchain.supportticket;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

// Query methods (searchQueue, findByAssociateId...) are added by units 2 and 4.
public interface SupportTicketRepository extends JpaRepository<SupportTicket, UUID> {
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `mvn -q test -Dtest=SupportTicketSchemaTest`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/resources/db/migration/V42__support_ticket.sql backend/src/main/java/com/plotchain/supportticket backend/src/test/java/com/plotchain/supportticket/SupportTicketSchemaTest.java
git commit -m "feat(support-tickets): add support_ticket schema, entity and repository"
```

---

### Task 2: DTOs and exception-handler shell

**Files:**
- Create: `supportticket/CreateSupportTicketRequest.java`, `supportticket/SupportTicketResponse.java`, `supportticket/SupportTicketExceptionHandler.java`
- Test: none of its own (pure data shapes and an empty advice; exercised by Tasks 3-4)

**Interfaces:**
- Consumes: `SupportTicket` and `SupportTicketStatus` (Task 1); `com.plotchain.associate.Associate` (`getUserId()`, `getName()`).
- Produces: `record CreateSupportTicketRequest(@NotNull UUID associateId, @NotBlank @Size(max = 200) String subject, @NotBlank String description)`; `record SupportTicketResponse(UUID id, UUID associateId, String associateUserId, String associateName, String subject, String description, SupportTicketStatus status, String response, Instant respondedAt, Instant createdAt, Instant updatedAt)` with `static SupportTicketResponse of(SupportTicket t, Associate a)`; empty `@RestControllerAdvice SupportTicketExceptionHandler`.

- [ ] **Step 1: Create the files**

```java
package com.plotchain.supportticket;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.UUID;

public record CreateSupportTicketRequest(
    @NotNull UUID associateId,
    @NotBlank @Size(max = 200) String subject,
    @NotBlank String description
) {}
```

```java
package com.plotchain.supportticket;

import com.plotchain.associate.Associate;

import java.time.Instant;
import java.util.UUID;

// One shape for admin queue rows and the associate's own history rows (spec Decision 5: no
// summary/detail split). Units 2-4 build rows with of(ticket, associate).
public record SupportTicketResponse(
    UUID id,
    UUID associateId,
    String associateUserId,
    String associateName,
    String subject,
    String description,
    SupportTicketStatus status,
    String response,
    Instant respondedAt,
    Instant createdAt,
    Instant updatedAt
) {
    public static SupportTicketResponse of(SupportTicket t, Associate a) {
        return new SupportTicketResponse(t.getId(), t.getAssociateId(), a.getUserId(), a.getName(),
            t.getSubject(), t.getDescription(), t.getStatus(), t.getResponse(), t.getRespondedAt(),
            t.getCreatedAt(), t.getUpdatedAt());
    }
}
```

```java
package com.plotchain.supportticket;

import org.springframework.web.bind.annotation.RestControllerAdvice;

// Shell created in unit 1 so the per-package advice convention is in place; unit 3 adds the
// SupportTicketNotFoundException -> 404 and InvalidSupportTicketResponseException -> 400
// handlers. AssociateNotFoundException (thrown by create()) is deliberately NOT handled here:
// DashboardExceptionHandler already maps it to 404 globally, and a second mapping would be a
// redundant, order-dependent duplicate (see BookingExceptionHandler's header comment).
@RestControllerAdvice
public class SupportTicketExceptionHandler {
}
```

- [ ] **Step 2: Compile**

Run: `mvn -q compile`
Expected: BUILD SUCCESS.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/java/com/plotchain/supportticket
git commit -m "feat(support-tickets): add create request, shared response DTO and handler shell"
```

---

### Task 3: `AdminSupportTicketService.create` with unit tests

**Files:**
- Create: `supportticket/AdminSupportTicketService.java`
- Test: `supportticket/AdminSupportTicketServiceTest.java` (new, `@ExtendWith(MockitoExtension.class)`)

**Interfaces:**
- Consumes: `SupportTicketRepository` (Task 1), `AssociateRepository.findByIdAndRole(UUID, AssociateRole.ASSOCIATE)`, `SettingsAuditService.record(String, String, Object, UUID)`, `CreateSupportTicketRequest`/`SupportTicketResponse` (Task 2), `AssociateNotFoundException(UUID)`.
- Produces: `@Service AdminSupportTicketService(SupportTicketRepository, AssociateRepository, SettingsAuditService)` with `@Transactional SupportTicketResponse create(CreateSupportTicketRequest request, UUID actorId)`.

- [ ] **Step 1: Write the failing tests**

```java
package com.plotchain.supportticket;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.company.SettingsAuditLog;
import com.plotchain.company.SettingsAuditLogRepository;
import com.plotchain.company.SettingsAuditService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

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
class AdminSupportTicketServiceTest {

    @Mock SupportTicketRepository supportTicketRepository;
    @Mock AssociateRepository associateRepository;
    @Mock SettingsAuditLogRepository settingsAuditLogRepository;

    AdminSupportTicketService service;

    private static final UUID ACTOR_ID = UUID.randomUUID();
    private static final UUID ASSOCIATE_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        SettingsAuditService audit = new SettingsAuditService(
            settingsAuditLogRepository, associateRepository, new ObjectMapper().findAndRegisterModules());
        service = new AdminSupportTicketService(supportTicketRepository, associateRepository, audit);
    }

    private Associate associate() {
        Associate a = new Associate();
        a.setId(ASSOCIATE_ID);
        a.setUserId("VP00001");
        a.setName("Jane Doe");
        a.setRole(AssociateRole.ASSOCIATE);
        return a;
    }

    @Test
    void createPersistsAnOpenTicketWithNullResponseAndEqualTimestamps() {
        when(associateRepository.findByIdAndRole(ASSOCIATE_ID, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(associate()));
        when(supportTicketRepository.save(any(SupportTicket.class))).thenAnswer(i -> i.getArgument(0));

        SupportTicketResponse response = service.create(
            new CreateSupportTicketRequest(ASSOCIATE_ID, "Wallet blank", "Page is empty"), ACTOR_ID);

        ArgumentCaptor<SupportTicket> captor = ArgumentCaptor.forClass(SupportTicket.class);
        verify(supportTicketRepository).save(captor.capture());
        SupportTicket saved = captor.getValue();
        assertThat(saved.getId()).isNotNull();
        assertThat(saved.getAssociateId()).isEqualTo(ASSOCIATE_ID);
        assertThat(saved.getSubject()).isEqualTo("Wallet blank");
        assertThat(saved.getDescription()).isEqualTo("Page is empty");
        assertThat(saved.getStatus()).isEqualTo(SupportTicketStatus.OPEN);
        assertThat(saved.getResponse()).isNull();
        assertThat(saved.getRespondedAt()).isNull();
        assertThat(saved.getCreatedAt()).isNotNull().isEqualTo(saved.getUpdatedAt());

        assertThat(response.id()).isEqualTo(saved.getId());
        assertThat(response.status()).isEqualTo(SupportTicketStatus.OPEN);
        assertThat(response.associateUserId()).isEqualTo("VP00001");
        assertThat(response.associateName()).isEqualTo("Jane Doe");
    }

    @Test
    void createRecordsAnAuditEntryUnderSupportTicketSection() {
        when(associateRepository.findByIdAndRole(ASSOCIATE_ID, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(associate()));
        when(supportTicketRepository.save(any(SupportTicket.class))).thenAnswer(i -> i.getArgument(0));

        SupportTicketResponse response = service.create(
            new CreateSupportTicketRequest(ASSOCIATE_ID, "Wallet blank", "Page is empty"), ACTOR_ID);

        ArgumentCaptor<SettingsAuditLog> captor = ArgumentCaptor.forClass(SettingsAuditLog.class);
        verify(settingsAuditLogRepository).save(captor.capture());
        SettingsAuditLog log = captor.getValue();
        assertThat(log.getSection()).isEqualTo("support-ticket");
        assertThat(log.getSummary()).isEqualTo("Logged ticket for VP00001: Wallet blank");
        assertThat(log.getChangedByAssociateId()).isEqualTo(ACTOR_ID);
        assertThat(log.getDetail()).contains(response.id().toString()).contains(ASSOCIATE_ID.toString());
    }

    @Test
    void createThrowsAssociateNotFoundBeforeWritingAnythingForAnUnknownAssociate() {
        when(associateRepository.findByIdAndRole(ASSOCIATE_ID, AssociateRole.ASSOCIATE)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.create(
            new CreateSupportTicketRequest(ASSOCIATE_ID, "s", "d"), ACTOR_ID))
            .isInstanceOf(AssociateNotFoundException.class);

        verify(supportTicketRepository, never()).save(any());
        verifyNoInteractions(settingsAuditLogRepository);
    }
}
```

Before running, confirm the `SettingsAuditLog` getter names (`getSection`, `getSummary`, `getDetail`, `getChangedByAssociateId`) with `grep -n "public" backend/src/main/java/com/plotchain/company/SettingsAuditLog.java`; adjust the test (not the production class) if a getter is named differently.

- [ ] **Step 2: Run to verify it fails**

Run: `mvn -q test -Dtest=AdminSupportTicketServiceTest`
Expected: compilation FAIL (`AdminSupportTicketService` not defined).

- [ ] **Step 3: Implement**

```java
package com.plotchain.supportticket;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.company.SettingsAuditService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Service
public class AdminSupportTicketService {

    private final SupportTicketRepository supportTicketRepository;
    private final AssociateRepository associateRepository;
    private final SettingsAuditService settingsAuditService;

    public AdminSupportTicketService(SupportTicketRepository supportTicketRepository,
                                      AssociateRepository associateRepository,
                                      SettingsAuditService settingsAuditService) {
        this.supportTicketRepository = supportTicketRepository;
        this.associateRepository = associateRepository;
        this.settingsAuditService = settingsAuditService;
    }

    @Transactional
    public SupportTicketResponse create(CreateSupportTicketRequest request, UUID actorId) {
        // Target lookup first, before any write (same findOrThrow-first ordering as
        // KycReviewService.decide): an unknown associateId must 404 and leave no ticket/audit row.
        Associate associate = associateRepository.findByIdAndRole(request.associateId(), AssociateRole.ASSOCIATE)
            .orElseThrow(() -> new AssociateNotFoundException(request.associateId()));

        Instant now = Instant.now();
        SupportTicket ticket = new SupportTicket();
        ticket.setId(UUID.randomUUID());
        ticket.setAssociateId(associate.getId());
        ticket.setSubject(request.subject());
        ticket.setDescription(request.description());
        ticket.setStatus(SupportTicketStatus.OPEN);
        ticket.setCreatedAt(now);
        ticket.setUpdatedAt(now);
        SupportTicket saved = supportTicketRepository.save(ticket);

        settingsAuditService.record("support-ticket",
            "Logged ticket for " + associate.getUserId() + ": " + request.subject(),
            Map.of("ticketId", saved.getId().toString(), "associateId", associate.getId().toString()),
            actorId);

        return SupportTicketResponse.of(saved, associate);
    }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `mvn -q test -Dtest=AdminSupportTicketServiceTest`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/supportticket/AdminSupportTicketService.java backend/src/test/java/com/plotchain/supportticket/AdminSupportTicketServiceTest.java
git commit -m "feat(support-tickets): admin create ticket service with audit logging"
```

---

### Task 4: POST controller, controller tests, SecurityConfigTest rows

**Files:**
- Create: `supportticket/AdminSupportTicketController.java`
- Test: `supportticket/AdminSupportTicketControllerTest.java` (new, `@SpringBootTest` + MockMvc); modify `auth/SecurityConfigTest.java` (append rows after the `adminBookingsCreate...` block near line 549)

**Interfaces:**
- Consumes: `AdminSupportTicketService.create(CreateSupportTicketRequest, UUID)` (Task 3).
- Produces: `POST /api/admin/support-tickets` -> `201` + `SupportTicketResponse`. Class is `@RestController @RequestMapping("/api/admin/support-tickets")` so units 2 and 3 add `@GetMapping` and `@PostMapping("/{id}/respond")` to the same class.

- [ ] **Step 1: Write the failing controller tests**

Mirror `associate/KycReviewControllerTest` (`@MockBean AssociateRepository`, `@MockBean SettingsAuditLogRepository`, `tokenFor(role)` stubbing `findById` for the principal). Add `@MockBean SupportTicketRepository supportTicketRepository`.

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
class AdminSupportTicketControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;
    @Autowired ObjectMapper objectMapper;

    @MockBean AssociateRepository associateRepository;
    @MockBean SettingsAuditLogRepository settingsAuditLogRepository;
    @MockBean SupportTicketRepository supportTicketRepository;

    private static final UUID ASSOCIATE_ID = UUID.randomUUID();

    private String tokenFor(AssociateRole role) {
        Associate principal = new Associate();
        principal.setId(UUID.randomUUID());
        principal.setRole(role);
        when(associateRepository.findById(principal.getId())).thenReturn(Optional.of(principal));
        return "Bearer " + jwtService.generateToken(principal);
    }

    private void seedTargetAssociate() {
        Associate a = new Associate();
        a.setId(ASSOCIATE_ID);
        a.setUserId("VP00001");
        a.setName("Jane Doe");
        a.setRole(AssociateRole.ASSOCIATE);
        when(associateRepository.findByIdAndRole(ASSOCIATE_ID, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(a));
        when(supportTicketRepository.save(any(SupportTicket.class))).thenAnswer(i -> i.getArgument(0));
    }

    private String json(Object associateId, String subject, String description) throws Exception {
        Map<String, Object> body = new java.util.HashMap<>();
        body.put("associateId", associateId);
        body.put("subject", subject);
        body.put("description", description);
        return objectMapper.writeValueAsString(body);
    }

    @Test
    void adminCreateReturns201WithTheOpenTicket() throws Exception {
        seedTargetAssociate();
        mockMvc.perform(post("/api/admin/support-tickets")
                .header("Authorization", tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(json(ASSOCIATE_ID, "Wallet blank", "Page is empty")))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.status").value("OPEN"))
            .andExpect(jsonPath("$.response").doesNotExist())
            .andExpect(jsonPath("$.associateUserId").value("VP00001"))
            .andExpect(jsonPath("$.associateName").value("Jane Doe"))
            .andExpect(jsonPath("$.subject").value("Wallet blank"));
    }

    @Test
    void associateTokenIsForbidden() throws Exception {
        seedTargetAssociate();
        mockMvc.perform(post("/api/admin/support-tickets")
                .header("Authorization", tokenFor(AssociateRole.ASSOCIATE))
                .contentType("application/json")
                .content(json(ASSOCIATE_ID, "s", "d")))
            .andExpect(status().isForbidden());
        verify(supportTicketRepository, never()).save(any());
    }

    @Test
    void unauthenticatedIsUnauthorized() throws Exception {
        mockMvc.perform(post("/api/admin/support-tickets")
                .contentType("application/json")
                .content(json(ASSOCIATE_ID, "s", "d")))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void unknownAssociateIs404AndWritesNothing() throws Exception {
        when(associateRepository.findByIdAndRole(ASSOCIATE_ID, AssociateRole.ASSOCIATE)).thenReturn(Optional.empty());
        mockMvc.perform(post("/api/admin/support-tickets")
                .header("Authorization", tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(json(ASSOCIATE_ID, "s", "d")))
            .andExpect(status().isNotFound());
        verify(supportTicketRepository, never()).save(any());
    }

    @Test
    void blankSubjectIs400() throws Exception {
        seedTargetAssociate();
        mockMvc.perform(post("/api/admin/support-tickets")
                .header("Authorization", tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(json(ASSOCIATE_ID, "   ", "d")))
            .andExpect(status().isBadRequest());
    }

    @Test
    void blankDescriptionIs400() throws Exception {
        seedTargetAssociate();
        mockMvc.perform(post("/api/admin/support-tickets")
                .header("Authorization", tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(json(ASSOCIATE_ID, "s", "")))
            .andExpect(status().isBadRequest());
    }

    @Test
    void missingAssociateIdIs400() throws Exception {
        mockMvc.perform(post("/api/admin/support-tickets")
                .header("Authorization", tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(json(null, "s", "d")))
            .andExpect(status().isBadRequest());
    }

    @Test
    void subjectOver200CharsIs400NotA500() throws Exception {
        seedTargetAssociate();
        mockMvc.perform(post("/api/admin/support-tickets")
                .header("Authorization", tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(json(ASSOCIATE_ID, "x".repeat(201), "d")))
            .andExpect(status().isBadRequest());
    }
}
```

- [ ] **Step 2: Add the `SecurityConfigTest` rows**

Append after `adminBookingsCreateIsUnauthorizedWithoutAToken` in `auth/SecurityConfigTest.java`. `SecurityConfigTest` mocks `AssociateRepository`, so a random `associateId` makes the ADMIN token reach the real service and 404 (proof it passed the security layer, same reasoning as the bookings rows); every other role is 403 at the filter. Reuse the file's existing imports (`ObjectMapper`, `ParameterizedTest`, `EnumSource`, `UUID`).

```java
    // support-tickets unit 1 (Decision 8): POST /api/admin/support-tickets rides the blanket ADMIN
    // write rule plus @PreAuthorize. A random associateId reaches the real service for the ADMIN
    // token and 404s (the mocked AssociateRepository.findById is empty) -- proof the request
    // passed the security layer, not a business outcome. Every other role is 403 at the filter.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminSupportTicketCreateIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        String body = new ObjectMapper().writeValueAsString(
            new com.plotchain.supportticket.CreateSupportTicketRequest(UUID.randomUUID(), "Subject", "Description"));

        mockMvc.perform(post("/api/admin/support-tickets")
                .header("Authorization", "Bearer " + tokenFor(role))
                .contentType("application/json")
                .content(body))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 404 : 403));
    }

    @Test
    void adminSupportTicketCreateIsUnauthorizedWithoutAToken() throws Exception {
        String body = new ObjectMapper().writeValueAsString(
            new com.plotchain.supportticket.CreateSupportTicketRequest(UUID.randomUUID(), "Subject", "Description"));
        mockMvc.perform(post("/api/admin/support-tickets").contentType("application/json").content(body))
            .andExpect(status().isUnauthorized());
    }
```

- [ ] **Step 3: Run to verify it fails**

Run: `mvn -q test -Dtest='AdminSupportTicketControllerTest,SecurityConfigTest#adminSupportTicket*'`
Expected: FAIL (no controller: ADMIN cases get 404/405 instead of 201; the `SecurityConfigTest` ADMIN row may pass by accident on 404 -- the controller test is the real gate).

- [ ] **Step 4: Implement the controller**

```java
package com.plotchain.supportticket;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/admin/support-tickets")
public class AdminSupportTicketController {

    private final AdminSupportTicketService adminSupportTicketService;

    public AdminSupportTicketController(AdminSupportTicketService adminSupportTicketService) {
        this.adminSupportTicketService = adminSupportTicketService;
    }

    // 201 like the other admin "create on an associate's behalf" POSTs (SaleController.record,
    // BookingController.create). Defense-in-depth @PreAuthorize alongside the blanket
    // POST /api/** -> ADMIN rule in SecurityConfig, same as KycReviewController (Decision 8).
    @PostMapping
    @PreAuthorize("hasAuthority('ADMIN')")
    public ResponseEntity<SupportTicketResponse> create(@Valid @RequestBody CreateSupportTicketRequest request,
                                                        @AuthenticationPrincipal UUID actorId) {
        return ResponseEntity.status(HttpStatus.CREATED).body(adminSupportTicketService.create(request, actorId));
    }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `mvn -q test -Dtest='AdminSupportTicketControllerTest,AdminSupportTicketServiceTest,SupportTicketSchemaTest,SecurityConfigTest#adminSupportTicket*'`
Expected: PASS. If a 400 case returns 500 or a 404 case returns 400, inspect the existing global validation/exception handlers rather than adding new mappings to `SupportTicketExceptionHandler`.

- [ ] **Step 6: Run the whole `SecurityConfigTest` class**

Run: `mvn -q test -Dtest=SecurityConfigTest`
Expected: PASS. A failure here in a pre-existing row is real for this class (it is not one of the 4 known failures); investigate before continuing.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/plotchain/supportticket/AdminSupportTicketController.java backend/src/test/java/com/plotchain/supportticket/AdminSupportTicketControllerTest.java backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java
git commit -m "feat(support-tickets): POST /api/admin/support-tickets with security rows"
```

---

## Final verification (executor)

- [ ] From `/Users/ronalisenapati/Ronali/plotchain/backend`: `mvn -q test -Dtest='SupportTicketSchemaTest,AdminSupportTicketServiceTest,AdminSupportTicketControllerTest,SecurityConfigTest'` -> all PASS.
- [ ] Application context boots against the migration with schema validation (the `@SpringBootTest` classes above already exercise Flyway V42 on H2; optionally run the `run` skill to confirm V42 applies on real PostgreSQL).
- [ ] `git status` shows no stray edits to `SecurityConfig.java`, `SettingsAuditService.java`, `AssociateNotFoundException.java`, `AssociateRepository.java`.

## Self-Review

- **Spec coverage (unit 1 criteria):** migration/CHECK/indexes/no extra columns -> Task 1 (+ DB-rejects-invalid-status test); POST persists OPEN, null response, createdAt = updatedAt, returns response with associateUserId/Name -> Tasks 3-4; unknown associateId 404 checked first -> Task 3 (`never()` verifies) and Task 4; blank subject/description or missing associateId 400 -> Task 4; audit under `"support-ticket"` -> Task 3; `@PreAuthorize`, 403/401, SecurityConfigTest POST rows -> Task 4; package, handler shell, no `createdBy` -> Tasks 1-2.
- **Placeholders:** none; the only conditional is the getter-name confirmation in Task 3 step 1 and the `TEXT` column fallback note in Task 1.
- **Type consistency:** `CreateSupportTicketRequest(associateId, subject, description)`, `SupportTicketResponse.of(ticket, associate)`, `AdminSupportTicketService.create(request, actorId)` and `SupportTicketRepository` names are identical across Tasks 1-4.
- **Deviations from spec, deliberate:** `TIMESTAMP` instead of `TIMESTAMPTZ`; `@Size(max = 200)` on `subject` (spec lists only `@NotBlank`) so an over-long subject is a 400 rather than a DB 500; CHECK is a named table constraint rather than inline (same enforcement).
