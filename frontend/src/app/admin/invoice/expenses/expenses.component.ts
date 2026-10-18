import { Component, HostListener, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ExpenseType, ExpenseTypesService } from '../../expense-types/expense-types.service';
import { InvoiceService, PAY_MODES, PayMode, ProjectOption, ExpenseRow, ExpenseCreate } from '../invoice.service';
import { toFieldErrors } from '../../../core/api/field-errors.model';
import { EditableTableColumn, EditableTableComponent } from '../../../shared/components/editable-table/editable-table.component';
import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';

// Local calendar dates (not toISOString, which is UTC and can land a day early in the morning for UTC+ zones).
function localIsoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function last30Days(): { from: string; to: string } {
  const now = new Date();
  return { from: localIsoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29)), to: localIsoDate(now) };
}

@Component({
  selector: 'app-invoice-expenses',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, EditableTableComponent, InlineBannerComponent, FieldErrorComponent],
  template: `
    <div class="invoice-expenses">
      <div class="invoice-expenses__intro">
        <div class="invoice-expenses__intro-copy">
          <span class="invoice-expenses__eyebrow">{{ 'admin.invoiceExpenses.eyebrow' | translate }}</span>
          <h1 class="invoice-expenses__title">{{ 'admin.invoiceExpenses.title' | translate }}</h1>
          <p class="invoice-expenses__subtitle">{{ 'admin.invoiceExpenses.subtitle' | translate }}</p>
        </div>
        <button type="button" class="invoice-expenses__add brand-button" (click)="openModal()">
          {{ 'admin.invoiceExpenses.addAction' | translate }}
        </button>
      </div>

      <app-inline-banner *ngIf="loadError" tone="danger" [dismissible]="true" (dismissed)="loadError = false">{{ 'admin.invoiceExpenses.loadError' | translate }}</app-inline-banner>
      <form class="card invoice-expenses__filters" [formGroup]="filters">
        <div class="invoice-expenses__field">
          <label>{{ 'admin.invoiceExpenses.filterFrom' | translate }}</label>
          <input type="date" formControlName="from" />
        </div>
        <div class="invoice-expenses__field">
          <label>{{ 'admin.invoiceExpenses.filterTo' | translate }}</label>
          <input type="date" formControlName="to" />
        </div>
        <div class="invoice-expenses__field">
          <label>{{ 'admin.invoiceExpenses.expenseType' | translate }}</label>
          <select formControlName="typeId">
            <option value="">{{ 'admin.invoiceExpenses.allTypes' | translate }}</option>
            <option *ngFor="let t of allTypes" [value]="t.id">{{ t.name }}</option>
          </select>
        </div>
        <div class="invoice-expenses__field">
          <label>{{ 'admin.invoiceExpenses.project' | translate }}</label>
          <select formControlName="projectId">
            <option value="">{{ 'admin.invoiceExpenses.allProjects' | translate }}</option>
            <option *ngFor="let p of projects" [value]="p.id">{{ p.name }}</option>
          </select>
        </div>
      </form>

      <div class="card">
        <app-editable-table
          [readOnly]="true"
          [columns]="columns"
          [rows]="rows"
          [emptyStateLabel]="'admin.invoiceExpenses.emptyState' | translate"
        ></app-editable-table>
      </div>
    </div>
    <div class="invoice-expenses__modal-overlay" *ngIf="modalOpen">
      <div class="invoice-expenses__modal" role="dialog" aria-modal="true" aria-labelledby="invoice-expenses-modal-title">
        <div class="invoice-expenses__modal-title" id="invoice-expenses-modal-title">{{ 'admin.invoiceExpenses.addTitle' | translate }}</div>
        <app-inline-banner *ngIf="formError" tone="danger">{{ formError }}</app-inline-banner>
        <form [formGroup]="form" (ngSubmit)="save()">
          <div class="invoice-expenses__modal-fields">
            <div class="invoice-expenses__field invoice-expenses__modal-field">
              <label>{{ 'admin.invoiceExpenses.expenseDate' | translate }}</label>
              <input type="date" formControlName="expenseDate" />
              <app-field-error [message]="fieldError('expenseDate')"></app-field-error>
            </div>
            <div class="invoice-expenses__field invoice-expenses__modal-field">
              <label>{{ 'admin.invoiceExpenses.expenseType' | translate }}</label>
              <select formControlName="expenseTypeId">
                <option value=""></option>
                <option *ngFor="let t of activeTypes" [value]="t.id">{{ t.name }}</option>
              </select>
              <app-field-error [message]="fieldError('expenseTypeId')"></app-field-error>
            </div>
            <div class="invoice-expenses__field invoice-expenses__modal-field">
              <label>{{ 'admin.invoiceExpenses.project' | translate }}</label>
              <select formControlName="projectId">
                <option value=""></option>
                <option *ngFor="let p of projects" [value]="p.id">{{ p.name }}</option>
              </select>
            </div>
            <div class="invoice-expenses__field invoice-expenses__modal-field">
              <label>{{ 'admin.invoiceExpenses.payTo' | translate }}</label>
              <input type="text" formControlName="payTo" />
              <app-field-error [message]="fieldError('payTo')"></app-field-error>
            </div>
            <div class="invoice-expenses__field invoice-expenses__modal-field">
              <label>{{ 'admin.invoiceExpenses.amount' | translate }}</label>
              <input type="number" step="0.01" min="0.01" inputmode="decimal" formControlName="amount" />
              <app-field-error [message]="fieldError('amount')"></app-field-error>
            </div>
            <div class="invoice-expenses__field invoice-expenses__modal-field">
              <label>{{ 'admin.invoiceExpenses.payMode' | translate }}</label>
              <select formControlName="payMode">
                <option *ngFor="let m of payModes" [value]="m">{{ 'admin.invoiceExpenses.payModes.' + m | translate }}</option>
              </select>
            </div>
            <div class="invoice-expenses__field invoice-expenses__modal-field">
              <label>{{ 'admin.invoiceExpenses.bankName' | translate }}</label>
              <input type="text" formControlName="bankName" />
            </div>
            <div class="invoice-expenses__field invoice-expenses__modal-field">
              <label>{{ 'admin.invoiceExpenses.txnNo' | translate }}</label>
              <input type="text" formControlName="txnNo" />
            </div>
            <div class="invoice-expenses__field invoice-expenses__field--wide invoice-expenses__modal-field">
              <label>{{ 'admin.invoiceExpenses.remarks' | translate }}</label>
              <textarea rows="2" formControlName="remarks"></textarea>
            </div>
          </div>
          <div class="invoice-expenses__modal-footer">
            <button type="button" class="invoice-expenses__modal-cancel" (click)="closeModal()">{{ 'admin.invoiceExpenses.cancelAction' | translate }}</button>
            <button type="submit" class="invoice-expenses__modal-submit" [disabled]="saving">{{ 'admin.invoiceExpenses.saveAction' | translate }}</button>
          </div>
        </form>
      </div>
    </div>
  `
})
export class ExpensesComponent implements OnInit {
  private service = inject(InvoiceService);
  private typesService = inject(ExpenseTypesService);
  private translate = inject(TranslateService);
  private fb = inject(FormBuilder);

  readonly payModes = PAY_MODES;
  allTypes: ExpenseType[] = [];
  activeTypes: ExpenseType[] = [];
  projects: ProjectOption[] = [];
  columns: EditableTableColumn[] = [];
  rows: Record<string, string>[] = [];
  loadError = false;
  formError: string | null = null;
  saving = false;
  modalOpen = false;
  private serverFieldErrors: Record<string, string> = {};

  private readonly defaults = { expenseDate: '', expenseTypeId: '', projectId: '', payTo: '', amount: 0, payMode: 'CASH' as PayMode, bankName: '', txnNo: '', remarks: '' };
  form = this.fb.nonNullable.group({
    expenseDate: ['', Validators.required],
    expenseTypeId: ['', Validators.required],
    projectId: [''],
    payTo: ['', Validators.required],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    payMode: ['CASH' as PayMode, Validators.required],
    bankName: [''],
    txnNo: [''],
    remarks: ['']
  });
  private readonly defaultRange = last30Days();
  filters = this.fb.nonNullable.group({ from: [this.defaultRange.from], to: [this.defaultRange.to], typeId: [''], projectId: [''] });

  ngOnInit(): void {
    const t = (key: string) => this.translate.instant(`admin.invoiceExpenses.${key}`);
    this.columns = [
      { key: 'sNo', label: t('columnSNo'), type: 'text' },
      { key: 'date', label: t('expenseDate'), type: 'text' },
      { key: 'type', label: t('expenseType'), type: 'text' },
      { key: 'project', label: t('project'), type: 'text' },
      { key: 'payTo', label: t('payTo'), type: 'text' },
      { key: 'amount', label: t('amount'), type: 'text' },
      { key: 'mode', label: t('payMode'), type: 'text' },
      { key: 'bank', label: t('bankName'), type: 'text' },
      { key: 'txn', label: t('txnNo'), type: 'text' },
      { key: 'remarks', label: t('remarks'), type: 'text' }
    ];
    this.typesService.list().subscribe({
      next: types => {
        this.allTypes = types;
        this.activeTypes = types.filter(x => x.status === 'ACTIVE');
      },
      error: () => (this.loadError = true)
    });
    this.service.projects().subscribe({ next: p => (this.projects = p), error: () => (this.loadError = true) });
    this.filters.valueChanges.subscribe(() => this.load());
    this.load();
  }

  openModal(): void {
    this.serverFieldErrors = {};
    this.formError = null;
    this.form.reset(this.defaults);
    this.modalOpen = true;
  }

  // Ignored while a save is in flight, so the popup cannot be dismissed mid-request.
  closeModal(): void {
    if (this.saving) {
      return;
    }
    this.modalOpen = false;
    this.serverFieldErrors = {};
    this.formError = null;
    this.form.reset(this.defaults);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.modalOpen) {
      this.closeModal();
    }
  }

  fieldError(name: string): string | undefined {
    if (this.serverFieldErrors[name]) {
      return this.serverFieldErrors[name];
    }
    const control = this.form.get(name);
    if (!control || !control.touched || !control.errors) {
      return undefined;
    }
    return this.translate.instant('admin.invoiceExpenses.requiredError');
  }

  save(): void {
    if (this.saving) {
      return;
    }
    this.serverFieldErrors = {};
    this.formError = null;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const orNull = (s: string) => s.trim() || null;
    const body: ExpenseCreate = {
      expenseDate: v.expenseDate,
      expenseTypeId: v.expenseTypeId,
      projectId: orNull(v.projectId),
      payTo: v.payTo.trim(),
      amount: v.amount,
      payMode: v.payMode,
      bankName: orNull(v.bankName),
      txnNo: orNull(v.txnNo),
      remarks: orNull(v.remarks)
    };
    this.saving = true;
    this.service.createExpense(body).subscribe({
      next: () => {
        this.saving = false;
        this.modalOpen = false;
        this.form.reset(this.defaults);
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.saving = false;
        const fields = toFieldErrors(err);
        if (Object.keys(fields).length > 0) {
          this.serverFieldErrors = fields;
          return;
        }
        this.formError = (err.error as { error?: string } | null)?.error ?? this.translate.instant('admin.invoiceExpenses.saveError');
      }
    });
  }

  private load(): void {
    this.loadError = false;
    const f = this.filters.getRawValue();
    this.service.expenses({ from: f.from, to: f.to, typeId: f.typeId, projectId: f.projectId }).subscribe({
      next: items => (this.rows = items.map((e, i) => this.toRow(e, i))),
      error: () => (this.loadError = true)
    });
  }

  private toRow(e: ExpenseRow, i: number): Record<string, string> {
    return {
      sNo: String(i + 1),
      date: e.expenseDate,
      type: e.expenseTypeName,
      project: e.projectName ?? '',
      payTo: e.payTo,
      amount: e.amount.toFixed(2),
      mode: this.translate.instant(`admin.invoiceExpenses.payModes.${e.payMode}`),
      bank: e.bankName ?? '',
      txn: e.txnNo ?? '',
      remarks: e.remarks ?? ''
    };
  }
}
