import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AuditLogService } from './audit-log.service';
import { AuditLogEntry, AuditLogPage } from './audit-log.model';
import { SECTION_PATHS } from '../models/settings-section.model';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-audit-log',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="audit-log card">
      <h1 class="card-title">{{ 'settings.sections.auditLog' | translate }}</h1>

      <label class="audit-log__filter">
        {{ 'settings.auditLog.sectionFilterLabel' | translate }}
        <select class="audit-log__filter-select" (change)="onSectionChange($any($event.target).value)">
          <option value="">{{ 'settings.auditLog.allSectionsOption' | translate }}</option>
          <option *ngFor="let key of sectionKeys" [value]="key">{{ 'settings.sections.' + key | translate }}</option>
        </select>
      </label>

      <ul class="audit-log__list">
        <li class="audit-log__row" *ngFor="let entry of entries">
          <span class="audit-log__avatar">{{ initials(entry) }}</span>
          <div class="audit-log__row-body">
            <span class="audit-log__actor">{{ actorLabel(entry) }}</span>
            <span class="audit-log__summary">{{ entry.summary }}</span>
            <span class="audit-log__timestamp">{{ entry.changedAt | date: 'medium' }}</span>
          </div>
        </li>
      </ul>

      <div class="audit-log__pagination" *ngIf="page">
        <button type="button" [disabled]="page.page === 0" (click)="goToPage(page.page - 1)">
          {{ 'settings.auditLog.previousPageAction' | translate }}
        </button>
        <button
          type="button"
          [disabled]="(page.page + 1) * page.size >= page.totalElements"
          (click)="goToPage(page.page + 1)"
        >
          {{ 'settings.auditLog.nextPageAction' | translate }}
        </button>
      </div>
    </div>
  `
})
export class AuditLogComponent implements OnInit {
  private auditLogService = inject(AuditLogService);
  private translate = inject(TranslateService);

  readonly sectionKeys = Object.keys(SECTION_PATHS);

  selectedSection: string | null = null;
  page: AuditLogPage | null = null;

  get entries(): AuditLogEntry[] {
    return this.page?.entries ?? [];
  }

  ngOnInit(): void {
    this.loadPage(0);
  }

  onSectionChange(value: string): void {
    this.selectedSection = value === '' ? null : value;
    this.loadPage(0);
  }

  goToPage(page: number): void {
    this.loadPage(page);
  }

  actorLabel(entry: AuditLogEntry): string {
    if (entry.changedByAssociateId === null) {
      return this.translate.instant('settings.auditLog.systemActor');
    }
    return entry.changedByName ?? '';
  }

  // Derives the avatar glyph from whatever actor label ends up displayed -- the associate's
  // name, or the translated system-actor fallback -- so the avatar and the label never disagree.
  initials(entry: AuditLogEntry): string {
    const name = this.actorLabel(entry);
    if (!name) {
      return '';
    }
    return name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0].toUpperCase())
      .join('');
  }

  private loadPage(page: number): void {
    this.auditLogService.list(this.selectedSection, page, PAGE_SIZE).subscribe(res => (this.page = res));
  }
}
