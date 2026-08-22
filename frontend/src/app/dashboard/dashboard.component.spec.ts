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
    cycleIncome: { cycleId: 'c1', directIncome: 1000, matchingIncome: 500, sponsorMatchingIncome: 300, selfPerformanceBonus: 200, royaltyBonus: 400, royaltyBonusPct: 3, totalIncome: 2400, previousCycleTotalIncome: 1800, incomeTrend: [1200, 1800, 2400] },
    wallet: { balance: 2500 },
    cycleCountdown: { cycleId: 'c1', daysRemaining: 10 },
    salesSummary: { salesThisCycle: 5, revenueBookedThisCycle: 2500000, revenueBookedChangePct: 12.5 },
    networkSummary: { totalDownline: 12, directCount: 3 },
    networkGrowth: [{ cycleLabel: 'C1', downlineCount: 8 }, { cycleLabel: 'C2', downlineCount: 10 }, { cycleLabel: 'C3', downlineCount: 12 }],
    kycBreakdown: { verified: 8, pending: 2, rejected: 1 }
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardComponent, HttpClientTestingModule, RouterTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    const req = httpMock.expectOne('/api/associates/me/dashboard');
    req.flush(mockResponse);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('renders all nine widgets in the spec-mandated stat-first order', () => {
    const selectors = Array.from(fixture.nativeElement.querySelectorAll('.dashboard > *'))
      .map((el: any) => el.tagName.toLowerCase());
    expect(selectors).toEqual([
      'app-associate-identity-header',
      'app-kyc-banner',
      'app-cycle-income-card',
      'app-wallet-card',
      'app-leg-volume-gauge',
      'app-rank-progress',
      'app-team-snapshot',
      'app-quick-actions',
      'app-cycle-countdown',
      'app-announcements-strip'
    ]);
  });
});
