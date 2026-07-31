import { ComponentFixture, TestBed, fakeAsync } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { RootAssociatesStepComponent } from './root-associates-step.component';
import { SetupStepNavComponent } from '../../../shared/components/setup-step-nav/setup-step-nav.component';
import { SetupService } from '../../setup.service';
import { RootAssociateSlots } from '../../models/root-associates.model';

describe('RootAssociatesStepComponent', () => {
  let fixture: ComponentFixture<RootAssociatesStepComponent>;
  let httpMock: HttpTestingController;

  const emptySlots: RootAssociateSlots = { roots: [], leftOccupied: false, rightOccupied: false };

  function flushInitialLoad(slots = emptySlots): void {
    httpMock.expectOne('/api/company/root-associates').flush(slots);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RootAssociatesStepComponent, HttpClientTestingModule, RouterTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(RootAssociatesStepComponent);
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(SetupService);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('shows the warning banner and the create form when no root exists yet', () => {
    flushInitialLoad();

    expect(fixture.nativeElement.textContent).toContain('setup.rootAssociates.warningBannerBody');
    const form = fixture.debugElement.query(By.css('form'));
    expect(form).toBeTruthy();
  });

  it('hides the create form and warning banner once a left root already exists', () => {
    flushInitialLoad({
      roots: [{ associateId: 'r1', userId: 'VP00001', name: 'Root One', phone: '9990001111', slotLabel: 'LEFT' }],
      leftOccupied: true,
      rightOccupied: false
    });

    expect(fixture.nativeElement.textContent).not.toContain('setup.rootAssociates.warningBannerBody');
    expect(fixture.debugElement.query(By.css('form'))).toBeFalsy();
    expect(fixture.nativeElement.textContent).toContain('Root One');
    expect(fixture.nativeElement.textContent).toContain('VP00001');
  });

  it('requires right name/phone only once "seed right root" is checked', () => {
    flushInitialLoad();
    const component = fixture.componentInstance;

    component.form.patchValue({ name: 'Root Left', phone: '9990001111' });
    expect(component.form.valid).toBe(true);

    component.form.patchValue({ seedRightRoot: true });
    component.onSeedRightRootChange();
    expect(component.form.valid).toBe(false);

    component.form.patchValue({ rightName: 'Root Right', rightPhone: '9990002222' });
    expect(component.form.valid).toBe(true);
  });

  it('submits with only left-root fields when seedRightRoot is false', () => {
    flushInitialLoad();
    const component = fixture.componentInstance;
    component.form.setValue({
      name: 'Root Left',
      phone: '9990001111',
      seedRightRoot: false,
      rightName: '',
      rightPhone: ''
    });
    component.onSubmit();

    const req = httpMock.expectOne('/api/company/root-associates');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ name: 'Root Left', phone: '9990001111', seedRightRoot: false });
    req.flush({
      left: { associateId: 'r1', userId: 'VP00001', temporaryPassword: 'temp1', name: 'Root Left', slotLabel: 'LEFT' },
      right: null
    });
    httpMock.expectOne('/api/company/root-associates').flush({
      roots: [{ associateId: 'r1', userId: 'VP00001', name: 'Root Left', phone: '9990001111', slotLabel: 'LEFT' }],
      leftOccupied: true,
      rightOccupied: false
    });
  });

  it('submits with right-root fields included when seedRightRoot is true', () => {
    flushInitialLoad();
    const component = fixture.componentInstance;
    component.form.setValue({
      name: 'Root Left',
      phone: '9990001111',
      seedRightRoot: true,
      rightName: 'Root Right',
      rightPhone: '9990002222'
    });
    component.onSubmit();

    const req = httpMock.expectOne('/api/company/root-associates');
    expect(req.request.body).toEqual({
      name: 'Root Left',
      phone: '9990001111',
      seedRightRoot: true,
      rightName: 'Root Right',
      rightPhone: '9990002222'
    });
    req.flush({
      left: { associateId: 'r1', userId: 'VP00001', temporaryPassword: 'temp1', name: 'Root Left', slotLabel: 'LEFT' },
      right: { associateId: 'r2', userId: 'VP00002', temporaryPassword: 'temp2', name: 'Root Right', slotLabel: 'RIGHT' }
    });
    httpMock.expectOne('/api/company/root-associates').flush({
      roots: [
        { associateId: 'r1', userId: 'VP00001', name: 'Root Left', phone: '9990001111', slotLabel: 'LEFT' },
        { associateId: 'r2', userId: 'VP00002', name: 'Root Right', phone: '9990002222', slotLabel: 'RIGHT' }
      ],
      leftOccupied: true,
      rightOccupied: true
    });
  });

  it('shows both one-time results in the banner, refetches slots, and hides the form afterward', fakeAsync(() => {
    flushInitialLoad();
    const component = fixture.componentInstance;
    component.form.setValue({
      name: 'Root Left',
      phone: '9990001111',
      seedRightRoot: true,
      rightName: 'Root Right',
      rightPhone: '9990002222'
    });
    component.onSubmit();

    httpMock.expectOne('/api/company/root-associates').flush({
      left: { associateId: 'r1', userId: 'VP00001', temporaryPassword: 'temp1', name: 'Root Left', slotLabel: 'LEFT' },
      right: { associateId: 'r2', userId: 'VP00002', temporaryPassword: 'temp2', name: 'Root Right', slotLabel: 'RIGHT' }
    });
    httpMock.expectOne('/api/company/root-associates').flush({
      roots: [
        { associateId: 'r1', userId: 'VP00001', name: 'Root Left', phone: '9990001111', slotLabel: 'LEFT' },
        { associateId: 'r2', userId: 'VP00002', name: 'Root Right', phone: '9990002222', slotLabel: 'RIGHT' }
      ],
      leftOccupied: true,
      rightOccupied: true
    });

    expect(component.createdLeft?.temporaryPassword).toBe('temp1');
    expect(component.createdRight?.temporaryPassword).toBe('temp2');
    expect(component.leftOccupied).toBe(true);

    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('temp1');
    expect(fixture.nativeElement.textContent).toContain('temp2');
    expect(fixture.debugElement.query(By.css('form'))).toBeFalsy();
  }));

  it('calls SetupService.refresh() after a successful creation', () => {
    flushInitialLoad();
    const component = fixture.componentInstance;
    const setupService = TestBed.inject(SetupService);
    const refreshSpy = spyOn(setupService, 'refresh');

    component.form.setValue({
      name: 'Root Left',
      phone: '9990001111',
      seedRightRoot: false,
      rightName: '',
      rightPhone: ''
    });
    component.onSubmit();

    httpMock.expectOne('/api/company/root-associates').flush({
      left: { associateId: 'r1', userId: 'VP00001', temporaryPassword: 'temp1', name: 'Root Left', slotLabel: 'LEFT' },
      right: null
    });
    httpMock.expectOne('/api/company/root-associates').flush({
      roots: [{ associateId: 'r1', userId: 'VP00001', name: 'Root Left', phone: '9990001111', slotLabel: 'LEFT' }],
      leftOccupied: true,
      rightOccupied: false
    });

    expect(refreshSpy).toHaveBeenCalled();
  });

  it('surfaces a 409 (root already exists) as a submit-level banner, not a field error', () => {
    flushInitialLoad();
    const component = fixture.componentInstance;
    component.form.setValue({
      name: 'Root Left',
      phone: '9990001111',
      seedRightRoot: false,
      rightName: '',
      rightPhone: ''
    });
    component.onSubmit();

    const req = httpMock.expectOne('/api/company/root-associates');
    req.flush({ error: 'A root associate already exists.' }, { status: 409, statusText: 'Conflict' });

    expect(component.fieldError('name')).toBeUndefined();
    expect(component.submitError).toBe('setup.rootAssociates.validation.alreadyExists');
    fixture.detectChanges();
    // Two inline banners can render at once here (the warning banner stays up alongside the
    // submit-error one, since the form -- and thus the "no root yet" state -- is still showing).
    const banners = fixture.debugElement.queryAll(By.css('app-inline-banner'));
    const dangerBanner = banners.find(b => b.attributes['tone'] === 'danger');
    expect(dangerBanner?.nativeElement.textContent).toContain('setup.rootAssociates.validation.alreadyExists');
  });

  it('surfaces a 409 caused by unconfigured rank tiers with a distinct message', () => {
    flushInitialLoad();
    const component = fixture.componentInstance;
    component.form.setValue({
      name: 'Root Left',
      phone: '9990001111',
      seedRightRoot: false,
      rightName: '',
      rightPhone: ''
    });
    component.onSubmit();

    const req = httpMock.expectOne('/api/company/root-associates');
    req.flush(
      { error: 'No rank tiers are configured; an associate cannot be created without a rank' },
      { status: 409, statusText: 'Conflict' }
    );

    expect(component.submitError).toBe('setup.rootAssociates.validation.noRankTiersConfigured');
  });

  it('does not render the inline step-nav when mode is setup (shell owns navigation there)', () => {
    flushInitialLoad();
    const nav = fixture.debugElement.query(By.directive(SetupStepNavComponent));
    expect(nav).toBeNull();
  });

  it('passes the settings mode through to the step-nav', () => {
    flushInitialLoad();
    fixture.componentInstance.mode = 'settings';
    fixture.detectChanges();
    const nav = fixture.debugElement.query(By.directive(SetupStepNavComponent));
    expect(nav.componentInstance.mode).toBe('settings');
  });
});
