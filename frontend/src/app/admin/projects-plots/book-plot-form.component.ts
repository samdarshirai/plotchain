import { Component, OnInit, ViewEncapsulation, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { AssociateSummary } from '../models/associate-summary.model';
import { FieldErrorComponent } from '../../shared/components/field-error/field-error.component';
import { ErrorSummaryComponent } from '../../shared/components/error-summary/error-summary.component';
import { FormIssue, errorMessage, format } from '../../shared/validation/validation';
import { PlotGridItem, formatArea, formatInr } from '../../shared/utils/plot-grid.util';
import { BookingEmiConfig, BookingFormValue } from './projects-plots.model';
import { PAYMENT_MODES } from '../../plot-bookings/models/associate-booking-page.model';

@Component({
  selector: 'app-book-plot-form',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, FieldErrorComponent, ErrorSummaryComponent],
  encapsulation: ViewEncapsulation.None,
  template: `
    <form class="book-form" [class.was-submitted]="tried" (submit)="submit($event)" novalidate>
      <app-error-summary [issues]="issues"></app-error-summary>
      <h3 class="book-form__section">{{ 'admin.projectsPlots.plotDetailsHeading' | translate }}</h3>
      <dl class="book-form__facts">
        <div *ngIf="projectName"><dt>{{ 'admin.projectsPlots.factsProject' | translate }}</dt><dd>{{ projectName }}</dd></div>
        <div *ngIf="location"><dt>{{ 'admin.projectsPlots.factsLocation' | translate }}</dt><dd>{{ location }}</dd></div>
        <div><dt>{{ 'admin.projectsPlots.factsPlotNo' | translate }}</dt><dd>{{ plot.plotNo }}</dd></div>
        <div *ngIf="block"><dt>{{ 'admin.projectsPlots.factsBlock' | translate }}</dt><dd>{{ block }}</dd></div>
        <div><dt>{{ 'admin.projectsPlots.factsType' | translate }}</dt><dd>{{ 'plotTile.type.' + plot.type | translate }}</dd></div>
        <div><dt>{{ 'admin.projectsPlots.factsArea' | translate }}</dt><dd>{{ areaText }} {{ 'plotTile.sqft' | translate }}</dd></div>
        <div><dt>{{ 'admin.projectsPlots.factsRate' | translate }}</dt><dd>{{ rate != null ? formatInr(rate) : '—' }}</dd></div>
        <div><dt>{{ 'admin.projectsPlots.roadSizeLabel' | translate }}</dt><dd>{{ plot.roadSizeFt != null ? plot.roadSizeFt : '—' }}</dd></div>
        <div><dt>{{ 'admin.projectsPlots.factsPrice' | translate }}</dt><dd>{{ priceText }}</dd></div>
        <div><dt>{{ 'admin.projectsPlots.extraPriceLabel' | translate }}</dt><dd>{{ formatInr(plot.extraPrice ?? 0) }}</dd></div>
        <div><dt>{{ 'admin.projectsPlots.statusLabel' | translate }}</dt><dd>{{ 'plotTile.status.' + plot.status | translate }}</dd></div>
      </dl>
      <label>{{ 'admin.projectsPlots.buyerNameLabel' | translate }}
        <input #buyerNameInput type="text" name="buyerName" maxlength="200" autocomplete="off"
          [placeholder]="'admin.projectsPlots.buyerNamePlaceholder' | translate" [disabled]="busy" [(ngModel)]="buyerName"
          [attr.aria-invalid]="nameInvalid ? 'true' : null" [attr.aria-describedby]="nameInvalid ? 'book-name-err' : null" />
        <app-field-error id="book-name-err" [message]="(nameInvalid ? 'admin.projectsPlots.buyerNameRequired' : '') | translate"></app-field-error>
      </label>
      <label><span>{{ 'admin.projectsPlots.buyerPhoneLabel' | translate }} <span>{{ 'admin.projectsPlots.optional' | translate }}</span></span>
        <input type="tel" name="buyerPhone" maxlength="20" [disabled]="busy" [(ngModel)]="buyerPhone" [attr.aria-invalid]="phoneError ? 'true' : null" />
        <app-field-error [message]="phoneError"></app-field-error>
      </label>
      <label class="book-form__extra"><span>{{ 'admin.projectsPlots.extraPriceLabel' | translate }} <span>{{ 'admin.projectsPlots.optional' | translate }}</span></span>
        <input #extraInput type="number" name="extraPrice" inputmode="decimal" min="0" step="any" autocomplete="off"
          [disabled]="busy" [(ngModel)]="extraRaw" [attr.aria-invalid]="extraError ? 'true' : null" />
        <app-field-error [message]="(extraError ? 'admin.projectsPlots.error.generic' : '') | translate"></app-field-error>
      </label>
      <label class="book-form__discount"><span>{{ 'admin.projectsPlots.discountLabel' | translate }} <span>{{ 'admin.projectsPlots.optional' | translate }}</span></span>
        <input #discountInput type="number" name="discount" inputmode="decimal" min="0" step="any" autocomplete="off"
          [disabled]="busy" [(ngModel)]="discountRaw"
          [attr.aria-invalid]="discountError ? 'true' : null" [attr.aria-describedby]="discountError ? 'book-discount-err' : null" />
        <app-field-error id="book-discount-err" [message]="(discountError ? 'admin.projectsPlots.discount.' + discountError : '') | translate"></app-field-error>
      </label>
      <div class="book-form__total-line" aria-live="polite">
        <span>{{ 'admin.projectsPlots.summary.total' | translate }}</span>
        <span class="book-form__total-value">{{ netText }}</span>
      </div>
      <p class="book-form__preview" *ngIf="previewKey as k">
        {{ k | translate: previewParams }}
      </p>
      <h3 class="book-form__section">{{ 'admin.projectsPlots.referralHeading' | translate }}</h3>
      <div class="book-form__grid">
        <label>{{ 'admin.projectsPlots.associateIdLabel' | translate }}
          <input type="text" name="associateUserId" autocomplete="off" [disabled]="busy" [(ngModel)]="associateUserId" (ngModelChange)="lookupAssociate()"
            [attr.aria-invalid]="associateError || (tried && !associateId) ? 'true' : null" />
          <app-field-error [message]="(associateError ? 'admin.projectsPlots.associateNotFound' : tried && !associateId ? 'admin.projectsPlots.associateRequired' : '') | translate"></app-field-error>
        </label>
        <label>{{ 'admin.projectsPlots.associateNameLabel' | translate }}
          <input type="text" name="associateName" readonly tabindex="-1" [value]="associateName" />
        </label>
      </div>
      <h3 class="book-form__section">{{ 'admin.projectsPlots.paymentHeading' | translate }}</h3>
      <div class="book-form__grid">
        <label>{{ 'admin.projectsPlots.firstInstallmentLabel' | translate }} <span>{{ 'admin.projectsPlots.optional' | translate }}</span>
          <input #firstInput type="number" name="firstInstallmentAmount" inputmode="decimal" min="0" step="any" autocomplete="off"
            [disabled]="busy" [(ngModel)]="firstInstallmentAmount" [attr.aria-invalid]="firstError ? 'true' : null" />
          <app-field-error [message]="(firstError ? 'admin.projectsPlots.firstInstallmentInvalid' : '') | translate"></app-field-error>
        </label>
        <label class="book-form__token">{{ 'admin.projectsPlots.bookingAmountLabel' | translate }}
          <input #tokenInput type="number" name="tokenAmount" inputmode="decimal" min="1" step="any" autocomplete="off"
            [disabled]="busy" [(ngModel)]="tokenAmount"
            [attr.aria-invalid]="tokenError ? 'true' : null" [attr.aria-describedby]="tokenError ? 'book-token-err' : null" />
          <app-field-error id="book-token-err" [message]="(tokenError ? 'admin.projectsPlots.token.' + tokenError : '') | translate"></app-field-error>
        </label>
        <label>{{ 'admin.projectsPlots.paymentModeLabel' | translate }}
          <select name="paymentMode" [disabled]="busy" [(ngModel)]="paymentMode" [attr.aria-invalid]="tried && !paymentMode ? 'true' : null">
            <option value="" disabled>{{ 'admin.projectsPlots.paymentModeSelect' | translate }}</option>
            <option *ngFor="let m of paymentModes" [value]="m">{{ 'admin.projectsPlots.paymentMode.' + m | translate }}</option>
          </select>
          <app-field-error [message]="(tried && !paymentMode ? 'admin.projectsPlots.fieldRequired' : '') | translate"></app-field-error>
        </label>
        <label>{{ 'admin.projectsPlots.txnNoLabel' | translate }}
          <input type="text" name="txnNo" maxlength="100" autocomplete="off" [disabled]="busy" [(ngModel)]="txnNo" [attr.aria-invalid]="tried && !txnNo.trim() ? 'true' : null" />
          <app-field-error [message]="(tried && !txnNo.trim() ? 'admin.projectsPlots.fieldRequired' : '') | translate"></app-field-error>
        </label>
        <label>{{ 'admin.projectsPlots.bankNameLabel' | translate }} <span *ngIf="!bankRequired">{{ 'admin.projectsPlots.optional' | translate }}</span>
          <input type="text" name="bankName" maxlength="100" autocomplete="off" [disabled]="busy" [(ngModel)]="bankName" [attr.aria-invalid]="bankError ? 'true' : null" />
          <app-field-error [message]="(bankError ? 'admin.projectsPlots.fieldRequired' : '') | translate"></app-field-error>
        </label>
        <label>{{ 'admin.projectsPlots.txnDateLabel' | translate }}
          <input type="date" name="txnDate" [max]="today" [disabled]="busy" [(ngModel)]="txnDate" [attr.aria-invalid]="dateError ? 'true' : null" />
          <app-field-error [message]="(dateError ? 'admin.projectsPlots.txnDateInvalid' : '') | translate"></app-field-error>
        </label>
      </div>
      <div class="projects-plots__form-actions book-form__actions">
        <button type="button" class="brand-button brand-button--secondary book-form__cancel" (click)="cancelled.emit()">{{ 'admin.projectsPlots.cancelAction' | translate }}</button>
        <button type="submit" class="brand-button" [disabled]="busy" [attr.aria-busy]="busy">
          {{ (busy ? 'admin.projectsPlots.bookingInProgress' : 'admin.projectsPlots.confirmBookingAction') | translate }}
        </button>
      </div>
    </form>
  `
})
export class BookPlotFormComponent implements OnInit {
  @Input({ required: true }) plot!: PlotGridItem;
  @Input() associates: AssociateSummary[] = [];
  @Input() emiConfig: BookingEmiConfig | null = null;
  @Input() projectName = '';
  @Input() location = '';
  @Input() rate: number | null = null;
  readonly formatInr = formatInr;
  @Input() busy = false;
  @Output() submitted = new EventEmitter<BookingFormValue>();
  @Output() cancelled = new EventEmitter<void>();
  @ViewChild('buyerNameInput') buyerNameInput?: ElementRef<HTMLInputElement>;
  @ViewChild('extraInput') extraInput?: ElementRef<HTMLInputElement>;
  @ViewChild('discountInput') discountInput?: ElementRef<HTMLInputElement>;
  @ViewChild('firstInput') firstInput?: ElementRef<HTMLInputElement>;
  @ViewChild('tokenInput') tokenInput?: ElementRef<HTMLInputElement>;

  associateId = '';
  associateUserId = '';
  associateName = '';
  associateError = false;
  firstInstallmentAmount: number | null = null;
  paymentModes = PAYMENT_MODES;
  paymentMode = '';
  txnNo = '';
  bankName = '';
  txnDate = '';
  today = new Date().toISOString().slice(0, 10);
  buyerName = '';
  buyerPhone = '';
  tokenAmount: number | null = null;
  extraRaw: number | null = null;
  discountRaw: number | null = null;
  tried = false;
  issues: FormIssue[] = [];

  // Prefilled from the plot's default Extra Price; the booking's own value overrides it.
  ngOnInit(): void { this.extraRaw = this.plot.extraPrice ?? 0; }

  // Associate is looked up client-side by its ID against the already-loaded list.
  lookupAssociate(): void {
    const id = this.associateUserId.trim().toLowerCase();
    const found = id ? this.associates.find(a => a.userId.toLowerCase() === id) : undefined;
    this.associateId = found?.id ?? '';
    this.associateName = found?.name ?? '';
    this.associateError = !!id && !found;
  }

  get bankRequired(): boolean { return !!this.paymentMode && this.paymentMode !== 'CASH'; }
  get bankError(): boolean { return this.tried && this.bankRequired && !this.bankName.trim(); }
  get dateError(): boolean { return this.tried && (!this.txnDate || this.txnDate > this.today); }
  // Must fit in the balance left after the booking amount.
  get firstError(): boolean {
    const f = this.firstInstallmentAmount;
    return f != null && (!(f > 0) || f > this.net - (this.tokenAmount ?? 0));
  }

  get extra(): number { return round2(this.extraRaw ?? 0); }
  get extraInvalid(): boolean { return this.extra < 0; }
  get extraError(): boolean { return this.tried && this.extraInvalid; }
  get extraText(): string { return formatInr(this.extra); }

  get phoneError(): string | undefined {
    const p = this.buyerPhone.trim();
    return this.tried && p ? errorMessage(new FormControl(p, format('phone')), 'Buyer phone') : undefined;
  }
  private buildIssues(): FormIssue[] {
    const out: FormIssue[] = [];
    const add = (id: string, label: string, message: string) => out.push({ id, label, message });
    if (!this.buyerName.trim()) { add('buyerName', 'Buyer name', 'Buyer name is required. Please fill it in.'); }
    if (this.phoneError) { add('buyerPhone', 'Buyer phone', this.phoneError); }
    if (this.extraInvalid) { add('extraPrice', 'Extra price', 'Extra price cannot be negative. Enter 0 or more.'); }
    if (this.discountError) { add('discount', 'Discount', this.discountError === 'negative' ? 'Discount cannot be negative. Enter 0 or more.' : 'Discount must be less than the total price. Enter a smaller amount.'); }
    if (this.firstError) { add('firstInstallmentAmount', 'First installment', 'First installment must be above 0 and within the balance after the booking amount.'); }
    if (this.tokenError) { add('tokenAmount', 'Booking amount', this.tokenError === 'required' ? 'Booking amount is required. Enter an amount above 0.' : 'Booking amount must be less than the net total. Enter a smaller amount.'); }
    if (!this.associateId) { add('associateUserId', 'Associate ID', this.associateError ? 'Associate ID was not found. Check the ID and retype it.' : "Associate ID is required. Enter the referring associate's ID."); }
    if (!this.paymentMode) { add('paymentMode', 'Payment mode', 'Payment mode is required. Choose one from the list.'); }
    if (!this.txnNo.trim()) { add('txnNo', 'Transaction number', 'Transaction number is required. Please fill it in.'); }
    if (this.bankError) { add('bankName', 'Bank name', 'Bank name is required for non-cash payments. Please fill it in.'); }
    if (this.dateError) { add('txnDate', 'Transaction date', this.txnDate ? 'Transaction date cannot be in the future. Pick today or earlier.' : 'Transaction date is required. Pick a date.'); }
    return out;
  }
  get nameInvalid(): boolean { return this.tried && !this.buyerName.trim(); }
  get priceText(): string { return formatInr(this.plot.price); }
  // The block is the plot number's prefix, as in the grid.
  get block(): string { return this.plot.plotNo.includes('-') ? this.plot.plotNo.slice(0, this.plot.plotNo.indexOf('-')) : ''; }
  get areaText(): string { return formatArea(this.plot.area); }

  // Mirrors the server: 2dp HALF_UP, 0 <= discount < price; token in (0, price - discount).
  get discount(): number { return round2(this.discountRaw ?? 0); }
  // Validity is independent of `tried` so the live summary never shows a bogus total.
  get discountInvalid(): boolean { return this.discount < 0 || this.discount >= this.plot.price + this.extra; }
  get discountError(): 'negative' | 'tooHigh' | null {
    if (!this.tried || !this.discountInvalid) { return null; }
    return this.discount < 0 ? 'negative' : 'tooHigh';
  }
  // An invalid discount falls back to the list price (preview only; submit is blocked and no summary shows).
  get net(): number {
    const gross = round2(this.plot.price + (this.extraInvalid ? 0 : this.extra));
    return this.discountInvalid ? gross : round2(gross - this.discount);
  }
  get discountText(): string { return formatInr(this.discount); }
  get netText(): string { return formatInr(this.net); }

  // Required, above zero and below the net total; the server enforces the same range.
  get tokenError(): 'required' | 'tooHigh' | null {
    if (!this.tried) { return null; }
    const t = this.tokenAmount;
    if (t == null || !(t > 0)) { return 'required'; }
    return t >= this.net ? 'tooHigh' : null;
  }
  private get tokenValid(): boolean {
    const t = this.tokenAmount;
    return t != null && t > 0 && t < this.net;
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
    return { token: formatInr(this.tokenAmount ?? 0), count, amount: formatInr(Math.round((this.net - (this.tokenAmount ?? 0)) / count)) };
  }

  submit(e: Event): void {
    e.preventDefault();
    if (this.busy) { return; } // double-submit guard; the disabled button alone is not enough for Enter-key submits
    this.tried = true;
    this.issues = this.buildIssues();
    if (this.phoneError) { return; }
    if (!this.buyerName.trim()) {
      this.buyerNameInput?.nativeElement.focus();
      return;
    }
    if (this.extraInvalid) {
      this.extraInput?.nativeElement.focus();
      return;
    }
    if (this.discountError) {
      this.discountInput?.nativeElement.focus();
      return;
    }
    if (this.tokenError) {
      this.tokenInput?.nativeElement.focus();
      return;
    }
    if (this.firstError) {
      this.firstInput?.nativeElement.focus();
      return;
    }
    if (!this.associateId || !this.paymentMode || !this.txnNo.trim() || this.bankError || this.dateError) { return; }
    this.submitted.emit({ paymentMode: this.paymentMode, txnNo: this.txnNo.trim(), bankName: this.bankName.trim(), txnDate: this.txnDate,
      firstInstallmentAmount: this.firstInstallmentAmount ?? undefined, associateId: this.associateId, buyerName: this.buyerName.trim(), buyerPhone: this.buyerPhone.trim(), tokenAmount: this.tokenAmount!, discount: this.discount, extraPrice: this.extra });
  }
}

// Half-up at 2dp via decimal-string shift (float *100 mis-rounds 1.005); sign handled apart so -0.005 -> -0.01, not 0.
const round2 = (n: number): number => Math.sign(n) * Number(Math.round(Number(Math.abs(n) + 'e2')) + 'e-2');
