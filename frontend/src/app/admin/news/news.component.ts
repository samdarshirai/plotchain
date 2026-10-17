import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { NewsService } from './news.service';
import { toFieldErrors } from '../../core/api/field-errors.model';
import { EditableTableColumn, EditableTableComponent } from '../../shared/components/editable-table/editable-table.component';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { FieldErrorComponent } from '../../shared/components/field-error/field-error.component';

@Component({
  selector: 'app-news',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, EditableTableComponent, InlineBannerComponent, FieldErrorComponent],
  template: `
    <div class="news">
      <div class="news__intro">
        <div class="news__intro-copy">
          <span class="news__eyebrow">{{ 'admin.news.eyebrow' | translate }}</span>
          <h1 class="news__title">{{ 'admin.news.title' | translate }}</h1>
          <p class="news__subtitle">{{ 'admin.news.subtitle' | translate }}</p>
        </div>
        <button type="button" class="news__add brand-button" (click)="openModal()">
          {{ 'admin.news.addAction' | translate }}
        </button>
      </div>

      <app-inline-banner *ngIf="loadError" tone="danger" [dismissible]="true" (dismissed)="loadError = false">{{ 'admin.news.loadError' | translate }}</app-inline-banner>

      <div class="card">
        <app-editable-table
          [readOnly]="true"
          [columns]="columns"
          [rows]="rows"
          [emptyStateLabel]="'admin.news.emptyState' | translate"
        ></app-editable-table>
      </div>
    </div>

    <div class="news__modal-overlay" *ngIf="modalOpen">
      <div class="news__modal">
        <div class="news__modal-title">{{ 'admin.news.addTitle' | translate }}</div>
        <app-inline-banner *ngIf="formError" tone="danger">{{ formError }}</app-inline-banner>
        <form [formGroup]="form" (ngSubmit)="save()">
          <div class="news__modal-fields">
            <div class="news__modal-field">
              <label>{{ 'admin.news.date' | translate }}</label>
              <input type="date" formControlName="newsDate" />
              <app-field-error [message]="fieldError('newsDate')"></app-field-error>
            </div>
            <div class="news__modal-field">
              <label>{{ 'admin.news.newsTitle' | translate }}</label>
              <input type="text" maxlength="200" formControlName="title" />
              <app-field-error [message]="fieldError('title')"></app-field-error>
            </div>
            <div class="news__modal-field">
              <label>{{ 'admin.news.body' | translate }}</label>
              <textarea rows="6" maxlength="5000" formControlName="body"></textarea>
              <app-field-error [message]="fieldError('body')"></app-field-error>
            </div>
          </div>
          <div class="news__modal-footer">
            <button type="button" class="news__modal-cancel" (click)="modalOpen = false">{{ 'admin.news.cancelAction' | translate }}</button>
            <button type="submit" class="news__modal-submit">{{ 'admin.news.saveAction' | translate }}</button>
          </div>
        </form>
      </div>
    </div>
  `
})
export class NewsComponent implements OnInit {
  private service = inject(NewsService);
  private translate = inject(TranslateService);
  private fb = inject(FormBuilder);

  columns: EditableTableColumn[] = [];
  rows: Record<string, string>[] = [];
  loadError = false;
  modalOpen = false;
  formError: string | null = null;
  private serverFieldErrors: Record<string, string> = {};
  form = this.fb.nonNullable.group({
    newsDate: ['', Validators.required],
    title: ['', Validators.required],
    body: ['', Validators.required]
  });

  ngOnInit(): void {
    const t = (key: string) => this.translate.instant(`admin.news.${key}`);
    this.columns = [
      { key: 'sNo', label: t('columnSNo'), type: 'text' },
      { key: 'date', label: t('date'), type: 'text' },
      { key: 'title', label: t('newsTitle'), type: 'text' },
      { key: 'body', label: t('body'), type: 'text' }
    ];
    this.load();
  }

  openModal(): void {
    this.serverFieldErrors = {};
    this.formError = null;
    this.form.reset({ newsDate: new Date().toISOString().slice(0, 10), title: '', body: '' });
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
    return this.translate.instant('admin.news.requiredError');
  }

  save(): void {
    this.serverFieldErrors = {};
    this.formError = null;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.service.create(this.form.getRawValue()).subscribe({
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
        this.formError = (err.error as { error?: string } | null)?.error ?? this.translate.instant('admin.news.saveError');
      }
    });
  }

  private load(): void {
    this.loadError = false;
    this.service.list().subscribe({
      next: items => {
        this.rows = items.map((n, i) => ({
          sNo: String(i + 1),
          date: n.newsDate,
          title: n.title,
          body: n.body
        }));
      },
      error: () => (this.loadError = true)
    });
  }
}
