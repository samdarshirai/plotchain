import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AuditLogService } from './audit-log.service';
import { fetchAllPages } from '../../shared/utils/fetch-all-pages';
import { AUDIT_LOG_SECTION_BACKEND_VALUES, AuditLogEntry, AuditLogPage, SECTION_FILTER_OPTIONS } from './audit-log.model';

// Reverse of AUDIT_LOG_SECTION_BACKEND_VALUES (SCREAMING_SNAKE_CASE -> the camelCase key
// 'settings.sections.<key>' expects) -- covers the 5 real Settings sections, which is all that
// map has. Backend section values outside those 5 (KYC, ASSOCIATE, WITHDRAWAL, WALLET,
// ADMIN_TEAM, ROOT_ASSOCIATES -- see issues.md's M2 fix, which extended the audit log's allowed
// section values beyond the original 5) fall through to sectionLabel()'s humanized-string path
// below instead of a translated one.
const SECTION_BACKEND_TO_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(AUDIT_LOG_SECTION_BACKEND_VALUES).map(([key, backendValue]) => [backendValue, key])
);

@Component({
  selector: 'app-audit-log',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="audit-log">
      <h1 class="card-title">{{ 'settings.sections.auditLog' | translate }}</h1>

      <label class="audit-log__filter">
        {{ 'settings.auditLog.sectionFilterLabel' | translate }}
        <select class="audit-log__filter-select" (change)="onSectionChange($any($event.target).value)">
          <option *ngFor="let key of filterOptions" [value]="key">
            {{ (key === 'all' ? 'settings.auditLog.allSectionsOption' : 'settings.sections.' + key) | translate }}
          </option>
        </select>
      </label>

      <div class="card audit-log__card">
        <ul class="audit-log__list">
          <li class="audit-log__row" *ngFor="let entry of entries">
            <span class="audit-log__avatar">{{ initials(entry) }}</span>
            <span class="audit-log__summary"><span class="audit-log__actor">{{ actorLabel(entry) }}</span> {{ entry.summary }}</span>
            <span class="audit-log__section-tag">{{ sectionLabel(entry) }}</span>
            <span class="audit-log__timestamp">{{ entry.changedAt | date: 'h:mm:ss a' }}</span>
          </li>
          <li class="audit-log__empty" *ngIf="page && entries.length === 0">
            {{ 'settings.auditLog.emptyState' | translate }}
          </li>
        </ul>
      </div>
    </div>
  `
})
export class AuditLogComponent implements OnInit {
  private auditLogService = inject(AuditLogService);
  private translate = inject(TranslateService);

  readonly filterOptions = SECTION_FILTER_OPTIONS;

  selectedSection: string | null = null;
  page: AuditLogPage | null = null;

  get entries(): AuditLogEntry[] {
    return this.page?.entries ?? [];
  }

  ngOnInit(): void {
    this.loadPage();
  }

  onSectionChange(value: string): void {
    this.selectedSection = value === 'all' ? null : value;
    this.loadPage();
  }

  // "We don't have a name" is treated the same as "we don't have an actor" for display purposes:
  // changedByName can be null even when changedByAssociateId is non-null (e.g. the associate row
  // was later deleted), so this falls through to whatever identifier is actually available
  // rather than rendering a blank actor.
  actorLabel(entry: AuditLogEntry): string {
    if (entry.changedByName) {
      return entry.changedByName;
    }
    if (entry.changedByUserId) {
      return entry.changedByUserId;
    }
    return this.translate.instant('settings.auditLog.systemActor');
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

  // The mockup's per-row section pill. Translates through settings.sections for the 5 real
  // Settings screens (via SECTION_BACKEND_TO_KEY); any other backend value (KYC, ASSOCIATE,
  // WITHDRAWAL, WALLET, ...) is humanized directly rather than left as a raw SCREAMING_SNAKE_CASE
  // string, since there's no settings.sections entry for those non-Settings admin actions.
  sectionLabel(entry: AuditLogEntry): string {
    const key = SECTION_BACKEND_TO_KEY[entry.section];
    if (key) {
      return this.translate.instant('settings.sections.' + key);
    }
    return entry.section
      .toLowerCase()
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  private loadPage(): void {
    fetchAllPages((p, size) => this.auditLogService.list(this.selectedSection, p, size)).subscribe(res => (this.page = res));
  }
}
