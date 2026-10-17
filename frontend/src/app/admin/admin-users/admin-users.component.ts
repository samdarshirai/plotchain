import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AdminUser, AdminUsersService } from './admin-users.service';
import { toFieldErrors } from '../../core/api/field-errors.model';
import { BadgeTone, EditableTableColumn, EditableTableComponent } from '../../shared/components/editable-table/editable-table.component';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { FieldErrorComponent } from '../../shared/components/field-error/field-error.component';
import { titleCase } from '../../shared/utils/title-case';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, EditableTableComponent, InlineBannerComponent, FieldErrorComponent],
  providers: [DatePipe],
  template: `
    <div class="admin-users">
      <div class="admin-users__intro">
        <div class="admin-users__intro-copy">
          <h1 class="admin-users__title">{{ 'admin.adminUsers.title' | translate }}</h1>
          <p class="admin-users__subtitle">{{ 'admin.adminUsers.subtitle' | translate }}</p>
        </div>
        <button type="button" class="admin-users__add brand-button" (click)="openModal(null)">
          {{ 'admin.adminUsers.addAction' | translate }}
        </button>
      </div>

      <app-inline-banner *ngIf="loadError" tone="danger" [dismissible]="true" (dismissed)="loadError = false">{{ 'admin.adminUsers.loadError' | translate }}</app-inline-banner>
      <app-inline-banner *ngIf="actionError" tone="danger" [dismissible]="true" (dismissed)="actionError = null">{{ actionError }}</app-inline-banner>
      <app-inline-banner *ngIf="tempPassword" tone="success" [dismissible]="true" class="admin-users__temp-password" (dismissed)="tempPassword = null">
        {{ 'admin.adminUsers.tempPasswordNotice' | translate: { userId: tempPassword.userId } }}
        <strong class="admin-users__temp-password-value">{{ tempPassword.value }}</strong>
      </app-inline-banner>

      <div class="card">
        <app-editable-table
          [readOnly]="true"
          [columns]="columns"
          [rows]="rows"
          [actionTemplate]="actionsTpl"
          [emptyStateLabel]="'admin.adminUsers.emptyState' | translate"
        ></app-editable-table>
      </div>
      <ng-template #actionsTpl let-i="index">
        <div class="admin-users__actions">
          <button type="button" class="admin-users__edit brand-button brand-button--secondary" (click)="openModal(users[i])">
            {{ 'admin.adminUsers.editAction' | translate }}
          </button>
          <button type="button" class="admin-users__reset brand-button brand-button--secondary" (click)="openReset(users[i])">
            {{ 'admin.adminUsers.resetPasswordAction' | translate }}
          </button>
          <button type="button" class="admin-users__delete brand-button brand-button--danger" (click)="remove(users[i])">
            {{ 'admin.adminUsers.deleteAction' | translate }}
          </button>
        </div>
      </ng-template>
    </div>

    <div class="admin-users__modal-overlay admin-users__reset-modal" *ngIf="resetTarget">
      <div class="admin-users__modal">
        <div class="admin-users__modal-title">{{ 'admin.adminUsers.resetPasswordAction' | translate }}</div>
        <app-inline-banner *ngIf="resetError" tone="danger">{{ resetError }}</app-inline-banner>
        <ng-container *ngIf="!resetResult; else resetDone">
          <p class="admin-users__modal-text">{{ 'admin.adminUsers.resetPasswordConfirm' | translate: { userId: resetTarget.userId } }}</p>
          <div class="admin-users__modal-footer">
            <button type="button" class="admin-users__modal-cancel" (click)="closeReset()">{{ 'admin.adminUsers.cancelAction' | translate }}</button>
            <button type="button" class="admin-users__modal-submit admin-users__reset-confirm" (click)="confirmReset()">{{ 'admin.adminUsers.resetPasswordAction' | translate }}</button>
          </div>
        </ng-container>
        <ng-template #resetDone>
          <p class="admin-users__modal-text">{{ 'admin.adminUsers.resetPasswordNotice' | translate: { userId: resetTarget.userId } }}</p>
          <strong class="admin-users__temp-password-value admin-users__reset-result">{{ resetResult }}</strong>
          <div class="admin-users__modal-footer">
            <button type="button" class="admin-users__modal-submit" (click)="closeReset()">{{ 'admin.adminUsers.closeAction' | translate }}</button>
          </div>
        </ng-template>
      </div>
    </div>

    <div class="admin-users__modal-overlay" *ngIf="modalOpen">
      <div class="admin-users__modal">
        <div class="admin-users__modal-title">
          {{ (editing ? 'admin.adminUsers.editTitle' : 'admin.adminUsers.addTitle') | translate }}
        </div>
        <app-inline-banner *ngIf="formError" tone="danger">{{ formError }}</app-inline-banner>
        <form [formGroup]="form" (ngSubmit)="save()">
          <div class="admin-users__modal-fields">
            <div class="admin-users__modal-field">
              <label>{{ 'admin.adminUsers.userId' | translate }}</label>
              <input type="text" formControlName="userId" [readonly]="!!editing" />
              <app-field-error [message]="fieldError('userId')"></app-field-error>
            </div>
            <div class="admin-users__modal-field">
              <label>{{ 'admin.adminUsers.operatorName' | translate }}</label>
              <input type="text" formControlName="name" />
              <app-field-error [message]="fieldError('name')"></app-field-error>
            </div>
            <div class="admin-users__modal-field">
              <label>{{ 'admin.adminUsers.mobileNo' | translate }}</label>
              <input type="tel" formControlName="phone" />
              <app-field-error [message]="fieldError('phone')"></app-field-error>
            </div>
            <div class="admin-users__modal-field">
              <label>{{ 'admin.adminUsers.email' | translate }}</label>
              <input type="email" formControlName="email" />
              <app-field-error [message]="fieldError('email')"></app-field-error>
            </div>
            <div class="admin-users__modal-field">
              <label>{{ 'admin.adminUsers.status' | translate }}</label>
              <select formControlName="status">
                <option value="ACTIVE">{{ 'admin.adminUsers.statusActive' | translate }}</option>
                <option value="SUSPENDED">{{ 'admin.adminUsers.statusSuspended' | translate }}</option>
              </select>
            </div>
          </div>
          <div class="admin-users__modal-footer">
            <button type="button" class="admin-users__modal-cancel" (click)="modalOpen = false">{{ 'admin.adminUsers.cancelAction' | translate }}</button>
            <button type="submit" class="admin-users__modal-submit">{{ 'admin.adminUsers.saveAction' | translate }}</button>
          </div>
        </form>
      </div>
    </div>
  `
})
export class AdminUsersComponent implements OnInit {
  private service = inject(AdminUsersService);
  private translate = inject(TranslateService);
  private datePipe = inject(DatePipe);
  private fb = inject(FormBuilder);

  users: AdminUser[] = [];
  columns: EditableTableColumn[] = [];
  rows: Record<string, string>[] = [];
  loadError = false;
  actionError: string | null = null;
  tempPassword: { userId: string; value: string } | null = null;

  resetTarget: AdminUser | null = null;
  resetResult: string | null = null;
  resetError: string | null = null;

  modalOpen = false;
  editing: AdminUser | null = null;
  formError: string | null = null;
  private serverFieldErrors: Record<string, string> = {};
  form = this.fb.nonNullable.group({
    userId: ['', Validators.required],
    name: ['', Validators.required],
    phone: ['', Validators.required],
    email: ['', Validators.email],
    status: ['ACTIVE' as 'ACTIVE' | 'SUSPENDED']
  });

  ngOnInit(): void {
    const t = (key: string) => this.translate.instant(`admin.adminUsers.${key}`);
    this.columns = [
      { key: 'sNo', label: t('columnSNo'), type: 'text' },
      { key: 'userId', label: t('userId'), type: 'text' },
      { key: 'name', label: t('operatorName'), type: 'text' },
      { key: 'phone', label: t('mobileNo'), type: 'text' },
      { key: 'email', label: t('email'), type: 'text' },
      { key: 'lastLogin', label: t('lastLogin'), type: 'text' },
      { key: 'status', label: t('status'), type: 'badge', badgeTone: v => (v === 'Active' ? 'success' : 'danger') as BadgeTone },
      { key: 'actions', label: t('columnDetails'), type: 'action' }
    ];
    this.load();
  }

  openModal(user: AdminUser | null): void {
    this.editing = user;
    this.serverFieldErrors = {};
    this.formError = null;
    this.form.reset({
      userId: user?.userId ?? '',
      name: user?.name ?? '',
      phone: user?.phone ?? '',
      email: user?.email ?? '',
      status: user?.status ?? 'ACTIVE'
    });
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
    return this.translate.instant(control.errors['required'] ? 'admin.adminUsers.requiredError' : 'admin.adminUsers.invalidError');
  }

  save(): void {
    this.serverFieldErrors = {};
    this.formError = null;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const request = { ...raw, email: raw.email.trim() || null };
    const call = this.editing ? this.service.update(this.editing.id, request) : this.service.create(request);
    call.subscribe({
      next: saved => {
        this.modalOpen = false;
        this.tempPassword = saved.temporaryPassword ? { userId: saved.userId, value: saved.temporaryPassword } : null;
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        const fields = toFieldErrors(err);
        if (Object.keys(fields).length > 0) {
          this.serverFieldErrors = fields;
          return;
        }
        this.formError = (err.error as { error?: string } | null)?.error ?? this.translate.instant('admin.adminUsers.saveError');
      }
    });
  }

  openReset(user: AdminUser): void {
    this.resetTarget = user;
    this.resetResult = null;
    this.resetError = null;
  }

  closeReset(): void {
    this.resetTarget = null;
    this.resetResult = null;
  }

  confirmReset(): void {
    if (!this.resetTarget) {
      return;
    }
    this.resetError = null;
    this.service.resetPassword(this.resetTarget.id).subscribe({
      next: saved => (this.resetResult = saved.temporaryPassword ?? ''),
      error: (err: HttpErrorResponse) =>
        (this.resetError = (err.error as { error?: string } | null)?.error ?? this.translate.instant('admin.adminUsers.resetPasswordError'))
    });
  }

  remove(user: AdminUser): void {
    if (!window.confirm(this.translate.instant('admin.adminUsers.deleteConfirm', { userId: user.userId }))) {
      return;
    }
    this.actionError = null;
    this.service.delete(user.id).subscribe({
      next: () => this.load(),
      error: (err: HttpErrorResponse) =>
        (this.actionError = (err.error as { error?: string } | null)?.error ?? this.translate.instant('admin.adminUsers.deleteError'))
    });
  }

  private load(): void {
    this.loadError = false;
    this.service.list().subscribe({
      next: users => {
        this.users = users;
        this.rows = users.map((u, i) => ({
          sNo: String(i + 1),
          userId: u.userId,
          name: u.name,
          phone: u.phone,
          email: u.email ?? '—',
          lastLogin: u.lastLoginAt ? (this.datePipe.transform(u.lastLoginAt, 'medium') ?? u.lastLoginAt) : '—',
          status: titleCase(u.status)
        }));
      },
      error: () => (this.loadError = true)
    });
  }
}
