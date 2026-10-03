import { countByStatus, formatArea, formatInr, formatLakh, groupIntoBlocks, PlotGridItem } from './plot-grid.util';

const plot = (plotNo: string, status: PlotGridItem['status'] = 'AVAILABLE'): PlotGridItem =>
  ({ plotId: 'id-' + plotNo, plotNo, type: 'NORMAL', area: 1200, price: 4500000, status });

describe('plot-grid.util', () => {
  it('formats rupees with Indian grouping', () => {
    expect(formatInr(5130000).replace(/\s/g, '')).toBe('₹51,30,000');
  });

  it('formats lakh shorthand, falling back to full rupees under one lakh', () => {
    expect(formatLakh(5130000)).toBe('₹51.3 L');
    expect(formatLakh(4500000)).toBe('₹45.0 L');
    expect(formatLakh(75000).replace(/\s/g, '')).toBe('₹75,000');
  });

  it('formats area with Indian grouping', () => {
    expect(formatArea(1800)).toBe('1,800');
    expect(formatArea(123456)).toBe('1,23,456');
  });

  it('groups by the plotNo prefix before the first dash', () => {
    const blocks = groupIntoBlocks([plot('B-1'), plot('A-2'), plot('A-1')]);
    expect(blocks.map(b => b.block)).toEqual(['A', 'B']);
    expect(blocks[0].plots.map(p => p.plotNo)).toEqual(['A-1', 'A-2']);
  });

  it('sorts naturally within a block (A-2 before A-10)', () => {
    const blocks = groupIntoBlocks([plot('A-10'), plot('A-2'), plot('A-1')]);
    expect(blocks[0].plots.map(p => p.plotNo)).toEqual(['A-1', 'A-2', 'A-10']);
  });

  it('falls back to one flat group when any plotNo has no dash', () => {
    const blocks = groupIntoBlocks([plot('10'), plot('A-1'), plot('2')]);
    expect(blocks.length).toBe(1);
    expect(blocks[0].block).toBe('');
    expect(blocks[0].plots.map(p => p.plotNo)).toEqual(['2', '10', 'A-1']);
  });

  it('returns no blocks for an empty grid', () => {
    expect(groupIntoBlocks([])).toEqual([]);
  });

  it('counts plots per status including zeros', () => {
    expect(countByStatus([plot('1'), plot('2', 'BOOKED'), plot('3', 'BOOKED')]))
      .toEqual({ AVAILABLE: 1, BOOKED: 2, SOLD: 0 });
  });
});
