import { Component, HostBinding, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { filter, Subscription } from 'rxjs';
import { AuthService } from './auth/auth.service';
import { ADMIN_FAMILY_ROLES } from './admin/admin.guard';
import { AdminSidebarComponent } from './shared/components/admin-sidebar/admin-sidebar.component';
import { AssociateIdentityBarComponent } from './shared/components/associate-identity-bar/associate-identity-bar.component';
import { AssociateSidebarComponent } from './shared/components/associate-sidebar/associate-sidebar.component';

// /setup is a guided, pre-launch-only wizard (setupModeGuard) with its own dedicated
// step-nav -- it stays chromeless (no global chrome) so cross-navigation doesn't undercut the
// focused wizard UX. Every other authenticated route renders the real global chrome.
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, TranslateModule, AdminSidebarComponent, AssociateSidebarComponent, AssociateIdentityBarComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit, OnDestroy {
  authService = inject(AuthService);
  private router = inject(Router);
  private navigationSubscription?: Subscription;

  // Offsets the fixed sidebar/topbar below the sticky banner (see _app-shell.scss).
  @HostBinding('class.impersonation-active') get impersonating(): boolean {
    return this.authService.isImpersonating();
  }

  isSetupRoute = false;
  isChromelessRoute = false;

  // Sidebars are an off-canvas drawer under 768px (see .mobile-drawer in _app-shell.scss).
  navOpen = false;
  isMobile = false;
  private mobileQuery = typeof matchMedia === 'function' ? matchMedia('(max-width: 767px)') : null;
  private onMobileChange = (e: MediaQueryListEvent) => { this.isMobile = e.matches; };

  // Associate sidebar's pin state, owned here (not the sidebar) because .app-content's
  // margin-left needs it too -- see app.component.html's [(pinned)] binding.
  associateSidebarPinned = true;

  get showSidebar(): boolean {
    return this.authService.isAuthenticated() && !this.isChromelessRoute;
  }

  get showAdminChrome(): boolean {
    return this.authService.isAuthenticated() && !this.isChromelessRoute && this.isAdminFamily;
  }

  get isAdminFamily(): boolean {
    const role = this.authService.getRole();
    return role !== null && ADMIN_FAMILY_ROLES.has(role);
  }

  ngOnInit(): void {
    this.isMobile = this.mobileQuery?.matches ?? false;
    this.mobileQuery?.addEventListener('change', this.onMobileChange);
    this.updateSetupRouteState(this.router.url);
    this.navigationSubscription = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(event => {
        this.updateSetupRouteState(event.urlAfterRedirects);
        this.navOpen = false;
      });
  }

  ngOnDestroy(): void {
    this.mobileQuery?.removeEventListener('change', this.onMobileChange);
    this.navigationSubscription?.unsubscribe();
  }

  onExitImpersonation(): void {
    this.authService.exitImpersonation();
    window.close();
    this.router.navigate(['/login']); // reached only if the browser refuses to close this tab
  }

  onLogout(): void {
    const realm = this.authService.currentRealm();
    this.authService.logout(realm);
    this.router.navigate([realm === 'admin' ? '/admin/login' : '/login']);
  }

  private updateSetupRouteState(url: string): void {
    this.isSetupRoute = url.startsWith('/admin/setup');
    this.isChromelessRoute = this.isSetupRoute;
  }
}
