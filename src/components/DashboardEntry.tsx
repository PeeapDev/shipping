"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PeeapAuthDialog } from "@/components/PeeapAuthDialog";

/** Keep the shipping page and its URL in place while authenticating. */
export function DashboardEntry({ children, className }: { children: React.ReactNode; className?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);

  async function enterDashboard() {
    if (checking) return;
    setChecking(true);
    try {
      const response = await fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store" });
      if (response.ok) {
        router.push("/dashboard");
        router.refresh();
        return;
      }
    } catch {
      // The session exchange will independently check authorization.
    } finally {
      setChecking(false);
    }
    setOpen(true);
  }

  return <>
    <button type="button" onClick={enterDashboard} disabled={checking} className={className}>{children}</button>
    {open && <PeeapAuthDialog onClose={() => setOpen(false)} />}
  </>;
}
