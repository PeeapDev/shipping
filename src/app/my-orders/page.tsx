"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Clock3, MapPin, Package, RefreshCw, ShoppingBag, Truck, CheckCircle2, AlertCircle, FileText, History } from "lucide-react";
import { AccountActions } from "@/components/AccountActions";
import { EXPLICIT_LOGIN_KEY, SHIPPING_AUTH_CHANGED, SHIPPING_AUTH_CLEARED } from "@/lib/auth-client";

type Order = { transaction_id: string; order_number: string | null; store_name: string; amount: number; product_total: number; delivery_fee: number; delivery_address: unknown; currency: string; payment_status: string; order_status: string; shipping_job_number: string | null; created_at: string };
type Delivery = { job_number: string; status: string; created_at: string; package_description: string | null; estimated_delivery_date: string | null; merchant_name: string | null; pickup_address: string | null; pickup_city: string | null; delivery_address: string | null; delivery_city: string | null; shipping_fee: number };
type TrackingUpdate = { id: string; status: string; message: string | null; location_name: string | null; created_at: string };
const FINISHED = new Set(["delivered", "completed", "cancelled", "failed", "returned"]);
const MOVING = new Set(["assigned", "picked_up", "in_transit"]);
const STEPS = ["Placed", "Assigned", "Collected", "In transit", "Delivered"];
const STEP_INDEX: Record<string, number> = { pending: 0, assigned: 1, picked_up: 2, in_transit: 3, delivered: 4, completed: 4 };
function pendingTooLong(d: Delivery) { return d.status === "pending" && Date.now() - new Date(d.created_at).getTime() > 14 * 86400000; }
function displayStatus(d: Delivery) { if (pendingTooLong(d)) return "Awaiting shipping update"; const names: Record<string, string> = { pending: "Preparing for pickup", assigned: "Driver assigned", picked_up: "Picked up", in_transit: "On the way", delivered: "Delivered", completed: "Delivered", cancelled: "Cancelled", failed: "Delivery issue", returning: "Returning to sender", returned: "Returned" }; return names[d.status] || d.status.replaceAll("_", " "); }
function readableDate(value: string) { return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); }

function DeliveryCard({ delivery, featured = false }: { delivery: Delivery; featured?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [updates, setUpdates] = useState<TrackingUpdate[] | null>(null);
  const [trackingError, setTrackingError] = useState("");
  const [trackingLoading, setTrackingLoading] = useState(false);
  async function showTracking() {
    if (expanded) { setExpanded(false); return; }
    setExpanded(true); setTrackingLoading(true); setTrackingError("");
    try { const response = await fetch(`/api/customer/tracking/${encodeURIComponent(delivery.job_number)}`, { cache: "no-store" }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "Tracking unavailable"); setUpdates(result.updates || []); }
    catch (cause) { setTrackingError(cause instanceof Error ? cause.message : "Tracking unavailable"); }
    finally { setTrackingLoading(false); }
  }
  const step = STEP_INDEX[delivery.status] ?? -1;
  const issue = pendingTooLong(delivery) || ["failed", "cancelled", "returned", "returning"].includes(delivery.status);
  return <article className={`rounded-2xl border bg-white p-5 shadow-sm sm:p-6 ${featured ? "border-violet-200" : "border-slate-200"}`}>
    <div className="flex flex-wrap items-start justify-between gap-4"><div className="flex items-start gap-3"><div className={`rounded-xl p-3 ${issue ? "bg-amber-100 text-amber-700" : "bg-violet-100 text-violet-700"}`}><Package className="h-6 w-6" /></div><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{delivery.job_number}</p><h3 className="mt-1 text-lg font-bold text-slate-900">{delivery.package_description || `Delivery from ${delivery.merchant_name || "Peeap Store"}`}</h3><p className="mt-1 text-sm text-slate-500">{delivery.merchant_name || "Peeap Store"} · Created {readableDate(delivery.created_at)}</p></div></div><span className={`rounded-full px-3 py-1.5 text-sm font-semibold ${issue ? "bg-amber-100 text-amber-800" : FINISHED.has(delivery.status) ? "bg-emerald-100 text-emerald-800" : "bg-violet-100 text-violet-800"}`}>{displayStatus(delivery)}</span></div>
    {step >= 0 && <div className="mt-6"><div className="grid grid-cols-5 gap-1">{STEPS.map((label, index) => <div key={label} className={`h-2 rounded-full ${index <= step ? "bg-violet-600" : "bg-slate-200"}`} />)}</div><div className="mt-2 grid grid-cols-5 text-center text-[10px] text-slate-500">{STEPS.map((label) => <span key={label}>{label}</span>)}</div></div>}
    <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-600">{delivery.delivery_city && <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" />{delivery.delivery_city}</span>}{delivery.estimated_delivery_date && !FINISHED.has(delivery.status) && !pendingTooLong(delivery) && <span className="inline-flex items-center gap-1.5"><Clock3 className="h-4 w-4" />Estimated {readableDate(delivery.estimated_delivery_date)}</span>}</div>
    {pendingTooLong(delivery) && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">No shipping update in over 14 days. This is not counted as actively moving. Check the order details or contact support.</p>}
    <button type="button" onClick={() => void showTracking()} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700">{expanded ? "Hide tracking" : "View tracking timeline"} <ArrowRight className="h-4 w-4" /></button>
    {expanded && <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4"><h4 className="font-semibold">Tracking activity</h4>{trackingLoading ? <p className="mt-3 text-sm text-slate-500">Loading scans…</p> : trackingError ? <p role="alert" className="mt-3 text-sm text-red-700">{trackingError}</p> : !updates?.length ? <p className="mt-3 text-sm text-slate-600">No carrier scans yet. Your delivery is recorded, but shipping has not posted a tracking event.</p> : <ol className="mt-4 space-y-4 border-l-2 border-violet-200 pl-4">{updates.map((update) => <li key={update.id}><p className="font-medium text-slate-900">{update.message || update.status.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-slate-500">{new Date(update.created_at).toLocaleString()}{update.location_name ? ` · ${update.location_name}` : ""}</p></li>)}</ol>}</div>}
  </article>;
}

export default function MyOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [customerName, setCustomerName] = useState<string | null>(null);
  const [totalOrders, setTotalOrders] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [section, setSection] = useState<"current" | "history" | "receipts">("current");
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [sessionEnded, setSessionEnded] = useState(false);
  const loadGeneration = useRef(0);
  function clearCustomer() {
    ++loadGeneration.current;
    setOrders([]); setDeliveries([]); setCustomerName(null); setTotalOrders(0); setSelectedJob(null);
    setLoading(false); setError(""); setSessionEnded(true);
  }
  async function load() {
    const generation = ++loadGeneration.current;
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/customer/orders?limit=50", { credentials: "same-origin", cache: "no-store" });
      if (generation !== loadGeneration.current) return;
      if (response.status === 401) { clearCustomer(); return; }
      if (!response.ok) throw new Error("We couldn't load your deliveries. Please try again.");
      const result = await response.json();
      if (generation !== loadGeneration.current) return;
      setOrders(result.orders || []); setDeliveries(result.deliveries || []); setCustomerName(result.customer_name || null); setTotalOrders(result.total || 0); setSelectedJob((current) => current || result.deliveries?.[0]?.job_number || null); setSessionEnded(false);
    }
    catch (cause) { if (generation === loadGeneration.current) setError(cause instanceof Error ? cause.message : "Could not load deliveries"); }
    finally { if (generation === loadGeneration.current) setLoading(false); }
  }
  useEffect(() => {
    const onSignedIn = () => { void load(); };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== EXPLICIT_LOGIN_KEY) return;
      if (event.newValue === "true") clearCustomer(); else void load();
    };
    void load();
    window.addEventListener(SHIPPING_AUTH_CLEARED, clearCustomer);
    window.addEventListener(SHIPPING_AUTH_CHANGED, onSignedIn);
    window.addEventListener("storage", onStorage);
    return () => {
      ++loadGeneration.current;
      window.removeEventListener(SHIPPING_AUTH_CLEARED, clearCustomer);
      window.removeEventListener(SHIPPING_AUTH_CHANGED, onSignedIn);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  const moving = deliveries.filter((d) => MOVING.has(d.status) || (d.status === "pending" && !pendingTooLong(d)));
  const attention = deliveries.filter((d) => pendingTooLong(d) || ["failed", "returning", "returned"].includes(d.status));
  const delivered = deliveries.filter((d) => ["delivered", "completed"].includes(d.status));
  const deliveryNumbers = new Set(deliveries.map((d) => d.job_number));
  const awaitingCarrier = orders.filter((o) => !deliveryNumbers.has(o.shipping_job_number || "") && o.payment_status === "COMPLETED" && o.order_status !== "cancelled");
  const selectedDelivery = deliveries.find((d) => d.job_number === selectedJob);
  const selectedOrder = selectedDelivery && orders.find((o) => o.shipping_job_number === selectedDelivery.job_number);
  return <main className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b bg-white"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6"><Link href="/" className="flex items-center gap-2 text-lg font-bold text-violet-700"><Truck className="h-6 w-6" />Peeap Shipping</Link><div className="flex flex-wrap items-center gap-4 text-sm font-semibold"><Link href="/track" className="text-slate-600 hover:text-violet-700">Track a package</Link><a href="https://my.peeap.com/orders" className="hidden text-violet-700 hover:underline sm:inline">Peeap orders</a><AccountActions /></div></div></header>
    {sessionEnded ? <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6"><h1 className="text-2xl font-bold">Signed out of shipping</h1><p className="mt-2 text-slate-600">Use Switch account above to sign in with your admin or another Peeap account. Your previous account's orders are no longer displayed.</p></section> : <>
    <section className="bg-gradient-to-br from-slate-900 via-violet-950 to-violet-800 text-white"><div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14"><p className="text-sm font-semibold text-violet-200">Your delivery space</p><div className="mt-2 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-bold sm:text-4xl">{customerName ? `Hello, ${customerName}` : "Your deliveries"}</h1><p className="mt-2 max-w-xl text-violet-100">Follow your school-store purchases from checkout to your doorstep.</p></div><button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-white/30 px-4 py-2 text-sm font-semibold hover:bg-white/10 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh</button></div><div className="mt-8 grid grid-cols-3 gap-3 sm:max-w-2xl"><div className="rounded-xl bg-white/10 p-4"><p className="text-xs text-violet-200">In progress</p><p className="mt-1 text-2xl font-bold">{moving.length}</p></div><div className="rounded-xl bg-white/10 p-4"><p className="text-xs text-violet-200">Recently delivered</p><p className="mt-1 text-2xl font-bold">{delivered.length}</p></div><div className="rounded-xl bg-white/10 p-4"><p className="text-xs text-violet-200">Needs update</p><p className="mt-1 text-2xl font-bold">{attention.length}</p></div></div></div></section>
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[230px_minmax(0,1fr)]"><aside className="self-start rounded-2xl border bg-white p-2 lg:sticky lg:top-4"><nav aria-label="Shipping dashboard" className="flex gap-2 overflow-x-auto lg:flex-col">{([ ["current", Truck, "Current delivery"], ["history", History, "Shipping history"], ["receipts", FileText, "Fee receipts"] ] as const).map(([id, Icon, name]) => <button key={id} type="button" onClick={() => setSection(id)} className={`flex min-w-max items-center gap-2 rounded-xl px-3 py-3 text-left text-sm font-semibold ${section === id ? "bg-violet-600 text-white" : "text-slate-700 hover:bg-slate-100"}`}><Icon className="h-4 w-4" />{name}</button>)}</nav></aside><div className="min-w-0 space-y-6">{error && <div role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{error}</div>}{loading ? <div className="rounded-xl border bg-white p-8 text-slate-500">Loading your delivery updates…</div> : section === "receipts" ? <section className="rounded-2xl border bg-white p-5"><h2 className="text-xl font-bold">Shipping-fee receipts</h2><p className="mt-1 text-sm text-slate-600">Fees recorded with your Peeap orders. This does not create a new charge.</p><div className="mt-5 max-h-[65vh] space-y-3 overflow-y-auto">{orders.map((o) => <article key={o.transaction_id} className="rounded-xl border p-4"><div className="flex justify-between gap-2"><strong>{o.order_number || o.transaction_id.slice(0, 8)}</strong><span className="text-sm text-slate-500">{readableDate(o.created_at)}</span></div><p className="mt-1 text-sm text-slate-500">{o.store_name} · {o.payment_status}</p><div className="mt-3 space-y-1 border-t pt-3 text-sm"><p className="flex justify-between"><span>Products</span><span>{o.currency} {(o.product_total || Math.max(0, o.amount - o.delivery_fee)).toFixed(2)}</span></p><p className="flex justify-between"><span>Shipping</span><span>{o.currency} {o.delivery_fee.toFixed(2)}</span></p><p className="flex justify-between font-bold"><span>Total charged</span><span>{o.currency} {o.amount.toFixed(2)}</span></p></div><p className="mt-2 break-all text-xs text-slate-500">Payment reference: {o.transaction_id}</p></article>)}{!orders.length && <p className="text-slate-500">No receipts yet.</p>}</div></section> : section === "history" ? <section className="rounded-2xl border bg-white p-5"><h2 className="text-xl font-bold">Shipping history</h2><p className="mt-1 text-sm text-slate-600">Choose a shipment to view its route and progress.</p><div className="mt-5 max-h-[65vh] space-y-2 overflow-y-auto">{deliveries.map((d) => <button key={d.job_number} type="button" onClick={() => { setSelectedJob(d.job_number); setSection("current"); }} className="flex w-full items-center justify-between gap-3 rounded-xl border p-4 text-left hover:border-violet-400"><span><strong className="block">{d.package_description || d.merchant_name || "Delivery"}</strong><small className="text-slate-500">{d.job_number} · {readableDate(d.created_at)}</small></span><span className="text-sm font-medium text-violet-700">{displayStatus(d)}</span></button>)}{!deliveries.length && <p className="text-slate-500">No shipments yet.</p>}</div></section> : <>
      {selectedDelivery ? <section><h2 className="mb-4 flex items-center gap-2 text-xl font-bold"><Truck className="h-5 w-5 text-violet-700" />Selected delivery</h2><DeliveryCard key={selectedDelivery.job_number} delivery={selectedDelivery} featured /><div className="mt-4 grid gap-4 md:grid-cols-2"><div className="rounded-2xl border bg-white p-5"><h3 className="flex items-center gap-2 font-bold"><MapPin className="h-5 w-5 text-violet-700" />Delivery route</h3><p className="mt-4 text-xs font-semibold uppercase text-slate-500">Pickup</p><p>{selectedDelivery.pickup_address || selectedDelivery.pickup_city || "Not recorded"}</p><p className="mt-3 text-xs font-semibold uppercase text-slate-500">Deliver to</p><p>{selectedDelivery.delivery_address || selectedDelivery.delivery_city || "Not recorded"}</p></div><div className="rounded-2xl border bg-white p-5"><h3 className="flex items-center gap-2 font-bold"><FileText className="h-5 w-5 text-violet-700" />Fee receipt</h3><p className="mt-4 flex justify-between text-sm"><span>Shipping fee</span><strong>{selectedOrder ? `${selectedOrder.currency} ${selectedOrder.delivery_fee.toFixed(2)}` : `SLE ${selectedDelivery.shipping_fee.toFixed(2)}`}</strong></p>{selectedOrder && <><p className="mt-2 flex justify-between text-sm"><span>Products</span><strong>{selectedOrder.currency} {(selectedOrder.product_total || Math.max(0, selectedOrder.amount - selectedOrder.delivery_fee)).toFixed(2)}</strong></p><p className="mt-3 flex justify-between border-t pt-3 font-bold"><span>Total charged</span><span>{selectedOrder.currency} {selectedOrder.amount.toFixed(2)}</span></p><p className="mt-2 break-all text-xs text-slate-500">Payment reference: {selectedOrder.transaction_id}</p></>}<button type="button" onClick={() => setSection("receipts")} className="mt-4 text-sm font-semibold text-violet-700">All receipts →</button></div></div></section> : <section className="rounded-2xl border bg-white p-8 text-center"><Package className="mx-auto h-10 w-10 text-violet-600" /><h2 className="mt-3 text-xl font-bold">No carrier shipment yet</h2><p className="mt-2 text-slate-600">When a store creates a shipping job, its tracking will appear here.</p><a href="https://store.peeap.com" className="mt-5 inline-flex rounded-lg bg-violet-600 px-5 py-2.5 font-semibold text-white">Browse school essentials</a></section>}
      {awaitingCarrier.length > 0 && <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5"><h2 className="flex items-center gap-2 font-bold text-blue-900"><ShoppingBag className="h-5 w-5" />Orders awaiting carrier tracking</h2><p className="mt-2 text-sm text-blue-800">{awaitingCarrier.length} paid {awaitingCarrier.length === 1 ? "purchase has" : "purchases have"} no matching shipping job. Older PEP references are Peeap order references, not live carrier scans.</p><div className="mt-4 space-y-2">{awaitingCarrier.slice(0, 5).map((o) => <a key={o.transaction_id} href={`https://my.peeap.com/orders/${encodeURIComponent(o.transaction_id)}`} className="flex items-center justify-between gap-3 rounded-lg bg-white px-4 py-3 text-sm text-blue-900 hover:underline"><span>{o.store_name} · {o.order_number || o.transaction_id.slice(0, 8)} <span className="text-blue-600">({String(o.order_status).replaceAll("_", " ")})</span></span><ArrowRight className="h-4 w-4 shrink-0" /></a>)}</div>{awaitingCarrier.length > 5 && <p className="mt-3 text-xs text-blue-800">Showing 5 recent orders; the rest are in purchase history below.</p>}</section>}
      {deliveries.length > 1 && <button type="button" onClick={() => setSection("history")} className="flex w-full items-center justify-between rounded-xl border bg-white p-4 text-left font-semibold text-violet-700">View all {deliveries.length} shipments in shipping history <ArrowRight className="h-4 w-4" /></button>}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4"><p className="text-sm text-slate-600">{totalOrders} Peeap store {totalOrders === 1 ? "purchase" : "purchases"} on record</p><a href="https://my.peeap.com/orders" className="text-sm font-semibold text-violet-700 hover:underline">View purchase history in Peeap →</a></section>
    </>}</div></div>
    </>}
  </main>;
}
