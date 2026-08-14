import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { PlotBookingsComponent } from './plot-bookings.component';

describe('PlotBookingsComponent', () => {
  let fixture: ComponentFixture<PlotBookingsComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlotBookingsComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(PlotBookingsComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    httpMock.expectOne('/api/company/projects').flush([
      { id: 'proj-1', name: 'Green Valley', location: 'Hyderabad', hasThumbnail: false, totalPlots: 2, availablePlots: 1, soldPlots: 0, createdAt: '2026-01-01T00:00:00Z' }
    ]);
  });

  afterEach(() => httpMock.verify());

  it('defaults to the Available Plots tab and loads the project catalog on init', () => {
    expect(fixture.componentInstance.activeTab).toBe('availablePlots');
    expect(fixture.componentInstance.projects.length).toBe(1);
  });

  it('shows a load error when the project catalog fails to load, without silently doing nothing', () => {
    const errFixture = TestBed.createComponent(PlotBookingsComponent);
    errFixture.detectChanges();
    httpMock.expectOne('/api/company/projects').flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    errFixture.detectChanges();

    expect(errFixture.componentInstance.projectsLoadError).toBe(true);
    const errorEl: HTMLElement | null = errFixture.nativeElement.querySelector('.plot-bookings__projects-load-error');
    expect(errorEl?.textContent?.trim()).toBeTruthy();
  });

  it('shows a hint and no plots table until a project is selected', () => {
    const hint: HTMLElement | null = fixture.nativeElement.querySelector('.plot-bookings__select-project-hint');
    expect(hint?.textContent?.trim()).toBeTruthy();
    expect(fixture.componentInstance.plotPage).toBeNull();
  });

  it('loads the selected project\'s first page of plots on selection', () => {
    fixture.componentInstance.onProjectSelect('proj-1');
    const req = httpMock.expectOne('/api/company/projects/proj-1/plots?page=0&size=20');
    req.flush({
      plots: [{ id: 'plot-1', plotNo: 'A-101', plotType: 'NORMAL', areaSqft: 1200, rate: 500, price: 600000, status: 'AVAILABLE' }],
      page: 0, size: 20, totalElements: 1
    });

    expect(fixture.componentInstance.plotRows.length).toBe(1);
    expect(fixture.componentInstance.plotRows[0]['status']).toBe('AVAILABLE');
  });

  it('shows a plots load error scoped to the selected project, without silently doing nothing', () => {
    fixture.componentInstance.onProjectSelect('proj-1');
    httpMock.expectOne('/api/company/projects/proj-1/plots?page=0&size=20')
      .flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.plotsLoadError).toBe(true);
    const errorEl: HTMLElement | null = fixture.nativeElement.querySelector('.plot-bookings__plots-load-error');
    expect(errorEl?.textContent?.trim()).toBeTruthy();
  });

  it('does not load My Bookings until that tab is opened', () => {
    expect(fixture.componentInstance.bookingPage).toBeNull();
    httpMock.expectNone('/api/associates/me/bookings?page=0&size=20');
  });

  it('loads My Bookings the first time that tab is opened, and only once', () => {
    fixture.componentInstance.onTabChange('myBookings');
    httpMock.expectOne('/api/associates/me/bookings?page=0&size=20').flush({ bookings: [], page: 0, size: 20, totalElements: 0 });

    fixture.componentInstance.onTabChange('availablePlots');
    fixture.componentInstance.onTabChange('myBookings');
    httpMock.expectNone('/api/associates/me/bookings?page=0&size=20');
  });

  it('shows an empty state when the caller has no bookings yet', () => {
    fixture.componentInstance.onTabChange('myBookings');
    httpMock.expectOne('/api/associates/me/bookings?page=0&size=20').flush({ bookings: [], page: 0, size: 20, totalElements: 0 });
    fixture.detectChanges();

    const emptyCell: HTMLElement | null = fixture.nativeElement.querySelector('.editable-table__empty');
    expect(emptyCell?.textContent?.trim()).toBeTruthy();
  });

  it('opens the EMI schedule side panel on row click, using embedded installments with no extra HTTP call', () => {
    fixture.componentInstance.onTabChange('myBookings');
    httpMock.expectOne('/api/associates/me/bookings?page=0&size=20').flush({
      bookings: [{
        id: 'b1', plotId: 'plot-1', associateId: 'a1', totalAmount: 600000, installmentCount: 2,
        bookedAt: '2026-01-01T00:00:00Z',
        installments: [
          { installmentNumber: 1, amount: 300000, dueDate: '2026-02-01' },
          { installmentNumber: 2, amount: 300000, dueDate: '2026-03-01' }
        ]
      }],
      page: 0, size: 20, totalElements: 1
    });

    fixture.componentInstance.selectBooking(fixture.componentInstance.bookingPage!.bookings[0]);
    httpMock.verify(); // no pending requests -- proves selectBooking made no HTTP call

    expect(fixture.componentInstance.panelOpen).toBe(true);
    expect(fixture.componentInstance.emiRows.length).toBe(2);
    expect(fixture.componentInstance.emiRows[0]['installmentNumber']).toBe('1');
  });

  it('closes the side panel via the close event', () => {
    fixture.componentInstance.selectedBooking = { id: 'b1', plotId: 'plot-1', associateId: 'a1', totalAmount: 1, installmentCount: 1, bookedAt: '', installments: [] };
    fixture.componentInstance.panelOpen = true;

    fixture.componentInstance.closePanel();

    expect(fixture.componentInstance.panelOpen).toBe(false);
  });

  it('renders no booking-creation form or action controls anywhere on this screen (view-only, per spec write-scope decision)', () => {
    expect(fixture.nativeElement.querySelector('form')).toBeFalsy();
    expect(fixture.componentInstance.plotColumns.some(c => c.type === 'action')).toBeFalse();
    expect(fixture.componentInstance.bookingColumns.some(c => c.type === 'action')).toBeFalse();
  });
});
