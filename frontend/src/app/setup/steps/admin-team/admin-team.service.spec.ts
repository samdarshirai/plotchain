import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AdminTeamService } from './admin-team.service';
import {
  CreateAdminRequest,
  CreateAdminResponse,
  AdminSummary,
  UserIdAvailability,
  RolePermissions
} from '../../models/admin-team.model';

describe('AdminTeamService', () => {
  let service: AdminTeamService;
  let httpMock: HttpTestingController;

  const createAdminResponse: CreateAdminResponse = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    userId: 'john.doe',
    role: 'SUPER_ADMIN',
    temporaryPassword: 'TempPass123!'
  };

  const adminSummaries: AdminSummary[] = [
    {
      id: '550e8400-e29b-41d4-a716-446655440000',
      userId: 'john.doe',
      fullName: 'John Doe',
      role: 'SUPER_ADMIN',
      lastActiveAt: '2026-01-15T10:30:00Z'
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440001',
      userId: 'jane.smith',
      fullName: 'Jane Smith',
      role: 'FINANCE',
      lastActiveAt: null
    }
  ];

  const userIdAvailability: UserIdAvailability = {
    available: true
  };

  const rolePermissions: RolePermissions = {
    'SUPER_ADMIN': ['users.manage', 'admins.manage', 'company.edit', 'payments.manage', 'kyc.review'],
    'FINANCE': ['payments.view', 'payments.manage', 'reports.view'],
    'KYC_REVIEWER': ['kyc.view', 'kyc.review', 'users.view'],
    'SUPPORT': ['users.view', 'tickets.manage']
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [AdminTeamService]
    });
    service = TestBed.inject(AdminTeamService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('creates a new admin', () => {
    const request: CreateAdminRequest = {
      userId: 'john.doe',
      fullName: 'John Doe',
      role: 'SUPER_ADMIN',
      temporaryPassword: 'TempPass123!'
    };
    let result: CreateAdminResponse | undefined;
    service.createAdmin(request).subscribe(r => (result = r));

    const req = httpMock.expectOne('/api/company/admins');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush(createAdminResponse);

    expect(result).toEqual(createAdminResponse);
  });

  it('lists all admins', () => {
    let result: AdminSummary[] | undefined;
    service.listAdmins().subscribe(r => (result = r));

    const req = httpMock.expectOne('/api/company/admins');
    expect(req.request.method).toBe('GET');
    req.flush(adminSummaries);

    expect(result).toEqual(adminSummaries);
  });

  it('checks user ID availability', () => {
    const userId = 'john.doe';
    let result: UserIdAvailability | undefined;
    service.checkUserIdAvailable(userId).subscribe(r => (result = r));

    const req = httpMock.expectOne(req => req.url === '/api/company/admins/user-id-available' && req.params.get('userId') === 'john.doe');
    expect(req.request.method).toBe('GET');
    req.flush(userIdAvailability);

    expect(result).toEqual(userIdAvailability);
  });

  it('fetches role permissions', () => {
    let result: RolePermissions | undefined;
    service.getRolePermissions().subscribe(r => (result = r));

    const req = httpMock.expectOne('/api/company/admins/role-permissions');
    expect(req.request.method).toBe('GET');
    req.flush(rolePermissions);

    expect(result).toEqual(rolePermissions);
  });
});
