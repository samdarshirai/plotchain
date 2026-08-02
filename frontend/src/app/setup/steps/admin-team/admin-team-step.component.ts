import { Component, Input, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subject, of } from 'rxjs';
import { catchError, debounceTime, switchMap, takeUntil } from 'rxjs/operators';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';
import { SidePanelComponent } from '../../../shared/components/side-panel/side-panel.component';
import { StatTileComponent } from '../../../shared/components/stat-tile/stat-tile.component';
import { BrandButtonComponent } from '../../../shared/components/brand-button/brand-button.component';
import { SetupStepNavComponent } from '../../../shared/components/setup-step-nav/setup-step-nav.component';
import { toFieldErrors } from '../../../core/api/field-errors.model';
import { AdminTeamService } from './admin-team.service';
import { SetupService } from '../../setup.service';
import {
  AdminRole,
  AdminSummary,
  AssignableAdminRole,
  CreateAdminRequest,
  CreateAdminResponse,
  ROLE_OPTIONS,
  RolePermissions
} from '../../models/admin-team.model';

// No backend seat-limit concept exists yet -- static placeholder matching the mockup's visual
// language ("Total Admins ... / 25 slots"), not a real quota.
const TOTAL_ADMIN_SLOTS = 25;

// No live-presence/session data exists -- "recently active" is used as a proxy for "active now".
const ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000;

@Component({
  selector: 'app-admin-team-step',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    FieldErrorComponent,
    InlineBannerComponent,
    SidePanelComponent,
    StatTileComponent,
    BrandButtonComponent,
    SetupStepNavComponent
  ],
  template: `
    <div class="admin-team-step">
      <div class="admin-team-step__header">
        <div class="admin-team-step__intro">
          <span class="admin-team-step__eyebrow">
            {{ 'setup.adminTeam.stepEyebrowLabel' | translate: { number: stepNumber, count: stepCount } }}
          </span>
          <h1 class="admin-team-step__title">{{ 'setup.steps.adminTeam' | translate }}</h1>
          <p class="admin-team-step__subtitle">{{ 'setup.adminTeam.subtitle' | translate }}</p>
        </div>
        <app-brand-button variant="primary" (clicked)="openPanel()">
          <span class="material-symbols-outlined">person_add</span>
          {{ 'setup.adminTeam.addAdminButtonLabel' | translate }}
        </app-brand-button>
      </div>

      <div class="admin-team-step__stats">
        <app-stat-tile
          [label]="'setup.adminTeam.totalAdminsLabel' | translate"
          [value]="admins.length.toString()"
          [hint]="'setup.adminTeam.totalAdminsHint' | translate: { count: totalAdminSlots }"
        ></app-stat-tile>

        <div class="admin-team-step__stat">
          <span class="admin-team-step__stat-label">{{ 'setup.adminTeam.activeNowLabel' | translate }}</span>
          <div class="admin-team-step__stat-row">
            <span class="admin-team-step__stat-value">{{ activeNowCount }}</span>
            <span class="admin-team-step__stat-dot" aria-hidden="true"></span>
          </div>
        </div>

        <div class="admin-team-step__stat admin-team-step__stat--tier">
          <span class="material-symbols-outlined admin-team-step__stat-icon" aria-hidden="true">workspace_premium</span>
          <span class="admin-team-step__stat-label">{{ 'setup.adminTeam.securityLevelLabel' | translate }}</span>
          <span class="admin-team-step__stat-value">{{ 'setup.adminTeam.securityLevelValue' | translate }}</span>
        </div>
      </div>

      <div class="admin-team-step__directory">
        <div class="admin-team-step__directory-header">
          {{ 'setup.adminTeam.directoryLabel' | translate }}
        </div>
        <ul class="admin-team-step__directory-list">
          <li class="admin-team-step__row" *ngFor="let admin of admins">
            <div class="admin-team-step__identity">
              <span class="admin-team-step__avatar">{{ initials(admin.fullName) }}</span>
              <div class="admin-team-step__identity-text">
                <div class="admin-team-step__name-row">
                  <span class="admin-team-step__name">{{ admin.fullName }}</span>
                  <span
                    class="admin-team-step__role-chip"
                    [class.admin-team-step__role-chip--owner]="admin.role === 'ADMIN'"
                  >
                    {{ roleLabel(admin.role) | translate }}
                  </span>
                </div>
                <span class="admin-team-step__email">{{ admin.userId }}</span>
              </div>
            </div>
            <div class="admin-team-step__meta">
              <div class="admin-team-step__last-login">
                <span class="admin-team-step__last-login-caption">
                  {{ 'setup.adminTeam.lastLoginColumnLabel' | translate }}
                </span>
                <span *ngIf="admin.lastActiveAt">{{ admin.lastActiveAt | date }}</span>
                <span *ngIf="!admin.lastActiveAt">{{ 'setup.adminTeam.neverLoggedInLabel' | translate }}</span>
              </div>
              <button
                type="button"
                class="admin-team-step__overflow"
                [attr.aria-label]="'setup.adminTeam.moreActionsLabel' | translate"
              >
                <span class="material-symbols-outlined">more_vert</span>
              </button>
            </div>
          </li>
        </ul>
      </div>

      <app-side-panel [open]="panelOpen" [title]="'setup.adminTeam.panelTitle' | translate" (closed)="dismissBanner()">
        <div class="admin-team-step__banner" *ngIf="createdAdmin">
          <p>
            {{ 'setup.adminTeam.bannerUserIdLabel' | translate }}:
            <strong>{{ createdAdmin.userId }}</strong>
          </p>
          <p>
            {{ 'setup.adminTeam.bannerTemporaryPasswordLabel' | translate }}:
            <strong>{{ createdAdmin.temporaryPassword }}</strong>
          </p>
          <p class="admin-team-step__banner-notice">{{ 'setup.adminTeam.bannerNoticeLabel' | translate }}</p>
          <button type="button" (click)="dismissBanner()">{{ 'setup.adminTeam.doneButtonLabel' | translate }}</button>
        </div>

        <form class="admin-team-step__form" [formGroup]="form" (ngSubmit)="onSubmit()" *ngIf="!createdAdmin">
          <label class="admin-team-step__field">
            <span class="admin-team-step__field-label">{{ 'setup.adminTeam.userIdLabel' | translate }}</span>
            <input
              type="text"
              formControlName="userId"
              (input)="onUserIdInput($any($event.target).value)"
              (blur)="markTouched('userId')"
            />
          </label>
          <span *ngIf="userIdAvailable === true">{{ 'setup.adminTeam.userIdAvailableHint' | translate }}</span>
          <span *ngIf="userIdAvailable === false">{{ 'setup.adminTeam.userIdTakenHint' | translate }}</span>
          <app-field-error [message]="fieldError('userId')"></app-field-error>

          <label class="admin-team-step__field">
            <span class="admin-team-step__field-label">{{ 'setup.adminTeam.fullNameLabel' | translate }}</span>
            <input type="text" formControlName="fullName" (blur)="markTouched('fullName')" />
          </label>
          <app-field-error [message]="fieldError('fullName')"></app-field-error>

          <label class="admin-team-step__field">
            <span class="admin-team-step__field-label">{{ 'setup.adminTeam.roleLabel' | translate }}</span>
            <select formControlName="role" (blur)="markTouched('role')">
              <option *ngFor="let option of roleOptions" [value]="option.value">{{ option.labelKey | translate }}</option>
            </select>
          </label>
          <app-field-error [message]="fieldError('role')"></app-field-error>

          <div class="admin-team-step__field">
            <span class="admin-team-step__field-label">{{ 'setup.adminTeam.temporaryPasswordLabel' | translate }}</span>
            <div class="admin-team-step__password-row">
              <input type="password" formControlName="temporaryPassword" />
              <app-brand-button type="button" variant="secondary" (clicked)="generateTemporaryPassword()">
                {{ 'setup.adminTeam.generatePasswordButtonLabel' | translate }}
              </app-brand-button>
            </div>
          </div>
          <app-field-error [message]="fieldError('temporaryPassword')"></app-field-error>

          <div class="admin-team-step__permissions">
            <span class="admin-team-step__permissions-title">
              {{ 'setup.adminTeam.permissionsPreviewTitle' | translate }}
            </span>
            <div class="admin-team-step__permission-row" *ngFor="let permission of allPermissionLabels">
              <span>{{ permission }}</span>
              <span
                class="material-symbols-outlined admin-team-step__permission-icon"
                [class.admin-team-step__permission-icon--granted]="currentRolePermissions.includes(permission)"
              >
                {{ currentRolePermissions.includes(permission) ? 'check_circle' : 'cancel' }}
              </span>
            </div>
          </div>

          <app-inline-banner *ngIf="submitError" tone="danger">{{ submitError }}</app-inline-banner>

          <app-brand-button type="submit" variant="primary" [fullWidth]="true" [disabled]="form.invalid || userIdAvailable === false">
            {{ 'setup.adminTeam.submitButtonLabel' | translate }}
          </app-brand-button>
        </form>
      </app-side-panel>

      <app-setup-step-nav *ngIf="mode === 'settings'" [mode]="mode"></app-setup-step-nav>
    </div>
  `
})
export class AdminTeamStepComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private adminTeamService = inject(AdminTeamService);
  private setupService = inject(SetupService);
  private translate = inject(TranslateService);
  private route = inject(ActivatedRoute);
  private destroyed$ = new Subject<void>();
  private userIdChanged$ = new Subject<string>();

  @Input() mode: 'setup' | 'settings' = 'setup';

  readonly roleOptions = ROLE_OPTIONS;
  readonly totalAdminSlots = TOTAL_ADMIN_SLOTS;

  admins: AdminSummary[] = [];
  rolePermissions: RolePermissions = {};
  panelOpen = false;
  userIdAvailable: boolean | null = null;
  createdAdmin: CreateAdminResponse | null = null;
  submitError: string | null = null;
  stepNumber = 1;
  stepCount = 1;
  private serverFieldErrors: Record<string, string> = {};

  form = this.fb.nonNullable.group({
    userId: ['', Validators.required],
    fullName: ['', Validators.required],
    role: this.fb.nonNullable.control<AssignableAdminRole>(ROLE_OPTIONS[0].value, Validators.required),
    temporaryPassword: ['']
  });

  get currentRolePermissions(): string[] {
    const role = this.form.get('role')?.value;
    return (role && this.rolePermissions[role]) || [];
  }

  // Union of every permission across all roles -- the Permissions Preview shows a fixed row set
  // with a check/cross per row, not just the current role's granted subset.
  get allPermissionLabels(): string[] {
    return [...new Set(Object.values(this.rolePermissions).flat())];
  }

  // "Active now" has no live-presence/session data behind it -- approximated as "active within
  // the last 24h" from the real lastActiveAt field.
  get activeNowCount(): number {
    const now = Date.now();
    return this.admins.filter(a => a.lastActiveAt && now - new Date(a.lastActiveAt).getTime() < ACTIVE_WINDOW_MS).length;
  }

  ngOnInit(): void {
    this.mode = (this.route.snapshot.data['mode'] as 'setup' | 'settings') ?? 'setup';
    this.refreshAdmins();
    this.adminTeamService.getRolePermissions().subscribe({
      next: res => {
        this.rolePermissions = res;
      },
      error: () => {
        this.rolePermissions = {};
      }
    });

    this.setupService
      .getState()
      .pipe(takeUntil(this.destroyed$))
      .subscribe(state => {
        const step = state.steps.find(s => s.key === 'adminTeam');
        this.stepNumber = step?.number ?? 1;
        this.stepCount = state.steps.length;
      });

    this.userIdChanged$
      .pipe(
        takeUntil(this.destroyed$),
        debounceTime(400),
        // switchMap (not a nested subscribe) so a fresh keystroke cancels any still-in-flight
        // availability request -- otherwise a slow, stale response could resolve after a newer
        // one and overwrite userIdAvailable with outdated data.
        switchMap(value => {
          const trimmed = value.trim();
          if (!trimmed) {
            return of(null);
          }
          return this.adminTeamService.checkUserIdAvailable(trimmed).pipe(catchError(() => of(null)));
        })
      )
      .subscribe(result => {
        this.userIdAvailable = result?.available ?? null;
      });
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  openPanel(): void {
    this.panelOpen = true;
  }

  roleLabel(role: AdminRole): string {
    // 'ADMIN' (the founding account AdminBootstrapRunner always creates) is never assignable
    // through this step's Role select, so it's deliberately absent from ROLE_OPTIONS -- but
    // GET /api/company/admins returns that row too, and every install has at least one. Resolve
    // it separately rather than adding it to ROLE_OPTIONS, which must stay limited to the four
    // assignable roles.
    if (role === 'ADMIN') {
      return 'setup.adminTeam.roleAdminLabel';
    }
    return ROLE_OPTIONS.find(o => o.value === role)?.labelKey ?? role;
  }

  // Derives the avatar glyph from the admin's full name -- first letter of up to the first two
  // words, uppercased. Mirrors settings/audit-log/audit-log.component.ts's initials() exactly.
  initials(fullName: string): string {
    if (!fullName) {
      return '';
    }
    return fullName
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0].toUpperCase())
      .join('');
  }

  onUserIdInput(value: string): void {
    this.userIdAvailable = null;
    this.serverFieldErrors = {};
    this.submitError = null;
    this.userIdChanged$.next(value);
  }

  markTouched(name: string): void {
    this.form.get(name)?.markAsTouched();
  }

  fieldError(name: string): string | undefined {
    if (this.serverFieldErrors[name]) {
      return this.serverFieldErrors[name];
    }
    const control = this.form.get(name);
    if (!control || !control.touched || !control.errors) {
      return undefined;
    }
    if (control.errors['required']) {
      return this.translate.instant('setup.adminTeam.validation.required');
    }
    return undefined;
  }

  generateTemporaryPassword(): void {
    const preview = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    this.form.patchValue({ temporaryPassword: preview });
  }

  onSubmit(): void {
    this.serverFieldErrors = {};
    this.submitError = null;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.userIdAvailable === false) {
      // Known-taken User ID -- block client-side rather than relying solely on the server's 409.
      return;
    }
    const raw = this.form.getRawValue();
    const request: CreateAdminRequest = {
      userId: raw.userId,
      fullName: raw.fullName,
      role: raw.role,
      ...(raw.temporaryPassword ? { temporaryPassword: raw.temporaryPassword } : {})
    };
    this.adminTeamService.createAdmin(request).subscribe({
      next: res => {
        this.serverFieldErrors = {};
        this.submitError = null;
        this.createdAdmin = res;
        this.userIdAvailable = null;
        this.form.reset({ userId: '', fullName: '', role: ROLE_OPTIONS[0].value, temporaryPassword: '' });
        this.refreshAdmins();
        this.setupService.refresh();
      },
      error: err => {
        // CompanyExceptionHandler returns { error: "..." } with NO "fields" key for both of this
        // endpoint's error responses (duplicate userId -> 409, invalid role -> 400) -- unlike
        // bean-validation failures (blank fields), which DO come back with a "fields" object via
        // ApiExceptionHandler. So a non-empty toFieldErrors() result means a real field-level
        // validation error to render inline; an empty result means one of the two bare-message
        // responses, distinguished by status code, surfaced as a submit-level banner instead.
        const fields = toFieldErrors(err);
        if (Object.keys(fields).length > 0) {
          this.serverFieldErrors = fields;
          return;
        }
        if (err.status === 409) {
          this.submitError = this.translate.instant('setup.adminTeam.validation.userIdTaken');
        } else if (err.status === 400) {
          this.submitError = this.translate.instant('setup.adminTeam.validation.invalidRole');
        } else {
          this.submitError = this.translate.instant('setup.adminTeam.validation.genericSaveError');
        }
      }
    });
  }

  dismissBanner(): void {
    this.createdAdmin = null;
    this.panelOpen = false;
  }

  private refreshAdmins(): void {
    this.adminTeamService.listAdmins().subscribe({
      next: res => {
        this.admins = res;
      },
      error: () => {
        this.admins = [];
      }
    });
  }
}
