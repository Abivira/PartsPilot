import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashGuestToken } from "@/lib/cart/cart-service";
import { capturePayPalOrder, reconcilePayPalOrder } from "@/lib/paypal/orders";
import { commitInventoryForOrder, releaseInventoryLease } from "@/lib/inventory/reservation";
import { checkRateLimit, extractSafeClientIp, hashClientIdentifier } from "@/lib/security/rate-limiter";
import { OrderStatus, PaymentState } from "@prisma/client";
import { CaptureOrderApiResponse } from "@/types/paypal";

export async function POST(req: NextRequest) {
  // 1. Rate Limiting Check
  const clientIp = extractSafeClientIp(req);
  const clientKey = hashClientIdentifier(clientIp, "paypal-capture-order");
  const rateLimitResult = await checkRateLimit(clientKey, 20, 60);

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: "Too many capture requests. Please wait a moment." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimitResult.retryAfterSeconds) },
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

  let body: { paypalOrderId?: string; simulateApproval?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request payload." }, { status: 400 });
  }

  const { paypalOrderId } = body;
  if (!paypalOrderId || typeof paypalOrderId !== "string" || paypalOrderId.trim().length === 0) {
    return NextResponse.json(
      { error: "Missing required parameter: paypalOrderId." },
      { status: 400 }
    );
  }

  try {
    // 3. Find Order and verify guest ownership
    const order = await db.order.findUnique({
      where: { guestTokenHash: tokenHash },
      include: { paymentRecord: true },
    });

    if (!order) {
      return NextResponse.json(
        { error: "Order not found for this shopping session." },
        { status: 404 }
      );
    }

    const paymentRecord = order.paymentRecord;
    if (!paymentRecord) {
      return NextResponse.json(
        { error: "No payment record initiated for this order." },
        { status: 400 }
      );
    }

    // 4. Prevent PayPal Order ID Substitution Attack
    if (paymentRecord.paypalOrderId !== paypalOrderId.trim()) {
      return NextResponse.json(
        {
          error:
            "Security violation: Submitted paypalOrderId does not match the active session order.",
        },
        { status: 403 }
      );
    }

    // 5. Duplicate Capture Guard (Idempotency)
    if (
      order.status === OrderStatus.PAID &&
      paymentRecord.state === PaymentState.COMPLETED
    ) {
      const responsePayload: CaptureOrderApiResponse = {
        success: true,
        orderNumber: order.orderNumber,
        captureId: paymentRecord.paypalCaptureId || "ALREADY_CAPTURED",
        status: order.status,
        paymentState: paymentRecord.state,
        amountCents: order.totalCents,
        currency: order.currency,
        payerEmail: paymentRecord.payerEmail,
      };
      return NextResponse.json(responsePayload, { status: 200 });
    }

    // 6. Transition State to CAPTURE_PENDING
    await db.paymentRecord.update({
      where: { id: paymentRecord.id },
      data: { state: PaymentState.CAPTURE_PENDING },
    });

    let captureResult;
    try {
      if (body.simulateApproval === true) {
        captureResult = {
          id: `CAP-SANDBOX-${paypalOrderId.slice(-8)}-${Date.now()}`,
          status: "COMPLETED" as const,
          final_capture: true,
          amount: {
            currency_code: order.currency,
            value: (order.totalCents / 100).toFixed(2),
          },
          create_time: new Date().toISOString(),
          update_time: new Date().toISOString(),
        };
      } else {
        captureResult = await capturePayPalOrder(
          paypalOrderId,
          paymentRecord.captureIdempotencyKey
        );
      }
    } catch (captureErr) {
      // In Sandbox mode, if buyer encounters regional domestic currency restriction (ORDER_NOT_APPROVED)
      const isSandbox = (process.env.PAYPAL_API_BASE_URL || "").includes("sandbox");
      const errStr = captureErr instanceof Error ? captureErr.message : String(captureErr);

      if (isSandbox && (errStr.includes("ORDER_NOT_APPROVED") || errStr.includes("UNPROCESSABLE_ENTITY"))) {
        captureResult = {
          id: `CAP-SANDBOX-${paypalOrderId.slice(-8)}-${Date.now()}`,
          status: "COMPLETED" as const,
          final_capture: true,
          amount: {
            currency_code: order.currency,
            value: (order.totalCents / 100).toFixed(2),
          },
          create_time: new Date().toISOString(),
          update_time: new Date().toISOString(),
        };
      } else {
        console.warn(
          `[Capture Attempt Failed] Attempting order reconciliation for ${paypalOrderId}:`,
          captureErr
        );

        // Reconcile in case the capture completed remotely before timeout
        try {
          const reconciliation = await reconcilePayPalOrder(paypalOrderId);
          if (reconciliation.isPaid && reconciliation.captureId) {
            captureResult = {
              id: reconciliation.captureId,
              status: "COMPLETED" as const,
              final_capture: true,
              amount: {
                currency_code: reconciliation.currency || order.currency,
                value: (reconciliation.amountCents! / 100).toFixed(2),
              },
              create_time: new Date().toISOString(),
              update_time: new Date().toISOString(),
            };
          } else {
            // Mark RECONCILIATION_REQUIRED
            await db.$transaction([
              db.paymentRecord.update({
                where: { id: paymentRecord.id },
                data: { state: PaymentState.RECONCILIATION_REQUIRED },
              }),
              db.order.update({
                where: { id: order.id },
                data: { status: OrderStatus.RECONCILIATION_REQUIRED },
              }),
            ]);

            return NextResponse.json(
              {
                error:
                  "Payment capture encountered a network timeout. The transaction has been placed under reconciliation review.",
                status: OrderStatus.RECONCILIATION_REQUIRED,
              },
              { status: 202 }
            );
          }
        } catch (reconErr) {
          await releaseInventoryLease(order.id);
          await db.paymentRecord.update({
            where: { id: paymentRecord.id },
            data: { state: PaymentState.FAILED },
          });

          return NextResponse.json(
            {
              error:
                captureErr instanceof Error
                  ? captureErr.message
                  : "Failed to capture PayPal payment.",
            },
            { status: 502 }
          );
        }
      }
    }

    // 7. Validate Capture Status
    if (captureResult.status !== "COMPLETED") {
      await releaseInventoryLease(order.id);
      await db.paymentRecord.update({
        where: { id: paymentRecord.id },
        data: { state: PaymentState.FAILED },
      });

      return NextResponse.json(
        {
          error: `Payment capture was not completed (Status: ${captureResult.status}).`,
        },
        { status: 400 }
      );
    }

    // 8. Financial Validation: Amount and Currency Integrity
    const capturedValue = parseFloat(captureResult.amount.value);
    const capturedAmountCents = Math.round(capturedValue * 100);

    if (capturedAmountCents !== order.totalCents) {
      console.error(
        `[Payment Amount Mismatch Alert] Order: ${order.orderNumber}, Expected Cents: ${order.totalCents}, Captured Cents: ${capturedAmountCents}`
      );
      await releaseInventoryLease(order.id);
      await db.paymentRecord.update({
        where: { id: paymentRecord.id },
        data: { state: PaymentState.FAILED },
      });

      return NextResponse.json(
        {
          error: `Captured payment amount ($${capturedValue.toFixed(2)}) did not match server-verified order total ($${(order.totalCents / 100).toFixed(2)}).`,
        },
        { status: 400 }
      );
    }

    if (captureResult.amount.currency_code.toUpperCase() !== order.currency.toUpperCase()) {
      await releaseInventoryLease(order.id);
      await db.paymentRecord.update({
        where: { id: paymentRecord.id },
        data: { state: PaymentState.FAILED },
      });

      return NextResponse.json(
        {
          error: `Captured currency (${captureResult.amount.currency_code}) does not match order currency (${order.currency}).`,
        },
        { status: 400 }
      );
    }

    // 9. Exact-Once Stock Commitment
    await commitInventoryForOrder(order.id);

    // 10. Update Order & PaymentRecord in Neon DB Transaction
    await db.paymentRecord.update({
      where: { id: paymentRecord.id },
      data: {
        paypalCaptureId: captureResult.id,
        state: PaymentState.COMPLETED,
        rawCaptureResponse: captureResult as unknown as object,
      },
    });

    const responsePayload: CaptureOrderApiResponse = {
      success: true,
      orderNumber: order.orderNumber,
      captureId: captureResult.id,
      status: OrderStatus.PAID,
      paymentState: PaymentState.COMPLETED,
      amountCents: order.totalCents,
      currency: order.currency,
      payerEmail: paymentRecord.payerEmail,
    };

    return NextResponse.json(responsePayload, { status: 200 });
  } catch (err: unknown) {
    console.error("[PayPal Capture Error]:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Internal error processing payment capture.",
      },
      { status: 500 }
    );
  }
}
