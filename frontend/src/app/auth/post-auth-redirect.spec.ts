import { postAuthLandingPath } from './post-auth-redirect';
import { SetupStateResponse } from '../setup/models/setup-state.model';
import { ADMIN_FAMILY_ROLES } from '../admin/admin.guard';

describe('postAuthLandingPath', () => {
  const unlaunchedState: SetupStateResponse = { steps: [], canGoLive: false, launchedAt: null };
  const launchedState: SetupStateResponse = { steps: [], canGoLive: true, launchedAt: '2026-01-01T00:00:00Z' };

  it('covers exactly the admin-family set', () => {
    expect([...ADMIN_FAMILY_ROLES].sort()).toEqual(['ADMIN']);
  });

  it('sends ASSOCIATE to /dashboard regardless of setup state', () => {
    expect(postAuthLandingPath('ASSOCIATE', unlaunchedState, () => 'company-profile')).toBe('/dashboard');
    expect(postAuthLandingPath('ASSOCIATE', launchedState, () => 'company-profile')).toBe('/dashboard');
  });

  it('sends every admin-family role to the first incomplete setup step while unlaunched', () => {
    for (const role of ADMIN_FAMILY_ROLES) {
      expect(postAuthLandingPath(role, unlaunchedState, () => 'company-profile')).toBe('/setup/company-profile');
    }
  });

  it('sends every admin-family role to /admin/dashboard once launched', () => {
    for (const role of ADMIN_FAMILY_ROLES) {
      expect(postAuthLandingPath(role, launchedState, () => 'company-profile')).toBe('/admin/dashboard');
    }
  });

  it('never invokes incompleteStepPath when launched', () => {
    const spy = jasmine.createSpy('incompleteStepPath').and.returnValue('company-profile');
    postAuthLandingPath('ADMIN', launchedState, spy);
    expect(spy).not.toHaveBeenCalled();
  });
});
