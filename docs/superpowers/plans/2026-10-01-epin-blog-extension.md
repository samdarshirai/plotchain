# e-PIN Blog Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the merged e-pin backend (units 1-4) with expiry, admin allocation, block/unblock, an audit event log, associate self-redeem and transfer, and a `PENDING` associate status that an `ACTIVATION` redeem flips to `ACTIVE`, plus the admin and associate screens.

**Architecture:** One new Flyway migration widens the `epin` and `associate` status CHECKs, adds the new `epin` columns and an `epin_event` table. All e-pin state transitions live in `EPinService` and take a pessimistic row lock (`findByIdForUpdate`); every transition writes an `epin_event` row. Associate-facing endpoints are self-scoped through the JWT principal and resolve people by their human `userId`. Two Angular screens (admin register under `/settings`, associate `/e-pins`) follow the `ledger-register` and `payout-history` patterns.

**Tech Stack:** Spring Boot 3 / JPA / Flyway / Postgres (JUnit 5, Mockito, MockMvc, `@DataJpaTest`); Angular standalone components, ngx-translate, Karma/Jasmine.

**Spec:** `docs/superpowers/specs/role-capability/2026-10-01-epin-blog-extension-design.md` (delta on `docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md`). Read both.

## Global Constraints

- Batch `count` stays `@Min(1) @Max(2000)`; allocate `count` uses the same bounds.
- Pin status values exactly: `UNUSED`, `ALLOCATED`, `USED`, `BLOCKED`. `EXPIRED` is derived (`expires_at <= now` while `UNUSED`/`ALLOCATED`), never stored. Expiry boundary: `expires_at == now` is expired.
- Associate status values exactly: `ACTIVE`, `SUSPENDED`, `PENDING`. New `ROLE=ASSOCIATE` rows created by `AssociateProvisioningService` are `PENDING`; `ADMIN` and all existing rows stay `ACTIVE`.
- Associates never generate, allocate, block or unblock. Associate self-redeem is `ACTIVATION` only. `TOPUP` stays admin-only.
- Associate-facing request bodies use the human `userId` string (`findByUserId`); admin bodies keep UUID `associateId`.
- A pin an associate does not hold returns 404 (`EPinNotOwnedException`), never 403.
- Associate write endpoints need an explicit `.authenticated()` matcher placed ABOVE the blanket `POST /api/**` ADMIN rule in `SecurityConfig` (first-match-wins). Admin GET endpoints need an explicit `hasAuthority("ADMIN")` matcher.
- Time comes from an injected `java.time.Clock`, never `Instant.now()` in new e-pin code.
- Full code visibility, no masking. No expiry job/scheduler.
- Backend tests: run from `backend/`. `mvn test` shows ~55 spurious Mockito errors from a JDK21/25 mismatch (see memory `plotchain_jdk_mockito_env_issue`); judge by the targeted test classes named in each step, not the whole-suite count.
- Frontend tests: run from `frontend/` with `npx ng test --watch=false --include=<glob>`.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Deviations from the spec (decided while planning)

1. **Downline check reuses `AssociateRepository.findSelfAndDownline(UUID)`** (already exists, returns self plus all descendants). The spec's new `isInDownline` recursive CTE is not built. Caller excludes self explicitly.
2. **`EPinInvalidStateException` (409)** is added for illegal block/unblock transitions (block a `USED`/`BLOCKED` pin, unblock a non-`BLOCKED` pin). Not in the spec's exception list.
3. **`AssociateNotPendingException` (409)** replaces the spec's `AssociateAlreadyActiveException`, because the same rejection covers a `SUSPENDED` target, where "already active" would be wrong.
4. **`AssociateNotActiveException` (409)** is added for allocate/transfer recipients that are not `ACTIVE`.
5. **`JwtAuthenticationFilter` / `AssociateStatusCache.isActive`** currently treats only `ACTIVE` as active and would 401 every `PENDING` associate request. Task 5 changes it to "not `SUSPENDED`" (`ACTIVE` or `PENDING`). Without this the spec's "PENDING can log in" is false.
6. **Admin associate lookup** reuses `AdminService.listAssociates()` (`GET /api/associates`) as a `<select>`, the same pattern as `ledger-register`, rather than a new typeahead control.
7. **Admin register table is a plain HTML table**, not `EditableTableComponent`, because rows need per-row action buttons.

## Review Focus

Failure modes the spec implies that are most likely to bite a person, most likely first. Each has its test in the owning task.

1. **PENDING associate cannot authenticate** after the status is added (filter rejects non-`ACTIVE`). Expect: a `PENDING` associate's token still works on `GET /api/associates/me/profile`. (Task 5)
2. **Two simultaneous redeems or transfers of one pin.** Expect exactly one success, the other 409/404 and no double event. (Tasks 1, 7, 8: the lock is `findByIdForUpdate`; service tests assert it is used and a second call on the mutated pin is rejected.)
3. **Pin expiring exactly at the current instant.** Expect: expired, rejected. One second later: accepted. (Task 2)
4. **Allocate more than the pool holds.** Expect 409 and zero pins allocated (no partial allocation). (Task 4)
5. **Associate acts on someone else's pin, or a transfer to self / to a `PENDING` or `SUSPENDED` recipient / an activation target outside the caller's downline.** Expect 404 for not-held, 409 for self or non-`ACTIVE` recipient or non-`PENDING` target, 404 for a target outside the downline (no existence leak). (Tasks 7, 8)
6. **Unblock restores the right prior status** (`ALLOCATED` when `allocated_to` is set, else `UNUSED`). (Task 3)
7. **Known gap, not fixed here:** `AdminAssociateService.reactivate` sets any suspended associate to `ACTIVE`, so suspending then reactivating a `PENDING` associate skips activation. Out of scope per the spec; Task 5 records it in a code comment only.

---

## File Structure

**Backend, new (package `com.plotchain.epin` unless noted):**
- `resources/db/migration/V40__epin_extension.sql`: schema changes.
- `EPinEvent.java`, `EPinEventType.java`, `EPinEventRepository.java`, `EPinEventResponse.java`: audit log.
- `EPinConfig.java`: `Clock` bean.
- `BlockEPinRequest.java`, `AllocateEPinRequest.java`, `AllocateEPinResponse.java`, `AssociateRedeemEPinRequest.java`, `TransferEPinRequest.java`: request/response records.
- `EPinExpiredException.java`, `EPinBlockedException.java`, `EPinNotOwnedException.java`, `EPinInsufficientPoolException.java`, `EPinInvalidStateException.java`: 409/404 exceptions.
- `AssociateNotPendingException.java`, `AssociateNotActiveException.java` (package `com.plotchain.associate`).
- `AssociatePendingActivationException.java` (package `com.plotchain.withdrawal`).
- `AssociateEPinController.java`: `/api/associates/me/epins`.

**Backend, modified:** `EPin.java`, `EPinStatus.java`, `EPinRepository.java`, `EPinService.java`, `EPinController.java`, `EPinResponse.java`, `EPinBatchResponse.java`, `CreateEPinBatchRequest.java`, `EPinExceptionHandler.java`, `AssociateStatus.java`, `AssociateStatusCache.java`, `AssociateProvisioningService.java`, `AssociateProfileResponse.java`, `WithdrawalService.java`, `WithdrawalExceptionHandler.java`, `auth/SecurityConfig.java`.

**Frontend, new:** `admin/epin-register/{epin.model.ts, epin-register.service.ts, epin-register.component.ts}` (+ specs); `epins/{epin.model.ts, epins.service.ts, epins.component.ts}` (+ specs); `shared/components/pending-activation-banner/pending-activation-banner.component.ts` (+ spec).

**Frontend, modified:** `app.routes.ts`, `admin-nav-categories.model.ts`, `associate-nav-items.model.ts`, `dashboard/dashboard.component.ts` (banner), `admin/models/admin-associate-*.model.ts` (status union), `assets/i18n/en.json`, `styles/_admin.scss`, `styles/_dashboard.scss`.

---

### Task 1: Foundation: schema, entities, event log, Clock, register filters, row-locked redeem (spec unit 5)

**Files:**
- Create: `backend/src/main/resources/db/migration/V40__epin_extension.sql`
- Create: `backend/src/main/java/com/plotchain/epin/{EPinEvent,EPinEventType,EPinEventRepository,EPinConfig}.java`
- Modify: `EPinStatus.java`, `EPin.java`, `EPinRepository.java`, `EPinService.java`, `EPinController.java`, `EPinResponse.java`, `associate/AssociateStatus.java`
- Test: `backend/src/test/java/com/plotchain/epin/{EPinServiceTest,EPinRepositoryTest,EPinControllerTest}.java`

**Interfaces:**
- Produces:
  - `EPinStatus { UNUSED, ALLOCATED, USED, BLOCKED }`, `AssociateStatus { ACTIVE, SUSPENDED, PENDING }`
  - `EPin` new getters/setters: `expiresAt:Instant, allocatedTo/allocatedBy:UUID, allocatedAt:Instant, blockedBy:UUID, blockedAt:Instant, blockReason:String`; `boolean isExpiredAt(Instant now)` (`expiresAt != null && !expiresAt.isAfter(now)`)
  - `EPinEventRepository#findByEpinIdOrderByAtAscIdAsc(UUID): List<EPinEvent>`
  - `EPinRepository#findByIdForUpdate(UUID): Optional<EPin>` (`PESSIMISTIC_WRITE`)
  - `EPinRepository#search(EPinStatus status, UUID redeemedTo, UUID batchId, UUID allocatedTo, boolean expiredOnly, Instant now, Pageable p): Page<EPin>`
  - `EPinService(EPinRepository, AssociateRepository, EPinEventRepository, Clock)` constructor (grows again in Task 5)
  - `EPinService#list(EPinStatus status, UUID redeemedTo, UUID batchId, UUID allocatedTo, boolean expiredOnly, int page, int size): EPinPageResponse`
  - private `recordEvent(UUID epinId, EPinEventType type, UUID actorId, UUID from, UUID to, String note)`
  - `EPinResponse(id, code, batchId, status, generatedBy, generatedAt, expiresAt, allocatedTo, allocatedBy, allocatedAt, redeemedTo, redeemedBy, redeemedAt, redemptionType, linkedEntityId, blockedBy, blockedAt, blockReason, expired)`

- [ ] **Step 1: Write the migration**

`V40__epin_extension.sql`:

```sql
-- e-PIN extension (docs/superpowers/specs/role-capability/2026-10-01-epin-blog-extension-design.md,
-- Data model). Existing associate rows keep status 'ACTIVE' (column default), so the PENDING
-- value only ever applies to associates created after AssociateProvisioningService changes.
ALTER TABLE associate DROP CONSTRAINT chk_associate_status;
ALTER TABLE associate ADD CONSTRAINT chk_associate_status
    CHECK (status IN ('ACTIVE','SUSPENDED','PENDING'));

ALTER TABLE epin DROP CONSTRAINT chk_epin_status;
ALTER TABLE epin ADD CONSTRAINT chk_epin_status
    CHECK (status IN ('UNUSED','ALLOCATED','USED','BLOCKED'));

ALTER TABLE epin ADD COLUMN expires_at TIMESTAMP;
ALTER TABLE epin ADD COLUMN allocated_to UUID REFERENCES associate(id);
ALTER TABLE epin ADD COLUMN allocated_by UUID REFERENCES associate(id);
ALTER TABLE epin ADD COLUMN allocated_at TIMESTAMP;
ALTER TABLE epin ADD COLUMN blocked_by UUID REFERENCES associate(id);
ALTER TABLE epin ADD COLUMN blocked_at TIMESTAMP;
ALTER TABLE epin ADD COLUMN block_reason VARCHAR(255);
CREATE INDEX idx_epin_allocated_to ON epin(allocated_to);

CREATE TABLE epin_event (
    id UUID PRIMARY KEY,
    epin_id UUID NOT NULL REFERENCES epin(id),
    event_type VARCHAR(16) NOT NULL,
    actor_id UUID NOT NULL REFERENCES associate(id),
    from_associate_id UUID,
    to_associate_id UUID,
    at TIMESTAMP NOT NULL,
    note VARCHAR(255),
    CONSTRAINT chk_epin_event_type CHECK (event_type IN
        ('GENERATED','ALLOCATED','TRANSFERRED','REDEEMED','BLOCKED','UNBLOCKED'))
);
CREATE INDEX idx_epin_event_epin_id ON epin_event(epin_id);
```

- [ ] **Step 2: Write failing repository tests**

Append to `EPinRepositoryTest` (it already has `persistAdmin()` and `@DataJpaTest`). Add a helper and tests:

```java
    private EPin persistPin(UUID adminId, EPinStatus status, UUID allocatedTo, Instant expiresAt) {
        EPin epin = new EPin();
        epin.setId(UUID.randomUUID());
        epin.setCode("c-" + UUID.randomUUID());
        epin.setBatchId(UUID.randomUUID());
        epin.setStatus(status);
        epin.setGeneratedBy(adminId);
        epin.setGeneratedAt(Instant.now());
        epin.setAllocatedTo(allocatedTo);
        epin.setExpiresAt(expiresAt);
        return entityManager.persist(epin);
    }

    @Test
    void checkConstraintAcceptsAllocatedAndBlockedStatuses() {
        UUID admin = persistAdmin();
        persistPin(admin, EPinStatus.ALLOCATED, admin, null);
        persistPin(admin, EPinStatus.BLOCKED, null, null);
        entityManager.flush(); // would throw DataIntegrityViolationException if the CHECK rejected them
    }

    @Test
    void searchFiltersByAllocatedTo() {
        UUID admin = persistAdmin();
        UUID holder = persistAdmin();
        EPin mine = persistPin(admin, EPinStatus.ALLOCATED, holder, null);
        persistPin(admin, EPinStatus.ALLOCATED, admin, null);
        entityManager.flush();

        Page<EPin> page = epinRepository.search(null, null, null, holder, false, Instant.now(), PageRequest.of(0, 20));

        assertThat(page.getContent()).extracting(EPin::getId).containsExactly(mine.getId());
    }

    @Test
    void searchExpiredOnlyReturnsOnlyUnusedOrAllocatedPinsPastExpiry() {
        UUID admin = persistAdmin();
        Instant now = Instant.parse("2026-10-01T00:00:00Z");
        EPin expiredUnused = persistPin(admin, EPinStatus.UNUSED, null, now);              // boundary: == now is expired
        persistPin(admin, EPinStatus.UNUSED, null, now.plusSeconds(1));                    // future
        persistPin(admin, EPinStatus.UNUSED, null, null);                                  // never expires
        persistPin(admin, EPinStatus.USED, null, now.minusSeconds(60));                    // used pins are never "expired"
        entityManager.flush();

        Page<EPin> page = epinRepository.search(null, null, null, null, true, now, PageRequest.of(0, 20));

        assertThat(page.getContent()).extracting(EPin::getId).containsExactly(expiredUnused.getId());
    }

    @Test
    void findByIdForUpdateReturnsThePin() {
        UUID admin = persistAdmin();
        EPin pin = persistPin(admin, EPinStatus.UNUSED, null, null);
        entityManager.flush();

        assertThat(epinRepository.findByIdForUpdate(pin.getId())).isPresent();
    }
```

Also change the existing `search(...)` calls in this file to the 7-arg form, e.g. `epinRepository.search(null, null, null, null, false, Instant.now(), PageRequest.of(0, 20))`.

- [ ] **Step 3: Run to verify failure**

Run: `cd backend && mvn -q test -Dtest=EPinRepositoryTest`
Expected: COMPILE FAIL (`setAllocatedTo`, new `search` signature, `findByIdForUpdate` undefined).

- [ ] **Step 4: Implement enums, entity, repositories**

`EPinStatus.java`:

```java
package com.plotchain.epin;

public enum EPinStatus {
    UNUSED,
    ALLOCATED,
    USED,
    BLOCKED
}
```

`associate/AssociateStatus.java`:

```java
package com.plotchain.associate;

public enum AssociateStatus { ACTIVE, SUSPENDED, PENDING }
```

`EPinEventType.java`:

```java
package com.plotchain.epin;

public enum EPinEventType {
    GENERATED, ALLOCATED, TRANSFERRED, REDEEMED, BLOCKED, UNBLOCKED
}
```

`EPinEvent.java`:

```java
package com.plotchain.epin;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "epin_event")
public class EPinEvent {

    @Id
    private UUID id;

    @Column(name = "epin_id", nullable = false)
    private UUID epinId;

    @Enumerated(EnumType.STRING)
    @Column(name = "event_type", nullable = false)
    private EPinEventType eventType;

    @Column(name = "actor_id", nullable = false)
    private UUID actorId;

    @Column(name = "from_associate_id")
    private UUID fromAssociateId;

    @Column(name = "to_associate_id")
    private UUID toAssociateId;

    @Column(name = "at", nullable = false)
    private Instant at;

    private String note;

    public static EPinEvent of(UUID epinId, EPinEventType type, UUID actorId,
                               UUID from, UUID to, Instant at, String note) {
        EPinEvent e = new EPinEvent();
        e.id = UUID.randomUUID();
        e.epinId = epinId;
        e.eventType = type;
        e.actorId = actorId;
        e.fromAssociateId = from;
        e.toAssociateId = to;
        e.at = at;
        e.note = note;
        return e;
    }

    public UUID getId() { return id; }
    public UUID getEpinId() { return epinId; }
    public EPinEventType getEventType() { return eventType; }
    public UUID getActorId() { return actorId; }
    public UUID getFromAssociateId() { return fromAssociateId; }
    public UUID getToAssociateId() { return toAssociateId; }
    public Instant getAt() { return at; }
    public String getNote() { return note; }
}
```

`EPinEventRepository.java`:

```java
package com.plotchain.epin;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface EPinEventRepository extends JpaRepository<EPinEvent, UUID> {
    List<EPinEvent> findByEpinIdOrderByAtAscIdAsc(UUID epinId);
}
```

`EPinConfig.java`:

```java
package com.plotchain.epin;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

@Configuration
public class EPinConfig {
    @Bean
    public Clock clock() {
        return Clock.systemUTC();
    }
}
```

In `EPin.java` add (after `linkedEntityId`), with matching getters/setters and the helper:

```java
    @Column(name = "expires_at")
    private Instant expiresAt;

    @Column(name = "allocated_to")
    private UUID allocatedTo;

    @Column(name = "allocated_by")
    private UUID allocatedBy;

    @Column(name = "allocated_at")
    private Instant allocatedAt;

    @Column(name = "blocked_by")
    private UUID blockedBy;

    @Column(name = "blocked_at")
    private Instant blockedAt;

    @Column(name = "block_reason")
    private String blockReason;

    public Instant getExpiresAt() { return expiresAt; }
    public void setExpiresAt(Instant expiresAt) { this.expiresAt = expiresAt; }
    public UUID getAllocatedTo() { return allocatedTo; }
    public void setAllocatedTo(UUID allocatedTo) { this.allocatedTo = allocatedTo; }
    public UUID getAllocatedBy() { return allocatedBy; }
    public void setAllocatedBy(UUID allocatedBy) { this.allocatedBy = allocatedBy; }
    public Instant getAllocatedAt() { return allocatedAt; }
    public void setAllocatedAt(Instant allocatedAt) { this.allocatedAt = allocatedAt; }
    public UUID getBlockedBy() { return blockedBy; }
    public void setBlockedBy(UUID blockedBy) { this.blockedBy = blockedBy; }
    public Instant getBlockedAt() { return blockedAt; }
    public void setBlockedAt(Instant blockedAt) { this.blockedAt = blockedAt; }
    public String getBlockReason() { return blockReason; }
    public void setBlockReason(String blockReason) { this.blockReason = blockReason; }

    // Expiry boundary: expiresAt == now is expired. Callers check status first; a USED or
    // BLOCKED pin is never reported "expired" (see EPinService.toResponse).
    public boolean isExpiredAt(Instant now) {
        return expiresAt != null && !expiresAt.isAfter(now);
    }
```

Replace the `search` query and add the lock query in `EPinRepository.java` (add imports `jakarta.persistence.LockModeType`, `org.springframework.data.jpa.repository.Lock`, `java.time.Instant`, `java.util.Optional`):

```java
    @Query("""
        SELECT e FROM EPin e
        WHERE (:status IS NULL OR e.status = :status)
        AND (:redeemedTo IS NULL OR e.redeemedTo = :redeemedTo)
        AND (:batchId IS NULL OR e.batchId = :batchId)
        AND (:allocatedTo IS NULL OR e.allocatedTo = :allocatedTo)
        AND (:expiredOnly = FALSE OR (
              e.expiresAt IS NOT NULL AND e.expiresAt <= :now
              AND e.status IN (com.plotchain.epin.EPinStatus.UNUSED, com.plotchain.epin.EPinStatus.ALLOCATED)))
        ORDER BY e.generatedAt DESC, e.id
        """)
    Page<EPin> search(
        @Param("status") EPinStatus status,
        @Param("redeemedTo") UUID redeemedTo,
        @Param("batchId") UUID batchId,
        @Param("allocatedTo") UUID allocatedTo,
        @Param("expiredOnly") boolean expiredOnly,
        @Param("now") Instant now,
        Pageable pageable);

    // Row lock for every state transition (redeem/transfer/allocate/block/unblock): two
    // simultaneous requests on one pin serialise here, so the second sees the mutated status.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT e FROM EPin e WHERE e.id = :id")
    Optional<EPin> findByIdForUpdate(@Param("id") UUID id);
```

`EPinResponse.java`: replace the record with:

```java
public record EPinResponse(
    UUID id,
    String code,
    UUID batchId,
    EPinStatus status,
    UUID generatedBy,
    Instant generatedAt,
    Instant expiresAt,
    UUID allocatedTo,
    UUID allocatedBy,
    Instant allocatedAt,
    UUID redeemedTo,
    UUID redeemedBy,
    Instant redeemedAt,
    RedemptionType redemptionType,
    UUID linkedEntityId,
    UUID blockedBy,
    Instant blockedAt,
    String blockReason,
    boolean expired
) {}
```

- [ ] **Step 5: Run repository tests**

Run: `cd backend && mvn -q test -Dtest=EPinRepositoryTest`
Expected: PASS.

- [ ] **Step 6: Write failing service tests**

In `EPinServiceTest`: add `@Mock EPinEventRepository epinEventRepository;`, a fixed clock constant, and update `setUp`:

```java
    static final Instant NOW = Instant.parse("2026-10-01T00:00:00Z");
    final Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);

    @BeforeEach
    void setUp() {
        epinService = new EPinService(epinRepository, associateRepository, epinEventRepository, clock);
    }
```

(imports `java.time.Clock`, `java.time.ZoneOffset`, `com.plotchain.epin.EPinEventType` is same package.)

Update every existing `epinRepository.findById(epinId)` stub in the redeem tests to `epinRepository.findByIdForUpdate(epinId)`; update `list(...)` calls to `epinService.list(status, redeemedTo, batchId, null, false, page, size)` and the verify to `epinRepository.search(EPinStatus.UNUSED, redeemedTo, batchId, null, false, NOW, PageRequest.of(2, 10))`; update `search` stubs to `search(any(), any(), any(), any(), anyBoolean(), any(), any())` (import `org.mockito.ArgumentMatchers.anyBoolean`). Fix any `new EPinResponse(` call sites to the new 19-arg shape.

Add:

```java
    @Test
    void generateBatchRecordsOneGeneratedEventPerRowAttributedToTheActor() {
        when(epinRepository.existsByCode(any())).thenReturn(false);
        when(epinRepository.save(any())).thenAnswer(i -> i.getArgument(0));
        ArgumentCaptor<EPinEvent> events = ArgumentCaptor.forClass(EPinEvent.class);
        UUID actor = UUID.randomUUID();

        epinService.generateBatch(new CreateEPinBatchRequest(3), actor);

        verify(epinEventRepository, times(3)).save(events.capture());
        assertThat(events.getAllValues()).allMatch(e ->
            e.getEventType() == EPinEventType.GENERATED && e.getActorId().equals(actor) && e.getAt().equals(NOW));
    }

    @Test
    void redeemRecordsARedeemedEventFromTheCurrentHolderToTheTarget() {
        UUID epinId = UUID.randomUUID();
        UUID holder = UUID.randomUUID();
        UUID target = UUID.randomUUID();
        UUID actor = UUID.randomUUID();
        EPin pin = new EPin();
        pin.setId(epinId);
        pin.setStatus(EPinStatus.ALLOCATED);
        pin.setAllocatedTo(holder);
        when(epinRepository.findByIdForUpdate(epinId)).thenReturn(Optional.of(pin));
        when(associateRepository.findById(target)).thenReturn(Optional.of(new Associate()));
        ArgumentCaptor<EPinEvent> events = ArgumentCaptor.forClass(EPinEvent.class);

        epinService.redeem(epinId, new RedeemEPinRequest(target, RedemptionType.TOPUP, null), actor);

        verify(epinEventRepository).save(events.capture());
        EPinEvent e = events.getValue();
        assertThat(e.getEventType()).isEqualTo(EPinEventType.REDEEMED);
        assertThat(e.getFromAssociateId()).isEqualTo(holder);
        assertThat(e.getToAssociateId()).isEqualTo(target);
        assertThat(pin.getStatus()).isEqualTo(EPinStatus.USED);
        assertThat(pin.getRedeemedAt()).isEqualTo(NOW);
    }

    @Test
    void toResponseMarksAnUnusedPinPastItsExpiryAsExpiredButNeverAUsedOne() {
        EPin expired = new EPin();
        expired.setId(UUID.randomUUID());
        expired.setStatus(EPinStatus.UNUSED);
        expired.setExpiresAt(NOW);
        EPin used = new EPin();
        used.setId(UUID.randomUUID());
        used.setStatus(EPinStatus.USED);
        used.setExpiresAt(NOW.minusSeconds(60));
        when(epinRepository.search(any(), any(), any(), any(), anyBoolean(), any(), any()))
            .thenReturn(new PageImpl<>(List.of(expired, used), PageRequest.of(0, 20), 2));

        EPinPageResponse response = epinService.list(null, null, null, null, false, 0, 20);

        assertThat(response.epins().get(0).expired()).isTrue();
        assertThat(response.epins().get(1).expired()).isFalse();
    }
```

(Existing redeem happy-path test: `new Associate()` target with default `ACTIVE` status and `TOPUP`/`ACTIVATION` type is fine in this task; Task 5 tightens `ACTIVATION`.)

- [ ] **Step 7: Run to verify failure**

Run: `cd backend && mvn -q test -Dtest=EPinServiceTest`
Expected: COMPILE FAIL (constructor, `list` signature).

- [ ] **Step 8: Implement `EPinService` changes**

Replace the constructor/fields, `generateBatch`, `list`, `redeem`, `toResponse`:

```java
    private final EPinRepository epinRepository;
    private final AssociateRepository associateRepository;
    private final EPinEventRepository epinEventRepository;
    private final Clock clock;

    public EPinService(EPinRepository epinRepository, AssociateRepository associateRepository,
                       EPinEventRepository epinEventRepository, Clock clock) {
        this.epinRepository = epinRepository;
        this.associateRepository = associateRepository;
        this.epinEventRepository = epinEventRepository;
        this.clock = clock;
    }

    @Transactional
    public EPinBatchResponse generateBatch(CreateEPinBatchRequest request, UUID actorId) {
        UUID batchId = UUID.randomUUID();
        Instant generatedAt = clock.instant();
        List<String> codes = new ArrayList<>();

        for (int i = 0; i < request.count(); i++) {
            String code;
            do {
                code = EPinCodeGenerator.generate();
            } while (epinRepository.existsByCode(code));

            EPin epin = new EPin();
            epin.setId(UUID.randomUUID());
            epin.setCode(code);
            epin.setBatchId(batchId);
            epin.setStatus(EPinStatus.UNUSED);
            epin.setGeneratedBy(actorId);
            epin.setGeneratedAt(generatedAt);
            epinRepository.save(epin);
            recordEvent(epin.getId(), EPinEventType.GENERATED, actorId, null, null, null);
            codes.add(code);
        }

        return new EPinBatchResponse(batchId, request.count(), codes, generatedAt);
    }

    public EPinPageResponse list(EPinStatus status, UUID redeemedTo, UUID batchId, UUID allocatedTo,
                                 boolean expiredOnly, int page, int size) {
        Page<EPin> result = epinRepository.search(status, redeemedTo, batchId, allocatedTo, expiredOnly,
            clock.instant(), PageRequest.of(page, size));
        List<EPinResponse> epins = result.getContent().stream().map(this::toResponse).toList();
        return new EPinPageResponse(epins, page, size, result.getTotalElements());
    }

    @Transactional
    public EPinResponse redeem(UUID id, RedeemEPinRequest request, UUID actorId) {
        EPin epin = epinRepository.findByIdForUpdate(id)
            .orElseThrow(() -> new EPinNotFoundException(id));

        if (epin.getStatus() == EPinStatus.USED) {
            throw new EPinAlreadyRedeemedException(id);
        }

        associateRepository.findById(request.associateId())
            .orElseThrow(() -> new AssociateNotFoundException(request.associateId()));

        UUID holder = epin.getAllocatedTo();
        epin.setStatus(EPinStatus.USED);
        epin.setRedeemedTo(request.associateId());
        epin.setRedeemedBy(actorId);
        epin.setRedeemedAt(clock.instant());
        epin.setRedemptionType(request.redemptionType());
        epin.setLinkedEntityId(request.linkedEntityId());
        epinRepository.save(epin);
        recordEvent(id, EPinEventType.REDEEMED, actorId, holder, request.associateId(), null);

        return toResponse(epin);
    }

    private void recordEvent(UUID epinId, EPinEventType type, UUID actorId, UUID from, UUID to, String note) {
        epinEventRepository.save(EPinEvent.of(epinId, type, actorId, from, to, clock.instant(), note));
    }

    private EPinResponse toResponse(EPin epin) {
        boolean live = epin.getStatus() == EPinStatus.UNUSED || epin.getStatus() == EPinStatus.ALLOCATED;
        return new EPinResponse(
            epin.getId(), epin.getCode(), epin.getBatchId(), epin.getStatus(),
            epin.getGeneratedBy(), epin.getGeneratedAt(), epin.getExpiresAt(),
            epin.getAllocatedTo(), epin.getAllocatedBy(), epin.getAllocatedAt(),
            epin.getRedeemedTo(), epin.getRedeemedBy(), epin.getRedeemedAt(),
            epin.getRedemptionType(), epin.getLinkedEntityId(),
            epin.getBlockedBy(), epin.getBlockedAt(), epin.getBlockReason(),
            live && epin.isExpiredAt(clock.instant()));
    }
```

Add imports `java.time.Clock`. Remove the old `Instant.now()` usages.

- [ ] **Step 9: Update `EPinController.list` to the new service signature**

```java
    @GetMapping
    public EPinPageResponse list(
            @RequestParam(required = false) EPinStatus status,
            @RequestParam(required = false) UUID redeemedTo,
            @RequestParam(required = false) UUID batchId,
            @RequestParam(required = false) UUID allocatedTo,
            @RequestParam(defaultValue = "false") boolean expired,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        page = Math.max(page, 0);
        size = Math.min(size, 100);
        return epinService.list(status, redeemedTo, batchId, allocatedTo, expired, page, size);
    }
```

In `EPinControllerTest`, update `epinRepository.search(...)` stubs/verifies to the 7-arg form (`any(), any(), any(), any(), anyBoolean(), any(), any()`; `eq`/`isNull` for the verify as before plus `isNull()` for `allocatedTo`, `eq(false)`, `any()` for `now`), and redeem stubs from `findById` to `findByIdForUpdate`. Add:

```java
    @Test
    void listAcceptsTheAllocatedToAndExpiredFiltersAndPassesThemThrough() throws Exception {
        UUID holder = UUID.randomUUID();
        when(epinRepository.search(any(), any(), any(), any(), anyBoolean(), any(), any()))
            .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 20), 0));

        mockMvc.perform(get("/api/admin/epins")
                .param("allocatedTo", holder.toString())
                .param("expired", "true")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk());

        verify(epinRepository).search(isNull(), isNull(), isNull(), eq(holder), eq(true), any(), any());
    }
```

(import `org.mockito.ArgumentMatchers.anyBoolean`.)

- [ ] **Step 10: Run the e-pin test classes**

Run: `cd backend && mvn -q test -Dtest='EPin*Test,AssociateStatusCacheTest,SecurityConfigTest'`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add backend/src
git commit -m "feat(epin): schema, event log, Clock, register filters, row-locked redeem

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Expiry on batch generation and redeem (spec unit 6)

**Files:**
- Create: `backend/src/main/java/com/plotchain/epin/EPinExpiredException.java`
- Modify: `CreateEPinBatchRequest.java`, `EPinBatchResponse.java`, `EPinService.java`, `EPinExceptionHandler.java`
- Test: `EPinServiceTest.java`, `EPinControllerTest.java`

**Interfaces:**
- Consumes: Task 1 `EPin#isExpiredAt`, `EPinService` clock.
- Produces: `CreateEPinBatchRequest(int count, Instant expiresAt)` plus convenience `CreateEPinBatchRequest(int count)`; `EPinBatchResponse(batchId, count, codes, generatedAt, expiresAt)`; `EPinExpiredException(UUID)` mapped 409.

- [ ] **Step 1: Write failing tests**

`EPinServiceTest`:

```java
    @Test
    void generateBatchStampsTheExpiryOnEveryRow() {
        when(epinRepository.existsByCode(any())).thenReturn(false);
        when(epinRepository.save(any())).thenAnswer(i -> i.getArgument(0));
        ArgumentCaptor<EPin> captor = ArgumentCaptor.forClass(EPin.class);
        Instant expiry = NOW.plusSeconds(86_400);

        EPinBatchResponse response = epinService.generateBatch(new CreateEPinBatchRequest(2, expiry), UUID.randomUUID());

        verify(epinRepository, times(2)).save(captor.capture());
        assertThat(captor.getAllValues()).allMatch(e -> expiry.equals(e.getExpiresAt()));
        assertThat(response.expiresAt()).isEqualTo(expiry);
    }

    @Test
    void redeemRejectsAPinWhoseExpiryIsExactlyNow() {
        UUID epinId = UUID.randomUUID();
        EPin pin = new EPin();
        pin.setId(epinId);
        pin.setStatus(EPinStatus.UNUSED);
        pin.setExpiresAt(NOW);
        when(epinRepository.findByIdForUpdate(epinId)).thenReturn(Optional.of(pin));

        assertThatThrownBy(() -> epinService.redeem(epinId,
                new RedeemEPinRequest(UUID.randomUUID(), RedemptionType.TOPUP, null), UUID.randomUUID()))
            .isInstanceOf(EPinExpiredException.class);

        verify(epinRepository, never()).save(any());
        verify(associateRepository, never()).findById(any());
    }

    @Test
    void redeemAcceptsAPinExpiringOneSecondAfterNow() {
        UUID epinId = UUID.randomUUID();
        UUID target = UUID.randomUUID();
        EPin pin = new EPin();
        pin.setId(epinId);
        pin.setStatus(EPinStatus.UNUSED);
        pin.setExpiresAt(NOW.plusSeconds(1));
        when(epinRepository.findByIdForUpdate(epinId)).thenReturn(Optional.of(pin));
        when(associateRepository.findById(target)).thenReturn(Optional.of(new Associate()));

        epinService.redeem(epinId, new RedeemEPinRequest(target, RedemptionType.TOPUP, null), UUID.randomUUID());

        assertThat(pin.getStatus()).isEqualTo(EPinStatus.USED);
    }
```

`EPinControllerTest`:

```java
    @Test
    void generateBatchRejectsAnExpiryInThePastWith400() throws Exception {
        String body = "{\"count\":2,\"expiresAt\":\"2020-01-01T00:00:00Z\"}";

        mockMvc.perform(post("/api/admin/epins")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json").content(body))
            .andExpect(status().isBadRequest());

        verify(epinRepository, never()).save(any());
    }

    @Test
    void generateBatchAcceptsAFutureExpiryAndEchoesIt() throws Exception {
        when(epinRepository.existsByCode(any())).thenReturn(false);
        when(epinRepository.save(any())).thenAnswer(i -> i.getArgument(0));
        String body = "{\"count\":1,\"expiresAt\":\"2999-01-01T00:00:00Z\"}";

        mockMvc.perform(post("/api/admin/epins")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json").content(body))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.expiresAt").isNotEmpty());
    }

    @Test
    void redeemOfAnExpiredPinReturns409() throws Exception {
        UUID id = UUID.randomUUID();
        EPin pin = new EPin();
        pin.setId(id);
        pin.setStatus(EPinStatus.UNUSED);
        pin.setExpiresAt(Instant.parse("2020-01-01T00:00:00Z"));
        when(epinRepository.findByIdForUpdate(id)).thenReturn(Optional.of(pin));
        String body = "{\"associateId\":\"" + UUID.randomUUID() + "\",\"redemptionType\":\"TOPUP\"}";

        mockMvc.perform(post("/api/admin/epins/" + id + "/redeem")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json").content(body))
            .andExpect(status().isConflict());
    }
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && mvn -q test -Dtest='EPinServiceTest,EPinControllerTest'`
Expected: COMPILE FAIL (`CreateEPinBatchRequest(int, Instant)`, `EPinExpiredException`, `expiresAt()`).

- [ ] **Step 3: Implement**

`CreateEPinBatchRequest.java`:

```java
package com.plotchain.epin;

import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import java.time.Instant;

// expiresAt is optional (null = never expires); when present it must be in the future
// (epin-blog-extension spec, Data model / Endpoints). count stays validated, not clamped
// (2026-08-03 spec Decision 9).
public record CreateEPinBatchRequest(
    @Min(1) @Max(2000) int count,
    @Future Instant expiresAt
) {
    public CreateEPinBatchRequest(int count) {
        this(count, null);
    }
}
```

`EPinBatchResponse.java`:

```java
public record EPinBatchResponse(
    UUID batchId,
    int count,
    List<String> codes,
    Instant generatedAt,
    Instant expiresAt
) {}
```

`EPinExpiredException.java`:

```java
package com.plotchain.epin;

import java.util.UUID;

public class EPinExpiredException extends RuntimeException {
    public EPinExpiredException(UUID epinId) {
        super("E-PIN has expired: " + epinId);
    }
}
```

`EPinExceptionHandler.java` add:

```java
    @ExceptionHandler(EPinExpiredException.class)
    public ResponseEntity<Map<String, String>> handleEPinExpired(EPinExpiredException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }
```

`EPinService`: in `generateBatch` add `epin.setExpiresAt(request.expiresAt());` after `setGeneratedAt`, and return `new EPinBatchResponse(batchId, request.count(), codes, generatedAt, request.expiresAt())`. In `redeem`, directly after the `USED` check:

```java
        if (epin.isExpiredAt(clock.instant())) {
            throw new EPinExpiredException(id);
        }
```

- [ ] **Step 4: Run tests**

Run: `cd backend && mvn -q test -Dtest='EPinServiceTest,EPinControllerTest'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src
git commit -m "feat(epin): optional batch expiry; redeem rejects expired pins

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Block, unblock, and the audit events endpoint (spec unit 7)

**Files:**
- Create: `backend/src/main/java/com/plotchain/epin/{BlockEPinRequest,EPinEventResponse,EPinBlockedException,EPinInvalidStateException}.java`
- Modify: `EPinService.java`, `EPinController.java`, `EPinExceptionHandler.java`, `auth/SecurityConfig.java`
- Test: `EPinServiceTest.java`, `EPinControllerTest.java`, `auth/SecurityConfigTest.java`

**Interfaces:**
- Consumes: Task 1 `findByIdForUpdate`, `recordEvent`, `EPinEventRepository#findByEpinIdOrderByAtAscIdAsc`.
- Produces: `EPinService#block(UUID id, String reason, UUID actorId): EPinResponse`, `#unblock(UUID id, UUID actorId): EPinResponse`, `#events(UUID id): List<EPinEventResponse>`; `EPinBlockedException(UUID)` (409), `EPinInvalidStateException(String)` (409); redeem now rejects `BLOCKED`.

- [ ] **Step 1: Write failing service tests**

```java
    private EPin pinWith(EPinStatus status) {
        EPin pin = new EPin();
        pin.setId(UUID.randomUUID());
        pin.setStatus(status);
        when(epinRepository.findByIdForUpdate(pin.getId())).thenReturn(Optional.of(pin));
        return pin;
    }

    @Test
    void blockMovesAnUnusedPinToBlockedRecordingReasonActorAndAnEvent() {
        EPin pin = pinWith(EPinStatus.UNUSED);
        UUID actor = UUID.randomUUID();
        ArgumentCaptor<EPinEvent> events = ArgumentCaptor.forClass(EPinEvent.class);

        epinService.block(pin.getId(), "lost voucher", actor);

        assertThat(pin.getStatus()).isEqualTo(EPinStatus.BLOCKED);
        assertThat(pin.getBlockedBy()).isEqualTo(actor);
        assertThat(pin.getBlockedAt()).isEqualTo(NOW);
        assertThat(pin.getBlockReason()).isEqualTo("lost voucher");
        verify(epinEventRepository).save(events.capture());
        assertThat(events.getValue().getEventType()).isEqualTo(EPinEventType.BLOCKED);
        assertThat(events.getValue().getNote()).isEqualTo("lost voucher");
    }

    @Test
    void blockRejectsAUsedOrAlreadyBlockedPinWithNoSideEffects() {
        EPin used = pinWith(EPinStatus.USED);
        EPin blocked = pinWith(EPinStatus.BLOCKED);

        assertThatThrownBy(() -> epinService.block(used.getId(), "x", UUID.randomUUID()))
            .isInstanceOf(EPinInvalidStateException.class);
        assertThatThrownBy(() -> epinService.block(blocked.getId(), "x", UUID.randomUUID()))
            .isInstanceOf(EPinInvalidStateException.class);

        verify(epinRepository, never()).save(any());
        verify(epinEventRepository, never()).save(any());
    }

    @Test
    void unblockRestoresAllocatedWhenAHolderIsSetElseUnusedAndClearsBlockFields() {
        EPin held = pinWith(EPinStatus.BLOCKED);
        held.setAllocatedTo(UUID.randomUUID());
        held.setBlockedBy(UUID.randomUUID());
        held.setBlockReason("r");
        EPin free = pinWith(EPinStatus.BLOCKED);

        epinService.unblock(held.getId(), UUID.randomUUID());
        epinService.unblock(free.getId(), UUID.randomUUID());

        assertThat(held.getStatus()).isEqualTo(EPinStatus.ALLOCATED);
        assertThat(held.getBlockedBy()).isNull();
        assertThat(held.getBlockReason()).isNull();
        assertThat(free.getStatus()).isEqualTo(EPinStatus.UNUSED);
    }

    @Test
    void unblockRejectsAPinThatIsNotBlocked() {
        EPin pin = pinWith(EPinStatus.UNUSED);

        assertThatThrownBy(() -> epinService.unblock(pin.getId(), UUID.randomUUID()))
            .isInstanceOf(EPinInvalidStateException.class);
    }

    @Test
    void redeemRejectsABlockedPinWithNoSideEffects() {
        EPin pin = pinWith(EPinStatus.BLOCKED);

        assertThatThrownBy(() -> epinService.redeem(pin.getId(),
                new RedeemEPinRequest(UUID.randomUUID(), RedemptionType.TOPUP, null), UUID.randomUUID()))
            .isInstanceOf(EPinBlockedException.class);

        verify(epinRepository, never()).save(any());
    }

    @Test
    void eventsReturnsTheTrailOldestFirstAndThrowsNotFoundForAnUnknownPin() {
        UUID id = UUID.randomUUID();
        when(epinRepository.existsById(id)).thenReturn(true);
        when(epinEventRepository.findByEpinIdOrderByAtAscIdAsc(id)).thenReturn(List.of(
            EPinEvent.of(id, EPinEventType.GENERATED, UUID.randomUUID(), null, null, NOW, null)));

        assertThat(epinService.events(id)).extracting(EPinEventResponse::eventType)
            .containsExactly(EPinEventType.GENERATED);

        UUID missing = UUID.randomUUID();
        when(epinRepository.existsById(missing)).thenReturn(false);
        assertThatThrownBy(() -> epinService.events(missing)).isInstanceOf(EPinNotFoundException.class);
    }
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && mvn -q test -Dtest=EPinServiceTest`
Expected: COMPILE FAIL.

- [ ] **Step 3: Implement**

`BlockEPinRequest.java`:

```java
package com.plotchain.epin;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record BlockEPinRequest(@NotBlank @Size(max = 255) String reason) {}
```

`EPinEventResponse.java`:

```java
package com.plotchain.epin;

import java.time.Instant;
import java.util.UUID;

public record EPinEventResponse(
    EPinEventType eventType, UUID actorId, UUID fromAssociateId, UUID toAssociateId, Instant at, String note
) {
    static EPinEventResponse from(EPinEvent e) {
        return new EPinEventResponse(e.getEventType(), e.getActorId(), e.getFromAssociateId(),
            e.getToAssociateId(), e.getAt(), e.getNote());
    }
}
```

`EPinBlockedException.java`:

```java
package com.plotchain.epin;

import java.util.UUID;

public class EPinBlockedException extends RuntimeException {
    public EPinBlockedException(UUID epinId) {
        super("E-PIN is blocked: " + epinId);
    }
}
```

`EPinInvalidStateException.java`:

```java
package com.plotchain.epin;

public class EPinInvalidStateException extends RuntimeException {
    public EPinInvalidStateException(String message) {
        super(message);
    }
}
```

Handler additions (both 409):

```java
    @ExceptionHandler(EPinBlockedException.class)
    public ResponseEntity<Map<String, String>> handleEPinBlocked(EPinBlockedException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(EPinInvalidStateException.class)
    public ResponseEntity<Map<String, String>> handleEPinInvalidState(EPinInvalidStateException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }
```

`EPinService` additions; in `redeem`, after the `USED` check and before the expiry check add `if (epin.getStatus() == EPinStatus.BLOCKED) { throw new EPinBlockedException(id); }`. New methods:

```java
    @Transactional
    public EPinResponse block(UUID id, String reason, UUID actorId) {
        EPin epin = epinRepository.findByIdForUpdate(id).orElseThrow(() -> new EPinNotFoundException(id));
        if (epin.getStatus() == EPinStatus.USED || epin.getStatus() == EPinStatus.BLOCKED) {
            throw new EPinInvalidStateException("Cannot block an e-PIN in status " + epin.getStatus() + ": " + id);
        }
        epin.setStatus(EPinStatus.BLOCKED);
        epin.setBlockedBy(actorId);
        epin.setBlockedAt(clock.instant());
        epin.setBlockReason(reason);
        epinRepository.save(epin);
        recordEvent(id, EPinEventType.BLOCKED, actorId, epin.getAllocatedTo(), null, reason);
        return toResponse(epin);
    }

    @Transactional
    public EPinResponse unblock(UUID id, UUID actorId) {
        EPin epin = epinRepository.findByIdForUpdate(id).orElseThrow(() -> new EPinNotFoundException(id));
        if (epin.getStatus() != EPinStatus.BLOCKED) {
            throw new EPinInvalidStateException("E-PIN is not blocked: " + id);
        }
        epin.setStatus(epin.getAllocatedTo() != null ? EPinStatus.ALLOCATED : EPinStatus.UNUSED);
        epin.setBlockedBy(null);
        epin.setBlockedAt(null);
        epin.setBlockReason(null);
        epinRepository.save(epin);
        recordEvent(id, EPinEventType.UNBLOCKED, actorId, null, epin.getAllocatedTo(), null);
        return toResponse(epin);
    }

    public List<EPinEventResponse> events(UUID id) {
        if (!epinRepository.existsById(id)) {
            throw new EPinNotFoundException(id);
        }
        return epinEventRepository.findByEpinIdOrderByAtAscIdAsc(id).stream().map(EPinEventResponse::from).toList();
    }
```

`EPinController` additions (imports `java.util.List`):

```java
    @PostMapping("/{id}/block")
    public EPinResponse block(@PathVariable UUID id, @Valid @RequestBody BlockEPinRequest request,
                              @AuthenticationPrincipal UUID actorId) {
        return epinService.block(id, request.reason(), actorId);
    }

    @PostMapping("/{id}/unblock")
    public EPinResponse unblock(@PathVariable UUID id, @AuthenticationPrincipal UUID actorId) {
        return epinService.unblock(id, actorId);
    }

    @GetMapping("/{id}/events")
    public List<EPinEventResponse> events(@PathVariable UUID id) {
        return epinService.events(id);
    }
```

`SecurityConfig.java`: directly after the `POST /api/admin/epins/*/redeem` matcher add:

```java
                .requestMatchers(HttpMethod.POST, "/api/admin/epins/*/block").hasAuthority("ADMIN")
                .requestMatchers(HttpMethod.POST, "/api/admin/epins/*/unblock").hasAuthority("ADMIN")
                // GET needs its own matcher: without one it falls to anyRequest().authenticated()
                // and any associate could read a pin's audit trail.
                .requestMatchers(HttpMethod.GET, "/api/admin/epins/*/events").hasAuthority("ADMIN")
```

- [ ] **Step 4: Write controller and security tests**

`EPinControllerTest`:

```java
    @Test
    void blockReturns200AndUnblockRestoresIt() throws Exception {
        UUID id = UUID.randomUUID();
        EPin pin = new EPin();
        pin.setId(id);
        pin.setStatus(EPinStatus.UNUSED);
        when(epinRepository.findByIdForUpdate(id)).thenReturn(Optional.of(pin));
        String admin = tokenFor(AssociateRole.ADMIN);

        mockMvc.perform(post("/api/admin/epins/" + id + "/block")
                .header("Authorization", "Bearer " + admin)
                .contentType("application/json").content("{\"reason\":\"lost\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("BLOCKED"))
            .andExpect(jsonPath("$.blockReason").value("lost"));

        mockMvc.perform(post("/api/admin/epins/" + id + "/unblock")
                .header("Authorization", "Bearer " + admin))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("UNUSED"));
    }

    @Test
    void blockWithABlankReasonReturns400AndBlockingAUsedPinReturns409() throws Exception {
        UUID id = UUID.randomUUID();
        EPin pin = new EPin();
        pin.setId(id);
        pin.setStatus(EPinStatus.USED);
        when(epinRepository.findByIdForUpdate(id)).thenReturn(Optional.of(pin));
        String admin = tokenFor(AssociateRole.ADMIN);

        mockMvc.perform(post("/api/admin/epins/" + id + "/block")
                .header("Authorization", "Bearer " + admin)
                .contentType("application/json").content("{\"reason\":\"  \"}"))
            .andExpect(status().isBadRequest());
        mockMvc.perform(post("/api/admin/epins/" + id + "/block")
                .header("Authorization", "Bearer " + admin)
                .contentType("application/json").content("{\"reason\":\"x\"}"))
            .andExpect(status().isConflict());
    }

    @Test
    void eventsEndpointIs404ForAnUnknownPinAndForbiddenForAnAssociateToken() throws Exception {
        UUID id = UUID.randomUUID();
        when(epinRepository.existsById(id)).thenReturn(false);

        mockMvc.perform(get("/api/admin/epins/" + id + "/events")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/admin/epins/" + id + "/events")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }
```

(`EPinControllerTest` needs `@MockBean EPinEventRepository epinEventRepository;` added to the class so the context's real repository does not hit a DB; add it in this step if Task 1 did not already.)

In `SecurityConfigTest`, following the existing e-pin cases' shape in that file (mock-token helper already there), add one test asserting an ASSOCIATE token gets 403 on `POST /api/admin/epins/{id}/block`, `POST /api/admin/epins/{id}/unblock` and `GET /api/admin/epins/{id}/events`.

- [ ] **Step 5: Run tests**

Run: `cd backend && mvn -q test -Dtest='EPinServiceTest,EPinControllerTest,SecurityConfigTest'`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src
git commit -m "feat(epin): admin block/unblock and audit events endpoint

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Admin allocate (spec unit 8)

**Files:**
- Create: `backend/src/main/java/com/plotchain/epin/{AllocateEPinRequest,AllocateEPinResponse,EPinInsufficientPoolException}.java`, `backend/src/main/java/com/plotchain/associate/AssociateNotActiveException.java`
- Modify: `EPinRepository.java`, `EPinService.java`, `EPinController.java`, `EPinExceptionHandler.java`, `auth/SecurityConfig.java`
- Test: `EPinServiceTest.java`, `EPinControllerTest.java`, `EPinRepositoryTest.java`

**Interfaces:**
- Consumes: Task 1 `recordEvent`, `clock`.
- Produces: `EPinRepository#findAllocatable(Instant now, UUID batchId, Pageable p): List<EPin>` (`PESSIMISTIC_WRITE`, status `UNUSED`, unexpired, oldest first); `EPinService#allocate(AllocateEPinRequest, UUID actorId): AllocateEPinResponse`; `AllocateEPinRequest(UUID associateId, int count, UUID batchId)`; `AllocateEPinResponse(UUID associateId, int count, List<Item> pins)` with `record Item(UUID id, String code)`; `AssociateNotActiveException(UUID)` (409, mapped in `EPinExceptionHandler`); `EPinInsufficientPoolException(int requested, int available)` (409).

- [ ] **Step 1: Write failing tests**

`EPinServiceTest`:

```java
    private Associate associateWith(UUID id, AssociateStatus status) {
        Associate a = new Associate();
        a.setId(id);
        a.setStatus(status);
        when(associateRepository.findById(id)).thenReturn(Optional.of(a));
        return a;
    }

    private EPin unusedPin() {
        EPin pin = new EPin();
        pin.setId(UUID.randomUUID());
        pin.setCode("c-" + pin.getId());
        pin.setStatus(EPinStatus.UNUSED);
        return pin;
    }

    @Test
    void allocateAssignsTheOldestUnusedPinsToTheAssociateAndRecordsEvents() {
        UUID target = UUID.randomUUID();
        UUID actor = UUID.randomUUID();
        associateWith(target, AssociateStatus.ACTIVE);
        EPin a = unusedPin();
        EPin b = unusedPin();
        when(epinRepository.findAllocatable(eq(NOW), isNull(), eq(PageRequest.of(0, 2)))).thenReturn(List.of(a, b));
        ArgumentCaptor<EPinEvent> events = ArgumentCaptor.forClass(EPinEvent.class);

        AllocateEPinResponse response = epinService.allocate(new AllocateEPinRequest(target, 2, null), actor);

        assertThat(List.of(a, b)).allMatch(p -> p.getStatus() == EPinStatus.ALLOCATED
            && target.equals(p.getAllocatedTo()) && actor.equals(p.getAllocatedBy()) && NOW.equals(p.getAllocatedAt()));
        assertThat(response.count()).isEqualTo(2);
        assertThat(response.pins()).extracting(AllocateEPinResponse.Item::id).containsExactly(a.getId(), b.getId());
        verify(epinEventRepository, times(2)).save(events.capture());
        assertThat(events.getAllValues()).allMatch(e ->
            e.getEventType() == EPinEventType.ALLOCATED && target.equals(e.getToAssociateId()));
    }

    @Test
    void allocateFailsWholesaleWhenThePoolIsSmallerThanCount() {
        UUID target = UUID.randomUUID();
        associateWith(target, AssociateStatus.ACTIVE);
        when(epinRepository.findAllocatable(any(), any(), any())).thenReturn(List.of(unusedPin()));

        assertThatThrownBy(() -> epinService.allocate(new AllocateEPinRequest(target, 3, null), UUID.randomUUID()))
            .isInstanceOf(EPinInsufficientPoolException.class);

        verify(epinRepository, never()).save(any());
        verify(epinEventRepository, never()).save(any());
    }

    @Test
    void allocateRejectsAnUnknownOrNonActiveRecipientBeforeTouchingThePool() {
        UUID unknown = UUID.randomUUID();
        when(associateRepository.findById(unknown)).thenReturn(Optional.empty());
        UUID pending = UUID.randomUUID();
        associateWith(pending, AssociateStatus.PENDING);

        assertThatThrownBy(() -> epinService.allocate(new AllocateEPinRequest(unknown, 1, null), UUID.randomUUID()))
            .isInstanceOf(AssociateNotFoundException.class);
        assertThatThrownBy(() -> epinService.allocate(new AllocateEPinRequest(pending, 1, null), UUID.randomUUID()))
            .isInstanceOf(AssociateNotActiveException.class);

        verify(epinRepository, never()).findAllocatable(any(), any(), any());
    }
```

(imports: `AssociateStatus`, `AssociateNotActiveException`, `org.mockito.ArgumentMatchers.eq`, `org.mockito.ArgumentMatchers.isNull`.)

`EPinRepositoryTest`:

```java
    @Test
    void findAllocatableReturnsOnlyUnusedUnexpiredPinsOldestFirstWithinTheBatch() {
        UUID admin = persistAdmin();
        Instant now = Instant.parse("2026-10-01T00:00:00Z");
        EPin older = persistPin(admin, EPinStatus.UNUSED, null, null);
        older.setGeneratedAt(now.minusSeconds(100));
        EPin newer = persistPin(admin, EPinStatus.UNUSED, null, now.plusSeconds(60));
        newer.setGeneratedAt(now.minusSeconds(50));
        persistPin(admin, EPinStatus.UNUSED, null, now);              // expired boundary
        persistPin(admin, EPinStatus.ALLOCATED, admin, null);          // not in the pool
        persistPin(admin, EPinStatus.BLOCKED, null, null);             // not in the pool
        entityManager.flush();

        List<EPin> pool = epinRepository.findAllocatable(now, null, PageRequest.of(0, 10));

        assertThat(pool).extracting(EPin::getId).containsExactly(older.getId(), newer.getId());
    }
```

(import `java.util.List`.)

`EPinControllerTest`:

```java
    @Test
    void allocateReturns409WhenThePoolIsTooSmallAnd400ForACountOutOfRange() throws Exception {
        UUID target = UUID.randomUUID();
        Associate a = new Associate();
        a.setId(target);
        a.setStatus(AssociateStatus.ACTIVE);
        when(associateRepository.findById(target)).thenReturn(Optional.of(a));
        when(epinRepository.findAllocatable(any(), any(), any())).thenReturn(List.of());
        String admin = tokenFor(AssociateRole.ADMIN);

        mockMvc.perform(post("/api/admin/epins/allocate")
                .header("Authorization", "Bearer " + admin).contentType("application/json")
                .content("{\"associateId\":\"" + target + "\",\"count\":2}"))
            .andExpect(status().isConflict());
        mockMvc.perform(post("/api/admin/epins/allocate")
                .header("Authorization", "Bearer " + admin).contentType("application/json")
                .content("{\"associateId\":\"" + target + "\",\"count\":0}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    void allocateIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(post("/api/admin/epins/allocate")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)).contentType("application/json")
                .content("{\"associateId\":\"" + UUID.randomUUID() + "\",\"count\":1}"))
            .andExpect(status().isForbidden());
    }
```

(import `com.plotchain.associate.AssociateStatus`.)

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && mvn -q test -Dtest='EPinServiceTest,EPinRepositoryTest,EPinControllerTest'`
Expected: COMPILE FAIL.

- [ ] **Step 3: Implement**

`AllocateEPinRequest.java`:

```java
package com.plotchain.epin;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record AllocateEPinRequest(
    @NotNull UUID associateId,
    @Min(1) @Max(2000) int count,
    UUID batchId
) {}
```

`AllocateEPinResponse.java`:

```java
package com.plotchain.epin;

import java.util.List;
import java.util.UUID;

public record AllocateEPinResponse(UUID associateId, int count, List<Item> pins) {
    public record Item(UUID id, String code) {}
}
```

`EPinInsufficientPoolException.java`:

```java
package com.plotchain.epin;

public class EPinInsufficientPoolException extends RuntimeException {
    public EPinInsufficientPoolException(int requested, int available) {
        super("Only " + available + " allocatable e-PIN(s) available, requested " + requested);
    }
}
```

`associate/AssociateNotActiveException.java`:

```java
package com.plotchain.associate;

import java.util.UUID;

public class AssociateNotActiveException extends RuntimeException {
    public AssociateNotActiveException(UUID associateId) {
        super("Associate is not active: " + associateId);
    }
}
```

`EPinRepository` addition:

```java
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
        SELECT e FROM EPin e
        WHERE e.status = com.plotchain.epin.EPinStatus.UNUSED
        AND (e.expiresAt IS NULL OR e.expiresAt > :now)
        AND (:batchId IS NULL OR e.batchId = :batchId)
        ORDER BY e.generatedAt, e.id
        """)
    List<EPin> findAllocatable(@Param("now") Instant now, @Param("batchId") UUID batchId, Pageable pageable);
```

(import `java.util.List`.)

`EPinExceptionHandler` additions (both 409):

```java
    @ExceptionHandler(EPinInsufficientPoolException.class)
    public ResponseEntity<Map<String, String>> handleInsufficientPool(EPinInsufficientPoolException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(com.plotchain.associate.AssociateNotActiveException.class)
    public ResponseEntity<Map<String, String>> handleAssociateNotActive(
            com.plotchain.associate.AssociateNotActiveException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }
```

`EPinService#allocate` (imports `AssociateStatus`, `AssociateNotActiveException`, `Associate`):

```java
    @Transactional
    public AllocateEPinResponse allocate(AllocateEPinRequest request, UUID actorId) {
        Associate recipient = associateRepository.findById(request.associateId())
            .orElseThrow(() -> new AssociateNotFoundException(request.associateId()));
        if (recipient.getStatus() != AssociateStatus.ACTIVE) {
            throw new AssociateNotActiveException(recipient.getId());
        }

        Instant now = clock.instant();
        List<EPin> pool = epinRepository.findAllocatable(now, request.batchId(), PageRequest.of(0, request.count()));
        if (pool.size() < request.count()) {
            throw new EPinInsufficientPoolException(request.count(), pool.size());
        }

        List<AllocateEPinResponse.Item> items = new ArrayList<>();
        for (EPin epin : pool) {
            epin.setStatus(EPinStatus.ALLOCATED);
            epin.setAllocatedTo(recipient.getId());
            epin.setAllocatedBy(actorId);
            epin.setAllocatedAt(now);
            epinRepository.save(epin);
            recordEvent(epin.getId(), EPinEventType.ALLOCATED, actorId, null, recipient.getId(), null);
            items.add(new AllocateEPinResponse.Item(epin.getId(), epin.getCode()));
        }
        return new AllocateEPinResponse(recipient.getId(), items.size(), items);
    }
```

`EPinController`:

```java
    @PostMapping("/allocate")
    public AllocateEPinResponse allocate(@Valid @RequestBody AllocateEPinRequest request,
                                         @AuthenticationPrincipal UUID actorId) {
        return epinService.allocate(request, actorId);
    }
```

`SecurityConfig.java` (next to the other e-pin matchers): `.requestMatchers(HttpMethod.POST, "/api/admin/epins/allocate").hasAuthority("ADMIN")`.

- [ ] **Step 4: Run tests**

Run: `cd backend && mvn -q test -Dtest='EPinServiceTest,EPinRepositoryTest,EPinControllerTest,SecurityConfigTest'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src
git commit -m "feat(epin): admin allocate pins to an active associate

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: PENDING lifecycle and activation (spec unit 9)

**Files:**
- Create: `backend/src/main/java/com/plotchain/associate/AssociateNotPendingException.java`, `backend/src/main/java/com/plotchain/withdrawal/AssociatePendingActivationException.java`
- Modify: `AssociateStatusCache.java`, `AssociateProvisioningService.java`, `AssociateProfileResponse.java`, `EPinService.java`, `EPinExceptionHandler.java`, `withdrawal/WithdrawalService.java`, `withdrawal/WithdrawalExceptionHandler.java`
- Test: `AssociateStatusCacheTest.java`, `AssociateProvisioningServiceTest.java`, `EPinServiceTest.java`, `EPinControllerTest.java`, `WithdrawalServiceTest.java`, `AssociateProfileControllerTest.java` (whichever existing test class covers profile JSON)

**Interfaces:**
- Consumes: Task 1 `EPinService` ctor (grows to add `AssociateStatusCache`), `AssociateStatus.PENDING`.
- Produces: `EPinService(EPinRepository, AssociateRepository, EPinEventRepository, Clock, AssociateStatusCache)`; `AssociateNotPendingException(UUID)` (409); `AssociateProfileResponse` gains `AssociateStatus status` as its last component; `AssociateStatusCache#isActive` true for `ACTIVE` and `PENDING`.

- [ ] **Step 1: Write failing tests**

`AssociateStatusCacheTest` (follow its existing arrange pattern; the existing tests stub `associateRepository.findById`):

```java
    @Test
    void pendingAssociateIsStillTreatedAsAuthenticatedActive() {
        UUID id = UUID.randomUUID();
        Associate a = new Associate();
        a.setId(id);
        a.setStatus(AssociateStatus.PENDING);
        when(associateRepository.findById(id)).thenReturn(Optional.of(a));

        // Review focus #1: a PENDING associate must not be locked out by the JWT filter.
        assertThat(cache.isActive(id)).isTrue();
    }
```

`AssociateProvisioningServiceTest`: add (using the file's existing happy-path arrange, capture the saved `Associate`):

```java
        assertThat(savedAssociate.getStatus()).isEqualTo(AssociateStatus.PENDING);
```

in the existing "creates associate" test, plus fix any existing assertion that expected `ACTIVE`.

`EPinServiceTest` (constructor now has the cache: add `@Mock AssociateStatusCache associateStatusCache;` and `new EPinService(epinRepository, associateRepository, epinEventRepository, clock, associateStatusCache)` in `setUp`):

```java
    @Test
    void activationRedeemFlipsAPendingTargetToActiveAndEvictsItsStatusCache() {
        UUID epinId = UUID.randomUUID();
        UUID targetId = UUID.randomUUID();
        EPin pin = new EPin();
        pin.setId(epinId);
        pin.setStatus(EPinStatus.UNUSED);
        when(epinRepository.findByIdForUpdate(epinId)).thenReturn(Optional.of(pin));
        Associate target = associateWith(targetId, AssociateStatus.PENDING);

        epinService.redeem(epinId, new RedeemEPinRequest(targetId, RedemptionType.ACTIVATION, null), UUID.randomUUID());

        assertThat(target.getStatus()).isEqualTo(AssociateStatus.ACTIVE);
        verify(associateRepository).save(target);
        verify(associateStatusCache).evict(targetId);
        assertThat(pin.getStatus()).isEqualTo(EPinStatus.USED);
    }

    @Test
    void activationRedeemRejectsATargetThatIsNotPendingWithNoSideEffects() {
        UUID epinId = UUID.randomUUID();
        UUID active = UUID.randomUUID();
        UUID suspended = UUID.randomUUID();
        EPin pin = new EPin();
        pin.setId(epinId);
        pin.setStatus(EPinStatus.UNUSED);
        when(epinRepository.findByIdForUpdate(epinId)).thenReturn(Optional.of(pin));
        associateWith(active, AssociateStatus.ACTIVE);
        associateWith(suspended, AssociateStatus.SUSPENDED);

        assertThatThrownBy(() -> epinService.redeem(epinId,
                new RedeemEPinRequest(active, RedemptionType.ACTIVATION, null), UUID.randomUUID()))
            .isInstanceOf(AssociateNotPendingException.class);
        assertThatThrownBy(() -> epinService.redeem(epinId,
                new RedeemEPinRequest(suspended, RedemptionType.ACTIVATION, null), UUID.randomUUID()))
            .isInstanceOf(AssociateNotPendingException.class);

        assertThat(pin.getStatus()).isEqualTo(EPinStatus.UNUSED);
        verify(epinRepository, never()).save(any());
        verify(associateStatusCache, never()).evict(any());
    }

    @Test
    void topupRedeemHasNoTargetStatusRequirementAndDoesNotChangeTheTarget() {
        UUID epinId = UUID.randomUUID();
        UUID targetId = UUID.randomUUID();
        EPin pin = new EPin();
        pin.setId(epinId);
        pin.setStatus(EPinStatus.UNUSED);
        when(epinRepository.findByIdForUpdate(epinId)).thenReturn(Optional.of(pin));
        Associate target = associateWith(targetId, AssociateStatus.ACTIVE);

        epinService.redeem(epinId, new RedeemEPinRequest(targetId, RedemptionType.TOPUP, null), UUID.randomUUID());

        assertThat(target.getStatus()).isEqualTo(AssociateStatus.ACTIVE);
        verify(associateRepository, never()).save(any());
    }
```

Update the Task 1 happy-path test `redeemRecordsARedeemedEventFromTheCurrentHolderToTheTarget` to use `RedemptionType.TOPUP` (it already does) and any existing ACTIVATION happy-path tests in `EPinServiceTest`/`EPinControllerTest` to give the target `AssociateStatus.PENDING` (`new Associate()` defaults to `ACTIVE`, which now correctly 409s).

`EPinControllerTest`:

```java
    @Test
    void activationRedeemForAnActiveAssociateReturns409() throws Exception {
        UUID id = UUID.randomUUID();
        UUID target = UUID.randomUUID();
        EPin pin = new EPin();
        pin.setId(id);
        pin.setStatus(EPinStatus.UNUSED);
        when(epinRepository.findByIdForUpdate(id)).thenReturn(Optional.of(pin));
        Associate a = new Associate();
        a.setId(target);
        a.setStatus(AssociateStatus.ACTIVE);
        when(associateRepository.findById(target)).thenReturn(Optional.of(a));

        mockMvc.perform(post("/api/admin/epins/" + id + "/redeem")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"associateId\":\"" + target + "\",\"redemptionType\":\"ACTIVATION\"}"))
            .andExpect(status().isConflict());
    }
```

`WithdrawalServiceTest` (follow its existing suspended-associate test):

```java
    @Test
    void submitRequestRejectsAPendingAssociate() {
        // arrange exactly like the existing suspended-associate test, but with AssociateStatus.PENDING
        // ... then:
        assertThatThrownBy(() -> withdrawalService.submitRequest(request, UUID.randomUUID()))
            .isInstanceOf(AssociatePendingActivationException.class);
        // and assert the same "no side effects" verifies the suspended test makes
    }
```

(Copy the arrange/verify lines from the neighbouring `AssociateSuspendedException` test verbatim and change only the status and the expected exception.)

Profile JSON: in the existing profile controller/service test, add an assertion that the response contains `status` (`"ACTIVE"` for a default associate).

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && mvn -q test -Dtest='AssociateStatusCacheTest,AssociateProvisioningServiceTest,EPinServiceTest,EPinControllerTest,WithdrawalServiceTest'`
Expected: FAIL/compile errors.

- [ ] **Step 3: Implement**

`AssociateStatusCache.java`:

```java
    // "Active" here is the JwtAuthenticationFilter's gate: it answers "may this token keep
    // working", i.e. not suspended or deleted. PENDING associates (awaiting an ACTIVATION e-PIN)
    // can still log in and use their account; withdrawal is separately blocked for them
    // (WithdrawalService). See epin-blog-extension spec, "Associate PENDING behavior".
    public boolean isActive(UUID associateId) {
        AssociateStatus status = cache.get(associateId, this::loadStatus);
        return status == AssociateStatus.ACTIVE || status == AssociateStatus.PENDING;
    }
```

`AssociateProvisioningService`: add `associate.setStatus(AssociateStatus.PENDING);` after `associate.setRole(AssociateRole.ASSOCIATE);`.

`AssociateProfileResponse`: add `AssociateStatus status` as the last record component and `a.getStatus()` as the last argument in `from(...)`. Fix any direct constructor calls in tests.

`AssociateNotPendingException.java`:

```java
package com.plotchain.associate;

import java.util.UUID;

public class AssociateNotPendingException extends RuntimeException {
    public AssociateNotPendingException(UUID associateId) {
        super("Associate is not pending activation: " + associateId);
    }
}
```

`EPinExceptionHandler` add (409):

```java
    @ExceptionHandler(com.plotchain.associate.AssociateNotPendingException.class)
    public ResponseEntity<Map<String, String>> handleAssociateNotPending(
            com.plotchain.associate.AssociateNotPendingException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }
```

`EPinService`: add `AssociateStatusCache associateStatusCache` field and constructor parameter (last). In `redeem`, replace the bare `associateRepository.findById(...)` line with:

```java
        Associate target = associateRepository.findById(request.associateId())
            .orElseThrow(() -> new AssociateNotFoundException(request.associateId()));
        boolean activates = request.redemptionType() == RedemptionType.ACTIVATION;
        if (activates && target.getStatus() != AssociateStatus.PENDING) {
            throw new AssociateNotPendingException(target.getId());
        }
```

and after the `epinRepository.save(epin)` / `recordEvent(...)` in `redeem` add:

```java
        if (activates) {
            target.setStatus(AssociateStatus.ACTIVE);
            associateRepository.save(target);
            associateStatusCache.evict(target.getId());
        }
```

`withdrawal/AssociatePendingActivationException.java`:

```java
package com.plotchain.withdrawal;

import java.util.UUID;

public class AssociatePendingActivationException extends RuntimeException {
    public AssociatePendingActivationException(UUID associateId) {
        super("Cannot submit a withdrawal for an associate pending activation: " + associateId);
    }
}
```

`WithdrawalExceptionHandler` add (409):

```java
    @ExceptionHandler(AssociatePendingActivationException.class)
    public ResponseEntity<Map<String, String>> handleAssociatePendingActivation(AssociatePendingActivationException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }
```

`WithdrawalService.submitRequest`, right after the `SUSPENDED` guard:

```java
        if (associate.getStatus() == AssociateStatus.PENDING) {
            throw new AssociatePendingActivationException(associate.getId());
        }
```

In `AdminAssociateService.reactivate` (line ~94) add above `setStatus(ACTIVE)`:

```java
        // Known gap (epin-blog-extension spec, Review Focus 7): reactivating a suspended
        // associate who was PENDING sets ACTIVE and skips the activation e-PIN. Out of scope.
```

- [ ] **Step 4: Run tests**

Run: `cd backend && mvn -q test -Dtest='AssociateStatusCacheTest,AssociateProvisioningServiceTest,AdminAssociate*Test,EPin*Test,Withdrawal*Test,SecurityConfigTest,AssociateProfile*Test'`
Expected: PASS. Any other test that builds a new associate through `AssociateProvisioningService` and then asserts `ACTIVE` must be updated to `PENDING`; fix and re-run.

- [ ] **Step 5: Commit**

```bash
git add backend/src
git commit -m "feat(epin): PENDING associate status; ACTIVATION redeem activates the target

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Associate own-pins view (spec unit 10)

**Files:**
- Create: `backend/src/main/java/com/plotchain/epin/AssociateEPinController.java`
- Modify: `EPinRepository.java`, `EPinService.java`
- Test: `EPinServiceTest.java`, `EPinRepositoryTest.java`, `AssociateEPinControllerTest.java` (new), `SecurityConfigTest.java`

**Interfaces:**
- Consumes: Task 1 `toResponse`, `EPinPageResponse`.
- Produces: `EPinRepository#searchForAssociate(UUID me, EPinStatus status, Pageable p): Page<EPin>`; `EPinService#listForAssociate(UUID me, EPinStatus status, int page, int size): EPinPageResponse`; `GET /api/associates/me/epins?status&page&size`.

- [ ] **Step 1: Write failing tests**

`EPinRepositoryTest`:

```java
    @Test
    void searchForAssociateReturnsPinsAllocatedToRedeemedToOrRedeemedByMeAndNoOthers() {
        UUID admin = persistAdmin();
        UUID me = persistAdmin();
        UUID other = persistAdmin();
        EPin held = persistPin(admin, EPinStatus.ALLOCATED, me, null);
        EPin redeemedForMe = persistPin(admin, EPinStatus.USED, null, null);
        redeemedForMe.setRedeemedTo(me);
        EPin redeemedByMe = persistPin(admin, EPinStatus.USED, null, null);
        redeemedByMe.setRedeemedBy(me);
        persistPin(admin, EPinStatus.ALLOCATED, other, null);
        persistPin(admin, EPinStatus.UNUSED, null, null);
        entityManager.flush();

        Page<EPin> page = epinRepository.searchForAssociate(me, null, PageRequest.of(0, 20));

        assertThat(page.getContent()).extracting(EPin::getId)
            .containsExactlyInAnyOrder(held.getId(), redeemedForMe.getId(), redeemedByMe.getId());
    }

    @Test
    void searchForAssociateAppliesTheStatusFilter() {
        UUID admin = persistAdmin();
        UUID me = persistAdmin();
        EPin held = persistPin(admin, EPinStatus.ALLOCATED, me, null);
        EPin used = persistPin(admin, EPinStatus.USED, me, null);
        entityManager.flush();

        Page<EPin> page = epinRepository.searchForAssociate(me, EPinStatus.ALLOCATED, PageRequest.of(0, 20));

        assertThat(page.getContent()).extracting(EPin::getId).containsExactly(held.getId());
    }
```

`AssociateEPinControllerTest` (new, same `@SpringBootTest` + `@MockBean` shape as `EPinControllerTest`, including `@MockBean EPinEventRepository`):

```java
package com.plotchain.epin;

// imports identical to EPinControllerTest (plus ArgumentCaptor/eq as needed)

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AssociateEPinControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;
    @MockBean AssociateRepository associateRepository;
    @MockBean EPinRepository epinRepository;
    @MockBean EPinEventRepository epinEventRepository;

    private Associate associate(AssociateRole role) {
        Associate a = new Associate();
        a.setId(UUID.randomUUID());
        a.setRole(role);
        a.setStatus(AssociateStatus.ACTIVE);
        when(associateRepository.findById(a.getId())).thenReturn(Optional.of(a));
        return a;
    }

    @Test
    void myEpinsQueriesByTheJwtPrincipalNeverByAParameter() throws Exception {
        Associate me = associate(AssociateRole.ASSOCIATE);
        when(epinRepository.searchForAssociate(any(), any(), any()))
            .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 20), 0));

        mockMvc.perform(get("/api/associates/me/epins")
                .param("redeemedTo", UUID.randomUUID().toString()) // ignored: no such parameter exists
                .header("Authorization", "Bearer " + jwtService.generateToken(me)))
            .andExpect(status().isOk());

        verify(epinRepository).searchForAssociate(eq(me.getId()), isNull(), any());
    }

    @Test
    void myEpinsClampsSizeTo100AndAcceptsAStatusFilter() throws Exception {
        Associate me = associate(AssociateRole.ASSOCIATE);
        when(epinRepository.searchForAssociate(any(), any(), any()))
            .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 100), 0));

        mockMvc.perform(get("/api/associates/me/epins").param("size", "9999").param("status", "ALLOCATED")
                .header("Authorization", "Bearer " + jwtService.generateToken(me)))
            .andExpect(status().isOk());

        verify(epinRepository).searchForAssociate(eq(me.getId()), eq(EPinStatus.ALLOCATED), eq(PageRequest.of(0, 100)));
    }

    @Test
    void myEpinsRequiresAuthentication() throws Exception {
        mockMvc.perform(get("/api/associates/me/epins")).andExpect(status().isUnauthorized());
    }
}
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && mvn -q test -Dtest='EPinRepositoryTest,AssociateEPinControllerTest'`
Expected: COMPILE FAIL.

- [ ] **Step 3: Implement**

`EPinRepository`:

```java
    @Query("""
        SELECT e FROM EPin e
        WHERE (e.allocatedTo = :me OR e.redeemedTo = :me OR e.redeemedBy = :me)
        AND (:status IS NULL OR e.status = :status)
        ORDER BY e.generatedAt DESC, e.id
        """)
    Page<EPin> searchForAssociate(@Param("me") UUID me, @Param("status") EPinStatus status, Pageable pageable);
```

`EPinService`:

```java
    public EPinPageResponse listForAssociate(UUID me, EPinStatus status, int page, int size) {
        Page<EPin> result = epinRepository.searchForAssociate(me, status, PageRequest.of(page, size));
        List<EPinResponse> epins = result.getContent().stream().map(this::toResponse).toList();
        return new EPinPageResponse(epins, page, size, result.getTotalElements());
    }
```

`AssociateEPinController.java` (modeled on `AssociateTreeController`: one small controller per `/api/associates/me/*` route; Tasks 7 and 8 add their `POST` methods to it):

```java
package com.plotchain.epin;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/associates/me/epins")
public class AssociateEPinController {

    private final EPinService epinService;

    public AssociateEPinController(EPinService epinService) {
        this.epinService = epinService;
    }

    // Self-scoped by construction: the associate id comes only from the JWT principal. There is
    // deliberately no redeemedTo/allocatedTo parameter, so no way to ask for someone else's pins.
    @GetMapping
    public EPinPageResponse myEpins(
            @AuthenticationPrincipal UUID associateId,
            @RequestParam(required = false) EPinStatus status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        page = Math.max(page, 0);
        size = Math.min(size, 100);
        return epinService.listForAssociate(associateId, status, page, size);
    }
}
```

No `SecurityConfig` change: `GET /api/associates/me/epins` falls through to `anyRequest().authenticated()`, same as `/me/tree`.

- [ ] **Step 4: Run tests**

Run: `cd backend && mvn -q test -Dtest='EPinRepositoryTest,AssociateEPinControllerTest,EPinServiceTest,SecurityConfigTest'`
Expected: PASS. Add a one-line `SecurityConfigTest` case that an `ASSOCIATE` token gets 200 on `GET /api/associates/me/epins`, modeled on the existing `me/withdrawals` case at ~line 802, and re-run.

- [ ] **Step 5: Commit**

```bash
git add backend/src
git commit -m "feat(epin): associate own-pins view GET /api/associates/me/epins

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Associate self-redeem: activate a downline member (spec unit 11)

**Files:**
- Create: `backend/src/main/java/com/plotchain/epin/{AssociateRedeemEPinRequest,EPinNotOwnedException}.java`
- Modify: `EPinService.java`, `AssociateEPinController.java`, `EPinExceptionHandler.java`, `auth/SecurityConfig.java`
- Test: `EPinServiceTest.java`, `AssociateEPinControllerTest.java`, `SecurityConfigTest.java`

**Interfaces:**
- Consumes: Task 1 `findByIdForUpdate`, `recordEvent`; Task 5 `AssociateNotPendingException`, `AssociateStatusCache`, `AssociateRepository#findByUserId`, `AssociateRepository#findSelfAndDownline(UUID): List<UUID>`.
- Produces: `EPinService#redeemOwn(UUID epinId, String userId, UUID callerId): EPinResponse`; private `loadHeldPin(UUID epinId, UUID callerId): EPin` (reused by Task 8); `EPinNotOwnedException(UUID)` mapped 404; `POST /api/associates/me/epins/{id}/redeem` body `{userId}`.

- [ ] **Step 1: Write failing service tests**

```java
    private EPin heldPin(UUID holder, EPinStatus status) {
        EPin pin = new EPin();
        pin.setId(UUID.randomUUID());
        pin.setStatus(status);
        pin.setAllocatedTo(holder);
        when(epinRepository.findByIdForUpdate(pin.getId())).thenReturn(Optional.of(pin));
        return pin;
    }

    private Associate pendingDownline(String userId, UUID caller, boolean inDownline) {
        Associate target = new Associate();
        target.setId(UUID.randomUUID());
        target.setUserId(userId);
        target.setStatus(AssociateStatus.PENDING);
        when(associateRepository.findByUserId(userId)).thenReturn(Optional.of(target));
        when(associateRepository.findSelfAndDownline(caller))
            .thenReturn(inDownline ? List.of(caller, target.getId()) : List.of(caller));
        return target;
    }

    @Test
    void redeemOwnActivatesAPendingDownlineMemberAndUsesTheHoldersPin() {
        UUID caller = UUID.randomUUID();
        EPin pin = heldPin(caller, EPinStatus.ALLOCATED);
        Associate target = pendingDownline("VP00042", caller, true);
        ArgumentCaptor<EPinEvent> events = ArgumentCaptor.forClass(EPinEvent.class);

        epinService.redeemOwn(pin.getId(), "VP00042", caller);

        assertThat(pin.getStatus()).isEqualTo(EPinStatus.USED);
        assertThat(pin.getRedeemedTo()).isEqualTo(target.getId());
        assertThat(pin.getRedeemedBy()).isEqualTo(caller);
        assertThat(pin.getRedemptionType()).isEqualTo(RedemptionType.ACTIVATION);
        assertThat(target.getStatus()).isEqualTo(AssociateStatus.ACTIVE);
        verify(associateStatusCache).evict(target.getId());
        verify(epinEventRepository).save(events.capture());
        assertThat(events.getValue().getEventType()).isEqualTo(EPinEventType.REDEEMED);
        assertThat(events.getValue().getFromAssociateId()).isEqualTo(caller);
    }

    @Test
    void redeemOwnReturnsNotOwnedForAPinHeldBySomeoneElseOrMissingWithoutLeaking() {
        UUID caller = UUID.randomUUID();
        EPin theirs = heldPin(UUID.randomUUID(), EPinStatus.ALLOCATED);
        EPin unallocated = heldPin(null, EPinStatus.UNUSED);
        UUID missing = UUID.randomUUID();
        when(epinRepository.findByIdForUpdate(missing)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> epinService.redeemOwn(theirs.getId(), "VP1", caller)).isInstanceOf(EPinNotOwnedException.class);
        assertThatThrownBy(() -> epinService.redeemOwn(unallocated.getId(), "VP1", caller)).isInstanceOf(EPinNotOwnedException.class);
        assertThatThrownBy(() -> epinService.redeemOwn(missing, "VP1", caller)).isInstanceOf(EPinNotOwnedException.class);

        verify(epinRepository, never()).save(any());
    }

    @Test
    void redeemOwnRejectsUsedBlockedAndExpiredHeldPins() {
        UUID caller = UUID.randomUUID();
        EPin used = heldPin(caller, EPinStatus.USED);
        EPin blocked = heldPin(caller, EPinStatus.BLOCKED);
        EPin expired = heldPin(caller, EPinStatus.ALLOCATED);
        expired.setExpiresAt(NOW);

        assertThatThrownBy(() -> epinService.redeemOwn(used.getId(), "VP1", caller)).isInstanceOf(EPinAlreadyRedeemedException.class);
        assertThatThrownBy(() -> epinService.redeemOwn(blocked.getId(), "VP1", caller)).isInstanceOf(EPinBlockedException.class);
        assertThatThrownBy(() -> epinService.redeemOwn(expired.getId(), "VP1", caller)).isInstanceOf(EPinExpiredException.class);

        verify(epinRepository, never()).save(any());
    }

    @Test
    void redeemOwnTargetOutsideTheCallersDownlineIsNotFoundAndLeavesThePinAllocated() {
        UUID caller = UUID.randomUUID();
        EPin pin = heldPin(caller, EPinStatus.ALLOCATED);
        pendingDownline("VP00099", caller, false);

        assertThatThrownBy(() -> epinService.redeemOwn(pin.getId(), "VP00099", caller))
            .isInstanceOf(AssociateNotFoundException.class);

        assertThat(pin.getStatus()).isEqualTo(EPinStatus.ALLOCATED);
        verify(epinRepository, never()).save(any());
    }

    @Test
    void redeemOwnRejectsAnUnknownUserIdAndANonPendingDownlineMember() {
        UUID caller = UUID.randomUUID();
        EPin pin = heldPin(caller, EPinStatus.ALLOCATED);
        when(associateRepository.findByUserId("NOPE")).thenReturn(Optional.empty());
        Associate active = pendingDownline("VP00007", caller, true);
        active.setStatus(AssociateStatus.ACTIVE);

        assertThatThrownBy(() -> epinService.redeemOwn(pin.getId(), "NOPE", caller)).isInstanceOf(AssociateNotFoundException.class);
        assertThatThrownBy(() -> epinService.redeemOwn(pin.getId(), "VP00007", caller)).isInstanceOf(AssociateNotPendingException.class);

        assertThat(pin.getStatus()).isEqualTo(EPinStatus.ALLOCATED);
    }

    @Test
    void redeemOwnForSelfIsNotFoundBecauseSelfIsExcludedFromTheDownline() {
        UUID caller = UUID.randomUUID();
        EPin pin = heldPin(caller, EPinStatus.ALLOCATED);
        Associate me = new Associate();
        me.setId(caller);
        me.setUserId("VP00001");
        me.setStatus(AssociateStatus.PENDING);
        when(associateRepository.findByUserId("VP00001")).thenReturn(Optional.of(me));
        when(associateRepository.findSelfAndDownline(caller)).thenReturn(List.of(caller));

        assertThatThrownBy(() -> epinService.redeemOwn(pin.getId(), "VP00001", caller))
            .isInstanceOf(AssociateNotFoundException.class);
    }

    @Test
    void secondRedeemOnTheSamePinAfterTheFirstIsRejected() {
        // Review focus #2 (the lock itself is findByIdForUpdate, asserted by every stub above):
        // the second caller sees the already-mutated pin and is rejected, with one event only.
        UUID caller = UUID.randomUUID();
        EPin pin = heldPin(caller, EPinStatus.ALLOCATED);
        pendingDownline("VP00042", caller, true);

        epinService.redeemOwn(pin.getId(), "VP00042", caller);
        assertThatThrownBy(() -> epinService.redeemOwn(pin.getId(), "VP00042", caller))
            .isInstanceOf(EPinAlreadyRedeemedException.class);

        verify(epinEventRepository, times(1)).save(any());
    }
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && mvn -q test -Dtest=EPinServiceTest`
Expected: COMPILE FAIL (`redeemOwn`, `EPinNotOwnedException`).

- [ ] **Step 3: Implement**

`EPinNotOwnedException.java`:

```java
package com.plotchain.epin;

import java.util.UUID;

// Thrown for "missing" and "not held by the caller" alike, so an associate cannot probe which
// pin ids exist. Mapped to 404, not 403.
public class EPinNotOwnedException extends RuntimeException {
    public EPinNotOwnedException(UUID epinId) {
        super("E-PIN not found: " + epinId);
    }
}
```

Handler (404):

```java
    @ExceptionHandler(EPinNotOwnedException.class)
    public ResponseEntity<Map<String, String>> handleEPinNotOwned(EPinNotOwnedException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", ex.getMessage()));
    }
```

`AssociateRedeemEPinRequest.java`:

```java
package com.plotchain.epin;

import jakarta.validation.constraints.NotBlank;

public record AssociateRedeemEPinRequest(@NotBlank String userId) {}
```

`EPinService` additions:

```java
    // Shared by redeemOwn and transfer: lock the pin, then require it be held by the caller.
    // Missing and not-held both surface as EPinNotOwnedException (404) so ids don't leak.
    private EPin loadHeldPin(UUID epinId, UUID callerId) {
        EPin epin = epinRepository.findByIdForUpdate(epinId)
            .orElseThrow(() -> new EPinNotOwnedException(epinId));
        if (!callerId.equals(epin.getAllocatedTo())) {
            throw new EPinNotOwnedException(epinId);
        }
        if (epin.getStatus() == EPinStatus.USED) {
            throw new EPinAlreadyRedeemedException(epinId);
        }
        if (epin.getStatus() == EPinStatus.BLOCKED) {
            throw new EPinBlockedException(epinId);
        }
        if (epin.isExpiredAt(clock.instant())) {
            throw new EPinExpiredException(epinId);
        }
        return epin;
    }

    @Transactional
    public EPinResponse redeemOwn(UUID epinId, String userId, UUID callerId) {
        EPin epin = loadHeldPin(epinId, callerId);

        Associate target = associateRepository.findByUserId(userId)
            .orElseThrow(() -> new AssociateNotFoundException(userId));
        // findSelfAndDownline includes the caller, so exclude self explicitly. A target outside
        // the caller's downline is reported as not-found, same as an unknown userId (no leak).
        if (target.getId().equals(callerId) || !associateRepository.findSelfAndDownline(callerId).contains(target.getId())) {
            throw new AssociateNotFoundException(userId);
        }
        if (target.getStatus() != AssociateStatus.PENDING) {
            throw new AssociateNotPendingException(target.getId());
        }

        epin.setStatus(EPinStatus.USED);
        epin.setRedeemedTo(target.getId());
        epin.setRedeemedBy(callerId);
        epin.setRedeemedAt(clock.instant());
        epin.setRedemptionType(RedemptionType.ACTIVATION);
        epinRepository.save(epin);
        recordEvent(epinId, EPinEventType.REDEEMED, callerId, callerId, target.getId(), null);

        target.setStatus(AssociateStatus.ACTIVE);
        associateRepository.save(target);
        associateStatusCache.evict(target.getId());
        return toResponse(epin);
    }
```

`AssociateEPinController` addition (imports `jakarta.validation.Valid`, `PostMapping`, `PathVariable`, `RequestBody`):

```java
    @PostMapping("/{id}/redeem")
    public EPinResponse redeem(@PathVariable UUID id, @Valid @RequestBody AssociateRedeemEPinRequest request,
                               @AuthenticationPrincipal UUID associateId) {
        return epinService.redeemOwn(id, request.userId(), associateId);
    }
```

`SecurityConfig.java`: add ABOVE the blanket `POST /api/**` rule, next to the other `me/*` write matchers (e.g. after the `transaction-password` matcher):

```java
                // Associate self-redeem of an allocated e-PIN (epin-blog-extension unit 11): must
                // precede the blanket ADMIN write rules below (first-match-wins). Ownership and
                // downline checks are in EPinService, not here.
                .requestMatchers(HttpMethod.POST, "/api/associates/me/epins/*/redeem").authenticated()
```

- [ ] **Step 4: Write controller and security tests**

`AssociateEPinControllerTest`:

```java
    @Test
    void redeemReturns200ForTheHolderActivatingAPendingDownlineMember() throws Exception {
        Associate me = associate(AssociateRole.ASSOCIATE);
        EPin pin = new EPin();
        pin.setId(UUID.randomUUID());
        pin.setStatus(EPinStatus.ALLOCATED);
        pin.setAllocatedTo(me.getId());
        when(epinRepository.findByIdForUpdate(pin.getId())).thenReturn(Optional.of(pin));
        Associate target = new Associate();
        target.setId(UUID.randomUUID());
        target.setUserId("VP00042");
        target.setStatus(AssociateStatus.PENDING);
        when(associateRepository.findByUserId("VP00042")).thenReturn(Optional.of(target));
        when(associateRepository.findSelfAndDownline(me.getId())).thenReturn(List.of(me.getId(), target.getId()));

        mockMvc.perform(post("/api/associates/me/epins/" + pin.getId() + "/redeem")
                .header("Authorization", "Bearer " + jwtService.generateToken(me))
                .contentType("application/json").content("{\"userId\":\"VP00042\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("USED"))
            .andExpect(jsonPath("$.redemptionType").value("ACTIVATION"));
    }

    @Test
    void redeemOfSomeoneElsesPinIs404AndABlankUserIdIs400() throws Exception {
        Associate me = associate(AssociateRole.ASSOCIATE);
        EPin theirs = new EPin();
        theirs.setId(UUID.randomUUID());
        theirs.setStatus(EPinStatus.ALLOCATED);
        theirs.setAllocatedTo(UUID.randomUUID());
        when(epinRepository.findByIdForUpdate(theirs.getId())).thenReturn(Optional.of(theirs));
        String token = jwtService.generateToken(me);

        mockMvc.perform(post("/api/associates/me/epins/" + theirs.getId() + "/redeem")
                .header("Authorization", "Bearer " + token)
                .contentType("application/json").content("{\"userId\":\"VP00042\"}"))
            .andExpect(status().isNotFound());
        mockMvc.perform(post("/api/associates/me/epins/" + theirs.getId() + "/redeem")
                .header("Authorization", "Bearer " + token)
                .contentType("application/json").content("{\"userId\":\" \"}"))
            .andExpect(status().isBadRequest());
    }
```

`SecurityConfigTest`: an `ASSOCIATE` token on `POST /api/associates/me/epins/{id}/redeem` must not be 403 (assert `status().is(not(403))` via the pattern the file already uses for the `me/photo` write matcher; with mocked services the expected status there is whichever the existing me-write tests use for "reachable", typically 404/400).

- [ ] **Step 5: Run tests**

Run: `cd backend && mvn -q test -Dtest='EPinServiceTest,AssociateEPinControllerTest,SecurityConfigTest'`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src
git commit -m "feat(epin): associate self-redeem activates a pending downline member

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Associate transfer (spec unit 12)

**Files:**
- Create: `backend/src/main/java/com/plotchain/epin/TransferEPinRequest.java`
- Modify: `EPinService.java`, `AssociateEPinController.java`, `auth/SecurityConfig.java`
- Test: `EPinServiceTest.java`, `AssociateEPinControllerTest.java`

**Interfaces:**
- Consumes: Task 7 `loadHeldPin`; Task 4 `AssociateNotActiveException`.
- Produces: `EPinService#transfer(UUID epinId, String toUserId, UUID callerId): EPinResponse`; `POST /api/associates/me/epins/{id}/transfer` body `{toUserId}`.

- [ ] **Step 1: Write failing service tests**

```java
    private Associate recipient(String userId, AssociateStatus status) {
        Associate r = new Associate();
        r.setId(UUID.randomUUID());
        r.setUserId(userId);
        r.setStatus(status);
        when(associateRepository.findByUserId(userId)).thenReturn(Optional.of(r));
        return r;
    }

    @Test
    void transferMovesAHeldPinToAnActiveRecipientAndRecordsATransferredEvent() {
        UUID caller = UUID.randomUUID();
        EPin pin = heldPin(caller, EPinStatus.ALLOCATED);
        Associate to = recipient("VP00050", AssociateStatus.ACTIVE);
        ArgumentCaptor<EPinEvent> events = ArgumentCaptor.forClass(EPinEvent.class);

        epinService.transfer(pin.getId(), "VP00050", caller);

        assertThat(pin.getAllocatedTo()).isEqualTo(to.getId());
        assertThat(pin.getStatus()).isEqualTo(EPinStatus.ALLOCATED);
        verify(epinEventRepository).save(events.capture());
        assertThat(events.getValue().getEventType()).isEqualTo(EPinEventType.TRANSFERRED);
        assertThat(events.getValue().getFromAssociateId()).isEqualTo(caller);
        assertThat(events.getValue().getToAssociateId()).isEqualTo(to.getId());
        assertThat(events.getValue().getActorId()).isEqualTo(caller);
    }

    @Test
    void transferToSelfOrAPendingOrSuspendedRecipientIsRejectedWithNoSideEffects() {
        UUID caller = UUID.randomUUID();
        EPin pin = heldPin(caller, EPinStatus.ALLOCATED);
        Associate me = recipient("VP00001", AssociateStatus.ACTIVE);
        me.setId(caller);
        recipient("VP00002", AssociateStatus.PENDING);
        recipient("VP00003", AssociateStatus.SUSPENDED);

        assertThatThrownBy(() -> epinService.transfer(pin.getId(), "VP00001", caller))
            .isInstanceOf(EPinInvalidStateException.class);
        assertThatThrownBy(() -> epinService.transfer(pin.getId(), "VP00002", caller))
            .isInstanceOf(AssociateNotActiveException.class);
        assertThatThrownBy(() -> epinService.transfer(pin.getId(), "VP00003", caller))
            .isInstanceOf(AssociateNotActiveException.class);

        assertThat(pin.getAllocatedTo()).isEqualTo(caller);
        verify(epinRepository, never()).save(any());
        verify(epinEventRepository, never()).save(any());
    }

    @Test
    void transferRejectsAnUnknownRecipientAndAPinTheCallerDoesNotHoldOrThatIsBlockedOrExpired() {
        UUID caller = UUID.randomUUID();
        EPin ok = heldPin(caller, EPinStatus.ALLOCATED);
        when(associateRepository.findByUserId("NOPE")).thenReturn(Optional.empty());
        EPin theirs = heldPin(UUID.randomUUID(), EPinStatus.ALLOCATED);
        EPin blocked = heldPin(caller, EPinStatus.BLOCKED);
        EPin expired = heldPin(caller, EPinStatus.ALLOCATED);
        expired.setExpiresAt(NOW);
        recipient("VP00050", AssociateStatus.ACTIVE);

        assertThatThrownBy(() -> epinService.transfer(ok.getId(), "NOPE", caller)).isInstanceOf(AssociateNotFoundException.class);
        assertThatThrownBy(() -> epinService.transfer(theirs.getId(), "VP00050", caller)).isInstanceOf(EPinNotOwnedException.class);
        assertThatThrownBy(() -> epinService.transfer(blocked.getId(), "VP00050", caller)).isInstanceOf(EPinBlockedException.class);
        assertThatThrownBy(() -> epinService.transfer(expired.getId(), "VP00050", caller)).isInstanceOf(EPinExpiredException.class);

        verify(epinRepository, never()).save(any());
    }

    @Test
    void afterATransferTheOldHolderCanNoLongerTransferOrRedeemThePin() {
        UUID caller = UUID.randomUUID();
        EPin pin = heldPin(caller, EPinStatus.ALLOCATED);
        recipient("VP00050", AssociateStatus.ACTIVE);

        epinService.transfer(pin.getId(), "VP00050", caller);

        assertThatThrownBy(() -> epinService.transfer(pin.getId(), "VP00050", caller))
            .isInstanceOf(EPinNotOwnedException.class);
        verify(epinEventRepository, times(1)).save(any());
    }
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && mvn -q test -Dtest=EPinServiceTest`
Expected: COMPILE FAIL (`transfer`).

- [ ] **Step 3: Implement**

`TransferEPinRequest.java`:

```java
package com.plotchain.epin;

import jakarta.validation.constraints.NotBlank;

public record TransferEPinRequest(@NotBlank String toUserId) {}
```

`EPinService#transfer`:

```java
    @Transactional
    public EPinResponse transfer(UUID epinId, String toUserId, UUID callerId) {
        EPin epin = loadHeldPin(epinId, callerId);

        Associate to = associateRepository.findByUserId(toUserId)
            .orElseThrow(() -> new AssociateNotFoundException(toUserId));
        if (to.getId().equals(callerId)) {
            throw new EPinInvalidStateException("Cannot transfer an e-PIN to yourself: " + epinId);
        }
        if (to.getStatus() != AssociateStatus.ACTIVE) {
            throw new AssociateNotActiveException(to.getId());
        }

        epin.setAllocatedTo(to.getId());
        epinRepository.save(epin);
        recordEvent(epinId, EPinEventType.TRANSFERRED, callerId, callerId, to.getId(), null);
        return toResponse(epin);
    }
```

`AssociateEPinController` addition:

```java
    @PostMapping("/{id}/transfer")
    public EPinResponse transfer(@PathVariable UUID id, @Valid @RequestBody TransferEPinRequest request,
                                 @AuthenticationPrincipal UUID associateId) {
        return epinService.transfer(id, request.toUserId(), associateId);
    }
```

`SecurityConfig.java`, directly under the Task 7 matcher: `.requestMatchers(HttpMethod.POST, "/api/associates/me/epins/*/transfer").authenticated()`.

- [ ] **Step 4: Controller test**

`AssociateEPinControllerTest`:

```java
    @Test
    void transferReturns200ForTheHolderAndAnAssociateTokenIsNotForbidden() throws Exception {
        Associate me = associate(AssociateRole.ASSOCIATE);
        EPin pin = new EPin();
        pin.setId(UUID.randomUUID());
        pin.setStatus(EPinStatus.ALLOCATED);
        pin.setAllocatedTo(me.getId());
        when(epinRepository.findByIdForUpdate(pin.getId())).thenReturn(Optional.of(pin));
        Associate to = new Associate();
        to.setId(UUID.randomUUID());
        to.setUserId("VP00050");
        to.setStatus(AssociateStatus.ACTIVE);
        when(associateRepository.findByUserId("VP00050")).thenReturn(Optional.of(to));

        mockMvc.perform(post("/api/associates/me/epins/" + pin.getId() + "/transfer")
                .header("Authorization", "Bearer " + jwtService.generateToken(me))
                .contentType("application/json").content("{\"toUserId\":\"VP00050\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.allocatedTo").value(to.getId().toString()));
    }

    @Test
    void transferToSelfIs409() throws Exception {
        Associate me = associate(AssociateRole.ASSOCIATE);
        me.setUserId("VP00001");
        EPin pin = new EPin();
        pin.setId(UUID.randomUUID());
        pin.setStatus(EPinStatus.ALLOCATED);
        pin.setAllocatedTo(me.getId());
        when(epinRepository.findByIdForUpdate(pin.getId())).thenReturn(Optional.of(pin));
        when(associateRepository.findByUserId("VP00001")).thenReturn(Optional.of(me));

        mockMvc.perform(post("/api/associates/me/epins/" + pin.getId() + "/transfer")
                .header("Authorization", "Bearer " + jwtService.generateToken(me))
                .contentType("application/json").content("{\"toUserId\":\"VP00001\"}"))
            .andExpect(status().isConflict());
    }
```

- [ ] **Step 5: Run tests**

Run: `cd backend && mvn -q test -Dtest='EPin*Test,AssociateEPinControllerTest,SecurityConfigTest'`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src
git commit -m "feat(epin): associate transfer of an allocated pin to an active associate

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Admin "e-Pin Register" screen (spec unit 13)

**Files:**
- Create: `frontend/src/app/admin/epin-register/{epin.model.ts, epin-register.service.ts, epin-register.service.spec.ts, epin-register.component.ts, epin-register.component.spec.ts}`
- Modify: `frontend/src/app/app.routes.ts` (settings children, near `ledger-register` at ~line 95), `frontend/src/app/admin-nav-categories.model.ts` (~line 51), `frontend/src/assets/i18n/en.json`, `frontend/src/styles/_admin.scss`, `frontend/src/app/admin/models/admin-associate-detail.model.ts` and `admin-associate-summary.model.ts` (status union gains `'PENDING'`)
- Test: the spec files above; `frontend/src/app/app.routes.spec.ts`, `admin-nav-categories.model.spec.ts` if they enumerate routes/categories

**Interfaces:**
- Consumes: backend Tasks 1-5 endpoints; `AdminService.listAssociates(): Observable<AssociateSummary[]>` (`GET /api/associates`).
- Produces: `EPinRegisterService` with `list(filters, page, size)`, `generate(count, expiresAt?)`, `allocate(associateId, count, batchId?)`, `block(id, reason)`, `unblock(id)`, `redeem(id, associateId, type)`, `events(id)`; route `/settings/e-pin-register`.

- [ ] **Step 1: Models**

`epin.model.ts`:

```ts
export type EPinStatus = 'UNUSED' | 'ALLOCATED' | 'USED' | 'BLOCKED';
export type RedemptionType = 'ACTIVATION' | 'TOPUP';

export interface EPin {
  id: string;
  code: string;
  batchId: string;
  status: EPinStatus;
  generatedBy: string;
  generatedAt: string;
  expiresAt: string | null;
  allocatedTo: string | null;
  allocatedBy: string | null;
  allocatedAt: string | null;
  redeemedTo: string | null;
  redeemedBy: string | null;
  redeemedAt: string | null;
  redemptionType: RedemptionType | null;
  linkedEntityId: string | null;
  blockedBy: string | null;
  blockedAt: string | null;
  blockReason: string | null;
  expired: boolean;
}

export interface EPinPage {
  epins: EPin[];
  page: number;
  size: number;
  totalElements: number;
}

export interface EPinFilters {
  status?: EPinStatus | '';
  batchId?: string;
  allocatedTo?: string;
  expired?: boolean;
}

export interface EPinBatchResult {
  batchId: string;
  count: number;
  codes: string[];
  generatedAt: string;
  expiresAt: string | null;
}

export interface AllocateResult {
  associateId: string;
  count: number;
  pins: { id: string; code: string }[];
}

export interface EPinEvent {
  eventType: 'GENERATED' | 'ALLOCATED' | 'TRANSFERRED' | 'REDEEMED' | 'BLOCKED' | 'UNBLOCKED';
  actorId: string;
  fromAssociateId: string | null;
  toAssociateId: string | null;
  at: string;
  note: string | null;
}
```

- [ ] **Step 2: Failing service spec**

`epin-register.service.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { EPinRegisterService } from './epin-register.service';

describe('EPinRegisterService', () => {
  let service: EPinRegisterService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(EPinRegisterService);
    httpMock = TestBed.inject(HttpTestingController);
  });
  afterEach(() => httpMock.verify());

  it('lists with set filters and paging as query params, omitting empty ones', () => {
    service.list({ status: 'ALLOCATED', batchId: '', expired: true }, 1, 20).subscribe();
    const req = httpMock.expectOne(r => r.url === '/api/admin/epins');
    expect(req.request.params.get('status')).toBe('ALLOCATED');
    expect(req.request.params.get('expired')).toBe('true');
    expect(req.request.params.has('batchId')).toBeFalse();
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('size')).toBe('20');
    req.flush({ epins: [], page: 1, size: 20, totalElements: 0 });
  });

  it('omits expired when false', () => {
    service.list({ expired: false }, 0, 20).subscribe();
    const req = httpMock.expectOne(r => r.url === '/api/admin/epins');
    expect(req.request.params.has('expired')).toBeFalse();
    req.flush({ epins: [], page: 0, size: 20, totalElements: 0 });
  });

  it('generates a batch with optional expiry', () => {
    service.generate(5, '2027-01-01T00:00:00Z').subscribe();
    const req = httpMock.expectOne('/api/admin/epins');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ count: 5, expiresAt: '2027-01-01T00:00:00Z' });
    req.flush({});
  });

  it('allocates, blocks, unblocks, redeems and fetches events on the right endpoints', () => {
    service.allocate('a1', 3, 'b1').subscribe();
    let req = httpMock.expectOne('/api/admin/epins/allocate');
    expect(req.request.body).toEqual({ associateId: 'a1', count: 3, batchId: 'b1' });
    req.flush({});

    service.block('p1', 'lost').subscribe();
    req = httpMock.expectOne('/api/admin/epins/p1/block');
    expect(req.request.body).toEqual({ reason: 'lost' });
    req.flush({});

    service.unblock('p1').subscribe();
    req = httpMock.expectOne('/api/admin/epins/p1/unblock');
    expect(req.request.method).toBe('POST');
    req.flush({});

    service.redeem('p1', 'a1', 'ACTIVATION').subscribe();
    req = httpMock.expectOne('/api/admin/epins/p1/redeem');
    expect(req.request.body).toEqual({ associateId: 'a1', redemptionType: 'ACTIVATION' });
    req.flush({});

    service.events('p1').subscribe();
    req = httpMock.expectOne('/api/admin/epins/p1/events');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `cd frontend && npx ng test --watch=false --include='src/app/admin/epin-register/**/*.spec.ts'`
Expected: FAIL (service missing).

- [ ] **Step 4: Implement the service**

`epin-register.service.ts`:

```ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  AllocateResult, EPin, EPinBatchResult, EPinEvent, EPinFilters, EPinPage, RedemptionType
} from './epin.model';

@Injectable({ providedIn: 'root' })
export class EPinRegisterService {
  private http = inject(HttpClient);

  list(filters: EPinFilters, page: number, size: number): Observable<EPinPage> {
    let params = new HttpParams().set('page', page).set('size', size);
    for (const [key, value] of Object.entries(filters)) {
      if (value) {
        params = params.set(key, String(value));
      }
    }
    return this.http.get<EPinPage>('/api/admin/epins', { params });
  }

  generate(count: number, expiresAt?: string): Observable<EPinBatchResult> {
    return this.http.post<EPinBatchResult>('/api/admin/epins', expiresAt ? { count, expiresAt } : { count });
  }

  allocate(associateId: string, count: number, batchId?: string): Observable<AllocateResult> {
    return this.http.post<AllocateResult>('/api/admin/epins/allocate',
      batchId ? { associateId, count, batchId } : { associateId, count });
  }

  block(id: string, reason: string): Observable<EPin> {
    return this.http.post<EPin>(`/api/admin/epins/${id}/block`, { reason });
  }

  unblock(id: string): Observable<EPin> {
    return this.http.post<EPin>(`/api/admin/epins/${id}/unblock`, {});
  }

  redeem(id: string, associateId: string, redemptionType: RedemptionType): Observable<EPin> {
    return this.http.post<EPin>(`/api/admin/epins/${id}/redeem`, { associateId, redemptionType });
  }

  events(id: string): Observable<EPinEvent[]> {
    return this.http.get<EPinEvent[]>(`/api/admin/epins/${id}/events`);
  }
}
```

- [ ] **Step 5: Run service spec**

Run: `cd frontend && npx ng test --watch=false --include='src/app/admin/epin-register/epin-register.service.spec.ts'`
Expected: PASS.

- [ ] **Step 6: Failing component spec**

`epin-register.component.spec.ts`:

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { EPinRegisterComponent } from './epin-register.component';

describe('EPinRegisterComponent', () => {
  let fixture: ComponentFixture<EPinRegisterComponent>;
  let httpMock: HttpTestingController;

  const pin = (over: Record<string, unknown> = {}) => ({
    id: 'p1', code: 'CODE-1', batchId: 'batch-0001-xxxx', status: 'ALLOCATED', generatedBy: 'g', generatedAt: '2026-10-01T00:00:00Z',
    expiresAt: null, allocatedTo: 'a1', allocatedBy: 'g', allocatedAt: '2026-10-01T00:00:00Z', redeemedTo: null, redeemedBy: null,
    redeemedAt: null, redemptionType: null, linkedEntityId: null, blockedBy: null, blockedAt: null, blockReason: null, expired: false,
    ...over
  });
  const associates = [{ id: 'a1', userId: 'VP00001', name: 'Jane', role: 'ASSOCIATE', hasFreeSlot: true }];

  function flushInitial(epins: unknown[]) {
    httpMock.expectOne(r => r.url === '/api/associates').flush(associates);
    httpMock.expectOne(r => r.url === '/api/admin/epins').flush({ epins, page: 0, size: 20, totalElements: epins.length });
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EPinRegisterComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(EPinRegisterComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });
  afterEach(() => httpMock.verify());

  it('renders a row per pin with the holder shown by userId', () => {
    flushInitial([pin()]);
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('CODE-1');
    expect(text).toContain('VP00001');
  });

  it('shows an Expired chip for an expired pin and disables nothing else', () => {
    flushInitial([pin({ expired: true })]);
    expect(fixture.nativeElement.querySelector('.epin-register__chip--expired')).not.toBeNull();
  });

  it('reloads page 0 with the status filter when it changes', () => {
    flushInitial([]);
    fixture.componentInstance.onStatusChange('BLOCKED');
    const req = httpMock.expectOne(r => r.url === '/api/admin/epins');
    expect(req.request.params.get('status')).toBe('BLOCKED');
    expect(req.request.params.get('page')).toBe('0');
    req.flush({ epins: [], page: 0, size: 20, totalElements: 0 });
  });

  it('blocks a pin with the entered reason then reloads', () => {
    flushInitial([pin({ status: 'UNUSED', allocatedTo: null })]);
    const c = fixture.componentInstance;
    c.openPanel({ kind: 'block', epin: pin({ status: 'UNUSED' }) as never });
    c.panelReason = 'lost';
    c.submitBlock();
    const req = httpMock.expectOne('/api/admin/epins/p1/block');
    expect(req.request.body).toEqual({ reason: 'lost' });
    req.flush(pin({ status: 'BLOCKED' }));
    httpMock.expectOne(r => r.url === '/api/admin/epins').flush({ epins: [], page: 0, size: 20, totalElements: 0 });
  });

  it('generates a batch and shows the returned codes once', () => {
    flushInitial([]);
    const c = fixture.componentInstance;
    c.generateCount = 2;
    c.submitGenerate();
    httpMock.expectOne('/api/admin/epins').flush({ batchId: 'b', count: 2, codes: ['X1', 'X2'], generatedAt: 'now', expiresAt: null });
    httpMock.expectOne(r => r.url === '/api/admin/epins').flush({ epins: [], page: 0, size: 20, totalElements: 0 });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('X1');
    expect(fixture.nativeElement.textContent).toContain('X2');
  });

  it('shows an inline error message when allocate fails with 409', () => {
    flushInitial([]);
    const c = fixture.componentInstance;
    c.allocateAssociateId = 'a1';
    c.allocateCount = 5;
    c.submitAllocate();
    httpMock.expectOne('/api/admin/epins/allocate').flush({ error: 'pool' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    expect(c.actionError).toBe('admin.epinRegister.errorConflict');
  });
});
```

- [ ] **Step 7: Run to verify failure**

Run: `cd frontend && npx ng test --watch=false --include='src/app/admin/epin-register/epin-register.component.spec.ts'`
Expected: FAIL (component missing).

- [ ] **Step 8: Implement the component**

`epin-register.component.ts`:

```ts
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { EPinRegisterService } from './epin-register.service';
import { AdminService } from '../admin.service';
import { AssociateSummary } from '../models/associate-summary.model';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { AllocateResult, EPin, EPinEvent, EPinFilters, EPinPage, EPinStatus, RedemptionType } from './epin.model';

const PAGE_SIZE = 20;

type Panel =
  | { kind: 'generate' }
  | { kind: 'allocate' }
  | { kind: 'redeem'; epin: EPin }
  | { kind: 'block'; epin: EPin }
  | { kind: 'events'; epin: EPin };

@Component({
  selector: 'app-epin-register',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, InlineBannerComponent],
  providers: [DatePipe],
  template: `
    <div class="epin-register">
      <div class="epin-register__intro">
        <h1 class="epin-register__title">{{ 'admin.epinRegister.title' | translate }}</h1>
        <p class="epin-register__subtitle">{{ 'admin.epinRegister.subtitle' | translate }}</p>
        <div class="epin-register__header-actions">
          <button type="button" class="brand-button" (click)="openPanel({ kind: 'generate' })">
            {{ 'admin.epinRegister.generateAction' | translate }}
          </button>
          <button type="button" class="brand-button brand-button--secondary" (click)="openPanel({ kind: 'allocate' })">
            {{ 'admin.epinRegister.allocateAction' | translate }}
          </button>
        </div>
      </div>

      <div class="epin-register__filters">
        <label>
          {{ 'admin.epinRegister.statusFilterLabel' | translate }}
          <select (change)="onStatusChange($any($event.target).value)">
            <option value="">{{ 'admin.epinRegister.filterAll' | translate }}</option>
            <option *ngFor="let s of statuses" [value]="s">{{ 'admin.epinRegister.status.' + s | translate }}</option>
          </select>
        </label>
        <label>
          {{ 'admin.epinRegister.holderFilterLabel' | translate }}
          <select (change)="onHolderChange($any($event.target).value)">
            <option value="">{{ 'admin.epinRegister.filterAll' | translate }}</option>
            <option *ngFor="let a of associates" [value]="a.id">{{ a.userId }} — {{ a.name }}</option>
          </select>
        </label>
        <label>
          {{ 'admin.epinRegister.batchFilterLabel' | translate }}
          <input type="text" [ngModel]="batchId" (ngModelChange)="onBatchChange($event)" />
        </label>
        <label class="epin-register__check">
          <input type="checkbox" [ngModel]="expiredOnly" (ngModelChange)="onExpiredChange($event)" />
          {{ 'admin.epinRegister.expiredOnlyLabel' | translate }}
        </label>
      </div>

      <app-inline-banner *ngIf="loadError" tone="danger">{{ 'admin.epinRegister.loadError' | translate }}</app-inline-banner>
      <app-inline-banner *ngIf="actionError" tone="danger">{{ actionError | translate }}</app-inline-banner>

      <div class="epin-register__panel card" *ngIf="panel">
        <ng-container [ngSwitch]="panel.kind">
          <form *ngSwitchCase="'generate'" (ngSubmit)="submitGenerate()">
            <h2>{{ 'admin.epinRegister.generateAction' | translate }}</h2>
            <label>{{ 'admin.epinRegister.countLabel' | translate }}
              <input type="number" min="1" max="2000" name="count" [(ngModel)]="generateCount" required />
            </label>
            <label>{{ 'admin.epinRegister.expiresLabel' | translate }}
              <input type="datetime-local" name="expires" [(ngModel)]="generateExpiresLocal" />
            </label>
            <button type="submit" class="brand-button">{{ 'admin.epinRegister.submit' | translate }}</button>
            <button type="button" class="brand-button brand-button--secondary" (click)="closePanel()">{{ 'admin.epinRegister.cancel' | translate }}</button>
            <div *ngIf="generatedCodes.length" class="epin-register__codes">
              <p>{{ 'admin.epinRegister.codesShownOnce' | translate }}</p>
              <textarea readonly rows="6" [value]="generatedCodes.join('\\n')"></textarea>
              <button type="button" class="brand-button brand-button--secondary" (click)="copyCodes()">{{ 'admin.epinRegister.copyAll' | translate }}</button>
            </div>
          </form>

          <form *ngSwitchCase="'allocate'" (ngSubmit)="submitAllocate()">
            <h2>{{ 'admin.epinRegister.allocateAction' | translate }}</h2>
            <label>{{ 'admin.epinRegister.associateLabel' | translate }}
              <select name="alloc-assoc" [(ngModel)]="allocateAssociateId" required>
                <option value="">—</option>
                <option *ngFor="let a of associates" [value]="a.id">{{ a.userId }} — {{ a.name }}</option>
              </select>
            </label>
            <label>{{ 'admin.epinRegister.countLabel' | translate }}
              <input type="number" min="1" max="2000" name="alloc-count" [(ngModel)]="allocateCount" required />
            </label>
            <label>{{ 'admin.epinRegister.batchFilterLabel' | translate }}
              <input type="text" name="alloc-batch" [(ngModel)]="allocateBatchId" />
            </label>
            <button type="submit" class="brand-button">{{ 'admin.epinRegister.submit' | translate }}</button>
            <button type="button" class="brand-button brand-button--secondary" (click)="closePanel()">{{ 'admin.epinRegister.cancel' | translate }}</button>
            <p *ngIf="allocateResult">{{ 'admin.epinRegister.allocatedCount' | translate: { count: allocateResult.count } }}</p>
          </form>

          <form *ngSwitchCase="'redeem'" (ngSubmit)="submitRedeem()">
            <h2>{{ 'admin.epinRegister.redeemAction' | translate }}</h2>
            <label>{{ 'admin.epinRegister.associateLabel' | translate }}
              <select name="redeem-assoc" [(ngModel)]="redeemAssociateId" required>
                <option value="">—</option>
                <option *ngFor="let a of associates" [value]="a.id">{{ a.userId }} — {{ a.name }}</option>
              </select>
            </label>
            <label>{{ 'admin.epinRegister.typeLabel' | translate }}
              <select name="redeem-type" [(ngModel)]="redeemType">
                <option value="ACTIVATION">{{ 'admin.epinRegister.typeActivation' | translate }}</option>
                <option value="TOPUP">{{ 'admin.epinRegister.typeTopup' | translate }}</option>
              </select>
            </label>
            <button type="submit" class="brand-button">{{ 'admin.epinRegister.submit' | translate }}</button>
            <button type="button" class="brand-button brand-button--secondary" (click)="closePanel()">{{ 'admin.epinRegister.cancel' | translate }}</button>
          </form>

          <form *ngSwitchCase="'block'" (ngSubmit)="submitBlock()">
            <h2>{{ 'admin.epinRegister.blockAction' | translate }}</h2>
            <label>{{ 'admin.epinRegister.reasonLabel' | translate }}
              <input type="text" name="reason" maxlength="255" [(ngModel)]="panelReason" required />
            </label>
            <button type="submit" class="brand-button">{{ 'admin.epinRegister.submit' | translate }}</button>
            <button type="button" class="brand-button brand-button--secondary" (click)="closePanel()">{{ 'admin.epinRegister.cancel' | translate }}</button>
          </form>

          <div *ngSwitchCase="'events'">
            <h2>{{ 'admin.epinRegister.eventsTitle' | translate }}</h2>
            <ul class="epin-register__events">
              <li *ngFor="let e of events">
                {{ datePipe.transform(e.at, 'medium') }} — {{ e.eventType }}
                <span *ngIf="e.note">({{ e.note }})</span>
              </li>
            </ul>
            <button type="button" class="brand-button brand-button--secondary" (click)="closePanel()">{{ 'admin.epinRegister.close' | translate }}</button>
          </div>
        </ng-container>
      </div>

      <div class="card epin-register__table-wrap">
        <table class="epin-register__table">
          <thead>
            <tr>
              <th>{{ 'admin.epinRegister.colCode' | translate }}</th>
              <th>{{ 'admin.epinRegister.colStatus' | translate }}</th>
              <th>{{ 'admin.epinRegister.colBatch' | translate }}</th>
              <th>{{ 'admin.epinRegister.colExpires' | translate }}</th>
              <th>{{ 'admin.epinRegister.colHolder' | translate }}</th>
              <th>{{ 'admin.epinRegister.colRedeemedTo' | translate }}</th>
              <th>{{ 'admin.epinRegister.colActions' | translate }}</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let p of page?.epins">
              <td class="epin-register__code">{{ p.code }}</td>
              <td>
                <span class="epin-register__chip" [class.epin-register__chip--expired]="p.expired">
                  {{ (p.expired ? 'admin.epinRegister.expiredChip' : 'admin.epinRegister.status.' + p.status) | translate }}
                </span>
              </td>
              <td>{{ p.batchId.slice(0, 8) }}</td>
              <td>{{ p.expiresAt ? datePipe.transform(p.expiresAt, 'mediumDate') : '—' }}</td>
              <td>{{ userId(p.allocatedTo) }}</td>
              <td>{{ userId(p.redeemedTo) }}</td>
              <td class="epin-register__actions">
                <button type="button" *ngIf="p.status === 'UNUSED' || p.status === 'ALLOCATED'" (click)="openPanel({ kind: 'redeem', epin: p })">{{ 'admin.epinRegister.redeemAction' | translate }}</button>
                <button type="button" *ngIf="p.status === 'UNUSED' || p.status === 'ALLOCATED'" (click)="openPanel({ kind: 'block', epin: p })">{{ 'admin.epinRegister.blockAction' | translate }}</button>
                <button type="button" *ngIf="p.status === 'BLOCKED'" (click)="unblock(p)">{{ 'admin.epinRegister.unblockAction' | translate }}</button>
                <button type="button" (click)="openPanel({ kind: 'events', epin: p })">{{ 'admin.epinRegister.eventsAction' | translate }}</button>
              </td>
            </tr>
            <tr *ngIf="!page?.epins?.length">
              <td colspan="7">{{ 'admin.epinRegister.emptyState' | translate }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="epin-register__pagination" *ngIf="page">
        <span>{{ 'admin.epinRegister.pageIndicator' | translate: { page: currentPage, totalPages: totalPages } }}</span>
        <button type="button" class="brand-button brand-button--secondary" [disabled]="page.page === 0" (click)="loadPage(page.page - 1)">{{ 'admin.epinRegister.previousPageAction' | translate }}</button>
        <button type="button" class="brand-button brand-button--secondary" [disabled]="(page.page + 1) * page.size >= page.totalElements" (click)="loadPage(page.page + 1)">{{ 'admin.epinRegister.nextPageAction' | translate }}</button>
      </div>
    </div>
  `
})
export class EPinRegisterComponent implements OnInit {
  private service = inject(EPinRegisterService);
  private adminService = inject(AdminService);
  protected datePipe = inject(DatePipe);

  readonly statuses: EPinStatus[] = ['UNUSED', 'ALLOCATED', 'USED', 'BLOCKED'];
  page: EPinPage | null = null;
  associates: AssociateSummary[] = [];
  loadError = false;
  actionError = '';

  status = '';
  holderId = '';
  batchId = '';
  expiredOnly = false;

  panel: Panel | null = null;
  generateCount = 10;
  generateExpiresLocal = '';
  generatedCodes: string[] = [];
  allocateAssociateId = '';
  allocateCount = 1;
  allocateBatchId = '';
  allocateResult: AllocateResult | null = null;
  redeemAssociateId = '';
  redeemType: RedemptionType = 'ACTIVATION';
  panelReason = '';
  events: EPinEvent[] = [];

  get currentPage(): number { return (this.page?.page ?? 0) + 1; }
  get totalPages(): number {
    return !this.page || this.page.size === 0 ? 1 : Math.max(1, Math.ceil(this.page.totalElements / this.page.size));
  }

  ngOnInit(): void {
    this.adminService.listAssociates().subscribe(a => (this.associates = a));
    this.loadPage(0);
  }

  userId(id: string | null): string {
    if (!id) return '—';
    return this.associates.find(a => a.id === id)?.userId ?? id.slice(0, 8);
  }

  onStatusChange(v: string): void { this.status = v; this.loadPage(0); }
  onHolderChange(v: string): void { this.holderId = v; this.loadPage(0); }
  onBatchChange(v: string): void { this.batchId = v.trim(); this.loadPage(0); }
  onExpiredChange(v: boolean): void { this.expiredOnly = v; this.loadPage(0); }

  loadPage(page: number): void {
    this.loadError = false;
    const filters: EPinFilters = {};
    if (this.status) filters.status = this.status as EPinStatus;
    if (this.holderId) filters.allocatedTo = this.holderId;
    if (this.batchId) filters.batchId = this.batchId;
    if (this.expiredOnly) filters.expired = true;
    this.service.list(filters, page, PAGE_SIZE).subscribe({
      next: res => (this.page = res),
      error: () => (this.loadError = true)
    });
  }

  openPanel(panel: Panel): void {
    this.panel = panel;
    this.actionError = '';
    this.generatedCodes = [];
    this.allocateResult = null;
    this.panelReason = '';
    if (panel.kind === 'events') {
      this.events = [];
      this.service.events(panel.epin.id).subscribe(e => (this.events = e));
    }
  }

  closePanel(): void { this.panel = null; }

  submitGenerate(): void {
    this.actionError = '';
    const expiresAt = this.generateExpiresLocal ? new Date(this.generateExpiresLocal).toISOString() : undefined;
    this.service.generate(this.generateCount, expiresAt).subscribe({
      next: res => { this.generatedCodes = res.codes; this.loadPage(0); },
      error: e => this.fail(e)
    });
  }

  copyCodes(): void {
    void navigator.clipboard?.writeText(this.generatedCodes.join('\n'));
  }

  submitAllocate(): void {
    this.actionError = '';
    this.service.allocate(this.allocateAssociateId, this.allocateCount, this.allocateBatchId || undefined).subscribe({
      next: res => { this.allocateResult = res; this.loadPage(0); },
      error: e => this.fail(e)
    });
  }

  submitRedeem(): void {
    if (this.panel?.kind !== 'redeem') return;
    this.actionError = '';
    this.service.redeem(this.panel.epin.id, this.redeemAssociateId, this.redeemType).subscribe({
      next: () => { this.closePanel(); this.loadPage(this.page?.page ?? 0); },
      error: e => this.fail(e)
    });
  }

  submitBlock(): void {
    if (this.panel?.kind !== 'block') return;
    this.actionError = '';
    this.service.block(this.panel.epin.id, this.panelReason).subscribe({
      next: () => { this.closePanel(); this.loadPage(this.page?.page ?? 0); },
      error: e => this.fail(e)
    });
  }

  unblock(p: EPin): void {
    this.actionError = '';
    this.service.unblock(p.id).subscribe({
      next: () => this.loadPage(this.page?.page ?? 0),
      error: e => this.fail(e)
    });
  }

  private fail(e: HttpErrorResponse): void {
    this.actionError = e.status === 409 ? 'admin.epinRegister.errorConflict'
      : e.status === 404 ? 'admin.epinRegister.errorNotFound'
      : e.status === 400 ? 'admin.epinRegister.errorInvalid'
      : 'admin.epinRegister.errorGeneric';
  }
}
```

(In the template, `'\\n'` inside the TS template literal renders as `\n` in the Angular expression, which is the newline escape in the string. Keep it exactly as written.)

- [ ] **Step 9: Routes, nav, models, i18n, styles**

`app.routes.ts`: import `EPinRegisterComponent` from `./admin/epin-register/epin-register.component` and, in the `settings` children after the `ledger-register` line:

```ts
      { path: 'e-pin-register', component: EPinRegisterComponent, data: { sectionKey: 'epinRegister' } },
```

`admin-nav-categories.model.ts`: add, next to the `ledgerRegister` entry (same category):

```ts
      { key: 'epinRegister', labelKey: 'settings.sections.epinRegister', path: '/settings/e-pin-register' },
```

`admin-associate-detail.model.ts` and `admin-associate-summary.model.ts`: change `status: 'ACTIVE' | 'SUSPENDED';` to `status: 'ACTIVE' | 'SUSPENDED' | 'PENDING';`.

`en.json`: under `settings.sections` add `"epinRegister": "e-Pin Register"`. Add a new top-level-under-`admin` object (sibling of `ledgerRegister`, ~line 780):

```json
    "epinRegister": {
      "title": "e-Pin Register",
      "subtitle": "Generate, allocate, block and redeem e-pins, and audit each pin's history.",
      "generateAction": "Generate batch",
      "allocateAction": "Allocate pins",
      "redeemAction": "Redeem",
      "blockAction": "Block",
      "unblockAction": "Unblock",
      "eventsAction": "History",
      "eventsTitle": "Pin history",
      "submit": "Submit",
      "cancel": "Cancel",
      "close": "Close",
      "countLabel": "Number of pins",
      "expiresLabel": "Expires (optional)",
      "associateLabel": "Associate",
      "typeLabel": "Redemption type",
      "typeActivation": "Activation",
      "typeTopup": "Top-up",
      "reasonLabel": "Reason",
      "codesShownOnce": "Copy these codes now. Use the register to view them later.",
      "copyAll": "Copy all",
      "allocatedCount": "Allocated {{count}} pin(s).",
      "statusFilterLabel": "Status",
      "holderFilterLabel": "Holder",
      "batchFilterLabel": "Batch ID",
      "expiredOnlyLabel": "Expired only",
      "filterAll": "All",
      "status": { "UNUSED": "Unused", "ALLOCATED": "Allocated", "USED": "Used", "BLOCKED": "Blocked" },
      "expiredChip": "Expired",
      "colCode": "Code", "colStatus": "Status", "colBatch": "Batch", "colExpires": "Expires",
      "colHolder": "Holder", "colRedeemedTo": "Redeemed to", "colActions": "Actions",
      "emptyState": "No e-pins match these filters.",
      "pageIndicator": "Page {{page}} of {{totalPages}}",
      "previousPageAction": "Previous",
      "nextPageAction": "Next",
      "loadError": "Could not load e-pins.",
      "errorConflict": "That action is not allowed in the pin's current state, or not enough pins are available.",
      "errorNotFound": "Pin or associate not found.",
      "errorInvalid": "Check the values entered.",
      "errorGeneric": "Something went wrong. Try again."
    },
```

`_admin.scss`: append minimal styles following the file's existing tokens (use the `--` custom properties already used by the ledger register):

```scss
.epin-register {
  &__filters { display: flex; flex-wrap: wrap; gap: 1rem; margin-block: 1rem; }
  &__header-actions { display: flex; gap: 0.5rem; margin-top: 0.75rem; }
  &__panel { padding: 1rem; margin-block: 1rem; }
  &__table-wrap { overflow-x: auto; }
  &__table { width: 100%; border-collapse: collapse; th, td { padding: 0.5rem 0.75rem; text-align: left; } }
  &__code { font-family: var(--font-mono, monospace); }
  &__actions { display: flex; flex-wrap: wrap; gap: 0.25rem; }
  &__chip { padding: 0.125rem 0.5rem; border-radius: 999px; background: var(--surface-muted, #eee); &--expired { background: var(--danger-soft, #fde8e8); } }
  &__pagination { display: flex; gap: 0.5rem; align-items: center; margin-top: 1rem; }
}
```

- [ ] **Step 10: Run frontend tests**

Run: `cd frontend && npx ng test --watch=false --include='src/app/admin/epin-register/**/*.spec.ts' --include='src/app/app.routes.spec.ts' --include='src/app/admin-nav-categories.model.spec.ts'`
Expected: PASS. If `app.routes.spec.ts` or the nav spec enumerate settings sections and fail, add the `epinRegister` entry to their expected lists.

- [ ] **Step 11: Commit**

```bash
git add frontend/src
git commit -m "feat(epin): admin e-Pin Register screen

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Associate "My e-Pins" screen and PENDING banner (spec unit 14)

**Files:**
- Create: `frontend/src/app/epins/{epin.model.ts, epins.service.ts, epins.service.spec.ts, epins.component.ts, epins.component.spec.ts}`; `frontend/src/app/shared/components/pending-activation-banner/{pending-activation-banner.component.ts, pending-activation-banner.component.spec.ts}`
- Modify: `frontend/src/app/app.routes.ts` (after the `plot-bookings` route, ~line 46), `frontend/src/app/associate-nav-items.model.ts`, `frontend/src/app/dashboard/dashboard.component.ts` (banner), `frontend/src/assets/i18n/en.json`, `frontend/src/styles/_dashboard.scss`, `frontend/src/app/shared/components/associate-sidebar/associate-sidebar.component.spec.ts` if it enumerates nav items
- Test: the spec files above

**Interfaces:**
- Consumes: backend Tasks 5-8 (`GET /api/associates/me/epins`, `POST .../{id}/redeem` `{userId}`, `POST .../{id}/transfer` `{toUserId}`, profile `status`).
- Produces: `EPinsService.list(status, page, size)`, `.redeem(id, userId)`, `.transfer(id, toUserId)`; route `/e-pins`; `<app-pending-activation-banner>`.

- [ ] **Step 1: Model and failing service spec**

`epins/epin.model.ts` (the associate view reuses the same response shape):

```ts
export type { EPin, EPinPage, EPinStatus } from '../admin/epin-register/epin.model';
```

`epins.service.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { EPinsService } from './epins.service';

describe('EPinsService', () => {
  let service: EPinsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(EPinsService);
    httpMock = TestBed.inject(HttpTestingController);
  });
  afterEach(() => httpMock.verify());

  it('lists my pins with an optional status and paging', () => {
    service.list('ALLOCATED', 0, 100).subscribe();
    const req = httpMock.expectOne(r => r.url === '/api/associates/me/epins');
    expect(req.request.params.get('status')).toBe('ALLOCATED');
    expect(req.request.params.get('size')).toBe('100');
    req.flush({ epins: [], page: 0, size: 100, totalElements: 0 });
  });

  it('omits status when unfiltered', () => {
    service.list(undefined, 0, 20).subscribe();
    const req = httpMock.expectOne(r => r.url === '/api/associates/me/epins');
    expect(req.request.params.has('status')).toBeFalse();
    req.flush({ epins: [], page: 0, size: 20, totalElements: 0 });
  });

  it('redeems and transfers by human userId', () => {
    service.redeem('p1', 'VP00042').subscribe();
    let req = httpMock.expectOne('/api/associates/me/epins/p1/redeem');
    expect(req.request.body).toEqual({ userId: 'VP00042' });
    req.flush({});

    service.transfer('p1', 'VP00050').subscribe();
    req = httpMock.expectOne('/api/associates/me/epins/p1/transfer');
    expect(req.request.body).toEqual({ toUserId: 'VP00050' });
    req.flush({});
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx ng test --watch=false --include='src/app/epins/epins.service.spec.ts'`
Expected: FAIL.

- [ ] **Step 3: Implement the service**

`epins.service.ts`:

```ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { EPin, EPinPage, EPinStatus } from './epin.model';

@Injectable({ providedIn: 'root' })
export class EPinsService {
  private http = inject(HttpClient);

  list(status: EPinStatus | undefined, page: number, size: number): Observable<EPinPage> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (status) {
      params = params.set('status', status);
    }
    return this.http.get<EPinPage>('/api/associates/me/epins', { params });
  }

  redeem(id: string, userId: string): Observable<EPin> {
    return this.http.post<EPin>(`/api/associates/me/epins/${id}/redeem`, { userId });
  }

  transfer(id: string, toUserId: string): Observable<EPin> {
    return this.http.post<EPin>(`/api/associates/me/epins/${id}/transfer`, { toUserId });
  }
}
```

- [ ] **Step 4: Failing component spec**

`epins.component.spec.ts`:

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { EPinsComponent } from './epins.component';

describe('EPinsComponent', () => {
  let fixture: ComponentFixture<EPinsComponent>;
  let httpMock: HttpTestingController;
  const soon = new Date(Date.now() + 3 * 86_400_000).toISOString();

  const pin = (over: Record<string, unknown> = {}) => ({
    id: 'p1', code: 'CODE-1', batchId: 'b', status: 'ALLOCATED', generatedBy: 'g', generatedAt: 'x', expiresAt: null,
    allocatedTo: 'me', allocatedBy: 'g', allocatedAt: 'x', redeemedTo: null, redeemedBy: null, redeemedAt: null,
    redemptionType: null, linkedEntityId: null, blockedBy: null, blockedAt: null, blockReason: null, expired: false, ...over
  });

  function flush(epins: unknown[]) {
    httpMock.expectOne(r => r.url === '/api/associates/me/epins').flush(
      { epins, page: 0, size: 100, totalElements: epins.length });
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EPinsComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(EPinsComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });
  afterEach(() => httpMock.verify());

  it('lists available pins (ALLOCATED, not expired) with activate and transfer actions', () => {
    flush([pin(), pin({ id: 'p2', code: 'OLD', expired: true }), pin({ id: 'p3', code: 'DONE', status: 'USED' })]);
    const c = fixture.componentInstance;
    expect(c.available.map(p => p.code)).toEqual(['CODE-1']);
    expect(c.history.map(p => p.code).sort()).toEqual(['DONE', 'OLD']);
    expect(fixture.nativeElement.querySelectorAll('.epins__available-row').length).toBe(1);
  });

  it('summarises available, used and expiring-within-7-days counts', () => {
    flush([pin(), pin({ id: 'p2', expiresAt: soon }), pin({ id: 'p3', status: 'USED' })]);
    const c = fixture.componentInstance;
    expect(c.availableCount).toBe(2);
    expect(c.usedCount).toBe(1);
    expect(c.expiringSoonCount).toBe(1);
  });

  it('activates a member by userId then reloads', () => {
    flush([pin()]);
    const c = fixture.componentInstance;
    c.startAction(pin() as never, 'activate');
    c.userIdInput = 'VP00042';
    c.confirmAction();
    const req = httpMock.expectOne('/api/associates/me/epins/p1/redeem');
    expect(req.request.body).toEqual({ userId: 'VP00042' });
    req.flush(pin({ status: 'USED' }));
    flush([]);
    expect(c.actionPin).toBeNull();
  });

  it('transfers by userId and shows an inline message on 404 / 409', () => {
    flush([pin()]);
    const c = fixture.componentInstance;
    c.startAction(pin() as never, 'transfer');
    c.userIdInput = 'VP00050';
    c.confirmAction();
    httpMock.expectOne('/api/associates/me/epins/p1/transfer')
      .flush({ error: 'x' }, { status: 404, statusText: 'Not Found' });
    expect(c.actionError).toBe('epins.errorNotFound');

    c.confirmAction();
    httpMock.expectOne('/api/associates/me/epins/p1/transfer')
      .flush({ error: 'x' }, { status: 409, statusText: 'Conflict' });
    expect(c.actionError).toBe('epins.errorConflict');
  });

  it('does not submit with a blank userId', () => {
    flush([pin()]);
    const c = fixture.componentInstance;
    c.startAction(pin() as never, 'activate');
    c.userIdInput = '   ';
    c.confirmAction();
    httpMock.expectNone(r => r.url.includes('/redeem'));
    expect(c.actionError).toBe('epins.errorUserIdRequired');
  });
});
```

- [ ] **Step 5: Run to verify failure**

Run: `cd frontend && npx ng test --watch=false --include='src/app/epins/epins.component.spec.ts'`
Expected: FAIL.

- [ ] **Step 6: Implement the component**

`epins.component.ts`:

```ts
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { EPinsService } from './epins.service';
import { EPin } from './epin.model';
import { InlineBannerComponent } from '../shared/components/inline-banner/inline-banner.component';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

@Component({
  selector: 'app-epins',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, InlineBannerComponent],
  providers: [DatePipe],
  template: `
    <div class="epins">
      <h1 class="epins__title">{{ 'epins.title' | translate }}</h1>
      <p class="epins__subtitle">{{ 'epins.subtitle' | translate }}</p>

      <div class="epins__summary">
        <div class="card"><strong>{{ availableCount }}</strong> {{ 'epins.summaryAvailable' | translate }}</div>
        <div class="card"><strong>{{ usedCount }}</strong> {{ 'epins.summaryUsed' | translate }}</div>
        <div class="card"><strong>{{ expiringSoonCount }}</strong> {{ 'epins.summaryExpiring' | translate }}</div>
      </div>

      <app-inline-banner *ngIf="loadError" tone="danger">{{ 'epins.loadError' | translate }}</app-inline-banner>

      <div class="epins__tabs">
        <button type="button" [class.epins__tab--active]="tab === 'available'" (click)="tab = 'available'">{{ 'epins.tabAvailable' | translate }}</button>
        <button type="button" [class.epins__tab--active]="tab === 'history'" (click)="tab = 'history'">{{ 'epins.tabHistory' | translate }}</button>
      </div>

      <div class="card epins__action" *ngIf="actionPin">
        <h2>{{ (action === 'activate' ? 'epins.activateTitle' : 'epins.transferTitle') | translate }}</h2>
        <p class="epins__code">{{ actionPin.code }}</p>
        <label>{{ 'epins.userIdLabel' | translate }}
          <input type="text" name="userId" [(ngModel)]="userIdInput" />
        </label>
        <app-inline-banner *ngIf="actionError" tone="danger">{{ actionError | translate }}</app-inline-banner>
        <button type="button" class="brand-button" (click)="confirmAction()">{{ 'epins.confirm' | translate }}</button>
        <button type="button" class="brand-button brand-button--secondary" (click)="cancelAction()">{{ 'epins.cancel' | translate }}</button>
      </div>

      <div *ngIf="tab === 'available'" class="card">
        <p *ngIf="!available.length">{{ 'epins.emptyAvailable' | translate }}</p>
        <div class="epins__available-row" *ngFor="let p of available">
          <span class="epins__code">{{ p.code }}</span>
          <span class="epins__expiry" *ngIf="p.expiresAt">{{ 'epins.expiresOn' | translate: { date: datePipe.transform(p.expiresAt, 'mediumDate') } }}</span>
          <button type="button" (click)="startAction(p, 'activate')">{{ 'epins.activateAction' | translate }}</button>
          <button type="button" (click)="startAction(p, 'transfer')">{{ 'epins.transferAction' | translate }}</button>
        </div>
      </div>

      <div *ngIf="tab === 'history'" class="card">
        <p *ngIf="!history.length">{{ 'epins.emptyHistory' | translate }}</p>
        <div class="epins__history-row" *ngFor="let p of history">
          <span class="epins__code">{{ p.code }}</span>
          <span>{{ (p.expired ? 'epins.statusExpired' : 'epins.status.' + p.status) | translate }}</span>
        </div>
      </div>
    </div>
  `
})
export class EPinsComponent implements OnInit {
  private service = inject(EPinsService);
  protected datePipe = inject(DatePipe);

  all: EPin[] = [];
  loadError = false;
  tab: 'available' | 'history' = 'available';

  actionPin: EPin | null = null;
  action: 'activate' | 'transfer' = 'activate';
  userIdInput = '';
  actionError = '';

  get available(): EPin[] { return this.all.filter(p => p.status === 'ALLOCATED' && !p.expired); }
  get history(): EPin[] { return this.all.filter(p => !(p.status === 'ALLOCATED' && !p.expired)); }
  get availableCount(): number { return this.available.length; }
  get usedCount(): number { return this.all.filter(p => p.status === 'USED').length; }
  get expiringSoonCount(): number {
    const limit = Date.now() + SEVEN_DAYS_MS;
    return this.available.filter(p => p.expiresAt && new Date(p.expiresAt).getTime() <= limit).length;
  }

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loadError = false;
    this.service.list(undefined, 0, 100).subscribe({
      next: res => (this.all = res.epins),
      error: () => (this.loadError = true)
    });
  }

  startAction(pin: EPin, action: 'activate' | 'transfer'): void {
    this.actionPin = pin;
    this.action = action;
    this.userIdInput = '';
    this.actionError = '';
  }

  cancelAction(): void { this.actionPin = null; }

  confirmAction(): void {
    if (!this.actionPin) return;
    const userId = this.userIdInput.trim();
    if (!userId) {
      this.actionError = 'epins.errorUserIdRequired';
      return;
    }
    this.actionError = '';
    const call = this.action === 'activate'
      ? this.service.redeem(this.actionPin.id, userId)
      : this.service.transfer(this.actionPin.id, userId);
    call.subscribe({
      next: () => { this.actionPin = null; this.load(); },
      error: (e: HttpErrorResponse) => {
        this.actionError = e.status === 404 ? 'epins.errorNotFound'
          : e.status === 409 ? 'epins.errorConflict'
          : 'epins.errorGeneric';
      }
    });
  }
}
```

Known limit, recorded here and in the UI copy: the associate list loads the 100 most recent pins (`size=100`, the backend clamp). Paging the history beyond 100 is not built; the summary counts reflect that window.

- [ ] **Step 7: Banner: failing spec, then component**

`pending-activation-banner.component.spec.ts`:

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { PendingActivationBannerComponent } from './pending-activation-banner.component';

describe('PendingActivationBannerComponent', () => {
  let fixture: ComponentFixture<PendingActivationBannerComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PendingActivationBannerComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(PendingActivationBannerComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });
  afterEach(() => httpMock.verify());

  it('shows the banner for a PENDING associate', () => {
    httpMock.expectOne('/api/associates/me/profile').flush({ status: 'PENDING' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.pending-banner')).not.toBeNull();
  });

  it('shows nothing for an ACTIVE associate or when the profile call fails', () => {
    httpMock.expectOne('/api/associates/me/profile').flush({ status: 'ACTIVE' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.pending-banner')).toBeNull();
  });

  it('stays hidden on an error', () => {
    httpMock.expectOne('/api/associates/me/profile').flush({}, { status: 500, statusText: 'err' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.pending-banner')).toBeNull();
  });
});
```

`pending-activation-banner.component.ts`:

```ts
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { InlineBannerComponent } from '../inline-banner/inline-banner.component';

@Component({
  selector: 'app-pending-activation-banner',
  standalone: true,
  imports: [CommonModule, TranslateModule, InlineBannerComponent],
  template: `
    <app-inline-banner *ngIf="pending" tone="warning" class="pending-banner">
      {{ 'epins.pendingBanner' | translate }}
    </app-inline-banner>
  `
})
export class PendingActivationBannerComponent implements OnInit {
  private http = inject(HttpClient);
  pending = false;

  ngOnInit(): void {
    this.http.get<{ status: string }>('/api/associates/me/profile').subscribe({
      next: p => (this.pending = p.status === 'PENDING'),
      error: () => (this.pending = false)
    });
  }
}
```

If `app-inline-banner` does not support `tone="warning"` (check `shared/components/inline-banner/inline-banner.component.ts`), use a tone it does support, e.g. `"info"` or `"danger"`.

- [ ] **Step 8: Wire route, nav, dashboard banner, i18n, styles**

`app.routes.ts`: import `EPinsComponent` and add after the `plot-bookings` route:

```ts
  { path: 'e-pins', component: EPinsComponent, canActivate: [authGuard, associateOnlyGuard] },
```

`associate-nav-items.model.ts`: insert after the `plotBookings` entry:

```ts
  { key: 'epins', labelKey: 'nav.epins', icon: 'confirmation_number', path: '/e-pins' },
```

`dashboard.component.ts`: add `PendingActivationBannerComponent` to the component's `imports` array and insert `<app-pending-activation-banner></app-pending-activation-banner>` as the first child inside `<div class="dashboard" *ngIf="dashboard as d">` (immediately before `<div class="dashboard__header">`). In `dashboard.component.spec.ts`, the banner issues one extra `GET /api/associates/me/profile`; add an `httpMock.expectOne('/api/associates/me/profile').flush({ status: 'ACTIVE' })` to the arrange helper wherever the spec flushes the dashboard request, or use `httpMock.match(...)` there so existing assertions keep passing.

`en.json`: add `"epins": "e-Pins"` under `nav`, and a top-level `epins` object:

```json
  "epins": {
    "title": "My e-Pins",
    "subtitle": "Pins allocated to you. Use one to activate a new member of your team, or pass it to another associate.",
    "summaryAvailable": "available",
    "summaryUsed": "used",
    "summaryExpiring": "expiring within 7 days",
    "tabAvailable": "Available",
    "tabHistory": "History",
    "emptyAvailable": "You have no pins available.",
    "emptyHistory": "No pin history yet.",
    "expiresOn": "Expires {{date}}",
    "activateAction": "Activate member",
    "transferAction": "Transfer",
    "activateTitle": "Activate a team member",
    "transferTitle": "Transfer this pin",
    "userIdLabel": "Associate ID (e.g. VP00042)",
    "confirm": "Confirm",
    "cancel": "Cancel",
    "status": { "UNUSED": "Unused", "ALLOCATED": "Allocated", "USED": "Used", "BLOCKED": "Blocked" },
    "statusExpired": "Expired",
    "loadError": "Could not load your e-pins.",
    "errorUserIdRequired": "Enter an Associate ID.",
    "errorNotFound": "No such pin or associate in your team.",
    "errorConflict": "That pin or associate cannot be used for this action right now.",
    "errorGeneric": "Something went wrong. Try again.",
    "pendingBanner": "Your account is pending activation. Ask your sponsor for an e-pin."
  },
```

`_dashboard.scss`: add

```scss
.epins {
  &__summary { display: flex; flex-wrap: wrap; gap: 1rem; margin-block: 1rem; }
  &__tabs { display: flex; gap: 0.5rem; margin-block: 1rem; }
  &__tab--active { font-weight: 600; text-decoration: underline; }
  &__available-row, &__history-row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; padding-block: 0.5rem; }
  &__code { font-family: var(--font-mono, monospace); }
  &__action { margin-block: 1rem; padding: 1rem; }
}
```

If `associate-sidebar.component.spec.ts` enumerates `ASSOCIATE_NAV_ITEMS` labels, add the `nav.epins` entry to its expectations.

- [ ] **Step 9: Run frontend tests**

Run: `cd frontend && npx ng test --watch=false --include='src/app/epins/**/*.spec.ts' --include='src/app/shared/components/pending-activation-banner/*.spec.ts' --include='src/app/dashboard/*.spec.ts' --include='src/app/shared/components/associate-sidebar/*.spec.ts' --include='src/app/app.routes.spec.ts'`
Expected: PASS.

- [ ] **Step 10: Full-suite and manual check, then commit**

Run: `cd frontend && npx ng test --watch=false` and `cd backend && mvn -q test -Dtest='EPin*Test,AssociateEPinControllerTest,AssociateStatusCacheTest,AssociateProvisioningServiceTest,AdminAssociate*Test,Withdrawal*Test,SecurityConfigTest'`
Expected: PASS (ignore the known ~55 spurious JDK/Mockito errors in a whole-backend run).

Manual check using the `run` skill (backend + frontend + DB): as admin create an associate (starts `PENDING`), generate a batch with an expiry, allocate 1 pin to an `ACTIVE` associate, log in as that associate, open `/e-pins`, activate the pending member by `userId`, confirm the member is now `ACTIVE` and the pin shows under History; block an unused pin and confirm redeem is refused; open a pin's History panel and see the event trail.

```bash
git add frontend/src
git commit -m "feat(epin): associate My e-Pins screen and pending-activation banner

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Data model (columns, `epin_event`, status CHECKs, `PENDING`, backfill): Task 1. Backfill is the column default; Task 1 repository test covers new CHECK values.
- Expiry (generate, redeem, filter): Tasks 1 (filter) and 2. Block/unblock/events: Task 3. Allocate: Task 4. `PENDING` lifecycle, withdrawal guard, cache fix, profile `status`: Task 5. Associate view: Task 6. Self-redeem: Task 7. Transfer: Task 8. Admin screen: Task 9. Associate screen and banner: Task 10.
- Security matchers: admin POST/GET in Tasks 3-4; associate writes above the blanket rule in Tasks 7-8; associate GET falls through (Task 6).
- Concurrency: `findByIdForUpdate` and `findAllocatable` carry `PESSIMISTIC_WRITE`. The unit tests assert sequential rejection after mutation; true parallel-thread locking is a DB property verified only by the manual check, because the service tests are Mockito-based. Stated plainly rather than claimed.
- Out-of-scope items (notifications, income gating, request workflow, CSV, `TOPUP` mechanics) have no tasks, as in the spec.

**Placeholder scan:** The `WithdrawalServiceTest` step in Task 5 and the `SecurityConfigTest` steps in Tasks 3, 6, 7 describe copying a neighbouring existing test and changing named values rather than printing the file's full arrange block, because those fixtures are file-local and long. The executor must read the neighbouring test; the exact changes are named.

**Type consistency:** `findByIdForUpdate`, `recordEvent`, `loadHeldPin`, `toResponse`, `EPinService` constructor order (Task 1: 4 args; Task 5: adds `AssociateStatusCache` as the 5th) are used consistently. `EPinResponse` 19-arg shape defined in Task 1, used by later tests via the service only. `list(...)` 7-arg service signature defined in Task 1, used by Task 1 controller.

**Review Focus coverage:** items 1 (Task 5 cache test), 2 (Tasks 7/8 sequential-rejection tests), 3 (Task 2 boundary tests), 4 (Task 4 pool test), 5 (Tasks 7/8 not-owned, self, non-active, outside-downline tests), 6 (Task 3 unblock test); item 7 is a recorded code comment.
