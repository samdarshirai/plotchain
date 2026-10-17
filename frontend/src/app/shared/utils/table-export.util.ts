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

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  try { a.click(); } finally { a.remove(); URL.revokeObjectURL(url); }
}

const flat = (v: string | number | null | undefined): string => (v === null || v === undefined ? '' : String(v).replace(/[\t\r\n]+/g, ' '));

// Tab-separated, pastes into Excel / Sheets as columns.
export function toTsv<T>(rows: T[], columns: ExportColumn<T>[]): string {
  return [columns.map(c => flat(c.header)), ...rows.map(r => columns.map(c => flat(c.value(r))))]
    .map(l => l.join('\t')).join('\n');
}

export function copyTable<T>(rows: T[], columns: ExportColumn<T>[]): Promise<void> {
  return navigator.clipboard.writeText(toTsv(rows, columns));
}

const esc = (v: string | number | null | undefined): string =>
  flat(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ponytail: an HTML table saved as .xls -- Excel opens it (with a format warning); swap for a real .xlsx writer if that bothers anyone.
export function exportExcel<T>(rows: T[], columns: ExportColumn<T>[], filename: string): void {
  const head = `<tr>${columns.map(c => `<th>${esc(c.header)}</th>`).join('')}</tr>`;
  const body = rows.map(r => `<tr>${columns.map(c => `<td>${esc(c.value(r))}</td>`).join('')}</tr>`).join('');
  const html = `<html><head><meta charset="utf-8"></head><body><table>${head}${body}</table></body></html>`;
  download(new Blob(['\ufeff' + html], { type: 'application/vnd.ms-excel;charset=utf-8' }),
    /\.xls$/i.test(filename) ? filename : `${filename}.xls`);
}

export function printTable(target: HTMLElement): void {
  const style = document.createElement('style');
  style.setAttribute('data-table-export-print', '');
  style.textContent = PRINT_CSS;
  document.head.appendChild(style);
  target.classList.add(PRINT_CLASS);
  try { window.print(); } finally { target.classList.remove(PRINT_CLASS); style.remove(); }
}
