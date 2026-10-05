// booking-seal.component.ts
import { ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild, inject , ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';
import { AssociateSummary } from '../models/associate-summary.model';
import { Booking, EmiInstallment } from '../../plot-bookings/models/associate-booking-page.model';
import { AssociateLookupComponent } from '../../shared/components/associate-lookup/associate-lookup.component';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { FieldErrorComponent } from '../../shared/components/field-error/field-error.component';
import { BookingEmiConfig, FlashMessage, PayRequest } from './bookings-emi.model';
import { BookingsEmiService } from './bookings-emi.service';
import { ErrorKind, associateLabel, formatMoney, classifyError, meterPercent, plotText, willAutoConfirm } from './bookings-emi.util';

type Mode = 'detail' | 'pay' | 'confirm' | 'cancel' | 'transfer';

@Component({
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['./booking-seal.component.scss'],
  selector: 'app-booking-seal',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslateModule, AssociateLookupComponent, InlineBannerComponent, FieldErrorComponent],
  template: `
    <section class="booking-seal">
      <p class="booking-seal__none" *ngIf="!booking">{{ 'admin.bookingsEmi.seal.none' | translate }}</p>

      <ng-container *ngIf="booking as b">
        <h2 #title tabindex="-1" class="booking-seal__title">{{ 'admin.bookingsEmi.seal.' + (mode === 'detail' ? 'detail' : mode) | translate }}</h2>
        <div class="booking-seal__head">
          <strong>{{ b.buyerName }}</strong>
          <span class="booking-register__chip booking-register__chip--{{ b.status | lowercase }}">{{ 'admin.bookingsEmi.status.' + b.status | translate }}</span>
        </div>
        <div class="booking-seal__sub">{{ plot(b) }}<ng-container *ngIf="b.projectName"> · {{ b.projectName }}</ng-container></div>
        <div class="booking-seal__id">{{ b.id }}</div>
        <p class="booking-seal__note" role="status" *ngIf="filterMismatch">{{ 'admin.bookingsEmi.seal.filterMismatch' | translate }}</p>

        <dl class="booking-seal__meta">
          <dt>{{ 'admin.bookingsEmi.col.associate' | translate }}</dt><dd>{{ assoc(b) }}</dd>
          <dt>{{ 'admin.bookingsEmi.seal.booked' | translate }}</dt><dd>{{ b.bookedAt | date: 'mediumDate' }}</dd>
          <dt>{{ 'admin.bookingsEmi.seal.plan' | translate }}</dt>
          <dd>{{ b.installments.length ? ('admin.bookingsEmi.seal.planValue' | translate: { count: b.installmentCount, amount: money(b.installments[0].amount) }) : '—' }}</dd>
          <dt>{{ 'admin.bookingsEmi.col.total' | translate }}</dt><dd>{{ money(b.totalAmount) }}</dd>
          <dt>{{ 'admin.bookingsEmi.col.paid' | translate }}</dt><dd>{{ money(b.paidAmount) }}</dd>
          <dt>{{ 'admin.bookingsEmi.col.due' | translate }}</dt><dd>{{ b.status === 'CANCELLED' ? '—' : money(b.dueAmount) }}</dd>
        </dl>

        <div class="booking-seal__meter" role="img"
          [attr.aria-label]="(threshold !== null ? 'admin.bookingsEmi.seal.meter' : 'admin.bookingsEmi.seal.meterPlain') | translate: { pct: pct(b.paidAmount, b.totalAmount), threshold: threshold }">
          <span class="booking-seal__meter-fill" [style.width.%]="pct(b.paidAmount, b.totalAmount)"></span>
          <span class="booking-seal__meter-tick" *ngIf="threshold !== null" [style.left.%]="threshold"></span>
        </div>

        <ng-container *ngIf="mode === 'detail'">
          <table class="booking-seal__table">
            <thead><tr>
              <th>{{ 'admin.bookingsEmi.col.no' | translate }}</th>
              <th>{{ 'admin.bookingsEmi.col.dueDate' | translate }}</th>
              <th>{{ 'admin.bookingsEmi.col.amount' | translate }}</th>
              <th>{{ 'admin.bookingsEmi.col.installmentStatus' | translate }}</th>
              <th></th>
            </tr></thead>
            <tbody>
              <tr *ngFor="let i of b.installments" class="booking-seal__row" [class.booking-seal__row--void]="i.status === 'VOID'">
                <td>{{ i.installmentNumber }}</td>
                <td>{{ i.dueDate | date: 'mediumDate' }}
                  <span class="booking-seal__overdue" *ngIf="i.overdue && i.status === 'PENDING'">{{ 'admin.bookingsEmi.overdueBadge' | translate }}</span></td>
                <td>{{ money(i.amount) }}</td>
                <td>{{ 'admin.bookingsEmi.installment.' + i.status | translate }}<ng-container *ngIf="i.status === 'PAID' && i.paidAt"> · {{ i.paidAt | date: 'mediumDate' }}</ng-container></td>
                <td>
                  <button type="button" class="brand-button brand-button--secondary booking-seal__pay"
                    *ngIf="b.status === 'ACTIVE' && i.status === 'PENDING'" [disabled]="busy"
                    [attr.aria-label]="('admin.bookingsEmi.action.pay' | translate) + ' ' + i.installmentNumber" [attr.data-opener]="'pay-' + i.installmentNumber" (click)="open('pay', i)">{{ 'admin.bookingsEmi.action.pay' | translate }}</button>
                </td>
              </tr>
            </tbody>
          </table>

          <div class="booking-seal__actions">
            <button type="button" class="brand-button booking-seal__action" [disabled]="b.status !== 'ACTIVE' || busy"
              [attr.aria-describedby]="b.status !== 'ACTIVE' ? 'seal-locked-reason' : null" data-opener="confirm" (click)="open('confirm')">{{ 'admin.bookingsEmi.action.confirm' | translate }}</button>
            <button type="button" class="brand-button brand-button--secondary booking-seal__action" [disabled]="b.status !== 'ACTIVE' || busy"
              [attr.aria-describedby]="b.status !== 'ACTIVE' ? 'seal-locked-reason' : null" data-opener="transfer" (click)="open('transfer')">{{ 'admin.bookingsEmi.action.transfer' | translate }}</button>
            <button type="button" class="brand-button brand-button--secondary booking-seal__action" [disabled]="b.status !== 'ACTIVE' || busy"
              [attr.aria-describedby]="b.status !== 'ACTIVE' ? 'seal-locked-reason' : null" data-opener="cancel" (click)="open('cancel')">{{ 'admin.bookingsEmi.action.cancel' | translate }}</button>
          </div>
          <p id="seal-locked-reason" class="booking-seal__locked" *ngIf="b.status !== 'ACTIVE'">
            {{ 'admin.bookingsEmi.locked.' + (b.status === 'CANCELLED' ? 'cancelled' : 'active') | translate }}
          </p>
        </ng-container>

        <form *ngIf="mode !== 'detail'" class="booking-seal__form" novalidate (submit)="onSubmit(); $event.preventDefault()">
          <app-inline-banner tone="danger" role="alert" *ngIf="error && !isLookupError">
            <ng-container [ngSwitch]="bannerKey">
              <ng-container *ngSwitchCase="'payNetwork'">{{ 'admin.bookingsEmi.err.payNetwork' | translate: { n: payTarget?.installmentNumber } }}
                <button type="button" class="brand-button brand-button--secondary booking-seal__reload" (click)="reloadRequested.emit()">{{ 'admin.bookingsEmi.action.reload' | translate }}</button>
              </ng-container>
              <ng-container *ngSwitchCase="'plotDriftPay'">{{ 'admin.bookingsEmi.err.plotDriftPay' | translate: { n: payTarget?.installmentNumber } }}</ng-container>
              <ng-container *ngSwitchCase="'amountMismatch'">{{ 'admin.bookingsEmi.err.amountMismatch' | translate: { amount: money(payTarget?.amount ?? 0) } }}</ng-container>
              <ng-container *ngSwitchCase="'notPayable'">{{ 'admin.bookingsEmi.err.notPayable' | translate: { n: payTarget?.installmentNumber } }}</ng-container>
              <ng-container *ngSwitchDefault>{{ 'admin.bookingsEmi.err.' + bannerKey | translate }}</ng-container>
            </ng-container>
            <ng-container *ngIf="error.kind === 'plotDrift'">
              <br />{{ (mode === 'pay' ? 'admin.bookingsEmi.err.plotDriftFix' : 'admin.bookingsEmi.err.plotDriftFixConfirm') | translate }}
              <a routerLink="/settings/projects-plots">{{ 'admin.bookingsEmi.linkProjectsPlots' | translate }}</a>
              <ng-container *ngIf="mode === 'pay'"> · <a routerLink="/settings/payments-kyc">{{ 'admin.bookingsEmi.linkSettings' | translate }}</a></ng-container>
            </ng-container>
            <div class="booking-seal__server" *ngIf="error.serverText">{{ 'admin.bookingsEmi.err.serverSaid' | translate: { text: error.serverText } }}</div>
          </app-inline-banner>

          <ng-container *ngIf="mode === 'pay' && payTarget">
            <app-inline-banner tone="warning" role="status" *ngIf="predicts">
              <strong>{{ 'admin.bookingsEmi.warn.autoConfirm' | translate }}</strong>
              {{ 'admin.bookingsEmi.warn.autoConfirmDetail' | translate: { before: money(b.paidAmount), after: money(b.paidAmount + payTarget.amount) } }}
            </app-inline-banner>
            <fieldset class="booking-seal__fields" [disabled]="busy">
              <label>{{ 'admin.bookingsEmi.field.amount' | translate }}
                <input name="amount" type="text" readonly [value]="money(payTarget.amount)" aria-describedby="seal-amount-hint" /></label>
              <small id="seal-amount-hint">{{ 'admin.bookingsEmi.field.amountHint' | translate }}</small>
              <label>{{ 'admin.bookingsEmi.field.ref' | translate }}
                <input name="paymentRef" type="text" maxlength="200" autocomplete="off" [attr.aria-invalid]="refInvalid ? 'true' : null" aria-describedby="seal-ref-count seal-ref-error" [value]="paymentRef" (input)="paymentRef = $any($event.target).value" /></label>
              <small id="seal-ref-count">{{ 'admin.bookingsEmi.field.refCount' | translate: { n: paymentRef.trim().length } }}</small>
              <app-field-error id="seal-ref-error" [message]="tried && !paymentRef.trim() ? ('admin.bookingsEmi.validation.ref' | translate) : tried && paymentRef.trim().length > 100 ? ('admin.bookingsEmi.validation.refMax' | translate) : undefined"></app-field-error>
              <label>{{ 'admin.bookingsEmi.field.receivedOn' | translate }}
                <input name="receivedOn" type="datetime-local" [value]="receivedOn" (input)="receivedOn = $any($event.target).value" /></label>
            </fieldset>
          </ng-container>

          <ng-container *ngIf="mode === 'confirm'">
            <ul class="booking-seal__effects">
              <li>{{ 'admin.bookingsEmi.confirmEffects.0' | translate }}</li>
              <li>{{ 'admin.bookingsEmi.confirmEffects.1' | translate }}</li>
              <li>{{ 'admin.bookingsEmi.confirmEffects.2' | translate }}</li>
            </ul>
          </ng-container>

          <ng-container *ngIf="mode === 'cancel'">
            <ul class="booking-seal__effects">
              <li>{{ 'admin.bookingsEmi.cancelEffects.0' | translate: { count: pendingCount } }}</li>
              <li>{{ 'admin.bookingsEmi.cancelEffects.1' | translate }}</li>
              <li>{{ 'admin.bookingsEmi.cancelEffects.2' | translate }}</li>
            </ul>
            <fieldset class="booking-seal__fields" [disabled]="busy">
              <label>{{ 'admin.bookingsEmi.field.reason' | translate }}
                <textarea name="reason" rows="3" [attr.aria-invalid]="reasonInvalid ? 'true' : null" aria-describedby="seal-reason-count seal-reason-error" [value]="reason" (input)="reason = $any($event.target).value"></textarea></label>
              <small id="seal-reason-count">{{ 'admin.bookingsEmi.field.reasonCount' | translate: { n: reason.trim().length } }}</small>
              <app-field-error id="seal-reason-error" [message]="tried && !reason.trim() ? ('admin.bookingsEmi.validation.reason' | translate) : tried && reason.trim().length > 255 ? ('admin.bookingsEmi.validation.reasonMax' | translate) : undefined"></app-field-error>
            </fieldset>
          </ng-container>

          <ng-container *ngIf="mode === 'transfer'">
            <fieldset class="booking-seal__fields" [disabled]="busy">
              <span id="seal-target-label">{{ 'admin.bookingsEmi.field.target' | translate }}</span>
              <div role="group" aria-labelledby="seal-target-label"><app-associate-lookup [associates]="transferChoices" [placeholder]="'admin.bookingsEmi.field.target' | translate" [value]="targetId" (selected)="targetId = $event?.id ?? ''"></app-associate-lookup></div>
              <small>{{ 'admin.bookingsEmi.transferHint' | translate }}</small>
              <app-field-error [message]="tried && !targetId ? ('admin.bookingsEmi.validation.target' | translate) : undefined"></app-field-error>
              <app-field-error *ngIf="error && isLookupError" [message]="'admin.bookingsEmi.err.' + error.kind | translate"></app-field-error>
            </fieldset>
          </ng-container>

          <div class="booking-seal__form-actions">
            <button type="submit" class="brand-button booking-seal__submit" *ngIf="!netUnknown" [disabled]="busy" [attr.aria-busy]="busy">{{ submitLabel | translate: { amount: money(payTarget?.amount ?? 0) } }}</button>
            <button type="button" class="brand-button brand-button--secondary booking-seal__back" [disabled]="busy" (click)="close()">{{ (mode === 'cancel' ? 'admin.bookingsEmi.action.keep' : 'admin.bookingsEmi.action.back') | translate }}</button>
          </div>
        </form>
      </ng-container>
    </section>
  `
})
export class BookingSealComponent implements OnChanges {
  private service = inject(BookingsEmiService);
  @Input() booking: Booking | null = null;
  @Input() config: BookingEmiConfig | null = null;
  @Input() directory: AssociateSummary[] = [];
  @Input() filterMismatch = false;
  @Output() updated = new EventEmitter<Booking>();
  @Output() flash = new EventEmitter<FlashMessage>();
  @Output() busyChange = new EventEmitter<boolean>();
  @Output() reloadRequested = new EventEmitter<void>();
  @ViewChild('title') title?: ElementRef<HTMLElement>;

  private cdr = inject(ChangeDetectorRef);
  private el = inject<ElementRef<HTMLElement>>(ElementRef);
  private opener = '';
  mode: Mode = 'detail';
  payTarget: EmiInstallment | null = null;
  paymentRef = ''; receivedOn = ''; reason = ''; targetId = '';
  tried = false; busy = false;
  netUnknown = false; // a pay request died with no response: outcome unknown, no resubmit until the booking is refreshed
  error: { kind: ErrorKind; serverText?: string } | null = null;

  money = formatMoney; pct = meterPercent; plot = plotText;
  assoc = (b: Booking) => associateLabel(b, this.directory);
  get pendingCount(): number { return this.booking?.installments.filter(i => i.status === 'PENDING').length ?? 0; }
  get predicts(): boolean { return !!(this.booking && this.payTarget && willAutoConfirm(this.booking, this.payTarget.amount, this.config)); }
  get threshold(): number | null {
    return this.config?.confirmRule === 'AUTO_THRESHOLD' ? this.config.confirmThresholdPercent : null;
  }
  get refInvalid(): boolean { const n = this.paymentRef.trim().length; return this.tried && (n === 0 || n > 100); }
  get reasonInvalid(): boolean { const n = this.reason.trim().length; return this.tried && (n === 0 || n > 255); }
  get transferChoices(): AssociateSummary[] { return this.directory.filter(a => a.id !== this.booking?.associateId); }
  get isLookupError(): boolean { return this.mode === 'transfer' && (this.error?.kind === 'sameAssociate' || this.error?.kind === 'invalidTarget'); }
  get bannerKey(): string {
    const k = this.error?.kind;
    if (k === 'network') { return this.mode === 'pay' ? 'payNetwork' : 'generic'; }
    if (k === 'plotDrift') { return this.mode === 'pay' ? 'plotDriftPay' : 'plotDriftConfirm'; }
    if (k === 'validation' || !k) { return 'generic'; }
    return k;
  }
  get submitLabel(): string {
    const labels = { pay: ['payBtn', 'recording'], confirm: ['confirmBtn', 'confirming'], cancel: ['cancelBtn', 'cancelling'], transfer: ['transferBtn', 'transferring'], detail: ['', ''] }[this.mode];
    return 'admin.bookingsEmi.action.' + labels[this.busy ? 1 : 0];
  }

  ngOnChanges(ch: SimpleChanges): void {
    if (!ch['booking']) { return; }
    if (ch['booking'].previousValue?.id !== this.booking?.id) { this.netUnknown = false; this.reset(); return; } // never releases a busy lock
    // same booking refreshed (e.g. after Reload): the outcome of an unknown request is now visible
    if (this.netUnknown) { this.netUnknown = false; this.error = null; }
    if (this.mode === 'detail' || this.busy) { return; }
    const fresh = this.mode === 'pay' ? this.booking?.installments.find(i => i.installmentNumber === this.payTarget?.installmentNumber) : null;
    if (this.booking?.status !== 'ACTIVE' || (this.mode === 'pay' && fresh?.status !== 'PENDING')) {
      const e = this.error;
      const n = this.payTarget?.installmentNumber;
      this.close();
      // the form (and its explanation) is going away because state changed: keep the explanation visible
      if (e && (e.kind === 'notActive' || e.kind === 'notPayable')) { this.flash.emit({ key: 'admin.bookingsEmi.err.' + e.kind, params: { n } }); }
    } else if (fresh) { this.payTarget = fresh; }
  }

  open(mode: 'pay' | 'confirm' | 'cancel' | 'transfer', i?: EmiInstallment): void {
    if (this.busy) { return; }
    this.opener = mode === 'pay' ? 'pay-' + i!.installmentNumber : mode;
    this.mode = mode; this.payTarget = i ?? null; this.error = this.netUnknown && mode === 'pay' ? { kind: 'network' } : null; this.tried = false;
    this.paymentRef = ''; this.receivedOn = ''; this.reason = ''; this.targetId = '';
    setTimeout(() => this.title?.nativeElement.focus());
  }
  private reset(): void { this.mode = 'detail'; this.payTarget = null; this.error = null; this.tried = false; this.opener = ''; }
  close(): void {
    if (this.busy) { return; }
    const opener = this.opener;
    this.reset();
    setTimeout(() => {
      this.cdr.detectChanges(); // the detail view re-renders only after this tick; query it after it exists
      const host = this.el.nativeElement;
      const target = opener ? host.querySelector<HTMLElement>(`[data-opener="${opener}"]:not([disabled])`) : null;
      (target ?? this.title?.nativeElement)?.focus();
    });
  }

  onSubmit(): void {
    if (this.mode === 'pay') { this.submitPay(); }
    else if (this.mode === 'confirm') { this.submitConfirm(); }
    else if (this.mode === 'cancel') { this.submitCancel(); }
    else if (this.mode === 'transfer') { this.submitTransfer(); }
  }

  private run(op: 'pay' | 'confirm' | 'cancel' | 'transfer', call: Observable<Booking>, okKey: (res: Booking, before: Booking) => FlashMessage): void {
    if (this.busy || !this.booking) { return; }
    const before = this.booking;
    this.setBusy(true); this.error = null;
    call.subscribe({
      next: res => { this.setBusy(false); this.close(); this.flash.emit(okKey(res, before)); this.updated.emit(res); },
      error: (err: HttpErrorResponse) => {
        this.setBusy(false);
        this.error = classifyError(err, op);
        if (this.error.kind === 'network' && op === 'pay') { this.netUnknown = true; }
        if (['notActive', 'notPayable', 'notFound'].includes(this.error.kind)) { this.reloadRequested.emit(); }
      }
    });
  }
  private setBusy(v: boolean): void { this.busy = v; this.busyChange.emit(v); }

  submitPay(): void {
    if (this.busy || this.netUnknown || !this.booking || !this.payTarget) { return; }
    this.tried = true;
    const ref = this.paymentRef.trim();
    if (!ref || ref.length > 100) { return; }
    const target = this.payTarget;
    const req: PayRequest = { amount: target.amount, paymentRef: ref };
    if (this.receivedOn) { req.paidAt = new Date(this.receivedOn).toISOString(); }
    this.run('pay', this.service.pay(this.booking.id, target.installmentNumber, req), (res, before) => {
      const buyer = res.buyerName;
      return before.status === 'ACTIVE' && res.status === 'CONFIRMED'
        ? { key: 'admin.bookingsEmi.ok.autoConfirm', params: { n: target.installmentNumber, buyer, pct: this.pct(res.paidAmount, res.totalAmount) } }
        : { key: 'admin.bookingsEmi.ok.pay', params: { n: target.installmentNumber, buyer, amount: this.money(target.amount) } };
    });
  }
  submitConfirm(): void {
    if (!this.booking) { return; }
    this.run('confirm', this.service.confirm(this.booking.id), r => ({ key: 'admin.bookingsEmi.ok.confirm', params: { buyer: r.buyerName } }));
  }
  submitCancel(): void {
    if (this.busy || !this.booking) { return; }
    this.tried = true;
    const reason = this.reason.trim();
    if (!reason || reason.length > 255) { return; }
    this.run('cancel', this.service.cancel(this.booking.id, reason), r => ({ key: 'admin.bookingsEmi.ok.cancel', params: { buyer: r.buyerName } }));
  }
  submitTransfer(): void {
    if (this.busy || !this.booking) { return; }
    this.tried = true;
    if (!this.targetId) { return; }
    if (this.targetId === this.booking.associateId) { this.error = { kind: 'sameAssociate' }; return; }
    const name = this.directory.find(a => a.id === this.targetId)?.name ?? '';
    this.run('transfer', this.service.transfer(this.booking.id, this.targetId), () => ({ key: 'admin.bookingsEmi.ok.transfer', params: { associate: name } }));
  }
}
