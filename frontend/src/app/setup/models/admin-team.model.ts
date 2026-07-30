// The four roles this step's UI can ever assign -- matches the spec's Role select exactly.
export type AssignableAdminRole = 'SUPER_ADMIN' | 'FINANCE' | 'KYC_REVIEWER' | 'SUPPORT';

// Widened for AdminSummary.role only: GET /api/company/admins (AdminProvisioningService.list())
// returns every non-ASSOCIATE row, including the founding 'ADMIN' account AdminBootstrapRunner
// always creates -- so every install has at least one row this type must be able to represent,
// even though 'ADMIN' can never be *created* through this step's form.
export type AdminRole = AssignableAdminRole | 'ADMIN';

export interface CreateAdminRequest {
  userId: string;
  fullName: string;
  role: AssignableAdminRole;
  temporaryPassword?: string;
}

export interface CreateAdminResponse {
  id: string;
  userId: string;
  role: AssignableAdminRole;
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
  value: AssignableAdminRole;
  labelKey: string;
}

export const ROLE_OPTIONS: AdminRoleOption[] = [
  { value: 'SUPER_ADMIN', labelKey: 'setup.adminTeam.roleSuperAdminLabel' },
  { value: 'FINANCE', labelKey: 'setup.adminTeam.roleFinanceLabel' },
  { value: 'KYC_REVIEWER', labelKey: 'setup.adminTeam.roleKycReviewerLabel' },
  { value: 'SUPPORT', labelKey: 'setup.adminTeam.roleSupportLabel' }
];
