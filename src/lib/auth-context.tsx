"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true, logout: () => {} });

export function useAuth() { return useContext(AuthContext); }

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<ShippingUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => response.ok ? (await response.json()).user as ShippingUser : null)
      .then((currentUser) => { if (active) setUser(currentUser); })
      .catch(() => { if (active) setUser(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  function logout() {
    fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" })
      .finally(() => {
        setUser(null);
        router.push("/login");
        router.refresh();
      });
  }

  return <AuthContext.Provider value={{ user, loading, logout }}>{children}</AuthContext.Provider>;
}
