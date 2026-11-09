"use client";

import React, { useState, useEffect } from "react";
import { CartResponse } from "@/types/cart";
import { formatCurrency } from "@/lib/currency";
import {
  ShoppingCart,
  X,
  Trash2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Package,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { PayPalCheckoutModal } from "@/components/checkout/PayPalCheckoutModal";

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartResponse | null;
  isLoading: boolean;
  onUpdateQuantity: (orderItemId: string, quantity: number) => Promise<void>;
  onRemoveItem: (orderItemId: string) => Promise<void>;
  onClearCart: () => Promise<void>;
  onRefresh?: () => void;
}

export function CartDrawer({
  isOpen,
  onClose,
  cart,
  isLoading,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  onRefresh,
}: CartDrawerProps) {
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  useEffect(() => {
    if (isOpen && onRefresh) {
      onRefresh();
    }
  }, [isOpen, onRefresh]);

  if (!isOpen) return null;

  const items = cart?.items || [];
  const itemCount = cart?.itemCount || 0;
  const subtotalCents = cart?.subtotalCents || 0;
  const shippingCents = cart?.shippingCents || 0;
  const totalCents = cart?.totalCents || 0;

  const handleQtyClick = async (orderItemId: string, nextQty: number) => {
    setUpdatingItemId(orderItemId);
    try {
      await onUpdateQuantity(orderItemId, nextQty);
    } finally {
      setUpdatingItemId(null);
    }
  };

  const handleRemoveClick = async (orderItemId: string) => {
    setUpdatingItemId(orderItemId);
    try {
      await onRemoveItem(orderItemId);
    } finally {
      setUpdatingItemId(null);
    }
  };

  const handleClearClick = async () => {
    setIsClearing(true);
    try {
      await onClearCart();
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Dark backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
      />

      <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
        <div className="relative w-screen max-w-md bg-obsidian-950 border-l border-obsidian-800 shadow-2xl flex flex-col">
          {/* Drawer Header */}
          <div className="p-5 border-b border-obsidian-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rcb-red/10 border border-rcb-red/30 text-rcb-red">
                <ShoppingCart className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>Procurement Cart</span>
                  {itemCount > 0 && (
                    <span className="rounded-full bg-rcb-red px-2 py-0.5 text-[11px] font-black text-white">
                      {itemCount}
                    </span>
                  )}
                </h3>
                <p className="text-xs text-obsidian-400">
                  Authoritative Neon DB Reservation
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="rounded-full p-2 text-obsidian-400 hover:bg-obsidian-850 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20 text-obsidian-400 gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-rcb-red" />
                <span className="text-xs font-semibold">Synchronizing server cart...</span>
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center text-obsidian-400 space-y-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-obsidian-900 border border-obsidian-800 text-obsidian-500">
                  <Package className="h-7 w-7" />
                </div>
                <h4 className="text-sm font-bold text-white">Your cart is empty</h4>
                <p className="text-xs max-w-xs text-obsidian-400">
                  Add sourced components from the Interactive BOM above or directly from the Verified Component Catalog.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((item) => {
                  const isItemBusy = updatingItemId === item.id;
                  const maxAllowed = item.stockAvailable;

                  return (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-obsidian-800 bg-obsidian-900/60 p-4 space-y-3 transition-colors hover:border-obsidian-700"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-xs text-rcb-gold truncate">
                              {item.mpn || "ITEM"}
                            </span>
                            <span className="rounded bg-obsidian-800 px-1.5 py-0.5 text-[9px] font-bold text-obsidian-300 uppercase">
                              {item.category}
                            </span>
                          </div>
                          <h5 className="text-xs font-semibold text-white truncate">
                            {item.name}
                          </h5>
                          <div className="text-[11px] font-mono text-obsidian-400">
                            {formatCurrency(item.unitPriceCents)} each
                          </div>
                        </div>

                        <button
                          onClick={() => handleRemoveClick(item.id)}
                          disabled={isItemBusy}
                          className="text-obsidian-500 hover:text-rose-400 p-1 transition-colors"
                          title="Remove item"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      {/* Quantity & Line Total */}
                      <div className="flex items-center justify-between pt-2 border-t border-obsidian-800/80">
                        <div className="flex items-center rounded-xl border border-obsidian-700 bg-obsidian-950 p-1">
                          <button
                            type="button"
                            disabled={item.quantity <= 1 || isItemBusy}
                            onClick={() => handleQtyClick(item.id, item.quantity - 1)}
                            className="h-6 w-6 rounded-lg bg-obsidian-800 text-obsidian-300 hover:bg-obsidian-700 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center font-bold text-xs"
                          >
                            -
                          </button>
                          <span className="w-8 text-center font-mono font-bold text-xs text-white">
                            {isItemBusy ? "..." : item.quantity}
                          </span>
                          <button
                            type="button"
                            disabled={item.quantity >= maxAllowed || isItemBusy}
                            onClick={() => handleQtyClick(item.id, item.quantity + 1)}
                            className="h-6 w-6 rounded-lg bg-obsidian-800 text-obsidian-300 hover:bg-obsidian-700 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center font-bold text-xs"
                          >
                            +
                          </button>
                        </div>

                        <div className="font-mono font-bold text-sm text-white">
                          {formatCurrency(item.totalCents)}
                        </div>
                      </div>

                      {item.quantity >= maxAllowed && (
                        <p className="text-[10px] text-amber-400 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          <span>Max available stock reached ({maxAllowed} units)</span>
                        </p>
                      )}
                    </div>
                  );
                })}

                {/* Clear Cart Button */}
                <div className="pt-2 flex justify-end">
                  <button
                    onClick={handleClearClick}
                    disabled={isClearing}
                    className="text-xs text-obsidian-400 hover:text-rose-400 transition-colors inline-flex items-center gap-1.5"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>{isClearing ? "Clearing..." : "Clear Cart"}</span>
                  </button>
                </div>
              </div>
            )}
          </div>



          {/* Drawer Footer: Financial breakdown & Checkout */}
          {items.length > 0 && (
            <div className="p-5 border-t border-obsidian-800 bg-obsidian-900/90 space-y-4">
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-obsidian-400">
                  <span>Subtotal</span>
                  <span className="font-mono text-white font-semibold">
                    {formatCurrency(subtotalCents)}
                  </span>
                </div>
                <div className="flex justify-between text-obsidian-400">
                  <span>Estimated Shipping {shippingCents > 0 && <span className="text-[10px] text-obsidian-500 font-normal">($5 under $50)</span>}</span>
                  <span className={shippingCents === 0 ? "text-emerald-400 font-semibold" : "font-mono text-white font-semibold"}>
                    {shippingCents === 0 ? "FREE" : formatCurrency(shippingCents)}
                  </span>
                </div>
                <div className="flex justify-between text-obsidian-400">
                  <span>Tax (Included / Estimated)</span>
                  <span className="font-mono text-obsidian-300">$0.00</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-white pt-2 border-t border-obsidian-800">
                  <span>Grand Total</span>
                  <span className="font-mono text-rcb-red text-base font-black">
                    {formatCurrency(totalCents)}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setIsCheckoutOpen(true)}
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-rcb-red py-3.5 text-sm font-black text-white hover:bg-rcb-red-hover active:scale-[0.98] transition-all shadow-lg shadow-rcb-red/25"
              >
                <span>Proceed to PayPal Checkout</span>
                <ArrowRight className="h-4 w-4" />
              </button>

              <div className="flex items-center justify-center gap-2 text-[10px] text-obsidian-400">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                <span>Deterministic pricing guarantee • PayPal REST v2 Sandbox</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal Dialog for PayPal Checkout */}
      <PayPalCheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        cart={cart}
        onPaymentSuccess={() => {
          setIsCheckoutOpen(false);
          onClearCart();
          onClose();
        }}
      />
    </div>
  );
}
