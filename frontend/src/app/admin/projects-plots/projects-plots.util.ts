import { PlotGridItem } from '../../shared/utils/plot-grid.util';
import { PlotStatus } from '../../setup/models/project.model';

// Matches plot number, status code, or the translated status label (case-insensitive substring).
export function filterPlotRows(
  rows: PlotGridItem[], query: string, statusLabel: (s: PlotStatus) => string
): PlotGridItem[] {
  const q = query.trim().toLowerCase();
  if (!q) { return rows; }
  return rows.filter(r =>
    r.plotNo.toLowerCase().includes(q) ||
    r.status.toLowerCase().includes(q) ||
    statusLabel(r.status).toLowerCase().includes(q));
}
