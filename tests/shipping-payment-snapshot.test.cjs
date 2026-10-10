const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "src/lib/shipping-payment-snapshot.ts"), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
const loaded = { exports: {} };
vm.runInNewContext(outputText, { module: loaded, exports: loaded.exports });
const { shippingPaymentSnapshot, shippingFeeLabel } = loaded.exports;
const company = "11111111-1111-4111-8111-111111111111";
const wallet = "22222222-2222-4222-8222-222222222222";
const credit = "33333333-3333-4333-8333-333333333333";
const plain = (value) => JSON.parse(JSON.stringify(value));
const paid = () => ({ shipping_fee: 12, metadata: { total: 10.69, charge_total: 22.69, shipping_fee_settled: true,
  shipping_credit_transaction_id: credit, shipping_settlement: { company_user_id: company, wallet_id: wallet, currency: "SLE" } } });

test("products plus shipping show the exact charged amount, never the product-only total", () => {
  const result = shippingPaymentSnapshot(paid());
  assert.deepEqual(plain(result.breakdown), { products: 10.69, shipping: 12, buyerCharged: 22.69 });
  assert.equal(result.creditState, "recorded_at_checkout");
  assert.equal(result.creditLabel, "Company credit recorded at checkout");
  assert.equal(result.creditTransactionId, credit);
  assert.equal(result.companyUserId, company);
  assert.equal(result.walletId, wallet);
});
test("explicit subtotal aliases and stored decimal strings retain cent precision", () => {
  for (const field of ["product_subtotal", "product_total", "total"]) {
    assert.deepEqual(plain(shippingPaymentSnapshot({ shipping_fee: "12.00", metadata: { [field]: "10.69", charge_total: "22.69" } }).breakdown),
      { products: 10.69, shipping: 12, buyerCharged: 22.69 });
  }
  assert.equal(shippingFeeLabel(10.69), "SLE 10.69");
  assert.equal(shippingFeeLabel("12.00"), "SLE 12.00");
  assert.equal(shippingFeeLabel(0), "SLE 0.00");
});
test("missing, malformed, negative, fractional-cent and mismatched totals never invent a debit", () => {
  for (const value of [undefined, null, "", true, {}, [], NaN, Infinity, -1, 10.691, "10.691", "1e1", " 10.69", 22.68]) {
    assert.equal(shippingPaymentSnapshot({ ...paid(), metadata: { ...paid().metadata, charge_total: value } }).breakdown, null);
  }
  assert.equal(shippingPaymentSnapshot({ shipping_fee: 12, metadata: { total: 10.69 } }).breakdown, null);
  assert.equal(shippingPaymentSnapshot({ shipping_fee: 12, metadata: { product_subtotal: "bad", total: 10.69, charge_total: 22.69 } }).breakdown, null);
  for (const value of [undefined, null, "", true, NaN, Infinity, -1, 12.001]) assert.equal(shippingFeeLabel(value), "Fee unavailable");
});
test("only strict settled boolean and valid frozen SLE identities record a checkout credit", () => {
  for (const value of [undefined, null, "true", 1, {}, []]) {
    const result = shippingPaymentSnapshot({ ...paid(), metadata: { ...paid().metadata, shipping_fee_settled: value } });
    assert.equal(result.creditState, "not_verified");
  }
  for (const metadata of [
    { shipping_credit_transaction_id: "not-a-uuid" },
    { shipping_credit_transaction_id: undefined },
    { shipping_settlement: null },
    { shipping_settlement: { company_user_id: company, wallet_id: wallet, currency: "USD" } },
    { shipping_settlement: { company_user_id: "bad", wallet_id: wallet, currency: "SLE" } },
    { shipping_settlement: { company_user_id: company, wallet_id: "bad", currency: "SLE" } },
  ]) assert.equal(shippingPaymentSnapshot({ ...paid(), metadata: { ...paid().metadata, ...metadata } }).creditState, "not_verified");
  const invalid = shippingPaymentSnapshot({ ...paid(), shipping_fee: null });
  assert.equal(invalid.creditState, "not_verified");
});
test("failed checkout credit remains pending; absent legacy evidence remains unverified", () => {
  assert.equal(shippingPaymentSnapshot({ ...paid(), metadata: { ...paid().metadata, shipping_fee_settled: false } }).creditLabel, "Pending reconciliation");
  const legacy = shippingPaymentSnapshot({ shipping_fee: 12, metadata: { total: 10.69 } });
  assert.equal(legacy.creditLabel, "Not verified—reconciliation required");
  assert.equal(legacy.creditTransactionId, null);
  assert.equal(legacy.companyUserId, null);
  assert.equal(legacy.walletId, null);
});
test("exact free shipping needs no company credit; malformed values are not free", () => {
  for (const shipping_fee of [0, "0.00"]) {
    const result = shippingPaymentSnapshot({ ...paid(), shipping_fee, metadata: { ...paid().metadata, charge_total: 10.69 } });
    assert.equal(result.creditState, "no_credit_required");
    assert.equal(result.creditTransactionId, null);
    assert.equal(result.companyUserId, null);
    assert.equal(result.walletId, null);
  }
  for (const shipping_fee of [null, "", false, undefined, [], "-0"]) assert.equal(shippingPaymentSnapshot({ shipping_fee }).creditState, "not_verified");
});
test("UI exposes the snapshot without claiming a current verified balance or changing status controls", () => {
  const page = fs.readFileSync(path.join(root, "src/app/dashboard/jobs/page.tsx"), "utf8");
  assert.match(page, /shippingPaymentSnapshot\(selectedJob\)/);
  assert.match(page, /Checkout payment snapshot/);
  assert.match(page, /Buyer charged/);
  assert.match(page, /not a current wallet balance/);
  assert.match(page, /shippingFeeLabel\(job\.shipping_fee\)/);
  assert.match(page, /shippingFeeLabel\(selectedJob\.shipping_fee\)/);
  assert.match(page, /updateStatus\(selectedJob\.id, nextStatus/);
});
