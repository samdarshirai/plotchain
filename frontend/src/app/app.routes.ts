import { Routes } from '@angular/router';
import { DashboardComponent } from './dashboard/dashboard.component';
import { LoginComponent } from './auth/login.component';
import { ChangePasswordComponent } from './auth/change-password.component';
import { CreateAssociateComponent } from './admin/create-associate.component';
import { authGuard } from './auth/auth.guard';
import { adminGuard } from './admin/admin.guard';
import { setupModeGuard, launchedModeGuard } from './setup/setup.guard';
import { SetupShellComponent } from './setup/setup-shell.component';
import { CompanyProfileStepComponent } from './setup/steps/company-profile/company-profile-step.component';
import { BrandingStepComponent } from './setup/steps/branding/branding-step.component';
import { CompensationStepComponent } from './setup/steps/compensation/compensation-step.component';
import { PaymentsKycStepComponent } from './setup/steps/payments-kyc/payments-kyc-step.component';
import { AdminTeamStepComponent } from './setup/steps/admin-team/admin-team-step.component';
import { RootAssociatesStepComponent } from './setup/steps/root-associates/root-associates-step.component';
import { ProjectsStepComponent } from './setup/steps/projects/projects-step.component';
import { ReviewLaunchStepComponent } from './setup/steps/review-launch/review-launch-step.component';
import { SettingsShellComponent } from './settings/settings-shell.component';
import { SettingsOverviewComponent } from './settings/settings-overview.component';
import { AuditLogComponent } from './settings/audit-log/audit-log.component';
import { AssociateDirectoryComponent } from './admin/associate-directory/associate-directory.component';
import { TreeExplorerComponent } from './admin/tree-explorer/tree-explorer.component';
import { TermsOfServiceComponent } from './legal/terms-of-service.component';
import { PrivacyPolicyComponent } from './legal/privacy-policy.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'terms', component: TermsOfServiceComponent },
  { path: 'privacy', component: PrivacyPolicyComponent },
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
      { path: 'projects', component: ProjectsStepComponent, data: { stepKey: 'projects' } },
      { path: 'payments-kyc', component: PaymentsKycStepComponent, data: { stepKey: 'paymentsKyc' } },
      { path: 'admin-team', component: AdminTeamStepComponent, data: { stepKey: 'adminTeam' } },
      { path: 'root-associates', component: RootAssociatesStepComponent, data: { stepKey: 'rootAssociates' } },
      { path: 'review-launch', component: ReviewLaunchStepComponent, data: { stepKey: 'reviewLaunch' } },
      { path: '', redirectTo: 'company-profile', pathMatch: 'full' }
    ]
  },
  {
    path: 'settings',
    component: SettingsShellComponent,
    canActivate: [authGuard, adminGuard, launchedModeGuard],
    children: [
      { path: '', component: SettingsOverviewComponent, pathMatch: 'full' },
      { path: 'company-profile', component: CompanyProfileStepComponent, data: { sectionKey: 'companyProfile', mode: 'settings' } },
      { path: 'branding', component: BrandingStepComponent, data: { sectionKey: 'branding', mode: 'settings' } },
      { path: 'compensation', component: CompensationStepComponent, data: { sectionKey: 'compensation', mode: 'settings' } },
      { path: 'projects', component: ProjectsStepComponent, data: { sectionKey: 'projects', mode: 'settings' } },
      { path: 'payments-kyc', component: PaymentsKycStepComponent, data: { sectionKey: 'paymentsKyc', mode: 'settings' } },
      { path: 'admin-team', component: AdminTeamStepComponent, data: { sectionKey: 'adminTeam', mode: 'settings' } },
      { path: 'root-associates', component: RootAssociatesStepComponent, data: { sectionKey: 'rootAssociates', mode: 'settings' } },
      { path: 'associate-directory', component: AssociateDirectoryComponent, data: { sectionKey: 'associateDirectory' } },
      { path: 'tree-explorer', component: TreeExplorerComponent, data: { sectionKey: 'treeExplorer' } },
      { path: 'audit-log', component: AuditLogComponent, data: { sectionKey: 'auditLog' } }
    ]
  },
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' }
];
