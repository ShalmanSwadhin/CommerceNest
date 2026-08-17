import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { env, hasCloudinary } from '../lib/env.js';
import { assertWithinStorageLimit } from './subscription.service.js';

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
        'STORE_LOGO',
        'STORE_BANNER',
        'CMS_ASSET',
        'INVOICE',
        'OTHER',
      ])
      .optional(),
  })
  .strict();

export async function registerMediaAsset(storeId: string, rawInput: unknown) {
  const input = registerMediaSchema.parse(rawInput);

  await assertWithinStorageLimit(storeId, input.bytes);

  return prisma.mediaAsset.create({
    data: {
      storeId,
      publicId: input.publicId,
      url: input.url,
      filename: input.filename,
      mimeType: input.mimeType,
      bytes: input.bytes,
      usageType: input.usageType ?? 'OTHER',
    },
  });
}
