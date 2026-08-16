import { Routes } from '@angular/router';
import { DashboardComponent } from './dashboard/dashboard.component';
import { LoginComponent } from './auth/login.component';
import { ChangePasswordComponent } from './auth/change-password.component';
import { CreateAssociateComponent } from './admin/create-associate.component';
import { authGuard } from './auth/auth.guard';
import { associateOnlyGuard } from './auth/associate-only.guard';
import { rootRedirectGuard } from './auth/root-redirect.guard';
import { loginRedirectGuard } from './auth/login-redirect.guard';
import { adminGuard } from './admin/admin.guard';
import { setupModeGuard, launchedModeGuard } from './setup/setup.guard';
import { SetupShellComponent } from './setup/setup-shell.component';
import { CompanyProfileStepComponent } from './setup/steps/company-profile/company-profile-step.component';
import { BrandingStepComponent } from './setup/steps/branding/branding-step.component';
import { CompensationStepComponent } from './setup/steps/compensation/compensation-step.component';
import { PaymentsKycStepComponent } from './setup/steps/payments-kyc/payments-kyc-step.component';
import { ProjectsStepComponent } from './setup/steps/projects/projects-step.component';
import { ReviewLaunchStepComponent } from './setup/steps/review-launch/review-launch-step.component';
import { SettingsShellComponent } from './settings/settings-shell.component';
import { SettingsOverviewComponent } from './settings/settings-overview.component';
import { AuditLogComponent } from './settings/audit-log/audit-log.component';
import { AdminStatsComponent } from './settings/admin-stats/admin-stats.component';
import { AssociateDirectoryComponent } from './admin/associate-directory/associate-directory.component';
import { TreeExplorerComponent } from './admin/tree-explorer/tree-explorer.component';
import { KycQueueComponent } from './admin/kyc-queue/kyc-queue.component';
import { SalesRegisterComponent } from './admin/sales-register/sales-register.component';
import { RecordSaleComponent } from './admin/sales-register/record-sale.component';
import { CycleManagementComponent } from './admin/cycle-management/cycle-management.component';
import { LedgerRegisterComponent } from './admin/ledger-register/ledger-register.component';
import { PayoutApprovalComponent } from './admin/payout-approval/payout-approval.component';
import { SubmitWithdrawalComponent } from './admin/payout-approval/submit-withdrawal.component';
import { TermsOfServiceComponent } from './legal/terms-of-service.component';
import { PrivacyPolicyComponent } from './legal/privacy-policy.component';
import { SalesHistoryComponent } from './sales-history/sales-history.component';
import { MyTreeComponent } from './my-tree/my-tree.component';
import { PlotBookingsComponent } from './plot-bookings/plot-bookings.component';
import { ProfileKycComponent } from './profile-kyc/profile-kyc.component';
import { RewardsComponent } from './rewards/rewards.component';
import { DigitalIdCardComponent } from './digital-id-card/digital-id-card.component';
import { IncomeStatementComponent } from './income-statement/income-statement.component';
import { PayoutHistoryComponent } from './payout-history/payout-history.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent, canActivate: [loginRedirectGuard] },
  { path: 'terms', component: TermsOfServiceComponent },
  { path: 'privacy', component: PrivacyPolicyComponent },
  { path: 'dashboard', component: DashboardComponent, canActivate: [authGuard, associateOnlyGuard] },
  { path: 'sales-history', component: SalesHistoryComponent, canActivate: [authGuard, associateOnlyGuard] },
  { path: 'my-tree', component: MyTreeComponent, canActivate: [authGuard, associateOnlyGuard] },
  { path: 'plot-bookings', component: PlotBookingsComponent, canActivate: [authGuard, associateOnlyGuard] },
  { path: 'profile', component: ProfileKycComponent, canActivate: [authGuard, associateOnlyGuard] },
  { path: 'rewards', component: RewardsComponent, canActivate: [authGuard, associateOnlyGuard] },
  { path: 'digital-id-card', component: DigitalIdCardComponent, canActivate: [authGuard, associateOnlyGuard] },
  { path: 'income-statement', component: IncomeStatementComponent, canActivate: [authGuard, associateOnlyGuard] },
  { path: 'payout-history', component: PayoutHistoryComponent, canActivate: [authGuard, associateOnlyGuard] },
  { path: 'change-password', component: ChangePasswordComponent, canActivate: [authGuard] },
  { path: 'admin/associates/new', component: CreateAssociateComponent, canActivate: [authGuard, adminGuard] },
  { path: 'admin/sales/new', component: RecordSaleComponent, canActivate: [authGuard, adminGuard] },
  { path: 'admin/withdrawals/new', component: SubmitWithdrawalComponent, canActivate: [authGuard, adminGuard] },
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
      { path: 'associate-directory', component: AssociateDirectoryComponent, data: { sectionKey: 'associateDirectory' } },
      { path: 'tree-explorer', component: TreeExplorerComponent, data: { sectionKey: 'treeExplorer' } },
      { path: 'kyc-queue', component: KycQueueComponent, data: { sectionKey: 'kycQueue' } },
      { path: 'sales-register', component: SalesRegisterComponent, data: { sectionKey: 'salesRegister' } },
      { path: 'cycle-management', component: CycleManagementComponent, data: { sectionKey: 'cycleManagement' } },
      { path: 'ledger-register', component: LedgerRegisterComponent, data: { sectionKey: 'ledgerRegister' } },
      { path: 'payout-approval', component: PayoutApprovalComponent, data: { sectionKey: 'payoutApproval' } },
      { path: 'audit-log', component: AuditLogComponent, data: { sectionKey: 'auditLog' } },
      { path: 'admin-stats', component: AdminStatsComponent, data: { sectionKey: 'adminStats' } }
    ]
  },
  { path: '', pathMatch: 'full', canActivate: [authGuard, rootRedirectGuard], children: [] }
];
