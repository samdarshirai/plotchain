import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { StepStatus } from './models/setup-state.model';

@Component({
  selector: 'app-setup-header',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <header class="setup-header">
      <span class="setup-header__title">{{ 'setup.header.title' | translate }}</span>
      <div class="setup-header__progress">
        <span class="setup-header__progress-label">
          {{ percentComplete }}% <span>{{ 'setup.percentCompleteSuffix' | translate }}</span>
        </span>
        <div class="setup-header__progress-bar">
          <div class="setup-header__progress-bar-fill" [style.width.%]="percentComplete"></div>
        </div>
      </div>
    </header>
  `
})
export class SetupHeaderComponent {
  @Input() steps: StepStatus[] = [];

  get percentComplete(): number {
    if (this.steps.length === 0) {
      return 0;
    }
    const completeCount = this.steps.filter(s => s.complete).length;
    return Math.round((completeCount / this.steps.length) * 100);
  }
}
