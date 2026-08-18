import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, Subscription } from 'rxjs';

// The nav rail this shell used to render alongside router-outlet is gone -- section navigation
// now lives in the global header's category/item pill rows (see app.component.html and
// admin-nav-categories.model.ts). This shell's only remaining job is content layout: a centered
// reading column by default, full-bleed for screens (Tree Explorer) that need the whole width.
@Component({
  selector: 'app-settings-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet],
  template: `
    <main class="settings-shell__content" [class.settings-shell__content--full]="activeSectionKey === 'treeExplorer'">
      <router-outlet></router-outlet>
    </main>
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
