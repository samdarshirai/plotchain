import { Booking, EmiInstallment } from './models/associate-booking-page.model';

export function paidPercent(b: Booking): number {
  if (!(b.totalAmount > 0)) { return 0; }
  return Math.min(100, Math.max(0, Math.round((b.paidAmount / b.totalAmount) * 100)));
}

// The API only flags overdue on PENDING installments of ACTIVE bookings, but the badge is
// re-guarded here so a stale flag on a PAID/VOID row can never render as overdue.
export const isOverdueRow = (i: EmiInstallment): boolean => i.overdue && i.status === 'PENDING';

export const overdueCount = (b: Booking): number => b.installments.filter(isOverdueRow).length;

// Unit 14 adds plotNo to the response; until then the short plot id is the best label we have.
export const plotLabel = (b: Booking): string => b.plotNo ?? b.plotId.slice(0, 8);
