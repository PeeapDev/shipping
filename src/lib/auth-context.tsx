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

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  logout: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

/**
 * Parse the shipping cookie token to extract user info.
 * Supports both legacy base64 and new HMAC-signed format.
 */
function getUserFromCookie(): ShippingUser | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|; )peeap_shipping_token=([^;]*)/);
  if (!match) return null;

  try {
    const token = decodeURIComponent(match[1]);
    if (!token.startsWith("shp_")) return null;

    const raw = token.slice(4);
    const dotIndex = raw.lastIndexOf(".");

    let payload: any;
    if (dotIndex > 0) {
      // New signed format: shp_<base64url>.<signature>
      payload = JSON.parse(atob(raw.slice(0, dotIndex).replace(/-/g, "+").replace(/_/g, "/")));
    } else {
      // Legacy format: shp_<base64(json)>
      payload = JSON.parse(atob(raw));
    }

    if (!payload?.sub || !payload?.exp) return null;
    if (payload.exp < Date.now()) return null;

    return {
      id: payload.sub,
      email: payload.email || "",
      name: payload.email || "",
      role: payload.role || "dispatcher",
    };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<ShippingUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Read user from auth cookie — no localStorage
    const cookieUser = getUserFromCookie();
    if (cookieUser) {
      // Enrich with display info from the user cookie (name, profile pic)
      try {
        const userMatch = document.cookie.match(/(?:^|; )peeap_shipping_user=([^;]*)/);
        if (userMatch) {
          const info = JSON.parse(decodeURIComponent(userMatch[1]));
          if (info.name) cookieUser.name = info.name;
          if (info.profile_picture) cookieUser.profile_picture = info.profile_picture;
        }
      } catch { /* ignore */ }
      setUser(cookieUser);
    }
    setLoading(false);
  }, []);

  function logout() {
    document.cookie = "peeap_shipping_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    document.cookie = "peeap_shipping_user=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    setUser(null);
    router.push("/login");
    router.refresh();
  }

  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
