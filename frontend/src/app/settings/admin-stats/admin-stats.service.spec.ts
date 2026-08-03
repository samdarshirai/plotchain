import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AdminStatsService } from './admin-stats.service';
import { AdminStatsResponse } from './admin-stats.model';

describe('AdminStatsService', () => {
  let service: AdminStatsService;
  let httpMock: HttpTestingController;

  const stats: AdminStatsResponse = {
    totalAssociates: 42,
    kycBreakdown: { pending: 3, verified: 35, rejected: 4 },
    totalWalletBalance: 12345.67,
    currentCycle: {
      cycleId: 'c1',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      daysRemaining: 28,
      directIncome: 1000,
      matchingIncome: 500,
      totalIncome: 1500,
      newAssociatesThisCycle: 5
    }
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [AdminStatsService]
    });
    service = TestBed.inject(AdminStatsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('fetches stats from GET /api/admin/stats and round-trips the response', () => {
    let result: AdminStatsResponse | undefined;
    service.getStats().subscribe(r => (result = r));

    const req = httpMock.expectOne('/api/admin/stats');
    expect(req.request.method).toBe('GET');
    req.flush(stats);

    expect(result).toEqual(stats);
  });
});
