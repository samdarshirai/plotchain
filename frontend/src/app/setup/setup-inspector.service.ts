import { Injectable, TemplateRef } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

// Minimal surface a routed step component exposes so SetupStepNavComponent -- which lives
// outside the step's own component tree (either in the shared aside or inline in the step's
// own settings-mode template) -- can reach into whichever step is currently active before it
// navigates away. flushPendingSave() lets Next/Save persist an edit that's still sitting in the
// 400ms autosave debounce; isStepValid() lets Next refuse to advance past invalid required
// fields instead of silently discarding them.
export interface SetupStepController {
  flushPendingSave(): void;
  isStepValid(): boolean;
}

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
  // Separate from templateSubject -- registered regardless of setup/settings mode (unlike the
  // aside template, which only setup mode uses) so SetupStepNavComponent can flush the active
  // step's pending save in both modes.
  private readonly stepSubject = new BehaviorSubject<SetupStepController | null>(null);

  readonly content$ = this.templateSubject.asObservable();
  readonly saved$ = this.savedSubject.asObservable();
  readonly hideFooter$ = this.hideFooterSubject.asObservable();

  register(template: TemplateRef<unknown>, options?: { hideFooter?: boolean }): void {
    this.templateSubject.next(template);
    this.hideFooterSubject.next(options?.hideFooter ?? true);
  }

  registerStep(step: SetupStepController): void {
    this.stepSubject.next(step);
  }

  get activeStep(): SetupStepController | null {
    return this.stepSubject.value;
  }

  clear(): void {
    this.templateSubject.next(null);
    this.savedSubject.next(false);
    this.hideFooterSubject.next(false);
    this.stepSubject.next(null);
  }

  setSaved(saved: boolean): void {
    this.savedSubject.next(saved);
  }
}
