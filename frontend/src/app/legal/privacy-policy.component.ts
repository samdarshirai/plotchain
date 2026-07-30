import { Component } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-privacy-policy',
  standalone: true,
  imports: [TranslateModule],
  template: `
    <div class="legal-page">
      <h1>{{ 'legal.privacy.title' | translate }}</h1>
      <p>{{ 'legal.privacy.body' | translate }}</p>
    </div>
  `
})
export class PrivacyPolicyComponent {}
