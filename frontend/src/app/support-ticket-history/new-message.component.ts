import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { SupportTicketService } from '../support-tickets/support-ticket.service';
import { InlineBannerComponent } from '../shared/components/inline-banner/inline-banner.component';

@Component({
  selector: 'app-new-message',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, InlineBannerComponent],
  template: `
    <div class="new-message">
      <div class="new-message__intro">
        <h1 class="new-message__title">{{ 'supportTickets.new.title' | translate }}</h1>
        <p class="new-message__subtitle">{{ 'supportTickets.new.subtitle' | translate }}</p>
      </div>
      <app-inline-banner *ngIf="sendError" tone="danger">
        <span role="alert">{{ 'supportTickets.new.sendError' | translate }}</span>
      </app-inline-banner>
      <form class="card new-message__form" [formGroup]="form" (ngSubmit)="send()">
        <label>
          {{ 'supportTickets.new.subjectLabel' | translate }}
          <input type="text" formControlName="subject" maxlength="200" />
          <span class="new-message__error" *ngIf="showError('subject')">{{ 'supportTickets.new.required' | translate }}</span>
        </label>
        <label>
          {{ 'supportTickets.new.messageLabel' | translate }}
          <textarea rows="6" formControlName="description"></textarea>
          <span class="new-message__error" *ngIf="showError('description')">{{ 'supportTickets.new.required' | translate }}</span>
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

  showError(name: 'subject' | 'description'): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || c.dirty);
  }

  send(): void {
    this.form.markAllAsTouched();
    const { subject, description } = this.form.getRawValue();
    if (this.sending || !subject.trim() || !description.trim()) { return; }
    this.sending = true;
    this.sendError = false;
    this.service.createMine({ subject: subject.trim(), description: description.trim() }).subscribe({
      next: () => this.router.navigate(['/messages']),
      error: () => { this.sending = false; this.sendError = true; }
    });
  }
}
