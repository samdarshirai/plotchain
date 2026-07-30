import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { SetupProgressRailComponent } from './setup-progress-rail.component';
import { SetupService } from './setup.service';

@Component({
  selector: 'app-setup-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, SetupProgressRailComponent],
  template: `
    <div class="setup-shell">
      <app-setup-progress-rail
        [steps]="(setupService.getState() | async)?.steps ?? []"
        [activeStepKey]="activeStepKey"
      ></app-setup-progress-rail>
      <main class="setup-shell__content">
        <router-outlet></router-outlet>
      </main>
    </div>
  `
})
export class SetupShellComponent implements OnInit, OnDestroy {
  protected setupService = inject(SetupService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private navigationSubscription?: Subscription;

  activeStepKey?: string;

  ngOnInit(): void {
    this.activeStepKey = this.currentStepKey();
    this.navigationSubscription = this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        this.activeStepKey = this.currentStepKey();
      });
  }

  ngOnDestroy(): void {
    this.navigationSubscription?.unsubscribe();
  }

  private currentStepKey(): string | undefined {
    let child = this.route.firstChild;
    while (child?.firstChild) {
      child = child.firstChild;
    }
    return child?.snapshot.data['stepKey'];
  }
}
