import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';
import { By } from '@angular/platform-browser';
import { PagerComponent } from '../shared/components/pager/pager.component';
import { formatInr } from '../shared/utils/plot-grid.util';
import { TeamPlotBookingsComponent } from './team-plot-bookings.component';

describe('TeamPlotBookingsComponent', () => {
  let data$: BehaviorSubject<Record<string, string>>;
  let http: HttpTestingController;

  beforeEach(() => {
    data$ = new BehaviorSubject<Record<string, string>>({ scope: 'LEFT' }); // fresh per test: no leakage between specs
    TestBed.configureTestingModule({
      imports: [TeamPlotBookingsComponent, TranslateModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: ActivatedRoute, useValue: { data: data$ } }]
    });
    http = TestBed.inject(HttpTestingController);
  });

  it('requests the leg matching the route scope and renders rows', () => {
    const fixture = TestBed.createComponent(TeamPlotBookingsComponent);
    fixture.detectChanges();
    const req = http.expectOne(r => r.url === '/api/associates/me/team-bookings');
    expect(req.request.params.get('leg')).toBe('L');
    req.flush({
      bookings: [{ id: 'b1', plotNo: 'A-1', projectName: 'Green', associateName: 'Ravi', buyerName: 'Jane', bookedAt: '2026-01-01T00:00:00Z', totalAmount: 100, paidAmount: 10, status: 'ACTIVE', installments: [] }],
      page: 0, size: 20, totalElements: 1
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Ravi');
  });

  it('reloads with the new leg when the sibling route changes', () => {
    const fixture = TestBed.createComponent(TeamPlotBookingsComponent);
    fixture.detectChanges();
    http.expectOne(r => r.url === '/api/associates/me/team-bookings').flush({ bookings: [], page: 0, size: 20, totalElements: 0 });
    data$.next({ scope: 'RIGHT' });
    expect(http.expectOne(r => r.url === '/api/associates/me/team-bookings').request.params.get('leg')).toBe('R');
  });

  const bookings = { bookings: [
    { id: 'b1', plotNo: 'A-1', projectName: 'Green', associateName: 'Ravi', buyerName: 'Jane', bookedAt: '2026-01-01T00:00:00Z', totalAmount: 1500000, paidAmount: 100000, status: 'ACTIVE', installments: [] },
    { id: 'b2', plotNo: null, projectName: null, associateName: null, buyerName: 'Raj', bookedAt: '2026-01-02T00:00:00Z', totalAmount: 0, paidAmount: 0, status: 'CANCELLED', installments: [] }
  ], page: 0, size: 20, totalElements: 45 };

  function boot() {
    const fixture = TestBed.createComponent(TeamPlotBookingsComponent);
    fixture.detectChanges();
    http.expectOne(r => r.url === '/api/associates/me/team-bookings').flush(bookings);
    fixture.detectChanges();
    return fixture;
  }

  it('renders the register-style table with labeled cells', () => {
    const fixture = boot();
    const table = fixture.nativeElement.querySelector('table.booking-table');
    expect(table).toBeTruthy();
    expect(table.querySelectorAll('thead th[scope="col"]').length).toBe(14);
    table.querySelectorAll('tbody td').forEach((td: HTMLElement) => expect(td.getAttribute('data-label')).toBeTruthy());
  });

  it('formats money with formatInr and shows em dashes for missing plot/project/associate', () => {
    const fixture = boot();
    const rows = fixture.nativeElement.querySelectorAll('tbody tr');
    expect(rows[0].textContent).toContain(formatInr(1500000));
    expect(rows[1].textContent).toContain('—');
    expect(fixture.nativeElement.textContent).not.toMatch(/undefined|null/);
  });

  it('exposes the 14 booking columns including rate and extra price, but no buyer phone', () => {
    const fixture = boot();
    const text = fixture.nativeElement.querySelector('thead').textContent;
    expect(text).toContain('plotBookings.table.rate');
    expect(text).toContain('plotBookings.table.extraPrice');
    expect(text).not.toContain('phone');
    expect(fixture.nativeElement.querySelectorAll('thead th').length).toBe(14);
  });

  it('uses the shared pager and loads the requested page', () => {
    const fixture = boot();
    expect(fixture.nativeElement.querySelector('.team-bookings__pager')).toBeNull();
    fixture.debugElement.query(By.directive(PagerComponent)).componentInstance.pageChange.emit(1);
    expect(http.expectOne(r => r.url === '/api/associates/me/team-bookings').request.params.get('page')).toBe('1');
  });

  it('disables the pager while a page is loading', () => {
    const fixture = boot();
    fixture.componentInstance.load(1);
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.directive(PagerComponent)).componentInstance.disabled).toBe(true);
    http.expectOne(r => r.url === '/api/associates/me/team-bookings');
  });

  it('ignores a stale response after the leg changed', () => {
    const fixture = boot();
    fixture.componentInstance.load(1);
    data$.next({ scope: 'RIGHT' });
    const reqs = http.match(r => r.url === '/api/associates/me/team-bookings');
    reqs[0].flush({ ...bookings, page: 1 });
    reqs[1].flush({ bookings: [], page: 0, size: 20, totalElements: 0 });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tbody tr[data-booking-id]').length).toBe(0);
    expect(fixture.nativeElement.querySelector('.booking-table__empty')).toBeTruthy();
  });
});
