import type { ShipmentStatus } from '@commercenest/types';

/**
 * CourierProvider boundary — every courier-specific API detail (auth
 * scheme, endpoint paths, request/response shapes, status vocabulary)
 * stays inside one adapter file implementing this interface. Nothing
 * outside services/courier/ ever imports a provider file directly; callers
 * go through courier.service.ts, which looks up the right adapter by
 * `CourierAccount.provider`. Adding a second courier later means writing
 * one new adapter + registering it — no changes anywhere else. Mirrors
 * lib/sms.ts's SmsProvider boundary, the same shape of problem.
 */

/** Flat string key-value credentials — realistic for every courier (an API
 * key, a secret key, sometimes a bearer/webhook token). Encrypted at rest
 * via lib/crypto.ts; only ever decrypted inside courier.service.ts, never
 * returned to any client. */
export type CourierCredentials = Record<string, string>;

export interface CourierCreateShipmentInput {
  /** Our order number — the courier's "invoice" field, so their dashboard
   * and ours reference the same identifier. */
  invoice: string;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  /** 0 for a prepaid (non-COD) order. */
  codAmount: number;
  note?: string;
}

export interface CourierCreateShipmentResult {
  consignmentId: string;
  trackingCode: string;
  status: ShipmentStatus;
  rawStatus: string;
  /** The provider's full response body — stored on Shipment.courierResponse
   * for audit/debugging, never exposed to the storefront. */
  raw: unknown;
}

export interface CourierTrackResult {
  status: ShipmentStatus;
  rawStatus: string;
  raw: unknown;
}

export interface CourierTestConnectionResult {
  ok: boolean;
  message: string;
}

/** What the Store Admin credentials form should collect for this
 * provider — lets the frontend render a generic form instead of
 * hardcoding field names per courier. */
export interface CourierCredentialField {
  key: string;
  label: string;
  secret: boolean;
  optional?: boolean;
}

export interface CourierProvider {
  readonly id: string;
  readonly label: string;
  readonly credentialFields: CourierCredentialField[];
  /** True only if this adapter can actually cancel a live consignment via
   * the provider's API — see steadfast.provider.ts for why this is false
   * there. The UI only offers a "Cancel shipment" action when this is
   * true, rather than wiring a button that would always fail. */
  readonly supportsCancel: boolean;

  createShipment(
    credentials: CourierCredentials,
    input: CourierCreateShipmentInput,
  ): Promise<CourierCreateShipmentResult>;

  trackShipment(
    credentials: CourierCredentials,
    ref: { consignmentId?: string; trackingCode?: string; invoice?: string },
  ): Promise<CourierTrackResult>;

  cancelShipment(
    credentials: CourierCredentials,
    ref: { consignmentId: string },
  ): Promise<{ cancelled: boolean; raw: unknown }>;

  testConnection(credentials: CourierCredentials): Promise<CourierTestConnectionResult>;

  /** True if this provider's webhook request is authentic. Takes only
   * headers (not the raw body) because Steadfast's scheme is a plain
   * Authorization bearer-token comparison; a provider needing HMAC-of-body
   * signing would need additional route-level raw-body plumbing not built
   * yet — noted as a real limitation, not silently faked. Returns true
   * when the account has no webhook secret configured (can't verify what
   * wasn't given a secret to verify against) — the storeId+provider pair
   * in the webhook URL is what scopes the request in that case. */
  verifyWebhook(credentials: CourierCredentials, headers: Record<string, string | undefined>): boolean;

  /** Parses a webhook payload into a shipment reference + normalized
   * status, or null if the payload doesn't look like a delivery-status
   * update this provider recognizes (unrecognized payloads are logged and
   * ignored by the caller, never thrown as an error — a webhook endpoint
   * must always return 200 to a legitimate-but-unexpected payload so the
   * courier doesn't disable/retry the webhook). */
  parseWebhookPayload(body: unknown): CourierWebhookEvent | null;
}

export interface CourierWebhookEvent {
  ref: { consignmentId?: string; trackingCode?: string };
  status: ShipmentStatus;
  rawStatus: string;
}

/** The courier's real API call failed (network error, non-2xx response, a
 * response shape we don't recognize). Distinct from
 * CourierNotConfiguredError so callers — and tests — can tell "we tried
 * and it failed" apart from "nothing to try yet". */
export class CourierDeliveryError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'CourierDeliveryError';
  }
}

/** No enabled courier account exists for this store (or credentials
 * failed to decrypt). */
export class CourierNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CourierNotConfiguredError';
  }
}

/** The requested operation isn't supported by this provider's public API
 * (e.g. Steadfast has no merchant-facing cancel endpoint) — thrown rather
 * than faking success, per supportsCancel above. */
export class CourierUnsupportedOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CourierUnsupportedOperationError';
  }
}
