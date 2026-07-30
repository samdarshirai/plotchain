import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from './auth.service';
import { SetupService } from '../setup/setup.service';
import { ADMIN_FAMILY_ROLES } from '../admin/admin.guard';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule],
  template: `
    <form class="login-form" [formGroup]="form" (ngSubmit)="onSubmit()">
      <label>
        {{ 'auth.userIdLabel' | translate }}
        <input type="text" autocomplete="username" formControlName="userId" />
      </label>
      <label>
        {{ 'auth.passwordLabel' | translate }}
        <input type="password" formControlName="password" />
      </label>
      <button type="submit" [disabled]="form.invalid">{{ 'auth.loginButton' | translate }}</button>
      <div class="login-error" *ngIf="error">{{ 'auth.loginError' | translate }}</div>
      <div class="login-error" *ngIf="platformNotLive">{{ 'auth.platformNotLiveError' | translate }}</div>
    </form>
  `
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private setupService = inject(SetupService);
  private router = inject(Router);

  form = this.fb.group({
    userId: ['', Validators.required],
    password: ['', Validators.required]
  });
  error = false;
  platformNotLive = false;

  onSubmit(): void {
    if (this.form.invalid) {
      return;
    }
    this.error = false;
    this.platformNotLive = false;
    const { userId, password } = this.form.getRawValue();
    this.authService.login(userId!, password!).subscribe({
      next: response => {
        if (response.mustChangePassword) {
          this.router.navigate(['/change-password']);
          return;
        }
        if (ADMIN_FAMILY_ROLES.has(response.role)) {
          this.setupService.getState().subscribe(state => {
            if (!state.launchedAt) {
              this.router.navigate(['/setup', this.setupService.firstIncompleteStepPath(state)]);
            } else {
              this.router.navigate([response.role === 'ADMIN' ? '/admin/associates/new' : '/dashboard']);
            }
          });
          return;
        }
        this.router.navigate(['/dashboard']);
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 403) {
          this.platformNotLive = true;
        } else {
          this.error = true;
        }
      }
    });
  }
}
