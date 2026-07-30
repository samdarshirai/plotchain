import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, shareReplay, switchMap } from 'rxjs';
import { LaunchRequest, SetupStateResponse, STEP_PATHS } from './models/setup-state.model';

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

  launch(acceptTerms: boolean): Observable<SetupStateResponse> {
    return this.http.post<SetupStateResponse>('/api/company/launch', { acceptTerms } as LaunchRequest);
  }

  firstIncompleteStepKey(state: SetupStateResponse): string {
    const firstIncompleteRequired = state.steps.find(s => s.required && !s.complete);
    return (firstIncompleteRequired ?? state.steps[0]).key;
  }

  firstIncompleteStepPath(state: SetupStateResponse): string {
    return STEP_PATHS[this.firstIncompleteStepKey(state)];
  }

  nextStepPath(currentKey: string): string | null {
    const keys = Object.keys(STEP_PATHS);
    const path = STEP_PATHS[keys[keys.indexOf(currentKey) + 1]];
    return path ?? null;
  }

  previousStepPath(currentKey: string): string | null {
    const keys = Object.keys(STEP_PATHS);
    const index = keys.indexOf(currentKey);
    const path = index > 0 ? STEP_PATHS[keys[index - 1]] : undefined;
    return path ?? null;
  }
}
