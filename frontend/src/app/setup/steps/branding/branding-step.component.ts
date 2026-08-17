import { AfterViewInit, Component, ElementRef, Input, OnDestroy, OnInit, TemplateRef, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, takeUntil, tap } from 'rxjs/operators';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { ColorFieldComponent } from '../../../shared/components/color-field/color-field.component';
import { LogoUploaderComponent } from '../../../shared/components/logo-uploader/logo-uploader.component';
import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';
import { SetupStepNavComponent } from '../../../shared/components/setup-step-nav/setup-step-nav.component';
import { toFieldErrors } from '../../../core/api/field-errors.model';
import { ThemeService, contrastRatio, currentBrandPrimary, currentBrandSecondary } from '../../../core/theme/theme.service';
import { BrandingService } from './branding.service';
import { SetupService } from '../../setup.service';
import { SetupInspectorService, SetupStepController } from '../../setup-inspector.service';
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
        <span *ngIf="mode !== 'settings'" class="step-eyebrow">
          <span class="step-eyebrow__rule"></span>
          <span class="step-eyebrow__label">{{ 'setup.branding.stepEyebrowLabel' | translate: { number: stepNumber, count: stepCount } }}</span>
          <span class="step-eyebrow__rule"></span>
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
              [value]="form.value.primaryColor || defaultPrimaryColor"
              (valueChange)="setColor('primaryColor', $event)"
            ></app-color-field>

            <app-color-field
              [label]="'setup.branding.secondaryColorLabel' | translate"
              [value]="form.value.secondaryColor || defaultSecondaryColor"
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
          <span class="step-eyebrow">
            <span class="step-eyebrow__rule"></span>
            <span class="step-eyebrow__label">{{ 'setup.branding.stepEyebrowLabel' | translate: { number: stepNumber, count: stepCount } }}</span>
            <span class="step-eyebrow__rule"></span>
          </span>
          <h1 class="branding-step__title">{{ 'setup.steps.branding' | translate }}</h1>
          <p class="branding-step__subtitle">{{ 'setup.branding.subtitle' | translate }}</p>
        </div>

        <div class="card branding-step__preview" #previewCard>
          <div class="branding-step__preview-frame">
            <div class="branding-step__preview-frame-inner">
              <span class="step-eyebrow branding-step__preview-label">
                <span class="step-eyebrow__rule"></span>
                <span class="step-eyebrow__label">{{ 'setup.branding.loginPreviewTitle' | translate }}</span>
                <span class="step-eyebrow__rule"></span>
              </span>
              <div #previewContainer class="branding-step__login-preview">
                <div #previewScale class="branding-step__login-preview-scale">
                  <div #previewScaleInner class="branding-step__login-preview-scale-inner">
                    <app-login
                      [previewMode]="true"
                      [tagline]="form.value.tagline || null"
                      [hasSquareLogo]="branding?.hasSquareLogo || false"
                    ></app-login>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ng-template>
  `
})
export class BrandingStepComponent implements OnInit, AfterViewInit, OnDestroy, SetupStepController {
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
  @ViewChild('previewScale') private previewScale!: ElementRef<HTMLElement>;
  @ViewChild('previewScaleInner') private previewScaleInner!: ElementRef<HTMLElement>;
  @ViewChild('inspectorTpl') private inspectorTpl!: TemplateRef<unknown>;
  @ViewChild('introEl') private introEl!: ElementRef<HTMLElement>;
  @ViewChild('introSpacerEl') private introSpacerEl!: ElementRef<HTMLElement>;
  @ViewChild('formCard') private formCard!: ElementRef<HTMLElement>;
  @ViewChild('previewCard') private previewCard!: ElementRef<HTMLElement>;
  private sizeObserver?: ResizeObserver;
  private previewScaleObserver?: ResizeObserver;

  readonly taglineMaxLength = TAGLINE_MAX_LENGTH;
  // No hardcoded hex here -- read from the CSS custom properties _tokens.scss sets from
  // DESIGN.md, so this form's pre-fetch default always tracks the documented brand default
  // instead of a second, driftable copy of it.
  readonly defaultPrimaryColor = currentBrandPrimary();
  readonly defaultSecondaryColor = currentBrandSecondary();

  form = this.fb.group({
    primaryColor: [this.defaultPrimaryColor, [Validators.required, Validators.pattern(HEX_COLOR_PATTERN)]],
    secondaryColor: [this.defaultSecondaryColor, [Validators.required, Validators.pattern(HEX_COLOR_PATTERN)]],
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
    this.form.valueChanges
      .pipe(
        takeUntil(this.destroyed$),
        // Marked here rather than relying solely on Angular's own dirty tracking -- primaryColor/
        // secondaryColor are set programmatically via setColor() (the color picker's output), not
        // typed into a native input, so they never mark the control dirty on their own.
        tap(() => this.form.markAsDirty()),
        debounceTime(400)
      )
      .subscribe(() => {
        this.savedJustNow = false;
        this.inspectorService.setSaved(false);
        // form.dirty is also checked: debounceTime flushes its last buffered value immediately
        // when its source completes (e.g. destroyed$ on navigation) even if flushPendingSave()
        // already saved this value and marked the form pristine moments earlier -- without this
        // check that would fire a redundant duplicate PUT.
        if (this.form.dirty && this.form.valid) {
          this.save();
        }
      });

    this.inspectorService.registerStep(this);
  }

  ngAfterViewInit(): void {
    if (this.mode === 'setup') {
      // hideFooter: false -- the aside only holds the Live Login Preview here (no nav), so the
      // shared setup-shell footer stays visible and handles Previous/Next/Saved, matching the
      // Stitch mockup's shared bottom bar instead of duplicating nav inside the narrow aside.
      this.inspectorService.register(this.inspectorTpl, { hideFooter: false });
    }
  }

  // SetupStepController: lets SetupStepNavComponent flush an edit still sitting in the 400ms
  // autosave debounce before it navigates away.
  flushPendingSave(): void {
    if (this.form.dirty && this.form.valid) {
      this.save();
    }
  }

  // SetupStepController: lets SetupStepNavComponent block Next on an invalid required field.
  isStepValid(): boolean {
    return this.form.valid;
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
    this.brandingSubscription?.unsubscribe();
    this.inspectorService.clear();
    this.sizeObserver?.disconnect();
    this.previewScaleObserver?.disconnect();
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
        // Clamp to the aside column's own available height (already excludes the floating
        // footer's clearance padding, see .setup-inspector-aside) -- matching formCard's height
        // unconditionally let a tall form (e.g. a taller logo tile) push the preview card past
        // the visible aside area and under the fixed Previous/Next buttons. The login preview's
        // own scale-to-fit (syncPreviewScale) shrinks further to whatever height this leaves it.
        const desired = this.formCard.nativeElement.offsetHeight;
        const asideColumn = this.previewCard.nativeElement.parentElement;
        const introSpacerHeight = this.introSpacerEl?.nativeElement.offsetHeight ?? 0;
        const asideGap = 16; // .branding-step__aside-column's gap: 1rem
        const available = asideColumn ? asideColumn.clientHeight - introSpacerHeight - asideGap : desired;
        this.previewCard.nativeElement.style.height = `${Math.min(desired, Math.max(available, 0))}px`;
      }
    });
    this.sizeObserver.observe(this.formCard.nativeElement);
    this.sizeObserver.observe(this.introEl.nativeElement);

    // The card above sets #previewContainer's own available height (via the flex chain rooted
    // at #previewCard); re-scale the login preview whenever that available height itself
    // changes, so a short branding form never forces the login card to scroll or crop -- it
    // shrinks uniformly (never enlarges past 1:1) to always show the full card, brand header
    // included.
    if (this.previewContainer && this.previewScale && this.previewScaleInner) {
      this.previewScaleObserver = new ResizeObserver(() => this.syncPreviewScale());
      this.previewScaleObserver.observe(this.previewContainer.nativeElement);
    }
  }

  private syncPreviewScale(): void {
    const sizer = this.previewScale?.nativeElement;
    const inner = this.previewScaleInner?.nativeElement;
    const container = this.previewContainer?.nativeElement;
    if (!sizer || !inner || !container) {
      return;
    }

    inner.style.transform = 'none';
    inner.style.width = '';
    sizer.style.width = '';
    sizer.style.height = '';

    const naturalWidth = inner.offsetWidth;
    const naturalHeight = inner.offsetHeight;
    if (!naturalWidth || !naturalHeight) {
      return;
    }

    const scale = Math.min(1, container.clientWidth / naturalWidth, container.clientHeight / naturalHeight);

    inner.style.width = `${naturalWidth}px`;
    inner.style.transform = `scale(${scale})`;
    sizer.style.width = `${naturalWidth * scale}px`;
    sizer.style.height = `${naturalHeight * scale}px`;
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
    this.form.markAsPristine();
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
        // Re-mark dirty: see the matching comment in company-profile-step.component.ts's save()
        // error handler -- a failed save must not leave the form looking pristine.
        this.form.markAsDirty();
        this.serverFieldErrors = toFieldErrors(err);
        this.savedJustNow = false;
        this.inspectorService.setSaved(false);
      }
    });
  }
}
