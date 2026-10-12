import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { PlotBookingsService } from './plot-bookings.service';
import { AssociateBookingPage } from './models/associate-booking-page.model';

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

  it('fetches the caller\'s own bookings (with EMI schedules embedded) with page/size as query params', () => {
    const mockResponse: AssociateBookingPage = { bookings: [], page: 0, size: 20, totalElements: 0 };

    service.getMyBookings(0, 20).subscribe(res => expect(res).toEqual(mockResponse));

    const req = httpMock.expectOne('/api/associates/me/bookings?page=0&size=20');
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });
});
