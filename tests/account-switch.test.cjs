const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createHmac } = require("node:crypto");
const ts = require("typescript");
const { NextRequest } = require("next/server");

const root = path.resolve(__dirname, "..");
function load(relative, globals = {}, replacements = {}) {
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } });
  const module = { exports: {} };
  const context = { module, exports: module.exports, require: (name) => name in replacements ? replacements[name] : require(name), URL, Event, Buffer, console, crypto: globalThis.crypto, process: { env: {} }, ...globals };
  vm.runInNewContext(outputText, context, { filename: relative });
  return module.exports;
}
function storage(initial = {}) {
  const entries = new Map(Object.entries(initial));
  return { getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: (key) => entries.delete(key) };
}
function browser() {
  const events = [];
  const listeners = new Map();
  return {
    localStorage: storage({ peeap_auth_token: "legacy", peeap_shipping_user: "old-user" }),
    sessionStorage: storage({ peeap_shipping_token: "old-staff", peeap_shipping_customer_token: "old-customer" }),
    events,
    location: { href: "https://shipping.peeap.com/my-orders", assign: () => assert.fail("Authentication must not leave the shipping page") },
    dispatchEvent: (event) => { events.push(event.type); for (const fn of listeners.get(event.type) || []) fn(event); },
    addEventListener: (name, fn) => { const fns = listeners.get(name) || new Set(); fns.add(fn); listeners.set(name, fns); },
    removeEventListener: (name, fn) => listeners.get(name)?.delete(fn),
  };
}
const ok = () => new Response(JSON.stringify({ success: true }), { status: 200 });
const flush = async () => { await new Promise((resolve) => setImmediate(resolve)); };

test("logout expires customer, staff, and legacy user cookies server-side", async () => {
  const { POST } = load("src/app/api/auth/logout/route.ts");
  const response = await POST();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { success: true });
  assert.equal(response.cookies.getAll().length, 3);
  for (const name of ["peeap_shipping_token", "peeap_shipping_customer_token", "peeap_shipping_user"]) {
    const cookie = response.cookies.get(name);
    assert.equal(cookie.value, "");
    assert.equal(cookie.path, "/");
    assert.equal(cookie.maxAge, 0);
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.secure, true);
    assert.equal(cookie.sameSite, "lax");
  }
});

test("successful logout clears local state and requires fresh credentials without changing URL", async () => {
  const window = browser();
  const auth = load("src/lib/auth-client.ts", { window });
  let calls = 0;
  await auth.clearShippingSession(async (url, options) => {
    ++calls;
    assert.equal(url, "/api/auth/logout");
    assert.equal(options.method, "POST");
    assert.equal(options.credentials, "same-origin");
    assert.equal(options.cache, "no-store");
    return ok();
  });
  assert.equal(calls, 1);
  assert.equal(auth.needsExplicitLogin(), true);
  for (const key of ["peeap_auth_token", "peeap_shipping_user", "peeap_shipping_token", "peeap_shipping_customer_token"]) {
    assert.equal(window.localStorage.getItem(key), null);
    assert.equal(window.sessionStorage.getItem(key), null);
  }
  assert.deepEqual(window.events, [auth.SHIPPING_AUTH_CLEARED]);
  assert.equal(window.location.href, "https://shipping.peeap.com/my-orders");
  assert.equal(new URL(auth.peeapSignInUrl("embed")).searchParams.get("prompt"), "login");
});

for (const [name, response] of [
  ["HTTP failure", () => new Response(JSON.stringify({ success: true }), { status: 503 })],
  ["false envelope", () => new Response(JSON.stringify({ success: false }))],
  ["malformed envelope", () => new Response("not-json")],
]) test(`logout ${name} does not clear the session or claim success`, async () => {
  const window = browser();
  const auth = load("src/lib/auth-client.ts", { window });
  await assert.rejects(auth.clearShippingSession(async () => response()), /Could not sign out/);
  assert.equal(auth.needsExplicitLogin(), false);
  assert.equal(window.localStorage.getItem("peeap_auth_token"), "legacy");
  assert.equal(window.sessionStorage.getItem("peeap_shipping_token"), "old-staff");
  assert.deepEqual(window.events, []);
});

test("logout network failure preserves the current view and session", async () => {
  const window = browser();
  const auth = load("src/lib/auth-client.ts", { window });
  await assert.rejects(auth.clearShippingSession(async () => { throw new Error("network unavailable"); }), /network unavailable/);
  assert.equal(window.events.length, 0);
  assert.equal(window.localStorage.getItem("peeap_auth_token"), "legacy");
});

test("explicit switching works even when persistent browser storage is blocked", async () => {
  const window = browser();
  window.localStorage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
  const auth = load("src/lib/auth-client.ts", { window });
  await auth.clearShippingSession(async () => ok());
  assert.equal(window.sessionStorage.getItem("peeap_shipping_token"), null);
  assert.equal(new URL(auth.peeapSignInUrl("embed", true)).searchParams.get("prompt"), "login");
  assert.deepEqual(window.events, [auth.SHIPPING_AUTH_CLEARED]);
});

test("normal SSO remains available until explicit logout or switching", () => {
  const window = browser();
  const auth = load("src/lib/auth-client.ts", { window });
  const url = new URL(auth.peeapSignInUrl("embed"));
  assert.equal(url.origin, "https://my.peeap.com");
  assert.equal(url.pathname, "/auth/signin");
  assert.equal(url.searchParams.get("origin"), "https://shipping.peeap.com");
  assert.equal(url.searchParams.get("targetApp"), "shipping");
  assert.equal(url.searchParams.get("mode"), "embed");
  assert.equal(url.searchParams.has("prompt"), false);
  assert.equal(new URL(auth.peeapSignInUrl("popup", true)).searchParams.get("prompt"), "login");
});

test("successful shipping exchange clears the fresh-login marker and notifies the page", () => {
  const window = browser();
  const auth = load("src/lib/auth-client.ts", { window });
  window.localStorage.setItem(auth.EXPLICIT_LOGIN_KEY, "true");
  auth.completeShippingSignIn();
  assert.equal(auth.needsExplicitLogin(), false);
  assert.deepEqual(window.events, [auth.SHIPPING_AUTH_CHANGED]);
});

test("synchronous handoff gate consumes at most once, including duplicate frame messages", async () => {
  const { ShippingHandoffGate } = load("src/lib/auth-client.ts");
  const gate = new ShippingHandoffGate();
  let finish;
  let calls = 0;
  const first = gate.run(async () => { ++calls; await new Promise((resolve) => { finish = resolve; }); });
  assert.equal(await gate.run(async () => { ++calls; }), false);
  finish();
  assert.equal(await first, true);
  assert.equal(await gate.run(async () => { ++calls; }), false);
  assert.equal(calls, 1);
});

test("a failed exchange can be retried with a newly issued handoff", async () => {
  const { ShippingHandoffGate } = load("src/lib/auth-client.ts");
  const gate = new ShippingHandoffGate();
  await assert.rejects(gate.run(async () => { throw new Error("expired"); }), /expired/);
  assert.equal(await gate.run(async () => {}), true);
});

function hooks() {
  const values = [];
  const cleanup = [];
  return { values, cleanup, react: {
    createContext: () => ({ Provider: "provider" }), useContext: () => null,
    useState: (initial) => { const index = values.length; values.push(typeof initial === "function" ? initial() : initial); return [values[index], (value) => { values[index] = typeof value === "function" ? value(values[index]) : value; }]; },
    useRef: (value) => ({ current: value }),
    useEffect: (effect) => { const dispose = effect(); if (dispose) cleanup.push(dispose); },
  } };
}
const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: "fragment" };

test("late staff lookup cannot restore a previous user after logout", async () => {
  const window = browser();
  const auth = load("src/lib/auth-client.ts", { window });
  const react = hooks();
  let finish;
  const { AuthProvider } = load("src/lib/auth-context.tsx", { window, fetch: () => new Promise((resolve) => { finish = resolve; }) }, {
    react: react.react, "react/jsx-runtime": jsx, "next/navigation": { useRouter: () => ({ replace() {}, refresh() {} }) }, "@/lib/auth-client": auth,
  });
  AuthProvider({ children: null });
  window.dispatchEvent(new Event(auth.SHIPPING_AUTH_CLEARED));
  finish(new Response(JSON.stringify({ user: { id: "old-staff", role: "admin" } })));
  await flush();
  assert.equal(react.values[0], null);
  assert.equal(react.values[1], false);
  react.cleanup.forEach((dispose) => dispose());
});

test("late customer order response is discarded after logout", async () => {
  const window = browser();
  const auth = load("src/lib/auth-client.ts", { window });
  const react = hooks();
  let finish;
  const { default: MyOrdersPage } = load("src/app/my-orders/page.tsx", { window, fetch: () => new Promise((resolve) => { finish = resolve; }) }, {
    react: react.react, "react/jsx-runtime": jsx, "next/link": { default: "a" }, "lucide-react": {}, "@/components/AccountActions": { AccountActions: "actions" }, "@/lib/auth-client": auth,
  });
  MyOrdersPage();
  window.dispatchEvent(new Event(auth.SHIPPING_AUTH_CLEARED));
  finish(new Response(JSON.stringify({ orders: [{ transaction_id: "private-old-order" }], deliveries: [{ job_number: "old-job" }], customer_name: "Old customer", total: 1 })));
  await flush();
  assert.equal(react.values[0].length, 0);
  assert.equal(react.values[1].length, 0);
  assert.equal(react.values[2], null);
  assert.equal(react.values[8], true);
  react.cleanup.forEach((dispose) => dispose());
});

test("switch account clears server session before opening the dialog and never navigates away", async () => {
  const window = browser();
  const auth = load("src/lib/auth-client.ts", { window });
  const react = hooks();
  let finish;
  const moves = [];
  const { AccountActions } = load("src/components/AccountActions.tsx", {}, {
    react: react.react, "react/jsx-runtime": jsx, "next/navigation": { useRouter: () => ({ replace: (path) => moves.push(path), refresh: () => moves.push("refresh") }) }, "lucide-react": {}, "@/components/PeeapAuthDialog": { PeeapAuthDialog: "dialog" }, "@/lib/auth-client": { clearShippingSession: () => new Promise((resolve) => { finish = resolve; }) },
  });
  const view = AccountActions({});
  const switchButton = view.props.children[0].props.children[0];
  switchButton.props.onClick();
  assert.equal(react.values[2], false);
  assert.deepEqual(moves, []);
  finish();
  await flush();
  assert.equal(react.values[2], true);
  assert.deepEqual(moves, []);
});

test("embedded dialog rejects foreign frames, exchanges once, and portals outside the staff sidebar", async () => {
  const window = browser();
  const body = { style: { overflow: "" } };
  const auth = load("src/lib/auth-client.ts", { window });
  const react = hooks();
  const moves = [];
  let finish;
  let calls = 0;
  let closed = 0;
  const { PeeapAuthDialog } = load("src/components/PeeapAuthDialog.tsx", { window, document: { body }, fetch: async () => { ++calls; return await new Promise((resolve) => { finish = resolve; }); } }, {
    react: react.react, "react/jsx-runtime": jsx, "react-dom": { createPortal: (view, target) => ({ view, target }) }, "next/navigation": { useRouter: () => ({ push: (path) => moves.push(path), refresh: () => moves.push("refresh") }) }, "@/lib/auth-client": auth,
  });
  const portal = PeeapAuthDialog({ forceLogin: true, onClose: () => { ++closed; } });
  assert.equal(portal.target, body);
  const iframe = portal.view.props.children.props.children[3];
  assert.equal(new URL(iframe.props.src).searchParams.get("prompt"), "login");
  const source = {};
  iframe.props.ref.current = { contentWindow: source };
  const data = { type: "PEEAP_AUTH_SUCCESS", ssoToken: "fresh-one-time-token" };
  window.dispatchEvent({ type: "message", origin: "https://evil.example", source, data });
  window.dispatchEvent({ type: "message", origin: "https://my.peeap.com", source: {}, data });
  assert.equal(calls, 0);
  window.dispatchEvent({ type: "message", origin: "https://my.peeap.com", source, data });
  window.dispatchEvent({ type: "message", origin: "https://my.peeap.com", source, data });
  assert.equal(calls, 1);
  assert.equal(closed, 0);
  assert.deepEqual(moves, []);
  finish(new Response(JSON.stringify({ success: true, destination: "/dashboard" })));
  await flush();
  assert.equal(closed, 1);
  assert.deepEqual(moves, ["/dashboard", "refresh"]);
  react.cleanup.forEach((dispose) => dispose());
  assert.equal(body.style.overflow, "");
});

test("customer cookie cannot become staff authorization when switching", async () => {
  const secret = "unit-test-only-secret";
  const payload = Buffer.from(JSON.stringify({ sub: "customer-id", role: "customer", exp: Date.now() + 60000 })).toString("base64url");
  const token = `shp_${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
  const { middleware } = load("src/middleware.ts", { process: { env: { SHIPPING_TOKEN_SECRET: secret } } });
  const response = await middleware(new NextRequest("https://shipping.peeap.com/dashboard", { headers: { cookie: `peeap_shipping_customer_token=${token}; peeap_shipping_token=${token}` } }));
  assert.equal(response.status, 307);
  assert.equal(new URL(response.headers.get("location")).pathname, "/login");
});

test("forged unsigned shipping identity does not gain staff access", async () => {
  const { middleware } = load("src/middleware.ts", { process: { env: { SHIPPING_TOKEN_SECRET: "unit-test-only-secret" } } });
  const response = await middleware(new NextRequest("https://shipping.peeap.com/dashboard/jobs", { headers: { cookie: "peeap_shipping_user=admin; peeap_shipping_token=shp_forged" } }));
  assert.equal(response.status, 307);
  assert.equal(new URL(response.headers.get("location")).pathname, "/login");
});
