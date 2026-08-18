import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { LegVolumeGaugeComponent } from './leg-volume-gauge.component';

describe('LegVolumeGaugeComponent', () => {
  let fixture: ComponentFixture<LegVolumeGaugeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LegVolumeGaugeComponent, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(LegVolumeGaugeComponent);
    fixture.componentInstance.data = {
      leftVolume: 3000, rightVolume: 2000,
      carriedForwardLeft: 500, carriedForwardRight: 1000,
      projectedMatchAmount: 140,
      totalLeftBusiness: 300000, totalRightBusiness: 200000,
      newBookedAreaSqft: 450
    };
    fixture.detectChanges();
  });

  it('renders left and right leg volumes and the projected match amount', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('3,000');
    expect(text).toContain('2,000');
    expect(text).toContain('140');
  });

  it('renders carried forward left and right business', () => {
    const left = fixture.nativeElement.querySelector('.leg-carried-forward.left').textContent;
    const right = fixture.nativeElement.querySelector('.leg-carried-forward.right').textContent;
    expect(left).toContain('500');
    expect(right).toContain('1,000');
  });

  it('renders lifetime total left and right business', () => {
    const left = fixture.nativeElement.querySelector('.leg-total-business.left').textContent;
    const right = fixture.nativeElement.querySelector('.leg-total-business.right').textContent;
    expect(left).toContain('300,000');
    expect(right).toContain('200,000');
  });

  it('renders new booked area', () => {
    const area = fixture.nativeElement.querySelector('.new-booked-area').textContent;
    expect(area).toContain('450');
  });
});
