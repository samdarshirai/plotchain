# Park Facing and Road Side plot types — design

## Intent

Today a plot is either Normal or Corner. Corner plots carry an Extra Price: the project's corner
default % (10% unless changed on the master project form) prefilled on the add-plot form, which
the admin can override. Park-facing and road-side plots also sell at a premium, so they need the
same treatment, and a corner plot can also face a park or a road, so those premiums stack.

## What gets built

### Plot types

A plot has exactly one type, picked from a single dropdown:

| Type (label)          | Enum value           | Default Extra %                        |
|-----------------------|----------------------|----------------------------------------|
| Normal                | `NORMAL`             | 0                                      |
| Corner                | `CORNER`             | project corner %                       |
| Park Facing           | `PARK_FACING`        | project park-facing %                  |
| Road Side             | `ROAD_SIDE`          | project road-side %                    |
| Corner + Park Facing  | `CORNER_PARK_FACING` | project corner % + project park-facing %  |
| Corner + Road Side    | `CORNER_ROAD_SIDE`   | project corner % + project road-side %    |

There is no Park Facing + Road Side combination (user confirmed six options).

"Stack" means the percentages are **added together** (Corner 10% + Park 5% = 15% of list price),
not compounded. The plot stores one `extra_percent`; the admin overrides the total, not each part.
*Builder note: this "add, don't compound" reading was played back to the user and accepted.*

### Project defaults

- Two new per-project defaults next to the corner %: **Park Facing extra %** and **Road Side extra %**,
  each defaulting to **5**, range 0–100, same validation as corner.
- Editable on the **master project form** (exactly like corner, user's requirement) and on the
  **setup wizard projects step**, which already has the corner field (my call, for consistency).
- Stored on the plot-side `project` table alongside `corner_extra_percent` (same pattern as
  `V71__extra_percent.sql` and `MasterProjectService`, which writes the corner % to the plot-side project).

### Add / edit plot form (`admin/projects-plots/plot-form.component.ts`)

- Type dropdown lists the six types above.
- Picking a type prefills Extra % with the default sum for that type (replacing today's
  `onTypeChange` which only knows CORNER). The admin can type over it.
- A hint under the box shows how the default was built, e.g. "Corner 10% + Park Facing 5%", then the
  existing "= extra price" amount.
- Editing an existing plot keeps its saved % until the admin changes the type (current behaviour).
- The setup wizard's plot type `<select>` gets the same six options.

### Grid / plot tile (`shared/components/plot-tile`)

- Status colours unchanged (colour = status).
- Corner keeps its clipped top-right corner (for both combinations too).
- Park Facing: Material Symbols `park` (tree) icon in the tile's top-right area.
- Road Side: Material Symbols `add_road` icon in the same place.
- Combination types show the corner clip plus the icon.
- The meta line's type label extends to the new types (e.g. "Park Facing", "Corner, Park").
- The projects-plots legend gets Park Facing and Road Side entries with their icons.
- Mockup: `.superpowers/brainstorm/*/content/plot-type-marks-v2.html` (not committed).
- Must pass the phone-width check (project rule).

### Backend

- New Flyway migration (next is `V72`):
  - add `project.park_facing_extra_percent` and `project.road_side_extra_percent`,
    `NUMERIC(5,2) NOT NULL DEFAULT 5`, CHECK 0–100;
  - widen `plot.plot_type` from `VARCHAR(8)` (too short for `CORNER_PARK_FACING`) and replace
    `chk_plot_type` with the six values.
- `PlotType` enum, `PlotRequest` `@Pattern`, `PlotCsvService.VALID_PLOT_TYPES` and its error message
  get the new values. CSV import accepts them (my call: so bulk uploads don't reject them); CSV
  still carries a flat extra price as today.
- `Project`, `ProjectRequest`/`ProjectResponse`, `MasterProjectRequest`/`MasterProjectResponse`,
  `ProjectService`, `MasterProjectService` carry the two new percents exactly as they carry
  `cornerExtraPercent` (null on update = keep current).
- Extra Price is still computed server-side from `extraPercent` in `PlotService.applyExtra`; defaults
  are still prefilled by the UI only (unchanged).

### Frontend models and text

- `PlotType` union in `setup/models/project.model.ts` and `plotType` in
  `plot-bookings/models/associate-booking-page.model.ts` gain the four new values.
- Project models gain `parkFacingExtraPercent` / `roadSideExtraPercent`.
- Labels in `en.json` and `hi.json` (Hindi text: builder's best translation).
- Anywhere that checks `=== 'CORNER'` to mean "is a corner plot" must also match the two corner
  combinations (tile clip, projects-plots corner badge, booking screens).

### Calls settled during review (my calls)

- **Sum over 100%:** keep the existing 0–100 cap (DB CHECK + form `validExtra`); a too-high prefill
  just shows the existing validation error.
- **Radios become a `<select>`:** the plot form uses radio buttons today; with six options it switches
  to a dropdown (also better at phone width).
- **Other screens:** no other frontend code checks `=== 'CORNER'`. EMI and cancelled-plot screens show
  the type through `admin.projectsPlots.type.*` i18n keys, so add the four new keys under both
  `admin.projectsPlots.type` and `plotTile.type`. The add-plot-emi CSV export keeps writing the raw enum.
- **Setup wizard plot form:** it has no Extra % field, so it only gets the six options and no prefill.

## Non-goals

- No Park Facing + Road Side or triple combination.
- No per-component override (one Extra % per plot).
- No server-side application of defaults for API-only clients.
- No retroactive repricing of existing plots; existing data stays NORMAL/CORNER.

## Left to the builder

- Exact icon size/placement within the tile, legend markup, hint wording.
- Test split, following the existing `PlotServiceTest`, `PlotCsvServiceTest`, `plot-form.component.spec.ts`,
  `plot-tile.component.spec.ts` patterns.
