// Pure pan/zoom math for the tree-explorer canvas. No DOM access -- the component
// writes the resulting transform directly for a hot pointer/wheel path (see
// tree-explorer.component.ts), this module only computes the next state.
export interface PanZoomState {
  x: number;
  y: number;
  scale: number;
}

export const MIN_SCALE = 0.3;
export const MAX_SCALE = 2.5;

export function clampScale(scale: number): number {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
}

// Rescales around (cx, cy) such that the content-space point currently under
// (cx, cy) stays under (cx, cy) after the scale changes.
export function zoomAround(state: PanZoomState, cx: number, cy: number, factor: number): PanZoomState {
  const newScale = clampScale(state.scale * factor);
  const contentX = (cx - state.x) / state.scale;
  const contentY = (cy - state.y) / state.scale;
  return {
    scale: newScale,
    x: cx - contentX * newScale,
    y: cy - contentY * newScale
  };
}

export function panBy(state: PanZoomState, dx: number, dy: number): PanZoomState {
  return { x: state.x + dx, y: state.y + dy, scale: state.scale };
}

// Two-finger pinch: rescale from the gesture's starting scale/distance ratio,
// anchored at the pinch midpoint, same content-space-fixed-point invariant as zoomAround.
export function pinchZoom(
  startState: PanZoomState,
  startDist: number,
  currentDist: number,
  midX: number,
  midY: number
): PanZoomState {
  const ratio = currentDist / startDist;
  const newScale = clampScale(startState.scale * ratio);
  const contentX = (midX - startState.x) / startState.scale;
  const contentY = (midY - startState.y) / startState.scale;
  return {
    scale: newScale,
    x: midX - contentX * newScale,
    y: midY - contentY * newScale
  };
}

export function computeFitTransform(
  contentW: number,
  contentH: number,
  wrapW: number,
  wrapH: number,
  margin = 0.92
): PanZoomState {
  const rawScale = contentW > 0 && contentH > 0
    ? Math.min(wrapW / contentW, wrapH / contentH) * margin
    : 1;
  const scale = clampScale(rawScale);
  return {
    scale,
    x: (wrapW - contentW * scale) / 2,
    y: 24
  };
}

export function computeCenterTransform(
  entryX: number,
  entryY: number,
  wrapW: number,
  wrapH: number,
  targetScale: number
): PanZoomState {
  const scale = clampScale(targetScale);
  return {
    scale,
    x: wrapW / 2 - entryX * scale,
    y: wrapH / 2 - entryY * scale
  };
}
