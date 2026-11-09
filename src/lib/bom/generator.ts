import { DiagnoseResponse } from "@/types/ai";
import { BillOfMaterials, BomEntry } from "@/types/bom";
import { ComponentCategory, CompatibilityTier, Part } from "@prisma/client";
import { centsToDollars } from "@/lib/currency";

/**
 * Creates a structured Bill of Materials from a completed hardware fitment diagnosis.
 */
export function generateBomFromDiagnostic(params: {
  diagnoseResponse: DiagnoseResponse;
  suggestedCompanionParts?: Part[];
}): BillOfMaterials {
  const { diagnoseResponse, suggestedCompanionParts = [] } = params;
  const now = new Date().toISOString();
  const entries: BomEntry[] = [];

  const matchedPart = diagnoseResponse.matchedPart;
  const aiExtraction = diagnoseResponse.aiExtraction;
  const report = diagnoseResponse.compatibilityReport;

  // 1. Primary Diagnosed Component Entry
  const primaryId = `bom-primary-${Date.now()}`;
  if (matchedPart) {
    const isDemo = matchedPart.isDemonstrationSample;
    const stockAvail = Math.max(0, matchedPart.stockOnHand - matchedPart.stockReserved);

    entries.push({
      id: primaryId,
      name: matchedPart.name,
      category: matchedPart.category,
      manufacturer: matchedPart.manufacturer,
      mpn: matchedPart.mpn,
      requiredSpecs: (matchedPart.specs as Record<string, unknown>) ?? {},
      quantity: 1,
      confidence: aiExtraction.confidence,
      compatibilityTier: report.tier,
      resolutionStatus: "RESOLVED_CATALOGUE",
      datasheetUrl: matchedPart.datasheetUrl,
      specificationSource: matchedPart.specificationSource,
      userNotes: report.summary,
      matchedPartId: matchedPart.id,
      matchedPart: matchedPart,
      candidateParts: diagnoseResponse.candidateParts,
      isPurchasable: !isDemo && stockAvail > 0,
      unitPriceCents: matchedPart.priceCents,
      totalPriceCents: matchedPart.priceCents,
      stockAvailable: stockAvail,
      warnings: isDemo
        ? ["Demonstration fixture sample. Cannot be added to live purchasing cart."]
        : [],
    });
  } else {
    // Unresolved entry from AI inference
    entries.push({
      id: primaryId,
      name: aiExtraction.likelyMpn || "Uncatalogued Robotic Component",
      category: aiExtraction.category || ComponentCategory.ACCESSORY,
      manufacturer: aiExtraction.manufacturerMarkings || "Unverified Manufacturer",
      mpn: aiExtraction.likelyMpn || undefined,
      requiredSpecs: {
        ...aiExtraction.observedSpecs,
        ...aiExtraction.inferredSpecs,
      },
      quantity: 1,
      confidence: aiExtraction.confidence,
      compatibilityTier: report.tier,
      resolutionStatus: "UNRESOLVED_AI",
      datasheetUrl: null,
      specificationSource: "AI Visual Inspection (Unverified)",
      userNotes: `AI Visual Identification (${Math.round(aiExtraction.confidence * 100)}% confidence). ${report.summary}`,
      matchedPartId: null,
      matchedPart: null,
      candidateParts: diagnoseResponse.candidateParts,
      isPurchasable: false,
      unitPriceCents: null,
      totalPriceCents: null,
      stockAvailable: null,
      warnings: [
        "Unresolved entry: Must be mapped to an existing catalogue component before procurement.",
      ],
    });
  }

  // 2. Add companion components if suggested
  for (const companion of suggestedCompanionParts) {
    const isDemo = companion.isDemonstrationSample;
    const stockAvail = Math.max(0, companion.stockOnHand - companion.stockReserved);

    entries.push({
      id: `bom-comp-${companion.id}-${Date.now()}`,
      name: companion.name,
      category: companion.category,
      manufacturer: companion.manufacturer,
      mpn: companion.mpn,
      requiredSpecs: (companion.specs as Record<string, unknown>) ?? {},
      quantity: 1,
      confidence: 1.0,
      compatibilityTier: CompatibilityTier.VERIFIED,
      resolutionStatus: "RESOLVED_CATALOGUE",
      datasheetUrl: companion.datasheetUrl,
      specificationSource: companion.specificationSource,
      userNotes: `Recommended companion subsystem component for ${matchedPart?.mpn || "system"}.`,
      matchedPartId: companion.id,
      matchedPart: companion,
      candidateParts: [],
      isPurchasable: !isDemo && stockAvail > 0,
      unitPriceCents: companion.priceCents,
      totalPriceCents: companion.priceCents,
      stockAvailable: stockAvail,
    });
  }

  // Calculate totals
  const totalEstimatedCents = entries.reduce(
    (sum, entry) => sum + (entry.totalPriceCents ?? 0),
    0
  );
  const resolvedCount = entries.filter((e) => e.resolutionStatus === "RESOLVED_CATALOGUE").length;
  const unresolvedCount = entries.length - resolvedCount;

  return {
    id: `bom-${Date.now()}`,
    title: matchedPart ? `BOM: ${matchedPart.name}` : "BOM: Diagnostic Hardware Assembly",
    description: `Generated from PartsPilot deterministic fitment diagnosis. Evaluated at ${now}.`,
    targetPlatform: (matchedPart?.supportedPlatforms?.[0] as string | undefined) ?? "General Robotics / 3D Printer",
    entries,
    totalEstimatedCents,
    currency: "USD",
    resolvedCount,
    unresolvedCount,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Escapes a cell value for RFC 4180 CSV export.
 */
function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

/**
 * Exports a Bill of Materials to standard CSV format.
 */
export function exportBomToCsv(bom: BillOfMaterials): string {
  const headers = [
    "Item #",
    "MPN",
    "Component Name",
    "Manufacturer",
    "Category",
    "Quantity",
    "Resolution Status",
    "Unit Price (USD)",
    "Line Total (USD)",
    "Available Stock",
    "Compatibility Tier",
    "Specification Source",
    "Datasheet URL",
    "Notes",
  ];

  const rows: string[] = [headers.map(escapeCsvCell).join(",")];

  bom.entries.forEach((entry, idx) => {
    const unitPrice =
      entry.unitPriceCents !== null && entry.unitPriceCents !== undefined
        ? centsToDollars(entry.unitPriceCents).toFixed(2)
        : "N/A";

    const totalPrice =
      entry.totalPriceCents !== null && entry.totalPriceCents !== undefined
        ? centsToDollars(entry.totalPriceCents).toFixed(2)
        : "N/A";

    const row = [
      idx + 1,
      entry.mpn || "UNASSIGNED",
      entry.name,
      entry.manufacturer || "N/A",
      entry.category,
      entry.quantity,
      entry.resolutionStatus,
      unitPrice,
      totalPrice,
      entry.stockAvailable !== null && entry.stockAvailable !== undefined
        ? entry.stockAvailable
        : "N/A",
      entry.compatibilityTier,
      entry.specificationSource || "N/A",
      entry.datasheetUrl || "N/A",
      entry.userNotes || "",
    ];

    rows.push(row.map(escapeCsvCell).join(","));
  });

  return rows.join("\r\n");
}
