import { AfterViewInit, Component, Input, OnDestroy, OnInit, TemplateRef, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subject, Subscription, merge } from 'rxjs';
import { debounceTime, takeUntil, tap } from 'rxjs/operators';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';
import { StatTileComponent } from '../../../shared/components/stat-tile/stat-tile.component';
import { ToggleGroupComponent, ToggleOption } from '../../../shared/components/toggle-group/toggle-group.component';
import { EditableTableColumn, EditableTableComponent } from '../../../shared/components/editable-table/editable-table.component';
import { SetupStepNavComponent } from '../../../shared/components/setup-step-nav/setup-step-nav.component';
import { toFieldErrors } from '../../../core/api/field-errors.model';
import { CompensationPlanService } from './compensation-plan.service';
import { computeSampleEarnings, SampleEarningsResult } from './sample-earnings';
import { SetupService } from '../../setup.service';
import { SetupInspectorService, SetupStepController } from '../../setup-inspector.service';
import { CompensationPlanRequest, SettlementCycle } from '../../models/compensation-plan.model';

const DEFAULT_SCENARIO_VOLUME = 1000000; // spec example: "sells ₹10L on each leg"

const SETTLEMENT_CYCLES: SettlementCycle[] = ['SEMI_MONTHLY', 'MONTHLY', 'CUSTOM'];

function isSettlementCycle(value: string): value is SettlementCycle {
  return SETTLEMENT_CYCLES.some(cycle => cycle === value);
}

type AccordionSection = 'incomeRules' | 'rewardTiers' | 'royalty' | 'fees';

// A table row only reaches the save trigger once it is fully filled in. Clicking "+ Add" emits a
// (rowsChange) with a blank row, which would otherwise autosave a volumeThreshold of 0 (fails the
// backend's @DecimalMin("0.01")) and show an error banner for the ordinary act of adding a row.
function isFilledNumber(value: string | number | undefined): boolean {
  // 0 is legitimate for royaltyPct/cashReward, so only blank/non-numeric is incomplete.
  return value !== undefined && value !== null && String(value).trim() !== '' && !Number.isNaN(Number(value));
}

function isCompleteRoyaltyRow(row: Record<string, string | number>): boolean {
  return isFilledNumber(row['volumeThreshold']) && Number(row['volumeThreshold']) > 0 && isFilledNumber(row['royaltyPct']);
}

function isCompleteRewardTierRow(row: Record<string, string | number>): boolean {
  return isFilledNumber(row['volumeThreshold']) && Number(row['volumeThreshold']) > 0 && isFilledNumber(row['cashReward']);
}

// The only form fields with a visible <app-field-error> in the template. A server-side
// field error keyed on anything else (settlementCycle, royaltyBonusRates, rewardTiers,
// minWithdrawal -- hidden per B2, see the template comment where it used to render -- or an
// unkeyed 500) would otherwise render nothing at all -- those get routed to submitError instead.
const RENDERED_FIELD_ERROR_KEYS = [
  'directIncomePct',
  'matchingIncomePct',
  'sponsorMatchingPct',
  'tdsPct',
  'adminChargeWithPanPct',
  'adminChargeWithoutPanPct',
  'activationFee'
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
    EditableTableComponent,
    SetupStepNavComponent
  ],
  template: `
    <div class="compensation-step">
      <div class="compensation-step__intro">
        <span *ngIf="mode !== 'settings'" class="compensation-step__eyebrow">
          {{ 'setup.compensation.stepEyebrowLabel' | translate: { number: stepNumber, count: stepCount } }}
        </span>
        <h1 class="compensation-step__title">{{ 'setup.steps.compensation' | translate }}</h1>
        <p class="compensation-step__subtitle">{{ 'setup.compensation.subtitle' | translate }}</p>
      </div>

      <form class="card compensation-step__card" [formGroup]="form">
        <app-inline-banner tone="info">
          {{ 'setup.compensation.versioningNotice' | translate }}
        </app-inline-banner>

        <div class="compensation-step__accordion">
        <div class="compensation-step__accordion-item">
          <button
            type="button"
            class="compensation-step__accordion-header compensation-step__accordion-header--incomeRules"
            [class.is-expanded]="isExpanded('incomeRules')"
            [attr.aria-expanded]="isExpanded('incomeRules')"
            aria-controls="compensation-accordion-income-rules"
            (click)="toggleSection('incomeRules')"
          >
            <span class="material-symbols-outlined">payments</span>
            <span class="compensation-step__accordion-title">
              {{ 'setup.compensation.sections.incomeRules' | translate }}
            </span>
            <span class="compensation-step__accordion-summary" *ngIf="!isExpanded('incomeRules')">
              {{ incomeRulesSummary }}
            </span>
            <span class="material-symbols-outlined compensation-step__accordion-chevron">
              {{ isExpanded('incomeRules') ? 'expand_less' : 'chevron_right' }}
            </span>
          </button>
          <div
            id="compensation-accordion-income-rules"
            class="compensation-step__accordion-body"
            [hidden]="!isExpanded('incomeRules')"
          >
          <div class="compensation-step__row compensation-step__row--stats">
            <div class="compensation-step__stat">
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
            </div>

            <div class="compensation-step__stat">
              <app-stat-tile
                tone="accent"
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
            </div>

            <div class="compensation-step__stat">
              <app-stat-tile
                tone="success"
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
          </div>
          </div>
        </div>

        <div class="compensation-step__accordion-item">
          <button
            type="button"
            class="compensation-step__accordion-header compensation-step__accordion-header--rewardTiers"
            [class.is-expanded]="isExpanded('rewardTiers')"
            [attr.aria-expanded]="isExpanded('rewardTiers')"
            aria-controls="compensation-accordion-reward-tiers"
            (click)="toggleSection('rewardTiers')"
          >
            <span class="material-symbols-outlined">military_tech</span>
            <span class="compensation-step__accordion-title">
              {{ 'setup.compensation.sections.rewardTiers' | translate }}
            </span>
            <span class="compensation-step__accordion-summary" *ngIf="!isExpanded('rewardTiers')">
              {{ rewardTiersSummary }}
            </span>
            <span class="material-symbols-outlined compensation-step__accordion-chevron">
              {{ isExpanded('rewardTiers') ? 'expand_less' : 'chevron_right' }}
            </span>
          </button>
          <div
            id="compensation-accordion-reward-tiers"
            class="compensation-step__accordion-body"
            [hidden]="!isExpanded('rewardTiers')"
          >
              <app-editable-table
                [columns]="rewardTierColumns"
                [rows]="rewardTierRows"
                [addRowLabel]="'setup.compensation.addRewardTierRowLabel' | translate"
                [removeRowLabel]="'setup.compensation.removeRowLabel' | translate"
                [emptyStateLabel]="'setup.compensation.rewardTiersEmptyLabel' | translate"
                (rowsChange)="onRewardTierRowsChange($event)"
              ></app-editable-table>
          </div>
        </div>

        <div class="compensation-step__accordion-item">
          <button
            type="button"
            class="compensation-step__accordion-header compensation-step__accordion-header--royalty"
            [class.is-expanded]="isExpanded('royalty')"
            [attr.aria-expanded]="isExpanded('royalty')"
            aria-controls="compensation-accordion-royalty"
            (click)="toggleSection('royalty')"
          >
            <span class="material-symbols-outlined">workspace_premium</span>
            <span class="compensation-step__accordion-title">
              {{ 'setup.compensation.sections.globalRoyalty' | translate }}
            </span>
            <span class="compensation-step__accordion-summary" *ngIf="!isExpanded('royalty')">
              {{ royaltySummary }}
            </span>
            <span class="material-symbols-outlined compensation-step__accordion-chevron">
              {{ isExpanded('royalty') ? 'expand_less' : 'chevron_right' }}
            </span>
          </button>
          <div
            id="compensation-accordion-royalty"
            class="compensation-step__accordion-body"
            [hidden]="!isExpanded('royalty')"
          >
              <app-editable-table
                [columns]="royaltyColumns"
                [rows]="royaltyRows"
                [addRowLabel]="'setup.compensation.addRoyaltyRowLabel' | translate"
                [removeRowLabel]="'setup.compensation.removeRowLabel' | translate"
                [emptyStateLabel]="'setup.compensation.royaltyEmptyLabel' | translate"
                (rowsChange)="onRoyaltyRowsChange($event)"
              ></app-editable-table>
          </div>
        </div>

        <div class="compensation-step__accordion-item">
          <button
            type="button"
            class="compensation-step__accordion-header compensation-step__accordion-header--fees"
            [class.is-expanded]="isExpanded('fees')"
            [attr.aria-expanded]="isExpanded('fees')"
            aria-controls="compensation-accordion-fees"
            (click)="toggleSection('fees')"
          >
            <span class="material-symbols-outlined">account_balance</span>
            <span class="compensation-step__accordion-title">
              {{ 'setup.compensation.sections.feesSettlement' | translate }}
            </span>
            <span class="compensation-step__accordion-summary" *ngIf="!isExpanded('fees')">
              {{ feesSummary }}
            </span>
            <span class="material-symbols-outlined compensation-step__accordion-chevron">
              {{ isExpanded('fees') ? 'expand_less' : 'chevron_right' }}
            </span>
          </button>
          <div
            id="compensation-accordion-fees"
            class="compensation-step__accordion-body"
            [hidden]="!isExpanded('fees')"
          >
          <label>
            {{ 'setup.compensation.settlementCycleLabel' | translate }}
            <app-toggle-group
              [options]="settlementCycleOptions"
              [value]="form.value.settlementCycle || null"
              (valueChange)="setSettlementCycle($event)"
            ></app-toggle-group>
          </label>

          <div class="compensation-step__row">
            <label>
              {{ 'setup.compensation.tdsLabel' | translate }}
              <input type="number" formControlName="tdsPct" (blur)="markTouched('tdsPct')" />
            </label>
            <label>
              {{ 'setup.compensation.adminChargeWithPanLabel' | translate }}
              <input
                type="number"
                formControlName="adminChargeWithPanPct"
                (blur)="markTouched('adminChargeWithPanPct')"
              />
            </label>
          </div>
          <div class="compensation-step__field-errors">
            <app-field-error [message]="fieldError('tdsPct')"></app-field-error>
            <app-field-error [message]="fieldError('adminChargeWithPanPct')"></app-field-error>
          </div>

          <div class="compensation-step__row">
            <label>
              {{ 'setup.compensation.adminChargeWithoutPanLabel' | translate }}
              <input
                type="number"
                formControlName="adminChargeWithoutPanPct"
                (blur)="markTouched('adminChargeWithoutPanPct')"
              />
            </label>
            <label>
              {{ 'setup.compensation.activationFeeLabel' | translate }}
              <input type="number" formControlName="activationFee" (blur)="markTouched('activationFee')" />
            </label>
          </div>
          <div class="compensation-step__field-errors">
            <app-field-error [message]="fieldError('adminChargeWithoutPanPct')"></app-field-error>
            <app-field-error [message]="fieldError('activationFee')"></app-field-error>
          </div>

          <!--
            minWithdrawal is intentionally not rendered here: this control backs the legacy
            compensation_plan_version.min_withdrawal column, a distinct setting from the real
            Go-Live-gating field (withdrawal_config.minimum_withdrawal_amount, surfaced on the
            Payments & KYC step's Withdrawal Approval card). Showing both under a near-identical
            label was the source of QA finding B2. The control/validator stay registered on the
            form below so the compensation PUT keeps sending its current/default value -- the
            NOT NULL DB column still requires it on every save.
          -->
          </div>
        </div>
        </div>

        <app-inline-banner *ngIf="submitError" tone="danger">{{ submitError }}</app-inline-banner>

        <app-setup-step-nav *ngIf="mode === 'settings'" [savedJustNow]="savedJustNow" [mode]="mode"></app-setup-step-nav>
      </form>
    </div>

    <ng-template #inspectorTpl>
      <div class="compensation-step__aside-column">
        <div class="compensation-step__intro compensation-step__intro--spacer" aria-hidden="true">
          <span class="compensation-step__eyebrow">
            {{ 'setup.compensation.stepEyebrowLabel' | translate: { number: stepNumber, count: stepCount } }}
          </span>
          <h1 class="compensation-step__title">{{ 'setup.steps.compensation' | translate }}</h1>
          <p class="compensation-step__subtitle">{{ 'setup.compensation.subtitle' | translate }}</p>
        </div>

        <div class="compensation-step__simulator">
          <h4 class="compensation-step__simulator-title">
            <span class="compensation-step__simulator-title-rule" aria-hidden="true"></span>
            <span>{{ 'setup.compensation.sections.earningsSimulator' | translate }}</span>
            <span class="compensation-step__simulator-title-rule" aria-hidden="true"></span>
          </h4>

          <label class="compensation-step__simulator-field">
            {{ 'setup.compensation.scenarioVolumeLabel' | translate }}
            <input type="number" [value]="scenarioVolume" (input)="setScenarioVolume($event)" />
          </label>

          <label class="compensation-step__simulator-checkbox">
            <input type="checkbox" [checked]="hasPan" (change)="setHasPan($event)" />
            {{ 'setup.compensation.hasPanLabel' | translate }}
          </label>

          <dl class="compensation-step__simulator-breakdown" *ngIf="sampleEarnings as earnings">
            <div class="compensation-step__simulator-line">
              <dt>{{ 'setup.compensation.directIncomeLineLabel' | translate }}</dt>
              <dd>{{ earnings.directIncome | currency:'INR':'symbol':'1.0-2' }}</dd>
            </div>
            <div class="compensation-step__simulator-line">
              <dt>{{ 'setup.compensation.matchingIncomeLineLabel' | translate }}</dt>
              <dd>{{ earnings.matchingIncome | currency:'INR':'symbol':'1.0-2' }}</dd>
            </div>
            <div class="compensation-step__simulator-line">
              <dt>{{ 'setup.compensation.sponsorBonusLineLabel' | translate }}</dt>
              <dd>{{ earnings.sponsorBonus | currency:'INR':'symbol':'1.0-2' }}</dd>
            </div>
            <div class="compensation-step__simulator-line">
              <dt>{{ 'setup.compensation.royaltyBonusLineLabel' | translate }}</dt>
              <dd>{{ earnings.royaltyBonus | currency:'INR':'symbol':'1.0-2' }}</dd>
            </div>
            <div class="compensation-step__simulator-line">
              <dt>{{ 'setup.compensation.grossIncomeLineLabel' | translate }}</dt>
              <dd>{{ earnings.grossIncome | currency:'INR':'symbol':'1.0-2' }}</dd>
            </div>
            <div class="compensation-step__simulator-line compensation-step__simulator-line--deduction">
              <dt>{{ 'setup.compensation.adminChargeLineLabel' | translate }}</dt>
              <dd>{{ earnings.adminCharge | currency:'INR':'symbol':'1.0-2' }}</dd>
            </div>
            <div class="compensation-step__simulator-line compensation-step__simulator-line--deduction">
              <dt>{{ 'setup.compensation.tdsLineLabel' | translate }}</dt>
              <dd>{{ earnings.tds | currency:'INR':'symbol':'1.0-2' }}</dd>
            </div>
          </dl>

          <div class="compensation-step__simulator-total" *ngIf="sampleEarnings as earnings">
            <span>{{ 'setup.compensation.finalEarningsLineLabel' | translate }}</span>
            <strong class="compensation-step__final-earnings">
              {{ earnings.finalEarnings | currency:'INR':'symbol':'1.0-2' }}
            </strong>
          </div>
        </div>
      </div>
    </ng-template>
  `
})
export class CompensationStepComponent implements OnInit, AfterViewInit, OnDestroy, SetupStepController {
  private fb = inject(FormBuilder);
  private compensationPlanService = inject(CompensationPlanService);
  private setupService = inject(SetupService);
  private inspectorService = inject(SetupInspectorService);
  private translate = inject(TranslateService);
  private route = inject(ActivatedRoute);
  private destroyed$ = new Subject<void>();
  private planSubscription?: Subscription;
  // royaltyRows/rewardTierRows aren't form controls, so they don't flow through
  // form.valueChanges -- this feeds their edits into the same debounced save arm.
  private rowsChanged$ = new Subject<void>();

  @ViewChild('inspectorTpl') private inspectorTpl!: TemplateRef<unknown>;

  // nonNullable so getRawValue() is assignable to CompensationPlanRequest without a cast -- the
  // cast that previously hid effectiveFrom being missing from the payload entirely.
  form = this.fb.nonNullable.group({
    directIncomePct: [0, [Validators.required, Validators.min(0), Validators.max(100)]],
    matchingIncomePct: [0, [Validators.required, Validators.min(0), Validators.max(100)]],
    sponsorMatchingPct: [0, [Validators.required, Validators.min(0), Validators.max(100)]],
    settlementCycle: this.fb.nonNullable.control<SettlementCycle>('SEMI_MONTHLY', Validators.required),
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

  // Local-only inputs for the Earnings Simulator -- never persisted/saved.
  scenarioVolume = DEFAULT_SCENARIO_VOLUME;
  hasPan = true;
  sampleEarnings: SampleEarningsResult | null = null;

  // Accordion layout (mockup 1c): exactly one section expanded at a time. This is purely a
  // display concern -- every control below stays mounted via [hidden], never *ngIf, so
  // valueChanges/rowsChanged$/autosave/validation all keep working on a collapsed section.
  expandedSection: AccordionSection = 'incomeRules';

  @Input() mode: 'setup' | 'settings' = 'setup';

  savedJustNow = false;
  stepNumber = 1;
  stepCount = 1;
  submitError: string | null = null;
  // Set when the initial GET fails. Without it the form would keep its constructor-default
  // zeros and the very next keystroke's autosave would PUT those zeros over the live plan.
  loadFailed = false;
  private serverFieldErrors: Record<string, string> = {};

  ngOnInit(): void {
    this.mode = (this.route.snapshot.data['mode'] as 'setup' | 'settings') ?? 'setup';
    this.planSubscription = this.compensationPlanService.getCurrent().subscribe({
      next: res => {
        this.form.patchValue(res, { emitEvent: false });
        this.royaltyRows = res.royaltyBonusRates.map(r => ({ volumeThreshold: r.volumeThreshold, royaltyPct: r.royaltyPct }));
        this.rewardTierRows = [...res.rewardTiers]
          .sort((a, b) => a.tierLevel - b.tierLevel)
          .map(t => ({ volumeThreshold: t.volumeThreshold, cashReward: t.cashReward, perkDescription: t.perkDescription }));
        // patchValue with emitEvent:false suppresses both the preview and the debounced-save
        // arms below -- so the initial preview needs this explicit one-time call.
        this.recomputeSampleEarnings();
      },
      error: () => {
        this.loadFailed = true;
        this.submitError = this.translate.instant('setup.compensation.validation.loadFailed');
      }
    });

    this.setupService
      .getState()
      .pipe(takeUntil(this.destroyed$))
      .subscribe(state => {
        const step = state.steps.find(s => s.key === 'compensation');
        this.stepNumber = step?.number ?? 1;
        this.stepCount = state.steps.length;
      });

    // Undebounced: instant, local-only Earnings Simulator repaint, no network.
    this.form.valueChanges.pipe(takeUntil(this.destroyed$)).subscribe(() => this.recomputeSampleEarnings());

    // Debounced: same cadence as the other steps' autosave. Also fed by rowsChanged$ so that
    // royalty/reward-tier table edits -- which never touch the form -- reach save() too.
    merge(this.form.valueChanges, this.rowsChanged$)
      .pipe(
        takeUntil(this.destroyed$),
        // Marked here rather than relying solely on Angular's own dirty tracking -- settlementCycle
        // is set programmatically via setSettlementCycle() (the toggle group's output), and the
        // royalty/reward-tier rows aren't form controls at all, so neither marks the form dirty
        // on its own.
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
      // hideFooter: false -- the aside only holds the Earnings Simulator here (no nav), so the
      // shared setup-shell footer stays visible and handles Previous/Next/Saved, matching the
      // Stitch mockup's shared bottom bar.
      this.inspectorService.register(this.inspectorTpl, { hideFooter: false });
    }
  }

  // SetupStepController: lets SetupStepNavComponent flush an edit (form field or royalty/reward
  // row) still sitting in the 400ms autosave debounce before it navigates away.
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
    this.planSubscription?.unsubscribe();
    this.inspectorService.clear();
  }

  get royaltyColumns(): EditableTableColumn[] {
    return [
      { key: 'volumeThreshold', label: this.translate.instant('setup.compensation.volumeThresholdColumnLabel'), type: 'number' },
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

  isExpanded(section: AccordionSection): boolean {
    return this.expandedSection === section;
  }

  toggleSection(section: AccordionSection): void {
    this.expandedSection = section;
  }

  get incomeRulesSummary(): string {
    const raw = this.form.value;
    return this.translate.instant('setup.compensation.accordion.incomeRulesSummary', {
      direct: raw.directIncomePct ?? 0,
      matching: raw.matchingIncomePct ?? 0,
      sponsor: raw.sponsorMatchingPct ?? 0
    });
  }

  get rewardTiersSummary(): string {
    return this.rewardTierRows.length === 0
      ? this.translate.instant('setup.compensation.accordion.rewardTiersSummaryEmpty')
      : this.translate.instant('setup.compensation.accordion.rewardTiersSummary', { count: this.rewardTierRows.length });
  }

  get royaltySummary(): string {
    return this.royaltyRows.length === 0
      ? this.translate.instant('setup.compensation.accordion.royaltySummaryEmpty')
      : this.translate.instant('setup.compensation.accordion.royaltySummary', { count: this.royaltyRows.length });
  }

  get feesSummary(): string {
    const raw = this.form.value;
    const cycleLabel = this.settlementCycleOptions.find(option => option.value === raw.settlementCycle)?.label ?? '';
    return this.translate.instant('setup.compensation.accordion.feesSummary', {
      cycle: cycleLabel,
      tds: raw.tdsPct ?? 0,
      withPan: raw.adminChargeWithPanPct ?? 0,
      withoutPan: raw.adminChargeWithoutPanPct ?? 0
    });
  }

  onRoyaltyRowsChange(rows: Record<string, string | number>[]): void {
    // Local state + preview always update; only the SAVE trigger waits for a complete row, so
    // clicking "+ Add" doesn't fire an autosave that is guaranteed to fail validation.
    this.royaltyRows = rows;
    this.recomputeSampleEarnings();
    if (rows.length > 0 && rows.every(isCompleteRoyaltyRow)) {
      this.rowsChanged$.next();
    }
  }

  onRewardTierRowsChange(rows: Record<string, string | number>[]): void {
    this.rewardTierRows = rows;
    this.recomputeSampleEarnings();
    if (rows.length > 0 && rows.every(isCompleteRewardTierRow)) {
      this.rowsChanged$.next();
    }
  }

  setSettlementCycle(value: string): void {
    // Narrowed rather than cast: the toggle group is built from SETTLEMENT_CYCLES, so anything
    // else is not a value this form can hold.
    if (isSettlementCycle(value)) {
      this.form.controls.settlementCycle.setValue(value);
    }
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
    // The form never got the server's values, so everything in it is a constructor default.
    // Saving now would overwrite the real plan with zeros.
    if (this.loadFailed) {
      return;
    }
    this.form.markAsPristine();
    const formValue = this.form.getRawValue();
    // Typed at the declaration (no `as` cast) so the compiler actually checks this shape --
    // effectiveFrom is intentionally omitted and the backend defaults it to today.
    const request: CompensationPlanRequest = {
      ...formValue,
      // royaltyRows carried through as-is (field names already match RoyaltyBonusRate); only
      // type coercion is needed since editable-table cell values round-trip through the DOM as
      // strings.
      royaltyBonusRates: this.royaltyRows.map(row => ({
        volumeThreshold: Number(row['volumeThreshold']),
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
    };

    this.compensationPlanService.update(request).subscribe({
      next: () => {
        this.serverFieldErrors = {};
        this.submitError = null;
        this.savedJustNow = true;
        this.inspectorService.setSaved(true);
        this.setupService.refresh();
      },
      error: err => {
        // Re-mark dirty: see the matching comment in company-profile-step.component.ts's save()
        // error handler -- a failed save must not leave the form looking pristine, regardless of
        // which branch below runs.
        this.form.markAsDirty();
        this.savedJustNow = false;
        this.inspectorService.setSaved(false);
        if (err.status === 409) {
          // A 409 here is one of several distinct conflicts (reward-tier gap, non-increasing
          // thresholds, or another admin already owning today's version), and the body has no
          // `fields` map to route per-field. Show the server's own message rather than guessing
          // at one -- same convention as branding-step.component.ts's logo upload errors.
          this.serverFieldErrors = {};
          this.submitError =
            err.error?.error ?? this.translate.instant('setup.compensation.validation.genericSaveError');
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
