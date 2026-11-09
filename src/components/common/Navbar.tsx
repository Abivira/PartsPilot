"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Zap, ShoppingCart } from "lucide-react";

export function Navbar({ isDbConnected = false }: { isDbConnected?: boolean }) {
  const [cartCount, setCartCount] = useState<number>(0);

  useEffect(() => {
    // Initial fetch of cart item count
    fetch("/api/cart")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data.itemCount === "number") {
          setCartCount(data.itemCount);
        }
      })
      .catch(() => {});

    // Listen for custom cart update events
    const handleCartUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<any>;
      const count =
        customEvent.detail?.count ??
        customEvent.detail?.itemCount ??
        customEvent.detail?.cart?.itemCount;
      if (typeof count === "number") {
        setCartCount(count);
      } else {
        fetch("/api/cart")
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data && typeof data.itemCount === "number") {
              setCartCount(data.itemCount);
            }
          })
          .catch(() => {});
      }
    };

    window.addEventListener("cart-updated", handleCartUpdated);
    return () => window.removeEventListener("cart-updated", handleCartUpdated);
  }, []);

  const handleOpenCart = () => {
    window.dispatchEvent(new CustomEvent("toggle-cart"));
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-obsidian-800 bg-obsidian-950/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-3 group">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-rcb-red to-rcb-red-dark text-white shadow-lg shadow-red-900/40 group-hover:scale-105 transition-transform">
            <Zap className="h-5 w-5 fill-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-black tracking-tight text-white font-sans">
                PARTS<span className="text-rcb-red">PILOT</span>
              </span>
              <span className="rounded-full bg-rcb-red/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rcb-red border border-rcb-red/30">
                PRO
              </span>
            </div>
            <p className="hidden text-[11px] text-obsidian-400 sm:block font-medium">
              Robotics Hardware Fitment &amp; Procurement
            </p>
          </div>
        </Link>

        {/* Center / Hackathon Badge */}
        <div className="hidden md:flex items-center gap-3 rounded-full border border-obsidian-800 bg-obsidian-900/90 px-4 py-1.5 text-xs text-obsidian-300 shadow-inner">
          <span className="h-2 w-2 rounded-full bg-rcb-red animate-pulse" />
          <span className="font-semibold text-white">PAYPAL AI HACKATHON 2026</span>
          <span className="text-obsidian-600">•</span>
          <span className="text-rcb-gold font-medium">Verified Engineering Specs</span>
        </div>

        {/* Right Section: Cart Trigger & Database Status Pill */}
        <div className="flex items-center gap-3">
          {/* Cart Trigger */}
          <button
            onClick={handleOpenCart}
            className="relative flex items-center gap-2 rounded-full border border-obsidian-750 bg-obsidian-900 px-3.5 py-1.5 text-xs font-bold text-white hover:border-rcb-red hover:bg-obsidian-850 active:scale-95 transition-all shadow-sm"
            aria-label="View Shopping Cart"
          >
            <ShoppingCart className="h-4 w-4 text-rcb-red" />
            <span className="hidden sm:inline">Cart</span>
            {cartCount > 0 ? (
              <span className="rounded-full bg-rcb-red px-2 py-0.5 text-[10px] font-black text-white">
                {cartCount}
              </span>
            ) : (
              <span className="text-obsidian-400 text-[11px]">0</span>
            )}
          </button>

          {/* Database Status Pill */}
          <div
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm transition-all ${
              isDbConnected
                ? "border-emerald-500/30 bg-emerald-950/40 text-emerald-300"
                : "border-obsidian-700 bg-obsidian-900 text-obsidian-400"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                isDbConnected
                  ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                  : "bg-obsidian-500"
              }`}
            />
            <span className="font-semibold hidden sm:inline">
              {isDbConnected ? "NEON POSTGRES: LIVE" : "OFFLINE FIXTURES"}
            </span>
            <span className="font-semibold sm:hidden">
              {isDbConnected ? "NEON" : "OFFLINE"}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
