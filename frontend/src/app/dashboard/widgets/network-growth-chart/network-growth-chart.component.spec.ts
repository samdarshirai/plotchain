import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { NetworkGrowthChartComponent } from './network-growth-chart.component';

describe('NetworkGrowthChartComponent', () => {
  let fixture: ComponentFixture<NetworkGrowthChartComponent>;

  async function render(data: { cycleLabel: string; downlineCount: number }[]): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [NetworkGrowthChartComponent, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(NetworkGrowthChartComponent);
    fixture.componentInstance.data = data;
    fixture.detectChanges();
  }

  it('renders one bar per data point and the cycle labels beneath them', async () => {
    await render([
      { cycleLabel: '01', downlineCount: 4 },
      { cycleLabel: '02', downlineCount: 9 },
      { cycleLabel: '03', downlineCount: 6 }
    ]);
    expect(fixture.nativeElement.querySelectorAll('rect').length).toBe(3);
    const axisText = fixture.nativeElement.querySelector('.network-growth-chart__axis').textContent;
    expect(axisText).toContain('01');
    expect(axisText).toContain('03');
  });

  it('gives the tallest bar the full chart height', async () => {
    await render([
      { cycleLabel: '01', downlineCount: 4 },
      { cycleLabel: '02', downlineCount: 8 }
    ]);
    const bars: NodeListOf<SVGRectElement> = fixture.nativeElement.querySelectorAll('rect');
    expect(bars[1].getAttribute('height')).toBe('40');
    expect(bars[0].getAttribute('height')).toBe('20');
  });

  it('renders nothing when there is no data', async () => {
    await render([]);
    expect(fixture.nativeElement.querySelector('svg')).toBeFalsy();
  });
});
