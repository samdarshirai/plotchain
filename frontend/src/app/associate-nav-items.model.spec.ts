import { ASSOCIATE_NAV_ITEMS } from './associate-nav-items.model';

describe('ASSOCIATE_NAV_ITEMS', () => {
  const plotBookings = ASSOCIATE_NAV_ITEMS.find(i => i.key === 'plotBookings')!;

  it('lists My Bookings under Plot Bookings, before My Sales', () => {
    const keys = plotBookings.children!.map(c => c.key);
    expect(keys).toEqual(['viewPlot', 'teamPlots', 'leftPlots', 'rightPlots', 'myBookings', 'mySales']);
    const mine = plotBookings.children!.find(c => c.key === 'myBookings')!;
    expect(mine.path).toBe('/plot-bookings/mine');
    expect(mine.labelKey).toBe('nav.myBookings');
  });

  it('keeps every sub-item path inside its parent path', () => {
    for (const c of plotBookings.children!) {
      expect(c.path === plotBookings.path || c.path.startsWith(plotBookings.path + '/')).toBe(true);
    }
  });
});
