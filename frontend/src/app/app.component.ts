import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { filter, Subscription } from 'rxjs';
import { AuthService } from './auth/auth.service';

// /setup and /admin/associates/new are fully light-themed (see _setup-theme.scss and
// _admin.scss), but those overrides are scoped to their own root class -- neither can reach
// this component's own dark app-header (a sibling, not an ancestor) or <body>'s default dark
// background (an ancestor, so inheritance doesn't flow to it). Both are handled here instead:
// the header is removed from the DOM entirely on these chromeless routes, and a body class
// carries the same light tokens so there's no dark edge/gap around the page.
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, TranslateModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit, OnDestroy {
  authService = inject(AuthService);
  private router = inject(Router);
  private document = inject(DOCUMENT);
  private navigationSubscription?: Subscription;

  isSetupRoute = false;
  isChromelessRoute = false;

  ngOnInit(): void {
    this.updateSetupRouteState(this.router.url);
    this.navigationSubscription = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(event => this.updateSetupRouteState(event.urlAfterRedirects));
  }

  ngOnDestroy(): void {
    this.navigationSubscription?.unsubscribe();
  }

  onLogout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  private updateSetupRouteState(url: string): void {
    this.isSetupRoute = url.startsWith('/setup');
    this.document.body.classList.toggle('setup-active', this.isSetupRoute);
    const isAdminAssociateRoute = url.startsWith('/admin/associates/new');
    this.document.body.classList.toggle('admin-associate-active', isAdminAssociateRoute);
    this.isChromelessRoute = this.isSetupRoute || isAdminAssociateRoute;
    // /login never shows the app-header (it only renders once authenticated), so it just needs
    // the body background flipped light -- no header/DOM removal to handle here.
    this.document.body.classList.toggle('login-active', url.startsWith('/login'));
  }
}
