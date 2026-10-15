import { ADMIN_NAV_CATEGORIES, findNavCategoryForUrl } from './admin-nav-categories.model';

describe('ADMIN_NAV_CATEGORIES', () => {
  it('listsTheMockupCategoriesInOrderWithTheirIcons', () => {
    expect(ADMIN_NAV_CATEGORIES.map(category => [category.key, category.icon])).toEqual([
      ['setup', 'tune'],
      ['network', 'group'],
      ['finance', 'point_of_sale'],
      ['inventory', 'domain'],
      ['communication', 'forum'],
      ['system', 'admin_panel_settings']
    ]);
  });

  it('groupsEverySettingsScreenUnderTheirCategory', () => {
    expect(ADMIN_NAV_CATEGORIES.map(category => category.items.map(item => item.key))).toEqual([
      ['companyProfile', 'branding', 'compensation', 'paymentsKyc', 'projectsPlots'],
      ['associateDirectory', 'treeExplorer', 'kycQueue'],
      ['ledgerRegister', 'salesRegister', 'cycleManagement', 'epinRegister', 'payoutApproval'],
      ['bookNewPlot', 'addPlotEmi', 'viewBookedPlot', 'viewConfirmedPlot', 'plotTransfer', 'viewPlotEmi', 'viewTransferredPlots', 'viewCancelledPlot'],
      ['supportTickets'],
      ['auditLog', 'adminStats']
    ]);
  });

  it('pointsEveryItemAtASettingsRouteAndReusesTheExistingSectionLabelKeys', () => {
    for (const category of ADMIN_NAV_CATEGORIES) {
      expect(category.labelKey).toBe('nav.categories.' + category.key);
      for (const item of category.items) {
        expect(item.path.startsWith('/settings/')).toBe(true);
        expect(item.labelKey).toBe((category.key === 'inventory' ? 'nav.plotBooking.' : 'settings.sections.') + item.key);
      }
    }
  });
});

describe('findNavCategoryForUrl', () => {
  it('resolvesTheSupportTicketsScreenToTheCommunicationCategory', () => {
    expect(findNavCategoryForUrl('/settings/support-tickets')?.key).toBe('communication');
  });

  it('resolvesTheProjectsPlotsScreenToTheInventoryCategory', () => {
    expect(findNavCategoryForUrl('/settings/projects-plots')?.key).toBe('setup');
  });

  it('returnsTheCategoryOwningTheCurrentSettingsScreen', () => {
    expect(findNavCategoryForUrl('/settings/branding')?.key).toBe('setup');
    expect(findNavCategoryForUrl('/settings/tree-explorer')?.key).toBe('network');
    expect(findNavCategoryForUrl('/settings/ledger-register')?.key).toBe('finance');
    expect(findNavCategoryForUrl('/settings/admin-stats')?.key).toBe('system');
  });

  it('ignoresQueryStringsAndFragments', () => {
    expect(findNavCategoryForUrl('/settings/audit-log?page=2')?.key).toBe('system');
    expect(findNavCategoryForUrl('/settings/audit-log#top')?.key).toBe('system');
  });

  it('matchesNestedChildRoutesOfAnItem', () => {
    expect(findNavCategoryForUrl('/settings/associate-directory/VA-1042')?.key).toBe('network');
  });

  it('returnsUndefinedOutsideASettingsScreenSoTheItemTabRowCollapses', () => {
    expect(findNavCategoryForUrl('/admin/dashboard')).toBeUndefined();
    expect(findNavCategoryForUrl('/settings')).toBeUndefined();
    expect(findNavCategoryForUrl('/admin/sales/new')).toBeUndefined();
  });

  it('resolvesTheBookingsEmiScreenToTheInventoryCategory', () => {
    expect(findNavCategoryForUrl('/settings/bookings-emi')?.key).toBe('inventory');
  });

  it('resolvesBookNewPlotToPlotBookingButBareProjectsPlotsToSetup', () => {
    expect(findNavCategoryForUrl('/settings/book-plot')?.key).toBe('inventory');
    expect(findNavCategoryForUrl('/settings/projects-plots')?.key).toBe('setup');
  });

  it('resolvesEveryPlotBookingDeepLinkToTheInventoryCategory', () => {
    expect(findNavCategoryForUrl('/settings/bookings-emi?tab=transferred')?.key).toBe('inventory');
    expect(findNavCategoryForUrl('/settings/bookings-emi?tab=register&action=transfer')?.key).toBe('inventory');
  });
});
