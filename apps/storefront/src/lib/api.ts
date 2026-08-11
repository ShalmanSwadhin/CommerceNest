function isApiErrorResponse(value: unknown): value is { error: { code: string; message: string; details?: unknown } } {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.error !== 'object' || obj.error === null) return false;
  const err = obj.error as Record<string, unknown>;
  return typeof err.code === 'string' && typeof err.message === 'string';
}
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export class ApiClientError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type TokenGetter = () => string | null;
let getAccessToken: TokenGetter = () => null;
let onUnauthorized: () => void = () => undefined;

export function configureApiAuth(options: {
  getAccessToken: TokenGetter;
  onUnauthorized?: () => void;
}) {
  getAccessToken = options.getAccessToken;
  if (options.onUnauthorized) onUnauthorized = options.onUnauthorized;
}

export function getApiBaseUrl() {
  return API_BASE;
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  const token = getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });
  const body = await parseBody(res);
  if (!res.ok) {
    if (res.status === 401) onUnauthorized();
    if (isApiErrorResponse(body)) {
      throw new ApiClientError(
        res.status,
        body.error.code,
        body.error.message,
        body.error.details,
      );
    }
    throw new ApiClientError(
      res.status,
      'HTTP_ERROR',
      typeof body === 'string' && body ? body : res.statusText || 'Request failed',
    );
  }
  return body as T;
}

export function toQuery(
  params: Record<string, string | number | boolean | undefined | null>,
) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  storeId?: string | null;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken?: string;
  user: AuthUser;
}

export interface Paginated<T> {
  data?: T[];
  items?: T[];
  total: number;
  page?: number;
  limit?: number;
  pageSize?: number;
}

export function unwrapList<T>(
  payload: Paginated<T> | T[] | undefined | null,
): T[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  return payload.data ?? payload.items ?? [];
}

export function unwrapTotal<T>(
  payload: Paginated<T> | T[] | undefined | null,
): number {
  if (!payload) return 0;
  if (Array.isArray(payload)) return payload.length;
  return payload.total ?? payload.data?.length ?? 0;
}

export interface ThemeSettings {
  primaryColor?: string;
  secondaryColor?: string;
  fontFamily?: string;
  logoUrl?: string;
  faviconUrl?: string;
  cornerRadius?: string | number;
  heroTitle?: string;
  heroSubtitle?: string;
  heroImageUrl?: string;
  announcement?: string;
  headerStyle?: string;
  footerText?: string;
  [key: string]: unknown;
}

/** @deprecated Prefer ThemeSettings from themeSettings payloads */
export type ThemeConfig = ThemeSettings;

export interface StorefrontThemePayload {
  layout?: unknown;
  themeSettings?: ThemeSettings | null;
  versionNumber?: number;
  status?: string;
  config?: ThemeSettings;
}

export interface StorefrontStore {
  id: string;
  name: string;
  slug: string;
  tagline?: string | null;
  category?: string | null;
  bkashNumber?: string | null;
  bkashInstructions?: string | null;
  themeSettings?: ThemeSettings | null;
  theme?: StorefrontThemePayload | { config?: ThemeSettings };
}

export interface StorefrontProduct {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  basePrice: number | string;
  images?: Array<{ url: string; alt?: string }>;
  variants?: Array<{
    id: string;
    sku: string;
    stock: number;
    size?: string;
    color?: string;
    priceOverride?: number | null;
  }>;
  category?: { name?: string; slug?: string } | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
}

export interface StorefrontCategory {
  id: string;
  name: string;
  slug: string;
}

export interface HomePayload {
  store: StorefrontStore;
  featuredProducts?: StorefrontProduct[];
  categories?: StorefrontCategory[];
  theme?: StorefrontThemePayload | ThemeSettings | null;
}

export interface CheckoutResult {
  orderId: string;
  orderNumber?: string;
  total?: number | string;
  paymentMethod?: string;
  paymentStatus?: string;
  /** Legacy nested shape (tolerated if present). */
  order?: {
    id: string;
    orderNumber?: string;
    total?: number | string;
    paymentMethod?: string;
    paymentStatus?: string;
  };
}

export interface LookupOrder {
  id: string;
  orderNumber?: string;
  status: string;
  paymentStatus?: string;
  paymentMethod?: string;
  total?: number | string;
  customerPhone?: string;
  createdAt?: string;
  items?: Array<{ productName?: string; quantity: number }>;
}

export interface AccountOrder {
  id: string;
  orderNumber?: string;
  status: string;
  paymentStatus?: string;
  total?: number | string;
  createdAt?: string;
}

export function extractThemeSettings(
  theme: StorefrontThemePayload | ThemeSettings | null | undefined,
): ThemeSettings {
  if (!theme) return {} as ThemeSettings;
  if ('themeSettings' in theme && theme.themeSettings) {
    return theme.themeSettings as ThemeSettings;
  }
  if ('config' in theme && theme.config) {
    return theme.config as ThemeSettings;
  }
  return theme as ThemeSettings;
}

function sf(slug: string, suffix = '') {
  return `/api/storefront/${slug}${suffix}`;
}

/** Sort options supported by the storefront product listing endpoints. */
export type StorefrontProductSort =
  | 'newest'
  | 'price_asc'
  | 'price_desc'
  | 'name_asc';

/**
 * Query params accepted by both `GET /products` and
 * `GET /categories/:categorySlug/products`. Kept in one shared type so the
 * two client methods can never drift from each other again.
 */
export interface StorefrontProductQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  sort?: StorefrontProductSort;
  minPrice?: number;
  maxPrice?: number;
  /** String literal to match the API's zod schema (`'true' | 'false'`). */
  inStock?: 'true' | 'false';
}

export const storefrontApi = {
  resolve: (slug: string) => apiRequest<StorefrontStore>(sf(slug)),
  resolveByHost: (host: string) =>
    apiRequest<{ slug: string; store?: StorefrontStore }>(
      '/api/storefront/resolve-host',
      {
        method: 'POST',
        body: JSON.stringify({ host }),
      },
    ),
  home: (slug: string) => apiRequest<HomePayload>(sf(slug, '/home')),
  products: (slug: string, params: StorefrontProductQueryParams = {}) =>
    apiRequest<Paginated<StorefrontProduct> | StorefrontProduct[]>(
      sf(slug, `/products${toQuery(params as Record<string, string | number | undefined>)}`),
    ),
  product: (slug: string, productSlug: string) =>
    apiRequest<StorefrontProduct>(sf(slug, `/products/${productSlug}`)),
  categories: (slug: string) =>
    apiRequest<StorefrontCategory[] | { data: StorefrontCategory[] }>(
      sf(slug, '/categories'),
    ),
  categoryProducts: (
    slug: string,
    catSlug: string,
    params: StorefrontProductQueryParams = {},
  ) =>
    apiRequest<Paginated<StorefrontProduct> | StorefrontProduct[]>(
      sf(
        slug,
        `/categories/${catSlug}/products${toQuery(
          params as Record<string, string | number | undefined>,
        )}`,
      ),
    ),
  checkout: (slug: string, body: Record<string, unknown>) =>
    apiRequest<CheckoutResult>(sf(slug, '/checkout'), {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  submitBkashPayment: (slug: string, body: Record<string, unknown>) =>
    apiRequest<LookupOrder>(sf(slug, '/payments/bkash'), {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  lookupOrder: (slug: string, phone: string, orderNumber: string) =>
    apiRequest<LookupOrder>(sf(slug, '/orders/lookup'), {
      method: 'POST',
      body: JSON.stringify({ phone, orderNumber }),
    }),
  otpRequest: (slug: string, phone: string) =>
    apiRequest<{ ok: boolean; devCode?: string }>(sf(slug, '/auth/otp/request'), {
      method: 'POST',
      body: JSON.stringify({ phone }),
    }),
  otpVerify: (slug: string, phone: string, code: string) =>
    apiRequest<{
      accessToken?: string;
      customer?: { id: string; name?: string; phone: string };
    }>(sf(slug, '/auth/otp/verify'), {
      method: 'POST',
      body: JSON.stringify({ phone, code }),
    }),
  profile: (slug: string) =>
    apiRequest<{
      customer?: { id: string; name?: string; phone: string; email?: string | null };
      id?: string;
      name?: string;
      phone?: string;
      email?: string | null;
    }>(sf(slug, '/me')),
  cms: async (slug: string, key: string) => {
    try {
      return await apiRequest<{
        key: string;
        title?: string | null;
        body?: string | null;
      }>(sf(slug, `/cms/${encodeURIComponent(key)}`));
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 404) return null;
      throw err;
    }
  },
  accountOrders: (slug: string) =>
    apiRequest<Paginated<AccountOrder> | AccountOrder[]>(
      sf(slug, '/account/orders'),
    ),
};
