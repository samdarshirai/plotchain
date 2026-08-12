import {
  clampScale, computeCenterTransform, computeFitTransform, MAX_SCALE, MIN_SCALE, panBy, pinchZoom, zoomAround
} from './tree-explorer-pan-zoom';

describe('clampScale', () => {
  it('clamps below MIN_SCALE up to MIN_SCALE', () => {
    expect(clampScale(0.01)).toBe(MIN_SCALE);
  });

  it('clamps above MAX_SCALE down to MAX_SCALE', () => {
    expect(clampScale(10)).toBe(MAX_SCALE);
  });

  it('passes through values already in range', () => {
    expect(clampScale(1)).toBe(1);
  });
});

describe('zoomAround', () => {
  it('keeps the content-space point under the cursor fixed after zooming in', () => {
    const state = { x: -50, y: -20, scale: 1 };
    const cx = 200, cy = 150;
    const contentXBefore = (cx - state.x) / state.scale;
    const contentYBefore = (cy - state.y) / state.scale;

    const next = zoomAround(state, cx, cy, 1.5);

    const contentXAfter = (cx - next.x) / next.scale;
    const contentYAfter = (cy - next.y) / next.scale;
    expect(contentXAfter).toBeCloseTo(contentXBefore, 6);
    expect(contentYAfter).toBeCloseTo(contentYBefore, 6);
  });

  it('respects scale clamping when zooming far out', () => {
    const state = { x: 0, y: 0, scale: 1 };
    const next = zoomAround(state, 0, 0, 0.001);
    expect(next.scale).toBe(MIN_SCALE);
  });
});

describe('panBy', () => {
  it('translates x/y without touching scale', () => {
    const state = { x: 10, y: 20, scale: 1.4 };
    const next = panBy(state, 5, -3);
    expect(next).toEqual({ x: 15, y: 17, scale: 1.4 });
  });
});

describe('pinchZoom', () => {
  it('scales proportionally to the distance ratio, anchored at the midpoint', () => {
    const start = { x: 0, y: 0, scale: 1 };
    const next = pinchZoom(start, 100, 200, 50, 50);
    expect(next.scale).toBe(2);
  });

  it('keeps the content-space point under the midpoint fixed', () => {
    const start = { x: -10, y: -10, scale: 1 };
    const midX = 100, midY = 80;
    const contentXBefore = (midX - start.x) / start.scale;
    const contentYBefore = (midY - start.y) / start.scale;

    const next = pinchZoom(start, 100, 150, midX, midY);

    const contentXAfter = (midX - next.x) / next.scale;
    const contentYAfter = (midY - next.y) / next.scale;
    expect(contentXAfter).toBeCloseTo(contentXBefore, 6);
    expect(contentYAfter).toBeCloseTo(contentYBefore, 6);
  });
});

describe('computeFitTransform', () => {
  it('centers horizontally and clamps scale when content is larger than the wrap', () => {
    const t = computeFitTransform(2000, 1000, 800, 600);
    expect(t.scale).toBeLessThan(1);
    expect(t.x).toBeCloseTo((800 - 2000 * t.scale) / 2, 6);
    expect(t.y).toBe(24);
  });

  it('does not exceed MAX_SCALE when content is much smaller than the wrap', () => {
    const t = computeFitTransform(100, 100, 2000, 2000);
    expect(t.scale).toBeLessThanOrEqual(MAX_SCALE);
  });

  it('falls back to scale 1 for degenerate zero-size content', () => {
    const t = computeFitTransform(0, 0, 800, 600);
    expect(t.scale).toBe(1);
  });
});

describe('computeCenterTransform', () => {
  it('places the given content point at the center of the wrap', () => {
    const t = computeCenterTransform(300, 200, 800, 600, 1);
    expect(t.x).toBe(800 / 2 - 300);
    expect(t.y).toBe(600 / 2 - 200);
    expect(t.scale).toBe(1);
  });

  it('clamps the requested target scale', () => {
    const t = computeCenterTransform(0, 0, 800, 600, 10);
    expect(t.scale).toBe(MAX_SCALE);
  });
});
