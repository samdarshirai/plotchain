import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { adminGuard } from './admin.guard';
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

  for (const role of ['ADMIN']) {
    it(`allows navigation when the stored role is ${role}`, () => {
      authService.getRole.and.returnValue(role);
      const result = TestBed.runInInjectionContext(() => adminGuard({} as any, {} as any));
      expect(result).toBeTrue();
    });
  }

  it('redirects to /dashboard when the stored role is ASSOCIATE', () => {
    authService.getRole.and.returnValue('ASSOCIATE');
    const router = TestBed.inject(Router);
    const result = TestBed.runInInjectionContext(() => adminGuard({} as any, {} as any)) as UrlTree;
    expect(result.toString()).toBe(router.parseUrl('/dashboard').toString());
  });

  it('redirects to /dashboard when no role is stored', () => {
    authService.getRole.and.returnValue(null);
    const router = TestBed.inject(Router);
    const result = TestBed.runInInjectionContext(() => adminGuard({} as any, {} as any)) as UrlTree;
    expect(result.toString()).toBe(router.parseUrl('/dashboard').toString());
  });
});
