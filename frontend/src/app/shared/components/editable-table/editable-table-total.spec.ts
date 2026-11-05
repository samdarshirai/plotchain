import { EditableTableComponent, sumColumn } from './editable-table.component';

describe('sumColumn', () => {
  it('sums formatted money and keeps the prefix with Indian grouping', () => {
    expect(sumColumn(['₹1,00,000', '₹50,000', ''])).toBe('₹1,50,000');
  });
  it('keeps a suffix and ignores non-numeric cells', () => {
    expect(sumColumn(['10 INR', '5 INR', '—'])).toBe('15 INR');
  });
  it('returns empty when nothing is numeric', () => {
    expect(sumColumn(['—', ''])).toBe('');
  });
});

describe('EditableTableComponent total row', () => {
  it('labels the first column Total and sums only sum columns', () => {
    const c = new EditableTableComponent();
    c.columns = [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'amount', label: 'Amount', type: 'text', sum: true },
      { key: 'rate', label: 'Rate', type: 'text' }
    ];
    c.rows = [{ name: 'a', amount: '₹100', rate: '₹5' }, { name: 'b', amount: '₹250', rate: '₹5' }];
    c.ngOnChanges();
    expect(c.totalRow?.map(t => t.value)).toEqual(['Total', '₹350', '']);
  });
  it('has no total row without sum columns', () => {
    const c = new EditableTableComponent();
    c.columns = [{ key: 'a', label: 'A', type: 'text' }];
    c.rows = [{ a: '1' }];
    c.ngOnChanges();
    expect(c.totalRow).toBeNull();
  });
});
