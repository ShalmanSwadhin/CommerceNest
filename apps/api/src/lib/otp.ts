import { kvDel, kvGet, kvSet } from './redis.js';
import { hashToken, verifyTokenHash } from './password.js';
import {
  sendSms,
  SmsDeliveryError,
  SmsProviderUnconfiguredError,
} from './sms.js';
import { AppError } from './errors.js';

/**
 * Shared OTP core — generate/hash/store/send and later consume a 6-digit
 * code under an arbitrary kv key namespace. Used by BOTH the public
 * storefront customer login flow (services/storefront.service.ts) and the
 * authenticated merchant/customer phone-verification flow
 * (services/verification.service.ts#sendPhoneVerificationOtp). The only
 * thing that differs between those two callers is what happens after a
 * successful verify (issue a new session vs. flip a `phoneVerified` flag)
 * — that decision belongs to the caller, not this module.
 *
 * Security parameters — see SECURITY.md "OTP".
 */
export const OTP_TTL_SECONDS = 5 * 60;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;

interface StoredOtp {
  /** bcrypt hash — never the plaintext code. */
  hash: string;
  attempts: number;
  /** Authoritative expiry, checked explicitly — not just the kv entry's own
   * TTL, which a failed-attempt re-write would otherwise reset. */
  expiresAt: number;
}

export { SmsDeliveryError, SmsProviderUnconfiguredError };

/**
 * Generates a code, hashes it, stores it under `key`, and sends it via the
 * SMS provider boundary. Throws AppError (429 on active cooldown, 503 if
 * the SMS genuinely couldn't be delivered) rather than returning a falsely
 * successful result.
 */
export async function createAndSendOtp(params: {
  key: string;
  cooldownKey: string;
  phone: string;
  messageFor: (code: string) => string;
}): Promise<{ code: string }> {
  if (await kvGet(params.cooldownKey)) {
    throw AppError.rateLimited(
      'Please wait a moment before requesting another code',
    );
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const stored: StoredOtp = {
    hash: await hashToken(code),
    attempts: 0,
    expiresAt: Date.now() + OTP_TTL_SECONDS * 1000,
  };
  await kvSet(params.key, JSON.stringify(stored), OTP_TTL_SECONDS + 60);

  try {
    await sendSms({
      to: params.phone,
      body: params.messageFor(code),
      templateKey: 'otp.request',
    });
  } catch (err) {
    // Nothing was delivered — the stored code is unreachable, no reason to
    // keep it (or its attempt budget) around.
    await kvDel(params.key);
    if (
      err instanceof SmsProviderUnconfiguredError ||
      err instanceof SmsDeliveryError
    ) {
      throw AppError.serviceUnavailable(
        'We could not send the verification code right now. Please try again shortly.',
      );
    }
    throw err;
  }

  await kvSet(params.cooldownKey, '1', OTP_RESEND_COOLDOWN_SECONDS);
  return { code };
}

export type OtpConsumeResult =
  | { ok: true }
  | { ok: false; reason: 'invalid-or-expired' | 'too-many-attempts' };

/** Verifies `code` against whatever is stored under `key`. Single-use: the
 * entry is deleted on success, so replaying the same correct code fails
 * exactly like an expired one. */
export async function consumeOtp(
  key: string,
  code: string,
): Promise<OtpConsumeResult> {
  const raw = await kvGet(key);
  if (!raw) return { ok: false, reason: 'invalid-or-expired' };

  let stored: StoredOtp;
  try {
    stored = JSON.parse(raw) as StoredOtp;
  } catch {
    await kvDel(key);
    return { ok: false, reason: 'invalid-or-expired' };
  }

  if (Date.now() > stored.expiresAt || stored.attempts >= OTP_MAX_ATTEMPTS) {
    await kvDel(key);
    return {
      ok: false,
      reason:
        stored.attempts >= OTP_MAX_ATTEMPTS
          ? 'too-many-attempts'
          : 'invalid-or-expired',
    };
  }

  const isMatch = await verifyTokenHash(code, stored.hash);
  if (!isMatch) {
    const attempts = stored.attempts + 1;
    if (attempts >= OTP_MAX_ATTEMPTS) {
      await kvDel(key);
      return { ok: false, reason: 'too-many-attempts' };
    }
    const remainingTtl = Math.max(
      1,
      Math.ceil((stored.expiresAt - Date.now()) / 1000),
    );
    await kvSet(
      key,
      JSON.stringify({ ...stored, attempts }),
      remainingTtl + 60,
    );
    return { ok: false, reason: 'invalid-or-expired' };
  }

  await kvDel(key);
  return { ok: true };
}

/** The one customer-safe message for both invalid and expired — matches
 * the existing storefront OTP behavior (deliberately not distinguishing
 * "wrong code" from "expired", which would hand an attacker extra signal). */
export function otpConsumeErrorMessage(
  reason: 'invalid-or-expired' | 'too-many-attempts',
): string {
  return reason === 'too-many-attempts'
    ? 'Too many incorrect attempts. Please request a new code.'
    : 'Invalid or expired OTP';
}
