import { AfterViewInit, Component, Input, OnDestroy, OnInit, TemplateRef, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, takeUntil, tap } from 'rxjs/operators';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { SetupStepNavComponent } from '../../../shared/components/setup-step-nav/setup-step-nav.component';
import { toFieldErrors } from '../../../core/api/field-errors.model';
import { CompanyProfileService } from './company-profile.service';
import { SetupService } from '../../setup.service';
import { SetupInspectorService, SetupStepController } from '../../setup-inspector.service';
import { CompanyProfileRequest } from '../../models/company-profile.model';

const PHONE_PATTERN = /^[+]?[0-9]{10,15}$/;
const GSTIN_PATTERN = /^[0-9A-Z]{15}$/;

@Component({
  selector: 'app-company-profile-step',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, FieldErrorComponent, SetupStepNavComponent],
  template: `
    <div class="company-profile-step">
      <div class="company-profile-step__intro">
        <span *ngIf="mode !== 'settings'" class="step-eyebrow">
          <span class="step-eyebrow__rule"></span>
          <span class="step-eyebrow__label">{{ 'setup.companyProfile.stepEyebrowLabel' | translate: { number: stepNumber, count: stepCount } }}</span>
          <span class="step-eyebrow__rule"></span>
        </span>
        <h1 class="company-profile-step__title">{{ 'setup.steps.companyProfile' | translate }}</h1>
        <p class="company-profile-step__subtitle">{{ 'setup.companyProfile.subtitle' | translate }}</p>
      </div>

      <form class="card company-profile-step__card" [formGroup]="form">
        <section class="company-profile-step__section">
          <h2 class="company-profile-step__section-title">
            <span class="material-symbols-outlined">info</span>
            {{ 'setup.companyProfile.sections.generalInfo' | translate }}
          </h2>

          <div class="company-profile-step__row">
            <label>
              {{ 'setup.companyProfile.displayNameLabel' | translate }}
              <input type="text" formControlName="displayName" (blur)="markTouched('displayName')" />
            </label>
            <label>
              {{ 'setup.companyProfile.legalNameLabel' | translate }}
              <input type="text" formControlName="legalName" (blur)="markTouched('legalName')" />
            </label>
          </div>
          <div class="company-profile-step__field-errors">
            <app-field-error [message]="fieldError('displayName')"></app-field-error>
            <app-field-error [message]="fieldError('legalName')"></app-field-error>
          </div>

          <label class="company-profile-step__gst-label">
            {{ 'setup.companyProfile.registrationNumberLabel' | translate }}
            <div class="company-profile-step__gst-input">
              <input type="text" formControlName="registrationNumber" (blur)="markTouched('registrationNumber')" />
              <span
                class="material-symbols-outlined company-profile-step__gst-badge"
                [attr.aria-label]="'setup.companyProfile.gstBadgeLabel' | translate"
              >verified</span>
            </div>
          </label>
          <app-field-error [message]="fieldError('registrationNumber')"></app-field-error>
        </section>

        <section class="company-profile-step__section">
          <h2 class="company-profile-step__section-title">
            <span class="material-symbols-outlined">contact_mail</span>
            {{ 'setup.companyProfile.sections.pointOfContact' | translate }}
          </h2>

          <label>
            {{ 'setup.companyProfile.contactNameLabel' | translate }}
            <input type="text" formControlName="contactName" (blur)="markTouched('contactName')" />
          </label>
          <app-field-error [message]="fieldError('contactName')"></app-field-error>

          <div class="company-profile-step__row">
            <label>
              {{ 'setup.companyProfile.contactEmailLabel' | translate }}
              <input type="email" formControlName="contactEmail" (blur)="markTouched('contactEmail')" />
            </label>
            <label>
              {{ 'setup.companyProfile.contactPhoneLabel' | translate }}
              <input type="tel" formControlName="contactPhone" (blur)="markTouched('contactPhone')" />
            </label>
          </div>
          <div class="company-profile-step__field-errors">
            <app-field-error [message]="fieldError('contactEmail')"></app-field-error>
            <app-field-error [message]="fieldError('contactPhone')"></app-field-error>
          </div>
        </section>

        <section class="company-profile-step__section">
          <h2 class="company-profile-step__section-title">
            <span class="material-symbols-outlined">location_on</span>
            {{ 'setup.companyProfile.registeredAddressLabel' | translate }}
          </h2>

          <label>
            {{ 'setup.companyProfile.registeredAddressLabel' | translate }}
            <textarea formControlName="registeredAddress" (blur)="markTouched('registeredAddress')"></textarea>
          </label>
          <app-field-error [message]="fieldError('registeredAddress')"></app-field-error>
        </section>

        <app-setup-step-nav *ngIf="mode === 'settings'" [savedJustNow]="savedJustNow" [mode]="mode"></app-setup-step-nav>
      </form>
    </div>

    <ng-template #inspectorTpl>
      <div class="company-profile-step__aside-column">
        <div class="company-profile-step__intro company-profile-step__intro--spacer" aria-hidden="true">
          <span class="step-eyebrow">
            <span class="step-eyebrow__rule"></span>
            <span class="step-eyebrow__label">{{ 'setup.companyProfile.stepEyebrowLabel' | translate: { number: stepNumber, count: stepCount } }}</span>
            <span class="step-eyebrow__rule"></span>
          </span>
          <h1 class="company-profile-step__title">{{ 'setup.steps.companyProfile' | translate }}</h1>
          <p class="company-profile-step__subtitle">{{ 'setup.companyProfile.subtitle' | translate }}</p>
        </div>

        <div class="company-profile-step__preview">
          <div class="seal-card">
            <div class="seal-card__hairline seal-card__hairline--top"></div>
            <div class="seal-card__body">
              <div class="seal-card__header">
                <span class="seal-card__header-rule"></span>
                <span class="seal-card__header-label">{{ 'setup.companyProfile.previewTitle' | translate }}</span>
                <span class="seal-card__header-rule"></span>
              </div>

              <h2 class="seal-card__figure">{{ form.value.displayName || ('setup.companyProfile.previewPlaceholderName' | translate) }}</h2>
              <p class="seal-card__legal">{{ form.value.legalName }}</p>

              <div class="seal-card__details">
                <p>{{ form.value.contactPhone }}</p>
                <p>{{ form.value.contactEmail }}</p>
                <p>{{ form.value.registeredAddress }}</p>
              </div>

              <ng-container *ngIf="form.value.registrationNumber">
                <div class="seal-card__divider"></div>
                <div class="seal-card__footer">
                  <p class="seal-card__footer-note">{{ 'setup.companyProfile.gstBadgeLabel' | translate }}</p>
                  <span class="seal-card__footer-value">{{ form.value.registrationNumber }}</span>
                </div>
              </ng-container>
            </div>
            <div class="seal-card__hairline seal-card__hairline--bottom"></div>
          </div>
        </div>
      </div>
    </ng-template>
  `
})
export class CompanyProfileStepComponent implements OnInit, AfterViewInit, OnDestroy, SetupStepController {
  private fb = inject(FormBuilder);
  private companyProfileService = inject(CompanyProfileService);
  private setupService = inject(SetupService);
  private inspectorService = inject(SetupInspectorService);
  private translate = inject(TranslateService);
  private route = inject(ActivatedRoute);
  private destroyed$ = new Subject<void>();
  private profileSubscription?: Subscription;

  @ViewChild('inspectorTpl') private inspectorTpl!: TemplateRef<unknown>;

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
  stepNumber = 1;
  stepCount = 1;
  readonly previousPath = this.setupService.previousStepPath('companyProfile');
  readonly nextPath = this.setupService.nextStepPath('companyProfile');
  private serverFieldErrors: Record<string, string> = {};

  ngOnInit(): void {
    this.mode = (this.route.snapshot.data['mode'] as 'setup' | 'settings') ?? 'setup';
    this.profileSubscription = this.companyProfileService.getProfile().subscribe(profile => {
      this.form.patchValue(profile, { emitEvent: false });
    });

    this.setupService
      .getState()
      .pipe(takeUntil(this.destroyed$))
      .subscribe(state => {
        const step = state.steps.find(s => s.key === 'companyProfile');
        this.stepNumber = step?.number ?? 1;
        this.stepCount = state.steps.length;
      });

    // GSTIN is canonically uppercase; users routinely type it lowercase. Without normalizing here,
    // a lowercase entry fails the uppercase-only pattern (matching the backend's), which fails
    // form.valid, which silently blocks the debounced autosave below for every field -- not just
    // this one.
    this.form.get('registrationNumber')?.valueChanges.pipe(takeUntil(this.destroyed$)).subscribe(value => {
      const upper = (value ?? '').toUpperCase();
      if (upper !== value) {
        this.form.get('registrationNumber')?.setValue(upper, { emitEvent: false });
      }
    });

    this.form.valueChanges
      .pipe(
        takeUntil(this.destroyed$),
        // Marked here (rather than relying solely on Angular's own dirty tracking) so a value
        // set programmatically -- not just one typed into a native input -- still counts as a
        // pending change flushPendingSave() needs to catch before navigation discards it.
        tap(() => this.form.markAsDirty()),
        debounceTime(400)
      )
      .subscribe(() => {
        this.savedJustNow = false;
        this.inspectorService.setSaved(false);
        // form.dirty is also checked (not just .valid): debounceTime emits its last buffered
        // value immediately when its source completes (e.g. destroyed$ firing on navigation),
        // even if flushPendingSave() already saved this exact value moments earlier and marked
        // the form pristine -- without this check that would fire a redundant duplicate PUT.
        if (this.form.dirty && this.form.valid) {
          this.save();
        }
      });

    this.inspectorService.registerStep(this);
  }

  ngAfterViewInit(): void {
    if (this.mode === 'setup') {
      this.inspectorService.register(this.inspectorTpl, { hideFooter: false });
    }
  }

  // SetupStepController: lets SetupStepNavComponent flush an edit still sitting in the 400ms
  // autosave debounce before it navigates away (Next/Save otherwise race the debounce and can
  // discard the change).
  flushPendingSave(): void {
    if (this.form.dirty && this.form.valid) {
      this.save();
    }
  }

  // SetupStepController: lets SetupStepNavComponent block Next instead of silently discarding
  // an invalid required field (e.g. a bad GSTIN/phone).
  isStepValid(): boolean {
    return this.form.valid;
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
    this.profileSubscription?.unsubscribe();
    this.inspectorService.clear();
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
    this.form.markAsPristine();
    const request = this.form.getRawValue() as CompanyProfileRequest;
    this.companyProfileService.updateProfile(request).subscribe({
      next: () => {
        this.serverFieldErrors = {};
        this.savedJustNow = true;
        this.inspectorService.setSaved(true);
        this.setupService.refresh();
      },
      error: err => {
        // Re-mark dirty: the optimistic markAsPristine() above assumed this save would
        // succeed. A failed save (e.g. a duplicate GSTIN the client regex doesn't catch) still
        // has an unsaved edit sitting in the form -- without this, a subsequent flush or
        // debounce sees a pristine form and silently does nothing, so the failed edit gets lost
        // on the very next Next click.
        this.form.markAsDirty();
        this.serverFieldErrors = toFieldErrors(err);
        this.savedJustNow = false;
        this.inspectorService.setSaved(false);
      }
    });
  }
}
