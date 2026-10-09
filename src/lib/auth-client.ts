export const SHIPPING_AUTH_CLEARED = "peeap-shipping-auth-cleared";
export const SHIPPING_AUTH_CHANGED = "peeap-shipping-auth-changed";
export const EXPLICIT_LOGIN_KEY = "peeap_shipping_explicit_login";
const PEEAP_ORIGIN = "https://my.peeap.com";

export function needsExplicitLogin(): boolean {
  if (typeof window === "undefined") return false;
  try { return window.localStorage.getItem(EXPLICIT_LOGIN_KEY) === "true"; }
  catch { return false; }
}

/** Only the embedded frame navigates; the shipping page keeps its URL. */
export function peeapSignInUrl(mode: "embed" | "popup", forceLogin = false): string {
  const url = new URL("/auth/signin", PEEAP_ORIGIN);
  url.searchParams.set("mode", mode);
  url.searchParams.set("origin", "https://shipping.peeap.com");
  url.searchParams.set("targetApp", "shipping");
  if (forceLogin || needsExplicitLogin()) url.searchParams.set("prompt", "login");
  return url.toString();
}

export async function clearShippingSession(fetcher: typeof fetch = fetch): Promise<void> {
  const response = await fetcher("/api/auth/logout", { method: "POST", credentials: "same-origin", cache: "no-store" });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.success !== true) throw new Error("Could not sign out. Please try again.");
  // Do not report success or discard the current view until the server has
  // actually cleared both HttpOnly shipping sessions.
  try { window.localStorage.setItem(EXPLICIT_LOGIN_KEY, "true"); }
  catch { /* Switch account explicitly forces fresh login even with blocked storage. */ }
  for (const key of ["peeap_auth_token", "peeap_shipping_token", "peeap_shipping_customer_token", "peeap_shipping_user"]) {
    try { window.localStorage.removeItem(key); } catch { /* Storage may be blocked. */ }
    try { window.sessionStorage.removeItem(key); } catch { /* Storage may be blocked. */ }
  }
  window.dispatchEvent(new Event(SHIPPING_AUTH_CLEARED));
}

export function completeShippingSignIn(): void {
  try { window.localStorage.removeItem(EXPLICIT_LOGIN_KEY); }
  catch { /* No credential is stored in browser storage. */ }
  window.dispatchEvent(new Event(SHIPPING_AUTH_CHANGED));
}

/** Duplicate frame messages must never consume a one-time SSO token twice. */
export class ShippingHandoffGate {
  private busy = false;
  async run(exchange: () => Promise<void>): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    try { await exchange(); return true; }
    catch (error) { this.busy = false; throw error; }
  }
}
