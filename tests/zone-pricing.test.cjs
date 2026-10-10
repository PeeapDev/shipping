const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { NextRequest } = require("next/server");

const root = path.resolve(__dirname, "..");
function load(relative, replacements = {}, globals = {}) {
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } });
  const module = { exports: {} };
  vm.runInNewContext(outputText, { module, exports: module.exports, require: (name) => name in replacements ? replacements[name] : require(name), URL, Buffer, console: { error() {} }, process: { env: { SHIPPING_TOKEN_SECRET: "test-only-shipping-zone-key" } }, ...globals }, { filename: relative });
  return module.exports;
}
const plain = (value) => JSON.parse(JSON.stringify(value));
const pricing = load("src/lib/zone-pricing.ts");
const auth = load("src/lib/shipping-auth.ts");
const zoneId = "f6695d61-3ed8-4ad7-9410-2bc3fd8e3cb1";
const userId = "9b0a40ac-7e3b-4056-9646-f401efc953df";
const flat = () => ({ name: "City-wide", city: "Freetown", base_fee: 12, per_km_fee: 0, min_fee: 12, max_fee: 12, estimated_time_minutes: 60, is_active: true });
const zone = () => ({ id: zoneId, ...flat(), created_at: "2026-10-09T00:00:00Z" });
function token(role = "admin") { return auth.createShippingToken({ sub: userId, role, email: "admin@example.test", iat: Date.now(), exp: Date.now() + 60000 }); }

function setup(options = {}) {
  const calls = [], audits = [];
  const state = { staff: { role: "admin", is_active: true }, current: zone(), written: zone(), publicZones: [zone()], ...options };
  const supabase = { from(table) {
    const call = { table, operation: "select", filters: [], selected: null };
    calls.push(call);
    const builder = {
      select(columns) { call.selected = columns; return builder; },
      order(field) { (call.orders ||= []).push(field); return builder; },
      eq(field, value) { call.filters.push(["eq", field, value]); return builder; },
      is(field, value) { call.filters.push(["is", field, value]); return builder; },
      ilike(field, value) { call.filters.push(["ilike", field, value]); return builder; },
      insert(value) { call.operation = "insert"; call.value = value; return builder; },
      update(value) { call.operation = "update"; call.value = value; return builder; },
      delete() { call.operation = "delete"; return builder; },
      result(single) {
        if (table === "shipping_staff") return { data: state.staff, error: state.staffError || null };
        if (call.operation !== "select") return { data: state.written, error: state.writeError || null };
        return { data: single ? state.current : state.publicZones, error: state.readError || null };
      },
      maybeSingle() { return Promise.resolve(builder.result(true)); },
      single() { return Promise.resolve(builder.result(true)); },
      then(resolve, reject) { return Promise.resolve(builder.result(false)).then(resolve, reject); },
    };
    return builder;
  } };
  const route = load("src/app/api/zones/route.ts", {
    "@/lib/supabase": { supabase }, "@/lib/shipping-auth": auth,
    "@/lib/cors": { corsHeaders: () => ({}), handleCORS: () => null },
    "@/lib/zone-pricing": pricing, "@/lib/rbac": { auditLog: (entry) => audits.push(entry) },
  });
  return { route, calls, audits, state, writes: () => calls.filter((call) => call.table === "delivery_zones" && call.operation !== "select") };
}
function request(method, body, options = {}) {
  const headers = { "content-type": "application/json", ...options.headers };
  if (options.signed !== false) headers.cookie = `peeap_shipping_token=${token(options.role)}`;
  return new NextRequest(`https://shipping.peeap.com/api/zones${options.query || ""}`, { method, headers, ...(body === undefined ? {} : { body: options.raw ? body : JSON.stringify(body) }) });
}

test("flat fee uses existing columns with no distance supplement or schema change", () => {
  assert.deepEqual(plain(pricing.flatZonePrice(12.5)), { base_fee: 12.5, per_km_fee: 0, min_fee: 12.5, max_fee: 12.5 });
  assert.equal(pricing.isFlatZone(flat()), true);
  assert.equal(pricing.isFlatZone({ ...flat(), max_fee: 20 }), false);
  assert.equal(pricing.isFlatZone({ base_fee: null, per_km_fee: null, min_fee: null, max_fee: null }), false);
});
test("new flat-rate draft requires an explicit fee and does not invent a live rate", () => {
  const draft = pricing.zonePricingDraft();
  assert.equal(draft.mode, "flat");
  assert.equal(draft.flat_fee, "");
  assert.equal(pricing.zonePricingFromDraft({ ...draft, name: "City-wide", city: "Freetown" }).success, false);
  const result = pricing.zonePricingFromDraft({ ...draft, name: "City-wide", city: "Freetown", flat_fee: "0" });
  assert.equal(result.success, true);
  assert.equal(result.data.base_fee, 0);
});
test("opening an existing distance rate preserves its mode and amounts", () => {
  const legacy = { ...flat(), per_km_fee: 2, min_fee: 5, max_fee: 100 };
  const draft = pricing.zonePricingDraft(legacy);
  assert.equal(draft.mode, "distance");
  assert.deepEqual(plain(pricing.zonePricingFromDraft(draft).data), legacy);
});
test("switching a draft to flat explicitly clamps minimum and maximum", () => {
  const draft = pricing.zonePricingDraft({ ...flat(), per_km_fee: 2, min_fee: 5, max_fee: 100 });
  const result = pricing.zonePricingFromDraft({ ...draft, mode: "flat", flat_fee: "19.50" });
  assert.equal(result.success, true);
  assert.deepEqual(plain(result.data), { ...flat(), base_fee: 19.5, min_fee: 19.5, max_fee: 19.5 });
});
for (const [label, value] of [["negative", -1], ["infinite", Infinity], ["not-a-number", NaN], ["above limit", pricing.MAX_ZONE_FEE + 1], ["fractional cent", 12.345], ["numeric string", "12"]]) {
  test(`fee rejects ${label}`, () => assert.equal(pricing.zoneCreateSchema.safeParse({ ...flat(), per_km_fee: value }).success, false));
}
test("minimum, base and maximum must be consistent", () => {
  for (const change of [{ min_fee: 13 }, { max_fee: 11 }, { base_fee: 11 }, { base_fee: 13 }]) assert.equal(pricing.zoneCreateSchema.safeParse({ ...flat(), ...change }).success, false);
});
test("labels reject wildcard, escape and control input, and bodies reject arbitrary fields", () => {
  for (const city of ["", "Freetown%", "Freetown_", "Freetown\\", "Free\ntown"]) assert.equal(pricing.zoneCreateSchema.safeParse({ ...flat(), city }).success, false);
  assert.equal(pricing.zoneCreateSchema.safeParse({ ...flat(), owner_id: userId }).success, false);
  assert.equal(pricing.zoneUpdateSchema.safeParse({ id: zoneId, role: "admin" }).success, false);
  assert.equal(pricing.zoneUpdateSchema.safeParse({ id: zoneId }).success, false);
});
test("ETA and active status are strictly validated", () => {
  for (const estimated_time_minutes of [0, 1.5, 10081, Infinity, "60"]) assert.equal(pricing.zoneCreateSchema.safeParse({ ...flat(), estimated_time_minutes }).success, false);
  assert.equal(pricing.zoneCreateSchema.safeParse({ ...flat(), is_active: "true" }).success, false);
});
test("partial update validates the full existing range and accepts only trusted DB decimal strings", () => {
  const current = { ...flat(), base_fee: "12.00", per_km_fee: "0.00", min_fee: "12.00", max_fee: "12.00" };
  assert.equal(pricing.mergedZonePricing(current, { is_active: false }).success, true);
  assert.equal(pricing.mergedZonePricing(current, { max_fee: 11 }).success, false);
  assert.equal(pricing.mergedZonePricing(current, { base_fee: "12" }).success, false);
  assert.equal(pricing.mergedZonePricing({ ...current, min_fee: null }, { is_active: false }).success, false);
});

for (const method of ["POST", "PUT", "DELETE"]) {
  test(`${method} refuses legacy main/service authorization without a signed shipping session`, async () => {
    const context = setup();
    const response = await context.route[method](request(method, method === "DELETE" ? undefined : flat(), { signed: false, headers: { authorization: "Bearer legacy-main-or-service-token" }, query: method === "DELETE" ? `?id=${zoneId}` : "" }));
    assert.equal(response.status, 401);
    assert.equal(context.calls.length, 0);
    assert.equal(context.audits.length, 0);
  });
}
for (const [label, staff, status] of [["inactive admin", { role: "admin", is_active: false }, 403], ["malformed active status", { role: "admin", is_active: "true" }, 403], ["dispatcher", { role: "dispatcher", is_active: true }, 403], ["manager", { role: "manager", is_active: true }, 403], ["missing staff", null, 403]]) {
  test(`pricing writes reject ${label}, regardless of token admin claim`, async () => {
    const context = setup({ staff });
    const response = await context.route.POST(request("POST", flat()));
    assert.equal(response.status, status);
    assert.equal(context.writes().length, 0);
    assert.equal(context.audits.length, 0);
    assert.deepEqual(context.calls[0].filters, [["eq", "user_id", userId]]);
  });
}
test("staff authorization database failure is fail-closed", async () => {
  const context = setup({ staffError: new Error("private database detail") });
  const response = await context.route.POST(request("POST", flat()));
  assert.equal(response.status, 503);
  assert.equal(context.writes().length, 0);
  assert.equal(JSON.stringify(await response.json()).includes("private"), false);
});
test("current active admin record is authoritative, including superadmin", async () => {
  for (const role of ["admin", "superadmin"]) {
    const context = setup({ staff: { role, is_active: true } });
    const response = await context.route.POST(request("POST", flat(), { role: "dispatcher" }));
    assert.equal(response.status, 201);
    assert.equal(context.writes().length, 1);
    assert.equal(context.audits[0].actorRole, role);
  }
});
test("cross-origin cookie writes are rejected before authorization or mutation", async () => {
  for (const headers of [{ origin: "https://store.peeap.com" }, { "sec-fetch-site": "cross-site" }, { origin: "null" }]) {
    const context = setup();
    const response = await context.route.POST(request("POST", flat(), { headers }));
    assert.equal(response.status, 403);
    assert.equal(context.calls.length, 0);
  }
});
test("malformed and arbitrary POST input does not reach delivery_zones", async () => {
  for (const input of [null, { ...flat(), user_id: userId }, { ...flat(), base_fee: "12" }, { ...flat(), max_fee: 11 }]) {
    const context = setup();
    const response = await context.route.POST(request("POST", input));
    assert.equal(response.status, 400);
    assert.equal(context.writes().length, 0);
    assert.equal(context.audits.length, 0);
  }
  const context = setup();
  assert.equal((await context.route.POST(request("POST", "not-json", { raw: true }))).status, 400);
  assert.equal(context.writes().length, 0);
});
test("POST stores only validated explicit prices and trimmed labels then audits", async () => {
  const context = setup();
  const response = await context.route.POST(request("POST", { ...flat(), name: " City-wide ", city: " Freetown " }, { headers: { origin: "https://shipping.peeap.com" } }));
  assert.equal(response.status, 201);
  assert.deepEqual(plain(context.writes()[0].value), flat());
  assert.equal(context.audits.length, 1);
  assert.equal(context.audits[0].resourceId, zoneId);
});
test("invalid PUT merge cannot mutate the price range", async () => {
  const context = setup();
  const response = await context.route.PUT(request("PUT", { id: zoneId, max_fee: 11 }));
  assert.equal(response.status, 400);
  assert.equal(context.writes().length, 0);
  assert.equal(context.audits.length, 0);
});
test("PUT compares every prior zone value atomically before applying the validated patch", async () => {
  const context = setup();
  const response = await context.route.PUT(request("PUT", { id: zoneId, is_active: false }));
  assert.equal(response.status, 200);
  assert.deepEqual(plain(context.writes()[0].value), { is_active: false });
  assert.equal(context.writes()[0].filters.length, 1 + pricing.ZONE_FIELDS.length);
  assert.deepEqual(context.writes()[0].filters[0], ["eq", "id", zoneId]);
  for (const field of pricing.ZONE_FIELDS) assert.ok(context.writes()[0].filters.some(([operator, name, value]) => operator === "eq" && name === field && value === context.state.current[field]));
  assert.equal(context.audits.length, 1);
});
test("concurrent pricing change returns conflict instead of claiming success", async () => {
  const context = setup({ written: null });
  const response = await context.route.PUT(request("PUT", { id: zoneId, is_active: false }));
  assert.equal(response.status, 409);
  assert.equal(context.audits.length, 0);
});
test("PUT unknown zone and DELETE unknown zone return not found", async () => {
  const update = setup({ current: null });
  assert.equal((await update.route.PUT(request("PUT", { id: zoneId, is_active: false }))).status, 404);
  assert.equal(update.writes().length, 0);
  const deletion = setup({ written: null });
  assert.equal((await deletion.route.DELETE(request("DELETE", undefined, { query: `?id=${zoneId}` }))).status, 404);
  assert.equal(deletion.audits.length, 0);
});
test("DELETE validates exact UUID and audits only a successful deletion", async () => {
  const invalid = setup();
  assert.equal((await invalid.route.DELETE(request("DELETE", undefined, { query: "?id=%25" }))).status, 400);
  assert.equal(invalid.writes().length, 0);
  const valid = setup();
  assert.equal((await valid.route.DELETE(request("DELETE", undefined, { query: `?id=${zoneId}` }))).status, 200);
  assert.deepEqual(valid.writes()[0].filters, [["eq", "id", zoneId]]);
  assert.equal(valid.audits[0].action, "delete_zone_pricing");
});
test("public pricing reads include active zones only and an exact case-insensitive city", async () => {
  const context = setup();
  const response = await context.route.GET(request("GET", undefined, { signed: false, query: "?city=Freetown" }));
  assert.equal(response.status, 200);
  assert.equal(context.calls.length, 1);
  assert.deepEqual(context.calls[0].filters, [["eq", "is_active", true], ["ilike", "city", "Freetown"]]);
  assert.equal(context.writes().length, 0);
});
test("inactive pricing cannot be enumerated without current active admin access", async () => {
  const unauth = setup();
  assert.equal((await unauth.route.GET(request("GET", undefined, { signed: false, query: "?all=true" }))).status, 401);
  assert.equal(unauth.calls.length, 0);
  const forbidden = setup({ staff: { role: "manager", is_active: true } });
  assert.equal((await forbidden.route.GET(request("GET", undefined, { query: "?all=true" }))).status, 403);
  assert.equal(forbidden.calls.length, 1);
  const admin = setup();
  assert.equal((await admin.route.GET(request("GET", undefined, { query: "?all=true" }))).status, 200);
  assert.equal(admin.calls[1].filters.some(([, field]) => field === "is_active"), false);
});
test("public city filter cannot expand into wildcard results", async () => {
  const context = setup();
  assert.equal((await context.route.GET(request("GET", undefined, { signed: false, query: "?city=Free%25" }))).status, 400);
  assert.equal(context.calls.length, 0);
});
test("database pricing failures never expose internals or record successful audits", async () => {
  for (const method of ["POST", "PUT", "DELETE"]) {
    const context = setup({ writeError: new Error("private service key and SQL") });
    const response = await context.route[method](request(method, method === "POST" ? flat() : method === "PUT" ? { id: zoneId, is_active: false } : undefined, { query: method === "DELETE" ? `?id=${zoneId}` : "" }));
    assert.equal(response.status, 500);
    assert.equal(JSON.stringify(await response.json()).includes("private"), false);
    assert.equal(context.audits.length, 0);
  }
});

const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: "fragment" };
function hooks() {
  const slots = [];
  let cursor = 0;
  return { reset: () => { cursor = 0; }, react: {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial; return [slots[index], (value) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }]; },
    useRef(value) { const index = cursor++; return slots[index] ||= { current: value }; },
  } };
}
function find(node, predicate) {
  if (!node || typeof node !== "object") return null;
  if (predicate(node)) return node;
  for (const child of Array.isArray(node) ? node : [node.props?.children]) { const result = find(child, predicate); if (result) return result; }
  return null;
}
function formContext(initial, fetch) {
  const react = hooks();
  let saved = 0;
  const { ZonePricingForm } = load("src/components/ZonePricingForm.tsx", { react: react.react, "react/jsx-runtime": jsx, "lucide-react": {}, "@/lib/zone-pricing": pricing }, { fetch });
  return { render() { react.reset(); return ZonePricingForm({ zone: initial, onClose() {}, onSaved() { ++saved; } }); }, saved: () => saved };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
test("flat form visibly defaults to blank explicit input and blocks incomplete submission", async () => {
  let calls = 0;
  const context = formContext(null, () => { ++calls; });
  const view = context.render();
  assert.equal(find(view, (node) => node.type === "input" && node.props.placeholder === "Enter your fee").props.value, "");
  await view.props.onSubmit({ preventDefault() {} });
  await flush();
  assert.equal(calls, 0);
  assert.equal(context.saved(), 0);
  assert.ok(find(context.render(), (node) => node.props?.role === "alert"));
});
test("pricing form submits validated cookie-authenticated data once even on double click", async () => {
  let finish;
  const calls = [];
  const context = formContext(zone(), (url, options) => { calls.push({ url, options }); return new Promise((resolve) => { finish = resolve; }); });
  const view = context.render();
  view.props.onSubmit({ preventDefault() {} });
  view.props.onSubmit({ preventDefault() {} });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/zones");
  assert.equal(calls[0].options.credentials, "same-origin");
  assert.equal(calls[0].options.method, "PUT");
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(calls[0].options.body), { id: zoneId, ...flat() });
  finish(new Response(JSON.stringify({ zone: zone() })));
  await flush();
  assert.equal(context.saved(), 1);
});
test("pricing form preserves server errors and does not dismiss a failed save", async () => {
  const context = formContext(zone(), async () => new Response(JSON.stringify({ error: "Pricing changed while you were editing" }), { status: 409 }));
  context.render().props.onSubmit({ preventDefault() {} });
  await flush();
  assert.equal(context.saved(), 0);
  assert.equal(find(context.render(), (node) => node.props?.role === "alert").props.children, "Pricing changed while you were editing");
});
