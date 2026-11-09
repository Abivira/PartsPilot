import { ComponentCategory, CompatibilityTier, Part } from "@prisma/client";

export type BomResolutionStatus =
  | "RESOLVED_CATALOGUE"
  | "UNRESOLVED_AI"
  | "UNRESOLVED_CUSTOM";

export interface BomEntry {
  id: string;
  name: string;
  category: ComponentCategory;
  manufacturer?: string;
  mpn?: string;
  requiredSpecs: Record<string, unknown>;
  quantity: number;
  confidence: number; // 0.0 to 1.0
  compatibilityTier: CompatibilityTier;
  resolutionStatus: BomResolutionStatus;
  datasheetUrl?: string | null;
  specificationSource?: string | null;
  userNotes: string;
  matchedPartId?: string | null;
  matchedPart?: Part | null;
  candidateParts?: Part[];
  isPurchasable: boolean;
  unitPriceCents?: number | null;
  totalPriceCents?: number | null;
  stockAvailable?: number | null;
  warnings?: string[];
}

export interface BillOfMaterials {
  id: string;
  title: string;
  description: string;
  targetPlatform?: string;
  entries: BomEntry[];
  totalEstimatedCents: number;
  currency: string;
  resolvedCount: number;
  unresolvedCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface BomSourcingResult {
  entry: BomEntry;
  exactMatch: Part | null;
  alternativeCandidates: Part[];
  warnings: string[];
}
