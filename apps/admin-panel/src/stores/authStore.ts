import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser } from '../lib/api';

interface ImpersonationState {
  active: boolean;
  storeId?: string;
  storeName?: string;
  sessionId?: string;
  accessToken?: string;
  refreshToken?: string;
  originalAccessToken?: string;
}

interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  impersonation: ImpersonationState;
  setSession: (accessToken: string, user: AuthUser) => void;
  clearSession: () => void;
  setImpersonation: (state: ImpersonationState) => void;
  clearImpersonation: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,
      impersonation: { active: false },
      setSession: (accessToken, user) => set({ accessToken, user }),
      clearSession: () =>
        set({ accessToken: null, user: null, impersonation: { active: false } }),
      setImpersonation: (impersonation) => set({ impersonation }),
      clearImpersonation: () => set({ impersonation: { active: false } }),
    }),
    { name: 'cn-admin-auth' },
  ),
);
