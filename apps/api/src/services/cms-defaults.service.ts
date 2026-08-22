import type { Prisma } from '@commercenest/prisma';
import { prisma } from '../lib/prisma.js';

/**
 * Starter content for every store's CMS content pages — written once here so
 * a newly-created store's footer links (/pages/about, /pages/shipping, etc.
 * — already linked by both storefront themes, see CmsPage.tsx's
 * COMMON_PAGE_KEYS) work from day one instead of 404ing with "Content not
 * published" until the merchant gets around to writing them. All fully
 * editable afterward from Store Admin -> CMS — this is a starting point,
 * not a locked default.
 *
 * Deliberately does NOT include contact-info/social-links — those are real
 * facts (a phone number, an address, a Facebook URL) that this codebase
 * already treats as "never fake" (see StoreShell.tsx/ModernCommerceShell.tsx
 * footer history); boilerplate policy text is safe to pre-fill, a made-up
 * phone number is not.
 */
export function defaultCmsPages(storeName: string): { key: string; title: string; body: string }[] {
  const name = storeName.trim() || 'our store';
  return [
    {
      key: 'about',
      title: `About ${name}`,
      body: `${name} is an online store built to bring quality products to your doorstep, anywhere in Bangladesh. We started with a simple goal: make shopping online as easy and trustworthy as buying from a store you know.

Every product listed here is checked for quality before it reaches you, and our team is always ready to help if something isn't right. We offer Cash on Delivery and bKash payments, and we deliver across Dhaka and nationwide.

Thank you for shopping with us — we're glad to have you here.`,
    },
    {
      key: 'contact',
      title: 'Contact Us',
      body: `Have a question about your order, a product, or anything else? We're happy to help.

The fastest way to reach us is through the contact details in the footer of this page. You can also reach out via our social media pages if you follow us there.

For order-specific questions, please have your order number ready — you'll find it on your confirmation page or under Track Order.`,
    },
    {
      key: 'shipping',
      title: 'Shipping Policy',
      body: `We currently deliver across Bangladesh, including Dhaka and outside Dhaka.

Delivery charges are calculated automatically at checkout based on your delivery address, and shown before you confirm your order.

Orders are typically processed within 1–2 business days of confirmation. Delivery usually takes 2–4 business days inside Dhaka and 4–7 business days outside Dhaka, though this can vary by location and courier availability.

You'll receive a tracking ID once your order ships, and can check its status anytime from the Track Order page.`,
    },
    {
      key: 'returns',
      title: 'Returns Policy',
      body: `We want you to be happy with your purchase. If something isn't right, you can request a return after your order is marked Delivered.

To request a return, sign in to Your Account, find the order under Your Orders, and click Request Return with a reason. Our team will review your request and get back to you.

Items must be unused, in their original packaging, and requested within a reasonable time after delivery. Refunds, once approved, are processed according to how you originally paid.

For questions about a specific order, please contact us with your order number.`,
    },
    {
      key: 'faq',
      title: 'Frequently Asked Questions',
      body: `How do I place an order?
Browse our products, add items to your cart, and follow the checkout steps. You can pay via Cash on Delivery or bKash.

Do you deliver outside Dhaka?
Yes, we deliver nationwide across Bangladesh. Delivery charges and estimated time vary by location and are shown at checkout.

How do I track my order?
Use the Track Order page with your order number and phone number, or check Your Orders if you're signed in.

Can I return a product?
Yes — once your order is marked Delivered, you can request a return from Your Orders. See our Returns Policy for details.

How do I pay with bKash?
Select bKash at checkout, send the payment to the number shown, and enter your transaction ID. We verify manual bKash payments before confirming your order.

Still have a question? Visit our Contact page.`,
    },
    {
      key: 'terms',
      title: 'Terms & Conditions',
      body: `By using ${name}'s website and placing an order, you agree to the following terms.

All products are subject to availability. Prices and delivery charges are shown at checkout and may change without prior notice.

Orders paid by Cash on Delivery may be confirmed by phone before dispatch. Orders paid by bKash are verified manually before being confirmed — false or incomplete payment information may result in order cancellation.

We reserve the right to cancel any order in cases of suspected fraud, pricing errors, or stock unavailability, and will notify you if this happens.

These terms may be updated from time to time; continued use of this site means you accept the current version.`,
    },
    {
      key: 'privacy',
      title: 'Privacy Policy',
      body: `We collect the information you provide when creating an account or placing an order — such as your name, phone number, email, and delivery address — solely to process and deliver your orders and to communicate with you about them.

We do not sell your personal information to third parties. Your information may be shared with delivery partners only as needed to fulfill your order.

You can view and manage your account information anytime by signing in to Your Account. If you'd like your data removed, please contact us.

This policy may be updated from time to time to reflect how we handle your information.`,
    },
  ];
}

type CmsTx = { cmsContentBlock: { createMany: (args: { data: Prisma.CmsContentBlockCreateManyInput[] }) => Promise<unknown> } };

/** Called once, inside the same transaction that creates a new store —
 * idempotent by construction (only ever runs at creation time, never on an
 * existing store), so no upsert/exists-check is needed here the way
 * seed.ts's reusable version needs one for repeated seed runs. */
export async function seedDefaultCmsBlocks(tx: CmsTx, storeId: string, storeName: string) {
  const pages = defaultCmsPages(storeName);
  await tx.cmsContentBlock.createMany({
    data: pages.map((p) => ({
      storeId,
      key: p.key,
      fields: { title: p.title, body: p.body, sortOrder: 0 },
    })),
  });
}

/**
 * For a store that existed before this feature (or was otherwise missing
 * some of the 7 keys) — fills in only the keys that don't already exist,
 * never overwrites a key the merchant has already customized (even to
 * something minimal). Safe to call repeatedly on any store, any number of
 * times. Returns which keys it actually created.
 */
export async function backfillMissingCmsDefaults(storeId: string): Promise<string[]> {
  const store = await prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { name: true } });
  const existing = await prisma.cmsContentBlock.findMany({
    where: { storeId },
    select: { key: true },
  });
  const existingKeys = new Set(existing.map((b) => b.key));
  const missing = defaultCmsPages(store.name).filter((p) => !existingKeys.has(p.key));
  if (missing.length === 0) return [];

  await prisma.cmsContentBlock.createMany({
    data: missing.map((p) => ({
      storeId,
      key: p.key,
      fields: { title: p.title, body: p.body, sortOrder: 0 },
    })),
  });
  return missing.map((p) => p.key);
}
