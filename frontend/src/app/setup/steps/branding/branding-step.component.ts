import { AfterViewInit, Component, ElementRef, Input, OnDestroy, OnInit, TemplateRef, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
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
import { SetupInspectorService } from '../../setup-inspector.service';
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
    <div class="branding-step">
      <div class="branding-step__intro" #introEl>
        <span class="branding-step__eyebrow">
          {{ 'setup.branding.stepEyebrowLabel' | translate: { number: stepNumber, count: stepCount } }}
        </span>
        <h1 class="branding-step__title">{{ 'setup.steps.branding' | translate }}</h1>
        <p class="branding-step__subtitle">{{ 'setup.branding.subtitle' | translate }}</p>
      </div>

      <form class="card branding-step__card" [formGroup]="form" #formCard>
        <section class="branding-step__section">
          <h2 class="branding-step__section-title">
            <span class="material-symbols-outlined">image</span>
            {{ 'setup.branding.sections.brandAssets' | translate }}
          </h2>

          <div class="branding-step__logo-row">
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
          </div>
        </section>

        <section class="branding-step__section">
          <h2 class="branding-step__section-title">
            <span class="material-symbols-outlined">palette</span>
            {{ 'setup.branding.sections.themeColors' | translate }}
          </h2>

          <div class="branding-step__row">
            <app-color-field
              [label]="'setup.branding.primaryColorLabel' | translate"
              [value]="form.value.primaryColor || '#7C3AED'"
              (valueChange)="setColor('primaryColor', $event)"
            ></app-color-field>

            <app-color-field
              [label]="'setup.branding.secondaryColorLabel' | translate"
              [value]="form.value.secondaryColor || '#22D3EE'"
              (valueChange)="setColor('secondaryColor', $event)"
            ></app-color-field>
          </div>

          <app-inline-banner *ngIf="contrastWarning" tone="warning">
            {{ 'setup.branding.contrastWarning' | translate }}
          </app-inline-banner>
        </section>

        <section class="branding-step__section">
          <h2 class="branding-step__section-title">
            <span class="material-symbols-outlined">format_quote</span>
            {{ 'setup.branding.sections.tagline' | translate }}
          </h2>

          <label>
            {{ 'setup.branding.taglineLabel' | translate }}
            <div class="branding-step__tagline-input">
              <input type="text" formControlName="tagline" [maxlength]="taglineMaxLength" />
              <span class="branding-step__counter">{{ form.value.tagline?.length || 0 }}/{{ taglineMaxLength }}</span>
            </div>
          </label>
          <app-field-error [message]="fieldError('tagline')"></app-field-error>
        </section>

        <app-setup-step-nav *ngIf="mode === 'settings'" [savedJustNow]="savedJustNow" [mode]="mode"></app-setup-step-nav>
      </form>
    </div>

    <ng-template #inspectorTpl>
      <div class="branding-step__aside-column">
        <div class="branding-step__intro branding-step__intro--spacer" aria-hidden="true" #introSpacerEl>
          <span class="branding-step__eyebrow">
            {{ 'setup.branding.stepEyebrowLabel' | translate: { number: stepNumber, count: stepCount } }}
          </span>
          <h1 class="branding-step__title">{{ 'setup.steps.branding' | translate }}</h1>
          <p class="branding-step__subtitle">{{ 'setup.branding.subtitle' | translate }}</p>
        </div>

        <div class="card branding-step__preview" #previewCard>
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
    </ng-template>
  `
})
export class BrandingStepComponent implements OnInit, AfterViewInit, OnDestroy {
  private fb = inject(FormBuilder);
  brandingService = inject(BrandingService);
  private setupService = inject(SetupService);
  private inspectorService = inject(SetupInspectorService);
  private themeService = inject(ThemeService);
  private translate = inject(TranslateService);
  private route = inject(ActivatedRoute);
  private destroyed$ = new Subject<void>();
  private brandingSubscription?: Subscription;

  @ViewChild('previewContainer') previewContainer!: ElementRef<HTMLElement>;
  @ViewChild('inspectorTpl') private inspectorTpl!: TemplateRef<unknown>;
  @ViewChild('introEl') private introEl!: ElementRef<HTMLElement>;
  @ViewChild('introSpacerEl') private introSpacerEl!: ElementRef<HTMLElement>;
  @ViewChild('formCard') private formCard!: ElementRef<HTMLElement>;
  @ViewChild('previewCard') private previewCard!: ElementRef<HTMLElement>;
  private sizeObserver?: ResizeObserver;

  readonly taglineMaxLength = TAGLINE_MAX_LENGTH;

  form = this.fb.group({
    primaryColor: ['#7C3AED', [Validators.required, Validators.pattern(HEX_COLOR_PATTERN)]],
    secondaryColor: ['#22D3EE', [Validators.required, Validators.pattern(HEX_COLOR_PATTERN)]],
    tagline: ['', Validators.maxLength(TAGLINE_MAX_LENGTH)]
  });

  @Input() mode: 'setup' | 'settings' = 'setup';

  branding: CompanyBrandingResponse | null = null;
  savedJustNow = false;
  contrastWarning = false;
  stepNumber = 1;
  stepCount = 1;
  private serverFieldErrors: Record<string, string> = {};
  private logoErrors: Record<LogoVariant, string | undefined> = { square: undefined, wide: undefined };

  ngOnInit(): void {
    this.mode = (this.route.snapshot.data['mode'] as 'setup' | 'settings') ?? 'setup';
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
      // By this point the aside has stamped #inspectorTpl (same timing paintPreview above
      // relies on for #previewContainer), so the aside-only refs below are resolved too.
      this.setupSizeSync();
    });

    this.setupService
      .getState()
      .pipe(takeUntil(this.destroyed$))
      .subscribe(state => {
        const step = state.steps.find(s => s.key === 'branding');
        this.stepNumber = step?.number ?? 1;
        this.stepCount = state.steps.length;
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
      this.inspectorService.setSaved(false);
      if (this.form.valid) {
        this.save();
      }
    });
  }

  ngAfterViewInit(): void {
    if (this.mode === 'setup') {
      // hideFooter: false -- the aside only holds the Live Login Preview here (no nav), so the
      // shared setup-shell footer stays visible and handles Previous/Next/Saved, matching the
      // Stitch mockup's shared bottom bar instead of duplicating nav inside the narrow aside.
      this.inspectorService.register(this.inspectorTpl, { hideFooter: false });
    }
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
    this.brandingSubscription?.unsubscribe();
    this.inspectorService.clear();
    this.sizeObserver?.disconnect();
  }

  // Keeps the aside's Live Login Preview card pixel-matched to the form card, and the invisible
  // intro spacer above it pixel-matched to the real intro -- both live in a separate, narrower
  // column (the shared inspector aside), so CSS alone can't make them track a sibling's size.
  // Observes both source elements so any height change (contrast banner appearing, a field
  // error, window resize, translation length) re-syncs instead of drifting.
  private setupSizeSync(): void {
    if (this.sizeObserver || this.mode !== 'setup' || !this.formCard || !this.introEl) {
      return;
    }
    this.sizeObserver = new ResizeObserver(() => {
      if (this.introSpacerEl) {
        this.introSpacerEl.nativeElement.style.height = `${this.introEl.nativeElement.offsetHeight}px`;
      }
      if (this.previewCard) {
        this.previewCard.nativeElement.style.height = `${this.formCard.nativeElement.offsetHeight}px`;
      }
    });
    this.sizeObserver.observe(this.formCard.nativeElement);
    this.sizeObserver.observe(this.introEl.nativeElement);
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
        this.inspectorService.setSaved(true);
        this.themeService.apply(request.primaryColor, request.secondaryColor);
        this.setupService.refresh();
      },
      error: err => {
        this.serverFieldErrors = toFieldErrors(err);
        this.savedJustNow = false;
        this.inspectorService.setSaved(false);
      }
    });
  }
}
