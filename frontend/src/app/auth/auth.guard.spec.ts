import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { authGuard } from './auth.guard';
import { AuthService } from './auth.service';

describe('authGuard', () => {
  let authService: jasmine.SpyObj<AuthService>;

  beforeEach(() => {
    authService = jasmine.createSpyObj('AuthService', ['isAuthenticated', 'currentRealm']);
    TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      providers: [{ provide: AuthService, useValue: authService }]
    });
  });

  it('allows navigation when authenticated', () => {
    authService.isAuthenticated.and.returnValue(true);
    const result = TestBed.runInInjectionContext(() => authGuard({} as any, {} as any));
    expect(result).toBeTrue();
  });

  it('redirects an unauthenticated admin-realm visit to /admin/login', () => {
    authService.isAuthenticated.and.returnValue(false);
    authService.currentRealm.and.returnValue('admin');
    const router = TestBed.inject(Router);
    const result = TestBed.runInInjectionContext(() => authGuard({} as any, {} as any)) as UrlTree;
    expect(result.toString()).toBe(router.parseUrl('/admin/login').toString());
  });

  it('redirects to /login when not authenticated', () => {
    authService.isAuthenticated.and.returnValue(false);
    authService.currentRealm.and.returnValue('associate');
    const router = TestBed.inject(Router);
    const result = TestBed.runInInjectionContext(() => authGuard({} as any, {} as any)) as UrlTree;
    expect(result.toString()).toBe(router.parseUrl('/login').toString());
  });
});
