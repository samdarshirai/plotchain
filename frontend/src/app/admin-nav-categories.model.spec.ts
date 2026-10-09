import { ADMIN_NAV_CATEGORIES, findNavCategoryForUrl } from './admin-nav-categories.model';

describe('ADMIN_NAV_CATEGORIES', () => {
  it('listsTheMockupCategoriesInOrderWithTheirIcons', () => {
    expect(ADMIN_NAV_CATEGORIES.map(category => [category.key, category.icon])).toEqual([
      ['setup', 'tune'],
      ['network', 'group'],
      ['finance', 'point_of_sale'],
      ['inventory', 'domain'],
      ['system', 'admin_panel_settings']
    ]);
  });

  it('groupsEverySettingsScreenUnderTheirCategory', () => {
    expect(ADMIN_NAV_CATEGORIES.map(category => category.items.map(item => item.key))).toEqual([
      ['companyProfile', 'branding', 'compensation', 'paymentsKyc'],
      ['associateDirectory', 'treeExplorer', 'kycQueue'],
      ['salesRegister', 'cycleManagement', 'ledgerRegister', 'epinRegister', 'payoutApproval'],
      ['projectsPlots', 'bookingsEmi'],
      ['auditLog', 'adminStats', 'supportTickets', 'announcements']
    ]);
  });

  it('pointsEveryItemAtASettingsRouteAndReusesTheExistingSectionLabelKeys', () => {
    for (const category of ADMIN_NAV_CATEGORIES) {
      expect(category.labelKey).toBe('nav.categories.' + category.key);
      for (const item of category.items) {
        expect(item.path.startsWith('/settings/')).toBe(true);
        expect(item.labelKey).toBe('settings.sections.' + item.key);
      }
    }
  });
});

describe('findNavCategoryForUrl', () => {
  it('resolvesTheSupportTicketsScreenToTheSystemCategory', () => {
    expect(findNavCategoryForUrl('/settings/support-tickets')?.key).toBe('system');
  });

  it('resolvesTheAnnouncementsScreenToTheSystemCategory', () => {
    expect(findNavCategoryForUrl('/settings/announcements')?.key).toBe('system');
  });

  it('resolvesTheProjectsPlotsScreenToTheInventoryCategory', () => {
    expect(findNavCategoryForUrl('/settings/projects-plots')?.key).toBe('inventory');
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
});
