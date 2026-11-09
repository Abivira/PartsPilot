import { NextRequest, NextResponse } from "next/server";
import {
  getOrCreateCart,
  addItemToCart,
  updateCartItem,
  removeCartItem,
} from "@/lib/cart/cart-service";

const COOKIE_NAME = "partspilot_guest_token";

export async function POST(req: NextRequest) {
  try {
    const existingToken = req.cookies.get(COOKIE_NAME)?.value;
    const { guestToken, isNew } = await getOrCreateCart(existingToken);

    const body = await req.json();
    const { partId, quantity = 1 } = body;

    if (!partId || typeof partId !== "string") {
      return NextResponse.json({ error: "Missing or invalid partId parameter." }, { status: 400 });
    }

    const updatedCart = await addItemToCart(guestToken, partId, quantity);

    const res = NextResponse.json(updatedCart, { status: 200 });
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
    const msg = error instanceof Error ? error.message : "Failed to add item to cart.";
    const status = msg.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const existingToken = req.cookies.get(COOKIE_NAME)?.value;
    if (!existingToken) {
      return NextResponse.json({ error: "No active cart session found." }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const itemId =
      body.itemId ||
      body.orderItemId ||
      req.nextUrl.searchParams.get("itemId") ||
      req.nextUrl.searchParams.get("orderItemId");
    const quantity = body.quantity;

    if (!itemId || typeof itemId !== "string") {
      return NextResponse.json({ error: "Missing or invalid itemId parameter." }, { status: 400 });
    }
    if (typeof quantity !== "number") {
      return NextResponse.json({ error: "Quantity must be a valid number." }, { status: 400 });
    }

    const updatedCart = await updateCartItem(existingToken, itemId, quantity);
    return NextResponse.json(updatedCart, { status: 200 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to update cart item.";
    const status = msg.includes("exceeds") || msg.includes("invalid") ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const existingToken = req.cookies.get(COOKIE_NAME)?.value;
    if (!existingToken) {
      return NextResponse.json({ error: "No active cart session found." }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const itemId =
      body.itemId ||
      body.orderItemId ||
      req.nextUrl.searchParams.get("itemId") ||
      req.nextUrl.searchParams.get("orderItemId");

    if (!itemId || typeof itemId !== "string") {
      return NextResponse.json({ error: "Missing or invalid itemId parameter." }, { status: 400 });
    }

    const updatedCart = await removeCartItem(existingToken, itemId);
    return NextResponse.json(updatedCart, { status: 200 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to remove cart item.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
