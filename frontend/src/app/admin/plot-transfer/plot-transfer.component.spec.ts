import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { PlotTransferComponent } from './plot-transfer.component';

describe('PlotTransferComponent', () => {
  let fixture: ComponentFixture<PlotTransferComponent>;
  let component: PlotTransferComponent;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PlotTransferComponent, HttpClientTestingModule, TranslateModule.forRoot()] }).compileComponents();
    fixture = TestBed.createComponent(PlotTransferComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });
  afterEach(() => { http.match(r => r.url === '/api/associates' || r.url === '/api/admin/cycles').forEach(r => r.flush([])); http.verify(); });

  it('loads ACTIVE bookings for the first project and last-30-day range', () => {
    http.expectOne('/api/company/projects').flush([{ id: 'p1', name: 'Alpha' }, { id: 'p2', name: 'Beta' }]);
    const r = http.expectOne(q => q.url === '/api/admin/bookings');
    expect(r.request.params.get('hasPending')).not.toBe('true');
    expect(r.request.params.get('status')).toBe('ACTIVE');
    expect(r.request.params.get('projectId')).toBe('p1');
    expect(r.request.params.get('bookedFrom')).toBe(component.from);
    expect(r.request.params.get('bookedTo')).toBe(component.to);
    r.flush({ bookings: [], page: 0, size: 20, totalElements: 0 });
  });

  it('sends the typed plot name as plotNo, trimmed, and drops it when cleared', () => {
    http.expectOne('/api/company/projects').flush([{ id: 'p1', name: 'Alpha' }]);
    http.expectOne(q => q.url === '/api/admin/bookings').flush({ bookings: [], page: 0, size: 100, totalElements: 0 });
    component.onPlot('  A-12 New1 ');
    const typed = http.expectOne(q => q.url === '/api/admin/bookings');
    expect(typed.request.params.get('plotNo')).toBe('A-12 New1');
    expect(typed.request.params.get('status')).toBe('ACTIVE');
    typed.flush({ bookings: [], page: 0, size: 100, totalElements: 0 });
    component.onPlot('');
    const cleared = http.expectOne(q => q.url === '/api/admin/bookings');
    expect(cleared.request.params.has('plotNo')).toBe(false);
    cleared.flush({ bookings: [], page: 0, size: 100, totalElements: 0 });
  });
});
