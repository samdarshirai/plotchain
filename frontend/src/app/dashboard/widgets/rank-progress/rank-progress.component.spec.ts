import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { RankProgressComponent } from './rank-progress.component';

describe('RankProgressComponent', () => {
  let fixture: ComponentFixture<RankProgressComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RankProgressComponent, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(RankProgressComponent);
    fixture.componentInstance.data = {
      currentRank: 'Sales Associate', currentRankOrder: 1,
      nextRank: 'Sales Executive', progressPercent: 40, volumeToNextRank: 6000
    };
    fixture.detectChanges();
  });

  it('renders current rank and progress bar width', () => {
    expect(fixture.nativeElement.textContent).toContain('Sales Associate');
    const fill = fixture.nativeElement.querySelector('.progress-fill');
    expect(fill.style.width).toBe('40%');
  });

  it('renders the next rank name when present', () => {
    expect(fixture.nativeElement.textContent).toContain('Sales Executive');
  });
});
