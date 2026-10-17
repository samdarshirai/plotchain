import { EMPTY, Observable, expand, reduce } from 'rxjs';
import { AssociateSummary } from '../models/associate-summary.model';
import { Booking } from '../../plot-bookings/models/associate-booking-page.model';

// Walks every page (for exports); `size` must match the page size `load` requests.
export function collectPages<T>(
  load: (page: number) => Observable<{ rows: T[]; totalElements: number }>, size = 100
): Observable<T[]> {
  return load(0).pipe(
    expand((res, i) => ((i + 1) * size < res.totalElements ? load(i + 1) : EMPTY)),
    reduce((acc, res) => acc.concat(res.rows), [] as T[])
  );
}

// Whole rupees stay clean ("₹15,00,000"); paise appear only when present, so 333333.33 is never shown as 333333.
const inr2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const formatMoney = (n: number): string => inr2.format(n);

// The server compares dates against UTC today, so the client must too.
export const utcDate = (d: Date = new Date()): string => d.toISOString().slice(0, 10);

export function associateLabel(b: Booking, dir: AssociateSummary[]): string {
  const found = dir.find(a => a.id === b.associateId);
  if (!found) { return b.associateName ?? b.associateId.slice(0, 8); }
  return `${b.associateName ?? found.name} (${found.userId})`;
}

export const plotText = (b: { plotNo?: string | null; plotId: string }): string => b.plotNo ?? b.plotId.slice(0, 8);
