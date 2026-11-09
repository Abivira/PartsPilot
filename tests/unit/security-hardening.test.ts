import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/diagnose/route";
import { NextRequest } from "next/server";
import { validateImageSignature } from "@/lib/security/image-validator";
import {
  checkRateLimit,
  hashClientIdentifier,
  extractSafeClientIp,
} from "@/lib/security/rate-limiter";
import { matchCataloguePart } from "@/lib/catalog/db-matching";
import { evaluateCompatibility } from "@/lib/catalog/matcher";
import { ComponentCategory } from "@prisma/client";
import { db } from "@/lib/db";

// Mock @google/genai
const mockGenerateContent = vi.fn();

vi.mock("@google/genai", () => {
  return {
    GoogleGenAI: class MockGoogleGenAI {
      models = {
        generateContent: mockGenerateContent,
      };
    },
  };
});

describe("Phase 3.5: Production Security & Reliability Hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = "test-mock-api-key";
    process.env.GEMINI_MODEL = "gemini-2.5-flash";
  });

  // 1. Rate-limit enforcement
  it("1. Enforces rate limits and returns 429 with Retry-After header when exceeded", async () => {
    const testIp = `198.51.100.${Math.floor(Math.random() * 200 + 10)}`;
    const clientHash = hashClientIdentifier(testIp, `test-rate-limit-${Date.now()}`);

    // Exhaust limit (limit is 3 for this unit test)
    const res1 = await checkRateLimit(clientHash, 3, 60);
    expect(res1.allowed).toBe(true);

    const res2 = await checkRateLimit(clientHash, 3, 60);
    expect(res2.allowed).toBe(true);

    const res3 = await checkRateLimit(clientHash, 3, 60);
    expect(res3.allowed).toBe(true);

    // 4th request must be rejected
    const res4 = await checkRateLimit(clientHash, 3, 60);
    expect(res4.allowed).toBe(false);
    expect(res4.retryAfterSeconds).toBeGreaterThan(0);
  });

  // 2. Concurrent rate-limit requests
  it("2. Handles concurrent rate-limit requests atomically without race condition bypasses", async () => {
    const testIp = `198.51.100.${Math.floor(Math.random() * 200 + 10)}`;
    const clientHash = hashClientIdentifier(testIp, `test-concurrent-${Date.now()}`);
    const limit = 5;

    // Launch 10 simultaneous requests
    const promises = Array.from({ length: 10 }).map(() =>
      checkRateLimit(clientHash, limit, 60)
    );
    const results = await Promise.all(promises);

    const allowedCount = results.filter((r) => r.allowed).length;
    const blockedCount = results.filter((r) => !r.allowed).length;

    expect(allowedCount).toBeLessThanOrEqual(limit);
    expect(blockedCount).toBeGreaterThanOrEqual(5);
  });

  // 3. Invalid image signatures (magic bytes)
  it("3. Validates actual binary signatures: rejects text, scripts, or executables disguised as images", () => {
    // Fake JPEG: text content pretending to be JPEG
    const fakeJpeg = Buffer.from("<html><script>alert(1)</script></html>");
    const result1 = validateImageSignature(fakeJpeg);
    expect(result1.isValid).toBe(false);
    expect(result1.error).toContain("File header signature does not match");

    // Fake PNG: random binary bytes
    const fakePng = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]);
    const result2 = validateImageSignature(fakePng);
    expect(result2.isValid).toBe(false);

    // Real JPEG signature: FF D8 FF
    const realJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    const result3 = validateImageSignature(realJpeg);
    expect(result3.isValid).toBe(true);
    expect(result3.detectedMime).toBe("image/jpeg");

    // Real PNG signature: 89 50 4E 47 0D 0A 1A 0A
    const realPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const result4 = validateImageSignature(realPng);
    expect(result4.isValid).toBe(true);
    expect(result4.detectedMime).toBe("image/png");

    // Real WEBP signature: 'RIFF'....'WEBP'
    const realWebp = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ]);
    const result5 = validateImageSignature(realWebp);
    expect(result5.isValid).toBe(true);
    expect(result5.detectedMime).toBe("image/webp");
  });

  // 4. Oversized image uploads (>5 MB)
  it("4. Strictly rejects images exceeding 5 MB with 413 Payload Too Large", () => {
    const hugeBuffer = Buffer.alloc(5 * 1024 * 1024 + 1);
    const result = validateImageSignature(hugeBuffer);
    expect(result.isValid).toBe(false);
    expect(result.statusCode).toBe(413);
    expect(result.error).toContain("exceeds the 5 MB size limit");
  });

  // 5. Malformed multipart requests
  it("5. Rejects malformed requests safely without crashing or exposing stack traces", async () => {
    const req = new NextRequest("http://localhost:3000/api/diagnose", {
      method: "POST",
      headers: {
        "Content-Type": "multipart/form-data; boundary=invalid-boundary-never-closed",
      },
      body: "Corrupted binary data without multipart delimiters",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toContain("Malformed");
    expect(body.stack).toBeUndefined();
  });

  // 6. Neon database unavailable fallback
  it("6. Gracefully falls back to demonstration fixtures when Neon database is unavailable", async () => {
    const originalUrl = process.env.DATABASE_URL;
    try {
      // Intentionally break DATABASE_URL to simulate offline database
      process.env.DATABASE_URL = "";

      const match = await matchCataloguePart({
        mpn: "TMC2209-LA",
        category: ComponentCategory.MOTOR_DRIVER,
      });

      expect(match.dataSource).toBe("DEMO_FIXTURE");
      expect(match.matchedPart).not.toBeNull();
      expect(match.matchedPart?.isDemonstrationSample).toBe(true);
      expect(match.dbUnavailableNotice).toContain("Neon PostgreSQL database is currently unreachable");
    } finally {
      process.env.DATABASE_URL = originalUrl;
    }
  });

  // 7. CRITICAL: Fixture fallback never produces a live VERIFIED result
  it("7. CRITICAL SAFEGUARD: Offline fixture fallback can NEVER produce a live VERIFIED result", async () => {
    const validAiResponse = {
      category: "MOTOR_DRIVER",
      likelyMpn: "TMC2209-LA",
      confidence: 0.98,
      isUncertain: false,
      observedSpecs: {},
      inferredSpecs: {},
      unknownSpecs: [],
      visibleElectricalClues: [],
      communicationProtocolClues: ["STEP_DIR"],
      physicalDamage: { detected: false, type: "NONE", severity: "NONE", description: "None" },
      reasoning: "TMC2209 driver",
    };

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify(validAiResponse),
    });

    const originalUrl = process.env.DATABASE_URL;
    try {
      // Force database offline
      process.env.DATABASE_URL = "";

      const req = new NextRequest("http://localhost:3000/api/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userMpn: "TMC2209-LA",
          targetContext: {
            hostBoard: "Voron 2.4",
            supplyVoltageV: 24.0,
            logicVoltageV: 3.3,
            loadCurrentA: 1.2,
            requiredProtocols: ["STEP_DIR"],
          },
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.meta.dataSource).toBe("DEMO_FIXTURE");
      expect(body.meta.evaluationSource).toBe("DEMO_FIXTURE_UNVERIFIED");

      // CRITICAL ASSERTION: The tier MUST NOT be VERIFIED! It must be capped at POSSIBLE
      expect(body.compatibilityReport.tier).not.toBe("VERIFIED");
      expect(body.compatibilityReport.tier).toBe("POSSIBLE");
      expect(body.compatibilityReport.summary).toContain("OFFLINE DEMO FIXTURE");

      const provenanceCondition = body.compatibilityReport.conditions.find(
        (c: any) => c.name.includes("Database") || c.name.includes("Provenance")
      );
      expect(provenanceCondition?.status).toBe("UNKNOWN");
    } finally {
      process.env.DATABASE_URL = originalUrl;
    }
  });

  // 8. AI-inferred specifications never override authoritative catalogue data
  it("8. Inferred AI specs never replace authoritative catalogue specifications", async () => {
    // Suppose AI claims TMC2209 can continuously handle 5.0 Amps (hallucination)
    const hallucinatedAi = {
      category: "MOTOR_DRIVER",
      likelyMpn: "TMC2209-LA",
      confidence: 0.95,
      isUncertain: false,
      observedSpecs: {},
      inferredSpecs: { practicalContinuousCurrentA: 5.0 }, // Hallucinated high current
      unknownSpecs: [],
      visibleElectricalClues: [],
      communicationProtocolClues: ["STEP_DIR"],
      physicalDamage: { detected: false, type: "NONE", severity: "NONE", description: "None" },
    };

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify(hallucinatedAi),
    });

    // Test Voron requiring 2.5A (exceeds real TMC2209 1.4A passive limit)
    const req = new NextRequest("http://localhost:3000/api/diagnose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userMpn: "TMC2209-LA",
        targetContext: {
          loadCurrentA: 2.5, // Exceeds actual StepStick 1.4A continuous rating
          supplyVoltageV: 24.0,
        },
      }),
    });

    const res = await POST(req);
    const body = await res.json();

    // The authoritative catalogue limit (1.4A) must prevail over the hallucinated 5.0A!
    // Result must be UNVERIFIED / FAILED because 2.5A exceeds 1.4A
    expect(body.compatibilityReport.tier).toBe("UNVERIFIED");
    const currentCond = body.compatibilityReport.conditions.find((c: any) =>
      c.name.toLowerCase().includes("current")
    );
    expect(currentCond?.status).toBe("FAILED");
  });

  // 9. High AI confidence with failed compatibility
  it("9. 99% AI confidence must never override electrical voltage failure", async () => {
    const confidentAi = {
      category: "MICROCONTROLLER",
      likelyMpn: "ESP32-WROOM-32E-N4",
      confidence: 0.99,
      isUncertain: false,
      observedSpecs: { logicVoltageV: 3.3 },
      inferredSpecs: {},
      unknownSpecs: [],
      visibleElectricalClues: [],
      communicationProtocolClues: ["I2C"],
      physicalDamage: { detected: false, type: "NONE", severity: "NONE", description: "None" },
    };

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify(confidentAi),
    });

    // 5V Arduino Uno target into 3.3V ESP32
    const req = new NextRequest("http://localhost:3000/api/diagnose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userMpn: "ESP32-WROOM-32E-N4",
        targetContext: {
          hostBoard: "Arduino Uno R3",
          logicVoltageV: 5.0,
        },
      }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(body.aiExtraction.confidence).toBe(0.99);
    expect(body.compatibilityReport.tier).toBe("UNVERIFIED");
  });

  // 10. Physical damage overriding a potential match
  it("10. Physical damage immediately forces UNVERIFIED and 0.0 confidence score", async () => {
    const damagedSilicon = {
      category: "MOTOR_DRIVER",
      likelyMpn: "TMC2209-LA",
      confidence: 0.9,
      isUncertain: false,
      observedSpecs: {},
      inferredSpecs: {},
      unknownSpecs: [],
      visibleElectricalClues: [],
      communicationProtocolClues: ["STEP_DIR"],
      physicalDamage: {
        detected: true,
        type: "CRACKED_PACKAGE",
        severity: "CRITICAL",
        description: "Severely cracked epoxy casing exposing bare die.",
      },
    };

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify(damagedSilicon),
    });

    const req = new NextRequest("http://localhost:3000/api/diagnose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userMpn: "TMC2209-LA",
        targetContext: { supplyVoltageV: 24.0, logicVoltageV: 3.3 },
      }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(body.compatibilityReport.tier).toBe("UNVERIFIED");
    expect(body.compatibilityReport.confidenceScore).toBe(0.0);
    expect(body.compatibilityReport.summary).toContain("PHYSICAL DAMAGE DETECTED");
  });

  // 11. Gemini timeout and provider errors
  it("11. Returns HTTP 504 on timeout and HTTP 500 on provider crash", async () => {
    // Timeout
    mockGenerateContent.mockRejectedValueOnce(
      new Error("GEMINI_TIMEOUT: Gemini API request timed out after 25000ms.")
    );

    const timeoutReq = new NextRequest("http://localhost:3000/api/diagnose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userMpn: "TMC2209-LA" }),
    });

    const timeoutRes = await POST(timeoutReq);
    expect(timeoutRes.status).toBe(504);

    // Generic provider crash
    mockGenerateContent.mockRejectedValueOnce(
      new Error("Google RPC connection reset by peer")
    );

    const crashReq = new NextRequest("http://localhost:3000/api/diagnose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userMpn: "TMC2209-LA" }),
    });

    const crashRes = await POST(crashReq);
    expect(crashRes.status).toBe(500);
  });

  // 12. Missing Gemini API key returns HTTP 503
  it("12. Returns HTTP 503 Service Unavailable when GEMINI_API_KEY is not configured", async () => {
    const originalKey = process.env.GEMINI_API_KEY;
    try {
      process.env.GEMINI_API_KEY = "";

      const req = new NextRequest("http://localhost:3000/api/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMpn: "TMC2209-LA" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(503);

      const body = await res.json();
      expect(body.error).toContain("Gemini Multimodal AI service is currently unavailable");
    } finally {
      process.env.GEMINI_API_KEY = originalKey;
    }
  });

  // 13. Malformed Gemini structured output
  it("13. Handles malformed Gemini output gracefully via schema recovery", async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: "```json\n{\"category\": \"MOTOR_DRIVER\", \"likelyMpn\": \"TMC2209-LA\"}\n```",
    });

    const req = new NextRequest("http://localhost:3000/api/diagnose", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "10.200.1.13",
      },
      body: JSON.stringify({ userMpn: "TMC2209-LA" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.aiExtraction.likelyMpn).toBe("TMC2209-LA");
  });

  // 14. No API key or database credentials exposed in client responses
  it("14. Never leaks API keys, database connection strings, or filesystem paths in responses", async () => {
    mockGenerateContent.mockRejectedValueOnce(
      new Error(
        "DB error at C:\\Users\\secret\\app: connection to postgresql://admin:SuperSecretPassword123@neon.tech failed"
      )
    );

    const req = new NextRequest("http://localhost:3000/api/diagnose", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "10.200.1.14",
      },
      body: JSON.stringify({ userMpn: "TMC2209-LA" }),
    });

    const res = await POST(req);
    const body = await res.json();

    const responseString = JSON.stringify(body);
    expect(responseString).not.toContain("SuperSecretPassword123");
    expect(responseString).not.toContain("postgresql://");
    expect(responseString).not.toContain("C:\\Users\\secret");
    expect(responseString).toContain("[database-url]");
    expect(responseString).toContain("[internal-path]");
  });
});
