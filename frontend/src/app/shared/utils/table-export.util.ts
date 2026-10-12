export interface ExportColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

const PRINT_CLASS = 'table-export-print';
const PRINT_CSS =
  `@media print{body *{visibility:hidden!important}` +
  `.${PRINT_CLASS},.${PRINT_CLASS} *{visibility:visible!important}` +
  `.${PRINT_CLASS}{position:absolute;left:0;top:0;width:100%}}`;

function cell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) { return ''; }
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@]/.test(s)) { s = `'${s}`; }
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T>(rows: T[], columns: ExportColumn<T>[]): string {
  const lines = [columns.map(c => cell(c.header)).join(',')];
  for (const r of rows) { lines.push(columns.map(c => cell(c.value(r))).join(',')); }
  return '﻿' + lines.join('\r\n');
}

export function exportCsv<T>(rows: T[], columns: ExportColumn<T>[], filename: string): void {
  const url = URL.createObjectURL(new Blob([toCsv(rows, columns)], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = /\.csv$/i.test(filename) ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  try { a.click(); } finally { a.remove(); URL.revokeObjectURL(url); }
}

export function printTable(target: HTMLElement): void {
  const style = document.createElement('style');
  style.setAttribute('data-table-export-print', '');
  style.textContent = PRINT_CSS;
  document.head.appendChild(style);
  target.classList.add(PRINT_CLASS);
  try { window.print(); } finally { target.classList.remove(PRINT_CLASS); style.remove(); }
}
