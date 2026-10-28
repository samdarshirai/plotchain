import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { map } from 'rxjs';
import { EPinRegisterService, EPinUnusedRow, JoinResult } from './epin-register.service';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { AssociateProfileFormComponent, AssociateProfileValue } from '../../shared/components/associate-profile-form/associate-profile-form.component';

// Legacy-portal "Join" screen: registers a new member under my tree and spends this pin.
@Component({
  selector: 'app-epin-join',
  standalone: true,
  imports: [CommonModule, TranslateModule, InlineBannerComponent, AssociateProfileFormComponent],
  styleUrl: './epin-join.component.scss',
  template: `
    <div class="epin-join" (keydown.escape)="back()" (click)="$event.target === $event.currentTarget && !busy && back()">
     <div class="epin-join__modal" role="dialog" aria-modal="true" aria-labelledby="epin-join-title">
      <h1 class="epin-join__title" id="epin-join-title" *ngIf="!result">{{ 'epinRegister.join.title' | translate }}</h1>

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

      <app-associate-profile-form *ngIf="!result" [showTransactionPassword]="true" [busy]="busy" [error]="error"
        [serverErrors]="serverErrors" [sponsorLookup]="sponsorLookup" (submitted)="submit($event)" (cancelled)="back()">
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
      </app-associate-profile-form>
     </div>
    </div>
  `
})
export class EPinJoinComponent implements OnInit {
  private service = inject(EPinRegisterService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  @ViewChild(AssociateProfileFormComponent) profile?: AssociateProfileFormComponent;

  pinId = '';
  pin: EPinUnusedRow | null = null;
  result: JoinResult | null = null;
  error = '';
  busy = false;
  serverErrors: Record<string, string> = {};

  sponsorLookup = (id: string) => this.service.recipient(id).pipe(map(r => ({ name: r.name })));

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

  copied = '';
  copy(key: string, text: string): void {
    navigator.clipboard?.writeText(text).then(() => { this.copied = key; setTimeout(() => (this.copied = ''), 1500); }, () => undefined);
  }

  back(): void { this.router.navigate(['/e-pins/view-new']); }

  submit(v: AssociateProfileValue): void {
    this.serverErrors = {};
    this.error = '';
    this.busy = true;
    this.service.join(this.pinId, { ...v, transactionPassword: v.transactionPassword ?? '' }).subscribe({
      next: r => { this.busy = false; this.result = r; },
      error: (e: HttpErrorResponse) => this.fail(e)
    });
  }

  private fail(e: HttpErrorResponse): void {
    this.busy = false;
    this.profile?.clearTransactionPassword();
    const code = e.error?.code;
    if (e.status === 403 && code === 'EPIN_LOCKED') {
      this.service.lock();
      this.router.navigate(['/e-pins/unlock'], { queryParams: { returnUrl: this.router.url } });
      return;
    }
    if (e.status === 409 && code === 'PAN_TAKEN') { this.serverErrors['panNumber'] = 'PAN already registered'; return; }
    if (e.status === 409 && code === 'AADHAAR_TAKEN') { this.serverErrors['aadhaarNumber'] = 'Aadhaar already registered'; return; }
    if (e.status === 409 && code === 'PHONE_TAKEN') { this.serverErrors['phone'] = 'Phone already registered'; return; }
    this.error = e.status === 401 ? 'epins.errorPasswordInvalid'
      : e.status === 423 ? 'epins.errorPasswordLocked'
      : e.status === 409 && code === 'TRANSACTION_PASSWORD_NOT_SET' ? 'epins.errorPasswordNotSet'
      : e.status === 404 ? 'epinRegister.join.errorSponsor'
      : e.status === 409 ? 'epinRegister.join.errorConflict'
      : e.status === 400 ? 'epinRegister.join.errorInvalid'
      : 'epins.errorGeneric';
  }
}
