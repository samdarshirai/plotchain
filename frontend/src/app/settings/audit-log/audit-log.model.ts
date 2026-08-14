import { SECTION_PATHS } from '../models/settings-section.model';

// Field-for-field with the backend's SettingsAuditEntryResponse record. changedByName and
// changedByUserId are null exactly when changedByAssociateId is null (a system/actor-less entry).
export interface AuditLogEntry {
  id: string;
  changedByAssociateId: string | null;
  changedByName: string | null;
  changedByUserId: string | null;
  section: string;
  summary: string;
  detail: string;
  changedAt: string;
}

// Field-for-field with the backend's SettingsAuditPageResponse record.
export interface AuditLogPage {
  entries: AuditLogEntry[];
  page: number;
  size: number;
  totalElements: number;
}

// The filter dropdown's option list: SECTION_PATHS's camelCase keys (the same 5 sections used
// elsewhere in Settings) plus an "all" option meaning "no section filter".
export const SECTION_FILTER_OPTIONS: string[] = ['all', ...Object.keys(SECTION_PATHS)];

// One-time lookup from the camelCase section keys used across the frontend (SECTION_PATHS) to
// the SCREAMING_SNAKE_CASE values the backend's `section` query param expects. Covers exactly
// the 5 real sections -- there's no backend value for "auditLog"/"all", those never get sent.
export const AUDIT_LOG_SECTION_BACKEND_VALUES: Record<string, string> = {
  companyProfile: 'COMPANY_PROFILE',
  branding: 'BRANDING',
  compensation: 'COMPENSATION',
  projects: 'PROJECTS',
  paymentsKyc: 'PAYMENTS_KYC'
};
