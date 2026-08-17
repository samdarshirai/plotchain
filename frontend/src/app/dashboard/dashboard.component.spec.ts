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
    cycleIncome: { cycleId: 'c1', directIncome: 1000, matchingIncome: 500, totalIncome: 1500 },
    wallet: { balance: 2500 },
    legVolume: { leftVolume: 3000, rightVolume: 2000, carriedForwardLeft: 0, carriedForwardRight: 1000, projectedMatchAmount: 140 },
    rankProgress: { currentRank: 'Sales Associate', currentRankOrder: 1, nextRank: 'Sales Executive', progressPercent: 40, volumeToNextRank: 6000 },
    teamSnapshot: { totalDownline: 12, activeToday: 3, newJoinsThisCycle: 2 },
    cycleCountdown: { cycleId: 'c1', daysRemaining: 10 },
    announcements: [{ id: 'a1', title: 'Green Valley launch', publishedAt: '2026-07-20T00:00:00Z' }]
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
