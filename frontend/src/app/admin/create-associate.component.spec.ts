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
    req.flush({ associateId: 'assoc-1', temporaryPassword: 'Temp1234!' });

    expect(fixture.componentInstance.temporaryPassword).toBe('Temp1234!');
    expect(fixture.componentInstance.error).toBeFalse();
    expect(fixture.componentInstance.form.get('name')!.value).toBeFalsy();
    expect(fixture.componentInstance.form.get('email')!.value).toBeFalsy();
  });

  it('sets an error flag on a 409 conflict and does not set a temporary password', () => {
    fixture.componentInstance.form.patchValue({ name: 'Jane Doe', email: 'jane@plotchain.test' });
    fixture.componentInstance.onSubmit();

    const req = httpMock.expectOne('/api/associates');
    req.flush({ error: 'Email already registered' }, { status: 409, statusText: 'Conflict' });

    expect(fixture.componentInstance.error).toBeTrue();
    expect(fixture.componentInstance.temporaryPassword).toBeNull();
  });

  it('does not submit when the form is invalid', () => {
    fixture.componentInstance.form.patchValue({ name: '', email: 'not-an-email' });
    fixture.componentInstance.onSubmit();

    httpMock.expectNone('/api/associates');
    expect(fixture.componentInstance.temporaryPassword).toBeNull();
    expect(fixture.componentInstance.error).toBeFalse();
  });
});
