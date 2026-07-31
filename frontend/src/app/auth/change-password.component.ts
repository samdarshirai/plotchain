import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from './auth.service';
import { ADMIN_FAMILY_ROLES } from '../admin/admin.guard';
import { SetupService } from '../setup/setup.service';

@Component({
  selector: 'app-change-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule],
  template: `
    <form class="change-password-form" [formGroup]="form" (ngSubmit)="onSubmit()">
      <h1>{{ 'auth.changePasswordTitle' | translate }}</h1>
      <label>
        {{ 'auth.currentPasswordLabel' | translate }}
        <input type="password" formControlName="currentPassword" />
      </label>
      <label>
        {{ 'auth.newPasswordLabel' | translate }}
        <input type="password" formControlName="newPassword" />
      </label>
      <button type="submit" [disabled]="form.invalid">{{ 'auth.changePasswordButton' | translate }}</button>
      <div class="change-password-error" *ngIf="error">{{ 'auth.changePasswordError' | translate }}</div>
    </form>
  `
})
export class ChangePasswordComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private setupService = inject(SetupService);

  form = this.fb.group({
    currentPassword: ['', Validators.required],
    newPassword: ['', [Validators.required, Validators.minLength(8)]]
  });
  error = false;

  onSubmit(): void {
    if (this.form.invalid) {
      return;
    }
    const { currentPassword, newPassword } = this.form.getRawValue();
    this.authService.changePassword(currentPassword!, newPassword!).subscribe({
      next: () => {
        const role = this.authService.getRole();
        if (role && ADMIN_FAMILY_ROLES.has(role)) {
          this.setupService.getState().subscribe(state => {
            if (!state.launchedAt) {
              this.router.navigate(['/setup', this.setupService.firstIncompleteStepPath(state)]);
            } else {
              this.router.navigate([role === 'ADMIN' ? '/admin/associates/new' : '/dashboard']);
            }
          });
          return;
        }
        this.router.navigate(['/dashboard']);
      },
      error: () => this.error = true
    });
  }
}
