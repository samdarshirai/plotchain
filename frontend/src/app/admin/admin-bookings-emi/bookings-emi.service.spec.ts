import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { BookingsEmiService } from './bookings-emi.service';

describe('BookingsEmiService', () => {
  let s: BookingsEmiService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    s = TestBed.inject(BookingsEmiService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('lists with only the set filters plus paging', () => {
    s.list({ status: 'ACTIVE', associateId: '', plotId: '', projectId: 'p1', overdue: true }, 2, 20).subscribe();
    const r = http.expectOne(x => x.url === '/api/admin/bookings');
    expect(r.request.params.get('status')).toBe('ACTIVE');
    expect(r.request.params.get('projectId')).toBe('p1');
    expect(r.request.params.get('overdue')).toBe('true');
    expect(r.request.params.get('page')).toBe('2');
    expect(r.request.params.get('size')).toBe('20');
    expect(r.request.params.has('associateId')).toBeFalse();
    expect(r.request.params.has('plotId')).toBeFalse();
    r.flush({ bookings: [], page: 2, size: 20, totalElements: 0 });
  });

  it('omits overdue when false', () => {
    s.list({ status: '', associateId: '', plotId: '', projectId: '', overdue: false }, 0, 20).subscribe();
    const r = http.expectOne(x => x.url === '/api/admin/bookings');
    expect(r.request.params.has('status')).toBeFalse();
    expect(r.request.params.has('associateId')).toBeFalse();
    expect(r.request.params.has('plotId')).toBeFalse();
    expect(r.request.params.has('projectId')).toBeFalse();
    expect(r.request.params.has('overdue')).toBeFalse();
    r.flush({});
  });

  it('gets one booking', () => {
    s.get('b1').subscribe();
    const r = http.expectOne('/api/admin/bookings/b1');
    expect(r.request.method).toBe('GET');
    r.flush({});
  });

  it('pays with PATCH and the body', () => {
    s.pay('b1', 3, { amount: 100, paymentRef: 'R1', paymentMode: 'CASH' }).subscribe();
    const r = http.expectOne('/api/admin/bookings/b1/installments/3/pay');
    expect(r.request.method).toBe('PATCH');
    expect(r.request.body).toEqual({ amount: 100, paymentRef: 'R1', paymentMode: 'CASH' });
    r.flush({});
  });

  it('pays with paidAt included in body', () => {
    s.pay('b1', 2, { amount: 50, paymentRef: 'R2', paymentMode: 'CASH', paidAt: '2026-10-05' }).subscribe();
    const r = http.expectOne('/api/admin/bookings/b1/installments/2/pay');
    expect(r.request.body).toEqual({ amount: 50, paymentRef: 'R2', paymentMode: 'CASH', paidAt: '2026-10-05' });
    r.flush({});
  });

  it('confirm / cancel / transfer POST the right bodies', () => {
    s.confirm('b1').subscribe();
    const confirmReq = http.expectOne('/api/admin/bookings/b1/confirm');
    expect(confirmReq.request.method).toBe('POST');
    expect(confirmReq.request.body).toEqual({});
    s.cancel('b1', 'why').subscribe();
    const cancelReq = http.expectOne('/api/admin/bookings/b1/cancel');
    expect(cancelReq.request.method).toBe('POST');
    expect(cancelReq.request.body).toEqual({ reason: 'why' });
    s.transfer('b1', 'a2').subscribe();
    const transferReq = http.expectOne('/api/admin/bookings/b1/transfer');
    expect(transferReq.request.method).toBe('POST');
    expect(transferReq.request.body).toEqual({ associateId: 'a2' });
    http.match(() => true).forEach(r => r.flush({}));
  });

  it('reads overdue report and config', () => {
    s.overdue(0, 1).subscribe();
    const overdueReq = http.expectOne(x => x.url === '/api/admin/emi-reports/overdue');
    expect(overdueReq.request.method).toBe('GET');
    expect(overdueReq.request.params.get('page')).toBe('0');
    expect(overdueReq.request.params.get('size')).toBe('1');
    overdueReq.flush({});
    s.config().subscribe();
    const configReq = http.expectOne('/api/company/booking-emi');
    expect(configReq.request.method).toBe('GET');
    configReq.flush({});
  });

  it('lists with the new date and search filters when set', () => {
    s.list({ status: '', associateId: '', plotId: '', projectId: '', overdue: false,
      bookedFrom: '2026-10-01', bookedTo: '2026-10-31', cancelledFrom: '2026-09-01', cancelledTo: '2026-09-30', q: 'A12' }, 0, 20).subscribe();
    const r = http.expectOne(x => x.url === '/api/admin/bookings');
    expect(r.request.params.get('bookedFrom')).toBe('2026-10-01');
    expect(r.request.params.get('bookedTo')).toBe('2026-10-31');
    expect(r.request.params.get('cancelledFrom')).toBe('2026-09-01');
    expect(r.request.params.get('cancelledTo')).toBe('2026-09-30');
    expect(r.request.params.get('q')).toBe('A12');
    r.flush({});
  });

  it('omits the new filters when blank', () => {
    s.list({ status: '', associateId: '', plotId: '', projectId: '', overdue: false, bookedFrom: '', bookedTo: '', cancelledFrom: '', q: '' }, 0, 20).subscribe();
    const r = http.expectOne(x => x.url === '/api/admin/bookings');
    ['bookedFrom', 'bookedTo', 'cancelledFrom', 'cancelledTo', 'q'].forEach(k => expect(r.request.params.has(k)).toBeFalse());
    r.flush({});
  });

  it('pays with paymentMode in the PATCH body', () => {
    s.pay('b1', 1, { amount: 100, paymentRef: 'R1', paymentMode: 'BANK_TRANSFER' }).subscribe();
    const r = http.expectOne('/api/admin/bookings/b1/installments/1/pay');
    expect(r.request.method).toBe('PATCH');
    expect(r.request.body).toEqual({ amount: 100, paymentRef: 'R1', paymentMode: 'BANK_TRANSFER' });
    r.flush({});
  });

  it('confirmPayment POSTs an empty body to the single-confirm URL', () => {
    s.confirmPayment('b1', 3).subscribe();
    const r = http.expectOne('/api/admin/bookings/b1/installments/3/confirm');
    expect(r.request.method).toBe('POST');
    expect(r.request.body).toEqual({});
    r.flush({});
  });

  it('confirmPayments POSTs {items} to /api/admin/payments/confirm and returns the array', () => {
    const items = [{ bookingId: 'b2', installmentNumber: 1 }, { bookingId: 'b1', installmentNumber: 2 }];
    let out: { id: string }[] = [];
    s.confirmPayments(items).subscribe(r => (out = r as unknown as { id: string }[]));
    const r = http.expectOne('/api/admin/payments/confirm');
    expect(r.request.method).toBe('POST');
    expect(r.request.body).toEqual({ items });
    r.flush([{ id: 'b1' }, { id: 'b2' }]);
    expect(out.map(b => b.id)).toEqual(['b1', 'b2']);
  });

  it('payments sends status, paging and only the set filters', () => {
    s.payments('ENTERED', { from: '2026-10-01', to: '', projectId: 'p1' }, 1, 50).subscribe();
    const r = http.expectOne(x => x.url === '/api/admin/payments');
    expect(r.request.method).toBe('GET');
    expect(r.request.params.get('status')).toBe('ENTERED');
    expect(r.request.params.get('page')).toBe('1');
    expect(r.request.params.get('size')).toBe('50');
    expect(r.request.params.get('from')).toBe('2026-10-01');
    expect(r.request.params.get('projectId')).toBe('p1');
    expect(r.request.params.has('to')).toBeFalse();
    r.flush({});
    s.payments('PAID', {}, 0, 20).subscribe();
    const r2 = http.expectOne(x => x.url === '/api/admin/payments');
    expect(r2.request.params.get('status')).toBe('PAID');
    r2.flush({});
  });

  it('lastEmi sends only the set filters and returns an array', () => {
    let out: unknown[] = [];
    s.lastEmi({}).subscribe(r => (out = r));
    const r = http.expectOne(x => x.url === '/api/admin/emi-reports/last-emi');
    expect(r.request.method).toBe('GET');
    expect(r.request.params.keys().length).toBe(0);
    r.flush([{ bookingId: 'b1' }]);
    expect(out.length).toBe(1);
    s.lastEmi({ from: '2026-10-01', to: '2026-10-31', projectId: '' }).subscribe();
    const r2 = http.expectOne(x => x.url === '/api/admin/emi-reports/last-emi');
    expect(r2.request.params.get('from')).toBe('2026-10-01');
    expect(r2.request.params.get('to')).toBe('2026-10-31');
    expect(r2.request.params.has('projectId')).toBeFalse();
    r2.flush([]);
  });

  it('reschedule POSTs the count and first due date', () => {
    s.reschedule('b1', { installmentCount: 3, firstDueDate: '2026-11-05' }).subscribe();
    const r = http.expectOne('/api/admin/bookings/b1/reschedule');
    expect(r.request.method).toBe('POST');
    expect(r.request.body).toEqual({ installmentCount: 3, firstDueDate: '2026-11-05' });
    r.flush({});
  });
});
