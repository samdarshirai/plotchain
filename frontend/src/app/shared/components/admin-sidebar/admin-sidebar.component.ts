import { Component, EventEmitter, OnDestroy, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { filter, Subscription } from 'rxjs';
import { ADMIN_NAV_CATEGORIES, findNavCategoryForUrl } from '../../../admin-nav-categories.model';
import { BrandingBootstrapService } from '../../../core/theme/branding-bootstrap.service';

// Admin-family left nav. Always full width (no rail/pin, unlike AssociateSidebarComponent) and
// deliberately reuses its .associate-sidebar__* styles so the two sidebars stay visually identical.
// Each category is an accordion: closed until clicked, except the one owning the current URL, which
// opens on every navigation (so deep links and Back show where you are). Groups open independently.
@Component({
  selector: 'app-admin-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, TranslateModule],
  template: `
    <nav class="associate-sidebar associate-sidebar--expanded">
      <div class="associate-sidebar__brand">
        <img
          *ngIf="showSquareLogo; else brandFallbackMark"
          class="associate-sidebar__brand-mark"
          src="/api/company/branding/logo/square"
          alt=""
        />
        <ng-template #brandFallbackMark>
          <span class="associate-sidebar__brand-mark associate-sidebar__brand-mark--fallback" aria-hidden="true">{{ 'brand.fallbackMark' | translate }}</span>
        </ng-template>
        <span class="associate-sidebar__wordmark">
          <span class="associate-sidebar__wordmark-name">{{ 'brand.wordmark' | translate }}</span>
          <span class="associate-sidebar__wordmark-tagline">{{ 'brand.caption' | translate }}</span>
        </span>
      </div>

      <div class="associate-sidebar__divider"></div>

      <div class="associate-sidebar__nav">
        <a class="associate-sidebar__link" routerLink="/admin/dashboard" routerLinkActive="associate-sidebar__link--active">
          <span class="material-symbols-outlined associate-sidebar__link-icon" aria-hidden="true">dashboard</span>
          <span class="associate-sidebar__link-label">{{ 'nav.dashboard' | translate }}</span>
        </a>
        <ng-container *ngFor="let category of categories">
          <button
            type="button"
            class="associate-sidebar__link associate-sidebar__group-toggle"
            [attr.aria-expanded]="isOpen(category.key)"
            (click)="toggle(category.key)"
          >
            <span class="material-symbols-outlined associate-sidebar__link-icon" aria-hidden="true">{{ category.icon }}</span>
            <span class="associate-sidebar__link-label">{{ category.labelKey | translate }}</span>
            <span class="material-symbols-outlined associate-sidebar__chevron" [class.associate-sidebar__chevron--open]="isOpen(category.key)" aria-hidden="true">expand_more</span>
          </button>
          <div class="associate-sidebar__subnav" *ngIf="isOpen(category.key)">
            <a
              *ngFor="let item of category.items"
              class="associate-sidebar__sublink"
              routerLinkActive="associate-sidebar__sublink--active"
              [routerLink]="item.path"
            >
              <span class="associate-sidebar__sublink-label">{{ item.labelKey | translate }}</span>
            </a>
          </div>
        </ng-container>
      </div>

      <div class="associate-sidebar__spacer"></div>

      <div class="associate-sidebar__footer">
        <div class="associate-sidebar__divider associate-sidebar__divider--tight"></div>
        <button type="button" class="associate-sidebar__logout" (click)="logout.emit()">
          <span class="material-symbols-outlined associate-sidebar__link-icon" aria-hidden="true">logout</span>
          <span class="associate-sidebar__logout-label">{{ 'auth.logout' | translate }}</span>
        </button>
      </div>
    </nav>
  `
})
export class AdminSidebarComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private brandingBootstrap = inject(BrandingBootstrapService);
  private navigationSubscription?: Subscription;

  @Output() logout = new EventEmitter<void>();

  readonly categories = ADMIN_NAV_CATEGORIES;
  private readonly open = new Set<string>();

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
    return this.open.has(key);
  }

  toggle(key: string): void {
    if (!this.open.delete(key)) {
      this.open.add(key);
    }
  }

  private openOwnerOf(url: string): void {
    const owner = findNavCategoryForUrl(url);
    if (owner) {
      this.open.add(owner.key);
    }
  }
}
