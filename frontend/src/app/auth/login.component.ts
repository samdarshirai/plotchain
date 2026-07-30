import { Component, Input, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from './auth.service';
import { SetupService } from '../setup/setup.service';
import { ADMIN_FAMILY_ROLES } from '../admin/admin.guard';
import { BrandingBootstrapService } from '../core/theme/branding-bootstrap.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule],
  template: `
    <form class="login-form" [formGroup]="form" (ngSubmit)="onSubmit()">
      <img *ngIf="showSquareLogo" class="login-logo" src="/api/company/branding/logo/square" alt="" />
      <p *ngIf="showTagline" class="login-tagline">{{ resolvedTagline }}</p>
      <label>
        {{ 'auth.userIdLabel' | translate }}
        <input type="text" autocomplete="username" formControlName="userId" />
      </label>
      <label>
        {{ 'auth.passwordLabel' | translate }}
        <input [type]="showPassword ? 'text' : 'password'" formControlName="password" />
        <button type="button" class="login-password-toggle" (click)="showPassword = !showPassword">
          {{ (showPassword ? 'auth.hidePassword' : 'auth.showPassword') | translate }}
        </button>
      </label>
      <button type="submit" [disabled]="form.invalid">{{ 'auth.loginButton' | translate }}</button>
      <div class="login-error" *ngIf="error">{{ 'auth.loginError' | translate }}</div>
      <div class="login-error" *ngIf="platformNotLive">{{ 'auth.platformNotLiveError' | translate }}</div>
    </form>
  `
})
export class LoginComponent implements OnInit {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private setupService = inject(SetupService);
  private router = inject(Router);
  private brandingBootstrap = inject(BrandingBootstrapService);

  // Non-functional render used by the Branding step's Live Login Preview, reusing this real
  // component instead of a hand-copied duplicate so preview and reality can never drift apart.
  @Input() previewMode = false;
  @Input() tagline: string | null = null;
  @Input() hasSquareLogo: boolean | null = null;

  form = this.fb.group({
    userId: ['', Validators.required],
    password: ['', Validators.required]
  });
  error = false;
  platformNotLive = false;
  showPassword = false;

  ngOnInit(): void {
    // In production (non-preview) use, fall back to the last-fetched public branding when the
    // inputs aren't explicitly bound -- previewMode always binds them itself.
    if (!this.previewMode && (this.tagline === null || this.hasSquareLogo === null)) {
      const last = this.brandingBootstrap.getLast();
      if (last) {
        this.tagline = this.tagline ?? last.tagline;
        this.hasSquareLogo = this.hasSquareLogo ?? last.hasSquareLogo;
      }
    }
  }

  get showSquareLogo(): boolean {
    return !!this.hasSquareLogo;
  }

  get showTagline(): boolean {
    return !!this.resolvedTagline;
  }

  get resolvedTagline(): string {
    return this.tagline ?? '';
  }

  onSubmit(): void {
    if (this.previewMode || this.form.invalid) {
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
