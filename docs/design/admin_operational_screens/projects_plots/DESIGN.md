---
name: Projects & Plots (Admin Operational Screen, plot-booking-lifecycle unit 11)
tokens:
  colors:
    surface-page: var(--surface-page)       # #f8f9ff (sibling-mock value)
    surface-card: var(--surface-card)       # #ffffff
    surface-raised: var(--surface-raised)   # #eff4ff
    border-subtle: var(--border-subtle)     # #c2c6d9
    text-primary: var(--text-primary)       # #0b1c30
    text-muted: var(--text-muted)           # #424656
    brand-primary: var(--brand-primary)     # #7C3AED
    brand-secondary: var(--brand-secondary) # #22D3EE
    brand-gradient: var(--brand-gradient)
    brand-primary-soft: var(--brand-primary-soft)
    status-success: var(--status-success)   # AVAILABLE
    status-warning: var(--status-warning)   # BOOKED
    status-danger: var(--status-danger)     # errors only, never a plot status
  typography:
    eyebrow: "'JetBrains Mono' 0.8125rem/500/uppercase/0.02em, brand-primary"
    operational-title: "'Geist' 1.75rem/600/-0.01em"
    section-title: "'Geist' 1.25rem/600 (project name), 1.125rem (aside)"
    field-label: "'JetBrains Mono' 0.6875rem/500/uppercase/0.04em, text-muted"
    body: "'Inter' 0.875-0.9375rem/400"
    ledger-data: "'JetBrains Mono' 600, tabular-nums (plot no., price, area, counts, installments)"
  radius: {card: 20px, panel: 16px, tile: 10px, control: 8px, pill: 999px}
  shadow: {card: "0 4px 20px -2px rgba(0,0,0,0.08)"}
---

## Purpose

Admin operational screen to see per-project plot availability at a glance, maintain projects and plots, and book an AVAILABLE plot for an associate's buyer (spec "Screens", unit 11). It is a new operational screen, not the setup-wizard step of the same name (see Decisions 1).

Files: `code.html` (static mock; inline JS only switches mock states, plot grid is pre-rendered), `screen.png` (default state, 1440px), `screen-booking-form.png` (book form with blank-buyerName 400). Open `code.html#<state>` (states: default, booked, editbooked, book, book400, booksubmit, book409, bookok, editplot, newplot, newproject, csv, loading, emptyproject, noprojects; add `&shot` to hide the mock state bar).

## Token drift (read first; decided, see Decisions 12)

The sibling mocks (sales_register etc.) use the violet/cyan values above. The live `frontend/src/styles/_tokens.scss` is now the Viraj Acres "Legacy Living" theme (Antique Gold `#C6A227`, Oxblood, Parchment `#F7F2E7`, status-success `#4B7A52`, status-warning `#B4790E`, status-danger `#B23B32`, Fraunces/IBM Plex Mono). Per the brief this mock follows the sibling values and fonts (Geist/Inter/JetBrains Mono). Every colour in the CSS is a `var(--token)`. The user chose the violet siblings (Decision 12); the live tokens file differs, so port the tokens deliberately or confirm at build time rather than silently inheriting the live theme. The sidebar uses the live ink chrome tokens (`--ink`, `--nav-*`). Status text colours `#146c43` (available) and `#8a5a00` (booked) are darkened text-only shades for 4.5:1 contrast on the tints; with the live theme re-derive with `color-mix(in srgb, var(--status-*) 55%, black)` instead of hard-coding.

## Layout / regions (desktop >= 1280px)

```
sidebar 248 | page header (eyebrow, H1, subtitle)                       [Add project]
            | (a) Projects 272 | (b) project header + legend/grid  | (c/d) aside 352
            |   list (master)  |   [Edit project][Import CSV][Add plot]  detail OR form
            |                  |   legend chips w/ counts                (sticky)
            |                  |   Block A / B / C plot grids
```

- (a) Project list: button rows (name, location, mini 3-segment status bar, "36 plots · 24 available"). Selected row: raised surface, brand-primary border + left bar. Source order and `aria-current`.
- (b) Header with project actions; legend doubles as the status filter (toggle chips, `aria-pressed`, each shows count); grid grouped by block.
- Signature element: plot tiles read like a survey plan. Corner plots have a notched top-right corner; SOLD tiles are hatched with a dashed border; each tile carries plot no. (mono), area, price in lakh shorthand, and a status icon plus word. Status is never colour alone: icon shape (check / clock / lock), text, and border style (solid / solid / dashed+hatch) differ.
- (c/d) Aside is a single region that swaps content: plot detail, Book form, Edit plot, Add plot, Edit/Add project, CSV import. Same pattern as the e-Pin Register `__detail` seal aside.
- Sidebar: collapsible accordion shell from commit 035ea68. Mock adds the category "Inventory & Bookings" (icon `domain`) containing "Projects & Plots" (this unit) and "Bookings & EMI" (unit 12, shown dimmed with a "unit 12" tag; the tag is mock-only). Whichever unit lands second reuses the category. Group key `inventory-bookings` is shared with unit 12 (Decisions 2).

## Component inventory

Reuse: `app-associate-lookup` (e-Pin pattern, client-side filter of `/api/associates`; chosen state shows userId + name + clear), `app-inline-banner` (danger/warning), `brand-button` (primary/secondary), form field classes, `FieldError`, `AdminSidebarComponent`/`ADMIN_NAV_CATEGORIES`. New (screen-scoped, `.projects-plots__*`): project row, status legend chip, plot tile, block heading, aside detail facts (`dl`), payment-schedule preview (`<details>` table), dropzone. No toast: success uses the existing inline banner (Decisions 9). The plot tile is shared with unit 13 (Decisions 11).

## Plot tile content

`plotNo` (mono 700), `areaSqft` with Indian grouping, "Corner" suffix when `type=CORNER`, `price` as `₹x.x L` (full `₹51,30,000` in aside/aria-label), status icon+label. Block grouping is derived client-side from the plotNo prefix before "-" (not in the API; falls back to one flat group when any plotNo has no "-"; natural sort within a block; Decisions 4).

## States and edge cases

| State | Behaviour |
|---|---|
| Loading | Project list and grid show skeleton tiles (`role=status` "Loading plots"); aside hidden. Reduced-motion disables shimmer. |
| No projects | Whole panel replaced by empty state: "No projects yet", primary "Add project". List and aside hidden. |
| Empty project (0 plots) | Header kept; body shows empty state with "Add plot" and "Import CSV"; aside hidden. |
| Plot selected AVAILABLE | Aside: facts + "Book this plot" (primary) + "Edit plot". |
| Plot selected BOOKED/SOLD | "Book this plot" rendered disabled with visible reason text linked by `aria-describedby`: "Already booked. Open it in Bookings & EMI to pay, confirm or cancel." (SOLD: "Already sold."). Tile stays selectable. |
| Book form | Associate lookup (required, ACTIVE associates only), buyerName (required, max 200), buyerPhone (optional, max 20), plot number/price in header, Total = plot price ("Fixed to the plot price at the time of booking"), "Preview" line (N installments of ₹X each; "Paid in a single installment" if EMI is off), Confirm booking / Cancel. |
| Validation 400 | Client-side: blank buyerName blocks submit and shows "Enter the buyer's name." (`aria-invalid`, `aria-describedby`, focus moves to the field). Server 400 with no field map shows a danger banner with the server `error` text. Missing associate is a client-side error on the lookup. |
| Submitting | Fields disabled, button `aria-busy`, spinner, label "Booking…"; Cancel stays enabled but does not abort the request: leaving discards the form, the request completes and the grid refreshes (Decisions 7). Double-submit impossible. |
| 409 not available | Warning banner "Plot A-12 was just booked by someone else. The grid has been refreshed." Grid refetched; tile re-renders as BOOKED; form kept with entries so the admin can switch plot; Book on the new plot is disabled. |
| Success | 201: plot tile becomes BOOKED in place (no full reload; or refetch grid), aside shows the plot as Booked with Book disabled, with an inline success banner at the top "Plot A-12 booked for Rohit Kulkarni. View booking" (`role=status`; link goes to the Bookings & EMI route with the booking id as a query param; stays until dismissed or another plot is selected). Counts update (Available -1, Booked +1). |
| Edit plot | plotNo, type (Normal/Corner segmented), areaSqft, rate, price; status shown read-only. Duplicate plotNo shows field error from 409/400. No delete action (Decisions 5). For BOOKED/SOLD plots (state `editbooked`) every field is read-only with the note "This plot can't be edited." and a "Back to plot" button. |
| Project form | name, location, photo upload (thumbnail), Save. No delete action (Decisions 5). |
| CSV import | Download template, choose file, Validate shows "34 of 36 rows are valid" with `Row N: field - message` list, Commit import enabled only when `errors` is empty. Reuses setup projects-step semantics and copy. |
| EMI disabled / config unreadable | `emiEnabled=false`: preview reads "Paid in a single installment". Config unreadable: preview hidden; form still submits (Decisions 3). |
| Grid refresh failure | Danger banner above grid with Retry; last good grid left on screen. |
| Long names | Project name/location wrap, tile numbers never truncate (min 88px tiles). |

## Interactions

- Select project: list click or arrow keys on list; loads grid, resets aside to empty prompt (selected plot cleared).
- Select plot: tile toggles `aria-pressed`, aside shows detail; Esc closes the aside in drawer mode and returns focus to the originating tile.
- Legend chips filter the grid by status (multi-toggle; none pressed = all). Tiles of a filtered-out status are removed (not dimmed) to keep the tab order short; empty-filter message "No plots with this status".
- Book: opens form in the aside, focus to the associate lookup; Enter in a field submits; success returns focus to the tile.
- Unsaved form + selecting another plot: keep simple, discard silently (nothing irreversible; Decisions 7).

## Responsive

- >= 1280px: three columns (272 / fluid / 352).
- 1024-1279px: aside becomes a right-hand drawer (min(400px,100vw)) over the page with scrim, opened by tile selection or any action; list stays visible (240px).
- < 1024px: sidebar is off-canvas behind a hamburger bar (assumption about the shell; follow whatever 035ea68 does at that width). Project list collapses into a "Project" select above the header (a drawer is the alternative; a select keeps it one tap and one control). Grid full width.
- < 640px: grid 3 columns, drawer is a full-screen sheet with a back affordance, form rows stack, buttons/chips `min-height: 44px`.
- Note: headless Chrome would not render below ~500px here, so the phone layout was verified only by CSS review, not a screenshot.

## Accessibility

- Status = colour + icon + visible word + border/hatch style; legend repeats all three with counts. Tile `aria-label` reads "Plot A-12, corner, 1,800 square feet, ₹51,30,000, Available".
- Tiles are `<button>`s in a `<ul>` per block (list semantics kept); `aria-pressed` for selection; visible 2px focus ring (`:focus-visible`), selected state is a 3px border, not only colour.
- Disabled Book button explains why in text (not a tooltip) via `aria-describedby`.
- Associate lookup follows the e-Pin combobox pattern (`role=combobox`, listbox, clear button label).
- Errors: `aria-invalid` + `aria-describedby`; banners `role=alert`; success banner and loading `role=status`.
- Contrast: tint backgrounds with darkened status text; muted text on raised surface >= 4.5:1; tiles are not relied on for contrast of the border alone.
- Reduced motion: shimmer and spinner animations are the only motion; the shimmer is disabled, the spinner is retained (functional).

## Data-binding map

| UI element | Endpoint / field |
|---|---|
| Project list rows | `GET /api/company/projects` -> `ProjectResponse` id, name, location, hasThumbnail, totalPlots, availablePlots, soldPlots (booked = total - available - sold, client-derived) |
| Project photo | `GET /api/company/projects/{id}/thumbnail` (404 = no photo) |
| Add / Edit project | `POST /api/company/projects`, `PUT /api/company/projects/{id}` body `ProjectRequest{name, location}`; photo `POST /api/company/projects/{id}/thumbnail` multipart `file` |
| Delete project / plot | Not exposed in the UI (Decisions 5); endpoints exist but are unused here |
| Legend counts, tiles | `GET /api/projects/{id}/plots/grid` -> `PlotGridResponse` plotId, plotNo, type, area, price, status (unit 10; counts computed client-side from this list so legend always matches tiles) |
| Aside facts (type, area, rate, price) | grid gives type/area/price only; rate is NOT in the grid. Rate comes from `GET /api/company/projects/{id}/plots/{plotId}` -> `PlotResponse` (rate, areaSqft, price, plotType) fetched on select/edit (Decisions 6) |
| Add / Edit plot | `POST /api/company/projects/{id}/plots`, `PUT .../plots/{plotId}` body `PlotRequest{plotNo, plotType NORMAL|CORNER, areaSqft>0, rate>0, price>0, status? }` |
| CSV template / validate / commit | `GET /api/company/projects/plots/csv-template`; `POST /api/company/projects/{id}/plots/csv/validate` multipart `file` -> `CsvValidationResponse{totalRows, validRows, errors[{rowNumber, field, message}]}`; `POST .../csv/commit` (204; 4xx `CsvImportRejectedException`) |
| Associate lookup | `GET /api/associates` via `AdminService.listAssociates()`, filtered client-side to ACTIVE; `associateId` = chosen id |
| buyerName / buyerPhone | `POST /api/admin/bookings` body `CreateBookingRequest{plotId, associateId, buyerName (NotBlank, <=200), buyerPhone? (<=20)}` |
| Total | Display of plot price; server snapshots `Plot.price` into `BookingResponse.totalAmount`; no client amount is sent |
| Schedule preview | `GET /api/company/booking-emi` -> `defaultInstallmentCount`, `emiEnabled` (ADMIN-only, fine here); amount per installment = price / count (client estimate; Decisions 3). The real schedule is `BookingResponse.installments[]` |
| Success banner link | `BookingResponse.id` -> Bookings & EMI route (unit 12) as a query param |
| Plot turns BOOKED | refetch grid (preferred) or patch local tile status |

## Error mapping

| HTTP | Source | UI |
|---|---|---|
| 400 | `POST /api/admin/bookings` bean validation (blank buyerName, size) | Field error under buyerName (anticipated client-side); other 400s as danger banner with server `error` text |
| 400 | project/plot/CSV validation (missing/zero fields, bad CSV) | Field errors; CSV row list |
| 401 | no/expired token | Existing global interceptor (redirect to login) |
| 403 | non-admin token | Screen is route-guarded; if hit, danger banner "You do not have access to this action." |
| 404 | project/plot/associate unknown (e.g. deleted elsewhere) | Banner "This project/plot no longer exists", refresh list; booking 404 on unknown associate shows error on lookup |
| 409 | `PlotNotAvailableException` on booking | Warning banner + grid refresh (above) |
| 409 | `DuplicatePlotNumberException`, CSV commit rejected | Field error on plotNo / CSV error panel |
| 5xx / network | any | Danger banner "Something went wrong. Try again."; form data retained; submit re-enabled |

## i18n-ready copy (proposed keys, `admin.projectsPlots.*`, en.json; mirror `admin.epinRegister.*` structure; nav keys follow `settings.sections.*` / `nav.categories.*`)

| Key | English |
|---|---|
| nav.categories.inventory | Inventory & Bookings |
| settings.sections.projectsPlots | Projects & Plots |
| eyebrow | Inventory · Plots |
| title | Projects & Plots |
| subtitle | See what is open, booked and sold in every project, and book a plot for an associate's buyer. |
| projectsHeading / addProjectAction / editProjectAction | Projects / Add project / Edit project |
| plotsSummary | {{total}} plots · {{available}} available |
| noPlotsYet | No plots yet |
| status.AVAILABLE / BOOKED / SOLD | Available / Booked / Sold |
| legendLabel / cornerNote | Filter plots by status / Notched tiles are corner plots. Select a plot for details. |
| blockHeading / blockSummary | Block {{block}} / {{available}} available of {{total}} |
| type.NORMAL / CORNER | Normal / Corner |
| tileAria | Plot {{no}}, {{type}}, {{area}} square feet, {{price}}, {{status}} |
| addPlotAction / editPlotAction / savePlotAction / editLockedTitle / editLockedBody / backToPlot | Add plot / Edit plot / Save plot / This plot can't be edited. / Booked and sold plots are locked so the booking's price and plot details stay accurate. / Back to plot |
| plotNoLabel / plotTypeLabel / areaLabel / rateLabel / priceLabel / statusLabel | Plot number / Type / Area (sq ft) / Rate (₹ / sq ft) / Price (₹) / Status |
| plotNoHint / priceHint / statusReadonlyHint | Must be unique within the project. / Entered separately from area × rate, as in the existing project setup. / Status changes through booking, not here. |
| importCsvAction / downloadTemplateAction / validateAction / commitAction / csvSummary / csvRowError | Import CSV / Download CSV template / Validate / Commit import / {{valid}} of {{total}} rows are valid / Row {{row}}: {{field}} - {{message}} (reuse `setup.projects.*` where it exists) |
| nameLabel / locationLabel / photoLabel / saveProjectAction | Project name / Location / Project photo / Save project |
| bookAction | Book this plot |
| bookDisabledBooked / bookDisabledSold | Already booked. Open it in Bookings & EMI to pay, confirm or cancel. / Already sold. |
| bookTitle | Book plot {{no}} |
| associateLabel / associateHint / lookupPlaceholder / lookupNoMatch / lookupClear | Associate / The associate who gets credit for this booking. Only active associates are listed. / Search by ID or name / (reuse `admin.epinRegister.lookup*`) |
| buyerNameLabel / buyerNamePlaceholder / buyerNameRequired | Buyer name / Full name of the buyer / Enter the buyer's name. |
| buyerPhoneLabel / optional | Buyer phone / (optional) |
| totalLabel / totalHint | Total / Fixed to the plot price at the time of booking. |
| schedulePreviewLabel / schedulePreview / scheduleSingle | Preview / {{count}} installments of {{amount}} each / Paid in a single installment |
| confirmBookingAction / bookingInProgress / cancelAction | Confirm booking / Booking… / Cancel |
| error.conflict | Plot {{no}} was just booked by someone else. The grid has been refreshed. Pick another available plot. |
| error.backToGrid / error.generic / error.forbidden / error.loadGrid / retry | Back to the grid / Something went wrong. Try again. / You do not have access to this action. / Could not load plots. / Retry |
| banner.booked / banner.viewBooking | Plot {{no}} booked for {{buyer}}. / View booking |
| empty.noProjectsTitle / noProjectsBody | No projects yet / Create your first project, then add plots one by one or import them from a CSV. |
| empty.noPlotsTitle / noPlotsBody | No plots in this project / Add a plot manually, or download the CSV template and import the whole layout at once. |
| empty.filter | No plots with this status. |

Currency and area are formatted with `Intl`/Angular pipe `en-IN` (lakh grouping: `₹51,30,000`; compact tile form `₹51.3 L` is a screen-local formatter, translate the "L" suffix per locale).

## Decisions (defaults applied - pending user sign-off)

Q12 is decided by the user; Q1-Q11 are sensible defaults awaiting sign-off.

1. **New route**, not an extension of the Setup > Projects step. The Setup entry keeps its name; the new nav item is "Projects & Plots" under the group below. Rationale: operational use (status grid, booking) differs from one-off setup.
2. **Sidebar group "Inventory & Bookings"**, group key `inventory-bookings`, shared with unit 12 (both designs use the same key; whichever lands second reuses it).
3. **EMI preview** shows installment count and equal per-installment amount only, labelled "Preview" (no dates, no rounding claims). If `emiEnabled=false`: "Paid in a single installment". Rationale: the real schedule is server-side.
4. **Blocks** = plotNo prefix before the first "-"; if any plotNo has no dash, one flat group. Natural sort within a block. Rationale: no block field in the API.
5. **Delete is not exposed** (plot or project). Edit is allowed for AVAILABLE plots. For BOOKED/SOLD plots the edit form is read-only with the note "This plot can't be edited." (state `editbooked`). Rationale: inventory integrity.
6. **Keep the extra `GET .../plots/{plotId}`** to show Rate in the detail aside.
7. **Booking in flight**: form disabled while submitting. Navigating away or selecting another plot discards the form, but the request completes and the grid refreshes.
8. **After success** the form closes and an inline success banner appears at the top of the aside.
9. **Inline banner, no toast**: reuse the existing inline banner component (success variant). "View booking" links to the Bookings & EMI route (owned by unit 12) with the booking id as a query param.
10. **Associate lookup lists ACTIVE associates only** (PENDING/suspended excluded) because transfer/confirm credit the seller. Hint text under the field says so.
11. **Plot tile is a shared component** also used by the unit 13 associate grid. Shared inputs: `plotNo`, `type`, `area`, `price`, `status`, `selectable`. Book/Edit controls stay outside it.
12. **Decided (user): palette = the violet/cyan sibling tokens** (surface-page #f8f9ff, surface-card #fff, surface-raised #eff4ff, border-subtle #c2c6d9, text-primary #0b1c30, text-muted #424656, brand-primary #7C3AED, brand-secondary #22D3EE; Geist titles, Inter body, JetBrains Mono data/eyebrows). The live app's `_tokens.scss` differs (Viraj Acres theme), so implementers must port the tokens deliberately or confirm at build time.
