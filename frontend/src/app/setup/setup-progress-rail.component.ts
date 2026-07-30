import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { STEP_PATHS, StepStatus } from './models/setup-state.model';

@Component({
  selector: 'app-setup-progress-rail',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslateModule],
  template: `
    <nav class="setup-progress-rail">
      <div class="setup-progress-rail__percent">
        {{ percentComplete }}% <span>{{ 'setup.percentCompleteSuffix' | translate }}</span>
      </div>
      <div class="setup-progress-rail__bar">
        <div class="setup-progress-rail__bar-fill" [style.width.%]="percentComplete"></div>
      </div>
      <ol class="setup-progress-rail__steps">
        <li
          *ngFor="let step of steps"
          class="setup-progress-rail__step"
          [class.setup-progress-rail__step--active]="step.key === activeStepKey"
          [class.setup-progress-rail__step--complete]="step.complete"
        >
          <a class="setup-progress-rail__step-link" [routerLink]="['/setup', stepPaths[step.key]]">
            <span class="setup-progress-rail__step-number">{{ step.number }}</span>
            <span class="setup-progress-rail__step-label">{{ 'setup.steps.' + step.key | translate }}</span>
            <span class="setup-progress-rail__step-optional" *ngIf="!step.required">
              ({{ 'setup.optionalLabel' | translate }})
            </span>
            <span class="setup-progress-rail__step-check" *ngIf="step.complete">&#10003;</span>
          </a>
        </li>
      </ol>
      <p class="setup-progress-rail__autosave">{{ 'setup.autosaveNote' | translate }}</p>
    </nav>
  `
})
export class SetupProgressRailComponent {
  @Input() steps: StepStatus[] = [];
  @Input() activeStepKey?: string;

  readonly stepPaths = STEP_PATHS;

  get percentComplete(): number {
    if (this.steps.length === 0) {
      return 0;
    }
    const completeCount = this.steps.filter(s => s.complete).length;
    return Math.round((completeCount / this.steps.length) * 100);
  }
}
