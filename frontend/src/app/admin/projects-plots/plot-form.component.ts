import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { ErrorSummaryComponent } from '../../shared/components/error-summary/error-summary.component';
import { FormIssue } from '../../shared/validation/validation';
import { Plot, PlotRequest, PlotType } from '../../setup/models/project.model';
import { FieldErrorComponent } from '../../shared/components/field-error/field-error.component';

@Component({
  selector: 'app-plot-form',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, FieldErrorComponent, ErrorSummaryComponent],
  template: `
    <ng-container *ngIf="locked; else editable">
      <h2 class="plot-form__title">{{ 'admin.projectsPlots.editLockedTitle' | translate }}</h2>
      <p>{{ 'admin.projectsPlots.editLockedBody' | translate }}</p>
      <button type="button" class="brand-button brand-button--secondary plot-form__back" (click)="cancelled.emit()">
        {{ 'admin.projectsPlots.backToPlot' | translate }}
      </button>
    </ng-container>
    <ng-template #editable>
      <form class="plot-form" [class.was-submitted]="submitted_" (submit)="submit($event)" novalidate>
        <app-error-summary [issues]="issues"></app-error-summary>
        <h2 class="plot-form__title">{{ (plot ? 'admin.projectsPlots.editPlotAction' : 'admin.projectsPlots.addPlotAction') | translate }}</h2>
        <label>{{ 'admin.projectsPlots.plotNoLabel' | translate }}
          <input type="text" name="plotNo" maxlength="50" [(ngModel)]="plotNo" [attr.aria-invalid]="plotNoInvalid" />
          <small>{{ 'admin.projectsPlots.plotNoHint' | translate }}</small>
          <app-field-error [message]="plotNoError() | translate"></app-field-error>
        </label>
        <fieldset class="plot-form__type">
          <legend>{{ 'admin.projectsPlots.plotTypeLabel' | translate }}</legend>
          <label *ngFor="let t of types"><input type="radio" name="plotType" [value]="t" [(ngModel)]="plotType" /> {{ 'admin.projectsPlots.type.' + t | translate }}</label>
        </fieldset>
        <label>{{ 'admin.projectsPlots.areaLabel' | translate }}
          <input type="number" name="areaSqft" min="0" step="any" [(ngModel)]="areaSqft" />
          <app-field-error [message]="(positive(areaSqft) || !submitted_ ? '' : 'admin.projectsPlots.error.generic') | translate"></app-field-error>
        </label>
        <label>{{ 'admin.projectsPlots.rateLabel' | translate }}
          <input type="number" name="rate" min="0" step="any" [(ngModel)]="rate" />
          <app-field-error [message]="(positive(rate) || !submitted_ ? '' : 'admin.projectsPlots.error.generic') | translate"></app-field-error>
        </label>
        <label>{{ 'admin.projectsPlots.extraPriceLabel' | translate }}
          <input type="number" name="extraPrice" min="0" step="any" [(ngModel)]="extraPrice" />
          <small>{{ 'admin.projectsPlots.extraPriceHint' | translate }}</small>
          <app-field-error [message]="(validExtra || !submitted_ ? '' : 'admin.projectsPlots.error.generic') | translate"></app-field-error>
        </label>
        <label>{{ 'admin.projectsPlots.roadSizeLabel' | translate }}
          <input type="number" name="roadSizeFt" min="0" step="any" [(ngModel)]="roadSizeFt" />
          <small>{{ 'admin.projectsPlots.roadSizeHint' | translate }}</small>
          <app-field-error [message]="(validRoad || !submitted_ ? '' : 'admin.projectsPlots.error.generic') | translate"></app-field-error>
        </label>
        <p *ngIf="plot" class="plot-form__status">{{ 'admin.projectsPlots.statusLabel' | translate }}: {{ 'plotTile.status.' + plot.status | translate }} — {{ 'admin.projectsPlots.statusReadonlyHint' | translate }}</p>
        <div class="projects-plots__form-actions">
          <button type="submit" class="brand-button" [disabled]="busy">{{ 'admin.projectsPlots.savePlotAction' | translate }}</button>
          <button type="button" class="brand-button brand-button--secondary" (click)="cancelled.emit()">{{ 'admin.projectsPlots.cancelAction' | translate }}</button>
        </div>
      </form>
    </ng-template>
  `
})
export class PlotFormComponent implements OnChanges {
  @Input() plot: Plot | null = null;
  @Input() locked = false;
  // Master project's rate per sqft; prefills Rate when adding a plot.
  @Input() defaultRate: number | null = null;
  @Input() busy = false;
  @Input() duplicatePlotNo = false;
  @Output() submitted = new EventEmitter<PlotRequest>();
  @Output() cancelled = new EventEmitter<void>();

  readonly types: PlotType[] = ['NORMAL', 'CORNER'];
  plotNo = '';
  plotType: PlotType = 'NORMAL';
  areaSqft: number | null = null;
  rate: number | null = null;
  extraPrice: number | null = 0;
  roadSizeFt: number | null = null;
  submitted_ = false;
  issues: FormIssue[] = [];

  ngOnChanges(c: SimpleChanges): void {
    if (!this.plot && this.rate == null && this.defaultRate) { this.rate = this.defaultRate; }
    if (c['plot'] && this.plot) {
      ({ plotNo: this.plotNo, plotType: this.plotType, areaSqft: this.areaSqft, rate: this.rate } = this.plot);
      this.extraPrice = this.plot.extraPrice ?? 0;
      this.roadSizeFt = this.plot.roadSizeFt ?? null;
    }
  }

  get plotNoInvalid(): boolean { return this.duplicatePlotNo || (this.submitted_ && !this.plotNo.trim()); }

  get validExtra(): boolean { return this.extraPrice == null || this.extraPrice >= 0; }

  get validRoad(): boolean { return this.roadSizeFt == null || this.roadSizeFt >= 0; }

  positive(v: number | null): boolean { return typeof v === 'number' && v > 0; }

  plotNoError(): string {
    if (this.duplicatePlotNo) { return 'admin.projectsPlots.error.duplicatePlotNo'; }
    return this.submitted_ && !this.plotNo.trim() ? 'admin.projectsPlots.error.generic' : '';
  }

  submit(e: Event): void {
    e.preventDefault();
    this.submitted_ = true;
    const add = (id: string, label: string, message: string) => this.issues.push({ id, label, message });
    this.issues = [];
    if (this.duplicatePlotNo) { add('plotNo', 'Plot number', 'Plot number already exists in this project. Use a different number.'); }
    else if (!this.plotNo.trim()) { add('plotNo', 'Plot number', 'Plot number is required. Please fill it in.'); }
    if (!this.positive(this.areaSqft)) { add('areaSqft', 'Area', 'Area must be greater than 0. Enter the plot size in sq ft.'); }
    if (!this.positive(this.rate)) { add('rate', 'Rate', 'Rate must be greater than 0. Enter the price per sq ft.'); }
    if (!this.validExtra) { add('extraPrice', 'Extra price', 'Extra price cannot be negative. Enter 0 or more.'); }
    if (!this.validRoad) { add('roadSizeFt', 'Road size', 'Road size cannot be negative. Enter 0 or more.'); }
    if (!this.plotNo.trim() || !this.positive(this.areaSqft) || !this.positive(this.rate) || !this.validExtra || !this.validRoad) { return; }
    this.submitted.emit({
      plotNo: this.plotNo.trim(), plotType: this.plotType,
      areaSqft: this.areaSqft!, rate: this.rate!, price: this.areaSqft! * this.rate!, extraPrice: this.extraPrice ?? 0, roadSizeFt: this.roadSizeFt ?? null,
      status: this.plot?.status ?? 'AVAILABLE' // status is not editable here; echo the current one
    });
  }
}
