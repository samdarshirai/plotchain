import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { MyBookingsComponent } from './my-bookings.component';

describe('MyBookingsComponent', () => {
  let fixture: ComponentFixture<MyBookingsComponent>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;

  const inst = (n: number, over: Record<string, unknown> = {}) =>
    ({ installmentNumber: n, amount: 100000, dueDate: '2026-03-01', status: 'PENDING', paidAt: null, overdue: false, ...over });
  const booking = (id: string, over: Record<string, unknown> = {}) => ({
    id, plotId: '123e4567-e89b-12d3-a456-426614174000', associateId: 'a', status: 'ACTIVE', buyerName: 'Rohit Kulkarni',
    totalAmount: 400000, installmentCount: 4, bookedAt: '2026-02-01T00:00:00Z', paidAmount: 100000, dueAmount: 300000,
    installments: [inst(1, { status: 'PAID', paidAt: '2026-02-05T00:00:00Z' }), inst(2, { overdue: true }), inst(3), inst(4)], ...over
  });
  const pageOf = (bookings: unknown[], page = 0, total = bookings.length) => ({ bookings, page, size: 20, totalElements: total });

  function boot(bookings: unknown[] = [booking('b1'), booking('b2', { status: 'CANCELLED', paidAmount: 100000, dueAmount: 0, installments: [inst(1, { status: 'PAID' }), inst(2, { status: 'VOID' })] })]) {
    http.expectOne(r => r.url === '/api/associates/me/bookings').flush(pageOf(bookings));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyBookingsComponent, HttpClientTestingModule, TranslateModule.forRoot()],
      providers: [provideRouter([])]
    }).compileComponents();
    fixture = TestBed.createComponent(MyBookingsComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });
  afterEach(() => http.verify());

  it('renders a single page heading', () => {
    boot([]);
    const h1 = el().querySelectorAll('h1.my-bookings__title');
    expect(h1.length).toBe(1);
    expect(h1[0].textContent).toContain('plotBookings.myBookings.title');
  });

  it('renders a table row per booking in server order', () => {
    boot();
    const rows = el().querySelectorAll('.booking-table tbody tr');
    expect(rows.length).toBe(2);
    expect(el().querySelector('thead')!.querySelectorAll('th').length).toBe(14);
  });

  it('shows rate, area, price, extra price, total, paid and rest in the row', () => {
    boot([booking('b1', { plotNo: 'A-12', plotType: 'CORNER', rate: 500, areaSqft: 1200, listPrice: 375000, extraPrice: 25000, associateCode: 'VP1', associateName: 'Ravi' })]);
    const cell = (label: string) => el().querySelector(`td[data-label="plotBookings.table.${label}"]`)!.textContent!.trim();
    expect(cell('plotType')).toBe('CORNER');
    expect(cell('plotNo')).toBe('A-12');
    expect(cell('associateId')).toBe('VP1');
    expect(cell('extraPrice')).toContain('25,000');
    expect(cell('rest')).toContain('3,00,000');
  });

  it('uses plotNo and shows the project line when the response carries them', () => {
    boot([booking('b1', { plotNo: 'A-12', projectName: 'Green Valley' })]);
    expect(el().querySelector('.booking-table tbody')!.textContent).toContain('A-12');
    expect(el().querySelector('.booking-table tbody')!.textContent).toContain('Green Valley');
  });

  it('shows an empty table (headers, no rows) when there are no bookings', () => {
    boot([]);
    expect(el().querySelectorAll('.booking-table thead th').length).toBe(14);
    expect(el().querySelector('.booking-table__empty')).toBeTruthy();
    expect(el().querySelectorAll('.booking-table tbody tr[data-booking-id]').length).toBe(0);
  });

  it('shows an error banner with Retry when the first load fails', () => {
    http.expectOne(r => r.url === '/api/associates/me/bookings').flush('x', { status: 500, statusText: 'err' });
    fixture.detectChanges();
    expect(el().textContent).toContain('plotBookings.bookingsLoadError');
    el().querySelector<HTMLButtonElement>('.my-bookings__retry')!.click();
    http.expectOne(r => r.url === '/api/associates/me/bookings').flush(pageOf([]));
  });

  it('pages with Next/Previous and keeps the previous page visible if the next load fails', () => {
    http.expectOne(r => r.url === '/api/associates/me/bookings').flush(pageOf([booking('b1')], 0, 25));
    fixture.detectChanges();
    el().querySelector<HTMLButtonElement>('.my-bookings__next')!.click();
    const req = http.expectOne(r => r.url === '/api/associates/me/bookings');
    expect(req.request.params.get('page')).toBe('1');
    req.flush('x', { status: 500, statusText: 'err' });
    fixture.detectChanges();
    expect(el().querySelectorAll('.booking-table tbody tr').length).toBe(1);
    expect(el().textContent).toContain('plotBookings.bookingsLoadError');
  });

  it('Retry after a failed page-N load re-requests that page and keeps page 1 visible', () => {
    http.expectOne(r => r.url === '/api/associates/me/bookings').flush(pageOf([booking('b1')], 0, 25));
    fixture.detectChanges();
    el().querySelector<HTMLButtonElement>('.my-bookings__next')!.click();
    http.expectOne(r => r.url === '/api/associates/me/bookings').flush('x', { status: 500, statusText: 'err' });
    fixture.detectChanges();
    expect(el().querySelectorAll('.booking-table tbody tr').length).toBe(1);
    el().querySelector<HTMLButtonElement>('.my-bookings__retry')!.click();
    const retry = http.expectOne(r => r.url === '/api/associates/me/bookings');
    expect(retry.request.params.get('page')).toBe('1');
    retry.flush(pageOf([booking('b9')], 1, 25));
  });

  it('ignores an out-of-order page response (success and error) from a superseded request', () => {
    http.expectOne(r => r.url === '/api/associates/me/bookings').flush(pageOf([booking('b1')], 0, 60));
    fixture.detectChanges();
    const c = fixture.componentInstance;
    c.goTo(1);
    c.goTo(2);
    const reqs = http.match(r => r.url === '/api/associates/me/bookings');
    expect(reqs.length).toBe(2);
    reqs[1].flush(pageOf([booking('p2')], 2, 60));
    reqs[0].flush(pageOf([booking('p1')], 1, 60));
    fixture.detectChanges();
    expect(c.page!.page).toBe(2);
    c.goTo(1);
    c.goTo(2);
    const r2 = http.match(r => r.url === '/api/associates/me/bookings');
    r2[1].flush(pageOf([booking('p2')], 2, 60));
    r2[0].flush('x', { status: 500, statusText: 'err' });
    expect(c.error).toBeFalse();
    expect(c.loading).toBeFalse();
  });

  it('sends the last-30-days from/to and refetches page 0 when the range changes', () => {
    const first = http.expectOne(r => r.url === '/api/associates/me/bookings');
    expect(first.request.params.get('from')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(first.request.params.get('to')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    first.flush(pageOf([booking('b1')], 0, 1));
    fixture.detectChanges();
    fixture.componentInstance.onRange({ from: '2026-01-01', to: '2026-01-31' });
    const next = http.expectOne(r => r.url === '/api/associates/me/bookings');
    expect(next.request.params.get('from')).toBe('2026-01-01');
    expect(next.request.params.get('page')).toBe('0');
    next.flush(pageOf([], 0, 0));
  });

  it('View opens the installments in a popup and Close dismisses it', () => {
    boot();
    el().querySelector<HTMLButtonElement>('.booking-table tbody button')!.click();
    fixture.detectChanges();
    expect(el().querySelector('.booking-modal [role="dialog"]')).not.toBeNull();
    el().querySelector<HTMLButtonElement>('.booking-modal__close')!.click();
    fixture.detectChanges();
    expect(el().querySelector('.booking-modal')).toBeNull();
  });

  it('exposes no write controls', () => {
    boot();
    expect(el().querySelectorAll('form, textarea, select, input:not([type="date"])').length).toBe(0);
  });
});
