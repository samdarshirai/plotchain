import { Component } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-quick-actions',
  standalone: true,
  imports: [TranslateModule],
  template: `
    <div class="quick-actions">
      <p class="quick-actions-empty">{{ 'dashboard.quickActionsContactAdmin' | translate }}</p>
    </div>
  `
})
export class QuickActionsComponent {}
