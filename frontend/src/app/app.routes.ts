import { Routes } from '@angular/router';
import { DashboardComponent } from './dashboard/dashboard.component';
import { LoginComponent } from './auth/login.component';
import { ChangePasswordComponent } from './auth/change-password.component';
import { CreateAssociateComponent } from './admin/create-associate.component';
import { authGuard } from './auth/auth.guard';
import { adminGuard } from './admin/admin.guard';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'dashboard', component: DashboardComponent, canActivate: [authGuard] },
  { path: 'change-password', component: ChangePasswordComponent, canActivate: [authGuard] },
  { path: 'admin/associates/new', component: CreateAssociateComponent, canActivate: [authGuard, adminGuard] },
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' }
];
