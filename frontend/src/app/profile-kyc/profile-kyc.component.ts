import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AssociateProfileService } from './associate-profile.service';
import { AssociateKycService } from './associate-kyc.service';
import { AssociateProfileResponse } from './models/associate-profile.model';
import { AssociateKycStatusResponse, KYC_DOCUMENT_TYPES } from './models/associate-kyc-status.model';
import { FieldErrorComponent } from '../shared/components/field-error/field-error.component';
import { InlineBannerComponent } from '../shared/components/inline-banner/inline-banner.component';
import { toFieldErrors } from '../core/api/field-errors.model';

// The one editable Associate screen (role-capability spec's "Own profile" row, screen unit 14).
// Composes two independently-owned backend resources -- profile (unit 11) and KYC (unit 8) --
// behind two separate services (see this plan's Design decision 4), not a combined backend call.
@Component({
  selector: 'app-profile-kyc',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, FieldErrorComponent, InlineBannerComponent],
  template: `
    <div class="profile-kyc card">
      <h1 class="card-title">{{ 'profileKyc.title' | translate }}</h1>

      <p *ngIf="profileLoadError" class="profile-kyc__load-error">{{ 'profileKyc.profileLoadError' | translate }}</p>

      <div class="profile-kyc__identity" *ngIf="profile as p">
        <span>{{ 'profileKyc.userIdLabel' | translate }}: {{ p.userId }}</span>
        <span>{{ 'profileKyc.joinedAtLabel' | translate }}: {{ p.joinedAt | date: 'mediumDate' }}</span>
      </div>

      <form class="profile-kyc__form" [formGroup]="form" (ngSubmit)="onSubmit()" *ngIf="profile">
        <label>
          {{ 'profileKyc.nameLabel' | translate }}
          <input type="text" formControlName="name" />
        </label>
        <app-field-error [message]="fieldError('name')"></app-field-error>

        <label>
          {{ 'profileKyc.phoneLabel' | translate }}
          <input type="text" formControlName="phone" />
        </label>
        <app-field-error [message]="fieldError('phone')"></app-field-error>

        <label>
          {{ 'profileKyc.emailLabel' | translate }}
          <input type="email" formControlName="email" />
        </label>
        <app-field-error [message]="fieldError('email') || emailConflictError"></app-field-error>

        <button type="submit" [disabled]="form.invalid">{{ 'profileKyc.saveAction' | translate }}</button>
        <app-inline-banner *ngIf="saveSuccess" tone="success">{{ 'profileKyc.saveSuccess' | translate }}</app-inline-banner>
      </form>

      <section class="profile-kyc__bank-section">
        <h2>{{ 'profileKyc.bankDetails.title' | translate }}</h2>
        <app-inline-banner tone="info">{{ 'profileKyc.bankDetails.comingSoon' | translate }}</app-inline-banner>
      </section>

      <section class="profile-kyc__kyc-section">
        <h2>{{ 'profileKyc.kyc.title' | translate }}</h2>
        <p *ngIf="kycLoadError" class="profile-kyc__load-error">{{ 'profileKyc.kyc.loadError' | translate }}</p>

        <app-inline-banner *ngIf="kycStatus" [tone]="kycStatusTone(kycStatus.kycStatus)">
          {{ 'profileKyc.kyc.statusLabel' | translate: { status: kycStatusLabel(kycStatus.kycStatus) } }}
        </app-inline-banner>

        <p class="profile-kyc__kyc-preview-note">{{ 'profileKyc.kyc.noPreviewNote' | translate }}</p>

        <div class="profile-kyc__kyc-document-row" *ngFor="let docType of documentTypes">
          <span class="profile-kyc__kyc-document-label">{{ 'profileKyc.kyc.documentType.' + docType | translate }}</span>
          <span *ngIf="submittedDocument(docType) as doc" class="profile-kyc__kyc-document-meta">
            {{ 'profileKyc.kyc.submittedOn' | translate: { date: (doc.uploadedAt | date: 'mediumDate') } }}
          </span>
          <span *ngIf="!submittedDocument(docType)" class="profile-kyc__kyc-document-meta">
            {{ 'profileKyc.kyc.notSubmitted' | translate }}
          </span>
          <input type="file" [accept]="acceptTypes" (change)="onFileInputChange(docType, $event)" />
        </div>
        <app-field-error [message]="kycUploadError"></app-field-error>
      </section>
    </div>
  `
})
export class ProfileKycComponent implements OnInit {
  private fb = inject(FormBuilder);
  private associateProfileService = inject(AssociateProfileService);
  private associateKycService = inject(AssociateKycService);
  private translate = inject(TranslateService);

  readonly documentTypes = KYC_DOCUMENT_TYPES;
  readonly acceptTypes = 'image/png,image/jpeg,image/webp,application/pdf';

  form = this.fb.group({
    name: ['', Validators.required],
    phone: [''],
    email: ['', Validators.email]
  });

  profile: AssociateProfileResponse | null = null;
  kycStatus: AssociateKycStatusResponse | null = null;
  profileLoadError = false;
  kycLoadError = false;
  saveSuccess = false;
  saveError?: string;
  emailConflictError?: string;
  kycUploadError?: string;
  private serverFieldErrors: Record<string, string> = {};

  ngOnInit(): void {
    this.loadProfile();
    this.loadKycStatus();
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
      return this.translate.instant('profileKyc.validation.nameRequired');
    }
    if (control.errors['email']) {
      return this.translate.instant('profileKyc.validation.emailInvalid');
    }
    return undefined;
  }

  kycStatusTone(status: string): 'info' | 'warning' | 'success' | 'danger' {
    if (status === 'VERIFIED') return 'success';
    if (status === 'REJECTED') return 'danger';
    return 'info';
  }

  kycStatusLabel(status: string): string {
    return this.translate.instant('profileKyc.kyc.status.' + status);
  }

  submittedDocument(documentType: string) {
    return this.kycStatus?.documents.find(d => d.documentType === documentType);
  }

  onSubmit(): void {
    if (this.form.invalid) {
      return;
    }
    this.saveSuccess = false;
    this.saveError = undefined;
    this.emailConflictError = undefined;
    this.serverFieldErrors = {};

    const { name, phone, email } = this.form.getRawValue();
    this.associateProfileService.updateProfile({ name: name!, phone: phone || null, email: email || null }).subscribe({
      next: res => {
        this.profile = res;
        this.saveSuccess = true;
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 409) {
          // Flat {"error": "..."} body, not a `fields` map -- see this plan's Design decision 6.
          this.emailConflictError = err.error?.error ?? this.translate.instant('profileKyc.validation.emailTaken');
        } else {
          this.serverFieldErrors = toFieldErrors(err);
          this.saveError = this.translate.instant('profileKyc.saveError');
        }
      }
    });
  }

  onFileInputChange(documentType: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.onFileSelected(documentType, file);
    }
    input.value = '';
  }

  onFileSelected(documentType: string, file: File): void {
    this.kycUploadError = undefined;
    this.associateKycService.uploadDocument(documentType, file).subscribe({
      next: () => this.loadKycStatus(),
      error: (err: HttpErrorResponse) => {
        this.kycUploadError = err.error?.error ?? this.translate.instant('profileKyc.kyc.uploadError');
      }
    });
  }

  private loadProfile(): void {
    this.profileLoadError = false;
    this.associateProfileService.getProfile().subscribe({
      next: res => {
        this.profile = res;
        this.form.patchValue({ name: res.name, phone: res.phone, email: res.email });
      },
      error: () => (this.profileLoadError = true)
    });
  }

  private loadKycStatus(): void {
    this.kycLoadError = false;
    this.associateKycService.getStatus().subscribe({
      next: res => (this.kycStatus = res),
      error: () => (this.kycLoadError = true)
    });
  }
}
