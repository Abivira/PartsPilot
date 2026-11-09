import { ComponentCategory } from "@prisma/client";
import { CompatibilityReport, TargetHardwareContext } from "./compatibility";
import { Part } from "@prisma/client";

export type DamageType =
  | "NONE"
  | "BURN_MARK"
  | "CRACKED_PACKAGE"
  | "BENT_PINS"
  | "SOLDER_BRIDGE"
  | "CORROSION"
  | "BLOWN_CAPACITOR"
  | "OTHER";

export type DamageSeverity = "NONE" | "LOW" | "MEDIUM" | "CRITICAL";

export interface PhysicalDamageReport {
  detected: boolean;
  type: DamageType;
  severity: DamageSeverity;
  description: string;
}

export interface ExtractedComponentData {
  category: ComponentCategory;
  manufacturerMarkings?: string;
  rawSilkscreenText?: string;
  likelyMpn?: string;
  packageType?: string;
  pinCount?: number;
  visibleElectricalClues: string[];
  communicationProtocolClues: string[];
  physicalDamage: PhysicalDamageReport;
  confidence: number; // 0.0 to 1.0
  isUncertain: boolean;
  observedSpecs: Record<string, unknown>;
  inferredSpecs: Record<string, unknown>;
  unknownSpecs: string[];
  clarificationQuestions: string[];
  reasoning: string;
}

export interface DiagnoseRequestPayload {
  userMpn?: string;
  symptomDescription?: string;
  targetContext?: TargetHardwareContext;
}

export type EvaluationSource =
  | "CATALOGUE_AUTHORITATIVE"
  | "DEMO_FIXTURE_UNVERIFIED"
  | "AI_EXTRACTED_UNVERIFIED";

export interface DiagnoseResponse {
  success: boolean;
  aiExtraction: ExtractedComponentData;
  matchedPart: Part | null;
  candidateParts: Part[];
  compatibilityReport: CompatibilityReport;
  meta: {
    modelUsed: string;
    evaluationSource: EvaluationSource;
    dataSource: "LIVE_DATABASE" | "DEMO_FIXTURE" | "NONE";
    executionTimeMs: number;
    timestamp: string;
    notice?: string;
  };
}
