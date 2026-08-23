import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SealCardComponent } from './seal-card.component';

@Component({
  standalone: true,
  imports: [SealCardComponent],
  template: `<app-seal-card [label]="label" [value]="value" [caption]="caption" [deltaCaption]="deltaCaption" [deltaDown]="deltaDown" [trendPoints]="trendPoints"></app-seal-card>`
})
class HostComponent {
  label = 'CURRENT CYCLE';
  value = '₹4,82,600';
  caption?: string = 'Across 6 associates this cycle.';
  deltaCaption?: string;
  deltaDown = false;
  trendPoints?: string;
}

describe('SealCardComponent', () => {
  let hostFixture: ComponentFixture<HostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SealCardComponent, HostComponent]
    }).compileComponents();
    hostFixture = TestBed.createComponent(HostComponent);
  });

  it('renders the label flanked by literal box-drawing rules', () => {
    hostFixture.detectChanges();
    const label: HTMLElement = hostFixture.nativeElement.querySelector('.seal-card-panel__label');
    expect(label.textContent?.trim()).toBe('── CURRENT CYCLE ──');
  });

  it('renders the figure value', () => {
    hostFixture.detectChanges();
    const figure: HTMLElement = hostFixture.nativeElement.querySelector('.seal-card-panel__figure');
    expect(figure.textContent?.trim()).toBe('₹4,82,600');
  });

  it('renders the caption when provided', () => {
    hostFixture.detectChanges();
    const caption: HTMLElement = hostFixture.nativeElement.querySelector('.seal-card-panel__caption');
    expect(caption.textContent?.trim()).toBe('Across 6 associates this cycle.');
  });

  it('omits the caption element when not provided', () => {
    hostFixture.componentInstance.caption = undefined;
    hostFixture.detectChanges();
    expect(hostFixture.nativeElement.querySelector('.seal-card-panel__caption')).toBeFalsy();
  });

  it('renders top and bottom hairlines', () => {
    hostFixture.detectChanges();
    expect(hostFixture.nativeElement.querySelector('.seal-card-panel__hairline--top')).toBeTruthy();
    expect(hostFixture.nativeElement.querySelector('.seal-card-panel__hairline--bottom')).toBeTruthy();
  });

  it('renders the delta caption when provided', () => {
    hostFixture.componentInstance.deltaCaption = '+₹1,20,000 vs last cycle';
    hostFixture.detectChanges();
    const delta: HTMLElement = hostFixture.nativeElement.querySelector('.seal-card-panel__delta');
    expect(delta.textContent?.trim()).toBe('+₹1,20,000 vs last cycle');
    expect(delta.classList).not.toContain('seal-card-panel__delta--down');
  });

  it('marks the delta caption as a decrease when deltaDown is true', () => {
    hostFixture.componentInstance.deltaCaption = '-₹40,000 vs last cycle';
    hostFixture.componentInstance.deltaDown = true;
    hostFixture.detectChanges();
    const delta: HTMLElement = hostFixture.nativeElement.querySelector('.seal-card-panel__delta');
    expect(delta.classList).toContain('seal-card-panel__delta--down');
  });

  it('omits the delta caption element when not provided', () => {
    hostFixture.detectChanges();
    expect(hostFixture.nativeElement.querySelector('.seal-card-panel__delta')).toBeFalsy();
  });

  it('renders the trend sparkline polyline when trendPoints is provided', () => {
    hostFixture.componentInstance.trendPoints = '0,20 50,10 100,0';
    hostFixture.detectChanges();
    const polyline = hostFixture.nativeElement.querySelector('.seal-card-panel__trend polyline');
    expect(polyline.getAttribute('points')).toBe('0,20 50,10 100,0');
  });

  it('omits the trend sparkline when trendPoints is not provided', () => {
    hostFixture.detectChanges();
    expect(hostFixture.nativeElement.querySelector('.seal-card-panel__trend')).toBeFalsy();
  });
});
