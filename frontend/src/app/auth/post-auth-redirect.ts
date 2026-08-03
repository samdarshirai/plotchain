import { ADMIN_FAMILY_ROLES } from '../admin/admin.guard';
import { SetupStateResponse } from '../setup/models/setup-state.model';

// Single source of truth for "where does this role land once authenticated" -- login,
// change-password, and the '/' root route all delegate here so the ADMIN-vs-rest-of-admin-family
// split (and the launched/unlaunched split) only has to be right in one place.
export function postAuthLandingPath(role: string, state: SetupStateResponse, incompleteStepPath: () => string): string {
  if (!ADMIN_FAMILY_ROLES.has(role)) {
    return '/dashboard';
  }
  if (!state.launchedAt) {
    return `/setup/${incompleteStepPath()}`;
  }
  return role === 'ADMIN' ? '/admin/associates/new' : '/settings';
}
