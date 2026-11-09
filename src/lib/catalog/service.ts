import { db } from "@/lib/db";
import { ComponentCategory, Part } from "@prisma/client";

export interface CatalogQueryResult {
  parts: Part[];
  isConnected: boolean;
  errorMessage?: string;
}

export async function getCatalogParts(filters?: {
  search?: string;
  category?: ComponentCategory | "ALL";
}): Promise<CatalogQueryResult> {
  // If DATABASE_URL is not set, avoid throwing unhandled exception
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === "") {
    return {
      parts: [],
      isConnected: false,
      errorMessage:
        "Neon DATABASE_URL is not configured. Set DATABASE_URL in your .env file to enable live database queries.",
    };
  }

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

    if (filters?.category && filters.category !== "ALL") {
      whereClause.category = filters.category;
    }

    if (filters?.search && filters.search.trim().length > 0) {
      const q = filters.search.trim();
      whereClause.OR = [
        { mpn: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { manufacturer: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ];
    }

    const parts = await db.part.findMany({
      where: whereClause,
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });

    return {
      parts,
      isConnected: true,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown database connection error";
    console.error("[CatalogService] Database query failed:", message);

    return {
      parts: [],
      isConnected: false,
      errorMessage: `Database connection error: ${message}`,
    };
  }
}
