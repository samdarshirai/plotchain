import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { ViewPlotEmiComponent } from './view-plot-emi.component';

describe('ViewPlotEmiComponent', () => {
  let fixture: ComponentFixture<ViewPlotEmiComponent>;
  let component: ViewPlotEmiComponent;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ViewPlotEmiComponent, HttpClientTestingModule, TranslateModule.forRoot()] }).compileComponents();
    fixture = TestBed.createComponent(ViewPlotEmiComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });
  afterEach(() => http.verify());

  it('loads pending-money bookings for the first project and last-30-day range', () => {
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
