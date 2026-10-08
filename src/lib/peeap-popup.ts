const PEEAP_ORIGIN = "https://my.peeap.com";

/** Open a fresh, centered auth window while keeping the shipping page in place. */
export function openPeeapSignIn(): Window | null {
  const url = new URL("/auth/signin", PEEAP_ORIGIN);
  url.searchParams.set("mode", "popup");
  url.searchParams.set("origin", window.location.origin);
  url.searchParams.set("targetApp", "shipping");

  const width = 480;
  const height = 720;
  const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
  const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));
  const features = `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`;

  // _blank avoids reusing a previous named browser tab. The URL is opened
  // synchronously from the click so the browser can treat it as a user popup.
  const popup = window.open(url.toString(), "_blank", features);
  popup?.focus();
  return popup;
}
