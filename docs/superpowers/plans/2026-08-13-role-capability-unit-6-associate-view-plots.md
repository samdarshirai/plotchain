# Role Capability Unit 6: Associate Can View Available Plots — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an authenticated Associate `GET` the plot/project catalog — project list, project detail, plots-under-a-project list, plot detail — which today 403s for an Associate token, contradicting the data-visibility matrix's "View available plots" grant. Thumbnail image and the CSV import template stay `ADMIN`-only. No write route changes.

**Architecture:** Pure `SecurityConfig` authorization-rule change: split the single admin-family-only `GET` matcher covering six project/plot paths into two `requestMatchers(...)` calls — four paths become `.authenticated()` (any logged-in Associate or Admin), two stay `.hasAuthority("ADMIN")`. No controller, service, or repository code changes — `ProjectController`/`PlotController` already have no role checks of their own; the 403 today comes entirely from `SecurityConfig`. Backed by `SecurityConfigTest`, which drives the real Spring Security filter chain via `MockMvc` (not a standalone/mocked setup), so it is the only test class that can actually catch a matcher-ordering or authority regression here.

**Tech Stack:** Spring Boot (Java), Spring Security (`requestMatchers`/`authorizeHttpRequests`, JWT bearer auth via `JwtAuthenticationFilter`), JUnit 5 + `@SpringBootTest` + `@AutoConfigureMockMvc` + `MockMvc`, Maven.

**Spec:** `docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md` — "Data visibility matrix" (`Plot / project inventory` row, line 38) and "Reconciliation & gap-fill" (`Plot/project inventory` row, line 89). This unit implements only the Associate "View available plots" half of that row; `PlotBooking`/`EMISchedule` (own bookings + EMI schedule) is unit 7, out of scope here.

## Global Constraints

- Only these four `GET` paths become associate-reachable: `/api/company/projects`, `/api/company/projects/*`, `/api/company/projects/*/plots`, `/api/company/projects/*/plots/*`. Everything else in the current admin-only matcher — `/api/company/projects/*/thumbnail`, `/api/company/projects/plots/csv-template` — stays `.hasAuthority("ADMIN")`.
- No write route (`POST`/`PUT`/`PATCH`/`DELETE` on any `/api/company/projects/**` path, including thumbnail upload and CSV validate/commit) changes at all — they are already covered by the blanket `POST`/`PUT`/`PATCH`/`DELETE` `/api/**` → `ADMIN` rules elsewhere in `SecurityConfig.java` and this unit does not touch those lines.
- Do not widen the matcher to `.permitAll()` or touch anything above/below it in the filter chain — only the one matcher block changes, in place, same position in the chain.
- `AssociateRole` is `ADMIN`/`ASSOCIATE` only (unit 1, merged `857a27d..5befd78`) — write and run tests against these two roles only. Do not introduce or rely on `SUPER_ADMIN`/`FINANCE`/`KYC_REVIEWER`/`SUPPORT`.
- Follow this codebase's existing `SecurityConfigTest` conventions exactly: a plain `@Test` asserting `.isForbidden()`/`.isOk()`/`.isNotFound()` for the single-role (Associate-only) cases, matching the file's existing paired `xIsForbiddenForAnAssociateToken` / `xIsReachableForAnyAdminFamilyToken` style (the latter still using `@ParameterizedTest @EnumSource(value = AssociateRole.class, names = "ASSOCIATE", mode = EnumSource.Mode.EXCLUDE)`, kept even though only `ADMIN` remains in that exclusion set today — this is the established naming/shape in this file, e.g. `projectsIsReachableForAnyAdminFamilyToken` itself, and changing it is out of scope for this unit).

## Investigation summary (context for the implementer — not steps to redo)

- **Current `SecurityConfig.java` state, read directly** (`backend/src/main/java/com/plotchain/auth/SecurityConfig.java:171-175`): the matcher is
  ```java
  .requestMatchers(HttpMethod.GET,
          "/api/company/projects", "/api/company/projects/*",
          "/api/company/projects/*/plots", "/api/company/projects/*/plots/*",
          "/api/company/projects/*/thumbnail", "/api/company/projects/plots/csv-template")
      .hasAuthority("ADMIN")
  ```
  six paths, one `requestMatchers(...)` call, exactly as the reference plan (`docs/superpowers/plans/2026-08-03-role-model-collapse.md` Task 6) quotes it — the literal path list has **not** drifted. (The reference plan's prose says "covers seven paths" right above that same six-path snippet — an internal inconsistency in the reference plan itself, not something to carry forward.) Line numbers have drifted (reference plan says "originally lines 116-120"; actual current position is 171-175) — expected, the file has grown to ~20 matchers since 2026-08-03 from other units' work; don't rely on either number without re-reading the file.
- **Route-to-controller mapping confirmed by direct read**, so the matcher's four "browse" paths and two "back-office" paths are known to map onto real, existing endpoints with no spelling mismatch:
  - `GET /api/company/projects` → `ProjectController.list()` (`backend/src/main/java/com/plotchain/projects/ProjectController.java:34-37`)
  - `GET /api/company/projects/{id}` → `ProjectController.get()` (same file, lines 39-42) — throws `ProjectNotFoundException` → `404` (mapped by `ProjectsExceptionHandler`) when the id doesn't exist.
  - `GET /api/company/projects/{projectId}/plots` → `PlotController.list()` (`backend/src/main/java/com/plotchain/projects/PlotController.java:29-34`) — `PlotService.list()` does **not** check the project exists first; an unknown `projectId` returns `200` with an empty page, not a `404`.
  - `GET /api/company/projects/{projectId}/plots/{plotId}` → `PlotController.get()` (same file, lines 36-39) — throws `PlotNotFoundException` → `404` when the plot doesn't exist.
  - `GET /api/company/projects/{id}/thumbnail` → `ProjectController.getThumbnail()` (`ProjectController.java:69-77`) — the back-office thumbnail-bytes read, staying `ADMIN`-only per this unit's acceptance criteria (distinct from `POST .../thumbnail`, the upload, which is already `ADMIN`-only via the blanket `POST` rule and is untouched either way).
  - `GET /api/company/projects/plots/csv-template` → `PlotCsvController.csvTemplate()` (`backend/src/main/java/com/plotchain/projects/PlotCsvController.java:27-32`, class-level `@RequestMapping("/api/company/projects")` + method-level `/plots/csv-template`) — no DB lookup, always returns `200` with generated CSV bytes for any authorized caller.
- **`SecurityConfigTest.java` state, read directly** (`backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`): `projectsIsForbiddenForAnAssociateToken` (lines 221-226) and `projectsIsReachableForAnyAdminFamilyToken` (lines 231-237) both exist exactly as the reference plan describes — not drifted. There are currently **zero** tests in this file for the thumbnail or CSV-template routes (confirmed by grep — neither string appears anywhere else in the file), so this unit is also closing a pre-existing coverage gap on the routes it's keeping `ADMIN`-only, not just adding coverage for the ones it's opening up.
- **Pre-existing, out-of-scope breakage found in this same file, noted so it isn't mistaken for a regression this unit caused**: `createAdminPassesTheSecurityLayerForAdminOrSuperAdminTokens` (line 260, `@EnumSource(..., names = {"ADMIN", "SUPER_ADMIN"})`) and `createAdminIsForbiddenForNonAdminTokens` (line 272, `names = {"FINANCE", "KYC_REVIEWER", "SUPPORT", "ASSOCIATE"}`) reference `AssociateRole` enum constants (`SUPER_ADMIN`, `FINANCE`, `KYC_REVIEWER`, `SUPPORT`) that no longer exist — `AssociateRole` was collapsed to `ADMIN`/`ASSOCIATE` only by unit 1 (`857a27d`), but these two test methods (and a stale comment at line 405) were never updated. `@EnumSource(names = ...)` validates the given names against the actual enum at test-execution time, so both methods are expected to already be failing on `master`, independent of anything in this plan — they live nowhere near the matcher or tests this unit touches (`POST /api/company/admins`, not any `/api/company/projects/**` path). Do not attempt to fix them as part of this unit; if the full `SecurityConfigTest` suite is run for verification, expect these two as pre-existing red, not new failures.

---

### Task 1: Split the projects/plots `GET` matcher so Associates can browse the catalog

**Files:**
- Modify: `backend/src/main/java/com/plotchain/auth/SecurityConfig.java` (lines 171-175 as of this writing — re-read the file before editing to confirm the matcher hasn't moved)
- Modify: `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java` (lines 221-237 as of this writing)

**Interfaces:**
- Consumes: `AssociateRole.ADMIN` / `AssociateRole.ASSOCIATE` (existing enum, unchanged); `SecurityConfigTest.tokenFor(AssociateRole role): String` (existing test helper, unchanged).
- Produces: `GET /api/company/projects`, `GET /api/company/projects/{id}`, `GET /api/company/projects/{projectId}/plots`, `GET /api/company/projects/{projectId}/plots/{plotId}` now pass Spring Security's authorization layer for any authenticated token (`ADMIN` or `ASSOCIATE`). `GET /api/company/projects/{id}/thumbnail` and `GET /api/company/projects/plots/csv-template` continue to require `hasAuthority("ADMIN")`, unchanged in effect, now with direct test coverage.

- [ ] **Step 1: Write the failing/updated tests**

  Open `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`. Replace the existing `projectsIsForbiddenForAnAssociateToken` test (currently lines 221-226 — its `.isForbidden()` assertion is now wrong, since this unit makes the route associate-reachable) with the block below. Leave `projectsIsReachableForAnyAdminFamilyToken` (the test directly after it) exactly as-is — still correct, ADMIN could always reach this route and still can.

  ```java
      @Test
      void projectsIsReachableForAnAssociateToken() throws Exception {
          mockMvc.perform(get("/api/company/projects")
                  .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
              .andExpect(status().isOk());
      }

      // ProjectRepository is not @MockBean'd in this class (same "real H2, unseeded" reasoning
      // as projectsIsReachableForAnyAdminFamilyToken above), so a random project id is a genuine
      // miss: ProjectService.get() throws ProjectNotFoundException, mapped by
      // ProjectsExceptionHandler to 404. Asserting the precise 404 (not just "not 403") proves
      // the request passed the security layer via the new .authenticated() matcher rather than
      // happening to land on some other non-403 status.
      @Test
      void projectDetailIsReachableForAnAssociateToken() throws Exception {
          mockMvc.perform(get("/api/company/projects/" + UUID.randomUUID())
                  .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
              .andExpect(status().isNotFound());
      }

      // PlotRepository is not @MockBean'd either, and PlotService.list() never checks the
      // project exists before querying -- an unknown projectId yields a real, empty page (200),
      // not a 404. Asserting the precise 200 proves the request passed the security layer.
      @Test
      void projectPlotsListIsReachableForAnAssociateToken() throws Exception {
          mockMvc.perform(get("/api/company/projects/" + UUID.randomUUID() + "/plots")
                  .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
              .andExpect(status().isOk());
      }

      // Unlike the plots list above, PlotService.get() does look the plot up and throws
      // PlotNotFoundException (404) when it's missing -- same reasoning as
      // projectDetailIsReachableForAnAssociateToken.
      @Test
      void plotDetailIsReachableForAnAssociateToken() throws Exception {
          mockMvc.perform(get("/api/company/projects/" + UUID.randomUUID() + "/plots/" + UUID.randomUUID())
                  .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
              .andExpect(status().isNotFound());
      }

      // Thumbnail bytes and the CSV import template are back-office affordances, not part of
      // what the data-visibility matrix's "View available plots" grants an Associate -- these
      // two routes stay ADMIN-only. No test for either existed in this file before this unit.
      @Test
      void projectThumbnailIsForbiddenForAnAssociateToken() throws Exception {
          mockMvc.perform(get("/api/company/projects/" + UUID.randomUUID() + "/thumbnail")
                  .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
              .andExpect(status().isForbidden());
      }

      // ProjectService.getThumbnail() also throws ProjectNotFoundException for an unknown id,
      // but that's a 404 from ProjectsExceptionHandler -- an ADMIN token must get PAST the
      // security layer first to ever see it, so 404 (not 403) is what proves this matcher still
      // grants ADMIN access after the split.
      @ParameterizedTest
      @EnumSource(value = AssociateRole.class, names = "ASSOCIATE", mode = EnumSource.Mode.EXCLUDE)
      void projectThumbnailIsReachableForAnyAdminFamilyToken(AssociateRole role) throws Exception {
          mockMvc.perform(get("/api/company/projects/" + UUID.randomUUID() + "/thumbnail")
                  .header("Authorization", "Bearer " + tokenFor(role)))
              .andExpect(status().isNotFound());
      }

      @Test
      void csvTemplateIsForbiddenForAnAssociateToken() throws Exception {
          mockMvc.perform(get("/api/company/projects/plots/csv-template")
                  .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
              .andExpect(status().isForbidden());
      }

      // PlotCsvController.csvTemplate() does no DB lookup -- it always returns 200 with
      // generated CSV bytes, so an ADMIN token reaching 200 (not 404, unlike the thumbnail
      // case above) is the correct proof this matcher still grants ADMIN access.
      @ParameterizedTest
      @EnumSource(value = AssociateRole.class, names = "ASSOCIATE", mode = EnumSource.Mode.EXCLUDE)
      void csvTemplateIsReachableForAnyAdminFamilyToken(AssociateRole role) throws Exception {
          mockMvc.perform(get("/api/company/projects/plots/csv-template")
                  .header("Authorization", "Bearer " + tokenFor(role)))
              .andExpect(status().isOk());
      }
  ```

  No new imports are needed — `UUID`, `AssociateRole`, `ParameterizedTest`, and `EnumSource` are all already imported in this file.

- [ ] **Step 2: Run the tests to see the expected failures**

  Run: `cd backend && ./mvnw test -Dtest=SecurityConfigTest`

  Expected: `projectsIsReachableForAnAssociateToken`, `projectDetailIsReachableForAnAssociateToken`, and `projectPlotsListIsReachableForAnAssociateToken`/`plotDetailIsReachableForAnAssociateToken` FAIL with `403` where `200`/`404` was expected (the matcher still says `ADMIN`-only). `projectThumbnailIsForbiddenForAnAssociateToken`, `csvTemplateIsForbiddenForAnAssociateToken`, `projectThumbnailIsReachableForAnyAdminFamilyToken`, `csvTemplateIsReachableForAnyAdminFamilyToken` PASS already (the matcher already grants exactly this behavior — these are new coverage for existing, correct behavior, not new behavior). `createAdminPassesTheSecurityLayerForAdminOrSuperAdminTokens` and `createAdminIsForbiddenForNonAdminTokens` FAIL too — pre-existing, unrelated (see Investigation summary above); do not try to fix them here.

- [ ] **Step 3: Split the matcher in `SecurityConfig.java`**

  In `backend/src/main/java/com/plotchain/auth/SecurityConfig.java`, find the matcher block (re-read the file first — line numbers may have shifted):

  ```java
                  // Same reasoning as setup-state/profile/branding/compensation/payments above:
                  // Phase 9's Projects & Plots GETs stay admin-family-only. Their POST/PUT/DELETE
                  // (including the CSV validate/commit endpoints, which are POSTs) are writes,
                  // already covered by the blanket write rules above -- deliberately no separate
                  // matchers for them.
                  .requestMatchers(HttpMethod.GET,
                          "/api/company/projects", "/api/company/projects/*",
                          "/api/company/projects/*/plots", "/api/company/projects/*/plots/*",
                          "/api/company/projects/*/thumbnail", "/api/company/projects/plots/csv-template")
                      .hasAuthority("ADMIN")
  ```

  Replace it with:

  ```java
                  // Role-capability unit 6
                  // (docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md,
                  // "Plot / project inventory" row): the matrix grants an Associate "View
                  // available plots" -- project/plot listing and detail reads are now
                  // associate-reachable. Split out of the admin-family-only block these four
                  // paths used to share with thumbnail/CSV-template: those two stay ADMIN-only
                  // directly below, since they're back-office affordances (image asset, bulk
                  // import file), not part of what an Associate browses.
                  .requestMatchers(HttpMethod.GET,
                          "/api/company/projects", "/api/company/projects/*",
                          "/api/company/projects/*/plots", "/api/company/projects/*/plots/*")
                      .authenticated()
                  .requestMatchers(HttpMethod.GET,
                          "/api/company/projects/*/thumbnail", "/api/company/projects/plots/csv-template")
                      .hasAuthority("ADMIN")
  ```

  Both new matchers stay in the exact same position in the `.authorizeHttpRequests(...)` chain that the original single matcher occupied (above `anyRequest().authenticated()`, alongside the other admin-family GET matchers). Ordering between the two new matchers relative to each other doesn't matter: `/api/company/projects/*` (a single-segment Ant wildcard) does not match `/api/company/projects/{id}/thumbnail` (two additional segments), so there's no first-match-wins collision between them.

- [ ] **Step 4: Run the tests to confirm they pass**

  Run: `cd backend && ./mvnw test -Dtest=SecurityConfigTest`

  Expected: every test added/changed in Step 1 PASSES. `createAdminPassesTheSecurityLayerForAdminOrSuperAdminTokens` and `createAdminIsForbiddenForNonAdminTokens` remain the same pre-existing failures as before Step 3 (unchanged by this matcher edit — confirms this unit didn't touch their cause). If any *other* test in this file newly fails, stop and investigate before proceeding — that would mean the matcher split affected a route it shouldn't have.

- [ ] **Step 5: Run the full backend test suite for a broader regression check**

  Run: `cd backend && ./mvnw test`

  Expected: no new failures beyond `SecurityConfigTest`'s two pre-existing ones from Step 4 and whatever the JDK21/25 + Mockito/ByteBuddy environment issue already produces on `master` (see the `plotchain_jdk_mockito_env_issue` memory note — ~55 spurious errors, unrelated to any code change, from mocking concrete classes on this JDK). Do not chase either category down as part of this unit.

- [ ] **Step 6: Commit**

  ```bash
  git add backend/src/main/java/com/plotchain/auth/SecurityConfig.java \
          backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java
  git commit -m "fix(auth): let associates read the project/plot catalog

  Splits the admin-family-only GET matcher for /api/company/projects/**
  so project/plot listing and detail reads are associate-reachable,
  matching the data-visibility matrix's \"View available plots\" grant
  (role-capability unit 6). Thumbnail and the CSV import template stay
  ADMIN-only."
  ```

---

## Self-review notes

- **Spec coverage**: the spec's "Plot / project inventory" row's Associate half ("View available plots") is fully covered — all four browse routes (project list/detail, plot list/detail) become associate-reachable; the Admin half (full CRUD) is untouched, verified by the unchanged blanket write rules and the two new `AnyAdminFamilyToken` reachability tests on the routes staying `ADMIN`-only. Bookings/EMI (the other half of the Associate row) is explicitly out of scope (unit 7).
- **Placeholder scan**: no TBD/TODO; every step has literal code, not a description of code.
- **Type/name consistency**: `tokenFor(AssociateRole role): String`, `AssociateRole.ADMIN`/`ASSOCIATE` — all used exactly as already defined in `SecurityConfigTest.java`; no new types introduced by this unit.
