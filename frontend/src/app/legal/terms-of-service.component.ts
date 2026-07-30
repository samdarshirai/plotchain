import { Component } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-terms-of-service',
  standalone: true,
  imports: [TranslateModule],
  template: `
    <div class="legal-page">
      <h1>{{ 'legal.terms.title' | translate }}</h1>
      <p>{{ 'legal.terms.body' | translate }}</p>
    </div>
  `
})
export class TermsOfServiceComponent {}
