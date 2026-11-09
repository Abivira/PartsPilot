import { BomEntry, BomSourcingResult } from "@/types/bom";
import { Part, ComponentCategory } from "@prisma/client";
import { db } from "@/lib/db";
import { CATALOG_FIXTURES } from "@/lib/catalog/fixtures";

/**
 * Assigns an explicit catalogue component to an unresolved or existing BOM entry.
 * Never silently substitutes: caller must explicitly provide the chosen cataloguePart.
 */
export function assignCatalogueMatchToBomEntry(
  entry: BomEntry,
  cataloguePart: Part
): BomEntry {
  const isDemo = cataloguePart.isDemonstrationSample;
  const stockAvail = Math.max(0, cataloguePart.stockOnHand - cataloguePart.stockReserved);
  const qty = Math.max(1, entry.quantity || 1);
  const unitPrice = cataloguePart.priceCents;
  const totalPrice = unitPrice * qty;

  const warnings: string[] = [];
  if (isDemo) {
    warnings.push("Demonstration fixture sample. Cannot be added to live purchasing cart.");
  }
  if (stockAvail <= 0) {
    warnings.push("Component is currently out of stock. Backorder or restock required.");
  }

  return {
    ...entry,
    name: cataloguePart.name,
    category: cataloguePart.category,
    manufacturer: cataloguePart.manufacturer,
    mpn: cataloguePart.mpn,
    resolutionStatus: "RESOLVED_CATALOGUE",
    matchedPartId: cataloguePart.id,
    matchedPart: cataloguePart,
    datasheetUrl: cataloguePart.datasheetUrl,
    specificationSource: cataloguePart.specificationSource,
    unitPriceCents: unitPrice,
    totalPriceCents: totalPrice,
    stockAvailable: stockAvail,
    isPurchasable: !isDemo && stockAvail > 0,
    warnings,
  };
}

/**
 * Searches the Neon PostgreSQL catalogue for replacement parts or alternatives.
 * Falls back to local fixtures if the database is offline.
 */
export async function searchCatalogueForSourcing(params: {
  query?: string;
  category?: ComponentCategory;
  limit?: number;
}): Promise<Part[]> {
  const { query, category, limit = 8 } = params;

  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0) {
    try {
      const whereClause: {
        isActive: boolean;
        category?: ComponentCategory;
        OR?: Array<
          | { mpn: { contains: string; mode: "insensitive" } }
          | { name: { contains: string; mode: "insensitive" } }
          | { manufacturer: { contains: string; mode: "insensitive" } }
          | { description: { contains: string; mode: "insensitive" } }
        >;
      } = {
        isActive: true,
      };

      if (category) {
        whereClause.category = category;
      }

      if (query && query.trim().length > 0) {
        const q = query.trim();
        whereClause.OR = [
          { mpn: { contains: q, mode: "insensitive" } },
          { name: { contains: q, mode: "insensitive" } },
          { manufacturer: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
        ];
      }

      const parts = await db.part.findMany({
        where: whereClause,
        take: limit,
        orderBy: [{ category: "asc" }, { name: "asc" }],
      });

      return parts;
    } catch (dbError) {
      console.warn(
        "[BOM Sourcing] Live database search failed, searching offline fixtures:",
        dbError instanceof Error ? dbError.message : "DB error"
      );
    }
  }

  // Offline fixture fallback (marked as demo fixtures)
  return CATALOG_FIXTURES.filter((f) => {
    if (category && f.category !== category) return false;
    if (query && query.trim().length > 0) {
      const q = query.trim().toLowerCase();
      return (
        f.mpn.toLowerCase().includes(q) ||
        f.name.toLowerCase().includes(q) ||
        f.manufacturer.toLowerCase().includes(q)
      );
    }
    return true;
  })
    .slice(0, limit)
    .map((f) => ({
      id: f.id,
      mpn: f.mpn,
      sku: `DEMO-${f.mpn}`,
      name: f.name,
      manufacturer: f.manufacturer,
      category: f.category,
      description: f.description,
      imageUrl: null,
      specificationSource: `[OFFLINE DEMO FIXTURE] ${f.specificationSource}`,
      specificationVerifiedAt: new Date("2026-11-08T00:00:00Z"),
      datasheetUrl: null,
      isDemonstrationSample: true,
      priceCents: f.priceCents,
      currency: f.currency,
      stockOnHand: 10,
      stockReserved: 0,
      specs: f.specs as any,
      supportedPlatforms: f.supportedPlatforms,
      isActive: true,
      createdAt: new Date("2026-11-08T00:00:00Z"),
      updatedAt: new Date("2026-11-08T00:00:00Z"),
    }));
}
