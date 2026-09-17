import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

// No record-sale/provision-associate buttons: those actions have no associate-facing backend
// route (dashboard-mockup spec §1/§2), and the current mockup drops them from the dashboard
// entirely in favor of a plain contact-admin sentence.
@Component({
  selector: 'app-quick-actions',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <p class="quick-actions__hint">{{ 'dashboard.quickActionsContactAdmin' | translate }}</p>
  `
})
export class QuickActionsComponent {}
