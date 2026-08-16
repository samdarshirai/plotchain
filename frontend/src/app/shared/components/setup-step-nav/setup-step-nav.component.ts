import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BrandButtonComponent } from '../brand-button/brand-button.component';
import { SetupInspectorService } from '../../../setup/setup-inspector.service';

@Component({
  selector: 'app-setup-step-nav',
  standalone: true,
  imports: [CommonModule, TranslateModule, BrandButtonComponent],
  template: `
    <div class="setup-step-nav" [class.setup-step-nav--stacked]="layout === 'stacked'">
      <span class="setup-step-nav__saved" *ngIf="savedJustNow">{{ 'setup.savedIndicator' | translate }}</span>
      <span class="setup-step-nav__spacer" *ngIf="layout === 'inline'"></span>
      <ng-container *ngIf="mode === 'setup'">
        <app-brand-button
          *ngIf="previousPath"
          class="setup-step-nav__previous"
          variant="ghost"
          type="button"
          [fullWidth]="layout === 'stacked'"
          (clicked)="goPrevious()"
        >
          {{ 'setup.actions.previous' | translate }}
        </app-brand-button>
        <app-brand-button
          *ngIf="nextPath"
          class="setup-step-nav__next"
          variant="primary"
          type="button"
          [fullWidth]="layout === 'stacked'"
          (clicked)="goNext()"
        >
          {{ 'setup.actions.next' | translate }}
        </app-brand-button>
      </ng-container>
      <app-brand-button *ngIf="mode === 'settings'" class="setup-step-nav__save" variant="primary" type="button" (clicked)="goBackToSettings()">
        {{ 'settings.actions.save' | translate }}
      </app-brand-button>
    </div>
  `
})
export class SetupStepNavComponent {
  private router = inject(Router);
  private inspectorService = inject(SetupInspectorService);

  @Input() previousPath: string | null = null;
  @Input() nextPath: string | null = null;
  @Input() savedJustNow = false;
  @Input() mode: 'setup' | 'settings' = 'setup';
  @Input() layout: 'inline' | 'stacked' = 'inline';

  goPrevious(): void {
    if (this.previousPath) {
      this.router.navigate(['/setup', this.previousPath]);
    }
  }

  goNext(): void {
    if (!this.nextPath) {
      return;
    }
    const step = this.inspectorService.activeStep;
    if (step && !step.isStepValid()) {
      // Invalid required fields (e.g. a bad GSTIN/phone) block advancing instead of silently
      // discarding them.
      return;
    }
    step?.flushPendingSave();
    this.router.navigate(['/setup', this.nextPath]);
  }

  goBackToSettings(): void {
    this.inspectorService.activeStep?.flushPendingSave();
    this.router.navigate(['/settings']);
  }
}
