import { describe, expect, it } from 'vitest';
import { ShipmentStatus } from '@commercenest/types';
import { steadfastProvider } from './steadfast.provider.js';

describe('Steadfast provider — webhook verification (no network involved)', () => {
  it('accepts a matching bearer token', () => {
    const ok = steadfastProvider.verifyWebhook(
      { apiKey: 'x', secretKey: 'y', webhookToken: 'real-token' },
      { authorization: 'Bearer real-token' },
    );
    expect(ok).toBe(true);
  });

  it('rejects a mismatched bearer token', () => {
    const ok = steadfastProvider.verifyWebhook(
      { apiKey: 'x', secretKey: 'y', webhookToken: 'real-token' },
      { authorization: 'Bearer wrong-token' },
    );
    expect(ok).toBe(false);
  });

  it('rejects a missing Authorization header when a token is configured', () => {
    const ok = steadfastProvider.verifyWebhook(
      { apiKey: 'x', secretKey: 'y', webhookToken: 'real-token' },
      {},
    );
    expect(ok).toBe(false);
  });

  it('cannot verify (so allows through) when no webhook token was configured at all', () => {
    // Documented limitation, not a silent bypass: the storeId+provider pair
    // in the webhook URL is the only scoping available in that case.
    const ok = steadfastProvider.verifyWebhook({ apiKey: 'x', secretKey: 'y' }, {});
    expect(ok).toBe(true);
  });
});

describe('Steadfast provider — webhook payload parsing (no network involved)', () => {
  it('maps every documented delivery_status value to a normalized ShipmentStatus', () => {
    const cases: Array<[string, ShipmentStatus]> = [
      ['pending', ShipmentStatus.CREATED],
      ['in_review', ShipmentStatus.IN_REVIEW],
      ['hold', ShipmentStatus.ON_HOLD],
      ['delivered', ShipmentStatus.DELIVERED],
      ['delivered_approval_pending', ShipmentStatus.DELIVERED],
      ['partial_delivered', ShipmentStatus.PARTIAL_DELIVERED],
      ['partial_delivered_approval_pending', ShipmentStatus.PARTIAL_DELIVERED],
      ['cancelled', ShipmentStatus.CANCELLED],
      ['cancelled_approval_pending', ShipmentStatus.CANCELLED],
      ['unknown', ShipmentStatus.FAILED],
      ['unknown_approval_pending', ShipmentStatus.FAILED],
      ['some_future_status_steadfast_might_add', ShipmentStatus.FAILED],
    ];
    for (const [rawStatus, expected] of cases) {
      const event = steadfastProvider.parseWebhookPayload({
        consignment_id: 123,
        delivery_status: rawStatus,
      });
      expect(event, `raw status "${rawStatus}"`).not.toBeNull();
      expect(event!.status).toBe(expected);
      expect(event!.rawStatus).toBe(rawStatus);
    }
  });

  it('returns null when the payload has no recognizable status field', () => {
    expect(steadfastProvider.parseWebhookPayload({ consignment_id: 123 })).toBeNull();
  });

  it('returns null when the payload has a status but no shipment reference', () => {
    expect(steadfastProvider.parseWebhookPayload({ delivery_status: 'delivered' })).toBeNull();
  });

  it('returns null for a non-object payload', () => {
    expect(steadfastProvider.parseWebhookPayload('not an object')).toBeNull();
    expect(steadfastProvider.parseWebhookPayload(null)).toBeNull();
  });

  it('accepts a tracking_code as the shipment reference when consignment_id is absent', () => {
    const event = steadfastProvider.parseWebhookPayload({
      tracking_code: 'ABC123',
      delivery_status: 'delivered',
    });
    expect(event?.ref).toEqual({ consignmentId: undefined, trackingCode: 'ABC123' });
  });
});

describe('Steadfast provider — capabilities', () => {
  it('does not claim to support cancellation (no such endpoint exists in the public API)', () => {
    expect(steadfastProvider.supportsCancel).toBe(false);
  });

  it('cancelShipment throws a clear unsupported-operation error rather than faking success', async () => {
    await expect(
      steadfastProvider.cancelShipment({ apiKey: 'x', secretKey: 'y' }, { consignmentId: '1' }),
    ).rejects.toThrow(/does not expose a merchant-facing cancel/i);
  });
});
