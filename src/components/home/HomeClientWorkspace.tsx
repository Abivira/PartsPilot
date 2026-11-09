"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Part } from "@prisma/client";
import { CatalogPartFixture } from "@/lib/catalog/fixtures";
import { DiagnoseResponse } from "@/types/ai";
import { BillOfMaterials } from "@/types/bom";
import { CartResponse } from "@/types/cart";
import { generateBomFromDiagnostic } from "@/lib/bom/generator";
import { DiagnosticIntake } from "@/components/diagnosis/DiagnosticIntake";
import { BomWorkspace } from "@/components/bom/BomWorkspace";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { Layers, ShoppingCart } from "lucide-react";

interface HomeClientWorkspaceProps {
  availablePartsForDiagnostic: Array<Part | CatalogPartFixture>;
  isUsingFixtures: boolean;
}

export function HomeClientWorkspace({
  availablePartsForDiagnostic,
  isUsingFixtures,
}: HomeClientWorkspaceProps) {
  const [activeBom, setActiveBom] = useState<BillOfMaterials | null>(null);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [cart, setCart] = useState<CartResponse | null>(null);
  const [isCartLoading, setIsCartLoading] = useState<boolean>(false);

  // Fetch / refresh cart from server
  const refreshCart = useCallback(async () => {
    setIsCartLoading(true);
    try {
      const res = await fetch("/api/cart");
      if (res.ok) {
        const data: CartResponse = await res.json();
        setCart(data);
        // Sync Navbar badge
        window.dispatchEvent(
          new CustomEvent("cart-updated", { detail: { count: data.itemCount } })
        );
      }
    } catch (err) {
      console.warn("Failed to fetch cart:", err);
    } finally {
      setIsCartLoading(false);
    }
  }, []);

  // Initial cart load & event listener for Navbar toggle
  useEffect(() => {
    refreshCart();

    const handleToggleCart = () => {
      setIsCartOpen((prev) => {
        const next = !prev;
        if (next) refreshCart();
        return next;
      });
    };

    const handleOpenCartDirect = () => {
      setIsCartOpen(true);
      refreshCart();
    };

    const handleCartUpdated = (e: Event) => {
      const customEvt = e as CustomEvent<any>;
      const newCart =
        customEvt.detail?.cart || (customEvt.detail?.items ? customEvt.detail : null);
      if (newCart) {
        setCart(newCart);
      } else {
        refreshCart();
      }
    };

    window.addEventListener("toggle-cart", handleToggleCart);
    window.addEventListener("open-cart", handleOpenCartDirect);
    window.addEventListener("cart-updated", handleCartUpdated);

    return () => {
      window.removeEventListener("toggle-cart", handleToggleCart);
      window.removeEventListener("open-cart", handleOpenCartDirect);
      window.removeEventListener("cart-updated", handleCartUpdated);
    };
  }, [refreshCart]);

  // Handler to generate BOM from diagnostic
  const handleGenerateBom = (diagnosticResult: DiagnoseResponse) => {
    const bom = generateBomFromDiagnostic({
      diagnoseResponse: diagnosticResult,
      suggestedCompanionParts: [],
    });
    setActiveBom(bom);

    // Smooth scroll to BOM section
    setTimeout(() => {
      const el = document.getElementById("bom-workspace-section");
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
      }
    }, 150);
  };

  // Cart operations
  const handleUpdateQuantity = async (orderItemId: string, quantity: number) => {
    try {
      const res = await fetch("/api/cart/items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: orderItemId, orderItemId, quantity }),
      });
      if (res.ok) {
        const updatedCart: CartResponse = await res.json();
        setCart(updatedCart);
        window.dispatchEvent(
          new CustomEvent("cart-updated", {
            detail: { count: updatedCart.itemCount, cart: updatedCart },
          })
        );
      }
    } catch (err) {
      console.error("Failed to update cart item:", err);
    }
  };

  const handleRemoveItem = async (orderItemId: string) => {
    try {
      const res = await fetch("/api/cart/items", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: orderItemId, orderItemId }),
      });
      if (res.ok) {
        const updatedCart: CartResponse = await res.json();
        setCart(updatedCart);
        window.dispatchEvent(
          new CustomEvent("cart-updated", {
            detail: { count: updatedCart.itemCount, cart: updatedCart },
          })
        );
      }
    } catch (err) {
      console.error("Failed to remove cart item:", err);
    }
  };

  const handleClearCart = async () => {
    try {
      const res = await fetch("/api/cart", {
        method: "DELETE",
      });
      if (res.ok) {
        const updatedCart: CartResponse = await res.json();
        setCart(updatedCart);
        window.dispatchEvent(
          new CustomEvent("cart-updated", {
            detail: { count: updatedCart.itemCount },
          })
        );
      }
    } catch (err) {
      console.error("Failed to clear cart:", err);
    }
  };

  return (
    <div className="space-y-12">
      {/* SECTION 1: Hardware Fitment Diagnostic Intake */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-obsidian-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rcb-red text-white text-xs font-black shadow-md">
              1
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                <span>Hardware Fitment Diagnostic</span>
                <span className="text-[10px] rounded-full bg-emerald-950/80 border border-emerald-800 text-emerald-300 px-2 py-0.5 font-bold">
                  LIVE
                </span>
              </h2>
              <p className="text-xs text-obsidian-400">
                Select a part and host board to test electrical safety and protocol compatibility.
              </p>
            </div>
          </div>
        </div>

        <DiagnosticIntake
          availableComponents={availablePartsForDiagnostic}
          isUsingFixtures={isUsingFixtures}
          onGenerateBom={handleGenerateBom}
        />
      </section>

      {/* SECTION 2: Interactive Bill of Materials (BOM) & Sourcing */}
      <section id="bom-workspace-section" className="space-y-4 pt-2">
        <div className="flex items-center justify-between border-b border-obsidian-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-rcb-red to-rcb-gold text-white text-xs font-black shadow-md">
              2
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                <span>Interactive Bill of Materials (BOM) &amp; Sourcing</span>
                <span className="text-[10px] rounded-full bg-rcb-red/20 border border-rcb-red/40 text-rcb-red px-2 py-0.5 font-bold font-mono">
                  Phase 4
                </span>
              </h2>
              <p className="text-xs text-obsidian-400">
                Map verified components to live Neon stock, resolve unpriced parts, and export CSV.
              </p>
            </div>
          </div>

          {activeBom && (
            <div className="text-xs text-obsidian-400 font-mono hidden sm:block">
              {activeBom.entries.length} items listed
            </div>
          )}
        </div>

        <BomWorkspace
          bom={activeBom}
          onUpdateBom={setActiveBom}
          onCartUpdated={refreshCart}
          onOpenCart={() => setIsCartOpen(true)}
        />
      </section>

      {/* Slide-over Cart Drawer */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cart={cart}
        isLoading={isCartLoading}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveItem}
        onClearCart={handleClearCart}
        onRefresh={refreshCart}
      />
    </div>
  );
}
