export interface TreeNodeSummary {
  id: string;
  userId: string;
  name: string;
}

export interface TreeSearchResult {
  ancestorPath: TreeNodeSummary[];
}
