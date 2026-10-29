import { ADMIN_NAV_CATEGORIES, findNavCategoryForUrl } from './admin-nav-categories.model';

describe('ADMIN_NAV_CATEGORIES', () => {
  it('listsTheMockupCategoriesInOrderWithTheirIcons', () => {
    expect(ADMIN_NAV_CATEGORIES.map(category => [category.key, category.icon])).toEqual([
      ['masterData', 'database'],
      ['network', 'group'],
      ['epin', 'pin'],
      ['finance', 'point_of_sale'],
      ['invoice', 'receipt_long'],
      ['inventory', 'domain'],
      ['communication', 'forum'],
      ['setup', 'tune'],
      ['system', 'admin_panel_settings']
    ]);
  });

  it('groupsEverySettingsScreenUnderTheirCategory', () => {
    expect(ADMIN_NAV_CATEGORIES.map(category => category.items.map(item => item.key))).toEqual([
      ['masterProjects', 'projectsPlots'],
      ['associateDirectory', 'treeExplorer', 'kycQueue'],
      ['epinRegister'],
      ['ledgerRegister', 'salesRegister', 'cycleManagement', 'payoutApproval', 'expenseTypes'],
      ['paymentDetails', 'invoiceExpenses', 'advanceLoans'],
      ['bookNewPlot', 'addPlotEmi', 'viewBookedPlot', 'viewConfirmedPlot', 'plotTransfer', 'viewPlotEmi', 'viewTransferredPlots', 'viewCancelledPlot'],
      ['supportTickets', 'news'],
      ['companyProfile', 'branding', 'paymentsKyc', 'compensation'],
      ['auditLog', 'adminStats']
    ]);
  });

  it('pointsEveryItemAtASettingsRouteAndReusesTheExistingSectionLabelKeys', () => {
    for (const category of ADMIN_NAV_CATEGORIES) {
      expect(category.labelKey).toBe('nav.categories.' + category.key);
      for (const item of category.items) {
        expect(item.path.startsWith('/admin/settings/')).toBe(true);
        expect(item.labelKey).toBe((category.key === 'inventory' ? 'nav.plotBooking.' : 'settings.sections.') + item.key);
      }
    }
  });
});

describe('findNavCategoryForUrl', () => {
  it('resolvesReceiptUrlToTheInvoiceCategory', () => {
    expect(findNavCategoryForUrl('/admin/settings/payment-details/receipt/abc')?.key).toBe('invoice');
    expect(findNavCategoryForUrl('/admin/settings/advance-loans')?.key).toBe('invoice');
  });

  it('resolvesTheSupportTicketsScreenToTheCommunicationCategory', () => {
    expect(findNavCategoryForUrl('/admin/settings/support-tickets')?.key).toBe('communication');
  });

  it('resolvesThePlotsScreenToTheMasterDataCategory', () => {
    expect(findNavCategoryForUrl('/admin/settings/plots')?.key).toBe('masterData');
  });

  it('returnsTheCategoryOwningTheCurrentSettingsScreen', () => {
    expect(findNavCategoryForUrl('/admin/settings/branding')?.key).toBe('setup');
    expect(findNavCategoryForUrl('/admin/settings/tree-explorer')?.key).toBe('network');
    expect(findNavCategoryForUrl('/admin/settings/ledger-register')?.key).toBe('finance');
    expect(findNavCategoryForUrl('/admin/settings/admin-stats')?.key).toBe('system');
  });

  it('keepsAdminUsersOutOfEveryCategory', () => {
    expect(findNavCategoryForUrl('/admin/settings/admin-users')).toBeUndefined();
  });

  it('ignoresQueryStringsAndFragments', () => {
    expect(findNavCategoryForUrl('/admin/settings/audit-log?page=2')?.key).toBe('system');
    expect(findNavCategoryForUrl('/admin/settings/audit-log#top')?.key).toBe('system');
  });

  it('matchesNestedChildRoutesOfAnItem', () => {
    expect(findNavCategoryForUrl('/admin/settings/associate-directory/VA-1042')?.key).toBe('network');
  });

  it('returnsUndefinedOutsideASettingsScreenSoTheItemTabRowCollapses', () => {
    expect(findNavCategoryForUrl('/admin/dashboard')).toBeUndefined();
    expect(findNavCategoryForUrl('/admin/settings')).toBeUndefined();
  });

  it('resolvesThePlotTransferScreenToTheInventoryCategory', () => {
    expect(findNavCategoryForUrl('/admin/settings/plot-transfer')?.key).toBe('inventory');
  });

  it('resolvesBookNewPlotToPlotBookingButBarePlotsToMasterData', () => {
    expect(findNavCategoryForUrl('/admin/settings/book-plot')?.key).toBe('inventory');
    expect(findNavCategoryForUrl('/admin/settings/plots')?.key).toBe('masterData');
  });

  it('resolvesEveryPlotBookingDeepLinkToTheInventoryCategory', () => {
    expect(findNavCategoryForUrl('/admin/settings/view-transferred-plot')?.key).toBe('inventory');
    expect(findNavCategoryForUrl('/admin/settings/plot-transfer')?.key).toBe('inventory');
  });
});
