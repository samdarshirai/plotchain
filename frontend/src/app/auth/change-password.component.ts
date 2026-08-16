import { Component, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { take } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from './auth.service';
import { ADMIN_FAMILY_ROLES } from '../admin/admin.guard';
import { SetupService } from '../setup/setup.service';
import { postAuthLandingPath } from './post-auth-redirect';
import { BrandButtonComponent } from '../shared/components/brand-button/brand-button.component';
import { InlineBannerComponent } from '../shared/components/inline-banner/inline-banner.component';

interface PasswordChecks {
  length: boolean;
  upper: boolean;
  number: boolean;
  symbol: boolean;
}

// The server only enforces an 8-character minimum; this validator is a strict superset so a
// weak-but-8-char password never reaches the API, keeping the 400/field-error path unreachable.
function passwordStrengthValidator(control: AbstractControl): ValidationErrors | null {
  const value: string = control.value ?? '';
  const checks = passwordChecks(value);
  return Object.values(checks).every(Boolean) ? null : { weak: true };
}

function passwordsMatchValidator(group: AbstractControl): ValidationErrors | null {
  const next = group.get('newPassword')?.value;
  const confirm = group.get('confirmPassword')?.value;
  return next === confirm ? null : { mismatch: true };
}

function passwordChecks(value: string): PasswordChecks {
  return {
    length: value.length >= 8,
    upper: /[A-Z]/.test(value),
    number: /[0-9]/.test(value),
    symbol: /[^A-Za-z0-9]/.test(value)
  };
}

const STRENGTH_COLORS = ['var(--border-subtle)', 'var(--status-danger)', 'var(--status-warning)', 'var(--status-warning)', 'var(--status-success)'];
const STRENGTH_LABEL_KEYS = ['', 'auth.strengthWeak', 'auth.strengthFair', 'auth.strengthGood', 'auth.strengthStrong'];

@Component({
  selector: 'app-change-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, BrandButtonComponent, InlineBannerComponent],
  template: `
    <main class="change-password-page">
      <p class="change-password-eyebrow">{{ 'auth.changePasswordEyebrow' | translate }}</p>
      <h1 class="change-password-heading">{{ 'auth.changePasswordTitle' | translate }}</h1>
      <p class="change-password-subheading">{{ 'auth.changePasswordSubtitle' | translate }}</p>

      <form class="card change-password-form" [formGroup]="form" (ngSubmit)="onSubmit()">
        <div class="change-password-field">
          <label>{{ 'auth.currentPasswordLabel' | translate }}</label>
          <div class="change-password-input">
            <span class="material-symbols-outlined change-password-input-icon">lock</span>
            <input
              [type]="showCurrent ? 'text' : 'password'"
              formControlName="currentPassword"
              autocomplete="current-password"
            />
            <button type="button" class="change-password-toggle" (click)="showCurrent = !showCurrent">
              <span class="material-symbols-outlined">{{ showCurrent ? 'visibility_off' : 'visibility' }}</span>
            </button>
          </div>
        </div>

        <div class="change-password-field">
          <label>{{ 'auth.newPasswordLabel' | translate }}</label>
          <div class="change-password-input">
            <span class="material-symbols-outlined change-password-input-icon">key</span>
            <input
              [type]="showNext ? 'text' : 'password'"
              formControlName="newPassword"
              autocomplete="new-password"
            />
            <button type="button" class="change-password-toggle" (click)="showNext = !showNext">
              <span class="material-symbols-outlined">{{ showNext ? 'visibility_off' : 'visibility' }}</span>
            </button>
          </div>
        </div>

        <div class="change-password-strength">
          <div class="change-password-strength-bars">
            <div
              class="change-password-strength-bar"
              *ngFor="let bar of strengthBars"
              [style.background]="bar.color"
            ></div>
          </div>
          <span class="change-password-strength-label" [style.color]="strengthLabelColor">
            {{ strengthLabelKey ? (strengthLabelKey | translate) : '' }}
          </span>
        </div>

        <div class="change-password-requirements">
          <div
            class="change-password-requirement"
            [class.change-password-requirement--met]="req.met"
            *ngFor="let req of requirements"
          >
            <span class="material-symbols-outlined">{{ req.met ? 'check_circle' : 'radio_button_unchecked' }}</span>
            <span>{{ req.labelKey | translate }}</span>
          </div>
        </div>

        <div class="change-password-field">
          <label>{{ 'auth.confirmPasswordLabel' | translate }}</label>
          <div class="change-password-input" [class.change-password-input--error]="showMismatch">
            <span class="material-symbols-outlined change-password-input-icon">key</span>
            <input
              [type]="showConfirm ? 'text' : 'password'"
              formControlName="confirmPassword"
              autocomplete="new-password"
            />
            <button type="button" class="change-password-toggle" (click)="showConfirm = !showConfirm">
              <span class="material-symbols-outlined">{{ showConfirm ? 'visibility_off' : 'visibility' }}</span>
            </button>
          </div>
          <p class="change-password-mismatch" *ngIf="showMismatch">
            <span class="material-symbols-outlined">error</span>
            {{ 'auth.confirmPasswordMismatch' | translate }}
          </p>
        </div>

        <div class="change-password-divider"></div>

        <div class="change-password-actions">
          <app-brand-button type="submit" variant="primary" [disabled]="form.invalid">
            {{ 'auth.changePasswordButton' | translate }}
          </app-brand-button>
          <a class="change-password-cancel" (click)="onCancel()">{{ 'auth.cancelLabel' | translate }}</a>
        </div>

        <app-inline-banner tone="danger" *ngIf="error">{{ 'auth.changePasswordError' | translate }}</app-inline-banner>
      </form>
    </main>
  `
})
export class ChangePasswordComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private setupService = inject(SetupService);
  private location = inject(Location);

  form = this.fb.group(
    {
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, passwordStrengthValidator]],
      confirmPassword: ['', Validators.required]
    },
    { validators: passwordsMatchValidator }
  );
  error = false;
  showCurrent = false;
  showNext = false;
  showConfirm = false;

  get passwordChecks(): PasswordChecks {
    return passwordChecks(this.form.get('newPassword')!.value ?? '');
  }

  get strengthScore(): number {
    return Object.values(this.passwordChecks).filter(Boolean).length;
  }

  get strengthBars(): { color: string }[] {
    const score = this.strengthScore;
    const filledColor = STRENGTH_COLORS[score] ?? STRENGTH_COLORS[0];
    return [0, 1, 2, 3].map(i => ({ color: i < score ? filledColor : STRENGTH_COLORS[0] }));
  }

  get strengthLabelKey(): string {
    const value: string = this.form.get('newPassword')!.value ?? '';
    return value.length === 0 ? '' : STRENGTH_LABEL_KEYS[this.strengthScore];
  }

  get strengthLabelColor(): string {
    return STRENGTH_COLORS[this.strengthScore] ?? 'var(--text-muted)';
  }

  get requirements(): { labelKey: string; met: boolean }[] {
    const checks = this.passwordChecks;
    return [
      { labelKey: 'auth.reqLength', met: checks.length },
      { labelKey: 'auth.reqUpper', met: checks.upper },
      { labelKey: 'auth.reqNumber', met: checks.number },
      { labelKey: 'auth.reqSymbol', met: checks.symbol }
    ];
  }

  get showMismatch(): boolean {
    const confirm: string = this.form.get('confirmPassword')!.value ?? '';
    const next: string = this.form.get('newPassword')!.value ?? '';
    return confirm.length > 0 && confirm !== next;
  }

  onCancel(): void {
    this.location.back();
  }

  onSubmit(): void {
    if (this.form.invalid) {
      return;
    }
    const { currentPassword, newPassword } = this.form.getRawValue();
    this.authService.changePassword(currentPassword!, newPassword!).subscribe({
      next: () => {
        const role = this.authService.getRole();
        if (role && ADMIN_FAMILY_ROLES.has(role)) {
          this.setupService.getState().pipe(take(1)).subscribe(state => {
            this.router.navigate([postAuthLandingPath(role, state, () => this.setupService.firstIncompleteStepPath(state))]);
          });
          return;
        }
        this.router.navigate(['/dashboard']);
      },
      error: () => this.error = true
    });
  }
}
