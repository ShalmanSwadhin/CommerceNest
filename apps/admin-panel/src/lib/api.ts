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
  payload:
    | Paginated<T>
    | { data?: T[]; items?: T[] }
    | T[]
    | undefined
    | null,
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

export interface StoreRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  planTier?: string;
  category?: string | null;
  tagline?: string | null;
  createdAt?: string;
  domains?: Array<{ hostname: string; isPrimary?: boolean }>;
  _count?: { users?: number; orders?: number; products?: number };
}

export interface StoreDomainRow {
  id: string;
  hostname: string;
  type?: string;
  isPrimary?: boolean;
  status?: string;
  sslStatus?: string;
  createdAt?: string;
}

export interface StoreDetail extends StoreRow {
  bkashNumber?: string | null;
  bkashInstructions?: string | null;
  suspendedReason?: string | null;
  suspendedAt?: string | null;
  updatedAt?: string;
  owner?: { id: string; email: string; name: string; phone?: string | null };
  domains?: StoreDomainRow[];
  storefront?: {
    draftVersion?: { id: string; status?: string } | null;
    publishedVersion?: { id: string; status?: string } | null;
  } | null;
}

export interface PlatformSummary {
  totalStores?: number;
  activeStores?: number;
  platformRevenue?: number | string;
  totalUsers?: number;
  pendingPayments?: number;
  pendingPaymentAmount?: number | string;
  revenueSeries?: Array<{ date: string; revenue: number }>;
  recentActivity?: Array<{ id: string; message: string; createdAt: string }>;
  topStores?: Array<{
    id: string;
    name: string;
    slug: string;
    revenue: number;
    orders: number;
    status?: string;
    ownerName?: string;
    ownerEmail?: string | null;
  }>;
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

export interface ThemeVersion {
  id: string;
  status?: string;
  version?: number;
  versionNumber?: number;
  config?: Record<string, unknown>;
  themeSettings?: ThemeSettings | Record<string, unknown> | null;
  layout?: unknown;
  createdAt?: string;
  publishedAt?: string | null;
  createdBy?: { name?: string };
  /** Optional human-readable snapshot label, e.g. "Before summer campaign". */
  label?: string | null;
}

export interface NormalizedThemeDraft {
  themeSettings: ThemeSettings;
  layout: unknown;
  versionNumber?: number;
  id?: string;
  status?: string;
}

export interface NormalizedTheme {
  draft: NormalizedThemeDraft;
  published?: NormalizedThemeDraft | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function pickThemeSettings(source: Record<string, unknown> | null): ThemeSettings {
  if (!source) return {};
  const nested = asRecord(source.themeSettings);
  if (nested) return nested as ThemeSettings;
  const legacy = asRecord(source.config);
  if (legacy) return legacy as ThemeSettings;
  return source as ThemeSettings;
}

export function normalizeTheme(res: unknown): NormalizedTheme {
  const root = asRecord(res) || {};
  const draftVersion =
    asRecord(root.draftVersion) ||
    asRecord(root.draft) ||
    null;
  const publishedVersion =
    asRecord(root.publishedVersion) ||
    asRecord(root.published) ||
    null;

  const draftSettings = pickThemeSettings(draftVersion) || pickThemeSettings(root);
  const draftLayout =
    draftVersion?.layout ??
    root.layout ??
    null;

  return {
    draft: {
      id: typeof draftVersion?.id === 'string' ? draftVersion.id : undefined,
      status: typeof draftVersion?.status === 'string' ? draftVersion.status : undefined,
      versionNumber:
        typeof draftVersion?.versionNumber === 'number'
          ? draftVersion.versionNumber
          : typeof draftVersion?.version === 'number'
            ? draftVersion.version
            : undefined,
      themeSettings: draftSettings,
      layout: draftLayout,
    },
    published: publishedVersion
      ? {
          id: typeof publishedVersion.id === 'string' ? publishedVersion.id : undefined,
          status:
            typeof publishedVersion.status === 'string'
              ? publishedVersion.status
              : undefined,
          versionNumber:
            typeof publishedVersion.versionNumber === 'number'
              ? publishedVersion.versionNumber
              : typeof publishedVersion.version === 'number'
                ? publishedVersion.version
                : undefined,
          themeSettings: pickThemeSettings(publishedVersion),
          layout: publishedVersion.layout ?? null,
        }
      : null,
  };
}

export interface AuditLog {
  id: string;
  action: string;
  entityType?: string;
  entityId?: string;
  actor?: { name?: string; email?: string };
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface PendingPayment {
  id: string;
  orderNumber?: string;
  storeId?: string;
  store?: { name?: string; slug?: string };
  total?: number | string;
  bkashTxnId?: string | null;
  bkashSenderPhone?: string | null;
  paymentStatus?: string;
  createdAt?: string;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  role: string;
  status?: string;
  storeId?: string | null;
  store?: { id?: string; name?: string; slug?: string } | null;
  createdAt?: string;
}

export interface Announcement {
  id: string;
  title: string;
  body?: string;
  status?: string;
  audience?: unknown;
  publishAt?: string | null;
  expireAt?: string | null;
  createdAt?: string;
  createdBy?: { id?: string; name?: string; email?: string };
}

export interface SupportTicket {
  id: string;
  subject: string;
  status?: string;
  storeId?: string;
  store?: { name?: string; slug?: string };
  createdAt?: string;
}

export interface ImpersonateResponse {
  session: { id: string };
  store: StoreRow | { id: string; name: string; slug: string };
  /** Short-lived (60s), single-use opaque code. Exchanged by the destination
   * tab (store-dashboard) via POST /api/auth/impersonation/handoff — no raw
   * tokens are ever returned to the Master Admin caller. */
  handoffCode: string;
}

export interface PlatformSettingsResponse {
  items?: Array<{ key: string; value: unknown }>;
  [key: string]: unknown;
}

export const adminApi = {
  login: (email: string, password: string) =>
    apiRequest<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: () => apiRequest<unknown>('/api/auth/logout', { method: 'POST' }),
  me: () => apiRequest<AuthUser>('/api/auth/me'),
  summary: () => apiRequest<PlatformSummary>('/api/admin/analytics/summary'),
  listStores: (params: Record<string, string | number | undefined>) =>
    apiRequest<Paginated<StoreRow> | StoreRow[]>(`/api/admin/stores${toQuery(params)}`),
  createStore: (body: Record<string, unknown>) =>
    apiRequest<StoreRow>('/api/admin/stores', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getStore: (id: string) => apiRequest<StoreDetail>(`/api/admin/stores/${id}`),
  updateStore: (id: string, body: Record<string, unknown>) =>
    apiRequest<StoreRow>(`/api/admin/stores/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  suspendStore: (id: string, reason: string) =>
    apiRequest<StoreRow>(`/api/admin/stores/${id}/suspend`, {
      method: 'POST',
      body: JSON.stringify({ storeId: id, reason }),
    }),
  reactivateStore: (id: string) =>
    apiRequest<StoreRow>(`/api/admin/stores/${id}/reactivate`, { method: 'POST' }),
  archiveStore: (id: string) =>
    apiRequest<StoreRow>(`/api/admin/stores/${id}/archive`, { method: 'POST' }),
  impersonate: (id: string) =>
    apiRequest<ImpersonateResponse>(`/api/admin/stores/${id}/impersonate`, {
      method: 'POST',
    }),
  endImpersonation: async (sessionId?: string, body: Record<string, unknown> = {}) => {
    const errors: unknown[] = [];
    if (sessionId) {
      try {
        return await apiRequest<unknown>(`/api/admin/impersonate/${sessionId}/end`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
      } catch (err) {
        errors.push(err);
      }
    }
    try {
      return await apiRequest<unknown>('/api/admin/impersonation/end', {
        method: 'POST',
        body: JSON.stringify({ ...body, sessionId }),
      });
    } catch (err) {
      errors.push(err);
      throw errors[0] instanceof Error ? errors[0] : err;
    }
  },
  getTheme: async (storeId: string) => {
    const res = await apiRequest<unknown>(`/api/admin/stores/${storeId}/theme`);
    return normalizeTheme(res);
  },
  saveThemeDraft: (
    storeId: string,
    payload: {
      themeSettings: ThemeSettings | Record<string, unknown>;
      layout?: unknown;
      label?: string;
    },
  ) =>
    apiRequest<ThemeVersion>(`/api/admin/stores/${storeId}/theme/draft`, {
      method: 'PUT',
      body: JSON.stringify({
        themeSettings: payload.themeSettings,
        layout: payload.layout ?? { sections: [] },
        ...(payload.label !== undefined ? { label: payload.label } : {}),
      }),
    }),
  publishTheme: (storeId: string, label?: string) =>
    apiRequest<ThemeVersion>(`/api/admin/stores/${storeId}/theme/publish`, {
      method: 'POST',
      body: JSON.stringify({ label }),
    }),
  themeVersions: (storeId: string) =>
    apiRequest<ThemeVersion[] | { data: ThemeVersion[] }>(
      `/api/admin/stores/${storeId}/theme/versions`,
    ),
  restoreTheme: (storeId: string, versionId: string) =>
    apiRequest<ThemeVersion>(
      `/api/admin/stores/${storeId}/theme/versions/${versionId}/restore`,
      { method: 'POST' },
    ),
  /** Master Admin may access any store media library (tenant-scoped path). */
  listStoreMedia: (
    storeId: string,
    params: Record<string, string | number | undefined> = {},
  ) =>
    apiRequest<
      | Paginated<{
          id: string;
          url: string;
          filename: string;
          mimeType?: string;
          usageType?: string;
        }>
      | {
          id: string;
          url: string;
          filename: string;
          mimeType?: string;
          usageType?: string;
        }[]
    >(`/api/store/${storeId}/media${toQuery(params)}`),
  registerStoreMedia: (
    storeId: string,
    body: {
      publicId: string;
      url: string;
      filename: string;
      mimeType: string;
      bytes: number;
      usageType?: string;
    },
  ) =>
    apiRequest<{ id: string; url: string; filename: string }>(
      `/api/store/${storeId}/media`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  signedStoreUpload: (
    storeId: string,
    body: { filename: string; mimeType: string; usageType?: string },
  ) =>
    apiRequest<{
      mode: 'stub' | 'cloudinary';
      uploadUrl: string;
      publicId: string;
      fields: Record<string, string>;
      note?: string;
    }>(`/api/store/${storeId}/media/signed-url`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  auditLogs: (params: Record<string, string | number | undefined>) =>
    apiRequest<Paginated<AuditLog> | AuditLog[]>(
      `/api/admin/audit-logs${toQuery(params)}`,
    ),
  pendingPayments: (params: Record<string, string | number | undefined> = {}) =>
    apiRequest<Paginated<PendingPayment> | PendingPayment[]>(
      `/api/admin/payments/pending${toQuery(params)}`,
    ),
  settings: () => apiRequest<PlatformSettingsResponse>('/api/admin/settings'),
  updateSettings: (items: Array<{ key: string; value: unknown }>) =>
    apiRequest<PlatformSettingsResponse>('/api/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify({ items }),
    }),
  listUsers: (params: Record<string, string | number | undefined> = {}) =>
    apiRequest<Paginated<AdminUser> | AdminUser[]>(
      `/api/admin/users${toQuery(params)}`,
    ),
  listAnnouncements: (params: Record<string, string | number | undefined> = {}) =>
    apiRequest<Paginated<Announcement> | Announcement[]>(
      `/api/admin/announcements${toQuery(params)}`,
    ),
  createAnnouncement: (body: {
    title: string;
    body: string;
    status?: string;
    audience?: unknown;
  }) =>
    apiRequest<Announcement>('/api/admin/announcements', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  patchAnnouncement: (id: string, body: Record<string, unknown>) =>
    apiRequest<Announcement>(`/api/admin/announcements/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  listSupportTickets: (params: Record<string, string | number | undefined> = {}) =>
    apiRequest<Paginated<SupportTicket> | SupportTicket[]>(
      `/api/admin/support-tickets${toQuery(params)}`,
    ),
  getSupportTicket: (id: string) =>
    apiRequest<
      SupportTicket & {
        replies?: Array<{
          id: string;
          body: string;
          createdAt?: string;
          author?: { name?: string };
        }>;
      }
    >(`/api/admin/support-tickets/${id}`),
  replySupportTicket: (id: string, body: { body: string }) =>
    apiRequest(`/api/admin/support-tickets/${id}/replies`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  patchSupportTicket: (id: string, body: Record<string, unknown>) =>
    apiRequest<SupportTicket>(`/api/admin/support-tickets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  approvePayment: (orderId: string) =>
    apiRequest<PendingPayment>(`/api/admin/payments/${orderId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ approved: true }),
    }),
  rejectPayment: (orderId: string, note?: string) =>
    apiRequest<PendingPayment>(`/api/admin/payments/${orderId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ approved: false, note }),
    }),
  patchUser: (id: string, body: Record<string, unknown>) =>
    apiRequest<AdminUser>(`/api/admin/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  // --- Trial leads ---
  listTrialLeads: (params: Record<string, string | number | undefined> = {}) =>
    apiRequest<Paginated<TrialLead>>(`/api/admin/trial-leads${toQuery(params)}`),
  getTrialLead: (id: string) => apiRequest<TrialLead>(`/api/admin/trial-leads/${id}`),
  extendTrial: (id: string, additionalDays: number) =>
    apiRequest<TrialLead>(`/api/admin/trial-leads/${id}/extend`, {
      method: 'POST',
      body: JSON.stringify({ additionalDays }),
    }),
  convertTrial: (id: string, planTier?: string) =>
    apiRequest<TrialLead>(`/api/admin/trial-leads/${id}/convert`, {
      method: 'POST',
      body: JSON.stringify({ planTier }),
    }),
  rejectTrial: (id: string, reason?: string) =>
    apiRequest<TrialLead>(`/api/admin/trial-leads/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  // --- Pricing packages ---
  listPackages: () => apiRequest<{ items: Package[] }>('/api/admin/packages'),
  createPackage: (body: Record<string, unknown>) =>
    apiRequest<Package>('/api/admin/packages', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updatePackage: (id: string, body: Record<string, unknown>) =>
    apiRequest<Package>(`/api/admin/packages/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deletePackage: (id: string) =>
    apiRequest<{ deactivatedInstead: boolean }>(`/api/admin/packages/${id}`, {
      method: 'DELETE',
    }),

  // --- Notifications ---
  listNotifications: (params: Record<string, string | number | boolean | undefined> = {}) =>
    apiRequest<{ items: AdminNotification[]; unreadCount: number; total: number }>(
      `/api/admin/notifications${toQuery(params)}`,
    ),
  markNotificationRead: (id: string) =>
    apiRequest(`/api/admin/notifications/${id}/read`, { method: 'POST' }),
  markAllNotificationsRead: () =>
    apiRequest('/api/admin/notifications/read-all', { method: 'POST' }),

  // --- Theme presets (prebuilt layouts) ---
  listThemePresets: () => apiRequest<{ items: ThemePreset[] }>('/api/admin/theme-presets'),
  applyThemePreset: (storeId: string, presetId: string) =>
    apiRequest(`/api/admin/stores/${storeId}/theme/apply-preset`, {
      method: 'POST',
      body: JSON.stringify({ presetId }),
    }),
};

export interface TrialLead {
  id: string;
  prospectName: string;
  businessName: string;
  phone: string;
  email: string;
  category: string | null;
  catalogSize: string | null;
  message: string | null;
  status: 'LEAD' | 'TRIAL_PENDING' | 'TRIAL_ACTIVE' | 'TRIAL_EXPIRED' | 'CONVERTED' | 'REJECTED';
  storeId: string | null;
  trialDurationDays: number | null;
  rejectionReason: string | null;
  trialUrl: string | null;
  createdAt: string;
  updatedAt: string;
  store: {
    id: string;
    name: string;
    slug: string;
    status: string;
    trialStartedAt: string | null;
    trialExpiresAt: string | null;
    domains: { hostname: string; isPrimary: boolean }[];
  } | null;
  reviewedBy: { id: string; name: string; email: string } | null;
}

export interface Package {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  monthlyPrice: string;
  yearlyPrice: string | null;
  currency: string;
  active: boolean;
  featured: boolean;
  displayOrder: number;
  maxProducts: number | null;
  maxStaff: number | null;
  maxOrders: number | null;
  storageLimitMb: number | null;
  features: string[];
  trialDays: number;
  customThemeAvailability: 'INCLUDED' | 'ADDITIONAL_CHARGE';
  supportLevel: string;
}

export interface AdminNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  storeId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface ThemePreset {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  displayOrder: number;
  layout: unknown;
  themeSettings: unknown;
}
