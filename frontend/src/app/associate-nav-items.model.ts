export interface AssociateNavSubItem {
  key: string;
  labelKey: string;
  path: string;
}

export interface AssociateNavItem {
  key: string;
  labelKey: string;
  icon: string;
  path: string;
  children?: AssociateNavSubItem[];
}

// The Associate sidebar's nav list, transcribed from the sidebar mockup's NAV array (see
// claude.ai/design "Header to sidebar conversion" -> Dashboard Sidebar.dc.html). Unlike
// ADMIN_NAV_CATEGORIES there's no findNavCategoryForUrl-style lookup here: active state comes
// from Angular's routerLinkActive directive in the template, not manual URL matching.
//
// My Account is the one item with `children`: its 4 sub-sections (Welcome Letter, Profile, Bank
// Details, KYC Details) are real sibling routes under /profile (see app.routes.ts), rendered as
// nested sub-links in the sidebar rather than an in-page tab bar (docs/superpowers/plans/
// can-you-break-down-vectorized-dongarra.md).
export const ASSOCIATE_NAV_ITEMS: AssociateNavItem[] = [
  { key: 'dashboard', labelKey: 'nav.dashboard', icon: 'dashboard', path: '/dashboard' },
  { key: 'myTree', labelKey: 'nav.myTree', icon: 'account_tree', path: '/my-tree' },
  { key: 'salesHistory', labelKey: 'nav.salesHistory', icon: 'receipt_long', path: '/sales-history' },
  { key: 'plotBookings', labelKey: 'nav.plotBookings', icon: 'grid_view', path: '/plot-bookings' },
  {
    key: 'myAccount', labelKey: 'nav.myAccount', icon: 'person', path: '/profile',
    children: [
      { key: 'welcomeLetter', labelKey: 'myAccount.tabs.welcomeLetter', path: '/profile/welcome-letter' },
      { key: 'profile', labelKey: 'myAccount.tabs.profile', path: '/profile' },
      { key: 'bankDetails', labelKey: 'myAccount.tabs.bankDetails', path: '/profile/bank-details' },
      { key: 'kyc', labelKey: 'myAccount.tabs.kyc', path: '/profile/kyc' }
    ]
  },
  { key: 'incomeStatement', labelKey: 'nav.incomeStatement', icon: 'description', path: '/income-statement' },
  { key: 'payoutHistory', labelKey: 'nav.payoutHistory', icon: 'payments', path: '/payout-history' }
];
