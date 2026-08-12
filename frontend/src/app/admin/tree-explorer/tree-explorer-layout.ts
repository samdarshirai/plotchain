import { TreeNode } from '../models/tree-node.model';

// Tidy binary tree layout: every node is centered above the midpoint of its two
// children, so with 0-or-2-children-only nodes, links never cross or overlap.
// Ported from the tree-explorer.html design mockup's layout()/px()/py().
export const LAYOUT = {
  CARD_W: 220,
  CARD_H: 158,
  VACANT_H: 92,
  LEAF_GAP: 260,
  LEVEL_GAP: 78,
  ROW_H: 158 + 78,
  TOP_MARGIN: 50,
  LEFT_MARGIN: 60
} as const;

export interface VacantEntry {
  vacant: true;
  depth: number;
  leg: 'L' | 'R' | null;
  x: number;
  id: string;
}

export interface FilledEntry {
  vacant: false;
  depth: number;
  leg: 'L' | 'R' | null;
  x: number;
  id: string;
  data: TreeNode;
}

export type LayoutEntry = VacantEntry | FilledEntry;

export interface LayoutLink {
  parent: FilledEntry;
  left: LayoutEntry;
  right: LayoutEntry;
}

export interface TreeLayout {
  nodes: LayoutEntry[];
  links: LayoutLink[];
  rootEntry: FilledEntry;
  contentWidth: number;
  contentHeight: number;
  filledCount: number;
  vacantCount: number;
}

function childAt(node: TreeNode, leg: 'L' | 'R'): TreeNode | null {
  return node.children.find(child => child.position === leg) ?? null;
}

export function buildTreeLayout(root: TreeNode | null, maxDepth: number): TreeLayout | null {
  if (!root) return null;

  const nodes: LayoutEntry[] = [];
  const links: LayoutLink[] = [];
  let leafCounter = 0;
  let maxSeenDepth = 0;
  let filledCount = 0;
  let vacantCount = 0;

  function layout(node: TreeNode | null, depth: number, leg: 'L' | 'R' | null): LayoutEntry {
    maxSeenDepth = Math.max(maxSeenDepth, depth);

    if (node === null) {
      vacantCount++;
      const entry: VacantEntry = { vacant: true, depth, leg, x: leafCounter++, id: `vacant-${depth}-${leafCounter}` };
      nodes.push(entry);
      return entry;
    }

    filledCount++;

    // A node returned at the API's max fetch depth has children:[] because the
    // API didn't fetch further, not because those legs are confirmed vacant --
    // stop here without synthesizing vacant slots beneath it.
    if (depth >= maxDepth) {
      const entry: FilledEntry = { vacant: false, depth, leg, x: leafCounter++, id: node.id, data: node };
      nodes.push(entry);
      return entry;
    }

    const leftEntry = layout(childAt(node, 'L'), depth + 1, 'L');
    const rightEntry = layout(childAt(node, 'R'), depth + 1, 'R');
    const entry: FilledEntry = { vacant: false, depth, leg, x: (leftEntry.x + rightEntry.x) / 2, id: node.id, data: node };
    nodes.push(entry);
    links.push({ parent: entry, left: leftEntry, right: rightEntry });
    return entry;
  }

  const rootEntry = layout(root, 0, null) as FilledEntry;

  // layout() pushes each entry in post-order (children resolved, hence pushed,
  // before their parent, since a parent's x depends on its children's x). Sort
  // to depth-then-x so *ngFor emits DOM nodes in the same top-to-bottom,
  // left-to-right order the canvas draws them in -- natural tab/reading order.
  nodes.sort((a, b) => a.depth - b.depth || a.x - b.x);

  const contentWidth = LAYOUT.LEFT_MARGIN * 2 + leafCounter * LAYOUT.LEAF_GAP;
  const contentHeight = LAYOUT.TOP_MARGIN * 2 + maxSeenDepth * LAYOUT.ROW_H + LAYOUT.CARD_H;

  return { nodes, links, rootEntry, contentWidth, contentHeight, filledCount, vacantCount };
}

export function px(entry: LayoutEntry): number {
  return LAYOUT.LEFT_MARGIN + (entry.x + 0.5) * LAYOUT.LEAF_GAP;
}

export function py(entry: LayoutEntry): number {
  return LAYOUT.TOP_MARGIN + entry.depth * LAYOUT.ROW_H;
}

export function linkPathD(link: LayoutLink): string {
  const pX = px(link.parent);
  const pBottom = py(link.parent) + LAYOUT.CARD_H;
  const midY = pBottom + LAYOUT.LEVEL_GAP / 2;
  const lX = px(link.left);
  const lY = py(link.left);
  const rX = px(link.right);
  const rY = py(link.right);
  return [
    'M', pX, pBottom, 'L', pX, midY,
    'M', lX, midY, 'L', rX, midY,
    'M', lX, midY, 'L', lX, lY,
    'M', rX, midY, 'L', rX, rY
  ].join(' ');
}
