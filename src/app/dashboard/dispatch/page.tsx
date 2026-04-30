"use client";

import { useEffect, useRef, useState } from "react";
import {
  Package,
  MapPin,
  Truck,
  Camera,
  CheckCircle2,
  ArrowRight,
  RotateCcw,
  Phone,
  ShieldCheck,
  XCircle,
  Loader2,
  PackageCheck,
  Scan,
} from "lucide-react";
import type { DeliveryJob } from "@/types/shipping";
import {
  playClickSound,
  playPickupSound,
  playApproveSound,
  playDeliverySound,
  playCameraSound,
  playErrorSound,
} from "@/lib/sounds";

// ── Step definitions ──
type Step = "code_entry" | "order_preview" | "collecting" | "in_transit" | "delivery_verify" | "camera" | "completed";

const STEP_CONFIG: Record<Step, { label: string; num: number }> = {
  code_entry: { label: "Verify", num: 1 },
  order_preview: { label: "Review", num: 1 },
  collecting: { label: "Collect", num: 2 },
  in_transit: { label: "Transit", num: 3 },
  delivery_verify: { label: "Deliver", num: 4 },
  camera: { label: "Deliver", num: 4 },
  completed: { label: "Done", num: 5 },
};

const STEPS = [
  { num: 1, label: "Verify" },
  { num: 2, label: "Collect" },
  { num: 3, label: "Transit" },
  { num: 4, label: "Deliver" },
  { num: 5, label: "Done" },
];

export default function DispatchPage() {
  const [step, setStep] = useState<Step>("code_entry");
  const [code, setCode] = useState<string[]>(["", "", "", ""]);
  const [deliveryCode, setDeliveryCode] = useState<string[]>(["", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [job, setJob] = useState<DeliveryJob | null>(null);
  const [proofPhoto, setProofPhoto] = useState<string | null>(null);
  const [earnings, setEarnings] = useState(0);
  const [showSuccess, setShowSuccess] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const deliveryInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const currentStepNum = STEP_CONFIG[step].num;

  // ── Cleanup camera on unmount ──
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // ── Focus first input on step change ──
  useEffect(() => {
    if (step === "code_entry") {
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    }
    if (step === "delivery_verify") {
      setTimeout(() => deliveryInputRefs.current[0]?.focus(), 100);
    }
  }, [step]);

  // ── Code input handlers ──
  function handleCodeChange(index: number, value: string) {
    if (!/^\d*$/.test(value)) return;
    const digit = value.slice(-1);
    const newCode = [...code];
    newCode[index] = digit;
    setCode(newCode);
    setError("");

    if (digit) {
      playClickSound();
      if (index < 3) {
        inputRefs.current[index + 1]?.focus();
      }
    }
  }

  function handleCodeKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
      const newCode = [...code];
      newCode[index - 1] = "";
      setCode(newCode);
    }
    if (e.key === "Enter" && code.every((d) => d)) {
      handleVerifyCode();
    }
  }

  function handleCodePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
    if (!pasted) return;
    const newCode = [...code];
    for (let i = 0; i < 4; i++) {
      newCode[i] = pasted[i] || "";
    }
    setCode(newCode);
    const focusIndex = Math.min(pasted.length, 3);
    inputRefs.current[focusIndex]?.focus();
  }

  // ── Step 1: Verify code (preview mode) ──
  async function handleVerifyCode() {
    const fullCode = code.join("");
    if (fullCode.length !== 4) {
      setError("Please enter all 4 digits");
      playErrorSound();
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: fullCode, preview: true }),
      });

      const data = await res.json();

      if (!res.ok || !data.delivery) {
        setError(data.error || "No matching order found for this code.");
        playErrorSound();
        setLoading(false);
        return;
      }

      setJob(data.delivery);
      playPickupSound();
      setStep("order_preview");
    } catch {
      setError("Connection error. Please try again.");
      playErrorSound();
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2: Approve/Collect — confirm pickup ──
  async function handleApproveCollection() {
    if (!job) return;
    setLoading(true);
    setError("");

    try {
      const fullCode = code.join("");
      const res = await fetch("/api/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: fullCode }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to confirm collection.");
        playErrorSound();
        setLoading(false);
        return;
      }

      setJob(data.delivery);
      playApproveSound();
      setStep("collecting");

      // Animate transition to in_transit
      setTimeout(() => {
        setStep("in_transit");
      }, 2000);
    } catch {
      setError("Connection error. Please try again.");
      playErrorSound();
    } finally {
      setLoading(false);
    }
  }

  // ── Delivery code input handlers ──
  function handleDeliveryCodeChange(index: number, value: string) {
    if (!/^\d*$/.test(value)) return;
    const digit = value.slice(-1);
    const newCode = [...deliveryCode];
    newCode[index] = digit;
    setDeliveryCode(newCode);
    setError("");

    if (digit) {
      playClickSound();
      if (index < 3) {
        deliveryInputRefs.current[index + 1]?.focus();
      }
    }
  }

  function handleDeliveryCodeKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !deliveryCode[index] && index > 0) {
      deliveryInputRefs.current[index - 1]?.focus();
      const newCode = [...deliveryCode];
      newCode[index - 1] = "";
      setDeliveryCode(newCode);
    }
    if (e.key === "Enter" && deliveryCode.every((d) => d)) {
      handleVerifyDeliveryCode();
    }
  }

  function handleDeliveryCodePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
    if (!pasted) return;
    const newCode = [...deliveryCode];
    for (let i = 0; i < 4; i++) {
      newCode[i] = pasted[i] || "";
    }
    setDeliveryCode(newCode);
    const focusIndex = Math.min(pasted.length, 3);
    deliveryInputRefs.current[focusIndex]?.focus();
  }

  // ── Step 4: Verify buyer's delivery code ──
  async function handleVerifyDeliveryCode() {
    const fullCode = deliveryCode.join("");
    if (fullCode.length !== 4) {
      setError("Please enter all 4 digits");
      playErrorSound();
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Use preview mode to verify the code matches this job
      const res = await fetch("/api/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: fullCode, preview: true }),
      });

      const data = await res.json();

      if (!res.ok || !data.delivery) {
        setError(data.error || "Invalid delivery code. Ask the customer for the correct code.");
        playErrorSound();
        setLoading(false);
        return;
      }

      // Verify the delivery code matches the SAME job from pickup
      if (job && data.delivery.id !== job.id) {
        setError("This code belongs to a different order. Ask the customer for their correct delivery code.");
        playErrorSound();
        setLoading(false);
        return;
      }

      playPickupSound();
      setStep("camera");
      startCamera();
    } catch {
      setError("Connection error. Please try again.");
      playErrorSound();
    } finally {
      setLoading(false);
    }
  }

  // ── Camera functions ──
  async function startCamera() {
    setCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch {
      setError("Camera access denied. You can skip the photo.");
      setCameraActive(false);
    }
  }

  function capturePhoto() {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
    setProofPhoto(dataUrl);
    playCameraSound();

    // Stop camera
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }

  function retakePhoto() {
    setProofPhoto(null);
    startCamera();
  }

  // ── Step 5: Confirm delivery ──
  async function handleConfirmDelivery() {
    if (!job) return;
    setLoading(true);
    setError("");

    try {
      // Use the buyer's delivery code to complete the delivery
      const fullDeliveryCode = deliveryCode.join("");
      const res = await fetch("/api/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: fullDeliveryCode,
          proof_photo: proofPhoto || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to confirm delivery.");
        playErrorSound();
        setLoading(false);
        return;
      }

      setEarnings(data.earnings || 0);
      playDeliverySound();
      setShowSuccess(true);
      setStep("completed");
    } catch {
      setError("Connection error. Please try again.");
      playErrorSound();
    } finally {
      setLoading(false);
    }
  }

  // ── Reset for new delivery ──
  function handleReset() {
    setStep("code_entry");
    setCode(["", "", "", ""]);
    setDeliveryCode(["", "", "", ""]);
    setJob(null);
    setProofPhoto(null);
    setEarnings(0);
    setError("");
    setShowSuccess(false);
    setCameraActive(false);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900">Dispatch Center</h1>
        <p className="text-sm text-gray-500 mt-1">Verify, collect, and deliver packages</p>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center justify-between px-2">
        {STEPS.map((s, i) => {
          const isActive = s.num === currentStepNum;
          const isDone = s.num < currentStepNum;
          return (
            <div key={s.num} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-500 ${
                    isDone
                      ? "bg-green-500 text-white scale-100"
                      : isActive
                      ? "bg-violet-600 text-white scale-110 ring-4 ring-violet-200"
                      : "bg-gray-200 text-gray-400"
                  }`}
                >
                  {isDone ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    s.num
                  )}
                </div>
                <span
                  className={`text-xs mt-1 font-medium transition-colors ${
                    isActive ? "text-violet-600" : isDone ? "text-green-600" : "text-gray-400"
                  }`}
                >
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`w-8 sm:w-12 h-0.5 mx-1 transition-colors duration-500 ${
                    s.num < currentStepNum ? "bg-green-400" : "bg-gray-200"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-start gap-3 animate-shake">
          <XCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* ── STEP 1: CODE ENTRY ── */}
      {step === "code_entry" && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-6 animate-fadeIn">
          <div className="text-center">
            <div className="w-16 h-16 bg-violet-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <ShieldCheck className="h-8 w-8 text-violet-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Enter Vendor Code</h2>
            <p className="text-sm text-gray-500 mt-1">
              Enter the 4-digit code from the vendor to verify the package
            </p>
          </div>

          {/* 6-digit input */}
          <div className="flex justify-center gap-2 sm:gap-3">
            {code.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { inputRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleCodeChange(i, e.target.value)}
                onKeyDown={(e) => handleCodeKeyDown(i, e)}
                onPaste={i === 0 ? handleCodePaste : undefined}
                className={`w-12 h-14 sm:w-14 sm:h-16 text-center text-2xl font-bold rounded-xl border-2 transition-all duration-200 focus:outline-none ${
                  digit
                    ? "border-violet-500 bg-violet-50 text-violet-700 shadow-sm"
                    : "border-gray-300 bg-white text-gray-900 focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
                }`}
                disabled={loading}
              />
            ))}
          </div>

          <button
            onClick={handleVerifyCode}
            disabled={loading || code.some((d) => !d)}
            className="w-full py-3.5 rounded-xl font-semibold text-white transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed bg-violet-600 hover:bg-violet-700 active:scale-[0.98] flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Verifying...
              </>
            ) : (
              <>
                <Scan className="h-5 w-5" />
                Verify Code
              </>
            )}
          </button>
        </div>
      )}

      {/* ── STEP 2: ORDER PREVIEW ── */}
      {step === "order_preview" && job && (
        <div className="space-y-4 animate-fadeIn">
          {/* Order Card */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-4 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-violet-200">ORDER FOUND</div>
                  <div className="text-lg font-bold mt-0.5">{job.job_number}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-violet-200">Shipping Fee</div>
                  <div className="text-lg font-bold">NLe {Number(job.shipping_fee).toLocaleString()}</div>
                </div>
              </div>
            </div>

            <div className="p-5 space-y-4">
              {/* Route */}
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="mt-1">
                    <div className="w-3 h-3 rounded-full bg-green-500 ring-4 ring-green-100" />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-medium text-gray-400 uppercase">Pickup from</div>
                    <div className="text-sm font-semibold text-gray-900">{job.merchant_name || "Vendor"}</div>
                    <div className="text-sm text-gray-600">{job.pickup_address}</div>
                  </div>
                </div>

                <div className="ml-1.5 border-l-2 border-dashed border-gray-200 h-4" />

                <div className="flex items-start gap-3">
                  <div className="mt-1">
                    <div className="w-3 h-3 rounded-full bg-red-500 ring-4 ring-red-100" />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-medium text-gray-400 uppercase">Deliver to</div>
                    <div className="text-sm font-semibold text-gray-900">{job.customer_name}</div>
                    <div className="text-sm text-gray-600">{job.delivery_address}</div>
                    {job.customer_phone && (
                      <a href={`tel:${job.customer_phone}`} className="inline-flex items-center gap-1 text-xs text-violet-600 mt-1 hover:underline">
                        <Phone className="h-3 w-3" />
                        {job.customer_phone}
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* Package info */}
              <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Package className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-600">{job.package_description || `${job.package_size} package`}</span>
                </div>
                {job.items && Array.isArray(job.items) && job.items.length > 0 && (
                  <div className="text-xs text-gray-500 pl-6">
                    {(job.items as any[]).map((item: any, i: number) => (
                      <div key={i}>
                        {item.quantity || 1}x {item.name || item.product_name || "Item"}
                        {item.price ? ` — NLe ${Number(item.price).toLocaleString()}` : ""}
                      </div>
                    ))}
                  </div>
                )}
                {job.pickup_instructions && (
                  <div className="text-xs text-amber-600 pl-6">Note: {job.pickup_instructions}</div>
                )}
              </div>
            </div>
          </div>

          {/* Approve Button */}
          <button
            onClick={handleApproveCollection}
            disabled={loading}
            className="w-full py-4 rounded-xl font-bold text-white text-lg transition-all duration-200 disabled:opacity-40 bg-green-600 hover:bg-green-700 active:scale-[0.98] flex items-center justify-center gap-3 shadow-lg shadow-green-200"
          >
            {loading ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <PackageCheck className="h-6 w-6" />
                Collect &amp; Approve
              </>
            )}
          </button>

          <button
            onClick={handleReset}
            className="w-full py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* ── STEP 2.5: COLLECTING ANIMATION ── */}
      {step === "collecting" && (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center animate-fadeIn">
          <div className="relative w-20 h-20 mx-auto mb-4">
            <div className="absolute inset-0 bg-green-100 rounded-full animate-ping opacity-30" />
            <div className="relative w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10 text-green-600 animate-scaleIn" />
            </div>
          </div>
          <h2 className="text-xl font-bold text-gray-900">Package Collected!</h2>
          <p className="text-sm text-gray-500 mt-2">
            The vendor and buyer have been notified. Preparing for transit...
          </p>
          <div className="mt-4 flex justify-center">
            <Loader2 className="h-5 w-5 text-violet-500 animate-spin" />
          </div>
        </div>
      )}

      {/* ── STEP 3: IN TRANSIT ── */}
      {step === "in_transit" && job && (
        <div className="space-y-4 animate-fadeIn">
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Truck className="h-8 w-8 text-purple-600 animate-bounce" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900">In Transit</h2>
              <p className="text-sm text-gray-500 mt-1">
                Deliver the package to the customer below
              </p>
            </div>

            {/* Delivery address card */}
            <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-3">
                <MapPin className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-xs font-medium text-gray-400 uppercase">Deliver to</div>
                  <div className="font-semibold text-gray-900">{job.customer_name}</div>
                  <div className="text-sm text-gray-700 mt-0.5">{job.delivery_address}</div>
                </div>
              </div>

              {job.customer_phone && (
                <a
                  href={`tel:${job.customer_phone}`}
                  className="flex items-center gap-2 bg-white rounded-lg px-4 py-2.5 text-sm font-medium text-green-700 hover:bg-green-50 transition-colors"
                >
                  <Phone className="h-4 w-4" />
                  Call Customer: {job.customer_phone}
                </a>
              )}

              {job.delivery_instructions && (
                <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                  Note: {job.delivery_instructions}
                </div>
              )}
            </div>

            {/* Package reminder */}
            <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
              <Package className="h-4 w-4" />
              <span>{job.package_description || `${job.package_size} package`}</span>
              <span className="mx-1 text-gray-300">|</span>
              <span className="font-medium">{job.job_number}</span>
            </div>
          </div>

          <button
            onClick={() => setStep("delivery_verify")}
            className="w-full py-4 rounded-xl font-bold text-white text-lg transition-all duration-200 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] flex items-center justify-center gap-3 shadow-lg shadow-indigo-200"
          >
            <MapPin className="h-6 w-6" />
            Arrived at Destination
          </button>
        </div>
      )}

      {/* ── STEP 4: DELIVERY VERIFICATION (Buyer's 4-digit code) ── */}
      {step === "delivery_verify" && job && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-6 animate-fadeIn">
          <div className="text-center">
            <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <ShieldCheck className="h-8 w-8 text-blue-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Enter Customer Code</h2>
            <p className="text-sm text-gray-500 mt-1">
              Ask the customer for their 6-digit delivery code to confirm receipt
            </p>
          </div>

          {/* 6-digit delivery code input */}
          <div className="flex justify-center gap-2 sm:gap-3">
            {deliveryCode.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { deliveryInputRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleDeliveryCodeChange(i, e.target.value)}
                onKeyDown={(e) => handleDeliveryCodeKeyDown(i, e)}
                onPaste={i === 0 ? handleDeliveryCodePaste : undefined}
                className={`w-12 h-14 sm:w-14 sm:h-16 text-center text-2xl font-bold rounded-xl border-2 transition-all duration-200 focus:outline-none ${
                  digit
                    ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm"
                    : "border-gray-300 bg-white text-gray-900 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                }`}
                disabled={loading}
              />
            ))}
          </div>

          {/* Customer info reminder */}
          <div className="bg-gray-50 rounded-xl p-3 flex items-center gap-3 text-sm">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
              <Package className="h-4 w-4 text-blue-600" />
            </div>
            <div className="text-gray-600">
              Delivering to <span className="font-semibold text-gray-900">{job.customer_name}</span>
              <span className="mx-1 text-gray-300">|</span>
              {job.job_number}
            </div>
          </div>

          <button
            onClick={handleVerifyDeliveryCode}
            disabled={loading || deliveryCode.some((d) => !d)}
            className="w-full py-3.5 rounded-xl font-semibold text-white transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-700 active:scale-[0.98] flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Verifying...
              </>
            ) : (
              <>
                <ArrowRight className="h-5 w-5" />
                Verify &amp; Open Camera
              </>
            )}
          </button>
        </div>
      )}

      {/* ── STEP 4b: CAMERA / PROOF OF DELIVERY ── */}
      {step === "camera" && (
        <div className="space-y-4 animate-fadeIn">
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Camera className="h-5 w-5 text-violet-600" />
                Proof of Delivery
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">Take a photo of the delivered package</p>
            </div>

            <div className="relative bg-black">
              {cameraActive && !proofPhoto && (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full aspect-[4/3] object-cover"
                  />
                  <canvas ref={canvasRef} className="hidden" />
                  {/* Capture button overlay */}
                  <div className="absolute bottom-4 left-0 right-0 flex justify-center">
                    <button
                      onClick={capturePhoto}
                      className="w-16 h-16 bg-white rounded-full border-4 border-gray-300 shadow-xl hover:scale-105 active:scale-95 transition-transform flex items-center justify-center"
                    >
                      <div className="w-12 h-12 bg-red-500 rounded-full" />
                    </button>
                  </div>
                </>
              )}

              {proofPhoto && (
                <div className="relative">
                  <img src={proofPhoto} alt="Delivery proof" className="w-full aspect-[4/3] object-cover" />
                  <div className="absolute top-3 right-3">
                    <button
                      onClick={retakePhoto}
                      className="bg-black/60 text-white px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1 hover:bg-black/80 transition-colors"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Retake
                    </button>
                  </div>
                  <div className="absolute bottom-3 left-3 bg-green-500 text-white px-3 py-1 rounded-lg text-sm font-medium flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4" />
                    Photo captured
                  </div>
                </div>
              )}

              {!cameraActive && !proofPhoto && (
                <div className="aspect-[4/3] flex items-center justify-center bg-gray-100">
                  <div className="text-center text-gray-400">
                    <Camera className="h-12 w-12 mx-auto mb-2" />
                    <p className="text-sm">Camera unavailable</p>
                    <button
                      onClick={startCamera}
                      className="mt-2 text-violet-600 hover:underline text-sm"
                    >
                      Try again
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <button
            onClick={handleConfirmDelivery}
            disabled={loading}
            className="w-full py-4 rounded-xl font-bold text-white text-lg transition-all duration-200 disabled:opacity-40 bg-green-600 hover:bg-green-700 active:scale-[0.98] flex items-center justify-center gap-3 shadow-lg shadow-green-200"
          >
            {loading ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin" />
                Confirming Delivery...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-6 w-6" />
                Confirm Delivery
              </>
            )}
          </button>

          {!proofPhoto && !cameraActive && (
            <button
              onClick={handleConfirmDelivery}
              disabled={loading}
              className="w-full py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              Skip photo and confirm
            </button>
          )}
        </div>
      )}

      {/* ── STEP 5: COMPLETED ── */}
      {step === "completed" && (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center animate-fadeIn">
          {/* Success animation */}
          <div className="relative w-24 h-24 mx-auto mb-6">
            <div className="absolute inset-0 bg-green-100 rounded-full animate-ping opacity-20" />
            <div className="absolute inset-2 bg-green-100 rounded-full animate-ping opacity-30 animation-delay-200" />
            <div className="relative w-24 h-24 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center shadow-xl shadow-green-200 animate-scaleIn">
              <CheckCircle2 className="h-12 w-12 text-white" />
            </div>
          </div>

          <h2 className="text-2xl font-bold text-gray-900">Delivery Complete!</h2>
          <p className="text-gray-500 mt-2">
            The package has been delivered successfully.
          </p>

          {/* Earnings card */}
          {earnings > 0 && (
            <div className="mt-6 bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-xl p-4">
              <div className="text-sm text-amber-600 font-medium">Your Earnings</div>
              <div className="text-3xl font-bold text-amber-700 mt-1">
                NLe {earnings.toLocaleString()}
              </div>
              <div className="text-xs text-amber-500 mt-1">Credited to your wallet</div>
            </div>
          )}

          {/* Job summary */}
          {job && (
            <div className="mt-4 text-sm text-gray-500">
              <div>{job.job_number}</div>
              <div>{job.merchant_name} &rarr; {job.customer_name}</div>
            </div>
          )}

          {/* Confetti-like particles */}
          <div className="relative h-4 mt-4">
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className="absolute w-2 h-2 rounded-full animate-confetti"
                style={{
                  left: `${12 + i * 11}%`,
                  backgroundColor: ["#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#ec4899", "#14b8a6", "#f97316"][i],
                  animationDelay: `${i * 0.1}s`,
                }}
              />
            ))}
          </div>

          <button
            onClick={handleReset}
            className="mt-6 w-full py-3.5 rounded-xl font-semibold text-white bg-violet-600 hover:bg-violet-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <Package className="h-5 w-5" />
            New Delivery
          </button>
        </div>
      )}

      {/* Custom animations */}
      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes scaleIn {
          from { transform: scale(0.5); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
          20%, 40%, 60%, 80% { transform: translateX(4px); }
        }
        @keyframes confetti {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(-60px) rotate(360deg); opacity: 0; }
        }
        .animate-fadeIn {
          animation: fadeIn 0.4s ease-out;
        }
        .animate-scaleIn {
          animation: scaleIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }
        .animate-confetti {
          animation: confetti 1.5s ease-out forwards;
        }
        .animation-delay-200 {
          animation-delay: 0.2s;
        }
      `}</style>
    </div>
  );
}
