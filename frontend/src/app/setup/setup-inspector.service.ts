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

  readonly content$ = this.templateSubject.asObservable();
  readonly saved$ = this.savedSubject.asObservable();

  register(template: TemplateRef<unknown>): void {
    this.templateSubject.next(template);
  }

  clear(): void {
    this.templateSubject.next(null);
    this.savedSubject.next(false);
  }

  setSaved(saved: boolean): void {
    this.savedSubject.next(saved);
  }
}
