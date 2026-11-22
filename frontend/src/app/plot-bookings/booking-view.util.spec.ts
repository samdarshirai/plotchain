import { Booking, EmiInstallment } from './models/associate-booking-page.model';
import { isOverdueRow, overdueCount, paidPercent, paymentsOf, plotLabel } from './booking-view.util';

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
});
