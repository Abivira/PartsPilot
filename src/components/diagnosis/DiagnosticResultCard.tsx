import React from "react";
import { CompatibilityReport, ConditionEvaluation } from "@/types/compatibility";
import { ExtractedComponentData, EvaluationSource } from "@/types/ai";
import { Part } from "@prisma/client";
import {
  ShieldCheck,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  HelpCircle,
  Info,
  RefreshCw,
  Cpu,
  Flame,
  Search,
  Database,
  Sparkles,
  Layers,
  ArrowRight,
} from "lucide-react";

interface DiagnosticResultCardProps {
  report: CompatibilityReport;
  componentName?: string;
  aiExtraction?: ExtractedComponentData;
  matchedPart?: Part | null;
  candidateParts?: Part[];
  evaluationSource?: EvaluationSource;
  dataSource?: "LIVE_DATABASE" | "DEMO_FIXTURE" | "NONE";
  notice?: string;
  modelUsed?: string;
  onReset?: () => void;
  onGenerateBom?: () => void;
}

export function DiagnosticResultCard({
  report,
  componentName,
  aiExtraction,
  matchedPart,
  candidateParts = [],
  evaluationSource = "CATALOGUE_AUTHORITATIVE",
  dataSource = "LIVE_DATABASE",
  notice,
  modelUsed = "gemini-2.5-flash",
  onReset,
  onGenerateBom,
}: DiagnosticResultCardProps) {
  const isVerified = report.tier === "VERIFIED";
  const isPossible = report.tier === "POSSIBLE";
  const isUnverified = report.tier === "UNVERIFIED";

  const tierConfig = {
    VERIFIED: {
      badgeClass: "border-emerald-500/40 bg-emerald-950/60 text-emerald-300",
      accentBorder: "border-emerald-500/50 shadow-emerald-950/30",
      icon: ShieldCheck,
      title: "TIER 1: VERIFIED CONSTRAINTS",
      desc: "All evaluated mandatory electrical voltage, current limits, logic levels, and bus protocols match documented manufacturer specifications. Always cross-verify pinout mapping and thermal limits before assembly.",
    },
    POSSIBLE: {
      badgeClass: "border-rcb-gold/50 bg-amber-950/40 text-rcb-gold",
      accentBorder: "border-rcb-gold/50 shadow-amber-950/30",
      icon: AlertTriangle,
      title: "TIER 2: POSSIBLE MATCH (UNVERIFIED SPECS)",
      desc: "No immediate hardware conflicts detected, but some operating values were not specified. Please verify with a multimeter before ordering.",
    },
    UNVERIFIED: {
      badgeClass: "border-rcb-red/50 bg-red-950/60 text-rcb-red",
      accentBorder: "border-rcb-red/60 shadow-red-950/40",
      icon: XCircle,
      title: "TIER 3: INCOMPATIBLE OR INSUFFICIENT EVIDENCE",
      desc: "A known electrical, voltage, or pinout incompatibility was detected, or insufficient data was provided to establish fitment.",
    },
  }[report.tier];

  const TierIcon = tierConfig.icon;

  return (
    <div
      className={`rounded-2xl border ${tierConfig.accentBorder} bg-obsidian-900/95 p-6 sm:p-7 space-y-6 shadow-2xl backdrop-blur-xl transition-all`}
    >
      {/* Top Bar: Provenance and Model Info */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-obsidian-800 pb-4 text-xs">
        <div className="flex items-center gap-2">
          {evaluationSource === "CATALOGUE_AUTHORITATIVE" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-950/40 px-3 py-1 font-bold text-emerald-400">
              <Database className="h-3.5 w-3.5" />
              <span>Neon PostgreSQL Authoritative Catalogue Match</span>
            </span>
          ) : evaluationSource === "DEMO_FIXTURE_UNVERIFIED" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-600/50 bg-amber-950/50 px-3 py-1 font-bold text-rcb-gold">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
              <span>DEMO FIXTURE (Database Offline — Unverified)</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-950/40 px-3 py-1 font-bold text-rcb-gold">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Unverified Part (AI Visual Extraction Only)</span>
            </span>
          )}

          {modelUsed && (
            <span className="rounded-full border border-obsidian-700 bg-obsidian-950 px-2.5 py-1 text-[11px] font-mono text-obsidian-300">
              {modelUsed}
            </span>
          )}
        </div>

        {onReset && (
          <button
            onClick={onReset}
            className="inline-flex items-center gap-1.5 rounded-full bg-obsidian-850 border border-obsidian-700 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-rcb-red hover:border-rcb-red transition-all"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>New Diagnostic</span>
          </button>
        )}
      </div>

      {/* Offline Database Fallback Warning Banner */}
      {notice && (
        <div className="rounded-xl border border-amber-800/80 bg-amber-950/60 p-4 text-xs text-amber-200 flex items-start gap-2.5">
          <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold text-white uppercase tracking-wider block">
              OFFLINE DEMONSTRATION NOTICE — PRODUCTION DATABASE UNREACHABLE
            </span>
            <p className="text-amber-300 leading-relaxed">{notice}</p>
          </div>
        </div>
      )}

      {/* AI Visual Extraction & Markings Panel */}
      {aiExtraction && (
        <div className="rounded-xl border border-obsidian-800 bg-obsidian-950/70 p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-obsidian-800/80 pb-3">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-rcb-red" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                Multimodal AI Component Identification
              </h4>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-obsidian-400">Visual Confidence:</span>
              <span className="font-mono font-bold text-white">
                {Math.round(aiExtraction.confidence * 100)}%
              </span>
              {aiExtraction.isUncertain && (
                <span className="rounded bg-amber-950/80 border border-amber-600/40 px-1.5 py-0.5 text-[10px] font-bold text-rcb-gold">
                  UNCERTAIN IDENTIFICATION
                </span>
              )}
            </div>
          </div>

          {/* Physical Damage Warning Banner */}
          {aiExtraction.physicalDamage?.detected &&
            aiExtraction.physicalDamage.type !== "NONE" && (
              <div className="rounded-lg border border-red-800/80 bg-red-950/70 p-3.5 text-xs text-red-200 flex items-start gap-2.5">
                <Flame className="h-5 w-5 text-rcb-red shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-black tracking-wide text-white uppercase">
                    PHYSICAL HARDWARE DAMAGE DETECTED ({aiExtraction.physicalDamage.severity} SEVERITY)
                  </span>
                  <p className="text-red-300 leading-relaxed">
                    {aiExtraction.physicalDamage.description}
                  </p>
                </div>
              </div>
            )}

          {/* Markings & Silkscreen Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="rounded-lg border border-obsidian-800 bg-obsidian-900/60 p-2.5">
              <span className="text-[10px] uppercase font-bold text-obsidian-400 block">
                Identified MPN
              </span>
              <span className="font-mono font-bold text-white text-sm">
                {aiExtraction.likelyMpn || report.mpn || "Unknown"}
              </span>
            </div>

            <div className="rounded-lg border border-obsidian-800 bg-obsidian-900/60 p-2.5">
              <span className="text-[10px] uppercase font-bold text-obsidian-400 block">
                Manufacturer / Brand
              </span>
              <span className="font-semibold text-white truncate block">
                {aiExtraction.manufacturerMarkings || matchedPart?.manufacturer || "Unbranded / Clone"}
              </span>
            </div>

            <div className="rounded-lg border border-obsidian-800 bg-obsidian-900/60 p-2.5">
              <span className="text-[10px] uppercase font-bold text-obsidian-400 block">
                Package & Form Factor
              </span>
              <span className="font-semibold text-white truncate block">
                {aiExtraction.packageType || "Standard Breakout Module"}
                {aiExtraction.pinCount ? ` (${aiExtraction.pinCount}-pin)` : ""}
              </span>
            </div>

            <div className="rounded-lg border border-obsidian-800 bg-obsidian-900/60 p-2.5">
              <span className="text-[10px] uppercase font-bold text-obsidian-400 block">
                Component Category
              </span>
              <span className="font-semibold text-rcb-gold uppercase truncate block">
                {aiExtraction.category}
              </span>
            </div>
          </div>

          {aiExtraction.rawSilkscreenText && (
            <div className="text-xs bg-obsidian-900/40 rounded-lg p-2.5 border border-obsidian-800/60 flex items-baseline gap-2">
              <span className="text-obsidian-400 text-[11px] font-mono shrink-0">
                Silkscreen Text:
              </span>
              <span className="text-white font-mono text-[11px] break-all">
                &ldquo;{aiExtraction.rawSilkscreenText}&rdquo;
              </span>
            </div>
          )}

          {/* Tri-Fold Specification Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs pt-1">
            {/* Observed Specs */}
            <div className="rounded-lg border border-obsidian-800 bg-obsidian-900/40 p-3 space-y-1.5">
              <span className="font-bold text-emerald-400 flex items-center gap-1.5 text-[11px] uppercase">
                <CheckCircle2 className="h-3.5 w-3.5" />
                1. Directly Observed
              </span>
              {Object.keys(aiExtraction.observedSpecs || {}).length > 0 ||
              aiExtraction.visibleElectricalClues.length > 0 ? (
                <ul className="space-y-1 text-obsidian-300 text-[11px]">
                  {aiExtraction.visibleElectricalClues.map((c, i) => (
                    <li key={`c-${i}`} className="truncate">• {c}</li>
                  ))}
                  {Object.entries(aiExtraction.observedSpecs || {}).map(([k, v]) => (
                    <li key={k} className="truncate">• {k}: {String(v)}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-obsidian-400 italic text-[11px]">No direct voltage/current labels printed.</p>
              )}
            </div>

            {/* Inferred Specs */}
            <div className="rounded-lg border border-obsidian-800 bg-obsidian-900/40 p-3 space-y-1.5">
              <span className="font-bold text-rcb-gold flex items-center gap-1.5 text-[11px] uppercase">
                <Sparkles className="h-3.5 w-3.5" />
                2. Inferred Reference
              </span>
              {Object.keys(aiExtraction.inferredSpecs || {}).length > 0 ||
              aiExtraction.communicationProtocolClues.length > 0 ? (
                <ul className="space-y-1 text-obsidian-300 text-[11px]">
                  {aiExtraction.communicationProtocolClues.map((p, i) => (
                    <li key={`p-${i}`} className="truncate">• Protocol: {p}</li>
                  ))}
                  {Object.entries(aiExtraction.inferredSpecs || {}).map(([k, v]) => (
                    <li key={k} className="truncate">• {k}: {String(v)}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-obsidian-400 italic text-[11px]">No inferred specifications available.</p>
              )}
            </div>

            {/* Unknown Specs */}
            <div className="rounded-lg border border-obsidian-800 bg-obsidian-900/40 p-3 space-y-1.5">
              <span className="font-bold text-rcb-red flex items-center gap-1.5 text-[11px] uppercase">
                <HelpCircle className="h-3.5 w-3.5" />
                3. Unknown / Unverified
              </span>
              {aiExtraction.unknownSpecs && aiExtraction.unknownSpecs.length > 0 ? (
                <ul className="space-y-1 text-obsidian-300 text-[11px]">
                  {aiExtraction.unknownSpecs.map((u, i) => (
                    <li key={i} className="truncate">• {u}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-obsidian-400 italic text-[11px]">No critical unknown specs flagged.</p>
              )}
            </div>
          </div>

          {/* Clarification Questions */}
          {aiExtraction.clarificationQuestions &&
            aiExtraction.clarificationQuestions.length > 0 && (
              <div className="rounded-lg border border-amber-900/40 bg-amber-950/20 p-3 text-xs space-y-1.5">
                <span className="font-bold text-rcb-gold text-[11px] uppercase flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Visual Clarification Questions:
                </span>
                <ul className="list-disc list-inside space-y-1 text-obsidian-300 text-[11px]">
                  {aiExtraction.clarificationQuestions.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </div>
            )}
        </div>
      )}

      {/* Candidate Matches Section (if exact match not in DB) */}
      {!matchedPart && candidateParts.length > 0 && (
        <div className="rounded-xl border border-obsidian-800 bg-obsidian-950/60 p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-obsidian-300">
            <Search className="h-4 w-4 text-rcb-red" />
            <span>Similar Catalogue Components In Neon Database:</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {candidateParts.map((candidate) => (
              <div
                key={candidate.id}
                className="rounded-lg border border-obsidian-800 bg-obsidian-900/60 p-2.5 flex items-center justify-between"
              >
                <div>
                  <span className="font-mono font-bold text-white block">
                    {candidate.mpn}
                  </span>
                  <span className="text-[11px] text-obsidian-400 truncate block">
                    {candidate.name} ({candidate.manufacturer})
                  </span>
                </div>
                <span className="rounded bg-obsidian-800 px-2 py-0.5 text-[10px] font-bold text-rcb-gold uppercase">
                  {candidate.category}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Authoritative Compatibility Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-obsidian-800 pb-5">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${tierConfig.badgeClass}`}
            >
              <TierIcon className="h-4 w-4" />
              {tierConfig.title}
            </span>
            <span className="text-xs text-obsidian-400 font-semibold">
              Fitment Score: <strong className="text-white">{Math.round(report.confidenceScore * 100)}%</strong>
            </span>
          </div>

          <div className="flex items-baseline gap-2 pt-1">
            <span className="text-lg font-black text-white font-mono">
              {report.mpn}
            </span>
            {(componentName || matchedPart?.name) && (
              <span className="text-xs text-obsidian-300 font-medium truncate">
                — {componentName || matchedPart?.name}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Summary Box */}
      <div className="rounded-xl border border-obsidian-800 bg-obsidian-950/80 p-4 space-y-2.5">
        <div className="flex items-start gap-3">
          <Info className="h-4 w-4 text-rcb-red shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-white leading-relaxed">
              {report.summary}
            </p>
            <p className="text-xs text-obsidian-400 leading-relaxed">
              {tierConfig.desc}
            </p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="pt-2">
          <div className="flex justify-between text-xs text-obsidian-400 mb-1 font-medium">
            <span>Engineering Rule Satisfaction</span>
            <span className="text-white font-semibold">
              {report.passedCount} of {report.conditions.length} passed
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-obsidian-800 overflow-hidden">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                isVerified
                  ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]"
                  : isPossible
                  ? "bg-rcb-gold"
                  : "bg-rcb-red"
              }`}
              style={{ width: `${Math.round(report.confidenceScore * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Missing Specifications Box */}
      {report.missingRequiredSpecs.length > 0 && (
        <div className="rounded-xl border border-amber-900/60 bg-amber-950/30 p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-rcb-gold">
            <AlertTriangle className="h-4 w-4" />
            <span>UNVERIFIED PARAMETERS REQUIRING CONFIRMATION:</span>
          </div>
          <ul className="list-disc list-inside space-y-1 text-xs text-obsidian-300 pl-1">
            {report.missingRequiredSpecs.map((spec, idx) => (
              <li key={idx} className="capitalize">
                {spec}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* BOM Generation Call-to-Action */}
      {onGenerateBom && (
        <div className="rounded-xl border border-rcb-red/40 bg-gradient-to-r from-rcb-red/15 via-obsidian-900 to-obsidian-950 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-inner">
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Layers className="h-4 w-4 text-rcb-red" />
              <span>Step 2: Generate Interactive Bill of Materials (BOM)</span>
            </h4>
            <p className="text-xs text-obsidian-300">
              Transform this verified fitment report into an itemized, editable procurement BOM mapped directly to Neon inventory.
            </p>
          </div>
          <button
            onClick={onGenerateBom}
            className="shrink-0 inline-flex items-center justify-center gap-2 rounded-xl bg-rcb-red px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white hover:bg-rcb-red-hover active:scale-95 transition-all shadow-lg shadow-red-950/60"
          >
            <span>Generate BOM & Source</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Itemized Condition Evaluations */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs font-bold text-obsidian-400 uppercase tracking-wider">
          <span>Evaluated Engineering Constraints</span>
          <span>
            {report.passedCount} Passed • {report.failedCount} Failed • {report.unknownCount} Unknown
          </span>
        </div>

        <div className="space-y-2.5">
          {report.conditions.map((condition, idx) => (
            <ConditionRow key={idx} condition={condition} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ConditionRow({ condition }: { condition: ConditionEvaluation }) {
  const isPassed = condition.status === "PASSED";
  const isFailed = condition.status === "FAILED";

  const StatusIcon = isPassed
    ? CheckCircle2
    : isFailed
    ? XCircle
    : HelpCircle;

  const statusColorClass = isPassed
    ? "text-emerald-400 bg-emerald-950/50 border-emerald-800/40"
    : isFailed
    ? "text-rcb-red bg-red-950/50 border-red-800/40"
    : "text-rcb-gold bg-amber-950/50 border-amber-800/40";

  return (
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 rounded-xl border border-obsidian-800 bg-obsidian-950/60 p-3.5 text-xs">
      <div className="flex items-start gap-3 flex-1">
        <StatusIcon
          className={`h-4 w-4 shrink-0 mt-0.5 ${
            isPassed ? "text-emerald-400" : isFailed ? "text-rcb-red" : "text-rcb-gold"
          }`}
        />
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white text-xs">
              {condition.name}
            </span>
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${statusColorClass}`}
            >
              {condition.status}
            </span>
          </div>
          <p className="text-obsidian-300 text-xs leading-relaxed">
            {condition.message}
          </p>
        </div>
      </div>

      {(condition.expected !== undefined || condition.actual !== undefined) && (
        <div className="flex sm:flex-col items-end justify-between sm:justify-start gap-1 text-[11px] shrink-0 border-t sm:border-t-0 sm:border-l border-obsidian-800 pt-2 sm:pt-0 sm:pl-3 text-obsidian-400 font-mono">
          {condition.expected !== undefined && (
            <div>
              <span className="text-obsidian-500">Exp: </span>
              <span className="text-obsidian-300">{String(condition.expected)}</span>
            </div>
          )}
          {condition.actual !== undefined && (
            <div>
              <span className="text-obsidian-500">Act: </span>
              <span className="text-white font-bold">{String(condition.actual)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
