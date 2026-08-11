import { normalizeThemeDocument, ProductStatus, StorefrontVersionStatus } from '@commercenest/types';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

/**
 * Computed on the fly from existing store/product/theme records — no
 * dedicated "onboarding" schema needed, since every step is already
 * derivable from data the merchant enters through normal flows.
 */
export async function getOnboardingChecklist(storeId: string) {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    include: {
      storefront: { include: { draftVersion: true, publishedVersion: true } },
    },
  });
  if (!store) throw AppError.notFound('Store not found');

  const [productCount, activeProductCount] = await Promise.all([
    prisma.product.count({ where: { storeId } }),
    prisma.product.count({ where: { storeId, status: ProductStatus.ACTIVE } }),
  ]);

  const themeVersion = store.storefront?.publishedVersion ?? store.storefront?.draftVersion;
  const themeDoc = themeVersion
    ? normalizeThemeDocument({
        layout: themeVersion.layout,
        themeSettings: themeVersion.themeSettings,
      })
    : null;

  const hasStoreInfo = Boolean(store.name && store.category && store.tagline);
  const hasLogo = Boolean(themeDoc?.themeSettings.branding.logoUrl);
  const hasPublishedTheme =
    store.storefront?.publishedVersion?.status === StorefrontVersionStatus.PUBLISHED;
  const hasProducts = activeProductCount > 0;
  const hasBkash = Boolean(store.bkashNumber);
  // Delivery ships with sensible Bangladesh-default flat rates, so it's
  // usable without merchant action — always shown complete.
  const hasDelivery = true;
  const readyToPublish = hasPublishedTheme && hasProducts && hasBkash;

  const steps = [
    { key: 'store_info', label: 'Store information', complete: hasStoreInfo },
    { key: 'logo', label: 'Logo', complete: hasLogo },
    { key: 'theme', label: 'Theme', complete: hasPublishedTheme },
    { key: 'products', label: 'Products', complete: hasProducts },
    { key: 'bkash', label: 'bKash', complete: hasBkash },
    { key: 'delivery', label: 'Delivery', complete: hasDelivery },
    { key: 'publish', label: 'Publish', complete: readyToPublish },
  ];

  const percentComplete = Math.round(
    (steps.filter((s) => s.complete).length / steps.length) * 100,
  );

  return {
    steps,
    percentComplete,
    productCount,
    activeProductCount,
  };
}
