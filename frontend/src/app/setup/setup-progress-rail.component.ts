import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { StepStatus } from './models/setup-state.model';

@Component({
  selector: 'app-setup-progress-rail',
  standalone: true,
  imports: [CommonModule, TranslateModule],
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
          <span class="setup-progress-rail__step-number">{{ step.number }}</span>
          <span class="setup-progress-rail__step-label">{{ 'setup.steps.' + step.key | translate }}</span>
          <span class="setup-progress-rail__step-optional" *ngIf="!step.required">
            ({{ 'setup.optionalLabel' | translate }})
          </span>
          <span class="setup-progress-rail__step-check" *ngIf="step.complete">&#10003;</span>
        </li>
      </ol>
      <p class="setup-progress-rail__autosave">{{ 'setup.autosaveNote' | translate }}</p>
    </nav>
  `
})
export class SetupProgressRailComponent {
  @Input() steps: StepStatus[] = [];
  @Input() activeStepKey?: string;

  get percentComplete(): number {
    if (this.steps.length === 0) {
      return 0;
    }
    const completeCount = this.steps.filter(s => s.complete).length;
    return Math.round((completeCount / this.steps.length) * 100);
  }
}
