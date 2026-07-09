// Auth context — holds the current user and token lifecycle.
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, setToken, clearToken, getToken } from "@/src/api";

type User = any;

type AuthState = {
  user: User | null;
  loading: boolean;
  enterAsGuest: (username: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const bootstrap = useCallback(async () => {
    try {
      const token = await getToken();
      if (token) {
        const { user } = await api.me();
        setUser(user);
      }
    } catch {
      await clearToken();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const enterAsGuest = useCallback(async (username: string) => {
    const { token, user } = await api.guest(username);
    await setToken(token);
    setUser(user);
  }, []);

  const logout = useCallback(async () => {
    await clearToken();
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const { user } = await api.profile();
      setUser(user);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, enterAsGuest, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
