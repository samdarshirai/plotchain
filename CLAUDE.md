# Plotchain project rules

## Tables never scroll sideways

No table in the app may need a horizontal scrollbar, at any screen width (phone, tablet, laptop).

- Don't give tables or cells a fixed `min-width`, and don't wrap a table in `overflow-x: auto` to make it fit.
- A table that can't fit its columns switches to stacked cards automatically: `frontend/src/app/shared/utils/table-fit.ts` (started in `AppComponent`) adds `.table--stacked` to any table wider than its container. The card styles are in `frontend/src/styles/_tables.scss`. Card labels come from each cell's `data-label`, and are copied from the column headers if missing.
- Write tables as a normal `<thead>` + `<tbody>` (or use `app-editable-table`) so the stacked mode can label cells.
- Headers break only between words. Keep money and IDs on one line in table mode.
- Check every new or changed table at 390px, 800px and 1280px: the table's container must have `scrollWidth <= clientWidth`, and so must the page.
