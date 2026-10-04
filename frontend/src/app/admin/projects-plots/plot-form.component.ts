import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { Plot, PlotRequest, PlotType } from '../../setup/models/project.model';
import { FieldErrorComponent } from '../../shared/components/field-error/field-error.component';

@Component({
  selector: 'app-plot-form',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, FieldErrorComponent],
  template: `
    <ng-container *ngIf="locked; else editable">
      <h2 class="plot-form__title">{{ 'admin.projectsPlots.editLockedTitle' | translate }}</h2>
      <p>{{ 'admin.projectsPlots.editLockedBody' | translate }}</p>
      <button type="button" class="brand-button brand-button--secondary plot-form__back" (click)="cancelled.emit()">
        {{ 'admin.projectsPlots.backToPlot' | translate }}
      </button>
    </ng-container>
    <ng-template #editable>
      <form class="plot-form" (submit)="submit($event)" novalidate>
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
        <label>{{ 'admin.projectsPlots.priceLabel' | translate }}
          <input type="number" name="price" min="0" step="any" [(ngModel)]="price" />
          <small>{{ 'admin.projectsPlots.priceHint' | translate }}</small>
          <app-field-error [message]="(positive(price) || !submitted_ ? '' : 'admin.projectsPlots.error.generic') | translate"></app-field-error>
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
  @Input() busy = false;
  @Input() duplicatePlotNo = false;
  @Output() submitted = new EventEmitter<PlotRequest>();
  @Output() cancelled = new EventEmitter<void>();

  readonly types: PlotType[] = ['NORMAL', 'CORNER'];
  plotNo = '';
  plotType: PlotType = 'NORMAL';
  areaSqft: number | null = null;
  rate: number | null = null;
  price: number | null = null;
  submitted_ = false;

  ngOnChanges(c: SimpleChanges): void {
    if (c['plot'] && this.plot) {
      ({ plotNo: this.plotNo, plotType: this.plotType, areaSqft: this.areaSqft, rate: this.rate, price: this.price } = this.plot);
    }
  }

  get plotNoInvalid(): boolean { return this.duplicatePlotNo || (this.submitted_ && !this.plotNo.trim()); }

  positive(v: number | null): boolean { return typeof v === 'number' && v > 0; }

  plotNoError(): string {
    if (this.duplicatePlotNo) { return 'admin.projectsPlots.error.duplicatePlotNo'; }
    return this.submitted_ && !this.plotNo.trim() ? 'admin.projectsPlots.error.generic' : '';
  }

  submit(e: Event): void {
    e.preventDefault();
    this.submitted_ = true;
    if (!this.plotNo.trim() || !this.positive(this.areaSqft) || !this.positive(this.rate) || !this.positive(this.price)) { return; }
    this.submitted.emit({
      plotNo: this.plotNo.trim(), plotType: this.plotType,
      areaSqft: this.areaSqft!, rate: this.rate!, price: this.price!,
      status: this.plot?.status ?? 'AVAILABLE' // status is not editable here; echo the current one
    });
  }
}
