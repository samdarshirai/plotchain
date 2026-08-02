import { Component, Input, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';
import { BrandButtonComponent } from '../../../shared/components/brand-button/brand-button.component';
import { SidePanelComponent } from '../../../shared/components/side-panel/side-panel.component';
import { SetupStepNavComponent } from '../../../shared/components/setup-step-nav/setup-step-nav.component';
import { toFieldErrors } from '../../../core/api/field-errors.model';
import { RootAssociatesService } from './root-associates.service';
import { SetupService } from '../../setup.service';
import { CreateRootAssociateRequest, RootAssociateCreationResult, RootAssociateSummary } from '../../models/root-associates.model';

interface SampleCandidate {
  initial: string;
  name: string;
  id?: string;
  statusLabel?: string;
  available: boolean;
}

@Component({
  selector: 'app-root-associates-step',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    FieldErrorComponent,
    InlineBannerComponent,
    BrandButtonComponent,
    SidePanelComponent,
    SetupStepNavComponent
  ],
  template: `
    <div class="root-associates-step">
      <div class="root-associates-step__header">
        <div class="root-associates-step__intro">
          <span class="root-associates-step__eyebrow">
            {{ 'setup.rootAssociates.stepEyebrowLabel' | translate: { number: stepNumber, count: stepCount } }}
          </span>
          <h1 class="root-associates-step__title">{{ 'setup.steps.rootAssociates' | translate }}</h1>
          <p class="root-associates-step__subtitle">{{ 'setup.rootAssociates.subtitle' | translate }}</p>
        </div>
      </div>

      <app-inline-banner *ngIf="createdLeft" tone="success">
        <p>
          {{ 'setup.rootAssociates.bannerUserIdLabel' | translate }}
          ({{ 'setup.rootAssociates.leftSlotLabel' | translate }}):
          <strong>{{ createdLeft.userId }}</strong>
        </p>
        <p>
          {{ 'setup.rootAssociates.bannerTemporaryPasswordLabel' | translate }}:
          <strong>{{ createdLeft.temporaryPassword }}</strong>
        </p>
        <ng-container *ngIf="createdRight">
          <p>
            {{ 'setup.rootAssociates.bannerUserIdLabel' | translate }}
            ({{ 'setup.rootAssociates.rightSlotLabel' | translate }}):
            <strong>{{ createdRight.userId }}</strong>
          </p>
          <p>
            {{ 'setup.rootAssociates.bannerTemporaryPasswordLabel' | translate }}:
            <strong>{{ createdRight.temporaryPassword }}</strong>
          </p>
        </ng-container>
        <p class="root-associates-step__banner-notice">{{ 'setup.rootAssociates.bannerNoticeLabel' | translate }}</p>
        <app-brand-button type="button" variant="secondary" (clicked)="dismissBanner()">
          {{ 'setup.rootAssociates.doneButtonLabel' | translate }}
        </app-brand-button>
      </app-inline-banner>

      <app-inline-banner *ngIf="!leftOccupied && !createdLeft" tone="warning">
        {{ 'setup.rootAssociates.warningBannerBody' | translate }}
      </app-inline-banner>

      <div class="card root-associates-step__tree">
        <p class="card-subtitle">{{ 'setup.rootAssociates.treeTitle' | translate }}</p>

        <div class="root-associates-step__root-node">
          <span class="material-symbols-outlined">hub</span>
          <span class="root-associates-step__root-node-label">{{ 'setup.rootAssociates.rootNodeLabel' | translate }}</span>
        </div>

        <div class="root-associates-step__slots">
          <ng-container *ngIf="leftRoot() as root; else vacantLeft">
            <div class="root-associates-step__slot-card root-associates-step__slot-card--filled">
              <div class="root-associates-step__slot-avatar">{{ root.name.charAt(0) }}</div>
              <span class="root-associates-step__slot-label">{{ 'setup.rootAssociates.leftSlotLabel' | translate }}</span>
              <strong class="root-associates-step__slot-name">{{ root.name }}</strong>
              <span class="root-associates-step__slot-meta">{{ root.userId }}</span>
            </div>
          </ng-container>
          <ng-template #vacantLeft>
            <button
              type="button"
              class="root-associates-step__slot-card root-associates-step__slot-card--vacant"
              [disabled]="leftOccupied"
              (click)="openAssignDrawer('LEFT')"
            >
              <div class="root-associates-step__slot-avatar">
                <span class="material-symbols-outlined">add</span>
              </div>
              <span class="root-associates-step__slot-label">{{ 'setup.rootAssociates.assignLeftLabel' | translate }}</span>
              <span class="root-associates-step__slot-meta">{{ 'setup.rootAssociates.vacantNodeLabel' | translate }}</span>
            </button>
          </ng-template>

          <ng-container *ngIf="rightRoot() as root; else vacantRight">
            <div class="root-associates-step__slot-card root-associates-step__slot-card--filled">
              <div class="root-associates-step__slot-avatar">{{ root.name.charAt(0) }}</div>
              <span class="root-associates-step__slot-label">{{ 'setup.rootAssociates.rightSlotLabel' | translate }}</span>
              <strong class="root-associates-step__slot-name">{{ root.name }}</strong>
              <span class="root-associates-step__slot-meta">{{ root.userId }}</span>
            </div>
          </ng-container>
          <ng-template #vacantRight>
            <!--
              Right can only ever be seeded together with left (RootAssociateProvisioningService.create
              rejects any call once a root already exists) -- so once left is occupied, this card is a
              permanent empty state, not a still-pending action. Disabling it (rather than leaving it
              clickable and 409ing) reflects that constraint honestly.
            -->
            <button
              type="button"
              class="root-associates-step__slot-card root-associates-step__slot-card--vacant"
              [disabled]="leftOccupied"
              (click)="openAssignDrawer('RIGHT')"
            >
              <div class="root-associates-step__slot-avatar">
                <span class="material-symbols-outlined">add</span>
              </div>
              <span class="root-associates-step__slot-label">{{ 'setup.rootAssociates.assignRightLabel' | translate }}</span>
              <span class="root-associates-step__slot-meta">{{ 'setup.rootAssociates.vacantNodeLabel' | translate }}</span>
            </button>
          </ng-template>
        </div>
      </div>

      <app-side-panel
        *ngIf="!leftOccupied && !createdLeft"
        [open]="panelOpen"
        [title]="'setup.rootAssociates.drawerTitleLabel' | translate"
        (closed)="closeDrawer()"
      >
        <div class="root-associates-step__search">
          <span class="material-symbols-outlined">search</span>
          <input type="text" [placeholder]="'setup.rootAssociates.searchPlaceholderLabel' | translate" disabled />
        </div>

        <p class="root-associates-step__section-label">{{ 'setup.rootAssociates.recommendedAssociatesLabel' | translate }}</p>

        <!-- Presentational only: there is no associate-search/assign-existing endpoint yet, so
             these rows are static sample data and never trigger a request. -->
        <div
          class="root-associates-step__candidate-row"
          *ngFor="let candidate of sampleCandidates"
          [class.root-associates-step__candidate-row--unavailable]="!candidate.available"
        >
          <div class="root-associates-step__slot-avatar">{{ candidate.initial }}</div>
          <div class="root-associates-step__candidate-info">
            <strong>{{ candidate.name }}</strong>
            <span>{{ candidate.available ? candidate.id : candidate.statusLabel }}</span>
          </div>
          <span class="material-symbols-outlined">{{ candidate.available ? 'chevron_right' : 'lock' }}</span>
        </div>

        <p class="root-associates-step__insight-callout">{{ 'setup.rootAssociates.insightCalloutLabel' | translate }}</p>

        <form class="root-associates-step__form" [formGroup]="form" (ngSubmit)="onSubmit()">
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

          <label class="root-associates-step__checkbox">
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

          <app-brand-button type="submit" variant="primary" [fullWidth]="true" [disabled]="form.invalid">
            {{ 'setup.rootAssociates.submitButtonLabel' | translate }}
          </app-brand-button>
        </form>
      </app-side-panel>

      <app-setup-step-nav *ngIf="mode === 'settings'" [mode]="mode"></app-setup-step-nav>
    </div>
  `
})
export class RootAssociatesStepComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private rootAssociatesService = inject(RootAssociatesService);
  private setupService = inject(SetupService);
  private translate = inject(TranslateService);
  private route = inject(ActivatedRoute);
  private destroyed$ = new Subject<void>();

  @Input() mode: 'setup' | 'settings' = 'setup';

  stepNumber = 1;
  stepCount = 1;

  roots: RootAssociateSummary[] = [];
  leftOccupied = false;
  rightOccupied = false;
  createdLeft: RootAssociateCreationResult | null = null;
  createdRight: RootAssociateCreationResult | null = null;
  submitError: string | null = null;
  panelOpen = false;
  activeSlot: 'LEFT' | 'RIGHT' | null = null;
  private serverFieldErrors: Record<string, string> = {};

  // Presentational only -- see the note above the candidate rows in the template.
  readonly sampleCandidates: SampleCandidate[] = [
    { initial: 'R', name: 'Rahul Vardhan', id: 'ID: EXE-9920', available: true },
    { initial: 'S', name: 'Sarah Jenkins', statusLabel: 'Busy until Q4', available: false }
  ];

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

    this.setupService
      .getState()
      .pipe(takeUntil(this.destroyed$))
      .subscribe(state => {
        const step = state.steps.find(s => s.key === 'rootAssociates');
        this.stepNumber = step?.number ?? 1;
        this.stepCount = state.steps.length;
      });
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  leftRoot(): RootAssociateSummary | undefined {
    return this.roots.find(r => r.slotLabel === 'LEFT');
  }

  rightRoot(): RootAssociateSummary | undefined {
    return this.roots.find(r => r.slotLabel === 'RIGHT');
  }

  openAssignDrawer(slot: 'LEFT' | 'RIGHT'): void {
    if (this.leftOccupied) {
      return;
    }
    this.activeSlot = slot;
    this.panelOpen = true;
    if (slot === 'RIGHT' && !this.form.value.seedRightRoot) {
      this.form.patchValue({ seedRightRoot: true });
      this.onSeedRightRootChange();
    }
  }

  closeDrawer(): void {
    this.panelOpen = false;
    this.activeSlot = null;
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
        this.closeDrawer();
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
