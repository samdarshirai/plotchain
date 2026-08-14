import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { RewardsComponent } from './rewards.component';

describe('RewardsComponent', () => {
  let fixture: ComponentFixture<RewardsComponent>;
  let httpMock: HttpTestingController;

  const flushProgress = (overrides: Partial<any> = {}) => {
    httpMock.expectOne('/api/associates/me/rank-progress').flush({
      currentRank: 'Sales Associate', currentRankOrder: 1, nextRank: 'Sales Executive',
      progressPercent: 40, cumulativeMatchedVolume: 4000, volumeToNextRank: 6000,
      rewardTiers: [
        { tierLevel: 1, volumeThreshold: 1000, cashReward: 100, perkDescription: 'Tier 1', achieved: true },
        { tierLevel: 2, volumeThreshold: 5000, cashReward: 500, perkDescription: 'Tier 2', achieved: false }
      ],
      ...overrides
    });
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RewardsComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(RewardsComponent);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('loads and displays the current rank and progress bar width', () => {
    fixture.detectChanges();
    flushProgress();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Sales Associate');
    const fill: HTMLElement = fixture.nativeElement.querySelector('.progress-fill');
    expect(fill.style.width).toBe('40%');
  });

  it('renders the next rank name when present', () => {
    fixture.detectChanges();
    flushProgress();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Sales Executive');
  });

  it('renders a max-rank message instead of a next-rank line when nextRank is null', () => {
    fixture.detectChanges();
    flushProgress({ nextRank: null, progressPercent: 100, volumeToNextRank: 0 });
    fixture.detectChanges();

    expect(fixture.componentInstance.progress?.nextRank).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('rewards.maxRankReached');
  });

  it('renders one row per reward tier with an achieved/not-yet label', () => {
    fixture.detectChanges();
    flushProgress();
    fixture.detectChanges();

    expect(fixture.componentInstance.tierRows.length).toBe(2);
    expect(fixture.componentInstance.tierRows[0]['achieved']).toContain('rewards.achievedYes');
    expect(fixture.componentInstance.tierRows[1]['achieved']).toContain('rewards.achievedNo');
  });

  it('shows the reward-tier empty state when rewardTiers is empty', () => {
    fixture.detectChanges();
    flushProgress({ rewardTiers: [] });
    fixture.detectChanges();

    const emptyCell: HTMLElement | null = fixture.nativeElement.querySelector('.editable-table__empty');
    expect(emptyCell?.textContent?.trim()).toBeTruthy();
  });

  it('renders stat tiles for cumulative matched volume and volume to next rank', () => {
    fixture.detectChanges();
    flushProgress();
    fixture.detectChanges();

    const values = Array.from(fixture.nativeElement.querySelectorAll('.stat-tile__value')).map(
      (el: any) => el.textContent.trim()
    );
    expect(values).toContain('4000');
    expect(values).toContain('6000');
  });

  it('shows a load error when the request fails, without silently doing nothing', () => {
    fixture.detectChanges();
    httpMock.expectOne('/api/associates/me/rank-progress').flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.error).toBe(true);
    const errorEl: HTMLElement | null = fixture.nativeElement.querySelector('.rewards__load-error');
    expect(errorEl?.textContent?.trim()).toBeTruthy();
  });

  it('renders no action column and no filter controls (view-only)', () => {
    fixture.detectChanges();
    flushProgress();
    fixture.detectChanges();

    expect(fixture.componentInstance.tierColumns.some(c => c.type === 'action')).toBeFalse();
    expect(fixture.nativeElement.querySelector('select')).toBeFalsy();
  });
});
