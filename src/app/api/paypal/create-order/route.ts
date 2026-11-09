import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashGuestToken } from "@/lib/cart/cart-service";
import { createPayPalOrder } from "@/lib/paypal/orders";
import { leaseInventoryForOrder } from "@/lib/inventory/reservation";
import { checkRateLimit, extractSafeClientIp, hashClientIdentifier } from "@/lib/security/rate-limiter";
import { OrderStatus, PaymentState } from "@prisma/client";
import { CreateOrderApiResponse } from "@/types/paypal";

export async function POST(req: NextRequest) {
  // 1. Rate Limiting Check
  const clientIp = extractSafeClientIp(req);
  const clientKey = hashClientIdentifier(clientIp, "paypal-create-order");
  const rateLimitResult = await checkRateLimit(clientKey, 20, 60);

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: "Too many checkout requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimitResult.retryAfterSeconds),
        },
      }
    );
  }

  // 2. Guest Authentication via HttpOnly Cookie
  const guestToken = req.cookies.get("partspilot_guest_token")?.value;

  if (!guestToken || guestToken.trim().length === 0) {
    return NextResponse.json(
      { error: "Unauthorized: No active guest shopping session found." },
      { status: 401 }
    );
  }

  const tokenHash = hashGuestToken(guestToken);

  try {
    // 3. Find User's Active Cart / Order
    const order = await db.order.findUnique({
      where: { guestTokenHash: tokenHash },
      include: {
        items: {
          include: { part: true },
        },
        paymentRecord: true,
      },
    });

    if (!order) {
      return NextResponse.json(
        { error: "No active checkout order found for this session." },
        { status: 404 }
      );
    }

    if (order.status === OrderStatus.PAID) {
      return NextResponse.json(
        { error: "Order is already paid and completed." },
        { status: 400 }
      );
    }

    if (order.items.length === 0) {
      return NextResponse.json(
        { error: "Cannot create checkout order for an empty cart." },
        { status: 400 }
      );
    }

    // 4. Validate Demonstration Sample Invariant
    for (const item of order.items) {
      if (item.part.isDemonstrationSample) {
        return NextResponse.json(
          {
            error: `Component ${item.part.mpn} is a demonstration fixture sample and cannot be purchased.`,
          },
          { status: 400 }
        );
      }
    }

    // 5. Apply Inventory Reservation Lease (15-minute lease window)
    const leaseResult = await leaseInventoryForOrder(order.id, 15);

    // 6. Check for Existing Uncaptured PayPal Order
    if (
      order.paymentRecord &&
      order.paymentRecord.paypalOrderId &&
      order.paymentRecord.state === PaymentState.ORDER_CREATED
    ) {
      const responsePayload: CreateOrderApiResponse = {
        paypalOrderId: order.paymentRecord.paypalOrderId,
        orderNumber: order.orderNumber,
        totalCents: order.totalCents,
        currency: order.currency,
        expiresAt: leaseResult.expiresAt.toISOString(),
      };
      return NextResponse.json(responsePayload, { status: 200 });
    }

    // 7. Stable Idempotency Key
    const createIdempotencyKey = `create-ord-${order.id}-${order.updatedAt.getTime()}`;
    const captureIdempotencyKey = `cap-ord-${order.id}-${Date.now()}`;

    // 8. Call PayPal REST API Orders v2
    const paypalOrder = await createPayPalOrder({
      orderNumber: order.orderNumber,
      totalCents: order.totalCents,
      subtotalCents: order.subtotalCents,
      shippingCents: order.shippingCents,
      currency: order.currency,
      items: order.items.map((i) => ({
        name: i.name || i.part.name,
        quantity: i.quantity,
        unitPriceCents: i.unitPriceCents,
        mpn: i.mpn || i.part.mpn,
      })),
      idempotencyKey: createIdempotencyKey,
    });

    if (!paypalOrder.id) {
      throw new Error("PayPal did not return a valid order ID.");
    }

    // 9. Upsert PaymentRecord in Neon DB
    await db.paymentRecord.upsert({
      where: { orderId: order.id },
      create: {
        orderId: order.id,
        paypalOrderId: paypalOrder.id,
        createIdempotencyKey,
        captureIdempotencyKey,
        state: PaymentState.ORDER_CREATED,
        amountCents: order.totalCents,
        currency: order.currency,
      },
      update: {
        paypalOrderId: paypalOrder.id,
        createIdempotencyKey,
        captureIdempotencyKey,
        state: PaymentState.ORDER_CREATED,
        amountCents: order.totalCents,
        currency: order.currency,
      },
    });

    const responsePayload: CreateOrderApiResponse = {
      paypalOrderId: paypalOrder.id,
      orderNumber: order.orderNumber,
      totalCents: order.totalCents,
      currency: order.currency,
      expiresAt: leaseResult.expiresAt.toISOString(),
    };

    return NextResponse.json(responsePayload, { status: 201 });
  } catch (err: unknown) {
    console.error("[PayPal Create Order Error]:", err);
    const errorMessage =
      err instanceof Error ? err.message : "Failed to initiate PayPal checkout order.";

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
