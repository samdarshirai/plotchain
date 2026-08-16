import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { CompanyProfileStepComponent } from './company-profile-step.component';
import { SetupStepNavComponent } from '../../../shared/components/setup-step-nav/setup-step-nav.component';
import { SetupService } from '../../setup.service';
import { SetupInspectorService } from '../../setup-inspector.service';
import { CompanyProfileResponse } from '../../models/company-profile.model';
import { SetupStateResponse } from '../../models/setup-state.model';

describe('CompanyProfileStepComponent', () => {
  let fixture: ComponentFixture<CompanyProfileStepComponent>;
  let httpMock: HttpTestingController;
  let setupService: SetupService;

  const emptyProfile: CompanyProfileResponse = {
    displayName: '',
    legalName: '',
    registrationNumber: '',
    contactName: '',
    contactPhone: '',
    contactEmail: '',
    registeredAddress: '',
    updatedAt: null
  };

  const filledProfile: CompanyProfileResponse = {
    displayName: 'Plotchain Estates',
    legalName: 'Plotchain Estates Private Limited',
    registrationNumber: '',
    contactName: 'Jane Doe',
    contactPhone: '+919876543210',
    contactEmail: 'jane@plotchain.test',
    registeredAddress: '123 MG Road, Bengaluru',
    updatedAt: '2026-01-01T00:00:00Z'
  };

  const setupState: SetupStateResponse = {
    steps: [
      { number: 1, key: 'companyProfile', complete: false, required: true, percentComplete: 0 },
      { number: 2, key: 'branding', complete: false, required: true, percentComplete: 0 }
    ],
    canGoLive: false,
    launchedAt: null
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CompanyProfileStepComponent, HttpClientTestingModule, RouterTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(CompanyProfileStepComponent);
    httpMock = TestBed.inject(HttpTestingController);
    setupService = TestBed.inject(SetupService);
    fixture.detectChanges();
    httpMock.expectOne('/api/company/profile').flush(emptyProfile);
    httpMock.expectOne('/api/company/setup-state').flush(setupState);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('patches the form from the loaded profile without triggering an autosave', fakeAsync(() => {
    fixture.destroy();
    fixture = TestBed.createComponent(CompanyProfileStepComponent);
    fixture.detectChanges();
    httpMock.expectOne('/api/company/profile').flush(filledProfile);
    // No second GET /api/company/setup-state here: SetupService.getState() is shareReplay(1)'d,
    // so this second component instance's subscription replays the cached response from the
    // first fixture's load in beforeEach rather than issuing a new request.

    expect(fixture.componentInstance.form.value.displayName).toBe('Plotchain Estates');

    tick(500);
    httpMock.expectNone('/api/company/profile');
  }));

  it('autosaves the form 400ms after a valid change', fakeAsync(() => {
    fixture.componentInstance.form.patchValue(filledProfile);

    tick(400);
    const req = httpMock.expectOne('/api/company/profile');
    expect(req.request.method).toBe('PUT');
    req.flush(filledProfile);
    // The save's success handler calls setupService.refresh(), which re-fires the shared
    // GET /api/company/setup-state (shareReplay only skips the request when replaying a
    // cached value to a new subscriber, not when the source itself is asked to refresh).
    httpMock.expectOne('/api/company/setup-state').flush(setupState);
  }));

  it('flushes a pending autosave immediately when destroyed before the 400ms debounce fires', fakeAsync(() => {
    fixture.componentInstance.form.patchValue(filledProfile);

    fixture.destroy();

    const req = httpMock.expectOne('/api/company/profile');
    expect(req.request.method).toBe('PUT');
    req.flush(filledProfile);
    httpMock.expectOne('/api/company/setup-state').flush(setupState);
  }));

  it('uppercases a lower-case GSTIN as typed so it does not fail validation and block the whole form from saving', fakeAsync(() => {
    fixture.componentInstance.form.patchValue({ ...filledProfile, registrationNumber: '29abcde1234f1z5' });

    expect(fixture.componentInstance.form.valid).toBeTrue();
    expect(fixture.componentInstance.form.value.registrationNumber).toBe('29ABCDE1234F1Z5');

    tick(400);
    const req = httpMock.expectOne('/api/company/profile');
    expect(req.request.body.registrationNumber).toBe('29ABCDE1234F1Z5');
    req.flush({ ...filledProfile, registrationNumber: '29ABCDE1234F1Z5' });
    httpMock.expectOne('/api/company/setup-state').flush(setupState);
  }));

  it('does not autosave while the form is invalid', fakeAsync(() => {
    fixture.componentInstance.form.patchValue({ ...filledProfile, contactEmail: 'not-an-email' });

    tick(400);
    expect(fixture.componentInstance.form.invalid).toBeTrue();
    httpMock.expectNone('/api/company/profile');
  }));

  it('shows a saved indicator after a successful autosave', fakeAsync(() => {
    fixture.componentInstance.form.patchValue(filledProfile);
    tick(400);
    httpMock.expectOne('/api/company/profile').flush(filledProfile);
    httpMock.expectOne('/api/company/setup-state').flush(setupState);

    expect(fixture.componentInstance.savedJustNow).toBeTrue();
  }));

  it('refreshes the setup state after a successful autosave', fakeAsync(() => {
    spyOn(setupService, 'refresh');
    fixture.componentInstance.form.patchValue(filledProfile);
    tick(400);
    httpMock.expectOne('/api/company/profile').flush(filledProfile);

    expect(setupService.refresh).toHaveBeenCalled();
  }));

  it('does not render the inline step-nav when mode is setup (shell owns navigation there)', () => {
    fixture.detectChanges();
    const nav = fixture.debugElement.query(By.directive(SetupStepNavComponent));
    expect(nav).toBeNull();
  });

  it('passes the settings mode through to the step-nav', () => {
    fixture.componentInstance.mode = 'settings';
    fixture.detectChanges();
    const nav = fixture.debugElement.query(By.directive(SetupStepNavComponent));
    expect(nav.componentInstance.mode).toBe('settings');
  });

  it('registers its inspector preview template with SetupInspectorService in setup mode', () => {
    const inspectorService = TestBed.inject(SetupInspectorService);
    spyOn(inspectorService, 'register');
    fixture.componentInstance.ngAfterViewInit();
    expect(inspectorService.register).toHaveBeenCalled();
  });

  it('does not register an inspector template in settings mode', () => {
    const inspectorService = TestBed.inject(SetupInspectorService);
    spyOn(inspectorService, 'register');
    fixture.componentInstance.mode = 'settings';
    fixture.componentInstance.ngAfterViewInit();
    expect(inspectorService.register).not.toHaveBeenCalled();
  });

  it('clears the inspector template on destroy', () => {
    const inspectorService = TestBed.inject(SetupInspectorService);
    spyOn(inspectorService, 'clear');
    fixture.destroy();
    expect(inspectorService.clear).toHaveBeenCalled();
  });

  it('hides the previous/next buttons when mode is settings', () => {
    fixture.componentInstance.mode = 'settings';
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('.setup-step-nav__previous'))).toBeNull();
    expect(fixture.debugElement.query(By.css('.setup-step-nav__next'))).toBeNull();
    expect(fixture.debugElement.query(By.css('.setup-step-nav__save'))).not.toBeNull();
  });

  it('registers itself as the active step with SetupInspectorService', () => {
    const inspectorService = TestBed.inject(SetupInspectorService);
    expect(inspectorService.activeStep).toBe(fixture.componentInstance);
  });

  it('flushPendingSave saves immediately when the form is dirty, bypassing the debounce', () => {
    fixture.componentInstance.form.patchValue(filledProfile);

    fixture.componentInstance.flushPendingSave();

    const req = httpMock.expectOne('/api/company/profile');
    expect(req.request.method).toBe('PUT');
    req.flush(filledProfile);
    httpMock.expectOne('/api/company/setup-state').flush(setupState);
  });

  it('flushPendingSave does nothing when the form is pristine', () => {
    expect(fixture.componentInstance.form.dirty).toBeFalse();
    fixture.componentInstance.flushPendingSave();
    httpMock.expectNone('/api/company/profile');
  });

  it('flushPendingSave does nothing when the form is dirty but invalid', () => {
    fixture.componentInstance.form.patchValue({ ...filledProfile, contactEmail: 'not-an-email' });
    expect(fixture.componentInstance.form.dirty).toBeTrue();

    fixture.componentInstance.flushPendingSave();

    httpMock.expectNone('/api/company/profile');
  });

  it('does not fire a duplicate save when the debounce elapses after flushPendingSave already saved the same edit', fakeAsync(() => {
    fixture.componentInstance.form.patchValue(filledProfile);

    fixture.componentInstance.flushPendingSave();
    httpMock.expectOne('/api/company/profile').flush(filledProfile);
    httpMock.expectOne('/api/company/setup-state').flush(setupState);
    expect(fixture.componentInstance.form.dirty).toBeFalse();

    // The 400ms debounce scheduled by the original patchValue is still pending underneath --
    // it must not re-fire a second PUT for the same, already-saved value now that the form is
    // pristine again.
    tick(400);
    httpMock.expectNone('/api/company/profile');
  }));

  it('isStepValid reflects the form validity', () => {
    fixture.componentInstance.form.patchValue({ ...filledProfile, contactEmail: 'not-an-email' });
    expect(fixture.componentInstance.isStepValid()).toBeFalse();

    fixture.componentInstance.form.patchValue(filledProfile);
    expect(fixture.componentInstance.isStepValid()).toBeTrue();

    fixture.componentInstance.flushPendingSave();
    httpMock.expectOne('/api/company/profile').flush(filledProfile);
    httpMock.expectOne('/api/company/setup-state').flush(setupState);
  });

  it('surfaces server-side field errors from a failed autosave', fakeAsync(() => {
    fixture.componentInstance.form.patchValue(filledProfile);
    tick(400);
    httpMock.expectOne('/api/company/profile').flush(
      { error: 'validation failed', fields: { displayName: 'must not be blank' } },
      { status: 400, statusText: 'Bad Request' }
    );

    expect(fixture.componentInstance.fieldError('displayName')).toBe('must not be blank');
    expect(fixture.componentInstance.savedJustNow).toBeFalse();
  }));
});
