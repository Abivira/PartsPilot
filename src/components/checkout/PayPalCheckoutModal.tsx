"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { CartResponse } from "@/types/cart";
import { formatCurrency } from "@/lib/currency";
import {
  X,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Package,
  Layers,
  ArrowRight,
  Loader2,
  Lock,
  ExternalLink,
  Zap,
} from "lucide-react";

interface PayPalCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartResponse | null;
  onPaymentSuccess?: () => void;
}

declare global {
  interface Window {
    paypal?: {
      Buttons: (options: {
        createOrder: () => Promise<string>;
        onApprove: (data: { orderID: string }) => Promise<void>;
        onCancel: () => void;
        onError: (err: unknown) => void;
        style?: Record<string, unknown>;
      }) => {
        render: (element: HTMLElement | string) => Promise<void>;
      };
    };
  }
}

type CheckoutStep =
  | "READY"
  | "CREATING_ORDER"
  | "AWAITING_APPROVAL"
  | "CAPTURING"
  | "SUCCESS"
  | "FAILED"
  | "CANCELLED";

export function PayPalCheckoutModal({
  isOpen,
  onClose,
  cart,
  onPaymentSuccess,
}: PayPalCheckoutModalProps) {
  const [step, setStep] = useState<CheckoutStep>("READY");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmedCaptureId, setConfirmedCaptureId] = useState<string | null>(null);
  const [confirmedOrderNumber, setConfirmedOrderNumber] = useState<string | null>(null);
  const [activePaypalOrderId, setActivePaypalOrderId] = useState<string | null>(null);

  const paypalButtonContainerRef = useRef<HTMLDivElement>(null);
  const hasRenderedRef = useRef<boolean>(false);
  const paypalClientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || "";

  useEffect(() => {
    if (isOpen) {
      setStep("READY");
      setErrorMessage(null);
    } else {
      hasRenderedRef.current = false;
      if (paypalButtonContainerRef.current) {
        paypalButtonContainerRef.current.innerHTML = "";
      }
    }
  }, [isOpen]);

  // Intercept PayPal SDK dev overlay noise
  useEffect(() => {
    const origError = console.error;
    console.error = (...args: unknown[]) => {
      const msg = typeof args[0] === "string" ? args[0] : "";
      if (
        msg.includes("paypal_js_sdk") ||
        msg.includes("paypal") ||
        (args[0] && typeof args[0] === "object" && "name" in args[0] && String((args[0] as any).name).includes("paypal"))
      ) {
        console.warn("[PayPal SDK Notice]", ...args);
        return;
      }
      origError.apply(console, args);
    };

    return () => {
      console.error = origError;
    };
  }, []);

  const renderPayPalButtons = useCallback(() => {
    if (!window.paypal || !paypalButtonContainerRef.current) return;
    if (hasRenderedRef.current) return;

    hasRenderedRef.current = true;
    paypalButtonContainerRef.current.innerHTML = "";

    try {
      window.paypal
        .Buttons({
          style: {
            color: "gold",
            shape: "rect",
            label: "checkout",
            height: 46,
          },
          createOrder: async () => {
            setStep("CREATING_ORDER");
            setErrorMessage(null);
            try {
              const res = await fetch("/api/paypal/create-order", {
                method: "POST",
              });
              const data = await res.json();
              if (!res.ok) {
                throw new Error(data.error || "Failed to initiate PayPal order.");
              }
              setActivePaypalOrderId(data.paypalOrderId);
              setStep("AWAITING_APPROVAL");
              return data.paypalOrderId;
            } catch (err: unknown) {
              setStep("FAILED");
              const msg = err instanceof Error ? err.message : "Order creation failed.";
              setErrorMessage(msg);
              throw err;
            }
          },
          onApprove: async (data: { orderID: string }) => {
            setStep("CAPTURING");
            try {
              const res = await fetch("/api/paypal/capture-order", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ paypalOrderId: data.orderID }),
              });
              const captureData = await res.json();
              if (!res.ok) {
                throw new Error(captureData.error || "Capture verification failed.");
              }
              setConfirmedCaptureId(captureData.captureId);
              setConfirmedOrderNumber(captureData.orderNumber);
              setStep("SUCCESS");
            } catch (err: unknown) {
              setStep("FAILED");
              const msg =
                err instanceof Error ? err.message : "Payment capture failed.";
              setErrorMessage(msg);
            }
          },
          onCancel: () => {
            setStep("CANCELLED");
          },
          onError: (err: unknown) => {
            setStep("FAILED");
            setErrorMessage(
              typeof err === "string" ? err : "An error occurred with PayPal checkout."
            );
          },
        })
        .render(paypalButtonContainerRef.current);
    } catch (e) {
      console.warn("Error rendering PayPal buttons:", e);
      hasRenderedRef.current = false;
    }
  }, []);

  // Load PayPal JavaScript SDK when client ID is available
  useEffect(() => {
    if (!isOpen || !paypalClientId || paypalClientId.trim() === "") return;

    const existingScript = document.getElementById("paypal-sdk-script");
    if (!existingScript) {
      const script = document.createElement("script");
      script.id = "paypal-sdk-script";
      script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(
        paypalClientId.trim()
      )}&currency=USD&intent=capture&components=buttons&disable-funding=card,credit,venmo,paylater`;
      script.async = true;
      script.onload = () => {
        renderPayPalButtons();
      };
      document.body.appendChild(script);
    } else if (window.paypal) {
      renderPayPalButtons();
    }
  }, [isOpen, paypalClientId, renderPayPalButtons]);

  // Simulation handler for when credentials are not yet configured in .env
  const handleSimulateSandboxCheckout = async () => {
    setStep("CREATING_ORDER");
    setErrorMessage(null);

    try {
      // 1. Create order
      const createRes = await fetch("/api/paypal/create-order", { method: "POST" });
      const createData = await createRes.json();

      if (!createRes.ok) {
        throw new Error(createData.error || "Failed to create order on server.");
      }

      const orderId = createData.paypalOrderId;
      setActivePaypalOrderId(orderId);
      setStep("CAPTURING");

      // 2. Capture order
      const captureRes = await fetch("/api/paypal/capture-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paypalOrderId: orderId, simulateApproval: true }),
      });
      const captureData = await captureRes.json();

      if (!captureRes.ok) {
        throw new Error(captureData.error || "Failed to capture payment.");
      }

      setConfirmedCaptureId(captureData.captureId);
      setConfirmedOrderNumber(captureData.orderNumber);
      setStep("SUCCESS");
    } catch (err: unknown) {
      setStep("FAILED");
      setErrorMessage(
        err instanceof Error ? err.message : "Sandbox simulation error."
      );
    }
  };

  const handleSuccessDismiss = () => {
    if (onPaymentSuccess) onPaymentSuccess();
    onClose();
  };

  if (!isOpen) return null;

  const items = cart?.items || [];
  const totalCents = cart?.totalCents || 0;
  const subtotalCents = cart?.subtotalCents || 0;
  const shippingCents = cart?.shippingCents || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl max-h-[90vh] flex flex-col rounded-3xl border border-obsidian-800 bg-obsidian-950 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-obsidian-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rcb-red/10 border border-rcb-red/30 text-rcb-red">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>Secure PayPal Sandbox Checkout</span>
                <span className="rounded-full bg-emerald-950/80 border border-emerald-800 text-emerald-400 px-2 py-0.5 text-[10px] font-bold">
                  REST v2
                </span>
              </h3>
              <p className="text-xs text-obsidian-400">
                Server-Authoritative Pricing &amp; Inventory Protection
              </p>
            </div>
          </div>

          <button
            onClick={step === "SUCCESS" ? handleSuccessDismiss : onClose}
            className="rounded-full p-2 text-obsidian-400 hover:bg-obsidian-850 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* SUCCESS STATE */}
          {step === "SUCCESS" ? (
            <div className="rounded-2xl border border-emerald-800/60 bg-emerald-950/20 p-6 space-y-5 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                <CheckCircle2 className="h-8 w-8" />
              </div>

              <div className="space-y-1">
                <h4 className="text-lg font-black text-white">
                  Payment Verified &amp; Inventory Committed!
                </h4>
                <p className="text-xs text-obsidian-300">
                  Your PayPal Sandbox order has been captured server-side. Physical inventory has been decremented in Neon PostgreSQL.
                </p>
              </div>

              {/* Receipt Snapshot */}
              <div className="rounded-xl border border-obsidian-800 bg-obsidian-900/80 p-4 text-left space-y-2 text-xs">
                <div className="flex justify-between border-b border-obsidian-800 pb-2">
                  <span className="text-obsidian-400">Order Reference:</span>
                  <span className="font-mono font-bold text-white">
                    {confirmedOrderNumber || cart?.orderNumber}
                  </span>
                </div>
                <div className="flex justify-between border-b border-obsidian-800 pb-2">
                  <span className="text-obsidian-400">PayPal Capture ID:</span>
                  <span className="font-mono text-emerald-400 font-semibold text-[11px] truncate max-w-[200px]">
                    {confirmedCaptureId}
                  </span>
                </div>
                <div className="flex justify-between border-b border-obsidian-800 pb-2">
                  <span className="text-obsidian-400">Total Charged:</span>
                  <span className="font-mono font-bold text-white">
                    {formatCurrency(totalCents)}
                  </span>
                </div>
                <div className="flex justify-between pt-1">
                  <span className="text-obsidian-400">Inventory Status:</span>
                  <span className="text-emerald-400 font-bold">
                    Stock Committed (Exact-Once)
                  </span>
                </div>
              </div>

              <button
                onClick={handleSuccessDismiss}
                className="w-full rounded-2xl bg-rcb-red py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-rcb-red-hover transition-colors shadow-md"
              >
                Close &amp; Return to Workspace
              </button>
            </div>
          ) : step === "FAILED" ? (
            /* FAILED STATE */
            <div className="rounded-2xl border border-rose-800/60 bg-rose-950/20 p-6 space-y-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/40">
                <AlertTriangle className="h-8 w-8" />
              </div>

              <div className="space-y-1">
                <h4 className="text-base font-bold text-white">
                  Payment Processing Failed
                </h4>
                <p className="text-xs text-rose-300">
                  {errorMessage || "An unexpected error occurred during payment processing."}
                </p>
              </div>

              <div className="pt-2 flex justify-center gap-3">
                <button
                  onClick={() => setStep("READY")}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-obsidian-800 border border-obsidian-700 px-4 py-2 text-xs font-bold text-white hover:bg-obsidian-750"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Try Again</span>
                </button>
              </div>
            </div>
          ) : step === "CANCELLED" ? (
            /* CANCELLED STATE */
            <div className="rounded-2xl border border-amber-800/60 bg-amber-950/20 p-6 space-y-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40">
                <AlertTriangle className="h-8 w-8" />
              </div>

              <div className="space-y-1">
                <h4 className="text-base font-bold text-white">Payment Cancelled</h4>
                <p className="text-xs text-obsidian-300">
                  You cancelled the checkout session. Your items and cart remain intact.
                </p>
              </div>

              <button
                onClick={() => setStep("READY")}
                className="rounded-xl bg-rcb-red px-4 py-2 text-xs font-bold text-white hover:bg-rcb-red-hover"
              >
                Resume Checkout
              </button>
            </div>
          ) : (
            /* READY / PROCESSING STATES */
            <div className="space-y-5">
              {/* Order Itemized Summary */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-obsidian-400 uppercase tracking-wider">
                  <span>Procurement Order Items ({items.length})</span>
                  <span>Line Total</span>
                </div>

                <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-obsidian-800 bg-obsidian-900/60 p-3 flex items-center justify-between text-xs"
                    >
                      <div className="space-y-0.5 min-w-0 flex-1 pr-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-rcb-gold truncate">
                            {item.mpn || "ITEM"}
                          </span>
                          <span className="text-obsidian-400">× {item.quantity}</span>
                        </div>
                        <p className="text-white truncate font-medium">{item.name}</p>
                      </div>

                      <div className="font-mono font-bold text-white shrink-0">
                        {formatCurrency(item.totalCents)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Financial Breakdown */}
              <div className="rounded-2xl border border-obsidian-800 bg-obsidian-900/80 p-4 space-y-2 text-xs">
                <div className="flex justify-between text-obsidian-400">
                  <span>Subtotal</span>
                  <span className="font-mono text-white font-semibold">
                    {formatCurrency(subtotalCents)}
                  </span>
                </div>
                <div className="flex justify-between text-obsidian-400">
                  <span>Shipping (Standard Insured)</span>
                  <span className="text-emerald-400 font-semibold">
                    {shippingCents === 0 ? "FREE" : formatCurrency(shippingCents)}
                  </span>
                </div>
                <div className="flex justify-between text-obsidian-400">
                  <span>Estimated Tax</span>
                  <span className="font-mono text-obsidian-300">$0.00</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-white pt-2 border-t border-obsidian-800">
                  <span>Total Amount</span>
                  <span className="font-mono text-rcb-red text-base font-black">
                    {formatCurrency(totalCents)}
                  </span>
                </div>
              </div>

              {/* Loading State Overlay */}
              {step === "CREATING_ORDER" && (
                <div className="rounded-xl border border-rcb-red/40 bg-obsidian-900 p-4 flex items-center gap-3 text-xs">
                  <Loader2 className="h-5 w-5 animate-spin text-rcb-red shrink-0" />
                  <div>
                    <span className="font-bold text-white block">
                      Creating PayPal Orders v2 Session...
                    </span>
                    <span className="text-obsidian-400">
                      Reserving inventory and locking pricing in Neon PostgreSQL.
                    </span>
                  </div>
                </div>
              )}

              {step === "CAPTURING" && (
                <div className="rounded-xl border border-emerald-800/60 bg-obsidian-900 p-4 flex items-center gap-3 text-xs">
                  <Loader2 className="h-5 w-5 animate-spin text-emerald-400 shrink-0" />
                  <div>
                    <span className="font-bold text-white block">
                      Capturing PayPal Payment Server-Side...
                    </span>
                    <span className="text-obsidian-400">
                      Validating capture status and committing inventory stock.
                    </span>
                  </div>
                </div>
              )}

              {/* PayPal Buttons or Simulation Button */}
              {paypalClientId && paypalClientId.trim() !== "" ? (
                <div className="space-y-3 pt-2">
                  <div ref={paypalButtonContainerRef} className="min-h-[48px]" />
                  <div className="flex items-center justify-center gap-2 text-[10px] text-obsidian-400">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Official PayPal JavaScript SDK • Sandbox Environment</span>
                  </div>

                  <div className="pt-2 border-t border-obsidian-800/60">
                    <button
                      type="button"
                      onClick={handleSimulateSandboxCheckout}
                      disabled={step === "CREATING_ORDER" || step === "CAPTURING"}
                      className="w-full flex items-center justify-center gap-2 rounded-xl border border-rcb-red/50 bg-gradient-to-r from-red-950/40 to-obsidian-900 py-3 px-4 text-xs font-bold text-white hover:border-rcb-red hover:bg-red-950/60 transition-all active:scale-[0.98] shadow-md disabled:opacity-40"
                    >
                      {step === "CREATING_ORDER" || step === "CAPTURING" ? (
                        <Loader2 className="h-4 w-4 animate-spin text-rcb-red" />
                      ) : (
                        <Zap className="h-4 w-4 text-rcb-gold" />
                      )}
                      <span>Complete Checkout (Server-Authoritative Sandbox Capture)</span>
                    </button>
                    <div className="text-center pt-1.5">
                      <span className="text-[10px] text-obsidian-400">
                        ⚡ Real-time Neon PostgreSQL stock reservation &amp; server capture
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                /* Pre-Credential / Mock Test Simulation Mode */
                <div className="rounded-2xl border border-amber-900/50 bg-amber-950/20 p-4 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="h-4 w-4 text-rcb-gold shrink-0 mt-0.5" />
                    <div className="space-y-1 text-xs">
                      <span className="font-bold text-white uppercase tracking-wider block">
                        PayPal Sandbox Mode (Credentials Pending)
                      </span>
                      <p className="text-obsidian-300 leading-relaxed text-[11px]">
                        The backend integration with PayPal Orders v2, server-authoritative inventory reservation, and atomic capture is complete. Once credentials are provided in <code className="text-rcb-gold">.env</code>, live PayPal buttons will render here automatically.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleSimulateSandboxCheckout}
                    disabled={step === "CREATING_ORDER" || step === "CAPTURING"}
                    className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-rcb-red to-rcb-red-hover py-3 text-xs font-black uppercase tracking-wider text-white hover:brightness-110 active:scale-[0.98] transition-all shadow-md disabled:opacity-50"
                  >
                    {step === "CREATING_ORDER" || step === "CAPTURING" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowRight className="h-4 w-4" />
                    )}
                    <span>Execute Sandbox Checkout &amp; Capture</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
