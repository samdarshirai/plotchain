import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { SupportTicketService } from '../support-tickets/support-ticket.service';
import { FieldErrorComponent } from '../shared/components/field-error/field-error.component';
import { ErrorSummaryComponent } from '../shared/components/error-summary/error-summary.component';
import { FormIssue, collectIssues } from '../shared/validation/validation';
import { InlineBannerComponent } from '../shared/components/inline-banner/inline-banner.component';

@Component({
  selector: 'app-new-message',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, InlineBannerComponent, FieldErrorComponent, ErrorSummaryComponent],
  template: `
    <div class="new-message">
      <div class="new-message__intro">
        <h1 class="new-message__title">{{ 'supportTickets.new.title' | translate }}</h1>
        <p class="new-message__subtitle">{{ 'supportTickets.new.subtitle' | translate }}</p>
      </div>
      <app-inline-banner *ngIf="sendError" tone="danger">
        <span role="alert">{{ 'supportTickets.new.sendError' | translate }}</span>
      </app-inline-banner>
      <form class="card new-message__form" [formGroup]="form" [class.was-submitted]="submitted" (ngSubmit)="send()" novalidate>
        <app-error-summary [issues]="issues"></app-error-summary>
        <label>
          {{ 'supportTickets.new.subjectLabel' | translate }}
          <input type="text" formControlName="subject" maxlength="200" />
          <app-field-error [control]="form.controls.subject" label="Subject" [submitted]="submitted"></app-field-error>
        </label>
        <label>
          {{ 'supportTickets.new.messageLabel' | translate }}
          <textarea rows="6" formControlName="description"></textarea>
          <app-field-error [control]="form.controls.description" label="Message" [submitted]="submitted"></app-field-error>
        </label>
        <button type="submit" class="brand-button new-message__send" [disabled]="sending">
          {{ (sending ? 'supportTickets.new.sending' : 'supportTickets.new.sendAction') | translate }}
        </button>
      </form>
    </div>
  `
})
export class NewMessageComponent {
  private service = inject(SupportTicketService);
  private router = inject(Router);
  private fb = inject(FormBuilder);

  form = this.fb.nonNullable.group({
    subject: ['', [Validators.required, Validators.maxLength(200)]],
    description: ['', Validators.required]
  });
  sending = false;
  sendError = false;

  submitted = false;
  issues: FormIssue[] = [];

  send(): void {
    this.submitted = true;
    this.form.markAllAsTouched();
    const { subject, description } = this.form.getRawValue();
    // Whitespace-only counts as empty.
    if (!subject.trim()) { this.form.controls.subject.setErrors({ required: true }); }
    if (!description.trim()) { this.form.controls.description.setErrors({ required: true }); }
    this.issues = collectIssues(this.form, { subject: 'Subject', description: 'Message' });
    if (this.sending || this.form.invalid) { return; }
    this.sending = true;
    this.sendError = false;
    this.service.createMine({ subject: subject.trim(), description: description.trim() }).subscribe({
      next: () => this.router.navigate(['/messages']),
      error: () => { this.sending = false; this.sendError = true; }
    });
  }
}
