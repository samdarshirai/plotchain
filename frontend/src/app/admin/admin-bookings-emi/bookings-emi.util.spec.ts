import { Booking } from '../../plot-bookings/models/associate-booking-page.model';
import { BookingEmiConfig } from './bookings-emi.model';
import { associateLabel, classifyError, meterPercent, plotText, willAutoConfirm } from './bookings-emi.util';

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
  });

  it('predicts auto-confirm only under AUTO_THRESHOLD when paid+installment reaches the threshold', () => {
    expect(willAutoConfirm(b({ paidAmount: 200 }), 100, auto(30))).toBeTrue();   // 300/1000 = 30%
    expect(willAutoConfirm(b({ paidAmount: 200 }), 99, auto(30))).toBeFalse();
    expect(willAutoConfirm(b(), 900, { ...auto(30), confirmRule: 'MANUAL' })).toBeFalse();
    expect(willAutoConfirm(b(), 900, { ...auto(30), emiEnabled: false })).toBeFalse();
    expect(willAutoConfirm(b(), 900, auto(null))).toBeFalse();
    expect(willAutoConfirm(b(), 900, null)).toBeFalse();
    expect(willAutoConfirm(b({ totalAmount: 0 }), 10, auto(30))).toBeFalse();
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
    const dir = [{ id: 'a1', userId: 'VA-1', name: 'Jane', role: 'ASSOCIATE' as const, hasFreeSlot: true }];
    expect(associateLabel(b(), dir)).toBe('Jane (VA-1)');
    expect(associateLabel(b({ associateName: 'Zed' }), dir)).toBe('Zed (VA-1)');
    expect(associateLabel(b({ associateId: 'zzzzzzzzzz' }), dir)).toBe('zzzzzzzz');
  });

  it('labels the plot', () => {
    expect(plotText(b())).toBe('123e4567');
    expect(plotText(b({ plotNo: 'A-12' }))).toBe('A-12');
  });

  // extra edge cases (task-2 verification)
  it('edge: paid > total clamps to 100; NaN-ish total is 0; boundary threshold inclusive', () => {
    expect(meterPercent(5000, 1000)).toBe(100);
    expect(meterPercent(0, 1000)).toBe(0);
    expect(meterPercent(1, NaN)).toBe(0);
    expect(willAutoConfirm(b({ paidAmount: 5000 }), 0, auto(30))).toBeTrue();
    expect(willAutoConfirm(b({ paidAmount: 0 }), 0, auto(0))).toBeTrue();
  });

  it('edge: every error kind is reachable and op-gated', () => {
    const e = (status: number, error?: string) => ({ status, error: error ? { error } : undefined });
    expect(classifyError(e(409), 'pay')).toEqual({ kind: 'generic', serverText: undefined });
    expect(classifyError(e(0, 'x'), 'transfer').kind).toBe('network');
    expect(classifyError(e(400, 'must equal the installment amount'), 'confirm').kind).toBe('validation');
    expect(classifyError(e(400, 'already assigned'), 'pay').kind).toBe('validation');
    expect(classifyError(e(404), 'cancel').kind).toBe('notFound');
  });
});
