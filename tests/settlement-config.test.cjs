const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { NextRequest } = require("next/server");
const root = path.resolve(__dirname, "..");
const company = "11111111-1111-4111-8111-111111111111";
const wallet = "22222222-2222-4222-8222-222222222222";
const buyer = "33333333-3333-4333-8333-333333333333";
const merchant = "44444444-4444-4444-8444-444444444444";
const transaction = "55555555-5555-4555-8555-555555555555";
const settlement = { company_user_id: company, wallet_id: wallet, currency: "SLE" };

function load(relative, replacements = {}, globals = {}) {
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const module = { exports: {} };
  vm.runInNewContext(outputText, { module, exports: module.exports, require: (name) => name in replacements ? replacements[name] : require(name),
    URL, Buffer, console, process: { env: {} }, ...globals }, { filename: relative });
  return module.exports;
}
function database(results = {}) {
  const calls = [];
  return { calls, from(table) {
    const operations = [];
    const call = { table, operations };
    calls.push(call);
    const result = () => typeof results[table] === "function" ? results[table](operations) : (results[table] || { data: null, error: null });
    const query = { then: (resolve, reject) => Promise.resolve(result()).then(resolve, reject) };
    for (const name of ["select", "eq", "limit", "insert", "upsert"]) query[name] = (...args) => { operations.push([name, ...args]); return query; };
    for (const name of ["single", "maybeSingle"]) query[name] = (...args) => { operations.push([name, ...args]); return Promise.resolve(result()); };
    return query;
  } };
}
function mainDatabase(overrides = {}) {
  return database({ users: { data: { id: company, status: "ACTIVE" }, error: null }, wallets: {
    data: [{ id: wallet, user_id: company, currency: "SLE", status: "ACTIVE", wallet_type: "primary" }], error: null }, ...overrides });
}
const helper = load("src/lib/settlement-config.ts", { "./supabase": { supabase: database() } });
const plain = (value) => JSON.parse(JSON.stringify(value));

test("explicit company setting resolves exactly its active SLE primary wallet", async () => {
  const main = mainDatabase();
  const shipping = database({ shipping_settings: { data: { value: JSON.stringify(company) }, error: null } });
  assert.deepEqual(plain(await helper.getShippingSettlement(shipping, main)), settlement);
  const query = main.calls.find((call) => call.table === "wallets").operations;
  for (const filter of [["eq", "user_id", company], ["eq", "wallet_type", "primary"], ["eq", "currency", "SLE"], ["eq", "status", "ACTIVE"], ["limit", 2]]) {
    assert.ok(query.some((operation) => JSON.stringify(operation) === JSON.stringify(filter)));
  }
});

test("unconfigured or malformed owner never queries a main wallet or guesses an admin", async () => {
  for (const value of [undefined, null, "", "not-a-uuid", {}, JSON.stringify({ user_id: company })]) {
    const main = mainDatabase();
    await assert.rejects(helper.validateShippingBeneficiary(value, main), (error) => error.code === "shipping_settlement_unconfigured");
    assert.equal(main.calls.length, 0);
  }
  await assert.rejects(helper.validateShippingBeneficiary(company), (error) => error.code === "shipping_settlement_unavailable" && error.status === 503);
});

test("inactive users, missing/ambiguous/wrong-owner or wrong-currency wallets fail closed", async () => {
  for (const user of [null, { id: company, status: "SUSPENDED" }, { id: buyer, status: "ACTIVE" }]) {
    const main = mainDatabase({ users: { data: user, error: null } });
    await assert.rejects(helper.validateShippingBeneficiary(company, main), (error) => error.code === "shipping_company_inactive");
    assert.equal(main.calls.some((call) => call.table === "wallets"), false);
  }
  const valid = { id: wallet, user_id: company, currency: "SLE", status: "ACTIVE", wallet_type: "primary" };
  for (const rows of [[], [valid, { ...valid, id: buyer }], [{ ...valid, currency: "USD" }], [{ ...valid, user_id: buyer }], [{ ...valid, status: "FROZEN" }], [{ ...valid, wallet_type: "merchant" }]]) {
    await assert.rejects(helper.validateShippingBeneficiary(company, mainDatabase({ wallets: { data: rows, error: null } })),
      (error) => error.code === "shipping_wallet_unavailable");
  }
});

test("settings and main database errors remain unavailable, not unconfigured or zero", async () => {
  await assert.rejects(helper.getShippingSettlement(database({ shipping_settings: { data: null, error: { code: "outage" } } }), mainDatabase()),
    (error) => error.code === "shipping_settlement_unavailable");
  for (const table of ["users", "wallets"]) {
    await assert.rejects(helper.validateShippingBeneficiary(company, mainDatabase({ [table]: { data: null, error: { code: "outage" } } })),
      (error) => error.code === "shipping_settlement_unavailable");
  }
});

test("admin settlement diagnostics distinguish unconfigured, unverified and verified without throwing", async () => {
  const unconfigured = await helper.shippingSettlementStatus(undefined, mainDatabase());
  assert.equal(unconfigured.configured, false);
  assert.equal(unconfigured.verified, false);
  assert.equal(unconfigured.wallet_id, null);
  const unavailable = await helper.shippingSettlementStatus(company, mainDatabase({ users: { data: null, error: { code: "outage" } } }));
  assert.equal(unavailable.configured, true);
  assert.equal(unavailable.verified, false);
  assert.equal(unavailable.company_user_id, company);
  assert.equal(unavailable.wallet_id, null);
  assert.equal(unavailable.error_code, "shipping_settlement_unavailable");
  const verified = await helper.shippingSettlementStatus(company, mainDatabase());
  assert.equal(verified.verified, true);
  assert.equal(verified.wallet_id, wallet);
  assert.equal(verified.error, null);
});

test("settlement-config endpoint requires S2S authentication before configuration reads", async () => {
  let reads = 0;
  for (const allowed of [false, true]) {
    const { GET } = load("src/app/api/settlement-config/route.ts", { "@/lib/auth": { authenticateServiceCall: () => allowed },
      "@/lib/settlement-config": { ...helper, getShippingSettlement: async () => { ++reads; return settlement; } } });
    const response = await GET(new NextRequest("https://shipping.peeap.com/api/settlement-config"));
    assert.equal(response.status, allowed ? 200 : 401);
    if (allowed) { assert.deepEqual(await response.json(), settlement); assert.equal(response.headers.get("cache-control"), "no-store"); }
    else assert.equal(reads, 0);
  }
  assert.equal(reads, 1);
});

function settingsRoute(db, validator = async () => settlement, auth = { sub: merchant, role: "admin" }) {
  return load("src/app/api/settings/route.ts", { "@/lib/shipping-auth": { authenticateShippingRequest: () => auth },
    "@/lib/cors": { corsHeaders: () => ({}), handleCORS: () => null }, "@/lib/supabase": { supabase: db },
    "@/lib/rbac": { auditLog: () => {} }, "@/lib/settlement-config": { ...helper, validateShippingBeneficiary: validator,
      shippingSettlementStatus: (value) => helper.shippingSettlementStatus(value, mainDatabase()) } });
}
function settingsRequest(settings, origin = "https://shipping.peeap.com") {
  return new NextRequest("https://shipping.peeap.com/api/settings", { method: "PUT", headers: { "Content-Type": "application/json", origin }, body: JSON.stringify({ settings }) });
}

test("settings reads require a current active shipping admin before exposing configuration", async () => {
  for (const staff of [{ role: "manager", is_active: true }, { role: "admin", is_active: false }, null]) {
    const db = database({ shipping_staff: { data: staff, error: null } });
    const response = await settingsRoute(db).GET(new NextRequest("https://shipping.peeap.com/api/settings"));
    assert.equal(response.status, 403);
    assert.equal(db.calls.some((call) => call.table === "shipping_settings"), false);
  }
  const db = database({ shipping_staff: { data: null, error: { code: "outage" } } });
  assert.equal((await settingsRoute(db).GET(new NextRequest("https://shipping.peeap.com/api/settings"))).status, 503);
  assert.equal((await settingsRoute(db, undefined, null).GET(new NextRequest("https://shipping.peeap.com/api/settings"))).status, 401);
});

test("settings reads retain general configuration and show explicit beneficiary verification", async () => {
  for (const value of [undefined, company, "invalid-configuration"]) {
    const settings = [{ key: "dispatch_radius_km", value: 10 }, ...(value === undefined ? [] : [{ key: "shipping_company_user_id", value }])];
    const db = database({ shipping_staff: { data: { role: "superadmin", is_active: true }, error: null }, shipping_settings: { data: settings, error: null } });
    const response = await settingsRoute(db).GET(new NextRequest("https://shipping.peeap.com/api/settings"));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const json = await response.json();
    assert.equal(json.settings.dispatch_radius_km, 10);
    assert.equal(json.settlement.configured, value !== undefined);
    assert.equal(json.settlement.verified, value === company);
    assert.equal(json.settlement.wallet_id, value === company ? wallet : null);
  }
});

test("saving company configuration validates first and checks a single batch write result", async () => {
  for (const saveError of [null, { code: "write_failed" }]) {
    const db = database({ shipping_staff: { data: { role: "admin", is_active: true }, error: null }, shipping_settings: { data: null, error: saveError } });
    let verified = 0;
    const { PUT } = settingsRoute(db, async (value) => { assert.equal(value, company); ++verified; return settlement; });
    const response = await PUT(settingsRequest({ shipping_company_user_id: company, dispatch_radius_km: 10 }));
    assert.equal(response.status, saveError ? 503 : 200);
    assert.equal(verified, 1);
    const writes = db.calls.filter((call) => call.table === "shipping_settings");
    assert.equal(writes.length, 1);
    assert.equal(writes[0].operations[0][0], "upsert");
    assert.equal(writes[0].operations[0][1].length, 2);
  }
  const db = database({ shipping_staff: { data: { role: "admin", is_active: true }, error: null } });
  const { PUT } = settingsRoute(db, async () => { throw new helper.SettlementConfigError("shipping_wallet_unavailable", 409, "No verified wallet"); });
  assert.equal((await PUT(settingsRequest({ shipping_company_user_id: company }))).status, 409);
  assert.equal(db.calls.some((call) => call.table === "shipping_settings"), false);
});

test("settings writes reject stale admin roles, deactivation, outages, anonymous and foreign origins", async () => {
  for (const staff of [{ role: "manager", is_active: true }, { role: "admin", is_active: false }, { role: "admin", is_active: "false" }, null]) {
    const db = database({ shipping_staff: { data: staff, error: null } });
    const { PUT } = settingsRoute(db);
    assert.equal((await PUT(settingsRequest({ dispatch_radius_km: 10 }))).status, 403);
    assert.equal(db.calls.some((call) => call.table === "shipping_settings"), false);
  }
  const db = database({ shipping_staff: { data: null, error: { code: "outage" } } });
  assert.equal((await settingsRoute(db).PUT(settingsRequest({ dispatch_radius_km: 10 }))).status, 503);
  assert.equal((await settingsRoute(db, undefined, null).PUT(settingsRequest({ dispatch_radius_km: 10 }))).status, 401);
  assert.equal((await settingsRoute(db).PUT(settingsRequest({ dispatch_radius_km: 10 }, "https://foreign.example"))).status, 403);
  assert.equal(db.calls.some((call) => call.table === "shipping_settings"), false);
});

function deliveryRoute(db, config, service = true) {
  const validation = load("src/lib/validation.ts");
  return load("src/app/api/deliveries/route.ts", { "@/lib/auth": { authenticateServiceCall: () => service, authenticateRequest: async () => service ? null : { sub: merchant } },
    "@/lib/shipping-auth": { authenticateShippingRequest: () => null }, "@/lib/cors": { corsHeaders: () => ({}), handleCORS: () => null },
    "@/lib/supabase": { supabase: db }, "@/lib/validation": validation,
    "@/lib/chat-client": { sendShippingUpdateToChat: async () => {} }, "@/lib/sms": { sendPickupCodeSms: () => {}, sendDeliveryCodeSms: () => {} },
    "@/lib/settlement-config": { ...helper, getShippingSettlement: config } }, { fetch: async () => new Response("{}") });
}
function deliveryRequest(frozen = settlement, fee = 12, metadata = {}) {
  return new NextRequest("https://shipping.peeap.com/api/deliveries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
    merchant_id: merchant, customer_id: buyer, customer_name: "Synthetic buyer", customer_phone: "synthetic-phone",
    pickup_address: "Synthetic pickup", delivery_address: "Synthetic delivery", transaction_id: transaction,
    shipping_fee: fee, metadata: { ...metadata, order_number: "MKT-SYNTHETIC", shipping_settlement: frozen },
  }) });
}
function existingJob(frozen = settlement) {
  return { id: transaction, merchant_id: merchant, customer_id: buyer, job_number: "SHP-SYNTHETIC", pickup_code: "1234", delivery_code: "5678",
    shipping_fee: 12, metadata: { shipping_settlement: frozen } };
}

test("new delivery freezes the verified beneficiary and rejects changed configuration before insertion", async () => {
  let inserted;
  const db = database({ delivery_jobs: (operations) => {
    const insert = operations.find((operation) => operation[0] === "insert");
    if (!insert) return { data: null, error: null };
    inserted = insert[1]; return { data: { id: transaction, ...inserted }, error: null };
  } });
  const { POST } = deliveryRoute(db, async () => settlement);
  const response = await POST(deliveryRequest());
  assert.equal(response.status, 201);
  const json = await response.json();
  for (const key of ["company_user_id", "wallet_id", "currency"]) assert.equal(json[key], settlement[key]);
  assert.deepEqual(plain(inserted.metadata.shipping_settlement), settlement);
  assert.equal(inserted.shipping_fee, 12);
  const before = db.calls.length;
  const mismatch = await POST(deliveryRequest({ ...settlement, wallet_id: buyer }));
  assert.equal(mismatch.status, 409);
  assert.equal((await mismatch.json()).error, "shipping_settlement_changed");
  assert.equal(db.calls.slice(before).some((call) => call.operations.some((operation) => operation[0] === "insert")), false);
});

test("normal retry returns the original frozen beneficiary without reading changed current settings", async () => {
  const db = database({ delivery_jobs: { data: existingJob(), error: null } });
  const { POST } = deliveryRoute(db, async () => assert.fail("A retry must not select today's beneficiary"));
  const response = await POST(deliveryRequest({ ...settlement, company_user_id: buyer }));
  assert.equal(response.status, 200);
  const json = await response.json();
  assert.equal(json.company_user_id, company);
  assert.equal(json.wallet_id, wallet);
  assert.equal(json.pickup_code, "1234");
  assert.equal(db.calls.some((call) => call.operations.some((operation) => operation[0] === "insert")), false);
});

test("concurrent unique-key retry returns the frozen job, not the current company", async () => {
  let reads = 0;
  const db = database({ delivery_jobs: (operations) => {
    if (operations.some((operation) => operation[0] === "insert")) return { data: null, error: { code: "23505" } };
    return { data: ++reads === 1 ? null : existingJob(), error: null };
  } });
  const { POST } = deliveryRoute(db, async () => ({ ...settlement, company_user_id: buyer }));
  const response = await POST(deliveryRequest({ ...settlement, company_user_id: buyer }));
  assert.equal(response.status, 200);
  const json = await response.json();
  assert.equal(json.company_user_id, company);
  assert.equal(json.wallet_id, wallet);
});

test("legacy jobs lacking a frozen beneficiary require reconciliation instead of choosing an admin", async () => {
  const db = database({ delivery_jobs: { data: { ...existingJob(), metadata: {} }, error: null } });
  const { POST } = deliveryRoute(db, async () => assert.fail("Never guess a beneficiary for legacy jobs"));
  const response = await POST(deliveryRequest());
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, "shipping_settlement_needs_reconciliation");
});

test("exactly free deliveries need no beneficiary, including legacy free-job retries", async () => {
  for (const existing of [null, { ...existingJob(), shipping_fee: "0.00", metadata: {} }]) {
    const db = database({ delivery_jobs: (operations) => {
      const insert = operations.find((operation) => operation[0] === "insert");
      return { data: insert ? { id: transaction, ...insert[1] } : existing, error: null };
    } });
    const { POST } = deliveryRoute(db, async () => assert.fail("Free jobs need no financial beneficiary"));
    const response = await POST(deliveryRequest(null, 0));
    assert.equal(response.status, existing ? 200 : 201);
    const json = await response.json();
    assert.equal(json.company_user_id, null);
    assert.equal(json.wallet_id, null);
    assert.equal(json.currency, "SLE");
  }
  for (const fee of [undefined, null, "", "invalid"]) {
    assert.throws(() => helper.deliverySettlementReply({ shipping_fee: fee, metadata: {} }),
      (error) => error.code === "shipping_settlement_needs_reconciliation");
  }
});

test("browser-created deliveries cannot assert that a shipping wallet has been paid", async () => {
  let inserted;
  const db = database({ delivery_jobs: (operations) => {
    const insert = operations.find((operation) => operation[0] === "insert");
    if (!insert) return { data: null, error: null };
    inserted = insert[1]; return { data: { id: transaction, ...inserted }, error: null };
  } });
  const { POST } = deliveryRoute(db, async () => settlement, false);
  const response = await POST(deliveryRequest(settlement, 12, { shipping_fee_settled: true, shipping_credit_transaction_id: transaction }));
  assert.equal(response.status, 201);
  assert.equal("shipping_fee_settled" in inserted.metadata, false);
  assert.equal("shipping_credit_transaction_id" in inserted.metadata, false);
  assert.deepEqual(plain(inserted.metadata.shipping_settlement), settlement);
});
