import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EditableTableComponent, EditableTableColumn } from './editable-table.component';

describe('EditableTableComponent', () => {
  let fixture: ComponentFixture<EditableTableComponent>;

  const columns: EditableTableColumn[] = [
    { key: 'rank', label: 'Rank', type: 'select', options: [
      { value: 'gold', label: 'Gold' },
      { value: 'silver', label: 'Silver' }
    ] },
    { key: 'percent', label: 'Percent', type: 'number' },
    { key: 'note', label: 'Note', type: 'text' }
  ];

  const rows: Record<string, string | number>[] = [
    { rank: 'gold', percent: 10, note: 'top tier' },
    { rank: 'silver', percent: 5, note: 'mid tier' }
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditableTableComponent]
    }).compileComponents();
    fixture = TestBed.createComponent(EditableTableComponent);
    fixture.componentInstance.columns = columns;
    fixture.componentInstance.rows = rows;
    fixture.componentInstance.addRowLabel = 'Add row';
    fixture.componentInstance.removeRowLabel = 'Remove';
    fixture.componentInstance.emptyStateLabel = 'No rows yet';
  });

  it('renders one tr per row and one th per column', () => {
    fixture.detectChanges();
    const headers = fixture.nativeElement.querySelectorAll('thead th');
    expect(headers.length).toBe(columns.length);
    expect(headers[0].textContent).toContain('Rank');
    expect(headers[1].textContent).toContain('Percent');
    expect(headers[2].textContent).toContain('Note');

    const bodyRows = fixture.nativeElement.querySelectorAll('tbody tr');
    expect(bodyRows.length).toBe(rows.length);
  });

  it('typing into a text/number cell emits rowsChange with the updated value at that row/key, other rows unchanged', () => {
    fixture.detectChanges();
    const spy = jasmine.createSpy('rowsChange');
    fixture.componentInstance.rowsChange.subscribe(spy);

    const bodyRows = fixture.nativeElement.querySelectorAll('tbody tr');
    const percentInput: HTMLInputElement = bodyRows[0].querySelectorAll('input')[0];
    percentInput.value = '25';
    percentInput.dispatchEvent(new Event('input'));

    expect(spy).toHaveBeenCalledWith([
      { rank: 'gold', percent: 25, note: 'top tier' },
      { rank: 'silver', percent: 5, note: 'mid tier' }
    ]);
  });

  it('clicking "+ Add" emits rowsChange with rows.length + 1 entries; the new row is blank/zero per column type', () => {
    fixture.detectChanges();
    const spy = jasmine.createSpy('rowsChange');
    fixture.componentInstance.rowsChange.subscribe(spy);

    const addButton: HTMLButtonElement = fixture.nativeElement.querySelector('.editable-table__add-row');
    addButton.click();

    expect(spy).toHaveBeenCalledWith([
      ...rows,
      { rank: '', percent: 0, note: '' }
    ]);
  });

  it('clicking remove on row i emits rowsChange with that row spliced out', () => {
    fixture.detectChanges();
    const spy = jasmine.createSpy('rowsChange');
    fixture.componentInstance.rowsChange.subscribe(spy);

    const removeButtons = fixture.nativeElement.querySelectorAll('.editable-table__remove-row');
    removeButtons[0].click();

    expect(spy).toHaveBeenCalledWith([{ rank: 'silver', percent: 5, note: 'mid tier' }]);
  });

  it('renders emptyStateLabel instead of an empty tbody when rows is empty', () => {
    fixture.componentInstance.rows = [];
    fixture.detectChanges();

    const bodyRows = fixture.nativeElement.querySelectorAll('tbody tr');
    expect(bodyRows.length).toBe(1);
    expect(fixture.nativeElement.querySelector('.editable-table__empty').textContent).toContain('No rows yet');
  });

  it('renders one option per column.options entry for a select-type column', () => {
    fixture.detectChanges();
    const firstSelect: HTMLSelectElement = fixture.nativeElement.querySelector('tbody tr select');
    const options = firstSelect.querySelectorAll('option');
    expect(options.length).toBe(2);
    expect(options[0].textContent).toContain('Gold');
    expect(options[1].textContent).toContain('Silver');
  });

  it('readOnly renders plain-text cells and hides add/remove affordances', () => {
    fixture.componentInstance.readOnly = true;
    fixture.detectChanges();

    const bodyRows = fixture.nativeElement.querySelectorAll('tbody tr');
    expect(bodyRows[0].querySelector('input')).toBeNull();
    expect(bodyRows[0].querySelector('select')).toBeNull();
    expect(bodyRows[0].textContent).toContain('gold');
    expect(fixture.nativeElement.querySelector('.editable-table__add-row')).toBeNull();
    expect(fixture.nativeElement.querySelector('.editable-table__remove-row')).toBeNull();
  });

  it('readOnly clicking a row emits rowClick with that row\'s index', () => {
    fixture.componentInstance.readOnly = true;
    fixture.detectChanges();
    const spy = jasmine.createSpy('rowClick');
    fixture.componentInstance.rowClick.subscribe(spy);

    const bodyRows = fixture.nativeElement.querySelectorAll('tbody tr');
    bodyRows[1].click();

    expect(spy).toHaveBeenCalledWith(1);
  });

  it('non-readOnly clicking a row does not emit rowClick', () => {
    fixture.detectChanges();
    const spy = jasmine.createSpy('rowClick');
    fixture.componentInstance.rowClick.subscribe(spy);

    const bodyRows = fixture.nativeElement.querySelectorAll('tbody tr');
    bodyRows[0].click();

    expect(spy).not.toHaveBeenCalled();
  });
});

import { Component } from '@angular/core';

@Component({
  standalone: true,
  imports: [EditableTableComponent],
  template: `
    <app-editable-table
      [readOnly]="true"
      [columns]="columns"
      [rows]="rows"
      [actionTemplate]="actionTpl"
      [emptyStateLabel]="'No rows'"
    ></app-editable-table>
    <ng-template #actionTpl let-row let-i="index">
      <button class="action-cell" [attr.data-index]="i">{{ row.note }}</button>
    </ng-template>
  `
})
class ActionColumnHostComponent {
  columns: EditableTableColumn[] = [
    { key: 'note', label: 'Note', type: 'text' },
    { key: 'actions', label: 'Actions', type: 'action' }
  ];
  rows: Record<string, string | number>[] = [{ note: 'top tier' }, { note: 'mid tier' }];
}

describe('EditableTableComponent action column', () => {
  it('renders the caller-supplied template in an action-type column cell', () => {
    TestBed.configureTestingModule({ imports: [ActionColumnHostComponent] });
    const fixture = TestBed.createComponent(ActionColumnHostComponent);
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll('.action-cell');
    expect(buttons.length).toBe(2);
    expect(buttons[0].textContent).toContain('top tier');
    expect(buttons[0].getAttribute('data-index')).toBe('0');
    expect(buttons[1].textContent).toContain('mid tier');
    expect(buttons[1].getAttribute('data-index')).toBe('1');
  });
});
