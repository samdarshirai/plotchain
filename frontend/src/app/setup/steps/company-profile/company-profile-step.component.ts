import { Component, Input, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { SetupStepNavComponent } from '../../../shared/components/setup-step-nav/setup-step-nav.component';
import { toFieldErrors } from '../../../core/api/field-errors.model';
import { CompanyProfileService } from './company-profile.service';
import { SetupService } from '../../setup.service';
import { CompanyProfileRequest } from '../../models/company-profile.model';

const PHONE_PATTERN = /^[+]?[0-9]{10,15}$/;
const GSTIN_PATTERN = /^[0-9A-Z]{15}$/;

@Component({
  selector: 'app-company-profile-step',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, FieldErrorComponent, SetupStepNavComponent],
  template: `
    <div class="company-profile-step step-grid">
      <form class="card" [formGroup]="form">
        <h1 class="card-title">{{ 'setup.steps.companyProfile' | translate }}</h1>

        <label>
          {{ 'setup.companyProfile.displayNameLabel' | translate }}
          <input type="text" formControlName="displayName" (blur)="markTouched('displayName')" />
        </label>
        <app-field-error [message]="fieldError('displayName')"></app-field-error>

        <label>
          {{ 'setup.companyProfile.legalNameLabel' | translate }}
          <input type="text" formControlName="legalName" (blur)="markTouched('legalName')" />
        </label>
        <app-field-error [message]="fieldError('legalName')"></app-field-error>

        <label>
          {{ 'setup.companyProfile.registrationNumberLabel' | translate }}
          <input type="text" formControlName="registrationNumber" (blur)="markTouched('registrationNumber')" />
        </label>
        <app-field-error [message]="fieldError('registrationNumber')"></app-field-error>

        <label>
          {{ 'setup.companyProfile.contactNameLabel' | translate }}
          <input type="text" formControlName="contactName" (blur)="markTouched('contactName')" />
        </label>
        <app-field-error [message]="fieldError('contactName')"></app-field-error>

        <label>
          {{ 'setup.companyProfile.contactPhoneLabel' | translate }}
          <input type="tel" formControlName="contactPhone" (blur)="markTouched('contactPhone')" />
        </label>
        <app-field-error [message]="fieldError('contactPhone')"></app-field-error>

        <label>
          {{ 'setup.companyProfile.contactEmailLabel' | translate }}
          <input type="email" formControlName="contactEmail" (blur)="markTouched('contactEmail')" />
        </label>
        <app-field-error [message]="fieldError('contactEmail')"></app-field-error>

        <label>
          {{ 'setup.companyProfile.registeredAddressLabel' | translate }}
          <textarea formControlName="registeredAddress" (blur)="markTouched('registeredAddress')"></textarea>
        </label>
        <app-field-error [message]="fieldError('registeredAddress')"></app-field-error>

        <app-setup-step-nav [previousPath]="previousPath" [nextPath]="nextPath" [savedJustNow]="savedJustNow" [mode]="mode"></app-setup-step-nav>
      </form>

      <div class="card company-profile-step__preview">
        <p class="card-subtitle">{{ 'setup.companyProfile.previewTitle' | translate }}</p>
        <h2>{{ form.value.displayName || ('setup.companyProfile.previewPlaceholderName' | translate) }}</h2>
        <p>{{ form.value.contactPhone }}</p>
        <p>{{ form.value.contactEmail }}</p>
        <p>{{ form.value.registeredAddress }}</p>
      </div>
    </div>
  `
})
export class CompanyProfileStepComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private companyProfileService = inject(CompanyProfileService);
  private setupService = inject(SetupService);
  private translate = inject(TranslateService);
  private destroyed$ = new Subject<void>();
  private profileSubscription?: Subscription;

  form = this.fb.group({
    displayName: ['', Validators.required],
    legalName: ['', Validators.required],
    registrationNumber: ['', Validators.pattern(GSTIN_PATTERN)],
    contactName: ['', Validators.required],
    contactPhone: ['', [Validators.required, Validators.pattern(PHONE_PATTERN)]],
    contactEmail: ['', [Validators.required, Validators.email]],
    registeredAddress: ['', Validators.required]
  });

  @Input() mode: 'setup' | 'settings' = 'setup';

  savedJustNow = false;
  readonly previousPath = this.setupService.previousStepPath('companyProfile');
  readonly nextPath = this.setupService.nextStepPath('companyProfile');
  private serverFieldErrors: Record<string, string> = {};

  ngOnInit(): void {
    this.profileSubscription = this.companyProfileService.getProfile().subscribe(profile => {
      this.form.patchValue(profile, { emitEvent: false });
    });

    this.form.valueChanges.pipe(takeUntil(this.destroyed$), debounceTime(400)).subscribe(() => {
      this.savedJustNow = false;
      if (this.form.valid) {
        this.save();
      }
    });
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
    this.profileSubscription?.unsubscribe();
  }

  markTouched(name: string): void {
    this.form.get(name)?.markAsTouched();
  }

  fieldError(name: string): string | undefined {
    if (this.serverFieldErrors[name]) {
      return this.serverFieldErrors[name];
    }
    const control = this.form.get(name);
    if (!control || !control.touched || !control.errors) {
      return undefined;
    }
    if (control.errors['required']) {
      return this.translate.instant('setup.companyProfile.validation.required');
    }
    if (control.errors['email']) {
      return this.translate.instant('setup.companyProfile.validation.email');
    }
    if (control.errors['pattern']) {
      return this.translate.instant('setup.companyProfile.validation.pattern');
    }
    return undefined;
  }

  private save(): void {
    const request = this.form.getRawValue() as CompanyProfileRequest;
    this.companyProfileService.updateProfile(request).subscribe({
      next: () => {
        this.serverFieldErrors = {};
        this.savedJustNow = true;
        this.setupService.refresh();
      },
      error: err => {
        this.serverFieldErrors = toFieldErrors(err);
        this.savedJustNow = false;
      }
    });
  }
}
