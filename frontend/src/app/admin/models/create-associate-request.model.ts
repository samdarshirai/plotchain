export interface CreateAssociateRequest {
  name: string;
  email: string;
  phone?: string;
  sponsorId?: string;
  parentId?: string;
  position?: string;
}
