import { Component, OnInit, ViewChild, ElementRef, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { EPinRegisterService, EPinType, EPinUnusedRow, EPinUsedRow } from './epin-register.service';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { PagerComponent } from '../../shared/components/pager/pager.component';
import { ExportColumn, exportCsv, printTable, toCsv } from '../../shared/utils/table-export.util';

type Mode = 'new' | 'transfer' | 'used';
type Row = EPinUnusedRow & EPinUsedRow;
interface Col { key: string; labelKey: string; value: (r: Row, i: number) => string; visible: boolean; }

const PAGE_SIZE = 20;

// One routed component, three screens (data.mode), like team-plot-bookings' data.scope.
@Component({
  selector: 'app-epin-register',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, InlineBannerComponent, PagerComponent],
  providers: [DatePipe],
  styleUrl: './epin-register.component.scss',
  template: `
    <div class="epin-reg">
      <h1 class="epin-reg__title">{{ 'epinRegister.title.' + mode | translate }}</h1>

      <div class="epin-reg__card">
        <div class="epin-reg__bar">
          <div class="epin-reg__filters">
          <label class="epin-reg__label epin-reg__search">{{ 'epinRegister.search' | translate }}
            <input class="epin-reg__input" type="search" [(ngModel)]="q" (ngModelChange)="reload()" />
          </label>
          <label class="epin-reg__label epin-reg__type">{{ 'epinRegister.type' | translate }}
          <select class="epin-reg__input" [(ngModel)]="type" (ngModelChange)="reload()">
            <option value="">{{ 'epinRegister.typeAll' | translate }}</option>
            <option value="REGISTRATION">{{ 'epinRegister.typeRegistration' | translate }}</option>
            <option value="TOPUP">{{ 'epinRegister.typeTopup' | translate }}</option>
          </select>
          </label>
          </div>
          <div class="epin-reg__tools">
            <button type="button" class="brand-button brand-button--secondary" (click)="copy()">{{ 'epinRegister.copy' | translate }}</button>
            <button type="button" class="brand-button brand-button--secondary" (click)="csv()">{{ 'epinRegister.excelCsv' | translate }}</button>
            <button type="button" class="brand-button brand-button--secondary" (click)="print()">{{ 'epinRegister.printPdf' | translate }}</button>
            <details class="epin-reg__cols">
              <summary class="brand-button brand-button--secondary">{{ 'epinRegister.columns' | translate }}</summary>
              <div class="epin-reg__column-menu">
                <label *ngFor="let c of cols"><input type="checkbox" [(ngModel)]="c.visible" /> {{ c.labelKey | translate }}</label>
              </div>
            </details>
          </div>
        </div>

        <app-inline-banner *ngIf="loadError" tone="danger">{{ 'epins.loadError' | translate }}</app-inline-banner>

        <div class="epin-reg__scroll" #tbl>
          <table class="epin-reg__table" [attr.aria-label]="'epinRegister.title.' + mode | translate">
            <thead>
              <tr>
                <ng-container *ngFor="let c of cols"><th *ngIf="c.visible" scope="col">{{ c.labelKey | translate }}</th></ng-container>
                <th *ngIf="mode === 'new'" scope="col">{{ 'epinRegister.col.action' | translate }}</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let r of rows; let i = index">
                <ng-container *ngFor="let c of cols"><td *ngIf="c.visible">{{ c.value(r, i) }}</td></ng-container>
                <td *ngIf="mode === 'new'"><button type="button" class="brand-button" (click)="startJoin(r)">{{ 'epinRegister.join.label' | translate }}</button></td>
              </tr>
              <tr *ngIf="!rows.length"><td [attr.colspan]="cols.length + 1" class="epin-reg__empty">{{ 'epinRegister.empty' | translate }}</td></tr>
            </tbody>
          </table>
        </div>

        <app-pager [page]="page" [size]="size" [total]="total" (pageChange)="go($event)"></app-pager>
      </div>

      <form class="epin-reg__card epin-reg__form" *ngIf="mode === 'transfer'" (ngSubmit)="transfer()">
        <label class="epin-reg__label">{{ 'epinRegister.noOfPin' | translate }}
          <input class="epin-reg__input" type="number" min="1" name="count" [(ngModel)]="count" /></label>
        <label class="epin-reg__label">{{ 'epinRegister.associateId' | translate }}
          <input class="epin-reg__input" name="toUser" [(ngModel)]="userId" (blur)="lookup()" /></label>
        <label class="epin-reg__label">{{ 'epinRegister.associateName' | translate }}
          <input class="epin-reg__input" name="toName" [value]="recipientName" readonly /></label>
        <label class="epin-reg__label">{{ 'epins.passwordLabel' | translate }}
          <input class="epin-reg__input" type="password" autocomplete="off" name="pw" [(ngModel)]="password" /></label>
        <app-inline-banner *ngIf="error" tone="danger">{{ error | translate }}</app-inline-banner>
        <app-inline-banner *ngIf="success" tone="success">{{ 'epinRegister.transferred' | translate: { count: success } }}</app-inline-banner>
        <button type="submit" class="brand-button" [disabled]="busy">{{ 'epinRegister.submit' | translate }}</button>
      </form>
    </div>
  `
})
export class EPinRegisterComponent implements OnInit {
  private service = inject(EPinRegisterService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private date = inject(DatePipe);
  private translate = inject(TranslateService);

  @ViewChild('tbl') tbl?: ElementRef<HTMLElement>;

  mode: Mode = 'new';
  cols: Col[] = [];
  rows: Row[] = [];
  total = 0;
  page = 0;
  size = PAGE_SIZE;
  q = '';
  type: EPinType | '' = '';
  loadError = false;
  private seq = 0;

  userId = '';
  password = '';
  count: number | null = null;
  recipientName = '';
  error = '';
  success = 0;
  busy = false;

  ngOnInit(): void {
    this.mode = this.route.snapshot.data['mode'] as Mode;
    const d = (s: string | null) => (s ? this.date.transform(s, 'dd-MM-yyyy') ?? '' : '');
    const dt = (s: string | null) => (s ? this.date.transform(s, 'dd-MM-yyyy HH:mm') ?? '' : '');
    const c = (key: string, value: Col['value']): Col => ({ key, labelKey: `epinRegister.col.${key}`, value, visible: true });
    const sl = c('sl', (_r, i) => String(this.page * this.size + i + 1));
    const val = c('pinValue', r => `${r.pinValue} INR`);
    this.cols = this.mode === 'used'
      ? [sl, c('pinId', r => r.id.slice(0, 8)), c('pinNo', r => r.code), val, c('transferDate', r => d(r.transferDate)),
         c('usedDate', r => dt(r.usedDate)), c('usedBy', r => r.usedByUserId ?? ''), c('associateName', r => r.usedByName ?? '')]
      : [sl, c('pinNo', r => r.code), val, c('transferDate', r => d(r.transferDate)), c('transferBy', r => r.transferBy)];
    this.load();
  }

  reload(): void { this.page = 0; this.load(); }
  go(p: number): void { this.page = p; this.load(); }

  load(): void {
    this.loadError = false;
    const seq = ++this.seq;
    const call = this.mode === 'used'
      ? this.service.used(this.type, this.q, this.page, this.size)
      : this.service.unused(this.type, this.q, this.mode === 'new', this.page, this.size);
    (call as unknown as import('rxjs').Observable<{ rows: Row[]; totalElements: number }>).subscribe({
      next: res => { if (seq === this.seq) { this.rows = res.rows; this.total = res.totalElements; } },
      error: (e: HttpErrorResponse) => { if (seq === this.seq && !this.relock(e)) { this.loadError = true; } }
    });
  }

  // Expired/foreign unlock token: back to the password prompt, returning here afterwards.
  private relock(e: HttpErrorResponse): boolean {
    if (e.status === 403 && e.error?.code === 'EPIN_LOCKED') {
      this.service.lock();
      this.router.navigate(['/e-pins/unlock'], { queryParams: { returnUrl: this.router.url } });
      return true;
    }
    return false;
  }

  private visibleExport(): ExportColumn<Row>[] {
    return this.cols.filter(c => c.visible).map(c => ({ header: this.translate.instant(c.labelKey), value: (r: Row) => c.value(r, this.rows.indexOf(r)) }));
  }

  copy(): void {
    const cols = this.visibleExport();
    const text = [cols.map(c => c.header), ...this.rows.map(r => cols.map(c => String(c.value(r) ?? '')))].map(l => l.join('\t')).join('\n');
    try { navigator.clipboard.writeText(text).catch(() => undefined); } catch { /* clipboard unavailable */ }
  }
  // ponytail: "Excel" is CSV (opens in Excel), "PDF" is the browser's print-to-PDF. Add xlsx/pdf libs only if asked.
  csv(): void { exportCsv(this.rows, this.visibleExport(), `epin-${this.mode}`); }
  print(): void { if (this.tbl) { printTable(this.tbl.nativeElement); } }

  startJoin(r: Row): void { this.router.navigate(['/e-pins/join', r.id]); }

  private fail(e: HttpErrorResponse): void {
    this.busy = false;
    this.password = '';
    if (this.relock(e)) { return; }
    this.error = e.status === 401 ? 'epins.errorPasswordInvalid'
      : e.status === 423 ? 'epins.errorPasswordLocked'
      : e.status === 409 && e.error?.code === 'TRANSACTION_PASSWORD_NOT_SET' ? 'epins.errorPasswordNotSet'
      : e.status === 404 ? 'epins.errorNotFound'
      : e.status === 409 ? 'epins.errorConflict'
      : 'epins.errorGeneric';
  }

  lookup(): void {
    this.recipientName = '';
    const id = this.userId.trim();
    if (!id) { return; }
    this.service.recipient(id).subscribe({ next: r => (this.recipientName = r.name), error: () => undefined });
  }

  transfer(): void {
    this.success = 0;
    if (!this.count || this.count < 1) { this.error = 'epinRegister.errorCount'; return; }
    if (!this.userId.trim()) { this.error = 'epins.errorUserIdRequired'; return; }
    if (!this.password.trim()) { this.error = 'epins.errorPasswordRequired'; return; }
    this.busy = true;
    this.error = '';
    this.service.transferBulk(this.count, this.userId.trim(), this.type, this.password).subscribe({
      next: r => { this.busy = false; this.success = r.transferred; this.count = null; this.password = ''; this.reload(); },
      error: e => this.fail(e)
    });
  }
}
