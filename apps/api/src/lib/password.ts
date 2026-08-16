import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';

const ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function hashToken(token: string): Promise<string> {
  return bcrypt.hash(token, 10);
}

export async function verifyTokenHash(
  token: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(token, hash);
}

/**
 * Fast, deterministic hash for high-entropy random tokens that must be
 * looked up BY VALUE in the database (e.g. email verification links —
 * `WHERE tokenHash = ?`). Deliberately NOT bcrypt: bcrypt's slowness exists
 * to resist brute-forcing a *small* keyspace (a password, a 6-digit OTP —
 * see hashToken above), which a 256-bit random token doesn't have — its
 * security comes from the keyspace itself (2^256), which a fast hash
 * doesn't weaken, and bcrypt can't be looked up by value at all (each
 * comparison needs its own salt), only compared 1-to-1 against a token
 * you already know the identity of.
 */
export function hashLookupToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
