import { Routes } from '@angular/router';
import { DashboardComponent } from './dashboard/dashboard.component';
import { LoginComponent } from './auth/login.component';
import { ChangePasswordComponent } from './auth/change-password.component';
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
import { AuditLogComponent } from './settings/audit-log/audit-log.component';
import { AdminStatsComponent } from './settings/admin-stats/admin-stats.component';
import { AdminDashboardComponent } from './admin-dashboard/admin-dashboard.component';
import { AssociateDirectoryComponent } from './admin/associate-directory/associate-directory.component';
import { TreeExplorerComponent } from './admin/tree-explorer/tree-explorer.component';
import { KycQueueComponent } from './admin/kyc-queue/kyc-queue.component';
import { SalesRegisterComponent } from './admin/sales-register/sales-register.component';
import { CycleManagementComponent } from './admin/cycle-management/cycle-management.component';
import { LedgerRegisterComponent } from './admin/ledger-register/ledger-register.component';
import { MasterProjectsComponent } from './admin/master-projects/master-projects.component';
import { AdminUsersComponent } from './admin/admin-users/admin-users.component';
import { EPinRegisterComponent } from './admin/epin-register/epin-register.component';
import { PayoutApprovalComponent } from './admin/payout-approval/payout-approval.component';
import { TermsOfServiceComponent } from './legal/terms-of-service.component';
import { PrivacyPolicyComponent } from './legal/privacy-policy.component';
import { SalesHistoryComponent } from './sales-history/sales-history.component';
import { MyTreeComponent } from './my-tree/my-tree.component';
import { MyAccountComponent } from './my-account/my-account.component';
import { IncomeStatementComponent } from './income-statement/income-statement.component';
import { PayoutHistoryComponent } from './payout-history/payout-history.component';
import { ProjectsPlotsComponent } from './admin/projects-plots/projects-plots.component';
import { epinUnlockGuard } from './epins/register/epin-unlock.guard';

export const routes: Routes = [
  { path: 'login', component: LoginComponent, canActivate: [loginRedirectGuard] },
  { path: 'admin/login', component: LoginComponent, data: { realm: 'admin' }, canActivate: [loginRedirectGuard] },
  { path: 'terms', component: TermsOfServiceComponent },
  { path: 'privacy', component: PrivacyPolicyComponent },
  { path: 'dashboard', component: DashboardComponent, canActivate: [authGuard, associateOnlyGuard] },
  { path: 'plot-bookings/my-sales', component: SalesHistoryComponent, canActivate: [authGuard, associateOnlyGuard] },
  { path: 'sales-history', redirectTo: 'plot-bookings/my-sales' }, // old bookmarks
  { path: 'my-tree', component: MyTreeComponent, canActivate: [authGuard, associateOnlyGuard] },
  { path: 'my-tree/team', loadComponent: () => import('./my-team/my-team.component').then(m => m.MyTeamComponent), canActivate: [authGuard, associateOnlyGuard] },
  // View Plot = the admin Projects & Plots screen in read-only mode; team/left/right are sibling routes
  // sharing one component (data.scope) so the sidebar sub-items are deep-linkable.
  { path: 'plot-bookings', loadComponent: () => import('./admin/projects-plots/projects-plots.component').then(m => m.ProjectsPlotsComponent), data: { readOnly: true }, canActivate: [authGuard, associateOnlyGuard] },
  { path: 'plot-bookings/team', loadComponent: () => import('./plot-bookings/team-plot-bookings.component').then(m => m.TeamPlotBookingsComponent), data: { scope: 'TEAM' }, canActivate: [authGuard, associateOnlyGuard] },
  { path: 'plot-bookings/left', loadComponent: () => import('./plot-bookings/team-plot-bookings.component').then(m => m.TeamPlotBookingsComponent), data: { scope: 'LEFT' }, canActivate: [authGuard, associateOnlyGuard] },
  { path: 'plot-bookings/mine', loadComponent: () => import('./plot-bookings/my-bookings.component').then(m => m.MyBookingsComponent), canActivate: [authGuard, associateOnlyGuard] },
  { path: 'plot-bookings/right', loadComponent: () => import('./plot-bookings/team-plot-bookings.component').then(m => m.TeamPlotBookingsComponent), data: { scope: 'RIGHT' }, canActivate: [authGuard, associateOnlyGuard] },
  // e-Pin Register: three screens sharing one component (data.mode), each behind the transaction
  // password via epinUnlockGuard (token from POST /api/associates/me/epins/unlock).
  { path: 'e-pins', pathMatch: 'full', redirectTo: 'e-pins/view-new' },
  { path: 'e-pins/unlock', loadComponent: () => import('./epins/register/epin-unlock.component').then(m => m.EPinUnlockComponent), canActivate: [authGuard, associateOnlyGuard] },
  { path: 'e-pins/join/:pinId', loadComponent: () => import('./epins/register/epin-join.component').then(m => m.EPinJoinComponent), canActivate: [authGuard, associateOnlyGuard, epinUnlockGuard] },
  { path: 'e-pins/view-new', loadComponent: () => import('./epins/register/epin-register.component').then(m => m.EPinRegisterComponent), data: { mode: 'new' }, canActivate: [authGuard, associateOnlyGuard, epinUnlockGuard] },
  { path: 'e-pins/transfer', loadComponent: () => import('./epins/register/epin-register.component').then(m => m.EPinRegisterComponent), data: { mode: 'transfer' }, canActivate: [authGuard, associateOnlyGuard, epinUnlockGuard] },
  { path: 'e-pins/view-used', loadComponent: () => import('./epins/register/epin-register.component').then(m => m.EPinRegisterComponent), data: { mode: 'used' }, canActivate: [authGuard, associateOnlyGuard, epinUnlockGuard] },
  // Merged into one "My Account" screen (Account Consolidation.dc.html) -- /rewards and
  // /digital-id-card redirect here so old bookmarks/links keep working. Split into 4 sibling
  // routes (Welcome Letter, Profile, Bank Details, KYC Details), all rendering the same
  // MyAccountComponent with a different `data.tab`, so the sidebar's My Account sub-items are
  // real, deep-linkable, back/forward-safe URLs (docs/superpowers/plans/
  // can-you-break-down-vectorized-dongarra.md) -- same MyAccountComponent instance is reused
  // across these sibling routes by Angular, so the component reads `data.tab` reactively
  // (ActivatedRoute.data subscription), not just once on init.
  { path: 'profile', component: MyAccountComponent, data: { tab: 'profile' }, canActivate: [authGuard, associateOnlyGuard] },
  { path: 'profile/welcome-letter', component: MyAccountComponent, data: { tab: 'welcomeLetter' }, canActivate: [authGuard, associateOnlyGuard] },
  { path: 'profile/bank-details', component: MyAccountComponent, data: { tab: 'bankDetails' }, canActivate: [authGuard, associateOnlyGuard] },
  { path: 'profile/kyc', component: MyAccountComponent, data: { tab: 'kyc' }, canActivate: [authGuard, associateOnlyGuard] },
  { path: 'rewards', redirectTo: 'profile' },
  { path: 'digital-id-card', redirectTo: 'profile' },
  // Sibling routes sharing one component; data.incomeType replaces the old in-page tab bar so
  // the sidebar's Income Statement sub-items are deep-linkable.
  { path: 'income-statement', component: IncomeStatementComponent, data: { incomeType: 'ALL' }, canActivate: [authGuard, associateOnlyGuard] },
  { path: 'income-statement/direct', component: IncomeStatementComponent, data: { incomeType: 'DIRECT' }, canActivate: [authGuard, associateOnlyGuard] },
  { path: 'income-statement/matching', component: IncomeStatementComponent, data: { incomeType: 'MATCHING' }, canActivate: [authGuard, associateOnlyGuard] },
  { path: 'income-statement/sponsor-matching', component: IncomeStatementComponent, data: { incomeType: 'SPONSOR_MATCHING' }, canActivate: [authGuard, associateOnlyGuard] },
  { path: 'income-statement/royalty', component: IncomeStatementComponent, data: { incomeType: 'ROYALTY' }, canActivate: [authGuard, associateOnlyGuard] },
  { path: 'income-statement/reward', component: IncomeStatementComponent, data: { incomeType: 'REWARD' }, canActivate: [authGuard, associateOnlyGuard] },
  { path: 'reports/my-business', loadComponent: () => import('./reports/my-business-report.component').then(m => m.MyBusinessReportComponent), canActivate: [authGuard, associateOnlyGuard] },
  { path: 'reports/emi', loadComponent: () => import('./reports/emi-report.component').then(m => m.EmiReportComponent), canActivate: [authGuard, associateOnlyGuard] },
  { path: 'payout-history', component: PayoutHistoryComponent, canActivate: [authGuard, associateOnlyGuard] },
  { path: 'support-tickets', redirectTo: 'messages', pathMatch: 'full' },
  { path: 'messages/new', loadComponent: () => import('./support-ticket-history/new-message.component').then(m => m.NewMessageComponent), canActivate: [authGuard, associateOnlyGuard] },
  { path: 'messages', loadComponent: () => import('./support-ticket-history/support-ticket-history.component').then(m => m.SupportTicketHistoryComponent), canActivate: [authGuard, associateOnlyGuard] },
  { path: 'change-password', component: ChangePasswordComponent, canActivate: [authGuard] },
  { path: 'admin/change-password', component: ChangePasswordComponent, canActivate: [authGuard] },
  { path: 'admin/dashboard', component: AdminDashboardComponent, canActivate: [authGuard, adminGuard, launchedModeGuard] },
  {
    path: 'admin/setup',
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
    path: 'admin/settings',
    component: SettingsShellComponent,
    canActivate: [authGuard, adminGuard, launchedModeGuard],
    children: [
      { path: 'company-profile', component: CompanyProfileStepComponent, data: { sectionKey: 'companyProfile', mode: 'settings' } },
      { path: 'branding', component: BrandingStepComponent, data: { sectionKey: 'branding', mode: 'settings' } },
      { path: 'compensation', component: CompensationStepComponent, data: { sectionKey: 'compensation', mode: 'settings' } },
      { path: 'payments-kyc', component: PaymentsKycStepComponent, data: { sectionKey: 'paymentsKyc', mode: 'settings' } },
      { path: 'associate-directory', component: AssociateDirectoryComponent, data: { sectionKey: 'associateDirectory' } },
      { path: 'tree-explorer', component: TreeExplorerComponent, data: { sectionKey: 'treeExplorer' } },
      { path: 'kyc-queue', component: KycQueueComponent, data: { sectionKey: 'kycQueue' } },
      { path: 'sales-register', component: SalesRegisterComponent, data: { sectionKey: 'salesRegister' } },
      { path: 'cycle-management', component: CycleManagementComponent, data: { sectionKey: 'cycleManagement' } },
      { path: 'ledger-register', component: LedgerRegisterComponent, data: { sectionKey: 'ledgerRegister' } },
      { path: 'e-pin-register', component: EPinRegisterComponent, data: { sectionKey: 'epinRegister' } },
      { path: 'payout-approval', component: PayoutApprovalComponent, data: { sectionKey: 'payoutApproval' } },
      { path: 'admin-users', component: AdminUsersComponent, data: { sectionKey: 'adminUsers' } },
      { path: 'master-projects', component: MasterProjectsComponent, data: { sectionKey: 'masterProjects' } },
      { path: 'projects-plots', redirectTo: 'plots', pathMatch: 'full' },
      { path: 'plots', component: ProjectsPlotsComponent, data: { sectionKey: 'projectsPlots' } },
      { path: 'book-plot', component: ProjectsPlotsComponent, data: { sectionKey: 'projectsPlots', bookMode: true } },
      { path: 'audit-log', component: AuditLogComponent, data: { sectionKey: 'auditLog' } },
      { path: 'admin-stats', component: AdminStatsComponent, data: { sectionKey: 'adminStats' } },
      { path: 'support-tickets', loadComponent: () => import('./admin/admin-support-tickets/admin-support-tickets.component').then(m => m.AdminSupportTicketsComponent), data: { sectionKey: 'supportTickets' } },
      { path: 'add-plot-emi', loadComponent: () => import('./admin/add-plot-emi/add-plot-emi.component').then(m => m.AddPlotEmiComponent), data: { sectionKey: 'addPlotEmi' } },
      { path: 'view-booked-plot', loadComponent: () => import('./admin/view-booked-plot/view-booked-plot.component').then(m => m.ViewBookedPlotComponent), data: { sectionKey: 'viewBookedPlot' } },
      { path: 'plot-transfer', loadComponent: () => import('./admin/plot-transfer/plot-transfer.component').then(m => m.PlotTransferComponent), data: { sectionKey: 'plotTransfer' } },
      { path: 'view-plot-emi', loadComponent: () => import('./admin/view-plot-emi/view-plot-emi.component').then(m => m.ViewPlotEmiComponent), data: { sectionKey: 'viewPlotEmi' } },
      { path: 'view-cancelled-plot', loadComponent: () => import('./admin/view-cancelled-plot/view-cancelled-plot.component').then(m => m.ViewCancelledPlotComponent), data: { sectionKey: 'viewCancelledPlot' } },
      { path: 'view-transferred-plot', loadComponent: () => import('./admin/view-transferred-plot/view-transferred-plot.component').then(m => m.ViewTransferredPlotComponent), data: { sectionKey: 'viewTransferredPlot' } },
      { path: 'view-confirmed-plot', loadComponent: () => import('./admin/view-confirmed-plot/view-confirmed-plot.component').then(m => m.ViewConfirmedPlotComponent), data: { sectionKey: 'viewConfirmedPlot' } },
      { path: 'expense-types', loadComponent: () => import('./admin/expense-types/expense-types.component').then(m => m.ExpenseTypesComponent), data: { sectionKey: 'expenseTypes' } },
      { path: 'payment-details/receipt/:id', loadComponent: () => import('./admin/invoice/payment-details/payment-receipt.component').then(m => m.PaymentReceiptComponent), data: { sectionKey: 'paymentDetails' } },
      { path: 'payment-details', loadComponent: () => import('./admin/invoice/payment-details/payment-details.component').then(m => m.PaymentDetailsComponent), data: { sectionKey: 'paymentDetails' } },
      { path: 'invoice-expenses', loadComponent: () => import('./admin/invoice/expenses/expenses.component').then(m => m.ExpensesComponent), data: { sectionKey: 'invoiceExpenses' } },
      { path: 'advance-loans', loadComponent: () => import('./admin/invoice/advance-loans/advance-loans.component').then(m => m.AdvanceLoansComponent), data: { sectionKey: 'advanceLoans' } },
      { path: 'news', loadComponent: () => import('./admin/news/news.component').then(m => m.NewsComponent), data: { sectionKey: 'news' } },
      // There is no settings hub screen any more -- every entry point (a header category tab, an
      // item pill) targets a specific screen. Bare /settings is only reachable from an old
      // bookmark, so it lands on the first category's first item, the same shape /setup uses.
      { path: '', redirectTo: 'company-profile', pathMatch: 'full' }
    ]
  },
  // old admin bookmarks (relative redirects keep the remaining segments)
  { path: 'setup', redirectTo: 'admin/setup' },
  { path: 'settings', redirectTo: 'admin/settings' },
  { path: '', pathMatch: 'full', canActivate: [rootRedirectGuard], children: [] }
];
