import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Observable } from 'rxjs';
import { ChecklistRowComponent } from '../../../shared/components/checklist-row/checklist-row.component';
import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';
import { BrandButtonComponent } from '../../../shared/components/brand-button/brand-button.component';
import { SetupService } from '../../setup.service';
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
    BrandButtonComponent
  ],
  template: `
    <div class="review-launch-step step-grid" *ngIf="(state$ | async) as state">
      <div class="card review-launch-step__checklist">
        <h1 class="card-title">{{ 'setup.reviewLaunch.checklistTitle' | translate }}</h1>
        <app-checklist-row
          *ngFor="let step of summarySteps(state)"
          [label]="'setup.steps.' + step.key | translate"
          [complete]="step.complete"
          [badgeLabel]="badgeLabel(step)"
          [editLabel]="'setup.reviewLaunch.editLabel' | translate"
          [editHref]="'/setup/' + stepPaths[step.key]"
        ></app-checklist-row>
      </div>

      <div class="card review-launch-step__launch">
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
            [disabled]="!state.canGoLive || !termsAccepted || launching"
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
    </div>
  `
})
export class ReviewLaunchStepComponent {
  private setupService = inject(SetupService);
  private translate = inject(TranslateService);

  readonly stepPaths = STEP_PATHS;
  readonly state$: Observable<SetupStateResponse> = this.setupService.getState();

  termsAccepted = false;
  launching = false;
  launched = false;
  launchError?: string;

  summarySteps(state: SetupStateResponse): StepStatus[] {
    return state.steps.filter(s => s.key !== 'reviewLaunch');
  }

  badgeLabel(step: StepStatus): string | undefined {
    if (step.complete) {
      return this.translate.instant('setup.reviewLaunch.completeBadge');
    }
    if (step.required) {
      return this.translate.instant('setup.reviewLaunch.blockingBadge');
    }
    return undefined;
  }

  blockingStepLabels(state: SetupStateResponse): string {
    return state.steps
      .filter(s => s.required && !s.complete)
      .map(s => this.translate.instant('setup.steps.' + s.key))
      .join(', ');
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
