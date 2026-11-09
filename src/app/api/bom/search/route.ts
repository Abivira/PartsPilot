import { NextRequest, NextResponse } from "next/server";
import { searchCatalogueForSourcing } from "@/lib/bom/sourcing";
import { ComponentCategory } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") ?? undefined;
    const cat = searchParams.get("category") as ComponentCategory | null;
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : 10;

    const parts = await searchCatalogueForSourcing({
      query: q,
      category: cat || undefined,
      limit,
    });

    return NextResponse.json({ parts }, { status: 200 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Catalogue search failed.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
