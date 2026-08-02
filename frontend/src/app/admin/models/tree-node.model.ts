export interface TreeNode {
  id: string;
  userId: string;
  name: string;
  rankName: string | null;
  kycStatus: 'PENDING' | 'VERIFIED' | 'REJECTED';
  position: string | null;
  leftLegVolume: number;
  rightLegVolume: number;
  skewedLegsFlag: boolean;
  stagnantFlag: boolean;
  children: TreeNode[];
}
