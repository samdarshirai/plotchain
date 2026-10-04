import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { AssociateSummary } from '../models/associate-summary.model';
import { AssociateLookupComponent } from '../../shared/components/associate-lookup/associate-lookup.component';
import { FieldErrorComponent } from '../../shared/components/field-error/field-error.component';
import { PlotGridItem, formatInr } from '../../shared/utils/plot-grid.util';
import { BookingEmiConfig, BookingFormValue } from './projects-plots.model';

@Component({
  selector: 'app-book-plot-form',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, AssociateLookupComponent, FieldErrorComponent],
  template: `
    <form class="book-form" (submit)="submit($event)" novalidate>
      <h2 class="plot-form__title">{{ 'admin.projectsPlots.bookTitle' | translate: { no: plot.plotNo } }}</h2>
      <div class="book-form__field">
        <span class="book-form__label">{{ 'admin.projectsPlots.associateLabel' | translate }}</span>
        <app-associate-lookup [associates]="associates" [value]="associateId"
          [placeholder]="'admin.projectsPlots.lookupPlaceholder' | translate"
          (selected)="associateId = $event?.id ?? ''"></app-associate-lookup>
        <small>{{ 'admin.projectsPlots.associateHint' | translate }}</small>
        <app-field-error [message]="(tried && !associateId ? 'admin.projectsPlots.associateRequired' : '') | translate"></app-field-error>
      </div>
      <label>{{ 'admin.projectsPlots.buyerNameLabel' | translate }}
        <input #buyerNameInput type="text" name="buyerName" maxlength="200" autocomplete="off"
          [placeholder]="'admin.projectsPlots.buyerNamePlaceholder' | translate" [disabled]="busy" [(ngModel)]="buyerName"
          [attr.aria-invalid]="nameInvalid ? 'true' : null" [attr.aria-describedby]="nameInvalid ? 'book-name-err' : null" />
        <app-field-error id="book-name-err" [message]="(nameInvalid ? 'admin.projectsPlots.buyerNameRequired' : '') | translate"></app-field-error>
      </label>
      <label>{{ 'admin.projectsPlots.buyerPhoneLabel' | translate }} <span>{{ 'admin.projectsPlots.optional' | translate }}</span>
        <input type="tel" name="buyerPhone" maxlength="20" [disabled]="busy" [(ngModel)]="buyerPhone" />
      </label>
      <div class="book-form__total">
        <span class="book-form__label">{{ 'admin.projectsPlots.totalLabel' | translate }}</span>
        <strong>{{ priceText }}</strong>
        <small>{{ 'admin.projectsPlots.totalHint' | translate }}</small>
      </div>
      <p class="book-form__preview" *ngIf="previewKey as k">
        <span class="book-form__label">{{ 'admin.projectsPlots.schedulePreviewLabel' | translate }}</span>
        {{ k | translate: previewParams }}
      </p>
      <div class="projects-plots__form-actions">
        <button type="submit" class="brand-button" [disabled]="busy" [attr.aria-busy]="busy">
          {{ (busy ? 'admin.projectsPlots.bookingInProgress' : 'admin.projectsPlots.confirmBookingAction') | translate }}
        </button>
        <button type="button" class="brand-button brand-button--secondary book-form__cancel" (click)="cancelled.emit()">{{ 'admin.projectsPlots.cancelAction' | translate }}</button>
      </div>
    </form>
  `
})
export class BookPlotFormComponent {
  @Input({ required: true }) plot!: PlotGridItem;
  @Input() associates: AssociateSummary[] = [];
  @Input() emiConfig: BookingEmiConfig | null = null;
  @Input() busy = false;
  @Output() submitted = new EventEmitter<BookingFormValue>();
  @Output() cancelled = new EventEmitter<void>();
  @ViewChild('buyerNameInput') buyerNameInput?: ElementRef<HTMLInputElement>;

  associateId = '';
  buyerName = '';
  buyerPhone = '';
  tried = false;

  get nameInvalid(): boolean { return this.tried && !this.buyerName.trim(); }
  get priceText(): string { return formatInr(this.plot.price); }

  // Preview is an equal-split estimate only; the real schedule is server-side (DESIGN Decision 3).
  get previewKey(): string | null {
    if (!this.emiConfig) { return null; }
    return this.emiConfig.emiEnabled && this.emiConfig.defaultInstallmentCount > 1
      ? 'admin.projectsPlots.schedulePreview' : 'admin.projectsPlots.scheduleSingle';
  }
  get previewParams(): { count: number; amount: string } {
    const count = this.emiConfig?.defaultInstallmentCount ?? 1;
    return { count, amount: formatInr(Math.round(this.plot.price / count)) };
  }

  submit(e: Event): void {
    e.preventDefault();
    if (this.busy) { return; } // double-submit guard; the disabled button alone is not enough for Enter-key submits
    this.tried = true;
    if (!this.buyerName.trim()) {
      this.buyerNameInput?.nativeElement.focus();
      return;
    }
    if (!this.associateId) { return; }
    this.submitted.emit({ associateId: this.associateId, buyerName: this.buyerName.trim(), buyerPhone: this.buyerPhone.trim() });
  }
}
