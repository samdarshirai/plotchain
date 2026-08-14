import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { DigitalIdCardService } from './digital-id-card.service';
import { AssociateIdCard } from './models/associate-id-card.model';

@Component({
  selector: 'app-digital-id-card',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="digital-id-card card" *ngIf="idCard as card">
      <h1 class="card-title">{{ 'digitalIdCard.title' | translate }}</h1>

      <div class="digital-id-card__photo">
        <img
          *ngIf="card.photoUrl as photoUrl"
          [src]="photoUrl"
          [alt]="card.name"
          class="digital-id-card__photo-img"
        />
        <span
          *ngIf="!card.photoUrl"
          class="digital-id-card__avatar"
          [attr.aria-label]="'digitalIdCard.photoPlaceholderLabel' | translate"
        >{{ initials }}</span>
      </div>

      <dl class="digital-id-card__details">
        <dt>{{ 'digitalIdCard.idNumberLabel' | translate }}</dt>
        <dd class="digital-id-card__id-number">{{ card.idNumber }}</dd>
        <dt>{{ 'digitalIdCard.nameLabel' | translate }}</dt>
        <dd class="digital-id-card__name">{{ card.name }}</dd>
        <dt>{{ 'digitalIdCard.rankLabel' | translate }}</dt>
        <dd class="digital-id-card__rank">{{ card.rank }}</dd>
      </dl>

      <div class="digital-id-card__qr">
        <span class="digital-id-card__qr-label">{{ 'digitalIdCard.qrPayloadLabel' | translate }}</span>
        <code class="digital-id-card__qr-payload">{{ card.qrPayload }}</code>
        <p class="digital-id-card__qr-hint">{{ 'digitalIdCard.qrPayloadHint' | translate }}</p>
      </div>
    </div>
    <p *ngIf="loadError" class="digital-id-card__load-error">{{ 'digitalIdCard.loadError' | translate }}</p>
  `
})
export class DigitalIdCardComponent implements OnInit {
  private digitalIdCardService = inject(DigitalIdCardService);

  idCard: AssociateIdCard | null = null;
  loadError = false;

  // Same algorithm as AuditLogComponent.initials() (frontend/src/app/settings/audit-log/audit-log.component.ts):
  // trim -> split on whitespace -> first 2 words -> first letter of each, uppercased. Reused here
  // rather than extracted into a shared util, matching that component's own precedent of keeping
  // this inline (it's a 6-line pure function, not worth a new shared module for two call sites yet).
  get initials(): string {
    const name = this.idCard?.name ?? '';
    if (!name.trim()) {
      return '';
    }
    return name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0].toUpperCase())
      .join('');
  }

  ngOnInit(): void {
    this.digitalIdCardService.getMyIdCard().subscribe({
      next: card => (this.idCard = card),
      error: () => (this.loadError = true)
    });
  }
}
