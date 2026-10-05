import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { AssociateSummary } from '../models/associate-summary.model';
import { AssociateLookupComponent } from '../../shared/components/associate-lookup/associate-lookup.component';
import { FieldErrorComponent } from '../../shared/components/field-error/field-error.component';
import { PlotGridItem, formatArea, formatInr } from '../../shared/utils/plot-grid.util';
import { BookingEmiConfig, BookingFormValue } from './projects-plots.model';

@Component({
  selector: 'app-book-plot-form',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, AssociateLookupComponent, FieldErrorComponent],
  template: `
    <form class="book-form" (submit)="submit($event)" novalidate>
      <div class="book-form__head">
        <div class="book-form__plot">
          <span class="book-form__plot-no">{{ plot.plotNo }}</span>
          <span class="book-form__plot-sub">
            <ng-container *ngIf="block">{{ 'admin.projectsPlots.blockHeading' | translate: { block: block } }} · </ng-container>
            <ng-container *ngIf="plot.type === 'CORNER'">{{ 'plotTile.type.CORNER' | translate }} · </ng-container>{{ areaText }} {{ 'plotTile.sqft' | translate }}
          </span>
        </div>
        <span class="book-form__plot-total" [attr.aria-label]="'admin.projectsPlots.totalLabel' | translate">{{ priceText }}</span>
      </div>
      <div class="book-form__field">
        <span class="book-form__label">{{ 'admin.projectsPlots.associateLabel' | translate }}</span>
        <app-associate-lookup [associates]="associates" [value]="associateId"
          [placeholder]="'admin.projectsPlots.lookupPlaceholder' | translate"
          (selected)="associateId = $event?.id ?? ''"></app-associate-lookup>
        <app-field-error [message]="(tried && !associateId ? 'admin.projectsPlots.associateRequired' : '') | translate"></app-field-error>
      </div>
      <label>{{ 'admin.projectsPlots.buyerNameLabel' | translate }}
        <input #buyerNameInput type="text" name="buyerName" maxlength="200" autocomplete="off"
          [placeholder]="'admin.projectsPlots.buyerNamePlaceholder' | translate" [disabled]="busy" [(ngModel)]="buyerName"
          [attr.aria-invalid]="nameInvalid ? 'true' : null" [attr.aria-describedby]="nameInvalid ? 'book-name-err' : null" />
        <app-field-error id="book-name-err" [message]="(nameInvalid ? 'admin.projectsPlots.buyerNameRequired' : '') | translate"></app-field-error>
      </label>
      <label><span>{{ 'admin.projectsPlots.buyerPhoneLabel' | translate }} <span>{{ 'admin.projectsPlots.optional' | translate }}</span></span>
        <input type="tel" name="buyerPhone" maxlength="20" [disabled]="busy" [(ngModel)]="buyerPhone" />
      </label>
      <label class="book-form__token">{{ 'admin.projectsPlots.tokenLabel' | translate }}
        <input #tokenInput type="number" name="tokenAmount" inputmode="decimal" min="1" step="any" autocomplete="off"
          [disabled]="busy" [(ngModel)]="tokenAmount"
          [attr.aria-invalid]="tokenError ? 'true' : null" [attr.aria-describedby]="tokenError ? 'book-token-err' : null" />
        <app-field-error id="book-token-err" [message]="(tokenError ? 'admin.projectsPlots.token.' + tokenError : '') | translate"></app-field-error>
      </label>
      <p class="book-form__preview" *ngIf="previewKey as k">
        {{ k | translate: previewParams }}
      </p>
      <div class="projects-plots__form-actions book-form__actions">
        <button type="button" class="brand-button brand-button--secondary book-form__cancel" (click)="cancelled.emit()">{{ 'admin.projectsPlots.cancelAction' | translate }}</button>
        <button type="submit" class="brand-button" [disabled]="busy" [attr.aria-busy]="busy">
          {{ (busy ? 'admin.projectsPlots.bookingInProgress' : 'admin.projectsPlots.confirmBookingAction') | translate }}
        </button>
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
  @ViewChild('tokenInput') tokenInput?: ElementRef<HTMLInputElement>;

  associateId = '';
  buyerName = '';
  buyerPhone = '';
  tokenAmount: number | null = null;
  tried = false;

  get nameInvalid(): boolean { return this.tried && !this.buyerName.trim(); }
  get priceText(): string { return formatInr(this.plot.price); }
  // The block is the plot number's prefix, as in the grid.
  get block(): string { return this.plot.plotNo.includes('-') ? this.plot.plotNo.slice(0, this.plot.plotNo.indexOf('-')) : ''; }
  get areaText(): string { return formatArea(this.plot.area); }

  // Required, above zero and below the plot price; the server enforces the same range.
  get tokenError(): 'required' | 'tooHigh' | null {
    if (!this.tried) { return null; }
    const t = this.tokenAmount;
    if (t == null || !(t > 0)) { return 'required'; }
    return t >= this.plot.price ? 'tooHigh' : null;
  }
  private get tokenValid(): boolean {
    const t = this.tokenAmount;
    return t != null && t > 0 && t < this.plot.price;
  }

  // Preview is an equal-split estimate only; the real schedule is server-side. The token is
  // installment 1; the balance splits across the other installments (at least one).
  get previewKey(): string | null {
    if (!this.emiConfig || !this.tokenValid) { return null; }
    return this.balanceCount > 1 ? 'admin.projectsPlots.schedulePreview' : 'admin.projectsPlots.scheduleSingle';
  }
  private get balanceCount(): number {
    const count = this.emiConfig?.emiEnabled ? this.emiConfig.defaultInstallmentCount : 1;
    return Math.max(count - 1, 1);
  }
  get previewParams(): { token: string; count: number; amount: string } {
    const count = this.balanceCount;
    return { token: formatInr(this.tokenAmount ?? 0), count, amount: formatInr(Math.round((this.plot.price - (this.tokenAmount ?? 0)) / count)) };
  }

  submit(e: Event): void {
    e.preventDefault();
    if (this.busy) { return; } // double-submit guard; the disabled button alone is not enough for Enter-key submits
    this.tried = true;
    if (!this.buyerName.trim()) {
      this.buyerNameInput?.nativeElement.focus();
      return;
    }
    if (this.tokenError) {
      this.tokenInput?.nativeElement.focus();
      return;
    }
    if (!this.associateId) { return; }
    this.submitted.emit({ associateId: this.associateId, buyerName: this.buyerName.trim(), buyerPhone: this.buyerPhone.trim(), tokenAmount: this.tokenAmount! });
  }
}
