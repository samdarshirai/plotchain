import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { filter, Subscription } from 'rxjs';
import { AuthService } from './auth/auth.service';
import { ADMIN_FAMILY_ROLES } from './admin/admin.guard';
import { BrandingBootstrapService } from './core/theme/branding-bootstrap.service';
import { ADMIN_NAV_CATEGORIES, AdminNavCategory, findNavCategoryForUrl } from './admin-nav-categories.model';

// /setup is a guided, pre-launch-only wizard (setupModeGuard) with its own dedicated
// step-nav -- it stays chromeless (no global header) so cross-navigation doesn't undercut the
// focused wizard UX. Every other authenticated route renders the real global header.
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
  private brandingBootstrap = inject(BrandingBootstrapService);
  private navigationSubscription?: Subscription;

  isSetupRoute = false;
  isChromelessRoute = false;

  // Header category tabs (admin-family only) and the item-tab row they expand into. Both read the
  // same ADMIN_NAV_CATEGORIES data; activeNavCategory is recomputed from the URL on every
  // navigation and is the single thing that decides which tab is lit and which items are listed.
  readonly navCategories = ADMIN_NAV_CATEGORIES;
  activeNavCategory?: AdminNavCategory;

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
    this.activeNavCategory = findNavCategoryForUrl(this.router.url);
    this.navigationSubscription = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(event => {
        this.updateSetupRouteState(event.urlAfterRedirects);
        // urlAfterRedirects, not url: /settings redirects to /settings/company-profile, and it's
        // the destination that owns a category.
        this.activeNavCategory = findNavCategoryForUrl(event.urlAfterRedirects);
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
