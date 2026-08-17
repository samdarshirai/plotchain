import { Component, inject, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { StepStatus } from './models/setup-state.model';
import { BrandingBootstrapService } from '../core/theme/branding-bootstrap.service';

@Component({
  selector: 'app-setup-header',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <header class="setup-header">
      <div class="setup-header__left">
        <img *ngIf="showSquareLogo" class="setup-header__logo" src="/api/company/branding/logo/square" alt="" />
        <div class="setup-header__brand">
          <span class="setup-header__wordmark">
            <span class="setup-header__wordmark-rule"></span>
            VIRAJ ACRES
            <span class="setup-header__wordmark-rule"></span>
          </span>
          <span class="setup-header__title">{{ 'setup.header.title' | translate }}</span>
        </div>
      </div>
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
  private brandingBootstrap = inject(BrandingBootstrapService);

  @Input() steps: StepStatus[] = [];

  get percentComplete(): number {
    if (this.steps.length === 0) {
      return 0;
    }
    const completeCount = this.steps.filter(s => s.complete).length;
    return Math.round((completeCount / this.steps.length) * 100);
  }

  get showSquareLogo(): boolean {
    return !!this.brandingBootstrap.getLast()?.hasSquareLogo;
  }
}
