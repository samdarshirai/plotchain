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
      { key: 'masterProjects', labelKey: 'settings.sections.masterProjects', path: '/settings/master-projects' },
      { key: 'projectsPlots', labelKey: 'settings.sections.projectsPlots', path: '/settings/plots' }
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
    key: 'epin',
    labelKey: 'nav.categories.epin',
    icon: 'pin',
    items: [
      { key: 'epinRegister', labelKey: 'settings.sections.epinRegister', path: '/settings/e-pin-register' }
    ]
  },
  {
    key: 'finance',
    labelKey: 'nav.categories.finance',
    icon: 'point_of_sale',
    items: [
      { key: 'ledgerRegister', labelKey: 'settings.sections.ledgerRegister', path: '/settings/ledger-register' },
      { key: 'salesRegister', labelKey: 'settings.sections.salesRegister', path: '/settings/sales-register' },
      { key: 'cycleManagement', labelKey: 'settings.sections.cycleManagement', path: '/settings/cycle-management' },
      { key: 'payoutApproval', labelKey: 'settings.sections.payoutApproval', path: '/settings/payout-approval' },
      { key: 'expenseTypes', labelKey: 'settings.sections.expenseTypes', path: '/settings/expense-types' }
    ]
  },
  {
    key: 'invoice',
    labelKey: 'nav.categories.invoice',
    icon: 'receipt_long',
    items: [
      { key: 'paymentDetails', labelKey: 'settings.sections.paymentDetails', path: '/settings/payment-details' },
      { key: 'invoiceExpenses', labelKey: 'settings.sections.invoiceExpenses', path: '/settings/invoice-expenses' },
      { key: 'advanceLoans', labelKey: 'settings.sections.advanceLoans', path: '/settings/advance-loans' }
    ]
  },
  {
    key: 'inventory',
    labelKey: 'nav.categories.inventory',
    icon: 'domain',
    items: [
      { key: 'bookNewPlot', labelKey: 'nav.plotBooking.bookNewPlot', path: '/settings/book-plot' },
      { key: 'addPlotEmi', labelKey: 'nav.plotBooking.addPlotEmi', path: '/settings/add-plot-emi' },
      { key: 'viewBookedPlot', labelKey: 'nav.plotBooking.viewBookedPlot', path: '/settings/view-booked-plot' },
      { key: 'viewConfirmedPlot', labelKey: 'nav.plotBooking.viewConfirmedPlot', path: '/settings/view-confirmed-plot' },
      { key: 'plotTransfer', labelKey: 'nav.plotBooking.plotTransfer', path: '/settings/plot-transfer' },
      { key: 'viewPlotEmi', labelKey: 'nav.plotBooking.viewPlotEmi', path: '/settings/view-plot-emi' },
      { key: 'viewTransferredPlots', labelKey: 'nav.plotBooking.viewTransferredPlots', path: '/settings/view-transferred-plot' },
      { key: 'viewCancelledPlot', labelKey: 'nav.plotBooking.viewCancelledPlot', path: '/settings/view-cancelled-plot' }
    ]
  },
  {
    key: 'communication',
    labelKey: 'nav.categories.communication',
    icon: 'forum',
    items: [
      { key: 'supportTickets', labelKey: 'settings.sections.supportTickets', path: '/settings/support-tickets' },
      { key: 'news', labelKey: 'settings.sections.news', path: '/settings/news' }
    ]
  },
  {
    key: 'setup',
    labelKey: 'nav.categories.setup',
    icon: 'tune',
    items: [
      { key: 'companyProfile', labelKey: 'settings.sections.companyProfile', path: '/settings/company-profile' },
      { key: 'branding', labelKey: 'settings.sections.branding', path: '/settings/branding' },
      { key: 'paymentsKyc', labelKey: 'settings.sections.paymentsKyc', path: '/settings/payments-kyc' },
      { key: 'compensation', labelKey: 'settings.sections.compensation', path: '/settings/compensation' }
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

// Standalone sidebar link below Dashboard; not a category, so findNavCategoryForUrl ignores it.
export const ADMIN_USERS_NAV_ITEM: AdminNavItem = {
  key: 'adminUsers',
  labelKey: 'settings.sections.adminUsers',
  path: '/settings/admin-users'
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
