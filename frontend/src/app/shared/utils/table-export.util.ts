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

export interface TableData { headers: string[]; rows: string[][]; }

const SKIP_HEAD = /^\s*$/;

// Reads headers + body text from a rendered table. Drops columns that are blank-headed or marked
// data-no-export (select / serial / action / remove columns); keeps the total row.
export function scrapeTable(root: HTMLElement | null): TableData {
  const table = root?.tagName === 'TABLE' ? (root as HTMLTableElement) : root?.querySelector('table');
  if (!table) { return { headers: [], rows: [] }; }
  const txt = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  const ths = Array.from(table.querySelectorAll('thead tr:last-child th'));
  const keep = ths.map(th => !th.hasAttribute('data-no-export') && !SKIP_HEAD.test(txt(th)));
  const headers = ths.filter((_, i) => keep[i]).map(txt);
  const rows = Array.from(table.querySelectorAll('tbody tr'))
    .filter(tr => !tr.querySelector('td[colspan]'))
    .map(tr => Array.from(tr.children).filter((_, i) => keep[i] ?? true).map(txt));
  return { headers, rows };
}

export const tableToTsv = (d: TableData): string => [d.headers, ...d.rows].map(l => l.map(flat).join('\t')).join('\n');

export function copyData(d: TableData): Promise<void> { return navigator.clipboard.writeText(tableToTsv(d)); }

export async function exportXlsx(d: TableData, filename: string): Promise<void> {
  const { Workbook } = await import('exceljs');
  const wb = new Workbook();
  const ws = wb.addWorksheet('Sheet1');
  // Strings starting with = + - @ are written as text by exceljs (no formula), so no escaping needed.
  ws.addRow(d.headers).font = { bold: true };
  d.rows.forEach(r => ws.addRow(r));
  ws.columns.forEach((c, i) => { c.width = Math.min(50, Math.max(10, ...[d.headers[i], ...d.rows.map(r => r[i])].map(v => (v ?? '').length + 2))); });
  const buf = await wb.xlsx.writeBuffer();
  download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    /\.xlsx$/i.test(filename) ? filename : `${filename}.xlsx`);
}

export async function exportPdf(d: TableData, filename: string, title: string): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: d.headers.length > 6 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  doc.setFontSize(14);
  doc.text(title, 40, 36);
  autoTable(doc, { head: [d.headers], body: d.rows, startY: 48, styles: { fontSize: 8 }, headStyles: { fillColor: [40, 40, 40] } });
  doc.save(/\.pdf$/i.test(filename) ? filename : `${filename}.pdf`);
}

// Prints just the given data (not the page) via a hidden iframe.
export function printData(d: TableData, title: string): void {
  const e = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `<!doctype html><title>${e(title)}</title><style>body{font:12px sans-serif}table{border-collapse:collapse;width:100%}` +
    `th,td{border:1px solid #999;padding:4px 6px;text-align:left}th{background:#eee}</style><h3>${e(title)}</h3>` +
    `<table><thead><tr>${d.headers.map(h => `<th>${e(h)}</th>`).join('')}</tr></thead><tbody>` +
    d.rows.map(r => `<tr>${r.map(c => `<td>${e(c)}</td>`).join('')}</tr>`).join('') + '</tbody></table>';
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;width:0;height:0;border:0';
  document.body.appendChild(f);
  f.srcdoc = html;
  f.onload = () => { f.contentWindow!.focus(); f.contentWindow!.print(); setTimeout(() => f.remove(), 1000); };
}
