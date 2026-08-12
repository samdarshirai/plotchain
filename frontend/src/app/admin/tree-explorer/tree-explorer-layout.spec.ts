import { buildTreeLayout, LAYOUT, linkPathD, px, py } from './tree-explorer-layout';
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
    expect(buildTreeLayout(null, 3)).toBeNull();
  });

  it('lays out a root-only tree with two vacant slots', () => {
    const layout = buildTreeLayout(node({ id: 'root' }), 3)!;

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

    const layout = buildTreeLayout(root, 3)!;
    const link = layout.links.find(l => l.parent.id === 'root')!;

    expect((link.left as any).vacant).toBe(false);
    expect((link.left as any).id).toBe('left');
    expect(link.right.vacant).toBe(true);
  });

  it('does not synthesize vacant children beneath a node at the max fetch depth', () => {
    // depth 0 (root) -> depth 1 -> depth 2 -> depth 3, with the depth-3 node
    // returning children: [] because the API stopped fetching, not because
    // those legs are confirmed empty.
    const root = node({
      id: 'd0',
      children: [
        node({
          id: 'd1', position: 'L',
          children: [
            node({
              id: 'd2', position: 'L',
              children: [node({ id: 'd3', position: 'L', children: [] })]
            })
          ]
        })
      ]
    });

    const layout = buildTreeLayout(root, 3)!;

    // 4 filled nodes (d0..d3) plus vacant slots only at depths 1-3 for the
    // legs that were never taken -- none of them synthesized beneath d3.
    expect(layout.filledCount).toBe(4);
    expect(layout.nodes.some(n => n.vacant && n.depth === 4)).toBe(false);
    const d3Links = layout.links.filter(l => l.parent.id === 'd3');
    expect(d3Links.length).toBe(0);
  });

  it('computes contentWidth/contentHeight from margins, leaf count, and depth', () => {
    const layout = buildTreeLayout(node({ id: 'root' }), 3)!;
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

    const layout = buildTreeLayout(root, 3)!;
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
});
