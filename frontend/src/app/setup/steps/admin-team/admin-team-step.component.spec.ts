import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { AdminTeamStepComponent } from './admin-team-step.component';
import { SetupStepNavComponent } from '../../../shared/components/setup-step-nav/setup-step-nav.component';
import { SetupService } from '../../setup.service';
import { AdminSummary, RolePermissions, ROLE_OPTIONS } from '../../models/admin-team.model';

describe('AdminTeamStepComponent', () => {
  let fixture: ComponentFixture<AdminTeamStepComponent>;
  let httpMock: HttpTestingController;

  const emptyAdmins: AdminSummary[] = [];

  const defaultRolePermissions: RolePermissions = {
    SUPER_ADMIN: ['manage_admins', 'manage_billing'],
    FINANCE: ['view_ledger'],
    KYC_REVIEWER: ['review_kyc'],
    SUPPORT: ['view_tickets']
  };

  function flushInitialLoads(admins = emptyAdmins, rolePermissions = defaultRolePermissions): void {
    httpMock.expectOne('/api/company/admins').flush(admins);
    httpMock.expectOne('/api/company/admins/role-permissions').flush(rolePermissions);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminTeamStepComponent, HttpClientTestingModule, RouterTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(AdminTeamStepComponent);
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(SetupService);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('loads the admin list and role permissions on init', () => {
    const admins: AdminSummary[] = [
      { id: 'a1', userId: 'admin1', fullName: 'Ada Lovelace', role: 'SUPER_ADMIN', lastActiveAt: '2026-07-01T00:00:00Z' },
      { id: 'a2', userId: 'admin2', fullName: 'Grace Hopper', role: 'FINANCE', lastActiveAt: null }
    ];
    flushInitialLoads(admins);
    const component = fixture.componentInstance;

    expect(component.admins).toEqual(admins);
    expect(component.rolePermissions).toEqual(defaultRolePermissions);

    fixture.detectChanges();
    const tableText = fixture.nativeElement.textContent as string;
    expect(tableText).toContain('admin1');
    expect(tableText).toContain('Ada Lovelace');
    expect(tableText).toContain('admin2');
  });

  it('offers only the four ROLE_OPTIONS values in the role select, no ASSOCIATE/ADMIN option', () => {
    flushInitialLoads();
    const component = fixture.componentInstance;
    component.panelOpen = true;
    fixture.detectChanges();

    const select = fixture.debugElement.query(By.css('select[formControlName="role"]'));
    const optionValues = Array.from(select.nativeElement.options as HTMLOptionsCollection).map(
      (o: HTMLOptionElement) => o.value
    );
    expect(optionValues).toEqual(ROLE_OPTIONS.map(o => o.value));
    expect(optionValues).not.toContain('ASSOCIATE');
    expect(optionValues).not.toContain('ADMIN');
  });

  it('checks User ID availability after a 400ms debounce and renders the available hint', fakeAsync(() => {
    flushInitialLoads();
    const component = fixture.componentInstance;
    component.panelOpen = true;
    fixture.detectChanges();

    component.onUserIdInput('newadmin');
    tick(399);
    httpMock.expectNone(req => req.url === '/api/company/admins/user-id-available');
    tick(1);

    const req = httpMock.expectOne(req => req.url === '/api/company/admins/user-id-available');
    expect(req.request.params.get('userId')).toBe('newadmin');
    req.flush({ available: true });

    expect(component.userIdAvailable).toBe(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('setup.adminTeam.userIdAvailableHint');
  }));

  it('renders the taken hint when the userId is not available', fakeAsync(() => {
    flushInitialLoads();
    const component = fixture.componentInstance;
    component.panelOpen = true;
    fixture.detectChanges();

    component.onUserIdInput('takenadmin');
    tick(400);
    const req = httpMock.expectOne(req => req.url === '/api/company/admins/user-id-available');
    req.flush({ available: false });

    expect(component.userIdAvailable).toBe(false);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('setup.adminTeam.userIdTakenHint');
  }));

  it('submits the create-admin form with the correct body, shows the one-time password banner, and refetches the list', fakeAsync(() => {
    flushInitialLoads();
    const component = fixture.componentInstance;
    component.panelOpen = true;
    fixture.detectChanges();

    component.form.setValue({
      userId: 'newadmin',
      fullName: 'New Admin',
      role: 'FINANCE',
      temporaryPassword: 'preview123'
    });
    component.onSubmit();

    const req = httpMock.expectOne('/api/company/admins');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      userId: 'newadmin',
      fullName: 'New Admin',
      role: 'FINANCE',
      temporaryPassword: 'preview123'
    });
    req.flush({ id: 'a9', userId: 'newadmin', role: 'FINANCE', temporaryPassword: 'servergenerated1' });

    expect(component.createdAdmin?.temporaryPassword).toBe('servergenerated1');
    expect(component.panelOpen).toBe(true);

    httpMock.expectOne('/api/company/admins').flush([
      { id: 'a9', userId: 'newadmin', fullName: 'New Admin', role: 'FINANCE', lastActiveAt: null }
    ]);

    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('servergenerated1');

    component.dismissBanner();
    expect(component.createdAdmin).toBeNull();
    expect(component.panelOpen).toBe(false);
  }));

  it('surfaces a duplicate userId 409 as a field error via toFieldErrors', () => {
    flushInitialLoads();
    const component = fixture.componentInstance;
    component.panelOpen = true;
    fixture.detectChanges();

    component.form.setValue({
      userId: 'dupe',
      fullName: 'Dupe Admin',
      role: 'SUPPORT',
      temporaryPassword: ''
    });
    component.onSubmit();

    const req = httpMock.expectOne('/api/company/admins');
    req.flush(
      { error: 'userId already in use', fields: { userId: 'This User ID is already taken' } },
      { status: 409, statusText: 'Conflict' }
    );

    expect(component.fieldError('userId')).toBe('This User ID is already taken');
    fixture.detectChanges();
    const fieldErrorEl = fixture.debugElement.query(By.css('app-field-error'));
    expect(fieldErrorEl.nativeElement.textContent).toContain('This User ID is already taken');
  });

  it('surfaces an invalid role 400 as a field error via toFieldErrors', () => {
    flushInitialLoads();
    const component = fixture.componentInstance;
    component.panelOpen = true;
    fixture.detectChanges();

    component.form.setValue({
      userId: 'someone',
      fullName: 'Someone',
      role: 'SUPPORT',
      temporaryPassword: ''
    });
    component.onSubmit();

    const req = httpMock.expectOne('/api/company/admins');
    req.flush(
      { error: 'invalid role', fields: { role: 'Selected role is not valid' } },
      { status: 400, statusText: 'Bad Request' }
    );

    expect(component.fieldError('role')).toBe('Selected role is not valid');
  });

  it('wires the step-nav to the adjacent setup steps', () => {
    flushInitialLoads();
    const nav = fixture.debugElement.query(By.directive(SetupStepNavComponent));
    expect(nav.componentInstance.previousPath).toBe('payments-kyc');
    expect(nav.componentInstance.nextPath).toBe('root-associates');
  });
});
