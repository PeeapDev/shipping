"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearShippingSession, EXPLICIT_LOGIN_KEY, SHIPPING_AUTH_CHANGED, SHIPPING_AUTH_CLEARED } from "@/lib/auth-client";

interface ShippingUser {
  id: string;
  email: string;
  name: string;
  role: string;
  profile_picture?: string | null;
}

interface AuthContextType {
  user: ShippingUser | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true, logout: async () => {} });

export function useAuth() { return useContext(AuthContext); }

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<ShippingUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let active = true;
    let generation = 0;
    const loadUser = async () => {
      const current = ++generation;
      setLoading(true);
      try {
        const response = await fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store" });
        const currentUser = response.ok ? (await response.json()).user as ShippingUser : null;
        if (active && current === generation) setUser(currentUser);
      } catch { if (active && current === generation) setUser(null); }
      finally { if (active && current === generation) setLoading(false); }
    };
    const clearUser = () => { ++generation; setUser(null); setLoading(false); };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== EXPLICIT_LOGIN_KEY) return;
      if (event.newValue === "true") clearUser();
      else void loadUser();
    };
    void loadUser();
    window.addEventListener(SHIPPING_AUTH_CLEARED, clearUser);
    window.addEventListener(SHIPPING_AUTH_CHANGED, loadUser);
    window.addEventListener("storage", onStorage);
    return () => {
      active = false;
      ++generation;
      window.removeEventListener(SHIPPING_AUTH_CLEARED, clearUser);
      window.removeEventListener(SHIPPING_AUTH_CHANGED, loadUser);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  async function logout() {
    await clearShippingSession();
    router.replace("/");
    router.refresh();
  }

  return <AuthContext.Provider value={{ user, loading, logout }}>{children}</AuthContext.Provider>;
}
