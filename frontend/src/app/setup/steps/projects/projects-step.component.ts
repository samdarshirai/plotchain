import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';
import { StatTileComponent } from '../../../shared/components/stat-tile/stat-tile.component';
import { TabBarComponent, TabDefinition } from '../../../shared/components/tab-bar/tab-bar.component';
import { SetupStepNavComponent } from '../../../shared/components/setup-step-nav/setup-step-nav.component';
import { ProjectsService } from './projects.service';
import { SetupService } from '../../setup.service';
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
    SetupStepNavComponent
  ],
  template: `
    <div class="projects-step">
      <div class="card">
        <div class="projects-step__header">
          <h1 class="card-title">{{ 'setup.projects.title' | translate }}</h1>
          <button type="button" (click)="toggleAddProjectForm()">{{ 'setup.projects.addProjectAction' | translate }}</button>
        </div>

        <form class="projects-step__add-form" [formGroup]="addProjectForm" *ngIf="showAddProjectForm">
          <label>
            {{ 'setup.projects.nameLabel' | translate }}
            <input type="text" formControlName="name" />
          </label>
          <app-field-error [message]="addProjectForm.get('name')?.touched && addProjectForm.get('name')?.errors?.['required'] ? ('setup.projects.validation.required' | translate) : undefined"></app-field-error>

          <label>
            {{ 'setup.projects.locationLabel' | translate }}
            <input type="text" formControlName="location" />
          </label>

          <button type="button" (click)="submitAddProject()">{{ 'setup.projects.saveProjectAction' | translate }}</button>
        </form>

        <div class="projects-step__cards">
          <div
            class="projects-step__card"
            *ngFor="let project of projects"
            [class.projects-step__card--selected]="project.id === selectedProjectId"
          >
            <h2>{{ project.name }}</h2>
            <p>{{ project.location }}</p>
            <div class="projects-step__counts">
              <app-stat-tile [label]="'setup.projects.totalPlotsLabel' | translate" [value]="project.totalPlots.toString()"></app-stat-tile>
              <app-stat-tile [label]="'setup.projects.availablePlotsLabel' | translate" [value]="project.availablePlots.toString()"></app-stat-tile>
              <app-stat-tile [label]="'setup.projects.soldPlotsLabel' | translate" [value]="project.soldPlots.toString()"></app-stat-tile>
            </div>
            <button type="button" (click)="selectProject(project.id)">{{ 'setup.projects.manageAction' | translate }}</button>
            <button type="button" (click)="deleteProject(project.id)">{{ 'setup.projects.deleteAction' | translate }}</button>
          </div>
        </div>
      </div>

      <div class="card" *ngIf="selectedProjectId">
        <app-tab-bar [tabs]="tabs" [activeTabId]="activeTab" (tabChange)="onTabChange($event)"></app-tab-bar>

        <div *ngIf="activeTab === 'plotList'">
          <form class="projects-step__add-plot-form" [formGroup]="plotForm">
            <input type="text" formControlName="plotNo" [placeholder]="'setup.projects.plotNoLabel' | translate" />
            <select formControlName="plotType">
              <option value="NORMAL">NORMAL</option>
              <option value="CORNER">CORNER</option>
            </select>
            <input type="number" formControlName="areaSqft" [placeholder]="'setup.projects.areaLabel' | translate" />
            <input type="number" formControlName="rate" [placeholder]="'setup.projects.rateLabel' | translate" />
            <input type="number" formControlName="price" [placeholder]="'setup.projects.priceLabel' | translate" />
            <select formControlName="status">
              <option value="AVAILABLE">AVAILABLE</option>
              <option value="BOOKED">BOOKED</option>
              <option value="SOLD">SOLD</option>
            </select>
            <button type="button" (click)="submitAddPlot()">{{ 'setup.projects.addPlotAction' | translate }}</button>
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
                <td>{{ plot.plotType }}</td>
                <td>{{ plot.areaSqft }}</td>
                <td>{{ plot.rate }}</td>
                <td>{{ plot.price }}</td>
                <td>{{ plot.status }}</td>
                <td><button type="button" (click)="deletePlot(plot.id)">{{ 'setup.projects.deleteAction' | translate }}</button></td>
              </tr>
            </tbody>
          </table>

          <div class="projects-step__pagination" *ngIf="plotPage">
            <button type="button" [disabled]="plotPage.page === 0" (click)="goToPage(plotPage.page - 1)">{{ 'setup.projects.previousPageAction' | translate }}</button>
            <span>{{ 'setup.projects.showingLabel' | translate }}</span>
            <button type="button" [disabled]="(plotPage.page + 1) * plotPage.size >= plotPage.totalElements" (click)="goToPage(plotPage.page + 1)">{{ 'setup.projects.nextPageAction' | translate }}</button>
          </div>
        </div>

        <div *ngIf="activeTab === 'importCsv'">
          <a [href]="csvTemplateUrl">{{ 'setup.projects.downloadTemplateAction' | translate }}</a>
          <input type="file" accept=".csv" (change)="onCsvFileSelected($event)" />
          <button type="button" [disabled]="!csvFile" (click)="validateCsvFile()">{{ 'setup.projects.validateCsvAction' | translate }}</button>
          <button type="button" [disabled]="!canCommitCsv" (click)="commitCsvFile()">{{ 'setup.projects.commitCsvAction' | translate }}</button>

          <app-inline-banner *ngIf="csvSubmitError" tone="danger">{{ csvSubmitError }}</app-inline-banner>

          <div *ngIf="csvValidation">
            <p>{{ 'setup.projects.csvSummaryLabel' | translate: { valid: csvValidation.validRows, total: csvValidation.totalRows } }}</p>
            <ul>
              <li *ngFor="let error of csvValidation.errors">{{ 'setup.projects.csvRowErrorLabel' | translate: { row: error.rowNumber, field: error.field, message: error.message } }}</li>
            </ul>
          </div>
        </div>
      </div>

      <app-setup-step-nav [previousPath]="previousPath" [nextPath]="nextPath"></app-setup-step-nav>
    </div>
  `
})
export class ProjectsStepComponent implements OnInit {
  private fb = inject(FormBuilder);
  private projectsService = inject(ProjectsService);
  private setupService = inject(SetupService);
  private translate = inject(TranslateService);

  projects: Project[] = [];
  showAddProjectForm = false;
  addProjectForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
    location: ['', Validators.required]
  });

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

  readonly previousPath = this.setupService.previousStepPath('projects');
  readonly nextPath = this.setupService.nextStepPath('projects');

  get tabs(): TabDefinition[] {
    return [
      { id: 'plotList', label: this.translate.instant('setup.projects.plotListTab') },
      { id: 'importCsv', label: this.translate.instant('setup.projects.importCsvTab') }
    ];
  }

  get canCommitCsv(): boolean {
    return !!this.csvFile && !!this.csvValidation && this.csvValidation.errors.length === 0;
  }

  ngOnInit(): void {
    this.projectsService.listProjects().subscribe(projects => (this.projects = projects));
  }

  toggleAddProjectForm(): void {
    this.showAddProjectForm = !this.showAddProjectForm;
  }

  submitAddProject(): void {
    if (this.addProjectForm.invalid) {
      this.addProjectForm.markAllAsTouched();
      return;
    }
    this.projectsService.createProject(this.addProjectForm.getRawValue()).subscribe(project => {
      this.projects = [...this.projects, project];
      this.addProjectForm.reset({ name: '', location: '' });
      this.showAddProjectForm = false;
      this.setupService.refresh();
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
