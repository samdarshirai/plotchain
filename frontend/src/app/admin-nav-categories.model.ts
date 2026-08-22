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

// The admin-family global nav, transcribed from the settings mockup's categories() (see
// docs/design/viraj_acres_settings_mockup/Viraj_Acres_Settings.dc.html): four category tabs in the
// header, each expanding into its own item-tab row underneath. Every item is a /settings child
// route, so a category is "active" precisely when the current URL is one of its items -- see
// findNavCategoryForUrl below. The icons are Material Symbols names, purely decorative, so they
// carry no i18n key. Dashboard is not a category: it lives beside these tabs in the header and
// collapses the item row entirely.
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
      { key: 'paymentsKyc', labelKey: 'settings.sections.paymentsKyc', path: '/settings/payments-kyc' }
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
    items: [
      { key: 'auditLog', labelKey: 'settings.sections.auditLog', path: '/settings/audit-log' },
      { key: 'adminStats', labelKey: 'settings.sections.adminStats', path: '/settings/admin-stats' }
    ]
  }
];

// Which category owns a given URL. Derived from the router's URL on every navigation rather than
// held as separate nav state, so a deep link, a browser Back, or a redirect all light up the same
// tab the item row is showing. Returns undefined for anything outside /settings (e.g.
// /admin/dashboard), which is what collapses the item row.
export function findNavCategoryForUrl(url: string): AdminNavCategory | undefined {
  const path = url.split('?')[0].split('#')[0];
  return ADMIN_NAV_CATEGORIES.find(category =>
    category.items.some(item => path === item.path || path.startsWith(item.path + '/'))
  );
}
