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
let getRefreshToken: TokenGetter = () => null;
let onUnauthorized: () => void = () => undefined;
let onTokenRefreshed: (accessToken: string, refreshToken: string | null) => void =
  () => undefined;

export function configureApiAuth(options: {
  getAccessToken: TokenGetter;
  getRefreshToken?: TokenGetter;
  onUnauthorized?: () => void;
  onTokenRefreshed?: (accessToken: string, refreshToken: string | null) => void;
}) {
  getAccessToken = options.getAccessToken;
  if (options.getRefreshToken) getRefreshToken = options.getRefreshToken;
  if (options.onUnauthorized) onUnauthorized = options.onUnauthorized;
  if (options.onTokenRefreshed) onTokenRefreshed = options.onTokenRefreshed;
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

const REFRESH_PATH = '/api/auth/refresh';

/** Dedupe concurrent silent-refresh attempts triggered by parallel 401s. */
let refreshInFlight: Promise<string | null> | null = null;

async function silentRefresh(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${API_BASE}${REFRESH_PATH}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
          credentials: 'include',
        });
        const body = await parseBody(res);
        if (!res.ok || !isRefreshResponse(body)) return null;
        onTokenRefreshed(body.accessToken, body.refreshToken ?? null);
        return body.accessToken;
      } catch {
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

function isRefreshResponse(
  value: unknown,
): value is { accessToken: string; refreshToken?: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).accessToken === 'string'
  );
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  _retried = false,
): Promise<T> {
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
    if (res.status === 401 && !_retried && path !== REFRESH_PATH) {
      const newToken = await silentRefresh();
      if (newToken) {
        return apiRequest<T>(path, init, true);
      }
      onUnauthorized();
    } else if (res.status === 401) {
      onUnauthorized();
    }
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
  phone?: string | null;
  role: string;
  storeId?: string | null;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  impersonationSessionId?: string | null;
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

export interface StoreInfo {
  id: string;
  name: string;
  slug: string;
  status?: string;
  tagline?: string | null;
  category?: string | null;
  bkashNumber?: string | null;
  bkashInstructions?: string | null;
  domains?: Array<{ hostname: string; isPrimary?: boolean }>;
}

export interface StoreSummary {
  orders?: number;
  revenue?: number | string;
  customers?: number;
  products?: number;
  pendingPayments?: number;
  revenueSeries?: Array<{ date: string; revenue: number }>;
}

export interface OrderRow {
  id: string;
  orderNumber?: string;
  status: string;
  paymentMethod?: string;
  paymentStatus?: string;
  total?: number | string;
  customerName?: string;
  customerPhone?: string;
  riskLevelAtPlacement?: string;
  codConfirmedByCall?: boolean;
  bkashTxnId?: string | null;
  bkashSenderPhone?: string | null;
  courierName?: string | null;
  courierTrackingId?: string | null;
  courierNotes?: string | null;
  createdAt?: string;
  items?: Array<{
    productName?: string;
    quantity: number;
    unitPrice?: number | string;
  }>;
  deliveryAddress?: Record<string, string>;
}

export interface ProductRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  basePrice: number | string;
  categoryId?: string | null;
  category?: { name?: string } | null;
  images?: Array<{ url: string }>;
  updatedAt?: string;
  variants?: Array<{
    id: string;
    sku: string;
    stock: number;
    size?: string;
    color?: string;
  }>;
  description?: string | null;
}

export interface CustomerRow {
  id: string;
  name?: string;
  phone: string;
  email?: string | null;
  riskLevel?: string;
  orderCount?: number;
  createdAt?: string;
}

export interface MediaRow {
  id: string;
  url: string;
  publicId?: string;
  filename?: string;
  mimeType?: string;
  bytes?: number;
  usageType?: string;
  createdAt?: string;
}

export interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  parentId?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  _count?: { products?: number };
  children?: CategoryRow[];
}

export interface CouponRow {
  id: string;
  code: string;
  discountType: 'PERCENTAGE' | 'FIXED';
  discountValue: string | number;
  minOrderValue?: string | number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  active: boolean;
  usageLimit?: number | null;
  perCustomerLimit?: number | null;
  usedCount: number;
  createdAt: string;
}

export interface ReturnRow {
  id: string;
  storeId: string;
  orderId: string;
  customerId: string;
  reason: string;
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'ITEM_RECEIVED' | 'REFUNDED';
  staffNote?: string | null;
  refundAmount?: string | number | null;
  refundMethod?: string | null;
  requestedAt: string;
  resolvedAt?: string | null;
  refundedAt?: string | null;
  order?: { orderNumber: string; total: string | number };
  customer?: { id: string; name: string; phone: string };
}

export interface ThemeVersion {
  id: string;
  status?: string;
  version?: number;
  versionNumber?: number;
  themeSettings?: Record<string, unknown> | null;
  layout?: unknown;
  createdAt?: string;
  publishedAt?: string | null;
  createdBy?: { name?: string };
}

export interface ThemeSlice {
  themeSettings: Record<string, unknown>;
  layout: unknown;
  versionNumber?: number;
}

export interface CurrentThemeResponse {
  published: ThemeSlice | null;
  draft: ThemeSlice | null;
}

export interface CmsBlock {
  id: string;
  key?: string;
  title?: string;
  body?: string;
  fields?: Record<string, unknown>;
  sortOrder?: number;
}

export interface StaffRow {
  id: string;
  name: string;
  email: string;
  role: string;
  status?: string;
}

export interface DomainRequestRow {
  id: string;
  requestedLabel: string;
  requestedHostname: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ASSIGNED';
  note?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
}

export interface StoreUsage {
  planTier: string;
  planName: string;
  products: { used: number; limit: number | null };
  staff: { used: number; limit: number | null };
  storage: { usedBytes: number; limitBytes: number | null };
}

export interface BillingPeriod {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: 'OPEN' | 'CLOSED';
  planName: string;
  subscriptionPrice: number;
  platformFeeRate: number;
  currency: string;
  eligibleGmv: number;
  platformFeeAmount: number;
  totalDue: number;
}

export interface BillingLedgerEntry {
  id: string;
  type: 'SUBSCRIPTION_CHARGE' | 'PLATFORM_FEE' | 'ADJUSTMENT' | 'CREDIT' | 'PAYMENT';
  amount: number;
  currency: string;
  description: string;
  createdAt: string;
}

export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'VOID';
export type MerchantPaymentMethod = 'MANUAL_BKASH' | 'MANUAL_BANK_TRANSFER';
export type MerchantPaymentStatus = 'PENDING_VERIFICATION' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface Invoice {
  id: string;
  storeId: string;
  billingPeriodId: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  subscriptionAmount: number;
  platformFeeAmount: number;
  adjustmentAmount: number;
  totalAmount: number;
  amountPaid: number;
  creditApplied: number;
  amountDue: number;
  status: InvoiceStatus;
  platformFeeRate: number | null;
  eligibleGmv: number | null;
}

export interface MerchantPayment {
  id: string;
  storeId: string;
  invoiceId: string;
  method: MerchantPaymentMethod;
  amount: number;
  currency: string;
  referenceId: string;
  transferDate: string;
  note: string | null;
  status: MerchantPaymentStatus;
  submittedAt: string;
  verifiedAt: string | null;
  verifiedById: string | null;
  rejectionReason: string | null;
}

function storePath(storeId: string, suffix: string) {
  return `/api/store/${storeId}${suffix}`;
}

export const storeApi = {
  login: (email: string, password: string) =>
    apiRequest<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: () => apiRequest<unknown>('/api/auth/logout', { method: 'POST' }),
  me: async () => {
    const res = await apiRequest<{ user: AuthUser } | AuthUser>('/api/auth/me');
    return 'user' in res ? res.user : res;
  },
  // Optional account verification — see AUTHENTICATION_ARCHITECTURE.md.
  // Reuses the exact same infra as storefront customer verification.
  sendEmailVerification: () =>
    apiRequest<{ ok: boolean; message: string; alreadyVerified?: boolean; devLink?: string }>(
      '/api/auth/email-verification/send',
      { method: 'POST' },
    ),
  confirmEmailVerification: (token: string) =>
    apiRequest<{ ok: boolean }>('/api/auth/email-verification/verify', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),
  sendPhoneVerification: (phone: string) =>
    apiRequest<{ ok: boolean; message: string; devCode?: string }>(
      '/api/auth/phone-verification/send',
      { method: 'POST', body: JSON.stringify({ phone }) },
    ),
  confirmPhoneVerification: (phone: string, code: string) =>
    apiRequest<{ ok: boolean }>('/api/auth/phone-verification/verify', {
      method: 'POST',
      body: JSON.stringify({ phone, code }),
    }),
  refreshSession: (refreshToken: string) =>
    apiRequest<LoginResponse>('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }),
  exchangeImpersonationHandoff: (code: string) =>
    apiRequest<{ accessToken: string; refreshToken: string }>(
      '/api/auth/impersonation/handoff',
      { method: 'POST', body: JSON.stringify({ code }) },
    ),
  endImpersonation: (sessionId: string) =>
    apiRequest<unknown>(`/api/admin/impersonate/${sessionId}/end`, {
      method: 'POST',
      body: JSON.stringify({ endReason: 'manual' }),
    }),
  getStore: (storeId: string) => apiRequest<StoreInfo>(storePath(storeId, '')),
  summary: (storeId: string) =>
    apiRequest<StoreSummary>(storePath(storeId, '/analytics/summary')),
  listOrders: (
    storeId: string,
    params: Record<string, string | number | undefined>,
  ) =>
    apiRequest<Paginated<OrderRow> | OrderRow[]>(
      storePath(storeId, `/orders${toQuery(params)}`),
    ),
  getOrder: (storeId: string, id: string) =>
    apiRequest<OrderRow>(storePath(storeId, `/orders/${id}`)),
  updateOrderStatus: (
    storeId: string,
    orderId: string,
    body: Record<string, unknown>,
  ) =>
    apiRequest<OrderRow>(storePath(storeId, `/orders/${orderId}/status`), {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  confirmCod: (
    storeId: string,
    orderId: string,
    body: Record<string, unknown> = {},
  ) =>
    apiRequest<OrderRow>(storePath(storeId, `/orders/${orderId}/confirm-cod`), {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  listProducts: (
    storeId: string,
    params: Record<string, string | number | undefined>,
  ) =>
    apiRequest<Paginated<ProductRow> | ProductRow[]>(
      storePath(storeId, `/products${toQuery(params)}`),
    ),
  createProduct: (storeId: string, body: Record<string, unknown>) =>
    apiRequest<ProductRow>(storePath(storeId, '/products'), {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateProduct: (
    storeId: string,
    id: string,
    body: Record<string, unknown>,
  ) =>
    apiRequest<ProductRow>(storePath(storeId, `/products/${id}`), {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  archiveProduct: (storeId: string, id: string) =>
    apiRequest<ProductRow>(storePath(storeId, `/products/${id}/archive`), {
      method: 'POST',
    }),
  listCategories: (storeId: string) =>
    apiRequest<CategoryRow[]>(storePath(storeId, '/categories')),
  createCategory: (storeId: string, body: Record<string, unknown>) =>
    apiRequest<CategoryRow>(storePath(storeId, '/categories'), {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateCategory: (storeId: string, id: string, body: Record<string, unknown>) =>
    apiRequest<CategoryRow>(storePath(storeId, `/categories/${id}`), {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteCategory: (storeId: string, id: string) =>
    apiRequest<{ ok: boolean }>(storePath(storeId, `/categories/${id}`), {
      method: 'DELETE',
    }),
  listCoupons: (
    storeId: string,
    params: Record<string, string | number | boolean | undefined | null> = {},
  ) => apiRequest<Paginated<CouponRow>>(storePath(storeId, `/coupons${toQuery(params)}`)),
  createCoupon: (storeId: string, body: Record<string, unknown>) =>
    apiRequest<CouponRow>(storePath(storeId, '/coupons'), {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateCoupon: (storeId: string, id: string, body: Record<string, unknown>) =>
    apiRequest<CouponRow>(storePath(storeId, `/coupons/${id}`), {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteCoupon: (storeId: string, id: string) =>
    apiRequest<{ ok: boolean } | CouponRow>(storePath(storeId, `/coupons/${id}`), {
      method: 'DELETE',
    }),
  listReturns: (
    storeId: string,
    params: Record<string, string | number | boolean | undefined | null> = {},
  ) => apiRequest<Paginated<ReturnRow>>(storePath(storeId, `/returns${toQuery(params)}`)),
  approveReturn: (storeId: string, id: string, staffNote?: string) =>
    apiRequest<ReturnRow>(storePath(storeId, `/returns/${id}/approve`), {
      method: 'POST',
      body: JSON.stringify(staffNote ? { staffNote } : {}),
    }),
  rejectReturn: (storeId: string, id: string, staffNote: string) =>
    apiRequest<ReturnRow>(storePath(storeId, `/returns/${id}/reject`), {
      method: 'POST',
      body: JSON.stringify({ staffNote }),
    }),
  markReturnReceived: (storeId: string, id: string) =>
    apiRequest<ReturnRow>(storePath(storeId, `/returns/${id}/receive`), {
      method: 'POST',
    }),
  completeReturnRefund: (
    storeId: string,
    id: string,
    body: { refundAmount: number; refundMethod: string },
  ) =>
    apiRequest<ReturnRow>(storePath(storeId, `/returns/${id}/refund`), {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateCourier: (
    storeId: string,
    orderId: string,
    body: { courierName?: string; courierTrackingId?: string; courierNotes?: string },
  ) =>
    apiRequest<OrderRow>(storePath(storeId, `/orders/${orderId}/courier`), {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  listCustomers: (
    storeId: string,
    params: Record<string, string | number | undefined>,
  ) =>
    apiRequest<Paginated<CustomerRow> | CustomerRow[]>(
      storePath(storeId, `/customers${toQuery(params)}`),
    ),
  pendingPayments: (
    storeId: string,
    params: Record<string, string | number | undefined> = {},
  ) =>
    apiRequest<Paginated<OrderRow> | OrderRow[]>(
      storePath(storeId, `/payments/pending-bkash${toQuery(params)}`),
    ),
  approvePayment: (storeId: string, orderId: string) =>
    apiRequest<OrderRow>(storePath(storeId, '/payments/bkash/approve'), {
      method: 'POST',
      body: JSON.stringify({ orderId, approved: true }),
    }),
  rejectPayment: (storeId: string, orderId: string, note?: string) =>
    apiRequest<OrderRow>(storePath(storeId, '/payments/bkash/reject'), {
      method: 'POST',
      body: JSON.stringify({
        orderId,
        approved: false,
        ...(note ? { rejectionReason: note } : {}),
      }),
    }),
  listMedia: (
    storeId: string,
    params: Record<string, string | number | undefined> = {},
  ) =>
    apiRequest<Paginated<MediaRow> | MediaRow[]>(
      storePath(storeId, `/media${toQuery(params)}`),
    ),
  /** @deprecated use signedUpload + registerMedia (device upload flow) */
  uploadMediaStub: (storeId: string, body: Record<string, unknown>) =>
    apiRequest<MediaRow>(storePath(storeId, '/media'), {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  signedUpload: (
    storeId: string,
    body: { filename: string; mimeType: string; usageType?: string },
  ) =>
    apiRequest<{
      mode: 'stub' | 'cloudinary';
      uploadUrl: string;
      publicId: string;
      fields: Record<string, string>;
      note?: string;
    }>(storePath(storeId, '/media/signed-url'), {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  registerMedia: (
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
    apiRequest<MediaRow>(storePath(storeId, '/media'), {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteMedia: (storeId: string, mediaId: string) =>
    apiRequest<{ ok: boolean }>(storePath(storeId, `/media/${mediaId}`), {
      method: 'DELETE',
    }),
  listCms: (storeId: string) =>
    apiRequest<CmsBlock[] | { data?: CmsBlock[]; items?: CmsBlock[] }>(
      storePath(storeId, '/cms'),
    ),
  saveCms: (storeId: string, blocks: CmsBlock[]) =>
    apiRequest<CmsBlock[]>(storePath(storeId, '/cms/bulk'), {
      method: 'PUT',
      body: JSON.stringify({
        blocks: blocks.map((b, index) => ({
          key: b.key || b.id || `block-${index}`,
          fields: b.fields ?? {
            title: b.title ?? '',
            body: b.body ?? '',
            sortOrder: b.sortOrder ?? index,
          },
        })),
      }),
    }),
  getTheme: (storeId: string) =>
    apiRequest<CurrentThemeResponse>(storePath(storeId, '/theme/current')),
  requestThemeCustomization: (storeId: string, message?: string) =>
    apiRequest<{ id: string }>(storePath(storeId, '/theme/customization-request'), {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
  saveThemeDraft: (
    storeId: string,
    payload: { themeSettings: Record<string, unknown>; layout?: unknown },
  ) =>
    apiRequest<ThemeVersion>(storePath(storeId, '/theme/draft'), {
      method: 'PUT',
      body: JSON.stringify({
        themeSettings: payload.themeSettings,
        layout: payload.layout ?? { sections: [] },
      }),
    }),
  publishTheme: (storeId: string) =>
    apiRequest<ThemeVersion>(storePath(storeId, '/theme/publish'), {
      method: 'POST',
    }),
  themeVersions: (storeId: string) =>
    apiRequest<ThemeVersion[]>(storePath(storeId, '/theme/versions')),
  restoreTheme: (storeId: string, versionId: string) =>
    apiRequest<ThemeVersion>(
      storePath(storeId, `/theme/versions/${versionId}/restore`),
      { method: 'POST' },
    ),
  getSettings: (storeId: string) =>
    apiRequest<Record<string, unknown>>(storePath(storeId, '/settings/business')),
  updateSettings: (storeId: string, body: Record<string, unknown>) =>
    apiRequest<Record<string, unknown>>(storePath(storeId, '/settings/business'), {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  checkDomainAvailability: (storeId: string, label: string) =>
    apiRequest<{ label: string; hostname: string; available: boolean; reason?: 'reserved' | 'taken' }>(
      storePath(storeId, `/domain-requests/check?label=${encodeURIComponent(label)}`),
    ),
  listDomainRequests: (storeId: string) =>
    apiRequest<DomainRequestRow[]>(storePath(storeId, '/domain-requests')),
  requestDomain: (storeId: string, label: string, note?: string) =>
    apiRequest<DomainRequestRow>(storePath(storeId, '/domain-requests'), {
      method: 'POST',
      body: JSON.stringify({ label, note }),
    }),
  getUsage: (storeId: string) => apiRequest<StoreUsage>(storePath(storeId, '/usage')),
  getBilling: (storeId: string) =>
    apiRequest<{ period: BillingPeriod; entries: BillingLedgerEntry[] }>(storePath(storeId, '/billing')),
  getBillingPeriods: (storeId: string, params: { page?: number; limit?: number } = {}) =>
    apiRequest<{ items: BillingPeriod[]; total: number; page: number; limit: number }>(
      storePath(storeId, `/billing/periods${toQuery(params)}`),
    ),
  getPaymentInstructions: (storeId: string) =>
    apiRequest<{
      bkashNumber: string;
      bkashType: string;
      bankName: string;
      bankAccountName: string;
      bankAccountNumber: string;
      bankRoutingNumber: string;
      notes: string;
    }>(storePath(storeId, '/payment-instructions')),
  getCurrentInvoice: (storeId: string) =>
    apiRequest<Invoice | null>(storePath(storeId, '/invoices/current')),
  getInvoices: (storeId: string, params: { page?: number; limit?: number } = {}) =>
    apiRequest<{ items: Invoice[]; total: number; page: number; limit: number }>(
      storePath(storeId, `/invoices${toQuery(params)}`),
    ),
  getInvoiceDetail: (storeId: string, invoiceId: string) =>
    apiRequest<{ invoice: Invoice; payments: MerchantPayment[]; availableCredit: number }>(
      storePath(storeId, `/invoices/${invoiceId}`),
    ),
  getCreditBalance: (storeId: string) =>
    apiRequest<{ balance: number }>(storePath(storeId, '/credit')),
  listMyPayments: (storeId: string) =>
    apiRequest<MerchantPayment[]>(storePath(storeId, '/merchant-payments')),
  submitPaymentClaim: (
    storeId: string,
    body: {
      invoiceId: string;
      method: MerchantPaymentMethod;
      amount: number;
      referenceId: string;
      transferDate: string;
      note?: string;
    },
  ) =>
    apiRequest<MerchantPayment>(storePath(storeId, '/merchant-payments'), {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  cancelPaymentClaim: (storeId: string, paymentId: string) =>
    apiRequest<MerchantPayment>(storePath(storeId, `/merchant-payments/${paymentId}/cancel`), {
      method: 'POST',
    }),
  listStaff: (storeId: string) =>
    apiRequest<StaffRow[] | { data?: StaffRow[]; items?: StaffRow[] }>(
      storePath(storeId, '/staff'),
    ),
  inviteStaff: (
    storeId: string,
    body: { email: string; name: string; role: string },
  ) =>
    apiRequest<StaffRow>(storePath(storeId, '/staff/invite'), {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  listAnnouncements: (storeId: string) =>
    apiRequest<{ items: Array<{ id: string; title: string; body: string; createdAt?: string }> }>(
      storePath(storeId, '/announcements'),
    ),
  listSupportTickets: (storeId: string) =>
    apiRequest<{ items: Array<{ id: string; subject: string; status: string; createdAt?: string }> }>(
      storePath(storeId, '/support-tickets'),
    ),
  createSupportTicket: (
    storeId: string,
    body: { subject: string; body: string; priority?: string },
  ) =>
    apiRequest(storePath(storeId, '/support-tickets'), {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
