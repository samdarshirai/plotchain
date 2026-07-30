import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BrandButtonComponent } from '../brand-button/brand-button.component';

@Component({
  selector: 'app-setup-step-nav',
  standalone: true,
  imports: [CommonModule, TranslateModule, BrandButtonComponent],
  template: `
    <div class="setup-step-nav">
      <span class="setup-step-nav__saved" *ngIf="savedJustNow">{{ 'setup.savedIndicator' | translate }}</span>
      <span class="setup-step-nav__spacer"></span>
      <app-brand-button
        *ngIf="previousPath"
        class="setup-step-nav__previous"
        variant="ghost"
        type="button"
        (clicked)="goPrevious()"
      >
        {{ 'setup.actions.previous' | translate }}
      </app-brand-button>
      <app-brand-button
        *ngIf="nextPath"
        class="setup-step-nav__next"
        variant="primary"
        type="button"
        (clicked)="goNext()"
      >
        {{ 'setup.actions.next' | translate }}
      </app-brand-button>
    </div>
  `
})
export class SetupStepNavComponent {
  private router = inject(Router);

  @Input() previousPath: string | null = null;
  @Input() nextPath: string | null = null;
  @Input() savedJustNow = false;

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
