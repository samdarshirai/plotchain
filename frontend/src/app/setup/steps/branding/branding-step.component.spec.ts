import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { BrandingStepComponent } from './branding-step.component';
import { SetupService } from '../../setup.service';
import { ThemeService } from '../../../core/theme/theme.service';
import { CompanyBrandingResponse } from '../../models/branding.model';

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
    httpMock.expectOne('/api/company/branding').flush(emptyBranding);
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
  }));

  it('saves via PUT 400ms after a valid change and re-themes the whole app', fakeAsync(() => {
    fixture.componentInstance.setColor('primaryColor', '#E11D48');

    tick(400);
    const req = httpMock.expectOne('/api/company/branding');
    expect(req.request.method).toBe('PUT');
    (themeService.apply as jasmine.Spy).calls.reset();
    req.flush({ ...emptyBranding, primaryColor: '#E11D48' });

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
});
