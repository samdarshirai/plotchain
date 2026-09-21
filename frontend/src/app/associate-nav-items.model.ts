export interface AssociateNavItem {
  key: string;
  labelKey: string;
  icon: string;
  path: string;
}

// The Associate sidebar's nav list, transcribed from the sidebar mockup's NAV array (see
// claude.ai/design "Header to sidebar conversion" -> Dashboard Sidebar.dc.html). Unlike
// ADMIN_NAV_CATEGORIES there's no findNavCategoryForUrl-style lookup here: active state comes
// from Angular's routerLinkActive directive in the template, not manual URL matching.
export const ASSOCIATE_NAV_ITEMS: AssociateNavItem[] = [
  { key: 'dashboard', labelKey: 'nav.dashboard', icon: 'dashboard', path: '/dashboard' },
  { key: 'myTree', labelKey: 'nav.myTree', icon: 'account_tree', path: '/my-tree' },
  { key: 'salesHistory', labelKey: 'nav.salesHistory', icon: 'receipt_long', path: '/sales-history' },
  { key: 'plotBookings', labelKey: 'nav.plotBookings', icon: 'grid_view', path: '/plot-bookings' },
  { key: 'myAccount', labelKey: 'nav.myAccount', icon: 'person', path: '/profile' },
  { key: 'incomeStatement', labelKey: 'nav.incomeStatement', icon: 'description', path: '/income-statement' },
  { key: 'payoutHistory', labelKey: 'nav.payoutHistory', icon: 'payments', path: '/payout-history' }
];
