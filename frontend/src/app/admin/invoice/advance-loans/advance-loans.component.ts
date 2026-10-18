import { Component, HostListener, OnInit, TemplateRef, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AssociateOption, InvoiceService, LoanCreate, LoanDetail, LoanRow, PAY_MODES, PayMode } from '../invoice.service';
import { EditableTableColumn, EditableTableComponent } from '../../../shared/components/editable-table/editable-table.component';
import { fitSize } from '../../../shared/utils/fit-text.util';
import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';

@Component({
  selector: 'app-invoice-loans',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule, TranslateModule, EditableTableComponent, InlineBannerComponent],
  template: `
    <div class="invoice-loans">
      <div class="invoice-loans__intro">
        <div class="invoice-loans__intro-copy">
          <span class="invoice-loans__eyebrow">{{ 'admin.invoiceLoans.eyebrow' | translate }}</span>
          <h1 class="invoice-loans__title">{{ 'admin.invoiceLoans.title' | translate }}</h1>
          <p class="invoice-loans__subtitle">{{ 'admin.invoiceLoans.subtitle' | translate }}</p>
        </div>
        <button type="button" class="invoice-loans__add brand-button" (click)="openAdd()">
          {{ 'admin.invoiceLoans.addAction' | translate }}
        </button>
      </div>

      <app-inline-banner *ngIf="loadError" tone="danger" [dismissible]="true" (dismissed)="loadError = false">{{ 'admin.invoiceLoans.loadError' | translate }}</app-inline-banner>
      <div class="card">
        <app-editable-table
          [readOnly]="true"
          [columns]="columns"
          [rows]="rows"
          [actionTemplate]="actionTemplate"
          [emptyStateLabel]="'admin.invoiceLoans.emptyState' | translate"
        ></app-editable-table>
      </div>

      <ng-template #actionTemplate let-row let-i="index">
        <span class="invoice-loans__row-actions" *ngIf="items[i]">
          <button *ngIf="items[i].outstanding > 0" type="button" class="invoice-loans__repay brand-button" (click)="openRepay(items[i])">{{ 'admin.invoiceLoans.repayAction' | translate }}</button>
          <button type="button" class="invoice-loans__detail brand-button" (click)="openDetail(items[i])">{{ 'admin.invoiceLoans.detailAction' | translate }}</button>
        </span>
      </ng-template>

      <div class="invoice-loans__modal-overlay" *ngIf="addOpen">
        <div class="invoice-loans__modal invoice-loans__add-modal" role="dialog" aria-modal="true" aria-labelledby="invoice-loans-add-title">
          <h2 class="invoice-loans__modal-title" id="invoice-loans-add-title">{{ 'admin.invoiceLoans.addTitle' | translate }}</h2>
          <app-inline-banner *ngIf="formError" tone="danger">{{ formError }}</app-inline-banner>
          <form [formGroup]="form" (ngSubmit)="save()">
            <div class="invoice-loans__add-fields">
            <div class="invoice-loans__field invoice-loans__modal-field">
              <label>{{ 'admin.invoiceLoans.associate' | translate }}</label>
              <input type="text" list="invoice-loans-associates" formControlName="associateText" autocomplete="off" (change)="pickAssociate($any($event.target).value)" />
              <datalist id="invoice-loans-associates">
                <option *ngFor="let a of associates" [value]="label(a)"></option>
              </datalist>
            </div>
            <div class="invoice-loans__field invoice-loans__modal-field">
              <label>{{ 'admin.invoiceLoans.associateId' | translate }}</label>
              <input type="text" readonly [value]="picked?.userId ?? ''" />
            </div>
            <div class="invoice-loans__field invoice-loans__modal-field">
              <label>{{ 'admin.invoiceLoans.associateName' | translate }}</label>
              <input type="text" readonly [value]="picked?.name ?? ''" />
            </div>
            <div class="invoice-loans__field invoice-loans__modal-field">
              <label>{{ 'admin.invoiceLoans.previousDues' | translate }}</label>
              <input type="text" readonly [value]="previousDues.toFixed(2)" />
            </div>
            <div class="invoice-loans__field invoice-loans__modal-field">
              <label>{{ 'admin.invoiceLoans.loanDate' | translate }}</label>
              <input type="date" formControlName="loanDate" />
            </div>
            <div class="invoice-loans__field invoice-loans__modal-field">
              <label>{{ 'admin.invoiceLoans.amount' | translate }}</label>
              <input type="number" step="0.01" min="0.01" inputmode="decimal" formControlName="amount" />
            </div>
            <div class="invoice-loans__field invoice-loans__modal-field">
              <label>{{ 'admin.invoiceLoans.payMode' | translate }}</label>
              <select formControlName="payMode">
                <option *ngFor="let m of payModes" [value]="m">{{ 'admin.invoiceLoans.payModes.' + m | translate }}</option>
              </select>
            </div>
            <div class="invoice-loans__field invoice-loans__modal-field">
              <label>{{ 'admin.invoiceLoans.bankName' | translate }}</label>
              <input type="text" formControlName="bankName" />
            </div>
            <div class="invoice-loans__field invoice-loans__modal-field">
              <label>{{ 'admin.invoiceLoans.instrumentNo' | translate }}</label>
              <input type="text" formControlName="instrumentNo" />
            </div>
            <div class="invoice-loans__field invoice-loans__field--wide invoice-loans__modal-field">
              <label>{{ 'admin.invoiceLoans.remarks' | translate }}</label>
              <textarea rows="2" formControlName="remarks"></textarea>
            </div>
            </div>
            <div class="invoice-loans__modal-footer">
              <button type="button" class="invoice-loans__modal-cancel" (click)="closeAdd()">{{ 'admin.invoiceLoans.cancelAction' | translate }}</button>
              <button type="submit" class="invoice-loans__modal-submit" [disabled]="saving">{{ 'admin.invoiceLoans.saveAction' | translate }}</button>
            </div>
          </form>
        </div>
      </div>

      <div class="invoice-loans__modal-overlay" *ngIf="detailOpen">
        <div class="invoice-loans__modal invoice-loans__detail-modal" role="dialog" aria-modal="true" aria-labelledby="invoice-loans-detail-title">
          <h2 class="invoice-loans__modal-title" id="invoice-loans-detail-title">{{ 'admin.invoiceLoans.detailTitle' | translate }}<ng-container *ngIf="detail"> — {{ detail.loan.associateUserId }} {{ detail.loan.associateName }}</ng-container></h2>
          <app-inline-banner *ngIf="detailError" tone="danger">{{ detailError }}</app-inline-banner>
          <p *ngIf="detailLoading">{{ 'admin.invoiceLoans.detailLoading' | translate }}</p>
          <ng-container *ngIf="detail as d">
            <dl class="invoice-loans__detail-grid">
              <div><dt>{{ 'admin.invoiceLoans.associateId' | translate }}</dt><dd>{{ d.loan.associateUserId }}</dd></div>
              <div><dt>{{ 'admin.invoiceLoans.associateName' | translate }}</dt><dd>{{ d.loan.associateName }}</dd></div>
              <div><dt>{{ 'admin.invoiceLoans.mobileNo' | translate }}</dt><dd>{{ d.associatePhone || '—' }}</dd></div>
              <div><dt>{{ 'admin.invoiceLoans.detailLoanDate' | translate }}</dt><dd>{{ d.loan.loanDate }}</dd></div>
              <div><dt>{{ 'admin.invoiceLoans.amount' | translate }}</dt><dd>{{ d.loan.amount.toFixed(2) }}</dd></div>
              <div><dt>{{ 'admin.invoiceLoans.previousDues' | translate }}</dt><dd>{{ d.loan.previousDues.toFixed(2) }}</dd></div>
              <div><dt>{{ 'admin.invoiceLoans.repaid' | translate }}</dt><dd>{{ d.loan.repaid.toFixed(2) }}</dd></div>
              <div><dt>{{ 'admin.invoiceLoans.outstanding' | translate }}</dt><dd>{{ d.loan.outstanding.toFixed(2) }}</dd></div>
              <div><dt>{{ 'admin.invoiceLoans.payMode' | translate }}</dt><dd>{{ 'admin.invoiceLoans.payModes.' + d.loan.payMode | translate }}</dd></div>
              <div><dt>{{ 'admin.invoiceLoans.bankName' | translate }}</dt><dd>{{ d.loan.bankName || '—' }}</dd></div>
              <div><dt>{{ 'admin.invoiceLoans.instrumentNo' | translate }}</dt><dd>{{ d.loan.instrumentNo || '—' }}</dd></div>
              <div><dt>{{ 'admin.invoiceLoans.remarks' | translate }}</dt><dd>{{ d.loan.remarks || '—' }}</dd></div>
            </dl>
            <h3 class="invoice-loans__detail-heading">{{ 'admin.invoiceLoans.repaymentsHeading' | translate }}</h3>
            <p *ngIf="!d.repayments.length">{{ 'admin.invoiceLoans.noRepayments' | translate }}</p>
            <table class="invoice-loans__repayments" *ngIf="d.repayments.length">
              <thead>
                <tr>
                  <th>{{ 'admin.invoiceLoans.receiptNo' | translate }}</th>
                  <th>{{ 'admin.invoiceLoans.paymentDate' | translate }}</th>
                  <th>{{ 'admin.invoiceLoans.amount' | translate }}</th>
                  <th>{{ 'admin.invoiceLoans.payMode' | translate }}</th>
                  <th>{{ 'admin.invoiceLoans.bankName' | translate }}</th>
                  <th>{{ 'admin.invoiceLoans.txnNo' | translate }}</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let r of d.repayments">
                  <td [attr.data-label]="'admin.invoiceLoans.receiptNo' | translate"><a [routerLink]="['/settings/payment-details/receipt', r.id]" target="_blank" rel="noopener">{{ r.receiptNo }}</a></td>
                  <td [attr.data-label]="'admin.invoiceLoans.paymentDate' | translate">{{ r.paymentDate }}</td>
                  <td [attr.data-label]="'admin.invoiceLoans.amount' | translate" [class.editable-table__cell--fit-md]="fit(r.amount) === 'md'" [class.editable-table__cell--fit-sm]="fit(r.amount) === 'sm'">{{ r.amount.toFixed(2) }}</td>
                  <td [attr.data-label]="'admin.invoiceLoans.payMode' | translate">{{ 'admin.invoiceLoans.payModes.' + r.payMode | translate }}</td>
                  <td [attr.data-label]="'admin.invoiceLoans.bankName' | translate">{{ r.bankName || '—' }}</td>
                  <td [attr.data-label]="'admin.invoiceLoans.txnNo' | translate">{{ r.txnNo || '—' }}</td>
                </tr>
              </tbody>
            </table>
          </ng-container>
          <div class="invoice-loans__modal-footer">
            <button type="button" class="invoice-loans__modal-cancel" (click)="closeDetail()">{{ 'admin.invoiceLoans.closeAction' | translate }}</button>
          </div>
        </div>
      </div>

      <div class="invoice-loans__modal-overlay" *ngIf="repayOpen">
        <div class="invoice-loans__modal">
          <h2 class="invoice-loans__modal-title">{{ 'admin.invoiceLoans.repayTitle' | translate }}</h2>
          <p *ngIf="repayLoan">{{ 'admin.invoiceLoans.outstandingHint' | translate }}: {{ repayLoan.outstanding.toFixed(2) }}</p>
          <app-inline-banner *ngIf="repayError" tone="danger">{{ repayError }}</app-inline-banner>
          <form [formGroup]="repayForm" (ngSubmit)="saveRepay()">
            <div class="invoice-loans__modal-fields">
              <div class="invoice-loans__modal-field">
                <label>{{ 'admin.invoiceLoans.paymentDate' | translate }}</label>
                <input type="date" formControlName="paymentDate" />
              </div>
              <div class="invoice-loans__modal-field">
                <label>{{ 'admin.invoiceLoans.amount' | translate }}</label>
                <input type="number" step="0.01" min="0.01" inputmode="decimal" formControlName="amount" />
              </div>
              <div class="invoice-loans__modal-field">
                <label>{{ 'admin.invoiceLoans.payMode' | translate }}</label>
                <select formControlName="payMode">
                  <option *ngFor="let m of payModes" [value]="m">{{ 'admin.invoiceLoans.payModes.' + m | translate }}</option>
                </select>
              </div>
              <div class="invoice-loans__modal-field">
                <label>{{ 'admin.invoiceLoans.bankName' | translate }}</label>
                <input type="text" formControlName="bankName" />
              </div>
              <div class="invoice-loans__modal-field">
                <label>{{ 'admin.invoiceLoans.txnNo' | translate }}</label>
                <input type="text" formControlName="txnNo" />
              </div>
            </div>
            <div class="invoice-loans__modal-footer">
              <button type="button" class="invoice-loans__modal-cancel" (click)="repayOpen = false">{{ 'admin.invoiceLoans.cancelAction' | translate }}</button>
              <button type="submit" class="invoice-loans__modal-submit" [disabled]="repaySaving">{{ 'admin.invoiceLoans.saveAction' | translate }}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `
})
export class AdvanceLoansComponent implements OnInit {
  private service = inject(InvoiceService);
  private translate = inject(TranslateService);
  private fb = inject(FormBuilder);

  @ViewChild('actionTemplate', { static: true }) actionTemplate!: TemplateRef<never>;

  readonly payModes = PAY_MODES;
  associates: AssociateOption[] = [];
  picked: AssociateOption | null = null;
  previousDues = 0;
  items: LoanRow[] = [];
  columns: EditableTableColumn[] = [];
  rows: Record<string, string>[] = [];
  loadError = false;
  formError: string | null = null;

  addOpen = false;
  repayOpen = false;
  repayLoan: LoanRow | null = null;
  repayError: string | null = null;
  detailOpen = false;
  detailLoading = false;
  detail: LoanDetail | null = null;
  detailError: string | null = null;
  private detailLoanId: string | null = null;
  saving = false;
  repaySaving = false;

  private readonly defaults = { associateText: '', associateId: '', loanDate: '', amount: 0, payMode: 'CASH' as PayMode, bankName: '', instrumentNo: '', remarks: '' };
  form = this.fb.nonNullable.group({
    associateText: [''],
    associateId: ['', Validators.required],
    loanDate: ['', Validators.required],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    payMode: ['CASH' as PayMode, Validators.required],
    bankName: [''],
    instrumentNo: [''],
    remarks: ['']
  });
  private readonly repayDefaults = { paymentDate: '', amount: 0, payMode: 'CASH' as PayMode, bankName: '', txnNo: '' };
  repayForm = this.fb.nonNullable.group({
    paymentDate: ['', Validators.required],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    payMode: ['CASH' as PayMode, Validators.required],
    bankName: [''],
    txnNo: ['']
  });

  ngOnInit(): void {
    const t = (key: string) => this.translate.instant(`admin.invoiceLoans.${key}`);
    this.columns = [
      { key: 'sNo', label: t('columnSNo'), type: 'text' },
      { key: 'date', label: t('loanDate'), type: 'text' },
      { key: 'userId', label: t('associateId'), type: 'text' },
      { key: 'name', ellipsis: true, label: t('associateName'), type: 'text' },
      { key: 'amount', fitText: true, label: t('amount'), type: 'text' },
      { key: 'previousDues', fitText: true, label: t('previousDues'), type: 'text' },
      { key: 'repaid', fitText: true, label: t('repaid'), type: 'text' },
      { key: 'outstanding', fitText: true, label: t('outstanding'), type: 'text' },
      { key: 'mode', ellipsis: true, label: t('payMode'), type: 'text' },
      { key: 'bank', ellipsis: true, label: t('bankName'), type: 'text' },
      { key: 'instrumentNo', ellipsis: true, label: t('instrumentNo'), type: 'text' },
      { key: 'remarks', ellipsis: true, label: t('remarks'), type: 'text' },
      { key: 'action', label: t('columnAction'), type: 'action' }
    ];
    this.service.associates().subscribe({ next: a => (this.associates = a), error: () => (this.loadError = true) });
    this.load();
  }

  openAdd(): void {
    this.formError = null;
    this.form.reset(this.defaults);
    this.picked = null;
    this.previousDues = 0;
    this.addOpen = true;
  }

  // Ignored while a save is in flight, so the popup cannot be dismissed mid-request.
  closeAdd(): void {
    if (this.saving) {
      return;
    }
    this.addOpen = false;
    this.formError = null;
    this.form.reset(this.defaults);
    this.picked = null;
    this.previousDues = 0;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.addOpen) {
      this.closeAdd();
    } else if (this.detailOpen) {
      this.closeDetail();
    }
  }

  fit(amount: number) {
    return fitSize(amount.toFixed(2));
  }

  openDetail(loan: LoanRow): void {
    this.detailOpen = true;
    this.detail = null;
    this.detailError = null;
    this.detailLoading = true;
    this.detailLoanId = loan.id;
    this.service.loanDetail(loan.id).subscribe({
      next: d => {
        if (this.detailLoanId === loan.id) {
          this.detail = d;
          this.detailLoading = false;
        }
      },
      error: (err: HttpErrorResponse) => {
        if (this.detailLoanId === loan.id) {
          this.detailLoading = false;
          this.detailError = (err.error as { error?: string } | null)?.error ?? this.translate.instant('admin.invoiceLoans.detailError');
        }
      }
    });
  }

  closeDetail(): void {
    this.detailOpen = false;
    this.detailLoanId = null;
  }

  label(a: AssociateOption): string {
    return `${a.userId} — ${a.name}`;
  }

  pickAssociate(text: string): void {
    const match = this.associates.find(a => this.label(a) === text.trim());
    // A new pick supersedes any earlier message ("pick an associate", a failed save); a dues failure below sets its own.
    this.formError = null;
    this.picked = match ?? null;
    this.form.patchValue({ associateId: match?.id ?? '' });
    this.previousDues = 0;
    if (match) {
      this.service.dues(match.id).subscribe({
        next: d => {
          if (this.form.value.associateId === match.id) {
            this.previousDues = d.outstanding;
          }
        },
        error: () => (this.formError = this.translate.instant('admin.invoiceLoans.duesError'))
      });
    }
  }

  save(): void {
    if (this.saving) {
      return;
    }
    this.formError = null;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.formError = this.translate.instant(this.form.value.associateId ? 'admin.invoiceLoans.requiredError' : 'admin.invoiceLoans.pickAssociateError');
      return;
    }
    const v = this.form.getRawValue();
    const orNull = (s: string) => s.trim() || null;
    const body: LoanCreate = {
      associateId: v.associateId,
      loanDate: v.loanDate,
      amount: v.amount,
      payMode: v.payMode,
      bankName: orNull(v.bankName),
      instrumentNo: orNull(v.instrumentNo),
      remarks: orNull(v.remarks)
    };
    this.saving = true;
    this.service.createLoan(body).subscribe({
      next: () => {
        this.saving = false;
        this.addOpen = false;
        this.form.reset(this.defaults);
        this.picked = null;
        this.previousDues = 0;
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.saving = false;
        this.formError = (err.error as { error?: string } | null)?.error ?? this.translate.instant('admin.invoiceLoans.saveError');
      }
    });
  }

  openRepay(loan: LoanRow): void {
    this.repayLoan = loan;
    this.repayError = null;
    this.repayForm.reset(this.repayDefaults);
    this.repaySaving = false;
    this.repayOpen = true;
  }

  saveRepay(): void {
    if (!this.repayLoan || this.repaySaving) {
      return;
    }
    this.repayError = null;
    if (this.repayForm.invalid) {
      this.repayForm.markAllAsTouched();
      this.repayError = this.translate.instant('admin.invoiceLoans.requiredError');
      return;
    }
    const v = this.repayForm.getRawValue();
    const orNull = (s: string) => s.trim() || null;
    this.repaySaving = true;
    this.service.repay(this.repayLoan.id, {
      paymentDate: v.paymentDate,
      amount: v.amount,
      payMode: v.payMode,
      bankName: orNull(v.bankName),
      txnNo: orNull(v.txnNo)
    }).subscribe({
      next: () => {
        this.repaySaving = false;
        this.repayOpen = false;
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.repaySaving = false;
        this.repayError = (err.error as { error?: string } | null)?.error ?? this.translate.instant('admin.invoiceLoans.saveError');
      }
    });
  }

  private load(): void {
    this.loadError = false;
    this.service.loans({}).subscribe({
      next: items => {
        this.items = items;
        this.rows = items.map((l, i) => ({
          sNo: String(i + 1),
          date: l.loanDate,
          userId: l.associateUserId,
          name: l.associateName,
          amount: l.amount.toFixed(2),
          previousDues: l.previousDues.toFixed(2),
          repaid: l.repaid.toFixed(2),
          outstanding: l.outstanding.toFixed(2),
          mode: this.translate.instant(`admin.invoiceLoans.payModes.${l.payMode}`),
          bank: l.bankName ?? '',
          instrumentNo: l.instrumentNo ?? '',
          remarks: l.remarks ?? '',
          action: ''
        }));
      },
      error: () => (this.loadError = true)
    });
  }
}
