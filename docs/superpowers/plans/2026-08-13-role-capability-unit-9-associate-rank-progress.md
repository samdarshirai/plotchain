# Role Capability Unit 9: Associate Rank Progress / Reward Tiers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a self-scoped, read-only `GET /api/associates/me/rank-progress` endpoint so an authenticated Associate can see their own current rank, progress toward the next rank, and reward-tier achievement — without touching the existing admin-only `CompensationPlanController`.

**Architecture:** Extend the existing `CompensationPlanService` (package `com.plotchain.compensation`) with one new read method, `getMyRankProgress(UUID associateId)`, that reuses the same `RankTier`/`RewardTier`/`CompensationPlanVersion` entities and repositories the admin side already uses (no new repository methods, no new tables/migrations). A brand-new bare `@RestController`, `AssociateRankProgressController`, exposes it at `/api/associates/me/rank-progress`, resolving the caller's own id from `@AuthenticationPrincipal` exactly like `PasswordController`/`DashboardController`/`AssociateSaleController` already do. No `SecurityConfig` change is needed — a bare `GET` under `/api/**` that isn't explicitly matched falls through to `anyRequest().authenticated()`, the same way `GET /api/associates/me/dashboard` and `GET /api/associates/me/sales` already do.

**Tech Stack:** Spring Boot (Java), Spring Security (JWT bearer auth via `@AuthenticationPrincipal UUID`), Spring Data JPA, JUnit 5 + Mockito (service tests), `@SpringBootTest` + `MockMvc` (controller/security tests), Maven.

## Global Constraints

- Route must fall under `/api/associates/me/*`, per this unit's acceptance criteria and this codebase's established self-service convention (`/api/associates/me/password`, `/api/associates/me/dashboard`, `/api/associates/me/sales`).
- The endpoint is read-only (`GET` only) and self-scoped by construction: the target associate id always comes from the verified JWT (`@AuthenticationPrincipal UUID associateId`), never from a path/query param — no caller can view another associate's rank progress through this route.
- The existing admin-only `CompensationPlanController` (`GET /api/company/compensation`, `GET /api/company/compensation/history`, `PUT /api/company/compensation`) and its `SecurityConfig` matchers (`hasAuthority("ADMIN")`) must not change.
- No new `SecurityConfig` matcher for this route — verified against the codebase's own established precedent (see Task 3): a bare `GET` never collides with the blanket `POST`/`PUT`/`PATCH`/`DELETE` write rules, so it falls through to `anyRequest().authenticated()` with no matcher of its own, exactly like `GET /api/associates/me/dashboard` and `GET /api/associates/me/sales`.
- Reuse existing domain model and repositories — do not add new repository query methods, new tables, or a new Flyway migration. Everything this endpoint needs (`RankTier`, `RewardTier`, `CompensationPlanVersion`, `Associate.rankId`, `Associate.cumulativeMatchedVolume`) already exists and is already queried by `CompensationPlanService`, `DashboardService`, and `CycleService`.
- Follow this codebase's existing test conventions exactly: `@SpringBootTest` + `@AutoConfigureMockMvc` + `@MockBean` on repository *interfaces* (not concrete services) for controller/security tests (avoids the known JDK21/25 + Mockito/ByteBuddy concrete-class-mocking issue — see `plotchain_jdk_mockito_env_issue` memory note); plain `@ExtendWith(MockitoExtension.class)` + `@Mock` for service unit tests.

---

## Investigation summary (context for the implementer — not steps to redo)

- `rank` package (`RankTier`, `RankTierRepository`) is exactly what the spec's reconciliation note says: entity + repo only, no controller. `RankTier` has `id`, `name`, `rankOrder`, `volumeThreshold`. `RankTierRepository.findAllByOrderByRankOrder()` is the only query method and is already used by `CompensationPlanService`, `DashboardService`, `AdminAssociateService`, `AssociateProvisioningService`, and `CycleService`.
- `Associate` (package `com.plotchain.associate`) carries the two fields this feature needs directly: `rankId` (nullable `UUID`, FK to `RankTier` — null only for `ADMIN`, required for `ASSOCIATE` per `chk_associate_rank_required`) and `cumulativeMatchedVolume` (`BigDecimal`, the progress metric, incremented during cycle-close's `creditMatchingIncome` step — see `CycleService`).
- **Rank advancement already has a canonical implementation to mirror, not reinvent**: `CycleService.advanceRanks(...)` (cycle-management unit 6) walks `rankTierRepository.findAllByOrderByRankOrder()` ascending and picks the highest-`rankOrder` tier whose `volumeThreshold` is `<= associate.getCumulativeMatchedVolume()`. `DashboardService.getDashboard(...)` independently computes an associate-facing **current/next rank + progress-percent + volume-to-next-rank** view using this exact same ranks list (`DashboardResponse.RankProgress`, see `DashboardService.java:93-114`). That Dashboard computation is the direct template this unit's `progressPercent`/`volumeToNextRank` math copies verbatim — same ranks-ordered-ascending walk, same `Optional<RankTier> nextRank = ranks.stream().filter(r -> r.getRankOrder() > currentRank.getRankOrder()).findFirst()`, same `min(100)`/`max(ZERO)` clamping.
- **Reward tiers already have a canonical "is this tier reached" predicate to mirror**: `CycleService.creditReward(...)` (cycle-management unit 9) walks `rewardTierRepository.findAllByPlanVersionIdOrderByTierLevel(planVersion.getId())` and awards a tier when `tier.getVolumeThreshold().compareTo(associate.getCumulativeMatchedVolume()) <= 0`. This unit's `achieved` flag reuses that exact predicate.
- **Design decision — `achieved` (threshold-based), not `awarded` (ledger-based)**: `income.LedgerEntryRepository.existsByAssociateIdAndIncomeTypeAndSourceRef(...)` exists and is exactly what `CycleService.creditReward` uses to avoid re-awarding a tier. It was considered and rejected as the source for this endpoint's per-tier status: `creditReward` skips writing a `LedgerEntry` at all when `tier.getCashReward() <= 0` (a pure-perk tier with no cash component), so a ledger-existence flag would read as permanently "not awarded" for such a tier even after the associate has genuinely crossed its threshold. Comparing `cumulativeMatchedVolume` directly against `volumeThreshold` (mirroring `creditReward`'s own predicate) has no such gap and needs no new dependency on the `income` package.
- **Which compensation-plan version's reward tiers to show**: the *current* one, via `CompensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(LocalDate.now())` — the exact same lookup `CompensationPlanService.currentVersion()` (private) and `DashboardService.getDashboard(...)` already use. Because the new method lives inside `CompensationPlanService` itself, it can call the existing private `currentVersion()` helper directly — zero duplication.
- **Read at least one existing self-service `/api/associates/me/*` endpoint (per assignment) — three were read in full**: `PasswordController` (`POST /api/associates/me/password`), `DashboardController`/`DashboardService` (`GET /api/associates/me/dashboard`), and `AssociateSaleController`/`SaleService.getMySales(...)` (`GET /api/associates/me/sales`, Sales unit 7 — the most directly analogous precedent, since it's also a bare read-only `GET` added *alongside* an existing admin-only controller in the same package). All three resolve the target associate from `@AuthenticationPrincipal UUID associateId`, never a request param/path variable.
- **Package/placement decision**: `AssociateRankProgressController`/response DTOs go in the existing `compensation` package (not a new package, not the `rank` package). Reasoning: `compensation` already depends one-directionally on `rank` (`CompensationPlanService` imports `RankTier`/`RankTierRepository`) and has no existing dependents that import back from it in a way this would break; adding an associate-facing controller/response to `rank` instead would need `rank` to import `RewardTier`/`CompensationPlanVersion` from `compensation`, creating a `rank` ↔ `compensation` circular package dependency. This exactly mirrors Sales unit 7's own placement choice: `AssociateSaleController` was added to the `sales` package (not a new package) precisely because `SaleController` (admin) already lived there and the two share `SaleService` — see `AssociateSaleController.java`'s own header comment.
- **Why a separate controller class, not a new method on `CompensationPlanController`**: `CompensationPlanController` has a class-level `@RequestMapping("/api/company/compensation")`; Spring concatenates class-level and method-level paths rather than treating a method's leading `/` as an absolute override, so a `/api/associates/me/rank-progress` method mapping placed there would not resolve to the intended URL. `AssociateSaleController`'s own header comment documents this exact same reasoning for why it wasn't added to `SaleController`.
- **`SecurityConfig` matchers checked directly** (`backend/src/main/java/com/plotchain/auth/SecurityConfig.java`): the only matcher relevant to `/api/associates/me/*` is `POST /api/associates/me/password` (`.authenticated()`, needed because it's a `POST` and would otherwise be swallowed by the blanket `POST /api/**` → `hasAuthority("ADMIN")` rule declared later). `GET /api/associates/me/dashboard` and `GET /api/associates/me/sales` have **no** matcher of their own — confirmed by `SecurityConfigTest.associateMeSalesIsReachableByAnAssociateToken`'s own comment: "needs no explicit SecurityConfig matcher — a bare GET never collides with the blanket POST/PUT/PATCH/DELETE write rules above, so it falls through to `anyRequest().authenticated()`". The new route is a bare `GET`, so the same reasoning applies with no new matcher — Task 3 adds a regression-guard test proving this rather than a matcher.
- **Test conventions confirmed by direct read**: `DashboardControllerTest`/`AssociateSaleControllerTest`/`CompensationPlanControllerTest` all use `@SpringBootTest` + `@AutoConfigureMockMvc` + `@MockBean` on the repository *interfaces* the real service depends on (never `@MockBean` on the service itself), running a *real* service inside a *real* Spring Security filter chain so the test proves auth actually gates the route. Service-level tests (`DashboardServiceTest`, `CompensationPlanServiceTest`) use plain `@ExtendWith(MockitoExtension.class)`.

---

### Task 1: `CompensationPlanService.getMyRankProgress(...)` + response DTOs + no-rank exception

**Files:**
- Modify: `backend/src/main/java/com/plotchain/compensation/CompensationPlanService.java`
- Modify: `backend/src/main/java/com/plotchain/compensation/CompensationExceptionHandler.java`
- Create: `backend/src/main/java/com/plotchain/compensation/AssociateRankProgressResponse.java`
- Create: `backend/src/main/java/com/plotchain/compensation/AssociateRewardTierDto.java`
- Create: `backend/src/main/java/com/plotchain/compensation/NoRankAssignedException.java`
- Test: `backend/src/test/java/com/plotchain/compensation/CompensationPlanServiceTest.java` (modify)

**Interfaces:**
- Consumes (all already exist, unmodified): `AssociateRepository.findById(UUID): Optional<Associate>`; `Associate.getRankId(): UUID`, `Associate.getCumulativeMatchedVolume(): BigDecimal`; `RankTierRepository.findAllByOrderByRankOrder(): List<RankTier>`; `RankTier.getId()/getName()/getRankOrder()/getVolumeThreshold()`; `RewardTierRepository.findAllByPlanVersionIdOrderByTierLevel(UUID): List<RewardTier>`; `RewardTier.getTierLevel()/getVolumeThreshold()/getCashReward()/getPerkDescription()`; `CompensationPlanService`'s own existing private `currentVersion(): CompensationPlanVersion` helper (already used by `getCurrentPlan()`); `AssociateNotFoundException(UUID)` (package `com.plotchain.associate`).
- Produces (for Task 2 to consume): `CompensationPlanService.getMyRankProgress(UUID associateId): AssociateRankProgressResponse`; `AssociateRankProgressResponse(String currentRank, int currentRankOrder, String nextRank, int progressPercent, BigDecimal cumulativeMatchedVolume, BigDecimal volumeToNextRank, List<AssociateRewardTierDto> rewardTiers)`; `AssociateRewardTierDto(int tierLevel, BigDecimal volumeThreshold, BigDecimal cashReward, String perkDescription, boolean achieved)`; `NoRankAssignedException(UUID associateId)` (package `com.plotchain.compensation`), mapped by `CompensationExceptionHandler` to `409 CONFLICT`; `AssociateNotFoundException` now also mapped by `CompensationExceptionHandler` to `404 NOT_FOUND`.

- [ ] **Step 1: Write the failing tests**

  Open `backend/src/test/java/com/plotchain/compensation/CompensationPlanServiceTest.java`. Add two imports near the top (alongside the existing `import com.plotchain.associate.AssociateRepository;`):

  ```java
  import com.plotchain.associate.Associate;
  import com.plotchain.associate.AssociateNotFoundException;
  ```

  Update the constructor call inside `setUp()` (currently 5 args) to pass `associateRepository` as a 6th argument — it's already declared as a `@Mock` field in this class, just not wired into the service yet:

  ```java
  @BeforeEach
  void setUp() {
      SettingsAuditService settingsAuditService = new SettingsAuditService(
          settingsAuditLogRepository, associateRepository, new ObjectMapper().findAndRegisterModules());
      compensationPlanService = new CompensationPlanService(
          versionRepository, royaltyBonusRateRepository, rewardTierRepository, rankTierRepository,
          settingsAuditService, associateRepository);
  }
  ```

  Then append this new test section anywhere after the existing fixture helpers (e.g. right after the `versionOn(...)` helper, before the `-- contiguity validation --` section):

  ```java
  // -- getMyRankProgress --------------------------------------------------

  @Test
  void getMyRankProgressReturnsCurrentAndNextRankWithProgressAndRewardTiers() {
      UUID associateId = UUID.randomUUID();
      UUID currentRankId = UUID.randomUUID();
      UUID nextRankId = UUID.randomUUID();

      Associate associate = new Associate();
      associate.setId(associateId);
      associate.setRankId(currentRankId);
      associate.setCumulativeMatchedVolume(new BigDecimal("4000"));

      RankTier currentRank = new RankTier(currentRankId, "Sales Associate", 1, new BigDecimal("2000"));
      RankTier nextRank = new RankTier(nextRankId, "Sales Executive", 2, new BigDecimal("10000"));

      CompensationPlanVersion version = seedVersion();
      RewardTier achievedTier = new RewardTier(
          UUID.randomUUID(), version.getId(), 1, new BigDecimal("1000"), new BigDecimal("100"), "Tier 1");
      RewardTier unreachedTier = new RewardTier(
          UUID.randomUUID(), version.getId(), 2, new BigDecimal("5000"), new BigDecimal("500"), "Tier 2");

      when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));
      when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(currentRank, nextRank));
      when(versionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(any()))
          .thenReturn(Optional.of(version));
      when(rewardTierRepository.findAllByPlanVersionIdOrderByTierLevel(version.getId()))
          .thenReturn(List.of(achievedTier, unreachedTier));

      AssociateRankProgressResponse response = compensationPlanService.getMyRankProgress(associateId);

      assertThat(response.currentRank()).isEqualTo("Sales Associate");
      assertThat(response.currentRankOrder()).isEqualTo(1);
      assertThat(response.nextRank()).isEqualTo("Sales Executive");
      // progressPercent = 4000 * 100 / 10000 = 40
      assertThat(response.progressPercent()).isEqualTo(40);
      assertThat(response.cumulativeMatchedVolume()).isEqualByComparingTo("4000");
      assertThat(response.volumeToNextRank()).isEqualByComparingTo("6000");
      assertThat(response.rewardTiers()).hasSize(2);
      assertThat(response.rewardTiers().get(0).tierLevel()).isEqualTo(1);
      assertThat(response.rewardTiers().get(0).achieved()).isTrue();
      assertThat(response.rewardTiers().get(1).tierLevel()).isEqualTo(2);
      assertThat(response.rewardTiers().get(1).achieved()).isFalse();
  }

  @Test
  void getMyRankProgressAtMaxRankReturnsNullNextRankAndFullProgress() {
      UUID associateId = UUID.randomUUID();
      UUID currentRankId = UUID.randomUUID();

      Associate associate = new Associate();
      associate.setId(associateId);
      associate.setRankId(currentRankId);
      associate.setCumulativeMatchedVolume(new BigDecimal("50000"));

      RankTier currentRank = new RankTier(currentRankId, "Sales Legend", 5, new BigDecimal("40000"));
      CompensationPlanVersion version = seedVersion();

      when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));
      when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(currentRank));
      when(versionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(any()))
          .thenReturn(Optional.of(version));
      when(rewardTierRepository.findAllByPlanVersionIdOrderByTierLevel(version.getId()))
          .thenReturn(List.of());

      AssociateRankProgressResponse response = compensationPlanService.getMyRankProgress(associateId);

      assertThat(response.nextRank()).isNull();
      assertThat(response.progressPercent()).isEqualTo(100);
      assertThat(response.volumeToNextRank()).isEqualByComparingTo("0");
      assertThat(response.rewardTiers()).isEmpty();
  }

  @Test
  void getMyRankProgressThrowsNoRankAssignedExceptionWhenAssociateHasNoRank() {
      UUID associateId = UUID.randomUUID();
      Associate associate = new Associate();
      associate.setId(associateId);
      associate.setRankId(null);
      when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));

      assertThatThrownBy(() -> compensationPlanService.getMyRankProgress(associateId))
          .isInstanceOf(NoRankAssignedException.class);
  }

  @Test
  void getMyRankProgressThrowsAssociateNotFoundExceptionWhenAssociateDoesNotExist() {
      UUID associateId = UUID.randomUUID();
      when(associateRepository.findById(associateId)).thenReturn(Optional.empty());

      assertThatThrownBy(() -> compensationPlanService.getMyRankProgress(associateId))
          .isInstanceOf(AssociateNotFoundException.class);
  }
  ```

- [ ] **Step 2: Run the tests to verify they fail**

  Run: `cd backend && mvn -q -pl . test -Dtest=CompensationPlanServiceTest`
  Expected: **BUILD FAILURE** at compilation — `CompensationPlanService(...)` has no 6-arg constructor, and `AssociateRankProgressResponse`/`NoRankAssignedException` don't exist yet. (Java compiles the whole test source set together, so this is expected to fail the whole module's test compilation, not just these 4 new tests — normal for this codebase's TDD style.)

- [ ] **Step 3: Create the response DTOs**

  Create `backend/src/main/java/com/plotchain/compensation/AssociateRewardTierDto.java`:

  ```java
  package com.plotchain.compensation;

  import java.math.BigDecimal;

  // role-capability unit 9 (docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md,
  // "Compensation rules" row): the Associate-facing counterpart to RewardTierDto (admin), with an
  // added `achieved` flag. `achieved` is true once the associate's cumulativeMatchedVolume has
  // crossed this tier's volumeThreshold -- the exact predicate CycleService#creditReward uses to
  // decide whether a tier's cash reward gets credited at cycle close
  // (tier.getVolumeThreshold().compareTo(cumulativeMatchedVolume) <= 0).
  //
  // Deliberately NOT cross-referenced against LedgerEntryRepository's awarded-ledger-entry check:
  // a zero-cashReward tier (pure perk, no cash component) never gets a LedgerEntry at all (see
  // CycleService#creditReward's own grossAmount <= 0 guard), so a ledger-sourced "awarded" flag
  // would read as permanently false for such a tier even after it's genuinely been reached.
  // Comparing volume directly sidesteps that mismatch and needs no dependency on the income
  // package.
  public record AssociateRewardTierDto(
      int tierLevel,
      BigDecimal volumeThreshold,
      BigDecimal cashReward,
      String perkDescription,
      boolean achieved
  ) {}
  ```

  Create `backend/src/main/java/com/plotchain/compensation/AssociateRankProgressResponse.java`:

  ```java
  package com.plotchain.compensation;

  import java.math.BigDecimal;
  import java.util.List;

  // role-capability unit 9 (docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md,
  // "Compensation rules" row -- Associate sees "View own rank progress / reward tiers
  // (read-only)"). Field names for the rank-progress portion deliberately match
  // DashboardResponse.RankProgress's shape (currentRank/currentRankOrder/nextRank/
  // progressPercent/volumeToNextRank) -- same underlying current/next-rank walk and
  // progress-percent formula as DashboardService.getDashboard(...), independently computed here
  // rather than extracted into a shared helper (see CompensationPlanService#getMyRankProgress's
  // own comment for why).
  public record AssociateRankProgressResponse(
      String currentRank,
      int currentRankOrder,
      String nextRank,
      int progressPercent,
      BigDecimal cumulativeMatchedVolume,
      BigDecimal volumeToNextRank,
      List<AssociateRewardTierDto> rewardTiers
  ) {}
  ```

  Create `backend/src/main/java/com/plotchain/compensation/NoRankAssignedException.java`:

  ```java
  package com.plotchain.compensation;

  import java.util.UUID;

  // Raised when the associate rank-progress view is requested for an account that has no rank --
  // in practice an ADMIN, which by design has no MLM rank (see chk_associate_rank_required). The
  // rank-progress view is an associate-facing view; admins have no meaningful one. Mirrors
  // com.plotchain.dashboard.NoRankAssignedException's identical reasoning; kept as its own class
  // in this package rather than reused across packages, to avoid a compensation<->dashboard
  // circular package dependency (dashboard already depends on compensation for
  // CompensationPlanVersionRepository).
  public class NoRankAssignedException extends RuntimeException {
      public NoRankAssignedException(UUID associateId) {
          super("No rank assigned to account " + associateId
              + "; the rank progress view does not apply to accounts without a rank");
      }
  }
  ```

- [ ] **Step 4: Implement `getMyRankProgress(...)` in `CompensationPlanService`**

  In `backend/src/main/java/com/plotchain/compensation/CompensationPlanService.java`, add these imports (alongside the existing ones):

  ```java
  import com.plotchain.associate.Associate;
  import com.plotchain.associate.AssociateNotFoundException;
  import com.plotchain.associate.AssociateRepository;
  ```

  and add these two to the existing `java.util.*`/`java.math.*` imports already present:

  ```java
  import java.math.RoundingMode;
  import java.util.Optional;
  ```

  Add a new field and extend the constructor:

  ```java
  private final AssociateRepository associateRepository;

  public CompensationPlanService(
          CompensationPlanVersionRepository versionRepository,
          RoyaltyBonusRateRepository royaltyBonusRateRepository,
          RewardTierRepository rewardTierRepository,
          RankTierRepository rankTierRepository,
          SettingsAuditService settingsAuditService,
          AssociateRepository associateRepository) {
      this.versionRepository = versionRepository;
      this.royaltyBonusRateRepository = royaltyBonusRateRepository;
      this.rewardTierRepository = rewardTierRepository;
      this.rankTierRepository = rankTierRepository;
      this.settingsAuditService = settingsAuditService;
      this.associateRepository = associateRepository;
  }
  ```

  Add the new public method (placed right after `getCurrentPlan()` reads well, but anywhere at class level is fine):

  ```java
  // role-capability unit 9 (docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md,
  // "Compensation rules" row -- Associate sees "View own rank progress / reward tiers
  // (read-only)"). Self-scoped by construction: associateId always comes from the caller's own
  // JWT (see AssociateRankProgressController), never from the request -- no caller can view
  // another associate's rank progress through this method.
  //
  // The current/next-rank + progressPercent/volumeToNextRank computation intentionally mirrors
  // DashboardService.getDashboard(...)'s identical logic (same ranks-ordered-ascending walk, same
  // clamping) rather than extracting a shared helper -- these are two independent per-feature
  // aggregations, not a shared library method, matching this codebase's existing precedent of
  // small per-feature duplication over cross-package extraction (e.g. AdminSalePageResponse vs.
  // AssociateSalePageResponse in Sales unit 7). The reward-tier `achieved` predicate mirrors
  // CycleService#creditReward's own volumeThreshold-vs-cumulativeMatchedVolume comparison.
  public AssociateRankProgressResponse getMyRankProgress(UUID associateId) {
      Associate associate = associateRepository.findById(associateId)
          .orElseThrow(() -> new AssociateNotFoundException(associateId));
      if (associate.getRankId() == null) {
          throw new NoRankAssignedException(associateId);
      }

      List<RankTier> ranks = rankTierRepository.findAllByOrderByRankOrder();
      RankTier currentRank = ranks.stream()
          .filter(r -> r.getId().equals(associate.getRankId()))
          .findFirst()
          .orElseThrow(() -> new IllegalStateException(
              "Associate's rank not found in rank table: " + associate.getRankId()));
      // ranks is ordered ascending by rankOrder, and rankOrder values are not necessarily
      // consecutive -- the next rank is the first one strictly above the current, not
      // "current + 1".
      Optional<RankTier> nextRank = ranks.stream()
          .filter(r -> r.getRankOrder() > currentRank.getRankOrder())
          .findFirst();

      int progressPercent = nextRank
          .map(nr -> associate.getCumulativeMatchedVolume()
              .multiply(BigDecimal.valueOf(100))
              .divide(nr.getVolumeThreshold(), 0, RoundingMode.DOWN)
              .min(BigDecimal.valueOf(100))
              .intValue())
          .orElse(100);
      BigDecimal volumeToNextRank = nextRank
          .map(nr -> nr.getVolumeThreshold().subtract(associate.getCumulativeMatchedVolume()).max(BigDecimal.ZERO))
          .orElse(BigDecimal.ZERO);

      CompensationPlanVersion version = currentVersion();
      List<RewardTier> tiers = rewardTierRepository.findAllByPlanVersionIdOrderByTierLevel(version.getId());
      List<AssociateRewardTierDto> tierDtos = tiers.stream()
          .map(t -> new AssociateRewardTierDto(
              t.getTierLevel(),
              t.getVolumeThreshold(),
              t.getCashReward(),
              t.getPerkDescription(),
              t.getVolumeThreshold().compareTo(associate.getCumulativeMatchedVolume()) <= 0))
          .collect(Collectors.toList());

      return new AssociateRankProgressResponse(
          currentRank.getName(),
          currentRank.getRankOrder(),
          nextRank.map(RankTier::getName).orElse(null),
          progressPercent,
          associate.getCumulativeMatchedVolume(),
          volumeToNextRank,
          tierDtos
      );
  }
  ```

  This reuses the class's existing private `currentVersion()` helper (already defined, used by `getCurrentPlan()`) unchanged.

- [ ] **Step 5: Add exception handling in `CompensationExceptionHandler`**

  In `backend/src/main/java/com/plotchain/compensation/CompensationExceptionHandler.java`, add an import:

  ```java
  import com.plotchain.associate.AssociateNotFoundException;
  ```

  and two new handler methods inside the class:

  ```java
  @ExceptionHandler(AssociateNotFoundException.class)
  public ResponseEntity<Map<String, String>> handleAssociateNotFound(AssociateNotFoundException ex) {
      return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", ex.getMessage()));
  }

  @ExceptionHandler(NoRankAssignedException.class)
  public ResponseEntity<Map<String, String>> handleNoRankAssigned(NoRankAssignedException ex) {
      return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
  }
  ```

  (This mirrors `DashboardExceptionHandler`'s identical two handlers exactly — same status codes, same body shape.)

- [ ] **Step 6: Run the tests to verify they pass**

  Run: `cd backend && mvn -q -pl . test -Dtest=CompensationPlanServiceTest`
  Expected: **BUILD SUCCESS**, all tests in `CompensationPlanServiceTest` pass (the 4 new tests plus all pre-existing ones, since the constructor change is additive-only in signature but the 5-arg call sites were all updated to 6-arg in Step 1).

- [ ] **Step 7: Commit**

  ```bash
  git add backend/src/main/java/com/plotchain/compensation/CompensationPlanService.java \
          backend/src/main/java/com/plotchain/compensation/CompensationExceptionHandler.java \
          backend/src/main/java/com/plotchain/compensation/AssociateRankProgressResponse.java \
          backend/src/main/java/com/plotchain/compensation/AssociateRewardTierDto.java \
          backend/src/main/java/com/plotchain/compensation/NoRankAssignedException.java \
          backend/src/test/java/com/plotchain/compensation/CompensationPlanServiceTest.java
  git commit -m "feat(compensation): add getMyRankProgress for associate self-service rank/reward view"
  ```

---

### Task 2: `AssociateRankProgressController` at `GET /api/associates/me/rank-progress`

**Files:**
- Create: `backend/src/main/java/com/plotchain/compensation/AssociateRankProgressController.java`
- Test: `backend/src/test/java/com/plotchain/compensation/AssociateRankProgressControllerTest.java` (new file)

**Interfaces:**
- Consumes: `CompensationPlanService.getMyRankProgress(UUID associateId): AssociateRankProgressResponse` (Task 1).
- Produces: `GET /api/associates/me/rank-progress` — `200` with `AssociateRankProgressResponse` JSON body for an authenticated Associate; `401` with no token; `409` when the associate has no rank (Admin token, in practice); relies on Task 1's `CompensationExceptionHandler` mappings.

- [ ] **Step 1: Write the failing controller test**

  Create `backend/src/test/java/com/plotchain/compensation/AssociateRankProgressControllerTest.java`:

  ```java
  package com.plotchain.compensation;

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

  import java.math.BigDecimal;
  import java.time.Instant;
  import java.time.LocalDate;
  import java.util.List;
  import java.util.Optional;
  import java.util.UUID;

  import static org.mockito.ArgumentMatchers.any;
  import static org.mockito.Mockito.when;
  import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
  import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
  import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

  // @MockBean on the repository INTERFACES (not the concrete CompensationPlanService), per
  // DashboardControllerTest/AssociateSaleControllerTest's established pattern: this runs a real
  // CompensationPlanService inside a real Spring Security filter chain, proving auth actually
  // gates this route, while avoiding the JDK25/ByteBuddy concrete-class-mocking issue.
  @SpringBootTest
  @AutoConfigureMockMvc
  @ActiveProfiles("test")
  class AssociateRankProgressControllerTest {

      @Autowired MockMvc mockMvc;
      @Autowired JwtService jwtService;

      @MockBean AssociateRepository associateRepository;
      @MockBean RankTierRepository rankTierRepository;
      @MockBean CompensationPlanVersionRepository versionRepository;
      @MockBean RewardTierRepository rewardTierRepository;

      private String tokenFor(UUID associateId) {
          Associate associate = new Associate();
          associate.setId(associateId);
          associate.setRole(AssociateRole.ASSOCIATE);
          return jwtService.generateToken(associate);
      }

      private CompensationPlanVersion version(UUID versionId) {
          return new CompensationPlanVersion(
              versionId, "v1", LocalDate.now().minusDays(1),
              BigDecimal.TEN, BigDecimal.TEN, BigDecimal.TEN, BigDecimal.TEN, BigDecimal.TEN, BigDecimal.TEN,
              BigDecimal.ZERO, BigDecimal.ZERO, SettlementCycle.MONTHLY, Instant.now(), null);
      }

      @Test
      void returnsRankProgressJsonForTheAuthenticatedAssociate() throws Exception {
          UUID associateId = UUID.randomUUID();
          UUID currentRankId = UUID.randomUUID();
          UUID versionId = UUID.randomUUID();

          Associate associate = new Associate();
          associate.setId(associateId);
          associate.setRankId(currentRankId);
          associate.setCumulativeMatchedVolume(BigDecimal.ZERO);

          RankTier currentRank = new RankTier(currentRankId, "Sales Associate", 1, BigDecimal.valueOf(5000));

          when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));
          when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(currentRank));
          when(versionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(any()))
              .thenReturn(Optional.of(version(versionId)));
          when(rewardTierRepository.findAllByPlanVersionIdOrderByTierLevel(versionId)).thenReturn(List.of());

          mockMvc.perform(get("/api/associates/me/rank-progress")
                  .header("Authorization", "Bearer " + tokenFor(associateId)))
              .andExpect(status().isOk())
              .andExpect(jsonPath("$.currentRank").value("Sales Associate"))
              .andExpect(jsonPath("$.currentRankOrder").value(1))
              .andExpect(jsonPath("$.nextRank").doesNotExist())
              .andExpect(jsonPath("$.progressPercent").value(100));
      }

      @Test
      void returns401WithoutAToken() throws Exception {
          mockMvc.perform(get("/api/associates/me/rank-progress"))
              .andExpect(status().isUnauthorized());
      }

      @Test
      void returns409WhenAssociateHasNoRank() throws Exception {
          UUID associateId = UUID.randomUUID();
          Associate associate = new Associate();
          associate.setId(associateId);
          when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));

          mockMvc.perform(get("/api/associates/me/rank-progress")
                  .header("Authorization", "Bearer " + tokenFor(associateId)))
              .andExpect(status().isConflict());
      }
  }
  ```

- [ ] **Step 2: Run the test to verify it fails**

  Run: `cd backend && mvn -q -pl . test -Dtest=AssociateRankProgressControllerTest`
  Expected: **BUILD FAILURE** — `AssociateRankProgressController` class doesn't exist, so `GET /api/associates/me/rank-progress` 404s (no such mapping) instead of returning the expected statuses/body.

- [ ] **Step 3: Implement the controller**

  Create `backend/src/main/java/com/plotchain/compensation/AssociateRankProgressController.java`:

  ```java
  package com.plotchain.compensation;

  import org.springframework.security.core.annotation.AuthenticationPrincipal;
  import org.springframework.web.bind.annotation.GetMapping;
  import org.springframework.web.bind.annotation.RestController;

  import java.util.UUID;

  // role-capability unit 9 (docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md,
  // "Compensation rules" row -- Associate sees "View own rank progress / reward tiers
  // (read-only)"). A bare @RestController with one route, same shape as
  // DashboardController/PasswordController/AssociateSaleController -- not added to
  // CompensationPlanController, whose class-level @RequestMapping("/api/company/compensation")
  // would make an absolute-path method mapping here compose incorrectly (Spring concatenates
  // class + method paths rather than treating a leading "/" as an override).
  //
  // No SecurityConfig matcher needed: this is a bare GET, which never collides with the blanket
  // POST/PUT/PATCH/DELETE write rules there, so it falls through to anyRequest().authenticated()
  // the same way GET /api/associates/me/dashboard and GET /api/associates/me/sales already do.
  @RestController
  public class AssociateRankProgressController {

      private final CompensationPlanService compensationPlanService;

      public AssociateRankProgressController(CompensationPlanService compensationPlanService) {
          this.compensationPlanService = compensationPlanService;
      }

      // Self-scoped by construction: the target associate comes from the verified JWT, never
      // from the request -- no caller can view another associate's rank progress through this
      // route, same reasoning as PasswordController.changePassword(...) /
      // AssociateSaleController.getMySales(...).
      @GetMapping("/api/associates/me/rank-progress")
      public AssociateRankProgressResponse getMyRankProgress(@AuthenticationPrincipal UUID associateId) {
          return compensationPlanService.getMyRankProgress(associateId);
      }
  }
  ```

- [ ] **Step 4: Run the test to verify it passes**

  Run: `cd backend && mvn -q -pl . test -Dtest=AssociateRankProgressControllerTest`
  Expected: **BUILD SUCCESS**, all 3 tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add backend/src/main/java/com/plotchain/compensation/AssociateRankProgressController.java \
          backend/src/test/java/com/plotchain/compensation/AssociateRankProgressControllerTest.java
  git commit -m "feat(compensation): add GET /api/associates/me/rank-progress controller"
  ```

---

### Task 3: Regression-guard test proving no new `SecurityConfig` matcher is needed

**Files:**
- Modify: `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`

**Interfaces:**
- Consumes: `GET /api/associates/me/rank-progress` (Task 2), `SecurityConfigTest`'s existing `tokenFor(AssociateRole)` helper and `AssociateRepository` `@MockBean` (both already present in this file, unmodified).
- Produces: nothing new for later tasks — this is the final task, a pure verification addition.

- [ ] **Step 1: Write the failing test**

  In `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`, add this test near `associateMeSalesIsReachableByAnAssociateToken` (same file already imports everything this needs — `get`, `status`, `not`, `AssociateRole`):

  ```java
  // role-capability unit 9 (docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md,
  // "Compensation rules" row -- Associate sees "View own rank progress / reward tiers
  // (read-only)"): needs no explicit SecurityConfig matcher -- a bare GET never collides with
  // the blanket POST/PUT/PATCH/DELETE write rules above, so it falls through to
  // anyRequest().authenticated() below, the same way GET /api/associates/me/dashboard and GET
  // /api/associates/me/sales already do with no matcher of their own. This test proves the route
  // is reachable by an ordinary associate token, not accidentally blocked by 403.
  //
  // tokenFor(role) mints a random associateId and stubs associateRepository.findById(...) to
  // return a bare Associate with no rankId set, so the request reaches
  // CompensationPlanService.getMyRankProgress and throws NoRankAssignedException (409) -- not a
  // 403. Same "assert not 403" reasoning as associateMeSalesIsReachableByAnAssociateToken above:
  // only a 403 here would mean the route regressed to being blocked at the security layer.
  @Test
  void associateMeRankProgressIsReachableByAnAssociateToken() throws Exception {
      mockMvc.perform(get("/api/associates/me/rank-progress")
              .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
          .andExpect(status().is(not(403)));
  }
  ```

- [ ] **Step 2: Confirm this is a regression-guard test, not a red/green TDD test**

  Because Task 2 (executed first) already implements `GET /api/associates/me/rank-progress` and the investigation in this plan's header already confirmed no `SecurityConfig` matcher is needed for it, this test is expected to **pass immediately** — there is no production code left to write for it to turn green against. This is a deliberate exception to the usual red-then-green flow: its job is to catch a *future* regression (e.g. someone later adding an overly broad `hasAuthority("ADMIN")` matcher on `/api/associates/me/**`), not to drive new code today. To confirm it would actually catch that regression, temporarily add `.requestMatchers(HttpMethod.GET, "/api/associates/me/rank-progress").hasAuthority("ADMIN")` above the `anyRequest().authenticated()` line in `SecurityConfig.java`, rerun the test, confirm it now fails with `403`, then revert that temporary line.

  Run: `cd backend && mvn -q -pl . test -Dtest=SecurityConfigTest#associateMeRankProgressIsReachableByAnAssociateToken`
  Expected (with the temporary matcher in place): test **FAILS**, asserting `403` when `not(403)` was expected.

- [ ] **Step 3: Revert the temporary matcher — no production code change is part of this task**

  Remove the temporary `SecurityConfig.java` line added in Step 2. `git diff backend/src/main/java/com/plotchain/auth/SecurityConfig.java` must show zero changes once this task is complete.

- [ ] **Step 4: Run the test to verify it passes**

  Run: `cd backend && mvn -q -pl . test -Dtest=SecurityConfigTest`
  Expected: **BUILD SUCCESS**, `associateMeRankProgressIsReachableByAnAssociateToken` passes (along with every other pre-existing test in this file, unaffected).

- [ ] **Step 5: Commit**

  ```bash
  git add backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java
  git commit -m "test(auth): guard GET /api/associates/me/rank-progress stays reachable without ADMIN"
  ```

---

## Final verification

- [ ] Run the full backend test suite: `cd backend && mvn test`. Expect the same ~55 spurious JDK21/25-vs-Mockito failures documented in the `plotchain_jdk_mockito_env_issue` memory note (pre-existing, unrelated to this change) and otherwise a clean pass, including all tests added in Tasks 1-3.
  - **Special case**: `CompensationPlanServiceTest`'s `@BeforeEach setUp()` change (Task 1, Step 1) touches the constructor call used by *every* test in that class, not just the 4 new ones — a mistake there would show up as failures across the whole file, not just the new tests. Confirm the full `CompensationPlanServiceTest` class is green, not just the 4 new methods.
- [ ] Confirm `CompensationPlanController`'s three routes and their `SecurityConfig` matchers (`GET /api/company/compensation`, `GET /api/company/compensation/history`, `PUT /api/company/compensation`) are byte-for-byte unmodified — `git diff` should show zero changes to `CompensationPlanController.java` or the `SecurityConfig.java` lines matching those routes.
- [ ] Manually confirm the route naming: `GET /api/associates/me/rank-progress` — matches the `/api/associates/me/*` convention alongside `/api/associates/me/password`, `/api/associates/me/dashboard`, `/api/associates/me/sales`.
