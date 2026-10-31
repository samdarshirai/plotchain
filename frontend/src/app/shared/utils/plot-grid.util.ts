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
  extraPrice?: number;
  extraPercent?: number;
  roadSizeFt?: number | null;
}

// Default Extra % per plot-type part, from the project (corner 10 / park facing 5 / road side 5 by default).
export interface ExtraDefaults { corner: number; parkFacing: number; roadSide: number }

export function plotTypeParts(t: PlotType): { corner: boolean; park: boolean; road: boolean } {
  return { corner: t.startsWith('CORNER'), park: t.endsWith('PARK_FACING'), road: t.endsWith('ROAD_SIDE') };
}

// Combination types stack: the defaults of each part are added, not compounded.
export function defaultExtraPercent(t: PlotType, d: ExtraDefaults): number {
  const p = plotTypeParts(t);
  const sum = (p.corner ? d.corner : 0) + (p.park ? d.parkFacing : 0) + (p.road ? d.roadSide : 0);
  return Math.round(sum * 100) / 100; // 2 dp like the DB column; avoids 0.30000000000000004 in the input
}

export interface PlotBlock {
  block: string;
  plots: PlotGridItem[];
}

export type StatusCounts = Record<PlotStatus, number>;

// Every money figure reads Indian-grouped with paise: ₹10,00,000.00.
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const grouped = new Intl.NumberFormat('en-IN');
const amount2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

export const formatInr = (n: number): string => inr.format(n);
export const formatArea = (n: number): string => grouped.format(n);
// Same as formatInr without the ₹, for columns whose header already says the unit.
export const formatAmount = (n: number): string => amount2.format(n);

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
