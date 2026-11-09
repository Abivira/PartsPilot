import { NextRequest, NextResponse } from "next/server";
import { getOrCreateCart, addBomToCart, addItemToCart } from "@/lib/cart/cart-service";
import { BomEntry } from "@/types/bom";

const COOKIE_NAME = "partspilot_guest_token";

export async function POST(req: NextRequest) {
  try {
    const existingToken = req.cookies.get(COOKIE_NAME)?.value;
    const { guestToken, isNew } = await getOrCreateCart(existingToken);

    const body = await req.json();
    const rawList = body.entries || body.items;

    if (!Array.isArray(rawList) || rawList.length === 0) {
      return NextResponse.json(
        { error: "Expected non-empty array of BOM entries." },
        { status: 400 }
      );
    }

    let result;
    if (Array.isArray(body.entries) && body.entries.length > 0) {
      result = await addBomToCart(guestToken, body.entries);
    } else {
      let addedCount = 0;
      let skippedCount = 0;
      for (const item of rawList) {
        const partId = item.partId || item.matchedPartId;
        const qty = item.quantity || 1;
        if (partId) {
          try {
            await addItemToCart(guestToken, partId, qty);
            addedCount++;
          } catch {
            skippedCount++;
          }
        } else {
          skippedCount++;
        }
      }
      const cartRes = await getOrCreateCart(guestToken);
      result = { cart: cartRes.cart, addedCount, skippedCount };
    }

    const res = NextResponse.json(result, { status: 200 });
    if (isNew || !existingToken) {
      res.cookies.set({
        name: COOKIE_NAME,
        value: guestToken,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
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
