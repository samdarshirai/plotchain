import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { AuthService } from './auth/auth.service';
import { ADMIN_FAMILY_ROLES } from './admin/admin.guard';
import { AdminSidebarComponent } from './shared/components/admin-sidebar/admin-sidebar.component';
import { AssociateSidebarComponent } from './shared/components/associate-sidebar/associate-sidebar.component';

// /setup is a guided, pre-launch-only wizard (setupModeGuard) with its own dedicated
// step-nav -- it stays chromeless (no global chrome) so cross-navigation doesn't undercut the
// focused wizard UX. Every other authenticated route renders the real global chrome.
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, AdminSidebarComponent, AssociateSidebarComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit, OnDestroy {
  authService = inject(AuthService);
  private router = inject(Router);
  private navigationSubscription?: Subscription;

  isSetupRoute = false;
  isChromelessRoute = false;

  // Associate sidebar's pin state, owned here (not the sidebar) because .app-content's
  // margin-left needs it too -- see app.component.html's [(pinned)] binding.
  associateSidebarPinned = true;

  get isAdminFamily(): boolean {
    const role = this.authService.getRole();
    return role !== null && ADMIN_FAMILY_ROLES.has(role);
  }

  ngOnInit(): void {
    this.updateSetupRouteState(this.router.url);
    this.navigationSubscription = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(event => {
        this.updateSetupRouteState(event.urlAfterRedirects);
      });
  }

  ngOnDestroy(): void {
    this.navigationSubscription?.unsubscribe();
  }

  onLogout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  private updateSetupRouteState(url: string): void {
    this.isSetupRoute = url.startsWith('/setup');
    this.isChromelessRoute = this.isSetupRoute;
  }
}
