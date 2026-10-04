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
    expect(r.request.params.has('overdue')).toBeFalse();
    r.flush({});
  });

  it('gets one booking', () => {
    s.get('b1').subscribe();
    http.expectOne('/api/admin/bookings/b1').flush({});
  });

  it('pays with PATCH and the body', () => {
    s.pay('b1', 3, { amount: 100, paymentRef: 'R1' }).subscribe();
    const r = http.expectOne('/api/admin/bookings/b1/installments/3/pay');
    expect(r.request.method).toBe('PATCH');
    expect(r.request.body).toEqual({ amount: 100, paymentRef: 'R1' });
    r.flush({});
  });

  it('confirm / cancel / transfer POST the right bodies', () => {
    s.confirm('b1').subscribe();
    expect(http.expectOne('/api/admin/bookings/b1/confirm').request.method).toBe('POST');
    s.cancel('b1', 'why').subscribe();
    expect(http.expectOne('/api/admin/bookings/b1/cancel').request.body).toEqual({ reason: 'why' });
    s.transfer('b1', 'a2').subscribe();
    expect(http.expectOne('/api/admin/bookings/b1/transfer').request.body).toEqual({ associateId: 'a2' });
    http.match(() => true).forEach(r => r.flush({}));
  });

  it('reads overdue report and config', () => {
    s.overdue(0, 1).subscribe();
    const r = http.expectOne(x => x.url === '/api/admin/emi-reports/overdue');
    expect(r.request.params.get('size')).toBe('1');
    r.flush({});
    s.config().subscribe();
    http.expectOne('/api/company/booking-emi').flush({});
  });
});
