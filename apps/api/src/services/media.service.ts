import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { env, hasCloudinary } from '../lib/env.js';

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

/**
 * Cloudinary signed upload URL stub.
 * Returns a stub payload when credentials are missing so local/dev still works.
 */
export async function getSignedUploadUrl(
  storeId: string,
  input: { filename: string; mimeType: string; usageType?: string },
) {
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

export async function registerMediaAsset(
  storeId: string,
  input: {
    publicId: string;
    url: string;
    filename: string;
    mimeType: string;
    bytes: number;
    usageType?:
      | 'PRODUCT_IMAGE'
      | 'STORE_LOGO'
      | 'STORE_BANNER'
      | 'CMS_ASSET'
      | 'INVOICE'
      | 'OTHER';
  },
) {
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
