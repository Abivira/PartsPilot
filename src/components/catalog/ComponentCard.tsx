"use client";

import React, { useState } from "react";
import { Part, ComponentCategory } from "@prisma/client";
import { formatCurrency } from "@/lib/currency";
import { SpecSummary } from "./SpecSummary";
import {
  FileText,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Cpu,
  Activity,
  Gauge,
  Cable,
  Layers,
  ArrowUpRight,
  ShoppingCart,
  Loader2,
} from "lucide-react";

interface ComponentCardProps {
  part: Part;
}

function getCategoryMeta(category: ComponentCategory) {
  switch (category) {
    case ComponentCategory.MOTOR_DRIVER:
      return {
        label: "Motor Driver",
        icon: Zap,
        colorClass: "bg-red-950/60 text-rcb-red border-rcb-red/30",
      };
    case ComponentCategory.MICROCONTROLLER:
      return {
        label: "Microcontroller",
        icon: Cpu,
        colorClass: "bg-obsidian-850 text-white border-obsidian-700",
      };
    case ComponentCategory.SENSOR:
      return {
        label: "Sensor & IMU",
        icon: Activity,
        colorClass: "bg-emerald-950/50 text-emerald-300 border-emerald-800/40",
      };
    case ComponentCategory.MOTOR:
      return {
        label: "Motor / Actuator",
        icon: Gauge,
        colorClass: "bg-amber-950/40 text-rcb-gold border-amber-800/40",
      };
    case ComponentCategory.POWER_MODULE:
      return {
        label: "Power Regulation",
        icon: Zap,
        colorClass: "bg-red-950/40 text-red-300 border-red-800/30",
      };
    case ComponentCategory.CONNECTOR:
      return {
        label: "Connector Header",
        icon: Cable,
        colorClass: "bg-obsidian-800 text-obsidian-200 border-obsidian-700",
      };
    default:
      return {
        label: "Component",
        icon: Layers,
        colorClass: "bg-obsidian-850 text-obsidian-300 border-obsidian-700",
      };
  }
}

export function ComponentCard({ part }: ComponentCardProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [isAdded, setIsAdded] = useState(false);

  const meta = getCategoryMeta(part.category);
  const Icon = meta.icon;
  const specsObject = (part.specs as Record<string, unknown>) ?? {};
  const inStock = part.stockOnHand > 0;
  const isDemo = part.isDemonstrationSample;

  const handleAddToCart = async () => {
    if (!inStock || isDemo || isAdding) return;
    setIsAdding(true);

    try {
      const res = await fetch("/api/cart/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partId: part.id, quantity: 1 }),
      });

      if (res.ok) {
        const cartData = await res.json();
        setIsAdded(true);
        window.dispatchEvent(
          new CustomEvent("cart-updated", {
            detail: { count: cartData.itemCount, itemCount: cartData.itemCount, cart: cartData },
          })
        );
        window.dispatchEvent(new CustomEvent("open-cart"));
        setTimeout(() => setIsAdded(false), 2000);
      }
    } catch (err) {
      console.warn("Failed to add component to cart:", err);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="group relative flex flex-col justify-between rounded-2xl border border-obsidian-800 bg-obsidian-900/90 p-5 transition-all duration-300 hover:border-rcb-red/80 hover:bg-obsidian-850 hover:shadow-2xl hover:shadow-red-950/50">
      {/* Top Header */}
      <div>
        <div className="flex items-center justify-between gap-2 pb-3">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold tracking-wide ${meta.colorClass}`}
            >
              <Icon className="h-3 w-3" />
              {meta.label}
            </span>
          </div>

          <span className="text-[11px] font-mono text-obsidian-400">
            {part.manufacturer}
          </span>
        </div>

        {/* MPN & Title */}
        <div className="mt-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-rcb-red uppercase tracking-wider">
              MPN: {part.mpn}
            </span>
          </div>

          <h3 className="mt-1 text-base font-bold text-white group-hover:text-rcb-red transition-colors line-clamp-1">
            {part.name}
          </h3>

          <p className="mt-1.5 text-xs text-obsidian-300 line-clamp-2 leading-relaxed">
            {part.description}
          </p>
        </div>

        {/* Feature Badges */}
        <div className="mt-4">
          <SpecSummary specs={specsObject} />
        </div>

        {/* Supported Ecosystems */}
        {part.supportedPlatforms && part.supportedPlatforms.length > 0 && (
          <div className="mt-3.5 flex flex-wrap gap-1.5">
            {part.supportedPlatforms.slice(0, 3).map((platform, idx) => (
              <span
                key={idx}
                className="rounded-lg bg-obsidian-950 border border-obsidian-800 px-2 py-0.5 text-[10px] font-medium text-obsidian-300"
              >
                {platform}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-5 border-t border-obsidian-800 pt-3.5 space-y-3">
        {/* Provenance & Datasheet */}
        <div className="flex items-center justify-between text-xs text-obsidian-400">
          <div
            className="flex items-center gap-1.5 truncate max-w-[65%]"
            title={part.specificationSource}
          >
            {part.isDemonstrationSample ? (
              <>
                <AlertTriangle className="h-3.5 w-3.5 text-rcb-gold shrink-0" />
                <span className="truncate text-rcb-gold text-[11px] font-medium">
                  Demo Specification
                </span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                <span className="truncate text-obsidian-300 text-[11px]">
                  Verified Datasheet
                </span>
              </>
            )}
          </div>

          {part.datasheetUrl && (
            <a
              href={part.datasheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-full bg-obsidian-800 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-rcb-red hover:text-white transition-colors"
            >
              <FileText className="h-3 w-3" />
              <span>Datasheet</span>
              <ArrowUpRight className="h-2.5 w-2.5 opacity-70" />
            </a>
          )}
        </div>

        {/* Price, Stock & Add to Cart Action */}
        <div className="flex items-center justify-between pt-1 gap-2">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <span
                className={`h-2 w-2 rounded-full ${
                  inStock
                    ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                    : "bg-red-500"
                }`}
              />
              <span className="text-[11px] font-semibold text-obsidian-300">
                {inStock ? `${part.stockOnHand} In Stock` : "Backordered"}
              </span>
            </div>

            <div className="text-base sm:text-lg font-black text-white font-mono">
              {formatCurrency(part.priceCents, part.currency)}
            </div>
          </div>

          <button
            onClick={handleAddToCart}
            disabled={!inStock || isDemo || isAdding}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-all shadow-md active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${
              isAdded
                ? "bg-emerald-600 text-white"
                : "bg-rcb-red hover:bg-rcb-red-hover text-white shadow-red-950/40"
            }`}
          >
            {isAdding ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : isAdded ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Added!</span>
              </>
            ) : (
              <>
                <ShoppingCart className="h-3.5 w-3.5" />
                <span>Add to Cart</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
