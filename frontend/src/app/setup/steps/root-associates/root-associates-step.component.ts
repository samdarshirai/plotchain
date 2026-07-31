import { Component, Input, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';
import { SetupStepNavComponent } from '../../../shared/components/setup-step-nav/setup-step-nav.component';
import { toFieldErrors } from '../../../core/api/field-errors.model';
import { RootAssociatesService } from './root-associates.service';
import { SetupService } from '../../setup.service';
import { CreateRootAssociateRequest, RootAssociateCreationResult, RootAssociateSummary } from '../../models/root-associates.model';

@Component({
  selector: 'app-root-associates-step',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, FieldErrorComponent, InlineBannerComponent, SetupStepNavComponent],
  template: `
    <div class="root-associates-step step-grid">
      <div class="card root-associates-step__form-card">
        <h1 class="card-title">{{ 'setup.rootAssociates.formTitle' | translate }}</h1>

        <div class="root-associates-step__banner" *ngIf="createdLeft">
          <p>
            {{ 'setup.rootAssociates.bannerAssociateIdLabel' | translate }}
            ({{ 'setup.rootAssociates.leftSlotLabel' | translate }}):
            <strong>{{ createdLeft.userId }}</strong>
          </p>
          <p>
            {{ 'setup.rootAssociates.bannerTemporaryPasswordLabel' | translate }}:
            <strong>{{ createdLeft.temporaryPassword }}</strong>
          </p>
          <ng-container *ngIf="createdRight">
            <p>
              {{ 'setup.rootAssociates.bannerAssociateIdLabel' | translate }}
              ({{ 'setup.rootAssociates.rightSlotLabel' | translate }}):
              <strong>{{ createdRight.userId }}</strong>
            </p>
            <p>
              {{ 'setup.rootAssociates.bannerTemporaryPasswordLabel' | translate }}:
              <strong>{{ createdRight.temporaryPassword }}</strong>
            </p>
          </ng-container>
          <p class="root-associates-step__banner-notice">{{ 'setup.rootAssociates.bannerNoticeLabel' | translate }}</p>
          <button type="button" (click)="dismissBanner()">{{ 'setup.rootAssociates.doneButtonLabel' | translate }}</button>
        </div>

        <app-inline-banner *ngIf="!leftOccupied && !createdLeft" tone="warning">
          {{ 'setup.rootAssociates.warningBannerBody' | translate }}
        </app-inline-banner>

        <form [formGroup]="form" (ngSubmit)="onSubmit()" *ngIf="!leftOccupied && !createdLeft">
          <label>
            {{ 'setup.rootAssociates.nameLabel' | translate }}
            <input type="text" formControlName="name" (blur)="markTouched('name')" />
          </label>
          <app-field-error [message]="fieldError('name')"></app-field-error>

          <label>
            {{ 'setup.rootAssociates.phoneLabel' | translate }}
            <input type="tel" formControlName="phone" (blur)="markTouched('phone')" />
          </label>
          <app-field-error [message]="fieldError('phone')"></app-field-error>

          <label>
            <input type="checkbox" formControlName="seedRightRoot" (change)="onSeedRightRootChange()" />
            {{ 'setup.rootAssociates.seedRightRootLabel' | translate }}
          </label>

          <ng-container *ngIf="form.value.seedRightRoot">
            <label>
              {{ 'setup.rootAssociates.rightNameLabel' | translate }}
              <input type="text" formControlName="rightName" (blur)="markTouched('rightName')" />
            </label>
            <app-field-error [message]="fieldError('rightName')"></app-field-error>

            <label>
              {{ 'setup.rootAssociates.rightPhoneLabel' | translate }}
              <input type="tel" formControlName="rightPhone" (blur)="markTouched('rightPhone')" />
            </label>
            <app-field-error [message]="fieldError('rightPhone')"></app-field-error>
          </ng-container>

          <app-inline-banner *ngIf="submitError" tone="danger">{{ submitError }}</app-inline-banner>

          <button type="submit" [disabled]="form.invalid">{{ 'setup.rootAssociates.submitButtonLabel' | translate }}</button>
        </form>

        <app-setup-step-nav [previousPath]="previousPath" [nextPath]="nextPath" [mode]="mode"></app-setup-step-nav>
      </div>

      <div class="card root-associates-step__tree">
        <p class="card-subtitle">{{ 'setup.rootAssociates.treeTitle' | translate }}</p>
        <div class="root-associates-step__root-node">{{ 'setup.rootAssociates.rootNodeLabel' | translate }}</div>
        <div class="root-associates-step__slots">
          <div class="root-associates-step__slot">
            <span>{{ 'setup.rootAssociates.leftSlotLabel' | translate }}</span>
            <ng-container *ngIf="leftRoot() as root; else emptyLeft">
              <strong>{{ root.name }}</strong>
              <span>{{ root.userId }}</span>
            </ng-container>
            <ng-template #emptyLeft>{{ 'setup.rootAssociates.emptySlotLabel' | translate }}</ng-template>
          </div>
          <div class="root-associates-step__slot">
            <span>{{ 'setup.rootAssociates.rightSlotLabel' | translate }}</span>
            <ng-container *ngIf="rightRoot() as root; else emptyRight">
              <strong>{{ root.name }}</strong>
              <span>{{ root.userId }}</span>
            </ng-container>
            <ng-template #emptyRight>{{ 'setup.rootAssociates.emptySlotLabel' | translate }}</ng-template>
          </div>
        </div>
      </div>
    </div>
  `
})
export class RootAssociatesStepComponent implements OnInit {
  private fb = inject(FormBuilder);
  private rootAssociatesService = inject(RootAssociatesService);
  private setupService = inject(SetupService);
  private translate = inject(TranslateService);
  private route = inject(ActivatedRoute);

  @Input() mode: 'setup' | 'settings' = 'setup';

  readonly previousPath = this.setupService.previousStepPath('rootAssociates');
  readonly nextPath = this.setupService.nextStepPath('rootAssociates');

  roots: RootAssociateSummary[] = [];
  leftOccupied = false;
  rightOccupied = false;
  createdLeft: RootAssociateCreationResult | null = null;
  createdRight: RootAssociateCreationResult | null = null;
  submitError: string | null = null;
  private serverFieldErrors: Record<string, string> = {};

  form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    phone: ['', Validators.required],
    seedRightRoot: [false],
    rightName: [''],
    rightPhone: ['']
  });

  ngOnInit(): void {
    this.mode = (this.route.snapshot.data['mode'] as 'setup' | 'settings') ?? 'setup';
    this.refreshSlots();
  }

  leftRoot(): RootAssociateSummary | undefined {
    return this.roots.find(r => r.slotLabel === 'LEFT');
  }

  rightRoot(): RootAssociateSummary | undefined {
    return this.roots.find(r => r.slotLabel === 'RIGHT');
  }

  onSeedRightRootChange(): void {
    const seedRightRoot = this.form.value.seedRightRoot;
    const rightName = this.form.get('rightName');
    const rightPhone = this.form.get('rightPhone');
    if (seedRightRoot) {
      rightName?.setValidators(Validators.required);
      rightPhone?.setValidators(Validators.required);
    } else {
      rightName?.clearValidators();
      rightPhone?.clearValidators();
    }
    rightName?.updateValueAndValidity();
    rightPhone?.updateValueAndValidity();
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
      return this.translate.instant('setup.rootAssociates.validation.required');
    }
    return undefined;
  }

  onSubmit(): void {
    this.serverFieldErrors = {};
    this.submitError = null;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const request: CreateRootAssociateRequest = {
      name: raw.name,
      phone: raw.phone,
      seedRightRoot: raw.seedRightRoot,
      ...(raw.seedRightRoot ? { rightName: raw.rightName, rightPhone: raw.rightPhone } : {})
    };
    this.rootAssociatesService.createRootAssociates(request).subscribe({
      next: res => {
        this.serverFieldErrors = {};
        this.submitError = null;
        this.createdLeft = res.left;
        this.createdRight = res.right;
        this.refreshSlots();
        this.setupService.refresh();
      },
      error: err => {
        const fields = toFieldErrors(err);
        if (Object.keys(fields).length > 0) {
          this.serverFieldErrors = fields;
          return;
        }
        if (err.status === 409) {
          this.submitError = this.messageForConflict(err.error?.error);
        } else if (err.status === 400) {
          this.submitError = this.translate.instant('setup.rootAssociates.validation.rightFieldsRequired');
        } else {
          this.submitError = this.translate.instant('setup.rootAssociates.validation.genericSaveError');
        }
      }
    });
  }

  dismissBanner(): void {
    this.createdLeft = null;
    this.createdRight = null;
  }

  private messageForConflict(backendMessage: string | undefined): string {
    if (backendMessage === 'No rank tiers are configured; an associate cannot be created without a rank') {
      return this.translate.instant('setup.rootAssociates.validation.noRankTiersConfigured');
    }
    return this.translate.instant('setup.rootAssociates.validation.alreadyExists');
  }

  private refreshSlots(): void {
    this.rootAssociatesService.getSlots().subscribe({
      next: res => {
        this.roots = res.roots;
        this.leftOccupied = res.leftOccupied;
        this.rightOccupied = res.rightOccupied;
      },
      error: () => {
        this.roots = [];
        this.leftOccupied = false;
        this.rightOccupied = false;
      }
    });
  }
}
