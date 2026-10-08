"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Truck, Loader2, AlertCircle, LogIn } from "lucide-react";
import { openPeeapSignIn } from "@/lib/peeap-popup";

const PEEAP_ORIGIN = "https://my.peeap.com";

export default function LoginPage() {
  const router = useRouter();
  const popupRef = useRef<Window | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      if (event.origin !== PEEAP_ORIGIN || event.source !== popupRef.current) return;
      if (event.data?.type !== "PEEAP_AUTH_SUCCESS") return;
      const token = event.data?.ssoToken;
      if (typeof token !== "string") {
        setError("Peeap could not complete sign-in. Please try again.");
        setLoading(false);
        return;
      }
      try {
        const response = await fetch("/api/auth/peeap", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Shipping sign-in failed");
        popupRef.current?.close();
        router.replace("/dashboard");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Shipping sign-in failed");
        setLoading(false);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [router]);

  function openPeeapLogin() {
    setError("");
    const popup = openPeeapSignIn();
    if (!popup) {
      setError("Allow the Peeap sign-in popup in your browser, then try again.");
      return;
    }
    popupRef.current = popup;
    setLoading(true);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-violet-100 rounded-2xl mb-4">
          <Truck className="h-8 w-8 text-violet-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Peeap Shipping</h1>
        <p className="text-sm text-gray-500 mt-1">Sign in with your Peeap account</p>
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm mt-8">
          {error && <div role="alert" className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-5">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />{error}
          </div>}
          <button type="button" onClick={openPeeapLogin} disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-violet-600 text-white py-3 rounded-lg font-medium hover:bg-violet-700 disabled:opacity-50">
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
            Continue with Peeap
          </button>
          <p className="text-xs text-gray-500 mt-4">Sign in or create your account securely on Peeap. Shipping access is limited to authorized staff.</p>
        </div>
      </div>
    </div>
  );
}
