export type AdminRole = 'SUPER_ADMIN' | 'FINANCE' | 'KYC_REVIEWER' | 'SUPPORT';

export interface CreateAdminRequest {
  userId: string;
  fullName: string;
  role: AdminRole;
  temporaryPassword?: string;
}

export interface CreateAdminResponse {
  id: string;
  userId: string;
  role: AdminRole;
  temporaryPassword: string;
}

export interface AdminSummary {
  id: string;
  userId: string;
  fullName: string;
  role: AdminRole;
  lastActiveAt: string | null;
}

export interface UserIdAvailability {
  available: boolean;
}

export type RolePermissions = Record<string, string[]>;

export interface AdminRoleOption {
  value: AdminRole;
  labelKey: string;
}

export const ROLE_OPTIONS: AdminRoleOption[] = [
  { value: 'SUPER_ADMIN', labelKey: 'setup.adminTeam.roleSuperAdminLabel' },
  { value: 'FINANCE', labelKey: 'setup.adminTeam.roleFinanceLabel' },
  { value: 'KYC_REVIEWER', labelKey: 'setup.adminTeam.roleKycReviewerLabel' },
  { value: 'SUPPORT', labelKey: 'setup.adminTeam.roleSupportLabel' }
];
