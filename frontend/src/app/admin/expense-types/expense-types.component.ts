import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ExpenseType, ExpenseTypeStatus, ExpenseTypesService } from './expense-types.service';
import { toFieldErrors } from '../../core/api/field-errors.model';
import { BadgeTone, EditableTableColumn, EditableTableComponent } from '../../shared/components/editable-table/editable-table.component';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { FieldErrorComponent } from '../../shared/components/field-error/field-error.component';
import { titleCase } from '../../shared/utils/title-case';

@Component({
  selector: 'app-expense-types',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, EditableTableComponent, InlineBannerComponent, FieldErrorComponent],
  template: `
    <div class="expense-types">
      <div class="expense-types__intro">
        <div class="expense-types__intro-copy">
          <span class="expense-types__eyebrow">{{ 'admin.expenseTypes.eyebrow' | translate }}</span>
          <h1 class="expense-types__title">{{ 'admin.expenseTypes.title' | translate }}</h1>
          <p class="expense-types__subtitle">{{ 'admin.expenseTypes.subtitle' | translate }}</p>
        </div>
        <button type="button" class="expense-types__add brand-button" (click)="openModal(null)">
          {{ 'admin.expenseTypes.addAction' | translate }}
        </button>
      </div>

      <app-inline-banner *ngIf="loadError" tone="danger" [dismissible]="true" (dismissed)="loadError = false">{{ 'admin.expenseTypes.loadError' | translate }}</app-inline-banner>

      <div class="card">
        <app-editable-table
          [readOnly]="true"
          [columns]="columns"
          [rows]="rows"
          [actionTemplate]="actionsTpl"
          [emptyStateLabel]="'admin.expenseTypes.emptyState' | translate"
        ></app-editable-table>
      </div>
      <ng-template #actionsTpl let-i="index">
        <div class="expense-types__actions">
          <button type="button" class="expense-types__edit brand-button brand-button--secondary" (click)="openModal(items[i])">
            {{ 'admin.expenseTypes.editAction' | translate }}
          </button>
        </div>
      </ng-template>
    </div>

    <div class="expense-types__modal-overlay" *ngIf="modalOpen">
      <div class="expense-types__modal">
        <div class="expense-types__modal-title">
          {{ (editing ? 'admin.expenseTypes.editTitle' : 'admin.expenseTypes.addTitle') | translate }}
        </div>
        <app-inline-banner *ngIf="formError" tone="danger">{{ formError }}</app-inline-banner>
        <form [formGroup]="form" (ngSubmit)="save()">
          <div class="expense-types__modal-fields">
            <div class="expense-types__modal-field">
              <label>{{ 'admin.expenseTypes.expenseType' | translate }}</label>
              <input type="text" formControlName="name" />
              <app-field-error [message]="fieldError('name')"></app-field-error>
            </div>
            <div class="expense-types__modal-field">
              <label>{{ 'admin.expenseTypes.status' | translate }}</label>
              <select formControlName="status">
                <option value="ACTIVE">{{ 'admin.expenseTypes.statusActive' | translate }}</option>
                <option value="INACTIVE">{{ 'admin.expenseTypes.statusInactive' | translate }}</option>
              </select>
            </div>
          </div>
          <div class="expense-types__modal-footer">
            <button type="button" class="expense-types__modal-cancel" (click)="modalOpen = false">{{ 'admin.expenseTypes.cancelAction' | translate }}</button>
            <button type="submit" class="expense-types__modal-submit">{{ 'admin.expenseTypes.saveAction' | translate }}</button>
          </div>
        </form>
      </div>
    </div>
  `
})
export class ExpenseTypesComponent implements OnInit {
  private service = inject(ExpenseTypesService);
  private translate = inject(TranslateService);
  private fb = inject(FormBuilder);

  items: ExpenseType[] = [];
  columns: EditableTableColumn[] = [];
  rows: Record<string, string>[] = [];
  loadError = false;

  modalOpen = false;
  editing: ExpenseType | null = null;
  formError: string | null = null;
  private serverFieldErrors: Record<string, string> = {};
  form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    status: ['ACTIVE' as ExpenseTypeStatus]
  });

  ngOnInit(): void {
    const t = (key: string) => this.translate.instant(`admin.expenseTypes.${key}`);
    this.columns = [
      { key: 'sNo', label: t('columnSNo'), type: 'text' },
      { key: 'name', label: t('expenseType'), type: 'text' },
      { key: 'status', label: t('status'), type: 'badge', badgeTone: v => (v === 'Active' ? 'success' : 'danger') as BadgeTone },
      { key: 'actions', label: t('columnAction'), type: 'action' }
    ];
    this.load();
  }

  openModal(item: ExpenseType | null): void {
    this.editing = item;
    this.serverFieldErrors = {};
    this.formError = null;
    this.form.reset({ name: item?.name ?? '', status: item?.status ?? 'ACTIVE' });
    this.modalOpen = true;
  }

  fieldError(name: string): string | undefined {
    if (this.serverFieldErrors[name]) {
      return this.serverFieldErrors[name];
    }
    const control = this.form.get(name);
    if (!control || !control.touched || !control.errors) {
      return undefined;
    }
    return this.translate.instant('admin.expenseTypes.requiredError');
  }

  save(): void {
    this.serverFieldErrors = {};
    this.formError = null;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const request = this.form.getRawValue();
    const call = this.editing ? this.service.update(this.editing.id, request) : this.service.create(request);
    call.subscribe({
      next: () => {
        this.modalOpen = false;
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        const fields = toFieldErrors(err);
        if (Object.keys(fields).length > 0) {
          this.serverFieldErrors = fields;
          return;
        }
        this.formError = (err.error as { error?: string } | null)?.error ?? this.translate.instant('admin.expenseTypes.saveError');
      }
    });
  }

  private load(): void {
    this.loadError = false;
    this.service.list().subscribe({
      next: items => {
        this.items = items;
        this.rows = items.map((e, i) => ({ sNo: String(i + 1), name: e.name, status: titleCase(e.status) }));
      },
      error: () => (this.loadError = true)
    });
  }
}
