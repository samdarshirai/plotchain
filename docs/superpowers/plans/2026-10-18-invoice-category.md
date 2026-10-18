# Invoice Category Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin nav category **Invoice** with Payment Details (loan-repayment register + printable receipt), Add/View Expense, and Add/View Advance Loan (with repayments).

**Architecture:** Spring Boot backend gets packages `expense/` and `advanceloan/` (repayments live in `advanceloan/`) modelled on `expensetype/`, one Flyway migration, and GET matchers in `SecurityConfig`. Angular frontend gets three standalone components under `admin/invoice/`, one shared `invoice.service.ts`, a new `invoice` entry in `ADMIN_NAV_CATEGORIES`, lazy routes under `/settings`, and i18n/SCSS per screen prefix.

**Tech Stack:** Java 21 / Spring Boot / JPA / Flyway / Postgres / JUnit 5 + Mockito + AssertJ; Angular standalone components, ngx-translate, Karma/Jasmine, SCSS.

**Spec:** `docs/superpowers/specs/2026-10-18-invoice-category-design.md`

## Global Constraints

- Append-only records: no edit or delete endpoints or UI (spec Decisions).
- Admin-only: every controller has `@PreAuthorize("hasAuthority('ADMIN')")`; every new GET path also gets an exact `hasAuthority("ADMIN")` matcher in `SecurityConfig` (there is no blanket `GET /api/admin/**`; without it the GET falls to `anyRequest().authenticated()`).
- Every write records `SettingsAuditService.record(section, summary, detail, actorId)`; sections `EXPENSE`, `ADVANCE_LOAN`, `LOAN_REPAYMENT`, added to the `chk_settings_audit_log_section` CHECK (drop + re-add, as V57 did, keeping every existing value).
- Amounts > 0. Repayment ≤ loan's remaining balance. Receipt numbers `RCP-000123` from a DB sequence. `previous_dues` is a snapshot excluding the new loan. Expense type must be ACTIVE.
- Each screen uses its own CSS class prefix: `invoice-expenses`, `invoice-loans`, `invoice-payments`, `invoice-receipt`. Component styles are global, so never reuse another screen's prefix.
- Mobile rule: every UI change passes a phone-width check (tables usable at 375px, forms single column, tap targets ≥ 44px).
- i18n: every user-visible string goes in both `en.json` and `hi.json`.
- Backend tests are Mockito unit tests for services (pattern: `ExpenseTypeServiceTest`) and `@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test")` for controllers (pattern: `AssociateControllerTest`).
- Note (memory): backend `mvn test` shows ~55 spurious Mockito errors from a JDK21/25 mismatch. Judge results by the test classes this plan adds, not the global count.

## Review Focus

- Two admins repay the same loan at once: both must not push repayments past the loan amount (pessimistic lock on the loan row; test pins the service calls the locking finder).
- Repayment of exactly the remaining balance succeeds and leaves outstanding 0; a further 0.01 is rejected.
- Amount with more than 2 decimals, zero, or negative is rejected with a 400 (not a 500).
- Associate with no loans: dues endpoint returns 0, not null / 404.
- Date filter with `from` after `to` returns 400 rather than an empty list silently.
- Search text containing `%` or `_` must not turn into a wildcard match-all (escape in service).
- Receipt route opened directly for an unknown id shows a not-found message, not a blank page.
- Pay mode / bank / TXN with leading/trailing spaces are trimmed; blank TXN stored as null.

---

## File Structure

Backend (`backend/src/main/java/com/plotchain/`):
- `expense/PayMode.java` — shared enum (also used by advanceloan).
- `expense/Expense.java`, `ExpenseRepository.java`, `ExpenseRequest.java`, `ExpenseResponse.java`, `ExpenseException.java`, `ExpenseService.java`, `ExpenseController.java`.
- `advanceloan/AdvanceLoan.java`, `LoanRepayment.java`, `AdvanceLoanRepository.java`, `LoanRepaymentRepository.java`, `AdvanceLoanRequest.java`, `RepaymentRequest.java`, `AdvanceLoanResponse.java`, `LoanDuesResponse.java`, `LoanRepaymentResponse.java`, `AdvanceLoanException.java`, `AdvanceLoanService.java`, `AdvanceLoanController.java`.
- `auth/SecurityConfig.java` — modify (GET matchers).
- `backend/src/main/resources/db/migration/V64__invoice_expense_loans.sql`.

Backend tests (`backend/src/test/java/com/plotchain/`): `expense/ExpenseServiceTest.java`, `expense/ExpenseControllerTest.java`, `advanceloan/AdvanceLoanServiceTest.java`, `advanceloan/AdvanceLoanControllerTest.java`.

Frontend (`frontend/src/app/`):
- `admin/invoice/invoice.service.ts` — all HTTP calls + types.
- `admin/invoice/expenses/expenses.component.ts` (+ spec).
- `admin/invoice/advance-loans/advance-loans.component.ts` (+ spec).
- `admin/invoice/payment-details/payment-details.component.ts` (+ spec), `admin/invoice/payment-details/payment-receipt.component.ts` (+ spec).
- `admin-nav-categories.model.ts` (+ spec), `app.routes.ts` (+ spec) — modify.
- `assets/i18n/en.json`, `hi.json` — modify. `styles/_admin.scss`, `styles/_admin-mobile.scss` — modify.

---

### Task 1: Migration, enum, audit sections

**Files:**
- Create: `backend/src/main/resources/db/migration/V64__invoice_expense_loans.sql`
- Create: `backend/src/main/java/com/plotchain/expense/PayMode.java`

**Interfaces:**
- Produces: tables `expense`, `advance_loan`, `loan_repayment`; sequence `loan_repayment_receipt_seq`; enum `com.plotchain.expense.PayMode { CASH, CHEQUE, DD, UPI, BANK_TRANSFER }`; audit sections `EXPENSE`, `ADVANCE_LOAN`, `LOAN_REPAYMENT`.

- [ ] **Step 1: Write the migration**

First confirm the latest migration is V63 (`ls backend/src/main/resources/db/migration | sort -V | tail -1`); if a later one exists, use the next number. Copy the CHECK list from V63 (it is the latest holder of `chk_settings_audit_log_section`) and append the three new values.

```sql
CREATE TABLE expense (
    id UUID PRIMARY KEY,
    expense_date DATE NOT NULL,
    expense_type_id UUID NOT NULL REFERENCES expense_type(id),
    project_id UUID REFERENCES project(id),
    pay_to VARCHAR(150) NOT NULL,
    amount NUMERIC(14,2) NOT NULL,
    pay_mode VARCHAR(20) NOT NULL,
    bank_name VARCHAR(100),
    txn_no VARCHAR(100),
    remarks VARCHAR(500),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT chk_expense_amount CHECK (amount > 0),
    CONSTRAINT chk_expense_pay_mode CHECK (pay_mode IN ('CASH', 'CHEQUE', 'DD', 'UPI', 'BANK_TRANSFER'))
);
CREATE INDEX idx_expense_date ON expense (expense_date);

CREATE TABLE advance_loan (
    id UUID PRIMARY KEY,
    associate_id UUID NOT NULL REFERENCES associate(id),
    loan_date DATE NOT NULL,
    amount NUMERIC(14,2) NOT NULL,
    previous_dues NUMERIC(14,2) NOT NULL DEFAULT 0,
    pay_mode VARCHAR(20) NOT NULL,
    bank_name VARCHAR(100),
    instrument_no VARCHAR(100),
    remarks VARCHAR(500),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT chk_advance_loan_amount CHECK (amount > 0),
    CONSTRAINT chk_advance_loan_pay_mode CHECK (pay_mode IN ('CASH', 'CHEQUE', 'DD', 'UPI', 'BANK_TRANSFER'))
);
CREATE INDEX idx_advance_loan_associate ON advance_loan (associate_id);

CREATE SEQUENCE loan_repayment_receipt_seq START 1;

CREATE TABLE loan_repayment (
    id UUID PRIMARY KEY,
    loan_id UUID NOT NULL REFERENCES advance_loan(id),
    receipt_no VARCHAR(20) NOT NULL,
    payment_date DATE NOT NULL,
    amount NUMERIC(14,2) NOT NULL,
    pay_mode VARCHAR(20) NOT NULL,
    bank_name VARCHAR(100),
    txn_no VARCHAR(100),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT chk_loan_repayment_amount CHECK (amount > 0),
    CONSTRAINT chk_loan_repayment_pay_mode CHECK (pay_mode IN ('CASH', 'CHEQUE', 'DD', 'UPI', 'BANK_TRANSFER'))
);
CREATE UNIQUE INDEX uq_loan_repayment_receipt_no ON loan_repayment (receipt_no);
CREATE INDEX idx_loan_repayment_loan ON loan_repayment (loan_id);
CREATE INDEX idx_loan_repayment_date ON loan_repayment (payment_date);

ALTER TABLE settings_audit_log DROP CONSTRAINT chk_settings_audit_log_section;
ALTER TABLE settings_audit_log ADD CONSTRAINT chk_settings_audit_log_section CHECK (section IN (
    -- paste every value from V63's CHECK list here, then:
    'EXPENSE', 'ADVANCE_LOAN', 'LOAN_REPAYMENT'
));
```

Replace the `-- paste ...` comment with the real values from V63 (open the file; do not guess). Remove the comment line.

- [ ] **Step 2: Write the enum**

```java
package com.plotchain.expense;

public enum PayMode { CASH, CHEQUE, DD, UPI, BANK_TRANSFER }
```

- [ ] **Step 3: Verify the schema applies**

Run: `cd backend && mvn -q -Dtest=PlotchainApplicationTests test`
Expected: PASS (Flyway applies V64; `ddl-auto: validate` is satisfied since no entities exist yet).

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/resources/db/migration/V64__invoice_expense_loans.sql backend/src/main/java/com/plotchain/expense/PayMode.java
git commit -m "feat(invoice): migration for expense, advance loan, repayment tables"
```

---

### Task 2: Expense backend

**Files:**
- Create: `backend/src/main/java/com/plotchain/expense/{Expense,ExpenseRepository,ExpenseRequest,ExpenseResponse,ExpenseException,ExpenseService,ExpenseController}.java`
- Modify: `backend/src/main/java/com/plotchain/auth/SecurityConfig.java` (before the final `.anyRequest().authenticated()`)
- Test: `backend/src/test/java/com/plotchain/expense/ExpenseServiceTest.java`, `ExpenseControllerTest.java`

**Interfaces:**
- Consumes: `ExpenseTypeRepository.findById(UUID)` returning `ExpenseType` with `getStatus()`/`getName()`; `ProjectRepository.findById(UUID)` (`com.plotchain.projects`, `Project.getName()`); `SettingsAuditService.record`; `PayMode`.
- Produces: `ExpenseService.create(ExpenseRequest, UUID actorId) -> ExpenseResponse`; `ExpenseService.list(LocalDate from, LocalDate to, UUID typeId, UUID projectId) -> List<ExpenseResponse>`; `ExpenseException(HttpStatus, String)`; REST `POST /api/admin/expenses` (201), `GET /api/admin/expenses?from&to&typeId&projectId`.

- [ ] **Step 1: Write the failing service test**

```java
package com.plotchain.expense;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.company.SettingsAuditLogRepository;
import com.plotchain.company.SettingsAuditService;
import com.plotchain.expensetype.ExpenseType;
import com.plotchain.expensetype.ExpenseTypeRepository;
import com.plotchain.projects.ProjectRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ExpenseServiceTest {

    @Mock ExpenseRepository repository;
    @Mock ExpenseTypeRepository typeRepository;
    @Mock ProjectRepository projectRepository;
    @Mock SettingsAuditLogRepository auditLogRepository;
    @Mock AssociateRepository associateRepository;

    ExpenseService service;
    UUID typeId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        SettingsAuditService audit = new SettingsAuditService(auditLogRepository, associateRepository, new ObjectMapper().findAndRegisterModules());
        service = new ExpenseService(repository, typeRepository, projectRepository, audit);
    }

    private ExpenseType activeType() {
        ExpenseType t = new ExpenseType(typeId);
        t.setName("Travel");
        return t;
    }

    private ExpenseRequest request(String amount) {
        return new ExpenseRequest(LocalDate.of(2026, 10, 1), typeId, null, " Vendor ", new BigDecimal(amount),
            PayMode.UPI, " HDFC ", "  ", "note");
    }

    @Test
    void createTrimsTextAndStoresBlankTxnAsNull() {
        when(typeRepository.findById(typeId)).thenReturn(Optional.of(activeType()));
        ExpenseResponse r = service.create(request("100.50"), UUID.randomUUID());
        assertThat(r.payTo()).isEqualTo("Vendor");
        assertThat(r.bankName()).isEqualTo("HDFC");
        assertThat(r.txnNo()).isNull();
        assertThat(r.expenseTypeName()).isEqualTo("Travel");
        verify(repository).save(any(Expense.class));
    }

    @Test
    void createRejectsInactiveType() {
        ExpenseType t = activeType();
        t.setStatus(ExpenseType.Status.INACTIVE);
        when(typeRepository.findById(typeId)).thenReturn(Optional.of(t));
        assertThatThrownBy(() -> service.create(request("10"), UUID.randomUUID()))
            .isInstanceOf(ExpenseException.class).hasMessageContaining("inactive");
    }

    @Test
    void createRejectsUnknownType() {
        when(typeRepository.findById(typeId)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.create(request("10"), UUID.randomUUID()))
            .isInstanceOf(ExpenseException.class);
    }

    @Test
    void createRejectsMoreThanTwoDecimals() {
        assertThatThrownBy(() -> service.create(request("10.005"), UUID.randomUUID()))
            .isInstanceOf(ExpenseException.class).hasMessageContaining("2 decimal");
    }

    @Test
    void listRejectsFromAfterTo() {
        assertThatThrownBy(() -> service.list(LocalDate.of(2026, 10, 5), LocalDate.of(2026, 10, 1), null, null))
            .isInstanceOf(ExpenseException.class);
    }

    @Test
    void listFiltersByTypeInMemory() {
        UUID other = UUID.randomUUID();
        Expense a = new Expense(UUID.randomUUID(), LocalDate.of(2026, 10, 1), typeId, null, "A", new BigDecimal("1.00"), PayMode.CASH, null, null, null);
        Expense b = new Expense(UUID.randomUUID(), LocalDate.of(2026, 10, 2), other, null, "B", new BigDecimal("2.00"), PayMode.CASH, null, null, null);
        when(repository.findByExpenseDateBetweenOrderByExpenseDateDescCreatedAtDesc(any(), any())).thenReturn(List.of(a, b));
        when(typeRepository.findAllById(any())).thenReturn(List.of(activeType()));
        assertThat(service.list(null, null, typeId, null)).extracting(ExpenseResponse::payTo).containsExactly("A");
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && mvn -q -Dtest=ExpenseServiceTest test`
Expected: FAIL (compilation: `ExpenseService` etc. not defined).

- [ ] **Step 3: Write the implementation**

`Expense.java`:
```java
package com.plotchain.expense;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "expense")
public class Expense {
    @Id private UUID id;
    @Column(name = "expense_date") private LocalDate expenseDate;
    @Column(name = "expense_type_id") private UUID expenseTypeId;
    @Column(name = "project_id") private UUID projectId;
    @Column(name = "pay_to") private String payTo;
    private BigDecimal amount;
    @Enumerated(EnumType.STRING) @Column(name = "pay_mode") private PayMode payMode;
    @Column(name = "bank_name") private String bankName;
    @Column(name = "txn_no") private String txnNo;
    private String remarks;
    @Column(name = "created_at") private Instant createdAt;

    protected Expense() {}

    public Expense(UUID id, LocalDate expenseDate, UUID expenseTypeId, UUID projectId, String payTo, BigDecimal amount,
                   PayMode payMode, String bankName, String txnNo, String remarks) {
        this.id = id;
        this.expenseDate = expenseDate;
        this.expenseTypeId = expenseTypeId;
        this.projectId = projectId;
        this.payTo = payTo;
        this.amount = amount;
        this.payMode = payMode;
        this.bankName = bankName;
        this.txnNo = txnNo;
        this.remarks = remarks;
        this.createdAt = Instant.now();
    }

    public UUID getId() { return id; }
    public LocalDate getExpenseDate() { return expenseDate; }
    public UUID getExpenseTypeId() { return expenseTypeId; }
    public UUID getProjectId() { return projectId; }
    public String getPayTo() { return payTo; }
    public BigDecimal getAmount() { return amount; }
    public PayMode getPayMode() { return payMode; }
    public String getBankName() { return bankName; }
    public String getTxnNo() { return txnNo; }
    public String getRemarks() { return remarks; }
    public Instant getCreatedAt() { return createdAt; }
}
```

`ExpenseRepository.java`:
```java
package com.plotchain.expense;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public interface ExpenseRepository extends JpaRepository<Expense, UUID> {
    List<Expense> findByExpenseDateBetweenOrderByExpenseDateDescCreatedAtDesc(LocalDate from, LocalDate to);
}
```

`ExpenseRequest.java`:
```java
package com.plotchain.expense;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

public record ExpenseRequest(
    @NotNull LocalDate expenseDate,
    @NotNull UUID expenseTypeId,
    UUID projectId,
    @NotBlank @Size(max = 150) String payTo,
    @NotNull @Positive BigDecimal amount,
    @NotNull PayMode payMode,
    @Size(max = 100) String bankName,
    @Size(max = 100) String txnNo,
    @Size(max = 500) String remarks
) {}
```

`ExpenseResponse.java`:
```java
package com.plotchain.expense;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

public record ExpenseResponse(UUID id, LocalDate expenseDate, UUID expenseTypeId, String expenseTypeName, UUID projectId,
                              String projectName, String payTo, BigDecimal amount, PayMode payMode, String bankName,
                              String txnNo, String remarks) {}
```

`ExpenseException.java` (same shape as `ExpenseTypeException`, own advice):
```java
package com.plotchain.expense;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

public class ExpenseException extends RuntimeException {
    private final HttpStatus status;

    public ExpenseException(HttpStatus status, String message) {
        super(message);
        this.status = status;
    }

    @RestControllerAdvice
    static class Handler {
        @ExceptionHandler(ExpenseException.class)
        ResponseEntity<Map<String, String>> handle(ExpenseException ex) {
            return ResponseEntity.status(ex.status).body(Map.of("error", ex.getMessage()));
        }
    }
}
```

`ExpenseService.java`:
```java
package com.plotchain.expense;

import com.plotchain.company.SettingsAuditService;
import com.plotchain.expensetype.ExpenseType;
import com.plotchain.expensetype.ExpenseTypeRepository;
import com.plotchain.projects.Project;
import com.plotchain.projects.ProjectRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class ExpenseService {

    private static final String AUDIT_SECTION = "EXPENSE";
    private static final LocalDate MIN_DATE = LocalDate.of(1970, 1, 1);
    private static final LocalDate MAX_DATE = LocalDate.of(9999, 12, 31);

    private final ExpenseRepository repository;
    private final ExpenseTypeRepository typeRepository;
    private final ProjectRepository projectRepository;
    private final SettingsAuditService auditService;

    public ExpenseService(ExpenseRepository repository, ExpenseTypeRepository typeRepository,
                          ProjectRepository projectRepository, SettingsAuditService auditService) {
        this.repository = repository;
        this.typeRepository = typeRepository;
        this.projectRepository = projectRepository;
        this.auditService = auditService;
    }

    @Transactional
    public ExpenseResponse create(ExpenseRequest r, UUID actorId) {
        requireTwoDecimals(r.amount());
        ExpenseType type = typeRepository.findById(r.expenseTypeId())
            .orElseThrow(() -> new ExpenseException(HttpStatus.NOT_FOUND, "Expense type not found: " + r.expenseTypeId()));
        if (type.getStatus() != ExpenseType.Status.ACTIVE) {
            throw new ExpenseException(HttpStatus.CONFLICT, "Expense type is inactive: " + type.getName());
        }
        Project project = null;
        if (r.projectId() != null) {
            project = projectRepository.findById(r.projectId())
                .orElseThrow(() -> new ExpenseException(HttpStatus.NOT_FOUND, "Project not found: " + r.projectId()));
        }
        Expense e = new Expense(UUID.randomUUID(), r.expenseDate(), type.getId(), r.projectId(), r.payTo().trim(),
            r.amount(), r.payMode(), blankToNull(r.bankName()), blankToNull(r.txnNo()), blankToNull(r.remarks()));
        repository.save(e);
        auditService.record(AUDIT_SECTION, "Recorded expense " + r.amount() + " to " + e.getPayTo(),
            Map.of("id", e.getId().toString(), "amount", r.amount().toPlainString()), actorId);
        return toResponse(e, type.getName(), project == null ? null : project.getName());
    }

    // ponytail: filters typeId/projectId applied in memory over a date-bounded list; push into the query if row counts grow.
    @Transactional(readOnly = true)
    public List<ExpenseResponse> list(LocalDate from, LocalDate to, UUID typeId, UUID projectId) {
        if (from != null && to != null && from.isAfter(to)) {
            throw new ExpenseException(HttpStatus.BAD_REQUEST, "from must not be after to");
        }
        List<Expense> rows = repository.findByExpenseDateBetweenOrderByExpenseDateDescCreatedAtDesc(
                from == null ? MIN_DATE : from, to == null ? MAX_DATE : to).stream()
            .filter(e -> typeId == null || typeId.equals(e.getExpenseTypeId()))
            .filter(e -> projectId == null || projectId.equals(e.getProjectId()))
            .toList();
        Map<UUID, String> typeNames = typeRepository.findAllById(rows.stream().map(Expense::getExpenseTypeId).distinct().toList())
            .stream().collect(Collectors.toMap(ExpenseType::getId, ExpenseType::getName));
        Map<UUID, String> projectNames = projectRepository.findAllById(
                rows.stream().map(Expense::getProjectId).filter(java.util.Objects::nonNull).distinct().toList())
            .stream().collect(Collectors.toMap(Project::getId, Project::getName));
        return rows.stream().map(e -> toResponse(e, typeNames.get(e.getExpenseTypeId()), projectNames.get(e.getProjectId()))).toList();
    }

    private static ExpenseResponse toResponse(Expense e, String typeName, String projectName) {
        return new ExpenseResponse(e.getId(), e.getExpenseDate(), e.getExpenseTypeId(), typeName, e.getProjectId(),
            projectName, e.getPayTo(), e.getAmount(), e.getPayMode(), e.getBankName(), e.getTxnNo(), e.getRemarks());
    }

    static void requireTwoDecimals(BigDecimal amount) {
        if (amount.scale() > 2 && amount.stripTrailingZeros().scale() > 2) {
            throw new ExpenseException(HttpStatus.BAD_REQUEST, "Amount must have at most 2 decimal places");
        }
    }

    static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
```
Do not import `java.util.function.Function` (not used above).

`ExpenseController.java`:
```java
package com.plotchain.expense;

import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/expenses")
@PreAuthorize("hasAuthority('ADMIN')")
public class ExpenseController {

    private final ExpenseService service;

    public ExpenseController(ExpenseService service) {
        this.service = service;
    }

    @PostMapping
    public ResponseEntity<ExpenseResponse> create(@Valid @RequestBody ExpenseRequest request, @AuthenticationPrincipal UUID actorId) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(request, actorId));
    }

    @GetMapping
    public List<ExpenseResponse> list(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) UUID typeId,
            @RequestParam(required = false) UUID projectId) {
        return service.list(from, to, typeId, projectId);
    }
}
```

`SecurityConfig.java`: insert directly above the last `.anyRequest().authenticated())` (line ~456):
```java
                // Invoice > Expenses register: no blanket GET /api/admin/**, so the list needs its own matcher.
                .requestMatchers(HttpMethod.GET, "/api/admin/expenses")
                    .hasAuthority("ADMIN")
```

- [ ] **Step 4: Run service test**

Run: `cd backend && mvn -q -Dtest=ExpenseServiceTest test`
Expected: PASS (5 tests). If the "inactive" assertion fails because `ExpenseType.setStatus` is the only way, it is: the test already uses it.

- [ ] **Step 5: Write the controller test**

```java
package com.plotchain.expense;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.auth.JwtService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ExpenseControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;
    @MockBean AssociateRepository associateRepository;
    @MockBean ExpenseService service;

    private String tokenFor(AssociateRole role) {
        Associate a = new Associate();
        a.setId(UUID.randomUUID());
        a.setRole(role);
        when(associateRepository.findById(a.getId())).thenReturn(Optional.of(a));
        return jwtService.generateToken(a);
    }

    @Test
    void listIsForbiddenForAssociate() throws Exception {
        mockMvc.perform(get("/api/admin/expenses").header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    @Test
    void listIsOkForAdmin() throws Exception {
        when(service.list(null, null, null, null)).thenReturn(List.of());
        mockMvc.perform(get("/api/admin/expenses").header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk());
    }

    @Test
    void createRejectsZeroAmountWith400() throws Exception {
        String body = "{\"expenseDate\":\"2026-10-01\",\"expenseTypeId\":\"" + UUID.randomUUID()
            + "\",\"payTo\":\"X\",\"amount\":0,\"payMode\":\"CASH\"}";
        mockMvc.perform(post("/api/admin/expenses").header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json").content(body))
            .andExpect(status().isBadRequest());
    }
}
```
Check `AssociateRole` has an associate-level constant (open `AssociateRole.java`; use its real non-admin name instead of `ASSOCIATE` if different).

- [ ] **Step 6: Run controller test**

Run: `cd backend && mvn -q -Dtest=ExpenseControllerTest test`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/plotchain/expense backend/src/main/java/com/plotchain/auth/SecurityConfig.java backend/src/test/java/com/plotchain/expense
git commit -m "feat(invoice): expense create/list API"
```

---

### Task 3: Advance loans and repayments backend

**Files:**
- Create: `backend/src/main/java/com/plotchain/advanceloan/{AdvanceLoan,LoanRepayment,AdvanceLoanRepository,LoanRepaymentRepository,AdvanceLoanRequest,RepaymentRequest,AdvanceLoanResponse,LoanDuesResponse,LoanRepaymentResponse,AdvanceLoanException,AdvanceLoanService,AdvanceLoanController}.java`
- Modify: `backend/src/main/java/com/plotchain/auth/SecurityConfig.java`
- Test: `backend/src/test/java/com/plotchain/advanceloan/AdvanceLoanServiceTest.java`, `AdvanceLoanControllerTest.java`

**Interfaces:**
- Consumes: `AssociateRepository.findById(UUID)`, `findAllById`; `Associate.getUserId()/getName()/getPhone()`; `PayMode`. The two small helpers (`requireTwoDecimals`, `blankToNull`) are deliberately duplicated as private statics in `AdvanceLoanService` rather than shared across packages.
- Produces:
  - `AdvanceLoanService.create(AdvanceLoanRequest, UUID actorId) -> AdvanceLoanResponse`
  - `AdvanceLoanService.dues(UUID associateId) -> LoanDuesResponse(UUID associateId, BigDecimal outstanding)`
  - `AdvanceLoanService.list(UUID associateId, LocalDate from, LocalDate to) -> List<AdvanceLoanResponse>`
  - `AdvanceLoanService.repay(UUID loanId, RepaymentRequest, UUID actorId) -> LoanRepaymentResponse`
  - `AdvanceLoanService.repayments(LocalDate from, LocalDate to, String q) -> List<LoanRepaymentResponse>`
  - `AdvanceLoanService.repayment(UUID id) -> LoanRepaymentResponse`
  - REST: `POST /api/admin/advance-loans` (201), `GET /api/admin/advance-loans?associateId&from&to`, `GET /api/admin/advance-loans/dues?associateId=`, `POST /api/admin/advance-loans/{id}/repayments` (201), `GET /api/admin/loan-repayments?from&to&q`, `GET /api/admin/loan-repayments/{id}`.
  - `LoanRepaymentResponse(UUID id, UUID loanId, String receiptNo, LocalDate paymentDate, UUID associateId, String associateUserId, String associateName, String associatePhone, BigDecimal amount, PayMode payMode, String bankName, String txnNo)`
  - `AdvanceLoanResponse(UUID id, UUID associateId, String associateUserId, String associateName, LocalDate loanDate, BigDecimal amount, BigDecimal previousDues, BigDecimal repaid, BigDecimal outstanding, PayMode payMode, String bankName, String instrumentNo, String remarks)`

- [ ] **Step 1: Write the failing service test**

Mock repos: `AdvanceLoanRepository loans`, `LoanRepaymentRepository repayments`, `AssociateRepository associates` (also feeds `SettingsAuditService`). Repository methods the test relies on (define them in Step 3):
- `loans.findByIdForUpdate(UUID) -> Optional<AdvanceLoan>`
- `loans.sumAmountByAssociate(UUID) -> BigDecimal`
- `loans.findInRange(LocalDate from, LocalDate to) -> List<AdvanceLoan>`
- `repayments.sumAmountByLoan(UUID) -> BigDecimal`
- `repayments.sumAmountByAssociate(UUID) -> BigDecimal`
- `repayments.sumsByLoanIds(Collection<UUID>) -> List<Object[]>` (loanId, sum)
- `repayments.nextReceiptNumber() -> long`
- `repayments.search(LocalDate from, LocalDate to, String q) -> List<LoanRepayment>`

```java
package com.plotchain.advanceloan;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.company.SettingsAuditLogRepository;
import com.plotchain.company.SettingsAuditService;
import com.plotchain.expense.PayMode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdvanceLoanServiceTest {

    @Mock AdvanceLoanRepository loans;
    @Mock LoanRepaymentRepository repayments;
    @Mock AssociateRepository associates;
    @Mock SettingsAuditLogRepository auditLogRepository;

    AdvanceLoanService service;
    UUID associateId = UUID.randomUUID();
    Associate associate;

    @BeforeEach
    void setUp() {
        SettingsAuditService audit = new SettingsAuditService(auditLogRepository, associates, new ObjectMapper().findAndRegisterModules());
        service = new AdvanceLoanService(loans, repayments, associates, audit);
        associate = new Associate();
        associate.setId(associateId);
        associate.setUserId("VP00001");
        associate.setName("Asha");
        associate.setPhone("9999999999");
    }

    private AdvanceLoanRequest loanRequest(String amount) {
        return new AdvanceLoanRequest(associateId, LocalDate.of(2026, 10, 1), new BigDecimal(amount), PayMode.CASH, null, null, null);
    }

    private AdvanceLoan loan(String amount) {
        return new AdvanceLoan(UUID.randomUUID(), associateId, LocalDate.of(2026, 10, 1), new BigDecimal(amount),
            BigDecimal.ZERO, PayMode.CASH, null, null, null);
    }

    private RepaymentRequest repayRequest(String amount) {
        return new RepaymentRequest(LocalDate.of(2026, 10, 2), new BigDecimal(amount), PayMode.UPI, "HDFC", "TXN1");
    }

    @Test
    void createSnapshotsPreviousDuesExcludingNewLoan() {
        when(associates.findById(associateId)).thenReturn(Optional.of(associate));
        when(loans.sumAmountByAssociate(associateId)).thenReturn(new BigDecimal("1000.00"));
        when(repayments.sumAmountByAssociate(associateId)).thenReturn(new BigDecimal("300.00"));
        AdvanceLoanResponse r = service.create(loanRequest("500"), UUID.randomUUID());
        assertThat(r.previousDues()).isEqualByComparingTo("700.00");
        assertThat(r.outstanding()).isEqualByComparingTo("500");
        ArgumentCaptor<AdvanceLoan> saved = ArgumentCaptor.forClass(AdvanceLoan.class);
        verify(loans).save(saved.capture());
        assertThat(saved.getValue().getPreviousDues()).isEqualByComparingTo("700.00");
    }

    @Test
    void createRejectsUnknownAssociate() {
        when(associates.findById(associateId)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.create(loanRequest("5"), UUID.randomUUID())).isInstanceOf(AdvanceLoanException.class);
    }

    @Test
    void createRejectsMoreThanTwoDecimals() {
        assertThatThrownBy(() -> service.create(loanRequest("5.001"), UUID.randomUUID())).isInstanceOf(AdvanceLoanException.class);
    }

    @Test
    void duesIsZeroWhenAssociateHasNoLoans() {
        when(loans.sumAmountByAssociate(associateId)).thenReturn(BigDecimal.ZERO);
        when(repayments.sumAmountByAssociate(associateId)).thenReturn(BigDecimal.ZERO);
        assertThat(service.dues(associateId).outstanding()).isEqualByComparingTo("0");
    }

    @Test
    void repayLocksLoanAndAssignsReceiptNumber() {
        AdvanceLoan l = loan("1000");
        when(loans.findByIdForUpdate(l.getId())).thenReturn(Optional.of(l));
        when(repayments.sumAmountByLoan(l.getId())).thenReturn(new BigDecimal("400"));
        when(repayments.nextReceiptNumber()).thenReturn(123L);
        when(associates.findById(associateId)).thenReturn(Optional.of(associate));
        LoanRepaymentResponse r = service.repay(l.getId(), repayRequest("600"), UUID.randomUUID());
        assertThat(r.receiptNo()).isEqualTo("RCP-000123");
        assertThat(r.associateUserId()).isEqualTo("VP00001");
        verify(loans).findByIdForUpdate(l.getId());
        verify(repayments).save(any(LoanRepayment.class));
    }

    @Test
    void repayRejectsOneCentOverRemaining() {
        AdvanceLoan l = loan("1000");
        when(loans.findByIdForUpdate(l.getId())).thenReturn(Optional.of(l));
        when(repayments.sumAmountByLoan(l.getId())).thenReturn(new BigDecimal("400"));
        assertThatThrownBy(() -> service.repay(l.getId(), repayRequest("600.01"), UUID.randomUUID()))
            .isInstanceOf(AdvanceLoanException.class).hasMessageContaining("remaining");
    }

    @Test
    void repayRejectsUnknownLoan() {
        UUID id = UUID.randomUUID();
        when(loans.findByIdForUpdate(id)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.repay(id, repayRequest("1"), UUID.randomUUID())).isInstanceOf(AdvanceLoanException.class);
    }

    @Test
    void repaymentsRejectFromAfterTo() {
        assertThatThrownBy(() -> service.repayments(LocalDate.of(2026, 10, 5), LocalDate.of(2026, 10, 1), null))
            .isInstanceOf(AdvanceLoanException.class);
    }

    @Test
    void repaymentsEscapeLikeWildcardsInSearch() {
        when(repayments.search(any(), any(), eq("%\\%%"))).thenReturn(List.of());
        service.repayments(null, null, "%");
        verify(repayments).search(any(), any(), eq("%\\%%"));
    }
}
```
The search pattern is `"%" + escaped(lowercased q) + "%"` where `\`, `%`, `_` are prefixed with `\`; blank/null q → `"%"`.

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && mvn -q -Dtest=AdvanceLoanServiceTest test`
Expected: FAIL (compilation).

- [ ] **Step 3: Write the implementation**

`AdvanceLoan.java` and `LoanRepayment.java`: entities mirroring `Expense` (UUID id, columns per the migration, protected no-arg ctor, public ctor, getters). `AdvanceLoan` ctor signature `(UUID id, UUID associateId, LocalDate loanDate, BigDecimal amount, BigDecimal previousDues, PayMode payMode, String bankName, String instrumentNo, String remarks)`; getters `getId/getAssociateId/getLoanDate/getAmount/getPreviousDues/getPayMode/getBankName/getInstrumentNo/getRemarks`. `LoanRepayment` ctor `(UUID id, UUID loanId, String receiptNo, LocalDate paymentDate, BigDecimal amount, PayMode payMode, String bankName, String txnNo)`; getters likewise. Both use `@Enumerated(EnumType.STRING)` on `payMode` and `@Column(name = "...")` snake_case names exactly as in V64.

`AdvanceLoanRepository.java`:
```java
package com.plotchain.advanceloan;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AdvanceLoanRepository extends JpaRepository<AdvanceLoan, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select l from AdvanceLoan l where l.id = :id")
    Optional<AdvanceLoan> findByIdForUpdate(@Param("id") UUID id);

    @Query("select coalesce(sum(l.amount), 0) from AdvanceLoan l where l.associateId = :associateId")
    BigDecimal sumAmountByAssociate(@Param("associateId") UUID associateId);

    @Query("select l from AdvanceLoan l where l.loanDate between :from and :to order by l.loanDate desc, l.createdAt desc")
    List<AdvanceLoan> findInRange(@Param("from") LocalDate from, @Param("to") LocalDate to);
}
```
`AdvanceLoan` needs a `createdAt` field/column for that ordering (`@Column(name = "created_at") private Instant createdAt;` set in ctor).

`LoanRepaymentRepository.java`:
```java
package com.plotchain.advanceloan;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface LoanRepaymentRepository extends JpaRepository<LoanRepayment, UUID> {

    @Query("select coalesce(sum(r.amount), 0) from LoanRepayment r where r.loanId = :loanId")
    BigDecimal sumAmountByLoan(@Param("loanId") UUID loanId);

    @Query("select coalesce(sum(r.amount), 0) from LoanRepayment r, AdvanceLoan l where r.loanId = l.id and l.associateId = :associateId")
    BigDecimal sumAmountByAssociate(@Param("associateId") UUID associateId);

    @Query("select r.loanId, sum(r.amount) from LoanRepayment r where r.loanId in :loanIds group by r.loanId")
    List<Object[]> sumsByLoanIds(@Param("loanIds") Collection<UUID> loanIds);

    @Query(value = "select nextval('loan_repayment_receipt_seq')", nativeQuery = true)
    long nextReceiptNumber();

    @Query("""
        select r from LoanRepayment r, AdvanceLoan l, Associate a
        where r.loanId = l.id and l.associateId = a.id
          and r.paymentDate between :from and :to
          and (lower(a.userId) like :q escape '\\' or lower(a.name) like :q escape '\\' or a.phone like :q escape '\\')
        order by r.paymentDate desc, r.createdAt desc
        """)
    List<LoanRepayment> search(@Param("from") LocalDate from, @Param("to") LocalDate to, @Param("q") String q);
}
```
`LoanRepayment` needs `createdAt` for the ordering too.

DTOs (records, `jakarta.validation` like `ExpenseRequest`):
```java
public record AdvanceLoanRequest(@NotNull UUID associateId, @NotNull LocalDate loanDate, @NotNull @Positive BigDecimal amount,
    @NotNull PayMode payMode, @Size(max = 100) String bankName, @Size(max = 100) String instrumentNo, @Size(max = 500) String remarks) {}

public record RepaymentRequest(@NotNull LocalDate paymentDate, @NotNull @Positive BigDecimal amount, @NotNull PayMode payMode,
    @Size(max = 100) String bankName, @Size(max = 100) String txnNo) {}

public record LoanDuesResponse(UUID associateId, BigDecimal outstanding) {}
```
plus `AdvanceLoanResponse` and `LoanRepaymentResponse` exactly per the Interfaces block above. `AdvanceLoanException` is a copy of `ExpenseException` renamed (own `@RestControllerAdvice`).

`AdvanceLoanService.java` (constructor `(AdvanceLoanRepository loans, LoanRepaymentRepository repayments, AssociateRepository associates, SettingsAuditService auditService)`):
```java
@Service
public class AdvanceLoanService {
    private static final LocalDate MIN_DATE = LocalDate.of(1970, 1, 1);
    private static final LocalDate MAX_DATE = LocalDate.of(9999, 12, 31);

    // fields + ctor as above

    @Transactional
    public AdvanceLoanResponse create(AdvanceLoanRequest r, UUID actorId) {
        requireTwoDecimals(r.amount());
        Associate a = associates.findById(r.associateId())
            .orElseThrow(() -> new AdvanceLoanException(HttpStatus.NOT_FOUND, "Associate not found: " + r.associateId()));
        BigDecimal previousDues = loans.sumAmountByAssociate(a.getId()).subtract(repayments.sumAmountByAssociate(a.getId()));
        AdvanceLoan l = new AdvanceLoan(UUID.randomUUID(), a.getId(), r.loanDate(), r.amount(), previousDues, r.payMode(),
            blankToNull(r.bankName()), blankToNull(r.instrumentNo()), blankToNull(r.remarks()));
        loans.save(l);
        auditService.record("ADVANCE_LOAN", "Advance loan " + r.amount() + " to " + a.getUserId(),
            Map.of("id", l.getId().toString(), "amount", r.amount().toPlainString()), actorId);
        return toResponse(l, a, BigDecimal.ZERO);
    }

    @Transactional(readOnly = true)
    public LoanDuesResponse dues(UUID associateId) {
        return new LoanDuesResponse(associateId,
            loans.sumAmountByAssociate(associateId).subtract(repayments.sumAmountByAssociate(associateId)));
    }

    // ponytail: associateId filter applied in memory over a date-bounded list.
    @Transactional(readOnly = true)
    public List<AdvanceLoanResponse> list(UUID associateId, LocalDate from, LocalDate to) {
        checkRange(from, to);
        List<AdvanceLoan> rows = loans.findInRange(from == null ? MIN_DATE : from, to == null ? MAX_DATE : to).stream()
            .filter(l -> associateId == null || associateId.equals(l.getAssociateId())).toList();
        Map<UUID, Associate> byId = associates.findAllById(rows.stream().map(AdvanceLoan::getAssociateId).distinct().toList())
            .stream().collect(Collectors.toMap(Associate::getId, x -> x));
        Map<UUID, BigDecimal> repaid = rows.isEmpty() ? Map.of()
            : repayments.sumsByLoanIds(rows.stream().map(AdvanceLoan::getId).toList()).stream()
                .collect(Collectors.toMap(o -> (UUID) o[0], o -> (BigDecimal) o[1]));
        return rows.stream().map(l -> toResponse(l, byId.get(l.getAssociateId()), repaid.getOrDefault(l.getId(), BigDecimal.ZERO))).toList();
    }

    @Transactional
    public LoanRepaymentResponse repay(UUID loanId, RepaymentRequest r, UUID actorId) {
        requireTwoDecimals(r.amount());
        AdvanceLoan l = loans.findByIdForUpdate(loanId)
            .orElseThrow(() -> new AdvanceLoanException(HttpStatus.NOT_FOUND, "Advance loan not found: " + loanId));
        BigDecimal remaining = l.getAmount().subtract(repayments.sumAmountByLoan(loanId));
        if (r.amount().compareTo(remaining) > 0) {
            throw new AdvanceLoanException(HttpStatus.CONFLICT, "Repayment exceeds remaining balance of " + remaining.toPlainString());
        }
        Associate a = associates.findById(l.getAssociateId()).orElseThrow();
        String receiptNo = String.format("RCP-%06d", repayments.nextReceiptNumber());
        LoanRepayment p = new LoanRepayment(UUID.randomUUID(), loanId, receiptNo, r.paymentDate(), r.amount(), r.payMode(),
            blankToNull(r.bankName()), blankToNull(r.txnNo()));
        repayments.save(p);
        auditService.record("LOAN_REPAYMENT", "Repayment " + r.amount() + " receipt " + receiptNo,
            Map.of("id", p.getId().toString(), "loanId", loanId.toString(), "receiptNo", receiptNo), actorId);
        return toResponse(p, a);
    }

    @Transactional(readOnly = true)
    public List<LoanRepaymentResponse> repayments(LocalDate from, LocalDate to, String q) {
        checkRange(from, to);
        List<LoanRepayment> rows = repayments.search(from == null ? MIN_DATE : from, to == null ? MAX_DATE : to, likePattern(q));
        return rows.stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public LoanRepaymentResponse repayment(UUID id) {
        return toResponse(repayments.findById(id)
            .orElseThrow(() -> new AdvanceLoanException(HttpStatus.NOT_FOUND, "Repayment not found: " + id)));
    }

    private LoanRepaymentResponse toResponse(LoanRepayment p) {
        AdvanceLoan l = loans.findById(p.getLoanId()).orElseThrow();
        return toResponse(p, associates.findById(l.getAssociateId()).orElseThrow());
    }
    // ponytail: per-row lookups in the register; batch the loan/associate fetch if the register gets large.

    private static LoanRepaymentResponse toResponse(LoanRepayment p, Associate a) {
        return new LoanRepaymentResponse(p.getId(), p.getLoanId(), p.getReceiptNo(), p.getPaymentDate(), a.getId(),
            a.getUserId(), a.getName(), a.getPhone(), p.getAmount(), p.getPayMode(), p.getBankName(), p.getTxnNo());
    }

    private static AdvanceLoanResponse toResponse(AdvanceLoan l, Associate a, BigDecimal repaid) {
        return new AdvanceLoanResponse(l.getId(), a.getId(), a.getUserId(), a.getName(), l.getLoanDate(), l.getAmount(),
            l.getPreviousDues(), repaid, l.getAmount().subtract(repaid), l.getPayMode(), l.getBankName(),
            l.getInstrumentNo(), l.getRemarks());
    }

    static String likePattern(String q) {
        if (q == null || q.isBlank()) return "%";
        String escaped = q.trim().toLowerCase().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
        return "%" + escaped + "%";
    }

    private static void checkRange(LocalDate from, LocalDate to) {
        if (from != null && to != null && from.isAfter(to)) {
            throw new AdvanceLoanException(HttpStatus.BAD_REQUEST, "from must not be after to");
        }
    }

    private static void requireTwoDecimals(BigDecimal amount) {
        if (amount.stripTrailingZeros().scale() > 2) {
            throw new AdvanceLoanException(HttpStatus.BAD_REQUEST, "Amount must have at most 2 decimal places");
        }
    }

    private static String blankToNull(String s) { return s == null || s.isBlank() ? null : s.trim(); }
}
```

Note the existing test `repayLocksLoanAndAssignsReceiptNumber` mocks `associates.findById` and does not mock `loans.findById`; `repay` calls the static `toResponse(p, a)` directly, so it never needs `loans.findById`.

`AdvanceLoanController.java`: `@RestController @RequestMapping("/api/admin") @PreAuthorize("hasAuthority('ADMIN')")` with
```java
@PostMapping("/advance-loans")                       -> 201 service.create(...)
@GetMapping("/advance-loans")                        -> service.list(associateId, from, to)
@GetMapping("/advance-loans/dues")                   -> service.dues(associateId)   // @RequestParam UUID associateId (required)
@PostMapping("/advance-loans/{id}/repayments")       -> 201 service.repay(id, request, actorId)
@GetMapping("/loan-repayments")                      -> service.repayments(from, to, q)
@GetMapping("/loan-repayments/{id}")                 -> service.repayment(id)
```
Use the same `@DateTimeFormat(iso = DATE)` params and `@AuthenticationPrincipal UUID actorId` as `ExpenseController`.

`SecurityConfig.java`: next to the expenses matcher add exact matchers for `GET /api/admin/advance-loans`, `GET /api/admin/advance-loans/dues`, `GET /api/admin/loan-repayments`, `GET /api/admin/loan-repayments/*`, each `.hasAuthority("ADMIN")`.

- [ ] **Step 4: Run service test**

Run: `cd backend && mvn -q -Dtest=AdvanceLoanServiceTest test`
Expected: PASS (9 tests).

- [ ] **Step 5: Write the controller test**

Same skeleton as `ExpenseControllerTest` (`@MockBean AdvanceLoanService service`). Tests:
- `duesForbiddenForAssociate`: `GET /api/admin/advance-loans/dues?associateId=<uuid>` as non-admin → 403.
- `duesOkForAdmin`: stub `service.dues(id)` → `new LoanDuesResponse(id, BigDecimal.TEN)`; expect 200 and `$.outstanding` = 10.
- `repaymentRegisterForbiddenForAssociate`: `GET /api/admin/loan-repayments` non-admin → 403.
- `repayRejectsNegativeAmountWith400`: `POST /api/admin/advance-loans/<uuid>/repayments` with `amount: -1` → 400.
- `receiptForbiddenForAssociate`: `GET /api/admin/loan-repayments/<uuid>` non-admin → 403.

- [ ] **Step 6: Run controller test**

Run: `cd backend && mvn -q -Dtest=AdvanceLoanControllerTest test`
Expected: PASS (5 tests).

- [ ] **Step 7: Smoke the real SQL**

The Mockito tests never execute the JPQL. Run: `cd backend && mvn -q -Dtest=PlotchainApplicationTests test`
Expected: PASS. Spring Data validates `@Query` JPQL at startup, so a typo in `search`/`sumsByLoanIds` fails here. If `escape '\\'` is rejected, change to `escape '!'` and use `!` as the escape char in `likePattern` (and update the test's expected pattern to `"%!%%"`).

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/java/com/plotchain/advanceloan backend/src/main/java/com/plotchain/auth/SecurityConfig.java backend/src/test/java/com/plotchain/advanceloan
git commit -m "feat(invoice): advance loan, repayment and payment-register API"
```

---

### Task 4: Frontend service, Expenses screen

**Files:**
- Create: `frontend/src/app/admin/invoice/invoice.service.ts`
- Create: `frontend/src/app/admin/invoice/expenses/expenses.component.ts`, `expenses.component.spec.ts`
- Modify: `frontend/src/assets/i18n/en.json`, `hi.json` (add `admin.invoiceExpenses`)
- Modify: `frontend/src/styles/_admin.scss` (append `.invoice-expenses` block), `frontend/src/styles/_admin-mobile.scss`

**Interfaces:**
- Produces (`invoice.service.ts`):
```ts
export type PayMode = 'CASH' | 'CHEQUE' | 'DD' | 'UPI' | 'BANK_TRANSFER';
export const PAY_MODES: PayMode[] = ['CASH', 'CHEQUE', 'DD', 'UPI', 'BANK_TRANSFER'];
export interface ExpenseRow { id: string; expenseDate: string; expenseTypeId: string; expenseTypeName: string; projectId: string | null; projectName: string | null; payTo: string; amount: number; payMode: PayMode; bankName: string | null; txnNo: string | null; remarks: string | null; }
export interface ExpenseCreate { expenseDate: string; expenseTypeId: string; projectId: string | null; payTo: string; amount: number; payMode: PayMode; bankName: string | null; txnNo: string | null; remarks: string | null; }
export interface AssociateOption { id: string; userId: string; name: string; }
export interface ProjectOption { id: string; name: string; }
export interface LoanRow { id: string; associateId: string; associateUserId: string; associateName: string; loanDate: string; amount: number; previousDues: number; repaid: number; outstanding: number; payMode: PayMode; bankName: string | null; instrumentNo: string | null; remarks: string | null; }
export interface LoanCreate { associateId: string; loanDate: string; amount: number; payMode: PayMode; bankName: string | null; instrumentNo: string | null; remarks: string | null; }
export interface RepaymentCreate { paymentDate: string; amount: number; payMode: PayMode; bankName: string | null; txnNo: string | null; }
export interface RepaymentRow { id: string; loanId: string; receiptNo: string; paymentDate: string; associateId: string; associateUserId: string; associateName: string; associatePhone: string; amount: number; payMode: PayMode; bankName: string | null; txnNo: string | null; }
```
`InvoiceService` (`providedIn: 'root'`, `inject(HttpClient)`): `expenses(f: {from?, to?, typeId?, projectId?}) -> Observable<ExpenseRow[]>` (GET `/api/admin/expenses`, params only when set), `createExpense(b) -> POST`, `associates() -> GET /api/associates`, `projects() -> GET /api/company/projects` (map to `{id,name}`), `loans(f: {associateId?, from?, to?})`, `createLoan(b)`, `dues(associateId) -> Observable<{associateId: string; outstanding: number}>` (GET `/api/admin/advance-loans/dues?associateId=`), `repay(loanId, b) -> POST /api/admin/advance-loans/{id}/repayments`, `repayments(f: {from?, to?, q?})`, `repayment(id)`. Expense types come from the existing `ExpenseTypesService.list()`.

- [ ] **Step 1: Write the failing component spec**

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { ExpensesComponent } from './expenses.component';

describe('ExpensesComponent', () => {
  let fixture: ComponentFixture<ExpensesComponent>;
  let httpMock: HttpTestingController;
  const type = { id: 't1', name: 'Travel', status: 'ACTIVE' as const };
  const inactive = { id: 't2', name: 'Old', status: 'INACTIVE' as const };
  const row = { id: 'x1', expenseDate: '2026-10-01', expenseTypeId: 't1', expenseTypeName: 'Travel', projectId: null, projectName: null,
    payTo: 'Vendor', amount: 100, payMode: 'CASH', bankName: null, txnNo: null, remarks: null };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ExpensesComponent, HttpClientTestingModule, TranslateModule.forRoot()] });
    fixture = TestBed.createComponent(ExpensesComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne('/api/admin/expense-types').flush([type, inactive]);
    httpMock.expectOne('/api/company/projects').flush([{ id: 'p1', name: 'Green Acres' }]);
    httpMock.expectOne(r => r.url === '/api/admin/expenses').flush([row]);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('rendersListRow', () => {
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Vendor');
  });

  it('offersOnlyActiveExpenseTypes', () => {
    expect(fixture.componentInstance.activeTypes.map(t => t.id)).toEqual(['t1']);
  });

  it('doesNotPostWhenInvalid', () => {
    fixture.componentInstance.save();
    expect(fixture.componentInstance.form.touched).toBeTrue();
  });

  it('postsTrimmedBodyThenReloadsAndResets', () => {
    const c = fixture.componentInstance;
    c.form.patchValue({ expenseDate: '2026-10-02', expenseTypeId: 't1', payTo: ' Vendor ', amount: 50, payMode: 'UPI', txnNo: '' });
    c.save();
    const req = httpMock.expectOne({ method: 'POST', url: '/api/admin/expenses' });
    expect(req.request.body.payTo).toBe('Vendor');
    expect(req.request.body.txnNo).toBeNull();
    req.flush(row);
    httpMock.expectOne(r => r.url === '/api/admin/expenses').flush([row]);
    expect(c.form.value.payTo).toBe('');
  });

  it('showsServerErrorOnFailure', () => {
    const c = fixture.componentInstance;
    c.form.patchValue({ expenseDate: '2026-10-02', expenseTypeId: 't1', payTo: 'V', amount: 50, payMode: 'CASH' });
    c.save();
    httpMock.expectOne({ method: 'POST', url: '/api/admin/expenses' }).flush({ error: 'Expense type is inactive: Old' }, { status: 409, statusText: 'Conflict' });
    expect(c.formError).toContain('inactive');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='src/app/admin/invoice/expenses/**/*.spec.ts'`
Expected: FAIL (cannot find `./expenses.component`).

- [ ] **Step 3: Write `invoice.service.ts`** per the Interfaces block (types verbatim; methods build `HttpParams` only for defined filter values).

- [ ] **Step 4: Write `ExpensesComponent`**

Selector `app-invoice-expenses`, standalone, imports `CommonModule, ReactiveFormsModule, TranslateModule, EditableTableComponent, InlineBannerComponent, FieldErrorComponent`. Structure (copy the `ExpenseTypesComponent` conventions: intro block, `app-inline-banner` for `loadError` and `formError`, `EditableTableComponent readOnly`, `toFieldErrors` for 400 field errors):
- Class prefix `invoice-expenses` (`__intro`, `__form`, `__field`, `__submit`, `__filters`).
- State: `activeTypes: ExpenseType[]`, `projects: ProjectOption[]`, `rows`, `columns`, `loadError`, `formError`.
- `form = fb.nonNullable.group({ expenseDate: ['', Validators.required], expenseTypeId: ['', Validators.required], projectId: [''], payTo: ['', Validators.required], amount: [0, [Validators.required, Validators.min(0.01)]], payMode: ['CASH' as PayMode, Validators.required], bankName: [''], txnNo: [''], remarks: [''] })`.
- `ngOnInit`: load types via `ExpenseTypesService.list()` (filter ACTIVE into `activeTypes`), projects, then `load()`.
- `save()`: if invalid → `markAllAsTouched()` and return. Build `ExpenseCreate` with `payTo.trim()`, and `bankName/txnNo/remarks/projectId` → `trimmed || null`. POST; on success `form.reset(defaults)` (date cleared, payMode CASH) and `load()`; on error: field errors via `toFieldErrors`, else `formError = err.error?.error ?? translate('admin.invoiceExpenses.saveError')`.
- `load()`: `service.expenses({from, to, typeId, projectId})` from a small filter form (`filterFrom`, `filterTo`, `filterType`, `filterProject` plain properties bound with `[(ngModel)]` is not available in a reactive-only import; use a second `FormGroup filters` with `valueChanges` → `load()`); map to table rows with columns S No, Date, Type, Project, Pay To, Amount, Mode, Bank, TXN No, Remarks (`type: 'text'`; amount formatted `toFixed(2)`).
- Form fields in template: `<input type="date">`, `<select>` for type/project/payMode, `<input type="number" step="0.01" min="0.01">`, text inputs, `<textarea>` for remarks.

- [ ] **Step 5: i18n + styles**

`en.json` / `hi.json`: add `admin.invoiceExpenses` with keys `eyebrow` ("Invoice"), `title` ("Add / View Expense"), `subtitle`, `expenseDate`, `expenseType`, `project`, `payTo`, `amount`, `payMode`, `bankName`, `txnNo`, `remarks`, `addAction`, `columnSNo`, `emptyState`, `loadError`, `saveError`, `requiredError`, `filterFrom`, `filterTo`, `allTypes`, `allProjects`, and `payModes` (`CASH`, `CHEQUE`, `DD`, `UPI`, `BANK_TRANSFER` labels). Provide real Hindi strings (same keys).

`_admin.scss`: append a `.invoice-expenses` block modelled on `.expense-types` (card background, intro, a CSS-grid `.invoice-expenses__form` with `grid-template-columns: repeat(auto-fit, minmax(220px, 1fr))`, `.invoice-expenses__field` label/input styling copied from `.expense-types__modal-field`). `_admin-mobile.scss`: add `invoice-expenses` to the `@each $screen in ...` list (`min-width: 0`, card overflow) and, under the existing `max-width: 1023px` rules, make `.invoice-expenses__form` one column and inputs `min-height: 44px`.

- [ ] **Step 6: Run spec**

Run: `cd frontend && npx ng test --watch=false --include='src/app/admin/invoice/expenses/**/*.spec.ts'`
Expected: PASS (5 tests).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/admin/invoice frontend/src/assets/i18n frontend/src/styles
git commit -m "feat(invoice): expenses screen and invoice service"
```

---

### Task 5: Advance Loans screen

**Files:**
- Create: `frontend/src/app/admin/invoice/advance-loans/advance-loans.component.ts`, `advance-loans.component.spec.ts`
- Modify: `en.json`, `hi.json` (`admin.invoiceLoans`), `_admin.scss`, `_admin-mobile.scss`

**Interfaces:**
- Consumes: `InvoiceService` and types from Task 4.
- Produces: `AdvanceLoansComponent` (selector `app-invoice-loans`), prefix `invoice-loans`.

- [ ] **Step 1: Write the failing spec**

Key tests (same TestBed pattern as Task 4; on init the component fires `GET /api/associates` and `GET /api/admin/advance-loans`):
```ts
it('fillsPreviousDuesWhenAssociatePicked', () => {
  const c = fixture.componentInstance;
  c.pickAssociate('VP00001 — Asha');
  httpMock.expectOne(r => r.url === '/api/admin/advance-loans/dues' && r.params.get('associateId') === 'a1')
    .flush({ associateId: 'a1', outstanding: 700 });
  expect(c.previousDues).toBe(700);
  expect(c.form.value.associateId).toBe('a1');
});

it('clearsAssociateWhenTextMatchesNobody', () => {
  const c = fixture.componentInstance;
  c.pickAssociate('nobody');
  expect(c.form.value.associateId).toBe('');
  expect(c.previousDues).toBe(0);
});

it('doesNotPostWithoutAssociate', () => {
  fixture.componentInstance.save();
  httpMock.expectNone({ method: 'POST', url: '/api/admin/advance-loans' });
});

it('postsLoanThenReloads', () => { /* patch valid form, save, expect POST body.amount 500 and bankName null, flush, expect list reload */ });

it('repayPostsToLoanEndpointAndClosesModal', () => {
  const c = fixture.componentInstance;
  c.openRepay(loanRow);
  c.repayForm.patchValue({ paymentDate: '2026-10-05', amount: 100, payMode: 'UPI' });
  c.saveRepay();
  httpMock.expectOne({ method: 'POST', url: '/api/admin/advance-loans/l1/repayments' }).flush({ receiptNo: 'RCP-000001' });
  httpMock.expectOne(r => r.url === '/api/admin/advance-loans').flush([loanRow]);
  expect(c.repayOpen).toBeFalse();
});

it('showsServerErrorWhenRepaymentTooLarge', () => { /* 409 {error:'Repayment exceeds remaining balance of 50'} -> c.repayError contains 'exceeds' and modal stays open */ });

it('hidesRepayActionWhenFullyRepaid', () => { /* row with outstanding 0 -> no .invoice-loans__repay button */ });
```
Define `loanRow = { id: 'l1', associateId: 'a1', associateUserId: 'VP00001', associateName: 'Asha', loanDate: '2026-10-01', amount: 500, previousDues: 0, repaid: 0, outstanding: 500, payMode: 'CASH', bankName: null, instrumentNo: null, remarks: null }` and associates fixture `[{ id: 'a1', userId: 'VP00001', name: 'Asha' }]`.

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='src/app/admin/invoice/advance-loans/**/*.spec.ts'`
Expected: FAIL (missing component).

- [ ] **Step 3: Write `AdvanceLoansComponent`**

- Associate picker: `<input list="invoice-loans-associates" formControlName="associateText" (change)="pickAssociate($any($event.target).value)">` plus `<datalist id="invoice-loans-associates">` of `userId — name` options. `pickAssociate(text)` finds the associate whose label equals `text` (trimmed); on match sets `form.associateId`, calls `service.dues(id)` and stores `previousDues`; on no match clears `associateId` and sets `previousDues = 0`. Read-only inputs show Associate Id (`userId`), Associate Name and Previous Dues.
- `form`: `associateText`, `associateId` (required), `loanDate` (required), `amount` (required, min 0.01), `payMode` (default CASH), `bankName`, `instrumentNo`, `remarks`. `save()` mirrors Task 4 (trim, blank → null, reset, `load()`; error banner `formError`).
- List: columns S No, Date, Associate Id, Associate Name, Amount, Previous Dues, Repaid, Outstanding, Mode, Bank, DD/Cheque/TXN No, Remarks, Action; the Action cell (via `actionTemplate`) renders `<button class="invoice-loans__repay brand-button brand-button--secondary">` only when `items[i].outstanding > 0`.
- Repay modal (`repayOpen`, `repayLoan`, `repayForm` with `paymentDate`, `amount` (min 0.01), `payMode`, `bankName`, `txnNo`, `repayError`): `openRepay(loan)` resets the form and shows the outstanding balance as a hint; `saveRepay()` POSTs; on success closes and calls `load()`; on error sets `repayError = err.error?.error ?? translate(...)`. Modal markup/classes follow `expense-types__modal*` with the `invoice-loans__modal*` prefix.

- [ ] **Step 4: i18n + styles**

`admin.invoiceLoans` keys: `eyebrow`, `title` ("Add / View Advance Loan"), `subtitle`, `associateId`, `associateName`, `previousDues`, `amount`, `payMode`, `bankName`, `instrumentNo` ("DD / Cheque / TXN No"), `remarks`, `addAction`, `repayAction`, `repayTitle`, `outstandingHint`, `paymentDate`, `txnNo`, `saveAction`, `cancelAction`, column labels, `emptyState`, `loadError`, `saveError`, `requiredError`, `pickAssociateError`, `payModes` (same labels as expenses). Both languages. SCSS: `.invoice-loans` + `__form`, `__field`, `__modal-overlay`, `__modal`, `__modal-fields`, `__modal-footer` (copy the `.expense-types__modal*` rules under the new prefix); add `invoice-loans` to the `@each` list in `_admin-mobile.scss` and the single-column / 44px rules for its form and modal.

- [ ] **Step 5: Run spec**

Run: `cd frontend && npx ng test --watch=false --include='src/app/admin/invoice/advance-loans/**/*.spec.ts'`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/admin/invoice/advance-loans frontend/src/assets/i18n frontend/src/styles
git commit -m "feat(invoice): advance loans screen with repayments"
```

---

### Task 6: Payment Details register and receipt

**Files:**
- Create: `frontend/src/app/admin/invoice/payment-details/payment-details.component.ts`, `.spec.ts`
- Create: `frontend/src/app/admin/invoice/payment-details/payment-receipt.component.ts`, `.spec.ts`
- Modify: `en.json`, `hi.json` (`admin.invoicePayments`, `admin.invoiceReceipt`), `_admin.scss`, `_admin-mobile.scss`

**Interfaces:**
- Consumes: `InvoiceService.repayments`, `InvoiceService.repayment`, `RepaymentRow`.
- Produces: `PaymentDetailsComponent` (selector `app-invoice-payments`, prefix `invoice-payments`) and `PaymentReceiptComponent` (selector `app-invoice-receipt`, prefix `invoice-receipt`, reads `:id` from `ActivatedRoute`). Receipt route path: `/settings/payment-details/receipt/:id`.

- [ ] **Step 1: Write the failing specs**

`payment-details.component.spec.ts`:
```ts
const row = { id: 'r1', loanId: 'l1', receiptNo: 'RCP-000001', paymentDate: '2026-10-02', associateId: 'a1', associateUserId: 'VP00001',
  associateName: 'Asha', associatePhone: '9999999999', amount: 250, payMode: 'UPI', bankName: 'HDFC', txnNo: 'T1' };

it('rendersAllColumnsIncludingPaymentTypeAndPrintLink', () => {
  const text = (fixture.nativeElement as HTMLElement).textContent!;
  ['RCP-000001', 'VP00001', 'Asha', '9999999999', 'HDFC', 'T1', 'Loan Repayment'].forEach(s => expect(text).toContain(s));
  expect((fixture.nativeElement as HTMLElement).querySelector('a.invoice-payments__print')?.getAttribute('href')).toContain('/settings/payment-details/receipt/r1');
});

it('refetchesWithSearchAndDateParams', () => {
  const c = fixture.componentInstance;
  c.filters.patchValue({ from: '2026-10-01', to: '2026-10-31', q: 'asha' });
  c.apply();
  const req = httpMock.expectOne(r => r.url === '/api/admin/loan-repayments');
  expect(req.request.params.get('q')).toBe('asha');
  expect(req.request.params.get('from')).toBe('2026-10-01');
  req.flush([]);
});

it('blocksFromAfterToClientSide', () => {
  const c = fixture.componentInstance;
  c.filters.patchValue({ from: '2026-10-31', to: '2026-10-01' });
  c.apply();
  httpMock.expectNone(r => r.url === '/api/admin/loan-repayments');
  expect(c.filterError).toBeTrue();
});
```
(TestBed also provides `provideRouter([])`; init request `GET /api/admin/loan-repayments` is flushed with `[row]`.)

`payment-receipt.component.spec.ts`: provide `ActivatedRoute` with `snapshot.paramMap.get('id') === 'r1'`; flush `GET /api/admin/loan-repayments/r1` with the row and assert text contains the receipt no, amount and associate name, and a `.invoice-receipt__print` button exists; second test flushes a 404 and asserts the `.invoice-receipt__not-found` element renders (no print button).

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npx ng test --watch=false --include='src/app/admin/invoice/payment-details/**/*.spec.ts'`
Expected: FAIL (missing components).

- [ ] **Step 3: Write `PaymentDetailsComponent`**

Filter `FormGroup` (`from`, `to`, `q`); `apply()` sets `filterError = from && to && from > to`, returns early if true, else `load()`. Table columns: S No, Payment Date, Associate Id, Associate Name, Mobile No, Payment Type (constant translated "Loan Repayment"), Receipt No, Amount, Payment Mode (translated), Bank Name, TXN No, Print. The Print cell is `<a class="invoice-payments__print brand-button brand-button--secondary" [routerLink]="['/settings/payment-details/receipt', rows[i].id]" target="_blank">` (imports `RouterLink`; opens the receipt in a new tab so the register stays put).

- [ ] **Step 4: Write `PaymentReceiptComponent`**

On init `service.repayment(id)`; on error set `notFound = true` and render `<p class="invoice-receipt__not-found">` + link back to `/settings/payment-details`. Success renders a bordered receipt card (receipt no, date, associate id/name/mobile, amount in figures, mode, bank, TXN no) and `<button class="invoice-receipt__print" (click)="print()">`, where `print()` calls `window.print()`.

- [ ] **Step 5: Print and mobile styles**

`_admin.scss`:
```scss
.invoice-receipt { max-width: 640px; margin: 0 auto; }
.invoice-receipt__card { border: 1px solid var(--border, #ddd); padding: 1.5rem; border-radius: 8px; }
@media print {
  body * { visibility: hidden; }
  .invoice-receipt__card, .invoice-receipt__card * { visibility: visible; }
  .invoice-receipt__card { position: absolute; left: 0; top: 0; width: 100%; border: none; }
}
```
Add `.invoice-payments` rules (filter bar as a wrapping flex row) to `_admin.scss`; add `invoice-payments` to the `@each` list in `_admin-mobile.scss`, filter inputs full width at ≤ 1023px, and 44px tap targets for `.invoice-payments__print` and `.invoice-receipt__print`.

i18n: `admin.invoicePayments` (`eyebrow`, `title` "Payment Details", `subtitle`, filter labels, search placeholder "Search by Associate Id, name or mobile", `apply`, `columnSNo` etc., `paymentTypeLoanRepayment`, `printAction`, `emptyState`, `loadError`, `filterError`, `payModes`) and `admin.invoiceReceipt` (`title` "Repayment Receipt", field labels, `printAction`, `notFound`, `back`). Both languages.

- [ ] **Step 6: Run specs**

Run: `cd frontend && npx ng test --watch=false --include='src/app/admin/invoice/payment-details/**/*.spec.ts'`
Expected: PASS (5 tests).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/admin/invoice/payment-details frontend/src/assets/i18n frontend/src/styles
git commit -m "feat(invoice): payment details register and printable receipt"
```

---

### Task 7: Nav category, routes, nav labels

**Files:**
- Modify: `frontend/src/app/admin-nav-categories.model.ts`, `admin-nav-categories.model.spec.ts`
- Modify: `frontend/src/app/app.routes.ts`, `app.routes.spec.ts`
- Modify: `frontend/src/assets/i18n/en.json`, `hi.json` (`nav.categories.invoice`, `settings.sections.paymentDetails|invoiceExpenses|advanceLoans`)

**Interfaces:**
- Consumes: the three components from Tasks 4–6.
- Produces: category key `invoice` (icon `receipt_long`) after `finance`; items `paymentDetails` → `/settings/payment-details`, `invoiceExpenses` → `/settings/invoice-expenses`, `advanceLoans` → `/settings/advance-loans`; receipt route `/settings/payment-details/receipt/:id`.

- [ ] **Step 1: Update the failing specs**

`admin-nav-categories.model.spec.ts`:
- In `listsTheMockupCategoriesInOrderWithTheirIcons`, insert `['invoice', 'receipt_long']` after `['finance', 'point_of_sale']`.
- In `groupsEverySettingsScreenUnderTheirCategory`, insert `['paymentDetails', 'invoiceExpenses', 'advanceLoans']` after the finance row.
- Add:
```ts
it('resolvesReceiptUrlToTheInvoiceCategory', () => {
  expect(findNavCategoryForUrl('/settings/payment-details/receipt/abc')?.key).toBe('invoice');
  expect(findNavCategoryForUrl('/settings/advance-loans')?.key).toBe('invoice');
});
```
`app.routes.spec.ts`: mirror the existing expense-types test (line ~241) for `payment-details`, `invoice-expenses`, `advance-loans` (sectionKeys `paymentDetails`, `invoiceExpenses`, `advanceLoans`) and add one for `payment-details/receipt/:id` with `data: { sectionKey: 'paymentDetails' }`.

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npx ng test --watch=false --include='src/app/admin-nav-categories.model.spec.ts' --include='src/app/app.routes.spec.ts'`
Expected: FAIL.

- [ ] **Step 3: Implement**

`admin-nav-categories.model.ts`: after the `finance` category add
```ts
  {
    key: 'invoice',
    labelKey: 'nav.categories.invoice',
    icon: 'receipt_long',
    items: [
      { key: 'paymentDetails', labelKey: 'settings.sections.paymentDetails', path: '/settings/payment-details' },
      { key: 'invoiceExpenses', labelKey: 'settings.sections.invoiceExpenses', path: '/settings/invoice-expenses' },
      { key: 'advanceLoans', labelKey: 'settings.sections.advanceLoans', path: '/settings/advance-loans' }
    ]
  },
```
Also update the header comment ("four category tabs" is already stale; just leave it).

`app.routes.ts`: after the `expense-types` child add (receipt route first so it is never shadowed):
```ts
      { path: 'payment-details/receipt/:id', loadComponent: () => import('./admin/invoice/payment-details/payment-receipt.component').then(m => m.PaymentReceiptComponent), data: { sectionKey: 'paymentDetails' } },
      { path: 'payment-details', loadComponent: () => import('./admin/invoice/payment-details/payment-details.component').then(m => m.PaymentDetailsComponent), data: { sectionKey: 'paymentDetails' } },
      { path: 'invoice-expenses', loadComponent: () => import('./admin/invoice/expenses/expenses.component').then(m => m.ExpensesComponent), data: { sectionKey: 'invoiceExpenses' } },
      { path: 'advance-loans', loadComponent: () => import('./admin/invoice/advance-loans/advance-loans.component').then(m => m.AdvanceLoansComponent), data: { sectionKey: 'advanceLoans' } },
```
i18n: `nav.categories.invoice` = "Invoice" (hi: "इनवॉइस"); `settings.sections.paymentDetails` = "Payment Details", `invoiceExpenses` = "Add / View Expense", `advanceLoans` = "Add / View Advance Loan" (Hindi equivalents in `hi.json`).

- [ ] **Step 4: Run the full frontend suite and build**

Run: `cd frontend && npx ng test --watch=false && npx ng build`
Expected: all specs PASS (including `admin-sidebar` / `app.component` specs that iterate categories; fix any that hard-code the category count by adding the Invoice entry), build succeeds with no template/i18n errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat(invoice): Invoice nav category and routes"
```

---

### Task 8: End-to-end verification

**Files:** none modified unless a defect is found.

- [ ] **Step 1: Full backend run for new classes**

Run: `cd backend && mvn -q -Dtest='Expense*Test,AdvanceLoan*Test,PlotchainApplicationTests' test`
Expected: PASS.

- [ ] **Step 2: Run the app and exercise the flow**

Use the repo's `run` skill to start DB, backend and frontend. As admin:
1. Invoice tab appears in the header; its three item pills navigate.
2. Add an expense (inactive type absent from the dropdown); it appears in the list.
3. Add a loan of 1000 for an associate; Previous Dues shows 0. Add a second loan to the same associate; Previous Dues shows 1000.
4. Repay 400 from the loan row; repay 600.01 and see the "exceeds remaining" error; repay 600 and see the Repay button disappear.
5. Payment Details lists the two repayments; search by associate id and mobile; Print opens the receipt in a new tab; browser print preview shows only the receipt card.
6. Open `/settings/payment-details/receipt/00000000-0000-0000-0000-000000000000`: not-found message.
7. Resize to 375px: forms are single column, lists scroll inside the card, buttons ≥ 44px.
8. As a non-admin associate token, `curl` each new GET path: expect 403.

- [ ] **Step 3: Record findings and commit any fixes**

Fix defects with a failing test first. Commit as `fix(invoice): ...`. Do not edit the units tracking file from implementer agents (coordinator's job).
