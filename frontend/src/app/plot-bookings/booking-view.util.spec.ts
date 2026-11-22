import { Booking, EmiInstallment } from './models/associate-booking-page.model';
import { isOverdueRow, overdueCount, paidPercent, paymentsOf, plotLabel, summarize } from './booking-view.util';

const inst = (over: Partial<EmiInstallment> = {}): EmiInstallment =>
  ({ installmentNumber: 1, amount: 100, dueDate: '2026-01-01', status: 'PENDING', paidAt: null, overdue: false, ...over });
const booking = (over: Partial<Booking> = {}): Booking => ({
  id: 'b1', plotId: '123e4567-e89b-12d3-a456-426614174000', associateId: 'a', status: 'ACTIVE', buyerName: 'R',
  totalAmount: 400, installmentCount: 4, bookedAt: '2026-01-01T00:00:00Z', paidAmount: 100, dueAmount: 300,
  installments: [inst()], ...over
});

describe('booking-view.util', () => {
  it('computes a rounded paid percentage', () => {
    expect(paidPercent(booking())).toBe(25);
    expect(paidPercent(booking({ paidAmount: 133, totalAmount: 400 }))).toBe(33);
  });

  it('never returns NaN or more than 100 or less than 0', () => {
    expect(paidPercent(booking({ totalAmount: 0, paidAmount: 0 }))).toBe(0);
    expect(paidPercent(booking({ paidAmount: 500, totalAmount: 400 }))).toBe(100);
    expect(paidPercent(booking({ paidAmount: -5 }))).toBe(0);
  });

  it('counts overdue only on PENDING installments flagged overdue', () => {
    const b = booking({ installments: [
      inst({ overdue: true }), inst({ installmentNumber: 2, overdue: true }),
      inst({ installmentNumber: 3, status: 'PAID', overdue: true }),   // stale flag must not count
      inst({ installmentNumber: 4, status: 'VOID', overdue: true }),
      inst({ installmentNumber: 5 })
    ] });
    expect(overdueCount(b)).toBe(2);
    expect(isOverdueRow(b.installments[2])).toBeFalse();
    expect(isOverdueRow(b.installments[0])).toBeTrue();
  });

  it('labels the plot by plotNo when present, else the first 8 chars of the plot id', () => {
    expect(plotLabel(booking())).toBe('123e4567');
    expect(plotLabel(booking({ plotNo: 'A-12' }))).toBe('A-12');
  });

  describe('paymentsOf', () => {
    it('keeps only ENTERED/PAID rows that have paidAt, newest first', () => {
      const out = paymentsOf([
        inst({ installmentNumber: 1, status: 'PAID', paidAt: '2026-10-02T00:00:00Z' }),
        inst({ installmentNumber: 2, status: 'ENTERED', paidAt: '2026-10-05T00:00:00Z' }),
        inst({ installmentNumber: 3, status: 'PENDING' }),
        inst({ installmentNumber: 4, status: 'PAID', paidAt: null })
      ]);
      expect(out.map(i => i.installmentNumber)).toEqual([2, 1]);
    });

    it('returns [] for undefined', () => {
      expect(paymentsOf(undefined)).toEqual([]);
    });

    it('does not reorder the input array', () => {
      const a = inst({ installmentNumber: 1, status: 'PAID', paidAt: '2026-10-02T00:00:00Z' });
      const b = inst({ installmentNumber: 2, status: 'PAID', paidAt: '2026-10-05T00:00:00Z' });
      const input = [a, b];
      paymentsOf(input);
      expect(input).toEqual([a, b]);
    });
  });

  describe('summarize', () => {
    const base = { total: 400, paid: 100 };

    it('computes paid percent, clamped, 0 when total is 0', () => {
      expect(summarize({ total: 400, paid: 100 }).paidPct).toBe(25);
      expect(summarize({ total: 0, paid: 0 }).paidPct).toBe(0);
      expect(summarize({ total: 400, paid: 500 }).paidPct).toBe(100);
    });

    it('counts payments, pending ones and the newest paid date', () => {
      const s = summarize({ ...base, installments: [
        inst({ installmentNumber: 1, status: 'PAID', paidAt: '2026-10-02T00:00:00Z' }),
        inst({ installmentNumber: 2, status: 'PAID', paidAt: '2026-10-09T00:00:00Z' }),
        inst({ installmentNumber: 3, status: 'ENTERED', paidAt: '2026-10-05T00:00:00Z' })] });
      expect(s.paymentCount).toBe(3);
      expect(s.pendingCount).toBe(1);
      expect(s.lastPaidAt).toBe('2026-10-09T00:00:00Z');
    });

    it('next due is the earliest PENDING installment', () => {
      const s = summarize({ ...base, installments: [
        inst({ installmentNumber: 2, status: 'PENDING', dueDate: '2027-01-05', amount: 50000 }),
        inst({ installmentNumber: 1, status: 'PENDING', dueDate: '2026-12-05', amount: 30000 })] });
      expect(s.nextDue).toEqual({ dueDate: '2026-12-05', amount: 30000 });
      expect(summarize({ ...base, installments: [inst({ status: 'PAID', paidAt: '2026-10-02T00:00:00Z' })] }).nextDue).toBeNull();
    });

    it('overdue count and amount come from isOverdueRow', () => {
      const s = summarize({ ...base, installments: [
        inst({ installmentNumber: 1, status: 'PENDING', overdue: true, amount: 30000 }),
        inst({ installmentNumber: 2, status: 'PENDING', overdue: true, amount: 30000 }),
        inst({ installmentNumber: 3, status: 'PAID', overdue: true, paidAt: '2026-10-02T00:00:00Z' })] });
      expect(s.overdueCount).toBe(2);
      expect(s.overdueAmount).toBe(60000);
    });

    it('handles missing installments', () => {
      const s = summarize({ total: 100, paid: 0 });
      expect([s.paymentCount, s.pendingCount, s.nextDue, s.lastPaidAt, s.overdueCount]).toEqual([0, 0, null, null, 0]);
    });
  });
});
