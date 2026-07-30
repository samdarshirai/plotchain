import { Routes } from '@angular/router';
import { DashboardComponent } from './dashboard/dashboard.component';
import { LoginComponent } from './auth/login.component';
import { ChangePasswordComponent } from './auth/change-password.component';
import { CreateAssociateComponent } from './admin/create-associate.component';
import { authGuard } from './auth/auth.guard';
import { adminGuard } from './admin/admin.guard';
import { setupModeGuard, launchedModeGuard } from './setup/setup.guard';
import { SetupShellComponent } from './setup/setup-shell.component';
import { SetupStepPlaceholderComponent } from './setup/setup-step-placeholder.component';
import { CompanyProfileStepComponent } from './setup/steps/company-profile/company-profile-step.component';
import { BrandingStepComponent } from './setup/steps/branding/branding-step.component';
import { CompensationStepComponent } from './setup/steps/compensation/compensation-step.component';
import { SettingsShellComponent } from './settings/settings-shell.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'dashboard', component: DashboardComponent, canActivate: [authGuard] },
  { path: 'change-password', component: ChangePasswordComponent, canActivate: [authGuard] },
  { path: 'admin/associates/new', component: CreateAssociateComponent, canActivate: [authGuard, adminGuard] },
  {
    path: 'setup',
    component: SetupShellComponent,
    canActivate: [authGuard, adminGuard, setupModeGuard],
    children: [
      { path: 'company-profile', component: CompanyProfileStepComponent, data: { stepKey: 'companyProfile' } },
      { path: 'branding', component: BrandingStepComponent, data: { stepKey: 'branding' } },
      { path: 'compensation', component: CompensationStepComponent, data: { stepKey: 'compensation' } },
      { path: 'projects', component: SetupStepPlaceholderComponent, data: { stepKey: 'projects' } },
      { path: 'payments-kyc', component: SetupStepPlaceholderComponent, data: { stepKey: 'paymentsKyc' } },
      { path: 'admin-team', component: SetupStepPlaceholderComponent, data: { stepKey: 'adminTeam' } },
      { path: 'root-associates', component: SetupStepPlaceholderComponent, data: { stepKey: 'rootAssociates' } },
      { path: 'review-launch', component: SetupStepPlaceholderComponent, data: { stepKey: 'reviewLaunch' } },
      { path: '', redirectTo: 'company-profile', pathMatch: 'full' }
    ]
  },
  { path: 'settings', component: SettingsShellComponent, canActivate: [authGuard, adminGuard, launchedModeGuard] },
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' }
];
