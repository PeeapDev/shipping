"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, LogOut } from "lucide-react";
import { PeeapAuthDialog } from "@/components/PeeapAuthDialog";
import { clearShippingSession } from "@/lib/auth-client";

export function AccountActions({ className = "" }: { className?: string }) {
  const router = useRouter();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [switching, setSwitching] = useState(false);

  async function endSession(switchAccount: boolean) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      await clearShippingSession();
      if (switchAccount) setSwitching(true);
      else { router.replace("/"); router.refresh(); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign out. Please try again.");
    } finally { busy.current = false; setPending(false); }
  }

  return <div className={className}>
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <button type="button" disabled={pending} onClick={() => void endSession(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 px-3 py-2 font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50"><ArrowLeftRight className="h-4 w-4" />Switch account</button>
      <button type="button" disabled={pending} onClick={() => void endSession(false)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 font-semibold text-slate-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"><LogOut className="h-4 w-4" />{pending ? "Signing out…" : "Sign out"}</button>
    </div>
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    {switching && <PeeapAuthDialog forceLogin onClose={() => setSwitching(false)} />}
  </div>;
}
