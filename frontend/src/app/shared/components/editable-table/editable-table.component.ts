import { Component, EventEmitter, Input, Output, TemplateRef } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface ActionCellContext {
  $implicit: Record<string, string | number>;
  index: number;
}

export type BadgeTone = 'success' | 'warning' | 'danger' | 'default';

export interface EditableTableColumn {
  key: string;
  label: string;
  // 'badge': read-only value colored via `badgeTone` (--status-success/warning/danger tokens) --
  // e.g. Associate Directory's KYC Status/Status, Sales Register's Status.
  // 'rank-badge': read-only fixed-style oxblood/gold pill, same for every value, no mapping
  // needed -- e.g. Associate Directory's Rank.
  type: 'text' | 'number' | 'select' | 'action' | 'badge' | 'rank-badge';
  options?: { value: string; label: string }[];
  // Required when type is 'badge'. Maps a cell's raw value to a tone; return 'default' for any
  // value that isn't one of the colored states.
  badgeTone?: (value: string | number) => BadgeTone;
  // Optional, 'text'/'number' columns only: renders a small badge inline right after the cell's
  // own value, sourced from `row[badgeKey]` and toned via the same `badgeTone` fn above -- e.g.
  // KYC Review Queue's Name column carrying the status pill instead of a dedicated Status column.
  badgeKey?: string;
}

@Component({
  selector: 'app-editable-table',
  standalone: true,
  imports: [CommonModule],
  template: `
    <table class="editable-table">
      <thead>
        <tr>
          <th *ngFor="let column of columns">{{ column.label }}</th>
        </tr>
      </thead>
      <tbody *ngIf="rows.length > 0; else emptyState">
        <tr *ngFor="let row of rows; let i = index; trackBy: trackByIndex" (click)="onRowClick(i)">
          <td *ngFor="let column of columns" [attr.data-label]="column.label">
            <ng-container *ngIf="column.type === 'action'; else dataCell">
              <ng-container
                *ngTemplateOutlet="actionTemplate ?? null; context: { $implicit: row, index: i }"
              ></ng-container>
            </ng-container>
            <ng-template #dataCell>
              <ng-container *ngIf="readOnly" [ngSwitch]="column.type">
                <span
                  *ngSwitchCase="'badge'"
                  class="editable-table__badge"
                  [ngClass]="'editable-table__badge--' + badgeTone(column, row[column.key])"
                  >{{ row[column.key] }}</span
                >
                <span *ngSwitchCase="'rank-badge'" class="editable-table__rank-badge">{{
                  row[column.key]
                }}</span>
                <ng-container *ngSwitchDefault>
                  <span>{{ row[column.key] }}</span>
                  <span
                    *ngIf="column.badgeKey"
                    class="editable-table__badge"
                    [ngClass]="'editable-table__badge--' + badgeTone(column, row[column.badgeKey!])"
                    >{{ row[column.badgeKey] }}</span
                  >
                </ng-container>
              </ng-container>
              <ng-container *ngIf="!readOnly">
                <select
                  *ngIf="column.type === 'select'; else textOrNumberCell"
                  [value]="row[column.key]"
                  (change)="onCellInput($event, i, column.key)"
                >
                  <option *ngFor="let option of column.options" [value]="option.value">
                    {{ option.label }}
                  </option>
                </select>
                <ng-template #textOrNumberCell>
                  <input
                    [type]="column.type === 'number' ? 'number' : 'text'"
                    [value]="row[column.key]"
                    (input)="onCellInput($event, i, column.key)"
                  />
                </ng-template>
              </ng-container>
            </ng-template>
          </td>
          <td *ngIf="!readOnly">
            <button type="button" class="editable-table__remove-row" (click)="removeRow(i)">
              {{ removeRowLabel }}
            </button>
          </td>
        </tr>
      </tbody>
      <ng-template #emptyState>
        <tbody>
          <tr>
            <td class="editable-table__empty" [attr.colspan]="readOnly ? columns.length : columns.length + 1">
              {{ emptyStateLabel }}
            </td>
          </tr>
        </tbody>
      </ng-template>
    </table>
    <button *ngIf="!readOnly" type="button" class="editable-table__add-row" (click)="addRow()">
      {{ addRowLabel }}
    </button>
  `
})
export class EditableTableComponent {
  @Input({ required: true }) columns: EditableTableColumn[] = [];
  @Input({ required: true }) rows: Record<string, string | number>[] = [];
  @Input() addRowLabel = '';
  @Input() removeRowLabel = '';
  @Input() emptyStateLabel = '';
  @Input() readOnly = false;
  @Input() actionTemplate?: TemplateRef<ActionCellContext>;
  @Output() rowsChange = new EventEmitter<Record<string, string | number>[]>();
  @Output() rowClick = new EventEmitter<number>();

  trackByIndex(index: number): number {
    return index;
  }

  badgeTone(column: EditableTableColumn, value: string | number): BadgeTone {
    return column.badgeTone ? column.badgeTone(value) : 'default';
  }

  onRowClick(index: number): void {
    if (this.readOnly) {
      this.rowClick.emit(index);
    }
  }

  onCellInput(event: Event, rowIndex: number, key: string): void {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    this.updateCell(rowIndex, key, target.value);
  }

  updateCell(rowIndex: number, key: string, value: string): void {
    const column = this.columns.find((c) => c.key === key);
    const nextValue: string | number = column?.type === 'number' ? Number(value) : value;
    const nextRows = this.rows.map((row, i) => (i === rowIndex ? { ...row, [key]: nextValue } : row));
    this.rowsChange.emit(nextRows);
  }

  addRow(): void {
    const blankRow: Record<string, string | number> = {};
    for (const column of this.columns) {
      blankRow[column.key] = column.type === 'number' ? 0 : '';
    }
    this.rowsChange.emit([...this.rows, blankRow]);
  }

  removeRow(rowIndex: number): void {
    const nextRows = this.rows.filter((_, i) => i !== rowIndex);
    this.rowsChange.emit(nextRows);
  }
}
