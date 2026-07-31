import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { SetupStepNavComponent } from './setup-step-nav.component';

describe('SetupStepNavComponent', () => {
  let fixture: ComponentFixture<SetupStepNavComponent>;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SetupStepNavComponent, RouterTestingModule, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(SetupStepNavComponent);
    router = TestBed.inject(Router);
    spyOn(router, 'navigate');
  });

  it('does not render a Previous button when previousPath is null', () => {
    fixture.componentInstance.previousPath = null;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.setup-step-nav__previous')).toBeFalsy();
  });

  it('navigates to previousPath when Previous is clicked', () => {
    fixture.componentInstance.previousPath = 'branding';
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.setup-step-nav__previous button').click();
    expect(router.navigate).toHaveBeenCalledWith(['/setup', 'branding']);
  });

  it('does not render a Next button when nextPath is null', () => {
    fixture.componentInstance.nextPath = null;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.setup-step-nav__next')).toBeFalsy();
  });

  it('navigates to nextPath when Next is clicked', () => {
    fixture.componentInstance.nextPath = 'compensation';
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.setup-step-nav__next button').click();
    expect(router.navigate).toHaveBeenCalledWith(['/setup', 'compensation']);
  });

  it('shows the saved indicator only when savedJustNow is true', () => {
    fixture.componentInstance.savedJustNow = false;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.setup-step-nav__saved')).toBeFalsy();

    fixture.componentInstance.savedJustNow = true;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.setup-step-nav__saved')).toBeTruthy();
  });

  it('hidesPreviousAndNextWhenModeIsSettings', () => {
    fixture.componentInstance.previousPath = 'branding';
    fixture.componentInstance.nextPath = 'compensation';
    fixture.componentInstance.mode = 'settings';
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.setup-step-nav__previous')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('.setup-step-nav__next')).toBeFalsy();
  });

  it('showsASaveButtonThatNavigatesToSettingsWhenModeIsSettings', () => {
    fixture.componentInstance.mode = 'settings';
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.setup-step-nav__save')).toBeTruthy();
    fixture.nativeElement.querySelector('.setup-step-nav__save button').click();
    expect(router.navigate).toHaveBeenCalledWith(['/settings']);
  });

  it('defaultsToSetupModeAndShowsPreviousNextWhenInputOmitted', () => {
    fixture.componentInstance.previousPath = 'branding';
    fixture.componentInstance.nextPath = 'compensation';
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.setup-step-nav__previous')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.setup-step-nav__next')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.setup-step-nav__save')).toBeFalsy();
  });
});
