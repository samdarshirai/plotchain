import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AssociateProfileService } from '../profile-kyc/associate-profile.service';
import { AssociateKycService } from '../profile-kyc/associate-kyc.service';
import { AssociateProfileResponse } from '../profile-kyc/models/associate-profile.model';
import { AssociateKycStatusResponse, KYC_DOCUMENT_TYPES } from '../profile-kyc/models/associate-kyc-status.model';
import { RewardsService } from './rewards.service';
import { AssociateRankProgress } from './models/associate-rank-progress.model';
import { DigitalIdCardComponent } from './digital-id-card.component';
import { FieldErrorComponent } from '../shared/components/field-error/field-error.component';
import { InlineBannerComponent } from '../shared/components/inline-banner/inline-banner.component';
import { BrandButtonComponent } from '../shared/components/brand-button/brand-button.component';
import { EditableTableColumn, EditableTableComponent } from '../shared/components/editable-table/editable-table.component';
import { toFieldErrors } from '../core/api/field-errors.model';

// Consolidates /profile (ProfileKycComponent), /rewards (RewardsComponent), and /digital-id-card
// (DigitalIdCardComponent) into one "My Account" screen per Account Consolidation.dc.html
// (claude.ai design project cfbfc37d-4de7-4f26-8b81-923167ca3d33). Each of the three backend
// resources keeps its own service/error surface, matching the three source components'
// independent-failure behavior -- there's still no combined backend endpoint. The id-card GET is
// the exception: it only backs the print-only card now (see DigitalIdCardComponent embedded
// below), so it's fetched lazily on the first "Download ID card" click rather than on init.
@Component({
  selector: 'app-my-account',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, TranslateModule, FieldErrorComponent, InlineBannerComponent,
    BrandButtonComponent, EditableTableComponent, DigitalIdCardComponent
  ],
  providers: [CurrencyPipe],
  template: `
    <div class="my-account">
      <p *ngIf="profileLoadError" class="my-account__load-error">{{ 'myAccount.profileLoadError' | translate }}</p>

      <div class="my-account__header" *ngIf="profile as p">
        <span class="my-account__avatar">{{ initials }}</span>
        <div class="my-account__identity">
          <h1 class="my-account__name">{{ p.name }}</h1>
          <div class="my-account__meta">
            <span>{{ p.userId }}</span>
            <span>&middot;</span>
            <span>{{ 'myAccount.joinedOn' | translate: { date: (p.joinedAt | date: 'd-MMM-yyyy') } }}</span>
            <span *ngIf="kycStatus as k" class="my-account__status" [class.my-account__status--verified]="k.kycStatus === 'VERIFIED'">
              {{ 'myAccount.statusLabel' | translate: { status: kycStatusLabel(k.kycStatus) } }}
            </span>
          </div>
        </div>
        <div class="my-account__header-actions">
          <span class="my-account__rank-chip" *ngIf="rankProgress as rp">{{ rp.currentRank }}</span>
          <button type="button" class="my-account__print-button" (click)="printIdCard()">
            {{ 'myAccount.downloadIdCard' | translate }}
          </button>
        </div>
      </div>

      <div class="my-account__grid">

        <div class="rank-card">
          <div class="rank-card__header">
            <span class="rank-card__label">{{ 'myAccount.rank.eyebrow' | translate }}</span>
            <span class="rank-card__rule"></span>
          </div>
          <p *ngIf="rankLoadError" class="my-account__load-error">{{ 'myAccount.rank.loadError' | translate }}</p>
          <ng-container *ngIf="rankProgress as rp">
            <div class="rank-card__body">
              <div class="rank-card__current">
                <span class="rank-card__figure">{{ rp.currentRank }}</span>
                <span class="rank-card__next" *ngIf="rp.nextRank">
                  {{ 'myAccount.rank.nextRank' | translate: { rank: rp.nextRank, pct: rp.progressPercent } }}
                </span>
                <span class="rank-card__next" *ngIf="!rp.nextRank">{{ 'myAccount.rank.maxRankReached' | translate }}</span>
              </div>
              <div class="rank-card__stat">
                <span class="rank-card__stat-label">{{ 'myAccount.rank.cumulativeVolumeLabel' | translate }}</span>
                <span class="rank-card__stat-value">{{ rp.cumulativeMatchedVolume }}</span>
              </div>
              <div class="rank-card__stat">
                <span class="rank-card__stat-label">{{ 'myAccount.rank.volumeToNextRankLabel' | translate }}</span>
                <span class="rank-card__stat-value rank-card__stat-value--accent">{{ formatCurrency(rp.volumeToNextRank) }}</span>
              </div>
            </div>
            <div class="rank-card__bar"><div class="rank-card__bar-fill" [style.width.%]="rp.progressPercent"></div></div>
            <div class="rank-card__bar-labels">
              <span>{{ rp.currentRank }} &middot; {{ formatCurrency(rp.cumulativeMatchedVolume) }}</span>
              <span *ngIf="rp.nextRank">{{ rp.nextRank }} &middot; {{ formatCurrency(rp.cumulativeMatchedVolume + rp.volumeToNextRank) }}</span>
            </div>
          </ng-container>
        </div>

        <div class="verification-card seal-card">
          <div class="seal-card__hairline seal-card__hairline--top"></div>
          <div class="seal-card__body">
            <div class="seal-card__header">
              <span class="seal-card__header-rule"></span>
              <span class="seal-card__header-label">{{ 'myAccount.verification.eyebrow' | translate }}</span>
            </div>
            <div class="verification-card__code">{{ profile?.userId }}</div>
            <p class="verification-card__hint">{{ 'myAccount.verification.hint' | translate }}</p>
            <button type="button" class="verification-card__copy-button" (click)="onCopyCode()">
              {{ 'myAccount.verification.copyCode' | translate }}
            </button>
          </div>
          <div class="seal-card__hairline seal-card__hairline--bottom"></div>
        </div>

        <form class="contact-card" [formGroup]="form" (ngSubmit)="onSubmit()" *ngIf="profile">
          <div class="contact-card__header">
            <span class="contact-card__title">{{ 'myAccount.contact.title' | translate }}</span>
            <span class="contact-card__missing-chip" *ngIf="missingFieldsCount > 0">
              {{ 'myAccount.contact.missingFields' | translate: { count: missingFieldsCount } }}
            </span>
            <app-brand-button type="submit" variant="primary" [disabled]="form.invalid" class="contact-card__save">
              {{ 'myAccount.contact.saveAction' | translate }}
            </app-brand-button>
          </div>
          <app-inline-banner *ngIf="saveSuccess" tone="success">{{ 'myAccount.contact.saveSuccess' | translate }}</app-inline-banner>
          <app-inline-banner *ngIf="saveError" tone="danger" class="contact-card__save-error">{{ saveError }}</app-inline-banner>

          <div class="contact-card__fields">
            <label class="contact-card__field">
              <span>{{ 'myAccount.contact.nameLabel' | translate }}</span>
              <input type="text" formControlName="name" />
              <app-field-error [message]="fieldError('name')"></app-field-error>
            </label>
            <label class="contact-card__field">
              <span>{{ 'myAccount.contact.emailLabel' | translate }}</span>
              <input type="email" formControlName="email" />
              <app-field-error [message]="fieldError('email') || emailConflictError"></app-field-error>
            </label>
            <label class="contact-card__field">
              <span>{{ 'myAccount.contact.phoneLabel' | translate }}</span>
              <input type="text" formControlName="phone" />
              <app-field-error [message]="fieldError('phone')"></app-field-error>
            </label>
            <div class="contact-card__field">
              <span>{{ 'myAccount.contact.bankLabel' | translate }}</span>
              <div class="contact-card__bank-placeholder">{{ 'myAccount.contact.bankComingSoon' | translate }}</div>
            </div>
          </div>
        </form>

        <div class="kyc-card">
          <div class="kyc-card__header">
            <span class="kyc-card__title">{{ 'myAccount.kyc.title' | translate }}</span>
            <span class="kyc-card__count">{{ uploadedDocumentCount }}/{{ documentTypes.length }}</span>
          </div>
          <p *ngIf="kycLoadError" class="my-account__load-error">{{ 'myAccount.kyc.loadError' | translate }}</p>
          <div class="kyc-card__row" *ngFor="let docType of documentTypes">
            <span class="kyc-card__row-label">{{ 'profileKyc.kyc.documentType.' + docType | translate }}</span>
            <span *ngIf="submittedDocument(docType) as doc" class="kyc-card__row-meta">
              {{ 'profileKyc.kyc.submittedOn' | translate: { date: (doc.uploadedAt | date: 'mediumDate') } }}
            </span>
            <span *ngIf="!submittedDocument(docType)" class="kyc-card__row-meta">
              {{ 'profileKyc.kyc.notSubmitted' | translate }}
            </span>
            <label class="kyc-card__upload">
              {{ 'myAccount.kyc.uploadAction' | translate }}
              <input type="file" class="kyc-card__upload-input" [accept]="acceptTypes" (change)="onFileInputChange(docType, $event)" />
            </label>
          </div>
          <app-field-error [message]="kycUploadError"></app-field-error>
          <app-inline-banner *ngIf="kycStatus as k" [tone]="kycStatusTone(k.kycStatus)" class="kyc-card__status-banner">
            {{ 'myAccount.kyc.statusFooter' | translate: { status: kycStatusLabel(k.kycStatus) } }}
          </app-inline-banner>
        </div>

        <div class="tiers-card">
          <div class="tiers-card__header">
            <span class="tiers-card__label">{{ 'rewards.tiersTitle' | translate }}</span>
            <span class="tiers-card__rule"></span>
          </div>
          <p class="tiers-card__empty" *ngIf="tierRows.length === 0">{{ 'myAccount.tiers.emptyState' | translate }}</p>
          <app-editable-table
            *ngIf="tierRows.length > 0"
            [readOnly]="true"
            [columns]="tierColumns"
            [rows]="tierRows"
          ></app-editable-table>
        </div>

      </div>
    </div>

    <!-- Always mounted (hidden on screen, shown under @media print in _my-account.scss) so
         DigitalIdCardComponent's own self-fetching ngOnInit populates it without this component
         needing a second copy of that data or a lazy-load trigger. -->
    <div class="my-account__print-card">
      <app-digital-id-card></app-digital-id-card>
    </div>
  `
})
export class MyAccountComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private associateProfileService = inject(AssociateProfileService);
  private associateKycService = inject(AssociateKycService);
  private rewardsService = inject(RewardsService);
  private translate = inject(TranslateService);
  private currencyPipe = inject(CurrencyPipe);
  private destroyed$ = new Subject<void>();

  readonly documentTypes = KYC_DOCUMENT_TYPES;
  readonly acceptTypes = 'image/png,image/jpeg,image/webp,application/pdf';

  form = this.fb.group({
    name: ['', Validators.required],
    phone: [''],
    email: ['', Validators.email]
  });

  profile: AssociateProfileResponse | null = null;
  kycStatus: AssociateKycStatusResponse | null = null;
  rankProgress: AssociateRankProgress | null = null;

  profileLoadError = false;
  kycLoadError = false;
  rankLoadError = false;
  saveSuccess = false;
  saveError?: string;
  emailConflictError?: string;
  kycUploadError?: string;
  private serverFieldErrors: Record<string, string> = {};

  tierColumns: EditableTableColumn[] = [];
  tierRows: Record<string, string | number>[] = [];

  ngOnInit(): void {
    this.buildTierColumns();
    this.translate.onLangChange.pipe(takeUntil(this.destroyed$)).subscribe(() => this.buildTierColumns());
    this.loadProfile();
    this.loadKycStatus();
    this.loadRankProgress();
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  // Same algorithm as DigitalIdCardComponent.initials()/AuditLogComponent.initials() -- trim ->
  // split on whitespace -> first 2 words -> first letter of each, uppercased.
  get initials(): string {
    const name = this.profile?.name ?? '';
    if (!name.trim()) {
      return '';
    }
    return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join('');
  }

  get missingFieldsCount(): number {
    if (!this.profile) {
      return 0;
    }
    return [this.profile.phone, this.profile.email].filter(v => !v).length;
  }

  get uploadedDocumentCount(): number {
    return this.kycStatus?.documents.length ?? 0;
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

  formatCurrency(value: number): string {
    return this.currencyPipe.transform(value, 'INR', 'symbol', '1.0-2') ?? String(value);
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

  onCopyCode(): void {
    if (this.profile) {
      navigator.clipboard.writeText(this.profile.userId);
    }
  }

  printIdCard(): void {
    window.print();
  }

  private buildTierColumns(): void {
    this.translate
      .get([
        'rewards.columnTierLevel',
        'rewards.columnVolumeThreshold',
        'rewards.columnCashReward',
        'rewards.columnPerkDescription',
        'rewards.columnAchieved'
      ])
      .pipe(takeUntil(this.destroyed$))
      .subscribe(t => {
        this.tierColumns = [
          { key: 'tierLevel', label: t['rewards.columnTierLevel'], type: 'text' },
          { key: 'volumeThreshold', label: t['rewards.columnVolumeThreshold'], type: 'text' },
          { key: 'cashReward', label: t['rewards.columnCashReward'], type: 'text' },
          { key: 'perkDescription', label: t['rewards.columnPerkDescription'], type: 'text' },
          { key: 'achieved', label: t['rewards.columnAchieved'], type: 'text' }
        ];
      });
  }

  private updateTierRows(): void {
    this.tierRows = (this.rankProgress?.rewardTiers ?? []).map(t => ({
      tierLevel: t.tierLevel,
      volumeThreshold: this.formatCurrency(t.volumeThreshold),
      cashReward: this.formatCurrency(t.cashReward),
      perkDescription: t.perkDescription,
      achieved: this.translate.instant(t.achieved ? 'rewards.achievedYes' : 'rewards.achievedNo')
    }));
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

  private loadRankProgress(): void {
    this.rankLoadError = false;
    this.rewardsService.getMyRankProgress().subscribe({
      next: res => {
        this.rankProgress = res;
        this.updateTierRows();
      },
      error: () => (this.rankLoadError = true)
    });
  }
}
