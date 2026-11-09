import { db } from "@/lib/db";
import { Part, ComponentCategory } from "@prisma/client";
import { CATALOG_FIXTURES } from "./fixtures";

export type CatalogueDataSource = "LIVE_DATABASE" | "DEMO_FIXTURE" | "NONE";

export interface CatalogueMatchResult {
  matchedPart: Part | null;
  candidateParts: Part[];
  matchType: "EXACT" | "FUZZY_CANDIDATE" | "NONE";
  dataSource: CatalogueDataSource;
  dbUnavailableNotice?: string;
}

/**
 * Normalizes an MPN for resilient matching (strips non-alphanumeric chars and lowercases).
 * e.g., "TMC-2209_LA" -> "tmc2209la", "MPU 6050" -> "mpu6050"
 */
function normalizeIdentifier(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Finds exact or candidate catalogue parts in the Neon PostgreSQL database.
 * If Neon is unavailable, falls back to offline fixtures marked explicitly as
 * DEMO_FIXTURE so they can NEVER be classified as live verified production data.
 */
export async function matchCataloguePart(params: {
  mpn?: string;
  category?: ComponentCategory;
  manufacturer?: string;
}): Promise<CatalogueMatchResult> {
  const queryMpn = params.mpn?.trim();
  const queryCat = params.category;
  const queryMfg = params.manufacturer?.trim();

  // If no MPN and no category/mfg provided, nothing can be queried
  if (!queryMpn && !queryCat && !queryMfg) {
    return {
      matchedPart: null,
      candidateParts: [],
      matchType: "NONE",
      dataSource: "NONE",
    };
  }

  // Check if DATABASE_URL is present
  const hasDbUrl = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);

  if (hasDbUrl) {
    try {
      // 1. Try exact MPN match against live Neon database
      if (queryMpn) {
        const exactMatch = await db.part.findFirst({
          where: {
            isActive: true,
            mpn: {
              equals: queryMpn,
              mode: "insensitive",
            },
          },
        });

        if (exactMatch) {
          return {
            matchedPart: exactMatch,
            candidateParts: [],
            matchType: "EXACT",
            dataSource: "LIVE_DATABASE",
          };
        }

        // 2. Try prefix/contains MPN match
        const prefixMatch = await db.part.findFirst({
          where: {
            isActive: true,
            OR: [
              { mpn: { contains: queryMpn, mode: "insensitive" } },
              { name: { contains: queryMpn, mode: "insensitive" } },
            ],
          },
        });

        if (prefixMatch) {
          return {
            matchedPart: prefixMatch,
            candidateParts: [],
            matchType: "EXACT",
            dataSource: "LIVE_DATABASE",
          };
        }
      }

      // 3. Find candidate parts by category or manufacturer in live database
      const candidatesWhere: {
        isActive: boolean;
        category?: ComponentCategory;
        OR?: Array<
          | { mpn: { contains: string; mode: "insensitive" } }
          | { name: { contains: string; mode: "insensitive" } }
          | { manufacturer: { contains: string; mode: "insensitive" } }
        >;
      } = {
        isActive: true,
      };

      if (queryCat) {
        candidatesWhere.category = queryCat;
      }

      if (queryMpn || queryMfg) {
        const orClauses: Array<
          | { mpn: { contains: string; mode: "insensitive" } }
          | { name: { contains: string; mode: "insensitive" } }
          | { manufacturer: { contains: string; mode: "insensitive" } }
        > = [];

        if (queryMpn) {
          const root = queryMpn.split(/[-_\s]/)[0];
          if (root && root.length >= 3) {
            orClauses.push({ mpn: { contains: root, mode: "insensitive" } });
            orClauses.push({ name: { contains: root, mode: "insensitive" } });
          }
        }

        if (queryMfg) {
          orClauses.push({ manufacturer: { contains: queryMfg, mode: "insensitive" } });
        }

        if (orClauses.length > 0) {
          candidatesWhere.OR = orClauses;
        }
      }

      const candidateParts = await db.part.findMany({
        where: candidatesWhere,
        take: 4,
        orderBy: { name: "asc" },
      });

      // Check if any candidate is an exact normalized match
      if (queryMpn) {
        const normalizedQuery = normalizeIdentifier(queryMpn);
        const exactNormMatch = candidateParts.find(
          (p) =>
            normalizeIdentifier(p.mpn).includes(normalizedQuery) ||
            normalizedQuery.includes(normalizeIdentifier(p.mpn))
        );

        if (exactNormMatch) {
          return {
            matchedPart: exactNormMatch,
            candidateParts: candidateParts.filter((p) => p.id !== exactNormMatch.id),
            matchType: "EXACT",
            dataSource: "LIVE_DATABASE",
          };
        }
      }

      return {
        matchedPart: null,
        candidateParts,
        matchType: candidateParts.length > 0 ? "FUZZY_CANDIDATE" : "NONE",
        dataSource: candidateParts.length > 0 ? "LIVE_DATABASE" : "NONE",
      };
    } catch (dbError) {
      console.warn(
        "[CatalogueMatcher] Live Neon database query failed. Falling back to offline demonstration fixtures:",
        dbError instanceof Error ? dbError.message : "DB error"
      );
    }
  }

  // ---------------------------------------------------------------------------
  // CRITICAL RESILIENCE RULE:
  // If Neon database is offline or unconfigured, resolve against demonstration
  // fixtures, BUT explicitly tag as DEMO_FIXTURE and flag isDemonstrationSample=true.
  // This ensures fixture data can NEVER be misrepresented as live verified database records.
  // ---------------------------------------------------------------------------
  const dbNotice =
    "Neon PostgreSQL database is currently unreachable or offline. Evaluated using offline demonstration fixtures only. Verification against live production datasheets is unconfirmed.";

  if (queryMpn) {
    const normalizedQuery = normalizeIdentifier(queryMpn);
    const fixtureMatch = CATALOG_FIXTURES.find(
      (p) =>
        normalizeIdentifier(p.mpn).includes(normalizedQuery) ||
        normalizedQuery.includes(normalizeIdentifier(p.mpn))
    );

    if (fixtureMatch) {
      const demoPart: Part = {
        id: fixtureMatch.id,
        mpn: fixtureMatch.mpn,
        sku: `DEMO-${fixtureMatch.mpn}`,
        name: fixtureMatch.name,
        manufacturer: fixtureMatch.manufacturer,
        category: fixtureMatch.category,
        description: fixtureMatch.description,
        imageUrl: null,
        specificationSource: `[OFFLINE DEMO FIXTURE] ${fixtureMatch.specificationSource}`,
        specificationVerifiedAt: new Date("2026-11-08T00:00:00Z"),
        datasheetUrl: null,
        isDemonstrationSample: true, // STRICTLY FLAGGED AS DEMO
        priceCents: fixtureMatch.priceCents,
        currency: fixtureMatch.currency,
        stockOnHand: 0,
        stockReserved: 0,
        specs: fixtureMatch.specs as any,
        supportedPlatforms: fixtureMatch.supportedPlatforms,
        isActive: true,
        createdAt: new Date("2026-11-08T00:00:00Z"),
        updatedAt: new Date("2026-11-08T00:00:00Z"),
      };

      return {
        matchedPart: demoPart,
        candidateParts: [],
        matchType: "EXACT",
        dataSource: "DEMO_FIXTURE",
        dbUnavailableNotice: dbNotice,
      };
    }
  }

  // Search category candidates in fixtures
  const fixtureCandidates: Part[] = CATALOG_FIXTURES.filter(
    (p) => !queryCat || p.category === queryCat
  )
    .slice(0, 4)
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
      stockOnHand: 0,
      stockReserved: 0,
      specs: f.specs as any,
      supportedPlatforms: f.supportedPlatforms,
      isActive: true,
      createdAt: new Date("2026-11-08T00:00:00Z"),
      updatedAt: new Date("2026-11-08T00:00:00Z"),
    }));

  return {
    matchedPart: null,
    candidateParts: fixtureCandidates,
    matchType: fixtureCandidates.length > 0 ? "FUZZY_CANDIDATE" : "NONE",
    dataSource: fixtureCandidates.length > 0 ? "DEMO_FIXTURE" : "NONE",
    dbUnavailableNotice: dbNotice,
  };
}
