import { Booking } from '../../plot-bookings/models/associate-booking-page.model';
import { BookingEmiConfig } from './bookings-emi.model';
import { of, throwError } from 'rxjs';
import { formatMoney, associateLabel, classifyError, collectPages, meterPercent, plotText, previewSchedule, willAutoConfirm } from './bookings-emi.util';

const b = (over: Partial<Booking> = {}): Booking => ({
  id: 'b', plotId: '123e4567-89ab', associateId: 'a1', status: 'ACTIVE', buyerName: 'R', totalAmount: 1000,
  installmentCount: 4, bookedAt: '2026-01-01T00:00:00Z', paidAmount: 200, dueAmount: 800, installments: [], ...over
});
const auto = (pct: number | null): BookingEmiConfig =>
  ({ emiEnabled: true, defaultInstallmentCount: 4, confirmRule: 'AUTO_THRESHOLD', confirmThresholdPercent: pct, updatedAt: '2026-01-01T00:00:00Z' });

describe('bookings-emi.util', () => {
  it('meterPercent clamps and survives zero total', () => {
    expect(meterPercent(250, 1000)).toBe(25);
    expect(meterPercent(1, 0)).toBe(0);
    expect(meterPercent(2000, 1000)).toBe(100);
    expect(meterPercent(-1, 1000)).toBe(0);
    expect(meterPercent(NaN, 1000)).toBe(0);
    expect(meterPercent(996, 1000)).toBe(99);
    expect(meterPercent(1000, 1000)).toBe(100);
  });

  it('predicts auto-confirm only under AUTO_THRESHOLD when paid+installment reaches the threshold', () => {
    expect(willAutoConfirm(b({ paidAmount: 200 }), 100, auto(30))).toBeTrue();   // 300/1000 = 30%
    expect(willAutoConfirm(b({ paidAmount: 200 }), 99, auto(30))).toBeFalse();
    expect(willAutoConfirm(b(), 900, { ...auto(30), confirmRule: 'MANUAL' })).toBeFalse();
    expect(willAutoConfirm(b(), 900, { ...auto(30), emiEnabled: false })).toBeTrue(); // backend ignores emiEnabled: EMI off = one full instalment, always crosses
    expect(willAutoConfirm(b(), 900, auto(null))).toBeFalse();
    expect(willAutoConfirm(b(), 900, null)).toBeFalse();
    expect(willAutoConfirm(b({ totalAmount: 0 }), 10, auto(30))).toBeFalse();
    expect(willAutoConfirm(b({ status: 'CONFIRMED' }), 900, auto(30))).toBeFalse();
    expect(willAutoConfirm(b({ status: 'CANCELLED' }), 900, auto(30))).toBeFalse();
  });

  it('auto-confirm uses exact math at the boundary', () => {
    expect(willAutoConfirm(b({ paidAmount: 190 }), 100, auto(29))).toBeTrue();   // 290/1000
    expect(willAutoConfirm(b({ paidAmount: 189 }), 100, auto(29))).toBeFalse();  // 289/1000
  });

  it('plot drift is recognised by the 409 code even when the text differs', () => {
    expect(classifyError({ status: 409, error: { error: 'something else', code: 'PLOT_NOT_AVAILABLE' } }, 'pay').kind).toBe('plotDrift');
  });

  it('classifies pay errors by status and text', () => {
    const e = (status: number, error?: string) => ({ status, error: error ? { error } : undefined });
    expect(classifyError(e(400, 'Payment amount must equal the installment amount 100'), 'pay').kind).toBe('amountMismatch');
    expect(classifyError(e(409, 'Booking is not ACTIVE'), 'pay').kind).toBe('notActive');
    expect(classifyError(e(409, 'Installment 4 of booking x is not payable'), 'pay').kind).toBe('notPayable');
    expect(classifyError(e(409, 'Plot is not available for booking: abc'), 'pay').kind).toBe('plotDrift');
    expect(classifyError(e(409, 'Plot is not available for booking: abc'), 'confirm').kind).toBe('plotDrift');
    expect(classifyError(e(404, 'Booking not found'), 'pay').kind).toBe('notFound');
    expect(classifyError(e(400), 'cancel').kind).toBe('validation');
    expect(classifyError(e(400, 'Booking is already assigned to associate x'), 'transfer').kind).toBe('sameAssociate');
    expect(classifyError(e(400, 'Cannot transfer booking to associate x: associate is PENDING, must be ACTIVE'), 'transfer').kind).toBe('invalidTarget');
    expect(classifyError(e(0), 'pay').kind).toBe('network');
    expect(classifyError(e(500), 'pay').kind).toBe('generic');
  });

  it('keeps the raw server text for support', () => {
    expect(classifyError({ status: 409, error: { error: 'Booking is not ACTIVE' } }, 'pay').serverText).toBe('Booking is not ACTIVE');
  });

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

  // extra edge cases (task-2 verification)
  it('edge: paid > total clamps to 100; NaN total is 0; threshold 0 never auto-confirms (server <=0 rule)', () => {
    expect(meterPercent(5000, 1000)).toBe(100);
    expect(meterPercent(0, 1000)).toBe(0);
    expect(meterPercent(1, NaN)).toBe(0);
    expect(willAutoConfirm(b({ paidAmount: 5000 }), 0, auto(30))).toBeTrue();
    expect(willAutoConfirm(b({ paidAmount: 0 }), 0, auto(0))).toBeFalse();
  });

  it('edge: every error kind is reachable and op-gated', () => {
    const e = (status: number, error?: string) => ({ status, error: error ? { error } : undefined });
    expect(classifyError(e(409), 'pay')).toEqual({ kind: 'generic', serverText: undefined });
    expect(classifyError(e(0, 'x'), 'transfer').kind).toBe('network');
    expect(classifyError(e(400, 'must equal the installment amount'), 'confirm').kind).toBe('validation');
    expect(classifyError(e(400, 'already assigned'), 'pay').kind).toBe('validation');
    expect(classifyError(e(404), 'cancel').kind).toBe('notFound');
    expect(classifyError(e(404), 'transfer').kind).toBe('invalidTarget');
  });

  it('formatMoney keeps whole rupees clean and shows paise when present', () => {
    expect(formatMoney(1500000)).toBe('₹15,00,000');
    expect(formatMoney(333333.33)).toBe('₹3,33,333.33');
    expect(formatMoney(333333.34)).toBe('₹3,33,333.34');
    expect(formatMoney(0)).toBe('₹0');
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

describe('classifyError confirmPayment', () => {
  const e = (status: number, error?: string, code?: string) => ({ status, error: { error, code } });
  it('maps "no entered payment to confirm" 409 to notEntered', () => {
    expect(classifyError(e(409, 'Installment 2 of booking b has no entered payment to confirm'), 'confirmPayment').kind).toBe('notEntered');
  });
  it('maps plot drift, not ACTIVE, 404 and network like the other ops', () => {
    expect(classifyError(e(409, 'x', 'PLOT_NOT_AVAILABLE'), 'confirmPayment').kind).toBe('plotDrift');
    expect(classifyError(e(409, 'Booking b is not ACTIVE'), 'confirmPayment').kind).toBe('notActive');
    expect(classifyError(e(404, 'gone'), 'confirmPayment').kind).toBe('notFound');
    expect(classifyError({ status: 0 }, 'confirmPayment').kind).toBe('network');
  });
});

describe('previewSchedule', () => {
  it('splits in cents with the remainder on the last row', () => {
    expect(previewSchedule(70000, 3, '2026-11-05')).toEqual([
      { n: 1, dueDate: '2026-11-05', amount: 23333.33 },
      { n: 2, dueDate: '2026-12-05', amount: 23333.33 },
      { n: 3, dueDate: '2027-01-05', amount: 23333.34 }
    ]);
  });
  it('clamps month-end dates without drifting', () => {
    expect(previewSchedule(100, 3, '2026-01-31').map(r => r.dueDate)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });
  it('returns [] for a sub-cent base, bad count, zero balance or bad date', () => {
    expect(previewSchedule(0.05, 60, '2026-11-05')).toEqual([]);
    expect(previewSchedule(100, 0, '2026-11-05')).toEqual([]);
    expect(previewSchedule(0, 3, '2026-11-05')).toEqual([]);
    expect(previewSchedule(100, 3, '')).toEqual([]);
  });
});

describe('classifyError reschedule', () => {
  it('maps the reschedule outcomes', () => {
    expect(classifyError({ status: 409, error: { code: 'NO_REMAINING_BALANCE' } }, 'reschedule').kind).toBe('noBalance');
    const v = classifyError({ status: 400, error: { error: 'too small' } }, 'reschedule');
    expect(v.kind).toBe('validation');
    expect(v.serverText).toBe('too small');
    expect(classifyError({ status: 409, error: { error: 'Booking is not ACTIVE: x' } }, 'reschedule').kind).toBe('notActive');
    expect(classifyError({ status: 0 }, 'reschedule').kind).toBe('network');
  });
});
