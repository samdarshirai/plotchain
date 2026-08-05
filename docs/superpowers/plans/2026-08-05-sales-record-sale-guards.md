# Sales — Record-Sale Guards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the `sales` package (schema, entity, service, controller) and make `POST /api/admin/sales` reject an unknown `plotId`, an unavailable `Plot`, or an unknown `associateId` with the correct HTTP status and zero side effects, with the endpoint restricted to ADMIN only.

**Architecture:** New `com.plotchain.sales` package mirroring the existing `com.plotchain.projects`/`com.plotchain.cycle` package shape: entity + enum + bare repository + service + controller + package-scoped `@RestControllerAdvice`. `SaleService.recordSale(...)` runs the three guards from the source spec's "Record a sale" flow steps 1–3 (plot lookup, plot-availability check, associate lookup) and then hits a placeholder — no `Sale`/`LedgerEntry` row is created and `Plot.status` is never mutated in this unit. One new migration (`V16__sale.sql`) creates the `sale` table and adds `ledger_entry.source_ref`, both required by the Data model section of the source spec, in the same file. One new `SecurityConfig` matcher makes `POST /api/admin/sales` `hasAuthority("ADMIN")` (strict, not the admin-family `hasAnyAuthority(...)` blanket rule), following the exact pattern already established for `POST /api/admin/cycles/{id}/close`.

**Tech Stack:** Java 17+, Spring Boot 3.3.4, Spring Data JPA, Spring Security, Flyway, JUnit 5 + Mockito (`MockitoExtension`) for service tests, `@SpringBootTest` + `MockMvc` + real JWT for controller/security tests, AssertJ, H2 (`MODE=PostgreSQL`) in the `test` profile.

## Global Constraints

- Source spec: `docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md`. This plan implements exactly unit 2 of `docs/superpowers/plans/2026-08-03-sales-units.md` — the reject-with-no-side-effects paths for `POST /api/admin/sales`, nothing from unit 3 (happy path) onward.
- Reuse existing types, do not redefine: `com.plotchain.projects.Plot`, `PlotStatus`, `PlotRepository`, `PlotNotFoundException`; `com.plotchain.associate.AssociateRepository`, `AssociateNotFoundException`. Both `*NotFoundException` types already have working `@RestControllerAdvice` handlers elsewhere (`ProjectsExceptionHandler` for `PlotNotFoundException`, `DashboardExceptionHandler` for `AssociateNotFoundException`) — since Spring registers every `@RestControllerAdvice` bean application-wide regardless of package, do **not** add a second `@ExceptionHandler` for either type in the new `sales` package; that would create a redundant, order-dependent second mapping for the same exception. The new `SalesExceptionHandler` handles only `PlotNotAvailableException` (new in this unit).
- `SaleService`'s constructor takes only `PlotRepository` and `AssociateRepository` — do **not** wire in `CycleService` yet. This unit's guards run before the cycle lookup in the full flow (source spec flow step 5, which is unit 3's job); adding an unused `CycleService` dependency now would be dead weight.
- The migration must be a single new file, `V16__sale.sql` (latest existing is `V15__associate_status.sql`), containing both the `sale` table and `ALTER TABLE ledger_entry ADD COLUMN source_ref UUID NULL;` — per the source spec's Data model section, which states both belong in the same migration.
- `SecurityConfig`'s new matcher for `POST /api/admin/sales` uses `hasAuthority("ADMIN")` (strict), not `hasAnyAuthority("ADMIN","SUPER_ADMIN","FINANCE","KYC_REVIEWER","SUPPORT")` — per Decision 8 and the Testing section of the source spec ("record/void/register are ADMIN-only"). It must be declared **before** the blanket `POST /api/**` rule (first-match-wins), immediately after the existing `POST /api/admin/cycles/*/close` matcher.
- Only the `POST /api/admin/sales` matcher is added in this unit. The void endpoint (`POST /api/admin/sales/*/void`, unit 4) and the list endpoint (`GET /api/admin/sales`, unit 6) don't exist in code yet — their matchers are deferred to those units rather than added speculatively against routes that would 404 regardless of the authorization rule.
- `SaleService.recordSale(...)` ends with a placeholder after all three guards pass, matching the established convention in `CycleService.close()` (see its "Placeholder: unit 4 replaces this line" comment) — unit 3 inserts the real Plot→SOLD / Sale-creation / Direct-Income logic there, sequentially, without changing this method's signature. Do not implement that logic here.
- `SaleRepository` is stood up as a bare `JpaRepository<Sale, UUID>` with no custom query methods (none are needed until unit 3 needs `.save(Sale)`) — do not add a `SaleRepositoryTest`; there is nothing custom to verify yet, matching how plain repositories without custom queries elsewhere in this codebase have no dedicated repository test.
- No `Clock` abstraction — this unit doesn't touch dates/times at all (no `recordedAt` gets set; the placeholder never constructs a `Sale`).

---

## File Structure

- **Create:** `backend/src/main/resources/db/migration/V16__sale.sql` — `sale` table (per Data model) + `ledger_entry.source_ref` column.
- **Create:** `backend/src/main/java/com/plotchain/sales/Sale.java` — JPA entity for the `sale` table (unused by any logic in this unit, but required for the migration/entity mapping to be validated by `ddl-auto: validate` and for unit 3 to build on).
- **Create:** `backend/src/main/java/com/plotchain/sales/SaleStatus.java` — `RECORDED`, `VOIDED`.
- **Create:** `backend/src/main/java/com/plotchain/sales/SaleRepository.java` — bare `JpaRepository<Sale, UUID>`.
- **Create:** `backend/src/main/java/com/plotchain/sales/PlotNotAvailableException.java` — new exception, 409.
- **Create:** `backend/src/main/java/com/plotchain/sales/CreateSaleRequest.java` — request record.
- **Create:** `backend/src/main/java/com/plotchain/sales/SaleResponse.java` — response record.
- **Create:** `backend/src/main/java/com/plotchain/sales/SaleService.java` — `recordSale(CreateSaleRequest)` with the three guards.
- **Create:** `backend/src/main/java/com/plotchain/sales/SaleController.java` — `POST /api/admin/sales`.
- **Create:** `backend/src/main/java/com/plotchain/sales/SalesExceptionHandler.java` — maps `PlotNotAvailableException` → 409.
- **Modify:** `backend/src/main/java/com/plotchain/auth/SecurityConfig.java` — add the ADMIN-only matcher.
- **Create:** `backend/src/test/java/com/plotchain/sales/SaleServiceTest.java`
- **Create:** `backend/src/test/java/com/plotchain/sales/SaleControllerTest.java`
- **Modify:** `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java` — add the ADMIN-only reachability test.

---

## Task 1: Database migration + Sale domain scaffolding

**Files:**
- Create: `backend/src/main/resources/db/migration/V16__sale.sql`
- Create: `backend/src/main/java/com/plotchain/sales/Sale.java`
- Create: `backend/src/main/java/com/plotchain/sales/SaleStatus.java`
- Create: `backend/src/main/java/com/plotchain/sales/SaleRepository.java`
- Create: `backend/src/main/java/com/plotchain/sales/PlotNotAvailableException.java`
- Create: `backend/src/main/java/com/plotchain/sales/CreateSaleRequest.java`
- Create: `backend/src/main/java/com/plotchain/sales/SaleResponse.java`

**Interfaces:**
- Consumes: nothing from earlier tasks (this is the first task).
- Produces: `Sale` entity (getters/setters: `getId/setId`, `getPlotId/setPlotId`, `getAssociateId/setAssociateId`, `getBuyerName/setBuyerName`, `getBuyerPhone/setBuyerPhone`, `getBuyerEmail/setBuyerEmail`, `getAmount/setAmount`, `getCycleId/setCycleId`, `getLegCredited/setLegCredited`, `getStatus/setStatus`, `getVoidReason/setVoidReason`, `getRecordedAt/setRecordedAt`); `SaleStatus` enum (`RECORDED`, `VOIDED`); `SaleRepository extends JpaRepository<Sale, UUID>`; `PlotNotAvailableException(UUID plotId)`; `CreateSaleRequest(UUID plotId, UUID associateId, String buyerName, String buyerPhone, String buyerEmail)`; `SaleResponse(UUID id, UUID plotId, UUID associateId, String buyerName, String buyerPhone, String buyerEmail, BigDecimal amount, UUID cycleId, String legCredited, String status, String voidReason, Instant recordedAt)`. Task 2 consumes `PlotNotAvailableException` and `CreateSaleRequest`; Task 3 consumes `SaleResponse`, `CreateSaleRequest`, and `PlotNotAvailableException`.

- [ ] **Step 1: Write the migration**

Create `backend/src/main/resources/db/migration/V16__sale.sql`:

```sql
CREATE TABLE sale (
    id UUID PRIMARY KEY,
    plot_id UUID NOT NULL REFERENCES plot(id),
    associate_id UUID NOT NULL REFERENCES associate(id),
    buyer_name VARCHAR(200) NOT NULL,
    buyer_phone VARCHAR(20) NOT NULL,
    buyer_email VARCHAR(255),
    amount NUMERIC(14,2) NOT NULL,
    cycle_id UUID NOT NULL REFERENCES cycle(id),
    leg_credited VARCHAR(1) NOT NULL CHECK (leg_credited IN ('L','R')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('RECORDED','VOIDED')),
    void_reason VARCHAR(500),
    recorded_at TIMESTAMP NOT NULL
);
CREATE INDEX idx_sale_associate_id ON sale(associate_id);

-- Nullable: every non-DIRECT income type that will eventually populate this column
-- (matching, sponsor, royalty, reward -- all from the still-unbuilt compensation engine)
-- doesn't exist yet. Only DIRECT ledger entries (Sales unit 3) set it, to the originating
-- sale.id.
ALTER TABLE ledger_entry ADD COLUMN source_ref UUID NULL;
```

- [ ] **Step 2: Write the `Sale` entity**

Create `backend/src/main/java/com/plotchain/sales/Sale.java`:

```java
package com.plotchain.sales;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "sale")
public class Sale {
    @Id
    private UUID id;
    @Column(name = "plot_id", nullable = false)
    private UUID plotId;
    @Column(name = "associate_id", nullable = false)
    private UUID associateId;
    @Column(name = "buyer_name", nullable = false)
    private String buyerName;
    @Column(name = "buyer_phone", nullable = false)
    private String buyerPhone;
    @Column(name = "buyer_email")
    private String buyerEmail;
    @Column(nullable = false)
    private BigDecimal amount;
    @Column(name = "cycle_id", nullable = false)
    private UUID cycleId;
    @Column(name = "leg_credited", nullable = false)
    private String legCredited;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private SaleStatus status;
    @Column(name = "void_reason")
    private String voidReason;
    @Column(name = "recorded_at", nullable = false)
    private Instant recordedAt;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getPlotId() { return plotId; }
    public void setPlotId(UUID plotId) { this.plotId = plotId; }
    public UUID getAssociateId() { return associateId; }
    public void setAssociateId(UUID associateId) { this.associateId = associateId; }
    public String getBuyerName() { return buyerName; }
    public void setBuyerName(String buyerName) { this.buyerName = buyerName; }
    public String getBuyerPhone() { return buyerPhone; }
    public void setBuyerPhone(String buyerPhone) { this.buyerPhone = buyerPhone; }
    public String getBuyerEmail() { return buyerEmail; }
    public void setBuyerEmail(String buyerEmail) { this.buyerEmail = buyerEmail; }
    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }
    public UUID getCycleId() { return cycleId; }
    public void setCycleId(UUID cycleId) { this.cycleId = cycleId; }
    public String getLegCredited() { return legCredited; }
    public void setLegCredited(String legCredited) { this.legCredited = legCredited; }
    public SaleStatus getStatus() { return status; }
    public void setStatus(SaleStatus status) { this.status = status; }
    public String getVoidReason() { return voidReason; }
    public void setVoidReason(String voidReason) { this.voidReason = voidReason; }
    public Instant getRecordedAt() { return recordedAt; }
    public void setRecordedAt(Instant recordedAt) { this.recordedAt = recordedAt; }
}
```

- [ ] **Step 3: Write `SaleStatus`, `SaleRepository`, `PlotNotAvailableException`**

Create `backend/src/main/java/com/plotchain/sales/SaleStatus.java`:

```java
package com.plotchain.sales;

public enum SaleStatus { RECORDED, VOIDED }
```

Create `backend/src/main/java/com/plotchain/sales/SaleRepository.java`:

```java
package com.plotchain.sales;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

// Bare marker interface for this unit -- no custom queries yet. Sales unit 3 (record happy
// path) is the first caller that needs SaleRepository.save(Sale); units 6/7 (admin register,
// associate own-view) will add the filtered/paginated finder methods they need at that point.
public interface SaleRepository extends JpaRepository<Sale, UUID> {
}
```

Create `backend/src/main/java/com/plotchain/sales/PlotNotAvailableException.java`:

```java
package com.plotchain.sales;

import java.util.UUID;

public class PlotNotAvailableException extends RuntimeException {
    public PlotNotAvailableException(UUID plotId) {
        super("Plot is not available for sale: " + plotId);
    }
}
```

- [ ] **Step 4: Write `CreateSaleRequest` and `SaleResponse`**

Create `backend/src/main/java/com/plotchain/sales/CreateSaleRequest.java`:

```java
package com.plotchain.sales;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

// amount is deliberately absent: per the source spec's Decision 1, Sale.amount is always a
// server-computed snapshot of Plot.price at record time, never a client-supplied value.
public record CreateSaleRequest(
    @NotNull UUID plotId,
    @NotNull UUID associateId,
    @NotBlank String buyerName,
    @NotBlank String buyerPhone,
    String buyerEmail
) {}
```

Create `backend/src/main/java/com/plotchain/sales/SaleResponse.java`:

```java
package com.plotchain.sales;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record SaleResponse(
    UUID id,
    UUID plotId,
    UUID associateId,
    String buyerName,
    String buyerPhone,
    String buyerEmail,
    BigDecimal amount,
    UUID cycleId,
    String legCredited,
    String status,
    String voidReason,
    Instant recordedAt
) {}
```

- [ ] **Step 5: Compile and run the full test suite**

Run: `cd /Users/ronalisenapati/Ronali/plotchain/backend && mvn -q compile`
Expected: BUILD SUCCESS (no test changes yet, this only proves the new files compile).

Run: `cd /Users/ronalisenapati/Ronali/plotchain/backend && mvn -q test`
Expected: BUILD SUCCESS. This is the real verification for this task: every existing `@SpringBootTest` (e.g. `CycleControllerTest`, `SecurityConfigTest`) loads the full Spring context, which runs Flyway against the H2 test database and then validates the JPA entity mappings against the resulting schema (`ddl-auto: validate`). If `V16__sale.sql` and `Sale.java` disagree on a column name or type, this step fails here, before any Sale-specific test exists.

- [ ] **Step 6: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/main/resources/db/migration/V16__sale.sql \
  backend/src/main/java/com/plotchain/sales/Sale.java \
  backend/src/main/java/com/plotchain/sales/SaleStatus.java \
  backend/src/main/java/com/plotchain/sales/SaleRepository.java \
  backend/src/main/java/com/plotchain/sales/PlotNotAvailableException.java \
  backend/src/main/java/com/plotchain/sales/CreateSaleRequest.java \
  backend/src/main/java/com/plotchain/sales/SaleResponse.java
git commit -m "feat(sales): add sale table migration and Sale domain scaffolding"
```

---

## Task 2: `SaleService.recordSale(...)` guards

**Files:**
- Create: `backend/src/main/java/com/plotchain/sales/SaleService.java`
- Test: `backend/src/test/java/com/plotchain/sales/SaleServiceTest.java`

**Interfaces:**
- Consumes: `PlotRepository.findById(UUID)` → `Optional<Plot>` (inherited from `JpaRepository`); `Plot.getStatus()` → `PlotStatus`; `PlotNotFoundException(UUID)` (existing); `AssociateRepository.findById(UUID)` → `Optional<Associate>` (inherited); `AssociateNotFoundException(UUID)` (existing); `PlotNotAvailableException(UUID)` (Task 1); `CreateSaleRequest` record (Task 1).
- Produces: `public SaleService(PlotRepository plotRepository, AssociateRepository associateRepository)`; `public SaleResponse recordSale(CreateSaleRequest request)` — throws `PlotNotFoundException`, `PlotNotAvailableException`, or `AssociateNotFoundException` when a guard fails; throws `UnsupportedOperationException` if all three guards pass (placeholder for unit 3). Task 3 consumes this exact constructor and method signature.

- [ ] **Step 1: Write the failing tests**

Create `backend/src/test/java/com/plotchain/sales/SaleServiceTest.java`:

```java
package com.plotchain.sales;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.projects.Plot;
import com.plotchain.projects.PlotNotFoundException;
import com.plotchain.projects.PlotRepository;
import com.plotchain.projects.PlotStatus;
import com.plotchain.projects.PlotType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SaleServiceTest {

    @Mock PlotRepository plotRepository;
    @Mock AssociateRepository associateRepository;

    SaleService saleService;

    private static final UUID PLOT_ID = UUID.randomUUID();
    private static final UUID ASSOCIATE_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        saleService = new SaleService(plotRepository, associateRepository);
    }

    private Plot plotWithStatus(PlotStatus status) {
        return new Plot(PLOT_ID, UUID.randomUUID(), "A-101", PlotType.NORMAL,
            new BigDecimal("1200.00"), new BigDecimal("500.00"), new BigDecimal("600000.00"), status);
    }

    private CreateSaleRequest requestFor(UUID plotId, UUID associateId) {
        return new CreateSaleRequest(plotId, associateId, "Jane Buyer", "9999999999", null);
    }

    @Test
    void recordSaleThrowsPlotNotFoundExceptionWhenThePlotDoesNotExist() {
        when(plotRepository.findById(PLOT_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> saleService.recordSale(requestFor(PLOT_ID, ASSOCIATE_ID)))
            .isInstanceOf(PlotNotFoundException.class);

        verify(plotRepository, never()).save(any());
        verify(associateRepository, never()).findById(any());
    }

    @Test
    void recordSaleThrowsPlotNotAvailableExceptionWhenThePlotIsNotAvailable() {
        when(plotRepository.findById(PLOT_ID)).thenReturn(Optional.of(plotWithStatus(PlotStatus.SOLD)));

        assertThatThrownBy(() -> saleService.recordSale(requestFor(PLOT_ID, ASSOCIATE_ID)))
            .isInstanceOf(PlotNotAvailableException.class);

        verify(plotRepository, never()).save(any());
        verify(associateRepository, never()).findById(any());
    }

    @Test
    void recordSaleThrowsAssociateNotFoundExceptionWhenTheAssociateDoesNotExist() {
        when(plotRepository.findById(PLOT_ID)).thenReturn(Optional.of(plotWithStatus(PlotStatus.AVAILABLE)));
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> saleService.recordSale(requestFor(PLOT_ID, ASSOCIATE_ID)))
            .isInstanceOf(AssociateNotFoundException.class);

        verify(plotRepository, never()).save(any());
    }

    @Test
    void recordSaleReachesThePlaceholderWhenAllGuardsPass() {
        when(plotRepository.findById(PLOT_ID)).thenReturn(Optional.of(plotWithStatus(PlotStatus.AVAILABLE)));
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(new Associate()));

        assertThatThrownBy(() -> saleService.recordSale(requestFor(PLOT_ID, ASSOCIATE_ID)))
            .isInstanceOf(UnsupportedOperationException.class);

        verify(plotRepository, never()).save(any());
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/ronalisenapati/Ronali/plotchain/backend && mvn -q -Dtest=SaleServiceTest test`
Expected: compile failure — `cannot find symbol: class SaleService` (the class doesn't exist yet).

- [ ] **Step 3: Implement `SaleService`**

Create `backend/src/main/java/com/plotchain/sales/SaleService.java`:

```java
package com.plotchain.sales;

import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.projects.Plot;
import com.plotchain.projects.PlotNotFoundException;
import com.plotchain.projects.PlotRepository;
import com.plotchain.projects.PlotStatus;
import org.springframework.stereotype.Service;

@Service
public class SaleService {

    private final PlotRepository plotRepository;
    private final AssociateRepository associateRepository;

    public SaleService(PlotRepository plotRepository, AssociateRepository associateRepository) {
        this.plotRepository = plotRepository;
        this.associateRepository = associateRepository;
    }

    // Sales unit 2 (docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md,
    // flow "Record a sale", steps 1-3): guards only. Unit 3 inserts the happy-path Plot->SOLD
    // flip, cycle lookup, Sale persistence, and Direct Income ledger entry between the
    // associate lookup below and the placeholder throw -- sequentially, without changing this
    // method's signature -- following the same convention CycleService.close() established for
    // its own unit 4 placeholder.
    public SaleResponse recordSale(CreateSaleRequest request) {
        Plot plot = plotRepository.findById(request.plotId())
            .orElseThrow(() -> new PlotNotFoundException(request.plotId()));

        if (plot.getStatus() != PlotStatus.AVAILABLE) {
            throw new PlotNotAvailableException(plot.getId());
        }

        associateRepository.findById(request.associateId())
            .orElseThrow(() -> new AssociateNotFoundException(request.associateId()));

        // Placeholder: unit 3 replaces this line with Plot->SOLD, cycle lookup, Sale creation,
        // and the Direct Income ledger entry (source spec flow steps 4-9).
        throw new UnsupportedOperationException(
            "Sale recording happy path is not yet implemented (Sales unit 3)");
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /Users/ronalisenapati/Ronali/plotchain/backend && mvn -q -Dtest=SaleServiceTest test`
Expected: all 4 tests pass.

- [ ] **Step 5: Run the full test suite**

Run: `cd /Users/ronalisenapati/Ronali/plotchain/backend && mvn -q test`
Expected: BUILD SUCCESS.

- [ ] **Step 6: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/main/java/com/plotchain/sales/SaleService.java \
  backend/src/test/java/com/plotchain/sales/SaleServiceTest.java
git commit -m "feat(sales): add SaleService.recordSale() reject-path guards"
```

---

## Task 3: `SaleController` + `SalesExceptionHandler`

**Files:**
- Create: `backend/src/main/java/com/plotchain/sales/SaleController.java`
- Create: `backend/src/main/java/com/plotchain/sales/SalesExceptionHandler.java`
- Test: `backend/src/test/java/com/plotchain/sales/SaleControllerTest.java`

**Interfaces:**
- Consumes: `SaleService.recordSale(CreateSaleRequest)` → `SaleResponse` (Task 2, `@MockBean`'d in this task's controller test); `PlotNotAvailableException` (Task 1); `com.plotchain.projects.PlotNotFoundException`, `com.plotchain.associate.AssociateNotFoundException` (existing, reused, already handled globally by `ProjectsExceptionHandler`/`DashboardExceptionHandler`).
- Produces: `POST /api/admin/sales` route, 201 on the (currently unreachable) happy path, 404/404/409 on the three guard failures. Task 4's `SecurityConfigTest` addition calls this same route.

- [ ] **Step 1: Write the failing tests**

Create `backend/src/test/java/com/plotchain/sales/SaleControllerTest.java`:

```java
package com.plotchain.sales;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.auth.JwtService;
import com.plotchain.projects.PlotNotFoundException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class SaleControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;
    @MockBean SaleService saleService;

    private static final String REQUEST_BODY = """
        {"plotId":"%s","associateId":"%s","buyerName":"Jane Buyer","buyerPhone":"9999999999","buyerEmail":null}
        """;

    private String tokenFor(AssociateRole role) {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(role);
        when(associateRepository.findById(associate.getId())).thenReturn(Optional.of(associate));
        return jwtService.generateToken(associate);
    }

    @Test
    void recordReturns404WhenThePlotDoesNotExist() throws Exception {
        UUID plotId = UUID.randomUUID();
        when(saleService.recordSale(any(CreateSaleRequest.class)))
            .thenThrow(new PlotNotFoundException(plotId));

        mockMvc.perform(post("/api/admin/sales")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(REQUEST_BODY.formatted(plotId, UUID.randomUUID())))
            .andExpect(status().isNotFound());
    }

    @Test
    void recordReturns404WhenTheAssociateDoesNotExist() throws Exception {
        UUID associateId = UUID.randomUUID();
        when(saleService.recordSale(any(CreateSaleRequest.class)))
            .thenThrow(new AssociateNotFoundException(associateId));

        mockMvc.perform(post("/api/admin/sales")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(REQUEST_BODY.formatted(UUID.randomUUID(), associateId)))
            .andExpect(status().isNotFound());
    }

    @Test
    void recordReturns409WhenThePlotIsNotAvailable() throws Exception {
        UUID plotId = UUID.randomUUID();
        when(saleService.recordSale(any(CreateSaleRequest.class)))
            .thenThrow(new PlotNotAvailableException(plotId));

        mockMvc.perform(post("/api/admin/sales")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(REQUEST_BODY.formatted(plotId, UUID.randomUUID())))
            .andExpect(status().isConflict());
    }

    @Test
    void recordIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(post("/api/admin/sales")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE))
                .contentType("application/json")
                .content(REQUEST_BODY.formatted(UUID.randomUUID(), UUID.randomUUID())))
            .andExpect(status().isForbidden());
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/ronalisenapati/Ronali/plotchain/backend && mvn -q -Dtest=SaleControllerTest test`
Expected: compile failure — `cannot find symbol: class SaleController` (route doesn't exist yet).

- [ ] **Step 3: Implement `SaleController` and `SalesExceptionHandler`**

Create `backend/src/main/java/com/plotchain/sales/SaleController.java`:

```java
package com.plotchain.sales;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/sales")
public class SaleController {

    private final SaleService saleService;

    public SaleController(SaleService saleService) {
        this.saleService = saleService;
    }

    @PostMapping
    public ResponseEntity<SaleResponse> record(@Valid @RequestBody CreateSaleRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(saleService.recordSale(request));
    }
}
```

Create `backend/src/main/java/com/plotchain/sales/SalesExceptionHandler.java`:

```java
package com.plotchain.sales;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

// PlotNotFoundException (thrown when plotId doesn't resolve) and AssociateNotFoundException
// (thrown when associateId doesn't resolve) are deliberately NOT handled here even though
// SaleService throws both -- ProjectsExceptionHandler and DashboardExceptionHandler already
// map them to 404 globally (Spring registers every @RestControllerAdvice bean application-wide,
// not scoped to the controller's own package). Adding a second @ExceptionHandler for the same
// exception type here would create a redundant, order-dependent second mapping for the same
// exception, so this class only owns the one exception type new to this unit.
@RestControllerAdvice
public class SalesExceptionHandler {

    @ExceptionHandler(PlotNotAvailableException.class)
    public ResponseEntity<Map<String, String>> handlePlotNotAvailable(PlotNotAvailableException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /Users/ronalisenapati/Ronali/plotchain/backend && mvn -q -Dtest=SaleControllerTest test`
Expected: 3 of the 4 tests pass (the three guard-status tests). `recordIsForbiddenForAnAssociateToken` still fails with an unexpected status (not yet 403) because `SecurityConfig` hasn't been updated — that's Task 4.

- [ ] **Step 5: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/main/java/com/plotchain/sales/SaleController.java \
  backend/src/main/java/com/plotchain/sales/SalesExceptionHandler.java \
  backend/src/test/java/com/plotchain/sales/SaleControllerTest.java
git commit -m "feat(sales): add POST /api/admin/sales controller and PlotNotAvailableException handler"
```

---

## Task 4: `SecurityConfig` ADMIN-only matcher

**Files:**
- Modify: `backend/src/main/java/com/plotchain/auth/SecurityConfig.java`
- Modify: `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`

**Interfaces:**
- Consumes: `CreateSaleRequest` (Task 1), the real `POST /api/admin/sales` route (Task 3), `AssociateRole` (existing).
- Produces: nothing further downstream — this is the last task in the unit.

- [ ] **Step 1: Write the failing test**

Add this test to `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`, directly below `adminCyclesCloseIsReachableOnlyForAdminAndForbiddenForEveryOtherRole` (the file already imports `AssociateRole`, `ParameterizedTest`, `EnumSource`, `ObjectMapper`, `UUID`, `status`, `post`):

```java
    // Sales unit 2: POST /api/admin/sales is ADMIN-only, the same target-role-model pattern as
    // /api/admin/cycles/*/close above (not the isAdminFamily() convention most other admin GETs
    // still use). A random, non-existent plotId reaches the real (H2, unmocked) PlotRepository
    // and 404s for the ADMIN token -- proof the request passed the security layer, not proof of
    // any particular business outcome, same "assert not 403" reasoning as
    // passwordChangeIsReachableByAnAssociateToken above. Every other role, including the
    // soon-to-be-deleted admin-family sub-roles, is blocked at the filter layer before the
    // controller ever runs.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminSalesRecordIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        String body = new ObjectMapper().writeValueAsString(
            new com.plotchain.sales.CreateSaleRequest(UUID.randomUUID(), UUID.randomUUID(), "Jane Buyer", "9999999999", null));

        mockMvc.perform(post("/api/admin/sales")
                .header("Authorization", "Bearer " + tokenFor(role))
                .contentType("application/json")
                .content(body))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 404 : 403));
    }
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/ronalisenapati/Ronali/plotchain/backend && mvn -q -Dtest=SecurityConfigTest#adminSalesRecordIsReachableOnlyForAdminAndForbiddenForEveryOtherRole test`
Expected: FAIL for non-ADMIN roles (currently 403 is not yet returned — the blanket admin-family `POST /api/**` rule grants access to `SUPER_ADMIN`/`FINANCE`/`KYC_REVIEWER`/`SUPPORT` too, so they get 404 instead of the expected 403).

- [ ] **Step 3: Add the matcher**

Edit `backend/src/main/java/com/plotchain/auth/SecurityConfig.java`. Insert the new matcher immediately after the existing `POST /api/admin/cycles/*/close` matcher (lines 80–81) and before the blanket `POST /api/**` rule (line 82):

```java
                .requestMatchers(HttpMethod.POST, "/api/admin/cycles/*/close")
                    .hasAuthority("ADMIN")
                // Record a sale: ADMIN-only, per Sales unit 2
                // (docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md,
                // Decision 8 and the Testing section: "record/void/register are ADMIN-only"),
                // same target-role-model reasoning as the cycle close matcher directly above.
                // Declared here, before the blanket POST rule, for the same first-match-wins
                // reason documented on that matcher -- a narrower POST rule declared after the
                // blanket rule below would never be reached. Only POST /api/admin/sales is
                // added here: this unit's own scope is guards only (unknown/unavailable plot or
                // associate rejected before any row is written); the void (unit 4 of the Sales
                // unit queue) and list (unit 6) endpoints don't exist in code yet, so their
                // matchers are deferred to those units rather than added speculatively against
                // routes that would 404 today regardless of the authorization rule.
                .requestMatchers(HttpMethod.POST, "/api/admin/sales")
                    .hasAuthority("ADMIN")
                .requestMatchers(HttpMethod.POST, "/api/**")
                    .hasAnyAuthority("ADMIN", "SUPER_ADMIN", "FINANCE", "KYC_REVIEWER", "SUPPORT")
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /Users/ronalisenapati/Ronali/plotchain/backend && mvn -q -Dtest=SecurityConfigTest test`
Expected: all `SecurityConfigTest` tests pass, including the new one.

- [ ] **Step 5: Run the full backend test suite**

Run: `cd /Users/ronalisenapati/Ronali/plotchain/backend && mvn -q test`
Expected: BUILD SUCCESS. This confirms `recordIsForbiddenForAnAssociateToken` in `SaleControllerTest` (Task 3, previously failing) now passes too, and nothing else regressed.

- [ ] **Step 6: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/main/java/com/plotchain/auth/SecurityConfig.java \
  backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java
git commit -m "feat(sales): restrict POST /api/admin/sales to ADMIN role only"
```

---

## Self-Review Notes

- **Spec coverage:** All four acceptance criteria from the task are covered — unknown `plotId` → `PlotNotFoundException` → 404 (Task 2 guard 1 / Task 3 test 1); unknown `associateId` → `AssociateNotFoundException` → 404 (Task 2 guard 3 / Task 3 test 2); `Plot.status != AVAILABLE` → new `PlotNotAvailableException` → 409, `Plot.status` unchanged (Task 2 guard 2, asserted via `verify(plotRepository, never()).save(any())` in every guard test / Task 3 test 3); ADMIN-only, associate token → 403 (Task 3 test 4 + Task 4's `SecurityConfigTest` parameterized test covering all six roles). The migration (Task 1) covers the full `sale` table from the Data model section plus `ledger_entry.source_ref`, in one file. All eight new types listed in the acceptance criteria (`Sale`, `SaleStatus`, `SaleRepository`, `SaleService`, `SaleController`, `CreateSaleRequest`, `SaleResponse`, `PlotNotAvailableException`) are created. "No `Sale`/`Plot`/`LedgerEntry` row written" on every guard path holds by construction: `SaleRepository`/`LedgerEntryRepository` are never injected into `SaleService` in this unit, so no code path can write either row, and `PlotRepository.save(...)` is explicitly asserted never-called in every guard test.
- **Placeholder scan:** No TBD/TODO markers. The one intentional placeholder (`SaleService.recordSale`'s final `throw new UnsupportedOperationException(...)`) is explicit, documented, unreachable by any test in this unit, and matches the task's explicit instruction to mirror `CycleService.close()`'s placeholder convention.
- **Type consistency:** `SaleService(PlotRepository, AssociateRepository)` and `recordSale(CreateSaleRequest) -> SaleResponse` are used identically across Task 2 (definition + test) and Task 3 (controller + `@MockBean` in its test). `CreateSaleRequest`'s five fields (`plotId`, `associateId`, `buyerName`, `buyerPhone`, `buyerEmail`) match the JSON shape used in both `SaleControllerTest` and `SecurityConfigTest`'s new test. `PlotNotAvailableException(UUID)` matches its one call site in `SaleService` and its one throw site in both controller tests.
