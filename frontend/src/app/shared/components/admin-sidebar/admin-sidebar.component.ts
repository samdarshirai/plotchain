import { apiUrl } from '../../../core/api/api-url';
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { filter, Subscription } from 'rxjs';
import { AuthService } from '../../../auth/auth.service';
import { ADMIN_NAV_CATEGORIES, AdminNavCategory, AdminNavItem, ADMIN_USERS_NAV_ITEM, findNavCategoryForUrl } from '../../../admin-nav-categories.model';
import { BrandingBootstrapService } from '../../../core/theme/branding-bootstrap.service';

// Admin-family left nav. Pins/unpins like AssociateSidebarComponent (pin button by the logo; unpinned =
// icon rail that peeks full width on hover) and deliberately reuses its .associate-sidebar__* styles so
// the two sidebars stay visually identical.
// Each category is an accordion: closed until clicked, except the one owning the current URL, which
// opens on every navigation (so deep links and Back show where you are). Only one group is open at a time.
@Component({
  selector: 'app-admin-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, TranslateModule],
  template: `
    <nav
      class="associate-sidebar"
      [class.associate-sidebar--expanded]="expanded"
      (mouseenter)="onEnter()"
      (mouseleave)="onLeave()"
    >
      <div class="associate-sidebar__brand">
        <img
          *ngIf="showSquareLogo; else brandFallbackMark"
          class="associate-sidebar__brand-mark"
          [src]="logoSrc"
          alt=""
        />
        <ng-template #brandFallbackMark>
          <span class="associate-sidebar__brand-mark associate-sidebar__brand-mark--fallback" aria-hidden="true">{{ 'brand.fallbackMark' | translate }}</span>
        </ng-template>
        <span class="associate-sidebar__wordmark" *ngIf="expanded">
          <span class="associate-sidebar__wordmark-name">{{ 'brand.wordmark' | translate }}</span>
          <span class="associate-sidebar__wordmark-tagline">{{ 'brand.caption' | translate }}</span>
        </span>
        <button
          *ngIf="!forceExpanded && expanded"
          type="button"
          class="associate-sidebar__pin associate-sidebar__pin--brand"
          [class.associate-sidebar__pin--pinned]="pinned"
          [title]="(pinned ? 'sidebar.unpin' : 'sidebar.pin') | translate"
          [attr.aria-label]="(pinned ? 'sidebar.unpin' : 'sidebar.pin') | translate"
          (click)="togglePin()"
        >
          <span class="material-symbols-outlined associate-sidebar__pin-icon" aria-hidden="true">push_pin</span>
        </button>
      </div>

      <div class="associate-sidebar__divider"></div>

      <div class="associate-sidebar__nav">
        <a class="associate-sidebar__link" routerLink="/admin/dashboard" routerLinkActive="associate-sidebar__link--active" [title]="'nav.dashboard' | translate">
          <span class="material-symbols-outlined associate-sidebar__link-icon" aria-hidden="true">dashboard</span>
          <span class="associate-sidebar__link-label" *ngIf="expanded">{{ 'nav.dashboard' | translate }}</span>
        </a>
        <a class="associate-sidebar__link" [routerLink]="adminUsers.path" routerLinkActive="associate-sidebar__link--active" [title]="adminUsers.labelKey | translate">
          <span class="material-symbols-outlined associate-sidebar__link-icon" aria-hidden="true">manage_accounts</span>
          <span class="associate-sidebar__link-label" *ngIf="expanded">{{ adminUsers.labelKey | translate }}</span>
        </a>
        <ng-container *ngFor="let category of categories">
          <button
            type="button"
            class="associate-sidebar__link associate-sidebar__group-toggle"
            [attr.aria-expanded]="isOpen(category.key)"
            [title]="category.labelKey | translate"
            (click)="toggle(category.key)"
          >
            <span class="material-symbols-outlined associate-sidebar__link-icon" aria-hidden="true">{{ category.icon }}</span>
            <span class="associate-sidebar__link-label" *ngIf="expanded">{{ category.labelKey | translate }}</span>
            <span class="material-symbols-outlined associate-sidebar__chevron" [class.associate-sidebar__chevron--open]="isOpen(category.key)" *ngIf="expanded" aria-hidden="true">expand_more</span>
          </button>
          <div class="associate-sidebar__subnav" *ngIf="expanded && isOpen(category.key)">
            <a
              *ngFor="let item of visibleItems(category)"
              class="associate-sidebar__sublink"
              routerLinkActive="associate-sidebar__sublink--active"
              [routerLinkActiveOptions]="{ paths: 'exact', queryParams: 'exact', fragment: 'ignored', matrixParams: 'ignored' }"
              [routerLink]="item.path"
              [queryParams]="item.query"
            >
              <span class="associate-sidebar__sublink-label">{{ item.labelKey | translate }}</span>
            </a>
          </div>
        </ng-container>
      </div>

      <div class="associate-sidebar__spacer"></div>

      <div class="associate-sidebar__footer">
        <div class="associate-sidebar__divider associate-sidebar__divider--tight"></div>
        <button type="button" class="associate-sidebar__logout" [title]="'auth.logout' | translate" (click)="logout.emit()">
          <span class="material-symbols-outlined associate-sidebar__link-icon" aria-hidden="true">logout</span>
          <span class="associate-sidebar__logout-label" *ngIf="expanded">{{ 'auth.logout' | translate }}</span>
        </button>
      </div>
    </nav>
  `
})
export class AdminSidebarComponent implements OnInit, OnDestroy {
  readonly logoSrc = apiUrl('/api/company/branding/logo/square');
  private router = inject(Router);
  private brandingBootstrap = inject(BrandingBootstrapService);
  private navigationSubscription?: Subscription;

  @Input() pinned = true;
  // Phone drawer: always full width with labels, and pinning is meaningless.
  @Input() forceExpanded = false;
  @Output() pinnedChange = new EventEmitter<boolean>();
  @Output() logout = new EventEmitter<void>();
  hovering = false;

  get expanded(): boolean {
    return this.forceExpanded || this.pinned || this.hovering;
  }

  togglePin(): void {
    this.pinned = !this.pinned;
    this.pinnedChange.emit(this.pinned);
  }

  onEnter(): void {
    this.hovering = true;
  }

  onLeave(): void {
    this.hovering = false;
  }

  private isManager = inject(AuthService).getRole() === 'MANAGER';
  readonly categories = ADMIN_NAV_CATEGORIES;

  visibleItems(category: AdminNavCategory): AdminNavItem[] {
    return this.isManager ? category.items.filter(item => !item.adminOnly) : category.items;
  }
  readonly adminUsers = ADMIN_USERS_NAV_ITEM;
  private openKey: string | null = null;

  get showSquareLogo(): boolean {
    return !!this.brandingBootstrap.getLast()?.hasSquareLogo;
  }

  ngOnInit(): void {
    this.openOwnerOf(this.router.url);
    // urlAfterRedirects, not url: /settings redirects to /settings/company-profile.
    this.navigationSubscription = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(event => this.openOwnerOf(event.urlAfterRedirects));
  }

  ngOnDestroy(): void {
    this.navigationSubscription?.unsubscribe();
  }

  isOpen(key: string): boolean {
    return this.openKey === key;
  }

  toggle(key: string): void {
    this.openKey = this.openKey === key ? null : key;
  }

  private openOwnerOf(url: string): void {
    const owner = findNavCategoryForUrl(url);
    if (owner) {
      this.openKey = owner.key;
    }
  }
}
