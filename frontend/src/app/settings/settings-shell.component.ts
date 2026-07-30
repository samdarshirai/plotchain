import { Component } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

// Minimal placeholder: the nav-plus-sections shell (Company Settings + Audit Log) is Phase 12's
// job. This exists now only so the reverse setup guard has somewhere to send a launched
// instance; Phase 12 extends this same file rather than creating it from scratch.
@Component({
  selector: 'app-settings-shell',
  standalone: true,
  imports: [TranslateModule],
  template: `
    <div class="settings-shell">
      <p>{{ 'settings.placeholder.comingSoon' | translate }}</p>
    </div>
  `
})
export class SettingsShellComponent {}
