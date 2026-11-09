import React from "react";
import { getCatalogParts } from "@/lib/catalog/service";
import { CATALOG_FIXTURES } from "@/lib/catalog/fixtures";
import { CatalogView } from "@/components/catalog/CatalogView";
import { HomeClientWorkspace } from "@/components/home/HomeClientWorkspace";
import { Zap, ShieldCheck, Cpu, Sparkles } from "lucide-react";

export const revalidate = 0; // Dynamic server component

export default async function HomePage() {
  const { parts, isConnected, errorMessage } = await getCatalogParts();

  const availablePartsForDiagnostic =
    parts && parts.length > 0 ? parts : CATALOG_FIXTURES;
  const isUsingFixtures = !isConnected || parts.length === 0;

  return (
    <div className="relative min-h-screen">
      {/* RCB Ambient Glow Header */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 ambient-glow pointer-events-none" />

      <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-12">
        {/* Human Hero Section (Mobile App Style) */}
        <section className="text-center sm:text-left space-y-4 pt-4 sm:pt-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-rcb-red/30 bg-rcb-red/10 px-3.5 py-1 text-xs font-bold text-rcb-red uppercase tracking-wider shadow-sm">
            <Sparkles className="h-3.5 w-3.5" />
            <span>AI Hackathon 2026 • Verified Engineering Specs</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white max-w-4xl leading-tight">
            Find the right robotics part. <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-rcb-red via-red-500 to-rcb-gold">
              Datasheet-backed fitment. Zero guesswork.
            </span>
          </h1>

          <p className="text-sm sm:text-base text-obsidian-300 max-w-2xl leading-relaxed">
            PartsPilot inspects voltage ceilings, logic levels, pinouts, and bus protocols directly against manufacturer datasheets. Eliminate incorrect orders and blown circuits before checking out with PayPal.
          </p>

          {/* Value Props Row */}
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 pt-2 text-xs font-semibold text-obsidian-300">
            <div className="flex items-center gap-2 rounded-full bg-obsidian-900 border border-obsidian-800 px-3.5 py-1.5 shadow-sm">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span>100% Datasheet Provenance</span>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-obsidian-900 border border-obsidian-800 px-3.5 py-1.5 shadow-sm">
              <Zap className="h-4 w-4 text-rcb-red" />
              <span>Deterministic Fitment Engine</span>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-obsidian-900 border border-obsidian-800 px-3.5 py-1.5 shadow-sm">
              <Cpu className="h-4 w-4 text-rcb-gold" />
              <span>PayPal Sandbox Checkout Ready</span>
            </div>
          </div>
        </section>

        {/* WORKSPACE: Diagnostics, BOM & Cart Drawer */}
        <HomeClientWorkspace
          availablePartsForDiagnostic={availablePartsForDiagnostic}
          isUsingFixtures={isUsingFixtures}
        />

        {/* SECTION 3: Verified Component Inventory */}
        <section className="space-y-4 pt-2">
          <div className="flex items-center justify-between border-b border-obsidian-800 pb-3">
            <div className="flex items-center gap-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-obsidian-800 text-obsidian-300 text-xs font-black border border-obsidian-700">
                3
              </div>
              <div>
                <h2 className="text-lg font-bold text-white tracking-tight">
                  Verified Component Catalog
                </h2>
                <p className="text-xs text-obsidian-400">
                  Authoritative robotics inventory stored live in Neon PostgreSQL.
                </p>
              </div>
            </div>

            <div className="text-xs text-obsidian-500 font-mono hidden sm:block">
              {parts.length} Components Synced
            </div>
          </div>

          <CatalogView
            initialParts={parts}
            isConnected={isConnected}
            errorMessage={errorMessage}
          />
        </section>
      </div>
    </div>
  );
}
