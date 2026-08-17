import { ADMIN_FAMILY_ROLES } from '../admin/admin.guard';
import { SetupStateResponse } from '../setup/models/setup-state.model';

// Single source of truth for "where does this role land once authenticated" -- every call site
// that needs to redirect based on role (login, change-password, and the route guards for '/',
// the associate-only routes, and the login-redirect flow) delegates here so the
// launched-vs-unlaunched split only has to be right in one place, and every consumer gets the
// same admin-dashboard destination without duplicating that logic.
export function postAuthLandingPath(role: string, state: SetupStateResponse, incompleteStepPath: () => string): string {
  if (!ADMIN_FAMILY_ROLES.has(role)) {
    return '/dashboard';
  }
  if (!state.launchedAt) {
    return `/setup/${incompleteStepPath()}`;
  }
  return '/admin/dashboard';
}
