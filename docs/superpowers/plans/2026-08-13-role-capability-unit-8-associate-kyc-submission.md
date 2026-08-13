# Role Capability Unit 8: Associate Can Submit KYC + View Own Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give an Associate a self-scoped way to submit their KYC documents and view their own KYC status, without touching the existing admin-only KYC review queue (`GET/POST /api/admin/kyc`, `decide()`).

**Architecture:** One new table (`associate_kyc_document`, one row per associate per document type, overwrite-on-resubmit) plus one new controller/service pair in the existing `com.plotchain.associate` package, following the exact self-scoped `@AuthenticationPrincipal`-derived pattern already used by `PasswordController` (`/api/associates/me/password`) and `DashboardController` (`/api/associates/me/dashboard`). File bytes are stored directly as a `BYTEA` column, mirroring `CompanyBranding`'s logo-storage convention (`company_branding.logo_square`/`logo_wide`) rather than inventing a new file-storage mechanism — this codebase has no S3/blob-store integration anywhere, byte-column-in-Postgres is the only precedent. Any successful document upload resets `associate.kyc_status` to `PENDING`, putting the associate back in the admin review queue regardless of prior state (first submission, resubmission after rejection, or new evidence after prior verification all funnel through the same one-line reset).

**Tech Stack:** Spring Boot (Java), Spring Data JPA, Spring Security (JWT bearer, `@AuthenticationPrincipal`), Flyway migrations, PostgreSQL (`BYTEA`) / H2 (tests), JUnit 5 + Mockito + MockMvc.

## Global Constraints

- Route(s) must fall under `/api/associates/me/*`, matching this codebase's established self-service naming convention (`/api/associates/me/password`, `/api/associates/me/dashboard`, `/api/associates/me/sales`).
- The target associate is always derived from the authenticated JWT principal (`@AuthenticationPrincipal UUID associateId`) — never from a path or query parameter. No caller can submit or view another associate's KYC data.
- The existing admin-only KYC review queue (`GET/POST /api/admin/kyc`, `KycReviewController.decide()`) is not modified in any way by this plan.
- Multipart upload size is already capped globally at `max-file-size: 2MB` / `max-request-size: 4MB` (`backend/src/main/resources/application.yml`) and `MaxUploadSizeExceededException` is already mapped to 413 by `ApiExceptionHandler` — no new config needed for either.
- Run backend tests with `cd backend && ./mvnw test`. This repo has a known JDK21/25 + Mockito environment quirk that produces ~55 spurious Mockito errors unrelated to any code change — if you see a wall of Mockito-related errors unrelated to the files this plan touches, that's the pre-existing environment issue, not a regression from this plan.
- **Migration number depends on unit 2 landing first**: this plan was originally written against master's then-current highest migration (`V17`), same as unit 2's plan (planned/implementing concurrently) — both independently picked `V18`, a real collision (Flyway won't tolerate two `V18`s). Renumbered to `V19` at the orchestrator checkpoint. **Do not implement this plan until unit 2 (`V18__seed_founding_admin.sql`) has actually merged to master** — confirm `ls backend/src/main/resources/db/migration/` shows `V18` present before creating this plan's `V19` file, and re-verify `V19` is still the next-free number (another unit may have landed in between) rather than trusting this note.

---

## Design decisions (read before implementing)

1. **Document storage shape**: a new table `associate_kyc_document`, one row per `(associate_id, document_type)` pair, `UNIQUE (associate_id, document_type)`. `document_type` is a free-form string (e.g. `AADHAAR`, `PAN`, `BANK_PASSBOOK` — the same vocabulary `KycConfig.requiredDocuments` in `com.plotchain.payments` already uses as admin-configured labels), **not** cross-validated against `KycConfig`'s configured list in this unit — that would add a new `associate` → `payments` package dependency for a check the acceptance criteria doesn't require. Documented here as a deliberate scope narrowing, not an oversight; a natural follow-up if product wants server-side enforcement of "only these document types are accepted."
2. **Resubmission semantics**: uploading the same `document_type` again overwrites the existing row (same id, new bytes/contentType/uploadedAt) rather than accumulating history — mirrors `CompanyBrandingService.uploadLogo`'s overwrite-in-place behavior for the logo columns.
3. **KYC status transition on upload**: every successful document upload unconditionally sets `associate.kycStatus = PENDING`, regardless of prior status. This covers three cases with one line: first-ever submission (already `PENDING` by construction — harmless no-op save), resubmission after `REJECTED` (puts the associate back in the review queue, which is the whole point of allowing resubmission), and a new upload after `VERIFIED` (new evidence should not silently keep a stale "verified" status — it needs a fresh admin look). No per-prior-state branching.
4. **Content-type allowlist**: `image/png`, `image/jpeg`, `image/webp`, `application/pdf` — ID-document scans are commonly PDF, unlike `CompanyBrandingService`'s logo-only `ALLOWED_LOGO_CONTENT_TYPES` (`image/png`, `image/jpeg`, `image/svg+xml`, `image/webp`), so this is its own constant, not a shared one.
5. **Route shape**: `GET /api/associates/me/kyc` (status + submitted-document metadata) and `POST /api/associates/me/kyc/documents/{documentType}` (multipart upload, field name `file`, mirroring `CompanyBrandingController.uploadLogo`'s `@RequestParam("file") MultipartFile file` convention). `{documentType}` is a plain path variable with no fixed-value constraint (unlike `CompanyBrandingController`'s `{variant:square|wide}`) because the admin-configured document list is open-ended, not a fixed two-value enum.
6. **Upload response shape**: returns `200 OK` with the just-written `KycDocumentSummary` (not `204 No Content` the way `CompanyBrandingController.uploadLogo` does) — this follows `KycReviewController.decide()`'s convention of returning the updated resource for a self-service state-changing write, which is the closer analogy (a write that changes a status field the caller will want to see immediately) than the logo case (where a separate `GET .../logo/{variant}` already exists to fetch bytes).
7. **No audit log entry**: `SettingsAuditService.record(...)` is used throughout this codebase for *admin*-driven back-office actions (KYC decisions, config changes) — not associate self-service writes. `AuthService.changePassword` (the other associate-initiated write) does not call it either. Consistent with that precedent, KYC document upload does not write an audit log entry.
8. **Security matcher**: only the `POST /api/associates/me/kyc/documents/{documentType}` route needs an explicit `SecurityConfig` matcher — `SecurityConfig.java` denies all `POST/PUT/PATCH/DELETE` under `/api/**` to non-`ADMIN` callers by a blanket rule (lines 114-121), so a narrower matcher must precede it, exactly like the existing `POST /api/associates/me/password` matcher (line 46) it sits next to. `GET /api/associates/me/kyc` needs **no** new matcher: bare `GET`s never collide with the blanket write rules and fall through to `anyRequest().authenticated()`, the same way `GET /api/associates/me/dashboard` and `GET /api/associates/me/sales` already do with no matcher of their own.
9. **`AssociateNotFoundException` already has a global handler**: `DashboardExceptionHandler` (`com.plotchain.dashboard`) maps it to 404, and `@RestControllerAdvice` beans register application-wide in Spring, not per-package (see the comment atop `SalesExceptionHandler` for the same reasoning already recorded in this codebase). `KycSubmissionService` reuses this exception for the "associate row vanished between JWT issuance and this request" edge case without adding a second handler.

## Files

- Create: `backend/src/main/resources/db/migration/V19__associate_kyc_document.sql`
- Create: `backend/src/main/java/com/plotchain/associate/AssociateKycDocument.java`
- Create: `backend/src/main/java/com/plotchain/associate/AssociateKycDocumentRepository.java`
- Create: `backend/src/main/java/com/plotchain/associate/KycDocumentSummary.java`
- Create: `backend/src/main/java/com/plotchain/associate/AssociateKycStatusResponse.java`
- Create: `backend/src/main/java/com/plotchain/associate/InvalidKycUploadException.java`
- Modify: `backend/src/main/java/com/plotchain/associate/AssociateProvisioningExceptionHandler.java`
- Create: `backend/src/main/java/com/plotchain/associate/KycSubmissionService.java`
- Test: `backend/src/test/java/com/plotchain/associate/KycSubmissionServiceTest.java`
- Create: `backend/src/main/java/com/plotchain/associate/KycSubmissionController.java`
- Modify: `backend/src/main/java/com/plotchain/auth/SecurityConfig.java`
- Test: `backend/src/test/java/com/plotchain/associate/KycSubmissionControllerTest.java`
- Modify: `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`

---

### Task 1: Data model — migration, entity, repository, DTOs, exception

**Files:**
- Create: `backend/src/main/resources/db/migration/V19__associate_kyc_document.sql`
- Create: `backend/src/main/java/com/plotchain/associate/AssociateKycDocument.java`
- Create: `backend/src/main/java/com/plotchain/associate/AssociateKycDocumentRepository.java`
- Create: `backend/src/main/java/com/plotchain/associate/KycDocumentSummary.java`
- Create: `backend/src/main/java/com/plotchain/associate/AssociateKycStatusResponse.java`
- Create: `backend/src/main/java/com/plotchain/associate/InvalidKycUploadException.java`
- Modify: `backend/src/main/java/com/plotchain/associate/AssociateProvisioningExceptionHandler.java`

**Interfaces:**
- Produces: `AssociateKycDocument` (entity: `getId/setId(UUID)`, `getAssociateId/setAssociateId(UUID)`, `getDocumentType/setDocumentType(String)`, `getContent/setContent(byte[])`, `getContentType/setContentType(String)`, `getUploadedAt/setUploadedAt(Instant)`), `AssociateKycDocumentRepository` (`findByAssociateIdAndDocumentType(UUID, String): Optional<AssociateKycDocument>`, `findByAssociateIdOrderByDocumentTypeAsc(UUID): List<AssociateKycDocument>`), `KycDocumentSummary(String documentType, String contentType, Instant uploadedAt)`, `AssociateKycStatusResponse(KycStatus kycStatus, List<KycDocumentSummary> documents)`, `InvalidKycUploadException(String message)`. Task 2 (`KycSubmissionService`) consumes all of these.

This task has no behavior of its own to unit-test — it's data-shape scaffolding, same as how `CompanyBranding`'s entity/migration were added without a dedicated test. Verified by a compile check; the shapes get exercised for real in Task 2's service tests.

- [ ] **Step 1: Write the migration**

Create `backend/src/main/resources/db/migration/V19__associate_kyc_document.sql`:

```sql
-- Role-capability unit 8: associate-facing KYC document submission
-- (docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md,
-- KYC row: "Own KYC submission + status only" -- the write half of KYC, alongside the existing
-- admin-only review queue in KycReviewController/KycReviewService). One row per
-- (associate, document type): resubmitting a given type overwrites the existing row rather
-- than accumulating history, matching V7's CompanyBranding logo-overwrite convention.
CREATE TABLE associate_kyc_document (
    id UUID PRIMARY KEY,
    associate_id UUID NOT NULL REFERENCES associate(id),
    document_type VARCHAR(50) NOT NULL,
    content BYTEA NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    uploaded_at TIMESTAMP NOT NULL,
    UNIQUE (associate_id, document_type)
);
CREATE INDEX idx_associate_kyc_document_associate_id ON associate_kyc_document(associate_id);
```

- [ ] **Step 2: Write the entity**

Create `backend/src/main/java/com/plotchain/associate/AssociateKycDocument.java`:

```java
package com.plotchain.associate;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "associate_kyc_document")
public class AssociateKycDocument {

    @Id
    private UUID id;

    @Column(name = "associate_id", nullable = false)
    private UUID associateId;

    @Column(name = "document_type", nullable = false)
    private String documentType;

    // Plain byte[] with no @Lob: Hibernate 6 maps an unannotated byte[] to VARBINARY, which
    // PostgreSQLDialect renders as bytea, matching the V19 column -- same reasoning as
    // CompanyBranding.logoSquare/logoWide. @Lob on a byte[] maps to BLOB instead, which
    // Postgres backs with oid large-object semantics, a mismatch that fails
    // ddl-auto: validate against a plain BYTEA column.
    @Column(name = "content", nullable = false)
    private byte[] content;

    @Column(name = "content_type", nullable = false)
    private String contentType;

    @Column(name = "uploaded_at", nullable = false)
    private Instant uploadedAt;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getAssociateId() { return associateId; }
    public void setAssociateId(UUID associateId) { this.associateId = associateId; }
    public String getDocumentType() { return documentType; }
    public void setDocumentType(String documentType) { this.documentType = documentType; }
    public byte[] getContent() { return content; }
    public void setContent(byte[] content) { this.content = content; }
    public String getContentType() { return contentType; }
    public void setContentType(String contentType) { this.contentType = contentType; }
    public Instant getUploadedAt() { return uploadedAt; }
    public void setUploadedAt(Instant uploadedAt) { this.uploadedAt = uploadedAt; }
}
```

- [ ] **Step 3: Write the repository**

Create `backend/src/main/java/com/plotchain/associate/AssociateKycDocumentRepository.java`:

```java
package com.plotchain.associate;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AssociateKycDocumentRepository extends JpaRepository<AssociateKycDocument, UUID> {

    Optional<AssociateKycDocument> findByAssociateIdAndDocumentType(UUID associateId, String documentType);

    List<AssociateKycDocument> findByAssociateIdOrderByDocumentTypeAsc(UUID associateId);
}
```

- [ ] **Step 4: Write the response DTOs**

Create `backend/src/main/java/com/plotchain/associate/KycDocumentSummary.java`:

```java
package com.plotchain.associate;

import java.time.Instant;

public record KycDocumentSummary(String documentType, String contentType, Instant uploadedAt) {}
```

Create `backend/src/main/java/com/plotchain/associate/AssociateKycStatusResponse.java`:

```java
package com.plotchain.associate;

import java.util.List;

public record AssociateKycStatusResponse(KycStatus kycStatus, List<KycDocumentSummary> documents) {}
```

- [ ] **Step 5: Write the exception and wire its handler**

Create `backend/src/main/java/com/plotchain/associate/InvalidKycUploadException.java`:

```java
package com.plotchain.associate;

// Covers "no documentType", "documentType too long", "empty file", and "unsupported content
// type" -- one failure mode ("this isn't an acceptable KYC document submission"), one
// exception, same shape as company.InvalidLogoUploadException for the logo-upload case.
public class InvalidKycUploadException extends RuntimeException {
    public InvalidKycUploadException(String message) {
        super(message);
    }
}
```

Add to `backend/src/main/java/com/plotchain/associate/AssociateProvisioningExceptionHandler.java` (this `@RestControllerAdvice` already handles `InvalidKycDecisionException` for the admin-side KYC flow — add the associate-side upload exception alongside it):

```java
    @ExceptionHandler(InvalidKycUploadException.class)
    public ResponseEntity<Map<String, String>> handleInvalidKycUpload(InvalidKycUploadException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", ex.getMessage()));
    }
```

- [ ] **Step 6: Verify it compiles**

Run: `cd backend && ./mvnw test-compile`
Expected: BUILD SUCCESS (no behavior to test yet — this only proves the new types and the migration/entity mapping are consistent).

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/resources/db/migration/V19__associate_kyc_document.sql \
        backend/src/main/java/com/plotchain/associate/AssociateKycDocument.java \
        backend/src/main/java/com/plotchain/associate/AssociateKycDocumentRepository.java \
        backend/src/main/java/com/plotchain/associate/KycDocumentSummary.java \
        backend/src/main/java/com/plotchain/associate/AssociateKycStatusResponse.java \
        backend/src/main/java/com/plotchain/associate/InvalidKycUploadException.java \
        backend/src/main/java/com/plotchain/associate/AssociateProvisioningExceptionHandler.java
git commit -m "feat(kyc): add associate_kyc_document table, entity, and DTOs for self-service KYC submission"
```

---

### Task 2: KycSubmissionService

**Files:**
- Create: `backend/src/main/java/com/plotchain/associate/KycSubmissionService.java`
- Test: `backend/src/test/java/com/plotchain/associate/KycSubmissionServiceTest.java`

**Interfaces:**
- Consumes: `AssociateRepository.findById(UUID): Optional<Associate>` and `.save(Associate)` (existing, `JpaRepository`-inherited); `AssociateKycDocumentRepository.findByAssociateIdAndDocumentType`/`.findByAssociateIdOrderByDocumentTypeAsc`/`.save` (Task 1); `Associate.getKycStatus()/setKycStatus(KycStatus)` (existing); `KycDocumentSummary`, `AssociateKycStatusResponse`, `InvalidKycUploadException`, `AssociateNotFoundException` (existing, `com.plotchain.associate`).
- Produces: `KycSubmissionService` with `uploadDocument(UUID associateId, String documentType, MultipartFile file): KycDocumentSummary` and `getStatus(UUID associateId): AssociateKycStatusResponse`. Task 3 (`KycSubmissionController`) consumes both exact signatures.

- [ ] **Step 1: Write the failing tests**

Create `backend/src/test/java/com/plotchain/associate/KycSubmissionServiceTest.java`:

```java
package com.plotchain.associate;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class KycSubmissionServiceTest {

    @Mock AssociateRepository associateRepository;
    @Mock AssociateKycDocumentRepository associateKycDocumentRepository;

    KycSubmissionService service;
    private static final UUID ASSOCIATE_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        service = new KycSubmissionService(associateRepository, associateKycDocumentRepository);
    }

    private Associate pendingAssociate() {
        Associate a = new Associate();
        a.setId(ASSOCIATE_ID);
        a.setRole(AssociateRole.ASSOCIATE);
        a.setKycStatus(KycStatus.PENDING);
        return a;
    }

    @Test
    void uploadDocumentCreatesANewRowAndResetsStatusToPending() {
        Associate associate = pendingAssociate();
        associate.setKycStatus(KycStatus.REJECTED);
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associate));
        when(associateKycDocumentRepository.findByAssociateIdAndDocumentType(ASSOCIATE_ID, "AADHAAR"))
            .thenReturn(Optional.empty());
        MockMultipartFile file = new MockMultipartFile("file", "aadhaar.png", "image/png", new byte[]{1, 2, 3});

        KycDocumentSummary summary = service.uploadDocument(ASSOCIATE_ID, "AADHAAR", file);

        assertThat(summary.documentType()).isEqualTo("AADHAAR");
        assertThat(summary.contentType()).isEqualTo("image/png");
        assertThat(associate.getKycStatus()).isEqualTo(KycStatus.PENDING);
        verify(associateRepository).save(associate);

        ArgumentCaptor<AssociateKycDocument> captor = ArgumentCaptor.forClass(AssociateKycDocument.class);
        verify(associateKycDocumentRepository).save(captor.capture());
        assertThat(captor.getValue().getAssociateId()).isEqualTo(ASSOCIATE_ID);
        assertThat(captor.getValue().getDocumentType()).isEqualTo("AADHAAR");
        assertThat(captor.getValue().getContent()).containsExactly(1, 2, 3);
        assertThat(captor.getValue().getId()).isNotNull();
    }

    @Test
    void uploadDocumentOverwritesAnExistingRowForTheSameType() {
        Associate associate = pendingAssociate();
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associate));
        UUID existingId = UUID.randomUUID();
        AssociateKycDocument existing = new AssociateKycDocument();
        existing.setId(existingId);
        existing.setAssociateId(ASSOCIATE_ID);
        existing.setDocumentType("PAN");
        existing.setContent(new byte[]{9});
        existing.setContentType("image/jpeg");
        existing.setUploadedAt(Instant.now().minusSeconds(3600));
        when(associateKycDocumentRepository.findByAssociateIdAndDocumentType(ASSOCIATE_ID, "PAN"))
            .thenReturn(Optional.of(existing));
        MockMultipartFile file = new MockMultipartFile("file", "pan.pdf", "application/pdf", new byte[]{7, 7});

        service.uploadDocument(ASSOCIATE_ID, "PAN", file);

        ArgumentCaptor<AssociateKycDocument> captor = ArgumentCaptor.forClass(AssociateKycDocument.class);
        verify(associateKycDocumentRepository).save(captor.capture());
        // Same row (same id), new bytes/contentType -- overwrite, not a second row.
        assertThat(captor.getValue().getId()).isEqualTo(existingId);
        assertThat(captor.getValue().getContent()).containsExactly(7, 7);
        assertThat(captor.getValue().getContentType()).isEqualTo("application/pdf");
    }

    @Test
    void uploadDocumentResetsAnAlreadyVerifiedStatusBackToPending() {
        Associate associate = pendingAssociate();
        associate.setKycStatus(KycStatus.VERIFIED);
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associate));
        when(associateKycDocumentRepository.findByAssociateIdAndDocumentType(any(), any())).thenReturn(Optional.empty());
        MockMultipartFile file = new MockMultipartFile("file", "pan.png", "image/png", new byte[]{1});

        service.uploadDocument(ASSOCIATE_ID, "PAN", file);

        assertThat(associate.getKycStatus()).isEqualTo(KycStatus.PENDING);
    }

    @Test
    void uploadDocumentRejectsAnEmptyFile() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(pendingAssociate()));
        MockMultipartFile empty = new MockMultipartFile("file", "aadhaar.png", "image/png", new byte[0]);

        assertThatThrownBy(() -> service.uploadDocument(ASSOCIATE_ID, "AADHAAR", empty))
            .isInstanceOf(InvalidKycUploadException.class);
        verify(associateKycDocumentRepository, never()).save(any());
    }

    @Test
    void uploadDocumentRejectsAnUnsupportedContentType() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(pendingAssociate()));
        MockMultipartFile gif = new MockMultipartFile("file", "aadhaar.gif", "image/gif", new byte[]{1});

        assertThatThrownBy(() -> service.uploadDocument(ASSOCIATE_ID, "AADHAAR", gif))
            .isInstanceOf(InvalidKycUploadException.class);
    }

    @Test
    void uploadDocumentRejectsABlankDocumentType() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(pendingAssociate()));
        MockMultipartFile file = new MockMultipartFile("file", "aadhaar.png", "image/png", new byte[]{1});

        assertThatThrownBy(() -> service.uploadDocument(ASSOCIATE_ID, "  ", file))
            .isInstanceOf(InvalidKycUploadException.class);
    }

    @Test
    void uploadDocumentThrowsWhenAssociateNotFound() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.empty());
        MockMultipartFile file = new MockMultipartFile("file", "aadhaar.png", "image/png", new byte[]{1});

        assertThatThrownBy(() -> service.uploadDocument(ASSOCIATE_ID, "AADHAAR", file))
            .isInstanceOf(AssociateNotFoundException.class);
    }

    @Test
    void getStatusReturnsKycStatusAndSubmittedDocuments() {
        Associate associate = pendingAssociate();
        associate.setKycStatus(KycStatus.VERIFIED);
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associate));
        AssociateKycDocument doc = new AssociateKycDocument();
        doc.setId(UUID.randomUUID());
        doc.setAssociateId(ASSOCIATE_ID);
        doc.setDocumentType("AADHAAR");
        doc.setContentType("image/png");
        doc.setUploadedAt(Instant.now());
        when(associateKycDocumentRepository.findByAssociateIdOrderByDocumentTypeAsc(ASSOCIATE_ID))
            .thenReturn(List.of(doc));

        AssociateKycStatusResponse response = service.getStatus(ASSOCIATE_ID);

        assertThat(response.kycStatus()).isEqualTo(KycStatus.VERIFIED);
        assertThat(response.documents()).hasSize(1);
        assertThat(response.documents().get(0).documentType()).isEqualTo("AADHAAR");
    }

    @Test
    void getStatusThrowsWhenAssociateNotFound() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getStatus(ASSOCIATE_ID))
            .isInstanceOf(AssociateNotFoundException.class);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && ./mvnw test -Dtest=KycSubmissionServiceTest`
Expected: FAIL to compile — `KycSubmissionService` does not exist yet.

- [ ] **Step 3: Write the service**

Create `backend/src/main/java/com/plotchain/associate/KycSubmissionService.java`:

```java
package com.plotchain.associate;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
public class KycSubmissionService {

    // ID-document scans are commonly PDF, unlike CompanyBrandingService's logo-only allowlist
    // (image/png, image/jpeg, image/svg+xml, image/webp) -- this is its own constant, not a
    // shared one, since the two upload flows accept genuinely different file kinds.
    private static final Set<String> ALLOWED_KYC_CONTENT_TYPES =
        Set.of("image/png", "image/jpeg", "image/webp", "application/pdf");

    private static final int MAX_DOCUMENT_TYPE_LENGTH = 50;

    private final AssociateRepository associateRepository;
    private final AssociateKycDocumentRepository associateKycDocumentRepository;

    public KycSubmissionService(AssociateRepository associateRepository,
                                 AssociateKycDocumentRepository associateKycDocumentRepository) {
        this.associateRepository = associateRepository;
        this.associateKycDocumentRepository = associateKycDocumentRepository;
    }

    @Transactional
    public KycDocumentSummary uploadDocument(UUID associateId, String documentType, MultipartFile file) {
        Associate associate = associateRepository.findById(associateId)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));

        if (documentType == null || documentType.isBlank()) {
            throw new InvalidKycUploadException("documentType is required");
        }
        if (documentType.length() > MAX_DOCUMENT_TYPE_LENGTH) {
            throw new InvalidKycUploadException("documentType exceeds " + MAX_DOCUMENT_TYPE_LENGTH + " characters");
        }
        if (file == null || file.isEmpty()) {
            throw new InvalidKycUploadException("file is empty");
        }
        String contentType = file.getContentType();
        if (contentType == null || !ALLOWED_KYC_CONTENT_TYPES.contains(contentType)) {
            throw new InvalidKycUploadException("unsupported document content type: " + contentType);
        }

        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }

        AssociateKycDocument document = associateKycDocumentRepository
            .findByAssociateIdAndDocumentType(associateId, documentType)
            .orElseGet(() -> {
                AssociateKycDocument d = new AssociateKycDocument();
                d.setId(UUID.randomUUID());
                d.setAssociateId(associateId);
                d.setDocumentType(documentType);
                return d;
            });
        document.setContent(bytes);
        document.setContentType(contentType);
        document.setUploadedAt(Instant.now());
        associateKycDocumentRepository.save(document);

        // Every successful upload resets to PENDING regardless of prior status: first
        // submission (already PENDING -- harmless no-op save), resubmission after REJECTED
        // (puts the associate back in the admin review queue), or a new upload after VERIFIED
        // (new evidence shouldn't silently keep a stale "verified" status). One unconditional
        // assignment, not a per-prior-state branch.
        associate.setKycStatus(KycStatus.PENDING);
        associateRepository.save(associate);

        return toSummary(document);
    }

    public AssociateKycStatusResponse getStatus(UUID associateId) {
        Associate associate = associateRepository.findById(associateId)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));
        List<KycDocumentSummary> documents = associateKycDocumentRepository
            .findByAssociateIdOrderByDocumentTypeAsc(associateId).stream()
            .map(KycSubmissionService::toSummary)
            .toList();
        return new AssociateKycStatusResponse(associate.getKycStatus(), documents);
    }

    private static KycDocumentSummary toSummary(AssociateKycDocument d) {
        return new KycDocumentSummary(d.getDocumentType(), d.getContentType(), d.getUploadedAt());
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && ./mvnw test -Dtest=KycSubmissionServiceTest`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/associate/KycSubmissionService.java \
        backend/src/test/java/com/plotchain/associate/KycSubmissionServiceTest.java
git commit -m "feat(kyc): add KycSubmissionService for self-scoped associate document upload and status lookup"
```

---

### Task 3: KycSubmissionController, SecurityConfig matcher, and controller/security tests

**Files:**
- Create: `backend/src/main/java/com/plotchain/associate/KycSubmissionController.java`
- Modify: `backend/src/main/java/com/plotchain/auth/SecurityConfig.java`
- Test: `backend/src/test/java/com/plotchain/associate/KycSubmissionControllerTest.java`
- Modify: `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`

**Interfaces:**
- Consumes: `KycSubmissionService.uploadDocument(UUID, String, MultipartFile): KycDocumentSummary` and `.getStatus(UUID): AssociateKycStatusResponse` (Task 2, exact signatures).
- Produces: `GET /api/associates/me/kyc` → `200 AssociateKycStatusResponse`; `POST /api/associates/me/kyc/documents/{documentType}` (multipart, field `file`) → `200 KycDocumentSummary`.

- [ ] **Step 1: Write the failing controller test**

Create `backend/src/test/java/com/plotchain/associate/KycSubmissionControllerTest.java`:

```java
package com.plotchain.associate;

import com.plotchain.auth.JwtService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// @MockBean on the repository INTERFACES (not the concrete KycSubmissionService) so this runs
// a real KycSubmissionService inside a real Spring Security filter chain, same pattern as
// DashboardControllerTest/CompanyBrandingControllerTest.
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class KycSubmissionControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;
    @MockBean AssociateKycDocumentRepository associateKycDocumentRepository;

    private String tokenFor(UUID associateId) {
        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setRole(AssociateRole.ASSOCIATE);
        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));
        return jwtService.generateToken(associate);
    }

    @Test
    void getStatusReturnsKycStatusAndDocumentsForTheAuthenticatedAssociate() throws Exception {
        UUID associateId = UUID.randomUUID();
        String token = tokenFor(associateId);
        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setKycStatus(KycStatus.PENDING);
        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));
        AssociateKycDocument doc = new AssociateKycDocument();
        doc.setDocumentType("AADHAAR");
        doc.setContentType("image/png");
        doc.setUploadedAt(Instant.now());
        when(associateKycDocumentRepository.findByAssociateIdOrderByDocumentTypeAsc(associateId))
            .thenReturn(List.of(doc));

        mockMvc.perform(get("/api/associates/me/kyc")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.kycStatus").value("PENDING"))
            .andExpect(jsonPath("$.documents[0].documentType").value("AADHAAR"));
    }

    @Test
    void getStatusReturns401WithoutAToken() throws Exception {
        mockMvc.perform(get("/api/associates/me/kyc"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void uploadDocumentSavesTheFileAndResetsStatusToPending() throws Exception {
        UUID associateId = UUID.randomUUID();
        String token = tokenFor(associateId);
        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setKycStatus(KycStatus.REJECTED);
        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));
        when(associateKycDocumentRepository.findByAssociateIdAndDocumentType(associateId, "PAN"))
            .thenReturn(Optional.empty());
        MockMultipartFile file = new MockMultipartFile("file", "pan.png", "image/png", new byte[]{1, 2, 3});

        mockMvc.perform(multipart("/api/associates/me/kyc/documents/PAN")
                .file(file)
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.documentType").value("PAN"))
            .andExpect(jsonPath("$.contentType").value("image/png"));
    }

    @Test
    void uploadDocumentRejectsAnUnsupportedContentType() throws Exception {
        UUID associateId = UUID.randomUUID();
        String token = tokenFor(associateId);
        Associate associate = new Associate();
        associate.setId(associateId);
        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));
        MockMultipartFile file = new MockMultipartFile("file", "pan.gif", "image/gif", new byte[]{1});

        mockMvc.perform(multipart("/api/associates/me/kyc/documents/PAN")
                .file(file)
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").isNotEmpty());
    }

    @Test
    void uploadDocumentReturns401WithoutAToken() throws Exception {
        MockMultipartFile file = new MockMultipartFile("file", "pan.png", "image/png", new byte[]{1});

        mockMvc.perform(multipart("/api/associates/me/kyc/documents/PAN").file(file))
            .andExpect(status().isUnauthorized());
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && ./mvnw test -Dtest=KycSubmissionControllerTest`
Expected: FAIL — `KycSubmissionController` does not exist yet (compile failure), and even once it exists, `uploadDocumentSavesTheFileAndResetsStatusToPending`/similar will 403 until the `SecurityConfig` matcher is added.

- [ ] **Step 3: Write the controller**

Create `backend/src/main/java/com/plotchain/associate/KycSubmissionController.java`:

```java
package com.plotchain.associate;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.UUID;

// Self-scoped by construction: the target associate always comes from the verified JWT
// (@AuthenticationPrincipal), never from a path or query parameter, same pattern as
// PasswordController (/api/associates/me/password) and DashboardController
// (/api/associates/me/dashboard). Deliberately separate from KycReviewController
// (/api/admin/kyc, the admin review queue) -- this controller owns the associate-facing half
// of KYC only.
@RestController
@RequestMapping("/api/associates/me/kyc")
public class KycSubmissionController {

    private final KycSubmissionService kycSubmissionService;

    public KycSubmissionController(KycSubmissionService kycSubmissionService) {
        this.kycSubmissionService = kycSubmissionService;
    }

    @GetMapping
    public AssociateKycStatusResponse getStatus(@AuthenticationPrincipal UUID associateId) {
        return kycSubmissionService.getStatus(associateId);
    }

    @PostMapping("/documents/{documentType}")
    public KycDocumentSummary uploadDocument(
            @PathVariable String documentType,
            @RequestParam("file") MultipartFile file,
            @AuthenticationPrincipal UUID associateId) {
        return kycSubmissionService.uploadDocument(associateId, documentType, file);
    }
}
```

- [ ] **Step 4: Add the SecurityConfig matcher**

In `backend/src/main/java/com/plotchain/auth/SecurityConfig.java`, add a new matcher directly after the existing `POST /api/associates/me/password` matcher (around line 46), still before the blanket ADMIN write rules:

```java
                .requestMatchers(HttpMethod.POST, "/api/associates/me/password").authenticated()
                // Self-service KYC document submission: an associate-reachable POST, same
                // shape as the password-change matcher directly above (role-capability unit 8,
                // docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md,
                // KYC row: "Own KYC submission + status only" -- submission is one of the two
                // write actions Associates get, alongside profile edit). Must precede the
                // blanket ADMIN write rules below (first-match-wins) or an associate could
                // never submit KYC documents. GET /api/associates/me/kyc needs no matcher of
                // its own -- a bare GET never collides with the POST/PUT/PATCH/DELETE blanket
                // rules, so it falls through to anyRequest().authenticated() below, the same
                // way GET /api/associates/me/dashboard and GET /api/associates/me/sales
                // already do with no matcher of their own.
                .requestMatchers(HttpMethod.POST, "/api/associates/me/kyc/documents/*").authenticated()
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && ./mvnw test -Dtest=KycSubmissionControllerTest`
Expected: PASS (5 tests).

- [ ] **Step 6: Add a SecurityConfigTest regression lock for the new matcher**

In `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`, add a test near `passwordChangeIsReachableByAnAssociateToken` (same "assert not 403" reasoning — the request should pass the security layer regardless of what happens downstream):

```java
    // Role-capability unit 8: POST /api/associates/me/kyc/documents/{type} needs its own
    // matcher ABOVE the blanket ADMIN write rules, same ordering trap as
    // passwordChangeIsReachableByAnAssociateToken above. AssociateKycDocumentRepository is not
    // @MockBean'd in this class (same "some repositories run for real against H2" convention
    // as compensation/payments/projects above), and associateRepository IS a @MockBean here
    // returning a fake associate never actually persisted to the real H2 database -- so the
    // real AssociateKycDocumentRepository.save() hits a foreign-key violation against that
    // non-existent associate row, surfacing as a 409 via ApiExceptionHandler's
    // DataIntegrityViolationException mapping. Whether it lands on 409 (FK violation) or some
    // other non-403 status doesn't matter for this test -- only a 403 here would mean the
    // matcher ordering regressed.
    @Test
    void kycDocumentUploadIsReachableByAnAssociateToken() throws Exception {
        org.springframework.mock.web.MockMultipartFile file =
            new org.springframework.mock.web.MockMultipartFile("file", "pan.png", "image/png", new byte[]{1});

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .multipart("/api/associates/me/kyc/documents/PAN")
                .file(file)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().is(not(403)));
    }
```

Check the existing imports at the top of `SecurityConfigTest.java` first — if `MockMvcRequestBuilders` and `MockMultipartFile` are already imported (unlikely for `MockMultipartFile`, likely for `MockMvcRequestBuilders.post`/`.get`), use the short forms (`multipart(...)`, `new MockMultipartFile(...)`) and add the missing import(s) instead of the fully-qualified names above — the fully-qualified form here is only to guarantee this snippet compiles regardless of what's already imported.

- [ ] **Step 7: Run the full SecurityConfigTest to verify it passes**

Run: `cd backend && ./mvnw test -Dtest=SecurityConfigTest`
Expected: PASS, including the new `kycDocumentUploadIsReachableByAnAssociateToken` test.

- [ ] **Step 8: Run the full backend test suite**

Run: `cd backend && ./mvnw test`
Expected: PASS, modulo the pre-existing ~55 spurious JDK21/25 Mockito failures documented in Global Constraints (none of which touch any file this plan modifies).

- [ ] **Step 9: Commit**

```bash
git add backend/src/main/java/com/plotchain/associate/KycSubmissionController.java \
        backend/src/main/java/com/plotchain/auth/SecurityConfig.java \
        backend/src/test/java/com/plotchain/associate/KycSubmissionControllerTest.java \
        backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java
git commit -m "feat(kyc): add associate-facing KYC submission/status endpoints and their SecurityConfig matcher"
```

---

## Self-review notes

- **Spec coverage**: "submit KYC documents, self-scoped" → Task 3's `POST /api/associates/me/kyc/documents/{documentType}`. "view own KYC status" → Task 3's `GET /api/associates/me/kyc`. "admin queue untouched" → no file under `KycReviewController`/`KycReviewService`/`KycDecisionRequest`/`KycQueueEntryResponse`/`KycPageResponse`/`KycCountsResponse` is modified anywhere in this plan. "`/api/associates/me/*` convention" → both routes live under that prefix, matching `PasswordController`/`DashboardController`. All four acceptance criteria are covered.
- **Placeholder scan**: no TBD/TODO markers; every step has literal file contents, not descriptions of what to write.
- **Type consistency**: `KycSubmissionService.uploadDocument(UUID, String, MultipartFile): KycDocumentSummary` and `.getStatus(UUID): AssociateKycStatusResponse` (Task 2) match exactly what `KycSubmissionController` (Task 3) calls. `AssociateKycDocumentRepository`'s two query methods (Task 1) match exactly what `KycSubmissionService` (Task 2) calls.
