import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { SetupProgressRailComponent } from './setup-progress-rail.component';
import { StepStatus } from './models/setup-state.model';

describe('SetupProgressRailComponent', () => {
  let fixture: ComponentFixture<SetupProgressRailComponent>;

  const steps: StepStatus[] = [
    { number: 1, key: 'companyProfile', complete: true, required: true, percentComplete: 100 },
    { number: 2, key: 'branding', complete: false, required: false, percentComplete: 0 },
    { number: 3, key: 'compensation', complete: false, required: true, percentComplete: 0 },
    { number: 4, key: 'projects', complete: false, required: false, percentComplete: 0 }
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SetupProgressRailComponent, RouterTestingModule, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(SetupProgressRailComponent);
  });

  it('renders one row per step', () => {
    fixture.componentInstance.steps = steps;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.setup-progress-rail__step').length).toBe(4);
  });

  it('computes percent complete from the ratio of complete steps', () => {
    fixture.componentInstance.steps = steps;
    expect(fixture.componentInstance.percentComplete).toBe(25);
  });

  it('reports 0 percent when there are no steps', () => {
    fixture.componentInstance.steps = [];
    expect(fixture.componentInstance.percentComplete).toBe(0);
  });

  it('marks the active step', () => {
    fixture.componentInstance.steps = steps;
    fixture.componentInstance.activeStepKey = 'branding';
    fixture.detectChanges();
    const activeRow = fixture.nativeElement.querySelectorAll('.setup-progress-rail__step')[1];
    expect(activeRow.classList).toContain('setup-progress-rail__step--active');
  });

  it('shows a check mark only for complete steps', () => {
    fixture.componentInstance.steps = steps;
    fixture.detectChanges();
    const rows = fixture.nativeElement.querySelectorAll('.setup-progress-rail__step');
    expect(rows[0].querySelector('.setup-progress-rail__step-check')).toBeTruthy();
    expect(rows[1].querySelector('.setup-progress-rail__step-check')).toBeFalsy();
  });

  it('shows an optional marker only for non-required steps', () => {
    fixture.componentInstance.steps = steps;
    fixture.detectChanges();
    const rows = fixture.nativeElement.querySelectorAll('.setup-progress-rail__step');
    expect(rows[0].querySelector('.setup-progress-rail__step-optional')).toBeFalsy();
    expect(rows[1].querySelector('.setup-progress-rail__step-optional')).toBeTruthy();
  });

  it('links each row to its step route so the wizard can be navigated by clicking the rail', () => {
    fixture.componentInstance.steps = steps;
    fixture.detectChanges();
    const rows = fixture.nativeElement.querySelectorAll('.setup-progress-rail__step-link');
    expect(rows[0].getAttribute('href')).toBe('/setup/company-profile');
    expect(rows[1].getAttribute('href')).toBe('/setup/branding');
    expect(rows[3].getAttribute('href')).toBe('/setup/projects');
  });
});
