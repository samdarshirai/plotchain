import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ASSOCIATE_NAV_ITEMS } from '../../../associate-nav-items.model';
import { BrandingBootstrapService } from '../../../core/theme/branding-bootstrap.service';

// The Associate app shell's left nav, per DESIGN.md SS4 and the "Header to sidebar conversion"
// mockup (Dashboard Sidebar.dc.html). Pinned (expanded) by default; unpinning collapses it to an
// icon-only rail that still peeks full-width on hover -- but hover alone never moves page content,
// only `pinned` does (see AppComponent's .app-content--sidebar-expanded), matching the mockup's
// contentML (pinned-only) vs navW (pinned-or-hovering) split.
@Component({
  selector: 'app-associate-sidebar',
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
          src="/api/company/branding/logo/square"
          alt=""
        />
        <ng-template #brandFallbackMark>
          <span class="associate-sidebar__brand-mark associate-sidebar__brand-mark--fallback" aria-hidden="true">{{ 'brand.fallbackMark' | translate }}</span>
        </ng-template>
        <span class="associate-sidebar__wordmark" *ngIf="expanded">
          <span class="associate-sidebar__wordmark-name">{{ 'brand.wordmark' | translate }}</span>
          <span class="associate-sidebar__wordmark-tagline">{{ 'brand.caption' | translate }}</span>
        </span>
      </div>

      <div class="associate-sidebar__divider"></div>

      <div class="associate-sidebar__nav">
        <a
          *ngFor="let item of navItems"
          class="associate-sidebar__link"
          routerLinkActive="associate-sidebar__link--active"
          [routerLink]="item.path"
          [title]="item.labelKey | translate"
        >
          <span class="material-symbols-outlined associate-sidebar__link-icon" aria-hidden="true">{{ item.icon }}</span>
          <span class="associate-sidebar__link-label" *ngIf="expanded">{{ item.labelKey | translate }}</span>
        </a>
      </div>

      <div class="associate-sidebar__spacer"></div>

      <div class="associate-sidebar__footer">
        <div class="associate-sidebar__divider associate-sidebar__divider--tight"></div>
        <button
          type="button"
          class="associate-sidebar__pin"
          [class.associate-sidebar__pin--pinned]="pinned"
          [title]="(pinned ? 'sidebar.unpin' : 'sidebar.pin') | translate"
          (click)="togglePin()"
        >
          <span class="material-symbols-outlined associate-sidebar__pin-icon" aria-hidden="true">push_pin</span>
          <span class="associate-sidebar__pin-label" *ngIf="expanded">{{ (pinned ? 'sidebar.unpin' : 'sidebar.pin') | translate }}</span>
        </button>
        <button type="button" class="associate-sidebar__logout" title="{{ 'auth.logout' | translate }}" (click)="logout.emit()">
          <span class="material-symbols-outlined associate-sidebar__link-icon" aria-hidden="true">logout</span>
          <span class="associate-sidebar__logout-label" *ngIf="expanded">{{ 'auth.logout' | translate }}</span>
        </button>
      </div>
    </nav>
  `
})
export class AssociateSidebarComponent {
  private brandingBootstrap = inject(BrandingBootstrapService);

  @Input() pinned = true;
  @Output() pinnedChange = new EventEmitter<boolean>();
  @Output() logout = new EventEmitter<void>();

  readonly navItems = ASSOCIATE_NAV_ITEMS;
  hovering = false;

  get expanded(): boolean {
    return this.pinned || this.hovering;
  }

  get showSquareLogo(): boolean {
    return !!this.brandingBootstrap.getLast()?.hasSquareLogo;
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
}
