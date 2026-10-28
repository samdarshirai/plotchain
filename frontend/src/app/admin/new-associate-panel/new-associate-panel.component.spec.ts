import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { NewAssociatePanelComponent } from './new-associate-panel.component';
import { AssociateProfileFormComponent } from '../../shared/components/associate-profile-form/associate-profile-form.component';
import { By } from '@angular/platform-browser';

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
});
