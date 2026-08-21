import { create } from 'zustand';

interface WishlistState {
  productIds: Set<string>;
  loaded: boolean;
  setIds: (ids: string[]) => void;
  add: (productId: string) => void;
  remove: (productId: string) => void;
}

/** Server-backed (via wishlistStore + storefrontApi), not persisted —
 * mirrors whatever the logged-in customer's real WishlistItem rows are.
 * Guests (no customer session) never populate this; the UI treats an empty,
 * unloaded wishlist as "sign in to save items" rather than faking a local
 * guest wishlist that would be lost on login anyway. */
export const useWishlistStore = create<WishlistState>((set, get) => ({
  productIds: new Set(),
  loaded: false,
  setIds: (ids) => set({ productIds: new Set(ids), loaded: true }),
  add: (productId) => set({ productIds: new Set(get().productIds).add(productId) }),
  remove: (productId) => {
    const next = new Set(get().productIds);
    next.delete(productId);
    set({ productIds: next });
  },
}));
