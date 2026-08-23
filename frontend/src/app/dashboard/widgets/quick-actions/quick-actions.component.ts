import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

// Rendered as <span>, not <button>/<a>: these two actions have no associate-facing backend
// route (dashboard-mockup spec §1/§2, matching the 2026-08-17 spec's identical resolution) --
// a real button/link would imply an interaction that doesn't exist.
@Component({
  selector: 'app-quick-actions',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="quick-actions">
      <span class="quick-actions__button quick-actions__button--primary">{{ 'dashboard.recordSaleAction' | translate }}</span>
      <span class="quick-actions__button quick-actions__button--secondary">{{ 'dashboard.provisionAssociateAction' | translate }}</span>
      <p class="quick-actions__hint">{{ 'dashboard.quickActionsContactAdmin' | translate }}</p>
    </div>
  `
})
export class QuickActionsComponent {}
