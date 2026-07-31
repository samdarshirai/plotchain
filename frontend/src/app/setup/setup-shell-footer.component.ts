import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BrandButtonComponent } from '../shared/components/brand-button/brand-button.component';
import { SetupInspectorService } from './setup-inspector.service';

// The sticky Previous/Next/Saved bar shared by every /setup step. Replaces the old per-step
// <app-setup-step-nav>, which is still used inline (unmodified) by each step's own template
// when rendered in /settings mode -- a different shell with no footer of its own.
//
// Hidden entirely when a step has registered inspector-aside content: that step is opting into
// placing its own nav there instead (see company-profile-step.component.ts, which renders its
// own <app-setup-step-nav> below the Company Card preview) so the shell bar would just duplicate it.
@Component({
  selector: 'app-setup-shell-footer',
  standalone: true,
  imports: [CommonModule, TranslateModule, BrandButtonComponent],
  template: `
    <div class="setup-shell__footer" *ngIf="!(inspectorService.content$ | async)">
      <span class="setup-shell__footer-saved" *ngIf="inspectorService.saved$ | async">
        {{ 'setup.savedIndicator' | translate }}
      </span>
      <span class="setup-shell__footer-spacer"></span>
      <app-brand-button *ngIf="previousPath" variant="ghost" type="button" (clicked)="goPrevious()">
        {{ 'setup.actions.previous' | translate }}
      </app-brand-button>
      <app-brand-button *ngIf="nextPath" variant="primary" type="button" (clicked)="goNext()">
        {{ 'setup.actions.next' | translate }}
      </app-brand-button>
    </div>
  `
})
export class SetupShellFooterComponent {
  private router = inject(Router);
  protected inspectorService = inject(SetupInspectorService);

  @Input() previousPath: string | null = null;
  @Input() nextPath: string | null = null;

  goPrevious(): void {
    if (this.previousPath) {
      this.router.navigate(['/setup', this.previousPath]);
    }
  }

  goNext(): void {
    if (this.nextPath) {
      this.router.navigate(['/setup', this.nextPath]);
    }
  }
}
