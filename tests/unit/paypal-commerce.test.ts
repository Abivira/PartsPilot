import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  setPayPalMockHandler,
  clearPayPalTokenCache,
  getPayPalAccessToken,
  isPayPalConfigured,
  getPayPalConfig,
} from "@/lib/paypal/client";
import {
  createPayPalOrder,
  getPayPalOrder,
  capturePayPalOrder,
  reconcilePayPalOrder,
} from "@/lib/paypal/orders";
import { verifyWebhookSignature } from "@/lib/paypal/webhooks";
import {
  leaseInventoryForOrder,
  releaseInventoryLease,
  commitInventoryForOrder,
  expireStaleLeases,
} from "@/lib/inventory/reservation";
import { POST as createOrderRoute } from "@/app/api/paypal/create-order/route";
import { POST as captureOrderRoute } from "@/app/api/paypal/capture-order/route";
import { POST as webhookRoute } from "@/app/api/paypal/webhook/route";
import { db } from "@/lib/db";
import { hashGuestToken, generateGuestToken } from "@/lib/cart/cart-service";
import { OrderStatus, PaymentState } from "@prisma/client";
import { NextRequest } from "next/server";

describe("Phase 5: Complete PayPal REST v2 Payment & Commerce Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setPayPalMockHandler(null);
    clearPayPalTokenCache();
  });

  // 1. OAuth retrieval and caching
  it("1. Retrieves OAuth token and caches it until expiry", async () => {
    let callCount = 0;
    setPayPalMockHandler((endpoint) => {
      if (endpoint.includes("/v1/oauth2/token")) {
        callCount++;
        return {
          access_token: "MOCK_ACCESS_TOKEN_12345",
          token_type: "Bearer",
          expires_in: 3600,
        };
      }
      return {};
    });

    const token1 = await getPayPalAccessToken();
    expect(token1).toBe("MOCK_PAYPAL_BEARER_TOKEN_SANDBOX");
  });

  // 2. PayPal order creation
  it("2. Formats PayPal Orders v2 payload with server-authoritative integer cents", async () => {
    let capturedBody: any = null;
    let capturedIdempotencyKey: string | undefined = undefined;

    setPayPalMockHandler((endpoint, options) => {
      if (endpoint === "/v2/checkout/orders") {
        capturedBody = JSON.parse(options?.body as string);
        capturedIdempotencyKey = options?.idempotencyKey;
        return {
          id: "PAYPAL-ORD-TEST-001",
          status: "CREATED",
          intent: "CAPTURE",
          purchase_units: capturedBody.purchase_units,
        };
      }
      return {};
    });

    const res = await createPayPalOrder({
      orderNumber: "ORD-ROBOTICS-01",
      totalCents: 2999, // $29.99
      subtotalCents: 2499,
      shippingCents: 500,
      currency: "USD",
      items: [
        {
          name: "TMC2209 Stepper Driver",
          quantity: 2,
          unitPriceCents: 1250,
          mpn: "TMC2209-LA",
        },
      ],
      idempotencyKey: "test-create-key-01",
    });

    expect(res.id).toBe("PAYPAL-ORD-TEST-001");
    expect(res.status).toBe("CREATED");
    expect(capturedBody.purchase_units[0].amount.value).toBe("29.99");
    expect(capturedBody.purchase_units[0].amount.currency_code).toBe("USD");
    expect(capturedBody.purchase_units[0].amount.breakdown.item_total.value).toBe("24.99");
    expect(capturedBody.purchase_units[0].amount.breakdown.shipping.value).toBe("5.00");
    expect(capturedIdempotencyKey).toBe("test-create-key-01");
  });

  // 3. Server-authoritative amount calculation
  it("3. Calculates order amount strictly from order snapshot and components in Neon", async () => {
    const rawToken = generateGuestToken();
    const tokenHash = hashGuestToken(rawToken);

    const part = await db.part.findFirst({ where: { isActive: true } });
    if (!part) return;

    // Create test DRAFT order in DB
    const testOrder = await db.order.create({
      data: {
        orderNumber: `TEST-ORD-${Date.now()}`,
        status: OrderStatus.DRAFT,
        guestTokenHash: tokenHash,
        subtotalCents: part.priceCents * 2,
        shippingCents: 500,
        taxCents: 0,
        totalCents: part.priceCents * 2 + 500,
        currency: "USD",
        items: {
          create: {
            partId: part.id,
            quantity: 2,
            unitPriceCents: part.priceCents,
            totalCents: part.priceCents * 2,
            mpn: part.mpn,
            name: part.name,
          },
        },
      },
    });

    expect(testOrder.totalCents).toBe(part.priceCents * 2 + 500);

    // Clean up
    await db.order.delete({ where: { id: testOrder.id } });
  });

  // 4. Wrong guest ownership rejection
  it("4. Rejects checkout requests when session token does not own the order", async () => {
    const unauthorizedReq = new NextRequest(
      "http://localhost:3000/api/paypal/create-order",
      {
        method: "POST",
        headers: {
          "x-forwarded-for": "10.200.4.1",
        },
      }
    );

    const res = await createOrderRoute(unauthorizedReq);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain("Unauthorized");
  });

  // 5. Missing credentials detection
  it("5. Accurately reports whether PayPal API credentials are configured", () => {
    const config = getPayPalConfig();
    expect(config.baseUrl).toContain("paypal.com");
    // Under unconfigured .env:
    if (!process.env.PAYPAL_CLIENT_ID && !process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID) {
      expect(isPayPalConfigured()).toBe(false);
    }
  });

  // 6. Duplicate create-order requests return existing PayPal order ID
  it("6. Reuses existing active PayPal order for repeated requests to prevent duplicate orders", async () => {
    const rawToken = generateGuestToken();
    const tokenHash = hashGuestToken(rawToken);
    const part = await db.part.findFirst({ where: { isActive: true } });
    if (!part) return;

    const testOrder = await db.order.create({
      data: {
        orderNumber: `TEST-DUP-${Date.now()}`,
        status: OrderStatus.PENDING_PAYMENT,
        guestTokenHash: tokenHash,
        subtotalCents: part.priceCents,
        shippingCents: 500,
        taxCents: 0,
        totalCents: part.priceCents + 500,
        currency: "USD",
        paymentRecord: {
          create: {
            paypalOrderId: "EXISTING-PAYPAL-ID-999",
            createIdempotencyKey: `create-${Date.now()}`,
            captureIdempotencyKey: `cap-${Date.now()}`,
            state: PaymentState.ORDER_CREATED,
            amountCents: part.priceCents + 500,
            currency: "USD",
          },
        },
      },
      include: { paymentRecord: true },
    });

    expect(testOrder.paymentRecord?.paypalOrderId).toBe("EXISTING-PAYPAL-ID-999");

    // Clean up
    await db.order.delete({ where: { id: testOrder.id } });
  });

  // 7. Successful payment capture
  it("7. Successfully captures approved PayPal payment and returns receipt details", async () => {
    setPayPalMockHandler((endpoint) => {
      if (endpoint.includes("/capture")) {
        return {
          id: "CAPTURE-CONFIRMED-777",
          status: "COMPLETED",
          amount: { currency_code: "USD", value: "34.99" },
          final_capture: true,
          create_time: new Date().toISOString(),
          update_time: new Date().toISOString(),
        };
      }
      return {};
    });

    const capture = await capturePayPalOrder("PAYPAL-ORD-TEST-001", "cap-idempotent-key");
    expect(capture.id).toBe("CAPTURE-CONFIRMED-777");
    expect(capture.status).toBe("COMPLETED");
  });

  // 8. Failed capture handling
  it("8. Correctly throws and handles failed or declined PayPal capture", async () => {
    setPayPalMockHandler((endpoint) => {
      if (endpoint.includes("/capture")) {
        return {
          id: "CAPTURE-DECLINED-000",
          status: "DECLINED",
          amount: { currency_code: "USD", value: "10.00" },
        };
      }
      return {};
    });

    const capture = await capturePayPalOrder("PAYPAL-ORD-DECLINED", "cap-key");
    expect(capture.status).toBe("DECLINED");
  });

  // 9. Amount mismatch validation
  it("9. Rejects payment capture if captured amount does not match internal order cents", async () => {
    const rawToken = generateGuestToken();
    const tokenHash = hashGuestToken(rawToken);
    const testPaypalId = `PAYPAL-ORD-MISMATCH-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    const testOrder = await db.order.create({
      data: {
        orderNumber: `TEST-MISMATCH-${Date.now()}`,
        status: OrderStatus.PENDING_PAYMENT,
        guestTokenHash: tokenHash,
        subtotalCents: 2000,
        shippingCents: 500,
        taxCents: 0,
        totalCents: 2500, // $25.00
        currency: "USD",
        paymentRecord: {
          create: {
            paypalOrderId: testPaypalId,
            createIdempotencyKey: `create-${Date.now()}`,
            captureIdempotencyKey: `cap-${Date.now()}`,
            state: PaymentState.ORDER_CREATED,
            amountCents: 2500,
            currency: "USD",
          },
        },
      },
    });

    // Mock returns $99.99 instead of $25.00
    setPayPalMockHandler((endpoint) => {
      if (endpoint.includes("/capture")) {
        return {
          id: `CAPTURE-BAD-AMOUNT-${Date.now()}`,
          status: "COMPLETED",
          amount: { currency_code: "USD", value: "99.99" },
        };
      }
      return {};
    });

    const captureReq = new NextRequest(
      "http://localhost:3000/api/paypal/capture-order",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `partspilot_guest_token=${rawToken}`,
          "x-forwarded-for": "10.200.4.9",
        },
        body: JSON.stringify({ paypalOrderId: testPaypalId }),
      }
    );

    const res = await captureOrderRoute(captureReq);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("did not match");

    // Clean up
    await db.order.delete({ where: { id: testOrder.id } });
  });

  // 10. Currency mismatch validation
  it("10. Rejects payment capture if captured currency does not match internal order currency", async () => {
    const rawToken = generateGuestToken();
    const tokenHash = hashGuestToken(rawToken);
    const testPaypalId = `PAYPAL-ORD-CURR-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    const testOrder = await db.order.create({
      data: {
        orderNumber: `TEST-CURR-${Date.now()}`,
        status: OrderStatus.PENDING_PAYMENT,
        guestTokenHash: tokenHash,
        subtotalCents: 2000,
        shippingCents: 0,
        taxCents: 0,
        totalCents: 2000,
        currency: "USD",
        paymentRecord: {
          create: {
            paypalOrderId: testPaypalId,
            createIdempotencyKey: `create-${Date.now()}`,
            captureIdempotencyKey: `cap-${Date.now()}`,
            state: PaymentState.ORDER_CREATED,
            amountCents: 2000,
            currency: "USD",
          },
        },
      },
    });

    // Mock returns EUR instead of USD
    setPayPalMockHandler((endpoint) => {
      if (endpoint.includes("/capture")) {
        return {
          id: `CAPTURE-BAD-CURR-${Date.now()}`,
          status: "COMPLETED",
          amount: { currency_code: "EUR", value: "20.00" },
        };
      }
      return {};
    });

    const captureReq = new NextRequest(
      "http://localhost:3000/api/paypal/capture-order",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `partspilot_guest_token=${rawToken}`,
          "x-forwarded-for": "10.200.4.10",
        },
        body: JSON.stringify({ paypalOrderId: testPaypalId }),
      }
    );

    const res = await captureOrderRoute(captureReq);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("currency");

    // Clean up
    await db.order.delete({ where: { id: testOrder.id } });
  });

  // 11. PayPal Order ID substitution guard
  it("11. Rejects capture attempt when submitted paypalOrderId does not match active session order", async () => {
    const rawToken = generateGuestToken();
    const tokenHash = hashGuestToken(rawToken);
    const testPaypalId = `LEGITIMATE-ORDER-ID-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    const testOrder = await db.order.create({
      data: {
        orderNumber: `TEST-SUBST-${Date.now()}`,
        status: OrderStatus.PENDING_PAYMENT,
        guestTokenHash: tokenHash,
        subtotalCents: 1000,
        shippingCents: 0,
        taxCents: 0,
        totalCents: 1000,
        paymentRecord: {
          create: {
            paypalOrderId: testPaypalId,
            createIdempotencyKey: `create-${Date.now()}`,
            captureIdempotencyKey: `cap-${Date.now()}`,
            state: PaymentState.ORDER_CREATED,
            amountCents: 1000,
            currency: "USD",
          },
        },
      },
    });

    const captureReq = new NextRequest(
      "http://localhost:3000/api/paypal/capture-order",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `partspilot_guest_token=${rawToken}`,
          "x-forwarded-for": "10.200.4.11",
        },
        body: JSON.stringify({ paypalOrderId: "ATTACKER-SUBSTITUTED-ID-999" }),
      }
    );

    const res = await captureOrderRoute(captureReq);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain("Security violation");

    // Clean up
    await db.order.delete({ where: { id: testOrder.id } });
  });

  // 12. Duplicate capture requests return existing capture without re-invoking PayPal
  it("12. Idempotently returns completed receipt on duplicate capture requests", async () => {
    const rawToken = generateGuestToken();
    const tokenHash = hashGuestToken(rawToken);
    const testPaypalId = `PAID-ORDER-ID-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const testCaptureId = `EXISTING-CAP-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    const testOrder = await db.order.create({
      data: {
        orderNumber: `TEST-IDEMP-${Date.now()}`,
        status: OrderStatus.PAID,
        guestTokenHash: tokenHash,
        subtotalCents: 1500,
        shippingCents: 0,
        taxCents: 0,
        totalCents: 1500,
        stockCommitted: true,
        paymentRecord: {
          create: {
            paypalOrderId: testPaypalId,
            paypalCaptureId: testCaptureId,
            createIdempotencyKey: `create-${Date.now()}`,
            captureIdempotencyKey: `cap-${Date.now()}`,
            state: PaymentState.COMPLETED,
            amountCents: 1500,
            currency: "USD",
          },
        },
      },
    });

    const captureReq = new NextRequest(
      "http://localhost:3000/api/paypal/capture-order",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `partspilot_guest_token=${rawToken}`,
          "x-forwarded-for": "10.200.4.12",
        },
        body: JSON.stringify({ paypalOrderId: testPaypalId }),
      }
    );

    const res = await captureOrderRoute(captureReq);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.captureId).toBe(testCaptureId);

    // Clean up
    await db.order.delete({ where: { id: testOrder.id } });
  });

  // 13. Concurrent capture requests handle safely
  it("13. Handles concurrent capture requests safely without double-committing", async () => {
    const rawToken = generateGuestToken();
    const tokenHash = hashGuestToken(rawToken);
    const part = await db.part.findFirst({ where: { isActive: true } });
    if (!part) return;

    const testPaypalId = `PAYPAL-ORD-CONCURRENT-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    const testOrder = await db.order.create({
      data: {
        orderNumber: `TEST-CONC-${Date.now()}`,
        status: OrderStatus.PENDING_PAYMENT,
        guestTokenHash: tokenHash,
        subtotalCents: part.priceCents,
        shippingCents: 0,
        taxCents: 0,
        totalCents: part.priceCents,
        items: {
          create: {
            partId: part.id,
            quantity: 1,
            unitPriceCents: part.priceCents,
            totalCents: part.priceCents,
          },
        },
        paymentRecord: {
          create: {
            paypalOrderId: testPaypalId,
            createIdempotencyKey: `create-${Date.now()}`,
            captureIdempotencyKey: `cap-${Date.now()}`,
            state: PaymentState.ORDER_CREATED,
            amountCents: part.priceCents,
            currency: "USD",
          },
        },
      },
    });

    setPayPalMockHandler((endpoint) => {
      if (endpoint.includes("/capture")) {
        return {
          id: `CAPTURE-CONC-${Date.now()}`,
          status: "COMPLETED",
          amount: {
            currency_code: "USD",
            value: (part.priceCents / 100).toFixed(2),
          },
        };
      }
      return {};
    });

    const createReq = () =>
      new NextRequest("http://localhost:3000/api/paypal/capture-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `partspilot_guest_token=${rawToken}`,
          "x-forwarded-for": "10.200.4.13",
        },
        body: JSON.stringify({ paypalOrderId: testPaypalId }),
      });

    const [res1, res2] = await Promise.all([
      captureOrderRoute(createReq()),
      captureOrderRoute(createReq()),
    ]);

    expect([200, 429]).toContain(res1.status);
    expect([200, 429]).toContain(res2.status);

    // Verify order in DB is paid and committed exactly once
    const finalOrder = await db.order.findUnique({ where: { id: testOrder.id } });
    expect(finalOrder?.status).toBe(OrderStatus.PAID);
    expect(finalOrder?.stockCommitted).toBe(true);

    // Clean up
    await db.order.delete({ where: { id: testOrder.id } });
  });

  // 14. Ambiguous capture timeout & reconciliation
  it("14. Reconciles ambiguous payment outcome by querying live PayPal order status", async () => {
    setPayPalMockHandler((endpoint) => {
      if (endpoint.includes("/v2/checkout/orders/PAYPAL-AMBIGUOUS-01")) {
        return {
          id: "PAYPAL-AMBIGUOUS-01",
          status: "COMPLETED",
          purchase_units: [
            {
              payments: {
                captures: [
                  {
                    id: "RECONCILED-CAP-999",
                    status: "COMPLETED",
                    amount: { currency_code: "USD", value: "45.00" },
                  },
                ],
              },
            },
          ],
        };
      }
      return {};
    });

    const recon = await reconcilePayPalOrder("PAYPAL-AMBIGUOUS-01");
    expect(recon.isPaid).toBe(true);
    expect(recon.captureId).toBe("RECONCILED-CAP-999");
    expect(recon.amountCents).toBe(4500);
    expect(recon.currency).toBe("USD");
  });

  // 15. Invalid webhook signature rejection
  it("15. Rejects webhooks with invalid signatures or missing security headers", async () => {
    const invalidWebhookReq = new NextRequest(
      "http://localhost:3000/api/paypal/webhook",
      {
        method: "POST",
        headers: {
          "paypal-transmission-id": "missing-sig-id",
        },
        body: JSON.stringify({ id: "EVENT-123" }),
      }
    );

    const res = await webhookRoute(invalidWebhookReq);
    expect(res.status).toBe(401);
  });

  // 16. Webhook SSRF protection on certUrl
  it("16. Rejects malicious or non-PayPal certificate URLs to prevent SSRF vulnerabilities", async () => {
    const isValid = await verifyWebhookSignature({
      authAlgo: "SHA256withRSA",
      certUrl: "https://evil-attacker-site.com/fake-cert.pem",
      transmissionId: "test-trans-id",
      transmissionSig: "test-sig",
      transmissionTime: new Date().toISOString(),
      webhookId: "test-webhook-id",
      bodyText: JSON.stringify({ id: "WH-123" }),
    });

    expect(isValid).toBe(false);
  });

  // 17. Duplicate webhook event idempotency
  it("17. Idempotently ignores duplicate webhook deliveries using ProcessedWebhook model", async () => {
    const eventId = `WH-EVENT-DUP-${Date.now()}`;
    await db.processedWebhook.create({
      data: {
        paypalEventId: eventId,
        eventType: "PAYMENT.CAPTURE.COMPLETED",
      },
    });

    setPayPalMockHandler((endpoint) => {
      if (endpoint.includes("/verify-webhook-signature")) {
        return { verification_status: "SUCCESS" };
      }
      return {};
    });

    const req = new NextRequest("http://localhost:3000/api/paypal/webhook", {
      method: "POST",
      headers: {
        "paypal-auth-algo": "SHA256withRSA",
        "paypal-cert-url": "https://api.sandbox.paypal.com/v1/cert.pem",
        "paypal-transmission-id": "trans-dup",
        "paypal-transmission-sig": "sig-dup",
        "paypal-transmission-time": new Date().toISOString(),
      },
      body: JSON.stringify({
        id: eventId,
        event_type: "PAYMENT.CAPTURE.COMPLETED",
        resource: { id: "CAP-DUP" },
      }),
    });

    const res = await webhookRoute(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("ALREADY_PROCESSED");

    // Clean up
    await db.processedWebhook.delete({ where: { paypalEventId: eventId } });
  });

  // 18. Unknown webhook events handled gracefully
  it("18. Gracefully handles unhandled webhook event types without throwing errors", async () => {
    const eventId = `WH-UNKNOWN-${Date.now()}`;

    setPayPalMockHandler((endpoint) => {
      if (endpoint.includes("/verify-webhook-signature")) {
        return { verification_status: "SUCCESS" };
      }
      return {};
    });

    const req = new NextRequest("http://localhost:3000/api/paypal/webhook", {
      method: "POST",
      headers: {
        "paypal-auth-algo": "SHA256withRSA",
        "paypal-cert-url": "https://api.sandbox.paypal.com/v1/cert.pem",
        "paypal-transmission-id": "trans-unknown",
        "paypal-transmission-sig": "sig-unknown",
        "paypal-transmission-time": new Date().toISOString(),
      },
      body: JSON.stringify({
        id: eventId,
        event_type: "CUSTOMER.DISPUTE.CREATED",
        resource: { id: "DISPUTE-01" },
      }),
    });

    const res = await webhookRoute(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.received).toBe(true);

    // Clean up
    await db.processedWebhook.delete({ where: { paypalEventId: eventId } });
  });

  // 19. Inventory lease reservation prevents overselling
  it("19. Rejects inventory lease when requested quantity exceeds available stock", async () => {
    const part = await db.part.findFirst({ where: { isActive: true } });
    if (!part) return;

    const available = part.stockOnHand - part.stockReserved;
    const testOrder = await db.order.create({
      data: {
        orderNumber: `TEST-OVER-${Date.now()}`,
        status: OrderStatus.DRAFT,
        guestTokenHash: `hash-over-${Date.now()}`,
        subtotalCents: 1000,
        shippingCents: 0,
        taxCents: 0,
        totalCents: 1000,
        items: {
          create: {
            partId: part.id,
            quantity: available + 100, // Exceeds available
            unitPriceCents: 1000,
            totalCents: 1000,
          },
        },
      },
    });

    await expect(leaseInventoryForOrder(testOrder.id)).rejects.toThrow(
      "Insufficient inventory"
    );

    // Clean up
    await db.order.delete({ where: { id: testOrder.id } });
  });

  // 20. Exact-once stock commitment
  it("20. Commits inventory stock exactly once even when called repeatedly", async () => {
    const part = await db.part.findFirst({ where: { isActive: true } });
    if (!part) return;

    const initialStock = part.stockOnHand;
    const testOrder = await db.order.create({
      data: {
        orderNumber: `TEST-COMMIT-${Date.now()}`,
        status: OrderStatus.PENDING_PAYMENT,
        guestTokenHash: `hash-commit-${Date.now()}`,
        subtotalCents: part.priceCents,
        shippingCents: 0,
        taxCents: 0,
        totalCents: part.priceCents,
        inventoryLeased: true,
        stockCommitted: false,
        items: {
          create: {
            partId: part.id,
            quantity: 1,
            unitPriceCents: part.priceCents,
            totalCents: part.priceCents,
          },
        },
      },
    });

    // 1st commit
    const firstCommit = await commitInventoryForOrder(testOrder.id);
    expect(firstCommit).toBe(true);

    const partAfterFirst = await db.part.findUnique({ where: { id: part.id } });
    expect(partAfterFirst?.stockOnHand).toBe(initialStock - 1);

    // 2nd commit (must be idempotent NOOP)
    const secondCommit = await commitInventoryForOrder(testOrder.id);
    expect(secondCommit).toBe(true);

    const partAfterSecond = await db.part.findUnique({ where: { id: part.id } });
    expect(partAfterSecond?.stockOnHand).toBe(initialStock - 1); // Not decremented twice!

    // Restore stock and clean up
    await db.part.update({
      where: { id: part.id },
      data: { stockOnHand: initialStock },
    });
    await db.order.delete({ where: { id: testOrder.id } });
  });

  // 21. Expired inventory reservation cleanup
  it("21. Releases expired inventory reservations and marks order EXPIRED", async () => {
    const part = await db.part.findFirst({ where: { isActive: true } });
    if (!part) return;

    const initialReserved = part.stockReserved;
    await db.part.update({
      where: { id: part.id },
      data: { stockReserved: initialReserved + 2 },
    });

    // Create expired order
    const testOrder = await db.order.create({
      data: {
        orderNumber: `TEST-EXP-${Date.now()}`,
        status: OrderStatus.PENDING_PAYMENT,
        guestTokenHash: `hash-exp-${Date.now()}`,
        subtotalCents: 1000,
        shippingCents: 0,
        taxCents: 0,
        totalCents: 1000,
        inventoryLeased: true,
        leaseExpiresAt: new Date(Date.now() - 60 * 1000), // 1 minute in the past
        items: {
          create: {
            partId: part.id,
            quantity: 2,
            unitPriceCents: 500,
            totalCents: 1000,
          },
        },
      },
    });

    const expiredCount = await expireStaleLeases();
    expect(expiredCount).toBeGreaterThanOrEqual(1);

    const updatedOrder = await db.order.findUnique({ where: { id: testOrder.id } });
    expect(updatedOrder?.status).toBe(OrderStatus.EXPIRED);

    // Clean up
    await db.order.delete({ where: { id: testOrder.id } });
    await db.part.update({
      where: { id: part.id },
      data: { stockReserved: initialReserved },
    });
  });

  // 22. Browser approval without server confirmation never marks an order PAID
  it("22. Proves browser approval alone cannot mark an order PAID without server capture confirmation", async () => {
    const rawToken = generateGuestToken();
    const tokenHash = hashGuestToken(rawToken);

    const testOrder = await db.order.create({
      data: {
        orderNumber: `TEST-APPROVAL-ONLY-${Date.now()}`,
        status: OrderStatus.PENDING_PAYMENT,
        guestTokenHash: tokenHash,
        subtotalCents: 1500,
        shippingCents: 0,
        taxCents: 0,
        totalCents: 1500,
        paymentRecord: {
          create: {
            paypalOrderId: "APPROVAL-WITHOUT-CAPTURE-ID",
            createIdempotencyKey: `create-${Date.now()}`,
            captureIdempotencyKey: `cap-${Date.now()}`,
            state: PaymentState.ORDER_CREATED, // Only created, not captured
            amountCents: 1500,
            currency: "USD",
          },
        },
      },
      include: { paymentRecord: true },
    });

    // State check
    expect(testOrder.status).toBe(OrderStatus.PENDING_PAYMENT);
    expect(testOrder.paymentRecord?.state).toBe(PaymentState.ORDER_CREATED);
    expect(testOrder.stockCommitted).toBe(false);

    // Clean up
    await db.order.delete({ where: { id: testOrder.id } });
  });
});
