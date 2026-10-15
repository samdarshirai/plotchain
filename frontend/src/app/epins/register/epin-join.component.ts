import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { EPinRegisterService, EPinUnusedRow, JoinResult } from './epin-register.service';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { FieldErrorComponent } from '../../shared/components/field-error/field-error.component';
import { INDIA_STATE_OPTIONS } from '../../shared/india-states';

// Legacy-portal "Join" screen: registers a new member under my tree and spends this pin.
@Component({
  selector: 'app-epin-join',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, InlineBannerComponent, FieldErrorComponent],
  styleUrl: './epin-join.component.scss',
  template: `
    <div class="epin-join">
      <h1 class="epin-join__title" *ngIf="!result">{{ 'epinRegister.join.title' | translate }}</h1>

      <div class="epin-join__done" *ngIf="result as r">
        <div class="epin-join__done-seal">
          <span class="epin-join__eyebrow">{{ 'epinRegister.join.welcome' | translate }}</span>
          <h2 class="epin-join__done-title">{{ 'epinRegister.join.congrats' | translate }}</h2>
          <p class="epin-join__done-name">{{ r.name }}</p>
          <p class="epin-join__done-sub">{{ 'epinRegister.join.congratsSub' | translate }}</p>
        </div>
        <dl class="epin-join__creds">
          <div class="epin-join__cred"><dt>{{ 'epinRegister.join.resultName' | translate }}</dt><dd>{{ r.name }}</dd></div>
          <div class="epin-join__cred"><dt>{{ 'epinRegister.join.userId' | translate }}</dt><dd class="epin-join__mono">{{ r.userId }}</dd>
            <button type="button" class="epin-join__copy" (click)="copy('id', r.userId)">{{ (copied === 'id' ? 'epinRegister.join.copied' : 'epinRegister.join.copy') | translate }}</button></div>
          <div class="epin-join__cred"><dt>{{ 'epinRegister.join.tempPassword' | translate }}</dt><dd class="epin-join__mono">{{ r.temporaryPassword }}</dd>
            <button type="button" class="epin-join__copy" (click)="copy('login', r.temporaryPassword)">{{ (copied === 'login' ? 'epinRegister.join.copied' : 'epinRegister.join.copy') | translate }}</button></div>
          <div class="epin-join__cred"><dt>{{ 'epinRegister.join.txnPassword' | translate }}</dt><dd class="epin-join__mono">{{ r.transactionPassword }}</dd>
            <button type="button" class="epin-join__copy" (click)="copy('txn', r.transactionPassword)">{{ (copied === 'txn' ? 'epinRegister.join.copied' : 'epinRegister.join.copy') | translate }}</button></div>
        </dl>
        <app-inline-banner tone="warning">{{ 'epinRegister.join.tempPasswordHint' | translate }}</app-inline-banner>
        <button type="button" class="epin-join__submit" (click)="back()">{{ 'epinRegister.join.backToPins' | translate }}</button>
      </div>

      <form class="epin-join__form" [formGroup]="form" (ngSubmit)="submit()" *ngIf="!result" novalidate>
        <div class="epin-join__toolbar">
          <span class="epin-join__crumb">{{ 'epinRegister.join.breadcrumb' | translate }}</span>
          <div class="epin-join__actions">
            <button type="button" class="epin-join__cancel" (click)="back()">{{ 'epinRegister.join.cancel' | translate }}</button>
            <button type="submit" class="epin-join__submit" [disabled]="busy">{{ 'epinRegister.submit' | translate }}</button>
          </div>
        </div>

        <div class="epin-join__card">
          <div class="epin-join__seal">
            <div class="epin-join__seal-row">
              <span class="epin-join__eyebrow">{{ 'epinRegister.join.pinNo' | translate }}</span>
              <span class="epin-join__pin">{{ pin?.code ?? '' }}</span>
            </div>
            <div class="epin-join__seal-row epin-join__seal-row--rule">
              <span class="epin-join__eyebrow">{{ 'epinRegister.join.package' | translate }}</span>
              <span class="epin-join__package"><span class="epin-join__package-name">{{ packageName }}</span> INR {{ pin?.pinValue }}</span>
            </div>
          </div>

          <section class="epin-join__section epin-join__section--7">
            <h2 class="epin-join__heading">{{ 'epinRegister.join.sponsor' | translate }}</h2>
            <div class="epin-join__grid">
              <label class="epin-join__field"><span>{{ 'epinRegister.join.sponsorId' | translate }} <span class="epin-join__req">*</span></span>
                <input class="epin-join__input" formControlName="sponsorUserId" (blur)="lookupSponsor()" />
                <app-field-error [message]="err('sponsorUserId')"></app-field-error>
              </label>
              <label class="epin-join__field">{{ 'epinRegister.join.sponsorName' | translate }}
                <input class="epin-join__input" [value]="sponsorName" readonly />
              </label>
              <label class="epin-join__field"><span>{{ 'epinRegister.join.position' | translate }} <span class="epin-join__req">*</span></span>
                <select class="epin-join__input" formControlName="position">
                  <option value="">{{ 'epinRegister.join.selectPosition' | translate }}</option>
                  <option value="L">{{ 'epinRegister.join.left' | translate }}</option>
                  <option value="R">{{ 'epinRegister.join.right' | translate }}</option>
                </select>
                <app-field-error [message]="err('position')"></app-field-error>
              </label>
            </div>
          </section>

          <section class="epin-join__section epin-join__section--12">
            <h2 class="epin-join__heading">{{ 'epinRegister.join.personal' | translate }}</h2>
            <div class="epin-join__grid epin-join__grid--4">
              <label class="epin-join__field"><span>{{ 'epinRegister.join.name' | translate }} <span class="epin-join__req">*</span></span>
                <input class="epin-join__input" formControlName="name" />
                <app-field-error [message]="err('name')"></app-field-error>
              </label>
              <label class="epin-join__field">{{ 'epinRegister.join.fatherHusband' | translate }}
                <input class="epin-join__input" formControlName="fatherHusbandName" />
              </label>
              <label class="epin-join__field"><span>PAN <span class="epin-join__req">*</span></span>
                <input class="epin-join__input" formControlName="panNumber" maxlength="10" />
                <app-field-error [message]="err('panNumber')"></app-field-error>
              </label>
              <label class="epin-join__field"><span>{{ 'epinRegister.join.aadhaar' | translate }} <span class="epin-join__req">*</span></span>
                <input class="epin-join__input" formControlName="aadhaarNumber" maxlength="12" inputmode="numeric" />
                <app-field-error [message]="err('aadhaarNumber')"></app-field-error>
              </label>
              <label class="epin-join__field">{{ 'epinRegister.join.dob' | translate }}
                <input class="epin-join__input" type="date" formControlName="dateOfBirth" />
              </label>
              <label class="epin-join__field">{{ 'epinRegister.join.gender' | translate }}
                <select class="epin-join__input" formControlName="gender">
                  <option *ngFor="let g of genders" [value]="g">{{ 'epinRegister.join.genders.' + g | translate }}</option>
                </select>
              </label>
              <label class="epin-join__field">{{ 'epinRegister.join.marital' | translate }}
                <select class="epin-join__input" formControlName="maritalStatus">
                  <option *ngFor="let m of maritals" [value]="m">{{ 'epinRegister.join.maritals.' + m | translate }}</option>
                </select>
              </label>
            </div>
          </section>

          <section class="epin-join__section epin-join__section--12">
            <h2 class="epin-join__heading">{{ 'epinRegister.join.contact' | translate }}</h2>
            <div class="epin-join__grid epin-join__grid--4">
              <label class="epin-join__field">{{ 'epinRegister.join.email' | translate }}
                <input class="epin-join__input" type="email" formControlName="email" />
                <app-field-error [message]="err('email')"></app-field-error>
              </label>
              <label class="epin-join__field"><span>{{ 'epinRegister.join.mobile' | translate }} <span class="epin-join__req">*</span></span>
                <input class="epin-join__input" formControlName="phone" inputmode="tel" />
                <app-field-error [message]="err('phone')"></app-field-error>
              </label>
              <label class="epin-join__field"><span>{{ 'epinRegister.join.state' | translate }} <span class="epin-join__req">*</span></span>
                <select class="epin-join__input" formControlName="state">
                  <option value="">{{ 'epinRegister.join.selectState' | translate }}</option>
                  <option *ngFor="let s of states" [value]="s">{{ s }}</option>
                </select>
                <app-field-error [message]="err('state')"></app-field-error>
              </label>
              <label class="epin-join__field"><span>{{ 'epinRegister.join.district' | translate }} <span class="epin-join__req">*</span></span>
                <input class="epin-join__input" formControlName="district" />
                <app-field-error [message]="err('district')"></app-field-error>
              </label>
              <label class="epin-join__field epin-join__field--wide"><span>{{ 'epinRegister.join.address' | translate }} <span class="epin-join__req">*</span></span>
                <input class="epin-join__input" formControlName="address" />
                <app-field-error [message]="err('address')"></app-field-error>
              </label>
              <label class="epin-join__field">{{ 'epinRegister.join.postalCode' | translate }}
                <input class="epin-join__input" formControlName="postalCode" placeholder="Zip Code" />
              </label>
            </div>
          </section>

          <section class="epin-join__section epin-join__section--7">
            <h2 class="epin-join__heading">{{ 'epinRegister.join.nominee' | translate }}</h2>
            <div class="epin-join__grid">
              <label class="epin-join__field">{{ 'epinRegister.join.nomineeName' | translate }}
                <input class="epin-join__input" formControlName="nomineeName" />
              </label>
              <label class="epin-join__field">{{ 'epinRegister.join.relation' | translate }}
                <input class="epin-join__input" formControlName="nomineeRelation" />
              </label>
            </div>
          </section>

          <section class="epin-join__section epin-join__section--5">
            <h2 class="epin-join__heading">{{ 'epins.passwordLabel' | translate }}</h2>
            <label class="epin-join__field"><span>{{ 'epins.passwordLabel' | translate }} <span class="epin-join__req">*</span></span>
              <input class="epin-join__input" type="password" autocomplete="off" formControlName="transactionPassword" />
              <app-field-error [message]="err('transactionPassword')"></app-field-error>
            </label>
          </section>

          <app-inline-banner *ngIf="error" class="epin-join__banner" tone="danger">{{ error | translate }}</app-inline-banner>
        </div>
      </form>
    </div>
  `
})
export class EPinJoinComponent implements OnInit {
  private fb = inject(FormBuilder);
  private service = inject(EPinRegisterService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly states = INDIA_STATE_OPTIONS;
  readonly genders = ['MALE', 'FEMALE', 'OTHER'];
  readonly maritals = ['SINGLE', 'MARRIED', 'OTHER'];

  pinId = '';
  pin: EPinUnusedRow | null = null;
  sponsorName = '';
  result: JoinResult | null = null;
  error = '';
  busy = false;
  submitted = false;
  private serverErrors: Record<string, string> = {};

  form = this.fb.nonNullable.group({
    sponsorUserId: ['', Validators.required],
    position: ['', Validators.required],
    name: ['', Validators.required],
    fatherHusbandName: [''],
    panNumber: ['', [Validators.required, Validators.pattern(/^[A-Z]{5}[0-9]{4}[A-Z]$/)]],
    aadhaarNumber: ['', [Validators.required, Validators.pattern(/^[0-9]{12}$/)]],
    dateOfBirth: [''],
    gender: ['MALE'],
    maritalStatus: ['SINGLE'],
    email: ['', Validators.email],
    phone: ['', [Validators.required, Validators.pattern(/^[+]?[0-9]{10,15}$/)]],
    state: ['', Validators.required],
    district: ['', Validators.required],
    address: ['', Validators.required],
    postalCode: [''],
    nomineeName: [''],
    nomineeRelation: [''],
    transactionPassword: ['', Validators.required]
  });

  get packageLabel(): string { return this.pin ? `${this.packageName} (INR ${this.pin.pinValue})` : ''; }

  get packageName(): string {
    return this.pin ? (this.pin.pinType === 'TOPUP' ? 'Top-up' : 'Registration') : '';
  }

  ngOnInit(): void {
    this.pinId = this.route.snapshot.paramMap.get('pinId') ?? '';
    // The list row is masked, so always fetch the unmasked pin (my unused pins, capped at 100).
    this.service.unused('', '', false, 0, 100).subscribe({
      next: res => (this.pin = res.rows.find(r => r.id === this.pinId) ?? null),
      error: () => undefined
    });
  }

  err(control: string): string | undefined {
    const c = this.form.get(control);
    if (this.serverErrors[control]) { return this.serverErrors[control]; }
    if (!c || !c.invalid || !(c.touched || this.submitted)) { return undefined; }
    return c.errors?.['required'] ? 'Required'
      : control === 'panNumber' ? 'Format: ABCDE1234F'
      : control === 'aadhaarNumber' ? '12 digits'
      : control === 'phone' ? '10-15 digits'
      : control === 'email' ? 'Invalid email' : 'Invalid';
  }

  lookupSponsor(): void {
    this.sponsorName = '';
    const id = this.form.controls.sponsorUserId.value.trim();
    if (id) { this.service.recipient(id).subscribe({ next: r => (this.sponsorName = r.name), error: () => undefined }); }
  }

  copied = '';
  copy(key: string, text: string): void {
    navigator.clipboard?.writeText(text).then(() => { this.copied = key; setTimeout(() => (this.copied = ''), 1500); }, () => undefined);
  }

  back(): void { this.router.navigate(['/e-pins/view-new']); }

  submit(): void {
    this.submitted = true;
    this.serverErrors = {};
    this.error = '';
    this.form.markAllAsTouched();
    if (this.form.invalid) { return; }
    const v = this.form.getRawValue();
    this.busy = true;
    this.service.join(this.pinId, {
      ...v,
      sponsorUserId: v.sponsorUserId.trim(),
      name: v.name.trim(),
      dateOfBirth: v.dateOfBirth || null,
      email: v.email.trim() || null
    }).subscribe({
      next: r => { this.busy = false; this.result = r; },
      error: (e: HttpErrorResponse) => this.fail(e)
    });
  }

  private fail(e: HttpErrorResponse): void {
    this.busy = false;
    this.form.controls.transactionPassword.setValue('');
    const code = e.error?.code;
    if (e.status === 403 && code === 'EPIN_LOCKED') {
      this.service.lock();
      this.router.navigate(['/e-pins/unlock'], { queryParams: { returnUrl: this.router.url } });
      return;
    }
    if (e.status === 409 && code === 'PAN_TAKEN') { this.serverErrors['panNumber'] = 'PAN already registered'; return; }
    if (e.status === 409 && code === 'AADHAAR_TAKEN') { this.serverErrors['aadhaarNumber'] = 'Aadhaar already registered'; return; }
    this.error = e.status === 401 ? 'epins.errorPasswordInvalid'
      : e.status === 423 ? 'epins.errorPasswordLocked'
      : e.status === 409 && code === 'TRANSACTION_PASSWORD_NOT_SET' ? 'epins.errorPasswordNotSet'
      : e.status === 404 ? 'epinRegister.join.errorSponsor'
      : e.status === 409 ? 'epinRegister.join.errorConflict'
      : e.status === 400 ? 'epinRegister.join.errorInvalid'
      : 'epins.errorGeneric';
  }
}
