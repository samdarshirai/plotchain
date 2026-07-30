import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { CompanyProfileStepComponent } from './company-profile-step.component';
import { SetupService } from '../../setup.service';
import { CompanyProfileResponse } from '../../models/company-profile.model';

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

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CompanyProfileStepComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(CompanyProfileStepComponent);
    httpMock = TestBed.inject(HttpTestingController);
    setupService = TestBed.inject(SetupService);
    fixture.detectChanges();
    httpMock.expectOne('/api/company/profile').flush(emptyProfile);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('patches the form from the loaded profile without triggering an autosave', fakeAsync(() => {
    fixture.destroy();
    fixture = TestBed.createComponent(CompanyProfileStepComponent);
    fixture.detectChanges();
    httpMock.expectOne('/api/company/profile').flush(filledProfile);

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

    expect(fixture.componentInstance.savedJustNow).toBeTrue();
  }));

  it('refreshes the setup state after a successful autosave', fakeAsync(() => {
    spyOn(setupService, 'refresh');
    fixture.componentInstance.form.patchValue(filledProfile);
    tick(400);
    httpMock.expectOne('/api/company/profile').flush(filledProfile);

    expect(setupService.refresh).toHaveBeenCalled();
  }));

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
