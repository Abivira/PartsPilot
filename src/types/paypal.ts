import { OrderStatus, PaymentState } from "@prisma/client";

export interface PayPalOAuthTokenResponse {
  scope: string;
  access_token: string;
  token_type: string;
  app_id: string;
  expires_in: number;
  nonce: string;
}

export interface PayPalOrderAmount {
  currency_code: string;
  value: string; // Decimal string e.g. "25.00"
  breakdown?: {
    item_total?: {
      currency_code: string;
      value: string;
    };
    shipping?: {
      currency_code: string;
      value: string;
    };
    tax_total?: {
      currency_code: string;
      value: string;
    };
  };
}

export interface PayPalOrderItem {
  name: string;
  unit_amount: {
    currency_code: string;
    value: string;
  };
  quantity: string;
  description?: string;
  sku?: string;
  category?: "PHYSICAL_GOODS" | "DIGITAL_GOODS";
}

export interface PayPalOrderRequest {
  intent: "CAPTURE" | "AUTHORIZE";
  purchase_units: Array<{
    reference_id?: string;
    custom_id?: string;
    description?: string;
    amount: PayPalOrderAmount;
    items?: PayPalOrderItem[];
  }>;
  application_context?: {
    brand_name?: string;
    landing_page?: "LOGIN" | "GUEST_CHECKOUT" | "NO_PREFERENCE";
    user_action?: "CONTINUE" | "PAY_NOW";
    shipping_preference?: "GET_FROM_FILE" | "NO_SHIPPING" | "SET_PROVIDED_ADDRESS";
    return_url?: string;
    cancel_url?: string;
  };
}

export interface PayPalOrderResponse {
  id: string;
  status:
    | "CREATED"
    | "SAVED"
    | "APPROVED"
    | "VOIDED"
    | "COMPLETED"
    | "PAYER_ACTION_REQUIRED";
  intent: string;
  purchase_units: Array<{
    reference_id?: string;
    custom_id?: string;
    amount: PayPalOrderAmount;
    payments?: {
      captures?: Array<{
        id: string;
        status: string;
        amount: PayPalOrderAmount;
        create_time?: string;
      }>;
    };
  }>;
  payer?: {
    name?: {
      given_name?: string;
      surname?: string;
    };
    email_address?: string;
    payer_id?: string;
  };
  create_time?: string;
  update_time?: string;
  links?: Array<{
    href: string;
    rel: string;
    method: string;
  }>;
}

export interface PayPalCaptureResponse {
  id: string; // Capture ID
  status: "COMPLETED" | "DECLINED" | "FAILED" | "PENDING";
  amount: {
    currency_code: string;
    value: string;
  };
  final_capture: boolean;
  seller_protection?: {
    status: string;
    dispute_categories?: string[];
  };
  seller_receivable_breakdown?: {
    gross_amount: {
      currency_code: string;
      value: string;
    };
    paypal_fee?: {
      currency_code: string;
      value: string;
    };
    net_amount?: {
      currency_code: string;
      value: string;
    };
  };
  create_time: string;
  update_time: string;
  links?: Array<{
    href: string;
    rel: string;
    method: string;
  }>;
}

export interface PayPalWebhookVerificationRequest {
  auth_algo: string;
  cert_url: string;
  transmission_id: string;
  transmission_sig: string;
  transmission_time: string;
  webhook_id: string;
  webhook_event: Record<string, unknown>;
}

export interface PayPalWebhookVerificationResponse {
  verification_status: "SUCCESS" | "FAILURE";
}

export interface PayPalWebhookEvent {
  id: string;
  event_version: string;
  create_time: string;
  resource_type: string;
  event_type:
    | "CHECKOUT.ORDER.APPROVED"
    | "PAYMENT.CAPTURE.COMPLETED"
    | "PAYMENT.CAPTURE.DENIED"
    | "PAYMENT.CAPTURE.REFUNDED"
    | string;
  summary: string;
  resource: {
    id: string;
    status?: string;
    amount?: {
      currency_code: string;
      value: string;
    };
    supplementary_data?: {
      related_ids?: {
        order_id?: string;
        capture_id?: string;
      };
    };
    custom_id?: string;
    [key: string]: unknown;
  };
}

// Internal API DTOs
export interface CreateOrderApiResponse {
  paypalOrderId: string;
  orderNumber: string;
  totalCents: number;
  currency: string;
  expiresAt?: string;
}

export interface CaptureOrderApiResponse {
  success: boolean;
  orderNumber: string;
  captureId: string;
  status: OrderStatus;
  paymentState: PaymentState;
  amountCents: number;
  currency: string;
  payerEmail?: string | null;
}
