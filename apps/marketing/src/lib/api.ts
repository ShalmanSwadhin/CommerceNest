const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export class ApiClientError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
  }
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const err =
      body && typeof body === 'object' && 'error' in body
        ? (body as { error: { code: string; message: string } }).error
        : { code: 'UNKNOWN', message: 'Something went wrong' };
    throw new ApiClientError(res.status, err.code, err.message);
  }
  return body as T;
}

export interface PublicPackage {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  monthlyPrice: string;
  yearlyPrice: string | null;
  currency: string;
  featured: boolean;
  displayOrder: number;
  maxProducts: number | null;
  maxStaff: number | null;
  storageLimitMb: number | null;
  features: string[];
  trialDays: number;
  customThemeAvailability: 'INCLUDED' | 'ADDITIONAL_CHARGE';
  supportLevel: string;
}

export interface TrialLeadInput {
  prospectName: string;
  businessName: string;
  phone: string;
  email: string;
  password: string;
  confirmPassword: string;
  category?: string;
  catalogSize?: string;
  message?: string;
}

export interface TrialLeadResult {
  trialUrl: string;
  businessName: string;
  trialExpiresAt: string;
}

export const publicApi = {
  listPackages: () => apiRequest<{ items: PublicPackage[] }>('/api/public/packages'),
  requestTrial: (input: TrialLeadInput) =>
    apiRequest<TrialLeadResult>('/api/public/trial-leads', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
};
