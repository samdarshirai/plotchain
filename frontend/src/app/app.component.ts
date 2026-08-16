import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { filter, Subscription } from 'rxjs';
import { AuthService } from './auth/auth.service';
import { ADMIN_FAMILY_ROLES } from './admin/admin.guard';
import { BrandingBootstrapService } from './core/theme/branding-bootstrap.service';

// /setup is a guided, pre-launch-only wizard (setupModeGuard) with its own dedicated
// step-nav -- it stays chromeless (no global header) so cross-navigation doesn't undercut the
// focused wizard UX. /admin/associates/new used to be chromeless too, back when the app's
// default theme was dark and this route's light theme would have clashed with a dark header;
// now that light is the app's single global theme (see _tokens.scss), that clash no longer
// exists, so this route renders the real global header like every other authenticated route.
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, TranslateModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit, OnDestroy {
  authService = inject(AuthService);
  private router = inject(Router);
  private document = inject(DOCUMENT);
  private brandingBootstrap = inject(BrandingBootstrapService);
  private navigationSubscription?: Subscription;

  isSetupRoute = false;
  isChromelessRoute = false;

  get isAdminFamily(): boolean {
    const role = this.authService.getRole();
    return role !== null && ADMIN_FAMILY_ROLES.has(role);
  }

  // Same source Login reads (see LoginComponent.ngOnInit) so the header's brand mark and the
  // login screen's brand aside never drift apart.
  get showSquareLogo(): boolean {
    return !!this.brandingBootstrap.getLast()?.hasSquareLogo;
  }

  ngOnInit(): void {
    this.updateSetupRouteState(this.router.url);
    this.navigationSubscription = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(event => this.updateSetupRouteState(event.urlAfterRedirects));
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
    // Still toggled for _admin.scss's hidden-scrollbar rule, even though this route is no
    // longer chromeless.
    this.document.body.classList.toggle('admin-associate-active', url.startsWith('/admin/associates/new'));
    this.isChromelessRoute = this.isSetupRoute;
  }
}
