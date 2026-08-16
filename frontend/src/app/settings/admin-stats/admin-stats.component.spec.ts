import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { AdminStatsComponent } from './admin-stats.component';
import { AdminStatsResponse } from './admin-stats.model';

describe('AdminStatsComponent', () => {
  let fixture: ComponentFixture<AdminStatsComponent>;
  let httpMock: HttpTestingController;

  const statsWithCycle: AdminStatsResponse = {
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

  const statsWithoutCycle: AdminStatsResponse = {
    totalAssociates: 42,
    kycBreakdown: { pending: 3, verified: 35, rejected: 4 },
    totalWalletBalance: 12345.67,
    currentCycle: null
  };

  function flushInitialLoad(response: AdminStatsResponse = statsWithCycle): void {
    httpMock.expectOne('/api/admin/stats').flush(response);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminStatsComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(AdminStatsComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('renders tiles for total associates, wallet balance, KYC breakdown, and cycle figures from a fixture response', () => {
    flushInitialLoad();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('42');
    expect(text).toContain('12345.67');
    expect(text).toContain('3');
    expect(text).toContain('35');
    expect(text).toContain('4');
    expect(text).toContain('500');
    expect(text).toContain('5');
    expect(text).toContain('28');
  });

  it('formats cycle income figures as currency with thousands separators, not raw numbers', () => {
    flushInitialLoad({
      ...statsWithCycle,
      currentCycle: { ...statsWithCycle.currentCycle!, directIncome: 1000, matchingIncome: 500, totalIncome: 91500 }
    });

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('1,000');
    expect(text).toContain('91,500');
    expect(text).not.toContain('91500');
  });

  it('renders an empty state instead of cycle figures when currentCycle is null', () => {
    flushInitialLoad(statsWithoutCycle);

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('settings.adminStats.noCycleEmptyState');
    expect(text).not.toContain('1500');
  });

  it('sets loadError and renders the error message when the request fails', () => {
    httpMock.expectOne('/api/admin/stats').flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.loadError).toBe(true);
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('settings.adminStats.loadError');
  });
});
