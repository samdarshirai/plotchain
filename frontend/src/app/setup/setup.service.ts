import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, shareReplay, switchMap } from 'rxjs';
import { SetupStateResponse, STEP_PATHS } from './models/setup-state.model';

@Injectable({ providedIn: 'root' })
export class SetupService {
  private readonly refresh$ = new BehaviorSubject<void>(undefined);
  private readonly state$: Observable<SetupStateResponse> = this.refresh$.pipe(
    switchMap(() => this.http.get<SetupStateResponse>('/api/company/setup-state')),
    shareReplay(1)
  );

  constructor(private http: HttpClient) {}

  getState(): Observable<SetupStateResponse> {
    return this.state$;
  }

  // Called after a step save so later phases pick up the new completeness immediately.
  refresh(): void {
    this.refresh$.next();
  }

  firstIncompleteStepKey(state: SetupStateResponse): string {
    const firstIncompleteRequired = state.steps.find(s => s.required && !s.complete);
    return (firstIncompleteRequired ?? state.steps[0]).key;
  }

  firstIncompleteStepPath(state: SetupStateResponse): string {
    return STEP_PATHS[this.firstIncompleteStepKey(state)];
  }
}
