import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { CreateAssociateComponent } from './create-associate.component';

describe('CreateAssociateComponent', () => {
  let fixture: ComponentFixture<CreateAssociateComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreateAssociateComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(CreateAssociateComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    httpMock.expectOne(req => req.url === '/api/associates' && req.method === 'GET').flush([]);
  });

  afterEach(() => httpMock.verify());

  it('renders the temporary password and clears the form on success', () => {
    fixture.componentInstance.form.patchValue({ name: 'Jane Doe', email: 'jane@plotchain.test' });
    fixture.componentInstance.onSubmit();

    const req = httpMock.expectOne('/api/associates');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      name: 'Jane Doe',
      email: 'jane@plotchain.test',
      sponsorId: undefined,
      parentId: undefined,
      position: undefined
    });
    req.flush({ associateId: 'assoc-1', userId: 'VP00001', temporaryPassword: 'Temp1234!' });

    expect(fixture.componentInstance.created?.userId).toBe('VP00001');
    expect(fixture.componentInstance.created?.temporaryPassword).toBe('Temp1234!');
    expect(fixture.componentInstance.submitError).toBeNull();
    expect(fixture.componentInstance.form.get('name')!.value).toBeFalsy();
    expect(fixture.componentInstance.form.get('email')!.value).toBeFalsy();
  });

  it('sets a submit error on a 409 conflict and does not set a temporary password', () => {
    fixture.componentInstance.form.patchValue({ name: 'Jane Doe', email: 'jane@plotchain.test' });
    fixture.componentInstance.onSubmit();

    const req = httpMock.expectOne('/api/associates');
    req.flush({ error: 'Email already registered: jane@plotchain.test' }, { status: 409, statusText: 'Conflict' });

    expect(fixture.componentInstance.submitError).toBeTruthy();
    expect(fixture.componentInstance.created).toBeNull();
  });

  it('does not submit when the form is invalid', () => {
    fixture.componentInstance.form.patchValue({ name: '', email: 'not-an-email' });
    fixture.componentInstance.onSubmit();

    httpMock.expectNone('/api/associates');
    expect(fixture.componentInstance.created).toBeNull();
    expect(fixture.componentInstance.submitError).toBeNull();
  });

  it('submits the selected parent associate UUID from the dropdown', () => {
    fixture.componentInstance.associates = [{ id: '22222222-2222-2222-2222-222222222222', userId: 'VP00001', name: 'Root Left', role: 'ASSOCIATE' }];
    fixture.componentInstance.form.patchValue({
      name: 'Jane Doe',
      email: 'jane@plotchain.test',
      parentId: '22222222-2222-2222-2222-222222222222',
      position: 'L'
    });
    fixture.componentInstance.onSubmit();

    const req = httpMock.expectOne('/api/associates');
    expect(req.request.body.parentId).toBe('22222222-2222-2222-2222-222222222222');
    req.flush({ associateId: 'assoc-1', userId: 'VP00002', temporaryPassword: 'Temp1234!' });
  });

  it('requires a placement position when a parent is selected, and blocks submit until one is chosen', () => {
    fixture.componentInstance.associates = [{ id: '22222222-2222-2222-2222-222222222222', userId: 'VP00001', name: 'Root Left', role: 'ASSOCIATE' }];
    fixture.componentInstance.form.patchValue({
      name: 'Jane Doe',
      email: 'jane@plotchain.test',
      parentId: '22222222-2222-2222-2222-222222222222'
    });

    expect(fixture.componentInstance.form.invalid).toBe(true);
    fixture.componentInstance.onSubmit();
    httpMock.expectNone('/api/associates');

    fixture.componentInstance.onPlacementSelect('L');

    expect(fixture.componentInstance.form.invalid).toBe(false);
    fixture.componentInstance.onSubmit();
    httpMock.expectOne('/api/associates').flush({ associateId: 'assoc-1', userId: 'VP00002', temporaryPassword: 'Temp1234!' });
  });
});
