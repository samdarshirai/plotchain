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
      phone: '9876543210', joinedAt: '2025-09-05T05:25:42Z', rankChangedAt: null,
      sponsorAssociateId: 'SDI100001', sponsorName: 'Head Office Sponsor'
    },
    kycPendingBannerVisible: true,
    cycleIncome: {
      cycleId: 'c1', directIncome: 1000, matchingIncome: 500, sponsorMatchingIncome: 300,
      selfPerformanceBonus: 200, royaltyBonus: 400, royaltyBonusPct: 3, totalIncome: 2400,
      previousCycleTotalIncome: 1800, incomeTrend: [1200, 1800, 2400],
      matchingIncomeLifetime: 126000, sponsorMatchingIncomeLifetime: 0
    },
    wallet: { balance: 2500 },
    cycleCountdown: { cycleId: 'c1', daysRemaining: 9, cycleNumber: 9, periodStart: '2026-09-01', periodEnd: '2026-09-17' },
    salesSummary: { salesThisCycle: 6, revenueBookedThisCycle: 3850000, revenueBookedChangePct: 18 },
    networkSummary: { totalDownline: 42, directCount: 8, leftAssociateCount: 184, rightAssociateCount: 134 },
    legVolumeSummary: {
      leftLegVolume: 300000, rightLegVolume: 200000,
      totalLeftBusiness: 3100000, totalRightBusiness: 1800000, totalSelfBusiness: 0, newBookedAreaSqft: 1200
    }
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
        cycleRange: 'Cycle {{number}} · {{start}}–{{end}}',
        designationValue: 'Sales Executive',
        businessVolumeEyebrow: 'Business Volume',
        networkIncomeEyebrow: 'Network & Income',
        settlesAtCycleClose: 'settles at cycle close',
        lifetimeVolume: 'lifetime volume',
        ownBookings: 'own bookings',
        newLeftBusinessLabel: 'New Left Business',
        newRightBusinessLabel: 'New Right Business',
        totalLeftBusinessLabel: 'Total Left Business',
        totalRightBusinessLabel: 'Total Right Business',
        totalSelfBusinessLabel: 'Total Self Business',
        newMatchingBusinessLabel: 'New Matching Business',
        leftAssociatesLabel: 'Total Left Associates',
        rightAssociatesLabel: 'Total Right Associates',
        inLeftLeg: 'in left leg',
        inRightLeg: 'in right leg',
        networkLabel: 'Network',
        salesThisCycleLabel: 'Sales This Cycle',
        newBookedAreaLabel: 'New Booked Area',
        thisCycle: 'this cycle',
        lifetime: 'lifetime',
        directIncomeLabel: 'Direct Income',
        matchingIncomeLabel: 'Matching Income',
        sponsorMatchingLabel: "Sponsor's Matching",
        currentRoyaltyBonusLabel: 'Current Royalty Bonus',
        rankBasedPoolShare: 'rank-based pool share',
        walletBalanceLabel: 'Wallet Balance',
        withdrawContactAdmin: 'Withdrawals are raised by your admin.'
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

  it('renders the page header with the rank badge and bare associate ID (mockup keeps the header name-free -- the name lives in the profile card)', () => {
    loadDashboard();
    const header = fixture.nativeElement.querySelector('.dashboard__header');
    expect(header.textContent).not.toContain('Asha Kumar');
    expect(header.textContent).toContain('Sales Associate');
    const idCaption = fixture.nativeElement.querySelector('.dashboard__id-caption');
    expect(idCaption.textContent.trim()).toBe('SDI384818');
  });

  it('renders the profile card and Seal Card side by side in the hero row', () => {
    loadDashboard();
    const hero = fixture.nativeElement.querySelector('.dashboard__hero');
    expect(hero.querySelector('app-profile-card')).toBeTruthy();
    expect(hero.querySelector('app-cycle-income-card')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Asha Kumar');
  });

  it('renders the KYC banner and both tile sections with 6 Business Volume and 10 Network & Income tiles', () => {
    loadDashboard();
    expect(fixture.nativeElement.querySelector('app-kyc-banner')).toBeTruthy();
    const sections = fixture.nativeElement.querySelectorAll('.dashboard__section');
    expect(sections.length).toBe(2);
    expect(sections[0].textContent).toContain('Business Volume');
    expect(sections[0].querySelectorAll('app-stat-tile').length).toBe(6);
    expect(sections[1].textContent).toContain('Network & Income');
    expect(sections[1].querySelectorAll('app-stat-tile').length).toBe(10);
  });

  it('renders the two-column panel row: leg balance, recent sales, quick actions', () => {
    loadDashboard();
    expect(fixture.nativeElement.querySelector('app-leg-balance')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-recent-sales-table')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-quick-actions')).toBeTruthy();
  });

  it('renders the cycle number and date-range text in the header', () => {
    loadDashboard();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Cycle 9');
  });

  it('formats the Business Volume tiles from the response data, including the static-zero "settles at cycle close" tiles', () => {
    loadDashboard();
    const sections = fixture.nativeElement.querySelectorAll('.dashboard__section');
    const values: NodeListOf<HTMLElement> = sections[0].querySelectorAll('.stat-tile__value');
    const hints: NodeListOf<HTMLElement> = sections[0].querySelectorAll('.stat-tile__hint');

    // Tiles in order: New Left, New Right, Total Left, Total Right, Total Self, New Matching.
    expect(values[0].textContent?.trim()).toBe('0');
    expect(values[1].textContent?.trim()).toBe('0');
    expect(values[2].textContent).toContain('3,100,000');
    expect(values[3].textContent).toContain('1,800,000');
    expect(values[4].textContent).toContain('0');
    expect(values[5].textContent?.trim()).toBe('0');

    expect(hints[0].textContent?.trim()).toBe('settles at cycle close');
    expect(hints[2].textContent?.trim()).toBe('lifetime volume');
  });

  it('formats the Network & Income tiles from the response data', () => {
    loadDashboard();
    const sections = fixture.nativeElement.querySelectorAll('.dashboard__section');
    const values: NodeListOf<HTMLElement> = sections[1].querySelectorAll('.stat-tile__value');
    const hints: NodeListOf<HTMLElement> = sections[1].querySelectorAll('.stat-tile__hint');

    // Tiles in order: Left Associates, Right Associates, Network, Sales This Cycle, New Booked
    // Area, Direct Income, Matching Income, Sponsor's Matching, Current Royalty Bonus, Wallet.
    expect(values[0].textContent?.trim()).toBe('184');
    expect(values[1].textContent?.trim()).toBe('134');
    expect(values[2].textContent?.trim()).toBe('42');
    expect(values[3].textContent?.trim()).toBe('6');
    expect(values[4].textContent).toContain('1,200');
    expect(values[5].textContent).toContain('1,000');
    expect(values[6].textContent).toContain('126,000');
    expect(values[8].textContent).toContain('(3%)');
    expect(values[9].textContent).toContain('2,500');

    // networkSummary: totalDownline 42, directCount 8 -> 42 - 8 = 34 downline.
    expect(hints[2].textContent?.trim()).toBe('8 direct · 34 downline');
    // Sales This Cycle has no hint -- only 9 of the 10 tiles carry one.
    expect(hints.length).toBe(9);
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
