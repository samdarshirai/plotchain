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
    s.pay('b1', 3, { amount: 100, paymentRef: 'R1' }).subscribe();
    const r = http.expectOne('/api/admin/bookings/b1/installments/3/pay');
    expect(r.request.method).toBe('PATCH');
    expect(r.request.body).toEqual({ amount: 100, paymentRef: 'R1' });
    r.flush({});
  });

  it('pays with paidAt included in body', () => {
    s.pay('b1', 2, { amount: 50, paymentRef: 'R2', paidAt: '2026-10-05' }).subscribe();
    const r = http.expectOne('/api/admin/bookings/b1/installments/2/pay');
    expect(r.request.body).toEqual({ amount: 50, paymentRef: 'R2', paidAt: '2026-10-05' });
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
});
