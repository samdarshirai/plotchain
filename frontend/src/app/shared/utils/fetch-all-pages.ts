import { EMPTY, Observable, expand, map, toArray } from 'rxjs';

// Backend caps every list endpoint at 100 rows per page. This walks all pages and returns one
// merged page (same shape: its list property holds every row, page 0) so screens can show every
// row -- and a true Total -- without a pager.
// ponytail: sequential requests; fine to ~thousands of rows, add a backend aggregate beyond that.
export const ALL_PAGES_SIZE = 100;

interface PageLike {
  page: number;
  size: number;
  totalElements: number;
}

export function fetchAllPages<T extends PageLike>(load: (page: number, size: number) => Observable<T>): Observable<T> {
  return load(0, ALL_PAGES_SIZE).pipe(
    expand(res => ((res.page + 1) * res.size < res.totalElements ? load(res.page + 1, ALL_PAGES_SIZE) : EMPTY)),
    toArray(),
    map(pages => {
      const key = Object.keys(pages[0]).find(k => Array.isArray((pages[0] as unknown as Record<string, unknown>)[k]))!;
      const rows = pages.flatMap(p => (p as unknown as Record<string, unknown[]>)[key]);
      return { ...pages[0], [key]: rows, page: 0 } as T;
    })
  );
}
