import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, Input, inject } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { TableData, copyData, exportPdf, exportXlsx, printData, scrapeTable } from '../../utils/table-export.util';

// Copy / Print / PDF / Excel for the table next to it. Place it directly above a <table> or
// <app-editable-table>; it reads the rendered table. Pass [exportData] when the table only shows
// one server page and the export should cover every row.
@Component({
  selector: 'app-table-tools',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="table-tools" role="group" [attr.aria-label]="'common.tableTools.label' | translate">
      <button type="button" class="table-tools__btn" [disabled]="busy" (click)="run('copy')">
        <span class="material-symbols-outlined" aria-hidden="true">{{ copied ? 'check' : 'content_copy' }}</span>
        <span class="table-tools__text">{{ (copied ? 'common.tableTools.copied' : 'common.tableTools.copy') | translate }}</span>
      </button>
      <button type="button" class="table-tools__btn" [disabled]="busy" (click)="run('print')">
        <span class="material-symbols-outlined" aria-hidden="true">print</span>
        <span class="table-tools__text">{{ 'common.tableTools.print' | translate }}</span>
      </button>
      <button type="button" class="table-tools__btn" [disabled]="busy" (click)="run('pdf')">
        <span class="material-symbols-outlined" aria-hidden="true">picture_as_pdf</span>
        <span class="table-tools__text">{{ 'common.tableTools.pdf' | translate }}</span>
      </button>
      <button type="button" class="table-tools__btn" [disabled]="busy" (click)="run('excel')">
        <span class="material-symbols-outlined" aria-hidden="true">table_view</span>
        <span class="table-tools__text">{{ 'common.tableTools.excel' | translate }}</span>
      </button>
      <span class="table-tools__error" role="alert" *ngIf="failed">{{ 'common.tableTools.failed' | translate }}</span>
    </div>
  `,
})
export class TableToolsComponent {
  @Input() filename = 'table';
  @Input() title = '';
  @Input() table: HTMLElement | null = null;
  @Input() exportData?: () => Promise<TableData>;

  busy = false;
  copied = false;
  failed = false;
  private host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private cdr = inject(ChangeDetectorRef);

  private data(): Promise<TableData> {
    if (this.exportData) { return this.exportData(); }
    const next = this.host.nextElementSibling as HTMLElement | null;
    const root = this.table ?? (next && (next.tagName === 'TABLE' || next.querySelector('table')) ? next : this.host.parentElement?.querySelector('table') as HTMLElement | null);
    return Promise.resolve(scrapeTable(root ?? null));
  }

  async run(kind: 'copy' | 'print' | 'pdf' | 'excel'): Promise<void> {
    this.busy = true; this.failed = false;
    try {
      const d = await this.data();
      const title = this.title || this.filename;
      if (kind === 'copy') { await copyData(d); this.copied = true; setTimeout(() => { this.copied = false; this.cdr.markForCheck(); }, 1500); }
      else if (kind === 'print') { printData(d, title); }
      else if (kind === 'pdf') { await exportPdf(d, this.filename, title); }
      else { await exportXlsx(d, this.filename); }
    } catch { this.failed = true; }
    this.busy = false;
    this.cdr.markForCheck();
  }
}
