import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, Subscription } from 'rxjs';

// Settings has no chrome of its own: navigation between the 14 screens is the global header's
// category tabs plus the item-tab row underneath it (see app.component.html and
// admin-nav-categories.model.ts), per
// docs/design/viraj_acres_settings_mockup/Viraj_Acres_Settings.dc.html. What is left here is the
// content column -- the mockup's 40px/48px padded, uncapped column by default, or full-bleed (no
// padding) for Tree Explorer's edge-to-edge canvas.
@Component({
  selector: 'app-settings-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet],
  template: `
    <div class="settings-shell">
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
