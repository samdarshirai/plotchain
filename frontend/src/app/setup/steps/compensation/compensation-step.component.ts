import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subject, Subscription, merge } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';
import { StatTileComponent } from '../../../shared/components/stat-tile/stat-tile.component';
import { ToggleGroupComponent, ToggleOption } from '../../../shared/components/toggle-group/toggle-group.component';
import { EditableTableColumn, EditableTableComponent } from '../../../shared/components/editable-table/editable-table.component';
import { toFieldErrors } from '../../../core/api/field-errors.model';
import { CompensationPlanService } from './compensation-plan.service';
import { computeSampleEarnings, SampleEarningsResult } from './sample-earnings';
import { SetupService } from '../../setup.service';
import { CompensationPlanRequest, RankOption } from '../../models/compensation-plan.model';

const DEFAULT_SCENARIO_VOLUME = 1000000; // spec example: "sells ₹10L on each leg"

// The only form fields with a visible <app-field-error> in the template. A server-side
// field error keyed on anything else (settlementCycle, royaltyBonusRates, rewardTiers, or an
// unkeyed 500) would otherwise render nothing at all -- those get routed to submitError instead.
const RENDERED_FIELD_ERROR_KEYS = [
  'directIncomePct',
  'matchingIncomePct',
  'sponsorMatchingPct',
  'tdsPct',
  'adminChargeWithPanPct',
  'adminChargeWithoutPanPct',
  'activationFee',
  'minWithdrawal'
];

@Component({
  selector: 'app-compensation-step',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    FieldErrorComponent,
    InlineBannerComponent,
    StatTileComponent,
    ToggleGroupComponent,
    EditableTableComponent
  ],
  template: `
    <div class="compensation-step">
      <form class="card" [formGroup]="form">
        <h1 class="card-title">{{ 'setup.steps.compensation' | translate }}</h1>

        <app-inline-banner tone="warning">
          {{ 'setup.compensation.versioningNotice' | translate }}
        </app-inline-banner>

        <div class="compensation-step__stat-tiles">
          <app-stat-tile
            [label]="'setup.compensation.directIncomeLabel' | translate"
            [value]="(form.value.directIncomePct ?? 0) + '%'"
          >
            <input
              tile-editor
              type="number"
              formControlName="directIncomePct"
              (blur)="markTouched('directIncomePct')"
            />
          </app-stat-tile>
          <app-field-error [message]="fieldError('directIncomePct')"></app-field-error>

          <app-stat-tile
            [label]="'setup.compensation.matchingIncomeLabel' | translate"
            [value]="(form.value.matchingIncomePct ?? 0) + '%'"
          >
            <input
              tile-editor
              type="number"
              formControlName="matchingIncomePct"
              (blur)="markTouched('matchingIncomePct')"
            />
          </app-stat-tile>
          <app-field-error [message]="fieldError('matchingIncomePct')"></app-field-error>

          <app-stat-tile
            [label]="'setup.compensation.sponsorMatchingLabel' | translate"
            [value]="(form.value.sponsorMatchingPct ?? 0) + '%'"
          >
            <input
              tile-editor
              type="number"
              formControlName="sponsorMatchingPct"
              (blur)="markTouched('sponsorMatchingPct')"
            />
          </app-stat-tile>
          <app-field-error [message]="fieldError('sponsorMatchingPct')"></app-field-error>
        </div>

        <label>
          {{ 'setup.compensation.royaltyTableLabel' | translate }}
          <app-editable-table
            [columns]="royaltyColumns"
            [rows]="royaltyRows"
            [addRowLabel]="'setup.compensation.addRoyaltyRowLabel' | translate"
            [removeRowLabel]="'setup.compensation.removeRowLabel' | translate"
            [emptyStateLabel]="'setup.compensation.royaltyEmptyLabel' | translate"
            (rowsChange)="onRoyaltyRowsChange($event)"
          ></app-editable-table>
        </label>

        <label>
          {{ 'setup.compensation.rewardTiersLabel' | translate }}
          <app-editable-table
            [columns]="rewardTierColumns"
            [rows]="rewardTierRows"
            [addRowLabel]="'setup.compensation.addRewardTierRowLabel' | translate"
            [removeRowLabel]="'setup.compensation.removeRowLabel' | translate"
            [emptyStateLabel]="'setup.compensation.rewardTiersEmptyLabel' | translate"
            (rowsChange)="onRewardTierRowsChange($event)"
          ></app-editable-table>
        </label>

        <label>
          {{ 'setup.compensation.settlementCycleLabel' | translate }}
          <app-toggle-group
            [options]="settlementCycleOptions"
            [value]="form.value.settlementCycle || null"
            (valueChange)="setSettlementCycle($event)"
          ></app-toggle-group>
        </label>

        <label>
          {{ 'setup.compensation.tdsLabel' | translate }}
          <input type="number" formControlName="tdsPct" (blur)="markTouched('tdsPct')" />
        </label>
        <app-field-error [message]="fieldError('tdsPct')"></app-field-error>

        <label>
          {{ 'setup.compensation.adminChargeWithPanLabel' | translate }}
          <input type="number" formControlName="adminChargeWithPanPct" (blur)="markTouched('adminChargeWithPanPct')" />
        </label>
        <app-field-error [message]="fieldError('adminChargeWithPanPct')"></app-field-error>

        <label>
          {{ 'setup.compensation.adminChargeWithoutPanLabel' | translate }}
          <input
            type="number"
            formControlName="adminChargeWithoutPanPct"
            (blur)="markTouched('adminChargeWithoutPanPct')"
          />
        </label>
        <app-field-error [message]="fieldError('adminChargeWithoutPanPct')"></app-field-error>

        <label>
          {{ 'setup.compensation.activationFeeLabel' | translate }}
          <input type="number" formControlName="activationFee" (blur)="markTouched('activationFee')" />
        </label>
        <app-field-error [message]="fieldError('activationFee')"></app-field-error>

        <label>
          {{ 'setup.compensation.minWithdrawalLabel' | translate }}
          <input type="number" formControlName="minWithdrawal" (blur)="markTouched('minWithdrawal')" />
        </label>
        <app-field-error [message]="fieldError('minWithdrawal')"></app-field-error>

        <app-inline-banner *ngIf="submitError" tone="danger">{{ submitError }}</app-inline-banner>

        <div class="compensation-step__saved" *ngIf="savedJustNow">
          {{ 'setup.compensation.savedIndicator' | translate }}
        </div>
      </form>

      <div class="card compensation-step__preview">
        <p class="card-subtitle">{{ 'setup.compensation.sampleEarningsTitle' | translate }}</p>

        <label>
          {{ 'setup.compensation.scenarioVolumeLabel' | translate }}
          <input type="number" [value]="scenarioVolume" (input)="setScenarioVolume($event)" />
        </label>

        <label>
          <input type="checkbox" [checked]="hasPan" (change)="setHasPan($event)" />
          {{ 'setup.compensation.hasPanLabel' | translate }}
        </label>

        <dl class="compensation-step__earnings" *ngIf="sampleEarnings as earnings">
          <dt>{{ 'setup.compensation.directIncomeLineLabel' | translate }}</dt>
          <dd>{{ earnings.directIncome | number: '1.0-2' }}</dd>

          <dt>{{ 'setup.compensation.matchingIncomeLineLabel' | translate }}</dt>
          <dd>{{ earnings.matchingIncome | number: '1.0-2' }}</dd>

          <dt>{{ 'setup.compensation.sponsorBonusLineLabel' | translate }}</dt>
          <dd>{{ earnings.sponsorBonus | number: '1.0-2' }}</dd>

          <dt>{{ 'setup.compensation.royaltyBonusLineLabel' | translate }}</dt>
          <dd>{{ earnings.royaltyBonus | number: '1.0-2' }}</dd>

          <dt>{{ 'setup.compensation.grossIncomeLineLabel' | translate }}</dt>
          <dd>{{ earnings.grossIncome | number: '1.0-2' }}</dd>

          <dt>{{ 'setup.compensation.adminChargeLineLabel' | translate }}</dt>
          <dd>{{ earnings.adminCharge | number: '1.0-2' }}</dd>

          <dt>{{ 'setup.compensation.tdsLineLabel' | translate }}</dt>
          <dd>{{ earnings.tds | number: '1.0-2' }}</dd>
        </dl>

        <div class="compensation-step__final-earnings" *ngIf="sampleEarnings as earnings">
          {{ 'setup.compensation.finalEarningsLineLabel' | translate }}: {{ earnings.finalEarnings | number: '1.0-2' }}
        </div>
      </div>
    </div>
  `
})
export class CompensationStepComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private compensationPlanService = inject(CompensationPlanService);
  private setupService = inject(SetupService);
  private translate = inject(TranslateService);
  private destroyed$ = new Subject<void>();
  private planSubscription?: Subscription;
  // royaltyRows/rewardTierRows aren't form controls, so they don't flow through
  // form.valueChanges -- this feeds their edits into the same debounced save arm.
  private rowsChanged$ = new Subject<void>();

  form = this.fb.group({
    directIncomePct: [0, [Validators.required, Validators.min(0), Validators.max(100)]],
    matchingIncomePct: [0, [Validators.required, Validators.min(0), Validators.max(100)]],
    sponsorMatchingPct: [0, [Validators.required, Validators.min(0), Validators.max(100)]],
    settlementCycle: ['SEMI_MONTHLY', Validators.required],
    tdsPct: [2, [Validators.required, Validators.min(0), Validators.max(100)]],
    adminChargeWithPanPct: [5, [Validators.required, Validators.min(0), Validators.max(100)]],
    adminChargeWithoutPanPct: [15, [Validators.required, Validators.min(0), Validators.max(100)]],
    activationFee: [1100, [Validators.required, Validators.min(0)]],
    minWithdrawal: [0, [Validators.required, Validators.min(0)]]
  });

  // Plain component-state arrays, NOT form controls -- editable-table isn't forms-aware, it
  // emits full-array replacements via (rowsChange) instead.
  royaltyRows: Record<string, string | number>[] = [];
  rewardTierRows: Record<string, string | number>[] = [];
  availableRanks: RankOption[] = [];

  // Local-only inputs for the Sample Earnings Preview -- never persisted/saved.
  scenarioVolume = DEFAULT_SCENARIO_VOLUME;
  hasPan = true;
  sampleEarnings: SampleEarningsResult | null = null;

  savedJustNow = false;
  submitError: string | null = null;
  private serverFieldErrors: Record<string, string> = {};

  ngOnInit(): void {
    this.planSubscription = this.compensationPlanService.getCurrent().subscribe(res => {
      this.availableRanks = res.availableRanks;
      this.form.patchValue(res, { emitEvent: false });
      this.royaltyRows = res.royaltyBonusRates.map(r => ({ rankId: r.rankId, royaltyPct: r.royaltyPct }));
      this.rewardTierRows = [...res.rewardTiers]
        .sort((a, b) => a.tierLevel - b.tierLevel)
        .map(t => ({ volumeThreshold: t.volumeThreshold, cashReward: t.cashReward, perkDescription: t.perkDescription }));
      // patchValue with emitEvent:false suppresses both the preview and the debounced-save
      // arms below -- so the initial preview needs this explicit one-time call.
      this.recomputeSampleEarnings();
    });

    // Undebounced: instant, local-only Sample Earnings Preview repaint, no network.
    this.form.valueChanges.pipe(takeUntil(this.destroyed$)).subscribe(() => this.recomputeSampleEarnings());

    // Debounced: same cadence as the other steps' autosave. Also fed by rowsChanged$ so that
    // royalty/reward-tier table edits -- which never touch the form -- reach save() too.
    merge(this.form.valueChanges, this.rowsChanged$)
      .pipe(takeUntil(this.destroyed$), debounceTime(400))
      .subscribe(() => {
        this.savedJustNow = false;
        if (this.form.valid) {
          this.save();
        }
      });
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
    this.planSubscription?.unsubscribe();
  }

  get royaltyColumns(): EditableTableColumn[] {
    return [
      {
        key: 'rankId',
        label: this.translate.instant('setup.compensation.rankColumnLabel'),
        type: 'select',
        options: this.availableRanks.map(rank => ({ value: rank.id, label: rank.name }))
      },
      { key: 'royaltyPct', label: this.translate.instant('setup.compensation.royaltyPctColumnLabel'), type: 'number' }
    ];
  }

  get rewardTierColumns(): EditableTableColumn[] {
    return [
      { key: 'volumeThreshold', label: this.translate.instant('setup.compensation.volumeThresholdColumnLabel'), type: 'number' },
      { key: 'cashReward', label: this.translate.instant('setup.compensation.cashRewardColumnLabel'), type: 'number' },
      { key: 'perkDescription', label: this.translate.instant('setup.compensation.perkDescriptionColumnLabel'), type: 'text' }
    ];
  }

  get settlementCycleOptions(): ToggleOption[] {
    return [
      { value: 'SEMI_MONTHLY', label: this.translate.instant('setup.compensation.settlementCycleSemiMonthlyLabel') },
      { value: 'MONTHLY', label: this.translate.instant('setup.compensation.settlementCycleMonthlyLabel') },
      { value: 'CUSTOM', label: this.translate.instant('setup.compensation.settlementCycleCustomLabel') }
    ];
  }

  onRoyaltyRowsChange(rows: Record<string, string | number>[]): void {
    this.royaltyRows = rows;
    this.recomputeSampleEarnings();
    this.rowsChanged$.next();
  }

  onRewardTierRowsChange(rows: Record<string, string | number>[]): void {
    this.rewardTierRows = rows;
    this.recomputeSampleEarnings();
    this.rowsChanged$.next();
  }

  setSettlementCycle(value: string): void {
    this.form.get('settlementCycle')?.setValue(value);
  }

  setScenarioVolume(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.scenarioVolume = Number(target.value);
    this.recomputeSampleEarnings();
  }

  setHasPan(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.hasPan = target.checked;
    this.recomputeSampleEarnings();
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
      return this.translate.instant('setup.compensation.validation.required');
    }
    if (control.errors['min'] || control.errors['max']) {
      return this.translate.instant('setup.compensation.validation.range');
    }
    return undefined;
  }

  private recomputeSampleEarnings(): void {
    const raw = this.form.getRawValue();
    // Per sample-earnings.ts: royaltyPct is resolved by the caller from the first configured
    // royalty-table row; 0 if the table is empty.
    const royaltyPct = this.royaltyRows.length > 0 ? Number(this.royaltyRows[0]['royaltyPct']) || 0 : 0;
    this.sampleEarnings = computeSampleEarnings(
      { scenarioVolume: this.scenarioVolume, hasPan: this.hasPan },
      {
        directIncomePct: Number(raw.directIncomePct) || 0,
        matchingIncomePct: Number(raw.matchingIncomePct) || 0,
        sponsorMatchingPct: Number(raw.sponsorMatchingPct) || 0,
        tdsPct: Number(raw.tdsPct) || 0,
        adminChargeWithPanPct: Number(raw.adminChargeWithPanPct) || 0,
        adminChargeWithoutPanPct: Number(raw.adminChargeWithoutPanPct) || 0,
        royaltyPct
      }
    );
  }

  private save(): void {
    const formValue = this.form.getRawValue();
    const request = {
      ...formValue,
      // royaltyRows carried through as-is (field names already match RoyaltyBonusRate minus
      // rankName); only type coercion is needed since editable-table cell values round-trip
      // through the DOM as strings for select columns.
      royaltyBonusRates: this.royaltyRows.map(row => ({
        rankId: String(row['rankId']),
        royaltyPct: Number(row['royaltyPct'])
      })),
      // tierLevel is derived purely from array index here -- it is never a user-editable
      // column on the reward-tier table, which is the primary UI-side defense against
      // RewardTierGapException (the backend independently re-validates as defense in depth).
      rewardTiers: this.rewardTierRows.map((row, index) => ({
        tierLevel: index + 1,
        volumeThreshold: Number(row['volumeThreshold']),
        cashReward: Number(row['cashReward']),
        perkDescription: String(row['perkDescription'])
      }))
    } as CompensationPlanRequest;

    this.compensationPlanService.update(request).subscribe({
      next: () => {
        this.serverFieldErrors = {};
        this.submitError = null;
        this.savedJustNow = true;
        this.setupService.refresh();
      },
      error: err => {
        this.savedJustNow = false;
        if (err.status === 409) {
          // RewardTierGapException's response body has no `fields` map, so it can't go
          // through the usual toFieldErrors() per-field path -- surface it as a banner instead.
          this.submitError = this.translate.instant('setup.compensation.validation.rewardTierGap');
          return;
        }
        const fields = toFieldErrors(err);
        const hasVisibleFieldError = RENDERED_FIELD_ERROR_KEYS.some(key => key in fields);
        if (hasVisibleFieldError) {
          // At least one returned field maps to a control that renders <app-field-error>.
          this.submitError = null;
          this.serverFieldErrors = fields;
        } else {
          // Nothing in `fields` (a plain 500) or only keys with no visible field-error slot
          // (settlementCycle, royaltyBonusRates, rewardTiers) -- without this, the error would
          // be entirely invisible since autosave is the only save path.
          this.serverFieldErrors = {};
          this.submitError = this.translate.instant('setup.compensation.validation.genericSaveError');
        }
      }
    });
  }
}
