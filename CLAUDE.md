# Plotchain project rules

## Phones show the scaled desktop layout (decided 2026-11-27)

- `frontend/src/index.html` sets `<meta name="viewport" content="width=1200">`. Phone browsers render the desktop layout at 1200px wide and scale it down to fit. Users prefer this over a separate mobile layout (Delcon-style).
- Design and verify for desktop (>=1200px). Do not build new phone-specific layouts or breakpoints; the CSS viewport on phones is 1200px so `<=1199px` rules do not fire there.
- Page must still not scroll sideways: at 1200px viewport, page `scrollWidth <= clientWidth`.
- Existing `<=1199px` rules (off-canvas drawer, table scroll) stay in the code but only apply to narrow desktop windows and tablets narrower than 1200px. Don't delete them without asking.
- To revert to real responsive phones: set viewport back to `width=device-width, initial-scale=1`; the Tables section below then applies on phones again.

## Tables: scroll on narrow windows, fit on desktop

- Narrow windows (<=1199px CSS px; not phones while the viewport is fixed at 1200): tables keep their real columns and scroll left/right inside themselves. `frontend/src/styles/_tables.scss` makes every `table` `display:block; overflow-x:auto` with nowrap cells. No wrapper div is needed and the page itself must never scroll sideways.
- Desktop (>=1200px, and phones via the fixed viewport): no table may need a horizontal scrollbar. Don't give tables or cells a fixed `min-width` or wrap them in `overflow-x: auto`; text wraps and padding tightens (see the desktop block in `_tables.scss`).
- A table too wide for any desktop (e.g. view-cancelled-plot, 23 columns) may opt in to scrolling at every width with the `data-scroll` attribute. Use sparingly.
- Write tables as a normal `<thead>` + `<tbody>` (or use `app-editable-table`). Keep money and IDs on one line.
- Check every new or changed table at 1280px (table container `scrollWidth <= clientWidth`). Also check at 390px and 800px if the viewport meta is ever reverted (table may scroll, page must not).
