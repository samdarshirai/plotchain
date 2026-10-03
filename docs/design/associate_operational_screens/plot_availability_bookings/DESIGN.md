---
name: Plot Availability and Bookings (Associate Operational Screen)
status: design only (plot-booking-lifecycle unit 13); no Angular written
tokens:
  source: violet/cyan sibling tokens (docs/design/associate_operational_screens/{income_statement,payout_history,dashboard}); user decision, see Token note
  colors:
    surface-page: "#f8f9ff"
    surface-card: "#ffffff"
    surface-raised: "#eff4ff"
    border-subtle: "#c2c6d9"
    text-primary: "#0b1c30 (also --ink: rail, Sold tiles, pressed chips)"
    text-muted: "#424656"
    brand-primary: "#7C3AED (active tab, focus ring, seal border, corner notch, Active badge)"
    brand-secondary: "#22D3EE (on-dark accents only: rail mark and active icon, plot no on Sold tiles; never text on light)"
    status-success: "#34D399 (tints only)"
    status-warning: "#F59E0B (tints and hatch only)"
    status-danger: "#F87171 (tints only)"
    status-success-text: "#047857 (added here: AA text and border variant)"
    status-warning-text: "#92400E (added here)"
    status-danger-text: "#B91C1C (added here; also solid Overdue badge fill)"
  typography:
    display: "Geist 600 (page title, popover/detail titles, empty-state titles)"
    body: "Inter 400/500/600"
    tabular: "JetBrains Mono 500/600 (plot numbers, amounts, seal figure, block-rule labels)"
  radius: "card/seal/popover/detail 20px; filter strip, booking cards, banner 16px; tiles, selects, buttons 10px; tabs, chips, badges, bar 999px"
  shadow: "card 0 4px 20px -2px rgba(0,0,0,.08)"
---

## Purpose

One page, two tabs, both read-only. **Availability** lets an associate see which plots in a project are open (so they can steer a buyer to the company office). **My bookings** shows the associate's own bookings: status, buyer, paid versus due, and the EMI schedule with overdue flags. There is no write affordance anywhere: no book, pay, cancel, transfer or edit control, no inputs except filters and the project picker (role-capability design: Associate is view-only except profile edit; booking lifecycle spec "Screens" and Decision 12).

This replaces the two tabs of the shipped `PlotBookingsComponent` (`Available Plots` table plus `My Bookings` table with side-panel) under the same route `/plot-bookings`, same nav entry (`nav.plotBookings`, 4th item, `grid_view` icon). No nav change is needed.

## Token note (read first)

User decision (Decision 1): this screen uses the violet/cyan sibling tokens (`#7C3AED`, `#22D3EE`, `#f8f9ff`, `#c2c6d9`, `#0b1c30`) with Geist titles, Inter body and JetBrains Mono data, matching `income_statement`, `payout_history` and `dashboard`. The live `frontend/src/styles/_tokens.scss` (Antique Gold, Oxblood, Parchment, Fraunces/IBM Plex, 2px radius) differs; implementers port tokens deliberately rather than copying hex from this mock. All colours in `code.html` are `var()` tokens declared on `:root`; there is no hex outside it.

Additions beyond the sibling set, made for accessibility: `--status-success-text #047857`, `--status-warning-text #92400E`, `--status-danger-text #B91C1C`. The sibling status colours (`#34D399`, `#F59E0B`, `#F87171`) fail 4.5:1 as text on white, so here they are used only as tints and hatch; every status word, glyph, border and solid badge uses the `-text` variant. The active tab is solid `brand-primary` (white text 5.7:1) instead of the siblings' violet-to-cyan gradient, because white on the cyan end fails AA. The eyebrow-free structure, tab bar, surface-raised filter strip, data-label stacked rows below 768px and pager are unchanged.

## Layout and regions (desktop, 1280px; content max 1180px)

```
rail(68px Ink) | Plot Bookings            (Geist 1.75rem) + one-line view-only subtitle
               | [ Availability | My bookings ]   (shipped .tab-bar idiom, violet active)
 Availability  | [ Seal card: "Open now 17 of 36" + Project picker ] [ Filter strip: status chips w/ counts,
               |                                                       type select, legend ]
               | "Showing N of 36 plots"  (aria-live)
               | -- Block A . 14 plots --   tile grid (auto-fill, min 112px)
               | -- Block B . 12 plots --   ...
               | popover anchored to the selected tile (read-only)
 My bookings   | note: newest first
               | [ booking cards (5/12) ] [ detail: facts, progress bar, installment table (7/12) ]
               | pager: Previous / Page x of y / Next
```

Signature element: the plot grid reads as a site plan, grouped by block with the brand's flanking-rule header (mono label), and the single seal card (violet border with a soft violet halo) carries the number an associate wants first: plots still open. Everything else stays quiet.

## Component inventory

| Component | Notes / reuse |
|---|---|
| Tab bar | Existing `app-tab-bar`; ids `availability`, `myBookings` (existing ids were `availablePlots`/`myBookings`; rename or keep, see Decision 5). Scrolls horizontally if it overflows. |
| Seal card | New small wrapper over `.card`: violet border and halo, flanking-rule label, mono figure, hosts project picker. |
| Project picker | Native `<select>` (existing pattern: `plotBookings.projectPickerLabel`), option text `name — location`. |
| Status filter chips | Toggle buttons with `aria-pressed`, glyph + label + count. Single-select, `All` default. |
| Type filter | Native `<select>`: All / Normal / Corner. |
| Legend | Swatches reproduce tile treatments exactly (including hatch and corner mark). |
| Plot tile | `<button>` (min 92px high, 112px+ wide). Contents: plot no (mono), area, compact price (`₹42.3 L`), status glyph + word. Corner = violet notch in the top-right corner. |
| Plot popover | Anchored dialog on desktop, bottom sheet below 768px. Rows: Status, Type, Area, Price (exact INR). Hint text: "To book this plot, contact the company office." No booking or buyer data. |
| Booking card | `<button aria-pressed>`: plot no, status badge, optional `n overdue` badge, buyer + booked date, paid/total bar, `paid of total`, due text. |
| Progress bar | `role="img"` with `aria-label="N% paid"`; the amounts are always printed next to it. |
| Booking detail | Title, project, buyer, four facts (Total, Paid, Due, Installments), larger bar, optional note, installment table. Desktop: inline right column. Below 960px: full-screen sheet with a "Bookings" back button (same job as the existing `app-side-panel`). |
| Installment table | Columns No., Due date, Amount, Status, Paid on. Below 768px: stacked cards via `data-label`/`attr()` (same technique as income_statement). |
| Badges | Booking: Active, Confirmed, Cancelled. Installment: Paid, Pending, Void. Overdue is a separate solid-danger badge. Each has a glyph, never colour alone. |
| Inline banner | Existing `app-inline-banner tone="danger"` with a "Try again" button. |
| Pager | Existing Previous / "Page x of y" / Next, 44px targets. |

## Status encoding (colour is never the only signal)

| Status | Fill | Border | Glyph + text | Luminance |
|---|---|---|---|---|
| AVAILABLE | card | success-text | check + "Available" | light |
| BOOKED | diagonal amber hatch | warning-text | half circle + "Booked" | light, patterned |
| SOLD | Ink | Ink | square + "Sold", plot no in cyan | dark |

Booking status: Active (violet outline pill), Confirmed (success pill, check), Cancelled (muted pill, cross). Installments: Paid (success, check), Pending (outline, empty circle), Void (muted, dash, row hatched, amount struck through). Overdue: solid danger pill with "!" plus a 3px danger rule on the row and a faint danger row tint; it appears only on PENDING installments where the API says `overdue=true`.

Cancelled booking: card has a muted left rule, plot number struck through, bar in muted grey, facts muted, due text "No further dues", explanatory note "Booking cancelled. Unpaid installments were voided. The amount already paid stays on record." Confirmed booking: success rule, bar full, due text "Fully paid".

## States and edge cases

Preview switcher in `code.html` (dashed bar at top, not part of the screen) toggles all five for both tabs.

| State | Availability | My bookings |
|---|---|---|
| default | Seal + filters + grid | Cards + detail (first booking selected) |
| loading | `aria-busy` skeleton: seal, filter and 18 tile placeholders (shimmer disabled under `prefers-reduced-motion`) | 3 skeleton cards |
| empty | Project has zero plots: "No plots in this project yet" and a pointer to other projects | "No bookings yet" plus a "View availability" link (navigation, not a write) |
| error | Project list failed: danger banner + "Try again"; no grid | Danger banner + "Try again" |
| partial | Grid refresh failed but last data is still shown: banner above the stale grid. Also: filters leave zero matches, shows "No plots match these filters" + "Clear filters" (interactive in the mock) | Page loaded with bookings in all three statuses together |

Other edge cases: 0 overdue hides the overdue badge; a booking with `dueAmount=0` shows "Fully paid"/"No further dues"; installments can be paid out of order (mock shows #5 PAID after overdue #4); a project-picker change clears filters and closes the popover; selecting a plot whose status changes after load is only corrected on refresh (grid is a snapshot, no polling); a booking transferred to another associate silently disappears from the next load (no note shown, Decision 6); 404 on an unknown project shows the error banner.

## Accessibility

- Tiles are real buttons with a full `aria-label` ("Plot A-12, corner, 1,350 sq ft, ₹38,48,000, booked") and `aria-haspopup="dialog"`/`aria-expanded`. Popover is `role="dialog"`, moves focus to Close, closes on Esc and on the close button, returning focus to the tile.
- Status is carried by glyph + word + fill pattern + luminance; works in greyscale and for red-green colour blindness. Measured contrast (WCAG ratio) on the violet palette: success-text on card 5.5, on raised 5.0, on the 12% success badge tint 5.1; warning-text on card 7.1, on the booked hatch 6.3 (dense stripe 5.6); danger-text on the banner tint 5.6 and on the overdue row tint 5.9; white on the solid Overdue badge 6.5; white on the active tab 5.7; brand-primary text on page 5.4, on card 5.7, on the Active badge tint 4.6 or better; muted text on raised 8.5; border-subtle and cyan on Ink 10.1 and 9.5; white on pressed chip 17.2. Tile borders use the -text variants (5.5 and 7.1 vs card), so they also clear 3:1 as UI components. The raw sibling status colours are never used for text.
- All targets are 44px or more (chips, selects, tabs, tiles at about 92px, back button, pager, popover close).
- Result count has `aria-live="polite"`. Banners use `role="alert"`; skeletons use `role="status"` with a screen-reader label.
- Visible 2px violet focus ring everywhere. Motion: only the skeleton shimmer, and it is disabled under `prefers-reduced-motion`.
- Tab bar uses `role="tablist"`/`tab`/`aria-selected` in the mock; the shipped `app-tab-bar` has its own semantics, keep its behaviour.
- Table headers exist on desktop; the stacked mobile layout keeps the label text via `attr(data-label)` (CSS generated content: confirm it is exposed by target screen readers, or switch to visible `<span>`s in the Angular template).

## Responsive behaviour

The shipped app shell keeps the 68px icon rail at every width (no breakpoints in `_app-shell.scss`), so the mock does too; the content gets about 322px at 390px viewport.

- Over 960px: toolbar is two columns (seal 1.1fr, filters 1.9fr); bookings master-detail 5fr/7fr.
- 768px to 959px: toolbar stacks; bookings detail becomes a full-screen sheet over the list with a back button.
- Below 768px: 16px gutters; tiles are a 2-column grid (about 140px wide); status chips wrap; selects and type filter full width; popover becomes a bottom sheet; facts are 2x2; installment table becomes stacked label/value cards (`data-label`), void and overdue treatments preserved.
- Large projects: the grid is grouped by block and wraps naturally; no horizontal scroll at any width.

Rendered: `screen.png` (1280, availability with popover), `screen-bookings.png` (1280), `screen-mobile.png` (390, availability with bottom-sheet popover), `screen-mobile-bookings.png` (390, list), `screen-mobile-sheet.png` (390, installment sheet). Rendered with Playwright Chromium, no horizontal overflow at 390 or 1280.

## Data-binding map

| UI element | Endpoint / field |
|---|---|
| Project picker options | `GET /api/company/projects` -> `Project.id`, `name`, `location` (existing `PlotBookingsService.listProjects()`; authenticated, associate-reachable per `SecurityConfig`, see Decision 2) |
| Seal figure "17 of 36" | Preferred: `Project.availablePlots` / `totalPlots` from the project list. Alternative: count of grid rows with `status=AVAILABLE` (BOOKED excluded, Decision 9). |
| Grid tiles | `GET /api/projects/{id}/plots/grid` (unit 10) -> `PlotGridResponse`: `plotId`, `plotNo`, `type` (NORMAL/CORNER), `area`, `price`, `status` (AVAILABLE/BOOKED/SOLD). Unit 10 (plan: `2026-10-01-plot-booking-unit-10-plot-grid-read.md`); at HEAD 8a527f2 the endpoint is not yet in the repo, so field names follow the spec. |
| Block headers / grouping | Client-derived from the `plotNo` prefix before the first '-', natural sort; one flat group if any plotNo lacks a dash; not an API field (Decision 4). |
| Status chip counts, "Showing N of M" | Client-side counts over the grid response. |
| Status / type filters | Client-side filter, no request. |
| Popover | Same grid row; nothing else is fetched. No buyer or booking field is read. |
| Booking cards and detail | `GET /api/associates/me/bookings?page&size` -> `AssociateBookingPageResponse(bookings, page, size, totalElements)` |
| Plot label ("Plot A-12") | DEPENDENCY: backend follow-up (unit 14) adds `plotNo` to the associate booking response; the design binds to it. Until it lands, fall back to the plot id short form (first 8 chars of `plotId`). Decision 3. |
| Project name in detail | `projectName`, same unit 14 dependency; until then omit the project line. |
| Status badge | `BookingResponse.status` (ACTIVE/CONFIRMED/CANCELLED) |
| Buyer | `BookingResponse.buyerName` |
| Booked date | `bookedAt` |
| Progress bar and "paid of total" | `paidAmount`, `totalAmount` (bar width = paid / total, client-computed, rounded) |
| Due text and Due fact | `dueAmount` |
| Installments fact | `installmentCount` |
| Installment rows | `installments[]`: `installmentNumber`, `dueDate`, `amount`, `status` (PENDING/PAID/VOID), `paidAt` |
| Overdue badge, `n overdue` | `installments[].overdue` (server-derived, ACTIVE bookings only), count client-side |
| Pager | `page`, `size`, `totalElements` (size clamped 1..100 server-side) |

## i18n-ready copy

The shipped screen uses ngx-translate with keys under `plotBookings.*` in `frontend/src/assets/i18n/en.json` and `hi.json`. Keep existing keys where they apply; new keys below (English). INR via `CurrencyPipe` (en-IN gives lakh grouping); compact prices `₹42.3 L` need a small formatter ("L"/"Cr"; Hindi uses Latin digits, Hindi unit labels deferred to i18n review, Decision 7). Enums go through keys, not raw text.

```
plotBookings.title                    Plot Bookings
plotBookings.subtitle                 See which plots are open in a project, and follow your own bookings and EMI payments. This page is view-only.
plotBookings.tabAvailability          Availability
plotBookings.tabMyBookings            My bookings
plotBookings.seal.label               Open now
plotBookings.seal.figure              {{available}} of {{total}} plots
plotBookings.projectPickerLabel       Project
plotBookings.filter.all|available|booked|sold   All / Available / Booked / Sold
plotBookings.filter.typeLabel         Plot type
plotBookings.filter.typeAll|NORMAL|CORNER       All types / Normal / Corner
plotBookings.legend.cornerPlot        Corner plot
plotBookings.blockHeader              Block {{block}} . {{count}} plots
plotBookings.shownCount               Showing {{shown}} of {{total}} plots. Select a plot for details.
plotBookings.plotStatus.AVAILABLE|BOOKED|SOLD   Available / Booked / Sold
plotBookings.popover.title            Plot {{plotNo}}
plotBookings.popover.status|type|area|price     Status / Type / Area / Price
plotBookings.popover.closeLabel       Close plot details
plotBookings.popover.hint             To book this plot, contact the company office.   (placeholder copy, confirm at i18n review; Decision 11)
plotBookings.noMatchTitle             No plots match these filters
plotBookings.noMatchBody              Try a different status or plot type.
plotBookings.clearFilters             Clear filters
plotBookings.plotsEmptyTitle          No plots in this project yet
plotBookings.plotsEmptyBody           Plots appear here once the company adds them. Pick another project to see its plots.
plotBookings.projectsLoadError        Couldn't load projects. Check your connection and try again.
plotBookings.plotsRefreshError        Couldn't refresh the plot grid. Showing the last loaded plots; availability may be out of date.
plotBookings.bookingsLoadError        Couldn't load your bookings. Check your connection and try again.
plotBookings.retryAction              Try again
plotBookings.bookingsEmptyTitle       No bookings yet
plotBookings.bookingsEmptyBody        When the company books a plot for you, it appears here with its EMI schedule. Check the Availability tab to see which plots are open.
plotBookings.viewAvailability         View availability
plotBookings.bookingsNote             Bookings are shown newest first.
plotBookings.bookingStatus.ACTIVE|CONFIRMED|CANCELLED   Active / Confirmed / Cancelled
plotBookings.installmentStatus.PENDING|PAID|VOID        Pending / Paid / Void
plotBookings.overdue                  Overdue
plotBookings.overdueCount             {{count}} overdue
plotBookings.paidOfTotal              {{paid}} paid of {{total}}
plotBookings.dueAmount                {{amount}} due
plotBookings.fullyPaid                Fully paid
plotBookings.noFurtherDues            No further dues
plotBookings.buyerLine                {{buyer}} . booked {{date}}
plotBookings.buyerLabel               Buyer: {{buyer}}
plotBookings.facts.total|paid|due|installments  Total / Paid / Due / Installments
plotBookings.column.no|dueDate|amount|status|paidOn   No. / Due date / Amount / Status / Paid on
plotBookings.confirmedNote            Booking confirmed. This plot is now yours as a completed sale.
plotBookings.cancelledNote            Booking cancelled. Unpaid installments were voided. The amount already paid stays on record.
plotBookings.backToBookings           Bookings
plotBookings.progressLabel            {{percent}}% paid
plotBookings.previousPageAction|nextPageAction|pageIndicator   (existing)
```

Hindi (`hi.json`) needs the same key set; the shipped file should be extended in the same unit.

## Out of scope

No write affordance of any kind. No buyer or booking data on the availability grid (booking spec Decision 10). No payment or "pay now" action, no contact-the-office form (the popover hint is plain text), no export, no map/plot-layout image, no notifications or reminders for overdue installments.

## Decisions (defaults applied, pending user sign-off)

| Q | Default applied | Rationale |
|---|---|---|
| 1 | Violet/cyan sibling tokens (user decision, final); siblings need no refresh | Keeps associate operational screens visually consistent; live `_tokens.scss` is ported deliberately |
| 2 | Picker uses `GET /api/company/projects` (authenticated, already used by the shipped screen); grid uses `GET /api/projects/{id}/plots/grid` (unit 10). Earlier assumption that an associate cannot list projects is corrected: they can | Existing, authenticated, no new endpoint needed |
| 3 | Backend follow-up (unit 14) adds `plotNo` and `projectName` to the associate booking response; design binds to them; fallback is the plot id short form until then (recorded in the data-binding map) | The booking list is unreadable with UUIDs |
| 4 | Block = `plotNo` prefix before the first '-', natural sort; one flat group if any plotNo lacks a dash | Matches the data seen, safe for other naming schemes |
| 5 | Tabs "Availability" (grid, replaces the paginated table per unit 13) and "My bookings"; no list-view toggle in v1 | Smaller scope; revisit if a project outgrows the grid |
| 6 | No note about transferred-away bookings (mock updated, note removed) | Self-scope stays silent; avoids confusing copy |
| 7 | Compact `₹42.3 L` on tiles, full lakh grouping in detail and popover; Hindi: Latin digits, Hindi unit labels deferred to i18n review | Tiles need density; exact figure is one tap away |
| 8 | Cancelled booking `dueAmount` is 0 (unit 1 sums PENDING installments only, VOID excluded), so "No further dues" with the retained paid amount is correct | Matches the unit 1 plan |
| 9 | Seal "Open now" counts AVAILABLE only; BOOKED shown separately | A booked plot is not available to steer a buyer to |
| 10 | Mobile 68px rail out of scope; keep 2-column tiles on phones | Shell change belongs to its own unit |
| 11 | Contact hint stays non-interactive "Contact the company office", flagged as copy to confirm at i18n review | No contact route exists yet |
