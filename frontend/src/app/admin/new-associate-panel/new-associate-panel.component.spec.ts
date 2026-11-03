import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { NewAssociatePanelComponent } from './new-associate-panel.component';
import { AssociateProfileFormComponent } from '../../shared/components/associate-profile-form/associate-profile-form.component';
import { By } from '@angular/platform-browser';
import { AuthService } from '../../auth/auth.service';

describe('NewAssociatePanelComponent', () => {
  let fixture: ComponentFixture<NewAssociatePanelComponent>;
  let httpMock: HttpTestingController;

  const created = { associateId: 'new-id', userId: 'VP00099', temporaryPassword: 'Temp1234!', transactionPassword: 'Txn1234!' };

  function open(): AssociateProfileFormComponent {
    fixture.componentInstance.open = true;
    fixture.componentInstance.ngOnChanges({ open: {} as any });
    fixture.detectChanges();
    return fixture.debugElement.query(By.directive(AssociateProfileFormComponent)).componentInstance;
  }

  const fillValid = (form: AssociateProfileFormComponent) => form.form.patchValue({
    sponsorUserId: 'VP00002', position: 'L', name: 'Aditya Kumar', panNumber: 'ABCDE1234F', aadhaarNumber: '123456789012',
    phone: '9876543210', state: 'Delhi', district: 'Central', address: 'Addr'
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NewAssociatePanelComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(NewAssociatePanelComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    httpMock.expectOne('/api/associates')
      .flush([{ id: 'sponsor-1', userId: 'VP00002', name: 'Sunil Sponsor', role: 'ASSOCIATE', status: 'ACTIVE', hasFreeSlot: true }]);
  });

  afterEach(() => httpMock.verify());

  it('renders the full shared profile form (PAN, Aadhaar, address) and no transaction password', () => {
    open();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[formControlName="panNumber"]')).not.toBeNull();
    expect(el.querySelector('[formControlName="aadhaarNumber"]')).not.toBeNull();
    expect(el.querySelector('[formControlName="address"]')).not.toBeNull();
    expect(el.querySelector('[formControlName="transactionPassword"]')).toBeNull();
  });

  it('does not submit when required fields are blank', () => {
    const form = open();
    form.submit();
    httpMock.expectNone('/api/associates');
    expect(form.form.invalid).toBeTrue();
  });

  it('requires a sponsor and leg once the tree has associates', () => {
    const form = open();
    form.form.patchValue({ sponsorUserId: '', position: '' });
    expect(form.form.controls.sponsorUserId.hasError('required')).toBeTrue();
    expect(form.form.controls.position.hasError('required')).toBeTrue();
  });

  it('does not require a sponsor in rootMode (onboarding root user)', () => {
    fixture.componentInstance.rootMode = true;
    const form = open();
    form.form.patchValue({ sponsorUserId: '', position: '' });
    expect(form.form.controls.sponsorUserId.hasError('required')).toBeFalse();
    expect(form.form.controls.position.hasError('required')).toBeFalse();
  });

  it('posts the full profile and shows the credentials on success', () => {
    const form = open();
    fillValid(form);
    let emitted: any = null;
    fixture.componentInstance.created.subscribe(r => (emitted = r));
    form.submit();

    const req = httpMock.expectOne('/api/associates');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.sponsorUserId).toBe('VP00002');
    expect(req.request.body.position).toBe('L');
    expect(req.request.body.panNumber).toBe('ABCDE1234F');
    expect(req.request.body.transactionPassword).toBeUndefined();
    req.flush(created);

    expect(fixture.componentInstance.provisioned?.temporaryPassword).toBe('Temp1234!');
    expect(emitted.userId).toBe('VP00099');

    let closed = false;
    fixture.componentInstance.closed.subscribe(() => (closed = true));
    fixture.componentInstance.finishProvisioning();
    expect(closed).toBeTrue();
  });

  it('maps PAN_TAKEN to a PAN field error', () => {
    const form = open();
    fillValid(form);
    form.submit();
    httpMock.expectOne('/api/associates').flush({ error: 'PAN_TAKEN', code: 'PAN_TAKEN' }, { status: 409, statusText: 'Conflict' });
    expect(fixture.componentInstance.serverErrors['panNumber']).toBeTruthy();
    expect(fixture.componentInstance.provisioned).toBeNull();
  });

  it('shows a banner error on a generic 409 conflict', () => {
    const form = open();
    fillValid(form);
    form.submit();
    httpMock.expectOne('/api/associates').flush({ error: 'Placement already occupied' }, { status: 409, statusText: 'Conflict' });
    expect(fixture.componentInstance.submitError).toBe('admin.validation.placementUnavailable');
  });

  it('prefills sponsor and leg from a Tree Explorer vacant slot', () => {
    fixture.componentInstance.presetParent = { parentId: 'p1', leg: 'R', parentUserId: 'VP00050', parentName: 'Ravi Root' };
    const form = open();
    expect(form.form.controls.sponsorUserId.value).toBe('VP00050');
    expect(form.form.controls.position.value).toBe('R');
  });

  it('edit mode prefills the form, locks sponsor, and saves via the admin update endpoints', () => {
    fixture = TestBed.createComponent(NewAssociatePanelComponent);
    const c = fixture.componentInstance;
    c.editAssociateId = 'a-1';
    let saved = false;
    c.saved.subscribe(() => (saved = true));
    c.open = true;
    c.ngOnChanges({ open: {} as any });
    fixture.detectChanges();

    httpMock.expectOne('/api/admin/associates/a-1').flush({ id: 'a-1', userId: 'VP00005', sponsorUserId: 'VP00002', position: 'L' });
    httpMock.expectOne('/api/admin/associates/a-1/profile').flush({
      id: 'a-1', userId: 'VP00005', name: 'Old Name', phone: '9876543210', email: null, address: 'Addr', joinedAt: '2026-01-01',
      fatherHusbandName: 'Dad', dateOfBirth: null, gender: 'MALE', maritalStatus: 'SINGLE', state: 'Delhi', district: 'Central',
      postalCode: null, panNumber: 'ABCDE1234F', aadhaarNumber: '123456789012'
    });
    httpMock.expectOne('/api/admin/associates/a-1/nominee').flush({ nomineeName: 'Mom', relation: 'Mother' });
    httpMock.expectOne('/api/admin/associates/a-1/bank-details').flush({ bankName: null, accountHolder: null, accountNumber: null, ifscCode: null, accountType: null });
    fixture.detectChanges();

    const form: AssociateProfileFormComponent = fixture.debugElement.query(By.directive(AssociateProfileFormComponent)).componentInstance;
    expect(form.form.controls.name.value).toBe('Old Name');
    expect(form.form.controls.panNumber.value).toBe('ABCDE1234F');
    expect(form.form.controls.nomineeRelation.value).toBe('Mother');
    expect(form.form.controls.sponsorUserId.disabled).toBeTrue();
    expect(fixture.nativeElement.querySelector('[formControlName="ifscCode"]')).not.toBeNull();

    form.form.patchValue({ name: 'New Name', panNumber: 'ZZZZZ9999Z' });
    form.submit();

    const profile = httpMock.expectOne(r => r.method === 'PUT' && r.url === '/api/admin/associates/a-1/profile');
    expect(profile.request.body.name).toBe('New Name');
    expect(profile.request.body.panNumber).toBe('ZZZZZ9999Z');
    profile.flush({});
    const nominee = httpMock.expectOne(r => r.method === 'PUT' && r.url === '/api/admin/associates/a-1/nominee');
    expect(nominee.request.body).toEqual({ nomineeName: 'Mom', relation: 'Mother' });
    nominee.flush({});
    httpMock.expectNone('/api/admin/associates/a-1/bank-details');
    expect(saved).toBeTrue();
  });

  describe('edit mode save paths', () => {
    let form: AssociateProfileFormComponent;
    beforeEach(() => {
      fixture = TestBed.createComponent(NewAssociatePanelComponent);
      fixture.componentInstance.editAssociateId = 'a-1';
      fixture.componentInstance.open = true;
      fixture.componentInstance.ngOnChanges({ open: {} as any });
      fixture.detectChanges();
      httpMock.expectOne('/api/admin/associates/a-1').flush({ sponsorUserId: null, position: null });
      httpMock.expectOne('/api/admin/associates/a-1/profile').flush({
        name: 'N', phone: '9876543210', address: 'A', state: 'Delhi', district: 'C', panNumber: 'ABCDE1234F', aadhaarNumber: '123456789012'
      });
      httpMock.expectOne('/api/admin/associates/a-1/nominee').flush({ nomineeName: null, relation: null });
      httpMock.expectOne('/api/admin/associates/a-1/bank-details').flush({});
      fixture.detectChanges();
      form = fixture.debugElement.query(By.directive(AssociateProfileFormComponent)).componentInstance;
    });

    const flushProfileAndNominee = () => {
      httpMock.expectOne(r => r.method === 'PUT' && r.url.endsWith('/profile')).flush({});
      httpMock.expectOne(r => r.method === 'PUT' && r.url.endsWith('/nominee')).flush({});
    };

    it('saves bank details when any bank field is filled', () => {
      form.form.patchValue({ bankName: 'SBI', accountHolder: 'N', accountNumber: '123', ifscCode: 'SBIN0001234', accountType: 'CURRENT' });
      form.submit();
      flushProfileAndNominee();
      const bank = httpMock.expectOne(r => r.method === 'PUT' && r.url.endsWith('/bank-details'));
      expect(bank.request.body).toEqual({ bankName: 'SBI', accountHolder: 'N', accountNumber: '123', ifscCode: 'SBIN0001234', accountType: 'CURRENT' });
      bank.flush({});
    });

    it('maps a phone conflict to a Mobile field error', () => {
      form.submit();
      httpMock.expectOne(r => r.method === 'PUT' && r.url.endsWith('/profile')).flush({ error: 'taken' }, { status: 409, statusText: 'Conflict' });
      httpMock.match(r => r.url.endsWith('/nominee')); // cancelled by forkJoin once profile fails
      expect(fixture.componentInstance.serverErrors).toEqual({ phone: 'Phone number already registered' });
    });

    it('maps AADHAAR_TAKEN to an Aadhaar field error', () => {
      form.submit();
      httpMock.expectOne(r => r.method === 'PUT' && r.url.endsWith('/profile'))
        .flush({ code: 'AADHAAR_TAKEN' }, { status: 409, statusText: 'Conflict' });
      httpMock.match(r => r.url.endsWith('/nominee')); // cancelled by forkJoin once profile fails
      expect(fixture.componentInstance.serverErrors).toEqual({ aadhaarNumber: 'Aadhaar already registered' });
    });
  });

  describe('password resets (edit mode)', () => {
    beforeEach(() => {
      fixture.componentInstance.editAssociateId = 'a-1';
    });

    it('shows the one-time temporary password after a login-password reset', () => {
      fixture.componentInstance.resetPassword();
      httpMock.expectOne('/api/admin/associates/a-1/reset-password').flush({ temporaryPassword: 'Temp1234!' });
      expect(fixture.componentInstance.temporaryPassword).toBe('Temp1234!');
    });

    it('does not reset the transaction password when the confirm is cancelled', () => {
      spyOn(window, 'confirm').and.returnValue(false);
      fixture.componentInstance.resetTransactionPassword();
      httpMock.expectNone('/api/admin/associates/a-1/reset-transaction-password');
      expect(fixture.componentInstance.newTransactionPassword).toBeNull();
    });

    it('shows the new transaction password after a confirmed reset', () => {
      spyOn(window, 'confirm').and.returnValue(true);
      fixture.componentInstance.resetTransactionPassword();
      httpMock.expectOne('/api/admin/associates/a-1/reset-transaction-password').flush({ temporaryPassword: '123456' });
      expect(fixture.componentInstance.newTransactionPassword).toBe('123456');
    });

    it('flags an error when the reset fails', () => {
      fixture.componentInstance.resetPassword();
      httpMock.expectOne('/api/admin/associates/a-1/reset-password').flush({}, { status: 500, statusText: 'err' });
      expect(fixture.componentInstance.resetError).toBeTrue();
    });
  });
});

describe('NewAssociatePanelComponent as MANAGER', () => {
  it('a manager editing an associate has identity and nominee fields locked and skips the nominee save', () => {
    TestBed.configureTestingModule({
      imports: [NewAssociatePanelComponent, HttpClientTestingModule, TranslateModule.forRoot()],
      providers: [{ provide: AuthService, useValue: { getRole: () => 'MANAGER' } }]
    });
    const httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(NewAssociatePanelComponent);
    fixture.componentInstance.editAssociateId = 'a-1';
    fixture.componentInstance.open = true;
    fixture.componentInstance.ngOnChanges({ open: {} as any });
    fixture.detectChanges();
    httpMock.expectOne('/api/admin/associates/a-1').flush({ sponsorUserId: null, position: null });
    httpMock.expectOne('/api/admin/associates/a-1/profile').flush({
      name: 'N', phone: '9876543210', address: 'A', state: 'Delhi', district: 'C', panNumber: 'ABCDE1234F', aadhaarNumber: '123456789012'
    });
    httpMock.expectOne('/api/admin/associates/a-1/nominee').flush({ nomineeName: 'Mom', relation: 'Mother' });
    httpMock.expectOne('/api/admin/associates/a-1/bank-details').flush({});
    fixture.detectChanges();
    const form: AssociateProfileFormComponent = fixture.debugElement.query(By.directive(AssociateProfileFormComponent)).componentInstance;
    for (const f of ['name', 'panNumber', 'aadhaarNumber', 'nomineeName', 'nomineeRelation', 'fatherHusbandName']) {
      expect((form.form.get(f) as any).disabled).withContext(f).toBeTrue();
    }
    for (const f of ['phone', 'email', 'address', 'bankName']) {
      expect((form.form.get(f) as any).enabled).withContext(f).toBeTrue();
    }
    form.form.patchValue({ phone: '9000000000' });
    form.submit();
    const profile = httpMock.expectOne(r => r.method === 'PUT' && r.url.endsWith('/profile'));
    expect(profile.request.body.name).toBe('N');
    expect(profile.request.body.panNumber).toBe('ABCDE1234F');
    expect(profile.request.body.phone).toBe('9000000000');
    profile.flush({});
    httpMock.expectNone(r => r.method === 'PUT' && r.url.endsWith('/nominee'));
    httpMock.verify();
  });
});

describe('NewAssociatePanelComponent sponsor requirement', () => {
  function setup(associates: unknown[]) {
    TestBed.configureTestingModule({
      imports: [NewAssociatePanelComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    });
    const fixture = TestBed.createComponent(NewAssociatePanelComponent);
    const httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne('/api/associates').flush(associates);
    return fixture;
  }

  it('admin and manager rows alone are not tree members, so no sponsor is required', () => {
    const fixture = setup([
      { id: 'a', userId: 'admin', name: 'Admin', role: 'ADMIN', status: 'ACTIVE', hasFreeSlot: false },
      { id: 'm', userId: 'mgr', name: 'Manager', role: 'MANAGER', status: 'ACTIVE', hasFreeSlot: false }
    ]);
    expect(fixture.componentInstance.hasTreeMember).toBeFalse();
  });

  it('an ASSOCIATE row makes a sponsor required', () => {
    const fixture = setup([
      { id: 's', userId: 'VP00001', name: 'Root', role: 'ASSOCIATE', status: 'ACTIVE', hasFreeSlot: true }
    ]);
    expect(fixture.componentInstance.hasTreeMember).toBeTrue();
  });
});
