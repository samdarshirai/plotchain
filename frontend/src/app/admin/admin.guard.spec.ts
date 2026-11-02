import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { adminGuard, notManagerGuard } from './admin.guard';
import { AuthService } from '../auth/auth.service';

describe('adminGuard', () => {
  let authService: jasmine.SpyObj<AuthService>;

  beforeEach(() => {
    authService = jasmine.createSpyObj('AuthService', ['getRole']);
    TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      providers: [{ provide: AuthService, useValue: authService }]
    });
  });

  for (const role of ['ADMIN', 'MANAGER']) {
    it(`allows navigation when the stored role is ${role}`, () => {
      authService.getRole.and.returnValue(role);
      const result = TestBed.runInInjectionContext(() => adminGuard({} as any, {} as any));
      expect(result).toBeTrue();
    });
  }

  it('redirects to /admin/login when the stored role is ASSOCIATE', () => {
    authService.getRole.and.returnValue('ASSOCIATE');
    const router = TestBed.inject(Router);
    const result = TestBed.runInInjectionContext(() => adminGuard({} as any, {} as any)) as UrlTree;
    expect(result.toString()).toBe(router.parseUrl('/admin/login').toString());
  });

  it('redirects to /admin/login when no role is stored', () => {
    authService.getRole.and.returnValue(null);
    const router = TestBed.inject(Router);
    const result = TestBed.runInInjectionContext(() => adminGuard({} as any, {} as any)) as UrlTree;
    expect(result.toString()).toBe(router.parseUrl('/admin/login').toString());
  });
});

describe('notManagerGuard', () => {
  function run(role: string): boolean | UrlTree {
    TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      providers: [{ provide: AuthService, useValue: { getRole: () => role } }]
    });
    return TestBed.runInInjectionContext(() => notManagerGuard({} as never, {} as never)) as boolean | UrlTree;
  }

  it('allows ADMIN', () => expect(run('ADMIN')).toBeTrue());

  it('sends a MANAGER to the dashboard', () => {
    const result = run('MANAGER');
    expect(result instanceof UrlTree).toBeTrue();
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/admin/dashboard');
  });
});
