# Phase 12 — Company Settings + Audit Log

Final phase of the setup/onboarding build. Phases 0–11 are confirmed implemented and merged on `master` — verified directly (not assumed) by reading the current repo: `com.plotchain.company` already has 26 classes (CompanyProfile, CompanyBranding, SetupState, AdminProvisioning, RootAssociateProvisioning + their controllers/DTOs/exceptions), migrations run through `V11__associate_phone.sql` (V12 is free), and the frontend has all 8 real step components wired into `/setup/*` plus a deliberate one-file placeholder at `frontend/src/app/settings/settings-shell.component.ts` whose own comment says "Phase 12 extends this same file rather than creating it from scratch." Full roadmap: `docs/superpowers/plans/2026-07-30-setup-onboarding.md` (its "Phase 12" section, lines 359–367). Spec: `setup-onboarding-spec.md`. Design: `ChatGPT Image Jul 29, 2026, 11_07_58 PM.png`.

## Context

Every prior phase built one wizard step and made `SetupStateService` report its completeness. Nothing today lets an admin **see or change any of it after Go Live** except by re-visiting `/setup/*` URLs directly (blocked post-launch by `launchedModeGuard`), and nothing records **who changed what, when** — a real gap once more than one admin-family account exists (Phase 10 made that possible). Phase 12 closes both: a `/settings` area with a left nav over the seven config sections (reusing the exact same step form components in a `mode="settings"` variant, per the master plan's explicit reuse decision) plus an eighth "Audit Log" section, and a `SettingsAuditService` that every settings-mutating service calls on every write.

Outcome: post-launch, an admin lands on `/settings`, sees seven read-only summary cards (plus the compensation card's live "Current Version vX.X (Effective …)" + View History), can click into any section to edit it in place, and can open Audit Log to see a paginated, filterable, newest-first ledger of every change anyone has made.

## Decisions (made now — do not re-litigate)

1. **Audit sections collapse Payments & KYC's four backing tables into one `PAYMENTS_KYC` value** (confirmed with the user). `PaymentConfig`, `PayoutBankAccount`, `KycConfig`, `WithdrawalConfig` all record under `PAYMENTS_KYC` — matches the one settings-nav item and one filter-dropdown entry. The CHECK constraint has exactly 7 values: `COMPANY_PROFILE, BRANDING, COMPENSATION, PROJECTS, PAYMENTS_KYC, ADMIN_TEAM, ROOT_ASSOCIATES`.
2. **Append-only, no update/delete endpoint, entity has no setters after construction** — mirrors `compensation_plan_version`'s "append a new version, never mutate a row" shape (V8), not a singleton table. `settings_audit_log` has no `singleton_guard`.
3. **Detail JSON reuses existing `*Response` records** for before/after snapshots via the auto-configured Spring Boot `ObjectMapper` — no new snapshot DTOs, **except**:
   - `PayoutBankAccountResponse` carries the **raw `accountNumber`** (confirmed by reading the record — unlike `PaymentConfigResponse`, which already masks credentials behind `credentialsConfigured: boolean`). Its audit detail must **never** serialize the response directly; build `Map.of("bankName", ..., "accountHolder", ..., "maskedAccountNumber", lastFour, "ifscCode", ..., "accountType", ...)` instead.
   - `CreateAdminResponse` and `CreateRootAssociateResponse`/`RootAssociateCreationResult` carry a **one-time plaintext `temporaryPassword`**. Never serialize these directly either — build ad-hoc maps with just `userId`/`fullName`/`role` (admin) or `userId`/`name`/`slotLabel` (root associate).
   - Every other mutating method's before/after snapshot is its real `*Response` record — safe as-is (`CompanyProfileResponse`, `CompanyBrandingResponse`, `PaymentConfigResponse`, `KycConfigResponse`, `WithdrawalConfigResponse`, `ProjectResponse`, `PlotResponse` all confirmed to carry no secrets).
4. **`@AuthenticationPrincipal UUID actorId` is added to every mutating controller method that lacks it today.** `CompensationPlanController.update` is the only existing example of this pattern (`@AuthenticationPrincipal UUID adminId` already threaded to `updatePlan`) — every other mutating controller (`CompanyProfileController`, `CompanyBrandingController` ×2, `PaymentConfigController`, `PayoutBankAccountController`, `KycConfigController`, `WithdrawalConfigController`, `ProjectController` ×4, `PlotController` ×3, `PlotCsvController`, `AdminController`, `RootAssociateController`) gets the same parameter added and threaded to its service, which gains a matching new constructor dependency on `SettingsAuditService`.
5. **No new exception type.** Audit-log has no mutating endpoint of its own (it's written internally only); an unrecognized `section` filter value just yields an empty page, and unguarded negative `page`/`size` has the same risk profile `PlotController.list` already ships with today — consistent with precedent, not a gap unique to this phase.
6. **Pagination copies `PlotService.list()`/`PlotController.list()` exactly** — `Page<T>` + `PageRequest.of(page, size)`, `page`/`size` query params with `@RequestParam(defaultValue = ...)`, a flat response record `(entries, page, size, totalElements)`. This is the one existing paginated endpoint in the codebase; no new pagination idiom is introduced.
7. **`mode` input lands on 7 of the 8 step components, not `ReviewLaunchStepComponent`.** The master plan's own settings-shell description says "the left nav (**the seven sections** + Audit Log)" — Review & Launch (accept terms, Go Live) has no meaning once already launched and has no settings-nav entry, so it is not given a `mode` input or a `/settings/review-launch` route.
8. **Settings-mode "Save" does not add a new HTTP call.** Every step already autosaves on 400ms-debounced `valueChanges` (confirmed in `CompanyProfileStepComponent` and by pattern in every other step) — that persistence layer is unchanged. In `mode="settings"`, `SetupStepNavComponent` swaps the Previous/Next buttons for one "Save" button whose only job is `router.navigate(['/settings'])`; the data is already persisted by the time it's clicked.
9. **`app.config.ts` gains `withComponentInputBinding()`** on `provideRouter(routes, withComponentInputBinding())` — this codebase has no other mechanism to bind a route's static `data: { mode: 'settings' }` into a component's real `@Input()` (today `data` is only ever read manually via `ActivatedRoute.snapshot`, e.g. in `setup-shell.component.ts`). Verified safe to enable: no existing routed component declares an `@Input()` whose name collides with any `data`/param key used anywhere in `app.routes.ts` (`stepKey`, `sectionKey`, `mode` are all new or step-scoped). `PaymentsKycStepComponent`'s existing `*ngFor="let mode of modeOptions"` is a template-local loop variable scoped to one `<label>` block, not a class member — it does not collide with the new class-level `@Input() mode`, though it is renamed to `paymentMode` in Task 12.9 for readability.
10. **New backend classes live in `com.plotchain.company`** (not a new top-level package) — same reasoning as Phase 10's `AdminProvisioningService`: this is core company/settings infrastructure spanning every domain, not a dedicated-schema feature.
11. **`editable-table` is not reused for the audit-log list** — it's shaped for inline add/remove-row editing (royalty/reward-tier config), and audit rows are pure read-only history. The audit-log component renders its rows with plain inline markup instead, matching Phase 10's precedent of not force-fitting a shared component that doesn't actually fit (that phase made the same call for the admin roster table).
12. **Edit/Manage card action labels are per-card-configurable translation keys**, not a hardcoded fixed split — no mockup detail specifies which card gets which verb, so `settings.cards.<key>.actionLabel` is filled in per card as a plain string, decided during execution once the exact wording is confirmed against the mockup.

## Constraints carried forward (still true, unchanged)

- Money: `BigDecimal`/`NUMERIC(14,2)` — not applicable here (no new monetary columns), but `PayoutBankAccountResponse` masking still applies to protect the account number.
- `ddl-auto: validate` — `V12__settings_audit_log.sql` must land in the same commit as `SettingsAuditLog`.
- No `@ManyToOne`; raw `UUID` FK fields (`changedByAssociateId`), app-assigned `UUID.randomUUID()` ids.
- Mock **interfaces only** in service tests (`@Mock SettingsAuditLogRepository`, `@Mock AssociateRepository`); real Spring context + `@MockBean` repositories in controller tests, exactly like `CompanyProfileControllerTest`.
- `SecurityConfig` is first-match-wins; the new GET matcher goes in the existing admin-family GET block (after line 138, before line 144), with the same explanatory-comment convention every prior phase used; `SecurityConfigTest` gains a case.
- Zero hardcoded strings; every new `settings.*` key lands in `en.json` and `hi.json` in the same commit as the component/service that introduces it (not deferred to one final catch-all commit, per the repo's own "zero hardcoded strings" rule — Task 12.13's i18n task exists only to cover the settings-shell/nav/overview keys that don't belong to any one earlier task).
- Conventional Commits, footer `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## Task 12.1 — Migration + entity + repository + `SettingsAuditService`

**Create** `backend/src/main/resources/db/migration/V12__settings_audit_log.sql`:
```sql
-- Read-only, append-only ledger backing GET /api/company/audit-log. Every settings-mutating
-- service inserts exactly one row via SettingsAuditService.record(...); there is deliberately
-- no UPDATE/DELETE path anywhere. section mirrors the seven settings-nav keys, not one value per
-- backend microservice: Payments & KYC's four backing tables (PaymentConfig/PayoutBankAccount/
-- KycConfig/WithdrawalConfig) all record under the single PAYMENTS_KYC value, matching the one
-- settings-nav item and filter-dropdown entry.
CREATE TABLE settings_audit_log (
    id UUID PRIMARY KEY,
    changed_by_associate_id UUID REFERENCES associate(id),
    section VARCHAR(32) NOT NULL,
    summary TEXT NOT NULL,
    detail TEXT,
    changed_at TIMESTAMP NOT NULL,
    CONSTRAINT chk_settings_audit_log_section CHECK (section IN (
        'COMPANY_PROFILE', 'BRANDING', 'COMPENSATION', 'PROJECTS',
        'PAYMENTS_KYC', 'ADMIN_TEAM', 'ROOT_ASSOCIATES'
    ))
);
CREATE INDEX idx_settings_audit_changed_at ON settings_audit_log(changed_at DESC);
```

**Create**, package `com.plotchain.company`:

`SettingsAuditLog.java` — `@Entity`, no setters (append-only enforced at the entity level too, not just "no endpoint exists"):
```java
@Entity
@Table(name = "settings_audit_log")
public class SettingsAuditLog {
    @Id
    private UUID id;
    @Column(name = "changed_by_associate_id")
    private UUID changedByAssociateId;
    private String section;
    private String summary;
    private String detail;
    @Column(name = "changed_at")
    private Instant changedAt;

    protected SettingsAuditLog() {}

    public SettingsAuditLog(UUID id, UUID changedByAssociateId, String section, String summary, String detail, Instant changedAt) {
        this.id = id;
        this.changedByAssociateId = changedByAssociateId;
        this.section = section;
        this.summary = summary;
        this.detail = detail;
        this.changedAt = changedAt;
    }

    public UUID getId() { return id; }
    public UUID getChangedByAssociateId() { return changedByAssociateId; }
    public String getSection() { return section; }
    public String getSummary() { return summary; }
    public String getDetail() { return detail; }
    public Instant getChangedAt() { return changedAt; }
}
```

`SettingsAuditLogRepository.java`:
```java
public interface SettingsAuditLogRepository extends JpaRepository<SettingsAuditLog, UUID> {
    Page<SettingsAuditLog> findAllByOrderByChangedAtDesc(Pageable pageable);
    Page<SettingsAuditLog> findAllBySectionOrderByChangedAtDesc(String section, Pageable pageable);
}
```

`SettingsAuditService.java` — constructor `(SettingsAuditLogRepository, AssociateRepository, ObjectMapper)`:
```java
@Service
public class SettingsAuditService {
    private final SettingsAuditLogRepository settingsAuditLogRepository;
    private final AssociateRepository associateRepository;
    private final ObjectMapper objectMapper;

    public SettingsAuditService(SettingsAuditLogRepository settingsAuditLogRepository,
                                 AssociateRepository associateRepository,
                                 ObjectMapper objectMapper) {
        this.settingsAuditLogRepository = settingsAuditLogRepository;
        this.associateRepository = associateRepository;
        this.objectMapper = objectMapper;
    }

    public void record(String section, String summary, Object detail, UUID actorId) {
        settingsAuditLogRepository.save(new SettingsAuditLog(
            UUID.randomUUID(), actorId, section, summary, toJson(detail), Instant.now()));
    }

    public SettingsAuditPageResponse list(String section, int page, int size) {
        Page<SettingsAuditLog> result = (section == null || section.isBlank())
            ? settingsAuditLogRepository.findAllByOrderByChangedAtDesc(PageRequest.of(page, size))
            : settingsAuditLogRepository.findAllBySectionOrderByChangedAtDesc(section, PageRequest.of(page, size));

        Map<UUID, Associate> actorsById = associateRepository.findAllById(
            result.getContent().stream()
                .map(SettingsAuditLog::getChangedByAssociateId)
                .filter(Objects::nonNull)
                .distinct()
                .toList()
        ).stream().collect(Collectors.toMap(Associate::getId, a -> a));

        List<SettingsAuditEntryResponse> entries = result.getContent().stream()
            .map(entry -> toResponse(entry, actorsById.get(entry.getChangedByAssociateId())))
            .toList();
        return new SettingsAuditPageResponse(entries, page, size, result.getTotalElements());
    }

    private String toJson(Object detail) {
        try {
            return objectMapper.writeValueAsString(detail);
        } catch (JsonProcessingException e) {
            throw new UncheckedIOException(new IOException(e));
        }
    }

    private static SettingsAuditEntryResponse toResponse(SettingsAuditLog entry, Associate actor) {
        return new SettingsAuditEntryResponse(
            entry.getId(),
            entry.getChangedByAssociateId(),
            actor != null ? actor.getName() : null,
            actor != null ? actor.getUserId() : null,
            entry.getSection(),
            entry.getSummary(),
            entry.getDetail(),
            entry.getChangedAt()
        );
    }
}
```

`SettingsAuditEntryResponse.java`:
```java
public record SettingsAuditEntryResponse(
    UUID id, UUID changedByAssociateId, String changedByName, String changedByUserId,
    String section, String summary, String detail, Instant changedAt) {}
```

`SettingsAuditPageResponse.java`:
```java
public record SettingsAuditPageResponse(List<SettingsAuditEntryResponse> entries, int page, int size, long totalElements) {}
```

**Tests** — `SettingsAuditServiceTest` (`@ExtendWith(MockitoExtension.class)`, `@Mock SettingsAuditLogRepository`, `@Mock AssociateRepository`, a **real** `new ObjectMapper()` — not mocked, since serialization correctness is exactly what's under test):
- `recordSavesARowWithGeneratedIdActorSectionSummaryAndSerializedDetail`
- `recordSerializesAnArbitraryDetailObjectToJsonViaObjectMapper`
- `listReturnsNewestFirstPageResponseWhenNoSectionFilterGiven` (verifies `findAllByOrderByChangedAtDesc` called, not the section-filtered method)
- `listFiltersBySectionWhenProvided` (verifies `findAllBySectionOrderByChangedAtDesc` called with the given value)
- `listResolvesChangedByNameAndUserIdFromAssociateRepositoryForEachDistinctActor`
- `listLeavesChangedByNameAndUserIdNullWhenChangedByAssociateIdIsNull`

Commit: `feat(company): add settings audit log infrastructure`

---

## Task 12.2 — `SettingsAuditController` + `SecurityConfig` matcher

**Create** `company/SettingsAuditController.java`:
```java
@RestController
@RequestMapping("/api/company/audit-log")
public class SettingsAuditController {
    private final SettingsAuditService settingsAuditService;

    public SettingsAuditController(SettingsAuditService settingsAuditService) {
        this.settingsAuditService = settingsAuditService;
    }

    @GetMapping
    public SettingsAuditPageResponse list(
            @RequestParam(required = false) String section,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return settingsAuditService.list(section, page, size);
    }
}
```

**Modify** `auth/SecurityConfig.java` — insert immediately after the Phase-11 root-associates GET matcher (currently the last admin-family GET matcher, right before the Phase-5 public-`permitAll()` block), same comment convention as its seven predecessors:
```java
                // Same reasoning as setup-state/profile/branding/compensation/payments/projects/
                // admin-team/root-associates above: the audit-log GET stays admin-family-only.
                // There is no mutating endpoint for this resource at all (append-only, written
                // internally by SettingsAuditService) -- deliberately no write matcher.
                .requestMatchers(HttpMethod.GET, "/api/company/audit-log")
                    .hasAnyAuthority("ADMIN", "SUPER_ADMIN", "FINANCE", "KYC_REVIEWER", "SUPPORT")
```

**Tests**:
- `SettingsAuditControllerTest` (`@SpringBootTest` + `@AutoConfigureMockMvc` + `@ActiveProfiles("test")` + `@MockBean SettingsAuditLogRepository` + `@MockBean AssociateRepository`, mirrors `CompanyProfileControllerTest`): `listReturnsThePageResponseFromTheService`, `listPassesSectionQueryParamThrough`, `listDefaultsPageAndSizeWhenOmitted`, `listIsForbiddenForAnAssociateToken`.
- `SecurityConfigTest` — new case: `auditLogIsReachableForEveryAdminFamilyTokenAndForbiddenForAssociate` (parameterized like the file's existing per-endpoint cases).

Commit: `feat(company): add SettingsAuditController and scope it to admin-family roles`

---

## Task 12.3 — Wire the hook: Company Profile + Branding

**Modify** `company/CompanyProfileService.java` — add `SettingsAuditService` to the constructor; in `updateProfile`, capture the before-snapshot (`toResponse(profile)` on the *current* row, before mutating it) and call the hook after `save`:
```java
public CompanyProfileResponse updateProfile(CompanyProfileRequest request, UUID actorId) {
    CompanyProfile profile = currentProfile();
    CompanyProfileResponse before = toResponse(profile);
    profile.setDisplayName(request.displayName());
    // ...unchanged field assignments...
    profile.setUpdatedAt(Instant.now());
    companyProfileRepository.save(profile);
    CompanyProfileResponse after = toResponse(profile);
    settingsAuditService.record("COMPANY_PROFILE", "Updated company profile",
        Map.of("before", before, "after", after), actorId);
    return after;
}
```

**Modify** `company/CompanyProfileController.java` — `updateProfile` gains `@AuthenticationPrincipal UUID actorId`, passes it through.

**Modify** `company/CompanyBrandingService.java` — same shape for `updateBranding` (section `"BRANDING"`, summary `"Updated branding"`, before/after `CompanyBrandingResponse`) and `uploadLogo` (section `"BRANDING"`, summary `"Uploaded " + variant + " logo"`, detail `Map.of("variant", variant, "contentType", contentType)` — no before/after needed since there's no prior "response" shape for a logo upload, just the fact it happened).

**Modify** `company/CompanyBrandingController.java` — `updateBranding` and `uploadLogo` both gain `@AuthenticationPrincipal UUID actorId`.

**Tests**:
- `CompanyProfileServiceTest` + `updateProfileRecordsAnAuditEntryWithBeforeAndAfterSnapshots` (`@Mock SettingsAuditService`, `verify(settingsAuditService).record(eq("COMPANY_PROFILE"), anyString(), any(), eq(actorId))`); existing tests updated to pass an actor UUID and the new mock into the constructor.
- `CompanyBrandingServiceTest` + `updateBrandingRecordsAnAuditEntry`, `uploadLogoRecordsAnAuditEntryWithTheVariantName`.
- `CompanyProfileControllerTest` / `CompanyBrandingControllerTest` — existing PUT/POST tests still pass (principal is supplied by `tokenFor(...)`'s JWT automatically, same as `CompensationPlanControllerTest` already does for its PUT).

Commit: `feat(company): audit company profile and branding changes`

---

## Task 12.4 — Wire the hook: Compensation Plan

**Modify** `compensation/CompensationPlanService.java` — `updatePlan` already receives `adminId`; add the `SettingsAuditService` constructor dependency and one call after `saveRewardTiers`/before the `return`:
```java
settingsAuditService.record("COMPENSATION",
    "Updated compensation plan (" + versionLabel + ")",
    Map.of("versionLabel", newVersion.getVersionLabel(), "effectiveFrom", newVersion.getEffectiveFrom()),
    adminId);
```
No controller change needed — `CompensationPlanController.update` already passes `@AuthenticationPrincipal UUID adminId` through.

**Tests**: `CompensationPlanServiceTest` + `updatePlanRecordsAnAuditEntryForTheNewVersion` (`verify(settingsAuditService).record(eq("COMPENSATION"), anyString(), any(), eq(ADMIN_ID))`, reusing the test class's existing `ADMIN_ID` fixture).

Commit: `feat(compensation): audit compensation plan updates`

---

## Task 12.5 — Wire the hook: Payments & KYC (4 services)

**Modify**, each identically shaped (section `"PAYMENTS_KYC"` for all four):
- `payments/PaymentConfigService.updateConfig` — summary `"Updated payment gateway configuration"`, detail = before/after `PaymentConfigResponse` (already credential-safe).
- `payments/PayoutBankAccountService.updateAccount` — summary `"Updated payout bank account"`, detail built as `Map.of("bankName", account.getBankName(), "accountHolder", account.getAccountHolder(), "maskedAccountNumber", maskAccountNumber(account.getAccountNumber()), "ifscCode", account.getIfscCode(), "accountType", account.getAccountType())` for both before and after — **never** pass the raw `PayoutBankAccountResponse` (decision 3). Add a small private `maskAccountNumber(String)` helper: `"*".repeat(Math.max(0, value.length() - 4)) + value.substring(Math.max(0, value.length() - 4))`.
- `payments/KycConfigService.updateConfig` — summary `"Updated KYC requirements"`, before/after `KycConfigResponse`.
- `payments/WithdrawalConfigService.updateConfig` — summary `"Updated withdrawal approval settings"`, before/after `WithdrawalConfigResponse`.

**Modify** the four corresponding controllers (`PaymentConfigController`, `PayoutBankAccountController`, `KycConfigController`, `WithdrawalConfigController`) — each `updateConfig`/`updateAccount` gains `@AuthenticationPrincipal UUID actorId`.

**Tests**: one new case per service test — `updateConfigRecordsAnAuditEntry` (×3) and `updateAccountRecordsAnAuditEntryWithAMaskedAccountNumber` for `PayoutBankAccountServiceTest` specifically asserting the captured detail map's `maskedAccountNumber` value does **not** contain the full original account number.

Commit: `feat(payments): audit payment, payout, kyc, and withdrawal config changes`

---

## Task 12.6 — Wire the hook: Projects, Plots, CSV import

**Modify** `projects/ProjectService.java`:
- `create` — summary `"Created project " + project.getName()"`, detail = `after` snapshot only (`toResponse(project)`).
- `update` — summary `"Updated project " + project.getName()"`, before snapshot captured from `findOrThrow(id)` **before** mutating fields, after from the saved result.
- `delete` — the method already does `Project project = findOrThrow(id);` before the plots-check and delete — reuse that exact fetched instance for the "deleted" snapshot (no extra query). Summary `"Deleted project " + project.getName()"`, detail `Map.of("deleted", toResponse(project))`.
- `uploadThumbnail` — summary `"Uploaded thumbnail for project " + project.getName()"`, detail `Map.of("projectId", id, "contentType", contentType)`.

**Modify** `projects/PlotService.java` — `create`/`update`/`delete`, same before/after-snapshot shape as Company Profile, summaries use `plotNo` only (`"Created plot " + request.plotNo()"`, etc. — **not** the parent project's name; `PlotService` has no dependency on project data today and adding one solely for a nicer summary string would ripple into its constructor and test setup beyond what this task needs).

**Modify** `projects/PlotCsvService.java` — `commit` records **after** the existing re-validate-and-reject-on-any-error logic succeeds (so a rejected import never writes an audit row): summary `"Bulk-imported " + rowCount + " plots via CSV"`, detail `Map.of("projectId", projectId, "rowCount", rowCount)`.

All four's section is `"PROJECTS"`.

**Modify** `projects/ProjectController.java` — `create`, `update`, `delete`, `uploadThumbnail` each gain `@AuthenticationPrincipal UUID actorId`.
**Modify** `projects/PlotController.java` — `create`, `update`, `delete` each gain `@AuthenticationPrincipal UUID actorId`.
**Modify** `projects/PlotCsvController.java` — `commit` gains `@AuthenticationPrincipal UUID actorId`.

**Tests**: `ProjectServiceTest` + `createRecordsAnAuditEntry`, `updateRecordsAnAuditEntry`, `deleteRecordsAnAuditEntryUsingTheSnapshotCapturedBeforeDeletion`, `uploadThumbnailRecordsAnAuditEntry`. `PlotServiceTest` + `createRecordsAnAuditEntry`, `updateRecordsAnAuditEntry`, `deleteRecordsAnAuditEntry`. `PlotCsvServiceTest` + `commitRecordsAnAuditEntryWithTheRowCount`, `commitDoesNotRecordAnAuditEntryWhenValidationFails`.

Commit: `feat(projects): audit project, plot, and csv import changes`

---

## Task 12.7 — Wire the hook: Admin Team & Root Associates

**Modify** `company/AdminProvisioningService.java` — `create`, after `associateRepository.save(admin)`: summary `"Created admin " + request.userId() + " (" + role.name() + ")"`, detail `Map.of("userId", request.userId(), "fullName", request.fullName(), "role", role.name())` — **never** the `temporaryPassword` (decision 3). Section `"ADMIN_TEAM"`.

**Modify** `company/RootAssociateProvisioningService.java` — `create`, after both roots are provisioned: summary `"Seeded root associate(s)"`, detail:
```java
Map.of(
    "left", Map.of("userId", left.userId(), "name", left.name(), "slotLabel", left.slotLabel()),
    "right", right != null
        ? Map.of("userId", right.userId(), "name", right.name(), "slotLabel", right.slotLabel())
        : null
)
```
Section `"ROOT_ASSOCIATES"`. Never the `temporaryPassword` field of either `RootAssociateCreationResult`.

**Modify** `company/AdminController.java` — `create` gains `@AuthenticationPrincipal UUID actorId`.
**Modify** `company/RootAssociateController.java` — `create` gains `@AuthenticationPrincipal UUID actorId`.

**Tests**: `AdminProvisioningServiceTest` + `createRecordsAnAuditEntryWithoutLeakingTheTemporaryPassword` (captures the detail argument, asserts it's a `Map` and does not `toString().contains(temporaryPassword)`). `RootAssociateProvisioningServiceTest` + `createRecordsAnAuditEntryForLeftRootOnly`, `createRecordsAnAuditEntryForBothRootsWhenRightRootIsSeeded`.

Commit: `feat(company): audit admin and root-associate provisioning`

---

## Task 12.8 — Frontend: `SetupStepNavComponent` gains `mode`

**Modify** `frontend/src/app/shared/components/setup-step-nav/setup-step-nav.component.ts`:
```ts
@Input() mode: 'setup' | 'settings' = 'setup';

goBackToSettings(): void {
  this.router.navigate(['/settings']);
}
```
Template — wrap the existing Previous/Next buttons in `*ngIf="mode === 'setup'"` and add a settings-mode Save button:
```html
<div class="setup-step-nav">
  <span class="setup-step-nav__saved" *ngIf="savedJustNow">{{ 'setup.savedIndicator' | translate }}</span>
  <span class="setup-step-nav__spacer"></span>
  <ng-container *ngIf="mode === 'setup'">
    <app-brand-button *ngIf="previousPath" class="setup-step-nav__previous" variant="ghost" type="button" (clicked)="goPrevious()">
      {{ 'setup.actions.previous' | translate }}
    </app-brand-button>
    <app-brand-button *ngIf="nextPath" class="setup-step-nav__next" variant="primary" type="button" (clicked)="goNext()">
      {{ 'setup.actions.next' | translate }}
    </app-brand-button>
  </ng-container>
  <app-brand-button *ngIf="mode === 'settings'" class="setup-step-nav__save" variant="primary" type="button" (clicked)="goBackToSettings()">
    {{ 'settings.actions.save' | translate }}
  </app-brand-button>
</div>
```

**Tests**: `setup-step-nav.component.spec.ts` + `hidesPreviousAndNextWhenModeIsSettings`, `showsASaveButtonThatNavigatesToSettingsWhenModeIsSettings`, `defaultsToSetupModeAndShowsPreviousNextWhenInputOmitted`.

Commit: `feat(setup): add settings-mode footer to the shared step nav`

---

## Task 12.9 — Frontend: roll `mode` input into the 7 step components

**Exemplar — `frontend/src/app/setup/steps/company-profile/company-profile-step.component.ts`**:
```ts
@Input() mode: 'setup' | 'settings' = 'setup';
```
Template's existing `<app-setup-step-nav>` line becomes:
```html
<app-setup-step-nav [previousPath]="previousPath" [nextPath]="nextPath" [savedJustNow]="savedJustNow" [mode]="mode"></app-setup-step-nav>
```
That's the entire diff — the form, validation, preview, and `save()` logic are untouched; only the footer's `mode` needs threading through.

**Apply the identical two-line diff** (`@Input() mode` + `[mode]="mode"` on the nav) to:
- `frontend/src/app/setup/steps/branding/branding-step.component.ts`
- `frontend/src/app/setup/steps/compensation/compensation-step.component.ts`
- `frontend/src/app/setup/steps/projects/projects-step.component.ts`
- `frontend/src/app/setup/steps/admin-team/admin-team-step.component.ts`
- `frontend/src/app/setup/steps/root-associates/root-associates-step.component.ts`

**`frontend/src/app/setup/steps/payments-kyc/payments-kyc-step.component.ts`** gets the same two-line diff, plus: rename the existing `*ngFor="let mode of modeOptions"` template-local variable (and its 1-2 other references in that same block) to `paymentMode`, so `mode` unambiguously refers to the new `@Input()` everywhere else in the file.

**`ReviewLaunchStepComponent` is deliberately excluded** (decision 7) — no `mode` input, no `/settings/review-launch` route.

**Tests**: extend `company-profile-step.component.spec.ts` with `hidesPreviousNextWhenModeIsSettings` and `passesSettingsModeThroughToTheStepNav` (spy/query the child `<app-setup-step-nav>`'s bound `mode`). One matching pair of assertions added to each of the other 6 components' existing `.spec.ts` files.

Commit: `feat(setup): support settings mode across all seven step components`

---

## Task 12.10 — `app.config.ts`: enable router component-input binding

**Modify** `frontend/src/app/app.config.ts`:
```ts
import { provideRouter, withComponentInputBinding } from '@angular/router';
// ...
provideRouter(routes, withComponentInputBinding()),
```

**Tests**: no new spec needed (this is enabling a documented Angular router feature, not new business logic); Task 12.9's and Task 12.12's specs exercising `[mode]`/route-data binding are what actually verifies it end-to-end once routes exist (Task 12.11).

Commit: `feat(core): enable router component input binding`

---

## Task 12.11 — Frontend: settings-shell + nav-rail rewrite

**Create** `frontend/src/app/settings/models/settings-section.model.ts`:
```ts
export const SECTION_PATHS: Record<string, string> = {
  companyProfile: 'company-profile',
  branding: 'branding',
  compensation: 'compensation',
  projects: 'projects',
  paymentsKyc: 'payments-kyc',
  adminTeam: 'admin-team',
  rootAssociates: 'root-associates'
  // auditLog deliberately absent: it isn't a wrapped step component and has its own route,
  // added directly in SettingsNavRailComponent's template rather than via this shared map.
};
```

**Create** `frontend/src/app/settings/settings-nav-rail.component.ts` (+ `.spec.ts`) — simpler than `setup-progress-rail` (no percent bar, no completion checkmarks): 7 links from `SECTION_PATHS` plus a hardcoded 8th link to Audit Log.
```ts
@Component({
  selector: 'app-settings-nav-rail',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslateModule],
  template: `
    <nav class="settings-nav-rail">
      <ol class="settings-nav-rail__items">
        <li *ngFor="let key of sectionKeys" class="settings-nav-rail__item" [class.settings-nav-rail__item--active]="key === activeSectionKey">
          <a [routerLink]="['/settings', sectionPaths[key]]">{{ 'settings.sections.' + key | translate }}</a>
        </li>
        <li class="settings-nav-rail__item" [class.settings-nav-rail__item--active]="activeSectionKey === 'auditLog'">
          <a [routerLink]="['/settings', 'audit-log']">{{ 'settings.sections.auditLog' | translate }}</a>
        </li>
      </ol>
    </nav>
  `
})
export class SettingsNavRailComponent {
  @Input() activeSectionKey?: string;
  readonly sectionPaths = SECTION_PATHS;
  readonly sectionKeys = Object.keys(SECTION_PATHS);
}
```

**Rewrite** `frontend/src/app/settings/settings-shell.component.ts` — mirrors `setup-shell.component.ts`'s exact `NavigationEnd`-subscription pattern, substituting `data['sectionKey']` for `data['stepKey']`:
```ts
@Component({
  selector: 'app-settings-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, SettingsNavRailComponent],
  template: `
    <div class="settings-shell">
      <app-settings-nav-rail [activeSectionKey]="activeSectionKey"></app-settings-nav-rail>
      <main class="settings-shell__content"><router-outlet></router-outlet></main>
    </div>
  `
})
export class SettingsShellComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private navigationSubscription?: Subscription;
  activeSectionKey?: string;

  ngOnInit(): void {
    this.activeSectionKey = this.currentSectionKey();
    this.navigationSubscription = this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => { this.activeSectionKey = this.currentSectionKey(); });
  }

  ngOnDestroy(): void {
    this.navigationSubscription?.unsubscribe();
  }

  private currentSectionKey(): string | undefined {
    let child = this.route.firstChild;
    while (child?.firstChild) { child = child.firstChild; }
    return child?.snapshot.data['sectionKey'];
  }
}
```

**Rewrite** `frontend/src/app/settings/settings-shell.component.spec.ts` — replaces the single placeholder-text assertion with: `rendersTheNavRailWithSevenSectionsPlusAuditLog`, `highlightsTheActiveSectionKeyFromTheDeepestChildRoute`, `rendersTheRouterOutletForChildRoutes`.

Commit: `feat(settings): build the settings shell and nav rail`

---

## Task 12.12 — Frontend: settings overview cards

**Create** `frontend/src/app/settings/settings-overview.component.ts` (+ `.spec.ts`) — the `/settings` index route. Renders one card per `SECTION_PATHS` entry from a static config array (`{ key, actionLabelKey: 'settings.cards.' + key + '.actionLabel', path }`), each with a translated label and an Edit/Manage link to `['/settings', path]`.

**Compensation card gets extra behavior**: injects the existing `CompensationPlanService` (already has `getCurrent()`/`getHistory()`, reused unmodified), calls `getCurrent()` on init to render `settings.compensationCard.currentVersionLabel` interpolated with `versionLabel`/`effectiveFrom`, plus a "View History" button that opens the existing shared `SidePanelComponent` (`open`/`title`/`closed` inputs, reused as-is) populated by `getHistory(): Observable<CompensationPlanSummary[]>` — no new route, no new backend call.

**Tests**: `rendersSevenCardsWithTheirTranslatedLabelsAndLinks`, `compensationCardFetchesAndDisplaysTheCurrentVersionLabel`, `viewHistoryOpensTheSidePanelPopulatedFromGetHistory`.

Commit: `feat(settings): add the settings overview summary cards`

---

## Task 12.13 — Frontend: Audit Log screen

**Create** `frontend/src/app/settings/audit-log/audit-log.model.ts` — `AuditLogEntry`/`AuditLogPage` interfaces, field-for-field with `SettingsAuditEntryResponse`/`SettingsAuditPageResponse`; a `SECTION_FILTER_OPTIONS` const (the 7 section keys + an "all" option).

**Create** `frontend/src/app/settings/audit-log/audit-log.service.ts` (`providedIn: 'root'`) — thin wrapper, `list(section, page, size): Observable<AuditLogPage>` hitting `GET /api/company/audit-log?section=&page=&size=`, same shape as `CompensationPlanService`.

**Create** `frontend/src/app/settings/audit-log/audit-log.component.ts` (+ `.spec.ts`) — inline markup (decision 11, no shared row component): a `<select>` section filter (re-fetches page 0 on change), a list of rows (avatar-with-initials from `changedByName`, falling back to `settings.auditLog.systemActor` when `changedByAssociateId` is null, the `summary` text, a formatted `changedAt`), and Previous/Next pagination buttons driven by `page`/`size`/`totalElements`.

**Tests**: `audit-log.service.spec.ts` — `HttpClientTestingModule`, asserts the exact URL/params per call. `audit-log.component.spec.ts` — renders rows from a flushed response; falls back to the system-actor label when `changedByName` is null; changing the section filter re-fetches page 0; Next/Previous buttons call `list()` with the adjacent page and are disabled at the first/last page.

Commit: `feat(settings): add the audit log screen`

---

## Task 12.14 — `app.routes.ts`: wire the settings child routes

**Modify** `frontend/src/app/app.routes.ts` — convert the flat `settings` leaf route into a parent+children route, mirroring the existing `setup` block's shape exactly:
```ts
{
  path: 'settings',
  component: SettingsShellComponent,
  canActivate: [authGuard, adminGuard, launchedModeGuard],
  children: [
    { path: '', component: SettingsOverviewComponent, pathMatch: 'full' },
    { path: 'company-profile', component: CompanyProfileStepComponent, data: { sectionKey: 'companyProfile', mode: 'settings' } },
    { path: 'branding', component: BrandingStepComponent, data: { sectionKey: 'branding', mode: 'settings' } },
    { path: 'compensation', component: CompensationStepComponent, data: { sectionKey: 'compensation', mode: 'settings' } },
    { path: 'projects', component: ProjectsStepComponent, data: { sectionKey: 'projects', mode: 'settings' } },
    { path: 'payments-kyc', component: PaymentsKycStepComponent, data: { sectionKey: 'paymentsKyc', mode: 'settings' } },
    { path: 'admin-team', component: AdminTeamStepComponent, data: { sectionKey: 'adminTeam', mode: 'settings' } },
    { path: 'root-associates', component: RootAssociatesStepComponent, data: { sectionKey: 'rootAssociates', mode: 'settings' } },
    { path: 'audit-log', component: AuditLogComponent, data: { sectionKey: 'auditLog' } }
  ]
}
```
Add the two new component imports (`SettingsOverviewComponent`, `AuditLogComponent`). The existing `/setup/*` children are untouched — their `data` has no `mode` key, so those components' `@Input() mode` stays at its `'setup'` default.

**Tests**: no new route-level spec exists in this repo for `/setup` either (confirmed by precedent); rely on `settings-shell.component.spec.ts` (Task 12.11) and each component's own spec for coverage. Manual verification is the walkthrough below.

Commit: `feat(settings): route the seven sections and audit log into the settings shell`

---

## Task 12.15 — i18n: `settings.*` namespace

**Modify** `frontend/src/assets/i18n/en.json` and `hi.json` together — remove the now-dead `settings.placeholder.comingSoon` key (no longer rendered by the rewritten shell), add, in the same order in both files:
```
settings.overviewLabel
settings.sections.companyProfile
settings.sections.branding
settings.sections.compensation
settings.sections.projects
settings.sections.paymentsKyc
settings.sections.adminTeam
settings.sections.rootAssociates
settings.sections.auditLog
settings.actions.save
settings.cards.companyProfile.actionLabel
settings.cards.branding.actionLabel
settings.cards.compensation.actionLabel
settings.cards.projects.actionLabel
settings.cards.paymentsKyc.actionLabel
settings.cards.adminTeam.actionLabel
settings.cards.rootAssociates.actionLabel
settings.compensationCard.currentVersionLabel
settings.compensationCard.viewHistoryLink
settings.auditLog.title
settings.auditLog.sectionFilterLabel
settings.auditLog.sectionFilterAllOption
settings.auditLog.systemActor
settings.auditLog.emptyState
settings.auditLog.paginationPrevious
settings.auditLog.paginationNext
settings.auditLog.pageIndicator
```
Net: −1 + 25 = 281 keys in each file, still at exact parity (257 → 281).

**Tests**: none automated (no i18n key-parity spec exists anywhere in this repo, confirmed by every prior phase's plan); hand-verify identical key sets between the two files before committing.

Commit: `feat(i18n): add settings.* translations`

---

## Verification

**Automated** (same commands every phase uses):
```bash
mvn -f backend/pom.xml test
cd frontend && npx ng test --watch=false --browsers=ChromeHeadless
```
Baselines to beat: backend 46 → ~46 + ~30 new test methods across the 11 new/modified test files; frontend 60 → ~60 + ~15 new spec files/cases.

**Manual end-to-end walkthrough** (assumes a fully launched instance from the master roadmap's own walkthrough, i.e. `launched_at` is already set):
1. Log in as the founding admin — confirm landing on `/settings` (not `/setup`), with the nav rail showing all 7 sections + Audit Log, and 7 summary cards on the overview.
2. Confirm the Compensation card shows `Current Version v1 (Effective …)`; click View History — confirm a side panel opens listing every version saved so far.
3. Click into Company Profile from its card's action link — confirm the same form renders, with a single "Save" button (no Previous/Next), and Save navigates back to `/settings`.
4. Edit a field, confirm it autosaves (the existing "Saved just now" indicator still appears), click Save, and confirm the overview's Company Profile card reflects nothing changed visually (it's a static label) but the change persisted (reload and re-open the section to confirm).
5. Repeat a small edit in Branding, Payments & KYC (change the auto-approve limit), and Admin Team (create one more `SUPPORT` account) — confirm each is create/edit-only via the shared step components in settings mode, with no Previous/Next anywhere.
6. Open Audit Log — confirm rows for every change made in steps 3-5 appear, newest first, each showing an avatar/initials for the founding admin, a human-readable summary (e.g. "Updated company profile", "Created admin supportX (SUPPORT)"), and a timestamp. Confirm the new `SUPPORT` account's temporary password is **not** visible anywhere in the row or its detail.
7. Filter the section dropdown to "Payments & KYC" — confirm only the auto-approve-limit change appears. Switch to "All" — confirm the full list returns.
8. Page through results (if more than one page's worth of entries exist from testing) — confirm Previous/Next work and disable at the boundaries.
9. Log in as the `SUPPORT` account created in step 5 — confirm `GET /api/company/audit-log` is reachable (200) for it, matching every other admin-family GET's authorization.
10. Directly call `GET /api/company/audit-log` with an `ASSOCIATE` token (or via a logged-in associate session) — confirm 403.
11. Reload `/settings/audit-log` directly — confirms the route (not just in-app navigation) resolves correctly and the nav rail highlights Audit Log as active.
