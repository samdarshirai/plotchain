import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AdminService } from '../admin.service';
import { AssociateSummary } from '../models/associate-summary.model';
import { CreateAssociateResponse } from '../models/create-associate-response.model';
import { toFieldErrors } from '../../core/api/field-errors.model';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { FieldErrorComponent } from '../../shared/components/field-error/field-error.component';
import { ToggleGroupComponent, ToggleOption } from '../../shared/components/toggle-group/toggle-group.component';

export interface PresetParent {
  parentId: string;
  leg: 'L' | 'R';
  parentUserId: string;
  parentName: string;
}

// Parent is mandatory once the tree has anyone to hang off of, but the very first associate is
// necessarily parentless -- so the parentId Validators.required is added only when sponsorOptions
// is non-empty (see ngOnInit). Position pairs with parent: required exactly when a parent is set.
function positionRequiredWhenParentSelectedValidator(group: AbstractControl): ValidationErrors | null {
  const parentId = group.get('parentId')?.value;
  const position = group.get('position')?.value;
  return parentId && !position ? { positionRequired: true } : null;
}

// The sole associate-provisioning UI, shared by the Associate Directory's "New Associate" button
// and Tree Explorer's click-a-vacant-slot flow. When opened with `presetParent` set, the parent
// node + Left/Right placement come from the slot the admin clicked (authoritative for that exact
// slot) rather than from a free pick, so the parent dropdown/toggle are hidden in favor of a
// read-only summary line -- letting the admin reconfirm placement would allow a mismatch.
@Component({
  selector: 'app-new-associate-panel',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, InlineBannerComponent, FieldErrorComponent, ToggleGroupComponent],
  template: `
    <div class="new-associate-panel__modal-overlay" *ngIf="open">
      <div class="new-associate-panel__modal">
        <ng-container *ngIf="provisioned as result; else provisionFormTemplate">
          <div class="new-associate-panel__modal-title">{{ 'admin.associateDirectory.provisionModalTitle' | translate }}</div>
          <app-inline-banner tone="success">
            <p>
              {{ 'admin.assignedUserIdLabel' | translate }}:
              <strong>{{ result.userId }}</strong>
            </p>
            <p>
              {{ 'admin.temporaryPasswordLabel' | translate }}:
              <strong>{{ result.temporaryPassword }}</strong>
            </p>
            <p class="new-associate-panel__modal-banner-notice">{{ 'admin.temporaryPasswordNotice' | translate }}</p>
          </app-inline-banner>
          <div class="new-associate-panel__modal-footer">
            <button type="button" class="new-associate-panel__modal-submit" (click)="finishProvisioning()">
              {{ 'admin.doneButtonLabel' | translate }}
            </button>
          </div>
        </ng-container>

        <ng-template #provisionFormTemplate>
          <div class="new-associate-panel__modal-title">{{ 'admin.associateDirectory.provisionModalTitle' | translate }}</div>
          <p class="new-associate-panel__modal-subtitle">{{ 'admin.associateDirectory.provisionModalSubtitle' | translate }}</p>

          <app-inline-banner *ngIf="provisionSubmitError" tone="danger">{{ provisionSubmitError }}</app-inline-banner>

          <form [formGroup]="provisionForm" (ngSubmit)="onProvisionSubmit()">
            <div class="new-associate-panel__modal-fields">
              <div class="new-associate-panel__modal-field">
                <label>{{ 'admin.nameLabel' | translate }}</label>
                <input
                  type="text"
                  formControlName="name"
                  [placeholder]="'admin.associateDirectory.fullNamePlaceholder' | translate"
                  (blur)="markProvisionTouched('name')"
                />
                <app-field-error [message]="provisionFieldError('name')"></app-field-error>
              </div>
              <div class="new-associate-panel__modal-field">
                <label>{{ 'admin.emailLabel' | translate }}</label>
                <input type="email" formControlName="email" (blur)="markProvisionTouched('email')" />
                <app-field-error [message]="provisionFieldError('email')"></app-field-error>
              </div>
              <div class="new-associate-panel__modal-field">
                <label>{{ 'admin.associateDirectory.phoneLabel' | translate }}</label>
                <input
                  type="tel"
                  formControlName="phone"
                  [placeholder]="'admin.associateDirectory.phonePlaceholder' | translate"
                />
              </div>
              <div class="new-associate-panel__modal-field">
                <label>{{ 'admin.associateDirectory.sponsorSearchLabel' | translate }}</label>
                <input
                  type="text"
                  formControlName="sponsorSearch"
                  [placeholder]="'admin.associateDirectory.sponsorSearchPlaceholder' | translate"
                  list="new-associate-panel-sponsor-options"
                  (input)="onSponsorSearchInput($any($event.target).value)"
                />
                <datalist id="new-associate-panel-sponsor-options">
                  <option *ngFor="let sponsor of sponsorOptions" [value]="sponsorLabel(sponsor)"></option>
                </datalist>
                <app-field-error [message]="sponsorFieldError()"></app-field-error>
              </div>

              <div class="new-associate-panel__preset-summary" *ngIf="presetParent">
                {{ 'admin.associateDirectory.placementLabel' | translate }}:
                <strong>{{ presetParent.parentUserId }} — {{ presetParent.parentName }}</strong>
                ({{ (presetParent.leg === 'L' ? 'admin.leftLabel' : 'admin.rightLabel') | translate }})
              </div>

              <ng-container *ngIf="!presetParent && sponsorOptions.length">
                <div class="new-associate-panel__modal-field">
                  <label>{{ 'admin.parentIdLabel' | translate }}</label>
                  <select formControlName="parentId" (blur)="markProvisionTouched('parentId')">
                    <option value="">{{ 'admin.parentIdPlaceholder' | translate }}</option>
                    <option *ngFor="let associate of parentOptions" [value]="associate.id">
                      {{ sponsorLabel(associate) }}
                    </option>
                  </select>
                  <app-field-error [message]="provisionFieldError('parentId')"></app-field-error>
                </div>
                <div class="new-associate-panel__modal-field">
                  <label>{{ 'admin.placementTitle' | translate }}</label>
                  <app-toggle-group
                    [options]="placementOptions"
                    [value]="provisionForm.value.position || null"
                    (valueChange)="onPlacementSelect($event)"
                  ></app-toggle-group>
                  <app-field-error [message]="provisionPositionError"></app-field-error>
                </div>
              </ng-container>
            </div>

            <div class="new-associate-panel__modal-footer">
              <button type="button" class="new-associate-panel__modal-cancel" (click)="cancel()">
                {{ 'admin.associateDirectory.cancelAction' | translate }}
              </button>
              <button type="submit" class="new-associate-panel__modal-submit">
                {{ 'admin.associateDirectory.provisionSubmitAction' | translate }}
              </button>
            </div>
          </form>
        </ng-template>
      </div>
    </div>
  `
})
export class NewAssociatePanelComponent implements OnInit, OnChanges {
  private adminService = inject(AdminService);
  private translate = inject(TranslateService);
  private fb = inject(FormBuilder);

  @Input() open = false;
  @Input() presetParent: PresetParent | null = null;
  @Output() closed = new EventEmitter<void>();
  @Output() created = new EventEmitter<CreateAssociateResponse>();

  provisionForm = this.fb.nonNullable.group(
    {
      name: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      phone: [''],
      sponsorSearch: [''],
      parentId: [''],
      position: ['']
    },
    { validators: positionRequiredWhenParentSelectedValidator }
  );
  provisioned: CreateAssociateResponse | null = null;
  provisionSubmitError: string | null = null;
  sponsorOptions: AssociateSummary[] = [];
  selectedSponsorId: string | null = null;
  sponsorUnresolved = false;
  private provisionServerFieldErrors: Record<string, string> = {};

  ngOnInit(): void {
    this.adminService.listAssociates().subscribe({
      next: associates => {
        this.sponsorOptions = associates;
        if (associates.length > 0) {
          const parent = this.provisionForm.get('parentId')!;
          parent.addValidators(Validators.required);
          parent.updateValueAndValidity();
        }
      },
      error: () => {
        // Sponsor autocomplete degrading to a plain text field (no suggestions) is an acceptable
        // fallback -- unlike ranks/associates-page, it isn't required to render this screen.
      }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open'] && this.open) {
      this.resetForm();
    }
  }

  private resetForm(): void {
    this.provisionForm.reset({ name: '', email: '', phone: '', sponsorSearch: '', parentId: '', position: '' });
    if (this.presetParent) {
      this.provisionForm.patchValue({ parentId: this.presetParent.parentId, position: this.presetParent.leg });
    }
    this.selectedSponsorId = null;
    this.sponsorUnresolved = false;
    this.provisioned = null;
    this.provisionSubmitError = null;
    this.provisionServerFieldErrors = {};
  }

  sponsorLabel(associate: AssociateSummary): string {
    return `${associate.userId} — ${associate.name}`;
  }

  onSponsorSearchInput(value: string): void {
    const match = this.sponsorOptions.find(associate => this.sponsorLabel(associate) === value);
    this.selectedSponsorId = match ? match.id : null;
    // Editing the field clears a stale "unknown sponsor" message; onProvisionSubmit re-checks.
    this.sponsorUnresolved = false;
  }

  // Sponsor is optional -- an empty field legitimately means "no sponsor". But typed text that
  // matches no datalist option leaves selectedSponsorId null, which previously submitted
  // sponsorId: undefined and created a sponsor-less associate with no warning. Typed-but-unresolved
  // is therefore an error, blank is not.
  sponsorFieldError(): string | undefined {
    return this.sponsorUnresolved ? this.translate.instant('admin.validation.unknownSponsor') : undefined;
  }

  private hasUnresolvedSponsorText(): boolean {
    return this.provisionForm.getRawValue().sponsorSearch.trim().length > 0 && !this.selectedSponsorId;
  }

  // Parent Node picker offers only associates with an open Left or Right leg -- the sponsor
  // datalist above stays unfiltered since sponsor is independent of tree placement.
  get parentOptions(): AssociateSummary[] {
    return this.sponsorOptions.filter(a => a.hasFreeSlot);
  }

  get placementOptions(): ToggleOption[] {
    return [
      { value: 'L', label: this.translate.instant('admin.leftLabel') },
      { value: 'R', label: this.translate.instant('admin.rightLabel') }
    ];
  }

  onPlacementSelect(value: string): void {
    this.provisionForm.patchValue({ position: value });
  }

  get provisionPositionError(): string | undefined {
    // The toggle group has no blur event, so gate on parentId's touched state (its <select> does)
    // plus the post-submit markAllAsTouched -- same pattern the old full-page form used.
    return this.provisionForm.get('parentId')?.touched && this.provisionForm.hasError('positionRequired')
      ? this.translate.instant('admin.validation.positionRequired')
      : undefined;
  }

  cancel(): void {
    this.closed.emit();
  }

  markProvisionTouched(name: string): void {
    this.provisionForm.get(name)?.markAsTouched();
  }

  provisionFieldError(name: string): string | undefined {
    if (this.provisionServerFieldErrors[name]) {
      return this.provisionServerFieldErrors[name];
    }
    const control = this.provisionForm.get(name);
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

  onProvisionSubmit(): void {
    this.provisionServerFieldErrors = {};
    this.provisionSubmitError = null;
    this.sponsorUnresolved = false;
    if (this.provisionForm.invalid) {
      this.provisionForm.markAllAsTouched();
      return;
    }
    if (this.hasUnresolvedSponsorText()) {
      this.sponsorUnresolved = true;
      return;
    }
    const { name, email, phone, parentId, position } = this.provisionForm.getRawValue();
    this.adminService
      .createAssociate({
        name,
        email,
        phone: phone || undefined,
        sponsorId: this.selectedSponsorId || undefined,
        parentId: parentId || undefined,
        position: position || undefined
      })
      .subscribe({
        next: response => {
          this.provisioned = response;
          this.created.emit(response);
        },
        error: (err: HttpErrorResponse) => {
          const fields = toFieldErrors(err);
          if (Object.keys(fields).length > 0) {
            this.provisionServerFieldErrors = fields;
            return;
          }
          this.provisionSubmitError =
            err.status === 409
              ? this.messageForConflict(err.error?.error)
              : this.translate.instant('admin.validation.genericSaveError');
        }
      });
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

  finishProvisioning(): void {
    this.closed.emit();
  }
}
