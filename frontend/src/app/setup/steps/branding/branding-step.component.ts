import { Component, ElementRef, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { ColorFieldComponent } from '../../../shared/components/color-field/color-field.component';
import { LogoUploaderComponent } from '../../../shared/components/logo-uploader/logo-uploader.component';
import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';
import { SetupStepNavComponent } from '../../../shared/components/setup-step-nav/setup-step-nav.component';
import { toFieldErrors } from '../../../core/api/field-errors.model';
import { ThemeService, contrastRatio } from '../../../core/theme/theme.service';
import { BrandingService } from './branding.service';
import { SetupService } from '../../setup.service';
import { CompanyBrandingRequest, CompanyBrandingResponse, LogoVariant } from '../../models/branding.model';
import { LoginComponent } from '../../../auth/login.component';

const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const TAGLINE_MAX_LENGTH = 60;
// Must match theme.service.ts's WHITE/INK constants -- the contrast warning uses the same
// pair ThemeService itself checks when choosing --brand-primary-contrast.
const WHITE = '#FFFFFF';
const INK = '#0B1020';
const MIN_CONTRAST = 4.5;

@Component({
  selector: 'app-branding-step',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    FieldErrorComponent,
    ColorFieldComponent,
    LogoUploaderComponent,
    InlineBannerComponent,
    SetupStepNavComponent,
    LoginComponent
  ],
  template: `
    <div class="branding-step step-grid">
      <form class="card" [formGroup]="form">
        <h1 class="card-title">{{ 'setup.steps.branding' | translate }}</h1>

        <app-color-field
          [label]="'setup.branding.primaryColorLabel' | translate"
          [value]="form.value.primaryColor || '#7C3AED'"
          (valueChange)="setColor('primaryColor', $event)"
        ></app-color-field>

        <app-inline-banner *ngIf="contrastWarning" tone="warning">
          {{ 'setup.branding.contrastWarning' | translate }}
        </app-inline-banner>

        <app-color-field
          [label]="'setup.branding.secondaryColorLabel' | translate"
          [value]="form.value.secondaryColor || '#22D3EE'"
          (valueChange)="setColor('secondaryColor', $event)"
        ></app-color-field>

        <label>
          {{ 'setup.branding.taglineLabel' | translate }}
          <input type="text" formControlName="tagline" [maxlength]="taglineMaxLength" />
        </label>
        <div class="branding-step__counter">{{ form.value.tagline?.length || 0 }}/{{ taglineMaxLength }}</div>
        <app-field-error [message]="fieldError('tagline')"></app-field-error>

        <app-logo-uploader
          [label]="'setup.branding.squareLogoLabel' | translate"
          variant="square"
          [hasLogo]="branding?.hasSquareLogo || false"
          [logoUrl]="brandingService.logoUrl('square')"
          [placeholderText]="'setup.branding.squareLogoLabel' | translate"
          [uploadLabel]="'setup.branding.uploadLabel' | translate"
          [changeLabel]="'setup.branding.changeLabel' | translate"
          [error]="logoError('square')"
          (fileSelected)="onLogoSelected('square', $event)"
        ></app-logo-uploader>

        <app-logo-uploader
          [label]="'setup.branding.wideLogoLabel' | translate"
          variant="wide"
          [hasLogo]="branding?.hasWideLogo || false"
          [logoUrl]="brandingService.logoUrl('wide')"
          [placeholderText]="'setup.branding.wideLogoLabel' | translate"
          [uploadLabel]="'setup.branding.uploadLabel' | translate"
          [changeLabel]="'setup.branding.changeLabel' | translate"
          [error]="logoError('wide')"
          (fileSelected)="onLogoSelected('wide', $event)"
        ></app-logo-uploader>

        <app-setup-step-nav [previousPath]="previousPath" [nextPath]="nextPath" [savedJustNow]="savedJustNow"></app-setup-step-nav>
      </form>

      <div class="card branding-step__preview">
        <p class="card-subtitle">{{ 'setup.branding.loginPreviewTitle' | translate }}</p>
        <div #previewContainer class="branding-step__login-preview">
          <app-login
            [previewMode]="true"
            [tagline]="form.value.tagline || null"
            [hasSquareLogo]="branding?.hasSquareLogo || false"
          ></app-login>
        </div>
      </div>
    </div>
  `
})
export class BrandingStepComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  brandingService = inject(BrandingService);
  private setupService = inject(SetupService);
  private themeService = inject(ThemeService);
  private translate = inject(TranslateService);
  private destroyed$ = new Subject<void>();
  private brandingSubscription?: Subscription;

  @ViewChild('previewContainer') previewContainer!: ElementRef<HTMLElement>;

  readonly taglineMaxLength = TAGLINE_MAX_LENGTH;

  form = this.fb.group({
    primaryColor: ['#7C3AED', [Validators.required, Validators.pattern(HEX_COLOR_PATTERN)]],
    secondaryColor: ['#22D3EE', [Validators.required, Validators.pattern(HEX_COLOR_PATTERN)]],
    tagline: ['', Validators.maxLength(TAGLINE_MAX_LENGTH)]
  });

  branding: CompanyBrandingResponse | null = null;
  savedJustNow = false;
  contrastWarning = false;
  readonly previousPath = this.setupService.previousStepPath('branding');
  readonly nextPath = this.setupService.nextStepPath('branding');
  private serverFieldErrors: Record<string, string> = {};
  private logoErrors: Record<LogoVariant, string | undefined> = { square: undefined, wide: undefined };

  ngOnInit(): void {
    this.brandingSubscription = this.brandingService.getBranding().subscribe(branding => {
      this.branding = branding;
      this.form.patchValue(
        { primaryColor: branding.primaryColor, secondaryColor: branding.secondaryColor, tagline: branding.tagline },
        { emitEvent: false }
      );
      // patchValue with emitEvent:false suppresses both the preview and the debounced-save
      // arms below -- so the initial preview paint needs this explicit one-time call.
      this.paintPreview(branding.primaryColor, branding.secondaryColor);
      this.updateContrastWarning(branding.primaryColor);
    });

    // Undebounced: instant, local-only preview repaint, no network.
    this.form.valueChanges.pipe(takeUntil(this.destroyed$)).subscribe(value => {
      if (value.primaryColor && HEX_COLOR_PATTERN.test(value.primaryColor)) {
        this.updateContrastWarning(value.primaryColor);
      }
      if (
        value.primaryColor && HEX_COLOR_PATTERN.test(value.primaryColor) &&
        value.secondaryColor && HEX_COLOR_PATTERN.test(value.secondaryColor)
      ) {
        this.paintPreview(value.primaryColor, value.secondaryColor);
      }
    });

    // Debounced: same cadence as the company-profile step's autosave.
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
    this.brandingSubscription?.unsubscribe();
  }

  setColor(control: 'primaryColor' | 'secondaryColor', value: string): void {
    this.form.get(control)?.setValue(value);
  }

  fieldError(name: string): string | undefined {
    if (this.serverFieldErrors[name]) {
      return this.serverFieldErrors[name];
    }
    const control = this.form.get(name);
    if (!control || !control.touched || !control.errors) {
      return undefined;
    }
    if (control.errors['maxlength']) {
      return this.translate.instant('setup.branding.validation.taglineTooLong');
    }
    if (control.errors['pattern']) {
      return this.translate.instant('setup.branding.validation.hexColor');
    }
    return undefined;
  }

  logoError(variant: LogoVariant): string | undefined {
    return this.logoErrors[variant];
  }

  onLogoSelected(variant: LogoVariant, file: File): void {
    this.logoErrors[variant] = undefined;
    this.brandingService.uploadLogo(variant, file).subscribe({
      next: () => {
        this.brandingService.getBranding().subscribe(branding => {
          this.branding = branding;
          this.setupService.refresh();
        });
      },
      error: err => {
        this.logoErrors[variant] = err.error?.error ?? this.translate.instant('setup.branding.validation.unsupportedFileType');
      }
    });
  }

  private paintPreview(primary: string, secondary: string): void {
    if (this.previewContainer) {
      this.themeService.apply(primary, secondary, this.previewContainer.nativeElement);
    }
  }

  private updateContrastWarning(primary: string): void {
    const best = Math.max(contrastRatio(WHITE, primary), contrastRatio(INK, primary));
    this.contrastWarning = best < MIN_CONTRAST;
  }

  private save(): void {
    const request = this.form.getRawValue() as CompanyBrandingRequest;
    this.brandingService.updateBranding(request).subscribe({
      next: () => {
        this.serverFieldErrors = {};
        this.savedJustNow = true;
        this.themeService.apply(request.primaryColor, request.secondaryColor);
        this.setupService.refresh();
      },
      error: err => {
        this.serverFieldErrors = toFieldErrors(err);
        this.savedJustNow = false;
      }
    });
  }
}
