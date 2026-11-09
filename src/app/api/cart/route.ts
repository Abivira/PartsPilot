import { NextRequest, NextResponse } from "next/server";
import { getOrCreateCart, clearCart } from "@/lib/cart/cart-service";

const COOKIE_NAME = "partspilot_guest_token";

export async function GET(req: NextRequest) {
  try {
    const existingToken = req.cookies.get(COOKIE_NAME)?.value;
    const { cart, guestToken, isNew } = await getOrCreateCart(existingToken);

    const res = NextResponse.json(cart, { status: 200 });

    if (isNew || !existingToken) {
      res.cookies.set({
        name: COOKIE_NAME,
        value: guestToken,
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 30 * 24 * 60 * 60, // 30 days
      });
    }

    return res;
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to load cart.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const existingToken = req.cookies.get(COOKIE_NAME)?.value;
    if (!existingToken) {
      return NextResponse.json({ error: "No active cart session." }, { status: 400 });
    }

    const updatedCart = await clearCart(existingToken);
    return NextResponse.json(updatedCart, { status: 200 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to clear cart.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
