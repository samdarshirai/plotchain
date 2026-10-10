# Transaction Password Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the transaction password mandatory, brute-force-locked, and admin-recoverable for all associate-initiated gated actions (E-PIN redeem, E-PIN transfer, profile save, nominee save).

**Architecture:** One shared `TransactionPasswordGuard.require(associateId, supplied)` replaces `TransactionPasswordVerifier.requireIfSet`. Failure/reset bookkeeping lives in a separate `TransactionPasswordAttemptRecorder` bean whose methods run `REQUIRES_NEW` with a pessimistic row lock, so a failed request's rollback cannot erase the counter and concurrent wrong attempts cannot under-count. Password is sent per request in the body (stateless).

**Tech Stack:** Spring Boot, JPA/Hibernate, Flyway, H2 (tests, MODE=PostgreSQL) / Postgres (prod), JUnit5 + Mockito + AssertJ, Angular + ngx-translate (Jasmine specs).

**Spec:** `docs/superpowers/specs/2026-10-10-transaction-password-enforcement-design.md`

## Global Constraints

- Lock threshold: 5 consecutive wrong attempts; lock duration 30 minutes; counter resets to 0 when lock is applied and on success.
- Error codes (JSON field `code`): `TRANSACTION_PASSWORD_NOT_SET` (HTTP 409), `TRANSACTION_PASSWORD_LOCKED` (HTTP 423, body also `lockedUntil` ISO-8601), `TRANSACTION_PASSWORD_INVALID` (HTTP 401, existing status).
- New transaction password min length 6 (unchanged) and must differ from the login password.
- Admin reset route: `POST /api/admin/associates/{id}/reset-transaction-password`, `@PreAuthorize("hasAuthority('ADMIN')")`, returns 204, writes a `SettingsAuditService` entry in section `"ASSOCIATE"`.
- Admin screens/actions stay login-password only. Out of scope: login lockout, OTP/email recovery, self-service withdrawal request.
- Existing flyway migrations are immutable; the next migration is `V44__...`.
- Backend `mvn test` shows ~55 spurious Mockito errors from a JDK mismatch (known env issue, unrelated). Judge by the specific test classes named in each task, not the global count.
- Failure bookkeeping must call the recorder BEFORE throwing and must never run in the caller's transaction.
- Always call `guard.require(...)` BEFORE loading the `Associate` entity that the service later saves, otherwise the later `save()` writes stale counter fields back over the reset.

## Review Focus

- Wrong attempt inside a transaction that then rolls back (E-PIN redeem): counter must still increase. Pinned in Task 2 integration test.
- Correct password after 3 failures, then a profile save: counter must end at 0, not be overwritten by the saved stale entity. Pinned in Task 2 integration test.
- Lock expires (clock past `lockedUntil`): next correct attempt succeeds and clears the lock. Pinned in Task 2 guard test.
- Supplied password null/blank/whitespace on a gated endpoint: counts as a failure, never a 500. Pinned in Task 2 guard test and Task 3 controller test.
- Associate with no password set hits E-PIN redeem/transfer/profile/nominee: 409 `TRANSACTION_PASSWORD_NOT_SET`, no state change, no counter change. Pinned in Tasks 2-3.

---

## File Structure

Backend (`backend/src/main/java/com/plotchain/associate/` unless noted):
- Create `db/migration/V44__transaction_password_lockout.sql` (resources) - two columns.
- Modify `Associate.java` - two fields + accessors.
- Modify `AssociateRepository.java` - `findByIdForUpdate`.
- Create `TransactionPasswordNotSetException.java`, `TransactionPasswordLockedException.java`.
- Create `TransactionPasswordExceptionHandler.java` - 409/423 handlers; modify `AssociateProvisioningExceptionHandler.java` invalid handler to add `code`.
- Create `TransactionPasswordAttemptRecorder.java` - REQUIRES_NEW failure/reset.
- Create `TransactionPasswordGuard.java`; delete `TransactionPasswordVerifier.java`.
- Modify `AssociateProfileService.java`, `AssociateNomineeService.java`, `TransactionPasswordService.java`, `AdminAssociateService.java`, `AdminAssociateController.java`.
- Modify `epin/AssociateRedeemEPinRequest.java`, `epin/TransferEPinRequest.java`, `epin/AssociateEPinController.java`.

Frontend (`frontend/src/app/`):
- Modify `auth/auth.interceptor.ts`, `epins/epins.service.ts`, `epins/epins.component.ts`, `my-account/my-account.component.ts`, `admin/associate-directory/associate-directory.service.ts` + `.component.ts`, `assets/i18n/en.json`, `assets/i18n/hi.json`, and matching specs.

---

### Task 1: Data model, repository lock query, exceptions and handlers

**Files:**
- Create: `backend/src/main/resources/db/migration/V44__transaction_password_lockout.sql`
- Modify: `backend/src/main/java/com/plotchain/associate/Associate.java` (near line 62 and 118-119)
- Modify: `backend/src/main/java/com/plotchain/associate/AssociateRepository.java`
- Create: `.../associate/TransactionPasswordNotSetException.java`, `TransactionPasswordLockedException.java`, `TransactionPasswordExceptionHandler.java`
- Modify: `.../associate/AssociateProvisioningExceptionHandler.java:53-56`
- Test: `backend/src/test/java/com/plotchain/associate/TransactionPasswordExceptionHandlerTest.java`

**Interfaces:**
- Produces: `Associate.getTransactionPasswordFailedAttempts(): int`, `setTransactionPasswordFailedAttempts(int)`, `getTransactionPasswordLockedUntil(): Instant`, `setTransactionPasswordLockedUntil(Instant)`; `AssociateRepository.findByIdForUpdate(UUID): Optional<Associate>`; `new TransactionPasswordNotSetException()`; `new TransactionPasswordLockedException(Instant lockedUntil)` with `getLockedUntil()`.

- [ ] **Step 1: Write the failing test**

```java
package com.plotchain.associate;

import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

import java.time.Instant;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class TransactionPasswordExceptionHandlerTest {

    TransactionPasswordExceptionHandler handler = new TransactionPasswordExceptionHandler();

    @Test
    void notSetMapsTo409WithCode() {
        ResponseEntity<Map<String, String>> res = handler.handleNotSet(new TransactionPasswordNotSetException());

        assertThat(res.getStatusCode().value()).isEqualTo(409);
        assertThat(res.getBody()).containsEntry("code", "TRANSACTION_PASSWORD_NOT_SET");
    }

    @Test
    void lockedMapsTo423WithCodeAndLockedUntil() {
        Instant until = Instant.parse("2026-10-10T12:30:00Z");

        ResponseEntity<Map<String, String>> res = handler.handleLocked(new TransactionPasswordLockedException(until));

        assertThat(res.getStatusCode().value()).isEqualTo(423);
        assertThat(res.getBody()).containsEntry("code", "TRANSACTION_PASSWORD_LOCKED")
            .containsEntry("lockedUntil", "2026-10-10T12:30:00Z");
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && mvn -q test -Dtest=TransactionPasswordExceptionHandlerTest`
Expected: compilation FAIL (classes missing).

- [ ] **Step 3: Implement**

`V44__transaction_password_lockout.sql`:
```sql
-- Brute-force protection for the transaction password (docs/superpowers/specs/2026-10-10-transaction-password-enforcement-design.md).
-- locked_until in the past means unlocked; no cleanup job.
ALTER TABLE associate ADD COLUMN transaction_password_failed_attempts INT NOT NULL DEFAULT 0;
ALTER TABLE associate ADD COLUMN transaction_password_locked_until TIMESTAMP;
```
(If `joined_at` etc. use `TIMESTAMP WITH TIME ZONE` in earlier migrations, match that type for `locked_until`; check `V1`/`V2` before writing.)

`Associate.java` - next to `transactionPasswordHash`:
```java
    @Column(name = "transaction_password_failed_attempts", nullable = false)
    private int transactionPasswordFailedAttempts;

    @Column(name = "transaction_password_locked_until")
    private Instant transactionPasswordLockedUntil;

    public int getTransactionPasswordFailedAttempts() { return transactionPasswordFailedAttempts; }
    public void setTransactionPasswordFailedAttempts(int v) { this.transactionPasswordFailedAttempts = v; }
    public Instant getTransactionPasswordLockedUntil() { return transactionPasswordLockedUntil; }
    public void setTransactionPasswordLockedUntil(Instant v) { this.transactionPasswordLockedUntil = v; }
```
(Match the existing annotation style on the neighboring `transactionPasswordHash` field.)

`AssociateRepository.java` add imports `jakarta.persistence.LockModeType`, `org.springframework.data.jpa.repository.Lock` and:
```java
    // Row lock so concurrent wrong-password attempts serialize and none is lost.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT a FROM Associate a WHERE a.id = :id")
    Optional<Associate> findByIdForUpdate(@Param("id") UUID id);
```

Exceptions:
```java
package com.plotchain.associate;

// Gated action attempted before any transaction password exists -> 409, UI routes to set-password.
public class TransactionPasswordNotSetException extends RuntimeException {
    public TransactionPasswordNotSetException() {
        super("Set a transaction password before performing this action");
    }
}
```
```java
package com.plotchain.associate;

import java.time.Instant;

// Too many wrong attempts -> 423 until lockedUntil.
public class TransactionPasswordLockedException extends RuntimeException {
    private final Instant lockedUntil;

    public TransactionPasswordLockedException(Instant lockedUntil) {
        super("Transaction password is locked until " + lockedUntil);
        this.lockedUntil = lockedUntil;
    }

    public Instant getLockedUntil() { return lockedUntil; }
}
```
```java
package com.plotchain.associate;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

@RestControllerAdvice
public class TransactionPasswordExceptionHandler {

    @ExceptionHandler(TransactionPasswordNotSetException.class)
    public ResponseEntity<Map<String, String>> handleNotSet(TransactionPasswordNotSetException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
            .body(Map.of("error", ex.getMessage(), "code", "TRANSACTION_PASSWORD_NOT_SET"));
    }

    @ExceptionHandler(TransactionPasswordLockedException.class)
    public ResponseEntity<Map<String, String>> handleLocked(TransactionPasswordLockedException ex) {
        return ResponseEntity.status(HttpStatus.LOCKED).body(Map.of(
            "error", ex.getMessage(),
            "code", "TRANSACTION_PASSWORD_LOCKED",
            "lockedUntil", ex.getLockedUntil().toString()));
    }
}
```
`AssociateProvisioningExceptionHandler.java:55` body becomes `Map.of("error", ex.getMessage(), "code", "TRANSACTION_PASSWORD_INVALID")`.

- [ ] **Step 4: Run to verify pass, and nothing else broke**

Run: `cd backend && mvn -q test -Dtest='TransactionPasswordExceptionHandlerTest,AssociateRepositoryTest,PlotBookingSchemaTest'`
Expected: PASS (schema loads with V44; H2 accepts the migration).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/resources/db/migration/V44__transaction_password_lockout.sql backend/src/main/java/com/plotchain/associate backend/src/test/java/com/plotchain/associate/TransactionPasswordExceptionHandlerTest.java
git commit -m "feat(txn-password): lockout columns, locked/not-set exceptions and handlers"
```

---

### Task 2: Attempt recorder, guard, and swap profile/nominee gates

**Files:**
- Create: `.../associate/TransactionPasswordAttemptRecorder.java`, `TransactionPasswordGuard.java`
- Delete: `.../associate/TransactionPasswordVerifier.java`, `backend/src/test/.../TransactionPasswordVerifierTest.java`
- Modify: `.../associate/AssociateProfileService.java:32-33`, `AssociateNomineeService.java:35-38` (constructors + call sites)
- Modify tests: `AssociateProfileServiceTest.java`, `AssociateNomineeServiceTest.java` (replace verifier mock with guard mock)
- Test: `TransactionPasswordAttemptRecorderTest.java`, `TransactionPasswordGuardTest.java`, `TransactionPasswordLockoutIntegrationTest.java`

**Interfaces:**
- Consumes: Task 1 entity fields, `findByIdForUpdate`, both exceptions.
- Produces: `TransactionPasswordGuard.require(UUID associateId, String supplied): void` (throws `TransactionPasswordNotSetException`, `TransactionPasswordLockedException`, `InvalidTransactionPasswordException`); `TransactionPasswordAttemptRecorder.recordFailure(UUID)`, `.reset(UUID)`.

- [ ] **Step 1: Write failing recorder test**

```java
package com.plotchain.associate;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class TransactionPasswordAttemptRecorderTest {

    static final Instant NOW = Instant.parse("2026-10-10T12:00:00Z");
    AssociateRepository repo = mock(AssociateRepository.class);
    TransactionPasswordAttemptRecorder recorder =
        new TransactionPasswordAttemptRecorder(repo, Clock.fixed(NOW, ZoneOffset.UTC));
    UUID id = UUID.randomUUID();
    Associate associate = new Associate();

    @BeforeEach
    void setUp() {
        when(repo.findByIdForUpdate(id)).thenReturn(Optional.of(associate));
    }

    @Test
    void failureIncrementsCounter() {
        recorder.recordFailure(id);

        assertThat(associate.getTransactionPasswordFailedAttempts()).isEqualTo(1);
        assertThat(associate.getTransactionPasswordLockedUntil()).isNull();
    }

    @Test
    void fifthFailureLocksForThirtyMinutesAndResetsCounter() {
        associate.setTransactionPasswordFailedAttempts(4);

        recorder.recordFailure(id);

        assertThat(associate.getTransactionPasswordLockedUntil()).isEqualTo(NOW.plusSeconds(30 * 60));
        assertThat(associate.getTransactionPasswordFailedAttempts()).isZero();
    }

    @Test
    void failureWhileAlreadyLockedChangesNothing() {
        associate.setTransactionPasswordLockedUntil(NOW.plusSeconds(60));

        recorder.recordFailure(id);

        assertThat(associate.getTransactionPasswordFailedAttempts()).isZero();
        assertThat(associate.getTransactionPasswordLockedUntil()).isEqualTo(NOW.plusSeconds(60));
    }

    @Test
    void failureAfterExpiredLockStartsFreshCount() {
        associate.setTransactionPasswordLockedUntil(NOW.minusSeconds(1));
        associate.setTransactionPasswordFailedAttempts(0);

        recorder.recordFailure(id);

        assertThat(associate.getTransactionPasswordFailedAttempts()).isEqualTo(1);
        assertThat(associate.getTransactionPasswordLockedUntil()).isNull();
    }

    @Test
    void resetClearsCounterAndLock() {
        associate.setTransactionPasswordFailedAttempts(3);
        associate.setTransactionPasswordLockedUntil(NOW.minusSeconds(5));

        recorder.reset(id);

        assertThat(associate.getTransactionPasswordFailedAttempts()).isZero();
        assertThat(associate.getTransactionPasswordLockedUntil()).isNull();
    }
}
```

- [ ] **Step 2: Run to verify fail**

Run: `cd backend && mvn -q test -Dtest=TransactionPasswordAttemptRecorderTest`
Expected: compilation FAIL.

- [ ] **Step 3: Implement recorder**

```java
package com.plotchain.associate;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.UUID;

// Separate bean (not a method on the guard) so @Transactional(REQUIRES_NEW) goes through the Spring
// proxy: the counter write must commit even when the caller's transaction rolls back because the
// gated request failed. findByIdForUpdate serializes concurrent wrong attempts.
@Component
public class TransactionPasswordAttemptRecorder {

    static final int MAX_ATTEMPTS = 5;
    static final long LOCK_SECONDS = 30 * 60;

    private final AssociateRepository associateRepository;
    private final Clock clock;

    public TransactionPasswordAttemptRecorder(AssociateRepository associateRepository, Clock clock) {
        this.associateRepository = associateRepository;
        this.clock = clock;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordFailure(UUID associateId) {
        Associate a = associateRepository.findByIdForUpdate(associateId)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));
        Instant now = clock.instant();
        Instant lockedUntil = a.getTransactionPasswordLockedUntil();
        if (lockedUntil != null && lockedUntil.isAfter(now)) {
            return; // a concurrent attempt already locked it
        }
        a.setTransactionPasswordLockedUntil(null);
        int attempts = a.getTransactionPasswordFailedAttempts() + 1;
        if (attempts >= MAX_ATTEMPTS) {
            a.setTransactionPasswordLockedUntil(now.plusSeconds(LOCK_SECONDS));
            attempts = 0;
        }
        a.setTransactionPasswordFailedAttempts(attempts);
        associateRepository.save(a);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void reset(UUID associateId) {
        Associate a = associateRepository.findByIdForUpdate(associateId)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));
        a.setTransactionPasswordFailedAttempts(0);
        a.setTransactionPasswordLockedUntil(null);
        associateRepository.save(a);
    }
}
```

- [ ] **Step 4: Run recorder test, expect PASS**

Run: `cd backend && mvn -q test -Dtest=TransactionPasswordAttemptRecorderTest`

- [ ] **Step 5: Write failing guard test**

```java
package com.plotchain.associate;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TransactionPasswordGuardTest {

    static final Instant NOW = Instant.parse("2026-10-10T12:00:00Z");
    PasswordEncoder encoder = new BCryptPasswordEncoder();
    AssociateRepository repo = mock(AssociateRepository.class);
    TransactionPasswordAttemptRecorder recorder = mock(TransactionPasswordAttemptRecorder.class);
    TransactionPasswordGuard guard =
        new TransactionPasswordGuard(repo, encoder, recorder, Clock.fixed(NOW, ZoneOffset.UTC));
    UUID id = UUID.randomUUID();
    Associate associate = new Associate();

    @BeforeEach
    void setUp() {
        when(repo.findById(id)).thenReturn(Optional.of(associate));
    }

    @Test
    void throwsNotSetWhenNoHash() {
        assertThatThrownBy(() -> guard.require(id, "secret123"))
            .isInstanceOf(TransactionPasswordNotSetException.class);
        verify(recorder, never()).recordFailure(id);
    }

    @Test
    void throwsLockedWhileLockActive() {
        associate.setTransactionPasswordHash(encoder.encode("secret123"));
        associate.setTransactionPasswordLockedUntil(NOW.plusSeconds(10));

        assertThatThrownBy(() -> guard.require(id, "secret123"))
            .isInstanceOf(TransactionPasswordLockedException.class);
        verify(recorder, never()).recordFailure(id);
    }

    @Test
    void wrongPasswordRecordsFailureAndThrowsInvalid() {
        associate.setTransactionPasswordHash(encoder.encode("secret123"));

        assertThatThrownBy(() -> guard.require(id, "wrong"))
            .isInstanceOf(InvalidTransactionPasswordException.class);
        verify(recorder).recordFailure(id);
    }

    @Test
    void nullAndBlankCountAsFailures() {
        associate.setTransactionPasswordHash(encoder.encode("secret123"));

        assertThatThrownBy(() -> guard.require(id, null)).isInstanceOf(InvalidTransactionPasswordException.class);
        assertThatThrownBy(() -> guard.require(id, "   ")).isInstanceOf(InvalidTransactionPasswordException.class);
        verify(recorder, org.mockito.Mockito.times(2)).recordFailure(id);
    }

    @Test
    void correctPasswordWithCleanStateDoesNotTouchRecorder() {
        associate.setTransactionPasswordHash(encoder.encode("secret123"));

        assertThatCode(() -> guard.require(id, "secret123")).doesNotThrowAnyException();
        verify(recorder, never()).reset(id);
    }

    @Test
    void correctPasswordResetsDirtyCounter() {
        associate.setTransactionPasswordHash(encoder.encode("secret123"));
        associate.setTransactionPasswordFailedAttempts(3);

        guard.require(id, "secret123");

        verify(recorder).reset(id);
    }

    @Test
    void expiredLockIsTreatedAsUnlockedAndCleared() {
        associate.setTransactionPasswordHash(encoder.encode("secret123"));
        associate.setTransactionPasswordLockedUntil(NOW.minusSeconds(1));

        assertThatCode(() -> guard.require(id, "secret123")).doesNotThrowAnyException();
        verify(recorder).reset(id);
    }
}
```

- [ ] **Step 6: Run to verify fail**, then implement guard

Run: `cd backend && mvn -q test -Dtest=TransactionPasswordGuardTest` -> compilation FAIL.

```java
package com.plotchain.associate;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Instant;
import java.util.UUID;

// Single gate for every transaction-password-protected associate action. Not @Transactional on
// purpose: it only reads; all writes go through the recorder's own REQUIRES_NEW transactions.
// CALLERS MUST invoke require() BEFORE loading the Associate they later save, or that save() would
// write stale counter fields back over a reset.
@Component
public class TransactionPasswordGuard {

    private final AssociateRepository associateRepository;
    private final PasswordEncoder passwordEncoder;
    private final TransactionPasswordAttemptRecorder recorder;
    private final Clock clock;

    public TransactionPasswordGuard(AssociateRepository associateRepository, PasswordEncoder passwordEncoder,
                                    TransactionPasswordAttemptRecorder recorder, Clock clock) {
        this.associateRepository = associateRepository;
        this.passwordEncoder = passwordEncoder;
        this.recorder = recorder;
        this.clock = clock;
    }

    public void require(UUID associateId, String supplied) {
        Associate a = associateRepository.findById(associateId)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));
        String hash = a.getTransactionPasswordHash();
        if (hash == null) {
            throw new TransactionPasswordNotSetException();
        }
        Instant lockedUntil = a.getTransactionPasswordLockedUntil();
        if (lockedUntil != null && lockedUntil.isAfter(clock.instant())) {
            throw new TransactionPasswordLockedException(lockedUntil);
        }
        if (supplied == null || supplied.isBlank() || !passwordEncoder.matches(supplied, hash)) {
            recorder.recordFailure(associateId);
            throw new InvalidTransactionPasswordException("Transaction password is incorrect");
        }
        if (a.getTransactionPasswordFailedAttempts() > 0 || lockedUntil != null) {
            recorder.reset(associateId);
        }
    }
}
```

- [ ] **Step 7: Run guard test, expect PASS**

Run: `cd backend && mvn -q test -Dtest=TransactionPasswordGuardTest`

- [ ] **Step 8: Swap profile/nominee services to the guard**

In `AssociateProfileService`: replace field/ctor param `TransactionPasswordVerifier transactionPasswordVerifier` with `TransactionPasswordGuard transactionPasswordGuard`. In `updateProfile`, move the gate to the FIRST line, before `findById`:
```java
    public AssociateProfileResponse updateProfile(UUID associateId, UpdateAssociateProfileRequest request) {
        transactionPasswordGuard.require(associateId, request.transactionPassword());
        Associate associate = associateRepository.findById(associateId)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));
        // ... rest unchanged (delete the old requireIfSet line)
```
Same for `AssociateNomineeService.updateNominee`: guard first, keep the existence `findById` after it, delete the `requireIfSet` line. Update comments in both services and in `UpdateAssociateProfileRequest.java` / `UpdateAssociateNomineeRequest.java` to say the field is required (no bootstrapping skip); keep the field non-`@NotBlank` so an empty value yields the 401 INVALID path rather than a 400.

Delete `TransactionPasswordVerifier.java` and `TransactionPasswordVerifierTest.java`. In `AssociateProfileServiceTest` and `AssociateNomineeServiceTest`, replace `TransactionPasswordVerifier` mocks with `TransactionPasswordGuard` mocks and `verify(guard).require(associateId, "<pw>")`; add one test per service: when the guard mock throws `InvalidTransactionPasswordException`, `associateRepository.save` is never invoked.

- [ ] **Step 9: Write the integration test (rollback survival, stale-overwrite)**

`backend/src/test/java/com/plotchain/associate/TransactionPasswordLockoutIntegrationTest.java`, same annotations/cleanup style as `KycReviewServiceIntegrationTest` (`@SpringBootTest @ActiveProfiles("test")`, delete the seeded row in `@AfterEach`). Seed a row exactly like `seedAdminActor()` there but with role ASSOCIATE, status ACTIVE, `userId = "tp-" + id`, `passwordHash` = any 60-char value, and `transactionPasswordHash = encoder.encode("secret123")`.

```java
    @Test
    void failedAttemptsPersistAndFifthLocks() {
        UUID id = seedAssociate();
        for (int i = 0; i < 4; i++) {
            assertThatThrownBy(() -> guard.require(id, "wrong")).isInstanceOf(InvalidTransactionPasswordException.class);
        }
        assertThat(associateRepository.findById(id).orElseThrow().getTransactionPasswordFailedAttempts()).isEqualTo(4);

        assertThatThrownBy(() -> guard.require(id, "wrong")).isInstanceOf(InvalidTransactionPasswordException.class);

        assertThatThrownBy(() -> guard.require(id, "secret123")).isInstanceOf(TransactionPasswordLockedException.class);
    }

    @Test
    void failureCommitsEvenWhenCallerTransactionRollsBack() {
        UUID id = seedAssociate();
        TransactionTemplate tx = new TransactionTemplate(txManager);

        assertThatThrownBy(() -> tx.executeWithoutResult(s -> guard.require(id, "wrong")))
            .isInstanceOf(InvalidTransactionPasswordException.class);

        assertThat(associateRepository.findById(id).orElseThrow().getTransactionPasswordFailedAttempts()).isEqualTo(1);
    }

    @Test
    void successAfterFailuresResetsCounterAndLaterSaveDoesNotRestoreIt() {
        UUID id = seedAssociate();
        assertThatThrownBy(() -> guard.require(id, "wrong")).isInstanceOf(InvalidTransactionPasswordException.class);
        assertThatThrownBy(() -> guard.require(id, "wrong")).isInstanceOf(InvalidTransactionPasswordException.class);

        guard.require(id, "secret123");
        Associate fresh = associateRepository.findById(id).orElseThrow();
        associateRepository.save(fresh); // what a profile save does after the guard

        assertThat(associateRepository.findById(id).orElseThrow().getTransactionPasswordFailedAttempts()).isZero();
    }
```
Autowire `TransactionPasswordGuard guard`, `AssociateRepository associateRepository`, `PlatformTransactionManager txManager`, `PasswordEncoder encoder`.

- [ ] **Step 10: Run all touched tests**

Run: `cd backend && mvn -q test -Dtest='TransactionPassword*Test,TransactionPasswordLockoutIntegrationTest,AssociateProfileServiceTest,AssociateNomineeServiceTest,AssociateProfileControllerTest,AssociateNomineeControllerTest'`
Expected: PASS. If a controller test posts a profile/nominee PUT with no transaction password for an associate without one, update it to expect 409 `TRANSACTION_PASSWORD_NOT_SET` (deliberate behavior change per spec Rollout note).

- [ ] **Step 11: Commit**

```bash
git add -A backend/src
git commit -m "feat(txn-password): guard with REQUIRES_NEW lockout recorder; gate profile and nominee saves"
```

---

### Task 3: Gate E-PIN redeem and transfer

**Files:**
- Modify: `backend/src/main/java/com/plotchain/epin/AssociateRedeemEPinRequest.java`, `TransferEPinRequest.java`, `AssociateEPinController.java:38-48`
- Test: `backend/src/test/java/com/plotchain/epin/AssociateEPinControllerTest.java` (extend)

**Interfaces:**
- Consumes: `TransactionPasswordGuard.require(UUID, String)`.
- Produces: request records `AssociateRedeemEPinRequest(@NotBlank String userId, String transactionPassword)` and `TransferEPinRequest(@NotBlank String toUserId, String transactionPassword)`.

Controller (not service) calls the guard, so the guard runs before the service's transaction opens and before any pin row is locked. Field is not `@NotBlank` on purpose: blank must reach the guard and count as an attempt.

- [ ] **Step 1: Write failing tests** (append to `AssociateEPinControllerTest`; existing redeem/transfer tests that post without the field must be updated in step 4)

Add `@MockBean TransactionPasswordGuard guard;` then:
```java
    @Test
    void redeemRejectsWhenGuardRejects() throws Exception {
        Associate caller = associate(AssociateRole.ASSOCIATE);
        UUID pinId = UUID.randomUUID();
        org.mockito.Mockito.doThrow(new com.plotchain.associate.InvalidTransactionPasswordException("bad"))
            .when(guard).require(caller.getId(), "wrong");

        mockMvc.perform(post("/api/associates/me/epins/" + pinId + "/redeem")
                .header("Authorization", "Bearer " + jwtService.generateToken(caller))
                .contentType("application/json")
                .content("{\"userId\":\"VP00002\",\"transactionPassword\":\"wrong\"}"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.code").value("TRANSACTION_PASSWORD_INVALID"));

        verify(epinRepository, org.mockito.Mockito.never()).findByIdForUpdate(any());
    }

    @Test
    void transferReturns409WhenPasswordNotSet() throws Exception {
        Associate caller = associate(AssociateRole.ASSOCIATE);
        org.mockito.Mockito.doThrow(new com.plotchain.associate.TransactionPasswordNotSetException())
            .when(guard).require(caller.getId(), null);

        mockMvc.perform(post("/api/associates/me/epins/" + UUID.randomUUID() + "/transfer")
                .header("Authorization", "Bearer " + jwtService.generateToken(caller))
                .contentType("application/json")
                .content("{\"toUserId\":\"VP00002\"}"))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("TRANSACTION_PASSWORD_NOT_SET"));
    }

    @Test
    void redeemReturns423WhenLocked() throws Exception {
        Associate caller = associate(AssociateRole.ASSOCIATE);
        org.mockito.Mockito.doThrow(new com.plotchain.associate.TransactionPasswordLockedException(java.time.Instant.parse("2026-10-10T12:30:00Z")))
            .when(guard).require(caller.getId(), "x");

        mockMvc.perform(post("/api/associates/me/epins/" + UUID.randomUUID() + "/redeem")
                .header("Authorization", "Bearer " + jwtService.generateToken(caller))
                .contentType("application/json")
                .content("{\"userId\":\"VP00002\",\"transactionPassword\":\"x\"}"))
            .andExpect(status().isLocked())
            .andExpect(jsonPath("$.lockedUntil").value("2026-10-10T12:30:00Z"));
    }
```
(Use whatever token helper the existing tests in that file use in place of `jwtService.generateToken(caller)` - copy their call exactly.)

- [ ] **Step 2: Run to verify fail**

Run: `cd backend && mvn -q test -Dtest=AssociateEPinControllerTest`
Expected: FAIL (guard never called; field unknown).

- [ ] **Step 3: Implement**

```java
public record AssociateRedeemEPinRequest(@NotBlank String userId, String transactionPassword) {}
public record TransferEPinRequest(@NotBlank String toUserId, String transactionPassword) {}
```
`AssociateEPinController`: add `private final TransactionPasswordGuard transactionPasswordGuard;` (ctor), and as the first statement in `redeem` and `transfer`:
```java
        transactionPasswordGuard.require(associateId, request.transactionPassword());
```
`TransferEPinRequest` is also used by the admin controller? Check `grep -rn TransferEPinRequest backend/src/main`; if the admin side reuses it, give the associate controller its own `AssociateTransferEPinRequest` instead and leave the admin record untouched.

- [ ] **Step 4: Update pre-existing redeem/transfer tests** in `AssociateEPinControllerTest` (and `EPinServiceTest` if it builds these records) to send `transactionPassword` and rely on the `@MockBean` guard no-op, then run:

Run: `cd backend && mvn -q test -Dtest='AssociateEPinControllerTest,EPinServiceTest,EPinControllerTest'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A backend/src
git commit -m "feat(txn-password): require transaction password for associate E-PIN redeem and transfer"
```

---

### Task 4: Lockout-aware set/change with differs-from-login rule

**Files:**
- Modify: `backend/src/main/java/com/plotchain/associate/TransactionPasswordService.java`
- Test: `backend/src/test/java/com/plotchain/associate/TransactionPasswordServiceTest.java` (rewrite affected cases)

**Interfaces:**
- Consumes: `TransactionPasswordGuard.require`.
- Produces: `TransactionPasswordService(AssociateRepository, PasswordEncoder, TransactionPasswordGuard)` constructor; `setPassword` behavior per spec section 3. New exception: `TransactionPasswordSameAsLoginException` -> 400 handled in `TransactionPasswordExceptionHandler` with code `TRANSACTION_PASSWORD_SAME_AS_LOGIN`.

- [ ] **Step 1: Write failing tests** (add to `TransactionPasswordServiceTest`; construct service with a mocked guard)

```java
    @Test
    void firstTimeSetSkipsGuard() {
        when(repo.findById(id)).thenReturn(Optional.of(associate)); // hash null, passwordHash = encoder.encode("login-pass")

        service.setPassword(id, new SetTransactionPasswordRequest(null, "txn-pass-1"));

        verify(guard, never()).require(any(), any());
        assertThat(encoder.matches("txn-pass-1", associate.getTransactionPasswordHash())).isTrue();
    }

    @Test
    void changeVerifiesCurrentViaGuardThenSavesWithCleanCounters() {
        associate.setTransactionPasswordHash(encoder.encode("old-txn"));
        associate.setTransactionPasswordFailedAttempts(2);
        when(repo.findById(id)).thenReturn(Optional.of(associate));

        service.setPassword(id, new SetTransactionPasswordRequest("old-txn", "new-txn-1"));

        InOrder order = inOrder(guard, repo);
        order.verify(guard).require(id, "old-txn");
        order.verify(repo).save(associate);
        assertThat(associate.getTransactionPasswordFailedAttempts()).isZero();
        assertThat(associate.getTransactionPasswordLockedUntil()).isNull();
        assertThat(encoder.matches("new-txn-1", associate.getTransactionPasswordHash())).isTrue();
    }

    @Test
    void changeWithGuardRejectionLeavesHashUnchanged() {
        associate.setTransactionPasswordHash(encoder.encode("old-txn"));
        when(repo.findById(id)).thenReturn(Optional.of(associate));
        doThrow(new InvalidTransactionPasswordException("bad")).when(guard).require(id, "nope");

        assertThatThrownBy(() -> service.setPassword(id, new SetTransactionPasswordRequest("nope", "new-txn-1")))
            .isInstanceOf(InvalidTransactionPasswordException.class);
        verify(repo, never()).save(any());
    }

    @Test
    void rejectsNewPasswordEqualToLoginPassword() {
        when(repo.findById(id)).thenReturn(Optional.of(associate)); // login password "login-pass"

        assertThatThrownBy(() -> service.setPassword(id, new SetTransactionPasswordRequest(null, "login-pass")))
            .isInstanceOf(TransactionPasswordSameAsLoginException.class);
        verify(repo, never()).save(any());
    }
```
Existing tests that expected the old "Current transaction password is incorrect" inline check: replace with the guard-mock cases above.

- [ ] **Step 2: Run to verify fail**

Run: `cd backend && mvn -q test -Dtest=TransactionPasswordServiceTest` -> compile FAIL.

- [ ] **Step 3: Implement**

`TransactionPasswordSameAsLoginException extends RuntimeException` with message "Transaction password must differ from your login password"; add to `TransactionPasswordExceptionHandler`:
```java
    @ExceptionHandler(TransactionPasswordSameAsLoginException.class)
    public ResponseEntity<Map<String, String>> handleSameAsLogin(TransactionPasswordSameAsLoginException ex) {
        return ResponseEntity.badRequest()
            .body(Map.of("error", ex.getMessage(), "code", "TRANSACTION_PASSWORD_SAME_AS_LOGIN"));
    }
```
`TransactionPasswordService.setPassword`:
```java
    @Transactional
    public void setPassword(UUID associateId, SetTransactionPasswordRequest request) {
        Associate associate = associateRepository.findById(associateId)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));
        // Changing an existing password: verify the current one (lockout-aware). The guard's reset
        // commits in its own transaction, so this entity's counters are stale -- cleared below.
        if (associate.getTransactionPasswordHash() != null) {
            transactionPasswordGuard.require(associateId, request.currentTransactionPassword());
        }
        if (passwordEncoder.matches(request.newTransactionPassword(), associate.getPasswordHash())) {
            throw new TransactionPasswordSameAsLoginException();
        }
        associate.setTransactionPasswordHash(passwordEncoder.encode(request.newTransactionPassword()));
        associate.setTransactionPasswordFailedAttempts(0);
        associate.setTransactionPasswordLockedUntil(null);
        associateRepository.save(associate);
    }
``` Add the guard to the constructor.

- [ ] **Step 4: Run, expect PASS**

Run: `cd backend && mvn -q test -Dtest='TransactionPasswordServiceTest,TransactionPasswordControllerTest,TransactionPasswordLockoutIntegrationTest'`

- [ ] **Step 5: Commit**

```bash
git add -A backend/src
git commit -m "feat(txn-password): lockout-aware change, reject password equal to login password"
```

---

### Task 5: Admin reset endpoint

**Files:**
- Modify: `.../associate/AdminAssociateService.java` (after `resetPassword`, ~line 115), `AdminAssociateController.java` (after line 59)
- Test: `AdminAssociateServiceTest.java`, `AdminAssociateControllerTest.java` (extend)

**Interfaces:**
- Produces: `AdminAssociateService.resetTransactionPassword(UUID id, UUID actorId): void`.

- [ ] **Step 1: Write failing tests**

Service (mirror the existing `resetPassword` test's setup in `AdminAssociateServiceTest`):
```java
    @Test
    void resetTransactionPasswordClearsHashCounterLockAndAudits() {
        associate.setTransactionPasswordHash("hash");
        associate.setTransactionPasswordFailedAttempts(3);
        associate.setTransactionPasswordLockedUntil(Instant.now().plusSeconds(600));

        service.resetTransactionPassword(associate.getId(), actorId);

        assertThat(associate.getTransactionPasswordHash()).isNull();
        assertThat(associate.getTransactionPasswordFailedAttempts()).isZero();
        assertThat(associate.getTransactionPasswordLockedUntil()).isNull();
        verify(associateRepository).save(associate);
        verify(settingsAuditService).record(eq("ASSOCIATE"), contains("Reset transaction password"), any(), eq(actorId));
    }
```
Controller (mirror existing reset-password controller tests for token/role helpers): admin -> 204; plain associate token -> 403.

- [ ] **Step 2: Run to verify fail**; **Step 3: Implement**

```java
    @Transactional
    public void resetTransactionPassword(UUID id, UUID actorId) {
        Associate associate = findOrThrow(id);
        associate.setTransactionPasswordHash(null);
        associate.setTransactionPasswordFailedAttempts(0);
        associate.setTransactionPasswordLockedUntil(null);
        associateRepository.save(associate);
        settingsAuditService.record("ASSOCIATE", "Reset transaction password for " + associate.getUserId(),
            Map.of("associateId", id.toString()), actorId);
    }
```
```java
    @PostMapping("/{id}/reset-transaction-password")
    @PreAuthorize("hasAuthority('ADMIN')")
    public ResponseEntity<Void> resetTransactionPassword(@PathVariable UUID id, @AuthenticationPrincipal UUID actorId) {
        adminAssociateService.resetTransactionPassword(id, actorId);
        return ResponseEntity.noContent().build();
    }
```
(import `ResponseEntity`.) No `SecurityConfig` change: the blanket admin POST rule already covers `/api/admin/associates/**`.

- [ ] **Step 4: Run, expect PASS**

Run: `cd backend && mvn -q test -Dtest='AdminAssociateServiceTest,AdminAssociateControllerTest'`

- [ ] **Step 5: Commit**

```bash
git add -A backend/src
git commit -m "feat(txn-password): admin reset-transaction-password endpoint"
```

---

### Task 6: Frontend - interceptor and E-PIN dialog

**Files:**
- Modify: `frontend/src/app/auth/auth.interceptor.ts`, `epins/epins.service.ts`, `epins/epins.component.ts`
- Modify: `frontend/src/assets/i18n/en.json`, `hi.json`
- Test: `auth/auth.interceptor.spec.ts`, `epins/epins.service.spec.ts`, `epins/epins.component.spec.ts`

**Interfaces:**
- Consumes: backend `code` values and 401/409/423 statuses from Tasks 1-3.
- Produces: `EPinsService.redeem(id, userId, transactionPassword)`, `.transfer(id, toUserId, transactionPassword)`.

- [ ] **Step 1: Write failing tests**

`auth.interceptor.spec.ts` - an E-PIN redeem 401 must not log out:
```ts
  it('does not log out on 401 from e-pin redeem or transfer (bad transaction password)', () => {
    for (const action of ['redeem', 'transfer']) {
      http.post(`/api/associates/me/epins/abc-123/${action}`, {}).subscribe({ error: () => undefined });
      httpMock.expectOne(`/api/associates/me/epins/abc-123/${action}`).flush({}, { status: 401, statusText: 'Unauthorized' });
    }
    expect(authService.logout).not.toHaveBeenCalled();
  });
```
(Use the spec's existing `http`/`httpMock`/`authService` spy names.)

`epins.service.spec.ts`:
```ts
  it('redeem posts userId and transactionPassword', () => {
    service.redeem('p1', 'VP00002', 'secret1').subscribe();
    const req = httpMock.expectOne('/api/associates/me/epins/p1/redeem');
    expect(req.request.body).toEqual({ userId: 'VP00002', transactionPassword: 'secret1' });
    req.flush({});
  });
  it('transfer posts toUserId and transactionPassword', () => {
    service.transfer('p1', 'VP00002', 'secret1').subscribe();
    const req = httpMock.expectOne('/api/associates/me/epins/p1/transfer');
    expect(req.request.body).toEqual({ toUserId: 'VP00002', transactionPassword: 'secret1' });
    req.flush({});
  });
```
`epins.component.spec.ts`: (a) confirm with empty password sets `actionError = 'epins.errorPasswordRequired'` and makes no HTTP call; (b) 401 -> `'epins.errorPasswordInvalid'`; (c) 409 with `error.code === 'TRANSACTION_PASSWORD_NOT_SET'` -> `'epins.errorPasswordNotSet'`; (d) 423 -> `'epins.errorPasswordLocked'` and `lockedUntil` stored; (e) 409 without that code keeps `'epins.errorConflict'`; (f) password input cleared after success and after any error.

- [ ] **Step 2: Run to verify fail**

Run: `cd frontend && npx ng test --watch=false --include='src/app/auth/auth.interceptor.spec.ts' --include='src/app/epins/**/*.spec.ts'`

- [ ] **Step 3: Implement**

Interceptor: allow regex paths.
```ts
const EXPECTED_401_ROUTES: { method: string; path: string | RegExp }[] = [
  // ...existing entries unchanged...
  { method: 'POST', path: /\/api\/associates\/me\/epins\/[^/]+\/(redeem|transfer)$/ }
];
// in catchError:
const isExpected401Route = EXPECTED_401_ROUTES.some(route =>
  route.method === req.method &&
  (typeof route.path === 'string' ? req.url.includes(route.path) : route.path.test(req.url)));
```
`EPinsService`:
```ts
  redeem(id: string, userId: string, transactionPassword: string): Observable<EPin> {
    return this.http.post<EPin>(`/api/associates/me/epins/${id}/redeem`, { userId, transactionPassword });
  }
  transfer(id: string, toUserId: string, transactionPassword: string): Observable<EPin> {
    return this.http.post<EPin>(`/api/associates/me/epins/${id}/transfer`, { toUserId, transactionPassword });
  }
```
`EPinsComponent`: add `passwordInput = ''` (reset in `startAction`), a password field in the form template under the user-id label:
```html
          <label>{{ 'epins.passwordLabel' | translate }}
            <input type="password" name="transactionPassword" autocomplete="off" [(ngModel)]="passwordInput" />
          </label>
```
and in `confirmAction`: after the userId check,
```ts
    const password = this.passwordInput;
    if (!password.trim()) { this.actionError = 'epins.errorPasswordRequired'; return; }
    ...
    const call = this.action === 'activate'
      ? this.service.redeem(pin.id, userId, password)
      : this.service.transfer(pin.id, userId, password);
    call.subscribe({
      next: () => { this.userIdInput = ''; this.passwordInput = ''; this.load(); },
      error: (e: HttpErrorResponse) => {
        this.passwordInput = '';
        const code = e.error?.code;
        this.actionError = e.status === 401 ? 'epins.errorPasswordInvalid'
          : e.status === 423 ? 'epins.errorPasswordLocked'
          : e.status === 409 && code === 'TRANSACTION_PASSWORD_NOT_SET' ? 'epins.errorPasswordNotSet'
          : e.status === 404 ? 'epins.errorNotFound'
          : e.status === 409 ? 'epins.errorConflict'
          : 'epins.errorGeneric';
        this.lockedUntil = e.status === 423 ? e.error?.lockedUntil ?? null : null;
      }
    });
```
Add `lockedUntil: string | null = null;` and render under the banner when set: `{{ 'epins.lockedUntilHint' | translate: { time: datePipe.transform(lockedUntil, 'shortTime') } }}`.

i18n (`en.json`, `epins` block; give `hi.json` Hindi equivalents): `passwordLabel` "Transaction password", `errorPasswordRequired` "Enter your transaction password.", `errorPasswordInvalid` "Incorrect transaction password.", `errorPasswordNotSet` "Set a transaction password in My Account first.", `errorPasswordLocked` "Too many wrong attempts. Transaction password is locked.", `lockedUntilHint` "Try again after {{time}}."

- [ ] **Step 4: Run, expect PASS**; also `npx ng build` compiles.

- [ ] **Step 5: Commit**

```bash
git add -A frontend/src
git commit -m "feat(txn-password): e-pin dialog collects transaction password; interceptor keeps session on 401"
```

---

### Task 7: Frontend - my-account errors, profile/nominee gate messages, admin reset action

**Files:**
- Modify: `frontend/src/app/my-account/my-account.component.ts` (profile save, nominee save, `onTransactionPasswordSubmit` error handlers near line 810), `admin/associate-directory/associate-directory.service.ts`, `associate-directory.component.ts`, `i18n/en.json`, `hi.json`
- Test: `my-account/my-account.component.spec.ts`, `admin/associate-directory/associate-directory.service.spec.ts`, `associate-directory.component.spec.ts`

**Interfaces:**
- Produces: `AssociateDirectoryService.resetTransactionPassword(id: string): Observable<void>`.

- [ ] **Step 1: Write failing tests**

Service: `resetTransactionPassword('a1')` POSTs `/api/admin/associates/a1/reset-transaction-password` with `{}`.
Component (admin): clicking the new button calls the service for `selected.id`, then shows `admin.associateDirectory.resetTransactionPasswordDone` banner; service error sets `actionError = true`.
My-account: for each of the three save handlers (profile, nominee, change-transaction-password), map errors by `status`/`error.code`: 409 `TRANSACTION_PASSWORD_NOT_SET` -> `myAccount.transactionPasswordTab.errorNotSet` and switch `profileSubTab = 'transactionPassword'`; 423 -> `myAccount.transactionPasswordTab.errorLocked`; 401 -> `myAccount.transactionPasswordTab.errorInvalid`; 400 with code `TRANSACTION_PASSWORD_SAME_AS_LOGIN` -> `myAccount.transactionPasswordTab.errorSameAsLogin`; otherwise the existing generic message.

- [ ] **Step 2: Run to verify fail**

Run: `cd frontend && npx ng test --watch=false --include='src/app/my-account/**/*.spec.ts' --include='src/app/admin/associate-directory/**/*.spec.ts'`

- [ ] **Step 3: Implement**

`AssociateDirectoryService`:
```ts
  resetTransactionPassword(id: string): Observable<void> {
    return this.http.post<void>(`/api/admin/associates/${id}/reset-transaction-password`, {});
  }
```
`associate-directory.component.ts`: add next to the reset-password button
```html
          <button type="button" class="brand-button brand-button--secondary" (click)="resetTransactionPasswordForSelected()">
            {{ 'admin.associateDirectory.resetTransactionPasswordAction' | translate }}
          </button>
```
and
```ts
  resetTransactionPasswordForSelected(): void {
    if (!this.selected) return;
    this.actionError = false;
    this.transactionPasswordResetDone = false;
    this.associateDirectoryService.resetTransactionPassword(this.selected.id).subscribe({
      next: () => (this.transactionPasswordResetDone = true),
      error: () => (this.actionError = true)
    });
  }
```
with a success `app-inline-banner` bound to `transactionPasswordResetDone` using the existing `temporaryPassword` banner as the layout model.

`my-account.component.ts`: add one private helper and use it in all three error callbacks:
```ts
  private transactionPasswordErrorMessage(e: HttpErrorResponse, fallbackKey: string): string {
    const code = e.error?.code;
    if (e.status === 409 && code === 'TRANSACTION_PASSWORD_NOT_SET') {
      this.profileSubTab = 'transactionPassword';
      return this.translate.instant('myAccount.transactionPasswordTab.errorNotSet');
    }
    if (e.status === 423) return this.translate.instant('myAccount.transactionPasswordTab.errorLocked');
    if (e.status === 401) return this.translate.instant('myAccount.transactionPasswordTab.errorInvalid');
    if (code === 'TRANSACTION_PASSWORD_SAME_AS_LOGIN') return this.translate.instant('myAccount.transactionPasswordTab.errorSameAsLogin');
    return this.translate.instant(fallbackKey);
  }
```
Wire it in the existing error callbacks (the one at ~line 810 uses fallback `myAccount.transactionPasswordTab.saveError`; use the profile/nominee equivalents already in those handlers as fallbacks).

i18n additions (en; hi equivalents): `myAccount.transactionPasswordTab.errorNotSet` "Set a transaction password first.", `errorLocked` "Transaction password is locked after too many wrong attempts. Try again later or ask an admin to reset it.", `errorInvalid` "Incorrect transaction password.", `errorSameAsLogin` "Transaction password must differ from your login password."; `admin.associateDirectory.resetTransactionPasswordAction` "Reset transaction password", `resetTransactionPasswordDone` "Transaction password cleared. The associate must set a new one."

- [ ] **Step 4: Run full frontend suite and build**

Run: `cd frontend && npx ng test --watch=false && npx ng build`
Expected: PASS, build succeeds. Existing unrelated uncommitted edits in `admin-nav-categories*`, `admin-sidebar*`, `en.json`, `hi.json` belong to the user: stage only the lines this task changes (`git add -p` for the two i18n files), never `git add -A` on them.

- [ ] **Step 5: Commit**

```bash
git add -p frontend/src/assets/i18n/en.json frontend/src/assets/i18n/hi.json
git add frontend/src/app/my-account frontend/src/app/admin/associate-directory
git commit -m "feat(txn-password): my-account error messages and admin reset action"
```

---

## Self-Review

- Spec coverage: data (T1), guard + ordering of checks + REQUIRES_NEW + row lock (T2), gated endpoints E-PIN (T3) / profile+nominee (T2), set/change lock-aware + differs-from-login (T4), admin reset + audit (T5), frontend interceptor/dialogs/admin action/i18n (T6-7), tests per spec section 6 (each task). Rollout note covered by T2 step 10.
- Type consistency: `require(UUID, String)`, `recordFailure(UUID)`, `reset(UUID)`, `findByIdForUpdate(UUID)`, `resetTransactionPassword(UUID, UUID)` used identically across tasks.
- Task 3 note: uses `@MockBean` guard in the controller test, so the lockout logic itself is only exercised in T2; T3 only proves wiring and status mapping.
- Task 1 migration column type must be matched to existing `joined_at` type before commit (flagged in step).
