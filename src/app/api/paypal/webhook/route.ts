import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyWebhookSignature } from "@/lib/paypal/webhooks";
import { commitInventoryForOrder, releaseInventoryLease } from "@/lib/inventory/reservation";
import { OrderStatus, PaymentState } from "@prisma/client";
import { PayPalWebhookEvent } from "@/types/paypal";

export async function POST(req: NextRequest) {
  const authAlgo = req.headers.get("paypal-auth-algo");
  const certUrl = req.headers.get("paypal-cert-url");
  const transmissionId = req.headers.get("paypal-transmission-id");
  const transmissionSig = req.headers.get("paypal-transmission-sig");
  const transmissionTime = req.headers.get("paypal-transmission-time");

  const bodyText = await req.text();

  if (!bodyText) {
    return NextResponse.json({ error: "Empty webhook payload." }, { status: 400 });
  }

  // 1. Verify Webhook Signature via PayPal REST API
  const isValid = await verifyWebhookSignature({
    authAlgo,
    certUrl,
    transmissionId,
    transmissionSig,
    transmissionTime,
    bodyText,
  });

  if (!isValid) {
    console.warn(
      `[PayPal Webhook] Signature verification failed for transmission ID: ${transmissionId}`
    );
    return NextResponse.json(
      { error: "Invalid webhook signature." },
      { status: 401 }
    );
  }

  let event: PayPalWebhookEvent;
  try {
    event = JSON.parse(bodyText);
  } catch {
    return NextResponse.json({ error: "Invalid JSON format." }, { status: 400 });
  }

  // 2. Idempotency Check: Prevent duplicate processing of the same PayPal event ID
  const existingEvent = await db.processedWebhook.findUnique({
    where: { paypalEventId: event.id },
  });

  if (existingEvent) {
    // Already processed successfully
    return NextResponse.json({ status: "ALREADY_PROCESSED" }, { status: 200 });
  }

  // Record this event ID immediately
  await db.processedWebhook.create({
    data: {
      paypalEventId: event.id,
      eventType: event.event_type,
    },
  });

  const resource = event.resource;
  const eventType = event.event_type;

  try {
    switch (eventType) {
      case "CHECKOUT.ORDER.APPROVED": {
        // Approval indicates buyer authorized payment; capture is still required
        const paypalOrderId = resource.id;
        console.log(`[PayPal Webhook] Order approved: ${paypalOrderId}. Awaiting capture.`);
        break;
      }

      case "PAYMENT.CAPTURE.COMPLETED": {
        const captureId = resource.id;
        const paypalOrderId =
          resource.supplementary_data?.related_ids?.order_id ||
          resource.custom_id;

        const capturedValue = resource.amount ? parseFloat(resource.amount.value) : 0;
        const capturedCents = Math.round(capturedValue * 100);
        const capturedCurrency = resource.amount?.currency_code || "USD";

        // Find matching payment record
        const paymentRecord = await db.paymentRecord.findFirst({
          where: {
            OR: [
              { paypalCaptureId: captureId },
              ...(paypalOrderId ? [{ paypalOrderId }] : []),
            ],
          },
          include: { order: true },
        });

        if (!paymentRecord) {
          console.warn(
            `[PayPal Webhook] Capture completed for untracked order (Capture: ${captureId}, Order: ${paypalOrderId})`
          );
          break;
        }

        // Amount & currency sanity check
        if (
          capturedCents !== paymentRecord.order.totalCents ||
          capturedCurrency.toUpperCase() !== paymentRecord.order.currency.toUpperCase()
        ) {
          console.error(
            `[Webhook Amount Alert] Order ${paymentRecord.order.orderNumber} expected ${paymentRecord.order.totalCents} ${paymentRecord.order.currency}, received ${capturedCents} ${capturedCurrency}`
          );
          await db.order.update({
            where: { id: paymentRecord.orderId },
            data: { status: OrderStatus.RECONCILIATION_REQUIRED },
          });
          break;
        }

        // Exact-Once Stock Commitment
        await commitInventoryForOrder(paymentRecord.orderId);

        // Update payment state
        await db.paymentRecord.update({
          where: { id: paymentRecord.id },
          data: {
            paypalCaptureId: captureId,
            state: PaymentState.COMPLETED,
            rawCaptureResponse: resource as unknown as object,
          },
        });

        console.log(
          `[PayPal Webhook] Order ${paymentRecord.order.orderNumber} successfully finalized via webhook.`
        );
        break;
      }

      case "PAYMENT.CAPTURE.DENIED":
      case "PAYMENT.CAPTURE.DECLINED": {
        const captureId = resource.id;
        const paypalOrderId =
          resource.supplementary_data?.related_ids?.order_id ||
          resource.custom_id;

        const paymentRecord = await db.paymentRecord.findFirst({
          where: {
            OR: [
              { paypalCaptureId: captureId },
              ...(paypalOrderId ? [{ paypalOrderId }] : []),
            ],
          },
        });

        if (paymentRecord) {
          await releaseInventoryLease(paymentRecord.orderId);
          await db.paymentRecord.update({
            where: { id: paymentRecord.id },
            data: { state: PaymentState.FAILED },
          });
          console.log(`[PayPal Webhook] Order payment failed / denied.`);
        }
        break;
      }

      case "PAYMENT.CAPTURE.REFUNDED": {
        console.log(`[PayPal Webhook] Capture refunded: ${resource.id}`);
        break;
      }

      default:
        console.log(`[PayPal Webhook] Received unhandled event: ${eventType}`);
        break;
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    console.error("[PayPal Webhook Handler Error]:", err);
    return NextResponse.json(
      { error: "Webhook event handling error." },
      { status: 500 }
    );
  }
}
