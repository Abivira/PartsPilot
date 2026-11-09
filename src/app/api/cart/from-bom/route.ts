import { NextRequest, NextResponse } from "next/server";
import { getOrCreateCart, addBomToCart } from "@/lib/cart/cart-service";
import { BomEntry } from "@/types/bom";

const COOKIE_NAME = "partspilot_guest_token";

export async function POST(req: NextRequest) {
  try {
    const existingToken = req.cookies.get(COOKIE_NAME)?.value;
    const { guestToken, isNew } = await getOrCreateCart(existingToken);

    const body = await req.json();
    const entries: BomEntry[] = body.entries;

    if (!Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json(
        { error: "Expected non-empty array of BOM entries." },
        { status: 400 }
      );
    }

    const result = await addBomToCart(guestToken, entries);

    const res = NextResponse.json(result, { status: 200 });
    if (isNew || !existingToken) {
      res.cookies.set({
        name: COOKIE_NAME,
        value: guestToken,
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 30 * 24 * 60 * 60,
      });
    }
    return res;
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to add BOM to cart.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
