// Project rule: no table ever scrolls sideways. Any <table> wider than its container is switched
// to stacked cards (`table--stacked`, see _tables.scss): one card per row, each cell labelled
// with its column header. Runs app-wide, so new tables get this for free.
// ponytail: re-measures every table on any DOM change; scope the MutationObserver if it ever shows in a profile.

export const STACKED_CLASS = 'table--stacked';

// Header text without the Material icon glyph name that editable-table puts in each <th>.
function headerLabel(th: Element): string {
  return Array.from(th.childNodes)
    .filter(n => !(n instanceof Element && n.classList.contains('th-icon')))
    .map(n => n.textContent ?? '')
    .join('')
    .trim();
}

function labelCells(table: HTMLTableElement): void {
  const heads = Array.from(table.tHead?.rows[0]?.cells ?? []);
  if (!heads.length) {
    return;
  }
  for (const body of Array.from(table.tBodies)) {
    for (const row of Array.from(body.rows)) {
      if (row.cells.length !== heads.length) {
        continue; // colspan rows (empty state, group headings) keep their own layout
      }
      Array.from(row.cells).forEach((cell, i) => {
        if (!cell.hasAttribute('data-label')) {
          cell.setAttribute('data-label', headerLabel(heads[i]));
        }
      });
    }
  }
}

// The box the table must fit in: nearest ancestor that isn't inline (component hosts like
// <app-editable-table> are inline, with clientWidth 0).
export function tableContainer(table: HTMLTableElement): HTMLElement | null {
  let el = table.parentElement;
  while (el && ['inline', 'contents'].includes(getComputedStyle(el).display)) {
    el = el.parentElement;
  }
  return el;
}

// Measures the table at its natural (unstacked) width, then stacks it only if that overflows.
// Remove + re-add happens in one task, so there's no visible flicker.
export function fitTable(table: HTMLTableElement): void {
  const parent = tableContainer(table);
  if (!parent || !table.isConnected) {
    return;
  }
  table.classList.remove(STACKED_CLASS);
  if (table.offsetWidth > parent.clientWidth + 1 || parent.scrollWidth > parent.clientWidth + 1) {
    labelCells(table);
    table.classList.add(STACKED_CLASS);
  }
}

export function startTableFit(root: HTMLElement = document.body): () => void {
  const watched = new WeakSet<Element>();
  let pending = false;

  const fitAll = () => {
    pending = false;
    root.querySelectorAll('table').forEach(t => {
      fitTable(t as HTMLTableElement);
      for (const el of [t, tableContainer(t as HTMLTableElement)]) {
        if (el && !watched.has(el)) {
          watched.add(el);
          resize.observe(el);
        }
      }
    });
  };
  const schedule = () => {
    if (!pending) {
      pending = true;
      requestAnimationFrame(fitAll);
    }
  };

  const resize = new ResizeObserver(schedule);
  const mutations = new MutationObserver(schedule);
  mutations.observe(root, { childList: true, subtree: true, characterData: true });
  schedule();

  return () => {
    resize.disconnect();
    mutations.disconnect();
  };
}
