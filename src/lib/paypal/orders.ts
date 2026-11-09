import { paypalRequest } from "./client";
import {
  PayPalOrderRequest,
  PayPalOrderResponse,
  PayPalCaptureResponse,
} from "@/types/paypal";

export interface CreateOrderParams {
  orderNumber: string;
  totalCents: number;
  subtotalCents: number;
  shippingCents: number;
  currency?: string;
  items?: Array<{
    name: string;
    quantity: number;
    unitPriceCents: number;
    mpn?: string | null;
  }>;
  idempotencyKey: string;
}

/**
 * Creates an order in PayPal Orders v2 with server-authoritative integer cents.
 */
export async function createPayPalOrder(
  params: CreateOrderParams
): Promise<PayPalOrderResponse> {
  const {
    orderNumber,
    totalCents,
    subtotalCents,
    shippingCents,
    currency = "USD",
    items = [],
    idempotencyKey,
  } = params;

  const totalValue = (totalCents / 100).toFixed(2);
  const subtotalValue = (subtotalCents / 100).toFixed(2);
  const shippingValue = (shippingCents / 100).toFixed(2);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const payload: PayPalOrderRequest = {
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: orderNumber,
        custom_id: orderNumber,
        description: `PartsPilot Robotics Hardware Order: ${orderNumber}`,
        amount: {
          currency_code: currency,
          value: totalValue,
          breakdown: {
            item_total: {
              currency_code: currency,
              value: subtotalValue,
            },
            shipping: {
              currency_code: currency,
              value: shippingValue,
            },
          },
        },
        items: items.map((i) => ({
          name: i.mpn ? `[${i.mpn}] ${i.name}`.slice(0, 127) : i.name.slice(0, 127),
          quantity: String(i.quantity),
          unit_amount: {
            currency_code: currency,
            value: (i.unitPriceCents / 100).toFixed(2),
          },
          category: "PHYSICAL_GOODS",
        })),
      },
    ],
    application_context: {
      brand_name: "PartsPilot Robotics",
      landing_page: "NO_PREFERENCE",
      user_action: "PAY_NOW",
      shipping_preference: "GET_FROM_FILE",
      return_url: `${appUrl}/`,
      cancel_url: `${appUrl}/`,
    },
  };

  return await paypalRequest<PayPalOrderResponse>("/v2/checkout/orders", {
    method: "POST",
    body: JSON.stringify(payload),
    idempotencyKey,
  });
}

/**
 * Retrieves the live status and details of a PayPal order.
 */
export async function getPayPalOrder(
  paypalOrderId: string
): Promise<PayPalOrderResponse> {
  if (!paypalOrderId || paypalOrderId.trim().length === 0) {
    throw new Error("paypalOrderId is required to query PayPal order details.");
  }

  return await paypalRequest<PayPalOrderResponse>(
    `/v2/checkout/orders/${encodeURIComponent(paypalOrderId.trim())}`,
    {
      method: "GET",
    }
  );
}

/**
 * Captures an approved PayPal order.
 */
export async function capturePayPalOrder(
  paypalOrderId: string,
  idempotencyKey: string
): Promise<PayPalCaptureResponse> {
  if (!paypalOrderId || paypalOrderId.trim().length === 0) {
    throw new Error("paypalOrderId is required to capture payment.");
  }

  const response = await paypalRequest<Record<string, unknown>>(
    `/v2/checkout/orders/${encodeURIComponent(paypalOrderId.trim())}/capture`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      idempotencyKey,
    }
  );

  // In PayPal Orders v2, the capture object can be returned directly or nested under purchase_units[0].payments.captures[0]
  if (response.status && response.id && response.amount) {
    return response as unknown as PayPalCaptureResponse;
  }

  const purchaseUnits = response.purchase_units as Array<{
    payments?: {
      captures?: PayPalCaptureResponse[];
    };
  }>;

  const capture = purchaseUnits?.[0]?.payments?.captures?.[0];
  if (capture) {
    return capture;
  }

  throw new Error(
    `Unexpected PayPal capture response structure: ${JSON.stringify(response)}`
  );
}

/**
 * Reconciles an ambiguous payment state by querying PayPal order details.
 */
export async function reconcilePayPalOrder(
  paypalOrderId: string
): Promise<{
  isPaid: boolean;
  status: string;
  captureId?: string;
  amountCents?: number;
  currency?: string;
}> {
  const order = await getPayPalOrder(paypalOrderId);
  const captures = order.purchase_units?.[0]?.payments?.captures || [];
  const successfulCapture = captures.find((c) => c.status === "COMPLETED");

  if (successfulCapture) {
    const val = parseFloat(successfulCapture.amount.value);
    const amountCents = Math.round(val * 100);
    return {
      isPaid: true,
      status: "COMPLETED",
      captureId: successfulCapture.id,
      amountCents,
      currency: successfulCapture.amount.currency_code,
    };
  }

  return {
    isPaid: order.status === "COMPLETED",
    status: order.status,
  };
}
