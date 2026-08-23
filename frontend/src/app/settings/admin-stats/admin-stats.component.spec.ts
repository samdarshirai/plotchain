import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { AdminStatsComponent } from './admin-stats.component';
import { AdminStatsResponse } from '../../admin-dashboard/admin-dashboard.model';

describe('AdminStatsComponent', () => {
  let fixture: ComponentFixture<AdminStatsComponent>;
  let httpMock: HttpTestingController;

  const stats: AdminStatsResponse = {
    totalAssociates: 128,
    kycBreakdown: { pending: 7, verified: 118, rejected: 3 },
    totalWalletBalance: 999.99,
    pendingWithdrawals: 3,
    currentCycle: null,
    activePlots: 4,
    totalSalesRecorded: 63,
    cyclesCompleted: 11,
    networkGrowth: [],
    recentSales: []
  };

  function flushInitialLoad(response: AdminStatsResponse = stats): void {
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

  it('renders tiles for total associates, active plots, sales recorded, pending KYC, pending payouts, and cycles completed', () => {
    flushInitialLoad();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('128');
    expect(text).toContain('4');
    expect(text).toContain('63');
    expect(text).toContain('7');
    expect(text).toContain('3');
    expect(text).toContain('11');
  });

  it('renders a total-wallet-balance tile as formatted currency', () => {
    flushInitialLoad({ ...stats, totalWalletBalance: 1234567.5 });

    const tiles: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('.admin-stats__tiles app-stat-tile'));
    expect(tiles.length).toBe(7);

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('settings.adminStats.totalWalletBalanceLabel');
    expect(text).toContain('₹1,234,567.5');
  });

  it('gives every tile the same vertical layout as the other six', () => {
    flushInitialLoad();

    const tiles: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('.admin-stats__tiles .stat-tile'));
    expect(tiles.length).toBe(7);
    tiles.forEach(tile => expect(tile.classList.contains('stat-tile--vertical')).toBeTrue());
  });

  it('sets loadError and renders the error message when the request fails', () => {
    httpMock.expectOne('/api/admin/stats').flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.loadError).toBe(true);
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('settings.adminStats.loadError');
  });
});
