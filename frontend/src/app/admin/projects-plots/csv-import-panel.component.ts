import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { ProjectsService } from '../../setup/steps/projects/projects.service';
import { CsvValidationResponse } from '../../setup/models/project.model';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';

// Same semantics as the setup wizard's CSV import (validate first, commit only when errors is
// empty), reusing ProjectsService so the two screens cannot drift on the contract.
@Component({
  selector: 'app-csv-import-panel',
  standalone: true,
  imports: [CommonModule, TranslateModule, InlineBannerComponent],
  template: `
    <h2 class="plot-form__title">{{ 'admin.projectsPlots.importCsvAction' | translate }}</h2>
    <a class="csv-panel__template" [href]="templateUrl">{{ 'admin.projectsPlots.downloadTemplateAction' | translate }}</a>
    <label>{{ 'admin.projectsPlots.chooseFileLabel' | translate }}
      <input type="file" accept=".csv,text/csv" (change)="onFile($any($event.target).files?.[0] ?? null)" />
    </label>
    <app-inline-banner *ngIf="failed" tone="danger">{{ 'admin.projectsPlots.csvGenericError' | translate }}</app-inline-banner>
    <ng-container *ngIf="result as r">
      <p role="status">{{ 'admin.projectsPlots.csvSummary' | translate: { valid: r.validRows, total: r.totalRows } }}</p>
      <ul class="csv-panel__errors" *ngIf="r.errors.length">
        <li *ngFor="let e of r.errors">{{ 'admin.projectsPlots.csvRowError' | translate: { row: e.rowNumber, field: e.field, message: e.message } }}</li>
      </ul>
    </ng-container>
    <div class="projects-plots__form-actions">
      <button type="button" class="brand-button brand-button--secondary" [disabled]="!file || busy" (click)="validate()">{{ 'admin.projectsPlots.validateAction' | translate }}</button>
      <button type="button" class="brand-button csv-panel__commit" [disabled]="!canCommit || busy" (click)="commit()">{{ 'admin.projectsPlots.commitAction' | translate }}</button>
      <button type="button" class="brand-button brand-button--secondary" (click)="cancelled.emit()">{{ 'admin.projectsPlots.cancelAction' | translate }}</button>
    </div>
  `
})
export class CsvImportPanelComponent {
  private projects = inject(ProjectsService);
  @Input({ required: true }) projectId!: string;
  @Output() imported = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  readonly templateUrl = this.projects.csvTemplateUrl();
  file: File | null = null;
  result: CsvValidationResponse | null = null;
  failed = false;
  busy = false;

  get canCommit(): boolean { return !!this.result && this.result.errors.length === 0; }

  onFile(f: File | null): void {
    this.file = f;
    this.result = null; // a result belongs to the file it validated
    this.failed = false;
    this.busy = false; // any in-flight request belongs to the previous file and is ignored below
  }

  validate(): void {
    const f = this.file;
    if (!f) { return; }
    this.busy = true;
    this.projects.validateCsv(this.projectId, f).subscribe({
      next: r => { if (f !== this.file) { return; } this.busy = false; this.failed = false; this.result = r; },
      error: () => { if (f !== this.file) { return; } this.busy = false; this.failed = true; }
    });
  }

  commit(): void {
    const f = this.file;
    if (!f || !this.canCommit) { return; }
    this.busy = true;
    this.projects.commitCsv(this.projectId, f).subscribe({
      next: () => { if (f !== this.file) { return; } this.busy = false; this.imported.emit(); },
      error: () => { if (f !== this.file) { return; } this.busy = false; this.failed = true; this.result = null; }
    });
  }
}
