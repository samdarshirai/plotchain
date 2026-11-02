import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { BrandButtonComponent } from '../../../shared/components/brand-button/brand-button.component';
import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';
import { NewAssociatePanelComponent } from '../../../admin/new-associate-panel/new-associate-panel.component';
import { SetupService } from '../../setup.service';
import { SetupInspectorService, SetupStepController } from '../../setup-inspector.service';

// Onboarding step: the admin creates the root user -- a regular ASSOCIATE with no sponsor who sits
// at the top of the placement tree. The admin account itself is back-office only and never joins
// the tree. Reuses the shared add-associate panel in rootMode (no sponsor required).
@Component({
  selector: 'app-root-user-step',
  standalone: true,
  imports: [CommonModule, TranslateModule, BrandButtonComponent, InlineBannerComponent, NewAssociatePanelComponent],
  template: `
    <div class="root-user-step">
      <div class="root-user-step__intro">
        <span class="root-user-step__eyebrow">
          {{ 'setup.reviewLaunch.stepEyebrowLabel' | translate: { number: stepNumber, count: stepCount } }}
        </span>
        <h1 class="root-user-step__title">{{ 'setup.steps.rootUser' | translate }}</h1>
        <p class="root-user-step__subtitle">{{ 'setup.rootUser.subtitle' | translate }}</p>
      </div>

      <div class="card root-user-step__card">
        <app-inline-banner *ngIf="complete" tone="success">{{ 'setup.rootUser.doneBody' | translate }}</app-inline-banner>
        <ng-container *ngIf="!complete">
          <p class="root-user-step__body">{{ 'setup.rootUser.body' | translate }}</p>
          <app-brand-button variant="primary" type="button" (clicked)="open = true">
            {{ 'setup.rootUser.createAction' | translate }}
          </app-brand-button>
        </ng-container>
      </div>
    </div>

    <app-new-associate-panel
      [open]="open"
      [rootMode]="true"
      (created)="onCreated()"
      (closed)="open = false"
    ></app-new-associate-panel>
  `
})
export class RootUserStepComponent implements OnInit, OnDestroy, SetupStepController {
  private setupService = inject(SetupService);
  private inspectorService = inject(SetupInspectorService);
  private destroyed$ = new Subject<void>();

  open = false;
  complete = false;
  stepNumber = 1;
  stepCount = 1;

  ngOnInit(): void {
    this.setupService
      .getState()
      .pipe(takeUntil(this.destroyed$))
      .subscribe(state => {
        const step = state.steps.find(s => s.key === 'rootUser');
        this.complete = !!step?.complete;
        this.stepNumber = step?.number ?? 1;
        this.stepCount = state.steps.length;
      });
    this.inspectorService.registerStep(this);
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
    this.inspectorService.clear();
  }

  onCreated(): void {
    this.setupService.refresh();
  }

  // SetupStepController: nothing autosaved; Next is allowed only once the root user exists.
  flushPendingSave(): void {}

  isStepValid(): boolean {
    return this.complete;
  }
}
