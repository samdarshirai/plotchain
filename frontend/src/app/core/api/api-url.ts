import { environment } from '../../../environments/environment';

export const API_BASE = environment.apiBaseUrl;

// Prefix root-relative /api paths with the backend origin; leaves other URLs untouched.
export const apiUrl = (path: string): string => (path.startsWith('/api') ? API_BASE + path : path);
