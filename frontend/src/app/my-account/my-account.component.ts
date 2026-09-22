import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subject, forkJoin } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AssociateProfileService } from '../profile-kyc/associate-profile.service';
import { AssociateKycService } from '../profile-kyc/associate-kyc.service';
import { AssociateProfileResponse, UpdateAssociateProfileRequest } from '../profile-kyc/models/associate-profile.model';
import { AssociateKycStatusResponse, KYC_DOCUMENT_TYPES } from '../profile-kyc/models/associate-kyc-status.model';
import { RewardsService } from './rewards.service';
import { AssociateRankProgress } from './models/associate-rank-progress.model';
import { AssociateBankDetailsService } from './associate-bank-details.service';
import { AssociateNomineeService } from './associate-nominee.service';
import { AssociateNomineeResponse, UpdateAssociateNomineeRequest } from './models/associate-nominee.model';
import { AssociatePhotoService } from './associate-photo.service';
import { AssociateTransactionPasswordService } from './associate-transaction-password.service';
import { TransactionPasswordStatusResponse } from './models/associate-transaction-password.model';
import { AuthService } from '../auth/auth.service';
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
//
// Profile screen redesign ("Viraj Acres" mockup, Profile Screen.dc.html): the Profile section
// (activeTab === 'profile') additionally splits into an in-page tab bar (`profileSubTab`) --
// Profile / Login Password / Transaction Password -- scoped only to this route's content, NOT a
// route change: the 4 sidebar routes above it are untouched. The mockup's hero photo/name/ID card
// is new (`.profile-hero`), absorbing the old `.verification-card`'s associate-ID content; rank
// info is NOT dropped, `.rank-card` just moves to its own full-width row below the hero. Nominee
// is a new sibling resource (own service, own backend table) saved together with the profile form
// under one "Save Changes" button via forkJoin -- not atomic across the two PUTs (ponytail: a
// two-phase commit is unwarranted complexity for a settings form; a partial save surfaces its
// error like any other failed request and the associate can just retry).
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
          <div class="profile-hero seal-card">
            <div class="seal-card__hairline seal-card__hairline--top"></div>
            <div class="seal-card__body profile-hero__body">
              <span class="profile-hero__avatar" *ngIf="!photoObjectUrl">{{ initials }}</span>
              <img class="profile-hero__avatar profile-hero__avatar--photo" *ngIf="photoObjectUrl" [src]="photoObjectUrl" alt="" />
              <div class="profile-hero__identity">
                <div class="seal-card__header">
                  <span class="seal-card__header-rule"></span>
                  <span class="seal-card__header-label">{{ 'myAccount.hero.eyebrow' | translate }}</span>
                </div>
                <div class="profile-hero__name">{{ profile.name }}</div>
                <div class="profile-hero__meta">
                  <span class="profile-hero__code">{{ profile.userId }}</span>
                  <button type="button" class="profile-hero__copy-button" (click)="onCopyCode()">
                    {{ 'myAccount.verification.copyCode' | translate }}
                  </button>
                  <span class="profile-hero__phone" *ngIf="profile.phone">
                    <span class="material-symbols-outlined">call</span>{{ profile.phone }}
                  </span>
                </div>
                <div class="profile-hero__meta profile-hero__meta--secondary">
                  <span>{{ 'myAccount.joinedOn' | translate: { date: (profile.joinedAt | date: 'd-MMM-yyyy') } }}</span>
                  <span *ngIf="kycStatus as k" class="profile-hero__kyc" [class.profile-hero__kyc--verified]="k.kycStatus === 'VERIFIED'">
                    {{ 'myAccount.statusLabel' | translate: { status: kycStatusLabel(k.kycStatus) } }}
                  </span>
                </div>
              </div>
              <div class="profile-hero__actions">
                <label class="profile-hero__upload-button">
                  {{ 'myAccount.hero.uploadPhoto' | translate }}
                  <input
                    type="file"
                    class="profile-hero__upload-input"
                    accept="image/png,image/jpeg,image/webp"
                    (change)="onPhotoInputChange($event)"
                  />
                </label>
                <button type="button" class="profile-hero__remove-button" *ngIf="photoObjectUrl" (click)="onRemovePhoto()">
                  {{ 'myAccount.hero.removePhoto' | translate }}
                </button>
              </div>
            </div>

            <div class="profile-hero__divider"></div>

            <div class="seal-card__body profile-hero__rank-body">
              <div class="seal-card__header">
                <span class="seal-card__header-rule"></span>
                <span class="seal-card__header-label">{{ 'myAccount.rank.eyebrow' | translate }}</span>
              </div>
              <p *ngIf="rankLoadError" class="my-account__load-error">{{ 'myAccount.rank.loadError' | translate }}</p>
              <ng-container *ngIf="rankProgress as rp">
                <div class="profile-hero__rank-plaque">
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
                </div>

                <div class="reward-tiers" *ngIf="rp.rewardTiers.length > 0">
                  <div class="reward-tiers__header">
                    <span class="reward-tiers__rule"></span>
                    <span class="reward-tiers__label">{{ 'myAccount.rank.rewardTiersEyebrow' | translate }}</span>
                  </div>
                  <div class="reward-tiers__row" *ngFor="let tier of rp.rewardTiers" [class.reward-tiers__row--achieved]="tier.achieved">
                    <span class="material-symbols-outlined reward-tiers__icon">{{ tier.achieved ? 'check_circle' : 'radio_button_unchecked' }}</span>
                    <span class="reward-tiers__tier">{{ 'myAccount.rank.tierLabel' | translate: { level: tier.tierLevel } }}</span>
                    <span class="reward-tiers__threshold">{{ formatCurrency(tier.volumeThreshold) }}</span>
                    <span class="reward-tiers__cash">{{ formatCurrency(tier.cashReward) }}</span>
                    <span class="reward-tiers__perk">{{ tier.perkDescription }}</span>
                  </div>
                </div>
              </ng-container>
            </div>
            <div class="seal-card__hairline seal-card__hairline--bottom"></div>
          </div>
          <app-field-error [message]="photoUploadError"></app-field-error>

          <div class="profile-subtabs">
            <button
              type="button"
              class="profile-subtabs__tab"
              [class.profile-subtabs__tab--active]="profileSubTab === 'profile'"
              (click)="profileSubTab = 'profile'"
            >{{ 'myAccount.subtabs.profile' | translate }}</button>
            <button
              type="button"
              class="profile-subtabs__tab"
              [class.profile-subtabs__tab--active]="profileSubTab === 'loginPassword'"
              (click)="profileSubTab = 'loginPassword'"
            >{{ 'myAccount.subtabs.loginPassword' | translate }}</button>
            <button
              type="button"
              class="profile-subtabs__tab"
              [class.profile-subtabs__tab--active]="profileSubTab === 'transactionPassword'"
              (click)="profileSubTab = 'transactionPassword'"
            >{{ 'myAccount.subtabs.transactionPassword' | translate }}</button>
          </div>

          <form class="detail-card" [formGroup]="form" (ngSubmit)="onSaveChanges()" *ngIf="profileSubTab === 'profile'">
            <app-inline-banner *ngIf="saveSuccess" tone="success">{{ 'myAccount.contact.saveSuccess' | translate }}</app-inline-banner>
            <app-inline-banner *ngIf="saveError" tone="danger">{{ saveError }}</app-inline-banner>

            <div class="detail-card__flanking-header">
              <span class="detail-card__flanking-rule"></span>
              <span class="detail-card__flanking-label">{{ 'myAccount.personalDetail.title' | translate }}</span>
              <span class="detail-card__flanking-rule detail-card__flanking-rule--fill"></span>
            </div>
            <div class="detail-card__fields">
              <label class="detail-card__field">
                <span>{{ 'myAccount.personalDetail.nameLabel' | translate }}</span>
                <input type="text" formControlName="name" />
                <app-field-error [message]="fieldError('name')"></app-field-error>
              </label>
              <label class="detail-card__field">
                <span>{{ 'myAccount.personalDetail.fatherHusbandNameLabel' | translate }}</span>
                <input type="text" formControlName="fatherHusbandName" />
              </label>
              <label class="detail-card__field">
                <span>{{ 'myAccount.personalDetail.dobLabel' | translate }}</span>
                <input type="date" formControlName="dateOfBirth" />
              </label>
              <label class="detail-card__field">
                <span>{{ 'myAccount.personalDetail.genderLabel' | translate }}</span>
                <select formControlName="gender">
                  <option value=""></option>
                  <option *ngFor="let g of genderOptions" [value]="g">{{ 'myAccount.personalDetail.gender' + g | translate }}</option>
                </select>
              </label>
              <label class="detail-card__field">
                <span>{{ 'myAccount.personalDetail.maritalStatusLabel' | translate }}</span>
                <select formControlName="maritalStatus">
                  <option value=""></option>
                  <option *ngFor="let m of maritalStatusOptions" [value]="m">{{ 'myAccount.personalDetail.marital' + m | translate }}</option>
                </select>
              </label>
            </div>

            <div class="detail-card__flanking-header">
              <span class="detail-card__flanking-rule"></span>
              <span class="detail-card__flanking-label">{{ 'myAccount.contact.title' | translate }}</span>
              <span class="detail-card__flanking-rule detail-card__flanking-rule--fill"></span>
              <span class="detail-card__missing-chip" *ngIf="missingFieldsCount > 0">
                {{ 'myAccount.contact.missingFields' | translate: { count: missingFieldsCount } }}
              </span>
            </div>
            <div class="detail-card__fields">
              <label class="detail-card__field">
                <span>{{ 'myAccount.contact.stateLabel' | translate }}</span>
                <select formControlName="state">
                  <option value=""></option>
                  <option *ngFor="let s of stateOptions" [value]="s">{{ s }}</option>
                </select>
              </label>
              <label class="detail-card__field">
                <span>{{ 'myAccount.contact.districtLabel' | translate }}</span>
                <input type="text" formControlName="district" />
              </label>
              <label class="detail-card__field">
                <span>{{ 'myAccount.contact.addressLabel' | translate }}</span>
                <input type="text" formControlName="address" />
                <app-field-error [message]="fieldError('address')"></app-field-error>
              </label>
              <label class="detail-card__field">
                <span>{{ 'myAccount.contact.postalCodeLabel' | translate }}</span>
                <input type="text" formControlName="postalCode" />
              </label>
              <label class="detail-card__field">
                <span>{{ 'myAccount.contact.phoneLabel' | translate }}</span>
                <input type="text" formControlName="phone" />
                <app-field-error [message]="fieldError('phone')"></app-field-error>
              </label>
              <label class="detail-card__field">
                <span>{{ 'myAccount.contact.emailLabel' | translate }}</span>
                <input type="email" formControlName="email" />
                <app-field-error [message]="fieldError('email') || emailConflictError"></app-field-error>
              </label>
            </div>

            <div class="detail-card__flanking-header">
              <span class="detail-card__flanking-rule"></span>
              <span class="detail-card__flanking-label">{{ 'myAccount.nominee.title' | translate }}</span>
              <span class="detail-card__flanking-rule detail-card__flanking-rule--fill"></span>
            </div>
            <div class="detail-card__fields" [formGroup]="nomineeForm">
              <label class="detail-card__field">
                <span>{{ 'myAccount.nominee.nomineeNameLabel' | translate }}</span>
                <input type="text" formControlName="nomineeName" />
              </label>
              <label class="detail-card__field">
                <span>{{ 'myAccount.nominee.relationLabel' | translate }}</span>
                <input type="text" formControlName="relation" />
              </label>
            </div>

            <div class="detail-card__flanking-header">
              <span class="detail-card__flanking-rule"></span>
              <span class="detail-card__flanking-label">{{ 'myAccount.authorisation.title' | translate }}</span>
              <span class="detail-card__flanking-rule detail-card__flanking-rule--fill"></span>
            </div>
            <div class="detail-card__fields detail-card__fields--auth">
              <label class="detail-card__field">
                <span>{{ 'myAccount.authorisation.transactionPasswordLabel' | translate }}</span>
                <input type="password" formControlName="transactionPassword" [placeholder]="'myAccount.authorisation.placeholder' | translate" />
                <span class="detail-card__hint">{{ 'myAccount.authorisation.hint' | translate }}</span>
              </label>
            </div>

            <div class="profile-actions">
              <app-brand-button type="submit" variant="primary" [disabled]="form.invalid">
                {{ 'myAccount.actions.save' | translate }}
              </app-brand-button>
              <button type="button" class="profile-actions__cancel" (click)="onCancelChanges()">
                {{ 'myAccount.actions.cancel' | translate }}
              </button>
            </div>
          </form>

          <form class="detail-card" [formGroup]="loginPasswordForm" (ngSubmit)="onLoginPasswordSubmit()" *ngIf="profileSubTab === 'loginPassword'">
            <app-inline-banner *ngIf="loginPasswordSaveSuccess" tone="success">{{ 'myAccount.loginPasswordTab.saveSuccess' | translate }}</app-inline-banner>
            <app-inline-banner *ngIf="loginPasswordSaveError" tone="danger">{{ loginPasswordSaveError }}</app-inline-banner>
            <div class="detail-card__fields">
              <label class="detail-card__field">
                <span>{{ 'myAccount.loginPasswordTab.currentLabel' | translate }}</span>
                <input type="password" formControlName="currentPassword" autocomplete="current-password" />
              </label>
              <label class="detail-card__field">
                <span>{{ 'myAccount.loginPasswordTab.newLabel' | translate }}</span>
                <input type="password" formControlName="newPassword" autocomplete="new-password" />
              </label>
              <label class="detail-card__field">
                <span>{{ 'myAccount.loginPasswordTab.confirmLabel' | translate }}</span>
                <input type="password" formControlName="confirmPassword" autocomplete="new-password" />
              </label>
            </div>
            <div class="profile-actions">
              <app-brand-button type="submit" variant="primary" [disabled]="loginPasswordForm.invalid">
                {{ 'myAccount.loginPasswordTab.saveAction' | translate }}
              </app-brand-button>
            </div>
          </form>

          <form class="detail-card" [formGroup]="transactionPasswordForm" (ngSubmit)="onTransactionPasswordSubmit()" *ngIf="profileSubTab === 'transactionPassword'">
            <app-inline-banner *ngIf="transactionPasswordSaveSuccess" tone="success">{{ 'myAccount.transactionPasswordTab.saveSuccess' | translate }}</app-inline-banner>
            <app-inline-banner *ngIf="transactionPasswordSaveError" tone="danger">{{ transactionPasswordSaveError }}</app-inline-banner>
            <p *ngIf="transactionPasswordStatus && !transactionPasswordStatus.isSet" class="detail-card__hint">
              {{ 'myAccount.transactionPasswordTab.notSetHint' | translate }}
            </p>
            <div class="detail-card__fields">
              <label class="detail-card__field" *ngIf="transactionPasswordStatus?.isSet">
                <span>{{ 'myAccount.transactionPasswordTab.currentLabel' | translate }}</span>
                <input type="password" formControlName="currentTransactionPassword" />
              </label>
              <label class="detail-card__field">
                <span>{{ 'myAccount.transactionPasswordTab.newLabel' | translate }}</span>
                <input type="password" formControlName="newTransactionPassword" />
              </label>
              <label class="detail-card__field">
                <span>{{ 'myAccount.transactionPasswordTab.confirmLabel' | translate }}</span>
                <input type="password" formControlName="confirmTransactionPassword" />
              </label>
            </div>
            <div class="profile-actions">
              <app-brand-button type="submit" variant="primary" [disabled]="transactionPasswordForm.invalid">
                {{ 'myAccount.transactionPasswordTab.saveAction' | translate }}
              </app-brand-button>
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
        <div class="letter-card__top">
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
          <img *ngIf="showSquareLogo" class="letter-card__logo" src="/api/company/branding/logo/square" alt="" />
        </div>
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
  private associateNomineeService = inject(AssociateNomineeService);
  private associatePhotoService = inject(AssociatePhotoService);
  private associateTransactionPasswordService = inject(AssociateTransactionPasswordService);
  private authService = inject(AuthService);
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
  readonly genderOptions = ['MALE', 'FEMALE', 'OTHER'];
  readonly maritalStatusOptions = ['SINGLE', 'MARRIED', 'OTHER'];
  // ponytail: short hardcoded list, not a full India states/districts dataset -- add a real geo
  // dataset (and wire District as a dependent select) if the product needs full coverage later.
  readonly stateOptions = [
    'Andhra Pradesh', 'Bihar', 'Delhi', 'Gujarat', 'Karnataka', 'Maharashtra',
    'Punjab', 'Rajasthan', 'Tamil Nadu', 'Uttar Pradesh', 'West Bengal'
  ];

  activeTab: 'welcomeLetter' | 'profile' | 'bankDetails' | 'kyc' = 'profile';
  profileSubTab: 'profile' | 'loginPassword' | 'transactionPassword' = 'profile';
  printTarget: 'idCard' | 'welcomeLetter' = 'idCard';
  private bankDetailsLoaded = false;

  form = this.fb.group({
    name: ['', Validators.required],
    phone: [''],
    email: ['', Validators.email],
    address: [''],
    fatherHusbandName: [''],
    dateOfBirth: [''],
    gender: [''],
    maritalStatus: [''],
    state: [''],
    district: [''],
    postalCode: [''],
    transactionPassword: ['']
  });

  nomineeForm = this.fb.group({
    nomineeName: [''],
    relation: ['']
  });

  loginPasswordForm = this.fb.group({
    currentPassword: ['', Validators.required],
    newPassword: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', Validators.required]
  });

  transactionPasswordForm = this.fb.group({
    currentTransactionPassword: [''],
    newTransactionPassword: ['', [Validators.required, Validators.minLength(6)]],
    confirmTransactionPassword: ['', Validators.required]
  });

  bankForm = this.fb.group({
    bankName: ['', Validators.required],
    accountHolder: ['', Validators.required],
    accountNumber: ['', Validators.required],
    ifscCode: ['', [Validators.required, Validators.pattern(IFSC_PATTERN)]],
    accountType: ['SAVINGS', Validators.required]
  });

  profile: AssociateProfileResponse | null = null;
  nominee: AssociateNomineeResponse | null = null;
  kycStatus: AssociateKycStatusResponse | null = null;
  rankProgress: AssociateRankProgress | null = null;
  companyLetterhead: CompanyLetterheadResponse | null = null;
  transactionPasswordStatus: TransactionPasswordStatusResponse | null = null;
  photoObjectUrl: string | null = null;

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
  photoUploadError?: string;
  loginPasswordSaveSuccess = false;
  loginPasswordSaveError?: string;
  transactionPasswordSaveSuccess = false;
  transactionPasswordSaveError?: string;
  private serverFieldErrors: Record<string, string> = {};
  private bankServerFieldErrors: Record<string, string> = {};

  ngOnInit(): void {
    this.loadProfile();
    this.loadNominee();
    this.loadKycStatus();
    this.loadRankProgress();
    this.loadCompanyLetterhead();
    this.loadTransactionPasswordStatus();
    this.loadPhoto();
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
    if (this.photoObjectUrl) {
      URL.revokeObjectURL(this.photoObjectUrl);
    }
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

  onSaveChanges(): void {
    if (this.form.invalid) {
      return;
    }
    this.saveSuccess = false;
    this.saveError = undefined;
    this.emailConflictError = undefined;
    this.serverFieldErrors = {};

    const v = this.form.getRawValue();
    const transactionPassword = v.transactionPassword || null;
    const profileRequest: UpdateAssociateProfileRequest = {
      name: v.name!, phone: v.phone || null, email: v.email || null, address: v.address || null,
      fatherHusbandName: v.fatherHusbandName || null, dateOfBirth: v.dateOfBirth || null,
      gender: v.gender || null, maritalStatus: v.maritalStatus || null,
      state: v.state || null, district: v.district || null, postalCode: v.postalCode || null,
      transactionPassword
    };
    const nomineeValue = this.nomineeForm.getRawValue();
    const nomineeRequest: UpdateAssociateNomineeRequest = {
      nomineeName: nomineeValue.nomineeName || null, relation: nomineeValue.relation || null, transactionPassword
    };

    forkJoin([
      this.associateProfileService.updateProfile(profileRequest),
      this.associateNomineeService.updateNominee(nomineeRequest)
    ]).subscribe({
      next: ([profileRes, nomineeRes]) => {
        this.profile = profileRes;
        this.nominee = nomineeRes;
        this.saveSuccess = true;
        this.form.patchValue({ transactionPassword: '' });
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 409) {
          this.emailConflictError = err.error?.error ?? this.translate.instant('profileKyc.validation.emailTaken');
        } else if (err.status === 401) {
          this.saveError = err.error?.error ?? this.translate.instant('myAccount.authorisation.hint');
        } else {
          this.serverFieldErrors = toFieldErrors(err);
          this.saveError = this.translate.instant('profileKyc.saveError');
        }
      }
    });
  }

  onCancelChanges(): void {
    if (this.profile) {
      this.form.patchValue({ ...this.profile, transactionPassword: '' });
    }
    if (this.nominee) {
      this.nomineeForm.patchValue(this.nominee);
    }
  }

  onLoginPasswordSubmit(): void {
    if (this.loginPasswordForm.invalid) {
      return;
    }
    const { currentPassword, newPassword, confirmPassword } = this.loginPasswordForm.getRawValue();
    this.loginPasswordSaveSuccess = false;
    this.loginPasswordSaveError = undefined;
    if (newPassword !== confirmPassword) {
      this.loginPasswordSaveError = this.translate.instant('myAccount.loginPasswordTab.mismatch');
      return;
    }
    this.authService.changePassword(currentPassword!, newPassword!).subscribe({
      next: () => {
        this.loginPasswordSaveSuccess = true;
        this.loginPasswordForm.reset();
      },
      error: () => (this.loginPasswordSaveError = this.translate.instant('myAccount.loginPasswordTab.saveError'))
    });
  }

  onTransactionPasswordSubmit(): void {
    if (this.transactionPasswordForm.invalid) {
      return;
    }
    const { currentTransactionPassword, newTransactionPassword, confirmTransactionPassword } = this.transactionPasswordForm.getRawValue();
    this.transactionPasswordSaveSuccess = false;
    this.transactionPasswordSaveError = undefined;
    if (newTransactionPassword !== confirmTransactionPassword) {
      this.transactionPasswordSaveError = this.translate.instant('myAccount.transactionPasswordTab.mismatch');
      return;
    }
    this.associateTransactionPasswordService.setPassword({
      currentTransactionPassword: currentTransactionPassword || null,
      newTransactionPassword: newTransactionPassword!
    }).subscribe({
      next: () => {
        this.transactionPasswordSaveSuccess = true;
        this.transactionPasswordForm.reset();
        this.loadTransactionPasswordStatus();
      },
      error: () => (this.transactionPasswordSaveError = this.translate.instant('myAccount.transactionPasswordTab.saveError'))
    });
  }

  onPhotoInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.onPhotoSelected(file);
    }
    input.value = '';
  }

  onPhotoSelected(file: File): void {
    this.photoUploadError = undefined;
    this.associatePhotoService.uploadPhoto(file).subscribe({
      next: () => this.loadPhoto(),
      error: (err: HttpErrorResponse) => {
        this.photoUploadError = err.error?.error ?? this.translate.instant('myAccount.hero.photoUploadError');
      }
    });
  }

  onRemovePhoto(): void {
    this.associatePhotoService.removePhoto().subscribe({
      next: () => this.setPhotoObjectUrl(null)
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
        this.form.patchValue({ ...res, transactionPassword: '' });
      },
      error: () => (this.profileLoadError = true)
    });
  }

  private loadNominee(): void {
    this.associateNomineeService.getNominee().subscribe({
      next: res => {
        this.nominee = res;
        this.nomineeForm.patchValue({ nomineeName: res.nomineeName, relation: res.relation });
      }
    });
  }

  private loadTransactionPasswordStatus(): void {
    this.associateTransactionPasswordService.getStatus().subscribe({
      next: res => (this.transactionPasswordStatus = res)
    });
  }

  // No error flag: a 404 (no photo uploaded yet) is a normal, expected state, not an error --
  // the avatar just falls back to initials (see the template's photoObjectUrl-gated *ngIf pair).
  private loadPhoto(): void {
    this.associatePhotoService.getPhotoBlob().subscribe({
      next: blob => this.setPhotoObjectUrl(URL.createObjectURL(blob)),
      error: () => this.setPhotoObjectUrl(null)
    });
  }

  private setPhotoObjectUrl(url: string | null): void {
    if (this.photoObjectUrl) {
      URL.revokeObjectURL(this.photoObjectUrl);
    }
    this.photoObjectUrl = url;
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
