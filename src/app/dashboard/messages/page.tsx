"use client";

import { useEffect, useState, useRef } from "react";
import {
  MessageSquare, Send, Search, Package, User, Clock, ChevronRight, Truck, RefreshCw,
} from "lucide-react";

function getToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|; )peeap_shipping_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : "";
}

interface DeliveryConversation {
  id: string;
  job_number: string;
  customer_name: string;
  customer_id: string;
  merchant_id: string;
  merchant_name: string | null;
  status: string;
  created_at: string;
  chat_conversations: any[];
}

interface ChatMessage {
  id: string;
  content: string;
  message_type: string;
  sender_id: string;
  created_at: string;
  rich_content?: any;
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  assigned: "bg-blue-100 text-blue-700",
  in_transit: "bg-purple-100 text-purple-700",
  delivered: "bg-green-100 text-green-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-700",
  returning: "bg-amber-100 text-amber-700",
};

export default function MessagesPage() {
  const [conversations, setConversations] = useState<DeliveryConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DeliveryConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sendTo, setSendTo] = useState<"customer" | "vendor">("customer");
  const [searchQuery, setSearchQuery] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadConversations();
    const interval = setInterval(() => loadConversations(), 30_000);
    return () => clearInterval(interval);
  }, []);

  // Auto-refresh messages when a conversation is selected
  useEffect(() => {
    if (!selected) return;
    const interval = setInterval(() => loadMessages(selected, true), 10_000);
    return () => clearInterval(interval);
  }, [selected?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadConversations() {
    try {
      const token = getToken();
      const res = await fetch("/api/messages", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } catch (err) {
      console.error("Failed to load conversations:", err);
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages(conv: DeliveryConversation, silent = false) {
    if (!silent) setLoadingMessages(true);
    // Messages are sent through the chat service — we don't have direct access to conversation IDs
    // For now, show the job info and allow sending new messages
    setMessages([]);
    setLoadingMessages(false);
  }

  async function handleSend() {
    if (!selected || !newMessage.trim()) return;
    setSending(true);
    try {
      const token = getToken();
      const recipientId = sendTo === "customer" ? selected.customer_id : selected.merchant_id;
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          job_number: selected.job_number,
          recipient_id: recipientId,
          message: newMessage.trim(),
        }),
      });
      if (res.ok) {
        setNewMessage("");
        // Reload messages
        loadMessages(selected, true);
      } else {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        alert(err.error || "Failed to send message");
      }
    } catch {
      alert("Network error");
    } finally {
      setSending(false);
    }
  }

  function selectConversation(conv: DeliveryConversation) {
    setSelected(conv);
    setMessages([]);
    loadMessages(conv);
  }

  const filtered = conversations.filter((c) =>
    !searchQuery ||
    c.job_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.merchant_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 bg-gray-200 rounded" />
        {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-gray-200 rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-130px)] flex gap-4">
      {/* Conversation list */}
      <div className="w-80 flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden shrink-0">
        <div className="p-3 border-b border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-bold text-gray-900">Messages</h2>
            <button onClick={() => loadConversations()} className="text-gray-400 hover:text-gray-600">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search orders..."
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No delivery conversations</p>
            </div>
          ) : (
            filtered.map((conv) => (
              <div
                key={conv.id}
                onClick={() => selectConversation(conv)}
                className={`p-3 border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors ${
                  selected?.id === conv.id ? "bg-violet-50 border-l-2 border-l-violet-500" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-medium text-gray-900">{conv.job_number}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusColors[conv.status] || "bg-gray-100 text-gray-600"}`}>
                    {conv.status?.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="text-sm text-gray-600 mt-1 truncate">
                  <User className="inline h-3 w-3 mr-1" />
                  {conv.customer_name}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {conv.merchant_name || "Store"} — {new Date(conv.created_at).toLocaleDateString()}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat panel */}
      <div className="flex-1 flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <MessageSquare className="h-16 w-16 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">Select a delivery</p>
              <p className="text-sm mt-1">Choose a delivery from the list to view and send messages</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="p-4 border-b border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-violet-600" />
                    <span className="font-bold text-gray-900">{selected.job_number}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[selected.status] || "bg-gray-100"}`}>
                      {selected.status?.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    Customer: {selected.customer_name} — Vendor: {selected.merchant_name || "Store"}
                  </div>
                </div>
                <a href={`/track/${selected.job_number}`} target="_blank" className="text-xs text-violet-600 hover:underline">
                  Track →
                </a>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
              {loadingMessages ? (
                <div className="text-center py-8 text-gray-400">
                  <RefreshCw className="h-6 w-6 mx-auto animate-spin mb-2" />
                  <p className="text-sm">Loading messages...</p>
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <p className="text-sm">No messages yet. Send one below.</p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isSystem = msg.message_type === "shipping_update" || msg.message_type === "order_update" || msg.message_type === "system";
                  const isFromAdmin = msg.rich_content?.sent_by === "shipping_admin";

                  return (
                    <div key={msg.id} className={`flex ${isFromAdmin ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                        isFromAdmin
                          ? "bg-violet-600 text-white"
                          : isSystem
                          ? "bg-white border border-gray-200 text-gray-700"
                          : "bg-white border border-gray-200 text-gray-900"
                      }`}>
                        {isSystem && !isFromAdmin && (
                          <div className="flex items-center gap-1 mb-1">
                            <Truck className="h-3 w-3 text-violet-500" />
                            <span className="text-[10px] font-medium text-violet-600">Shipping Update</span>
                          </div>
                        )}
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        <div className={`text-[10px] mt-1 ${isFromAdmin ? "text-violet-200" : "text-gray-400"}`}>
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Send message */}
            <div className="p-3 border-t border-gray-200 bg-white">
              {/* Recipient toggle */}
              <div className="flex gap-1 mb-2">
                <button
                  onClick={() => setSendTo("customer")}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    sendTo === "customer" ? "bg-violet-100 text-violet-700" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                >
                  To Customer
                </button>
                <button
                  onClick={() => setSendTo("vendor")}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    sendTo === "vendor" ? "bg-violet-100 text-violet-700" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                >
                  To Vendor
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder={`Message ${sendTo === "customer" ? selected.customer_name : (selected.merchant_name || "vendor")}...`}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !newMessage.trim()}
                  className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
                >
                  {sending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
