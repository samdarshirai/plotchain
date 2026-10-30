# Park Facing and Road Side Plot Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Park Facing, Road Side, Corner + Park Facing and Corner + Road Side plot types, each with per-project default Extra % (park/road default 5) that stack additively with corner and are overridable per plot.

**Architecture:** Backend widens the plot-type enum/CHECK and adds two `project` percent columns carried exactly like `corner_extra_percent`. Frontend gets one shared helper that decomposes a `PlotType` into corner/park/road parts; the plot form, plot tile and legend all read it.

**Tech Stack:** Spring Boot + JPA + Flyway (Postgres; tests on H2 `MODE=PostgreSQL`), Angular standalone components, ngx-translate, Material Symbols.

**Spec:** `docs/superpowers/specs/2026-10-30-park-facing-road-side-plot-types-design.md`

## Global Constraints

- Enum values exactly: `NORMAL`, `CORNER`, `PARK_FACING`, `ROAD_SIDE`, `CORNER_PARK_FACING`, `CORNER_ROAD_SIDE`. No park+road combination.
- New project defaults: `parkFacingExtraPercent`, `roadSideExtraPercent`; DB default 5, range 0–100; null on request = keep current.
- Stacking is additive: default = sum of the type's parts' project percents. One `extraPercent` per plot.
- Extra % stays capped 0–100 (DB CHECK + form `validExtra`).
- Icons: Material Symbols `park` (Park Facing), `add_road` (Road Side). Status colours unchanged; corner keeps the clip, including on combos.
- Labels in both `en.json` and `hi.json`.
- Every UI change must pass the phone-width check (project rule).
- Backend `mvn test` may show ~55 spurious Mockito errors from a JDK 21/25 mismatch; judge only the named tests.

## Review Focus

1. Combined default above 100% (e.g. corner 98 + park 5): form must show the existing Extra % error, not submit. Test in Task 4.
2. Corner combos must behave as corner everywhere corner styling applies (clip, inset focus ring). Test in Task 5.
3. Master project update omitting the new percents must keep the stored values, not reset to 5. Test in Task 2.
4. Editing an existing plot must keep its saved % until the type changes. Test in Task 4.
5. CSV with an unknown combo like `PARK_ROAD` must be rejected. Test in Task 1.

---

### Task 1: Backend plot types (migration, enum, request, CSV)

**Files:**
- Create: `backend/src/main/resources/db/migration/V72__park_road_plot_types.sql`
- Modify: `backend/src/main/java/com/plotchain/projects/PlotType.java`
- Modify: `backend/src/main/java/com/plotchain/projects/PlotRequest.java:17`
- Modify: `backend/src/main/java/com/plotchain/projects/PlotCsvService.java:32,110`
- Test: `backend/src/test/java/com/plotchain/projects/PlotRepositoryTest.java`, `PlotCsvServiceTest.java`, `PlotServiceTest.java`

**Interfaces:**
- Produces: `enum PlotType { NORMAL, CORNER, PARK_FACING, ROAD_SIDE, CORNER_PARK_FACING, CORNER_ROAD_SIDE }`; DB columns `project.park_facing_extra_percent`, `project.road_side_extra_percent` (used by Task 2).

- [ ] **Step 1: Write failing tests**
  - `PlotRepositoryTest.savesACornerParkFacingPlot`: persist a plot with `PlotType.CORNER_PARK_FACING`, flush, reload; type equals `CORNER_PARK_FACING`.
  - `PlotCsvServiceTest.validateAcceptsTheNewPlotTypes`: rows with `PARK_FACING`, `ROAD_SIDE`, `CORNER_PARK_FACING`, `CORNER_ROAD_SIDE` give zero errors.
  - `PlotCsvServiceTest.validateRejectsParkRoadCombination`: row with `PARK_ROAD` gives one error on field `plot_type`.
  - `PlotServiceTest.createAcceptsRoadSideWithExtraPercent`: `new PlotRequest("A-102","ROAD_SIDE",1200,500,600000,null,null,null,new BigDecimal("5"))` saves type `ROAD_SIDE` and extra price `30000.00`.

- [ ] **Step 2: Run, expect FAIL**
  Run: `cd backend && mvn -q test -Dtest='PlotRepositoryTest,PlotCsvServiceTest,PlotServiceTest'`
  Expected: new tests fail (unknown enum constant / CHECK violation / VARCHAR too long).

- [ ] **Step 3: Implement**
  - V72: add both project columns `NUMERIC(5,2) NOT NULL DEFAULT 5` with CHECKs `chk_project_park_facing_extra_percent` / `chk_project_road_side_extra_percent` `BETWEEN 0 AND 100` (copy V71's shape); `ALTER TABLE plot ALTER COLUMN plot_type TYPE VARCHAR(20)`; drop `chk_plot_type` and re-add it with the six values. Must run on both Postgres and H2 PostgreSQL mode, so keep plain `ALTER TABLE ... ALTER COLUMN ... TYPE` / `DROP CONSTRAINT` syntax. Header comment in V71's style.
  - Extend `PlotType`; `PlotRequest` `@Pattern` to the six values; `VALID_PLOT_TYPES` to the six; error message lists them.
  - Add `@Column` fields to `Project.java` for the two columns now (default `new BigDecimal("5.00")`, null-ignoring setters like `setCornerExtraPercent`), since `ddl-auto: validate` does not care about extra columns but Task 2 relies on them.

- [ ] **Step 4: Run, expect PASS** (same command).

- [ ] **Step 5: Commit** `feat(plots): add park-facing and road-side plot types`

### Task 2: Backend project defaults (project + master project)

**Files:**
- Modify: `backend/src/main/java/com/plotchain/projects/{ProjectRequest,ProjectResponse,ProjectService}.java`
- Modify: `backend/src/main/java/com/plotchain/masterproject/{MasterProjectRequest,MasterProjectResponse,MasterProjectService}.java`
- Test: `backend/src/test/java/com/plotchain/projects/ProjectServiceTest.java`, `backend/src/test/java/com/plotchain/masterproject/MasterProjectServiceTest.java`

**Interfaces:**
- Consumes: `Project.get/setParkFacingExtraPercent`, `get/setRoadSideExtraPercent` (Task 1).
- Produces (JSON fields read by Task 3): `parkFacingExtraPercent`, `roadSideExtraPercent` on project and master-project request/response, next to `cornerExtraPercent`.
  - `ProjectRequest(name, location, cornerExtraPercent, parkFacingExtraPercent, roadSideExtraPercent)`; keep the existing 2-arg constructor and add a 3-arg one so current callers compile.
  - `MasterProjectRequest` gains the two fields after `cornerExtraPercent` (same `@DecimalMin/@DecimalMax`); keep the 7-arg constructor, add an 8-arg one.
  - `MasterProjectResponse.of(MasterProject p, Project plotSide)` replaces `of(p, cornerExtraPercent)`; `plotSide` may be null (all three percents null then). `list()` maps id to `Project` instead of id to corner %.

- [ ] **Step 1: Write failing tests**
  - `ProjectServiceTest.createStoresParkAndRoadDefaults`: request with 10/7/6 gives response `parkFacingExtraPercent` 7, `roadSideExtraPercent` 6.
  - `ProjectServiceTest.createDefaultsParkAndRoadToFive`: 2-arg request gives 5.00/5.00.
  - `MasterProjectServiceTest.createCarriesParkAndRoadDefaultsToPlotSide`: saved plot-side `Project` has 7/6; response echoes them.
  - `MasterProjectServiceTest.updateWithoutParkAndRoadKeepsCurrentValues`: plot side at 7/6, update via 7-arg request leaves 7/6.

- [ ] **Step 2: Run, expect FAIL**
  Run: `cd backend && mvn -q test -Dtest='ProjectServiceTest,MasterProjectServiceTest'`

- [ ] **Step 3: Implement** by mirroring every `cornerExtraPercent` line in the six files.

- [ ] **Step 4: Run, expect PASS**; then `mvn -q test -Dtest='Project*Test,MasterProject*Test,Plot*Test'` to catch controller JSON tests.

- [ ] **Step 5: Commit** `feat(projects): per-project park-facing and road-side extra % defaults`

### Task 3: Frontend types, shared helper, i18n, project defaults on forms

**Files:**
- Modify: `frontend/src/app/setup/models/project.model.ts`
- Modify: `frontend/src/app/plot-bookings/models/associate-booking-page.model.ts:40`
- Modify: `frontend/src/app/shared/utils/plot-grid.util.ts` + `plot-grid.util.spec.ts`
- Modify: `frontend/src/app/admin/master-projects/master-projects.{component,service}.ts`
- Modify: `frontend/src/app/setup/steps/projects/projects-step.component.ts` + spec
- Modify: `frontend/src/assets/i18n/en.json`, `hi.json`

**Interfaces:**
- Produces:
  - `export type PlotType = 'NORMAL' | 'CORNER' | 'PARK_FACING' | 'ROAD_SIDE' | 'CORNER_PARK_FACING' | 'CORNER_ROAD_SIDE';` and `export const PLOT_TYPES: PlotType[]` (that order) in `project.model.ts`; booking model's `plotType` uses `PlotType | null`.
  - `Project` / `ProjectRequest` / master-project model gain optional `parkFacingExtraPercent?: number; roadSideExtraPercent?: number`.
  - In `plot-grid.util.ts`:
    - `export function plotTypeParts(t: PlotType): { corner: boolean; park: boolean; road: boolean }`
    - `export interface ExtraDefaults { corner: number; parkFacing: number; roadSide: number }`
    - `export function defaultExtraPercent(t: PlotType, d: ExtraDefaults): number` (sum of the parts' percents).
  - i18n: under both `admin.projectsPlots.type` and `plotTile.type` add `PARK_FACING: "Park Facing"`, `ROAD_SIDE: "Road Side"`, `CORNER_PARK_FACING: "Corner + Park Facing"`, `CORNER_ROAD_SIDE: "Corner + Road Side"`; `plotTile.park: "Park Facing"`, `plotTile.road: "Road Side"`; `admin.projectsPlots.parkNote` / `roadNote` (legend); `admin.masterProjects.parkFacingExtra` / `roadSideExtra` ("Park facing plot extra % (default)", "Road side plot extra % (default)"); `setup.projects.parkFacingExtraLabel` / `roadSideExtraLabel`; `setup.projects.plotType<X>Label` for the four new types. Change `extraPercentHint` to "Extra Price = this % of the plot price. Defaults from the project's %s for this type; change per plot."

- [ ] **Step 1: Write failing tests**
  - `plot-grid.util.spec.ts`: `plotTypeParts('CORNER_ROAD_SIDE')` equals `{ corner: true, park: false, road: true }`; `plotTypeParts('NORMAL')` all false; `defaultExtraPercent('CORNER_PARK_FACING', {corner:10, parkFacing:5, roadSide:5})` is 15; `('ROAD_SIDE', …)` is 5; `('NORMAL', …)` is 0.
  - `projects-step.component.spec.ts`: update the existing add-project test so `setValue` includes `parkFacingExtraPercent: 5, roadSideExtraPercent: 5` and the request body carries them; add a test that the plot-type `<select>` renders six `<option>`s.

- [ ] **Step 2: Run, expect FAIL**
  Run: `cd frontend && npx ng test --watch=false --include='**/plot-grid.util.spec.ts' --include='**/projects-step.component.spec.ts'`

- [ ] **Step 3: Implement**: the types, helper and i18n above. Master project form and setup projects step: two number inputs next to the corner one, form controls `parkFacingExtraPercent` / `roadSideExtraPercent` default 5 with `Validators.min(0), Validators.max(100)`, patched from the project like corner, plus `labels` entries in master-projects. Setup plot `<select>` iterates `PLOT_TYPES`; its label function (line ~397) uses `setup.projects.plotType<X>Label` for every type.

- [ ] **Step 4: Run, expect PASS** (same command), then `npx ng build` to catch the widened union.

- [ ] **Step 5: Commit** `feat(plots): plot type helper, labels and park/road defaults on project forms`

### Task 4: Plot form: dropdown and stacked default

**Files:**
- Modify: `frontend/src/app/admin/projects-plots/plot-form.component.ts`
- Modify: `frontend/src/app/admin/projects-plots/projects-plots.component.ts:259`
- Test: `frontend/src/app/admin/projects-plots/plot-form.component.spec.ts`

**Interfaces:**
- Consumes: `PLOT_TYPES`, `defaultExtraPercent`, `plotTypeParts`, `ExtraDefaults` (Task 3).
- Produces: `@Input() extraDefaults: ExtraDefaults = { corner: 10, parkFacing: 5, roadSide: 5 }` replacing `@Input() cornerExtraPercent`. `projects-plots` passes `{ corner: p?.cornerExtraPercent ?? 10, parkFacing: p?.parkFacingExtraPercent ?? 5, roadSide: p?.roadSideExtraPercent ?? 5 }` for `selectedProject`.

- [ ] **Step 1: Write failing tests**
  - `prefills the stacked default when Corner + Park Facing is picked`: defaults 10/5/5, select `CORNER_PARK_FACING`; Extra % input is 15 and hint text contains "Corner 10%" and "Park Facing 5%".
  - `prefills 0 for Normal and the road default for Road Side`.
  - `keeps a typed override until the type changes`: pick Corner (10), type 12, submit; request `extraPercent` 12.
  - `blocks submit when the stacked default exceeds 100`: defaults 98/5/5, pick `CORNER_PARK_FACING`, submit; nothing emitted, Extra % error shown.
  - `keeps an edited plot's saved percent until its type changes`: edit a `PARK_FACING` plot saved at 8 with defaults 10/5/5; input shows 8.
  - Update existing specs that click the type radios to use the `<select>`.

- [ ] **Step 2: Run, expect FAIL**
  Run: `cd frontend && npx ng test --watch=false --include='**/plot-form.component.spec.ts'`

- [ ] **Step 3: Implement**: replace the radio fieldset with a labelled `<select name="plotType">` over `PLOT_TYPES`; `onTypeChange(t)` sets `extraPercent = defaultExtraPercent(t, this.extraDefaults)`; `ngOnChanges` re-runs it for a new plot when `extraDefaults` changes (as it does for `cornerExtraPercent` today). Hint: when the type has parts, list them as "<label> <n>%" joined by " + " before the existing "= extra price".

- [ ] **Step 4: Run, expect PASS**; also run `projects-plots.component.spec.ts` if it exists.

- [ ] **Step 5: Commit** `feat(plots): six plot types with stacked extra % on the plot form`

### Task 5: Plot tile icons and legend

**Files:**
- Modify: `frontend/src/app/shared/components/plot-tile/plot-tile.component.ts` + spec
- Modify: `frontend/src/app/admin/projects-plots/projects-plots.component.ts:158-166` (legend)
- Modify: `frontend/src/styles/_shared-components.scss` (`.plot-tile`), `frontend/src/styles/_admin.scss` (`.projects-plots__swatch` / legend icons)

**Interfaces:**
- Consumes: `plotTypeParts` (Task 3).

- [ ] **Step 1: Write failing tests** (`plot-tile.component.spec.ts`)
  - `marks a Corner + Park Facing tile as corner and shows the park icon`: host has class `plot-tile--corner` and an icon element with text `park`.
  - `shows the add_road icon for Road Side and no corner class`.
  - `shows the type icon in the plan variant too`.
  - `corner combo tile draws the focus ring inset`: same check as the existing corner focus-ring test, using `CORNER_ROAD_SIDE`.
  - Meta line for non-plan `PARK_FACING` contains "Park Facing".

- [ ] **Step 2: Run, expect FAIL**
  Run: `cd frontend && npx ng test --watch=false --include='**/plot-tile.component.spec.ts'`

- [ ] **Step 3: Implement**: `get parts()` from `plotTypeParts(type)`; `[class.plot-tile--corner]="parts.corner"`; a `material-symbols-outlined plot-tile__type-icon` span (`aria-hidden`; the aria-label already names the type via `plotTile.type.*`) in both faces, shown when `parts.park` / `parts.road`; the non-plan meta line lists corner/park/road labels joined by ", ". The legend gets park and road entries using the same icons. The icon sits top-right, inside the corner clip so it is not cut off.

- [ ] **Step 4: Run, expect PASS**; then the phone-width check: run the app (the `run` skill), open admin Projects & Plots and the associate availability grid at 375px, and confirm the icons and legend don't overflow.

- [ ] **Step 5: Commit** `feat(plots): park and road icons on plot tiles and legend`
