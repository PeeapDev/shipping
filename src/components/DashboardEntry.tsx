"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { openPeeapSignIn } from "@/lib/peeap-popup";

const PEEAP_ORIGIN = "https://my.peeap.com";

/** Keep visitors on the current shipping page until Peeap grants a staff session. */
export function DashboardEntry({ children, className }: { children: React.ReactNode; className?: string }) {
  const router = useRouter();
  const popupRef = useRef<Window | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      if (event.origin !== PEEAP_ORIGIN || event.source !== popupRef.current) return;
      if (event.data?.type !== "PEEAP_AUTH_SUCCESS") return;
      const token = event.data?.ssoToken;
      if (typeof token !== "string") {
        setError("Peeap could not complete sign-in. Try again.");
        setLoading(false);
        return;
      }
      try {
        const response = await fetch("/api/auth/peeap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Shipping sign-in failed");
        popupRef.current?.close();
        router.push("/dashboard");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Shipping sign-in failed");
        setLoading(false);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [router]);

  async function enterDashboard() {
    if (loading) return;
    setError("");
    setLoading(true);

    // Open directly within the user's click; no blank tab or delayed navigation.
    const popup = openPeeapSignIn();
    if (!popup) {
      setError("Allow the Peeap sign-in popup, then try again.");
      setLoading(false);
      return;
    }
    popupRef.current = popup;
    try {
      const response = await fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store" });
      if (response.ok) {
        popup.close();
        router.push("/dashboard");
        router.refresh();
        return;
      }
    } catch {
      // The protected exchange will still check authorization after Peeap sign-in.
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" onClick={enterDashboard} disabled={loading} className={className}>
        {children}
      </button>
      {error && <span role="alert" className="max-w-xs text-xs text-red-600">{error}</span>}
    </span>
  );
}
