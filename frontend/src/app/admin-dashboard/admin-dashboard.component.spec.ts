import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { RouterTestingModule } from '@angular/router/testing';
import { AdminDashboardComponent } from './admin-dashboard.component';
import { AdminStatsResponse } from './admin-dashboard.model';

describe('AdminDashboardComponent', () => {
  let fixture: ComponentFixture<AdminDashboardComponent>;
  let httpMock: HttpTestingController;

  const statsWithCycle: AdminStatsResponse = {
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

  const statsWithoutCycle: AdminStatsResponse = {
    totalAssociates: 42,
    kycBreakdown: { pending: 3, verified: 35, rejected: 4 },
    totalWalletBalance: 12345.67,
    pendingWithdrawals: 0,
    currentCycle: null,
    activePlots: 0,
    totalSalesRecorded: 0,
    cyclesCompleted: 0
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
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('renders tiles for total associates, wallet balance, sales/revenue this cycle, KYC breakdown, and pending withdrawals', () => {
    flushInitialLoad();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('42');
    expect(text).toContain('12,345.67');
    expect(text).toContain('12');
    expect(text).toContain('2,400,000');
    expect(text).toContain('3');
    expect(text).toContain('35');
    expect(text).toContain('4');
    expect(text).toContain('2');
  });

  it('renders an empty state instead of cycle figures when currentCycle is null', () => {
    flushInitialLoad(statsWithoutCycle);

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('adminDashboard.noCycleEmptyState');
    expect(text).not.toContain('2,400,000');
  });

  it('sets loadError and renders the error message when the request fails', () => {
    httpMock.expectOne('/api/admin/stats').flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.loadError).toBe(true);
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('adminDashboard.loadError');
  });

  it('links the pending withdrawals tile to the payout approval queue', () => {
    flushInitialLoad();

    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('a[href="/settings/payout-approval"]');
    expect(link).toBeTruthy();
  });

  it('links the KYC pending tile to the KYC review queue', () => {
    flushInitialLoad();

    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('a[href="/settings/kyc-queue"]');
    expect(link).toBeTruthy();
  });

  it('renders quick action links to Record Sale and Provision Associate', () => {
    flushInitialLoad();

    expect(fixture.nativeElement.querySelector('a[href="/admin/sales/new"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('a[href="/admin/associates/new"]')).toBeTruthy();
  });
});
