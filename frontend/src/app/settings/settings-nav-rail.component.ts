import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { SECTION_PATHS } from './models/settings-section.model';

@Component({
  selector: 'app-settings-nav-rail',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslateModule],
  template: `
    <nav class="settings-nav-rail">
      <ol class="settings-nav-rail__items">
        <li
          *ngFor="let key of sectionKeys"
          class="settings-nav-rail__item"
          [class.settings-nav-rail__item--active]="key === activeSectionKey"
        >
          <a [routerLink]="['/settings', sectionPaths[key]]">{{ 'settings.sections.' + key | translate }}</a>
        </li>
        <li class="settings-nav-rail__item" [class.settings-nav-rail__item--active]="activeSectionKey === 'associateDirectory'">
          <a [routerLink]="['/settings', 'associate-directory']">{{ 'settings.sections.associateDirectory' | translate }}</a>
        </li>
        <li class="settings-nav-rail__item" [class.settings-nav-rail__item--active]="activeSectionKey === 'treeExplorer'">
          <a [routerLink]="['/settings', 'tree-explorer']">{{ 'settings.sections.treeExplorer' | translate }}</a>
        </li>
        <li class="settings-nav-rail__item" [class.settings-nav-rail__item--active]="activeSectionKey === 'kycQueue'">
          <a [routerLink]="['/settings', 'kyc-queue']">{{ 'settings.sections.kycQueue' | translate }}</a>
        </li>
        <li class="settings-nav-rail__item" [class.settings-nav-rail__item--active]="activeSectionKey === 'auditLog'">
          <a [routerLink]="['/settings', 'audit-log']">{{ 'settings.sections.auditLog' | translate }}</a>
        </li>
        <li class="settings-nav-rail__item" [class.settings-nav-rail__item--active]="activeSectionKey === 'adminStats'">
          <a [routerLink]="['/settings', 'admin-stats']">{{ 'settings.sections.adminStats' | translate }}</a>
        </li>
      </ol>
    </nav>
  `
})
export class SettingsNavRailComponent {
  @Input() activeSectionKey?: string;

  readonly sectionPaths = SECTION_PATHS;
  readonly sectionKeys = Object.keys(SECTION_PATHS);
}
