import { ExportColumn, exportCsv, printTable, toCsv } from './table-export.util';

interface Row { a: string | number | null | undefined; b?: string; }
const cols: ExportColumn<Row>[] = [
  { header: 'A', value: r => r.a },
  { header: 'B', value: r => r.b },
];

describe('table-export.util', () => {
  it('toCsv writes a BOM, a header row and CRLF-separated rows', () => {
    expect(toCsv<Row>([{ a: 1, b: 'x' }, { a: 2, b: 'y' }], cols)).toBe('﻿A,B\r\n1,x\r\n2,y');
  });

  it('toCsv quotes values containing commas, quotes and newlines and doubles embedded quotes', () => {
    const out = toCsv<Row>([{ a: 'a,b', b: 'say "hi"' }, { a: 'l1\nl2', b: 'r\r' }], cols);
    expect(out).toBe('﻿A,B\r\n"a,b","say ""hi"""\r\n"l1\nl2","r\r"');
  });

  it('toCsv renders null and undefined as empty cells', () => {
    expect(toCsv<Row>([{ a: null }], cols)).toBe('﻿A,B\r\n,');
  });

  it('toCsv neutralises spreadsheet formulas in string cells but leaves numbers alone', () => {
    const out = toCsv<Row>([{ a: '=SUM(A1)', b: '@x' }, { a: -5, b: '+1' }], cols);
    expect(out).toBe("﻿A,B\r\n'=SUM(A1),'@x\r\n-5,'+1");
  });

  describe('exportCsv', () => {
    let blobs: Blob[];
    let anchors: HTMLAnchorElement[];
    let revoked: string[];

    beforeEach(() => {
      blobs = []; anchors = []; revoked = [];
      spyOn(URL, 'createObjectURL').and.callFake((b: Blob | MediaSource) => { blobs.push(b as Blob); return 'blob:x'; });
      spyOn(URL, 'revokeObjectURL').and.callFake((u: string) => { revoked.push(u); });
      spyOn(HTMLAnchorElement.prototype, 'click').and.callFake(function (this: HTMLAnchorElement) { anchors.push(this); });
    });

    it('exportCsv creates an object URL for a text/csv blob, clicks a download anchor with the filename, and revokes the URL', async () => {
      exportCsv<Row>([{ a: 1, b: 'x' }], cols, 'out.csv');
      expect(blobs.length).toBe(1);
      expect(blobs[0].type).toContain('text/csv');
      // Blob.text() strips the BOM on decode, so assert the raw UTF-8 bytes EF BB BF.
      expect(Array.from(new Uint8Array(await blobs[0].arrayBuffer()).slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
      expect(anchors.length).toBe(1);
      expect(anchors[0].href).toBe('blob:x');
      expect(anchors[0].download).toBe('out.csv');
      expect(anchors[0].isConnected).toBeFalse();
      expect(revoked).toEqual(['blob:x']);
    });

    it('exportCsv appends .csv when the filename has no extension', () => {
      exportCsv<Row>([], cols, 'report');
      expect(anchors[0].download).toBe('report.csv');
    });
  });

  describe('printTable', () => {
    let target: HTMLElement;
    beforeEach(() => { target = document.createElement('div'); document.body.appendChild(target); });
    afterEach(() => target.remove());

    it('printTable calls window.print once, marks the target during the call, then removes the class and the injected style', () => {
      const styles = () => document.head.querySelectorAll('style[data-table-export-print]').length;
      const print = spyOn(window, 'print').and.callFake(() => {
        expect(target.classList.contains('table-export-print')).toBeTrue();
        expect(styles()).toBe(1);
      });
      printTable(target);
      expect(print).toHaveBeenCalledTimes(1);
      expect(target.classList.contains('table-export-print')).toBeFalse();
      expect(styles()).toBe(0);
    });

    it('printTable cleans up even when print throws', () => {
      spyOn(window, 'print').and.throwError('boom');
      expect(() => printTable(target)).toThrow();
      expect(target.classList.contains('table-export-print')).toBeFalse();
      expect(document.head.querySelectorAll('style[data-table-export-print]').length).toBe(0);
    });
  });
});
