export const SECTION_PATHS: Record<string, string> = {
  companyProfile: 'company-profile',
  branding: 'branding',
  compensation: 'compensation',
  projects: 'projects',
  paymentsKyc: 'payments-kyc',
  adminTeam: 'admin-team',
  rootAssociates: 'root-associates'
  // auditLog deliberately absent: it isn't a wrapped step component and has its own route,
  // added directly in SettingsNavRailComponent's template rather than via this shared map.
};
