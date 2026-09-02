import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
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
    kycBreakdown: { verified: 38, pending: 1, rejected: 3 },
    legVolumeSummary: { leftLegVolume: 300000, rightLegVolume: 200000 }
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardComponent, HttpClientTestingModule, RouterTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);

    const translate = TestBed.inject(TranslateService);
    translate.setDefaultLang('en');
    translate.use('en');
    translate.setTranslation('en', {
      dashboard: {
        networkHint: '{{direct}} direct · {{downline}} downline',
        revenueUp: '+{{pct}}% vs last cycle',
        revenueDown: '-{{pct}}% vs last cycle'
      }
    });
  });

  afterEach(() => httpMock.verify());

  function loadDashboard(): void {
    fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();

    const dashboardReq = httpMock.expectOne('/api/associates/me/dashboard');
    dashboardReq.flush(mockResponse);
    fixture.detectChanges();

    // RecentSalesTableComponent fires its own request as a child; flush it so fixture settles.
    const salesReq = httpMock.expectOne(r => r.url === '/api/associates/me/sales');
    salesReq.flush({ page: 0, size: 5, totalElements: 0, sales: [] });
    fixture.detectChanges();
  }

  it('renders the page header with the associate name, rank badge, and cycle subtitle', () => {
    loadDashboard();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Asha Kumar');
    expect(text).toContain('Sales Associate');
    expect(text).toContain('SDI384818');
  });

  it('renders the Seal Card, KYC banner, and all six KPI tiles', () => {
    loadDashboard();
    expect(fixture.nativeElement.querySelector('app-cycle-income-card')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-kyc-banner')).toBeTruthy();
    expect(fixture.nativeElement.querySelectorAll('app-stat-tile').length).toBe(6);
  });

  it('renders the two-column panel row: recent sales, network growth, KYC summary, quick actions', () => {
    loadDashboard();
    expect(fixture.nativeElement.querySelector('app-recent-sales-table')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-network-growth-chart')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-kyc-network-summary')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-quick-actions')).toBeTruthy();
  });

  it('formats each KPI tile value and hint from the response data', () => {
    loadDashboard();
    const values: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('.stat-tile__value');
    const hints: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('.stat-tile__hint');

    // Tiles in order: Wallet Balance, Network, Sales This Cycle (no hint), Revenue Booked,
    // Left Leg Volume, Right Leg Volume.
    expect(values[0].textContent).toContain('2,500');
    expect(values[1].textContent?.trim()).toBe('42');
    expect(values[2].textContent?.trim()).toBe('6');
    expect(values[3].textContent).toContain('3,850,000');
    expect(values[4].textContent).toContain('300,000');
    expect(values[5].textContent).toContain('200,000');

    expect(hints).toHaveSize(3);
    // networkSummary: totalDownline 42, directCount 8 -> 42 - 8 = 34 downline.
    expect(hints[1].textContent?.trim()).toBe('8 direct · 34 downline');
    // salesSummary.revenueBookedChangePct: 18 -> positive, "+18%".
    expect(hints[2].textContent).toContain('+18%');
  });

  it('shows the top-level error state when the dashboard request fails, and never renders the dashboard body', () => {
    fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();

    const dashboardReq = httpMock.expectOne('/api/associates/me/dashboard');
    dashboardReq.flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.dashboard-error')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.dashboard')).toBeFalsy();
  });
});
