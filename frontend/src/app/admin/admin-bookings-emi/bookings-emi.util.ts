import { AssociateSummary } from '../models/associate-summary.model';
import { Booking } from '../../plot-bookings/models/associate-booking-page.model';
import { BookingEmiConfig } from './bookings-emi.model';

export type ErrorKind =
  | 'amountMismatch' | 'notActive' | 'notPayable' | 'plotDrift' | 'notFound'
  | 'sameAssociate' | 'invalidTarget' | 'validation' | 'network' | 'generic';

// Whole rupees stay clean ("₹15,00,000"); paise appear only when present, so 333333.33 is never shown as 333333.
const inr2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const formatMoney = (n: number): string => inr2.format(n);

export function meterPercent(paid: number, total: number): number {
  if (!(total > 0) || !(paid > 0)) { return 0; }
  if (paid >= total) { return 100; }
  return Math.floor((paid * 100) / total);
}

// Client-side prediction only; the server is authoritative and the refreshed booking shows the real outcome.
export function willAutoConfirm(b: Booking, installmentAmount: number, cfg: BookingEmiConfig | null): boolean {
  if (!cfg || cfg.confirmRule !== 'AUTO_THRESHOLD' || b.status !== 'ACTIVE') { return false; }
  const pct = cfg.confirmThresholdPercent;
  if (pct == null || !(pct > 0) || !(b.totalAmount > 0)) { return false; }
  // mirrors server thresholdReached: exact math, no division
  return (b.paidAmount + installmentAmount) * 100 >= pct * b.totalAmount;
}

// ponytail: matches the server's error text -- brittle by design (DESIGN Q4); a distinct error `code`
// from the backend would replace these substring checks.
export function classifyError(
  err: { status: number; error?: { error?: string } },
  op: 'pay' | 'confirm' | 'cancel' | 'transfer'
): { kind: ErrorKind; serverText?: string } {
  const text = err.error?.error;
  const done = (kind: ErrorKind) => ({ kind, serverText: text });
  if (err.status === 0) { return done('network'); }
  if (err.status === 404) { return done(op === 'transfer' ? 'invalidTarget' : 'notFound'); } // transfer 404 = unknown target associate
  if (err.status === 409) {
    if (text?.includes('Plot is not available')) { return done('plotDrift'); }
    if (text?.includes('not payable')) { return done('notPayable'); }
    if (text?.includes('not ACTIVE')) { return done('notActive'); }
    return done('generic');
  }
  if (err.status === 400) {
    if (op === 'pay' && text?.includes('must equal the installment amount')) { return done('amountMismatch'); }
    if (op === 'transfer' && text?.includes('already assigned')) { return done('sameAssociate'); }
    if (op === 'transfer' && text?.includes('Cannot transfer')) { return done('invalidTarget'); }
    return done('validation');
  }
  return done('generic');
}

export function associateLabel(b: Booking, dir: AssociateSummary[]): string {
  const found = dir.find(a => a.id === b.associateId);
  if (!found) { return b.associateName ?? b.associateId.slice(0, 8); }
  return `${b.associateName ?? found.name} (${found.userId})`;
}

export const plotText = (b: { plotNo?: string | null; plotId: string }): string => b.plotNo ?? b.plotId.slice(0, 8);
