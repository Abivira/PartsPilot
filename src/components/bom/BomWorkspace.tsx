"use client";

import React, { useState } from "react";
import { BillOfMaterials, BomEntry } from "@/types/bom";
import { Part, ComponentCategory, CompatibilityTier } from "@prisma/client";
import { formatCurrency } from "@/lib/currency";
import { exportBomToCsv } from "@/lib/bom/generator";
import { assignCatalogueMatchToBomEntry } from "@/lib/bom/sourcing";
import { CatalogueSearchModal } from "./CatalogueSearchModal";
import {
  Layers,
  Download,
  ShoppingCart,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  FileText,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  RefreshCw,
  Info,
} from "lucide-react";

interface BomWorkspaceProps {
  bom: BillOfMaterials | null;
  onUpdateBom: (bom: BillOfMaterials) => void;
  onCartUpdated?: () => void;
  onOpenCart?: () => void;
}

export function BomWorkspace({
  bom,
  onUpdateBom,
  onCartUpdated,
  onOpenCart,
}: BomWorkspaceProps) {
  const [selectedEntryForSearch, setSelectedEntryForSearch] =
    useState<BomEntry | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [cartSuccessMessage, setCartSuccessMessage] = useState<string | null>(null);
  const [cartErrorMessage, setCartErrorMessage] = useState<string | null>(null);
  const [isNewEntryOpen, setIsNewEntryOpen] = useState(false);

  // New manual entry form state
  const [newPartName, setNewPartName] = useState("");
  const [newCategory, setNewCategory] = useState<ComponentCategory>(
    ComponentCategory.MOTOR_DRIVER
  );
  const [newMpn, setNewMpn] = useState("");
  const [newQty, setNewQty] = useState(1);

  if (!bom) {
    return (
      <div className="rounded-2xl border border-obsidian-800 bg-obsidian-900/40 p-8 text-center">
        <Layers className="mx-auto h-10 w-10 text-obsidian-600 mb-3" />
        <h3 className="text-base font-bold text-white">No Active Bill of Materials</h3>
        <p className="mt-1 text-xs text-obsidian-400 max-w-md mx-auto">
          Run a Hardware Fitment Diagnostic above and click{" "}
          <strong className="text-rcb-red">&ldquo;Generate Bill of Materials (BOM)&rdquo;</strong> to
          transform verified components into an interactive procurement list.
        </p>
      </div>
    );
  }

  // Sourcing metrics
  const totalEntries = bom.entries.length;
  const sourcedEntries = bom.entries.filter(
    (e) => e.resolutionStatus === "RESOLVED_CATALOGUE"
  );
  const unresolvedEntries = bom.entries.filter(
    (e) => e.resolutionStatus === "UNRESOLVED_AI" || e.resolutionStatus === "UNRESOLVED_CUSTOM"
  );
  const purchasableCount = sourcedEntries.filter((e) => e.isPurchasable).length;

  // Quantity updates
  const handleQuantityChange = (entryId: string, delta: number) => {
    const updatedEntries = bom.entries.map((entry) => {
      if (entry.id !== entryId) return entry;
      const newQuantity = Math.max(1, Math.min(100, entry.quantity + delta));
      const lineTotal =
        entry.unitPriceCents !== null && entry.unitPriceCents !== undefined
          ? entry.unitPriceCents * newQuantity
          : null;
      return { ...entry, quantity: newQuantity, totalPriceCents: lineTotal };
    });

    const newEstimatedTotal = updatedEntries.reduce(
      (sum, e) => sum + (e.totalPriceCents ?? 0),
      0
    );

    const resolved = updatedEntries.filter((e) => e.resolutionStatus === "RESOLVED_CATALOGUE").length;

    onUpdateBom({
      ...bom,
      entries: updatedEntries,
      totalEstimatedCents: newEstimatedTotal,
      resolvedCount: resolved,
      unresolvedCount: updatedEntries.length - resolved,
      updatedAt: new Date().toISOString(),
    });
  };

  // Remove row
  const handleRemoveEntry = (entryId: string) => {
    const updatedEntries = bom.entries.filter((e) => e.id !== entryId);
    const newEstimatedTotal = updatedEntries.reduce(
      (sum, e) => sum + (e.totalPriceCents ?? 0),
      0
    );
    const resolved = updatedEntries.filter((e) => e.resolutionStatus === "RESOLVED_CATALOGUE").length;

    onUpdateBom({
      ...bom,
      entries: updatedEntries,
      totalEstimatedCents: newEstimatedTotal,
      resolvedCount: resolved,
      unresolvedCount: updatedEntries.length - resolved,
      updatedAt: new Date().toISOString(),
    });
  };

  // Assign part from catalogue modal
  const handleAssignPart = (part: Part) => {
    if (!selectedEntryForSearch) return;

    const updatedEntry = assignCatalogueMatchToBomEntry(selectedEntryForSearch, part);

    const updatedEntries = bom.entries.map((e) =>
      e.id === updatedEntry.id ? updatedEntry : e
    );

    const newEstimatedTotal = updatedEntries.reduce(
      (sum, e) => sum + (e.totalPriceCents ?? 0),
      0
    );
    const resolved = updatedEntries.filter((e) => e.resolutionStatus === "RESOLVED_CATALOGUE").length;

    onUpdateBom({
      ...bom,
      entries: updatedEntries,
      totalEstimatedCents: newEstimatedTotal,
      resolvedCount: resolved,
      unresolvedCount: updatedEntries.length - resolved,
      updatedAt: new Date().toISOString(),
    });

    setSelectedEntryForSearch(null);
    setIsModalOpen(false);
  };

  // Add manual new entry
  const handleAddManualEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPartName.trim()) return;

    const newEntry: BomEntry = {
      id: `bom-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: newPartName.trim(),
      category: newCategory,
      mpn: newMpn.trim() || undefined,
      requiredSpecs: {},
      quantity: Math.max(1, newQty),
      confidence: 1.0,
      compatibilityTier: CompatibilityTier.UNVERIFIED,
      resolutionStatus: "UNRESOLVED_CUSTOM",
      userNotes: "Manual entry. Requires mapping to Neon catalogue before purchasing.",
      isPurchasable: false,
      unitPriceCents: null,
      totalPriceCents: null,
      stockAvailable: null,
      warnings: ["Manual entry. Requires mapping to Neon catalogue before purchasing."],
    };

    const updatedEntries = [...bom.entries, newEntry];
    const resolved = updatedEntries.filter((e) => e.resolutionStatus === "RESOLVED_CATALOGUE").length;

    onUpdateBom({
      ...bom,
      entries: updatedEntries,
      resolvedCount: resolved,
      unresolvedCount: updatedEntries.length - resolved,
      updatedAt: new Date().toISOString(),
    });

    setNewPartName("");
    setNewMpn("");
    setNewQty(1);
    setIsNewEntryOpen(false);
  };

  // Export CSV
  const handleExportCsv = () => {
    const csvContent = exportBomToCsv(bom);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `partspilot-bom-${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Add all sourced items to Cart
  const handleAddAllToCart = async () => {
    setCartSuccessMessage(null);
    setCartErrorMessage(null);
    setIsAddingToCart(true);

    try {
      const sourcedItems = bom.entries
        .filter((e) => e.matchedPartId && e.isPurchasable)
        .map((e) => ({
          partId: e.matchedPartId!,
          quantity: e.quantity,
        }));

      if (sourcedItems.length === 0) {
        setCartErrorMessage("No purchasable sourced items found in this BOM.");
        setIsAddingToCart(false);
        return;
      }

      const res = await fetch("/api/cart/from-bom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: bom.entries, items: sourcedItems }),
      });

      const data = await res.json();

      if (!res.ok) {
        setCartErrorMessage(data.error || "Failed to add BOM items to cart.");
      } else {
        setCartSuccessMessage(
          `Successfully added ${data.addedCount} items to your procurement cart!`
        );
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("cart-updated", {
              detail: {
                count: data.cart?.itemCount,
                itemCount: data.cart?.itemCount,
                cart: data.cart,
              },
            })
          );
          window.dispatchEvent(new CustomEvent("open-cart"));
        }
        if (onCartUpdated) onCartUpdated();
        if (onOpenCart) onOpenCart();
      }
    } catch (err) {
      console.error("Cart error:", err);
      setCartErrorMessage("Network error connecting to cart service.");
    } finally {
      setIsAddingToCart(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search & Map Modal */}
      <CatalogueSearchModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedEntryForSearch(null);
        }}
        onSelectPart={handleAssignPart}
        initialCategory={selectedEntryForSearch?.category}
        initialQuery={selectedEntryForSearch?.mpn || selectedEntryForSearch?.name || ""}
        entryName={selectedEntryForSearch?.name}
      />

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-obsidian-800 bg-obsidian-900/60 p-4">
          <div className="text-[11px] font-bold text-obsidian-400 uppercase tracking-wider">
            Total Components
          </div>
          <div className="mt-1 text-2xl font-black text-white">{totalEntries}</div>
          <div className="text-[11px] text-obsidian-400 mt-0.5">
            {purchasableCount} ready to procure
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-900/40 bg-emerald-950/20 p-4">
          <div className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
            Sourced Matches
          </div>
          <div className="mt-1 text-2xl font-black text-emerald-300">
            {sourcedEntries.length}
          </div>
          <div className="text-[11px] text-emerald-400/80 mt-0.5">
            Exact &amp; alternative stock
          </div>
        </div>

        <div className="rounded-2xl border border-amber-900/40 bg-amber-950/20 p-4">
          <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">
            Unresolved Items
          </div>
          <div className="mt-1 text-2xl font-black text-amber-300">
            {unresolvedEntries.length}
          </div>
          <div className="text-[11px] text-amber-400/80 mt-0.5">
            Requires manual mapping
          </div>
        </div>

        <div className="rounded-2xl border border-rcb-red/30 bg-rcb-red/10 p-4">
          <div className="text-[11px] font-bold text-rcb-red uppercase tracking-wider">
            Estimated Sourcing Cost
          </div>
          <div className="mt-1 text-2xl font-black text-white">
            {formatCurrency(bom.totalEstimatedCents)}
          </div>
          <div className="text-[11px] text-obsidian-300 mt-0.5">
            Server-verified pricing
          </div>
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-obsidian-800 bg-obsidian-900/70 p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsNewEntryOpen(!isNewEntryOpen)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-obsidian-700 bg-obsidian-800 px-3 py-2 text-xs font-bold text-white hover:bg-obsidian-700 transition-colors"
          >
            <Plus className="h-3.5 w-3.5 text-rcb-red" />
            <span>Add Component</span>
          </button>

          <button
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 rounded-xl border border-obsidian-700 bg-obsidian-800 px-3 py-2 text-xs font-bold text-white hover:bg-obsidian-700 transition-colors"
          >
            <Download className="h-3.5 w-3.5 text-obsidian-300" />
            <span>Export CSV</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleAddAllToCart}
            disabled={isAddingToCart || purchasableCount === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-rcb-red px-4 py-2 text-xs font-bold text-white hover:bg-rcb-red-hover active:scale-95 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isAddingToCart ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShoppingCart className="h-4 w-4" />
            )}
            <span>Add Sourced ({purchasableCount}) to Cart</span>
          </button>
        </div>
      </div>

      {/* Status Messages */}
      {cartSuccessMessage && (
        <div className="rounded-xl border border-emerald-800/60 bg-emerald-950/40 p-3 text-xs text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{cartSuccessMessage}</span>
        </div>
      )}

      {cartErrorMessage && (
        <div className="rounded-xl border border-rose-800/60 bg-rose-950/40 p-3 text-xs text-rose-300 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
          <span>{cartErrorMessage}</span>
        </div>
      )}

      {/* Manual Entry Inline Form */}
      {isNewEntryOpen && (
        <form
          onSubmit={handleAddManualEntry}
          className="rounded-2xl border border-obsidian-700 bg-obsidian-850 p-4 space-y-4 animate-in fade-in duration-200"
        >
          <div className="flex items-center justify-between border-b border-obsidian-750 pb-2">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Plus className="h-3.5 w-3.5 text-rcb-red" />
              <span>Add Custom Component to BOM</span>
            </h4>
            <button
              type="button"
              onClick={() => setIsNewEntryOpen(false)}
              className="text-xs text-obsidian-400 hover:text-white"
            >
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold text-obsidian-300 mb-1">
                Component Name *
              </label>
              <input
                type="text"
                required
                value={newPartName}
                onChange={(e) => setNewPartName(e.target.value)}
                placeholder="e.g. Custom NEMA17 Stepper"
                className="w-full rounded-xl border border-obsidian-700 bg-obsidian-900 px-3 py-2 text-xs font-medium text-white placeholder-obsidian-500 focus:border-rcb-red focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-obsidian-300 mb-1">
                Category
              </label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as ComponentCategory)}
                className="w-full rounded-xl border border-obsidian-700 bg-obsidian-900 px-3 py-2 text-xs font-semibold text-white focus:border-rcb-red focus:outline-none"
              >
                {Object.values(ComponentCategory).map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-obsidian-300 mb-1">
                MPN (Optional)
              </label>
              <input
                type="text"
                value={newMpn}
                onChange={(e) => setNewMpn(e.target.value)}
                placeholder="e.g. 17HS4401"
                className="w-full rounded-xl border border-obsidian-700 bg-obsidian-900 px-3 py-2 text-xs font-medium text-white placeholder-obsidian-500 focus:border-rcb-red focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="submit"
              className="rounded-xl bg-rcb-red px-4 py-2 text-xs font-bold text-white hover:bg-rcb-red-hover transition-colors"
            >
              Add Row to BOM
            </button>
          </div>
        </form>
      )}

      {/* BOM Items Table / Cards */}
      <div className="space-y-3">
        {bom.entries.map((entry, idx) => {
          const isSourced = entry.resolutionStatus === "RESOLVED_CATALOGUE";
          const isExpanded = expandedEntryId === entry.id;

          return (
            <div
              key={entry.id}
              className={`rounded-2xl border transition-all ${
                isSourced
                  ? "border-obsidian-800 bg-obsidian-900/60 hover:border-obsidian-700"
                  : "border-amber-900/30 bg-amber-950/10 hover:border-amber-800/40"
              }`}
            >
              {/* Main Row */}
              <div className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                {/* Left Info */}
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-obsidian-800 text-obsidian-300 text-xs font-mono font-bold mt-0.5">
                    {idx + 1}
                  </div>

                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm text-white truncate">
                        {entry.name}
                      </span>
                      {entry.mpn && (
                        <span className="rounded bg-obsidian-800 px-2 py-0.5 text-[10px] font-mono font-bold text-rcb-gold">
                          {entry.mpn}
                        </span>
                      )}
                      <span className="rounded bg-obsidian-800 px-2 py-0.5 text-[10px] font-bold text-obsidian-400 uppercase">
                        {entry.category}
                      </span>

                      {/* Status Badges */}
                      {entry.resolutionStatus === "RESOLVED_CATALOGUE" && (
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-950/80 border border-emerald-800 text-emerald-300 px-2 py-0.5 text-[10px] font-bold">
                          <CheckCircle2 className="h-3 w-3" />
                          <span>Sourced in Catalogue</span>
                        </span>
                      )}
                      {(entry.resolutionStatus === "UNRESOLVED_AI" ||
                        entry.resolutionStatus === "UNRESOLVED_CUSTOM") && (
                        <span className="inline-flex items-center gap-1 rounded bg-rose-950/80 border border-rose-800 text-rose-300 px-2 py-0.5 text-[10px] font-bold">
                          <HelpCircle className="h-3 w-3" />
                          <span>Unresolved Entry</span>
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-obsidian-400">
                      {entry.manufacturer && (
                        <span>
                          Mfr:{" "}
                          <strong className="text-obsidian-300">
                            {entry.manufacturer}
                          </strong>
                        </span>
                      )}

                      {entry.stockAvailable !== null && entry.stockAvailable !== undefined && (
                        <span
                          className={`font-semibold ${
                            entry.stockAvailable > 5
                              ? "text-emerald-400"
                              : entry.stockAvailable > 0
                              ? "text-amber-400"
                              : "text-rose-400"
                          }`}
                        >
                          Stock: {entry.stockAvailable} units
                        </span>
                      )}

                      {entry.datasheetUrl && (
                        <a
                          href={entry.datasheetUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-rcb-red hover:underline"
                        >
                          <FileText className="h-3 w-3" />
                          <span>Datasheet</span>
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      )}
                    </div>

                    {/* Warnings */}
                    {entry.warnings && entry.warnings.length > 0 && (
                      <div className="pt-1">
                        {entry.warnings.map((warn, wIdx) => (
                          <p
                            key={wIdx}
                            className="text-[11px] text-amber-300/90 flex items-center gap-1"
                          >
                            <AlertTriangle className="h-3 w-3 shrink-0 text-amber-400" />
                            <span>{warn}</span>
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Controls: Quantity, Price, Actions */}
                <div className="flex flex-wrap items-center justify-between lg:justify-end gap-4 shrink-0 pt-2 lg:pt-0 border-t border-obsidian-800 lg:border-none">
                  {/* Quantity Controller */}
                  <div className="flex items-center rounded-xl border border-obsidian-700 bg-obsidian-950 p-1">
                    <button
                      type="button"
                      onClick={() => handleQuantityChange(entry.id, -1)}
                      disabled={entry.quantity <= 1}
                      className="h-6 w-6 rounded-lg bg-obsidian-800 text-obsidian-300 hover:bg-obsidian-700 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center font-bold text-xs"
                    >
                      -
                    </button>
                    <span className="w-8 text-center font-mono font-bold text-xs text-white">
                      {entry.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleQuantityChange(entry.id, 1)}
                      disabled={
                        entry.stockAvailable !== null && entry.stockAvailable !== undefined
                          ? entry.quantity >= entry.stockAvailable
                          : entry.quantity >= 100
                      }
                      className="h-6 w-6 rounded-lg bg-obsidian-800 text-obsidian-300 hover:bg-obsidian-700 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center font-bold text-xs"
                    >
                      +
                    </button>
                  </div>

                  {/* Financial Breakdown */}
                  <div className="text-right min-w-[90px]">
                    {entry.unitPriceCents !== null && entry.unitPriceCents !== undefined && entry.totalPriceCents !== null && entry.totalPriceCents !== undefined ? (
                      <>
                        <div className="font-mono font-bold text-sm text-white">
                          {formatCurrency(entry.totalPriceCents)}
                        </div>
                        <div className="text-[10px] text-obsidian-400 font-mono">
                          {formatCurrency(entry.unitPriceCents)} / unit
                        </div>
                      </>
                    ) : (
                      <span className="text-xs text-obsidian-500 italic">Unpriced</span>
                    )}
                  </div>

                  {/* Sourcing Modal Trigger */}
                  <button
                    onClick={() => {
                      setSelectedEntryForSearch(entry);
                      setIsModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1 rounded-xl border border-obsidian-700 bg-obsidian-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-obsidian-700 transition-colors"
                  >
                    <RefreshCw className="h-3 w-3 text-rcb-gold" />
                    <span>{isSourced ? "Replace" : "Source"}</span>
                  </button>

                  {/* Technical Specs Toggle */}
                  <button
                    onClick={() =>
                      setExpandedEntryId(isExpanded ? null : entry.id)
                    }
                    className="rounded-xl p-2 text-obsidian-400 hover:bg-obsidian-800 hover:text-white transition-colors"
                    title="Toggle Specs"
                  >
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>

                  {/* Delete Row */}
                  <button
                    onClick={() => handleRemoveEntry(entry.id)}
                    className="rounded-xl p-2 text-obsidian-500 hover:bg-rose-950/60 hover:text-rose-300 transition-colors"
                    title="Delete entry"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Expandable Technical Specs Drawer */}
              {isExpanded && (
                <div className="border-t border-obsidian-800 bg-obsidian-950/70 p-4 space-y-3 rounded-b-2xl">
                  <div className="flex items-center gap-2 text-xs font-bold text-obsidian-300 uppercase tracking-wider">
                    <Info className="h-3.5 w-3.5 text-rcb-red" />
                    <span>Technical Constraints &amp; Provenance</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
                    <div className="rounded-xl bg-obsidian-900 border border-obsidian-800 p-2.5">
                      <span className="text-[10px] text-obsidian-400 block font-bold">
                        Compatibility Tier
                      </span>
                      <span className="font-semibold text-white">
                        {entry.compatibilityTier}
                      </span>
                    </div>

                    <div className="rounded-xl bg-obsidian-900 border border-obsidian-800 p-2.5">
                      <span className="text-[10px] text-obsidian-400 block font-bold">
                        Identification Confidence
                      </span>
                      <span className="font-semibold text-emerald-400">
                        {(entry.confidence * 100).toFixed(0)}%
                      </span>
                    </div>

                    <div className="rounded-xl bg-obsidian-900 border border-obsidian-800 p-2.5">
                      <span className="text-[10px] text-obsidian-400 block font-bold">
                        Datasheet Source
                      </span>
                      <span className="font-semibold text-white truncate block">
                        {entry.specificationSource || "Not documented"}
                      </span>
                    </div>

                    <div className="rounded-xl bg-obsidian-900 border border-obsidian-800 p-2.5">
                      <span className="text-[10px] text-obsidian-400 block font-bold">
                        Purchasable Status
                      </span>
                      <span
                        className={`font-semibold ${
                          entry.isPurchasable ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {entry.isPurchasable ? "YES (Live Stock)" : "NO (Demo/Unresolved)"}
                      </span>
                    </div>
                  </div>

                  {entry.requiredSpecs && Object.keys(entry.requiredSpecs).length > 0 && (
                    <div className="pt-1">
                      <span className="text-[10px] font-bold text-obsidian-400 uppercase tracking-wider block mb-1">
                        Extracted Specifications
                      </span>
                      <pre className="rounded-xl bg-obsidian-900 border border-obsidian-800 p-3 text-[11px] font-mono text-obsidian-300 overflow-x-auto">
                        {JSON.stringify(entry.requiredSpecs, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
