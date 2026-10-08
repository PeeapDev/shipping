"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Clock3, MapPin, Package, RefreshCw, ShoppingBag, Truck, CheckCircle2, AlertCircle } from "lucide-react";

type Order = { transaction_id: string; order_number: string | null; store_name: string; amount: number; currency: string; payment_status: string; order_status: string; shipping_job_number: string | null; created_at: string };
type Delivery = { job_number: string; status: string; created_at: string; package_description: string | null; estimated_delivery_date: string | null; merchant_name: string | null; delivery_city: string | null };
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
  async function load() {
    setLoading(true); setError("");
    try { const response = await fetch("/api/customer/orders?limit=50", { cache: "no-store" }); if (response.status === 401) { window.location.assign("/login?redirect=%2Fmy-orders"); return; } if (!response.ok) throw new Error("We couldn't load your deliveries. Please try again."); const result = await response.json(); setOrders(result.orders || []); setDeliveries(result.deliveries || []); setCustomerName(result.customer_name || null); setTotalOrders(result.total || 0); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load deliveries"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  const moving = deliveries.filter((d) => MOVING.has(d.status) || (d.status === "pending" && !pendingTooLong(d)));
  const attention = deliveries.filter((d) => pendingTooLong(d) || ["failed", "returning", "returned"].includes(d.status));
  const delivered = deliveries.filter((d) => ["delivered", "completed"].includes(d.status));
  const unshipped = orders.filter((o) => !o.shipping_job_number && o.payment_status === "COMPLETED" && o.order_status !== "cancelled");
  const deliveryNumbers = new Set(deliveries.map((d) => d.job_number));
  return <main className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6"><Link href="/" className="flex items-center gap-2 text-lg font-bold text-violet-700"><Truck className="h-6 w-6" />Peeap Shipping</Link><div className="flex items-center gap-4 text-sm font-semibold"><Link href="/track" className="text-slate-600 hover:text-violet-700">Track a package</Link><a href="https://my.peeap.com/orders" className="hidden text-violet-700 hover:underline sm:inline">Peeap orders</a></div></div></header>
    <section className="bg-gradient-to-br from-slate-900 via-violet-950 to-violet-800 text-white"><div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14"><p className="text-sm font-semibold text-violet-200">Your delivery space</p><div className="mt-2 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-bold sm:text-4xl">{customerName ? `Hello, ${customerName}` : "Your deliveries"}</h1><p className="mt-2 max-w-xl text-violet-100">Follow your school-store purchases from checkout to your doorstep.</p></div><button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-white/30 px-4 py-2 text-sm font-semibold hover:bg-white/10 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh</button></div><div className="mt-8 grid grid-cols-3 gap-3 sm:max-w-2xl"><div className="rounded-xl bg-white/10 p-4"><p className="text-xs text-violet-200">In progress</p><p className="mt-1 text-2xl font-bold">{moving.length}</p></div><div className="rounded-xl bg-white/10 p-4"><p className="text-xs text-violet-200">Recently delivered</p><p className="mt-1 text-2xl font-bold">{delivered.length}</p></div><div className="rounded-xl bg-white/10 p-4"><p className="text-xs text-violet-200">Needs update</p><p className="mt-1 text-2xl font-bold">{attention.length}</p></div></div></div></section>
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-8 sm:px-6 sm:py-10">{error && <div role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{error}</div>}{loading ? <div className="rounded-xl border bg-white p-8 text-slate-500">Loading your delivery updates…</div> : <>
      {moving[0] ? <section><h2 className="mb-4 flex items-center gap-2 text-xl font-bold"><Truck className="h-5 w-5 text-violet-700" />Your next delivery</h2><DeliveryCard delivery={moving[0]} featured /></section> : <section className="rounded-2xl border bg-white p-8 text-center"><Package className="mx-auto h-10 w-10 text-violet-600" /><h2 className="mt-3 text-xl font-bold">Nothing on the road right now</h2><p className="mt-2 text-slate-600">When a store prepares your order for delivery, it will appear here.</p><a href="https://store.peeap.com" className="mt-5 inline-flex rounded-lg bg-violet-600 px-5 py-2.5 font-semibold text-white">Browse school essentials</a></section>}
      {moving.length > 1 && <section><h2 className="mb-4 text-xl font-bold">Other deliveries in progress</h2><div className="grid gap-4 md:grid-cols-2">{moving.slice(1).map((d) => <DeliveryCard key={d.job_number} delivery={d} />)}</div></section>}
      {unshipped.length > 0 && <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5"><h2 className="flex items-center gap-2 font-bold text-blue-900"><ShoppingBag className="h-5 w-5" />{unshipped.length} paid {unshipped.length === 1 ? "order" : "orders"} awaiting dispatch</h2><p className="mt-2 text-sm text-blue-800">There is no shipping job yet. Check the full order details in Peeap.</p></section>}
      {attention.length > 0 && <section><h2 className="mb-4 flex items-center gap-2 text-xl font-bold"><AlertCircle className="h-5 w-5 text-amber-600" />Deliveries needing an update</h2><div className="grid gap-4 md:grid-cols-2">{attention.map((d) => <DeliveryCard key={d.job_number} delivery={d} />)}</div></section>}
      {delivered.length > 0 && <section><h2 className="mb-4 flex items-center gap-2 text-xl font-bold"><CheckCircle2 className="h-5 w-5 text-emerald-600" />Delivered packages</h2><div className="grid gap-4 md:grid-cols-2">{delivered.slice(0, 6).map((d) => <DeliveryCard key={d.job_number} delivery={d} />)}</div></section>}
      <section><div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-bold">Purchase history</h2><p className="mt-1 text-sm text-slate-500">{totalOrders} Peeap store {totalOrders === 1 ? "order" : "orders"} · newest 50 shown</p></div><a href="https://my.peeap.com/orders" className="text-sm font-semibold text-violet-700 hover:underline">See full details in Peeap</a></div>{orders.length === 0 ? <div className="rounded-xl border bg-white p-6 text-slate-600">No Peeap store purchases yet.</div> : <div className="overflow-hidden rounded-xl border bg-white">{orders.map((o) => <div key={o.transaction_id} className="flex flex-wrap items-center justify-between gap-3 border-b p-4 last:border-0"><div><p className="font-semibold">{o.store_name}</p><p className="mt-1 text-xs text-slate-500">{o.order_number || o.transaction_id.slice(0, 8)} · {readableDate(o.created_at)} · {o.currency} {o.amount.toFixed(2)}</p></div><div className="flex items-center gap-4"><span className="text-sm text-slate-600">{!o.shipping_job_number ? "Not dispatched" : deliveryNumbers.has(o.shipping_job_number) ? "Tracking available above" : "Tracking record unavailable"}</span><a href={`https://my.peeap.com/orders/${encodeURIComponent(o.transaction_id)}`} className="inline-flex items-center gap-1 text-sm font-semibold text-violet-700 hover:underline">View order <ArrowRight className="h-4 w-4" /></a></div></div>)}</div>}</section>
    </>}</div>
  </main>;
}
