"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { completeShippingSignIn, peeapSignInUrl, ShippingHandoffGate } from "@/lib/auth-client";

const PEEAP_ORIGIN = "https://my.peeap.com";

export function PeeapAuthDialog({ onClose, forceLogin = false }: { onClose: () => void; forceLogin?: boolean }) {
  const router = useRouter();
  const frame = useRef<HTMLIFrameElement>(null);
  const handoff = useRef(new ShippingHandoffGate());
  const [error, setError] = useState("");
  const [exchanging, setExchanging] = useState(false);
  const [url] = useState(() => peeapSignInUrl("embed", forceLogin));

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      if (event.origin !== PEEAP_ORIGIN || event.source !== frame.current?.contentWindow) return;
      if (event.data?.type !== "PEEAP_AUTH_SUCCESS") return;
      const token = event.data?.ssoToken;
      if (typeof token !== "string" || !token) {
        setError("Peeap could not complete sign-in. Please try again.");
        return;
      }
      try {
        await handoff.current.run(async () => {
          setExchanging(true);
          setError("");
          const response = await fetch("/api/auth/peeap", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token }),
            credentials: "same-origin",
          });
          const result = await response.json();
          if (!response.ok || result.success !== true) throw new Error(result.error || "Shipping sign-in failed");
          completeShippingSignIn();
          onClose();
          router.push(result.destination === "/my-orders" ? "/my-orders" : "/dashboard");
          router.refresh();
        });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Shipping sign-in failed");
        setExchanging(false);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onClose, router]);

  if (typeof document === "undefined") return null;
  // Staff controls live inside a transformed mobile sidebar. Portalling keeps
  // the modal full-screen instead of trapping it inside that sidebar.
  return createPortal(
    <div role="presentation" className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-0 sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Sign in with Peeap" className="relative w-full h-full sm:h-[min(760px,95vh)] sm:max-w-[500px] overflow-hidden sm:rounded-2xl bg-white shadow-2xl">
        <button type="button" onClick={onClose} aria-label="Close sign-in" className="absolute right-3 top-3 z-10 rounded-full bg-white/90 px-3 py-1.5 text-gray-700 shadow hover:bg-gray-100">Close</button>
        {exchanging && <div role="status" className="absolute inset-x-0 top-0 z-10 bg-violet-100 px-4 py-2 text-center text-sm text-violet-800">Signing in to shipping…</div>}
        {error && <div role="alert" className="absolute inset-x-0 top-10 z-10 bg-red-100 px-4 py-2 text-sm text-red-800">{error}</div>}
        <iframe ref={frame} title="Peeap sign in" src={url} className="h-full w-full border-0" />
      </div>
    </div>,
    document.body,
  );
}
