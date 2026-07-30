export interface CompanyBrandingResponse {
  primaryColor: string;
  secondaryColor: string;
  tagline: string;
  hasSquareLogo: boolean;
  hasWideLogo: boolean;
  updatedAt: string | null;
}

export type CompanyBrandingRequest = Omit<CompanyBrandingResponse, 'hasSquareLogo' | 'hasWideLogo' | 'updatedAt'>;

export type LogoVariant = 'square' | 'wide';
