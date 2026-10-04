import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { PlotBookingsService } from './plot-bookings.service';
import { AssociateBookingPage } from './models/associate-booking-page.model';
import { PlotPageResponse } from '../setup/models/project.model';

describe('PlotBookingsService', () => {
  let service: PlotBookingsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [PlotBookingsService]
    });
    service = TestBed.inject(PlotBookingsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('fetches the project catalog with no query params (unpaginated endpoint)', () => {
    service.listProjects().subscribe(res => expect(res).toEqual([]));

    const req = httpMock.expectOne('/api/company/projects');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('fetches a project\'s plots with page/size as query params', () => {
    const mockResponse: PlotPageResponse = { plots: [], page: 0, size: 20, totalElements: 0 };

    service.listPlots('project-1', 0, 20).subscribe(res => expect(res).toEqual(mockResponse));

    const req = httpMock.expectOne('/api/company/projects/project-1/plots?page=0&size=20');
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });

  it('fetches the caller\'s own bookings (with EMI schedules embedded) with page/size as query params', () => {
    const mockResponse: AssociateBookingPage = { bookings: [], page: 0, size: 20, totalElements: 0 };

    service.getMyBookings(0, 20).subscribe(res => expect(res).toEqual(mockResponse));

    const req = httpMock.expectOne('/api/associates/me/bookings?page=0&size=20');
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });

  it('requests a later plots page with the requested page/size', () => {
    service.listPlots('project-1', 2, 10).subscribe();

    const req = httpMock.expectOne(
      r => r.url === '/api/company/projects/project-1/plots' && r.params.get('page') === '2' && r.params.get('size') === '10'
    );
    req.flush({ plots: [], page: 2, size: 10, totalElements: 0 });
  });

  it('reads the plot grid from /api/projects/{id}/plots/grid', () => {
    service.getGrid('p1').subscribe(g => expect(g.length).toBe(1));
    const req = httpMock.expectOne('/api/projects/p1/plots/grid');
    expect(req.request.method).toBe('GET');
    req.flush([{ plotId: 'x', plotNo: 'A-1', type: 'NORMAL', area: 1, price: 2, status: 'AVAILABLE' }]);
  });
});
