"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { User } from "@/types";
import {
  apiLogin,
  apiLogout,
  getStoredUser,
  clearToken,
} from "@/lib/api";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // Hydrate user from localStorage on mount
  useEffect(() => {
    const stored = getStoredUser();
    if (stored) {
      setUser(stored);
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(
    async (identifier: string, password: string) => {
      const res = await apiLogin(identifier, password);
      if (res.data) {
        setUser(res.data.user);
        router.push("/dashboard");
      }
    },
    [router]
  );

  const logout = useCallback(() => {
    apiLogout();
    setUser(null);
    router.push("/login");
  }, [router]);

  // Listen for 401 events from other tabs
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === "pond_finder_token" && !e.newValue) {
        setUser(null);
        router.push("/login");
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

/**
 * Hook that redirects to /login if not authenticated.
 * Returns the user once confirmed.
 */
export function useRequireAuth(): User | null {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      clearToken();
      router.push("/login");
    }
  }, [user, isLoading, router]);

  return user;
}
