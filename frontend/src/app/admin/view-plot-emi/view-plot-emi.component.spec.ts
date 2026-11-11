import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { ViewPlotEmiComponent } from './view-plot-emi.component';

describe('ViewPlotEmiComponent', () => {
  let fixture: ComponentFixture<ViewPlotEmiComponent>;
  let component: ViewPlotEmiComponent;
  let http: HttpTestingController;

  const boot = () => {
    http.expectOne('/api/associates').flush([{ id: 'a1', userId: 'U1', name: 'Asha' }]);
    http.expectOne(q => q.url === '/api/admin/cycles').flush({
      cycles: [{ id: 'c1', periodStart: '2026-10-01', periodEnd: '2026-10-15', status: 'CLOSED' }, { id: 'c2', periodStart: '2026-10-16', periodEnd: null, status: 'OPEN' }],
      page: 0, size: 100, totalElements: 2 });
    http.expectOne('/api/company/projects').flush([{ id: 'p1', name: 'Alpha' }]);
    http.expectOne(q => q.url === '/api/admin/bookings').flush({ bookings: [], page: 0, size: 100, totalElements: 0 });
  };
  const reload = () => {
    const r = http.expectOne(q => q.url === '/api/admin/bookings');
    r.flush({ bookings: [], page: 0, size: 100, totalElements: 0 });
    return r.request.params;
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ViewPlotEmiComponent, HttpClientTestingModule, TranslateModule.forRoot()] }).compileComponents();
    fixture = TestBed.createComponent(ViewPlotEmiComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });
  afterEach(() => http.verify());

  it('associate pick sends associateId; clearing removes it', () => {
    boot();
    component.onAssociate({ id: 'a1', userId: 'U1', name: 'Asha' } as never);
    expect(reload().get('associateId')).toBe('a1');
    component.onAssociate(null);
    expect(reload().get('associateId')).toBeNull();
  });

  it('cycle pick sets date range; open cycle ends today; date edit resets cycle', () => {
    boot();
    component.onCycle('c1');
    const p = reload();
    expect(p.get('bookedFrom')).toBe('2026-10-01');
    expect(p.get('bookedTo')).toBe('2026-10-15');
    component.onCycle('c2');
    expect(reload().get('bookedFrom')).toBe('2026-10-16');
    expect(component.to).toBe(component.to.slice(0, 10));
    component.onDate('from', '2026-10-17');
    reload();
    expect(component.cycleId).toBe('');
  });

  it('loads pending-money bookings for the first project and last-30-day range', () => {
    http.expectOne('/api/associates').flush([]);
    http.expectOne(q => q.url === '/api/admin/cycles').flush({ cycles: [], page: 0, size: 100, totalElements: 0 });
    http.expectOne('/api/company/projects').flush([{ id: 'p1', name: 'Alpha' }, { id: 'p2', name: 'Beta' }]);
    const r = http.expectOne(q => q.url === '/api/admin/bookings');
    expect(r.request.params.get('hasPending')).toBe('true');
    expect(r.request.params.get('status')).toBe('ACTIVE');
    expect(r.request.params.get('projectId')).toBe('p1');
    expect(r.request.params.get('bookedFrom')).toBe(component.from);
    expect(r.request.params.get('bookedTo')).toBe(component.to);
    r.flush({ bookings: [], page: 0, size: 20, totalElements: 0 });
  });
});
