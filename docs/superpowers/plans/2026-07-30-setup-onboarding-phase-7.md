# Phase 7 — Step 5: Payments & KYC

Continuation of the setup/onboarding build. Phases 0–6 are confirmed implemented on `master` (`git log` shows all compensation-plan commits landed, most recently `16df04f`). Full roadmap: `docs/superpowers/plans/2026-07-30-setup-onboarding.md` (its "Phase 7" section). Spec: `setup-onboarding-spec.md` (Step 5, lines 90–101). Design: `ChatGPT Image Jul 29, 2026, 11_07_58 PM.png`.

## Context

Step 5 is one of only three launch-blocking steps (`SetupStateService.STEP_DEFINITIONS` already marks `paymentsKyc` as step 5, `required: true` — confirmed at `backend/src/main/java/com/plotchain/company/SetupStateService.java:20`). Today its predicate is stubbed to `default -> false`, so `canGoLive` can never be satisfied. This phase makes it real: a way to collect plot payments (gateway + credentials), a way to pay associates (payout bank account), and the KYC/withdrawal policy that governs both.

No code for this domain exists yet — confirmed zero hits for `TextEncryptor`, `Encryptors`, `IFSC`, `payment_config`, `kyc_config`, or `withdrawal_config` anywhere in the repo. This phase introduces the first encrypted-at-rest field in the codebase (payment gateway credentials) and the first cross-field business-rule validation on a singleton config (withdrawal auto-approve limit).

Outcome: an admin can configure a payment gateway, a payout bank account, KYC document strictness, and withdrawal approval policy from `/setup/payments-kyc`; `GET /api/company/setup-state` reports step 5 complete once a gateway+credentials+bank account exist; Review & Launch's Go Live gate becomes satisfiable for the first time (steps 1, 3, 5 all real).

## Decisions (made now — do not re-litigate)

1. **New top-level package `com.plotchain.payments`**, sibling to `company`/`compensation`. Matches the precedent Phase 6 already set: compensation got its own package rather than growing `company` further, because it's a distinct domain with its own controllers/services/exceptions.
2. **Four independent singleton tables/entities/services/controllers** — `payment_config`, `payout_bank_account`, `kyc_config`, `withdrawal_config` — each mirroring `CompanyProfile`/`CompanyBranding`'s true-singleton pattern (`singleton_guard` column, `repository.findAll().stream().findFirst().orElseThrow(...)`), **not** `CompensationPlanVersion`'s append-only history. Nothing in this domain needs a history — versioning was compensation-specific per the roadmap's own rationale.
3. **Endpoints**: `GET`/`PUT /api/company/payments`, `GET`/`PUT /api/company/payout-account`, `GET`/`PUT /api/company/kyc`, `GET`/`PUT /api/company/withdrawal`.
4. **Step completeness** = `paymentConfigService.isComplete() && payoutBankAccountService.isComplete()`, called directly from `SetupStateService`'s existing switch (no new facade service — matches how it already composes multiple injected services). "Complete" means gateway selected + credentials configured + all five bank-account fields non-blank. KYC and withdrawal configs are **never** part of this predicate: they're seeded with real, usable defaults (`STRICT` / `ALWAYS_MANUAL`) and the spec's own gating language is specifically "a way to collect money or pay associates" (spec line 100) — not a KYC/withdrawal policy choice.
5. **Credentials UX mirrors Phase 5's logo pattern, not autosave.** `PaymentConfigResponse` never carries raw/decrypted credentials — only a `credentialsConfigured: boolean`, same shape as `CompanyBrandingResponse.hasSquareLogo`. The frontend shows that masked indicator plus a "Change credentials" reveal button with its own explicit Save action (not the 400ms blur-debounce every other field uses) — same reasoning as logo upload: you don't want to resend or silently overwrite a secret on every keystroke of an unrelated field. `PaymentConfigRequest.credentials` is optional; blank/absent leaves the stored ciphertext untouched. Gateway and payment-modes edits autosave normally and never touch this field.
6. **`SecretsEncryptionService`** wraps `Encryptors.text(key, salt)` (Spring Security Crypto — confirmed already transitively on the classpath via `spring-boot-starter-security`, no `pom.xml` change needed) and copies `JwtService`'s fail-closed dev-secret guard verbatim: a `DEV_DEFAULT_SECRETS_KEY` constant, `Environment.acceptsProfiles(Profiles.of("dev","test"))`, `IllegalStateException` outside dev/test, a test-only convenience constructor. New required env var `PLOTCHAIN_SECRETS_KEY`, documented in `README.md` right after the existing `JWT_SECRET` section, same structure. No `application-test.yml` change needed — it doesn't override `jwt.secret`'s mechanism either, and the base `application.yml` default falls back safely under the `test` profile via the same guard.
7. **Spec gaps filled, not silently over-invented:**
   - Gateway is a free `@NotBlank VARCHAR(32)` with no `CHECK` constraint — the spec never enumerates gateway options (unlike KYC strictness / withdrawal mode, which the roadmap explicitly gave `CHECK`-constrained enums). Frontend offers a fixed dropdown (Razorpay / PayU / Cashfree — common Indian gateways, consistent with the rest of the build's INR/lakh-grouping assumptions) but the backend accepts any non-blank string.
   - `required_documents` seeded and offered as exactly the spec's own three examples — `AADHAAR`, `PAN`, `BANK_PASSBOOK` (spec line 97: "Aadhaar, PAN, bank passbook, etc."). The "etc." is not invented further; adding a fourth document type is a Company Settings follow-up, not part of this phase.
8. **IFSC format**: standard `^[A-Z]{4}0[A-Z0-9]{6}$` (4-letter bank code, literal `0`, 6-char alphanumeric branch code). Validated client-side via `Validators.pattern` (declared inline in the component, matching `branding-step.component.ts`'s `HEX_COLOR_PATTERN` convention — this repo has no shared `shared/validators/` directory) and server-side via `@Pattern` on `PayoutBankAccountRequest.ifscCode`.
9. **Withdrawal cross-field rule**: `approvalMode = AUTO_UNDER_LIMIT` requires a positive `autoApproveLimit`; `ALWAYS_MANUAL` ignores it. Enforced in `WithdrawalConfigService` (not a Bean Validation annotation — this is a cross-field rule, same category as compensation's reward-tier contiguity check) via a new `InvalidWithdrawalConfigException` → 409, handled by a new `PaymentsExceptionHandler` (`@RestControllerAdvice`, scoped to this package only — mirrors `CompanyExceptionHandler`/`CompensationExceptionHandler`, one per domain).

## Constraints carried forward (still true, unchanged)

- `ddl-auto: validate` — migration and entities land in the same task.
- No `@ManyToOne`; raw `UUID` fields only (not needed here — no FKs in this domain).
- Mock **interfaces only** in service tests; real Spring context + `@MockBean` repositories in controller tests (`CompanyBrandingControllerTest` is the template).
- `SecurityConfig` is first-match-wins; every new GET matcher goes in the existing admin-family-only block (with the other `GET /api/company/*` lines), before `anyRequest().authenticated()`. New PUT endpoints need **no** separate matcher — already covered by the blanket admin-family PUT rule.
- Zero hardcoded strings; `setup.paymentsKyc.*` keys land in `en.json` and `hi.json` in the same commit as the component that uses them.
- Conventional Commits, footer `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## Task 7.1 — V9 migration + four entities/repositories

**Create** `backend/src/main/resources/db/migration/V9__payment_and_kyc_config.sql`:

```sql
-- Backs Step 5 of the setup wizard (Payments & KYC): payment gateway, payout bank account, KYC
-- document requirements, and withdrawal approval mode. Four singletons, same shape as V6/V7,
-- because each is configured and audited independently (master roadmap's "per-domain tables"
-- rationale). payment_config and payout_bank_account are left nullable -- they gate Go Live, so
-- "row exists" must not mean "configured". kyc_config and withdrawal_config get real NOT NULL
-- defaults -- they never block launch.

CREATE TABLE payment_config (
    id UUID PRIMARY KEY,
    singleton_guard BOOLEAN NOT NULL DEFAULT TRUE,
    gateway VARCHAR(32),
    credentials_encrypted TEXT,
    modes_enabled VARCHAR(64),
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT chk_payment_config_singleton CHECK (singleton_guard = TRUE),
    CONSTRAINT uq_payment_config_singleton UNIQUE (singleton_guard)
);
INSERT INTO payment_config (id, singleton_guard, updated_at)
VALUES ('00000000-0000-0000-0000-000000000001', TRUE, CURRENT_TIMESTAMP);

CREATE TABLE payout_bank_account (
    id UUID PRIMARY KEY,
    singleton_guard BOOLEAN NOT NULL DEFAULT TRUE,
    bank_name VARCHAR(120),
    account_holder VARCHAR(120),
    account_number VARCHAR(32),
    ifsc_code VARCHAR(11),
    account_type VARCHAR(16),
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT chk_payout_bank_account_singleton CHECK (singleton_guard = TRUE),
    CONSTRAINT uq_payout_bank_account_singleton UNIQUE (singleton_guard),
    CONSTRAINT chk_payout_bank_account_type
        CHECK (account_type IS NULL OR account_type IN ('CURRENT','SAVINGS'))
);
INSERT INTO payout_bank_account (id, singleton_guard, updated_at)
VALUES ('00000000-0000-0000-0000-000000000001', TRUE, CURRENT_TIMESTAMP);

CREATE TABLE kyc_config (
    id UUID PRIMARY KEY,
    singleton_guard BOOLEAN NOT NULL DEFAULT TRUE,
    strictness VARCHAR(8) NOT NULL DEFAULT 'STRICT',
    required_documents VARCHAR(255) NOT NULL DEFAULT 'AADHAAR,PAN,BANK_PASSBOOK',
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT chk_kyc_config_singleton CHECK (singleton_guard = TRUE),
    CONSTRAINT uq_kyc_config_singleton UNIQUE (singleton_guard),
    CONSTRAINT chk_kyc_strictness CHECK (strictness IN ('STRICT','RELAXED'))
);
INSERT INTO kyc_config (id, singleton_guard, updated_at)
VALUES ('00000000-0000-0000-0000-000000000001', TRUE, CURRENT_TIMESTAMP);

CREATE TABLE withdrawal_config (
    id UUID PRIMARY KEY,
    singleton_guard BOOLEAN NOT NULL DEFAULT TRUE,
    approval_mode VARCHAR(24) NOT NULL DEFAULT 'ALWAYS_MANUAL',
    auto_approve_limit NUMERIC(14,2),
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT chk_withdrawal_config_singleton CHECK (singleton_guard = TRUE),
    CONSTRAINT uq_withdrawal_config_singleton UNIQUE (singleton_guard),
    CONSTRAINT chk_approval_mode CHECK (approval_mode IN ('AUTO_UNDER_LIMIT','ALWAYS_MANUAL'))
);
INSERT INTO withdrawal_config (id, singleton_guard, updated_at)
VALUES ('00000000-0000-0000-0000-000000000001', TRUE, CURRENT_TIMESTAMP);
```

**Create**, package `com.plotchain.payments` (new directory `backend/src/main/java/com/plotchain/payments/`):
- `PaymentConfig.java`, `PayoutBankAccount.java`, `KycConfig.java`, `WithdrawalConfig.java` — plain `@Entity` classes, `singletonGuard` field, plain getters/setters, no `@ManyToOne`. Shape copied from `CompanyBranding.java`.
- `PaymentConfigRepository.java`, `PayoutBankAccountRepository.java`, `KycConfigRepository.java`, `WithdrawalConfigRepository.java` — bare `JpaRepository<X, UUID>`, no custom finders (mirrors `CompanyProfileRepository`/`CompanyBrandingRepository`, which have none either).

**Tests**: none directly (no dedicated repository test exists for `CompanyProfileRepository`/`CompanyBrandingRepository` either — only `CompensationPlanVersionRepository` got one, because of its unique-index business behavior, which doesn't apply here). Verified indirectly: every `mvn test` run's `@DataJpaTest`/`@SpringBootTest` instances run real Flyway against H2 in PostgreSQL mode, so a broken migration fails immediately.

Commit: `feat(db): add V9 payment and KYC config migration and entities`

---

## Task 7.2 — SecretsEncryptionService

**Create** `backend/src/main/java/com/plotchain/payments/SecretsEncryptionService.java`:
- `static final String DEV_DEFAULT_SECRETS_KEY = "dev-only-change-me-this-encryption-key-needs-32-bytes-too";`
- Constructor `(@Value("${plotchain.secrets-key}") String key, Environment environment)` — same `requireKeyIsSafeToUse` guard as `JwtService.requireSecretIsSafeToUse`, throwing `IllegalStateException` outside `dev`/`test`.
- A second, test-only constructor `(String key)` delegating with `new StandardEnvironment()`, matching `JwtService`'s two-constructor pattern.
- `encrypt(String plaintext): String` / `decrypt(String ciphertext): String` delegating to a `TextEncryptor` built once via `Encryptors.text(key, salt)` — `salt` is a fixed hex constant (not secret; `Encryptors.text` requires a hex salt, and the actual security boundary here is `PLOTCHAIN_SECRETS_KEY`, not per-record salt rotation — this app encrypts one shared credential blob, not many user passwords).

**Modify** `backend/src/main/resources/application.yml` — add under a new `plotchain.secrets-key` key, same shape as `jwt.secret`:
```yaml
plotchain:
  secrets-key: ${PLOTCHAIN_SECRETS_KEY:dev-only-change-me-this-encryption-key-needs-32-bytes-too}
```

**Modify** `README.md` — add a `PLOTCHAIN_SECRETS_KEY — required outside dev/test` section immediately after the existing `JWT_SECRET` section, same structure (what it guards, why the dev default is dangerous outside dev/test, `export PLOTCHAIN_SECRETS_KEY=$(openssl rand -base64 32)`).

**Tests**: `SecretsEncryptionServiceTest.java` — mirrors `JwtServiceTest.java`'s `MockEnvironment`-based cases exactly: `encrypt()`/`decrypt()` round-trips a value; refuses to start with the dev default under no/unrelated active profile; allows it under `dev` and under `test`; allows any non-default key with no active profile.

Commit: `feat(payments): add SecretsEncryptionService with fail-closed startup guard`

---

## Task 7.3 — DTOs, services, and PaymentsExceptionHandler

**Create**, package `com.plotchain.payments`:
- `PaymentConfigRequest(@NotBlank String gateway, String credentials, List<String> modesEnabled)` / `PaymentConfigResponse(String gateway, boolean credentialsConfigured, List<String> modesEnabled, Instant updatedAt)`. `credentials` is deliberately not `@NotBlank` (decision 5).
- `PayoutBankAccountRequest(@NotBlank bankName, @NotBlank accountHolder, @NotBlank accountNumber, @NotBlank @Pattern(regexp="^[A-Z]{4}0[A-Z0-9]{6}$") ifscCode, @NotBlank accountType)` / matching `Response` record.
- `KycConfigRequest(@NotBlank strictness, List<String> requiredDocuments)` / matching `Response` record.
- `WithdrawalConfigRequest(@NotBlank approvalMode, BigDecimal autoApproveLimit)` / matching `Response` record.
- `InvalidWithdrawalConfigException.java` (unchecked, decision 9).
- `PaymentsExceptionHandler.java` (`@RestControllerAdvice`) — handles `InvalidWithdrawalConfigException` → 409 `{"error": ...}`, same shape as `CompanyExceptionHandler`.
- `PaymentConfigService.java` — `getConfig()`, `updateConfig(request)` (only overwrites `credentialsEncrypted` when `request.credentials()` is non-blank, using `SecretsEncryptionService`), `isComplete()` = `gateway != null && credentialsEncrypted != null`. Comma-string ↔ `List<String>` conversion for `modesEnabled` lives here (private helpers), same pattern as the boolean-derivation in `CompanyBrandingService.toResponse`.
- `PayoutBankAccountService.java` — `getAccount()`, `updateAccount(request)`, `isComplete()` = all five fields non-blank (mirrors `CompanyProfileService.isComplete()`'s `isNotBlank` helper exactly).
- `KycConfigService.java` — `getConfig()`, `updateConfig(request)`. No `isComplete()` needed (decision 4) — not called from `SetupStateService`.
- `WithdrawalConfigService.java` — `getConfig()`, `updateConfig(request)` (validates the `AUTO_UNDER_LIMIT` ⇒ positive-limit rule before saving, throws `InvalidWithdrawalConfigException`). No `isComplete()` needed either.

**Tests**: `PaymentConfigServiceTest`, `PayoutBankAccountServiceTest`, `KycConfigServiceTest`, `WithdrawalConfigServiceTest` — `@ExtendWith(MockitoExtension.class)`, `@Mock` on the repository interface only, service instantiated for real (`CompanyProfileServiceTest` pattern). Cover: update persists all fields, `isComplete()` true/false branches (payment/payout only), the credentials-blank-leaves-unchanged branch, the withdrawal cross-field rejection. `PaymentsExceptionHandlerTest` mirrors `CompensationExceptionHandlerTest`.

Commit: `feat(payments): add payment, payout account, KYC, and withdrawal config services`

---

## Task 7.4 — Controllers, SecurityConfig, SetupStateService wiring

**Create**, package `com.plotchain.payments`:
- `PaymentConfigController.java` — `@RequestMapping("/api/company/payments")`, thin `GET`/`PUT`, mirrors `CompanyProfileController`.
- `PayoutBankAccountController.java` — `@RequestMapping("/api/company/payout-account")`.
- `KycConfigController.java` — `@RequestMapping("/api/company/kyc")`.
- `WithdrawalConfigController.java` — `@RequestMapping("/api/company/withdrawal")`.

**Modify** `backend/src/main/java/com/plotchain/auth/SecurityConfig.java` — add four `GET`-admin-family-only matchers alongside the existing `GET /api/company/profile` / `/branding` / `/compensation` block (same comment style: "PUT is a write, already covered by the blanket PUT rule — deliberately no separate matcher"):
```java
.requestMatchers(HttpMethod.GET, "/api/company/payments").hasAnyAuthority(...)
.requestMatchers(HttpMethod.GET, "/api/company/payout-account").hasAnyAuthority(...)
.requestMatchers(HttpMethod.GET, "/api/company/kyc").hasAnyAuthority(...)
.requestMatchers(HttpMethod.GET, "/api/company/withdrawal").hasAnyAuthority(...)
```

**Modify** `backend/src/main/java/com/plotchain/company/SetupStateService.java` — inject `PaymentConfigService` and `PayoutBankAccountService` (5-arg constructor), replace the `default -> false` fallthrough for `"paymentsKyc"` with:
```java
case "paymentsKyc" -> paymentConfigService.isComplete() && payoutBankAccountService.isComplete();
```

**Tests**:
- Four `*ControllerTest` classes (`@SpringBootTest` + `@AutoConfigureMockMvc` + `@ActiveProfiles("test")` + `@MockBean` on the relevant repository, real `JwtService`-minted tokens) — mirrors `CompanyBrandingControllerTest`: 403 for an `ASSOCIATE` token on GET, 200 for an admin-family token, 400 on a malformed PUT (bad IFSC), 409 on the withdrawal cross-field violation.
- `SecurityConfigTest.java` — four new cases, one per new GET matcher (per the roadmap's own risk-table rule: "every new matcher goes above the blanket rules... `SecurityConfigTest` gains a case per endpoint").
- `SetupStateServiceTest.java` — extend with: both services complete → `paymentsKyc` true; either incomplete → false; confirm `canGoLive` now genuinely requires it.

Commit: `feat(payments): add controllers, wire into SecurityConfig and SetupStateService`

---

## Task 7.5 — Frontend models and service

**Create** `frontend/src/app/setup/models/payments-kyc.model.ts` — four `Request`/`Response` interface pairs, camelCase, matching the backend records field-for-field (`PaymentConfigResponse.credentialsConfigured: boolean`, never a raw secret).

**Create** `frontend/src/app/setup/steps/payments-kyc/payments-kyc.service.ts` (`providedIn: 'root'`) — eight thin `HttpClient` methods (`getPaymentConfig`/`updatePaymentConfig`, `getPayoutAccount`/`updatePayoutAccount`, `getKycConfig`/`updateKycConfig`, `getWithdrawalConfig`/`updateWithdrawalConfig`), one file, mirrors `CompensationPlanService`'s method-per-call shape.

**Tests**: `payments-kyc.service.spec.ts` — `HttpClientTestingModule`, one `expectOne(...).flush(...)` per method, mirrors `compensation-plan.service.spec.ts`.

Commit: `feat(frontend): add PaymentsKycService and models`

---

## Task 7.6 — PaymentsKycStepComponent

**Create** `frontend/src/app/setup/steps/payments-kyc/payments-kyc-step.component.ts` (+ `.spec.ts`), standalone, `imports: [CommonModule, ReactiveFormsModule, TranslateModule, FieldErrorComponent, InlineBannerComponent, ToggleGroupComponent]`.

Four sections, each its own `.card` and its own nested reactive `FormGroup`, each **autosaving independently** on its own `formGroup.valueChanges.pipe(debounceTime(400))` arm (same `merge`/debounce/`if valid`/save shape as `compensation-step.component.ts`, run four times in parallel rather than once) — this is the natural fit since the backend genuinely persists these as four separate resources, unlike compensation's single aggregate:

1. **Payment Collection** — gateway `<select>` (Razorpay/PayU/Cashfree), a plain checkbox group bound to a component-state `string[]` for `modesEnabled` (no shared checkbox-group component exists; inline checkboxes, same "plain array + emit on change" style as `editable-table`'s non-forms-aware rows), and the masked credentials block: `credentialsConfigured` indicator + "Change credentials" reveal button + its own `<input type="password">` + explicit "Save credentials" button (**not** wired into the 400ms autosave arm — a dedicated `(click)` handler calling `updatePaymentConfig` with just `{ credentials }`).
2. **Payout Account** — bank name / account holder / account number / IFSC (new inline `IFSC_CODE_PATTERN` regex constant + `Validators.pattern`, same declaration style as `HEX_COLOR_PATTERN` in `branding-step.component.ts`) / account type toggle-group (Current/Savings).
3. **KYC Requirements** — `<app-toggle-group>` Strict/Relaxed bound to `strictness`, plus a checkbox group (same inline pattern as modesEnabled) for `requiredDocuments` (Aadhaar/PAN/Bank Passbook).
4. **Withdrawal Approval** — approval-mode `<app-toggle-group>` (Auto-approve under limit / Always manual); `autoApproveLimit` input shown only via `*ngIf` when mode is `AUTO_UNDER_LIMIT`; a small static "flow preview" list (Request Raised → Admin Review → Approved → Payout Initiated) per the roadmap text — plain translated list items, no new component needed.

Each section gets its own `savedJustNow` boolean, its own `loadFailed` guard (blocks that section's autosave until its own GET resolves — same reasoning as compensation's `loadFailed`), and its own `RENDERED_FIELD_ERROR_KEYS` + `serverFieldErrors` pair, following `compensation-step.component.ts`'s `fieldError()`/`toFieldErrors()` convention exactly.

**Modify** `frontend/src/app/app.routes.ts` — swap the `payments-kyc` child route's `component:` from `SetupStepPlaceholderComponent` to `PaymentsKycStepComponent` (import added), keep `data: { stepKey: 'paymentsKyc' }` unchanged.

**Tests**: `payments-kyc-step.component.spec.ts` — `TestBed` + `HttpClientTestingModule` + `TranslateModule.forRoot()`, `fakeAsync`/`tick(500)` to cross the 400ms debounce, one scenario per section's independent autosave, one for the credentials explicit-save button *not* firing on unrelated field changes, one for IFSC pattern rejection, one for the withdrawal cross-field 409 surfacing as a banner (no visible field slot, same category as compensation's reward-tier-gap 409 handling).

Commit: `feat(setup): add PaymentsKycStepComponent`

---

## Task 7.7 — i18n

**Modify** `frontend/src/assets/i18n/en.json` and `hi.json` — add a `setup.paymentsKyc` block in the same commit, mirroring `setup.compensation`'s shape: one `*Label` key per field across all four sections, `savedIndicator` (reused per-section), a `validation` sub-object (`required`, `ifscFormat`, `genericSaveError`, `loadFailed`, plus a withdrawal-specific message), and labels for "Change credentials" / "Save credentials" / the flow-preview steps.

**Tests**: none automated — no i18n key-parity spec exists anywhere in this repo yet (confirmed via search); both files are hand-verified for identical key sets, same as every prior i18n-adding phase.

Commit: `feat(i18n): add setup.paymentsKyc translations`

---

## Verification

**Automated** (same commands as every phase):
```bash
mvn -f backend/pom.xml test
cd frontend && npx ng test --watch=false --browsers=ChromeHeadless
```

**Manual walkthrough** (Phase-7-specific slice of the master roadmap's end-to-end script):
1. Log in as the founding admin mid-setup, navigate to `/setup/payments-kyc` (progress rail step 5).
2. Payment Collection: pick a gateway, toggle two payment modes — confirm autosave and "Saved just now" within ~1s of the last change. Click "Change credentials", type a value, click "Save credentials" — confirm it does **not** fire on the next unrelated gateway/mode edit, and that `GET /api/company/payments` (Network tab) never returns the raw value, only `credentialsConfigured: true`.
3. Payout Account: enter a bank name/holder/number, type an invalid IFSC (e.g. `abc123`) — confirm the inline field error; correct it to a valid format (e.g. `HDFC0001234`) — confirm it saves.
4. KYC Requirements: toggle Strict → Relaxed, check/uncheck documents — confirm autosave; confirm there is no "off" option anywhere in the UI.
5. Withdrawal Approval: select Auto-approve, leave the limit blank, confirm a 409/inline error; set a positive limit, confirm it saves; confirm the flow-preview renders.
6. Reload the page — all four sections repopulate from their respective GETs independently.
7. Go to Review & Launch — confirm step 5 now shows complete (only after gateway+credentials+bank account are filled; toggling KYC/withdrawal alone must not have been what flipped it). Confirm `canGoLive` becomes true once steps 1, 3, 5 are all complete (2/4/6/7/8 optional).
8. As an `ASSOCIATE` token (or a second browser pre-launch), confirm all four new GET endpoints 403.
