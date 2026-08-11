import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser } from '../lib/api';

interface ImpersonationState {
  active: boolean;
  sessionId?: string | null;
  storeId?: string | null;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  impersonation: ImpersonationState;
  setSession: (
    accessToken: string,
    user: AuthUser,
    refreshToken?: string | null,
  ) => void;
  updateTokens: (accessToken: string, refreshToken: string | null) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      impersonation: { active: false },
      setSession: (accessToken, user, refreshToken) =>
        set((state) => ({
          accessToken,
          refreshToken: refreshToken !== undefined ? refreshToken : state.refreshToken,
          user,
          impersonation: user.impersonationSessionId
            ? { active: true, sessionId: user.impersonationSessionId, storeId: user.storeId }
            : { active: false },
        })),
      updateTokens: (accessToken, refreshToken) =>
        set((state) => ({
          accessToken,
          refreshToken: refreshToken ?? state.refreshToken,
        })),
      clearSession: () =>
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          impersonation: { active: false },
        }),
    }),
    { name: 'cn-store-auth' },
  ),
);

export function useStoreId() {
  return useAuthStore((s) => s.user?.storeId || null);
}
