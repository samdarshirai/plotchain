import { Injectable, TemplateRef } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

// Lets a routed step component (a descendant of <router-outlet>) push live template content
// into the shell's right-hand inspector aside (a sibling of <router-outlet>, outside the
// step's own component tree). A step registers its <ng-template> in ngAfterViewInit and
// clears it in ngOnDestroy so the aside falls back to its default state on navigation.
@Injectable({ providedIn: 'root' })
export class SetupInspectorService {
  private readonly templateSubject = new BehaviorSubject<TemplateRef<unknown> | null>(null);
  private readonly savedSubject = new BehaviorSubject<boolean>(false);
  // Defaults to true on register() so existing steps (e.g. company-profile, which puts its own
  // Previous/Next in the aside) keep hiding the shared footer without changing their call site.
  // A step that registers aside content but still wants the shared Previous/Next/Saved bar
  // (e.g. branding, per the Stitch mockup's shared bottom bar) passes { hideFooter: false }.
  private readonly hideFooterSubject = new BehaviorSubject<boolean>(false);

  readonly content$ = this.templateSubject.asObservable();
  readonly saved$ = this.savedSubject.asObservable();
  readonly hideFooter$ = this.hideFooterSubject.asObservable();

  register(template: TemplateRef<unknown>, options?: { hideFooter?: boolean }): void {
    this.templateSubject.next(template);
    this.hideFooterSubject.next(options?.hideFooter ?? true);
  }

  clear(): void {
    this.templateSubject.next(null);
    this.savedSubject.next(false);
    this.hideFooterSubject.next(false);
  }

  setSaved(saved: boolean): void {
    this.savedSubject.next(saved);
  }
}
