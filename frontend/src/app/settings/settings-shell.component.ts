import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, Subscription } from 'rxjs';

// The nav rail this shell used to render alongside router-outlet is gone -- section navigation
// now lives in the global header's category/item pill rows (see app.component.html and
// admin-nav-categories.model.ts). This shell's only remaining job is content layout: a centered
// reading column by default, full-bleed (no padding, no max-width) for Tree Explorer's edge-to-edge
// canvas, or a wider-but-still-padded column for Payments & KYC's 2fr/1fr card grid, which needs
// more than the 960px reading column gives every other Settings screen (mockup-parity fix: at
// normal type scale -- see payments-kyc-step.component.ts's mode==='settings' width toggle -- the
// 960px column truncated Payout Account/Withdrawal Approval field values).
@Component({
  selector: 'app-settings-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet],
  template: `
    <main
      class="settings-shell__content"
      [class.settings-shell__content--full]="activeSectionKey === 'treeExplorer'"
      [class.settings-shell__content--wide]="activeSectionKey === 'paymentsKyc'"
    >
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
