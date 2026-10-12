import { PlotGridItem } from '../../shared/utils/plot-grid.util';
import { PlotStatus } from '../../setup/models/project.model';
import { filterPlotRows } from './projects-plots.util';

const row = (plotNo: string, status: PlotStatus): PlotGridItem =>
  ({ plotId: plotNo, plotNo, type: 'NORMAL', area: 1, price: 1, status }) as PlotGridItem;
const rows = [row('A-12', 'AVAILABLE'), row('A-1', 'BOOKED'), row('B-2', 'SOLD')];
const label = (s: PlotStatus) => (s === 'BOOKED' ? 'Booked' : s === 'SOLD' ? 'बिक गया' : 'Available');

describe('filterPlotRows', () => {
  it('returns the same rows for an empty or whitespace query', () => {
    expect(filterPlotRows(rows, '', label)).toBe(rows);
    expect(filterPlotRows(rows, '   ', label)).toBe(rows);
  });
  it('matches plot number case-insensitively', () => {
    expect(filterPlotRows(rows, 'a-1', label).map(r => r.plotNo)).toEqual(['A-12', 'A-1']);
  });
  it('matches the translated status label', () => {
    expect(filterPlotRows(rows, 'book', label).map(r => r.plotNo)).toEqual(['A-1']);
  });
  it('matches the status code even when the label differs', () => {
    expect(filterPlotRows(rows, 'sold', label).map(r => r.plotNo)).toEqual(['B-2']);
  });
  it('trims the query and returns [] when nothing matches', () => {
    expect(filterPlotRows(rows, '  b-2 ', label).map(r => r.plotNo)).toEqual(['B-2']);
    expect(filterPlotRows(rows, 'zzz', label)).toEqual([]);
  });
});
