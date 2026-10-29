export const ADMIN_ROUTES = [
  '/admin/dashboard', '/admin/change-password',
  ...[
    'company-profile', 'branding', 'compensation', 'payments-kyc', 'associate-directory', 'tree-explorer',
    'kyc-queue', 'sales-register', 'cycle-management', 'ledger-register', 'e-pin-register', 'payout-approval',
    'admin-users', 'master-projects', 'plots', 'book-plot', 'audit-log', 'admin-stats', 'support-tickets', 'news', 'expense-types', 'add-plot-emi'
  ].map(s => `/admin/settings/${s}`)
];

export const ASSOCIATE_ROUTES = [
  '/dashboard', '/my-tree', '/my-tree/team', '/plot-bookings', '/plot-bookings/team', '/plot-bookings/left',
  '/plot-bookings/mine', '/plot-bookings/right', '/plot-bookings/my-sales', '/e-pins/unlock', '/profile',
  '/profile/welcome-letter', '/profile/bank-details', '/profile/kyc', '/income-statement', '/income-statement/direct',
  '/income-statement/matching', '/income-statement/sponsor-matching', '/income-statement/royalty',
  '/income-statement/reward', '/income-statement/perk', '/reports/my-business', '/reports/emi', '/payout-history',
  '/messages', '/messages/new', '/change-password'
];

export const ROLES = [
  { name: 'admin', user: 'ADMIN_USER', pass: 'ADMIN_PASSWORD', defaults: ['admin', 'ChangeMe123!'], routes: ADMIN_ROUTES, home: '/admin/dashboard' },
  { name: 'associate', user: 'ASSOCIATE_USER', pass: 'ASSOCIATE_PASSWORD', defaults: ['VP00001', 'ChangeMe123!'], routes: ASSOCIATE_ROUTES, home: '/dashboard' }
];
