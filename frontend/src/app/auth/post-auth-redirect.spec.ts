import { postAuthLandingPath } from './post-auth-redirect';
import { SetupStateResponse } from '../setup/models/setup-state.model';

describe('postAuthLandingPath', () => {
  const unlaunchedState: SetupStateResponse = { steps: [], canGoLive: false, launchedAt: null };
  const launchedState: SetupStateResponse = { steps: [], canGoLive: true, launchedAt: '2026-01-01T00:00:00Z' };

  it('sends ASSOCIATE to /dashboard regardless of setup state', () => {
    expect(postAuthLandingPath('ASSOCIATE', unlaunchedState, 'company-profile')).toBe('/dashboard');
    expect(postAuthLandingPath('ASSOCIATE', launchedState, 'company-profile')).toBe('/dashboard');
  });

  it('sends every admin-family role to the first incomplete setup step while unlaunched', () => {
    for (const role of ['ADMIN', 'SUPER_ADMIN', 'FINANCE', 'KYC_REVIEWER', 'SUPPORT']) {
      expect(postAuthLandingPath(role, unlaunchedState, 'company-profile')).toBe('/setup/company-profile');
    }
  });

  it('sends ADMIN to /admin/associates/new once launched', () => {
    expect(postAuthLandingPath('ADMIN', launchedState, 'company-profile')).toBe('/admin/associates/new');
  });

  it('sends every other admin-family role to /settings once launched', () => {
    for (const role of ['SUPER_ADMIN', 'FINANCE', 'KYC_REVIEWER', 'SUPPORT']) {
      expect(postAuthLandingPath(role, launchedState, 'company-profile')).toBe('/settings');
    }
  });
});
