import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { AdminService } from './admin.service';

@Component({
  selector: 'app-create-associate',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule],
  template: `
    <div class="temporary-password-banner" *ngIf="temporaryPassword">
      <p>
        {{ 'admin.temporaryPasswordLabel' | translate }}:
        <strong>{{ temporaryPassword }}</strong>
      </p>
      <p class="temporary-password-notice">{{ 'admin.temporaryPasswordNotice' | translate }}</p>
    </div>
    <form class="create-associate-form" [formGroup]="form" (ngSubmit)="onSubmit()">
      <h1>{{ 'admin.createAssociateTitle' | translate }}</h1>
      <label>
        {{ 'admin.nameLabel' | translate }}
        <input type="text" formControlName="name" />
      </label>
      <label>
        {{ 'admin.emailLabel' | translate }}
        <input type="email" formControlName="email" />
      </label>
      <label>
        {{ 'admin.sponsorIdLabel' | translate }}
        <input type="text" formControlName="sponsorId" />
      </label>
      <label>
        {{ 'admin.parentIdLabel' | translate }}
        <input type="text" formControlName="parentId" />
      </label>
      <label>
        {{ 'admin.positionLabel' | translate }}
        <select formControlName="position">
          <option value=""></option>
          <option value="L">L</option>
          <option value="R">R</option>
        </select>
      </label>
      <button type="submit" [disabled]="form.invalid">{{ 'admin.submitButton' | translate }}</button>
      <div class="create-associate-error" *ngIf="error">{{ 'admin.createError' | translate }}</div>
    </form>
  `
})
export class CreateAssociateComponent {
  private fb = inject(FormBuilder);
  private adminService = inject(AdminService);

  form = this.fb.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    sponsorId: [''],
    parentId: [''],
    position: ['']
  });
  error = false;
  temporaryPassword: string | null = null;

  onSubmit(): void {
    if (this.form.invalid) {
      return;
    }
    const { name, email, sponsorId, parentId, position } = this.form.getRawValue();
    this.adminService
      .createAssociate({
        name: name!,
        email: email!,
        sponsorId: sponsorId || undefined,
        parentId: parentId || undefined,
        position: position || undefined
      })
      .subscribe({
        next: response => {
          this.error = false;
          this.temporaryPassword = response.temporaryPassword;
          this.form.reset();
        },
        error: () => {
          this.error = true;
          this.temporaryPassword = null;
        }
      });
  }
}
