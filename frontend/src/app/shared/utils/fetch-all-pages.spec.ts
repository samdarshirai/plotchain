import { of } from 'rxjs';
import { fetchAllPages } from './fetch-all-pages';

describe('fetchAllPages', () => {
  it('walks every page and merges the list into one page', () => {
    const calls: number[] = [];
    let result: { sales: number[]; page: number; size: number } | undefined;
    fetchAllPages((page, size) => {
      calls.push(page);
      return of({ sales: page === 0 ? [1, 2] : [3], page, size: 2, totalElements: 3 });
    }).subscribe(r => (result = r));
    expect(calls).toEqual([0, 1]);
    expect(result?.sales).toEqual([1, 2, 3]);
    expect(result?.page).toBe(0);
  });
});
