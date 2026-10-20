export interface AdminNavItem {
  key: string;
  labelKey: string;
  path: string;
  // Items that share one screen (Plot Booking tabs) are told apart by query params.
  query?: Record<string, string>;
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
    key: 'masterData',
    labelKey: 'nav.categories.masterData',
    icon: 'database',
    items: [
      { key: 'masterProjects', labelKey: 'settings.sections.masterProjects', path: '/admin/settings/master-projects' },
      { key: 'projectsPlots', labelKey: 'settings.sections.projectsPlots', path: '/admin/settings/plots' }
    ]
  },
  {
    key: 'network',
    labelKey: 'nav.categories.network',
    icon: 'group',
    items: [
      { key: 'associateDirectory', labelKey: 'settings.sections.associateDirectory', path: '/admin/settings/associate-directory' },
      { key: 'treeExplorer', labelKey: 'settings.sections.treeExplorer', path: '/admin/settings/tree-explorer' },
      { key: 'kycQueue', labelKey: 'settings.sections.kycQueue', path: '/admin/settings/kyc-queue' }
    ]
  },
  {
    key: 'epin',
    labelKey: 'nav.categories.epin',
    icon: 'pin',
    items: [
      { key: 'epinRegister', labelKey: 'settings.sections.epinRegister', path: '/admin/settings/e-pin-register' }
    ]
  },
  {
    key: 'finance',
    labelKey: 'nav.categories.finance',
    icon: 'point_of_sale',
    items: [
      { key: 'ledgerRegister', labelKey: 'settings.sections.ledgerRegister', path: '/admin/settings/ledger-register' },
      { key: 'salesRegister', labelKey: 'settings.sections.salesRegister', path: '/admin/settings/sales-register' },
      { key: 'cycleManagement', labelKey: 'settings.sections.cycleManagement', path: '/admin/settings/cycle-management' },
      { key: 'payoutApproval', labelKey: 'settings.sections.payoutApproval', path: '/admin/settings/payout-approval' },
      { key: 'expenseTypes', labelKey: 'settings.sections.expenseTypes', path: '/admin/settings/expense-types' }
    ]
  },
  {
    key: 'invoice',
    labelKey: 'nav.categories.invoice',
    icon: 'receipt_long',
    items: [
      { key: 'paymentDetails', labelKey: 'settings.sections.paymentDetails', path: '/admin/settings/payment-details' },
      { key: 'invoiceExpenses', labelKey: 'settings.sections.invoiceExpenses', path: '/admin/settings/invoice-expenses' },
      { key: 'advanceLoans', labelKey: 'settings.sections.advanceLoans', path: '/admin/settings/advance-loans' }
    ]
  },
  {
    key: 'inventory',
    labelKey: 'nav.categories.inventory',
    icon: 'domain',
    items: [
      { key: 'bookNewPlot', labelKey: 'nav.plotBooking.bookNewPlot', path: '/admin/settings/book-plot' },
      { key: 'addPlotEmi', labelKey: 'nav.plotBooking.addPlotEmi', path: '/admin/settings/add-plot-emi' },
      { key: 'viewBookedPlot', labelKey: 'nav.plotBooking.viewBookedPlot', path: '/admin/settings/view-booked-plot' },
      { key: 'viewConfirmedPlot', labelKey: 'nav.plotBooking.viewConfirmedPlot', path: '/admin/settings/view-confirmed-plot' },
      { key: 'plotTransfer', labelKey: 'nav.plotBooking.plotTransfer', path: '/admin/settings/plot-transfer' },
      { key: 'viewPlotEmi', labelKey: 'nav.plotBooking.viewPlotEmi', path: '/admin/settings/view-plot-emi' },
      { key: 'viewTransferredPlots', labelKey: 'nav.plotBooking.viewTransferredPlots', path: '/admin/settings/view-transferred-plot' },
      { key: 'viewCancelledPlot', labelKey: 'nav.plotBooking.viewCancelledPlot', path: '/admin/settings/view-cancelled-plot' }
    ]
  },
  {
    key: 'communication',
    labelKey: 'nav.categories.communication',
    icon: 'forum',
    items: [
      { key: 'supportTickets', labelKey: 'settings.sections.supportTickets', path: '/admin/settings/support-tickets' },
      { key: 'news', labelKey: 'settings.sections.news', path: '/admin/settings/news' }
    ]
  },
  {
    key: 'setup',
    labelKey: 'nav.categories.setup',
    icon: 'tune',
    items: [
      { key: 'companyProfile', labelKey: 'settings.sections.companyProfile', path: '/admin/settings/company-profile' },
      { key: 'branding', labelKey: 'settings.sections.branding', path: '/admin/settings/branding' },
      { key: 'paymentsKyc', labelKey: 'settings.sections.paymentsKyc', path: '/admin/settings/payments-kyc' },
      { key: 'compensation', labelKey: 'settings.sections.compensation', path: '/admin/settings/compensation' }
    ]
  },
  {
    key: 'system',
    labelKey: 'nav.categories.system',
    icon: 'admin_panel_settings',
    items: [
      { key: 'auditLog', labelKey: 'settings.sections.auditLog', path: '/admin/settings/audit-log' },
      { key: 'adminStats', labelKey: 'settings.sections.adminStats', path: '/admin/settings/admin-stats' }
    ]
  }
];

// Standalone sidebar link below Dashboard; not a category, so findNavCategoryForUrl ignores it.
export const ADMIN_USERS_NAV_ITEM: AdminNavItem = {
  key: 'adminUsers',
  labelKey: 'settings.sections.adminUsers',
  path: '/admin/settings/admin-users'
};

// Which category owns a given URL. Derived from the router's URL on every navigation rather than
// held as separate nav state, so a deep link, a browser Back, or a redirect all light up the same
// tab the item row is showing. Returns undefined for anything outside /settings (e.g.
// /admin/dashboard), which is what collapses the item row.
export function findNavCategoryForUrl(url: string): AdminNavCategory | undefined {
  const [pathAndQuery] = url.split('#');
  const [path, queryString = ''] = pathAndQuery.split('?');
  const params = new URLSearchParams(queryString);
  const onPath = (item: AdminNavItem) => path === item.path || path.startsWith(item.path + '/');
  const queryMatches = (item: AdminNavItem) => Object.entries(item.query ?? {}).every(([k, v]) => params.get(k) === v);
  // Items sharing a path (Plot Booking) are told apart by query; a query-matching item wins over a bare path match.
  const items = ADMIN_NAV_CATEGORIES.flatMap(category => category.items.map(item => ({ category, item })));
  return (items.find(({ item }) => item.query && onPath(item) && queryMatches(item))
    ?? items.find(({ item }) => onPath(item))
  )?.category;
}
