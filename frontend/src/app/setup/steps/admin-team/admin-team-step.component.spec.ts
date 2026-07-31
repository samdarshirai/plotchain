import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { AdminTeamStepComponent } from './admin-team-step.component';
import { SetupStepNavComponent } from '../../../shared/components/setup-step-nav/setup-step-nav.component';
import { SidePanelComponent } from '../../../shared/components/side-panel/side-panel.component';
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

  it('renders the founding ADMIN row using the translated Admin label, not the raw role string', () => {
    // GET /api/company/admins returns every non-ASSOCIATE row, including the founding 'ADMIN'
    // account AdminBootstrapRunner always creates -- so every real install has at least one row
    // shaped like this, even though 'ADMIN' is never an option in ROLE_OPTIONS.
    const admins: AdminSummary[] = [
      { id: 'a0', userId: 'admin', fullName: 'Founding Admin', role: 'ADMIN', lastActiveAt: null }
    ];
    flushInitialLoads(admins);
    const component = fixture.componentInstance;

    expect(component.roleLabel('ADMIN')).toBe('setup.adminTeam.roleAdminLabel');

    fixture.detectChanges();
    const roleCell = fixture.debugElement.query(By.css('tbody tr td:nth-child(3)'));
    expect(roleCell.nativeElement.textContent).toContain('setup.adminTeam.roleAdminLabel');
    expect(roleCell.nativeElement.textContent).not.toContain('ADMIN');
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

  it('cancels a stale in-flight availability request via switchMap when the User ID is edited again', fakeAsync(() => {
    flushInitialLoads();
    const component = fixture.componentInstance;
    component.panelOpen = true;
    fixture.detectChanges();

    component.onUserIdInput('first');
    tick(400);
    const reqFirst = httpMock.expectOne(
      req => req.url === '/api/company/admins/user-id-available' && req.params.get('userId') === 'first'
    );

    // Edit again before the first request resolves -- switchMap must cancel it, not merely
    // subscribe alongside it, so a slow first response can never overwrite a newer result.
    component.onUserIdInput('second');
    tick(400);
    expect(reqFirst.cancelled).toBe(true);

    const reqSecond = httpMock.expectOne(
      req => req.url === '/api/company/admins/user-id-available' && req.params.get('userId') === 'second'
    );
    reqSecond.flush({ available: true });

    expect(component.userIdAvailable).toBe(true);
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

  it('calls SetupService.refresh() after a successful admin creation', fakeAsync(() => {
    flushInitialLoads();
    const component = fixture.componentInstance;
    const setupService = TestBed.inject(SetupService);
    const refreshSpy = spyOn(setupService, 'refresh');
    component.panelOpen = true;
    fixture.detectChanges();

    component.form.setValue({
      userId: 'newadmin2',
      fullName: 'New Admin Two',
      role: 'SUPPORT',
      temporaryPassword: ''
    });
    component.onSubmit();

    httpMock
      .expectOne('/api/company/admins')
      .flush({ id: 'a10', userId: 'newadmin2', role: 'SUPPORT', temporaryPassword: 'servergenerated2' });
    httpMock.expectOne('/api/company/admins').flush([]);

    expect(refreshSpy).toHaveBeenCalled();
  }));

  it('blocks submission client-side when the User ID is known to be taken, without a POST', fakeAsync(() => {
    flushInitialLoads();
    const component = fixture.componentInstance;
    component.panelOpen = true;
    fixture.detectChanges();

    component.form.setValue({
      userId: 'takenadmin',
      fullName: 'Taken Admin',
      role: 'SUPPORT',
      temporaryPassword: ''
    });
    component.onUserIdInput('takenadmin');
    tick(400);
    httpMock.expectOne(req => req.url === '/api/company/admins/user-id-available').flush({ available: false });
    fixture.detectChanges();

    expect(component.userIdAvailable).toBe(false);

    const submitButton = fixture.debugElement.query(By.css('button[type="submit"]'));
    expect(submitButton.nativeElement.disabled).toBe(true);

    component.onSubmit();
    httpMock.expectNone('/api/company/admins');
  }));

  it('surfaces a duplicate userId 409 as a submit-level banner, not a field error', () => {
    // The real backend (CompanyExceptionHandler) returns { error: "..." } with no "fields" key
    // for UserIdAlreadyRegisteredException -- toFieldErrors() would return {} for this shape, so
    // this must render as a submit-level message instead of a per-field one.
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
    req.flush({ error: 'User ID already registered: dupe' }, { status: 409, statusText: 'Conflict' });

    expect(component.fieldError('userId')).toBeUndefined();
    expect(component.submitError).toBe('setup.adminTeam.validation.userIdTaken');
    fixture.detectChanges();
    const banner = fixture.debugElement.query(By.css('app-inline-banner'));
    expect(banner.nativeElement.textContent).toContain('setup.adminTeam.validation.userIdTaken');
  });

  it('surfaces an invalid role 400 as a submit-level banner, not a field error', () => {
    // Same real-shape argument as the 409 case above: InvalidAdminRoleException also comes back
    // as a bare { error: "..." } with no "fields" key.
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
    req.flush({ error: 'Invalid admin role: SUPPORT' }, { status: 400, statusText: 'Bad Request' });

    expect(component.fieldError('role')).toBeUndefined();
    expect(component.submitError).toBe('setup.adminTeam.validation.invalidRole');
    fixture.detectChanges();
    const banner = fixture.debugElement.query(By.css('app-inline-banner'));
    expect(banner.nativeElement.textContent).toContain('setup.adminTeam.validation.invalidRole');
  });

  it('clears a stale submitError on the next submit attempt', fakeAsync(() => {
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
    httpMock
      .expectOne('/api/company/admins')
      .flush({ error: 'User ID already registered: dupe' }, { status: 409, statusText: 'Conflict' });
    expect(component.submitError).toBe('setup.adminTeam.validation.userIdTaken');

    component.form.patchValue({ userId: 'freshadmin' });
    component.onSubmit();

    expect(component.submitError).toBeNull();
    const req = httpMock.expectOne('/api/company/admins');
    req.flush({ id: 'a11', userId: 'freshadmin', role: 'SUPPORT', temporaryPassword: 'generated' });
    httpMock.expectOne('/api/company/admins').flush([]);
  }));

  it('clears stale server errors when the User ID input changes again', fakeAsync(() => {
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
    httpMock
      .expectOne('/api/company/admins')
      .flush({ error: 'User ID already registered: dupe' }, { status: 409, statusText: 'Conflict' });
    expect(component.submitError).toBe('setup.adminTeam.validation.userIdTaken');

    component.onUserIdInput('somethingelse');
    tick(400);
    httpMock.expectOne(req => req.url === '/api/company/admins/user-id-available').flush({ available: true });

    expect(component.submitError).toBeNull();
  }));

  it('closing the panel via the backdrop (the (closed) output) clears the one-time password banner too', fakeAsync(() => {
    // (closed) fires on a backdrop click, not just the "Done" button. Both paths must converge
    // on dismissBanner() so createdAdmin never survives into the next time the panel opens.
    flushInitialLoads();
    const component = fixture.componentInstance;
    component.panelOpen = true;
    fixture.detectChanges();

    component.form.setValue({
      userId: 'newadmin3',
      fullName: 'New Admin Three',
      role: 'FINANCE',
      temporaryPassword: 'preview123'
    });
    component.onSubmit();
    httpMock
      .expectOne('/api/company/admins')
      .flush({ id: 'a12', userId: 'newadmin3', role: 'FINANCE', temporaryPassword: 'servergenerated3' });
    httpMock.expectOne('/api/company/admins').flush([]);

    expect(component.createdAdmin).not.toBeNull();
    fixture.detectChanges();

    const sidePanel = fixture.debugElement.query(By.directive(SidePanelComponent));
    sidePanel.componentInstance.closed.emit();

    expect(component.createdAdmin).toBeNull();
    expect(component.panelOpen).toBe(false);
  }));

  it('does not render the inline step-nav when mode is setup (shell owns navigation there)', () => {
    flushInitialLoads();
    const nav = fixture.debugElement.query(By.directive(SetupStepNavComponent));
    expect(nav).toBeNull();
  });

  it('passes the settings mode through to the step-nav', () => {
    flushInitialLoads();
    fixture.componentInstance.mode = 'settings';
    fixture.detectChanges();
    const nav = fixture.debugElement.query(By.directive(SetupStepNavComponent));
    expect(nav.componentInstance.mode).toBe('settings');
  });
});
