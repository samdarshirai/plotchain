import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { SettingsNavRailComponent } from './settings-nav-rail.component';

@Component({
  selector: 'app-settings-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, SettingsNavRailComponent],
  template: `
    <div class="settings-shell">
      <app-settings-nav-rail [activeSectionKey]="activeSectionKey"></app-settings-nav-rail>
      <main class="settings-shell__content">
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
