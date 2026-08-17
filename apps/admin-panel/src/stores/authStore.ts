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

/** The single source of truth for "is this session actually usable here" —
 * ProtectedRoute and LoginPage must agree on this exact condition. When they
 * drifted (LoginPage only checked accessToken, ProtectedRoute also required
 * role === MASTER_ADMIN or active impersonation), a session with a token but
 * the wrong role bounced forever between "/" and "/login" (ProtectedRoute
 * redirects to /login, LoginPage sees the token and redirects back to "/"),
 * which renders as a blank page. */
export function hasValidAdminSession(state: {
  accessToken: string | null;
  user: AuthUser | null;
  impersonationActive: boolean;
}): boolean {
  if (!state.accessToken || !state.user) return false;
  return state.user.role === 'MASTER_ADMIN' || state.impersonationActive;
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
