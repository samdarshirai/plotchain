import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface EditableTableColumn {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select';
  options?: { value: string; label: string }[];
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
        <tr *ngFor="let row of rows; let i = index">
          <td *ngFor="let column of columns">
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
                [type]="column.type"
                [value]="row[column.key]"
                (input)="onCellInput($event, i, column.key)"
              />
            </ng-template>
          </td>
          <td>
            <button type="button" class="editable-table__remove-row" (click)="removeRow(i)">
              {{ removeRowLabel }}
            </button>
          </td>
        </tr>
      </tbody>
      <ng-template #emptyState>
        <tbody>
          <tr>
            <td class="editable-table__empty" [attr.colspan]="columns.length + 1">
              {{ emptyStateLabel }}
            </td>
          </tr>
        </tbody>
      </ng-template>
    </table>
    <button type="button" class="editable-table__add-row" (click)="addRow()">
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
  @Output() rowsChange = new EventEmitter<Record<string, string | number>[]>();

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
