"use client";

import { useState } from "react";
import { Truck, LogIn } from "lucide-react";
import { PeeapAuthDialog } from "@/components/PeeapAuthDialog";

export default function LoginPage() {
  const [open, setOpen] = useState(false);
  return <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
    <div className="w-full max-w-md text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 bg-violet-100 rounded-2xl mb-4"><Truck className="h-8 w-8 text-violet-600" /></div>
      <h1 className="text-2xl font-bold text-gray-900">Peeap Shipping</h1>
      <p className="text-sm text-gray-500 mt-1">Sign in with your Peeap account</p>
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm mt-8">
        <button type="button" onClick={() => setOpen(true)} className="w-full flex items-center justify-center gap-2 bg-violet-600 text-white py-3 rounded-lg font-medium hover:bg-violet-700"><LogIn className="h-5 w-5" />Continue with Peeap</button>
        <p className="text-xs text-gray-500 mt-4">Sign in or create your account securely with Peeap. Shipping access is limited to authorized staff.</p>
      </div>
    </div>
    {open && <PeeapAuthDialog onClose={() => setOpen(false)} />}
  </div>;
}
