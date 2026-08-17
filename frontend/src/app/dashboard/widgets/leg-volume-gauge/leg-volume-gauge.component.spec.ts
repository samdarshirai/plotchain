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
      projectedMatchAmount: 140
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
});
