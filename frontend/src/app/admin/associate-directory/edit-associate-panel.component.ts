import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { SidePanelComponent } from '../../shared/components/side-panel/side-panel.component';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { AssociateDirectoryService } from './associate-directory.service';

// Admin-only editor for the fields an associate cannot change themselves (name, DOB, gender,
// marital status, father/husband, nominee, bank) plus the contact fields. Loads the three
// resources on open, saves them together. Labels are plain English (admin back-office screen).
@Component({
  selector: 'app-edit-associate-panel',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, SidePanelComponent, InlineBannerComponent],
  styles: [`
    .edit-associate__grid { display: grid; grid-template-columns: 1fr; gap: 12px; margin-bottom: 20px; }
    @media (min-width: 600px) { .edit-associate__grid { grid-template-columns: 1fr 1fr; } }
    .edit-associate__field { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
    .edit-associate__field input, .edit-associate__field select { min-height: 40px; }
    .edit-associate__heading { margin: 8px 0; font-weight: 600; }
    .edit-associate__actions { display: flex; gap: 8px; flex-wrap: wrap; }
  `],
  template: `
    <app-side-panel [open]="open" [title]="'Edit ' + userId" (closed)="closed.emit()">
      <form *ngIf="open" [formGroup]="form" (ngSubmit)="save()" novalidate>
        <app-inline-banner *ngIf="error" tone="danger">{{ error }}</app-inline-banner>
        <app-inline-banner *ngIf="success" tone="success">Saved.</app-inline-banner>

        <div class="edit-associate__heading">Personal</div>
        <div class="edit-associate__grid">
          <label class="edit-associate__field"><span>Name</span><input type="text" formControlName="name" /></label>
          <label class="edit-associate__field"><span>Father / Husband name</span><input type="text" formControlName="fatherHusbandName" /></label>
          <label class="edit-associate__field"><span>Date of birth</span><input type="date" formControlName="dateOfBirth" /></label>
          <label class="edit-associate__field"><span>Gender</span>
            <select formControlName="gender"><option value=""></option><option *ngFor="let g of genders" [value]="g">{{ g }}</option></select>
          </label>
          <label class="edit-associate__field"><span>Marital status</span>
            <select formControlName="maritalStatus"><option value=""></option><option *ngFor="let m of maritalStatuses" [value]="m">{{ m }}</option></select>
          </label>
        </div>

        <div class="edit-associate__heading">Contact</div>
        <div class="edit-associate__grid">
          <label class="edit-associate__field"><span>Phone</span><input type="text" formControlName="phone" /></label>
          <label class="edit-associate__field"><span>Email</span><input type="email" formControlName="email" /></label>
          <label class="edit-associate__field"><span>Address</span><input type="text" formControlName="address" /></label>
          <label class="edit-associate__field"><span>State</span><input type="text" formControlName="state" /></label>
          <label class="edit-associate__field"><span>District</span><input type="text" formControlName="district" /></label>
          <label class="edit-associate__field"><span>Postal code</span><input type="text" formControlName="postalCode" inputmode="numeric" maxlength="6" /></label>
        </div>

        <div class="edit-associate__heading">Nominee</div>
        <div class="edit-associate__grid">
          <label class="edit-associate__field"><span>Nominee name</span><input type="text" formControlName="nomineeName" /></label>
          <label class="edit-associate__field"><span>Relation</span><input type="text" formControlName="relation" /></label>
        </div>

        <div class="edit-associate__heading">Bank details</div>
        <div class="edit-associate__grid">
          <label class="edit-associate__field"><span>Bank name</span><input type="text" formControlName="bankName" /></label>
          <label class="edit-associate__field"><span>Account holder</span><input type="text" formControlName="accountHolder" /></label>
          <label class="edit-associate__field"><span>Account number</span><input type="text" formControlName="accountNumber" /></label>
          <label class="edit-associate__field"><span>IFSC code</span><input type="text" formControlName="ifscCode" /></label>
          <label class="edit-associate__field"><span>Account type</span>
            <select formControlName="accountType"><option value="SAVINGS">Savings</option><option value="CURRENT">Current</option></select>
          </label>
        </div>

        <div class="edit-associate__actions">
          <button type="submit" class="brand-button" [disabled]="saving || form.invalid">Save changes</button>
          <button type="button" class="brand-button brand-button--secondary" (click)="closed.emit()">Cancel</button>
        </div>
      </form>
    </app-side-panel>
  `
})
export class EditAssociatePanelComponent implements OnChanges {
  @Input() open = false;
  @Input() associateId = '';
  @Input() userId = '';
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  private fb = inject(FormBuilder);
  private service = inject(AssociateDirectoryService);

  readonly genders = ['MALE', 'FEMALE', 'OTHER'];
  readonly maritalStatuses = ['SINGLE', 'MARRIED', 'OTHER'];
  saving = false;
  success = false;
  error?: string;

  form = this.fb.group({
    name: ['', Validators.required],
    fatherHusbandName: [''], dateOfBirth: [''], gender: [''], maritalStatus: [''],
    phone: [''], email: ['', Validators.email], address: [''], state: [''], district: [''], postalCode: [''],
    nomineeName: [''], relation: [''],
    bankName: [''], accountHolder: [''], accountNumber: [''], ifscCode: [''], accountType: ['SAVINGS']
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open'] && this.open && this.associateId) {
      this.success = false;
      this.error = undefined;
      forkJoin([
        this.service.getProfile(this.associateId),
        this.service.getBankDetails(this.associateId),
        this.service.getNominee(this.associateId)
      ]).subscribe({
        next: ([p, b, n]) => this.form.patchValue({
          ...p, ...n,
          bankName: b.bankName ?? '', accountHolder: b.accountHolder ?? '', accountNumber: b.accountNumber ?? '',
          ifscCode: b.ifscCode ?? '', accountType: b.accountType ?? 'SAVINGS'
        } as never),
        error: () => (this.error = 'Could not load associate details.')
      });
    }
  }

  save(): void {
    if (this.form.invalid) {
      return;
    }
    const v = this.form.getRawValue();
    const n = (s: string | null) => s || null;
    const hasBank = !!(v.bankName || v.accountHolder || v.accountNumber || v.ifscCode);
    this.saving = true;
    this.success = false;
    this.error = undefined;
    forkJoin([
      this.service.updateProfile(this.associateId, {
        name: v.name!, fatherHusbandName: n(v.fatherHusbandName), dateOfBirth: n(v.dateOfBirth),
        gender: n(v.gender), maritalStatus: n(v.maritalStatus), phone: n(v.phone), email: n(v.email),
        address: n(v.address), state: n(v.state), district: n(v.district), postalCode: n(v.postalCode)
      }),
      this.service.updateNominee(this.associateId, { nomineeName: n(v.nomineeName), relation: n(v.relation) }),
      hasBank
        ? this.service.updateBankDetails(this.associateId, {
            bankName: v.bankName!, accountHolder: v.accountHolder!, accountNumber: v.accountNumber!,
            ifscCode: v.ifscCode!, accountType: v.accountType as 'CURRENT' | 'SAVINGS'
          })
        : of(null)
    ]).subscribe({
      next: () => {
        this.saving = false;
        this.success = true;
        this.saved.emit();
      },
      error: (err: HttpErrorResponse) => {
        this.saving = false;
        this.error = err.status === 409
          ? (err.error?.error ?? 'Phone number already registered.')
          : 'Could not save. Check all fields (bank needs all five fields, IFSC like SBIN0001234).';
      }
    });
  }
}
