/** Product badges — colors are fixed per variant (not store-themeable), a
 * deliberate 1:1 port of the source design's variantStyles: sale/bestseller/
 * popular/trending/outofstock/lowstock keep their exact semantic colors
 * regardless of a store's brand palette (a red "Sale" badge reads as a sale
 * in any store), while 'new' uses --store-primary so it still feels
 * store-branded rather than always-black. */
export type ModernBadgeVariant =
  | 'sale'
  | 'new'
  | 'bestseller'
  | 'popular'
  | 'trending'
  | 'outofstock'
  | 'lowstock';

const VARIANT_CLASS: Record<ModernBadgeVariant, string> = {
  sale: 'bg-red-600 text-white',
  new: 'bg-[var(--store-primary,#111111)] text-white',
  bestseller: 'bg-amber-500 text-white',
  popular: 'bg-indigo-600 text-white',
  trending: 'bg-emerald-600 text-white',
  outofstock: 'bg-gray-400 text-white',
  lowstock: 'bg-orange-500 text-white',
};

export function ModernBadge({
  label,
  variant = 'new',
  size = 'sm',
}: {
  label: string;
  variant?: ModernBadgeVariant;
  size?: 'sm' | 'md';
}) {
  return (
    <span
      className={`inline-block font-semibold tracking-wide uppercase rounded-sm ${VARIANT_CLASS[variant]} ${
        size === 'sm' ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1'
      }`}
    >
      {label}
    </span>
  );
}
