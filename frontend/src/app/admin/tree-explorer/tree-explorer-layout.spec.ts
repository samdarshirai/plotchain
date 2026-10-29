import { buildTreeLayout, depthForScale, INITIAL_DEPTH, visibleSlice, LAYOUT, linkPathD, px, py } from './tree-explorer-layout';
import { TreeNode } from '../models/tree-node.model';

function node(overrides: Partial<TreeNode>): TreeNode {
  return {
    id: 'id', userId: 'VP00001', name: 'Name', rankName: null, kycStatus: 'PENDING',
    position: null, leftLegVolume: 0, rightLegVolume: 0, skewedLegsFlag: false,
    stagnantFlag: false, children: [],
    ...overrides
  };
}

describe('buildTreeLayout', () => {
  it('returns null for a null root', () => {
    expect(buildTreeLayout(null)).toBeNull();
  });

  it('lays out a root-only tree with two vacant slots', () => {
    const layout = buildTreeLayout(node({ id: 'root' }))!;

    expect(layout.filledCount).toBe(1);
    expect(layout.vacantCount).toBe(2);
    expect(layout.nodes.length).toBe(3);
    expect(layout.links.length).toBe(1);
    expect(layout.rootEntry.id).toBe('root');
  });

  it('treats a missing single leg as vacant while the other leg is filled', () => {
    const root = node({
      id: 'root',
      children: [node({ id: 'left', position: 'L' })]
    });

    const layout = buildTreeLayout(root)!;
    const link = layout.links.find(l => l.parent.id === 'root')!;

    expect((link.left as any).vacant).toBe(false);
    expect((link.left as any).id).toBe('left');
    expect(link.right.vacant).toBe(true);
  });

  it('tags each vacant slot with the id/userId/name of the parent it hangs off', () => {
    const root = node({ id: 'root', userId: 'VP00001', name: 'Root Person' });

    const layout = buildTreeLayout(root)!;
    const vacant = layout.nodes.filter(n => n.vacant) as any[];

    expect(vacant.length).toBe(2);
    for (const entry of vacant) {
      expect(entry.parentId).toBe('root');
      expect(entry.parentUserId).toBe('VP00001');
      expect(entry.parentName).toBe('Root Person');
    }
  });

  it('lays out nodes deeper than 3 levels, with vacant slots beneath the deepest', () => {
    const root = node({
      id: 'd0',
      children: [node({ id: 'd1', position: 'L', children: [node({ id: 'd2', position: 'L', children: [
        node({ id: 'd3', position: 'L', children: [node({ id: 'd4', position: 'L', children: [] })] })
      ] })] })]
    });

    const layout = buildTreeLayout(root)!;

    expect(layout.filledCount).toBe(5);
    expect(layout.nodes.some(n => n.vacant && n.depth === 5)).toBe(true);
  });

  it('computes contentWidth/contentHeight from margins, leaf count, and depth', () => {
    const layout = buildTreeLayout(node({ id: 'root' }))!;
    const leafCount = layout.nodes.filter(n => n.vacant || n.depth === Math.max(...layout.nodes.map(x => x.depth))).length;

    expect(layout.contentWidth).toBe(LAYOUT.LEFT_MARGIN * 2 + 2 * LAYOUT.LEAF_GAP);
    expect(layout.contentHeight).toBe(LAYOUT.TOP_MARGIN * 2 + 1 * LAYOUT.ROW_H + LAYOUT.CARD_H);
    expect(leafCount).toBeGreaterThan(0);
  });

  it('produces the expected orthogonal path string for a simple parent + two children', () => {
    const root = node({
      id: 'root',
      children: [node({ id: 'left', position: 'L' }), node({ id: 'right', position: 'R' })]
    });

    const layout = buildTreeLayout(root)!;
    const link = layout.links[0];
    const d = linkPathD(link);

    const pX = px(link.parent);
    const pBottom = py(link.parent) + LAYOUT.CARD_H;
    const midY = pBottom + LAYOUT.LEVEL_GAP / 2;
    const lX = px(link.left);
    const lY = py(link.left);
    const rX = px(link.right);
    const rY = py(link.right);

    expect(d).toBe(
      `M ${pX} ${pBottom} L ${pX} ${midY} M ${lX} ${midY} L ${rX} ${midY} M ${lX} ${midY} L ${lX} ${lY} M ${rX} ${midY} L ${rX} ${rY}`
    );
  });

  describe('semantic zoom', () => {
    const chain = () => buildTreeLayout(node({
      id: 'd0',
      children: [node({ id: 'd1', position: 'L', children: [node({ id: 'd2', position: 'L', children: [
        node({ id: 'd3', position: 'L', children: [node({ id: 'd4', position: 'L', children: [] })] })
      ] })] })]
    }))!;

    it('counts filled descendants under each node', () => {
      const layout = chain();
      const d3 = layout.nodes.find(n => n.id === 'd3')!;
      expect(!d3.vacant && d3.descendants).toBe(1);
      expect(layout.rootEntry.descendants).toBe(4);
    });

    it('keeps the depth at INITIAL_DEPTH until zoomed out, then adds a level per step', () => {
      expect(depthForScale(1, 1, 9)).toBe(INITIAL_DEPTH);
      expect(depthForScale(1, 2, 9)).toBe(INITIAL_DEPTH);
      expect(depthForScale(1, 0.6, 9)).toBe(INITIAL_DEPTH + 1);
      expect(depthForScale(1, 0.4, 9)).toBe(INITIAL_DEPTH + 2);
      expect(depthForScale(1, 0.0001, 5)).toBe(5);
    });

    it('slices nodes and links to the visible depth', () => {
      const view = visibleSlice(chain(), INITIAL_DEPTH);
      expect(view.nodes.every(n => n.depth <= INITIAL_DEPTH)).toBe(true);
      expect(view.nodes.some(n => n.id === 'd4')).toBe(false);
      expect(view.links.some(l => l.parent.id === 'd3')).toBe(false);
    });
  });
});
