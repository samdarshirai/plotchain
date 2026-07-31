import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { SetupInspectorService } from './setup-inspector.service';

// Renders whatever a routed step registered via SetupInspectorService (live template content,
// e.g. company-profile's Company Card preview), or a generic help card when no step has
// registered anything -- so the aside is never blank.
@Component({
  selector: 'app-setup-inspector-aside',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <aside class="setup-inspector-aside">
      <ng-container *ngIf="inspectorService.content$ | async as content; else fallback">
        <ng-container *ngTemplateOutlet="content"></ng-container>
      </ng-container>
      <ng-template #fallback>
        <div class="card setup-inspector-aside__help">
          <h4 class="card-title">{{ 'setup.inspectorDefaultTitle' | translate }}</h4>
          <p class="card-subtitle">{{ 'setup.inspectorDefaultBody' | translate }}</p>
        </div>
      </ng-template>
    </aside>
  `
})
export class SetupInspectorAsideComponent {
  protected inspectorService = inject(SetupInspectorService);
}
