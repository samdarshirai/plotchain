# Projects & Plots: mockup vs actual

Mockup: claude.ai/design `Projects and Plots.dc.html`, option 1c (1440x820 card). Actual: `/settings/projects-plots` at 1512x771.

**Method.** Mockup values are read from the mockup source (inline styles and JS), not from a rendered copy, because the `.dc.html` needs its own runtime. Actual values are `getComputedStyle` / `getBoundingClientRect` readings from the running app (project "ZZ Task8…", 18 plots). Hex values are normalised. "Matches" means equal to the mockup value.

Fonts match everywhere: Fraunces (display), Inter (UI), IBM Plex Mono (ids and numbers).

## 1. Shell and page

| Item | Mockup | Actual | Gap |
|---|---|---|---|
| Left nav | 72px Ink icon rail, VS monogram, icons only | 250px Ink sidebar with labels and sub-menu | Shell is outside this screen; the mockup rail is a different (collapsed) nav |
| Page background | `#F7F2E7` | `#F7F2E7` | Matches |
| Content padding | `32px 36px` | `24px 32px` | Actual 8px / 4px tighter |
| Vertical gap between blocks | 22px | 24px | +2px |
| Content width | Fills card (main + 380px drawer) | Max 1480px, centred; project list takes 272px | Different structure (see 2) |
| Drawer | Always open, flush to right edge | Only when a plot or action is selected | Behaviour differs |

## 2. Header and switcher

| Item | Mockup | Actual |
|---|---|---|
| Eyebrow | 11px / 600, letter-spacing .14em (1.54px), `#5C1A2A`, text "INVENTORY · PLOTS · BORING ROAD" | 12px / 700, 1.2px, `#5C1A2A`, text "INVENTORY · PLOTS" |
| Title | h1 = project name "Boring Road, Patna", Fraunces 600 30px / 1.1 | h1 = "Projects & Plots", Fraunces 600 28px, letter-spacing -0.28px; project name is a separate Inter 600 20px heading below |
| Subtitle | none | Inter 15px `#6B6153` ("See what is open, booked...") |
| Switcher position | Top right of header, same row as title, bottom-aligned | Below the Edit / Import / Add plot buttons, left-aligned (x=624) |
| Switcher container | padding 3, `#F0E9D6`, 1px `#D9CFBC`, radius 4 | Matches |
| Switcher buttons | 13px / 500, padding 6px 12px, radius 3; active `#FCFAF5` with 1px `#D9CFBC` ring | Matches |
| Header actions | none (Edit project, Import CSV, Add plot, Add project not in mockup) | Add project (top right, 46px tall), Edit project, Import CSV, Add plot |
| Primary button | Oxblood / `#EAD07D`, 14px / 600, radius 3, padding 11 | Oxblood / `#DDC77D`-ish gold text, 16px / 600, radius 2, padding 11px 24px. Larger font, smaller radius |

## 3. Plot area container

| Item | Mockup | Actual |
|---|---|---|
| Panel | Grid and Site plan sit in one card: `#FCFAF5`, 1px `#D9CFBC`, radius 4, padding 28 | Grid and Site plan sit directly on the parchment, no card. Only Table has the card (matches: `#FCFAF5`, radius 4) |
| Legend | Bottom of the card: 12px swatches (square, 1px edge) + label + mono count, 12px `#6B6153`, plus "Notched = corner plot" | Top, above the plots, as pill filter chips (radius 999, 16px / 600, padding 6px 14px, 38px tall) with counts. Note text 13px `#6B6153` |
| Legend entries | Available, Booked, Sold, On hold, Selected | Available, Booked, Sold (no hold status in the data model) |
| Filtering | Not rendered in the template | Chips are toggle filters |
| Block heading | "BLOCK A · NORTH FACING", Inter 11px / 600, .12em, uppercase, `#6B6153` | "Block A" Inter 16px / 600, sentence case, `#201A15`, plus mono "5 available of 9" |

## 4. Grid view tiles

| Item | Mockup | Actual |
|---|---|---|
| Columns | 6 equal columns, gap 8px | auto-fill (min 96px), gap 10px; 7 across at this width |
| Tile size | Inner height 64px, padding 10px 12px | About 107 x 97px (113px for a corner), padding 8px 10px |
| Content | Plot id (Plex Mono 500 14px) and area "1,200 sq ft" (11.5px, 80% opacity) | Plot id 15px / 700, area 12px / 500, price 13px / 600, status icon + word 12px / 600 |
| Border and radius | 1px edge (2px when selected), square, radius 0 | 2px solid (dashed for sold), radius 10px |
| Corner notch | 14px | 14px (matches) |
| Available colours | edge `#4B7A52`, fill `#DCE8D6`, ink `#23402A` | edge `#4B7A52`, fill ~`#E7EBE2` (12% tint), ink `#201A15`. Fill paler, ink not the dark green |
| Booked colours | edge `#B4790E`, fill `#F1D9A6`, ink `#5A3D07` | edge `#B4790E`, fill ~`#F3EBD9`, ink `#201A15` |
| Sold colours | solid fill `#CFC6B6`, edge `#8C8172` | Hatched / transparent, dashed `#6B6153` edge |
| Selected | Edge `#C6A227` 2px, fill `#5C1A2A`, ink `#EAD07D` | Fill oxblood, text `#EAD07D`, border gold 3px (1px thicker) |

## 5. Site plan view

| Item | Mockup | Actual |
|---|---|---|
| Columns | 12 equal columns, gap 4px | 12-column grid, gap 4px (matches) |
| Tile | Inner height 104px, radius 0, id Plex Mono 12px / 500, centred | 64 x 64px, radius 10px, id 12px / 700, centred, top-aligned |
| Row layout | Block A row, "24 FT INTERNAL ROAD" band (40px, `#E4DCCB`, dashed top/bottom `#B5A887`, 11px tracked label), Block B row | Blocks stacked with headings, no road band |
| Orientation cues | North arrow, "BORING ROAD · 60 FT MAIN" band (52px, `#D9CFBC`) at the bottom | none (no data to back them) |
| Block A / B id alignment | Row A ids at bottom, row B ids at top (face the road) | All ids at top |

## 6. Table view

| Item | Mockup | Actual |
|---|---|---|
| Columns | PLOT, AREA, DIMENSIONS, FACING, RATE, TOTAL, STATUS, ASSOCIATE (fixed widths 84/96/84/56/76/96/82/1fr, gap 10) | PLOT, AREA (SQ FT), TOTAL, STATUS; auto widths (~196px each) |
| Header row | 11px / 600, .08em, `#6B6153` on `#F0E9D6`, padding 12px 20px | Matches (0.88px = .08em) |
| Cells | 13px, padding 9px 20px, Plex Mono for numbers | 13px Plex Mono, padding 8px 20px (1px shorter) |
| Row divider | `#EAE2D1` (lighter) | `#D9CFBC` |
| Plot id | Plain mono 500 text | Underlined mono 500 button |
| Corner tag | 9.5px / 600, .06em, `#6B6153` | Matches |
| Status pill | 11.5px / 600, padding 3px 9px, radius 999 | Matches size. Sold pill is `#F0E9D6` / `#6B6153` vs mockup `#CFC6B6` / `#3E372E` |
| Selected row | bg `#F6EFDD`, inset 3px oxblood bar | bg `#F0E9D6`, inset 3px oxblood bar (bar matches; fill slightly darker) |
| Hover | bg `#F7F2E7` | none |
| Money | Rate and total right-aligned | Total right-aligned, no rate |

## 7. Drawer

| Item | Mockup | Actual |
|---|---|---|
| Frame | 380px wide, full height, flush right, `#FCFAF5`, 1px `#D9CFBC` left border, padding 28 | 352px floating card, radius 20px, soft shadow, padding 24, sticky at the top of the content |
| Header | "BOOK A PLOT" eyebrow (11px / 600, .14em, oxblood) and a close icon | No eyebrow, no close icon (Esc and scrim close it) |
| Plot summary | Id Plex Mono 500 22px, sub "Block A · Corner plot · 1,200 sq ft" 12px, total 16px mono right-aligned, bottom border | Id Plex Mono 700 18px; `dl` list: TYPE, AREA, RATE, PRICE, STATUS (11px mono uppercase labels, 15px / 600 values) |
| Content | Booking form directly: Associate, Buyer name, Buyer phone, Token amount, Plan, 7-day hold note, Cancel / Confirm | Detail first with "Book this plot" and "Edit plot" buttons; the form opens as a second step. No token amount, plan or hold note |
| Fields | Label 12px / 500 `#6B6153`; inputs white, 1px `#D9CFBC`, radius 3, padding 10px 12px, 14px | Not compared (form not opened) |
| Buttons | Cancel (outline) : Confirm (oxblood, `#EAD07D`, 14px / 600) at 1:2, radius 3 | Book this plot (oxblood) + Edit plot (secondary), 16px / 600, radius 2 |

## 8. Elements with no mockup counterpart
Project list (272px cards, radius 16px, status bar) and its select fallback, Add/Edit project form, CSV import, Edit plot form, banners, loading skeleton, empty states.

## 9. Fix list (visual only, no backend)
Ordered by visibility:
1. Wrap Grid and Site plan in the `#FCFAF5` / `#D9CFBC` / radius 4 / padding 28 card.
2. Tiles: radius 0 (clip-path notch only), 1px edge, status fills `#DCE8D6` / `#F1D9A6` / `#CFC6B6` with the mockup inks; consider dropping price and status text from Grid tiles to match the 2-line tile (would lose information; decide first).
3. Move the switcher to the title row, right-aligned; move status filters to a bottom legend or keep as chips (decision needed, filters are extra functionality).
4. Block heading to 11px uppercase tracked.
5. Drawer: 380px, flush right, square frame with left border instead of 20px card, mono 500 22px id, eyebrow, close icon.
6. Table: row divider `#EAE2D1`, plot id without underline, selected row `#F6EFDD`, hover `#F7F2E7`, sold pill colours.
7. Primary button font 14px / radius 3 (app-wide token; affects all screens, check before changing).
8. Eyebrow 11px / 600 / .14em; h1 30px / 1.1.
9. Site plan: align row ids toward the road, add a plain "road" divider band between blocks.

## 10. Not compared
Associate / booking form field styles, hover and focus states, narrow-width layout, dark/other theme, the Hindi strings, and the associate availability grid (shares the tile).

## 11. Grid view layout re-check (after the token / tile / legend change)

Actual measured at 1512 x 771, drawer closed unless noted (project "ZZ Task8…"). Mockup values from source, with panel width worked out from its 1440px card: 1440 - 72 rail - 380 drawer - 72 padding = 916px panel, 858px inside the 28px padding and 1px border.

| Item | Mockup | Actual | Match |
|---|---|---|---|
| Panel padding / border / radius / bg | 28px, 1px `#D9CFBC`, 4px, `#FCFAF5` | same | yes |
| Gap between blocks | 24px | 24px (block A is 165px tall in both) | yes |
| Block heading | 11px / 600, .12em, uppercase `#6B6153`, "BLOCK A · NORTH FACING" | 11px / 600, 1.32px, uppercase `#6B6153`, "BLOCK A" + mono "5 available of 9" | style yes, text differs (no facing data) |
| Heading to tiles | 10px | about 10px | yes |
| Columns / gap | 6 fixed, 8px | auto-fill (min 112px), 8px: 6 columns at 808px, 7 when wider, 3 with the drawer open | partial |
| Tile width | about 136px (858 wide) | 118px (750 wide) | no, container is narrower |
| Tile height | 66px (1px edge + 64px face) | 66px | yes |
| Tile padding | 10px 12px, id top, area bottom | same | yes |
| Id font | Plex Mono 14px / 500 | Plex Mono 14px / 500 | yes |
| Area font | 11.5px, 80% opacity, "1,000 sq ft" | 11.5px, 80% opacity, "1,000 sq ft" | yes |
| Corner notch | 14px outer, 13.5px inner | same | yes |
| Status colours | edge / fill / ink `#4B7A52`/`#DCE8D6`/`#23402A`, `#B4790E`/`#F1D9A6`/`#5A3D07`, `#8C8172`/`#CFC6B6`/`#3E372E` | same | yes |
| Selected | `#5C1A2A` fill, `#C6A227` 2px edge, `#EAD07D` ink | same | yes |
| Legend | 12px swatches, 12px text `#6B6153`, 20px gap, counts mono | same | yes |
| Legend position | pinned to the bottom of a panel that fills the screen height (`margin-top:auto`) | directly under the last block; panel height follows content | no |
| Tile count per row when last row is short | left-aligned | left-aligned | yes |

### What still differs, and why
1. **Width.** The mockup main area is 916px; the real one is 808px with the drawer closed and 432px with it open. Causes: the 250px sidebar (mockup: 72px icon rail) and the 272px project list column (mockup has none). So tiles are 118px not 136px, and with the drawer open the grid drops to 3 columns where the mockup keeps 6.
2. **Column rule.** Mockup is always 6 columns. Actual flows by width. Fixed 6 would squeeze text below about 900px; kept auto-fill on purpose.
3. **Panel height.** Mockup panel stretches to fill the screen and pushes the legend to the bottom; actual panel is as tall as its content.
4. **Vertical offset.** The grid panel starts at about y=338 here and about y=150 in the mockup, because the real screen adds a subtitle, project title row, Edit / Import / Add plot buttons and the view switcher above it.
5. **Heading text.** "NORTH FACING / SOUTH FACING" cannot be shown (no facing data).

## 12. Fixes applied

Done: eyebrow 11px / 600 / .14em and h1 30px / 1.1; view switcher moved onto the project title row; project list turned into a strip above the grid (frees the 272px column, main area is now wider than the mockup's); tile grid fixed at 6 columns; panel minimum height so the legend sits low; site plan road bands and ids facing the road; table row divider `#EAE2D1`, hover `#F7F2E7`, selected row `#F6EFDD`, plain plot ids, sold pill `#CFC6B6`; drawer 380px square frame with eyebrow ("PLOT DETAILS" / "BOOK A PLOT"), close button and 22px mono plot id.

Not done, on purpose: primary button font 14px (app-wide token, affects every screen); "NORTH / SOUTH FACING" heading text, dimensions, facing, associate and rate columns (no data); the mockup's Plan dropdown and 7-day-hold note.

Known remaining gaps: grid tiles are wider than the mockup (about 170px vs 136px) because the real main area is wider; the third block in a site plan has its ids on the road side even with no road below it.

## 13. Second pass, against the mockup rendered locally

Rendered the mockup source (support.js + html) at 1440px and compared screenshots, not just source values.

Changed: header is now one compact row (eyebrow with project name, h1 "Name, Location", view switcher right) with no subtitle; project cards replaced by a project select in a single toolbar row (select, Edit project, Import CSV, Add plot, Add project); booking drawer rebuilt to the mockup layout (plot id 22px mono, "Block A · Corner plot · 1,000 sq ft", total at right, divider, 12px muted labels, white 14px inputs with 3px radius, gold-bordered token field, balance preview in a parchment note, Cancel / Confirm pinned at the bottom 1:2); legend gains the "Selected" swatch; site plan block labels are plain 12px text with the second block's label under its row, plus a bottom main-road band; table columns are compact fixed-width and Area shows "1,000 sq ft".

Still different, on purpose: icon rail vs full sidebar; Plan dropdown, 7-day-hold note and Associate lookup styling (the lookup is the app's component); On hold status, facing, dimensions, associate and rate columns, north arrow, "24 FT" / "60 FT" road text (no data); drawer is a sticky card beside the plan, not a full-height flush panel; drawer for a selected plot shows plot details first, with Book as a second step.
