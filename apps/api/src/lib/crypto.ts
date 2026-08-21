import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { env } from './env.js';

/**
 * Encryption-at-rest for per-store secrets that must be DECRYPTED later to
 * make a real outbound API call on the merchant's behalf (courier API
 * keys — the first thing in this codebase that needs this; everything
 * else sensitive so far is a password/token, which only ever needs
 * one-way hashing via lib/password.ts, never decryption). AES-256-GCM:
 * authenticated encryption, so a tampered ciphertext fails to decrypt
 * instead of silently returning garbage credentials.
 *
 * CREDENTIALS_ENCRYPTION_KEY is a separate secret from the JWT secrets —
 * rotating one should never force-invalidate the other. scrypt derives a
 * fixed-length key from whatever string length the env var happens to be,
 * the same way bcrypt in lib/password.ts hides raw-secret-length concerns
 * from the rest of the app.
 */
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function deriveKey(): Buffer {
  return scryptSync(env.CREDENTIALS_ENCRYPTION_KEY, 'commercenest-credentials', 32);
}

export interface EncryptedPayload {
  iv: string;
  ciphertext: string;
  authTag: string;
}

/** Encrypts a plain object (e.g. `{ apiKey, secretKey }`) into a JSON-safe
 * shape suitable for storing directly in a Prisma `Json` column. */
export function encryptJson(value: unknown): EncryptedPayload {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, deriveKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

/** Inverse of encryptJson. Throws if the ciphertext was tampered with or
 * the key is wrong — callers must not swallow this into "credentials
 * missing", since that would mask a real integrity failure as a
 * configuration gap. */
export function decryptJson<T = unknown>(payload: EncryptedPayload): T {
  const decipher = createDecipheriv(ALGORITHM, deriveKey(), Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString('utf8')) as T;
}
