# Role-Capability Unit 14: Associate "Profile & Bank/KYC Details" Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give an Associate the one editable screen the data-visibility spec grants them — a combined "Profile & Bank/KYC Details" page where they can view and edit their name/phone/email, and submit/resubmit KYC documents while seeing their own KYC status. This is the frontend-only screen unit that wires up two already-merged backend units (8: KYC submission, 11: profile edit) — no backend changes, no new endpoints, no migration.

**Architecture:** One new standalone Angular feature area, `frontend/src/app/profile-kyc/`, following the flat, non-nested-module structure `sales-history/` and `dashboard/` already established (a route-level component + a thin service per backend resource + `models/` for response/request shapes, no `NgModule`). Two backend resources are consumed from one screen: `GET/PUT /api/associates/me/profile` (unit 11) and `GET /api/associates/me/kyc` + `POST /api/associates/me/kyc/documents/{documentType}` (unit 8) — so this unit adds two small services (`AssociateProfileService`, `AssociateKycService`), not one, keeping each service scoped to exactly the resource it owns (matches the backend's own controller-per-resource split — there is no combined backend endpoint to mirror with a combined frontend service). The one component (`ProfileKycComponent`) composes both into a single page with two sections: a reactive-form profile-edit card (mirrors `ChangePasswordComponent`'s plain `FormBuilder` + `ReactiveFormsModule` pattern, not the debounced-autosave pattern `BrandingStepComponent` uses — this is a setup-wizard-specific convention, not a general one) and a KYC section (status banner + per-document-type upload rows, reusing the shared `FieldErrorComponent`/`InlineBannerComponent` and the same "native `<input type=file>` behind a styled button" mechanic `LogoUploaderComponent` established, without reusing that component itself — see Design decision 3).

**Tech Stack:** Angular 17+ standalone components, `ReactiveFormsModule`, `HttpClient` (`multipart/form-data` for the KYC upload, `FormData` + `Content-Type` left to the browser, same as `BrandingService.uploadLogo`), `@ngx-translate/core` (`en.json`/`hi.json`), Jasmine/Karma component specs with `HttpClientTestingModule`/`HttpTestingController` (same pattern as `sales-history.component.spec.ts`/`dashboard.component.spec.ts`).

## Global Constraints

- **No backend changes.** Both consumed endpoints already exist and are merged (`AssociateProfileController`, `KycSubmissionController`, both in `backend/src/main/java/com/plotchain/associate/`). This plan touches `frontend/` only.
- The route must sit alongside the other two associate-only routes (`dashboard`, `sales-history`) — same `canActivate: [authGuard, associateOnlyGuard]` pair, same flat top-level path (not nested under `settings/`, which is the Admin-only shell).
- Request/response field names in the new frontend models must match the backend records **exactly** (`AssociateProfileResponse(id, userId, name, phone, email, joinedAt)`, `UpdateAssociateProfileRequest(name, phone, email)`, `AssociateKycStatusResponse(kycStatus, documents)`, `KycDocumentSummary(documentType, contentType, uploadedAt)`) — verified by direct read of the current merged source in this plan's research, not assumed from the unit 8/11 plan files (which match the merged code exactly here, but that was checked, not presumed).
- Run frontend tests with `cd frontend && npm test -- --watch=false --browsers=ChromeHeadless` (or this repo's equivalent CI invocation) after every task.
- Every new HTTP-calling method must have an `HttpTestingController`-backed spec covering both the success and the error path — no untested network call, matching every existing service spec in this codebase (`dashboard.service.spec.ts`, `sales-history.service.spec.ts`).

---

## Design decisions (read before implementing)

1. **Bank details: flagged as a known gap, not invented, not silently omitted.** Unit 11's own merge note is explicit: `Associate` has no bank-related field, and `PayoutBankAccount` is a company-level singleton with no `associate_id` — "a real, currently-undesigned gap between the spec's 'own profile' row and what the data model supports... would need its own design-plus-migration unit, not a mechanical wire-up." This plan does not invent bank-detail form fields, does not call any bank-related endpoint (none exists), and does not silently drop the section either — the spec's own screen name is "Profile & **Bank**/KYC Details," so a user reading that name and finding no trace of it would reasonably think the screen is broken. Instead: a disabled `app-inline-banner` (`tone="info"`) inside a labeled "Bank Details" section, translated copy explaining bank details aren't collectable yet, no input fields, no submit affordance. This is the same "an honest empty state beats a silent omission" instinct the rest of this codebase applies to load errors and empty tables, applied to a structural gap instead of a data gap.
2. **KYC document type list is a hardcoded frontend constant, not fetched from the backend — a second real gap, found during this plan's research, not previously documented.** The admin-configurable required-document list lives in `KycConfig.requiredDocuments` (`backend/src/main/java/com/plotchain/payments/KycConfig.java`), exposed only via `GET /api/company/kyc` — and `SecurityConfig.java` (`backend/src/main/java/com/plotchain/auth/SecurityConfig.java:175-178`) gates that `GET` to `hasAuthority("ADMIN")` only; an Associate token 403s on it. There is no associate-reachable endpoint exposing which document types an admin has configured as required. Unit 8's own service comment confirms `document_type` is deliberately **not** cross-validated against `KycConfig`'s list server-side either — "a new `associate` → `payments` package dependency for a check the acceptance criteria doesn't require." Given that, this screen hardcodes the same three document-type slugs unit 8's own tests and service comments already use as the established vocabulary — `AADHAAR`, `PAN`, `BANK_PASSBOOK` — as a frontend constant (`KYC_DOCUMENT_TYPES` in the model file). This is a real product gap (an admin who reconfigures required documents in Settings → Payments & KYC has no way to change what an Associate is offered to upload) worth flagging as a follow-up, not something this unit can close without a new associate-reachable read endpoint, which is out of scope for a screen-only unit.
3. **No raw document-bytes preview for already-submitted KYC documents — a third real gap, found during this plan's research.** `KycSubmissionController` (unit 8) exposes only `GET /api/associates/me/kyc` (status + `KycDocumentSummary` **metadata**: `documentType`, `contentType`, `uploadedAt` — no bytes) and the upload `POST`. Unlike company branding's logo flow, which has a dedicated `GET /api/company/branding/logo/{variant}` byte-serving endpoint the frontend already renders as `<img [src]="logoUrl">`, there is no equivalent `GET .../kyc/documents/{documentType}` anywhere in this codebase — confirmed by grepping every `@GetMapping` in `KycSubmissionController.java` and `KycReviewController.java` (the admin review queue doesn't preview document bytes either, so this isn't a regression this unit introduces, it's a pre-existing platform gap). Consequence for this screen: previously-submitted documents render as a metadata row (document type label, content-type, "Submitted on {date}") with no thumbnail. A file the user has just picked *in this session* (before upload) **can** show a local preview, since the bytes are already in the browser — via `URL.createObjectURL(file)` for image types, a generic file icon for `application/pdf` — because that preview needs no backend round-trip at all. This local-preview-only compromise is called out explicitly in the KYC section template, not left implicit.
4. **Two frontend services, not one, mirroring the two backend controllers.** `AssociateProfileService` wraps `GET/PUT /api/associates/me/profile` only; `AssociateKycService` wraps `GET /api/associates/me/kyc` and `POST .../kyc/documents/{documentType}` only. Combining them into one "profile-kyc" service would blur two independently-versioned backend resources behind one frontend abstraction for no reason beyond "they render on the same page" — the same reasoning `DashboardService` (one widget-aggregate resource) vs. `SalesHistoryService` (a separate resource, even though both render on associate-facing pages) already establishes as this codebase's convention: one service per backend resource, composed at the component layer.
5. **Profile form uses plain submit-on-click, not `BrandingStepComponent`'s debounced autosave.** Autosave-on-keystroke is a setup-wizard-specific UX (the wizard's whole point is "nothing to lose by leaving a step, it's already saved"). The Associate profile screen is not a wizard step; `ChangePasswordComponent`'s plain `(ngSubmit)` + explicit submit button is the closer precedent for an associate-facing, single-purpose edit form outside the wizard.
6. **Email-conflict (409) and validation (400) errors get different UI treatment, matching how the backend actually shapes them.** `EmailAlreadyRegisteredException` → `AssociateProvisioningExceptionHandler.handleEmailTaken` returns a flat `{"error": "..."}` (confirmed by direct read), **not** the `{"fields": {...}}` shape `toFieldErrors()` parses — so a 409 is read via `err.error?.error` (same pattern `BrandingStepComponent.onLogoSelected`'s error handler already uses for a similarly flat-shaped upload error) and shown as a field-level message under the email input, not through `toFieldErrors()`. A 400 from `@Valid` bean-validation failure (blank name, malformed email) **is** shaped with `fields`, matching every other `@Valid`-annotated controller in this codebase, so that path does use `toFieldErrors()`, matching `BrandingStepComponent.save()`'s error handler exactly.
7. **KYC upload content-type allowlist is a frontend-only client-side hint, not a substitute for the backend's real validation.** The `<input type="file" accept="...">` attribute is set to `image/png,image/jpeg,image/webp,application/pdf`, mirroring `KycSubmissionService.ALLOWED_KYC_CONTENT_TYPES` exactly (`backend/src/main/java/com/plotchain/associate/KycSubmissionService.java:20-21`) — this only improves the OS file picker's default filter and is not enforced client-side beyond that; the backend's `InvalidKycUploadException` (400, flat `{"error": ...}` shape, same as `EmailAlreadyRegisteredException`) is still the source of truth, surfaced to the user via `err.error?.error`, same pattern as decision 6.
8. **Read-only fields (`userId`, `joinedAt`) are displayed but not editable.** `AssociateProfileResponse` carries `id`/`userId`/`joinedAt` alongside the three editable fields; the form only binds `name`/`phone`/`email` as `formControlName`s. `userId` and `joinedAt` render as plain labelled text above the form (a small "identity" strip), matching how `AssociateProfileControllerTest`'s own assertions treat them — read-once display data, never sent back in the `PUT` body. `id` is not rendered at all (an internal UUID with no user-facing meaning, same treatment `AssociateProfileResponse`'s own header comment gives it relative to `userId`).

---

## Files

- Create: `frontend/src/app/profile-kyc/models/associate-profile.model.ts` — `AssociateProfileResponse`, `UpdateAssociateProfileRequest` interfaces.
- Create: `frontend/src/app/profile-kyc/models/associate-kyc-status.model.ts` — `KycStatus` union type, `KycDocumentSummary`, `AssociateKycStatusResponse` interfaces, `KYC_DOCUMENT_TYPES` constant (Design decision 2).
- Create: `frontend/src/app/profile-kyc/associate-profile.service.ts` + `.spec.ts`
- Create: `frontend/src/app/profile-kyc/associate-kyc.service.ts` + `.spec.ts`
- Create: `frontend/src/app/profile-kyc/profile-kyc.component.ts` + `.spec.ts`
- Modify: `frontend/src/app/app.routes.ts` — add the `profile` route.
- Modify: `frontend/src/app/app.routes.spec.ts` — add a guard-coverage test for the new route.
- Modify: `frontend/src/app/app.component.html` — add the nav link (Associate-only, alongside Dashboard/Sales History).
- Modify: `frontend/src/app/app.component.spec.ts` — add/extend nav-link coverage for the new link, if this spec file already asserts nav link presence (verify by reading it first — don't assume its current shape).
- Modify: `frontend/src/assets/i18n/en.json` — add `profileKyc` section + `nav.profileKyc` key.
- Modify: `frontend/src/assets/i18n/hi.json` — same keys, Hindi translations.

No backend files. No new shared component (Design decision 3/4 — the KYC upload UI is built inline in `ProfileKycComponent`'s template using the existing `FieldErrorComponent`/`InlineBannerComponent`, not a new reusable uploader, because unlike the two-variant, fixed-shape logo uploader, this one needs a per-document-type loop over a list plus mixed image/PDF local-preview handling `LogoUploaderComponent` has no notion of).

---

## Task 1: Models

**Files:**
- Create: `frontend/src/app/profile-kyc/models/associate-profile.model.ts`
- Create: `frontend/src/app/profile-kyc/models/associate-kyc-status.model.ts`

**Interfaces:**
- Produces: `AssociateProfileResponse { id: string; userId: string; name: string; phone: string | null; email: string | null; joinedAt: string; }`, `UpdateAssociateProfileRequest { name: string; phone: string | null; email: string | null; }`, `KycStatus = 'PENDING' | 'VERIFIED' | 'REJECTED'`, `KycDocumentSummary { documentType: string; contentType: string; uploadedAt: string; }`, `AssociateKycStatusResponse { kycStatus: KycStatus; documents: KycDocumentSummary[]; }`, `KYC_DOCUMENT_TYPES: readonly string[]`. Tasks 2-4 consume all of these.

No test file for this task — pure type/constant declarations, same as how unit 8/11's backend DTOs had no dedicated test (verified by compile/type-check only, exercised for real once a service/component uses them).

- [ ] **Step 1: Write the profile model**

Create `frontend/src/app/profile-kyc/models/associate-profile.model.ts`:

```typescript
// Field names and nullability match backend/src/main/java/com/plotchain/associate/AssociateProfileResponse.java
// and UpdateAssociateProfileRequest.java exactly (role-capability unit 11, merged). `id` is
// carried through for type completeness but never rendered -- userId is the user-facing identity
// field (see ProfileKycComponent's identity strip).
export interface AssociateProfileResponse {
  id: string;
  userId: string;
  name: string;
  phone: string | null;
  email: string | null;
  joinedAt: string;
}

// A null phone/email clears the field server-side (both are nullable columns, not "required
// going forward" -- see UpdateAssociateProfileRequest.java's own header comment). name is
// @NotBlank server-side.
export interface UpdateAssociateProfileRequest {
  name: string;
  phone: string | null;
  email: string | null;
}
```

- [ ] **Step 2: Write the KYC status model**

Create `frontend/src/app/profile-kyc/models/associate-kyc-status.model.ts`:

```typescript
// Matches backend/src/main/java/com/plotchain/associate/KycStatus.java (role-capability unit 8,
// merged) exactly -- a 3-value enum, no client-side "UNSUBMITTED" state: an associate who has
// never uploaded anything still reads PENDING (KycSubmissionService seeds it that way at
// provisioning time), just with an empty documents array.
export type KycStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

// Matches KycDocumentSummary.java / AssociateKycStatusResponse.java exactly. No `id` field --
// the backend summary record doesn't expose one (document_type is the natural key per associate,
// enforced by the UNIQUE(associate_id, document_type) constraint on associate_kyc_document).
export interface KycDocumentSummary {
  documentType: string;
  contentType: string;
  uploadedAt: string;
}

export interface AssociateKycStatusResponse {
  kycStatus: KycStatus;
  documents: KycDocumentSummary[];
}

// Hardcoded, not fetched from the backend -- see this plan's Design decision 2. The
// admin-configured KycConfig.requiredDocuments list (backend/src/main/java/com/plotchain/payments/KycConfig.java)
// is only exposed via GET /api/company/kyc, which SecurityConfig.java gates ADMIN-only
// (backend/src/main/java/com/plotchain/auth/SecurityConfig.java:175-178) -- an Associate token
// 403s on it, and no associate-reachable equivalent exists. These three slugs are the same
// vocabulary KycSubmissionServiceTest's own test fixtures and KycSubmissionService's own header
// comment already establish as the expected document types (AADHAAR, PAN, BANK_PASSBOOK) --
// this is a real gap (an admin who reconfigures required documents in Settings has no way to
// change what an Associate is offered here), not a decision this screen-only unit can close.
export const KYC_DOCUMENT_TYPES: readonly string[] = ['AADHAAR', 'PAN', 'BANK_PASSBOOK'];
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/profile-kyc/models/associate-profile.model.ts \
        frontend/src/app/profile-kyc/models/associate-kyc-status.model.ts
git commit -m "feat(profile-kyc): add frontend models for associate profile and KYC status"
```

---

## Task 2: `AssociateProfileService` and `AssociateKycService`

**Files:**
- Create: `frontend/src/app/profile-kyc/associate-profile.service.ts` + `.spec.ts`
- Create: `frontend/src/app/profile-kyc/associate-kyc.service.ts` + `.spec.ts`

**Interfaces:**
- Consumes: `AssociateProfileResponse`, `UpdateAssociateProfileRequest`, `AssociateKycStatusResponse`, `KycDocumentSummary` (Task 1).
- Produces: `AssociateProfileService.getProfile(): Observable<AssociateProfileResponse>`, `.updateProfile(req: UpdateAssociateProfileRequest): Observable<AssociateProfileResponse>`; `AssociateKycService.getStatus(): Observable<AssociateKycStatusResponse>`, `.uploadDocument(documentType: string, file: File): Observable<KycDocumentSummary>`. Task 4 (`ProfileKycComponent`) consumes all four exact signatures.

- [ ] **Step 1: Write the failing profile service spec**

Create `frontend/src/app/profile-kyc/associate-profile.service.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AssociateProfileService } from './associate-profile.service';
import { AssociateProfileResponse } from './models/associate-profile.model';

describe('AssociateProfileService', () => {
  let service: AssociateProfileService;
  let httpMock: HttpTestingController;

  const mockResponse: AssociateProfileResponse = {
    id: 'a1', userId: 'VP00001', name: 'Jane Doe', phone: '9990001111',
    email: 'jane@example.com', joinedAt: '2026-01-01T00:00:00Z'
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(AssociateProfileService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('fetches the caller\'s own profile from GET /api/associates/me/profile', () => {
    let result: AssociateProfileResponse | undefined;
    service.getProfile().subscribe(res => (result = res));

    const req = httpMock.expectOne('/api/associates/me/profile');
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);

    expect(result).toEqual(mockResponse);
  });

  it('sends an update via PUT /api/associates/me/profile with the request body', () => {
    let result: AssociateProfileResponse | undefined;
    service.updateProfile({ name: 'Jane A. Doe', phone: '9990002222', email: 'jane.a.doe@example.com' })
      .subscribe(res => (result = res));

    const req = httpMock.expectOne('/api/associates/me/profile');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ name: 'Jane A. Doe', phone: '9990002222', email: 'jane.a.doe@example.com' });
    req.flush({ ...mockResponse, name: 'Jane A. Doe' });

    expect(result?.name).toBe('Jane A. Doe');
  });

  it('propagates a 409 conflict on the update call without swallowing it', () => {
    let error: any;
    service.updateProfile({ name: 'Jane Doe', phone: null, email: 'taken@example.com' })
      .subscribe({ error: err => (error = err) });

    httpMock.expectOne('/api/associates/me/profile')
      .flush({ error: 'Email already registered' }, { status: 409, statusText: 'Conflict' });

    expect(error.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npm test -- --watch=false --browsers=ChromeHeadless --include='**/associate-profile.service.spec.ts'`
Expected: FAIL — `AssociateProfileService` does not exist yet.

- [ ] **Step 3: Write the profile service**

Create `frontend/src/app/profile-kyc/associate-profile.service.ts`:

```typescript
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AssociateProfileResponse, UpdateAssociateProfileRequest } from './models/associate-profile.model';

// Wraps GET/PUT /api/associates/me/profile only (role-capability unit 11) -- deliberately not
// combined with AssociateKycService even though both render on the same screen; see this plan's
// Design decision 4 for why (one service per backend resource, matching DashboardService vs.
// SalesHistoryService's existing precedent).
@Injectable({ providedIn: 'root' })
export class AssociateProfileService {
  constructor(private http: HttpClient) {}

  getProfile(): Observable<AssociateProfileResponse> {
    return this.http.get<AssociateProfileResponse>('/api/associates/me/profile');
  }

  updateProfile(request: UpdateAssociateProfileRequest): Observable<AssociateProfileResponse> {
    return this.http.put<AssociateProfileResponse>('/api/associates/me/profile', request);
  }
}
```

- [ ] **Step 4: Run the profile service spec to verify it passes**

Run: `cd frontend && npm test -- --watch=false --browsers=ChromeHeadless --include='**/associate-profile.service.spec.ts'`
Expected: PASS, all 3 tests green.

- [ ] **Step 5: Write the failing KYC service spec**

Create `frontend/src/app/profile-kyc/associate-kyc.service.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AssociateKycService } from './associate-kyc.service';
import { AssociateKycStatusResponse, KycDocumentSummary } from './models/associate-kyc-status.model';

describe('AssociateKycService', () => {
  let service: AssociateKycService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(AssociateKycService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('fetches KYC status and documents from GET /api/associates/me/kyc', () => {
    let result: AssociateKycStatusResponse | undefined;
    service.getStatus().subscribe(res => (result = res));

    const req = httpMock.expectOne('/api/associates/me/kyc');
    expect(req.request.method).toBe('GET');
    const mockResponse: AssociateKycStatusResponse = {
      kycStatus: 'PENDING',
      documents: [{ documentType: 'AADHAAR', contentType: 'image/png', uploadedAt: '2026-08-01T00:00:00Z' }]
    };
    req.flush(mockResponse);

    expect(result).toEqual(mockResponse);
  });

  it('uploads a document as multipart/form-data to POST /api/associates/me/kyc/documents/{type}', () => {
    let result: KycDocumentSummary | undefined;
    const file = new File(['dummy'], 'aadhaar.png', { type: 'image/png' });
    service.uploadDocument('AADHAAR', file).subscribe(res => (result = res));

    const req = httpMock.expectOne('/api/associates/me/kyc/documents/AADHAAR');
    expect(req.request.method).toBe('POST');
    expect(req.request.body instanceof FormData).toBeTrue();
    const summary: KycDocumentSummary = { documentType: 'AADHAAR', contentType: 'image/png', uploadedAt: '2026-08-14T00:00:00Z' };
    req.flush(summary);

    expect(result).toEqual(summary);
  });

  it('propagates a 400 on an unsupported content type without swallowing it', () => {
    let error: any;
    const file = new File(['dummy'], 'aadhaar.gif', { type: 'image/gif' });
    service.uploadDocument('AADHAAR', file).subscribe({ error: err => (error = err) });

    httpMock.expectOne('/api/associates/me/kyc/documents/AADHAAR')
      .flush({ error: 'unsupported document content type: image/gif' }, { status: 400, statusText: 'Bad Request' });

    expect(error.status).toBe(400);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `cd frontend && npm test -- --watch=false --browsers=ChromeHeadless --include='**/associate-kyc.service.spec.ts'`
Expected: FAIL — `AssociateKycService` does not exist yet.

- [ ] **Step 7: Write the KYC service**

Create `frontend/src/app/profile-kyc/associate-kyc.service.ts`:

```typescript
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AssociateKycStatusResponse, KycDocumentSummary } from './models/associate-kyc-status.model';

// Wraps GET /api/associates/me/kyc and POST /api/associates/me/kyc/documents/{documentType} only
// (role-capability unit 8) -- see this plan's Design decision 4 for why this is a separate
// service from AssociateProfileService rather than combined.
@Injectable({ providedIn: 'root' })
export class AssociateKycService {
  constructor(private http: HttpClient) {}

  getStatus(): Observable<AssociateKycStatusResponse> {
    return this.http.get<AssociateKycStatusResponse>('/api/associates/me/kyc');
  }

  // multipart/form-data, field name "file" -- matches KycSubmissionController's
  // @RequestParam("file") MultipartFile exactly. Content-Type header is left to the browser
  // (it sets the multipart boundary itself), same as BrandingService.uploadLogo.
  uploadDocument(documentType: string, file: File): Observable<KycDocumentSummary> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<KycDocumentSummary>(`/api/associates/me/kyc/documents/${documentType}`, formData);
  }
}
```

- [ ] **Step 8: Run both service specs to verify they pass**

Run: `cd frontend && npm test -- --watch=false --browsers=ChromeHeadless --include='**/associate-profile.service.spec.ts' --include='**/associate-kyc.service.spec.ts'`
Expected: PASS, all 6 tests green.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app/profile-kyc/associate-profile.service.ts \
        frontend/src/app/profile-kyc/associate-profile.service.spec.ts \
        frontend/src/app/profile-kyc/associate-kyc.service.ts \
        frontend/src/app/profile-kyc/associate-kyc.service.spec.ts
git commit -m "feat(profile-kyc): add AssociateProfileService and AssociateKycService"
```

---

## Task 3: `ProfileKycComponent`

**Files:**
- Create: `frontend/src/app/profile-kyc/profile-kyc.component.ts` + `.spec.ts`

**Interfaces:**
- Consumes: `AssociateProfileService.getProfile/.updateProfile`, `AssociateKycService.getStatus/.uploadDocument` (Task 2, exact signatures); `KYC_DOCUMENT_TYPES` (Task 1); `FieldErrorComponent`, `InlineBannerComponent` (existing, `frontend/src/app/shared/components/`); `toFieldErrors` (existing, `frontend/src/app/core/api/field-errors.model.ts`).
- Produces: `ProfileKycComponent`, mounted at the `profile` route by Task 4.

- [ ] **Step 1: Write the failing component spec**

Create `frontend/src/app/profile-kyc/profile-kyc.component.spec.ts`:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { ProfileKycComponent } from './profile-kyc.component';
import { AssociateProfileResponse } from './models/associate-profile.model';
import { AssociateKycStatusResponse } from './models/associate-kyc-status.model';

describe('ProfileKycComponent', () => {
  let fixture: ComponentFixture<ProfileKycComponent>;
  let httpMock: HttpTestingController;

  const profileResponse: AssociateProfileResponse = {
    id: 'a1', userId: 'VP00001', name: 'Jane Doe', phone: '9990001111',
    email: 'jane@example.com', joinedAt: '2026-01-01T00:00:00Z'
  };
  const kycResponse: AssociateKycStatusResponse = {
    kycStatus: 'PENDING',
    documents: [{ documentType: 'AADHAAR', contentType: 'image/png', uploadedAt: '2026-08-01T00:00:00Z' }]
  };

  function init(): void {
    fixture = TestBed.createComponent(ProfileKycComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne('/api/associates/me/profile').flush(profileResponse);
    httpMock.expectOne('/api/associates/me/kyc').flush(kycResponse);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProfileKycComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();
  });

  afterEach(() => httpMock.verify());

  it('loads and displays the profile and KYC status on init', () => {
    init();
    expect(fixture.componentInstance.form.value.name).toBe('Jane Doe');
    expect(fixture.componentInstance.kycStatus?.kycStatus).toBe('PENDING');
  });

  it('shows a load error banner if the profile fetch fails, without leaving the form silently blank', () => {
    fixture = TestBed.createComponent(ProfileKycComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne('/api/associates/me/profile').flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });
    httpMock.expectOne('/api/associates/me/kyc').flush(kycResponse);
    fixture.detectChanges();

    expect(fixture.componentInstance.profileLoadError).toBeTrue();
  });

  it('shows a load error banner if the KYC status fetch fails independently of the profile fetch', () => {
    fixture = TestBed.createComponent(ProfileKycComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne('/api/associates/me/profile').flush(profileResponse);
    httpMock.expectOne('/api/associates/me/kyc').flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.kycLoadError).toBeTrue();
  });

  it('submits the edited name/phone/email via updateProfile on save', () => {
    init();
    fixture.componentInstance.form.patchValue({ name: 'Jane A. Doe', phone: '9990002222', email: 'jane.a.doe@example.com' });
    fixture.componentInstance.onSubmit();

    const req = httpMock.expectOne('/api/associates/me/profile');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ name: 'Jane A. Doe', phone: '9990002222', email: 'jane.a.doe@example.com' });
    req.flush({ ...profileResponse, name: 'Jane A. Doe' });

    expect(fixture.componentInstance.saveError).toBeUndefined();
  });

  it('does not submit when the form is invalid (blank name)', () => {
    init();
    fixture.componentInstance.form.patchValue({ name: '' });
    fixture.componentInstance.onSubmit();

    httpMock.expectNone('/api/associates/me/profile');
  });

  it('surfaces a 409 email-conflict as a field-level error, read from the flat error body', () => {
    init();
    fixture.componentInstance.form.patchValue({ email: 'taken@example.com' });
    fixture.componentInstance.onSubmit();

    httpMock.expectOne('/api/associates/me/profile')
      .flush({ error: 'Email already registered' }, { status: 409, statusText: 'Conflict' });

    expect(fixture.componentInstance.emailConflictError).toBe('Email already registered');
  });

  it('uploads a picked KYC document and refreshes status on success', () => {
    init();
    const file = new File(['dummy'], 'aadhaar.png', { type: 'image/png' });
    fixture.componentInstance.onFileSelected('PAN', file);

    const uploadReq = httpMock.expectOne('/api/associates/me/kyc/documents/PAN');
    expect(uploadReq.request.method).toBe('POST');
    uploadReq.flush({ documentType: 'PAN', contentType: 'image/png', uploadedAt: '2026-08-14T00:00:00Z' });

    const refreshReq = httpMock.expectOne('/api/associates/me/kyc');
    refreshReq.flush({ kycStatus: 'PENDING', documents: [{ documentType: 'PAN', contentType: 'image/png', uploadedAt: '2026-08-14T00:00:00Z' }] });

    expect(fixture.componentInstance.kycUploadError).toBeUndefined();
  });

  it('surfaces an upload error without refreshing status', () => {
    init();
    const file = new File(['dummy'], 'aadhaar.gif', { type: 'image/gif' });
    fixture.componentInstance.onFileSelected('AADHAAR', file);

    httpMock.expectOne('/api/associates/me/kyc/documents/AADHAAR')
      .flush({ error: 'unsupported document content type: image/gif' }, { status: 400, statusText: 'Bad Request' });

    expect(fixture.componentInstance.kycUploadError).toBe('unsupported document content type: image/gif');
    httpMock.expectNone('/api/associates/me/kyc');
  });

  it('renders a disabled bank-details section with no input fields (known data-model gap)', () => {
    init();
    const bankSection: HTMLElement | null = fixture.nativeElement.querySelector('.profile-kyc__bank-section');
    expect(bankSection).toBeTruthy();
    expect(bankSection?.querySelectorAll('input').length).toBe(0);
  });

  it('renders one upload row per hardcoded KYC document type', () => {
    init();
    const rows = fixture.nativeElement.querySelectorAll('.profile-kyc__kyc-document-row');
    expect(rows.length).toBe(3); // AADHAAR, PAN, BANK_PASSBOOK
  });

  it('shows the read-only userId and joinedAt identity strip without an editable id field', () => {
    init();
    const identity: HTMLElement | null = fixture.nativeElement.querySelector('.profile-kyc__identity');
    expect(identity?.textContent).toContain('VP00001');
    expect(fixture.nativeElement.querySelector('input[formcontrolname="id"]')).toBeFalsy();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npm test -- --watch=false --browsers=ChromeHeadless --include='**/profile-kyc.component.spec.ts'`
Expected: FAIL — `ProfileKycComponent` does not exist yet.

- [ ] **Step 3: Write the component**

Create `frontend/src/app/profile-kyc/profile-kyc.component.ts`:

```typescript
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AssociateProfileService } from './associate-profile.service';
import { AssociateKycService } from './associate-kyc.service';
import { AssociateProfileResponse } from './models/associate-profile.model';
import { AssociateKycStatusResponse, KYC_DOCUMENT_TYPES } from './models/associate-kyc-status.model';
import { FieldErrorComponent } from '../shared/components/field-error/field-error.component';
import { InlineBannerComponent } from '../shared/components/inline-banner/inline-banner.component';
import { toFieldErrors } from '../core/api/field-errors.model';

// The one editable Associate screen (role-capability spec's "Own profile" row, screen unit 14).
// Composes two independently-owned backend resources -- profile (unit 11) and KYC (unit 8) --
// behind two separate services (see this plan's Design decision 4), not a combined backend call.
@Component({
  selector: 'app-profile-kyc',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, FieldErrorComponent, InlineBannerComponent],
  template: `
    <div class="profile-kyc card">
      <h1 class="card-title">{{ 'profileKyc.title' | translate }}</h1>

      <p *ngIf="profileLoadError" class="profile-kyc__load-error">{{ 'profileKyc.profileLoadError' | translate }}</p>

      <div class="profile-kyc__identity" *ngIf="profile as p">
        <span>{{ 'profileKyc.userIdLabel' | translate }}: {{ p.userId }}</span>
        <span>{{ 'profileKyc.joinedAtLabel' | translate }}: {{ p.joinedAt | date: 'mediumDate' }}</span>
      </div>

      <form class="profile-kyc__form" [formGroup]="form" (ngSubmit)="onSubmit()" *ngIf="profile">
        <label>
          {{ 'profileKyc.nameLabel' | translate }}
          <input type="text" formControlName="name" />
        </label>
        <app-field-error [message]="fieldError('name')"></app-field-error>

        <label>
          {{ 'profileKyc.phoneLabel' | translate }}
          <input type="text" formControlName="phone" />
        </label>
        <app-field-error [message]="fieldError('phone')"></app-field-error>

        <label>
          {{ 'profileKyc.emailLabel' | translate }}
          <input type="email" formControlName="email" />
        </label>
        <app-field-error [message]="fieldError('email') || emailConflictError"></app-field-error>

        <button type="submit" [disabled]="form.invalid">{{ 'profileKyc.saveAction' | translate }}</button>
        <app-inline-banner *ngIf="saveSuccess" tone="success">{{ 'profileKyc.saveSuccess' | translate }}</app-inline-banner>
      </form>

      <section class="profile-kyc__bank-section">
        <h2>{{ 'profileKyc.bankDetails.title' | translate }}</h2>
        <app-inline-banner tone="info">{{ 'profileKyc.bankDetails.comingSoon' | translate }}</app-inline-banner>
      </section>

      <section class="profile-kyc__kyc-section">
        <h2>{{ 'profileKyc.kyc.title' | translate }}</h2>
        <p *ngIf="kycLoadError" class="profile-kyc__load-error">{{ 'profileKyc.kyc.loadError' | translate }}</p>

        <app-inline-banner *ngIf="kycStatus" [tone]="kycStatusTone(kycStatus.kycStatus)">
          {{ 'profileKyc.kyc.statusLabel' | translate: { status: kycStatusLabel(kycStatus.kycStatus) } }}
        </app-inline-banner>

        <p class="profile-kyc__kyc-preview-note">{{ 'profileKyc.kyc.noPreviewNote' | translate }}</p>

        <div class="profile-kyc__kyc-document-row" *ngFor="let docType of documentTypes">
          <span class="profile-kyc__kyc-document-label">{{ 'profileKyc.kyc.documentType.' + docType | translate }}</span>
          <span *ngIf="submittedDocument(docType) as doc" class="profile-kyc__kyc-document-meta">
            {{ 'profileKyc.kyc.submittedOn' | translate: { date: (doc.uploadedAt | date: 'mediumDate') } }}
          </span>
          <span *ngIf="!submittedDocument(docType)" class="profile-kyc__kyc-document-meta">
            {{ 'profileKyc.kyc.notSubmitted' | translate }}
          </span>
          <input type="file" [accept]="acceptTypes" (change)="onFileInputChange(docType, $event)" />
        </div>
        <app-field-error [message]="kycUploadError"></app-field-error>
      </section>
    </div>
  `
})
export class ProfileKycComponent implements OnInit {
  private fb = inject(FormBuilder);
  private associateProfileService = inject(AssociateProfileService);
  private associateKycService = inject(AssociateKycService);
  private translate = inject(TranslateService);

  readonly documentTypes = KYC_DOCUMENT_TYPES;
  readonly acceptTypes = 'image/png,image/jpeg,image/webp,application/pdf';

  form = this.fb.group({
    name: ['', Validators.required],
    phone: [''],
    email: ['', Validators.email]
  });

  profile: AssociateProfileResponse | null = null;
  kycStatus: AssociateKycStatusResponse | null = null;
  profileLoadError = false;
  kycLoadError = false;
  saveSuccess = false;
  saveError?: string;
  emailConflictError?: string;
  kycUploadError?: string;
  private serverFieldErrors: Record<string, string> = {};

  ngOnInit(): void {
    this.loadProfile();
    this.loadKycStatus();
  }

  fieldError(name: string): string | undefined {
    if (this.serverFieldErrors[name]) {
      return this.serverFieldErrors[name];
    }
    const control = this.form.get(name);
    if (!control || !control.touched || !control.errors) {
      return undefined;
    }
    if (control.errors['required']) {
      return this.translate.instant('profileKyc.validation.nameRequired');
    }
    if (control.errors['email']) {
      return this.translate.instant('profileKyc.validation.emailInvalid');
    }
    return undefined;
  }

  kycStatusTone(status: string): 'info' | 'warning' | 'success' | 'danger' {
    if (status === 'VERIFIED') return 'success';
    if (status === 'REJECTED') return 'danger';
    return 'info';
  }

  kycStatusLabel(status: string): string {
    return this.translate.instant('profileKyc.kyc.status.' + status);
  }

  submittedDocument(documentType: string) {
    return this.kycStatus?.documents.find(d => d.documentType === documentType);
  }

  onSubmit(): void {
    if (this.form.invalid) {
      return;
    }
    this.saveSuccess = false;
    this.saveError = undefined;
    this.emailConflictError = undefined;
    this.serverFieldErrors = {};

    const { name, phone, email } = this.form.getRawValue();
    this.associateProfileService.updateProfile({ name: name!, phone: phone || null, email: email || null }).subscribe({
      next: res => {
        this.profile = res;
        this.saveSuccess = true;
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 409) {
          // Flat {"error": "..."} body, not a `fields` map -- see this plan's Design decision 6.
          this.emailConflictError = err.error?.error ?? this.translate.instant('profileKyc.validation.emailTaken');
        } else {
          this.serverFieldErrors = toFieldErrors(err);
          this.saveError = this.translate.instant('profileKyc.saveError');
        }
      }
    });
  }

  onFileInputChange(documentType: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.onFileSelected(documentType, file);
    }
    input.value = '';
  }

  onFileSelected(documentType: string, file: File): void {
    this.kycUploadError = undefined;
    this.associateKycService.uploadDocument(documentType, file).subscribe({
      next: () => this.loadKycStatus(),
      error: (err: HttpErrorResponse) => {
        this.kycUploadError = err.error?.error ?? this.translate.instant('profileKyc.kyc.uploadError');
      }
    });
  }

  private loadProfile(): void {
    this.profileLoadError = false;
    this.associateProfileService.getProfile().subscribe({
      next: res => {
        this.profile = res;
        this.form.patchValue({ name: res.name, phone: res.phone, email: res.email });
      },
      error: () => (this.profileLoadError = true)
    });
  }

  private loadKycStatus(): void {
    this.kycLoadError = false;
    this.associateKycService.getStatus().subscribe({
      next: res => (this.kycStatus = res),
      error: () => (this.kycLoadError = true)
    });
  }
}
```

- [ ] **Step 4: Run the component spec to verify it passes**

Run: `cd frontend && npm test -- --watch=false --browsers=ChromeHeadless --include='**/profile-kyc.component.spec.ts'`
Expected: PASS, all 11 tests green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/profile-kyc/profile-kyc.component.ts \
        frontend/src/app/profile-kyc/profile-kyc.component.spec.ts
git commit -m "feat(profile-kyc): add ProfileKycComponent composing profile edit and KYC submission"
```

---

## Task 4: Route, nav link, i18n

**Files:**
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/app.routes.spec.ts`
- Modify: `frontend/src/app/app.component.html`
- Modify: `frontend/src/app/app.component.spec.ts` (only if it already asserts nav-link presence — read it first)
- Modify: `frontend/src/assets/i18n/en.json`
- Modify: `frontend/src/assets/i18n/hi.json`

**Interfaces:**
- Consumes: `ProfileKycComponent` (Task 3), `authGuard`, `associateOnlyGuard` (existing).
- Produces: route `profile` → `ProfileKycComponent`, guarded identically to `dashboard`/`sales-history`; nav link at `/profile`.

- [ ] **Step 1: Add the route**

In `frontend/src/app/app.routes.ts`, add the import:

```typescript
import { ProfileKycComponent } from './profile-kyc/profile-kyc.component';
```

And add the route entry directly after `sales-history` (same associate-only grouping):

```typescript
  { path: 'sales-history', component: SalesHistoryComponent, canActivate: [authGuard, associateOnlyGuard] },
  { path: 'profile', component: ProfileKycComponent, canActivate: [authGuard, associateOnlyGuard] },
```

- [ ] **Step 2: Add the route guard test**

In `frontend/src/app/app.routes.spec.ts`, add directly after the existing `sales-history` guard test:

```typescript
  it('guards the profile route with authGuard and associateOnlyGuard', () => {
    const route = routes.find(r => r.path === 'profile');

    expect(route).toBeTruthy();
    expect(route!.canActivate).toContain(authGuard);
    expect(route!.canActivate).toContain(associateOnlyGuard);
  });
```

- [ ] **Step 3: Add the nav link**

In `frontend/src/app/app.component.html`, add directly after the Sales History link (same `*ngIf="!isAdminFamily"` guard):

```html
    <a *ngIf="!isAdminFamily" class="app-nav__link" routerLink="/profile" routerLinkActive="app-nav__link--active">{{ 'nav.profileKyc' | translate }}</a>
```

- [ ] **Step 4: Check `app.component.spec.ts` for existing nav-link assertions**

Read `frontend/src/app/app.component.spec.ts` in full. If it already asserts the exact set/count of associate-only nav links (e.g. asserting `app-nav__link` count or iterating expected `routerLink` values), add the new `/profile` link to that assertion so the test doesn't silently pass with a stale expected list. If it doesn't assert nav-link presence at all today, no test change is needed here — don't invent a new test class of assertion this file doesn't already have.

- [ ] **Step 5: Add i18n keys**

In `frontend/src/assets/i18n/en.json`, add to the `nav` object:

```json
    "profileKyc": "Profile"
```

And add a new top-level `profileKyc` section (placed after `salesHistory`, matching the existing associate-screen grouping order):

```json
  "profileKyc": {
    "title": "Profile & Bank/KYC Details",
    "profileLoadError": "Something went wrong loading your profile. Please try again.",
    "userIdLabel": "Associate ID",
    "joinedAtLabel": "Joined",
    "nameLabel": "Full Name",
    "phoneLabel": "Phone",
    "emailLabel": "Email",
    "saveAction": "Save Changes",
    "saveSuccess": "Profile updated.",
    "saveError": "Something went wrong saving your profile. Please try again.",
    "validation": {
      "nameRequired": "Name is required.",
      "emailInvalid": "Enter a valid email address.",
      "emailTaken": "This email is already registered to another account."
    },
    "bankDetails": {
      "title": "Bank Details",
      "comingSoon": "Bank account details aren't collectible yet — this is coming in a future update."
    },
    "kyc": {
      "title": "KYC Documents",
      "loadError": "Something went wrong loading your KYC status. Please try again.",
      "statusLabel": "KYC status: {{status}}",
      "status": {
        "PENDING": "Pending review",
        "VERIFIED": "Verified",
        "REJECTED": "Rejected — please resubmit"
      },
      "noPreviewNote": "Previously submitted documents can't be previewed here yet — only their submission date is shown.",
      "documentType": {
        "AADHAAR": "Aadhaar Card",
        "PAN": "PAN Card",
        "BANK_PASSBOOK": "Bank Passbook"
      },
      "submittedOn": "Submitted on {{date}}",
      "notSubmitted": "Not submitted",
      "uploadError": "Something went wrong uploading this document. Please try again."
    }
  },
```

In `frontend/src/assets/i18n/hi.json`, add the matching `nav.profileKyc` key and `profileKyc` section with Hindi translations, in the same position, following this file's existing translation conventions (verify its current structure/tone against `en.json`'s `salesHistory`/`dashboard` sections before writing new Hindi copy — don't guess the phrasing style this file has already established elsewhere).

- [ ] **Step 6: Run the full frontend suite**

Run: `cd frontend && npm test -- --watch=false --browsers=ChromeHeadless`
Expected: PASS, including the new `app.routes.spec.ts` test and (if added) the updated `app.component.spec.ts` nav assertion, with no regressions to any existing spec.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/app.routes.ts \
        frontend/src/app/app.routes.spec.ts \
        frontend/src/app/app.component.html \
        frontend/src/app/app.component.spec.ts \
        frontend/src/assets/i18n/en.json \
        frontend/src/assets/i18n/hi.json
git commit -m "feat(profile-kyc): wire the Profile & Bank/KYC Details route, nav link, and i18n"
```

---

## Self-review notes

- **Spec coverage**: "View and edit own profile — name, contact" → Task 3's form (`name`/`phone`/`email`) bound to unit 11's `GET`/`PUT /api/associates/me/profile`. "KYC docs" → Task 3's per-document-type upload rows bound to unit 8's `GET`/`POST /api/associates/me/kyc...`. "Bank details" → Design decision 1: honestly flagged as a known data-model gap via a disabled section, not invented, not silently dropped. "The one editable screen" → confirmed no other write action is added; every other associate screen in the spec's list remains untouched by this unit.
- **Placeholder scan**: no TBD/TODO markers; every step has literal file contents.
- **Type consistency**: `AssociateProfileService.getProfile/.updateProfile` and `AssociateKycService.getStatus/.uploadDocument` signatures declared in Task 2 match exactly how Task 3's `ProfileKycComponent` calls them. Frontend model field names (Task 1) were checked against the actual merged backend records (`AssociateProfileResponse.java`, `UpdateAssociateProfileRequest.java`, `AssociateKycStatusResponse.java`, `KycDocumentSummary.java`, `KycStatus.java`), not copied from the unit 8/11 plan files without verification — in this case they matched exactly, but that was confirmed by direct read.
- **New gaps found and documented, not silently worked around**: (1) no associate-reachable endpoint exposes the admin-configured KYC required-document list (`GET /api/company/kyc` is ADMIN-only) — this screen hardcodes three document-type slugs instead; (2) no endpoint serves raw KYC document bytes back to the associate (not even the admin review queue has one) — previously-submitted documents show metadata only, no thumbnail. Both are called out in Design decisions 2 and 3 and should be read by whoever scopes a future "KYC document management" follow-up unit.
