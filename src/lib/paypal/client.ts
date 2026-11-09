import { PayPalOAuthTokenResponse } from "@/types/paypal";

export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  webhookId?: string;
}

// In-memory token cache
interface CachedToken {
  accessToken: string;
  expiresAt: number; // Unix timestamp in ms
}

let tokenCache: CachedToken | null = null;

// Mock handler for unit testing and local development simulation
export type MockPayPalHandler = (
  endpoint: string,
  options?: RequestInit & { idempotencyKey?: string }
) => Promise<unknown> | unknown;

let mockHandler: MockPayPalHandler | null = null;

export function setPayPalMockHandler(handler: MockPayPalHandler | null): void {
  mockHandler = handler;
}

export function clearPayPalTokenCache(): void {
  tokenCache = null;
}

export function getPayPalConfig(): PayPalConfig {
  const clientId =
    process.env.PAYPAL_CLIENT_ID || process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || "";
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET || "";
  const baseUrl =
    process.env.PAYPAL_API_BASE_URL || "https://api-m.sandbox.paypal.com";
  const webhookId = process.env.PAYPAL_WEBHOOK_ID || "";

  return {
    clientId: clientId.trim(),
    clientSecret: clientSecret.trim(),
    baseUrl: baseUrl.trim().replace(/\/+$/, ""),
    webhookId: webhookId.trim(),
  };
}

export function isPayPalConfigured(): boolean {
  const { clientId, clientSecret } = getPayPalConfig();
  return clientId.length > 0 && clientSecret.length > 0;
}

/**
 * Retrieves a valid OAuth2 Bearer token from PayPal Orders v2 API.
 * Uses cached token until 60 seconds before expiration.
 */
export async function getPayPalAccessToken(): Promise<string> {
  // If mock handler is set, return mock token
  if (mockHandler) {
    return "MOCK_PAYPAL_BEARER_TOKEN_SANDBOX";
  }

  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60 * 1000) {
    return tokenCache.accessToken;
  }

  const { clientId, clientSecret, baseUrl } = getPayPalConfig();

  if (!clientId || !clientSecret) {
    throw new Error(
      "PayPal API credentials missing. Please set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env."
    );
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: "grant_type=client_credentials",
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`PayPal OAuth token request failed (${res.status}): ${errText}`);
    }

    const data: PayPalOAuthTokenResponse = await res.json();
    tokenCache = {
      accessToken: data.access_token,
      expiresAt: now + data.expires_in * 1000,
    };

    return tokenCache.accessToken;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("PayPal OAuth token request timed out after 10000ms.");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Executes an authenticated HTTP request to PayPal REST API Orders v2.
 */
export async function paypalRequest<T>(
  endpoint: string,
  options: RequestInit & { idempotencyKey?: string } = {}
): Promise<T> {
  if (mockHandler) {
    const mockResult = await mockHandler(endpoint, options);
    return mockResult as T;
  }

  const { baseUrl } = getPayPalConfig();
  const accessToken = await getPayPalAccessToken();

  const url = endpoint.startsWith("http") ? endpoint : `${baseUrl}${endpoint}`;
  const headers = new Headers(options.headers || {});

  headers.set("Authorization", `Bearer ${accessToken}`);
  headers.set("Content-Type", "application/json");
  headers.set("Accept", "application/json");

  if (options.idempotencyKey) {
    headers.set("PayPal-Request-Id", options.idempotencyKey);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });

    const responseText = await res.text();
    let responseData: unknown = null;

    try {
      responseData = responseText ? JSON.parse(responseText) : null;
    } catch {
      responseData = responseText;
    }

    if (!res.ok) {
      const errorDetail =
        typeof responseData === "object" && responseData !== null
          ? JSON.stringify(responseData)
          : responseText;
      throw new Error(`PayPal API error (${res.status} ${res.statusText}): ${errorDetail}`);
    }

    return responseData as T;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`PayPal request to ${endpoint} timed out after 15000ms.`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
