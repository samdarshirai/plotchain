export interface AdminNavItem {
  key: string;
  labelKey: string;
  path: string;
}

export interface AdminNavCategory {
  key: string;
  labelKey: string;
  icon: string;
  items: AdminNavItem[];
}

// Global header nav for admin-family roles: Setup/Network/Finance & Cycles/System pills replace
// the old flat Dashboard/Provision Associate/Settings links, folding what used to be
// settings-nav-rail's sidebar (plus Provision Associate) into the header itself -- see
// docs/design import "Viraj Acres Nav Options" option 1c. Clicking a category pill routes to its
// first item; the second header row then lists that category's items.
export const ADMIN_NAV_CATEGORIES: AdminNavCategory[] = [
  {
    key: 'setup',
    labelKey: 'nav.categories.setup',
    icon: 'tune',
    items: [
      { key: 'companyProfile', labelKey: 'settings.sections.companyProfile', path: '/settings/company-profile' },
      { key: 'branding', labelKey: 'settings.sections.branding', path: '/settings/branding' },
      { key: 'compensation', labelKey: 'settings.sections.compensation', path: '/settings/compensation' },
      { key: 'projects', labelKey: 'settings.sections.projects', path: '/settings/projects' },
      { key: 'paymentsKyc', labelKey: 'settings.sections.paymentsKyc', path: '/settings/payments-kyc' },
      { key: 'provisionAssociate', labelKey: 'nav.provisionAssociate', path: '/admin/associates/new' }
    ]
  },
  {
    key: 'network',
    labelKey: 'nav.categories.network',
    icon: 'group',
    items: [
      { key: 'associateDirectory', labelKey: 'settings.sections.associateDirectory', path: '/settings/associate-directory' },
      { key: 'treeExplorer', labelKey: 'settings.sections.treeExplorer', path: '/settings/tree-explorer' },
      { key: 'kycQueue', labelKey: 'settings.sections.kycQueue', path: '/settings/kyc-queue' }
    ]
  },
  {
    key: 'finance',
    labelKey: 'nav.categories.finance',
    icon: 'point_of_sale',
    items: [
      { key: 'salesRegister', labelKey: 'settings.sections.salesRegister', path: '/settings/sales-register' },
      { key: 'cycleManagement', labelKey: 'settings.sections.cycleManagement', path: '/settings/cycle-management' },
      { key: 'ledgerRegister', labelKey: 'settings.sections.ledgerRegister', path: '/settings/ledger-register' },
      { key: 'payoutApproval', labelKey: 'settings.sections.payoutApproval', path: '/settings/payout-approval' }
    ]
  },
  {
    key: 'system',
    labelKey: 'nav.categories.system',
    icon: 'admin_panel_settings',
    items: [{ key: 'auditLog', labelKey: 'settings.sections.auditLog', path: '/settings/audit-log' }]
  }
];
