import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminStatsResponse } from './admin-dashboard.model';

describe('AdminDashboardService', () => {
  let service: AdminDashboardService;
  let httpMock: HttpTestingController;

  const stats: AdminStatsResponse = {
    totalAssociates: 42,
    kycBreakdown: { pending: 3, verified: 35, rejected: 4 },
    totalWalletBalance: 12345.67,
    pendingWithdrawals: 2,
    currentCycle: {
      cycleId: 'c1',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      daysRemaining: 28,
      directIncome: 1000,
      matchingIncome: 500,
      totalIncome: 1500,
      newAssociatesThisCycle: 5,
      salesThisCycle: 12,
      revenueThisCycle: 2400000
    },
    activePlots: 21,
    totalSalesRecorded: 63,
    cyclesCompleted: 11
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [AdminDashboardService]
    });
    service = TestBed.inject(AdminDashboardService);
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
