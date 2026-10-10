import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';
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
});
