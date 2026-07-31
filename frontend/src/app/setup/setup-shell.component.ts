import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { SetupProgressRailComponent } from './setup-progress-rail.component';
import { SetupHeaderComponent } from './setup-header.component';
import { SetupInspectorAsideComponent } from './setup-inspector-aside.component';
import { SetupShellFooterComponent } from './setup-shell-footer.component';
import { SetupService } from './setup.service';

@Component({
  selector: 'app-setup-shell',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    SetupProgressRailComponent,
    SetupHeaderComponent,
    SetupInspectorAsideComponent,
    SetupShellFooterComponent
  ],
  template: `
    <div class="setup-shell">
      <app-setup-header [steps]="(setupService.getState() | async)?.steps ?? []"></app-setup-header>
      <div class="setup-shell__body">
        <app-setup-progress-rail
          [steps]="(setupService.getState() | async)?.steps ?? []"
          [activeStepKey]="activeStepKey"
        ></app-setup-progress-rail>
        <main class="setup-shell__content">
          <router-outlet></router-outlet>
        </main>
        <app-setup-inspector-aside></app-setup-inspector-aside>
      </div>
      <app-setup-shell-footer [previousPath]="previousPath" [nextPath]="nextPath"></app-setup-shell-footer>
    </div>
  `
})
export class SetupShellComponent implements OnInit, OnDestroy {
  protected setupService = inject(SetupService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private navigationSubscription?: Subscription;

  activeStepKey?: string;
  previousPath: string | null = null;
  nextPath: string | null = null;

  ngOnInit(): void {
    this.updateActiveStep();
    this.navigationSubscription = this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        this.updateActiveStep();
      });
  }

  private updateActiveStep(): void {
    this.activeStepKey = this.currentStepKey();
    this.previousPath = this.activeStepKey ? this.setupService.previousStepPath(this.activeStepKey) : null;
    this.nextPath = this.activeStepKey ? this.setupService.nextStepPath(this.activeStepKey) : null;
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
