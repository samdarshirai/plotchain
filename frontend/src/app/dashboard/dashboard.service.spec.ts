import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { DashboardService } from './dashboard.service';
import { DashboardResponse } from './models/dashboard-response.model';

describe('DashboardService', () => {
  let service: DashboardService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [DashboardService]
    });
    service = TestBed.inject(DashboardService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it("fetches the authenticated associate's dashboard", () => {
    const mockResponse: Partial<DashboardResponse> = { kycPendingBannerVisible: false };

    service.getDashboard().subscribe(res => {
      expect(res.kycPendingBannerVisible).toBeFalse();
    });

    const req = httpMock.expectOne('/api/associates/me/dashboard');
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });
});
