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
  parentId: string;
  parentUserId: string;
  parentName: string;
}

export interface FilledEntry {
  vacant: false;
  depth: number;
  leg: 'L' | 'R' | null;
  x: number;
  id: string;
  data: TreeNode;
  // Filled nodes anywhere beneath this one -- the "+N more" count when the level below is hidden.
  descendants: number;
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
  maxDepth: number;
  filledCount: number;
  vacantCount: number;
}

function countDescendants(node: TreeNode): number {
  return node.children.reduce((sum, c) => sum + 1 + countDescendants(c), 0);
}

export function treeDepth(node: TreeNode): number {
  return node.children.reduce((max, c) => Math.max(max, 1 + treeDepth(c)), 0);
}

function childAt(node: TreeNode, leg: 'L' | 'R'): TreeNode | null {
  return node.children.find(child => child.position === leg) ?? null;
}

export function buildTreeLayout(root: TreeNode | null, depthLimit = Infinity): TreeLayout | null {
  if (!root) return null;

  const nodes: LayoutEntry[] = [];
  const links: LayoutLink[] = [];
  let leafCounter = 0;
  let maxSeenDepth = 0;
  let filledCount = 0;
  let vacantCount = 0;

  function layout(node: TreeNode | null, depth: number, leg: 'L' | 'R' | null, parent: TreeNode | null): LayoutEntry {
    maxSeenDepth = Math.max(maxSeenDepth, depth);

    if (node === null) {
      vacantCount++;
      // Vacant entries are only ever synthesized as a child of a real node, so parent is
      // always set here (the root itself is never null going into layout()).
      const entry: VacantEntry = {
        vacant: true,
        depth,
        leg,
        x: leafCounter++,
        id: `vacant-${depth}-${leafCounter}`,
        parentId: parent!.id,
        parentUserId: parent!.userId,
        parentName: parent!.name
      };
      nodes.push(entry);
      return entry;
    }

    filledCount++;

    // At the depth limit the level below is collapsed: lay this node out as a leaf (no vacant
    // slots beneath it -- those legs are hidden, not empty) and keep the "+N more" count.
    if (depth >= depthLimit) {
      const entry: FilledEntry = {
        vacant: false, depth, leg, x: leafCounter++, id: node.id, data: node, descendants: countDescendants(node)
      };
      nodes.push(entry);
      return entry;
    }

    const leftEntry = layout(childAt(node, 'L'), depth + 1, 'L', node);
    const rightEntry = layout(childAt(node, 'R'), depth + 1, 'R', node);
    const descendants = [leftEntry, rightEntry].reduce((sum, e) => sum + (e.vacant ? 0 : 1 + e.descendants), 0);
    const entry: FilledEntry = { vacant: false, depth, leg, x: (leftEntry.x + rightEntry.x) / 2, id: node.id, data: node, descendants };
    nodes.push(entry);
    links.push({ parent: entry, left: leftEntry, right: rightEntry });
    return entry;
  }

  const rootEntry = layout(root, 0, null, null) as FilledEntry;

  // layout() pushes each entry in post-order (children resolved, hence pushed,
  // before their parent, since a parent's x depends on its children's x). Sort
  // to depth-then-x so *ngFor emits DOM nodes in the same top-to-bottom,
  // left-to-right order the canvas draws them in -- natural tab/reading order.
  nodes.sort((a, b) => a.depth - b.depth || a.x - b.x);

  const contentWidth = LAYOUT.LEFT_MARGIN * 2 + leafCounter * LAYOUT.LEAF_GAP;
  const contentHeight = LAYOUT.TOP_MARGIN * 2 + maxSeenDepth * LAYOUT.ROW_H + LAYOUT.CARD_H;

  return { nodes, links, rootEntry, contentWidth, contentHeight, maxDepth: maxSeenDepth, filledCount, vacantCount };
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

// Semantic zoom: only the levels down to `depth` are laid out. Zooming out raises `depth`,
// zooming in lowers it; the layout is rebuilt compactly for the new depth.
export const INITIAL_DEPTH = 3;
export const ZOOM_STEP_PER_LEVEL = 1.5;

export function depthForScale(baseScale: number, scale: number, maxDepth: number): number {
  const extra = Math.floor(Math.log(baseScale / scale) / Math.log(ZOOM_STEP_PER_LEVEL) + 1e-9);
  return Math.max(INITIAL_DEPTH, Math.min(maxDepth, INITIAL_DEPTH + Math.max(0, extra)));
}
