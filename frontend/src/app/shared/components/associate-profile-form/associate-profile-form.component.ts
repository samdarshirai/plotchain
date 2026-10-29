import { Component, ElementRef, EventEmitter, Input, OnChanges, OnInit, Output, ViewChild, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { Observable } from 'rxjs';
import { PasswordToggleDirective } from '../../directives/password-toggle.directive';
import { InlineBannerComponent } from '../inline-banner/inline-banner.component';
import { FieldErrorComponent } from '../field-error/field-error.component';
import { ErrorSummaryComponent } from '../error-summary/error-summary.component';
import { INDIA_STATE_OPTIONS } from '../../india-states';
import { FormIssue, collectIssues, errorMessage, format } from '../../validation/validation';

const LABELS: Record<string, string> = {
  sponsorUserId: 'Sponsor ID', position: 'Position', name: 'Name', panNumber: 'PAN', aadhaarNumber: 'Aadhaar number',
  email: 'Email', phone: 'Mobile', state: 'State', district: 'District', address: 'Address', postalCode: 'Pincode',
  transactionPassword: 'Transaction password'
};

export interface AssociateProfileValue {
  sponsorUserId: string;
  position: string;
  name: string;
  fatherHusbandName: string;
  panNumber: string;
  aadhaarNumber: string;
  dateOfBirth: string | null;
  gender: string;
  maritalStatus: string;
  email: string | null;
  phone: string;
  state: string;
  district: string;
  address: string;
  postalCode: string;
  nomineeName: string;
  nomineeRelation: string;
  transactionPassword?: string;
}

// The one add-associate form: shared by the associate e-Pin Join screen and the admin "Add Associate"
// modal so every path collects the same complete profile. Projected content (e.g. the pin seal) renders
// at the top of the card.
@Component({
  selector: 'app-associate-profile-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, InlineBannerComponent, FieldErrorComponent, ErrorSummaryComponent, PasswordToggleDirective],
  styleUrl: './associate-profile-form.component.scss',
  template: `
    <form #formEl class="associate-profile-form" [formGroup]="form" [class.was-submitted]="submitAttempted" (ngSubmit)="submit()" novalidate>
      <div class="associate-profile-form__card">
        <app-error-summary [issues]="issues"></app-error-summary>
        <ng-content></ng-content>

        <section class="associate-profile-form__section associate-profile-form__section--7">
          <h2 class="associate-profile-form__heading">{{ 'epinRegister.join.sponsor' | translate }}</h2>
          <div class="associate-profile-form__grid">
            <label class="associate-profile-form__field"><span>{{ 'epinRegister.join.sponsorId' | translate }} <span class="associate-profile-form__req" *ngIf="sponsorRequired">*</span></span>
              <input class="associate-profile-form__input" formControlName="sponsorUserId" (blur)="lookupSponsor()" />
              <app-field-error [message]="err('sponsorUserId')"></app-field-error>
            </label>
            <label class="associate-profile-form__field">{{ 'epinRegister.join.sponsorName' | translate }}
              <input class="associate-profile-form__input" [value]="sponsorName" readonly />
            </label>
            <label class="associate-profile-form__field"><span>{{ 'epinRegister.join.position' | translate }} <span class="associate-profile-form__req" *ngIf="sponsorRequired">*</span></span>
              <select class="associate-profile-form__input" formControlName="position">
                <option value="">{{ 'epinRegister.join.selectPosition' | translate }}</option>
                <option value="L">{{ 'epinRegister.join.left' | translate }}</option>
                <option value="R">{{ 'epinRegister.join.right' | translate }}</option>
              </select>
              <app-field-error [message]="err('position')"></app-field-error>
            </label>
          </div>
        </section>

        <section class="associate-profile-form__section associate-profile-form__section--12">
          <h2 class="associate-profile-form__heading">{{ 'epinRegister.join.personal' | translate }}</h2>
          <div class="associate-profile-form__grid associate-profile-form__grid--4">
            <label class="associate-profile-form__field"><span>{{ 'epinRegister.join.name' | translate }} <span class="associate-profile-form__req">*</span></span>
              <input class="associate-profile-form__input" formControlName="name" />
              <app-field-error [message]="err('name')"></app-field-error>
            </label>
            <label class="associate-profile-form__field">{{ 'epinRegister.join.fatherHusband' | translate }}
              <input class="associate-profile-form__input" formControlName="fatherHusbandName" />
            </label>
            <label class="associate-profile-form__field"><span>PAN <span class="associate-profile-form__req">*</span></span>
              <input class="associate-profile-form__input" formControlName="panNumber" maxlength="10" />
              <app-field-error [message]="err('panNumber')"></app-field-error>
            </label>
            <label class="associate-profile-form__field"><span>{{ 'epinRegister.join.aadhaar' | translate }} <span class="associate-profile-form__req">*</span></span>
              <input class="associate-profile-form__input" formControlName="aadhaarNumber" maxlength="12" inputmode="numeric" />
              <app-field-error [message]="err('aadhaarNumber')"></app-field-error>
            </label>
            <label class="associate-profile-form__field">{{ 'epinRegister.join.dob' | translate }}
              <input class="associate-profile-form__input" type="date" formControlName="dateOfBirth" />
            </label>
            <label class="associate-profile-form__field">{{ 'epinRegister.join.gender' | translate }}
              <select class="associate-profile-form__input" formControlName="gender">
                <option *ngFor="let g of genders" [value]="g">{{ 'epinRegister.join.genders.' + g | translate }}</option>
              </select>
            </label>
            <label class="associate-profile-form__field">{{ 'epinRegister.join.marital' | translate }}
              <select class="associate-profile-form__input" formControlName="maritalStatus">
                <option *ngFor="let m of maritals" [value]="m">{{ 'epinRegister.join.maritals.' + m | translate }}</option>
              </select>
            </label>
          </div>
        </section>

        <section class="associate-profile-form__section associate-profile-form__section--12">
          <h2 class="associate-profile-form__heading">{{ 'epinRegister.join.contact' | translate }}</h2>
          <div class="associate-profile-form__grid associate-profile-form__grid--4">
            <label class="associate-profile-form__field">{{ 'epinRegister.join.email' | translate }}
              <input class="associate-profile-form__input" type="email" formControlName="email" />
              <app-field-error [message]="err('email')"></app-field-error>
            </label>
            <label class="associate-profile-form__field"><span>{{ 'epinRegister.join.mobile' | translate }} <span class="associate-profile-form__req">*</span></span>
              <input class="associate-profile-form__input" formControlName="phone" inputmode="tel" />
              <app-field-error [message]="err('phone')"></app-field-error>
            </label>
            <label class="associate-profile-form__field"><span>{{ 'epinRegister.join.state' | translate }} <span class="associate-profile-form__req">*</span></span>
              <select class="associate-profile-form__input" formControlName="state">
                <option value="">{{ 'epinRegister.join.selectState' | translate }}</option>
                <option *ngFor="let s of states" [value]="s">{{ s }}</option>
              </select>
              <app-field-error [message]="err('state')"></app-field-error>
            </label>
            <label class="associate-profile-form__field"><span>{{ 'epinRegister.join.district' | translate }} <span class="associate-profile-form__req">*</span></span>
              <input class="associate-profile-form__input" formControlName="district" />
              <app-field-error [message]="err('district')"></app-field-error>
            </label>
            <label class="associate-profile-form__field associate-profile-form__field--wide"><span>{{ 'epinRegister.join.address' | translate }} <span class="associate-profile-form__req">*</span></span>
              <input class="associate-profile-form__input" formControlName="address" />
              <app-field-error [message]="err('address')"></app-field-error>
            </label>
            <label class="associate-profile-form__field">{{ 'epinRegister.join.postalCode' | translate }}
              <input class="associate-profile-form__input" formControlName="postalCode" placeholder="Zip Code" inputmode="numeric" maxlength="6" />
              <app-field-error [message]="err('postalCode')"></app-field-error>
            </label>
          </div>
        </section>

        <section class="associate-profile-form__section associate-profile-form__section--7">
          <h2 class="associate-profile-form__heading">{{ 'epinRegister.join.nominee' | translate }}</h2>
          <div class="associate-profile-form__grid">
            <label class="associate-profile-form__field">{{ 'epinRegister.join.nomineeName' | translate }}
              <input class="associate-profile-form__input" formControlName="nomineeName" />
            </label>
            <label class="associate-profile-form__field">{{ 'epinRegister.join.relation' | translate }}
              <input class="associate-profile-form__input" formControlName="nomineeRelation" />
            </label>
          </div>
        </section>

        <section class="associate-profile-form__section associate-profile-form__section--5" *ngIf="showTransactionPassword">
          <h2 class="associate-profile-form__heading">{{ 'epins.passwordLabel' | translate }}</h2>
          <label class="associate-profile-form__field"><span>{{ 'epins.passwordLabel' | translate }} <span class="associate-profile-form__req">*</span></span>
            <input class="associate-profile-form__input" type="password" appPasswordToggle autocomplete="off" formControlName="transactionPassword" />
            <app-field-error [message]="err('transactionPassword')"></app-field-error>
          </label>
        </section>

        <app-inline-banner *ngIf="error || formError" class="associate-profile-form__banner" tone="danger">{{ (error || formError) | translate }}</app-inline-banner>
      </div>

      <div class="associate-profile-form__footer">
        <button type="button" class="associate-profile-form__cancel" (click)="cancelled.emit()">{{ 'epinRegister.join.cancel' | translate }}</button>
        <button type="submit" class="associate-profile-form__submit" [disabled]="busy">{{ submitLabel | translate }}</button>
      </div>
    </form>
  `
})
export class AssociateProfileFormComponent implements OnInit, OnChanges {
  private fb = inject(FormBuilder);

  /** Join requires a sponsor + leg; admin relaxes it only while the tree is still empty. */
  @Input() sponsorRequired = true;
  @Input() showTransactionPassword = false;
  @Input() busy = false;
  /** Translation key of a banner error shown above the footer. */
  @Input() error = '';
  @Input() submitLabel = 'epinRegister.submit';
  /** Sponsor userId / leg to prefill (e.g. the clicked vacant tree slot). */
  @Input() presetSponsorUserId = '';
  @Input() presetPosition = '';
  /** Resolves a sponsor userId to a display name; join and admin use different endpoints. */
  @Input() sponsorLookup: ((userId: string) => Observable<{ name: string } | null>) | null = null;
  /** Field errors from the server, keyed by control name. */
  @Input() serverErrors: Record<string, string> = {};
  @Output() submitted = new EventEmitter<AssociateProfileValue>();
  @Output() cancelled = new EventEmitter<void>();

  readonly states = INDIA_STATE_OPTIONS;
  readonly genders = ['MALE', 'FEMALE', 'OTHER'];
  readonly maritals = ['SINGLE', 'MARRIED', 'OTHER'];

  @ViewChild('formEl') private formEl?: ElementRef<HTMLFormElement>;
  formError = '';
  sponsorName = '';
  submitAttempted = false;
  issues: FormIssue[] = [];

  form = this.fb.nonNullable.group({
    sponsorUserId: [''],
    position: [''],
    name: ['', Validators.required],
    fatherHusbandName: [''],
    panNumber: ['', [Validators.required, format('pan')]],
    aadhaarNumber: ['', [Validators.required, format('aadhaar')]],
    dateOfBirth: [''],
    gender: ['MALE'],
    maritalStatus: ['SINGLE'],
    email: ['', Validators.email],
    phone: ['', [Validators.required, format('phone')]],
    state: ['', Validators.required],
    district: ['', Validators.required],
    address: ['', Validators.required],
    postalCode: ['', format('pincode')],
    nomineeName: [''],
    nomineeRelation: [''],
    transactionPassword: ['']
  });

  ngOnInit(): void { this.syncValidators(); this.applyPreset(); }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['serverErrors'] && this.submitAttempted) { this.issues = collectIssues(this.form, LABELS, this.serverErrors); }
    if (changes['sponsorRequired'] || changes['showTransactionPassword']) { this.syncValidators(); }
    if ((changes['presetSponsorUserId'] || changes['presetPosition']) && !changes['presetSponsorUserId']?.firstChange) { this.applyPreset(); }
  }

  private syncValidators(): void {
    const sponsorValidators = this.sponsorRequired ? [Validators.required] : [];
    this.form.controls.sponsorUserId.setValidators(sponsorValidators);
    this.form.controls.position.setValidators(sponsorValidators);
    this.form.controls.transactionPassword.setValidators(this.showTransactionPassword ? [Validators.required] : []);
    Object.values(this.form.controls).forEach(c => c.updateValueAndValidity({ emitEvent: false }));
  }

  private applyPreset(): void {
    if (!this.presetSponsorUserId) { return; }
    this.form.patchValue({ sponsorUserId: this.presetSponsorUserId, position: this.presetPosition });
    this.lookupSponsor();
  }

  /** Back to a blank form (admin modal re-open). */
  reset(): void {
    this.form.reset();
    this.sponsorName = '';
    this.submitAttempted = false;
    this.issues = [];
    this.applyPreset();
  }

  /** Scrolls to and focuses the first invalid field (the modal is long; errors can be off-screen). */
  focusFirstError(): void {
    setTimeout(() => {
      const el = this.formEl?.nativeElement.querySelector<HTMLElement>('input.ng-invalid, select.ng-invalid')
        ?? this.formEl?.nativeElement.querySelector<HTMLElement>('.field-error')?.closest('label')?.querySelector<HTMLElement>('input, select');
      el?.scrollIntoView({ block: 'center' });
      el?.focus({ preventScroll: true });
    });
  }

  clearTransactionPassword(): void { this.form.controls.transactionPassword.setValue(''); }

  err(control: string): string | undefined {
    const c = this.form.get(control);
    if (this.serverErrors[control]) { return this.serverErrors[control]; }
    if (!c || !c.invalid || !(c.touched || this.submitAttempted)) { return undefined; }
    return errorMessage(c, LABELS[control]);
  }

  lookupSponsor(): void {
    this.sponsorName = '';
    const id = this.form.controls.sponsorUserId.value.trim();
    if (id && this.sponsorLookup) {
      this.sponsorLookup(id).subscribe({ next: r => (this.sponsorName = r?.name ?? ''), error: () => undefined });
    }
  }

  submit(): void {
    this.submitAttempted = true;
    this.form.markAllAsTouched();
    this.formError = '';
    this.issues = collectIssues(this.form, LABELS);
    if (this.form.invalid) {
      this.formError = '';
      this.focusFirstError();
      return;
    }
    const v = this.form.getRawValue();
    const { transactionPassword, ...rest } = v;
    this.submitted.emit({
      ...rest,
      sponsorUserId: v.sponsorUserId.trim(),
      name: v.name.trim(),
      dateOfBirth: v.dateOfBirth || null,
      email: v.email.trim() || null,
      ...(this.showTransactionPassword ? { transactionPassword } : {})
    });
  }
}
