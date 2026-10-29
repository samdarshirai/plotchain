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
import { FieldErrorComponent } from '../shared/components/field-error/field-error.component';
import { ErrorSummaryComponent } from '../shared/components/error-summary/error-summary.component';
import { FormIssue, collectIssues } from '../shared/validation/validation';
import { InlineBannerComponent } from '../shared/components/inline-banner/inline-banner.component';

// Length is the only password rule; mirrors the server's @Size(min = 6).
const MIN_PASSWORD_LENGTH = 6;

function passwordsMatchValidator(group: AbstractControl): ValidationErrors | null {
  const next = group.get('newPassword')?.value;
  const confirm = group.get('confirmPassword')?.value;
  return next === confirm ? null : { mismatch: true };
}

@Component({
  selector: 'app-change-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FieldErrorComponent, ErrorSummaryComponent, TranslateModule, BrandButtonComponent, InlineBannerComponent],
  template: `
    <main class="change-password-page">
      <p class="change-password-eyebrow">{{ 'auth.changePasswordEyebrow' | translate }}</p>
      <h1 class="change-password-heading">{{ 'auth.changePasswordTitle' | translate }}</h1>
      <p class="change-password-subheading">{{ 'auth.changePasswordSubtitle' | translate }}</p>

      <form class="card change-password-form" [formGroup]="form" [class.was-submitted]="submitted" (ngSubmit)="onSubmit()" novalidate>
        <app-error-summary [issues]="issues"></app-error-summary>
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
          <app-field-error [control]="form.get('currentPassword')" label="Current password" [submitted]="submitted"></app-field-error>
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
          <app-field-error [control]="form.get('newPassword')" label="New password" [submitted]="submitted"></app-field-error>
        </div>

        <div class="change-password-requirements">
          <div class="change-password-requirement" [class.change-password-requirement--met]="lengthMet">
            <span class="material-symbols-outlined">{{ lengthMet ? 'check_circle' : 'radio_button_unchecked' }}</span>
            <span>{{ 'auth.reqLength' | translate }}</span>
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
          <app-field-error [control]="form.get('confirmPassword')" label="Confirm password" [submitted]="submitted"></app-field-error>
          <p class="change-password-mismatch" *ngIf="showMismatch">
            <span class="material-symbols-outlined">error</span>
            {{ 'auth.confirmPasswordMismatch' | translate }}
          </p>
        </div>

        <div class="change-password-divider"></div>

        <div class="change-password-actions">
          <app-brand-button type="submit" variant="primary">
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
      newPassword: ['', [Validators.required, Validators.minLength(MIN_PASSWORD_LENGTH)]],
      confirmPassword: ['', Validators.required]
    },
    { validators: passwordsMatchValidator }
  );
  error = false;
  showCurrent = false;
  showNext = false;
  showConfirm = false;

  get lengthMet(): boolean {
    return (this.form.get('newPassword')!.value ?? '').length >= MIN_PASSWORD_LENGTH;
  }

  get showMismatch(): boolean {
    const confirm: string = this.form.get('confirmPassword')!.value ?? '';
    const next: string = this.form.get('newPassword')!.value ?? '';
    return confirm.length > 0 && confirm !== next;
  }

  onCancel(): void {
    this.location.back();
  }

  submitted = false;
  issues: FormIssue[] = [];

  onSubmit(): void {
    this.submitted = true;
    this.form.markAllAsTouched();
    this.issues = collectIssues(this.form, {
      currentPassword: 'Current password', newPassword: 'New password', confirmPassword: 'Confirm password'
    });
    if (this.form.errors?.['mismatch'] && !this.issues.some(i => i.id === 'confirmPassword')) {
      this.issues.push({ id: 'confirmPassword', label: 'Confirm password', message: 'Confirm password does not match the new password. Type the same value again.' });
    }
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
