import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { SetupShellComponent } from './setup-shell.component';
import { SetupService } from './setup.service';
import { SetupStateResponse } from './models/setup-state.model';

describe('SetupShellComponent', () => {
  let fixture: ComponentFixture<SetupShellComponent>;
  let setupService: jasmine.SpyObj<SetupService>;

  const state: SetupStateResponse = {
    steps: [{ number: 1, key: 'companyProfile', complete: false, required: true, percentComplete: 0 }],
    canGoLive: false,
    launchedAt: null
  };

  beforeEach(async () => {
    setupService = jasmine.createSpyObj('SetupService', ['getState', 'previousStepPath', 'nextStepPath']);
    setupService.getState.and.returnValue(of(state));
    setupService.previousStepPath.and.returnValue(null);
    setupService.nextStepPath.and.returnValue('branding');

    await TestBed.configureTestingModule({
      imports: [SetupShellComponent, RouterTestingModule, HttpClientTestingModule, TranslateModule.forRoot()],
      providers: [
        { provide: SetupService, useValue: setupService },
        {
          provide: ActivatedRoute,
          useValue: { firstChild: { firstChild: null, snapshot: { data: { stepKey: 'companyProfile' } } } }
        }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(SetupShellComponent);
  });

  it('derives the active step key from the current child route', () => {
    fixture.detectChanges();
    expect(fixture.componentInstance.activeStepKey).toBe('companyProfile');
  });

  it('passes the fetched steps down to the progress rail', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-setup-progress-rail')).toBeTruthy();
  });

  it('renders the header and inspector aside', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-setup-header')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-setup-inspector-aside')).toBeTruthy();
  });

  it('computes previousPath and nextPath for the active step via SetupService', () => {
    fixture.detectChanges();
    expect(setupService.previousStepPath).toHaveBeenCalledWith('companyProfile');
    expect(setupService.nextStepPath).toHaveBeenCalledWith('companyProfile');
    expect(fixture.componentInstance.previousPath).toBeNull();
    expect(fixture.componentInstance.nextPath).toBe('branding');
  });

  it('passes previousPath and nextPath down to the shell footer', () => {
    fixture.detectChanges();
    const footer = fixture.nativeElement.querySelector('app-setup-shell-footer');
    expect(footer).toBeTruthy();
  });
});
