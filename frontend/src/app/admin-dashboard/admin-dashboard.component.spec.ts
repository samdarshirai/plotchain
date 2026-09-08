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
    totalAssociates: 214,
    kycBreakdown: { pending: 11, verified: 35, rejected: 4 },
    totalWalletBalance: 12345.67,
    pendingWithdrawals: 7,
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
      associateUserId: 'VP00001', associateName: 'Jane Associate', note: 'Sold to Jane Buyer'
    }],
    pendingWithdrawalsValue: 218400,
    oldestPendingWithdrawalAgeDays: 4,
    plotsSold: 119,
    plotsTotal: 140,
    networkHealth: { activeThisCycle: 168, joinedThisCycle: 19, deepestLeg: 7 }
  };

  const statsWithoutCycle: AdminStatsResponse = {
    totalAssociates: 42,
    kycBreakdown: { pending: 0, verified: 35, rejected: 4 },
    totalWalletBalance: 12345.67,
    pendingWithdrawals: 0,
    currentCycle: null,
    activePlots: 0,
    totalSalesRecorded: 0,
    cyclesCompleted: 0,
    networkGrowth: [],
    recentSales: [],
    pendingWithdrawalsValue: 0,
    oldestPendingWithdrawalAgeDays: null,
    plotsSold: 0,
    plotsTotal: 0,
    networkHealth: { activeThisCycle: 0, joinedThisCycle: 0, deepestLeg: 0 }
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
        cycleClosesShort: '{{days}} days left', cycleClosesShortSingular: '1 day left',
        deltaUp: '+{{amount}} vs last cycle', deltaDown: '-{{amount}} vs last cycle',
        decisionOldest: 'oldest {{days}} days'
      }
    });

    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('renders the operations title', () => {
    flushInitialLoad();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('adminDashboard.operationsTitle');
  });

  it('renders one Seal Card with the payout liability figure', () => {
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

  it('renders the seal strip with revenue, sales, and active-of-total associates', () => {
    flushInitialLoad();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('2,400,000'); // revenueThisCycle formatted currency
    expect(text).toContain('168');
    expect(text).toContain('214');
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

  it('renders the decision queue with withdrawals and KYC rows linking to their queues', () => {
    flushInitialLoad();

    const rows: HTMLAnchorElement[] = Array.from(fixture.nativeElement.querySelectorAll('.admin-dashboard__decision-row'));
    expect(rows.length).toBe(2);
    expect(rows[0].getAttribute('href')).toBe('/settings/payout-approval');
    expect(rows[1].getAttribute('href')).toBe('/settings/kyc-queue');

    const counts = fixture.nativeElement.querySelectorAll('.admin-dashboard__decision-count');
    expect(counts[0].textContent.trim()).toBe('7');
    expect(counts[1].textContent.trim()).toBe('11');
  });

  it('marks a decision row empty when its count is zero', () => {
    flushInitialLoad(statsWithoutCycle);

    const rows: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('.admin-dashboard__decision-row'));
    expect(rows.every(r => r.classList.contains('admin-dashboard__decision-row--empty'))).toBeTrue();
  });

  it('renders the recent sales table, network health, and inventory panels', () => {
    flushInitialLoad();

    expect(fixture.nativeElement.querySelector('app-admin-recent-sales-table')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.admin-dashboard__network')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.admin-dashboard__inventory')).toBeTruthy();

    // 119/140 sold -> round(119/140*24) = 20 of the 24 grid cells filled.
    const soldCells = fixture.nativeElement.querySelectorAll('.admin-dashboard__cell--sold');
    expect(soldCells.length).toBe(20);
  });

  it('renders quick action links to Provision Associate and Record Sale', () => {
    flushInitialLoad();

    expect(fixture.nativeElement.querySelector('a[href="/admin/sales/new"]')).toBeTruthy();
    expect(
      fixture.nativeElement.querySelector('a[href="/settings/associate-directory?provision=1"]')
    ).toBeTruthy();
  });
});
