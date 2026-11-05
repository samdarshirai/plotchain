import { STACKED_CLASS, fitTable } from './table-fit';

describe('fitTable', () => {
  let box: HTMLDivElement;

  function mount(width: number): HTMLTableElement {
    box = document.createElement('div');
    box.style.width = width + 'px';
    box.innerHTML = `<table>
      <thead><tr><th><span class="th-icon">sell</span>Period</th><th>Amount</th></tr></thead>
      <tbody>
        <tr><td>01 Aug 2026 – 15 Aug 2026</td><td style="white-space:nowrap">₹12,34,56,789.00</td></tr>
        <tr><td colspan="2">empty</td></tr>
      </tbody>
    </table>`;
    document.body.appendChild(box);
    return box.querySelector('table')!;
  }

  afterEach(() => box.remove());

  it('measures against the nearest non-inline ancestor, not an inline component host', () => {
    const table = mount(800);
    const host = document.createElement('app-editable-table');
    table.replaceWith(host);
    host.appendChild(table);
    fitTable(table);
    expect(table.classList).not.toContain(STACKED_CLASS);
  });

  it('leaves a table that fits alone', () => {
    const table = mount(800);
    fitTable(table);
    expect(table.classList).not.toContain(STACKED_CLASS);
  });

  it('stacks an overflowing table and labels cells from headers, minus the icon glyph', () => {
    const table = mount(60);
    fitTable(table);
    expect(table.classList).toContain(STACKED_CLASS);
    const cells = table.tBodies[0].rows[0].cells;
    expect(cells[0].getAttribute('data-label')).toBe('Period');
    expect(cells[1].getAttribute('data-label')).toBe('Amount');
    expect(table.tBodies[0].rows[1].cells[0].hasAttribute('data-label')).toBeFalse();
  });

  it('unstacks once the container is wide enough again', () => {
    const table = mount(60);
    fitTable(table);
    box.style.width = '800px';
    fitTable(table);
    expect(table.classList).not.toContain(STACKED_CLASS);
  });
});
