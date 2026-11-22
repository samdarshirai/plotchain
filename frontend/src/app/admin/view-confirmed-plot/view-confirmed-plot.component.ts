import { catchError, of, concat, last } from 'rxjs';
import { Component, OnInit, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AdminService } from '../admin.service';
import { AssociateSummary } from '../models/associate-summary.model';
import { Project } from '../../setup/models/project.model';
import { ProjectsService } from '../../setup/steps/projects/projects.service';
import { BookingsEmiService } from '../admin-bookings-emi/bookings-emi.service';
import { FlashMessage, PaymentPage, PaymentRow } from '../admin-bookings-emi/bookings-emi.model';
import { Booking, PAYMENT_MODES, PaymentMode } from '../../plot-bookings/models/associate-booking-page.model';
import { formatMoney, utcDate } from '../admin-bookings-emi/bookings-emi.util';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { FieldErrorComponent } from '../../shared/components/field-error/field-error.component';
import { formatArea } from '../../shared/utils/plot-grid.util';
import { fetchAllPages } from '../../shared/utils/fetch-all-pages';
import { TableToolsComponent } from '../../shared/components/table-tools/table-tools.component';
import { AssociateCycleFilterComponent } from '../../shared/components/associate-cycle-filter/associate-cycle-filter.component';

type Status = 'ENTERED' | 'PAID';
const isoDate = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const keyOf = (r: PaymentRow): string => `${r.bookingId}#${r.installmentNumber}`;

@Component({
  selector: 'app-view-confirmed-plot',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['../add-plot-emi/add-plot-emi.component.scss'],
  imports: [TableToolsComponent, CommonModule, FormsModule, TranslateModule, InlineBannerComponent, FieldErrorComponent, AssociateCycleFilterComponent],
  template: `
    <div class="add-plot-emi">
      <div class="add-plot-emi__intro">
        <span class="add-plot-emi__eyebrow">{{ 'admin.addPlotEmi.eyebrow' | translate }}</span>
        <h1 class="add-plot-emi__title">{{ 'admin.viewConfirmedPlot.title' | translate }}</h1>
        <p class="add-plot-emi__subtitle">{{ 'admin.viewConfirmedPlot.subtitle' | translate }}</p>
      </div>

      <div class="add-plot-emi__filters">
        <label class="add-plot-emi__field">{{ 'admin.viewConfirmedPlot.from' | translate }}
          <input type="date" name="from" [value]="from" [attr.max]="to || null" (change)="onDate('from', $any($event.target).value)" />
        </label>
        <label class="add-plot-emi__field">{{ 'admin.viewConfirmedPlot.to' | translate }}
          <input type="date" name="to" [value]="to" [attr.min]="from || null" (change)="onDate('to', $any($event.target).value)" />
        </label>
        <label class="add-plot-emi__field">{{ 'admin.addPlotEmi.project' | translate }}
          <select name="project" (change)="onProject($any($event.target).value)">
            <option *ngFor="let p of projects" [value]="p.id" [selected]="p.id === projectId">{{ p.name }}</option>
          </select>
        </label>
        <label class="add-plot-emi__field">{{ 'admin.salesRegister.plotNoFilterLabel' | translate }}
          <input type="text" name="plotNo" [value]="plotNo" [placeholder]="'admin.emiReport.plotIdPlaceholder' | translate"
            (change)="onPlot($any($event.target).value)" />
        </label>
        <app-associate-cycle-filter [from]="from" [to]="to" [associateId]="associateId"
          (associateChange)="onAssociate($event)" (rangeChange)="onRange($event)"></app-associate-cycle-filter>
      </div>
      <app-field-error [message]="rangeError ? ('admin.addPlotEmi.rangeError' | translate) : undefined"></app-field-error>

      <div class="add-plot-emi__filters" role="group">
        <button type="button" class="brand-button add-plot-emi__btn" [class.brand-button--secondary]="status !== 'ENTERED'"
          [attr.aria-pressed]="status === 'ENTERED'" [disabled]="busy" (click)="setStatus('ENTERED')">{{ 'admin.viewConfirmedPlot.pending' | translate }}</button>
        <button type="button" class="brand-button add-plot-emi__btn" [class.brand-button--secondary]="status !== 'PAID'"
          [attr.aria-pressed]="status === 'PAID'" [disabled]="busy" (click)="setStatus('PAID')">{{ 'admin.viewConfirmedPlot.confirmed' | translate }}</button>
      </div>

      <app-inline-banner *ngIf="banner" [tone]="banner.tone" [dismissible]="true" (dismissed)="banner = null">
        <span [attr.role]="banner.tone === 'danger' ? 'alert' : 'status'">{{ banner.msg.key | translate: banner.msg.params }}</span>
      </app-inline-banner>
      <app-inline-banner *ngIf="loadError" tone="danger">
        {{ 'admin.addPlotEmi.loadError' | translate }}
        <button type="button" class="add-plot-emi__link" (click)="load()">{{ 'admin.addPlotEmi.retry' | translate }}</button>
      </app-inline-banner>

      <div class="add-plot-emi__filters" *ngIf="status === 'ENTERED' && page?.payments?.length">
        <button type="button" class="brand-button brand-button--secondary add-plot-emi__btn" [disabled]="busy" (click)="checkAll()">{{ 'admin.bookingsEmi.action.checkAll' | translate }}</button>
        <button type="button" class="brand-button brand-button--secondary add-plot-emi__btn" [disabled]="busy || !selected.size" (click)="selected.clear()">{{ 'admin.bookingsEmi.action.uncheckAll' | translate }}</button>
        <span role="status">{{ 'admin.bookingsEmi.queue.selected' | translate: { count: selected.size, amount: money(selectedTotal) } }}</span>
        <button type="button" class="brand-button add-plot-emi__btn" [disabled]="busy || !selected.size" (click)="asking = true">{{ 'admin.bookingsEmi.action.confirmSelected' | translate }}</button>
      </div>
      <div class="add-plot-emi__filters" role="alertdialog" *ngIf="asking">
        <span>{{ (selected.size === 1 ? 'admin.bookingsEmi.queue.promptOne' : 'admin.bookingsEmi.queue.prompt') | translate: { count: selected.size, amount: money(selectedTotal) } }}</span>
        <button type="button" class="brand-button add-plot-emi__btn" [disabled]="busy" (click)="confirm()">
          {{ (busy ? 'admin.bookingsEmi.action.confirming' : selected.size === 1 ? 'admin.bookingsEmi.queue.yesOne' : 'admin.bookingsEmi.queue.yes') | translate: { count: selected.size } }}</button>
        <button type="button" class="brand-button brand-button--secondary add-plot-emi__btn" [disabled]="busy" (click)="asking = false">{{ 'admin.bookingsEmi.action.back' | translate }}</button>
      </div>

      <div class="add-plot-emi__list" [attr.aria-busy]="loading">
        <div class="add-plot-emi__scroll">
          <app-table-tools filename="confirmed-plot"></app-table-tools>
          <table class="add-plot-emi__table" [attr.aria-label]="'admin.viewConfirmedPlot.title' | translate">
            <thead>
              <tr>
                <th scope="col" *ngIf="status === 'ENTERED'"><span class="material-symbols-outlined th-icon" aria-hidden="true">check_box</span>{{ 'admin.viewConfirmedPlot.col.select' | translate }}</th>
                <th scope="col" class="table__sno"><span class="material-symbols-outlined th-icon" aria-hidden="true">tag</span>{{ 'admin.viewBookedPlot.col.sNo' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">calendar_today</span>{{ 'admin.viewConfirmedPlot.col.paymentDate' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">calendar_today</span>{{ 'admin.addPlotEmi.col.bookedOn' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">badge</span>{{ 'admin.addPlotEmi.col.associateId' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">groups</span>{{ 'admin.addPlotEmi.col.associate' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">call</span>{{ 'admin.addPlotEmi.col.mobile' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">apartment</span>{{ 'admin.addPlotEmi.col.project' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">landscape</span>{{ 'admin.addPlotEmi.col.plot' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">category</span>{{ 'admin.addPlotEmi.col.plotType' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">square_foot</span>{{ 'admin.addPlotEmi.col.area' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">sell</span>{{ 'admin.viewBookedPlot.col.rate' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">payments</span>{{ 'admin.viewBookedPlot.col.extra' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">percent</span>{{ 'admin.addPlotEmi.col.discount' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">payments</span>{{ 'admin.addPlotEmi.col.total' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">payments</span>{{ 'admin.addPlotEmi.col.paid' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">account_balance_wallet</span>{{ 'admin.addPlotEmi.col.remaining' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">payments</span>{{ 'admin.viewConfirmedPlot.col.amount' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">credit_card</span>{{ 'admin.viewConfirmedPlot.col.mode' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">flag</span>{{ 'admin.viewConfirmedPlot.col.status' | translate }}</th>
                <th scope="col" *ngIf="status === 'ENTERED'" class="add-plot-emi__noprint"></th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let r of page?.payments; let i = index">
                <td *ngIf="status === 'ENTERED'" [attr.data-label]="'admin.viewConfirmedPlot.col.select' | translate">
                  <input type="checkbox" [checked]="selected.has(key(r))" [disabled]="busy || loading" (change)="toggle(r)"
                    [attr.aria-label]="('admin.viewConfirmedPlot.col.select' | translate) + ' ' + (r.associateCode || '') + ' ' + (r.plotNo || '') + ' #' + r.installmentNumber" />
                </td>
                <td class="table__sno" [attr.data-label]="'admin.viewBookedPlot.col.sNo' | translate">{{ i + 1 }}</td>
                <td [attr.data-label]="'admin.viewConfirmedPlot.col.paymentDate' | translate">{{ r.paymentDate ? (r.paymentDate | date: 'd MMM y, h:mm:ss a' : '+0530') : '—' }}</td>
                <td [attr.data-label]="'admin.addPlotEmi.col.bookedOn' | translate">{{ r.bookedAt ? (r.bookedAt | date: 'd MMM y, h:mm:ss a' : '+0530') : '—' }}</td>
                <td class="editable-table__cell--bold" [attr.data-label]="'admin.addPlotEmi.col.associateId' | translate">{{ r.associateCode || '—' }}</td>
                <td class="editable-table__cell--bold" [attr.data-label]="'admin.addPlotEmi.col.associate' | translate">{{ r.associateName || '—' }}</td>
                <td [attr.data-label]="'admin.addPlotEmi.col.mobile' | translate">{{ r.associatePhone || '—' }}</td>
                <td [attr.data-label]="'admin.addPlotEmi.col.project' | translate">{{ r.projectName || '—' }}</td>
                <td [attr.data-label]="'admin.addPlotEmi.col.plot' | translate">{{ r.plotNo || '—' }}</td>
                <td [attr.data-label]="'admin.addPlotEmi.col.plotType' | translate">{{ r.plotType ? ('admin.projectsPlots.type.' + r.plotType | translate) : '—' }}</td>
                <td class="add-plot-emi__num" [attr.data-label]="'admin.addPlotEmi.col.area' | translate">{{ r.areaSqft != null ? r.areaSqft : '—' }}</td>
                <td class="add-plot-emi__num" [attr.data-label]="'admin.viewBookedPlot.col.rate' | translate">{{ r.rate != null ? money(r.rate) : '—' }}</td>
                <td class="add-plot-emi__num" [attr.data-label]="'admin.viewBookedPlot.col.extra' | translate">{{ r.extraPrice != null ? money(r.extraPrice) : '—' }}</td>
                <td class="add-plot-emi__num" [attr.data-label]="'admin.addPlotEmi.col.discount' | translate">{{ r.discount != null ? money(r.discount) : '—' }}</td>
                <td class="add-plot-emi__num" [attr.data-label]="'admin.addPlotEmi.col.total' | translate">{{ r.totalAmount != null ? money(r.totalAmount) : '—' }}</td>
                <td class="add-plot-emi__num" [attr.data-label]="'admin.addPlotEmi.col.paid' | translate">{{ r.paidAmount != null ? money(r.paidAmount) : '—' }}</td>
                <td class="add-plot-emi__num" [attr.data-label]="'admin.addPlotEmi.col.remaining' | translate">{{ r.dueAmount != null ? money(r.dueAmount) : '—' }}</td>
                <td class="add-plot-emi__num" [attr.data-label]="'admin.viewConfirmedPlot.col.amount' | translate">{{ money(r.amount) }}</td>
                <td [attr.data-label]="'admin.viewConfirmedPlot.col.mode' | translate">{{ r.paymentMode ? ('admin.bookingsEmi.paymentMode.' + r.paymentMode | translate) : '—' }}</td>
                <td [attr.data-label]="'admin.viewConfirmedPlot.col.status' | translate">{{ (status === 'ENTERED' ? 'admin.viewConfirmedPlot.pending' : 'admin.viewConfirmedPlot.confirmed') | translate }}</td>
                <td *ngIf="status === 'ENTERED'" class="add-plot-emi__actions add-plot-emi__actions--icons add-plot-emi__noprint" [attr.data-label]="'admin.viewConfirmedPlot.col.actions' | translate">
                  <button type="button" class="brand-button add-plot-emi__btn add-plot-emi__icon-btn" [disabled]="busy" (click)="openDetail(r)">{{ 'admin.viewConfirmedPlot.editAction' | translate }}</button>
                </td>
              </tr>
              <tr *ngIf="!page?.payments?.length">
                <td class="add-plot-emi__empty-cell" [attr.colspan]="status === 'ENTERED' ? 21 : 19">{{ (status === 'ENTERED' ? 'admin.viewConfirmedPlot.emptyPending' : 'admin.viewConfirmedPlot.emptyConfirmed') | translate }}</td>
              </tr>
            </tbody>
          <tfoot *ngIf="page?.payments?.length">
            <tr class="editable-table__total">
              <td *ngIf="status === 'ENTERED'"></td>
              <td>{{ 'common.total' | translate }}</td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
              <td class="add-plot-emi__num" [attr.data-label]="'admin.addPlotEmi.col.area' | translate">{{ areaFmt(sumOf('areaSqft')) }}</td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
              <td class="add-plot-emi__num" [attr.data-label]="'admin.viewConfirmedPlot.col.amount' | translate">{{ money(sumOf('amount')) }}</td>
              <td></td>
              <td></td>
              <td *ngIf="status === 'ENTERED'"></td>
            </tr>
          </tfoot>
          </table>
        </div>
      </div>
    </div>
    <div class="add-plot-emi__overlay" *ngIf="detailRow as r" (keydown.escape)="closeDetail()">
      <div class="add-plot-emi__modal" role="dialog" aria-modal="true" aria-labelledby="vcp-detail-title">
        <h2 class="add-plot-emi__modal-title" id="vcp-detail-title">{{ 'admin.viewConfirmedPlot.detailTitle' | translate }} · {{ r.plotNo || '—' }}</h2>
        <dl class="add-plot-emi__facts">
          <div><dt>{{ 'admin.addPlotEmi.col.project' | translate }}</dt><dd>{{ r.projectName || '—' }}</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.col.plot' | translate }}</dt><dd>{{ r.plotNo || '—' }}</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.col.associate' | translate }}</dt><dd>{{ r.associateName || '—' }} ({{ r.associateCode || '—' }})</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.col.mobile' | translate }}</dt><dd>{{ r.associatePhone || '—' }}</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.col.area' | translate }}</dt><dd>{{ r.areaSqft != null ? r.areaSqft : '—' }}</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.col.discount' | translate }}</dt><dd>{{ r.discount != null ? money(r.discount) : '—' }}</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.col.total' | translate }}</dt><dd>{{ r.totalAmount != null ? money(r.totalAmount) : '—' }}</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.col.paid' | translate }}</dt><dd>{{ r.paidAmount != null ? money(r.paidAmount) : '—' }}</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.col.remaining' | translate }}</dt><dd>{{ r.dueAmount != null ? money(r.dueAmount) : '—' }}</dd></div>
          <div><dt>{{ 'admin.viewConfirmedPlot.col.amount' | translate }}</dt><dd>{{ money(r.amount) }}</dd></div>
          <div><dt>{{ 'admin.viewConfirmedPlot.col.mode' | translate }}</dt><dd>{{ r.paymentMode ? ('admin.bookingsEmi.paymentMode.' + r.paymentMode | translate) : '—' }}</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.txnNo' | translate }}</dt><dd>{{ r.paymentRef || '—' }}</dd></div>
          <div><dt>{{ 'admin.viewConfirmedPlot.col.paymentDate' | translate }}</dt><dd>{{ r.paymentDate ? (r.paymentDate | date: 'd MMM y, h:mm a' : '+0530') : '—' }}</dd></div>
        </dl>
        <app-inline-banner *ngIf="deleteKey === key(r)" tone="warning">{{ 'admin.addPlotEmi.deleteConfirm' | translate: { amount: money(r.amount) } }}</app-inline-banner>
        <div class="add-plot-emi__footer">
          <ng-container *ngIf="deleteKey !== key(r)">
            <button type="button" class="brand-button brand-button--secondary add-plot-emi__btn" (click)="closeDetail()">{{ 'admin.addPlotEmi.close' | translate }}</button>
            <button type="button" class="brand-button brand-button--danger add-plot-emi__btn" [disabled]="busy" (click)="deleteKey = key(r)">{{ 'admin.addPlotEmi.deletePayment' | translate }}</button>
            <button type="button" class="brand-button brand-button--secondary add-plot-emi__btn" *ngIf="canEditPlot(r)" [disabled]="busy" (click)="openEditBooking(r)">{{ 'admin.addPlotEmi.editBooking.button' | translate }}</button>
            <button type="button" class="brand-button add-plot-emi__btn" [disabled]="busy" (click)="openEditPayment(r)">{{ 'admin.addPlotEmi.editPayment' | translate }}</button>
          </ng-container>
          <ng-container *ngIf="deleteKey === key(r)">
            <button type="button" class="brand-button brand-button--secondary add-plot-emi__btn" [disabled]="busy" (click)="deleteKey = null">{{ 'admin.addPlotEmi.deleteNo' | translate }}</button>
            <button type="button" class="brand-button brand-button--danger add-plot-emi__btn" [disabled]="busy" (click)="confirmDelete(r)">{{ 'admin.addPlotEmi.deleteYes' | translate }}</button>
          </ng-container>
        </div>
      </div>
    </div>

    <div class="add-plot-emi__overlay" *ngIf="cancelAsk as a" (keydown.escape)="keepBooking()">
      <div class="add-plot-emi__modal add-plot-emi__modal--ask" role="alertdialog" aria-modal="true" aria-labelledby="cancel-ask-title">
        <h2 id="cancel-ask-title" class="add-plot-emi__modal-title"><span class="material-symbols-outlined" aria-hidden="true">warning</span> {{ 'admin.viewConfirmedPlot.cancelTitle' | translate }}</h2>
        <p>{{ 'admin.viewConfirmedPlot.cancelAsk' | translate: { plot: a.plotNo } }}</p>
        <div class="add-plot-emi__footer">
          <button type="button" class="brand-button brand-button--secondary add-plot-emi__btn" [disabled]="busy" (click)="keepBooking()">{{ 'admin.viewConfirmedPlot.cancelNo' | translate }}</button>
          <button type="button" class="brand-button brand-button--danger add-plot-emi__btn" [disabled]="busy" (click)="cancelBooking()">{{ 'admin.viewConfirmedPlot.cancelYes' | translate }}</button>
        </div>
      </div>
    </div>

    <div class="add-plot-emi__overlay" *ngIf="payForm" (keydown.escape)="closeForms()">
      <form class="add-plot-emi__modal" role="dialog" aria-modal="true" (ngSubmit)="savePayment()" novalidate>
        <h2 class="add-plot-emi__modal-title">{{ 'admin.addPlotEmi.editPayTitle' | translate }}</h2>
        <app-inline-banner *ngIf="formError" tone="danger">{{ formError }}</app-inline-banner>
        <div class="add-plot-emi__grid">
          <label>{{ 'admin.addPlotEmi.topUpAmount' | translate }}
            <input type="number" name="amount" min="0" step="0.01" [(ngModel)]="amount" />
          </label>
          <label>{{ 'admin.addPlotEmi.paymentMode' | translate }}
            <select name="mode" [(ngModel)]="mode">
              <option value="">{{ 'admin.addPlotEmi.selectMode' | translate }}</option>
              <option *ngFor="let m of modes" [value]="m">{{ 'admin.bookingsEmi.paymentMode.' + m | translate }}</option>
            </select>
          </label>
          <label>{{ 'admin.addPlotEmi.bankName' | translate }}
            <input type="text" name="bank" maxlength="100" [(ngModel)]="bankName" />
          </label>
          <label>{{ 'admin.addPlotEmi.txnNo' | translate }}
            <input type="text" name="txnNo" maxlength="100" [(ngModel)]="txnNo" />
          </label>
          <label>{{ 'admin.addPlotEmi.receiptNo' | translate }}
            <input type="text" name="receiptNo" maxlength="50" [(ngModel)]="receiptNo" />
          </label>
          <label>{{ 'admin.addPlotEmi.txnDate' | translate }}
            <input type="date" name="txnDate" [attr.max]="today" [(ngModel)]="txnDate" />
          </label>
          <ng-container *ngIf="canChangeBuyer">
            <label>{{ 'admin.projectsPlots.buyerIdLabel' | translate }}
              <input type="text" name="buyerUserId" maxlength="50" autocomplete="off" [disabled]="busy" [(ngModel)]="buyerUserId" (ngModelChange)="lookupBuyer()" />
              <app-field-error [message]="buyerErrorKey ? ('admin.projectsPlots.' + buyerErrorKey | translate) : undefined"></app-field-error>
            </label>
            <label>{{ 'admin.projectsPlots.buyerNameLabel' | translate }}
              <input type="text" name="buyerName" readonly tabindex="-1" [value]="buyerName" />
            </label>
          </ng-container>
        </div>
        <div class="add-plot-emi__footer">
          <button type="button" class="brand-button brand-button--secondary add-plot-emi__btn" [disabled]="busy" (click)="closeForms()">{{ 'admin.addPlotEmi.cancel' | translate }}</button>
          <button type="submit" class="brand-button add-plot-emi__btn" [disabled]="busy || !formValid || !buyerValid">{{ (busy ? 'admin.addPlotEmi.saving' : 'admin.addPlotEmi.editBooking.save') | translate }}</button>
        </div>
      </form>
    </div>

    <div class="add-plot-emi__overlay" *ngIf="bookingForm" (keydown.escape)="closeForms()">
      <form class="add-plot-emi__modal" role="dialog" aria-modal="true" (ngSubmit)="saveBooking()" novalidate>
        <h2 class="add-plot-emi__modal-title">{{ 'admin.addPlotEmi.editBooking.title' | translate }}</h2>
        <p class="add-plot-emi__hint">{{ 'admin.addPlotEmi.editBooking.hint' | translate }}</p>
        <app-inline-banner *ngIf="formError" tone="danger">{{ formError }}</app-inline-banner>
        <h3 class="add-plot-emi__section">{{ 'admin.addPlotEmi.plotDetails' | translate }}</h3>
        <dl class="add-plot-emi__facts" *ngIf="bookingForm.booking as b">
          <div><dt>{{ 'admin.addPlotEmi.col.project' | translate }}</dt><dd>{{ b.projectName || '—' }}</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.col.plot' | translate }}</dt><dd>{{ b.plotNo || '—' }}</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.col.plotType' | translate }}</dt><dd>{{ b.plotType ? ('admin.projectsPlots.type.' + b.plotType | translate) : '—' }}</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.col.area' | translate }}</dt><dd>{{ b.areaSqft != null ? b.areaSqft : '—' }}</dd></div>
          <div><dt>{{ 'admin.viewBookedPlot.col.rate' | translate }}</dt><dd>{{ b.rate != null ? money(b.rate) : '—' }}</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.col.price' | translate }}</dt><dd>{{ b.listPrice != null ? money(b.listPrice) : '—' }}</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.buyer' | translate }}</dt><dd>{{ b.buyerName || '—' }}</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.col.associate' | translate }}</dt><dd>{{ b.associateName || '—' }} ({{ b.associateCode || '—' }})</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.col.bookedOn' | translate }}</dt><dd>{{ b.bookedAt ? (b.bookedAt | date: 'd MMM y' : '+0530') : '—' }}</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.col.total' | translate }}</dt><dd>{{ money(b.totalAmount) }}</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.col.paid' | translate }}</dt><dd>{{ money(b.paidAmount) }}</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.col.remaining' | translate }}</dt><dd>{{ money(b.dueAmount) }}</dd></div>
        </dl>
        <h3 class="add-plot-emi__section">{{ 'admin.addPlotEmi.editBooking.editable' | translate }}</h3>
        <div class="add-plot-emi__grid">
          <label>{{ 'admin.addPlotEmi.editBooking.phone' | translate }}
            <input type="tel" name="ebPhone" maxlength="20" [(ngModel)]="ebPhone" />
          </label>
          <label>{{ 'admin.addPlotEmi.editBooking.discount' | translate }}
            <input type="number" name="ebDiscount" min="0" step="1" [(ngModel)]="ebDiscount" />
          </label>
          <label>{{ 'admin.addPlotEmi.editBooking.extraPrice' | translate }}
            <input type="number" name="ebExtra" min="0" step="1" [(ngModel)]="ebExtra" />
          </label>
          <ng-container *ngIf="canChangeBuyer">
            <label>{{ 'admin.projectsPlots.buyerIdLabel' | translate }}
              <input type="text" name="buyerUserId" maxlength="50" autocomplete="off" [disabled]="busy" [(ngModel)]="buyerUserId" (ngModelChange)="lookupBuyer()" />
              <app-field-error [message]="buyerErrorKey ? ('admin.projectsPlots.' + buyerErrorKey | translate) : undefined"></app-field-error>
            </label>
            <label>{{ 'admin.projectsPlots.buyerNameLabel' | translate }}
              <input type="text" name="buyerName" readonly tabindex="-1" [value]="buyerName" />
            </label>
          </ng-container>
        </div>
        <p class="add-plot-emi__hint" *ngIf="newTotal != null">{{ 'admin.addPlotEmi.editBooking.newTotal' | translate: { total: money(newTotal) } }}</p>
        <div class="add-plot-emi__footer">
          <button type="button" class="brand-button brand-button--secondary add-plot-emi__btn" [disabled]="busy" (click)="closeForms()">{{ 'admin.addPlotEmi.cancel' | translate }}</button>
          <button type="submit" class="brand-button add-plot-emi__btn" [disabled]="busy || !buyerValid">{{ (busy ? 'admin.addPlotEmi.saving' : 'admin.addPlotEmi.editBooking.save') | translate }}</button>
        </div>
      </form>
    </div>
  `
})
export class ViewConfirmedPlotComponent implements OnInit {
  private service = inject(BookingsEmiService);
  private projectsService = inject(ProjectsService);
  private translate = inject(TranslateService);
  private adminService = inject(AdminService);

  readonly modes = PAYMENT_MODES;
  readonly today = utcDate();

  money = formatMoney;
  areaFmt = formatArea;
  key = keyOf;

  projects: Project[] = [];
  projectId = '';
  plotNo = '';
  from = isoDate(new Date(Date.now() - 30 * 864e5));
  to = isoDate(new Date());
  status: Status = 'ENTERED';
  page: PaymentPage | null = null;
  selected = new Set<string>();
  loading = false;
  loadError = false;
  rangeError = false;
  busy = false;
  asking = false;
  deleteKey: string | null = null;
  // Set after the last unconfirmed payment is deleted and nothing is paid: asks whether to cancel the booking.
  cancelAsk: { bookingId: string; plotNo: string } | null = null;
  detailRow: PaymentRow | null = null;
  payForm: { bookingId: string; number: number; plot: string } | null = null;
  bookingForm: { bookingId: string; plot: string; booking: Booking } | null = null;
  amount: number | null = null;
  mode: PaymentMode | '' = '';
  bankName = '';
  txnNo = '';
  receiptNo = '';
  txnDate = '';
  ebPhone = '';
  // Buyer can be changed only while no payment of the booking is confirmed (server enforces it too).
  associates: AssociateSummary[] = [];
  canChangeBuyer = false;
  buyerUserId = '';
  buyerName = '';
  private buyerId = '';
  private origBuyerId = '';
  ebDiscount: number | null = 0;
  ebExtra: number | null = 0;
  formError = '';
  banner: { tone: 'success' | 'danger'; msg: FlashMessage } | null = null;
  private seq = 0;

  get selectedRows(): PaymentRow[] { return (this.page?.payments ?? []).filter(r => this.selected.has(keyOf(r))); }
  get selectedTotal(): number { return this.selectedRows.reduce((s, r) => s + r.amount, 0); }

  ngOnInit(): void {
    this.adminService.listAssociates().pipe(catchError(() => of([] as AssociateSummary[])))
      .subscribe(l => (this.associates = l.filter(a => a.role === 'ASSOCIATE' && a.status === 'ACTIVE')));
    this.projectsService.listProjects().subscribe({
      next: p => { this.projects = p; this.projectId = p[0]?.id ?? ''; this.load(); },
      error: () => (this.loadError = true)
    });
  }

  associateId = '';

  onAssociate(id: string): void { this.associateId = id; this.load(); }

  // A cycle is a shortcut for its date range (see CycleSelectComponent).
  onRange(r: { from: string; to: string }): void {
    this.from = r.from; this.to = r.to; this.rangeError = false; this.load();
  }

  onProject(id: string): void { this.projectId = id; this.load(); }
  onPlot(v: string): void { this.plotNo = v.trim(); this.load(); }

  onDate(which: 'from' | 'to', v: string): void {
    this[which] = v;
    this.rangeError = !!this.from && !!this.to && this.from > this.to;
    if (!this.rangeError) { this.load(); } // an inverted range keeps the last valid list
  }

  setStatus(s: Status): void {
    if (this.busy || s === this.status) { return; }
    this.status = s;
    this.banner = null;
    this.load();
  }

  toggle(r: PaymentRow): void {
    const k = keyOf(r);
    if (!this.selected.delete(k)) { this.selected.add(k); }
    if (!this.selected.size) { this.asking = false; }
  }

  checkAll(): void { (this.page?.payments ?? []).forEach(r => this.selected.add(keyOf(r))); }

  confirm(): void {
    if (this.busy || !this.selected.size) { return; }
    const items = this.selectedRows.map(r => ({ bookingId: r.bookingId, installmentNumber: r.installmentNumber }));
    this.busy = true;
    this.banner = null;
    this.service.confirmPayments(items).subscribe({
      next: res => {
        const auto = res.filter(b => b.status === 'CONFIRMED').length;
        const one = items.length === 1 ? 'One' : 'Many';
        this.busy = false;
        this.banner = { tone: 'success', msg: auto
          ? { key: `admin.bookingsEmi.ok.confirmed${one}Auto`, params: { count: items.length, auto } }
          : { key: `admin.bookingsEmi.ok.confirmed${one}`, params: { count: items.length } } };
        this.load();
      },
      error: err => {
        this.busy = false;
        this.banner = { tone: 'danger', msg: { key: 'admin.bookingsEmi.err.' + (err.status === 0 ? 'confirmManyNetwork' : 'confirmMany') } };
        this.load(); // stale rows are the usual cause; show the truth
      }
    });
  }

  load(): void {
    if (!this.projectId) { return; }
    const seq = ++this.seq;
    this.loading = true;
    this.loadError = false;
    this.selected.clear();
    this.asking = false;
    fetchAllPages((p, size) => this.service.payments(this.status, { from: this.from, to: this.to, projectId: this.projectId, associateId: this.associateId, plotNo: this.plotNo }, p, size)).subscribe({
      next: r => {
        if (seq !== this.seq) { return; }
        this.page = r;
        this.loading = false;
      },
      error: () => { if (seq === this.seq) { this.loading = false; this.loadError = true; } }
    });
  }

  // ---- edit / delete unconfirmed payments, edit plot ----------------------

  get formValid(): boolean {
    return !!this.amount && this.amount > 0 && !!this.mode && (this.mode === 'CASH' || !!this.bankName.trim())
      && !!this.txnNo.trim() && !!this.receiptNo.trim() && !!this.txnDate && this.txnDate <= this.today;
  }

  // Plot details are editable only while nothing on the booking is confirmed; unknown paid amount = hide.
  canEditPlot(r: PaymentRow): boolean { return r.paidAmount === 0; }

  openDetail(r: PaymentRow): void { this.banner = null; this.deleteKey = null; this.detailRow = r; this.cancelAsk = null; }
  closeDetail(): void { if (!this.busy) { this.detailRow = null; this.deleteKey = null; this.cancelAsk = null; } }

  // Live preview of the recalculated total (list price + extra - discount); the server is the authority.
  get newTotal(): number | null {
    const l = this.bookingForm?.booking.listPrice;
    return l == null ? null : l + (this.ebExtra ?? 0) - (this.ebDiscount ?? 0);
  }

  closeForms(): void { if (!this.busy) { this.payForm = null; this.bookingForm = null; } }

  private fail(err: { status: number; error?: { error?: string } }, inForm: boolean): void {
    this.busy = false;
    if (!inForm) { this.detailRow = null; this.deleteKey = null; this.cancelAsk = null; }
    const msg = err.error?.error;
    if (inForm) { this.formError = msg ?? this.translate.instant('admin.viewConfirmedPlot.err.generic'); }
    else { this.banner = { tone: 'danger', msg: { key: 'admin.viewConfirmedPlot.err.generic' } }; }
    if (err.status === 409) { this.load(); }
  }

  private done(key: string, plot: string): void {
    this.busy = false;
    this.payForm = null;
    this.bookingForm = null;
    this.deleteKey = null;
    this.cancelAsk = null;
    this.detailRow = null;
    this.banner = { tone: 'success', msg: { key, params: { plot } } };
    this.load();
  }

  private initBuyer(b: Booking): void {
    this.canChangeBuyer = !b.installments.some(i => i.status === 'PAID');
    const cur = this.associates.find(a => a.id === b.associateId);
    this.buyerUserId = cur?.userId ?? '';
    this.buyerName = cur?.name ?? b.buyerName ?? '';
    this.buyerId = this.origBuyerId = cur?.id ?? '';
  }

  lookupBuyer(): void {
    const id = this.buyerUserId.trim().toLowerCase();
    const found = id ? this.associates.find(a => a.userId.toLowerCase() === id) : undefined;
    this.buyerId = found?.id ?? '';
    this.buyerName = found?.name ?? '';
  }

  get buyerErrorKey(): string {
    const id = this.buyerUserId.trim();
    if (!this.canChangeBuyer || !id) { return ''; }
    const a = this.associates.find(x => x.userId.toLowerCase() === id.toLowerCase());
    return !a ? 'buyerNotFound' : !a.hasEpin ? 'buyerNoEpin' : '';
  }
  get buyerValid(): boolean { return !this.canChangeBuyer || (!!this.buyerId && !this.buyerErrorKey) || !this.buyerUserId.trim(); }
  private get newBuyerId(): string | undefined {
    return this.canChangeBuyer && this.buyerId && this.buyerId !== this.origBuyerId ? this.buyerId : undefined;
  }

  openEditPayment(r: PaymentRow): void {
    this.busy = true;
    this.banner = null;
    this.service.get(r.bookingId).subscribe({
      next: b => {
        this.busy = false;
        const i = b.installments.find(x => x.installmentNumber === r.installmentNumber);
        if (!i || i.status !== 'ENTERED') { this.load(); return; }
        this.formError = '';
        this.detailRow = null;
        this.payForm = { bookingId: b.id, number: i.installmentNumber, plot: r.plotNo ?? '' };
        this.amount = i.amount;
        this.mode = i.paymentMode ?? '';
        this.bankName = i.bankName ?? '';
        this.txnNo = i.paymentRef ?? '';
        this.receiptNo = i.receiptNo ?? '';
        this.txnDate = i.paidAt ? i.paidAt.slice(0, 10) : this.today;
        this.initBuyer(b);
      },
      error: err => this.fail(err, false)
    });
  }

  savePayment(): void {
    const f = this.payForm;
    if (!f || this.busy || !this.formValid) { return; }
    this.busy = true;
    this.formError = '';
    const buyer = this.newBuyerId;
    const pay$ = this.service.updatePayment(f.bookingId, f.number, {
      amount: Math.round((this.amount as number) * 100) / 100, paymentMode: this.mode as PaymentMode,
      bankName: this.bankName.trim() || undefined, paymentRef: this.txnNo.trim(),
      receiptNo: this.receiptNo.trim(), paidAt: `${this.txnDate}T00:00:00Z`
    });
    // Buyer first: a rejected buyer must not leave the payment edited. concat stops on the first error.
    (buyer ? concat(this.service.updateBooking(f.bookingId, { buyerAssociateId: buyer }), pay$).pipe(last()) : pay$).subscribe({ next: () => this.done('admin.addPlotEmi.updated', f.plot), error: err => this.fail(err, true) });
  }

  confirmDelete(r: PaymentRow): void {
    if (this.busy) { return; }
    this.busy = true;
    this.banner = null;
    this.service.deletePayment(r.bookingId, r.installmentNumber).subscribe({
      next: b => {
        const left = b?.installments ?? [];
        // Nothing paid or awaiting confirmation any more: offer to free the plot.
        if (b?.installments && !left.some(i => i.status === 'PAID' || i.status === 'ENTERED')) {
          this.busy = false;
          this.deleteKey = null;
          this.detailRow = null;
          this.cancelAsk = { bookingId: r.bookingId, plotNo: r.plotNo ?? '' };
        } else {
          this.done('admin.addPlotEmi.deleted', r.plotNo ?? '');
        }
      },
      error: err => { this.deleteKey = null; this.fail(err, false); }
    });
  }

  keepBooking(): void {
    this.done('admin.addPlotEmi.deleted', this.cancelAsk?.plotNo ?? '');
  }

  cancelBooking(): void {
    const a = this.cancelAsk;
    if (!a || this.busy) { return; }
    this.busy = true;
    this.service.cancel(a.bookingId, this.translate.instant('admin.viewConfirmedPlot.autoCancelReason'))
      .subscribe({ next: () => this.done('admin.viewConfirmedPlot.bookingCancelled', a.plotNo), error: err => this.fail(err, false) });
  }

  openEditBooking(r: PaymentRow): void {
    this.busy = true;
    this.banner = null;
    this.service.get(r.bookingId).subscribe({
      next: (b: Booking) => {
        this.busy = false;
        if (b.installments.some(i => i.status === 'PAID')) { this.load(); return; }
        this.formError = '';
        this.detailRow = null;
        this.bookingForm = { bookingId: b.id, plot: r.plotNo ?? '', booking: b };
        this.ebPhone = b.buyerPhone ?? '';
        this.initBuyer(b);
        this.ebDiscount = b.discount ?? 0;
        this.ebExtra = b.extraPrice ?? 0;
      },
      error: err => this.fail(err, false)
    });
  }

  saveBooking(): void {
    const f = this.bookingForm;
    if (!f || this.busy) { return; }
    this.busy = true;
    this.formError = '';
    this.service.updateBooking(f.bookingId, {
      buyerAssociateId: this.newBuyerId, buyerPhone: this.ebPhone.trim(), discount: this.ebDiscount ?? 0, extraPrice: this.ebExtra ?? 0
    }).subscribe({ next: () => this.done('admin.addPlotEmi.editBooking.success', f.plot), error: err => this.fail(err, true) });
  }

  sumOf(field: string): number {
    return Math.round((this.page?.payments ?? []).reduce((acc, r) => acc + ((r as unknown as Record<string, number | null | undefined>)[field] ?? 0), 0) * 100) / 100;
  }
}
