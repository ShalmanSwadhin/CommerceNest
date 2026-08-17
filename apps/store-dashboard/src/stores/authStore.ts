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

const STORE_ROLES = new Set([
  'STORE_OWNER',
  'STORE_MANAGER',
  'INVENTORY_MANAGER',
  'ORDER_MANAGER',
  'CUSTOMER_SUPPORT',
  'MASTER_ADMIN',
]);

/** The single source of truth for "is this session actually usable here" —
 * ProtectedRoute and LoginPage must agree on this exact condition. When they
 * drifted (LoginPage only checked accessToken, ProtectedRoute also required
 * a valid role + storeId), a session with a token but no valid role bounced
 * forever between "/" and "/login" (ProtectedRoute redirects to /login,
 * LoginPage sees the token and redirects back to "/"), which renders as a
 * blank page. */
export function hasValidStoreSession(state: {
  accessToken: string | null;
  user: AuthUser | null;
}): boolean {
  return (
    !!state.accessToken &&
    !!state.user &&
    STORE_ROLES.has(state.user.role) &&
    !!state.user.storeId
  );
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
