import { Routes } from '@angular/router';
import { DashboardComponent } from './dashboard/dashboard.component';

export const routes: Routes = [
  { path: 'dashboard/:associateId', component: DashboardComponent },
  // NOTE: 'me' is a placeholder, not a real UUID — DashboardController will 400 until
  // the auth/tenant-context plan resolves 'me' to the caller's real associate id.
  // Intentionally left as-is; see Global Constraints in the dashboard-screen plan.
  { path: '', redirectTo: '/dashboard/me', pathMatch: 'full' }
];
