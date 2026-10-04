import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
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
      imports: [MyBookingsComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(MyBookingsComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });
  afterEach(() => http.verify());

  it('renders a card per booking in server order with the plot label fallback', () => {
    boot();
    const cards = el().querySelectorAll('.my-bookings__card');
    expect(cards.length).toBe(2);
    expect(cards[0].textContent).toContain('123e4567');
    expect(cards[0].textContent).toContain('Rohit Kulkarni');
  });

  it('uses plotNo and shows the project line when the response carries them', () => {
    boot([booking('b1', { plotNo: 'A-12', projectName: 'Green Valley' })]);
    expect(el().querySelector('.my-bookings__card')!.textContent).toContain('A-12');
    expect(el().querySelector('.my-bookings__detail')!.textContent).toContain('Green Valley');
  });

  it('shows the paid bar with an aria-label percent and the printed amounts', () => {
    boot();
    const bar = el().querySelector('.my-bookings__bar')!;
    expect(bar.getAttribute('role')).toBe('img');
    expect(bar.getAttribute('aria-label')).toContain('plotBookings.progressLabel');
    expect(el().querySelector('.my-bookings__card')!.textContent).toContain('plotBookings.paidOfTotal');
  });

  it('shows an overdue-count badge only when there are overdue installments', () => {
    boot();
    const cards = el().querySelectorAll('.my-bookings__card');
    expect(cards[0].querySelector('.my-bookings__badge--overdue')).not.toBeNull();
    expect(cards[1].querySelector('.my-bookings__badge--overdue')).toBeNull();
  });

  it('selects the first booking by default and shows its installments with overdue only on pending rows', () => {
    boot();
    const rows = el().querySelectorAll('.my-bookings__detail tbody tr');
    expect(rows.length).toBe(4);
    expect(rows[1].classList).toContain('my-bookings__row--overdue');
    expect(rows[0].classList).not.toContain('my-bookings__row--overdue');
  });

  it('selecting another booking swaps the detail without any HTTP call', () => {
    boot();
    el().querySelectorAll<HTMLButtonElement>('.my-bookings__card')[1].click();
    fixture.detectChanges();
    expect(fixture.componentInstance.selected!.id).toBe('b2');
    expect(el().querySelectorAll('.my-bookings__detail tbody tr')[1].classList).toContain('my-bookings__row--void');
    // afterEach http.verify() proves no request was issued
  });

  it('a cancelled booking shows "no further dues", the retained-paid note and a struck plot label', () => {
    boot();
    el().querySelectorAll<HTMLButtonElement>('.my-bookings__card')[1].click();
    fixture.detectChanges();
    expect(el().querySelector('.my-bookings__card--cancelled .my-bookings__plot--struck')).not.toBeNull();
    expect(el().textContent).toContain('plotBookings.noFurtherDues');
    expect(el().textContent).toContain('plotBookings.cancelledNote');
    expect(el().querySelector('.my-bookings__card--cancelled')!.textContent).not.toContain('plotBookings.dueAmount');
  });

  it('a fully paid confirmed booking shows "fully paid" and the confirmed note', () => {
    boot([booking('b1', { status: 'CONFIRMED', paidAmount: 400000, dueAmount: 0, installments: [inst(1, { status: 'PAID' })] })]);
    expect(el().textContent).toContain('plotBookings.fullyPaid');
    expect(el().textContent).toContain('plotBookings.confirmedNote');
  });

  it('opens the detail as a sheet on select and Back closes it', () => {
    boot();
    el().querySelectorAll<HTMLButtonElement>('.my-bookings__card')[1].click();
    fixture.detectChanges();
    expect(el().querySelector('.my-bookings__detail')!.classList).toContain('my-bookings__detail--open');
    el().querySelector<HTMLButtonElement>('.my-bookings__back')!.click();
    fixture.detectChanges();
    expect(el().querySelector('.my-bookings__detail')!.classList).not.toContain('my-bookings__detail--open');
  });

  it('shows the empty state and "View availability" emits', () => {
    boot([]);
    expect(el().textContent).toContain('plotBookings.bookingsEmptyTitle');
    let emitted = false;
    fixture.componentInstance.viewAvailability.subscribe(() => (emitted = true));
    el().querySelector<HTMLButtonElement>('.my-bookings__view-availability')!.click();
    expect(emitted).toBeTrue();
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
    expect(el().querySelectorAll('.my-bookings__card').length).toBe(1);
    expect(el().textContent).toContain('plotBookings.bookingsLoadError');
  });

  it('exposes no write controls', () => {
    boot();
    expect(el().querySelectorAll('form, input, textarea, select').length).toBe(0);
  });
});
