import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, ReactiveFormsModule, FormBuilder, ValidationErrors, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AdminService } from './admin.service';
import { CreateAssociateResponse } from './models/create-associate-response.model';
import { AssociateSummary } from './models/associate-summary.model';
import { toFieldErrors } from '../core/api/field-errors.model';
import { FieldErrorComponent } from '../shared/components/field-error/field-error.component';
import { InlineBannerComponent } from '../shared/components/inline-banner/inline-banner.component';
import { BrandButtonComponent } from '../shared/components/brand-button/brand-button.component';
import { ToggleGroupComponent, ToggleOption } from '../shared/components/toggle-group/toggle-group.component';

// A parent with no position is invisible to the per-leg associate counts the dashboard shows
// (AssociateRepository.countDownlineByPosition filters on position = 'L'/'R') while still being
// counted in totalDownline -- see AssociateProvisioningService's matching server-side guard.
function positionRequiredWhenParentSelectedValidator(group: AbstractControl): ValidationErrors | null {
  const parentId = group.get('parentId')?.value;
  const position = group.get('position')?.value;
  return parentId && !position ? { positionRequired: true } : null;
}

@Component({
  selector: 'app-create-associate',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    FieldErrorComponent,
    InlineBannerComponent,
    BrandButtonComponent,
    ToggleGroupComponent
  ],
  template: `
    <div class="create-associate">
      <div class="create-associate__intro">
        <span class="create-associate__eyebrow">{{ 'admin.eyebrowLabel' | translate }}</span>
        <h1 class="create-associate__title">
          {{ 'admin.createAssociateTitlePrefix' | translate }}
          <span class="create-associate__title-accent">{{ 'admin.createAssociateTitleAccent' | translate }}</span>
        </h1>
        <p class="create-associate__subtitle">{{ 'admin.createAssociateSubtitle' | translate }}</p>
      </div>

      <app-inline-banner *ngIf="created" tone="success">
        <p>
          {{ 'admin.assignedUserIdLabel' | translate }}:
          <strong>{{ created.userId }}</strong>
        </p>
        <p>
          {{ 'admin.temporaryPasswordLabel' | translate }}:
          <strong>{{ created.temporaryPassword }}</strong>
        </p>
        <p class="create-associate__banner-notice">{{ 'admin.temporaryPasswordNotice' | translate }}</p>
        <app-brand-button type="button" variant="secondary" (clicked)="dismissBanner()">
          {{ 'admin.doneButtonLabel' | translate }}
        </app-brand-button>
      </app-inline-banner>

      <app-inline-banner *ngIf="submitError" tone="danger">{{ submitError }}</app-inline-banner>

      <form class="card create-associate__form" [formGroup]="form" (ngSubmit)="onSubmit()">
        <div class="create-associate__row">
          <div class="create-associate__field">
            <label>{{ 'admin.nameLabel' | translate }}</label>
            <input type="text" formControlName="name" (blur)="markTouched('name')" />
            <app-field-error [message]="fieldError('name')"></app-field-error>
          </div>
          <div class="create-associate__field">
            <label>{{ 'admin.emailLabel' | translate }}</label>
            <input type="email" formControlName="email" (blur)="markTouched('email')" />
            <app-field-error [message]="fieldError('email')"></app-field-error>
          </div>
        </div>

        <div class="create-associate__row">
          <div class="create-associate__field">
            <div class="create-associate__field-header">
              <label>{{ 'admin.sponsorIdLabel' | translate }}</label>
              <span class="create-associate__optional-tag">{{ 'admin.optionalTagLabel' | translate }}</span>
            </div>
            <input type="text" formControlName="sponsorId" (blur)="markTouched('sponsorId')" />
            <app-field-error [message]="fieldError('sponsorId')"></app-field-error>
            <span class="create-associate__hint">{{ 'admin.sponsorIdHint' | translate }}</span>
          </div>
          <div class="create-associate__field">
            <div class="create-associate__field-header">
              <label>{{ 'admin.parentIdLabel' | translate }}</label>
              <span class="create-associate__optional-tag">{{ 'admin.optionalTagLabel' | translate }}</span>
            </div>
            <select formControlName="parentId" (blur)="markTouched('parentId')">
              <option value="">{{ 'admin.parentIdPlaceholder' | translate }}</option>
              <option *ngFor="let associate of associates" [value]="associate.id">
                {{ associate.userId }} — {{ associate.name }}
              </option>
            </select>
            <app-field-error [message]="fieldError('parentId')"></app-field-error>
            <span class="create-associate__hint">{{ 'admin.parentIdHint' | translate }}</span>
          </div>
        </div>

        <div class="create-associate__placement">
          <div class="create-associate__placement-header">
            <div class="create-associate__placement-copy">
              <h2>{{ 'admin.placementTitle' | translate }}</h2>
              <p>{{ 'admin.placementDescription' | translate }}</p>
            </div>
            <app-toggle-group
              [options]="placementOptions"
              [value]="form.value.position || null"
              (valueChange)="onPlacementSelect($event)"
            ></app-toggle-group>
          </div>
          <app-field-error [message]="positionRequiredMessage"></app-field-error>
        </div>

        <div class="create-associate__actions">
          <app-brand-button type="submit" variant="primary" [disabled]="form.invalid">
            {{ 'admin.submitButton' | translate }}
          </app-brand-button>
        </div>
      </form>

      <div class="create-associate__secondary">
        <div class="card create-associate__tree">
          <p class="card-subtitle">{{ 'admin.topologyLabel' | translate }}</p>
          <div class="create-associate__tree-parent">
            <span class="material-symbols-outlined">hub</span>
          </div>
          <div class="create-associate__tree-slots">
            <div
              class="create-associate__tree-slot"
              [class.create-associate__tree-slot--active]="form.value.position === 'L'"
            >
              <span class="create-associate__tree-slot-label">{{ 'admin.leftLabel' | translate }}</span>
              <span *ngIf="form.value.position === 'L'" class="create-associate__tree-slot-new">
                {{ 'admin.newNodeLabel' | translate }}
              </span>
            </div>
            <div
              class="create-associate__tree-slot"
              [class.create-associate__tree-slot--active]="form.value.position === 'R'"
            >
              <span class="create-associate__tree-slot-label">{{ 'admin.rightLabel' | translate }}</span>
              <span *ngIf="form.value.position === 'R'" class="create-associate__tree-slot-new">
                {{ 'admin.newNodeLabel' | translate }}
              </span>
            </div>
          </div>
        </div>
        <div class="card create-associate__help">
          <div class="create-associate__help-icon">
            <span class="material-symbols-outlined">account_tree</span>
          </div>
          <h2>{{ 'admin.helpTitle' | translate }}</h2>
          <p>{{ 'admin.helpBody' | translate }}</p>
        </div>
      </div>
    </div>
  `
})
export class CreateAssociateComponent implements OnInit {
  private fb = inject(FormBuilder);
  private adminService = inject(AdminService);
  private translate = inject(TranslateService);

  form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    sponsorId: [''],
    parentId: [''],
    position: ['']
  }, { validators: positionRequiredWhenParentSelectedValidator });

  created: CreateAssociateResponse | null = null;
  submitError: string | null = null;
  associates: AssociateSummary[] = [];
  attemptedSubmit = false;
  private serverFieldErrors: Record<string, string> = {};

  ngOnInit(): void {
    this.adminService.listAssociates().subscribe(associates => (this.associates = associates));
  }

  get placementOptions(): ToggleOption[] {
    return [
      { value: 'L', label: this.translate.instant('admin.leftLabel') },
      { value: 'R', label: this.translate.instant('admin.rightLabel') }
    ];
  }

  onPlacementSelect(value: string): void {
    this.form.patchValue({ position: value });
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
      return this.translate.instant('admin.validation.required');
    }
    if (control.errors['email']) {
      return this.translate.instant('admin.validation.invalidEmail');
    }
    return undefined;
  }

  get positionRequiredMessage(): string | undefined {
    if (this.attemptedSubmit && this.form.hasError('positionRequired')) {
      return this.translate.instant('admin.validation.positionRequired');
    }
    return undefined;
  }

  onSubmit(): void {
    this.serverFieldErrors = {};
    this.submitError = null;
    this.attemptedSubmit = true;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { name, email, sponsorId, parentId, position } = this.form.getRawValue();
    this.adminService
      .createAssociate({
        name,
        email,
        sponsorId: sponsorId || undefined,
        parentId: parentId || undefined,
        position: position || undefined
      })
      .subscribe({
        next: response => {
          this.created = response;
          this.serverFieldErrors = {};
          this.submitError = null;
          this.attemptedSubmit = false;
          this.form.reset();
        },
        error: (err: HttpErrorResponse) => {
          this.created = null;
          const fields = toFieldErrors(err);
          if (Object.keys(fields).length > 0) {
            this.serverFieldErrors = fields;
            return;
          }
          if (err.status === 409) {
            this.submitError = this.messageForConflict(err.error?.error);
          } else {
            this.submitError = this.translate.instant('admin.validation.genericSaveError');
          }
        }
      });
  }

  dismissBanner(): void {
    this.created = null;
  }

  private messageForConflict(backendMessage: string | undefined): string {
    if (backendMessage?.startsWith('Email already registered')) {
      return this.translate.instant('admin.validation.emailTaken');
    }
    if (backendMessage?.startsWith('Placement already occupied')) {
      return this.translate.instant('admin.validation.placementUnavailable');
    }
    if (backendMessage?.startsWith('Position is required')) {
      return this.translate.instant('admin.validation.positionRequired');
    }
    if (backendMessage === 'No rank tiers are configured; an associate cannot be created without a rank') {
      return this.translate.instant('admin.validation.noRankTiersConfigured');
    }
    return this.translate.instant('admin.validation.genericSaveError');
  }
}
