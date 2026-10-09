import { peeapSignInUrl } from "@/lib/auth-client";

/** Open a fresh, centered auth window while keeping the shipping page in place. */
export function openPeeapSignIn(forceLogin = false): Window | null {
  const url = peeapSignInUrl("popup", forceLogin);

  const width = 480;
  const height = 720;
  const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
  const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));
  const features = `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`;

  // _blank avoids reusing a previous named browser tab. The URL is opened
  // synchronously from the click so the browser can treat it as a user popup.
  const popup = window.open(url, "_blank", features);
  popup?.focus();
  return popup;
}
