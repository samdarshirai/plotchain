export interface LoginResponse {
  token: string;
  associateId: string;
  role: string;
  mustChangePassword: boolean;
}
