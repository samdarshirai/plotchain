# Plot Booking Unit 10 — Plot Grid Read Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `GET /api/projects/{id}/plots/grid` returns a project's plots as a bare JSON array of `PlotGridResponse(plotId, plotNo, type, area, price, status)` to any authenticated user, and nothing else.

**Architecture:** One new read-only controller + service in `com.plotchain.projects` (`PlotGridController`, `PlotGridService`) and one record (`PlotGridResponse`). The service does one existence check plus one `SELECT ... WHERE project_id = ?`, then sorts in Java with a natural comparator (plot numbers are strings). No `SecurityConfig` edit (verified below); security is pinned by new `SecurityConfigTest` rows only.

**Tech Stack:** Spring Boot 3.3.4, Spring Data JPA, JUnit 5 + AssertJ + Mockito, MockMvc, H2 (PostgreSQL mode) via Flyway for real-DB tests.

**Spec:** `docs/superpowers/specs/role-capability/2026-10-01-plot-booking-lifecycle-design.md` (Decision 10; Flows "Plot grid read"; Testing; Resolved decisions). Unit row: `docs/superpowers/plans/2026-10-01-plot-booking-units.md` unit 10.

## Global Constraints

- Spec line 73: "Any authenticated user; `PlotGridResponse` (plotId, plotNo, type, area, price, status). Unknown project 404." Unit 10 AC: "and nothing else — no buyer/booking data".
- Path is exactly `/api/projects/{id}/plots/grid` (the spec/units path; units 11 and 13 code against it). Do NOT put it under `/api/company/...`.
- Unauthenticated 401, associate 200, admin 200, unknown project 404 (`ProjectNotFoundException`, mapped by the existing `ProjectsExceptionHandler`).
- Unit 10 AC: "Any `SecurityConfig` edit is limited to what this needs (ideally none)". This plan needs none (see Decisions).
- Tests: run from the WORKTREE's `backend/` dir (not the main checkout). Multiple classes: COMMA-separated `-Dtest=A,B` (`+` matches nothing).
- Commits end with these two trailer lines:
  `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_015zhXZ3UAhJC2WgeQduJkUG`
- Implementer must NOT edit `docs/superpowers/plans/2026-10-01-plot-booking-units.md` (coordinator marks it merged) and must not touch `docs/design/`.
- Env noise: a full `mvn test` shows ~55 spurious Mockito errors (JDK21/25 mismatch) plus 4 pre-existing `JwtServiceTest`/`SecretsEncryptionServiceTest` failures. Judge by the targeted lists below, not a full run.
- Targeted baseline (497 green on master): `Booking*,Sale*,AssociateSaleControllerTest,AssociateBookingControllerTest,AdminBookingRegisterControllerTest,PlotBookingRegisterRepositoryTest,OverdueReport*,AdminEmiReportControllerTest,SecurityConfigTest,PlotBookingSchemaTest,V41MigrationTest,EPinServiceTest,AdminStatsServiceTest`. For this unit add `Plot*,Project*` to that list (record the new green count in your handback).

## Findings that shape the plan (verified against HEAD 8a527f2)

1. **Existing project/plot routes live under `/api/company/projects/{projectId}/plots`** (`PlotController`, `ProjectController` `@RequestMapping("/api/company/projects")`). The spec's `/api/projects/...` is a different prefix, so there is no mapping clash with `PlotController` (`/{plotId}` is a UUID path variable; `/api/projects/...` is a separate tree). Nothing else in `src/main` or the frontend uses `/api/projects`.
2. **`SecurityConfig` (`backend/src/main/java/com/plotchain/auth/SecurityConfig.java`):** there is no blanket `GET /api/admin/**` or `GET /api/**` rule. Blanket ADMIN rules exist only for POST/PUT/PATCH/DELETE `/api/**` (lines ~286-293). The brief's premise that plot GETs are admin-only is out of date: role-capability unit 6 already made `GET /api/company/projects`, `/*`, `/*/plots`, `/*/plots/*` `.authenticated()` (line ~322). Still admin-only: `GET /api/company/projects/*/thumbnail` and `/api/company/projects/plots/csv-template`.
3. **No existing matcher shadows `GET /api/projects/{id}/plots/grid`.** It matches none of the explicit GET matchers, so it falls to `anyRequest().authenticated()` (line ~435): associate 200, admin 200, anonymous 401. Therefore **no SecurityConfig edit and no SecurityConfig commit**; Task 4 is a test-only commit that pins the behaviour so a future `GET /api/projects/**` ADMIN matcher fails the build.
4. `plot.plot_no` is `VARCHAR(32) NOT NULL`, `UNIQUE (project_id, plot_no)` (V10). It is a string, so SQL `ORDER BY plot_no` gives `"10" < "2"`; natural order must be done in Java.
5. `PlotResponse` (existing CRUD DTO) also exposes `rate` and uses `id`/`plotType`/`areaSqft`; the grid DTO must be a separate record with the spec's field names. `rate` and the project thumbnail must never appear.

## Decisions (spec did not fully settle these — flagged)

- **Response shape: bare list.** The spec names `PlotGridResponse` with exactly the six row fields, so `PlotGridResponse` IS the row and the endpoint returns `List<PlotGridResponse>` (JSON array). Not a `{projectId, projectName, plots}` wrapper: the project name is already available from the existing project endpoints, counts are derivable client-side from `status`, and the spec's wording is explicit. Revisit only if unit 11/13 design needs counts server-side (additive change then would require a new shape, so units 11/13 should code to the array).
- **Field types:** `type` = `PlotType` enum serialised as `"NORMAL"|"CORNER"`; `area` = `BigDecimal` square feet (from `area_sqft`); `price` = `BigDecimal`; `status` = `PlotStatus` enum `"AVAILABLE"|"BOOKED"|"SOLD"`; `plotId` = UUID string.
- **Ordering:** natural order on `plotNo` (digit runs compared numerically, text runs case-insensitively, digits before text, final tiebreak plain `String.compareTo`) so `"2" < "10"` and `"A-2" < "A-10"`. Done in Java after the single query (bounded set).
- **Unpaginated, no code cap.** A project's plots are bounded (hundreds, low thousands). Ceiling note lives in a `// ponytail:` comment on the service method: past ~5,000 plots per project, add paging or a DB-side sort. Unit 11/13 UIs should not assume pagination.
- **Placement:** new `PlotGridController` + `PlotGridService` rather than extending `PlotController`/`PlotService`. `PlotController` is `@RequestMapping("/api/company/projects/{projectId}/plots")` and `PlotService` depends on `SettingsAuditService` (admin write audit); mixing a different URL prefix and a read-only DTO into them would force a second mapping root or constructor deps the grid does not need. Small focused files; zero collision with the CRUD classes.
- **Unknown project:** explicit `projectRepository.existsById` check (two queries total: exists + list; no N+1) because an unknown project would otherwise be an empty 200.
- **Frontend:** backend-only unit.

## Review Focus

- A project with zero plots: 200 with `[]` (not 404). Pinned in Task 3 controller test.
- Plot numbers like `"2"` vs `"10"`, `"A-2"` vs `"A-10"`, mixed digits-first: natural order, deterministic. Pinned in Task 2.
- A field added to the DTO later (e.g. `rate`, `buyerName`) silently leaking: exact-key-set assertion. Pinned in Task 3.
- Plot status changing via booking create / cancel / confirm elsewhere must show live (no caching). Pinned in Task 5.
- A future broader `GET /api/projects/**` ADMIN matcher locking associates out. Pinned in Task 4.

---

## File Structure

- Create: `backend/src/main/java/com/plotchain/projects/PlotGridResponse.java` — row record.
- Create: `backend/src/main/java/com/plotchain/projects/PlotGridService.java` — existence check, query, natural sort, mapping.
- Create: `backend/src/main/java/com/plotchain/projects/PlotGridController.java` — the one GET route.
- Modify: `backend/src/main/java/com/plotchain/projects/PlotRepository.java` — add `List<Plot> findByProjectId(UUID projectId)`.
- Test (create): `backend/src/test/java/com/plotchain/projects/PlotGridServiceTest.java`, `PlotGridControllerTest.java`, `PlotGridLiveStatusIntegrationTest.java`.
- Test (modify): `backend/src/test/java/com/plotchain/projects/PlotRepositoryTest.java`, `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`.
- NOT modified: `SecurityConfig.java`, `PlotController.java`, `PlotService.java`, units file.

---

### Task 1: Repository method returning all plots of a project

**Files:**
- Modify: `backend/src/main/java/com/plotchain/projects/PlotRepository.java`
- Test: `backend/src/test/java/com/plotchain/projects/PlotRepositoryTest.java`

**Interfaces:**
- Consumes: existing `Plot`, `PlotRepository`.
- Produces: `List<Plot> PlotRepository.findByProjectId(UUID projectId)` (unsorted, unpaged; named distinctly from the existing `Page<Plot> findAllByProjectId(UUID, Pageable)` so `any()` stubs in `PlotControllerTest` stay unambiguous).

- [ ] **Step 1: Write the failing test.** Append inside `PlotRepositoryTest`:

```java
    @Test
    void findByProjectIdReturnsOnlyThatProjectsPlots() {
        Project mine = persistProject();
        Project other = persistProject();
        plotRepository.save(newPlot(mine.getId(), "A-101", PlotStatus.AVAILABLE));
        plotRepository.save(newPlot(mine.getId(), "A-102", PlotStatus.SOLD));
        plotRepository.save(newPlot(other.getId(), "B-1", PlotStatus.AVAILABLE));
        entityManager.flush();

        List<Plot> result = plotRepository.findByProjectId(mine.getId());

        assertThat(result).extracting(Plot::getPlotNo).containsExactlyInAnyOrder("A-101", "A-102");
    }
```

- [ ] **Step 2: Run, expect FAIL (compile error: method not defined).**
Run (in worktree `backend/`): `mvn -q -Dtest=PlotRepositoryTest test`

- [ ] **Step 3: Implement.** In `PlotRepository` add under `findAllByProjectId`:

```java
    // Unit 10 plot grid: one unpaged read of a project's plots (bounded set); the caller sorts.
    List<Plot> findByProjectId(UUID projectId);
```

- [ ] **Step 4: Run, expect PASS.** `mvn -q -Dtest=PlotRepositoryTest test`

- [ ] **Step 5: Commit.**

```bash
git add backend/src/main/java/com/plotchain/projects/PlotRepository.java backend/src/test/java/com/plotchain/projects/PlotRepositoryTest.java
git commit -m "feat(projects): PlotRepository.findByProjectId for the plot grid (unit 10)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015zhXZ3UAhJC2WgeQduJkUG"
```

---

### Task 2: `PlotGridResponse` + `PlotGridService` (404, natural order, field mapping)

**Files:**
- Create: `backend/src/main/java/com/plotchain/projects/PlotGridResponse.java`
- Create: `backend/src/main/java/com/plotchain/projects/PlotGridService.java`
- Test: `backend/src/test/java/com/plotchain/projects/PlotGridServiceTest.java`

**Interfaces:**
- Consumes: `PlotRepository.findByProjectId(UUID)` (Task 1), `ProjectRepository.existsById(UUID)`, `ProjectNotFoundException(UUID)`.
- Produces: `record PlotGridResponse(UUID plotId, String plotNo, PlotType type, BigDecimal area, BigDecimal price, PlotStatus status)`; `List<PlotGridResponse> PlotGridService.grid(UUID projectId)`; package-private `static int PlotGridService.compareNatural(String a, String b)`.

- [ ] **Step 1: Write the failing tests** (`PlotGridServiceTest`, Mockito like `PlotServiceTest`):

```java
package com.plotchain.projects;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PlotGridServiceTest {

    @Mock PlotRepository plotRepository;
    @Mock ProjectRepository projectRepository;

    PlotGridService service;

    private static final UUID PROJECT_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        service = new PlotGridService(plotRepository, projectRepository);
    }

    private Plot plot(String plotNo, PlotStatus status) {
        return new Plot(UUID.randomUUID(), PROJECT_ID, plotNo, PlotType.CORNER,
            new BigDecimal("1200.00"), new BigDecimal("500.00"), new BigDecimal("600000.00"), status);
    }

    @Test
    void unknownProjectThrowsProjectNotFoundAndNeverReadsPlots() {
        when(projectRepository.existsById(PROJECT_ID)).thenReturn(false);

        assertThatThrownBy(() -> service.grid(PROJECT_ID)).isInstanceOf(ProjectNotFoundException.class);
        verify(plotRepository, never()).findByProjectId(PROJECT_ID);
    }

    @Test
    void mapsExactlyTheSixGridFields() {
        Plot p = plot("A-1", PlotStatus.BOOKED);
        when(projectRepository.existsById(PROJECT_ID)).thenReturn(true);
        when(plotRepository.findByProjectId(PROJECT_ID)).thenReturn(List.of(p));

        PlotGridResponse row = service.grid(PROJECT_ID).get(0);

        assertThat(row).isEqualTo(new PlotGridResponse(p.getId(), "A-1", PlotType.CORNER,
            new BigDecimal("1200.00"), new BigDecimal("600000.00"), PlotStatus.BOOKED));
    }

    @Test
    void emptyProjectReturnsAnEmptyList() {
        when(projectRepository.existsById(PROJECT_ID)).thenReturn(true);
        when(plotRepository.findByProjectId(PROJECT_ID)).thenReturn(List.of());

        assertThat(service.grid(PROJECT_ID)).isEmpty();
    }

    @Test
    void numericLookingPlotNumbersSortNumericallyNotLexically() {
        when(projectRepository.existsById(PROJECT_ID)).thenReturn(true);
        when(plotRepository.findByProjectId(PROJECT_ID)).thenReturn(List.of(
            plot("10", PlotStatus.AVAILABLE), plot("2", PlotStatus.AVAILABLE), plot("1", PlotStatus.AVAILABLE)));

        assertThat(service.grid(PROJECT_ID)).extracting(PlotGridResponse::plotNo).containsExactly("1", "2", "10");
    }

    @Test
    void prefixedPlotNumbersSortNaturallyWithDigitsBeforeTextAndCaseInsensitive() {
        when(projectRepository.existsById(PROJECT_ID)).thenReturn(true);
        when(plotRepository.findByProjectId(PROJECT_ID)).thenReturn(List.of(
            plot("B-1", PlotStatus.AVAILABLE), plot("A-10", PlotStatus.AVAILABLE), plot("A-2", PlotStatus.AVAILABLE),
            plot("a-3", PlotStatus.AVAILABLE), plot("7", PlotStatus.AVAILABLE), plot("A-02", PlotStatus.AVAILABLE)));

        assertThat(service.grid(PROJECT_ID)).extracting(PlotGridResponse::plotNo)
            .containsExactly("7", "A-02", "A-2", "a-3", "A-10", "B-1");
    }

    @Test
    void naturalComparatorIsAntisymmetricAndPrefixSortsFirst() {
        assertThat(PlotGridService.compareNatural("A-1", "A-1x")).isNegative();
        assertThat(PlotGridService.compareNatural("A-1x", "A-1")).isPositive();
        assertThat(PlotGridService.compareNatural("A-5", "A-5")).isZero();
    }
}
```

Notes for the implementer: `"A-02"` vs `"A-2"` compare equal numerically, so the final `String.compareTo` tiebreak (`'0' < '2'`) puts `"A-02"` first, which is what the assertion encodes. `"a-3"` vs `"A-2"`: text chunk `"a-"` equals `"A-"` case-insensitively, then 3 > 2, so `"A-2" < "a-3" < "A-10"`.

- [ ] **Step 2: Run, expect FAIL (classes not defined).**
`mvn -q -Dtest=PlotGridServiceTest test`

- [ ] **Step 3: Implement.**

`PlotGridResponse.java`:

```java
package com.plotchain.projects;

import java.math.BigDecimal;
import java.util.UUID;

// Availability-grid row for any authenticated user (plot-booking unit 10, Decision 10).
// Deliberately NOT PlotResponse: no rate, no thumbnail, and nothing about bookings/buyers/associates.
public record PlotGridResponse(
    UUID plotId,
    String plotNo,
    PlotType type,
    BigDecimal area,   // square feet (plot.area_sqft)
    BigDecimal price,
    PlotStatus status
) {}
```

`PlotGridService.java`:

```java
package com.plotchain.projects;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigInteger;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class PlotGridService {

    private static final Pattern CHUNK = Pattern.compile("\\d+|\\D+");

    private final PlotRepository plotRepository;
    private final ProjectRepository projectRepository;

    public PlotGridService(PlotRepository plotRepository, ProjectRepository projectRepository) {
        this.plotRepository = plotRepository;
        this.projectRepository = projectRepository;
    }

    // ponytail: unpaginated -- one project's plots are bounded (hundreds, low thousands). Past ~5,000
    // plots per project add paging or a DB-side sort. Two queries total (exists + list), no per-row lookups.
    @Transactional(readOnly = true)
    public List<PlotGridResponse> grid(UUID projectId) {
        if (!projectRepository.existsById(projectId)) {
            throw new ProjectNotFoundException(projectId);
        }
        return plotRepository.findByProjectId(projectId).stream()
            .sorted(Comparator.comparing(Plot::getPlotNo, PlotGridService::compareNatural))
            .map(p -> new PlotGridResponse(p.getId(), p.getPlotNo(), p.getPlotType(),
                p.getAreaSqft(), p.getPrice(), p.getStatus()))
            .toList();
    }

    // Digit runs compare numerically, text runs case-insensitively, digits sort before text; a final
    // plain compareTo makes the order total and stable ("A-02" vs "A-2", and shorter prefix first).
    static int compareNatural(String a, String b) {
        Matcher ma = CHUNK.matcher(a);
        Matcher mb = CHUNK.matcher(b);
        while (ma.find() && mb.find()) {
            String x = ma.group();
            String y = mb.group();
            boolean dx = Character.isDigit(x.charAt(0));
            boolean dy = Character.isDigit(y.charAt(0));
            int c;
            if (dx && dy) {
                c = new BigInteger(x).compareTo(new BigInteger(y));
            } else if (dx != dy) {
                c = dx ? -1 : 1;
            } else {
                c = x.compareToIgnoreCase(y);
            }
            if (c != 0) {
                return c;
            }
        }
        return a.compareTo(b);
    }
}
```

- [ ] **Step 4: Run, expect PASS.** `mvn -q -Dtest=PlotGridServiceTest test`

- [ ] **Step 5: Commit.**

```bash
git add backend/src/main/java/com/plotchain/projects/PlotGridResponse.java backend/src/main/java/com/plotchain/projects/PlotGridService.java backend/src/test/java/com/plotchain/projects/PlotGridServiceTest.java
git commit -m "feat(projects): PlotGridService with 404 and natural plot-number order (unit 10)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015zhXZ3UAhJC2WgeQduJkUG"
```

---

### Task 3: `PlotGridController` + controller tests (data-leak guard)

**Files:**
- Create: `backend/src/main/java/com/plotchain/projects/PlotGridController.java`
- Test: `backend/src/test/java/com/plotchain/projects/PlotGridControllerTest.java`

**Interfaces:**
- Consumes: `PlotGridService.grid(UUID)` (Task 2).
- Produces: `GET /api/projects/{projectId}/plots/grid` -> `200 [PlotGridResponse...]`, `404 {"error": "..."}`, `401` anonymous.

- [ ] **Step 1: Write the failing tests.** Same harness as `PlotControllerTest` (real filter chain, `@MockBean` repositories):

```java
package com.plotchain.projects;

import com.fasterxml.jackson.databind.JsonNode;
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

import java.math.BigDecimal;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PlotGridControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;
    @Autowired ObjectMapper objectMapper;

    @MockBean AssociateRepository associateRepository;
    @MockBean PlotRepository plotRepository;
    @MockBean ProjectRepository projectRepository;
    @MockBean SettingsAuditLogRepository settingsAuditLogRepository;

    private static final UUID PROJECT_ID = UUID.randomUUID();

    private String tokenFor(AssociateRole role) {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(role);
        when(associateRepository.findById(associate.getId())).thenReturn(Optional.of(associate));
        return jwtService.generateToken(associate);
    }

    private Plot plot(String plotNo, PlotStatus status) {
        return new Plot(UUID.randomUUID(), PROJECT_ID, plotNo, PlotType.CORNER,
            new BigDecimal("1200.00"), new BigDecimal("500.00"), new BigDecimal("600000.00"), status);
    }

    private void stubProject(List<Plot> plots) {
        when(projectRepository.existsById(PROJECT_ID)).thenReturn(true);
        when(plotRepository.findByProjectId(PROJECT_ID)).thenReturn(plots);
    }

    @Test
    void anAssociateTokenGetsTheGridAsABareNaturallyOrderedArray() throws Exception {
        stubProject(List.of(plot("10", PlotStatus.SOLD), plot("2", PlotStatus.AVAILABLE)));

        mockMvc.perform(get("/api/projects/" + PROJECT_ID + "/plots/grid")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(2))
            .andExpect(jsonPath("$[0].plotNo").value("2"))
            .andExpect(jsonPath("$[0].type").value("CORNER"))
            .andExpect(jsonPath("$[0].area").value(1200.00))
            .andExpect(jsonPath("$[0].price").value(600000.00))
            .andExpect(jsonPath("$[0].status").value("AVAILABLE"))
            .andExpect(jsonPath("$[1].plotNo").value("10"))
            .andExpect(jsonPath("$[1].status").value("SOLD"));
    }

    @Test
    void anAdminTokenGetsTheGridToo() throws Exception {
        stubProject(List.of(plot("A-1", PlotStatus.BOOKED)));

        mockMvc.perform(get("/api/projects/" + PROJECT_ID + "/plots/grid")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].status").value("BOOKED"));
    }

    @Test
    void aProjectWithNoPlotsReturnsAnEmptyArrayNot404() throws Exception {
        stubProject(List.of());

        mockMvc.perform(get("/api/projects/" + PROJECT_ID + "/plots/grid")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void anUnknownProjectIs404() throws Exception {
        when(projectRepository.existsById(PROJECT_ID)).thenReturn(false);

        mockMvc.perform(get("/api/projects/" + PROJECT_ID + "/plots/grid")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isNotFound());
    }

    @Test
    void noTokenIs401() throws Exception {
        mockMvc.perform(get("/api/projects/" + PROJECT_ID + "/plots/grid"))
            .andExpect(status().isUnauthorized());
    }

    // Data-leak guard (Decision 10: "and nothing else"). Exact key set: a field added to the DTO later
    // (rate, thumbnail, buyerName, bookingId, associateId, ...) fails this test.
    @Test
    void eachRowHasExactlyTheSixAllowedKeysAndNothingElse() throws Exception {
        stubProject(List.of(plot("A-1", PlotStatus.BOOKED)));

        String body = mockMvc.perform(get("/api/projects/" + PROJECT_ID + "/plots/grid")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andReturn().getResponse().getContentAsString();

        JsonNode row = objectMapper.readTree(body).get(0);
        Set<String> keys = new HashSet<>();
        row.fieldNames().forEachRemaining(keys::add);
        assertThat(keys).containsExactlyInAnyOrder("plotId", "plotNo", "type", "area", "price", "status");
        assertThat(body).doesNotContain("rate").doesNotContain("buyer").doesNotContain("booking")
            .doesNotContain("associate").doesNotContain("thumbnail");
    }
}
```

- [ ] **Step 2: Run, expect FAIL** (404/401 mismatch since route absent; `200` assertions fail). `mvn -q -Dtest=PlotGridControllerTest test`

- [ ] **Step 3: Implement** `PlotGridController.java`:

```java
package com.plotchain.projects;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

// Plot-booking unit 10: availability grid read for any authenticated user. Deliberately a separate
// root from PlotController (/api/company/projects/...): the spec path is /api/projects/{id}/plots/grid.
// No SecurityConfig matcher: it falls through to anyRequest().authenticated() (pinned in SecurityConfigTest).
@RestController
@RequestMapping("/api/projects/{projectId}/plots/grid")
public class PlotGridController {

    private final PlotGridService plotGridService;

    public PlotGridController(PlotGridService plotGridService) {
        this.plotGridService = plotGridService;
    }

    @GetMapping
    public List<PlotGridResponse> grid(@PathVariable UUID projectId) {
        return plotGridService.grid(projectId);
    }
}
```

- [ ] **Step 4: Run, expect PASS.** `mvn -q -Dtest=PlotGridControllerTest,PlotGridServiceTest test`

- [ ] **Step 5: Mutation checks (do, observe red, revert).**
  (a) Add `BigDecimal rate` to `PlotGridResponse` (and the constructor call) -> `eachRowHasExactlyTheSixAllowedKeysAndNothingElse` MUST fail; revert.
  (b) In `PlotGridService` remove the `.sorted(...)` line -> `anAssociateTokenGetsTheGridAsABareNaturallyOrderedArray` and the service ordering tests MUST fail; revert.
  (c) Replace `compareNatural` body with `return a.compareTo(b);` -> `numericLookingPlotNumbersSortNumericallyNotLexically` MUST fail; revert.
  (d) Remove the `existsById` guard -> `anUnknownProjectIs404` and `unknownProjectThrows...` MUST fail; revert.

- [ ] **Step 6: Commit.**

```bash
git add backend/src/main/java/com/plotchain/projects/PlotGridController.java backend/src/test/java/com/plotchain/projects/PlotGridControllerTest.java
git commit -m "feat(projects): GET /api/projects/{id}/plots/grid controller with data-leak guard (unit 10)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015zhXZ3UAhJC2WgeQduJkUG"
```

---

### Task 4: SecurityConfigTest matrix rows (test-only; no SecurityConfig edit)

**Files:**
- Test (modify): `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java` (append after the unit 9 overdue-report rows, ~line 669, before the epin comment block)

**Interfaces:**
- Consumes: `tokenFor(AssociateRole)` helper already in the class; real H2 `ProjectRepository` (not `@MockBean`'d in this class), so a random project id is a genuine 404 from `ProjectNotFoundException`.
- Produces: pinned security posture for the grid route.

Why no source edit: see Findings 2-3. The route is covered by `anyRequest().authenticated()`; the only broader GET matchers are the exact-path `/api/company/...` and `/api/admin/...` ones, none of which can match `/api/projects/...`. If the implementer finds the new rows red for the associate token in Step 2, STOP: add the minimal matcher `.requestMatchers(HttpMethod.GET, "/api/projects/*/plots/grid").authenticated()` immediately ABOVE the first of the blanket `POST /api/**` rules (any location above `anyRequest()` and above any broader `GET /api/projects/**` ADMIN rule works, but keep it next to the other GET matchers) in its OWN commit titled `feat(security): any-authenticated matcher for GET /api/projects/*/plots/grid (unit 10)`, then go green. Expectation: this never happens.

- [ ] **Step 1: Write the tests.**

```java
    // plot-booking unit 10 (Decision 10): the plot grid is readable by ANY authenticated user. No SecurityConfig
    // matcher exists for /api/projects/**, so it falls through to anyRequest().authenticated(). ProjectRepository is
    // not @MockBean'd here, so a random project id is a genuine miss -> ProjectNotFoundException -> 404. Asserting
    // the precise 404 (not just "not 403") proves the request passed the security layer and reached the controller.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void plotGridIsReachableForEveryAuthenticatedRole(AssociateRole role) throws Exception {
        mockMvc.perform(get("/api/projects/" + UUID.randomUUID() + "/plots/grid")
                .header("Authorization", "Bearer " + tokenFor(role)))
            .andExpect(status().isNotFound());
    }

    @Test
    void plotGridIsUnauthorizedWithoutAToken() throws Exception {
        mockMvc.perform(get("/api/projects/" + UUID.randomUUID() + "/plots/grid"))
            .andExpect(status().isUnauthorized());
    }

    // Proves the grid being open did not loosen the neighbouring admin-only plot GET: the thumbnail stays
    // ADMIN-only (the existing projectThumbnailIsForbiddenForAnAssociateToken covers the associate side too;
    // this pins both sides in the same matrix as the grid rows above).
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void plotGridOpenAccessDoesNotLoosenTheAdminOnlyThumbnailRead(AssociateRole role) throws Exception {
        int expected = role == AssociateRole.ASSOCIATE ? 403 : 404;   // non-associate roles pass security -> unknown project 404
        mockMvc.perform(get("/api/company/projects/" + UUID.randomUUID() + "/thumbnail")
                .header("Authorization", "Bearer " + tokenFor(role)))
            .andExpect(status().is(expected));
    }
```

Check before keeping the last test: `AssociateRole` values other than ASSOCIATE are admin-family per the existing `paymentsIsReachableForAnyAdminFamilyToken` (`mode = EXCLUDE ASSOCIATE` expecting 200). If any non-ASSOCIATE role is NOT admin-family per `hasAuthority("ADMIN")` in `tokenFor`/`JwtService`, change the parameterisation to `names = {"ADMIN"}` plus a separate associate case; the existing `projectThumbnailIsForbiddenForAnAssociateToken` shows associate=403 and `projectThumbnail...` ADMIN=404 are the verified pairs.

- [ ] **Step 2: Run, expect PASS immediately** (this unit's security is behaviour that already exists; the tests pin it). `mvn -q -Dtest=SecurityConfigTest test`. If associate rows are red, apply the contingency in the intro of this task.

- [ ] **Step 3: Mutation check (do, observe red, revert).** Temporarily add to `SecurityConfig` just above `.requestMatchers(HttpMethod.POST, "/api/**")`: `.requestMatchers(HttpMethod.GET, "/api/projects/**").hasAuthority("ADMIN")`. Then `plotGridIsReachableForEveryAuthenticatedRole[ASSOCIATE]` MUST fail with 403 (and `PlotGridControllerTest.anAssociateTokenGetsTheGrid...` too). Revert with `git checkout backend/src/main/java/com/plotchain/auth/SecurityConfig.java`; confirm `git diff --stat` shows `SecurityConfig.java` untouched.

- [ ] **Step 4: Commit (test-only).**

```bash
git add backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java
git commit -m "test(security): pin any-authenticated access to GET /api/projects/{id}/plots/grid (unit 10)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015zhXZ3UAhJC2WgeQduJkUG"
```

---

### Task 5: Real-DB proof that status is live across booking create / cancel / sold

**Files:**
- Test (create): `backend/src/test/java/com/plotchain/projects/PlotGridLiveStatusIntegrationTest.java`

**Interfaces:**
- Consumes: `PlotGridService.grid(UUID)`, `BookingService.createBooking(CreateBookingRequest(plotId, associateId, buyerName, buyerPhone))`, `BookingService.cancelBooking(UUID bookingId, CancelBookingRequest(reason), UUID actorId)`. Cleanup via `JdbcTemplate` (committed rows, `@SpringBootTest` on H2 PostgreSQL mode via Flyway; harness shape copied from `BookingCancelIntegrationTest`, using an ADMIN associate row because `chk_associate_rank_required` demands a rank for ASSOCIATE rows).
- Produces: proof that the grid reads current plot state with no caching and returns the 6 fields from the real schema.

- [ ] **Step 1: Write the test.**

```java
package com.plotchain.projects;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.booking.BookingResponse;
import com.plotchain.booking.BookingService;
import com.plotchain.booking.CancelBookingRequest;
import com.plotchain.booking.CreateBookingRequest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

// Real-DB (H2 via Flyway) proof for plot-booking unit 10: the grid shows the live plot status as bookings
// move it AVAILABLE -> BOOKED -> AVAILABLE (cancel) and as a plot is SOLD (direct update, as confirm does).
@SpringBootTest
@ActiveProfiles("test")
class PlotGridLiveStatusIntegrationTest {

    @Autowired PlotGridService plotGridService;
    @Autowired BookingService bookingService;
    @Autowired ProjectRepository projectRepository;
    @Autowired PlotRepository plotRepository;
    @Autowired AssociateRepository associateRepository;
    @Autowired JdbcTemplate jdbc;

    private UUID projectId;
    private UUID plotId;
    private UUID associateId;

    @BeforeEach
    void seed() {
        Project project = new Project(UUID.randomUUID(), "Grid Test Project", "Hyderabad", null, null, Instant.now());
        projectRepository.saveAndFlush(project);
        projectId = project.getId();
        plotId = UUID.randomUUID();
        // two plots so ordering over the real column is exercised too: "10" inserted before "2"
        plotRepository.saveAndFlush(new Plot(UUID.randomUUID(), projectId, "10", PlotType.NORMAL,
            new BigDecimal("900.00"), new BigDecimal("400.00"), new BigDecimal("360000.00"), PlotStatus.AVAILABLE));
        plotRepository.saveAndFlush(new Plot(plotId, projectId, "2", PlotType.CORNER,
            new BigDecimal("1200.00"), new BigDecimal("500.00"), new BigDecimal("600000.00"), PlotStatus.AVAILABLE));

        associateId = UUID.randomUUID();
        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setPosition("L");
        associate.setName("Grid Test Associate");
        associate.setKycStatus(KycStatus.VERIFIED);
        associate.setJoinedAt(Instant.now());
        associate.setCumulativeMatchedVolume(BigDecimal.ZERO);
        associate.setUserId("u-" + associateId);
        associate.setEmail(associateId + "@test.local");
        associate.setPasswordHash("$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C");
        associate.setRole(AssociateRole.ADMIN);
        associateRepository.saveAndFlush(associate);
    }

    @AfterEach
    void cleanUp() {
        jdbc.update("DELETE FROM booking_event WHERE booking_id IN (SELECT id FROM plot_booking WHERE associate_id = ?)", associateId);
        jdbc.update("DELETE FROM emi_installment WHERE booking_id IN (SELECT id FROM plot_booking WHERE associate_id = ?)", associateId);
        jdbc.update("DELETE FROM plot_booking WHERE associate_id = ?", associateId);
        jdbc.update("DELETE FROM plot WHERE project_id = ?", projectId);
        jdbc.update("DELETE FROM project WHERE id = ?", projectId);
        jdbc.update("DELETE FROM associate WHERE id = ?", associateId);
    }

    private PlotStatus gridStatusOfPlot2() {
        return plotGridService.grid(projectId).stream()
            .filter(r -> r.plotId().equals(plotId)).findFirst().orElseThrow().status();
    }

    @Test
    void gridReturnsRealRowsInNaturalOrderWithTheSixFields() {
        var rows = plotGridService.grid(projectId);

        assertThat(rows).extracting(PlotGridResponse::plotNo).containsExactly("2", "10");
        PlotGridResponse two = rows.get(0);
        assertThat(two.plotId()).isEqualTo(plotId);
        assertThat(two.type()).isEqualTo(PlotType.CORNER);
        assertThat(two.area()).isEqualByComparingTo("1200.00");
        assertThat(two.price()).isEqualByComparingTo("600000.00");
        assertThat(two.status()).isEqualTo(PlotStatus.AVAILABLE);
    }

    @Test
    void statusFollowsBookingCreateCancelAndSold() {
        assertThat(gridStatusOfPlot2()).isEqualTo(PlotStatus.AVAILABLE);

        BookingResponse booking = bookingService.createBooking(
            new CreateBookingRequest(plotId, associateId, "Jane Buyer", null));
        assertThat(gridStatusOfPlot2()).isEqualTo(PlotStatus.BOOKED);

        bookingService.cancelBooking(booking.id(), new CancelBookingRequest("buyer withdrew"), associateId);
        assertThat(gridStatusOfPlot2()).isEqualTo(PlotStatus.AVAILABLE);

        // confirm / recordSale flip the plot to SOLD; a direct update is the same state the grid must show
        jdbc.update("UPDATE plot SET status = 'SOLD' WHERE id = ?", plotId);
        assertThat(gridStatusOfPlot2()).isEqualTo(PlotStatus.SOLD);
    }
}
```

Verify the real column/table names before running: `plot_booking.associate_id`, `booking_event.booking_id`, `emi_installment.booking_id`, `plot.project_id`, `project` table name (see `V10__project_and_plot.sql` and `V41__plot_booking_lifecycle.sql`; `BookingCancelIntegrationTest.cleanUp` uses the same relations through repositories). Adjust only names, not intent. If `createBooking` fails because the singleton `booking_emi_config` row needs particular values, copy `setConfig(true, 4, "MANUAL", null)` and the save/restore `@BeforeEach/@AfterEach` pair from `BookingCancelIntegrationTest` (lines ~75-88, 111-116).

- [ ] **Step 2: Run, expect PASS** (classes exist from Tasks 1-3). `mvn -q -Dtest=PlotGridLiveStatusIntegrationTest test`

- [ ] **Step 3: Mutation check.** In `PlotGridService.grid` temporarily replace the `findByProjectId` result with a field-cached list (e.g. `static` cache set on first call) -> `statusFollowsBookingCreateCancelAndSold` MUST fail on the BOOKED assertion. Revert.

- [ ] **Step 4: Commit.**

```bash
git add backend/src/test/java/com/plotchain/projects/PlotGridLiveStatusIntegrationTest.java
git commit -m "test(projects): real-DB plot grid reflects booking create/cancel/sold live (unit 10)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015zhXZ3UAhJC2WgeQduJkUG"
```

---

### Task 6: Regression run and handback

**Files:** none modified.

- [ ] **Step 1: Run the targeted baseline plus the new classes** (from the worktree's `backend/`):

```bash
mvn -Dtest='Booking*,Sale*,AssociateSaleControllerTest,AssociateBookingControllerTest,AdminBookingRegisterControllerTest,PlotBookingRegisterRepositoryTest,OverdueReport*,AdminEmiReportControllerTest,SecurityConfigTest,PlotBookingSchemaTest,V41MigrationTest,EPinServiceTest,AdminStatsServiceTest,Plot*,Project*' test
```

Expected: all green (baseline 497 plus the new unit-10 tests; record the exact count). Do not chase the ~55 spurious Mockito errors or the 4 `JwtServiceTest`/`SecretsEncryptionServiceTest` failures that appear only on full runs.

- [ ] **Step 2: Confirm scope.** `git diff master --stat` must list only: `PlotRepository.java`, `PlotGridResponse.java`, `PlotGridService.java`, `PlotGridController.java`, and test files (`PlotRepositoryTest`, `PlotGridServiceTest`, `PlotGridControllerTest`, `PlotGridLiveStatusIntegrationTest`, `SecurityConfigTest`). `SecurityConfig.java`, the units file and `docs/design/` MUST be absent.

- [ ] **Step 3: Handback notes for the coordinator** (do not edit the units file yourself): commit range, new green count, whether the Task 4 contingency was needed (expected: no), and these carry-forward notes for units 11/13 to record under "Unit 10 notes":
  - Endpoint: `GET /api/projects/{projectId}/plots/grid`, any authenticated token, `Authorization: Bearer`.
  - Response (frontend model to code against, bare array, no envelope, no pagination):
    ```ts
    export type PlotGridStatus = 'AVAILABLE' | 'BOOKED' | 'SOLD';
    export interface PlotGridItem {
      plotId: string;        // UUID
      plotNo: string;        // natural order already applied server-side ("2" before "10")
      type: 'NORMAL' | 'CORNER';
      area: number;          // square feet
      price: number;
      status: PlotGridStatus;
    }
    // GET -> PlotGridItem[]   (404 { error } for an unknown project; [] for a project with no plots)
    ```
  - It deliberately has no project name or counts; use the existing `/api/company/projects` endpoints for the name and derive counts from `status`.
  - Unit 11's "Book" action must read `plotId` from this payload and call unit 1's `POST /api/admin/bookings`; unit 13 shows the six fields only.
  - Performance: 2 queries per call (existence + list), sorted in memory; ceiling ~5,000 plots per project before paging is warranted.
  - Smoke-test against real PostgreSQL is not needed for this query (plain derived finder), but the end-to-end grid has only been proven on H2.
