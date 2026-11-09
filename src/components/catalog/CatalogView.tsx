"use client";

import React, { useState, useMemo } from "react";
import { Part } from "@prisma/client";
import { ComponentCard } from "./ComponentCard";
import { CatalogFilters, FilterCategory } from "./CatalogFilters";
import { Database, AlertCircle, RefreshCw, Layers } from "lucide-react";

interface CatalogViewProps {
  initialParts: Part[];
  isConnected: boolean;
  errorMessage?: string;
}

export function CatalogView({
  initialParts,
  isConnected,
  errorMessage,
}: CatalogViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<FilterCategory>("ALL");

  const filteredParts = useMemo(() => {
    return initialParts.filter((part) => {
      if (selectedCategory !== "ALL" && part.category !== selectedCategory) {
        return false;
      }

      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase().trim();
        const matchesMpn = part.mpn.toLowerCase().includes(q);
        const matchesName = part.name.toLowerCase().includes(q);
        const matchesMfg = part.manufacturer.toLowerCase().includes(q);
        const matchesDesc = part.description.toLowerCase().includes(q);
        const matchesSku = part.sku.toLowerCase().includes(q);
        const matchesSpecs = JSON.stringify(part.specs).toLowerCase().includes(q);

        return (
          matchesMpn ||
          matchesName ||
          matchesMfg ||
          matchesDesc ||
          matchesSku ||
          matchesSpecs
        );
      }

      return true;
    });
  }, [initialParts, selectedCategory, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Database Warning only if disconnected */}
      {!isConnected && (
        <div className="rounded-2xl border border-amber-900/60 bg-amber-950/20 p-5 text-obsidian-200">
          <div className="flex items-start gap-3">
            <Database className="h-5 w-5 text-rcb-gold shrink-0 mt-0.5" />
            <div className="space-y-2 flex-1">
              <span className="text-sm font-bold text-rcb-gold">
                DATABASE CONFIGURATION PENDING
              </span>
              <p className="text-xs text-obsidian-300">
                Configure your Neon database in <code className="text-white">.env</code> to activate live inventory queries.
              </p>
              {errorMessage && (
                <div className="text-[11px] text-obsidian-400 italic">
                  Status: {errorMessage}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <CatalogFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        totalCount={initialParts.length}
        filteredCount={filteredParts.length}
      />

      {/* Grid of Component Cards */}
      {filteredParts.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {filteredParts.map((part) => (
            <ComponentCard key={part.id} part={part} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-obsidian-800 bg-obsidian-950/50 p-12 text-center">
          {initialParts.length === 0 ? (
            <div className="mx-auto max-w-md space-y-3">
              <Layers className="mx-auto h-10 w-10 text-obsidian-600" />
              <h3 className="text-base font-bold text-white">
                No Database Records Seeded Yet
              </h3>
              <p className="text-xs text-obsidian-400">
                Run <code className="text-rcb-red font-mono">npm run seed</code> to populate the 9 catalog parts.
              </p>
            </div>
          ) : (
            <div className="mx-auto max-w-md space-y-3">
              <AlertCircle className="mx-auto h-10 w-10 text-obsidian-600" />
              <h3 className="text-base font-bold text-white">
                No Matching Parts Found
              </h3>
              <p className="text-xs text-obsidian-400">
                No components match your search &ldquo;{searchQuery}&rdquo;. Try searching for an MPN like{" "}
                <span className="font-semibold text-rcb-red">TMC2209</span>,{" "}
                <span className="font-semibold text-rcb-red">ESP32</span>, or{" "}
                <span className="font-semibold text-rcb-red">MPU-6050</span>.
              </p>
              <button
                onClick={() => {
                  setSearchQuery("");
                  setSelectedCategory("ALL");
                }}
                className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-obsidian-850 border border-obsidian-700 px-4 py-2 text-xs font-bold text-white hover:bg-rcb-red hover:border-rcb-red transition-all"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Reset Filters</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
