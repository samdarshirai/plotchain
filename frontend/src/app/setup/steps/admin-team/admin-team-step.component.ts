import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subject, of } from 'rxjs';
import { catchError, debounceTime, switchMap, takeUntil } from 'rxjs/operators';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { SidePanelComponent } from '../../../shared/components/side-panel/side-panel.component';
import { ChecklistRowComponent } from '../../../shared/components/checklist-row/checklist-row.component';
import { SetupStepNavComponent } from '../../../shared/components/setup-step-nav/setup-step-nav.component';
import { toFieldErrors } from '../../../core/api/field-errors.model';
import { AdminTeamService } from './admin-team.service';
import { SetupService } from '../../setup.service';
import {
  AdminRole,
  AdminSummary,
  CreateAdminRequest,
  CreateAdminResponse,
  ROLE_OPTIONS,
  RolePermissions
} from '../../models/admin-team.model';

@Component({
  selector: 'app-admin-team-step',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    FieldErrorComponent,
    SidePanelComponent,
    ChecklistRowComponent,
    SetupStepNavComponent
  ],
  template: `
    <div class="admin-team-step">
      <div class="card">
        <h1 class="card-title">{{ 'setup.adminTeam.title' | translate }}</h1>

        <table class="admin-team-step__table">
          <thead>
            <tr>
              <th>{{ 'setup.adminTeam.userIdColumnLabel' | translate }}</th>
              <th>{{ 'setup.adminTeam.fullNameColumnLabel' | translate }}</th>
              <th>{{ 'setup.adminTeam.roleColumnLabel' | translate }}</th>
              <th>{{ 'setup.adminTeam.lastLoginColumnLabel' | translate }}</th>
              <th>{{ 'setup.adminTeam.statusColumnLabel' | translate }}</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let admin of admins">
              <td>{{ admin.userId }}</td>
              <td>{{ admin.fullName }}</td>
              <td>{{ roleLabel(admin.role) | translate }}</td>
              <td>
                <span *ngIf="admin.lastActiveAt">{{ admin.lastActiveAt | date }}</span>
                <span *ngIf="!admin.lastActiveAt">{{ 'setup.adminTeam.neverLoggedInLabel' | translate }}</span>
              </td>
              <td>{{ 'setup.adminTeam.activeStatusLabel' | translate }}</td>
            </tr>
          </tbody>
        </table>

        <button type="button" (click)="openPanel()">{{ 'setup.adminTeam.addAdminButtonLabel' | translate }}</button>
      </div>

      <app-side-panel [open]="panelOpen" [title]="'setup.adminTeam.panelTitle' | translate" (closed)="panelOpen = false">
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

        <form [formGroup]="form" (ngSubmit)="onSubmit()" *ngIf="!createdAdmin">
          <label>
            {{ 'setup.adminTeam.userIdLabel' | translate }}
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

          <label>
            {{ 'setup.adminTeam.fullNameLabel' | translate }}
            <input type="text" formControlName="fullName" (blur)="markTouched('fullName')" />
          </label>
          <app-field-error [message]="fieldError('fullName')"></app-field-error>

          <label>
            {{ 'setup.adminTeam.roleLabel' | translate }}
            <select formControlName="role" (blur)="markTouched('role')">
              <option *ngFor="let option of roleOptions" [value]="option.value">{{ option.labelKey | translate }}</option>
            </select>
          </label>
          <app-field-error [message]="fieldError('role')"></app-field-error>

          <label>
            {{ 'setup.adminTeam.temporaryPasswordLabel' | translate }}
            <input type="password" formControlName="temporaryPassword" />
          </label>
          <button type="button" (click)="generateTemporaryPassword()">
            {{ 'setup.adminTeam.generatePasswordButtonLabel' | translate }}
          </button>
          <app-field-error [message]="fieldError('temporaryPassword')"></app-field-error>

          <h2>{{ 'setup.adminTeam.permissionsPreviewTitle' | translate }}</h2>
          <app-checklist-row
            *ngFor="let permission of currentRolePermissions"
            [label]="permission"
            [complete]="true"
          ></app-checklist-row>

          <button type="submit" [disabled]="form.invalid || userIdAvailable === false">
            {{ 'setup.adminTeam.submitButtonLabel' | translate }}
          </button>
        </form>
      </app-side-panel>

      <app-setup-step-nav [previousPath]="previousPath" [nextPath]="nextPath"></app-setup-step-nav>
    </div>
  `
})
export class AdminTeamStepComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private adminTeamService = inject(AdminTeamService);
  private setupService = inject(SetupService);
  private translate = inject(TranslateService);
  private destroyed$ = new Subject<void>();
  private userIdChanged$ = new Subject<string>();

  readonly roleOptions = ROLE_OPTIONS;
  readonly previousPath = this.setupService.previousStepPath('adminTeam');
  readonly nextPath = this.setupService.nextStepPath('adminTeam');

  admins: AdminSummary[] = [];
  rolePermissions: RolePermissions = {};
  panelOpen = false;
  userIdAvailable: boolean | null = null;
  createdAdmin: CreateAdminResponse | null = null;
  private serverFieldErrors: Record<string, string> = {};

  form = this.fb.nonNullable.group({
    userId: ['', Validators.required],
    fullName: ['', Validators.required],
    role: this.fb.nonNullable.control<AdminRole>(ROLE_OPTIONS[0].value, Validators.required),
    temporaryPassword: ['']
  });

  get currentRolePermissions(): string[] {
    const role = this.form.get('role')?.value;
    return (role && this.rolePermissions[role]) || [];
  }

  ngOnInit(): void {
    this.refreshAdmins();
    this.adminTeamService.getRolePermissions().subscribe({
      next: res => {
        this.rolePermissions = res;
      },
      error: () => {
        this.rolePermissions = {};
      }
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
    return ROLE_OPTIONS.find(o => o.value === role)?.labelKey ?? role;
  }

  onUserIdInput(value: string): void {
    this.userIdAvailable = null;
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
        this.createdAdmin = res;
        this.userIdAvailable = null;
        this.form.reset({ userId: '', fullName: '', role: ROLE_OPTIONS[0].value, temporaryPassword: '' });
        this.refreshAdmins();
        this.setupService.refresh();
      },
      error: err => {
        this.serverFieldErrors = toFieldErrors(err);
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
