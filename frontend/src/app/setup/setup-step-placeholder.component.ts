import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

// Shared by all 8 setup-step routes until each step's own phase (4-11) lands and replaces
// this route's `component:` with the real step component. Reading stepKey off route data
// avoids scaffolding eight near-identical throwaway files.
@Component({
  selector: 'app-setup-step-placeholder',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="setup-step-placeholder">
      <h1>{{ 'setup.steps.' + stepKey | translate }}</h1>
      <p>{{ 'setup.stepPlaceholder.comingSoon' | translate }}</p>
    </div>
  `
})
export class SetupStepPlaceholderComponent {
  private route = inject(ActivatedRoute);
  stepKey: string = this.route.snapshot.data['stepKey'];
}
