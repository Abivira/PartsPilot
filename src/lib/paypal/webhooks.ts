import { paypalRequest, getPayPalConfig } from "./client";
import {
  PayPalWebhookVerificationRequest,
  PayPalWebhookVerificationResponse,
} from "@/types/paypal";

export interface WebhookVerificationParams {
  authAlgo: string | null;
  certUrl: string | null;
  transmissionId: string | null;
  transmissionSig: string | null;
  transmissionTime: string | null;
  webhookId?: string;
  bodyText: string;
}

/**
 * Validates whether the certUrl belongs to PayPal's official domain to prevent SSRF.
 */
function isValidPayPalCertUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return (
      parsed.hostname === "api.sandbox.paypal.com" ||
      parsed.hostname === "api.paypal.com" ||
      parsed.hostname === "api-m.sandbox.paypal.com" ||
      parsed.hostname === "api-m.paypal.com" ||
      parsed.hostname.endsWith(".paypal.com")
    );
  } catch {
    return false;
  }
}

/**
 * Verifies a PayPal webhook signature using PayPal's official endpoint.
 */
export async function verifyWebhookSignature(
  params: WebhookVerificationParams
): Promise<boolean> {
  const {
    authAlgo,
    certUrl,
    transmissionId,
    transmissionSig,
    transmissionTime,
    bodyText,
  } = params;

  if (
    !authAlgo ||
    !certUrl ||
    !transmissionId ||
    !transmissionSig ||
    !transmissionTime ||
    !bodyText
  ) {
    return false;
  }

  // Prevent SSRF via cert_url validation
  if (!isValidPayPalCertUrl(certUrl)) {
    console.warn(`[PayPal Webhook] Untrusted cert URL rejected: ${certUrl}`);
    return false;
  }

  const { webhookId: configWebhookId } = getPayPalConfig();
  const effectiveWebhookId =
    params.webhookId ||
    configWebhookId ||
    (process.env.NODE_ENV === "test" ? "TEST_WEBHOOK_ID" : "");

  if (!effectiveWebhookId) {
    console.warn(
      "[PayPal Webhook] PAYPAL_WEBHOOK_ID is not configured. Webhook signature cannot be verified."
    );
    return false;
  }

  let webhookEvent: Record<string, unknown>;
  try {
    webhookEvent = JSON.parse(bodyText);
  } catch {
    return false;
  }

  const payload: PayPalWebhookVerificationRequest = {
    auth_algo: authAlgo,
    cert_url: certUrl,
    transmission_id: transmissionId,
    transmission_sig: transmissionSig,
    transmission_time: transmissionTime,
    webhook_id: effectiveWebhookId,
    webhook_event: webhookEvent,
  };

  try {
    const verification = await paypalRequest<PayPalWebhookVerificationResponse>(
      "/v1/notifications/verify-webhook-signature",
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    );

    return verification.verification_status === "SUCCESS";
  } catch (err) {
    console.warn("[PayPal Webhook] Verification request failed:", err);
    return false;
  }
}
