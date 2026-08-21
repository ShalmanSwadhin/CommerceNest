import { ShipmentStatus } from '@commercenest/types';
import { logger } from '../../lib/logger.js';
import type {
  CourierCreateShipmentInput,
  CourierCreateShipmentResult,
  CourierCredentialField,
  CourierCredentials,
  CourierProvider,
  CourierTestConnectionResult,
  CourierTrackResult,
  CourierWebhookEvent,
} from './types.js';
import { CourierDeliveryError, CourierUnsupportedOperationError } from './types.js';

/**
 * Steadfast Courier (steadfast.com.bd) — API base https://portal.packzy.com/api/v1.
 * Auth: `Api-Key` / `Secret-Key` headers, issued from the merchant's own
 * Steadfast dashboard (Settings → API Support). Chosen as CommerceNest's
 * first courier integration over Pathao/RedX specifically because this
 * auth scheme has no OAuth token-refresh dance and no multi-day merchant
 * approval process before credentials are even issued — see
 * COURIER_ARCHITECTURE.md for the full comparison.
 *
 * Reference: publicly documented status vocabulary is exactly
 * `pending | delivered_approval_pending | partial_delivered_approval_pending |
 *  cancelled_approval_pending | unknown_approval_pending | delivered |
 *  partial_delivered | cancelled | hold | in_review | unknown` — mapped to
 * CommerceNest's normalized ShipmentStatus below. Steadfast's public API
 * has no merchant-facing "cancel consignment" endpoint (cancellation is a
 * dashboard/support action on their side), hence supportsCancel is false.
 */
const BASE_URL = 'https://portal.packzy.com/api/v1';

function mapStatus(raw: string): ShipmentStatus {
  const s = raw.toLowerCase();
  if (s === 'pending') return ShipmentStatus.CREATED;
  if (s === 'in_review') return ShipmentStatus.IN_REVIEW;
  if (s === 'hold') return ShipmentStatus.ON_HOLD;
  if (s === 'delivered' || s === 'delivered_approval_pending') return ShipmentStatus.DELIVERED;
  if (s === 'partial_delivered' || s === 'partial_delivered_approval_pending') {
    return ShipmentStatus.PARTIAL_DELIVERED;
  }
  if (s === 'cancelled' || s === 'cancelled_approval_pending') return ShipmentStatus.CANCELLED;
  return ShipmentStatus.FAILED; // unknown / unknown_approval_pending / anything unrecognized
}

async function steadfastFetch(
  credentials: CourierCredentials,
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown },
): Promise<unknown> {
  const apiKey = credentials.apiKey;
  const secretKey = credentials.secretKey;
  if (!apiKey || !secretKey) {
    throw new CourierDeliveryError('Steadfast credentials are incomplete (apiKey/secretKey required)');
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: init.method,
      headers: {
        'Api-Key': apiKey,
        'Secret-Key': secretKey,
        'Content-Type': 'application/json',
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
  } catch (err) {
    throw new CourierDeliveryError('Steadfast API request failed (network error)', err);
  }

  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    // Never log the raw body — could contain account-identifying info.
    logger.error({ channel: 'courier', provider: 'STEADFAST', status: res.status, path }, 'Steadfast returned a non-JSON response');
    throw new CourierDeliveryError(`Steadfast API returned a non-JSON response (HTTP ${res.status})`);
  }

  if (!res.ok) {
    const message =
      typeof json === 'object' && json !== null && 'message' in json && typeof (json as { message?: unknown }).message === 'string'
        ? (json as { message: string }).message
        : `HTTP ${res.status}`;
    logger.error({ channel: 'courier', provider: 'STEADFAST', status: res.status, path }, 'Steadfast API rejected the request');
    throw new CourierDeliveryError(`Steadfast API error: ${message}`);
  }

  return json;
}

const CREDENTIAL_FIELDS: CourierCredentialField[] = [
  { key: 'apiKey', label: 'API Key', secret: false },
  { key: 'secretKey', label: 'Secret Key', secret: true },
  // Optional — only needed if the merchant has configured a webhook URL on
  // their Steadfast dashboard. Without it, status updates still arrive via
  // the polling "Sync status" action; the webhook is the faster path when
  // available, not the only path.
  { key: 'webhookToken', label: 'Webhook Bearer Token (optional)', secret: true, optional: true },
];

export const steadfastProvider: CourierProvider = {
  id: 'STEADFAST',
  label: 'Steadfast Courier',
  credentialFields: CREDENTIAL_FIELDS,
  supportsCancel: false,

  async createShipment(
    credentials: CourierCredentials,
    input: CourierCreateShipmentInput,
  ): Promise<CourierCreateShipmentResult> {
    const json = (await steadfastFetch(credentials, '/create_order', {
      method: 'POST',
      body: {
        invoice: input.invoice,
        recipient_name: input.recipientName,
        recipient_phone: input.recipientPhone,
        recipient_address: input.recipientAddress,
        cod_amount: input.codAmount,
        note: input.note,
      },
    })) as {
      consignment?: { consignment_id: number | string; tracking_code: string; status: string };
      message?: string;
    };

    const consignment = json.consignment;
    if (!consignment) {
      throw new CourierDeliveryError(
        `Steadfast did not return a consignment: ${json.message ?? 'unknown error'}`,
      );
    }

    const rawStatus = consignment.status ?? 'pending';
    return {
      consignmentId: String(consignment.consignment_id),
      trackingCode: consignment.tracking_code,
      status: mapStatus(rawStatus),
      rawStatus,
      raw: json,
    };
  },

  async trackShipment(credentials, ref): Promise<CourierTrackResult> {
    let path: string;
    if (ref.consignmentId) path = `/status_by_cid/${encodeURIComponent(ref.consignmentId)}`;
    else if (ref.trackingCode) path = `/status_by_trackingcode/${encodeURIComponent(ref.trackingCode)}`;
    else if (ref.invoice) path = `/status_by_invoice/${encodeURIComponent(ref.invoice)}`;
    else throw new CourierDeliveryError('trackShipment requires a consignmentId, trackingCode, or invoice');

    const json = (await steadfastFetch(credentials, path, { method: 'GET' })) as {
      delivery_status?: string;
    };
    const rawStatus = json.delivery_status ?? 'unknown';
    return { status: mapStatus(rawStatus), rawStatus, raw: json };
  },

  async cancelShipment(): Promise<{ cancelled: boolean; raw: unknown }> {
    throw new CourierUnsupportedOperationError(
      'Steadfast does not expose a merchant-facing cancel-consignment API endpoint — cancel it from the Steadfast dashboard or by contacting their support.',
    );
  },

  verifyWebhook(credentials: CourierCredentials, headers: Record<string, string | undefined>): boolean {
    const configuredToken = credentials.webhookToken;
    if (!configuredToken) {
      // No webhook token was configured for this account — nothing to
      // verify against. The webhook URL's storeId+provider segments are
      // the only scoping available in that case; documented as a real
      // limitation, not silently treated as "verified".
      return true;
    }
    const header = headers.authorization ?? headers.Authorization;
    const provided = header?.replace(/^Bearer\s+/i, '').trim();
    return provided === configuredToken;
  },

  /**
   * Steadfast's public documentation does not specify an exact webhook
   * payload schema (unlike create_order/status_by_* which are well
   * documented) — this parses the field names their status-check
   * responses already use (`consignment_id`, `tracking_code`,
   * `delivery_status`), on the reasonable assumption a webhook reports the
   * same shape. Verify against the real payload once a merchant has a
   * live webhook configured; until then, polling via "Sync status" is the
   * proven path — see COURIER_ARCHITECTURE.md.
   */
  parseWebhookPayload(body: unknown): CourierWebhookEvent | null {
    if (typeof body !== 'object' || body === null) return null;
    const payload = body as Record<string, unknown>;
    const consignmentId =
      payload.consignment_id !== undefined ? String(payload.consignment_id) : undefined;
    const trackingCode = typeof payload.tracking_code === 'string' ? payload.tracking_code : undefined;
    const rawStatus =
      typeof payload.delivery_status === 'string'
        ? payload.delivery_status
        : typeof payload.status === 'string'
          ? payload.status
          : undefined;

    if (!rawStatus || (!consignmentId && !trackingCode)) return null;
    return { ref: { consignmentId, trackingCode }, status: mapStatus(rawStatus), rawStatus };
  },

  async testConnection(credentials: CourierCredentials): Promise<CourierTestConnectionResult> {
    try {
      const json = (await steadfastFetch(credentials, '/get_balance', { method: 'GET' })) as {
        current_balance?: number;
      };
      return {
        ok: true,
        message:
          json.current_balance !== undefined
            ? `Connected — current balance ৳${json.current_balance}`
            : 'Connected',
      };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'Connection failed',
      };
    }
  },
};
