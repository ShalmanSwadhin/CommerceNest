import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { env, hasCloudinary } from '../lib/env.js';
import { assertWithinStorageLimitTx, withStoreLock } from './subscription.service.js';

/**
 * This system is for images only — anything else (HTML, scripts, archives)
 * has no legitimate use here and only expands attack surface (e.g. a
 * mislabeled upload later served/opened with an unexpected content-type).
 */
const ALLOWED_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
  'image/gif',
] as const;

/** Generous ceiling above the 2.5MB client-side suggestion — this is
 * metadata bookkeeping (Cloudinary/the browser enforce the real transfer
 * limit), not a substitute for it, but it keeps obviously-bogus values out
 * of the database. */
const MAX_MEDIA_BYTES = 10_000_000;

const listQuerySchema = z.object({
  usageType: z
    .enum([
      'PRODUCT_IMAGE',
      'CATEGORY_IMAGE',
      'STORE_LOGO',
      'STORE_BANNER',
      'CMS_ASSET',
      'INVOICE',
      'OTHER',
    ])
    .optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function listMedia(storeId: string, query: unknown) {
  const q = listQuerySchema.parse(query);
  const where = {
    storeId,
    ...(q.usageType ? { usageType: q.usageType } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.mediaAsset.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    }),
    prisma.mediaAsset.count({ where }),
  ]);

  return { items, total, page: q.page, limit: q.limit };
}

export async function deleteMedia(storeId: string, mediaId: string) {
  const asset = await prisma.mediaAsset.findFirst({
    where: { id: mediaId, storeId },
  });
  if (!asset) throw AppError.notFound('Media asset not found');
  await prisma.mediaAsset.delete({ where: { id: mediaId } });
  return { ok: true };
}

const signedUploadSchema = z
  .object({
    filename: z.string().trim().min(1).max(300),
    mimeType: z.enum(ALLOWED_IMAGE_MIME_TYPES),
    usageType: z.string().trim().max(40).optional(),
  })
  .strict();

/**
 * Cloudinary signed upload URL stub.
 * Returns a stub payload when credentials are missing so local/dev still works.
 */
export async function getSignedUploadUrl(storeId: string, rawInput: unknown) {
  const input = signedUploadSchema.parse(rawInput);
  const publicId = `${storeId}/${randomUUID()}`;

  if (!hasCloudinary) {
    return {
      mode: 'stub' as const,
      uploadUrl: `https://api.cloudinary.com/v1_1/stub/auto/upload`,
      publicId,
      fields: {
        api_key: 'stub',
        timestamp: String(Math.floor(Date.now() / 1000)),
        signature: 'stub-signature',
        folder: storeId,
        public_id: publicId,
      },
      note: 'Cloudinary credentials not configured — stub signed URL returned',
    };
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const toSign = `folder=${storeId}&public_id=${publicId}&timestamp=${timestamp}${env.CLOUDINARY_API_SECRET}`;
  const signature = createHash('sha1').update(toSign).digest('hex');

  return {
    mode: 'cloudinary' as const,
    uploadUrl: `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/auto/upload`,
    publicId,
    fields: {
      api_key: env.CLOUDINARY_API_KEY,
      timestamp: String(timestamp),
      signature,
      folder: storeId,
      public_id: publicId,
    },
    filename: input.filename,
    mimeType: input.mimeType,
  };
}

/**
 * Only `https:`/`http:` (real hosted images) or `data:image/...` (the
 * dev-stub fallback) are legitimate here. Rejects `javascript:`, `vbscript:`,
 * `file:`, etc. up front — defense in depth even though browsers already
 * refuse to execute those as an `<img src>`, since this URL can end up in
 * other contexts (CSV/export, admin tooling, a future "open original" link).
 */
const mediaUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2_000_000) // data: URLs (dev stub fallback) can be large
  .refine(
    (url) => /^https?:\/\//i.test(url) || /^data:image\//i.test(url),
    { message: 'Media URL must be an http(s) URL or a data:image/... URL' },
  );

const registerMediaSchema = z
  .object({
    publicId: z.string().trim().min(1).max(300),
    url: mediaUrlSchema,
    filename: z.string().trim().min(1).max(300),
    mimeType: z.enum(ALLOWED_IMAGE_MIME_TYPES),
    bytes: z.number().int().nonnegative().max(MAX_MEDIA_BYTES),
    usageType: z
      .enum([
        'PRODUCT_IMAGE',
        'CATEGORY_IMAGE',
        'STORE_LOGO',
        'STORE_BANNER',
        'CMS_ASSET',
        'INVOICE',
        'OTHER',
      ])
      .optional(),
  })
  .strict();

/**
 * Cloudinary is the authoritative source for how large an uploaded file
 * actually is — the client-supplied `bytes` in registerMediaAsset can't be
 * fully trusted (a merchant's client could under-report it to dodge the
 * storage limit). One Admin API lookup made at registration time, not on
 * every read — storage totals are always summed from the already-stored
 * `MediaAsset.bytes` column, so this never runs on a dashboard/list
 * request. Returns `null` on any failure (network error, not found yet due
 * to upload propagation delay, non-2xx, malformed response) — the caller
 * decides what a failed verification means (see `resolveStorageVerificationMode`).
 */
async function fetchVerifiedCloudinaryBytes(publicId: string): Promise<number | null> {
  const url = `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/resources/image/upload/${encodeURIComponent(publicId)}`;
  const basicAuth = Buffer.from(`${env.CLOUDINARY_API_KEY}:${env.CLOUDINARY_API_SECRET}`).toString('base64');

  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: `Basic ${basicAuth}` } });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  try {
    const json = (await res.json()) as { bytes?: unknown };
    return typeof json.bytes === 'number' && Number.isFinite(json.bytes) ? json.bytes : null;
  } catch {
    return null;
  }
}

export type StorageVerificationMode = 'real' | 'stub' | 'unconfigured-production';

/** Pure — no DB, no network, no env mutation — same shape and same reason as
 * `lib/sms.ts#resolveSmsMode`, which this deliberately mirrors: configured
 * means "actually verify," unconfigured-in-production means "fail closed,
 * never silently trust the client," unconfigured-in-dev/test means "no real
 * Cloudinary asset exists to check anyway, use the (bounded) client value."
 * Takes explicit params (rather than reading `hasCloudinary`/`env.NODE_ENV`
 * internally) so the decision itself is testable without mocking env or
 * network state — see product-staff-concurrency.test.ts. */
export function resolveStorageVerificationMode(opts: {
  nodeEnv: string;
  cloudinaryConfigured: boolean;
}): StorageVerificationMode {
  if (opts.cloudinaryConfigured) return 'real';
  if (opts.nodeEnv === 'production') return 'unconfigured-production';
  return 'stub';
}

/**
 * Resolves the byte count to trust for this upload — the network call to
 * Cloudinary (when applicable) happens here, entirely before any database
 * transaction/lock is opened (see registerMediaAsset below). Throws
 * STORAGE_VERIFICATION_UNAVAILABLE (503) rather than silently trusting an
 * unverifiable client-supplied number whenever verification *should* have
 * been possible but wasn't — production-without-Cloudinary, or a real
 * Cloudinary lookup that failed.
 */
async function resolveVerifiedBytes(input: { publicId: string; bytes: number }): Promise<number> {
  const mode = resolveStorageVerificationMode({
    nodeEnv: env.NODE_ENV,
    cloudinaryConfigured: hasCloudinary,
  });

  if (mode === 'unconfigured-production') {
    throw AppError.serviceUnavailable(
      'Storage verification is not available right now. Please try again shortly.',
      'STORAGE_VERIFICATION_UNAVAILABLE',
    );
  }

  if (mode === 'stub') {
    // Dev/test only (see resolveStorageVerificationMode) — there is no real
    // Cloudinary asset to verify against, so the client-supplied value
    // (already bounded by MAX_MEDIA_BYTES) is the best available number,
    // matching this codebase's existing dev-safe-stub convention.
    return input.bytes;
  }

  const verified = await fetchVerifiedCloudinaryBytes(input.publicId);
  if (verified === null) {
    throw AppError.serviceUnavailable(
      'Could not verify the uploaded file size. Please try again.',
      'STORAGE_VERIFICATION_UNAVAILABLE',
    );
  }
  return verified;
}

/**
 * Registration flow, deliberately in this order to avoid holding a database
 * lock across a network call:
 *   1. Resolve the trusted byte count (Cloudinary lookup or dev stub) — no
 *      transaction open yet.
 *   2. Open a short transaction, lock the store row, re-check current
 *      storage usage against the plan limit, create the MediaAsset, commit.
 * Step 2's re-check (not just step 1's number) is what makes concurrent
 * uploads safe: two simultaneous registrations for the same store are
 * serialized by the row lock, so the second one sees the first's already-
 * committed usage before deciding whether it still fits.
 */
export async function registerMediaAsset(storeId: string, rawInput: unknown) {
  const input = registerMediaSchema.parse(rawInput);
  const bytes = await resolveVerifiedBytes(input);

  return withStoreLock(storeId, async (tx) => {
    await assertWithinStorageLimitTx(tx, storeId, bytes);
    return tx.mediaAsset.create({
      data: {
        storeId,
        publicId: input.publicId,
        url: input.url,
        filename: input.filename,
        mimeType: input.mimeType,
        bytes,
        usageType: input.usageType ?? 'OTHER',
      },
    });
  });
}
