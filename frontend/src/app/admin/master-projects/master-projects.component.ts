import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin, Observable, of } from 'rxjs';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import {
  MasterProject,
  MasterProjectMapKind,
  MasterProjectsService,
  MasterProjectStatus,
  MasterProjectType
} from './master-projects.service';
import { toFieldErrors } from '../../core/api/field-errors.model';
import { BadgeTone, EditableTableColumn, EditableTableComponent } from '../../shared/components/editable-table/editable-table.component';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { FieldErrorComponent } from '../../shared/components/field-error/field-error.component';
import { ErrorSummaryComponent } from '../../shared/components/error-summary/error-summary.component';
import { FormIssue, collectIssues, errorMessage } from '../../shared/validation/validation';
import { titleCase } from '../../shared/utils/title-case';

@Component({
  selector: 'app-master-projects',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, EditableTableComponent, InlineBannerComponent, FieldErrorComponent, ErrorSummaryComponent],
  template: `
    <div class="master-projects">
      <div class="master-projects__intro">
        <div class="master-projects__intro-copy">
          <span class="master-projects__eyebrow">{{ 'admin.masterProjects.eyebrow' | translate }}</span>
          <h1 class="master-projects__title">{{ 'admin.masterProjects.title' | translate }}</h1>
          <p class="master-projects__subtitle">{{ 'admin.masterProjects.subtitle' | translate }}</p>
        </div>
        <button type="button" class="master-projects__add brand-button" (click)="openModal(null)">
          {{ 'admin.masterProjects.addAction' | translate }}
        </button>
      </div>

      <app-inline-banner *ngIf="loadError" tone="danger" [dismissible]="true" (dismissed)="loadError = false">{{ 'admin.masterProjects.loadError' | translate }}</app-inline-banner>
      <app-inline-banner *ngIf="actionError" tone="danger" [dismissible]="true" (dismissed)="actionError = null">{{ actionError }}</app-inline-banner>

      <div class="card">
        <app-editable-table
          [readOnly]="true"
          [columns]="columns"
          [rows]="rows"
          [actionTemplate]="actionsTpl"
          [emptyStateLabel]="'admin.masterProjects.emptyState' | translate"
        ></app-editable-table>
      </div>
      <ng-template #actionsTpl let-i="index">
        <div class="master-projects__actions">
          <button type="button" class="master-projects__edit brand-button brand-button--secondary" (click)="openModal(projects[i])">
            {{ 'admin.masterProjects.editAction' | translate }}
          </button>
          <button type="button" class="master-projects__location-map brand-button brand-button--secondary"
                  *ngIf="projects[i].hasLocationMap" (click)="viewMap(projects[i], 'LOCATION')">
            {{ 'admin.masterProjects.locationMap' | translate }}
          </button>
          <button type="button" class="master-projects__project-map brand-button brand-button--secondary"
                  *ngIf="projects[i].hasProjectMap" (click)="viewMap(projects[i], 'PROJECT')">
            {{ 'admin.masterProjects.projectMap' | translate }}
          </button>
          <button type="button" class="master-projects__toggle brand-button"
                  [class.brand-button--danger]="projects[i].status === 'ACTIVE'"
                  [class.brand-button--secondary]="projects[i].status !== 'ACTIVE'"
                  (click)="toggleStatus(projects[i])">
            {{ (projects[i].status === 'ACTIVE' ? 'admin.masterProjects.suspendAction' : 'admin.masterProjects.activateAction') | translate }}
          </button>
        </div>
      </ng-template>
    </div>

    <div class="master-projects__modal-overlay master-projects__map-modal" *ngIf="mapPreviewUrl">
      <div class="master-projects__modal">
        <img class="master-projects__map-preview" [src]="mapPreviewUrl" [alt]="'admin.masterProjects.mapAlt' | translate" />
        <div class="master-projects__modal-footer">
          <button type="button" class="master-projects__modal-submit" (click)="closeMap()">{{ 'admin.masterProjects.closeAction' | translate }}</button>
        </div>
      </div>
    </div>

    <div class="master-projects__modal-overlay" *ngIf="modalOpen">
      <div class="master-projects__modal">
        <div class="master-projects__modal-title">
          {{ (editing ? 'admin.masterProjects.editTitle' : 'admin.masterProjects.addTitle') | translate }}
        </div>
        <app-inline-banner *ngIf="formError" tone="danger">{{ formError }}</app-inline-banner>
        <form [formGroup]="form" [class.was-submitted]="submitted" (ngSubmit)="save()" novalidate>
          <app-error-summary [issues]="issues"></app-error-summary>
          <div class="master-projects__modal-fields">
            <div class="master-projects__modal-field master-projects__modal-field--wide">
              <label>{{ 'admin.masterProjects.projectName' | translate }}</label>
              <input type="text" formControlName="name" />
              <app-field-error [message]="fieldError('name')"></app-field-error>
            </div>
            <div class="master-projects__modal-field">
              <label>{{ 'admin.masterProjects.type' | translate }}</label>
              <select formControlName="type">
                <option value="PLOT">{{ 'admin.masterProjects.typePlot' | translate }}</option>
                <option value="APARTMENT">{{ 'admin.masterProjects.typeApartment' | translate }}</option>
              </select>
            </div>
            <div class="master-projects__modal-field">
              <label>{{ 'admin.masterProjects.status' | translate }}</label>
              <select formControlName="status">
                <option value="ACTIVE">{{ 'admin.masterProjects.statusActive' | translate }}</option>
                <option value="SUSPENDED">{{ 'admin.masterProjects.statusSuspended' | translate }}</option>
              </select>
            </div>
            <div class="master-projects__modal-field">
              <label>{{ 'admin.masterProjects.city' | translate }}</label>
              <input type="text" formControlName="city" />
              <app-field-error [message]="fieldError('city')"></app-field-error>
            </div>
            <div class="master-projects__modal-field">
              <label>{{ 'admin.masterProjects.state' | translate }}</label>
              <input type="text" formControlName="state" />
              <app-field-error [message]="fieldError('state')"></app-field-error>
            </div>
            <div class="master-projects__modal-field">
              <label>{{ 'admin.masterProjects.businessPercentage' | translate }}</label>
              <input type="number" min="0" max="100" step="0.01" formControlName="businessPercentage" />
              <app-field-error [message]="fieldError('businessPercentage')"></app-field-error>
            </div>
            <div class="master-projects__modal-field master-projects__modal-field--wide">
              <label>{{ 'admin.masterProjects.rate' | translate }}</label>
              <input type="number" min="0" step="0.01" formControlName="ratePerSqft" />
              <app-field-error [message]="fieldError('ratePerSqft')"></app-field-error>
            </div>
            <div class="master-projects__modal-field">
              <label>{{ 'admin.masterProjects.locationMap' | translate }}</label>
              <input type="file" accept="image/png,image/jpeg,image/webp" class="master-projects__location-map-input" (change)="pickFile('LOCATION', $event)" />
            </div>
            <div class="master-projects__modal-field">
              <label>{{ 'admin.masterProjects.projectMap' | translate }}</label>
              <input type="file" accept="image/png,image/jpeg,image/webp" class="master-projects__project-map-input" (change)="pickFile('PROJECT', $event)" />
            </div>
          </div>
          <div class="master-projects__modal-footer">
            <button type="button" class="master-projects__modal-cancel" (click)="modalOpen = false">{{ 'admin.masterProjects.cancelAction' | translate }}</button>
            <button type="submit" class="master-projects__modal-submit">{{ 'admin.masterProjects.saveAction' | translate }}</button>
          </div>
        </form>
      </div>
    </div>
  `
})
export class MasterProjectsComponent implements OnInit, OnDestroy {
  private service = inject(MasterProjectsService);
  private translate = inject(TranslateService);
  private fb = inject(FormBuilder);

  projects: MasterProject[] = [];
  columns: EditableTableColumn[] = [];
  rows: Record<string, string>[] = [];
  loadError = false;
  actionError: string | null = null;
  mapPreviewUrl: string | null = null;

  modalOpen = false;
  editing: MasterProject | null = null;
  formError: string | null = null;
  private serverFieldErrors: Record<string, string> = {};
  submitted = false;
  issues: FormIssue[] = [];
  private labels: Record<string, string> = { name: 'Project name', city: 'City', state: 'State', businessPercentage: 'Business percentage', ratePerSqft: 'Rate per sq ft' };
  private files: Partial<Record<MasterProjectMapKind, File>> = {};
  form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    type: ['PLOT' as MasterProjectType],
    city: ['', Validators.required],
    state: ['', Validators.required],
    businessPercentage: [0, [Validators.required, Validators.min(0), Validators.max(100)]],
    ratePerSqft: [0, [Validators.required, Validators.min(0)]],
    status: ['ACTIVE' as MasterProjectStatus]
  });

  ngOnInit(): void {
    const t = (key: string) => this.translate.instant(`admin.masterProjects.${key}`);
    this.columns = [
      { key: 'sNo', label: t('columnSNo'), type: 'text' },
      { key: 'name', label: t('projectName'), type: 'text' },
      { key: 'type', label: t('type'), type: 'text' },
      { key: 'cityState', label: t('cityState'), type: 'text' },
      { key: 'business', label: t('business'), type: 'text' },
      { key: 'rate', label: t('rate'), type: 'text' },
      { key: 'locationMap', label: t('locationMap'), type: 'text' },
      { key: 'projectMap', label: t('projectMap'), type: 'text' },
      { key: 'status', label: t('status'), type: 'badge', badgeTone: v => (v === 'Active' ? 'success' : 'danger') as BadgeTone },
      { key: 'actions', label: t('columnDetails'), type: 'action' }
    ];
    this.load();
  }

  ngOnDestroy(): void {
    this.closeMap();
  }

  openModal(project: MasterProject | null): void {
    this.editing = project;
    this.serverFieldErrors = {};
    this.formError = null;
    this.submitted = false;
    this.issues = [];
    this.files = {};
    this.form.reset({
      name: project?.name ?? '',
      type: project?.type ?? 'PLOT',
      city: project?.city ?? '',
      state: project?.state ?? '',
      businessPercentage: project?.businessPercentage ?? 0,
      ratePerSqft: project?.ratePerSqft ?? 0,
      status: project?.status ?? 'ACTIVE'
    });
    this.modalOpen = true;
  }

  pickFile(kind: MasterProjectMapKind, event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      this.files[kind] = file;
    } else {
      delete this.files[kind];
    }
  }

  fieldError(name: string): string | undefined {
    if (this.serverFieldErrors[name]) {
      return this.serverFieldErrors[name];
    }
    const control = this.form.get(name);
    if (!control || !(control.touched || this.submitted)) {
      return undefined;
    }
    return errorMessage(control, this.labels[name]);
  }

  save(): void {
    this.serverFieldErrors = {};
    this.formError = null;
    this.submitted = true;
    this.form.markAllAsTouched();
    this.issues = collectIssues(this.form, this.labels);
    if (this.form.invalid) {
      return;
    }
    const request = this.form.getRawValue();
    const call = this.editing ? this.service.update(this.editing.id, request) : this.service.create(request);
    call.subscribe({
      next: saved => this.uploadPickedMaps(saved.id),
      error: (err: HttpErrorResponse) => this.showFormError(err, 'saveError')
    });
  }

  toggleStatus(project: MasterProject): void {
    this.actionError = null;
    const { id, hasLocationMap, hasProjectMap, ...rest } = project;
    const status: MasterProjectStatus = project.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    this.service.update(id, { ...rest, status }).subscribe({
      next: () => this.load(),
      error: (err: HttpErrorResponse) =>
        (this.actionError = (err.error as { error?: string } | null)?.error ?? this.translate.instant('admin.masterProjects.saveError'))
    });
  }

  viewMap(project: MasterProject, kind: MasterProjectMapKind): void {
    this.actionError = null;
    this.service.getMap(project.id, kind).subscribe({
      next: blob => {
        this.closeMap();
        this.mapPreviewUrl = URL.createObjectURL(blob);
      },
      error: () => (this.actionError = this.translate.instant('admin.masterProjects.mapError'))
    });
  }

  closeMap(): void {
    if (this.mapPreviewUrl) {
      URL.revokeObjectURL(this.mapPreviewUrl);
      this.mapPreviewUrl = null;
    }
  }

  private uploadPickedMaps(id: string): void {
    const uploads: Observable<void>[] = (['LOCATION', 'PROJECT'] as MasterProjectMapKind[])
      .filter(kind => this.files[kind])
      .map(kind => this.service.uploadMap(id, kind, this.files[kind]!));
    forkJoin(uploads.length ? uploads : [of(undefined)]).subscribe({
      next: () => {
        this.modalOpen = false;
        this.load();
      },
      // Project row is already saved; surface the upload failure but refresh the list.
      error: (err: HttpErrorResponse) => {
        this.showFormError(err, 'mapError');
        this.load();
      }
    });
  }

  private showFormError(err: HttpErrorResponse, fallbackKey: string): void {
    const fields = toFieldErrors(err);
    if (Object.keys(fields).length > 0) {
      this.serverFieldErrors = fields;
      this.issues = collectIssues(this.form, this.labels, fields);
      return;
    }
    this.formError = (err.error as { error?: string } | null)?.error ?? this.translate.instant(`admin.masterProjects.${fallbackKey}`);
  }

  private load(): void {
    this.loadError = false;
    this.service.list().subscribe({
      next: projects => {
        this.projects = projects;
        const yes = this.translate.instant('admin.masterProjects.uploaded');
        this.rows = projects.map((p, i) => ({
          sNo: String(i + 1),
          name: p.name,
          type: titleCase(p.type),
          cityState: [p.city, p.state].filter(Boolean).join(', ') || '—',
          business: `${p.businessPercentage}%`,
          rate: `₹${p.ratePerSqft}`,
          locationMap: p.hasLocationMap ? yes : '—',
          projectMap: p.hasProjectMap ? yes : '—',
          status: titleCase(p.status)
        }));
      },
      error: () => (this.loadError = true)
    });
  }
}
