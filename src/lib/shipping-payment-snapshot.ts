type PaymentJob = { shipping_fee?: unknown; metadata?: unknown };
type CreditState = "no_credit_required" | "recorded_at_checkout" | "pending_reconciliation" | "not_verified";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function validId(value: unknown): string | null {
  return typeof value === "string" && uuid.test(value) ? value.toLowerCase() : null;
}
function cents(value: unknown): number | null {
  if (typeof value !== "number" && (typeof value !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(value))) return null;
  const amount = Number(value);
  const rounded = Math.round(amount * 100);
  return Number.isFinite(amount) && amount >= 0 && Number.isSafeInteger(rounded)
    && Math.abs(amount * 100 - rounded) < 0.000001 ? rounded : null;
}

export function shippingFeeLabel(value: unknown): string {
  const fee = cents(value);
  return fee === null ? "Fee unavailable" : "SLE " + (fee / 100).toFixed(2);
}

/** Checkout evidence only: this must never be presented as a current ledger balance. */
export function shippingPaymentSnapshot(job: PaymentJob) {
  const metadata = record(job.metadata);
  const shipping = cents(job.shipping_fee);
  // Marketplace jobs historically store the PRODUCT subtotal in metadata.total.
  // Never reuse it as the full buyer charge or infer a legacy debit from a fee.
  const products = cents(metadata.product_subtotal ?? metadata.product_total ?? metadata.total);
  const charged = cents(metadata.charge_total);
  const breakdown = products !== null && shipping !== null && charged !== null
    && Number.isSafeInteger(products + shipping) && products + shipping === charged
    ? { products: products / 100, shipping: shipping / 100, buyerCharged: charged / 100 } : null;

  const frozen = record(metadata.shipping_settlement);
  const companyUserId = frozen.currency === "SLE" ? validId(frozen.company_user_id) : null;
  const walletId = frozen.currency === "SLE" ? validId(frozen.wallet_id) : null;
  const creditTransactionId = validId(metadata.shipping_credit_transaction_id);
  let creditState: CreditState = "not_verified";
  if (shipping === 0) creditState = "no_credit_required";
  else if (metadata.shipping_fee_settled === false) creditState = "pending_reconciliation";
  else if (shipping !== null && metadata.shipping_fee_settled === true && creditTransactionId && companyUserId && walletId) {
    creditState = "recorded_at_checkout";
  }
  const creditLabel: Record<CreditState, string> = {
    no_credit_required: "No company credit needed",
    recorded_at_checkout: "Company credit recorded at checkout",
    pending_reconciliation: "Pending reconciliation",
    not_verified: "Not verified—reconciliation required",
  };
  return { breakdown, creditState, creditLabel: creditLabel[creditState],
    creditTransactionId: shipping === 0 ? null : creditTransactionId,
    companyUserId: companyUserId && walletId && shipping !== 0 ? companyUserId : null,
    walletId: companyUserId && walletId && shipping !== 0 ? walletId : null };
}
