import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ElementRef } from '@angular/core';
import { By } from '@angular/platform-browser';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { BrandingStepComponent } from './branding-step.component';
import { SetupStepNavComponent } from '../../../shared/components/setup-step-nav/setup-step-nav.component';
import { SetupService } from '../../setup.service';
import { SetupInspectorService } from '../../setup-inspector.service';
import { ThemeService } from '../../../core/theme/theme.service';
import { CompanyBrandingResponse } from '../../models/branding.model';
import { SetupStateResponse } from '../../models/setup-state.model';

describe('BrandingStepComponent', () => {
  let fixture: ComponentFixture<BrandingStepComponent>;
  let httpMock: HttpTestingController;
  let setupService: SetupService;
  let themeService: ThemeService;

  const emptyBranding: CompanyBrandingResponse = {
    primaryColor: '#7C3AED',
    secondaryColor: '#22D3EE',
    tagline: '',
    hasSquareLogo: false,
    hasWideLogo: false,
    updatedAt: null
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
      imports: [BrandingStepComponent, HttpClientTestingModule, RouterTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(BrandingStepComponent);
    httpMock = TestBed.inject(HttpTestingController);
    setupService = TestBed.inject(SetupService);
    themeService = TestBed.inject(ThemeService);
    spyOn(themeService, 'apply');
    fixture.detectChanges();

    // #previewContainer only exists inside <ng-template #inspectorTpl>, which in the real app is
    // instantiated by SetupInspectorAsideComponent's *ngTemplateOutlet, not by this component --
    // there's no shell/aside here for that to happen, so paintPreview()'s
    // `if (this.previewContainer)` guard would silently no-op for every test. These tests are
    // about paintPreview's color-handling logic, not Angular's cross-component template-outlet
    // wiring, so stub a real element in directly rather than fighting ng-template instantiation.
    (fixture.componentInstance as unknown as { previewContainer: ElementRef<HTMLElement> }).previewContainer =
      new ElementRef(document.createElement('div'));

    httpMock.expectOne('/api/company/branding').flush(emptyBranding);
    httpMock.expectOne('/api/company/setup-state').flush(setupState);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('paints the preview once on initial load', () => {
    expect(themeService.apply).toHaveBeenCalledWith('#7C3AED', '#22D3EE', jasmine.anything());
  });

  it('repaints only the preview container when a color changes, before the debounce fires', fakeAsync(() => {
    (themeService.apply as jasmine.Spy).calls.reset();

    fixture.componentInstance.setColor('primaryColor', '#E11D48');

    expect(themeService.apply).toHaveBeenCalledWith('#E11D48', '#22D3EE', jasmine.anything());
    expect(themeService.apply).not.toHaveBeenCalledWith('#E11D48', '#22D3EE', undefined);

    httpMock.expectNone('/api/company/branding');
    tick(400);
    httpMock.expectOne('/api/company/branding').flush({ ...emptyBranding, primaryColor: '#E11D48' });
    httpMock.expectOne('/api/company/setup-state').flush(setupState);
  }));

  it('saves via PUT 400ms after a valid change and re-themes the whole app', fakeAsync(() => {
    fixture.componentInstance.setColor('primaryColor', '#E11D48');

    tick(400);
    const req = httpMock.expectOne('/api/company/branding');
    expect(req.request.method).toBe('PUT');
    (themeService.apply as jasmine.Spy).calls.reset();
    req.flush({ ...emptyBranding, primaryColor: '#E11D48' });
    httpMock.expectOne('/api/company/setup-state').flush(setupState);

    expect(themeService.apply).toHaveBeenCalledWith('#E11D48', '#22D3EE');
  }));

  it('does not save when the tagline exceeds 60 characters', fakeAsync(() => {
    fixture.componentInstance.form.get('tagline')?.setValue('x'.repeat(61));

    tick(400);
    expect(fixture.componentInstance.form.invalid).toBeTrue();
    httpMock.expectNone('/api/company/branding');
  }));

  it('reflects the tagline counter', () => {
    // emitEvent:false -- this assertion is about the template binding, not the autosave path,
    // so no debounce timer needs to be left dangling past the test.
    fixture.componentInstance.form.get('tagline')?.setValue('Land you can trust', { emitEvent: false });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.branding-step__counter').textContent).toContain('18/60');
  });

  it('shows the contrast warning for a mid-tone color that reads poorly against both white and dark text, and hides it for a strong one', fakeAsync(() => {
    // #797979's luminance sits in the narrow band where neither white nor near-black text
    // clears 4.5:1 against it -- unlike very light or very dark colors, which always have at
    // least one legible text option.
    fixture.componentInstance.setColor('primaryColor', '#797979');
    fixture.detectChanges();
    expect(fixture.componentInstance.contrastWarning).toBeTrue();

    fixture.componentInstance.setColor('primaryColor', '#111111');
    fixture.detectChanges();
    expect(fixture.componentInstance.contrastWarning).toBeFalse();

    tick(400);
    httpMock.expectOne('/api/company/branding').flush({ ...emptyBranding, primaryColor: '#111111' });
    httpMock.expectOne('/api/company/setup-state').flush(setupState);
  }));

  it('refreshes setup state after a successful autosave', fakeAsync(() => {
    spyOn(setupService, 'refresh');
    fixture.componentInstance.setColor('primaryColor', '#E11D48');
    tick(400);
    httpMock.expectOne('/api/company/branding').flush({ ...emptyBranding, primaryColor: '#E11D48' });

    expect(setupService.refresh).toHaveBeenCalled();
  }));

  it('uploads a logo, refetches branding, and refreshes setup state', () => {
    spyOn(setupService, 'refresh');
    const file = new File(['data'], 'logo.png', { type: 'image/png' });

    fixture.componentInstance.onLogoSelected('square', file);

    const uploadReq = httpMock.expectOne('/api/company/branding/logo/square');
    expect(uploadReq.request.method).toBe('POST');
    uploadReq.flush(null);

    httpMock.expectOne('/api/company/branding').flush({ ...emptyBranding, hasSquareLogo: true });

    expect(setupService.refresh).toHaveBeenCalled();
    expect(fixture.componentInstance.branding?.hasSquareLogo).toBeTrue();
  });

  it('surfaces a logo upload error on the tile', () => {
    const file = new File(['data'], 'logo.gif', { type: 'image/gif' });

    fixture.componentInstance.onLogoSelected('square', file);

    httpMock.expectOne('/api/company/branding/logo/square').flush(
      { error: 'unsupported logo content type: image/gif' },
      { status: 400, statusText: 'Bad Request' }
    );

    expect(fixture.componentInstance.logoError('square')).toBe('unsupported logo content type: image/gif');
  });

  it('does not render the inline step-nav when mode is setup (shell owns navigation there)', () => {
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

  it('registers itself as the active step with SetupInspectorService', () => {
    const inspectorService = TestBed.inject(SetupInspectorService);
    expect(inspectorService.activeStep).toBe(fixture.componentInstance);
  });

  it('flushPendingSave saves immediately after a color change (set via setColor(), not a native input), bypassing the debounce', () => {
    fixture.componentInstance.setColor('primaryColor', '#E11D48');

    fixture.componentInstance.flushPendingSave();

    const req = httpMock.expectOne('/api/company/branding');
    expect(req.request.method).toBe('PUT');
    req.flush({ ...emptyBranding, primaryColor: '#E11D48' });
    httpMock.expectOne('/api/company/setup-state').flush(setupState);
  });

  it('flushPendingSave does nothing when the form is pristine', () => {
    expect(fixture.componentInstance.form.dirty).toBeFalse();
    fixture.componentInstance.flushPendingSave();
    httpMock.expectNone('/api/company/branding');
  });

  it('flushPendingSave does nothing when the form is dirty but invalid', () => {
    fixture.componentInstance.form.get('tagline')?.setValue('x'.repeat(61));
    expect(fixture.componentInstance.form.dirty).toBeTrue();

    fixture.componentInstance.flushPendingSave();

    httpMock.expectNone('/api/company/branding');
  });

  it('isStepValid reflects the form validity', () => {
    fixture.componentInstance.form.get('tagline')?.setValue('x'.repeat(61));
    expect(fixture.componentInstance.isStepValid()).toBeFalse();

    fixture.componentInstance.setColor('primaryColor', '#E11D48');
    fixture.componentInstance.form.get('tagline')?.setValue('Land you can trust');
    expect(fixture.componentInstance.isStepValid()).toBeTrue();

    fixture.componentInstance.flushPendingSave();
    httpMock.expectOne('/api/company/branding').flush({ ...emptyBranding, primaryColor: '#E11D48', tagline: 'Land you can trust' });
    httpMock.expectOne('/api/company/setup-state').flush(setupState);
  });

  it('does not fire a duplicate save when the debounce elapses after flushPendingSave already saved the same edit', fakeAsync(() => {
    fixture.componentInstance.setColor('primaryColor', '#E11D48');

    fixture.componentInstance.flushPendingSave();
    httpMock.expectOne('/api/company/branding').flush({ ...emptyBranding, primaryColor: '#E11D48' });
    httpMock.expectOne('/api/company/setup-state').flush(setupState);
    expect(fixture.componentInstance.form.dirty).toBeFalse();

    tick(400);
    httpMock.expectNone('/api/company/branding');
  }));
});
