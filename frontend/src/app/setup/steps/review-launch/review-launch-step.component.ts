import { AfterViewInit, Component, OnDestroy, OnInit, TemplateRef, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ChecklistRowComponent, ChecklistRowTone } from '../../../shared/components/checklist-row/checklist-row.component';
import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';
import { BrandButtonComponent } from '../../../shared/components/brand-button/brand-button.component';
import { StatTileComponent } from '../../../shared/components/stat-tile/stat-tile.component';
import { SetupService } from '../../setup.service';
import { SetupInspectorService, SetupStepController } from '../../setup-inspector.service';
import { SetupStateResponse, STEP_PATHS, StepStatus } from '../../models/setup-state.model';

@Component({
  selector: 'app-review-launch-step',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    TranslateModule,
    ChecklistRowComponent,
    InlineBannerComponent,
    BrandButtonComponent,
    StatTileComponent
  ],
  template: `
    <div class="review-launch-step" *ngIf="(state$ | async) as state">
      <div class="review-launch-step__intro">
        <span class="review-launch-step__eyebrow">
          {{ 'setup.reviewLaunch.stepEyebrowLabel' | translate: { number: stepNumber, count: stepCount } }}
        </span>
        <h1 class="review-launch-step__title">{{ 'setup.steps.reviewLaunch' | translate }}</h1>
        <p class="review-launch-step__subtitle">{{ 'setup.reviewLaunch.subtitle' | translate }}</p>
      </div>

      <div class="card review-launch-step__status">
        <h2 class="card-title">{{ 'setup.reviewLaunch.checklistTitle' | translate }}</h2>
        <app-checklist-row
          *ngFor="let step of summarySteps(state)"
          [label]="'setup.steps.' + step.key | translate"
          [tone]="rowTone(step)"
          [badgeLabel]="badgeLabel(step)"
          [editLabel]="'setup.reviewLaunch.editLabel' | translate"
          [editHref]="'/setup/' + stepPaths[step.key]"
        ></app-checklist-row>
      </div>

      <div class="review-launch-step__stats">
        <app-stat-tile
          [label]="'setup.reviewLaunch.requiredStepsLabel' | translate"
          [value]="requiredStepsSummary(state)"
        ></app-stat-tile>
        <app-stat-tile
          tone="accent"
          [label]="'setup.reviewLaunch.optionalModulesLabel' | translate"
          [value]="optionalStepsSummary(state)"
        ></app-stat-tile>
      </div>
    </div>

    <ng-template #inspectorTpl>
      <div class="card review-launch-step__launch" *ngIf="(state$ | async) as state">
        <ng-container *ngIf="!launched; else launchedPanel">
          <div class="review-launch-step__all-set" *ngIf="state.canGoLive">
            <h2>{{ 'setup.reviewLaunch.allSetTitle' | translate }}</h2>
            <p>{{ 'setup.reviewLaunch.allSetBody' | translate }}</p>
          </div>
          <app-inline-banner *ngIf="!state.canGoLive" tone="warning">
            {{ 'setup.reviewLaunch.blockedBody' | translate: { steps: blockingStepLabels(state) } }}
          </app-inline-banner>

          <label class="review-launch-step__terms">
            <input type="checkbox" [checked]="termsAccepted" (change)="termsAccepted = $any($event.target).checked" />
            {{ 'setup.reviewLaunch.termsLabel' | translate }}
          </label>
          <div class="review-launch-step__terms-links">
            <a routerLink="/terms" target="_blank">{{ 'setup.reviewLaunch.termsLinkLabel' | translate }}</a>
            <a routerLink="/privacy" target="_blank">{{ 'setup.reviewLaunch.privacyLinkLabel' | translate }}</a>
          </div>

          <app-inline-banner *ngIf="launchError" tone="danger">{{ launchError }}</app-inline-banner>

          <app-brand-button
            variant="primary"
            [fullWidth]="true"
            [disabled]="goLiveDisabled(state)"
            (clicked)="goLive()"
          >
            {{ 'setup.reviewLaunch.goLiveLabel' | translate }}
          </app-brand-button>
        </ng-container>

        <ng-template #launchedPanel>
          <div class="review-launch-step__launched">
            <h2>{{ 'setup.reviewLaunch.launchedTitle' | translate }}</h2>
            <p>{{ 'setup.reviewLaunch.launchedBody' | translate }}</p>
          </div>
        </ng-template>
      </div>

    </ng-template>
  `
})
export class ReviewLaunchStepComponent implements OnInit, AfterViewInit, OnDestroy, SetupStepController {
  private setupService = inject(SetupService);
  private inspectorService = inject(SetupInspectorService);
  private translate = inject(TranslateService);
  private destroyed$ = new Subject<void>();

  @ViewChild('inspectorTpl') private inspectorTpl!: TemplateRef<unknown>;

  readonly stepPaths = STEP_PATHS;
  readonly state$: Observable<SetupStateResponse> = this.setupService.getState();
  readonly previousPath = this.setupService.previousStepPath('reviewLaunch');

  stepNumber = 1;
  stepCount = 1;

  termsAccepted = false;
  launching = false;
  launched = false;
  launchError?: string;

  ngOnInit(): void {
    this.setupService
      .getState()
      .pipe(takeUntil(this.destroyed$))
      .subscribe(state => {
        const step = state.steps.find(s => s.key === 'reviewLaunch');
        this.stepNumber = step?.number ?? 1;
        this.stepCount = state.steps.length;
      });

    this.inspectorService.registerStep(this);
  }

  ngAfterViewInit(): void {
    this.inspectorService.register(this.inspectorTpl, { hideFooter: false });
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
    this.inspectorService.clear();
  }

  // SetupStepController: this step has no autosaved form -- goLive() is its own explicit,
  // immediate action -- so there is nothing to flush.
  flushPendingSave(): void {}

  // SetupStepController: no form-gated required fields here (nextPath is always null; the Go
  // Live gate is state.canGoLive/termsAccepted, handled by goLiveDisabled()).
  isStepValid(): boolean {
    return true;
  }

  summarySteps(state: SetupStateResponse): StepStatus[] {
    return state.steps.filter(s => s.key !== 'reviewLaunch');
  }

  rowTone(step: StepStatus): ChecklistRowTone {
    if (step.complete) {
      return 'complete';
    }
    return step.required ? 'blocking' : 'optional';
  }

  badgeLabel(step: StepStatus): string | undefined {
    if (step.complete) {
      return this.translate.instant('setup.reviewLaunch.completeBadge');
    }
    if (step.required) {
      return this.translate.instant('setup.reviewLaunch.blockingBadge');
    }
    return this.translate.instant('setup.optionalLabel');
  }

  requiredStepsSummary(state: SetupStateResponse): string {
    const required = this.summarySteps(state).filter(s => s.required);
    return `${required.filter(s => s.complete).length}/${required.length}`;
  }

  optionalStepsSummary(state: SetupStateResponse): string {
    const optional = this.summarySteps(state).filter(s => !s.required);
    return `${optional.filter(s => s.complete).length}/${optional.length}`;
  }

  blockingStepLabels(state: SetupStateResponse): string {
    return state.steps
      .filter(s => s.required && !s.complete)
      .map(s => this.translate.instant('setup.steps.' + s.key))
      .join(', ');
  }

  goLiveDisabled(state: SetupStateResponse): boolean {
    return !state.canGoLive || !this.termsAccepted || this.launching;
  }

  goLive(): void {
    this.launching = true;
    this.launchError = undefined;
    this.setupService.launch(this.termsAccepted).subscribe({
      next: () => {
        this.launching = false;
        this.launched = true;
        this.setupService.refresh();
      },
      error: err => {
        this.launching = false;
        this.launchError = err.error?.error ?? this.translate.instant('setup.reviewLaunch.genericLaunchError');
      }
    });
  }
}
