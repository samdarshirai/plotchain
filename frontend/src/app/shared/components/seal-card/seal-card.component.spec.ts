import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SealCardComponent } from './seal-card.component';

@Component({
  standalone: true,
  imports: [SealCardComponent],
  template: `<app-seal-card [label]="label" [value]="value" [caption]="caption"></app-seal-card>`
})
class HostComponent {
  label = 'CURRENT CYCLE';
  value = '₹4,82,600';
  caption?: string = 'Across 6 associates this cycle.';
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
});
