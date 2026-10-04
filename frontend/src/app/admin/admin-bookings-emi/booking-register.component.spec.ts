import { By } from '@angular/platform-browser';
import { BookingSealComponent } from './booking-seal.component';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BookingRegisterComponent } from './booking-register.component';

describe('BookingRegisterComponent', () => {
  let fixture: ComponentFixture<BookingRegisterComponent>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;
  const inst = (n: number, over: Record<string, unknown> = {}) =>
    ({ installmentNumber: n, amount: 250, dueDate: '2026-03-01', status: 'PENDING', paidAt: null, overdue: false, ...over });
  const bk = (id: string, over: Record<string, unknown> = {}) => ({
    id, plotId: 'plot-' + id + '-xxxxxxxx', associateId: 'a1', status: 'ACTIVE', buyerName: 'Buyer ' + id, totalAmount: 1000,
    installmentCount: 4, bookedAt: '2026-02-01T00:00:00Z', paidAmount: 250, dueAmount: 750,
    installments: [inst(1, { status: 'PAID' }), inst(2, { overdue: true }), inst(3), inst(4)], ...over
  });
  const pageOf = (bookings: unknown[], total = bookings.length, page = 0) => ({ bookings, page, size: 20, totalElements: total });
  const directory = [{ id: 'a1', userId: 'VA-1', name: 'Jane', role: 'ASSOCIATE', hasFreeSlot: true }];
  const listReq = () => http.expectOne(r => r.url === '/api/admin/bookings');

  function boot(bookings: unknown[] = [bk('b1'), bk('b2')], total?: number) {
    http.expectOne('/api/associates').flush(directory);
    http.expectOne('/api/company/projects').flush([{ id: 'p1', name: 'Green', location: 'X' }]);
    listReq().flush(pageOf(bookings, total));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BookingRegisterComponent, HttpClientTestingModule, TranslateModule.forRoot()], providers: [provideRouter([])]
    }).compileComponents();
    fixture = TestBed.createComponent(BookingRegisterComponent);
    fixture.componentRef.setInput('config', null);
    fixture.componentRef.setInput('focusBookingId', null);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });
  afterEach(() => http.verify());

  it('renders a row per booking with directory-resolved associate and overdue pill', () => {
    boot();
    const rows = el().querySelectorAll('tbody tr.booking-register__row');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('Jane (VA-1)');
    expect(rows[0].textContent).toContain('admin.bookingsEmi.overduePill');
  });

  it('changing a filter reloads page 0 with it', () => {
    boot();
    fixture.componentInstance.applyFilter({ status: 'CONFIRMED' });
    const r = listReq();
    expect(r.request.params.get('status')).toBe('CONFIRMED');
    expect(r.request.params.get('page')).toBe('0');
    r.flush(pageOf([]));
  });

  it('plot filter is disabled until a project is chosen, then lists that project grid', () => {
    boot();
    expect(el().querySelector<HTMLSelectElement>('.booking-register__plot')!.disabled).toBeTrue();
    fixture.componentInstance.applyFilter({ projectId: 'p1' });
    listReq().flush(pageOf([]));
    http.expectOne('/api/projects/p1/plots/grid').flush([{ plotId: 'x', plotNo: 'A-1', type: 'NORMAL', area: 1, price: 1, status: 'BOOKED' }]);
    fixture.detectChanges();
    expect(el().querySelector<HTMLSelectElement>('.booking-register__plot')!.disabled).toBeFalse();
  });

  it('changing project clears the plot filter', () => {
    boot();
    fixture.componentInstance.applyFilter({ projectId: 'p1' });
    listReq().flush(pageOf([]));
    http.expectOne('/api/projects/p1/plots/grid').flush([]);
    fixture.componentInstance.applyFilter({ plotId: 'x' });
    listReq().flush(pageOf([]));
    fixture.componentInstance.applyFilter({ projectId: '' });
    listReq().flush(pageOf([]));
    expect(fixture.componentInstance.filters.plotId).toBe('');
  });

  it('shows empty-with-filters copy and Reset restores the full list', () => {
    boot();
    fixture.componentInstance.applyFilter({ status: 'CANCELLED' });
    listReq().flush(pageOf([]));
    fixture.detectChanges();
    expect(el().textContent).toContain('admin.bookingsEmi.empty.noMatchTitle');
    fixture.componentInstance.resetFilters();
    expect(listReq().request.params.has('status')).toBeFalse();
  });

  it('shows the first-run empty state when there are no bookings and no filters', () => {
    boot([]);
    expect(el().textContent).toContain('admin.bookingsEmi.empty.noBookingsTitle');
  });

  it('shows an error banner with Try again when the list fails', () => {
    http.expectOne('/api/associates').flush(directory);
    http.expectOne('/api/company/projects').flush([]);
    listReq().flush('x', { status: 500, statusText: 'err' });
    fixture.detectChanges();
    expect(el().textContent).toContain('admin.bookingsEmi.err.load');
    el().querySelector<HTMLButtonElement>('.booking-register__retry')!.click();
    listReq().flush(pageOf([]));
  });

  it('selects a row on click and on Enter', () => {
    boot();
    const rows = el().querySelectorAll<HTMLElement>('tbody tr.booking-register__row');
    rows[1].click();
    expect(fixture.componentInstance.selected!.id).toBe('b2');
    rows[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(fixture.componentInstance.selected!.id).toBe('b1');
  });

  it('onBookingChanged patches the row in place, keeps the selection, then refetches the page', () => {
    boot();
    fixture.componentInstance.selectBooking(fixture.componentInstance.page!.bookings[0]);
    fixture.componentInstance.onBookingChanged(bk('b1', { paidAmount: 500 }) as never);
    expect(fixture.componentInstance.page!.bookings[0].paidAmount).toBe(500);
    expect(fixture.componentInstance.selected!.paidAmount).toBe(500);
    listReq().flush(pageOf([bk('b1', { paidAmount: 500 }), bk('b2')]));
    expect(fixture.componentInstance.selected!.id).toBe('b1');
  });

  it('keeps a booking selected with the mismatch note when a refetch drops it from the page', () => {
    boot();
    fixture.componentInstance.selectBooking(fixture.componentInstance.page!.bookings[0]);
    fixture.componentInstance.onBookingChanged(bk('b1', { associateId: 'a9' }) as never);
    listReq().flush(pageOf([bk('b2')]));
    fixture.detectChanges();
    expect(fixture.componentInstance.selected!.id).toBe('b1');
    expect(fixture.componentInstance.filterMismatch).toBeTrue();
  });

  it('ignores a stale list response that arrives after a newer one', () => {
    boot();
    fixture.componentInstance.reload();
    const slow = listReq();
    fixture.componentInstance.applyFilter({ status: 'ACTIVE' });
    const fast = listReq();
    fast.flush(pageOf([bk('new')]));
    slow.flush(pageOf([bk('old')]));
    expect(fixture.componentInstance.page!.bookings[0].id).toBe('new');
  });

  it('pages with Next', () => {
    boot([bk('b1')], 25);
    el().querySelector<HTMLButtonElement>('.booking-register__next')!.click();
    expect(listReq().request.params.get('page')).toBe('1');
  });
  it('a changed event for a booking that is no longer selected does not steal the selection', () => {
    boot();
    const c = fixture.componentInstance;
    c.selectBooking(c.page!.bookings[1]);
    c.onBookingChanged(bk('b1', { paidAmount: 500 }) as never);
    expect(c.selected!.id).toBe('b2');
    expect(c.page!.bookings[0].paidAmount).toBe(500);
    listReq().flush(pageOf([bk('b1', { paidAmount: 500 }), bk('b2')]));
  });

  it('selection and pager are frozen while locked', () => {
    boot();
    const c = fixture.componentInstance;
    c.selectBooking(c.page!.bookings[0]);
    c.locked = true;
    c.selectBooking(c.page!.bookings[1]);
    expect(c.selected!.id).toBe('b1');
  });

  it('clears the mismatch note when the selected booking returns to the list', () => {
    boot();
    const c = fixture.componentInstance;
    c.selectBooking(c.page!.bookings[0]);
    c.reload();
    listReq().flush(pageOf([bk('b2')]));
    expect(c.filterMismatch).toBeTrue();
    c.reload();
    listReq().flush(pageOf([bk('b1'), bk('b2')]));
    expect(c.filterMismatch).toBeFalse();
  });

  it('paging away from the selected booking does not raise the mismatch note', () => {
    boot([bk('b1')], 45);
    const c = fixture.componentInstance;
    c.selectBooking(c.page!.bookings[0]);
    c.goTo(1);
    listReq().flush(pageOf([bk('z')], 45, 1));
    expect(c.selected!.id).toBe('b1');
    expect(c.filterMismatch).toBeFalse();
  });

  it('reload and onBookingChanged raise the mismatch note when the selection is missing', () => {
    boot();
    const c = fixture.componentInstance;
    c.selectBooking(c.page!.bookings[0]);
    c.reload();
    listReq().flush(pageOf([bk('b2')]));
    expect(c.filterMismatch).toBeTrue();
  });

  it('a filter change clears the mismatch flag', () => {
    boot();
    const c = fixture.componentInstance;
    c.selectBooking(c.page!.bookings[0]);
    c.reload();
    listReq().flush(pageOf([bk('b2')]));
    c.applyFilter({ status: 'ACTIVE' });
    expect(c.filterMismatch).toBeFalse();
    listReq().flush(pageOf([]));
    expect(c.filterMismatch).toBeFalse();
  });

  it('filters, reset and paging do nothing while locked; reload still works', () => {
    boot([bk('b1')], 45);
    const c = fixture.componentInstance;
    c.locked = true;
    c.applyFilter({ status: 'ACTIVE' });
    c.resetFilters();
    c.goTo(1);
    http.expectNone('/api/admin/bookings');
    expect(c.filters.status).toBe('');
    c.reload();
    listReq().flush(pageOf([bk('b1')], 45));
  });

  it('disables pager, reset and the associate wrapper while locked', () => {
    boot([bk('b1')], 45);
    fixture.componentInstance.locked = true;
    fixture.detectChanges();
    expect(el().querySelector<HTMLButtonElement>('.booking-register__next')!.disabled).toBeTrue();
    expect(el().querySelector<HTMLButtonElement>('.booking-register__filters .brand-button')!.disabled).toBeTrue();
    expect(el().querySelector('.booking-register__field--locked')!.hasAttribute('inert')).toBeTrue();
  });

  it('disables the empty-state Reset and the Retry button while locked', () => {
    boot();
    const c = fixture.componentInstance;
    c.applyFilter({ status: 'CANCELLED' });
    listReq().flush(pageOf([]));
    c.locked = true;
    fixture.detectChanges();
    expect(el().querySelector<HTMLButtonElement>('.booking-register__empty button')!.disabled).toBeTrue();
    c.locked = false;
    c.applyFilter({ status: 'ACTIVE' });
    listReq().flush('x', { status: 500, statusText: 'err' });
    c.locked = true;
    fixture.detectChanges();
    expect(el().querySelector<HTMLButtonElement>('.booking-register__retry')!.disabled).toBeTrue();
  });

  it('a filter change on a later page requests page 0', () => {
    boot([bk('b1')], 45);
    const c = fixture.componentInstance;
    c.goTo(1);
    listReq().flush(pageOf([bk('z')], 45, 1));
    c.applyFilter({ status: 'ACTIVE' });
    const r = listReq();
    expect(r.request.params.get('page')).toBe('0');
    r.flush(pageOf([]));
  });

  it('Retry after a failed filter change re-requests page 0, not the old page', () => {
    boot([bk('b1')], 45);
    const c = fixture.componentInstance;
    c.goTo(1);
    listReq().flush(pageOf([bk('z')], 45, 1));
    c.applyFilter({ status: 'ACTIVE' });
    listReq().flush('x', { status: 500, statusText: 'err' });
    c.reload();
    const r = listReq();
    expect(r.request.params.get('page')).toBe('0');
    r.flush(pageOf([]));
  });

  it('a slow plot grid for a previous project does not replace the current options', () => {
    boot();
    const c = fixture.componentInstance;
    c.applyFilter({ projectId: 'p1' });
    listReq().flush(pageOf([]));
    const g1 = http.expectOne('/api/projects/p1/plots/grid');
    c.applyFilter({ projectId: 'p2' });
    listReq().flush(pageOf([]));
    http.expectOne('/api/projects/p2/plots/grid').flush([{ plotId: 'q', plotNo: 'P2-1', type: 'NORMAL', area: 1, price: 1, status: 'BOOKED' }]);
    g1.flush([{ plotId: 'x', plotNo: 'P1-1', type: 'NORMAL', area: 1, price: 1, status: 'BOOKED' }]);
    expect(c.plotOptions.map(o => o.plotNo)).toEqual(['P2-1']);
  });

  it('marks the selected row with aria-current and selects on Space', () => {
    boot();
    const rows = el().querySelectorAll<HTMLElement>('tbody tr.booking-register__row');
    rows[1].dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    fixture.detectChanges();
    expect(fixture.componentInstance.selected!.id).toBe('b2');
    expect(rows[1].getAttribute('aria-current')).toBe('true');
    expect(rows[0].hasAttribute('aria-current')).toBeFalse();
  });

  it('locks filters, paging and row selection while a seal write is in flight', () => {
    boot();
    const status = el().querySelector<HTMLSelectElement>('.booking-register__filters select')!;
    expect(status.disabled).toBeFalse();
    fixture.componentInstance.locked = true;
    fixture.detectChanges();
    expect(status.disabled).toBeTrue();
    fixture.componentInstance.selectBooking(fixture.componentInstance.page!.bookings[1]);
    expect(fixture.componentInstance.selected).toBeNull();
  });

  it('seal busy locks the register, and a seal reload request refetches the list (never GET /bookings/{id})', () => {
    boot();
    const c = fixture.componentInstance;
    c.selectBooking(c.page!.bookings[0]);
    fixture.detectChanges();
    const seal = fixture.debugElement.query(By.directive(BookingSealComponent)).componentInstance as BookingSealComponent;
    seal.busyChange.emit(true);
    expect(c.locked).toBeTrue();
    seal.reloadRequested.emit();
    listReq().flush(pageOf([bk('b1'), bk('b2')]));
    http.expectNone(r => /\/api\/admin\/bookings\/[^/?]+$/.test(r.url));
  });
});
