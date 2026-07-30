import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from './auth.service';

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
    </form>
  `
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);

  form = this.fb.group({
    userId: ['', Validators.required],
    password: ['', Validators.required]
  });
  error = false;

  onSubmit(): void {
    if (this.form.invalid) {
      return;
    }
    const { userId, password } = this.form.getRawValue();
    this.authService.login(userId!, password!).subscribe({
      next: response => {
        if (response.mustChangePassword) {
          this.router.navigate(['/change-password']);
          return;
        }
        this.router.navigate([response.role === 'ADMIN' ? '/admin/associates/new' : '/dashboard']);
      },
      error: () => this.error = true
    });
  }
}
