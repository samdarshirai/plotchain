import { Component, ViewEncapsulation } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-admin-support-tickets',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [TranslateModule],
  template: `
    <div class="support-tickets">
      <span class="support-tickets__eyebrow">{{ 'admin.supportTickets.eyebrow' | translate }}</span>
      <h1 class="support-tickets__title">{{ 'admin.supportTickets.title' | translate }}</h1>
    </div>
  `
})
export class AdminSupportTicketsComponent {}
