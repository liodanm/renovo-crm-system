'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { authApi, CurrentUser, LoginResult } from '../api/auth';
import { clearTokens, getRefreshToken, getSessionJti, setTokens } from './token-storage';

interface AuthContextValue {
  user: CurrentUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  refetchUser: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
  hasRole: (...roles: string[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const loadUser = useCallback(async () => {
    try {
      const me = await authApi.me();
      setUser(me);
    } catch {
      setUser(null);
    }
  }, []);

  // On app boot there's no access token in memory (see token-storage.ts),
  // only a possible refresh token in sessionStorage. Silently attempt a
  // refresh -> fetch /auth/me before rendering anything gated on auth.
  useEffect(() => {
    (async () => {
      setIsLoading(true);
      if (getRefreshToken()) {
        await loadUser();
      }
      setIsLoading(false);
    })();
  }, [loadUser]);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await authApi.login({ email, password });

      if (!result.requiresCompanySelection) {
        setTokens({ accessToken: result.accessToken!, refreshToken: result.refreshToken! });
        await loadUser();
      }

      return result;
    },
    [loadUser],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout(getSessionJti());
    } finally {
      clearTokens();
      setUser(null);
      router.push('/login');
    }
  }, [router]);

  const hasPermission = useCallback((permission: string) => !!user?.permissions.includes(permission), [user]);
  const hasAnyPermission = useCallback(
    (permissions: string[]) => !!user && permissions.some((p) => user.permissions.includes(p)),
    [user],
  );
  const hasRole = useCallback((...roles: string[]) => !!user && roles.includes(user.roleName), [user]);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: !!user,
      login,
      logout,
      refetchUser: loadUser,
      hasPermission,
      hasAnyPermission,
      hasRole,
    }),
    [user, isLoading, login, logout, loadUser, hasPermission, hasAnyPermission, hasRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an <AuthProvider>');
  return ctx;
}
