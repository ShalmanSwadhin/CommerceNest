import { randomBytes } from 'node:crypto';
import {
  ApiErrorCode,
  BANGLADESH_PHONE_REGEX,
  EmailVerificationSubject,
} from '@commercenest/types';
import { prisma, isUniqueConstraintError } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { hashLookupToken } from '../lib/password.js';
import { sendEmail } from '../lib/email.js';
import { kvGet, kvSet } from '../lib/redis.js';
import { env, hasSmtp } from '../lib/env.js';
import { createAndSendOtp, consumeOtp, otpConsumeErrorMessage } from '../lib/otp.js';

const TOKEN_TTL_HOURS = 24;
const RESEND_COOLDOWN_SECONDS = 60;

type Subject = 'USER' | 'CUSTOMER';

/**
 * Sends (or, in dev/test, logs) an email verification link. The caller is
 * always already-authenticated as the subject being verified (a logged-in
 * merchant or a logged-in customer verifying their own address) — this is
 * never a public "enter any email" endpoint, so there's no account
 * enumeration surface to protect against here (unlike password reset).
 *
 * Mirrors lib/sms.ts's OTP philosophy: development/test always succeeds via
 * a safe local stub (sendEmail()'s existing log-only fallback); production
 * refuses outright (503) instead of silently pretending an email went out
 * when no real SMTP provider is configured.
 */
export async function sendEmailVerification(params: {
  subjectType: Subject;
  subjectId: string;
  email: string;
  name: string;
  /** Fully-formed origin + path, e.g. "http://techworld-bd.localhost:8080/verify-email"
   * or "http://app.localhost:8080/verify-email" — the caller knows which
   * frontend app the recipient should land back on; this service just
   * appends "?token=...". */
  verifyUrlBase: string;
}) {
  if (!hasSmtp && env.NODE_ENV === 'production') {
    throw AppError.serviceUnavailable(
      'Email delivery is not available right now. Please try again later.',
      ApiErrorCode.EMAIL_UNAVAILABLE,
    );
  }

  const cooldownKey = `emailverify:cooldown:${params.subjectType}:${params.subjectId}`;
  if (await kvGet(cooldownKey)) {
    throw AppError.rateLimited(
      'Please wait a moment before requesting another verification email',
    );
  }

  // A fresh request supersedes any earlier unused link for this subject —
  // only the newest one should ever work.
  await prisma.emailVerificationToken.deleteMany({
    where: {
      subjectType: params.subjectType,
      subjectId: params.subjectId,
      usedAt: null,
    },
  });

  const token = randomBytes(32).toString('hex');
  await prisma.emailVerificationToken.create({
    data: {
      tokenHash: hashLookupToken(token),
      subjectType: params.subjectType,
      subjectId: params.subjectId,
      email: params.email,
      expiresAt: new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000),
    },
  });

  const link = `${params.verifyUrlBase}?token=${token}`;

  await sendEmail({
    to: params.email,
    subject: 'Verify your email — CommerceNest',
    body:
      `Hi ${params.name},\n\n` +
      `Verify your email address by opening the link below. It expires in 24 hours.\n\n` +
      `${link}\n\n` +
      `If you didn't request this, you can safely ignore this email.`,
    templateKey: 'email-verification',
  });

  await kvSet(cooldownKey, '1', RESEND_COOLDOWN_SECONDS);

  return {
    ok: true,
    message: 'Verification email sent',
    ...(env.NODE_ENV === 'development' || env.NODE_ENV === 'test'
      ? { devToken: token, devLink: link }
      : {}),
  };
}

export async function confirmEmailVerification(
  subjectType: Subject,
  rawToken: string,
) {
  const record = await prisma.emailVerificationToken.findFirst({
    where: {
      subjectType,
      tokenHash: hashLookupToken(rawToken),
      usedAt: null,
    },
  });

  if (!record) {
    throw AppError.badRequest(
      'This verification link is invalid or has already been used.',
      { code: 'TOKEN_INVALID' },
    );
  }
  if (record.expiresAt.getTime() < Date.now()) {
    throw AppError.badRequest(
      'This verification link has expired. Please request a new one.',
      { code: 'TOKEN_EXPIRED' },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.emailVerificationToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });
    if (subjectType === EmailVerificationSubject.USER) {
      await tx.user.update({
        where: { id: record.subjectId },
        data: { emailVerified: true },
      });
    } else {
      await tx.customer.update({
        where: { id: record.subjectId },
        data: { emailVerified: true },
      });
    }
  });

  return { ok: true, subjectType };
}

// ---------------------------------------------------------------------------
// Phone verification — an authenticated add-on, reusing lib/otp.ts's exact
// same generate/hash/store/send/consume core (5-min expiry, 5-attempt
// limit, 60s cooldown, single-use, real SMS provider boundary) that the
// public storefront OTP-login flow uses. NOT a second OTP implementation —
// only the kv key namespace and the "what happens on success" differ.
// ---------------------------------------------------------------------------

function phoneVerifyKeys(subjectType: Subject, subjectId: string) {
  return {
    key: `otp:phoneverify:${subjectType}:${subjectId}`,
    cooldownKey: `otp:phoneverify:cooldown:${subjectType}:${subjectId}`,
  };
}

export async function sendPhoneVerificationOtp(
  subjectType: Subject,
  subjectId: string,
  phone: string,
) {
  if (!BANGLADESH_PHONE_REGEX.test(phone)) {
    throw AppError.badRequest('Invalid Bangladesh phone number');
  }

  const { code } = await createAndSendOtp({
    ...phoneVerifyKeys(subjectType, subjectId),
    phone,
    messageFor: (c) =>
      `Your CommerceNest phone verification code is ${c}. It expires in 5 minutes. Do not share this code.`,
  });

  return {
    ok: true,
    message: 'Verification code sent',
    ...(env.NODE_ENV === 'development' || env.NODE_ENV === 'test'
      ? { devCode: code }
      : {}),
  };
}

/** On success, sets phone = the just-verified number (covers both
 * "verify my existing phone" and "add and verify a new phone" in one
 * path) and flips phoneVerified. */
export async function confirmPhoneVerificationOtp(
  subjectType: Subject,
  subjectId: string,
  phone: string,
  code: string,
) {
  const { key } = phoneVerifyKeys(subjectType, subjectId);
  const result = await consumeOtp(key, code);
  if (!result.ok) {
    throw AppError.unauthorized(otpConsumeErrorMessage(result.reason));
  }

  try {
    if (subjectType === EmailVerificationSubject.USER) {
      await prisma.user.update({
        where: { id: subjectId },
        data: { phone, phoneVerified: true },
      });
    } else {
      await prisma.customer.update({
        where: { id: subjectId },
        data: { phone, phoneVerified: true },
      });
    }
  } catch (err) {
    // Customer.phone is unique per store — someone else may have claimed
    // this number between sending the code and confirming it.
    if (isUniqueConstraintError(err)) {
      throw AppError.conflict(
        'This phone number is already associated with another account.',
      );
    }
    throw err;
  }

  return { ok: true };
}
