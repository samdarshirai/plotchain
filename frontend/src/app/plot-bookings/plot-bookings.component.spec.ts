import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { PlotBookingsComponent } from './plot-bookings.component';

describe('PlotBookingsComponent', () => {
  let fixture: ComponentFixture<PlotBookingsComponent>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlotBookingsComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(PlotBookingsComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne('/api/company/projects').flush([]);
  });
  afterEach(() => http.verify());

  it('opens on Availability and does not fetch bookings until the My bookings tab is opened', () => {
    expect(el().querySelector('app-plot-availability')).not.toBeNull();
    expect(el().querySelector('app-my-bookings')).toBeNull();
    http.expectNone(r => r.url === '/api/associates/me/bookings');
  });

  it('switching to My bookings mounts it and loads the first page once', () => {
    fixture.componentInstance.onTabChange('myBookings');
    fixture.detectChanges();
    http.expectOne(r => r.url === '/api/associates/me/bookings').flush({ bookings: [], page: 0, size: 20, totalElements: 0 });
    expect(el().querySelector('app-my-bookings')).not.toBeNull();
    expect(el().querySelector('app-plot-availability')).toBeNull();
  });

  it('the empty-state "View availability" link switches back to the Availability tab', () => {
    fixture.componentInstance.onTabChange('myBookings');
    fixture.detectChanges();
    http.expectOne(r => r.url === '/api/associates/me/bookings').flush({ bookings: [], page: 0, size: 20, totalElements: 0 });
    fixture.detectChanges();
    el().querySelector<HTMLButtonElement>('.my-bookings__view-availability')!.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.activeTab).toBe('availability');
    http.expectOne('/api/company/projects').flush([]); // Availability re-mounts and reloads
  });

  it('renders the title and subtitle keys', () => {
    expect(el().textContent).toContain('plotBookings.title');
    expect(el().textContent).toContain('plotBookings.subtitle');
  });
});
