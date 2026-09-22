import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
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
import { AssociateBankDetailsService } from './associate-bank-details.service';
import { DigitalIdCardComponent } from './digital-id-card.component';
import { FieldErrorComponent } from '../shared/components/field-error/field-error.component';
import { InlineBannerComponent } from '../shared/components/inline-banner/inline-banner.component';
import { BrandButtonComponent } from '../shared/components/brand-button/brand-button.component';
import { toFieldErrors } from '../core/api/field-errors.model';
import { BrandingBootstrapService } from '../core/theme/branding-bootstrap.service';
import { CompanyProfileService } from '../setup/steps/company-profile/company-profile.service';
import { CompanyLetterheadResponse } from '../setup/models/company-profile.model';

const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;

// Consolidates /profile (ProfileKycComponent), /rewards (RewardsComponent), and /digital-id-card
// (DigitalIdCardComponent) into one "My Account" screen per Account Consolidation.dc.html
// (claude.ai design project cfbfc37d-4de7-4f26-8b81-923167ca3d33). Each of the three backend
// resources keeps its own service/error surface, matching the three source components'
// independent-failure behavior -- there's still no combined backend endpoint. The id-card GET is
// the exception: it only backs the print-only card now (see DigitalIdCardComponent embedded
// below), so it's fetched lazily on the first "Download ID card" click rather than on init.
//
// Split into 4 sections (Welcome Letter, Profile, Bank Details, KYC Details), each its own sibling
// route under /profile (app.routes.ts) and its own sub-item in the sidebar (AssociateSidebarComponent
// / ASSOCIATE_NAV_ITEMS['myAccount'].children) rather than an in-page tab bar -- so each section is
// a real, deep-linkable, back/forward-safe URL (docs/superpowers/plans/can-you-break-down-vectorized-dongarra.md).
// Angular reuses this same component instance across those sibling routes, so `activeTab` is driven
// reactively off ActivatedRoute.data (set per-route below), not read once on init. Rank,
// Verification, and the "Download ID card" header action are Profile-only (not shown on the other
// 3 sections). Bank Details is lazy-loaded on first navigation to that route; Profile/KYC/Welcome
// Letter data all come from the profile/KYC GETs already fired on init, so no extra lazy-load is
// needed for them.
@Component({
  selector: 'app-my-account',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, TranslateModule, FieldErrorComponent, InlineBannerComponent,
    BrandButtonComponent, DigitalIdCardComponent
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
        <div class="my-account__header-actions" *ngIf="activeTab === 'profile'">
          <span class="my-account__rank-chip" *ngIf="rankProgress as rp">{{ rp.currentRank }}</span>
          <button type="button" class="my-account__print-button" (click)="printIdCard()">
            {{ 'myAccount.downloadIdCard' | translate }}
          </button>
        </div>
      </div>

      <div class="my-account__tab-content">

        <div class="letter-card" *ngIf="activeTab === 'welcomeLetter'">
          <div class="letter-card__header">
            <span class="letter-card__title">{{ 'myAccount.welcomeLetter.title' | translate }}</span>
            <app-brand-button type="button" variant="primary" (click)="printWelcomeLetter()">
              {{ 'myAccount.welcomeLetter.downloadAction' | translate }}
            </app-brand-button>
          </div>
          <ng-container *ngTemplateOutlet="letterBody"></ng-container>
        </div>

        <ng-container *ngIf="activeTab === 'profile' && profile">
          <div class="my-account__profile-grid">
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
          </div>

          <form class="contact-card" [formGroup]="form" (ngSubmit)="onSubmit()">
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
              <label class="contact-card__field">
                <span>{{ 'myAccount.contact.addressLabel' | translate }}</span>
                <input type="text" formControlName="address" />
                <app-field-error [message]="fieldError('address')"></app-field-error>
              </label>
            </div>
          </form>
        </ng-container>

        <form class="bank-card" [formGroup]="bankForm" (ngSubmit)="onBankSubmit()" *ngIf="activeTab === 'bankDetails'">
          <div class="bank-card__header">
            <span class="bank-card__title">{{ 'myAccount.bankDetails.title' | translate }}</span>
            <app-brand-button type="submit" variant="primary" [disabled]="bankForm.invalid" class="bank-card__save">
              {{ 'myAccount.bankDetails.saveAction' | translate }}
            </app-brand-button>
          </div>
          <p *ngIf="bankLoadError" class="my-account__load-error">{{ 'myAccount.bankDetails.loadError' | translate }}</p>
          <app-inline-banner *ngIf="bankSaveSuccess" tone="success">{{ 'myAccount.bankDetails.saveSuccess' | translate }}</app-inline-banner>
          <app-inline-banner *ngIf="bankSaveError" tone="danger" class="bank-card__save-error">{{ bankSaveError }}</app-inline-banner>

          <div class="bank-card__fields">
            <label class="bank-card__field">
              <span>{{ 'myAccount.bankDetails.bankNameLabel' | translate }}</span>
              <input type="text" formControlName="bankName" />
              <app-field-error [message]="bankFieldError('bankName')"></app-field-error>
            </label>
            <label class="bank-card__field">
              <span>{{ 'myAccount.bankDetails.accountHolderLabel' | translate }}</span>
              <input type="text" formControlName="accountHolder" />
              <app-field-error [message]="bankFieldError('accountHolder')"></app-field-error>
            </label>
            <label class="bank-card__field">
              <span>{{ 'myAccount.bankDetails.accountNumberLabel' | translate }}</span>
              <input type="text" formControlName="accountNumber" />
              <app-field-error [message]="bankFieldError('accountNumber')"></app-field-error>
            </label>
            <label class="bank-card__field">
              <span>{{ 'myAccount.bankDetails.ifscCodeLabel' | translate }}</span>
              <input type="text" formControlName="ifscCode" />
              <app-field-error [message]="bankFieldError('ifscCode')"></app-field-error>
            </label>
            <label class="bank-card__field">
              <span>{{ 'myAccount.bankDetails.accountTypeLabel' | translate }}</span>
              <select formControlName="accountType">
                <option value="SAVINGS">{{ 'myAccount.bankDetails.accountTypeSavings' | translate }}</option>
                <option value="CURRENT">{{ 'myAccount.bankDetails.accountTypeCurrent' | translate }}</option>
              </select>
            </label>
          </div>
        </form>

        <div class="kyc-card" *ngIf="activeTab === 'kyc'">
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

      </div>
    </div>

    <!-- Shared by both the on-screen Welcome Letter tab and its print-only copy below, so the
         logo, dynamic member fields, and company footer are written once. -->
    <ng-template #letterBody>
      <div class="letter-card__body" *ngIf="profile as p">
        <img *ngIf="showSquareLogo" class="letter-card__logo" src="/api/company/branding/logo/square" alt="" />
        <dl class="letter-card__fields">
          <dt>{{ 'myAccount.welcomeLetter.memberIdLabel' | translate }}</dt>
          <dd>{{ p.userId }}</dd>
          <dt>{{ 'myAccount.welcomeLetter.nameLabel' | translate }}</dt>
          <dd>{{ p.name }}</dd>
          <dt>{{ 'myAccount.welcomeLetter.contactLabel' | translate }}</dt>
          <dd>{{ p.phone || '—' }}</dd>
          <dt>{{ 'myAccount.welcomeLetter.addressLabel' | translate }}</dt>
          <dd>{{ p.address || '—' }}</dd>
        </dl>
        <p class="letter-card__greeting">{{ 'myAccount.welcomeLetter.greeting' | translate: { name: p.name } }}</p>
        <p class="letter-card__intro">{{ 'myAccount.welcomeLetter.intro' | translate }}</p>
        <p class="letter-card__notes-title">{{ 'myAccount.welcomeLetter.notesTitle' | translate }}</p>
        <ol class="letter-card__notes">
          <li *ngFor="let key of welcomeLetterNoteKeys">{{ key | translate }}</li>
        </ol>
        <p class="letter-card__signoff">{{ 'myAccount.welcomeLetter.signoff' | translate }}</p>
        <p class="letter-card__regards">{{ 'myAccount.welcomeLetter.regards' | translate }}</p>
        <div class="letter-card__company" *ngIf="companyLetterhead as c">
          <p>{{ c.displayName }}</p>
          <p>{{ c.registeredAddress }}</p>
          <p>{{ c.contactPhone }}<ng-container *ngIf="c.contactEmail"> &middot; {{ c.contactEmail }}</ng-container></p>
        </div>
      </div>
    </ng-template>

    <!-- Always mounted (hidden on screen, shown under @media print in _my-account.scss). Only one
         of the two print targets is in the DOM at a time (gated by printTarget), so print always
         renders exactly the section the caller's Download button asked for. -->
    <div class="my-account__print-card" *ngIf="printTarget === 'idCard'">
      <app-digital-id-card></app-digital-id-card>
    </div>
    <div class="my-account__print-letter" *ngIf="printTarget === 'welcomeLetter'">
      <ng-container *ngTemplateOutlet="letterBody"></ng-container>
    </div>
  `
})
export class MyAccountComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private associateProfileService = inject(AssociateProfileService);
  private associateKycService = inject(AssociateKycService);
  private associateBankDetailsService = inject(AssociateBankDetailsService);
  private route = inject(ActivatedRoute);
  private rewardsService = inject(RewardsService);
  private translate = inject(TranslateService);
  private currencyPipe = inject(CurrencyPipe);
  private brandingBootstrap = inject(BrandingBootstrapService);
  private companyProfileService = inject(CompanyProfileService);
  private destroyed$ = new Subject<void>();

  readonly documentTypes = KYC_DOCUMENT_TYPES;
  readonly acceptTypes = 'image/png,image/jpeg,image/webp,application/pdf';
  readonly welcomeLetterNoteKeys = [
    'myAccount.welcomeLetter.note1', 'myAccount.welcomeLetter.note2', 'myAccount.welcomeLetter.note3',
    'myAccount.welcomeLetter.note4', 'myAccount.welcomeLetter.note5', 'myAccount.welcomeLetter.note6',
    'myAccount.welcomeLetter.note7', 'myAccount.welcomeLetter.note8', 'myAccount.welcomeLetter.note9'
  ];

  activeTab: 'welcomeLetter' | 'profile' | 'bankDetails' | 'kyc' = 'profile';
  printTarget: 'idCard' | 'welcomeLetter' = 'idCard';
  private bankDetailsLoaded = false;

  form = this.fb.group({
    name: ['', Validators.required],
    phone: [''],
    email: ['', Validators.email],
    address: ['']
  });

  bankForm = this.fb.group({
    bankName: ['', Validators.required],
    accountHolder: ['', Validators.required],
    accountNumber: ['', Validators.required],
    ifscCode: ['', [Validators.required, Validators.pattern(IFSC_PATTERN)]],
    accountType: ['SAVINGS', Validators.required]
  });

  profile: AssociateProfileResponse | null = null;
  kycStatus: AssociateKycStatusResponse | null = null;
  rankProgress: AssociateRankProgress | null = null;
  companyLetterhead: CompanyLetterheadResponse | null = null;

  profileLoadError = false;
  kycLoadError = false;
  rankLoadError = false;
  bankLoadError = false;
  saveSuccess = false;
  saveError?: string;
  emailConflictError?: string;
  kycUploadError?: string;
  bankSaveSuccess = false;
  bankSaveError?: string;
  private serverFieldErrors: Record<string, string> = {};
  private bankServerFieldErrors: Record<string, string> = {};

  ngOnInit(): void {
    this.loadProfile();
    this.loadKycStatus();
    this.loadRankProgress();
    this.loadCompanyLetterhead();
    // Angular reuses this component instance when navigating between the 4 sibling /profile
    // routes (see app.routes.ts), so `data` must be subscribed to, not read once -- a plain
    // ngOnInit read would miss every subsequent sidebar sub-item click.
    this.route.data.pipe(takeUntil(this.destroyed$)).subscribe(data => {
      this.activeTab = (data['tab'] as typeof this.activeTab) ?? 'profile';
      if (this.activeTab === 'bankDetails' && !this.bankDetailsLoaded) {
        this.loadBankDetails();
      }
    });
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

  // Same pattern as AssociateSidebarComponent.showSquareLogo / LoginComponent -- reads the
  // already-fetched APP_INITIALIZER result, no extra HTTP call.
  get showSquareLogo(): boolean {
    return !!this.brandingBootstrap.getLast()?.hasSquareLogo;
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

  bankFieldError(name: string): string | undefined {
    if (this.bankServerFieldErrors[name]) {
      return this.bankServerFieldErrors[name];
    }
    const control = this.bankForm.get(name);
    if (!control || !control.touched || !control.errors) {
      return undefined;
    }
    if (control.errors['pattern']) {
      return this.translate.instant('myAccount.bankDetails.ifscInvalid');
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

    const { name, phone, email, address } = this.form.getRawValue();
    this.associateProfileService.updateProfile({ name: name!, phone: phone || null, email: email || null, address: address || null }).subscribe({
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

  onBankSubmit(): void {
    if (this.bankForm.invalid) {
      return;
    }
    this.bankSaveSuccess = false;
    this.bankSaveError = undefined;
    this.bankServerFieldErrors = {};

    const { bankName, accountHolder, accountNumber, ifscCode, accountType } = this.bankForm.getRawValue();
    this.associateBankDetailsService.updateBankDetails({
      bankName: bankName!, accountHolder: accountHolder!, accountNumber: accountNumber!,
      ifscCode: ifscCode!, accountType: accountType as 'CURRENT' | 'SAVINGS'
    }).subscribe({
      next: res => {
        this.applyBankDetails(res);
        this.bankSaveSuccess = true;
      },
      error: (err: HttpErrorResponse) => {
        this.bankServerFieldErrors = toFieldErrors(err);
        this.bankSaveError = this.translate.instant('myAccount.bankDetails.saveError');
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
    this.printTarget = 'idCard';
    window.print();
  }

  printWelcomeLetter(): void {
    this.printTarget = 'welcomeLetter';
    window.print();
  }

  private loadProfile(): void {
    this.profileLoadError = false;
    this.associateProfileService.getProfile().subscribe({
      next: res => {
        this.profile = res;
        this.form.patchValue({ name: res.name, phone: res.phone, email: res.email, address: res.address });
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
      next: res => (this.rankProgress = res),
      error: () => (this.rankLoadError = true)
    });
  }

  // No error flag: the letter still renders fine without it (fields fall back to '—'), same as
  // the phone fallback already on the letter's Contact No. row.
  private loadCompanyLetterhead(): void {
    this.companyProfileService.getLetterhead().subscribe({
      next: res => (this.companyLetterhead = res)
    });
  }

  private loadBankDetails(): void {
    this.bankDetailsLoaded = true;
    this.bankLoadError = false;
    this.associateBankDetailsService.getBankDetails().subscribe({
      next: res => this.applyBankDetails(res),
      error: () => (this.bankLoadError = true)
    });
  }

  private applyBankDetails(res: { bankName: string | null; accountHolder: string | null; accountNumber: string | null; ifscCode: string | null; accountType: 'CURRENT' | 'SAVINGS' | null }): void {
    this.bankForm.patchValue({
      bankName: res.bankName ?? '',
      accountHolder: res.accountHolder ?? '',
      accountNumber: res.accountNumber ?? '',
      ifscCode: res.ifscCode ?? '',
      accountType: res.accountType ?? 'SAVINGS'
    });
  }
}
