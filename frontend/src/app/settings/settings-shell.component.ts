import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { filter, Subscription } from 'rxjs';
import { SETTINGS_NAV_ITEMS } from './models/settings-nav.model';

// Settings is a sidebar + content pair (see
// docs/design/viraj_acres_settings_mockup/Viraj_Acres_Settings.dc.html): a flat 230px rail listing
// all 14 settings screens, no category grouping. Living here rather than in the global header means
// the rail renders exactly when a /settings route is active and nowhere else -- the Dashboard has no
// sidebar -- without the shell having to sniff the URL for it.
//
// The content column is the mockup's padded 1240px column by default, or full-bleed (no padding, no
// max-width) for Tree Explorer's edge-to-edge canvas.
@Component({
  selector: 'app-settings-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, TranslateModule],
  template: `
    <div class="settings-shell">
      <nav class="settings-shell__sidebar">
        <a
          *ngFor="let item of navItems"
          class="settings-shell__nav-link"
          [routerLink]="item.path"
          routerLinkActive="settings-shell__nav-link--active"
        >{{ item.labelKey | translate }}</a>
      </nav>

      <main
        class="settings-shell__content"
        [class.settings-shell__content--full]="activeSectionKey === 'treeExplorer'"
      >
        <router-outlet></router-outlet>
      </main>
    </div>
  `
})
export class SettingsShellComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private navigationSubscription?: Subscription;

  readonly navItems = SETTINGS_NAV_ITEMS;
  activeSectionKey?: string;

  ngOnInit(): void {
    this.activeSectionKey = this.currentSectionKey();
    this.navigationSubscription = this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        this.activeSectionKey = this.currentSectionKey();
      });
  }

  ngOnDestroy(): void {
    this.navigationSubscription?.unsubscribe();
  }

  private currentSectionKey(): string | undefined {
    let child = this.route.firstChild;
    while (child?.firstChild) {
      child = child.firstChild;
    }
    return child?.snapshot.data['sectionKey'];
  }
}
