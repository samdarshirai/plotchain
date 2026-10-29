import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
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
          <div class="new-associate-panel__modal-title">{{ 'admin.associateDirectory.provisionModalTitle' | translate }}</div>
          <p class="new-associate-panel__modal-subtitle">{{ 'admin.associateDirectory.provisionModalSubtitle' | translate }}</p>

          <app-associate-profile-form
            [sponsorRequired]="associates.length > 0"
            [busy]="busy"
            [error]="submitError"
            [serverErrors]="serverErrors"
            [presetSponsorUserId]="presetParent?.parentUserId ?? ''"
            [presetPosition]="presetParent?.leg ?? ''"
            [sponsorLookup]="sponsorLookup"
            submitLabel="admin.associateDirectory.provisionSubmitAction"
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

  @Input() open = false;
  @Input() presetParent: PresetParent | null = null;
  @Output() closed = new EventEmitter<void>();
  @Output() created = new EventEmitter<CreateAssociateResponse>();

  provisioned: CreateAssociateResponse | null = null;
  submitError = '';
  serverErrors: Record<string, string> = {};
  busy = false;
  // Sponsor is required once the tree has anyone in it; the very first associate is necessarily parentless.
  associates: AssociateSummary[] = [];

  sponsorLookup = (userId: string) => of(this.associates.find(a => a.userId === userId) ?? null);

  ngOnInit(): void {
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
    }
  }

  cancel(): void {
    this.closed.emit();
  }

  onSubmit(v: AssociateProfileValue): void {
    this.serverErrors = {};
    this.submitError = '';
    this.busy = true;
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
