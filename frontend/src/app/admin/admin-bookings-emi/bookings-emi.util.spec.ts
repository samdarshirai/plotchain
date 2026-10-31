import { Booking } from '../../plot-bookings/models/associate-booking-page.model';
import { of, throwError } from 'rxjs';
import { formatMoney, associateLabel, collectPages, plotText, utcDate } from './bookings-emi.util';

const b = (over: Partial<Booking> = {}): Booking => ({
  id: 'b', plotId: '123e4567-89ab', associateId: 'a1', status: 'ACTIVE', buyerName: 'R', totalAmount: 1000,
  installmentCount: 4, bookedAt: '2026-01-01T00:00:00Z', paidAmount: 200, dueAmount: 800, installments: [], ...over
});
describe('bookings-emi.util', () => {
  it('labels the associate from the directory, else short id', () => {
    const dir = [{ id: 'a1', userId: 'VA-1', name: 'Jane', role: 'ASSOCIATE' as const, status: 'ACTIVE' as const, hasFreeSlot: true }];
    expect(associateLabel(b(), dir)).toBe('Jane (VA-1)');
    expect(associateLabel(b({ associateName: 'Zed' }), dir)).toBe('Zed (VA-1)');
    expect(associateLabel(b({ associateId: 'zzzzzzzzzz' }), dir)).toBe('zzzzzzzz');
  });

  it('labels the plot', () => {
    expect(plotText(b())).toBe('123e4567');
    expect(plotText(b({ plotNo: 'A-12' }))).toBe('A-12');
  });

  it('formatMoney always shows paise with Indian grouping', () => {
    expect(formatMoney(1500000)).toBe('₹15,00,000.00');
    expect(formatMoney(333333.33)).toBe('₹3,33,333.33');
    expect(formatMoney(333333.34)).toBe('₹3,33,333.34');
    expect(formatMoney(0)).toBe('₹0.00');
  });
});

describe('collectPages', () => {
  it('walks every page of size 100 and concatenates rows in order', (done) => {
    const calls: number[] = [];
    const load = (p: number) => { calls.push(p); return of({ rows: [`r${p}`], totalElements: 250 }); };
    collectPages(load, 100).subscribe(rows => { expect(rows).toEqual(['r0', 'r1', 'r2']); expect(calls).toEqual([0, 1, 2]); done(); });
  });
  it('makes one call when everything fits on the first page', (done) => {
    let n = 0;
    collectPages(() => { n++; return of({ rows: ['a'], totalElements: 1 }); }, 100).subscribe(rows => { expect(rows).toEqual(['a']); expect(n).toBe(1); done(); });
  });
  it('returns an empty array for an empty result', (done) => {
    collectPages(() => of({ rows: [] as string[], totalElements: 0 }), 100).subscribe(rows => { expect(rows).toEqual([]); done(); });
  });
  it('propagates a failure on a later page', (done) => {
    collectPages(p => (p === 1 ? throwError(() => new Error('x')) : of({ rows: ['a'], totalElements: 150 })), 100)
      .subscribe({ error: e => { expect(e.message).toBe('x'); done(); } });
  });
});

describe('utcDate', () => {
  it('returns the UTC calendar date regardless of local zone', () => {
    expect(utcDate(new Date('2026-03-01T23:30:00-05:00'))).toBe('2026-03-02');
    expect(utcDate(new Date('2026-03-01T00:30:00+05:30'))).toBe('2026-02-28');
  });
});
