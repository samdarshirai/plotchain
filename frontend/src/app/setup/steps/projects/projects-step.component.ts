import { Component, Input, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';
import { StatTileComponent } from '../../../shared/components/stat-tile/stat-tile.component';
import { TabBarComponent, TabDefinition } from '../../../shared/components/tab-bar/tab-bar.component';
import { BrandButtonComponent } from '../../../shared/components/brand-button/brand-button.component';
import { LogoUploaderComponent } from '../../../shared/components/logo-uploader/logo-uploader.component';
import { SetupStepNavComponent } from '../../../shared/components/setup-step-nav/setup-step-nav.component';
import { ProjectsService } from './projects.service';
import { SetupService } from '../../setup.service';
import { SetupInspectorService, SetupStepController } from '../../setup-inspector.service';
import { CsvValidationResponse, PlotPageResponse, PlotStatus, PlotType, Project } from '../../models/project.model';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-projects-step',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    FieldErrorComponent,
    InlineBannerComponent,
    StatTileComponent,
    TabBarComponent,
    BrandButtonComponent,
    LogoUploaderComponent,
    SetupStepNavComponent
  ],
  template: `
    <div class="projects-step">
      <div class="projects-step__header">
        <div class="projects-step__intro">
          <span class="projects-step__eyebrow">
            {{ 'setup.projects.stepEyebrowLabel' | translate: { number: stepNumber, count: stepCount } }}
          </span>
          <h1 class="projects-step__title">{{ 'setup.steps.projects' | translate }}</h1>
          <p class="projects-step__subtitle">{{ 'setup.projects.subtitle' | translate }}</p>
        </div>
        <app-brand-button variant="primary" (clicked)="toggleAddProjectForm()">
          <span class="material-symbols-outlined">add_circle</span>
          {{ 'setup.projects.addProjectAction' | translate }}
        </app-brand-button>
      </div>

      <form class="card projects-step__add-form" [formGroup]="addProjectForm" *ngIf="showAddProjectForm">
        <div class="projects-step__row">
          <label>
            {{ 'setup.projects.nameLabel' | translate }}
            <input type="text" formControlName="name" />
          </label>
          <label>
            {{ 'setup.projects.locationLabel' | translate }}
            <input type="text" formControlName="location" />
          </label>
        </div>
        <app-field-error [message]="addProjectForm.get('name')?.touched && addProjectForm.get('name')?.errors?.['required'] ? ('setup.projects.validation.required' | translate) : undefined"></app-field-error>

        <app-logo-uploader
          [label]="'setup.projects.photoLabel' | translate"
          variant="wide"
          [hasLogo]="!!pendingThumbnailPreview"
          [logoUrl]="pendingThumbnailPreview ?? ''"
          [placeholderText]="'setup.projects.photoPlaceholderLabel' | translate"
          [uploadLabel]="'setup.projects.addPhotoAction' | translate"
          [changeLabel]="'setup.projects.changePhotoAction' | translate"
          (fileSelected)="onPendingThumbnailSelected($event)"
        ></app-logo-uploader>

        <app-brand-button type="button" variant="primary" (clicked)="submitAddProject()">
          {{ 'setup.projects.saveProjectAction' | translate }}
        </app-brand-button>
      </form>

      <ng-container *ngIf="projects.length > 0; else emptyProjects">
        <div class="projects-step__cards">
          <div
            class="card projects-step__card"
            *ngFor="let project of projects"
            [class.projects-step__card--selected]="project.id === selectedProjectId"
          >
            <div class="projects-step__card-thumb">
              <img *ngIf="thumbnailObjectUrls[project.id] as src; else thumbPlaceholder" [src]="src" alt="" />
              <ng-template #thumbPlaceholder>
                <span class="material-symbols-outlined">apartment</span>
              </ng-template>
            </div>

            <div class="projects-step__card-body">
              <div class="projects-step__card-heading">
                <div>
                  <h3 class="projects-step__card-title">{{ project.name }}</h3>
                  <p class="projects-step__card-location">
                    <span class="material-symbols-outlined">location_on</span>
                    {{ project.location }}
                  </p>
                </div>
                <button
                  type="button"
                  class="projects-step__icon-button"
                  [attr.aria-label]="'setup.projects.deleteAction' | translate"
                  (click)="deleteProject(project.id)"
                >
                  <span class="material-symbols-outlined">delete</span>
                </button>
              </div>

              <div class="projects-step__counts">
                <app-stat-tile [label]="'setup.projects.totalPlotsLabel' | translate" [value]="project.totalPlots.toString()"></app-stat-tile>
                <app-stat-tile tone="accent" [label]="'setup.projects.availablePlotsLabel' | translate" [value]="project.availablePlots.toString()"></app-stat-tile>
                <app-stat-tile [label]="'setup.projects.soldPlotsLabel' | translate" [value]="project.soldPlots.toString()"></app-stat-tile>
              </div>

              <div class="projects-step__card-footer">
                <div class="projects-step__progress">
                  <div class="projects-step__progress-fill" [style.width.%]="soldRatio(project)"></div>
                </div>
                <button type="button" class="projects-step__view-link" (click)="selectProject(project.id)">
                  {{ 'setup.projects.viewProjectAction' | translate }}
                  <span class="material-symbols-outlined">arrow_forward</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </ng-container>
      <ng-template #emptyProjects>
        <div class="card projects-step__empty">{{ 'setup.projects.emptyLabel' | translate }}</div>
      </ng-template>

      <div class="card projects-step__manage-card" *ngIf="selectedProject as project">
        <h2 class="projects-step__section-title">
          <span class="material-symbols-outlined">account_tree</span>
          {{ project.name }}
        </h2>

        <app-logo-uploader
          [label]="'setup.projects.photoLabel' | translate"
          variant="wide"
          [hasLogo]="!!thumbnailObjectUrls[project.id]"
          [logoUrl]="thumbnailObjectUrls[project.id]"
          [placeholderText]="'setup.projects.photoPlaceholderLabel' | translate"
          [uploadLabel]="'setup.projects.addPhotoAction' | translate"
          [changeLabel]="'setup.projects.changePhotoAction' | translate"
          (fileSelected)="onManageThumbnailSelected(project.id, $event)"
        ></app-logo-uploader>

        <app-tab-bar [tabs]="tabs" [activeTabId]="activeTab" (tabChange)="onTabChange($event)"></app-tab-bar>

        <div *ngIf="activeTab === 'plotList'">
          <form class="projects-step__add-plot-form" [formGroup]="plotForm">
            <div class="projects-step__row projects-step__row--plot-form">
              <label>
                {{ 'setup.projects.plotNoLabel' | translate }}
                <input type="text" formControlName="plotNo" />
              </label>
              <label>
                {{ 'setup.projects.plotTypeLabel' | translate }}
                <select formControlName="plotType">
                  <option value="NORMAL">{{ 'setup.projects.plotTypeNormalLabel' | translate }}</option>
                  <option value="CORNER">{{ 'setup.projects.plotTypeCornerLabel' | translate }}</option>
                </select>
              </label>
              <label>
                {{ 'setup.projects.areaLabel' | translate }}
                <input type="number" formControlName="areaSqft" />
              </label>
              <label>
                {{ 'setup.projects.rateLabel' | translate }}
                <input type="number" formControlName="rate" />
              </label>
              <label>
                {{ 'setup.projects.priceLabel' | translate }}
                <input type="number" formControlName="price" />
              </label>
              <label>
                {{ 'setup.projects.statusLabel' | translate }}
                <select formControlName="status">
                  <option value="AVAILABLE">{{ 'setup.projects.statusAvailableLabel' | translate }}</option>
                  <option value="BOOKED">{{ 'setup.projects.statusBookedLabel' | translate }}</option>
                  <option value="SOLD">{{ 'setup.projects.statusSoldLabel' | translate }}</option>
                </select>
              </label>
            </div>
            <app-brand-button type="button" variant="secondary" (clicked)="submitAddPlot()">
              <span class="material-symbols-outlined">add</span>
              {{ 'setup.projects.addPlotAction' | translate }}
            </app-brand-button>
          </form>

          <table class="projects-step__plot-table">
            <thead>
              <tr>
                <th>{{ 'setup.projects.plotNoLabel' | translate }}</th>
                <th>{{ 'setup.projects.plotTypeLabel' | translate }}</th>
                <th>{{ 'setup.projects.areaLabel' | translate }}</th>
                <th>{{ 'setup.projects.rateLabel' | translate }}</th>
                <th>{{ 'setup.projects.priceLabel' | translate }}</th>
                <th>{{ 'setup.projects.statusLabel' | translate }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let plot of plotPage?.plots">
                <td>{{ plot.plotNo }}</td>
                <td>{{ plotTypeLabel(plot.plotType) }}</td>
                <td>{{ plot.areaSqft }}</td>
                <td>{{ plot.rate }}</td>
                <td>{{ plot.price | currency:'INR':'symbol':'1.0-2' }}</td>
                <td>
                  <span class="projects-step__status-pill" [ngClass]="plotStatusClass(plot.status)">
                    {{ plotStatusLabel(plot.status) }}
                  </span>
                </td>
                <td>
                  <button
                    type="button"
                    class="projects-step__icon-button"
                    [attr.aria-label]="'setup.projects.deleteAction' | translate"
                    (click)="deletePlot(plot.id)"
                  >
                    <span class="material-symbols-outlined">delete</span>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>

          <div class="projects-step__pagination" *ngIf="plotPage">
            <app-brand-button variant="ghost" [disabled]="plotPage.page === 0" (clicked)="goToPage(plotPage.page - 1)">
              {{ 'setup.projects.previousPageAction' | translate }}
            </app-brand-button>
            <span class="projects-step__pagination-label">{{ 'setup.projects.showingLabel' | translate }}</span>
            <app-brand-button
              variant="ghost"
              [disabled]="(plotPage.page + 1) * plotPage.size >= plotPage.totalElements"
              (clicked)="goToPage(plotPage.page + 1)"
            >
              {{ 'setup.projects.nextPageAction' | translate }}
            </app-brand-button>
          </div>
        </div>

        <div class="projects-step__csv-panel" *ngIf="activeTab === 'importCsv'">
          <a [href]="csvTemplateUrl">{{ 'setup.projects.downloadTemplateAction' | translate }}</a>
          <input type="file" accept=".csv" (change)="onCsvFileSelected($event)" />
          <div class="projects-step__csv-actions">
            <app-brand-button variant="secondary" [disabled]="!csvFile" (clicked)="validateCsvFile()">
              {{ 'setup.projects.validateCsvAction' | translate }}
            </app-brand-button>
            <app-brand-button variant="primary" [disabled]="!canCommitCsv" (clicked)="commitCsvFile()">
              {{ 'setup.projects.commitCsvAction' | translate }}
            </app-brand-button>
          </div>

          <app-inline-banner *ngIf="csvSubmitError" tone="danger">{{ csvSubmitError }}</app-inline-banner>

          <div class="projects-step__csv-summary" *ngIf="csvValidation">
            <p>{{ 'setup.projects.csvSummaryLabel' | translate: { valid: csvValidation.validRows, total: csvValidation.totalRows } }}</p>
            <ul class="projects-step__csv-errors">
              <li *ngFor="let error of csvValidation.errors">{{ 'setup.projects.csvRowErrorLabel' | translate: { row: error.rowNumber, field: error.field, message: error.message } }}</li>
            </ul>
          </div>
        </div>
      </div>

      <app-setup-step-nav *ngIf="mode === 'settings'" [mode]="mode"></app-setup-step-nav>
    </div>
  `
})
export class ProjectsStepComponent implements OnInit, OnDestroy, SetupStepController {
  private fb = inject(FormBuilder);
  protected projectsService = inject(ProjectsService);
  private setupService = inject(SetupService);
  private inspectorService = inject(SetupInspectorService);
  private translate = inject(TranslateService);
  private route = inject(ActivatedRoute);
  private destroyed$ = new Subject<void>();

  @Input() mode: 'setup' | 'settings' = 'setup';

  stepNumber = 1;
  stepCount = 1;

  projects: Project[] = [];
  showAddProjectForm = false;
  addProjectForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
    location: ['', Validators.required]
  });
  pendingThumbnail: File | null = null;
  pendingThumbnailPreview: string | null = null;

  // Object URLs for fetched thumbnail blobs, keyed by project id (see ProjectsService.
  // getThumbnailBlob for why this can't just be a plain <img src="...">). Protected so the
  // template can index into it directly.
  protected thumbnailObjectUrls: Record<string, string> = {};

  selectedProjectId: string | null = null;
  activeTab: 'plotList' | 'importCsv' = 'plotList';
  plotPage: PlotPageResponse | null = null;

  plotForm = this.fb.nonNullable.group({
    plotNo: ['', Validators.required],
    plotType: this.fb.nonNullable.control<PlotType>('NORMAL', Validators.required),
    areaSqft: [0, [Validators.required, Validators.min(0.01)]],
    rate: [0, [Validators.required, Validators.min(0.01)]],
    price: [0, [Validators.required, Validators.min(0.01)]],
    status: this.fb.nonNullable.control<PlotStatus>('AVAILABLE')
  });

  csvFile: File | null = null;
  csvValidation: CsvValidationResponse | null = null;
  csvSubmitError: string | null = null;
  readonly csvTemplateUrl = this.projectsService.csvTemplateUrl();

  get tabs(): TabDefinition[] {
    return [
      { id: 'plotList', label: this.translate.instant('setup.projects.plotListTab') },
      { id: 'importCsv', label: this.translate.instant('setup.projects.importCsvTab') }
    ];
  }

  get canCommitCsv(): boolean {
    return !!this.csvFile && !!this.csvValidation && this.csvValidation.errors.length === 0;
  }

  get selectedProject(): Project | undefined {
    return this.projects.find(p => p.id === this.selectedProjectId);
  }

  ngOnInit(): void {
    this.mode = (this.route.snapshot.data['mode'] as 'setup' | 'settings') ?? 'setup';
    this.projectsService.listProjects().subscribe(projects => {
      this.projects = projects;
      projects.filter(p => p.hasThumbnail).forEach(p => this.loadThumbnail(p.id));
    });

    this.setupService
      .getState()
      .pipe(takeUntil(this.destroyed$))
      .subscribe(state => {
        const step = state.steps.find(s => s.key === 'projects');
        this.stepNumber = step?.number ?? 1;
        this.stepCount = state.steps.length;
      });

    this.inspectorService.registerStep(this);
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
    this.clearPendingThumbnail();
    Object.values(this.thumbnailObjectUrls).forEach(url => URL.revokeObjectURL(url));
    this.inspectorService.clear();
  }

  // SetupStepController: project/plot edits save immediately through their own explicit
  // Add/Save buttons (submitAddProject(), submitAddPlot(), commitCsvFile()) rather than a
  // debounced autosave, so there is nothing pending to flush before navigating away.
  flushPendingSave(): void {}

  // SetupStepController: no single form gates this step's Next -- required fields on the
  // inline add-project/add-plot forms are already enforced by their own submit handlers.
  isStepValid(): boolean {
    return true;
  }

  soldRatio(project: Project): number {
    return project.totalPlots > 0 ? Math.min(100, (project.soldPlots / project.totalPlots) * 100) : 0;
  }

  plotTypeLabel(type: PlotType): string {
    return this.translate.instant(type === 'CORNER' ? 'setup.projects.plotTypeCornerLabel' : 'setup.projects.plotTypeNormalLabel');
  }

  plotStatusLabel(status: PlotStatus): string {
    return this.translate.instant(`setup.projects.${this.plotStatusKey(status)}`);
  }

  plotStatusClass(status: PlotStatus): string {
    return `projects-step__status-pill--${status.toLowerCase()}`;
  }

  private plotStatusKey(status: PlotStatus): string {
    switch (status) {
      case 'BOOKED':
        return 'statusBookedLabel';
      case 'SOLD':
        return 'statusSoldLabel';
      default:
        return 'statusAvailableLabel';
    }
  }

  private loadThumbnail(projectId: string): void {
    this.projectsService.getThumbnailBlob(projectId).subscribe({
      next: blob => {
        this.releaseThumbnail(projectId);
        this.thumbnailObjectUrls = { ...this.thumbnailObjectUrls, [projectId]: URL.createObjectURL(blob) };
      },
      // Leave it unset on failure -- the card/uploader falls back to its placeholder.
      error: () => undefined
    });
  }

  private releaseThumbnail(projectId: string): void {
    const existing = this.thumbnailObjectUrls[projectId];
    if (existing) {
      URL.revokeObjectURL(existing);
    }
  }

  toggleAddProjectForm(): void {
    this.showAddProjectForm = !this.showAddProjectForm;
    if (!this.showAddProjectForm) {
      this.clearPendingThumbnail();
    }
  }

  onPendingThumbnailSelected(file: File): void {
    this.clearPendingThumbnail();
    this.pendingThumbnail = file;
    this.pendingThumbnailPreview = URL.createObjectURL(file);
  }

  private clearPendingThumbnail(): void {
    if (this.pendingThumbnailPreview) {
      URL.revokeObjectURL(this.pendingThumbnailPreview);
    }
    this.pendingThumbnail = null;
    this.pendingThumbnailPreview = null;
  }

  submitAddProject(): void {
    if (this.addProjectForm.invalid) {
      this.addProjectForm.markAllAsTouched();
      return;
    }
    const pendingFile = this.pendingThumbnail;
    this.projectsService.createProject(this.addProjectForm.getRawValue()).subscribe(project => {
      const finish = (created: Project) => {
        this.projects = [...this.projects, created];
        this.addProjectForm.reset({ name: '', location: '' });
        this.showAddProjectForm = false;
        this.clearPendingThumbnail();
        this.setupService.refresh();
      };
      if (pendingFile) {
        // Project creation itself never accepts a photo -- upload is a second call against the
        // id we just got back. If it fails, the project still exists; the user can retry the
        // photo from the "Change Photo" control in the Manage panel below.
        this.projectsService.uploadThumbnail(project.id, pendingFile).subscribe({
          next: () => {
            finish({ ...project, hasThumbnail: true });
            this.loadThumbnail(project.id);
          },
          error: () => finish(project)
        });
      } else {
        finish(project);
      }
    });
  }

  onManageThumbnailSelected(projectId: string, file: File): void {
    this.projectsService.uploadThumbnail(projectId, file).subscribe(() => {
      this.projects = this.projects.map(p => (p.id === projectId ? { ...p, hasThumbnail: true } : p));
      this.loadThumbnail(projectId);
    });
  }

  deleteProject(id: string): void {
    this.projectsService.deleteProject(id).subscribe(() => {
      this.projects = this.projects.filter(p => p.id !== id);
      if (this.selectedProjectId === id) {
        this.selectedProjectId = null;
        this.plotPage = null;
      }
      this.setupService.refresh();
    });
  }

  selectProject(id: string): void {
    this.selectedProjectId = id;
    this.activeTab = 'plotList';
    this.csvFile = null;
    this.csvValidation = null;
    this.csvSubmitError = null;
    this.loadPlots(0);
  }

  onTabChange(tabId: string): void {
    if (tabId === 'plotList' || tabId === 'importCsv') {
      this.activeTab = tabId;
    }
  }

  loadPlots(page: number): void {
    if (!this.selectedProjectId) {
      return;
    }
    this.projectsService.listPlots(this.selectedProjectId, page, PAGE_SIZE).subscribe(res => (this.plotPage = res));
  }

  goToPage(page: number): void {
    this.loadPlots(page);
  }

  submitAddPlot(): void {
    if (!this.selectedProjectId || this.plotForm.invalid) {
      this.plotForm.markAllAsTouched();
      return;
    }
    this.projectsService.createPlot(this.selectedProjectId, this.plotForm.getRawValue()).subscribe(() => {
      this.plotForm.reset({ plotNo: '', plotType: 'NORMAL', areaSqft: 0, rate: 0, price: 0, status: 'AVAILABLE' });
      this.loadPlots(0);
      this.setupService.refresh();
    });
  }

  deletePlot(plotId: string): void {
    if (!this.selectedProjectId) {
      return;
    }
    const page = this.plotPage?.page ?? 0;
    this.projectsService.deletePlot(this.selectedProjectId, plotId).subscribe(() => {
      this.loadPlots(page);
      this.setupService.refresh();
    });
  }

  onCsvFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.csvFile = input.files?.[0] ?? null;
    this.csvValidation = null;
    this.csvSubmitError = null;
  }

  validateCsvFile(): void {
    if (!this.selectedProjectId || !this.csvFile) {
      return;
    }
    this.csvSubmitError = null;
    this.projectsService.validateCsv(this.selectedProjectId, this.csvFile).subscribe({
      next: res => (this.csvValidation = res),
      error: () => (this.csvSubmitError = this.translate.instant('setup.projects.validation.csvGenericError'))
    });
  }

  commitCsvFile(): void {
    if (!this.selectedProjectId || !this.canCommitCsv || !this.csvFile) {
      return;
    }
    this.csvSubmitError = null;
    this.projectsService.commitCsv(this.selectedProjectId, this.csvFile).subscribe({
      next: () => {
        this.csvFile = null;
        this.csvValidation = null;
        this.loadPlots(0);
        this.setupService.refresh();
      },
      error: err => {
        if (err.status === 409 && err.error?.errors) {
          this.csvValidation = {
            totalRows: this.csvValidation?.totalRows ?? err.error.errors.length,
            validRows: 0,
            errors: err.error.errors
          };
        } else {
          this.csvSubmitError = this.translate.instant('setup.projects.validation.csvGenericError');
        }
      }
    });
  }
}
