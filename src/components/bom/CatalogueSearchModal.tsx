"use client";

import React, { useState, useEffect } from "react";
import { Part, ComponentCategory } from "@prisma/client";
import { formatCurrency } from "@/lib/currency";
import {
  Search,
  X,
  CheckCircle2,
  AlertTriangle,
  FileText,
  ExternalLink,
  Cpu,
  Layers,
  Loader2,
} from "lucide-react";

interface CatalogueSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPart: (part: Part) => void;
  initialCategory?: ComponentCategory;
  initialQuery?: string;
  entryName?: string;
}

export function CatalogueSearchModal({
  isOpen,
  onClose,
  onSelectPart,
  initialCategory,
  initialQuery = "",
  entryName,
}: CatalogueSearchModalProps) {
  const [searchTerm, setSearchTerm] = useState(initialQuery);
  const [selectedCategory, setSelectedCategory] = useState<string>(
    initialCategory || "ALL"
  );
  const [results, setResults] = useState<Part[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSearchTerm(initialQuery);
      setSelectedCategory(initialCategory || "ALL");
      executeSearch(initialQuery, initialCategory);
    }
  }, [isOpen, initialQuery, initialCategory]);

  const executeSearch = async (queryStr: string, cat?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (queryStr.trim()) params.set("q", queryStr.trim());
      if (cat && cat !== "ALL") params.set("category", cat);

      const res = await fetch(`/api/bom/search?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.parts || []);
      }
    } catch (err) {
      console.warn("Failed to search catalogue:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeSearch(searchTerm, selectedCategory);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl border border-obsidian-800 bg-obsidian-950 p-6 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-obsidian-800 pb-4">
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Layers className="h-5 w-5 text-rcb-red" />
              <span>Map Catalogue Component</span>
            </h3>
            {entryName && (
              <p className="text-xs text-obsidian-400">
                Assigning catalogue match for:{" "}
                <span className="text-white font-mono font-semibold">{entryName}</span>
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-obsidian-400 hover:bg-obsidian-850 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search Bar & Filters */}
        <form onSubmit={handleSearchSubmit} className="pt-4 pb-2 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-3 h-4 w-4 text-obsidian-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by part number (e.g. TMC2209), name, or manufacturer..."
                className="w-full rounded-xl border border-obsidian-700 bg-obsidian-900 py-2.5 pl-10 pr-4 text-xs font-medium text-white placeholder-obsidian-500 focus:border-rcb-red focus:outline-none"
              />
            </div>
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                executeSearch(searchTerm, e.target.value);
              }}
              className="rounded-xl border border-obsidian-700 bg-obsidian-900 px-3 py-2 text-xs font-semibold text-white focus:border-rcb-red focus:outline-none"
            >
              <option value="ALL">All Categories</option>
              {Object.values(ComponentCategory).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-xl bg-rcb-red px-4 py-2 text-xs font-bold text-white hover:bg-red-700 transition-colors"
            >
              Search
            </button>
          </div>
        </form>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1 pt-2">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-obsidian-400 gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-rcb-red" />
              <span className="text-xs">Querying Neon catalogue...</span>
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-obsidian-400 gap-2 text-center">
              <Cpu className="h-8 w-8 text-obsidian-600" />
              <span className="text-sm font-semibold text-white">No components found</span>
              <p className="text-xs max-w-sm">
                Try searching for broader keywords like driver, sensor, esp32, or regulator.
              </p>
            </div>
          ) : (
            results.map((part) => {
              const stock = Math.max(0, part.stockOnHand - part.stockReserved);
              const isDemo = part.isDemonstrationSample;

              return (
                <div
                  key={part.id}
                  className="rounded-xl border border-obsidian-800 bg-obsidian-900/60 p-4 transition-all hover:border-obsidian-700 hover:bg-obsidian-900 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-sm text-white">
                        {part.mpn}
                      </span>
                      <span className="rounded bg-obsidian-800 px-2 py-0.5 text-[10px] font-bold text-rcb-gold uppercase">
                        {part.category}
                      </span>
                      {isDemo && (
                        <span className="rounded bg-amber-950/80 border border-amber-800 text-amber-300 px-2 py-0.5 text-[10px] font-bold">
                          DEMO SAMPLE
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-medium text-white truncate">{part.name}</p>
                    <p className="text-[11px] text-obsidian-400">
                      Manufacturer: <span className="text-obsidian-300">{part.manufacturer}</span>
                    </p>

                    <div className="flex items-center gap-3 text-[11px] pt-1">
                      <span className="text-emerald-400 font-bold">
                        Stock: {stock} units
                      </span>
                      <span className="text-obsidian-500">•</span>
                      <span className="text-white font-mono font-bold">
                        {formatCurrency(part.priceCents)}
                      </span>
                      {part.datasheetUrl && (
                        <>
                          <span className="text-obsidian-500">•</span>
                          <a
                            href={part.datasheetUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-rcb-red hover:underline"
                          >
                            <FileText className="h-3 w-3" />
                            <span>Datasheet</span>
                            <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        </>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      onSelectPart(part);
                      onClose();
                    }}
                    className="self-start sm:self-center shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-rcb-red px-4 py-2 text-xs font-bold text-white hover:bg-rcb-red-hover active:scale-95 transition-all shadow-md"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Select Part</span>
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
