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
  apiGetProfile,
  getStoredUser,
  setStoredUser,
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

  // Hydrate user from localStorage, then validate token with backend
  useEffect(() => {
    async function hydrate() {
      const stored = getStoredUser();
      if (stored) {
        // Optimistically set user so UI doesn't flash
        setUser(stored);
        try {
          // Validate token is still valid
          const res = await apiGetProfile();
          if (res.data) {
            const validated = res.data as unknown as User;
            setUser(validated);
            setStoredUser(validated);
          }
        } catch {
          // Token expired / invalid — already cleared by request() handler
          setUser(null);
        }
      }
      setIsLoading(false);
    }
    hydrate();
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

  // Listen for auth expiry from request() 401 handler
  useEffect(() => {
    const onExpired = () => {
      setUser(null);
    };
    window.addEventListener("pond_finder:auth_expired", onExpired);
    return () => window.removeEventListener("pond_finder:auth_expired", onExpired);
  }, []);

  // Listen for logout in other tabs
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === "pond_finder_token" && !e.newValue) {
        setUser(null);
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

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
