import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { DashboardComponent } from './dashboard.component';
import { DashboardResponse } from './models/dashboard-response.model';

describe('DashboardComponent', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let httpMock: HttpTestingController;

  const mockResponse: DashboardResponse = {
    associate: {
      associateId: 'SDI384818', name: 'Asha Kumar', rank: 'Sales Associate',
      phone: '9876543210', joinedAt: '2025-09-05T05:25:42Z', rankChangedAt: null
    },
    kycPendingBannerVisible: true,
    cycleIncome: {
      cycleId: 'c1', directIncome: 1000, matchingIncome: 500, sponsorMatchingIncome: 300,
      selfPerformanceBonus: 200, royaltyBonus: 400, royaltyBonusPct: 3, totalIncome: 2400,
      previousCycleTotalIncome: 1800, incomeTrend: [1200, 1800, 2400]
    },
    wallet: { balance: 2500 },
    cycleCountdown: { cycleId: 'c1', daysRemaining: 9 },
    salesSummary: { salesThisCycle: 6, revenueBookedThisCycle: 3850000, revenueBookedChangePct: 18 },
    networkSummary: { totalDownline: 42, directCount: 8 },
    networkGrowth: [
      { cycleLabel: '01', downlineCount: 12 }, { cycleLabel: '02', downlineCount: 18 },
      { cycleLabel: '03', downlineCount: 25 }, { cycleLabel: '04', downlineCount: 30 },
      { cycleLabel: '05', downlineCount: 34 }, { cycleLabel: '06', downlineCount: 37 },
      { cycleLabel: '07', downlineCount: 40 }, { cycleLabel: '08', downlineCount: 42 }
    ],
    kycBreakdown: { verified: 38, pending: 1, rejected: 3 }
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardComponent, HttpClientTestingModule, RouterTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    const dashboardReq = httpMock.expectOne('/api/associates/me/dashboard');
    dashboardReq.flush(mockResponse);
    fixture.detectChanges();

    // RecentSalesTableComponent fires its own request as a child; flush it so fixture settles.
    const salesReq = httpMock.expectOne(r => r.url === '/api/associates/me/sales');
    salesReq.flush({ page: 0, size: 5, totalElements: 0, sales: [] });
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('renders the page header with the associate name, rank badge, and cycle subtitle', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Asha Kumar');
    expect(text).toContain('Sales Associate');
    expect(text).toContain('SDI384818');
  });

  it('renders the Seal Card, KYC banner, and all four KPI tiles', () => {
    expect(fixture.nativeElement.querySelector('app-cycle-income-card')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-kyc-banner')).toBeTruthy();
    expect(fixture.nativeElement.querySelectorAll('app-stat-tile').length).toBe(4);
  });

  it('renders the two-column panel row: recent sales, network growth, KYC summary, quick actions', () => {
    expect(fixture.nativeElement.querySelector('app-recent-sales-table')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-network-growth-chart')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-kyc-network-summary')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-quick-actions')).toBeTruthy();
  });
});
