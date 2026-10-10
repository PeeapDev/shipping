import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type ShippingSettlement = { company_user_id: string; wallet_id: string; currency: "SLE" };

export class SettlementConfigError extends Error {
  constructor(public code: string, public status: number, message: string) { super(message); }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function configuredUserId(value: unknown): string {
  let candidate = value;
  if (typeof candidate === "string" && candidate.trim().startsWith('"')) {
    try { candidate = JSON.parse(candidate); } catch { candidate = null; }
  }
  if (typeof candidate !== "string" || !uuid.test(candidate.trim())) {
    throw new SettlementConfigError("shipping_settlement_unconfigured", 409, "Configure a valid shipping company Peeap account before accepting shipping payments.");
  }
  return candidate.trim().toLowerCase();
}

function mainDatabase(): SupabaseClient {
  const key = process.env.MAIN_SUPABASE_SERVICE_KEY;
  if (!key) throw new SettlementConfigError("shipping_settlement_unavailable", 503, "Shipping settlement verification is temporarily unavailable.");
  return createClient(process.env.MAIN_SUPABASE_URL || "https://akiecgwcxadcpqlvntmf.supabase.co", key,
    { auth: { persistSession: false } });
}

/** Only an explicitly configured owner with one active SLE primary wallet may be paid. */
export async function validateShippingBeneficiary(value: unknown, mainDb?: SupabaseClient): Promise<ShippingSettlement> {
  const userId = configuredUserId(value);
  const db = mainDb || mainDatabase();
  const { data: user, error: userError } = await db.from("users").select("id,status").eq("id", userId).maybeSingle();
  if (userError) throw new SettlementConfigError("shipping_settlement_unavailable", 503, "Could not verify the shipping company account.");
  if (!user || String(user.id).toLowerCase() !== userId || String(user.status).toUpperCase() !== "ACTIVE") {
    throw new SettlementConfigError("shipping_company_inactive", 409, "The configured shipping company account is not active.");
  }
  const { data: wallets, error: walletError } = await db.from("wallets").select("id,user_id,currency,status,wallet_type")
    .eq("user_id", userId).eq("wallet_type", "primary").eq("currency", "SLE").eq("status", "ACTIVE").limit(2);
  if (walletError) throw new SettlementConfigError("shipping_settlement_unavailable", 503, "Could not verify the shipping company wallet.");
  if (!Array.isArray(wallets) || wallets.length !== 1 || !uuid.test(String(wallets[0]?.id))
    || String(wallets[0].user_id).toLowerCase() !== userId || wallets[0].currency !== "SLE"
    || wallets[0].status !== "ACTIVE" || wallets[0].wallet_type !== "primary") {
    throw new SettlementConfigError("shipping_wallet_unavailable", 409, "The shipping company must have exactly one active SLE primary wallet.");
  }
  return { company_user_id: userId, wallet_id: String(wallets[0].id).toLowerCase(), currency: "SLE" };
}

export async function getShippingSettlement(shippingDb: SupabaseClient = supabase, mainDb?: SupabaseClient): Promise<ShippingSettlement> {
  const { data: setting, error } = await shippingDb.from("shipping_settings").select("value")
    .eq("key", "shipping_company_user_id").maybeSingle();
  if (error) throw new SettlementConfigError("shipping_settlement_unavailable", 503, "Could not load shipping settlement configuration.");
  return validateShippingBeneficiary(setting?.value, mainDb);
}

/** Admin-only diagnostics: an invalid beneficiary must not hide other settings. */
export async function shippingSettlementStatus(value: unknown, mainDb?: SupabaseClient) {
  const configured = value !== undefined && value !== null && (typeof value !== "string" || value.trim() !== "");
  let companyUserId: string | null = null;
  try {
    companyUserId = configuredUserId(value);
    const beneficiary = await validateShippingBeneficiary(companyUserId, mainDb);
    return { configured, verified: true, ...beneficiary, error: null, error_code: null };
  } catch (error) {
    const known = error instanceof SettlementConfigError;
    return { configured, verified: false, company_user_id: companyUserId, wallet_id: null, currency: "SLE" as const,
      error: known ? error.message : "Shipping settlement verification is temporarily unavailable.",
      error_code: known ? error.code : "shipping_settlement_unavailable" };
  }
}

/** Existing jobs retain their recorded beneficiary even after management changes. */
export function frozenShippingSettlement(metadata: unknown): ShippingSettlement {
  const record = (metadata as { shipping_settlement?: Partial<ShippingSettlement> } | null)?.shipping_settlement;
  if (!record || typeof record.company_user_id !== "string" || !uuid.test(record.company_user_id)
    || typeof record.wallet_id !== "string" || !uuid.test(record.wallet_id) || record.currency !== "SLE") {
    throw new SettlementConfigError("shipping_settlement_needs_reconciliation", 409, "This delivery has no verified frozen settlement beneficiary. Reconciliation is required.");
  }
  return { company_user_id: record.company_user_id.toLowerCase(), wallet_id: record.wallet_id.toLowerCase(), currency: "SLE" };
}

export function deliverySettlementReply(job: { shipping_fee?: unknown; metadata?: unknown }) {
  // Free delivery has no payable beneficiary. Missing/malformed fees are not
  // interpreted as zero, so historical paid jobs still need reconciliation.
  const fee = typeof job.shipping_fee === "number" || (typeof job.shipping_fee === "string" && job.shipping_fee.trim())
    ? Number(job.shipping_fee) : NaN;
  return fee === 0 ? { company_user_id: null, wallet_id: null, currency: "SLE" as const }
    : frozenShippingSettlement(job.metadata);
}

export function assertShippingSettlement(requested: unknown, configured: ShippingSettlement): void {
  if (requested === undefined) return;
  let frozen: ShippingSettlement;
  try { frozen = frozenShippingSettlement({ shipping_settlement: requested }); }
  catch { throw new SettlementConfigError("shipping_settlement_changed", 409, "Shipping settlement configuration changed. Refresh the payment quote before continuing."); }
  if (frozen.company_user_id !== configured.company_user_id || frozen.wallet_id !== configured.wallet_id || frozen.currency !== configured.currency) {
    throw new SettlementConfigError("shipping_settlement_changed", 409, "Shipping settlement configuration changed. Refresh the payment quote before continuing.");
  }
}
