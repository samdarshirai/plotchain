import { PlotStatus, PlotType } from '../../setup/models/project.model';

// Row of GET /api/projects/{id}/plots/grid (plot-booking unit 10). Deliberately has no rate,
// buyer or booking data; the admin screen fetches rate separately.
export interface PlotGridItem {
  plotId: string;
  plotNo: string;
  type: PlotType;
  area: number;
  price: number;
  status: PlotStatus;
}

export interface PlotBlock {
  block: string;
  plots: PlotGridItem[];
}

export type StatusCounts = Record<PlotStatus, number>;

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const grouped = new Intl.NumberFormat('en-IN');
const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

export const formatInr = (n: number): string => inr.format(n);
export const formatArea = (n: number): string => grouped.format(n);

// "₹51.3 L" tile shorthand; below one lakh the full figure reads better than "₹0.8 L".
export function formatLakh(n: number): string {
  return n < 100000 ? formatInr(n) : `₹${(n / 100000).toFixed(1)} L`;
}

// The API has no block field, so a block is the plotNo prefix before the first "-". One plotNo
// without a dash makes the whole grid a single unnamed group rather than a mixed bag.
export function groupIntoBlocks(plots: PlotGridItem[]): PlotBlock[] {
  if (!plots.length) {
    return [];
  }
  const dashed = plots.every(p => p.plotNo.includes('-'));
  const byBlock = new Map<string, PlotGridItem[]>();
  for (const p of plots) {
    const key = dashed ? p.plotNo.slice(0, p.plotNo.indexOf('-')) : '';
    byBlock.set(key, [...(byBlock.get(key) ?? []), p]);
  }
  return [...byBlock.entries()]
    .sort(([a], [b]) => natural(a, b))
    .map(([block, items]) => ({ block, plots: items.sort((a, b) => natural(a.plotNo, b.plotNo)) }));
}

export function countByStatus(plots: PlotGridItem[]): StatusCounts {
  const counts: StatusCounts = { AVAILABLE: 0, BOOKED: 0, SOLD: 0 };
  for (const p of plots) {
    counts[p.status]++;
  }
  return counts;
}
