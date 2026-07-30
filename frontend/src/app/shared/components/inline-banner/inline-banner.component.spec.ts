import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { InlineBannerComponent } from './inline-banner.component';

@Component({
  standalone: true,
  imports: [InlineBannerComponent],
  template: `<app-inline-banner [tone]="tone" [dismissible]="dismissible">Heads up</app-inline-banner>`
})
class HostComponent {
  tone: 'info' | 'warning' | 'success' | 'danger' = 'info';
  dismissible = false;
}

describe('InlineBannerComponent', () => {
  let fixture: ComponentFixture<InlineBannerComponent>;
  let hostFixture: ComponentFixture<HostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InlineBannerComponent, HostComponent]
    }).compileComponents();
    fixture = TestBed.createComponent(InlineBannerComponent);
    hostFixture = TestBed.createComponent(HostComponent);
  });

  it('renders projected content', () => {
    hostFixture.detectChanges();
    expect(hostFixture.nativeElement.querySelector('.inline-banner').textContent).toContain('Heads up');
  });

  it('applies the tone class', () => {
    fixture.componentInstance.tone = 'warning';
    fixture.detectChanges();
    const banner = fixture.nativeElement.querySelector('.inline-banner');
    expect(banner.classList.contains('inline-banner--warning')).toBeTrue();
  });

  it('renders the close button only when dismissible', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.inline-banner__dismiss')).toBeFalsy();

    fixture.componentInstance.dismissible = true;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.inline-banner__dismiss')).toBeTruthy();
  });

  it('clicking dismiss hides the banner and emits dismissed exactly once', () => {
    fixture.componentInstance.dismissible = true;
    fixture.detectChanges();
    const spy = jasmine.createSpy('dismissed');
    fixture.componentInstance.dismissed.subscribe(spy);

    fixture.nativeElement.querySelector('.inline-banner__dismiss').click();
    fixture.detectChanges();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('.inline-banner')).toBeFalsy();
  });
});
