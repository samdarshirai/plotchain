export interface SettingsNavItem {
  key: string;
  labelKey: string;
  path: string;
}

// The Settings sidebar's flat list, in mockup order (see
// docs/design/viraj_acres_settings_mockup/Viraj_Acres_Settings.dc.html). This replaces the old
// Setup/Network/Finance/System category grouping that used to live in admin-nav-categories.model.ts
// and render as two rows of header pills: the mockup's header carries only Dashboard and Settings,
// and every settings screen is listed directly in the 230px sidebar with no category headers.
// Provision Associate is deliberately absent -- it isn't a settings screen; Associate Directory
// links to /admin/associates/new instead.
export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  { key: 'companyProfile', labelKey: 'settings.sections.companyProfile', path: '/settings/company-profile' },
  { key: 'branding', labelKey: 'settings.sections.branding', path: '/settings/branding' },
  { key: 'compensation', labelKey: 'settings.sections.compensation', path: '/settings/compensation' },
  { key: 'projects', labelKey: 'settings.sections.projects', path: '/settings/projects' },
  { key: 'paymentsKyc', labelKey: 'settings.sections.paymentsKyc', path: '/settings/payments-kyc' },
  { key: 'associateDirectory', labelKey: 'settings.sections.associateDirectory', path: '/settings/associate-directory' },
  { key: 'treeExplorer', labelKey: 'settings.sections.treeExplorer', path: '/settings/tree-explorer' },
  { key: 'kycQueue', labelKey: 'settings.sections.kycQueue', path: '/settings/kyc-queue' },
  { key: 'auditLog', labelKey: 'settings.sections.auditLog', path: '/settings/audit-log' },
  { key: 'adminStats', labelKey: 'settings.sections.adminStats', path: '/settings/admin-stats' },
  { key: 'salesRegister', labelKey: 'settings.sections.salesRegister', path: '/settings/sales-register' },
  { key: 'cycleManagement', labelKey: 'settings.sections.cycleManagement', path: '/settings/cycle-management' },
  { key: 'ledgerRegister', labelKey: 'settings.sections.ledgerRegister', path: '/settings/ledger-register' },
  { key: 'payoutApproval', labelKey: 'settings.sections.payoutApproval', path: '/settings/payout-approval' }
];
