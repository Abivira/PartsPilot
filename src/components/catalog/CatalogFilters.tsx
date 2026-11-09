"use client";

import React from "react";
import { ComponentCategory } from "@prisma/client";
import { Search, X, SlidersHorizontal } from "lucide-react";

export type FilterCategory = ComponentCategory | "ALL";

interface CatalogFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedCategory: FilterCategory;
  onCategoryChange: (category: FilterCategory) => void;
  totalCount: number;
  filteredCount: number;
}

const CATEGORY_OPTIONS: Array<{ value: FilterCategory; label: string }> = [
  { value: "ALL", label: "All Items" },
  { value: ComponentCategory.MOTOR_DRIVER, label: "Motor Drivers" },
  { value: ComponentCategory.MICROCONTROLLER, label: "Microcontrollers" },
  { value: ComponentCategory.SENSOR, label: "Sensors & IMUs" },
  { value: ComponentCategory.MOTOR, label: "Stepper Motors" },
  { value: ComponentCategory.POWER_MODULE, label: "Power Regulators" },
  { value: ComponentCategory.CONNECTOR, label: "Connectors" },
];

export function CatalogFilters({
  searchQuery,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
  totalCount,
  filteredCount,
}: CatalogFiltersProps) {
  return (
    <div className="space-y-4 rounded-2xl border border-obsidian-800 bg-obsidian-900/80 p-4 sm:p-5 shadow-lg backdrop-blur-md">
      {/* Search Input & Status */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-obsidian-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search parts by MPN (e.g. TMC2209), brand, or voltage..."
            className="w-full rounded-xl border border-obsidian-700 bg-obsidian-950 py-2.5 pl-10 pr-10 text-sm text-white placeholder-obsidian-400 transition-all focus:border-rcb-red focus:ring-2 focus:ring-rcb-red/20 focus:outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-obsidian-400 hover:text-white"
              title="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-obsidian-400 shrink-0 font-medium px-1">
          <SlidersHorizontal className="h-3.5 w-3.5 text-rcb-red" />
          <span>
            <strong className="text-white font-bold">{filteredCount}</strong> of {totalCount} in stock
          </span>
        </div>
      </div>

      {/* Category Pills */}
      <div className="flex flex-wrap gap-2 pt-1">
        {CATEGORY_OPTIONS.map((cat) => {
          const isSelected = selectedCategory === cat.value;
          return (
            <button
              key={cat.value}
              onClick={() => onCategoryChange(cat.value)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                isSelected
                  ? "bg-rcb-red text-white shadow-md shadow-red-950/60 scale-105"
                  : "bg-obsidian-850 text-obsidian-300 border border-obsidian-800 hover:border-obsidian-700 hover:text-white"
              }`}
            >
              {cat.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
