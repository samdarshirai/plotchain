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

  it('fetches the dashboard for a given associate id', () => {
    const associateId = 'associate-123';
    const mockResponse: Partial<DashboardResponse> = { kycPendingBannerVisible: false };

    service.getDashboard(associateId).subscribe(res => {
      expect(res.kycPendingBannerVisible).toBeFalse();
    });

    const req = httpMock.expectOne(`/api/associates/${associateId}/dashboard`);
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });
});
