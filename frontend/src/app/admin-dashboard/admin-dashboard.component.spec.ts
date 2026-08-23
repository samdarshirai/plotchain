import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { RouterTestingModule } from '@angular/router/testing';
import { AdminDashboardComponent } from './admin-dashboard.component';
import { AdminStatsResponse } from './admin-dashboard.model';

describe('AdminDashboardComponent', () => {
  let fixture: ComponentFixture<AdminDashboardComponent>;
  let httpMock: HttpTestingController;

  const statsWithCycle: AdminStatsResponse = {
    totalAssociates: 6,
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
      totalIncome: 482600,
      newAssociatesThisCycle: 5,
      salesThisCycle: 12,
      revenueThisCycle: 2400000,
      previousCycleTotalIncome: 400000,
      incomeTrend: [380000, 400000, 482600]
    },
    activePlots: 21,
    totalSalesRecorded: 63,
    cyclesCompleted: 11,
    networkGrowth: [
      { cycleLabel: 'Jun', associateCount: 4 },
      { cycleLabel: 'Jul', associateCount: 5 },
      { cycleLabel: 'Aug', associateCount: 6 }
    ],
    recentSales: [{
      id: 's1', plotId: 'p1', associateId: 'a1', buyerName: 'Jane Buyer', buyerPhone: '9999999999',
      buyerEmail: null, amount: 840000, cycleId: 'c1', legCredited: 'L', status: 'RECORDED',
      voidReason: null, recordedAt: '2026-08-18T00:00:00Z', plotNo: 'VG2-118', projectName: 'Viraj Greens Ph II',
      associateUserId: 'VP00001', associateName: 'Jane Associate'
    }]
  };

  const statsWithoutCycle: AdminStatsResponse = {
    totalAssociates: 42,
    kycBreakdown: { pending: 3, verified: 35, rejected: 4 },
    totalWalletBalance: 12345.67,
    pendingWithdrawals: 0,
    currentCycle: null,
    activePlots: 0,
    totalSalesRecorded: 0,
    cyclesCompleted: 0,
    networkGrowth: [],
    recentSales: []
  };

  function flushInitialLoad(response: AdminStatsResponse = statsWithCycle): void {
    httpMock.expectOne('/api/admin/stats').flush(response);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminDashboardComponent, HttpClientTestingModule, TranslateModule.forRoot(), RouterTestingModule]
    }).compileComponents();

    fixture = TestBed.createComponent(AdminDashboardComponent);
    httpMock = TestBed.inject(HttpTestingController);

    const translate = TestBed.inject(TranslateService);
    translate.setDefaultLang('en');
    translate.use('en');
    translate.setTranslation('en', {
      adminDashboard: {
        cycleCloses: '{{days}} days left', cycleClosesSingular: '1 day left',
        deltaUp: '+{{amount}} vs last cycle', deltaDown: '-{{amount}} vs last cycle'
      }
    });

    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('renders the heading and subtitle', () => {
    flushInitialLoad();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('adminDashboard.heading');
    expect(text).toContain('adminDashboard.subtitle');
  });

  it('renders one Seal Card with this cycle\'s total income as the figure', () => {
    flushInitialLoad();

    const figure: HTMLElement = fixture.nativeElement.querySelector('.seal-card-panel__figure');
    expect(figure.textContent).toContain('482,600');
  });

  it('renders the Seal Card delta caption and trend sparkline from the cycle income trend', () => {
    flushInitialLoad();

    const delta: HTMLElement = fixture.nativeElement.querySelector('.seal-card-panel__delta');
    // 482600 - 400000 = 82600, positive -> deltaUp, not marked down.
    expect(delta.textContent).toContain('82,600');
    expect(delta.classList).not.toContain('seal-card-panel__delta--down');
    expect(fixture.nativeElement.querySelector('.seal-card-panel__trend polyline')).toBeTruthy();
  });

  it('renders the caption with the days remaining in the cycle', () => {
    flushInitialLoad();

    const caption: HTMLElement = fixture.nativeElement.querySelector('.seal-card-panel__caption');
    expect(caption.textContent?.trim()).toBe('28 days left');
  });

  it('renders an empty state instead of the Seal Card when currentCycle is null', () => {
    flushInitialLoad(statsWithoutCycle);

    expect(fixture.nativeElement.querySelector('.seal-card-panel')).toBeFalsy();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('adminDashboard.noCycleEmptyState');
  });

  it('sets loadError and renders the error message when the request fails', () => {
    httpMock.expectOne('/api/admin/stats').flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.loadError).toBe(true);
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('adminDashboard.loadError');
  });

  it('renders 4 KPI tiles with the previously-dead fields folded in as hints', () => {
    flushInitialLoad();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('6');
    expect(text).toContain('12,345.67');
    expect(text).toContain('12');
    expect(text).toContain('2,400,000');
    const hints: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('.stat-tile__hint');
    // Total Associates, Sales This Cycle, Revenue This Cycle each get a hint; Wallet Balance does not.
    expect(hints).toHaveSize(3);
  });

  it('renders the two-column panel row: recent sales, network growth, KYC summary', () => {
    flushInitialLoad();

    expect(fixture.nativeElement.querySelector('app-admin-recent-sales-table')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-admin-network-growth-chart')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-kyc-network-summary')).toBeTruthy();
  });

  it('links the pending withdrawals tile to the payout approval queue', () => {
    flushInitialLoad();

    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('a[href="/settings/payout-approval"]');
    expect(link).toBeTruthy();
  });

  it('renders quick action links to Record Sale and Provision Associate', () => {
    flushInitialLoad();

    expect(fixture.nativeElement.querySelector('a[href="/admin/sales/new"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('a[href="/admin/associates/new"]')).toBeTruthy();
  });
});
