# Plotchain project rules

## Tables: scroll on mobile, fit on desktop

- Phones/narrow tablets (<=1199px): tables keep their real columns and scroll left/right inside themselves. `frontend/src/styles/_tables.scss` makes every `table` `display:block; overflow-x:auto` with nowrap cells. No wrapper div is needed and the page itself must never scroll sideways.
- Desktop (>=1200px): no table may need a horizontal scrollbar. Don't give tables or cells a fixed `min-width` or wrap them in `overflow-x: auto`; text wraps and padding tightens (see the desktop block in `_tables.scss`).
- A table too wide for any desktop (e.g. view-cancelled-plot, 23 columns) may opt in to scrolling at every width with the `data-scroll` attribute. Use sparingly.
- Write tables as a normal `<thead>` + `<tbody>` (or use `app-editable-table`). Keep money and IDs on one line.
- Check every new or changed table at 390px (table may scroll, page must not: page `scrollWidth <= clientWidth`) and at 800px and 1280px (table container `scrollWidth <= clientWidth`).
