import { treeHoverPosition } from './tree-hover-position.directive';

describe('treeHoverPosition', () => {
  const viewport = { width: 1000, height: 700 };
  const popup = { width: 300, height: 250 };

  it('prefers the right side when there is space', () => {
    expect(treeHoverPosition({ left: 100, right: 300, top: 100 }, popup, viewport))
      .toEqual({ left: 312, top: 100 });
  });

  for (const top of [0, 680]) {
    for (const left of [0, 800]) {
      it(`keeps details inside the viewport at corner ${left},${top}`, () => {
        const result = treeHoverPosition({ left, right: left + 200, top }, popup, viewport);
        expect(result.left).toBeGreaterThanOrEqual(8);
        expect(result.top).toBeGreaterThanOrEqual(8);
        expect(result.left + popup.width).toBeLessThanOrEqual(viewport.width - 8);
        expect(result.top + popup.height).toBeLessThanOrEqual(viewport.height - 8);
        if (left === 800) expect(result.left).toBe(488);
      });
    }
  }

  it('clamps when neither side has enough space', () => {
    expect(treeHoverPosition({ left: 80, right: 280, top: 250 }, { width: 344, height: 304 }, { width: 360, height: 320 }))
      .toEqual({ left: 8, top: 8 });
  });
});
