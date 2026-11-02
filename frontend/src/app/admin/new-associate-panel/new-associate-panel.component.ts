import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { forkJoin, of } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { AssociateDirectoryService } from '../associate-directory/associate-directory.service';
import { AdminService } from '../admin.service';
import { AssociateSummary } from '../models/associate-summary.model';
import { CreateAssociateResponse } from '../models/create-associate-response.model';
import { toFieldErrors } from '../../core/api/field-errors.model';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { AssociateProfileFormComponent, AssociateProfileValue } from '../../shared/components/associate-profile-form/associate-profile-form.component';

export interface PresetParent {
  parentId: string;
  leg: 'L' | 'R';
  parentUserId: string;
  parentName: string;
}

// The sole associate-provisioning UI, shared by the Associate Directory's "New Associate" button
// and Tree Explorer's click-a-vacant-slot flow. It hosts the same app-associate-profile-form the
// associate e-Pin Join screen uses, so every add-associate path collects the full profile. A
// `presetParent` (vacant tree slot) prefills sponsor + leg; the backend walks that leg to its
// first free slot, which for a vacant slot is the clicked parent itself.
@Component({
  selector: 'app-new-associate-panel',
  standalone: true,
  imports: [CommonModule, TranslateModule, InlineBannerComponent, AssociateProfileFormComponent],
  template: `
    <div class="new-associate-panel__modal-overlay" *ngIf="open">
      <div class="new-associate-panel__modal">
        <ng-container *ngIf="provisioned as result; else provisionFormTemplate">
          <div class="new-associate-panel__modal-title">{{ 'admin.associateDirectory.provisionModalTitle' | translate }}</div>
          <app-inline-banner tone="success">
            <p>
              {{ 'admin.assignedUserIdLabel' | translate }}:
              <strong>{{ result.userId }}</strong>
            </p>
            <p>
              {{ 'admin.temporaryPasswordLabel' | translate }}:
              <strong>{{ result.temporaryPassword }}</strong>
            </p>
            <p>
              {{ 'admin.transactionPasswordLabel' | translate }}:
              <strong>{{ result.transactionPassword }}</strong>
            </p>
            <p class="new-associate-panel__modal-banner-notice">{{ 'admin.temporaryPasswordNotice' | translate }}</p>
          </app-inline-banner>
          <div class="new-associate-panel__modal-footer">
            <button type="button" class="new-associate-panel__modal-submit" (click)="finishProvisioning()">
              {{ 'admin.doneButtonLabel' | translate }}
            </button>
          </div>
        </ng-container>

        <ng-template #provisionFormTemplate>
          <div class="new-associate-panel__modal-title">
            {{ (editAssociateId ? 'admin.associateDirectory.editModalTitle' : 'admin.associateDirectory.provisionModalTitle') | translate }}
          </div>
          <p class="new-associate-panel__modal-subtitle">
            {{ (editAssociateId ? 'admin.associateDirectory.editModalSubtitle' : 'admin.associateDirectory.provisionModalSubtitle') | translate }}
          </p>

          <app-inline-banner *ngIf="loadError" tone="danger">{{ 'admin.associateDirectory.editLoadError' | translate }}</app-inline-banner>
          <app-associate-profile-form
            *ngIf="!editAssociateId || initial"
            [sponsorRequired]="!rootMode && hasTreeMember"
            [busy]="busy"
            [error]="submitError"
            [serverErrors]="serverErrors"
            [presetSponsorUserId]="presetParent?.parentUserId ?? ''"
            [presetPosition]="presetParent?.leg ?? ''"
            [sponsorLookup]="sponsorLookup"
            [initial]="initial"
            [lockSponsor]="!!editAssociateId"
            [showBank]="!!editAssociateId"
            [lockedFields]="lockedFields"
            [submitLabel]="editAssociateId ? 'admin.associateDirectory.editSubmitAction' : 'admin.associateDirectory.provisionSubmitAction'"
            (submitted)="onSubmit($event)"
            (cancelled)="cancel()"
          ></app-associate-profile-form>
        </ng-template>
      </div>
    </div>
  `
})
export class NewAssociatePanelComponent implements OnInit, OnChanges {
  private adminService = inject(AdminService);
  private directoryService = inject(AssociateDirectoryService);
  // A manager edits contact + bank details only; identity and nominee fields stay read-only (server enforces too).
  readonly isManager = inject(AuthService).getRole() === 'MANAGER';
  readonly lockedFields = this.isManager
    ? ['name', 'fatherHusbandName', 'panNumber', 'aadhaarNumber', 'dateOfBirth', 'gender', 'maritalStatus', 'nomineeName', 'nomineeRelation']
    : [];

  @Input() open = false;
  @Input() presetParent: PresetParent | null = null;
  /** Set = edit mode: same form, pre-filled from this associate, saves via the admin update endpoints. */
  @Input() editAssociateId: string | null = null;
  /** Onboarding "create the root user": no sponsor, the new associate becomes the top of the tree. */
  @Input() rootMode = false;
  @Output() closed = new EventEmitter<void>();
  @Output() created = new EventEmitter<CreateAssociateResponse>();
  @Output() saved = new EventEmitter<void>();

  provisioned: CreateAssociateResponse | null = null;
  submitError = '';
  serverErrors: Record<string, string> = {};
  busy = false;
  initial: Record<string, string | null> | null = null;
  loadError = false;
  // Sponsor is required once the tree has a member; admin/manager rows are not tree members, and
  // the root user (the first ASSOCIATE) is created parentless via rootMode during onboarding.
  associates: AssociateSummary[] = [];

  get hasTreeMember(): boolean {
    return this.associates.some(a => a.role === 'ASSOCIATE');
  }

  sponsorLookup = (userId: string) => of(this.associates.find(a => a.userId === userId) ?? null);

  ngOnInit(): void {
    if (this.editAssociateId) { return; } // sponsor is locked in edit mode; no lookup list needed
    this.adminService.listAssociates().subscribe({
      next: associates => (this.associates = associates),
      error: () => {
        // Sponsor name lookup degrading to blank is acceptable -- the backend still validates the sponsor.
      }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    // The form is destroyed while closed (ngIf), so re-opening always starts blank.
    if (changes['open'] && this.open) {
      this.provisioned = null;
      this.submitError = '';
      this.serverErrors = {};
      this.busy = false;
      this.initial = null;
      this.loadError = false;
      if (this.editAssociateId) { this.loadForEdit(this.editAssociateId); }
    }
  }

  private loadForEdit(id: string): void {
    const s = this.directoryService;
    forkJoin([s.get(id), s.getProfile(id), s.getNominee(id), s.getBankDetails(id)]).subscribe({
      next: ([d, p, n, b]) => (this.initial = {
        sponsorUserId: d.sponsorUserId, position: d.position,
        name: p.name, fatherHusbandName: p.fatherHusbandName, panNumber: p.panNumber, aadhaarNumber: p.aadhaarNumber,
        dateOfBirth: p.dateOfBirth, gender: p.gender, maritalStatus: p.maritalStatus,
        email: p.email, phone: p.phone, state: p.state, district: p.district, address: p.address, postalCode: p.postalCode,
        nomineeName: n.nomineeName, nomineeRelation: n.relation,
        bankName: b.bankName, accountHolder: b.accountHolder, accountNumber: b.accountNumber,
        ifscCode: b.ifscCode, accountType: b.accountType ?? 'SAVINGS'
      }),
      error: () => (this.loadError = true)
    });
  }

  cancel(): void {
    this.closed.emit();
  }

  onSubmit(v: AssociateProfileValue): void {
    this.serverErrors = {};
    this.submitError = '';
    this.busy = true;
    if (this.editAssociateId) { this.saveEdit(this.editAssociateId, v); return; }
    const { transactionPassword: _unused, ...request } = v;
    this.adminService
      .createAssociate({ ...request, sponsorUserId: request.sponsorUserId || undefined, position: request.position || undefined })
      .subscribe({
        next: response => {
          this.busy = false;
          this.provisioned = response;
          this.created.emit(response);
        },
        error: (err: HttpErrorResponse) => {
          this.busy = false;
          this.handleError(err);
        }
      });
  }

  private saveEdit(id: string, v: AssociateProfileValue): void {
    const n = (x: string | null | undefined) => x || null;
    const hasBank = !!(v.bankName || v.accountHolder || v.accountNumber || v.ifscCode);
    forkJoin([
      this.directoryService.updateProfile(id, {
        name: v.name, fatherHusbandName: n(v.fatherHusbandName), panNumber: v.panNumber, aadhaarNumber: v.aadhaarNumber,
        dateOfBirth: n(v.dateOfBirth), gender: n(v.gender), maritalStatus: n(v.maritalStatus),
        phone: n(v.phone), email: n(v.email), address: n(v.address),
        state: n(v.state), district: n(v.district), postalCode: n(v.postalCode)
      }),
      this.isManager ? of(null) : this.directoryService.updateNominee(id, { nomineeName: n(v.nomineeName), relation: n(v.nomineeRelation) }),
      hasBank
        ? this.directoryService.updateBankDetails(id, {
            bankName: v.bankName!, accountHolder: v.accountHolder!, accountNumber: v.accountNumber!,
            ifscCode: v.ifscCode!, accountType: v.accountType as 'CURRENT' | 'SAVINGS'
          })
        : of(null)
    ]).subscribe({
      next: () => {
        this.busy = false;
        this.saved.emit();
        this.closed.emit();
      },
      error: (err: HttpErrorResponse) => {
        this.busy = false;
        if (err.status === 409 && !err.error?.code) { this.serverErrors = { phone: 'Phone number already registered' }; return; }
        if (err.status === 400 && !Object.keys(toFieldErrors(err)).length) { this.submitError = 'admin.associateDirectory.editSaveError'; return; }
        this.handleError(err);
      }
    });
  }

  private handleError(err: HttpErrorResponse): void {
    const code = err.error?.code;
    if (err.status === 409 && code === 'PAN_TAKEN') { this.serverErrors = { panNumber: 'PAN already registered' }; return; }
    if (err.status === 409 && code === 'AADHAAR_TAKEN') { this.serverErrors = { aadhaarNumber: 'Aadhaar already registered' }; return; }
    if (err.status === 400 && Object.keys(toFieldErrors(err)).length) { this.serverErrors = toFieldErrors(err); return; }
    this.submitError = err.status === 404 ? 'epinRegister.join.errorSponsor'
      : err.status === 409 ? this.conflictKey(err.error?.error)
      : err.status === 400 ? 'epinRegister.join.errorInvalid'
      : 'admin.validation.genericSaveError';
  }

  private conflictKey(backendMessage: string | undefined): string {
    if (backendMessage?.startsWith('Placement already occupied')) { return 'admin.validation.placementUnavailable'; }
    if (backendMessage?.startsWith('Position is required')) { return 'admin.validation.positionRequired'; }
    if (backendMessage === 'No rank tiers are configured; an associate cannot be created without a rank') {
      return 'admin.validation.noRankTiersConfigured';
    }
    return 'admin.validation.genericSaveError';
  }

  finishProvisioning(): void {
    this.closed.emit();
  }
}
