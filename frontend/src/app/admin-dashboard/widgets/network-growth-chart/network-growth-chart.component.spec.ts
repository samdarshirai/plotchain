import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { AdminNetworkGrowthChartComponent } from './network-growth-chart.component';
import { NetworkGrowthPoint } from '../../admin-dashboard.model';

@Component({
  standalone: true,
  imports: [AdminNetworkGrowthChartComponent],
  template: `<app-admin-network-growth-chart [data]="data"></app-admin-network-growth-chart>`
})
class HostComponent {
  data: NetworkGrowthPoint[] = [];
}

describe('AdminNetworkGrowthChartComponent', () => {
  let hostFixture: ComponentFixture<HostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminNetworkGrowthChartComponent, HostComponent, TranslateModule.forRoot()]
    }).compileComponents();
    hostFixture = TestBed.createComponent(HostComponent);
  });

  it('renders one bar and one axis label per data point', () => {
    hostFixture.componentInstance.data = [
      { cycleLabel: 'Jun', associateCount: 10 },
      { cycleLabel: 'Jul', associateCount: 18 },
      { cycleLabel: 'Aug', associateCount: 25 }
    ];
    hostFixture.detectChanges();

    expect(hostFixture.nativeElement.querySelectorAll('rect').length).toBe(3);
    const axisLabels = hostFixture.nativeElement.querySelectorAll('.admin-network-growth-chart__axis span');
    expect(axisLabels.length).toBe(3);
    expect(axisLabels[2].textContent).toBe('Aug');
  });

  it('scales the tallest bar to the full chart height', () => {
    hostFixture.componentInstance.data = [
      { cycleLabel: 'Jul', associateCount: 10 },
      { cycleLabel: 'Aug', associateCount: 20 }
    ];
    hostFixture.detectChanges();

    const rects: NodeListOf<SVGRectElement> = hostFixture.nativeElement.querySelectorAll('rect');
    expect(rects[1].getAttribute('height')).toBe('40');
    expect(rects[0].getAttribute('height')).toBe('20');
  });

  it('renders nothing when there is no data', () => {
    hostFixture.detectChanges();

    expect(hostFixture.nativeElement.querySelector('svg')).toBeFalsy();
    expect(hostFixture.nativeElement.querySelector('.admin-network-growth-chart__axis')).toBeFalsy();
  });
});
