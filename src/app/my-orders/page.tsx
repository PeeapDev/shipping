"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Package, Truck, ArrowUpRight, RefreshCw } from "lucide-react";

type Order = {
  transaction_id: string;
  order_number: string | null;
  store_name: string;
  amount: number;
  currency: string;
  payment_status: string;
  order_status: string;
  shipping_job_number: string | null;
  shipping_status: string | null;
  created_at: string;
};

export default function MyOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/customer/orders", { cache: "no-store" });
      if (response.status === 401) { window.location.assign("/login?redirect=%2Fmy-orders"); return; }
      if (!response.ok) throw new Error("We couldn't load your orders. Please try again.");
      const result = await response.json();
      setOrders(result.orders || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load orders");
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  const active = orders.filter((order) => order.shipping_job_number && !["delivered", "cancelled", "failed"].includes((order.shipping_status || "").toLowerCase())).length;
  return <main className="min-h-screen bg-gray-50 text-gray-900">
    <header className="border-b bg-white"><div className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between gap-4">
      <Link href="/" className="font-bold text-xl text-violet-700 flex items-center gap-2"><Truck className="h-6 w-6" /> Peeap Shipping</Link>
      <Link href="/track" className="text-sm font-medium text-violet-700 hover:underline">Track a package</Link>
    </div></header>
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
      <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-violet-700">Customer dashboard</p><h1 className="mt-1 text-3xl font-bold">Your school-store orders</h1><p className="mt-2 text-gray-600">Purchases and deliveries connected to your Peeap account.</p></div>
        <button type="button" onClick={() => void load()} disabled={loading} aria-label="Refresh orders" className="rounded-lg border bg-white p-2 hover:bg-gray-100 disabled:opacity-50"><RefreshCw className="h-5 w-5" /></button>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-4"><div className="rounded-xl border bg-white p-5"><p className="text-sm text-gray-500">Recent orders</p><p className="mt-2 text-2xl font-bold">{orders.length}</p></div><div className="rounded-xl border bg-white p-5"><p className="text-sm text-gray-500">Active deliveries</p><p className="mt-2 text-2xl font-bold">{active}</p></div></div>
      {error && <div role="alert" className="mt-6 rounded-lg bg-red-50 p-4 text-red-700">{error}</div>}
      {loading ? <p className="mt-8 text-gray-600">Loading your orders…</p> : orders.length === 0 && !error ? <div className="mt-8 rounded-xl border bg-white p-10 text-center"><Package className="mx-auto h-10 w-10 text-violet-500" /><h2 className="mt-3 text-xl font-semibold">No orders yet</h2><p className="mt-2 text-gray-600">When you buy school essentials with Peeap, your order and delivery updates will appear here.</p><a href="https://store.peeap.com" className="mt-5 inline-block rounded-lg bg-violet-600 px-5 py-3 font-medium text-white hover:bg-violet-700">Explore the store</a></div> : null}
      <div className="mt-8 space-y-4">{orders.map((order) => <article key={order.transaction_id} className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm text-gray-500">{new Date(order.created_at).toLocaleDateString()} · {order.order_number || order.transaction_id.slice(0, 8)}</p><h2 className="mt-1 text-lg font-semibold">{order.store_name}</h2></div><p className="font-semibold">{order.currency} {order.amount.toFixed(2)}</p></div>
        <div className="mt-4 flex flex-wrap gap-2 text-sm"><span className="rounded-full bg-violet-50 px-3 py-1 text-violet-800">Order: {String(order.order_status).replaceAll("_", " ")}</span><span className="rounded-full bg-gray-100 px-3 py-1">Payment: {order.payment_status.toLowerCase()}</span><span className="rounded-full bg-blue-50 px-3 py-1 text-blue-800">Delivery: {order.shipping_status ? order.shipping_status.replaceAll("_", " ") : order.shipping_job_number ? "Awaiting update" : "Not dispatched"}</span></div>
        <div className="mt-5 flex flex-wrap gap-4 text-sm font-medium"><a href={`https://my.peeap.com/orders/${encodeURIComponent(order.transaction_id)}`} className="inline-flex items-center gap-1 text-violet-700 hover:underline">Order details <ArrowUpRight className="h-4 w-4" /></a>{order.shipping_job_number && <Link href={`/track/${encodeURIComponent(order.shipping_job_number)}`} className="inline-flex items-center gap-1 text-violet-700 hover:underline">Track delivery <ArrowUpRight className="h-4 w-4" /></Link>}</div>
      </article>)}</div>
      <p className="mt-8 text-sm text-gray-500">Your Peeap order page has the full payment and item details. This page shows a quick delivery view.</p>
    </div>
  </main>;
}
