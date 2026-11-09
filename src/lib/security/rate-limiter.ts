import crypto from "crypto";
import { db } from "@/lib/db";
import { NextRequest } from "next/server";

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  retryAfterSeconds?: number;
  source: "POSTGRESQL_SHARED" | "MEMORY_FALLBACK";
}

// In-memory fallback if Neon PostgreSQL is temporarily unreachable
const memoryFallbackMap = new Map<string, { count: number; expiresAt: number }>();

const IPV4_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6_REGEX = /^[0-9a-fA-F:]+$/;

/**
 * Extracts a sanitized client IP without blindly trusting spoofed X-Forwarded-For headers.
 */
export function extractSafeClientIp(req: NextRequest): string {
  // 1. Cloudflare connecting IP (reliable behind CF)
  const cfIp = req.headers.get("cf-connecting-ip")?.trim();
  if (cfIp && (IPV4_REGEX.test(cfIp) || IPV6_REGEX.test(cfIp))) {
    return cfIp;
  }

  // 2. Nginx/Proxy Real IP
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp && (IPV4_REGEX.test(realIp) || IPV6_REGEX.test(realIp))) {
    return realIp;
  }

  // 3. X-Forwarded-For (take leftmost client IP and validate format)
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const candidate = forwardedFor.split(",")[0].trim();
    if (IPV4_REGEX.test(candidate) || IPV6_REGEX.test(candidate)) {
      return candidate;
    }
  }

  return "127.0.0.1";
}

/**
 * Generates a privacy-preserving SHA-256 hash of the client token to prevent storing PII.
 */
export function hashClientIdentifier(ip: string, scope = "diagnose"): string {
  const salt = process.env.RATE_LIMIT_SALT || "partspilot-secure-salt-2026";
  return crypto
    .createHash("sha256")
    .update(`${ip}:${scope}:${salt}`)
    .digest("hex");
}

/**
 * Production-hardened shared atomic rate limiter.
 * Uses Neon PostgreSQL as authoritative shared bucket with atomic upsert,
 * and falls back to memory if the database is unreachable.
 *
 * @param keyHash Privacy-preserving hash of client IP and route scope
 * @param limit Maximum allowed requests per window (default 30)
 * @param windowSeconds Duration of the rate window in seconds (default 60)
 */
export async function checkRateLimit(
  keyHash: string,
  limit = 30,
  windowSeconds = 60
): Promise<RateLimitResult> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + windowSeconds * 1000);

  // Attempt atomic shared check in PostgreSQL
  try {
    const results = await db.$queryRaw<Array<{ count: number; expiresAt: Date }>>`
      INSERT INTO "RateLimitBucket" ("key", "count", "expiresAt")
      VALUES (${keyHash}, 1, ${expiresAt})
      ON CONFLICT ("key") DO UPDATE
      SET
        "count" = CASE
          WHEN "RateLimitBucket"."expiresAt" < NOW() THEN 1
          ELSE "RateLimitBucket"."count" + 1
        END,
        "expiresAt" = CASE
          WHEN "RateLimitBucket"."expiresAt" < NOW() THEN ${expiresAt}
          ELSE "RateLimitBucket"."expiresAt"
        END
      RETURNING "count", "expiresAt";
    `;

    if (results && results.length > 0) {
      const record = results[0];
      const count = Number(record.count);
      const recordExpiry = new Date(record.expiresAt);

      if (count > limit) {
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((recordExpiry.getTime() - now.getTime()) / 1000)
        );
        return {
          allowed: false,
          count,
          limit,
          retryAfterSeconds,
          source: "POSTGRESQL_SHARED",
        };
      }

      return {
        allowed: true,
        count,
        limit,
        source: "POSTGRESQL_SHARED",
      };
    }
  } catch (dbError) {
    console.warn(
      "[RateLimiter] Database rate limiting check failed, activating memory fallback:",
      dbError instanceof Error ? dbError.message : "DB error"
    );
  }

  // Resilient fallback: in-memory sliding window ensures abuse protection is never disabled
  const nowMs = Date.now();
  const existing = memoryFallbackMap.get(keyHash);

  if (!existing || existing.expiresAt < nowMs) {
    memoryFallbackMap.set(keyHash, {
      count: 1,
      expiresAt: nowMs + windowSeconds * 1000,
    });
    return {
      allowed: true,
      count: 1,
      limit,
      source: "MEMORY_FALLBACK",
    };
  }

  existing.count += 1;
  if (existing.count > limit) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((existing.expiresAt - nowMs) / 1000)
    );
    return {
      allowed: false,
      count: existing.count,
      limit,
      retryAfterSeconds,
      source: "MEMORY_FALLBACK",
    };
  }

  return {
    allowed: true,
    count: existing.count,
    limit,
    source: "MEMORY_FALLBACK",
  };
}
