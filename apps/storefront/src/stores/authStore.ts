import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Customer {
  id: string;
  name?: string;
  phone: string;
  email?: string | null;
}

interface AuthState {
  accessToken: string | null;
  customer: Customer | null;
  setSession: (accessToken: string, customer: Customer) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      customer: null,
      setSession: (accessToken, customer) => set({ accessToken, customer }),
      clearSession: () => set({ accessToken: null, customer: null }),
    }),
    { name: 'cn-storefront-auth' },
  ),
);
