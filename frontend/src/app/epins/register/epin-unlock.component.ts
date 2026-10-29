import { PasswordToggleDirective } from '../../shared/directives/password-toggle.directive';
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { EPinRegisterService } from './epin-register.service';
import { FieldErrorComponent } from '../../shared/components/field-error/field-error.component';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';

@Component({
  selector: 'app-epin-unlock',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, InlineBannerComponent, FieldErrorComponent, PasswordToggleDirective],
  template: `
    <form class="epin-reg epin-reg--unlock" (ngSubmit)="submit()" novalidate>
      <h1 class="epin-reg__title">{{ 'epinRegister.unlockTitle' | translate }}</h1>
      <p class="epin-reg__hint">{{ 'epinRegister.unlockHint' | translate }}</p>
      <label class="epin-reg__label">{{ 'epins.passwordLabel' | translate }}
        <input class="epin-reg__input" type="password" appPasswordToggle autocomplete="off" name="pw" [(ngModel)]="password" [class.is-invalid]="pwMissing" [attr.aria-invalid]="pwMissing" />
        <app-field-error [message]="pwMissing ? ('epins.errorPasswordRequired' | translate) : ''"></app-field-error>
      </label>
      <app-inline-banner *ngIf="error" tone="danger">{{ error | translate }}</app-inline-banner>
      <button type="submit" class="brand-button" [disabled]="busy">{{ 'epinRegister.unlock' | translate }}</button>
    </form>
  `,
  styleUrl: './epin-register.component.scss'
})
export class EPinUnlockComponent {
  private service = inject(EPinRegisterService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  password = '';
  error = '';
  busy = false;
  pwMissing = false;

  submit(): void {
    this.pwMissing = !this.password.trim();
    if (this.pwMissing) { return; }
    this.busy = true;
    this.error = '';
    this.service.unlock(this.password).subscribe({
      next: () => {
        const back = this.route.snapshot.queryParamMap.get('returnUrl');
        // Only follow same-app e-pin paths, never an arbitrary returnUrl.
        this.router.navigateByUrl(back && back.startsWith('/e-pins/') ? back : '/e-pins/view-new');
      },
      error: (e: HttpErrorResponse) => {
        this.busy = false;
        this.password = '';
        this.error = e.status === 401 ? 'epins.errorPasswordInvalid'
          : e.status === 423 ? 'epins.errorPasswordLocked'
          : e.status === 409 && e.error?.code === 'TRANSACTION_PASSWORD_NOT_SET' ? 'epins.errorPasswordNotSet'
          : 'epins.errorGeneric';
      }
    });
  }
}
