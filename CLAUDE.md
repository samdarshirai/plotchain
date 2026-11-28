# Plotchain project rules

## Phones use the real responsive layout (decided 2026-11-28)

- `frontend/src/index.html` sets `<meta name="viewport" content="width=device-width, initial-scale=1">`. Phones get the real mobile layout, not a scaled desktop. This supersedes the 2026-11-27 `width=1200` decision.
- Every UI change must work at 360-390px: `npm run test:mobile`, `ADMIN_ROUTES` in `frontend/e2e/mobile.spec.ts`. Admin shell = off-canvas drawer <768px; use `minmax(0, 1fr)` in collapsing grids.
- Page must never scroll sideways at phone width (`scrollWidth <= clientWidth`).

## Tables: scroll on narrow windows, fit on desktop

- Narrow windows and phones (<=1199px CSS px): tables keep their real columns and scroll left/right inside themselves. `frontend/src/styles/_tables.scss` makes every `table` `display:block; overflow-x:auto` with nowrap cells. No wrapper div is needed and the page itself must never scroll sideways.
- Desktop (>=1200px): no table may need a horizontal scrollbar. Don't give tables or cells a fixed `min-width` or wrap them in `overflow-x: auto`; text wraps and padding tightens (see the desktop block in `_tables.scss`).
- A table too wide for any desktop (e.g. view-cancelled-plot, 23 columns) may opt in to scrolling at every width with the `data-scroll` attribute. Use sparingly.
- Write tables as a normal `<thead>` + `<tbody>` (or use `app-editable-table`). Keep money and IDs on one line.
- Check every new or changed table at 1280px (table container `scrollWidth <= clientWidth`). Also check at 390px and 800px (table may scroll, page must not).
