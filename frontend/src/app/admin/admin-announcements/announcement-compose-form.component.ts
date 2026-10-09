import { Component, ElementRef, EventEmitter, Output, ViewChild, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { FieldErrorComponent } from '../../shared/components/field-error/field-error.component';
import { ANNOUNCEMENT_TITLE_MAX, Announcement } from '../../announcements/announcement.model';
import { AnnouncementService } from '../../announcements/announcement.service';
import { DraftErrors, classifyPublishError, publishPayload, validateDraft } from './admin-announcements.util';

@Component({
  selector: 'app-announcement-compose-form',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  host: { class: 'announcement-composer__form-host' },
  styleUrls: ['./announcement-compose-form.component.scss'],
  imports: [CommonModule, TranslateModule, InlineBannerComponent, FieldErrorComponent],
  template: `
    <aside class="announcement-composer__seal" aria-labelledby="announcement-composer-seal-h">
      <h2 id="announcement-composer-seal-h">{{ 'announcements.composer.form.heading' | translate }}</h2>
      <app-inline-banner tone="warning">
        <p><strong>{{ 'announcements.composer.form.warnTitle' | translate }}</strong> {{ 'announcements.composer.form.warnBody' | translate }}</p>
      </app-inline-banner>
      <form class="announcement-composer__form" (submit)="submit(); $event.preventDefault()" novalidate>
        <div class="announcement-composer__field">
          <div class="announcement-composer__label-row">
            <label for="announcement-composer-title">{{ 'announcements.composer.form.title' | translate }} <span class="announcement-composer__req" aria-hidden="true">*</span></label>
            <span id="announcement-composer-title-counter" class="announcement-composer__counter" [class.announcement-composer__counter--over]="over > 0">{{ title.length }} / {{ max }}</span>
          </div>
          <input #titleInput type="text" id="announcement-composer-title" autocomplete="off" aria-describedby="announcement-composer-title-counter announcement-composer-title-error"
            [readOnly]="busy" [value]="title" (input)="onTitle($any($event.target).value)"
            [class.announcement-composer__invalid]="titleInvalid" [attr.aria-invalid]="titleInvalid ? 'true' : null" />
          <div id="announcement-composer-title-error" role="alert">
            <app-field-error [message]="titleKey ? (titleKey | translate: { over: errors?.over }) : serverFields?.title"></app-field-error>
          </div>
        </div>
        <div class="announcement-composer__field">
          <label for="announcement-composer-body">
            <span>{{ 'announcements.composer.form.body' | translate }} <span class="announcement-composer__req" aria-hidden="true">*</span></span>
          </label>
          <textarea #bodyInput id="announcement-composer-body" rows="7" aria-describedby="announcement-composer-body-error"
            [placeholder]="'announcements.composer.form.bodyPlaceholder' | translate"
            [readOnly]="busy" [value]="body" (input)="onBody($any($event.target).value)"
            [class.announcement-composer__invalid]="bodyInvalid" [attr.aria-invalid]="bodyInvalid ? 'true' : null"></textarea>
          <div id="announcement-composer-body-error" role="alert">
            <app-field-error [message]="bodyKey ? (bodyKey | translate) : serverFields?.body"></app-field-error>
          </div>
        </div>
        <app-inline-banner *ngIf="publishFailed" tone="danger">
          <span class="announcement-composer__failed" role="alert">{{ 'announcements.composer.err.publish' | translate }}</span>
        </app-inline-banner>
        <div class="announcement-composer__actions">
          <button type="submit" class="brand-button announcement-composer__publish" [attr.aria-disabled]="busy ? 'true' : null" [attr.aria-busy]="busy">
            <span *ngIf="busy; else icon" class="announcement-composer__spin" aria-hidden="true"></span>
            <ng-template #icon><span class="material-symbols-outlined" aria-hidden="true">campaign</span></ng-template>
            <span>{{ (busy ? 'announcements.composer.form.publishing' : 'announcements.composer.form.publish') | translate }}</span>
          </button>
          <button type="button" class="brand-button brand-button--secondary announcement-composer__clear" [attr.aria-disabled]="busy ? 'true' : null" (click)="clear()">{{ 'announcements.composer.form.clear' | translate }}</button>
        </div>
      </form>
    </aside>
  `
})
export class AnnouncementComposeFormComponent {
  private service = inject(AnnouncementService);

  @Output() published = new EventEmitter<Announcement>();
  @Output() busyChange = new EventEmitter<boolean>();
  @ViewChild('titleInput') titleInput?: ElementRef<HTMLInputElement>;
  @ViewChild('bodyInput') bodyInput?: ElementRef<HTMLTextAreaElement>;

  readonly max = ANNOUNCEMENT_TITLE_MAX;
  title = '';
  body = '';
  tried = false;
  busy = false;
  publishFailed = false;
  serverFields: { title?: string; body?: string } | null = null;

  get over(): number { return Math.max(0, this.title.length - this.max); }
  // Client messages only appear after the first submit attempt; a server field message replaces them.
  get errors(): DraftErrors | null { return this.tried ? validateDraft(this.title, this.body) : null; }
  get titleKey(): string | null {
    const e = this.errors?.title;
    return e === 'required' ? 'announcements.composer.err.titleRequired' : e === 'tooLong' ? 'announcements.composer.err.titleTooLong' : null;
  }
  get bodyKey(): string | null { return this.errors?.body ? 'announcements.composer.err.bodyRequired' : null; }
  get titleInvalid(): boolean { return !!this.titleKey || !!this.serverFields?.title; }
  get bodyInvalid(): boolean { return !!this.bodyKey || !!this.serverFields?.body; }

  // Editing a field drops its server message (the text it complained about is gone).
  onTitle(v: string): void { this.title = v; if (this.serverFields?.title) { this.serverFields = { ...this.serverFields, title: undefined }; } }
  onBody(v: string): void { this.body = v; if (this.serverFields?.body) { this.serverFields = { ...this.serverFields, body: undefined }; } }

  submit(): void {
    if (this.busy) { return; }
    this.tried = true;
    this.publishFailed = false;
    this.serverFields = null;
    const invalid = validateDraft(this.title, this.body);
    if (invalid) {
      (invalid.title ? this.titleInput : this.bodyInput)?.nativeElement.focus();
      return;
    }
    this.setBusy(true);
    this.service.publish(publishPayload(this.title, this.body)).subscribe({
      next: created => {
        this.setBusy(false);
        this.reset();
        this.published.emit(created);
        this.titleInput?.nativeElement.focus();
      },
      error: (err: HttpErrorResponse) => {
        this.setBusy(false);
        const c = classifyPublishError(err);
        if (c.kind === 'validation' && (c.fields?.title || c.fields?.body)) { this.serverFields = c.fields!; } else { this.publishFailed = true; }
      }
    });
  }

  clear(): void {
    if (this.busy) { return; }
    this.reset();
    this.titleInput?.nativeElement.focus();
  }

  private reset(): void {
    this.title = ''; this.body = ''; this.tried = false; this.publishFailed = false; this.serverFields = null;
  }

  private setBusy(v: boolean): void { this.busy = v; this.busyChange.emit(v); }
}
