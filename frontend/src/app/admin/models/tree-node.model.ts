export interface TreeNode {
  id: string;
  userId: string;
  name: string;
  designation: string | null;
  kycStatus: 'PENDING' | 'VERIFIED' | 'REJECTED';
  position: string | null;
  leftLegVolume: number;
  rightLegVolume: number;
  totalLeftBusiness: number;
  totalRightBusiness: number;
  skewedLegsFlag: boolean;
  stagnantFlag: boolean;
  plotBuyer: boolean;
  children: TreeNode[];
}
