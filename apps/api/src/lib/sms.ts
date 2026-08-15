import { env, hasSmsProvider } from './env.js';
import { logger } from './logger.js';
import { BANGLADESH_PHONE_REGEX } from '@commercenest/types';

/**
 * Thrown when an SMS genuinely could not be delivered — a caller-visible
 * failure, unlike `sendEmail()`'s "log and swallow" approach. OTP delivery
 * IS the deliverable of the request, not a best-effort side notification:
 * if nothing was sent, the customer has no way to ever receive their code,
 * so the failure must propagate instead of being silently absorbed.
 */
export class SmsDeliveryError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'SmsDeliveryError';
  }
}

/**
 * Thrown specifically when running in production with no real provider
 * configured. Kept distinct from SmsDeliveryError (a real send that failed)
 * so callers — and tests — can tell "never even tried, refused on purpose"
 * apart from "tried a real provider and it errored".
 */
export class SmsProviderUnconfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SmsProviderUnconfiguredError';
  }
}

export type SmsMode = 'stub' | 'real' | 'unconfigured-production';

/**
 * Pure decision function, deliberately independent of the module-level
 * `env` singleton so it's unit-testable with arbitrary input combinations
 * without mutating global process state mid-test-run.
 *
 * - development/test with no real provider → 'stub' (local-only, safe)
 * - any environment with a fully-configured real provider → 'real'
 * - production with no real provider → 'unconfigured-production' (refuse)
 */
export function resolveSmsMode(opts: {
  nodeEnv: string;
  providerConfigured: boolean;
}): SmsMode {
  if (opts.providerConfigured) return 'real';
  if (opts.nodeEnv === 'production') return 'unconfigured-production';
  return 'stub';
}

/**
 * Local-format (01XXXXXXXXX) is CommerceNest's canonical storage/validation
 * format everywhere (Customer.phone, order forms, bKash sender phone — see
 * BANGLADESH_PHONE_REGEX). This converts to E.164 (+8801XXXXXXXXX) only at
 * the SMS-provider boundary, where it's actually required — normalizing the
 * whole data model instead would be a much larger, riskier change with no
 * benefit, and nothing else in the app expects +880-prefixed phone strings.
 */
export function toE164Bangladesh(localPhone: string): string {
  if (!BANGLADESH_PHONE_REGEX.test(localPhone)) {
    throw new Error(`Cannot normalize non-Bangladesh phone number: ${localPhone}`);
  }
  return `+880${localPhone.slice(1)}`;
}

/** What the local-stub provider "sent", captured for dev visibility and
 * test assertions. Never populated by the real provider path. */
interface StubMessage {
  to: string;
  body: string;
  templateKey: string;
  sentAt: number;
}
const stubOutbox = new Map<string, StubMessage>();

/** Test/dev helper — inspect the last message the stub "sent" to a phone
 * number. Returns undefined if nothing was sent (or a real provider is
 * configured, since the stub path never runs in that case). */
export function getLastStubMessage(to: string): StubMessage | undefined {
  return stubOutbox.get(to);
}

/** Test-only: clear captured stub messages between test cases. */
export function clearStubOutbox(): void {
  stubOutbox.clear();
}

async function sendViaTwilio(params: {
  to: string;
  body: string;
}): Promise<{ providerId: string }> {
  const accountSid = env.SMS_PROVIDER_API_KEY;
  const authToken = env.SMS_PROVIDER_API_SECRET;
  const from = env.SMS_PROVIDER_SENDER_ID;
  const to = toE164Bangladesh(params.to);

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const body = new URLSearchParams({ To: to, From: from, Body: params.body });
  const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
  } catch (err) {
    throw new SmsDeliveryError('SMS provider request failed (network error)', err);
  }

  if (!res.ok) {
    // Twilio's error body can contain account-identifying info — log
    // status/code only, never the raw response body, and never the
    // message text (which is the OTP for this caller).
    let providerErrorCode: unknown;
    try {
      const errJson = (await res.json()) as { code?: unknown; message?: unknown };
      providerErrorCode = errJson.code;
    } catch {
      /* body wasn't JSON — nothing more to safely extract */
    }
    logger.error(
      { channel: 'sms', provider: 'twilio', status: res.status, providerErrorCode },
      'SMS provider rejected the message',
    );
    throw new SmsDeliveryError(`SMS provider responded with HTTP ${res.status}`);
  }

  const json = (await res.json()) as { sid?: string };
  return { providerId: json.sid ?? 'unknown' };
}

export interface SendSmsResult {
  sent: boolean;
  provider: 'local-stub' | 'twilio';
  providerId?: string;
}

/**
 * SmsProvider boundary. Every OTP/SMS call in the app should go through
 * this single function — provider specifics (Twilio's auth scheme, request
 * shape, error format) stay inside this file. Swapping providers later means
 * adding another branch here, not touching any caller.
 *
 * Throws SmsProviderUnconfiguredError or SmsDeliveryError on failure —
 * callers that need SMS to actually reach the customer (OTP) must handle
 * these and fail the request; this deliberately does NOT swallow errors the
 * way sendEmail() does, since a dropped OTP SMS has no fallback delivery
 * path the way a dropped notification email does.
 */
export async function sendSms(params: {
  to: string;
  body: string;
  templateKey: string;
}): Promise<SendSmsResult> {
  const mode = resolveSmsMode({
    nodeEnv: env.NODE_ENV,
    providerConfigured: hasSmsProvider,
  });

  if (mode === 'unconfigured-production') {
    throw new SmsProviderUnconfiguredError(
      'No real SMS provider is configured in production — refusing to silently use the local stub',
    );
  }

  if (mode === 'stub') {
    stubOutbox.set(params.to, {
      to: params.to,
      body: params.body,
      templateKey: params.templateKey,
      sentAt: Date.now(),
    });
    // Local-stub only — intentionally includes the message body for
    // developer visibility (mirrors the existing devCode response field).
    // This branch never runs in production (see mode check above).
    logger.info(
      { channel: 'sms', provider: 'local-stub', to: params.to, templateKey: params.templateKey, body: params.body },
      'SMS (local stub — no real provider configured)',
    );
    return { sent: false, provider: 'local-stub' };
  }

  // mode === 'real'
  if (env.SMS_PROVIDER === 'twilio') {
    const { providerId } = await sendViaTwilio({ to: params.to, body: params.body });
    logger.info(
      { channel: 'sms', provider: 'twilio', to: params.to, templateKey: params.templateKey, providerId },
      'SMS sent',
    );
    return { sent: true, provider: 'twilio', providerId };
  }

  // hasSmsProvider guarantees SMS_PROVIDER === 'twilio' today; this branch
  // only becomes reachable once a second real adapter is added below without
  // updating hasSmsProvider's check to match — a configuration bug, not a
  // customer-facing runtime state, so it fails loudly rather than silently
  // falling back to the stub.
  throw new SmsProviderUnconfiguredError(`Unsupported SMS_PROVIDER: ${env.SMS_PROVIDER}`);
}
